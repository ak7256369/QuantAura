const express = require('express');
const router = express.Router();
const { getDummySignalHistory } = require('../utils/dummyData');
const { generateSignalExplanation } = require('../services/llmService');
const { generateTechnicalAnalysis } = require('../services/taService');
const { optionalAuth, requirePremium, dbReady } = require('../middleware/auth');
const Settings = require('../models/Settings');

const ML_API_URL = process.env.ML_API_URL || 'http://localhost:5051';
// /predict is not a lookup: it fetches fresh candles, rebuilds the full feature
// set and runs four models. That is ~3s warm, but the BTC context cache in
// serve.py expires every 300s, so a handful of calls a day legitimately pay a
// cold ~10s — longer on this VPS than on a workstation.
//
// This was 15s, which left no margin at all. Every overrun is invisible to the
// caller: getMLPrediction() returns null and the route silently answers with
// the TA heuristic instead of the ensemble, so the site reports a signal the
// models never produced. A slow response is far better than a wrong one.
const ML_API_TIMEOUT = 25000;

// Last known-good model stats. /stats used to hard-500 whenever the Python ML
// service was briefly unreachable (a gunicorn restart, an OOM recovery), which
// surfaced as a broken accuracy display on the site. Serving the last good
// payload — explicitly flagged stale, with the timestamp it was fetched — keeps
// the page alive through a short ML blip. These are still the real ensemble's
// own numbers, only cached, so the honesty guarantee holds.
let lastGoodStats = null;      // the `data` object from a successful /stats
let lastGoodStatsAt = null;    // Date of that success

// Which symbols the free tier gets signals for. Cached — this is read on
// every signal request and the admin changes it rarely.
const DEFAULT_FREE_SYMBOLS = ['BTCUSDT', 'ETHUSDT'];
let freeSymbolsCache = { at: 0, value: DEFAULT_FREE_SYMBOLS };
async function getFreeSymbols() {
    if (Date.now() - freeSymbolsCache.at < 60000) return freeSymbolsCache.value;
    if (!dbReady()) return DEFAULT_FREE_SYMBOLS;
    try {
        const s = await Settings.get();
        freeSymbolsCache = { at: Date.now(), value: s.freeSymbols || DEFAULT_FREE_SYMBOLS };
    } catch {
        // keep previous value
    }
    return freeSymbolsCache.value;
}

/**
 * Try to get predictions from the Python ML API (4-model ensemble).
 * Returns null if ML API is unavailable — caller falls back to TA heuristic.
 */
async function getMLPrediction(symbol) {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), ML_API_TIMEOUT);

        const res = await fetch(`${ML_API_URL}/predict?symbol=${symbol}`, {
            signal: controller.signal,
        });
        clearTimeout(timeout);

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            console.warn(`ML API returned ${res.status}: ${err.error || 'unknown'}`);
            return null;
        }

        return await res.json();
    } catch (err) {
        if (err.name === 'AbortError') {
            console.warn('ML API request timed out');
        } else {
            console.warn(`ML API unavailable: ${err.message}`);
        }
        return null;
    }
}

// GET /api/signals?symbol=BTCUSDT
// Free tier: signal direction + indicators for the free symbols only.
// Premium: every symbol, plus confidence, per-model breakdown, probability
// breakdown, ensemble weights and the written explanation.
router.get('/', optionalAuth, async (req, res) => {
    try {
        const { symbol = 'BTCUSDT' } = req.query;

        const isPremium = !!(req.user && req.user.hasPremium());
        if (!isPremium) {
            const freeSymbols = await getFreeSymbols();
            if (!freeSymbols.includes(symbol.toUpperCase())) {
                // Locked coin — tell the frontend to render an upgrade card
                // instead of a signal. Deliberately not an HTTP error: this is
                // the expected response for the free tier, not a failure.
                return res.json({
                    success: true,
                    data: { symbol, locked: true, tier: 'free', upgradeRequired: true },
                });
            }
        }

        // 1. Try the real ML ensemble first
        const mlResult = await getMLPrediction(symbol);

        let signal;

        if (mlResult && mlResult.signal) {
            // ML API returned a valid prediction — use it
            console.log(`✅ ML prediction for ${symbol}: ${mlResult.signal} (${mlResult.confidence})%`);

            // Fetch live TA indicators for the explanation (even with ML signal)
            let taData;
            try {
                taData = await generateTechnicalAnalysis(symbol, '4h');
            } catch {
                taData = { indicators: {}, price: 0 };
            }

            signal = {
                symbol,
                signal: mlResult.signal,
                confidence: mlResult.confidence,
                indicators: taData.indicators,
                price: taData.price,
                source: 'ml_ensemble',
                ensemble: {
                    lstm: { signal: mlResult.per_model?.lstm || mlResult.signal, confidence: Math.round(mlResult.breakdown?.BUY || 0) },
                    xgboost: { signal: mlResult.per_model?.xgboost || mlResult.signal, confidence: Math.round(mlResult.breakdown?.HOLD || 0) },
                    transformer: { signal: mlResult.per_model?.transformer || mlResult.signal, confidence: Math.round(mlResult.breakdown?.SELL || 0) },
                    kan: { signal: mlResult.per_model?.kan || mlResult.signal, confidence: mlResult.confidence },
                },
                breakdown: mlResult.breakdown,
                weights_used: mlResult.weights_used,
            };
        } else {
            // ML API unavailable — fall back to TA heuristic
            console.log(`⚠️ ML API unavailable for ${symbol}, using TA fallback`);
            signal = await generateTechnicalAnalysis(symbol, '4h');
            signal.source = 'ta_fallback';
        }

        // Add macro context
        signal.macro = {
            "Federal Funds Rate": { "value": "5.25%", "change": "0", "direction": "neutral" },
            "CPI YoY": { "value": "3.1%", "change": "-0.1", "direction": "bullish" }
        };

        // Generate quick inline explanation (non-blocking — don't wait for LLM)
        const rsiVal = signal.indicators?.['RSI (14)']?.value || '50';
        const rsiStatus = signal.indicators?.['RSI (14)']?.status || 'neutral';
        const macdNote = signal.indicators?.['MACD']?.note || 'Neutral';
        if (signal.signal === 'BUY') {
            signal.explanation = `${symbol} presents a compelling long opportunity with ${signal.confidence}% confidence. RSI at ${rsiVal} sits in ${rsiStatus} territory, while MACD signals ${macdNote.toLowerCase()}.`;
        } else if (signal.signal === 'SELL') {
            signal.explanation = `Caution advised: ${symbol} triggered a SELL with ${signal.confidence}% confidence. RSI at ${rsiVal} (${rsiStatus}), alongside ${macdNote.toLowerCase()} on the MACD.`;
        } else {
            signal.explanation = `Market conditions dictate a HOLD for ${symbol} with ${signal.confidence}% confidence. Technicals are mixed (${rsiStatus} RSI, ${macdNote.toLowerCase()} MACD) favoring capital preservation.`;
        }

        // Fire-and-forget: try to get a better LLM explanation (won't block the response)
        generateSignalExplanation(signal.symbol, signal.signal, signal.confidence, signal.indicators, signal.macro)
            .then(() => {}) // discard — used for logging/caching if needed later
            .catch(() => {});

        // Tier redaction — the free tier keeps the direction and the raw
        // indicators (computable from public data anyway) but loses the
        // model-derived detail that is the paid product.
        if (isPremium) {
            signal.tier = 'premium';
        } else {
            signal.tier = 'free';
            signal.confidence = null;
            signal.explanation = null;
            delete signal.ensemble;
            delete signal.breakdown;
            delete signal.weights_used;
            signal.locked_fields = ['confidence', 'ensemble', 'breakdown', 'weights_used', 'explanation'];
        }

        res.json({ success: true, data: signal });
    } catch (error) {
        console.error('Error generating signal:', error);
        res.status(500).json({ success: false, error: 'Failed to generate signal', details: error.message, stack: error.stack });
    }
});

// GET /api/signals/history — premium: full signal history
router.get('/history', requirePremium, (req, res) => {
    // Keep history as dummy for now unless we query a database with historical ML outputs
    const history = getDummySignalHistory();
    res.json({ success: true, data: history });
});
// GET /api/signals/backtest — premium: strategy backtesting
router.get('/backtest', requirePremium, async (req, res) => {
    const { symbol = 'BTCUSDT', days = 30 } = req.query;
    try {
        const mlUrl = `${ML_API_URL}/backtest?symbol=${symbol}&days=${days}`;
        const mlResponse = await fetch(mlUrl);
        const mlData = await mlResponse.json();

        if (!mlResponse.ok) {
            return res.status(mlResponse.status).json({ success: false, error: mlData.error || 'ML Server Error' });
        }

        res.json({ success: true, data: mlData });
    } catch (error) {
        console.error('Error running backtest:', error);
        res.status(500).json({ success: false, error: 'Failed to run backtest', details: error.message });
    }
});

// GET /api/signals/stats — real model performance metrics from ML API
router.get('/stats', async (req, res) => {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), ML_API_TIMEOUT);

        const mlRes = await fetch(`${ML_API_URL}/stats`, {
            signal: controller.signal,
        });
        clearTimeout(timeout);

        if (!mlRes.ok) {
            const err = await mlRes.json().catch(() => ({}));
            return res.status(mlRes.status).json({ success: false, error: err.error || 'ML API error' });
        }

        const data = await mlRes.json();
        lastGoodStats = data;
        lastGoodStatsAt = new Date();
        res.json({ success: true, data });
    } catch (error) {
        console.error('Error fetching model stats:', error.message);
        // ML service briefly unreachable — serve the last known-good stats
        // rather than breaking the page, clearly marked stale so the client can
        // show "as of <time>". Only 503 if we have nothing cached yet.
        if (lastGoodStats) {
            return res.json({
                success: true,
                data: lastGoodStats,
                stale: true,
                asOf: lastGoodStatsAt,
            });
        }
        res.status(503).json({ success: false, error: 'Model stats temporarily unavailable' });
    }
});

module.exports = router;
