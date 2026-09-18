# quantaura-x

Daily X (Twitter) post for [QuantAura](https://quantaura.tech): the ensemble's
Bitcoin call — direction only — plus the public accuracy record, on a rendered
card. The X-shaped end of the same funnel the free Telegram channel and the
YouTube Shorts feed.

One repo per ecosystem output (product, YouTube, Telegram, X), connected
through the product's public API.

```
fetch (free tier, on purpose) → card (Pillow) → compose (≤280) → post → notify
```

## Why it is built this way

| Decision | Reason |
|---|---|
| Calls the API **unauthenticated** | The free tier's redaction *is* the content policy. Confidence, per-model votes and probabilities are the paid product; a caller that never receives them cannot leak them. |
| Refuses `ta_fallback` | Same rule as every other output: the premise is the ML ensemble's call, and a TA heuristic wearing its branding would be a different product. |
| Record fetched from quantaura-youtube's `state/scoreboard.json` | One scoreboard, one grader. This repo never grades calls, so its numbers can never disagree with the channel's. |
| Card drawn with Pillow, not generated | An image model cannot be relied on to render a price correctly. Same rule as the video thumbnails. |
| Text assembled from numbers, never free-written | Nothing to fact-check, nothing to hallucinate. |
| Media failure posts text-only | The text carries the content; the card is presentation. A missing image is invisible, a missed day is a gap in the record. |
| OAuth 1.0a, not OAuth2 | The app keys never expire mid-run; an unattended pipeline should not own a token-refresh dance the free tier doesn't require. |

## Running

```bash
pip install -r requirements.txt
python pipeline.py --dry-run    # synthetic data, no network, no post — writes build/card.png
python pipeline.py --no-post    # live data + card + text, publishes nothing
python pipeline.py              # the real thing (needs the X_* secrets)
```

## Schedule

18:30 UTC daily (`daily-post.yml`), with a 21:30 catch-up slot — half an hour
behind the daily video so its graded scoreboard is committed first, and timed
for the US afternoon window. GitHub's cron is best-effort, and
`common.posted_today()` makes the second slot a no-op when the first fired. The run log (`state/runs.jsonl`) commits back to main after
every run, success or skip.

## Secrets

| Secret | Needed for | How to get it |
|---|---|---|
| `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_SECRET` | Posting | [developer.x.com](https://developer.x.com) → create a project + app (Free tier) → keys & tokens. Generate the access token/secret with **Read and write** permission — set the app's permission first, then (re)generate. |
| `SCOREBOARD_TOKEN` | The public-record lines | GitHub → Settings → Developer settings → fine-grained PAT, **contents: read** on `ak7256369/quantaura-youtube` only. Optional: without it the post omits the record. |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Operator notifications | Same values as the other pipelines. Optional. |

Free-tier X budget is ~500 writes/month; the pipeline spends at most 62
(one media upload + one tweet per day).

## Failure policy

| Failure | Behaviour |
|---|---|
| signals API down, or serving a TA fallback | Skip the day, notify |
| Binance down | Skip the day, notify |
| Scoreboard unavailable | Post without the record lines |
| Media upload fails | Post text-only, note it in the notification |
| Tweet rejected (quota, auth) | Skip the day, notify |
| Actions outage | `workflow_dispatch` — trigger by hand from a phone |

A skipped day still commits its run log. The pipeline prefers a missed day to
a wrong or duplicate one.

## Files

| File | Job |
|---|---|
| `pipeline.py` | Orchestrator. Owns the failure policy. |
| `fetch.py` | Free-tier signal, Binance price, channel scoreboard |
| `card.py` | The 1600×900 Pillow card |
| `compose.py` | Tweet text from numbers, weighted-length checked |
| `post.py` | X API v2: media upload + tweet create |
| `notify.py` | Telegram operator messages |
| `state/` | Append-only run log. Committed after every run. |
