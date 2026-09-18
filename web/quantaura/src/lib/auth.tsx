'use client';

import React, { createContext, useContext, useCallback, useEffect, useState } from 'react';

// ═══════════════════════════════════════════
//  AUTH — token storage, context, fetch helper
// ═══════════════════════════════════════════

const TOKEN_KEY = 'quantaura-token';

export interface AuthUser {
    id: string;
    name: string;
    email: string;
    role: 'user' | 'admin';
    plan: 'free' | 'premium';
    planExpiresAt: string | null;
    status: 'active' | 'banned';
    createdAt: string;
    lastLoginAt: string | null;
}

export function getToken(): string | null {
    if (typeof window === 'undefined') return null;
    try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

function setToken(token: string | null) {
    try {
        if (token) localStorage.setItem(TOKEN_KEY, token);
        else localStorage.removeItem(TOKEN_KEY);
    } catch { /* private mode */ }
}

/** fetch() with the Authorization header attached when a token exists. */
export function authFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
    const token = getToken();
    const headers = new Headers(init.headers || {});
    if (token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);
    return fetch(input, { ...init, headers });
}

interface AuthContextValue {
    user: AuthUser | null;
    /** true until the initial /me check finishes — gate redirects on this */
    loading: boolean;
    isPremium: boolean;
    isAdmin: boolean;
    login: (email: string, password: string) => Promise<AuthUser>;
    register: (name: string, email: string, password: string) => Promise<AuthUser>;
    logout: () => void;
    refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<AuthUser | null>(null);
    const [loading, setLoading] = useState(true);

    const refresh = useCallback(async () => {
        if (!getToken()) { setUser(null); return; }
        try {
            const res = await authFetch('/api/auth/me', { signal: AbortSignal.timeout(8000) });
            if (res.status === 401 || res.status === 403) {
                setToken(null);
                setUser(null);
                return;
            }
            const json = await res.json();
            if (json.success) setUser(json.data);
        } catch { /* backend offline — keep whatever we have */ }
    }, []);

    useEffect(() => {
        refresh().finally(() => setLoading(false));
    }, [refresh]);

    const handleAuthResponse = async (res: Response): Promise<AuthUser> => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json.success) throw new Error(json.error || 'Authentication failed.');
        setToken(json.data.token);
        setUser(json.data.user);
        return json.data.user;
    };

    const login = useCallback(async (email: string, password: string) => {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });
        return handleAuthResponse(res);
    }, []);

    const register = useCallback(async (name: string, email: string, password: string) => {
        const res = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, password }),
        });
        return handleAuthResponse(res);
    }, []);

    const logout = useCallback(() => {
        setToken(null);
        setUser(null);
    }, []);

    const value: AuthContextValue = {
        user,
        loading,
        isPremium: !!user && (user.plan === 'premium' || user.role === 'admin'),
        isAdmin: user?.role === 'admin',
        login,
        register,
        logout,
        refresh,
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
    return ctx;
}
