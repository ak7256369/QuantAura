/**
 * Run the daily digest by hand.
 *
 * pushDigestIfDue() is gated on the UTC hour AND on BotState.lastDigestDate, so
 * a digest missed at 12:00 — because the signal source was down, say — cannot
 * be recovered by the scheduler: the hour has passed and the date is already
 * marked. This script is the recovery path, and the only place either guard is
 * bypassed.
 *
 *   node scripts/send-digest.js            # dry run: prints, sends nothing
 *   node scripts/send-digest.js --live     # actually DMs subscribers
 *   node scripts/send-digest.js --live --free-channel   # ...and posts publicly
 *   node scripts/send-digest.js --live --notify         # ...with a notification
 *
 * The scheduled digest is always silent — a daily summary that buzzes eight
 * phones at 12:00 UTC is a reason to mute the bot. --notify exists for the
 * recovery case, where the point is that someone notices it arrived.
 *
 * Dry by default because the live path is irreversible in two directions at
 * once: DMs to paying subscribers and a post to the public channel. The free
 * channel is a second, separate opt-in for the same reason — recovering a
 * digest for subscribers is routine, publishing to the funnel is not.
 */
const args = new Set(process.argv.slice(2));
const LIVE = args.has('--live');
const FREE = args.has('--free-channel');
const NOTIFY = args.has('--notify');

// Must precede the config require: bot/config.js reads BOT_DRY_RUN at load, and
// deliver() consults it per call.
if (!LIVE) process.env.BOT_DRY_RUN = '1';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const BotState = require('../models/BotState');
const config = require('../bot/config');
const fmt = require('../bot/format');
const { TelegramClient } = require('../bot/client');
const signalsSource = require('../bot/signals');
const push = require('../bot/push');

const log = {
    info: (msg) => console.log(`[digest] ${msg}`),
    warn: (msg) => console.warn(`[digest] ⚠ ${msg}`),
    error: (msg) => console.error(`[digest] ✖ ${msg}`),
};

async function main() {
    if (!config.apiBase) {
        log.error('BOT_API_BASE is not set.');
        process.exit(1);
    }
    log.info(LIVE ? 'LIVE — messages WILL be sent.' : 'DRY RUN — nothing will be sent.');

    await connectDB();
    const bot = { log, client: null };
    if (LIVE) {
        bot.client = new TelegramClient(config.token, { log });
        const me = await bot.client.getMe();
        log.info(`Authenticated as @${me.username}.`);
    }

    log.info(`Reading signals from ${config.apiBase} ...`);
    const { signals, failures } = await signalsSource.fetchAll(log);
    const count = Object.keys(signals).length;
    log.info(`${count}/${config.symbols.length} symbols returned a usable call.`);
    for (const f of failures) log.warn(`  ${f.error}`);

    const today = new Date().toISOString().slice(0, 10);
    const card = fmt.premiumDigest(signals, { date: today });
    if (!card) {
        log.error('No digest to send — the signal source returned nothing usable.');
        await mongoose.disconnect();
        process.exit(1);
    }

    const all = await push.linkedUsers();
    const recipients = all.filter((u) => u.hasPremium() && u.telegram.digest !== false);
    log.info(`${all.length} linked chat(s); ${recipients.length} premium recipient(s) with digest on.`);
    if (!LIVE) {
        console.log(`\n───── digest as it would arrive ─────\n${card.replace(/<[^>]+>/g, '')}\n─────────────────────────────────────\n`);
        for (const u of recipients) log.info(`  would DM: ${u.email}`);
    }

    const sent = await push.broadcast(bot, recipients, () => card, { silent: !NOTIFY });
    log.info(`Digest ${LIVE ? 'delivered to' : 'would reach'} ${sent} subscriber(s)`
        + `${NOTIFY ? ' with a notification.' : ' silently.'}`);

    // Mark the day only on a real send, so a dry run never consumes the guard.
    if (LIVE) {
        const state = await BotState.get();
        state.lastDigestDate = today;
        await state.save();
        log.info(`BotState.lastDigestDate = ${today}`);
    }

    if (FREE && config.freeChannelId && signals.BTCUSDT) {
        await push.postFreeChannel(bot, signals.BTCUSDT, { changed: false });
        if (LIVE) {
            const state = await BotState.get();
            state.lastFreePostDate = today;
            await state.save();
            log.info(`BotState.lastFreePostDate = ${today}`);
        }
    } else if (FREE) {
        log.warn('Free channel post skipped (no channel configured, or no BTC signal).');
    }

    await mongoose.disconnect();
    log.info('Done.');
}

main().catch(async (err) => {
    log.error(err.stack || err.message);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
});
