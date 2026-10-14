"""
Motif library for the shadow lamp.

Every motif renders to an 8-bit greyscale image: white = light passes
(thin wall), black = blocked (thick wall). Three kinds:

  glyph  — a single Unicode symbol from an installed font (GNU FreeFont
           covers ॐ ☪ ✝ ✡ ☸ ☬ ☥ ⚛ ☯ ☮ ☢ ♞ …). Fonts are OFL / GPL+exception,
           so shipping the rendered outline in a product is fine.
  proc   — drawn here with PIL primitives. Our own artwork, no licence
           questions, thick strokes that survive a 0.4 mm nozzle.
  text   — any string in a text font (Poppins Bold by default). Names,
           dates, equations.

Nothing here reproduces a branded character or logo: "nerd" motifs are
science, maths, space and generic gaming shapes.
"""

from __future__ import annotations

import glob
import math
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageOps

FONT_DIRS = [
    "/usr/share/fonts/truetype/freefont",
    "/usr/share/fonts/truetype/google-fonts",
    "/usr/share/fonts/truetype/dejavu",
    "/usr/share/fonts/truetype/liberation",
    os.path.join(os.path.dirname(__file__), "fonts"),
]
SYMBOL_FONTS = ["FreeSerifBold.ttf", "FreeSerif.ttf", "FreeSansBold.ttf", "FreeSans.ttf",
                "DejaVuSans-Bold.ttf", "DejaVuSans.ttf", "LiberationSans-Bold.ttf"]
TEXT_FONTS = ["Poppins-Bold.ttf", "DejaVuSans-Bold.ttf", "LiberationSans-Bold.ttf", "FreeSansBold.ttf"]
MONO_FONTS = ["DejaVuSansMono-Bold.ttf", "DejaVuSansMono.ttf", "FreeMonoBold.ttf", "LiberationMono-Bold.ttf"]


def find_font(names: list[str], text: str | None = None) -> str:
    """First font in `names` (searched in FONT_DIRS) that has every glyph of `text`."""
    for name in names:
        for d in FONT_DIRS:
            for path in glob.glob(os.path.join(d, "**", name), recursive=True):
                if text is None:
                    return path
                try:
                    from fontTools.ttLib import TTFont
                    cmap = TTFont(path, lazy=True).getBestCmap() or {}
                    if all(ord(ch) in cmap for ch in text if not ch.isspace()):
                        return path
                except Exception:
                    continue
    raise FileNotFoundError(f"no installed font covers {text!r}; tried {names}")


# ----------------------------------------------------------------------------
# text / glyph
# ----------------------------------------------------------------------------

def render_text(text: str, font_names: list[str] | None = None, size: int = 900, pad: float = 0.04) -> Image.Image:
    """Render (multi-line) text white on black, tightly cropped."""
    path = find_font(font_names or TEXT_FONTS, text)
    font = ImageFont.truetype(path, size)
    probe = Image.new("L", (8, 8), 0)
    d = ImageDraw.Draw(probe)
    l, t, r, b = d.multiline_textbbox((0, 0), text, font=font, align="center", spacing=size * 0.15)
    w, h = int(r - l), int(b - t)
    p = int(max(w, h) * pad) + 4
    img = Image.new("L", (w + 2 * p, h + 2 * p), 0)
    ImageDraw.Draw(img).multiline_text((p - l, p - t), text, fill=255, font=font, align="center",
                                       spacing=size * 0.15)
    return _crop(img)


def render_glyph(ch: str, size: int = 900) -> Image.Image:
    return render_text(ch, SYMBOL_FONTS, size=size)


def _crop(img: Image.Image, pad: int = 6) -> Image.Image:
    bbox = img.getbbox()
    if bbox is None:
        return img
    l, t, r, b = bbox
    l, t = max(0, l - pad), max(0, t - pad)
    r, b = min(img.width, r + pad), min(img.height, b + pad)
    return img.crop((l, t, r, b))


# ----------------------------------------------------------------------------
# photo
# ----------------------------------------------------------------------------

def render_photo(path: str, gamma: float = 1.0, cutoff: float = 1.0) -> Image.Image:
    img = Image.open(path)
    img = ImageOps.exif_transpose(img).convert("L")
    img = ImageOps.autocontrast(img, cutoff=cutoff)
    if gamma != 1.0:
        lut = [int(255 * (i / 255) ** gamma) for i in range(256)]
        img = img.point(lut)
    return img


# ----------------------------------------------------------------------------
# procedural
# ----------------------------------------------------------------------------

def _canvas(S: int):
    img = Image.new("L", (S, S), 0)
    return img, ImageDraw.Draw(img)


def _ellipse_pts(cx, cy, a, b, rot_deg, n=180, t0=0.0, t1=2 * math.pi):
    r = math.radians(rot_deg)
    pts = []
    for k in range(n + 1):
        t = t0 + (t1 - t0) * k / n
        x, y = a * math.cos(t), b * math.sin(t)
        pts.append((cx + x * math.cos(r) - y * math.sin(r), cy + x * math.sin(r) + y * math.cos(r)))
    return pts


def _polygon_star(cx, cy, r_out, r_in, n=5, rot=-90):
    pts = []
    for k in range(2 * n):
        r = r_out if k % 2 == 0 else r_in
        a = math.radians(rot + 180 * k / n)
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def proc_atom(S):
    img, d = _canvas(S)
    c, lw = S / 2, max(3, int(S * 0.035))
    for ang in (0, 60, 120):
        pts = _ellipse_pts(c, c, S * 0.44, S * 0.16, ang, n=240)
        d.line(pts, fill=255, width=lw, joint="curve")
    r = S * 0.065
    d.ellipse([c - r, c - r, c + r, c + r], fill=255)
    for ang, t in ((0, 0.4), (60, 2.2), (120, 4.3)):
        x, y = _ellipse_pts(c, c, S * 0.44, S * 0.16, ang, n=1, t0=t, t1=t)[0]
        re = S * 0.032
        d.ellipse([x - re, y - re, x + re, y + re], fill=255)
    return img


def proc_dna(S):
    img, d = _canvas(S)
    c, lw = S / 2, max(3, int(S * 0.03))
    amp, period = S * 0.22, S * 0.5
    top, bot = S * 0.05, S * 0.95
    ys = np.linspace(top, bot, 300)
    s1 = [(c + amp * math.sin(2 * math.pi * (y - top) / period), y) for y in ys]
    s2 = [(c - amp * math.sin(2 * math.pi * (y - top) / period), y) for y in ys]
    for y in np.linspace(top + 12, bot - 12, 17):
        x1 = c + amp * math.sin(2 * math.pi * (y - top) / period)
        x2 = c - amp * math.sin(2 * math.pi * (y - top) / period)
        if abs(x1 - x2) > S * 0.06:
            d.line([(x1, y), (x2, y)], fill=255, width=max(2, int(lw * 0.6)))
    d.line(s1, fill=255, width=lw, joint="curve")
    d.line(s2, fill=255, width=lw, joint="curve")
    return img


def proc_circuit(S, seed=7):
    img, d = _canvas(S)
    rng = np.random.default_rng(seed)
    g = S / 16
    lw = max(2, int(S * 0.012))
    pad_r = S * 0.016
    # chip in the middle
    cx0, cy0, cw = S * 0.38, S * 0.38, S * 0.24
    d.rectangle([cx0, cy0, cx0 + cw, cy0 + cw], outline=255, width=lw * 2)
    d.rectangle([cx0 + cw * 0.3, cy0 + cw * 0.3, cx0 + cw * 0.7, cy0 + cw * 0.7], fill=255)
    for _ in range(26):
        # start on the chip edge, walk outward with 90° turns
        side = rng.integers(4)
        t = rng.uniform(0.15, 0.85)
        if side == 0:
            x, y, dx, dy = cx0 + cw * t, cy0, 0, -1
        elif side == 1:
            x, y, dx, dy = cx0 + cw, cy0 + cw * t, 1, 0
        elif side == 2:
            x, y, dx, dy = cx0 + cw * t, cy0 + cw, 0, 1
        else:
            x, y, dx, dy = cx0, cy0 + cw * t, -1, 0
        x, y = round(x / g) * g, round(y / g) * g
        pts = [(x, y)]
        for _step in range(rng.integers(2, 6)):
            length = g * rng.integers(1, 4)
            x, y = x + dx * length, y + dy * length
            x, y = min(max(x, g * 0.6), S - g * 0.6), min(max(y, g * 0.6), S - g * 0.6)
            pts.append((x, y))
            if rng.random() < 0.6:
                dx, dy = (dy, dx) if rng.random() < 0.5 else (-dy, -dx)
        d.line(pts, fill=255, width=lw)
        d.ellipse([x - pad_r, y - pad_r, x + pad_r, y + pad_r], fill=255)
        d.ellipse([x - pad_r * 0.45, y - pad_r * 0.45, x + pad_r * 0.45, y + pad_r * 0.45], fill=0)
    return img


def _petal(cx, cy, length, width, ang_deg, n=40):
    a = math.radians(ang_deg)
    pts = []
    for k in range(n + 1):
        s = k / n
        w = width * math.sin(math.pi * s) ** 0.9
        pts.append((s * length, w))
    for k in range(n, -1, -1):
        s = k / n
        w = width * math.sin(math.pi * s) ** 0.9
        pts.append((s * length, -w))
    return [(cx + x * math.cos(a) - y * math.sin(a), cy + x * math.sin(a) + y * math.cos(a)) for x, y in pts]


def proc_lotus(S):
    img, d = _canvas(S)
    cx, cy = S / 2, S * 0.82
    seam = max(2, int(S * 0.012))
    layers = [(S * 0.52, S * 0.13, 7, 150), (S * 0.42, S * 0.12, 5, 120), (S * 0.30, S * 0.10, 3, 70)]
    for length, width, n, spread in layers:
        for k in range(n):
            ang = -90 - spread / 2 + spread * k / (n - 1) if n > 1 else -90
            pts = _petal(cx, cy, length, width, ang)
            d.polygon(pts, fill=255)
            d.line(pts + [pts[0]], fill=0, width=seam)
    # water line
    d.line([(S * 0.12, cy + S * 0.05), (S * 0.88, cy + S * 0.05)], fill=255, width=seam * 2)
    d.line([(S * 0.22, cy + S * 0.10), (S * 0.78, cy + S * 0.10)], fill=255, width=seam)
    return img


def proc_menorah(S, branches=9):
    img, d = _canvas(S)
    c = S / 2
    lw = max(3, int(S * 0.03))
    base_y = S * 0.88
    arc_cy = S * 0.62
    n_side = (branches - 1) // 2
    step = S * 0.085
    # stem
    d.line([(c, S * 0.14), (c, base_y)], fill=255, width=lw)
    # foot
    d.polygon([(c - S * 0.14, base_y + S * 0.03), (c + S * 0.14, base_y + S * 0.03),
               (c + S * 0.09, base_y - S * 0.03), (c - S * 0.09, base_y - S * 0.03)], fill=255)
    tops = [(c, S * 0.14)]
    for k in range(1, n_side + 1):
        r = step * k
        pts = _ellipse_pts(c, arc_cy, r, r, 0, n=120, t0=math.pi, t1=2 * math.pi)
        d.line(pts, fill=255, width=lw, joint="curve")
        # candles
        for sx in (-1, 1):
            x = c + sx * r
            d.line([(x, arc_cy), (x, S * 0.24)], fill=255, width=lw)
            tops.append((x, S * 0.24))
    for x, y in tops:
        fl = S * 0.03
        d.polygon([(x, y - fl * 2.4), (x + fl, y - fl * 0.8), (x, y + fl * 0.1), (x - fl, y - fl * 0.8)], fill=255)
    return img


def proc_diya(S):
    img, d = _canvas(S)
    cx, cy = S / 2, S * 0.62
    a, b = S * 0.40, S * 0.22
    # bowl = lower half ellipse
    pts = _ellipse_pts(cx, cy, a, b, 0, n=120, t0=0, t1=math.pi)
    d.polygon(pts, fill=255)
    # rim
    d.line(_ellipse_pts(cx, cy, a, S * 0.06, 0, n=160), fill=255, width=max(3, int(S * 0.02)))
    d.line(_ellipse_pts(cx, cy, a * 0.8, S * 0.04, 0, n=160), fill=0, width=max(2, int(S * 0.012)))
    # flame = teardrop (round bottom, pointed top) with a dark core
    fx, fy = cx, cy - S * 0.08
    for scale, fill in ((1.0, 255), (0.42, 0)):
        h, w = S * 0.30 * scale, S * 0.095 * scale
        base_y = fy - w - (1 - scale) * S * 0.02
        pts = [(fx, base_y - h + w)]
        pts += [(fx + w * math.cos(a), base_y + w * math.sin(a)) for a in np.linspace(0, math.pi, 40)]
        d.polygon(pts, fill=fill)
    # sparks
    for ang in (-50, -20, 20, 50):
        r1, r2 = S * 0.27, S * 0.32
        x1, y1 = fx + r1 * math.sin(math.radians(ang)), fy - S * 0.06 - r1 * math.cos(math.radians(ang)) * 0.8
        x2, y2 = fx + r2 * math.sin(math.radians(ang)), fy - S * 0.06 - r2 * math.cos(math.radians(ang)) * 0.8
        d.line([(x1, y1), (x2, y2)], fill=255, width=max(2, int(S * 0.012)))
    return img


def proc_d20(S):
    img, d = _canvas(S)
    c = S / 2
    lw = max(3, int(S * 0.028))
    R = S * 0.44
    hexa = [(c + R * math.cos(math.radians(90 + 60 * k)), c + R * math.sin(math.radians(90 + 60 * k))) for k in range(6)]
    d.polygon(hexa, outline=255, width=lw)
    r2 = R * 0.52
    tri = [(c + r2 * math.cos(math.radians(a)), c + r2 * math.sin(math.radians(a))) for a in (270, 30, 150)]
    d.polygon(tri, outline=255, width=lw)
    for i, (tx, ty) in enumerate(tri):
        for hx, hy in hexa:
            if math.dist((tx, ty), (hx, hy)) < R * 0.95:
                d.line([(tx, ty), (hx, hy)], fill=255, width=lw)
    try:
        font = ImageFont.truetype(find_font(TEXT_FONTS), int(S * 0.17))
        d.text((c, c + S * 0.02), "20", fill=255, font=font, anchor="mm")
    except Exception:
        pass
    return img


def proc_planet(S):
    img, d = _canvas(S)
    c = S / 2
    r = S * 0.26
    lw = max(4, int(S * 0.05))
    tilt = -18
    ring = _ellipse_pts(c, c, S * 0.47, S * 0.13, tilt, n=240)
    d.line(ring + [ring[0]], fill=255, width=lw, joint="curve")
    d.ellipse([c - r - lw, c - r - lw, c + r + lw, c + r + lw], fill=0)
    d.ellipse([c - r, c - r, c + r, c + r], fill=255)
    front = _ellipse_pts(c, c, S * 0.47, S * 0.13, tilt, n=120, t0=0, t1=math.pi)
    d.line(front, fill=255, width=lw, joint="curve")
    # craters
    for (dx, dy, cr) in ((-0.08, -0.06, 0.05), (0.09, 0.03, 0.035), (-0.02, 0.12, 0.03)):
        x, y, rr = c + dx * S, c + dy * S, cr * S
        d.ellipse([x - rr, y - rr, x + rr, y + rr], fill=0)
        d.ellipse([x - rr * 0.6, y - rr * 0.6, x + rr * 0.6, y + rr * 0.6], fill=255)
    return img


def proc_constellation(S, seed=3):
    img, d = _canvas(S)
    rng = np.random.default_rng(seed)
    for _ in range(90):
        x, y = rng.uniform(0.03, 0.97) * S, rng.uniform(0.03, 0.97) * S
        r = rng.choice([2.5, 3.5, 4.5, 6.0]) * S / 500
        d.ellipse([x - r, y - r, x + r, y + r], fill=255)
    main = [(0.22, 0.25), (0.35, 0.40), (0.50, 0.33), (0.62, 0.48), (0.78, 0.42), (0.70, 0.66), (0.45, 0.72)]
    pts = [(x * S, y * S) for x, y in main]
    d.line(pts, fill=255, width=max(3, int(S * 0.012)))
    for x, y in pts:
        r = S * 0.03
        d.polygon(_polygon_star(x, y, r, r * 0.45, n=4), fill=255)
    return img


def proc_rocket(S):
    img, d = _canvas(S)
    c = S / 2
    bw, top, bot = S * 0.13, S * 0.10, S * 0.74
    # body
    d.rounded_rectangle([c - bw, top + S * 0.14, c + bw, bot], radius=int(bw * 0.5), fill=255)
    # nose
    d.polygon([(c - bw, top + S * 0.16), (c, top), (c + bw, top + S * 0.16)], fill=255)
    # fins
    d.polygon([(c - bw, bot - S * 0.18), (c - bw - S * 0.12, bot + S * 0.03), (c - bw, bot)], fill=255)
    d.polygon([(c + bw, bot - S * 0.18), (c + bw + S * 0.12, bot + S * 0.03), (c + bw, bot)], fill=255)
    # window
    r = bw * 0.55
    d.ellipse([c - r, top + S * 0.30 - r, c + r, top + S * 0.30 + r], fill=0)
    d.ellipse([c - r * 0.65, top + S * 0.30 - r * 0.65, c + r * 0.65, top + S * 0.30 + r * 0.65], fill=255)
    # flame
    for scale, fill in ((1.0, 255), (0.5, 0)):
        fw, fh = bw * 0.8 * scale, S * 0.17 * scale
        d.polygon([(c - fw, bot), (c + fw, bot), (c, bot + fh)], fill=fill)
    return img


def proc_pixel_heart(S):
    img, d = _canvas(S)
    rows = ["0110110", "1111111", "1111111", "0111110", "0011100", "0001000"]
    n, m = len(rows), len(rows[0])
    cell = S * 0.8 / m
    x0, y0 = (S - cell * m) / 2, (S - cell * n) / 2
    gap = cell * 0.08
    for i, row in enumerate(rows):
        for j, ch in enumerate(row):
            if ch == "1":
                d.rectangle([x0 + j * cell + gap, y0 + i * cell + gap,
                             x0 + (j + 1) * cell - gap, y0 + (i + 1) * cell - gap], fill=255)
    return img


def proc_binary(S, seed=42):
    img, d = _canvas(S)
    rng = np.random.default_rng(seed)
    font = ImageFont.truetype(find_font(MONO_FONTS), int(S * 0.085))
    rows, cols = 10, 11
    for i in range(rows):
        line = "".join(rng.choice(["0", "1"]) for _ in range(cols))
        d.text((S * 0.5, S * 0.08 + i * S * 0.092), line, fill=255, font=font, anchor="mt")
    return img


def proc_star_of_david(S):
    img, d = _canvas(S)
    c, R = S / 2, S * 0.44
    lw = max(4, int(S * 0.07))
    for rot in (-90, 90):
        pts = [(c + R * math.cos(math.radians(rot + 120 * k)), c + R * math.sin(math.radians(rot + 120 * k))) for k in range(3)]
        d.polygon(pts, outline=255, width=lw)
    return img


def proc_cross(S):
    img, d = _canvas(S)
    c = S / 2
    vw, hh = S * 0.17, S * 0.17
    d.rectangle([c - vw / 2, S * 0.06, c + vw / 2, S * 0.94], fill=255)
    y = S * 0.34
    d.rectangle([S * 0.17, y - hh / 2, S * 0.83, y + hh / 2], fill=255)
    return img


def proc_star_crescent(S):
    img, d = _canvas(S)
    cx, cy, r = S * 0.44, S * 0.5, S * 0.36
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=255)
    ox, r2 = cx + S * 0.13, r * 0.84
    d.ellipse([ox - r2, cy - r2, ox + r2, cy + r2], fill=0)
    d.polygon(_polygon_star(S * 0.78, S * 0.42, S * 0.12, S * 0.05), fill=255)
    return img


def proc_snowflake(S):
    img, d = _canvas(S)
    c, R = S / 2, S * 0.45
    lw = max(3, int(S * 0.03))
    for k in range(6):
        a = math.radians(60 * k)
        ex, ey = c + R * math.cos(a), c + R * math.sin(a)
        d.line([(c, c), (ex, ey)], fill=255, width=lw)
        for f in (0.45, 0.7):
            px, py = c + R * f * math.cos(a), c + R * f * math.sin(a)
            for sgn in (-1, 1):
                b = a + sgn * math.radians(55)
                d.line([(px, py), (px + R * 0.18 * math.cos(b), py + R * 0.18 * math.sin(b))], fill=255, width=lw)
    return img


def proc_christmas_tree(S):
    img, d = _canvas(S)
    c = S / 2
    tiers = [(0.12, 0.40, 0.22), (0.30, 0.62, 0.30), (0.50, 0.84, 0.38)]
    for top, bot, half in tiers:
        d.polygon([(c, top * S), (c + half * S, bot * S), (c - half * S, bot * S)], fill=255)
    d.rectangle([c - S * 0.06, S * 0.84, c + S * 0.06, S * 0.95], fill=255)
    d.polygon(_polygon_star(c, S * 0.10, S * 0.075, S * 0.03), fill=255)
    rng = np.random.default_rng(5)
    for _ in range(14):
        t = rng.uniform(0.2, 0.82)
        half = 0.02 + (t - 0.12) * 0.42
        x = c + rng.uniform(-half, half) * S * 0.9
        r = S * 0.022
        d.ellipse([x - r, t * S - r, x + r, t * S + r], fill=0)
    return img



def proc_pumpkin(S):
    img, d = _canvas(S)
    c, cy = S / 2, S * 0.56
    seam = max(2, int(S * 0.011))
    a, b = S * 0.44, S * 0.33
    d.ellipse([c - a, cy - b, c + a, cy + b], fill=255)
    # lobe seams: concentric narrower ellipses, drawn before the face
    for fa in (0.17, 0.31):
        d.ellipse([c - fa * S, cy - b * 0.985, c + fa * S, cy + b * 0.985], outline=0, width=seam)
    # stem
    d.polygon([(c - S * 0.04, cy - S * 0.31), (c + S * 0.05, cy - S * 0.31), (c + S * 0.07, cy - S * 0.44),
               (c - S * 0.02, cy - S * 0.44)], fill=255)
    # face (dark = blocked)
    d.polygon([(c - 0.24 * S, cy - 0.03 * S), (c - 0.08 * S, cy - 0.03 * S), (c - 0.16 * S, cy - 0.17 * S)], fill=0)
    d.polygon([(c + 0.24 * S, cy - 0.03 * S), (c + 0.08 * S, cy - 0.03 * S), (c + 0.16 * S, cy - 0.17 * S)], fill=0)
    d.polygon([(c - 0.045 * S, cy + 0.05 * S), (c + 0.045 * S, cy + 0.05 * S), (c, cy - 0.04 * S)], fill=0)
    mouth = [(c - 0.28 * S, cy + 0.09 * S), (c - 0.19 * S, cy + 0.17 * S), (c - 0.11 * S, cy + 0.10 * S),
             (c - 0.03 * S, cy + 0.19 * S), (c + 0.05 * S, cy + 0.10 * S), (c + 0.14 * S, cy + 0.18 * S),
             (c + 0.28 * S, cy + 0.09 * S), (c + 0.17 * S, cy + 0.25 * S), (c, cy + 0.28 * S), (c - 0.17 * S, cy + 0.25 * S)]
    d.polygon(mouth, fill=0)
    return img


def proc_ghost(S):
    img, d = _canvas(S)
    c = S / 2
    w, top, bot = S * 0.30, S * 0.10, S * 0.86
    pts = _ellipse_pts(c, top + w, w, w, 0, n=80, t0=math.pi, t1=2 * math.pi)   # rounded head
    pts.append((c + w, bot - S * 0.06))
    waves = 5
    for k in range(waves * 2 + 1):
        x = c + w - 2 * w * k / (waves * 2)
        y = bot if k % 2 == 1 else bot - S * 0.07
        pts.append((x, y))
    pts.append((c - w, bot - S * 0.06))
    d.polygon(pts, fill=255)
    for dx in (-0.11, 0.11):
        r = S * 0.05
        d.ellipse([c + dx * S - r, top + S * 0.30 - r * 1.3, c + dx * S + r, top + S * 0.30 + r * 1.3], fill=0)
    d.ellipse([c - S * 0.05, top + S * 0.44, c + S * 0.05, top + S * 0.54], fill=0)
    return img


def proc_bat(S):
    img, d = _canvas(S)
    c, cy = S / 2, S * 0.5
    # body + head
    d.ellipse([c - S * 0.09, cy - S * 0.14, c + S * 0.09, cy + S * 0.16], fill=255)
    d.ellipse([c - S * 0.08, cy - S * 0.22, c + S * 0.08, cy - S * 0.06], fill=255)
    d.polygon([(c - S * 0.07, cy - S * 0.18), (c - S * 0.10, cy - S * 0.30), (c - S * 0.02, cy - S * 0.20)], fill=255)
    d.polygon([(c + S * 0.07, cy - S * 0.18), (c + S * 0.10, cy - S * 0.30), (c + S * 0.02, cy - S * 0.20)], fill=255)
    # wings: top edge straight-ish, bottom edge scalloped
    for sgn in (-1, 1):
        wing = [(c + sgn * S * 0.06, cy - S * 0.08), (c + sgn * S * 0.22, cy - S * 0.20), (c + sgn * S * 0.47, cy - S * 0.26),
                (c + sgn * S * 0.46, cy + S * 0.02)]
        scal = [(0.46, 0.02), (0.38, -0.06), (0.31, 0.08), (0.24, -0.02), (0.17, 0.12), (0.10, 0.04), (0.06, 0.12)]
        for x, y in scal:
            wing.append((c + sgn * x * S, cy + y * S))
        d.polygon(wing, fill=255)
    # eyes
    for dx in (-0.03, 0.03):
        r = S * 0.012
        d.ellipse([c + dx * S - r, cy - S * 0.15 - r, c + dx * S + r, cy - S * 0.15 + r], fill=0)
    return img


def proc_spiderweb(S):
    img, d = _canvas(S)
    cx, cy = S * 0.5, S * 0.5
    lw = max(2, int(S * 0.012))
    R = S * 0.47
    spokes = 10
    angs = [2 * math.pi * k / spokes for k in range(spokes)]
    for a in angs:
        d.line([(cx, cy), (cx + R * math.cos(a), cy + R * math.sin(a))], fill=255, width=lw)
    for f in (0.18, 0.34, 0.50, 0.66, 0.82, 0.98):
        for k in range(spokes):
            a0, a1 = angs[k], angs[(k + 1) % spokes]
            p0 = (cx + R * f * math.cos(a0), cy + R * f * math.sin(a0))
            p1 = (cx + R * f * math.cos(a1), cy + R * f * math.sin(a1))
            am = (a0 + a1) / 2 if k < spokes - 1 else a0 + math.pi / spokes
            sag = 0.92
            pm = (cx + R * f * sag * math.cos(am), cy + R * f * sag * math.sin(am))
            d.line([p0, pm, p1], fill=255, width=lw)
    # spider hanging bottom-right
    sx, sy = cx + S * 0.30, cy + S * 0.30
    d.line([(sx, sy), (cx + S * 0.18, cy + S * 0.18)], fill=255, width=lw)
    d.ellipse([sx - S * 0.05, sy - S * 0.04, sx + S * 0.05, sy + S * 0.06], fill=255)
    d.ellipse([sx - S * 0.03, sy - S * 0.08, sx + S * 0.03, sy - S * 0.03], fill=255)
    for k in range(4):
        a = math.radians(15 + 25 * k)
        for sgn in (-1, 1):
            d.line([(sx, sy), (sx + sgn * S * 0.11 * math.cos(a), sy - S * 0.11 * math.sin(a) + S * 0.04 * k)],
                   fill=255, width=max(2, int(lw * 0.8)))
    return img


PROCEDURAL = {
    "atom": proc_atom, "dna": proc_dna, "circuit": proc_circuit, "lotus": proc_lotus,
    "menorah": proc_menorah, "diya": proc_diya, "d20": proc_d20, "planet": proc_planet,
    "constellation": proc_constellation, "rocket": proc_rocket, "pixel-heart": proc_pixel_heart,
    "binary": proc_binary, "star-of-david": proc_star_of_david, "cross": proc_cross,
    "star-crescent": proc_star_crescent, "snowflake": proc_snowflake, "christmas-tree": proc_christmas_tree,
    "pumpkin": proc_pumpkin, "ghost": proc_ghost, "bat": proc_bat, "spiderweb": proc_spiderweb,
}

GLYPHS = {
    "om": "ॐ", "dharma-wheel": "☸", "khanda": "☬", "ankh": "☥", "yin-yang": "☯", "peace": "☮",
    "pi": "π", "infinity": "∞", "radioactive": "☢", "chess-knight": "♞", "omega": "Ω",
    "sum": "∑", "star": "★", "heart": "♥",
}

CATALOG = {
    "faith": ["om", "lotus", "diya", "cross", "star-crescent", "star-of-david", "menorah",
              "dharma-wheel", "khanda", "ankh", "yin-yang", "peace"],
    "nerd": ["atom", "dna", "circuit", "d20", "planet", "constellation", "rocket", "pixel-heart",
             "binary", "pi", "infinity", "radioactive", "chess-knight", "omega", "sum"],
    "halloween": ["pumpkin", "ghost", "bat", "spiderweb"],
    "season": ["snowflake", "christmas-tree", "star", "heart"],
}


def list_motifs() -> list[str]:
    return sorted(set(PROCEDURAL) | set(GLYPHS))


def render_motif(name: str, S: int = 900) -> Image.Image:
    if name in PROCEDURAL:
        return _crop(PROCEDURAL[name](S))
    if name in GLYPHS:
        return render_glyph(GLYPHS[name], size=S)
    if len(name) == 1:
        return render_glyph(name, size=S)
    raise KeyError(f"unknown motif {name!r}; one of {list_motifs()}")


def to_float(img: Image.Image) -> np.ndarray:
    return np.asarray(img.convert("L"), dtype=np.float32) / 255.0
