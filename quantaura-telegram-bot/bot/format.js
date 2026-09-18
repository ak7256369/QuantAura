/**
 * Message rendering.
 *
 * Two rules run through all of it:
 *
 *  1. Every message carrying a call also carries what that call is worth. The
 *     model's headline regime-F1 reads like a win rate and is not one — the
 *     measured directional accuracy is ~52%. A push notification is the most
 *     persuasive surface this project has, so it is the one place understating
 *     the model matters most.
 *  2. Nothing is ever phrased as an instruction. "BUY" is the name of a regime
 *     class the model outputs, not advice, and the copy has to keep saying so.
 */
const { esc } = require('./client');
const config = require('./config');

const MARK = { BUY: '🟢', SELL: '🔴', HOLD: '🟡' };

const DISCLAIMER = 'Automated research output — not financial advice.';

function mark(signal) {
    return MARK[signal] || '⚪';
}

/** Prices span 5 orders of magnitude across the watchlist, so significant
 *  digits matter more than a fixed decimal count. */
function price(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n === 0) return '—';
    if (n >= 1000) return `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
    if (n >= 1) return `$${n.toFixed(2)}`;
    if (n >= 0.01) return `$${n.toFixed(4)}`;
    return `$${n.toFixed(6)}`;
}

function link(path, label) {
    return `<a href="${config.siteUrl}${path}">${esc(label)}</a>`;
}

/** The one-line footer every signal-bearing message ends with. */
function footer() {
    return `<i>${esc(DISCLAIMER)}</i>`;
}

/**
 * Where else the same call goes out. Deliberately NOT part of footer(): a
 * premium subscriber gets a DM on every flip plus a daily digest, and bolting
 * a promo block onto all of them would turn a paid alert into an ad. This goes
 * on the public-funnel surfaces only — the free channel post and /start.
 */
function crossLinks() {
    return `<i>Same call, other places: <a href="${config.links.youtube}">YouTube</a> · `
        + `<a href="${config.links.x}">X</a> · <a href="${config.siteUrl}">quantaura.tech</a></i>`;
}

// ── premium: a call flipped ────────────────────────────────────────────────

function premiumAlert(prev, next) {
    const name = config.displayName(next.symbol);
    const votes = Object.entries(next.perModel)
        .filter(([, v]) => v)
        .map(([model, v]) => `${esc(model)} ${mark(v)}`)
        .join('  ');

    const lines = [
        `${mark(next.signal)} <b>${esc(name)} — ${esc(prev.signal)} → ${esc(next.signal)}</b>`,
        '',
        `Confidence: <b>${esc(next.confidence)}%</b>`,
        `Price: <b>${esc(price(next.price))}</b>`,
    ];
    if (votes) lines.push(`Models: ${votes}`);

    const b = next.breakdown || {};
    if (b.BUY !== undefined) {
        lines.push(`Probabilities: BUY ${esc(Math.round(b.BUY))}% · HOLD ${esc(Math.round(b.HOLD))}% · SELL ${esc(Math.round(b.SELL))}%`);
    }
    lines.push('', footer());
    return lines.join('\n');
}

// ── premium: the daily digest ──────────────────────────────────────────────

function premiumDigest(signals, { date }) {
    const rows = config.symbols
        .filter((s) => signals[s])
        .map((s) => {
            const sig = signals[s];
            const name = config.displayName(s).padEnd(9).slice(0, 9);
            return `${mark(sig.signal)} <code>${esc(name)}</code> <b>${esc(sig.signal.padEnd(4))}</b> ${esc(sig.confidence)}%  ${esc(price(sig.price))}`;
        });

    if (!rows.length) return null;

    return [
        `📊 <b>Daily calls — ${esc(date)}</b>`,
        '',
        ...rows,
        '',
        `All ${rows.length} symbols, 24h trend-regime horizon.`,
        link('/predictions', 'Open the dashboard →'),
        '',
        footer(),
    ].join('\n');
}

// ── free public channel ────────────────────────────────────────────────────

/**
 * The free post carries the direction and nothing else — the same redaction
 * /api/signals applies to an anonymous caller. Confidence, the per-model votes
 * and the probability split are the paid product, and a channel that leaked
 * them would be undercutting the thing it exists to sell.
 */
function freeTeaser(sig, { changed = false } = {}) {
    const name = config.displayName(sig.symbol);
    return [
        changed
            ? `${mark(sig.signal)} <b>${esc(name)} regime call flipped to ${esc(sig.signal)}</b>`
            : `${mark(sig.signal)} <b>${esc(name)} — today's call: ${esc(sig.signal)}</b>`,
        '',
        `Price: <b>${esc(price(sig.price))}</b>`,
        '',
        'Confidence, the four models\' individual votes and the probability split are Premium.',
        link('/pricing', 'See what Premium adds →'),
        '',
        `The model's running record — wins and losses — is public: ${link('/predictions', 'accuracy report')}`,
        '',
        crossLinks(),
        footer(),
    ].join('\n');
}

// ── on-demand replies ──────────────────────────────────────────────────────

function signalCard(sig) {
    const name = config.displayName(sig.symbol);
    const votes = Object.entries(sig.perModel)
        .filter(([, v]) => v)
        .map(([model, v]) => `${esc(model)} ${mark(v)}`)
        .join('  ');

    const lines = [
        `${mark(sig.signal)} <b>${esc(name)} — ${esc(sig.signal)}</b>`,
        '',
        `Confidence: <b>${esc(sig.confidence)}%</b>`,
        `Price: <b>${esc(price(sig.price))}</b>`,
    ];
    if (votes) lines.push(`Models: ${votes}`);
    lines.push('', footer());
    return lines.join('\n');
}

function lockedCard(symbol) {
    return [
        `🔒 <b>${esc(config.displayName(symbol))}</b>`,
        '',
        'Live calls for this symbol are part of Premium.',
        link('/pricing', 'Upgrade →'),
    ].join('\n');
}

// ── conversational ─────────────────────────────────────────────────────────

function welcome(firstName) {
    return [
        `👋 <b>Welcome${firstName ? `, ${esc(firstName)}` : ''}.</b>`,
        '',
        'This bot delivers QuantAura\'s machine-learning regime calls the moment they change.',
        '',
        '<b>Connect your account to start:</b>',
        `1. Open ${link('/account', 'your account page')}`,
        '2. Tap <b>Connect Telegram</b> to get a code',
        '3. Send it here as <code>/link YOURCODE</code>',
        '',
        'Premium accounts receive all symbols by DM. Free accounts can still use /signals for the calls the website shows publicly.',
        '',
        `<i>Before anything else, please read the ${link('/predictions', 'accuracy report')}. The model is wrong often — around 52% on price direction — and the record is published for exactly that reason.</i>`,
        '',
        crossLinks(),
        footer(),
    ].join('\n');
}

function help() {
    return [
        '<b>Commands</b>',
        '',
        '<code>/link CODE</code> — connect your QuantAura account',
        '<code>/signals</code> — the current calls',
        '<code>/status</code> — your plan and delivery settings',
        '<code>/alerts on|off</code> — push when a call flips',
        '<code>/digest on|off</code> — the once-a-day summary',
        '<code>/unlink</code> — disconnect this Telegram account',
        '<code>/help</code> — this message',
        '',
        `Account and billing live on ${link('/account', 'quantaura.tech')}.`,
        '',
        crossLinks(),
    ].join('\n');
}

function statusCard(user) {
    const t = user.telegramStatus();
    const premium = user.hasPremium();
    const lines = [
        '<b>Your connection</b>',
        '',
        `Account: <b>${esc(user.email)}</b>`,
        `Plan: <b>${premium ? 'Premium' : 'Free'}</b>`,
    ];
    if (premium && user.planExpiresAt) {
        lines.push(`Renews/expires: <b>${esc(user.planExpiresAt.toISOString().slice(0, 10))}</b>`);
    } else if (premium && user.role !== 'admin') {
        lines.push('Access: <b>Lifetime</b>');
    }
    lines.push(
        '',
        `Change alerts: <b>${t.alerts ? 'on' : 'off'}</b>`,
        `Daily digest: <b>${t.digest ? 'on' : 'off'}</b>`,
    );
    if (!premium) {
        lines.push(
            '',
            'Free accounts do not receive pushed signals.',
            link('/pricing', 'See Premium →'),
        );
    }
    return lines.join('\n');
}

function linkedConfirmation(user) {
    const premium = user.hasPremium();
    const lines = [
        `✅ <b>Connected to ${esc(user.email)}.</b>`,
        '',
    ];
    if (premium) {
        lines.push(
            `You will get a message whenever one of the ${config.symbols.length} calls flips, plus a daily summary.`,
            '',
            'Send /signals any time for the current state, or /alerts off to go quiet.',
        );
    } else {
        lines.push(
            'Your account is on the <b>Free</b> plan, so pushed signals are off.',
            `${link('/pricing', 'Premium')} delivers all ${config.symbols.length} calls here the moment they change.`,
            '',
            'Meanwhile /signals works for the symbols the website shows free.',
        );
    }
    lines.push('', footer());
    return lines.join('\n');
}

/** Sent once when a subscription lapses, so premium silence is explained rather
 *  than looking like the bot broke. */
function expiredNotice() {
    return [
        '⏳ <b>Your Premium access has ended.</b>',
        '',
        'Pushed signals are paused. Your Telegram account stays connected — renewing switches them straight back on, nothing to reconnect.',
        '',
        link('/pricing', 'Renew →'),
    ].join('\n');
}

module.exports = {
    premiumAlert, premiumDigest, freeTeaser, signalCard, lockedCard,
    welcome, help, statusCard, linkedConfirmation, expiredNotice,
    mark, price, DISCLAIMER,
};
