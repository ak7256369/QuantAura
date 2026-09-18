'use client';

import React from 'react';
import { motion } from 'motion/react';
import { Wallet, TrendingUp, TrendingDown, Zap, Activity, ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import StaggerContainer, { staggerItem } from '../Motion/StaggerContainer';

interface Props {
    tickerData: any;
    signalData: any;
    symbol: string;
    backendUp: boolean;
}

export default function StatsRow({ tickerData, signalData, symbol, backendUp }: Props) {
    // Compute real values from ticker + signal data
    const price = tickerData ? parseFloat(tickerData.lastPrice) : 0;
    const changePercent = tickerData ? parseFloat(tickerData.priceChangePercent) : 0;
    const priceChange = tickerData ? parseFloat(tickerData.priceChange) : 0;
    const volume24h = tickerData ? parseFloat(tickerData.quoteVolume) : 0;
    const high24h = tickerData ? parseFloat(tickerData.highPrice) : 0;
    const low24h = tickerData ? parseFloat(tickerData.lowPrice) : 0;

    const signalText = signalData?.signal || '—';
    const signalConf = signalData?.confidence || 0;

    const formatVolume = (v: number) => {
        if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
        if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
        if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
        return `$${v.toFixed(2)}`;
    };

    const stats = [
        {
            label: `${symbol} Price`,
            value: price > 0 ? `$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : null,
            change: `${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}% (24h)`,
            positive: changePercent >= 0,
            neutral: false,
            Icon: changePercent >= 0 ? TrendingUp : TrendingDown,
            iconClass: changePercent >= 0 ? 'green' : 'red',
            iconColor: changePercent >= 0 ? 'var(--signal-buy)' : 'var(--signal-sell)',
        },
        {
            label: '24h Volume',
            value: volume24h > 0 ? formatVolume(volume24h) : null,
            change: `H: $${high24h.toLocaleString()} · L: $${low24h.toLocaleString()}`,
            positive: true,
            neutral: true,
            Icon: Wallet,
            iconClass: 'purple',
            iconColor: 'var(--accent-secondary)',
        },
        {
            label: 'AI Signal · 24h Outlook',
            value: backendUp && signalData ? `${signalText}` : 'Offline',
            change: backendUp && signalData ? `${signalConf}% confidence · 4-model ensemble` : 'Start backend for signals',
            positive: signalText === 'BUY',
            neutral: signalText === 'HOLD' || !signalData,
            Icon: Zap,
            iconClass: signalText === 'BUY' ? 'green' : signalText === 'SELL' ? 'amber' : 'blue',
            iconColor: signalText === 'BUY' ? 'var(--signal-buy)' : signalText === 'SELL' ? 'var(--signal-sell)' : 'var(--signal-hold)',
        },
        {
            label: '24h Price Change',
            value: priceChange !== 0 ? `${priceChange >= 0 ? '+' : ''}$${Math.abs(priceChange).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : null,
            change: `${symbol}/USDT · Binance`,
            positive: priceChange >= 0,
            neutral: false,
            Icon: Activity,
            iconClass: 'blue',
            iconColor: 'var(--accent-primary)',
        },
    ];

    return (
        <StaggerContainer className="stats-row">
            {stats.map((s) => (
                <motion.div
                    key={s.label}
                    className="stat-card"
                    variants={staggerItem}
                    whileHover={{
                        y: -3,
                        transition: { type: 'spring', stiffness: 400, damping: 25 },
                    }}
                >
                    <div className="stat-card-header">
                        <span className="stat-card-label">{s.label}</span>
                        <div className={`stat-card-icon ${s.iconClass}`}>
                            <s.Icon size={20} color={s.iconColor} />
                        </div>
                    </div>
                    <div className="stat-card-value">
                        {s.value ?? <span className="stat-card-skeleton" aria-label="loading" />}
                    </div>
                    <div className={`stat-card-change ${s.neutral ? 'neutral' : s.positive ? 'positive' : 'negative'}`}>
                        {s.neutral
                            ? <Minus size={14} style={{ marginRight: 2 }} />
                            : s.positive
                                ? <ArrowUpRight size={14} style={{ marginRight: 2 }} />
                                : <ArrowDownRight size={14} style={{ marginRight: 2 }} />}
                        {s.change}
                    </div>
                </motion.div>
            ))}
        </StaggerContainer>
    );
}
