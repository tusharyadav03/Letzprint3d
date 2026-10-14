"""Mesh construction for Shadow Lamp shades and bases.

Everything here is built to be watertight by construction:

* ``shade_from_heightmap``  - relief shade (lithophane / glow) from a thickness grid,
  as a flat panel, a cylindrical arc, or a full closed cylinder.
* ``tube``                  - plain cylindrical shell (for cut-out / inlay modes).
* ``base``                  - revolved lamp base with a groove for the shade and an LED cavity.
* ``bent_prisms``           - 2D polygons (unrolled u/v in mm) turned into radial prisms
  wrapped around the shade, used as boolean cutters.
* ``difference`` / ``intersection`` - manifold booleans via trimesh.

Coordinate conventions
----------------------
Z is up. Shades stand on z = 0 (that end sits in the base groove).
For cylinders the image centre faces +X; the seam of a full cylinder is at the back (-X).
``u`` is the unrolled horizontal coordinate in mm (0 .. arc length), ``v`` the height in mm.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np
import trimesh
from shapely.geometry import Polygon, MultiPolygon
from shapely.ops import unary_union


# --------------------------------------------------------------------------- shades
@dataclass
class ShadeGeom:
    """Describes the shade surface the heightmap is mapped onto."""
    shape: str            # 'cylinder' | 'arc' | 'flat'
    height: float         # mm, along z
    radius: float = 45.0  # inner radius (cylinder/arc)
    arc_deg: float = 360.0
    width: float = 100.0  # flat only

    @property
    def periodic(self) -> bool:
        return self.shape == "cylinder" and abs(self.arc_deg - 360.0) < 1e-6

    @property
    def arc_len(self) -> float:
        if self.shape == "flat":
            return self.width
        return self.radius * math.radians(self.arc_deg)

    def grid_shape(self, pitch: float) -> tuple[int, int]:
        """(ny, nx) of the heightmap grid for a given pitch in mm."""
        ny = max(int(round(self.height / pitch)) + 1, 4)
        if self.periodic:
            nx = max(int(round(self.arc_len / pitch)), 8)
        else:
            nx = max(int(round(self.arc_len / pitch)) + 1, 4)
        return ny, nx


def _quad_faces(ny: int, nx: int, periodic: bool, row_offset: int = 0) -> np.ndarray:
    """Triangles for an (ny, nx) grid of vertices indexed row-major, as [a,b,c],[a,c,d]."""
    i = np.arange(ny - 1)[:, None]
    j = (np.arange(nx) if periodic else np.arange(nx - 1))[None, :]
    jn = (j + 1) % nx if periodic else j + 1
    a = row_offset + i * nx + j
    b = row_offset + i * nx + jn
    c = row_offset + (i + 1) * nx + jn
    d = row_offset + (i + 1) * nx + j
    t1 = np.stack([a, b, c], axis=-1).reshape(-1, 3)
    t2 = np.stack([a, c, d], axis=-1).reshape(-1, 3)
    return np.concatenate([t1, t2])


def shade_from_heightmap(t: np.ndarray, geom: ShadeGeom) -> trimesh.Trimesh:
    """Build a closed relief shade.

    ``t`` is the wall thickness grid in mm, shape (ny, nx), row 0 at the BOTTOM (z = 0),
    column 0 at u = 0. The inner surface is smooth (radius ``geom.radius`` / plane y = 0);
    the relief is on the outside. Boundary rows/columns should already be constant
    (a rim) so the end caps and side walls are planar.
    """
    t = np.asarray(t, dtype=np.float64)
    ny, nx = t.shape
    periodic = geom.periodic
    z = np.linspace(0.0, geom.height, ny)

    if geom.shape == "flat":
        # tangent = -x so that tangent x z = +y = outward (relief faces +Y)
        x = geom.width - np.linspace(0.0, geom.width, nx)
        X = np.broadcast_to(x[None, :], (ny, nx))
        Z = np.broadcast_to(z[:, None], (ny, nx))
        outer = np.stack([X, t, Z], axis=-1).reshape(-1, 3)
        inner = np.stack([
            np.concatenate([x, x]),
            np.zeros(2 * nx),
            np.concatenate([np.zeros(nx), np.full(nx, geom.height)]),
        ], axis=-1)
    else:
        if periodic:
            theta = math.pi + np.arange(nx) * (2.0 * math.pi / nx)
        else:
            arc = math.radians(geom.arc_deg)
            theta = -arc / 2.0 + np.linspace(0.0, arc, nx)
        ct, st = np.cos(theta), np.sin(theta)
        R = geom.radius
        r = R + t
        X = r * ct[None, :]
        Y = r * st[None, :]
        Z = np.broadcast_to(z[:, None], (ny, nx))
        outer = np.stack([X, Y, Z], axis=-1).reshape(-1, 3)
        inner = np.stack([
            np.concatenate([R * ct, R * ct]),
            np.concatenate([R * st, R * st]),
            np.concatenate([np.zeros(nx), np.full(nx, geom.height)]),
        ], axis=-1)

    n_out = ny * nx
    verts = np.concatenate([outer, inner])
    o = lambda i, j: i * nx + j                      # noqa: E731
    n = lambda k, j: n_out + k * nx + j              # noqa: E731

    faces = [_quad_faces(ny, nx, periodic)]                      # outer relief, outward
    inner_faces = _quad_faces(2, nx, periodic, row_offset=n_out)  # inner, flip winding
    faces.append(inner_faces[:, [0, 2, 1]])

    j = np.arange(nx) if periodic else np.arange(nx - 1)
    jn = (j + 1) % nx if periodic else j + 1
    # bottom ring (normal -z): [n0_j, n0_jn, o0_jn, o0_j]
    a, b, c, d = n(0, j), n(0, jn), o(0, jn), o(0, j)
    faces.append(np.stack([a, b, c], -1)); faces.append(np.stack([a, c, d], -1))
    # top ring (normal +z): [oT_j, oT_jn, n1_jn, n1_j]
    a, b, c, d = o(ny - 1, j), o(ny - 1, jn), n(1, jn), n(1, j)
    faces.append(np.stack([a, b, c], -1)); faces.append(np.stack([a, c, d], -1))

    if not periodic:
        k = np.arange(ny - 1)
        # side at j = 0, fan from n0_0, normal -tangent
        faces.append(np.stack([np.full(ny - 1, n(0, 0)), o(k, 0), o(k + 1, 0)], -1))
        faces.append(np.array([[n(0, 0), o(ny - 1, 0), n(1, 0)]]))
        # side at j = nx-1, reversed
        J = nx - 1
        faces.append(np.stack([np.full(ny - 1, n(0, J)), o(k + 1, J), o(k, J)], -1))
        faces.append(np.array([[n(0, J), n(1, J), o(ny - 1, J)]]))

    mesh = trimesh.Trimesh(vertices=verts, faces=np.concatenate(faces), process=False)
    return mesh


# --------------------------------------------------------------------------- revolved parts
def _revolve_closed(profile_rz: list[tuple[float, float]], sections: int) -> trimesh.Trimesh:
    """Revolve a closed (r, z) profile around Z. Profile must not cross r < 0."""
    pts = np.asarray(profile_rz, dtype=np.float64)
    if not np.allclose(pts[0], pts[-1]):
        pts = np.vstack([pts, pts[:1]])
    mesh = trimesh.creation.revolve(pts, angle=2.0 * math.pi, sections=sections)
    mesh.merge_vertices()
    mesh.remove_unreferenced_vertices()
    if mesh.volume < 0:
        mesh.invert()
    return mesh


def tube(radius: float, wall: float, height: float, sections: int | None = None) -> trimesh.Trimesh:
    """Plain cylindrical shell: inner radius ``radius``, thickness ``wall``, standing on z = 0."""
    if sections is None:
        sections = max(96, int(2 * math.pi * (radius + wall) / 0.6))
    prof = [(radius, 0.0), (radius + wall, 0.0), (radius + wall, height), (radius, height)]
    return _revolve_closed(prof, sections)


def arc_shell(radius: float, wall: float, height: float, arc_deg: float, pitch: float = 0.5) -> trimesh.Trimesh:
    """Open arc shell (for cut-out / inlay modes on arc shades) built as a constant heightmap."""
    geom = ShadeGeom("arc", height, radius, arc_deg)
    ny, nx = geom.grid_shape(pitch)
    return shade_from_heightmap(np.full((ny, nx), wall), geom)


@dataclass
class BaseSpec:
    shade_inner_radius: float      # R of the shade
    shade_rim: float               # rim wall thickness of the shade at z = 0
    led_dia: float = 39.0          # LED cavity diameter (0 = no cavity)
    led_depth: float = 12.0        # cavity depth from the top face
    height: float = 14.0
    lip: float = 6.0               # material outside the groove
    groove_depth: float = 4.0
    clearance: float = 0.3
    cable_slot: float = 0.0        # width of a cable slot at the back (0 = none)


def base(spec: BaseSpec, sections: int = 192) -> trimesh.Trimesh:
    R = spec.shade_inner_radius
    g_in = R - spec.clearance
    g_out = R + spec.shade_rim + spec.clearance
    Rb = g_out + spec.lip
    hb = spec.height
    c_r = max(spec.led_dia / 2.0, 0.0)
    c_d = spec.led_depth if c_r > 0 else 0.0
    if c_r > 0 and g_in - c_r < 1.2:
        raise ValueError(f"LED cavity (r={c_r}) too close to groove (r={g_in}); use a larger shade or smaller LED")
    if c_d >= hb - 1.5:
        raise ValueError("LED cavity deeper than the base allows")
    prof = [(0.0, 0.0), (Rb, 0.0), (Rb, hb), (g_out, hb), (g_out, hb - spec.groove_depth),
            (g_in, hb - spec.groove_depth), (g_in, hb)]
    if c_r > 0:
        prof += [(c_r, hb), (c_r, hb - c_d), (0.0, hb - c_d)]
    else:
        prof += [(0.0, hb)]
    mesh = _revolve_closed(prof, sections)
    if spec.cable_slot > 0 and c_r > 0:
        # slot from the cavity to the back edge, along -X, sitting on the cavity floor
        slot_h = min(5.0, c_d - 1.0)
        box = trimesh.creation.box(extents=[Rb + 2.0, spec.cable_slot, slot_h])
        box.apply_translation([-(Rb + 2.0) / 2.0 - 0.5, 0.0, hb - c_d + slot_h / 2.0])
        mesh = difference(mesh, [box])
    return mesh


# --------------------------------------------------------------------------- cutters
def _as_polygons(geomlike) -> list[Polygon]:
    if geomlike is None or geomlike.is_empty:
        return []
    if isinstance(geomlike, Polygon):
        return [geomlike]
    if isinstance(geomlike, MultiPolygon):
        return list(geomlike.geoms)
    if hasattr(geomlike, "geoms"):
        out = []
        for g in geomlike.geoms:
            out.extend(_as_polygons(g))
        return out
    return []


def bent_prisms(polys: list[Polygon], geom: ShadeGeom, wall: float, margin: float = 1.0,
                seg: float = 0.8, max_area: float = 2.0) -> list[trimesh.Trimesh]:
    """Turn unrolled 2D polygons (u, v in mm) into radial prisms through the shade wall.

    For cylinder/arc the prism spans radius R - margin .. R + wall + margin and is bent so every
    cut face is radial. ``u`` is measured at the mid-wall radius. For flat shades the prism is a
    straight extrusion along -Y .. +Y (relief side is +Y).
    """
    out = []
    depth = wall + 2.0 * margin
    for poly in polys:
        poly = poly.segmentize(seg)
        if poly.area < 0.2:
            continue
        m = trimesh.creation.extrude_polygon(poly, depth, engine="triangle",
                                             triangle_args=f"pq28a{max_area}")
        V = m.vertices.copy()
        u, v, w = V[:, 0], V[:, 1], V[:, 2]
        if geom.shape == "flat":
            # polygon x = u -> world x = width - u (mirrored, see shade_from_heightmap); y = w - margin
            V2 = np.stack([geom.width - u, w - margin, v], axis=-1)
            # (u,v,w) -> (-x, z, y): determinant +1, handedness preserved
            m2 = trimesh.Trimesh(V2, m.faces, process=False)
        else:
            Rm = geom.radius + wall / 2.0
            if geom.periodic:
                theta = math.pi + u / Rm
            else:
                theta = -math.radians(geom.arc_deg) / 2.0 + u / Rm
            r = geom.radius - margin + w
            V2 = np.stack([r * np.cos(theta), r * np.sin(theta), v], axis=-1)
            m2 = trimesh.Trimesh(V2, m.faces, process=False)
        if m2.volume < 0:
            m2.invert()
        out.append(m2)
    return out


# --------------------------------------------------------------------------- booleans
def difference(a: trimesh.Trimesh, cutters: list[trimesh.Trimesh]) -> trimesh.Trimesh:
    if not cutters:
        return a.copy()
    res = trimesh.boolean.difference([a, *cutters], engine="manifold")
    return res


def intersection(a: trimesh.Trimesh, cutters: list[trimesh.Trimesh]) -> trimesh.Trimesh:
    if not cutters:
        return trimesh.Trimesh()
    u = trimesh.boolean.union(cutters, engine="manifold") if len(cutters) > 1 else cutters[0]
    return trimesh.boolean.intersection([a, u], engine="manifold")


def union(meshes: list[trimesh.Trimesh]) -> trimesh.Trimesh:
    meshes = [m for m in meshes if m is not None and len(m.faces)]
    if len(meshes) == 1:
        return meshes[0]
    return trimesh.boolean.union(meshes, engine="manifold")


# --------------------------------------------------------------------------- checks
def check(mesh: trimesh.Trimesh, name: str = "mesh") -> dict:
    """Print-readiness summary; raises nothing, returns facts."""
    info = {
        "name": name,
        "watertight": bool(mesh.is_watertight),
        "winding_consistent": bool(mesh.is_winding_consistent),
        "volume_mm3": float(mesh.volume) if mesh.is_volume else float(abs(mesh.volume)),
        "faces": int(len(mesh.faces)),
        "bbox_mm": [float(x) for x in (mesh.bounds[1] - mesh.bounds[0])],
        "bodies": int(mesh.body_count),
    }
    return info


def rim_mask(ny: int, nx: int, periodic: bool, rim_rows: int, frame_cols: int) -> np.ndarray:
    """Boolean grid marking rim rows (top/bottom) and, for open shapes, frame columns."""
    m = np.zeros((ny, nx), dtype=bool)
    if rim_rows > 0:
        m[:rim_rows, :] = True
        m[-rim_rows:, :] = True
    if not periodic and frame_cols > 0:
        m[:, :frame_cols] = True
        m[:, -frame_cols:] = True
    return m
