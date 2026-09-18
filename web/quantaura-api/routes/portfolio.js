const express = require('express');
const router = express.Router();

/**
 * The paper portfolio: a virtual $10k traded mechanically on the channel's
 * committed BTC calls, fees included, next to buy-and-hold.
 *
 * The numbers are computed in the quantaura-youtube repo — the same append-only
 * prediction log the videos grade on camera — and published in its committed
 * state/scoreboard.json. This route only relays that file: one log, one grader,
 * so the site can never show a curve the videos would disagree with.
 *
 * Reading a private repo needs SCOREBOARD_TOKEN in the API's .env — a
 * fine-grained GitHub PAT with contents:read on that one repo. Until it is
 * set the route reports pending rather than erroring: the page renders an
 * honest "not configured yet" state.
 */
const REPO = process.env.SCOREBOARD_REPO || 'ak7256369/quantaura-youtube';
const FILE = 'state/scoreboard.json';

// The scoreboard changes once a day (plus a grading pass), so cache hard.
// Serve stale on upstream failure: yesterday's record is still true.
const TTL_MS = 10 * 60 * 1000;
let cache = { at: 0, data: null };

// GET /api/portfolio — public, no auth: the record is the marketing.
router.get('/', async (req, res) => {
    const token = process.env.SCOREBOARD_TOKEN;
    if (!token) {
        return res.json({ success: true, data: { pending: true } });
    }
    if (cache.data && Date.now() - cache.at < TTL_MS) {
        return res.json({ success: true, data: cache.data, cached: true });
    }
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 10000);
        const ghRes = await fetch(
            `https://api.github.com/repos/${REPO}/contents/${FILE}`,
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: 'application/vnd.github.raw+json',
                    'User-Agent': 'quantaura-api',
                },
                signal: controller.signal,
            },
        );
        clearTimeout(timer);

        if (!ghRes.ok) {
            if (cache.data) {
                return res.json({ success: true, data: cache.data, cached: true, stale: true });
            }
            console.error(`Portfolio route: GitHub returned ${ghRes.status}`);
            return res.json({ success: true, data: { pending: true } });
        }
        const board = await ghRes.json();
        cache = { at: Date.now(), data: board };
        res.json({ success: true, data: board, cached: false });
    } catch (error) {
        console.error('Portfolio route error:', error.message);
        if (cache.data) {
            return res.json({ success: true, data: cache.data, cached: true, stale: true });
        }
        res.json({ success: true, data: { pending: true } });
    }
});

module.exports = router;
