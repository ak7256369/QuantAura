'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { CircleDollarSign, RefreshCw } from 'lucide-react';
import AnimatedPage from '@/components/Motion/AnimatedPage';
import StaggerContainer, { staggerItem } from '@/components/Motion/StaggerContainer';
import { fetchBinanceMiniTickers, fetchBinanceCandles } from '@/lib/api';

const SYMBOL_META: Record<string, { name: string; color: string }> = {
    BTCUSDT: { name: 'Bitcoin', color: '#f7931a' },
    ETHUSDT: { name: 'Ethereum', color: '#627eea' },
    BNBUSDT: { name: 'BNB', color: '#f3ba2f' },
    SOLUSDT: { name: 'Solana', color: '#9945FF' },
    XRPUSDT: { name: 'Ripple', color: '#00AAE4' },
    ADAUSDT: { name: 'Cardano', color: '#0033AD' },
    AVAXUSDT: { name: 'Avalanche', color: '#E84142' },
    DOTUSDT: { name: 'Polkadot', color: '#e6007a' },
    LINKUSDT: { name: 'Chainlink', color: '#2a5ada' },
    DOGEUSDT: { name: 'Dogecoin', color: '#C2A633' },
};

interface MarketData {
    symbol: string;
    price: number;
    change: number;
    high24h: number;
    low24h: number;
    volume24h: number;
    quoteVolume24h: number;
    sparkline: number[];
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
    if (!data || data.length < 2) return null;
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const polyline = data.map((p, i) => `${(i / (data.length - 1)) * 95},${100 - ((p - min) / range) * 90}`).join(' ');
    return (
        <svg viewBox="0 0 95 100" style={{ width: '100%', height: 40, marginBottom: 8 }} preserveAspectRatio="none">
            <polyline points={polyline} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
        </svg>
    );
}

export default function MarketsPage() {
    const [markets, setMarkets] = useState<MarketData[]>([]);
    const [loading, setLoading] = useState(true);
    const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

    const loadMarkets = async () => {
        setLoading(true);
        try {
            const tickers = await fetchBinanceMiniTickers();

            // Fetch sparkline data (last 24 candles of 1h) for each symbol
            const withSparklines = await Promise.all(
                tickers.map(async (t: any) => {
                    let sparkline: number[] = [];
                    try {
                        const candles = await fetchBinanceCandles(t.symbol, '1h', 24);
                        sparkline = candles.map((c: any) => c.close);
                    } catch { }
                    return { ...t, sparkline };
                })
            );

            setMarkets(withSparklines);
            setLastUpdate(new Date());
        } catch (err) {
            console.error('Failed to fetch market data:', err);
        }
        setLoading(false);
    };

    useEffect(() => {
        loadMarkets();
        const interval = setInterval(loadMarkets, 30000); // Refresh every 30s
        return () => clearInterval(interval);
    }, []);

    return (
        <AnimatedPage>
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <h1>Market Overview</h1>
                    <p>Real-time prices from Binance · Auto-refreshes every 30s</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    {lastUpdate && (
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            Updated {lastUpdate.toLocaleTimeString()}
                        </span>
                    )}
                    <motion.button
                        onClick={loadMarkets}
                        style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600 }}
                        whileHover={{ scale: 1.04 }}
                        whileTap={{ scale: 0.96 }}
                        disabled={loading}
                    >
                        <RefreshCw size={14} className={loading ? 'spinning' : ''} /> Refresh
                    </motion.button>
                </div>
            </div>
            {loading && markets.length === 0 ? (
                <div className="markets-grid">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(i => (
                        <div key={i} className="card skeleton" style={{ height: 180 }}></div>
                    ))}
                </div>
            ) : (
                <StaggerContainer className="markets-grid">
                    {markets.map((m) => {
                        const meta = SYMBOL_META[m.symbol] || { name: m.symbol, color: '#64748b' };
                        const shortSymbol = m.symbol.replace('USDT', '');
                        return (
                            <motion.div
                                key={m.symbol}
                                className="card market-card"
                                variants={staggerItem}
                                whileHover={{
                                    y: -5,
                                    transition: { type: 'spring', stiffness: 400, damping: 25 },
                                }}
                            >
                                <div className="market-card-header">
                                    <div className="market-card-info">
                                        <div className="market-card-icon" style={{ background: `linear-gradient(135deg, ${meta.color}, ${meta.color}88)` }}>
                                            <CircleDollarSign size={20} />
                                        </div>
                                        <div className="market-card-name">{meta.name}</div>
                                    </div>
                                    <span className={`signal-badge ${m.change >= 0 ? 'buy' : 'sell'} market-card-change`}>
                                        {m.change >= 0 ? '+' : ''}{m.change.toFixed(2)}%
                                    </span>
                                </div>

                                <Sparkline data={m.sparkline} color={meta.color} />

                                <div className="market-card-price mono">
                                    ${m.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </div>
                                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                                    {shortSymbol}/USDT · Binance
                                </div>
                            </motion.div>
                        );
                    })}
                </StaggerContainer>
            )}
        </AnimatedPage>
    );
}
