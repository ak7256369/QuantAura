---
description: QuantAura frontend UI polish — animations, loading states, inline style cleanup, code quality, and visual enhancements. Excludes dark mode and mobile menu.
---

# QuantAura Frontend UI Polish Workflow

**Project path:** `d:\fyp\FYP\quantaura`
**Scope:** All improvements EXCEPT dark mode and mobile hamburger menu.

---

## Phase 1: Cleanup & Housekeeping

### Step 1.1 — Delete unused `page.module.css`
- Delete the file `src/app/page.module.css` — it is the default Next.js boilerplate and is not imported anywhere.

### Step 1.2 — Fix unprofessional copy text
- In `src/app/portfolio/page.tsx`, change the subtitle text from:
  `"Breakdown of your mocked crypto holdings."` → `"Your asset allocation overview."`

### Step 1.3 — Replace `✦` with Lucide `Sparkles` icon
- In `src/components/Dashboard/AgentDashboard.tsx` (around line 116), replace the `✦` character in the "GPT-4o Powered" tag with a Lucide `Sparkles` icon for consistent cross-browser rendering.
- Import `Sparkles` from `lucide-react` (add it to the existing import).
- Replace `✦ GPT-4o Powered` with `<Sparkles size={12} /> GPT-4o Powered`.

---

## Phase 2: Move Inline Styles to CSS Classes

### Step 2.1 — Add new CSS classes to `src/app/globals.css`
Add the following CSS classes at the end of `globals.css` (before the Utilities section or at the end):

```css
/* ── Page Headers ── */
.page-header { margin-bottom: 24px; }
.page-header h2 { font-size: 28px; font-weight: 800; }
.page-header p { color: var(--text-muted); font-size: 15px; }

/* ── Markets Grid ── */
.markets-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--gap); }
.market-card { cursor: pointer; }
.market-card-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.market-card-info { display: flex; align-items: center; gap: 10px; }
.market-card-icon {
  width: 40px; height: 40px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center; color: white;
}
.market-card-name { font-weight: 700; }
.market-card-price { font-size: 28px; font-weight: 800; }
.market-card-change { font-size: 12; }

/* ── Signals Table ── */
.signals-table { width: 100%; border-collapse: collapse; font-size: 14px; }
.signals-table thead tr { background: var(--bg-primary); border-bottom: 1px solid var(--border-subtle); }
.signals-table th {
  padding: 14px 20px; text-align: left; font-weight: 700;
  font-size: 12px; text-transform: uppercase; color: var(--text-muted); letter-spacing: 0.5px;
}
.signals-table tbody tr { border-bottom: 1px solid var(--border-subtle); transition: background 0.2s; }
.signals-table tbody tr:hover { background: rgba(59, 130, 246, 0.04); }
.signals-table td { padding: 16px 20px; }
.signals-asset-cell { display: flex; align-items: center; gap: 12px; }
.signals-asset-icon {
  width: 36px; height: 36px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center; color: white;
}
.signals-asset-name { font-weight: 700; }
.signals-asset-sub { font-size: 12px; color: var(--text-muted); }
.signals-confidence-cell { display: flex; align-items: center; gap: 10px; }
.signals-time-cell { color: var(--text-muted); }
.signals-action-btn {
  padding: 8px 20px; border-radius: 8px; border: none;
  background: var(--accent-gradient); color: white; font-weight: 700;
  font-size: 13px; cursor: pointer; transition: opacity 0.2s;
}
.signals-action-btn:hover { opacity: 0.9; }

/* ── Portfolio ── */
.portfolio-grid { display: grid; grid-template-columns: 1.2fr 1fr; gap: var(--gap); }
.portfolio-donut-card { display: flex; align-items: center; justify-content: center; min-height: 350px; }
.portfolio-donut-wrapper { position: relative; width: 280px; height: 280px; }
.portfolio-donut-center {
  position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center;
}
.portfolio-donut-value { font-size: 28px; font-weight: 800; }
.portfolio-donut-label { font-size: 13px; color: var(--text-muted); }
.holding-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 0; border-bottom: 1px solid var(--border-subtle);
}
.holding-info { display: flex; align-items: center; gap: 12px; }
.holding-icon {
  width: 36px; height: 36px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center; font-weight: 800;
}
.holding-name { font-weight: 700; }
.holding-sub { font-size: 12px; color: var(--text-muted); }
.holding-value { text-align: right; }
.holding-amount { font-weight: 700; }
.holding-pct { font-size: 12px; color: var(--text-muted); }

/* ── Backtest ── */
.backtest-grid { display: grid; gap: var(--gap); }
.backtest-grid.with-results { grid-template-columns: 1fr 1.5fr; }
.backtest-field { margin-bottom: 20px; }
.backtest-label { display: block; font-size: 13px; font-weight: 600; color: var(--text-secondary); margin-bottom: 8px; }
.backtest-input, .backtest-select {
  width: 100%; padding: 12px 16px; border-radius: var(--radius-sm);
  border: 1px solid var(--border-card); background: var(--bg-primary);
  font-size: 14px; color: var(--text-primary); font-family: inherit;
  transition: border-color 0.2s;
}
.backtest-input:focus, .backtest-select:focus { outline: none; border-color: var(--accent-primary); }
.backtest-submit {
  width: 100%; padding: 14px; border-radius: var(--radius-sm); border: none;
  background: var(--accent-gradient); color: white; font-weight: 700;
  font-size: 15px; cursor: pointer; box-shadow: 0 4px 15px var(--accent-glow);
  display: flex; align-items: center; justify-content: center; gap: 8px;
  transition: opacity 0.2s;
}
.backtest-submit:hover { opacity: 0.9; }
.backtest-results-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--gap); margin-bottom: var(--gap); }
.backtest-metric { text-align: center; }
.backtest-metric-label { font-size: 12px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; margin-bottom: 8px; }
.backtest-metric-value { font-size: 24px; font-weight: 800; }
.backtest-metric-value.positive { color: var(--signal-buy); }
.backtest-metric-value.negative { color: var(--signal-sell); }
.backtest-bar-chart { display: flex; align-items: flex-end; gap: 12px; height: 200px; padding-top: 20px; }
.backtest-bar { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 8px; }
.backtest-bar-value { font-size: 11px; font-weight: 600; }
.backtest-bar-fill { width: 100%; border-radius: 8px 8px 0 0; opacity: 0.8; transition: height 0.5s ease; }
.backtest-bar-label { font-size: 11px; color: var(--text-muted); }

@media (max-width: 1024px) {
  .markets-grid { grid-template-columns: repeat(2, 1fr); }
  .portfolio-grid { grid-template-columns: 1fr; }
  .backtest-grid.with-results { grid-template-columns: 1fr; }
  .backtest-results-grid { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 768px) {
  .markets-grid { grid-template-columns: 1fr; }
  .backtest-results-grid { grid-template-columns: 1fr; }
}
```

### Step 2.2 — Refactor `src/app/markets/page.tsx`
Replace all inline `style={{...}}` with the new CSS classes from Step 2.1. Use `className` instead. The page should use: `page-header`, `markets-grid`, `market-card`, `market-card-header`, `market-card-info`, `market-card-icon`, `market-card-name`, `market-card-price`, `market-card-change`.

### Step 2.3 — Refactor `src/app/signals/page.tsx`
Replace all inline styles with the new CSS classes. Use: `page-header`, `signals-table`, `signals-asset-cell`, `signals-asset-icon`, `signals-asset-name`, `signals-asset-sub`, `signals-confidence-cell`, `signals-time-cell`, `signals-action-btn`. Also add the hover effect on table rows (`signals-table tbody tr:hover`).

### Step 2.4 — Refactor `src/app/portfolio/page.tsx`
Replace inline styles with CSS classes. Use: `page-header`, `portfolio-grid`, `portfolio-donut-card`, `portfolio-donut-wrapper`, `portfolio-donut-center`, `portfolio-donut-value`, `portfolio-donut-label`, `holding-row`, `holding-info`, `holding-icon`, `holding-name`, `holding-sub`, `holding-value`, `holding-amount`, `holding-pct`. Also fix the subtitle text (Step 1.2).

### Step 2.5 — Refactor `src/app/backtest/page.tsx`
Replace inline styles with CSS classes. Use: `page-header`, `backtest-grid`, `backtest-field`, `backtest-label`, `backtest-input`, `backtest-select`, `backtest-submit`, `backtest-results-grid`, `backtest-metric`, `backtest-metric-label`, `backtest-metric-value`, `backtest-bar-chart`, `backtest-bar`, `backtest-bar-value`, `backtest-bar-fill`, `backtest-bar-label`.

---

## Phase 3: Entrance Animations

### Step 3.1 — Add animation CSS to `globals.css`
Add these animation utilities to `globals.css`:

```css
/* ── Entrance Animations ── */
.animate-fade-in {
  animation: fadeIn 0.5s ease both;
}
.animate-fade-in-up {
  animation: fadeInUp 0.6s ease both;
}
@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}

/* Stagger delays for cards */
.stagger-1 { animation-delay: 0.05s; }
.stagger-2 { animation-delay: 0.1s; }
.stagger-3 { animation-delay: 0.15s; }
.stagger-4 { animation-delay: 0.2s; }
.stagger-5 { animation-delay: 0.25s; }
.stagger-6 { animation-delay: 0.3s; }
.stagger-7 { animation-delay: 0.35s; }
.stagger-8 { animation-delay: 0.4s; }
```

### Step 3.2 — Apply staggered animations to StatsRow
In `src/components/Layout/StatsRow.tsx`, add `className="stat-card animate-fade-in-up stagger-N"` to each of the 4 stat cards (N = 1, 2, 3, 4).

### Step 3.3 — Apply staggered animations to Markets page
In `src/app/markets/page.tsx`, add `animate-fade-in-up` and `stagger-N` classes to each market card using the `.map()` index.

### Step 3.4 — Apply entrance animation to page headers
In each page (`markets`, `signals`, `portfolio`, `backtest`), add `animate-fade-in` to the `.page-header` div.

### Step 3.5 — Apply entrance animation to main content sections
In `src/app/page.tsx`, add `animate-fade-in-up` to the `chart-news-row` div and `agent-dashboard` div with appropriate stagger delays.

---

## Phase 4: Loading Skeleton Shimmer

### Step 4.1 — Add skeleton CSS to `globals.css`
```css
/* ── Skeleton Loading ── */
.skeleton {
  background: linear-gradient(90deg, var(--border-subtle) 25%, #f1f5f9 50%, var(--border-subtle) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s ease-in-out infinite;
  border-radius: var(--radius-sm);
}
@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
.skeleton-text { height: 14px; margin-bottom: 8px; border-radius: 4px; }
.skeleton-text.short { width: 60%; }
.skeleton-text.medium { width: 80%; }
.skeleton-title { height: 22px; width: 50%; margin-bottom: 12px; border-radius: 4px; }
.skeleton-card { height: 120px; border-radius: var(--radius); }
.skeleton-chart { height: 460px; border-radius: var(--radius); }
```

### Step 4.2 — Add skeleton loading state to the Dashboard page
In `src/app/page.tsx`, when `loading` is true and `candles.length === 0`, render skeleton cards for the chart area and agent dashboard. Example:
```tsx
{loading && candles.length === 0 ? (
  <div className="chart-panel">
    <div className="skeleton skeleton-chart"></div>
  </div>
) : (
  <div className="chart-panel">
    {/* ...existing chart content... */}
  </div>
)}
```

### Step 4.3 — Improve the NewsFeed loading state
In `src/components/NewsFeed/NewsFeed.tsx`, replace the plain "Loading news..." text with skeleton cards:
```tsx
{loading ? (
  <div style={{ padding: 12 }}>
    {[1, 2, 3, 4].map(i => (
      <div key={i} className="news-card" style={{ marginBottom: 10 }}>
        <div className="skeleton skeleton-text medium"></div>
        <div className="skeleton skeleton-text short"></div>
        <div className="skeleton skeleton-text" style={{ width: '40%', marginTop: 8 }}></div>
      </div>
    ))}
  </div>
) : /* ...rest of existing code... */}
```

---

## Phase 5: Visual Enhancements

### Step 5.1 — Improve chart canvas background
In `src/components/Chart/CandlestickChart.tsx`, in the `draw()` function (around line 71), after clearing the canvas with `#fafbfc`, add a subtle dot grid pattern:
```typescript
// After: ctx.fillStyle = '#fafbfc'; ctx.fillRect(0, 0, width, height);
// Add subtle grid dots
ctx.fillStyle = '#e8ecf1';
for (let gx = padding.left; gx < width - padding.right; gx += 40) {
  for (let gy = padding.top; gy < height - padding.bottom; gy += 40) {
    ctx.beginPath();
    ctx.arc(gx, gy, 0.8, 0, Math.PI * 2);
    ctx.fill();
  }
}
```

### Step 5.2 — Add sparkline mini-charts to Market cards (optional enhancement)
Create a small inline SVG sparkline component in `src/app/markets/page.tsx`. Each market card should include a tiny sparkline showing a random but deterministic price trend. Add this above the price number:
```tsx
// Simple sparkline using SVG polyline
function Sparkline({ color, seed }: { color: string; seed: number }) {
  // Generate deterministic points based on seed
  const points: number[] = [];
  let val = 50;
  for (let i = 0; i < 20; i++) {
    val += Math.sin(seed * i * 0.7) * 8 + Math.cos(i * 0.3) * 5;
    val = Math.max(10, Math.min(90, val));
    points.push(val);
  }
  const polyline = points.map((p, i) => `${i * 5},${100 - p}`).join(' ');
  return (
    <svg viewBox="0 0 95 100" style={{ width: '100%', height: 40, marginBottom: 8 }} preserveAspectRatio="none">
      <polyline points={polyline} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.6" />
    </svg>
  );
}
```
Then render `<Sparkline color={m.color} seed={index} />` inside each market card, between the header and the price.

---

## Phase 6: TypeScript Cleanup

### Step 6.1 — Fix `any` types in `src/app/page.tsx`
Define proper interfaces for candle and signal data:
```typescript
interface CandleData {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface SignalData {
  symbol: string;
  signal: string;
  confidence: number;
  ensemble: {
    lstm: { signal: string; confidence: number };
    xgboost: { signal: string; confidence: number };
    transformer: { signal: string; confidence: number };
  };
  indicators: Record<string, { value: string; status: string; note: string }>;
  macro: Record<string, { value: string; change: string; direction: string }>;
  explanation: string;
}
```
Then replace:
- `useState<any[]>([])` → `useState<CandleData[]>([])`
- `useState<any>(null)` → `useState<SignalData | null>(null)`

### Step 6.2 — Fix `any` types in `src/app/backtest/page.tsx`
Define a proper interface for backtest results:
```typescript
interface MonthlyReturn { month: string; return: number; }
interface BacktestResults {
  totalReturn: number;
  winRate: number;
  sharpeRatio: number;
  maxDrawdown: number;
  totalTrades: number;
  avgHoldingPeriod: string;
  monthlyReturns: MonthlyReturn[];
}
```
Replace `useState<any>(null)` → `useState<BacktestResults | null>(null)` and `(m: any)` → `(m: MonthlyReturn)`.

---

## Phase 7: Remove Redundant StatsRow

### Step 7.1 — Remove StatsRow from sub-pages
The `<StatsRow />` component is shown on EVERY page (Dashboard, Markets, Signals, Portfolio, Backtest). It shows the same static data everywhere, which feels redundant.
- **Keep** `<StatsRow />` in `src/app/page.tsx` (main Dashboard).
- **Remove** `<StatsRow />` from: `src/app/markets/page.tsx`, `src/app/signals/page.tsx`, `src/app/portfolio/page.tsx`, `src/app/backtest/page.tsx`.
- Also remove the unused `import StatsRow from '@/components/Layout/StatsRow'` from each of those files.

---

## Phase 8: Verify

### Step 8.1 — Run the dev server
// turbo
```bash
cd d:\fyp\FYP\quantaura && npm run dev
```

### Step 8.2 — Open in browser and verify
Open `http://localhost:3000` in the browser and check:
- [ ] Dashboard page loads with staggered card animations
- [ ] Chart has subtle dot grid background
- [ ] News feed shows skeleton loading before data loads
- [ ] Navigate to `/markets` — cards animate in with stagger + sparklines visible
- [ ] Navigate to `/signals` — table rows highlight on hover
- [ ] Navigate to `/portfolio` — no "mocked" text, clean CSS classes
- [ ] Navigate to `/backtest` — form inputs focus with blue border, results render correctly
- [ ] No console TypeScript errors
- [ ] StatsRow only appears on the Dashboard page

### Step 8.3 — Build check
// turbo
```bash
cd d:\fyp\FYP\quantaura && npm run build
```
Fix any build errors before marking complete.
