#!/usr/bin/env python3
"""
Shadow lamp generator — motif → print-ready lithophane lamp.

    python lamps/shadowlamp.py --motif om --out out/om
    python lamps/shadowlamp.py --motif diya --text "Happy Diwali" --out out/diwali
    python lamps/shadowlamp.py --text "Léa" --motif snowflake --repeat 2 --out out/lea
    python lamps/shadowlamp.py --image photo.jpg --span 200 --out out/photo
    python lamps/shadowlamp.py --list

The shade is a cylinder whose wall thickness follows the image: white = thin
(0.6 mm, light passes), black = thick (up to 2.6 mm, blocked). Printed
upright, 100 % infill, 0.12 mm layers, white PLA. The base is a puck with a
plug the shade slides over and a cavity for an LED tea light or USB puck.

Outputs in --out: shade.stl, base.stl (+ cap.stl), lamp.3mf (both parts,
coloured for the AMS), preview.png (backlit simulation), heightmap.png and
job.json (dimensions, grams, print time, cost floor, suggested retail).
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
import time

import numpy as np
from PIL import Image, ImageDraw, ImageOps
from scipy.ndimage import gaussian_filter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import meshgen  # noqa: E402
import motifs  # noqa: E402
import pricing  # noqa: E402

LED_PRESETS = {
    "tealight": (39.0, 16.0, 1.50),   # Ø mm, cavity depth mm, unit cost €
    "puck70": (71.0, 14.0, 3.50),
    "puck80": (81.0, 14.0, 4.00),
    "none": (0.0, 0.0, 0.0),
}


# ----------------------------------------------------------------------------
# image assembly
# ----------------------------------------------------------------------------

def fit(img: Image.Image, bw: int, bh: int) -> Image.Image:
    s = min(bw / img.width, bh / img.height)
    return img.resize((max(1, int(img.width * s)), max(1, int(img.height * s))), Image.LANCZOS)


def build_panel(args, bw: int, bh: int) -> np.ndarray:
    """One copy of the artwork as floats in [0,1] (1 = light), size (bh, bw)."""
    bg, fg = args.bg, args.fg
    panel = np.full((bh, bw), bg, dtype=np.float32)

    if args.image:
        photo = motifs.render_photo(args.image, gamma=args.gamma)
        photo = ImageOps.fit(photo, (bw, bh), Image.LANCZOS)
        p = motifs.to_float(photo)
        # feather the border into the background so the photo does not end in a hard step
        f = max(1, int(args.feather * args.px))
        yy, xx = np.mgrid[0:bh, 0:bw]
        edge = np.minimum.reduce([xx, bw - 1 - xx, yy, bh - 1 - yy]).astype(np.float32)
        mask = np.clip(edge / f, 0, 1)
        panel = bg + (p - bg) * mask
        if args.text:
            txt = fit(motifs.render_text(args.text), int(bw * 0.9), int(bh * 0.22))
            _paste_max(panel, motifs.to_float(txt) * fg, (bw - txt.width) // 2, bh - txt.height - int(bh * 0.04))
        return panel

    art = motifs.render_motif(args.motif) if args.motif else None
    txt = motifs.render_text(args.text) if args.text else None
    if art is not None and txt is not None:
        art_f = fit(art, int(bw * 0.92), int(bh * 0.64))
        txt_f = fit(txt, int(bw * 0.92), int(bh * 0.22))
        gap = int(bh * 0.05)
        total = art_f.height + gap + txt_f.height
        y0 = (bh - total) // 2
        _paste_mix(panel, motifs.to_float(art_f), (bw - art_f.width) // 2, y0, bg, fg)
        _paste_mix(panel, motifs.to_float(txt_f), (bw - txt_f.width) // 2, y0 + art_f.height + gap, bg, fg)
    elif art is not None:
        art_f = fit(art, int(bw * 0.92), int(bh * 0.92))
        _paste_mix(panel, motifs.to_float(art_f), (bw - art_f.width) // 2, (bh - art_f.height) // 2, bg, fg)
    elif txt is not None:
        txt_f = fit(txt, int(bw * 0.92), int(bh * 0.92))
        _paste_mix(panel, motifs.to_float(txt_f), (bw - txt_f.width) // 2, (bh - txt_f.height) // 2, bg, fg)
    return panel


def _paste_mix(canvas, art01, x, y, bg, fg):
    h, w = art01.shape
    region = canvas[y:y + h, x:x + w]
    region[:] = bg + (fg - bg) * art01[: region.shape[0], : region.shape[1]]


def _paste_max(canvas, art, x, y):
    h, w = art.shape
    region = canvas[y:y + h, x:x + w]
    region[:] = np.maximum(region, art[: region.shape[0], : region.shape[1]])


def build_canvas(args) -> np.ndarray:
    """Full unwrapped shade, (H px, W px). Column 0 is the front (θ = 0)."""
    circ = math.pi * (args.dia + 2 * args.tmin)
    W = int(round(circ * args.px))
    H = int(round(args.height * args.px))
    canvas = np.full((H, W), args.bg, dtype=np.float32)

    span_px = int(W * min(args.span, 360.0 / args.repeat) / 360.0)
    top = int(H * args.margin)
    bh = H - 2 * top
    panel = build_panel(args, span_px, bh)
    for k in range(args.repeat):
        xc = int(round(W * k / args.repeat))
        cols = (xc - span_px // 2 + np.arange(span_px)) % W
        canvas[top:top + bh, cols] = panel
    if args.invert:
        canvas = args.fg + args.bg - canvas
    if args.blur > 0:
        canvas = gaussian_filter(canvas, sigma=args.blur * args.px, mode=("nearest", "wrap"))
    return np.clip(canvas, 0.0, 1.0)


# ----------------------------------------------------------------------------
# preview (Beer–Lambert backlight simulation)
# ----------------------------------------------------------------------------

def preview(thick: np.ndarray, args, path: str) -> None:
    mu = args.mu
    T = np.exp(-mu * (thick - args.tmin))            # 1.0 at the thinnest wall
    nz, nt = T.shape
    # unwrapped, rolled so the front (θ = 0) sits in the middle
    unwrapped = Image.fromarray((np.flipud(np.roll(T, nt // 2, axis=1)) * 255).astype(np.uint8), "L")
    uw_h = 360
    unwrapped = unwrapped.resize((int(unwrapped.width * uw_h / unwrapped.height), uw_h), Image.BILINEAR)
    # front view: columns x in [-R, R] → θ = asin(x/R), centred on θ = 0
    R = args.dia / 2 + args.tmax
    px = 3.2
    fw = int(2 * R * px)
    x = (np.arange(fw) + 0.5) / fw * 2 - 1              # -1..1
    theta = np.arcsin(np.clip(x, -1, 1))
    col = (np.round(theta / (2 * np.pi) * nt).astype(int)) % nt
    front = T[:, col]                                    # (nz, fw)
    shade = (0.55 + 0.45 * np.cos(theta))[None, :]
    rgb = np.zeros((nz, fw, 3), dtype=np.float32)
    warm = np.array([1.0, 0.86, 0.62])
    for c in range(3):
        rgb[..., c] = front * shade * warm[c]
    fh = int(args.height * px)
    front_img = Image.fromarray((np.clip(np.flipud(rgb), 0, 1) * 255).astype(np.uint8), "RGB").resize((fw, fh), Image.BILINEAR)
    # base below the shade
    base_h = int(args.base_h * px)
    canvas = Image.new("RGB", (fw + 40, fh + base_h + 40), (18, 18, 20))
    canvas.paste(front_img, (20, 20))
    d = ImageDraw.Draw(canvas)
    d.rounded_rectangle([8, 20 + fh, fw + 32, 20 + fh + base_h], radius=6, fill=(40, 40, 44))
    # compose side by side
    out = Image.new("RGB", (unwrapped.width + canvas.width + 60, max(unwrapped.height, canvas.height) + 40), (18, 18, 20))
    out.paste(unwrapped.convert("RGB"), (20, 20))
    out.paste(canvas, (unwrapped.width + 40, 20))
    d = ImageDraw.Draw(out)
    d.text((20, 4), "unwrapped transmittance (360°)", fill=(160, 160, 170))
    d.text((unwrapped.width + 40, 4), "front view, backlit", fill=(160, 160, 170))
    out.save(path)


# ----------------------------------------------------------------------------
# main
# ----------------------------------------------------------------------------

def parse(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    src = ap.add_argument_group("artwork")
    src.add_argument("--motif", help="motif name (see --list) or a single character")
    src.add_argument("--text", help="text line(s); use \\n for a line break")
    src.add_argument("--image", help="photo → classic lithophane")
    src.add_argument("--gamma", type=float, default=1.0, help="photo gamma (>1 darkens midtones)")
    src.add_argument("--list", action="store_true", help="list motifs and exit")
    lay = ap.add_argument_group("layout")
    lay.add_argument("--span", type=float, default=150.0, help="panel width in degrees of circumference")
    lay.add_argument("--repeat", type=int, default=1, help="copies around the shade")
    lay.add_argument("--margin", type=float, default=0.10, help="top/bottom margin as a fraction of height")
    lay.add_argument("--bg", type=float, default=0.30, help="background light level 0..1 (0 = darkest)")
    lay.add_argument("--fg", type=float, default=1.00, help="motif light level 0..1")
    lay.add_argument("--invert", action="store_true", help="dark motif on a glowing background")
    lay.add_argument("--blur", type=float, default=0.25, help="edge softening in mm")
    lay.add_argument("--feather", type=float, default=4.0, help="photo border feather in mm")
    geo = ap.add_argument_group("geometry")
    geo.add_argument("--dia", type=float, default=80.0, help="inner diameter of the shade, mm")
    geo.add_argument("--height", type=float, default=110.0, help="shade height, mm")
    geo.add_argument("--tmin", type=float, default=0.6, help="thinnest wall, mm")
    geo.add_argument("--tmax", type=float, default=2.6, help="thickest wall, mm")
    geo.add_argument("--relief", choices=["out", "in"], default="out")
    geo.add_argument("--res", type=float, default=2.0, help="mesh segments per mm (2 → ~23 MB STL; 3 for photos)")
    geo.add_argument("--px", type=float, default=4.0, help="raster pixels per mm")
    geo.add_argument("--led", choices=list(LED_PRESETS), default="tealight")
    geo.add_argument("--led-dia", type=float, help="override LED Ø mm")
    geo.add_argument("--led-depth", type=float, help="override cavity depth mm")
    geo.add_argument("--base-h", type=float, default=10.0, help="base puck height, mm")
    geo.add_argument("--no-base", action="store_true")
    geo.add_argument("--cap", action="store_true", help="also make a top ring")
    geo.add_argument("--usb-slot", action="store_true", help="cable slot in the base (needs manifold3d)")
    prc = ap.add_argument_group("pricing")
    prc.add_argument("--min-retail", type=float, default=34.90)
    prc.add_argument("--mu", type=float, default=1.2, help="PLA absorption 1/mm for the preview")
    ap.add_argument("--out", default="out/lamp")
    ap.add_argument("--name", help="job name (default: from the artwork)")
    args = ap.parse_args(argv)
    if args.list:
        for cat, names in motifs.CATALOG.items():
            print(f"{cat:8s} " + ", ".join(names))
        sys.exit(0)
    if not (args.motif or args.text or args.image):
        ap.error("give --motif, --text or --image")
    if args.text:
        args.text = args.text.replace("\\n", "\n")
    return args


def main(argv=None):
    args = parse(argv)
    t0 = time.time()
    os.makedirs(args.out, exist_ok=True)
    name = args.name or (os.path.splitext(os.path.basename(args.image))[0] if args.image else
                         "-".join(x for x in [args.motif, (args.text or "").replace("\n", " ")] if x))

    # 1. artwork → light map → thickness map on the mesh grid
    L = build_canvas(args)
    Image.fromarray((L * 255).astype(np.uint8), "L").save(os.path.join(args.out, "heightmap.png"))
    circ = math.pi * (args.dia + 2 * args.tmin)
    nt = int(round(circ * args.res))
    nz = int(round(args.height * args.res))
    Lm = np.asarray(Image.fromarray(L, "F").resize((nt, nz), Image.BILINEAR), dtype=np.float32)
    thick = args.tmin + (1.0 - np.flipud(Lm)) * (args.tmax - args.tmin)   # row 0 = bottom

    # 2. meshes
    r_in = args.dia / 2
    shade = meshgen.shade_mesh(thick, r_in, args.height, relief=args.relief)
    parts = [{"name": "shade", "mesh": shade, "color": "#F2F2F0", "material": "White PLA (lithophane)",
              "translate": (0.0, 0.0, 0.0), "profile": "lithophane"}]
    r_out = r_in + args.tmax
    base_dims = None
    led_dia, led_depth, led_cost = LED_PRESETS[args.led]
    led_dia = args.led_dia or led_dia
    led_depth = args.led_depth or led_depth
    if not args.no_base:
        base, base_dims = meshgen.base_mesh(r_in, r_out, led_dia, led_depth, base_h=args.base_h)
        if args.usb_slot:
            base = meshgen.usb_slot(base, base_dims["diameter"] / 2, base_dims["height"])
        parts.append({"name": "base", "mesh": base, "color": "#262626", "material": "Black PLA",
                      "translate": (base_dims["diameter"] + 12.0, 0.0, 0.0), "profile": "solid"})
    if args.cap:
        cap = meshgen.cap_mesh(r_in, r_out)
        parts.append({"name": "cap", "mesh": cap, "color": "#262626", "material": "Black PLA",
                      "translate": (0.0, -(2 * r_out + 20.0), 0.0), "profile": "solid"})

    # 3. exports
    for p in parts:
        p["mesh"].export(os.path.join(args.out, f"{p['name']}.stl"))
    meshgen.write_3mf(os.path.join(args.out, "lamp.3mf"), parts, title=f"shadow lamp — {name}")
    preview(thick, args, os.path.join(args.out, "preview.png"))

    # 4. checks + cost
    rates = pricing.Rates()
    calib = os.path.join(os.path.dirname(os.path.abspath(__file__)), "calibration.json")
    if os.path.exists(calib):
        with open(calib) as fh:
            for k, v in json.load(fh).items():
                if hasattr(rates, k):
                    setattr(rates, k, v)
    reports, estimates = {}, []
    for p in parts:
        rep = meshgen.mesh_report(p["mesh"])
        rep["fits_p1s_bed"] = bool(all(s <= 250.0 for s in rep["size_mm"]))
        reports[p["name"]] = rep
        estimates.append(pricing.estimate_part(p["name"], rep["volume_mm3"], rep["area_mm2"], p["profile"], rates))
    components = {"led": led_cost} if led_cost else {}
    q = pricing.quote(estimates, rates, components, min_retail=args.min_retail)

    job = {
        "name": name,
        "artwork": {"motif": args.motif, "text": args.text, "image": args.image, "span_deg": args.span,
                    "repeat": args.repeat, "bg": args.bg, "fg": args.fg, "invert": args.invert},
        "shade": {"inner_diameter": args.dia, "outer_diameter_max": round(2 * r_out, 2), "height": args.height,
                  "wall_min": args.tmin, "wall_max": args.tmax, "relief": args.relief,
                  "wall_mean": round(float(thick.mean()), 2)},
        "base": base_dims, "led": {"preset": args.led, "diameter": led_dia, "cavity_depth": led_depth},
        "mesh": reports,
        "print_settings": {
            "shade": "white PLA · upright · 0.12 mm layers · 100 % infill · 3 walls · 0 top/bottom · no supports · outer wall ≤ 60 mm/s",
            "base": "black PLA · 0.20 mm layers · 15 % gyroid · 3 walls · plug face up",
        },
        "quote": q,
        "generated_in_s": round(time.time() - t0, 1),
    }
    with open(os.path.join(args.out, "job.json"), "w") as fh:
        json.dump(job, fh, indent=2, ensure_ascii=False)

    ok = all(r["watertight"] and r["winding_consistent"] for r in reports.values())
    print(f"[{name}] {'OK' if ok else 'MESH PROBLEM'} — shade Ø{2 * r_out:.0f}×{args.height:.0f} mm, "
          f"{q['grams_total']} g, ~{q['hours_total']} h, cost €{q['cost_total']}, "
          f"floor €{q['floor_price']}, retail €{q['suggested_retail']} "
          f"(€{q['revenue_per_print_hour_at_retail']}/print-h) → {args.out}/")
    for n, r in reports.items():
        print(f"   {n:6s} {r['faces']:>8,} tris  watertight={r['watertight']}  {r['size_mm']} mm")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
