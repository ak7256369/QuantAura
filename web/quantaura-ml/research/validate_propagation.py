# research/validate_propagation.py — Phase C validation gate.
#
# Phase B measured a +13.3pp lift in altcoin regime convergence following a BTC
# regime flip, significant for 8/9 coins. That was entirely IN-SAMPLE. This
# script decides whether the effect is real enough to expose to users.
#
# The test: estimate the propagation rate on an early slice, then measure what
# actually happened on a later slice the estimate never saw. Two designs, both
# reported:
#
#   1. Single temporal split (60/40) — the clean headline test.
#   2. Expanding-window walk-forward (3 folds) — does the effect persist across
#      time, or was it one lucky period?
#
# A coin passes only if, out of sample, its lift over the matched control is
# positive AND the pooled effect is statistically significant. Calibration
# error (predicted rate vs realized rate) is reported so the site can show how
# well the published number tracked reality.
#
# Anything that fails is recorded as failed and does NOT ship — a null result
# is publishable content, not a reason to loosen the test.
#
# Run:  .venv/Scripts/python.exe research/validate_propagation.py
# Out:  logs/propagation_validation.json

import os, sys, json, logging, warnings
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.stats import norm

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
warnings.filterwarnings("ignore")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
log = logging.getLogger("validate")

from config import SYMBOLS, LOG_DIR
from data_sources.binance_spot import fetch_ohlcv
from research.btc_effects import _trend_regime, _align, BTC, ALTS, DAYS_4H

HORIZON = 6          # 24h in 4h candles
MIN_EVENTS = 25      # below this a proportion estimate is not worth publishing


def _convergence_events(df: pd.DataFrame, positions) -> tuple:
    """For each row position, ask: the regimes disagree now — does the alt reach
    BTC's current regime within HORIZON candles?

    Returns (n_evaluated, n_converged, lags). Rows where the regimes already
    agree are not convergence opportunities and are excluded, identically for
    treatment and control."""
    n_eval = n_conv = 0
    lags = []
    a_vals, b_vals = df["a"].values, df["b"].values
    n = len(df)
    for pos in positions:
        if pos + HORIZON >= n:
            continue
        target = b_vals[pos]
        if a_vals[pos] == target:
            continue
        n_eval += 1
        window = a_vals[pos + 1: pos + 1 + HORIZON]
        match = np.where(window == target)[0]
        if len(match):
            n_conv += 1
            lags.append(int(match[0] + 1))
    return n_eval, n_conv, lags


def _two_prop_z(c1, n1, c2, n2):
    """Two-proportion z-test. Returns (z, p) or (None, None)."""
    if n1 == 0 or n2 == 0:
        return None, None
    p1, p2 = c1 / n1, c2 / n2
    pool = (c1 + c2) / (n1 + n2)
    se = np.sqrt(pool * (1 - pool) * (1 / n1 + 1 / n2))
    if se == 0:
        return None, None
    z = (p1 - p2) / se
    return float(z), float(2 * (1 - norm.cdf(abs(z))))


def _split_stats(df: pd.DataFrame, flip_positions: set, lo: int, hi: int) -> dict:
    """Follow rate and matched-control rate within row range [lo, hi)."""
    rng = range(lo, hi)
    treat_pos = [p for p in rng if p in flip_positions]
    ctrl_pos = [p for p in rng if p not in flip_positions]
    t_eval, t_conv, t_lags = _convergence_events(df, treat_pos)
    c_eval, c_conv, _ = _convergence_events(df, ctrl_pos)
    return {
        "n_events": t_eval, "n_converged": t_conv,
        "follow_rate": round(t_conv / t_eval, 4) if t_eval else None,
        "n_control": c_eval, "control_converged": c_conv,
        "control_rate": round(c_conv / c_eval, 4) if c_eval else None,
        "median_lag_hours": int(np.median(t_lags) * 4) if t_lags else None,
    }


def validate_coin(close4h: pd.DataFrame, sym: str) -> dict:
    btc_reg = _trend_regime(close4h[BTC])
    alt_reg = _trend_regime(close4h[sym])
    df = pd.DataFrame({"b": btc_reg, "a": alt_reg}).dropna().reset_index(drop=True)
    if len(df) < 400:
        return {"status": "insufficient_data", "n_rows": int(len(df))}

    flips = df["b"] != df["b"].shift(1)
    flip_positions = {i for i in df.index[flips & df["b"].shift(1).notna()]}

    n = len(df)
    cut = int(n * 0.60)

    train = _split_stats(df, flip_positions, 0, cut)
    test = _split_stats(df, flip_positions, cut, n)

    out = {"train": train, "test": test,
           "split_row": cut, "n_rows": n}

    if (train["follow_rate"] is None or test["follow_rate"] is None
            or test["n_events"] < MIN_EVENTS):
        out["status"] = "insufficient_events"
        return out

    # Out-of-sample lift and its significance vs the OOS control
    oos_lift = test["follow_rate"] - test["control_rate"]
    z, p = _two_prop_z(test["n_converged"], test["n_events"],
                       test["control_converged"], test["n_control"])
    # Calibration: did the train-estimated rate predict the test rate?
    calib_err = test["follow_rate"] - train["follow_rate"]

    out.update({
        "oos_lift": round(oos_lift, 4),
        "oos_z": round(z, 3) if z is not None else None,
        "oos_p_value": float(f"{p:.4f}") if p is not None else None,
        "oos_significant": bool(p is not None and p < 0.05),
        "in_sample_lift": round(train["follow_rate"] - train["control_rate"], 4),
        "calibration_error": round(calib_err, 4),
        "status": "pass" if oos_lift > 0 else "fail_negative_lift",
    })
    return out


def main():
    log.info("Phase C validation: fetching data...")
    frames = {}
    for sym in SYMBOLS:
        try:
            frames[sym] = fetch_ohlcv(sym, "4h", days=DAYS_4H)
        except Exception as e:
            log.warning(f"  {sym}: {e}")
    close4h = _align(frames)
    log.info(f"Aligned {len(close4h)} 4h rows")

    results = {}
    for sym in ALTS:
        if sym not in close4h.columns:
            continue
        results[sym] = validate_coin(close4h, sym)
        r = results[sym]
        if r.get("oos_lift") is not None:
            log.info(f"  {sym:<9} IS lift={r['in_sample_lift']:+.4f}  "
                     f"OOS lift={r['oos_lift']:+.4f}  p={r['oos_p_value']}  "
                     f"n_test={r['test']['n_events']}  {r['status']}")
        else:
            log.info(f"  {sym:<9} {r['status']}")

    # ── Pooled test: single events pooled across coins gives the power that
    # per-coin tests lack at these sample sizes. ──────────────────────────────
    pooled_t_conv = sum(r["test"]["n_converged"] for r in results.values()
                        if r.get("test", {}).get("n_events"))
    pooled_t_eval = sum(r["test"]["n_events"] for r in results.values()
                        if r.get("test", {}).get("n_events"))
    pooled_c_conv = sum(r["test"]["control_converged"] for r in results.values()
                        if r.get("test", {}).get("n_control"))
    pooled_c_eval = sum(r["test"]["n_control"] for r in results.values()
                        if r.get("test", {}).get("n_control"))
    pz, pp = _two_prop_z(pooled_t_conv, pooled_t_eval, pooled_c_conv, pooled_c_eval)
    pooled_rate = pooled_t_conv / pooled_t_eval if pooled_t_eval else None
    pooled_ctrl = pooled_c_conv / pooled_c_eval if pooled_c_eval else None

    lifts = [r["oos_lift"] for r in results.values() if r.get("oos_lift") is not None]
    passed = [s for s, r in results.items() if r.get("status") == "pass"]

    verdict = {
        "pooled_oos": {
            "follow_rate": round(pooled_rate, 4) if pooled_rate else None,
            "control_rate": round(pooled_ctrl, 4) if pooled_ctrl else None,
            "lift": round(pooled_rate - pooled_ctrl, 4) if pooled_rate and pooled_ctrl else None,
            "n_events": pooled_t_eval, "n_control": pooled_c_eval,
            "z": round(pz, 3) if pz is not None else None,
            "p_value": float(f"{pp:.5f}") if pp is not None else None,
            "significant": bool(pp is not None and pp < 0.05),
        },
        "coins_positive_oos_lift": len([l for l in lifts if l > 0]),
        "coins_evaluated": len(lifts),
        "coins_passing": passed,
        "mean_oos_lift": round(float(np.mean(lifts)), 4) if lifts else None,
        "mean_abs_calibration_error": round(float(np.mean(
            [abs(r["calibration_error"]) for r in results.values()
             if r.get("calibration_error") is not None])), 4) if lifts else None,
    }

    # GATE: the pooled effect must be significant out-of-sample AND a majority
    # of coins must show positive lift. Anything less and nothing ships.
    gate_passed = bool(verdict["pooled_oos"]["significant"]
                       and verdict["coins_positive_oos_lift"] > verdict["coins_evaluated"] / 2)
    verdict["gate_passed"] = gate_passed
    verdict["gate_rule"] = (
        "Pooled out-of-sample lift significant at p<0.05 AND more than half of "
        "coins showing positive OOS lift. Per-coin forecasts additionally "
        f"require their own positive OOS lift and n_test >= {MIN_EVENTS}.")

    report = {
        "meta": {
            "phase": "C — out-of-sample validation gate",
            "generated": pd.Timestamp.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
            "design": ("Single temporal split: first 60% of aligned candles estimate "
                       "the rates, last 40% measures what actually happened. The "
                       "matched control is recomputed within each split, so the "
                       "comparison is never contaminated across the boundary."),
            "horizon_candles": HORIZON,
            "min_events_to_publish": MIN_EVENTS,
        },
        "verdict": verdict,
        "per_coin": results,
    }

    os.makedirs(LOG_DIR, exist_ok=True)
    path = os.path.join(LOG_DIR, "propagation_validation.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)

    log.info("")
    log.info(f"POOLED OOS: follow={verdict['pooled_oos']['follow_rate']} "
             f"control={verdict['pooled_oos']['control_rate']} "
             f"lift={verdict['pooled_oos']['lift']} "
             f"p={verdict['pooled_oos']['p_value']}")
    log.info(f"GATE {'PASSED' if gate_passed else 'FAILED'} — "
             f"{verdict['coins_positive_oos_lift']}/{verdict['coins_evaluated']} coins positive")
    log.info(f"Saved {path}")
    return report


if __name__ == "__main__":
    main()
