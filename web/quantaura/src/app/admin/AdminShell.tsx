'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, Users, CreditCard, Settings, ArrowLeft, Shield, User as UserIcon } from 'lucide-react';
import PageAmbient from '@/components/Motion/PageAmbient';
import Navbar from '@/components/Layout/Navbar';
import { useAuth } from '@/lib/auth';

const ADMIN_LINKS = [
    { href: '/admin', label: 'Overview', icon: <LayoutDashboard size={14} /> },
    { href: '/admin/users', label: 'Users', icon: <Users size={14} /> },
    { href: '/admin/payments', label: 'Payments', icon: <CreditCard size={14} /> },
    { href: '/admin/settings', label: 'Settings', icon: <Settings size={14} /> },
];

export default function AdminShell({ children }: { children: React.ReactNode }) {
    const { user, loading, isAdmin } = useAuth();
    const pathname = usePathname();
    const router = useRouter();

    useEffect(() => {
        if (loading) return;
        if (!user) router.push('/login?next=/admin');
        else if (!isAdmin) router.push('/dashboard');
    }, [loading, user, isAdmin, router]);

    if (loading || !isAdmin) {
        return (
            <main className="main-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
                <div style={{ color: 'var(--text-muted)', fontSize: 13, display: 'flex', gap: 8, alignItems: 'center' }}>
                    <Shield size={16} /> Checking admin access…
                </div>
            </main>
        );
    }

    return (
        <>
            <Navbar />
            <PageAmbient />
            <main className="main-content">
                <div className="admin-topbar">
                    <div className="admin-topbar-title">
                        <Shield size={16} /> Admin Panel
                    </div>
                    <nav className="admin-tabs">
                        {ADMIN_LINKS.map(l => (
                            <Link key={l.href} href={l.href}
                                className={`admin-tab ${pathname === l.href ? 'active' : ''}`}>
                                {l.icon} {l.label}
                            </Link>
                        ))}
                    </nav>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <Link href="/account" className="admin-back"><UserIcon size={13} /> My Account</Link>
                        <Link href="/dashboard" className="admin-back"><ArrowLeft size={13} /> Back to app</Link>
                    </div>
                </div>
                {children}
            </main>
        </>
    );
}
