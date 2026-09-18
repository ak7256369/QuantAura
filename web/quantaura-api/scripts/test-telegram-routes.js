/**
 * Route-level check for /api/telegram/* — boots the real server against an
 * in-memory MongoDB and walks the linking lifecycle over HTTP, exactly as the
 * account page will.
 *
 * Usage: node scripts/test-telegram-routes.js
 */
const { MongoMemoryServer } = require('mongodb-memory-server');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'dev-only-secret';
process.env.PORT = '5099';
process.env.TELEGRAM_BOT_USERNAME = 'quantaura_test_bot';

const assert = require('assert');
const BASE = 'http://127.0.0.1:5099';
let passed = 0;
function ok(cond, label) { assert(cond, label); passed += 1; console.log(`  ✓ ${label}`); }

(async () => {
    const mongod = await MongoMemoryServer.create();
    process.env.MONGODB_URI = mongod.getUri('quantaura_route_test');
    require('../server');
    await new Promise((r) => setTimeout(r, 2500));   // let listen + seedAdmin finish

    const api = async (path, { method = 'GET', token, body } = {}) => {
        const res = await fetch(`${BASE}${path}`, {
            method,
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: body ? JSON.stringify(body) : undefined,
        });
        return { status: res.status, body: await res.json() };
    };

    // Anonymous callers are rejected.
    let r = await api('/api/telegram/status');
    ok(r.status === 401, 'status requires auth');

    // Register a user and walk the flow.
    r = await api('/api/auth/register', { method: 'POST', body: { name: 'Route Test', email: 'route@test.dev', password: 'password123' } });
    ok(r.status === 201, 'test user registers');
    const token = r.body.data.token;

    r = await api('/api/telegram/status', { token });
    ok(r.status === 200 && r.body.data.linked === false, 'fresh account reports unlinked');
    ok(r.body.data.botUsername === 'quantaura_test_bot', 'status carries the bot username');

    r = await api('/api/telegram/link-code', { method: 'POST', token });
    ok(r.status === 200 && /^[A-Z2-9]{8}$/.test(r.body.data.code), 'link-code issues an 8-char code');
    ok(r.body.data.deepLink === `https://t.me/quantaura_test_bot?start=${r.body.data.code}`, 'deep link is built from the code');
    const code = r.body.data.code;

    r = await api('/api/telegram/status', { token });
    ok(r.body.data.pendingCode === code, 'pending code survives into status (page-reload path)');

    // Simulate the bot pairing (what commands.handleLink does).
    const mongoose = require('mongoose');
    const User = mongoose.model('User');
    const user = await User.findOne({ email: 'route@test.dev' });
    user.telegram.chatId = '9001';
    user.telegram.username = 'routetester';
    user.telegram.linkedAt = new Date();
    user.telegram.linkCode = null;
    user.telegram.linkCodeExpiresAt = null;
    await user.save();

    r = await api('/api/telegram/status', { token });
    ok(r.body.data.linked === true && r.body.data.username === 'routetester', 'status flips to linked after pairing');

    r = await api('/api/telegram/link-code', { method: 'POST', token });
    ok(r.status === 409, 'link-code refuses while already linked');

    r = await api('/api/telegram/prefs', { method: 'PUT', token, body: { alerts: false } });
    ok(r.status === 200 && r.body.data.alerts === false && r.body.data.digest === true, 'prefs update one flag without touching the other');

    r = await api('/api/telegram/link', { method: 'DELETE', token });
    ok(r.status === 200 && r.body.data.linked === false, 'unlink disconnects');

    console.log(`\n✅ ${passed} route assertions passed.`);
    process.exit(0);
})().catch((err) => {
    console.error(`\n❌ ${err.message}`);
    process.exit(1);
});
