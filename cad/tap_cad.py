#!/usr/bin/env python3
"""
Tap Studio — exact B-rep backend.

Consumes the same preset JSON the browser studio writes and rebuilds every
product in OpenCascade via CadQuery. Because the solids are real B-rep and are
tessellated once at the very end, the exported meshes are watertight by
construction — no welding, no T-junctions, no slicer auto-repair.

Usage
-----
    python tap_cad.py preset.json --out ../out
    python tap_cad.py preset.json --contours logo_contours.json --format step
    python tap_cad.py --product tapbar-4 --out ../out          # defaults only

Install
-------
    pip install cadquery
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
from pathlib import Path

try:
    import cadquery as cq
except ImportError:  # pragma: no cover
    sys.exit("cadquery is required:  pip install cadquery")


# ---------------------------------------------------------------------------
# Defaults mirrored from js/params.js. Anything in the preset overrides these.
# ---------------------------------------------------------------------------
HARDWARE = dict(
    nfcTagDia=18.0, nfcTagThick=0.55, nfcClearance=0.35,
    magnetDia=4.0, magnetThick=1.5, magnetClear=0.15,
    magnetCount=4, magnetRing=12.2,
    screwDia=3.2, screwHeadDia=6.4,
    batteryDia=20.0, batteryThick=3.2,
)

BAR_BASE = dict(
    tileCount=4, tileSize=30, tileThickness=4, tileRadius=6, tileGap=6,
    tileRecess=2.2, tileFit=0.25, sideMargin=11, tileRowOffset=-6,
    height=56, depth=42, faceAngle=17, cornerRadius=3, endRadius=2,
    shellThickness=2.4, hollow=1, footInset=6, footDepth=0.8,
    nfcTagDia=18, magnetDia=4, magnetThick=1.5, magnetCount=4, magnetRing=12.2,
    logoScale=46, logoOffsetX=0, logoOffsetY=17, logoRotate=0,
    logoDepth=0.8, iconDepth=0.7,
)

BOARD_BASE = dict(
    tileCount=3, tileSize=30, tileThickness=4, tileRadius=6, tileGap=6,
    tileRecess=2.2, tileFit=0.25, sideMargin=11, tileRowOffset=-8,
    plateThickness=6, boardHeight=74, cornerRadius=6, edgeChamfer=0.8,
    mountMode=0, keyholeInset=12, adhesiveRecess=0.6,
    nfcTagDia=18, magnetDia=4, magnetThick=1.5, magnetCount=4, magnetRing=12.2,
    logoScale=42, logoOffsetX=0, logoOffsetY=24, logoRotate=0,
    logoDepth=0.8, iconDepth=0.7,
)

TILE_BASE = dict(
    tileSize=30, tileThickness=4, tileRadius=6, faceChamfer=0.5,
    nfcTagDia=18, nfcPocketDepth=1.1, magnetDia=4, magnetThick=1.5,
    magnetCount=4, magnetRing=12.2, lidThickness=1.0,
    iconScale=18, iconDepth=0.7,
    logoScale=14, logoOffsetX=0, logoOffsetY=0, logoRotate=0, logoDepth=0.6,
)

LIGHTBOX_BASE = dict(
    boxWidth=70, boxHeight=70, boxDepth=30, frameWidth=7, shellThickness=2.0,
    cornerRadius=4, lithoThickness=2.6, lithoMinWall=0.6, lithoRes=180,
    lithoInvert=0, batteryBay=1, diffuserGap=6,
    logoScale=22, logoOffsetX=0, logoOffsetY=-30, logoRotate=0, logoDepth=0.6,
)

SNAP_BASE = dict(
    cardWidth=66, cardHeight=66, cardThickness=5, cornerRadius=14,
    edgeChamfer=0.6, magsafeOuter=56.5, magsafeInner=49.5, magsafeDepth=2.4,
    cornerIconDia=18, cornerIconInset=15, iconDepth=0.6,
    logoScale=26, logoOffsetX=0, logoOffsetY=0, logoRotate=0, logoDepth=0.6,
)

PRODUCTS = {
    "tapbar-2":     dict(family="bar",   name="Tap Bar 2",   branded=True,  over=dict(tileCount=2)),
    "tapbar-3":     dict(family="bar",   name="Tap Bar 3",   branded=True,  over=dict(tileCount=3)),
    "tapbar-4":     dict(family="bar",   name="Tap Bar 4",   branded=True,  over=dict(tileCount=4)),
    "tapbar-qr":    dict(family="bar",   name="Tap Bar QR",  branded=True,  over=dict(tileCount=2, tileSize=34, sideMargin=12)),
    "tapbar-max":   dict(family="bar",   name="Tap Bar Max", branded=True,  over=dict(tileCount=4, tileSize=40, tileGap=8, sideMargin=14, height=68, depth=50, logoScale=62, logoOffsetY=21)),
    "tapbase-2":    dict(family="bar",   name="Tap Base 2",  branded=False, over=dict(tileCount=2, height=48, depth=38, faceAngle=15, sideMargin=9, tileRowOffset=0, logoScale=0)),
    "tapbase-3":    dict(family="bar",   name="Tap Base 3",  branded=False, over=dict(tileCount=3, height=48, depth=38, faceAngle=15, sideMargin=9, tileRowOffset=0, logoScale=0)),
    "tapbase-4":    dict(family="bar",   name="Tap Base 4",  branded=False, over=dict(tileCount=4, height=48, depth=38, faceAngle=15, sideMargin=9, tileRowOffset=0, logoScale=0)),
    "tapboard-2":   dict(family="board", name="Tap Board 2", branded=True,  over=dict(tileCount=2)),
    "tapboard-3":   dict(family="board", name="Tap Board 3", branded=True,  over=dict(tileCount=3)),
    "tapboard-4":   dict(family="board", name="Tap Board 4", branded=True,  over=dict(tileCount=4)),
    "taptile":      dict(family="tile",  name="Tap Tile",    branded=True,  over={}),
    "lightbox-mini":dict(family="lightbox", name="Mini 3D Image Lightbox", branded=True, over={}),
    "tapsnap":      dict(family="snap",  name="Tap Snap",    branded=True,  over={}),
}

FAMILY_BASE = dict(bar=BAR_BASE, board=BOARD_BASE, tile=TILE_BASE,
                   lightbox=LIGHTBOX_BASE, snap=SNAP_BASE)


# ---------------------------------------------------------------------------
# Artwork: contours exported by the browser tracer
# ---------------------------------------------------------------------------
def load_contours(path):
    """
    Expected shape (as written by the browser's "Logo contours" export):

        {"units": "mm",
         "shapes": [{"outer": [[x, y], ...], "holes": [[[x, y], ...], ...]}, ...]}

    Coordinates are centred on the origin and already scaled to millimetres.
    """
    if not path:
        return None
    data = json.loads(Path(path).read_text())
    shapes = data.get("shapes") or []
    return shapes or None


def artwork_solid(shapes, target_width, depth, rot_deg=0.0):
    """Extrude traced contours into an exact solid, scaled to `target_width`."""
    if not shapes or target_width <= 0 or depth <= 0:
        return None

    xs = [p[0] for s in shapes for p in s["outer"]]
    ys = [p[1] for s in shapes for p in s["outer"]]
    if not xs:
        return None
    w = max(xs) - min(xs)
    h = max(ys) - min(ys)
    if w <= 0:
        return None
    k = target_width / w
    cx = (max(xs) + min(xs)) / 2
    cy = (max(ys) + min(ys)) / 2

    def xf(pt):
        x = (pt[0] - cx) * k
        y = (pt[1] - cy) * k
        if rot_deg:
            a = math.radians(rot_deg)
            x, y = x * math.cos(a) - y * math.sin(a), x * math.sin(a) + y * math.cos(a)
        return (x, y)

    solid = None
    for s in shapes:
        outer = [xf(p) for p in s["outer"]]
        if len(outer) < 3:
            continue
        try:
            piece = cq.Workplane("XY").polyline(outer).close().extrude(depth)
        except Exception:
            continue
        for hole in s.get("holes", []):
            hp = [xf(p) for p in hole]
            if len(hp) < 3:
                continue
            try:
                cutter = cq.Workplane("XY").polyline(hp).close().extrude(depth)
                piece = piece.cut(cutter)
            except Exception:
                pass
        solid = piece if solid is None else solid.union(piece)
    return solid


def place_on_face(solid, angle_deg, centre, u, v, h):
    """
    Move a solid built in the XY plane onto a face tilted back by `angle_deg`.

    Matches js/shapes.js faceFrame(): +u runs across the face, +v up it, and
    +h out along the surface normal.
    """
    if solid is None:
        return None
    a = math.radians(angle_deg)
    # Local axes in world space.
    ux, uy, uz = 1.0, 0.0, 0.0
    vx, vy, vz = 0.0, math.cos(a), -math.sin(a)
    nx, ny, nz = 0.0, math.sin(a), math.cos(a)
    px = centre[0] + ux * u + vx * v + nx * h
    py = centre[1] + uy * u + vy * v + ny * h
    pz = centre[2] + uz * u + vz * v + nz * h
    return solid.rotate((0, 0, 0), (1, 0, 0), -angle_deg).translate((px, py, pz))


def apply_logo(body, shapes, p, mode, angle_deg, centre, branded=True):
    """Returns (body, inlay_solid_or_None)."""
    if not branded or not shapes or p.get("logoScale", 0) <= 0:
        return body, None
    d = max(0.05, p.get("logoDepth", 0.6))
    sc = p["logoScale"]
    ox, oy, rot = p.get("logoOffsetX", 0), p.get("logoOffsetY", 0), p.get("logoRotate", 0)

    if mode == "emboss":
        art = artwork_solid(shapes, sc, d + 0.2, rot)
        art = place_on_face(art, angle_deg, centre, ox, oy, -0.2)
        return (body.union(art) if art is not None else body), None

    if mode == "deboss":
        art = artwork_solid(shapes, sc, d + 1.0, rot)
        art = place_on_face(art, angle_deg, centre, ox, oy, -d)
        return (body.cut(art) if art is not None else body), None

    if mode == "inlay":
        cav = artwork_solid(shapes, sc, d + 0.12, rot)
        cav = place_on_face(cav, angle_deg, centre, ox, oy, -(d + 0.12))
        ins = artwork_solid(shapes, sc, d, rot)
        ins = place_on_face(ins, angle_deg, centre, ox, oy, -d)
        return (body.cut(cav) if cav is not None else body), ins

    return body, None       # texture mode changes no geometry


def magnet_positions(ring, count):
    n = max(0, int(round(count)))
    return [(math.cos(i / n * 2 * math.pi + math.pi / 4) * ring,
             math.sin(i / n * 2 * math.pi + math.pi / 4) * ring) for i in range(n)]


def rounded_rect(w, h, r):
    wp = cq.Workplane("XY").rect(w, h)
    if r > 0.01:
        return cq.Workplane("XY").rect(w, h).extrude(1).edges("|Z").fillet(min(r, min(w, h) / 2 - 0.01))
    return wp.extrude(1)


def rounded_plate(w, h, t, r):
    s = cq.Workplane("XY").rect(w, h).extrude(t)
    if r > 0.01:
        s = s.edges("|Z").fillet(min(r, min(w, h) / 2 - 0.01))
    return s


# ---------------------------------------------------------------------------
# Builders
# ---------------------------------------------------------------------------
def build_bar(p, art, branded):
    n = max(1, int(round(p["tileCount"])))
    T, gap = p["tileSize"], p["tileGap"]
    width = n * T + (n - 1) * gap + 2 * p["sideMargin"]
    ang = p["faceAngle"]
    lean = p["height"] * math.tan(math.radians(ang))

    prof = [(0, 0), (p["depth"], 0), (p["depth"] - lean, p["height"]), (0, p["height"])]
    # Sketch the side profile in ZY and extrude across the width, centred on X.
    body = (cq.Workplane("YZ").polyline([(z, y) for z, y in prof]).close()
            .extrude(width).translate((width / 2, 0, 0)))

    if p["cornerRadius"] > 0.01:
        try:
            body = body.edges("|X").fillet(p["cornerRadius"])
        except Exception:
            pass
    if p["endRadius"] > 0.01:
        try:
            body = body.edges("|Y or |Z").fillet(p["endRadius"])
        except Exception:
            pass

    centre = (0.0, p["height"] / 2, p["depth"] - lean / 2)

    # Hollow shell — inset the profile, open at the bottom.
    if p["hollow"] >= 0.5:
        face_wall = max(p["shellThickness"], p["tileRecess"] + p["magnetThick"] + 0.8)
        inner = inset_convex(prof, [p["shellThickness"], face_wall,
                                    p["shellThickness"], p["shellThickness"]])
        inner[0] = (inner[0][0], -1.0)
        inner[1] = (inner[1][0], -1.0)
        cav_w = max(0.5, width - 2 * p["shellThickness"])
        cav = (cq.Workplane("YZ").polyline([(z, y) for z, y in inner]).close()
               .extrude(cav_w).translate((cav_w / 2, 0, 0)))
        body = body.cut(cav)

    # Tile pockets + magnet seats
    fit, rowv = p["tileFit"], p["tileRowOffset"]
    for i in range(n):
        u = (i - (n - 1) / 2) * (T + gap)
        pocket = rounded_plate(T + 2 * fit, T + 2 * fit, p["tileRecess"] + 8,
                               p["tileRadius"] + fit)
        body = body.cut(place_on_face(pocket, ang, centre, u, rowv, -p["tileRecess"]))
        md = p["magnetThick"] + 0.25
        mr = p["magnetDia"] / 2 + HARDWARE["magnetClear"]
        for mx, my in magnet_positions(p["magnetRing"], p["magnetCount"]):
            seat = cq.Workplane("XY").circle(mr).extrude(md)
            body = body.cut(place_on_face(seat, ang, centre, u + mx, rowv + my,
                                          -(p["tileRecess"] + md)))

    # Anti-slip pad recesses, cut upward from the underside.
    if p["footDepth"] > 0.01:
        fr = min(5.0, p["footInset"] * 0.6)
        for sx in (-(width / 2 - p["footInset"]), width / 2 - p["footInset"]):
            for z in (p["footInset"], p["depth"] - p["footInset"]):
                pad = (cq.Workplane("XZ").circle(fr).extrude(p["footDepth"] + 0.2)
                       .translate((sx, -0.2, z)))
                body = body.cut(pad)

    body, inlay = apply_logo(body, art, p, p.get("_mode", "emboss"), ang, centre, branded)

    parts = {"body": body}
    if inlay is not None:
        parts["logo-inlay"] = inlay
    parts["tile"] = build_tile_solid(dict(p, tileThickness=p["tileThickness"]), art, standalone=False)
    return parts, dict(width=width, height=p["height"], depth=p["depth"])


def inset_convex(pts, offsets):
    """Exact inward offset of a convex polygon, per edge."""
    n = len(pts)
    lines = []
    for i in range(n):
        ax, ay = pts[i]
        bx, by = pts[(i + 1) % n]
        dx, dy = bx - ax, by - ay
        ln = math.hypot(dx, dy) or 1.0
        nx, ny = -dy / ln, dx / ln
        k = offsets[i] if isinstance(offsets, (list, tuple)) else offsets
        lines.append((ax + nx * k, ay + ny * k, dx / ln, dy / ln))
    out = []
    for i in range(n):
        px1, py1, dx1, dy1 = lines[(i - 1) % n]
        px2, py2, dx2, dy2 = lines[i]
        det = dx1 * (-dy2) - dy1 * (-dx2)
        if abs(det) < 1e-9:
            out.append((px2, py2))
            continue
        rx, ry = px2 - px1, py2 - py1
        s = (rx * (-dy2) - ry * (-dx2)) / det
        out.append((px1 + dx1 * s, py1 + dy1 * s))
    return out


def build_tile_solid(p, art, standalone=True):
    T, th, ch = p["tileSize"], p["tileThickness"], p.get("faceChamfer", 0.5)
    body = rounded_plate(T, T, th, p["tileRadius"])
    if ch > 0.01:
        try:
            body = body.edges(">Z or <Z").chamfer(ch)
        except Exception:
            pass

    nfc_r = p["nfcTagDia"] / 2 + HARDWARE["nfcClearance"]
    depth = p.get("nfcPocketDepth", 1.1)
    body = body.cut(cq.Workplane("XY").circle(nfc_r).extrude(depth))

    mr = p["magnetDia"] / 2 + HARDWARE["magnetClear"]
    mt = p["magnetThick"] + 0.3
    for mx, my in magnet_positions(p["magnetRing"], p["magnetCount"]):
        body = body.cut(cq.Workplane("XY").circle(mr).extrude(mt).translate((mx, my, 0)))
    return body


def build_board(p, art, branded):
    n = max(1, int(round(p["tileCount"])))
    T, gap = p["tileSize"], p["tileGap"]
    width = n * T + (n - 1) * gap + 2 * p["sideMargin"]
    H, th = p["boardHeight"], p["plateThickness"]

    body = rounded_plate(width, H, th, p["cornerRadius"]).translate((0, 0, -th / 2))
    if p["edgeChamfer"] > 0.01:
        try:
            body = body.edges(">Z or <Z").chamfer(p["edgeChamfer"])
        except Exception:
            pass

    centre = (0.0, 0.0, th / 2)
    fit, rowv = p["tileFit"], p["tileRowOffset"]
    for i in range(n):
        u = (i - (n - 1) / 2) * (T + gap)
        pocket = rounded_plate(T + 2 * fit, T + 2 * fit, p["tileRecess"] + 8, p["tileRadius"] + fit)
        body = body.cut(place_on_face(pocket, 0, centre, u, rowv, -p["tileRecess"]))
        md = p["magnetThick"] + 0.25
        mr = p["magnetDia"] / 2 + HARDWARE["magnetClear"]
        for mx, my in magnet_positions(p["magnetRing"], p["magnetCount"]):
            seat = cq.Workplane("XY").circle(mr).extrude(md)
            body = body.cut(place_on_face(seat, 0, centre, u + mx, rowv + my,
                                          -(p["tileRecess"] + md)))

    if p["mountMode"] >= 0.5:
        ytop = H / 2 - p["keyholeInset"]
        xs = [-(width / 2 - p["keyholeInset"]), width / 2 - p["keyholeInset"]] if n > 1 else [0.0]
        for x in xs:
            head = cq.Workplane("XY").circle(HARDWARE["screwHeadDia"] / 2).extrude(th)
            body = body.cut(head.translate((x, ytop, -th / 2 - 0.5)))
            slot = rounded_plate(HARDWARE["screwDia"], 7, th + 2, HARDWARE["screwDia"] / 2)
            body = body.cut(slot.translate((x, ytop - 3.5, -th / 2 - 1)))
    elif p["adhesiveRecess"] > 0.01:
        pad = rounded_plate(width - 8, H - 8, p["adhesiveRecess"] + 1,
                            max(0.1, p["cornerRadius"] - 4))
        body = body.cut(pad.translate((0, 0, -th / 2 - 1)))

    body, inlay = apply_logo(body, art, p, p.get("_mode", "emboss"), 0, centre, branded)
    parts = {"body": body}
    if inlay is not None:
        parts["logo-inlay"] = inlay
    parts["tile"] = build_tile_solid(p, art, standalone=False)
    return parts, dict(width=width, height=H, depth=th)


def build_tile(p, art, branded):
    body = build_tile_solid(p, art)
    centre = (0.0, 0.0, p["tileThickness"])
    body, inlay = apply_logo(body, art, p, p.get("_mode", "emboss"), 0, centre, branded)
    lid_r = p["nfcTagDia"] / 2 + HARDWARE["nfcClearance"] - 0.15
    lid = cq.Workplane("XY").circle(lid_r).extrude(p["lidThickness"]).translate((0, 0, -p["lidThickness"] - 0.05))
    parts = {"body": body, "lid": lid}
    if inlay is not None:
        parts["logo-inlay"] = inlay
    return parts, dict(width=p["tileSize"], height=p["tileSize"], depth=p["tileThickness"])


def build_lightbox(p, art, branded):
    W, H, D = p["boxWidth"], p["boxHeight"], p["boxDepth"]
    wall, fw = p["shellThickness"], p["frameWidth"]
    shell = rounded_plate(W, H, D, p["cornerRadius"])
    cav = rounded_plate(W - 2 * wall, H - 2 * wall, D - wall + 2,
                        max(0.1, p["cornerRadius"] - wall)).translate((0, 0, wall))
    shell = shell.cut(cav)
    ap = rounded_plate(W - 2 * fw, H - 2 * fw, wall + 2,
                       max(0.1, p["cornerRadius"] - fw)).translate((0, 0, -1))
    shell = shell.cut(ap)

    shell, inlay = apply_logo(shell, art, p, p.get("_mode", "emboss"), 180, (0, 0, 0), branded)

    cover = rounded_plate(W - 2 * wall - 0.4, H - 2 * wall - 0.4, wall,
                          max(0.1, p["cornerRadius"] - wall))
    if p["batteryBay"] >= 0.5:
        bay = cq.Workplane("XY").circle(HARDWARE["batteryDia"] / 2 + 0.3) \
            .extrude(HARDWARE["batteryThick"] + 0.4).translate((0, -H * 0.18, -0.2))
        cover = cover.cut(bay)
    cover = cover.translate((0, 0, D - wall))

    parts = {"body": shell, "cover": cover}
    if inlay is not None:
        parts["logo-inlay"] = inlay
    # The lithophane relief is a heightmap, not a B-rep feature — generate it
    # in the browser or with blender/tap_blender.py.
    return parts, dict(width=W, height=H, depth=D)


def build_snap(p, art, branded):
    W, H, T = p["cardWidth"], p["cardHeight"], p["cardThickness"]
    body = rounded_plate(W, H, T, p["cornerRadius"])
    if p["edgeChamfer"] > 0.01:
        try:
            body = body.edges(">Z or <Z").chamfer(p["edgeChamfer"])
        except Exception:
            pass

    ring = (cq.Workplane("XY").circle(p["magsafeOuter"] / 2).circle(p["magsafeInner"] / 2)
            .extrude(p["magsafeDepth"] + 0.5).translate((0, 0, -0.5)))
    body = body.cut(ring)
    nfc = cq.Workplane("XY").circle(HARDWARE["nfcTagDia"] / 2 + HARDWARE["nfcClearance"]) \
        .extrude(1.2).translate((0, 0, -0.1))
    body = body.cut(nfc)

    inset = p["cornerIconInset"]
    for sx, sy in ((-1, 1), (1, 1), (-1, -1), (1, -1)):
        u, v = sx * (W / 2 - inset), sy * (H / 2 - inset)
        dish = cq.Workplane("XY").circle(p["cornerIconDia"] / 2).extrude(0.9) \
            .translate((u, v, T - 0.6))
        body = body.cut(dish)

    body, inlay = apply_logo(body, art, p, p.get("_mode", "emboss"), 0, (0, 0, T), branded)
    parts = {"body": body}
    if inlay is not None:
        parts["logo-inlay"] = inlay
    return parts, dict(width=W, height=H, depth=T)


BUILDERS = dict(bar=build_bar, board=build_board, tile=build_tile,
                lightbox=build_lightbox, snap=build_snap)


# ---------------------------------------------------------------------------
# Driver
# ---------------------------------------------------------------------------
def resolve_params(product_id, preset):
    spec = PRODUCTS[product_id]
    p = dict(FAMILY_BASE[spec["family"]])
    p.update(spec["over"])
    p.update((preset or {}).get("params", {}))
    p["_mode"] = (preset or {}).get("logoMode", "emboss")
    return spec, p


def main():
    ap = argparse.ArgumentParser(description="Tap Studio exact-CAD backend")
    ap.add_argument("preset", nargs="?", help="preset .json from the browser studio")
    ap.add_argument("--product", help="product id (when no preset is given)")
    ap.add_argument("--contours", help="traced logo contours .json")
    ap.add_argument("--out", default="out", help="output directory")
    ap.add_argument("--format", default="stl", choices=["stl", "step", "3mf", "all"])
    ap.add_argument("--tolerance", type=float, default=0.01,
                    help="tessellation deviation in mm (default 0.01)")
    args = ap.parse_args()

    preset = json.loads(Path(args.preset).read_text()) if args.preset else {}
    product_id = args.product or preset.get("productId")
    if product_id not in PRODUCTS:
        sys.exit(f"unknown product: {product_id!r}\nknown: {', '.join(PRODUCTS)}")

    spec, p = resolve_params(product_id, preset)
    art = load_contours(args.contours)
    if art is None and p.get("logoScale", 0) > 0 and spec["branded"]:
        print("note: no --contours supplied, building without a logo", file=sys.stderr)

    print(f"building {spec['name']} ({product_id}) — {spec['family']} family")
    parts, bbox = BUILDERS[spec["family"]](p, art, spec["branded"])

    outdir = Path(args.out)
    outdir.mkdir(parents=True, exist_ok=True)
    fmts = ["stl", "step", "3mf"] if args.format == "all" else [args.format]

    for name, solid in parts.items():
        if solid is None:
            continue
        for fmt in fmts:
            path = outdir / f"{product_id}_{name}.{fmt}"
            try:
                if fmt == "stl":
                    cq.exporters.export(solid, str(path),
                                        tolerance=args.tolerance,
                                        angularTolerance=0.1)
                else:
                    cq.exporters.export(solid, str(path))
                print(f"  wrote {path}")
            except Exception as e:
                print(f"  !! {path}: {e}", file=sys.stderr)

    meta = dict(product=product_id, name=spec["name"], bbox=bbox,
                params=p, logoMode=p["_mode"],
                parts=sorted(parts.keys()))
    (outdir / f"{product_id}_meta.json").write_text(json.dumps(meta, indent=2))
    print(f"  wrote {outdir / (product_id + '_meta.json')}")
    print(f"\noverall {bbox['width']:.1f} × {bbox['height']:.1f} × {bbox['depth']:.1f} mm")
    print("Solids are exact B-rep; the STL is tessellated once at "
          f"{args.tolerance} mm deviation and is watertight by construction.")


if __name__ == "__main__":
    main()
