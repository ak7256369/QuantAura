const axios = require('axios');
const Groq = require('groq-sdk');

// ─── Groq (Cloud API for Fast Live Deployment) ───
// Lazy singleton: without a GROQ_API_KEY the server must still boot — signals,
// stats, news and markets don't need the LLM. Every caller already has a
// try/catch fallback path, so throwing here (not at module load) is safe.
let _groq = null;
function getGroq() {
    if (!_groq) {
        if (!process.env.GROQ_API_KEY) {
            throw new Error('GROQ_API_KEY not configured — LLM features disabled');
        }
        _groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    }
    return _groq;
}
const groq = { chat: { completions: { create: (...args) => getGroq().chat.completions.create(...args) } } };
// Groq shut down llama-3.3-70b-versatile on 2026-08-16. Every call below
// has a try/catch fallback, so this failed as a silent quality regression
// (news summaries quietly degrading to the non-LLM path) rather than as an
// outage. openai/gpt-oss-120b is Groq's named replacement and supports the
// response_format json_object that generateNewsSummary relies on.
const GROQ_MODEL = 'openai/gpt-oss-120b';

/**
 * Generate an AI summary for a news article — uses GROQ CLOUD
 */
async function generateNewsSummary(title, content = '') {
    const prompt = `You are a cryptocurrency market analyst AI for the QuantAura platform. Analyze the following news article and provide:
1. A concise 2-3 sentence summary of the key points
2. Market sentiment (bullish, bearish, or neutral)
3. Impact level (high, medium, or low)
4. Key factors that could affect crypto markets (as a comma-separated list)

Article Title: ${title}
Article Content: ${content || 'No additional content available.'}

Respond in this exact JSON format:
{
  "summary": "...",
  "sentiment": "bullish|bearish|neutral",
  "impact": "high|medium|low",
  "keyFactors": ["factor1", "factor2"]
}`;

    try {
        const chatCompletion = await groq.chat.completions.create({
            messages: [{ role: 'user', content: prompt }],
            model: GROQ_MODEL,
            response_format: { type: "json_object" },
            temperature: 0.2,
        });
        
        const parsed = JSON.parse(chatCompletion.choices[0].message.content);
        return {
            summary: parsed.summary || 'Summary not available.',
            sentiment: parsed.sentiment || 'neutral',
            impact: parsed.impact || 'medium',
            keyFactors: parsed.keyFactors || [],
            source: 'quantaura-groq'
        };
    } catch (err) {
        console.warn(`[Groq] News summary failed: ${err.message}`);
        return {
            summary: `${title} — This article may impact cryptocurrency markets. QuantAura AI is temporarily unavailable.`,
            sentiment: 'neutral',
            impact: 'medium',
            keyFactors: ['market_uncertainty'],
            source: 'fallback'
        };
    }
}

/**
 * Generate an AI explanation for a trading signal — uses GROQ CLOUD
 */
async function generateSignalExplanation(symbol, signal, confidence, indicators, macro) {
    const prompt = `You are a professional cryptocurrency market analyst AI for the QuantAura platform. Generate a professional, plain-language explanation for this trading signal:

Asset: ${symbol}
Signal: ${signal} (${confidence}% confidence)
Technical Indicators: ${JSON.stringify(indicators)}
Macro Context: ${JSON.stringify(macro)}

Write a 3-4 sentence explanation that:
- Explains WHY this signal was generated based on the indicators provided
- References specific indicator values you see
- Provides actionable context
- DO NOT hallucinate external data

Respond with just the explanation text, no JSON.`;

    try {
        const chatCompletion = await groq.chat.completions.create({
            messages: [{ role: 'user', content: prompt }],
            model: GROQ_MODEL,
            temperature: 0.3,
        });
        return chatCompletion.choices[0].message.content.trim();
    } catch (err) {
        console.warn(`[Groq] Signal explanation failed: ${err.message}`);
        const rsiVal = indicators?.['RSI (14)']?.value || '50';
        const rsiStatus = indicators?.['RSI (14)']?.status || 'neutral';
        const macdNote = indicators?.['MACD']?.note || 'Neutral';

        if (signal === 'BUY') {
            return `${symbol} presents a compelling long opportunity with ${confidence}% confidence. RSI at ${rsiVal} sits in ${rsiStatus} territory, while MACD signals ${macdNote.toLowerCase()}.`;
        } else if (signal === 'SELL') {
            return `Caution advised: ${symbol} triggered a SELL with ${confidence}% confidence. RSI at ${rsiVal} (${rsiStatus}), alongside ${macdNote.toLowerCase()} on the MACD.`;
        } else {
            return `Market conditions dictate a HOLD for ${symbol} with ${confidence}% confidence. Technicals are mixed (${rsiStatus} RSI, ${macdNote.toLowerCase()} MACD) favoring capital preservation.`;
        }
    }
}

/**
 * Generate a news-based summary for a specific coin — uses GROQ CLOUD
 */
async function generateCoinNewsSummary(symbol, newsHeadlines) {
    const prompt = `You are the QuantAura AI. Based ONLY on the following recent news headlines, write an extremely concise 2-sentence summary (max 3 lines) of what is currently happening with ${symbol}. If no relevant news, summarize the general crypto market sentiment.

Recent News Headlines:
${newsHeadlines || 'No specific news headlines available at the moment.'}

Respond with just the short summary text, no intro, no JSON.`;

    try {
        const chatCompletion = await groq.chat.completions.create({
            messages: [{ role: 'user', content: prompt }],
            model: GROQ_MODEL,
            temperature: 0.3,
        });
        return chatCompletion.choices[0].message.content.trim();
    } catch (err) {
        console.warn(`[Groq] Coin news summary failed: ${err.message}`);
        return `AI news analysis temporarily unavailable for ${symbol}.`;
    }
}

/**
 * Generate a response for the Crypto Intelligence Chat — uses GROQ CLOUD
 */
async function generateCryptoChatResponse({ coin, marketData, userQuestion, history = [], signal = null, tradeability = null }) {
    // The assistant now sees the model's own prediction AND the measured worth
    // of that prediction. Both matter: without the signal it cannot answer the
    // questions users actually ask, and without the accuracy context it would
    // present a ~52%-directional signal as if it were a reliable call.
    const signalBlock = signal?.signal
        ? `QUANTAURA MODEL PREDICTION for ${coin}:
- Signal: ${signal.signal} (${signal.confidence}% ensemble confidence)
- Meaning: the 4-model ensemble expects ${coin}'s TREND REGIME 24 hours from now to be ${
            signal.signal === 'BUY' ? 'an uptrend' : signal.signal === 'SELL' ? 'a downtrend' : 'neutral/transitioning'
        }.
- Per-model votes: ${signal.per_model ? JSON.stringify(signal.per_model) : 'n/a'}`
        : 'QUANTAURA MODEL PREDICTION: unavailable right now.';

    const accuracyBlock = tradeability
        ? `MEASURED ACCURACY (held-out data, ${tradeability.n?.toLocaleString?.() || tradeability.n} predictions):
- Regime classification F1: ${(tradeability.regime_macro_f1 * 100).toFixed(1)}%
- Directional accuracy on issued signals: ${(tradeability.directional_accuracy * 100).toFixed(1)}% (50% = coin flip)
- Assumed round-trip cost: ${(tradeability.round_trip_cost * 100).toFixed(2)}%
- After costs, the average BUY signal does NOT clear its own fees.`
        : '';

    const systemPrompt = `You are QuantAura's market analyst assistant. You explain live market data and the platform's own ML predictions clearly and honestly.

WHAT YOU CAN DO:
- Describe price action, trend, range, volatility and volume from the data provided.
- Explain what the model's signal means and how confident it is.
- Explain the methodology: the ensemble predicts a 24h TREND REGIME (uptrend/neutral/downtrend), not a price target.
- Put the accuracy figures in context when performance comes up.

HARD RULES — these are not negotiable:
- NEVER tell the user to buy, sell, short, or hold. No entry prices, no exit prices, no stop losses, no take-profit levels, no position sizes, no leverage, no timeframes to hold.
- NEVER state or imply how much money someone should put into a trade.
- If asked "should I buy/sell?", "how much should I invest?", or "what trade should I make?", say plainly that you cannot give trading or investment advice, then offer what you CAN do: explain the data, the signal, and the model's measured accuracy so they can decide for themselves.
- NEVER present the signal as a guarantee or claim any figure is "100% accurate". Predictions are probabilistic and frequently wrong.
- If asked how accurate the system is, lead with directional accuracy (~52%), not the regime F1 (~81%) — quoting F1 alone invites the reader to hear it as a win rate.
- Use ONLY the numbers provided. Never invent prices, levels or statistics.

STYLE: Concise and conversational — 2 to 4 short paragraphs. Use **bold** for key figures. Never open with a greeting; answer directly.`;

    const userPrompt = `${coin} market data — ${marketData.windowLabel} (${marketData.candleCount} candles):
- Current price: ${marketData.close}
- Open: ${marketData.open} | High: ${marketData.high} | Low: ${marketData.low}
- Change over window: ${marketData.priceChangePercent}%
- High-low range: ${marketData.rangePercent}%
- Volatility (stdev of returns): ${marketData.volatilityPercent}%
- Volume: ${marketData.volume}

${signalBlock}

${accuracyBlock}

User question: ${userQuestion}`;

    try {
        const chatCompletion = await groq.chat.completions.create({
            messages: [
                { role: 'system', content: systemPrompt },
                // Prior turns so follow-ups like "why?" or "what about ETH?" work
                ...history.map(m => ({
                    role: m.role === 'ai' ? 'assistant' : 'user',
                    content: String(m.content).slice(0, 2000),
                })),
                { role: 'user', content: userPrompt },
            ],
            model: GROQ_MODEL,
            temperature: 0.3,
        });
        return chatCompletion.choices[0].message.content.trim();
    } catch (err) {
        console.error('Groq chat error:', err.message);
        return `Failed to generate response for ${coin}. The AI service might be temporarily unavailable.`;
    }
}


/* =========================================================================
   NOTE FOR FYP TEAM: LOCAL OLLAMA ML CODE IS COMMENTED OUT BELOW
   Uncomment this section and replace the functions above when you are 
   ready to test/deploy your custom fine-tuned Gemma 4 model locally!
========================================================================= */

/*
// ─── Ollama (Local Model for Custom Analysis) ───
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'gemma4';

async function callOllama(prompt, { json = false, timeout = 60000 } = {}) {
    const body = {
        model: OLLAMA_MODEL,
        prompt,
        stream: false,
    };
    if (json) body.format = 'json';
    const response = await axios.post(`${OLLAMA_URL}/api/generate`, body, { timeout });
    return response.data.response;
}

// async function generateNewsSummary(title, content = '') { ... uses callOllama }
// async function generateSignalExplanation(symbol, signal, confidence, indicators, macro) { ... uses callOllama }
// async function generateCoinNewsSummary(symbol, newsHeadlines) { ... uses callOllama }
*/

module.exports = { generateNewsSummary, generateSignalExplanation, generateCoinNewsSummary, generateCryptoChatResponse };
