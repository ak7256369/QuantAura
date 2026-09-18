const express = require('express');
const router = express.Router();
const Payment = require('../models/Payment');
const Settings = require('../models/Settings');
const { requireAuth, dbReady } = require('../middleware/auth');

const PLAN_DAYS = { monthly: 30, yearly: 365 };

// Rails currently open for new payments. Payment.js still accepts the older
// local rails so historical rows stay valid — add them back here (and to the
// pricing page's METHODS) to start collecting on them again.
const ACTIVE_METHODS = ['binance'];

// GET /api/billing/plans — public: pricing + payment instructions
router.get('/plans', async (req, res) => {
    try {
        if (!dbReady()) {
            // Sensible defaults so the pricing page still renders without DB
            return res.json({
                success: true,
                data: {
                    pricing: {
                        monthly: { amount: 10, currency: 'USD' },
                        yearly: { amount: 100, currency: 'USD' },
                    },
                    paymentInstructions: 'Payments are temporarily unavailable — please try again later.',
                    paymentAccounts: { binance: '' },
                    methods: ACTIVE_METHODS,
                    available: false,
                },
            });
        }
        const s = await Settings.get();
        res.json({
            success: true,
            data: {
                pricing: s.pricing,
                paymentInstructions: s.paymentInstructions,
                // Only expose the rails we actually collect on — the schema
                // still carries the dormant local account numbers.
                paymentAccounts: Object.fromEntries(
                    ACTIVE_METHODS.map(m => [m, s.paymentAccounts[m === 'bank_transfer' ? 'bank' : m] || '']),
                ),
                methods: ACTIVE_METHODS,
                available: true,
            },
        });
    } catch (err) {
        console.error('Plans error:', err.message);
        res.status(500).json({ success: false, error: 'Failed to load plans.' });
    }
});

// POST /api/billing/submit — user submits a manual payment for review
router.post('/submit', requireAuth, async (req, res) => {
    try {
        const { plan, method, txnRef, senderName, notes } = req.body || {};
        if (!PLAN_DAYS[plan]) return res.status(400).json({ success: false, error: 'Invalid plan.' });
        if (!ACTIVE_METHODS.includes(method)) {
            return res.status(400).json({ success: false, error: 'Invalid payment method.' });
        }
        if (!txnRef || !txnRef.trim()) {
            return res.status(400).json({ success: false, error: 'Transaction reference is required.' });
        }

        const open = await Payment.findOne({ userId: req.user._id, status: 'pending' });
        if (open) {
            return res.status(409).json({ success: false, error: 'You already have a payment awaiting review.' });
        }

        const s = await Settings.get();
        const price = s.pricing[plan];
        const payment = await Payment.create({
            userId: req.user._id,
            plan,
            amount: price.amount,
            currency: price.currency,
            method,
            txnRef: txnRef.trim(),
            senderName: (senderName || '').trim(),
            notes: (notes || '').trim(),
        });
        res.status(201).json({ success: true, data: payment });
    } catch (err) {
        console.error('Payment submit error:', err.message);
        res.status(500).json({ success: false, error: 'Failed to submit payment.' });
    }
});

// GET /api/billing/payments — the caller's own payment history
router.get('/payments', requireAuth, async (req, res) => {
    try {
        const payments = await Payment.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(50);
        res.json({ success: true, data: payments });
    } catch (err) {
        console.error('Payment history error:', err.message);
        res.status(500).json({ success: false, error: 'Failed to load payments.' });
    }
});

module.exports = router;
module.exports.PLAN_DAYS = PLAN_DAYS;
module.exports.ACTIVE_METHODS = ACTIVE_METHODS;
