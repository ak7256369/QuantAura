# PUBLICATION README — from this repository to a published article

Status date: 2026-07-31. Everything referenced here exists in this repo and is
reproducible with the commands shown. Work through the steps in order.

---

## 0. What the paper is (and what it is NOT)

**Working title:**
*Co-movement Without Leadership: Bitcoin's Regime-Level Influence on Altcoins,
and Why Its Predictability Is Not Profitability*

**One-paragraph pitch:** Bitcoin–altcoin correlation is strong (0.772
contemporaneous) but Bitcoin's hourly predictive lead is ~zero (0.006).
Leadership exists only at the trend-regime level: after a BTC regime flip,
disagreeing altcoins converge within 24h at +15.1pp above a matched control
(p<0.001, out-of-sample), an effect robust across 5 walk-forward folds, 15
parameter specifications and all yearly subsamples — yet trading it nets
−0.343% after costs. A four-architecture ensemble (LSTM, XGBoost, Transformer,
KAN) built on the same regime target reproduces the conclusion independently:
81% regime-F1 decomposes to 52% directional accuracy and cost-negative
signals. Predictability and profitability are distinct properties, and
classification metrics without economic decomposition systematically
overstate crypto forecastability.

### Novelty audit (done 2026-07-31 — be precise about these claims)

| Candidate claim | Verdict | Prior art |
|---|---|---|
| "Predictability ≠ profitability in crypto ML" | **NOT novel alone** | Bysik & Ślepaczuk 2026 (arXiv 2606.00060) say exactly this for single-asset hourly BTC; Sebastião & Godinho 2021 adjacent |
| Event-conditional REGIME propagation BTC→alts with matched disagreement-conditioned control + OOS gate + per-coin economics | **Novel per our searches** | Regime literature uses Markov-switching volatility states and spillover indices, not this construct |
| Regime-F1 vs directional-accuracy decomposition of the SAME signals | **Novel per our searches** | Not found stated anywhere |
| KAN applied to crypto | **NOT novel** | Shen & Wu 2025 (RIBAF); HiPPO-KAN preprints |
| KAN inside a heterogeneous regime ensemble + leak-free eval + persistence baseline | **Novel per our searches** | — |
| Goodhart effect in gated continuous learning (selection metric becomes unusable for calibration, measured) | **Novel per our searches** — strongest system claim | — |

Write the paper so the novel claims lead and the non-novel ones are cited,
never claimed. "Per our searches" means exactly that — a referee may know
prior art we missed, which is survivable if we claimed narrowly.

---

## 1. Remaining research before submission (the "more research" step)

Priority order:

- [x] **Replicate contradictions with the original papers' methods.** DONE
  (`research/original_methods.py` -> `logs/original_methods.json`, Table 9):
  NARDL on 2024-26 data finds significant asymmetry in only 1/9 coins — the
  contradiction is the ERA, not our method. Rolling DY with BTC ordered
  first/last brackets dominance at [1%, 55%] — Cholesky identification, not
  economics, decides the answer; our 28.4% sits inside the bounds. We
  contradict Koutmos (spillover dominance) and Demir/Šíla (crash asymmetry)
  using simpler machinery than theirs. Implement NARDL (Demir's method) for
  the asymmetry test and a rolling Diebold–Yilmaz spillover index (not just
  one full-sample VAR-FEVD) for dominance. If the contradictions survive the
  original methods, they are findings; if not, that is a finding about method
  sensitivity. *This is the highest-value remaining work — it is the first
  thing a referee will attack.*
- [x] **Multiple-testing correction.** DONE — Holm-Bonferroni: 10/18 raw
  Granger significances collapse to 2/18, in opposite directions, which
  STRENGTHENS the no-hourly-lead claim. Granger p-values are minima over lags
  1–6, uncorrected. Apply Holm–Bonferroni; state which results survive.
- [~] **Reference list: 20 verified** (was 14). Anchors added: Shin et al.
  2014 (NARDL, 2,355 cites), Fleming et al. 2001 (economic value, JF),
  Urquhart 2016 (efficiency, 1,158), Ji et al. 2019 (574), Bouri et al. 2021
  quantile connectedness (315), Fama 1970 (11,427). Note: Leitch & Tanner 1991
  could NOT be registry-verified and was excluded per protocol. Continue
  toward 40+ while drafting. Currently 14 verified entries. Expand around:
  regime-switching crypto models (found in the novelty search), economic
  value of forecasts (Leitch & Tanner tradition), crypto market efficiency,
  ensemble methods in finance, continuous learning / concept drift. Use the
  same verification protocol — every DOI fetched before it enters
  `bibliography.json`. No unverified citation, ever.
- [x] Propagation lag distribution (4h/12h/16h quartiles, 47.5% within 8h)
  and dominance-conditioned propagation DONE: lift +15.2pp when BTC gaining vs
  +10.8pp when losing, both p<0.001 — the first quantitative content behind
  the 'altseason' heuristic, closing the documented literature gap.
- [x] Second exchange DONE (`research/bulletproof.py`, Table 10): full 60/40
  OOS design replicated on Coinbase USD pairs — lift +0.165 (8/8 coins), and
  +0.151 under non-overlapping events. Also re-ran Binance pooled test with
  non-overlapping events: +0.142 at p=7e-6. The independence and
  one-exchange/USDT objections are both closed.

## 2. Assemble the manuscript

Source material (all in `research/`): `thesis_chapter.md` (structure, tables
1–8, discussion, limitations), `model_findings.md` (F1–F5, the second
strand), `bibliography.json` (14 verified refs + gap), `findings_summary.md`.

- [ ] Target format: **Finance Research Letters** short article (~2,500–4,500
  words) with an online appendix for robustness tables; or full-length for
  SSRN first (no limit).
- [ ] Order: Intro (lead with the co-movement/leadership distinction) →
  Literature (four strands + gap) → Data & Methodology (incl. the control-
  design inversion — keep it; it is a strength) → Results (Tables 1–8) →
  The ensemble strand (F1–F4 condensed) → Discussion (predictability ≠
  profitability; Goodhart finding) → Limitations → Conclusion.
- [ ] Reproducibility statement: repo link + the exact commands at the top of
  `thesis_chapter.md`. Consider archiving the repo state via Zenodo for a DOI.
- [ ] Convert with pandoc when ready:
  `pandoc manuscript.md -o manuscript.docx --citeproc` (FRL takes Word/LaTeX).

## 3. Before anyone submits anything

- [ ] **Supervisor meeting.** FYP-derived papers are normally co-authored with
  the supervisor; agree authorship order and contributions now, not after
  drafting. Universities often have rules about publishing FYP work — check
  yours.
- [ ] **AI-assistance disclosure.** This work was done with substantial AI
  assistance (Claude). Elsevier/Springer/MDPI all require disclosure in the
  manuscript (usually an acknowledgements or declarations section), and AI
  cannot be listed as an author. Draft sentence: *"The authors used Claude
  (Anthropic) for code development, data analysis, literature search and
  drafting assistance; all analyses, claims and citations were verified by
  the authors, who take full responsibility for the content."* You must
  actually do that verification pass yourself — especially the 14 citations
  (each has a DOI link in `bibliography.json`; open every one).
- [ ] **Data/ethics.** Binance public market data — no human subjects, no
  licence issues for research use. State data source and access dates.

## 4. Preprint (this week, once 3 is done)

**SSRN** (recommended first): ssrn.com → submit paper → FEN (Financial
Economics Network) → upload PDF, abstract, JEL codes (G14 market efficiency,
G17 forecasting, C58 financial econometrics, C45 neural networks). Free; takes
~1 week to be public. Gives a citable URL immediately.

**arXiv q-fin.ST** (alternative/additional): needs a one-time endorsement for
q-fin — your supervisor, or the auto-endorsement many university emails get.

A preprint establishes priority on the novel claims while journal review runs.
Both FRL and JRFM allow prior preprints.

## 5. Journal submission

Target 1: **Finance Research Letters** (Elsevier). Short format fits; half the
bibliography is FRL papers; no APC. Realistic timeline: desk decision ~2–4
weeks, review 2–5 months. Cover letter should state, in one paragraph each:
the co-movement/leadership distinction, the OOS-validated-but-unprofitable
propagation effect, and the metric-decomposition point.

Fallbacks in order: **Digital Finance** (Springer), **Journal of Risk and
Financial Management** (MDPI, ~CHF 2,000 APC, fast), **Financial Innovation**
(SpringerOpen).

**Predatory-journal check before ANY submission:** the journal must be in
DOAJ/Scopus; be suspicious of solicitation emails, guaranteed review times
under 4 weeks, or APCs with no indexing. When in doubt, ask the supervisor.

## 6. Review and revision

Expect major revisions — normal. The likely objections and where the answer
already lives: "simplified methods" → step 1 replication work; "one split" →
walk-forward table (Table 7); "parameter choice" → 15/15 specification grid;
"is it just persistence?" → matched control differences it out (viva notes in
`thesis_chapter.md`); "economic value?" → Table 8, and the honest answer is
no — that is the point of the paper.

---

## Current asset inventory

| Asset | Where | State |
|---|---|---|
| Verified bibliography (14) | `research/bibliography.json` | done, expand to 40+ |
| Six replication analyses | `research/btc_effects.py` → `logs/btc_research.json` | done |
| OOS validation gate | `research/validate_propagation.py` → `logs/propagation_validation.json` | done, passed |
| Robustness suite | `research/robustness.py` → `logs/robustness.json` | done |
| Economic significance | in robustness suite | done (negative — feature, not bug) |
| Thesis chapters + tables 1–8 + viva notes | `research/thesis_chapter.md` | done |
| System findings F1–F5 | `research/model_findings.md` | done |
| Live demonstration | quantaura.tech/research | deployed |
| Original-method replications (NARDL, rolling DY) | — | **TODO — the blocker** |
| Multiple-testing correction | — | TODO |
| 40+ references | — | TODO |
| Manuscript file | — | TODO after the above |
