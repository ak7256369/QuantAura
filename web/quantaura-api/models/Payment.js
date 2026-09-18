const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    plan: { type: String, enum: ['monthly', 'yearly'], required: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'USD' },
    // Manual payment rails — user pays outside the app and submits proof,
    // admin verifies against the real account statement and approves.
    // Only the rails in ACTIVE_METHODS (routes/billing.js) accept new
    // submissions; the rest stay listed so historical rows still validate
    // when an admin approves or rejects them.
    method: { type: String, enum: ['binance', 'jazzcash', 'easypaisa', 'bank_transfer', 'other'], required: true },
    txnRef: { type: String, required: true, trim: true, maxlength: 120 },
    senderName: { type: String, trim: true, maxlength: 80, default: '' },
    notes: { type: String, trim: true, maxlength: 500, default: '' },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    reviewNote: { type: String, trim: true, maxlength: 500, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('Payment', paymentSchema);
