'use client';

// Research page charts. Exported through the shared charts.tsx barrel so they
// land in the SAME lazy recharts chunk as the dashboard charts — a separate
// dynamic entry point would bundle its own ~308 KB copy of recharts.

import {
    BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
    Legend, ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts';

const AXIS = { fill: 'var(--chart-label)', fontSize: 11 };

// Recharts 3 types tooltip values as possibly-undefined, so formatters take the
// loose type and coerce rather than asserting number.
const num = (v: unknown) => (typeof v === 'number' ? v : Number(v) || 0);
const TOOLTIP_STYLE = {
    background: 'var(--tooltip-bg)',
    border: '1px solid var(--border-card)',
    borderRadius: 10,
    fontSize: 12,
    color: 'var(--text-primary)',
};

/** Lead-lag: the finding that BTC co-moves with alts but does not LEAD them.
 *  Contemporaneous correlation towers over every lagged value. */
export function LeadLagChart({ data }: {
    data: { horizon: string; btcLeads: number; altLeads: number }[];
}) {
    return (
        <ResponsiveContainer width="100%" height={260}>
            <LineChart data={data} margin={{ top: 8, right: 12, left: -8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
                <XAxis dataKey="horizon" tick={AXIS} axisLine={false} tickLine={false} />
                <YAxis tick={AXIS} axisLine={false} tickLine={false} domain={[-0.1, 1]}
                    tickFormatter={v => v.toFixed(1)} />
                <ReferenceLine y={0} stroke="var(--border-card)" />
                <Tooltip contentStyle={TOOLTIP_STYLE}
                    formatter={(v) => num(v).toFixed(4)} />
                <Legend wrapperStyle={{ fontSize: 11.5, paddingTop: 8 }} />
                <Line type="monotone" dataKey="btcLeads" name="BTC leads altcoin"
                    stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="altLeads" name="Altcoin leads BTC"
                    stroke="#f59e0b" strokeWidth={2} strokeDasharray="5 4" dot={{ r: 3 }} />
            </LineChart>
        </ResponsiveContainer>
    );
}

/** Per-coin coupling: 90-day correlation, coloured by how unusual that is for
 *  the coin itself (percentile), because 0.8 means different things per coin. */
export function CouplingChart({ data }: {
    data: { name: string; corr: number; percentile: number }[];
}) {
    const colorFor = (p: number) =>
        p >= 75 ? '#ef4444' : p <= 25 ? '#10b981' : '#6366f1';
    return (
        <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data} layout="vertical" margin={{ top: 8, right: 20, left: 12, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" horizontal={false} />
                <XAxis type="number" domain={[0, 1]} tick={AXIS} axisLine={false} tickLine={false}
                    tickFormatter={v => v.toFixed(1)} />
                <YAxis type="category" dataKey="name" tick={AXIS} axisLine={false} tickLine={false} width={78} />
                <Tooltip contentStyle={TOOLTIP_STYLE}
                    formatter={(v, _n, p) => [
                        `${num(v).toFixed(3)} (${num((p?.payload as { percentile?: number })?.percentile).toFixed(0)}th pct of its own range)`,
                        '90d correlation with BTC']} />
                <Bar dataKey="corr" radius={[0, 4, 4, 0]}>
                    {data.map((d, i) => <Cell key={i} fill={colorFor(d.percentile)} />)}
                </Bar>
            </BarChart>
        </ResponsiveContainer>
    );
}

/** The validated forecast: out-of-sample follow probability against its
 *  matched control. Showing them together is the whole point — the gap is the
 *  information, the bar alone would read as a promise. */
export function PropagationChart({ data }: {
    data: { name: string; probability: number; control: number }[];
}) {
    return (
        <ResponsiveContainer width="100%" height={320}>
            <BarChart data={data} margin={{ top: 8, right: 12, left: -8, bottom: 4 }} barGap={3}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
                <XAxis dataKey="name" tick={{ ...AXIS, fontSize: 10 }} axisLine={false}
                    tickLine={false} interval={0} angle={-30} textAnchor="end" height={62} />
                <YAxis tick={AXIS} axisLine={false} tickLine={false} domain={[0, 0.8]}
                    tickFormatter={v => `${(v * 100).toFixed(0)}%`} />
                <Tooltip contentStyle={TOOLTIP_STYLE}
                    formatter={(v) => `${(num(v) * 100).toFixed(1)}%`} />
                <Legend wrapperStyle={{ fontSize: 11.5, paddingTop: 8 }} />
                <Bar dataKey="control" name="Baseline (no BTC flip)" fill="var(--text-muted)"
                    radius={[3, 3, 0, 0]} />
                <Bar dataKey="probability" name="After a BTC regime flip" fill="#6366f1"
                    radius={[3, 3, 0, 0]} />
            </BarChart>
        </ResponsiveContainer>
    );
}

/** Share of each altcoin's volatility variance attributable to BTC shocks. */
export function SpilloverChart({ data }: { data: { name: string; share: number }[] }) {
    return (
        <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data} margin={{ top: 8, right: 12, left: -8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
                <XAxis dataKey="name" tick={{ ...AXIS, fontSize: 10 }} axisLine={false}
                    tickLine={false} interval={0} angle={-30} textAnchor="end" height={62} />
                <YAxis tick={AXIS} axisLine={false} tickLine={false}
                    tickFormatter={v => `${v}%`} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => `${num(v).toFixed(1)}%`} />
                <Bar dataKey="share" name="BTC share of volatility" fill="#8b5cf6" radius={[3, 3, 0, 0]} />
            </BarChart>
        </ResponsiveContainer>
    );
}
