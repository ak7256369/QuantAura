'use client';

/**
 * SignalRealityCheck — the metric most platforms omit.
 *
 * The headline "80.99% F1" measures classifying a lagging EMA12−EMA26 trend
 * regime 24h ahead, roughly 71% of which is pure persistence. Read as a win
 * rate it overstates real performance by ~28 points. This panel puts the
 * regime score next to the two numbers a trade actually depends on —
 * directional accuracy and after-cost expectancy — so the strong number can
 * never be read alone.
 */

import { motion } from 'motion/react';
import { ShieldCheck, TrendingUp, TrendingDown, Minus, Info } from 'lucide-react';
import type { Tradeability } from '@/lib/api';

const pct = (v: number, digits = 2) => `${(v * 100).toFixed(digits)}%`;

function Metric({ label, value, tone, sub }: {
  label: string; value: string; tone: 'good' | 'neutral' | 'warn'; sub: string;
}) {
  const color =
    tone === 'good' ? 'var(--signal-buy)'
      : tone === 'warn' ? 'var(--signal-sell)'
        : 'var(--text-primary)';
  return (
    <div className="reality-metric">
      <div className="reality-metric-label">{label}</div>
      <div className="reality-metric-value mono" style={{ color }}>{value}</div>
      <div className="reality-metric-sub">{sub}</div>
    </div>
  );
}

export default function SignalRealityCheck({ data }: { data: Tradeability }) {
  const cost = data.round_trip_cost;
  const rows = (['BUY', 'HOLD', 'SELL'] as const)
    .filter(k => data.by_signal?.[k])
    .map(k => {
      const s = data.by_signal[k];
      // A long pays the round trip; SELL is only actionable by shorting, which
      // pays it too. HOLD is not a position, so net expectancy is undefined.
      const net = k === 'BUY' ? s.mean_fwd_return - cost
        : k === 'SELL' ? -s.mean_fwd_return - cost
          : null;
      return { signal: k, ...s, net };
    });

  // Directional accuracy is the honest headline: 0.50 is a coin flip.
  const edge = data.directional_accuracy - 0.5;

  return (
    <motion.section
      className="card reality-card"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 }}
      aria-labelledby="reality-heading"
    >
      <div className="section-header" id="reality-heading">
        <ShieldCheck size={18} className="text-secondary" />
        Signal Reality Check
      </div>
      <p className="reality-intro">
        Full disclosure of what our models can and cannot do, measured on{' '}
        {data.n.toLocaleString()} held-out predictions the models never trained on.
      </p>

      <div className="reality-metrics">
        <Metric
          label="Regime classification F1"
          value={pct(data.regime_macro_f1)}
          tone="neutral"
          sub="Accuracy at classifying the 24h trend regime — the headline metric"
        />
        <Metric
          label="Directional accuracy"
          value={pct(data.directional_accuracy)}
          tone={edge > 0.02 ? 'good' : 'warn'}
          sub={`How often an issued signal got price direction right (50% = coin flip, so the real edge is ${(edge * 100).toFixed(2)} pts)`}
        />
        <Metric
          label="Assumed trading cost"
          value={pct(cost, 2)}
          tone="neutral"
          sub="Round-trip fee + slippage subtracted from every expectancy below"
        />
      </div>

      <div className="reality-note">
        <Info size={14} style={{ flexShrink: 0, marginTop: 2 }} />
        <p>
          <strong>These two numbers measure different things.</strong> The regime
          score classifies a lagging trend state, and roughly 71% of that state
          simply persists from one day to the next — so it is much easier than
          calling price direction. Directional accuracy is the one that governs
          whether a trade makes money.
        </p>
      </div>

      <div className="reality-table-wrap">
        <table className="reality-table">
          <caption className="sr-only">
            Average forward 24-hour return by predicted signal, before and after trading costs
          </caption>
          <thead>
            <tr>
              <th scope="col">Signal</th>
              <th scope="col">Sample</th>
              <th scope="col">Avg 24h move</th>
              <th scope="col">Went up</th>
              <th scope="col">After costs</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const Icon = r.signal === 'BUY' ? TrendingUp : r.signal === 'SELL' ? TrendingDown : Minus;
              return (
                <tr key={r.signal}>
                  <th scope="row">
                    <span className={`signal-badge ${r.signal.toLowerCase()}`}>
                      <Icon size={11} /> {r.signal}
                    </span>
                  </th>
                  <td className="mono">{r.n.toLocaleString()}</td>
                  <td className="mono" style={{ color: r.mean_fwd_return >= 0 ? 'var(--signal-buy)' : 'var(--signal-sell)' }}>
                    {r.mean_fwd_return >= 0 ? '+' : ''}{pct(r.mean_fwd_return, 3)}
                  </td>
                  <td className="mono">{pct(r.p_up, 1)}</td>
                  <td className="mono" style={{
                    color: r.net === null ? 'var(--text-muted)'
                      : r.net >= 0 ? 'var(--signal-buy)' : 'var(--signal-sell)',
                    fontWeight: 700,
                  }}>
                    {r.net === null ? '—' : `${r.net >= 0 ? '+' : ''}${pct(r.net, 3)}`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="reality-verdict">
        <p>
          <strong>What this means in practice.</strong> After costs, the average
          BUY signal does not clear the fees required to act on it. The market
          itself drifted {pct(data.unconditional_mean_fwd_return, 3)} over this
          test window, so part of every column above is market direction rather
          than model skill. Treat these signals as one input into your own
          research — they are not a strategy, and they are not advice.
        </p>
      </div>
    </motion.section>
  );
}
