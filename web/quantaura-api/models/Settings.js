const mongoose = require('mongoose');

// Singleton document (key: 'global') so pricing and gating knobs are editable
// from the admin panel without a redeploy.
const settingsSchema = new mongoose.Schema({
    key: { type: String, default: 'global', unique: true },
    pricing: {
        monthly: {
            amount: { type: Number, default: 10 },
            currency: { type: String, default: 'USD' },
        },
        yearly: {
            amount: { type: Number, default: 100 },
            currency: { type: String, default: 'USD' },
        },
    },
    // Rendered on the pricing page so users know where to send money.
    paymentInstructions: {
        type: String,
        default: 'Send the plan amount in USDT to the Binance account below (Binance Pay is instant and fee-free), then submit the transaction ID. Your account is upgraded once the payment is verified — usually within 24 hours.',
    },
    // Binance is the only rail we collect on today; the local rails are kept
    // in the schema so previously entered details survive and can be switched
    // back on by adding them to ACTIVE_METHODS in routes/billing.js.
    paymentAccounts: {
        binance: { type: String, default: '' },
        jazzcash: { type: String, default: '' },
        easypaisa: { type: String, default: '' },
        bank: { type: String, default: '' },
    },
    // Names of one-off data migrations already applied to this document, so a
    // migration that rewrites admin-editable values can never run twice and
    // stomp a later manual edit. See utils/migrateSettings.js.
    migrations: { type: [String], default: [] },
    // Which symbols free users get live signals for.
    freeSymbols: { type: [String], default: ['BTCUSDT', 'ETHUSDT'] },
    freeChatDailyLimit: { type: Number, default: 5 },
}, { timestamps: true });

settingsSchema.statics.get = async function () {
    let doc = await this.findOne({ key: 'global' });
    if (!doc) doc = await this.create({ key: 'global' });
    return doc;
};

module.exports = mongoose.model('Settings', settingsSchema);
