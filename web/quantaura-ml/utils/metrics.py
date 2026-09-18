"""Shared evaluation + persistence helpers for the training stages."""
import time
import logging
import numpy as np
from sklearn.metrics import (f1_score, accuracy_score, classification_report,
                             confusion_matrix)

log = logging.getLogger(__name__)
CLASS_NAMES = ["BUY", "HOLD", "SELL"]


def evaluate_and_log(model_name: str, y_true: np.ndarray, y_pred: np.ndarray,
                     split: str = "test") -> dict:
    """
    Print a full evaluation report and persist macro/per-class F1 to the
    model_performance table (which feeds ensemble weights and /stats).
    Returns {"f1_macro", "accuracy", "per_class"}.
    """
    f1_macro  = f1_score(y_true, y_pred, average="macro", zero_division=0)
    acc       = accuracy_score(y_true, y_pred)
    per_class = f1_score(y_true, y_pred, average=None,
                         labels=[0, 1, 2], zero_division=0)

    log.info(f"\n  ── {model_name.upper()} — {split.upper()} EVALUATION ──")
    log.info(f"  Macro F1: {f1_macro:.4f} | Accuracy: {acc:.4f}")
    log.info("\n" + classification_report(
        y_true, y_pred, labels=[0, 1, 2],
        target_names=CLASS_NAMES, zero_division=0))
    log.info(f"  Confusion matrix (rows=true, cols=pred):\n"
             f"{confusion_matrix(y_true, y_pred, labels=[0, 1, 2])}")

    if split == "test":
        try:
            from utils.db import get_conn
            with get_conn() as conn:
                conn.execute(
                    "INSERT INTO model_performance"
                    "(model_name,timestamp,f1_macro,f1_buy,f1_hold,f1_sell) "
                    "VALUES(?,?,?,?,?,?)",
                    (model_name, int(time.time()), float(f1_macro),
                     float(per_class[0]), float(per_class[1]), float(per_class[2]))
                )
        except Exception as e:
            log.warning(f"DB write failed for {model_name}: {e}")

    return {"f1_macro": float(f1_macro), "accuracy": float(acc),
            "per_class": per_class.tolist()}
