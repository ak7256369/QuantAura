# research/btc_effects.py — Phase B: empirical replication of the BTC->altcoin
# literature on QuantAura's own data.
#
# Every analysis here is paired with a specific published finding from
# research/bibliography.json, so the output can state agreement or
# disagreement rather than floating free. Phase A imposed three constraints
# that shape the code:
#
#   1. Sifat et al. 2019 found BTC<->ETH causality is BI-DIRECTIONAL, so every
#      Granger test runs in both directions and we report both.
#   2. Demir et al. 2021 and Sila et al. 2024 found downside spillovers are
#      larger/faster than upside, so the event study splits shocks by SIGN.
#   3. Balcilar & Ozdemir 2023 found stablecoins behave differently; our
#      universe is USDT-quoted, which is recorded as a standing caveat.
#
# Discipline: causal windows only (no look-ahead), n reported for every
# statistic, bootstrap CIs on the headline numbers, and results that
# contradict the literature are surfaced, not suppressed.
#
# Run:  .venv/Scripts/python.exe research/btc_effects.py
# Out:  logs/btc_research.json

import os, sys, json, time, logging, warnings
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
warnings.filterwarnings("ignore")

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
log = logging.getLogger("btc_effects")

from config import (SYMBOLS, LOG_DIR, LABEL_EMA_FAST, LABEL_EMA_SLOW,
                    LABEL_TREND_TAU, LABEL_FORWARD_CANDLES, LABEL_VOL_WINDOW)
from data_sources.binance_spot import fetch_ohlcv

BTC = "BTCUSDT"
ALTS = [s for s in SYMBOLS if s != BTC]

DAYS_4H = 730          # ~2 years of 4h candles
DAYS_1H = 365          # 1 year of 1h candles for lead-lag at fine horizons
BOOTSTRAP_N = 1000
RNG = np.random.default_rng(42)


# ── helpers ──────────────────────────────────────────────────────────────────

def _log_returns(close: pd.Series) -> pd.Series:
    return np.log(close / close.shift(1))


def _bootstrap_ci(values: np.ndarray, stat_fn, n=BOOTSTRAP_N, alpha=0.05):
    """Percentile bootstrap CI. Returns (lo, hi) or (None, None) if degenerate."""
    values = np.asarray(values)
    values = values[np.isfinite(values)]
    if len(values) < 30:
        return None, None
    stats = np.empty(n)
    for i in range(n):
        sample = RNG.choice(values, size=len(values), replace=True)
        stats[i] = stat_fn(sample)
    return (round(float(np.percentile(stats, 100 * alpha / 2)), 5),
            round(float(np.percentile(stats, 100 * (1 - alpha / 2))), 5))


def _paired_bootstrap_ci(x: np.ndarray, y: np.ndarray, stat_fn, n=BOOTSTRAP_N, alpha=0.05):
    """Bootstrap for statistics of PAIRED series (e.g. correlation), resampling
    index positions jointly so the pairing survives."""
    mask = np.isfinite(x) & np.isfinite(y)
    x, y = np.asarray(x)[mask], np.asarray(y)[mask]
    if len(x) < 30:
        return None, None
    idx = np.arange(len(x))
    stats = np.empty(n)
    for i in range(n):
        s = RNG.choice(idx, size=len(idx), replace=True)
        stats[i] = stat_fn(x[s], y[s])
    return (round(float(np.percentile(stats, 100 * alpha / 2)), 5),
            round(float(np.percentile(stats, 100 * (1 - alpha / 2))), 5))


def _align(frames: dict, col="close") -> pd.DataFrame:
    """Join every symbol's series on timestamp. Inner join: analyses compare
    coins to each other, so only jointly-observed candles are usable."""
    out = None
    for sym, df in frames.items():
        s = df.set_index("timestamp")[col].rename(sym)
        out = s.to_frame() if out is None else out.join(s, how="inner")
    return out.dropna()


def _trend_regime(close: pd.Series) -> pd.Series:
    """The SAME regime definition the production models predict (labels.py):
    vol-normalized EMA12-EMA26 score, thresholded at +/- tau.
    0=uptrend(BUY) 1=neutral(HOLD) 2=downtrend(SELL)."""
    ema_f = close.ewm(span=LABEL_EMA_FAST, adjust=False).mean()
    ema_s = close.ewm(span=LABEL_EMA_SLOW, adjust=False).mean()
    score = (ema_f - ema_s) / close
    lr = np.log(close / close.shift(1))
    vol = (lr.rolling(LABEL_VOL_WINDOW, min_periods=LABEL_VOL_WINDOW // 3)
           .std().shift(1) * np.sqrt(LABEL_FORWARD_CANDLES))
    z = score / vol.replace(0, np.nan)
    regime = pd.Series(1, index=close.index, dtype=float)
    regime[z > LABEL_TREND_TAU] = 0
    regime[z < -LABEL_TREND_TAU] = 2
    regime[z.isna()] = np.nan
    return regime


# ── 1. Rolling correlation ───────────────────────────────────────────────────

def analysis_correlation(ret4h: pd.DataFrame) -> dict:
    """Tests Aslanidis et al. 2019: correlations positive but TIME-VARYING."""
    # 30d and 90d windows in 4h candles
    windows = {"30d": 180, "90d": 540}
    out = {}
    for sym in ALTS:
        entry = {}
        pair = ret4h[[BTC, sym]].dropna()
        full = float(pair[BTC].corr(pair[sym]))
        lo, hi = _paired_bootstrap_ci(
            pair[BTC].values, pair[sym].values,
            lambda a, b: float(np.corrcoef(a, b)[0, 1]))
        entry["full_sample"] = {"corr": round(full, 4), "n": int(len(pair)),
                                "ci95": [lo, hi]}
        for label, w in windows.items():
            roll = pair[BTC].rolling(w).corr(pair[sym]).dropna()
            if len(roll) < 10:
                continue
            entry[label] = {
                "current": round(float(roll.iloc[-1]), 4),
                "mean": round(float(roll.mean()), 4),
                "min": round(float(roll.min()), 4),
                "max": round(float(roll.max()), 4),
                "std": round(float(roll.std()), 4),
                # Where today's coupling sits in its own history — the input to
                # the Phase C "coupling state" reading.
                "current_percentile": round(float((roll < roll.iloc[-1]).mean() * 100), 1),
                "n_windows": int(len(roll)),
            }
        out[sym] = entry

    spreads = [v["90d"]["max"] - v["90d"]["min"] for v in out.values() if "90d" in v]
    return {
        "per_coin": out,
        "summary": {
            "mean_full_sample_corr": round(float(np.mean(
                [v["full_sample"]["corr"] for v in out.values()])), 4),
            "mean_90d_range": round(float(np.mean(spreads)), 4) if spreads else None,
            "all_positive": all(v["full_sample"]["corr"] > 0 for v in out.values()),
        },
        "literature": {
            "source": "aslanidis2019",
            "predicts": "Correlations among cryptocurrencies are positive but vary across time",
        },
    }


# ── 2. Beta to BTC, calm vs stress ───────────────────────────────────────────

def analysis_beta(ret4h: pd.DataFrame) -> dict:
    """How much an alt moves per 1% BTC move, split by BTC volatility regime.
    Bouri et al. 2019 (herding rises with uncertainty) predicts beta should be
    HIGHER in the stress regime."""
    btc = ret4h[BTC]
    # Causal: volatility of the trailing 30d window, shifted so the current
    # candle is never used to classify itself.
    btc_vol = btc.rolling(180, min_periods=60).std().shift(1)
    hi_thresh = btc_vol.quantile(0.75)
    lo_thresh = btc_vol.quantile(0.25)

    out = {}
    for sym in ALTS:
        df = pd.DataFrame({"b": btc, "a": ret4h[sym], "v": btc_vol}).dropna()
        if len(df) < 100:
            continue

        def _beta(b, a):
            var = np.var(b)
            return float(np.cov(b, a)[0, 1] / var) if var > 0 else np.nan

        full_beta = _beta(df["b"].values, df["a"].values)
        lo, hi = _paired_bootstrap_ci(df["b"].values, df["a"].values, _beta)

        calm = df[df["v"] <= lo_thresh]
        stress = df[df["v"] >= hi_thresh]
        entry = {
            "beta_full": round(full_beta, 4),
            "ci95": [lo, hi],
            "n": int(len(df)),
            "r_squared": round(float(np.corrcoef(df["b"], df["a"])[0, 1] ** 2), 4),
        }
        if len(calm) >= 50:
            entry["beta_calm"] = round(_beta(calm["b"].values, calm["a"].values), 4)
            entry["n_calm"] = int(len(calm))
        if len(stress) >= 50:
            entry["beta_stress"] = round(_beta(stress["b"].values, stress["a"].values), 4)
            entry["n_stress"] = int(len(stress))
        if "beta_calm" in entry and "beta_stress" in entry:
            entry["stress_minus_calm"] = round(entry["beta_stress"] - entry["beta_calm"], 4)
        out[sym] = entry

    diffs = [v["stress_minus_calm"] for v in out.values() if "stress_minus_calm" in v]
    return {
        "per_coin": out,
        "summary": {
            "mean_beta": round(float(np.mean([v["beta_full"] for v in out.values()])), 4),
            "mean_r_squared": round(float(np.mean([v["r_squared"] for v in out.values()])), 4),
            "mean_stress_minus_calm": round(float(np.mean(diffs)), 4) if diffs else None,
            "coins_with_higher_stress_beta": int(sum(d > 0 for d in diffs)) if diffs else None,
            "coins_compared": len(diffs),
        },
        "literature": {
            "source": "bouri2019",
            "predicts": "Herding rises with uncertainty, so coupling to BTC should strengthen in stress",
        },
    }


# ── 3. Lead-lag + bidirectional Granger ──────────────────────────────────────

def analysis_lead_lag(ret1h: pd.DataFrame) -> dict:
    """Tests Sifat et al. 2019 (bi-directional causality) and Ciaian et al.
    2018 (short-run coupling stronger than long-run).

    Cross-correlation corr(BTC_t, ALT_{t+k}) for k in hours: positive k means
    BTC LEADS. Granger tested in BOTH directions, as Phase A requires."""
    from statsmodels.tsa.stattools import grangercausalitytests

    lags = [1, 2, 3, 6, 12, 24]
    out = {}
    for sym in ALTS:
        pair = ret1h[[BTC, sym]].dropna()
        if len(pair) < 500:
            continue
        b, a = pair[BTC], pair[sym]

        xcorr = {}
        for k in lags:
            # BTC leads alt by k hours
            xcorr[f"btc_leads_{k}h"] = round(float(b.corr(a.shift(-k))), 4)
            # alt leads BTC by k hours
            xcorr[f"alt_leads_{k}h"] = round(float(a.corr(b.shift(-k))), 4)
        xcorr["contemporaneous"] = round(float(b.corr(a)), 4)

        entry = {"cross_correlation": xcorr, "n": int(len(pair))}

        # Granger: does adding BTC's past improve prediction of alt (and vice versa)?
        try:
            data_ba = pd.concat([a, b], axis=1).dropna()          # [target, cause]
            res = grangercausalitytests(data_ba, maxlag=6, verbose=False)
            p_btc_causes_alt = min(res[l][0]["ssr_ftest"][1] for l in res)
            data_ab = pd.concat([b, a], axis=1).dropna()
            res2 = grangercausalitytests(data_ab, maxlag=6, verbose=False)
            p_alt_causes_btc = min(res2[l][0]["ssr_ftest"][1] for l in res2)
            entry["granger"] = {
                "p_btc_causes_alt": float(f"{p_btc_causes_alt:.3e}"),
                "p_alt_causes_btc": float(f"{p_alt_causes_btc:.3e}"),
                "btc_leads": bool(p_btc_causes_alt < 0.05),
                "alt_leads": bool(p_alt_causes_btc < 0.05),
                "bidirectional": bool(p_btc_causes_alt < 0.05 and p_alt_causes_btc < 0.05),
                "maxlag_hours": 6,
                "note": "min p-value across lags 1-6h; not corrected for multiple testing",
            }
        except Exception as e:
            entry["granger"] = {"error": str(e)[:120]}
        out[sym] = entry

    g = [v["granger"] for v in out.values() if "granger" in v and "error" not in v]
    return {
        "per_coin": out,
        "summary": {
            "coins_where_btc_leads": int(sum(x["btc_leads"] for x in g)),
            "coins_where_alt_leads": int(sum(x["alt_leads"] for x in g)),
            "coins_bidirectional": int(sum(x["bidirectional"] for x in g)),
            "coins_tested": len(g),
            "mean_contemporaneous_corr": round(float(np.mean(
                [v["cross_correlation"]["contemporaneous"] for v in out.values()])), 4),
        },
        "literature": {
            "sources": ["sifat2019", "ciaian2018"],
            "predicts": "Bi-directional causality (not one-way BTC leadership); coupling stronger short-run",
        },
    }


# ── 4. Event study: BTC shocks split by sign ─────────────────────────────────

def analysis_event_study(ret4h: pd.DataFrame, close4h: pd.DataFrame) -> dict:
    """Tests Demir et al. 2021 / Sila et al. 2024: BTC DOWN-moves should hit
    alts harder than equivalent UP-moves.

    A shock is a BTC 4h return beyond +/-2 sigma, where sigma is the trailing
    (causal) 30d standard deviation."""
    btc = ret4h[BTC]
    sigma = btc.rolling(180, min_periods=60).std().shift(1)   # causal
    z = btc / sigma

    up_idx = z[z >= 2].index
    down_idx = z[z <= -2].index

    horizons = {"4h": 1, "12h": 3, "24h": 6}
    out = {}
    for sym in ALTS:
        alt = ret4h[sym]
        entry = {}
        for hname, hcandles in horizons.items():
            # Forward cumulative return over the horizon AFTER the shock candle
            fwd = alt.shift(-1).rolling(hcandles).sum().shift(-(hcandles - 1))

            up_resp = fwd.reindex(up_idx).dropna().values
            dn_resp = fwd.reindex(down_idx).dropna().values
            if len(up_resp) < 10 or len(dn_resp) < 10:
                continue

            up_mean, dn_mean = float(np.mean(up_resp)), float(np.mean(dn_resp))
            up_ci = _bootstrap_ci(up_resp, np.mean)
            dn_ci = _bootstrap_ci(dn_resp, np.mean)
            entry[hname] = {
                "after_btc_up": {"mean_return_pct": round(up_mean * 100, 4),
                                 "n": int(len(up_resp)), "ci95_pct": [
                                     round(up_ci[0] * 100, 4) if up_ci[0] is not None else None,
                                     round(up_ci[1] * 100, 4) if up_ci[1] is not None else None]},
                "after_btc_down": {"mean_return_pct": round(dn_mean * 100, 4),
                                   "n": int(len(dn_resp)), "ci95_pct": [
                                       round(dn_ci[0] * 100, 4) if dn_ci[0] is not None else None,
                                       round(dn_ci[1] * 100, 4) if dn_ci[1] is not None else None]},
                # |down response| - |up response|: positive = crashes hit harder
                "asymmetry_pct": round((abs(dn_mean) - abs(up_mean)) * 100, 4),
            }
        if entry:
            out[sym] = entry

    asym24 = [v["24h"]["asymmetry_pct"] for v in out.values() if "24h" in v]
    return {
        "shock_definition": "BTC 4h return beyond +/-2 trailing-30d sigma (causal)",
        "n_up_shocks": int(len(up_idx)),
        "n_down_shocks": int(len(down_idx)),
        "per_coin": out,
        "summary": {
            "mean_asymmetry_24h_pct": round(float(np.mean(asym24)), 4) if asym24 else None,
            "coins_where_down_hits_harder": int(sum(a > 0 for a in asym24)) if asym24 else None,
            "coins_measured": len(asym24),
        },
        "literature": {
            "sources": ["demir2021", "sila2024"],
            "predicts": "BTC declines affect altcoins more than equivalent increases",
        },
    }


# ── 5. Regime propagation (uses our production regime definition) ────────────

def analysis_regime_propagation(close4h: pd.DataFrame) -> dict:
    """When BTC's trend regime FLIPS, how often and how fast does each alt's
    regime follow? This is the analysis that feeds the Phase C propagation
    forecast, and it is the empirical test of the 'altseason' heuristic that
    Phase A found has no peer-reviewed support."""
    btc_reg = _trend_regime(close4h[BTC])
    horizon = 6           # 24h in 4h candles

    out = {}
    for sym in ALTS:
        alt_reg = _trend_regime(close4h[sym])
        df = pd.DataFrame({"b": btc_reg, "a": alt_reg}).dropna()
        if len(df) < 200:
            continue

        flips = df["b"] != df["b"].shift(1)
        flip_idx = df.index[flips & df["b"].shift(1).notna()]
        flip_positions = {df.index.get_loc(ts) for ts in flip_idx}

        def _converges(pos: int):
            """From row `pos`, does the alt reach BTC's CURRENT regime within
            `horizon` candles? Returns (evaluated, converged, lag) — evaluated
            is False when they already agree, which is not a convergence event."""
            if pos + horizon >= len(df):
                return False, False, None
            target = df["b"].iloc[pos]
            if df["a"].iloc[pos] == target:
                return False, False, None
            window = df["a"].iloc[pos + 1: pos + 1 + horizon]
            match = np.where(window.values == target)[0]
            return True, bool(len(match)), (int(match[0] + 1) if len(match) else None)

        # Treatment: rows where BTC's regime just flipped.
        followed, lags, n_valid = 0, [], 0
        for pos in sorted(flip_positions):
            ev, conv, lag = _converges(pos)
            if not ev:
                continue
            n_valid += 1
            if conv:
                followed += 1
                lags.append(lag)

        # MATCHED control: identical convergence question asked on rows where
        # BTC did NOT just flip. The earlier version compared this conditional
        # rate against the unconditional P(regimes agree), which is a different
        # quantity entirely — it counts already-agreeing rows that the
        # conditional measure excludes by construction, and made every coin look
        # like it had large negative lift.
        ctrl_valid, ctrl_conv = 0, 0
        for pos in range(len(df)):
            if pos in flip_positions:
                continue
            ev, conv, _ = _converges(pos)
            if not ev:
                continue
            ctrl_valid += 1
            if conv:
                ctrl_conv += 1

        follow_rate = followed / n_valid if n_valid else None
        ctrl_rate = ctrl_conv / ctrl_valid if ctrl_valid else None
        entry = {
            "n_btc_flips": int(len(flip_idx)),
            "n_evaluated": n_valid,
            "followed_within_24h": followed,
            "follow_rate": round(follow_rate, 4) if follow_rate is not None else None,
            "control_rate": round(ctrl_rate, 4) if ctrl_rate is not None else None,
            "n_control": ctrl_valid,
            "median_lag_candles": int(np.median(lags)) if lags else None,
            "median_lag_hours": int(np.median(lags) * 4) if lags else None,
            "regime_agreement_overall": round(float((df["a"] == df["b"]).mean()), 4),
        }
        if follow_rate is not None and ctrl_rate is not None:
            entry["lift_over_control"] = round(follow_rate - ctrl_rate, 4)
            # Two-proportion z-test: is the flip-conditioned rate different?
            p_pool = (followed + ctrl_conv) / (n_valid + ctrl_valid)
            se = np.sqrt(p_pool * (1 - p_pool) * (1 / n_valid + 1 / ctrl_valid))
            if se > 0:
                from scipy.stats import norm
                zstat = (follow_rate - ctrl_rate) / se
                entry["z_stat"] = round(float(zstat), 3)
                entry["p_value"] = float(f"{2 * (1 - norm.cdf(abs(zstat))):.4f}")
                entry["significant_at_05"] = bool(entry["p_value"] < 0.05)
        out[sym] = entry

    rates = [v["follow_rate"] for v in out.values() if v.get("follow_rate") is not None]
    lifts = [v["lift_over_control"] for v in out.values() if v.get("lift_over_control") is not None]
    sigs = [v for v in out.values() if v.get("significant_at_05")]
    return {
        "definition": (f"BTC regime flip -> does the alt reach the same regime within "
                       f"{horizon} candles (24h)? Regime = vol-normalized EMA"
                       f"{LABEL_EMA_FAST}-{LABEL_EMA_SLOW} score vs tau={LABEL_TREND_TAU} "
                       f"(identical to the production label definition)."),
        "control": ("Matched control: the SAME convergence question evaluated on rows "
                    "where BTC did not just flip, restricted identically to rows where "
                    "the regimes currently disagree. lift = flip rate - control rate."),
        "per_coin": out,
        "summary": {
            "mean_follow_rate": round(float(np.mean(rates)), 4) if rates else None,
            "mean_lift_over_control": round(float(np.mean(lifts)), 4) if lifts else None,
            "coins_with_positive_lift": int(sum(l > 0 for l in lifts)) if lifts else None,
            "coins_significant_at_05": len(sigs),
            "coins_measured": len(rates),
        },
        "literature": {
            "note": ("No peer-reviewed source supports the 'altseason'/dominance-rotation "
                     "heuristic (Phase A documented gap). This analysis tests it directly."),
        },
    }


# ── 6. Spillover share (Diebold-Yilmaz style) ────────────────────────────────

def analysis_spillover(ret4h: pd.DataFrame) -> dict:
    """Simplified Diebold & Yilmaz (2012) forecast-error variance
    decomposition on squared returns (a volatility proxy).

    Tests Koutmos 2018 ('BTC is the dominant contributor of spillovers') and
    Yi et al. 2018 ('dominant but not sole')."""
    from statsmodels.tsa.api import VAR

    vol = (ret4h ** 2).dropna()
    # Standardize so no single high-variance coin dominates the decomposition
    vol = (vol - vol.mean()) / vol.std()
    vol = vol.replace([np.inf, -np.inf], np.nan).dropna()
    if len(vol) < 300:
        return {"error": "insufficient observations for VAR"}

    try:
        model = VAR(vol)
        fitted = model.fit(maxlags=4, ic=None)
        horizon = 10
        fevd = fitted.fevd(horizon)
        # decomp[i][j] = share of variable i's variance explained by shocks to j
        decomp = fevd.decomp[:, horizon - 1, :]
        cols = list(vol.columns)
        btc_i = cols.index(BTC)

        per_coin, to_others = {}, []
        for i, sym in enumerate(cols):
            if sym == BTC:
                continue
            share = float(decomp[i, btc_i])
            own = float(decomp[i, i])
            per_coin[sym] = {
                "btc_share_of_variance": round(share * 100, 2),
                "own_share": round(own * 100, 2),
            }
            to_others.append(share)

        # BTC's own share tells us how self-driven BTC is
        btc_own = float(decomp[btc_i, btc_i])
        return {
            "method": "VAR(4) FEVD on standardized squared 4h returns, horizon 10",
            "n_observations": int(len(vol)),
            "per_coin": per_coin,
            "summary": {
                "mean_btc_share_pct": round(float(np.mean(to_others)) * 100, 2),
                "max_btc_share_pct": round(float(np.max(to_others)) * 100, 2),
                "min_btc_share_pct": round(float(np.min(to_others)) * 100, 2),
                "btc_own_variance_share_pct": round(btc_own * 100, 2),
            },
            "literature": {
                "sources": ["koutmos2018", "yi2018", "diebold2012"],
                "predicts": "BTC is a dominant — but not sole — source of volatility spillovers",
            },
        }
    except Exception as e:
        return {"error": str(e)[:200]}


# ── main ─────────────────────────────────────────────────────────────────────

def main():
    t0 = time.time()
    log.info("Phase B: fetching market data...")

    frames_4h, frames_1h = {}, {}
    for sym in SYMBOLS:
        try:
            frames_4h[sym] = fetch_ohlcv(sym, "4h", days=DAYS_4H)
            frames_1h[sym] = fetch_ohlcv(sym, "1h", days=DAYS_1H)
            log.info(f"  {sym}: 4h={len(frames_4h[sym])} 1h={len(frames_1h[sym])}")
        except Exception as e:
            log.warning(f"  {sym} fetch failed: {e}")

    missing = [s for s in SYMBOLS if s not in frames_4h]
    if BTC not in frames_4h:
        log.error("BTC data unavailable — cannot run BTC-relative analyses.")
        sys.exit(1)

    close4h = _align(frames_4h)
    close1h = _align(frames_1h)
    ret4h = close4h.apply(_log_returns).dropna()
    ret1h = close1h.apply(_log_returns).dropna()

    span = (pd.to_datetime(close4h.index.min(), unit="ms").strftime("%Y-%m-%d"),
            pd.to_datetime(close4h.index.max(), unit="ms").strftime("%Y-%m-%d"))
    log.info(f"Aligned: {len(ret4h)} 4h rows, {len(ret1h)} 1h rows, {span[0]} -> {span[1]}")

    report = {
        "meta": {
            "phase": "B — empirical replication",
            "generated": pd.Timestamp.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
            "data_source": "Binance spot (USDT-quoted)",
            "coins": SYMBOLS,
            "missing_coins": missing,
            "date_range": {"start": span[0], "end": span[1]},
            "n_4h_candles": int(len(ret4h)),
            "n_1h_candles": int(len(ret1h)),
            "bootstrap_iterations": BOOTSTRAP_N,
            "caveats": [
                "All pairs are USDT-quoted; Balcilar & Ozdemir (2023) find stablecoins "
                "behave differently from other crypto assets, so USDT dynamics are "
                "embedded in every series here.",
                "Granger causality is PREDICTIVE, not mechanistic — it does not establish "
                "that BTC causes altcoin moves in any structural sense.",
                "Granger p-values are the minimum across lags 1-6 and are not corrected "
                "for multiple testing; treat marginal results with caution.",
                "Findings describe the sample period only and may not persist.",
            ],
        }
    }

    log.info("[1/6] rolling correlation...")
    report["correlation"] = analysis_correlation(ret4h)
    log.info("[2/6] beta (calm vs stress)...")
    report["beta"] = analysis_beta(ret4h)
    log.info("[3/6] lead-lag + bidirectional Granger...")
    report["lead_lag"] = analysis_lead_lag(ret1h)
    log.info("[4/6] event study (shocks split by sign)...")
    report["event_study"] = analysis_event_study(ret4h, close4h)
    log.info("[5/6] regime propagation...")
    report["regime_propagation"] = analysis_regime_propagation(close4h)
    log.info("[6/6] spillover decomposition...")
    report["spillover"] = analysis_spillover(ret4h)

    os.makedirs(LOG_DIR, exist_ok=True)
    out_path = os.path.join(LOG_DIR, "btc_research.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)

    log.info(f"Saved {out_path} in {time.time() - t0:.0f}s")
    return report


if __name__ == "__main__":
    main()
