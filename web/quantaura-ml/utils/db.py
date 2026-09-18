import sqlite3, pandas as pd
from config import DB_PATH

def get_conn():
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    return conn

def init_db():
    with get_conn() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS candles_1h (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                symbol TEXT NOT NULL, timestamp INTEGER NOT NULL,
                open REAL, high REAL, low REAL, close REAL, volume REAL,
                rsi_14 REAL, macd REAL, macd_signal REAL, macd_hist REAL,
                bb_upper REAL, bb_lower REAL, bb_width REAL,
                ema_9 REAL, ema_21 REAL, atr_14 REAL,
                price_delta_1 REAL, price_delta_3 REAL, price_delta_6 REAL,
                volume_delta_1 REAL, volume_ratio_10 REAL,
                high_low_range REAL, vwap_deviation REAL,
                label INTEGER,
                UNIQUE(symbol, timestamp)
            )""")
        conn.execute("""
            CREATE TABLE IF NOT EXISTS candles_4h (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                symbol TEXT NOT NULL, timestamp INTEGER NOT NULL,
                open REAL, high REAL, low REAL, close REAL, volume REAL,
                rsi_14 REAL, macd REAL, macd_signal REAL, macd_hist REAL,
                bb_upper REAL, bb_lower REAL, bb_width REAL,
                ema_12 REAL, ema_26 REAL, ema_cross REAL, atr_14 REAL,
                price_delta_1 REAL, price_delta_3 REAL, price_delta_6 REAL,
                volume_delta_1 REAL, volume_ratio_20 REAL,
                ichimoku_conv REAL, ichimoku_base REAL,
                funding_rate REAL, open_interest_change REAL,
                long_short_ratio REAL, taker_buy_ratio REAL,
                fed_funds_rate REAL, cpi REAL, cpi_yoy REAL,
                unemployment_rate REAL, ppi REAL,
                dxy_level REAL, dxy_return REAL,
                dxy_weekly_return REAL, sp500_return REAL,
                sp500_weekly_return REAL, sp500_monthly_return REAL,
                btc_dominance REAL, fear_greed REAL,
                funding_rate_7d_mean REAL, sentiment_score REAL,
                label INTEGER,
                UNIQUE(symbol, timestamp)
            )""")
        # eval_scope: 'holdout' = scored on the fixed out-of-time test split
        # (comparable across cycles — this is what weights/dashboard use);
        # 'window' = scored on a rolling recent window (diagnostic only, NOT
        # comparable across cycles because the slice of market differs).
        conn.execute("""
            CREATE TABLE IF NOT EXISTS model_performance (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                model_name TEXT, timestamp INTEGER,
                f1_macro REAL, f1_buy REAL, f1_hold REAL, f1_sell REAL,
                eval_scope TEXT DEFAULT 'holdout'
            )""")
        # Migration for databases created before eval_scope existed
        cols = {r[1] for r in conn.execute("PRAGMA table_info(model_performance)")}
        if "eval_scope" not in cols:
            conn.execute("ALTER TABLE model_performance "
                         "ADD COLUMN eval_scope TEXT DEFAULT 'holdout'")
        conn.execute("""
            CREATE TABLE IF NOT EXISTS sentiment_cache (
                symbol TEXT PRIMARY KEY,
                score REAL, fetched_at INTEGER
            )""")
        conn.execute("""
            CREATE TABLE IF NOT EXISTS candle_counts (
                id INTEGER PRIMARY KEY,
                count_1h INTEGER DEFAULT 0,
                count_4h INTEGER DEFAULT 0,
                updated_at INTEGER
            )""")
