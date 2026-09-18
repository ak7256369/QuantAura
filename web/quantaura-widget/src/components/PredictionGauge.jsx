import { Zap, Shield, Minus, Lock } from 'lucide-react'

/**
 * PredictionGauge — ML ensemble direction badge, confidence progress bar, source tag.
 */
export default function PredictionGauge({ data }) {
  const signal     = data?.signal     ?? null
  const confidence = data?.confidence ?? null
  const source     = data?.source     ?? null
  const locked     = data?.locked     ?? false

  const confVal = confidence ? parseFloat(confidence) : 0

  const config = {
    BUY:  { label: 'BULLISH',  color: '#34d399', bg: 'rgba(52,211,153,0.1)',  border: 'rgba(52,211,153,0.3)',  icon: Zap,    glow: '0 0 20px rgba(52,211,153,0.4)' },
    SELL: { label: 'BEARISH',  color: '#f87171', bg: 'rgba(248,113,113,0.1)', border: 'rgba(248,113,113,0.3)', icon: Shield, glow: '0 0 20px rgba(248,113,113,0.4)' },
    HOLD: { label: 'NEUTRAL',  color: '#fbbf24', bg: 'rgba(251,191,36,0.1)',  border: 'rgba(251,191,36,0.25)', icon: Minus,  glow: '0 0 20px rgba(251,191,36,0.3)'  },
  }

  const cfg  = config[signal] ?? config['HOLD']
  const Icon = cfg.icon

  const isML = source === 'ml_ensemble'

  return (
    <div className="mx-3 mb-3 rounded-xl border bg-white/[0.03] p-3 backdrop-blur-sm"
      style={{ borderColor: cfg.border, boxShadow: cfg.glow }}>

      {/* Direction Badge */}
      <div className="flex items-center justify-between mb-3">
        <div
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
          style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}
        >
          <Icon size={14} style={{ color: cfg.color }} />
          <span className="text-sm font-bold tracking-wider" style={{ color: cfg.color }}>
            {cfg.label}
          </span>
        </div>

        {/* Source badge */}
        <div className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded-full font-medium ${
          isML
            ? 'bg-accent/10 text-accent border border-accent/20'
            : 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'
        }`}>
          <div className={`w-1.5 h-1.5 rounded-full ${isML ? 'bg-accent animate-pulse' : 'bg-yellow-400'}`} />
          {isML ? 'ML Ensemble' : 'TA Fallback'}
        </div>
      </div>

      {/* Confidence meter */}
      {locked ? (
        <div className="flex items-center gap-2 text-xs text-text-muted py-1">
          <div className="w-4 h-4 rounded border border-white/20 flex items-center justify-center">
            <Lock size={10} className="text-text-muted" />
          </div>
          <span>Confidence score — Premium only</span>
        </div>
      ) : (
        <div>
          <div className="flex justify-between items-center mb-1.5">
            <span className="text-[10px] text-text-muted uppercase tracking-wider">Model Confidence</span>
            <span className="font-mono text-sm font-bold" style={{ color: cfg.color }}>
              {confVal > 0 ? `${confVal.toFixed(1)}%` : '—'}
            </span>
          </div>
          <div className="h-2 rounded-full bg-white/5 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700 ease-out"
              style={{
                width: `${confVal}%`,
                background: `linear-gradient(90deg, ${cfg.color}88, ${cfg.color})`,
                boxShadow: `0 0 8px ${cfg.color}66`,
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
