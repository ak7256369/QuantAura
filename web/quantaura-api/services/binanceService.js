const axios = require('axios');
const WebSocket = require('ws');

const BINANCE_REST = 'https://data-api.binance.vision/api/v3';
const BINANCE_WS = process.env.BINANCE_WS_URL || 'wss://stream.binance.com:9443/ws';

/**
 * Fetch historical OHLCV candles from Binance REST API
 */
async function getHistoricalCandles(symbol = 'BTCUSDT', interval = '4h', limit = 500, startTime = null) {
    try {
        // startTime lets a caller ask for a specific historical window rather
        // than the most recent `limit` candles. The channel pipeline needs it
        // to price a past call at its exact 24h horizon: Binance geo-blocks
        // GitHub's US runners with HTTP 451, so this server — which can reach
        // Binance — is the only price source the pipeline can use, and it must
        // be able to answer "what was BTC worth at this timestamp".
        const params = { symbol: symbol.toUpperCase(), interval, limit };
        if (startTime) params.startTime = Number(startTime);
        const res = await axios.get(`${BINANCE_REST}/klines`, { params });
        return res.data.map(k => ({
            openTime: k[0],
            open: parseFloat(k[1]),
            high: parseFloat(k[2]),
            low: parseFloat(k[3]),
            close: parseFloat(k[4]),
            volume: parseFloat(k[5]),
            closeTime: k[6],
        }));
    } catch (error) {
        console.error('Binance REST error:', error.message);
        return [];
    }
}

// Derivatives live on fapi, which has no data-api.binance.vision equivalent and
// geo-blocks US cloud IPs with 451 — measured from a GitHub runner, along with
// fapi1/2/3 (302 to the same block). This server is not blocked, so it is the
// only path by which the trainer can reach funding rates, open interest and the
// long/short ratios. Those are five real model features; zero-filling them
// would degrade the models silently, which is precisely what the pipeline's
// leak-free invariants exist to prevent.
const BINANCE_FAPI = 'https://fapi.binance.com';

// A deliberately narrow allowlist rather than an open proxy: only the four
// datasets the feature builder consumes, each pinned to its upstream path.
const DERIVATIVE_DATASETS = {
    fundingRate: '/fapi/v1/fundingRate',
    openInterestHist: '/futures/data/openInterestHist',
    globalLongShortAccountRatio: '/futures/data/globalLongShortAccountRatio',
    takerlongshortRatio: '/futures/data/takerlongshortRatio',
};

/**
 * Proxy one futures dataset, returning Binance's response body untouched so the
 * Python caller parses it exactly as it would a direct call.
 * Throws on failure — the caller decides whether that is fatal.
 */
async function getDerivatives(dataset, { symbol, period, limit, startTime }) {
    const path = DERIVATIVE_DATASETS[dataset];
    if (!path) throw new Error(`Unknown derivatives dataset: ${dataset}`);

    const params = { symbol: String(symbol || 'BTCUSDT').toUpperCase() };
    // Cap the limit at Binance's own maximum: an uncapped passthrough would let
    // a caller ask this server for arbitrarily large upstream fetches.
    params.limit = Math.min(Math.max(parseInt(limit, 10) || 500, 1), 1000);
    if (period) params.period = period;
    if (startTime) params.startTime = Number(startTime);

    const res = await axios.get(`${BINANCE_FAPI}${path}`, { params, timeout: 20000 });
    return res.data;
}

/**
 * Create a WebSocket connection for live kline data.
 *
 * Returns a controller with a single close() method. close() is a real stop
 * switch: it prevents any pending reconnect from firing, so an intentional
 * teardown (client unsubscribe/disconnect) does not spawn a self-reconnecting
 * orphan stream. Reconnects reuse this same controller, so the caller's
 * reference stays valid across drops.
 */
function createKlineStream(symbol = 'btcusdt', interval = '4h', onCandle) {
    let ws = null;
    let closed = false;
    let reconnectTimer = null;

    function connect() {
        if (closed) return;
        const wsUrl = `${BINANCE_WS}/${symbol.toLowerCase()}@kline_${interval}`;
        ws = new WebSocket(wsUrl);

        ws.on('open', () => console.log(`📡 Binance WS connected: ${symbol}@${interval}`));
        ws.on('message', (data) => {
            // Binance can send non-JSON/partial frames; an unguarded JSON.parse
            // here throws synchronously inside the emitter → uncaughtException →
            // process crash. Swallow the bad frame instead.
            let parsed;
            try {
                parsed = JSON.parse(data);
            } catch (err) {
                console.error('Binance WS parse error:', err.message);
                return;
            }
            const k = parsed && parsed.k;
            if (k) {
                onCandle({
                    openTime: k.t,
                    open: parseFloat(k.o),
                    high: parseFloat(k.h),
                    low: parseFloat(k.l),
                    close: parseFloat(k.c),
                    volume: parseFloat(k.v),
                    closeTime: k.T,
                    isClosed: k.x,
                });
            }
        });
        ws.on('error', (err) => console.error('Binance WS error:', err.message));
        ws.on('close', () => {
            if (closed) return; // intentional teardown — do not reconnect
            console.log('Binance WS closed, reconnecting in 5s...');
            reconnectTimer = setTimeout(connect, 5000);
        });
    }

    connect();

    return {
        close() {
            closed = true;
            if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
            if (ws) { try { ws.close(); } catch (_) { /* already closing */ } }
        },
    };
}

module.exports = { getHistoricalCandles, createKlineStream, getDerivatives, DERIVATIVE_DATASETS };
