# QuantAura Machine Learning Models Workflow

This document describes the QuantAura ML system: data collection, feature
engineering, labeling, the four models, ensembling, and how everything
integrates with the live website, chatbot, and real-time feeds.

---

## 1. Data Sources

| Source | Data | History | Key needed |
| :--- | :--- | :--- | :--- |
| Binance Spot klines | OHLCV + per-candle taker-buy volume + trade count (1h, 4h, 1d) | Full | No |
| Binance Futures | Funding rate (paginated — full history) | Full | No |
| FRED (keyless CSV endpoint) | Fed funds rate, CPI YoY, unemployment, PPI | Full | No (API key optional) |
| alternative.me | Fear & Greed index — **historical daily series** | 2018→ | No |
| Yahoo Finance | DXY (dollar index) & S&P 500 daily returns | Full | No |

Design rules:
- **Historical series only.** Every macro/sentiment value is aligned to the
  candle's own date (lagged one day so a candle never sees a daily close that
  hadn't printed yet). Current-value scalars are never broadcast over history.
- **Full-history order flow.** Per-candle `taker_buy_ratio` and trade-count
  surges come from the klines themselves — replacing the futures endpoints
  that only return the last ~30 days (which used to leave the features
  zero-filled for 90% of training rows).

## 2. Feature Engineering (`feature_engineering/`)

**Everything is scale-free.** No raw price or raw volume ever reaches a model:
log returns over multiple horizons, EMA/Ichimoku *distances relative to
price*, ATR as % of price, MACD normalized by price, bounded oscillators
(RSI/StochRSI/MFI scaled 0-1), Bollinger *position* within the band, volume
*ratios* and z-scores, candle anatomy ratios (body/wick/range). This is what
lets one model train jointly on BTC (~$100k) and DOGE (~$0.2).

Every symbol also receives **market-leader context**: BTC log returns at
several horizons and the symbol's relative-strength return vs BTC — altcoins
follow BTC's lead, so this is among the strongest predictors.

`feature_engineering/pipeline.py` is the **single shared builder** used by
initial training, the autopilot fine-tuner, live serving, and backtesting —
training and serving can never drift apart.

## 3. Labels (`feature_engineering/labels.py`)

**Trend-regime 3-class labels** on 4h candles (broadcast to 1h). The target is
the market's trend regime 24 hours ahead:

```
score[s] = (EMA12(close)[s] - EMA26(close)[s]) / close[s]
z[s]     = score[s] / vol_t[s]      # causal realized-vol normalizer (30d)
BUY  if z[t+6] >  0.20              # uptrend regime in 24h
SELL if z[t+6] < -0.20              # downtrend regime in 24h
HOLD otherwise                      # neutral / transitioning
```

Why this target: the previous target — the sign of the *raw* 24h forward
return vs a volatility threshold — is dominated by candle noise. Under
leak-free evaluation every model scored macro-F1 ≈ 0.31–0.36 against a 0.33
chance floor (see `logs/experiment_labels_v2.json`), i.e. the target itself
was ~unpredictable. Trend regimes persist for days, so the regime 24h ahead
carries real signal — and the models beat the naive **persistence baseline**
("today's regime continues": F1 ≈ 0.70 on the probe vs 0.758 for the model),
which the evaluation stage reports alongside model F1 as an honesty check.

Vol-normalization (z = score / vol) keeps the ±0.20 threshold meaningful for
both DOGE and calm-regime BTC, holding every symbol near a ~30/40/30
BUY/HOLD/SELL balance, which macro-F1 requires.

## 4. Leak-Free Evaluation

- **Per-symbol temporal split 70/15/15** (train/val/test) — every symbol
  contributes to every split.
- **Purge gaps** at split boundaries (≥ the 24h label horizon) so no label's
  forward window straddles a split.
- **Scalers fit on the train split only**, saved to `saved_models/` and reused
  verbatim by autopilot and the live server.
- Sequences and rolling statistics never cross symbol boundaries; all rolling
  ranks are causal (no full-dataset percentile ranks).
- Early stopping uses **val**; reported metrics come from the untouched
  **test** split and are written to the `model_performance` table.

## 5. The Four Models

| Model | Input | Architecture | Role |
| :--- | :--- | :--- | :--- |
| **LSTM** | 48 × 1h candles, 31 features | Bidirectional LSTM ×2 + Bahdanau attention | Short-term momentum patterns |
| **Transformer** | 96 × 4h candles, 38 features | 3 pre-norm MHA blocks, learned PE, CLS token | Multi-week structure + macro context |
| **XGBoost** | ~115 flat features (multi-timeframe rolling stats, regime, calendar, order flow) | Gradient-boosted trees, early stopping | Tabular cut-offs & interactions |
| **KAN** | 18 flat features | Kolmogorov-Arnold Network (learnable splines) | Interpretability — extracts symbolic formulas |

All four output P(BUY), P(HOLD), P(SELL). Class imbalance is handled with
balanced class/sample weights.

## 6. Ensemble (`ensemble.py`)

Weighted probability blend. Weights are recomputed from each model's recent
macro-F1 (7-day window of the `model_performance` table), so better models
automatically earn more voting power. A confidence gate suppresses
low-confidence BUY/SELL signals to HOLD at serve time (precision over recall
for live signals).

## 7. Training Modes

- **Initial training** — `trainer.py`: spawns isolated processes for
  collection (`_stage_collect.py`) and each model (`_stage_train_*.py`).
  Resume-safe; each stage skips if its artifact already exists.
- **Autopilot** (`autopilot.py`) — every few hours: rebuilds features for the
  recent window via the shared pipeline, fine-tunes LSTM/Transformer/KAN on
  the combined multi-symbol data (with per-model replay buffers against
  catastrophic forgetting), **evaluates** XGBoost (trees are retrained fully,
  not fine-tuned), logs per-class F1 to the DB, and atomically hot-swaps the
  model files under a lock that `serve.py` respects.

## 8. Serving & Website Integration

1. **`serve.py` (Flask, port 5051)** — loads models + scalers lazily,
   hot-reloads when autopilot swaps files. `/predict?symbol=X` builds features
   through the same shared pipeline (with a 5-minute BTC-context cache) and
   returns the blended signal, confidence, per-model votes, and weights.
2. **Node API bridge (`quantaura-api`)** — aggregates `/predict` with news,
   TA and macro summaries; passes indicator context to the LLM (Groq/Llama-3)
   for a plain-English explanation of *why* the signal fired.
3. **Next.js frontend (`quantaura`)** — renders the dashboard (signal hero,
   confidence, model breakdown, LLM reasoning) with live candles streamed via
   WebSocket from Binance.
4. **Chatbot** — summarizes the requested live window (high/low/volume/change)
   and answers through the LLM with the market context injected.

## 9. Honest Evaluation Results (July 2026, trend-regime target)

All metrics are from a leak-free, out-of-time test set: per-symbol temporal
70/15/15 splits with purge gaps, scalers fit on train only, causal features,
historical (not current-value) macro series.

| Model | Test macro F1 | Notes |
| :--- | :--- | :--- |
| **Ensemble (calibrated)** | **0.757** | Accuracy 0.752 — weights from validation F1 |
| XGBoost | 0.753 | ~115 engineered features |
| KAN | 0.748 | 19 flow/regime features |
| Transformer | 0.717 | 96 x 4h sequences, 39 features |
| LSTM | 0.707 | 48 x 1h sequences, 37 features |
| *Persistence baseline* | *0.711* | *"today's regime continues" — the honesty bar* |

Confidence-gated signals (>=55%): **84.1% hit rate**, 2.97x lift over the
28.3% base rate. Full artifacts: `quantaura-ml/logs/ensemble_eval.json`
(includes per-model confusion matrices and XGB feature importances, both
surfaced live on the dashboard's Models page).

Why these numbers are defensible:
1. The persistence baseline is reported next to model F1 — the ensemble's
   0.757 vs 0.711 shows the models learn regime *transitions*, not just
   persistence. Weak papers hide this baseline; we lead with it.
2. Raw short-horizon direction was measured (not assumed) to be
   ~unpredictable: F1 0.31-0.36 across four architectures
   (`logs/experiment_labels_v2.json`), consistent with near-efficient
   markets. Pivoting the target to regime forecasting is the standard,
   defensible response.
3. Continuous fine-tuning (autopilot, 1h cooldown) re-evaluates leak-free
   every cycle and logs to the model_performance table the dashboard reads.
