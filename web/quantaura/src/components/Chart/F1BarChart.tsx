'use client';

// Recharts-backed charts live in their own dynamically-imported components:
// recharts is ~336 KB and was being compiled into the first-load bundle of
// every page that touched it — three separate copies across /models,
// /predictions and /backtest. Loaded via next/dynamic these share one
// on-demand chunk and stay off the critical path entirely.
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

const ChartTooltip = ({ active, payload, label }: {
  active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string;
}) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'var(--tooltip-bg)', border: '1px solid var(--border-card)', borderRadius: 10, padding: '10px 14px' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6 }}>{label}</div>
      {payload.map(p => (
        <div key={p.name} style={{ fontSize: 12, color: p.color, fontWeight: 600 }}>{p.name}: {p.value}%</div>
      ))}
    </div>
  );
};

export interface F1Row {
  metric: string; LSTM: number; XGBoost: number; Transformer: number; KAN: number;
}

export default function F1BarChart({ data }: { data: F1Row[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} barGap={4} barCategoryGap="30%">
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
        <XAxis dataKey="metric" tick={{ fill: 'var(--chart-label)', fontSize: 12 }} axisLine={false} tickLine={false} />
        <YAxis domain={[0, 100]} tick={{ fill: 'var(--chart-label)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
        <Tooltip content={<ChartTooltip />} />
        <Legend wrapperStyle={{ fontSize: 12, color: 'var(--text-secondary)', paddingTop: 12 }} />
        <Bar dataKey="LSTM" fill="#6366f1" radius={[4, 4, 0, 0]} />
        <Bar dataKey="XGBoost" fill="#06b6d4" radius={[4, 4, 0, 0]} />
        <Bar dataKey="Transformer" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
        <Bar dataKey="KAN" fill="#ec4899" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
