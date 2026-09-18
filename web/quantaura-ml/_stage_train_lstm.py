# _stage_train_lstm.py — Train LSTM in an isolated process.
# Loads lstm_{train,val,test}_{X,y}.npy → trains with early stopping on VAL →
# reports honest metrics on the untouched TEST split → saves lstm_model.keras.

import sys, os, gc, logging
import numpy as np
from pathlib import Path
from sklearn.utils.class_weight import compute_class_weight

sys.path.insert(0, str(Path(__file__).resolve().parent))

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
log = logging.getLogger(__name__)

os.environ["TF_CPP_MIN_LOG_LEVEL"] = "2"
os.environ["TF_FORCE_GPU_ALLOW_GROWTH"] = "true"


def main():
    log.info("=" * 60)
    log.info("  TRAINING: LSTM (Bidirectional + Bahdanau Attention)")
    log.info("=" * 60)

    from config import BATCH_SIZE, EPOCHS_FULL, MODEL_DIR, PREP_DIR
    from utils.db import init_db
    from utils.metrics import evaluate_and_log
    init_db()

    log.info("Loading data...")
    X_train = np.load(os.path.join(PREP_DIR, "lstm_train_X.npy"), mmap_mode="r")
    y_train = np.load(os.path.join(PREP_DIR, "lstm_train_y.npy"))
    X_val   = np.load(os.path.join(PREP_DIR, "lstm_val_X.npy"))
    y_val   = np.load(os.path.join(PREP_DIR, "lstm_val_y.npy"))
    X_test  = np.load(os.path.join(PREP_DIR, "lstm_test_X.npy"))
    y_test  = np.load(os.path.join(PREP_DIR, "lstm_test_y.npy"))
    log.info(f"  Train: {X_train.shape} | Val: {X_val.shape} | Test: {X_test.shape}")

    import tensorflow as tf
    for gpu in tf.config.list_physical_devices("GPU"):
        tf.config.experimental.set_memory_growth(gpu, True)

    from models.model_lstm import build_lstm_model
    model = build_lstm_model()
    model.summary(print_fn=log.info)

    # Select the checkpoint on VAL MACRO-F1, not val_loss.
    #
    # Everything else in this project — the transformer and KAN stages, the
    # autopilot's accept/reject gate, the ensemble weighting, the number the
    # site publishes — is macro-F1. The LSTM alone stopped on val_loss, so it
    # kept whichever epoch minimised class-weighted cross-entropy. Those are
    # not the same epoch: loss is dominated by confidence on the majority
    # class, while macro-F1 weights all three regimes equally, so an epoch that
    # grows confident on HOLD can improve loss while losing BUY/SELL recall.
    # It stopped at epoch 11 of 100 on the 2026-08-08 retrain and scored 0.6833
    # on test — the only model that regressed against the previous weights.
    #
    # Keras has no built-in macro-F1 for a sparse-label 3-class head, hence the
    # callback. It logs val_f1_macro so the LSTM's training log reads like the
    # torch stages'.
    from sklearn.metrics import f1_score

    class ValMacroF1(tf.keras.callbacks.Callback):
        def __init__(self, X, y):
            super().__init__()
            self.X, self.y = X, y

        def on_epoch_end(self, epoch, logs=None):
            preds = np.argmax(self.model.predict(self.X, batch_size=512, verbose=0), axis=1)
            f1 = f1_score(self.y, preds, average="macro", zero_division=0)
            (logs if logs is not None else {})["val_f1_macro"] = f1
            log.info(f"  Epoch {epoch + 1}: val_f1_macro={f1:.4f}")

    callbacks = [
        ValMacroF1(X_val, y_val),
        tf.keras.callbacks.EarlyStopping(
            monitor="val_f1_macro", mode="max", patience=12,
            restore_best_weights=True),
        # The LR schedule follows the same signal as the stopping rule, so it
        # cannot decay on a metric the run is not being judged by.
        tf.keras.callbacks.ReduceLROnPlateau(
            monitor="val_f1_macro", mode="max", factor=0.5, patience=4,
            min_lr=1e-6),
    ]

    classes = np.unique(y_train)
    cw_vals = compute_class_weight("balanced", classes=classes, y=y_train)
    class_weight = {int(c): float(w) for c, w in zip(classes, cw_vals)}
    log.info(f"  Class weights: {class_weight}")

    log.info(f"Training for up to {EPOCHS_FULL} epochs (batch_size={BATCH_SIZE})...")
    model.fit(
        X_train, y_train,
        validation_data=(X_val, y_val),
        epochs=EPOCHS_FULL,
        batch_size=BATCH_SIZE,
        callbacks=callbacks,
        class_weight=class_weight,
        verbose=2,
    )

    # Honest evaluation on untouched test split
    y_pred = np.argmax(model.predict(X_test, batch_size=256, verbose=0), axis=1)
    evaluate_and_log("lstm", y_test, y_pred, split="test")

    save_path = os.path.join(MODEL_DIR, "lstm_model.keras")
    os.makedirs(MODEL_DIR, exist_ok=True)
    model.save(save_path)
    log.info(f"  Saved: {save_path}")

    del model, X_train, X_val, X_test
    tf.keras.backend.clear_session()
    gc.collect()
    log.info("LSTM training complete.")


if __name__ == "__main__":
    main()
