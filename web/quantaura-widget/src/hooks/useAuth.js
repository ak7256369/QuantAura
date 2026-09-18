import { useState, useEffect, useCallback } from 'react'
import { loginUser, fetchUserProfile } from '../services/api'
import { getAuth, setAuth, logout as logoutIPC } from '../services/notify'

export function useAuth() {
  const [user, setUser]       = useState(null)
  const [token, setToken]     = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  // ── Restore saved credentials on mount ──────────────────────────────────────
  useEffect(() => {
    let mounted = true

    async function initAuth() {
      try {
        const saved = await getAuth()
        if (saved?.token && mounted) {
          setToken(saved.token)
          setUser(saved.user)

          // Background sync to ensure plan status is up to date
          try {
            const freshUser = await fetchUserProfile(saved.token)
            if (freshUser && mounted) {
              setUser(freshUser)
              await setAuth({ token: saved.token, user: freshUser })
            }
          } catch {
            // If token expired or network fails, keep saved state
          }
        }
      } catch (err) {
        console.warn('[useAuth] Failed to restore session:', err.message)
      } finally {
        if (mounted) setLoading(false)
      }
    }

    initAuth()
    return () => { mounted = false }
  }, [])

  // ── Login action ─────────────────────────────────────────────────────────────
  const login = useCallback(async (email, password) => {
    setError(null)
    setLoading(true)
    try {
      const data = await loginUser(email, password)
      setToken(data.token)
      setUser(data.user)
      await setAuth({ token: data.token, user: data.user })
      setLoading(false)
      return { success: true, user: data.user }
    } catch (err) {
      setError(err.message)
      setLoading(false)
      return { success: false, error: err.message }
    }
  }, [])

  // ── Logout action ────────────────────────────────────────────────────────────
  const logout = useCallback(async () => {
    setLoading(true)
    try {
      await logoutIPC()
    } finally {
      setUser(null)
      setToken(null)
      setError(null)
      setLoading(false)
    }
  }, [])

  const isLoggedIn = !!user && !!token
  const isPremium  = user?.plan === 'premium' || user?.role === 'admin'

  return {
    user,
    token,
    isLoggedIn,
    isPremium,
    loading,
    error,
    login,
    logout,
    clearError: () => setError(null),
  }
}
