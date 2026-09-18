const express = require('express');
const router = express.Router();
const { getHistoricalCandles } = require('../services/binanceService');
const { generateCryptoChatResponse } = require('../services/llmService');
const { requireAuth, dbReady } = require('../middleware/auth');
const Settings = require('../models/Settings');

const ML_API_URL = process.env.ML_API_URL || 'http://localhost:5051';

// Timeframes the assistant can reason over. This was previously capped at 1-10
// MINUTES of 1m candles — noise, and far too short to say anything meaningful
// about a model whose prediction horizon is 24 hours.
const TIMEFRAMES = {
    '1h':  { interval: '1m',  limit: 60,  label: 'last hour' },
    '4h':  { interval: '5m',  limit: 48,  label: 'last 4 hours' },
    '24h': { interval: '15m', limit: 96,  label: 'last 24 hours' },
    '7d':  { interval: '1h',  limit: 168, label: 'last 7 days' },
    '30d': { interval: '4h',  limit: 180, label: 'last 30 days' },
};

/** The model's current signal for this coin, plus the measured worth of that
 *  signal. Returns null on any failure — the assistant still works without it,
 *  it just cannot discuss the prediction. */
// Independent timeouts per call, deliberately: sharing one AbortController let
// the slow /predict abort the fast /stats, costing the assistant its accuracy
// context for no reason.
async function get(path, ms) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    try {
        const res = await fetch(`${ML_API_URL}${path}`, { signal: controller.signal });
        return res.ok ? await res.json() : null;
    } catch {
        return null;                           // unreachable or timed out
    } finally {
        clearTimeout(timer);
    }
}

// /predict rebuilds ~45 days of features on every request and measures ~20s.
// Blocking a chat reply on that is unusable, and the signal changes far slower
// than people type, so it is cached and refreshed out of band: a turn uses
// whatever is cached and never waits long for a miss.
const SIGNAL_TTL_MS = 5 * 60 * 1000;
const signalCache = new Map();                 // symbol -> { at, value }
const inFlight = new Set();

function refreshSignal(symbol) {
    if (inFlight.has(symbol)) return;
    inFlight.add(symbol);
    get(`/predict?symbol=${symbol}`, 30000)
        .then(v => { if (v?.signal) signalCache.set(symbol, { at: Date.now(), value: v }); })
        .finally(() => inFlight.delete(symbol));
}

async function fetchSignalContext(symbol) {
    const cached = signalCache.get(symbol);
    const fresh = cached && Date.now() - cached.at < SIGNAL_TTL_MS;
    if (!fresh) refreshSignal(symbol);         // fire-and-forget

    // Give a cold cache a brief chance to land, then continue regardless.
    if (!cached) await new Promise(r => setTimeout(r, 2500));

    const stats = await get('/stats', 5000);
    return {
        signal: (signalCache.get(symbol) || cached)?.value || null,
        tradeability: stats?.tradeability || null,
    };
}

/** Free users get a small daily message allowance; premium is unlimited.
 *  Usage is tracked on the user document keyed by UTC date, so the counter
 *  resets naturally at midnight without a scheduled job. */
async function enforceChatQuota(req, res, next) {
    if (req.user.hasPremium()) {
        req.chatQuota = { limit: null, remaining: null };
        return next();
    }
    let limit = 5;
    if (dbReady()) {
        try { limit = (await Settings.get()).freeChatDailyLimit; } catch { /* default */ }
    }
    const today = new Date().toISOString().slice(0, 10);
    if (req.user.chatUsage?.date !== today) {
        req.user.chatUsage = { date: today, count: 0 };
    }
    if (req.user.chatUsage.count >= limit) {
        return res.status(403).json({
            success: false,
            upgradeRequired: true,
            error: `Free plan is limited to ${limit} AI chat messages per day. Upgrade to Premium for unlimited chat.`,
            quota: { limit, remaining: 0 },
        });
    }
    req.user.chatUsage.count += 1;
    await req.user.save();
    req.chatQuota = { limit, remaining: limit - req.user.chatUsage.count };
    next();
}

// POST /api/crypto-chat — login required; free tier has a daily quota
router.post('/', requireAuth, enforceChatQuota, async (req, res) => {
    try {
        const { coin, timeframe = '24h', userQuestion, history = [] } = req.body;

        if (!coin || !userQuestion) {
            return res.status(400).json({ success: false, error: 'Missing coin or question' });
        }

        const tf = TIMEFRAMES[timeframe] || TIMEFRAMES['24h'];
        const symbol = coin.toUpperCase().endsWith('USDT')
            ? coin.toUpperCase() : `${coin.toUpperCase()}USDT`;

        const [candles, context] = await Promise.all([
            getHistoricalCandles(symbol, tf.interval, tf.limit),
            fetchSignalContext(symbol),
        ]);

        if (!candles || candles.length === 0) {
            return res.json({ success: true, data: 'No market data available for this query right now.' });
        }

        const closes = candles.map(c => c.close);
        const open = candles[0].open;
        const close = closes[closes.length - 1];
        const high = Math.max(...candles.map(c => c.high));
        const low = Math.min(...candles.map(c => c.low));
        const volume = candles.reduce((s, c) => s + c.volume, 0);

        // Spread of returns over the window — lets the assistant say "quiet" or
        // "choppy" from data instead of inventing an impression.
        const rets = closes.slice(1).map((c, i) => Math.log(c / closes[i]));
        const mean = rets.reduce((a, b) => a + b, 0) / (rets.length || 1);
        const vol = Math.sqrt(rets.reduce((a, r) => a + (r - mean) ** 2, 0) / (rets.length || 1));

        const dp = close < 10 ? 4 : 2;
        const marketData = {
            open: open.toFixed(dp),
            close: close.toFixed(dp),
            high: high.toFixed(dp),
            low: low.toFixed(dp),
            volume: volume.toFixed(2),
            priceChangePercent: (((close - open) / open) * 100).toFixed(2),
            rangePercent: (((high - low) / low) * 100).toFixed(2),
            volatilityPercent: (vol * 100).toFixed(3),
            windowLabel: tf.label,
            candleCount: candles.length,
        };

        const response = await generateCryptoChatResponse({
            coin: coin.toUpperCase(),
            marketData,
            userQuestion,
            history: Array.isArray(history) ? history.slice(-6) : [],
            signal: context?.signal || null,
            tradeability: context?.tradeability || null,
        });

        res.json({
            success: true,
            data: response,
            context: {
                signal: context?.signal?.signal || null,
                confidence: context?.signal?.confidence ?? null,
                window: tf.label,
            },
            quota: req.chatQuota,
        });
    } catch (error) {
        console.error('Crypto Chat error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
