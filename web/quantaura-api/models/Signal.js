const mongoose = require('mongoose');

const signalSchema = new mongoose.Schema({
    symbol: { type: String, required: true, index: true },
    signal: { type: String, enum: ['BUY', 'SELL', 'HOLD'], required: true },
    confidence: { type: Number, required: true },
    ensemble: {
        lstm: { signal: String, confidence: Number },
        xgboost: { signal: String, confidence: Number },
        transformer: { signal: String, confidence: Number },
    },
    indicators: mongoose.Schema.Types.Mixed,
    macro: mongoose.Schema.Types.Mixed,
    explanation: String,
}, { timestamps: true });

module.exports = mongoose.model('Signal', signalSchema);
