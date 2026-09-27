#!/usr/bin/env python3
"""
Tap Studio — Blender pipeline.

Two jobs:
  1. Studio renders of a built product (for the customer proof / mockup).
  2. Heavy mesh work the browser cannot do well — lithophane relief from a
     photo, and a remesh/repair pass for anything that comes out of float CSG.

Run headless:

    blender --background --python tap_blender.py -- \
        --meta ../out/tapbar-4_meta.json \
        --stl-dir ../out \
        --render ../out/renders \
        --preset ../out/acme_tapbar-4.json

    blender --background --python tap_blender.py -- \
        --lithophane photo.jpg --out ../out/litho.stl \
        --width 58 --height 58 --min-wall 0.6 --max-wall 2.6

Everything after `--` is parsed by this script; Blender ignores it.
"""

import argparse
import json
import math
import os
import sys

try:
    import bpy
    import bmesh
    from mathutils import Vector
except ImportError:  # pragma: no cover
    sys.exit("run this inside Blender:  blender --background --python tap_blender.py -- ...")


# ---------------------------------------------------------------------------
def argv_after_dashes():
    return sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.images):
        for item in list(block):
            if item.users == 0:
                block.remove(item)


def hex_to_rgb(h):
    h = (h or "#cccccc").lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    r, g, b = (int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
    # sRGB -> linear
    f = lambda c: c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return (f(r), f(g), f(b), 1.0)


def make_material(name, hex_colour, rough=0.45, transmission=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = hex_to_rgb(hex_colour)
    bsdf.inputs["Roughness"].default_value = rough
    for key, val in (("Metallic", 0.0), ("Coat Weight", 0.25),
                     ("Transmission Weight", transmission), ("IOR", 1.5)):
        if key in bsdf.inputs:
            bsdf.inputs[key].default_value = val
    return mat


# ---------------------------------------------------------------------------
# Lithophane
# ---------------------------------------------------------------------------
def build_lithophane(image_path, width_mm, height_mm, min_wall, max_wall,
                     resolution=220, invert=False):
    """
    A lithophane is a heightmap: dark pixels become thick walls that block
    light, bright pixels become thin walls that glow. Built here as a grid so
    the result is a single closed shell with no boolean anywhere near it.
    """
    img = bpy.data.images.load(os.path.abspath(image_path))
    iw, ih = img.size
    px = list(img.pixels)          # flat RGBA, bottom-up

    nx = max(16, int(resolution))
    ny = max(16, int(resolution * (height_mm / width_mm)))

    def lum(u, v):
        sx = min(iw - 1, max(0, int(u * (iw - 1))))
        sy = min(ih - 1, max(0, int((1.0 - v) * (ih - 1))))
        i = ((ih - 1 - sy) * iw + sx) * 4
        r, g, b, a = px[i], px[i + 1], px[i + 2], px[i + 3]
        l = 0.2126 * r + 0.7152 * g + 0.0722 * b
        l = l * a + (1.0 - a)                    # composite over white
        return 1.0 - l if invert else l

    mesh = bpy.data.meshes.new("Lithophane")
    obj = bpy.data.objects.new("Lithophane", mesh)
    bpy.context.collection.objects.link(obj)

    verts, faces = [], []
    # index 0..n-1 front (flat, z=0), n..2n-1 back (relief)
    for iy in range(ny):
        for ix in range(nx):
            u, v = ix / (nx - 1), iy / (ny - 1)
            x = (u - 0.5) * width_mm
            y = (v - 0.5) * height_mm
            verts.append((x, y, 0.0))
    for iy in range(ny):
        for ix in range(nx):
            u, v = ix / (nx - 1), iy / (ny - 1)
            x = (u - 0.5) * width_mm
            y = (v - 0.5) * height_mm
            t = min_wall + (1.0 - lum(u, v)) * (max_wall - min_wall)
            verts.append((x, y, t))

    n = nx * ny
    idx = lambda ix, iy: iy * nx + ix
    for iy in range(ny - 1):
        for ix in range(nx - 1):
            a, b = idx(ix, iy), idx(ix + 1, iy)
            c, d = idx(ix + 1, iy + 1), idx(ix, iy + 1)
            faces.append((a, d, c, b))                       # front, outward -Z
            faces.append((n + a, n + b, n + c, n + d))       # relief back
    # Side walls
    for ix in range(nx - 1):
        a, b = idx(ix, 0), idx(ix + 1, 0)
        faces.append((a, b, n + b, n + a))
        a, b = idx(ix, ny - 1), idx(ix + 1, ny - 1)
        faces.append((b, a, n + a, n + b))
    for iy in range(ny - 1):
        a, b = idx(0, iy), idx(0, iy + 1)
        faces.append((b, a, n + a, n + b))
        a, b = idx(nx - 1, iy), idx(nx - 1, iy + 1)
        faces.append((a, b, n + b, n + a))

    mesh.from_pydata(verts, [], faces)
    mesh.validate()
    mesh.update()

    # Weld and confirm it is closed.
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    open_edges = sum(1 for e in bm.edges if len(e.link_faces) != 2)
    bm.to_mesh(mesh)
    bm.free()
    print(f"lithophane: {nx}×{ny} samples, {len(mesh.polygons)} faces, "
          f"{open_edges} open edges")
    return obj


# ---------------------------------------------------------------------------
# Repair
# ---------------------------------------------------------------------------
def repair_object(obj, merge_dist=1e-4):
    """Weld, fix normals, close remaining boundary loops. Reports before/after."""
    me = obj.data
    bm = bmesh.new()
    bm.from_mesh(me)
    before = sum(1 for e in bm.edges if len(e.link_faces) != 2)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=merge_dist)
    bmesh.ops.dissolve_degenerate(bm, dist=merge_dist, edges=bm.edges)
    holes = [e for e in bm.edges if len(e.link_faces) == 1]
    if holes:
        bmesh.ops.holes_fill(bm, edges=holes, sides=0)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    after = sum(1 for e in bm.edges if len(e.link_faces) != 2)
    bm.to_mesh(me)
    bm.free()
    me.update()
    print(f"  repair {obj.name}: {before} -> {after} non-manifold edges")
    return after


# ---------------------------------------------------------------------------
# Render
# ---------------------------------------------------------------------------
def setup_studio(target, size=(1600, 1200), samples=128):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = samples
    scene.render.resolution_x, scene.render.resolution_y = size
    scene.render.film_transparent = True
    scene.view_settings.view_transform = "Filmic" \
        if "Filmic" in [v.name for v in scene.view_settings.bl_rna
                        .properties["view_transform"].enum_items] else "Standard"

    bbox = Vector((0, 0, 0))
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for o in target:
        for corner in o.bound_box:
            w = o.matrix_world @ Vector(corner)
            lo = Vector((min(lo[i], w[i]) for i in range(3)))
            hi = Vector((max(hi[i], w[i]) for i in range(3)))
    centre = (lo + hi) / 2
    extent = max((hi - lo)[i] for i in range(3)) or 50

    # Sweep floor
    bpy.ops.mesh.primitive_plane_add(size=extent * 40, location=(centre.x, centre.y, lo.z))
    floor = bpy.context.object
    floor.data.materials.append(make_material("Floor", "#F5F2EC", rough=0.75))

    # Three-point lighting
    for name, loc, energy, sz in (
        ("Key",  (extent * 1.6, -extent * 1.9, extent * 2.2), extent ** 2 * 9, extent * 1.4),
        ("Fill", (-extent * 2.1, -extent * 1.2, extent * 1.1), extent ** 2 * 3, extent * 2.0),
        ("Rim",  (0, extent * 2.4, extent * 1.6), extent ** 2 * 4, extent * 1.2),
    ):
        bpy.ops.object.light_add(type="AREA", location=(centre.x + loc[0],
                                                        centre.y + loc[1],
                                                        centre.z + loc[2]))
        lamp = bpy.context.object
        lamp.name = name
        lamp.data.energy = energy
        lamp.data.size = sz
        d = centre - lamp.location
        lamp.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()

    bpy.ops.object.camera_add(location=(centre.x + extent * 2.0,
                                        centre.y - extent * 2.6,
                                        centre.z + extent * 1.7))
    cam = bpy.context.object
    cam.data.lens = 85
    d = centre - cam.location
    cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam
    return cam, centre, extent


def render_turntable(outdir, cam, centre, extent, frames=1):
    os.makedirs(outdir, exist_ok=True)
    scene = bpy.context.scene
    base = Vector(cam.location) - centre
    for i in range(frames):
        a = (i / max(1, frames)) * math.tau
        rot = Vector((base.x * math.cos(a) - base.y * math.sin(a),
                      base.x * math.sin(a) + base.y * math.cos(a),
                      base.z))
        cam.location = centre + rot
        d = centre - cam.location
        cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = os.path.join(outdir, f"view_{i:02d}.png")
        bpy.ops.render.render(write_still=True)
        print(f"  rendered {scene.render.filepath}")


# ---------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--meta", help="*_meta.json written by tap_cad.py")
    ap.add_argument("--preset", help="preset .json from the browser (for colours)")
    ap.add_argument("--stl-dir", default=".", help="folder holding the part STLs")
    ap.add_argument("--render", help="render output folder")
    ap.add_argument("--frames", type=int, default=1, help="turntable frames")
    ap.add_argument("--samples", type=int, default=128)
    ap.add_argument("--repair", action="store_true", help="run the repair pass on every part")
    ap.add_argument("--save", help="save the .blend here")
    ap.add_argument("--lithophane", help="image to convert into a lithophane")
    ap.add_argument("--out", help="STL path for the lithophane")
    ap.add_argument("--width", type=float, default=58.0)
    ap.add_argument("--height", type=float, default=58.0)
    ap.add_argument("--min-wall", type=float, default=0.6)
    ap.add_argument("--max-wall", type=float, default=2.6)
    ap.add_argument("--resolution", type=int, default=220)
    ap.add_argument("--invert", action="store_true")
    args = ap.parse_args(argv_after_dashes())

    clear_scene()

    # ---- lithophane mode -------------------------------------------------
    if args.lithophane:
        obj = build_lithophane(args.lithophane, args.width, args.height,
                               args.min_wall, args.max_wall,
                               args.resolution, args.invert)
        if args.out:
            bpy.ops.object.select_all(action="DESELECT")
            obj.select_set(True)
            bpy.context.view_layer.objects.active = obj
            try:
                bpy.ops.wm.stl_export(filepath=os.path.abspath(args.out),
                                      export_selected_objects=True)
            except AttributeError:
                bpy.ops.export_mesh.stl(filepath=os.path.abspath(args.out),
                                        use_selection=True)
            print(f"wrote {args.out}")
        if args.save:
            bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(args.save))
        return

    if not args.meta:
        sys.exit("nothing to do — pass --meta or --lithophane")

    meta = json.load(open(args.meta))
    preset = json.load(open(args.preset)) if args.preset else {}
    colours = preset.get("colors", {}) or {}

    colour_for = {
        "body": colours.get("body", "#F8F6F1"),
        "tile": colours.get("tile", "#2F4F3E"),
        "lid": colours.get("body", "#F8F6F1"),
        "cover": colours.get("body", "#F8F6F1"),
        "logo-inlay": colours.get("logo", "#2B2B2B"),
        "litho": "#F2EFE8",
    }

    imported = []
    for name in meta["parts"]:
        path = os.path.join(args.stl_dir, f"{meta['product']}_{name}.stl")
        if not os.path.exists(path):
            print(f"  missing {path}, skipping")
            continue
        try:
            bpy.ops.wm.stl_import(filepath=os.path.abspath(path))
        except AttributeError:
            bpy.ops.import_mesh.stl(filepath=os.path.abspath(path))
        obj = bpy.context.selected_objects[0]
        obj.name = name
        if args.repair:
            repair_object(obj)
        mat = make_material(name, colour_for.get(name, "#CCCCCC"),
                            rough=0.85 if name == "litho" else 0.45,
                            transmission=0.5 if name == "litho" else 0.0)
        obj.data.materials.clear()
        obj.data.materials.append(mat)
        for poly in obj.data.polygons:
            poly.use_smooth = False
        imported.append(obj)
        print(f"  imported {name}")

    if not imported:
        sys.exit("no parts imported — check --stl-dir")

    if args.render:
        cam, centre, extent = setup_studio(imported, samples=args.samples)
        render_turntable(args.render, cam, centre, extent, args.frames)

    if args.save:
        bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(args.save))
        print(f"saved {args.save}")


if __name__ == "__main__":
    main()
