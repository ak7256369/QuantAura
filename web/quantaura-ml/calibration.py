"""
Probability calibration for the blended 3-class regime vector.

WHY THIS EXISTS
---------------
serve.py blends four models into a probability vector (pBUY, pHOLD, pSELL) and
reports its max as "confidence". That number is an argmax score, not a
calibrated probability: when the blend says 70% it is not yet established that
the event happens ~70% of the time. The transparency dashboard grades
calibration honestly (reliability diagram, multiclass Brier), so the vector
must be calibrated first.

METHOD (per the Calibration & Grading methods brief, Decision 1)
----------------------------------------------------------------
Temperature scaling of the ALREADY-BLENDED probabilities, fit by multiclass
NLL on a chronologically separate calibration split:

    p~_k = max(p_k, eps) / sum_j max(p_j, eps)      # clip, renormalize
    q_k  = softmax_k( log(p~) / T ),   T > 0

One positive temperature leaves the argmax unchanged after clipping, so it
never flips a class — it only sharpens (T<1) or softens (T>1) confidence.
This is the probability-space adaptation of Guo et al. (2017): the ensemble
exposes probabilities, not recoverable component logits, so we scale log(p~),
not raw logits.

IMPORTANT INVARIANTS
- Calibrate the RAW vector, BEFORE the 55% gate. Never relabel the truth to
  HOLD when the system abstains.
- eps and the deterministic tie rule are frozen with the calibrator version;
  do NOT retune eps on the report set.
- No new dependency: the 1-D NLL minimization is a numpy golden-section search
  (temperature scaling is a smooth 1-parameter problem).

Classes are indexed BUY=0, HOLD=1, SELL=2 to match labels.py / config.NUM_CLASSES.
"""
from __future__ import annotations
import json
import math
import numpy as np

CALIBRATOR_VERSION = "temp_v1"
DEFAULT_EPS = 1e-3          # frozen with the version; 0 < eps < 1/3
_GOLDEN = (math.sqrt(5) - 1) / 2


def _clip_normalize(P: np.ndarray, eps: float) -> np.ndarray:
    """Clip each probability to >= eps and renormalize rows to sum 1."""
    P = np.asarray(P, dtype=float)
    P = np.maximum(P, eps)
    return P / P.sum(axis=1, keepdims=True)


def apply_temperature(P: np.ndarray, T: float, eps: float = DEFAULT_EPS) -> np.ndarray:
    """Temperature-scale blended probability rows. Returns calibrated rows.

    softmax(log(clip(P,eps)) / T) — numerically stabilized by subtracting the
    per-row max logit before exponentiating.
    """
    if T <= 0:
        raise ValueError(f"Temperature must be > 0, got {T}")
    P = _clip_normalize(np.atleast_2d(P), eps)
    logits = np.log(P) / T
    logits -= logits.max(axis=1, keepdims=True)
    e = np.exp(logits)
    return e / e.sum(axis=1, keepdims=True)


def _nll(P: np.ndarray, y: np.ndarray, T: float, eps: float) -> float:
    """Mean multiclass negative log-likelihood at temperature T."""
    Q = apply_temperature(P, T, eps)
    n = P.shape[0]
    picked = Q[np.arange(n), y]
    return float(-np.log(np.maximum(picked, 1e-12)).mean())


def fit_temperature(P: np.ndarray, y: np.ndarray, eps: float = DEFAULT_EPS,
                    lo: float = 0.05, hi: float = 10.0, tol: float = 1e-4) -> float:
    """Fit T>0 minimizing multiclass NLL on (P, y) by golden-section search.

    P: (n, 3) raw blended probabilities. y: (n,) int labels in {0,1,2}.
    The NLL as a function of T is smooth and unimodal in practice, so a
    bracketed 1-D search is sufficient and dependency-free.
    """
    P = np.atleast_2d(np.asarray(P, dtype=float))
    y = np.asarray(y, dtype=int)
    if P.shape[0] != y.shape[0]:
        raise ValueError("P and y must have the same number of rows")
    if P.shape[0] == 0:
        return 1.0

    a, b = lo, hi
    c = b - _GOLDEN * (b - a)
    d = a + _GOLDEN * (b - a)
    fc, fd = _nll(P, y, c, eps), _nll(P, y, d, eps)
    while (b - a) > tol:
        if fc < fd:
            b, d, fd = d, c, fc
            c = b - _GOLDEN * (b - a)
            fc = _nll(P, y, c, eps)
        else:
            a, c, fc = c, d, fd
            d = a + _GOLDEN * (b - a)
            fd = _nll(P, y, d, eps)
    return round((a + b) / 2, 4)


def multiclass_brier(Q: np.ndarray, y: np.ndarray) -> float:
    """Unhalved multiclass Brier loss, range 0..2 (state the scale in reports)."""
    Q = np.atleast_2d(np.asarray(Q, dtype=float))
    y = np.asarray(y, dtype=int)
    onehot = np.zeros_like(Q)
    onehot[np.arange(len(y)), y] = 1.0
    return float(((Q - onehot) ** 2).sum(axis=1).mean())


class Calibrator:
    """Frozen, versioned temperature calibrator. JSON-serializable."""

    def __init__(self, T: float = 1.0, eps: float = DEFAULT_EPS,
                 version: str = CALIBRATOR_VERSION):
        self.T = float(T)
        self.eps = float(eps)
        self.version = version

    def transform(self, P: np.ndarray) -> np.ndarray:
        return apply_temperature(P, self.T, self.eps)

    @classmethod
    def fit(cls, P: np.ndarray, y: np.ndarray, eps: float = DEFAULT_EPS) -> "Calibrator":
        return cls(T=fit_temperature(P, y, eps=eps), eps=eps)

    def to_dict(self) -> dict:
        return {"version": self.version, "T": self.T, "eps": self.eps}

    def save(self, path: str) -> None:
        with open(path, "w") as f:
            json.dump(self.to_dict(), f, indent=2)

    @classmethod
    def load(cls, path: str) -> "Calibrator":
        with open(path) as f:
            d = json.load(f)
        return cls(T=d.get("T", 1.0), eps=d.get("eps", DEFAULT_EPS),
                   version=d.get("version", CALIBRATOR_VERSION))


if __name__ == "__main__":
    # Self-test: genuinely OVERCONFIDENT 3-class predictions (~97% confident but
    # only ~70% correct) should calibrate to T>1 (softening), and calibration
    # must never increase NLL or Brier, nor flip the argmax.
    rng = np.random.default_rng(0)
    n = 4000
    preds = rng.integers(0, 3, size=n)
    logits = np.zeros((n, 3))
    logits[np.arange(n), preds] = 4.0          # ~0.97 mass on the predicted class
    P = np.exp(logits) / np.exp(logits).sum(axis=1, keepdims=True)
    # True label matches the prediction only ~70% of the time → overconfident.
    match = rng.random(n) < 0.70
    y = preds.copy()
    y[~match] = (preds[~match] + rng.integers(1, 3, size=(~match).sum())) % 3

    T = fit_temperature(P, y)
    Q = apply_temperature(P, T)
    nll_before, nll_after = _nll(P, y, 1.0, DEFAULT_EPS), _nll(P, y, T, DEFAULT_EPS)
    b_before, b_after = multiclass_brier(P, y), multiclass_brier(Q, y)
    argmax_preserved = bool((P.argmax(1) == Q.argmax(1)).all())

    print(f"fitted T            = {T}  (expect > 1 for overconfident input)")
    print(f"NLL   {nll_before:.4f} -> {nll_after:.4f}  (should not increase)")
    print(f"Brier {b_before:.4f} -> {b_after:.4f}  (should not increase)")
    print(f"argmax preserved    = {argmax_preserved}  (must be True)")
    assert nll_after <= nll_before + 1e-9
    assert b_after <= b_before + 1e-9
    assert argmax_preserved
    print("OK — calibration.py self-test passed")
