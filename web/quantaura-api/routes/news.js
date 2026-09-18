const express = require('express');
const router = express.Router();
const News = require('../models/News');
const { fetchAllNews, cacheNews, getCachedNews } = require('../services/newsService');
const { generateNewsSummary } = require('../services/llmService');

// GET /api/news — Get latest cached news
router.get('/', async (req, res) => {
    try {
        const { limit = 30 } = req.query;
        let news = await getCachedNews(limit);

        // If no cached news, fetch fresh
        if (news.length === 0) {
            const articles = await fetchAllNews();
            await cacheNews(articles);
            news = await getCachedNews(limit);
        }

        res.json({ success: true, data: news });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/news/refresh — Force fetch and cache new news
router.post('/refresh', async (req, res) => {
    try {
        const articles = await fetchAllNews();
        await cacheNews(articles);
        res.json({ success: true, message: `Fetched ${articles.length} articles` });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/news/summarize — Generate AI summary for a news article
router.post('/summarize', async (req, res) => {
    try {
        const { title, content, newsId } = req.body;
        const result = await generateNewsSummary(title, content);

        // Update in DB if newsId provided
        if (newsId) {
            await News.findByIdAndUpdate(newsId, {
                aiSummary: result.summary,
                sentiment: result.sentiment,
                impact: result.impact,
                keyFactors: result.keyFactors,
            });
        }

        res.json({ success: true, data: result });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/news/coin-summary — Generate AI summary of news for a specific coin
router.get('/coin-summary', async (req, res) => {
    try {
        const { symbol = 'BTCUSDT' } = req.query;
        const coinName = symbol.replace('USDT', '');

        let newsHeadlines = "";
        try {
            const newsDocs = await getCachedNews(15);
            newsHeadlines = newsDocs.map(n => `- ${n.title}`).join('\n');
        } catch (err) {
            console.error("News fetch error for coin summary:", err.message);
        }

        const { generateCoinNewsSummary } = require('../services/llmService');
        const summary = await generateCoinNewsSummary(coinName, newsHeadlines);

        res.json({ success: true, data: summary });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
