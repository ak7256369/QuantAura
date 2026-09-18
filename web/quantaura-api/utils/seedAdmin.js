const bcrypt = require('bcryptjs');
const User = require('../models/User');

/** Ensures at least one admin account exists, and keeps its login in sync
 *  with ADMIN_EMAIL / ADMIN_PASSWORD when both are set: editing .env and
 *  restarting the API is how admin credentials are rotated — no DB shell
 *  needed. Without the env vars, a logged dev default is seeded on first
 *  run and any UI-set password is left untouched on later boots. */
async function seedAdmin() {
    const envEmail = process.env.ADMIN_EMAIL ? process.env.ADMIN_EMAIL.toLowerCase() : null;
    const envPassword = process.env.ADMIN_PASSWORD || null;

    // Oldest admin = the seeded one, even if other users were promoted later.
    const existing = await User.findOne({ role: 'admin' }).sort({ createdAt: 1 });
    if (existing) {
        if (envEmail && envPassword) {
            const emailChanged = existing.email !== envEmail;
            const passwordChanged = !(await bcrypt.compare(envPassword, existing.passwordHash));
            if (emailChanged || passwordChanged) {
                existing.email = envEmail;
                existing.passwordHash = await bcrypt.hash(envPassword, 10);
                await existing.save();
                console.log(`✅ Admin credentials synced from .env (${envEmail})`);
            }
        }
        return;
    }

    const email = envEmail || 'admin@quantaura.tech';
    const password = envPassword || 'ChangeMe123!';

    const passwordHash = await bcrypt.hash(password, 10);
    await User.create({
        name: 'Administrator',
        email,
        passwordHash,
        role: 'admin',
        plan: 'premium',
    });

    if (!process.env.ADMIN_PASSWORD) {
        console.warn(`⚠️ Seeded default admin ${email} / ${password} — set ADMIN_EMAIL and ADMIN_PASSWORD in .env and change this immediately.`);
    } else {
        console.log(`✅ Seeded admin account: ${email}`);
    }
}

module.exports = seedAdmin;
