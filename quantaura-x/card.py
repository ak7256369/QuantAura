"""The post's image card.

Text is stamped with Pillow, never generated — same rule as the video
pipeline's thumbnails: an image model cannot be relied on to render a price
correctly, and a wrong number in a feed is a wrong number forever.

The layout deliberately echoes the YouTube thumbnail (brand top-left, date
top-right, big direction word, record panel on the right) so every surface of
the ecosystem is recognisably one product.

Contains no confidence and no per-model votes by construction — those fields
never enter this module.
"""
from __future__ import annotations

import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

from common import BUILD_DIR, config, log

# 16:9 at X's preferred inline size.
CW, CH = 1600, 900

_FONT_CANDIDATES = [
    # Ubuntu runners ship DejaVu in fonts-dejavu-core.
    "/usr/share/fonts/truetype/dejavu/DejaVuSans{bold}.ttf",
    # Local Windows dry-runs.
    "C:/Windows/Fonts/arial{winbold}.ttf",
]


def _font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    for tpl in _FONT_CANDIDATES:
        path = tpl.format(bold="-Bold" if bold else "", winbold="bd" if bold else "")
        try:
            return ImageFont.truetype(path, size)
        except Exception:                                        # noqa: BLE001
            continue
    # matplotlib ships DejaVu too, if it happens to be importable.
    try:
        import matplotlib
        base = Path(matplotlib.get_data_path()) / "fonts" / "ttf"
        name = "DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf"
        return ImageFont.truetype(str(base / name), size)
    except Exception:                                            # noqa: BLE001
        log.warning("  No TrueType font found — falling back to Pillow default")
        return ImageFont.load_default()


def _hex(c: str) -> tuple[int, int, int]:
    c = c.lstrip("#")
    return tuple(int(c[i:i + 2], 16) for i in (0, 2, 4))          # type: ignore[return-value]


def _background() -> Image.Image:
    """Brand gradient with a faint blurred dot grid — texture without noise."""
    t = config()["theme"]
    img = Image.new("RGB", (CW, CH), _hex(t["bg"]))
    d = ImageDraw.Draw(img)
    accent = _hex(t["accent"])
    bg = _hex(t["bg"])
    for i in range(CH):
        k = i / CH
        d.line([(0, i), (CW, i)],
               fill=tuple(int(bg[c] + (accent[c] - bg[c]) * k * 0.22) for c in range(3)))
    rnd = random.Random(7)
    for _ in range(260):
        x, y = rnd.randint(0, CW), rnd.randint(0, CH)
        d.ellipse([x, y, x + 3, y + 3], fill=_hex(t["grid"]))
    return img.filter(ImageFilter.GaussianBlur(0.6))


def build(snapshot: dict, score: dict | None, out_name: str = "card.png") -> Path:
    t = config()["theme"]
    img = _background()
    d = ImageDraw.Draw(img)

    sig = snapshot["signal"]
    sig_color = {"BUY": _hex(t["up"]), "SELL": _hex(t["down"])}.get(sig, _hex(t["flat"]))

    # Brand left, date right, nothing between them.
    d.text((80, 66), "QUANTAURA", font=_font(48, True), fill=_hex(t["accent"]))
    d.text((CW - 80, 72), snapshot["date"], font=_font(40), fill=_hex(t["muted"]),
           anchor="ra")

    d.text((80, 200), "TODAY'S CALL", font=_font(44), fill=_hex(t["muted"]))
    d.text((74, 258), sig, font=_font(240, True), fill=sig_color)

    d.text((80, 560), f"{snapshot['asset_label']}  {snapshot['price_str']}",
           font=_font(66, True), fill=_hex(t["text"]))
    chg = snapshot.get("change_24h_pct")
    if chg is not None:
        d.text((80, 650), f"{chg:+.2f}% in 24h", font=_font(50),
               fill=_hex(t["up"] if chg >= 0 else t["down"]))

    # Right column: the running record, same place every day. Drawn only when
    # the scoreboard was actually read — "couldn't fetch the record" must not
    # render as "DAY 1", which would claim there is no history to show.
    if score is not None:
        bx, by, bw, bh = CW - 530, 220, 450, 380
        d.rounded_rectangle([bx, by, bx + bw, by + bh], radius=32, fill=_hex(t["panel"]))
        d.text((bx + bw / 2, by + 54), "PUBLIC RECORD", font=_font(38),
               fill=_hex(t["muted"]), anchor="ma")
        if score.get("resolved_calls"):
            acc = score.get("accuracy_pct")
            d.text((bx + bw / 2, by + 118), f"{acc:.0f}%", font=_font(150, True),
                   fill=_hex(t["up"] if acc and acc >= 50 else t["down"]), anchor="ma")
            d.text((bx + bw / 2, by + 296),
                   f"{score.get('hits', 0)}W · {score.get('misses', 0)}L "
                   f"over {score['resolved_calls']}", font=_font(38), fill=_hex(t["text"]),
                   anchor="ma")
        else:
            d.text((bx + bw / 2, by + 140), "DAY 1", font=_font(120, True),
                   fill=_hex(t["accent"]), anchor="ma")
            d.text((bx + bw / 2, by + 296), "record starts now", font=_font(36),
                   fill=_hex(t["muted"]), anchor="ma")

    d.text((80, CH - 140), "quantaura.tech", font=_font(44, True), fill=_hex(t["accent"]))
    # The card carries the ecosystem, not the tweet text: 280 weighted chars are
    # spent on numbers, and an image has no character budget. Anyone who sees the
    # post sees where the same call also goes out.
    links = config().get("links") or {}
    ecosystem = " · ".join(x for x in (links.get("youtube_label"),
                                       links.get("telegram_label")) if x)
    if ecosystem:
        d.text((80, CH - 78), ecosystem, font=_font(32), fill=_hex(t["muted"]))
    d.text((CW - 80, CH - 112), "Automated research · not financial advice",
           font=_font(34), fill=_hex(t["muted"]), anchor="ra")

    out = BUILD_DIR / out_name
    img.save(out, "PNG")
    log.info(f"  Card: {out.name}")
    return out
