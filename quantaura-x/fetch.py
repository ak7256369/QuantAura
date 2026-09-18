"""Collect everything the day's post is built from.

Sources:
  1. QuantAura public API — the model's call, UNAUTHENTICATED on purpose.
     The free tier's redaction is the content policy: this post may carry the
     direction and nothing else. Fatal if absent.
  2. Hourly closes for the 24h change — via quantaura.tech's own candles
     endpoint, with Binance direct as a local fallback (Binance 451s GitHub's
     runners). Fatal if absent: a post that states no price says nothing.
  3. The channel scoreboard in quantaura-youtube — the live public record.
     Degrades to omission: a missing record line is honest, an invented one
     is not.
"""
from __future__ import annotations

from datetime import datetime, timezone

from common import PipelineAbort, config, env, fmt_price, get_json, log


def _signal() -> dict:
    cfg = config()["api"]
    symbol = config()["channel"]["symbol"]
    res = get_json(f"{cfg['base_url']}/api/signals", params={"symbol": symbol},
                   label="api/signals")
    if not res.ok:
        raise PipelineAbort(f"Could not reach the signals API: {res.error}")

    data = (res.data or {}).get("data") or {}
    if not data.get("signal"):
        raise PipelineAbort("Signals API returned no signal field.")
    if data.get("source") == "ta_fallback":
        # Same honesty rule as the video pipeline and the Telegram bot: the
        # entire premise is the ML ensemble's call. A TA-heuristic stand-in
        # would be a different product wearing the same branding.
        raise PipelineAbort("ml-api was unavailable; the API served a TA fallback. "
                            "Refusing to post a non-ensemble call.")
    return data


def _candles_qa(symbol: str, limit: int) -> list[float] | None:
    """Closing prices via quantaura.tech's own candles endpoint."""
    res = get_json(f"{config()['api']['base_url']}/api/market/candles",
                   params={"symbol": symbol, "interval": "1h", "limit": limit},
                   retries=2, label="quantaura/candles")
    if not res.ok:
        log.warning(f"  quantaura candles unavailable: {res.error}")
        return None
    rows = (res.data or {}).get("data") or []
    try:
        return [float(r["close"]) for r in rows] or None
    except (KeyError, TypeError, ValueError) as e:                # noqa: BLE001
        log.warning(f"  quantaura candles malformed: {e}")
        return None


def _candles_binance(symbol: str, limit: int) -> list[float] | None:
    res = get_json(config()["market"]["klines_url"],
                   params={"symbol": symbol, "interval": "1h", "limit": limit},
                   retries=1, label="binance/klines")
    if not res.ok or not isinstance(res.data, list) or not res.data:
        # 451 from a US-hosted runner is expected, not alarming — it is exactly
        # why quantaura is tried first.
        log.info(f"  Binance direct unavailable ({res.error or 'empty'})")
        return None
    try:
        return [float(k[4]) for k in res.data]
    except (IndexError, TypeError, ValueError) as e:              # noqa: BLE001
        log.warning(f"  Binance klines malformed: {e}")
        return None


def _closes(symbol: str, limit: int = 26) -> list[float]:
    """Hourly closes, sourced so it works from anywhere.

    Binance answers GitHub's US-hosted runners with HTTP 451 ("restricted
    location"), so the VPS's own endpoint leads — it is not blocked, and it is
    the same venue that feeds the model. One venue for every number: mixing
    exchanges would put one book's print in the numerator and another's in the
    denominator of the same percentage. Binance direct stays as a fallback for
    local runs, where it is reachable.
    """
    for source in (_candles_qa, _candles_binance):
        rows = source(symbol, limit)
        if rows:
            return rows
    raise PipelineAbort(
        "Could not fetch price history from quantaura.tech or Binance. "
        "Nothing is posted without a verifiable price.")


def scoreboard() -> dict | None:
    """The channel's committed scoreboard, via the GitHub contents API.

    Needs SCOREBOARD_TOKEN (fine-grained PAT, contents:read on the youtube
    repo). Without it — or on any failure — returns None and the post simply
    omits the record.
    """
    token = env("SCOREBOARD_TOKEN")
    if not token:
        log.warning("  SCOREBOARD_TOKEN not set — the post will omit the public record")
        return None
    cfg = config()["scoreboard"]
    res = get_json(f"https://api.github.com/repos/{cfg['repo']}/contents/{cfg['path']}",
                   headers={"Authorization": f"Bearer {token}",
                            "Accept": "application/vnd.github.raw+json"},
                   retries=2, label="scoreboard")
    if not res.ok:
        log.warning(f"  Scoreboard unavailable ({res.error}) — omitting the record")
        return None
    # A scoreboard with zero resolved calls is returned as-is: "day one" and
    # "couldn't read the record" must stay distinguishable downstream.
    return res.data or {}


def synthetic() -> dict:
    """A fixed snapshot for --dry-run: no network, stable output."""
    return {
        "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "symbol": "BTCUSDT",
        "asset_label": "Bitcoin",
        "signal": "BUY",
        "price": 64623.48,
        "price_str": fmt_price(64623.48),
        "change_24h_pct": 0.93,
    }


def synthetic_scoreboard() -> dict:
    return {"resolved_calls": 2, "hits": 1, "misses": 1, "accuracy_pct": 50.0}


def collect() -> dict:
    """Build the day's snapshot. Raises PipelineAbort if a fatal source fails."""
    cfg = config()["channel"]
    symbol = cfg["symbol"]
    log.info("Fetching source data...")

    sig = _signal()
    closes = _closes(symbol)
    price = float(sig.get("price") or closes[-1])
    past = closes[0] if len(closes) >= 25 else None
    change = round((price - past) / past * 100, 2) if past else None

    snapshot = {
        "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "symbol": symbol,
        "asset_label": cfg["asset_label"],
        "signal": sig["signal"],
        "price": price,
        "price_str": fmt_price(price),
        "change_24h_pct": change,
    }
    log.info(f"  {symbol}: {snapshot['signal']} | {snapshot['price_str']} "
             f"({change}% 24h)")
    return snapshot
