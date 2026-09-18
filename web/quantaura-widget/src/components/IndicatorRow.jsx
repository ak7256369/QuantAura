import { BarChart2, TrendingUp, Activity, LineChart } from 'lucide-react'

/**
 * IndicatorRow — Compact technical indicator status list.
 * Data pulled from signal.indicators returned by /api/signals.
 */

const INDICATOR_KEYS = [
  { key: 'RSI (14)',        label: 'RSI 14', icon: BarChart2  },
  { key: 'MACD',            label: 'MACD',   icon: TrendingUp  },
  { key: 'Bollinger Bands', label: 'BB',     icon: Activity    },
  { key: 'EMA Cross',       label: 'EMA',    icon: LineChart   },
]

const STATUS_STYLES = {
  bullish:   { color: '#34d399', dot: '#34d399' },
  bearish:   { color: '#f87171', dot: '#f87171' },
  overbought:{ color: '#f87171', dot: '#f87171' },
  oversold:  { color: '#34d399', dot: '#34d399' },
  neutral:   { color: '#9aa4b8', dot: '#8b95ac' },
}

function getStatusStyle(status) {
  if (!status) return STATUS_STYLES.neutral
  const key = status.toLowerCase()
  for (const [k, v] of Object.entries(STATUS_STYLES)) {
    if (key.includes(k)) return v
  }
  return STATUS_STYLES.neutral
}

function IndicatorChip({ Icon, label, value, status, note }) {
  const style = getStatusStyle(status)
  const display = note || status || '—'

  return (
    <div className="flex items-center justify-between py-1.5 border-b border-white/[0.04] last:border-0">
      <div className="flex items-center gap-2">
        <Icon size={12} className="text-text-muted shrink-0 w-3.5" />
        <span className="text-[10px] font-medium text-text-muted w-10">{label}</span>
        {value && (
          <span className="text-[10px] font-mono text-text-secondary">{value}</span>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <div
          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: style.dot, boxShadow: `0 0 4px ${style.dot}77` }}
        />
        <span className="text-[9px] capitalize font-medium" style={{ color: style.color }}>
          {display.length > 16 ? display.slice(0, 16) + '…' : display}
        </span>
      </div>
    </div>
  )
}

export default function IndicatorRow({ data }) {
  const indicators = data?.indicators

  if (!indicators) {
    return (
      <div className="mx-3 mb-3 rounded-xl border border-white/8 bg-white/[0.03] p-3">
        <span className="text-[10px] text-text-muted uppercase tracking-wider">Indicators</span>
        <div className="mt-2 space-y-1">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-3 bg-white/5 rounded animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  const chips = INDICATOR_KEYS
    .map(({ key, label, icon: Icon }) => {
      const ind = indicators[key]
      if (!ind) return null
      return { Icon, label, value: ind.value, status: ind.status, note: ind.note }
    })
    .filter(Boolean)

  if (!chips.length) return null

  return (
    <div className="mx-3 mb-3 rounded-xl border border-white/8 bg-white/[0.03] px-3 pt-2.5 pb-1">
      <span className="text-[10px] text-text-muted uppercase tracking-wider">Indicators</span>
      <div className="mt-1">
        {chips.map((c, i) => (
          <IndicatorChip key={i} {...c} />
        ))}
      </div>
    </div>
  )
}
