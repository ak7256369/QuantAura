'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Search, Crown, Ban, Undo2, ChevronLeft, ChevronRight } from 'lucide-react';
import { authFetch, useAuth } from '@/lib/auth';

interface AdminUser {
    id: string; name: string; email: string; role: string; plan: string;
    planExpiresAt: string | null; status: string; createdAt: string; lastLoginAt: string | null;
}

export default function AdminUsersPage() {
    const { user: me } = useAuth();
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [pages, setPages] = useState(1);
    const [search, setSearch] = useState('');
    const [query, setQuery] = useState('');
    const [busyId, setBusyId] = useState('');
    const [error, setError] = useState('');

    const load = useCallback(async (p = page, q = query) => {
        try {
            const res = await authFetch(`/api/admin/users?page=${p}&search=${encodeURIComponent(q)}`);
            const json = await res.json();
            if (json.success) {
                setUsers(json.data.users);
                setTotal(json.data.total);
                setPages(json.data.pages || 1);
            } else setError(json.error || 'Failed to load users.');
        } catch { setError('Backend unreachable.'); }
    }, [page, query]);

    useEffect(() => { load(); }, [load]);

    const update = async (id: string, body: Record<string, unknown>) => {
        setBusyId(id);
        setError('');
        try {
            const res = await authFetch(`/api/admin/users/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error);
            setUsers(prev => prev.map(u => (u.id === id ? json.data : u)));
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Update failed.');
        } finally {
            setBusyId('');
        }
    };

    const submitSearch = (e: React.FormEvent) => {
        e.preventDefault();
        setPage(1);
        setQuery(search);
    };

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1>Users</h1>
                    <p>{total.toLocaleString()} registered accounts</p>
                </div>
                <form onSubmit={submitSearch} className="admin-search">
                    <Search size={14} />
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or email…" />
                </form>
            </div>

            {error && <div className="auth-error" style={{ marginBottom: 14 }}>{error}</div>}

            <div className="card" style={{ overflowX: 'auto' }}>
                <table className="admin-table">
                    <thead>
                        <tr><th>User</th><th>Plan</th><th>Role</th><th>Status</th><th>Joined</th><th>Last login</th><th>Actions</th></tr>
                    </thead>
                    <tbody>
                        {users.map(u => (
                            <tr key={u.id} style={{ opacity: busyId === u.id ? 0.5 : 1 }}>
                                <td>
                                    {u.name}
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{u.email}</div>
                                </td>
                                <td>
                                    <span className={`plan-badge ${u.plan === 'premium' ? 'premium' : 'free'}`}>{u.plan}</span>
                                    {u.plan === 'premium' && u.planExpiresAt && (
                                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>
                                            until {new Date(u.planExpiresAt).toLocaleDateString()}
                                        </div>
                                    )}
                                </td>
                                <td style={{ textTransform: 'capitalize' }}>{u.role}</td>
                                <td>
                                    <span className="status-pill" style={{
                                        background: u.status === 'active' ? 'var(--signal-buy-bg)' : 'var(--signal-sell-bg)',
                                        color: u.status === 'active' ? 'var(--signal-buy)' : 'var(--signal-sell)',
                                    }}>{u.status}</span>
                                </td>
                                <td style={{ fontSize: 12 }}>{new Date(u.createdAt).toLocaleDateString()}</td>
                                <td style={{ fontSize: 12 }}>{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : '—'}</td>
                                <td>
                                    <div className="admin-actions">
                                        {u.plan === 'premium'
                                            ? <button className="admin-action-btn" disabled={busyId === u.id}
                                                onClick={() => update(u.id, { plan: 'free' })}>Set Free</button>
                                            : <button className="admin-action-btn gold" disabled={busyId === u.id}
                                                onClick={() => update(u.id, { plan: 'premium', planDays: 30 })}>
                                                <Crown size={11} /> Grant 30d
                                            </button>}
                                        {u.id !== me?.id && (
                                            u.status === 'active'
                                                ? <button className="admin-action-btn red" disabled={busyId === u.id}
                                                    onClick={() => update(u.id, { status: 'banned' })}><Ban size={11} /> Ban</button>
                                                : <button className="admin-action-btn" disabled={busyId === u.id}
                                                    onClick={() => update(u.id, { status: 'active' })}><Undo2 size={11} /> Unban</button>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

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
