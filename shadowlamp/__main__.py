"""CLI for the Shadow Lamp engine."""
from __future__ import annotations

import argparse
import os
import sys
import time

from . import themes
from .export import write_job
from .lamp import MODES, LampSpec, build


def _add_lamp_args(ap: argparse.ArgumentParser):
    ap.add_argument("--theme", choices=sorted(themes.THEMES), help="symbol / pattern theme")
    ap.add_argument("--image", help="photo for a lithophane (jpg/png)")
    ap.add_argument("--mode", choices=MODES, help="litho | glow | inlay | cutout (default: theme's)")
    ap.add_argument("--shape", choices=["cylinder", "arc", "flat"], default="cylinder")
    ap.add_argument("--diameter", type=float, default=90.0, help="inner diameter mm (cylinder/arc)")
    ap.add_argument("--arc", type=float, default=360.0, help="arc degrees for shape=arc")
    ap.add_argument("--width", type=float, default=100.0, help="panel width mm for shape=flat")
    ap.add_argument("--height", type=float, default=110.0)
    ap.add_argument("--pitch", type=float, default=0.3, help="heightmap pitch mm (litho/glow)")
    ap.add_argument("--min-wall", type=float, default=0.8)
    ap.add_argument("--max-wall", type=float, default=2.8)
    ap.add_argument("--wall", type=float, default=2.4, help="wall for glow/inlay/cutout")
    ap.add_argument("--rim", type=float, default=5.0, help="solid rim height top/bottom mm")
    ap.add_argument("--frame", type=float, default=3.0, help="solid side frame mm (arc/flat)")
    ap.add_argument("--symbol-frac", type=float, default=0.62)
    ap.add_argument("--repeat", type=int, default=1, help="copies of the symbol around the shade")
    ap.add_argument("--text", help="name / date / message band")
    ap.add_argument("--text-height", type=float, default=10.0)
    ap.add_argument("--text-pos", choices=["bottom", "top"], default="bottom")
    ap.add_argument("--theme-text", help="text parameter for text-driven themes (text, element, allah ...)")
    ap.add_argument("--gamma", type=float, default=1.0)
    ap.add_argument("--blur", type=float, default=0.12, help="photo blur mm")
    ap.add_argument("--invert", action="store_true")
    ap.add_argument("--fit", choices=["cover", "contain", "stretch"], default="cover")
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--soft-edge", type=float, default=0.5, help="glow edge softening mm")
    ap.add_argument("--min-cut", type=float, default=0.8)
    ap.add_argument("--features", action="store_true", help="use only the symbol's holes (face, pips, windows)")
    ap.add_argument("--min-bridge", type=float, default=1.2)
    ap.add_argument("--bridge-w", type=float, default=1.6)
    ap.add_argument("--bg", type=float, default=0.0, help="glow: background light level 0..1 (0.3 = airy, faster)")
    ap.add_argument("--feather", type=float, default=3.0, help="photo edge fade mm")
    ap.add_argument("--relief-in", action="store_true", help="relief on the inside, smooth outside")
    ap.add_argument("--with-cap", action="store_true", help="top ring (cylinder)")
    ap.add_argument("--with-base", action="store_true")
    ap.add_argument("--led", choices=sorted(__import__("shadowlamp.lamp", fromlist=["LED_PRESETS"]).LED_PRESETS), default="tealight")
    ap.add_argument("--led-dia", type=float)
    ap.add_argument("--led-depth", type=float)
    ap.add_argument("--cable", action="store_true", help="cable slot in the base (USB LEDs)")
    ap.add_argument("--category", choices=["personalised", "catalogue", "b2b"], default="personalised")
    ap.add_argument("--extra-cost", type=float, default=2.5, help="packaging + LED tea light etc., EUR")
    ap.add_argument("--job", default=None, help="job / order id for the sheet")
    ap.add_argument("--out", required=True)


def _spec_from(ns) -> LampSpec:
    return LampSpec(job=ns.job or (ns.theme or os.path.basename(ns.image or "lamp")), theme=ns.theme, image=ns.image,
                    mode=ns.mode, shape=ns.shape, diameter=ns.diameter, arc_deg=ns.arc, width=ns.width,
                    height=ns.height, pitch=ns.pitch, min_wall=ns.min_wall, max_wall=ns.max_wall, wall=ns.wall,
                    rim_height=ns.rim, frame=ns.frame, symbol_frac=ns.symbol_frac, repeat=ns.repeat, text=ns.text,
                    text_height=ns.text_height, text_pos=ns.text_pos, theme_text=ns.theme_text, gamma=ns.gamma,
                    blur_mm=ns.blur, invert=ns.invert, fit=ns.fit, seed=ns.seed, soft_edge_mm=ns.soft_edge,
                    min_cut=ns.min_cut, features=ns.features, min_bridge=ns.min_bridge, bridge_w=ns.bridge_w,
                    bg=ns.bg, feather=ns.feather, relief_in=ns.relief_in, with_cap=ns.with_cap, with_base=ns.with_base,
                    led=ns.led, led_dia=ns.led_dia, led_depth=ns.led_depth, cable=ns.cable)


def run(spec: LampSpec, out: str, category: str = "personalised", extra_cost: float = 1.5) -> dict:
    t0 = time.time()
    parts, modes, preview, meta = build(spec)
    sheet = write_job(out, parts, meta, preview, modes, category, extra_cost, meta.get("inlay_band_frac", 0.0))
    p = sheet["pricing"]
    print(f"[{spec.job}] {meta['mode']} {spec.shape} Ø{spec.diameter}x{spec.height}  "
          f"parts={list(parts)}  {p['print_hours']} h  €{p['price_rec_eur']}  "
          f"{p['eur_per_print_hour']} €/h  ({time.time() - t0:.1f}s) -> {out}")
    for w in meta["warnings"]:
        print("   WARNING:", w)
    return sheet


def main(argv=None):
    ap = argparse.ArgumentParser(prog="shadowlamp", description=__doc__)
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("themes", help="list themes")
    mk = sub.add_parser("make", help="build one lamp job")
    _add_lamp_args(mk)
    sm = sub.add_parser("samples", help="build the starter sample set")
    sm.add_argument("--out", required=True)
    sm.add_argument("--image", help="optional photo for a lithophane sample")
    ns = ap.parse_args(argv)

    if ns.cmd == "themes":
        for name, th in sorted(themes.THEMES.items(), key=lambda kv: (kv[1].category, kv[0])):
            print(f"{th.category:10s} {name:16s} {th.kind:5s} default={th.default_mode:7s} {th.note}")
        return 0
    if ns.cmd == "make":
        if not ns.theme and not ns.image:
            ap.error("give --theme or --image")
        run(_spec_from(ns), ns.out, ns.category, ns.extra_cost)
        return 0
    if ns.cmd == "samples":
        base = ns.out
        jobs = [
            LampSpec(job="calibration-strip", theme="calibration", shape="flat", width=80, height=40, pitch=0.25,
                     min_wall=0.6, max_wall=3.0, rim_height=3.0, frame=3.0),
            LampSpec(job="om-diwali", theme="om", mode="glow", text="शुभ दीपावली", with_base=True, with_cap=True),
            LampSpec(job="diya-glow", theme="diya", mode="glow", repeat=3, text="Happy Diwali"),
            LampSpec(job="cross-inlay", theme="cross", mode="inlay", symbol_frac=0.4),
            LampSpec(job="spiderweb-cutout", theme="spiderweb", mode="cutout", repeat=2, height=100),
            LampSpec(job="crescent-cutout", theme="crescent-star", mode="cutout", repeat=2),
            LampSpec(job="pumpkin-cutout", theme="pumpkin", mode="cutout", height=100),
            LampSpec(job="atom-glow", theme="atom", mode="glow", text="Harsh"),
            LampSpec(job="mandelbrot-litho", theme="mandelbrot", mode="litho", pitch=0.3),
            LampSpec(job="name-arc", theme="text", theme_text="Leo|2026", mode="glow", shape="arc", arc_deg=180, height=80),
        ]
        if ns.image:
            jobs.append(LampSpec(job="photo-litho", image=ns.image, mode="litho", text="Luxembourg 2026"))
        for spec in jobs:
            try:
                run(spec, os.path.join(base, spec.job))
            except Exception as e:  # keep going, report at the end
                print(f"[{spec.job}] FAILED: {e}", file=sys.stderr)
        return 0


if __name__ == "__main__":
    sys.exit(main())
