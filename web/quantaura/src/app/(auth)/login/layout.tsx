import type { Metadata } from 'next';

// Login pages should not be indexed — they are functional pages, not content.
// Register page deliberately has its own metadata with index: true since it
// is a conversion page that should rank for "quantaura sign up" terms.
export const metadata: Metadata = {
  title: 'Sign In — QuantAura',
  robots: { index: false, follow: false },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
