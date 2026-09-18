const mongoose = require('mongoose');

/**
 * ⚠ TRIMMED MIRROR — the schema's source of truth is
 * quantaura-api/models/User.js in the QuantAura product repo.
 *
 * The bot shares the production `users` collection with the API but declares
 * only the paths it actually reads or writes. That is safe because mongoose
 * updates are $set-per-modified-path: fields this schema does not declare
 * (passwordHash, chatUsage, …) are simply invisible here and pass through
 * untouched. What it does require is discipline in one direction:
 *
 *   any change to `telegram.*`, `plan`/`planExpiresAt`, or hasPremium()
 *   semantics in quantaura-api MUST be mirrored here, and vice versa.
 *
 * No `required`/`unique` constraints on identity fields on purpose — the bot
 * never creates users, so enforcing creation-time rules here could only drift
 * from the API's.
 */
const userSchema = new mongoose.Schema({
    name: { type: String, trim: true },
    email: { type: String, lowercase: true, trim: true, index: true },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    plan: { type: String, enum: ['free', 'premium'], default: 'free' },
    planExpiresAt: { type: Date, default: null },
    status: { type: String, enum: ['active', 'banned'], default: 'active' },
    telegram: {
        chatId: { type: String, default: null },
        username: { type: String, default: '' },
        firstName: { type: String, default: '' },
        linkedAt: { type: Date, default: null },
        alerts: { type: Boolean, default: true },
        digest: { type: Boolean, default: true },
        unreachableAt: { type: Date, default: null },
        expiredNotifiedAt: { type: Date, default: null },
        linkCode: { type: String, default: null },
        linkCodeExpiresAt: { type: Date, default: null },
    },
}, { timestamps: true, strict: true });

// Identical to the API's definition — whichever process boots first creates
// it, the other finds it already present. One Telegram account maps to at
// most one QuantAura account; the partial filter indexes only linked users
// (chatId defaults to null on every doc, so `sparse` would not work).
userSchema.index(
    { 'telegram.chatId': 1 },
    { unique: true, partialFilterExpression: { 'telegram.chatId': { $type: 'string' } } },
);
userSchema.index({ 'telegram.linkCode': 1 });

/** Premium is only real while unexpired — mirrors quantaura-api exactly. */
userSchema.methods.hasPremium = function () {
    if (this.role === 'admin') return true;
    if (this.plan !== 'premium') return false;
    if (this.planExpiresAt && this.planExpiresAt < new Date()) return false;
    return true;
};

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

module.exports = mongoose.model('User', userSchema);
