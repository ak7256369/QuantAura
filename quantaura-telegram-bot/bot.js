/**
 * QuantAura Telegram bot — a separate PM2 process, NOT part of server.js.
 *
 * Separate because the two fail differently: the API must restart fast and
 * often (max_memory_restart), while the bot holds a long-poll connection and
 * per-day delivery state. Sharing a process would mean every API restart
 * re-delivered or dropped in-flight Telegram traffic. They share code (models,
 * middleware) and a database, nothing else.
 *
 * What it does:
 *   - long-polls Telegram for commands (/link, /signals, /status, …)
 *   - a few minutes after every 4h candle close, reads every premium signal
 *     over the public API and DMs every premium subscriber whose call flipped
 *   - once a day, sends a digest of all calls + posts the BTC teaser to the
 *     free public channel
 *
 * Env (see .env): TELEGRAM_BOT_TOKEN (required), TELEGRAM_BOT_USERNAME,
 * TELEGRAM_FREE_CHANNEL_ID, BOT_API_BASE, BOT_SERVICE_EMAIL, BOT_DRY_RUN.
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const cron = require('node-cron');
const connectDB = require('./config/db');
const BotState = require('./models/BotState');
const config = require('./bot/config');
const { TelegramClient, sleep } = require('./bot/client');
const commands = require('./bot/commands');
const signalsSource = require('./bot/signals');
const push = require('./bot/push');

const log = {
    info: (msg) => console.log(`[bot] ${msg}`),
    warn: (msg) => console.warn(`[bot] ⚠ ${msg}`),
    error: (msg) => console.error(`[bot] ✖ ${msg}`),
};

// In-memory copy of the latest successful poll, serving /signals replies.
// Mongo's BotState.lastSignals persists the change-detection view; this holds
// the richer per-model detail that only matters until the next poll.
const store = {
    signals: {},
    getSignals() { return this.signals; },
    setSignals(fresh) {
        // Merge, don't replace: one symbol's failed poll should not make its
        // last known call vanish from /signals for four hours.
        Object.assign(this.signals, fresh);
    },
};

const bot = { client: null, log };

// ── polling the model ──────────────────────────────────────────────────────

let pollRunning = false;

async function pollSignals(reason) {
    if (pollRunning) {
        log.warn('Poll already in progress — skipping overlap.');
        return;
    }
    pollRunning = true;
    log.info(`Polling signals (${reason})...`);
    try {
        const { signals, failures } = await signalsSource.fetchAll(log);
        const got = Object.keys(signals).length;
        log.info(`  ${got}/${config.symbols.length} symbols returned a usable call.`);
        store.setSignals(signals);

        const state = await BotState.get();
        state.lastPollAt = new Date();
        state.lastPollError = failures.map((f) => f.error).join('; ').slice(0, 500);
        await state.save();

        if (got) {
            await push.pushChanges(bot, signals);
            await push.pushDigestIfDue(bot, store.getSignals());
        }
    } catch (err) {
        // fetchAll only throws before any symbol is read (no service account /
        // token failure) — per-symbol errors come back in `failures`.
        log.error(`Poll failed entirely: ${err.message}`);
        const state = await BotState.get().catch(() => null);
        if (state) {
            state.lastPollError = err.message.slice(0, 500);
            await state.save().catch(() => {});
        }
    } finally {
        pollRunning = false;
    }
}

// ── Telegram update loop ───────────────────────────────────────────────────

async function handleUpdate(update) {
    const msg = update.message;
    // Channel posts, membership changes, edits — nothing to answer.
    if (!msg || !msg.text || !msg.from || msg.from.is_bot) return;
    // The bot converses in DMs only. In a group it would leak premium cards to
    // whoever shares the room with a subscriber.
    if (msg.chat.type !== 'private') return;

    const ctx = {
        chatId: msg.chat.id,
        from: msg.from,
        store,
        log,
        reply: (text) => bot.client.sendMessage(msg.chat.id, text),
    };

    try {
        await commands.dispatch(ctx, msg.text);
    } catch (err) {
        log.error(`Command "${msg.text.slice(0, 40)}" failed: ${err.message}`);
        await ctx.reply('Something went wrong on our side. Try again in a minute.').catch(() => {});
    }
}

async function updateLoop() {
    const state = await BotState.get();
    let offset = state.updateOffset || 0;

    for (;;) {
        let updates;
        try {
            updates = await bot.client.getUpdates(offset, 50);
        } catch (err) {
            if (err.code === 409) {
                // Another process is polling this token. Retrying just steals
                // updates back and forth — die loudly and let PM2's
                // restart_delay pace the retries while someone investigates.
                log.error('409 from getUpdates: another instance is polling this bot token. Exiting.');
                process.exit(1);
            }
            log.warn(`getUpdates failed (${err.message}) — retrying in 5s`);
            await sleep(5000);
            continue;
        }

        for (const update of updates) {
            offset = update.update_id + 1;
            await handleUpdate(update);
        }

        if (updates.length) {
            // Persist the cursor only after the batch is handled, so a crash
            // mid-batch re-delivers rather than drops. Commands are idempotent
            // enough that re-delivery is the cheaper failure.
            const s = await BotState.get();
            s.updateOffset = offset;
            await s.save();
        }
    }
}

// ── startup ────────────────────────────────────────────────────────────────

async function main() {
    if (!config.token && !config.dryRun) {
        log.error('TELEGRAM_BOT_TOKEN is not set. Set it in .env (or BOT_DRY_RUN=1 to test without one).');
        process.exit(1);
    }

    // Checked here rather than defaulted in config.js: the box runs other
    // people's sites on the neighbouring ports, so a guessed base silently
    // reads someone else's server instead of quantaura-api.
    if (!config.apiBase) {
        log.error('BOT_API_BASE is not set. Point it at quantaura-api, e.g. http://127.0.0.1:5001 (its PORT in quantaura-api/.env).');
        process.exit(1);
    }

    await connectDB();
    log.info('Database connected.');

    if (!config.dryRun) {
        bot.client = new TelegramClient(config.token, { log });
        const me = await bot.client.getMe();
        log.info(`Authenticated as @${me.username}.`);
        if (config.botUsername && me.username !== config.botUsername) {
            log.warn(`TELEGRAM_BOT_USERNAME says @${config.botUsername} but the token belongs to @${me.username} — deep links on the site will point at the wrong bot.`);
        }
        // getUpdates silently returns nothing while a webhook is set.
        await bot.client.deleteWebhook();
    } else {
        log.info('DRY RUN — messages will be printed, not sent.');
        bot.client = {
            sendMessage: async (chatId, text) => {
                log.info(`[dry-run] → ${chatId}:\n${text.replace(/<[^>]+>/g, '')}\n`);
            },
            getUpdates: async () => { await sleep(60000); return []; },
        };
    }

    // Catch up immediately: if the process was down across a 4h close, the
    // flip still gets pushed now instead of waiting for the next close.
    await pollSignals('startup');

    // A few minutes after each 4h candle close (00/04/…/20 UTC) — the only
    // moments the ensemble's call can actually change.
    cron.schedule(`${config.pollMinuteOffset} 0,4,8,12,16,20 * * *`, () => pollSignals('4h close'), { timezone: 'UTC' });

    // Hourly check for the digest, so digestHourUtc works even when it is not
    // a 4h boundary. pushDigestIfDue no-ops on every other hour.
    cron.schedule(`${config.pollMinuteOffset + 2} * * * *`, async () => {
        try {
            await push.pushDigestIfDue(bot, store.getSignals());
        } catch (err) {
            log.error(`Digest check failed: ${err.message}`);
        }
    }, { timezone: 'UTC' });

    log.info(`Watching ${config.symbols.length} symbols; digest at ${String(config.digestHourUtc).padStart(2, '0')}:00 UTC; free channel ${config.freeChannelId ? 'on' : 'off'}.`);

    await updateLoop();   // never returns
}

main().catch((err) => {
    log.error(`Fatal: ${err.stack || err.message}`);
    process.exit(1);
});
