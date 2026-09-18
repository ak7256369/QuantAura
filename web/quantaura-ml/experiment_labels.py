# experiment_labels.py — Fast label-formulation sweep using XGBoost as probe.
# For each LABEL_VOL_MULT candidate: rebuild labels from cached raw frames,
# train XGB (fast), report val macro-F1 + confidence-filtered F1.
# Uses its own cache of raw per-symbol frames so Binance is hit only once.

import sys, os, gc, logging, json
from pathlib import Path
import numpy as np
import joblib

sys.path.insert(0, str(Path(__file__).resolve().parent))
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
log = logging.getLogger("exp")

import config
from config import (SYMBOLS, LOOKBACK_DAYS_1H, LOOKBACK_DAYS_4H,
                    TRAIN_FRACTION, VAL_FRACTION, LABEL_FORWARD_CANDLES, DATA_DIR)
from sklearn.preprocessing import StandardScaler
from sklearn.utils.class_weight import compute_sample_weight
from sklearn.metrics import f1_score

CACHE = os.path.join(DATA_DIR, "exp_frames_cache.pkl")
PURGE_4H = LABEL_FORWARD_CANDLES


def get_frames():
    """Cache per-symbol UNLABELED frames (features only) — fetch once."""
    if os.path.exists(CACHE):
        log.info("Loading cached frames...")
        return joblib.load(CACHE)
    from data_sources.market_regime import build_full_macro_df
    from feature_engineering.pipeline import fetch_btc_context, build_symbol_frames
    macro = build_full_macro_df()
    btc_ctx = fetch_btc_context(days_1h=90, days_4h=LOOKBACK_DAYS_4H)
    frames = {}
    for sym in SYMBOLS:
        log.info(f"  fetching {sym}...")
        f = build_symbol_frames(sym, macro, btc_ctx, days_1h=90,
                                days_4h=LOOKBACK_DAYS_4H, with_labels=False)
        if f: frames[sym] = f
    joblib.dump(frames, CACHE)
    return frames


def run_variant(frames, vol_mult, forward=LABEL_FORWARD_CANDLES):
    from feature_engineering.labels import generate_direction_labels
    from feature_engineering.xgb_features import build_xgb_features
    from feature_engineering.pipeline import temporal_split_indices
    from models.model_xgboost import build_xgb_model

    trX, trY, vX, vY = [], [], [], []
    for sym, f in frames.items():
        df_4h = generate_direction_labels(f["df_4h"], forward_candles=forward, vol_mult=vol_mult)
        xmat, _ = build_xgb_features(f["df_1h"], df_4h)
        xmat = np.nan_to_num(xmat.astype(np.float32))
        y = df_4h["label"].values.astype(np.int64)
        tr_end, v_start, v_end, _ = temporal_split_indices(
            len(xmat), TRAIN_FRACTION, VAL_FRACTION, PURGE_4H)
        trX.append(xmat[:tr_end]);      trY.append(y[:tr_end])
        vX.append(xmat[v_start:v_end]); vY.append(y[v_start:v_end])

    Xtr = np.concatenate(trX); ytr = np.concatenate(trY)
    Xv  = np.concatenate(vX);  yv  = np.concatenate(vY)
    sc = StandardScaler().fit(Xtr)
    Xtr, Xv = sc.transform(Xtr), sc.transform(Xv)

    dist = np.bincount(ytr, minlength=3) / len(ytr)
    model = build_xgb_model()
    model.set_params(n_estimators=400)
    sw = compute_sample_weight("balanced", ytr)
    model.fit(Xtr, ytr, sample_weight=sw, eval_set=[(Xv, yv)], verbose=False)

    proba = model.predict_proba(Xv)
    preds = proba.argmax(1)
    f1 = f1_score(yv, preds, average="macro", zero_division=0)

    # Confidence-filtered: only predictions with max prob >= 0.5 count as
    # actionable; others are forced to HOLD (mirrors the serve gate)
    conf = proba.max(1)
    gated = np.where(conf >= 0.5, preds, 1)
    f1_gated = f1_score(yv, gated, average="macro", zero_division=0)
    acted = (gated != 1) | (yv == 1)
    # Precision-style score on actionable BUY/SELL calls only
    buysell_mask = gated != 1
    hit = (gated[buysell_mask] == yv[buysell_mask]).mean() if buysell_mask.sum() else 0.0

    return {
        "vol_mult": vol_mult, "forward": forward,
        "train_dist": dist.round(3).tolist(),
        "val_f1_macro": round(float(f1), 4),
        "val_f1_gated": round(float(f1_gated), 4),
        "buysell_hit_rate": round(float(hit), 4),
        "n_actionable": int(buysell_mask.sum()), "n_val": len(yv),
        "best_iter": int(getattr(model, "best_iteration", -1)),
    }


if __name__ == "__main__":
    frames = get_frames()
    log.info(f"Frames ready: {len(frames)} symbols")
    results = []
    for vm in (0.45, 0.65, 0.85, 1.1):
        r = run_variant(frames, vm)
        results.append(r)
        log.info(f"  vol_mult={vm}: {json.dumps(r)}")
        gc.collect()
    # Longer horizon probe at mid threshold
    for fwd in (12, 18):
        r = run_variant(frames, 0.65, forward=fwd)
        results.append(r)
        log.info(f"  forward={fwd}: {json.dumps(r)}")
    print("\n=== SUMMARY (sorted by gated F1) ===")
    for r in sorted(results, key=lambda x: -x["val_f1_gated"]):
        print(json.dumps(r))


def run_move_detector(frames, vol_mult=0.85, forward=LABEL_FORWARD_CANDLES):
    """Binary probe: MOVE (|fwd_ret| > k*vol) vs QUIET. Vol clustering makes
    this far more predictable than direction."""
    from feature_engineering.labels import generate_direction_labels
    from feature_engineering.xgb_features import build_xgb_features
    from feature_engineering.pipeline import temporal_split_indices
    from models.model_xgboost import build_xgb_model

    trX, trY, vX, vY = [], [], [], []
    for sym, f in frames.items():
        df_4h = generate_direction_labels(f["df_4h"], vol_mult=vol_mult, forward_candles=forward)
        xmat, _ = build_xgb_features(f["df_1h"], df_4h)
        xmat = np.nan_to_num(xmat.astype(np.float32))
        y = (df_4h["label"].values != 1).astype(np.int64)  # 1 = MOVE, 0 = QUIET
        tr_end, v_start, v_end, _ = temporal_split_indices(
            len(xmat), TRAIN_FRACTION, VAL_FRACTION, PURGE_4H)
        trX.append(xmat[:tr_end]);      trY.append(y[:tr_end])
        vX.append(xmat[v_start:v_end]); vY.append(y[v_start:v_end])

    Xtr = np.concatenate(trX); ytr = np.concatenate(trY)
    Xv  = np.concatenate(vX);  yv  = np.concatenate(vY)
    sc = StandardScaler().fit(Xtr)
    Xtr, Xv = sc.transform(Xtr), sc.transform(Xv)
    import xgboost as xgb_lib
    model = xgb_lib.XGBClassifier(
        max_depth=5, n_estimators=400, learning_rate=0.03, subsample=0.8,
        colsample_bytree=0.7, min_child_weight=5, reg_lambda=2.0,
        eval_metric="logloss", early_stopping_rounds=50,
        tree_method="hist", n_jobs=-1, random_state=42)
    sw = compute_sample_weight("balanced", ytr)
    model.fit(Xtr, ytr, sample_weight=sw, eval_set=[(Xv, yv)], verbose=False)
    preds = model.predict(Xv)
    from sklearn.metrics import classification_report
    f1 = f1_score(yv, preds, average="macro", zero_division=0)
    print(f"\nMOVE-DETECTOR vol_mult={vol_mult}: macro F1 = {f1:.4f}, "
          f"base MOVE rate = {yv.mean():.3f}")
    print(classification_report(yv, preds, target_names=["QUIET", "MOVE"], zero_division=0))
    return f1
