# trainer.py — Run ONCE for initial training. Then deploy autopilot.py.
#
# Architecture: thin orchestrator that spawns SEPARATE PROCESSES for each phase.
# The orchestrator itself never loads large arrays — all heavy work happens in
# child processes that fully release memory on exit.
#
# Resume-safe: re-running skips completed stages automatically.
#   - Data collection is skipped if prep/*.npy files exist
#   - Model training is skipped if the model file already exists
#
# To force a full retrain, delete saved_models/ and data/prep/ first.

import os, sys, subprocess, logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
log = logging.getLogger(__name__)

BASE_DIR  = os.path.dirname(os.path.abspath(__file__))
DATA_DIR  = os.path.join(BASE_DIR, "data")
PREP_DIR  = os.path.join(DATA_DIR, "prep")
MODEL_DIR = os.path.join(BASE_DIR, "saved_models")

PYTHON = sys.executable

# ── Model definitions: (name, saved_file, x_file, y_file) ───────────────────
MODELS = [
    ("LSTM",        "lstm_model.keras",      "lstm_train_X.npy",  "lstm_train_y.npy"),
    ("Transformer", "transformer_model.pt",  "trans_train_X.npy", "trans_train_y.npy"),
    ("XGBoost",     "xgb_model.pkl",         "xgb_train_X.npy",   "xgb_train_y.npy"),
    ("KAN",         "kan_model.pt",          "kan_train_X.npy",   "kan_train_y.npy"),
]


def run_stage(script_name, description, timeout=7200):
    """Run a Python script as a subprocess, streaming output to console."""
    script_path = os.path.join(BASE_DIR, script_name)
    log.info(f"{'='*60}")
    log.info(f"  {description}")
    log.info(f"{'='*60}")
    result = subprocess.run([PYTHON, script_path], cwd=BASE_DIR, timeout=timeout)
    if result.returncode != 0:
        if result.returncode == -9:
            log.error(f"KILLED by OS (out of memory). Free RAM and re-run.")
        else:
            log.error(f"FAILED with exit code {result.returncode}")
        return False
    return True


def main():
    os.makedirs(MODEL_DIR, exist_ok=True)
    os.makedirs(DATA_DIR, exist_ok=True)
    os.makedirs(PREP_DIR, exist_ok=True)

    # ── Phase 1: Data collection ────────────────────────────────────────────
    if os.path.exists(os.path.join(PREP_DIR, "lstm_train_X.npy")):
        log.info("[SKIP] Data collection — prep files already exist")
    else:
        if not run_stage("_stage_collect.py", "PHASE 1: Collecting & preparing training data"):
            sys.exit(1)

    # ── Phase 2: Train each model ───────────────────────────────────────────
    for model_name, model_file, x_file, y_file in MODELS:
        model_path = os.path.join(MODEL_DIR, model_file)
        if os.path.exists(model_path):
            log.info(f"[SKIP] {model_name} — {model_file} already exists")
            continue

        script = f"_stage_train_{model_name.lower()}.py"
        if not run_stage(script, f"PHASE 2: Training {model_name}"):
            log.error(f"Aborting — {model_name} failed. Fix the error and re-run.")
            sys.exit(1)

    # ── Phase 3: Ensemble calibration + evaluation ──────────────────────────
    run_stage("_stage_eval_ensemble.py", "PHASE 3: Ensemble calibration + test evaluation")

    log.info(f"\n{'='*60}")
    log.info(f"  ALL 4 MODELS TRAINED + ENSEMBLE EVALUATED")
    log.info(f"{'='*60}")
    log.info(f"Models saved in: {MODEL_DIR}/")
    log.info("You can now start autopilot: pm2 start autopilot-trainer")


if __name__ == "__main__":
    main()
