import { Brain, Zap, Cpu, Layers, Lock } from 'lucide-react'

/**
 * ModelBreakdown — 2x2 grid showing per-model signal predictions.
 * Only visible when ensemble data is available (premium or ML active).
 */

const MODELS = [
  { key: 'lstm',        label: 'LSTM',        icon: Brain  },
  { key: 'xgboost',     label: 'XGBoost',     icon: Zap    },
  { key: 'transformer', label: 'Transformer', icon: Cpu    },
  { key: 'kan',         label: 'KAN',         icon: Layers },
]

const SIGNAL_STYLES = {
  BUY:  { dot: '#34d399', text: 'text-signal-buy',  bg: 'bg-signal-buy/10'  },
  SELL: { dot: '#f87171', text: 'text-signal-sell', bg: 'bg-signal-sell/10' },
  HOLD: { dot: '#fbbf24', text: 'text-signal-hold', bg: 'bg-signal-hold/10' },
}

function ModelChip({ label, Icon, signal }) {
  const style  = SIGNAL_STYLES[signal] ?? SIGNAL_STYLES['HOLD']
  const sigLabel = signal === 'BUY' ? 'BUY' : signal === 'SELL' ? 'SELL' : 'HOLD'

  return (
    <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.06] hover:border-white/10 transition-colors">
      <div className="flex items-center gap-1.5">
        <Icon size={12} className="text-text-accent shrink-0" />
        <span className="text-[10px] font-medium text-text-secondary">{label}</span>
      </div>
      <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded ${style.bg}`}>
        <div
          className="w-1.5 h-1.5 rounded-full"
          style={{ backgroundColor: style.dot, boxShadow: `0 0 4px ${style.dot}` }}
        />
        <span className={`text-[9px] font-bold tracking-wider ${style.text}`}>
          {sigLabel}
        </span>
      </div>
    </div>
  )
}

export default function ModelBreakdown({ data }) {
  const ensemble = data?.ensemble
  const locked   = data?.locked

  if (locked) {
    return (
      <div className="mx-3 mb-3 rounded-xl border border-white/8 bg-white/[0.03] p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] text-text-muted uppercase tracking-wider">Model Breakdown</span>
          <span className="text-[9px] text-yellow-400 bg-yellow-400/10 border border-yellow-400/20 px-1.5 py-0.5 rounded-full flex items-center gap-1">
            <Lock size={10} /> Premium
          </span>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {MODELS.map(m => {
            const Icon = m.icon
            return (
              <div key={m.key} className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                <div className="flex items-center gap-1.5 opacity-50">
                  <Icon size={12} className="text-text-muted shrink-0" />
                  <span className="text-[10px] text-text-muted">{m.label}</span>
                </div>
                <div className="w-10 h-3 bg-white/5 rounded animate-pulse" />
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  if (!ensemble) return null

  return (
    <div className="mx-3 mb-3 rounded-xl border border-white/8 bg-white/[0.03] p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] text-text-muted uppercase tracking-wider">Model Breakdown</span>
        <span className="text-[9px] text-accent bg-accent/10 border border-accent/20 px-1.5 py-0.5 rounded-full font-medium">
          4-Model Ensemble
        </span>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {MODELS.map(m => {
          const modelData = ensemble[m.key]
          return (
            <ModelChip
              key={m.key}
              label={m.label}
              Icon={m.icon}
              signal={modelData?.signal ?? 'HOLD'}
            />
          )
        })}
      </div>
    </div>
  )
}
