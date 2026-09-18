# Keyless sources: Fear & Greed (alternative.me), DXY + SP500 (yfinance), BTC dominance (CoinGecko)
import pandas as pd, requests, yfinance as yf, time, numpy as np
from config import FEAR_GREED_CACHE_TTL_HOURS, COINGECKO_CACHE_TTL_HOURS
from utils.retry import with_retry
from utils.db import get_conn

@with_retry(max_attempts=3)
def fetch_fear_greed_history(limit: int = 1825) -> pd.DataFrame:
    """Returns daily Fear & Greed: date(str), fear_greed(int 0–100)."""
    r = requests.get(f"https://api.alternative.me/fng/?limit={limit}&format=json", timeout=10)
    r.raise_for_status()
    df = pd.DataFrame(r.json()["data"])[["timestamp", "value"]]
    df.columns = ["ts", "fear_greed"]
    df["date"]       = pd.to_datetime(df["ts"].astype("int64"), unit="s", utc=True).dt.strftime("%Y-%m-%d")
    df["fear_greed"] = df["fear_greed"].astype(int)
    return df[["date","fear_greed"]].sort_values("date").reset_index(drop=True)

def get_current_fear_greed() -> int:
    """Returns today's score. Cached 24h in SQLite."""
    now = int(time.time()); ttl = FEAR_GREED_CACHE_TTL_HOURS * 3600
    with get_conn() as conn:
        row = conn.execute(
            "SELECT score, fetched_at FROM sentiment_cache WHERE symbol='__FEAR_GREED__'"
        ).fetchone()
    if row and (now - row[1]) < ttl:
        return int(row[0])
    r     = requests.get("https://api.alternative.me/fng/?limit=1", timeout=10)
    score = int(r.json()["data"][0]["value"])
    with get_conn() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO sentiment_cache(symbol,score,fetched_at) VALUES(?,?,?)",
            ("__FEAR_GREED__", score, now)
        )
    return score

@with_retry(max_attempts=3)
def fetch_dxy_sp500(years: int = 5) -> pd.DataFrame:
    """
    Returns daily: date, dxy_level, dxy_return(daily%),
    dxy_weekly_return, sp500_return(daily%), sp500_weekly_return, sp500_monthly_return
    """
    dxy = yf.Ticker("DX-Y.NYB").history(period=f"{years}y", interval="1d")["Close"]
    spx = yf.Ticker("^GSPC").history(period=f"{years}y", interval="1d")["Close"]
    df  = pd.DataFrame({"dxy_level": dxy, "sp500_close": spx}).dropna()
    
    if df.empty:
        return pd.DataFrame(columns=["date","dxy_level","dxy_return","dxy_weekly_return",
                                     "sp500_return","sp500_weekly_return","sp500_monthly_return"])
        
    if df.index.tz is None:
        df.index = df.index.tz_localize("UTC")
    else:
        df.index = df.index.tz_convert("UTC")
    df["dxy_return"]           = df["dxy_level"].pct_change(1)
    df["dxy_weekly_return"]    = df["dxy_level"].pct_change(5)
    df["sp500_return"]         = df["sp500_close"].pct_change(1)
    df["sp500_weekly_return"]  = df["sp500_close"].pct_change(5)
    df["sp500_monthly_return"] = df["sp500_close"].pct_change(21)
    df["date"] = df.index.strftime("%Y-%m-%d")
    df = df.drop(columns=["sp500_close"]).fillna(0).reset_index(drop=True)
    return df[["date","dxy_level","dxy_return","dxy_weekly_return",
               "sp500_return","sp500_weekly_return","sp500_monthly_return"]]

def get_current_btc_dominance() -> float:
    """Returns BTC dominance %. Cached 6h in SQLite."""
    now = int(time.time()); ttl = COINGECKO_CACHE_TTL_HOURS * 3600
    with get_conn() as conn:
        row = conn.execute(
            "SELECT score, fetched_at FROM sentiment_cache WHERE symbol='__BTC_DOM__'"
        ).fetchone()
    if row and (now - row[1]) < ttl:
        return float(row[0])
    r = requests.get("https://api.coingecko.com/api/v3/global", timeout=10)
    r.raise_for_status()
    dom = r.json()["data"]["market_cap_percentage"]["btc"]
    with get_conn() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO sentiment_cache(symbol,score,fetched_at) VALUES(?,?,?)",
            ("__BTC_DOM__", dom, now)
        )
    return float(dom)

def build_full_macro_df() -> pd.DataFrame:
    """
    Merges FRED + Fear&Greed + DXY + SP500 into one daily DataFrame.
    This is the master reference table for all macro data.
    """
    from data_sources.macro_fred import fetch_all_fred
    import logging
    
    log = logging.getLogger(__name__)
    fred = fetch_all_fred()
    
    try:
        fg = fetch_fear_greed_history()
    except Exception as e:
        log.warning(f"Failed to fetch Fear & Greed: {e}")
        fg = pd.DataFrame(columns=["date", "fear_greed"])
        
    try:
        ds = fetch_dxy_sp500()
    except Exception as e:
        log.warning(f"Failed to fetch DXY/SP500 after retries: {e}")
        ds = pd.DataFrame(columns=["date","dxy_level","dxy_return","dxy_weekly_return",
                                   "sp500_return","sp500_weekly_return","sp500_monthly_return"])
                                   
    # OUTER-merge on a full date spine: if FRED is down (its frame collapses to
    # a 1-row default) fear&greed + DXY/SP500 data must still survive.
    frames = [f for f in (fred, fg, ds) if f is not None and len(f) > 1]
    if not frames:
        return fred
    spine = pd.DataFrame({"date": sorted(set().union(*[set(f["date"]) for f in frames]))})
    merged = spine
    for f in (fred, fg, ds):
        if f is not None and not f.empty:
            merged = merged.merge(f, on="date", how="left")
    return merged.ffill().bfill().infer_objects(copy=False).fillna(0)
