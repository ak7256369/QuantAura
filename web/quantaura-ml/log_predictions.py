"""
log_predictions.py — expanded prediction logging + regime grader (increment 4).

Produces the immutable data the transparency dashboard (and _stage_calibrate.py)
need. Two append-only JSONL logs, joined by forecast_id:

  state/predictions_full.jsonl  — one row per (symbol, 4h-cutoff): the FULL record
                                   serve.py emits (raw + calibrated vectors,
                                   per-model vectors, gate metadata, versions).
  state/resolutions.jsonl       — one row per resolved forecast: the regime label
                                   at cutoff+24h (regime_label_v1) AND the ±1%
                                   price-band outcome, kept as separate graded
                                   events (never merged — see the methods brief).

Both logs are append-only and never rewritten; corrections would be new rows.

Usage:
  python log_predictions.py --log            # predict all 10 symbols, append forecasts
  python log_predictions.py --grade          # resolve forecasts whose 24h has elapsed
  python log_predictions.py --self-test      # offline check of the regime + price grader

Runs on a schedule (e.g. minute 6 past each 4h close for --log; hourly for
--grade). Requires serve.py reachable at ML_API_URL for --log.
"""
from __future__ import annotations
import argparse
import json
import os
import time
import uuid
import urllib.request
from datetime import datetime, timezone

import numpy as np
import pandas as pd

from config import (SYMBOLS, MODEL_DIR,
                    LABEL_EMA_FAST, LABEL_EMA_SLOW, LABEL_VOL_WINDOW,
                    LABEL_FORWARD_CANDLES, LABEL_TREND_TAU)
from feature_engineering.labels import _causal_vol
# data_sources.binance_spot is imported lazily inside log_all/grade_pending so
# that --self-test runs without the live-fetch dependency (python-binance).

ML_API_URL   = os.getenv("ML_API_URL", "http://localhost:5051")
_HERE        = os.path.dirname(os.path.abspath(__file__))
STATE_DIR    = os.getenv("PREDICTION_LOG_DIR", os.path.join(_HERE, "state"))
FORECASTS    = os.path.join(STATE_DIR, "predictions_full.jsonl")
RESOLUTIONS  = os.path.join(STATE_DIR, "resolutions.jsonl")
INTERVAL_MS  = 14_400_000                      # 4h
HORIZON_MS   = LABEL_FORWARD_CANDLES * INTERVAL_MS
PRICE_BAND_PCT = 1.0                            # ±1% directional flat band
CLASSES      = ["BUY", "HOLD", "SELL"]
OUTCOME_RULE = "regime_label_v1+priceband_v1"


# ── shared frozen regime classifier (mirrors feature_engineering/labels.py) ────
def regime_z(df: pd.DataFrame) -> pd.Series:
    """Vol-normalized trend score z_t for each 4h bar (regime_label_v1).
    z > tau → BUY, z < -tau → SELL, else HOLD. NaN where history is insufficient."""
    close = df["close"].astype(float)
    ema_f = close.ewm(span=LABEL_EMA_FAST, adjust=False).mean()
    ema_s = close.ewm(span=LABEL_EMA_SLOW, adjust=False).mean()
    score = (ema_f - ema_s) / close
    vol = _causal_vol(close, LABEL_FORWARD_CANDLES, LABEL_VOL_WINDOW)
    return score / vol.replace(0, np.nan)


def regime_from_z(z: float) -> str | None:
    if z is None or (isinstance(z, float) and np.isnan(z)):
        return None
    if z > LABEL_TREND_TAU:
        return "BUY"
    if z < -LABEL_TREND_TAU:
        return "SELL"
    return "HOLD"


# ── log helpers ────────────────────────────────────────────────────────────────
def _read_jsonl(path):
    if not os.path.exists(path):
        return []
    out = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    out.append(json.loads(line))
                except Exception:
                    pass
    return out


def _append_jsonl(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "a", encoding="utf-8") as f:
        f.write(json.dumps(obj) + "\n")


def _iso(ms=None):
    dt = datetime.now(timezone.utc) if ms is None else datetime.fromtimestamp(ms / 1000, timezone.utc)
    return dt.isoformat()


# ── logging ────────────────────────────────────────────────────────────────────
def _predict(symbol):
    url = f"{ML_API_URL}/predict?symbol={symbol}"
    with urllib.request.urlopen(url, timeout=30) as r:
        if r.status != 200:
            raise RuntimeError(f"serve {r.status}")
        return json.loads(r.read().decode("utf-8"))


def log_all(symbols=SYMBOLS):
    """Append one forecast row per symbol for the latest closed 4h bar."""
    existing = {(r.get("symbol"), r.get("forecast_cutoff_ms"))
                for r in _read_jsonl(FORECASTS)}
    added = 0
    for symbol in symbols:
        try:
            from data_sources.binance_spot import fetch_ohlcv
            df = fetch_ohlcv(symbol, "4h", days=3)     # just need the latest closed bar
            if df.empty:
                print(f"[log] {symbol}: no candles, skip"); continue
            last = df.iloc[-1]
            cutoff_open_ms = int(last["timestamp"])
            cutoff_close_ms = cutoff_open_ms + INTERVAL_MS
            if (symbol, cutoff_close_ms) in existing:
                continue                                # idempotent per 4h close
            pred = _predict(symbol)
            row = {
                "forecast_id": uuid.uuid4().hex,
                "symbol": symbol,
                "forecast_cutoff_ms": cutoff_close_ms,
                "made_at": _iso(),
                "issue_price": float(last["close"]),
                "issued_class":  pred.get("signal"),
                "signal_raw":    pred.get("signal_raw"),
                "gated":         pred.get("gated"),
                "gate_basis":    pred.get("gate_basis"),
                "gate_threshold_pct": pred.get("gate_threshold_pct"),
                "confidence":    pred.get("confidence"),
                "raw_max":       pred.get("raw_max"),
                "cal_max":       pred.get("cal_max"),
                "cal_top_class": pred.get("cal_top_class"),
                "p_raw":         pred.get("p_raw"),
                "p_cal":         pred.get("p_cal"),
                "per_model_raw": pred.get("per_model_raw"),
                "weights_used":  pred.get("weights_used"),
                "calibrator_version": pred.get("calibrator_version"),
                "label_contract": pred.get("label_contract", "regime_label_v1"),
                "resolved": False,
            }
            _append_jsonl(FORECASTS, row)
            added += 1
            print(f"[log] {symbol} {row['issued_class']}@{row['confidence']}% cutoff={cutoff_close_ms}")
        except Exception as e:
            print(f"[log] {symbol}: {e}")
    print(f"[log] appended {added} forecast(s)")
    return added


# ── grading ────────────────────────────────────────────────────────────────────
def _price_band_correct(issued, change_pct):
    if issued == "BUY":
        return change_pct > PRICE_BAND_PCT
    if issued == "SELL":
        return change_pct < -PRICE_BAND_PCT
    if issued == "HOLD":
        return abs(change_pct) <= PRICE_BAND_PCT
    return None


def grade_pending():
    """Resolve every forecast whose 24h horizon has elapsed and isn't yet graded."""
    forecasts = _read_jsonl(FORECASTS)
    done = {r.get("forecast_id") for r in _read_jsonl(RESOLUTIONS)}
    now_ms = int(time.time() * 1000)
    graded = 0
    # cache candles per symbol within one run
    candles = {}
    for fc in forecasts:
        fid = fc.get("forecast_id")
        if fid in done:
            continue
        cutoff_close = fc.get("forecast_cutoff_ms")
        symbol = fc.get("symbol")
        if not cutoff_close or not symbol:
            continue
        endpoint_open = cutoff_close - INTERVAL_MS + HORIZON_MS   # open time of the endpoint bar
        endpoint_close = endpoint_open + INTERVAL_MS
        if now_ms < endpoint_close:
            continue                                              # horizon not elapsed
        if symbol not in candles:
            from data_sources.binance_spot import fetch_ohlcv
            candles[symbol] = fetch_ohlcv(symbol, "4h", days=45)  # >= 180 bars history + horizon
        df = candles[symbol]
        z = regime_z(df)
        idx = df.index[df["timestamp"] == endpoint_open]
        status = "resolved"
        regime_actual = None
        endpoint_price = None
        change_pct = None
        if len(idx) == 0 or pd.isna(z.iloc[idx[0]]):
            status = "UNGRADABLE"     # endpoint bar missing or insufficient history
        else:
            i = idx[0]
            regime_actual = regime_from_z(float(z.iloc[i]))
            endpoint_price = float(df.iloc[i]["close"])
            issue_price = fc.get("issue_price")
            if issue_price:
                change_pct = round((endpoint_price - issue_price) / issue_price * 100, 3)
        res = {
            "forecast_id": fid,
            "symbol": symbol,
            "resolves_at_ms": endpoint_close,
            "resolved_at": _iso(),
            "resolution_status": status,
            "outcome_rule_version": OUTCOME_RULE,
            "regime_actual": regime_actual,
            "regime_correct": (None if regime_actual is None
                               else fc.get("issued_class") == regime_actual),
            "endpoint_price": endpoint_price,
            "change_pct": change_pct,
            "price_flat_band_pct": PRICE_BAND_PCT,
            "directional_correct": (None if change_pct is None
                                    else _price_band_correct(fc.get("issued_class"), change_pct)),
        }
        _append_jsonl(RESOLUTIONS, res)
        graded += 1
        print(f"[grade] {symbol} {fc.get('issued_class')} → regime={regime_actual} "
              f"({status}) regime_correct={res['regime_correct']}")
    print(f"[grade] wrote {graded} resolution(s)")
    return graded


# ── offline self-test of the graders ───────────────────────────────────────────
def _self_test():
    n = 260
    ts = np.arange(n, dtype="int64") * INTERVAL_MS
    up   = pd.DataFrame({"timestamp": ts, "close": np.linspace(100, 200, n)})
    down = pd.DataFrame({"timestamp": ts, "close": np.linspace(200, 100, n)})
    ru = regime_from_z(regime_z(up).iloc[-1])
    rd = regime_from_z(regime_z(down).iloc[-1])
    print(f"price->regime: uptrend->{ru} downtrend->{rd}")
    assert ru == "BUY" and rd == "SELL", (ru, rd)
    # z->class threshold mapping, incl. HOLD and the ungradable (NaN) case
    assert regime_from_z(0.10) == "HOLD"
    assert regime_from_z(0.25) == "BUY"
    assert regime_from_z(-0.30) == "SELL"
    assert regime_from_z(float("nan")) is None
    # price-band directional grader
    assert _price_band_correct("BUY", 2.0) and not _price_band_correct("BUY", 0.5)
    assert _price_band_correct("SELL", -2.0) and _price_band_correct("HOLD", 0.4)
    assert not _price_band_correct("HOLD", 1.5)
    print("OK — log_predictions self-test passed (regime + price-band graders)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--log", action="store_true", help="append forecasts for all symbols")
    ap.add_argument("--grade", action="store_true", help="resolve elapsed forecasts")
    ap.add_argument("--self-test", action="store_true")
    args = ap.parse_args()
    if args.self_test:
        _self_test()
    elif args.log:
        log_all()
    elif args.grade:
        grade_pending()
    else:
        ap.error("choose --log, --grade, or --self-test")


if __name__ == "__main__":
    main()
