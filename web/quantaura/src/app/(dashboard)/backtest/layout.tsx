import type { Metadata } from 'next';
import { BreadcrumbJsonLd } from '@/components/SEO/JsonLd';

export const metadata: Metadata = {
  title: 'Crypto Strategy Backtest Simulator',
  description:
    'Backtest QuantAura’s AI signals on historical data with realistic fees and slippage — equity curve vs buy & hold, win rate, Sharpe and drawdown.',
  alternates: { canonical: 'https://quantaura.tech/backtest' },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <BreadcrumbJsonLd items={[
        { name: 'Home', url: 'https://quantaura.tech' },
        { name: 'Backtest', url: 'https://quantaura.tech/backtest' },
      ]} />
      {children}
    </>
  );
}
