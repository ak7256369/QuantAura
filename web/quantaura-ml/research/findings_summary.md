# Phase A Findings — How Bitcoin Affects Other Cryptocurrencies

Compiled 2026-07-30. Eleven sources, every one verified to exist via the
Crossref DOI registry, with findings taken **only** from abstracts fetched via
the Semantic Scholar / Crossref APIs (see `bibliography.json` for the full
records and the verification trail). Citation counts as of the compile date.

---

## Q1 — Correlation structure

**What the literature says:** correlations among cryptocurrencies are
*positive but time-varying* (Aslanidis et al. 2019, FRL — DCC model), and the
BTC–ETH pair specifically shows volatility interdependence that responds to
major news (Katsiampa 2019, FRL — BEKK). Notably Katsiampa finds ETH can act
as a *hedge* against BTC — co-movement is strong but not total.
Correlations between crypto and traditional assets were negligible in the
2019-era data (Aslanidis) — crypto moves as its own bloc.

**Implication for Phase B:** compute *rolling* (not static) BTC–alt
correlations per coin; expect positive values with meaningful variation over
time, and expect per-pair differences large enough that a single "market
correlation" number would mislead.

## Q2 — Lead–lag

**What the literature says:** BTC–alt interdependence is *significantly
stronger in the short run than the long run*; over long horizons macro
factors matter more than BTC (Ciaian et al. 2018, JIFMIM, 2013–2016 daily
data). At hourly/daily frequency, causality between BTC and ETH is
*bi-directional*, not one-way BTC leadership (Sifat et al. 2019, RIBAF,
2017–2018 data).

**Implication for Phase B:** run Granger tests in both directions; measure
lead–lag at multiple horizons (1h→24h); expect the "BTC leads everything"
folk claim to be only partially supported — leadership may be pair-specific
and horizon-specific.

## Q3 — Volatility spillover

**What the literature says:** Koutmos (2018, Economics Letters, 18 coins)
finds *Bitcoin is the dominant contributor of return and volatility
spillovers*, with spillovers rising over time and spiking on major news.
Yi et al. (2018, IRFA, 8 + 52 coins) agree connectedness is high and rising
(since end-2016) but qualify dominance: mega-caps propagate the most shocks,
yet some small coins are also significant net transmitters — BTC is a top
source, *not the only one*. Balcilar & Ozdemir (2023, JRFM, 2017–2022) find
BTC→alt spillovers give *mixed* results for behavioural (FOMO/pump-and-dump)
patterns, and stablecoins (USDT) behave differently from everything else.
Methodology anchor: Diebold & Yilmaz (2012) variance-decomposition
connectedness — the framework most of these papers use.

**Implication for Phase B:** estimate spillover shares with a simplified
Diebold–Yilmaz decomposition; report BTC's share *per alt* rather than one
aggregate; treat USDT-quoting as a caveat when interpreting results.

## Q4 — Asymmetry (crashes vs rallies)

**What the literature says:** this is the most consistent finding across
eras. Demir et al. (2021, FRL, NARDL on ETH/XRP/LTC): *"a decrease in
Bitcoin price has greater effect than an increase on the prices of
altcoins"* in the short run, and the asymmetry intensified after the 2017
crash. Šíla et al. (2024, JIFMIM, TVP-VAR good/bad volatility): *"information
about market downturns spills over substantially faster than news about
comparable market surges."* Mechanism: herding is significant, time-varying,
and *increases with uncertainty* (Bouri et al. 2019, FRL).

**Implication for Phase B:** the event study must split BTC shocks by sign;
prediction from literature: alt response to BTC down-moves should be larger
and faster than to up-moves. This is also the finding with the clearest user
value ("BTC crashes drag alts harder than BTC rallies lift them").

## Q5 — Dominance cycles / "altseason"

**What the literature says:** essentially nothing peer-reviewed. Our search
for academic work on the "altcoin season"/dominance-rotation framework
returned only exchange and trading-site content — not citable under this
project's verification protocol. The nearest academic anchors are Ciaian
(short-run vs long-run structure) and Yi (dominance is real but partial).

**Implication for Phase B/D:** treat "altseason" as an *industry heuristic to
be tested*, not an established finding. Our regime-propagation and rolling-
correlation analyses can directly measure whether "BTC-led" vs "alt-led"
phases exist in our 2024–2026 data — and the page should present whatever we
measure, including a null result. This gap is itself presentable content:
"the most-quoted trading heuristic has no peer-reviewed support; here is what
our data shows."

---

## Cross-cutting cautions for later phases

1. **Data-era drift** — most findings above were estimated on 2013–2019
   data; Šíla 2024 and Balcilar 2023 are the only recent-era sources. Where
   our 2024–2026 replication disagrees with the older papers, the
   disagreement is a finding, not an error.
2. **Correlation ≠ causation** — "BTC leads" claims rest on Granger-type
   predictive causality; the page must say so.
3. **Bi-directionality** — at least for ETH, causality runs both ways
   (Sifat); phrasing like "Bitcoin drives Ethereum" overstates the evidence.
4. **Stablecoin exception** — USDT behaves unlike other coins (Balcilar);
   our USDT-quoted universe makes this a standing interpretation caveat.
