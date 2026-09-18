'use client';

import { usePathname } from 'next/navigation';
import AmbientBackground, { type AmbientVariant } from './AmbientBackground';

/** Maps each dashboard route to its themed ambient animation. */
const ROUTE_VARIANTS: Record<string, AmbientVariant> = {
    '/dashboard': 'candles',    // live market: drifting candlesticks + price trace
    '/markets': 'streams',      // flowing multi-asset price streams
    '/predictions': 'radar',    // expanding signal pulses + BUY/SELL blips
    '/models': 'neural',        // neural-net activations
    '/backtest': 'equity',      // self-drawing equity curves
    '/research': 'neural',      // interconnection mesh suits correlation work
};

export default function PageAmbient() {
    const pathname = usePathname() ?? '';
    const match = Object.keys(ROUTE_VARIANTS).find(r => pathname.startsWith(r));
    if (!match) return null;
    return <AmbientBackground variant={ROUTE_VARIANTS[match]} />;
}
