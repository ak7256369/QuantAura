import json, time, os, numpy as np
from config import INITIAL_WEIGHTS, WEIGHTS_PATH, NUM_CLASSES

def load_weights() -> dict:
    if os.path.exists(WEIGHTS_PATH):
        with open(WEIGHTS_PATH) as f: return json.load(f)
    return INITIAL_WEIGHTS.copy()

def save_weights(w: dict):
    os.makedirs(os.path.dirname(WEIGHTS_PATH), exist_ok=True)
    with open(WEIGHTS_PATH, "w") as f: json.dump(w, f, indent=2)

MODEL_NAMES = ("lstm", "xgboost", "transformer", "kan")
# Softmax sharpness. 0.02 was inherited from _stage_eval_ensemble.py, where it
# runs once on freshly trained models whose scores sit within ~0.03 of each
# other. Under continuous training the spread grows, and at 0.02 a 0.12 gap
# becomes a 400x weight ratio — winner-take-all, which discards the ensemble.
WEIGHT_TEMPERATURE = 0.05
# No model is ever fully switched off: disagreement between architectures is
# the entire reason to run four of them, and a model that trails on aggregate
# F1 still carries the cases the leader gets wrong.
MIN_WEIGHT = 0.05


def recompute_weights() -> dict:
    """Recalibrate ensemble weights from recent per-model F1.

    Two bugs previously lived here:
      1. The query grouped over EVERY model_name in model_performance, which
         includes the "ensemble" row written by _stage_eval_ensemble.py. That
         phantom entry absorbed ~21% of the weight budget and was handed to a
         model that does not exist at inference time.
      2. Weights were proportional to raw F1. Because all four models score
         0.63-0.75, that produces near-uniform weights (~0.25 each) and throws
         away the calibration — XGBoost at 0.753 got no more say than the LSTM
         at 0.707. The eval stage uses a sharpened softmax; we now match it so
         live serving and reported calibration agree.
    """
    from utils.db import get_conn
    with get_conn() as conn:
        # LATEST HOLDOUT score per model.
        #
        # Calibrating on val is the textbook choice and was the original
        # implementation, but it does not survive continuous training: the
        # acceptance gate selects on val, so every accepted fine-tune nudges a
        # model's val score up. Models whose fine-tunes are accepted often
        # accumulate the most inflation, and XGBoost — evaluate-only, never
        # fine-tuned — cannot move at all. The observed spread was
        #
        #   val:      kan .865  transformer .851  lstm .747  xgboost .745
        #   holdout:  lstm .782  kan .766  xgboost .753  transformer .722
        #
        # — an inverted ranking that handed 0.2% weight to the best model and
        # 34% to the worst. Weighting by inflation is worse than the mild
        # optimism of calibrating on holdout: these are four scalars fit on
        # thousands of rows, and the gate never selects individual models on
        # holdout, so it stays the one comparable cross-model reference.
        # The headline ensemble figure therefore carries a small upward bias;
        # _stage_eval_ensemble.py remains the unbiased evaluation.
        rows = conn.execute(
            "SELECT model_name, f1_macro, MAX(timestamp) FROM model_performance "
            "WHERE eval_scope = 'holdout' AND model_name IN (?,?,?,?) "
            "GROUP BY model_name", MODEL_NAMES
        ).fetchall()
    scores = {r[0]: float(r[1]) for r in rows if r[1] is not None}
    if len(scores) < len(MODEL_NAMES):
        # No holdout history yet (fresh database, or before this split existed).
        # model_weights.json already holds the calibration written by the last
        # full evaluation, which is a better answer than uniform weights.
        existing = load_weights()
        if all(k in existing for k in MODEL_NAMES):
            return existing
        return INITIAL_WEIGHTS.copy()

    f1s = np.array([scores[k] for k in MODEL_NAMES], dtype=float)
    w = np.exp((f1s - f1s.max()) / WEIGHT_TEMPERATURE)
    w = w / w.sum()
    w = np.maximum(w, MIN_WEIGHT)
    w = w / w.sum()
    return {k: round(float(v), 4) for k, v in zip(MODEL_NAMES, w)}

def blend_predictions(proba_dict: dict) -> dict:
    """
    proba_dict = {
        "lstm": [P_buy, P_hold, P_sell],   # shape (3,)
        "transformer": [...], "xgboost": [...], "kan": [...]
    }
    Returns final signal with full breakdown and per-model votes.
    """
    weights  = load_weights()
    classes  = ["BUY", "HOLD", "SELL"]
    blended  = np.zeros(NUM_CLASSES)
    for name, probs in proba_dict.items():
        blended += weights.get(name, 0.25) * np.array(probs)
    blended /= blended.sum()
    best = int(np.argmax(blended))
    return {
        "signal":     classes[best],
        "confidence": round(float(blended[best]) * 100, 1),
        "probs":      [float(blended[i]) for i in range(NUM_CLASSES)],  # unrounded raw vector (for calibration)
        "breakdown":  {c: round(float(blended[i]) * 100, 1) for i, c in enumerate(classes)},
        "per_model":  {n: classes[int(np.argmax(p))] for n, p in proba_dict.items()},
        "weights_used": weights,
    }
