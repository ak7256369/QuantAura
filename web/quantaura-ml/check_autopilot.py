# check_autopilot.py — One-shot health/trend report for the 24/7 autopilot.
# Prints per-model F1 history, trend direction, and health flags.
# Exit code: 0 = healthy, 1 = attention needed (details in output).

import sys, os, time, json
from pathlib import Path
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from config import LOG_DIR
from utils.db import get_conn

MODELS = ["lstm", "transformer", "xgboost", "kan"]
STALL_HOURS = 4.0        # no new cycle rows for this long → autopilot stalled
FLOOR_F1 = 0.28          # sustained F1 below this → degradation flag
TREND_WINDOW = 6         # cycles used for trend slope
# The autopilot only runs while the machine is on. If the process is alive and
# simply mid-cycle or cooling down, a gap is expected — not a stall.
PROC_HINT = ("autopilot",)

problems = []
now = int(time.time())

with get_conn() as conn:
    rows = conn.execute(
        "SELECT model_name, timestamp, f1_macro FROM model_performance "
        "WHERE eval_scope = 'holdout' ORDER BY timestamp ASC").fetchall()

hist = {m: [(ts, f1) for name, ts, f1 in rows if name == m] for m in MODELS}

print("=" * 68)
print(f"  AUTOPILOT HEALTH REPORT — {time.strftime('%Y-%m-%d %H:%M:%S')}")
print("=" * 68)

latest_ts = max((h[-1][0] for h in hist.values() if h), default=0)
age_h = (now - latest_ts) / 3600 if latest_ts else float("inf")
print(f"Last cycle result: {age_h:.1f}h ago | total rows: {len(rows)}")
print("F1 values below are scored on the FIXED out-of-time holdout — comparable\n"
      "across cycles and models (rolling-window scores are in autopilot.log).")


def _autopilot_alive():
    """True if an autopilot process is currently running on this machine."""
    try:
        import subprocess
        out = subprocess.run(
            ["powershell", "-NoProfile", "-Command",
             "(Get-CimInstance Win32_Process -Filter \"Name='python.exe'\" | "
             "Where-Object {$_.CommandLine -match 'autopilot'} | "
             "Measure-Object).Count"],
            capture_output=True, text=True, timeout=25)
        return out.stdout.strip().isdigit() and int(out.stdout.strip()) > 0
    except Exception:
        return None  # unknown


if age_h > STALL_HOURS:
    alive = _autopilot_alive()
    if alive:
        print(f"\n[i] Gap of {age_h:.1f}h, but the autopilot process IS running "
              f"(mid-cycle, or the machine was asleep/off in between). Not a stall.")
    else:
        problems.append(
            f"STALE: no results for {age_h:.1f}h. Training runs on GitHub Actions "
            f"now (.github/workflows/train.yml) — check its recent runs rather "
            f"than looking for a local process.")

for m in MODELS:
    h = hist[m]
    if not h:
        problems.append(f"{m}: NO history rows at all")
        continue
    f1s = [f1 for _, f1 in h]
    recent = f1s[-TREND_WINDOW:]
    slope = float(np.polyfit(range(len(recent)), recent, 1)[0]) if len(recent) >= 3 else 0.0
    arrow = "UP" if slope > 0.002 else ("DOWN" if slope < -0.002 else "flat")
    line = (f"{m:12s} last={f1s[-1]:.4f}  best={max(f1s):.4f}  "
            f"n={len(f1s)}  trend({min(len(recent), TREND_WINDOW)})={arrow} {slope:+.4f}/cycle")
    print(line)
    if len(f1s) >= 3 and all(v < FLOOR_F1 for v in f1s[-3:]):
        problems.append(f"{m}: F1 below {FLOOR_F1} for 3+ consecutive cycles "
                        f"(last 3: {[round(v, 3) for v in f1s[-3:]]})")
    if len(recent) >= 4 and slope < -0.01:
        problems.append(f"{m}: steep downward trend {slope:+.4f}/cycle over last {len(recent)}")

# Recent errors in the autopilot log
log_path = os.path.join(LOG_DIR, "autopilot.log")
if os.path.exists(log_path):
    with open(log_path, encoding="utf-8", errors="replace") as f:
        tail = f.readlines()[-400:]
    errors = [ln.strip() for ln in tail if " ERROR" in ln or "FAILED" in ln]
    if errors:
        print(f"\nRecent log errors ({len(errors)}):")
        for e in errors[-5:]:
            print(f"  {e}")
        problems.append(f"{len(errors)} ERROR lines in recent autopilot.log")
else:
    problems.append("logs/autopilot.log missing — is autopilot running?")

# Current ensemble weights
wpath = os.path.join(os.path.dirname(LOG_DIR), "saved_models", "model_weights.json")
if os.path.exists(wpath):
    with open(wpath) as f:
        w = json.load(f)
    print(f"\nEnsemble weights: { {k: round(v, 3) for k, v in w.items()} }")
    dominant = max(w.values())
    if dominant > 0.85:
        problems.append(f"Ensemble collapsed onto one model (max weight {dominant:.2f})")

print("\n" + "=" * 68)
if problems:
    print(f"ATTENTION NEEDED — {len(problems)} issue(s):")
    for p in problems:
        print(f"  [!] {p}")
    sys.exit(1)
print("HEALTHY — autopilot running, no degradation flags.")
