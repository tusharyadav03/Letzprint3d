"""Theme library: licence-clean symbols and patterns for Shadow Lamps.

Every theme is a function ``fn(S, p) -> np.ndarray`` returning a float32 array in [0, 1]:

* kind ``mask``: 1 = symbol (glows / is cut out / is inlaid), tight-cropped.
* kind ``gray``: a full-frame grayscale image for lithophane mode (1 = white = thin).

``S`` is the working canvas size in pixels (symbol height ~0.8-0.9 S), ``p`` a dict of
user parameters (``text``, ``seed`` ...). Religious symbols are drawn as plain geometry or
taken from OFL fonts; nothing figurative, no trademarks, no copyrighted characters.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Callable

import cv2
import numpy as np

from . import fonts

# ---------------------------------------------------------------------------- primitives
def _canvas(S: int, w: int | None = None) -> np.ndarray:
    return np.zeros((S, w or S), dtype=np.uint8)


def _pt(x: float, y: float) -> tuple[int, int]:
    return int(round(x)), int(round(y))


def disc(img, cx, cy, r, val=255, thickness=-1):
    cv2.circle(img, _pt(cx, cy), int(round(r)), val, thickness if thickness < 0 else int(round(thickness)),
               lineType=cv2.LINE_8)


def ellipse(img, cx, cy, a, b, angle=0.0, a0=0, a1=360, val=255, thickness=-1):
    cv2.ellipse(img, _pt(cx, cy), (int(round(a)), int(round(b))), angle, a0, a1, val,
                thickness if thickness < 0 else int(round(thickness)), lineType=cv2.LINE_8)


def poly(img, pts, val=255):
    cv2.fillPoly(img, [np.round(np.asarray(pts)).astype(np.int32).reshape(-1, 1, 2)], val)


def polyline(img, pts, w, closed=False, val=255):
    cv2.polylines(img, [np.round(np.asarray(pts)).astype(np.int32).reshape(-1, 1, 2)], closed, val,
                  int(round(w)), lineType=cv2.LINE_8)


def rect(img, x0, y0, x1, y1, val=255, thickness=-1):
    cv2.rectangle(img, _pt(x0, y0), _pt(x1, y1), val, thickness if thickness < 0 else int(round(thickness)))


def rounded_rect(img, x0, y0, x1, y1, r, val=255):
    r = int(round(min(r, (x1 - x0) / 2, (y1 - y0) / 2)))
    rect(img, x0 + r, y0, x1 - r, y1, val)
    rect(img, x0, y0 + r, x1, y1 - r, val)
    for cx, cy in ((x0 + r, y0 + r), (x1 - r, y0 + r), (x0 + r, y1 - r), (x1 - r, y1 - r)):
        disc(img, cx, cy, r, val)


def star_pts(cx, cy, n, r_out, r_in, rot=-90.0):
    pts = []
    for k in range(2 * n):
        r = r_out if k % 2 == 0 else r_in
        a = math.radians(rot + 180.0 * k / n)
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def regular_pts(cx, cy, n, r, rot=-90.0):
    return [(cx + r * math.cos(math.radians(rot + 360.0 * k / n)),
             cy + r * math.sin(math.radians(rot + 360.0 * k / n))) for k in range(n)]


def rot_pts(pts, cx, cy, deg):
    a = math.radians(deg)
    c, s = math.cos(a), math.sin(a)
    return [(cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c) for x, y in pts]


def crop(img: np.ndarray, pad: int = 2) -> np.ndarray:
    ys, xs = np.nonzero(img > 127)
    if len(xs) == 0:
        return np.zeros((2, 2), dtype=np.float32)
    y0, y1 = max(ys.min() - pad, 0), min(ys.max() + pad + 1, img.shape[0])
    x0, x1 = max(xs.min() - pad, 0), min(xs.max() + pad + 1, img.shape[1])
    return (img[y0:y1, x0:x1] > 127).astype(np.float32)


def text_mask(text: str, S: int, bold: bool = True) -> np.ndarray:
    m = fonts.render_text(text, int(S * 0.8), bold=bold)
    return (m > 127).astype(np.float32)


# ---------------------------------------------------------------------------- religious / spiritual
def th_om(S, p):
    return text_mask("ॐ", S)


def th_cross(S, p):
    img = _canvas(S)
    rect(img, 0.39 * S, 0.04 * S, 0.61 * S, 0.96 * S)
    rect(img, 0.12 * S, 0.26 * S, 0.88 * S, 0.48 * S)
    return crop(img)


def th_crescent_star(S, p):
    img = _canvas(S)
    disc(img, 0.42 * S, 0.5 * S, 0.40 * S)
    disc(img, 0.54 * S, 0.47 * S, 0.34 * S, val=0)
    poly(img, star_pts(0.72 * S, 0.47 * S, 5, 0.14 * S, 0.056 * S))
    return crop(img)


def th_star_of_david(S, p):
    img = _canvas(S)
    w = 0.075 * S
    for rot in (-90, 90):
        polyline(img, regular_pts(0.5 * S, 0.5 * S, 3, 0.44 * S, rot), w, closed=True)
    return crop(img)


def th_dharma_wheel(S, p):
    img = _canvas(S)
    c = 0.5 * S
    disc(img, c, c, 0.45 * S, thickness=0.06 * S)
    disc(img, c, c, 0.11 * S, thickness=0.05 * S)
    for k in range(8):
        a = math.radians(45 * k)
        polyline(img, [(c + 0.11 * S * math.cos(a), c + 0.11 * S * math.sin(a)),
                       (c + 0.45 * S * math.cos(a), c + 0.45 * S * math.sin(a))], 0.05 * S)
        disc(img, c + 0.49 * S * math.cos(a), c + 0.49 * S * math.sin(a), 0.035 * S)
    disc(img, c, c, 0.035 * S)
    return crop(img)


def th_khanda(S, p):
    return text_mask("☬", S)


def th_ik_onkar(S, p):
    return text_mask("ੴ", S)


def th_allah(S, p):
    return text_mask(p.get("text") or "الله", S)


def th_shalom(S, p):
    return text_mask(p.get("text") or "שלום", S)


def th_menorah(S, p):
    img = _canvas(S)
    c, cy = 0.5 * S, 0.42 * S
    w = 0.045 * S
    radii = [0.12, 0.24, 0.36, 0.48]
    for r in radii:
        ellipse(img, c, cy, r * S, r * S * 0.85, 0, 0, 180, thickness=w)
    rect(img, c - w / 2, 0.14 * S, c + w / 2, 0.86 * S)            # shamash stem
    rect(img, 0.25 * S, 0.86 * S, 0.75 * S, 0.92 * S)              # base
    rect(img, 0.40 * S, 0.80 * S, 0.60 * S, 0.86 * S)
    xs = [c] + [c + s * r * S for r in radii for s in (-1, 1)]
    tops = [0.14 * S] + [cy for _ in range(8)]
    for x, top in zip(xs, tops):
        rect(img, x - 0.04 * S, top - 0.05 * S, x + 0.04 * S, top + 0.02 * S)          # cup
        rect(img, x - 0.016 * S, top - 0.16 * S, x + 0.016 * S, top - 0.05 * S)        # candle
        ellipse(img, x, top - 0.21 * S, 0.028 * S, 0.05 * S)                             # flame
    return crop(img)


def th_diya(S, p):
    img = _canvas(S)
    ellipse(img, 0.5 * S, 0.62 * S, 0.42 * S, 0.30 * S, 0, 0, 180)                       # bowl
    rect(img, 0.08 * S, 0.60 * S, 0.92 * S, 0.66 * S)                                    # rim
    ellipse(img, 0.5 * S, 0.92 * S, 0.26 * S, 0.05 * S)                                  # foot
    ellipse(img, 0.5 * S, 0.42 * S, 0.10 * S, 0.14 * S)                                  # flame body
    poly(img, [(0.5 * S, 0.12 * S), (0.585 * S, 0.37 * S), (0.415 * S, 0.37 * S)])        # flame tip
    ellipse(img, 0.5 * S, 0.46 * S, 0.035 * S, 0.06 * S, val=0)                          # flame core
    return crop(img)


def th_bahai_star(S, p):
    img = _canvas(S)
    polyline(img, star_pts(0.5 * S, 0.5 * S, 9, 0.46 * S, 0.30 * S), 0.055 * S, closed=True)
    return crop(img)


def th_ichthys(S, p):
    img = _canvas(S)
    w = 0.06 * S
    ellipse(img, 0.46 * S, 0.95 * S, 0.60 * S, 0.60 * S, 0, 215, 320, thickness=w)
    ellipse(img, 0.46 * S, 0.05 * S, 0.60 * S, 0.60 * S, 0, 40, 145, thickness=w)
    return crop(img)


def th_torii(S, p):
    img = _canvas(S)
    for x in (0.26, 0.74):
        rect(img, (x - 0.045) * S, 0.22 * S, (x + 0.045) * S, 0.96 * S)
    poly(img, [(0.04 * S, 0.10 * S), (0.96 * S, 0.10 * S), (0.92 * S, 0.20 * S), (0.08 * S, 0.20 * S)])
    rect(img, 0.12 * S, 0.34 * S, 0.88 * S, 0.41 * S)
    rect(img, 0.455 * S, 0.20 * S, 0.545 * S, 0.34 * S)
    return crop(img)


def th_yin_yang(S, p):
    img = _canvas(S)
    c, R = 0.5 * S, 0.46 * S
    disc(img, c, c, R, thickness=0.05 * S)
    ellipse(img, c, c, R, R, 0, 90, 270)                       # left half
    disc(img, c, c - R / 2, R / 2)
    disc(img, c, c + R / 2, R / 2, val=0)
    disc(img, c, c - R / 2, R / 6, val=0)
    disc(img, c, c + R / 2, R / 6)
    return crop(img)


def th_lotus(S, p):
    img = _canvas(S)
    w = 0.035 * S
    pivot = (0.5 * S, 0.95 * S)
    for ang in (-64, -42, -21, 0, 21, 42, 64):
        L = 0.78 * S if ang == 0 else 0.68 * S if abs(ang) < 30 else 0.56 * S if abs(ang) < 50 else 0.44 * S
        pts = []
        for s in np.linspace(0, 1, 40):
            pts.append((pivot[0] + 0.14 * S * math.sin(math.pi * s), pivot[1] - L * s))
        for s in np.linspace(1, 0, 40):
            pts.append((pivot[0] - 0.14 * S * math.sin(math.pi * s), pivot[1] - L * s))
        polyline(img, rot_pts(pts, *pivot, ang), w, closed=True)
    return crop(img)


def th_nativity_star(S, p):
    img = _canvas(S)
    c = 0.5 * S
    poly(img, [(c, 0.02 * S), (c + 0.07 * S, 0.43 * S), (c, 0.98 * S), (c - 0.07 * S, 0.43 * S)])
    poly(img, [(0.12 * S, c), (c, c - 0.06 * S), (0.88 * S, c), (c, c + 0.06 * S)])
    for d in (45, 135):
        poly(img, rot_pts([(c, 0.2 * S), (c + 0.04 * S, c), (c, 0.8 * S), (c - 0.04 * S, c)], c, c, d))
    return crop(img)


def th_peace(S, p):
    return text_mask("☮", S)


def th_heart(S, p):
    img = _canvas(S)
    t = np.linspace(0, 2 * math.pi, 400)
    x = 16 * np.sin(t) ** 3
    y = -(13 * np.cos(t) - 5 * np.cos(2 * t) - 2 * np.cos(3 * t) - np.cos(4 * t))
    pts = np.stack([0.5 * S + x * 0.028 * S, 0.47 * S + y * 0.028 * S], -1)
    poly(img, pts)
    return crop(img)


# ---------------------------------------------------------------------------- festive / seasonal
def th_pumpkin(S, p):
    img = _canvas(S)
    c = 0.5 * S
    for dx in (-0.20, 0.20, 0.0):
        ellipse(img, c + dx * S, 0.58 * S, 0.26 * S, 0.34 * S)
    rect(img, c - 0.05 * S, 0.12 * S, c + 0.05 * S, 0.30 * S)                           # stem
    poly(img, [(0.30 * S, 0.48 * S), (0.42 * S, 0.40 * S), (0.42 * S, 0.52 * S)], 0)    # eyes
    poly(img, [(0.70 * S, 0.48 * S), (0.58 * S, 0.40 * S), (0.58 * S, 0.52 * S)], 0)
    poly(img, [(0.45 * S, 0.57 * S), (0.55 * S, 0.57 * S), (0.5 * S, 0.65 * S)], 0)      # nose
    mouth = [(0.28 * S, 0.70 * S), (0.36 * S, 0.80 * S), (0.42 * S, 0.74 * S), (0.5 * S, 0.82 * S),
             (0.58 * S, 0.74 * S), (0.64 * S, 0.80 * S), (0.72 * S, 0.70 * S), (0.64 * S, 0.76 * S),
             (0.58 * S, 0.70 * S), (0.5 * S, 0.77 * S), (0.42 * S, 0.70 * S), (0.36 * S, 0.76 * S)]
    poly(img, mouth, 0)
    return crop(img)


def th_ghost(S, p):
    img = _canvas(S)
    c = 0.5 * S
    disc(img, c, 0.36 * S, 0.30 * S)
    rect(img, 0.20 * S, 0.36 * S, 0.80 * S, 0.80 * S)
    for k in range(5):                                             # wavy hem
        x = 0.20 * S + (k + 0.5) * 0.12 * S
        if k % 2 == 0:
            disc(img, x, 0.80 * S, 0.06 * S)
        else:
            disc(img, x, 0.80 * S, 0.06 * S, val=0)
    disc(img, 0.40 * S, 0.36 * S, 0.055 * S, val=0)
    disc(img, 0.60 * S, 0.36 * S, 0.055 * S, val=0)
    ellipse(img, 0.5 * S, 0.54 * S, 0.06 * S, 0.08 * S, val=0)
    return crop(img)


def th_bat(S, p):
    img = _canvas(S)
    c = 0.5 * S
    ellipse(img, c, 0.52 * S, 0.09 * S, 0.17 * S)
    disc(img, c, 0.36 * S, 0.08 * S)
    poly(img, [(c - 0.07 * S, 0.30 * S), (c - 0.03 * S, 0.33 * S), (c - 0.085 * S, 0.22 * S)])
    poly(img, [(c + 0.07 * S, 0.30 * S), (c + 0.03 * S, 0.33 * S), (c + 0.085 * S, 0.22 * S)])
    for sgn in (-1, 1):
        wing = [(c, 0.42 * S), (c + sgn * 0.20 * S, 0.30 * S), (c + sgn * 0.48 * S, 0.34 * S),
                (c + sgn * 0.40 * S, 0.50 * S), (c + sgn * 0.30 * S, 0.46 * S), (c + sgn * 0.26 * S, 0.60 * S),
                (c + sgn * 0.16 * S, 0.54 * S), (c + sgn * 0.09 * S, 0.66 * S), (c, 0.60 * S)]
        poly(img, wing)
    return crop(img)


def th_snowflake(S, p):
    return text_mask("❄", S)


def th_xmas_tree(S, p):
    img = _canvas(S)
    c = 0.5 * S
    for k, (top, w, bot) in enumerate(((0.12, 0.22, 0.40), (0.30, 0.30, 0.62), (0.50, 0.40, 0.84))):
        poly(img, [(c, top * S), (c + w * S, bot * S), (c - w * S, bot * S)])
    rect(img, c - 0.06 * S, 0.84 * S, c + 0.06 * S, 0.96 * S)
    poly(img, star_pts(c, 0.09 * S, 5, 0.08 * S, 0.035 * S))
    for (x, y) in ((0.42, 0.38), (0.56, 0.52), (0.36, 0.66), (0.62, 0.72), (0.50, 0.30)):
        disc(img, x * S, y * S, 0.035 * S, val=0)
    return crop(img)


def th_bauble(S, p):
    img = _canvas(S)
    c = 0.5 * S
    disc(img, c, 0.58 * S, 0.36 * S)
    rect(img, c - 0.08 * S, 0.14 * S, c + 0.08 * S, 0.24 * S)
    disc(img, c, 0.10 * S, 0.05 * S, thickness=0.02 * S)
    ellipse(img, c, 0.58 * S, 0.36 * S, 0.10 * S, 0, 0, 360, val=0, thickness=0.03 * S)
    return crop(img)


def th_rangoli(S, p):
    img = _canvas(S)
    c = 0.5 * S
    for r, n in ((0.42, 12), (0.30, 8), (0.18, 6)):
        for k in range(n):
            a = math.radians(360 * k / n)
            ellipse(img, c + r * 0.72 * S * math.cos(a), c + r * 0.72 * S * math.sin(a),
                    0.10 * S * r / 0.42 + 0.03 * S, 0.045 * S, math.degrees(a), thickness=-1)
    disc(img, c, c, 0.06 * S)
    disc(img, c, c, 0.46 * S, thickness=0.02 * S)
    return crop(img)


def th_moon_stars(S, p):
    img = _canvas(S)
    disc(img, 0.42 * S, 0.5 * S, 0.36 * S)
    disc(img, 0.55 * S, 0.45 * S, 0.31 * S, val=0)
    rng = np.random.default_rng(int(p.get("seed", 7)))
    for _ in range(9):
        x, y = rng.uniform(0.55, 0.98), rng.uniform(0.05, 0.95)
        if (x - 0.42) ** 2 + (y - 0.5) ** 2 < 0.40 ** 2:
            continue
        r = rng.uniform(0.025, 0.06) * S
        poly(img, star_pts(x * S, y * S, 4, r, r * 0.4))
    return crop(img)


def th_paw(S, p):
    img = _canvas(S)
    c = 0.5 * S
    ellipse(img, c, 0.66 * S, 0.26 * S, 0.22 * S)
    for (x, y, a, b, ang) in ((0.22, 0.42, 0.09, 0.12, -20), (0.40, 0.26, 0.09, 0.12, -8),
                              (0.60, 0.26, 0.09, 0.12, 8), (0.78, 0.42, 0.09, 0.12, 20)):
        ellipse(img, x * S, y * S, a * S, b * S, ang)
    return crop(img)


# ---------------------------------------------------------------------------- nerd
def th_atom(S, p):
    img = _canvas(S)
    c = 0.5 * S
    for ang in (0, 60, 120):
        ellipse(img, c, c, 0.46 * S, 0.17 * S, ang, thickness=0.045 * S)
    disc(img, c, c, 0.075 * S)
    for ang, t in ((0, 0.3), (60, 0.75), (120, 0.1)):
        a = 2 * math.pi * t
        x, y = 0.46 * S * math.cos(a), 0.17 * S * math.sin(a)
        r = math.radians(ang)
        disc(img, c + x * math.cos(r) - y * math.sin(r), c + x * math.sin(r) + y * math.cos(r), 0.04 * S)
    return crop(img)


def th_dna(S, p):
    img = _canvas(S)
    c = 0.5 * S
    n_turns = float(p.get("turns", 1.5))
    ys = np.linspace(0.05 * S, 0.95 * S, 300)
    ph = 2 * math.pi * n_turns * (ys - 0.05 * S) / (0.9 * S)
    x1 = c + 0.32 * S * np.sin(ph)
    x2 = c - 0.32 * S * np.sin(ph)
    for k in range(6, 300, 25):
        if abs(math.sin(ph[k])) > 0.3:
            polyline(img, [(x1[k], ys[k]), (x2[k], ys[k])], 0.028 * S)
    polyline(img, np.stack([x1, ys], -1), 0.055 * S)
    polyline(img, np.stack([x2, ys], -1), 0.055 * S)
    return crop(img)


def th_planet(S, p):
    img = _canvas(S)
    c = 0.5 * S
    ring = _canvas(S)
    ellipse(ring, c, c, 0.48 * S, 0.13 * S, -22, thickness=0.05 * S)
    front = ring.copy()
    yy, xx = np.mgrid[0:S, 0:S]
    # the front half of the ring is the half "below" the tilted equator line
    front[(yy - c) < -(xx - c) * math.tan(math.radians(22))] = 0
    disc(img, c, c, 0.29 * S)
    gap = cv2.dilate(front, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (int(0.05 * S) | 1, int(0.05 * S) | 1)))
    img[gap > 0] = 0
    img = np.maximum(img, ring)
    return crop(img)


def th_rocket(S, p):
    img = _canvas(S)
    c = 0.5 * S
    rounded_rect(img, c - 0.14 * S, 0.22 * S, c + 0.14 * S, 0.70 * S, 0.12 * S)
    poly(img, [(c, 0.04 * S), (c + 0.14 * S, 0.30 * S), (c - 0.14 * S, 0.30 * S)])
    poly(img, [(c - 0.14 * S, 0.50 * S), (c - 0.30 * S, 0.76 * S), (c - 0.14 * S, 0.70 * S)])
    poly(img, [(c + 0.14 * S, 0.50 * S), (c + 0.30 * S, 0.76 * S), (c + 0.14 * S, 0.70 * S)])
    disc(img, c, 0.38 * S, 0.06 * S, val=0)
    poly(img, [(c - 0.08 * S, 0.74 * S), (c + 0.08 * S, 0.74 * S), (c, 0.96 * S)])
    return crop(img)


def th_dice(S, p):
    img = _canvas(S)
    rounded_rect(img, 0.1 * S, 0.1 * S, 0.9 * S, 0.9 * S, 0.14 * S)
    for (x, y) in ((0.3, 0.3), (0.7, 0.3), (0.5, 0.5), (0.3, 0.7), (0.7, 0.7)):
        disc(img, x * S, y * S, 0.07 * S, val=0)
    return crop(img)


def th_chess_knight(S, p):
    return text_mask("♞", S)


def th_pixel_heart(S, p):
    bits = ["01100110", "11111111", "11111111", "11111111", "01111110", "00111100", "00011000"]
    a = np.array([[int(ch) for ch in row] for row in bits], dtype=np.uint8) * 255
    k = max(int(S * 0.9 / a.shape[1]), 1)
    return crop(cv2.resize(a, (a.shape[1] * k, a.shape[0] * k), interpolation=cv2.INTER_NEAREST))


def th_circuit(S, p):
    img = _canvas(S)
    rng = np.random.default_rng(int(p.get("seed", 3)))
    g = 0.1 * S
    nodes = [(i, j) for i in range(1, 9) for j in range(1, 9)]
    rng.shuffle(nodes)
    used = set()
    for (i, j) in nodes[:22]:
        pts = [(i, j)]
        for _ in range(int(rng.integers(2, 5))):
            di, dj = [(1, 0), (-1, 0), (0, 1), (0, -1)][int(rng.integers(0, 4))]
            step = int(rng.integers(1, 3))
            ni, nj = pts[-1][0] + di * step, pts[-1][1] + dj * step
            if 0 < ni < 10 and 0 < nj < 10:
                pts.append((ni, nj))
        if len(pts) < 2:
            continue
        polyline(img, [(x * g, y * g) for x, y in pts], 0.03 * S)
        for (x, y) in (pts[0], pts[-1]):
            if (x, y) not in used:
                disc(img, x * g, y * g, 0.045 * S)
                disc(img, x * g, y * g, 0.018 * S, val=0)
                used.add((x, y))
    return crop(img)


def th_hex_grid(S, p):
    img = _canvas(S)
    r = 0.085 * S
    gap = 0.03 * S
    dx, dy = math.sqrt(3) * r, 1.5 * r
    row = 0
    y = r
    while y < S - r:
        x = r + (dx / 2 if row % 2 else 0)
        while x < S - r:
            poly(img, regular_pts(x, y, 6, r - gap / 2, rot=-90))
            x += dx
        y += dy
        row += 1
    return crop(img)


def th_solar_system(S, p):
    img = _canvas(S)
    c = 0.5 * S
    disc(img, c, c, 0.06 * S)
    for k, (r, pr, ang) in enumerate(((0.11, 0.012, 20), (0.16, 0.018, 200), (0.21, 0.019, 300), (0.26, 0.015, 80),
                                       (0.32, 0.035, 150), (0.38, 0.030, 240), (0.43, 0.024, 10), (0.48, 0.023, 120))):
        disc(img, c, c, r * S, thickness=max(0.006 * S, 2))
        a = math.radians(ang)
        disc(img, c + r * S * math.cos(a), c + r * S * math.sin(a), pr * S)
    return crop(img)


def th_fibonacci(S, p):
    img = _canvas(S)
    w = 0.022 * S
    sc = 0.9 * S / 34.0
    x, y = 0.05 * S, 0.05 * S
    # golden rectangle 34 x 21 subdivided into Fibonacci squares, spiral of quarter arcs
    boxes = [((x, y), 21, 0), ((x + 21 * sc, y), 13, 1), ((x + 26 * sc, y + 13 * sc), 8, 2),
             ((x + 21 * sc, y + 16 * sc), 5, 3), ((x + 21 * sc, y + 13 * sc), 3, 0), ((x + 24 * sc, y + 13 * sc), 2, 1)]
    for (bx, by), n, q in boxes:
        s = n * sc
        rect(img, bx, by, bx + s, by + s, thickness=w)
        centre = [(bx + s, by + s), (bx, by + s), (bx, by), (bx + s, by)][q]
        start = [180, 270, 0, 90][q]
        ellipse(img, centre[0], centre[1], s, s, 0, start, start + 90, thickness=w * 1.6)
    return crop(img)


def th_controller(S, p):
    img = _canvas(S)
    c = 0.5 * S
    rounded_rect(img, 0.08 * S, 0.30 * S, 0.92 * S, 0.62 * S, 0.14 * S)
    ellipse(img, 0.24 * S, 0.62 * S, 0.14 * S, 0.20 * S, 15)
    ellipse(img, 0.76 * S, 0.62 * S, 0.14 * S, 0.20 * S, -15)
    rect(img, 0.19 * S, 0.43 * S, 0.33 * S, 0.47 * S, 0)      # d-pad
    rect(img, 0.24 * S, 0.38 * S, 0.28 * S, 0.52 * S, 0)
    for (x, y) in ((0.70, 0.38), (0.76, 0.45), (0.64, 0.45), (0.70, 0.52)):
        disc(img, x * S, y * S, 0.025 * S, val=0)
    disc(img, 0.40 * S, 0.57 * S, 0.035 * S, val=0)
    disc(img, 0.60 * S, 0.57 * S, 0.035 * S, val=0)
    return crop(img)


def th_sine(S, p):
    img = _canvas(S)
    xs = np.linspace(0.05 * S, 0.95 * S, 300)
    ys = 0.5 * S - 0.28 * S * np.sin(2 * math.pi * 2 * (xs - 0.05 * S) / (0.9 * S))
    polyline(img, np.stack([xs, ys], -1), 0.05 * S)
    polyline(img, [(0.05 * S, 0.5 * S), (0.95 * S, 0.5 * S)], 0.015 * S)
    return crop(img)


def th_text(S, p):
    txt = p.get("text") or "Hello, World!"
    lines = [t for t in txt.split("|") if t.strip()]
    masks = [fonts.render_text(t, int(S * 0.8 / max(len(lines), 1) * 0.8)) for t in lines]
    W = max(m.shape[1] for m in masks)
    gap = int(S * 0.04)
    H = sum(m.shape[0] for m in masks) + gap * (len(masks) - 1)
    out = np.zeros((H, W), dtype=np.uint8)
    y = 0
    for m in masks:
        x = (W - m.shape[1]) // 2
        out[y:y + m.shape[0], x:x + m.shape[1]] = np.maximum(out[y:y + m.shape[0], x:x + m.shape[1]], m)
        y += m.shape[0] + gap
    return crop(out)


def th_element(S, p):
    """Periodic-table tile: text 'Sym|Name|Number' e.g. 'Ha|Harsh|118'."""
    parts = (p.get("text") or "Lu|Luxembourg|71").split("|") + ["", "", ""]
    sym, name, num = parts[0].strip(), parts[1].strip(), parts[2].strip()
    img = _canvas(S)
    rounded_rect(img, 0.06 * S, 0.06 * S, 0.94 * S, 0.94 * S, 0.06 * S)
    rounded_rect(img, 0.06 * S + 0.05 * S, 0.06 * S + 0.05 * S, 0.94 * S - 0.05 * S, 0.94 * S - 0.05 * S, 0.04 * S, val=0)

    def paste(mask, cx, cy):
        h, w = mask.shape
        x0, y0 = int(cx - w / 2), int(cy - h / 2)
        img[y0:y0 + h, x0:x0 + w] = np.maximum(img[y0:y0 + h, x0:x0 + w], mask)

    paste(fonts.render_text(sym, int(0.38 * S)), 0.5 * S, 0.48 * S)
    if num:
        paste(fonts.render_text(num, int(0.10 * S)), 0.26 * S, 0.22 * S)
    if name:
        paste(fonts.render_text(name, int(0.09 * S), bold=False), 0.5 * S, 0.80 * S)
    return crop(img)


def th_d20(S, p):
    img = _canvas(S)
    c, R, w = 0.5 * S, 0.44 * S, 0.03 * S
    hexa = regular_pts(c, c, 6, R, rot=90)
    polyline(img, hexa, w, closed=True)
    tri = regular_pts(c, c, 3, R * 0.52, rot=-90)
    polyline(img, tri, w, closed=True)
    for (tx, ty) in tri:
        for (hx, hy) in hexa:
            if math.hypot(tx - hx, ty - hy) < R * 0.95:
                polyline(img, [(tx, ty), (hx, hy)], w)
    lab = fonts.render_text("20", int(S * 0.15))
    h, ww = lab.shape
    y0, x0 = int(c + 0.02 * S - h / 2), int(c - ww / 2)
    img[y0:y0 + h, x0:x0 + ww] = np.maximum(img[y0:y0 + h, x0:x0 + ww], lab)
    return crop(img)


def th_constellation(S, p):
    img = _canvas(S)
    rng = np.random.default_rng(int(p.get("seed", 3)))
    for _ in range(90):
        x, y = rng.uniform(0.03, 0.97) * S, rng.uniform(0.03, 0.97) * S
        disc(img, x, y, rng.choice([2.5, 3.5, 4.5, 6.0]) * S / 500)
    main = [(0.22, 0.25), (0.35, 0.40), (0.50, 0.33), (0.62, 0.48), (0.78, 0.42), (0.70, 0.66), (0.45, 0.72)]
    pts = [(x * S, y * S) for x, y in main]
    polyline(img, pts, max(3, int(S * 0.012)))
    for x, y in pts:
        poly(img, star_pts(x, y, 4, S * 0.03, S * 0.013))
    return crop(img)


def th_spiderweb(S, p):
    img = _canvas(S)
    cx = cy = 0.5 * S
    lw, R, spokes = max(2, int(S * 0.012)), 0.47 * S, 10
    angs = [2 * math.pi * k / spokes for k in range(spokes)]
    for a in angs:
        polyline(img, [(cx, cy), (cx + R * math.cos(a), cy + R * math.sin(a))], lw)
    for f in (0.18, 0.34, 0.50, 0.66, 0.82, 0.98):
        for k in range(spokes):
            a0, a1 = angs[k], angs[(k + 1) % spokes]
            am = a0 + math.pi / spokes
            p0 = (cx + R * f * math.cos(a0), cy + R * f * math.sin(a0))
            pm = (cx + R * f * 0.92 * math.cos(am), cy + R * f * 0.92 * math.sin(am))
            p1 = (cx + R * f * math.cos(a1), cy + R * f * math.sin(a1))
            polyline(img, [p0, pm, p1], lw)
    sx, sy = cx + 0.30 * S, cy + 0.30 * S
    polyline(img, [(sx, sy), (cx + 0.18 * S, cy + 0.18 * S)], lw)
    ellipse(img, sx, sy + 0.01 * S, 0.05 * S, 0.05 * S)
    disc(img, sx, sy - 0.055 * S, 0.03 * S)
    for k in range(4):
        a = math.radians(15 + 25 * k)
        for sgn in (-1, 1):
            polyline(img, [(sx, sy), (sx + sgn * 0.11 * S * math.cos(a), sy - 0.11 * S * math.sin(a) + 0.04 * S * k)],
                     max(2, int(lw * 0.8)))
    return crop(img)


def th_glyph(S, p):
    """Any single character (or short string) from the bundled fonts: --theme glyph --theme-text ☥"""
    return text_mask(p.get("text") or "★", S)


def _glyph(ch):
    return lambda S, p: text_mask(ch, S)


# ---------------------------------------------------------------------------- grayscale (lithophane) themes
def th_mandelbrot(S, p):
    """Smooth escape-time Mandelbrot. Dark set, glowing halo. text='cx,cy,width' overrides the view."""
    cx, cy, w = -0.6, 0.0, 3.0
    if p.get("text"):
        try:
            cx, cy, w = [float(v) for v in p["text"].split(",")]
        except Exception:
            pass
    W = int(p.get("width_px", S * 2))
    H = S
    h = w * H / W
    xs = np.linspace(cx - w / 2, cx + w / 2, W)
    ys = np.linspace(cy - h / 2, cy + h / 2, H)
    C = xs[None, :] + 1j * ys[:, None]
    Z = np.zeros_like(C)
    it = np.zeros(C.shape, dtype=np.float32)
    alive = np.ones(C.shape, dtype=bool)
    maxit = int(p.get("iters", 160))
    for k in range(maxit):
        Z[alive] = Z[alive] ** 2 + C[alive]
        esc = alive & (np.abs(Z) > 4.0)
        az = np.abs(Z[esc])
        it[esc] = k + 1 - np.log(np.log(np.maximum(az, 1.0001))) / math.log(2)
        alive &= ~esc
    g = np.zeros(C.shape, dtype=np.float32)
    outside = ~alive
    v = np.log1p(it[outside])
    g[outside] = 0.25 + 0.75 * (v / max(v.max(), 1e-6))
    g[alive] = 0.0
    return np.clip(g, 0, 1)


def th_calibration(S, p):
    """Thickness staircase for calibrating min/max wall on your printer+filament.
    Each step is labelled with its wall thickness (needs min_wall/max_wall in params)."""
    steps = int(p.get("steps", 8))
    W = int(p.get("width_px", S * 2))
    g = np.zeros((S, W), dtype=np.float32)
    tmin, tmax = float(p.get("min_wall", 0.6)), float(p.get("max_wall", 3.0))
    for k in range(steps):
        x0, x1 = int(W * k / steps), int(W * (k + 1) / steps)
        val = 1.0 - k / (steps - 1)
        g[:, x0:x1] = val
        t = tmax - (tmax - tmin) * val
        lab = fonts.render_text(f"{t:.1f}", int(S * 0.16))
        lab = cv2.rotate(lab, cv2.ROTATE_90_COUNTERCLOCKWISE)
        h, w = lab.shape
        if w < (x1 - x0) - 4:
            cx, cy = (x0 + x1) // 2, S // 2
            sub = g[cy - h // 2:cy - h // 2 + h, cx - w // 2:cx - w // 2 + w]
            ink = lab[:sub.shape[0], :sub.shape[1]] > 127
            sub[ink] = 0.0 if val > 0.5 else 1.0
    return g


# ---------------------------------------------------------------------------- registry
@dataclass
class Theme:
    name: str
    category: str
    fn: Callable
    kind: str = "mask"          # 'mask' | 'gray'
    default_mode: str = "glow"  # mode used when the user does not choose one
    note: str = ""
    params: dict = field(default_factory=dict)
    cutout_features: bool = False  # in cut-out mode, cut the symbol's holes (face, pips) instead of its body


THEMES: dict[str, Theme] = {}


def _reg(name, category, fn, kind="mask", default_mode="glow", note="", cutout_features=False, **params):
    THEMES[name] = Theme(name, category, fn, kind, default_mode, note, params, cutout_features)


def features_only(mask: np.ndarray) -> np.ndarray:
    """The holes of a symbol (eyes, pips, windows): fill(symbol) minus symbol."""
    m = (mask > 0.5).astype(np.uint8)
    h, w = m.shape
    flood = np.pad(m, 1)
    cv2.floodFill(flood, None, (0, 0), 2)
    filled = (flood[1:-1, 1:-1] != 2).astype(np.uint8)
    return ((filled - m) > 0).astype(np.float32)


_reg("om", "hindu", th_om, note="ॐ, Noto Sans Devanagari")
_reg("diya", "hindu", th_diya, note="oil lamp with flame (Diwali)")
_reg("rangoli", "hindu", th_rangoli, note="8/12-fold petal pattern (Diwali)")
_reg("cross", "christian", th_cross)
_reg("ichthys", "christian", th_ichthys, note="fish outline")
_reg("nativity-star", "christian", th_nativity_star, note="Bethlehem star (Christmas)")
_reg("crescent-star", "islam", th_crescent_star)
_reg("allah", "islam", th_allah, note="calligraphy, Noto Naskh; text= overrides (e.g. 'بسم الله')")
_reg("star-of-david", "jewish", th_star_of_david)
_reg("menorah", "jewish", th_menorah, note="nine-branch hanukkiah")
_reg("shalom", "jewish", th_shalom, note="Hebrew text; text= overrides")
_reg("dharma-wheel", "buddhist", th_dharma_wheel)
_reg("lotus", "buddhist", th_lotus, note="line-art lotus")
_reg("khanda", "sikh", th_khanda)
_reg("ik-onkar", "sikh", th_ik_onkar, note="ੴ")
_reg("bahai-star", "bahai", th_bahai_star, note="nine-pointed star")
_reg("yin-yang", "taoist", th_yin_yang)
_reg("torii", "shinto", th_torii)
_reg("peace", "spiritual", th_peace)
_reg("heart", "love", th_heart)
_reg("pumpkin", "halloween", th_pumpkin, default_mode="cutout", cutout_features=True, note="cut-out = the face")
_reg("ghost", "halloween", th_ghost, cutout_features=True)
_reg("bat", "halloween", th_bat, default_mode="cutout")
_reg("moon-stars", "night", th_moon_stars, default_mode="cutout")
_reg("snowflake", "christmas", th_snowflake)
_reg("xmas-tree", "christmas", th_xmas_tree, default_mode="cutout", cutout_features=True, note="cut-out = baubles")
_reg("bauble", "christmas", th_bauble)
_reg("paw", "pets", th_paw)
_reg("atom", "nerd", th_atom)
_reg("dna", "nerd", th_dna, default_mode="cutout")
_reg("planet", "nerd", th_planet)
_reg("rocket", "nerd", th_rocket)
_reg("dice", "nerd", th_dice, cutout_features=True, note="cut-out = pips")
_reg("chess-knight", "nerd", th_chess_knight)
_reg("pixel-heart", "nerd", th_pixel_heart, default_mode="cutout")
_reg("circuit", "nerd", th_circuit, default_mode="cutout", note="procedural; seed=")
_reg("hex-grid", "nerd", th_hex_grid, default_mode="cutout", note="honeycomb, whole panel")
_reg("solar-system", "nerd", th_solar_system)
_reg("fibonacci", "nerd", th_fibonacci, note="golden spiral line-art")
_reg("controller", "nerd", th_controller, cutout_features=True)
_reg("sine", "nerd", th_sine)
_reg("d20", "nerd", th_d20, note="twenty-sided die")
_reg("constellation", "nerd", th_constellation, note="star field + asterism; seed=")
_reg("spiderweb", "halloween", th_spiderweb, default_mode="cutout")
_reg("ankh", "spiritual", _glyph("☥"))
_reg("radioactive", "nerd", _glyph("☢"))
_reg("omega", "nerd", _glyph("Ω"))
_reg("pi", "nerd", _glyph("π"))
_reg("infinity", "nerd", _glyph("∞"))
_reg("music", "custom", _glyph("♫"))
_reg("glyph", "custom", th_glyph, note="any character from the bundled fonts: --theme-text ☥")
_reg("text", "custom", th_text, note="any text/script; use | for a second line")
_reg("element", "nerd", th_element, note="periodic tile: text='Ha|Harsh|118'")
_reg("mandelbrot", "nerd", th_mandelbrot, kind="gray", default_mode="litho", note="text='cx,cy,width' view")
_reg("calibration", "tooling", th_calibration, kind="gray", default_mode="litho", note="wall-thickness staircase")


def render(name: str, S: int = 1200, params: dict | None = None) -> np.ndarray:
    th = THEMES[name]
    return th.fn(S, params or {})
