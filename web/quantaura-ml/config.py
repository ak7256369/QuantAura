# config.py — ALL constants. Never hardcode values elsewhere.
import os
from dotenv import load_dotenv
load_dotenv()

# ── API KEYS ─────────────────────────────────────────────────────────────────
BINANCE_API_KEY    = os.getenv("BINANCE_API_KEY", "")
BINANCE_API_SECRET = os.getenv("BINANCE_API_SECRET", "")
FRED_API_KEY       = os.getenv("FRED_API_KEY", "")
# NOTE: Binance Futures uses the same key. alternative.me, yfinance, CoinGecko = keyless.

# ── SYMBOLS ───────────────────────────────────────────────────────────────────
SYMBOLS = [
    "BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT",
    "ADAUSDT", "AVAXUSDT", "DOTUSDT", "LINKUSDT", "DOGEUSDT",
]
FUTURES_SYMBOLS = [  # Subset that have Binance Futures pairs
    "BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT",
    "ADAUSDT", "AVAXUSDT", "DOTUSDT", "LINKUSDT", "DOGEUSDT",
]

# ── TIMEFRAMES ────────────────────────────────────────────────────────────────
TF_1H  = "1h"
TF_4H  = "4h"
# The 1h and 4h frames MUST span the same wall-clock window. Splits are
# fractional per frame (70/15/15 in _stage_collect), so equal spans put the
# split boundaries on the same dates and the val/test windows of the two
# frames overlap. When the 1h frame was held to 365 days "to bound
# sequence-array memory", its val window sat ~55-110 days ago against the 4h
# frame's ~110-220 — adjacent, never overlapping — so the LSTM had ZERO
# aligned val coverage: its ensemble weight could not be measured on the rows
# it actually votes in, and was silently derived from its own 1h grid instead
# (2026-08-08, see _stage_eval_ensemble). The memory bound is obsolete —
# training loads lstm_train_X with mmap_mode="r", and a 122k×48×37 float32
# tensor (~830 MB) is well within a 16 GB runner.
LOOKBACK_DAYS     = 365   # legacy default (serve-side display estimates only)
LOOKBACK_DAYS_1H  = 730
LOOKBACK_DAYS_4H  = 730
LOOKBACK_DAYS_1D  = 900   # daily candles for long-term trend features

# ── PER-MODEL SEQUENCE LENGTHS ────────────────────────────────────────────────
# LSTM on 1h: 48 candles = 2 days of short-term momentum.
LSTM_SEQ_LEN   = 48
# Transformer on 4h: 96 candles = 16 days of multi-week structure.
TRANS_SEQ_LEN  = 96
# Fetch buffers for inference: enough candles for indicator warm-up + sequence.
# 45d of 1h = 1080 candles: the trend_z_1h feature needs a 720-candle rolling
# vol window + EMA104 warm-up before the last 48 candles are sliced. A short
# buffer silently degrades these features into values never seen in training.
LSTM_FETCH_DAYS  = 45
# 400d of 4h at inference: XGBoost's long-window features (price_vs_200d,
# drawdown_peak over 1 year, 30d bb_width rank) need real history or they
# silently degrade into short-window statistics the model never trained on.
TRANS_FETCH_DAYS = 400

# ── LABEL GENERATION ─────────────────────────────────────────────────────────
# TREND-REGIME labels on 4h candles (broadcast to 1h).
#
# The old target — sign of the raw 24h forward return vs a volatility
# threshold — is dominated by candle noise and sits at the edge of
# unpredictability: the best leak-free macro-F1 any model reached was ~0.36
# (chance = 0.33). See logs/experiment_labels_v2.json for the head-to-head.
#
# The production target is now the MARKET REGIME 24h ahead:
#   score[s] = (EMA_fast(close)[s] - EMA_slow(close)[s]) / close[s]
#   z[s]     = score[s] / vol_24h[s]        (causal realized-vol normalizer,
#                                            same scale for BTC and DOGE)
#   BUY  (0) if z[t+6] >  LABEL_TREND_TAU   → uptrend regime in 24h
#   SELL (2) if z[t+6] < -LABEL_TREND_TAU   → downtrend regime in 24h
#   HOLD (1) otherwise                      → neutral / transitioning
#
# Regimes persist for days, so this target has real signal structure: the XGB
# probe scores 0.758 val macro-F1 vs 0.704 for the naive "regime continues"
# baseline — the models learn regime TRANSITIONS, not just persistence.
# Always report the persistence baseline next to model F1 (ensemble_eval.json).
LABEL_FORWARD_CANDLES = 6      # 6 × 4h = 24h ahead
LABEL_EMA_FAST        = 12     # 12 × 4h = 2 days
LABEL_EMA_SLOW        = 26     # 26 × 4h = ~4.3 days (MACD-style pair)
# tau sweep (XGB probe, val macro-F1 / class balance):
#   0.15 → .737 (34/30/36)   0.20 → .758 (29/39/32)  ← chosen
#   0.30 → .745 (22/54/24)   0.50 → .716 (12/76/13)
LABEL_TREND_TAU       = 0.20   # threshold on vol-normalized trend score
LABEL_VOL_MULT        = 0.45   # legacy direction-label threshold (experiments only)
LABEL_VOL_WINDOW      = 180    # 180 × 4h = 30 days for realized vol estimate
LABEL_THRESHOLD       = 0.025  # legacy fixed threshold (kept for UI copy only)
NUM_CLASSES           = 3      # 0=BUY, 1=HOLD, 2=SELL

# Confidence threshold for gating live signals (predictions below this are
# treated as HOLD regardless of model output — improves live precision).
CONFIDENCE_THRESHOLD  = 0.55

# ── TRAIN / VAL / TEST SPLIT ─────────────────────────────────────────────────
# Per-symbol temporal split. A purge gap of LABEL_FORWARD_CANDLES rows is
# dropped at each boundary so forward-looking labels can never straddle splits.
TRAIN_FRACTION = 0.70
VAL_FRACTION   = 0.15   # early stopping + ensemble weight calibration
TEST_FRACTION  = 0.15   # touched exactly once, for reported metrics

# ── FEATURE SETS ──────────────────────────────────────────────────────────────
# EVERY feature is scale-free (returns, ratios, bounded oscillators, distances
# relative to price). Raw prices/volumes NEVER enter a model: BTC≈$100k and
# DOGE≈$0.2 in one training set destroys neural nets. This was the single
# biggest cause of LSTM/Transformer/KAN F1 collapse.

# LSTM features: short-term technical signals on 1h candles.
LSTM_FEATURES = [
    "ret_1", "ret_3", "ret_6", "ret_12", "ret_24",
    "rsi_14",
    "stoch_rsi",
    "macd_norm", "macd_signal_norm", "macd_hist_norm",
    "bb_position", "bb_width",
    "ema_9_dist", "ema_21_dist", "ema_cross_1h",
    "ema_48_dist", "ema_104_dist", "trend_state_1h", "trend_z_1h",  # regime context
    "ret_48", "ret_96",
    "atr_pct",
    "obv_norm",
    "cmf",
    "mfi",
    "volume_ratio_10", "volume_zscore",
    "taker_buy_ratio_c",          # per-candle taker flow (full history, from klines)
    "trades_ratio",
    "high_low_range",
    "candle_body_ratio", "upper_wick_ratio", "lower_wick_ratio",
    "vwap_deviation",
    "btc_ret_1", "btc_ret_6",     # market leader context
    "rel_btc_ret_6",              # rotation vs BTC
]
N_LSTM_FEATURES = len(LSTM_FEATURES)  # = 37

# Transformer features: technical + macro + derivatives on 4h candles.
TRANSFORMER_FEATURES = [
    "ret_1", "ret_3", "ret_6", "ret_12", "ret_42",
    "rsi_14",
    "stoch_rsi",
    "macd_norm", "macd_signal_norm", "macd_hist_norm",
    "bb_position", "bb_width",
    "ema_12_dist", "ema_26_dist", "ema_cross", "trend_z",
    "atr_pct",
    "volume_ratio_20", "volume_zscore",
    "taker_buy_ratio_c",
    "trades_ratio",
    "ichimoku_conv_dist", "ichimoku_base_dist",
    "high_low_range", "candle_body_ratio",
    "funding_rate", "funding_rate_7d_mean",
    "fed_funds_rate", "cpi_yoy", "unemployment_rate",
    "dxy_return", "dxy_weekly_return",
    "sp500_return", "sp500_weekly_return",
    "fear_greed",                 # HISTORICAL series (alternative.me), not today's value
    "btc_ret_1", "btc_ret_6", "btc_ret_42",
    "rel_btc_ret_6",
]
N_TRANSFORMER_FEATURES = len(TRANSFORMER_FEATURES)  # = 39

# KAN features: compact set of regime + flow signals that all vary per candle
# and have FULL history (no 30-day-capped endpoints → no zero-filled columns).
KAN_FEATURES = [
    "funding_rate",
    "funding_rate_7d_mean",
    "taker_buy_ratio_c",
    "trades_ratio",
    "rsi_14",
    "macd_hist_norm",
    "bb_width", "bb_position",
    "ema_cross", "trend_z",
    "atr_pct",
    "fear_greed",
    "ret_1", "ret_3", "ret_6",
    "volume_ratio_20",
    "btc_ret_6",
    "rel_btc_ret_6",
    "sp500_return",
]
N_KAN_FEATURES = len(KAN_FEATURES)  # = 19

# XGBoost: ~90 engineered features from xgb_features.py (computed dynamically,
# PER SYMBOL — never across concatenated symbols).

# ── TRAINING CONFIG ───────────────────────────────────────────────────────────
BATCH_SIZE         = 64
EPOCHS_FULL        = 100
# 4, not 20: 20 full epochs over a single recent window overwrote the general
# solution every cycle, so the quality gate rejected 17 fine-tunes in a row and
# continuous learning did nothing. Short nudges + a history-anchored replay mix
# let genuine improvements through.
EPOCHS_FINE_TUNE   = 4
LEARNING_RATE      = 3e-4
LSTM_FINETUNE_LR   = 1e-4
FINETUNE_LR        = 5e-5   # fine-tune LR for torch models (Transformer/KAN)
REPLAY_BUFFER_SIZE = 4000
# 1.0 = one historical sample per new sample. At 0.30 the recent window
# dominated each fine-tune batch and the models drifted off the distribution
# they were evaluated on.
REPLAY_MIX_RATIO   = 1.0

# ── AUTOPILOT CONFIG ──────────────────────────────────────────────────────────
AUTOPILOT_INTERVAL_HOURS   = 4
CHECKPOINT_INTERVAL_HOURS  = 168
# How often to ship improved models. The push is a no-op unless the weights
# actually changed — the quality gate rejects most fine-tunes — so this is an
# upper bound on deploy frequency, not a schedule. 24h meant an improvement
# found just after a push sat on the workstation for a full day.
GIT_PUSH_INTERVAL_HOURS    = 6
# Regenerate ensemble_eval.json (true blended ensemble F1 on aligned rows,
# confusion matrices, feature importances). Per-model scores refresh every
# cycle, but these come from a separate aligned evaluation — without this they
# drift behind the models the site is actually serving.
ENSEMBLE_EVAL_INTERVAL_HOURS = 12

# CPU threads for training. 0 = use every logical core. The old value of 2 was
# chosen to keep a small VPS responsive; on a 13th-gen i5 with 32 GB it left
# most of the machine idle. Set an explicit number to cap it if you need the
# laptop responsive while it trains.
AUTOPILOT_CPU_THREADS      = 8
SENTIMENT_CACHE_TTL_HOURS  = 4
FEAR_GREED_CACHE_TTL_HOURS = 24
COINGECKO_CACHE_TTL_HOURS  = 6

# ── ENSEMBLE ──────────────────────────────────────────────────────────────────
INITIAL_WEIGHTS = {"lstm": 0.25, "xgboost": 0.25, "transformer": 0.25, "kan": 0.25}
WEIGHT_LOOKBACK_DAYS = 7

# ── MODEL ARCHITECTURES ───────────────────────────────────────────────────────
# These match the deployed (round-1) checkpoints — changing them invalidates
# saved_models/*. A smaller/more-regularized variant was fully trained and
# scored WORSE out-of-time; don't shrink again without re-running trainer.py.
# LSTM — Bidirectional + Bahdanau attention
LSTM_UNITS      = 96
# 0.45 + LR 1.5e-4 (was 0.35 @ 3e-4): on the trend-regime target the LSTM hit
# its best val loss by epoch 2 then overfit hard (train acc 85% vs val 62%).
# Stronger dropout + gentler LR trade a slower start for a higher val ceiling.
LSTM_DROPOUT    = 0.45
LSTM_LR         = 1.5e-4   # initial LR for full LSTM training (not fine-tune)
LSTM_ATTN_UNITS = 64

# Transformer — Pre-norm blocks with GELU, learned positional encoding
TRANS_D_MODEL  = 64
TRANS_NHEAD    = 4
TRANS_LAYERS   = 3
TRANS_DROPOUT  = 0.20
TRANS_FF_DIM   = 192

# XGBoost
XGB_MAX_DEPTH    = 5
XGB_N_ESTIMATORS = 800
XGB_LR           = 0.03
XGB_SUBSAMPLE    = 0.8
XGB_COLSAMPLE    = 0.7
XGB_MIN_CHILD_W  = 5
XGB_GAMMA        = 0.2
XGB_REG_LAMBDA   = 2.0
XGB_EARLY_STOP   = 50

# KAN — matches the deployed round-1 checkpoint
KAN_LAYERS = [N_KAN_FEATURES, 24, 12, NUM_CLASSES]  # [18, 24, 12, 3]
KAN_GRID   = 7
KAN_K      = 3

# ── PATHS ─────────────────────────────────────────────────────────────────────
BASE_DIR     = os.path.dirname(os.path.abspath(__file__))
DATA_DIR     = os.path.join(BASE_DIR, "data")
PREP_DIR     = os.path.join(DATA_DIR, "prep")
MODEL_DIR    = os.path.join(BASE_DIR, "saved_models")
DB_PATH      = os.path.join(DATA_DIR, "master.db")
WEIGHTS_PATH = os.path.join(MODEL_DIR, "model_weights.json")
BACKUP_DIR   = os.path.join(DATA_DIR, "backups")
LOG_DIR      = os.path.join(BASE_DIR, "logs")

# ── OPERATIONAL CONFIG ────────────────────────────────────────────────────────
TRAINING_LOCK_PATH         = os.path.join(MODEL_DIR, ".training_lock")
# 0 = no rest: cycles run back-to-back, continuously.
# Safe because the quality gate scores every candidate against the fixed
# holdout and refuses to deploy a regression — extra cycles can only improve a
# model or leave it unchanged, never degrade it.
AUTOPILOT_COOLDOWN_SECONDS = 0    # pause between training cycles (0 = continuous)
MODEL_RELOAD_INTERVAL      = 30     # serve.py checks for updated models every N seconds
