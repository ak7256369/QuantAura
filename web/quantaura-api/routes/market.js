const express = require('express');
const router = express.Router();
const { getHistoricalCandles, getDerivatives, DERIVATIVE_DATASETS } = require('../services/binanceService');

// GET /api/market/candles?symbol=BTCUSDT&interval=4h&limit=500[&startTime=ms]
router.get('/candles', async (req, res) => {
    try {
        const { symbol = 'BTCUSDT', interval = '4h', limit = 500, startTime } = req.query;
        const candles = await getHistoricalCandles(
            symbol, interval, parseInt(limit), startTime ? parseInt(startTime) : null);

        // getHistoricalCandles logs and returns [] when Binance fails, which
        // reads as "this window is empty" rather than "the fetch broke". A
        // consumer that renders a chart from it would draw nothing and call it
        // success, so an empty result is surfaced as an upstream failure here.
        if (!candles.length) {
            return res.status(502).json({
                success: false,
                error: 'No candles returned from upstream market data.',
            });
        }
        res.json({ success: true, data: candles });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/market/derivatives?dataset=fundingRate&symbol=BTCUSDT&period=4h&limit=500
//
// Futures data for the trainer. Binance's fapi geo-blocks GitHub's runners
// (451, measured), and unlike spot it has no data-api.binance.vision mirror, so
// this server relays it. The body is Binance's own, unmodified, so the Python
// data_sources parse a proxied response exactly as a direct one.
//
// An upstream failure is a 502, never an empty array: the feature builder
// treats missing derivatives as zeros, and a silent zero-fill would train the
// models on inputs that never occur in production.
router.get('/derivatives', async (req, res) => {
    const { dataset, symbol, period, limit, startTime } = req.query;
    if (!DERIVATIVE_DATASETS[dataset]) {
        return res.status(400).json({
            success: false,
            error: `dataset must be one of: ${Object.keys(DERIVATIVE_DATASETS).join(', ')}`,
        });
    }
    try {
        const data = await getDerivatives(dataset, { symbol, period, limit, startTime });
        res.json({ success: true, data });
    } catch (error) {
        console.error(`Derivatives proxy (${dataset}) failed:`, error.message);
        res.status(502).json({ success: false, error: error.message });
    }
});

// GET /api/market/symbols — supported symbols
router.get('/symbols', (req, res) => {
    res.json({
        success: true,
        data: [
            { symbol: 'BTCUSDT', name: 'Bitcoin', icon: '₿', color: '#f7931a' },
            { symbol: 'ETHUSDT', name: 'Ethereum', icon: 'Ξ', color: '#627eea' },
            { symbol: 'BNBUSDT', name: 'BNB', icon: '⬡', color: '#f3ba2f' },
            { symbol: 'SOLUSDT', name: 'Solana', icon: '◎', color: '#9945FF' },
            { symbol: 'XRPUSDT', name: 'Ripple', icon: '✕', color: '#00AAE4' },
            { symbol: 'ADAUSDT', name: 'Cardano', icon: '₳', color: '#0033AD' },
            { symbol: 'DOGEUSDT', name: 'Dogecoin', icon: 'Ð', color: '#C2A633' },
            { symbol: 'AVAXUSDT', name: 'Avalanche', icon: '▲', color: '#E84142' },
        ]
    });
});

module.exports = router;
