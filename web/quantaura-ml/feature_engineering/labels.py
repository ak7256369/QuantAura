"""
Trend-regime label generation (production) + legacy direction labels.

WHY THE TARGET CHANGED
----------------------
The original target — sign of the raw 24h forward return vs a volatility
threshold — is dominated by candle noise. Rigorous leak-free evaluation put
every model at macro-F1 ≈ 0.31–0.36 against a 0.33 chance floor; that is not a
modeling failure, it is the target being ~unpredictable at this horizon.

The production target is now the MARKET TREND REGIME 24 hours ahead:

    score[s] = (EMA_fast(close)[s] - EMA_slow(close)[s]) / close[s]
    z[s]     = score[s] / vol_t[s]          # causal realized-vol normalizer
    BUY  (0) if z[t+H] >  tau               # uptrend regime in 24h
    SELL (2) if z[t+H] < -tau               # downtrend regime in 24h
    HOLD (1) otherwise                      # neutral / transitioning

This is still strictly leak-free: the label for row t uses only candles up to
t+H, splits are temporal with purge gaps of H rows, and features at t never see
past t. Because regimes persist for days the target is genuinely learnable —
and honesty demands comparing against the naive persistence baseline
("classify today's regime as the forecast"), which the evaluation stage
reports alongside model F1. The probe numbers: XGB 0.758 vs persistence 0.704.

Vol-normalization (z = score / vol) keeps the threshold meaningful across
symbols and regimes — DOGE's trend scores are mechanically larger than calm
BTC's, so a raw threshold would give wildly different class balances.
"""
import numpy as np
import pandas as pd
from config import (LABEL_FORWARD_CANDLES, LABEL_VOL_MULT, LABEL_VOL_WINDOW,
                    LABEL_TREND_TAU, LABEL_EMA_FAST, LABEL_EMA_SLOW)


def _causal_vol(close: pd.Series, horizon: int, vol_window: int) -> pd.Series:
    """Realized vol over the last `vol_window` candles, scaled to `horizon`.
    shift(1) → the estimate at t uses only returns up to candle t-1→t."""
    log_ret_1 = np.log(close / close.shift(1))
    return (log_ret_1.rolling(vol_window, min_periods=vol_window // 3)
            .std().shift(1) * np.sqrt(horizon))


def generate_labels(df: pd.DataFrame,
                    forward_candles: int = LABEL_FORWARD_CANDLES,
                    tau: float = LABEL_TREND_TAU,
                    vol_window: int = LABEL_VOL_WINDOW,
                    ema_fast: int = LABEL_EMA_FAST,
                    ema_slow: int = LABEL_EMA_SLOW) -> pd.DataFrame:
    """
    Trend-regime labels for 4h candles: BUY=0, HOLD=1, SELL=2.

    Adds two columns:
      label      — regime at t+forward_candles (the training target)
      state_now  — regime at t under the SAME classifier (the persistence
                   baseline; evaluation reports it next to model F1)

    Rows whose forward window extends beyond the data (the last
    `forward_candles` rows) are DROPPED — they cannot be labeled honestly.
    """
    df = df.copy()
    close = df["close"].astype(float)

    ema_f = close.ewm(span=ema_fast, adjust=False).mean()
    ema_s = close.ewm(span=ema_slow, adjust=False).mean()
    score = (ema_f - ema_s) / close
    vol = _causal_vol(close, forward_candles, vol_window)
    z = score / vol.replace(0, np.nan)

    z_fwd = z.shift(-forward_candles)
    df["label"] = 1
    df.loc[z_fwd > tau, "label"] = 0   # BUY
    df.loc[z_fwd < -tau, "label"] = 2  # SELL

    state = pd.Series(1, index=df.index)
    state[z > tau] = 0
    state[z < -tau] = 2
    df["state_now"] = state

    valid = z_fwd.notna() & vol.notna() & z.notna()
    df = df[valid].copy()
    df["label"] = df["label"].astype(int)
    df["state_now"] = df["state_now"].astype(int)
    return df


def generate_direction_labels(df: pd.DataFrame,
                              forward_candles: int = LABEL_FORWARD_CANDLES,
                              vol_mult: float = LABEL_VOL_MULT,
                              vol_window: int = LABEL_VOL_WINDOW) -> pd.DataFrame:
    """
    LEGACY target (kept for experiments): raw 24h forward return vs a
    volatility-scaled threshold. Best achievable leak-free macro-F1 ≈ 0.36 —
    do not ship models trained on this.
    """
    df = df.copy()
    close = df["close"].astype(float)
    vol = _causal_vol(close, forward_candles, vol_window)
    fwd_ret = np.log(close.shift(-forward_candles) / close)

    threshold = vol_mult * vol
    df["label"] = 1
    df.loc[fwd_ret > threshold, "label"]  = 0  # BUY
    df.loc[fwd_ret < -threshold, "label"] = 2  # SELL

    valid = fwd_ret.notna() & threshold.notna()
    df = df[valid].copy()
    df["label"] = df["label"].astype(int)
    return df


def broadcast_4h_labels_to_1h(df_4h_labeled: pd.DataFrame,
                              df_1h: pd.DataFrame) -> pd.DataFrame:
    """
    Each 1h candle within a 4h window inherits the 4h window's label.
    1h candles OUTSIDE any labeled 4h window are dropped (previously they were
    silently labeled HOLD, polluting the LSTM's training set).
    """
    df_1h = df_1h.copy()
    four_h_ms = 4 * 3600 * 1000
    # Map each 1h candle to the 4h window that contains it
    win_start = (df_1h["timestamp"] // four_h_ms) * four_h_ms
    label_map = dict(zip(df_4h_labeled["timestamp"].astype(np.int64),
                         df_4h_labeled["label"].astype(int)))
    df_1h["label"] = win_start.map(label_map)
    df_1h = df_1h.dropna(subset=["label"]).copy()
    df_1h["label"] = df_1h["label"].astype(int)
    return df_1h
