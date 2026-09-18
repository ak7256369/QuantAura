'use client';

import { useEffect, useRef } from 'react';
import { useMotionValue, useSpring, useInView, MotionValue } from 'motion/react';

interface UseAnimatedCounterOptions {
  /** The target number to count to */
  target: number;
  /** Duration in seconds for the animation */
  duration?: number;
  /** Whether to format with commas (e.g. 1,925,000) */
  formatCommas?: boolean;
  /** Number of decimal places */
  decimals?: number;
  /** Suffix to append (e.g. '%', '+') */
  suffix?: string;
}

/**
 * A hook that creates a smooth, spring-based animated counter.
 * Uses useMotionValue + useSpring for weighted interpolation:
 * slow start → fast middle → gentle ease at end.
 *
 * @returns [displayValue: string, motionValue: MotionValue<number>]
 */
export function useAnimatedCounter({
  target,
  duration = 2,
  formatCommas = false,
  decimals = 0,
  suffix = '',
}: UseAnimatedCounterOptions): [string, MotionValue<number>] {
  const ref = useRef(null);
  const motionValue = useMotionValue(0);
  const springValue = useSpring(motionValue, {
    stiffness: 60,
    damping: 20,
    mass: 1,
    duration: duration * 1000,
  });

  const isInView = useInView(ref as any, { once: true, margin: '-80px' });

  // We need to track the displayed string via a ref + state combo
  const displayRef = useRef('0');

  useEffect(() => {
    if (isInView) {
      motionValue.set(target);
    }
  }, [isInView, target, motionValue]);

  useEffect(() => {
    const unsubscribe = springValue.on('change', (latest) => {
      let formatted: string;
      if (decimals > 0) {
        formatted = latest.toFixed(decimals);
      } else {
        formatted = Math.round(latest).toString();
      }
      if (formatCommas) {
        const parts = formatted.split('.');
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        formatted = parts.join('.');
      }
      displayRef.current = formatted + suffix;
    });
    return unsubscribe;
  }, [springValue, formatCommas, decimals, suffix]);

  return [displayRef.current, springValue];
}

/**
 * A component wrapper that renders an animated counting number.
 * This is the preferred way to use animated counters since it
 * subscribes to motion value changes and re-renders properly.
 */
export function AnimatedNumber({
  target,
  duration = 2,
  formatCommas = false,
  decimals = 0,
  suffix = '',
  className = '',
}: UseAnimatedCounterOptions & { className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const motionValue = useMotionValue(0);
  const springValue = useSpring(motionValue, {
    stiffness: 60,
    damping: 20,
    mass: 1,
  });
  const isInView = useInView(ref, { once: true, margin: '-80px' });

  useEffect(() => {
    if (isInView) {
      motionValue.set(target);
    }
  }, [isInView, target, motionValue]);

  useEffect(() => {
    const unsubscribe = springValue.on('change', (latest) => {
      if (ref.current) {
        let formatted: string;
        if (decimals > 0) {
          formatted = latest.toFixed(decimals);
        } else {
          formatted = Math.round(latest).toString();
        }
        if (formatCommas) {
          const parts = formatted.split('.');
          parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
          formatted = parts.join('.');
        }
        ref.current.textContent = formatted + suffix;
      }
    });
    return unsubscribe;
  }, [springValue, formatCommas, decimals, suffix]);

  return <span ref={ref} className={className}>0{suffix}</span>;
}
