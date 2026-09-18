import type { Metadata } from 'next';
import { BreadcrumbJsonLd } from '@/components/SEO/JsonLd';

export const metadata: Metadata = {
  title: 'Live Crypto Market Prices',
  description:
    'Live prices, 24h change, volume and sparklines for Bitcoin, Ethereum, Solana and 7 more top coins — streamed directly from Binance.',
  alternates: { canonical: 'https://quantaura.tech/markets' },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <BreadcrumbJsonLd items={[
        { name: 'Home', url: 'https://quantaura.tech' },
        { name: 'Markets', url: 'https://quantaura.tech/markets' },
      ]} />
      {children}
    </>
  );
}
