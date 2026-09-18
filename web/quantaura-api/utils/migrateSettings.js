const Settings = require('../models/Settings');

/** One-off rewrites of the singleton Settings document.
 *
 *  Schema defaults only apply to a document that does not exist yet, so a
 *  deployment that already has settings keeps its old values forever. Each
 *  entry below runs once and is recorded in `migrations`, which is what stops
 *  it re-applying on the next boot and overwriting whatever the admin has
 *  since set from the panel.
 */
const MIGRATIONS = [
    {
        name: 'usd-binance-2026-08',
        apply(s) {
            s.pricing.monthly = { amount: 10, currency: 'USD' };
            s.pricing.yearly = { amount: 100, currency: 'USD' };
            s.paymentInstructions = Settings.schema.path('paymentInstructions').defaultValue;
        },
    },
];

async function migrateSettings() {
    const s = await Settings.get();
    const pending = MIGRATIONS.filter(m => !s.migrations.includes(m.name));
    if (pending.length === 0) return;

    for (const m of pending) {
        m.apply(s);
        s.migrations.push(m.name);
        console.log(`✅ Settings migration applied: ${m.name}`);
    }
    await s.save();
}

module.exports = migrateSettings;
