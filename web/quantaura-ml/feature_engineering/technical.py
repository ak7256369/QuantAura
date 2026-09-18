"""
Technical feature engineering — ALL features are scale-free.

Rule: no raw prices or raw volumes ever reach a model. Features are log
returns, price-relative distances, bounded oscillators, or rolling ratios.
This lets one model train across BTC ($100k) and DOGE ($0.2) simultaneously —
raw-price features were the primary cause of the neural models' F1 collapse.
"""
import pandas as pd, numpy as np
from ta.momentum import RSIIndicator, StochRSIIndicator
from ta.trend import MACD, EMAIndicator, IchimokuIndicator
from ta.volatility import BollingerBands, AverageTrueRange
from ta.volume import OnBalanceVolumeIndicator, ChaikinMoneyFlowIndicator, MFIIndicator


def _log_ret(close: pd.Series, n: int) -> pd.Series:
    return np.log(close / close.shift(n)).replace([np.inf, -np.inf], np.nan)


def _order_flow(df: pd.DataFrame) -> pd.DataFrame:
    """Per-candle taker flow + trade count features (full history from klines)."""
    vol = df["volume"].replace(0, np.nan)
    if "taker_buy_base" in df.columns:
        df["taker_buy_ratio_c"] = (df["taker_buy_base"] / vol).clip(0, 1).fillna(0.5)
    else:
        df["taker_buy_ratio_c"] = 0.5
    if "trades" in df.columns:
        tr_ma = df["trades"].rolling(20, min_periods=5).mean().replace(0, np.nan)
        df["trades_ratio"] = (df["trades"] / tr_ma).fillna(1.0).clip(0, 10)
    else:
        df["trades_ratio"] = 1.0
    return df


def _candle_shape(df: pd.DataFrame) -> pd.DataFrame:
    close, high, low, open_ = df["close"], df["high"], df["low"], df["open"]
    full_range = (high - low).replace(0, np.nan)
    body       = (close - open_).abs()
    df["high_low_range"]    = ((high - low) / close.replace(0, np.nan)).fillna(0)
    df["candle_body_ratio"] = (body / full_range).fillna(0)
    df["upper_wick_ratio"]  = ((high - np.maximum(close, open_)) / full_range).fillna(0).clip(0, 1)
    df["lower_wick_ratio"]  = ((np.minimum(close, open_) - low) / full_range).fillna(0).clip(0, 1)
    return df


def _volume_stats(df: pd.DataFrame, ratio_window: int) -> pd.DataFrame:
    vol   = df["volume"]
    v_ma  = vol.rolling(ratio_window, min_periods=1).mean().replace(0, np.nan)
    v_std = vol.rolling(ratio_window, min_periods=5).std().replace(0, np.nan)
    df[f"volume_ratio_{ratio_window}"] = (vol / v_ma).fillna(1.0).clip(0, 20)
    df["volume_zscore"] = ((vol - v_ma) / v_std).fillna(0).clip(-6, 6)
    return df


def add_1h_features(df: pd.DataFrame) -> pd.DataFrame:
    """Adds LSTM_FEATURES columns to a 1h OHLCV DataFrame (sorted ASC)."""
    df = df.copy()
    close, high, low, vol = df["close"], df["high"], df["low"], df["volume"]
    safe_close = close.replace(0, np.nan)

    # Multi-horizon log returns
    for n in (1, 3, 6, 12, 24):
        df[f"ret_{n}"] = _log_ret(close, n)

    # Bounded oscillators
    df["rsi_14"]    = RSIIndicator(close=close, window=14).rsi() / 100.0
    df["stoch_rsi"] = StochRSIIndicator(close=close, window=14, smooth1=3, smooth2=3).stochrsi()
    df["mfi"]       = MFIIndicator(high=high, low=low, close=close, volume=vol, window=14).money_flow_index() / 100.0
    df["cmf"]       = ChaikinMoneyFlowIndicator(high=high, low=low, close=close, volume=vol, window=20).chaikin_money_flow()

    # MACD normalized by price (raw MACD scales with price level)
    macd = MACD(close=close, window_slow=26, window_fast=12, window_sign=9)
    df["macd_norm"]        = (macd.macd() / safe_close).fillna(0) * 100
    df["macd_signal_norm"] = (macd.macd_signal() / safe_close).fillna(0) * 100
    df["macd_hist_norm"]   = (macd.macd_diff() / safe_close).fillna(0) * 100

    # Bollinger: position within band (0-1) + relative width
    bb       = BollingerBands(close=close, window=20, window_dev=2)
    bb_upper, bb_lower = bb.bollinger_hband(), bb.bollinger_lband()
    bb_range = (bb_upper - bb_lower).replace(0, np.nan)
    df["bb_position"] = ((close - bb_lower) / bb_range).clip(0, 1).fillna(0.5)
    df["bb_width"]    = ((bb_upper - bb_lower) / safe_close).fillna(0)

    # EMA distances relative to price
    ema9  = EMAIndicator(close=close, window=9).ema_indicator()
    ema21 = EMAIndicator(close=close, window=21).ema_indicator()
    df["ema_9_dist"]   = (close / ema9.replace(0, np.nan) - 1).fillna(0)
    df["ema_21_dist"]  = (close / ema21.replace(0, np.nan) - 1).fillna(0)
    df["ema_cross_1h"] = ((ema9 - ema21) / safe_close).fillna(0)

    # Long-horizon trend state. The label is the 4h EMA12/EMA26 regime 24h
    # ahead; 48h/104h EMAs on 1h candles mirror that basis so the LSTM can see
    # the CURRENT regime, not just 2 days of short-term momentum.
    ema48  = EMAIndicator(close=close, window=48).ema_indicator()
    ema104 = EMAIndicator(close=close, window=104).ema_indicator()
    df["ema_48_dist"]    = (close / ema48.replace(0, np.nan) - 1).fillna(0)
    df["ema_104_dist"]   = (close / ema104.replace(0, np.nan) - 1).fillna(0)
    df["trend_state_1h"] = ((ema48 - ema104) / safe_close).fillna(0)
    # Vol-normalized trend score — same construction as the label's z (causal:
    # rolling vol is shifted one candle). 720×1h = 30 days, √24 = 24h horizon.
    lr1 = np.log(close / close.shift(1))
    vol24 = lr1.rolling(720, min_periods=240).std().shift(1) * np.sqrt(24)
    df["trend_z_1h"] = (((ema48 - ema104) / safe_close)
                        / vol24.replace(0, np.nan)).fillna(0).clip(-5, 5)
    df["ret_48"] = _log_ret(close, 48)
    df["ret_96"] = _log_ret(close, 96)

    # ATR as percent of price
    atr = AverageTrueRange(high=high, low=low, close=close, window=14).average_true_range()
    df["atr_pct"] = (atr / safe_close).fillna(0)

    # OBV normalized (scale-invariant already)
    obv    = OnBalanceVolumeIndicator(close=close, volume=vol).on_balance_volume()
    obv_ma = obv.rolling(20, min_periods=1).mean().replace(0, np.nan)
    df["obv_norm"] = (obv / obv_ma - 1).fillna(0).clip(-5, 5)

    df = _volume_stats(df, ratio_window=10)
    df = _candle_shape(df)
    df = _order_flow(df)

    # VWAP deviation (rolling 24h)
    typical  = (high + low + close) / 3
    cum_tpv  = (typical * vol).rolling(24, min_periods=1).sum()
    cum_vol  = vol.rolling(24, min_periods=1).sum().replace(0, np.nan)
    vwap     = (cum_tpv / cum_vol).replace(0, np.nan)
    df["vwap_deviation"] = ((close - vwap) / vwap).fillna(0)

    return df


def add_4h_features(df: pd.DataFrame) -> pd.DataFrame:
    """Adds TRANSFORMER/KAN feature columns to a 4h OHLCV DataFrame (sorted ASC).
    Macro + derivatives + BTC-context columns are merged in by the pipeline."""
    df = df.copy()
    close, high, low, vol = df["close"], df["high"], df["low"], df["volume"]
    safe_close = close.replace(0, np.nan)

    for n in (1, 3, 6, 12, 42):
        df[f"ret_{n}"] = _log_ret(close, n)

    df["rsi_14"]    = RSIIndicator(close=close, window=14).rsi() / 100.0
    df["stoch_rsi"] = StochRSIIndicator(close=close, window=14, smooth1=3, smooth2=3).stochrsi()

    macd = MACD(close=close, window_slow=26, window_fast=12, window_sign=9)
    df["macd_norm"]        = (macd.macd() / safe_close).fillna(0) * 100
    df["macd_signal_norm"] = (macd.macd_signal() / safe_close).fillna(0) * 100
    df["macd_hist_norm"]   = (macd.macd_diff() / safe_close).fillna(0) * 100

    bb       = BollingerBands(close=close, window=20, window_dev=2)
    bb_upper, bb_lower = bb.bollinger_hband(), bb.bollinger_lband()
    bb_range = (bb_upper - bb_lower).replace(0, np.nan)
    df["bb_position"] = ((close - bb_lower) / bb_range).clip(0, 1).fillna(0.5)
    df["bb_width"]    = ((bb_upper - bb_lower) / safe_close).fillna(0)

    ema12 = EMAIndicator(close=close, window=12).ema_indicator()
    ema26 = EMAIndicator(close=close, window=26).ema_indicator()
    df["ema_12_dist"] = (close / ema12.replace(0, np.nan) - 1).fillna(0)
    df["ema_26_dist"] = (close / ema26.replace(0, np.nan) - 1).fillna(0)
    df["ema_cross"]   = ((ema12 - ema26) / safe_close).fillna(0)

    # Vol-normalized trend score — the exact quantity whose 24h-ahead value the
    # label classifies (see labels.py). Knowing z[t] is legitimate/causal; the
    # models learn how z evolves 6 candles forward.
    lr1 = np.log(close / close.shift(1))
    vol_h = lr1.rolling(180, min_periods=60).std().shift(1) * np.sqrt(6)
    df["trend_z"] = (((ema12 - ema26) / safe_close)
                     / vol_h.replace(0, np.nan)).fillna(0).clip(-5, 5)

    atr = AverageTrueRange(high=high, low=low, close=close, window=14).average_true_range()
    df["atr_pct"] = (atr / safe_close).fillna(0)

    df = _volume_stats(df, ratio_window=20)
    df = _candle_shape(df)
    df = _order_flow(df)

    # Ichimoku lines as DISTANCE from price (raw lines scale with price)
    ichi = IchimokuIndicator(high=high, low=low, window1=9, window2=26, window3=52)
    df["ichimoku_conv_dist"] = ((ichi.ichimoku_conversion_line() - close) / safe_close).fillna(0)
    df["ichimoku_base_dist"] = ((ichi.ichimoku_base_line() - close) / safe_close).fillna(0)

    return df


def add_btc_context(df: pd.DataFrame, btc_df: pd.DataFrame,
                    horizons=(1, 6, 42)) -> pd.DataFrame:
    """
    Adds market-leader context to any symbol's frame (same timeframe):
      btc_ret_N      — BTC log return over N candles
      rel_btc_ret_6  — symbol/BTC relative-strength return over 6 candles
    Aligned on timestamp; BTC itself gets rel_btc_ret_6 = 0.
    """
    df = df.copy()
    btc = btc_df[["timestamp", "close"]].rename(columns={"close": "btc_close"})
    out = df.merge(btc, on="timestamp", how="left")
    out["btc_close"] = out["btc_close"].ffill()
    btc_close = out["btc_close"].replace(0, np.nan)

    for n in horizons:
        out[f"btc_ret_{n}"] = np.log(btc_close / btc_close.shift(n)).replace(
            [np.inf, -np.inf], np.nan).fillna(0)

    ratio = (out["close"] / btc_close).replace([np.inf, -np.inf], np.nan)
    out["rel_btc_ret_6"] = np.log(ratio / ratio.shift(6)).replace(
        [np.inf, -np.inf], np.nan).fillna(0)

    return out.drop(columns=["btc_close"])
