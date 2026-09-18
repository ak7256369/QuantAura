'use client';

import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Play, TrendingUp, Loader2, Activity, AlertTriangle } from 'lucide-react';
import dynamic from 'next/dynamic';

// Loaded on demand — keeps ~336 KB of recharts out of this route's first-load
// JS; the chart only exists after a backtest run anyway. Container is
// height-fixed (300px) so the late mount cannot shift layout.
const EquityChart = dynamic(() => import('@/components/Chart/charts').then(m => m.EquityChart), { ssr: false });
import AnimatedPage from '@/components/Motion/AnimatedPage';
import StaggerContainer, { staggerItem } from '@/components/Motion/StaggerContainer';
import CoinSelector from '@/components/UI/CoinSelector';
import TimeSelector from '@/components/UI/TimeSelector';
import { PremiumPageGate } from '@/components/UI/PremiumGate';
import { runBacktest } from '@/lib/api';

interface BacktestResults {
    metrics: {
        netProfit: number;
        netProfitPercent: number;
        buyHoldReturnPercent?: number;
        winRate: number;
        profitFactor: number;
        maxDrawdown: number;
        sharpeRatio: number;
        totalTrades: number;
        feesPaid?: number;
        timeInMarketPercent?: number;
    };
    assumptions?: {
        initialCapital: number;
        feePercentPerSide: number;
        slippagePercentPerSide: number;
        positionFractionPercent: number;
        entryConfidenceGate: number;
    };
    chart: any[];
    trades: any[];
}

export default function BacktestPage() {
    const [results, setResults] = useState<BacktestResults | null>(null);
    const [running, setRunning] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [config, setConfig] = useState({
        asset: 'BTCUSDT',
        dateRange: 'Last 30 Days',
    });

    const handleRunBacktest = async (e: React.FormEvent) => {
        e.preventDefault();
        setRunning(true);
        setResults(null);
        setError(null);

        try {
            const days = config.dateRange === 'Last 30 Days' ? 30 : config.dateRange === 'Last 90 Days' ? 90 : config.dateRange === 'Last 6 Months' ? 180 : 365;
            const backtestResults = await runBacktest(config.asset, days);
            setResults(backtestResults);
        } catch (err: any) {
            console.error('Backtest error:', err);
            setError(err.message || 'Failed to run backtest. Ensure ML server is running.');
        } finally {
            setRunning(false);
        }
    };

    return (
        <AnimatedPage>
            <div className="page-header">
                <h1>Intelligence Engine Backtest</h1>
                <p>Simulate the AI Ensemble's historical performance on live market data.</p>
            </div>

            <PremiumPageGate
                title="Backtesting is a Premium feature"
                description="Run the ensemble's signals through historical data with realistic fees and slippage — equity curve, win rate, drawdown, Sharpe and the full trade log.">
            <div className={`backtest-grid ${results ? 'with-results' : ''}`}>
                {/* Config Form */}
                <motion.div
                    className="card"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ type: 'spring', stiffness: 200, damping: 25 }}
                >
                    <form onSubmit={handleRunBacktest}>
                        <div className="backtest-field">
                            <label className="backtest-label">Asset</label>
                            <CoinSelector
                                value={config.asset.replace('USDT', '')}
                                onChange={sym => setConfig({ ...config, asset: sym + 'USDT' })}
                            />
                        </div>
                        <div className="backtest-field">
                            <label className="backtest-label">Date Range</label>
                            <TimeSelector
                                type="backtest"
                                value={config.dateRange}
                                onChange={val => setConfig({ ...config, dateRange: String(val) })}
                            />
                        </div>
                        <div className="backtest-field">
                            <label className="backtest-label">Initial Capital</label>
                            <div className="backtest-input" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'default' }}>
                                <span className="mono">$10,000</span>
                                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.6, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Fixed</span>
                            </div>
                        </div>
                        <motion.button
                            type="submit"
                            className="backtest-submit"
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            disabled={running}
                        >
                            {running ? <Loader2 size={18} className="spinning" /> : <Play size={18} fill="currentColor" />}
                            {running ? 'Running Simulation...' : 'Run Backtest'}
                        </motion.button>
                        
                        {error && (
                            <div className="backtest-error-box">
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, marginBottom: 6, fontSize: 13 }}>
                                    <AlertTriangle size={14} /> Backtest Failed
                                </div>
                                <div style={{ fontSize: 12, lineHeight: 1.5, opacity: 0.85 }}>{error}</div>
                                <div style={{ fontSize: 11, marginTop: 8, opacity: 0.6 }}>
                                    Ensure the backend API and the ML server are running with trained models loaded.
                                </div>
                            </div>
                        )}
                    </form>
                </motion.div>

                {/* Results Section */}
                {results && (
                    <motion.div
                        initial={{ opacity: 0, x: 30 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ type: 'spring', stiffness: 200, damping: 25 }}
                    >
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
                            Period: {config.dateRange} · {config.asset.replace('USDT', '/USDT')} · Initial Balance: $10,000
                        </div>
                        <StaggerContainer className="backtest-results-grid">
                            {[
                                { label: 'Net Profit', value: `${results.metrics.netProfitPercent >= 0 ? '+' : ''}${results.metrics.netProfitPercent.toFixed(1)}%`, positive: results.metrics.netProfitPercent >= 0 },
                                ...(results.metrics.buyHoldReturnPercent != null ? [{
                                    label: 'Buy & Hold',
                                    value: `${results.metrics.buyHoldReturnPercent >= 0 ? '+' : ''}${results.metrics.buyHoldReturnPercent.toFixed(1)}%`,
                                    positive: results.metrics.netProfitPercent >= results.metrics.buyHoldReturnPercent,
                                }] : []),
                                { label: 'Win Rate', value: `${results.metrics.winRate.toFixed(1)}%`, positive: results.metrics.winRate > 50 },
                                { label: 'Sharpe Ratio', value: results.metrics.sharpeRatio.toFixed(2), positive: results.metrics.sharpeRatio > 1 },
                                { label: 'Profit Factor', value: results.metrics.profitFactor.toFixed(2), positive: results.metrics.profitFactor > 1 },
                                { label: 'Max Drawdown', value: `${results.metrics.maxDrawdown.toFixed(1)}%`, positive: false },
                                { label: 'Total Trades', value: results.metrics.totalTrades, positive: true },
                                ...(results.metrics.feesPaid != null ? [{
                                    label: 'Fees Paid', value: `$${results.metrics.feesPaid.toLocaleString()}`, positive: false,
                                }] : []),
                                ...(results.metrics.timeInMarketPercent != null ? [{
                                    label: 'Time in Market', value: `${results.metrics.timeInMarketPercent.toFixed(0)}%`, positive: true,
                                }] : []),
                            ].map((m) => (
                                <motion.div
                                    key={m.label}
                                    className="card backtest-metric"
                                    variants={staggerItem}
                                    whileHover={{ y: -3 }}
                                >
                                    <div className="backtest-metric-label">{m.label}</div>
                                    <div className={`backtest-metric-value mono ${m.positive ? 'positive' : 'negative'}`}>{m.value}</div>
                                </motion.div>
                            ))}
                        </StaggerContainer>

                        <motion.div
                            className="card"
                            style={{ marginTop: 'var(--gap)' }}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.4, type: 'spring', stiffness: 200, damping: 25 }}
                        >
                            <div className="section-header">
                                <TrendingUp size={18} className="text-secondary" />
                                Equity Curve — Strategy vs Buy &amp; Hold
                            </div>
                            <div style={{ width: '100%', height: 300, marginTop: 20 }}>
                                <EquityChart data={results.chart} />
                            </div>
                            {results.assumptions && (
                                <p style={{ fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.6, marginTop: 12 }}>
                                    Execution model: {results.assumptions.feePercentPerSide.toFixed(2)}% taker fee +{' '}
                                    {results.assumptions.slippagePercentPerSide.toFixed(2)}% slippage per side ·{' '}
                                    {results.assumptions.positionFractionPercent.toFixed(0)}% of equity per position ·
                                    entries only on gated signals ≥ {results.assumptions.entryConfidenceGate.toFixed(0)}% confidence ·
                                    ${results.assumptions.initialCapital.toLocaleString()} initial capital.
                                    Educational simulation on historical data — not financial advice.
                                </p>
                            )}
                        </motion.div>
                        
                        <motion.div
                            className="card"
                            style={{ marginTop: 'var(--gap)' }}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.5, type: 'spring', stiffness: 200, damping: 25 }}
                        >
                            <div className="section-header">
                                <Activity size={18} className="text-secondary" />
                                Trade History
                            </div>
                            <div className="signals-table-container" style={{ maxHeight: 400, overflowY: 'auto' }}>
                                <table className="signals-table">
                                    <thead>
                                        <tr>
                                            <th>Date</th>
                                            <th>Type</th>
                                            <th>Price</th>
                                            <th>Profit</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {results.trades.length === 0 && (
                                            <tr><td colSpan={4} style={{ textAlign: 'center' }}>No trades executed during this period.</td></tr>
                                        )}
                                        {results.trades.map((trade, i) => (
                                            <tr key={i}>
                                                <td className="mono" style={{ fontSize: 12 }}>{trade.date}</td>
                                                <td>
                                                    <span className={`signal-badge ${trade.type === 'BUY' ? 'buy' : 'sell'}`}>
                                                        {trade.type}
                                                    </span>
                                                </td>
                                                <td className="mono">${trade.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                                <td className="mono" style={{ color: trade.profitPercent >= 0 ? 'var(--signal-buy)' : 'var(--signal-sell)' }}>
                                                    {trade.profitPercent !== 0 ? `${trade.profitPercent > 0 ? '+' : ''}${trade.profitPercent.toFixed(2)}%` : '-'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </motion.div>

                    </motion.div>
                )}
            </div>
            </PremiumPageGate>
        </AnimatedPage>
    );
}
