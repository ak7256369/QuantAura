import { useState } from 'react'
import { AlertCircle }  from 'lucide-react'
import TitleBar        from './components/TitleBar'
import SymbolSelector  from './components/SymbolSelector'
import PriceCard       from './components/PriceCard'
import PredictionGauge from './components/PredictionGauge'
import ModelBreakdown  from './components/ModelBreakdown'
import IndicatorRow    from './components/IndicatorRow'
import AlertBanner     from './components/AlertBanner'
import AuthModal       from './components/AuthModal'
import { useSignalData } from './hooks/useSignalData'
import { useAuth }       from './hooks/useAuth'

export default function App() {
  const [isAuthOpen, setIsAuthOpen] = useState(false)
  const auth = useAuth()

  const {
    data,
    loading,
    error,
    symbol,
    setSymbol,
    refresh,
    lastUpdated,
    isPinned,
    setIsPinned,
  } = useSignalData('BTCUSDT')

  return (
    <div className="widget-root flex flex-col h-screen overflow-hidden relative">

      {/* ── Title Bar ─────────────────────────────────── */}
      <TitleBar
        isPinned={isPinned}
        onPinToggle={() => setIsPinned(p => !p)}
        onRefresh={refresh}
        loading={loading}
        onOpenAuth={() => setIsAuthOpen(true)}
        auth={auth}
      />

      {/* ── Auth Modal (QuantAura Glassmorphism UI) ──── */}
      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        auth={auth}
      />

      {/* ── Symbol Tabs ────────────────────────────────── */}
      <SymbolSelector
        activeSymbol={symbol}
        onSelect={setSymbol}
        disabled={false}
      />

      {/* ── Scrollable Content ─────────────────────────── */}
      <div className="flex-1 overflow-y-auto scrollbar-hide pb-1">

        {/* Error state */}
        {error && (!data || data?.symbol !== symbol) && (
          <div className="mx-3 mb-3 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
            <p className="text-xs text-red-400 flex items-center gap-1.5 font-medium">
              <AlertCircle size={13} className="shrink-0" />
              <span>{error}</span>
            </p>
            <button
              onClick={refresh}
              className="mt-1.5 text-[10px] text-accent underline underline-offset-2"
            >
              Retry
            </button>
          </div>
        )}

        {/* Loading skeleton (initial load or symbol switch) */}
        {(loading || !data || data?.symbol !== symbol) && (
          <div className="mx-3 space-y-3 mt-1 animate-pulse">
            <div className="h-32 rounded-xl bg-white/[0.03] border border-white/8" />
            <div className="h-20 rounded-xl bg-white/[0.03] border border-white/8" />
            <div className="h-20 rounded-xl bg-white/[0.03] border border-white/8" />
          </div>
        )}

        {/* Live data */}
        {data && data?.symbol === symbol && (
          <>
            <PriceCard       data={data} symbol={symbol} />
            <PredictionGauge data={data} />
            <ModelBreakdown  data={data} />
            <IndicatorRow    data={data} />
            <AlertBanner     data={data} lastUpdated={lastUpdated} />
          </>
        )}
      </div>
    </div>
  )
}
