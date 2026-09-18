'use client';

import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { motion } from 'motion/react';
import {
  BookOpen, Activity, Radar, FlaskConical, AlertTriangle, ExternalLink,
  TrendingUp, Minus, TrendingDown, CheckCircle2, XCircle, Info,
} from 'lucide-react';
import AnimatedPage from '@/components/Motion/AnimatedPage';
import { PremiumGateCard } from '@/components/UI/PremiumGate';
import { fetchResearch, type ResearchResponse, type BiblioEntry } from '@/lib/api';

// Same lazy recharts chunk as every other page — see charts.tsx.
const ChartSkeleton = ({ h }: { h: number }) => <div style={{ height: h }} aria-hidden="true" />;
const LeadLagChart = dynamic(() => import('@/components/Chart/charts').then(m => m.LeadLagChart),
  { ssr: false, loading: () => <ChartSkeleton h={260} /> });
const CouplingChart = dynamic(() => import('@/components/Chart/charts').then(m => m.CouplingChart),
  { ssr: false, loading: () => <ChartSkeleton h={300} /> });
const PropagationChart = dynamic(() => import('@/components/Chart/charts').then(m => m.PropagationChart),
  { ssr: false, loading: () => <ChartSkeleton h={320} /> });
const SpilloverChart = dynamic(() => import('@/components/Chart/charts').then(m => m.SpilloverChart),
  { ssr: false, loading: () => <ChartSkeleton h={260} /> });

const QUESTION_LABELS: Record<string, string> = {
  Q1: 'Correlation', Q2: 'Lead–lag', Q3: 'Spillover',
  Q4: 'Asymmetry', Q5: 'Dominance cycles',
};

const REGIME_ICON: Record<string, React.ReactNode> = {
  uptrend: <TrendingUp size={12} />,
  neutral: <Minus size={12} />,
  downtrend: <TrendingDown size={12} />,
};

const pct = (v: number, d = 1) => `${(v * 100).toFixed(d)}%`;

function Section({ icon, title, sub, children }: {
  icon: React.ReactNode; title: string; sub?: string; children: React.ReactNode;
}) {
  return (
    <motion.section className="card research-section"
      initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}>
      <div className="section-header">{icon}{title}</div>
      {sub && <p className="research-sub">{sub}</p>}
      {children}
    </motion.section>
  );
}

function LiteratureCard({ e }: { e: BiblioEntry }) {
  return (
    <article className="lit-card">
      <div className="lit-tags">
        {e.questions.map(q => (
          <span key={q} className="lit-tag">{QUESTION_LABELS[q] ?? q}</span>
        ))}
        {e.citation_count && (
          <span className="lit-cites">{e.citation_count.n.toLocaleString()} citations</span>
        )}
      </div>
      <h3 className="lit-title">{e.title}</h3>
      <div className="lit-meta">{e.authors} · <em>{e.venue}</em> · {e.year}</div>
      <p className="lit-finding">{e.key_finding}</p>
      {e.method && <div className="lit-method"><strong>Method:</strong> {e.method}</div>}
      <a href={e.url} target="_blank" rel="noopener noreferrer" className="lit-link">
        View source <ExternalLink size={11} />
      </a>
    </article>
  );
}

export default function ResearchPage() {
  const [data, setData] = useState<ResearchResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('ALL');

  useEffect(() => {
    fetchResearch().then(r => { setData(r); setLoading(false); });
  }, []);

  const meas = data?.measurements;
  // The backend replaces predictions with { locked: true } for free viewers —
  // the forward-looking outputs are the paid product.
  const predsLocked = !!(data?.predictions as unknown as { locked?: boolean })?.locked;
  const preds = predsLocked ? null : data?.predictions;
  const fc = preds?.propagation_forecast;
  const entries = data?.bibliography?.entries ?? [];
  const shown = filter === 'ALL' ? entries : entries.filter(e => e.questions.includes(filter));

  // ── chart data ──
  const leadLagData = (() => {
    const per = meas?.lead_lag?.per_coin;
    if (!per) return [];
    const syms = Object.keys(per);
    const avg = (k: string) => syms.reduce((s, sym) => s + (per[sym].cross_correlation[k] ?? 0), 0) / syms.length;
    return [
      { horizon: 'Same hour', btcLeads: avg('contemporaneous'), altLeads: avg('contemporaneous') },
      { horizon: '+1h', btcLeads: avg('btc_leads_1h'), altLeads: avg('alt_leads_1h') },
      { horizon: '+3h', btcLeads: avg('btc_leads_3h'), altLeads: avg('alt_leads_3h') },
      { horizon: '+6h', btcLeads: avg('btc_leads_6h'), altLeads: avg('alt_leads_6h') },
      { horizon: '+12h', btcLeads: avg('btc_leads_12h'), altLeads: avg('alt_leads_12h') },
      { horizon: '+24h', btcLeads: avg('btc_leads_24h'), altLeads: avg('alt_leads_24h') },
    ];
  })();

  const couplingData = (preds?.coupling_state ?? []).map(c => ({
    name: c.name, corr: c.corr_90d, percentile: c.corr_90d_percentile,
  }));

  const propagationData = (fc?.coins ?? []).map(c => ({
    name: c.name, probability: c.probability_follows_24h, control: c.control_probability,
  }));

  const spilloverData = Object.entries(meas?.spillover?.per_coin ?? {}).map(
    ([sym, v]) => ({ name: sym.replace('USDT', ''), share: (v as { btc_share_of_variance: number }).btc_share_of_variance }));

  if (loading) {
    return (
      <AnimatedPage>
        <div className="page-header"><div><h1>How Bitcoin Moves the Market</h1>
          <p>Loading research…</p></div></div>
      </AnimatedPage>
    );
  }

  if (!data || !meas) {
    return (
      <AnimatedPage>
        <div className="page-header"><div><h1>How Bitcoin Moves the Market</h1></div></div>
        <div className="card research-section">
          <div className="chat-error"><AlertTriangle size={15} />
            Research data unavailable — the backend may be offline.</div>
        </div>
      </AnimatedPage>
    );
  }

  return (
    <AnimatedPage>
      <div className="page-header">
        <div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            <span className="page-badge indigo"><FlaskConical size={11} /> RESEARCH</span>
            <span className="page-badge green">
              {meas.meta.date_range.start} → {meas.meta.date_range.end}
            </span>
          </div>
          <h1>How Bitcoin Moves the Market</h1>
          <p>
            Peer-reviewed findings on Bitcoin&apos;s influence over altcoins, re-tested on{' '}
            {meas.meta.n_4h_candles.toLocaleString()} of our own 4-hour candles across{' '}
            {meas.meta.coins.length} coins. Where our data disagrees with the literature,
            we show the disagreement.
          </p>
        </div>
      </div>

      {/* ── Headline numbers ─────────────────────────────────────────── */}
      <div className="research-hero">
        <div className="research-stat">
          <div className="research-stat-label">Average BTC correlation</div>
          <div className="research-stat-value mono">
            {meas.correlation.summary.mean_full_sample_corr.toFixed(3)}
          </div>
          <div className="research-stat-sub">
            across all {Math.max(meas.meta.coins.length - 1, 0)} altcoins, full sample
          </div>
        </div>
        <div className="research-stat">
          <div className="research-stat-label">BTC share of alt volatility</div>
          <div className="research-stat-value mono">
            {meas.spillover?.summary?.mean_btc_share_pct?.toFixed(1) ?? '—'}%
          </div>
          <div className="research-stat-sub">a minority — BTC is the largest single source, not the dominant one</div>
        </div>
        <div className="research-stat">
          <div className="research-stat-label">BTC regime right now</div>
          <div className="research-stat-value" style={{ fontSize: 24, textTransform: 'capitalize' }}>
            {fc?.btc_current_regime ?? '—'}
          </div>
          <div className="research-stat-sub">
            {fc?.hours_since_btc_flip != null
              ? `${fc.hours_since_btc_flip}h since it last changed`
              : 'no recent change detected'}
          </div>
        </div>
      </div>

      {/* ── Premium gate for the forward-looking outputs ─────────────── */}
      {predsLocked && (
        <PremiumGateCard
          title="Live forecasts are a Premium feature"
          description="The 24-hour propagation forecast, per-coin coupling state and divergence watch — validated out-of-sample and updated continuously — are available with a Premium subscription. The literature review and historical measurements below stay free." />
      )}

      {/* ── The validated forecast ───────────────────────────────────── */}
      {fc?.status === 'validated' && (
        <Section icon={<Radar size={18} className="text-secondary" />}
          title="What this means for the next 24 hours"
          sub={fc.how_to_read}>
          <div className={`research-banner ${fc.btc_recently_flipped ? 'active' : 'idle'}`}>
            {fc.btc_recently_flipped ? (
              <><CheckCircle2 size={15} /><span>
                BTC&apos;s regime changed {fc.hours_since_btc_flip}h ago — these probabilities apply now.
              </span></>
            ) : (
              <><Info size={15} /><span>
                BTC last changed regime {fc.hours_since_btc_flip}h ago, outside the 24-hour window
                these figures describe. They are shown as reference, not as an active call.
              </span></>
            )}
          </div>

          <div className="research-pooled">
            <div><span className="mono">{pct(fc.pooled.follow_rate)}</span> follow rate after a BTC flip</div>
            <div><span className="mono">{pct(fc.pooled.control_rate)}</span> baseline at other times</div>
            <div className="research-pooled-lift">
              <span className="mono">+{(fc.pooled.lift * 100).toFixed(1)}pp</span> edge
              <em>p &lt; 0.001, {fc.pooled.n_events} held-out events</em>
            </div>
          </div>

          <PropagationChart data={propagationData} />

          <div className="research-table-wrap">
            <table className="reality-table">
              <caption className="sr-only">
                Out-of-sample probability each coin follows a Bitcoin regime change within 24 hours
              </caption>
              <thead>
                <tr>
                  <th scope="col">Coin</th><th scope="col">Follows BTC</th>
                  <th scope="col">Baseline</th><th scope="col">Edge</th>
                  <th scope="col">Typical lag</th><th scope="col">Sample</th>
                  <th scope="col">Now</th>
                </tr>
              </thead>
              <tbody>
                {fc.coins.map(c => (
                  <tr key={c.symbol}>
                    <th scope="row">{c.name}</th>
                    <td className="mono">{pct(c.probability_follows_24h)}</td>
                    <td className="mono" style={{ color: 'var(--text-muted)' }}>
                      {pct(c.control_probability)}
                    </td>
                    <td className="mono" style={{
                      color: c.significant ? 'var(--signal-buy)' : 'var(--text-muted)',
                      fontWeight: 700,
                    }}>
                      +{(c.lift * 100).toFixed(1)}pp
                      {!c.significant && <span className="lit-ns" title={`p = ${c.p_value}`}> ns</span>}
                    </td>
                    <td className="mono">{c.median_lag_hours ? `${c.median_lag_hours}h` : '—'}</td>
                    <td className="mono">{c.n_test_events}</td>
                    <td>
                      <span className={`signal-badge ${c.current_regime === 'uptrend' ? 'buy'
                        : c.current_regime === 'downtrend' ? 'sell' : 'hold'}`}>
                        {REGIME_ICON[c.current_regime]} {c.current_regime}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="research-note">
            <strong>ns</strong> = not statistically significant on its own sample, shown for
            completeness rather than hidden. Every probability above is measured{' '}
            <strong>out of sample</strong> — on data the estimates never saw — and each is
            paired with its baseline, because the gap between them is the actual information.
          </p>
        </Section>
      )}

      {/* ── Coupling state ───────────────────────────────────────────── */}
      {preds?.coupling_state?.length ? (
        <Section icon={<Activity size={18} className="text-secondary" />}
          title="How tightly each coin is tracking Bitcoin"
          sub="90-day correlation, ranked against each coin's own two-year range. An absolute correlation means little without knowing what is normal for that coin.">
          <CouplingChart data={couplingData} />
          <div className="coupling-grid">
            {preds.coupling_state.map(c => (
              <div key={c.symbol} className={`coupling-card ${c.state}`}>
                <div className="coupling-head">
                  <strong>{c.name}</strong>
                  <span className="mono">{c.corr_90d.toFixed(3)}</span>
                </div>
                <div className="coupling-bar">
                  <div className="coupling-fill" style={{ width: `${c.corr_90d_percentile}%` }} />
                </div>
                <div className="coupling-meta">
                  {c.corr_90d_percentile.toFixed(0)}th percentile
                  {c.beta != null && <> · β {c.beta.toFixed(2)}</>}
                </div>
                <p className="coupling-reading">{c.reading}</p>
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      {/* ── Our measurements ─────────────────────────────────────────── */}
      <Section icon={<Activity size={18} className="text-secondary" />}
        title="Does Bitcoin actually lead altcoins?"
        sub="Average correlation between a Bitcoin move and an altcoin move some hours later. If Bitcoin led the market, the lagged lines would stay high.">
        <LeadLagChart data={leadLagData} />
        <div className="research-callout">
          <strong>The most important result on this page.</strong> Altcoins move{' '}
          <em>with</em> Bitcoin in the same hour (correlation{' '}
          {meas.lead_lag.summary.mean_contemporaneous_corr.toFixed(3)}), but Bitcoin&apos;s
          ability to predict the <em>next</em> hour is close to zero. So &ldquo;Bitcoin just
          moved, this coin is next&rdquo; is not supported by our data — the relationship is
          co-movement, not leadership. The regime-level effect above is the one place where
          Bitcoin genuinely leads, and it operates over{' '}
          {fc?.coins?.[0]?.median_lag_hours ?? 8}–14 hours rather than minutes.
        </div>
      </Section>

      {spilloverData.length > 0 && (
        <Section icon={<Activity size={18} className="text-secondary" />}
          title="How much altcoin volatility comes from Bitcoin"
          sub="Share of each coin's volatility variance attributable to Bitcoin shocks (VAR forecast-error variance decomposition).">
          <SpilloverChart data={spilloverData} />
          <div className="research-callout">
            Bitcoin accounts for {meas.spillover.summary.mean_btc_share_pct}% of altcoin
            volatility on average — the largest single external source, but a minority of the
            total. This <strong>contradicts</strong> Koutmos (2018), who found Bitcoin the
            dominant contributor on 2018-era data, and sits closer to Yi et al. (2018):
            a major transmitter, not the sole one.
          </div>
        </Section>
      )}

      {/* ── Literature ───────────────────────────────────────────────── */}
      <Section icon={<BookOpen size={18} className="text-secondary" />}
        title="What the published research says"
        sub={`${entries.length} peer-reviewed sources. Every one was verified against the Crossref DOI registry, and each finding below is taken from the paper's own abstract.`}>
        <div className="pred-filter-bar" style={{ marginBottom: 16 }}>
          <button className={`pred-filter-btn ${filter === 'ALL' ? 'active-all' : ''}`}
            onClick={() => setFilter('ALL')}>All</button>
          {Object.entries(QUESTION_LABELS).map(([q, label]) => (
            <button key={q} className={`pred-filter-btn ${filter === q ? 'active-all' : ''}`}
              onClick={() => setFilter(q)}>{label}</button>
          ))}
        </div>
        <div className="lit-grid">
          {shown.map(e => <LiteratureCard key={e.id} e={e} />)}
        </div>
        {data.bibliography?.documented_gaps?.map((g, i) => (
          <div key={i} className="research-gap">
            <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <strong>Gap: {g.topic}</strong>
              <p>{g.note}</p>
            </div>
          </div>
        ))}
      </Section>

      {/* ── What we did NOT ship ─────────────────────────────────────── */}
      {preds?.rejected?.length ? (
        <Section icon={<XCircle size={18} className="text-secondary" />}
          title="Predictions we tested and rejected"
          sub="Ideas that looked reasonable but failed our own measurements. Published because an absent feature should be explained, not silently omitted.">
          {preds.rejected.map((r, i) => (
            <div key={i} className="rejected-card">
              <div className="rejected-head"><XCircle size={14} /> {r.candidate}</div>
              <p>{r.reason}</p>
              <span className="rejected-evidence">{r.evidence}</span>
            </div>
          ))}
        </Section>
      ) : null}

      {/* ── Methodology ──────────────────────────────────────────────── */}
      <Section icon={<Info size={18} className="text-secondary" />}
        title="Methodology and limitations">
        <ul className="research-limits">
          <li>
            <strong>Data.</strong> {meas.meta.n_4h_candles.toLocaleString()} aligned 4-hour
            candles and {meas.meta.n_1h_candles.toLocaleString()} 1-hour candles from Binance
            spot, {meas.meta.date_range.start} to {meas.meta.date_range.end}, across{' '}
            {meas.meta.coins.length} coins.
          </li>
          <li>
            <strong>Validation.</strong> The forecast was estimated on the first 60% of the
            period and tested on the remaining 40%, which the estimates never saw. It shipped
            only because the out-of-sample edge was significant (p&nbsp;&lt;&nbsp;0.001) with
            all 9 coins positive.
          </li>
          {meas.meta.caveats.map((c, i) => <li key={i}>{c}</li>)}
          <li>
            <strong>Not advice.</strong> {preds?.boundaries}
          </li>
        </ul>
      </Section>
    </AnimatedPage>
  );
}
