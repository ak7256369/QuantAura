'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Newspaper, TrendingUp, TrendingDown, Minus, Sparkles } from 'lucide-react';

interface NewsItem {
    _id?: string;
    title: string;
    url: string;
    source: string;
    publishedAt: string;
    sentiment: 'bullish' | 'bearish' | 'neutral';
    impact: 'high' | 'medium' | 'low';
    aiSummary?: string;
    keyFactors?: string[];
}

interface Props {
    news: NewsItem[];
    loading?: boolean;
    coinSummary?: string | null;
    coinName?: string;
}

function computeTimeAgo(dateStr: string) {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
}

function TimeAgo({ date }: { date: string }) {
    const [text, setText] = useState('');
    useEffect(() => {
        setText(computeTimeAgo(date));
        const interval = setInterval(() => setText(computeTimeAgo(date)), 60000);
        return () => clearInterval(interval);
    }, [date]);
    return <>{text}</>;
}

export default function NewsFeed({ news, loading, coinSummary, coinName }: Props) {
    return (
        <div className="news-panel">
            <div className="news-panel-header">
                <span className="live-dot"></span>
                <Newspaper size={17} style={{ marginRight: 4 }} />
                Live News Feed
            </div>

            {/* AI Summary Box */}
            <div className="news-summary-box">
                <div className="news-summary-header">
                    <div className="news-summary-label">
                        <Sparkles size={14} /> AI Summary — {coinName || 'Market'}
                    </div>
                    <span className="explanation-model-tag" style={{ padding: '2px 8px', fontSize: 10 }}>Intelligence Engine</span>
                </div>
                <div className="news-summary-text">
                    {loading && !coinSummary ? (
                        <div className="skeleton skeleton-text" style={{ width: '100%', height: '36px' }}></div>
                    ) : (
                        coinSummary || 'No recent news summary available.'
                    )}
                </div>
            </div>

            <div className="news-list">
                {loading ? (
                    <div style={{ padding: 8 }}>
                        {[1, 2, 3, 4, 5].map(i => (
                            <div key={i} className="news-card" style={{ marginBottom: 12 }}>
                                <div className="skeleton skeleton-text medium"></div>
                                <div className="skeleton skeleton-text short"></div>
                                <div className="skeleton skeleton-text" style={{ width: '30%', marginTop: 8 }}></div>
                            </div>
                        ))}
                    </div>
                ) : news.length === 0 ? (
                    <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
                        No news available. Start the backend server to fetch live news.
                    </div>
                ) : (
                    news.map((item, idx) => (
                        <motion.a
                            key={item._id || idx}
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ textDecoration: 'none', display: 'block' }}
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.06, type: 'spring', stiffness: 300, damping: 28 }}
                        >
                            <motion.div
                                className="news-card"
                                whileHover={{ x: 4, transition: { type: 'spring', stiffness: 400, damping: 25 } }}
                            >
                                <div className="news-card-header">
                                    <div className="news-card-title">{item.title}</div>
                                    <span className={`news-card-sentiment ${item.sentiment || 'neutral'}`}>
                                        {(item.sentiment || 'neutral') === 'bullish' ? <TrendingUp size={12} /> : (item.sentiment || 'neutral') === 'bearish' ? <TrendingDown size={12} /> : <Minus size={12} />}
                                        {item.sentiment || 'neutral'}
                                    </span>
                                </div>
                                {item.aiSummary && (
                                    <div className="news-card-summary">{item.aiSummary}</div>
                                )}
                                <div className="news-card-meta">
                                    <span>{item.source} · <TimeAgo date={item.publishedAt} /></span>
                                    <span className={`news-card-impact ${item.impact || 'medium'}`}>
                                        {(item.impact || 'medium').toUpperCase()} IMPACT
                                    </span>
                                </div>
                            </motion.div>
                        </motion.a>
                    ))
                )}
            </div>
        </div>
    );
}
