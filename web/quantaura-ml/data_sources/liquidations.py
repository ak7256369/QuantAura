"""
Liquidation data from Binance Futures (free, uses existing API key).
Provides aggregate liquidation volume which is a powerful mean-reversion signal:
  - Massive long liquidations → often local bottoms
  - Massive short liquidations → often local tops
"""
import pandas as pd, numpy as np, time, logging
from binance.client import Client
from config import BINANCE_API_KEY, BINANCE_API_SECRET
from utils.retry import with_retry

log = logging.getLogger(__name__)

client = Client(BINANCE_API_KEY, BINANCE_API_SECRET)


@with_retry(max_attempts=2)
def fetch_liquidations(symbol: str, hours: int = 24) -> dict:
    """
    Fetch recent forced liquidation orders from Binance Futures.
    Returns a dict with aggregate metrics for the last N hours.
    Note: Binance only returns the most recent ~1000 liquidation events,
    so this is best used as a rolling state indicator, not historical data.
    """
    try:
        start_time = int((time.time() - hours * 3600) * 1000)
        liq_orders = client.futures_liquidation_orders(symbol=symbol, startTime=start_time)
    except Exception as e:
        log.warning(f"[LIQUIDATION] {symbol} fetch failed: {e}")
        return _default_metrics()

    if not liq_orders:
        return _default_metrics()

    df = pd.DataFrame(liq_orders)
    df["time"] = pd.to_numeric(df["time"])
    df["origQty"] = pd.to_numeric(df["origQty"], errors="coerce").fillna(0)
    df["price"] = pd.to_numeric(df["price"], errors="coerce").fillna(0)
    df["notional"] = df["origQty"] * df["price"]

    # Filter to the requested window
    cutoff = int(time.time() * 1000) - (hours * 3600 * 1000)
    df = df[df["time"] >= cutoff]

    if df.empty:
        return _default_metrics()

    long_liqs = df[df["side"] == "SELL"]   # Forced sell = long liquidation
    short_liqs = df[df["side"] == "BUY"]   # Forced buy = short liquidation

    long_vol = long_liqs["notional"].sum()
    short_vol = short_liqs["notional"].sum()
    total_vol = long_vol + short_vol

    return {
        "liq_long_volume_24h": float(long_vol),
        "liq_short_volume_24h": float(short_vol),
        "liq_total_volume_24h": float(total_vol),
        "liq_long_count_24h": len(long_liqs),
        "liq_short_count_24h": len(short_liqs),
        # Ratio: >0.5 means more longs liquidated (bearish pressure),
        # <0.5 means more shorts liquidated (bullish pressure)
        "liq_long_ratio": float(long_vol / total_vol) if total_vol > 0 else 0.5,
    }


def _default_metrics() -> dict:
    return {
        "liq_long_volume_24h": 0.0,
        "liq_short_volume_24h": 0.0,
        "liq_total_volume_24h": 0.0,
        "liq_long_count_24h": 0,
        "liq_short_count_24h": 0,
        "liq_long_ratio": 0.5,
    }
