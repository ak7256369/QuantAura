"""
QuantAura ML — Inference API Server
Crash-proof design:
  - Models loaded lazily (not at module level)
  - Background thread hot-reloads models when files change on disk
  - Training lock awareness prevents reads during autopilot saves
  - Graceful 503 when models aren't ready (never crashes)
"""
from flask import Flask, request, jsonify
from flask_cors import CORS
import os, json, threading, time, joblib, logging, numpy as np

from config import (
    MODEL_DIR, SYMBOLS,
    LSTM_FEATURES, LSTM_SEQ_LEN, N_LSTM_FEATURES,
    TRANSFORMER_FEATURES, TRANS_SEQ_LEN, N_TRANSFORMER_FEATURES,
    KAN_FEATURES, N_KAN_FEATURES,
    LSTM_FETCH_DAYS, TRANS_FETCH_DAYS,
    TRAINING_LOCK_PATH, MODEL_RELOAD_INTERVAL,
    CONFIDENCE_THRESHOLD, LABEL_THRESHOLD, LABEL_FORWARD_CANDLES,
)


app = Flask(__name__)
CORS(app)
log = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(asctime)s [serve] %(levelname)s: %(message)s")

# ── Global model state (protected by lock) ────────────────────────────────────
_lock = threading.Lock()
_state = {
    "ready": False,
    "lstm": None, "transformer": None, "xgb": None, "kan": None,
    "sc_lstm": None, "sc_trans": None, "sc_xgb": None, "sc_kan": None,
    "xgb_names": None, "macro_df": None,
    "mtimes": {},          # track file modification times for hot-reload
    "load_error": None,    # last error message
}

# ── Probability calibrator (increment 2) ──────────────────────────────────────
# Identity (T=1) until _stage_calibrate.py writes an artifact to MODEL_DIR, so
# wiring it in now is behavior-preserving.
from calibration import Calibrator
_CALIBRATOR_PATH = os.path.join(MODEL_DIR, "calibrator.json")

def _load_calibrator():
    try:
        if os.path.exists(_CALIBRATOR_PATH):
            c = Calibrator.load(_CALIBRATOR_PATH)
            log.info(f"Loaded calibrator {c.version} (T={c.T})")
            return c
    except Exception as e:
        log.warning(f"Calibrator load failed ({e}); using identity T=1")
    return Calibrator(T=1.0)

_calibrator = _load_calibrator()

# Files that MUST exist before we attempt a load
_REQUIRED_FILES = [
    "lstm_model.keras",
    "transformer_model.pt",
    "xgb_model.pkl",
    "kan_model.pt",
    "scaler_lstm.pkl",
    "scaler_transformer.pkl",
    "scaler_xgb.pkl",
    "scaler_kan.pkl",
    "xgb_feature_names.pkl",
]


def _get_mtimes():
    """Get modification times for all required model files."""
    mtimes = {}
    for f in _REQUIRED_FILES:
        p = os.path.join(MODEL_DIR, f)
        if os.path.exists(p):
            mtimes[f] = os.path.getmtime(p)
    return mtimes


def _is_training_locked():
    """Check if autopilot is currently saving models."""
    if not os.path.exists(TRAINING_LOCK_PATH):
        return False
    # Stale lock detection: if lock is older than 5 minutes, ignore it
    try:
        age = time.time() - os.path.getmtime(TRAINING_LOCK_PATH)
        if age > 300:
            log.warning(f"Stale training lock ({age:.0f}s old), ignoring")
            try:
                os.remove(TRAINING_LOCK_PATH)
            except OSError:
                pass
            return False
    except OSError:
        return False
    return True


def _load_models():
    """
    Attempt to load all 4 models + scalers.
    Returns True on success, False on failure.
    Thread-safe: caller must NOT hold _lock (we acquire it internally).
    """
    import tensorflow as tf

    # Pre-flight checks (outside the lock to avoid blocking requests)
    if _is_training_locked():
        log.info("Training lock active, skipping model load")
        return False

    for f in _REQUIRED_FILES:
        if not os.path.exists(os.path.join(MODEL_DIR, f)):
            log.warning(f"Missing model file: {f}")
            _state["load_error"] = f"Missing: {f}"
            return False

    try:
        log.info("Loading models...")

        # LSTM: rebuild architecture from code + load weights
        # (avoids Lambda layer deserialization issue with Keras load_model)
        from models.model_lstm import load_lstm_model
        lstm = load_lstm_model()

        from models.model_transformer import TransformerClassifier
        trans = TransformerClassifier(); trans_ok = trans.load()

        from models.model_xgboost import load_xgb
        xgb = load_xgb()

        from models.model_kan import KANClassifier
        kan = KANClassifier(); kan_ok = kan.load()

        # REFUSE TO SERVE untrained weights. The loaders fall back to a randomly
        # initialised model when a checkpoint doesn't fit the architecture (e.g.
        # after a feature-set change deploys before the retrained models do).
        # Such a model still returns a confident-looking softmax, so without
        # this check the API serves pure noise as trading signals while
        # reporting itself healthy — which is exactly what happened on the
        # server when config expected 37/39 features and the checkpoints had
        # 31/38.
        untrained = [name for name, ok in (("lstm", getattr(lstm, "weights_loaded", True)),
                                          ("transformer", trans_ok),
                                          ("kan", kan_ok)) if not ok]
        if untrained:
            msg = (f"Untrained weights for: {', '.join(untrained)} — checkpoint "
                   f"does not match the current architecture. Deploy retrained "
                   f"models (or roll the code back); refusing to serve noise.")
            log.error(msg)
            with _lock:
                _state["ready"] = False
                _state["load_error"] = msg
                _state["untrained_models"] = untrained
            return False

        sc_lstm  = joblib.load(os.path.join(MODEL_DIR, "scaler_lstm.pkl"))
        sc_trans = joblib.load(os.path.join(MODEL_DIR, "scaler_transformer.pkl"))
        sc_xgb   = joblib.load(os.path.join(MODEL_DIR, "scaler_xgb.pkl"))
        sc_kan   = joblib.load(os.path.join(MODEL_DIR, "scaler_kan.pkl"))
        xgb_names = joblib.load(os.path.join(MODEL_DIR, "xgb_feature_names.pkl"))

        from data_sources.market_regime import build_full_macro_df
        macro_df = build_full_macro_df()

        mtimes = _get_mtimes()

        # Swap into global state atomically
        with _lock:
            _state["lstm"]      = lstm
            _state["transformer"] = trans
            _state["xgb"]       = xgb
            _state["kan"]       = kan
            _state["sc_lstm"]   = sc_lstm
            _state["sc_trans"]  = sc_trans
            _state["sc_xgb"]   = sc_xgb
            _state["sc_kan"]   = sc_kan
            _state["xgb_names"] = xgb_names
            _state["macro_df"]  = macro_df
            _state["mtimes"]    = mtimes
            _state["ready"]     = True
            _state["load_error"] = None
            _state["untrained_models"] = []

        log.info("All 4 models + 4 scalers loaded successfully.")
        return True

    except Exception as e:
        log.error(f"Model load failed: {e}", exc_info=True)
        _state["load_error"] = str(e)
        return False


def _reload_watcher():
    """
    Background thread: periodically checks if model files changed on disk.
    If they have (and no training lock), reloads models transparently.
    """
    while True:
        time.sleep(MODEL_RELOAD_INTERVAL)
        try:
            if _is_training_locked():
                continue

            current_mtimes = _get_mtimes()
            if len(current_mtimes) < len(_REQUIRED_FILES):
                # Not all files exist yet
                if not _state["ready"]:
                    # Try initial load
                    _load_models()
                continue

            if current_mtimes != _state["mtimes"]:
                log.info("Model files changed on disk, hot-reloading...")
                _load_models()

        except Exception as e:
            log.error(f"Reload watcher error: {e}", exc_info=True)


# ── Data builders ─────────────────────────────────────────────────────────────

# BTC market context (2 klines calls) — cached with a short TTL so bursts of
# /predict calls across symbols don't hammer Binance. Thread-safe.
_BTC_CTX_TTL = 300  # seconds
_btc_ctx_lock = threading.Lock()
_btc_ctx_cache = {"ts": 0.0, "ctx": None}


def _get_btc_context():
    """Fetch (or reuse cached) BTC 1h/4h OHLCV context for feature building."""
    from feature_engineering.pipeline import fetch_btc_context

    now = time.time()
    with _btc_ctx_lock:
        if _btc_ctx_cache["ctx"] is not None and (now - _btc_ctx_cache["ts"]) < _BTC_CTX_TTL:
            return _btc_ctx_cache["ctx"]

    ctx = fetch_btc_context(days_1h=LSTM_FETCH_DAYS, days_4h=TRANS_FETCH_DAYS)

    with _btc_ctx_lock:
        _btc_ctx_cache["ctx"] = ctx
        _btc_ctx_cache["ts"] = time.time()
    return ctx


def _build_inputs(symbol):
    """Builds 4 separate inputs for the 4 models via the shared feature pipeline
    (feature_engineering.pipeline) — identical feature construction to training."""
    from feature_engineering.pipeline import build_symbol_frames
    from feature_engineering.xgb_features import build_xgb_features

    with _lock:
        sc_lstm  = _state["sc_lstm"]
        sc_trans = _state["sc_trans"]
        sc_xgb   = _state["sc_xgb"]
        sc_kan   = _state["sc_kan"]
        macro_df = _state["macro_df"]

    btc_ctx = _get_btc_context()
    frames = build_symbol_frames(
        symbol, macro_df, btc_ctx,
        days_1h=LSTM_FETCH_DAYS, days_4h=TRANS_FETCH_DAYS,
        with_labels=False,
    )
    if frames is None:
        raise ValueError(f"Feature build failed for {symbol} (no data)")
    df_1h, df_4h = frames["df_1h"], frames["df_4h"]

    # NOTE: feature columns MUST be selected in config-list order — the scalers
    # were fit on exactly these columns in exactly this order by _stage_collect.

    # LSTM: (1, 48, 31) from 1h candles
    if len(df_1h) < LSTM_SEQ_LEN:
        raise ValueError(f"Need {LSTM_SEQ_LEN} 1h candles, got {len(df_1h)}")
    larr = sc_lstm.transform(
        np.nan_to_num(df_1h[LSTM_FEATURES].values[-LSTM_SEQ_LEN:], nan=0.0))
    X_lstm = larr.reshape(1, LSTM_SEQ_LEN, N_LSTM_FEATURES)

    # Transformer: (1, 96, 38) from 4h candles
    if len(df_4h) < TRANS_SEQ_LEN:
        raise ValueError(f"Need {TRANS_SEQ_LEN} 4h candles, got {len(df_4h)}")
    tarr = sc_trans.transform(
        np.nan_to_num(df_4h[TRANSFORMER_FEATURES].values[-TRANS_SEQ_LEN:], nan=0.0))
    X_trans = tarr.reshape(1, TRANS_SEQ_LEN, N_TRANSFORMER_FEATURES)

    # XGBoost: (1, ~90) engineered features, last 4h row
    xmat, _ = build_xgb_features(df_1h, df_4h)
    X_xgb = sc_xgb.transform(np.nan_to_num(xmat[-1:], nan=0.0))

    # KAN: (1, 18) from last 4h row
    karr = sc_kan.transform(
        np.nan_to_num(df_4h[KAN_FEATURES].values[-1:], nan=0.0))
    X_kan = karr.reshape(1, N_KAN_FEATURES)

    return X_lstm, X_trans, X_xgb, X_kan


# ── Routes ────────────────────────────────────────────────────────────────────

@app.route("/predict", methods=["GET"])
def predict():
    if not _state["ready"]:
        return jsonify({
            "error": "models_not_ready",
            "detail": _state.get("load_error", "Models are still loading, please retry shortly."),
        }), 503

    symbol = request.args.get("symbol", "BTCUSDT").upper()
    if symbol not in SYMBOLS:
        return jsonify({"error": f"Unsupported: {symbol}"}), 400

    try:
        X_lstm, X_trans, X_xgb, X_kan = _build_inputs(symbol)

        with _lock:
            lstm_model  = _state["lstm"]
            trans_model = _state["transformer"]
            xgb_model   = _state["xgb"]
            kan_model   = _state["kan"]

        from ensemble import blend_predictions
        from config import CONFIDENCE_THRESHOLD
        from models.confidence_filter import apply_confidence_gate

        proba_dict = {
            "lstm":        lstm_model.predict(X_lstm, verbose=0)[0].tolist(),
            "transformer": trans_model.predict_proba(X_trans)[0].tolist(),
            "xgboost":     xgb_model.predict_proba(X_xgb)[0].tolist(),
            "kan":         kan_model.predict_proba(X_kan)[0].tolist(),
        }
        result = blend_predictions(proba_dict)
        result["symbol"] = symbol

        # ── Calibration + full record (increment 2) ──────────────────────────
        # Temperature-scale the RAW blended vector, then gate on the CALIBRATED
        # max (frozen decision: gate_basis = calibrated_max). With no fitted
        # calibrator on disk the calibrator is identity (T=1), so the issued
        # signal and confidence are unchanged until _stage_calibrate.py produces
        # one. The full record (raw + calibrated vectors, per-model vectors,
        # versions) is emitted for the transparency log; persistence is later.
        classes = ["BUY", "HOLD", "SELL"]
        p_raw = list(result.get("probs") or
                     [result["breakdown"][c] / 100.0 for c in classes])
        q = _calibrator.transform([p_raw])[0]
        cal_top_idx  = int(np.argmax(q))
        cal_top_class = classes[cal_top_idx]
        cal_max = round(float(q[cal_top_idx]) * 100, 1)

        threshold_pct = CONFIDENCE_THRESHOLD * 100
        issued_class = apply_confidence_gate(cal_top_class, cal_max, threshold_pct)
        gated = issued_class != cal_top_class

        result.update({
            "signal":       issued_class,      # issued (post-gate) — product-facing
            "signal_raw":   result["signal"],  # raw argmax, pre-calibration/gate
            "gated":        gated,
            "gate_basis":   "calibrated_max",
            "gate_threshold_pct": threshold_pct,
            "confidence":   cal_max,           # issued confidence = calibrated top
            "raw_max":      result["confidence"],
            "cal_max":      cal_max,
            "cal_top_class": cal_top_class,
            "p_raw":        {c: round(float(p_raw[i]) * 100, 1) for i, c in enumerate(classes)},
            "p_cal":        {c: round(float(q[i]) * 100, 1) for i, c in enumerate(classes)},
            "per_model_raw": proba_dict,
            "calibrator_version": _calibrator.version,
            "label_contract": "regime_label_v1",
        })
        if gated:
            log.info(f"  Gate: {cal_top_class} @ {cal_max:.1f}% (cal) → HOLD (threshold={threshold_pct:.0f}%)")

        return jsonify(result)

    except Exception as e:
        log.error(f"Prediction error {symbol}: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@app.route("/backtest", methods=["GET"])
def backtest():
    if not _state["ready"]:
        return jsonify({"error": "models_not_ready"}), 503

    symbol = request.args.get("symbol", "BTCUSDT").upper()
    days = int(request.args.get("days", 30))
    
    if symbol not in SYMBOLS:
        return jsonify({"error": f"Unsupported: {symbol}"}), 400

    try:
        from backtest import run_backtest
        with _lock:
            state_copy = {
                "lstm": _state["lstm"],
                "transformer": _state["transformer"],
                "xgb": _state["xgb"],
                "kan": _state["kan"],
                "sc_lstm": _state["sc_lstm"],
                "sc_trans": _state["sc_trans"],
                "sc_xgb": _state["sc_xgb"],
                "sc_kan": _state["sc_kan"]
            }
        
        result = run_backtest(symbol, days, state_copy)
        return jsonify(result)
    except Exception as e:
        log.error(f"Backtest error {symbol}: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500

@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "status": "ok" if _state["ready"] else "degraded",
        "models_loaded": _state["ready"],
        "models": 4 if _state["ready"] else 0,
        "load_error": _state.get("load_error"),
        "untrained_models": _state.get("untrained_models") or [],
    })


@app.route("/weights", methods=["GET"])
def weights():
    from ensemble import load_weights
    return jsonify(load_weights())


@app.route("/stats", methods=["GET"])
def stats():
    """Returns real model performance metrics from the database."""
    from ensemble import load_weights
    from utils.db import get_conn
    from config import (
        SYMBOLS, N_LSTM_FEATURES, N_TRANSFORMER_FEATURES, N_KAN_FEATURES,
        LSTM_SEQ_LEN, TRANS_SEQ_LEN, XGB_N_ESTIMATORS,
        EPOCHS_FULL, EPOCHS_FINE_TUNE, BATCH_SIZE, LEARNING_RATE,
        WEIGHT_LOOKBACK_DAYS, LOOKBACK_DAYS,
        CONFIDENCE_THRESHOLD, LABEL_TREND_TAU, LABEL_EMA_FAST, LABEL_EMA_SLOW,
        LABEL_FORWARD_CANDLES, LOG_DIR,
    )

    import time as _time

    try:
        with get_conn() as conn:
            # LATEST holdout score per model — not an average. The reported F1
            # must describe the weights currently loaded; averaging over a
            # lookback window blends in scores of models that no longer exist
            # (a 7-day mean still contained the pre-improvement LSTM at 0.6953).
            # Rolling-window rows are excluded, and 'ensemble' is not a servable
            # model, so it must not appear in the per-model list.
            rows = conn.execute(
                "SELECT model_name, f1_macro, MAX(timestamp), COUNT(*) "
                "FROM model_performance WHERE eval_scope = 'holdout' "
                "AND model_name IN ('lstm','transformer','xgboost','kan') "
                "GROUP BY model_name"
            ).fetchall()

            # Live candle counts from autopilot (updated each cycle)
            candle_row = conn.execute(
                "SELECT count_1h, count_4h FROM candle_counts WHERE id=1"
            ).fetchone()

            # Total training cycles (total rows / 4 models)
            total_rows = conn.execute("SELECT COUNT(*) FROM model_performance").fetchone()[0]

        # Use live candle counts if available, else estimate from config
        if candle_row:
            count_1h = candle_row[0]
            count_4h = candle_row[1]
        else:
            count_1h = len(SYMBOLS) * LOOKBACK_DAYS * 24
            count_4h = len(SYMBOLS) * LOOKBACK_DAYS * 6

        models = {}
        for r in rows:
            models[r[0]] = {
                "f1_macro": round(r[1], 4) if r[1] else 0,
                "last_trained": r[2],
                "cycles": r[3],
            }

        # Fallback: saved_models/model_metrics.json, written by the autopilot and
        # shipped alongside the weights. A serving host that never trains has no
        # data/prep to score against and no holdout rows of its own, so without
        # this every model reports 0%.
        metrics_file = None
        if not models:
            try:
                mpath = os.path.join(MODEL_DIR, "model_metrics.json")
                if os.path.exists(mpath):
                    with open(mpath, encoding="utf-8") as fh:
                        metrics_file = json.load(fh)
                    for name, m in (metrics_file.get("models") or {}).items():
                        models[name] = {
                            "f1_macro": m.get("f1_macro", 0),
                            "last_trained": m.get("updated_at"),
                            "cycles": 0,
                        }
            except Exception as e:
                log.warning(f"model_metrics.json unreadable: {e}")

        weights_data = load_weights()

        # Held-out test evaluation artifacts (real confusion matrices, feature
        # importances, persistence baseline) written by _stage_eval_ensemble.py
        eval_report = None
        try:
            eval_path = os.path.join(LOG_DIR, "ensemble_eval.json")
            if os.path.exists(eval_path):
                with open(eval_path) as fh:
                    eval_report = json.load(fh)
        except Exception:
            eval_report = None

        # Prefer the MEASURED ensemble: blended probabilities scored on the test
        # split. A weighted average of individual F1s is not the ensemble's F1 —
        # it cannot capture models correcting each other, and understated the
        # real figure (0.7534 vs the measured 0.7593).
        ensemble_f1 = 0
        measured = ((eval_report or {}).get("test") or {}).get("ensemble")
        if measured:
            ensemble_f1 = round(float(measured), 4)
        elif models:
            for name, w in weights_data.items():
                if name in models:
                    ensemble_f1 += w * models[name]["f1_macro"]
            ensemble_f1 = round(ensemble_f1, 4)
        if not ensemble_f1 and metrics_file:
            ensemble_f1 = metrics_file.get("ensemble_f1", 0)

        # Tradeability: what the signals are worth AFTER costs, and how often
        # they get direction right. Regime F1 alone reads as a win rate and is
        # not one — it must never be shown without these.
        tradeability = None
        try:
            tpath = os.path.join(LOG_DIR, "tradeability.json")
            if os.path.exists(tpath):
                with open(tpath, encoding="utf-8") as fh:
                    tradeability = json.load(fh)
        except Exception as e:
            log.warning(f"tradeability.json unreadable: {e}")

        # Deployment fingerprint: newest mtime across the loaded model files.
        # The frontend polls this to notice that new weights went live and to
        # refresh the displayed metrics without a manual reload.
        try:
            mt = _get_mtimes()
            models_updated_at = int(max(mt.values())) if mt else None
        except Exception:
            models_updated_at = None

        return jsonify({
            "models": models,
            "ensemble_f1": ensemble_f1,
            "evaluation": eval_report,
            "tradeability": tradeability,
            "models_updated_at": models_updated_at,
            "total_candles_1h": count_1h,
            "total_candles_4h": count_4h,
            "total_training_cycles": total_rows // 4 if total_rows > 0 else 0,
            "symbols_count": len(SYMBOLS),
            "symbols": SYMBOLS,
            "model_count": 4,
            "weights": weights_data,
            "config": {
                "lstm_features": N_LSTM_FEATURES,
                "transformer_features": N_TRANSFORMER_FEATURES,
                "kan_features": N_KAN_FEATURES,
                "lstm_seq_len": LSTM_SEQ_LEN,
                "transformer_seq_len": TRANS_SEQ_LEN,
                "xgb_estimators": XGB_N_ESTIMATORS,
                "epochs_full": EPOCHS_FULL,
                "epochs_fine_tune": EPOCHS_FINE_TUNE,
                "batch_size": BATCH_SIZE,
                "learning_rate": LEARNING_RATE,
                "lookback_days": LOOKBACK_DAYS,
                "confidence_threshold": CONFIDENCE_THRESHOLD,
                "label_scheme": "trend_regime",
                "label_trend_tau": LABEL_TREND_TAU,
                "label_ema_fast": LABEL_EMA_FAST,
                "label_ema_slow": LABEL_EMA_SLOW,
                "label_horizon_candles": LABEL_FORWARD_CANDLES,
                "label_horizon_hours": LABEL_FORWARD_CANDLES * 4,
            },
        })


    except Exception as e:
        log.error(f"Stats error: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@app.route("/research", methods=["GET"])
def research():
    """BTC->altcoin research: verified literature, our replication of it, and
    the predictions that passed out-of-sample validation.

    Static artifacts produced by research/*.py — no model inference, so this
    stays fast and works even while models are reloading."""
    # LOG_DIR is not a module-level import in this file — stats() pulls it in
    # locally too, so keep the same pattern rather than reordering imports.
    from config import BASE_DIR, LOG_DIR
    out = {}
    sources = {
        "bibliography": os.path.join(BASE_DIR, "research", "bibliography.json"),
        "measurements": os.path.join(LOG_DIR, "btc_research.json"),
        "validation": os.path.join(LOG_DIR, "propagation_validation.json"),
    }
    for key, path in sources.items():
        try:
            if os.path.exists(path):
                with open(path, encoding="utf-8") as fh:
                    out[key] = json.load(fh)
            else:
                out[key] = None
        except Exception as e:
            log.warning(f"/research: {key} unreadable: {e}")
            out[key] = None

    if out.get("measurements") is None:
        return jsonify({"error": "research_not_generated",
                        "detail": "Run research/btc_effects.py then "
                                  "research/build_predictions.py."}), 503

    # Lift the predictions block to the top level — it is what the page leads
    # with, and nesting it two deep made every consumer dig for it.
    out["predictions"] = (out["measurements"] or {}).get("predictions")
    return jsonify(out)


@app.route("/formula", methods=["GET"])
def formula():
    """Returns symbolic formula KAN discovered for macro → price relationship."""
    if not _state["ready"] or _state["kan"] is None:
        return jsonify({"error": "KAN model not loaded"}), 503
    with _lock:
        kan = _state["kan"]
    return jsonify({"formula": kan.get_formula()})


@app.route("/reload", methods=["POST"])
def reload():
    """Manual trigger to reload models."""
    success = _load_models()
    return jsonify({"reloaded": success, "ready": _state["ready"]})


# ── Startup ───────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    log.info("ML-API starting up...")

    # Apply pending schema migrations before serving. /stats filters on
    # model_performance.eval_scope, which does not exist in databases created
    # before that column was added — without this the endpoint 500s on an
    # existing deployment.
    try:
        from utils.db import init_db
        init_db()
    except Exception as e:
        log.warning(f"DB init/migration failed: {e}")

    # Attempt initial model load (non-blocking — server starts regardless)
    _load_models()

    # Start background reload watcher
    watcher = threading.Thread(target=_reload_watcher, daemon=True)
    watcher.start()
    log.info(f"Model reload watcher started (interval={MODEL_RELOAD_INTERVAL}s)")

    # Waitress when available: Flask's built-in server is single-threaded
    # development tooling and logs a warning against production use on every
    # start. Fallback keeps the API alive on hosts where waitress isn't
    # installed yet (the deploy does not run pip).
    try:
        from waitress import serve as _waitress_serve
        log.info("Serving via waitress (production WSGI), 8 threads")
        _waitress_serve(app, host="0.0.0.0", port=5051, threads=8)
    except ImportError:
        log.warning("waitress not installed - falling back to Flask dev server "
                    "(pip install waitress to remove this warning)")
        app.run(host="0.0.0.0", port=5051, debug=False)
