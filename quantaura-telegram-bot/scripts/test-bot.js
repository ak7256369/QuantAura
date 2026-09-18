/**
 * Bot verification harness — no Telegram token, no ml-api, no real MongoDB.
 *
 * Boots an in-memory MongoDB, seeds users across every tier state (premium,
 * expired, free, admin), then drives the command router and the push pipeline
 * with a fake Telegram client that records instead of sending. Asserts the
 * properties that matter:
 *
 *   - pairing codes link exactly one Telegram account, once, and rate-limit guessing
 *   - premium redaction: free users never see confidence or per-model votes
 *   - change detection: first sight of a symbol seeds silently, a flip alerts,
 *     and only premium subscribers with alerts on receive it
 *   - the digest sends once per day, to premium digest subscribers only
 *   - a lapsed subscriber gets exactly one expiry notice per lapse
 *   - an unreachable chat is latched off instead of retried forever
 *
 * Usage: node scripts/test-bot.js   (exit 0 = all assertions passed)
 */
process.env.BOT_DRY_RUN = '';                       // exercise the real send paths
process.env.TELEGRAM_FREE_CHANNEL_ID = '@test_free_channel';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'dev-only-secret';

const assert = require('assert');
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

let passed = 0;
function ok(cond, label) {
    assert(cond, label);
    passed += 1;
    console.log(`  ✓ ${label}`);
}

(async () => {
    const mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri('quantaura_bot_test'));

    const User = require('../models/User');
    const BotState = require('../models/BotState');
    const commands = require('../bot/commands');
    const push = require('../bot/push');
    const fmt = require('../bot/format');
    const config = require('../bot/config');

    // ── fake Telegram client ───────────────────────────────────────────────
    const sent = [];                                 // { chatId, text }
    const deadChats = new Set();
    const fakeClient = {
        sendMessage: async (chatId, text) => {
            if (deadChats.has(String(chatId))) {
                const err = new Error('Forbidden: bot was blocked by the user');
                err.isUnreachable = true;
                throw err;
            }
            sent.push({ chatId: String(chatId), text });
        },
    };
    const quiet = { info: () => {}, warn: () => {}, error: () => {} };
    const bot = { client: fakeClient, log: quiet };
    const sentTo = (chatId) => sent.filter((m) => m.chatId === String(chatId));
    const ctx = (chatId, extra = {}) => ({
        chatId,
        from: { first_name: 'Test', username: 'tester', ...extra },
        store: { getSignals: () => currentSignals },
        log: quiet,
        reply: (text) => fakeClient.sendMessage(chatId, text),
    });

    const mkSignal = (symbol, signal, confidence = 71, price = 65000) => ({
        symbol, signal, confidence, price,
        breakdown: { BUY: 20, HOLD: 30, SELL: 50 },
        perModel: { lstm: signal, xgboost: signal, transformer: 'HOLD', kan: signal },
        indicators: {}, explanation: '', at: new Date(),
    });
    let currentSignals = {};

    // ── seed users ─────────────────────────────────────────────────────────
    const future = new Date(Date.now() + 30 * 864e5);
    const past = new Date(Date.now() - 3 * 864e5);
    const mk = (email, plan, expires) => User.create({
        name: email.split('@')[0], email, passwordHash: 'x', plan, planExpiresAt: expires,
    });
    const premiumUser = await mk('premium@test.dev', 'premium', future);
    const expiredUser = await mk('expired@test.dev', 'premium', past);
    const freeUser = await mk('free@test.dev', 'free', null);
    const otherPremium = await mk('premium2@test.dev', 'premium', null); // lifetime

    console.log('\n── linking ──');

    // Unknown code fails, and repeated guessing rate-limits.
    await commands.dispatch(ctx(101), '/link WRONGCOD');
    ok(sentTo(101).at(-1).text.includes('not valid'), 'bad code is rejected');
    for (let i = 0; i < 6; i++) await commands.dispatch(ctx(101), '/link WRONGCOD');
    ok(sentTo(101).at(-1).text.includes('Too many'), 'guessing rate-limits after 6 attempts');

    // A valid, unexpired code links — via the /start deep-link path.
    premiumUser.telegram.linkCode = 'GOODCODE';
    premiumUser.telegram.linkCodeExpiresAt = new Date(Date.now() + 15 * 60000);
    await premiumUser.save();
    await commands.dispatch(ctx(201), '/start GOODCODE');
    let u = await User.findById(premiumUser._id);
    ok(u.telegram.chatId === '201', 'deep-link /start pairs the account');
    ok(u.telegram.linkCode === null, 'pairing code is single-use');
    ok(sentTo(201).at(-1).text.includes('Connected'), 'user gets a confirmation');

    // The same Telegram account cannot link twice.
    freeUser.telegram.linkCode = 'FREECODE';
    freeUser.telegram.linkCodeExpiresAt = new Date(Date.now() + 15 * 60000);
    await freeUser.save();
    await commands.dispatch(ctx(201), '/link FREECODE');
    ok(sentTo(201).at(-1).text.includes('already connected'), 'a linked chat cannot claim a second account');

    // …but a different chat can claim the free account.
    await commands.dispatch(ctx(301), '/link FREECODE');
    ok((await User.findById(freeUser._id)).telegram.chatId === '301', 'free user links from its own chat');

    // Link the remaining fixtures directly.
    for (const [doc, chat] of [[expiredUser, 401], [otherPremium, 501]]) {
        doc.telegram.chatId = String(chat);
        doc.telegram.linkedAt = new Date();
        await doc.save();
    }

    // Partial unique index: duplicate chatId must be rejected, null must not be.
    await assert.rejects(
        () => User.create({ name: 'dup', email: 'dup@test.dev', passwordHash: 'x', telegram: { chatId: '201' } }),
        /duplicate key/,
        'duplicate chatId rejected',
    );
    ok(true, 'duplicate telegram.chatId is rejected by the index');
    await User.create({ name: 'n1', email: 'null1@test.dev', passwordHash: 'x' });
    await User.create({ name: 'n2', email: 'null2@test.dev', passwordHash: 'x' });
    ok(true, 'multiple unlinked users coexist (partial index ignores nulls)');

    console.log('\n── /signals redaction ──');

    currentSignals = {
        BTCUSDT: mkSignal('BTCUSDT', 'BUY'),
        ETHUSDT: mkSignal('ETHUSDT', 'HOLD', 64, 3200),
        SOLUSDT: mkSignal('SOLUSDT', 'SELL', 80, 150),
    };

    await commands.dispatch(ctx(201), '/signals');
    const premiumReply = sentTo(201).at(-1).text;
    ok(premiumReply.includes('71%'), 'premium /signals shows confidence');
    ok(premiumReply.includes('Solana'), 'premium /signals includes non-free symbols');

    await commands.dispatch(ctx(301), '/signals');
    const freeReply = sentTo(301).at(-1).text;
    ok(!freeReply.includes('71%') && !freeReply.includes('lstm'), 'free /signals hides confidence and votes');
    ok(!freeReply.includes('Solana'), 'free /signals hides premium symbols');
    ok(freeReply.includes('Premium'), 'free /signals carries the upgrade pointer');

    await commands.dispatch(ctx(301), '/signals SOL');
    ok(sentTo(301).at(-1).text.includes('🔒'), 'free /signals SOL shows the locked card');

    console.log('\n── change detection ──');

    sent.length = 0;
    await push.pushChanges(bot, currentSignals);
    ok(sent.length === 0, 'first sight of every symbol seeds silently — no alerts');

    // BTC flips BUY→SELL; ETH unchanged.
    currentSignals.BTCUSDT = mkSignal('BTCUSDT', 'SELL', 77);
    sent.length = 0;
    await push.pushChanges(bot, currentSignals);
    const alerts = sent.filter((m) => m.text.includes('BUY → SELL'));
    const alertChats = new Set(alerts.map((m) => m.chatId));
    ok(alertChats.has('201') && alertChats.has('501'), 'both premium subscribers get the flip alert');
    ok(!alertChats.has('301'), 'free user gets no alert');
    ok(!alertChats.has('401'), 'expired premium gets no alert');
    ok(sentTo('@test_free_channel').length === 1, 'BTC flip also posts the free-channel teaser');
    const teaser = sentTo('@test_free_channel')[0].text;
    ok(!teaser.includes('77%') && !teaser.includes('lstm'), 'free-channel teaser is direction-only');

    // Unchanged repoll: silence.
    sent.length = 0;
    await push.pushChanges(bot, currentSignals);
    ok(sent.length === 0, 'unchanged signals produce no messages');

    // Alerts toggle respected.
    await commands.dispatch(ctx(501), '/alerts off');
    currentSignals.ETHUSDT = mkSignal('ETHUSDT', 'BUY', 69, 3300);
    sent.length = 0;
    await push.pushChanges(bot, currentSignals);
    const ethChats = new Set(sent.filter((m) => m.text.includes('HOLD → BUY')).map((m) => m.chatId));
    ok(ethChats.has('201') && !ethChats.has('501'), '/alerts off stops flip alerts for that user only');

    console.log('\n── digest, expiry notice, unreachable ──');

    const realHour = config.digestHourUtc;
    config.digestHourUtc = new Date().getUTCHours();   // force "digest is due now"

    sent.length = 0;
    await push.pushDigestIfDue(bot, currentSignals);
    const digestChats = new Set(sent.filter((m) => m.text.includes('Daily calls')).map((m) => m.chatId));
    ok(digestChats.has('201') && digestChats.has('501'), 'digest goes to premium subscribers (digest pref is separate from alerts)');
    ok(!digestChats.has('301') && !digestChats.has('401'), 'digest skips free and expired users');
    ok(sentTo(401).some((m) => m.text.includes('Premium access has ended')), 'lapsed subscriber gets the expiry notice');
    ok(sentTo('@test_free_channel').some((m) => m.text.includes("today's call")), 'daily free-channel post rides the digest');

    sent.length = 0;
    await push.pushDigestIfDue(bot, currentSignals);
    ok(sent.length === 0, 'digest and expiry notice are once-per-day idempotent');
    config.digestHourUtc = realHour;

    // Unreachable chat gets latched off.
    deadChats.add('201');
    currentSignals.SOLUSDT = mkSignal('SOLUSDT', 'BUY', 66, 155);
    sent.length = 0;
    await push.pushChanges(bot, currentSignals);
    u = await User.findById(premiumUser._id);
    ok(u.telegram.unreachableAt instanceof Date, 'blocked chat is marked unreachable');
    deadChats.delete('201');
    currentSignals.SOLUSDT = mkSignal('SOLUSDT', 'HOLD', 60, 152);
    sent.length = 0;
    await push.pushChanges(bot, currentSignals);
    ok(!sentTo(201).length, 'unreachable user is skipped on later broadcasts');

    console.log('\n── status & unlink ──');

    await commands.dispatch(ctx(501), '/status');
    ok(sentTo(501).at(-1).text.includes('Lifetime'), '/status shows lifetime premium');
    await commands.dispatch(ctx(301), '/unlink');
    ok((await User.findById(freeUser._id)).telegram.chatId === null, '/unlink clears the pairing');

    console.log(`\n✅ ${passed} assertions passed.`);
    await mongoose.disconnect();
    await mongod.stop();
    process.exit(0);
})().catch(async (err) => {
    console.error(`\n❌ ${err.message}`);
    process.exit(1);
});
