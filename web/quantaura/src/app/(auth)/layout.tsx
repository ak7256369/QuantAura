import type { Metadata } from "next";
import Link from "next/link";
import PageAmbient from "@/components/Motion/PageAmbient";
import QuantAuraLogo from "@/components/Layout/QuantAuraLogo";

export const metadata: Metadata = {};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PageAmbient />
      <main className="auth-shell">
        <Link href="/" className="auth-brand">
          <QuantAuraLogo size={40} />
          <div>
            <div className="navbar-title">QuantAura</div>
            <div className="navbar-subtitle">AI Crypto Intelligence</div>
          </div>
        </Link>
        {children}
      </main>
    </>
  );
}
