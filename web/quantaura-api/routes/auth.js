const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const User = require('../models/User');
const { signToken, requireAuth, dbReady } = require('../middleware/auth');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function guardDb(req, res, next) {
    if (!dbReady()) {
        return res.status(503).json({ success: false, error: 'Accounts are temporarily unavailable (database offline).' });
    }
    next();
}

// POST /api/auth/register
router.post('/register', guardDb, async (req, res) => {
    try {
        const { name, email, password } = req.body || {};
        if (!name || !name.trim()) return res.status(400).json({ success: false, error: 'Name is required.' });
        if (!EMAIL_RE.test(email || '')) return res.status(400).json({ success: false, error: 'A valid email is required.' });
        if (!password || password.length < 8) return res.status(400).json({ success: false, error: 'Password must be at least 8 characters.' });

        const existing = await User.findOne({ email: email.toLowerCase() });
        if (existing) return res.status(409).json({ success: false, error: 'An account with this email already exists.' });

        const passwordHash = await bcrypt.hash(password, 10);
        const user = await User.create({ name: name.trim(), email, passwordHash, lastLoginAt: new Date() });

        res.status(201).json({ success: true, data: { token: signToken(user), user: user.toSafeJSON() } });
    } catch (err) {
        console.error('Register error:', err.message);
        res.status(500).json({ success: false, error: 'Registration failed.' });
    }
});

// POST /api/auth/login
router.post('/login', guardDb, async (req, res) => {
    try {
        const { email, password } = req.body || {};
        const user = await User.findOne({ email: (email || '').toLowerCase() });
        if (!user || !(await bcrypt.compare(password || '', user.passwordHash))) {
            return res.status(401).json({ success: false, error: 'Invalid email or password.' });
        }
        if (user.status === 'banned') {
            return res.status(403).json({ success: false, error: 'This account has been suspended.' });
        }
        user.lastLoginAt = new Date();
        await user.save();
        res.json({ success: true, data: { token: signToken(user), user: user.toSafeJSON() } });
    } catch (err) {
        console.error('Login error:', err.message);
        res.status(500).json({ success: false, error: 'Login failed.' });
    }
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
    res.json({ success: true, data: req.user.toSafeJSON() });
});

// PUT /api/auth/me — update name and/or password
router.put('/me', requireAuth, async (req, res) => {
    try {
        const { name, currentPassword, newPassword } = req.body || {};
        if (name && name.trim()) req.user.name = name.trim();
        if (newPassword) {
            if (newPassword.length < 8) return res.status(400).json({ success: false, error: 'New password must be at least 8 characters.' });
            if (!(await bcrypt.compare(currentPassword || '', req.user.passwordHash))) {
                return res.status(401).json({ success: false, error: 'Current password is incorrect.' });
            }
            req.user.passwordHash = await bcrypt.hash(newPassword, 10);
        }
        await req.user.save();
        res.json({ success: true, data: req.user.toSafeJSON() });
    } catch (err) {
        console.error('Profile update error:', err.message);
        res.status(500).json({ success: false, error: 'Update failed.' });
    }
});

module.exports = router;
