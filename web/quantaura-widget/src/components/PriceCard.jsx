import { useEffect, useRef, useState } from 'react'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { LineChart, Line, ResponsiveContainer, Tooltip } from 'recharts'

/**
 * PriceCard — Live price, 24h stats, and sparkline mini chart.
 */
export default function PriceCard({ data, symbol }) {
  const [flash, setFlash]       = useState(null)   // 'up' | 'down' | null
  const prevPriceRef            = useRef(null)

  const price     = data?.price    ?? null
  const change24h = data?.change24h ?? 0
  const high24h   = data?.high24h  ?? null
  const low24h    = data?.low24h   ?? null
  const volume24h = data?.volume24h ?? 0
  const sparkline = data?.sparkline ?? []  // array of close prices

  const isUp      = change24h >= 0
  const changeColor = isUp ? '#34d399' : '#f87171'

  // Sparkline data from sparkline array
  const sparkData = sparkline.slice(-20).map((v, i) => ({ i, v }))

  // Flash animation on price change
  useEffect(() => {
    if (price === null) return
    if (prevPriceRef.current !== null && prevPriceRef.current !== price) {
      const dir = price > prevPriceRef.current ? 'up' : 'down'
      setFlash(dir)
      const t = setTimeout(() => setFlash(null), 600)
      return () => clearTimeout(t)
    }
    prevPriceRef.current = price
  }, [price])

  const formatPrice = (p) => {
    if (p === null || p === undefined || isNaN(p)) return '—'
    return parseFloat(p).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: p > 1000 ? 2 : 4,
    })
  }

  const formatVolume = (v) => {
    if (!v) return '—'
    if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`
    if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`
    return `$${v.toFixed(0)}`
  }

  const coinLabel = symbol.replace('USDT', '')

  return (
    <div className="mx-3 mb-3 rounded-xl border border-white/8 bg-white/[0.03] p-3 backdrop-blur-sm">
      {/* Price row */}
      <div className="flex items-start justify-between mb-1">
        <div>
          <div
            className={`font-mono text-2xl font-bold text-text-primary transition-all duration-300 ${
              flash === 'up'   ? 'text-signal-buy'  :
              flash === 'down' ? 'text-signal-sell' : ''
            }`}
            style={{
              animation: flash ? 'priceFlash 0.4s ease-out' : undefined,
            }}
          >
            ${formatPrice(price)}
          </div>
          <div className="text-[10px] text-text-muted mt-0.5">{coinLabel} / USDT • 4h</div>
        </div>

        <div className={`flex items-center gap-1 px-2 py-1 rounded-lg text-sm font-semibold ${
          isUp ? 'bg-signal-buy/10 text-signal-buy' : 'bg-signal-sell/10 text-signal-sell'
        }`}>
          {isUp ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
          {isUp ? '+' : ''}{change24h}%
        </div>
      </div>

      {/* Sparkline */}
      {sparkData.length > 2 && (
        <div className="h-14 mb-2 -mx-1">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={sparkData}>
              <Line
                type="monotone"
                dataKey="v"
                stroke={changeColor}
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
              <Tooltip
                contentStyle={{
                  background: 'rgba(18,20,28,0.95)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '6px',
                  fontSize: '10px',
                  padding: '4px 8px',
                  color: '#f4f6fb',
                }}
                formatter={(v) => [`$${formatPrice(v)}`, '']}
                labelFormatter={() => ''}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 24h Stats */}
      <div className="grid grid-cols-3 gap-2 mt-1">
        {[
          { label: '24h High', value: `$${formatPrice(high24h)}`, color: '#34d399' },
          { label: '24h Low',  value: `$${formatPrice(low24h)}`,  color: '#f87171' },
          { label: 'Volume',   value: formatVolume(volume24h),     color: '#9aa4b8' },
        ].map(({ label, value, color }) => (
          <div key={label} className="flex flex-col">
            <span className="text-[9px] text-text-muted uppercase tracking-wider">{label}</span>
            <span className="text-[11px] font-mono font-medium mt-0.5" style={{ color }}>
              {value}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
