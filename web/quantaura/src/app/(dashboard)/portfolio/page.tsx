'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Wallet, TrendingUp, Loader2, AlertTriangle, Clock, ScrollText } from 'lucide-react';

// Loaded on demand — keeps ~336 KB of recharts out of this route's first-load
// JS. Container is height-fixed (300px) so the late mount cannot shift layout.
const EquityChart = dynamic(() => import('@/components/Chart/charts').then(m => m.EquityChart), { ssr: false });
import AnimatedPage from '@/components/Motion/AnimatedPage';
import StaggerContainer, { staggerItem } from '@/components/Motion/StaggerContainer';

// ─── Types ────────────────────────────────────────────────────────────────────
interface CurvePoint { date: string; value: number; hold: number; price: number; signal: string }
interface Portfolio {
    start_usd: number; fee_pct_per_side: number; policy: string;
    since: string; days: number;
    value_usd: number; return_pct: number;
    hold_value_usd: number; hold_return_pct: number; vs_hold_pct: number;
    fees_paid_usd: number; trades: number; position: string;
    curve: CurvePoint[];
}
interface Scoreboard {
    pending?: boolean;
    resolved_calls?: number; hits?: number; misses?: number; accuracy_pct?: number | null;
    portfolio?: Portfolio | null;
}

const money = (v: number) =>
    `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const signed = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;

// ─────────────────────────────────────────────────────────────────────────────
export default function PortfolioPage() {
    const [board, setBoard] = useState<Scoreboard | null>(null);
    const [error, setError] = useState(false);

    useEffect(() => {
        fetch('/api/portfolio')
            .then(r => r.json())
            .then(json => setBoard(json.data ?? { pending: true }))
            .catch(() => setError(true));
    }, []);

    const p = board?.portfolio;

    return (
        <AnimatedPage>
            <div className="page-header">
                <h1>Paper Portfolio</h1>
                <p>A virtual $10,000 traded mechanically on the model&apos;s own public calls — fees included, wins and losses alike.</p>
            </div>

            {/* The point of the page, stated before any number. */}
            <motion.div
                className="card"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 200, damping: 25 }}
                style={{ marginBottom: 'var(--gap)' }}
            >
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <AlertTriangle size={18} style={{ color: 'var(--signal-hold)', flexShrink: 0, marginTop: 2 }} />
                    <p style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text-secondary)', margin: 0 }}>
                        Our own <Link href="/predictions" style={{ color: 'var(--accent-primary)' }}>honesty report</Link> says
                        the model&apos;s directional accuracy is around 52% and that, after fees, following its calls probably does{' '}
                        <strong>not</strong> beat simply holding Bitcoin. This page exists to test that claim in public:
                        every call is written to an append-only log <em>before</em> its outcome is knowable, never edited,
                        and this fake portfolio trades those calls with real fees. If it loses to buy-and-hold, you will see that here.
                        No real money is traded — deliberately.
                    </p>
                </div>
            </motion.div>

            {/* ── Loading / pending / data ─────────────────────────────────── */}
            {!board && !error && (
                <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center', padding: 40 }}>
                    <Loader2 size={18} className="spinning" />
                    <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading the record…</span>
                </div>
            )}

            {(error || (board && (board.pending || !p))) && !(!board && !error) && (
                <div className="card" style={{ textAlign: 'center', padding: 40 }}>
                    <Clock size={22} style={{ color: 'var(--text-muted)', marginBottom: 10 }} />
                    <div style={{ fontWeight: 700, marginBottom: 6 }}>The portfolio publishes soon</div>
                    <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6, maxWidth: 460, margin: '0 auto' }}>
                        The public prediction log is live and accumulating calls, and this page will chart the
                        portfolio built from it. Until then, the daily calls are on{' '}
                        <Link href="/predictions" style={{ color: 'var(--accent-primary)' }}>Predictions</Link>.
                    </p>
                </div>
            )}

            {p && (
                <>
                    <StaggerContainer className="backtest-results-grid">
                        {[
                            { label: 'Portfolio Value', value: money(p.value_usd), positive: p.return_pct >= 0 },
                            { label: 'Return', value: signed(p.return_pct), positive: p.return_pct >= 0 },
                            { label: 'Buy & Hold', value: signed(p.hold_return_pct), positive: p.hold_return_pct >= 0 },
                            { label: 'Vs Holding', value: signed(p.vs_hold_pct), positive: p.vs_hold_pct >= 0 },
                            { label: 'Fees Paid', value: money(p.fees_paid_usd), positive: false },
                            { label: 'Trades', value: p.trades, positive: true },
                            { label: 'Position Now', value: p.position === 'BTC' ? 'Long BTC' : 'In Cash', positive: true },
                            { label: 'Days Tracked', value: p.days, positive: true },
                        ].map((m) => (
                            <motion.div key={m.label} className="card backtest-metric" variants={staggerItem} whileHover={{ y: -3 }}>
                                <div className="backtest-metric-label">{m.label}</div>
                                <div className={`backtest-metric-value mono ${m.positive ? 'positive' : 'negative'}`}>{m.value}</div>
                            </motion.div>
                        ))}
                    </StaggerContainer>

                    {p.days < 14 && (
                        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: ' 10px 4px 0' }}>
                            This record is {p.days} {p.days === 1 ? 'day' : 'days'} old — far too short to conclude anything yet.
                            It gets more meaningful every day, and none of it will ever be rewritten.
                        </p>
                    )}

                    <motion.div
                        className="card"
                        style={{ marginTop: 'var(--gap)' }}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3, type: 'spring', stiffness: 200, damping: 25 }}
                    >
                        <div className="section-header">
                            <TrendingUp size={18} className="text-secondary" />
                            Equity Curve — Model vs Buy &amp; Hold
                        </div>
                        <div style={{ width: '100%', height: 300, marginTop: 20 }}>
                            <EquityChart data={p.curve.map(c => ({ date: c.date, equity: c.value, buyHold: c.hold }))} />
                        </div>
                        <p style={{ fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.6, marginTop: 12 }}>
                            {p.policy} · {p.fee_pct_per_side.toFixed(2)}% fee per side ·
                            marked at each day&apos;s committed call price · since {p.since} ·
                            ${p.start_usd.toLocaleString()} virtual starting capital.
                            Educational simulation — not financial advice.
                        </p>
                    </motion.div>

                    <motion.div
                        className="card"
                        style={{ marginTop: 'var(--gap)' }}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.4, type: 'spring', stiffness: 200, damping: 25 }}
                    >
                        <div className="section-header">
                            <ScrollText size={18} className="text-secondary" />
                            The Committed Calls
                        </div>
                        <div className="signals-table-container" style={{ maxHeight: 400, overflowY: 'auto' }}>
                            <table className="signals-table">
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>Call</th>
                                        <th>BTC Price</th>
                                        <th>Portfolio</th>
                                        <th>Buy &amp; Hold</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {[...p.curve].reverse().map((c) => (
                                        <tr key={c.date}>
                                            <td className="mono" style={{ fontSize: 12 }}>{c.date}</td>
                                            <td>
                                                <span className={`signal-badge ${c.signal === 'BUY' ? 'buy' : c.signal === 'SELL' ? 'sell' : 'hold'}`}>
                                                    {c.signal}
                                                </span>
                                            </td>
                                            <td className="mono">{money(c.price)}</td>
                                            <td className="mono">{money(c.value)}</td>
                                            <td className="mono" style={{ color: 'var(--text-muted)' }}>{money(c.hold)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <p style={{ fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.6, marginTop: 12 }}>
                            <Wallet size={12} style={{ verticalAlign: -2, marginRight: 4 }} />
                            The same log our YouTube channel grades on camera — one record, one grader.
                            Full accuracy breakdown on <Link href="/predictions" style={{ color: 'var(--accent-primary)' }}>Predictions</Link>.
                        </p>
                    </motion.div>
                </>
            )}
        </AnimatedPage>
    );
}
