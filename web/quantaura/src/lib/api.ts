// API calls use relative paths — Next.js rewrites proxy them to the backend
import { authFetch } from './auth';

const API_BASE = '';
const BINANCE_REST = 'https://api.binance.com/api/v3';

// ═══════════════════════════════════════════
//  BINANCE DIRECT (No backend needed)
// ═══════════════════════════════════════════

export async function fetchBinanceCandles(symbol = 'BTCUSDT', interval = '4h', limit = 500) {
    const res = await fetch(
        `${BINANCE_REST}/klines?symbol=${symbol.toUpperCase()}&interval=${interval}&limit=${limit}`
    );
    if (!res.ok) throw new Error(`Binance candles error: ${res.status}`);
    const data = await res.json();
    return data.map((k: any) => ({
        openTime: k[0],
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4]),
        volume: parseFloat(k[5]),
    }));
}

export async function fetchBinanceTicker(symbol = 'BTCUSDT') {
    const res = await fetch(`${BINANCE_REST}/ticker/24hr?symbol=${symbol.toUpperCase()}`);
    if (!res.ok) throw new Error(`Binance ticker error: ${res.status}`);
    return res.json();
}

export async function fetchAllBinanceTickers(symbols: string[]) {
    const results = await Promise.all(
        symbols.map(async (sym) => {
            try {
                const data = await fetchBinanceTicker(sym);
                return {
                    symbol: sym,
                    price: parseFloat(data.lastPrice),
                    change: parseFloat(data.priceChangePercent),
                    high24h: parseFloat(data.highPrice),
                    low24h: parseFloat(data.lowPrice),
                    volume24h: parseFloat(data.volume),
                    quoteVolume24h: parseFloat(data.quoteVolume),
                };
            } catch {
                return null;
            }
        })
    );
    return results.filter(Boolean);
}

export async function fetchBinanceMiniTickers() {
    const res = await fetch(`${BINANCE_REST}/ticker/24hr`);
    if (!res.ok) throw new Error('Binance mini tickers error');
    const all = await res.json();
    const symbols = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT', 'ADAUSDT', 'AVAXUSDT', 'DOTUSDT', 'LINKUSDT', 'DOGEUSDT'];
    return all
        .filter((t: any) => symbols.includes(t.symbol))
        .map((t: any) => ({
            symbol: t.symbol,
            price: parseFloat(t.lastPrice),
            change: parseFloat(t.priceChangePercent),
            high24h: parseFloat(t.highPrice),
            low24h: parseFloat(t.lowPrice),
            volume24h: parseFloat(t.volume),
            quoteVolume24h: parseFloat(t.quoteVolume),
        }));
}

// ═══════════════════════════════════════════
//  BACKEND API (Signals, News, Chat — need server)
// ═══════════════════════════════════════════

export async function fetchCandles(symbol = 'BTCUSDT', interval = '4h', limit = 500) {
    const res = await fetch(`${API_BASE}/api/market/candles?symbol=${symbol}&interval=${interval}&limit=${limit}`);
    const json = await res.json();
    return json.data || [];
}

export async function fetchSymbols() {
    const res = await fetch(`${API_BASE}/api/market/symbols`);
    const json = await res.json();
    return json.data || [];
}

export async function fetchSignal(symbol = 'BTCUSDT') {
    const res = await authFetch(`${API_BASE}/api/signals?symbol=${symbol}`);
    const json = await res.json();
    return json.data || null;
}

export async function fetchAllSignals(symbols: string[]) {
    const results = await Promise.all(
        symbols.map(async (sym) => {
            try {
                const data = await fetchSignal(sym);
                return data;
            } catch {
                return null;
            }
        })
    );
    return results.filter(Boolean);
}

export async function fetchSignalHistory() {
    const res = await authFetch(`${API_BASE}/api/signals/history`);
    const json = await res.json();
    return json.data || [];
}

export async function fetchNews(limit = 30) {
    const res = await fetch(`${API_BASE}/api/news?limit=${limit}`);
    const json = await res.json();
    return json.data || [];
}

export async function summarizeNews(title: string, content: string, newsId?: string) {
    const res = await fetch(`${API_BASE}/api/news/summarize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content, newsId }),
    });
    const json = await res.json();
    return json.data || null;
}

export async function fetchCoinNewsSummary(symbol: string) {
    const res = await fetch(`${API_BASE}/api/news/coin-summary?symbol=${symbol}`);
    const json = await res.json();
    return json.data || null;
}

export interface ChatReply {
    text: string;
    context?: { signal: string | null; confidence: number | null; window: string };
    /** limit/remaining are null for premium users (unlimited) */
    quota?: { limit: number | null; remaining: number | null };
}

export interface ChatError extends Error {
    status?: number;
    upgradeRequired?: boolean;
}

export async function sendCryptoChatMessage(
    coin: string,
    timeframe: string,
    userQuestion: string,
    history: { role: 'user' | 'ai'; content: string }[] = [],
): Promise<ChatReply> {
    const res = await authFetch(`${API_BASE}/api/crypto-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // history lets follow-ups ("why?", "what about ETH?") resolve against
        // the conversation instead of being answered cold
        body: JSON.stringify({ coin, timeframe, userQuestion, history }),
    });
    const json = await res.json();
    if (!json.success) {
        const err = new Error(json.error || 'Failed to get chat response') as ChatError;
        err.status = res.status;
        err.upgradeRequired = !!json.upgradeRequired;
        throw err;
    }
    return { text: json.data, context: json.context, quota: json.quota };
}

export async function checkBackendHealth(): Promise<boolean> {
    try {
        const res = await fetch(`${API_BASE}/api/health`, { signal: AbortSignal.timeout(3000) });
        const json = await res.json();
        return json.status === 'ok';
    } catch {
        return false;
    }
}

export async function runBacktest(symbol: string, days: number = 30) {
    const url = `${API_BASE}/api/signals/backtest?symbol=${symbol}&days=${days}`;
    const res = await authFetch(url);
    
    if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        const detail = errBody.error || errBody.details || `Server returned ${res.status}`;
        throw new Error(`Backtest failed: ${detail}`);
    }
    
    const data = await res.json();
    if (!data.success) {
        throw new Error(data.error || 'Backtest returned unsuccessful result');
    }
    
    // Ensure maxDrawdown is displayed as negative
    if (data.data?.metrics?.maxDrawdown > 0) {
        data.data.metrics.maxDrawdown = -data.data.metrics.maxDrawdown;
    }
    
    return data.data;
}

export interface EnsembleEvaluation {
    weights?: Record<string, number>;
    val_f1?: Record<string, number>;
    test?: {
        lstm?: number; xgboost?: number; transformer?: number; kan?: number;
        ensemble?: number; ensemble_accuracy?: number;
        persistence_baseline_f1?: number;
        [key: string]: unknown;
    };
    confusion_matrices?: Record<string, number[][]>;
    feature_importance?: { name: string; importance: number }[];
    lstm_coverage?: number;
}

/** What the signals are worth after costs. Regime F1 reads like a win rate and
 *  is not one, so these must be displayed alongside it. */
export interface Tradeability {
    n: number;
    /** Mean forward 24h return across all rows — the market's own drift. */
    unconditional_mean_fwd_return: number;
    /** Round-trip fee + slippage assumption (e.g. 0.003 = 0.30%). */
    round_trip_cost: number;
    by_signal: Record<string, { n: number; mean_fwd_return: number; p_up: number }>;
    /** How often an issued BUY/SELL got price DIRECTION right. 0.50 = chance. */
    directional_accuracy: number;
    regime_macro_f1: number;
}

export interface ModelStatsResponse {
    models: Record<string, { f1_macro: number; last_trained: number; cycles: number }>;
    ensemble_f1: number;
    evaluation?: EnsembleEvaluation | null;
    tradeability?: Tradeability | null;
    /** Newest mtime across the deployed model files — changes when new weights
     *  go live, which is how the UI detects a deployment and refreshes. */
    models_updated_at?: number | null;
    total_candles_1h: number;
    total_candles_4h: number;
    total_training_cycles: number;
    symbols_count: number;
    symbols: string[];
    model_count: number;
    weights: Record<string, number>;
    config: {
        lstm_features: number;
        transformer_features: number;
        kan_features: number;
        lstm_seq_len: number;
        transformer_seq_len: number;
        xgb_estimators: number;
        epochs_full: number;
        epochs_fine_tune: number;
        batch_size: number;
        learning_rate: number;
        lookback_days: number;
        confidence_threshold?: number;
        label_scheme?: string;
        label_trend_tau?: number;
        label_horizon_hours?: number;
    };
}

// ═══════════════════════════════════════════
//  BTC RESEARCH (literature + our replication + validated forecasts)
// ═══════════════════════════════════════════

export interface BiblioEntry {
    id: string; questions: string[]; title: string; authors: string;
    venue: string; year: number; doi: string; url: string;
    citation_count?: { n: number; source: string };
    method?: string; key_finding: string; relevance?: string;
    data_period?: string; role?: string;
}

export interface CouplingEntry {
    symbol: string; name: string;
    corr_90d: number; corr_90d_percentile: number; corr_90d_range: [number, number];
    corr_full_sample: number; beta: number | null; r_squared: number | null;
    state: 'tightly_coupled' | 'normal' | 'decoupled';
    reading: string;
}

export interface PropagationCoin {
    symbol: string; name: string;
    /** OUT-OF-SAMPLE probability the coin follows BTC's regime within 24h. */
    probability_follows_24h: number;
    /** Baseline rate at moments when BTC did NOT just flip. */
    control_probability: number;
    lift: number; p_value: number; significant: boolean;
    n_test_events: number; median_lag_hours: number | null;
    current_regime: string; agrees_with_btc: boolean; forecast_applicable: boolean;
}

export interface ResearchResponse {
    bibliography?: {
        meta: Record<string, unknown>;
        entries: BiblioEntry[];
        documented_gaps?: { topic: string; note: string }[];
    } | null;
    measurements?: {
        meta: {
            date_range: { start: string; end: string };
            n_4h_candles: number; n_1h_candles: number;
            coins: string[]; caveats: string[]; generated: string;
        };
        correlation: any; beta: any; lead_lag: any;
        event_study: any; regime_propagation: any; spillover: any;
    } | null;
    validation?: { verdict: any; per_coin: any; meta: any } | null;
    predictions?: {
        generated: string;
        coupling_state: CouplingEntry[];
        divergence_watch: { symbol: string; name: string; corr_90d: number; percentile: number; note: string }[];
        propagation_forecast: {
            status: string;
            btc_current_regime: string;
            hours_since_btc_flip: number | null;
            btc_recently_flipped: boolean;
            pooled: { follow_rate: number; control_rate: number; lift: number; n_events: number; p_value: number; significant: boolean };
            coins: PropagationCoin[];
            how_to_read: string;
            validation: Record<string, unknown>;
        };
        rejected: { candidate: string; reason: string; evidence: string }[];
        boundaries: string;
    } | null;
}

export async function fetchResearch(): Promise<ResearchResponse | null> {
    try {
        const res = await authFetch(`${API_BASE}/api/research`, {
            signal: AbortSignal.timeout(12000),
        });
        if (!res.ok) return null;
        const json = await res.json();
        return json.data || null;
    } catch {
        return null;
    }
}

export async function fetchModelStats(): Promise<ModelStatsResponse | null> {
    try {
        // no-store: this is polled to detect newly deployed models, so a cached
        // response would keep showing the previous deployment's scores.
        const res = await fetch(`${API_BASE}/api/signals/stats`, {
            signal: AbortSignal.timeout(8000),
            cache: 'no-store',
        });
        if (!res.ok) throw new Error('API not ok');
        const json = await res.json();
        return json.data || null;
    } catch {
        return null;
    }
}

export { API_BASE };
