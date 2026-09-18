# experiment_labels_v2.py — Probe ALTERNATIVE label formulations.
#
# Motivation: raw 24h direction labels are ~unpredictable (val macro-F1 ≈ 0.35
# vs 0.33 chance). This sweep probes targets with real signal structure:
#
#   dir     — current volatility-adaptive direction labels (reference)
#   trend   — market REGIME at t+H: sign/magnitude of (EMA12-EMA26)/close at
#             t+H, normalized by causal realized vol. Regimes persist for days,
#             so features at t carry genuine information about t+H.
#   smooth  — EMA5-smoothed forward return (denoised direction).
#
# For each variant: XGB probe val macro-F1, class balance, AND the naive
# persistence baseline (classify t's own state as the prediction for t+H) so
# we can report honestly how much the model adds over "trend continues".
#
# Uses the same cached frames as experiment_labels.py.

import sys, os, gc, json, logging
from pathlib import Path
import numpy as np
import pandas as pd
import joblib

sys.path.insert(0, str(Path(__file__).resolve().parent))
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
log = logging.getLogger("expv2")

import config
from config import (TRAIN_FRACTION, VAL_FRACTION, LABEL_FORWARD_CANDLES,
                    LABEL_VOL_WINDOW, DATA_DIR)
from sklearn.preprocessing import StandardScaler
from sklearn.utils.class_weight import compute_sample_weight
from sklearn.metrics import f1_score
from experiment_labels import get_frames

PURGE = LABEL_FORWARD_CANDLES
H = LABEL_FORWARD_CANDLES


def _causal_vol(close: pd.Series, horizon: int) -> pd.Series:
    lr = np.log(close / close.shift(1))
    return (lr.rolling(LABEL_VOL_WINDOW, min_periods=LABEL_VOL_WINDOW // 3)
            .std().shift(1) * np.sqrt(horizon))


def labels_dir(df, vol_mult=0.45, forward=H):
    """Reference: legacy direction labels."""
    from feature_engineering.labels import generate_direction_labels
    df = generate_direction_labels(df, forward_candles=forward, vol_mult=vol_mult)
    df["state_now"] = np.nan  # no persistence notion for raw direction
    return df


def labels_trend(df, tau=0.5, forward=H, fast=12, slow=26):
    """Regime at t+H. score[s] = (EMA_fast - EMA_slow)/close, normalized by
    causal vol at s. label[t] = classify(score_norm[t+forward])."""
    df = df.copy()
    close = df["close"].astype(float)
    ema_f = close.ewm(span=fast, adjust=False).mean()
    ema_s = close.ewm(span=slow, adjust=False).mean()
    score = (ema_f - ema_s) / close
    vol = _causal_vol(close, forward)
    z = score / vol.replace(0, np.nan)

    z_fwd = z.shift(-forward)
    df["label"] = 1
    df.loc[z_fwd > tau, "label"] = 0   # BUY  (uptrend regime in 24h)
    df.loc[z_fwd < -tau, "label"] = 2  # SELL (downtrend regime in 24h)
    # persistence baseline uses the SAME classifier on today's state
    st = pd.Series(1, index=df.index)
    st[z > tau] = 0
    st[z < -tau] = 2
    df["state_now"] = st

    valid = z_fwd.notna() & vol.notna()
    df = df[valid].copy()
    df["label"] = df["label"].astype(int)
    return df


def labels_smooth(df, vol_mult=0.45, forward=H, span=5):
    """EMA-smoothed forward return with vol-adaptive threshold."""
    df = df.copy()
    close = df["close"].astype(float)
    sm = close.ewm(span=span, adjust=False).mean()
    fwd = np.log(sm.shift(-forward) / sm)
    vol = _causal_vol(close, forward)
    thr = vol_mult * vol
    df["label"] = 1
    df.loc[fwd > thr, "label"] = 0
    df.loc[fwd < -thr, "label"] = 2
    df["state_now"] = np.nan
    valid = fwd.notna() & thr.notna()
    df = df[valid].copy()
    df["label"] = df["label"].astype(int)
    return df


def run_probe(frames, name, labeler, **kw):
    from feature_engineering.xgb_features import build_xgb_features
    from feature_engineering.pipeline import temporal_split_indices
    from models.model_xgboost import build_xgb_model

    trX, trY, vX, vY, vState = [], [], [], [], []
    for sym, f in frames.items():
        df_4h = labeler(f["df_4h"], **kw)
        xmat, _ = build_xgb_features(f["df_1h"], df_4h)
        xmat = np.nan_to_num(xmat.astype(np.float32))
        y = df_4h["label"].values.astype(np.int64)
        state = df_4h["state_now"].values
        tr_end, v_start, v_end, _ = temporal_split_indices(
            len(xmat), TRAIN_FRACTION, VAL_FRACTION, PURGE)
        trX.append(xmat[:tr_end]);      trY.append(y[:tr_end])
        vX.append(xmat[v_start:v_end]); vY.append(y[v_start:v_end])
        vState.append(state[v_start:v_end])

    Xtr = np.concatenate(trX); ytr = np.concatenate(trY)
    Xv = np.concatenate(vX);   yv = np.concatenate(vY)
    stv = np.concatenate(vState)
    sc = StandardScaler().fit(Xtr)
    Xtr, Xv = sc.transform(Xtr), sc.transform(Xv)

    dist = (np.bincount(ytr, minlength=3) / len(ytr)).round(3).tolist()
    model = build_xgb_model()
    model.set_params(n_estimators=400)
    sw = compute_sample_weight("balanced", ytr)
    model.fit(Xtr, ytr, sample_weight=sw, eval_set=[(Xv, yv)], verbose=False)
    preds = model.predict_proba(Xv).argmax(1)
    f1 = f1_score(yv, preds, average="macro", zero_division=0)

    persist_f1 = None
    if not np.isnan(stv.astype(float)).all():
        persist_f1 = round(float(f1_score(
            yv, stv.astype(np.int64), average="macro", zero_division=0)), 4)

    out = {"variant": name, **{k: v for k, v in kw.items()},
           "train_dist": dist,
           "val_f1_macro": round(float(f1), 4),
           "persistence_baseline_f1": persist_f1,
           "n_val": len(yv)}
    log.info(json.dumps(out))
    return out


if __name__ == "__main__":
    frames = get_frames()
    log.info(f"Frames ready: {len(frames)} symbols")
    results = []
    results.append(run_probe(frames, "dir", labels_dir, vol_mult=0.45)); gc.collect()
    for tau in (0.3, 0.5, 0.8):
        results.append(run_probe(frames, "trend", labels_trend, tau=tau)); gc.collect()
    results.append(run_probe(frames, "smooth", labels_smooth, vol_mult=0.45)); gc.collect()
    results.append(run_probe(frames, "smooth", labels_smooth, vol_mult=0.65)); gc.collect()

    print("\n=== SUMMARY (sorted by val F1) ===")
    for r in sorted(results, key=lambda x: -x["val_f1_macro"]):
        print(json.dumps(r))
    with open(os.path.join("logs", "experiment_labels_v2.json"), "w") as fh:
        json.dump(results, fh, indent=2)
