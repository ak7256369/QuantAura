# _stage_train_xgboost.py — Train XGBoost in an isolated process.
# Loads xgb_{train,val,test}_{X,y}.npy → early stopping on VAL → honest
# metrics on TEST → saves xgb_model.pkl.

import sys, os, gc, logging
import numpy as np
from pathlib import Path
from sklearn.utils.class_weight import compute_sample_weight

sys.path.insert(0, str(Path(__file__).resolve().parent))

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
log = logging.getLogger(__name__)


def main():
    log.info("=" * 60)
    log.info("  TRAINING: XGBoost (Gradient Boosted Trees)")
    log.info("=" * 60)

    from config import MODEL_DIR, PREP_DIR
    from models.model_xgboost import build_xgb_model, save_xgb
    from utils.db import init_db
    from utils.metrics import evaluate_and_log
    init_db()

    log.info("Loading data...")
    X_train = np.load(os.path.join(PREP_DIR, "xgb_train_X.npy"))
    y_train = np.load(os.path.join(PREP_DIR, "xgb_train_y.npy"))
    X_val   = np.load(os.path.join(PREP_DIR, "xgb_val_X.npy"))
    y_val   = np.load(os.path.join(PREP_DIR, "xgb_val_y.npy"))
    X_test  = np.load(os.path.join(PREP_DIR, "xgb_test_X.npy"))
    y_test  = np.load(os.path.join(PREP_DIR, "xgb_test_y.npy"))
    log.info(f"  Train: {X_train.shape} | Val: {X_val.shape} | Test: {X_test.shape}")

    log.info("Building XGBoost model...")
    model = build_xgb_model()

    sample_weight = compute_sample_weight("balanced", y_train)
    classes, counts = np.unique(y_train, return_counts=True)
    log.info(f"  Label distribution: { {['BUY','HOLD','SELL'][c]: int(n) for c, n in zip(classes, counts)} }")

    log.info("Training (early stopping on validation set)...")
    model.fit(
        X_train, y_train,
        sample_weight=sample_weight,
        eval_set=[(X_val, y_val)],
        verbose=50,
    )
    log.info(f"  Best iteration: {getattr(model, 'best_iteration', 'n/a')}")

    # Honest evaluation on untouched test split
    y_pred = model.predict(X_test)
    evaluate_and_log("xgboost", y_test, y_pred, split="test")

    os.makedirs(MODEL_DIR, exist_ok=True)
    save_xgb(model)
    log.info(f"  Saved: {os.path.join(MODEL_DIR, 'xgb_model.pkl')}")

    del model, X_train, X_val, X_test
    gc.collect()
    log.info("XGBoost training complete.")


if __name__ == "__main__":
    main()
