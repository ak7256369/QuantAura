import { Zap, AlertTriangle, ExternalLink } from 'lucide-react'

/**
 * AlertBanner — Pulsing signal alert shown when confidence is high or signal just changed.
 * Displays the LLM-generated explanation text from the API.
 */
export default function AlertBanner({ data, lastUpdated }) {
  const signal     = data?.signal
  const confidence = data?.confidence ? parseFloat(data.confidence) : 0
  const explanation= data?.explanation
  const locked     = data?.locked

  // Show banner only for strong signals (>75%) or always for free tier
  const showAlert  = signal && (confidence >= 75 || signal === 'BUY' || signal === 'SELL')

  // Format last updated time
  const formatTime = (ts) => {
    if (!ts) return '—'
    const diff = Math.floor((Date.now() - ts) / 1000)
    if (diff < 60) return `${diff}s ago`
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    return `${Math.floor(diff / 3600)}h ago`
  }

  const openWebsite = () => {
    if (typeof window !== 'undefined' && window.electronAPI?.openExternal) {
      window.electronAPI.openExternal('https://quantaura.tech')
    } else {
      window.open('https://quantaura.tech', '_blank')
    }
  }

  const cfg = {
    BUY:  { color: '#34d399', bg: 'rgba(52,211,153,0.08)',  border: 'rgba(52,211,153,0.25)',  icon: Zap           },
    SELL: { color: '#f87171', bg: 'rgba(248,113,113,0.08)', border: 'rgba(248,113,113,0.25)', icon: AlertTriangle },
    HOLD: { color: '#fbbf24', bg: 'rgba(251,191,36,0.06)',  border: 'rgba(251,191,36,0.2)',   icon: Zap           },
  }

  const c    = cfg[signal] ?? cfg['HOLD']
  const Icon = c.icon

  return (
    <div className="mx-3 mb-3">
      {showAlert && (
        <div
          className="rounded-xl p-3 mb-2 animate-slide-up"
          style={{ background: c.bg, border: `1px solid ${c.border}` }}
        >
          <div className="flex items-start gap-2">
            <Icon size={13} style={{ color: c.color, marginTop: 1, flexShrink: 0 }} />
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <span
                  className="text-[10px] font-bold tracking-wider uppercase"
                  style={{ color: c.color }}
                >
                  {confidence >= 80
                    ? `Strong ${signal} Signal`
                    : `${signal} Signal`}
                </span>
                {confidence > 0 && (
                  <span
                    className="text-[9px] font-mono px-1.5 py-0.5 rounded-full"
                    style={{ background: `${c.color}22`, color: c.color }}
                  >
                    {confidence.toFixed(0)}%
                  </span>
                )}
              </div>
              {locked ? (
                <p className="text-[10px] text-text-muted leading-relaxed">
                  Signal explanation available on{' '}
                  <span className="text-accent cursor-pointer hover:underline" onClick={openWebsite}>QuantAura Premium</span>
                </p>
              ) : (
                <p className="text-[10px] text-text-secondary leading-relaxed line-clamp-3">
                  {explanation ?? 'Processing signal analysis…'}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Footer timestamp & website link */}
      <div className="flex items-center justify-between px-0.5">
        <span className="text-[9px] text-text-muted">
          Updated {formatTime(lastUpdated)}
        </span>

        <button
          onClick={openWebsite}
          className="text-[10px] font-semibold text-indigo-300 hover:text-white transition-colors flex items-center gap-1 hover:underline cursor-pointer bg-white/5 hover:bg-white/10 px-2 py-0.5 rounded-md border border-white/10"
          title="Visit https://quantaura.tech"
        >
          <span>quantaura.tech</span>
          <ExternalLink size={9} />
        </button>

        <span className="text-[9px] text-text-muted flex items-center gap-1">
          <div className="w-1 h-1 rounded-full bg-signal-buy animate-pulse" />
          Live
        </span>
      </div>
    </div>
  )
}
