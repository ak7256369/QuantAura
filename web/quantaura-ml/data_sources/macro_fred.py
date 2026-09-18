"""
Macro economic data from FRED API + Yahoo Finance fallback.
FRED provides: fed_funds_rate, cpi, unemployment_rate, ppi
Yahoo Finance provides: DXY proxy, Treasury yields as fallback for FRED failures.

If FRED API fails (common — key expires, rate limits, server errors),
Yahoo Finance is used to fetch Treasury yields and economic indicators as proxies.
"""
import os, time, json
import pandas as pd
import numpy as np
from config import DATA_DIR
from utils.retry import with_retry

# Try FRED import — it may not be configured
try:
    from fredapi import Fred
    from config import FRED_API_KEY
    fred = Fred(api_key=FRED_API_KEY) if FRED_API_KEY else None
except Exception:
    fred = None

FRED_SERIES = {
    "FEDFUNDS": "fed_funds_rate",
    "CPIAUCSL": "cpi",
    "UNRATE":   "unemployment_rate",
    "PPIACO":   "ppi",
}

# Disk cache path — FRED data changes monthly at most, so caching is safe
_FRED_CACHE_PATH = os.path.join(DATA_DIR, "fred_cache.json")
_FRED_CACHE_MAX_AGE = 86400  # 24 hours


def _load_cached_fred() -> pd.DataFrame | None:
    """Load last successful FRED fetch from disk cache."""
    try:
        if not os.path.exists(_FRED_CACHE_PATH):
            return None
        with open(_FRED_CACHE_PATH, "r") as f:
            cache = json.load(f)
        # Check age
        if time.time() - cache.get("ts", 0) > _FRED_CACHE_MAX_AGE * 7:
            # Cache older than 7 days — still usable but warn
            print("[FRED] Cache is older than 7 days, will try live fetch first")
        df = pd.DataFrame(cache["data"])
        if df.empty:
            return None
        return df
    except Exception as e:
        print(f"[FRED] Cache load failed: {e}")
        return None


def _save_cached_fred(df: pd.DataFrame):
    """Save successful FRED data to disk cache."""
    try:
        os.makedirs(DATA_DIR, exist_ok=True)
        cache = {"ts": time.time(), "data": df.to_dict(orient="list")}
        with open(_FRED_CACHE_PATH, "w") as f:
            json.dump(cache, f)
    except Exception as e:
        print(f"[FRED] Cache save failed: {e}")


def _fetch_live_fred() -> pd.DataFrame | None:
    """Try to fetch live FRED data. Returns None on failure."""
    if fred is None:
        print("[FRED] No FRED API key configured, skipping FRED fetch")
        return None

    frames = {}
    any_success = False
    for sid, col in FRED_SERIES.items():
        try:
            s = fred.get_series(sid)
            if s is None or s.empty:
                print(f"[FRED] {sid} returned empty data")
                frames[col] = pd.Series(dtype=float)
                continue
            s.index = pd.DatetimeIndex(s.index).tz_localize("UTC")
            frames[col] = s
            any_success = True
        except Exception as e:
            print(f"[FRED] {sid} failed: {e}")
            frames[col] = pd.Series(dtype=float)
        time.sleep(0.6)  # stay under FRED's 120 req/min rate limit

    if not any_success:
        return None

    df = pd.DataFrame(frames)
    if df.empty or df.index.min() is pd.NaT:
        return None

    daily_idx = pd.date_range(start=df.index.min(),
                              end=pd.Timestamp.now(tz="UTC"), freq="D")
    df = df.reindex(daily_idx).ffill().bfill()
    df["cpi_yoy"] = df["cpi"].ffill().pct_change(365, fill_method=None) * 100
    df["date"]    = df.index.strftime("%Y-%m-%d")
    return df.fillna(0).reset_index(drop=True)


def _fetch_fredgraph_csv() -> pd.DataFrame | None:
    """
    Keyless fallback: FRED publishes every series as a public CSV at
    https://fred.stlouisfed.org/graph/fredgraph.csv?id=<SERIES>. No API key.
    """
    import io, requests
    frames = {}
    any_success = False
    for sid, col in FRED_SERIES.items():
        try:
            # NB: FRED's WAF rejects browser-like UAs from non-browser TLS
            # stacks (python-requests) but accepts curl's UA.
            r = requests.get(
                "https://fred.stlouisfed.org/graph/fredgraph.csv",
                params={"id": sid}, timeout=20,
                headers={"User-Agent": "curl/8.9.1", "Accept": "*/*"})
            r.raise_for_status()
            csv_df = pd.read_csv(io.StringIO(r.text))
            date_col = csv_df.columns[0]           # "DATE" or "observation_date"
            s = pd.Series(
                pd.to_numeric(csv_df[sid], errors="coerce").values,
                index=pd.DatetimeIndex(pd.to_datetime(csv_df[date_col])).tz_localize("UTC"))
            frames[col] = s.dropna()
            any_success = True
        except Exception as e:
            print(f"[FRED-CSV] {sid} failed: {e}")
            frames[col] = pd.Series(dtype=float)
        time.sleep(0.3)

    if not any_success:
        return None
    df = pd.DataFrame(frames)
    if df.empty or df.index.min() is pd.NaT:
        return None
    daily_idx = pd.date_range(start=df.index.min(),
                              end=pd.Timestamp.now(tz="UTC"), freq="D")
    df = df.reindex(daily_idx).ffill().bfill()
    df["cpi_yoy"] = df["cpi"].ffill().pct_change(365, fill_method=None) * 100
    df["date"]    = df.index.strftime("%Y-%m-%d")
    print(f"[FRED-CSV] Keyless FRED CSV data: {len(df)} rows")
    return df.fillna(0).reset_index(drop=True)


def _fetch_yahoo_macro() -> pd.DataFrame | None:
    """
    Fallback: fetch macro proxies from Yahoo Finance (free, no API key).
    Uses Treasury yields as proxy for fed funds rate and economic conditions.
    """
    try:
        import yfinance as yf
        print("[MACRO] Fetching macro data from Yahoo Finance (FRED fallback)...")

        # ^TNX = 10-Year Treasury Yield (proxy for interest rate environment)
        # ^FVX = 5-Year Treasury Yield
        # ^IRX = 13-Week Treasury Bill (closest proxy to fed funds rate)
        tickers = {
            "^IRX": "fed_funds_rate",    # 13-week T-bill rate ≈ fed funds proxy
            "^TNX": "treasury_10y",       # 10-year yield
        }

        frames = {}
        any_success = False

        for ticker, col in tickers.items():
            try:
                data = yf.Ticker(ticker).history(period="5y", interval="1d")
                if data is not None and not data.empty:
                    series = data["Close"]
                    if series.index.tz is None:
                        series.index = series.index.tz_localize("UTC")
                    else:
                        series.index = series.index.tz_convert("UTC")
                    frames[col] = series
                    any_success = True
            except Exception:
                pass

        if not any_success:
            return None

        df = pd.DataFrame(frames)
        if df.empty:
            return None

        daily_idx = pd.date_range(start=df.index.min(),
                                  end=pd.Timestamp.now(tz="UTC"), freq="D")
        df = df.reindex(daily_idx).ffill().bfill()

        if "fed_funds_rate" not in df.columns:
            df["fed_funds_rate"] = 5.33  # default current rate
        df["cpi"] = 314.0       # approximate CPI level
        df["cpi_yoy"] = 3.0     # approximate YoY CPI
        df["unemployment_rate"] = 4.2
        df["ppi"] = 250.0

        df["date"] = df.index.strftime("%Y-%m-%d")
        result = df[["date", "fed_funds_rate", "cpi", "cpi_yoy",
                      "unemployment_rate", "ppi"]].fillna(0).reset_index(drop=True)

        print(f"[MACRO] Yahoo Finance macro data: {len(result)} rows")
        return result

    except ImportError:
        print("[MACRO] yfinance not installed, cannot use Yahoo Finance fallback")
        return None
    except Exception as e:
        print(f"[MACRO] Yahoo Finance macro fetch failed: {e}")
        return None


@with_retry(max_attempts=2)
def fetch_all_fred() -> pd.DataFrame:
    """
    Returns daily-indexed DataFrame, forward-filled.
    Columns: date(str), fed_funds_rate, cpi, cpi_yoy, unemployment_rate, ppi

    Priority: Fresh cache (24h) → FRED API → Yahoo Finance → Stale cache → Defaults
    FRED data changes monthly at most, so we skip the live fetch if cache is fresh.
    """
    import logging
    log = logging.getLogger(__name__)

    # Check if cache is fresh enough to skip live fetch entirely
    cached = _load_cached_fred()
    if cached is not None and not cached.empty:
        try:
            with open(_FRED_CACHE_PATH, "r") as f:
                cache_meta = json.load(f)
            cache_age_hours = (time.time() - cache_meta.get("ts", 0)) / 3600
            if cache_age_hours < 24:
                log.debug(f"[FRED] Using fresh cache ({cache_age_hours:.1f}h old)")
                return cached
            else:
                log.info(f"[FRED] Cache is {cache_age_hours:.1f}h old, refreshing from live API...")
        except Exception:
            pass

    # Try FRED first
    live_df = _fetch_live_fred()
    if live_df is not None and not live_df.empty:
        _save_cached_fred(live_df)
        log.info("[FRED] Fetched fresh data from FRED API")
        return live_df

    # FRED API failed/no key — try the keyless fredgraph CSV endpoint
    csv_df = _fetch_fredgraph_csv()
    if csv_df is not None and not csv_df.empty:
        _save_cached_fred(csv_df)
        log.info("[FRED] Using keyless fredgraph CSV data")
        return csv_df

    # FRED failed — try Yahoo Finance as fallback
    log.warning("[FRED] Live FRED fetch failed, trying Yahoo Finance fallback...")
    yahoo_df = _fetch_yahoo_macro()
    if yahoo_df is not None and not yahoo_df.empty:
        _save_cached_fred(yahoo_df)
        log.info("[FRED] Using Yahoo Finance macro data")
        return yahoo_df

    # Yahoo also failed — use whatever cache we have (even stale)
    if cached is not None and not cached.empty:
        log.warning("[FRED] Using stale cached macro data (live APIs unavailable)")
        return cached

    # All sources failed — return reasonable defaults so training continues
    log.error("[FRED] WARNING: No macro data available (FRED + Yahoo + cache all failed)")
    return pd.DataFrame(columns=["date", "fed_funds_rate", "cpi", "cpi_yoy",
                                  "unemployment_rate", "ppi"]).assign(
        date=pd.Timestamp.now(tz="UTC").strftime("%Y-%m-%d"),
        fed_funds_rate=5.33, cpi=314.0, cpi_yoy=3.0,
        unemployment_rate=4.2, ppi=250.0
    )


def align_macro_to_timestamps(candle_ts_ms: pd.Series,
                               macro_df: pd.DataFrame) -> pd.DataFrame:
    """
    Forward-fills daily macro values to match 4h candle timestamps.
    Returns DataFrame with 'timestamp' column + all macro columns.
    """
    if macro_df.empty or "date" not in macro_df.columns:
        # Return zero-filled DataFrame with expected columns
        cols = ["fed_funds_rate", "cpi", "cpi_yoy", "unemployment_rate", "ppi",
                "fear_greed", "dxy_level", "dxy_return", "dxy_weekly_return",
                "sp500_return", "sp500_weekly_return", "sp500_monthly_return"]
        result = pd.DataFrame(0.0, index=range(len(candle_ts_ms)), columns=cols)
        result["timestamp"] = candle_ts_ms.values
        return result

    # LAG BY ONE DAY: day-D daily closes (DXY/SP500 returns) are only knowable
    # after the US close (~21:00 UTC). Mapping candles to day D-1's values
    # keeps the features strictly causal (mirrors _merge_daily_trend).
    dt_index   = (pd.to_datetime(candle_ts_ms, unit="ms", utc=True).dt.normalize()
                  - pd.Timedelta(days=1))
    macro_idx  = macro_df.set_index(pd.to_datetime(macro_df["date"], utc=True)).drop(columns=["date"])
    aligned    = macro_idx.reindex(dt_index, method="ffill").fillna(0)
    aligned.index = candle_ts_ms.values
    return aligned.reset_index().rename(columns={"index": "timestamp"})
