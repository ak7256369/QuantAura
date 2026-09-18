'use client';

// Single lazy entry point for every recharts-backed component.
//
// Each next/dynamic(() => import(...)) callsite gets its own chunk graph, so
// four dynamic imports of four separate files produced FOUR bundled copies of
// recharts (~308 KB each). Importing this one barrel from every callsite gives
// them the same module — one shared chunk, bundled once, cached across routes.
export { default as F1BarChart } from './F1BarChart';
export { default as WeightsDonut } from './WeightsDonut';
export { default as Sparkline } from './Sparkline';
export { default as EquityChart } from './EquityChart';
export { LeadLagChart, CouplingChart, PropagationChart, SpilloverChart } from './ResearchCharts';
