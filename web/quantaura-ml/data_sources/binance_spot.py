import logging
import pandas as pd, time
from binance.client import Client
from config import BINANCE_API_KEY, BINANCE_API_SECRET, LOOKBACK_DAYS
from utils.retry import with_retry

log = logging.getLogger("autopilot")

# data-api.binance.vision leads deliberately. It is Binance's own public
# market-data host, it serves the identical 12-field kline array (so `trades`
# and `taker_buy_base` survive), and — measured from a GitHub runner — it
# answers 200 where api/api1/api2/api3.binance.com all answer 451 to US cloud
# IPs. That block is what would otherwise make cloud training impossible.
# It carries no account endpoints, but this module only ever reads klines.
BINANCE_API_URLS = [
    "https://data-api.binance.vision/api",
    "https://api.binance.com/api",
    "https://api1.binance.com/api",
    "https://api2.binance.com/api",
    "https://api3.binance.com/api",
]

# Client.__init__ calls ping(), so the endpoint has to be chosen BEFORE the
# client exists. Assigning client.API_URL inside fetch_ohlcv — which is what
# this module used to do — is already too late: constructing the module-level
# client pinged api.binance.com at import time and a runner got back
# "Service unavailable from a restricted location" before any fetch ran.
Client.API_URL = BINANCE_API_URLS[0]
client = Client(BINANCE_API_KEY, BINANCE_API_SECRET)

TF_MAP = {"1h": Client.KLINE_INTERVAL_1HOUR, "4h": Client.KLINE_INTERVAL_4HOUR,
          "1d": Client.KLINE_INTERVAL_1DAY}

# The mirror that last answered. Mirrors are NOT interchangeable — four of the
# five 451 from a US cloud IP — so a global counter incremented per call, which
# is what this module used to do, sent four of every five requests to a host
# that cannot answer. binance_futures.py already carries the same fix and the
# same reasoning; keep them in step.
_PREFERRED = 0


def _klines_failover(symbol, interval, start_str, end_str):
    """get_historical_klines against the first mirror that answers."""
    global _PREFERRED
    errors = []
    for offset in range(len(BINANCE_API_URLS)):
        i = (_PREFERRED + offset) % len(BINANCE_API_URLS)
        client.API_URL = BINANCE_API_URLS[i]
        try:
            data = client.get_historical_klines(symbol, interval,
                                                start_str=start_str, end_str=end_str)
            if i != _PREFERRED:
                log.info(f"  spot mirror -> {BINANCE_API_URLS[i]}")
                _PREFERRED = i
            return data
        except Exception as e:                                   # noqa: BLE001
            errors.append(f"{BINANCE_API_URLS[i]}: {type(e).__name__}: {str(e)[:80]}")
    raise RuntimeError("all Binance spot mirrors failed — " + " | ".join(errors))


@with_retry(max_attempts=3)
def fetch_ohlcv(symbol: str, timeframe: str, days: int = LOOKBACK_DAYS) -> pd.DataFrame:
    """
    Returns DataFrame: timestamp(ms int), open, high, low, close, volume,
    trades, taker_buy_base — all float except timestamp.

    trades + taker_buy_base are kept because they provide per-candle order-flow
    signals (taker buy ratio, trade-count surges) with FULL history, unlike the
    futures /futures/data endpoints which only return the last ~30 days.
    """
    end_ms   = int(time.time() * 1000)
    start_ms = end_ms - (days * 24 * 3600 * 1000)
    klines = _klines_failover(symbol, TF_MAP[timeframe],
                              start_str=str(start_ms), end_str=str(end_ms))
    cols = ["timestamp","open","high","low","close","volume",
            "close_time","quote_vol","trades","taker_buy_base","taker_buy_quote","ignore"]
    df = pd.DataFrame(klines, columns=cols)
    df = df[["timestamp","open","high","low","close","volume","trades","taker_buy_base"]].astype(float)
    # np.int64 explicitly: plain astype(int) is int32 on Windows and silently
    # overflows ms-epoch timestamps to -2147483648
    df["timestamp"] = df["timestamp"].astype("int64")
    # Drop the still-forming final candle: its volume/range/return features are
    # systematically tiny and the models never see partial candles in training.
    interval_ms = {"1h": 3_600_000, "4h": 14_400_000, "1d": 86_400_000}[timeframe]
    now_ms = int(time.time() * 1000)
    df = df[df["timestamp"] + interval_ms <= now_ms]
    return df.drop_duplicates("timestamp").sort_values("timestamp").reset_index(drop=True)
