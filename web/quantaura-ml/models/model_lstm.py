# Input: 1h sequences, shape (batch, LSTM_SEQ_LEN=48, N_LSTM_FEATURES from config)
# Architecture: Bidirectional LSTM → BatchNorm → Bahdanau attention → Dense → Softmax
# Why Bidirectional: learns both forward (trend) and backward (pattern completion).
# Why attention: not all 48 timesteps matter equally. Attention weights focus on key events.
# Why BatchNorm: stabilizes training during fine-tuning, prevents internal covariate shift.
import os, numpy as np, tensorflow as tf
from config import (LSTM_SEQ_LEN, N_LSTM_FEATURES, LSTM_UNITS,
                    LSTM_DROPOUT, LSTM_ATTN_UNITS, NUM_CLASSES, MODEL_DIR,
                    LSTM_LR, LSTM_FINETUNE_LR)


@tf.keras.utils.register_keras_serializable(package="quantaura")
class ReduceSumLayer(tf.keras.layers.Layer):
    """Sums across the time axis (axis=1).
    Replaces tf.keras.layers.Lambda(lambda t: tf.reduce_sum(t, axis=1))
    because Keras 3 cannot infer Lambda output shapes and refuses to
    serialize/deserialize them. This custom layer provides explicit
    compute_output_shape, making build/save/load fully reliable."""

    def call(self, x):
        return tf.reduce_sum(x, axis=1)

    def compute_output_shape(self, input_shape):
        # (batch, timesteps, features) → (batch, features)
        return (input_shape[0], input_shape[2])


def build_lstm_model() -> tf.keras.Model:
    inp = tf.keras.Input(shape=(LSTM_SEQ_LEN, N_LSTM_FEATURES))

    x = tf.keras.layers.Bidirectional(
        tf.keras.layers.LSTM(LSTM_UNITS, return_sequences=True, dropout=LSTM_DROPOUT)
    )(inp)
    x = tf.keras.layers.BatchNormalization()(x)
    x = tf.keras.layers.Bidirectional(
        tf.keras.layers.LSTM(LSTM_UNITS // 2, return_sequences=True, dropout=LSTM_DROPOUT)
    )(x)
    x = tf.keras.layers.BatchNormalization()(x)

    # Bahdanau attention: learn which timesteps to focus on
    score   = tf.keras.layers.Dense(LSTM_ATTN_UNITS, activation="tanh")(x)
    score   = tf.keras.layers.Dense(1)(score)
    weights = tf.keras.layers.Softmax(axis=1)(score)
    context = tf.keras.layers.Multiply()([x, weights])
    context = ReduceSumLayer()(context)  # was: Lambda(lambda t: tf.reduce_sum(t, axis=1))

    x   = tf.keras.layers.Dense(64, activation="relu")(context)
    x   = tf.keras.layers.Dropout(LSTM_DROPOUT)(x)
    out = tf.keras.layers.Dense(NUM_CLASSES, activation="softmax")(x)

    model = tf.keras.Model(inputs=inp, outputs=out)
    model.compile(optimizer=tf.keras.optimizers.Adam(LSTM_LR),
                  loss="sparse_categorical_crossentropy", metrics=["accuracy"])
    return model


def load_lstm_model():
    """Rebuild architecture from code + load weights.

    If the weights don't match the architecture (feature count or seq_len
    changed), returns a FRESH, UNTRAINED model rather than crashing — training
    entry points rely on that to bootstrap. Callers that serve predictions must
    check `model.weights_loaded`: an untrained model happily returns confident-
    looking softmax output that is pure noise.
    """
    path = os.path.join(MODEL_DIR, "lstm_model.keras")
    model = build_lstm_model()
    model.weights_loaded = False
    try:
        model.load_weights(path)
        model.weights_loaded = True
    except Exception as e:
        print(f"[LSTM] Weight load failed ({e}), starting fresh model")
    return model

def save_lstm_model(m): m.save(os.path.join(MODEL_DIR, "lstm_model.keras"))
