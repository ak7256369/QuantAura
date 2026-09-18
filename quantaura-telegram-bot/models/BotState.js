const mongoose = require('mongoose');

// Singleton (key: 'global') holding everything the bot must remember across
// restarts. It is deliberately one small document rather than a collection:
// the bot is a single process, writes are a handful per hour, and keeping the
// whole of "what did we last say" in one atomic save removes any chance of the
// change-detection map and the digest bookkeeping disagreeing after a crash.
const botStateSchema = new mongoose.Schema({
    key: { type: String, default: 'global', unique: true },

    // Telegram's getUpdates cursor. Persisted so a restart does not re-deliver
    // commands the bot already answered — a replayed /link would be harmless,
    // but a replayed backlog of commands after downtime looks like the bot
    // talking to itself.
    updateOffset: { type: Number, default: 0 },

    // symbol -> { signal, confidence, price, at }. The change detector compares
    // a fresh poll against this; a symbol absent here has never been pushed, so
    // its first observation seeds the map WITHOUT alerting. Otherwise every
    // subscriber would get a "signal changed" message per symbol the first time
    // the bot starts, none of which represent an actual flip.
    lastSignals: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },

    // UTC 'YYYY-MM-DD' of the last digest sent, so a restart inside the digest
    // window cannot send it twice.
    lastDigestDate: { type: String, default: '' },
    // Same guard for the free public channel's daily post.
    lastFreePostDate: { type: String, default: '' },

    // Purely informational, surfaced in logs and /admin later.
    lastPollAt: { type: Date, default: null },
    lastPollError: { type: String, default: '' },
}, { timestamps: true });

botStateSchema.statics.get = async function () {
    let doc = await this.findOne({ key: 'global' });
    if (!doc) doc = await this.create({ key: 'global' });
    return doc;
};

module.exports = mongoose.model('BotState', botStateSchema);
