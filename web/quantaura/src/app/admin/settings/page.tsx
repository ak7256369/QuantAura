'use client';

import React, { useEffect, useState } from 'react';
import { Save, CheckCircle2, AlertCircle } from 'lucide-react';
import { authFetch } from '@/lib/auth';

interface SettingsData {
    pricing: {
        monthly: { amount: number; currency: string };
        yearly: { amount: number; currency: string };
    };
    paymentInstructions: string;
    paymentAccounts: { binance: string; jazzcash: string; easypaisa: string; bank: string };
    freeSymbols: string[];
    freeChatDailyLimit: number;
}

export default function AdminSettingsPage() {
    const [s, setS] = useState<SettingsData | null>(null);
    const [freeSymbolsText, setFreeSymbolsText] = useState('');
    const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        authFetch('/api/admin/settings').then(r => r.json())
            .then(j => {
                if (j.success) {
                    setS(j.data);
                    setFreeSymbolsText((j.data.freeSymbols || []).join(', '));
                } else setMsg({ ok: false, text: j.error || 'Failed to load settings.' });
            })
            .catch(() => setMsg({ ok: false, text: 'Backend unreachable.' }));
    }, []);

    if (!s) return <div style={{ color: 'var(--text-muted)', padding: 40 }}>{msg?.text || 'Loading…'}</div>;

    const save = async (e: React.FormEvent) => {
        e.preventDefault();
        setMsg(null);
        setBusy(true);
        try {
            const res = await authFetch('/api/admin/settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...s,
                    freeSymbols: freeSymbolsText.split(',').map(x => x.trim().toUpperCase()).filter(Boolean),
                    freeChatDailyLimit: Number(s.freeChatDailyLimit),
                }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error);
            setS(json.data);
            setMsg({ ok: true, text: 'Settings saved.' });
        } catch (err) {
            setMsg({ ok: false, text: err instanceof Error ? err.message : 'Save failed.' });
        } finally {
            setBusy(false);
        }
    };

    const setPricing = (plan: 'monthly' | 'yearly', field: 'amount' | 'currency', value: string) => {
        setS(prev => prev && ({
            ...prev,
            pricing: {
                ...prev.pricing,
                [plan]: { ...prev.pricing[plan], [field]: field === 'amount' ? Number(value) : value },
            },
        }));
    };

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1>Settings</h1>
                    <p>Pricing, payment accounts and free-tier limits</p>
                </div>
            </div>

            {msg && (
                <div className={msg.ok ? 'pricing-note success' : 'auth-error'} style={{ marginBottom: 16 }}>
                    {msg.ok ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />} {msg.text}
                </div>
            )}

            <form onSubmit={save}>
                <div className="admin-two-col">
                    <div className="card">
                        <div className="section-header">Pricing</div>
                        {(['monthly', 'yearly'] as const).map(plan => (
                            <div key={plan} className="account-pw-row" style={{ marginBottom: 12 }}>
                                <label className="auth-field">
                                    <span style={{ textTransform: 'capitalize' }}>{plan} amount</span>
                                    <div className="auth-input-wrap">
                                        <input type="number" min={0} value={s.pricing[plan].amount}
                                            onChange={e => setPricing(plan, 'amount', e.target.value)} />
                                    </div>
                                </label>
                                <label className="auth-field">
                                    <span>Currency</span>
                                    <div className="auth-input-wrap">
                                        <input type="text" value={s.pricing[plan].currency} maxLength={5}
                                            onChange={e => setPricing(plan, 'currency', e.target.value.toUpperCase())} />
                                    </div>
                                </label>
                            </div>
                        ))}
                    </div>

                    <div className="card">
                        <div className="section-header">Free tier limits</div>
                        <label className="auth-field" style={{ marginBottom: 12 }}>
                            <span>Free signal symbols (comma-separated)</span>
                            <div className="auth-input-wrap">
                                <input type="text" value={freeSymbolsText} onChange={e => setFreeSymbolsText(e.target.value)}
                                    placeholder="BTCUSDT, ETHUSDT" />
                            </div>
                        </label>
                        <label className="auth-field">
                            <span>Free AI chat messages per day</span>
                            <div className="auth-input-wrap">
                                <input type="number" min={0} value={s.freeChatDailyLimit}
                                    onChange={e => setS(prev => prev && ({ ...prev, freeChatDailyLimit: Number(e.target.value) }))} />
                            </div>
                        </label>
                    </div>
                </div>

                <div className="card" style={{ marginTop: 20 }}>
                    <div className="section-header">Payment collection</div>
                    <label className="auth-field" style={{ marginBottom: 12 }}>
                        <span>Instructions shown to users</span>
                        <textarea className="admin-textarea" rows={3} value={s.paymentInstructions}
                            onChange={e => setS(prev => prev && ({ ...prev, paymentInstructions: e.target.value }))} />
                    </label>
                    <label className="auth-field">
                        <span>Binance account</span>
                        <div className="auth-input-wrap">
                            <input type="text" value={s.paymentAccounts.binance}
                                onChange={e => setS(prev => prev && ({
                                    ...prev,
                                    paymentAccounts: { ...prev.paymentAccounts, binance: e.target.value },
                                }))}
                                placeholder="Binance Pay ID / email (e.g. Pay ID 123456789)" />
                        </div>
                        <span className="admin-field-hint">
                            Shown on the pricing page. Binance is the only rail accepting payments right now —
                            the older local accounts are still stored and can be switched back on in
                            <code> routes/billing.js → ACTIVE_METHODS</code>.
                        </span>
                    </label>
                </div>

                <button type="submit" className="auth-submit" disabled={busy} style={{ marginTop: 20, width: 'auto', padding: '11px 26px' }}>
                    <Save size={14} /> {busy ? 'Saving…' : 'Save Settings'}
                </button>
            </form>
        </div>
    );
}
