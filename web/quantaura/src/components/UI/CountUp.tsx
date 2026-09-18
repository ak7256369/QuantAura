'use client';

import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';

/**
 * Renders a live metric, with a brief pulse when the value CHANGES.
 *
 * The number is rendered directly from props, never from animation state. That
 * matters: the previous approach here (and AnimatedNumber in
 * hooks/useAnimatedCounter) seeds the DOM with 0 and relies on an animation
 * driver to fill in the real figure — when the driver does not run, the page
 * confidently displays 0.0% for a model scoring 74%. A metric must be correct
 * even when nothing animates, so animation is limited to decoration.
 *
 * AnimatedNumber remains the right tool for scroll-triggered hero counters,
 * where counting up from zero is the intent.
 */
export default function CountUp({
    value,
    decimals = 1,
    className = '',
}: {
    value: number;
    decimals?: number;
    className?: string;
}) {
    const [pulse, setPulse] = useState(false);
    const mounted = useRef(false);

    useEffect(() => {
        // Skip the initial render — only a genuine update should pulse
        if (!mounted.current) {
            mounted.current = true;
            return;
        }
        setPulse(true);
        const t = setTimeout(() => setPulse(false), 420);
        return () => clearTimeout(t);
    }, [value]);

    return (
        <motion.span
            className={className}
            animate={{ scale: pulse ? 1.06 : 1, opacity: pulse ? 0.82 : 1 }}
            transition={{ duration: 0.21, ease: 'easeOut' }}
            style={{ display: 'inline-block' }}
        >
            {Number.isFinite(value) ? value.toFixed(decimals) : '—'}
        </motion.span>
    );
}
