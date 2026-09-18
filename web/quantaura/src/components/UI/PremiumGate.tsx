'use client';

import React from 'react';
import Link from 'next/link';
import { motion } from 'motion/react';
import { Lock, Sparkles, Crown } from 'lucide-react';
import { useAuth } from '@/lib/auth';

/** Small inline lock chip that links to the pricing page. */
export function PremiumLock({ label = 'Premium' }: { label?: string }) {
    return (
        <Link href="/pricing" className="premium-lock-chip">
            <Lock size={10} /> {label}
        </Link>
    );
}

/** Full-width card shown in place of a premium-only section. */
export function PremiumGateCard({ title, description }: { title: string; description: string }) {
    const { user } = useAuth();
    return (
        <motion.div className="card premium-gate-card" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
            <div className="premium-gate-icon"><Crown size={22} /></div>
            <h2>{title}</h2>
            <p>{description}</p>
            <div className="premium-gate-actions">
                <Link href="/pricing" className="auth-submit" style={{ width: 'auto', padding: '10px 22px', textDecoration: 'none' }}>
                    <Sparkles size={14} /> Upgrade to Premium
                </Link>
                {!user && (
                    <Link href="/login" className="pricing-btn secondary" style={{ textDecoration: 'none' }}>
                        Already premium? Sign in
                    </Link>
                )}
            </div>
        </motion.div>
    );
}

/** Wraps an entire page's content: premium users see children, everyone else
 *  sees the gate card under the normal page header. */
export function PremiumPageGate({ title, description, children }: {
    title: string; description: string; children: React.ReactNode;
}) {
    const { isPremium, loading } = useAuth();
    if (loading) return null;
    if (isPremium) return <>{children}</>;
    return <PremiumGateCard title={title} description={description} />;
}
