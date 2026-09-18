# Thesis Capture — Bitcoin's Influence on Altcoin Markets

Draft material for the FYP report, mapped onto standard chapter structure.
Every number is reproducible from `research/btc_effects.py`,
`research/validate_propagation.py` and the artifacts in `logs/`.

**Reproduction:**
```
.venv/Scripts/python.exe research/btc_effects.py          -> logs/btc_research.json
.venv/Scripts/python.exe research/validate_propagation.py -> logs/propagation_validation.json
.venv/Scripts/python.exe research/build_predictions.py    -> adds predictions block
```

---

## → Literature Review chapter

### Suggested framing

The literature on cryptocurrency interdependence divides into four strands,
each answering a different question about Bitcoin's role. All eleven sources
below were verified against the Crossref DOI registry, and every finding is
drawn from the paper's own abstract rather than from secondary summaries.

**Interdependence and correlation.** Aslanidis, Bariviera and Martínez-Ibañez
(2019, *Finance Research Letters*, DOI 10.1016/j.frl.2019.04.019) apply a
generalised DCC model and find correlations among cryptocurrencies are positive
but vary substantially over time, while correlations with traditional assets
are negligible — establishing crypto as a self-referential bloc. Katsiampa
(2019, *FRL*, 10.1016/j.frl.2018.10.005) uses a bivariate Diagonal BEKK model
on the BTC–ETH pair and documents conditional volatility interdependence
responsive to news, while noting Ether can serve as a hedge against Bitcoin.

**Price leadership.** Ciaian, Rajcaniova and Kancs (2018, *Journal of
International Financial Markets, Institutions and Money*,
10.1016/j.intfin.2017.11.001) study 17 currencies over 2013–2016 and find the
BitCoin–altcoin price relationship is "significantly stronger in the short-run
than in the long-run", with macro-financial indicators dominating altcoin
formation at longer horizons. Sifat, Mohamad and Mohamed Shariff (2019,
*Research in International Business and Finance*, 10.1016/j.ribaf.2019.06.012)
apply VECM, Granger causality, ARDL and wavelet coherence to hourly and daily
BTC–ETH data and report *bi-directional* causality — a caution against assuming
one-way Bitcoin leadership.

**Volatility spillover.** The methodological foundation is Diebold and Yilmaz
(2012, *International Journal of Forecasting*, 10.1016/j.ijforecast.2011.02.006,
5,257 citations), whose variance-decomposition spillover index underpins most
subsequent work. Koutmos (2018, *Economics Letters*,
10.1016/j.econlet.2018.10.004) applies it to 18 cryptocurrencies and concludes
Bitcoin is "the dominant contributor of return and volatility spillovers", with
spillovers rising over time. Yi, Xu and Wang (2018, *International Review of
Financial Analysis*, 10.1016/j.irfa.2018.08.012) qualify this using a LASSO-VAR
network over 52 coins: mega-cap coins propagate the most shocks, but several
low-profile coins are also significant net transmitters — Bitcoin is a major,
not exclusive, source. Balcilar and Ozdemir (2023, *Journal of Risk and
Financial Management*, 10.3390/jrfm16010041) extend to 2022 using frequency
connectedness and find Bitcoin→altcoin spillovers give mixed evidence for
behavioural (FOMO, pump-and-dump) patterns, with stablecoins behaving
distinctly.

**Asymmetry.** Demir, Simonyan, García-Gómez and Lau (2021, *FRL*,
10.1016/j.frl.2020.101754) apply a NARDL model to ETH, XRP and LTC over
2015–2019 and find "a decrease in Bitcoin price has greater effect than an
increase on the prices of altcoins", intensifying after the 2017 crash. Šíla,
Kočenda, Kristoufek and Kukačka (2024, *JIFMIM*, 10.1016/j.intfin.2024.102062)
decompose volatility into positive and negative components under a TVP-VAR and
find "information about market downturns spills over substantially faster than
news about comparable market surges". The behavioural mechanism is documented by
Bouri, Gupta and Roubaud (2019, *FRL*, 10.1016/j.frl.2018.07.008), whose
rolling-window analysis finds significant time-varying herding that intensifies
with uncertainty.

### Identified gap (defensible contribution claim)

A systematic search found **no peer-reviewed treatment of the "altcoin season" /
Bitcoin-dominance rotation framework**, despite its ubiquity in practitioner
commentary. Available material was confined to exchange marketing and trading
blogs, which fail the verification standard adopted here. Two further gaps
motivate this work: (i) the dominant findings above were estimated on 2013–2019
data, predating spot-ETF approval and institutional participation; and (ii)
existing studies rarely separate *contemporaneous* co-movement from *predictive*
lead, which are distinct claims with very different practical implications.

---

## → Methodology chapter

**Data.** Binance spot OHLCV for ten USDT-quoted pairs (BTC plus nine
altcoins), 2024-07-30 to 2026-07-30: 4,378 aligned 4-hour candles and 8,758
1-hour candles. Series are inner-joined on timestamp so all cross-sectional
comparisons use jointly observed candles.

**Causality discipline.** Every rolling statistic used for classification is
shifted by one period, so no observation contributes to classifying itself.
Volatility regimes, shock thresholds and trend regimes are all computed from
strictly trailing windows.

**Trend-regime definition** (shared with the production forecasting models, so
research and product measure the same object):

```
score_t = (EMA₁₂(close)_t − EMA₂₆(close)_t) / close_t
vol_t   = σ(1-period log returns, 180 periods, lagged) × √6
z_t     = score_t / vol_t
regime  = uptrend if z > 0.20; downtrend if z < −0.20; else neutral
```

**Six analyses.** (1) rolling 30/90-day Pearson correlation; (2) OLS beta to
BTC, partitioned into calm and stress regimes at the 25th/75th percentiles of
trailing BTC volatility; (3) cross-correlation at 1–24h leads in both
directions plus pairwise Granger causality tested *both ways*; (4) event study
on BTC 4-hour returns exceeding ±2 trailing-30-day σ, with responses
partitioned by shock sign; (5) regime-propagation analysis; (6) VAR(4)
forecast-error variance decomposition (Diebold–Yilmaz) on standardised squared
returns.

**Inference.** 95% confidence intervals by percentile bootstrap (1,000
resamples), paired resampling where statistics are computed on joint series.
Proportions compared by two-proportion z-test.

### Control design (methodologically the most important section)

The propagation analysis asks: *after Bitcoin's regime flips, does a
disagreeing altcoin converge to Bitcoin's new regime within 24 hours?* The
treatment rate is conditional on current disagreement, since agreement offers
no convergence to observe.

The first implementation compared this against the *unconditional* probability
that the two regimes agree. That comparison is invalid: the unconditional rate
is dominated by already-agreeing observations, which the treatment measure
excludes by construction. It produced a mean lift of **−0.222** with 0 of 9
coins positive — the exact opposite of the corrected result.

The corrected design uses a **matched control**: the identical convergence
question, evaluated on observations where Bitcoin did *not* just flip, under the
identical disagreement restriction. This yields **+0.133** mean lift with 9 of 9
coins positive and 8 significant at p<0.05.

*This inversion is worth foregrounding in the report: the substantive
conclusion was determined entirely by control specification, not by the data.*

### Validation protocol

Because in-sample effects can reflect overfitting, the propagation result was
subjected to a temporal hold-out: rates estimated on the first 60% of aligned
observations, then evaluated on the final 40%, with the matched control
recomputed within each split so no information crosses the boundary. A
pre-registered gate required (i) pooled out-of-sample lift significant at
p<0.05 and (ii) more than half of coins showing positive out-of-sample lift.
Predictions failing the gate were not deployed.

---

## → Results chapter

### Table 1 — Correlation structure (RQ1)

| Statistic | Value |
|---|---|
| Mean full-sample BTC–altcoin correlation | 0.732 |
| Correlations positive | 9 / 9 |
| Mean 90-day rolling range (max − min) | 0.320 |
| Highest / lowest coupling | ETH 0.819 / XRP 0.655 |

Consistent with Aslanidis et al. (2019). All bootstrap CIs exclude zero.

### Table 2 — Lead–lag structure (RQ2)

| Statistic | Value |
|---|---|
| Mean contemporaneous correlation | **0.772** |
| Mean 1-hour-ahead correlation (BTC leading) | **≈ 0.006** |
| Granger: BTC → altcoin significant | 6 / 9 |
| Granger: altcoin → BTC significant | 4 / 9 |
| Bi-directional | 4 / 9 |

Bi-directionality partially replicates Sifat et al. (2019). The two-order-of-
magnitude gap between contemporaneous and lagged correlation is the principal
result: **the relationship is co-movement, not lead.**

### Table 3 — Volatility spillover (RQ3)

| Coin | BTC share of variance (%) |
|---|---|
| SOL | 48.4 |
| ETH | 48.1 |
| DOGE | 33.5 |
| LINK | 31.8 |
| BNB | 24.1 |
| AVAX | 23.1 |
| XRP | 17.2 |
| ADA | 15.2 |
| DOT | 14.0 |
| **Mean** | **28.4** |

Bitcoin's own variance is 92.4% self-driven. This **contradicts** Koutmos
(2018) — Bitcoin explains a minority of altcoin volatility — and supports Yi et
al. (2018).

### Table 4 — Event study, ±2σ Bitcoin shocks (RQ4)

109 up-shocks, 143 down-shocks. Mean altcoin return over the following 24h:

| Coin | After BTC up (%) | After BTC down (%) | Asymmetry (pp) |
|---|---|---|---|
| XRP | +0.219 | +0.886 | +0.667 |
| ETH | +0.023 | −0.163 | +0.139 |
| BNB | −0.151 | +0.060 | −0.092 |
| DOGE | −0.409 | +0.126 | −0.283 |
| SOL | −0.587 | −0.273 | −0.314 |
| LINK | −0.461 | −0.074 | −0.388 |
| ADA | −0.637 | +0.182 | −0.455 |
| AVAX | −0.589 | −0.132 | −0.457 |
| DOT | −1.066 | −0.255 | −0.811 |
| **Mean** | | | **−0.222** |

**Contradicts** Demir et al. (2021) and Šíla et al. (2024): only 2 of 9 coins
show larger downside response. The pattern is mean-reverting — altcoins tend to
drift *down* after Bitcoin surges.

### Table 5 — Beta by volatility regime

| Statistic | Value |
|---|---|
| Mean beta to BTC | 1.274 |
| Mean R² | 0.529 |
| Mean (stress beta − calm beta) | −0.303 |
| Coins with higher beta under stress | 0 / 9 |

Altcoins amplify Bitcoin moves, but beta *falls* in stress — inconsistent with
the herding prediction of Bouri et al. (2019), though beta and CSAD-based
herding measure different quantities.

### Table 6 — Regime propagation, out-of-sample (RQ5)

| Coin | Follow rate | Control | Lift | p | n |
|---|---|---|---|---|---|
| LINK | 0.660 | 0.404 | **+0.256** | 0.0006 | 50 |
| ETH | 0.625 | 0.467 | +0.158 | 0.043 | 48 |
| XRP | 0.518 | 0.366 | +0.153 | 0.027 | 54 |
| ADA | 0.418 | 0.274 | +0.144 | 0.025 | 55 |
| BNB | 0.500 | 0.361 | +0.139 | 0.039 | 58 |
| SOL | 0.480 | 0.343 | +0.137 | 0.055 | 50 |
| AVAX | 0.434 | 0.300 | +0.134 | 0.046 | 53 |
| DOGE | 0.455 | 0.328 | +0.127 | 0.059 | 55 |
| DOT | 0.349 | 0.284 | +0.065 | 0.276 | 63 |
| **Pooled** | **0.488** | **0.337** | **+0.151** | **<0.001** | **486** |

Pooled z = 6.61. All nine coins positive out-of-sample; mean absolute
calibration error 9.6pp. The out-of-sample lift (+0.146 mean) slightly
**exceeds** the in-sample estimate (+0.123), which is inconsistent with
overfitting.

### Table 7 — Robustness (`research/robustness.py` → `logs/robustness.json`)

**Walk-forward, 5 expanding-window folds** (addresses "was the single 60/40
split lucky?"):

| Fold | Follow | Control | Lift | p | n |
|---|---|---|---|---|---|
| 1 | 0.316 | 0.297 | +0.020 | 0.659 | 117 |
| 2 | 0.629 | 0.336 | +0.294 | <0.001 | 89 |
| 3 | 0.532 | 0.331 | +0.200 | <0.001 | 126 |
| 4 | 0.421 | 0.349 | +0.072 | 0.079 | 152 |
| 5 | 0.446 | 0.324 | +0.121 | 0.010 | 110 |

5/5 folds positive, 3/5 individually significant, mean +0.141. Fold 1 is the
weakest (+0.020) — the effect varies in magnitude but never reverses sign.

**Specification grid, 15 combinations** (τ ∈ {0.10…0.30} × EMA ∈ {8/21, 12/26,
20/50}): **15/15 positive and 15/15 significant**, lift range +0.086 to +0.178,
mean +0.140. The production specification (τ=0.20, EMA 12/26) sits mid-range,
so the headline figure is not a favourable parameter selection. EMA(12,26) is
moreover the conventional MACD pairing — a convention independent of this
sample, not a tuned value — and τ=0.20 does not maximize the lift within the
grid, so selection on the overlapping product data cannot account for the effect.

**Yearly subsamples:** 2024 +0.142, 2025 +0.138, 2026 +0.118 — all significant
at p<0.001. Stable across every year in the sample.

### Table 8 — Economic significance (the decisive negative result)

Trading each propagation event in the implied direction (long on a flip to
uptrend, short to downtrend), holding 24h, at 0.15% per side / 0.30% round trip:

| Coin | n | Gross (%) | **Net (%)** | Win rate |
|---|---|---|---|---|
| ETH | 82 | +0.757 | **+0.457** | 0.476 |
| LINK | 71 | +0.603 | **+0.303** | 0.451 |
| BNB | 76 | +0.166 | −0.134 | 0.539 |
| DOGE | 78 | +0.062 | −0.238 | 0.449 |
| DOT | 73 | +0.039 | −0.261 | 0.479 |
| XRP | 76 | −0.137 | −0.437 | 0.447 |
| AVAX | 64 | −0.601 | −0.901 | 0.438 |
| SOL | 66 | −0.630 | −0.930 | 0.379 |
| ADA | 70 | −0.646 | −0.946 | 0.457 |
| **Mean** | | | **−0.343** | |

**Only 2 of 9 coins are profitable after costs, and the mean is negative.**

### Table 9 — Original-method replications (`research/original_methods.py`)

**NARDL (the method of Demir et al. 2021), daily data 2024–26, HAC errors:**

| Statistic | Value |
|---|---|
| Coins with significant short-run asymmetry | **1 / 9** (BNB, p=0.014) |
| Coins where decreases dominate (point estimate) | 6 / 9 |
| Demir et al. (2015–2019 data) | asymmetry significant, decreases dominate |

Using the original machinery on the modern era, the crash-asymmetry effect is
**largely absent** — point estimates lean the same way as Demir for 6 of 9
coins, but significance survives for only one. The contradiction between our
event study and Demir et al. is therefore attributable to the **sample era**,
not to methodological simplification.

**Rolling Diebold–Yilmaz (the framework of Koutmos 2018), 180-day windows,
BTC ordered first vs last in the Cholesky factorization:**

| Ordering | BTC to-others share | BTC top transmitter (share of windows) |
|---|---|---|
| BTC first | 54.8% | 100% |
| BTC last | 1.0% | 0% |

With contemporaneous correlation of ~0.77, Cholesky-identified "dominance" is
close to **unidentified**: whoever is ordered first receives credit for the
common shock. The full-sample estimate reported in Table 3 (28.4%) lies inside
these bounds. Implication for the literature: claims about *which* coin
dominates volatility transmission are highly sensitive to identification, and
order-invariant (generalized) decompositions should be treated as the minimum
standard.

**Holm–Bonferroni across the 18-test Granger battery:**

| | Significant tests |
|---|---|
| Raw (min over lags 1–6, uncorrected) | 10 / 18 |
| **After Holm correction** | **2 / 18** (DOT: BTC→alt; XRP: alt→BTC) |

Correction nearly eliminates the pairwise hourly causality — and the two
survivors point in *opposite* directions. This **strengthens** the paper's
central claim: there is no robust one-way hourly lead from Bitcoin.

**Propagation lag distribution (pooled, n=550 convergence events):** quartiles
4h / 12h / 16h; 47.5% of convergences occur within 8 hours.

**Dominance-conditioned propagation (direct test of the "altseason"
heuristic, using BTC relative strength vs an equal-weighted alt index as a
labelled proxy):**

| Condition | Follow rate | Control | Lift | p |
|---|---|---|---|---|
| BTC gaining on alts | 0.470 | 0.318 | **+0.152** | <0.001 |
| BTC losing to alts | 0.414 | 0.306 | **+0.108** | <0.001 |

Propagation is significant in both states but ~4.4pp stronger when Bitcoin is
gaining — the first quantitative content, to our knowledge, behind the
practitioner "Bitcoin season" intuition: BTC's regime leadership strengthens
modestly when capital is rotating toward it, but does not disappear otherwise.

### Table 10 — Independence and cross-exchange robustness (`research/bulletproof.py`)

The pooled out-of-sample test re-run under two attacks: (i) events thinned so
no evaluation window overlaps another (removing the dependence objection to the
z-test), and (ii) the entire 60/40 out-of-sample design replicated on
**Coinbase USD pairs** — a different exchange, matching engine, user base and
quote currency (BNB excluded; it does not trade on Coinbase).

| Sample | Events | Lift | p |
|---|---|---|---|
| Binance USDT — all events | 486 | +0.150 | <0.001 |
| Binance USDT — **non-overlapping** | 375 | **+0.142** | 7×10⁻⁶ |
| Coinbase USD — all events (8/8 coins positive) | — | **+0.165** | <0.001 |
| Coinbase USD — non-overlapping | — | **+0.151** | 9×10⁻⁶ |

The effect survives independence thinning essentially unchanged and is, if
anything, *stronger* on the independent venue. Combined with Tables 6–7, the
propagation result now holds: out-of-sample, across 5 walk-forward folds,
across 15 parameter specifications, in every yearly subsample, under
non-overlapping events, and on a second exchange in a second quote currency.

---

## → Discussion chapter

### Reconciling the contradictions

Three findings contradict the published literature. The most plausible
explanation is structural change in the sample period rather than error in
either study. The 2024–2026 market differs from the 2013–2019 samples
underpinning Koutmos, Demir and Bouri: spot-ETF approval, institutional
participation, deeper derivatives markets and materially higher altcoin
liquidity. Under those conditions, altcoins plausibly develop more idiosyncratic
variance — which would simultaneously reduce Bitcoin's spillover share (Table
3), lower beta under stress (Table 5), and permit the mean-reverting response
observed after Bitcoin shocks (Table 4).

Two secondary explanations should be acknowledged: methodological simplification
(this work uses a VAR-based FEVD and a straightforward event study, where the
original papers use LASSO-VAR networks, NARDL and TVP-VAR specifications), and
sample-period specificity — a two-year window contains a limited number of
independent volatility regimes.

### Statistical significance without economic significance

The robustness evidence pulls in two directions, and the tension is the
paper's most defensible contribution.

The propagation effect is *unusually* robust for this literature: positive in
5/5 walk-forward folds, in 15/15 parameter specifications (all significant), and
in all three yearly subsamples. It is not a specification artefact and not a
lucky split.

Yet trading it is not profitable. Executing every propagation event in the
implied direction returns **−0.343% mean net** after a 0.30% round trip, with
only 2 of 9 coins positive. The edge is real and it is too small to survive
frictions — the median lag of 8–14 hours means the informative move is largely
complete before a position taken on the signal can capture it.

This mirrors the result obtained for the project's primary forecasting models,
where 81% regime-F1 corresponded to 52% directional accuracy and cost-negative
BUY signals. Two independent analyses of the same market therefore converge on
the same conclusion: **predictability and profitability are distinct
properties, and demonstrating the former does not establish the latter.**

That framing is also what makes the finding publishable. Claims of profitable
cryptocurrency strategies are common and weakly evidenced; a carefully
validated, robustness-checked effect reported *with* its economic failure is a
more credible contribution than an unverifiable profit claim.

### The distinction this work isolates

The central contribution is separating two claims usually conflated. Bitcoin
and altcoins **co-move** strongly (0.772 contemporaneous), yet Bitcoin has
almost **no short-horizon predictive lead** (~0.006 at one hour). Practitioner
reasoning of the form "Bitcoin just moved, so this altcoin will follow" is not
supported.

Leadership does exist, but at a **different level of abstraction**: when
Bitcoin's *trend regime* changes, disagreeing altcoins converge to it within 24
hours materially more often than at other times (+15.1pp out-of-sample,
p<0.001), with a median lag of 8–14 hours. Regime transitions propagate;
hour-to-hour returns do not. This reconciles the strong practitioner intuition
about Bitcoin's leadership with its absence in high-frequency return data.

### Deployment ethics

Two candidate features were tested and **rejected**: hourly Bitcoin→altcoin
prediction (predictive correlation ~0.006) and a crash-asymmetry signal
(contradicted by our own data). Both are published on the deployed system with
their rejection reasons. Every published probability appears beside its control
rate, since a 49% figure alone invites reading as a promise, whereas "49%
against a 34% baseline" exposes the actual information content.

---

## → Limitations

1. **Sample period.** Two years; findings may not generalise across regimes.
2. **Stablecoin denomination.** All pairs are USDT-quoted; Balcilar and Ozdemir
   (2023) show stablecoins behave distinctly, so USDT dynamics are embedded in
   every series.
3. **Granger causality is predictive, not structural.** It does not establish
   that Bitcoin *causes* altcoin movement in any mechanistic sense.
4. **Multiple testing.** Granger p-values are minima across lags 1–6 and are
   uncorrected; marginal results warrant caution.
5. **Single hold-out split.** The gate uses one 60/40 temporal split; k-fold
   walk-forward across multiple origins would strengthen the claim.
6. **Regime definition dependence.** Results are conditional on the EMA(12,26),
   τ=0.20 specification; sensitivity analysis across τ is not yet performed.

7. **Survivorship in universe selection.** The ten-coin universe comprises
   2026's major pairs studied backwards over 2024–26. All ten were already
   top-30 assets at the sample start, which bounds the bias, but coins that
   *fell out* of the majors during the window are absent by construction.
   Claims are therefore about "persistent major altcoins," not the full
   cross-section.
8. **Parameter provenance.** τ=0.20 and EMA(12,26) were selected for the
   forecasting system before the research phase, on data overlapping the
   research sample, so the production specification cannot be treated as
   independently pre-registered. Two facts bound the concern: EMA(12,26) is the
   standard MACD pairing — a convention independent of this sample, not a tuned
   value — and within the 15-cell grid the production specification sits
   mid-range rather than at the maximum, with all fifteen positive and
   significant. The effect is a property of the regime construct across the
   whole specification family, not of the inherited parameters — though a
   strictly out-of-sample specification would still be the stronger design.
9. **Event dependence.** BTC regime flips can occur within one another's
   24-hour evaluation windows, so pooled test observations are not strictly
   independent. Addressed directly: the non-overlapping re-test
   (`research/bulletproof.py`, Table 10) spaces events beyond the horizon and
   thins controls identically.

---

## → Viva defence notes

**"Isn't this just measuring that trends persist?"** — No, and that is
precisely what the matched control isolates. The control measures convergence
at moments when Bitcoin did *not* flip, under the same disagreement
restriction. Persistence affects both arms equally; the +15.1pp gap is what
remains after it is differenced out.

**"Why do your results contradict published papers?"** — Different market
regime (2024–26 versus 2013–19, post-ETF), acknowledged methodological
simplification, and a limited sample. The contradictions are reported rather
than suppressed, with the discussion offering candidate explanations.

**"How do you know it isn't overfitted?"** — A 60/40 temporal hold-out with the
control recomputed inside each split. The out-of-sample lift *exceeds* the
in-sample estimate, which overfitting does not produce.

**"Why is the effect absent hourly but present at regime level?"** — They
measure different objects. Hourly returns are dominated by noise and
contemporaneous shocks; a regime change is a persistent state transition, and
capital reallocation across assets takes hours, matching the observed 8–14h
median lag.

**"What would falsify your claim?"** — Out-of-sample lift indistinguishable
from zero, or a control rate matching the treatment rate. Both were tested for;
the gate was pre-specified to reject on either.
