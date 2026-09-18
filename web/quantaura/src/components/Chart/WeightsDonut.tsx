'use client';

// Dynamically imported — see F1BarChart.tsx for why recharts must not be
// statically imported from page components.
import React, { useState } from 'react';
import { PieChart, Pie, Cell, Sector, ResponsiveContainer } from 'recharts';

export interface WeightSlice { name: string; value: number; color: string }

function ActivePieSlice(props: any) {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill, payload, percent } = props;
  return (
    <g>
      <Sector cx={cx} cy={cy} innerRadius={innerRadius} outerRadius={outerRadius + 8} startAngle={startAngle} endAngle={endAngle} fill={fill} />
      <text x={cx} y={cy - 8} textAnchor="middle" style={{ fontSize: 18, fontWeight: 800, fill: 'var(--text-primary)' }}>{(percent * 100).toFixed(0)}%</text>
      <text x={cx} y={cy + 12} textAnchor="middle" style={{ fontSize: 12, fill: 'var(--text-secondary)' }}>{payload.name}</text>
    </g>
  );
}

export default function WeightsDonut({ data }: { data: WeightSlice[] }) {
  const [activeSlice, setActiveSlice] = useState(0);
  return (
    <ResponsiveContainer width="100%" height={200}>
      <PieChart>
        {React.createElement(Pie as any, {
          data, cx: '50%', cy: '50%',
          innerRadius: 55, outerRadius: 85,
          activeIndex: activeSlice, activeShape: ActivePieSlice,
          onMouseEnter: (_: unknown, i: number) => setActiveSlice(i),
          dataKey: 'value', stroke: 'none',
          children: data.map((e, i) => <Cell key={i} fill={e.color} />),
        })}
      </PieChart>
    </ResponsiveContainer>
  );
}
