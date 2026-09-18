'use client';

// Dynamically imported — see F1BarChart.tsx for why recharts must not be
// statically imported from page components.
import {
  XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid, AreaChart, Area,
} from 'recharts';

export default function EquityChart({ data }: { data: Record<string, unknown>[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data}>
        <defs>
          <linearGradient id="colorEquity" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--accent-primary)" stopOpacity={0.3} />
            <stop offset="95%" stopColor="var(--accent-primary)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-line)" vertical={false} />
        <XAxis dataKey="date" stroke="var(--chart-label)" fontSize={11} tickMargin={10} minTickGap={30} />
        <YAxis domain={['auto', 'auto']} stroke="var(--chart-label)" fontSize={11} tickFormatter={(val) => `$${val}`} />
        <Tooltip
          contentStyle={{ backgroundColor: 'var(--tooltip-bg)', border: '1px solid var(--border-card)', borderRadius: '8px' }}
          itemStyle={{ color: 'var(--text-primary)' }}
        />
        <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
        <Area type="monotone" dataKey="equity" stroke="var(--accent-primary)" strokeWidth={2} fillOpacity={1} fill="url(#colorEquity)" name="AI Strategy" />
        <Area type="monotone" dataKey="buyHold" stroke="var(--text-muted)" strokeWidth={1.5} strokeDasharray="6 4" fill="none" name="Buy & Hold" />
      </AreaChart>
    </ResponsiveContainer>
  );
}
