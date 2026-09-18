"""Operator notifications over Telegram.

The pipeline is unattended, so the only thing standing between a silent failure
and a dead account is that every run — success, skip, or crash — reports
itself. A missing bot token degrades to a log line rather than an error:
notification is observability, not a dependency.
"""
from __future__ import annotations

import html

import requests

from common import env, log

API = "https://api.telegram.org/bot{token}/sendMessage"


def _send(text: str) -> bool:
    token = env("TELEGRAM_BOT_TOKEN")
    chat_id = env("TELEGRAM_CHAT_ID")
    if not (token and chat_id):
        log.info("  (Telegram not configured — notification skipped)")
        return False
    try:
        r = requests.post(API.format(token=token),
                          json={"chat_id": chat_id, "text": text[:4000],
                                "parse_mode": "HTML",
                                "disable_web_page_preview": True},
                          timeout=30)
        if r.status_code != 200:
            log.warning(f"  Telegram notification failed: HTTP {r.status_code}")
        return r.status_code == 200
    except Exception as e:                                       # noqa: BLE001
        log.warning(f"  Telegram notification failed: {e}")
        return False


def _esc(v) -> str:
    return html.escape(str(v))


def posted(snapshot: dict, tweet_id: str, with_media: bool) -> None:
    lines = [
        "<b>✅ X post published</b>",
        "",
        f"Call: <b>{_esc(snapshot['signal'])}</b> · {_esc(snapshot['price_str'])}"
        f" ({_esc(snapshot.get('change_24h_pct'))}% 24h)",
        f"🔗 https://x.com/i/status/{_esc(tweet_id)}",
    ]
    if not with_media:
        lines.append("⚠️ Card upload failed — went out text-only.")
    _send("\n".join(lines))


def checked(snapshot: dict, username: str, with_record: bool) -> bool:
    """Sent by `pipeline.py --check`. Returns whether Telegram accepted it.

    The check verifies every other link in the chain, so it verifies this one
    too — otherwise a wrong token or chat id stays invisible until the day
    something breaks and the alert that was supposed to tell you never comes.
    """
    return _send("\n".join([
        "<b>✅ X credential check passed</b>",
        "",
        f"Account: <b>@{_esc(username)}</b>",
        f"Auth OK · media upload OK · <b>nothing posted</b>",
        "",
        f"Today's card would read: {_esc(snapshot['signal'])} · "
        f"{_esc(snapshot['price_str'])}",
        ("Public record: included" if with_record
         else "⚠️ Public record: omitted (SCOREBOARD_TOKEN not set)"),
        "",
        "If you are reading this, operator alerts work.",
    ]))


def skipped(reason: str, stage: str = "") -> None:
    _send("\n".join([
        "<b>🚫 No X post today</b>",
        "",
        f"Stage: {_esc(stage or 'unknown')}",
        f"Reason: {_esc(reason)}",
        "",
        "Nothing was posted. The pipeline prefers a missed day to a wrong one.",
    ]))


def crashed(error: str, stage: str = "") -> None:
    _send("\n".join([
        "<b>💥 X pipeline crashed</b>",
        "",
        f"Stage: {_esc(stage or 'unknown')}",
        f"<code>{_esc(error[:800])}</code>",
    ]))
