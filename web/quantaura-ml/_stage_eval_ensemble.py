# _stage_eval_ensemble.py — PHASE 3: Evaluate the 4-model ensemble on TEST.
#
# Aligns per-model predictions by (timestamp, symbol): the three 4h models
# predict on the same rows; the LSTM's 1h prediction for a 4h row is the one
# whose window ends on that 4h window's closing 1h candle.
#
# Ensemble weights are calibrated on the VAL split (never test), saved to
# model_weights.json, then applied once to TEST. Reports raw macro-F1 and the
# confidence-gated metrics that mirror live serving, and writes the ensemble
# row to model_performance.

import sys, os, json, time, logging
import numpy as np
import joblib
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
log = logging.getLogger(__name__)

from sklearn.metrics import f1_score, accuracy_score
from config import (MODEL_DIR, PREP_DIR, LOG_DIR, NUM_CLASSES,
                    CONFIDENCE_THRESHOLD)

FOUR_H_MS = 4 * 3600 * 1000
HOUR_MS = 3600 * 1000


def _load_split(prefix, split):
    X = np.load(os.path.join(PREP_DIR, f"{prefix}_{split}_X.npy"))
    y = np.load(os.path.join(PREP_DIR, f"{prefix}_{split}_y.npy"))
    m = np.load(os.path.join(PREP_DIR, f"{prefix}_{split}_meta.npy"))
    return X, y, m


def _load_models():
    import tensorflow as tf  # noqa: F401  (needed before keras model load)
    from models.model_lstm import load_lstm_model
    from models.model_transformer import TransformerClassifier
    from models.model_xgboost import load_xgb
    from models.model_kan import KANClassifier
    lstm = load_lstm_model()
    trans = TransformerClassifier(); trans.load()
    xgb = load_xgb()
    kan = KANClassifier(); kan.load()
    return lstm, trans, xgb, kan


def _own_split_f1(models, split):
    """Each model's macro-F1 on its OWN split arrays (no row alignment —
    the 1h and 4h frames cover different wall-clock spans, so their val
    windows need not overlap)."""
    lstm, trans, xgb, kan = models
    out = {}
    Xt, yt, _ = _load_split("trans", split)
    out["transformer"] = f1_score(yt, trans.predict_proba(Xt).argmax(1),
                                  average="macro", zero_division=0)
    Xx, yx, _ = _load_split("xgb", split)
    out["xgboost"] = f1_score(yx, xgb.predict_proba(Xx).argmax(1),
                              average="macro", zero_division=0)
    Xk, yk, _ = _load_split("kan", split)
    out["kan"] = f1_score(yk, kan.predict_proba(Xk).argmax(1),
                          average="macro", zero_division=0)
    Xl, yl, _ = _load_split("lstm", split)
    out["lstm"] = f1_score(yl, np.asarray(
        lstm.predict(Xl, batch_size=512, verbose=0)).argmax(1),
        average="macro", zero_division=0)
    return out


def _predict_aligned(models, split):
    """Aligned probability matrices on one split. The three 4h models share
    rows exactly; the LSTM joins where its 1h window overlaps (its frame spans
    less history). Rows without an LSTM prediction get p_lstm=None and are
    blended from the remaining three with renormalized weights."""
    lstm, trans, xgb, kan = models

    Xt, yt, mt = _load_split("trans", split)
    Xx, yx, mx = _load_split("xgb", split)
    Xk, yk, mk = _load_split("kan", split)
    Xl, yl, ml = _load_split("lstm", split)

    log.info(f"[{split}] predicting: trans={len(Xt)}, xgb={len(Xx)}, "
             f"kan={len(Xk)}, lstm={len(Xl)}")

    p_trans = trans.predict_proba(Xt)
    p_xgb   = xgb.predict_proba(Xx)
    p_kan   = kan.predict_proba(Xk)
    p_lstm  = np.asarray(lstm.predict(Xl, batch_size=512, verbose=0))

    key_x = {(int(t), int(s)): i for i, (t, s) in enumerate(mx)}
    key_k = {(int(t), int(s)): i for i, (t, s) in enumerate(mk)}
    # LSTM: key by the 4h window whose closing 1h candle ends the sequence
    key_l = {}
    for i, (t, s) in enumerate(ml):
        t = int(t)
        if (t - 3 * HOUR_MS) % FOUR_H_MS == 0:
            key_l[(t - 3 * HOUR_MS, int(s))] = i

    y, rows_l, rows_t, rows_x, rows_k, has_l, tss = [], [], [], [], [], [], []
    for it, (t, s) in enumerate(mt):
        ts, sym = int(t), int(s)
        ix, ik = key_x.get((ts, sym)), key_k.get((ts, sym))
        if ix is None or ik is None:
            continue
        il = key_l.get((ts, sym))
        y.append(yt[it])
        rows_t.append(p_trans[it]); rows_x.append(p_xgb[ix]); rows_k.append(p_kan[ik])
        rows_l.append(p_lstm[il] if il is not None else np.zeros(NUM_CLASSES, np.float32))
        has_l.append(il is not None)
        tss.append(ts)

    y = np.asarray(y, np.int64)
    has_l = np.asarray(has_l)
    ts_arr = np.asarray(tss, np.int64)
    log.info(f"[{split}] aligned rows: {len(y)} / {len(Xt)} transformer rows "
             f"({int(has_l.sum())} with LSTM coverage)")
    probs = {
        "lstm":        np.asarray(rows_l, np.float32),
        "transformer": np.asarray(rows_t, np.float32),
        "xgboost":     np.asarray(rows_x, np.float32),
        "kan":         np.asarray(rows_k, np.float32),
    }
    return y, probs, has_l, ts_arr


def _blend(probs, weights, has_l):
    """Weighted blend; rows without LSTM coverage renormalize over the rest
    (a zero probability vector contributes nothing, so dividing by the row
    sum handles both cases)."""
    out = np.zeros_like(probs["transformer"])
    for k, p in probs.items():
        w = weights.get(k, 0.25)
        if k == "lstm":
            p = p * has_l[:, None]
        out += w * p
    return out / out.sum(axis=1, keepdims=True)


MODEL_KEYS = ("lstm", "xgboost", "transformer", "kan")
TEMP_GRID = (0.02, 0.05, 0.10, 0.20, 0.50, 1.00)
DEFAULT_TEMP = 0.10


def _weights_from_f1(f1_map, temperature):
    # An unmeasurable model arrives as None (see _aligned_f1). numpy would cast
    # it to nan, exp(nan) is nan, and every weight silently becomes nan — the
    # quiet-corruption version of the bug None exists to make loud. Callers
    # must resolve it before getting here.
    missing = [k for k in MODEL_KEYS if f1_map.get(k) is None]
    if missing:
        raise ValueError(f"Cannot weight models with no F1 estimate: {missing}")
    f1s = np.array([f1_map[k] for k in MODEL_KEYS], dtype=float)
    w = np.exp((f1s - f1s.max()) / temperature)
    w = w / w.sum()
    return dict(zip(MODEL_KEYS, w.tolist()))


# Below this many scorable rows a model's aligned F1 is not an estimate, and
# must not be fed to the weighting as though it were.
MIN_ALIGNED_ROWS = 100


def _aligned_f1(y, probs, has_l, sl):
    """Per-model macro-F1 on a slice of the ALIGNED rows — the population the
    blend actually runs on. The LSTM is scored only where it has a vote.

    Returns None for a model with too few scorable rows. It must NOT return
    0.0: the softmax reads 0.0 as a catastrophically bad model and drives the
    weight to zero, so an unmeasurable model would be silently dropped from the
    ensemble rather than flagged. That is exactly what happened on 2026-08-08 —
    the LSTM has ZERO aligned coverage on val (its 1h frame spans 365 days
    against the 4h models' 730, so the two val windows do not overlap; only the
    test windows do) and was assigned weight 0.0 without a word.
    """
    out = {}
    for k, p in probs.items():
        m = has_l[sl] if k == "lstm" else np.ones(len(y[sl]), bool)
        out[k] = (f1_score(y[sl][m], p[sl][m].argmax(1), average="macro",
                           zero_division=0) if m.sum() >= MIN_ALIGNED_ROWS else None)
    return out


def _select_temperature(models):
    """Pick the softmax temperature by nested validation INSIDE val.

    The old hard-coded 0.02 treats val noise as signal: a 2.3-point spread
    became a 3.2x weight ratio, and on the 2026-08-08 retrain it handed the
    LSTM 50.9% of the vote on its best-val score while it generalised worst —
    the blend scored 0.7278 on LSTM-covered rows against 0.7498 overall, i.e.
    the most-weighted model was dragging it down.

    Val is split TEMPORALLY (sorted by timestamp, not by the per-symbol order
    the arrays arrive in): weights are derived from the earlier half and the
    blend is scored on the later half, which is the same
    fit-on-past/judge-on-future relationship the models themselves are held to.
    Test is never consulted — it is read once, afterwards, by main().

    Returns (temperature, grid_results, full_val_aligned_f1).
    """
    y, probs, has_l, ts = _predict_aligned(models, "val")
    order = np.argsort(ts, kind="stable")
    y, has_l = y[order], has_l[order]
    probs = {k: p[order] for k, p in probs.items()}

    n = len(y)
    full = slice(0, n)
    # Per-model F1 over ALL aligned val rows — this is what the final weights
    # are calibrated from, so it is measured on the population the blend runs
    # on rather than on each model's own split.
    f1_full = _aligned_f1(y, probs, has_l, full)
    log.info(f"  [temp-select] val-aligned F1 (full): {f1_full}")

    missing = [k for k, v in f1_full.items() if v is None]
    if missing:
        # Cannot calibrate on this population: some model has no vote here.
        # Say so and hand back None so main() falls back to own-split rather
        # than weighting a model on a number that does not exist.
        log.warning(
            f"  [temp-select] no aligned val coverage for {missing} "
            f"({int(has_l.sum())}/{n} rows have LSTM) — aligned calibration is "
            f"impossible on this split; falling back to own-split val F1. "
            f"The structural fix is to make the 1h and 4h splits span the same "
            f"wall-clock window (config.LOOKBACK_DAYS_1H vs _4H).")
        return None, [], None

    cut = n // 2
    if cut < 100 or (n - cut) < 100:
        log.warning(f"  Val too small for nested selection ({n} rows) — "
                    f"using default temperature {DEFAULT_TEMP}")
        return DEFAULT_TEMP, [], f1_full

    early, late = slice(0, cut), slice(cut, n)
    f1_early = _aligned_f1(y, probs, has_l, early)
    log.info(f"  [temp-select] val-early F1: "
             f"{ {k: round(v, 4) for k, v in f1_early.items()} }")

    if any(v is None for v in f1_early.values()):
        log.warning("  [temp-select] a model is unscorable on the val-early "
                    "half — falling back to own-split calibration.")
        return None, [], None

    results = []
    for t in TEMP_GRID:
        w = _weights_from_f1(f1_early, t)
        blended = _blend({k: p[late] for k, p in probs.items()}, w, has_l[late])
        score = f1_score(y[late], blended.argmax(1), average="macro", zero_division=0)
        results.append({"temperature": t, "val_late_f1": round(float(score), 4),
                        "weights": {k: round(v, 3) for k, v in w.items()}})
        log.info(f"  [temp-select] T={t:<5} val-late F1={score:.4f}  "
                 f"w={ {k: round(v, 2) for k, v in w.items()} }")

    best = max(results, key=lambda r: r["val_late_f1"])
    log.info(f"  [temp-select] chosen T={best['temperature']} "
             f"(val-late F1 {best['val_late_f1']})")
    return best["temperature"], results, f1_full


def _gated_metrics(y, blended, threshold):
    preds = blended.argmax(1)
    conf = blended.max(1)
    gated = np.where(conf >= threshold, preds, 1)  # low confidence → HOLD
    f1_gated = f1_score(y, gated, average="macro", zero_division=0)
    mask = gated != 1
    hit = float((gated[mask] == y[mask]).mean()) if mask.sum() else 0.0
    base = float((y != 1).mean() / 2)  # base rate of a specific signal class
    return {
        "f1_gated": round(float(f1_gated), 4),
        "signals_issued": int(mask.sum()),
        "signal_hit_rate": round(hit, 4),
        "signal_base_rate": round(base, 4),
        "lift": round(hit / base, 2) if base > 0 else None,
    }


def main():
    log.info("=" * 60)
    log.info("  PHASE 3: Ensemble calibration (val) + evaluation (test)")
    log.info("=" * 60)

    models = _load_models()

    # ── Calibrate weights on VAL (each model scored on its own val split) ──
    val_f1 = _own_split_f1(models, "val")
    for name, v in val_f1.items():
        log.info(f"  val F1 {name}: {v:.4f}")

    # Temperature is selected by nested validation inside val (never on test),
    # then weights are calibrated on the FULL val with it. The old fixed 0.02
    # over-committed to whichever model happened to top a noisy val estimate.
    #
    # Under continuous training the acceptance gate selects on val, so val
    # scores inflate unevenly across models and these weights invert against
    # true quality (see ensemble.recompute_weights). When the autopilot invokes
    # this stage it wants the metrics only; the live weights it maintains from
    # holdout must not be clobbered — and selecting a temperature it will throw
    # away would cost a full val prediction pass on every fine-tune.
    temperature, temp_grid, val_f1_aligned = None, [], None
    if os.environ.get("QUANTAURA_METRICS_ONLY") == "1":
        from ensemble import load_weights
        weights = load_weights()
        log.info(f"  METRICS_ONLY: evaluating with live weights {weights}")
    else:
        temperature, temp_grid, val_f1_aligned = _select_temperature(models)
        if val_f1_aligned is None:
            # Aligned calibration impossible on this split (see the warning
            # above). Own-split F1 at the historical temperature is the
            # fallback: it over-credits a partially-covering model, but every
            # model at least has a real measurement behind its weight.
            temperature, val_f1_aligned = 0.02, val_f1
            log.warning(f"  Falling back to own-split calibration at T={temperature}")
        # Calibrate from the ALIGNED val F1, not each model's own split.
        #
        # These rank the models differently and the gap is not cosmetic: on its
        # own 1h grid the LSTM looked best (val 0.7486) and took 51.7% of the
        # vote, while on the aligned rows where it actually votes it is worst,
        # and the blend scored 0.7195 there against 0.7505 overall. The nested
        # selection above, which reads aligned rows, independently drove its
        # weight to ~0 — then the old own-split calibration overrode that with
        # 0.52. A weight has to be estimated on the population it is applied
        # to, which is the same defect as reporting per-model F1 on a different
        # row set from the ensemble.
        weights = {k: round(v, 4)
                   for k, v in _weights_from_f1(val_f1_aligned, temperature).items()}
        log.info(f"  Calibrated weights (T={temperature}, aligned val): {weights}")
        with open(os.path.join(MODEL_DIR, "model_weights.json"), "w") as f:
            json.dump(weights, f, indent=2)

    # ── Evaluate on TEST ──
    y_test, probs_test, has_l, _ = _predict_aligned(models, "test")
    report = {"weights": weights, "val_f1": {k: round(v, 4) for k, v in val_f1.items()},
              "test": _own_split_f1(models, "test"), "lstm_coverage": round(float(has_l.mean()), 3)}
    if temperature is not None:
        report["weight_temperature"] = temperature
        report["weight_temperature_grid"] = temp_grid
        report["val_f1_aligned"] = {k: round(v, 4) for k, v in val_f1_aligned.items()}
    report["test"] = {k: round(v, 4) for k, v in report["test"].items()}

    blended = _blend(probs_test, weights, has_l)
    ens_preds = blended.argmax(1)
    ens_f1 = f1_score(y_test, ens_preds, average="macro", zero_division=0)
    report["test"]["ensemble"] = round(float(ens_f1), 4)
    report["test"]["ensemble_accuracy"] = round(float(accuracy_score(y_test, ens_preds)), 4)

    # Per-model F1 on the SAME rows the ensemble is scored on.
    #
    # report["test"] scores each model on its own split, which is right for
    # judging a model in isolation but is NOT comparable with the ensemble:
    # the 4h models cover 6410 test rows and the LSTM 12680, so publishing
    # "LSTM 68.3% vs ensemble 75.3%" side by side compares two different
    # populations. The LSTM's are the rows where the ensemble does NOT have its
    # vote (coverage is ~50%), so the gap is partly a change of denominator.
    # These figures share one row set, so "the blend beats its parts" is a
    # claim about the same data.
    aligned = {}
    for name, p in probs_test.items():
        m = has_l if name == "lstm" else np.ones(len(y_test), bool)
        if m.sum():
            aligned[name] = round(float(f1_score(
                y_test[m], p[m].argmax(1), average="macro", zero_division=0)), 4)
    aligned["ensemble"] = round(float(ens_f1), 4)
    # The ensemble restricted to LSTM-covered rows, so the LSTM's number above
    # is read against the blend on exactly the rows it voted in.
    if has_l.sum():
        aligned["ensemble_lstm_rows"] = round(float(f1_score(
            y_test[has_l], ens_preds[has_l], average="macro", zero_division=0)), 4)
    aligned["n_rows"] = int(len(y_test))
    aligned["n_rows_lstm"] = int(has_l.sum())
    report["test_aligned"] = aligned

    # ── Honesty check: naive persistence baseline on the same test rows ─────
    # ("classify today's regime as the 24h-ahead forecast"). Models must beat
    # this to demonstrate they learn transitions, not just persistence.
    state_path = os.path.join(PREP_DIR, "state_test.npy")
    if os.path.exists(state_path):
        st = np.load(state_path)  # (n, 3): ts, sym, state_now
        key_s = {(int(t), int(s)): int(v) for t, s, v in st}
        Xt_, yt_, mt_ = _load_split("trans", "test")
        base_preds, base_y = [], []
        for it, (t, s) in enumerate(mt_):
            v = key_s.get((int(t), int(s)))
            if v is not None:
                base_preds.append(v); base_y.append(yt_[it])
        if base_y:
            report["test"]["persistence_baseline_f1"] = round(float(f1_score(
                base_y, base_preds, average="macro", zero_division=0)), 4)
    report["test"]["gated@0.50"] = _gated_metrics(y_test, blended, 0.50)
    report["test"][f"gated@{CONFIDENCE_THRESHOLD:.2f}"] = _gated_metrics(
        y_test, blended, CONFIDENCE_THRESHOLD)

    # ── Real per-model confusion matrices + XGB feature importances ─────────
    # (consumed by serve.py /stats → the dashboard Models page; replaces the
    # hardcoded placeholder data the UI used to ship)
    from sklearn.metrics import confusion_matrix
    lstm, trans, xgb, kan = models
    conf = {}
    Xt_, yt_, _ = _load_split("trans", "test")
    conf["Transformer"] = confusion_matrix(yt_, trans.predict_proba(Xt_).argmax(1), labels=[0, 1, 2]).tolist()
    Xx_, yx_, _ = _load_split("xgb", "test")
    conf["XGBoost"] = confusion_matrix(yx_, xgb.predict_proba(Xx_).argmax(1), labels=[0, 1, 2]).tolist()
    Xk_, yk_, _ = _load_split("kan", "test")
    conf["KAN"] = confusion_matrix(yk_, kan.predict_proba(Xk_).argmax(1), labels=[0, 1, 2]).tolist()
    Xl_, yl_, _ = _load_split("lstm", "test")
    conf["LSTM"] = confusion_matrix(yl_, np.asarray(
        lstm.predict(Xl_, batch_size=512, verbose=0)).argmax(1), labels=[0, 1, 2]).tolist()
    report["confusion_matrices"] = conf

    try:
        names = joblib.load(os.path.join(MODEL_DIR, "xgb_feature_names.pkl"))
        imp = getattr(xgb, "feature_importances_", None)
        if imp is not None and len(imp) == len(names):
            top = sorted(zip(names, imp), key=lambda x: -x[1])[:15]
            mx = max(v for _, v in top) or 1.0
            report["feature_importance"] = [
                {"name": n, "importance": round(float(v / mx * 100), 1)} for n, v in top]
    except Exception as e:
        log.warning(f"feature importance export failed: {e}")

    per_class = f1_score(y_test, ens_preds, average=None, labels=[0, 1, 2], zero_division=0)
    try:
        from utils.db import get_conn, init_db
        init_db()
        with get_conn() as conn:
            conn.execute(
                "INSERT INTO model_performance"
                "(model_name,timestamp,f1_macro,f1_buy,f1_hold,f1_sell,eval_scope)"
                " VALUES(?,?,?,?,?,?,'holdout')",
                ("ensemble", int(time.time()), float(ens_f1),
                 float(per_class[0]), float(per_class[1]), float(per_class[2])))
    except Exception as e:
        log.warning(f"DB write failed: {e}")

    os.makedirs(LOG_DIR, exist_ok=True)
    out_path = os.path.join(LOG_DIR, "ensemble_eval.json")
    with open(out_path, "w") as f:
        json.dump(report, f, indent=2)

    log.info("\n" + json.dumps(report, indent=2))
    log.info(f"Saved: {out_path}")


if __name__ == "__main__":
    main()
