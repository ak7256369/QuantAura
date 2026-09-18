import { useState, useEffect, useCallback, useRef } from 'react'
import { fetchAll } from '../services/api'
import { onDataUpdate, onForceRefresh } from '../services/notify'

const DEFAULT_SYMBOL = 'BTCUSDT'
const POLL_MS        = 60_000  // only used in browser/non-Electron mode

const isElectron = () => typeof window !== 'undefined' && !!window.electronAPI

/**
 * useSignalData — Master data hook for the QuantAura Widget.
 *
 * In Electron: all data comes via IPC push from main process (updater.js).
 *              No direct renderer fetches — avoids CORS/data overwrite issues.
 * In Browser:  falls back to direct polling from quantaura.tech every 60s.
 */
export function useSignalData(initialSymbol = DEFAULT_SYMBOL) {
  const [data,        setData]        = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState(null)
  const [symbol,      setSymbolState] = useState(initialSymbol)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [isPinned,    setIsPinned]    = useState(true)

  const pollTimer = useRef(null)
  const symbolRef = useRef(symbol)
  useEffect(() => { symbolRef.current = symbol }, [symbol])

  // ── Handle incoming data (IPC or direct fetch) ───────────────────────────────
  const handleData = useCallback((payload) => {
    if (!payload) return
    if (payload.error) {
      setError(payload.error)
      setLoading(false)
      return
    }
    if (payload.symbol) {
      setSymbolState(payload.symbol)
    }
    setData(payload)
    setLastUpdated(payload.fetchedAt || Date.now())
    setLoading(false)
    setError(null)
  }, [])

  // ── Direct fetch (browser/non-Electron only) ─────────────────────────────────
  const doFetch = useCallback(async (sym) => {
    try {
      setError(null)
      const targetSym = sym || symbolRef.current
      const result = await fetchAll(targetSym)
      handleData(result)
    } catch (err) {
      console.error('[useSignalData] fetch error:', err.message)
      setError(err.message)
      setLoading(false)
    }
  }, [handleData])

  // ── Refresh ──────────────────────────────────────────────────────────────────
  const refresh = useCallback(() => {
    setLoading(true)
    if (isElectron()) {
      window.electronAPI.requestRefresh()
    } else {
      doFetch(symbolRef.current)
    }
  }, [doFetch])

  // ── Symbol switch ────────────────────────────────────────────────────────────
  const setSymbol = useCallback((sym) => {
    if (sym === symbolRef.current) return
    setSymbolState(sym)
    setLoading(true)
    if (isElectron()) {
      window.electronAPI.setSymbol(sym)
    } else {
      doFetch(sym)
    }
  }, [doFetch])

  // ── IPC subscriptions (Electron) ─────────────────────────────────────────────
  useEffect(() => {
    onDataUpdate(handleData)
    onForceRefresh(() => {
      if (!isElectron()) doFetch(symbolRef.current)
    })
  }, [handleData, doFetch])

  // ── Polling (browser-only fallback) ──────────────────────────────────────────
  useEffect(() => {
    if (isElectron()) {
      // Electron: main process pushes data via IPC — no direct fetch needed
      console.log('[useSignalData] Electron mode: waiting for IPC data...')
      return
    }
    // Browser mode only
    doFetch(symbol)
    pollTimer.current = setInterval(() => doFetch(symbolRef.current), POLL_MS)
    return () => { if (pollTimer.current) clearInterval(pollTimer.current) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived ──────────────────────────────────────────────────────────────────
  const signalColor = data?.signal === 'BUY'  ? '#34d399'
    : data?.signal === 'SELL' ? '#f87171'
    : '#fbbf24'

  const isMLSource = data?.source === 'ml_ensemble'

  return { data, loading, error, symbol, setSymbol, refresh, lastUpdated, isPinned, setIsPinned, signalColor, isMLSource }
}
