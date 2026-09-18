'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X, Crown, LogOut, User as UserIcon, Shield, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import QuantAuraLogo from './QuantAuraLogo';
import ThemeToggle from '../Theme/ThemeToggle';
import { useAuth } from '@/lib/auth';

const NAV_LINKS = [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/markets', label: 'Markets' },
    { href: '/predictions', label: 'Predictions' },
    { href: '/portfolio', label: 'Portfolio' },
    { href: '/backtest', label: 'Backtest' },
    { href: '/models', label: 'Models' },
    { href: '/research', label: 'Research' },
    { href: '/blog', label: 'Blog' },
];

function UserMenu() {
    const { user, loading, isPremium, isAdmin, logout } = useAuth();
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const onClick = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', onClick);
        return () => document.removeEventListener('mousedown', onClick);
    }, []);

    if (loading) return <div className="user-avatar" style={{ opacity: 0.4 }}>··</div>;

    if (!user) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Link href="/login" className="nav-auth-link">Sign In</Link>
                <Link href="/register" className="nav-auth-cta">Get Started</Link>
            </div>
        );
    }

    const initials = user.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

    return (
        <div className="user-menu-wrap" ref={ref}>
            <button className={`user-avatar ${isPremium ? 'premium' : ''}`} onClick={() => setOpen(o => !o)} aria-label="Account menu">
                {initials}
            </button>
            <AnimatePresence>
                {open && (
                    <motion.div className="user-menu" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }}>
                        <div className="user-menu-head">
                            <div className="user-menu-name">{user.name}</div>
                            <div className="user-menu-email">{user.email}</div>
                            <span className={`plan-badge ${isPremium ? 'premium' : 'free'}`}>
                                {isPremium ? <><Crown size={11} /> Premium</> : 'Free Plan'}
                            </span>
                        </div>
                        <Link href="/account" className="user-menu-item" onClick={() => setOpen(false)}>
                            <UserIcon size={14} /> My Account
                        </Link>
                        {!isPremium ? (
                            <Link href="/pricing" className="user-menu-item upgrade" onClick={() => setOpen(false)}>
                                <Sparkles size={14} /> Upgrade to Premium
                            </Link>
                        ) : (
                            <Link href="/pricing" className="user-menu-item" onClick={() => setOpen(false)}>
                                <Sparkles size={14} /> Pricing &amp; Plans
                            </Link>
                        )}
                        {isAdmin && (
                            <Link href="/admin" className="user-menu-item" onClick={() => setOpen(false)}>
                                <Shield size={14} /> Admin Panel
                            </Link>
                        )}
                        <button className="user-menu-item danger" onClick={() => { logout(); setOpen(false); }}>
                            <LogOut size={14} /> Sign Out
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

export default function Navbar() {
    const pathname = usePathname();
    const [mobileOpen, setMobileOpen] = useState(false);
    const { user, isPremium, isAdmin } = useAuth();

    return (
        <>
            <nav className="navbar">
                <Link href="/" className="navbar-brand">
                    <motion.div
                        whileHover={{ rotate: 15, scale: 1.1 }}
                        transition={{ type: 'spring', stiffness: 300, damping: 15 }}
                    >
                        <QuantAuraLogo size={36} />
                    </motion.div>
                    <div>
                        <div className="navbar-title">QuantAura</div>
                        <div className="navbar-subtitle">AI Crypto Intelligence</div>
                    </div>
                </Link>

                <ul className="navbar-links">
                    {NAV_LINKS.map(link => (
                        <li key={link.href}>
                            <Link href={link.href} className={pathname === link.href ? 'active' : ''}>
                                {link.label}
                                {pathname === link.href && (
                                    <motion.div
                                        className="nav-active-indicator"
                                        layoutId="nav-underline"
                                        transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                                    />
                                )}
                            </Link>
                        </li>
                    ))}
                </ul>

                <div className="navbar-actions">
                    <ThemeToggle />
                    <UserMenu />
                    <button
                        className="navbar-hamburger"
                        onClick={() => setMobileOpen(!mobileOpen)}
                        aria-label="Toggle menu"
                    >
                        {mobileOpen ? <X size={20} /> : <Menu size={20} />}
                    </button>
                </div>
            </nav>

            {/* Mobile Menu */}
            <motion.div
                className={`navbar-mobile-menu ${mobileOpen ? 'open' : ''}`}
                initial={false}
                animate={mobileOpen ? { opacity: 1, y: 0 } : { opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
            >
                {NAV_LINKS.map(link => (
                    <Link
                        key={link.href}
                        href={link.href}
                        className={pathname === link.href ? 'active' : ''}
                        onClick={() => setMobileOpen(false)}
                    >
                        {link.label}
                    </Link>
                ))}
                <div className="navbar-mobile-divider" />
                {user ? (
                    <>
                        <Link href="/account" className={pathname === '/account' ? 'active' : ''} onClick={() => setMobileOpen(false)}>
                            My Account
                        </Link>
                        <Link href="/pricing" className={pathname === '/pricing' ? 'active' : ''} onClick={() => setMobileOpen(false)}>
                            {isPremium ? 'Pricing & Plans' : 'Upgrade to Premium'}
                        </Link>
                        {isAdmin && (
                            <Link href="/admin" className={pathname.startsWith('/admin') ? 'active' : ''} onClick={() => setMobileOpen(false)}>
                                Admin Panel
                            </Link>
                        )}
                    </>
                ) : (
                    <>
                        <Link href="/login" onClick={() => setMobileOpen(false)}>Sign In</Link>
                        <Link href="/register" onClick={() => setMobileOpen(false)}>Get Started</Link>
                        <Link href="/pricing" className={pathname === '/pricing' ? 'active' : ''} onClick={() => setMobileOpen(false)}>
                            Pricing
                        </Link>
                    </>
                )}
            </motion.div>
        </>
    );
}
