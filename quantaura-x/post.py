"""Publish to X.

OAuth 1.0a user context (the four keys from the developer portal), because the
free tier's write access works with it and it never expires mid-run the way an
OAuth2 user token can in an unattended pipeline.

Media goes through the v2 upload endpoint, with the legacy v1.1 endpoint as a
fallback while accounts migrate at different speeds. The post itself is always
v2 /2/tweets. Free-tier budget is ~500 writes/month; this pipeline spends at
most 62 (one media + one tweet per day).
"""
from __future__ import annotations

from pathlib import Path

from requests_oauthlib import OAuth1

from common import PipelineAbort, env, http_session, log

TWEET_URL = "https://api.x.com/2/tweets"
MEDIA_V2_URL = "https://api.x.com/2/media/upload"
MEDIA_V11_URL = "https://upload.twitter.com/1.1/media/upload.json"
ME_URL = "https://api.x.com/2/users/me"


def _auth() -> OAuth1:
    return OAuth1(
        env("X_API_KEY", required=True),
        env("X_API_SECRET", required=True),
        env("X_ACCESS_TOKEN", required=True),
        env("X_ACCESS_SECRET", required=True),
    )


def verify_credentials() -> dict:
    """Confirm the four keys authenticate, and report which account they act as.

    Read-only: proves the credentials are valid and names the account, but says
    nothing about *write* permission — an access token minted before the app
    was set to "Read and write" authenticates here and still 403s on posting.
    upload_media() is what actually exercises the write scope.
    """
    try:
        r = http_session().get(ME_URL, auth=_auth(), timeout=30)
    except Exception as e:                                       # noqa: BLE001
        raise PipelineAbort(f"Auth check failed: {type(e).__name__}: {e}") from e
    if r.status_code != 200:
        raise PipelineAbort(f"Credentials rejected: HTTP {r.status_code}: {r.text[:300]}")
    user = (r.json().get("data") or {})
    log.info(f"  Authenticated as @{user.get('username')} ({user.get('name')})")
    return user


def upload_media(path: Path) -> str | None:
    """Upload the card; returns a media_id string, or None on failure.

    Failure is non-fatal by policy (post.require_media) — the text carries the
    content, the card is presentation.
    """
    auth = _auth()
    data = path.read_bytes()
    for url, field in ((MEDIA_V2_URL, "media"), (MEDIA_V11_URL, "media")):
        try:
            r = http_session().post(
                url, auth=auth,
                files={field: (path.name, data, "image/png")},
                data={"media_category": "tweet_image"},
                timeout=60)
        except Exception as e:                                   # noqa: BLE001
            log.warning(f"  Media upload via {url} raised {type(e).__name__}: {e}")
            continue
        if r.status_code in (200, 201):
            body = r.json()
            # v2 nests under `data` and names it `id`; v1.1 is flat.
            media_id = ((body.get("data") or {}).get("id")
                        or body.get("media_id_string"))
            if media_id:
                log.info(f"  Media uploaded ({url.split('/')[2]}): {media_id}")
                return str(media_id)
        log.warning(f"  Media upload via {url} failed: HTTP {r.status_code}: {r.text[:200]}")
    return None


def create_tweet(text: str, media_id: str | None) -> str:
    """Post the tweet; returns its id. Raises PipelineAbort on failure."""
    payload: dict = {"text": text}
    if media_id:
        payload["media"] = {"media_ids": [media_id]}
    try:
        r = http_session().post(TWEET_URL, auth=_auth(), json=payload, timeout=60)
    except Exception as e:                                       # noqa: BLE001
        raise PipelineAbort(f"Tweet request failed: {type(e).__name__}: {e}") from e
    if r.status_code not in (200, 201):
        raise PipelineAbort(f"Tweet rejected: HTTP {r.status_code}: {r.text[:300]}")
    tweet_id = ((r.json().get("data") or {}).get("id"))
    if not tweet_id:
        raise PipelineAbort(f"Tweet response had no id: {r.text[:300]}")
    log.info(f"  Posted: https://x.com/i/status/{tweet_id}")
    return str(tweet_id)
