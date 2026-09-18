'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import { User, Crown, KeyRound, CreditCard, AlertCircle, CheckCircle2, Sparkles, CalendarDays, Clock, Shield } from 'lucide-react';
import AnimatedPage from '@/components/Motion/AnimatedPage';
import TelegramCard from '@/components/Account/TelegramCard';
import { useAuth, authFetch } from '@/lib/auth';
import { money } from '@/lib/money';

interface PaymentRow {
    _id: string;
    plan: string;
    amount: number;
    currency: string;
    method: string;
    txnRef: string;
    status: 'pending' | 'approved' | 'rejected';
    reviewNote?: string;
    createdAt: string;
}

const PREMIUM_PERKS = [
    'AI signals for all 10 coins with confidence scores',
    'Per-model breakdown (LSTM · XGBoost · Transformer · KAN)',
    'AI-written signal explanations',
    'Strategy backtesting & signal history',
    'BTC coupling & propagation forecasts',
    'Unlimited AI crypto chat',
    'Telegram delivery: instant alerts + daily digest',
];

const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });

const STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
    pending:  { bg: 'var(--signal-hold-bg)', fg: 'var(--signal-hold)' },
    approved: { bg: 'var(--signal-buy-bg)',  fg: 'var(--signal-buy)' },
    rejected: { bg: 'var(--signal-sell-bg)', fg: 'var(--signal-sell)' },
};

export default function AccountPage() {
    const { user, loading, isPremium, refresh } = useAuth();
    const router = useRouter();
    const [payments, setPayments] = useState<PaymentRow[]>([]);
    const [name, setName] = useState('');
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (!loading && !user) router.push('/login?next=/account');
    }, [loading, user, router]);

    useEffect(() => {
        if (user) setName(user.name);
    }, [user]);

    useEffect(() => {
        if (!user) return;
        authFetch('/api/billing/payments').then(r => r.json())
            .then(j => { if (j.success) setPayments(j.data); })
            .catch(() => {});
    }, [user]);

    if (loading || !user) return null;

    const saveProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        setMsg(null);
        setBusy(true);
        try {
            const body: Record<string, string> = { name };
            if (newPassword) {
                body.currentPassword = currentPassword;
                body.newPassword = newPassword;
            }
            const res = await authFetch('/api/auth/me', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error || 'Update failed.');
            setMsg({ ok: true, text: 'Profile updated.' });
            setCurrentPassword('');
            setNewPassword('');
            refresh();
        } catch (err) {
            setMsg({ ok: false, text: err instanceof Error ? err.message : 'Update failed.' });
        } finally {
            setBusy(false);
        }
    };

    return (
        <AnimatedPage>
            <div className="page-header">
                <div>
                    <span className="page-badge indigo">Account</span>
                    <h1>My Account</h1>
                    <p>Manage your profile, plan and payments</p>
                </div>
            </div>

            <div className="account-grid">
                {/* Plan card */}
                <motion.div className="card" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
                    <div className="section-header"><Crown size={16} className="section-header-icon" /> Subscription</div>
                    <div className="account-plan-row">
                        <span className={`plan-badge ${isPremium ? 'premium' : 'free'}`}>
                            {isPremium ? <><Crown size={12} /> Premium</> : 'Free Plan'}
                        </span>
                        {isPremium && user.planExpiresAt && (
                            <span className="account-plan-expiry">
                                Active until {new Date(user.planExpiresAt).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </span>
                        )}
                        {isPremium && !user.planExpiresAt && user.role !== 'admin' && (
                            <span className="account-plan-expiry">Lifetime access</span>
                        )}
                        {user.role === 'admin' && <span className="account-plan-expiry">Administrator</span>}
                    </div>

                    <ul className="account-meta">
                        <li><CalendarDays size={13} /> Member since <b>{fmtDate(user.createdAt)}</b></li>
                        {user.lastLoginAt && <li><Clock size={13} /> Last sign-in <b>{fmtDate(user.lastLoginAt)}</b></li>}
                        <li><Shield size={13} /> Role <b>{user.role === 'admin' ? 'Administrator' : 'Member'}</b></li>
                    </ul>

                    <div className="account-perks-title">{isPremium ? 'Your plan includes' : 'Premium unlocks'}</div>
                    <ul className="account-perks">
                        {PREMIUM_PERKS.map(p => <li key={p}><CheckCircle2 size={13} /> {p}</li>)}
                    </ul>

                    {!isPremium && (
                        <Link href="/pricing" className="auth-submit" style={{ display: 'inline-flex', textDecoration: 'none', width: 'auto', padding: '10px 20px', marginTop: 16 }}>
                            <Sparkles size={14} /> Upgrade to Premium
                        </Link>
                    )}
                    {user.role === 'admin' && (
                        <Link href="/admin" className="auth-submit" style={{ display: 'inline-flex', textDecoration: 'none', width: 'auto', padding: '10px 20px', marginTop: 16 }}>
                            <Shield size={14} /> Open Admin Panel
                        </Link>
                    )}
                    {isPremium && user.role !== 'admin' && (
                        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 14 }}>
                            Thanks for supporting QuantAura. You can extend your subscription any time from the <Link href="/pricing" style={{ color: 'var(--accent-primary, #6366f1)' }}>pricing page</Link>.
                        </p>
                    )}
                </motion.div>

                {/* Profile card */}
                <motion.div className="card" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }}>
                    <div className="section-header"><User size={16} className="section-header-icon" /> Profile</div>
                    {msg && (
                        <div className={msg.ok ? 'pricing-note success' : 'auth-error'} style={{ marginBottom: 14 }}>
                            {msg.ok ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />} {msg.text}
                        </div>
                    )}
                    <form onSubmit={saveProfile} className="auth-form">
                        <label className="auth-field">
                            <span>Name</span>
                            <div className="auth-input-wrap">
                                <input type="text" value={name} onChange={e => setName(e.target.value)} maxLength={60} required />
                            </div>
                        </label>
                        <label className="auth-field">
                            <span>Email</span>
                            <div className="auth-input-wrap">
                                <input type="email" value={user.email} disabled style={{ opacity: 0.6 }} />
                            </div>
                        </label>
                        <div className="account-pw-row">
                            <label className="auth-field">
                                <span><KeyRound size={11} style={{ verticalAlign: -1 }} /> Current password</span>
                                <div className="auth-input-wrap">
                                    <input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)}
                                        placeholder="Only to change password" autoComplete="current-password" />
                                </div>
                            </label>
                            <label className="auth-field">
                                <span>New password</span>
                                <div className="auth-input-wrap">
                                    <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
                                        placeholder="Min. 8 characters" minLength={8} autoComplete="new-password" />
                                </div>
                            </label>
                        </div>
                        <button type="submit" className="auth-submit" disabled={busy}>
                            {busy ? 'Saving…' : 'Save Changes'}
                        </button>
                    </form>
                </motion.div>
            </div>

            {/* Telegram signal delivery */}
            <TelegramCard />

            {/* Payment history */}
            <motion.div className="card" style={{ marginTop: 24, overflowX: 'auto' }}
                initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
                <div className="section-header"><CreditCard size={16} className="section-header-icon" /> Payment History</div>
                {payments.length === 0 ? (
                    <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No payments yet.</p>
                ) : (
                    <table className="admin-table">
                        <thead>
                            <tr><th>Date</th><th>Plan</th><th>Amount</th><th>Method</th><th>Reference</th><th>Status</th></tr>
                        </thead>
                        <tbody>
                            {payments.map(p => (
                                <tr key={p._id}>
                                    <td>{new Date(p.createdAt).toLocaleDateString()}</td>
                                    <td style={{ textTransform: 'capitalize' }}>{p.plan}</td>
                                    <td>{money(p.amount, p.currency)}</td>
                                    <td style={{ textTransform: 'capitalize' }}>{p.method.replace('_', ' ')}</td>
                                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{p.txnRef}</td>
                                    <td>
                                        <span className="status-pill" style={{ background: STATUS_STYLE[p.status].bg, color: STATUS_STYLE[p.status].fg }}>
                                            {p.status}
                                        </span>
                                        {p.status === 'rejected' && p.reviewNote && (
                                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{p.reviewNote}</div>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </motion.div>
        </AnimatedPage>
    );
}
