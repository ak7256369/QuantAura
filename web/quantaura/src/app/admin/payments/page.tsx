'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { CheckCircle2, XCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { authFetch } from '@/lib/auth';
import { money } from '@/lib/money';

interface AdminPayment {
    _id: string; plan: string; amount: number; currency: string; method: string;
    txnRef: string; senderName: string; notes: string; status: string;
    reviewNote: string; createdAt: string;
    userId: { _id: string; name: string; email: string; plan: string } | null;
}

const TABS = ['pending', 'approved', 'rejected', 'all'] as const;

export default function AdminPaymentsPage() {
    const [tab, setTab] = useState<typeof TABS[number]>('pending');
    const [payments, setPayments] = useState<AdminPayment[]>([]);
    const [page, setPage] = useState(1);
    const [pages, setPages] = useState(1);
    const [total, setTotal] = useState(0);
    const [busyId, setBusyId] = useState('');
    const [error, setError] = useState('');

    const load = useCallback(async (p = page, t = tab) => {
        try {
            const status = t === 'all' ? '' : `&status=${t}`;
            const res = await authFetch(`/api/admin/payments?page=${p}${status}`);
            const json = await res.json();
            if (json.success) {
                setPayments(json.data.payments);
                setPages(json.data.pages || 1);
                setTotal(json.data.total);
            } else setError(json.error || 'Failed to load payments.');
        } catch { setError('Backend unreachable.'); }
    }, [page, tab]);

    useEffect(() => { load(); }, [load]);

    const review = async (id: string, action: 'approve' | 'reject') => {
        let note = '';
        if (action === 'reject') {
            note = window.prompt('Reason for rejection (shown to the user):') || '';
        }
        setBusyId(id);
        setError('');
        try {
            const res = await authFetch(`/api/admin/payments/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action, note }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error);
            load();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Review failed.');
        } finally {
            setBusyId('');
        }
    };

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1>Payments</h1>
                    <p>{total.toLocaleString()} {tab === 'all' ? 'total' : tab} payment{total === 1 ? '' : 's'}</p>
                </div>
                <div className="pred-filter-bar" style={{ margin: 0 }}>
                    {TABS.map(t => (
                        <button key={t} className={`pred-filter-btn ${tab === t ? 'active-all' : ''}`}
                            onClick={() => { setTab(t); setPage(1); }} style={{ textTransform: 'capitalize' }}>
                            {t}
                        </button>
                    ))}
                </div>
            </div>

            {error && <div className="auth-error" style={{ marginBottom: 14 }}>{error}</div>}

            <div className="card" style={{ overflowX: 'auto' }}>
                {payments.length === 0 ? (
                    <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No {tab === 'all' ? '' : tab} payments.</p>
                ) : (
                    <table className="admin-table">
                        <thead>
                            <tr><th>Date</th><th>User</th><th>Plan</th><th>Amount</th><th>Method</th><th>Reference</th><th>Status</th><th>Actions</th></tr>
                        </thead>
                        <tbody>
                            {payments.map(p => (
                                <tr key={p._id} style={{ opacity: busyId === p._id ? 0.5 : 1 }}>
                                    <td style={{ fontSize: 12 }}>{new Date(p.createdAt).toLocaleString()}</td>
                                    <td>
                                        {p.userId?.name || 'Deleted user'}
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.userId?.email}</div>
                                    </td>
                                    <td style={{ textTransform: 'capitalize' }}>{p.plan}</td>
                                    <td>{money(p.amount, p.currency)}</td>
                                    <td style={{ textTransform: 'capitalize' }}>{p.method.replace('_', ' ')}</td>
                                    <td>
                                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{p.txnRef}</span>
                                        {p.senderName && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>from {p.senderName}</div>}
                                        {p.notes && <div style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>{p.notes}</div>}
                                    </td>
                                    <td>
                                        <span className="status-pill" style={{
                                            background: p.status === 'approved' ? 'var(--signal-buy-bg)' : p.status === 'rejected' ? 'var(--signal-sell-bg)' : 'var(--signal-hold-bg)',
                                            color: p.status === 'approved' ? 'var(--signal-buy)' : p.status === 'rejected' ? 'var(--signal-sell)' : 'var(--signal-hold)',
                                        }}>{p.status}</span>
                                        {p.reviewNote && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>{p.reviewNote}</div>}
                                    </td>
                                    <td>
                                        {p.status === 'pending' && (
                                            <div className="admin-actions">
                                                <button className="admin-action-btn green" disabled={busyId === p._id}
                                                    onClick={() => review(p._id, 'approve')}>
                                                    <CheckCircle2 size={11} /> Approve
                                                </button>
                                                <button className="admin-action-btn red" disabled={busyId === p._id}
                                                    onClick={() => review(p._id, 'reject')}>
                                                    <XCircle size={11} /> Reject
                                                </button>
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}

                {pages > 1 && (
                    <div className="admin-pager">
                        <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft size={14} /></button>
                        <span>Page {page} of {pages}</span>
                        <button disabled={page >= pages} onClick={() => setPage(p => p + 1)}><ChevronRight size={14} /></button>
                    </div>
                )}
            </div>
        </div>
    );
}
