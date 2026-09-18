import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';

/**
 * Site-wide disclaimer. QuantAura sells access to model outputs, so the
 * wording must be explicit that a paid subscription buys research data —
 * not advice, not performance, not a refundable promise of profit. Every
 * page that shows signals or simulated performance carries this notice.
 */
export default function Disclaimer() {
    return (
        <div
            style={{
                display: 'flex',
                gap: 10,
                alignItems: 'flex-start',
                margin: '28px auto 8px',
                padding: '14px 18px',
                maxWidth: 1600,
                borderRadius: 12,
                border: '1px solid var(--border-subtle)',
                background: 'var(--bg-card)',
                color: 'var(--text-muted)',
                fontSize: 11.5,
                lineHeight: 1.6,
            }}
        >
            <ShieldAlert size={14} style={{ flexShrink: 0, marginTop: 2 }} aria-hidden="true" />
            <p style={{ margin: 0 }}>
                <strong style={{ color: 'var(--text-secondary)' }}>Disclaimer.</strong>{' '}
                Signals, confidence scores and backtests are statistical outputs of machine-learning
                models predicting 24-hour trend regimes. They are research data provided for information
                and education, and are <strong>not financial, investment or trading advice</strong> — a
                Premium subscription buys access to the full model output, not a recommendation to trade
                on it and no promise of profit. Our own published measurements show these signals have
                historically not been profitable to trade after fees. Cryptocurrency trading involves
                substantial risk of loss; past or simulated performance does not guarantee future
                results. Always do your own research before making financial decisions.{' '}
                <Link href="/privacy" style={{ color: 'var(--text-secondary)' }}>Privacy Policy</Link>
                {' · '}
                <Link href="/terms" style={{ color: 'var(--text-secondary)' }}>Terms of Service</Link>
            </p>
        </div>
    );
}
