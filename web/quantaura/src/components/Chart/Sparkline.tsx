'use client';

// Dynamically imported — see F1BarChart.tsx for why recharts must not be
// statically imported from page components.
import { LineChart, Line, ResponsiveContainer, Tooltip } from 'recharts';

export default function Sparkline({ data, color }: {
  data: { v: number }[]; color: string;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data}>
        <Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} dot={false} isAnimationActive />
        <Tooltip contentStyle={{ background: 'var(--tooltip-bg)', border: `1px solid ${color}30`, borderRadius: 8, fontSize: 11 }}
          itemStyle={{ color }} formatter={(v) => [`$${(v as number).toFixed(2)}`, ''] as [string, string]} labelFormatter={() => ''} />
      </LineChart>
    </ResponsiveContainer>
  );
}
