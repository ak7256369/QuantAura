'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import { UserPlus, Mail, Lock, User, AlertCircle, Check } from 'lucide-react';
import { useAuth } from '@/lib/auth';

const FREE_PERKS = [
    'Live market data & charts for 10 coins',
    'BTC & ETH AI signal direction',
    'Real-time crypto news feed',
    '5 AI chat messages per day',
];

export default function RegisterPage() {
    const { register } = useAuth();
    const router = useRouter();
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
        setBusy(true);
        try {
            await register(name, email, password);
            router.push('/dashboard');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Registration failed.');
            setBusy(false);
        }
    };

    return (
        <motion.div className="auth-card card" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <h1 className="auth-title">Create your account</h1>
            <p className="auth-subtitle">Start free — upgrade any time for full model detail</p>

            <ul className="auth-perks">
                {FREE_PERKS.map(p => <li key={p}><Check size={13} /> {p}</li>)}
            </ul>

            {error && (
                <div className="auth-error"><AlertCircle size={14} /> {error}</div>
            )}

            <form onSubmit={submit} className="auth-form">
                <label className="auth-field">
                    <span>Name</span>
                    <div className="auth-input-wrap">
                        <User size={15} />
                        <input type="text" required value={name} onChange={e => setName(e.target.value)}
                            placeholder="Your name" autoComplete="name" maxLength={60} />
                    </div>
                </label>
                <label className="auth-field">
                    <span>Email</span>
                    <div className="auth-input-wrap">
                        <Mail size={15} />
                        <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
                            placeholder="you@example.com" autoComplete="email" />
                    </div>
                </label>
                <label className="auth-field">
                    <span>Password</span>
                    <div className="auth-input-wrap">
                        <Lock size={15} />
                        <input type="password" required value={password} onChange={e => setPassword(e.target.value)}
                            placeholder="Min. 8 characters" autoComplete="new-password" minLength={8} />
                    </div>
                </label>
                <button type="submit" className="auth-submit" disabled={busy}>
                    <UserPlus size={15} /> {busy ? 'Creating account…' : 'Create Account'}
                </button>
            </form>

            <div className="auth-switch">
                Already have an account? <Link href="/login">Sign in</Link>
            </div>
        </motion.div>
    );
}
