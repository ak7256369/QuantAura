"""
XGBoost feature matrix builder.

MUST be called per symbol — rolling statistics computed over concatenated
multi-symbol frames bleed across symbol boundaries and corrupt the features.

All ranks/percentiles are ROLLING (causal). The old implementation used
rank(pct=True) over the whole dataset, which leaks the future distribution
into every training row.
"""
import pandas as pd, numpy as np
from typing import Tuple, List


def _rolling_stats(series: pd.Series, windows: list, prefix: str) -> dict:
    """Mean, std, momentum over multiple rolling windows (scale-free inputs)."""
    out = {}
    for w in windows:
        r = series.rolling(w, min_periods=1)
        out[f"{prefix}_mean_{w}"]     = r.mean().values
        out[f"{prefix}_std_{w}"]      = r.std().fillna(0).values
        out[f"{prefix}_momentum_{w}"] = (series - r.mean()).fillna(0).values
    return out


def build_xgb_features(df_1h: pd.DataFrame,
                       df_4h: pd.DataFrame) -> Tuple[np.ndarray, List[str]]:
    """
    Builds the flat XGBoost feature matrix for ONE symbol.
    Returns: (matrix shape (len(df_4h), ~90), feature_names)
    1h features are subsampled to 4h cadence (closing 1h candle of each window).
    """
    feats = {}
    n = len(df_4h)
    hour_ms = 3600 * 1000
    # The last completed 1h candle inside 4h window [t, t+4h) opens at t+3h.
    _target_ts = df_4h["timestamp"].values + 3 * hour_ms
    _ts_1h = df_1h["timestamp"].values

    def _align_1h(arr):
        """Align a 1h-cadence array to 4h rows by TIMESTAMP (ffill)."""
        s = pd.Series(arr, index=_ts_1h)
        return s.reindex(_target_ts, method="ffill").fillna(0).values

    # ── A. CURRENT STATE SNAPSHOT (4h, all scale-free) ───────────────────────
    for col in ["rsi_14", "stoch_rsi", "macd_norm", "macd_signal_norm",
                "macd_hist_norm", "bb_width", "bb_position", "ema_cross",
                "trend_z", "ema_12_dist", "ema_26_dist", "atr_pct",
                "volume_ratio_20", "volume_zscore",
                "taker_buy_ratio_c", "trades_ratio",
                "ichimoku_conv_dist", "ichimoku_base_dist",
                "high_low_range", "candle_body_ratio",
                "upper_wick_ratio", "lower_wick_ratio"]:
        if col in df_4h.columns:
            feats[f"snap_{col}"] = df_4h[col].fillna(0).values

    if "close" in df_4h.columns:
        close = df_4h["close"]
        # Price relative to its own rolling averages — scale-free by design
        feats["price_vs_20d"]   = (close / close.rolling(120,  min_periods=1).mean().replace(0, np.nan) - 1).fillna(0).values
        feats["price_vs_90d"]   = (close / close.rolling(540,  min_periods=1).mean().replace(0, np.nan) - 1).fillna(0).values
        feats["price_vs_200d"]  = (close / close.rolling(1200, min_periods=1).mean().replace(0, np.nan) - 1).fillna(0).values
        feats["drawdown_peak"]  = (close / close.rolling(2190, min_periods=1).max().replace(0, np.nan) - 1).fillna(0).values

    # ── B. ROLLING STATISTICS — 4H TIMEFRAME ─────────────────────────────────
    # Windows (4h candles): 6=1d, 12=2d, 24=4d, 42=1wk, 168=4wk
    ret_4h = df_4h["close"].pct_change().fillna(0)
    feats.update(_rolling_stats(ret_4h, [6, 12, 24, 42, 168], "ret4h"))
    if "volume_ratio_20" in df_4h.columns:
        feats.update(_rolling_stats(df_4h["volume_ratio_20"].fillna(1), [6, 24, 42], "vol4h"))
    if "rsi_14" in df_4h.columns:
        feats.update(_rolling_stats(df_4h["rsi_14"].fillna(0.5), [6, 12, 24], "rsi4h"))
    if "taker_buy_ratio_c" in df_4h.columns:
        feats.update(_rolling_stats(df_4h["taker_buy_ratio_c"].fillna(0.5), [6, 24], "taker4h"))

    # ── C. ROLLING STATISTICS — 1H TIMEFRAME (aligned to 4h) ─────────────────
    ret_1h = df_1h["close"].pct_change().fillna(0)
    for k, v in _rolling_stats(ret_1h, [6, 12, 24, 48, 72], "ret1h").items():
        feats[k] = _align_1h(v)
    if "volume_ratio_10" in df_1h.columns:
        for k, v in _rolling_stats(df_1h["volume_ratio_10"].fillna(1), [6, 24, 48], "vol1h").items():
            feats[k] = _align_1h(v)

    # ── D. CROSS-TIMEFRAME + PATTERN SIGNALS ─────────────────────────────────
    if "ema_cross" in df_4h.columns and "ema_cross_1h" in df_1h.columns:
        ema_cross_1h = _align_1h(df_1h["ema_cross_1h"].fillna(0).values)
        feats["tf_trend_agree"] = (np.sign(ema_cross_1h) == np.sign(df_4h["ema_cross"].fillna(0).values)).astype(float)

    if "macd_hist_norm" in df_4h.columns:
        feats["macd_hist_accel"] = df_4h["macd_hist_norm"].diff().fillna(0).values

    if "rsi_14" in df_4h.columns:
        # Bearish divergence proxy: price near rolling high, RSI not confirming
        price_hi = df_4h["close"].rolling(30, min_periods=1).max()
        rsi      = df_4h["rsi_14"].fillna(0.5)
        rsi_hi   = rsi.rolling(30, min_periods=1).max()
        feats["bearish_div"] = (
            ((df_4h["close"] >= price_hi * 0.995) & (rsi < rsi_hi * 0.95))
            .astype(float).values
        )

    if "bb_width" in df_4h.columns:
        # Bollinger squeeze via CAUSAL rolling percentile (old version ranked
        # against the entire dataset — future included — a textbook leak)
        roll_rank = (df_4h["bb_width"].rolling(180, min_periods=30)
                     .rank(pct=True))
        feats["bb_squeeze"] = (roll_rank < 0.25).astype(float).fillna(0).values
        feats["bb_width_rank"] = roll_rank.fillna(0.5).values

    # ── E. DERIVATIVES (full-history sources only) ───────────────────────────
    for col in ["funding_rate", "funding_rate_7d_mean"]:
        if col in df_4h.columns:
            feats[f"deriv_{col}"] = df_4h[col].fillna(0).values

    # ── F. MACRO, REGIME & MARKET-LEADER CONTEXT ─────────────────────────────
    for col in ["fed_funds_rate", "cpi_yoy", "unemployment_rate",
                "dxy_return", "dxy_weekly_return",
                "sp500_return", "sp500_weekly_return",
                "fear_greed",
                "btc_ret_1", "btc_ret_6", "btc_ret_42", "rel_btc_ret_6"]:
        if col in df_4h.columns:
            feats[f"ctx_{col}"] = df_4h[col].fillna(0).values

    # ── G. CALENDAR (crypto has time-of-week seasonality) ────────────────────
    if "timestamp" in df_4h.columns:
        dt  = pd.to_datetime(df_4h["timestamp"], unit="ms", utc=True)
        h   = dt.dt.hour.values
        dow = dt.dt.dayofweek.values
        feats["cal_hour_sin"] = np.sin(2 * np.pi * h / 24)
        feats["cal_hour_cos"] = np.cos(2 * np.pi * h / 24)
        feats["cal_dow_sin"]  = np.sin(2 * np.pi * dow / 7)
        feats["cal_dow_cos"]  = np.cos(2 * np.pi * dow / 7)

    # ── H. DAILY TREND CONTEXT ───────────────────────────────────────────────
    for col in ["price_vs_50d_ma", "price_vs_200d_ma", "daily_rsi_14", "golden_cross"]:
        if col in df_4h.columns:
            feats[f"daily_{col}"] = df_4h[col].fillna(0).values

    # ── Assemble matrix ──────────────────────────────────────────────────────
    names  = sorted(feats.keys())
    matrix = np.zeros((n, len(names)), dtype=np.float32)
    for i, name in enumerate(names):
        arr = np.asarray(feats[name], dtype=np.float32)
        if arr.ndim == 0:
            matrix[:, i] = float(arr)
        elif len(arr) == n:
            matrix[:, i] = arr
        elif len(arr) > n:
            matrix[:, i] = arr[-n:]
        else:
            matrix[:, i] = np.pad(arr, (n - len(arr), 0), mode="edge")

    matrix = np.nan_to_num(matrix, nan=0.0, posinf=0.0, neginf=0.0)
    return matrix, names
