'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown, Check, Clock } from 'lucide-react';

export const TIME_DATA = [
  { value: 1, label: "Last 1 min" },
  { value: 2, label: "Last 2 min" },
  { value: 3, label: "Last 3 min" },
  { value: 4, label: "Last 4 min" },
  { value: 5, label: "Last 5 min" },
  { value: 10, label: "Last 10 min" },
];

export const TIMEFRAMES_DATA = [
  { value: "1m", label: "1 Minute" },
  { value: "5m", label: "5 Minutes" },
  { value: "15m", label: "15 Minutes" },
  { value: "1h", label: "1 Hour" },
  { value: "4h", label: "4 Hours" },
  { value: "1d", label: "1 Day" },
];

export const BACKTEST_TIME_DATA = [
  { value: 'Last 30 Days', label: "Last 30 Days" },
  { value: 'Last 90 Days', label: "Last 90 Days" },
  { value: 'Last 6 Months', label: "Last 6 Months" },
  { value: 'Last Year', label: "Last Year" },
];

interface TimeSelectorProps {
  value: string | number;
  onChange: (val: string | number) => void;
  className?: string;
  type?: 'chat' | 'chart' | 'backtest';
}

export default function TimeSelector({ value, onChange, className = '', type = 'chat' }: TimeSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);

  const options = type === 'chat' ? TIME_DATA : type === 'backtest' ? BACKTEST_TIME_DATA : TIMEFRAMES_DATA;
  const selectedOption = options.find(o => o.value === value) || options[0];

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
        setFocusedIndex(options.findIndex(o => o.value === value));
      }
      return;
    }

    if (e.key === 'Escape') {
      setIsOpen(false);
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIndex(prev => (prev < options.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIndex(prev => (prev > 0 ? prev - 1 : options.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (focusedIndex >= 0) {
        onChange(options[focusedIndex].value);
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
          <Clock size={14} className="text-[var(--text-accent)] flex-shrink-0" />
          <span className="truncate">{selectedOption.label}</span>
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
            className="absolute top-full left-0 z-50 w-full min-w-[140px] max-h-60 overflow-y-auto mt-2 p-2 bg-[var(--bg-card-solid)] backdrop-blur-2xl border border-[var(--border-card)] rounded-2xl shadow-[var(--shadow-elevated)] styled-scrollbar"
          >
            {options.map((option, idx) => {
              const isSelected = option.value === value;
              const isFocused = idx === focusedIndex;

              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onChange(option.value);
                    setIsOpen(false);
                  }}
                  onMouseEnter={() => setFocusedIndex(idx)}
                  className={`w-full flex items-center justify-between h-10 px-3 py-2 rounded-lg transition-colors duration-100 focus:outline-none ${
                    isSelected
                      ? 'bg-indigo-500/20 text-[var(--text-accent)] font-semibold'
                      : isFocused
                        ? 'bg-indigo-500/15 text-[var(--text-primary)]'
                        : 'text-[var(--text-secondary)] hover:bg-indigo-500/15 hover:text-[var(--text-primary)]'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span>{option.label}</span>
                  </div>
                  {isSelected && <Check size={14} className="text-[var(--text-accent)]" />}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
