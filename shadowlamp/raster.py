"""Raster helpers: photo preparation, mask -> polygon tracing, stencil bridges.

All masks are float32 arrays in [0, 1] where 1 = "symbol" (the part that glows, is cut
out, or is inlaid). Grayscale images for lithophanes are float32 in [0, 1] where 1 = white
(= thinnest wall, brightest).
"""
from __future__ import annotations

import cv2
import numpy as np
from PIL import Image, ImageOps
from shapely.geometry import Polygon, box
from shapely.ops import unary_union


# ---------------------------------------------------------------------- photos
def load_gray(path: str) -> np.ndarray:
    img = Image.open(path)
    img = ImageOps.exif_transpose(img)
    if img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info):
        bg = Image.new("RGBA", img.size, (255, 255, 255, 255))
        bg.alpha_composite(img.convert("RGBA"))
        img = bg
    g = np.asarray(img.convert("L"), dtype=np.float32) / 255.0
    return g


def fit(gray: np.ndarray, w: int, h: int, mode: str = "cover") -> np.ndarray:
    """Resize to exactly (h, w). 'cover' centre-crops to the aspect, 'contain' pads with white."""
    H, W = gray.shape
    if mode == "stretch":
        return cv2.resize(gray, (w, h), interpolation=cv2.INTER_AREA)
    target = w / h
    src = W / H
    if mode == "cover":
        if src > target:
            nw = int(round(H * target)); x0 = (W - nw) // 2
            gray = gray[:, x0:x0 + nw]
        else:
            nh = int(round(W / target)); y0 = (H - nh) // 2
            gray = gray[y0:y0 + nh, :]
        return cv2.resize(gray, (w, h), interpolation=cv2.INTER_AREA)
    # contain
    if src > target:
        nw, nh = w, int(round(w / src))
    else:
        nw, nh = int(round(h * src)), h
    small = cv2.resize(gray, (max(nw, 1), max(nh, 1)), interpolation=cv2.INTER_AREA)
    out = np.ones((h, w), dtype=np.float32)
    y0, x0 = (h - nh) // 2, (w - nw) // 2
    out[y0:y0 + nh, x0:x0 + nw] = small
    return out


def enhance(gray: np.ndarray, gamma: float = 1.0, blur_px: float = 0.0, stretch: bool = True,
            invert: bool = False) -> np.ndarray:
    g = gray.astype(np.float32)
    if invert:
        g = 1.0 - g
    if stretch:
        lo, hi = np.percentile(g, 0.5), np.percentile(g, 99.5)
        if hi - lo > 1e-3:
            g = np.clip((g - lo) / (hi - lo), 0.0, 1.0)
    if gamma != 1.0:
        g = np.power(np.clip(g, 0.0, 1.0), gamma)
    if blur_px and blur_px > 0:
        k = int(2 * round(2 * blur_px) + 1)
        g = cv2.GaussianBlur(g, (k, k), blur_px)
    return np.clip(g, 0.0, 1.0).astype(np.float32)


# ---------------------------------------------------------------------- masks
def resample_mask(mask: np.ndarray, w: int, h: int) -> np.ndarray:
    return cv2.resize(mask.astype(np.float32), (w, h), interpolation=cv2.INTER_AREA)


def _kernel(radius_px: int) -> np.ndarray:
    d = 2 * max(radius_px, 1) + 1
    return cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (d, d))


def enforce_min_features(mask: np.ndarray, ppm: float, min_cut_mm: float = 1.0,
                         min_wall_mm: float = 1.0) -> np.ndarray:
    """Remove cut features thinner than ``min_cut_mm`` and merge cuts whose separating
    wall would be thinner than ``min_wall_mm`` (so nothing fragile is printed)."""
    m = (mask > 0.5).astype(np.uint8)
    if min_cut_mm > 0:
        m = cv2.morphologyEx(m, cv2.MORPH_OPEN, _kernel(int(round(min_cut_mm * ppm / 2))))
    if min_wall_mm > 0:
        inv = 1 - m
        inv = cv2.morphologyEx(inv, cv2.MORPH_OPEN, _kernel(int(round(min_wall_mm * ppm / 2))))
        m = 1 - inv
    return m.astype(np.float32)


def trace(mask: np.ndarray, ppm: float, height_mm: float, simplify_mm: float = 0.06,
          min_area_mm2: float = 0.5) -> list[Polygon]:
    """Trace a binary mask (row 0 = top) into shapely polygons in mm: u right, v up."""
    m = (mask > 0.5).astype(np.uint8)
    contours, hierarchy = cv2.findContours(m, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    if hierarchy is None:
        return []
    hierarchy = hierarchy[0]

    def to_mm(c):
        pts = c.reshape(-1, 2).astype(np.float64)
        u = (pts[:, 0] + 0.5) / ppm
        v = height_mm - (pts[:, 1] + 0.5) / ppm
        return np.stack([u, v], axis=-1)

    polys = []
    for i, (nxt, prv, child, parent) in enumerate(hierarchy):
        if parent != -1 or len(contours[i]) < 3:
            continue
        shell = to_mm(contours[i])
        holes = []
        c = child
        while c != -1:
            if len(contours[c]) >= 3:
                holes.append(to_mm(contours[c]))
            c = hierarchy[c][0]
        try:
            p = Polygon(shell, holes)
            if not p.is_valid:
                p = p.buffer(0)
            p = p.simplify(simplify_mm, preserve_topology=True)
        except Exception:
            continue
        for q in _flatten(p):
            if q.area >= min_area_mm2:
                polys.append(q)
    return polys


def _flatten(g) -> list[Polygon]:
    if g is None or g.is_empty:
        return []
    if isinstance(g, Polygon):
        return [g]
    if hasattr(g, "geoms"):
        out = []
        for s in g.geoms:
            out.extend(_flatten(s))
        return out
    return []


def add_bridges(polys: list[Polygon], bridge_w: float = 1.6, directions: str = "v") -> tuple[list[Polygon], int]:
    """Stencil fix: every island (hole inside a cut polygon) gets a material strip through its
    centroid so it stays attached to the wall. Vertical strips print as plain walls.
    Returns the new polygons and the number of bridges added."""
    out, n = [], 0
    for p in polys:
        work = p
        for ring in list(p.interiors):
            island = Polygon(ring)
            cx, cy = island.centroid.x, island.centroid.y
            minx, miny, maxx, maxy = p.bounds
            strips = []
            if "v" in directions:
                strips.append(box(cx - bridge_w / 2, miny - 1, cx + bridge_w / 2, maxy + 1))
            if "h" in directions:
                strips.append(box(minx - 1, cy - bridge_w / 2, maxx + 1, cy + bridge_w / 2))
            work = work.difference(unary_union(strips))
            n += len(strips)
        out.extend(_flatten(work))
    return out, n


def rasterize(polys: list[Polygon], ppm: float, width_mm: float, height_mm: float) -> np.ndarray:
    """Back to a mask (for previews / glow from bridged polygons)."""
    W, H = int(round(width_mm * ppm)), int(round(height_mm * ppm))
    img = np.zeros((H, W), dtype=np.uint8)
    for p in polys:
        def px(ring):
            a = np.asarray(ring.coords)
            x = a[:, 0] * ppm - 0.5
            y = (height_mm - a[:, 1]) * ppm - 0.5
            return np.round(np.stack([x, y], -1)).astype(np.int32).reshape(-1, 1, 2)
        cv2.fillPoly(img, [px(p.exterior)], 255)
        for r in p.interiors:
            cv2.fillPoly(img, [px(r)], 0)
    return img.astype(np.float32) / 255.0
