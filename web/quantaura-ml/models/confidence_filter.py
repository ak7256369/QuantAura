"""
QuantAura ML — Confidence-Based Prediction Filter
Filters model predictions to only count those above a confidence threshold.
High-confidence predictions have substantially better F1 scores.

Usage:
    from models.confidence_filter import filter_predictions, compute_filtered_f1
"""
import numpy as np
from sklearn.metrics import f1_score, classification_report


def filter_predictions(
    proba: np.ndarray,
    y_true: np.ndarray,
    threshold: float = 0.55,
) -> dict:
    """
    Filter predictions where max class probability >= threshold.
    Low-confidence samples are defaulted to HOLD (class 1).

    Args:
        proba: shape (n, 3) probability arrays for [BUY, HOLD, SELL]
        y_true: ground truth labels shape (n,)
        threshold: minimum confidence to act on a BUY or SELL prediction

    Returns:
        dict with raw F1, filtered F1, coverage (fraction above threshold),
        and per-class metrics
    """
    n = len(y_true)
    raw_preds = np.argmax(proba, axis=1)
    max_conf  = proba.max(axis=1)

    # Filtered: keep pred only if confidence >= threshold, else default to HOLD
    filtered_preds = np.where(max_conf >= threshold, raw_preds, 1)

    # Coverage: what fraction of predictions are above threshold
    coverage = float((max_conf >= threshold).mean())

    # For BUY/SELL specifically (not HOLD)
    non_hold_mask = raw_preds != 1
    non_hold_conf = max_conf[non_hold_mask]
    non_hold_coverage = float((non_hold_conf >= threshold).mean()) if len(non_hold_conf) > 0 else 0.0

    raw_f1 = f1_score(y_true, raw_preds, average="macro", zero_division=0)
    filtered_f1 = f1_score(y_true, filtered_preds, average="macro", zero_division=0)

    per_class_raw      = f1_score(y_true, raw_preds,      average=None, zero_division=0)
    per_class_filtered = f1_score(y_true, filtered_preds, average=None, zero_division=0)

    return {
        "raw_f1_macro":          round(float(raw_f1), 4),
        "filtered_f1_macro":     round(float(filtered_f1), 4),
        "confidence_threshold":  threshold,
        "coverage_all":          round(coverage, 4),
        "coverage_buy_sell":     round(non_hold_coverage, 4),
        "n_total":               n,
        "n_above_threshold":     int((max_conf >= threshold).sum()),
        "per_class_raw": {
            "BUY":  round(float(per_class_raw[0]), 4),
            "HOLD": round(float(per_class_raw[1]), 4),
            "SELL": round(float(per_class_raw[2]), 4),
        },
        "per_class_filtered": {
            "BUY":  round(float(per_class_filtered[0]), 4),
            "HOLD": round(float(per_class_filtered[1]), 4),
            "SELL": round(float(per_class_filtered[2]), 4),
        },
    }


def compute_filtered_f1(
    proba: np.ndarray,
    y_true: np.ndarray,
    threshold: float = 0.55,
) -> float:
    """Convenience: returns filtered macro F1 only."""
    return filter_predictions(proba, y_true, threshold)["filtered_f1_macro"]


def apply_confidence_gate(
    signal: str,
    confidence: float,
    threshold_pct: float = 55.0,
) -> str:
    """
    For live inference: if a BUY or SELL signal has confidence below threshold,
    override to HOLD. This prevents low-confidence noise trades.

    Args:
        signal: "BUY", "HOLD", or "SELL"
        confidence: 0–100 percentage
        threshold_pct: minimum confidence to pass through BUY/SELL

    Returns:
        Gated signal (may be overridden to "HOLD")
    """
    if signal in ("BUY", "SELL") and confidence < threshold_pct:
        return "HOLD"
    return signal
