'use client';

import React, { useEffect, useState } from 'react';
import { motion, useScroll, useTransform, useInView, useSpring, useReducedMotion, AnimatePresence } from 'motion/react';
import { fetchAllSignals, type ModelStatsResponse } from '@/lib/api';
import useModelStats from '@/hooks/useModelStats';
import * as animations from '@/lib/animations';
import { AnimatedNumber } from '@/hooks/useAnimatedCounter';
import { BreadcrumbJsonLd, FAQJsonLd } from '@/components/SEO/JsonLd';
import { 
  ArrowRight, 
  ExternalLink, 
  ChevronDown, 
  BarChart3, 
  Zap, 
  BrainCircuit, 
  PieChart, 
  TrendingUp, 
  Activity,
  Link as LinkIcon,
  Settings,
  Brain,
  LayoutDashboard,
  Youtube,
  Send,
  Download,
  Monitor
} from 'lucide-react';
import Link from 'next/link';
import QuantAuraLogo from '@/components/Layout/QuantAuraLogo';
import { SOCIAL, X_HANDLE } from '@/lib/social';
import AmbientBackground from '@/components/Motion/AmbientBackground';

// --- Components ---

const GlassCard = ({ children, className = "" }: { children: React.ReactNode, className?: string }) => {
  const prefersReducedMotion = useReducedMotion();
  return (
    <motion.div 
      whileHover={prefersReducedMotion ? undefined : animations.cardHover}
      className={`border border-[var(--border-subtle)] rounded-2xl bg-[var(--bg-card)] backdrop-blur-xl p-5 md:p-6 shadow-[var(--shadow-card)] hover:border-primary/30 hover:shadow-[var(--shadow-glow)] transition-all duration-300 ${className}`}
    >
      {children}
    </motion.div>
  );
};

const AnimatedGradientText = ({ text, className = "" }: { text: string, className?: string }) => (
  <span className={`bg-gradient-to-r from-primary via-secondary to-primary bg-[length:200%_auto] animate-gradient-x bg-clip-text text-fill-transparent text-transparent ${className}`}>
    {text}
  </span>
);

// --- Sections ---

const Hero = ({ stats }: { stats: ModelStatsResponse | null }) => {
  const prefersReducedMotion = useReducedMotion();
  const totalCandles = stats ? (stats.total_candles_1h + stats.total_candles_4h).toLocaleString() : '—';
  const modelCount = stats ? stats.model_count : '—';
  const symbolCount = stats ? stats.symbols_count : '—';
  const ensembleF1 = stats ? `${((stats.evaluation?.test?.ensemble ?? stats.ensemble_f1) * 100).toFixed(1)}%` : '—';

  const titleWord1 = "Predict Crypto.".split(" ");
  const titleWord2 = "Before It Moves.".split(" ");

  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center pt-20 px-4 md:px-6 overflow-hidden">
      {/* Aurora background — pure CSS (replaces a 20 MB autoplay video) */}
      <div className="absolute inset-0 z-0 overflow-hidden" aria-hidden="true">
        <div className="absolute inset-0 bg-[var(--bg-primary)]" />
        <div
          className="absolute -top-1/3 left-1/2 -translate-x-1/2 w-[140%] aspect-square rounded-full opacity-60 animate-spin-slow"
          style={{
            background:
              'conic-gradient(from 90deg, transparent 0deg, rgb(var(--accent-primary-rgb) / 0.16) 60deg, rgba(139,92,246,0.14) 130deg, transparent 210deg, rgba(6,182,212,0.10) 290deg, transparent 360deg)',
            filter: 'blur(90px)',
          }}
        />
        <div className="absolute inset-0 [background-image:linear-gradient(rgba(128,128,128,0.07)_1px,transparent_1px),linear-gradient(90deg,rgba(128,128,128,0.07)_1px,transparent_1px)] [background-size:44px_44px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_40%,black_30%,transparent_100%)]" />
        <AmbientBackground variant="landing" position="absolute" />
        <div className="absolute inset-0 bg-gradient-to-b from-[var(--bg-primary)]/60 via-transparent to-[var(--bg-primary)]" />
      </div>

      {/* Animated Orbs */}
      {!prefersReducedMotion && (
        <div className="absolute inset-0 z-[1] pointer-events-none">
          <motion.div 
            animate={{ 
              x: [0, 100, 0], 
              y: [0, 50, 0],
              scale: [1, 1.2, 1]
            }}
            transition={{ duration: 17, repeat: Infinity, ease: "linear" }}
            className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-primary/20 rounded-full blur-[120px]"
          />
          <motion.div 
            animate={{ 
              x: [0, -100, 0], 
              y: [0, -50, 0],
              scale: [1, 1.3, 1]
            }}
            transition={{ duration: 23, repeat: Infinity, ease: "linear" }}
            className="absolute bottom-1/4 right-1/4 w-[600px] h-[600px] bg-secondary/10 rounded-full blur-[140px]"
          />
        </div>
      )}

      {/* Particles */}
      {!prefersReducedMotion && (
        <div className="absolute inset-0 pointer-events-none">
          {[...Array(20)].map((_, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0.1, x: `${(i * 17) % 100}%`, y: `${(i * 31) % 100}%` }}
              animate={{ 
                y: ["-10%", "110%"],
                opacity: [0, 0.5, 0]
              }}
              transition={{ 
                duration: 10 + (i % 10), 
                repeat: Infinity, 
                delay: (i * 0.5) % 5,
                ease: "linear" 
              }}
              className="absolute w-1 h-1 bg-foreground rounded-full"
            />
          ))}
        </div>
      )}

      <div className="relative z-10 text-center w-full max-w-[1200px] mx-auto flex flex-col items-center gap-6">
        <motion.div
          variants={animations.heroBadge}
          initial="hidden"
          animate="visible"
          className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/30 bg-primary/10 text-primary-hover text-xs font-medium animate-breathe"
        >
          <span className="text-primary">✦</span> AI-Powered Crypto Intelligence
        </motion.div>

        {/* aria-label: the title words render as separate inline-block spans
            spaced only by flex `gap`, so without it the accessible name would
            collapse to "PredictCrypto.BeforeItMoves." for screen readers. */}
        <motion.h1
          variants={animations.heroWordContainer}
          initial="hidden"
          animate="visible"
          aria-label="Predict Crypto. Before It Moves."
          className="text-5xl md:text-7xl font-heading font-bold tracking-tight leading-[1.08] text-[var(--text-primary)] perspective-[1000px] flex flex-wrap justify-center gap-x-4"
        >
          {titleWord1.map((word, i) => (
            <motion.span key={i} variants={animations.heroWord} className="inline-block transform-style-3d">
              {word}
            </motion.span>
          ))}
          <br className="hidden md:block" />
          <span className="flex flex-wrap justify-center gap-x-4">
             {titleWord2.map((word, i) => (
               <motion.span key={`line2-${i}`} variants={animations.heroWord} className="inline-block transform-style-3d">
                 <AnimatedGradientText text={word} />
               </motion.span>
             ))}
          </span>
        </motion.h1>

        <motion.p
          variants={animations.heroBlurIn}
          initial="hidden"
          animate="visible"
          className="text-lg md:text-xl text-[var(--text-secondary)] max-w-2xl text-center leading-relaxed"
        >
          An ensemble of four AI models — LSTM, XGBoost, Transformer and KAN — analyzes 10 major altcoins in real time and forecasts each market&apos;s 24-hour trend regime as a BUY, SELL or HOLD signal with calibrated confidence.
        </motion.p>

        <motion.div
          initial="hidden"
          animate="visible"
          className="flex flex-col sm:flex-row items-center justify-center gap-4"
        >
          <motion.div custom={0} variants={animations.heroButton} whileTap={animations.buttonTap}>
            <Link href="/dashboard" className="block">
              <button className="group relative px-8 py-4 bg-primary text-white rounded-xl font-bold transition-all hover:scale-105 shadow-[0_8px_30px_var(--accent-glow)] overflow-hidden">
                <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-500 ease-in-out skew-x-[-20deg]" />
                <span className="flex items-center gap-2">
                  Get Started <ArrowRight size={18} />
                </span>
              </button>
            </Link>
          </motion.div>
          <motion.div custom={1} variants={animations.heroButton} whileTap={animations.buttonTap}>
            <Link href="/predictions" className="block">
              <button className="px-8 py-4 bg-[var(--bg-hover)] hover:bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded-xl font-bold text-[var(--text-primary)] transition-all flex items-center gap-2 backdrop-blur-sm">
                View Predictions <ExternalLink size={18} />
              </button>
            </Link>
          </motion.div>
        </motion.div>

        <motion.div
          initial="hidden"
          animate="visible"
          className="flex flex-wrap justify-center items-center gap-8 text-[var(--text-muted)] text-sm font-medium mt-4"
        >
          <motion.span custom={0} variants={animations.heroStatItem}>Trained on {totalCandles}+ candles</motion.span>
          <motion.span custom={0.5} variants={animations.heroStatItem} className="h-4 w-px bg-[var(--border-subtle)] hidden sm:block" />
          <motion.span custom={1} variants={animations.heroStatItem}>{modelCount} ML Models</motion.span>
          <motion.span custom={1.5} variants={animations.heroStatItem} className="h-4 w-px bg-[var(--border-subtle)] hidden sm:block" />
          <motion.span custom={2} variants={animations.heroStatItem}>{symbolCount} Altcoins</motion.span>
          <motion.span custom={2.5} variants={animations.heroStatItem} className="h-4 w-px bg-[var(--border-subtle)] hidden sm:block" />
          <motion.span custom={3} variants={animations.heroStatItem} className="text-emerald-500 font-bold"
            title="Macro-F1 at classifying the 24h trend regime on held-out data — not a trade win rate">
            {ensembleF1} Regime F1{' '}
            <span className="font-normal text-[var(--text-muted)]">· not a win rate</span>
          </motion.span>
        </motion.div>
      </div>

      {!prefersReducedMotion && (
        <motion.div 
          animate={{ y: [0, 12, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          className="absolute bottom-10 left-1/2 -translate-x-1/2 text-[var(--text-secondary)]"
        >
          <ChevronDown size={32} />
        </motion.div>
      )}
    </section>
  );
};

const BentoGrid = () => {
  const containerRef = React.useRef(null);
  const isInView = useInView(containerRef, { once: true, margin: "-100px" });

  const cards = [
    {
      title: "Real-Time Market Data",
      description: "Live candlestick data streamed directly from Binance with sub-second latency.",
      className: "",
      icon: <BarChart3 className="text-primary" />,
      content: (
        <div className="mt-4 h-32 w-full relative overflow-hidden rounded-lg bg-[var(--bg-input)] p-4 border border-[var(--border-subtle)]">
          <div className="flex items-end gap-1 h-full w-full">
            {[...Array(24)].map((_, i) => (
              <motion.div
                key={i}
                initial={{ height: "20%" }}
                animate={{ height: [`${20 + (i * 7) % 60}%`, `${20 + (i * 13) % 70}%`, `${20 + (i * 7) % 60}%`] }}
                transition={{ duration: 2, repeat: Infinity, delay: i * 0.05 }}
                className={`w-full rounded-t-sm ${i % 3 === 0 ? 'bg-red-500/50' : 'bg-emerald-500/50'}`}
              />
            ))}
          </div>
          <div className="absolute top-2 left-2 flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
            <span className="text-[10px] font-mono text-[var(--text-muted)] uppercase tracking-widest">Live Stream</span>
          </div>
        </div>
      )
    },
    {
      title: "AI Signal Engine",
      description: "Real-time Buy/Sell/Hold signals with confidence scores.",
      className: "",
      icon: <Zap className="text-secondary" />,
      content: (
        <div className="mt-8 flex flex-col items-center justify-center gap-6">
          <motion.div 
            animate={{ 
              backgroundColor: ["rgba(16,185,129,0.1)", "rgba(16,185,129,0.2)", "rgba(16,185,129,0.1)"],
              borderColor: ["rgba(16,185,129,0.2)", "rgba(16,185,129,0.5)", "rgba(16,185,129,0.2)"]
            }}
            transition={{ duration: 2, repeat: Infinity }}
            className="w-24 h-24 rounded-full border flex items-center justify-center shadow-[0_0_30px_rgba(16,185,129,0.2)]"
          >
            <span className="text-emerald-500 font-bold text-xl">BUY</span>
          </motion.div>
          <div className="w-full space-y-2 px-4">
            <div className="flex justify-between text-xs text-[var(--text-muted)]">
              <span>Confidence</span>
              <span className="text-[var(--text-primary)]">92%</span>
            </div>
            <div className="h-1.5 w-full bg-[var(--bg-input)] rounded-full overflow-hidden origin-left">
              <motion.div 
                initial={{ scaleX: 0 }}
                animate={isInView ? { scaleX: 0.92 } : {}}
                transition={{ duration: 1, delay: 0.5, ease: animations.easeOutQuart as any }}
                className="h-full bg-emerald-500 origin-left" 
              />
            </div>
          </div>
        </div>
      )
    },
    {
      title: "Ensemble ML Models",
      description: "Four diverse architectures voting for maximum reliability.",
      className: "",
      icon: <BrainCircuit className="text-primary-hover" />,
      content: (
        <div className="mt-6 space-y-3">
          {['LSTM', 'XGBoost', 'Transformer', 'KAN'].map((model, i) => (
            <div key={model} className="flex items-center gap-3">
              <span className="text-[10px] font-mono w-16 text-[var(--text-muted)]">{model}</span>
              <div className="flex-1 h-1 bg-[var(--bg-input)] rounded-full overflow-hidden origin-left">
                <motion.div 
                  initial={{ scaleX: 0 }}
                  animate={isInView ? { scaleX: [0.90, 0.95, 0.94, 0.97][i] } : {}}
                  transition={{ duration: 1, delay: 0.5 + i * 0.1, ease: animations.easeOutQuart as any }}
                  className="h-full bg-primary origin-left" 
                />
              </div>
            </div>
          ))}
        </div>
      )
    },
    {
      title: "Smart Weights",
      description: "Dynamic calibration based on backtest performance.",
      className: "",
      icon: <PieChart className="text-secondary" />,
      content: (
        <div className="mt-4 flex justify-center">
          <div className="relative w-24 h-24">
            <svg viewBox="0 0 36 36" className="w-full h-full transform -rotate-90">
              <circle cx="18" cy="18" r="16" fill="none" className="stroke-[var(--border-subtle)]" strokeWidth="3" />
              <motion.circle 
                cx="18" cy="18" r="16" fill="none" className="stroke-primary" strokeWidth="3" 
                strokeDasharray="100 100"
                initial={{ strokeDashoffset: 100 }}
                animate={isInView ? { strokeDashoffset: 33 } : {}}
                transition={{ duration: 1.5, ease: "easeOut" }}
              />
              <motion.circle 
                cx="18" cy="18" r="16" fill="none" className="stroke-secondary" strokeWidth="3" 
                strokeDasharray="100 100"
                initial={{ strokeDashoffset: 100 }}
                animate={isInView ? { strokeDashoffset: 66 } : {}}
                transition={{ duration: 1.5, ease: "easeOut", delay: 0.2 }}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
               <Settings size={14} className="text-[var(--text-muted)] animate-spin-slow" />
            </div>
          </div>
        </div>
      )
    },
    {
      title: "Sentiment Analysis",
      description: "Analyzing news and social trends with NLP.",
      className: "",
      icon: <TrendingUp className="text-emerald-500" />,
      content: (
        <div className="mt-6 space-y-4">
           <div className="flex items-center justify-between">
              <span className="text-[10px] text-[var(--text-muted)] px-2 py-0.5 rounded bg-[var(--bg-input)]">NEWS</span>
              <span className="text-[10px] text-emerald-500 font-bold">BULLISH</span>
           </div>
           <div className="flex items-center justify-between opacity-50">
              <span className="text-[10px] text-[var(--text-muted)] px-2 py-0.5 rounded bg-[var(--bg-input)]">SOCIAL</span>
              <span className="text-[10px] text-emerald-500 font-bold">BULLISH</span>
           </div>
        </div>
      )
    },
    {
      title: "10 Altcoins Covered",
      description: "Specialized models for the most traded assets.",
      className: "",
      icon: <Activity className="text-primary" />,
      content: (
        <div className="mt-4 grid grid-cols-3 gap-2">
          {['BTC', 'ETH', 'SOL', 'BNB', 'ADA', 'XRP', 'DOT', 'AVAX', 'LINK', 'DOGE'].map((coin, i) => (
            <motion.div 
              key={coin}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={isInView ? { opacity: 1, scale: 1 } : {}}
              transition={{ delay: i * 0.05 }}
              className="text-[10px] font-bold p-1 bg-[var(--bg-input)] rounded border border-[var(--border-subtle)] text-center text-[var(--text-secondary)]"
            >
              {coin}
            </motion.div>
          ))}
        </div>
      )
    }
  ];

  return (
    <section id="features" ref={containerRef} className="py-24 px-6 max-w-7xl mx-auto">
      <div className="text-center mb-16">
        <motion.h2 
          variants={animations.sectionHeading}
          initial="hidden"
          animate={isInView ? "visible" : "hidden"}
          className="text-4xl md:text-5xl font-heading font-bold mb-4 text-[var(--text-primary)]"
        >
          Everything you need to trade smarter
        </motion.h2>
        <motion.p 
          variants={animations.sectionSubheading}
          initial="hidden"
          animate={isInView ? "visible" : "hidden"}
          className="text-[var(--text-secondary)] max-w-2xl mx-auto"
        >
          Institutional-grade infrastructure, simplified for everyone. Powered by high-frequency data and state-of-the-art AI.
        </motion.p>
      </div>

      <motion.div 
        variants={animations.bentoContainer}
        initial="hidden"
        animate={isInView ? "visible" : "hidden"}
        className="grid grid-cols-1 md:grid-cols-2 gap-8"
      >
        {cards.map((card, i) => (
          <motion.div key={i} variants={animations.bentoCard} className={card.className}>
            <GlassCard className="h-full p-8 flex flex-col group hover:border-primary/30 transition-colors">
              <div className="w-10 h-10 rounded-lg bg-[var(--bg-input)] flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                {card.icon}
              </div>
              <h3 className="text-xl font-bold mb-2 text-[var(--text-primary)]">{card.title}</h3>
              <p className="text-sm text-[var(--text-secondary)] mb-4">{card.description}</p>
              <motion.div variants={animations.bentoCardContent} className="mt-auto">
                {card.content}
              </motion.div>
            </GlassCard>
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
};

const HowItWorks = () => {
  const ref = React.useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  const steps = [
    {
      title: "Data Collection",
      desc: "Live 1h + 4h candles from Binance for 10 altcoins, plus funding, macro and sentiment series",
      icon: <LinkIcon size={24} className="text-primary" />
    },
    {
      title: "Feature Engineering",
      desc: "90+ leak-free, scale-free features — RSI, MACD, Bollinger, flow ratios, FRED macro and more",
      icon: <Settings size={24} className="text-secondary" />
    },
    {
      title: "Ensemble Prediction",
      desc: "LSTM, XGBoost, Transformer and KAN vote with weights calibrated on validation F1",
      icon: <Brain size={24} className="text-primary-hover" />
    },
    {
      title: "Signal Generation",
      desc: "24h trend outlook — BUY / SELL / HOLD with confidence %, gated for precision",
      icon: <LayoutDashboard size={24} className="text-emerald-500" />
    }
  ];

  return (
    <section id="how-it-works" ref={ref} className="py-16 md:py-24 px-4 md:px-6 bg-[var(--bg-secondary)]">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-20">
          <motion.h2 
            variants={animations.sectionHeading}
            initial="hidden"
            animate={isInView ? "visible" : "hidden"}
            className="text-4xl font-heading font-bold mb-4 text-[var(--text-primary)]"
          >
            How QuantAura Works
          </motion.h2>
          <motion.p 
            variants={animations.sectionSubheading}
            initial="hidden"
            animate={isInView ? "visible" : "hidden"}
            className="text-[var(--text-secondary)]"
          >
            The lifecycle of a trade signal, from raw data to actionable intelligence.
          </motion.p>
        </div>

        <div className="relative">
          {/* Connector Line */}
          <div className="absolute top-1/2 left-0 w-full h-0.5 bg-[var(--border-card)] -translate-y-1/2 hidden md:block" />
          <motion.div 
            variants={animations.stepConnector}
            initial="hidden"
            animate={isInView ? "visible" : "hidden"}
            className="absolute top-1/2 left-0 w-full h-0.5 bg-gradient-to-r from-primary via-secondary to-emerald-500 -translate-y-1/2 hidden md:block origin-left" 
          />

          <motion.div 
            variants={animations.stepContainer}
            initial="hidden"
            animate={isInView ? "visible" : "hidden"}
            className="grid grid-cols-1 md:grid-cols-4 gap-12"
          >
            {steps.map((step, i) => (
              <motion.div key={i} variants={animations.stepCard} className="relative z-10 h-full">
                <GlassCard className="h-full flex flex-col items-center text-center group">
                  <div className="absolute -top-4 -right-4 w-8 h-8 rounded-full bg-[var(--bg-input)] border border-[var(--border-subtle)] flex items-center justify-center text-xs font-bold text-[var(--text-muted)] group-hover:text-primary transition-colors">
                    <AnimatedNumber target={i + 1} />
                  </div>
                  <motion.div 
                    whileHover={{ rotate: 15, scale: 1.1, transition: { type: "spring", stiffness: 300 } }}
                    className="w-16 h-16 rounded-full bg-[var(--bg-primary)] border border-[var(--border-subtle)] flex items-center justify-center mb-6 shadow-md shrink-0 cursor-pointer"
                  >
                    {step.icon}
                  </motion.div>
                  <h3 className="text-lg font-bold mb-2 text-[var(--text-primary)]">{step.title}</h3>
                  <p className="text-sm text-[var(--text-secondary)]">{step.desc}</p>
                </GlassCard>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </div>
    </section>
  );
};

const ModelStats = ({ apiStats }: { apiStats: ModelStatsResponse | null }) => {
  const ref = React.useRef(null);
  const isInView = useInView(ref, { once: true });

  const totalFeatures = apiStats
    ? apiStats.config.lstm_features + apiStats.config.transformer_features + apiStats.config.kan_features
    : 73;
  const totalCandles = apiStats
    ? (apiStats.total_candles_1h + apiStats.total_candles_4h).toLocaleString()
    : '—';
  const ensembleF1 = apiStats ? ((apiStats.evaluation?.test?.ensemble ?? apiStats.ensemble_f1) * 100).toFixed(1) : '—';

  const stats = [
    { label: "Regime F1 (held-out)", value: ensembleF1, suffix: "%" },
    { label: "Training Candles", value: totalCandles, suffix: "+" },
    { label: "Engineered Features", value: String(totalFeatures), suffix: "" },
    { label: "ML Architectures", value: apiStats ? String(apiStats.model_count) : "4", suffix: "" }
  ];

  const lstmF1 = apiStats?.models?.lstm ? `${(apiStats.models.lstm.f1_macro * 100).toFixed(1)}%` : '—';
  const xgbF1 = apiStats?.models?.xgboost ? `${(apiStats.models.xgboost.f1_macro * 100).toFixed(1)}%` : '—';
  const transF1 = apiStats?.models?.transformer ? `${(apiStats.models.transformer.f1_macro * 100).toFixed(1)}%` : '—';
  const kanF1 = apiStats?.models?.kan ? `${(apiStats.models.kan.f1_macro * 100).toFixed(1)}%` : '—';

  const models = [
    { name: "LSTM", desc: `Sequential pattern recognition · ${lstmF1} F1 · Bidirectional architecture`, color: "border-primary" },
    { name: "XGBoost", desc: `Gradient boosting · ${xgbF1} F1 · ${apiStats?.config?.xgb_estimators || 300} estimators`, color: "border-secondary" },
    { name: "Transformer", desc: `Self-attention mechanism · ${transF1} F1 · 3 encoder layers`, color: "border-emerald-500" },
    { name: "KAN", desc: `Kolmogorov-Arnold Network · ${kanF1} F1 · Symbolic macro analysis`, color: "border-pink-500" }
  ];

  return (
    <section id="models" ref={ref} className="py-16 md:py-24 px-4 md:px-6 relative overflow-hidden bg-[var(--bg-primary)]">
       <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E")' }} />
       <div className="absolute inset-0 [background-image:linear-gradient(rgba(128,128,128,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(128,128,128,0.1)_1px,transparent_1px)] [background-size:40px_40px] pointer-events-none" />

       <div className="max-w-7xl mx-auto relative z-10">
          <div className="text-center mb-16">
            <motion.h2 variants={animations.sectionHeading} initial="hidden" animate={isInView ? "visible" : "hidden"} className="text-4xl font-heading font-bold mb-4 text-[var(--text-primary)]">Backed by serious ML research</motion.h2>
            <motion.p variants={animations.sectionSubheading} initial="hidden" animate={isInView ? "visible" : "hidden"} className="text-[var(--text-secondary)]">Our ensemble methodology reduces variance and improves prediction stability.</motion.p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-16">
            {stats.map((stat, i) => (
              <motion.div key={i} custom={i} variants={animations.modelStatCard} initial="hidden" animate={isInView ? "visible" : "hidden"} className={`relative border border-[var(--border-subtle)] rounded-2xl bg-[var(--bg-card)] backdrop-blur-xl p-6 shadow-[var(--shadow-card)] transition-all duration-300 h-40 flex flex-col justify-between overflow-hidden`}>
                <motion.div 
                  variants={animations.modelBorderDraw}
                  className={`absolute top-0 left-0 w-full h-[3px] origin-left ${i===0 ? 'bg-emerald-500' : i===1 ? 'bg-primary' : i===2 ? 'bg-secondary' : 'bg-pink-500'}`}
                />
                <div className="text-5xl font-bold text-[var(--text-primary)] tabular-nums">
                   <AnimatedNumber 
                      target={parseFloat(stat.value.replace(/,/g, '')) || 0} 
                      duration={2.5} 
                      suffix={stat.suffix} 
                      formatCommas={true} 
                      decimals={stat.label.includes('F1') ? 1 : 0} 
                   />
                </div>
                <div className="text-xs text-[var(--text-muted)] font-bold uppercase tracking-wider">{stat.label}</div>
              </motion.div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
             {models.map((model, i) => (
               <motion.div key={i} custom={i} variants={animations.modelCard} initial="hidden" animate={isInView ? "visible" : "hidden"}>
                 <GlassCard className={`p-8 border-t-4 ${model.color} hover:shadow-[var(--shadow-glow)] transition-shadow h-full flex flex-col`}>
                    <h4 className="text-2xl font-bold mb-4">{model.name}</h4>
                    <p className="text-[var(--text-muted)] text-sm leading-relaxed mt-auto">{model.desc}</p>
                 </GlassCard>
               </motion.div>
             ))}
          </div>
       </div>
    </section>
  );
};

const COIN_NAMES: Record<string, string> = {
  BTCUSDT: 'Bitcoin', ETHUSDT: 'Ethereum', BNBUSDT: 'Binance Coin', SOLUSDT: 'Solana',
  XRPUSDT: 'Ripple', ADAUSDT: 'Cardano', AVAXUSDT: 'Avalanche', DOTUSDT: 'Polkadot',
  LINKUSDT: 'Chainlink', DOGEUSDT: 'Dogecoin',
};

const signalColor = (signal: string) =>
  signal === 'BUY' ? 'text-emerald-500' : signal === 'SELL' ? 'text-red-500' : 'text-amber-500';

const SignalPreview = () => {
  // Illustrative placeholders shown until real signals load (tagged "Preview")
  const fallbackCoins = [
    { name: 'Bitcoin', symbol: 'BTC', signal: 'BUY', conf: '—', color: 'text-emerald-500' },
    { name: 'Ethereum', symbol: 'ETH', signal: 'BUY', conf: '—', color: 'text-emerald-500' },
    { name: 'Solana', symbol: 'SOL', signal: 'HOLD', conf: '—', color: 'text-amber-500' },
    { name: 'Binance Coin', symbol: 'BNB', signal: 'BUY', conf: '—', color: 'text-emerald-500' },
    { name: 'Ripple', symbol: 'XRP', signal: 'SELL', conf: '—', color: 'text-red-500' },
    { name: 'Cardano', symbol: 'ADA', signal: 'HOLD', conf: '—', color: 'text-amber-500' },
    { name: 'Polkadot', symbol: 'DOT', signal: 'BUY', conf: '—', color: 'text-emerald-500' },
    { name: 'Avalanche', symbol: 'AVAX', signal: 'BUY', conf: '—', color: 'text-emerald-500' },
    { name: 'Chainlink', symbol: 'LINK', signal: 'SELL', conf: '—', color: 'text-red-500' },
  ];
  const [coins, setCoins] = useState(fallbackCoins);
  const [isLive, setIsLive] = useState(false);

  useEffect(() => {
    fetchAllSignals(Object.keys(COIN_NAMES)).then((signals) => {
      const mapped = (signals as { symbol?: string; signal?: string; confidence?: number }[])
        .filter(s => s?.symbol && s?.signal)
        .map(s => ({
          name: COIN_NAMES[s.symbol!] ?? s.symbol!,
          symbol: s.symbol!.replace('USDT', ''),
          signal: s.signal!,
          conf: s.confidence != null ? `${Math.round(s.confidence)}%` : '—',
          color: signalColor(s.signal!),
        }));
      if (mapped.length >= 4) { setCoins(mapped); setIsLive(true); }
    }).catch(() => {});
  }, []);

  return (
    <section id="signals" className="py-16 md:py-24 overflow-hidden bg-[var(--bg-secondary)]">
      <div className="max-w-7xl mx-auto px-4 md:px-6 mb-12 flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h2 className="text-4xl font-heading font-bold mb-4 text-[var(--text-primary)]">
            {isLive ? 'Live Predictions. Right Now.' : 'Signal Preview'}
          </h2>
          <p className="text-[var(--text-secondary)]">
            {isLive
              ? 'What QuantAura is predicting for the next 24 hours, refreshed continuously'
              : 'Example of the 24h trend signals the dashboard delivers — connect the backend for live data'}
          </p>
        </div>
        <Link href="/dashboard">
          <button className="px-6 py-3 bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] border border-[var(--border-subtle)] rounded-xl font-bold transition-all flex items-center gap-2 text-[var(--text-primary)]">
            Open Full Dashboard <ArrowRight size={18} />
          </button>
        </Link>
      </div>

      <div className="flex gap-4 animate-marquee hover:[animation-play-state:paused] px-4 md:px-6">
        {[...coins, ...coins].map((coin, i) => (
          <motion.div 
            whileHover={{ scale: 1.05, y: -4, transition: { type: "spring", stiffness: 300 } }}
            key={i} 
            className={`min-w-[192px] w-48 h-32 p-4 flex flex-col justify-between border border-[var(--border-subtle)] rounded-xl bg-[var(--bg-card)] shadow-[var(--shadow-card)] shrink-0 ${coin.signal === 'BUY' ? 'border-l-4 border-l-emerald-400 shadow-emerald-500/10' : coin.signal === 'SELL' ? 'border-l-4 border-l-red-400 shadow-red-500/10' : 'border-l-4 border-l-amber-400 shadow-amber-500/10'}`}
          >
             <div className="flex items-center justify-between">
                <span className="font-bold text-[var(--text-primary)] truncate max-w-[100px]">{coin.name}</span>
                <motion.div 
                  animate={animations.signalBadgeGlow(
                    coin.signal === 'BUY' ? 'rgba(16,185,129,0.3)' : 
                    coin.signal === 'SELL' ? 'rgba(248,113,113,0.3)' : 'rgba(251,191,36,0.3)'
                  )}
                  className={`px-2 py-0.5 rounded-md bg-[var(--bg-input)] border border-[var(--border-subtle)] text-[10px] font-bold ${coin.color}`}
                >
                   {coin.signal}
                </motion.div>
             </div>
             <div className="flex items-end justify-between mt-auto">
                <div>
                   <div className="text-xs text-[var(--text-muted)] font-mono mb-1">{coin.symbol}/USDT</div>
                   <div className="flex items-center gap-1.5 text-xs">
                      <TrendingUp size={12} className={coin.color} />
                      <span className="text-[var(--text-secondary)]">{isLive ? 'Live · 24h outlook' : 'Preview'}</span>
                   </div>
                </div>
                <div className="text-right">
                   <div className="text-[10px] text-[var(--text-muted)]">Confidence</div>
                   <div className="text-lg font-bold text-[var(--text-primary)]">{coin.conf}</div>
                </div>
             </div>
          </motion.div>
        ))}
      </div>

    </section>
  );
};

const TechStack = () => {
  const techs = ["Python", "TensorFlow", "PyTorch", "XGBoost", "Next.js", "Binance API", "Flask", "React"];
  const ref = React.useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });
  
  return (
    <section ref={ref} className="py-16 md:py-24 px-4 md:px-6 max-w-7xl mx-auto text-center bg-[var(--bg-primary)]">
      <h2 className="text-2xl font-heading font-bold mb-12 text-[var(--text-muted)] uppercase tracking-widest">Built with cutting-edge technology</h2>
      <motion.div 
        variants={animations.techContainer}
        initial="hidden"
        animate={isInView ? "visible" : "hidden"}
        className="flex flex-wrap justify-center gap-4"
      >
         {techs.map((tech, i) => (
           <motion.div key={tech} variants={animations.techItem}>
             <GlassCard className="p-4 px-6 md:px-8 flex items-center justify-center grayscale opacity-80 hover:grayscale-0 hover:opacity-100 group transition-all">
               <span className="text-xl font-bold text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors cursor-default">{tech}</span>
             </GlassCard>
           </motion.div>
         ))}
      </motion.div>
    </section>
  );
};

/** lucide-react still ships the pre-rebrand bird as `Twitter`, so the current
 *  X mark is inlined. currentColor keeps it correct in both themes. */
const XLogo = ({ size = 16, ...props }: { size?: number } & React.SVGProps<SVGSVGElement>) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" {...props}>
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

const DesktopWidget = () => {
  return (
    <section className="py-24 px-4 md:px-6">
      <div className="max-w-5xl mx-auto">
        <GlassCard className="!p-8 md:!p-12">
          <div className="flex flex-col gap-5">
            <div className="inline-flex items-center gap-2 self-start px-3 py-1 rounded-full border border-primary/30 bg-primary/10 text-primary-hover text-xs font-medium">
              <Monitor size={14} aria-hidden /> Desktop Widget
            </div>
            <h2 className="text-3xl md:text-4xl font-heading font-bold text-[var(--text-primary)] max-w-2xl">
              Every model call, live on your desktop
            </h2>
            <p className="text-[var(--text-secondary)] leading-relaxed max-w-2xl">
              A small always-on-top window showing the ensemble&apos;s current BUY / HOLD / SELL
              call, live price and a 24-hour sparkline for any of the 10 tracked coins — refreshed
              every minute. Lives in your system tray; no browser tab required.
            </p>
            <div className="flex flex-wrap items-center gap-4 pt-2">
              <a
                href="/download/widget"
                className="group inline-flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-xl font-bold transition-all hover:scale-105 shadow-[0_8px_30px_var(--accent-glow)]"
              >
                <Download size={18} aria-hidden /> Download for Windows
              </a>
              <span className="text-[var(--text-muted)] text-xs">Free · Windows 10/11</span>
            </div>
          </div>
        </GlassCard>
      </div>
    </section>
  );
};

const Footer = () => {
  return (
    <footer className="py-20 px-4 md:px-6 border-t border-[var(--border-subtle)] bg-[var(--bg-secondary)]">
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-12 mb-16">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
             <QuantAuraLogo size={40} />
             <span className="text-2xl font-heading font-bold text-[var(--text-primary)]">QuantAura</span>
          </div>
          <p className="text-[var(--text-muted)] text-sm max-w-xs">AI-Powered Crypto Intelligence for the next generation of traders.</p>
        </div>
        <div className="grid grid-cols-2 gap-8">
           <div className="flex flex-col gap-4">
              <span className="text-[var(--text-primary)] font-bold text-sm">Platform</span>
              <Link href="/dashboard" className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-sm transition-colors">Dashboard</Link>
              <Link href="/predictions" className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-sm transition-colors">Predictions</Link>
              <a href="/download/widget" className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-sm transition-colors">Desktop Widget</a>
           </div>
           <div className="flex flex-col gap-4">
              <span className="text-[var(--text-primary)] font-bold text-sm">Resources</span>
              <Link href="/models" className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-sm transition-colors">Models</Link>
              <Link href="/backtest" className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-sm transition-colors">Backtest</Link>
              <Link href="/blog" className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-sm transition-colors">Research Blog</Link>
              <Link href="/portfolio" className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-sm transition-colors">Paper Portfolio</Link>
           </div>
        </div>
        {/* Every call the model makes goes out on all three of these. The site is
            the hub, so it is the one surface that must link to all of them. */}
        <div className="flex flex-col gap-4 md:items-end">
           <span className="text-[var(--text-primary)] font-bold text-sm">Follow the model</span>
           <a href={SOCIAL.youtube} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-sm transition-colors">
              <Youtube size={18} color="#FF0000" aria-hidden />
              Daily call on YouTube
           </a>
           <a href={SOCIAL.x} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-sm transition-colors">
              <XLogo size={16} aria-hidden />
              {X_HANDLE} on X
           </a>
           <a href={SOCIAL.telegramChannel} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-sm transition-colors">
              <Send size={18} color="#229ED9" aria-hidden />
              Free Telegram channel
           </a>
           <a href={SOCIAL.telegramBot} target="_blank" rel="noopener noreferrer" className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-xs transition-colors">
              Premium alerts bot →
           </a>
        </div>
      </div>
      <div className="max-w-7xl mx-auto pt-8 border-t border-[var(--border-subtle)] text-[var(--text-muted)] text-xs leading-relaxed">
         <p className="mb-6 max-w-4xl">
            <span className="font-bold text-[var(--text-secondary)]">Disclaimer:</span>{' '}
            Signals, confidence scores and backtests are statistical outputs of machine-learning models
            predicting 24-hour trend regimes. They are research data provided for information and
            education, not financial, investment or trading advice — a Premium subscription buys access
            to the full model output, not a recommendation to trade on it and no promise of profit. Our
            own published measurements show these signals have historically not been profitable to trade
            after fees. Cryptocurrency trading involves substantial risk of loss; past or simulated
            performance does not guarantee future results.
         </p>
         <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <p>© 2026 QuantAura. All rights reserved.</p>
            <div className="flex gap-8">
               <Link href="/privacy" className="hover:text-[var(--text-primary)] transition-colors">Privacy Policy</Link>
               <Link href="/terms" className="hover:text-[var(--text-primary)] transition-colors">Terms of Service</Link>
            </div>
         </div>
      </div>
    </footer>
  );
};

export default function LandingPage() {
  // Live: picks up newly deployed models without a manual reload
  const { data: stats } = useModelStats();
  const prefersReducedMotion = useReducedMotion();

  return (
    <AnimatePresence>
      <motion.div 
        variants={animations.pageEntrance}
        initial="hidden"
        animate="visible"
        className="bg-[var(--bg-primary)] text-[var(--text-primary)] selection:bg-primary/30 min-h-screen"
      >
        <BreadcrumbJsonLd items={[
          { name: 'Home', url: 'https://quantaura.tech' },
        ]} />
        <FAQJsonLd faqs={[
          { question: 'What is QuantAura?', answer: 'QuantAura is an AI-powered cryptocurrency research platform. An ensemble of four models (LSTM, XGBoost, Transformer, KAN) forecasts each market\'s 24-hour trend regime, and every prediction is published with its measured accuracy and after-cost expectancy so you can judge it for yourself.' },
          { question: 'How does QuantAura predict crypto prices?', answer: 'QuantAura uses an ensemble of 4 ML models — LSTM for sequential patterns, XGBoost for gradient boosting, Transformer for self-attention, and KAN for symbolic regression — that vote with calibrated weights to generate BUY/SELL/HOLD signals.' },
          { question: 'Which cryptocurrencies does QuantAura support?', answer: 'QuantAura supports 10 top altcoins: Bitcoin (BTC), Ethereum (ETH), Solana (SOL), BNB, Cardano (ADA), XRP, Polkadot (DOT), Avalanche (AVAX), Chainlink (LINK), and Dogecoin (DOGE).' },
          { question: 'How accurate are QuantAura predictions?', answer: 'On held-out data the ensemble scores about 81% macro-F1 at classifying the 24-hour trend regime. That is not a trade win rate: directional accuracy on issued signals is about 52% versus a 50% coin flip, and after typical 0.30% round-trip costs the average BUY signal does not clear its own fees. Both figures, and the per-signal expectancy, are published on the Predictions page. Signals are research inputs, not financial advice.' },
          { question: 'Is QuantAura free to use?', answer: 'Yes, QuantAura is currently free to use. You can access the dashboard, live predictions, model performance analytics, and backtesting features at no cost.' },
        ]} />
        <Hero stats={stats} />
        <BentoGrid />
        <HowItWorks />
        <ModelStats apiStats={stats} />
        <SignalPreview />
        <TechStack />
        <DesktopWidget />
        <Footer />
      </motion.div>
    </AnimatePresence>
  );
}


