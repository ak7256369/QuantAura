/**
 * Command handling.
 *
 * The bot answers from the most recent poll rather than triggering a fresh
 * prediction per request: /predict rebuilds features and runs four models, so
 * letting any subscriber trigger it on demand would hand a stranger a lever on
 * the VPS's CPU. Calls only move on 4h candle closes anyway, so a cached answer
 * is not a staler answer.
 */
const User = require('../models/User');
const Settings = require('../models/Settings');
const config = require('./config');
const fmt = require('./format');
const { esc } = require('./client');

// Failed /link attempts per Telegram chat. The codes are 27^8 and expire in 15
// minutes, so this is not the primary defence — it exists so a script cannot
// sit there guessing for free, and it costs one Map.
const linkAttempts = new Map();
const MAX_LINK_ATTEMPTS = 6;
const ATTEMPT_WINDOW_MS = 10 * 60 * 1000;

function tooManyAttempts(chatId) {
    const rec = linkAttempts.get(chatId);
    if (!rec) return false;
    if (Date.now() - rec.first > ATTEMPT_WINDOW_MS) {
        linkAttempts.delete(chatId);
        return false;
    }
    return rec.count >= MAX_LINK_ATTEMPTS;
}

function recordAttempt(chatId) {
    const rec = linkAttempts.get(chatId);
    if (!rec || Date.now() - rec.first > ATTEMPT_WINDOW_MS) {
        linkAttempts.set(chatId, { count: 1, first: Date.now() });
    } else {
        rec.count += 1;
    }
}

const DEFAULT_FREE_SYMBOLS = ['BTCUSDT', 'ETHUSDT'];
async function freeSymbols() {
    try {
        const s = await Settings.get();
        return s.freeSymbols?.length ? s.freeSymbols : DEFAULT_FREE_SYMBOLS;
    } catch {
        return DEFAULT_FREE_SYMBOLS;
    }
}

function findByChat(chatId) {
    return User.findOne({ 'telegram.chatId': String(chatId) });
}

// ── /link ──────────────────────────────────────────────────────────────────

async function handleLink(ctx, rawCode) {
    const { chatId, from, reply } = ctx;
    const code = (rawCode || '').trim().toUpperCase();

    if (!code) {
        return reply([
            'Send the code from your account page, like <code>/link ABCD2345</code>.',
            '',
            `Get one at ${config.siteUrl}/account`,
        ].join('\n'));
    }

    const already = await findByChat(chatId);
    if (already) {
        return reply(`This Telegram account is already connected to <b>${esc(already.email)}</b>. Send /unlink first to connect a different account.`);
    }

    if (tooManyAttempts(chatId)) {
        return reply('Too many incorrect codes. Wait ten minutes and try again.');
    }

    const user = await User.findOne({
        'telegram.linkCode': code,
        'telegram.linkCodeExpiresAt': { $gt: new Date() },
    });

    if (!user) {
        recordAttempt(chatId);
        return reply([
            '❌ That code is not valid, or it has expired.',
            '',
            `Codes last 15 minutes. Generate a fresh one at ${config.siteUrl}/account`,
        ].join('\n'));
    }

    // The same QuantAura account cannot serve two Telegram accounts: the second
    // would be an unpaid subscriber riding the first one's subscription.
    if (user.telegram.chatId && user.telegram.chatId !== String(chatId)) {
        user.telegram.linkCode = null;
        user.telegram.linkCodeExpiresAt = null;
        await user.save();
        return reply('That account is already connected to a different Telegram account. Disconnect it from the account page first.');
    }

    user.telegram.chatId = String(chatId);
    user.telegram.username = from.username || '';
    user.telegram.firstName = from.first_name || '';
    user.telegram.linkedAt = new Date();
    user.telegram.unreachableAt = null;
    user.telegram.linkCode = null;
    user.telegram.linkCodeExpiresAt = null;
    await user.save();

    linkAttempts.delete(chatId);
    ctx.log.info(`Linked Telegram ${chatId} → ${user.email} (${user.hasPremium() ? 'premium' : 'free'})`);
    return reply(fmt.linkedConfirmation(user));
}

// ── /signals ───────────────────────────────────────────────────────────────

async function handleSignals(ctx, symbolArg) {
    const { reply, store } = ctx;
    const user = await findByChat(ctx.chatId);
    const signals = store.getSignals();

    if (!Object.keys(signals).length) {
        return reply('The first poll of the day has not completed yet. Try again in a few minutes.');
    }

    const premium = !!(user && user.hasPremium());
    const allowed = premium ? config.symbols : await freeSymbols();

    if (symbolArg) {
        let symbol = symbolArg.trim().toUpperCase();
        if (!symbol.endsWith('USDT')) symbol += 'USDT';
        if (!config.symbols.includes(symbol)) {
            return reply(`Unknown symbol. Tracked: ${config.symbols.map((s) => config.displayName(s)).join(', ')}.`);
        }
        if (!allowed.includes(symbol)) return reply(fmt.lockedCard(symbol));
        const sig = signals[symbol];
        if (!sig) return reply(`No current call for ${esc(config.displayName(symbol))} — the last poll could not reach the model.`);
        return reply(fmt.signalCard(sig));
    }

    if (premium) {
        const card = fmt.premiumDigest(signals, { date: new Date().toISOString().slice(0, 10) });
        return reply(card || 'No calls available right now.');
    }

    // Free tier: direction only, for the symbols the website shows free. This
    // mirrors the API's redaction exactly rather than inventing a third tier.
    const rows = allowed
        .filter((s) => signals[s])
        .map((s) => `${fmt.mark(signals[s].signal)} <b>${esc(config.displayName(s))}</b> — ${esc(signals[s].signal)}  ${esc(fmt.price(signals[s].price))}`);

    if (!rows.length) return reply('No calls available right now.');

    return reply([
        '<b>Current calls (Free)</b>',
        '',
        ...rows,
        '',
        `🔒 ${config.symbols.length - allowed.length} more symbols, confidence scores and the per-model votes are Premium.`,
        `<a href="${config.siteUrl}/pricing">See Premium →</a>`,
        '',
        `<i>${esc(fmt.DISCLAIMER)}</i>`,
    ].join('\n'));
}

// ── preference toggles ─────────────────────────────────────────────────────

async function handleToggle(ctx, field, arg) {
    const user = await findByChat(ctx.chatId);
    if (!user) return ctx.reply('Connect your account first — send /link with the code from your account page.');

    const value = (arg || '').trim().toLowerCase();
    if (!['on', 'off'].includes(value)) {
        const current = user.telegram[field] !== false;
        return ctx.reply(`${field === 'alerts' ? 'Change alerts' : 'Daily digest'} is <b>${current ? 'on' : 'off'}</b>. Send <code>/${field} on</code> or <code>/${field} off</code>.`);
    }

    user.telegram[field] = value === 'on';
    await user.save();
    return ctx.reply(`${field === 'alerts' ? 'Change alerts' : 'Daily digest'} is now <b>${value}</b>.`);
}

async function handleUnlink(ctx) {
    const user = await findByChat(ctx.chatId);
    if (!user) return ctx.reply('This Telegram account is not connected to anything.');

    user.telegram.chatId = null;
    user.telegram.username = '';
    user.telegram.firstName = '';
    user.telegram.linkedAt = null;
    user.telegram.unreachableAt = null;
    await user.save();
    ctx.log.info(`Unlinked Telegram ${ctx.chatId} from ${user.email}`);
    return ctx.reply('Disconnected. Your QuantAura account and subscription are untouched — reconnect any time from the account page.');
}

async function handleStatus(ctx) {
    const user = await findByChat(ctx.chatId);
    if (!user) {
        return ctx.reply([
            'Not connected to a QuantAura account yet.',
            '',
            `Get a code at ${config.siteUrl}/account and send <code>/link YOURCODE</code>.`,
        ].join('\n'));
    }
    return ctx.reply(fmt.statusCard(user));
}

// ── router ─────────────────────────────────────────────────────────────────

const COMMAND_RE = /^\/([a-z_]+)(?:@\w+)?(?:\s+([\s\S]*))?$/i;

/**
 * Dispatch one incoming message. Unknown input gets the help text rather than
 * silence — a bot that ignores you is indistinguishable from a broken one.
 */
async function dispatch(ctx, text) {
    const match = COMMAND_RE.exec((text || '').trim());
    if (!match) return ctx.reply(fmt.help());

    const command = match[1].toLowerCase();
    const arg = (match[2] || '').trim();

    switch (command) {
        case 'start':
            // Telegram forwards a t.me/bot?start=PAYLOAD deep link as
            // "/start PAYLOAD", so the account page's one-tap button lands here
            // and pairs without the user typing a code at all.
            if (arg) return handleLink(ctx, arg);
            return ctx.reply(fmt.welcome(ctx.from.first_name));
        case 'link':
            return handleLink(ctx, arg);
        case 'signals':
        case 'signal':
            return handleSignals(ctx, arg);
        case 'status':
            return handleStatus(ctx);
        case 'alerts':
            return handleToggle(ctx, 'alerts', arg);
        case 'digest':
            return handleToggle(ctx, 'digest', arg);
        case 'unlink':
            return handleUnlink(ctx);
        case 'help':
            return ctx.reply(fmt.help());
        default:
            return ctx.reply(fmt.help());
    }
}

module.exports = { dispatch, freeSymbols };
