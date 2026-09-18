"""
_stage_calibrate.py — fit the temperature calibrator (increment 3).

Reads resolved prediction records (the full record serve.py now emits, once the
expanded logger persists them — increment 4), fits a single temperature T on a
chronological calibration split by NLL, evaluates on a later untouched split,
and writes MODEL_DIR/calibrator.json for serve.py to load.

Honesty rules (from the calibration & grading methods brief):
  - Fit on the RAW blended vector against the resolved REGIME label
    (regime_actual), NOT the issued HOLD action, and strictly BEFORE the report
    split in time (no look-ahead).
  - Report unhalved multiclass Brier (range 0..2) and mean NLL, before (T=1) and
    after, on the untouched report split.
  - No universal minimum sample size: if a split is tiny, refuse to ship and say
    so, rather than fitting T on a handful of rows.

Usage:
  python _stage_calibrate.py --self-test           # synthetic data, no log needed
  python _stage_calibrate.py --log <path.jsonl>    # fit on real resolved records
  python _stage_calibrate.py --log <path> --dry-run  # fit + report, write nothing
"""
from __future__ import annotations
import argparse
import json
import os
import numpy as np

from calibration import (Calibrator, fit_temperature, apply_temperature,
                         multiclass_brier, _nll, DEFAULT_EPS)

CLASS_INDEX = {"BUY": 0, "HOLD": 1, "SELL": 2}
MIN_FIT_ROWS = 200      # governance floor; below this, calibration is not shipped
MIN_REPORT_ROWS = 100


def _vec(p_raw: dict) -> np.ndarray:
    """Coerce a {BUY,HOLD,SELL} record (probabilities or percentages) to a
    normalized length-3 array indexed BUY,HOLD,SELL."""
    v = np.array([float(p_raw[c]) for c in ("BUY", "HOLD", "SELL")], dtype=float)
    if v.sum() > 1.5:          # stored as percentages
        v = v / 100.0
    s = v.sum()
    return v / s if s > 0 else np.array([1 / 3, 1 / 3, 1 / 3])


def load_records(path: str):
    """Yield (timestamp, p_raw[3], y_index) for resolved rows with a regime label."""
    rows = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                r = json.loads(line)
            except Exception:
                continue
            actual = r.get("regime_actual")
            p_raw = r.get("p_raw")
            if actual not in CLASS_INDEX or not isinstance(p_raw, dict):
                continue        # unresolved / pre-expansion row — skip, never impute
            ts = r.get("resolves_at") or r.get("forecast_cutoff") or r.get("made_at") or ""
            rows.append((str(ts), _vec(p_raw), CLASS_INDEX[actual]))
    rows.sort(key=lambda t: t[0])   # chronological
    return rows


def calibrate(rows, fit_frac: float = 0.6, eps: float = DEFAULT_EPS):
    """Fit T on the earlier `fit_frac`, evaluate on the later remainder."""
    n = len(rows)
    if n < MIN_FIT_ROWS + MIN_REPORT_ROWS:
        raise ValueError(
            f"Only {n} resolved rows with vectors; need "
            f">= {MIN_FIT_ROWS + MIN_REPORT_ROWS}. Calibration NOT shipped — "
            f"accumulate more resolved predictions first.")
    k = int(n * fit_frac)
    P_fit = np.array([r[1] for r in rows[:k]])
    y_fit = np.array([r[2] for r in rows[:k]])
    P_rep = np.array([r[1] for r in rows[k:]])
    y_rep = np.array([r[2] for r in rows[k:]])

    T = fit_temperature(P_fit, y_fit, eps=eps)
    Q_rep = apply_temperature(P_rep, T, eps)

    report = {
        "T": T,
        "n_fit": int(k),
        "n_report": int(n - k),
        "nll_before": round(_nll(P_rep, y_rep, 1.0, eps), 4),
        "nll_after":  round(_nll(P_rep, y_rep, T, eps), 4),
        "brier_before": round(multiclass_brier(P_rep, y_rep), 4),
        "brier_after":  round(multiclass_brier(Q_rep, y_rep), 4),
        "argmax_preserved": bool((P_rep.argmax(1) == Q_rep.argmax(1)).all()),
    }
    return T, report


def _make_synthetic(n=1500, seed=0):
    """Overconfident synthetic resolved records with timestamps (for --self-test)."""
    rng = np.random.default_rng(seed)
    classes = ["BUY", "HOLD", "SELL"]
    preds = rng.integers(0, 3, size=n)
    logits = np.zeros((n, 3)); logits[np.arange(n), preds] = 4.0
    P = np.exp(logits) / np.exp(logits).sum(1, keepdims=True)
    match = rng.random(n) < 0.70
    y = preds.copy()
    y[~match] = (preds[~match] + rng.integers(1, 3, size=(~match).sum())) % 3
    rows = []
    for i in range(n):
        rows.append((f"2026-09-{1 + i % 28:02d}T{i % 24:02d}:00:00Z",
                     P[i], int(y[i])))
    rows.sort(key=lambda t: t[0])
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--log", help="JSONL of resolved prediction records")
    ap.add_argument("--self-test", action="store_true")
    ap.add_argument("--dry-run", action="store_true", help="fit + report, write nothing")
    ap.add_argument("--fit-frac", type=float, default=0.6)
    args = ap.parse_args()

    if args.self_test:
        rows = _make_synthetic()
        T, rep = calibrate(rows, args.fit_frac)
        print("SELF-TEST:", json.dumps(rep, indent=2))
        assert rep["nll_after"] <= rep["nll_before"] + 1e-9
        assert rep["brier_after"] <= rep["brier_before"] + 1e-9
        assert rep["argmax_preserved"]
        assert T > 1.0  # overconfident synthetic → softening
        print("OK — _stage_calibrate self-test passed (no calibrator written)")
        return

    if not args.log:
        ap.error("provide --log <path> or --self-test")
    rows = load_records(args.log)
    T, rep = calibrate(rows, args.fit_frac)
    print(json.dumps(rep, indent=2))

    if args.dry_run:
        print("--dry-run: calibrator NOT written")
        return

    from config import MODEL_DIR
    out = os.path.join(MODEL_DIR, "calibrator.json")
    Calibrator(T=T).save(out)
    print(f"Wrote calibrator (T={T}) -> {out}")


if __name__ == "__main__":
    main()
