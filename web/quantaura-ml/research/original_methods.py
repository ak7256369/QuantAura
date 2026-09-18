# research/original_methods.py — replicate our contradictions with the
# ORIGINAL papers' methods, plus the statistical tightening a referee will ask
# for. This is the "your simpler method caused the contradiction" defence.
#
#   1. NARDL (Shin, Yu & Greenwood-Nimmo 2014), the method of Demir et al.
#      (2021): asymmetric short- and long-run effects of BTC on each altcoin.
#      Our event study contradicted Demir; if NARDL on our data also fails to
#      find crashes-hit-harder, the contradiction is about the ERA, not the
#      method.
#   2. Rolling Diebold-Yilmaz spillover index, the framework of Koutmos
#      (2018): BTC's directional "to-others" share over rolling windows,
#      with BTC ordered FIRST and LAST in the Cholesky factorization to bound
#      the order-dependence of the FEVD.
#   3. Holm-Bonferroni correction across all 18 Granger tests (9 coins x 2
#      directions) — our reported p-values were minima over lags, uncorrected.
#   4. Propagation lag DISTRIBUTION (quartiles, not just median).
#   5. Dominance-conditioned propagation — the direct test of the 'altseason'
#      heuristic: does the follow rate depend on whether BTC is gaining or
#      losing strength relative to the altcoin complex? (Market-cap dominance
#      is not observable from Binance data, so BTC relative strength vs an
#      equal-weighted alt index is used as a PROXY and labeled as such.)
#
# Run:  .venv/Scripts/python.exe research/original_methods.py
# Out:  logs/original_methods.json

import os, sys, json, logging, warnings
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.stats import norm

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
warnings.filterwarnings("ignore")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
log = logging.getLogger("orig")

from config import SYMBOLS, LOG_DIR
from data_sources.binance_spot import fetch_ohlcv
from research.btc_effects import _align, BTC, ALTS, DAYS_4H
from research.robustness import regime_series, _convergence, _z_test

HORIZON = 6


# ── 1. NARDL (Shin, Yu & Greenwood-Nimmo 2014) ───────────────────────────────

def nardl(y: pd.Series, x: pd.Series, p_lags=4, q_lags=4):
    """Asymmetric ARDL in error-correction form:

        dy_t = c + rho*y_{t-1} + th_pos*POS_{t-1} + th_neg*NEG_{t-1}
               + sum phi_i dy_{t-i} + sum(pi_pos_i dPOS_{t-i} + pi_neg_i dNEG_{t-i}) + e

    with POS/NEG the partial sums of positive/negative dx. Long-run
    coefficients beta_pos = -th_pos/rho, beta_neg = -th_neg/rho. Wald tests:
    long-run asymmetry (th_pos = th_neg) and short-run asymmetry
    (sum pi_pos = sum pi_neg)."""
    import statsmodels.api as sm

    dx = x.diff()
    pos = dx.clip(lower=0).cumsum()
    neg = dx.clip(upper=0).cumsum()

    df = pd.DataFrame({"y": y, "pos": pos, "neg": neg}).dropna()
    dy = df["y"].diff()

    cols = {
        "y_l1": df["y"].shift(1),
        "pos_l1": df["pos"].shift(1),
        "neg_l1": df["neg"].shift(1),
    }
    for i in range(1, p_lags + 1):
        cols[f"dy_l{i}"] = dy.shift(i)
    dpos, dneg = df["pos"].diff(), df["neg"].diff()
    for i in range(0, q_lags + 1):
        cols[f"dpos_l{i}"] = dpos.shift(i)
        cols[f"dneg_l{i}"] = dneg.shift(i)

    X = pd.DataFrame(cols).dropna()
    Y = dy.reindex(X.index)
    X = sm.add_constant(X)
    model = sm.OLS(Y, X).fit(cov_type="HAC", cov_kwds={"maxlags": 6})

    rho = model.params["y_l1"]
    th_pos, th_neg = model.params["pos_l1"], model.params["neg_l1"]
    beta_pos = -th_pos / rho if rho != 0 else np.nan
    beta_neg = -th_neg / rho if rho != 0 else np.nan

    lr_wald = model.wald_test("pos_l1 = neg_l1", scalar=True)
    sr_terms_pos = " + ".join(f"dpos_l{i}" for i in range(0, q_lags + 1))
    sr_terms_neg = " + ".join(f"dneg_l{i}" for i in range(0, q_lags + 1))
    sr_wald = model.wald_test(f"{sr_terms_pos} = {sr_terms_neg}", scalar=True)

    # Demir's headline: SHORT-RUN, a BTC decrease has greater effect than an
    # increase. Compare summed short-run coefficient magnitudes.
    sum_pos = sum(model.params[f"dpos_l{i}"] for i in range(0, q_lags + 1))
    sum_neg = sum(model.params[f"dneg_l{i}"] for i in range(0, q_lags + 1))

    return {
        "n": int(model.nobs),
        "rho": round(float(rho), 5),
        "long_run": {
            "beta_pos": round(float(beta_pos), 4),
            "beta_neg": round(float(beta_neg), 4),
            "asym_p": float(f"{lr_wald.pvalue:.4f}"),
            "asymmetric": bool(lr_wald.pvalue < 0.05),
        },
        "short_run": {
            "sum_coef_pos": round(float(sum_pos), 4),
            "sum_coef_neg": round(float(sum_neg), 4),
            "asym_p": float(f"{sr_wald.pvalue:.4f}"),
            "asymmetric": bool(sr_wald.pvalue < 0.05),
            # Demir's specific claim: |effect of decreases| > |effect of increases|
            "decreases_dominate": bool(abs(sum_neg) > abs(sum_pos)),
        },
    }


def run_nardl(daily_close: pd.DataFrame) -> dict:
    lx = np.log(daily_close[BTC])
    out = {}
    for sym in ALTS:
        try:
            out[sym] = nardl(np.log(daily_close[sym]), lx)
        except Exception as e:
            out[sym] = {"error": str(e)[:120]}
    ok = [v for v in out.values() if "error" not in v]
    sr_asym = [v for v in ok if v["short_run"]["asymmetric"]]
    dec_dom = [v for v in ok if v["short_run"]["decreases_dominate"]]
    return {
        "method": ("NARDL error-correction form (Shin, Yu & Greenwood-Nimmo 2014), "
                   "HAC standard errors, daily log prices, p=q=4 lags — the method "
                   "of Demir et al. (2021)"),
        "per_coin": out,
        "summary": {
            "coins_estimated": len(ok),
            "short_run_asymmetry_significant": len(sr_asym),
            "decreases_dominate_short_run": len(dec_dom),
            "demir_prediction": "decreases dominate in the short run",
        },
    }


# ── 2. Rolling Diebold-Yilmaz spillover index ────────────────────────────────

def rolling_dy(daily_ret: pd.DataFrame, window=180, var_lags=2, horizon=10) -> dict:
    """BTC's directional to-others spillover share over rolling windows,
    computed with BTC ordered first AND last to bound Cholesky order effects.
    Dominance indicator: is BTC the largest to-others transmitter among all
    ten coins in that window?"""
    from statsmodels.tsa.api import VAR

    cols = list(daily_ret.columns)
    orders = {"btc_first": [BTC] + [c for c in cols if c != BTC],
              "btc_last": [c for c in cols if c != BTC] + [BTC]}

    records = []
    idx = daily_ret.index
    for start in range(0, len(daily_ret) - window, 5):     # step 5 days
        sl = daily_ret.iloc[start:start + window]
        rec = {"end_ts": int(idx[start + window - 1])}
        try:
            for oname, order in orders.items():
                data = sl[order]
                fitted = VAR(data).fit(var_lags)
                fevd = fitted.fevd(horizon).decomp[:, horizon - 1, :]
                bi = order.index(BTC)
                # to-others: average share of BTC in every other variable's FEVD
                to_others = {order[i]: float(fevd[i, bi]) for i in range(len(order)) if i != bi}
                rec[f"{oname}_btc_to_others"] = float(np.mean(list(to_others.values())))
                # dominance: does BTC transmit more than any other single coin?
                trans = []
                for j in range(len(order)):
                    share = np.mean([fevd[i, j] for i in range(len(order)) if i != j])
                    trans.append((order[j], float(share)))
                top = max(trans, key=lambda t: t[1])[0]
                rec[f"{oname}_btc_is_top_transmitter"] = bool(top == BTC)
            records.append(rec)
        except Exception:
            continue

    if not records:
        return {"error": "no windows estimated"}
    df = pd.DataFrame(records)
    return {
        "method": (f"Rolling VAR({var_lags}) FEVD, {window}-day window, step 5, "
                   f"horizon {horizon}, daily returns — the Diebold-Yilmaz framework "
                   f"of Koutmos (2018), with BTC ordered first and last to bound "
                   f"Cholesky order-dependence"),
        "n_windows": len(df),
        "btc_to_others_mean": {
            "btc_first": round(float(df["btc_first_btc_to_others"].mean()) * 100, 2),
            "btc_last": round(float(df["btc_last_btc_to_others"].mean()) * 100, 2),
        },
        "btc_top_transmitter_share_of_windows": {
            "btc_first": round(float(df["btc_first_btc_is_top_transmitter"].mean()), 4),
            "btc_last": round(float(df["btc_last_btc_is_top_transmitter"].mean()), 4),
        },
        "koutmos_prediction": "BTC is THE dominant transmitter (his 2018 sample)",
    }


# ── 3. Holm-Bonferroni on the Granger battery ────────────────────────────────

def holm_correction() -> dict:
    path = os.path.join(LOG_DIR, "btc_research.json")
    if not os.path.exists(path):
        return {"error": "btc_research.json missing — run btc_effects.py first"}
    r = json.load(open(path, encoding="utf-8"))
    tests = []
    for sym, v in r["lead_lag"]["per_coin"].items():
        g = v.get("granger", {})
        if "p_btc_causes_alt" in g:
            tests.append((f"{sym}: BTC->alt", g["p_btc_causes_alt"]))
            tests.append((f"{sym}: alt->BTC", g["p_alt_causes_btc"]))
    m = len(tests)
    ranked = sorted(tests, key=lambda t: t[1])
    results, rejected_any = [], True
    for k, (name, p) in enumerate(ranked):
        threshold = 0.05 / (m - k)
        significant = rejected_any and p <= threshold
        if not significant:
            rejected_any = False
        results.append({"test": name, "p_raw": p,
                        "holm_threshold": round(threshold, 5),
                        "significant_after_holm": significant})
    surv = [x for x in results if x["significant_after_holm"]]
    return {
        "n_tests": m,
        "significant_raw": sum(1 for _, p in tests if p < 0.05),
        "significant_after_holm": len(surv),
        "surviving": [x["test"] for x in surv],
        "detail": results,
        "note": ("Raw p-values are minima over lags 1-6, so they are already "
                 "optimistic; Holm correction is applied across the 18-test "
                 "battery on top of that."),
    }


# ── 4+5. Lag distribution and dominance-conditioned propagation ──────────────

def lag_distribution(close4h: pd.DataFrame) -> dict:
    all_lags = []
    per = {}
    for sym in ALTS:
        b = regime_series(close4h[BTC], 0.20, 12, 26)
        a = regime_series(close4h[sym], 0.20, 12, 26)
        df = pd.DataFrame({"b": b, "a": a}).dropna().reset_index(drop=True)
        flips = df["b"] != df["b"].shift(1)
        flip_pos = sorted(i for i in df.index[flips & df["b"].shift(1).notna()])
        _, _, lags = _convergence(df["a"].values, df["b"].values, flip_pos, len(df))
        if lags:
            per[sym] = {"q25_h": int(np.percentile(lags, 25) * 4),
                        "median_h": int(np.percentile(lags, 50) * 4),
                        "q75_h": int(np.percentile(lags, 75) * 4),
                        "n": len(lags)}
            all_lags += lags
    arr = np.array(all_lags)
    return {
        "pooled": {"q25_h": int(np.percentile(arr, 25) * 4),
                   "median_h": int(np.percentile(arr, 50) * 4),
                   "q75_h": int(np.percentile(arr, 75) * 4),
                   "within_8h_share": round(float((arr <= 2).mean()), 4),
                   "n": int(len(arr))},
        "per_coin": per,
    }


def dominance_conditioned(close4h: pd.DataFrame) -> dict:
    """Direct test of the 'altseason' heuristic. PROXY (market-cap dominance is
    not observable from exchange data): 30d change in log(BTC / equal-weighted
    alt index). Rising = BTC gaining on alts ('BTC season'), falling = alts
    gaining ('alt season'). Question: does regime propagation strengthen when
    BTC is gaining?"""
    alt_index = np.log(close4h[ALTS]).mean(axis=1)
    rel = np.log(close4h[BTC]) - alt_index
    rel_trend = rel.diff(180)                      # 30d in 4h candles
    med = rel_trend.median()

    conds = {"btc_gaining": rel_trend > med, "btc_losing": rel_trend <= med}
    out = {}
    for cname, mask in conds.items():
        t_ev = t_cv = c_ev = c_cv = 0
        for sym in ALTS:
            b = regime_series(close4h[BTC], 0.20, 12, 26)
            a = regime_series(close4h[sym], 0.20, 12, 26)
            df = pd.DataFrame({"b": b, "a": a, "m": mask}).dropna().reset_index(drop=True)
            flips = df["b"] != df["b"].shift(1)
            fp = {i for i in df.index[flips & df["b"].shift(1).notna()] if df["m"].iloc[i]}
            cp = [i for i in df.index if i not in fp and df["m"].iloc[i]]
            ev, cv, _ = _convergence(df["a"].values, df["b"].values, sorted(fp), len(df))
            ev2, cv2, _ = _convergence(df["a"].values, df["b"].values, cp, len(df))
            t_ev += ev; t_cv += cv; c_ev += ev2; c_cv += cv2
        fr = t_cv / t_ev if t_ev else None
        cr = c_cv / c_ev if c_ev else None
        z, p = _z_test(t_cv, t_ev, c_cv, c_ev)
        out[cname] = {"follow_rate": round(fr, 4) if fr else None,
                      "control_rate": round(cr, 4) if cr else None,
                      "lift": round(fr - cr, 4) if fr and cr else None,
                      "n_events": t_ev,
                      "p_value": float(f"{p:.5f}") if p is not None else None}
    return {
        "proxy_definition": ("30d change in log(BTC/equal-weighted alt index); "
                             "above median = 'BTC gaining'. This is a RELATIVE-"
                             "STRENGTH proxy, not market-cap dominance."),
        "conditions": out,
        "interpretation_rule": ("If lift differs materially between conditions, "
                                "the 'altseason' heuristic has regime-dependent "
                                "content; if not, propagation is unconditional."),
    }


# ── main ─────────────────────────────────────────────────────────────────────

def main():
    log.info("Fetching daily + 4h data...")
    daily, four_h = {}, {}
    for sym in SYMBOLS:
        try:
            daily[sym] = fetch_ohlcv(sym, "1d", days=DAYS_4H)
            four_h[sym] = fetch_ohlcv(sym, "4h", days=DAYS_4H)
        except Exception as e:
            log.warning(f"  {sym}: {e}")
    daily_close = _align(daily)
    close4h = _align(four_h)
    daily_ret = np.log(daily_close / daily_close.shift(1)).dropna()
    log.info(f"daily={len(daily_close)} rows, 4h={len(close4h)} rows")

    log.info("[1/5] NARDL (Demir's method)...")
    nardl_res = run_nardl(daily_close)
    log.info(f"      {nardl_res['summary']}")
    log.info("[2/5] rolling Diebold-Yilmaz (Koutmos's framework)...")
    dy_res = rolling_dy(daily_ret)
    log.info(f"      to_others={dy_res.get('btc_to_others_mean')} "
             f"top_share={dy_res.get('btc_top_transmitter_share_of_windows')}")
    log.info("[3/5] Holm-Bonferroni on Granger battery...")
    holm = holm_correction()
    log.info(f"      raw {holm.get('significant_raw')}/18 -> holm {holm.get('significant_after_holm')}/18")
    log.info("[4/5] propagation lag distribution...")
    lags = lag_distribution(close4h)
    log.info(f"      pooled {lags['pooled']}")
    log.info("[5/5] dominance-conditioned propagation (altseason test)...")
    dom = dominance_conditioned(close4h)
    log.info(f"      {dom['conditions']}")

    report = {
        "meta": {"generated": pd.Timestamp.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
                 "purpose": ("Original-method replications of the contradicted "
                             "findings + statistical tightening"),
                 "n_daily": int(len(daily_close)), "n_4h": int(len(close4h))},
        "nardl": nardl_res,
        "rolling_diebold_yilmaz": dy_res,
        "granger_holm": holm,
        "lag_distribution": lags,
        "dominance_conditioned_propagation": dom,
    }
    path = os.path.join(LOG_DIR, "original_methods.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)
    log.info(f"Saved {path}")


if __name__ == "__main__":
    main()
