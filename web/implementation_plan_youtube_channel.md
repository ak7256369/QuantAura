# Implementation Plan — Autonomous QuantAura YouTube Channel

**Goal:** A faceless, English-language YouTube channel that publishes a daily BTC video
(and later a weekly recap) generated end-to-end by an automated pipeline: data from the
QuantAura ensemble → LLM-written script → chart-driven video + AI voice → auto-upload.
Total running cost: **$0/month** (free API tiers + tools already paid for).

**Channel identity (the honest-scoreboard angle):** every video shows the model's daily
call *and* its live, public accuracy record — including the losses. No hype, no "buy
now". This is the differentiator vs. every other AI crypto channel, it keeps us clear of
"financial advice" territory, and it defeats YouTube's mass-produced-content policy
because every video contains genuinely unique data and narrative.

---

## 1. Architecture

```
┌─────────────────────── GitHub Actions (daily cron, ~13:00 UTC) ───────────────────────┐
│                                                                                       │
│  1. FETCH      GET quantaura.tech /api/signals + /api/signals/stats  (VPS, existing)  │
│                GET Binance public API → BTC OHLC for the chart                        │
│  2. SCORE      Compare yesterday's stored call vs. actual 24h outcome                 │
│                → update state/ (committed to `main`; deploy.yml ignores channel/**)   │
│  3. WRITE      Gemini API free tier (fallback: Groq Llama-3.3-70B) → narration JSON   │
│  4. VERIFY     Second LLM pass: every number in the script must match source data;    │
│                regenerate on mismatch (max 2 retries, else abort + notify)            │
│  5. VOICE      Kokoro-82M TTS, runs on the runner CPU (open source, Apache 2.0)       │
│  6. RENDER     matplotlib → animated chart frames → ffmpeg 1080×1920 Short            │
│                (pre-made Veo intro/outro assets from Google AI Pro, stored in repo)   │
│  7. UPLOAD     YouTube Data API v3 (OAuth refresh token in GH secrets)                │
│  8. NOTIFY     Telegram/email: video link + today's numbers                           │
│                                                                                       │
└───────────────────────────────────────────────────────────────────────────────────────┘

VPS (yottasrc / quantaura.tech)  — data source only: the node API already proxies
                                   ml-api's /predict and /stats. No new load on the box.
Repo `main`, channel/state/      — persistent state: daily prediction log + scoreboard.
                                   Committed by CI each run. deploy.yml gained a
                                   paths-ignore for channel/** and **/*.md, so a
                                   scoreboard commit no longer rebuilds the site.
                                   (An orphan `channel-data` branch was the original
                                   design; committing to main is simpler and matches
                                   what the autopilot already does with model weights.)
```

**Why the pipeline runs on the Actions runner, not the VPS:** the runner has 7 GB RAM /
2 cores free for 2,000 min/month (private repo) — rendering + TTS take ~10 min/day ≈
300 min/month, well inside quota. The VPS is small (ml-api alone is capped at 1.2 GB)
and already busy serving the site; it stays a pure data source, which also means a
render bug can never take quantaura.tech down.

---

## 2. Repo layout (new top-level module)

```
channel/
  README.md              # how to run locally, secrets needed
  requirements.txt       # requests, matplotlib, pillow, kokoro-onnx, google-api-python-client, ...
  config.yaml            # schedule, voice id, video spec, API endpoints, retry policy
  pipeline.py            # orchestrator: fetch → score → write → verify → voice → render → upload
  fetch.py               # ml-api /predict + /stats, Binance OHLC, Fear&Greed
  scoreboard.py          # prediction log append + accuracy stats (all-time, 30d, streak)
  scriptwriter.py        # LLM call (Gemini primary, Groq fallback) + JSON schema validation
  factcheck.py           # LLM verification pass: numbers in script == numbers in data
  voice.py               # Kokoro TTS → wav + per-sentence timings (for captions)
  render.py              # matplotlib chart animation + captions + intro/outro → mp4 via ffmpeg
  thumbnail.py           # Pillow text overlay on weekly Nano Banana backgrounds
  upload.py              # YouTube Data API upload + metadata + AI-content disclosure
  notify.py              # Telegram bot message (or email fallback)
  assets/
    intro.mp4            # one-time Veo generation (Google AI Pro / Flow) — reused daily
    outro.mp4            # one-time Veo: disclaimer + subscribe card
    thumb_bg_*.png       # weekly Nano Banana backgrounds
    fonts/               # licensed-free font (e.g. Inter)
  prompts/
    daily_script.md      # system prompt: tone, structure, hard rules (see §5)
    factcheck.md
    weekly_recap.md
.github/workflows/
  daily-video.yml        # cron schedule + workflow_dispatch for manual runs
```

---

## 3. Free-resource stack (final)

| Stage | Tool | Free limit | Daily need |
|---|---|---|---|
| Predictions | own ml-api on VPS | n/a | 1 call |
| Market data | Binance public REST | 1200 req/min unauth | ~3 calls |
| Script | Gemini API (AI Studio key) | free tier, changes often | ~4 calls (write + verify + retries) |
| Script fallback | Groq Llama-3.3-70B | ~1k req/day | 0 (standby) |
| Voice | Kokoro-82M (local on runner) | unlimited | ~90 s audio |
| Video | matplotlib + ffmpeg | unlimited | 1 render |
| Branding assets | Veo via Google AI Pro (Flow app) | monthly sub quota | one-time |
| Thumbnails | Nano Banana (AI Studio free) + Pillow | ~hundreds/day | 1/week |
| Upload | YouTube Data API | 10,000 units/day (upload = 1,600) | 1 upload |
| Compute | GitHub Actions | 2,000 min/mo private repo | ~10 min |
| Notify | Telegram Bot API | free | 1 msg |
| State | git `channel-data` branch | free | 1 commit |

---

## 4. Daily Short — content template (~60–75 s)

1. **Hook (0–5 s):** Veo intro + headline caption: "BTC Model Call — Aug 5" .
2. **The call (5–20 s):** animated price chart (last 7 d), model signal overlaid
   (BUY/SELL/HOLD + confidence %). If the confidence gate suppressed a signal, say so —
   "the model saw an up-move but confidence was below threshold, so it's a HOLD".
3. **Why (20–40 s):** 2–3 sentences from the LLM grounded in real data: regime, which
   ensemble members agreed/disagreed (lstm/transformer/xgb/kan probabilities are in the
   /predict response), fear & greed, funding.
4. **Scoreboard (40–55 s):** yesterday's call vs. what happened; running accuracy
   (all-time %, last 30 d, current streak). Shown as an on-screen table. Wins AND losses.
5. **Outro (55–75 s):** Veo outro + "research project, not financial advice" +
   subscribe. Same disclaimer is in every description.

**Captions:** burned-in, sentence-level, timed from Kokoro's audio segments — Shorts are
mostly watched muted; captions are non-negotiable.

**Weekly long-form (Phase 5, Sundays, 3–5 min):** the week's 7 calls reviewed, accuracy
trend chart, one "how the model works" educational segment rotating through topics pulled
from `quantaura-ml/research/` (thesis_chapter.md, model_findings.md — months of free
content already written). Gets a real Nano Banana + Pillow thumbnail.

---

## 5. Guardrails (what makes unattended publishing safe)

Hard rules enforced in code, not just in the prompt:

1. **Schema-validated LLM output.** The scriptwriter must return JSON
   (`{title, description, tags, narration_sentences[], overlay_texts[]}`); invalid JSON
   → retry → fallback provider → abort. Free-form text is never trusted.
2. **Numeric fact-check pass.** `factcheck.py` gives a second LLM the source data + the
   script and asks it to flag any number/claim not present in the data. Any flag →
   regenerate. Two failures → **no video today**, Telegram alert instead. A skipped day
   is invisible; a hallucinated claim is permanent.
3. **Banned-phrase filter** (regex, deterministic): "financial advice", "guaranteed",
   "you should buy/sell", "can't lose", price targets not from the model, etc.
4. **Fixed disclaimer** appended in code to every narration and description — never
   generated, never omitted.
5. **AI-content disclosure:** channel-level default in YouTube Studio ("altered or
   synthetic content" = yes) + noted in every description. Required by YouTube policy.
6. **Scoreboard integrity:** accuracy numbers come only from `scoreboard.py` computed
   over the committed prediction log — the LLM receives them as input and may not
   compute or restate its own statistics.

---

## 6. Phases

### Phase 0 — Manual setup (user, ~2–3 h total, one-time)
The only genuinely human steps in the whole project:

- [ ] **P0.1** Create the YouTube channel (brand account, not personal). Pick name/handle.
- [ ] **P0.2** Google Cloud project → enable YouTube Data API v3 → OAuth consent screen
      (external) → desktop-app OAuth client. Run the one-time local script (provided in
      `channel/README.md`) to mint a **refresh token**; store in GH secrets.
- [ ] **P0.3** Get an **AI Studio API key** (Gemini + Nano Banana) and a **Groq API key**.
- [ ] **P0.4** Create a Telegram bot (@BotFather) → token + chat id.
- [ ] **P0.5** Generate one-time brand assets in Flow/Gemini app with the AI Pro plan:
      ~5 s intro, ~8 s outro, channel banner, avatar. Drop into `channel/assets/`.
- [ ] **P0.6** In YouTube Studio: set upload defaults (synthetic-content disclosure,
      category, base description with disclaimer).
- [ ] **P0.7** Add GH secrets: `GEMINI_API_KEY`, `GROQ_API_KEY`, `YT_CLIENT_ID`,
      `YT_CLIENT_SECRET`, `YT_REFRESH_TOKEN`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.
- [ ] **P0.8** (Later, before going public-auto) Submit the YouTube **API audit** —
      unverified API projects have uploads locked to private. Until approved, the
      pipeline uploads private and you flip to public in one tap from the phone —
      that IS the review step of Phase 4, so nothing is wasted.

### Phase 1 — Data + script core (build, ~1 session)
- `fetch.py`, `scoreboard.py`, `scriptwriter.py`, `factcheck.py` + prompts.
- Run locally against live quantaura.tech; output: validated script JSON + updated
  scoreboard from a seeded prediction log.
- **Exit test:** 3 consecutive days of locally generated scripts with zero factual errors.

### Phase 2 — Voice + render (build, ~1–2 sessions)
- `voice.py` (Kokoro), `render.py` (chart animation, captions, asset stitching),
  `thumbnail.py`.
- **Exit test: video #1 exists** — watch it, judge pacing/voice/design, iterate on the
  template. This is the taste checkpoint; everything downstream reuses it.

### Phase 3 — Upload + automation (build, ~1 session)
- `upload.py`, `notify.py`, `pipeline.py`, `daily-video.yml` (cron + manual dispatch),
  `channel-data` branch bootstrap.
- Pipeline runs fully unattended, uploads **private**, sends Telegram link.

### Phase 4 — Supervised autopilot (2–4 weeks, ~2 min/day of user time)
- Daily: pipeline runs → you get the Telegram message → watch the video → tap public.
- Track failures; each one becomes a code fix, not a process change.
- **Exit criteria to full-auto:** 14 consecutive days with zero factual/rendering
  errors AND YouTube API audit approved → set `visibility: public` in config. From then
  on the channel is 100% autonomous; your involvement drops to the weekly glance.

### Phase 5 — Growth loop (after stable dailies)
- Weekly long-form recap video (Sundays).
- YouTube Analytics API pulled weekly → retention/CTR per video fed back into the
  scriptwriter prompt (hook styles that retain better win).
- Title A/B via alternating templates; thumbnail refresh monthly.
- Milestone: monetization application at 1k subs / 10M Shorts views (90 d) — YPP allows
  AI-voice content when it has original value; the unique daily data + disclosure is
  exactly what their "inauthentic content" policy carves out.

---

## 7. Failure policy

| Failure | Behaviour |
|---|---|
| ml-api down / bad response | retry 3× over 30 min → skip day + Telegram alert |
| Gemini quota/refusal | automatic Groq fallback |
| Fact-check fails twice | skip day + alert (never publish unverified numbers) |
| Render/ffmpeg error | skip day + alert with log excerpt |
| Upload quota/auth error | keep mp4 as workflow artifact (7 d) + alert → manual upload |
| Actions outage | `workflow_dispatch` manual trigger from phone |

A missed day costs nothing. A wrong video costs trust. The pipeline always prefers
silence over risk.

## 8. Known risks & honest notes

- **Free tiers drift.** Gemini/Groq limits change with ~monthly cadence; the two-provider
  design plus schema validation means a provider change is a config edit, not a rewrite.
- **Shorts don't get custom thumbnails** — the thumbnail work only matters for the weekly
  long-form. Daily effort goes into the first-frame design instead.
- **Kokoro is English-only, no cloning** — fine for this plan; if a signature voice
  matters later, that's the one place a paid tool (ElevenLabs) would earn its cost.
- **Growth is not guaranteed.** The pipeline guarantees consistency (the #1 failure point
  of faceless channels); the honest-scoreboard angle is the bet for discovery. Review at
  90 days with real analytics.
- **The model's calls will be wrong often** (~52% directional — see research memory).
  That is *content*, not a bug: the channel's thesis is watching an ML model get tested
  in public. The scoreboard section is the product.
