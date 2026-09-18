import type { Metadata } from 'next';
import { BreadcrumbJsonLd } from '@/components/SEO/JsonLd';

// Every dashboard route previously shared one title ("Dashboard | QuantAura")
// from the group layout — search results could not tell the pages apart. Each
// route now carries its own title (<60 chars), description (<155 chars),
// canonical and breadcrumb via a metadata-only nested layout.
export const metadata: Metadata = {
  title: 'Live Crypto Dashboard',
  description:
    'Real-time crypto dashboard: live candlestick charts, AI trend signals with confidence scores, news and market intelligence for 10 major coins.',
  alternates: { canonical: 'https://quantaura.tech/dashboard' },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <BreadcrumbJsonLd items={[
        { name: 'Home', url: 'https://quantaura.tech' },
        { name: 'Dashboard', url: 'https://quantaura.tech/dashboard' },
      ]} />
      {children}
    </>
  );
}
