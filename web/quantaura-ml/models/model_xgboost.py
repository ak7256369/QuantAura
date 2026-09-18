import os, joblib
from xgboost import XGBClassifier
from config import (XGB_MAX_DEPTH, XGB_N_ESTIMATORS, XGB_LR, XGB_SUBSAMPLE,
                    XGB_COLSAMPLE, XGB_MIN_CHILD_W, XGB_GAMMA, XGB_REG_LAMBDA,
                    XGB_EARLY_STOP, NUM_CLASSES, MODEL_DIR)

def build_xgb_model() -> XGBClassifier:
    return XGBClassifier(
        max_depth=XGB_MAX_DEPTH, n_estimators=XGB_N_ESTIMATORS,
        learning_rate=XGB_LR, subsample=XGB_SUBSAMPLE,
        colsample_bytree=XGB_COLSAMPLE, min_child_weight=XGB_MIN_CHILD_W,
        gamma=XGB_GAMMA, reg_lambda=XGB_REG_LAMBDA,
        objective="multi:softprob", num_class=NUM_CLASSES,
        eval_metric="mlogloss", early_stopping_rounds=XGB_EARLY_STOP,
        tree_method="hist", n_jobs=-1, random_state=42,
    )

def save_xgb(m): joblib.dump(m, os.path.join(MODEL_DIR, "xgb_model.pkl"))
def load_xgb(): return joblib.load(os.path.join(MODEL_DIR, "xgb_model.pkl"))
