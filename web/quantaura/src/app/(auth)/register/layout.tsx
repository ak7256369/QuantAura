import type { Metadata } from 'next';

// /register is a conversion page — it should rank for "QuantAura sign up",
// "free crypto AI signals", etc. Explicitly allow indexing so Google promotes
// it as the entry point for new users.
export const metadata: Metadata = {
  title: 'Create Free Account — QuantAura AI Crypto Signals',
  description:
    'Sign up free for AI-powered cryptocurrency trading signals from an ensemble of LSTM, XGBoost, Transformer and KAN models. BTC, ETH, SOL and 7 more coins. No credit card required.',
  alternates: { canonical: 'https://quantaura.tech/register' },
  robots: { index: true, follow: true },
  openGraph: {
    title: 'Create Your Free QuantAura Account',
    description:
      'Get AI crypto signals — BUY, HOLD or SELL for 10 coins — from a 4-model ensemble, free. Upgrade any time for full model detail.',
    url: 'https://quantaura.tech/register',
    type: 'website',
  },
};

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return children;
}
