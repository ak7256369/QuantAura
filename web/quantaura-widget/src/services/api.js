/**
 * api.js — All HTTP calls to the QuantAura production VPS.
 * Used by the React renderer for manual/on-demand fetches.
 * Background polling (auto 60s) is handled by electron/updater.js in main process.
 */

const BASE = 'https://quantaura.tech'

const DEFAULT_OPTS = {
  headers: { 'Accept': 'application/json' },
}

async function safeFetch(url) {
  const res = await fetch(url, DEFAULT_OPTS)
  if (!res.ok) throw new Error(`API error ${res.status}: ${url}`)
  return res.json()
}

// ── Auth ───────────────────────────────────────────────────────────────────────
export async function loginUser(email, password) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  })
  const json = await res.json()
  if (!res.ok || !json.success) {
    throw new Error(json.error || 'Invalid email or password.')
  }
  return json.data // { token, user }
}

export async function fetchUserProfile(token) {
  const res = await fetch(`${BASE}/api/auth/me`, {
    headers: {
      'Accept': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  })
  const json = await res.json()
  if (!res.ok || !json.success) {
    throw new Error(json.error || 'Failed to fetch profile.')
  }
  return json.data // user object
}

// ── Health ─────────────────────────────────────────────────────────────────────
export async function fetchHealth() {
  try {
    const data = await safeFetch(`${BASE}/api/health`)
    return { ok: true, ...data }
  } catch {
    return { ok: false }
  }
}

// ── Symbols list ───────────────────────────────────────────────────────────────
export async function fetchSymbols() {
  const json = await safeFetch(`${BASE}/api/market/symbols`)
  return json.data  // [{ symbol, name, icon, color }, ...]
}

// ── Candles (OHLCV) ────────────────────────────────────────────────────────────
// Returns an array of [timestamp, open, high, low, close, volume]
export async function fetchCandles(symbol = 'BTCUSDT', interval = '4h', limit = 24) {
  const json = await safeFetch(
    `${BASE}/api/market/candles?symbol=${symbol}&interval=${interval}&limit=${limit}`
  )
  return json.data
}

// ── Signal + ML prediction ─────────────────────────────────────────────────────
export async function fetchSignal(symbol = 'BTCUSDT') {
  const json = await safeFetch(`${BASE}/api/signals?symbol=${symbol}`)
  return json.data
}

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
  return {
    open:   parseFloat(c.open   || c.o || 0),
    high:   parseFloat(c.high   || c.h || 0),
    low:    parseFloat(c.low    || c.l || 0),
    close:  parseFloat(c.close  || c.c || 0),
    volume: parseFloat(c.volume || c.v || c.quoteVolume || 0),
  }
}

// ── Combined fetch (signal + candles in parallel) ──────────────────────────────
export async function fetchAll(symbol = 'BTCUSDT') {
  const [signal, rawCandles] = await Promise.all([
    fetchSignal(symbol).catch(e => { console.warn('[API] signal err:', e.message); return {} }),
    fetchCandles(symbol).catch(e => { console.warn('[API] candle err:', e.message); return [] }),
  ])

  const candles = (Array.isArray(rawCandles) ? rawCandles : [])
    .map(parseCandle)
    .filter(c => c && !isNaN(c.close) && c.close > 0)

  const latest    = candles.length ? candles[candles.length - 1] : null
  const price     = (latest && latest.close > 0)
    ? latest.close
    : (parseFloat(signal?.price) > 0 ? parseFloat(signal.price) : null)

  const first     = candles[0] || null
  const open24h   = first ? first.open : price
  const change24h = (open24h && price && open24h > 0)
    ? (((price - open24h) / open24h) * 100).toFixed(2)
    : '0.00'
  const high24h   = candles.length ? Math.max(...candles.map(c => c.high))   : price
  const low24h    = candles.length ? Math.min(...candles.map(c => c.low))    : price
  const volume24h = candles.length ? candles.reduce((s, c) => s + (c.volume || 0), 0) : 0
  const sparkline = candles.map(c => c.close)

  return {
    ...signal,
    symbol: signal?.symbol || symbol,
    price,
    change24h: parseFloat(change24h),
    high24h,
    low24h,
    volume24h,
    sparkline,
    fetchedAt: Date.now(),
  }
}
