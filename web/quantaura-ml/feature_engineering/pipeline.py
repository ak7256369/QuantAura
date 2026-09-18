"""
Shared feature pipeline — the SINGLE source of truth for turning raw market
data into model-ready frames. Used by _stage_collect.py (initial training),
autopilot.py (continuous fine-tuning), serve.py (live inference) and
backtest.py, so training and serving can never drift apart.

Design rules:
  * All features are scale-free (see technical.py).
  * Historical series only — macro, fear&greed and funding are aligned to each
    candle's own date. Current-value scalars are NEVER broadcast over history
    (the old pipeline stamped today's fear&greed onto 6 months of candles).
  * Everything is built per symbol. Rolling windows and sequences never cross
    symbol boundaries.
"""
import logging
import numpy as np
import pandas as pd

from config import (
    FUTURES_SYMBOLS, LOOKBACK_DAYS_1H, LOOKBACK_DAYS_4H,
    LSTM_FEATURES, TRANSFORMER_FEATURES, KAN_FEATURES,
)
from data_sources.binance_spot import fetch_ohlcv
from data_sources.binance_futures import fetch_funding_rate
from feature_engineering.technical import add_1h_features, add_4h_features, add_btc_context
from feature_engineering.labels import generate_labels, broadcast_4h_labels_to_1h

log = logging.getLogger(__name__)

# Macro columns consumed by the models (historical daily series, ffilled to 4h)
MACRO_MODEL_COLS = [
    "fed_funds_rate", "cpi_yoy", "unemployment_rate",
    "dxy_return", "dxy_weekly_return",
    "sp500_return", "sp500_weekly_return",
    "fear_greed",
]


def fetch_btc_context(days_1h: int = LOOKBACK_DAYS_1H,
                      days_4h: int = LOOKBACK_DAYS_4H) -> dict:
    """Fetch BTC 1h + 4h OHLCV once; passed to every symbol's build."""
    return {
        "btc_1h": fetch_ohlcv("BTCUSDT", "1h", days=days_1h),
        "btc_4h": fetch_ohlcv("BTCUSDT", "4h", days=days_4h),
    }


def _merge_funding(df_4h: pd.DataFrame, symbol: str, days: int) -> pd.DataFrame:
    """Merge full-history funding rate (8h cadence → ffill to 4h candles)."""
    df_4h = df_4h.copy()
    if symbol not in FUTURES_SYMBOLS:
        df_4h["funding_rate"] = 0.0
        df_4h["funding_rate_7d_mean"] = 0.0
        return df_4h
    try:
        fund = fetch_funding_rate(symbol, days=days)
        if fund.empty:
            raise ValueError("empty funding history")
        fund = fund.sort_values("timestamp")
        fund["funding_rate_7d_mean"] = fund["funding_rate"].rolling(21, min_periods=1).mean()
        idx = fund.set_index("timestamp")
        for col in ("funding_rate", "funding_rate_7d_mean"):
            df_4h[col] = (idx[col].reindex(df_4h["timestamp"], method="ffill")
                          .fillna(0).values)
    except Exception as e:
        log.warning(f"[{symbol}] funding fetch failed: {e}")
        df_4h["funding_rate"] = 0.0
        df_4h["funding_rate_7d_mean"] = 0.0
    return df_4h


DAILY_TREND_COLS = ["price_vs_50d_ma", "price_vs_200d_ma", "daily_rsi_14", "golden_cross"]


def _merge_daily_trend(df_4h: pd.DataFrame, symbol: str, days: int) -> pd.DataFrame:
    """Long-term trend context from daily candles (scale-free), ffilled to 4h.
    Daily values are lagged one day so a 4h candle never sees its own day's
    (still-forming) daily close."""
    from config import LOOKBACK_DAYS_1D
    df_4h = df_4h.copy()
    try:
        dd = fetch_ohlcv(symbol, "1d", days=max(days + 220, LOOKBACK_DAYS_1D))
        dc = dd["close"]
        ma50  = dc.rolling(50,  min_periods=10).mean()
        ma200 = dc.rolling(200, min_periods=50).mean()
        delta = dc.diff()
        gain  = delta.clip(lower=0).rolling(14, min_periods=5).mean()
        loss  = (-delta.clip(upper=0)).rolling(14, min_periods=5).mean()
        rs    = gain / loss.replace(0, np.nan)
        dd["daily_rsi_14"]     = (100 - (100 / (1 + rs))) / 100.0
        dd["price_vs_50d_ma"]  = (dc / ma50.replace(0, np.nan) - 1)
        dd["price_vs_200d_ma"] = (dc / ma200.replace(0, np.nan) - 1)
        dd["golden_cross"]     = (ma50 > ma200).astype(float)
        # Lag one day: value known at day d is applied to candles on day d+1
        day_ms = 24 * 3600 * 1000
        dd["apply_ts"] = (dd["timestamp"] // day_ms) * day_ms + day_ms
        idx = dd.drop_duplicates("apply_ts", keep="last").set_index("apply_ts")
        cand_day = (df_4h["timestamp"] // day_ms) * day_ms
        for col in DAILY_TREND_COLS:
            df_4h[col] = (idx[col].reindex(cand_day, method="ffill")
                          .fillna(0).values)
    except Exception as e:
        log.warning(f"[{symbol}] daily trend features failed: {e}")
        for col in DAILY_TREND_COLS:
            df_4h[col] = 0.0
    return df_4h


def _merge_macro(df_4h: pd.DataFrame, macro_df: pd.DataFrame) -> pd.DataFrame:
    """Align daily macro series to 4h candles by date (ffill, no look-ahead)."""
    from data_sources.macro_fred import align_macro_to_timestamps
    df_4h = df_4h.copy()
    if macro_df is None or macro_df.empty:
        for col in MACRO_MODEL_COLS:
            df_4h[col] = 0.0
        return df_4h
    aligned = align_macro_to_timestamps(df_4h["timestamp"], macro_df)
    for col in MACRO_MODEL_COLS:
        df_4h[col] = aligned[col].values if col in aligned.columns else 0.0
    return df_4h


def build_symbol_frames(symbol: str,
                        macro_df: pd.DataFrame,
                        btc_ctx: dict,
                        days_1h: int = LOOKBACK_DAYS_1H,
                        days_4h: int = LOOKBACK_DAYS_4H,
                        with_labels: bool = True,
                        df_1h_raw: pd.DataFrame | None = None,
                        df_4h_raw: pd.DataFrame | None = None) -> dict | None:
    """
    Full per-symbol feature build.
    Returns {"df_1h": ..., "df_4h": ...} with every LSTM/TRANSFORMER/KAN
    feature column present (plus label columns when with_labels=True),
    or None when data could not be fetched.
    """
    try:
        df_1h = df_1h_raw if df_1h_raw is not None else fetch_ohlcv(symbol, "1h", days=days_1h)
        df_4h = df_4h_raw if df_4h_raw is not None else fetch_ohlcv(symbol, "4h", days=days_4h)
    except Exception as e:
        log.warning(f"[{symbol}] OHLCV fetch failed: {e}")
        return None
    if df_1h is None or df_4h is None or df_1h.empty or df_4h.empty:
        return None

    df_1h = add_1h_features(df_1h)
    df_4h = add_4h_features(df_4h)

    # Market-leader context (BTC returns + relative strength)
    df_1h = add_btc_context(df_1h, btc_ctx["btc_1h"], horizons=(1, 6))
    df_4h = add_btc_context(df_4h, btc_ctx["btc_4h"], horizons=(1, 6, 42))

    # Historical macro + fear&greed, full-history funding, daily trend context
    df_4h = _merge_macro(df_4h, macro_df)
    df_4h = _merge_funding(df_4h, symbol, days=days_4h)
    df_4h = _merge_daily_trend(df_4h, symbol, days=days_4h)

    if with_labels:
        df_4h = generate_labels(df_4h)
        df_1h = broadcast_4h_labels_to_1h(df_4h, df_1h)

    # Drop indicator warm-up NaNs, guarantee every model column exists
    needed_4h = set(TRANSFORMER_FEATURES) | set(KAN_FEATURES)
    for col in needed_4h:
        if col not in df_4h.columns:
            log.warning(f"[{symbol}] 4h feature '{col}' missing — zero-filled "
                        f"(check for a feature-name typo in config)")
            df_4h[col] = 0.0
    for col in LSTM_FEATURES:
        if col not in df_1h.columns:
            log.warning(f"[{symbol}] 1h feature '{col}' missing — zero-filled "
                        f"(check for a feature-name typo in config)")
            df_1h[col] = 0.0

    subset_4h = list(needed_4h) + (["label"] if with_labels else [])
    subset_1h = LSTM_FEATURES + (["label"] if with_labels else [])
    df_4h = df_4h.dropna(subset=[c for c in subset_4h if c in df_4h.columns]).reset_index(drop=True)
    df_1h = df_1h.dropna(subset=[c for c in subset_1h if c in df_1h.columns]).reset_index(drop=True)

    if df_4h.empty or df_1h.empty:
        return None
    return {"df_1h": df_1h, "df_4h": df_4h}


def temporal_split_indices(n: int, train_frac: float, val_frac: float,
                           purge: int) -> tuple:
    """
    Per-symbol temporal split with purge gaps.
    Returns (train_end, val_start, val_end, test_start) row indices such that
    `purge` rows are DISCARDED at each boundary — forward-looking labels can
    never straddle a split.
    """
    train_end  = int(n * train_frac)
    val_end    = int(n * (train_frac + val_frac))
    val_start  = min(train_end + purge, n)
    test_start = min(val_end + purge, n)
    return train_end, val_start, val_end, test_start


def make_sequences(arr: np.ndarray, labels: np.ndarray, seq_len: int,
                   start: int, end: int) -> tuple:
    """
    Sequences for rows in [start, end): X[i] = arr[i-seq_len+1 : i+1] (window
    ENDS on row i — the label's base candle, whose features are fully known at
    its close), y[i] = label[i]. The lookback window may reach BEFORE `start`
    (past data is always allowed); the label index never leaves the split.
    Matches serving, which feeds the last seq_len completed candles.
    """
    X, y, idx = [], [], []
    lo = max(start, seq_len - 1)
    for i in range(lo, min(end, len(arr))):
        X.append(arr[i - seq_len + 1:i + 1])
        y.append(labels[i])
        idx.append(i)
    if not X:
        return (np.empty((0, seq_len, arr.shape[1]), np.float32),
                np.empty((0,), np.int64), np.empty((0,), np.int64))
    return (np.asarray(X, np.float32), np.asarray(y, np.int64),
            np.asarray(idx, np.int64))
