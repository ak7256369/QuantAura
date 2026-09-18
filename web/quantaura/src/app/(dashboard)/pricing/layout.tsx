import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pricing",
  description: "QuantAura plans — free market intelligence, premium AI model detail.",
  alternates: { canonical: "https://quantaura.tech/pricing" },
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
