import { useState } from 'react'
import { X, Mail, Lock, Eye, EyeOff, Loader2, LogOut, Crown, CheckCircle2, Shield, AlertCircle, ExternalLink } from 'lucide-react'

export default function AuthModal({ isOpen, onClose, auth }) {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [localErr, setLocalErr] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  if (!isOpen) return null

  const { user, isLoggedIn, isPremium, login, logout } = auth

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!email.trim() || !password.trim()) {
      setLocalErr('Please enter both email and password.')
      return
    }
    setLocalErr(null)
    setSubmitting(true)
    const res = await login(email.trim(), password)
    setSubmitting(false)
    if (res.success) {
      setEmail('')
      setPassword('')
    } else {
      setLocalErr(res.error || 'Authentication failed.')
    }
  }

  const handleLogout = async () => {
    await logout()
  }

  const openWeb = (url) => {
    if (typeof window !== 'undefined' && window.electronAPI?.openExternal) {
      window.electronAPI.openExternal(url)
    } else {
      window.open(url, '_blank')
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-md animate-slide-up cursor-pointer"
      onClick={onClose}
    >
      {/* ── Glass Card Container (QuantAura Glassmorphism Skill) ── */}
      <div
        className="relative w-full max-w-[340px] overflow-hidden rounded-2xl border border-white/10 bg-[#0e1016]/95 backdrop-blur-2xl shadow-[0_20px_60px_rgba(0,0,0,0.7)] text-text-primary p-5 select-none cursor-default"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Top accent gradient line */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-indigo-500 to-transparent opacity-80 pointer-events-none" />
        
        {/* Inner ambient glow orb */}
        <div className="absolute -top-16 left-1/2 -translate-x-1/2 w-[220px] h-[100px] bg-indigo-500/15 rounded-full blur-[50px] pointer-events-none" />

        {/* Close button (Fixed Z-Index & No-Drag) */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            onClose()
          }}
          type="button"
          className="absolute top-3 right-3 z-30 w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 active:bg-white/20 border border-white/10 flex items-center justify-center text-text-muted hover:text-white transition-all cursor-pointer"
          style={{ WebkitAppRegion: 'no-drag' }}
          title="Close Modal"
        >
          <X size={14} />
        </button>

        {isLoggedIn ? (
          /* ─────────────────────────────────────────────────────────────
             USER PROFILE VIEW (LOGGED IN)
             ───────────────────────────────────────────────────────────── */
          <div className="relative z-10 flex flex-col items-center text-center pt-2">
            
            {/* User Avatar with glow */}
            <div className="relative mb-3">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 via-purple-600 to-indigo-600 flex items-center justify-center text-xl font-bold text-white shadow-[0_0_20px_rgba(99,102,241,0.4)] border border-white/20">
                {(user?.name || user?.email || 'U')[0].toUpperCase()}
              </div>
              {isPremium && (
                <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-yellow-400 text-black flex items-center justify-center shadow-lg shadow-yellow-400/50">
                  <Crown size={11} className="fill-current" />
                </div>
              )}
            </div>

            {/* Name & Email */}
            <h3 className="text-sm font-bold text-white tracking-tight">
              {user?.name || 'QuantAura Trader'}
            </h3>
            <p className="text-[11px] text-text-muted mt-0.5 truncate max-w-[240px]">
              {user?.email}
            </p>

            {/* Membership Tier Badge */}
            <div className="mt-3 mb-4 w-full">
              {isPremium ? (
                <div className="py-2 px-3 rounded-xl bg-gradient-to-r from-yellow-500/10 via-amber-500/15 to-yellow-500/10 border border-yellow-500/30 flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(245,158,11,0.15)]">
                  <Crown size={13} className="text-yellow-400" />
                  <span className="text-xs font-bold text-yellow-300 tracking-wide uppercase">
                    Premium Member
                  </span>
                </div>
              ) : (
                <div className="py-2 px-3 rounded-xl bg-white/[0.03] border border-white/10 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs text-text-secondary">
                    <Shield size={12} className="text-text-muted" />
                    <span>Free Plan</span>
                  </div>
                  <button
                    onClick={() => openWeb('https://quantaura.tech/pricing')}
                    className="text-[10px] font-bold text-accent hover:underline flex items-center gap-1"
                  >
                    Upgrade <ExternalLink size={9} />
                  </button>
                </div>
              )}
            </div>

            {/* Features Status */}
            <div className="w-full bg-white/[0.02] border border-white/5 rounded-xl p-2.5 mb-4 text-left space-y-1.5 text-[10px]">
              <div className="flex items-center justify-between">
                <span className="text-text-muted flex items-center gap-1.5">
                  <CheckCircle2 size={11} className="text-signal-buy" /> 4-Model Ensemble ML
                </span>
                <span className="font-semibold text-text-secondary">
                  {isPremium ? 'Active' : 'Locked'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-text-muted flex items-center gap-1.5">
                  <CheckCircle2 size={11} className="text-signal-buy" /> AI Signal Explanations
                </span>
                <span className="font-semibold text-text-secondary">
                  {isPremium ? 'Active' : 'Locked'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-text-muted flex items-center gap-1.5">
                  <CheckCircle2 size={11} className="text-signal-buy" /> All 5 Crypto Pairs
                </span>
                <span className="font-semibold text-text-secondary">
                  {isPremium ? 'Active' : 'BTC Only'}
                </span>
              </div>
            </div>

            {/* Logout Button */}
            <button
              onClick={handleLogout}
              className="w-full py-2.5 rounded-xl font-semibold text-xs text-red-400 bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 transition-all flex items-center justify-center gap-1.5 active:scale-[0.98]"
            >
              <LogOut size={12} />
              Sign Out
            </button>
          </div>
        ) : (
          /* ─────────────────────────────────────────────────────────────
             LOGIN FORM VIEW (LOGGED OUT)
             ───────────────────────────────────────────────────────────── */
          <div className="relative z-10">
            <div className="text-center mb-4">
              <h2 className="text-base font-bold text-white tracking-tight">
                Account Sign In
              </h2>
              <p className="text-[11px] text-text-muted mt-0.5">
                Sign in to unlock Premium ML signals
              </p>
            </div>

            {/* Error banner */}
            {localErr && (
              <div className="mb-3 p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-[11px] text-red-400 flex items-center gap-1.5 animate-slide-up">
                <AlertCircle size={13} className="shrink-0" />
                <span>{localErr}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3">
              {/* Email */}
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-1">
                  Email Address
                </label>
                <div className="relative group">
                  <Mail size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted group-focus-within:text-accent transition-colors" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="trader@quantaura.tech"
                    required
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-xs text-white placeholder:text-text-muted/40 focus:outline-none focus:border-indigo-400/60 focus:ring-2 focus:ring-indigo-500/20 transition-all"
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-1">
                  Password
                </label>
                <div className="relative group">
                  <Lock size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted group-focus-within:text-accent transition-colors" />
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    className="w-full pl-9 pr-9 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-xs text-white placeholder:text-text-muted/40 focus:outline-none focus:border-indigo-400/60 focus:ring-2 focus:ring-indigo-500/20 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(!showPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-white transition-colors"
                  >
                    {showPass ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                </div>
              </div>

              {/* Submit CTA (Glassmorphism Gradient Button) */}
              <button
                type="submit"
                disabled={submitting}
                className="w-full mt-2 py-2.5 rounded-xl font-bold text-xs text-white bg-gradient-to-r from-indigo-500 via-purple-600 to-indigo-500 shadow-[0_4px_20px_rgba(99,102,241,0.35)] hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
              >
                {submitting ? (
                  <>
                    <Loader2 size={13} className="animate-spin" />
                    <span>Signing in…</span>
                  </>
                ) : (
                  <span>Sign In to Widget</span>
                )}
              </button>
            </form>

            {/* Footer Registration Link */}
            <div className="mt-4 pt-3 border-t border-white/5 text-center text-[10px] text-text-muted">
              Don't have an account?{' '}
              <button
                type="button"
                onClick={() => openWeb('https://quantaura.tech/register')}
                className="text-accent font-semibold hover:underline inline-flex items-center gap-0.5"
              >
                Create Account <ExternalLink size={9} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
