'use client';

import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'motion/react';

// Charts load on demand: recharts is ~336 KB and would otherwise sit in this
// route's first-load bundle. Fixed-height placeholders match the rendered
// charts exactly so the swap-in causes zero layout shift.
const ChartSkeleton = ({ height }: { height: number }) => (
  <div style={{ height }} aria-hidden="true" />
);
const F1BarChart = dynamic(() => import('@/components/Chart/charts').then(m => m.F1BarChart), {
  ssr: false, loading: () => <ChartSkeleton height={280} />,
});
const WeightsDonut = dynamic(() => import('@/components/Chart/charts').then(m => m.WeightsDonut), {
  ssr: false, loading: () => <ChartSkeleton height={200} />,
});
import { Star, Cpu, Zap, Award, Info, Sparkles, RefreshCw } from 'lucide-react';
import AnimatedPage from '@/components/Motion/AnimatedPage';
import { type ModelStatsResponse } from '@/lib/api';
import useModelStats from '@/hooks/useModelStats';
import CountUp from '@/components/UI/CountUp';

// ─── Default / fallback data ──────────────────────────────────────────────────
const MODEL_COLORS: Record<string, { color: string; bg: string; type: string }> = {
  lstm:        { color: '#6366f1', bg: 'rgba(99,102,241,0.08)',  type: 'Sequential' },
  xgboost:     { color: '#06b6d4', bg: 'rgba(6,182,212,0.08)',   type: 'Gradient Boost' },
  transformer: { color: '#8b5cf6', bg: 'rgba(139,92,246,0.08)',  type: 'Attention' },
  kan:         { color: '#ec4899', bg: 'rgba(236,72,153,0.08)',  type: 'Symbolic Reg.' },
};

const MODEL_NAMES: Record<string, string> = {
  lstm: 'LSTM', xgboost: 'XGBoost', transformer: 'Transformer', kan: 'KAN',
};

function buildModelStats(data: ModelStatsResponse | null) {
  const order = ['lstm', 'xgboost', 'transformer', 'kan'];
  return order.map(key => {
    // Current held-out test F1 from the latest full evaluation; the DB average
    // (mixes fine-tune cycles) is only a fallback.
    const f1 = (data?.evaluation?.test as Record<string, number> | undefined)?.[key]
      ?? data?.models?.[key]?.f1_macro ?? 0;
    const meta = MODEL_COLORS[key];
    return {
      name: MODEL_NAMES[key],
      key,
      accuracy: parseFloat((f1 * 100).toFixed(1)),
      trainingTime: `${data?.models?.[key]?.cycles ?? 0} cycles`,
      params: key === 'lstm' ? '2.1M' : key === 'transformer' ? '8.4M' : key === 'xgboost' ? `${data?.config?.xgb_estimators || 300} est.` : '3.6K',
      type: meta.type,
      color: meta.color,
      bg: meta.bg,
    };
  });
}

function buildComparisonData(data: ModelStatsResponse | null) {
  const f1 = (key: string) => parseFloat((((data?.evaluation?.test as Record<string, number> | undefined)?.[key]
    ?? data?.models?.[key]?.f1_macro ?? 0) * 100).toFixed(1));
  return [
    { metric: 'F1-Score', LSTM: f1('lstm'), XGBoost: f1('xgboost'), Transformer: f1('transformer'), KAN: f1('kan') },
  ];
}

function buildWeightsData(data: ModelStatsResponse | null) {
  return [
    { name: 'LSTM',        value: Math.round((data?.weights?.lstm ?? 0.25) * 100), color: '#6366f1' },
    { name: 'Transformer', value: Math.round((data?.weights?.transformer ?? 0.25) * 100), color: '#8b5cf6' },
    { name: 'XGBoost',     value: Math.round((data?.weights?.xgboost ?? 0.25) * 100), color: '#06b6d4' },
    { name: 'KAN',         value: Math.round((data?.weights?.kan ?? 0.25) * 100), color: '#ec4899' },
  ];
}

function buildTrainingConfig(data: ModelStatsResponse | null) {
  const c = data?.config;
  return [
    { model: 'LSTM',        seqLen: c?.lstm_seq_len ?? 48,        features: c?.lstm_features ?? 31,        epochs: c?.epochs_full ?? 100, batchSize: c?.batch_size ?? 64, lr: String(c?.learning_rate ?? '3e-4'), optimizer: 'Adam' },
    { model: 'Transformer', seqLen: c?.transformer_seq_len ?? 96, features: c?.transformer_features ?? 38, epochs: c?.epochs_full ?? 100, batchSize: c?.batch_size ?? 64, lr: String(c?.learning_rate ?? '3e-4'), optimizer: 'AdamW' },
    { model: 'XGBoost',     seqLen: 'N/A (Flat)',                 features: '~90',                         epochs: c?.xgb_estimators ?? 800, batchSize: 'All Data',      lr: '0.03',                             optimizer: 'GBM' },
    { model: 'KAN',         seqLen: 'N/A (Flat)',                 features: c?.kan_features ?? 18,         epochs: c?.epochs_full ?? 100, batchSize: c?.batch_size ?? 64, lr: String(c?.learning_rate ?? '3e-4'), optimizer: 'AdamW' },
  ];
}

const CAT_COLORS: Record<string, string> = {
  Technical: '#6366f1', Momentum: '#3b82f6', Volume: '#06b6d4', Macro: '#f59e0b',
};

// Category is inferred from the (real) feature name exported by the ML eval
function featureCategory(name: string): string {
  const n = name.toLowerCase();
  if (/(volume|obv|vwap|taker|trades|cmf|mfi)/.test(n)) return 'Volume';
  if (/(ret_|momentum|roc|stoch)/.test(n)) return 'Momentum';
  if (/(funding|fear|sp500|dxy|cpi|fed|unemployment|golden|_ma|drawdown)/.test(n)) return 'Macro';
  return 'Technical';
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function AnimatedBar({ pct, color, delay = 0 }: { pct: number; color: string; delay?: number }) {
  return (
    <div className="pred-conf-track" style={{ flex: 1 }}>
      <motion.div className="pred-conf-fill" initial={{ width: 0 }} animate={{ width: `${pct}%` }}
        transition={{ duration: 1.2, ease: 'easeOut', delay }}
        style={{ background: `linear-gradient(90deg,${color}99,${color})` }} />
    </div>
  );
}

interface ModelStat {
  name: string; key?: string; accuracy: number; trainingTime: string;
  params: string; type: string; color: string; bg: string;
}

function ModelStatCard({ m, delay, highlight }: { m: ModelStat; delay: number; highlight?: boolean }) {
  return (
    <motion.div className="model-stat-card" initial={{ opacity: 0, y: 20 }}
      animate={{
        opacity: 1, y: 0,
        // Brief ring when freshly deployed metrics land, so a change that
        // happens while the page is open is not silently swapped in
        boxShadow: highlight ? `0 0 0 2px ${m.color}66, 0 0 26px ${m.color}33` : 'none',
      }}
      transition={{ delay, boxShadow: { duration: 0.5 } }} style={{ background: m.bg }}>
      <div className="model-stat-top-bar" style={{ background: m.color }} />
      <div className="model-stat-header">
        <div>
          <div className="model-stat-name">{m.name}</div>
          <span className="model-type-badge" style={{ background: `${m.color}18`, color: m.color, border: `1px solid ${m.color}30` }}>
            {m.type}
          </span>
        </div>
        <Cpu size={22} color={m.color} />
      </div>
      <div className="model-stat-accuracy" style={{ color: m.color }}>
        <CountUp value={m.accuracy} decimals={1} />
        <span style={{ fontSize: 20 }}>%</span>
      </div>
      <div className="model-stat-accuracy-label">F1 SCORE · HELD-OUT TEST</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
        <AnimatedBar pct={m.accuracy} color={m.color} delay={0.3} />
      </div>
      <div className="model-stat-meta-grid">
        {[['Total Cycles', m.trainingTime], ['Parameters', m.params]].map(([label, val]) => (
          <div key={label} className="model-stat-meta-item">
            <div className="model-stat-meta-label">{label}</div>
            <div className="model-stat-meta-value">{val}</div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

function ConfusionMatrix({ model, data }: { model: string; data: number[][] }) {
  const labels = ['BUY', 'HOLD', 'SELL'];
  const max = Math.max(...data.flat());
  return (
    <div>
      <div className="models-cm-title">{model}</div>
      <div className="models-cm-matrix">
        <div />
        {labels.map(l => <div key={l} className="models-cm-header">{l}</div>)}
        {data.map((row, ri) => [
          <div key={`r${ri}`} className="models-cm-row-label">{labels[ri]}</div>,
          ...row.map((val, ci) => {
            const intensity = val / max;
            const isCorrect = ri === ci;
            const bg = isCorrect
              ? `rgba(16,185,129,${0.15 + intensity * 0.6})`
              : `rgba(239,68,68,${0.07 + intensity * 0.35})`;
            return (
              <div key={ci} className="models-cm-cell" style={{ background: bg,
                border: `1px solid ${isCorrect ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.1)'}` }}>
                {val}
              </div>
            );
          }),
        ])}
      </div>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────
function LiveBadge({ justUpdated, lastFetched, offline, onRefresh }: {
  justUpdated: boolean; lastFetched: number | null; offline: boolean; onRefresh: () => void;
}) {
  const [, force] = useState(0);
  // Re-render once a minute so the relative timestamp stays truthful
  React.useEffect(() => {
    const id = setInterval(() => force(n => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const ago = (() => {
    if (!lastFetched) return null;
    const s = Math.floor((Date.now() - lastFetched) / 1000);
    if (s < 60) return 'just now';
    const m = Math.floor(s / 60);
    return m < 60 ? `${m}m ago` : `${Math.floor(m / 60)}h ago`;
  })();

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <span className={`page-badge ${offline ? 'red' : 'green'}`}>
        {!offline && <span className="live-dot" aria-hidden="true" />}
        {offline ? 'Backend offline' : `Live${ago ? ` · synced ${ago}` : ''}`}
      </span>
      <button onClick={onRefresh} className="pred-filter-btn" aria-label="Refresh metrics now"
        style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <RefreshCw size={12} /> Refresh
      </button>
      <AnimatePresence>
        {justUpdated && (
          <motion.span
            className="page-badge indigo"
            initial={{ opacity: 0, y: -6, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 320, damping: 22 }}
          >
            <Sparkles size={11} /> New models deployed — metrics updated
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function ModelsPage() {
  const { data: apiData, justUpdated, lastFetched, offline, refresh } = useModelStats();

  const MODEL_STATS = buildModelStats(apiData);
  const COMPARISON_DATA = buildComparisonData(apiData);
  const WEIGHTS_DATA = buildWeightsData(apiData);
  const TRAINING_CONFIG = buildTrainingConfig(apiData);
  const evaluation = apiData?.evaluation;
  const ensembleF1 = evaluation?.test?.ensemble != null
    ? parseFloat((evaluation.test.ensemble * 100).toFixed(1))
    : apiData ? parseFloat((apiData.ensemble_f1 * 100).toFixed(1)) : 0;
  const persistenceF1 = evaluation?.test?.persistence_baseline_f1 != null
    ? parseFloat((evaluation.test.persistence_baseline_f1 * 100).toFixed(1)) : null;
  const weightsLabel = WEIGHTS_DATA.map(w => `${w.name} (${w.value}%)`).join(' + ');
  const horizonHours = apiData?.config?.label_horizon_hours ?? 24;
  const topModel = [...WEIGHTS_DATA].sort((a, b) => b.value - a.value)[0];
  const FEATURES = (evaluation?.feature_importance ?? []).map(f => ({
    name: f.name.replace(/^snap_/, ''), importance: Math.round(f.importance),
    category: featureCategory(f.name),
  }));
  const CONFUSION = evaluation?.confusion_matrices ?? null;

  return (
    <AnimatedPage>
      {/* Header */}
      <div className="page-header">
        <div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
            <span className="page-badge indigo"><Zap size={11} /> MODEL INSIGHTS</span>
            <LiveBadge justUpdated={justUpdated} lastFetched={lastFetched}
                       offline={offline} onRefresh={refresh} />
          </div>
          <h1>ML Model Performance</h1>
          <p>
            Held-out test metrics for the 4-model ensemble — every model predicts the
            market trend regime {horizonHours}h ahead (BUY / HOLD / SELL)
          </p>
        </div>
      </div>

      {/* Section 1 — Model Stat Cards */}
      <div className="models-stat-grid">
        {MODEL_STATS.map((m, i) => (
          <ModelStatCard key={m.name} m={m} delay={i * 0.1} highlight={justUpdated} />
        ))}
      </div>

      {/* Ensemble card */}
      <motion.div className="models-ensemble-card" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
        style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(139,92,246,0.05))', borderColor: 'rgba(99,102,241,0.25)' }}>
        <div className="models-ensemble-icon"><Star size={24} color="#6366f1" /></div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 4 }}>ENSEMBLE MODEL — Weighted Average</div>
          <div className="models-ensemble-acc" style={{ color: '#6366f1' }}>
            <CountUp value={ensembleF1} decimals={1} />
            <span style={{ fontSize: 20 }}>%</span>
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <AnimatedBar pct={ensembleF1} color="#6366f1" delay={0.5} />
          <div className="models-ensemble-sub">Combines {weightsLabel}</div>
          {persistenceF1 != null && (
            <div className="models-ensemble-sub" style={{ marginTop: 6 }}>
              Naive &ldquo;trend continues&rdquo; baseline: {persistenceF1}% —
              the ensemble adds {(ensembleF1 - persistenceF1).toFixed(1)} pts of real predictive skill
            </div>
          )}
        </div>
      </motion.div>

      {/* Section 2 — Macro-F1 Comparison Chart */}
      <motion.div className="models-section" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
        <div className="models-section-title">Macro F1 — Held-Out Test</div>
        <div className="models-section-sub">
          Leak-free temporal evaluation: per-symbol 70/15/15 splits with purge gaps, scored once on untouched test data
        </div>
        <F1BarChart data={COMPARISON_DATA} />
      </motion.div>

      {/* Section 3+4 — Weights Donut + Feature Importance */}
      <div className="models-two-col">
        {/* Donut */}
        <motion.div className="models-section" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.45 }}
          style={{ marginBottom: 0 }}>
          <div className="models-section-title">Ensemble Weights</div>
          <div className="models-section-sub">Model contribution to final prediction</div>
          <WeightsDonut data={WEIGHTS_DATA} />
          <div className="models-weights-legend">
            {WEIGHTS_DATA.map(w => (
              <div key={w.name} className="models-weights-row">
                <div className="models-weights-dot" style={{ background: w.color }} />
                <span>{w.name}</span>
                <span className="models-weights-val" style={{ color: w.color }}>{w.value}%</span>
              </div>
            ))}
          </div>
          <div className="models-why-box">
            <Info size={13} color="#6366f1" style={{ flexShrink: 0, marginTop: 1 }} />
            <p className="models-why-text">
              Weights are recalibrated after every training cycle from each model&apos;s
              validation F1{topModel ? ` — ${topModel.name} currently contributes the most (${topModel.value}%)` : ''}.
            </p>
          </div>
        </motion.div>

        {/* Feature Importance */}
        <motion.div className="models-section" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.5 }}
          style={{ marginBottom: 0 }}>
          <div className="models-section-title">Feature Importance</div>
          <div className="models-section-sub">Top XGBoost gain scores from the latest evaluation</div>
          <div className="models-cat-legend">
            {Object.entries(CAT_COLORS).map(([cat, color]) => (
              <div key={cat} className="models-cat-item">
                <div className="models-cat-dot" style={{ background: color }} /> {cat}
              </div>
            ))}
          </div>
          <div className="models-feat-list">
            {FEATURES.length === 0 && (
              <p className="models-why-text" style={{ padding: '12px 0' }}>
                Feature importances appear here after the next training cycle completes.
              </p>
            )}
            {FEATURES.map((f, i) => (
              <div key={f.name} className="models-feat-row">
                <div className="models-feat-name">{f.name}</div>
                <div className="models-feat-track">
                  <motion.div className="models-feat-fill" initial={{ width: 0 }} animate={{ width: `${f.importance}%` }}
                    transition={{ duration: 0.9, ease: 'easeOut', delay: 0.05 * i }}
                    style={{ background: CAT_COLORS[f.category] }} />
                </div>
                <div className="models-feat-val" style={{ color: CAT_COLORS[f.category] }}>{f.importance}</div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Section 5 — Training Config */}
      <motion.div className="models-section" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }}>
        <div className="models-section-title">Training Configuration</div>
        <div className="models-section-sub">Hyperparameters used during model training</div>
        <div style={{ overflowX: 'auto' }}>
          <table className="models-config-table">
            <thead>
              <tr>
                {['Model', 'Seq. Length', 'Features', 'Epochs', 'Batch Size', 'Learning Rate', 'Optimizer'].map(h => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {TRAINING_CONFIG.map((row, i) => (
                <tr key={row.model}>
                  <td style={{ color: MODEL_STATS[i].color, fontWeight: 700 }}>{row.model}</td>
                  {[row.seqLen, row.features, row.epochs, row.batchSize, row.lr, row.optimizer].map((v, j) => (
                    <td key={j}>{String(v)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>

      {/* Section 6 — Confusion Matrices */}
      <motion.div className="models-section" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <Award size={16} color="#6366f1" />
          <div className="models-section-title" style={{ marginBottom: 0 }}>Confusion Matrices</div>
        </div>
        <div className="models-section-sub">
          Held-out test predictions per model — rows are the true regime, columns the prediction; green = correct
        </div>
        {CONFUSION ? (
          <div className="models-cm-grid">
            {(['LSTM', 'XGBoost', 'Transformer', 'KAN'] as const)
              .filter(m => CONFUSION[m])
              .map(model => <ConfusionMatrix key={model} model={model} data={CONFUSION[model]} />)}
          </div>
        ) : (
          <p className="models-why-text" style={{ padding: '12px 0' }}>
            Confusion matrices appear here after the next training cycle completes.
          </p>
        )}
      </motion.div>
    </AnimatedPage>
  );
}
