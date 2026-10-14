#!/usr/bin/env python3
"""
Tap Studio — print-readiness check.

Runs over every STL in a folder and reports, per part:
  · watertight / manifold / winding consistency
  · volume, surface area, estimated filament use
  · bounding box vs. common bed sizes
  · thin walls below the extrusion width
  · overhangs steeper than the support threshold
  · whether the NFC pocket and magnet seats are the size you specified

    pip install trimesh numpy
    python check_mesh.py ../out --meta ../out/tapbar-4_meta.json
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

try:
    import numpy as np
    import trimesh
except ImportError:  # pragma: no cover
    sys.exit("needs trimesh:  pip install trimesh numpy")


FILAMENT_DENSITY = {"PLA": 1.24, "PETG": 1.27, "ABS": 1.04, "ASA": 1.07}
BEDS = {"Bambu P1S / P1P / X1": (256, 256, 256), "Bambu A1 mini": (180, 180, 180),
        "Prusa MK4": (250, 210, 220), "Ender 3": (220, 220, 250)}


def fmt(x, n=2):
    return f"{x:,.{n}f}"


def check(path: Path, opts) -> dict:
    m = trimesh.load_mesh(path, process=False)
    if isinstance(m, trimesh.Scene):
        m = trimesh.util.concatenate([g for g in m.geometry.values()])
    # STL stores every triangle with its own three vertices, so without a
    # merge pass every edge looks open and every file reports "not closed".
    # Merging exact duplicates restores the shared topology without moving
    # a single vertex; real gaps survive the merge and are still reported.
    m.merge_vertices()

    res = {"file": path.name}
    res["triangles"] = int(len(m.faces))
    res["watertight"] = bool(m.is_watertight)
    res["winding_ok"] = bool(m.is_winding_consistent)

    # Boundary edges — how far from watertight, not just yes/no.
    edges = m.edges_sorted.reshape((-1, 2))
    uniq, counts = np.unique(edges, axis=0, return_counts=True)
    res["open_edges"] = int((counts == 1).sum())
    res["nonmanifold_edges"] = int((counts > 2).sum())

    ext = m.bounding_box.extents
    res["size_mm"] = [round(float(v), 2) for v in ext]
    res["volume_cm3"] = round(float(abs(m.volume)) / 1000.0, 3) if m.is_volume else None

    if res["volume_cm3"] is not None:
        infill = opts.infill / 100.0
        shell_frac = 0.35            # perimeters + top/bottom, empirical
        solid = res["volume_cm3"] * (shell_frac + (1 - shell_frac) * infill)
        res["grams"] = round(solid * FILAMENT_DENSITY.get(opts.material, 1.24), 1)

    # Fits on which beds
    d = sorted(ext, reverse=True)
    res["fits"] = [name for name, bed in BEDS.items()
                   if all(a <= b for a, b in zip(d, sorted(bed, reverse=True)))]

    # Overhangs: face normals pointing downward past the support angle.
    if len(m.faces):
        nz = m.face_normals[:, 2]
        area = m.area_faces
        steep = nz < -math.cos(math.radians(opts.overhang))
        # A face that is exactly flat-down (nz == -1) is a bridge/first layer,
        # not an overhang that needs support.
        steep &= nz > -0.999
        res["overhang_area_mm2"] = round(float(area[steep].sum()), 1)
        res["overhang_pct"] = round(float(area[steep].sum() / max(area.sum(), 1e-9)) * 100, 1)

    # Thin features: sample the surface and measure the distance to the
    # opposite wall along the inward normal.
    if m.is_watertight and opts.thin:
        n = min(opts.samples, 4000)
        pts, fidx = trimesh.sample.sample_surface(m, n)
        normals = m.face_normals[fidx]
        origins = pts - normals * 1e-3
        hits = m.ray.intersects_location(origins, -normals, multiple_hits=False)
        if len(hits[0]):
            dist = np.linalg.norm(hits[0] - origins[hits[1]], axis=1)
            thin = dist[dist < opts.min_wall]
            res["min_wall_found_mm"] = round(float(dist.min()), 3)
            res["thin_sample_pct"] = round(float(len(thin)) / max(len(dist), 1) * 100, 1)

    return res


def main():
    ap = argparse.ArgumentParser(description="Tap Studio print-readiness check")
    ap.add_argument("path", help="STL file or folder of STLs")
    ap.add_argument("--meta", help="*_meta.json to cross-check hardware fit")
    ap.add_argument("--material", default="PLA", choices=list(FILAMENT_DENSITY))
    ap.add_argument("--infill", type=float, default=20.0)
    ap.add_argument("--min-wall", type=float, default=1.2,
                    help="flag walls below this, in mm (default 3 perimeters at 0.4)")
    ap.add_argument("--nozzle", type=float, default=0.4,
                    help="nozzle diameter; the feature floor is twice this")
    ap.add_argument("--overhang", type=float, default=45.0,
                    help="support threshold in degrees from vertical")
    ap.add_argument("--samples", type=int, default=3000)
    ap.add_argument("--thin", action="store_true", default=True)
    ap.add_argument("--no-thin", dest="thin", action="store_false")
    ap.add_argument("--json", help="write the full report here")
    args = ap.parse_args()

    root = Path(args.path)
    files = sorted(root.glob("*.stl")) if root.is_dir() else [root]
    if not files:
        sys.exit(f"no STL files under {root}")

    reports, problems = [], 0
    print(f"{'part':<34}{'tris':>8}{'closed':>8}{'open':>7}{'vol cm³':>10}{'grams':>8}{'ovhg%':>8}")
    print("-" * 83)
    for f in files:
        try:
            r = check(f, args)
        except Exception as e:
            print(f"{f.name:<34}  !! {e}")
            problems += 1
            continue
        reports.append(r)
        ok = r["watertight"] and r["nonmanifold_edges"] == 0
        if not ok:
            problems += 1
        print(f"{r['file']:<34}{r['triangles']:>8,}{('yes' if ok else 'NO'):>8}"
              f"{r['open_edges']:>7}"
              f"{(fmt(r['volume_cm3']) if r['volume_cm3'] is not None else '-'):>10}"
              f"{(fmt(r.get('grams', 0), 1) if r.get('grams') else '-'):>8}"
              f"{fmt(r.get('overhang_pct', 0), 1):>8}")

    print()
    for r in reports:
        notes = []
        if not r["watertight"]:
            notes.append(f"{r['open_edges']} open edges — slicers will auto-repair, "
                         f"but rebuild via cad/tap_cad.py for a clean file")
        if r["nonmanifold_edges"]:
            notes.append(f"{r['nonmanifold_edges']} non-manifold edges")
        if not r["winding_ok"]:
            notes.append("inconsistent face winding")
        if r.get("thin_sample_pct", 0) > 2:
            notes.append(f"{r['thin_sample_pct']}% of the surface is thinner than "
                         f"{args.min_wall} mm (min found {r.get('min_wall_found_mm')} mm)")
        if r.get("overhang_pct", 0) > 8:
            notes.append(f"{r['overhang_pct']}% steep overhang — reorient or add supports")
        if not r["fits"]:
            notes.append("does not fit any known bed")
        if notes:
            print(f"{r['file']}:")
            for nline in notes:
                print(f"   · {nline}")

    if args.meta:
        meta = json.load(open(args.meta))
        p = meta.get("params", {})
        print("\nhardware fit")
        nfc = p.get("nfcTagDia")
        if nfc and p.get("magnetCount", 0):
            nfc_r = nfc / 2 + 0.35
            mag_r = p["magnetDia"] / 2 + 0.15
            gap = p["magnetRing"] - mag_r - nfc_r
            edge = (p.get("tileSize", 30) / 2) - (p["magnetRing"] + mag_r)
            print(f"   NFC pocket ø{nfc} mm, magnets ø{p['magnetDia']}×{p['magnetThick']} mm "
                  f"on a {p['magnetRing']} mm ring")
            print(f"   clearance to antenna pocket : {gap:+.2f} mm "
                  f"{'OK' if gap > 0.3 else 'TOO TIGHT'}")
            print(f"   wall to tile edge           : {edge:+.2f} mm "
                  f"{'OK' if edge > 0.6 else 'TOO THIN'}")

    if args.json:
        Path(args.json).write_text(json.dumps(reports, indent=2))
        print(f"\nwrote {args.json}")

    print(f"\n{len(reports) - problems}/{len(reports)} parts clean")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
