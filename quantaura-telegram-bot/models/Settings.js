const mongoose = require('mongoose');

/**
 * ⚠ TRIMMED MIRROR — source of truth: quantaura-api/models/Settings.js.
 *
 * The bot only reads `freeSymbols` (which symbols the free tier may query via
 * /signals in chat), so only that path is declared. The admin panel writes
 * this document; the bot never does.
 */
const settingsSchema = new mongoose.Schema({
    key: { type: String, default: 'global', unique: true },
    freeSymbols: { type: [String], default: ['BTCUSDT', 'ETHUSDT'] },
}, { timestamps: true });

settingsSchema.statics.get = async function () {
    let doc = await this.findOne({ key: 'global' });
    if (!doc) doc = await this.create({ key: 'global' });
    return doc;
};

module.exports = mongoose.model('Settings', settingsSchema);
