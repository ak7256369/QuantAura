import type { Metadata } from 'next';
import { BreadcrumbJsonLd } from '@/components/SEO/JsonLd';

export const metadata: Metadata = {
  title: 'ML Model Performance — F1 Scores',
  description:
    'Held-out test metrics for QuantAura’s LSTM, XGBoost, Transformer and KAN models: macro F1, confusion matrices, feature importance and ensemble weights.',
  alternates: { canonical: 'https://quantaura.tech/models' },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <BreadcrumbJsonLd items={[
        { name: 'Home', url: 'https://quantaura.tech' },
        { name: 'Models', url: 'https://quantaura.tech/models' },
      ]} />
      {children}
    </>
  );
}
