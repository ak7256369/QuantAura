'use client';

import Link from 'next/link';
import { motion } from 'motion/react';
import { Home, ArrowLeft } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)] text-[var(--text-primary)] px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center max-w-md"
      >
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.1, duration: 0.4 }}
          className="text-8xl font-bold bg-gradient-to-r from-primary via-secondary to-primary bg-clip-text text-transparent mb-4"
        >
          404
        </motion.div>

        <h1 className="text-2xl font-heading font-bold mb-3 text-[var(--text-primary)]">
          Page Not Found
        </h1>
        <p className="text-[var(--text-secondary)] mb-8">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/"
            className="flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-xl font-bold transition-all hover:scale-105 shadow-[0_0_20px_rgb(var(--accent-primary-rgb)/0.3)]"
          >
            <Home size={18} />
            Go Home
          </Link>
          <Link
            href="/dashboard"
            className="flex items-center gap-2 px-6 py-3 bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-xl font-bold text-[var(--text-primary)] transition-all hover:bg-[var(--bg-hover)]"
          >
            <ArrowLeft size={18} />
            Dashboard
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
