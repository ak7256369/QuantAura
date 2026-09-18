# Model-System Findings — the second evidence strand for the paper

The cross-asset research (Phases A–E) is one strand. This documents the other:
what the QuantAura forecasting system itself contributes as research. Every
number is reproducible from this repository (`trainer.py`,
`_stage_eval_ensemble.py`, `diagnose_tradeability.py`, `autopilot.py`,
`logs/*.json`, and git history).

---

## F1. The target, not the model, determines attainable performance

The same four architectures (LSTM, XGBoost, Transformer, KAN), the same
features, the same leak-free pipeline, evaluated on two targets:

| Target | Best attainable macro-F1 | Chance floor |
|---|---|---|
| Raw 24h direction (vol-adaptive threshold) | 0.31–0.36 | 0.33 |
| 24h trend regime (vol-normalized EMA12−26, τ=0.20) | **0.72–0.78** | 0.33 |

Raw short-horizon direction was ~unpredictable for every architecture; the
regime target is genuinely learnable. The +40-point swing came entirely from
re-specifying *what is predicted*, not from model improvements. For the paper:
reported crypto "accuracy" is uninterpretable without the target definition.

**Honesty guardrail:** the regime target is ~71% persistence, so every result
is reported against the persistence baseline ("current regime continues"):
ensemble 0.8019 vs baseline 0.7106 → **+9.1pp genuine skill**.

## F2. Heterogeneous ensemble beats its best member

Held-out test, aligned rows (`_stage_eval_ensemble.py`):

| Model | Macro-F1 |
|---|---|
| LSTM (48×1h seq) | 0.7819 |
| KAN (19 features) | 0.7663 |
| XGBoost (~90 features) | 0.7534 |
| Transformer (96×4h seq) | 0.7215 |
| **Blended ensemble** | **0.8019** |

The blend exceeds the best single model by +2.0pp — the members' errors are
imperfectly correlated, which is the entire justification for running four
architectures. Novelty positioning (see PUBLICATION_README): KAN-on-crypto
alone is published (Shen & Wu 2025); KAN as a *member of a heterogeneous
regime-classification ensemble under leak-free evaluation* is not, per our
searches.

## F3. Metric decomposition: 81% regime-F1 ≈ 52% directional accuracy

`diagnose_tradeability.py`, 5,940 held-out predictions:

| Metric | Value |
|---|---|
| Regime macro-F1 | 80.99% |
| Directional accuracy of issued BUY/SELL | **52.26%** (50% = coin flip) |
| Mean BUY forward 24h return, after 0.30% costs | **−0.050%** |
| Mean SELL forward return if shorting, after costs | +0.136% (in-sample only) |

The two metrics measure different objects: F1 scores classification of a
*lagging, persistent* state; direction is what a trade needs. Papers reporting
only the first invite a ~28-point misreading. This decomposition — publish the
classification metric *and* the directional/economic value of the same
signals — is a core methodological contribution of the paper.

**Convergence with the cross-asset strand:** the regime-propagation effect
survived walk-forward, 15/15 specifications and all yearly subsamples, yet
nets −0.343% after costs. Two independent analyses, one conclusion:
**predictability and profitability are distinct properties.** Prior art
(Bysik & Ślepaczuk 2026) shows this for single-asset BTC hourly returns; ours
extends it to (a) cross-asset regime propagation and (b) the
classification-metric decomposition, neither of which they address.

## F4. Continuous learning under a quality gate — and a Goodhart effect

The system fine-tunes continuously (`autopilot.py`) with an accept-if-better
gate: a candidate deploys only if it does not regress on a *fixed* out-of-time
holdout. Findings worth reporting:

1. **A rolling evaluation window fabricates decay.** Scored on a rolling
   window, the LSTM appeared to decline (0.71 → 0.63) while the fixed-holdout
   score of the same weights was stable — the yardstick moved, not the model.
2. **Selection inflates the selected-on metric (Goodhart's law, measured).**
   The gate selects on the validation split; accepted fine-tunes therefore
   inflated val scores (KAN 0.756→0.865, Transformer 0.758→0.851) while
   holdout scores stood still. Ensemble weights calibrated on val then
   *inverted* against true quality — the best model (LSTM, holdout 0.782)
   received 0.2% weight; the worst (Transformer, 0.722) received 33.5%.
   Re-calibrating on the holdout restored sane weights. In a continuously
   trained system, **any metric used for acceptance becomes unusable for
   calibration.** We have not found this stated for financial ML ensembles.
3. **Gated continuous learning improved the model out-of-sample.** With the
   fixed-holdout gate in place, autopilot cycles took the LSTM 0.7066 → 0.7819
   (its best), and the propagation validation's OOS lift *exceeded* its
   in-sample estimate — the anti-overfitting signature.

## F5. Deployment honesty as a design requirement

The deployed system publishes, next to every signal: directional accuracy and
after-cost expectancy beside the headline F1 (the Signal Reality Check), the
persistence baseline beside the ensemble score, out-of-sample rates beside
their matched controls, an applicability flag on the propagation forecast
(meaningless outside 24h of a BTC flip), and two candidate features *with
their rejection evidence*. Refusing to serve untrained weights (503 rather
than noise) is enforced in the API. For the paper's discussion: honest
presentation is an engineering property that can be specified and tested, not
a disclaimer paragraph.

---

## Suggested placement in the manuscript

- F1 + F3 → Methodology (target definition) and Results (metric decomposition)
- F2 → Results (ensemble table)
- F4 → its own Results subsection ("Continuous learning under selection
  pressure") — this is the most defensibly novel system finding
- F5 → Discussion (deployment ethics)
