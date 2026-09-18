import Navbar from '@/components/Layout/Navbar';

export default function LandingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="landing-root bg-[var(--bg-primary)] text-[var(--text-primary)] min-h-screen overflow-x-hidden selection:bg-primary/30 selection:text-white">
      <Navbar />
      <main>
        {children}
      </main>
    </div>
  );
}
