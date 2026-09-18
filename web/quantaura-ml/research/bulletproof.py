# research/bulletproof.py — closes the two remaining attackable holes in the
# headline propagation result.
#
# HOLE 1 — EVENT OVERLAP. BTC regime flips can occur within 6 candles of each
# other, so their 24h evaluation windows overlap and the pooled two-proportion
# z-test's independence assumption is violated. Fix: re-run the pooled
# out-of-sample test keeping only NON-OVERLAPPING events (each accepted flip's
# window must end before the next accepted flip begins), thinning control rows
# to the same spacing. If significance survives on the thinned sample, the
# headline claim no longer rests on dependent observations.
#
# HOLE 2 — ONE EXCHANGE, ONE QUOTE CURRENCY. Everything so far is Binance
# USDT pairs; our own bibliography (Balcilar & Ozdemir 2023) says stablecoin
# denomination matters. Fix: replicate the full 60/40 out-of-sample gate on
# COINBASE USD pairs — a different venue, matching engine, user base AND quote
# currency in one test. BNB does not trade on Coinbase and is excluded (noted).
#
# Run:  .venv/Scripts/python.exe research/bulletproof.py
# Out:  logs/bulletproof.json

import os, sys, json, time, logging, warnings
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
warnings.filterwarnings("ignore")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
log = logging.getLogger("bulletproof")

import requests

from config import SYMBOLS, LOG_DIR
from data_sources.binance_spot import fetch_ohlcv
from research.btc_effects import _align, BTC, ALTS, DAYS_4H
from research.robustness import regime_series, _z_test

HORIZON = 6
CB_BASE = "https://api.exchange.coinbase.com"
CB_PRODUCTS = {          # BNB-USD does not exist on Coinbase — excluded, and said so
    "BTCUSDT": "BTC-USD", "ETHUSDT": "ETH-USD", "SOLUSDT": "SOL-USD",
    "XRPUSDT": "XRP-USD", "ADAUSDT": "ADA-USD", "AVAXUSDT": "AVAX-USD",
    "DOTUSDT": "DOT-USD", "LINKUSDT": "LINK-USD", "DOGEUSDT": "DOGE-USD",
}


# ── shared: convergence with optional non-overlap thinning ───────────────────

def _thin(positions, spacing):
    """Keep events so that consecutive accepted events are >= spacing apart —
    evaluation windows can then never overlap."""
    kept, last = [], -10**9
    for p in sorted(positions):
        if p - last >= spacing:
            kept.append(p)
            last = p
    return kept


def _converge_counts(a_vals, b_vals, positions, n):
    ev = cv = 0
    for pos in positions:
        if pos + HORIZON >= n:
            continue
        target = b_vals[pos]
        if a_vals[pos] == target:
            continue
        ev += 1
        window = a_vals[pos + 1: pos + 1 + HORIZON]
        if len(np.where(window == target)[0]):
            cv += 1
    return ev, cv


def propagation_oos(close4h: pd.DataFrame, alts, non_overlapping=False) -> dict:
    """The Phase C pooled 60/40 out-of-sample test, optionally with
    non-overlapping events and spacing-matched controls."""
    t_ev = t_cv = c_ev = c_cv = 0
    per_coin = {}
    for sym in alts:
        if sym not in close4h.columns:
            continue
        b = regime_series(close4h[BTC], 0.20, 12, 26)
        a = regime_series(close4h[sym], 0.20, 12, 26)
        df = pd.DataFrame({"b": b, "a": a}).dropna().reset_index(drop=True)
        if len(df) < 400:
            continue
        n = len(df)
        cut = int(n * 0.60)
        flips = df["b"] != df["b"].shift(1)
        flip_pos = [i for i in df.index[flips & df["b"].shift(1).notna()] if i >= cut]
        ctrl_pos = [i for i in range(cut, n) if i not in set(flip_pos)]
        if non_overlapping:
            flip_pos = _thin(flip_pos, HORIZON + 1)
            ctrl_pos = _thin(ctrl_pos, HORIZON + 1)
        ev, cv = _converge_counts(df["a"].values, df["b"].values, flip_pos, n)
        ev2, cv2 = _converge_counts(df["a"].values, df["b"].values, ctrl_pos, n)
        t_ev += ev; t_cv += cv; c_ev += ev2; c_cv += cv2
        per_coin[sym] = {
            "n_events": ev,
            "follow_rate": round(cv / ev, 4) if ev else None,
            "control_rate": round(cv2 / ev2, 4) if ev2 else None,
            "lift": round(cv / ev - cv2 / ev2, 4) if ev and ev2 else None,
        }
    if not t_ev or not c_ev:
        return {"error": "no events"}
    fr, cr = t_cv / t_ev, c_cv / c_ev
    z, p = _z_test(t_cv, t_ev, c_cv, c_ev)
    pos_lifts = sum(1 for v in per_coin.values() if (v["lift"] or 0) > 0)
    return {
        "pooled": {"follow_rate": round(fr, 4), "control_rate": round(cr, 4),
                   "lift": round(fr - cr, 4), "n_events": t_ev, "n_control": c_ev,
                   "z": round(z, 3) if z else None,
                   "p_value": float(f"{p:.6f}") if p is not None else None,
                   "significant": bool(p is not None and p < 0.05)},
        "coins_positive": pos_lifts,
        "coins_evaluated": len(per_coin),
        "per_coin": per_coin,
    }


# ── Coinbase fetch ───────────────────────────────────────────────────────────

def fetch_coinbase_1h(product: str, days: int) -> pd.DataFrame:
    """Paginated public candles: 300 per request, granularity 3600."""
    end = pd.Timestamp.utcnow().floor("h")
    start = end - pd.Timedelta(days=days)
    rows = []
    cursor = start
    while cursor < end:
        chunk_end = min(cursor + pd.Timedelta(hours=300), end)
        r = requests.get(
            f"{CB_BASE}/products/{product}/candles",
            params={"granularity": 3600,
                    "start": cursor.isoformat(),
                    "end": chunk_end.isoformat()},
            timeout=20)
        if r.status_code == 429:                       # rate limited — back off
            time.sleep(1.5)
            continue
        r.raise_for_status()
        rows.extend(r.json())
        cursor = chunk_end
        time.sleep(0.12)                               # stay under 10 req/s
    if not rows:
        return pd.DataFrame()
    df = pd.DataFrame(rows, columns=["time", "low", "high", "open", "close", "volume"])
    df = df.drop_duplicates("time").sort_values("time").reset_index(drop=True)
    df["timestamp"] = df["time"].astype(np.int64) * 1000
    return df[["timestamp", "open", "high", "low", "close", "volume"]]


def resample_4h(df: pd.DataFrame) -> pd.DataFrame:
    """1h -> 4h OHLC aligned to UTC 4h boundaries, matching Binance 4h candles."""
    s = df.set_index(pd.to_datetime(df["timestamp"], unit="ms", utc=True))
    o = s["close"].resample("4h").last().dropna()
    out = pd.DataFrame({"close": o})
    out["timestamp"] = (out.index.astype(np.int64) // 10**6)
    return out.reset_index(drop=True)


# ── main ─────────────────────────────────────────────────────────────────────

def main():
    report = {"meta": {"generated": pd.Timestamp.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
                       "purpose": "Independence-robust re-test + cross-exchange replication"}}

    # ── 1. Non-overlap re-test on the primary (Binance) data ────────────────
    log.info("[1/2] Binance: pooled OOS with and without overlapping events...")
    frames = {}
    for sym in SYMBOLS:
        try:
            frames[sym] = fetch_ohlcv(sym, "4h", days=DAYS_4H)
        except Exception as e:
            log.warning(f"  {sym}: {e}")
    close4h = _align(frames)
    base = propagation_oos(close4h, ALTS, non_overlapping=False)
    thin = propagation_oos(close4h, ALTS, non_overlapping=True)
    report["binance"] = {
        "all_events": base,
        "non_overlapping_events": thin,
        "note": ("Non-overlapping: consecutive treatment events spaced > horizon so "
                 "no evaluation windows overlap; control rows thinned to the same "
                 "spacing. Removes the dependence objection to the z-test."),
    }
    log.info(f"      all: lift={base['pooled']['lift']} p={base['pooled']['p_value']} n={base['pooled']['n_events']}")
    log.info(f"      non-overlap: lift={thin['pooled']['lift']} p={thin['pooled']['p_value']} n={thin['pooled']['n_events']}")

    # ── 2. Coinbase USD replication ─────────────────────────────────────────
    log.info("[2/2] Coinbase USD pairs (different exchange AND quote currency)...")
    cb_frames = {}
    for sym, product in CB_PRODUCTS.items():
        try:
            raw = fetch_coinbase_1h(product, DAYS_4H)
            if len(raw) < 5000:
                log.warning(f"  {product}: only {len(raw)} 1h candles — skipped")
                continue
            cb_frames[sym] = resample_4h(raw)
            log.info(f"  {product}: {len(raw)} 1h -> {len(cb_frames[sym])} 4h candles")
        except Exception as e:
            log.warning(f"  {product}: {e}")
    if BTC in cb_frames and len(cb_frames) >= 5:
        cb_close = _align(cb_frames)
        cb_alts = [s for s in cb_frames if s != BTC]
        cb_all = propagation_oos(cb_close, cb_alts, non_overlapping=False)
        cb_thin = propagation_oos(cb_close, cb_alts, non_overlapping=True)
        report["coinbase"] = {
            "products": {k: v for k, v in CB_PRODUCTS.items() if k in cb_frames},
            "excluded": {"BNBUSDT": "BNB does not trade on Coinbase"},
            "n_4h_rows": int(len(cb_close)),
            "all_events": cb_all,
            "non_overlapping_events": cb_thin,
        }
        log.info(f"      Coinbase all: lift={cb_all['pooled']['lift']} p={cb_all['pooled']['p_value']} "
                 f"coins+ {cb_all['coins_positive']}/{cb_all['coins_evaluated']}")
        log.info(f"      Coinbase non-overlap: lift={cb_thin['pooled']['lift']} p={cb_thin['pooled']['p_value']}")
    else:
        report["coinbase"] = {"error": "insufficient Coinbase data fetched"}

    path = os.path.join(LOG_DIR, "bulletproof.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)
    log.info(f"Saved {path}")


if __name__ == "__main__":
    main()
