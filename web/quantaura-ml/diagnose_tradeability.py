# diagnose_tradeability.py — Does the ensemble signal carry TRADEABLE edge?
#
# Macro-F1 measures how well we classify the trend REGIME 24h ahead. Nothing in
# that number says price will be higher. This script asks the only question a
# P&L cares about:
#
#   Conditional on the ensemble emitting BUY (or SELL), what is the actual
#   distribution of the forward 24h price return?
#
# If mean forward return given BUY is not meaningfully positive (after costs),
# then no position-sizing or risk overlay can rescue the strategy — the signal
# simply is not predictive of returns, whatever its F1.

import os, sys, json
import numpy as np
import pandas as pd
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")

from config import (PREP_DIR, MODEL_DIR, LABEL_FORWARD_CANDLES, SYMBOLS,
                    CONFIDENCE_THRESHOLD, LABEL_EMA_FAST, LABEL_EMA_SLOW,
                    LABEL_TREND_TAU, LABEL_VOL_WINDOW)
from ensemble import load_weights

FEE = 0.001        # taker per side
SLIP = 0.0005      # slippage per side
ROUND_TRIP = 2 * (FEE + SLIP)   # 0.30%


def load_frames():
    import joblib
    return joblib.load(os.path.join("data", "exp_frames_cache.pkl"))


def forward_returns(frames):
    """(timestamp, symbol_index) -> actual forward 24h simple return."""
    out = {}
    for sym_i, sym in enumerate(SYMBOLS):
        f = frames.get(sym)
        if f is None:
            continue
        df = f["df_4h"]
        close = df["close"].astype(float).values
        ts = df["timestamp"].values.astype(np.int64)
        H = LABEL_FORWARD_CANDLES
        for i in range(len(close) - H):
            out[(int(ts[i]), sym_i)] = close[i + H] / close[i] - 1.0
    return out


def ensemble_probs():
    """Aligned ensemble probabilities on the TEST split (same alignment the
    eval stage uses: the three 4h models share rows; LSTM joins where its 1h
    window ends on the 4h window's closing candle)."""
    import tensorflow as tf  # noqa
    from models.model_lstm import load_lstm_model
    from models.model_transformer import TransformerClassifier
    from models.model_xgboost import load_xgb
    from models.model_kan import KANClassifier

    def sp(prefix):
        return (np.load(os.path.join(PREP_DIR, f"{prefix}_test_X.npy"), mmap_mode="r"),
                np.load(os.path.join(PREP_DIR, f"{prefix}_test_y.npy")),
                np.load(os.path.join(PREP_DIR, f"{prefix}_test_meta.npy")))

    Xt, yt, mt = sp("trans")
    Xx, _, mx = sp("xgb")
    Xk, _, mk = sp("kan")
    Xl, _, ml = sp("lstm")

    lstm = load_lstm_model()
    trans = TransformerClassifier(); trans.load()
    xgb = load_xgb()
    kan = KANClassifier(); kan.load()

    p_t = trans.predict_proba(Xt)
    p_x = xgb.predict_proba(Xx)
    p_k = kan.predict_proba(Xk)
    p_l = np.asarray(lstm.predict(Xl, batch_size=512, verbose=0))

    key_x = {(int(t), int(s)): i for i, (t, s) in enumerate(mx)}
    key_k = {(int(t), int(s)): i for i, (t, s) in enumerate(mk)}
    HOUR, FOURH = 3600_000, 4 * 3600_000
    key_l = {}
    for i, (t, s) in enumerate(ml):
        t = int(t)
        if (t - 3 * HOUR) % FOURH == 0:
            key_l[(t - 3 * HOUR, int(s))] = i

    w = load_weights()
    rows, keys, ys = [], [], []
    for it, (t, s) in enumerate(mt):
        ts, sym = int(t), int(s)
        ix, ik = key_x.get((ts, sym)), key_k.get((ts, sym))
        if ix is None or ik is None:
            continue
        il = key_l.get((ts, sym))
        blend = (w.get("transformer", .25) * p_t[it]
                 + w.get("xgboost", .25) * p_x[ix]
                 + w.get("kan", .25) * p_k[ik])
        if il is not None:
            blend = blend + w.get("lstm", .25) * p_l[il]
        rows.append(blend / blend.sum())
        keys.append((ts, sym)); ys.append(yt[it])
    return np.asarray(rows), keys, np.asarray(ys)


def pct(x):
    return f"{x*100:+.3f}%"


def main():
    print("Loading frames + computing actual forward 24h returns...")
    frames = load_frames()
    fwd = forward_returns(frames)

    print("Blending ensemble on the test split...")
    probs, keys, y_true = ensemble_probs()
    pred = probs.argmax(1)
    conf = probs.max(1)

    r = np.array([fwd.get(k, np.nan) for k in keys])
    ok = ~np.isnan(r)
    probs, pred, conf, y_true, r = probs[ok], pred[ok], conf[ok], y_true[ok], r[ok]
    print(f"Rows with both a prediction and a realized forward return: {len(r)}\n")

    names = {0: "BUY", 1: "HOLD", 2: "SELL"}
    print("=" * 78)
    print("ACTUAL FORWARD 24h RETURN, CONDITIONAL ON THE PREDICTED SIGNAL")
    print("=" * 78)
    print(f"{'signal':<8}{'n':>7}{'mean':>11}{'median':>11}{'std':>9}"
          f"{'P(up)':>9}{'after cost':>12}")
    base = r.mean()
    for c in (0, 1, 2):
        m = pred == c
        if m.sum() == 0:
            continue
        rr = r[m]
        # A BUY is only profitable if price RISES; a SELL only if it FALLS.
        edge = rr.mean() - ROUND_TRIP if c == 0 else (-rr.mean() - ROUND_TRIP if c == 2 else 0.0)
        print(f"{names[c]:<8}{m.sum():>7}{pct(rr.mean()):>11}{pct(np.median(rr)):>11}"
              f"{rr.std()*100:>8.2f}%{(rr > 0).mean()*100:>8.1f}%"
              f"{pct(edge) if c != 1 else '     n/a':>12}")
    print(f"\nUnconditional mean forward return (buy & hold drift): {pct(base)}")
    print(f"Round-trip cost assumed: {pct(ROUND_TRIP)}")

    print("\n" + "=" * 78)
    print("SAME, BUT ONLY HIGH-CONFIDENCE SIGNALS (the live gate)")
    print("=" * 78)
    for thr in (0.50, CONFIDENCE_THRESHOLD, 0.65, 0.75):
        g = conf >= thr
        line = [f"conf>={thr:.2f}  n={int(g.sum()):>5}"]
        for c in (0, 2):
            m = g & (pred == c)
            if m.sum() < 10:
                line.append(f"{names[c]}: n<10")
                continue
            rr = r[m]
            edge = rr.mean() - ROUND_TRIP if c == 0 else -rr.mean() - ROUND_TRIP
            line.append(f"{names[c]}: n={m.sum():>4} mean={pct(rr.mean())} edge={pct(edge)}")
        print("  " + " | ".join(line))

    # Directional accuracy: does the signal predict the SIGN of the return?
    print("\n" + "=" * 78)
    print("DIRECTIONAL ACCURACY (the thing a trade actually needs)")
    print("=" * 78)
    signal_rows = pred != 1
    if signal_rows.sum():
        want_up = pred[signal_rows] == 0
        actual_up = r[signal_rows] > 0
        print(f"  Signals issued (BUY/SELL): {int(signal_rows.sum())}")
        print(f"  Direction correct:         {(want_up == actual_up).mean()*100:.2f}%")
        print(f"  Coin-flip baseline:        50.00%")
    # regime-label F1 for contrast
    from sklearn.metrics import f1_score
    print(f"\n  Regime-label macro F1 on these rows: "
          f"{f1_score(y_true, pred, average='macro', zero_division=0):.4f}")
    print("  ^ this is the number the site reports. Compare it to the "
          "directional accuracy above.")

    out = {
        "n": int(len(r)),
        "unconditional_mean_fwd_return": float(base),
        "round_trip_cost": ROUND_TRIP,
        "by_signal": {
            names[c]: {
                "n": int((pred == c).sum()),
                "mean_fwd_return": float(r[pred == c].mean()) if (pred == c).sum() else None,
                "p_up": float((r[pred == c] > 0).mean()) if (pred == c).sum() else None,
            } for c in (0, 1, 2)
        },
        "directional_accuracy": float((( pred[pred != 1] == 0) == (r[pred != 1] > 0)).mean())
                                if (pred != 1).sum() else None,
        "regime_macro_f1": float(f1_score(y_true, pred, average="macro", zero_division=0)),
    }
    with open(os.path.join("logs", "tradeability.json"), "w") as f:
        json.dump(out, f, indent=2)
    print("\nSaved: logs/tradeability.json")


if __name__ == "__main__":
    main()
