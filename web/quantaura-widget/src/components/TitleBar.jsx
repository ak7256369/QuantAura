import { Pin, PinOff, Minus, X, RefreshCw, User, Crown } from 'lucide-react'
import { togglePin, minimizeToTray, closeApp, requestRefresh } from '../services/notify'
export default function TitleBar({ isPinned, onPinToggle, onRefresh, loading, onOpenAuth, auth }) {
  const handlePin = () => {
    togglePin()
    onPinToggle()
  }

  const { user, isLoggedIn, isPremium } = auth || {}

  return (
    <div
      className="flex items-center justify-between px-3.5 py-2.5 select-none"
      style={{ WebkitAppRegion: 'drag' }}
    >
      {/* Label (QuantAura Styled Text) */}
      <div className="flex items-center gap-1.5">
        <span className="text-sm font-extrabold tracking-wider bg-gradient-to-r from-indigo-400 via-purple-300 to-cyan-400 bg-clip-text text-transparent drop-shadow-[0_0_12px_rgba(129,140,248,0.3)] select-none">
          QuantAura
        </span>
        <span className="text-[9px] font-bold tracking-widest text-indigo-300/80 px-1.5 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 uppercase">
          WIDGET
        </span>
      </div>

      {/* Controls */}
      <div
        className="flex items-center gap-1"
        style={{ WebkitAppRegion: 'no-drag' }}
      >
        {/* User / Profile Trigger */}
        <button
          onClick={onOpenAuth}
          className={`h-6 px-1.5 flex items-center gap-1 rounded transition-all ${
            isLoggedIn
              ? isPremium
                ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/30 hover:bg-yellow-500/20 shadow-[0_0_8px_rgba(245,158,11,0.15)]'
                : 'bg-white/5 text-text-primary border border-white/10 hover:bg-white/10'
              : 'text-text-muted hover:text-white hover:bg-white/5 border border-white/5'
          }`}
          title={isLoggedIn ? `${user?.name || user?.email} (${isPremium ? 'Premium' : 'Free'})` : 'Sign in to QuantAura'}
        >
          {isLoggedIn ? (
            <>
              {isPremium ? <Crown size={11} className="text-yellow-400 shrink-0" /> : <User size={11} className="shrink-0" />}
              <span className="text-[10px] max-w-[60px] truncate font-medium">
                {(user?.name || user?.email || 'User').split(' ')[0]}
              </span>
            </>
          ) : (
            <>
              <User size={11} className="shrink-0" />
              <span className="text-[10px] font-medium">Sign in</span>
            </>
          )}
        </button>

        {/* Refresh */}
        <button
          onClick={() => { requestRefresh(); onRefresh?.() }}
          className="w-6 h-6 flex items-center justify-center rounded hover:bg-white/10 transition-colors text-text-muted hover:text-text-accent group"
          title="Refresh data"
        >
          <RefreshCw
            size={11}
            className={loading ? 'animate-spin text-accent' : 'group-hover:rotate-180 transition-transform duration-500'}
          />
        </button>

        {/* Pin toggle */}
        <button
          onClick={handlePin}
          className={`w-6 h-6 flex items-center justify-center rounded transition-colors ${
            isPinned
              ? 'text-accent bg-accent/10 hover:bg-accent/20'
              : 'text-text-muted hover:bg-white/10 hover:text-text-accent'
          }`}
          title={isPinned ? 'Unpin (disable always-on-top)' : 'Pin (always on top)'}
        >
          {isPinned ? <Pin size={11} /> : <PinOff size={11} />}
        </button>

        {/* Minimize to tray */}
        <button
          onClick={minimizeToTray}
          className="w-6 h-6 flex items-center justify-center rounded hover:bg-white/10 transition-colors text-text-muted hover:text-text-secondary"
          title="Minimize to tray"
        >
          <Minus size={11} />
        </button>

        {/* Close */}
        <button
          onClick={closeApp}
          className="w-6 h-6 flex items-center justify-center rounded hover:bg-red-500/20 transition-colors text-text-muted hover:text-red-400"
          title="Exit QuantAura Widget"
        >
          <X size={11} />
        </button>
      </div>
    </div>
  )
}
