# smoke_test.py — Fast end-to-end validation of the feature pipeline.
# Builds ONE symbol with a small window and verifies:
#   * every configured feature column exists and is NOT constant
#   * labels are reasonably balanced
#   * splits + purge + sequence shapes are correct
# Run this BEFORE the full training pipeline: .venv/Scripts/python smoke_test.py

import sys, logging
from pathlib import Path
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
log = logging.getLogger("smoke")

from config import (LSTM_FEATURES, TRANSFORMER_FEATURES, KAN_FEATURES,
                    LSTM_SEQ_LEN, TRANS_SEQ_LEN, LABEL_FORWARD_CANDLES,
                    TRAIN_FRACTION, VAL_FRACTION)
from data_sources.market_regime import build_full_macro_df
from feature_engineering.pipeline import (fetch_btc_context, build_symbol_frames,
                                          temporal_split_indices, make_sequences)
from feature_engineering.xgb_features import build_xgb_features

DAYS_1H, DAYS_4H = 45, 240
SYMBOL = "ETHUSDT"

failures = []

log.info("Fetching macro data...")
macro = build_full_macro_df()
log.info(f"  macro rows: {len(macro)}, cols: {list(macro.columns)}")

log.info("Fetching BTC context...")
btc_ctx = fetch_btc_context(days_1h=DAYS_1H, days_4h=DAYS_4H)

log.info(f"Building frames for {SYMBOL}...")
frames = build_symbol_frames(SYMBOL, macro, btc_ctx,
                             days_1h=DAYS_1H, days_4h=DAYS_4H, with_labels=True)
assert frames is not None, "build_symbol_frames returned None"
df_1h, df_4h = frames["df_1h"], frames["df_4h"]
log.info(f"  df_1h: {len(df_1h)} rows | df_4h: {len(df_4h)} rows")

# ── Check every configured feature exists and varies ──────────────────────────
def check_features(df, feats, name):
    for col in feats:
        if col not in df.columns:
            failures.append(f"{name}: column '{col}' MISSING")
            continue
        vals = df[col].values
        if np.all(~np.isfinite(vals)):
            failures.append(f"{name}: column '{col}' all NaN/inf")
        elif np.nanstd(vals) == 0:
            failures.append(f"{name}: column '{col}' is CONSTANT ({vals[0] if len(vals) else 'empty'})")

check_features(df_1h, LSTM_FEATURES, "LSTM(1h)")
check_features(df_4h, TRANSFORMER_FEATURES, "TRANSFORMER(4h)")
check_features(df_4h, KAN_FEATURES, "KAN(4h)")

# ── Label balance ─────────────────────────────────────────────────────────────
for tf_name, df in (("4h", df_4h), ("1h", df_1h)):
    dist = np.bincount(df["label"].values.astype(int), minlength=3) / max(len(df), 1)
    log.info(f"  {tf_name} labels: BUY={dist[0]:.1%} HOLD={dist[1]:.1%} SELL={dist[2]:.1%}")
    if dist.max() > 0.70:
        failures.append(f"{tf_name} labels badly imbalanced: {dist}")
    if dist.min() < 0.10:
        failures.append(f"{tf_name} label class starved: {dist}")

# ── Splits + sequences ────────────────────────────────────────────────────────
arr = np.nan_to_num(df_4h[TRANSFORMER_FEATURES].values.astype(np.float32))
lbl = df_4h["label"].values.astype(np.int64)
tr_end, v_start, v_end, te_start = temporal_split_indices(
    len(arr), TRAIN_FRACTION, VAL_FRACTION, LABEL_FORWARD_CANDLES)
log.info(f"  4h split: train=[0,{tr_end}) val=[{v_start},{v_end}) test=[{te_start},{len(arr)})")
assert v_start - tr_end >= LABEL_FORWARD_CANDLES, "purge gap missing (train→val)"
assert te_start - v_end >= LABEL_FORWARD_CANDLES, "purge gap missing (val→test)"

Xtr, ytr, _ = make_sequences(arr, lbl, TRANS_SEQ_LEN, 0, tr_end)
Xv,  yv, _  = make_sequences(arr, lbl, TRANS_SEQ_LEN, v_start, v_end)
Xte, yte, _ = make_sequences(arr, lbl, TRANS_SEQ_LEN, te_start, len(arr))
log.info(f"  seq shapes: train={Xtr.shape} val={Xv.shape} test={Xte.shape}")
assert Xtr.shape[1:] == (TRANS_SEQ_LEN, len(TRANSFORMER_FEATURES))
assert len(Xtr) == len(ytr) and len(Xv) == len(yv)

# ── XGB features ──────────────────────────────────────────────────────────────
xmat, names = build_xgb_features(df_1h, df_4h)
log.info(f"  XGB matrix: {xmat.shape} ({len(names)} features)")
assert xmat.shape == (len(df_4h), len(names))
const_cols = [names[i] for i in range(xmat.shape[1]) if np.nanstd(xmat[:, i]) == 0]
if const_cols:
    log.warning(f"  XGB constant columns (may be OK if source unavailable): {const_cols}")

# ── Verdict ───────────────────────────────────────────────────────────────────
print("\n" + "=" * 60)
if failures:
    print(f"SMOKE TEST FAILED - {len(failures)} problem(s):")
    for f in failures:
        print(f"  [X] {f}")
    sys.exit(1)
print("SMOKE TEST PASSED - pipeline is healthy, safe to run full training.")
