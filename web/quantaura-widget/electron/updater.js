/**
 * updater.js — Background polling engine for QuantAura Widget.
 *
 * Fetches fresh signal + market data from quantaura.tech every POLL_INTERVAL ms
 * and calls the provided callback so main.js can push the data to the renderer
 * and trigger native notifications.
 *
 * Runs entirely in the Electron main process — no renderer involvement.
 */

const BASE_URL      = 'https://quantaura.tech'
const POLL_INTERVAL = 60_000   // 60 seconds

let signalTimer   = null
let currentSymbol = 'BTCUSDT'
let authToken     = null

// ─── Fetch helpers ────────────────────────────────────────────────────────────
async function fetchSignal(symbol) {
  const headers = { 'Accept': 'application/json' }
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`
  }
  const res = await fetch(`${BASE_URL}/api/signals?symbol=${symbol}`, { headers })
  if (!res.ok) throw new Error(`Signal fetch failed: ${res.status}`)
  const json = await res.json()
  return json.data
}

async function fetchCandle(symbol) {
  const res = await fetch(
    `${BASE_URL}/api/market/candles?symbol=${symbol}&interval=4h&limit=24`,
    { headers: { 'Accept': 'application/json' } }
  )
  if (!res.ok) throw new Error(`Candle fetch failed: ${res.status}`)
  const json = await res.json()
  return json.data
}

// ─── Candle parsing — handles Binance array OR object formats ─────────────────
function parseCandle(c) {
  if (!c) return null
  if (Array.isArray(c)) {
    return {
      open:   parseFloat(c[1]),
      high:   parseFloat(c[2]),
      low:    parseFloat(c[3]),
      close:  parseFloat(c[4]),
      volume: parseFloat(c[5]),
    }
  }
  // Object format (some proxies return named keys)
  return {
    open:   parseFloat(c.open   || c.o || 0),
    high:   parseFloat(c.high   || c.h || 0),
    low:    parseFloat(c.low    || c.l || 0),
    close:  parseFloat(c.close  || c.c || 0),
    volume: parseFloat(c.volume || c.v || c.quoteVolume || 0),
  }
}

// ─── Combined data fetch ──────────────────────────────────────────────────────
async function fetchAll(symbol, callback) {
  try {
    // Fetch signal and candles in parallel
    const [signal, rawCandles] = await Promise.all([
      fetchSignal(symbol).catch(e => { console.warn('[Updater] signal err:', e.message); return {} }),
      fetchCandle(symbol).catch(e => { console.warn('[Updater] candle err:', e.message); return [] }),
    ])

    // Parse candles safely
    const candles = (Array.isArray(rawCandles) ? rawCandles : [])
      .map(parseCandle)
      .filter(c => c && !isNaN(c.close) && c.close > 0)

    const latest = candles[candles.length - 1] || null

    // Price: prefer parsed candle close, fall back to signal.price from API
    const price = (latest && latest.close > 0)
      ? latest.close
      : (parseFloat(signal.price) > 0 ? parseFloat(signal.price) : null)

    // 24h stats
    const first    = candles[0] || null
    const open24h  = first ? first.open : price
    const change24h = (open24h && price && open24h > 0)
      ? (((price - open24h) / open24h) * 100).toFixed(2)
      : '0.00'
    const high24h   = candles.length ? Math.max(...candles.map(c => c.high))   : price
    const low24h    = candles.length ? Math.min(...candles.map(c => c.low))    : price
    const volume24h = candles.length ? candles.reduce((s, c) => s + (c.volume || 0), 0) : 0
    const sparkline = candles.map(c => c.close)

    console.log(`[Updater] ${symbol} | price=$${price?.toFixed(2)} | signal=${signal?.signal} | candles=${candles.length}`)

    callback({
      ...signal,
      symbol: signal?.symbol || symbol,
      price,
      change24h:  parseFloat(change24h),
      high24h,
      low24h,
      volume24h,
      sparkline,
      fetchedAt: Date.now(),
    })
  } catch (err) {
    console.error('[Updater] Unexpected error:', err.message)
    if (callback) callback({ error: err.message, fetchedAt: Date.now() })
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────
function startUpdater(callback) {
  console.log('[Updater] Starting background polling...')
  fetchAll(currentSymbol, callback)
  if (signalTimer) clearInterval(signalTimer)
  signalTimer = setInterval(() => fetchAll(currentSymbol, callback), POLL_INTERVAL)
}

function stopUpdater() {
  if (signalTimer) clearInterval(signalTimer)
  signalTimer = null
  console.log('[Updater] Stopped.')
}

function setSymbol(symbol, callback) {
  currentSymbol = symbol
  console.log(`[Updater] Switched symbol to ${symbol}`)
  if (signalTimer) {
    clearInterval(signalTimer)
    signalTimer = setInterval(() => fetchAll(currentSymbol, callback), POLL_INTERVAL)
  }
  fetchAll(symbol, callback)
}

function refreshNow(callback) {
  console.log(`[Updater] Manual refresh for ${currentSymbol}`)
  fetchAll(currentSymbol, callback)
}

function getCurrentSymbol() {
  return currentSymbol
}

function setAuthToken(token, callback) {
  authToken = token || null
  console.log(`[Updater] Auth token updated: ${authToken ? 'Logged In' : 'Logged Out'}`)
  if (callback) {
    fetchAll(currentSymbol, callback)
  }
}

function getAuthToken() {
  return authToken
}

module.exports = { startUpdater, stopUpdater, setSymbol, refreshNow, getCurrentSymbol, setAuthToken, getAuthToken, fetchAll }
