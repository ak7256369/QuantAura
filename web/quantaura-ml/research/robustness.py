# research/robustness.py — publication-grade robustness checks.
#
# The Phase C gate established the regime-propagation effect on ONE 60/40
# temporal split, with ONE regime specification. A referee will not accept
# either. This addresses the four objections most likely to be raised:
#
#   1. WALK-FORWARD      — is the effect stable across multiple origins, or an
#                          artefact of where the single split happened to fall?
#   2. SPECIFICATION      — does it survive other tau thresholds and EMA pairs,
#                          or was EMA(12,26)/tau=0.20 a lucky choice?
#   3. SUBSAMPLE          — does it hold in each year separately?
#   4. ECONOMIC MEANING   — is a +15pp regime edge worth anything after costs,
#                          or is it statistically real but practically empty?
#
# Point 4 matters most for honesty. Everything this project has learned says a
# statistically significant edge can still be worthless after trading frictions
# (see the 80% F1 / 52% directional result), so the same test is applied here
# rather than assuming this effect is different.
#
# Run:  .venv/Scripts/python.exe research/robustness.py
# Out:  logs/robustness.json

import os, sys, json, logging, warnings
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.stats import norm

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
warnings.filterwarnings("ignore")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
log = logging.getLogger("robustness")

from config import SYMBOLS, LOG_DIR, LABEL_VOL_WINDOW, LABEL_FORWARD_CANDLES
from data_sources.binance_spot import fetch_ohlcv
from research.btc_effects import _align, _log_returns, BTC, ALTS, DAYS_4H

HORIZON = 6           # 24h in 4h candles
MIN_EVENTS = 25


def regime_series(close: pd.Series, tau: float, fast: int, slow: int) -> pd.Series:
    """Parameterised regime definition — the production default is
    tau=0.20, fast=12, slow=26."""
    ema_f = close.ewm(span=fast, adjust=False).mean()
    ema_s = close.ewm(span=slow, adjust=False).mean()
    score = (ema_f - ema_s) / close
    lr = np.log(close / close.shift(1))
    vol = (lr.rolling(LABEL_VOL_WINDOW, min_periods=LABEL_VOL_WINDOW // 3)
           .std().shift(1) * np.sqrt(LABEL_FORWARD_CANDLES))
    z = score / vol.replace(0, np.nan)
    r = pd.Series(1.0, index=close.index)
    r[z > tau] = 0
    r[z < -tau] = 2
    r[z.isna()] = np.nan
    return r


def _convergence(a_vals, b_vals, positions, n):
    """(n_evaluated, n_converged, lags) for the given row positions."""
    ev = conv = 0
    lags = []
    for pos in positions:
        if pos + HORIZON >= n:
            continue
        target = b_vals[pos]
        if a_vals[pos] == target:
            continue
        ev += 1
        window = a_vals[pos + 1: pos + 1 + HORIZON]
        m = np.where(window == target)[0]
        if len(m):
            conv += 1
            lags.append(int(m[0] + 1))
    return ev, conv, lags


def _z_test(c1, n1, c2, n2):
    if not n1 or not n2:
        return None, None
    p1, p2 = c1 / n1, c2 / n2
    pool = (c1 + c2) / (n1 + n2)
    se = np.sqrt(pool * (1 - pool) * (1 / n1 + 1 / n2))
    if se == 0:
        return None, None
    z = (p1 - p2) / se
    return float(z), float(2 * (1 - norm.cdf(abs(z))))


def _lift(close4h, sym, tau, fast, slow, lo=None, hi=None):
    """Pooled treatment/control counts for one coin over an optional row range."""
    b = regime_series(close4h[BTC], tau, fast, slow)
    a = regime_series(close4h[sym], tau, fast, slow)
    df = pd.DataFrame({"b": b, "a": a}).dropna().reset_index(drop=True)
    if len(df) < 200:
        return None
    lo = 0 if lo is None else lo
    hi = len(df) if hi is None else hi
    flips = df["b"] != df["b"].shift(1)
    flip_pos = {i for i in df.index[flips & df["b"].shift(1).notna()] if lo <= i < hi}
    ctrl_pos = [i for i in range(lo, hi) if i not in flip_pos]
    a_vals, b_vals, n = df["a"].values, df["b"].values, len(df)
    t_ev, t_cv, lags = _convergence(a_vals, b_vals, sorted(flip_pos), n)
    c_ev, c_cv, _ = _convergence(a_vals, b_vals, ctrl_pos, n)
    return {"t_ev": t_ev, "t_cv": t_cv, "c_ev": c_ev, "c_cv": c_cv,
            "median_lag": int(np.median(lags)) if lags else None}


def _pool(results):
    """Aggregate per-coin counts into a pooled rate, lift and significance."""
    t_ev = sum(r["t_ev"] for r in results)
    t_cv = sum(r["t_cv"] for r in results)
    c_ev = sum(r["c_ev"] for r in results)
    c_cv = sum(r["c_cv"] for r in results)
    if not t_ev or not c_ev:
        return None
    fr, cr = t_cv / t_ev, c_cv / c_ev
    z, p = _z_test(t_cv, t_ev, c_cv, c_ev)
    return {"follow_rate": round(fr, 4), "control_rate": round(cr, 4),
            "lift": round(fr - cr, 4), "n_events": t_ev, "n_control": c_ev,
            "z": round(z, 3) if z else None,
            "p_value": float(f"{p:.5f}") if p is not None else None,
            "significant": bool(p is not None and p < 0.05)}


# ── 1. Walk-forward across multiple origins ──────────────────────────────────

def walk_forward(close4h, folds=5):
    """Expanding-window: estimate on everything before the fold, evaluate on the
    fold. Answers 'was the single 60/40 split lucky?'"""
    n = len(close4h)
    start = int(n * 0.5)                     # first 50% is the initial estimate base
    edges = np.linspace(start, n, folds + 1).astype(int)
    out = []
    for i in range(folds):
        lo, hi = edges[i], edges[i + 1]
        res = [r for r in (_lift(close4h, s, 0.20, 12, 26, lo, hi) for s in ALTS) if r]
        pooled = _pool(res)
        if pooled:
            pooled["fold"] = i + 1
            pooled["rows"] = [int(lo), int(hi)]
            out.append(pooled)
    positive = sum(1 for f in out if f["lift"] > 0)
    return {"folds": out,
            "summary": {"n_folds": len(out), "folds_positive": positive,
                        "mean_lift": round(float(np.mean([f["lift"] for f in out])), 4),
                        "min_lift": round(float(np.min([f["lift"] for f in out])), 4),
                        "folds_significant": sum(1 for f in out if f["significant"])}}


# ── 2. Specification grid ────────────────────────────────────────────────────

def specification_grid(close4h):
    """Does the effect depend on the chosen regime parameters?"""
    taus = [0.10, 0.15, 0.20, 0.25, 0.30]
    emas = [(8, 21), (12, 26), (20, 50)]
    grid = []
    for fast, slow in emas:
        for tau in taus:
            res = [r for r in (_lift(close4h, s, tau, fast, slow) for s in ALTS) if r]
            pooled = _pool(res)
            if pooled:
                pooled.update({"tau": tau, "ema": f"{fast}/{slow}",
                               "is_production_spec": (tau == 0.20 and fast == 12 and slow == 26)})
                grid.append(pooled)
    lifts = [g["lift"] for g in grid]
    return {"grid": grid,
            "summary": {"n_specs": len(grid),
                        "specs_positive": sum(1 for l in lifts if l > 0),
                        "specs_significant": sum(1 for g in grid if g["significant"]),
                        "mean_lift": round(float(np.mean(lifts)), 4),
                        "min_lift": round(float(np.min(lifts)), 4),
                        "max_lift": round(float(np.max(lifts)), 4)}}


# ── 3. Yearly subsamples ─────────────────────────────────────────────────────

def subsamples(close4h):
    years = pd.to_datetime(close4h.index, unit="ms").year
    out = []
    for y in sorted(set(years)):
        mask = years == y
        idx = np.where(mask)[0]
        if len(idx) < 500:
            continue
        res = [r for r in (_lift(close4h, s, 0.20, 12, 26, int(idx[0]), int(idx[-1])) for s in ALTS) if r]
        pooled = _pool(res)
        if pooled:
            pooled["year"] = int(y)
            pooled["n_rows"] = int(len(idx))
            out.append(pooled)
    return {"years": out,
            "summary": {"n_years": len(out),
                        "years_positive": sum(1 for y in out if y["lift"] > 0),
                        "years_significant": sum(1 for y in out if y["significant"])}}


# ── 4. Economic significance ─────────────────────────────────────────────────

def economic_significance(close4h, cost_per_side=0.0015):
    """A regime edge is not automatically a tradeable edge.

    For each BTC flip where an alt disagrees, measure the alt's actual forward
    24h return in the direction the flip implies (long if BTC flipped to
    uptrend, short if to downtrend), then subtract round-trip costs. This is
    the same discipline applied to the main models, which showed an 80% F1
    signal was still cost-negative."""
    ret = close4h.apply(_log_returns)
    results = {}
    all_net = []
    for sym in ALTS:
        b = regime_series(close4h[BTC], 0.20, 12, 26)
        a = regime_series(close4h[sym], 0.20, 12, 26)
        df = pd.DataFrame({"b": b, "a": a, "r": ret[sym]}).dropna().reset_index(drop=True)
        flips = df["b"] != df["b"].shift(1)
        fwd = df["r"].shift(-1).rolling(HORIZON).sum().shift(-(HORIZON - 1))

        rows = []
        for pos in df.index[flips & df["b"].shift(1).notna()]:
            if pos + HORIZON >= len(df):
                continue
            target = df["b"].iloc[pos]
            if df["a"].iloc[pos] == target or target == 1:
                continue          # no disagreement, or flip to neutral (no direction)
            f = fwd.iloc[pos]
            if not np.isfinite(f):
                continue
            direction = 1 if target == 0 else -1      # 0=uptrend -> long
            rows.append(direction * float(f))
        if len(rows) < 20:
            continue
        arr = np.array(rows)
        gross = float(arr.mean())
        net = gross - 2 * cost_per_side
        all_net.append(net)
        results[sym] = {
            "n_trades": len(arr),
            "mean_gross_pct": round(gross * 100, 4),
            "mean_net_pct": round(net * 100, 4),
            "win_rate": round(float((arr > 0).mean()), 4),
            "profitable_after_costs": bool(net > 0),
        }
    return {
        "assumption": f"{cost_per_side*100:.2f}% per side, {2*cost_per_side*100:.2f}% round trip",
        "per_coin": results,
        "summary": {
            "mean_net_pct": round(float(np.mean(all_net)) * 100, 4) if all_net else None,
            "coins_profitable_after_costs": int(sum(1 for n in all_net if n > 0)),
            "coins_tested": len(all_net),
        },
    }


def main():
    log.info("Fetching data...")
    frames = {}
    for sym in SYMBOLS:
        try:
            frames[sym] = fetch_ohlcv(sym, "4h", days=DAYS_4H)
        except Exception as e:
            log.warning(f"  {sym}: {e}")
    close4h = _align(frames)
    log.info(f"Aligned {len(close4h)} rows")

    log.info("[1/4] walk-forward...")
    wf = walk_forward(close4h)
    log.info(f"      {wf['summary']}")
    log.info("[2/4] specification grid...")
    sg = specification_grid(close4h)
    log.info(f"      {sg['summary']}")
    log.info("[3/4] yearly subsamples...")
    ss = subsamples(close4h)
    log.info(f"      {ss['summary']}")
    log.info("[4/4] economic significance...")
    ec = economic_significance(close4h)
    log.info(f"      {ec['summary']}")

    report = {
        "meta": {
            "generated": pd.Timestamp.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
            "purpose": "Referee-facing robustness checks on the regime-propagation effect",
            "n_rows": int(len(close4h)),
        },
        "walk_forward": wf,
        "specification_grid": sg,
        "subsamples": ss,
        "economic_significance": ec,
    }
    path = os.path.join(LOG_DIR, "robustness.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)
    log.info(f"Saved {path}")
    return report


if __name__ == "__main__":
    main()
