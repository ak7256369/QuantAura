const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const User = require('../models/User');
const { requireAuth } = require('../middleware/auth');

// Codes are read off a screen and typed into a phone, so the alphabet excludes
// the pairs people reliably mistype: 0/O, 1/I/L, 5/S, 8/B.
const CODE_ALPHABET = 'ACDEFGHJKMNPQRTUVWXY2346789';
const CODE_LENGTH = 8;
const CODE_TTL_MS = 15 * 60 * 1000;

// Public @name of the bot, used to build the one-tap deep link. This is NOT
// optional in practice: the account page treats a null botUsername as "no bot
// exists yet" and hides the Telegram card entirely, so leaving it blank removes
// the feature from the UI with no other symptom. Say so at boot — the failure
// is otherwise invisible from the server side.
const BOT_USERNAME = (process.env.TELEGRAM_BOT_USERNAME || '').replace(/^@/, '');
if (!BOT_USERNAME) {
    console.warn(
        '[telegram] TELEGRAM_BOT_USERNAME is not set — the account page will hide '
        + 'the Telegram card and no one can pair an account. Set it to the bot\'s '
        + 'public @name (without the @), the same value the bot itself uses.',
    );
}

function generateCode() {
    // rejection-free: 27 symbols do not divide 256 evenly, but the bias is
    // ~0.4% per character and this is a 15-minute pairing token, not a key.
    const bytes = crypto.randomBytes(CODE_LENGTH);
    let out = '';
    for (let i = 0; i < CODE_LENGTH; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
    return out;
}

// POST /api/telegram/link-code — issue a short-lived, single-use pairing code.
//
// The code is what proves "this Telegram account belongs to that QuantAura
// account". It replaces the alternative of asking users to type their site
// password into a chat window, which would train exactly the habit that gets
// crypto users phished.
router.post('/link-code', requireAuth, async (req, res) => {
    try {
        if (req.user.telegram?.chatId) {
            return res.status(409).json({
                success: false,
                error: 'This account is already connected to Telegram. Disconnect it first.',
            });
        }

        // Collisions are vanishingly unlikely but not impossible, and a
        // collision would hand one user's premium feed to another.
        let code;
        for (let attempt = 0; attempt < 5; attempt++) {
            code = generateCode();
            const clash = await User.findOne({
                'telegram.linkCode': code,
                'telegram.linkCodeExpiresAt': { $gt: new Date() },
            }).select('_id');
            if (!clash) break;
            code = null;
        }
        if (!code) {
            return res.status(500).json({ success: false, error: 'Could not generate a code. Try again.' });
        }

        const expiresAt = new Date(Date.now() + CODE_TTL_MS);
        req.user.telegram.linkCode = code;
        req.user.telegram.linkCodeExpiresAt = expiresAt;
        await req.user.save();

        res.json({
            success: true,
            data: {
                code,
                expiresAt,
                botUsername: BOT_USERNAME || null,
                // Telegram forwards the ?start= payload to the bot as
                // "/start <payload>", so tapping this link pairs the account
                // without the user typing anything.
                deepLink: BOT_USERNAME ? `https://t.me/${BOT_USERNAME}?start=${code}` : null,
            },
        });
    } catch (err) {
        console.error('Telegram link-code error:', err.message);
        res.status(500).json({ success: false, error: 'Failed to create a link code.' });
    }
});

// GET /api/telegram/status — what the account page renders.
router.get('/status', requireAuth, (req, res) => {
    const t = req.user.telegram || {};
    const pending = t.linkCode && t.linkCodeExpiresAt && t.linkCodeExpiresAt > new Date();
    res.json({
        success: true,
        data: {
            ...req.user.telegramStatus(),
            premium: req.user.hasPremium(),
            botUsername: BOT_USERNAME || null,
            pendingCode: pending ? t.linkCode : null,
            pendingCodeExpiresAt: pending ? t.linkCodeExpiresAt : null,
        },
    });
});

// PUT /api/telegram/prefs — { alerts?, digest? }
router.put('/prefs', requireAuth, async (req, res) => {
    try {
        const { alerts, digest } = req.body || {};
        if (typeof alerts === 'boolean') req.user.telegram.alerts = alerts;
        if (typeof digest === 'boolean') req.user.telegram.digest = digest;
        await req.user.save();
        res.json({ success: true, data: req.user.telegramStatus() });
    } catch (err) {
        console.error('Telegram prefs error:', err.message);
        res.status(500).json({ success: false, error: 'Failed to update preferences.' });
    }
});

// DELETE /api/telegram/link — disconnect Telegram from this account.
router.delete('/link', requireAuth, async (req, res) => {
    try {
        req.user.telegram.chatId = null;
        req.user.telegram.username = '';
        req.user.telegram.firstName = '';
        req.user.telegram.linkedAt = null;
        req.user.telegram.unreachableAt = null;
        req.user.telegram.linkCode = null;
        req.user.telegram.linkCodeExpiresAt = null;
        await req.user.save();
        res.json({ success: true, data: req.user.telegramStatus() });
    } catch (err) {
        console.error('Telegram unlink error:', err.message);
        res.status(500).json({ success: false, error: 'Failed to disconnect Telegram.' });
    }
});

module.exports = router;
module.exports.CODE_TTL_MS = CODE_TTL_MS;
