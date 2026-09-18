"""
On-chain data from Blockchain.com (free, no API key required).
Provides: hash_rate, active_addresses, transaction_count, mempool_size.
These are powerful leading indicators for BTC (and by correlation, altcoins).
"""
import requests, pandas as pd, numpy as np, time, logging, json, os
from utils.retry import with_retry

log = logging.getLogger(__name__)

CACHE_FILE = os.path.join(os.path.dirname(__file__), "..", "data", "onchain_cache.json")

_METRICS = {
    "hash-rate":          "hash_rate",
    "n-unique-addresses": "active_addresses",
    "n-transactions":     "transaction_count",
    "mempool-size":       "mempool_size",
}


def _load_cache() -> dict:
    try:
        if os.path.exists(CACHE_FILE):
            with open(CACHE_FILE) as f:
                return json.load(f)
    except Exception:
        pass
    return {}


def _save_cache(data: dict):
    try:
        os.makedirs(os.path.dirname(CACHE_FILE), exist_ok=True)
        with open(CACHE_FILE, "w") as f:
            json.dump(data, f)
    except Exception as e:
        log.warning(f"[ONCHAIN] Cache save failed: {e}")


@with_retry(max_attempts=2)
def _fetch_metric(metric: str, timespan: str = "90days") -> pd.DataFrame:
    """
    Fetch a single metric from Blockchain.com charts API.
    Returns DataFrame with columns: [date, <metric_name>]
    """
    url = f"https://api.blockchain.info/charts/{metric}"
    params = {"timespan": timespan, "format": "json", "sampled": "true"}
    r = requests.get(url, params=params, timeout=15)
    r.raise_for_status()
    data = r.json()

    col_name = _METRICS[metric]
    rows = []
    for point in data.get("values", []):
        rows.append({
            "date": pd.to_datetime(point["x"], unit="s", utc=True).strftime("%Y-%m-%d"),
            col_name: float(point["y"]),
        })
    return pd.DataFrame(rows)


def fetch_onchain_data(timespan: str = "90days") -> pd.DataFrame:
    """
    Fetch all on-chain metrics and merge into a single daily DataFrame.
    Uses disk cache as fallback if API fails.
    Columns: date, hash_rate, active_addresses, transaction_count, mempool_size
    """
    cache = _load_cache()
    frames = []
    all_succeeded = True

    for metric, col_name in _METRICS.items():
        try:
            df = _fetch_metric(metric, timespan)
            frames.append(df)
            # Update cache for this metric
            cache[col_name] = df.to_dict("records")
            log.info(f"[ONCHAIN] {col_name}: {len(df)} days fetched")
        except Exception as e:
            log.warning(f"[ONCHAIN] {metric} failed: {e}, using cache")
            all_succeeded = False
            # Fall back to cache
            if col_name in cache:
                df = pd.DataFrame(cache[col_name])
                frames.append(df)
            else:
                log.warning(f"[ONCHAIN] No cache for {col_name}, skipping")

    if all_succeeded:
        _save_cache(cache)

    if not frames:
        return pd.DataFrame(columns=["date", "hash_rate", "active_addresses",
                                      "transaction_count", "mempool_size"])

    # Merge all metrics on date
    merged = frames[0]
    for df in frames[1:]:
        merged = merged.merge(df, on="date", how="outer")

    merged = merged.sort_values("date").ffill().bfill().fillna(0).reset_index(drop=True)

    # Compute derived features: rate of change (more useful than raw values)
    for col in ["hash_rate", "active_addresses", "transaction_count"]:
        if col in merged.columns:
            s = merged[col]
            merged[f"{col}_7d_change"] = s.pct_change(7).fillna(0)
            merged[f"{col}_30d_change"] = s.pct_change(30).fillna(0)

    return merged
