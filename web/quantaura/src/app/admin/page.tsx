'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { motion } from 'motion/react';
import { Users, Crown, Clock, TrendingUp, Wallet, UserPlus, RefreshCw } from 'lucide-react';
import { authFetch } from '@/lib/auth';

interface AdminStats {
    users: { total: number; premium: number; banned: number; newThisWeek: number; activeToday: number };
    payments: { pending: number; approved: number };
    revenue: { currency: string; total: number; count: number }[];
    recentUsers: { id: string; name: string; email: string; plan: string; createdAt: string }[];
    recentPendingPayments: {
        _id: string; plan: string; amount: number; currency: string; method: string; txnRef: string;
        createdAt: string; userId: { name: string; email: string } | null;
    }[];
}

export default function AdminOverviewPage() {
    const [stats, setStats] = useState<AdminStats | null>(null);
    const [error, setError] = useState('');

    const load = useCallback(() => {
        authFetch('/api/admin/stats').then(r => r.json())
            .then(j => { if (j.success) setStats(j.data); else setError(j.error || 'Failed to load stats.'); })
            .catch(() => setError('Backend unreachable.'));
    }, []);

    useEffect(() => { load(); }, [load]);

    if (error) return <div className="auth-error" style={{ marginTop: 20 }}>{error}</div>;
    if (!stats) return <div style={{ color: 'var(--text-muted)', padding: 40 }}>Loading…</div>;

    const cards = [
        { label: 'Total Users', value: stats.users.total, icon: <Users size={16} />, color: '#6366f1' },
        { label: 'Premium Users', value: stats.users.premium, icon: <Crown size={16} />, color: 'var(--signal-hold)' },
        { label: 'New This Week', value: stats.users.newThisWeek, icon: <UserPlus size={16} />, color: 'var(--signal-buy)' },
        { label: 'Active Today', value: stats.users.activeToday, icon: <TrendingUp size={16} />, color: '#22d3ee' },
        { label: 'Pending Payments', value: stats.payments.pending, icon: <Clock size={16} />, color: 'var(--signal-hold)' },
        ...stats.revenue.map(r => ({
            label: `Revenue (${r.currency})`, value: r.total, icon: <Wallet size={16} />, color: 'var(--signal-buy)',
        })),
    ];

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1>Overview</h1>
                    <p>Users, subscriptions and revenue at a glance</p>
                </div>
                <button className="pred-filter-btn" onClick={load} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <RefreshCw size={13} /> Refresh
                </button>
            </div>

            <div className="admin-stat-grid">
                {cards.map((c, i) => (
                    <motion.div key={c.label} className="card admin-stat-card"
                        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                        <div className="pred-summary-icon" style={{ background: `${'#6366f1' === c.color ? 'rgba(99,102,241,0.1)' : 'var(--bg-hover)'}`, color: c.color }}>
                            {c.icon}
                        </div>
                        <div>
                            <div className="pred-summary-label">{c.label}</div>
                            <div className="pred-summary-value" style={{ color: c.color }}>{c.value.toLocaleString()}</div>
                        </div>
                    </motion.div>
                ))}
            </div>

            <div className="admin-two-col">
                <div className="card">
                    <div className="section-header">Pending payments {stats.payments.pending > 0 && <span className="admin-count-pill">{stats.payments.pending}</span>}</div>
                    {stats.recentPendingPayments.length === 0
                        ? <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Nothing awaiting review. 🎉</p>
                        : (
                            <>
                                <table className="admin-table">
                                    <thead><tr><th>User</th><th>Plan</th><th>Amount</th><th>Ref</th></tr></thead>
                                    <tbody>
                                        {stats.recentPendingPayments.map(p => (
                                            <tr key={p._id}>
                                                <td>{p.userId?.name || '—'}<div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.userId?.email}</div></td>
                                                <td style={{ textTransform: 'capitalize' }}>{p.plan}</td>
                                                <td>{p.currency} {p.amount.toLocaleString()}</td>
                                                <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{p.txnRef}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                <Link href="/admin/payments" className="admin-link">Review payments →</Link>
                            </>
                        )}
                </div>

                <div className="card">
                    <div className="section-header">Newest users</div>
                    <table className="admin-table">
                        <thead><tr><th>Name</th><th>Email</th><th>Plan</th><th>Joined</th></tr></thead>
                        <tbody>
                            {stats.recentUsers.map(u => (
                                <tr key={u.id}>
                                    <td>{u.name}</td>
                                    <td style={{ fontSize: 12 }}>{u.email}</td>
                                    <td><span className={`plan-badge ${u.plan === 'premium' ? 'premium' : 'free'}`}>{u.plan}</span></td>
                                    <td style={{ fontSize: 12 }}>{new Date(u.createdAt).toLocaleDateString()}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <Link href="/admin/users" className="admin-link">Manage users →</Link>
                </div>
            </div>
        </div>
    );
}
