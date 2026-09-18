const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true, maxlength: 60 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    plan: { type: String, enum: ['free', 'premium'], default: 'free' },
    // null = no expiry set (free users, or lifetime grants by admin)
    planExpiresAt: { type: Date, default: null },
    status: { type: String, enum: ['active', 'banned'], default: 'active' },
    // Daily AI-chat quota tracking for free users
    chatUsage: {
        date: { type: String, default: '' },   // 'YYYY-MM-DD'
        count: { type: Number, default: 0 },
    },
    // Telegram signal delivery. Signals are DM'd per user rather than posted to
    // a private channel precisely so that access needs no revocation: premium is
    // re-checked at send time by hasPremium(), the same lazy rule the API uses.
    // A private channel would need membership actively revoked on expiry, and
    // the failure mode of that cron is an expired user who keeps paid signals.
    telegram: {
        // Telegram's numeric user id, stored as a string — it exceeds 2^32 and
        // is an opaque identifier, never arithmetic.
        chatId: { type: String, default: null },
        username: { type: String, default: '' },
        firstName: { type: String, default: '' },
        linkedAt: { type: Date, default: null },
        // Delivery preferences, toggled from the bot itself.
        alerts: { type: Boolean, default: true },   // push when a call flips
        digest: { type: Boolean, default: true },   // one daily summary
        // Set when Telegram reports the chat as unreachable (user blocked the
        // bot or deleted the account). Stops the sender retrying it forever.
        unreachableAt: { type: Date, default: null },
        // When the "your Premium ended" notice was last sent, compared against
        // planExpiresAt so each lapse is explained exactly once — including a
        // renew-then-lapse-again cycle, which moves planExpiresAt forward.
        expiredNotifiedAt: { type: Date, default: null },
        // Short-lived single-use pairing code issued by the website and typed
        // into the bot. Never a long-lived secret: see routes/telegram.js.
        linkCode: { type: String, default: null },
        linkCodeExpiresAt: { type: Date, default: null },
    },
    lastLoginAt: { type: Date, default: null },
}, { timestamps: true });

// One Telegram account maps to at most one QuantAura account. A plain sparse
// unique index would not do: `chatId` defaults to null, so the path exists on
// every user and sparse would still index all of them, colliding on the second
// unlinked account. The partial filter indexes only genuinely linked users.
userSchema.index(
    { 'telegram.chatId': 1 },
    { unique: true, partialFilterExpression: { 'telegram.chatId': { $type: 'string' } } },
);
userSchema.index({ 'telegram.linkCode': 1 });

/** Premium is only real while unexpired — expired subscriptions silently
 *  degrade to free without a cron having to flip the flag. */
userSchema.methods.hasPremium = function () {
    if (this.role === 'admin') return true;
    if (this.plan !== 'premium') return false;
    if (this.planExpiresAt && this.planExpiresAt < new Date()) return false;
    return true;
};

/** Shape the account page and the bot's /status both render. */
userSchema.methods.telegramStatus = function () {
    const t = this.telegram || {};
    return {
        linked: !!t.chatId,
        username: t.username || '',
        linkedAt: t.linkedAt || null,
        alerts: t.alerts !== false,
        digest: t.digest !== false,
        unreachable: !!t.unreachableAt,
    };
};

userSchema.methods.toSafeJSON = function () {
    return {
        id: this._id,
        name: this.name,
        email: this.email,
        role: this.role,
        plan: this.hasPremium() ? 'premium' : 'free',
        planExpiresAt: this.planExpiresAt,
        status: this.status,
        createdAt: this.createdAt,
        lastLoginAt: this.lastLoginAt,
    };
};

module.exports = mongoose.model('User', userSchema);
