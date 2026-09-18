import type { Metadata } from 'next';
import { BreadcrumbJsonLd } from '@/components/SEO/JsonLd';

export const metadata: Metadata = {
  title: 'Paper Portfolio — $10k on the Model\'s Own Calls',
  description:
    'A virtual $10,000 traded mechanically on QuantAura\'s public BTC calls, fees included, next to buy-and-hold. Every call is logged before its outcome is knowable — wins, losses and fees all published.',
  alternates: { canonical: 'https://quantaura.tech/portfolio' },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <BreadcrumbJsonLd items={[
        { name: 'Home', url: 'https://quantaura.tech' },
        { name: 'Portfolio', url: 'https://quantaura.tech/portfolio' },
      ]} />
      {children}
    </>
  );
}
