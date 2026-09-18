'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { motion } from 'motion/react';
import { sendCryptoChatMessage } from '@/lib/api';
import { MessageSquare, Send, Sparkles, AlertCircle, RotateCcw } from 'lucide-react';

const COINS = [
    { symbol: 'BTC', name: 'Bitcoin' },
    { symbol: 'ETH', name: 'Ethereum' },
    { symbol: 'BNB', name: 'Binance Coin' },
    { symbol: 'SOL', name: 'Solana' },
    { symbol: 'XRP', name: 'Ripple' },
    { symbol: 'ADA', name: 'Cardano' },
    { symbol: 'DOGE', name: 'Dogecoin' },
    { symbol: 'AVAX', name: 'Avalanche' },
    { symbol: 'DOT', name: 'Polkadot' },
    { symbol: 'LINK', name: 'Chainlink' },
];

// Replaces the old 1-10 MINUTE slider: a minute of 1m candles is noise, and
// says nothing useful about a model that forecasts 24 hours ahead.
const TIMEFRAMES = [
    { key: '1h', label: '1H' },
    { key: '4h', label: '4H' },
    { key: '24h', label: '24H' },
    { key: '7d', label: '7D' },
    { key: '30d', label: '30D' },
];

/** Questions that exercise what the assistant is actually good at. The old
 *  auto-filled prompt only ever asked about the last N minutes of price. */
const SUGGESTIONS = [
    { q: 'What is the current signal and how confident is the model?', label: 'Current signal' },
    { q: 'Summarise the recent price action and volatility.', label: 'Price action' },
    { q: 'How does the model make this prediction, and what does the signal actually mean?', label: 'How it works' },
    { q: 'How accurate has this model been, honestly?', label: 'Track record' },
];

type Msg = { role: 'user' | 'ai'; content: string };

/** Minimal inline markdown: **bold**, `code`, and paragraph breaks. The model
 *  is prompted to use these, and raw asterisks in the UI look broken. */
function renderRich(text: string) {
    return text.split(/\n{2,}/).map((para, pi) => (
        <p key={pi} style={{ margin: pi === 0 ? 0 : '10px 0 0' }}>
            {para.split('\n').map((line, li) => (
                <React.Fragment key={li}>
                    {li > 0 && <br />}
                    {line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
                        if (part.startsWith('**') && part.endsWith('**')) {
                            return <strong key={i}>{part.slice(2, -2)}</strong>;
                        }
                        if (part.startsWith('`') && part.endsWith('`')) {
                            return <code key={i} className="mono chat-code">{part.slice(1, -1)}</code>;
                        }
                        return part;
                    })}
                </React.Fragment>
            ))}
        </p>
    ));
}

export default function CryptoChat() {
    const [selectedCoin, setSelectedCoin] = useState('BTC');
    const [timeframe, setTimeframe] = useState('24h');
    const [question, setQuestion] = useState('');
    const [messages, setMessages] = useState<Msg[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [errorAction, setErrorAction] = useState<'login' | 'upgrade' | null>(null);
    const [quota, setQuota] = useState<{ limit: number | null; remaining: number | null } | null>(null);
    const [lastContext, setLastContext] = useState<{ signal: string | null; confidence: number | null } | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (messages.length > 0 || loading) {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }, [messages, loading]);

    const ask = async (text: string) => {
        const userText = text.trim();
        if (!userText || loading) return;

        setQuestion('');
        setError(null);
        setErrorAction(null);
        const history = messages.slice(-6);
        setMessages(prev => [...prev, { role: 'user', content: userText }]);
        setLoading(true);

        // If the user names a different coin mid-conversation, follow them
        let coinToSend = selectedCoin;
        const upper = userText.toUpperCase();
        for (const c of COINS) {
            if (upper.includes(c.symbol) || upper.includes(c.name.toUpperCase())) {
                coinToSend = c.symbol;
                setSelectedCoin(c.symbol);
                break;
            }
        }

        try {
            const reply = await sendCryptoChatMessage(coinToSend, timeframe, userText, history);
            setMessages(prev => [...prev, { role: 'ai', content: reply.text }]);
            if (reply.context) {
                setLastContext({ signal: reply.context.signal, confidence: reply.context.confidence });
            }
            if (reply.quota) setQuota(reply.quota);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to reach the intelligence agent.');
            const chatErr = err as { status?: number; upgradeRequired?: boolean };
            if (chatErr.status === 401) setErrorAction('login');
            else if (chatErr.upgradeRequired) setErrorAction('upgrade');
        } finally {
            setLoading(false);
        }
    };

    const sigClass = lastContext?.signal ? lastContext.signal.toLowerCase() : '';

    return (
        <motion.div
            className="card chat-container"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, type: 'spring', stiffness: 200, damping: 25 }}
        >
            <div className="chat-header section-header">
                <div className="chat-header-left">
                    <MessageSquare size={18} className="text-secondary" />
                    Market Intelligence Assistant
                </div>
                <div className="chat-header-right">
                    {lastContext?.signal && (
                        <span className={`signal-badge ${sigClass}`} title="Model signal used as context for this conversation">
                            {lastContext.signal} {lastContext.confidence != null && `· ${Math.round(lastContext.confidence)}%`}
                        </span>
                    )}
                    {messages.length > 0 && (
                        <button className="chat-reset-btn" onClick={() => { setMessages([]); setLastContext(null); setError(null); }}
                            aria-label="Clear conversation">
                            <RotateCcw size={13} /> Clear
                        </button>
                    )}
                </div>
            </div>

            <div className="chat-controls-bar">
                <select
                    className="chat-select"
                    value={selectedCoin}
                    onChange={e => setSelectedCoin(e.target.value)}
                    aria-label="Select asset"
                >
                    {COINS.map(c => <option key={c.symbol} value={c.symbol}>{c.symbol} — {c.name}</option>)}
                </select>
                <div className="chat-tf-group" role="group" aria-label="Analysis window">
                    {TIMEFRAMES.map(t => (
                        <button
                            key={t.key}
                            onClick={() => setTimeframe(t.key)}
                            className={`chat-tf-btn ${timeframe === t.key ? 'active' : ''}`}
                            aria-pressed={timeframe === t.key}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="chat-main-full">
                <div className="chat-messages">
                    {messages.length === 0 ? (
                        <div className="chat-empty">
                            <Sparkles size={28} style={{ opacity: 0.45 }} />
                            <div className="chat-empty-text">
                                Ask about <strong>{selectedCoin}</strong> — its price action, the model&apos;s
                                current signal, or how the predictions are made.
                            </div>
                            <div className="chat-suggestions">
                                {SUGGESTIONS.map(s => (
                                    <button key={s.label} className="chat-suggestion" onClick={() => ask(s.q)}>
                                        {s.label}
                                    </button>
                                ))}
                            </div>
                            <div className="chat-empty-sub">
                                Explains data and predictions — cannot give trading or investment advice.
                            </div>
                        </div>
                    ) : (
                        messages.map((m, i) => (
                            <motion.div
                                key={i}
                                className={`chat-message ${m.role}`}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ type: 'spring', stiffness: 300, damping: 28 }}
                            >
                                {m.role === 'ai' ? renderRich(m.content) : m.content}
                            </motion.div>
                        ))
                    )}
                    {loading && (
                        <motion.div className="chat-typing" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                            <div className="live-dot" style={{ position: 'static' }} />
                            <span className="chat-typing-text">Reading {selectedCoin} market data and model signal…</span>
                        </motion.div>
                    )}
                    {error && (
                        <div className="chat-error">
                            <AlertCircle size={14} /> {error}
                            {errorAction === 'login' && (
                                <Link href="/login" className="chat-error-link">Sign in →</Link>
                            )}
                            {errorAction === 'upgrade' && (
                                <Link href="/pricing" className="chat-error-link">Upgrade to Premium →</Link>
                            )}
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {quota && quota.remaining !== null && (
                    <div className="chat-quota-note">
                        <Sparkles size={11} /> {quota.remaining} of {quota.limit} free messages left today ·{' '}
                        <Link href="/pricing">go unlimited</Link>
                    </div>
                )}

                <form onSubmit={e => { e.preventDefault(); ask(question); }} className="chat-form">
                    <input
                        ref={inputRef}
                        type="text"
                        placeholder={`Ask about ${selectedCoin}…`}
                        value={question}
                        onChange={e => setQuestion(e.target.value)}
                        disabled={loading}
                        className="chat-input"
                        aria-label="Your question"
                    />
                    <button
                        type="submit"
                        disabled={!question.trim() || loading}
                        className={`chat-send-btn ${question.trim() && !loading ? 'active' : 'disabled'}`}
                        aria-label="Send message"
                    >
                        <Send size={16} />
                    </button>
                </form>
            </div>
        </motion.div>
    );
}
