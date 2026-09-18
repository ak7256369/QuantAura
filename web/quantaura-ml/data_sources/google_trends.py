"""
Google Trends data for crypto search interest (free, no API key required).
Uses pytrends library to fetch relative search volume for crypto-related keywords.
Search volume spikes are strong retail FOMO indicators.
"""
import pandas as pd, numpy as np, time, logging, json, os

log = logging.getLogger(__name__)

CACHE_FILE = os.path.join(os.path.dirname(__file__), "..", "data", "gtrends_cache.json")

# Keywords to track — each provides a different signal
KEYWORDS = ["bitcoin", "buy crypto", "crypto crash"]


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
        log.warning(f"[GTRENDS] Cache save failed: {e}")


def fetch_google_trends(days: int = 90) -> pd.DataFrame:
    """
    Fetch Google Trends data for crypto keywords.
    Returns daily DataFrame: date, gtrends_bitcoin, gtrends_buy_crypto, gtrends_crypto_crash
    Uses exponential backoff to handle 429 rate limits before falling back to cache.
    """
    cache = _load_cache()

    try:
        from pytrends.request import TrendReq

        # Exponential backoff retry loop
        max_retries = 3
        df = pd.DataFrame()
        
        for attempt in range(max_retries):
            try:
                pytrends = TrendReq(hl="en-US", tz=0, timeout=(10, 25))
                timeframe = "today 3-m"
                pytrends.build_payload(KEYWORDS, cat=0, timeframe=timeframe, geo="", gprop="")
                df = pytrends.interest_over_time()
                
                if not df.empty:
                    break  # Success
            except Exception as e:
                if "429" in str(e) or "Too Many Requests" in str(e):
                    if attempt < max_retries - 1:
                        sleep_time = 5 * (2 ** attempt)
                        log.info(f"[GTRENDS] Rate limited, retrying in {sleep_time}s...")
                        time.sleep(sleep_time)
                        continue
                raise e  # If not 429 or out of retries, raise to outer block

        if df.empty:
            raise ValueError("Empty response from Google Trends after retries")

        # Drop the isPartial column
        if "isPartial" in df.columns:
            df = df.drop(columns=["isPartial"])

        # Rename columns
        rename_map = {}
        for kw in KEYWORDS:
            safe_name = kw.replace(" ", "_")
            rename_map[kw] = f"gtrends_{safe_name}"
        df = df.rename(columns=rename_map)

        # Add date column
        df["date"] = df.index.strftime("%Y-%m-%d")
        df = df.reset_index(drop=True)

        # Compute derived features
        for col in df.columns:
            if col.startswith("gtrends_") and col != "date":
                s = df[col].astype(float)
                # 7-day momentum: is search interest accelerating?
                df[f"{col}_momentum"] = s.pct_change(7).fillna(0)
                # Z-score: how unusual is current search volume?
                mean_val = s.rolling(30, min_periods=7).mean()
                std_val = s.rolling(30, min_periods=7).std().replace(0, 1)
                df[f"{col}_zscore"] = ((s - mean_val) / std_val).fillna(0)

        # Cache the result
        cache["data"] = df.to_dict("records")
        cache["fetched_at"] = int(time.time())
        _save_cache(cache)

        log.info(f"[GTRENDS] Fetched {len(df)} days of search data")
        return df

    except ImportError:
        log.warning("[GTRENDS] pytrends not installed, using cache/defaults")
    except Exception as e:
        log.warning(f"[GTRENDS] Fetch failed: {e}, using cache")

    # Fallback to cache
    if "data" in cache:
        df = pd.DataFrame(cache["data"])
        log.info(f"[GTRENDS] Using cached data ({len(df)} rows)")
        return df

    # Return empty with correct columns
    cols = ["date"]
    for kw in KEYWORDS:
        safe = kw.replace(" ", "_")
        cols.extend([f"gtrends_{safe}", f"gtrends_{safe}_momentum", f"gtrends_{safe}_zscore"])
    return pd.DataFrame(columns=cols)
