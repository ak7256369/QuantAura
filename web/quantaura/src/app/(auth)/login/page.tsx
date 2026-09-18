'use client';

import React, { useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'motion/react';
import { LogIn, Mail, Lock, AlertCircle } from 'lucide-react';
import { useAuth } from '@/lib/auth';

// useSearchParams needs a Suspense boundary to statically prerender
export default function LoginPage() {
    return (
        <Suspense fallback={null}>
            <LoginForm />
        </Suspense>
    );
}

function LoginForm() {
    const { login } = useAuth();
    const router = useRouter();
    const params = useSearchParams();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setBusy(true);
        try {
            const user = await login(email, password);
            const next = params.get('next');
            router.push(next || (user.role === 'admin' ? '/admin' : '/dashboard'));
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Login failed.');
            setBusy(false);
        }
    };

    return (
        <motion.div className="auth-card card" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <h1 className="auth-title">Welcome back</h1>
            <p className="auth-subtitle">Sign in to access your AI signal dashboard</p>

            {error && (
                <div className="auth-error"><AlertCircle size={14} /> {error}</div>
            )}

            <form onSubmit={submit} className="auth-form">
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
                            placeholder="••••••••" autoComplete="current-password" />
                    </div>
                </label>
                <button type="submit" className="auth-submit" disabled={busy}>
                    <LogIn size={15} /> {busy ? 'Signing in…' : 'Sign In'}
                </button>
            </form>

            <div className="auth-switch">
                New to QuantAura? <Link href="/register">Create an account</Link>
            </div>
        </motion.div>
    );
}
