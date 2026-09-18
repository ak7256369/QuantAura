require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const cron = require('node-cron');
const connectDB = require('./config/db');
const { createKlineStream } = require('./services/binanceService');
const { fetchAllNews, cacheNews } = require('./services/newsService');

// Process-level backstop: one async fault (a dropped upstream socket, a bad
// third-party frame) should not take the whole API down for every user. The
// real fixes belong at the source; these handlers keep a single unhandled
// error from crash-looping the process. We log and keep serving rather than
// exit — the known crash sources have been guarded at their origin.
process.on('unhandledRejection', (reason) => {
    console.error('❌ Unhandled promise rejection:', reason);
});
process.on('uncaughtException', (err) => {
    console.error('❌ Uncaught exception:', err);
});

const app = express();
const server = http.createServer(app);

// Socket.IO for real-time data
const io = new Server(server, {
    cors: { origin: ['https://quantaura.tech', 'https://www.quantaura.tech'], methods: ['GET', 'POST', 'OPTIONS'] }
});

// Middleware
app.use(cors({ origin: ['https://quantaura.tech', 'https://www.quantaura.tech'] }));
app.use(express.json());

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/billing', require('./routes/billing'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/market', require('./routes/market'));
app.use('/api/signals', require('./routes/signals'));
app.use('/api/news', require('./routes/news'));
app.use('/api/crypto-chat', require('./routes/chat'));
app.use('/api/research', require('./routes/research'));
app.use('/api/telegram', require('./routes/telegram'));
app.use('/api/portfolio', require('./routes/portfolio'));
app.use('/api/blog', require('./routes/blog'));
app.use('/api/download', require('./routes/download'));

// Health checks & Root
app.get('/', (req, res) => res.json({ message: 'QuantAura API is Online and Running!', status: 'active' }));
app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date() }));
app.get('/api/debug-binance', async (req, res) => {
    try {
        const axios = require('axios');
        const r = await axios.get('https://api.binance.com/api/v3/ping');
        res.json({ success: true, status: r.status });
    } catch (e) {
        res.json({ success: false, error: e.message, response: e.response?.status });
    }
});

// Socket.IO — live candle streaming
io.on('connection', (socket) => {
    console.log(`🔌 Client connected: ${socket.id}`);
    let ws = null;

    socket.on('subscribe', (payload = {}) => {
        const { symbol, interval } = payload;
        // Guard against malformed payloads: a missing symbol would throw
        // symbol.toLowerCase() inside this handler → uncaughtException → crash.
        if (typeof symbol !== 'string' || typeof interval !== 'string' || !symbol || !interval) {
            console.warn(`⚠️ Ignoring invalid subscribe payload from ${socket.id}`);
            return;
        }
        console.log(`📡 Subscribing to ${symbol}@${interval}`);
        if (ws) ws.close();
        ws = createKlineStream(symbol.toLowerCase(), interval, (candle) => {
            socket.emit('candle', candle);
        });
    });

    // socket.io surfaces transport errors on the socket; without a listener an
    // 'error' event can propagate as an uncaughtException.
    socket.on('error', (err) => console.error(`Socket ${socket.id} error:`, err.message));

    socket.on('disconnect', () => {
        console.log(`🔌 Client disconnected: ${socket.id}`);
        if (ws) ws.close();
    });
});

// Cron: Fetch news every 5 minutes
cron.schedule('*/5 * * * *', async () => {
    console.log('⏰ Cron: Fetching news...');
    try {
        const articles = await fetchAllNews();
        await cacheNews(articles);
        console.log(`Cached ${articles.length} news articles`);
    } catch (err) {
        console.error('Cron news error:', err.message);
    }
});

// Start server
const PORT = process.env.PORT || 5000;

async function start() {
    // Connect to MongoDB (optional — app works without it via fallbacks,
    // but accounts/payments require it)
    try {
        await connectDB();
        await require('./utils/seedAdmin')();
        await require('./utils/migrateSettings')();
    } catch (err) {
        console.warn('⚠️ MongoDB not available, running with in-memory only');
    }

    server.listen(PORT, () => {
        console.log(`\n🚀 QuantAura API running on http://localhost:${PORT}`);
        console.log(`📡 WebSocket ready on ws://localhost:${PORT}`);
        console.log(`📊 Market API: http://localhost:${PORT}/api/market/candles?symbol=BTCUSDT`);
        console.log(`📰 News API: http://localhost:${PORT}/api/news`);
        console.log(`🤖 Signals API: http://localhost:${PORT}/api/signals?symbol=BTCUSDT\n`);
    });
}

start();
