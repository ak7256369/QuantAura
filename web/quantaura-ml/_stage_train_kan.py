# _stage_train_kan.py — Train KAN in an isolated process.
# Loads kan_{train,val,test}_{X,y}.npy → early stopping on VAL (macro-F1) →
# honest metrics on TEST → saves kan_model.pt.

import sys, os, gc, logging
import numpy as np
from pathlib import Path
from sklearn.metrics import f1_score

sys.path.insert(0, str(Path(__file__).resolve().parent))

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
log = logging.getLogger(__name__)


def main():
    log.info("=" * 60)
    log.info("  TRAINING: KAN (Kolmogorov-Arnold Network)")
    log.info("=" * 60)

    from config import MODEL_DIR, PREP_DIR, EPOCHS_FULL, N_KAN_FEATURES
    from utils.db import init_db
    from utils.metrics import evaluate_and_log
    init_db()
    import torch

    log.info("Loading data...")
    X_train = np.load(os.path.join(PREP_DIR, "kan_train_X.npy"))
    y_train = np.load(os.path.join(PREP_DIR, "kan_train_y.npy"))
    X_val   = np.load(os.path.join(PREP_DIR, "kan_val_X.npy"))
    y_val   = np.load(os.path.join(PREP_DIR, "kan_val_y.npy"))
    X_test  = np.load(os.path.join(PREP_DIR, "kan_test_X.npy"))
    y_test  = np.load(os.path.join(PREP_DIR, "kan_test_y.npy"))
    log.info(f"  Train: {X_train.shape} | Val: {X_val.shape} | Test: {X_test.shape}")
    assert X_train.shape[1] == N_KAN_FEATURES, \
        f"Expected {N_KAN_FEATURES} features, got {X_train.shape[1]}"

    log.info("Building KAN model...")
    from models.model_kan import KANClassifier
    clf = KANClassifier()
    log.info(f"  Device: {clf.device}")
    counts = np.bincount(y_train, minlength=3)
    log.info(f"  Label distribution: BUY={counts[0]}, HOLD={counts[1]}, SELL={counts[2]}")

    max_epochs = min(EPOCHS_FULL, 25)   # KAN plateaus by ~epoch 10; pykan epochs are slow
    best_val_f1 = -1.0
    patience, patience_counter = 6, 0

    log.info(f"Training for up to {max_epochs} epochs (mini-batch Adam)...")
    for epoch in range(1, max_epochs + 1):
        train_loss = clf.train_epoch(X_train, y_train)

        preds = np.argmax(clf.predict_proba(X_val), axis=1)
        val_f1 = f1_score(y_val, preds, average="macro", zero_division=0)
        val_acc = (preds == y_val).mean()
        log.info(f"  Epoch {epoch:3d}/{max_epochs} — train_loss: {train_loss:.4f}, "
                 f"val_acc: {val_acc:.4f}, val_f1_macro: {val_f1:.4f}")

        if val_f1 > best_val_f1:
            best_val_f1 = val_f1
            patience_counter = 0
            clf.save()
        else:
            patience_counter += 1
            if patience_counter >= patience:
                log.info(f"  Early stopping at epoch {epoch}")
                break

    # Reload best checkpoint, evaluate on TEST
    clf.load()
    y_pred = np.argmax(clf.predict_proba(X_test), axis=1)
    evaluate_and_log("kan", y_test, y_pred, split="test")
    log.info(f"  Best val macro-F1: {best_val_f1:.4f}")

    # Formula extraction (auto_symbolic over every spline edge) can take hours
    # on CPU — opt in with KAN_EXTRACT_FORMULA=1; the /formula endpoint can
    # also run it on demand.
    if os.environ.get("KAN_EXTRACT_FORMULA") == "1":
        log.info("\nAttempting symbolic formula extraction...")
        formula = clf.get_formula()
        log.info(f"  KAN formula: {formula}")
    else:
        log.info("Skipping symbolic formula extraction (set KAN_EXTRACT_FORMULA=1 to enable)")

    os.makedirs(MODEL_DIR, exist_ok=True)
    log.info(f"  Saved: {os.path.join(MODEL_DIR, 'kan_model.pt')}")

    del clf, X_train, X_val, X_test
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
    log.info("KAN training complete.")


if __name__ == "__main__":
    main()
