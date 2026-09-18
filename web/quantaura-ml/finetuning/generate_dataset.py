import json
import random
from pathlib import Path

# Number of examples to generate
NUM_SAMPLES = 500

# Definitions of common indicator states
RSI_STATES = [
    (25, "Oversold", "BUY"), (32, "Leaning oversold", "BUY"), (45, "Neutral", "HOLD"),
    (55, "Neutral", "HOLD"), (75, "Overbought", "SELL"), (85, "Critically overbought", "SELL")
]

MACD_STATES = [
    ("Bullish Crossover", "BUY"), ("Bullish Divergence", "BUY"),
    ("Flat", "HOLD"), ("No Signal", "HOLD"),
    ("Bearish Crossover", "SELL"), ("Bearish Divergence", "SELL")
]

BB_STATES = [
    ("Lower Band", "BUY"), ("Near Lower Band", "BUY"),
    ("Middle Band", "HOLD"), ("Mid Range", "HOLD"),
    ("Upper Band", "SELL"), ("Near Upper Band", "SELL")
]

EMA_STATES = [
    ("Golden Cross", "BUY"), ("Strong Uptrend", "BUY"),
    ("Flat", "HOLD"), ("Consolidating", "HOLD"),
    ("Death Cross", "SELL"), ("Strong Downtrend", "SELL")
]

def generate_expert_explanation(signal, rsi, macd, bb, ema, confidence):
    """Generate a realistic trading explanation matching the given indicators."""
    if signal == "BUY":
        return (f"Bitcoin's technical structure presents a compelling long opportunity with {confidence}% confidence. "
                f"The RSI at {rsi[0]} is squarely in the {rsi[1].lower()} territory, suggesting the recent sell-off has exhausted supply. "
                f"Furthermore, momentum is shifting back to the upside as evidenced by a recent {macd[0].lower()} on the MACD. "
                f"With price testing the {bb[0].lower()} of the Bollinger Bands—historically a strong support area—and "
                f"the EMA alignment showing a {ema[0].lower()}, risk-reward ratios heavily favor bulls.")
    elif signal == "SELL":
        return (f"Caution is advised as technicals trigger a {signal} signal with {confidence}% confidence. "
                f"Momentum is extremely stretched, indicated by the RSI sitting deep in {rsi[1].lower()} territory at {rsi[0]}. "
                f"A leading indicator of capitulation is the emerging {macd[0].lower()} on the MACD histogram. "
                f"Given that Bitcoin is currently rejecting off the {bb[0].lower()} and "
                f"moving averages reflect a {ema[0].lower()}, long positions carry elevated risk at these levels.")
    else:
        return (f"The current market environment dictates a {signal} stance with {confidence}% confidence. "
                f"Oscillators like the RSI ({rsi[0]}) are completely {rsi[1].lower()}, indicating a lack of clear momentum. "
                f"The MACD is relatively {macd[0].lower()} and price action is hovering around the {bb[0].lower()} of the Bollinger Bands, "
                f"signaling ongoing consolidation. Until the {ema[0].lower()} on the EMAs breaks structurally, "
                f"capital preservation and patience are optimal.")


def generate_dataset():
    """Generates synthetic fine-tuning pairs."""
    dataset = []
    
    for _ in range(NUM_SAMPLES):
        signal = random.choice(["BUY", "SELL", "HOLD"])
        
        # Pick correlating indicators roughly matching the chosen signal
        if signal == "BUY":
            rsi = random.choice([r for r in RSI_STATES if r[2] == "BUY" or r[2] == "HOLD"])
            macd = random.choice([m for m in MACD_STATES if m[1] == "BUY" or m[1] == "HOLD"])
            bb = random.choice([b for b in BB_STATES if b[1] == "BUY" or b[1] == "HOLD"])
            ema = random.choice([e for e in EMA_STATES if e[1] == "BUY" or e[1] == "HOLD"])
            conf = random.randint(65, 95)
        elif signal == "SELL":
            rsi = random.choice([r for r in RSI_STATES if r[2] == "SELL" or r[2] == "HOLD"])
            macd = random.choice([m for m in MACD_STATES if m[1] == "SELL" or m[1] == "HOLD"])
            bb = random.choice([b for b in BB_STATES if b[1] == "SELL" or b[1] == "HOLD"])
            ema = random.choice([e for e in EMA_STATES if e[1] == "SELL" or e[1] == "HOLD"])
            conf = random.randint(65, 95)
        else:
            rsi = random.choice([r for r in RSI_STATES if r[2] == "HOLD"])
            macd = random.choice([m for m in MACD_STATES if m[1] == "HOLD"])
            bb = random.choice([b for b in BB_STATES if b[1] == "HOLD"])
            ema = random.choice([e for e in EMA_STATES if e[1] == "HOLD"])
            conf = random.randint(45, 64)

        indicators_json = {
            "RSI (14)": {"value": str(rsi[0]), "status": rsi[1].lower(), "note": rsi[1]},
            "MACD": {"value": macd[1], "status": "neutral", "note": macd[0]},
            "Bollinger": {"value": bb[0], "status": "neutral", "note": bb[0]},
            "EMA 10/50": {"value": ema[1], "status": "neutral", "note": ema[0]}
        }

        # Format exactly as the Node.js API sends it
        prompt = (f"You are the QuantAura AI engine. Generate a professional, plain-language explanation for this trading signal:\n\n"
                  f"Asset: BTC/USDT\n"
                  f"Signal: {signal} ({conf}% confidence)\n"
                  f"Technical Indicators: {json.dumps(indicators_json)}\n"
                  f"Macroeconomic Context: {{\"CPI\":\"2.9%\"}}\n\n"
                  f"Write a 3-4 sentence explanation that:\n"
                  f"- Explains WHY this signal was generated\n"
                  f"- References specific indicator values\n"
                  f"- Mentions macroeconomic factors\n"
                  f"- Provides actionable context\n\n"
                  f"Respond with just the explanation text, no JSON.")
        
        explanation = generate_expert_explanation(signal, rsi, macd, bb, ema, conf)

        # ShareGPT / OpenAI Chat Format
        conversation = {
            "messages": [
                {"role": "system", "content": "You are a professional cryptocurrency market analyst AI for the QuantAura platform."},
                {"role": "user", "content": prompt},
                {"role": "assistant", "content": explanation}
            ]
        }
        dataset.append(conversation)

    # Save to disk
    out_dir = Path(__file__).parent
    out_dir.mkdir(exist_ok=True, parents=True)
    out_file = out_dir / "quantaura_llm_finetune_data.jsonl"
    
    with open(out_file, "w", encoding="utf-8") as f:
        for item in dataset:
            f.write(json.dumps(item) + "\n")
            
    print(f"✅ Generated {NUM_SAMPLES} training examples at {out_file}")
    print("Upload this file to Google Colab to begin fine-tuning.")

if __name__ == "__main__":
    generate_dataset()
