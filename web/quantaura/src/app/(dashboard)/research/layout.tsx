import type { Metadata } from 'next';
import { BreadcrumbJsonLd } from '@/components/SEO/JsonLd';

export const metadata: Metadata = {
  title: 'How Bitcoin Moves the Altcoin Market',
  description:
    'Peer-reviewed research on Bitcoin-altcoin spillover, replicated on 2 years of our own data — correlation, lead-lag, volatility spillover and a validated 24h regime-propagation forecast.',
  alternates: { canonical: 'https://quantaura.tech/research' },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <BreadcrumbJsonLd items={[
        { name: 'Home', url: 'https://quantaura.tech' },
        { name: 'Research', url: 'https://quantaura.tech/research' },
      ]} />
      {children}
    </>
  );
}
