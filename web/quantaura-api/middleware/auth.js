const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'quantaura-dev-secret-change-in-production';
if (!process.env.JWT_SECRET) {
    console.warn('⚠️ JWT_SECRET not set — using insecure dev default. Set it in .env for production.');
}

const TOKEN_TTL = '30d';

function signToken(user) {
    return jwt.sign({ sub: user._id.toString() }, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

function dbReady() {
    return mongoose.connection.readyState === 1;
}

/** Attaches req.user if a valid Bearer token is present; never rejects.
 *  Routes that serve both tiers use this and check req.user themselves. */
async function optionalAuth(req, res, next) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    req.user = null;
    if (!token || !dbReady()) return next();
    try {
        const payload = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(payload.sub);
        if (user && user.status === 'active') req.user = user;
    } catch {
        // invalid/expired token — treat as anonymous
    }
    next();
}

function requireAuth(req, res, next) {
    if (!dbReady()) {
        return res.status(503).json({ success: false, error: 'Accounts are temporarily unavailable (database offline).' });
    }
    optionalAuth(req, res, () => {
        if (!req.user) {
            return res.status(401).json({ success: false, error: 'Login required.' });
        }
        next();
    });
}

function requireAdmin(req, res, next) {
    requireAuth(req, res, () => {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ success: false, error: 'Admin access required.' });
        }
        next();
    });
}

function requirePremium(req, res, next) {
    requireAuth(req, res, () => {
        if (!req.user.hasPremium()) {
            return res.status(403).json({
                success: false,
                error: 'This feature requires a Premium subscription.',
                upgradeRequired: true,
            });
        }
        next();
    });
}

module.exports = { signToken, optionalAuth, requireAuth, requireAdmin, requirePremium, dbReady };
