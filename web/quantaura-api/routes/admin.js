const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Payment = require('../models/Payment');
const Settings = require('../models/Settings');
const { requireAdmin } = require('../middleware/auth');
const { PLAN_DAYS } = require('./billing');

router.use(requireAdmin);

// GET /api/admin/stats — overview numbers for the admin dashboard
router.get('/stats', async (req, res) => {
    try {
        const now = new Date();
        const dayAgo = new Date(now - 24 * 3600 * 1000);
        const weekAgo = new Date(now - 7 * 24 * 3600 * 1000);

        const [totalUsers, premiumUsers, bannedUsers, newUsersWeek, pendingPayments, approvedPayments, recentUsers, recentPayments, revenueAgg] = await Promise.all([
            User.countDocuments(),
            User.countDocuments({ plan: 'premium', $or: [{ planExpiresAt: null }, { planExpiresAt: { $gt: now } }] }),
            User.countDocuments({ status: 'banned' }),
            User.countDocuments({ createdAt: { $gt: weekAgo } }),
            Payment.countDocuments({ status: 'pending' }),
            Payment.countDocuments({ status: 'approved' }),
            User.find().sort({ createdAt: -1 }).limit(5),
            Payment.find({ status: 'pending' }).sort({ createdAt: -1 }).limit(5).populate('userId', 'name email'),
            Payment.aggregate([
                { $match: { status: 'approved' } },
                { $group: { _id: '$currency', total: { $sum: '$amount' }, count: { $sum: 1 } } },
            ]),
        ]);

        const activeToday = await User.countDocuments({ lastLoginAt: { $gt: dayAgo } });

        res.json({
            success: true,
            data: {
                users: { total: totalUsers, premium: premiumUsers, banned: bannedUsers, newThisWeek: newUsersWeek, activeToday },
                payments: { pending: pendingPayments, approved: approvedPayments },
                revenue: revenueAgg.map(r => ({ currency: r._id, total: r.total, count: r.count })),
                recentUsers: recentUsers.map(u => u.toSafeJSON()),
                recentPendingPayments: recentPayments,
            },
        });
    } catch (err) {
        console.error('Admin stats error:', err.message);
        res.status(500).json({ success: false, error: 'Failed to load stats.' });
    }
});

// GET /api/admin/users?search=&page=1&limit=20
router.get('/users', async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, parseInt(req.query.limit) || 20);
        const search = (req.query.search || '').trim();
        const q = search
            ? { $or: [{ email: { $regex: search, $options: 'i' } }, { name: { $regex: search, $options: 'i' } }] }
            : {};
        const [users, total] = await Promise.all([
            User.find(q).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
            User.countDocuments(q),
        ]);
        res.json({ success: true, data: { users: users.map(u => u.toSafeJSON()), total, page, pages: Math.ceil(total / limit) } });
    } catch (err) {
        console.error('Admin users error:', err.message);
        res.status(500).json({ success: false, error: 'Failed to load users.' });
    }
});

// PUT /api/admin/users/:id — change plan / role / status
router.put('/users/:id', async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ success: false, error: 'User not found.' });

        const { plan, planDays, role, status } = req.body || {};

        if (plan === 'free') {
            user.plan = 'free';
            user.planExpiresAt = null;
        } else if (plan === 'premium') {
            user.plan = 'premium';
            // planDays: number extends from now; null/0 = no expiry (lifetime)
            user.planExpiresAt = planDays ? new Date(Date.now() + planDays * 24 * 3600 * 1000) : null;
        }

        if (role && ['user', 'admin'].includes(role)) {
            if (user._id.equals(req.user._id) && role !== 'admin') {
                return res.status(400).json({ success: false, error: 'You cannot demote your own admin account.' });
            }
            user.role = role;
        }
        if (status && ['active', 'banned'].includes(status)) {
            if (user._id.equals(req.user._id) && status === 'banned') {
                return res.status(400).json({ success: false, error: 'You cannot ban your own account.' });
            }
            user.status = status;
        }

        await user.save();
        res.json({ success: true, data: user.toSafeJSON() });
    } catch (err) {
        console.error('Admin user update error:', err.message);
        res.status(500).json({ success: false, error: 'Failed to update user.' });
    }
});

// GET /api/admin/payments?status=pending&page=1
router.get('/payments', async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, parseInt(req.query.limit) || 20);
        const status = req.query.status;
        const q = ['pending', 'approved', 'rejected'].includes(status) ? { status } : {};
        const [payments, total] = await Promise.all([
            Payment.find(q).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).populate('userId', 'name email plan'),
            Payment.countDocuments(q),
        ]);
        res.json({ success: true, data: { payments, total, page, pages: Math.ceil(total / limit) } });
    } catch (err) {
        console.error('Admin payments error:', err.message);
        res.status(500).json({ success: false, error: 'Failed to load payments.' });
    }
});

// PUT /api/admin/payments/:id — { action: 'approve' | 'reject', note }
router.put('/payments/:id', async (req, res) => {
    try {
        const { action, note } = req.body || {};
        const payment = await Payment.findById(req.params.id);
        if (!payment) return res.status(404).json({ success: false, error: 'Payment not found.' });
        if (payment.status !== 'pending') {
            return res.status(409).json({ success: false, error: `Payment already ${payment.status}.` });
        }

        if (action === 'approve') {
            payment.status = 'approved';
            const user = await User.findById(payment.userId);
            if (user) {
                const days = PLAN_DAYS[payment.plan] || 30;
                // Extend from the current expiry if still active, else from now —
                // renewing early must not eat the remaining days.
                const base = user.hasPremium() && user.planExpiresAt ? user.planExpiresAt.getTime() : Date.now();
                user.plan = 'premium';
                user.planExpiresAt = new Date(base + days * 24 * 3600 * 1000);
                await user.save();
            }
        } else if (action === 'reject') {
            payment.status = 'rejected';
        } else {
            return res.status(400).json({ success: false, error: 'action must be approve or reject.' });
        }

        payment.reviewedBy = req.user._id;
        payment.reviewedAt = new Date();
        payment.reviewNote = (note || '').trim();
        await payment.save();
        res.json({ success: true, data: payment });
    } catch (err) {
        console.error('Admin payment review error:', err.message);
        res.status(500).json({ success: false, error: 'Failed to review payment.' });
    }
});

// GET /api/admin/settings
router.get('/settings', async (req, res) => {
    try {
        const s = await Settings.get();
        res.json({ success: true, data: s });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed to load settings.' });
    }
});

// PUT /api/admin/settings
router.put('/settings', async (req, res) => {
    try {
        const s = await Settings.get();
        const { pricing, paymentInstructions, paymentAccounts, freeSymbols, freeChatDailyLimit } = req.body || {};
        if (pricing?.monthly?.amount > 0) s.pricing.monthly = { ...s.pricing.monthly, ...pricing.monthly };
        if (pricing?.yearly?.amount > 0) s.pricing.yearly = { ...s.pricing.yearly, ...pricing.yearly };
        if (typeof paymentInstructions === 'string') s.paymentInstructions = paymentInstructions;
        if (paymentAccounts && typeof paymentAccounts === 'object') {
            s.paymentAccounts = { ...s.paymentAccounts, ...paymentAccounts };
        }
        if (Array.isArray(freeSymbols)) s.freeSymbols = freeSymbols.map(x => String(x).toUpperCase()).filter(Boolean);
        if (Number.isFinite(freeChatDailyLimit) && freeChatDailyLimit >= 0) s.freeChatDailyLimit = freeChatDailyLimit;
        await s.save();
        res.json({ success: true, data: s });
    } catch (err) {
        console.error('Admin settings error:', err.message);
        res.status(500).json({ success: false, error: 'Failed to update settings.' });
    }
});

module.exports = router;
