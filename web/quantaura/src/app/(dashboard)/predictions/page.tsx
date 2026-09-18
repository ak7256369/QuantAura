'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import dynamic from 'next/dynamic';

// Sparklines load on demand — keeps ~336 KB of recharts out of this route's
// first-load JS. The pred-sparkline container is height-fixed in CSS, so the
// late mount cannot shift layout.
const Sparkline = dynamic(() => import('@/components/Chart/charts').then(m => m.Sparkline), { ssr: false });
import { RefreshCw, TrendingUp, TrendingDown, Minus, Zap, Clock, AlertTriangle, CheckCircle2, Lock, Sparkles } from 'lucide-react';
import Link from 'next/link';
import AnimatedPage from '@/components/Motion/AnimatedPage';
import SignalRealityCheck from '@/components/Dashboard/SignalRealityCheck';
import useModelStats from '@/hooks/useModelStats';
import { useAuth, getToken } from '@/lib/auth';

// ─── Types ────────────────────────────────────────────────────────────────────
type Signal = 'BUY' | 'SELL' | 'HOLD';
interface ModelAgreement { lstm: boolean; xgboost: boolean; transformer: boolean; kan: boolean; }
interface CoinPrediction {
  symbol: string; name: string; price: number; signal: Signal;
  /** null on the free tier — the backend redacts it */
  confidence: number | null;
  /** true when the whole coin is premium-only for this viewer */
  locked?: boolean;
  tier?: 'free' | 'premium';
  modelAgreement: ModelAgreement | null; sparkline: { v: number }[]; lastUpdated: string;
  priceChange24h: number; source: 'ml_ensemble' | 'ta_fallback' | 'offline';
}

// ─── Constants ────────────────────────────────────────────────────────────────
const COINS = [
  { symbol: 'BTCUSDT',  name: 'Bitcoin',   short: 'BTC',  color: '#f7931a' },
  { symbol: 'ETHUSDT',  name: 'Ethereum',  short: 'ETH',  color: '#627eea' },
  { symbol: 'BNBUSDT',  name: 'BNB',       short: 'BNB',  color: '#f3ba2f' },
  { symbol: 'SOLUSDT',  name: 'Solana',    short: 'SOL',  color: '#9945ff' },
  { symbol: 'XRPUSDT',  name: 'XRP',       short: 'XRP',  color: '#00aae4' },
  { symbol: 'ADAUSDT',  name: 'Cardano',   short: 'ADA',  color: '#0033ad' },
  { symbol: 'AVAXUSDT', name: 'Avalanche', short: 'AVAX', color: '#e84142' },
  { symbol: 'DOTUSDT',  name: 'Polkadot',  short: 'DOT',  color: '#e6007a' },
  { symbol: 'LINKUSDT', name: 'Chainlink', short: 'LINK', color: '#2a5ada' },
  { symbol: 'DOGEUSDT', name: 'Dogecoin',  short: 'DOGE', color: '#c2a633' },
];
const BINANCE_REST = 'https://api.binance.com/api/v3';
const SIGNAL_COLOR: Record<Signal, string> = { BUY: '#34d399', SELL: '#f87171', HOLD: '#fbbf24' };

// ─── Helpers ──────────────────────────────────────────────────────────────────
function flatSparkline(base: number): { v: number }[] {
  let p = base;
  return Array.from({ length: 24 }, () => { p = p * (1 + (Math.random() - 0.5) * 0.01); return { v: p }; });
}

async function fetchTicker(symbol: string) {
  const r = await fetch(`${BINANCE_REST}/ticker/24hr?symbol=${symbol}`, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error('ticker error');
  return r.json();
}

function delay(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function fetchSparkline(symbol: string): Promise<number[]> {
  const r = await fetch(`${BINANCE_REST}/klines?symbol=${symbol}&interval=1h&limit=24`, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error('klines error');
  const raw = await r.json();
  return raw.map((k: string[]) => parseFloat(k[4]));
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function AnimatedCounter({ value, suffix = '' }: { value: number; suffix?: string }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let c = 0; const step = value / 40;
    const id = setInterval(() => { c += step; if (c >= value) { setN(value); clearInterval(id); } else setN(Math.floor(c)); }, 20);
    return () => clearInterval(id);
  }, [value]);
  return <>{n}{suffix}</>;
}

function CircularRing({ pct, color }: { pct: number; color: string }) {
  const r = 28, circ = 2 * Math.PI * r;
  return (
    <svg width="72" height="72" viewBox="0 0 72 72">
      <circle cx="36" cy="36" r={r} fill="none" stroke="var(--bg-hover)" strokeWidth="5" />
      <motion.circle cx="36" cy="36" r={r} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round"
        strokeDasharray={`${circ}`} initial={{ strokeDashoffset: circ }}
        animate={{ strokeDashoffset: circ - (pct / 100) * circ }}
        transition={{ duration: 1.2, ease: 'easeOut', delay: 0.3 }}
        style={{ transformOrigin: '50% 50%', transform: 'rotate(-90deg)' }} />
      <text x="36" y="40" textAnchor="middle" fill="currentColor" fontSize="13" fontWeight="700"
        fontFamily="var(--font-mono)" style={{ fill: 'var(--text-primary)' }}>{pct}%</text>
    </svg>
  );
}

function SignalBadge({ signal }: { signal: Signal }) {
  const color = SIGNAL_COLOR[signal];
  const icon = signal === 'BUY' ? <TrendingUp size={11} /> : signal === 'SELL' ? <TrendingDown size={11} /> : <Minus size={11} />;
  return (
    <div className={`signal-badge ${signal.toLowerCase()}`}>
      <motion.span animate={{ scale: [1, 1.4, 1] }} transition={{ repeat: Infinity, duration: 1.8 }}>{icon}</motion.span>
      {signal}
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="pred-skeleton">
      <motion.div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg,transparent,var(--bg-hover),transparent)' }}
        animate={{ x: ['-100%', '100%'] }} transition={{ repeat: Infinity, duration: 1.5, ease: 'linear' }} />
      {[80, 120, 60, 90, 50].map((w, i) => (
        <div key={i} className="pred-skeleton-line" style={{ height: 12, width: `${w}%` }} />
      ))}
    </div>
  );
}

/** Card shown for coins outside the viewer's tier — price context stays,
 *  the model's opinion is the paid product. */
function LockedCoinCard({ data, coinMeta }: { data: CoinPrediction; coinMeta: typeof COINS[0] }) {
  return (
    <motion.div layout initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.25 }} className="pred-card locked">
      <div className="pred-card-header">
        <div className="pred-coin-info">
          <div className="pred-coin-avatar" style={{ background: `${coinMeta.color}18`, border: `1.5px solid ${coinMeta.color}50`, color: coinMeta.color }}>
            {coinMeta.short.slice(0, 2)}
          </div>
          <div>
            <div className="pred-coin-name">{data.name}</div>
            <div className="pred-coin-pair">{coinMeta.short}/USDT</div>
          </div>
        </div>
        <div className="premium-lock-chip static"><Lock size={10} /> Premium</div>
      </div>

      {data.price > 0 && (
        <div className="pred-price-row">
          <div>
            <div className="pred-price">
              ${data.price < 10 ? data.price.toFixed(4) : data.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="pred-change" style={{ color: data.priceChange24h >= 0 ? 'var(--signal-buy)' : 'var(--signal-sell)' }}>
              {data.priceChange24h >= 0 ? '▲' : '▼'} {Math.abs(data.priceChange24h).toFixed(2)}% 24h
            </div>
          </div>
          <div className="pred-locked-ring"><Lock size={20} /></div>
        </div>
      )}

      <div className="pred-sparkline">
        <Sparkline data={data.sparkline} color="var(--text-muted)" />
      </div>

      <div className="pred-locked-body">
        <p>AI signal, confidence and per-model breakdown are available on Premium.</p>
        <Link href="/pricing" className="pred-unlock-btn"><Sparkles size={13} /> Unlock this signal</Link>
      </div>
    </motion.div>
  );
}

function CoinCard({ data, coinMeta }: { data: CoinPrediction; coinMeta: typeof COINS[0] }) {
  const color = SIGNAL_COLOR[data.signal];
  const sig = data.signal.toLowerCase();
  const isFree = data.tier === 'free';
  return (
    <motion.div layout initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.25 }} className={`pred-card ${sig}`}>

      {/* Top glow bar */}
      <div className="pred-card-glow" style={{ background: `linear-gradient(90deg,transparent,${color},transparent)` }} />

      {/* Header */}
      <div className="pred-card-header">
        <div className="pred-coin-info">
          <div className="pred-coin-avatar" style={{ background: `${coinMeta.color}18`, border: `1.5px solid ${coinMeta.color}50`, color: coinMeta.color }}>
            {coinMeta.short.slice(0, 2)}
          </div>
          <div>
            <div className="pred-coin-name">{data.name}</div>
            <div className="pred-coin-pair">{coinMeta.short}/USDT</div>
          </div>
        </div>
        <SignalBadge signal={data.signal} />
      </div>

      {/* Price + Ring */}
      <div className="pred-price-row">
        <div>
          <div className="pred-price">
            ${data.price < 10 ? data.price.toFixed(4) : data.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="pred-change" style={{ color: data.priceChange24h >= 0 ? 'var(--signal-buy)' : 'var(--signal-sell)' }}>
            {data.priceChange24h >= 0 ? '▲' : '▼'} {Math.abs(data.priceChange24h).toFixed(2)}% 24h
          </div>
        </div>
        {isFree || data.confidence === null
          ? <Link href="/pricing" className="pred-locked-ring" title="Confidence is a Premium feature"><Lock size={20} /></Link>
          : <CircularRing pct={data.confidence} color={color} />}
      </div>

      {/* Confidence bar */}
      <div>
        <div className="pred-conf-label-row">
          <span className="pred-conf-label">Confidence · 24h outlook</span>
          {isFree || data.confidence === null
            ? <Link href="/pricing" className="premium-lock-chip"><Lock size={9} /> Premium</Link>
            : <span style={{ fontSize: 10, fontWeight: 700, color }}>{data.confidence}%</span>}
        </div>
        <div className="pred-conf-track">
          {isFree || data.confidence === null
            ? <div className="pred-conf-fill locked-stripes" />
            : <motion.div className="pred-conf-fill" initial={{ width: 0 }} animate={{ width: `${data.confidence}%` }}
                transition={{ duration: 1.1, ease: 'easeOut', delay: 0.2 }}
                style={{ background: `linear-gradient(90deg,${color}99,${color})` }} />}
        </div>
      </div>

      {/* Sparkline */}
      <div className="pred-sparkline">
        <Sparkline data={data.sparkline} color={color} />
      </div>

      {/* Model agreement */}
      <div className="pred-model-row">
        {data.modelAgreement && !isFree
          ? ([['LSTM', data.modelAgreement.lstm], ['XGBoost', data.modelAgreement.xgboost], ['Transformer', data.modelAgreement.transformer], ['KAN', data.modelAgreement.kan]] as [string, boolean][]).map(([label, ok]) => (
              <span key={label} className={`pred-model-tag ${ok ? 'ok' : 'fail'}`}>{label} {ok ? '✓' : '✗'}</span>
            ))
          : ['LSTM', 'XGBoost', 'Transformer', 'KAN'].map(label => (
              <span key={label} className="pred-model-tag locked"><Lock size={8} /> {label}</span>
            ))}
      </div>

      {/* Footer */}
      <div className="pred-footer">
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <Clock size={10} /> Updated {data.lastUpdated}
        </div>
        {data.source === 'ml_ensemble'
          ? <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--signal-buy)', fontSize: 10, fontWeight: 700 }}><CheckCircle2 size={10} /> ML Ensemble</div>
          : <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--signal-hold)', fontSize: 10, fontWeight: 700 }}><Zap size={10} /> TA Fallback</div>
        }
      </div>
    </motion.div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────
export default function PredictionsPage() {
  const [predictions, setPredictions] = useState<Map<string, CoinPrediction>>(new Map());
  const [loading, setLoading] = useState<Set<string>>(new Set(COINS.map(c => c.symbol)));
  const [errors, setErrors] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<'ALL' | Signal>('ALL');
  const [backendUp, setBackendUp] = useState<boolean | null>(null);
  const { data: stats } = useModelStats();
  const { user, isPremium, loading: authLoading } = useAuth();

  const fetchPrediction = useCallback(async (symbol: string, retryCount = 0) => {
    setLoading(prev => new Set([...prev, symbol]));
    setErrors(prev => { const s = new Set(prev); s.delete(symbol); return s; });
    const coin = COINS.find(c => c.symbol === symbol)!;
    const MAX_RETRIES = 2;
    try {
      const token = getToken();
      const [sigRes, tickerRes, sparkRes] = await Promise.allSettled([
        fetch(`/api/signals?symbol=${symbol}`, {
          signal: AbortSignal.timeout(30000),
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        }),
        fetchTicker(symbol),
        fetchSparkline(symbol),
      ]);
      let signalData: any = null;
      if (sigRes.status === 'fulfilled' && sigRes.value.ok) {
        const json = await sigRes.value.json();
        signalData = json.data;
      }
      let price = 0, priceChange24h = 0;
      if (tickerRes.status === 'fulfilled') {
        price = parseFloat(tickerRes.value.lastPrice);
        priceChange24h = parseFloat(tickerRes.value.priceChangePercent);
      }
      const sparkline: { v: number }[] = sparkRes.status === 'fulfilled'
        ? sparkRes.value.map((v: number) => ({ v }))
        : flatSparkline(price || 100);
      if (!signalData) throw new Error('No signal data');

      // Free tier: this coin is premium-only — render a locked card with the
      // public price context instead of a signal.
      if (signalData.locked) {
        setPredictions(prev => new Map(prev).set(symbol, {
          symbol, name: coin.name, price, signal: 'HOLD', confidence: null, locked: true,
          tier: 'free', modelAgreement: null, sparkline,
          lastUpdated: new Date().toLocaleTimeString(), priceChange24h, source: 'ta_fallback',
        }));
        return;
      }

      const rawSignal = (signalData.signal || 'HOLD').toUpperCase() as Signal;
      const tier: 'free' | 'premium' = signalData.tier === 'free' ? 'free' : 'premium';
      const rawConf = signalData.confidence;
      const confidence = rawConf === null || rawConf === undefined
        ? null
        : rawConf <= 1 ? Math.round(rawConf * 100) : Math.round(rawConf);
      const ensemble = signalData.ensemble;
      const modelAgreement: ModelAgreement | null = ensemble ? {
        lstm:        (ensemble.lstm?.signal ?? rawSignal).toUpperCase() === rawSignal,
        xgboost:     (ensemble.xgboost?.signal ?? rawSignal).toUpperCase() === rawSignal,
        transformer: (ensemble.transformer?.signal ?? rawSignal).toUpperCase() === rawSignal,
        kan:         (ensemble.kan?.signal ?? rawSignal).toUpperCase() === rawSignal,
      } : null;
      setPredictions(prev => new Map(prev).set(symbol, {
        symbol, name: coin.name, price, signal: rawSignal, confidence, tier, modelAgreement,
        sparkline, lastUpdated: new Date().toLocaleTimeString(), priceChange24h,
        source: signalData.source === 'ml_ensemble' ? 'ml_ensemble' : 'ta_fallback',
      }));
    } catch {
      if (retryCount < MAX_RETRIES) {
        // Exponential backoff: 2s, 4s
        await delay((retryCount + 1) * 2000);
        return fetchPrediction(symbol, retryCount + 1);
      }
      setErrors(prev => new Set([...prev, symbol]));
    } finally {
      setLoading(prev => { const s = new Set(prev); s.delete(symbol); return s; });
    }
  }, []);

  useEffect(() => {
    fetch('/api/health', { signal: AbortSignal.timeout(3000) })
      .then(r => r.json()).then(j => setBackendUp(j.status === 'ok')).catch(() => setBackendUp(false));
  }, []);

  useEffect(() => {
    // Stagger requests to avoid overwhelming the backend. Re-runs when the
    // viewer's tier resolves or changes, so locked cards unlock after login.
    if (authLoading) return;
    COINS.forEach((c, i) => {
      setTimeout(() => fetchPrediction(c.symbol), i * 400);
    });
  }, [fetchPrediction, authLoading, user?.id, user?.plan]);

  const all = Array.from(predictions.values());
  const unlocked = all.filter(p => !p.locked);
  const buys = unlocked.filter(p => p.signal === 'BUY').length;
  const sells = unlocked.filter(p => p.signal === 'SELL').length;
  const holds = unlocked.filter(p => p.signal === 'HOLD').length;
  const withConf = unlocked.filter(p => p.confidence !== null);
  const avgConf = withConf.length > 0 ? Math.round(withConf.reduce((s, p) => s + (p.confidence ?? 0), 0) / withConf.length) : null;

  const filteredCoins = COINS.filter(c => {
    if (filter === 'ALL') return true;
    const p = predictions.get(c.symbol);
    return p && !p.locked && p.signal === filter;
  });

  const summaryCards = [
    { label: 'BUY Signals',    value: buys,    color: 'var(--signal-buy)',  iconBg: 'var(--signal-buy-bg)',  icon: <TrendingUp size={16} /> },
    { label: 'SELL Signals',   value: sells,   color: 'var(--signal-sell)', iconBg: 'var(--signal-sell-bg)', icon: <TrendingDown size={16} /> },
    { label: 'HOLD Signals',   value: holds,   color: 'var(--signal-hold)', iconBg: 'var(--signal-hold-bg)', icon: <Minus size={16} /> },
    { label: 'Avg Confidence', value: avgConf, color: '#6366f1',            iconBg: 'rgba(99,102,241,0.1)',  icon: <Zap size={16} />, suffix: '%', premiumOnly: true },
  ];

  const filterClass = (f: string) => {
    const base = 'pred-filter-btn';
    const active = filter === f ? `active-${f.toLowerCase()}` : '';
    return `${base} ${active}`.trim();
  };

  return (
    <AnimatedPage>
      {/* Page header */}
      <div className="page-header">
        <div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            <span className="page-badge indigo">LIVE · AI Predictions</span>
            {backendUp === true && (
              <span className="page-badge green">
                ✓ Systems Online · {all.length} Assets Tracked
              </span>
            )}
            {backendUp === false && <span className="page-badge red">✗ Backend Offline</span>}
          </div>
          <h1>AI Signal Dashboard</h1>
          <p>Each signal is the ensemble&apos;s 24-hour trend outlook — uptrend (BUY), neutral (HOLD) or downtrend (SELL)</p>
        </div>
        <motion.button className="pred-filter-btn" onClick={() => COINS.forEach(c => fetchPrediction(c.symbol))}
          whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <RefreshCw size={13} /> Refresh All
        </motion.button>
      </div>

      {/* Summary grid */}
      <div className="pred-summary-grid">
        {summaryCards.map((card, i) => (
          <motion.div key={card.label} className="pred-summary-card"
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}>
            <div className="pred-summary-icon" style={{ background: card.iconBg, color: card.color }}>
              {card.icon}
            </div>
            <div>
              <div className="pred-summary-label">{card.label}</div>
              <div className="pred-summary-value" style={{ color: card.color }}>
                {(card as any).premiumOnly && card.value === null
                  ? <Link href="/pricing" className="premium-lock-chip"><Lock size={9} /> Premium</Link>
                  : all.length > 0 && card.value !== null ? <AnimatedCounter value={card.value} suffix={(card as any).suffix} /> : '—'}
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Honest performance disclosure — sits ABOVE the signal cards so the
          limits are read before the signals, not buried under them. */}
      {stats?.tradeability && <SignalRealityCheck data={stats.tradeability} />}

      {/* Free-tier banner */}
      {!authLoading && !isPremium && (
        <motion.div className="free-tier-banner" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <div>
            <strong>{user ? 'You are on the Free plan.' : 'You are browsing as a guest.'}</strong>{' '}
            Free shows the AI&apos;s direction call on BTC & ETH only. Premium unlocks all 10 coins, confidence scores, per-model votes and explanations.
          </div>
          <Link href={user ? '/pricing' : '/register'} className="pred-unlock-btn">
            <Sparkles size={13} /> {user ? 'Upgrade' : 'Start Free'}
          </Link>
        </motion.div>
      )}

      {/* Filter bar */}
      <div className="pred-filter-bar">
        <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, marginRight: 4 }}>Filter:</span>
        {(['ALL', 'BUY', 'SELL', 'HOLD'] as const).map(f => (
          <button key={f} className={filterClass(f)} onClick={() => setFilter(f)}>{f}</button>
        ))}
      </div>

      {/* Grid */}
      <AnimatePresence mode="wait">
        <motion.div key={filter} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="pred-grid">
          {filteredCoins.map(coin => {
            const isLoading = loading.has(coin.symbol);
            const hasError = errors.has(coin.symbol);
            const data = predictions.get(coin.symbol);
            if (isLoading) return <SkeletonCard key={coin.symbol} />;
            if (hasError || !data) return (
              <motion.div key={coin.symbol} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="pred-error-card">
                <AlertTriangle size={28} color="var(--signal-sell)" />
                <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Failed to load {coin.name}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>Backend may be offline</div>
                <button className="pred-retry-btn" onClick={() => fetchPrediction(coin.symbol)}>Retry</button>
              </motion.div>
            );
            if (data.locked) return <LockedCoinCard key={coin.symbol} data={data} coinMeta={coin} />;
            return <CoinCard key={coin.symbol} data={data} coinMeta={coin} />;
          })}
        </motion.div>
      </AnimatePresence>

      {filteredCoins.length === 0 && all.length > 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
          No {filter} signals at the moment.
        </motion.div>
      )}
    </AnimatedPage>
  );
}
