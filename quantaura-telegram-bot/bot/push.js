/**
 * Outbound delivery: change alerts, the daily digest, and the free channel.
 *
 * The design constraint everything here serves: premium is enforced at SEND
 * time by User.hasPremium() — the same lazy-expiry rule the API uses — so there
 * is no membership to revoke and no cron whose death silently comps expired
 * subscribers. An expired user simply stops appearing in the recipient query on
 * the next send.
 */
const User = require('../models/User');
const BotState = require('../models/BotState');
const config = require('./config');
const fmt = require('./format');
const { sleep } = require('./client');

/** Recipients for a premium broadcast: linked, reachable, and not banned.
 *  Premium itself is re-checked per user in code — hasPremium() reads the
 *  expiry at call time, which a Mongo query can only approximate. */
async function linkedUsers() {
    return User.find({
        'telegram.chatId': { $type: 'string' },
        'telegram.unreachableAt': null,
        status: 'active',
    });
}

/**
 * Send one message to one user, translating "this chat is gone" into state
 * rather than noise. Returns true if delivered.
 */
async function deliver(bot, user, text, { silent = false } = {}) {
    if (config.dryRun) {
        bot.log.info(`  [dry-run] → ${user.email}:\n${text.replace(/<[^>]+>/g, '')}\n`);
        return true;
    }
    try {
        await bot.client.sendMessage(user.telegram.chatId, text, { silent });
        return true;
    } catch (err) {
        if (err.isUnreachable) {
            // Blocked the bot or deleted the account. Mark it so the next
            // broadcast skips the chat instead of burning a retry cycle on it.
            user.telegram.unreachableAt = new Date();
            await user.save().catch(() => {});
            bot.log.warn(`  ${user.email}: chat unreachable, delivery disabled`);
        } else {
            bot.log.warn(`  ${user.email}: send failed (${err.message})`);
        }
        return false;
    }
}

/**
 * Fan a message out at a polite pace. `render` is called per user so the same
 * broadcast can personalise (and re-check premium) without a second loop.
 */
async function broadcast(bot, users, render, opts = {}) {
    let sent = 0;
    const gap = Math.max(1000 / config.sendsPerSecond, 20);
    for (const user of users) {
        const text = render(user);
        if (!text) continue;
        if (await deliver(bot, user, text, opts)) sent += 1;
        await sleep(gap);
    }
    return sent;
}

// ── change alerts ──────────────────────────────────────────────────────────

/**
 * Compare a fresh poll against the persisted map and push every genuine flip.
 *
 * A symbol with no persisted entry is seeded silently: "first time the bot ever
 * saw this symbol" is not a regime change, and alerting on it would greet every
 * subscriber with a spurious push per symbol on day one. The same rule covers
 * symbols added to config later: their first poll seeds quietly.
 */
async function pushChanges(bot, signals) {
    const state = await BotState.get();
    const last = state.lastSignals || {};
    const flips = [];

    for (const symbol of config.symbols) {
        const next = signals[symbol];
        if (!next) continue;                       // poll failed for this one — keep old state
        const prev = last[symbol];
        if (prev && prev.signal !== next.signal) flips.push({ prev, next });
        last[symbol] = {
            signal: next.signal,
            confidence: next.confidence,
            price: next.price,
            at: next.at,
        };
    }

    state.lastSignals = last;
    state.markModified('lastSignals');            // Mixed type — mongoose can't see inside
    await state.save();

    if (!flips.length) {
        bot.log.info('  No calls flipped.');
        return;
    }

    bot.log.info(`  ${flips.length} call(s) flipped: ${flips.map((f) => `${f.next.symbol} ${f.prev.signal}→${f.next.signal}`).join(', ')}`);

    const users = await linkedUsers();
    for (const { prev, next } of flips) {
        const sent = await broadcast(
            bot,
            users.filter((u) => u.hasPremium() && u.telegram.alerts !== false),
            () => fmt.premiumAlert(prev, next),
        );
        bot.log.info(`  ${next.symbol}: alert delivered to ${sent} subscriber(s)`);

        // BTC flips also go to the free channel — direction only. The public
        // teaser moving in real time is the funnel's best ad for the DMs.
        if (next.symbol === 'BTCUSDT') {
            await postFreeChannel(bot, next, { changed: true });
        }
    }
}

// ── daily digest ───────────────────────────────────────────────────────────

async function pushDigestIfDue(bot, signals) {
    const now = new Date();
    if (now.getUTCHours() !== config.digestHourUtc) return;

    const today = now.toISOString().slice(0, 10);
    const state = await BotState.get();
    if (state.lastDigestDate === today) return;   // restart inside the window

    const card = fmt.premiumDigest(signals, { date: today });
    if (!card) {
        bot.log.warn('  Digest due but no signals available — skipping, will not retry today.');
    } else {
        const users = await linkedUsers();
        const sent = await broadcast(
            bot,
            users.filter((u) => u.hasPremium() && u.telegram.digest !== false),
            () => card,
            { silent: true },                      // a scheduled summary shouldn't buzz phones
        );
        bot.log.info(`  Digest delivered to ${sent} subscriber(s)`);
    }

    // Written even on the no-signals branch: one digest attempt per day. If the
    // model was down at digest hour, subscribers get today's calls from the
    // change alerts instead of a digest arriving at some random later hour.
    state.lastDigestDate = today;
    await state.save();

    await notifyExpired(bot, await linkedUsers());
    await postFreeDailyIfDue(bot, signals, today);
}

/**
 * The one push a lapsed subscriber still gets: a single message explaining the
 * silence. Compared against planExpiresAt rather than a boolean so a user who
 * renews and lapses again gets told again — planExpiresAt moves forward on
 * renewal, which invalidates the old notification timestamp.
 */
async function notifyExpired(bot, users) {
    for (const user of users) {
        const t = user.telegram;
        if (user.hasPremium() || !t.linkedAt) continue;
        if (user.plan !== 'premium') continue;     // never was premium — nothing to explain
        if (!user.planExpiresAt || user.planExpiresAt > new Date()) continue;
        if (t.expiredNotifiedAt && t.expiredNotifiedAt >= user.planExpiresAt) continue;
        if (await deliver(bot, user, fmt.expiredNotice())) {
            t.expiredNotifiedAt = new Date();
            await user.save().catch(() => {});
        }
        await sleep(100);
    }
}

// ── free public channel ────────────────────────────────────────────────────

async function postFreeChannel(bot, sig, { changed = false } = {}) {
    if (!config.freeChannelId) return;
    const text = fmt.freeTeaser(sig, { changed });
    if (config.dryRun) {
        bot.log.info(`  [dry-run] → free channel:\n${text.replace(/<[^>]+>/g, '')}\n`);
        return;
    }
    try {
        await bot.client.sendMessage(config.freeChannelId, text);
        bot.log.info('  Posted to the free channel.');
    } catch (err) {
        bot.log.warn(`  Free channel post failed: ${err.message}`);
    }
}

async function postFreeDailyIfDue(bot, signals, today) {
    if (!config.freeChannelId) return;
    const state = await BotState.get();
    if (state.lastFreePostDate === today) return;
    const btc = signals.BTCUSDT;
    if (!btc) return;                             // try again next poll cycle
    await postFreeChannel(bot, btc, { changed: false });
    state.lastFreePostDate = today;
    await state.save();
}

module.exports = { pushChanges, pushDigestIfDue, postFreeChannel, linkedUsers, broadcast };
