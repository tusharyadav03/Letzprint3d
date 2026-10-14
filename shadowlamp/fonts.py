"""Bundled fonts (all SIL OFL / DejaVu licence, see fonts/FONTS.md) and text rendering.

Script-aware: Devanagari, Arabic, Hebrew and Gurmukhi get their Noto face; symbols
fall through Noto Symbols -> Noto Symbols 2 -> DejaVu; Latin uses Poppins.
Pillow is built with libraqm here, so Arabic shaping / bidi and Indic conjuncts work.
"""
from __future__ import annotations

import os
from functools import lru_cache

import numpy as np
from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFont

FONT_DIR = os.path.join(os.path.dirname(__file__), "fonts")

LATIN = ["Poppins-Bold.ttf", "DejaVuSans-Bold.ttf"]
LATIN_REGULAR = ["Poppins-Regular.ttf", "DejaVuSans-Bold.ttf"]
SCRIPTS = {
    "devanagari": ((0x0900, 0x097F), ["NotoSansDevanagari-Bold.ttf"]),
    "arabic": ((0x0600, 0x06FF), ["NotoNaskhArabic-Bold.ttf"]),
    "hebrew": ((0x0590, 0x05FF), ["NotoSansHebrew-Bold.ttf"]),
    "gurmukhi": ((0x0A00, 0x0A7F), ["NotoSansGurmukhi-Bold.ttf"]),
}
SYMBOLS = ["NotoSansSymbols-Bold.ttf", "NotoSansSymbols2-Regular.ttf", "DejaVuSans-Bold.ttf"]


def path(name: str) -> str:
    return os.path.join(FONT_DIR, name)


@lru_cache(maxsize=32)
def _cmap(name: str) -> set[int]:
    try:
        return set(TTFont(path(name)).getBestCmap().keys())
    except Exception:
        return set()


def covers(name: str, text: str) -> bool:
    cm = _cmap(name)
    return all(ord(c) in cm for c in text if not c.isspace())


def font_for(text: str, bold: bool = True) -> str:
    """Pick the bundled font file best suited to ``text``."""
    cps = [ord(c) for c in text if not c.isspace()]
    for _, ((lo, hi), names) in SCRIPTS.items():
        if any(lo <= cp <= hi for cp in cps):
            for n in names:
                if covers(n, text):
                    return n
    if any(cp >= 0x2190 for cp in cps):          # arrows, symbols, dingbats, emoji-ish
        for n in SYMBOLS:
            if covers(n, text):
                return n
    for n in (LATIN if bold else LATIN_REGULAR):
        if covers(n, text):
            return n
    # best effort: the font covering most characters
    best = max(LATIN + SYMBOLS + [n for _, (_, ns) in SCRIPTS.items() for n in ns],
               key=lambda n: sum(ord(c) in _cmap(n) for c in text))
    return best


def render_text(text: str, height_px: int, font: str | None = None, bold: bool = True,
                pad: int = 2) -> np.ndarray:
    """Render ``text`` as a tight uint8 mask (255 = ink) whose ink height is ~``height_px``."""
    name = font or font_for(text, bold)
    probe = ImageFont.truetype(path(name), 200)
    l, t, r, b = probe.getbbox(text)
    h0 = max(b - t, 1)
    size = max(int(round(200 * height_px / h0)), 8)
    f = ImageFont.truetype(path(name), size)
    l, t, r, b = f.getbbox(text)
    W, H = (r - l) + 2 * pad, (b - t) + 2 * pad
    img = Image.new("L", (max(W, 1), max(H, 1)), 0)
    ImageDraw.Draw(img).text((pad - l, pad - t), text, font=f, fill=255)
    arr = np.asarray(img)
    ys, xs = np.nonzero(arr > 127)
    if len(xs) == 0:
        return np.zeros((1, 1), dtype=np.uint8)
    return arr[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
