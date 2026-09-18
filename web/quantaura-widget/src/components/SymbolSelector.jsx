/**
 * SymbolSelector — Horizontal scrollable tab bar for crypto pair switching.
 */

const SYMBOLS = [
  { symbol: 'BTCUSDT', label: 'BTC', icon: '₿', color: '#f7931a' },
  { symbol: 'ETHUSDT', label: 'ETH', icon: 'Ξ', color: '#627eea' },
  { symbol: 'SOLUSDT', label: 'SOL', icon: '◎', color: '#9945FF' },
  { symbol: 'BNBUSDT', label: 'BNB', icon: '⬡', color: '#f3ba2f' },
  { symbol: 'XRPUSDT', label: 'XRP', icon: '✕', color: '#00AAE4' },
]

export default function SymbolSelector({ activeSymbol, onSelect, disabled }) {
  return (
    <div className="px-3 pb-2">
      <div className="flex gap-1 overflow-x-auto scrollbar-hide">
        {SYMBOLS.map(({ symbol, label, icon, color }) => {
          const isActive = activeSymbol === symbol
          return (
            <button
              key={symbol}
              onClick={() => !disabled && onSelect(symbol)}
              disabled={disabled}
              className={`flex-shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all duration-200 ${
                isActive
                  ? 'text-white shadow-lg'
                  : 'text-text-muted hover:text-text-secondary hover:bg-white/5'
              }`}
              style={
                isActive
                  ? {
                      background: `linear-gradient(135deg, ${color}22, ${color}44)`,
                      border: `1px solid ${color}66`,
                      boxShadow: `0 0 12px ${color}33`,
                    }
                  : { border: '1px solid transparent' }
              }
              title={symbol}
            >
              <span style={{ color: isActive ? color : undefined }}>{icon}</span>
              <span>{label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
