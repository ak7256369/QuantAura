# 24/7 continuous fine-tuner. Separate replay buffer per model.
# Runs in an infinite loop, fine-tuning on fresh data each cycle.
# Uses atomic model saves with a lock file to prevent serve.py from
# reading half-written files.
#
# Design guarantees (fixes for the F1 collapse):
#  1. Uses the SAME shared feature pipeline as initial training and serving
#     (feature_engineering/pipeline.py) — features can never drift.
#  2. Historical macro/fear&greed/funding series — the old cycle stamped
#     TODAY'S fear&greed onto 6 months of history (constant + look-ahead).
#  3. Scalers are the train-fitted ones from initial training. If they are
#     missing or the wrong shape the cycle ABORTS — silently refitting a
#     scaler shifts the whole input distribution under a trained model.
#  4. Per-symbol temporal split with purge gap before fine-tune evaluation.
import os, sys, time, gc, copy, json, joblib, shutil, logging, numpy as np, pandas as pd
from datetime import datetime
from sklearn.metrics import f1_score
from config import *
from utils.db import init_db, get_conn
from utils.logger import get_logger

log = get_logger("autopilot")

# Thread limits must be set BEFORE numpy/TF/torch initialise their pools, so
# this runs at import time rather than inside run_cycle().
_N_THREADS = str(AUTOPILOT_CPU_THREADS or (os.cpu_count() or 4))
for _var in ("OMP_NUM_THREADS", "MKL_NUM_THREADS", "OPENBLAS_NUM_THREADS",
             "NUMEXPR_NUM_THREADS", "TF_NUM_INTRAOP_THREADS"):
    os.environ.setdefault(_var, _N_THREADS)

REPLAY_PATHS = {k: os.path.join(DATA_DIR, f"replay_{k}.pkl")
                for k in ["lstm", "transformer", "xgb", "kan"]}
# Replay buffer key → data/prep array prefix from initial training
PREP_PREFIX = {"lstm": "lstm", "transformer": "trans", "xgb": "xgb", "kan": "kan"}
SEED_MARKER = os.path.join(DATA_DIR, ".replay_seeded")

# Fine-tune data windows (recent data; the broad distribution is preserved in
# the replay buffers, which are seeded from the original training split)
FT_DAYS_1H = 90    # was 60 — a 60d window's 20% eval slice is only 12 days
FT_DAYS_4H = 400   # long enough that XGB's 200d-window features aren't skewed
PURGE_4H   = LABEL_FORWARD_CANDLES
PURGE_1H   = LABEL_FORWARD_CANDLES * 4 + 4  # 1h label windows reach 27 rows ahead

# A candidate may not regress on the fixed holdout by more than this to be
# deployed — blocks catastrophic forgetting while allowing real adaptation.
HOLDOUT_SLACK = 0.01
KAN_FINETUNE_LR = 2e-4   # was 1e-3: 20x the Transformer's LR, always overshot

# ── Replay buffer helpers ─────────────────────────────────────────────────────

def _load_buf(key):
    p = REPLAY_PATHS[key]
    return joblib.load(p) if os.path.exists(p) else {"X": np.array([]), "y": np.array([])}


def _seed_replay_from_prep():
    """Anchor every replay buffer in the ORIGINAL training distribution.

    Before this, buffers were filled exclusively with data from past autopilot
    cycles — i.e. only ever recent windows. They therefore could not do the one
    job a replay buffer has: stop the model forgetting the two years of history
    it was actually trained on. Every fine-tune drifted toward the last ~2
    months and was rejected by the quality gate (17 consecutive rejections).
    """
    if os.path.exists(SEED_MARKER):
        return
    seeded = []
    for key, prefix in PREP_PREFIX.items():
        xp = os.path.join(PREP_DIR, f"{prefix}_train_X.npy")
        yp = os.path.join(PREP_DIR, f"{prefix}_train_y.npy")
        if not (os.path.exists(xp) and os.path.exists(yp)):
            continue
        try:
            X = np.load(xp, mmap_mode="r")
            y = np.load(yp)
            n = min(REPLAY_BUFFER_SIZE, len(y))
            idx = np.sort(np.random.choice(len(y), n, replace=False))
            joblib.dump({"X": np.asarray(X[idx], dtype=np.float32), "y": y[idx]},
                        REPLAY_PATHS[key])
            seeded.append(f"{key}({n})")
            del X, y
            gc.collect()
        except Exception as e:
            log.warning(f"  Replay seed failed for {key}: {e}")
    if seeded:
        with open(SEED_MARKER, "w") as f:
            f.write(str(time.time()))
        log.info(f"Replay buffers seeded from initial training data: {', '.join(seeded)}")


# ── Fixed-split evaluation (the stable scoring reference) ─────────────────────
# Two fixed splits, with strictly separated jobs:
#   VAL  — every accept/reject decision and all weight calibration. Selecting on
#          a split means hill-climbing on it, so this must NOT be the test set.
#   TEST — reporting only. Never consulted by any decision, which keeps it an
#          unbiased estimate of whatever model selection on val produced.
# Using test for the gate (as this originally did) would inflate the headline
# number cycle after cycle — the exact kind of leakage this project claims to
# avoid elsewhere.
_SPLITS = {}
# Per-cycle holdout scores, written next to the models as model_metrics.json so
# a deployment can report the F1 of the weights it is actually serving. The
# server has no data/prep (gitignored, ~1 GB) and therefore cannot recompute
# them, and its own model_performance rows are rolling-window scores.
_CYCLE_METRICS = {}

def _load_split(prefix, split):
    """A fixed split ('val' or 'test') from initial training.

    Scores must be compared against a FIXED reference. The rolling fine-tune
    window is not one: its 20% eval slice is a different, regime-specific
    stretch of market every cycle, and for the LSTM (1h candles) it covers only
    ~2-3 weeks. That is why the health report showed the LSTM "declining" to
    0.63 while the deployed weights still scored 0.7066 — the model never
    changed, only the yardstick did.
    """
    key = (prefix, split)
    if key not in _SPLITS:
        xp = os.path.join(PREP_DIR, f"{prefix}_{split}_X.npy")
        yp = os.path.join(PREP_DIR, f"{prefix}_{split}_y.npy")
        if os.path.exists(xp) and os.path.exists(yp):
            _SPLITS[key] = (np.load(xp, mmap_mode="r"), np.load(yp))
        else:
            log.warning(f"  Fixed {split} split missing for '{prefix}' - falling "
                        f"back to rolling-window scoring only")
            _SPLITS[key] = (None, None)
    return _SPLITS[key]


def _score(predict_fn, prefix, X_win, y_win):
    """Returns (val_f1, window_f1, combined) — the inputs to the gate.

    VAL, never TEST: the gate selects models, and selecting on a split
    hill-climbs on it. combined requires a candidate to hold up on BOTH the
    historical distribution and the current market before it can be deployed.
    """
    Xv, yv = _load_split(prefix, "val")
    f1_v = None
    if Xv is not None:
        f1_v = float(f1_score(yv, predict_fn(Xv), average="macro", zero_division=0))
    f1_w = None
    if X_win is not None and len(X_win):
        f1_w = float(f1_score(y_win, predict_fn(X_win), average="macro", zero_division=0))
    parts = [v for v in (f1_v, f1_w) if v is not None]
    return f1_v, f1_w, (sum(parts) / len(parts) if parts else 0.0)


def _accept(name, old, new):
    """old/new = (val_f1, window_f1, combined)."""
    f1v_old, f1w_old, comb_old = old
    f1v_new, f1w_new, comb_new = new

    def _f(v):
        return f"{v:.4f}" if v is not None else "n/a"

    # ASCII only — log lines must survive any console/file codepage
    detail = (f"val {_f(f1v_old)} -> {_f(f1v_new)}, "
              f"window {_f(f1w_old)} -> {_f(f1w_new)}")
    if (f1v_old is not None and f1v_new is not None
            and f1v_new < f1v_old - HOLDOUT_SLACK):
        log.info(f"  {name} fine-tune REJECTED - val regression ({detail})")
        return False
    if comb_new <= comb_old:
        log.info(f"  {name} fine-tune REJECTED - no overall gain ({detail})")
        return False
    log.info(f"  {name} fine-tune ACCEPTED ({detail})")
    return True

def _shapes_compatible(a, b):
    if a.ndim != b.ndim:
        return False
    if a.ndim < 2:
        return True
    return a.shape[1:] == b.shape[1:]

def _save_buf(key, X, y):
    buf = _load_buf(key)
    if buf["X"].size > 0 and not _shapes_compatible(buf["X"], X):
        log.warning(f"  Replay buffer '{key}' shape mismatch, clearing")
        buf = {"X": np.array([]), "y": np.array([])}
    # Subsample each cycle's contribution: consecutive 2h cycles overlap ~99%,
    # so storing everything floods the buffer with near-duplicates of the
    # recent window and defeats its anti-forgetting purpose.
    if len(X) > 500:
        keep = np.random.choice(len(X), 500, replace=False)
        X, y = X[keep], y[keep]
    aX = np.concatenate([buf["X"], X]) if buf["X"].size > 0 else X
    ay = np.concatenate([buf["y"], y]) if buf["y"].size > 0 else y
    if len(aX) > REPLAY_BUFFER_SIZE:
        idx = np.random.choice(len(aX), REPLAY_BUFFER_SIZE, replace=False)
        aX, ay = aX[idx], ay[idx]
    joblib.dump({"X": aX, "y": ay}, REPLAY_PATHS[key])

def _mix(key, X_new, y_new):
    buf = _load_buf(key)
    if buf["X"].size == 0: return X_new, y_new
    if not _shapes_compatible(buf["X"], X_new):
        log.warning(f"  Replay buffer '{key}' stale, resetting")
        return X_new, y_new
    n   = min(max(1, int(len(X_new) * REPLAY_MIX_RATIO)), len(buf["X"]))
    idx = np.random.choice(len(buf["X"]), n, replace=False)
    Xm  = np.concatenate([X_new, buf["X"][idx]])
    ym  = np.concatenate([y_new, buf["y"][idx]])
    p   = np.random.permutation(len(Xm))
    return Xm[p], ym[p]


def _compute_class_weights_np(y):
    classes, counts = np.unique(y, return_counts=True)
    total = len(y)
    return {int(c): total / (len(classes) * n) for c, n in zip(classes, counts)}


def _log_f1_holdout(model_name, predict_fn, prefix, window_f1=None, val_f1=None):
    """Record the model's scores on the two fixed splits.

    TEST is stored as eval_scope='holdout' and is the headline number the
    dashboard shows — reporting only, never fed back into a decision, so it
    stays an unbiased estimate. VAL is stored as eval_scope='val' and is what
    ensemble weights calibrate from. Both are comparable across cycles, unlike
    the rolling window (see _load_split), which is a diagnostic only.
    """
    if val_f1 is not None:
        try:
            with get_conn() as conn:
                conn.execute(
                    "INSERT INTO model_performance"
                    "(model_name,timestamp,f1_macro,eval_scope) VALUES(?,?,?,'val')",
                    (model_name, int(time.time()), float(val_f1)))
        except Exception as e:
            log.warning(f"DB write (val) failed for {model_name}: {e}")

    Xt, yt = _load_split(prefix, "test")
    if Xt is None:
        log.warning(f"  {model_name}: no fixed test split, skipping headline F1")
        return None
    return _log_f1(model_name, yt, predict_fn(Xt), window_f1=window_f1, val_f1=val_f1)


def _log_f1(model_name, y_true, y_pred, window_f1=None, val_f1=None):
    f1 = f1_score(y_true, y_pred, average="macro", zero_division=0)
    per_class = f1_score(y_true, y_pred, average=None, labels=[0, 1, 2], zero_division=0)
    try:
        with get_conn() as conn:
            conn.execute(
                "INSERT INTO model_performance"
                "(model_name,timestamp,f1_macro,f1_buy,f1_hold,f1_sell,eval_scope)"
                " VALUES(?,?,?,?,?,?,'holdout')",
                (model_name, int(time.time()), float(f1),
                 float(per_class[0]), float(per_class[1]), float(per_class[2]))
            )
    except Exception as e:
        log.warning(f"DB write failed for {model_name}: {e}")
    _CYCLE_METRICS[model_name] = {
        "f1_macro": round(float(f1), 4),          # test split — headline
        "f1_buy": round(float(per_class[0]), 4),
        "f1_hold": round(float(per_class[1]), 4),
        "f1_sell": round(float(per_class[2]), 4),
        "val_f1": round(float(val_f1), 4) if val_f1 is not None else None,
        "window_f1": round(float(window_f1), 4) if window_f1 is not None else None,
        "updated_at": int(time.time()),
    }
    extra = "".join([
        f" (val F1={val_f1:.4f})" if val_f1 is not None else "",
        f" (current-window F1={window_f1:.4f})" if window_f1 is not None else "",
    ])
    log.info(f"  {model_name} test F1={f1:.4f}{extra} "
             f"[BUY={per_class[0]:.3f} | HOLD={per_class[1]:.3f} | SELL={per_class[2]:.3f}]")
    return f1


def _write_model_metrics():
    """Persist this cycle's holdout scores beside the models.

    Travels with saved_models/ on the daily auto-push, so serve.py can report
    the true F1 of the exact weights it has loaded even on a machine that never
    ran training.
    """
    if not _CYCLE_METRICS:
        return
    try:
        from ensemble import load_weights
        weights = load_weights()
        ens = sum(weights.get(k, 0) * v["f1_macro"]
                  for k, v in _CYCLE_METRICS.items() if k in weights)
        payload = {
            "models": _CYCLE_METRICS,
            "weights": weights,
            "ensemble_f1": round(float(ens), 4),
            "eval_scope": "holdout",
            "updated_at": int(time.time()),
        }
        path = os.path.join(MODEL_DIR, "model_metrics.json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2)
        log.info(f"  Wrote {os.path.basename(path)} (ensemble F1={ens:.4f})")
    except Exception as e:
        log.warning(f"  Could not write model_metrics.json: {e}")


# ── Atomic save helpers ───────────────────────────────────────────────────────

def _acquire_training_lock():
    try:
        with open(TRAINING_LOCK_PATH, "w") as f:
            f.write(str(time.time()))
        log.info("Training lock acquired")
    except Exception as e:
        log.warning(f"Failed to create training lock: {e}")

def _release_training_lock():
    try:
        if os.path.exists(TRAINING_LOCK_PATH):
            os.remove(TRAINING_LOCK_PATH)
        log.info("Training lock released")
    except Exception as e:
        log.warning(f"Failed to remove training lock: {e}")


def _load_scaler_strict(path, expected_features, name):
    """Load a train-fitted scaler; abort the cycle on mismatch."""
    if not os.path.exists(path):
        raise RuntimeError(
            f"{name} scaler missing ({path}). Run initial training "
            f"(trainer.py) first — autopilot never fits its own scalers.")
    sc = joblib.load(path)
    if sc.n_features_in_ != expected_features:
        raise RuntimeError(
            f"{name} scaler expects {sc.n_features_in_} features but config "
            f"defines {expected_features}. Re-run initial training.")
    return sc


# ── Main training cycle ──────────────────────────────────────────────────────

def run_cycle():
    log.info("=== Autopilot cycle started ===")
    import tensorflow as tf
    import torch
    import torch.nn as nn

    n_threads = AUTOPILOT_CPU_THREADS or (os.cpu_count() or 4)
    torch.set_num_threads(n_threads)
    # intra = parallelism inside one op (the matmuls); inter = independent ops
    # in parallel. Giving inter the full count oversubscribes the cores and
    # slows training, so it gets a quarter.
    tf.config.threading.set_intra_op_parallelism_threads(n_threads)
    tf.config.threading.set_inter_op_parallelism_threads(max(2, n_threads // 4))
    log.info(f"  CPU threads: {n_threads} (of {os.cpu_count()} logical cores)")

    from data_sources.market_regime import build_full_macro_df
    from feature_engineering.pipeline import (
        fetch_btc_context, build_symbol_frames,
        temporal_split_indices, make_sequences,
    )
    from feature_engineering.xgb_features import build_xgb_features
    from models.model_lstm import load_lstm_model, save_lstm_model
    from models.model_transformer import TransformerClassifier
    from models.model_xgboost import load_xgb, save_xgb
    from models.model_kan import KANClassifier
    from ensemble import recompute_weights, save_weights

    # Scalers MUST be the train-fitted ones — hard requirement
    sc_l = _load_scaler_strict(os.path.join(MODEL_DIR, "scaler_lstm.pkl"),
                               N_LSTM_FEATURES, "LSTM")
    sc_t = _load_scaler_strict(os.path.join(MODEL_DIR, "scaler_transformer.pkl"),
                               N_TRANSFORMER_FEATURES, "Transformer")
    sc_x_path = os.path.join(MODEL_DIR, "scaler_xgb.pkl")
    sc_x = joblib.load(sc_x_path) if os.path.exists(sc_x_path) else None
    sc_k = _load_scaler_strict(os.path.join(MODEL_DIR, "scaler_kan.pkl"),
                               N_KAN_FEATURES, "KAN")

    # Buffers must remember the original 2-year distribution, not just recent
    # cycles — otherwise every fine-tune drifts and gets rejected.
    _seed_replay_from_prep()

    lstm  = load_lstm_model()
    trans = TransformerClassifier(); trans.load()
    xgb   = load_xgb()
    kan   = KANClassifier();         kan.load()

    macro   = build_full_macro_df()
    btc_ctx = fetch_btc_context(days_1h=FT_DAYS_1H, days_4h=FT_DAYS_4H)

    symbols_trained = 0
    total_candles_1h = 0
    total_candles_4h = 0

    # ══════════════════════════════════════════════════════════════════════════
    # PHASE 1: Collect + featurize all symbols (per-symbol splits, purge gaps).
    # Train ONCE on the combined data (prevents catastrophic forgetting).
    # ══════════════════════════════════════════════════════════════════════════
    parts = {k: {"trX": [], "trY": [], "teX": [], "teY": []}
             for k in ("lstm", "trans", "xgb", "kan")}

    for symbol in SYMBOLS:
        log.info(f"  {symbol}...")
        try:
            frames = build_symbol_frames(symbol, macro, btc_ctx,
                                         days_1h=FT_DAYS_1H, days_4h=FT_DAYS_4H,
                                         with_labels=True)
            if frames is None:
                log.warning(f"  {symbol}: no data, skipping")
                continue
            df_1h, df_4h = frames["df_1h"], frames["df_4h"]
            total_candles_1h += len(df_1h)
            total_candles_4h += len(df_4h)
            lbl_4h = df_4h["label"].values.astype(np.int64)

            # ── LSTM (1h sequences) ──
            la = sc_l.transform(np.nan_to_num(
                df_1h[LSTM_FEATURES].values.astype(np.float32)))
            ll = df_1h["label"].values.astype(np.int64)
            tr_end, _, _, te_start = temporal_split_indices(
                len(la), 0.8, 0.0, PURGE_1H)
            Xtr, ytr, _ = make_sequences(la, ll, LSTM_SEQ_LEN, 0, tr_end)
            Xte, yte, _ = make_sequences(la, ll, LSTM_SEQ_LEN, te_start, len(la))
            if len(Xtr): parts["lstm"]["trX"].append(Xtr); parts["lstm"]["trY"].append(ytr)
            if len(Xte): parts["lstm"]["teX"].append(Xte); parts["lstm"]["teY"].append(yte)

            # ── Transformer (4h sequences) ──
            ta = sc_t.transform(np.nan_to_num(
                df_4h[TRANSFORMER_FEATURES].values.astype(np.float32)))
            tr_end, _, _, te_start = temporal_split_indices(
                len(ta), 0.8, 0.0, PURGE_4H)
            Xtr, ytr, _ = make_sequences(ta, lbl_4h, TRANS_SEQ_LEN, 0, tr_end)
            Xte, yte, _ = make_sequences(ta, lbl_4h, TRANS_SEQ_LEN, te_start, len(ta))
            if len(Xtr): parts["trans"]["trX"].append(Xtr); parts["trans"]["trY"].append(ytr)
            if len(Xte): parts["trans"]["teX"].append(Xte); parts["trans"]["teY"].append(yte)

            # ── XGBoost (flat 4h rows) ──
            xmat, _ = build_xgb_features(df_1h, df_4h)
            xmat = np.nan_to_num(xmat.astype(np.float32))
            if sc_x is not None and sc_x.n_features_in_ == xmat.shape[1]:
                xs = sc_x.transform(xmat)
                tr_end, _, _, te_start = temporal_split_indices(
                    len(xs), 0.8, 0.0, PURGE_4H)
                parts["xgb"]["trX"].append(xs[:tr_end]);  parts["xgb"]["trY"].append(lbl_4h[:tr_end])
                parts["xgb"]["teX"].append(xs[te_start:]); parts["xgb"]["teY"].append(lbl_4h[te_start:])
            else:
                log.warning(f"  {symbol}: XGB feature count mismatch, skipping XGB rows")

            # ── KAN (flat 4h rows) ──
            ka = sc_k.transform(np.nan_to_num(
                df_4h[KAN_FEATURES].values.astype(np.float32)))
            tr_end, _, _, te_start = temporal_split_indices(
                len(ka), 0.8, 0.0, PURGE_4H)
            parts["kan"]["trX"].append(ka[:tr_end]);  parts["kan"]["trY"].append(lbl_4h[:tr_end])
            parts["kan"]["teX"].append(ka[te_start:]); parts["kan"]["teY"].append(lbl_4h[te_start:])

            symbols_trained += 1
            del frames, df_1h, df_4h
        except Exception as e:
            log.error(f"Error collecting {symbol}: {e}", exc_info=True)
        gc.collect()

    log.info(f"  Data collection complete: {symbols_trained}/{len(SYMBOLS)} symbols")

    def _cat(key, part):
        lst = parts[key][part]
        return np.concatenate(lst) if lst else None

    # ══════════════════════════════════════════════════════════════════════════
    # PHASE 2: Combined fine-tune, one model at a time.
    # ══════════════════════════════════════════════════════════════════════════
    if symbols_trained == 0:
        log.warning("No symbols collected, skipping training")
    else:
        # ── LSTM ──
        # QUALITY GATE: scored against the FIXED out-of-time holdout from
        # initial training plus the current window. A candidate ships only if it
        # gains overall without regressing on the holdout, so continuous
        # learning can never quietly trade away general performance for a fit to
        # the last few weeks.
        Xl, yl = _cat("lstm", "trX"), _cat("lstm", "trY")
        if Xl is not None and len(Xl) > 0:
            Xm, ym = _mix("lstm", Xl, yl)
            Xte, yte = _cat("lstm", "teX"), _cat("lstm", "teY")
            pred_l = lambda X: np.argmax(lstm.predict(X, batch_size=512, verbose=0), 1)
            old = _score(pred_l, "lstm", Xte, yte)
            w0 = lstm.get_weights()
            cw = _compute_class_weights_np(ym)
            lstm.compile(optimizer=tf.keras.optimizers.Adam(LSTM_FINETUNE_LR),
                         loss="sparse_categorical_crossentropy", metrics=["accuracy"])
            lstm.fit(Xm, ym, epochs=EPOCHS_FINE_TUNE, batch_size=BATCH_SIZE,
                     class_weight=cw, verbose=0)
            _save_buf("lstm", Xl, yl)
            new = _score(pred_l, "lstm", Xte, yte)
            accepted = _accept("lstm", old, new)
            if not accepted:
                lstm.set_weights(w0)
            shipped = new if accepted else old
            _log_f1_holdout("lstm", pred_l, "lstm",
                            window_f1=shipped[1], val_f1=shipped[0])
            del Xm, ym, w0
        del Xl, yl
        parts["lstm"] = None
        gc.collect()

        # ── Transformer ── (same fixed-holdout gate as the LSTM)
        Xt, yt = _cat("trans", "trX"), _cat("trans", "trY")
        if Xt is not None and len(Xt) > 0:
            Xm, ym = _mix("transformer", Xt, yt)
            Xte, yte = _cat("trans", "teX"), _cat("trans", "teY")
            pred_t = lambda X: np.argmax(trans.predict_proba(X), 1)
            old = _score(pred_t, "trans", Xte, yte)
            sd0 = copy.deepcopy(trans.model.state_dict())
            # Fresh optimizer + scheduler sized for the fine-tune run (a stale
            # cosine schedule with LR≈0 previously froze fine-tuning entirely).
            # train_epoch() computes class weights per epoch internally.
            trans.optimizer = torch.optim.AdamW(
                trans.model.parameters(), lr=FINETUNE_LR, weight_decay=1e-4)
            trans.scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(
                trans.optimizer, T_max=EPOCHS_FINE_TUNE, eta_min=1e-6)
            for _ in range(EPOCHS_FINE_TUNE):
                trans.train_epoch(Xm, ym)
            _save_buf("transformer", Xt, yt)
            new = _score(pred_t, "trans", Xte, yte)
            accepted = _accept("transformer", old, new)
            if not accepted:
                trans.model.load_state_dict(sd0)
            shipped = new if accepted else old
            _log_f1_holdout("transformer", pred_t, "trans",
                            window_f1=shipped[1], val_f1=shipped[0])
            del Xm, ym, sd0
        del Xt, yt
        parts["trans"] = None
        gc.collect()

        # ── XGBoost: EVALUATE ONLY ──
        # Calling fit() on an XGBClassifier retrains from scratch — it would
        # silently replace the 2-year initial model with one fit on this
        # cycle's ~400-day window. Trees don't benefit from tiny incremental
        # updates the way neural nets do, so autopilot only re-scores XGB on
        # fresh data (keeps ensemble weights honest). Re-run trainer.py
        # periodically (delete saved_models/xgb_model.pkl) for a full retrain.
        Xte, yte = _cat("xgb", "teX"), _cat("xgb", "teY")
        try:
            pred_x = lambda X: xgb.predict(X)
            v, win, _ = _score(pred_x, "xgb", Xte, yte)
            _log_f1_holdout("xgboost", pred_x, "xgb", window_f1=win, val_f1=v)
        except Exception as e:
            log.warning(f"  XGB evaluation failed: {e}")
        parts["xgb"] = None
        gc.collect()

        # ── KAN ── (same fixed-holdout gate as the LSTM)
        Xk, yk = _cat("kan", "trX"), _cat("kan", "trY")
        if Xk is not None and len(Xk) > 0:
            Xm, ym = _mix("kan", Xk, yk)
            Xte, yte = _cat("kan", "teX"), _cat("kan", "teY")
            pred_k = lambda X: np.argmax(kan.predict_proba(X), 1)
            old = _score(pred_k, "kan", Xte, yte)
            sd0 = copy.deepcopy(kan.model.state_dict())
            for g in kan.optimizer.param_groups:
                g["lr"] = KAN_FINETUNE_LR
            for _ in range(EPOCHS_FINE_TUNE):
                kan.train_epoch(Xm, ym)
            _save_buf("kan", Xk, yk)
            new = _score(pred_k, "kan", Xte, yte)
            accepted = _accept("kan", old, new)
            if not accepted:
                kan.model.load_state_dict(sd0)
            shipped = new if accepted else old
            _log_f1_holdout("kan", pred_k, "kan",
                            window_f1=shipped[1], val_f1=shipped[0])
            del Xm, ym, sd0
        del Xk, yk
        parts["kan"] = None
        gc.collect()

    # ── Atomic save: lock → save all → unlock ────────────────────────────────
    if symbols_trained > 0:
        _acquire_training_lock()
        try:
            save_lstm_model(lstm); trans.save(); save_xgb(xgb); kan.save()
            save_weights(recompute_weights())
            _write_model_metrics()
            log.info(f"All models saved ({symbols_trained}/{len(SYMBOLS)} symbols trained)")
        except Exception as e:
            log.error(f"Model save failed: {e}", exc_info=True)
        finally:
            _release_training_lock()

        try:
            with get_conn() as conn:
                conn.execute(
                    "INSERT OR REPLACE INTO candle_counts(id, count_1h, count_4h, updated_at) VALUES(1,?,?,?)",
                    (total_candles_1h, total_candles_4h, int(time.time()))
                )
        except Exception as e:
            log.warning(f"Candle count DB write failed: {e}")
    else:
        log.warning("No symbols trained successfully, skipping save")

    try:
        tf.keras.backend.clear_session()
    except Exception:
        pass
    gc.collect()
    log.info("=== Autopilot cycle complete ===")


def push_models_to_git() -> bool:
    """Commit + push the trained models.

    Returns True when the remote is up to date (pushed, or nothing to push),
    False when the push failed and should be retried soon. The caller uses this
    to decide whether to reset the push timer — resetting it after a failure
    silently defers the next attempt by a full interval, which is how a
    credential error at 20:16 kept improved models off the site for the rest of
    the day even after the credentials were fixed hours later.

    Deliberately scoped to explicit paths — never `git add -A`, which in an
    unattended loop could commit secrets, logs or multi-GB data files. If the
    models are byte-identical to the last push (the common case, since the
    quality gate rejects most fine-tunes) there is nothing to commit and we
    exit quietly without touching the remote.
    """
    import subprocess

    repo = os.path.dirname(BASE_DIR)          # D:\FYP
    rel = os.path.basename(BASE_DIR)          # quantaura-ml
    paths = [f"{rel}/saved_models", f"{rel}/logs/ensemble_eval.json",
             f"{rel}/logs/tradeability.json"]

    def _git(*args, check=True):
        return subprocess.run(["git", "-C", repo, *args], capture_output=True,
                              text=True, timeout=300, check=check)

    try:
        existing = [p for p in paths if os.path.exists(os.path.join(repo, p))]
        if not existing:
            log.warning("  Auto-push: nothing to push (no model files found)")
            return True
        _git("add", "--", *existing)

        staged = _git("diff", "--cached", "--stat", "--", *existing).stdout.strip()
        if not staged:
            log.info("  Auto-push: models unchanged since last push - skipped")
            return True

        # Report the F1 of what we are shipping, so the commit is self-describing
        try:
            with get_conn() as conn:
                scores = conn.execute(
                    "SELECT model_name, f1_macro, MAX(timestamp) FROM model_performance "
                    "WHERE eval_scope='holdout' GROUP BY model_name").fetchall()
            summary = " ".join(f"{r[0]}={r[1]:.4f}" for r in scores if r[1] is not None)
        except Exception:
            summary = "scores unavailable"

        stamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")
        msg = (f"chore(models): autopilot snapshot {stamp}\n\n"
               f"Holdout macro-F1: {summary}\n\n"
               f"Automated commit from autopilot.py — models are only committed "
               f"when the quality gate accepted a change.")
        _git("commit", "-m", msg)

        branch = _git("rev-parse", "--abbrev-ref", "HEAD").stdout.strip() or "main"
        push = _git("push", "origin", branch, check=False)
        if push.returncode == 0:
            log.info(f"  Auto-push: models pushed to origin/{branch} ({summary})")
            return True
        log.warning(f"  Auto-push: commit made but push failed "
                    f"(will retry next cycle): {push.stderr.strip()[:200]}")
        return False
    except subprocess.TimeoutExpired:
        log.warning("  Auto-push: git timed out")
        return False
    except Exception as e:
        log.warning(f"  Auto-push failed (training continues normally): {e}")
        return False


def run_ensemble_eval() -> bool:
    """Regenerate ensemble_eval.json — the true blended-ensemble F1 on aligned
    rows, plus confusion matrices, feature importances and the persistence
    baseline. Per-model scores refresh every cycle, but these do not: without
    this the headline ensemble number and the matrices on the site slowly drift
    behind the models actually being served.

    Runs as a SEPARATE PROCESS: it loads its own copies of all four models and
    the aligned val/test arrays, and doing that in-process would hold roughly
    double the memory for the remaining life of the loop.
    """
    import subprocess
    script = os.path.join(BASE_DIR, "_stage_eval_ensemble.py")
    if not os.path.exists(script):
        log.warning("  Ensemble eval: _stage_eval_ensemble.py not found")
        return False
    # METRICS_ONLY: evaluate with the live holdout-calibrated weights instead of
    # recalibrating on val, which under continuous training inverts against
    # true quality (see ensemble.recompute_weights).
    env = dict(os.environ, QUANTAURA_METRICS_ONLY="1")
    try:
        log.info("  Refreshing ensemble evaluation (separate process)...")
        r = subprocess.run([sys.executable, script], cwd=BASE_DIR, env=env,
                           capture_output=True, text=True, timeout=3600)
        if r.returncode == 0:
            try:
                with open(os.path.join(LOG_DIR, "ensemble_eval.json"), encoding="utf-8") as fh:
                    ens = json.load(fh).get("test", {}).get("ensemble")
                log.info(f"  Ensemble eval refreshed (blended test F1={ens})")
            except Exception:
                log.info("  Ensemble eval refreshed")
            return True
        log.warning(f"  Ensemble eval failed (rc={r.returncode}): "
                    f"{(r.stderr or r.stdout).strip()[-300:]}")
        return False
    except subprocess.TimeoutExpired:
        log.warning("  Ensemble eval timed out")
        return False
    except Exception as e:
        log.warning(f"  Ensemble eval error: {e}")
        return False


def run_checkpoint():
    ts  = datetime.utcnow().strftime("%Y%m%d_%H%M")
    dst = os.path.join(BACKUP_DIR, ts)
    os.makedirs(dst, exist_ok=True)
    for f in os.listdir(MODEL_DIR):
        src = os.path.join(MODEL_DIR, f)
        if os.path.isfile(src) and not f.startswith("."):
            shutil.copy2(src, os.path.join(dst, f))
    log.info(f"Checkpoint saved -> {dst}")


if __name__ == "__main__":
    # Bounded runs exist for CI: a GitHub Actions job cannot host an infinite
    # loop, and the workflow owns committing so the push is visible in the run
    # log like every other pipeline in this ecosystem. Defaults reproduce the
    # 24/7 workstation behaviour exactly — no flags, no change.
    import argparse
    _ap = argparse.ArgumentParser(description="QuantAura autopilot")
    _ap.add_argument("--cycles", type=int, default=0,
                     help="run N cycles then exit (0 = forever, the default)")
    _ap.add_argument("--no-git-push", action="store_true",
                     help="skip the built-in git push; the caller commits")
    _args = _ap.parse_args()

    log.info("=" * 60)
    log.info("  Autopilot continuous training mode started")
    log.info("  Cooldown between cycles: none (continuous back-to-back)"
             if AUTOPILOT_COOLDOWN_SECONDS <= 0 else
             f"  Cooldown between cycles: {AUTOPILOT_COOLDOWN_SECONDS}s")
    log.info(f"  Checkpoint interval: {CHECKPOINT_INTERVAL_HOURS}h")
    log.info(f"  Symbols: {SYMBOLS}")
    log.info("=" * 60)

    init_db()
    os.makedirs(MODEL_DIR, exist_ok=True)
    os.makedirs(BACKUP_DIR, exist_ok=True)

    # A bounded run is a cloud run, where the working tree is whatever the cache
    # restored. Two things must be present or the cycle is worse than useless:
    #
    #   replay buffers — without them fine-tuning sees only recent windows and
    #     drifts off the training distribution. That is the exact failure that
    #     produced 17 consecutive rejections before _seed_replay_from_prep
    #     existed, and _load_buf answers a missing file with an empty array
    #     rather than an error, so it would proceed silently.
    #   val/test prep  — the accept/reject gate scores candidates on the fixed
    #     holdout. Without it there is no gate, and a regressed model could ship.
    #
    # Fail loudly instead: an unanchored cycle burns ~45 CI minutes to produce a
    # candidate that should never be deployed.
    if _args.cycles > 0:
        _seed_replay_from_prep()
        _empty = [k for k in REPLAY_PATHS if len(_load_buf(k)["y"]) == 0]
        _missing_holdout = [
            f"{prefix}_{split}" for prefix in PREP_PREFIX.values() for split in ("val", "test")
            if not os.path.exists(os.path.join(PREP_DIR, f"{prefix}_{split}_X.npy"))
        ]
        if _empty or _missing_holdout:
            log.error("Refusing to run a bounded cycle without its anchors.")
            if _empty:
                log.error(f"  Empty/missing replay buffers: {', '.join(_empty)}")
            if _missing_holdout:
                log.error(f"  Missing holdout splits: {', '.join(_missing_holdout[:8])}")
            log.error("  Run a full retrain first — it regenerates prep and seeds the buffers.")
            raise SystemExit(2)

    # Yield to interactive work rather than competing with it. This does NOT
    # cap throughput: with nothing else runnable the trainer still gets every
    # core, it just loses ties to whatever the user is doing. os.nice is
    # POSIX-only, so Windows goes through the process-priority API.
    try:
        os.nice(5)
        log.info("CPU priority lowered (nice +5)")
    except (OSError, AttributeError):
        try:
            import ctypes
            BELOW_NORMAL_PRIORITY_CLASS = 0x00004000
            handle = ctypes.windll.kernel32.GetCurrentProcess()
            if ctypes.windll.kernel32.SetPriorityClass(handle, BELOW_NORMAL_PRIORITY_CLASS):
                log.info("CPU priority set to below-normal (Windows)")
        except Exception:
            pass

    cycle_count = 0
    last_checkpoint = time.time()
    # Push on the first cycle after startup, then every GIT_PUSH_INTERVAL_HOURS
    last_git_push = 0.0
    # Same for the ensemble evaluation: refresh once at startup so the site is
    # never left showing figures from an older set of weights.
    last_ensemble_eval = 0.0

    while True:
        cycle_count += 1
        log.info(f"--- Cycle #{cycle_count} starting ---")
        try:
            run_cycle()
        except Exception as e:
            log.error(f"Cycle #{cycle_count} FAILED: {e}", exc_info=True)
            _release_training_lock()
            log.info("Sleeping 5 minutes before retry after cycle failure...")
            time.sleep(300)
            continue

        elapsed_since_checkpoint = (time.time() - last_checkpoint) / 3600
        if elapsed_since_checkpoint >= CHECKPOINT_INTERVAL_HOURS:
            try:
                run_checkpoint()
                last_checkpoint = time.time()
            except Exception as e:
                log.error(f"Checkpoint failed: {e}", exc_info=True)

        # Refresh the aligned ensemble metrics BEFORE the push, so the
        # regenerated ensemble_eval.json ships in the same commit as the
        # weights it describes.
        if (time.time() - last_ensemble_eval) / 3600 >= ENSEMBLE_EVAL_INTERVAL_HOURS:
            if run_ensemble_eval():
                last_ensemble_eval = time.time()

        if (not _args.no_git_push
                and (time.time() - last_git_push) / 3600 >= GIT_PUSH_INTERVAL_HOURS):
            # Only reset the timer on success. A failed push (expired
            # credentials, no network) must be retried on the next cycle, not
            # deferred by another full interval.
            if push_models_to_git():
                last_git_push = time.time()

        if _args.cycles > 0 and cycle_count >= _args.cycles:
            log.info(f"Completed {cycle_count} cycle(s) as requested — exiting.")
            break

        if AUTOPILOT_COOLDOWN_SECONDS > 0:
            log.info(f"Cycle #{cycle_count} done. Cooldown {AUTOPILOT_COOLDOWN_SECONDS}s...")
            time.sleep(AUTOPILOT_COOLDOWN_SECONDS)
        else:
            log.info(f"Cycle #{cycle_count} done. Starting next cycle immediately.")
