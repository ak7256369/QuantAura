"""Orchestrator. Owns the failure policy:

  | Failure                          | Behaviour                               |
  |----------------------------------|-----------------------------------------|
  | signals API down or ta_fallback  | Skip the day, notify                    |
  | Binance down                     | Skip the day, notify                    |
  | Scoreboard unavailable           | Post without the record lines           |
  | Card render error                | Crash loudly (it is deterministic code) |
  | Media upload fails               | Post text-only, note it in the notify   |
  | Tweet rejected                   | Skip the day, notify                    |

A skipped day still commits its run log. The pipeline prefers a missed day to
a wrong or duplicate one.

  python pipeline.py --dry-run    synthetic data, no network, no post
  python pipeline.py --no-post    live data + card, publish nothing
  python pipeline.py --check      prove the X credentials work, publish nothing
  python pipeline.py --force      post even if the run log says today is done
"""
from __future__ import annotations

import argparse
import sys

import card
import compose
import fetch
import notify
import post
from common import PipelineAbort, config, log, posted_today, record_run


def run(dry_run: bool, no_post: bool, force: bool, check: bool = False) -> int:
    stage = "start"
    try:
        if posted_today() and not force:
            log.info("A post already went out today — nothing to do. (--force overrides)")
            return 0

        stage = "fetch"
        if dry_run:
            snapshot, score = fetch.synthetic(), fetch.synthetic_scoreboard()
            log.info("Dry run: synthetic snapshot, no network.")
        else:
            snapshot = fetch.collect()
            score = fetch.scoreboard()

        stage = "card"
        card_path = card.build(snapshot, score)

        stage = "compose"
        text = compose.tweet_text(snapshot, score)
        log.info("Tweet text:\n" + "\n".join(f"  | {ln}" for ln in text.splitlines()))

        if dry_run or no_post:
            record_run("built", stage, "Built but not posted "
                       + ("(dry run)" if dry_run else "(--no-post)"),
                       {"card": card_path.name})
            log.info("Not posting (flag set). Card is in build/.")
            return 0

        if check:
            # Everything a real run does except the post itself: authenticate,
            # then actually upload the card — the only way to prove the token
            # carries write permission, since a read-only token authenticates
            # fine and only fails at the write. An uploaded media id that is
            # never attached to a post is never visible to anyone and expires
            # unused within a day.
            stage = "auth"
            user = post.verify_credentials()
            stage = "media"
            media_id = post.upload_media(card_path)
            if media_id is None:
                raise PipelineAbort(
                    "Credentials authenticate but the media upload failed — the "
                    "access token most likely lacks write permission. Set the app "
                    "to Read and write, then REGENERATE the access token.")
            stage = "notify"
            alerted = notify.checked(snapshot, user.get("username", "?"),
                                     with_record=bool(score))
            log.info("Credential check passed — auth OK, write OK, nothing posted.")
            log.info(f"  Operator alert: {'delivered' if alerted else 'NOT configured/failed'}")
            record_run("checked", stage, f"Credential check passed as "
                       f"@{user.get('username')} — nothing posted.",
                       {"media_id": media_id, "telegram": alerted})
            return 0

        stage = "media"
        media_id = post.upload_media(card_path)
        if media_id is None and config()["post"]["require_media"]:
            raise PipelineAbort("Media upload failed and post.require_media is true.")

        stage = "tweet"
        tweet_id = post.create_tweet(text, media_id)

        record_run("posted", stage, f"https://x.com/i/status/{tweet_id}",
                   {"signal": snapshot["signal"], "media": bool(media_id)})
        notify.posted(snapshot, tweet_id, with_media=bool(media_id))
        return 0

    except PipelineAbort as e:
        log.warning(f"Skipping today at stage '{stage}': {e}")
        record_run("skipped", stage, str(e))
        if not dry_run:
            notify.skipped(str(e), stage)
        return 0
    except Exception as e:                                       # noqa: BLE001
        log.error(f"Crashed at stage '{stage}': {type(e).__name__}: {e}")
        record_run("crashed", stage, f"{type(e).__name__}: {e}")
        if not dry_run:
            notify.crashed(f"{type(e).__name__}: {e}", stage)
        return 1


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--dry-run", action="store_true",
                    help="synthetic data, no API calls, no post")
    ap.add_argument("--no-post", action="store_true",
                    help="live data and card, but publish nothing")
    ap.add_argument("--force", action="store_true",
                    help="post even if the run log says today already went out")
    ap.add_argument("--check", action="store_true",
                    help="verify the X credentials end to end, publishing nothing")
    args = ap.parse_args()
    sys.exit(run(args.dry_run, args.no_post, args.force, args.check))


if __name__ == "__main__":
    main()
