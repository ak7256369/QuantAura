# Input: FLAT derivatives + technical signals, shape (batch, N_KAN_FEATURES from config)
# KAN discovers symbolic formulas between market features and price direction.
# After training, call kan.get_formula() to read what the model discovered.
# Now uses mini-batch training (was single-batch) + class weights + gradient clipping.
import torch, torch.nn as nn, numpy as np, os
from kan import KAN
from config import KAN_LAYERS, KAN_GRID, KAN_K, N_KAN_FEATURES, NUM_CLASSES, MODEL_DIR, KAN_FEATURES

class KANClassifier:
    def __init__(self):
        self.device    = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.model     = KAN(width=KAN_LAYERS, grid=KAN_GRID, k=KAN_K,
                             seed=42, device=str(self.device))
        self.optimizer = torch.optim.Adam(self.model.parameters(), lr=0.005)
        self.criterion = nn.CrossEntropyLoss()
        self.save_path = os.path.join(MODEL_DIR, "kan_model.pt")

    def _prep(self, X: np.ndarray) -> torch.Tensor:
        """
        X must be shape (batch, N_KAN_FEATURES). Assert to catch wrong inputs.
        If caller passes a 3D sequence array by mistake, raise clearly.
        """
        if X.ndim == 3:
            raise ValueError(
                f"KAN received 3D input {X.shape}. KAN only takes flat "
                f"(batch, {N_KAN_FEATURES}) vectors. "
                "Extract KAN_FEATURES columns from df_4h, do NOT pass sequences."
            )
        if X.shape[1] != N_KAN_FEATURES:
            raise ValueError(f"KAN expects {N_KAN_FEATURES} features, got {X.shape[1]}")
        return torch.FloatTensor(X).to(self.device)

    def _compute_class_weights(self, y: np.ndarray) -> torch.Tensor:
        """Compute inverse-frequency class weights for imbalanced data."""
        classes, counts = np.unique(y, return_counts=True)
        total = len(y)
        weights = torch.ones(NUM_CLASSES, device=self.device)
        for cls, cnt in zip(classes, counts):
            if cls < NUM_CLASSES:
                weights[int(cls)] = total / (NUM_CLASSES * cnt)
        return weights

    def train_epoch(self, X: np.ndarray, y: np.ndarray, batch_size: int = 128) -> float:
        """Mini-batch training with class weights and gradient clipping."""
        self.model.train()
        total_loss = 0.0
        n_batches = 0

        # Dynamic class weights
        class_weights = self._compute_class_weights(y)
        criterion = nn.CrossEntropyLoss(weight=class_weights)

        # Shuffle
        idx = np.random.permutation(len(X))
        X_shuffled, y_shuffled = X[idx], y[idx]

        for i in range(0, len(X_shuffled), batch_size):
            batch_X = self._prep(X_shuffled[i:i+batch_size])
            batch_y = torch.LongTensor(y_shuffled[i:i+batch_size]).to(self.device)

            self.optimizer.zero_grad()
            loss = criterion(self.model(batch_X), batch_y)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(self.model.parameters(), 1.0)
            self.optimizer.step()

            total_loss += loss.item()
            n_batches += 1
            del batch_X, batch_y, loss

        return total_loss / max(n_batches, 1)

    def predict_proba(self, X: np.ndarray) -> np.ndarray:
        self.model.eval()
        with torch.no_grad():
            return torch.softmax(self.model(self._prep(X)), -1).cpu().numpy()

    def save(self):
        torch.save(self.model.state_dict(), self.save_path)

    def load(self) -> bool:
        """Returns True if the checkpoint was actually loaded — callers that
        evaluate 'the best checkpoint' must know when this silently failed."""
        if not os.path.exists(self.save_path):
            return False
        try:
            self.model.load_state_dict(torch.load(self.save_path, map_location=self.device))
            return True
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(
                f"[KAN] Weight load FAILED ({e}) — continuing with current "
                f"in-memory weights; reported metrics are NOT the best checkpoint")
            return False

    def get_formula(self) -> str:
        """
        Attempts symbolic regression to extract human-readable formula.
        Call AFTER training. Print this in the FYP to demonstrate KAN interpretability.
        """
        try:
            self.model.auto_symbolic(lib=["sin","cos","exp","log","sqrt","x","x^2","x^3"])
            return str(self.model.symbolic_formula(var=list(KAN_FEATURES))[0][0])
        except Exception as e:
            return f"[Formula extraction failed: {e}]"
