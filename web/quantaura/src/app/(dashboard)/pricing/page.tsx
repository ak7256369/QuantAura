'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import { Check, X, Crown, Sparkles, Send, AlertCircle, Clock, CheckCircle2 } from 'lucide-react';
import AnimatedPage from '@/components/Motion/AnimatedPage';
import { useAuth, authFetch } from '@/lib/auth';
import { money } from '@/lib/money';

interface Plans {
    pricing: {
        monthly: { amount: number; currency: string };
        yearly: { amount: number; currency: string };
    };
    paymentInstructions: string;
    paymentAccounts: { binance?: string };
    available: boolean;
}

const FEATURES: { label: string; free: boolean | string; premium: boolean | string }[] = [
    { label: 'Live market data & charts (10 coins)', free: true, premium: true },
    { label: 'Real-time crypto news feed', free: true, premium: true },
    { label: 'Signal honesty report (tradeability)', free: true, premium: true },
    { label: 'AI signal direction (BUY / SELL / HOLD)', free: 'BTC & ETH only', premium: 'All 10 coins' },
    { label: 'Model confidence scores', free: false, premium: true },
    { label: 'Per-model breakdown (LSTM · XGBoost · Transformer · KAN)', free: false, premium: true },
    { label: 'Probability breakdown & ensemble weights', free: false, premium: true },
    { label: 'AI-written signal explanations', free: false, premium: true },
    { label: 'Strategy backtesting engine', free: false, premium: true },
    { label: 'Signal history', free: false, premium: true },
    { label: 'BTC coupling & propagation forecasts', free: false, premium: true },
    { label: 'AI crypto chat', free: '5 messages / day', premium: 'Unlimited' },
];

// Binance is the only rail open right now — keep this in step with
// ACTIVE_METHODS in quantaura-api/routes/billing.js, which rejects anything
// else server-side.
const METHODS = [
    { value: 'binance', label: 'Binance (USDT / Binance Pay)' },
];

function FeatureCell({ v }: { v: boolean | string }) {
    if (v === true) return <Check size={15} style={{ color: 'var(--signal-buy)' }} />;
    if (v === false) return <X size={15} style={{ color: 'var(--text-muted)', opacity: 0.5 }} />;
    return <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{v}</span>;
}

export default function PricingPage() {
    const { user, isPremium, refresh } = useAuth();
    const router = useRouter();
    const [plans, setPlans] = useState<Plans | null>(null);
    const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'yearly'>('monthly');
    const [showForm, setShowForm] = useState(false);
    const [method, setMethod] = useState(METHODS[0].value);
    const [txnRef, setTxnRef] = useState('');
    const [senderName, setSenderName] = useState('');
    const [notes, setNotes] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [submitted, setSubmitted] = useState(false);
    const [hasPending, setHasPending] = useState(false);

    useEffect(() => {
        fetch('/api/billing/plans').then(r => r.json())
            .then(j => { if (j.success) setPlans(j.data); })
            .catch(() => {});
    }, []);

    useEffect(() => {
        if (!user) return;
        authFetch('/api/billing/payments').then(r => r.json())
            .then(j => {
                if (j.success) setHasPending(j.data.some((p: { status: string }) => p.status === 'pending'));
            })
            .catch(() => {});
    }, [user]);

    const price = (p: 'monthly' | 'yearly') =>
        plans ? money(plans.pricing[p].amount, plans.pricing[p].currency) : '…';

    const startUpgrade = (plan: 'monthly' | 'yearly') => {
        if (!user) { router.push('/register'); return; }
        setSelectedPlan(plan);
        setShowForm(true);
        setError('');
    };

    const submitPayment = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setBusy(true);
        try {
            const res = await authFetch('/api/billing/submit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ plan: selectedPlan, method, txnRef, senderName, notes }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error || 'Submission failed.');
            setSubmitted(true);
            setHasPending(true);
            setShowForm(false);
            refresh();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Submission failed.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <AnimatedPage>
            <div className="page-header">
                <div>
                    <span className="page-badge indigo">Plans & Pricing</span>
                    <h1>Unlock the full model</h1>
                    <p>The free tier shows you the direction. Premium shows you everything the ensemble knows — confidence, per-model votes, probabilities and forecasts.</p>
                </div>
            </div>

            {isPremium && (
                <div className="pricing-note success">
                    <CheckCircle2 size={16} /> You are on Premium
                    {user?.planExpiresAt && <> — active until {new Date(user.planExpiresAt).toLocaleDateString()}</>}. You can renew below to extend your subscription.
                </div>
            )}

            {hasPending && !submitted && (
                <div className="pricing-note pending">
                    <Clock size={16} /> You have a payment awaiting verification. Your plan will be upgraded once it is approved (usually within 24 hours).
                </div>
            )}

            {submitted && (
                <div className="pricing-note success">
                    <CheckCircle2 size={16} /> Payment submitted! We will verify it and activate Premium — usually within 24 hours. Track it on your <Link href="/account">account page</Link>.
                </div>
            )}

            {/* Plan cards */}
            <div className="pricing-grid">
                <motion.div className="card pricing-card" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                    <div className="pricing-plan-name">Free</div>
                    <div className="pricing-price">{money(0, plans?.pricing.monthly.currency ?? 'USD')}<span> / forever</span></div>
                    <p className="pricing-desc">Market data, news and the model&apos;s directional call on BTC & ETH.</p>
                    {user
                        ? <div className="pricing-current">{!isPremium ? 'Your current plan' : 'Included in Premium'}</div>
                        : <Link href="/register" className="pricing-btn secondary">Start Free</Link>}
                </motion.div>

                <motion.div className="card pricing-card featured" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
                    <div className="pricing-flag"><Crown size={12} /> Most Popular</div>
                    <div className="pricing-plan-name">Premium Monthly</div>
                    <div className="pricing-price">{price('monthly')}<span> / month</span></div>
                    <p className="pricing-desc">Every signal, every coin, full ensemble transparency, backtesting and unlimited AI chat.</p>
                    <button className="pricing-btn primary" onClick={() => startUpgrade('monthly')} disabled={hasPending}>
                        <Sparkles size={14} /> {isPremium ? 'Renew Monthly' : 'Upgrade Monthly'}
                    </button>
                </motion.div>

                <motion.div className="card pricing-card" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }}>
                    <div className="pricing-plan-name">Premium Yearly</div>
                    <div className="pricing-price">{price('yearly')}<span> / year</span></div>
                    <p className="pricing-desc">Same full access, two months free compared to paying monthly.</p>
                    <button className="pricing-btn primary" onClick={() => startUpgrade('yearly')} disabled={hasPending}>
                        <Sparkles size={14} /> {isPremium ? 'Renew Yearly' : 'Upgrade Yearly'}
                    </button>
                </motion.div>
            </div>

            {/* Payment form */}
            {showForm && plans && (
                <motion.div className="card payment-form-card" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
                    <div className="section-header"><Send size={16} className="section-header-icon" /> Complete your {selectedPlan} upgrade — {price(selectedPlan)}</div>
                    <p className="payment-instructions">{plans.paymentInstructions}</p>
                    <div className="payment-accounts">
                        {plans.paymentAccounts.binance
                            ? <div><strong>Binance:</strong> {plans.paymentAccounts.binance}</div>
                            : <div style={{ color: 'var(--text-muted)' }}>Payment account details will be shared by the administrator.</div>}
                    </div>

                    {error && <div className="auth-error"><AlertCircle size={14} /> {error}</div>}

                    <form onSubmit={submitPayment} className="payment-form">
                        <label className="auth-field">
                            <span>Payment method</span>
                            <select value={method} onChange={e => setMethod(e.target.value)} className="payment-select"
                                disabled={METHODS.length === 1}>
                                {METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                            </select>
                            <span className="payment-method-hint">More payment options are coming soon.</span>
                        </label>
                        <label className="auth-field">
                            <span>Transaction ID *</span>
                            <div className="auth-input-wrap">
                                <input type="text" required value={txnRef} onChange={e => setTxnRef(e.target.value)}
                                    placeholder="Binance transaction / order ID" maxLength={120} />
                            </div>
                        </label>
                        <label className="auth-field">
                            <span>Sender name (as on the payment)</span>
                            <div className="auth-input-wrap">
                                <input type="text" value={senderName} onChange={e => setSenderName(e.target.value)}
                                    placeholder="Optional" maxLength={80} />
                            </div>
                        </label>
                        <label className="auth-field">
                            <span>Notes</span>
                            <div className="auth-input-wrap">
                                <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
                                    placeholder="Optional" maxLength={500} />
                            </div>
                        </label>
                        <div style={{ display: 'flex', gap: 10 }}>
                            <button type="submit" className="auth-submit" disabled={busy} style={{ flex: 1 }}>
                                {busy ? 'Submitting…' : 'Submit for Verification'}
                            </button>
                            <button type="button" className="pricing-btn secondary" onClick={() => setShowForm(false)}>Cancel</button>
                        </div>
                    </form>
                </motion.div>
            )}

            {/* Feature comparison */}
            <div className="card" style={{ marginTop: 24, overflowX: 'auto' }}>
                <div className="section-header">What each plan includes</div>
                <table className="compare-table">
                    <thead>
                        <tr><th>Feature</th><th>Free</th><th><Crown size={12} style={{ verticalAlign: -2 }} /> Premium</th></tr>
                    </thead>
                    <tbody>
                        {FEATURES.map(f => (
                            <tr key={f.label}>
                                <td>{f.label}</td>
                                <td><FeatureCell v={f.free} /></td>
                                <td><FeatureCell v={f.premium} /></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </AnimatedPage>
    );
}
