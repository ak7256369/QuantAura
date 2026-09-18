'use client';

/**
 * AmbientBackground — full-viewport themed canvas animations, one per page.
 *
 *   candles  (Dashboard)   drifting candlestick columns + a live price trace
 *   streams  (Markets)     flowing multi-colored price streams
 *   radar    (Predictions) expanding signal pulses + BUY/SELL blips
 *   neural   (Models)      neural-net nodes with traveling activation pulses
 *   equity   (Backtest)    equity curves drawing themselves across the screen
 *   landing  (Home hero)   sparse candle drift + one slow stream
 *
 * Engineering rules: DPR-aware, ~30fps budget, pauses when the tab is hidden,
 * renders one static frame under prefers-reduced-motion, re-reads CSS token
 * colors when the theme flips, and never intercepts pointer events.
 */

import React, { useEffect, useRef } from 'react';

export type AmbientVariant = 'candles' | 'streams' | 'radar' | 'neural' | 'equity' | 'landing';

interface Palette {
    buy: string; sell: string; hold: string;
    accent: string; accent2: string; faint: string;
    isLight: boolean;
}

function readPalette(): Palette {
    const cs = getComputedStyle(document.documentElement);
    const v = (name: string, fb: string) => (cs.getPropertyValue(name) || fb).trim() || fb;
    return {
        buy: v('--signal-buy', '#10b981'),
        sell: v('--signal-sell', '#ef4444'),
        hold: v('--signal-hold', '#f59e0b'),
        accent: v('--accent-primary', '#818cf8'),
        accent2: v('--accent-secondary', '#8b5cf6'),
        faint: v('--text-muted', '#64748b'),
        isLight: document.documentElement.getAttribute('data-theme') === 'light',
    };
}

/* Deterministic pseudo-random so every mount looks composed, not chaotic */
function mulberry32(seed: number) {
    return () => {
        seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

type DrawFn = (ctx: CanvasRenderingContext2D, w: number, h: number, t: number, p: Palette, rnd: () => number) => void;

/* ── candles: slow-rising candlestick columns + price polyline ────────────── */
const drawCandles: DrawFn = (ctx, w, h, t, p) => {
    const rnd = mulberry32(7);
    const n = Math.max(14, Math.floor(w / 64));
    const alpha = p.isLight ? 0.14 : 0.075;
    for (let i = 0; i < n; i++) {
        const seedA = rnd(), seedB = rnd(), seedC = rnd();
        const x = (i + 0.5) * (w / n);
        const drift = ((t * 0.008 * (0.4 + seedA)) + seedB) % 1.2;
        const y = h * (1.15 - drift) - 40;
        const bodyH = 18 + seedC * 46;
        const wickH = bodyH * (1.5 + seedA);
        const up = (i + Math.floor((t * 0.008 * (0.4 + seedA) + seedB) / 1.2)) % 2 === 0;
        const col = up ? p.buy : p.sell;
        ctx.globalAlpha = alpha * (0.5 + 0.5 * Math.sin(drift * Math.PI));
        ctx.strokeStyle = col;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, y - wickH / 2);
        ctx.lineTo(x, y + wickH / 2);
        ctx.stroke();
        ctx.fillStyle = col;
        ctx.fillRect(x - 4, y - bodyH / 2, 8, bodyH);
    }
    // faint price trace scrolling left
    ctx.globalAlpha = p.isLight ? 0.20 : 0.14;
    ctx.strokeStyle = p.accent;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    const step = 14;
    for (let x = -step; x <= w + step; x += step) {
        const k = (x + t * 26) * 0.011;
        const y = h * 0.55 + Math.sin(k) * 34 + Math.sin(k * 0.37 + 2) * 55;
        x === -step ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
};

/* ── streams: several flowing price traces ────────────────────────────────── */
const drawStreams: DrawFn = (ctx, w, h, t, p) => {
    const lanes = [
        { c: p.buy, y: 0.22, amp: 30, speed: 34, ph: 0 },
        { c: p.accent, y: 0.42, amp: 46, speed: 22, ph: 2 },
        { c: p.sell, y: 0.64, amp: 26, speed: 42, ph: 4 },
        { c: p.accent2, y: 0.82, amp: 38, speed: 27, ph: 1 },
    ];
    const step = 16;
    for (const lane of lanes) {
        ctx.globalAlpha = p.isLight ? 0.17 : 0.12;
        ctx.strokeStyle = lane.c;
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        let lastY = 0;
        for (let x = -step; x <= w + step; x += step) {
            const k = (x + t * lane.speed) * 0.008 + lane.ph;
            const y = h * lane.y + Math.sin(k) * lane.amp + Math.sin(k * 2.7) * lane.amp * 0.3;
            x === -step ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
            lastY = y;
        }
        ctx.stroke();
        // leading dot
        ctx.globalAlpha = p.isLight ? 0.55 : 0.5;
        ctx.fillStyle = lane.c;
        ctx.beginPath();
        ctx.arc(w - 2, lastY, 2.4, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;
};

/* ── radar: expanding signal pulses + drifting BUY/SELL blips ─────────────── */
const drawRadar: DrawFn = (ctx, w, h, t, p) => {
    const rnd = mulberry32(21);
    const centers = Array.from({ length: 5 }, () => ({
        x: rnd() * w, y: rnd() * h, ph: rnd() * 9, col: [p.buy, p.accent, p.sell, p.accent2, p.hold][Math.floor(rnd() * 5)],
    }));
    for (const c of centers) {
        for (let ring = 0; ring < 3; ring++) {
            const prog = ((t * 0.14 + c.ph + ring * 0.33) % 1);
            const r = prog * 190;
            ctx.globalAlpha = (p.isLight ? 0.18 : 0.13) * (1 - prog);
            ctx.strokeStyle = c.col;
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.globalAlpha = p.isLight ? 0.45 : 0.4;
        ctx.fillStyle = c.col;
        ctx.beginPath();
        ctx.arc(c.x, c.y, 2.2, 0, Math.PI * 2);
        ctx.fill();
    }
    // drifting signal triangles (▲ buy / ▼ sell)
    const rnd2 = mulberry32(5);
    for (let i = 0; i < 14; i++) {
        const sx = rnd2() * w, sp = 0.25 + rnd2() * 0.75, ph = rnd2();
        const up = i % 2 === 0;
        const prog = ((t * 0.02 * sp) + ph) % 1.1;
        const y = up ? h * (1.05 - prog) : h * (prog - 0.05);
        ctx.globalAlpha = (p.isLight ? 0.20 : 0.14) * Math.sin(Math.min(prog / 1.1, 1) * Math.PI);
        ctx.fillStyle = up ? p.buy : p.sell;
        ctx.beginPath();
        if (up) { ctx.moveTo(sx, y - 5); ctx.lineTo(sx - 4.5, y + 3.5); ctx.lineTo(sx + 4.5, y + 3.5); }
        else { ctx.moveTo(sx, y + 5); ctx.lineTo(sx - 4.5, y - 3.5); ctx.lineTo(sx + 4.5, y - 3.5); }
        ctx.closePath();
        ctx.fill();
    }
    ctx.globalAlpha = 1;
};

/* ── neural: node mesh with traveling activations ─────────────────────────── */
const drawNeural: DrawFn = (ctx, w, h, t, p) => {
    const rnd = mulberry32(11);
    const cols = 6, rows = 4;
    const nodes: { x: number; y: number }[] = [];
    for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
            nodes.push({
                x: ((c + 0.5) / cols) * w + (rnd() - 0.5) * 70 + Math.sin(t * 0.22 + c * 1.7 + r) * 7,
                y: ((r + 0.5) / rows) * h + (rnd() - 0.5) * 60 + Math.cos(t * 0.18 + r * 2.1 + c) * 7,
            });
        }
    }
    const edges: [number, number][] = [];
    for (let c = 0; c < cols - 1; c++) {
        for (let r = 0; r < rows; r++) {
            const a = c * rows + r;
            edges.push([a, (c + 1) * rows + r]);
            if (r < rows - 1) edges.push([a, (c + 1) * rows + r + 1]);
        }
    }
    ctx.lineWidth = 1;
    edges.forEach(([a, b], i) => {
        const A = nodes[a], B = nodes[b];
        ctx.globalAlpha = p.isLight ? 0.13 : 0.08;
        ctx.strokeStyle = p.accent;
        ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke();
        // traveling activation pulse
        const prog = (t * 0.25 + i * 0.13) % 1;
        const px = A.x + (B.x - A.x) * prog, py = A.y + (B.y - A.y) * prog;
        ctx.globalAlpha = (p.isLight ? 0.36 : 0.34) * Math.sin(prog * Math.PI);
        ctx.fillStyle = i % 3 === 0 ? p.accent2 : p.accent;
        ctx.beginPath(); ctx.arc(px, py, 1.8, 0, Math.PI * 2); ctx.fill();
    });
    nodes.forEach((n, i) => {
        const glow = 0.5 + 0.5 * Math.sin(t * 0.9 + i * 1.3);
        ctx.globalAlpha = (p.isLight ? 0.26 : 0.2) * (0.4 + 0.6 * glow);
        ctx.fillStyle = i % 5 === 0 ? p.accent2 : p.accent;
        ctx.beginPath(); ctx.arc(n.x, n.y, 2.6 + glow * 1.2, 0, Math.PI * 2); ctx.fill();
    });
    ctx.globalAlpha = 1;
};

/* ── equity: curves drawing themselves like backtest equity lines ─────────── */
const drawEquity: DrawFn = (ctx, w, h, t, p) => {
    const curves = [
        { c: p.buy, base: 0.62, gain: 0.30, ph: 0, dur: 14 },
        { c: p.accent, base: 0.74, gain: 0.22, ph: 5, dur: 18 },
        { c: p.accent2, base: 0.86, gain: 0.16, ph: 9, dur: 22 },
    ];
    for (const cv of curves) {
        const prog = ((t + cv.ph) % cv.dur) / cv.dur;           // 0→1 draw progress
        const fade = prog > 0.85 ? (1 - prog) / 0.15 : 1;       // fade out at end
        const endX = w * Math.min(prog / 0.85, 1);
        const rnd = mulberry32(Math.floor((t + cv.ph) / cv.dur) * 17 + cv.ph);
        const steps = 90;
        ctx.globalAlpha = (p.isLight ? 0.18 : 0.13) * fade;
        ctx.strokeStyle = cv.c;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        let y = h * cv.base;
        ctx.moveTo(0, y);
        for (let s = 1; s <= steps; s++) {
            const x = (s / steps) * w;
            if (x > endX) break;
            y += (rnd() - 0.47) * 18 - (h * cv.gain) / steps;   // upward drift + noise
            y = Math.max(h * 0.1, Math.min(h * 0.95, y));
            ctx.lineTo(x, y);
        }
        ctx.stroke();
        // soft area fill under the curve tip
        ctx.globalAlpha = (p.isLight ? 0.06 : 0.045) * fade;
        ctx.lineTo(Math.min(endX, w), h);
        ctx.lineTo(0, h);
        ctx.closePath();
        ctx.fillStyle = cv.c;
        ctx.fill();
    }
    ctx.globalAlpha = 1;
};

/* ── landing: extra-sparse candles + one slow stream ──────────────────────── */
const drawLanding: DrawFn = (ctx, w, h, t, p, rnd) => {
    ctx.save();
    ctx.globalAlpha = 0.55;
    drawCandles(ctx, w, h, t * 0.6, p, rnd);
    ctx.restore();
};

const DRAWERS: Record<AmbientVariant, DrawFn> = {
    candles: drawCandles,
    streams: drawStreams,
    radar: drawRadar,
    neural: drawNeural,
    equity: drawEquity,
    landing: drawLanding,
};

export default function AmbientBackground({
    variant,
    className = '',
    position = 'fixed',
}: {
    variant: AmbientVariant;
    className?: string;
    /** 'fixed' covers the viewport (dashboard pages); 'absolute' fills the nearest positioned ancestor (hero sections). */
    position?: 'fixed' | 'absolute';
}) {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let palette = readPalette();
        let raf = 0;
        let running = true;
        let last = 0;
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const rnd = mulberry32(3);

        const size = () => {
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            const rect = canvas.getBoundingClientRect();
            canvas.width = Math.max(1, Math.floor(rect.width * dpr));
            canvas.height = Math.max(1, Math.floor(rect.height * dpr));
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        };

        const frame = (now: number) => {
            if (!running) return;
            raf = requestAnimationFrame(frame);
            if (now - last < 33) return;               // ~30fps budget
            last = now;
            const rect = canvas.getBoundingClientRect();
            ctx.clearRect(0, 0, rect.width, rect.height);
            DRAWERS[variant](ctx, rect.width, rect.height, now / 1000, palette, rnd);
        };

        size();
        if (reduced) {
            // One composed static frame — motion-free but not empty
            const rect = canvas.getBoundingClientRect();
            DRAWERS[variant](ctx, rect.width, rect.height, 4.2, palette, rnd);
        } else {
            raf = requestAnimationFrame(frame);
        }

        const onResize = () => size();
        const onVis = () => {
            running = document.visibilityState === 'visible';
            if (running && !reduced) { last = 0; raf = requestAnimationFrame(frame); }
            else cancelAnimationFrame(raf);
        };
        const themeObserver = new MutationObserver(() => { palette = readPalette(); });
        themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
        window.addEventListener('resize', onResize);
        document.addEventListener('visibilitychange', onVis);

        return () => {
            running = false;
            cancelAnimationFrame(raf);
            themeObserver.disconnect();
            window.removeEventListener('resize', onResize);
            document.removeEventListener('visibilitychange', onVis);
        };
    }, [variant]);

    return (
        <canvas
            ref={canvasRef}
            aria-hidden="true"
            className={`ambient-bg ${className}`}
            style={{
                position,
                inset: 0,
                width: '100%',
                height: '100%',
                zIndex: 0,
                pointerEvents: 'none',
            }}
        />
    );
}
