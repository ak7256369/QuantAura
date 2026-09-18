'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'motion/react';
import { CircleDollarSign, ChevronDown } from 'lucide-react';
import dynamic from 'next/dynamic';
import CandlestickChart from '@/components/Chart/CandlestickChart';
import AgentDashboard from '@/components/Dashboard/AgentDashboard';

// Below the fold on every viewport — loading them after hydration shortens the
// critical path without any visible difference. Containers are height-bounded
// in CSS, so the late mount cannot shift layout.
const NewsFeed = dynamic(() => import('@/components/NewsFeed/NewsFeed'), { ssr: false });
const CryptoChat = dynamic(() => import('@/components/Chat/CryptoChat'), { ssr: false });
import StatsRow from '@/components/Layout/StatsRow';
import AnimatedPage from '@/components/Motion/AnimatedPage';
import {
  fetchBinanceCandles,
  fetchBinanceTicker,
  fetchSignal,
  fetchNews,
  fetchCoinNewsSummary,
  checkBackendHealth,
} from '@/lib/api';

interface CandleData {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface SignalData {
  symbol: string;
  signal: string;
  confidence: number;
  ensemble: {
    lstm: { signal: string; confidence: number };
    xgboost: { signal: string; confidence: number };
    transformer: { signal: string; confidence: number };
  };
  indicators: Record<string, { value: string; status: string; note: string }>;
  macro: Record<string, { value: string; change: string; direction: string }>;
  explanation: string;
}

const SYMBOLS = [
  { symbol: 'BTCUSDT', name: 'BTC', color: '#f7931a' },
  { symbol: 'ETHUSDT', name: 'ETH', color: '#627eea' },
  { symbol: 'BNBUSDT', name: 'BNB', color: '#f3ba2f' },
  { symbol: 'SOLUSDT', name: 'SOL', color: '#9945FF' },
  { symbol: 'XRPUSDT', name: 'XRP', color: '#00AAE4' },
  { symbol: 'ADAUSDT', name: 'ADA', color: '#0033AD' },
  { symbol: 'AVAXUSDT', name: 'AVAX', color: '#E84142' },
  { symbol: 'DOTUSDT', name: 'DOT', color: '#e6007a' },
  { symbol: 'LINKUSDT', name: 'LINK', color: '#2a5ada' },
  { symbol: 'DOGEUSDT', name: 'DOGE', color: '#C2A633' },
];

const TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1d'];

export default function Home() {
  const [activeSymbol, setActiveSymbol] = useState(SYMBOLS[0]);
  const [activeTimeframe, setActiveTimeframe] = useState('4h');
  const [timeframeMenuOpen, setTimeframeMenuOpen] = useState(false);
  const [candles, setCandles] = useState<CandleData[]>([]);
  const [signal, setSignal] = useState<SignalData | null>(null);
  const [news, setNews] = useState<any[]>([]);
  const [coinSummary, setCoinSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tickerData, setTickerData] = useState<any>(null);
  const [backendUp, setBackendUp] = useState(false);

  // Check backend health once
  useEffect(() => {
    checkBackendHealth().then(setBackendUp);
    window.scrollTo(0, 0);
  }, []);

  // Load candle data directly from Binance (always works)
  const loadCandles = useCallback(async () => {
    try {
      const data = await fetchBinanceCandles(activeSymbol.symbol, activeTimeframe, 500);
      setCandles(data);
    } catch (err) {
      console.error('Failed to fetch candles from Binance:', err);
    }
  }, [activeSymbol, activeTimeframe]);

  // Load ticker data from Binance (live price & 24h change)
  const loadTicker = useCallback(async () => {
    try {
      const data = await fetchBinanceTicker(activeSymbol.symbol);
      setTickerData(data);
    } catch (err) {
      console.error('Failed to fetch ticker:', err);
    }
  }, [activeSymbol]);

  // Load backend data (signals, news, AI summaries) — only if backend is up
  const loadBackendData = useCallback(async () => {
    if (!backendUp) return;
    try {
      const [signalData, newsData, summaryData] = await Promise.all([
        fetchSignal(activeSymbol.symbol).catch(() => null),
        fetchNews(30).catch(() => []),
        fetchCoinNewsSummary(activeSymbol.symbol).catch(() => null),
      ]);
      if (signalData) setSignal(signalData);
      if (newsData && newsData.length > 0) setNews(newsData);
      if (summaryData) setCoinSummary(summaryData);
    } catch (err) {
      console.log('Backend data fetch error:', err);
    }
  }, [activeSymbol, backendUp]);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadCandles(), loadTicker(), loadBackendData()]).finally(() =>
      setLoading(false)
    );
  }, [loadCandles, loadTicker, loadBackendData]);

  // Auto-refresh candles every 30s
  useEffect(() => {
    const interval = setInterval(() => {
      loadCandles();
      loadTicker();
    }, 30000);
    return () => clearInterval(interval);
  }, [loadCandles, loadTicker]);

  return (
    <AnimatedPage>
      {/* Visually hidden: the dashboard is stat-tile-dense with no room for a
          display title, but every page still needs exactly one h1 */}
      <h1 className="sr-only">Live Crypto Trading Dashboard</h1>
      <StatsRow
        tickerData={tickerData}
        signalData={signal}
        symbol={activeSymbol.name}
        backendUp={backendUp}
      />

      {/* Crypto Selector */}
      <motion.div
        className="crypto-selector"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.4 }}
      >
        {SYMBOLS.map((s, i) => (
          <motion.button
            key={s.symbol}
            className={`crypto-pill ${activeSymbol.symbol === s.symbol ? 'active' : ''}`}
            onClick={() => setActiveSymbol(s)}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + i * 0.04, type: 'spring', stiffness: 300, damping: 25 }}
          >
            <CircleDollarSign size={15} /> {s.name}
          </motion.button>
        ))}
      </motion.div>

      {/* Chart + News Feed Row */}
      <motion.div
        className="chart-news-row"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.5 }}
      >
        <div className="chart-panel">
          {loading && candles.length === 0 ? (
            <div className="skeleton skeleton-chart"></div>
          ) : (
            <>
              <div className="chart-header">
                <div className="chart-pair">
                  <div className="chart-pair-icon" style={{ background: `linear-gradient(135deg, ${activeSymbol.color}, ${activeSymbol.color}88)` }}>
                    <CircleDollarSign size={18} />
                  </div>
                  <div>
                    <div className="chart-pair-name">
                      {activeSymbol.symbol.replace('USDT', '/USDT')}
                      {tickerData && (
                        <span style={{ fontSize: 14, fontWeight: 600, marginLeft: 12, color: parseFloat(tickerData.priceChangePercent) >= 0 ? 'var(--signal-buy)' : 'var(--signal-sell)' }}>
                          ${parseFloat(tickerData.lastPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      )}
                    </div>
                    <div className="chart-pair-exchange">
                      <span className="live-dot"></span> Binance · {activeSymbol.name}
                      {tickerData && (
                        <span style={{ marginLeft: 8, color: parseFloat(tickerData.priceChangePercent) >= 0 ? 'var(--signal-buy)' : 'var(--signal-sell)', fontWeight: 600 }}>
                          {parseFloat(tickerData.priceChangePercent) >= 0 ? '+' : ''}{parseFloat(tickerData.priceChangePercent).toFixed(2)}%
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="chart-timeframes-container">
                  <button className="timeframe-mobile-toggle" onClick={() => setTimeframeMenuOpen(!timeframeMenuOpen)}>
                    {activeTimeframe.toUpperCase()} <ChevronDown size={14} />
                  </button>
                  <div className={`chart-timeframes ${timeframeMenuOpen ? 'open' : ''}`}>
                    {TIMEFRAMES.map(tf => (
                      <button 
                        key={tf} 
                        className={activeTimeframe === tf ? 'active' : ''} 
                        onClick={() => { setActiveTimeframe(tf); setTimeframeMenuOpen(false); }}
                      >
                        {tf.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <CandlestickChart candles={candles} />
            </>
          )}
        </div>

        <NewsFeed
          news={news}
          loading={loading && news.length === 0}
          coinSummary={coinSummary}
          coinName={activeSymbol.name}
        />
      </motion.div>

      {/* Agent Dashboard */}
      {backendUp && (
        loading && !signal ? (
          <div className="agent-dashboard">
            <div className="card skeleton skeleton-chart" style={{ height: 300 }}></div>
            <div className="card skeleton skeleton-chart" style={{ height: 300 }}></div>
          </div>
        ) : (
          <AgentDashboard data={signal} symbol={activeSymbol.name} />
        )
      )}

      {/* Crypto Intelligence Chat */}
      {backendUp && <CryptoChat />}

      {!backendUp && (
        <motion.div
          className="card"
          style={{ textAlign: 'center', padding: 40, marginTop: 20, color: 'var(--text-muted)' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, color: 'var(--text-secondary)' }}>
            Analysis Systems Offline
          </div>
          <div style={{ fontSize: 13 }}>
            AI Signals, News Feed, and Intelligence Chat are currently unavailable.
            <br />
            Please ensure the QuantAura API services are active to enable these features.
          </div>
          <div style={{ fontSize: 12, marginTop: 12, color: 'var(--text-muted)' }}>
            Charts and market data are fetched directly from Binance and work without the backend.
          </div>
        </motion.div>
      )}
    </AnimatedPage>
  );
}
