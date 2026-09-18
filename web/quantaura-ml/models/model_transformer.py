# Input: 4h sequences, shape (batch, TRANS_SEQ_LEN=96, N_TRANSFORMER_FEATURES from config)
# Architecture: Linear projection → Learned PE → N×(MHA + FFN) → CLS token → Dense
# Why TRANS_SEQ_LEN=96: 16 days of 4h candles. Transformer's strength is attending to
# events that happened 2 weeks ago — long enough for crypto market cycles.
# Why learned PE (not sinusoidal): crypto patterns aren't periodic like NLP tokens.
# Why pre-norm blocks: more stable training on financial time series than post-norm.
import torch, torch.nn as nn, numpy as np, os
from config import (TRANS_SEQ_LEN, N_TRANSFORMER_FEATURES, TRANS_D_MODEL,
                    TRANS_NHEAD, TRANS_LAYERS, TRANS_DROPOUT, TRANS_FF_DIM,
                    NUM_CLASSES, MODEL_DIR)

class _Block(nn.Module):
    def __init__(self):
        super().__init__()
        self.attn  = nn.MultiheadAttention(TRANS_D_MODEL, TRANS_NHEAD,
                                            dropout=TRANS_DROPOUT, batch_first=True)
        self.ff    = nn.Sequential(
            nn.Linear(TRANS_D_MODEL, TRANS_FF_DIM), nn.GELU(),
            nn.Dropout(TRANS_DROPOUT), nn.Linear(TRANS_FF_DIM, TRANS_D_MODEL),
        )
        self.n1, self.n2 = nn.LayerNorm(TRANS_D_MODEL), nn.LayerNorm(TRANS_D_MODEL)
        self.drop        = nn.Dropout(TRANS_DROPOUT)

    def forward(self, x):
        n = self.n1(x)
        a, _ = self.attn(n, n, n)
        x = x + self.drop(a)
        x = x + self.drop(self.ff(self.n2(x)))
        return x

class _Net(nn.Module):
    def __init__(self):
        super().__init__()
        self.proj      = nn.Linear(N_TRANSFORMER_FEATURES, TRANS_D_MODEL)
        self.pos_embed = nn.Embedding(TRANS_SEQ_LEN + 1, TRANS_D_MODEL)
        self.cls_token = nn.Parameter(torch.zeros(1, 1, TRANS_D_MODEL))
        self.blocks    = nn.ModuleList([_Block() for _ in range(TRANS_LAYERS)])
        self.norm      = nn.LayerNorm(TRANS_D_MODEL)
        self.head      = nn.Sequential(
            nn.Linear(TRANS_D_MODEL, 64), nn.GELU(),
            nn.Dropout(TRANS_DROPOUT), nn.Linear(64, NUM_CLASSES)
        )
        nn.init.trunc_normal_(self.cls_token, std=0.02)

    def forward(self, x):
        B, T, _ = x.shape
        x   = self.proj(x)
        cls = self.cls_token.expand(B, -1, -1)
        x   = torch.cat([cls, x], dim=1)
        x   = x + self.pos_embed(torch.arange(T+1, device=x.device))
        for blk in self.blocks: x = blk(x)
        return self.head(self.norm(x)[:, 0])  # CLS token output

class TransformerClassifier:
    def __init__(self):
        self.device    = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.model     = _Net().to(self.device)
        self.optimizer = torch.optim.AdamW(self.model.parameters(), lr=1e-4, weight_decay=1e-4)
        self.criterion = nn.CrossEntropyLoss(label_smoothing=0.1)
        self.scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(
            self.optimizer, T_max=100, eta_min=1e-6)
        self.save_path = os.path.join(MODEL_DIR, "transformer_model.pt")

    def _compute_class_weights(self, y: np.ndarray) -> torch.Tensor:
        """Compute inverse-frequency class weights to handle imbalanced labels."""
        classes, counts = np.unique(y, return_counts=True)
        total = len(y)
        weights = torch.ones(NUM_CLASSES, device=self.device)
        for cls, cnt in zip(classes, counts):
            if cls < NUM_CLASSES:
                weights[int(cls)] = total / (NUM_CLASSES * cnt)
        return weights

    def train_epoch(self, X: np.ndarray, y: np.ndarray, batch_size: int = 32) -> float:
        self.model.train()
        total_loss = 0.0
        n_batches = 0

        # Dynamic class weights for imbalanced data
        class_weights = self._compute_class_weights(y)
        criterion = nn.CrossEntropyLoss(weight=class_weights, label_smoothing=0.1)

        # Shuffle
        idx = np.random.permutation(len(X))
        X, y = X[idx], y[idx]
        for i in range(0, len(X), batch_size):
            Xt = torch.FloatTensor(X[i:i+batch_size]).to(self.device)
            yt = torch.LongTensor(y[i:i+batch_size]).to(self.device)
            self.optimizer.zero_grad()
            loss = criterion(self.model(Xt), yt)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(self.model.parameters(), 1.0)
            self.optimizer.step()
            total_loss += loss.item()
            n_batches += 1
            del Xt, yt, loss  # Free GPU/CPU tensors immediately
        self.scheduler.step()
        return total_loss / max(n_batches, 1)

    def predict_proba(self, X: np.ndarray) -> np.ndarray:
        self.model.eval()
        results = []
        with torch.no_grad():
            for i in range(0, len(X), 64):
                batch = torch.FloatTensor(X[i:i+64]).to(self.device)
                results.append(torch.softmax(self.model(batch), -1).cpu().numpy())
        return np.concatenate(results)

    def save(self):
        torch.save({"model": self.model.state_dict(),
                    "opt": self.optimizer.state_dict(),
                    "sch": self.scheduler.state_dict()}, self.save_path)

    def load(self) -> bool:
        """Returns True only if the checkpoint was actually applied. On failure
        the model keeps its random initialisation, so serving code must not
        treat a False return as loadable — see load_lstm_model()."""
        self.weights_loaded = False
        if not os.path.exists(self.save_path):
            return False
        try:
            ckpt = torch.load(self.save_path, map_location=self.device)
            self.model.load_state_dict(ckpt["model"])
            self.optimizer.load_state_dict(ckpt["opt"])
            self.scheduler.load_state_dict(ckpt["sch"])
            self.weights_loaded = True
            return True
        except Exception as e:
            print(f"[TRANSFORMER] Weight load failed ({e}), starting fresh model")
            return False
