const express = require('express');
const router = express.Router();
const { optionalAuth } = require('../middleware/auth');

const ML_API_URL = process.env.ML_API_URL || 'http://localhost:5051';

/** The literature review and historical measurements are free (they document
 *  the science); the forward-looking outputs — coupling state, divergence
 *  watch and the propagation forecast — are the paid product. */
function redactForTier(data, isPremium) {
    if (isPremium || !data) return data;
    const copy = { ...data };
    if (copy.predictions) copy.predictions = { locked: true };
    return copy;
}

// The research artifacts are static files regenerated only when the analysis
// scripts run, so they are cached aggressively here. Without this every page
// view would pay a round trip to the ML API for bytes that change maybe weekly.
const TTL_MS = 10 * 60 * 1000;
let cache = { at: 0, data: null };

// GET /api/research
router.get('/', optionalAuth, async (req, res) => {
    const isPremium = !!(req.user && req.user.hasPremium());
    if (cache.data && Date.now() - cache.at < TTL_MS) {
        return res.json({ success: true, data: redactForTier(cache.data, isPremium), cached: true });
    }
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 10000);
        const mlRes = await fetch(`${ML_API_URL}/research`, { signal: controller.signal });
        clearTimeout(timer);

        if (!mlRes.ok) {
            // Serve stale data rather than an error page if we have any: the
            // research content is historical and does not expire meaningfully.
            if (cache.data) {
                return res.json({ success: true, data: redactForTier(cache.data, isPremium), cached: true, stale: true });
            }
            return res.status(mlRes.status).json({
                success: false,
                error: mlRes.status === 503
                    ? 'Research artifacts have not been generated yet.'
                    : 'ML API returned an error.',
            });
        }
        const data = await mlRes.json();
        cache = { at: Date.now(), data };
        res.json({ success: true, data: redactForTier(data, isPremium), cached: false });
    } catch (error) {
        console.error('Research route error:', error.message);
        if (cache.data) {
            return res.json({ success: true, data: redactForTier(cache.data, isPremium), cached: true, stale: true });
        }
        res.status(503).json({ success: false, error: 'ML API unavailable.' });
    }
});

module.exports = router;
