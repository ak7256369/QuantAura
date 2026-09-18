const mongoose = require('mongoose');

const newsSchema = new mongoose.Schema({
    title: { type: String, required: true },
    url: { type: String, required: true, unique: true },
    source: String,
    publishedAt: Date,
    sentiment: { type: String, enum: ['bullish', 'bearish', 'neutral'], default: 'neutral' },
    impact: { type: String, enum: ['high', 'medium', 'low'], default: 'medium' },
    aiSummary: String,
    keyFactors: [String],
    currencies: [String],
    originalContent: String,
}, { timestamps: true });

newsSchema.index({ publishedAt: -1 });

module.exports = mongoose.model('News', newsSchema);
