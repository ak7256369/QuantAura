"""
Sentiment scoring module.
Primary:   CoinGecko community sentiment (free, no API key required)
Fallback:  Returns 0.0 (neutral) — models treat sentiment as one of many features,
           so neutral fallback has minimal impact on prediction quality.

Note: CryptoPanic went paid in April 2026. This module now uses CoinGecko's
free community data endpoint which provides social sentiment indicators.
"""
import requests, numpy as np, time, logging
from config import SENTIMENT_CACHE_TTL_HOURS
from utils.retry import with_retry
from utils.db import get_conn

log = logging.getLogger(__name__)

# CoinGecko symbol mapping (BTCUSDT -> bitcoin, ETHUSDT -> ethereum, etc.)
_COINGECKO_IDS = {
    "BTC": "bitcoin",
    "ETH": "ethereum",
    "BNB": "binancecoin",
    "SOL": "solana",
    "XRP": "ripple",
    "ADA": "cardano",
    "AVAX": "avalanche-2",
    "DOT": "polkadot",
    "LINK": "chainlink",
    "DOGE": "dogecoin",
}


def _fetch_coingecko_sentiment(symbol_base: str):
    """
    CoinGecko community data — free, no API key.
    Computes a sentiment score (-1 to +1).
    Rate limit: ~10-30 req/min. Uses 5s delay and 60s backoff on 429.
    Returns None on failure to avoid overwriting cache with 0.0.
    """
    cg_id = _COINGECKO_IDS.get(symbol_base)
    if not cg_id:
        return None

    url = f"https://api.coingecko.com/api/v3/coins/{cg_id}"
    params = {
        "localization": "false",
        "tickers": "false",
        "market_data": "false",
        "community_data": "true",
        "developer_data": "false",
        "sparkline": "false",
    }
    
    max_retries = 3
    for attempt in range(max_retries):
        try:
            r = requests.get(url, params=params, timeout=10)
            
            # If rate limited, back off for a full minute (CoinGecko resets every minute)
            if r.status_code == 429:
                if attempt < max_retries - 1:
                    log.warning(f"[SENTIMENT] Rate limited for {symbol_base}. Sleeping 60s...")
                    time.sleep(60)
                    continue
                else:
                    r.raise_for_status()
            
            r.raise_for_status()
            data = r.json()

            up_pct = data.get("sentiment_votes_up_percentage", 50) or 50
            down_pct = data.get("sentiment_votes_down_percentage", 50) or 50
            community_score = data.get("community_score", 0) or 0

            vote_score = (up_pct - down_pct) / 100.0
            community_norm = (community_score - 50) / 50.0
            final_score = 0.7 * vote_score + 0.3 * community_norm

            # Respect rate limits even on success
            time.sleep(5)
            
            return float(np.clip(final_score, -1.0, 1.0))

        except Exception as e:
            if attempt == max_retries - 1:
                log.warning(f"[SENTIMENT] CoinGecko failed for {symbol_base} after {max_retries} attempts: {e}")
                time.sleep(5)
                return None
            else:
                log.warning(f"[SENTIMENT] Error fetching {symbol_base}: {e}. Retrying...")
                time.sleep(10)
                
    return None


def get_sentiment(symbol: str) -> float:
    """
    Returns sentiment score for a symbol (-1 to +1 scale).
    Cached in SQLite for SENTIMENT_CACHE_TTL_HOURS.
    Falls back to stale cache, then 0.0 (neutral) if no API is available.
    """
    symbol_base = symbol.replace("USDT", "")
    now = int(time.time())
    ttl = SENTIMENT_CACHE_TTL_HOURS * 3600

    # Check cache first
    with get_conn() as conn:
        row = conn.execute(
            "SELECT score, fetched_at FROM sentiment_cache WHERE symbol=?", (symbol_base,)
        ).fetchone()
        
    if row and (now - row[1]) < ttl:
        return row[0]

    # Try CoinGecko community sentiment
    score = _fetch_coingecko_sentiment(symbol_base)

    if score is not None:
        # Success: Cache the new result
        with get_conn() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO sentiment_cache(symbol,score,fetched_at) VALUES(?,?,?)",
                (symbol_base, score, now)
            )
        return score
    else:
        # Failure: Reuse stale cache if it exists, otherwise 0.0
        fallback_score = row[0] if row else 0.0
        # Update fetched_at so we don't hammer the API on the next cycle
        with get_conn() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO sentiment_cache(symbol,score,fetched_at) VALUES(?,?,?)",
                (symbol_base, fallback_score, now)
            )
        return fallback_score
