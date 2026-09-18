const axios = require('axios');
const RssParser = require('rss-parser');
const mongoose = require('mongoose');
const News = require('../models/News');

const rssParser = new RssParser();

// In-memory cache for when MongoDB is unavailable
let memoryCache = [];

const RSS_FEEDS = [
    'https://cointelegraph.com/rss',
    'https://www.coindesk.com/arc/outboundfeeds/rss/',
    'https://decrypt.co/feed',
];

/**
 * Fetch news from CryptoPanic API
 */
async function fetchCryptoPanic() {
    const apiKey = process.env.CRYPTOPANIC_API_KEY;
    if (!apiKey || apiKey === 'your_cryptopanic_api_key_here' || apiKey.trim() === '') return [];

    try {
        const res = await axios.get('https://cryptopanic.com/api/v1/posts/', {
            params: { auth_token: apiKey, public: true, kind: 'news', filter: 'hot' }
        });
        return (res.data.results || []).map(item => ({
            title: item.title,
            url: item.url,
            source: item.source?.title || 'CryptoPanic',
            publishedAt: new Date(item.published_at),
            currencies: (item.currencies || []).map(c => c.code),
            sentiment: mapCryptoPanicSentiment(item.votes),
            impact: 'medium',
        }));
    } catch (err) {
        console.error('CryptoPanic fetch error:', err.message);
        return [];
    }
}

function mapCryptoPanicSentiment(votes) {
    if (!votes) return 'neutral';
    const positive = (votes.positive || 0) + (votes.liked || 0);
    const negative = (votes.negative || 0) + (votes.disliked || 0);
    if (positive > negative * 1.5) return 'bullish';
    if (negative > positive * 1.5) return 'bearish';
    return 'neutral';
}

/**
 * Fetch from NewsAPI
 */
async function fetchNewsAPI() {
    const apiKey = process.env.NEWSAPI_KEY;
    if (!apiKey || apiKey === 'your_newsapi_key_here' || apiKey.trim() === '') return [];

    try {
        const res = await axios.get('https://newsapi.org/v2/everything', {
            params: {
                q: 'bitcoin OR ethereum OR crypto',
                sortBy: 'publishedAt',
                pageSize: 20,
                apiKey,
            }
        });
        return (res.data.articles || []).map(a => ({
            title: a.title,
            url: a.url,
            source: a.source?.name || 'NewsAPI',
            publishedAt: new Date(a.publishedAt),
            originalContent: a.description || a.content || '',
            currencies: [],
            sentiment: 'neutral',
            impact: 'medium',
        }));
    } catch (err) {
        console.error('NewsAPI fetch error:', err.message);
        return [];
    }
}

/**
 * Fetch from RSS feeds
 */
async function fetchRSSFeeds() {
    const results = [];
    for (const feedUrl of RSS_FEEDS) {
        try {
            const feed = await rssParser.parseURL(feedUrl);
            for (const item of (feed.items || []).slice(0, 10)) {
                results.push({
                    title: item.title,
                    url: item.link,
                    source: feed.title || feedUrl,
                    publishedAt: new Date(item.pubDate || item.isoDate || Date.now()),
                    originalContent: item.contentSnippet || item.content || '',
                    currencies: [],
                    sentiment: 'neutral',
                    impact: 'medium',
                });
            }
        } catch (err) {
            console.error(`RSS fetch error (${feedUrl}):`, err.message);
        }
    }
    return results;
}

/**
 * Fetch all news sources and deduplicate
 */
async function fetchAllNews() {
    const [cryptoPanic, newsApi, rss] = await Promise.all([
        fetchCryptoPanic(),
        fetchNewsAPI(),
        fetchRSSFeeds(),
    ]);

    const allNews = [...cryptoPanic, ...newsApi, ...rss];

    // Deduplicate by URL
    const seen = new Set();
    const unique = allNews.filter(n => {
        if (seen.has(n.url)) return false;
        seen.add(n.url);
        return true;
    });

    // Sort by date (newest first)
    unique.sort((a, b) => b.publishedAt - a.publishedAt);
    const result = unique.slice(0, 50);
    
    // Update memory cache as secondary backup
    if (result.length > 0) {
        memoryCache = result;
    }
    
    return result;
}

/**
 * Save news to MongoDB (upsert)
 */
async function cacheNews(articles) {
    if (articles.length === 0) return;
    
    // Always update memory cache
    memoryCache = articles;

    // Only try MongoDB if connected
    if (mongoose.connection.readyState !== 1) {
        return;
    }

    for (const article of articles) {
        try {
            // Fire-and-forget upsert: the returned document is unused, so no
            // `new`/`returnDocument` option is needed (dropping it also clears
            // Mongoose's deprecation warning that was flooding the logs).
            await News.findOneAndUpdate(
                { url: article.url },
                article,
                { upsert: true, returnDocument: 'after' }
            );
        } catch (err) {
            // Ignore errors
        }
    }
}

async function getCachedNews(limit = 30) {
    if (mongoose.connection.readyState === 1) {
        try {
            return await News.find().sort({ publishedAt: -1 }).limit(parseInt(limit));
        } catch (err) {
            console.error('DB fetch news error:', err.message);
        }
    }
    return memoryCache.slice(0, limit);
}

module.exports = { 
    fetchAllNews, 
    cacheNews, 
    getCachedNews,
    fetchCryptoPanic, 
    fetchNewsAPI, 
    fetchRSSFeeds 
};
