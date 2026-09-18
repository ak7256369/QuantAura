# All endpoints FREE. Same BINANCE_API_KEY as Spot.
import logging
import os

import requests, pandas as pd
from config import BINANCE_API_KEY
from utils.retry import with_retry

log = logging.getLogger("autopilot")

BASE_URLS = [
    "https://fapi.binance.com",
    "https://fapi1.binance.com",
    "https://fapi2.binance.com",
    "https://fapi3.binance.com",
]

# Futures has no data-api.binance.vision mirror, and fapi geo-blocks US cloud
# IPs (451; fapi1/2/3 answer 302 into the same block) — measured from a GitHub
# runner. The VPS is not blocked, so it relays these four datasets and becomes
# the only path by which cloud training can read funding, open interest and the
# long/short ratios. Tried LAST: a local or VPS run reaches Binance directly and
# should not take the extra hop.
QUANTAURA_PROXY = os.environ.get("QUANTAURA_API_BASE", "https://quantaura.tech")

# Upstream path -> the dataset name the proxy exposes.
_PROXY_DATASETS = {
    "/fapi/v1/fundingRate": "fundingRate",
    "/futures/data/openInterestHist": "openInterestHist",
    "/futures/data/globalLongShortAccountRatio": "globalLongShortAccountRatio",
    "/futures/data/takerlongshortRatio": "takerlongshortRatio",
}


def _via_proxy(ep, params):
    """Fetch one dataset through quantaura.tech, unwrapping {success,data}."""
    dataset = _PROXY_DATASETS.get(ep)
    if dataset is None:
        raise ValueError(f"No proxy mapping for {ep}")
    r = requests.get(f"{QUANTAURA_PROXY}/api/market/derivatives",
                     params={"dataset": dataset, **params}, timeout=30)
    if r.status_code != 200:
        raise ValueError(f"HTTP {r.status_code}: {r.text[:120]}")
    body = r.json()
    if not body.get("success"):
        raise ValueError(f"proxy reported failure: {str(body.get('error'))[:120]}")
    return body["data"]

# The mirror that last answered successfully. Starts at the canonical host and
# only moves when that host actually fails, so a healthy primary is never
# abandoned mid-session.
_PREFERRED = 0


def _get(ep, params):
    """Fetch from the first mirror that returns a usable JSON body.

    The mirrors are NOT interchangeable. fapi1/2/3 answer with HTTP 202 and an
    EMPTY body; 202 is a 2xx, so raise_for_status() waves it through and the
    subsequent .json() dies on "Expecting value: line 1 column 1 (char 0)".

    This used to round-robin a global counter across all four hosts, which sent
    three of every four requests to a mirror that could not answer. Each of
    those failures then cost 15s of @with_retry backoff (5s + 10s), pushing
    /predict to ~21s — past the 15s timeout in the API gateway, so every live
    signal request silently fell back to the TA heuristic. The funding-rate
    features were simultaneously being zero-filled by the caller's except
    branch, so the models were also serving on degraded inputs.

    Failing over in order, and treating a non-200 or empty body as a failure,
    fixes both: the primary host is used whenever it is healthy, and a dead
    mirror costs one request instead of fifteen seconds.
    """
    global _PREFERRED
    errors = []
    for offset in range(len(BASE_URLS)):
        i = (_PREFERRED + offset) % len(BASE_URLS)
        base = BASE_URLS[i]
        try:
            r = requests.get(base + ep, params=params, timeout=10)
            if r.status_code != 200:
                raise ValueError(f"HTTP {r.status_code}")
            if not r.text.strip():
                raise ValueError(f"HTTP {r.status_code} with an empty body")
            data = r.json()
            _PREFERRED = i
            return data
        except Exception as e:                                   # noqa: BLE001
            errors.append(f"{base}: {type(e).__name__}: {e}")

    # Every direct mirror is unreachable — on a cloud runner that means the geo
    # block, not an outage. Relay through the VPS rather than let the caller
    # zero-fill five real features.
    try:
        data = _via_proxy(ep, params)
        log.info(f"  futures via quantaura proxy ({_PROXY_DATASETS.get(ep, ep)})")
        return data
    except Exception as e:                                       # noqa: BLE001
        errors.append(f"quantaura proxy: {type(e).__name__}: {e}")

    raise RuntimeError("all Binance futures mirrors failed — " + " | ".join(errors))


# _get already fails over across every mirror, so an outer retry only has to
# cover a genuinely transient blip. The default (3 attempts, 5s base) shape
# sleeps 15s before giving up — the exact budget that broke live /predict, and
# a cost the serving path must never pay again just to re-learn that Binance
# is unreachable.
_futures_retry = with_retry(max_attempts=2, base_delay=2)

@_futures_retry
def fetch_funding_rate(symbol: str, limit: int = 1000,
                       days: int | None = None) -> pd.DataFrame:
    """Every 8h. Returns: timestamp(ms), funding_rate(float).
    If `days` is given, paginates with startTime so the FULL history is
    returned (a single call caps at 1000 points ≈ 333 days)."""
    import time as _time
    if days is None:
        data = _get("/fapi/v1/fundingRate", {"symbol": symbol, "limit": limit})
    else:
        start = int(_time.time() * 1000) - days * 24 * 3600 * 1000
        data = []
        while True:
            chunk = _get("/fapi/v1/fundingRate",
                         {"symbol": symbol, "startTime": start, "limit": 1000})
            if not chunk:
                break
            data.extend(chunk)
            if len(chunk) < 1000:
                break
            start = int(chunk[-1]["fundingTime"]) + 1
    if not data:
        return pd.DataFrame(columns=["timestamp", "funding_rate"])
    df = pd.DataFrame(data)[["fundingTime", "fundingRate"]]
    df.columns = ["timestamp", "funding_rate"]
    df["timestamp"]    = df["timestamp"].astype("int64")
    df["funding_rate"] = df["funding_rate"].astype(float)
    return (df.drop_duplicates("timestamp").sort_values("timestamp")
            .reset_index(drop=True))

@_futures_retry
def fetch_open_interest_history(symbol: str, period: str = "4h", limit: int = 500) -> pd.DataFrame:
    """Returns: timestamp, open_interest, open_interest_change(pct)."""
    data = _get("/futures/data/openInterestHist",
                {"symbol": symbol, "period": period, "limit": limit})
    df = pd.DataFrame(data)[["timestamp", "sumOpenInterest"]]
    df.columns = ["timestamp", "open_interest"]
    df["timestamp"]           = df["timestamp"].astype("int64")
    df["open_interest"]       = df["open_interest"].astype(float)
    df["open_interest_change"]= df["open_interest"].pct_change().fillna(0)
    return df.sort_values("timestamp").reset_index(drop=True)

@_futures_retry
def fetch_long_short_ratio(symbol: str, period: str = "4h", limit: int = 500) -> pd.DataFrame:
    """Top trader long/short account ratio. >1 = more longs."""
    data = _get("/futures/data/globalLongShortAccountRatio",
                {"symbol": symbol, "period": period, "limit": limit})
    df = pd.DataFrame(data)[["timestamp", "longShortRatio"]]
    df.columns = ["timestamp", "long_short_ratio"]
    df["timestamp"]        = df["timestamp"].astype("int64")
    df["long_short_ratio"] = df["long_short_ratio"].astype(float)
    return df.sort_values("timestamp").reset_index(drop=True)

@_futures_retry
def fetch_taker_ratio(symbol: str, period: str = "4h", limit: int = 500) -> pd.DataFrame:
    """>0.5 = aggressive buying. <0.5 = aggressive selling."""
    data = _get("/futures/data/takerlongshortRatio",
                {"symbol": symbol, "period": period, "limit": limit})
    df = pd.DataFrame(data)[["timestamp", "buySellRatio"]]
    df.columns = ["timestamp", "taker_buy_ratio"]
    df["timestamp"]       = df["timestamp"].astype("int64")
    df["taker_buy_ratio"] = df["taker_buy_ratio"].astype(float)
    return df.sort_values("timestamp").reset_index(drop=True)

def fetch_all_derivatives(symbol: str) -> pd.DataFrame:
    """
    Merges all derivatives data on 4h timestamps.
    Returns: timestamp, funding_rate, funding_rate_7d_mean,
             open_interest_change, long_short_ratio, taker_buy_ratio
    """
    funding = fetch_funding_rate(symbol, limit=1000)
    oi      = fetch_open_interest_history(symbol, period="4h", limit=500)
    ls      = fetch_long_short_ratio(symbol, period="4h", limit=500)
    taker   = fetch_taker_ratio(symbol, period="4h", limit=500)

    df = oi[["timestamp", "open_interest_change"]].copy()

    # Forward-fill funding (8h cadence → 4h candle timestamps)
    fund_ff = (funding.set_index("timestamp")["funding_rate"]
               .reindex(df["timestamp"], method="ffill").fillna(0).reset_index())
    fund_ff.columns = ["timestamp", "funding_rate"]

    # 7-day rolling mean of funding (21 × 8h = 168h = 7d)
    funding_sorted = funding.sort_values("timestamp").copy()
    funding_sorted["funding_rate_7d_mean"] = funding_sorted["funding_rate"].rolling(21, min_periods=1).mean()
    fund7_ff = (funding_sorted.set_index("timestamp")["funding_rate_7d_mean"]
                .reindex(df["timestamp"], method="ffill").fillna(0).reset_index())
    fund7_ff.columns = ["timestamp", "funding_rate_7d_mean"]

    df = (df
          .merge(fund_ff,  on="timestamp", how="left")
          .merge(fund7_ff, on="timestamp", how="left")
          .merge(ls[["timestamp","long_short_ratio"]], on="timestamp", how="left")
          .merge(taker[["timestamp","taker_buy_ratio"]], on="timestamp", how="left"))
    return df.ffill().fillna(0)
