# _stage_collect.py — PHASE 1: Collect data, build leak-free train/val/test arrays.
# Runs as a SEPARATE PROCESS from trainer.py. All memory freed when this exits.
#
# What changed vs the old pipeline (the causes of the F1 collapse):
#   1. Features are scale-free and STANDARDIZED — scalers are fit on the TRAIN
#      split only, saved to saved_models/, and reused by autopilot + serve.
#      (Previously models trained on raw prices: BTC $100k next to DOGE $0.2.)
#   2. Per-symbol temporal 70/15/15 splits with purge gaps — every symbol
#      contributes to train AND val AND test. (Previously "val" was just the
#      last symbol in the concatenation order: DOGE.)
#   3. Sequences and rolling stats never cross symbol boundaries.
#   4. Historical fear&greed / macro / funding series — no current-value
#      broadcasts, no future leakage.
#
# Outputs (data/prep/):
#   {lstm,trans,xgb,kan}_{train,val,test}_{X,y}.npy
# Artifacts (saved_models/):
#   scaler_{lstm,transformer,xgb,kan}.pkl, xgb_feature_names.pkl

import sys, os, gc, json, logging
import numpy as np
import joblib
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
log = logging.getLogger(__name__)

from sklearn.preprocessing import StandardScaler
from config import (
    SYMBOLS, LOOKBACK_DAYS_1H, LOOKBACK_DAYS_4H,
    LSTM_SEQ_LEN, TRANS_SEQ_LEN,
    LSTM_FEATURES, TRANSFORMER_FEATURES, KAN_FEATURES,
    TRAIN_FRACTION, VAL_FRACTION, LABEL_FORWARD_CANDLES,
    PREP_DIR, MODEL_DIR, DATA_DIR,
)
from data_sources.market_regime import build_full_macro_df
from feature_engineering.pipeline import (
    fetch_btc_context, build_symbol_frames,
    temporal_split_indices, make_sequences,
)
from feature_engineering.xgb_features import build_xgb_features
from utils.db import init_db

PURGE_4H = LABEL_FORWARD_CANDLES          # 6 × 4h = 24h purge at split edges
# 1h labels inherit their 4h window's label, which depends on prices through
# window_start + (1+FORWARD)*4h — up to 27 rows past the first 1h candle of a
# window. +4 margin keeps every forward window inside its own split.
PURGE_1H = LABEL_FORWARD_CANDLES * 4 + 4
# The LSTM frame must NOT be trimmed to a different wall-clock span than the
# 4h frame. This constant used to be a hard 8760 (~365d) "memory bound" — a
# second, hidden copy of the old LOOKBACK_DAYS_1H cap. When the lookback was
# raised to 730d (2026-08-08) this line silently threw the first year straight
# back out: the collect log printed the full frame's row count while the
# LSTM's arrays were built from .tail(8760), so its val window sat at ~[108,54]
# days ago against the 4h models' ~[215,108] and the ensemble aligner found 30
# overlapping val rows out of 6410 — an unmeasurable weight, again. Deriving
# the cap from the configured lookback keeps the two from ever diverging;
# the +48 keeps the split's first sequences from losing history at the edge.
MAX_1H_ROWS_LSTM = LOOKBACK_DAYS_1H * 24 + 48


def _clean(a: np.ndarray) -> np.ndarray:
    return np.nan_to_num(a.astype(np.float32), nan=0.0, posinf=0.0, neginf=0.0)


def main():
    log.info("=" * 60)
    log.info("  PHASE 1: Data Collection & Preparation (leak-free)")
    log.info("=" * 60)

    init_db()
    os.makedirs(PREP_DIR, exist_ok=True)
    os.makedirs(MODEL_DIR, exist_ok=True)

    log.info("[1/4] Fetching macro data (FRED + Fear&Greed + DXY + SP500)...")
    try:
        macro_df = build_full_macro_df()
        log.info(f"  Macro data: {len(macro_df)} rows")
    except Exception as e:
        log.warning(f"  Macro fetch failed: {e}. Using empty.")
        import pandas as pd
        macro_df = pd.DataFrame()

    log.info("[2/4] Fetching BTC market context...")
    btc_ctx = fetch_btc_context(days_1h=LOOKBACK_DAYS_1H, days_4h=LOOKBACK_DAYS_4H)

    log.info("[3/4] Collecting per-symbol data...")
    per_symbol = []
    xgb_names = None

    for symbol in SYMBOLS:
        log.info(f"  ── {symbol} ──")
        frames = build_symbol_frames(symbol, macro_df, btc_ctx,
                                     days_1h=LOOKBACK_DAYS_1H,
                                     days_4h=LOOKBACK_DAYS_4H,
                                     with_labels=True)
        if frames is None:
            log.warning(f"  [{symbol}] no data, skipping")
            continue
        df_1h, df_4h = frames["df_1h"], frames["df_4h"]

        # XGBoost features from FULL frames (needs 1h+4h context)
        xmat, names = build_xgb_features(df_1h, df_4h)
        if xgb_names is None:
            xgb_names = names

        # LSTM uses most recent window of 1h data (memory bound)
        df_1h_l = df_1h.tail(MAX_1H_ROWS_LSTM).reset_index(drop=True)

        entry = {
            "symbol": symbol,
            "arr_l":  _clean(df_1h_l[LSTM_FEATURES].values),
            "lbl_l":  df_1h_l["label"].values.astype(np.int64),
            "ts_l":   df_1h_l["timestamp"].values.astype(np.int64),
            "arr_t":  _clean(df_4h[TRANSFORMER_FEATURES].values),
            "arr_k":  _clean(df_4h[KAN_FEATURES].values),
            "xmat":   _clean(xmat),
            "lbl_4":  df_4h["label"].values.astype(np.int64),
            "ts_4":   df_4h["timestamp"].values.astype(np.int64),
            # Current-regime class at t (persistence baseline for evaluation)
            "state_4": df_4h["state_now"].values.astype(np.int64),
        }
        entry["split_1h"] = temporal_split_indices(len(entry["arr_l"]),
                                                   TRAIN_FRACTION, VAL_FRACTION, PURGE_1H)
        entry["split_4h"] = temporal_split_indices(len(entry["arr_t"]),
                                                   TRAIN_FRACTION, VAL_FRACTION, PURGE_4H)
        per_symbol.append(entry)

        dist = np.bincount(entry["lbl_4"], minlength=3) / max(len(entry["lbl_4"]), 1)
        log.info(f"  [{symbol}] 1h={len(df_1h)} 4h={len(df_4h)} "
                 f"labels BUY={dist[0]:.0%} HOLD={dist[1]:.0%} SELL={dist[2]:.0%}")
        del frames, df_1h, df_4h, df_1h_l, xmat
        gc.collect()

    if not per_symbol:
        log.error("No data collected! Check API keys and network.")
        sys.exit(1)

    log.info(f"  Collected {len(per_symbol)}/{len(SYMBOLS)} symbols")

    # ── [4/4] Fit scalers on TRAIN rows only, transform, build arrays ────────
    log.info("[4/4] Fitting scalers (train rows only) and building arrays...")

    def _fit_scaler(key_arr: str, key_split: str, name: str) -> StandardScaler:
        rows = [e[key_arr][:e[key_split][0]] for e in per_symbol]
        sc = StandardScaler().fit(np.concatenate(rows))
        joblib.dump(sc, os.path.join(MODEL_DIR, f"scaler_{name}.pkl"))
        log.info(f"  scaler_{name}: fit on {sum(len(r) for r in rows)} train rows, "
                 f"{sc.n_features_in_} features")
        return sc

    sc_l = _fit_scaler("arr_l", "split_1h", "lstm")
    sc_t = _fit_scaler("arr_t", "split_4h", "transformer")
    sc_x = _fit_scaler("xmat",  "split_4h", "xgb")
    sc_k = _fit_scaler("arr_k", "split_4h", "kan")

    joblib.dump(xgb_names, os.path.join(MODEL_DIR, "xgb_feature_names.pkl"))
    joblib.dump([e["symbol"] for e in per_symbol],
                os.path.join(PREP_DIR, "symbol_order.pkl"))
    with open(os.path.join(PREP_DIR, "xgb_feature_names.json"), "w") as f:
        json.dump(xgb_names, f)

    def _save(prefix, split, X, y, meta=None):
        np.save(os.path.join(PREP_DIR, f"{prefix}_{split}_X.npy"), X)
        np.save(os.path.join(PREP_DIR, f"{prefix}_{split}_y.npy"), y)
        if meta is not None:
            # meta: (n, 2) int64 — [timestamp_ms, symbol_index] per row, used
            # by _stage_eval_ensemble.py to align model predictions
            np.save(os.path.join(PREP_DIR, f"{prefix}_{split}_meta.npy"), meta)
        dist = np.bincount(y, minlength=3)
        log.info(f"  {prefix}_{split}: X={X.shape}  y: BUY={dist[0]} HOLD={dist[1]} SELL={dist[2]}")

    # ── Sequence models: transform full frame, slice sequences per split ─────
    for prefix, arr_key, split_key, seq_len, scaler in [
        ("lstm",  "arr_l", "split_1h", LSTM_SEQ_LEN,  sc_l),
        ("trans", "arr_t", "split_4h", TRANS_SEQ_LEN, sc_t),
    ]:
        for split_name in ("train", "val", "test"):
            Xs, ys, ms = [], [], []
            for sym_i, e in enumerate(per_symbol):
                scaled = scaler.transform(e[arr_key])
                labels = e["lbl_l"] if arr_key == "arr_l" else e["lbl_4"]
                ts     = e["ts_l"]  if arr_key == "arr_l" else e["ts_4"]
                tr_end, v_start, v_end, te_start = e[split_key]
                n = len(scaled)
                bounds = {"train": (0, tr_end), "val": (v_start, v_end),
                          "test": (te_start, n)}[split_name]
                X, y, idx = make_sequences(scaled, labels, seq_len, *bounds)
                if len(X):
                    Xs.append(X); ys.append(y)
                    ms.append(np.stack([ts[idx], np.full(len(idx), sym_i, np.int64)], axis=1))
            X = np.concatenate(Xs) if Xs else np.empty((0, seq_len, per_symbol[0][arr_key].shape[1]), np.float32)
            y = np.concatenate(ys) if ys else np.empty((0,), np.int64)
            m = np.concatenate(ms) if ms else np.empty((0, 2), np.int64)
            _save(prefix, split_name, X, y, m)
            del Xs, ys, ms, X, y, m
            gc.collect()

    # ── Flat models: slice rows per split ────────────────────────────────────
    for prefix, arr_key, scaler in [("xgb", "xmat", sc_x), ("kan", "arr_k", sc_k)]:
        for split_name in ("train", "val", "test"):
            Xs, ys, ms = [], [], []
            for sym_i, e in enumerate(per_symbol):
                scaled = scaler.transform(e[arr_key])
                labels = e["lbl_4"]
                ts     = e["ts_4"]
                tr_end, v_start, v_end, te_start = e["split_4h"]
                n = len(scaled)
                lo, hi = {"train": (0, tr_end), "val": (v_start, v_end),
                          "test": (te_start, n)}[split_name]
                if hi > lo:
                    Xs.append(scaled[lo:hi]); ys.append(labels[lo:hi])
                    ms.append(np.stack([ts[lo:hi], np.full(hi - lo, sym_i, np.int64)], axis=1))
            X = np.concatenate(Xs) if Xs else np.empty((0, per_symbol[0][arr_key].shape[1]), np.float32)
            y = np.concatenate(ys) if ys else np.empty((0,), np.int64)
            m = np.concatenate(ms) if ms else np.empty((0, 2), np.int64)
            _save(prefix, split_name, X, y, m)

    # ── Persistence-baseline states per split (ts, sym, state_now) ───────────
    # _stage_eval_ensemble.py compares model F1 against the naive "current
    # regime continues" prediction on the SAME test rows.
    for split_name in ("train", "val", "test"):
        rows = []
        for sym_i, e in enumerate(per_symbol):
            tr_end, v_start, v_end, te_start = e["split_4h"]
            n = len(e["state_4"])
            lo, hi = {"train": (0, tr_end), "val": (v_start, v_end),
                      "test": (te_start, n)}[split_name]
            if hi > lo:
                rows.append(np.stack([e["ts_4"][lo:hi],
                                      np.full(hi - lo, sym_i, np.int64),
                                      e["state_4"][lo:hi]], axis=1))
        arr = np.concatenate(rows) if rows else np.empty((0, 3), np.int64)
        np.save(os.path.join(PREP_DIR, f"state_{split_name}.npy"), arr)
        log.info(f"  state_{split_name}: {arr.shape}")

    log.info("All prep files saved!")
    for f in sorted(os.listdir(PREP_DIR)):
        size_mb = os.path.getsize(os.path.join(PREP_DIR, f)) / (1024 * 1024)
        log.info(f"    {f}: {size_mb:.1f} MB")


if __name__ == "__main__":
    main()
