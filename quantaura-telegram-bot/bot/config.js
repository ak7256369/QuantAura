/** Bot configuration, all of it environment-driven. */

// Must stay in step with quantaura-ml's config.SYMBOLS — the bot asks for each
// symbol by name rather than reading a universe off the API, so anything absent
// here is never requested and silently missing from the digest. DOT and LINK
// were exactly that gap until 2026-08-08.
const SYMBOLS = (process.env.BOT_SYMBOLS || 'BTCUSDT,ETHUSDT,BNBUSDT,SOLUSDT,XRPUSDT,ADAUSDT,DOGEUSDT,AVAXUSDT,DOTUSDT,LINKUSDT')
    .split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);

// Display names, so messages say "Bitcoin" rather than "BTCUSDT". Unknown
// symbols fall back to the ticker with the quote asset stripped.
const NAMES = {
    BTCUSDT: 'Bitcoin', ETHUSDT: 'Ethereum', BNBUSDT: 'BNB', SOLUSDT: 'Solana',
    XRPUSDT: 'XRP', ADAUSDT: 'Cardano', DOGEUSDT: 'Dogecoin', AVAXUSDT: 'Avalanche',
    LINKUSDT: 'Chainlink', DOTUSDT: 'Polkadot',
};

module.exports = {
    token: process.env.TELEGRAM_BOT_TOKEN || '',
    botUsername: (process.env.TELEGRAM_BOT_USERNAME || '').replace(/^@/, ''),

    // Public broadcast channel — the free funnel. Post the BTC call with the
    // detail redacted, exactly as /api/signals does for an anonymous caller.
    // Unset simply disables the public post; the premium DMs are unaffected.
    freeChannelId: process.env.TELEGRAM_FREE_CHANNEL_ID || '',

    // The bot reads signals over the same public HTTP contract the website and
    // the video pipeline use, rather than calling ml-api directly, so tier
    // redaction and ensemble shaping have exactly one implementation.
    //
    // Deliberately no default. This used to fall back to 127.0.0.1:5000, and on
    // a VPS that hosts several unrelated sites port 5000 belongs to one of them:
    // the bot spent every poll fetching a stranger's HTML homepage, which parses
    // to {} and surfaced as the uninformative "signals API returned 200". A
    // wrong base is indistinguishable from a broken API at the call site, so
    // guessing one is worse than refusing to start. bot.js enforces this.
    apiBase: (process.env.BOT_API_BASE || '').trim().replace(/\/+$/, ''),
    // Whose premium view the bot reads. Left unset it uses the seeded admin,
    // which hasPremium() already treats as premium — so this needs no config.
    serviceEmail: (process.env.BOT_SERVICE_EMAIL || '').toLowerCase(),

    siteUrl: process.env.SITE_URL || 'https://quantaura.tech',

    // The ecosystem's other public surfaces. The same call goes out on all of
    // them, so each one points at the rest. Duplicated by necessity in the
    // sibling repos (separate deployments, no shared module):
    //   web/quantaura/src/lib/social.ts · quantaura-youtube/config.yaml
    //   quantaura-x/config.yaml
    // Public handles, not secrets — hardcoded so an unset env var on the VPS
    // cannot silently strip the links out of every broadcast.
    links: {
        youtube: 'https://www.youtube.com/@quantaura_ml',
        // The handle the X pipeline authenticates as, not a brand name — see
        // the note in web/quantaura/src/lib/social.ts before changing it.
        x: 'https://x.com/abdulla05775100',
    },

    symbols: SYMBOLS,
    names: NAMES,

    // Poll a few minutes after each 4h candle close (00/04/08/12/16/20 UTC).
    // Polling more often burns ml-api CPU for nothing: the models re-predict on
    // closed 4h candles, so between closes the call is the same call.
    pollMinuteOffset: Number(process.env.BOT_POLL_MINUTE || 6),
    // UTC hour for the daily digest. 12:00 lands mid-morning in the Americas,
    // afternoon in Europe and evening in Pakistan — the three places the site's
    // traffic actually comes from.
    digestHourUtc: Number(process.env.BOT_DIGEST_HOUR_UTC || 12),

    // Broadcast pacing. Telegram tolerates ~30 messages/second to distinct
    // users; 15 leaves headroom so a burst never costs a 429 mid-send.
    sendsPerSecond: Number(process.env.BOT_SENDS_PER_SECOND || 15),

    // Set BOT_DRY_RUN=1 to run every code path but print messages instead of
    // sending them. This is how the pipeline is tested without a live token.
    dryRun: process.env.BOT_DRY_RUN === '1',

    displayName(symbol) {
        return NAMES[symbol] || symbol.replace(/USDT$/, '');
    },
};
