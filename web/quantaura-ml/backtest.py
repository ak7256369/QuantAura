import pandas as pd
import numpy as np
import logging

from config import (
    LSTM_FEATURES, TRANSFORMER_FEATURES, KAN_FEATURES,
    LSTM_SEQ_LEN, TRANS_SEQ_LEN, CONFIDENCE_THRESHOLD,
)
from ensemble import blend_predictions

# ── Execution model (documented in the UI; educational simulation) ────────────
INITIAL_CAPITAL   = 10000.0
FEE_RATE          = 0.001    # 0.10% taker fee per side (Binance spot)
SLIPPAGE_RATE     = 0.0005   # 0.05% adverse execution per side
POSITION_FRACTION = 0.50     # risk cap: at most half of equity deployed per trade
ENTRY_CONFIDENCE  = CONFIDENCE_THRESHOLD * 100  # mirror the live signal gate

log = logging.getLogger(__name__)

def run_backtest(symbol, days, state_dict):
    """
    Runs a historical backtest for a given symbol over N days.
    state_dict contains loaded models and scalers from serve.py.
    Feature construction goes through the shared pipeline
    (feature_engineering.pipeline) — identical to training and live inference.
    """
    # 1. Build features via the shared pipeline
    from data_sources.market_regime import build_full_macro_df
    from feature_engineering.pipeline import fetch_btc_context, build_symbol_frames
    from feature_engineering.xgb_features import build_xgb_features

    # Extra lookback: TRANS_SEQ_LEN 4h candles (= 16 days) + indicator warm-up
    lookback = 30
    total_days = days + lookback

    log.info(f"[{symbol}] Fetching {total_days} days of data for backtest...")
    try:
        macro = build_full_macro_df()
    except Exception as e:
        log.warning(f"[{symbol}] Macro fetch failed: {e}, using zeros")
        macro = pd.DataFrame()

    btc_ctx = fetch_btc_context(days_1h=total_days, days_4h=total_days)
    frames = build_symbol_frames(
        symbol, macro, btc_ctx,
        days_1h=total_days, days_4h=total_days,
        with_labels=False,
    )
    if frames is None:
        raise ValueError(f"Feature build failed for {symbol} (no data)")
    df_1h, df_4h = frames["df_1h"], frames["df_4h"]

    # Get models and scalers
    sc_lstm  = state_dict["sc_lstm"]
    sc_trans = state_dict["sc_trans"]
    sc_xgb   = state_dict["sc_xgb"]
    sc_kan   = state_dict["sc_kan"]

    # 2. Build sequences
    # NOTE: feature columns are selected in config-list order — the scalers
    # were fit on exactly these columns in exactly this order by _stage_collect.
    def _build_seq(df, cols, seq_len, scaler):
        data = scaler.transform(np.nan_to_num(df[list(cols)].values, nan=0.0))
        X = []
        timestamps = []
        close_prices = []
        for i in range(seq_len, len(data)):
            X.append(data[i - seq_len:i])
            timestamps.append(df.iloc[i]["timestamp"])
            close_prices.append(df.iloc[i]["close"])
        return np.array(X, dtype=np.float32), timestamps, close_prices

    X_lstm, ts_lstm, close_lstm = _build_seq(df_1h, LSTM_FEATURES, LSTM_SEQ_LEN, sc_lstm)
    X_trans, ts_trans, close_trans = _build_seq(df_4h, TRANSFORMER_FEATURES, TRANS_SEQ_LEN, sc_trans)

    if len(X_trans) == 0 or len(X_lstm) == 0:
        raise ValueError("Not enough historical data for sequence building.")

    # We need to align everything to 4h timestamps because our target label is 4h
    # For backtesting, we simulate trades every 4 hours.

    # XGBoost features
    xgb_full_X, _ = build_xgb_features(df_1h, df_4h)

    # Align lengths (XGB features are aligned to df_4h)
    # The last len(X_trans) items correspond to the valid sequences
    X_xgb = sc_xgb.transform(np.nan_to_num(xgb_full_X[-len(X_trans):], nan=0.0))

    # KAN features
    X_kan = sc_kan.transform(
        np.nan_to_num(df_4h[KAN_FEATURES].values, nan=0.0))[-len(X_trans):]

    # Align LSTM to 4h timestamps
    # For each 4h timestamp, find the exact matching 1h sequence
    aligned_X_lstm = []
    valid_ts = []
    valid_close = []
    valid_idx = []
    
    lstm_ts_idx_map = {t: i for i, t in enumerate(ts_lstm)}
    
    for i, t in enumerate(ts_trans):
        if t in lstm_ts_idx_map:
            aligned_X_lstm.append(X_lstm[lstm_ts_idx_map[t]])
            valid_ts.append(t)
            valid_close.append(close_trans[i])
            valid_idx.append(i)

    if not aligned_X_lstm:
        raise ValueError("Timestamp alignment failed.")

    aligned_X_lstm = np.array(aligned_X_lstm)
    X_trans = X_trans[valid_idx]
    X_xgb = X_xgb[valid_idx]
    X_kan = X_kan[valid_idx]

    # Only take the requested number of days (convert to 4h ticks: days * 6)
    ticks_needed = days * 6
    aligned_X_lstm = aligned_X_lstm[-ticks_needed:]
    X_trans = X_trans[-ticks_needed:]
    X_xgb = X_xgb[-ticks_needed:]
    X_kan = X_kan[-ticks_needed:]
    valid_ts = valid_ts[-ticks_needed:]
    valid_close = valid_close[-ticks_needed:]

    log.info(f"[{symbol}] Running batch predictions on {len(valid_ts)} periods...")

    # 3. Predict in batches
    p_lstm = state_dict["lstm"].predict(aligned_X_lstm, batch_size=32, verbose=0)
    p_trans = state_dict["transformer"].predict_proba(X_trans)
    p_xgb = state_dict["xgb"].predict_proba(X_xgb)
    p_kan = state_dict["kan"].predict_proba(X_kan)

    # 4. Simulate trades with a realistic execution model:
    #    - taker fee + slippage on BOTH sides of every trade
    #    - entries only on gated signals (same threshold as live serving)
    #    - at most POSITION_FRACTION of equity deployed per trade (risk cap)
    cash = INITIAL_CAPITAL
    position = 0.0        # coins held
    entry_price = 0.0     # effective (slipped) entry price
    fees_paid = 0.0
    in_market_ticks = 0
    trades = []
    equity_curve = []

    def _sell_out(position, entry_price, exec_price, date_str, trade_id, note=None):
        gross = position * exec_price
        fee = gross * FEE_RATE
        proceeds = gross - fee
        cost_basis = position * entry_price
        profit = proceeds - cost_basis
        trade = {
            "id": trade_id,
            "date": date_str,
            "type": "SELL",
            "price": exec_price,
            "amount": proceeds,
            "fee": round(fee, 2),
            "profit": profit,
            "profitPercent": (profit / cost_basis * 100) if cost_basis > 0 else 0.0,
        }
        if note:
            trade["note"] = note
        return proceeds, fee, trade

    for i in range(len(valid_ts)):
        preds = {
            "lstm": p_lstm[i].tolist(),
            "transformer": p_trans[i].tolist(),
            "xgboost": p_xgb[i].tolist(),
            "kan": p_kan[i].tolist()
        }
        res = blend_predictions(preds)
        signal = res["signal"]          # "BUY", "HOLD", or "SELL"
        confidence = res["confidence"]  # 0-100

        current_price = valid_close[i]
        timestamp = valid_ts[i]
        date_str = pd.to_datetime(timestamp, unit='ms').strftime('%Y-%m-%d %H:%M')
        buy_exec = current_price * (1 + SLIPPAGE_RATE)    # pay up on entry
        sell_exec = current_price * (1 - SLIPPAGE_RATE)   # concede on exit

        if signal == "BUY" and confidence >= ENTRY_CONFIDENCE and position == 0.0:
            spend = cash * POSITION_FRACTION
            fee = spend * FEE_RATE
            position = (spend - fee) / buy_exec
            cash -= spend
            fees_paid += fee
            entry_price = buy_exec
            trades.append({
                "id": str(timestamp),
                "date": date_str,
                "type": "BUY",
                "price": buy_exec,
                "amount": position,
                "fee": round(fee, 2),
                "profit": 0,
                "profitPercent": 0,
                "confidence": round(confidence, 1),
            })
        elif signal == "SELL" and position > 0.0:
            proceeds, fee, trade = _sell_out(position, entry_price, sell_exec,
                                             date_str, str(timestamp))
            trade["confidence"] = round(confidence, 1)
            cash += proceeds
            fees_paid += fee
            position = 0.0
            trades.append(trade)

        if position > 0.0:
            in_market_ticks += 1
        equity_curve.append({
            "timestamp": timestamp,
            "date": date_str,
            "equity": cash + position * current_price,
            "price": current_price
        })

    # Close any open position at the end (same costs)
    if position > 0.0:
        sell_exec = valid_close[-1] * (1 - SLIPPAGE_RATE)
        proceeds, fee, trade = _sell_out(position, entry_price, sell_exec,
                                         equity_curve[-1]["date"], "close",
                                         note="End of backtest")
        cash += proceeds
        fees_paid += fee
        position = 0.0
        trades.append(trade)
        equity_curve[-1]["equity"] = cash

    balance = cash

    # ── Buy & hold benchmark over the SAME window with the SAME costs ────────
    first_price = valid_close[0]
    bh_units = (INITIAL_CAPITAL * (1 - FEE_RATE)) / (first_price * (1 + SLIPPAGE_RATE))
    for eq, px in zip(equity_curve, valid_close):
        eq["buyHold"] = bh_units * px
    bh_final = bh_units * valid_close[-1] * (1 - SLIPPAGE_RATE) * (1 - FEE_RATE)
    buy_hold_pct = (bh_final - INITIAL_CAPITAL) / INITIAL_CAPITAL * 100

    # Metrics
    net_profit = balance - INITIAL_CAPITAL
    net_profit_pct = (net_profit / INITIAL_CAPITAL) * 100
    
    sell_trades = [t for t in trades if t["type"] == "SELL" and "profit" in t]
    win_trades = [t for t in sell_trades if t["profit"] > 0]
    win_rate = (len(win_trades) / len(sell_trades) * 100) if sell_trades else 0.0

    gross_profit = sum(t["profit"] for t in win_trades)
    gross_loss = abs(sum(t["profit"] for t in sell_trades if t["profit"] < 0))
    profit_factor = (gross_profit / gross_loss) if gross_loss > 0 else (99.9 if gross_profit > 0 else 0)

    # Max Drawdown
    peak = INITIAL_CAPITAL
    max_dd = 0.0
    for eq in equity_curve:
        if eq["equity"] > peak:
            peak = eq["equity"]
        dd = (peak - eq["equity"]) / peak * 100
        if dd > max_dd:
            max_dd = dd

    # Sharpe (simplified: avg daily return / daily stddev)
    df_eq = pd.DataFrame(equity_curve)
    if len(df_eq) > 1:
        df_eq["ret"] = df_eq["equity"].pct_change()
        mean_ret = df_eq["ret"].mean()
        std_ret = df_eq["ret"].std()
        # annualized assuming 6 ticks per day (4h)
        sharpe = (mean_ret / std_ret) * np.sqrt(365 * 6) if std_ret > 0 else 0
    else:
        sharpe = 0

    # Format equity curve for chart (strategy + buy & hold benchmark)
    formatted_chart = []
    for eq in equity_curve:
        formatted_chart.append({
            "date": eq["date"].split(" ")[0], # Just date for chart
            "fullDate": eq["date"],
            "equity": round(eq["equity"], 2),
            "buyHold": round(eq.get("buyHold", INITIAL_CAPITAL), 2),
            "price": round(eq["price"], 2)
        })

    # Group chart by day to reduce points
    df_chart = pd.DataFrame(formatted_chart)
    df_daily = df_chart.groupby("date").last().reset_index()

    return {
        "metrics": {
            "netProfit": round(net_profit, 2),
            "netProfitPercent": round(net_profit_pct, 2),
            "buyHoldReturnPercent": round(buy_hold_pct, 2),
            "winRate": round(win_rate, 2),
            "profitFactor": round(profit_factor, 2),
            "maxDrawdown": round(max_dd, 2),
            "sharpeRatio": round(sharpe, 2),
            "totalTrades": len(sell_trades),
            "feesPaid": round(fees_paid, 2),
            "timeInMarketPercent": round(in_market_ticks / max(len(valid_ts), 1) * 100, 1),
        },
        "assumptions": {
            "initialCapital": INITIAL_CAPITAL,
            "feePercentPerSide": FEE_RATE * 100,
            "slippagePercentPerSide": SLIPPAGE_RATE * 100,
            "positionFractionPercent": POSITION_FRACTION * 100,
            "entryConfidenceGate": ENTRY_CONFIDENCE,
        },
        "chart": df_daily.to_dict("records"),
        "trades": sorted(trades, key=lambda x: x["id"], reverse=True)
    }
