# _stage_train_transformer.py — Train Transformer in an isolated process.
# Loads trans_{train,val,test}_{X,y}.npy → early stopping on VAL (macro-F1) →
# honest metrics on TEST → saves transformer_model.pt.

import sys, os, gc, logging
import numpy as np
from pathlib import Path
from sklearn.utils.class_weight import compute_class_weight
from sklearn.metrics import f1_score

sys.path.insert(0, str(Path(__file__).resolve().parent))

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
log = logging.getLogger(__name__)


def main():
    log.info("=" * 60)
    log.info("  TRAINING: Transformer (Pre-norm MHA + CLS token)")
    log.info("=" * 60)

    from config import BATCH_SIZE, EPOCHS_FULL, MODEL_DIR, PREP_DIR, LEARNING_RATE
    from utils.db import init_db
    from utils.metrics import evaluate_and_log
    init_db()

    import torch
    import torch.nn as nn
    from torch.utils.data import TensorDataset, DataLoader

    log.info("Loading data...")
    X_train = np.load(os.path.join(PREP_DIR, "trans_train_X.npy"))
    y_train = np.load(os.path.join(PREP_DIR, "trans_train_y.npy"))
    X_val   = np.load(os.path.join(PREP_DIR, "trans_val_X.npy"))
    y_val   = np.load(os.path.join(PREP_DIR, "trans_val_y.npy"))
    X_test  = np.load(os.path.join(PREP_DIR, "trans_test_X.npy"))
    y_test  = np.load(os.path.join(PREP_DIR, "trans_test_y.npy"))
    log.info(f"  Train: {X_train.shape} | Val: {X_val.shape} | Test: {X_test.shape}")

    classes = np.unique(y_train)
    cw_vals = compute_class_weight("balanced", classes=classes, y=y_train)
    log.info(f"  Class weights: { {['BUY','HOLD','SELL'][int(c)]: round(float(w),3) for c,w in zip(classes, cw_vals)} }")
    counts = np.bincount(y_train, minlength=3)
    log.info(f"  Label distribution: BUY={counts[0]}, HOLD={counts[1]}, SELL={counts[2]}")

    train_ds = TensorDataset(torch.FloatTensor(X_train), torch.LongTensor(y_train))
    val_ds   = TensorDataset(torch.FloatTensor(X_val),   torch.LongTensor(y_val))
    del X_train, X_val
    gc.collect()

    train_loader = DataLoader(train_ds, batch_size=BATCH_SIZE, shuffle=True, drop_last=True)
    val_loader   = DataLoader(val_ds, batch_size=256, shuffle=False)

    log.info("Building Transformer model...")
    from models.model_transformer import TransformerClassifier
    clf = TransformerClassifier()
    device = clf.device
    clf.criterion = nn.CrossEntropyLoss(
        weight=torch.FloatTensor(cw_vals).to(device), label_smoothing=0.1)
    # Scheduler horizon = actual training epochs (a stale T_max was one of the
    # old bugs — LR decayed to ~0 before fine-tuning even started)
    clf.optimizer = torch.optim.AdamW(clf.model.parameters(),
                                      lr=LEARNING_RATE, weight_decay=1e-4)
    clf.scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(
        clf.optimizer, T_max=EPOCHS_FULL, eta_min=1e-6)
    log.info(f"  Device: {device}")
    log.info(f"  Parameters: {sum(p.numel() for p in clf.model.parameters()):,}")

    best_val_f1 = -1.0
    patience, patience_counter = 12, 0

    log.info(f"Training for up to {EPOCHS_FULL} epochs (batch_size={BATCH_SIZE})...")
    for epoch in range(1, EPOCHS_FULL + 1):
        clf.model.train()
        train_losses = []
        for batch_X, batch_y in train_loader:
            batch_X, batch_y = batch_X.to(device), batch_y.to(device)
            clf.optimizer.zero_grad()
            loss = clf.criterion(clf.model(batch_X), batch_y)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(clf.model.parameters(), 1.0)
            clf.optimizer.step()
            train_losses.append(loss.item())
        clf.scheduler.step()

        # Validation (loss + macro F1 in one pass)
        clf.model.eval()
        val_losses, val_preds, val_true = [], [], []
        with torch.no_grad():
            for batch_X, batch_y in val_loader:
                batch_X = batch_X.to(device)
                logits = clf.model(batch_X)
                val_losses.append(clf.criterion(logits, batch_y.to(device)).item())
                val_preds.extend(logits.argmax(dim=1).cpu().numpy())
                val_true.extend(batch_y.numpy())
        val_f1 = f1_score(val_true, val_preds, average="macro", zero_division=0)

        log.info(f"  Epoch {epoch:3d}/{EPOCHS_FULL} — "
                 f"train_loss: {np.mean(train_losses):.4f}, "
                 f"val_loss: {np.mean(val_losses):.4f}, val_f1_macro: {val_f1:.4f}")

        if val_f1 > best_val_f1:
            best_val_f1 = val_f1
            patience_counter = 0
            clf.save()
        else:
            patience_counter += 1
            if patience_counter >= patience:
                log.info(f"  Early stopping at epoch {epoch} (patience={patience})")
                break

    # Reload best checkpoint and evaluate on TEST
    clf.load()
    y_pred = np.argmax(clf.predict_proba(X_test), axis=1)
    evaluate_and_log("transformer", y_test, y_pred, split="test")
    log.info(f"  Best val macro-F1: {best_val_f1:.4f}")
    log.info(f"  Saved: {clf.save_path}")

    del clf, train_ds, val_ds, train_loader, val_loader, X_test
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
    log.info("Transformer training complete.")


if __name__ == "__main__":
    main()
