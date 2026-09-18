'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { motion } from 'motion/react';
import { Send, Copy, Check, Unlink, BellRing, Newspaper, AlertCircle } from 'lucide-react';
import { authFetch } from '@/lib/auth';

interface TelegramStatus {
    linked: boolean;
    username: string;
    linkedAt: string | null;
    alerts: boolean;
    digest: boolean;
    unreachable: boolean;
    premium: boolean;
    botUsername: string | null;
    pendingCode: string | null;
    pendingCodeExpiresAt: string | null;
}

export default function TelegramCard() {
    const [status, setStatus] = useState<TelegramStatus | null>(null);
    const [code, setCode] = useState<string | null>(null);
    const [deepLink, setDeepLink] = useState<string | null>(null);
    const [expiresAt, setExpiresAt] = useState<Date | null>(null);
    const [busy, setBusy] = useState(false);
    const [copied, setCopied] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const load = useCallback(async () => {
        try {
            const res = await authFetch('/api/telegram/status');
            const json = await res.json();
            if (json.success) {
                setStatus(json.data);
                // A pending code survives a page reload — resurface it instead
                // of making the user generate (and race) a second one.
                if (!json.data.linked && json.data.pendingCode) {
                    setCode(json.data.pendingCode);
                    setExpiresAt(new Date(json.data.pendingCodeExpiresAt));
                    if (json.data.botUsername) {
                        setDeepLink(`https://t.me/${json.data.botUsername}?start=${json.data.pendingCode}`);
                    }
                }
                return json.data as TelegramStatus;
            }
        } catch { /* backend offline — card just stays quiet */ }
        return null;
    }, []);

    useEffect(() => { load(); }, [load]);

    // While a code is outstanding, poll so the card flips to "connected" the
    // moment the bot pairs — without the user having to refresh.
    useEffect(() => {
        if (!code || status?.linked) {
            if (pollRef.current) clearInterval(pollRef.current);
            return;
        }
        pollRef.current = setInterval(async () => {
            const s = await load();
            if (s?.linked || (expiresAt && expiresAt < new Date())) {
                if (!s?.linked) setCode(null);   // expired unclaimed
                if (pollRef.current) clearInterval(pollRef.current);
            }
        }, 4000);
        return () => { if (pollRef.current) clearInterval(pollRef.current); };
    }, [code, status?.linked, expiresAt, load]);

    const generate = async () => {
        setBusy(true);
        setError(null);
        try {
            const res = await authFetch('/api/telegram/link-code', { method: 'POST' });
            const json = await res.json();
            if (!json.success) throw new Error(json.error || 'Failed to create a code.');
            setCode(json.data.code);
            setDeepLink(json.data.deepLink);
            setExpiresAt(new Date(json.data.expiresAt));
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to create a code.');
        } finally {
            setBusy(false);
        }
    };

    const copy = async () => {
        if (!code) return;
        try {
            await navigator.clipboard.writeText(`/link ${code}`);
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
        } catch { /* clipboard blocked — the code is visible anyway */ }
    };

    const toggle = async (field: 'alerts' | 'digest') => {
        if (!status) return;
        const next = { ...status, [field]: !status[field] };
        setStatus(next);   // optimistic — a failed save reverts on next load
        try {
            await authFetch('/api/telegram/prefs', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ [field]: next[field] }),
            });
        } catch { load(); }
    };

    const disconnect = async () => {
        if (!window.confirm('Disconnect Telegram? Signal delivery stops until you reconnect.')) return;
        setBusy(true);
        try {
            await authFetch('/api/telegram/link', { method: 'DELETE' });
            setCode(null);
            setDeepLink(null);
            await load();
        } finally {
            setBusy(false);
        }
    };

    if (!status) return null;
    // TELEGRAM_BOT_USERNAME unset on the server means the bot isn't live yet —
    // hide the whole card rather than offer pairing with a bot that doesn't
    // exist. (Linked users keep seeing it so they can still disconnect.)
    if (!status.linked && !status.botUsername) return null;

    return (
        <motion.div className="card" style={{ marginTop: 24 }}
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.09 }}>
            <div className="section-header"><Send size={16} className="section-header-icon" /> Telegram Signals</div>

            {status.linked ? (
                <>
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14 }}>
                        Connected{status.username ? <> as <b>@{status.username}</b></> : ''}
                        {status.linkedAt ? ` since ${new Date(status.linkedAt).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}.
                        {status.premium
                            ? ' Signal changes and the daily digest are delivered by DM.'
                            : ' Upgrade to Premium to have all signals pushed here the moment they change.'}
                    </p>

                    {status.unreachable && (
                        <div className="auth-error" style={{ marginBottom: 14 }}>
                            <AlertCircle size={14} /> The bot can&apos;t message you — it may be blocked in Telegram.
                            Unblock it, then send it /status.
                        </div>
                    )}

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
                        <button type="button" onClick={() => toggle('alerts')}
                            className="auth-submit"
                            style={{ width: 'auto', padding: '8px 14px', opacity: status.alerts ? 1 : 0.5 }}>
                            <BellRing size={13} /> Change alerts: {status.alerts ? 'on' : 'off'}
                        </button>
                        <button type="button" onClick={() => toggle('digest')}
                            className="auth-submit"
                            style={{ width: 'auto', padding: '8px 14px', opacity: status.digest ? 1 : 0.5 }}>
                            <Newspaper size={13} /> Daily digest: {status.digest ? 'on' : 'off'}
                        </button>
                    </div>

                    <button type="button" onClick={disconnect} disabled={busy}
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                            background: 'none', border: '1px solid var(--border-color, #333)',
                            borderRadius: 8, padding: '8px 14px', fontSize: 13,
                            color: 'var(--signal-sell, #ef4444)', cursor: 'pointer',
                        }}>
                        <Unlink size={13} /> Disconnect Telegram
                    </button>
                </>
            ) : (
                <>
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14 }}>
                        {status.premium
                            ? 'Get every signal pushed to Telegram the moment the model’s call changes, plus a daily digest of all symbols.'
                            : 'Connect Telegram now — free accounts can query the public signals from the bot, and Premium delivery switches on automatically if you upgrade.'}
                    </p>

                    {error && (
                        <div className="auth-error" style={{ marginBottom: 14 }}>
                            <AlertCircle size={14} /> {error}
                        </div>
                    )}

                    {code ? (
                        <div>
                            {/* No no-deep-link variant: this branch needs a code,
                                a code needs botUsername (see the early return),
                                and the API builds deepLink from that same value. */}
                            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 10 }}>
                                Tap the button to open the bot, or send it <code>/link {code}</code> yourself.
                            </p>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
                                <span style={{
                                    fontFamily: 'var(--font-mono)', fontSize: 20, letterSpacing: 3,
                                    padding: '8px 16px', borderRadius: 8,
                                    background: 'var(--bg-tertiary, rgba(99,102,241,0.08))',
                                    border: '1px dashed var(--border-color, #333)',
                                }}>
                                    {code}
                                </span>
                                <button type="button" onClick={copy}
                                    className="auth-submit" style={{ width: 'auto', padding: '9px 14px' }}>
                                    {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'Copied' : 'Copy command'}
                                </button>
                                {deepLink && (
                                    <a href={deepLink} target="_blank" rel="noopener noreferrer"
                                        className="auth-submit"
                                        style={{ width: 'auto', padding: '9px 14px', textDecoration: 'none', display: 'inline-flex' }}>
                                        <Send size={13} /> Open in Telegram
                                    </a>
                                )}
                            </div>
                            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 10 }}>
                                Code expires {expiresAt ? `at ${expiresAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'in 15 minutes'}.
                                This page updates automatically once you&apos;re connected.
                            </p>
                        </div>
                    ) : (
                        <button type="button" onClick={generate} disabled={busy}
                            className="auth-submit" style={{ width: 'auto', padding: '10px 20px', display: 'inline-flex' }}>
                            <Send size={14} /> {busy ? 'Generating…' : 'Connect Telegram'}
                        </button>
                    )}

                    {!status.premium && (
                        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 12 }}>
                            Pushed delivery of all 8 symbols is a <Link href="/pricing" style={{ color: 'var(--accent-primary, #6366f1)' }}>Premium</Link> feature.
                        </p>
                    )}
                </>
            )}
        </motion.div>
    );
}
