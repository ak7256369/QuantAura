'use client';

import React from 'react';
import { motion } from 'motion/react';
import { Cpu, Layers, Globe, BrainCircuit, Sparkles } from 'lucide-react';
import StaggerContainer, { staggerItem } from '../Motion/StaggerContainer';

interface SignalData {
    symbol: string;
    signal: string;
    confidence: number;
    ensemble: {
        lstm: { signal: string; confidence: number };
        xgboost: { signal: string; confidence: number };
        transformer: { signal: string; confidence: number };
        kan?: { signal: string; confidence: number };
    };
    indicators: Record<string, { value: string; status: string; note: string }>;
    macro: Record<string, { value: string; change: string; direction: string }>;
    explanation: string;
}

interface Props {
    data: SignalData | null;
    symbol: string;
}

export default function AgentDashboard({ data, symbol }: Props) {
    if (!data) return null;

    const sigClass = data.signal.toLowerCase();

    return (
        <StaggerContainer className="agent-dashboard">
            {/* Signal Card */}
            <motion.div className="card" variants={staggerItem} whileHover={{ y: -3 }}>
                <div className="section-header">
                    <Cpu size={18} className="text-secondary" />
                    AI Agent Signal — {symbol}/USDT
                </div>
                <div className={`signal-hero ${sigClass}`}>
                    <div>
                        <div className="signal-hero-label">24h Trend Outlook</div>
                        <div className={`signal-hero-signal ${sigClass}`}>
                            <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: '50%', background: 'currentColor', display: 'inline-block' }}></span>
                            {data.signal}
                        </div>
                    </div>
                    <div className="signal-hero-conf">
                        <div className="signal-hero-label">Confidence</div>
                        <div className="signal-hero-conf-value">{data.confidence}%</div>
                    </div>
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '-6px 0 16px', lineHeight: 1.5 }}>
                    Where the 4-model ensemble expects {symbol}&apos;s trend regime to be 24 hours from now —
                    uptrend (BUY), neutral (HOLD) or downtrend (SELL).
                </div>
                <div style={{ marginBottom: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        <span>Ensemble Confidence</span>
                        <span className="mono">{data.confidence}%</span>
                    </div>
                    <div className="confidence-bar" role="progressbar" aria-label="Ensemble confidence" aria-valuenow={data.confidence} aria-valuemin={0} aria-valuemax={100}>
                        <motion.div
                            className={`confidence-fill ${sigClass}`}
                            initial={{ width: 0 }}
                            animate={{ width: `${data.confidence}%` }}
                            transition={{ type: 'spring', stiffness: 60, damping: 15, delay: 0.3 }}
                        />
                    </div>
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
                    MODEL BREAKDOWN
                </div>
                <div className="ensemble-models">
                    {[
                        { name: 'LSTM', ...data.ensemble.lstm },
                        { name: 'XGBoost', ...data.ensemble.xgboost },
                        { name: 'Transformer', ...data.ensemble.transformer },
                        ...(data.ensemble.kan ? [{ name: 'KAN', ...data.ensemble.kan }] : []),
                    ].map((m, i) => (
                        <motion.div
                            key={m.name}
                            className="ensemble-model"
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: 0.4 + i * 0.1, type: 'spring', stiffness: 300, damping: 25 }}
                            whileHover={{ y: -2 }}
                        >
                            <div className="ensemble-model-name">{m.name === 'Transformer' ? 'TRANS.' : m.name}</div>
                            <div className={`ensemble-model-signal text-${m.signal.toLowerCase()}`}>{m.signal}</div>
                            <div className="ensemble-model-conf">{m.confidence}%</div>
                        </motion.div>
                    ))}
                </div>
            </motion.div>

            {/* Technical Indicators */}
            <motion.div className="card" variants={staggerItem} whileHover={{ y: -3 }}>
                <div className="section-header">
                    <Layers size={18} className="text-secondary" />
                    Agent Inputs — Technical Indicators
                </div>
                <div className="indicators-grid">
                    {Object.entries(data.indicators).map(([name, ind], i) => (
                        <motion.div
                            key={name}
                            className="indicator-item"
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.2 + i * 0.05, type: 'spring', stiffness: 300, damping: 25 }}
                        >
                            <div>
                                <div className="indicator-name">{name}</div>
                                <div className="text-muted" style={{ fontSize: 11 }}>{ind.note}</div>
                            </div>
                            <div className={`indicator-value ${ind.status}`}>{ind.value}</div>
                        </motion.div>
                    ))}
                </div>
            </motion.div>

            {/* Macro Context */}
            <motion.div className="card" variants={staggerItem} whileHover={{ y: -3 }}>
                <div className="section-header">
                    <Globe size={18} className="text-secondary" />
                    Macroeconomic Context
                </div>
                <div className="indicators-grid">
                    {Object.entries(data.macro).map(([name, m], i) => (
                        <motion.div
                            key={name}
                            className="indicator-item"
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.2 + i * 0.05, type: 'spring', stiffness: 300, damping: 25 }}
                        >
                            <div>
                                <div className="indicator-name">{name}</div>
                                <div className="mono" style={{ fontSize: 13 }}>{m.value}</div>
                            </div>
                            <div className={`indicator-value ${m.direction === 'positive' ? 'bullish' : 'bearish'}`}>
                                {m.change}
                            </div>
                        </motion.div>
                    ))}
                </div>
            </motion.div>

            {/* AI Explanation */}
            <motion.div className="card explanation-card" variants={staggerItem}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, paddingTop: 8 }}>
                    <div className="section-header" style={{ marginBottom: 0 }}>
                        <BrainCircuit size={18} className="text-secondary" />
                        AI Analysis — {symbol}/USDT
                    </div>
                    <span className="explanation-model-tag"><Sparkles size={12} /> AI Core</span>
                </div>
                <motion.div
                    className="explanation-text"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5, duration: 0.6 }}
                >
                    {data.explanation}
                </motion.div>
            </motion.div>
        </StaggerContainer>
    );
}
