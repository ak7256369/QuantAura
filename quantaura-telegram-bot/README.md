# quantaura-telegram-bot

Telegram signal delivery for [QuantAura](https://quantaura.tech): premium
subscribers get a DM the moment the ensemble's call flips plus a daily digest
of every tracked symbol; a public channel gets the direction-only BTC teaser as the
free funnel.

Split out of the product monorepo on 2026-08-07 — one repo per ecosystem
output (product, YouTube, Telegram, X), connected through the product's
public API and shared database.

## How it connects to the product

Three seams, all deliberate:

1. **Signals over HTTP.** The bot reads `/api/signals` as a premium caller —
   never ml-api directly — so tier redaction has exactly one implementation.
   A `ta_fallback` response is refused outright: paid subscribers never
   receive a TA heuristic dressed as the ensemble's call.
2. **Shared MongoDB, trimmed schemas.** Pairing state lives on the API's
   `users` collection (`telegram.*` subdocument — the website's account page
   drives pairing via `quantaura-api/routes/telegram.js`). This repo's
   `models/User.js` and `models/Settings.js` are **trimmed mirrors** declaring
   only the paths the bot touches; the source of truth is quantaura-api.
   Change `telegram.*`, `plan`/`planExpiresAt` or `hasPremium()` semantics in
   either repo → mirror it in the other.
3. **Shared JWT_SECRET.** `lib/token.js` self-signs the service token that
   quantaura-api verifies. Same `.env` values for `MONGODB_URI` and
   `JWT_SECRET` on both processes.

## Design in one paragraph

Premium delivery is **per-user DM, not a private channel**, so access control
is `User.hasPremium()` evaluated at send time — the identical lazy-expiry rule
the API uses everywhere. No invite links, no membership revocation, no
reconciliation cron whose silent death comps expired subscribers. Account
pairing is a 15-minute single-use code generated on quantaura.tech/account and
typed (or deep-linked) into the bot — users are never asked for a password in
chat. Every signal-bearing message carries the not-financial-advice footer,
and the welcome message points at the public accuracy report (~52%
directional) before anything else.

## Running

```
node bot.js                 # production (PM2 app "quantaura-bot")
BOT_DRY_RUN=1 node bot.js   # everything real except sending; messages print
npm test                    # 32-assertion harness against an in-memory Mongo
```

Required env: `TELEGRAM_BOT_TOKEN`, `MONGODB_URI`, `JWT_SECRET` (latter two
must match quantaura-api's). See `.env.example`.

## Setup checklist (once)

1. @BotFather → `/newbot` → token into `.env`; bot name into
   `TELEGRAM_BOT_USERNAME` here **and** in quantaura-api's `.env` (it builds
   the account page's deep link).
2. @BotFather → `/setcommands` → paste:
   ```
   link - Connect your QuantAura account
   signals - Current model calls
   status - Your plan and delivery settings
   alerts - Toggle change alerts on/off
   digest - Toggle the daily digest on/off
   unlink - Disconnect this Telegram account
   help - All commands
   ```
3. Create the public channel, add the bot as admin with post rights, set
   `TELEGRAM_FREE_CHANNEL_ID`.
4. Repo secrets for deploy: `SERVER_HOST`, `SERVER_USER`, `SERVER_SSH_KEY`
   (the PEM key itself or its base64 — same values as the product repo's
   deploy).
5. First deploy stops at "no .env" by design: create
   `/home/quantaura.tech/bots/quantaura-telegram-bot/.env` on the server from
   `.env.example`, then re-run the deploy.

## Timing

- Signal poll: minute 6 past each 4h close (00/04/08/12/16/20 UTC) — the only
  moments the ensemble's call can change. Also once at startup, so a restart
  that straddled a close still pushes the flip.
- Digest + free-channel daily post + expiry notices: 12:00 UTC, once per day,
  guarded by `BotState` in Mongo so restarts can't double-send.

## Files

- `bot.js` — process entry: DB, schedules, Telegram long-poll loop
- `bot/client.js` — minimal Bot API client (no library; 4 methods)
- `bot/config.js` — env-driven configuration
- `bot/signals.js` — premium reads over the public API, self-signed JWT
- `bot/commands.js` — /link, /signals, /status, toggles, /unlink
- `bot/push.js` — change detection, digest, free channel, unreachable latching
- `bot/format.js` — every message body; carries the honesty footer
- `models/` — BotState (bot-owned) + trimmed User/Settings mirrors
- `lib/token.js` — service JWT compatible with quantaura-api
