"""
Geometry for the shadow lamp: a thickness-mapped cylinder shade, a revolved
base with an LED cavity, an optional top ring, and a minimal 3MF writer.

Everything is built watertight by construction (closed index grids, no
booleans), so the output needs no repair pass and slices without warnings.
"""

from __future__ import annotations

import io
import zipfile
from datetime import datetime, timezone

import numpy as np
import trimesh


# ----------------------------------------------------------------------------
# Shade: cylinder whose wall thickness follows a (nz, ntheta) map in mm
# ----------------------------------------------------------------------------

def shade_mesh(thick: np.ndarray, r_in: float, height: float, relief: str = "out") -> trimesh.Trimesh:
    """thick[i, j] is the wall thickness at height row i (0 = bottom) and
    angle column j (0 = +x, increasing counter-clockwise seen from above).

    relief="out": smooth inside (radius r_in), relief on the outer surface.
    relief="in":  smooth outside, relief on the inner surface.
    """
    nz, nt = thick.shape
    theta = np.linspace(0.0, 2.0 * np.pi, nt, endpoint=False)
    z = np.linspace(0.0, height, nz)
    ct, st = np.cos(theta), np.sin(theta)

    if relief == "out":
        r_outer = r_in + thick
        r_inner = np.full_like(thick, r_in)
    elif relief == "in":
        r_out_const = r_in + float(thick.max())
        r_outer = np.full_like(thick, r_out_const)
        r_inner = r_out_const - thick
    else:
        raise ValueError("relief must be 'out' or 'in'")

    def grid(r):
        x = r * ct[None, :]
        y = r * st[None, :]
        zz = np.broadcast_to(z[:, None], r.shape)
        return np.stack([x, y, zz], axis=-1).reshape(-1, 3)

    V = np.vstack([grid(r_outer), grid(r_inner)])
    N = nz * nt

    i = np.arange(nz - 1)[:, None]
    j = np.arange(nt)[None, :]
    jn = (j + 1) % nt
    a = i * nt + j
    b = i * nt + jn
    c = (i + 1) * nt + jn
    d = (i + 1) * nt + j
    outer = np.concatenate([
        np.stack([a, b, d], -1).reshape(-1, 3),
        np.stack([b, c, d], -1).reshape(-1, 3),
    ])
    inner = np.concatenate([
        np.stack([a, d, b], -1).reshape(-1, 3),
        np.stack([b, d, c], -1).reshape(-1, 3),
    ]) + N

    jt = np.arange(nt)
    jtn = (jt + 1) % nt
    ot = (nz - 1) * nt + jt
    otn = (nz - 1) * nt + jtn
    it_ = ot + N
    itn = otn + N
    top = np.concatenate([np.stack([ot, otn, itn], -1), np.stack([ot, itn, it_], -1)])
    ob, obn = jt, jtn
    ib, ibn = ob + N, obn + N
    bottom = np.concatenate([np.stack([ob, ibn, obn], -1), np.stack([ob, ib, ibn], -1)])

    F = np.vstack([outer, inner, top, bottom]).astype(np.int64)
    mesh = trimesh.Trimesh(V, F, process=False)
    if mesh.volume < 0:
        mesh.invert()
    return mesh


# ----------------------------------------------------------------------------
# Solids of revolution (base, cap)
# ----------------------------------------------------------------------------

def revolve(profile, nt: int = 256) -> trimesh.Trimesh:
    """Revolve a closed (r, z) polygon around the z axis.

    The profile is traversed counter-clockwise in the r–z plane (r to the
    right, z up) so normals point outward. Points on the axis (r == 0)
    collapse to a single vertex, which keeps the result watertight.
    """
    P = np.asarray(profile, dtype=float)
    n = len(P)
    theta = np.linspace(0.0, 2.0 * np.pi, nt, endpoint=False)
    ct, st = np.cos(theta), np.sin(theta)

    verts: list = []
    ring: list = []
    for r, z in P:
        if r <= 1e-9:
            ring.append(np.full(nt, len(verts), dtype=np.int64))
            verts.append([0.0, 0.0, z])
        else:
            start = len(verts)
            ring.append(start + np.arange(nt, dtype=np.int64))
            verts.extend(np.stack([r * ct, r * st, np.full(nt, z)], -1).tolist())

    j = np.arange(nt)
    jn = (j + 1) % nt
    faces = []
    for k in range(n):
        k2 = (k + 1) % n
        on_a = P[k, 0] <= 1e-9
        on_b = P[k2, 0] <= 1e-9
        if on_a and on_b:
            continue
        a, b = ring[k][j], ring[k][jn]
        c, d = ring[k2][jn], ring[k2][j]
        if on_a:
            faces.append(np.stack([a, c, d], -1))
        elif on_b:
            faces.append(np.stack([a, b, c], -1))
        else:
            faces.append(np.stack([a, b, c], -1))
            faces.append(np.stack([a, c, d], -1))
    F = np.vstack(faces)
    mesh = trimesh.Trimesh(np.asarray(verts), F, process=False)
    if mesh.volume < 0:
        mesh.invert()
    return mesh


def base_mesh(r_shade_in: float, r_shade_out: float, led_dia: float, led_depth: float,
              wall: float = 3.0, floor: float = 2.0, plug_h: float = 8.0, base_h: float = 10.0,
              clearance: float = 0.25, nt: int = 360) -> tuple[trimesh.Trimesh, dict]:
    """Puck base with a plug the shade slides over and an LED cavity inside.

    Cross-section (r to the right, z up):

           ┌───┐              ┌───┐     plug (r_plug), height plug_h
      ┌────┘   │   cavity     │   └────┐
      │        │   (led)      │        │ base (r_base), height base_h
      │        └──────────────┘        │
      └────────────────────────────────┘ floor
    """
    r_plug = r_shade_in - clearance
    r_cav = led_dia / 2.0 + 0.5
    if r_cav >= r_plug - 2.0:
        raise ValueError(f"LED Ø{led_dia} mm does not fit inside the shade (plug Ø{2 * r_plug:.1f}); "
                         f"use a bigger shade or a smaller LED")
    r_base = r_shade_out + wall
    top = base_h + plug_h
    cav_top = top
    cav_floor = max(floor, top - led_depth)
    profile = [
        (0.0, 0.0),
        (r_base, 0.0),
        (r_base, base_h),
        (r_plug, base_h),
        (r_plug, top),
        (r_cav, cav_top),
        (r_cav, cav_floor),
        (0.0, cav_floor),
    ]
    mesh = revolve(profile, nt)
    dims = {
        "diameter": round(2 * r_base, 2),
        "height": round(top, 2),
        "plug_diameter": round(2 * r_plug, 2),
        "plug_height": plug_h,
        "led_cavity_diameter": round(2 * r_cav, 2),
        "led_cavity_depth": round(cav_top - cav_floor, 2),
    }
    return mesh, dims


def cap_mesh(r_shade_in: float, r_shade_out: float, wall: float = 3.0, rim_h: float = 4.0,
             plug_h: float = 6.0, clearance: float = 0.25, opening_ratio: float = 0.6,
             nt: int = 360) -> trimesh.Trimesh:
    """Top ring: a rim that sits on the shade edge plus a short plug that
    drops inside it. Open in the middle so light still exits upward."""
    r_plug = r_shade_in - clearance
    r_open = r_plug * opening_ratio
    r_rim = r_shade_out + wall
    profile = [
        (r_open, 0.0),
        (r_plug, 0.0),
        (r_plug, plug_h),
        (r_rim, plug_h),
        (r_rim, plug_h + rim_h),
        (r_open, plug_h + rim_h),
    ]
    return revolve(profile, nt)


def usb_slot(mesh: trimesh.Trimesh, r_base: float, z_top: float, width: float = 9.0,
             height: float = 5.0) -> trimesh.Trimesh:
    """Cut a cable slot through the base wall along +x. Needs the manifold3d
    engine (pip install manifold3d); returns the untouched mesh if absent."""
    try:
        import manifold3d  # noqa: F401
    except ImportError:
        return mesh
    box = trimesh.creation.box(extents=(r_base + 2.0, width, height + 0.01))
    box.apply_translation(((r_base + 2.0) / 2.0, 0.0, z_top - height / 2.0))
    cut = trimesh.boolean.difference([mesh, box], engine="manifold")
    return cut if cut.is_watertight else mesh


# ----------------------------------------------------------------------------
# 3MF (vanilla core spec, with base materials so slicers show the colours)
# ----------------------------------------------------------------------------

_CONTENT_TYPES = """<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
 <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
 <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
</Types>
"""

_RELS = """<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
 <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>
"""


def write_3mf(path: str, parts: list[dict], title: str = "shadow lamp") -> None:
    """parts: [{name, mesh, color ('#RRGGBB'), material, translate (x, y, z)}]"""
    out = io.StringIO()
    out.write('<?xml version="1.0" encoding="UTF-8"?>\n')
    out.write('<model unit="millimeter" xml:lang="en-US" '
              'xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">\n')
    out.write(f' <metadata name="Title">{title}</metadata>\n')
    out.write(' <metadata name="Application">Letzprint3d shadowlamp</metadata>\n')
    out.write(f' <metadata name="CreationDate">{datetime.now(timezone.utc).date().isoformat()}</metadata>\n')
    out.write(' <resources>\n  <basematerials id="1">\n')
    for p in parts:
        out.write(f'   <base name="{p["material"]}" displaycolor="{p["color"]}FF"/>\n')
    out.write('  </basematerials>\n')
    for k, p in enumerate(parts):
        m: trimesh.Trimesh = p["mesh"]
        out.write(f'  <object id="{k + 2}" name="{p["name"]}" type="model" pid="1" pindex="{k}">\n   <mesh>\n    <vertices>\n')
        V = np.asarray(m.vertices, dtype=np.float64)
        out.write("".join(f'     <vertex x="{x:.4f}" y="{y:.4f}" z="{z:.4f}"/>\n' for x, y, z in V))
        out.write('    </vertices>\n    <triangles>\n')
        F = np.asarray(m.faces, dtype=np.int64)
        out.write("".join(f'     <triangle v1="{a}" v2="{b}" v3="{c}"/>\n' for a, b, c in F))
        out.write('    </triangles>\n   </mesh>\n  </object>\n')
    out.write(' </resources>\n <build>\n')
    for k, p in enumerate(parts):
        tx, ty, tz = p.get("translate", (0.0, 0.0, 0.0))
        out.write(f'  <item objectid="{k + 2}" transform="1 0 0 0 1 0 0 0 1 {tx:.3f} {ty:.3f} {tz:.3f}"/>\n')
    out.write(' </build>\n</model>\n')

    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("[Content_Types].xml", _CONTENT_TYPES)
        zf.writestr("_rels/.rels", _RELS)
        zf.writestr("3D/3dmodel.model", out.getvalue())


def mesh_report(m: trimesh.Trimesh) -> dict:
    ext = m.bounds[1] - m.bounds[0]
    return {
        "vertices": int(len(m.vertices)),
        "faces": int(len(m.faces)),
        "watertight": bool(m.is_watertight),
        "winding_consistent": bool(m.is_winding_consistent),
        "volume_mm3": round(float(m.volume), 1),
        "area_mm2": round(float(m.area), 1),
        "size_mm": [round(float(v), 2) for v in ext],
    }
