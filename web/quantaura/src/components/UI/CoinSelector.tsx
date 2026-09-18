'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown, Check } from 'lucide-react';

export const COINS_DATA = [
  { symbol: "BTC", name: "Bitcoin", color: "#F7931A" },
  { symbol: "ETH", name: "Ethereum", color: "#627EEA" },
  { symbol: "BNB", name: "Binance Coin", color: "#F3BA2F" },
  { symbol: "SOL", name: "Solana", color: "#9945FF" },
  { symbol: "XRP", name: "Ripple", color: "#00AAE4" },
  { symbol: "ADA", name: "Cardano", color: "#0033AD" },
  { symbol: "DOGE", name: "Dogecoin", color: "#C2A633" },
  { symbol: "AVAX", name: "Avalanche", color: "#E84142" },
  { symbol: "DOT", name: "Polkadot", color: "#E6007A" },
  { symbol: "LINK", name: "Chainlink", color: "#2A5ADA" },
];

interface CoinSelectorProps {
  value: string;
  onChange: (symbol: string) => void;
  className?: string;
}

export default function CoinSelector({ value, onChange, className = '' }: CoinSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedCoin = COINS_DATA.find(c => c.symbol === value) || COINS_DATA[0];

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        setIsOpen(true);
        setFocusedIndex(COINS_DATA.findIndex(c => c.symbol === value));
      }
      return;
    }

    if (e.key === 'Escape') {
      setIsOpen(false);
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIndex(prev => (prev < COINS_DATA.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIndex(prev => (prev > 0 ? prev - 1 : COINS_DATA.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (focusedIndex >= 0) {
        onChange(COINS_DATA[focusedIndex].symbol);
        setIsOpen(false);
      }
    }
  };

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        className="flex items-center justify-between w-full min-w-0 px-3 py-2.5 bg-[var(--bg-card-solid)] backdrop-blur-xl border border-[var(--border-card)] rounded-xl text-[var(--text-primary)] font-medium hover:border-[var(--border-glow)] hover:bg-[var(--bg-hover)] transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
      >
        <div className="flex items-center gap-2 overflow-hidden mr-2">
          <div 
            className="w-2.5 h-2.5 rounded-full flex-shrink-0" 
            style={{ backgroundColor: selectedCoin.color }}
          />
          <span className="truncate">{selectedCoin.symbol}</span>
        </div>
        <ChevronDown 
          size={16} 
          className={`text-[var(--text-muted)] flex-shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute top-full left-0 z-50 min-w-full w-max mt-2 p-2 bg-[var(--bg-card-solid)] backdrop-blur-2xl border border-[var(--border-card)] rounded-2xl shadow-[var(--shadow-elevated)] max-h-64 overflow-y-auto styled-scrollbar"
          >
            {COINS_DATA.map((coin, idx) => {
              const isSelected = coin.symbol === value;
              const isFocused = idx === focusedIndex;

              return (
                <button
                  key={coin.symbol}
                  type="button"
                  onClick={() => {
                    onChange(coin.symbol);
                    setIsOpen(false);
                  }}
                  onMouseEnter={() => setFocusedIndex(idx)}
                  className={`w-full text-left rounded-lg transition-colors duration-100 focus:outline-none ${
                    isSelected 
                      ? 'bg-indigo-500/20' 
                      : isFocused
                        ? 'bg-indigo-500/20'
                        : 'hover:bg-indigo-500/20'
                  }`}
                >
                  <div className="flex items-center gap-3 px-3 py-2">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: coin.color }} />
                    <span className="font-mono text-sm font-semibold text-[var(--text-primary)] w-10">{coin.symbol}</span>
                    <span className="text-[var(--text-muted)] text-sm">{coin.name}</span>
                    {isSelected && <Check className="ml-auto w-3.5 h-3.5 text-[var(--text-accent)]" />}
                  </div>
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
