'use client';

import React, { useRef, useEffect, useCallback, useState } from 'react';

interface Candle {
    openTime: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

interface Props {
    candles: Candle[];
    width?: number;
    height?: number;
}

export default function CandlestickChart({ candles, width: propWidth, height: propHeight }: Props) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [dimensions, setDimensions] = useState({ width: propWidth || 800, height: propHeight || 460 });
    const [crosshair, setCrosshair] = useState<{ x: number; y: number; candle?: Candle } | null>(null);
    const [offset, setOffset] = useState(0);
    const [candleWidth, setCandleWidth] = useState(8);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        const obs = new ResizeObserver(entries => {
            const { width, height } = entries[0].contentRect;
            setDimensions({ width: Math.floor(width), height: Math.floor(height) });
        });
        obs.observe(container);
        return () => obs.disconnect();
    }, []);

    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas || candles.length === 0) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Read CSS custom properties for theme-aware rendering
        const computedStyle = getComputedStyle(document.documentElement);
        const canvasBg = computedStyle.getPropertyValue('--canvas-bg').trim() || '#0d1121';
        const gridLine = computedStyle.getPropertyValue('--grid-line').trim() || 'rgba(255,255,255,0.04)';
        const gridDot = computedStyle.getPropertyValue('--grid-dot').trim() || 'rgba(255,255,255,0.06)';
        const chartLabel = computedStyle.getPropertyValue('--chart-label').trim() || '#64748b';
        const candleGreen = computedStyle.getPropertyValue('--candle-green').trim() || '#22c55e';
        const candleRed = computedStyle.getPropertyValue('--candle-red').trim() || '#ef4444';
        const candleGreenWick = computedStyle.getPropertyValue('--candle-green-wick').trim() || '#16a34a';
        const candleRedWick = computedStyle.getPropertyValue('--candle-red-wick').trim() || '#dc2626';
        const tooltipBg = computedStyle.getPropertyValue('--tooltip-bg').trim() || 'rgba(15,22,41,0.95)';
        const tooltipBorder = computedStyle.getPropertyValue('--tooltip-border').trim() || 'rgba(255,255,255,0.1)';
        const textPrimary = computedStyle.getPropertyValue('--text-primary').trim() || '#f1f5f9';

        const { width, height } = dimensions;
        const dpr = window.devicePixelRatio || 1;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        ctx.scale(dpr, dpr);

        const padding = { top: 20, right: 70, bottom: 50, left: 10 };
        const chartW = width - padding.left - padding.right;
        const volumeH = 60;
        const chartH = height - padding.top - padding.bottom - volumeH;

        const gap = 2;
        const cw = candleWidth;
        const totalCandleW = cw + gap;
        const visibleCount = Math.floor(chartW / totalCandleW);
        const startIdx = Math.max(0, candles.length - visibleCount - offset);
        const endIdx = Math.min(candles.length, startIdx + visibleCount);
        const visible = candles.slice(startIdx, endIdx);

        if (visible.length === 0) return;

        // Clear with theme bg
        ctx.fillStyle = canvasBg;
        ctx.fillRect(0, 0, width, height);

        // Grid dots
        ctx.fillStyle = gridDot;
        for (let gx = padding.left; gx < width - padding.right; gx += 50) {
            for (let gy = padding.top; gy < height - padding.bottom; gy += 50) {
                ctx.beginPath();
                ctx.arc(gx, gy, 0.7, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // Price range
        let pMin = Infinity, pMax = -Infinity, vMax = 0;
        for (const c of visible) {
            if (c.low < pMin) pMin = c.low;
            if (c.high > pMax) pMax = c.high;
            if (c.volume > vMax) vMax = c.volume;
        }
        const priceRange = pMax - pMin || 1;
        const pPadding = priceRange * 0.05;
        pMin -= pPadding;
        pMax += pPadding;
        const adjustedRange = pMax - pMin;

        const toY = (price: number) => padding.top + chartH - ((price - pMin) / adjustedRange) * chartH;
        const toVolY = (vol: number) => height - padding.bottom - (vol / vMax) * volumeH;

        // Grid lines
        ctx.strokeStyle = gridLine;
        ctx.lineWidth = 1;
        const gridLines = 6;
        for (let i = 0; i <= gridLines; i++) {
            const y = Math.round(padding.top + (chartH / gridLines) * i) + 0.5;
            ctx.beginPath(); ctx.moveTo(padding.left, y); ctx.lineTo(width - padding.right, y); ctx.stroke();
            const price = pMax - (adjustedRange / gridLines) * i;
            ctx.fillStyle = chartLabel;
            ctx.font = '11px JetBrains Mono, monospace';
            ctx.textAlign = 'left';
            ctx.fillText(price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }), width - padding.right + 6, y + 4);
        }

        // Volume separator
        const volTop = height - padding.bottom - volumeH;
        ctx.strokeStyle = gridLine;
        ctx.beginPath(); ctx.moveTo(padding.left, volTop); ctx.lineTo(width - padding.right, volTop); ctx.stroke();

        // Draw candles
        for (let i = 0; i < visible.length; i++) {
            const c = visible[i];
            const x = padding.left + i * totalCandleW + cw / 2;
            const isGreen = c.close >= c.open;
            const bodyTop = toY(Math.max(c.open, c.close));
            const bodyBottom = toY(Math.min(c.open, c.close));
            const bodyHeight = Math.max(1, bodyBottom - bodyTop);

            // Wick
            ctx.strokeStyle = isGreen ? candleGreenWick : candleRedWick;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x, toY(c.high));
            ctx.lineTo(x, toY(c.low));
            ctx.stroke();

            // Body
            ctx.fillStyle = isGreen ? candleGreen : candleRed;
            ctx.fillRect(x - cw / 2, bodyTop, cw, bodyHeight);

            // Volume bar
            const vBarH = (c.volume / vMax) * (volumeH - 10);
            ctx.fillStyle = isGreen ? `${candleGreen}40` : `${candleRed}40`;
            ctx.fillRect(x - cw / 2, height - padding.bottom - vBarH, cw, vBarH);
        }

        // Date labels
        ctx.fillStyle = chartLabel;
        ctx.font = '10px Inter, sans-serif';
        ctx.textAlign = 'center';
        const labelStep = Math.max(1, Math.floor(visible.length / 8));
        for (let i = 0; i < visible.length; i += labelStep) {
            const c = visible[i];
            const x = padding.left + i * totalCandleW + cw / 2;
            const d = new Date(c.openTime);
            const label = `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
            ctx.fillText(label, x, height - padding.bottom + 20);
        }

        // Crosshair
        if (crosshair) {
            ctx.setLineDash([4, 4]);
            ctx.strokeStyle = chartLabel;
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(crosshair.x, padding.top); ctx.lineTo(crosshair.x, height - padding.bottom); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(padding.left, crosshair.y); ctx.lineTo(width - padding.right, crosshair.y); ctx.stroke();
            ctx.setLineDash([]);

            if (crosshair.candle) {
                const c = crosshair.candle;
                const isGreen = c.close >= c.open;
                const tooltipX = Math.min(crosshair.x + 12, width - 180);
                const tooltipY = Math.max(crosshair.y - 80, padding.top);

                // Tooltip background
                ctx.fillStyle = tooltipBg;
                ctx.strokeStyle = tooltipBorder;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.roundRect(tooltipX, tooltipY, 160, 100, 8);
                ctx.fill(); ctx.stroke();

                ctx.fillStyle = textPrimary;
                ctx.font = 'bold 12px Inter, sans-serif';
                ctx.textAlign = 'left';
                ctx.fillText(`O: ${c.open.toLocaleString()}`, tooltipX + 10, tooltipY + 22);
                ctx.fillText(`H: ${c.high.toLocaleString()}`, tooltipX + 10, tooltipY + 40);
                ctx.fillText(`L: ${c.low.toLocaleString()}`, tooltipX + 10, tooltipY + 58);
                ctx.fillStyle = isGreen ? candleGreen : candleRed;
                ctx.fillText(`C: ${c.close.toLocaleString()}`, tooltipX + 10, tooltipY + 76);
                ctx.fillStyle = chartLabel;
                ctx.font = '10px JetBrains Mono';
                ctx.fillText(`Vol: ${(c.volume / 1000).toFixed(1)}K`, tooltipX + 10, tooltipY + 92);
            }
        }
    }, [candles, dimensions, crosshair, offset, candleWidth]);

    useEffect(() => { draw(); }, [draw]);

    const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const gap = 2;
        const totalCandleW = candleWidth + gap;
        const padding = { top: 20, left: 10 };
        const idx = Math.floor((x - padding.left) / totalCandleW);
        const visibleCount = Math.floor((dimensions.width - 80) / totalCandleW);
        const startIdx = Math.max(0, candles.length - visibleCount - offset);
        const candleIdx = startIdx + idx;

        setCrosshair({
            x, y,
            candle: candles[candleIdx] || undefined,
        });
    };

    const handleWheel = (e: React.WheelEvent) => {
        if (e.ctrlKey || e.metaKey) {
            setCandleWidth(w => Math.max(3, Math.min(20, w + (e.deltaY > 0 ? -1 : 1))));
        } else if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
            setOffset(o => Math.max(0, o + (e.deltaX > 0 ? 5 : -5)));
        }
    };

    return (
        <div ref={containerRef} className="chart-canvas-container" style={{ width: '100%', height: '100%' }}>
            <canvas
                ref={canvasRef}
                role="img"
                aria-label="Interactive candlestick price chart"
                onMouseMove={handleMouseMove}
                onMouseLeave={() => setCrosshair(null)}
                onWheel={handleWheel}
                style={{ display: 'block', cursor: 'crosshair' }}
            />
        </div>
    );
}
