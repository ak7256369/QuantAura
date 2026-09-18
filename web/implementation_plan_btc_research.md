# Implementation Plan — "How Bitcoin Moves the Market" Research Phase

**Status: PLAN ONLY — nothing below is implemented yet.**

Goal: a new dashboard page that presents (1) verified academic findings on how
Bitcoin affects altcoins, (2) our own empirical replication of those effects on
QuantAura's data, and (3) BTC-conditional predictive analytics users can fold
into their own strategy — published under the same honesty standard as the
Signal Reality Check (measured validity next to every claim, no trade
instructions).

---

## Phase A — Literature research (web, verified sources only)

**What:** Collect and verify the academic literature on BTC→altcoin effects.

Research questions to cover:
1. **Correlation structure** — how strongly do alts co-move with BTC, and how
   does it change between calm and stress regimes?
2. **Lead–lag** — does BTC lead altcoin returns, at what horizon (minutes,
   hours, days), and has the lead decayed over time?
3. **Volatility spillover** — how much altcoin volatility is attributable to
   shocks originating in BTC (Diebold–Yilmaz connectedness literature)?
4. **Asymmetry** — do alts react more to BTC crashes than rallies (herding /
   flight-to-quality literature)?
5. **BTC dominance cycles** — the "altseason" rotation effect.

Candidate literature areas to search (titles to be verified, not assumed):
volatility connectedness in cryptocurrency markets (Yi/Xu/Wang; Koutmos;
Ji/Bouri et al.), dynamic crypto correlations (Aslanidis et al.; Katsiampa),
herding in crypto (Bouri et al.), BTC–ETH lead-lag studies, and the original
Diebold–Yilmaz (2012) spillover methodology they build on.

**Authenticity protocol (hard requirement):**
- Sources: peer-reviewed journals, SSRN/arXiv preprints with verifiable pages,
  or primary-data industry research (e.g. exchange/index providers). No blogs,
  no SEO content farms, no unverifiable claims.
- Every entry must be fetched and confirmed to exist (WebFetch of the DOI /
  journal / abstract page) before it enters the bibliography. A claim is only
  recorded if it appears in the fetched abstract/paper, with the exact finding
  paraphrased and attributed. **No citation ships unverified.**
- Each finding recorded as: {title, authors, venue, year, DOI/URL,
  data period studied, method, key quantitative finding, limitation}.

**Deliverable:** `quantaura-ml/research/bibliography.json` (+ a short
`findings_summary.md`) — the page's "What the research says" section renders
from this file, so every card on the site links to its source.

**Acceptance:** ≥8 verified sources spanning all 5 questions; every URL fetched
successfully; no orphan claims.

---

## Phase B — Empirical replication on our own data

**What:** Reproduce each literature effect on our 10 coins with the same
leak-free discipline as the main pipeline. This turns a literature review into
research: "the paper found X on 2017–2019 data; on 2024–2026 Binance data we
measure Y."

Analyses (new module `quantaura-ml/research/btc_effects.py`):
1. **Rolling correlation** — 30d/90d BTC–alt return correlation per coin, full
   history; distribution + current value.
2. **Beta to BTC** — rolling OLS beta per alt (how many % an alt moves per 1%
   BTC move), calm vs high-vol regimes separately.
3. **Lead–lag cross-correlation** — corr(BTC_t, alt_{t+k}) for k = 1h…24h;
   Granger-causality test per pair as the formal check.
4. **Event study** — BTC 4h moves beyond ±2σ: distribution of each alt's
   response over the following 1h/4h/24h, split by direction (asymmetry test).
5. **Regime-conditional response** — using our existing trend-regime labels:
   when BTC's regime flips, how long until each alt's regime follows, and how
   often it does (transition matrix + median lag).
6. **Spillover share** — simplified Diebold–Yilmaz variance-decomposition
   share of each alt's volatility attributable to BTC.

Rules: causal windows only, no look-ahead, report sample sizes and bootstrap
CIs alongside every statistic, and flag any result that contradicts the
literature rather than hiding it.

**Deliverable:** `logs/btc_research.json` — one artifact with every computed
result + metadata (data range, n, CI), regenerated on demand by the script.

**Acceptance:** all 6 analyses computed for all 9 BTC–alt pairs; every number
carries n and CI; script is rerunnable end-to-end.

---

## Phase C — Predictive layer (BTC-conditional outlooks)

**What:** Turn the validated effects into forward-looking analytics users can
act on — with measured validity, in the Reality Check style.

Candidates (ship only what survives validation):
1. **Coupling state** — per alt: current correlation/beta vs its own history
   ("SOL is 0.86-correlated with BTC, 92nd percentile — expect BTC-driven
   moves to dominate").
2. **BTC regime-flip propagation forecast** — when our ensemble flips BTC's
   24h regime signal, the historical propagation table from Phase B.5 gives
   P(alt follows within 24h) per coin. Displayed as probabilities with the
   measured historical hit rate beside them.
3. **Divergence watch** — alts currently decoupled from BTC (low rolling
   corr vs history), flagged as "idiosyncratic — BTC signal less informative."

**Validation gate (same standard as the main models):** each predictive claim
is walk-forward tested on data after its estimation window before it ships;
the page shows that out-of-sample hit rate, its baseline, and n. Anything that
fails stays off the page.

**Explicit boundary:** outputs are conditional probabilities and analytics —
never entries, exits, position sizes or "you should" statements. Same
disclaimer treatment as /predictions.

**Deliverable:** extension of `btc_research.json` with a `predictions` block +
serving path: `serve.py /research` endpoint → Node passthrough route
`/api/research` → frontend.

---

## Phase D — The dashboard page

**Route:** `/research` (nav label: "Research"), following every established
page convention: metadata-only layout (unique title <60ch, description,
canonical, BreadcrumbJsonLd), sitemap entry, one h1, ambient background (new
'correlation web' variant fits the theme), light+dark verified, lazy-loaded
charts via the `charts.tsx` barrel, Disclaimer at the bottom.

Page structure (top to bottom):
1. **Hero strip** — headline stat cards: avg BTC–alt correlation now, most/
   least coupled alt, current BTC regime + confidence (live from /stats).
2. **"What the research says"** — finding cards rendered from
   bibliography.json; each card: plain-language finding, method tag, source
   link. Filterable by the 5 research questions.
3. **"What we measure on our data"** — interactive charts from
   btc_research.json:
   - correlation heatmap (coins × time),
   - beta bar chart with calm/stress toggle,
   - lead–lag curve per coin,
   - event-study response fan (BTC shock → alt response distribution),
   - regime-propagation Sankey/matrix.
   Each chart paired with a one-paragraph "how to read this."
4. **"What it means for the next 24h"** — the Phase C predictive panel, with
   out-of-sample hit rates and baselines displayed beside every probability.
5. **Methodology & limitations** — data range, causal-window rules,
   correlation≠causation note, in-sample vs out-of-sample labeling.

Data freshness: analytics artifact regenerated on a schedule (piggyback on the
autopilot loop when it's running, manual script otherwise); page polls like
useModelStats and shows "computed <date>" so staleness is visible, never
hidden.

**Acceptance:** builds clean, both themes verified in browser, every citation
clickable, every prediction shows its measured validity, CI deploy green.

---

## Phase E — Verification, deploy, and thesis capture

- End-to-end verify with real stack locally (ml-api → node → next).
- Deploy via existing CI; add /research to sitemap; Search Console recrawl.
- Fold the Phase A bibliography + Phase B results into the FYP report's
  literature-review and evaluation chapters (they map 1:1).

---

## Execution order & rough effort

| Phase | Depends on | Effort |
|---|---|---|
| A — literature (web, verified) | — | 1 session |
| B — empirical replication | A (questions frame analyses) | 1–2 sessions |
| C — predictive layer + validation | B | 1 session |
| D — dashboard page | A+B (C can land after) | 1–2 sessions |
| E — deploy + thesis capture | D | short |

Phases A and B can start in parallel; D can ship with A+B content and gain the
C panel later — predictions are the last thing to ship because they're the
only part with a validation gate that can fail.

## Risks / honesty notes

- **Citation integrity is the whole game** — the verification protocol in
  Phase A is non-negotiable; a single fabricated reference poisons the page.
- **Correlation ≠ causation** — the page must say so; "BTC leads" claims rest
  on Granger causality, which is predictive, not mechanistic.
- **Regime dependence** — literature findings from 2017–2019 may not hold on
  2024–2026 data; where our replication disagrees, we show the disagreement
  (that's a finding, not a failure).
- **Predictions can fail validation** — if the propagation forecast doesn't
  beat its baseline out-of-sample, it ships as "not predictive" (which is
  itself honest content), not as a signal.
