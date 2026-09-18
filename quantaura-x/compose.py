"""The tweet text.

Assembled from the snapshot's numbers only — nothing free-written, so there is
nothing to fact-check. The direction-and-nothing-else rule mirrors the free
Telegram channel: confidence, the per-model votes and the probability split
are the paid product, and a post that leaked them would undercut the thing it
exists to sell.
"""
from __future__ import annotations

import re

from common import PipelineAbort, config

MARK = {"BUY": "🟢", "SELL": "🔴", "HOLD": "🟡"}

# X counts astral-plane codepoints (every emoji here) as 2, URLs as a flat 23.
_URL = re.compile(r"https?://\S+")


def weighted_len(text: str) -> int:
    stripped = _URL.sub("", text)
    n_urls = len(_URL.findall(text))
    n = sum(2 if ord(ch) > 0xFFFF else 1 for ch in stripped)
    return n + n_urls * config()["post"]["url_weight"]


def tweet_text(snapshot: dict, score: dict | None) -> str:
    cfg = config()
    site = cfg["channel"]["site_url"]
    sig = snapshot["signal"]

    lines = [
        f"{MARK.get(sig, '⚪')} {snapshot['asset_label']} — today's call: {sig}",
        "",
        f"Price {snapshot['price_str']}"
        + (f" ({snapshot['change_24h_pct']:+.2f}% in 24h)"
           if snapshot.get("change_24h_pct") is not None else ""),
    ]
    if score and score.get("resolved_calls"):
        lines.append(
            f"Record: {score.get('hits', 0)}W/{score.get('misses', 0)}L · "
            f"{score['accuracy_pct']:.0f}% over {score['resolved_calls']} graded calls "
            f"— wins and losses, all public")
    lines += [
        "",
        f"Confidence + the 4 models' votes: {site}",
    ]

    # The same call goes out on YouTube and Telegram, and a reader who found us
    # here should be able to find those. But a URL costs a flat 23 weighted
    # chars, and on a day with a long record line there is not room for one.
    # The numbers are the product, so links are strictly the thing that yields:
    # each is appended only if it still fits, and dropped silently otherwise.
    # The card carries the same handles unconditionally, so nothing is lost.
    tail = ["", cfg["post"]["disclaimer"]]
    links = cfg.get("links") or {}
    for label, url in (("Daily video", links.get("youtube")),
                       ("Free channel", links.get("telegram"))):
        if not url:
            continue
        candidate = lines + [f"{label}: {url}"] + tail
        if weighted_len("\n".join(candidate)) <= cfg["post"]["max_chars"]:
            lines.append(f"{label}: {url}")

    text = "\n".join(lines + tail)

    n = weighted_len(text)
    if n > cfg["post"]["max_chars"]:
        # Structurally this text cannot exceed 280 — if it does, something
        # upstream changed shape and a human should look before anything posts.
        raise PipelineAbort(f"Composed tweet is {n} weighted chars (max "
                            f"{cfg['post']['max_chars']}). Refusing to truncate numbers.")
    return text
