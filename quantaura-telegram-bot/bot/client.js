/**
 * A minimal Telegram Bot API client.
 *
 * No library: the bot needs four methods (getMe, getUpdates, sendMessage,
 * deleteWebhook) and the wrapper libraries bring an event framework, their own
 * polling loop and a dependency tree, none of which this process wants. The
 * channel pipeline already calls the same API by hand from notify.py, so this
 * keeps one mental model across both halves of the project.
 *
 * Long polling rather than a webhook: a webhook needs a public HTTPS route,
 * nginx configuration and a secret path, all of which are deployment surface
 * for a bot with a handful of users. getUpdates works from anywhere, including
 * a laptop during development, with no inbound firewall hole.
 */
const API_ROOT = 'https://api.telegram.org';

/** Telegram's own hard limit on a message body. */
const MAX_MESSAGE_LEN = 4096;

class TelegramError extends Error {
    constructor(message, { code = 0, description = '', retryAfter = 0 } = {}) {
        super(message);
        this.name = 'TelegramError';
        this.code = code;
        this.description = description;
        this.retryAfter = retryAfter;
    }

    /** True when the chat can never be delivered to again without user action:
     *  they blocked the bot, deleted their account, or the chat is gone.
     *  Distinguished from transient failures so the sender can stop retrying. */
    get isUnreachable() {
        if (this.code === 403) return true;
        if (this.code !== 400) return false;
        const d = this.description.toLowerCase();
        return d.includes('chat not found') || d.includes('user is deactivated');
    }
}

class TelegramClient {
    constructor(token, { log = console } = {}) {
        if (!token) throw new Error('TELEGRAM_BOT_TOKEN is required');
        this.token = token;
        this.log = log;
    }

    async call(method, payload = {}, { timeoutMs = 30000, retries = 2 } = {}) {
        const url = `${API_ROOT}/bot${this.token}/${method}`;
        let lastErr;

        for (let attempt = 0; attempt <= retries; attempt++) {
            let res;
            try {
                res = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                    signal: AbortSignal.timeout(timeoutMs),
                });
            } catch (err) {
                // Network-level failure (DNS, reset, timeout). Worth retrying.
                lastErr = new TelegramError(`${method}: ${err.message}`, { code: 0 });
                await sleep(1000 * (attempt + 1));
                continue;
            }

            const body = await res.json().catch(() => ({}));
            if (body.ok) return body.result;

            const err = new TelegramError(
                `${method} failed: ${body.description || res.status}`,
                {
                    code: body.error_code || res.status,
                    description: body.description || '',
                    retryAfter: body.parameters?.retry_after || 0,
                },
            );

            // Permanent for this chat — retrying cannot help and would only
            // slow the broadcast down.
            if (err.isUnreachable) throw err;

            // 429: Telegram tells us exactly how long to wait. Honour it rather
            // than backing off blindly, or the next attempt earns another 429.
            if (err.code === 429 && attempt < retries) {
                const wait = Math.min((err.retryAfter || 1) + 1, 60);
                this.log.warn?.(`Telegram rate-limited ${method}; waiting ${wait}s`);
                await sleep(wait * 1000);
                lastErr = err;
                continue;
            }

            // 409 means another process is polling the same bot token. Retrying
            // will never win that fight — surface it so the caller can stop.
            if (err.code === 409) throw err;

            if (attempt < retries) {
                lastErr = err;
                await sleep(1000 * (attempt + 1));
                continue;
            }
            throw err;
        }
        throw lastErr;
    }

    getMe() {
        return this.call('getMe', {}, { retries: 1 });
    }

    /** Clears any webhook left over from earlier experiments. getUpdates and a
     *  webhook are mutually exclusive — with one set, polling silently returns
     *  nothing forever, which is a miserable thing to debug. */
    deleteWebhook() {
        return this.call('deleteWebhook', { drop_pending_updates: false }, { retries: 1 });
    }

    /**
     * Long-poll for updates. `timeoutSeconds` is server-side: the request hangs
     * until an update arrives or the timeout expires, so an idle bot makes ~1
     * request a minute rather than spinning.
     */
    getUpdates(offset, timeoutSeconds = 50) {
        return this.call(
            'getUpdates',
            {
                offset,
                timeout: timeoutSeconds,
                allowed_updates: ['message', 'my_chat_member'],
            },
            // The HTTP timeout must outlast the long poll or every poll aborts.
            { timeoutMs: (timeoutSeconds + 15) * 1000, retries: 1 },
        );
    }

    sendMessage(chatId, text, { buttons, preview = false, silent = false } = {}) {
        const payload = {
            chat_id: chatId,
            text: truncate(text),
            parse_mode: 'HTML',
            link_preview_options: { is_disabled: !preview },
            disable_notification: silent,
        };
        if (buttons) payload.reply_markup = { inline_keyboard: buttons };
        return this.call('sendMessage', payload);
    }
}

/** Telegram rejects over-long messages outright. Cutting at the limit keeps a
 *  long digest deliverable instead of dropping it entirely. */
function truncate(text) {
    if (text.length <= MAX_MESSAGE_LEN) return text;
    return `${text.slice(0, MAX_MESSAGE_LEN - 20)}\n…(truncated)`;
}

/** Escapes text for parse_mode: 'HTML'. Every value that came from a user or
 *  from an upstream API must go through this — a display name containing "<"
 *  otherwise makes Telegram reject the whole message as malformed entities. */
function esc(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

module.exports = { TelegramClient, TelegramError, esc, sleep, MAX_MESSAGE_LEN };
