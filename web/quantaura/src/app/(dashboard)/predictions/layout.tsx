import type { Metadata } from 'next';
import { BreadcrumbJsonLd } from '@/components/SEO/JsonLd';

export const metadata: Metadata = {
  title: 'AI Crypto Predictions — 24h Trend Signals',
  description:
    'BUY, HOLD or SELL — 24-hour trend outlook for BTC, ETH, SOL and 7 more coins from a 4-model ML ensemble, with live confidence scores.',
  alternates: { canonical: 'https://quantaura.tech/predictions' },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <BreadcrumbJsonLd items={[
        { name: 'Home', url: 'https://quantaura.tech' },
        { name: 'Predictions', url: 'https://quantaura.tech/predictions' },
      ]} />
      {children}
    </>
  );
}
