import type { Metadata } from "next";
import Navbar from "@/components/Layout/Navbar";
import Disclaimer from "@/components/Layout/Disclaimer";
import PageAmbient from "@/components/Motion/PageAmbient";

// Title, description, canonical and breadcrumb live in each route's own
// nested layout — a single shared title here made every dashboard page
// indistinguishable in search results.
export const metadata: Metadata = {
  robots: {
    index: true,
    follow: true,
  },
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Navbar />
      <PageAmbient />
      <main className="main-content">
        {children}
        <Disclaimer />
      </main>
    </>
  );
}

