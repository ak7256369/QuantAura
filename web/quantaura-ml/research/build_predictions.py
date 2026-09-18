# research/build_predictions.py — Phase C predictive layer.
#
# Assembles the user-facing analytics from ONLY what survived Phase B
# measurement and the Phase C out-of-sample gate:
#
#   SHIPS
#     * coupling_state      — descriptive: current BTC correlation/beta vs each
#                             coin's own history. Not a forecast, so no gate.
#     * divergence_watch    — descriptive: coins currently decoupled from BTC.
#     * propagation_forecast — the ONLY forecast. Ships because the pooled OOS
#                             lift is +15.1pp at p<0.001 with 9/9 coins
#                             positive. Each coin carries its own OOS hit rate,
#                             control rate and n so the claim is checkable.
#
#   DOES NOT SHIP (measured and rejected — recorded so the page can say why)
#     * hourly BTC->alt prediction — 1h-ahead correlation ~0.006 (Phase B Q2)
#     * crash-asymmetry signal     — our sample contradicts the literature and
#                                    only 2/9 coins matched (Phase B Q4)
#
# Every probability published here is the OUT-OF-SAMPLE rate, never the
# in-sample one, and is always paired with its control rate. A 49% forecast
# beside a 34% control is honest; 49% alone reads as a promise.
#
# Run:  .venv/Scripts/python.exe research/build_predictions.py
# Out:  logs/btc_research.json  (adds a "predictions" block)

import os, sys, json, logging, warnings
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
warnings.filterwarnings("ignore")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
log = logging.getLogger("predictions")

from config import LOG_DIR, SYMBOLS
from data_sources.binance_spot import fetch_ohlcv
from research.btc_effects import _trend_regime, _align, _log_returns, BTC, ALTS, DAYS_4H

COIN_NAMES = {
    "ETHUSDT": "Ethereum", "BNBUSDT": "BNB", "SOLUSDT": "Solana",
    "XRPUSDT": "XRP", "ADAUSDT": "Cardano", "AVAXUSDT": "Avalanche",
    "DOTUSDT": "Polkadot", "LINKUSDT": "Chainlink", "DOGEUSDT": "Dogecoin",
}
REGIME_NAMES = {0: "uptrend", 1: "neutral", 2: "downtrend"}


def _load(path, what):
    p = os.path.join(LOG_DIR, path)
    if not os.path.exists(p):
        log.error(f"{what} missing ({p}). Run the earlier phase first.")
        sys.exit(1)
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def build_coupling_state(research: dict, close4h: pd.DataFrame) -> list:
    """Descriptive: how tightly is each coin currently tracking BTC, relative to
    its OWN history? Percentile is the honest framing — an absolute correlation
    of 0.8 means nothing without knowing that coin's normal range."""
    corr = research["correlation"]["per_coin"]
    beta = research["beta"]["per_coin"]
    out = []
    for sym in ALTS:
        if sym not in corr or "90d" not in corr[sym]:
            continue
        c90 = corr[sym]["90d"]
        pct = c90["current_percentile"]
        if pct >= 75:
            state, reading = "tightly_coupled", (
                "Moving with BTC more than usual — BTC's direction is likely to "
                "dominate this coin's next move.")
        elif pct <= 25:
            state, reading = "decoupled", (
                "Unusually independent of BTC right now — this coin is trading "
                "on its own drivers, so BTC-based reasoning applies less.")
        else:
            state, reading = "normal", (
                "Tracking BTC at about its typical strength for this coin.")
        out.append({
            "symbol": sym,
            "name": COIN_NAMES.get(sym, sym),
            "corr_90d": c90["current"],
            "corr_90d_percentile": pct,
            "corr_90d_range": [c90["min"], c90["max"]],
            "corr_full_sample": corr[sym]["full_sample"]["corr"],
            "beta": beta.get(sym, {}).get("beta_full"),
            "r_squared": beta.get(sym, {}).get("r_squared"),
            "state": state,
            "reading": reading,
        })
    out.sort(key=lambda x: -x["corr_90d_percentile"])
    return out


def build_propagation_forecast(validation: dict, close4h: pd.DataFrame) -> dict:
    """The one forecast that passed the gate.

    Publishes, per coin, the OUT-OF-SAMPLE probability that the coin's regime
    converges to BTC's within 24h after a BTC regime flip — alongside the
    control rate, the sample size and the p-value. Also reports whether BTC has
    just flipped, which is the condition that makes the number applicable."""
    v = validation["verdict"]
    if not v.get("gate_passed"):
        return {"status": "gate_failed",
                "note": "Forecast withheld: did not pass out-of-sample validation."}

    btc_reg = _trend_regime(close4h[BTC])
    btc_now = btc_reg.dropna()
    current_regime = int(btc_now.iloc[-1])
    # How many 4h candles since BTC's regime last changed
    changed = btc_now != btc_now.shift(1)
    last_flip_pos = np.where(changed.values)[0]
    candles_since_flip = int(len(btc_now) - 1 - last_flip_pos[-1]) if len(last_flip_pos) else None
    recently_flipped = candles_since_flip is not None and candles_since_flip <= 6

    coins = []
    for sym, r in validation["per_coin"].items():
        if r.get("status") != "pass" or r.get("oos_lift") is None:
            continue
        alt_reg = _trend_regime(close4h[sym]).dropna()
        alt_now = int(alt_reg.iloc[-1])
        test = r["test"]
        coins.append({
            "symbol": sym,
            "name": COIN_NAMES.get(sym, sym),
            # OUT-OF-SAMPLE rate — never the in-sample one
            "probability_follows_24h": test["follow_rate"],
            "control_probability": test["control_rate"],
            "lift": r["oos_lift"],
            "p_value": r["oos_p_value"],
            "significant": r["oos_significant"],
            "n_test_events": test["n_events"],
            "median_lag_hours": test["median_lag_hours"],
            "current_regime": REGIME_NAMES[alt_now],
            "agrees_with_btc": alt_now == current_regime,
            # The forecast only applies when the regimes currently disagree
            "forecast_applicable": (alt_now != current_regime) and recently_flipped,
        })
    coins.sort(key=lambda c: -(c["lift"] or 0))

    return {
        "status": "validated",
        "btc_current_regime": REGIME_NAMES[current_regime],
        "candles_since_btc_flip": candles_since_flip,
        "hours_since_btc_flip": candles_since_flip * 4 if candles_since_flip is not None else None,
        "btc_recently_flipped": recently_flipped,
        "pooled": v["pooled_oos"],
        "coins": coins,
        "how_to_read": (
            "After BTC's 24h trend regime flips, a coin whose regime currently "
            "disagrees converges to BTC's new regime within 24h about "
            f"{v['pooled_oos']['follow_rate']:.0%} of the time, versus "
            f"{v['pooled_oos']['control_rate']:.0%} at other moments. The gap — "
            f"{v['pooled_oos']['lift']:.1%} — is the actual information content. "
            "These are out-of-sample rates measured on data the estimates never "
            "saw. They describe tendencies across hundreds of past events, not "
            "what any individual coin will do next."),
        "validation": {
            "design": validation["meta"]["design"],
            "gate_rule": v["gate_rule"],
            "coins_positive_oos": v["coins_positive_oos_lift"],
            "coins_evaluated": v["coins_evaluated"],
            "mean_abs_calibration_error": v["mean_abs_calibration_error"],
        },
    }


def build_divergence_watch(coupling: list) -> list:
    """Coins trading on their own drivers right now — the mirror of coupling
    state, surfaced separately because it changes how much weight BTC-based
    reasoning deserves."""
    return [
        {"symbol": c["symbol"], "name": c["name"],
         "corr_90d": c["corr_90d"], "percentile": c["corr_90d_percentile"],
         "note": f"90-day BTC correlation {c['corr_90d']:.2f}, in the bottom "
                 f"{c['corr_90d_percentile']:.0f}% of its own 2-year range."}
        for c in coupling if c["state"] == "decoupled"
    ]


def main():
    research = _load("btc_research.json", "Phase B results")
    validation = _load("propagation_validation.json", "Phase C validation")

    log.info("Fetching current market state...")
    frames = {}
    for sym in SYMBOLS:
        try:
            frames[sym] = fetch_ohlcv(sym, "4h", days=DAYS_4H)
        except Exception as e:
            log.warning(f"  {sym}: {e}")
    close4h = _align(frames)

    coupling = build_coupling_state(research, close4h)
    forecast = build_propagation_forecast(validation, close4h)
    divergence = build_divergence_watch(coupling)

    research["predictions"] = {
        "generated": pd.Timestamp.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
        "coupling_state": coupling,
        "divergence_watch": divergence,
        "propagation_forecast": forecast,
        "rejected": [
            {
                "candidate": "Hourly BTC→altcoin move prediction",
                "reason": ("Measured 1h-ahead BTC→alt return correlation is ~0.006 "
                           "against a contemporaneous 0.772. The coupling is "
                           "co-movement, not lead — so 'BTC moved, the alt follows "
                           "next hour' has no support in our data."),
                "evidence": "Phase B, lead_lag analysis",
            },
            {
                "candidate": "Crash-asymmetry signal (BTC drops hit alts harder)",
                "reason": ("Published for 2015-2019 data, but our 2024-2026 sample "
                           "shows the opposite: mean asymmetry -0.22pp, with only "
                           "2 of 9 coins matching the literature. Too unstable to "
                           "expose as a signal."),
                "evidence": "Phase B, event_study analysis",
            },
        ],
        "boundaries": (
            "These are conditional probabilities and descriptive statistics, not "
            "trading instructions. They carry no entry price, exit price, position "
            "size or holding period, and they are not financial advice. Every "
            "probability is an out-of-sample historical frequency shown next to "
            "its control rate so the edge — not just the headline — is visible."),
    }

    path = os.path.join(LOG_DIR, "btc_research.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(research, f, indent=2)

    log.info(f"coupling_state: {len(coupling)} coins "
             f"({sum(1 for c in coupling if c['state'] == 'tightly_coupled')} tightly coupled, "
             f"{len(divergence)} decoupled)")
    log.info(f"propagation_forecast: {forecast['status']}, "
             f"{len(forecast.get('coins', []))} coins, BTC regime="
             f"{forecast.get('btc_current_regime')}, "
             f"{forecast.get('hours_since_btc_flip')}h since flip")
    log.info(f"rejected: {len(research['predictions']['rejected'])} candidates recorded")
    log.info(f"Saved {path}")


if __name__ == "__main__":
    main()
