'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchModelStats, type ModelStatsResponse } from '@/lib/api';

/** Poll interval. Model deployments are infrequent (the autopilot's quality
 *  gate rejects most fine-tunes), so a slow poll is plenty and keeps the
 *  request rate negligible. */
const DEFAULT_POLL_MS = 60_000;
/** How long the "models updated" highlight stays visible. */
const FRESH_MS = 12_000;

/** Fingerprint of the numbers a viewer actually sees. Used as a fallback when
 *  models_updated_at is unavailable (older backend), so a deployment is still
 *  detected from the metrics themselves rather than being missed. */
function fingerprint(d: ModelStatsResponse | null): string {
    if (!d) return '';
    const per = Object.entries(d.models ?? {})
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}:${v.f1_macro}`)
        .join('|');
    return `${d.models_updated_at ?? ''}~${d.ensemble_f1}~${per}`;
}

export interface UseModelStats {
    data: ModelStatsResponse | null;
    /** True until the first response (success or failure) arrives. */
    loading: boolean;
    /** True for a few seconds after newly deployed models are detected. */
    justUpdated: boolean;
    /** Epoch ms of the last successful fetch, for a "live" timestamp. */
    lastFetched: number | null;
    /** True when the backend could not be reached on the latest attempt. */
    offline: boolean;
    refresh: () => void;
}

/**
 * Live model metrics. Polls /stats and surfaces when a new deployment lands so
 * the page can show current F1 scores without a manual reload.
 */
export function useModelStats(pollMs: number = DEFAULT_POLL_MS): UseModelStats {
    const [data, setData] = useState<ModelStatsResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [justUpdated, setJustUpdated] = useState(false);
    const [lastFetched, setLastFetched] = useState<number | null>(null);
    const [offline, setOffline] = useState(false);

    const printRef = useRef<string>('');
    const freshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const load = useCallback(async () => {
        const next = await fetchModelStats();
        if (!next) {
            setOffline(true);
            setLoading(false);
            return;
        }
        setOffline(false);
        const print = fingerprint(next);
        const isDeployment = printRef.current !== '' && printRef.current !== print;
        printRef.current = print;

        setData(next);
        setLastFetched(Date.now());
        setLoading(false);

        if (isDeployment) {
            setJustUpdated(true);
            if (freshTimer.current) clearTimeout(freshTimer.current);
            freshTimer.current = setTimeout(() => setJustUpdated(false), FRESH_MS);
        }
    }, []);

    useEffect(() => {
        let cancelled = false;
        const tick = () => { if (!cancelled) void load(); };

        tick();
        const id = setInterval(tick, pollMs);

        // Catch up immediately when the tab regains focus — a laptop that was
        // asleep for hours should not sit on stale numbers until the next tick.
        const onVisible = () => { if (document.visibilityState === 'visible') tick(); };
        document.addEventListener('visibilitychange', onVisible);
        window.addEventListener('online', tick);

        return () => {
            cancelled = true;
            clearInterval(id);
            document.removeEventListener('visibilitychange', onVisible);
            window.removeEventListener('online', tick);
            if (freshTimer.current) clearTimeout(freshTimer.current);
        };
    }, [load, pollMs]);

    return { data, loading, justUpdated, lastFetched, offline, refresh: load };
}

export default useModelStats;
