/**
 * The bot's view of the model's calls.
 *
 * It reads /api/signals over HTTP as a premium caller rather than importing the
 * route or calling ml-api directly. That costs a loopback request per symbol and
 * buys the guarantee that the bot, the website and the video pipeline are all
 * looking at literally the same response shape — including the redaction rules.
 * If signals.js ever changes what "premium" means, the bot follows for free.
 *
 * Authentication is a self-signed JWT for a service account rather than a stored
 * password: the bot already holds JWT_SECRET and a database connection, so a
 * password in the environment would be a second secret protecting nothing.
 */
const User = require('../models/User');
const { signToken } = require('../lib/token');
const config = require('./config');

class SignalSourceError extends Error {}

let cached = { token: null, at: 0 };
const TOKEN_TTL_MS = 6 * 3600 * 1000;   // re-mint well inside the 30d expiry

async function serviceToken() {
    if (cached.token && Date.now() - cached.at < TOKEN_TTL_MS) return cached.token;

    const query = config.serviceEmail
        ? { email: config.serviceEmail }
        : { role: 'admin' };
    const user = await User.findOne(query).sort({ createdAt: 1 });

    if (!user) {
        throw new SignalSourceError(
            config.serviceEmail
                ? `BOT_SERVICE_EMAIL ${config.serviceEmail} matches no account.`
                : 'No admin account found to read premium signals as. Set BOT_SERVICE_EMAIL.',
        );
    }
    if (!user.hasPremium()) {
        throw new SignalSourceError(
            `Service account ${user.email} is not premium — the bot would only see redacted signals.`,
        );
    }

    cached = { token: signToken(user), at: Date.now() };
    return cached.token;
}

/**
 * Fetch one symbol's premium signal.
 *
 * Throws rather than returning a degraded object. A signal the bot cannot fully
 * trust must not reach a paying subscriber wearing the same formatting as one
 * it can — that is the same rule the video pipeline enforces in fetch.py.
 */
async function fetchSignal(symbol, token) {
    const url = `${config.apiBase}/api/signals?symbol=${encodeURIComponent(symbol)}`;
    let res;
    try {
        res = await fetch(url, {
            headers: { Authorization: `Bearer ${token}` },
            // /predict rebuilds features and runs four models; 25s is the
            // route's own upstream timeout, so allow a little more than that.
            signal: AbortSignal.timeout(35000),
        });
    } catch (err) {
        throw new SignalSourceError(`${symbol}: signals API unreachable (${err.message})`);
    }

    const ctype = res.headers.get('content-type') || 'no content-type';
    let body = null;
    try {
        body = await res.json();
    } catch {
        body = null;
    }

    // Separated from the !success case below because the two mean different
    // things and only one is actionable. A 200 carrying HTML is not the API
    // rejecting the call, it is some other server answering — which is what a
    // misconfigured BOT_API_BASE looks like from here. Folding it into
    // "returned 200" cost a day of looking at the wrong process.
    if (body === null) {
        throw new SignalSourceError(
            `${symbol}: ${config.apiBase} answered ${res.status} with ${ctype}, not JSON — BOT_API_BASE may not be pointing at quantaura-api.`,
        );
    }
    if (!res.ok || !body.success) {
        throw new SignalSourceError(`${symbol}: signals API returned ${res.status} ${body.error || ''}`.trim());
    }

    const data = body.data || {};
    if (data.locked) {
        throw new SignalSourceError(`${symbol}: service account is not premium (locked response).`);
    }
    if (!data.signal) {
        throw new SignalSourceError(`${symbol}: response carried no signal.`);
    }
    // The whole product is the four-model ensemble's call. When ml-api is down
    // the route silently substitutes a TA heuristic — publishing that to paying
    // subscribers as "the model's call" would be a lie of omission.
    if (data.source === 'ta_fallback') {
        throw new SignalSourceError(`${symbol}: ml-api unavailable, API served a TA fallback.`);
    }
    if (data.confidence === null || data.confidence === undefined) {
        throw new SignalSourceError(`${symbol}: free-tier response (confidence redacted).`);
    }

    return {
        symbol,
        signal: data.signal,
        confidence: data.confidence,
        price: data.price ?? null,
        breakdown: data.breakdown || {},
        perModel: Object.fromEntries(
            Object.entries(data.ensemble || {}).map(([k, v]) => [k, (v || {}).signal]),
        ),
        indicators: data.indicators || {},
        explanation: data.explanation || '',
        at: new Date(),
    };
}

/**
 * Read every configured symbol, sequentially.
 *
 * Deliberately not Promise.all: ml-api is one process holding four models in
 * ~1GB, and one concurrent /predict per symbol would queue on CPU anyway while
 * risking the 1200M max_memory_restart that PM2 enforces. Sequential is slower
 * on the clock and far kinder to the box — and the clock cost scales with
 * config.symbols, so growing that list lengthens every poll.
 *
 * Returns { signals, failures } — one symbol failing must not cost the rest
 * their update.
 */
async function fetchAll(log = console) {
    const token = await serviceToken();
    const signals = {};
    const failures = [];

    for (const symbol of config.symbols) {
        try {
            signals[symbol] = await fetchSignal(symbol, token);
        } catch (err) {
            log.warn?.(`  ${err.message}`);
            failures.push({ symbol, error: err.message });
        }
    }
    return { signals, failures };
}

module.exports = { fetchAll, fetchSignal, serviceToken, SignalSourceError };
