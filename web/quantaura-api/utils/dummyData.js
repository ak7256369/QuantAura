// Dummy signal data for the prototype (mirrors the original app.js data)

const SIGNAL_DATA = {
    BTC: {
        symbol: 'BTCUSDT', signal: 'BUY', confidence: 78,
        ensemble: { lstm: { signal: 'BUY', confidence: 82 }, xgboost: { signal: 'BUY', confidence: 76 }, transformer: { signal: 'BUY', confidence: 74 } },
        indicators: {
            'RSI (14)': { value: '28.5', status: 'bullish', note: 'Oversold' },
            'MACD': { value: 'Bullish ↑', status: 'bullish', note: 'Crossover' },
            'Bollinger': { value: 'Lower Band', status: 'bullish', note: 'Bounce' },
            'EMA 10/50': { value: 'Uptrend', status: 'bullish', note: 'Golden' },
        },
        macro: {
            'CPI': { value: '2.9%', change: '-0.1%', direction: 'positive' },
            'Fed Rate': { value: '4.25%', change: 'Paused', direction: 'positive' },
        },
        explanation: "Bitcoin is showing strong buy signals as the RSI has dropped to oversold territory at 28.5. The MACD just formed a bullish crossover. The Fed's decision to pause rate hikes at 4.25% benefits risk assets.",
    },
    ETH: {
        symbol: 'ETHUSDT', signal: 'SELL', confidence: 65,
        ensemble: { lstm: { signal: 'SELL', confidence: 68 }, xgboost: { signal: 'HOLD', confidence: 55 }, transformer: { signal: 'SELL', confidence: 71 } },
        indicators: {
            'RSI (14)': { value: '78.3', status: 'bearish', note: 'Overbought' },
            'MACD': { value: 'Bearish ↓', status: 'bearish', note: 'Divergence' },
            'Bollinger': { value: 'Upper Band', status: 'bearish', note: 'Rejection' },
            'EMA 10/50': { value: 'Flatting', status: 'neutral', note: 'Weakening' },
        },
        macro: {
            'CPI': { value: '2.9%', change: '-0.1%', direction: 'positive' },
            'Fed Rate': { value: '4.25%', change: 'Paused', direction: 'positive' },
        },
        explanation: "Ethereum is flashing cautionary signals as the RSI reaches 78.3, well into overbought territory. The MACD shows bearish divergence. Consider taking profits.",
    },
    SOL: {
        symbol: 'SOLUSDT', signal: 'BUY', confidence: 72,
        ensemble: { lstm: { signal: 'BUY', confidence: 75 }, xgboost: { signal: 'BUY', confidence: 70 }, transformer: { signal: 'HOLD', confidence: 68 } },
        indicators: {
            'RSI (14)': { value: '35.2', status: 'bullish', note: 'Near Oversold' },
            'MACD': { value: 'Bullish ↑', status: 'bullish', note: 'Crossover' },
            'Bollinger': { value: 'Lower', status: 'bullish', note: 'Support' },
            'EMA 10/50': { value: 'Crossing', status: 'bullish', note: 'Golden' },
        },
        macro: {
            'CPI': { value: '2.9%', change: '-0.1%', direction: 'positive' },
            'Fed Rate': { value: '4.25%', change: 'Paused', direction: 'positive' },
        },
        explanation: "Solana is demonstrating compelling buy signals with an RSI of 35.2 approaching oversold conditions and a fresh MACD bullish crossover.",
    },
};

// Default for other coins
const DEFAULT_SIGNAL = {
    signal: 'HOLD', confidence: 52,
    ensemble: { lstm: { signal: 'HOLD', confidence: 55 }, xgboost: { signal: 'BUY', confidence: 51 }, transformer: { signal: 'HOLD', confidence: 50 } },
    indicators: {
        'RSI (14)': { value: '52.1', status: 'neutral', note: 'Neutral' },
        'MACD': { value: 'Flat', status: 'neutral', note: 'No Signal' },
        'Bollinger': { value: 'Middle', status: 'neutral', note: 'Range' },
        'EMA 10/50': { value: 'Neutral', status: 'neutral', note: 'Flat' },
    },
    macro: {
        'CPI': { value: '2.9%', change: '-0.1%', direction: 'positive' },
        'Fed Rate': { value: '4.25%', change: 'Paused', direction: 'positive' },
    },
    explanation: "Mixed signals from the ensemble model. No clear directional bias detected.",
};

function getDummySignal(symbol) {
    return SIGNAL_DATA[symbol] || { ...DEFAULT_SIGNAL, symbol: `${symbol}USDT` };
}

function getDummySignalHistory() {
    return [
        { symbol: 'BTC', name: 'Bitcoin', signal: 'BUY', confidence: 78, time: '2 min ago' },
        { symbol: 'ETH', name: 'Ethereum', signal: 'SELL', confidence: 65, time: '5 min ago' },
        { symbol: 'SOL', name: 'Solana', signal: 'BUY', confidence: 72, time: '8 min ago' },
        { symbol: 'BNB', name: 'BNB', signal: 'HOLD', confidence: 52, time: '12 min ago' },
        { symbol: 'XRP', name: 'Ripple', signal: 'BUY', confidence: 61, time: '18 min ago' },
        { symbol: 'DOGE', name: 'Dogecoin', signal: 'SELL', confidence: 58, time: '25 min ago' },
    ];
}

module.exports = { getDummySignal, getDummySignalHistory, SIGNAL_DATA };
