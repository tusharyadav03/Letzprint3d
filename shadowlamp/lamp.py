"""Compose a lamp panel (theme / photo / text) and build the printable parts."""
from __future__ import annotations

import math
from dataclasses import dataclass, asdict

import cv2
import numpy as np

from . import fonts, raster, themes
from .mesher import (BaseSpec, ShadeGeom, arc_shell, base as base_mesh, bent_prisms, cap as cap_mesh, check,
                     difference, intersection, rim_mask, shade_from_heightmap, tube)

PPM = 8.0        # composition canvas resolution, px per mm
MU_PLA = 1.2     # white PLA absorption, 1/mm, for the backlit preview (Beer-Lambert)
LED_PRESETS = {"tealight": (39.0, 12.0), "usb-puck": (52.0, 10.0), "none": (0.0, 0.0)}
MODES = ("litho", "glow", "inlay", "cutout")


@dataclass
class LampSpec:
    job: str = "lamp"
    theme: str | None = None
    image: str | None = None
    mode: str | None = None          # litho | glow | inlay | cutout (None = theme default)
    shape: str = "cylinder"          # cylinder | arc | flat
    diameter: float = 90.0           # inner diameter, mm
    arc_deg: float = 360.0           # for shape=arc
    width: float = 100.0             # for shape=flat
    height: float = 110.0
    pitch: float = 0.3               # heightmap pitch, mm (litho/glow)
    min_wall: float = 0.8            # thinnest wall (bright)
    max_wall: float = 2.8            # litho thickest wall (dark)
    wall: float = 2.4                # glow/inlay/cutout wall
    rim_height: float = 5.0          # solid band top & bottom
    frame: float = 3.0               # solid side frame for arc / flat
    symbol_frac: float = 0.62        # symbol height as fraction of the free band
    repeat: int = 1                  # copies around the shade
    text: str | None = None          # name / date / message band
    text_height: float = 10.0
    text_pos: str = "bottom"         # bottom | top
    theme_text: str | None = None    # text parameter for text-driven themes
    gamma: float = 1.0
    blur_mm: float = 0.12
    invert: bool = False
    fit: str = "cover"
    seed: int = 0
    soft_edge_mm: float = 0.5
    min_cut: float = 0.8
    features: bool = False           # cut/glow only the symbol's holes (face, pips, windows)
    min_bridge: float = 1.2
    bridge_w: float = 1.6
    bg: float = 0.0                  # glow: background light level 0..1 (0 = full wall, 0.3 = airy)
    feather: float = 3.0             # photo edge fade into the wall, mm
    relief_in: bool = False          # relief on the inside, smooth outside
    with_cap: bool = False           # top ring (cylinder only)
    with_base: bool = False
    led: str = "tealight"
    led_dia: float | None = None
    led_depth: float | None = None
    cable: bool = False

    @property
    def geom(self) -> ShadeGeom:
        return ShadeGeom(self.shape, self.height, self.diameter / 2.0, self.arc_deg, self.width)


# ---------------------------------------------------------------------------- composition
def _paste(canvas: np.ndarray, tile: np.ndarray, cx: float, cy: float, periodic: bool, gray: bool = False):
    H, W = canvas.shape
    h, w = tile.shape
    x0, y0 = int(round(cx - w / 2)), int(round(cy - h / 2))
    for xo in ((0, W, -W) if periodic else (0,)):
        xs, ys = x0 + xo, y0
        sx0, sy0 = max(xs, 0), max(ys, 0)
        sx1, sy1 = min(xs + w, W), min(ys + h, H)
        if sx1 <= sx0 or sy1 <= sy0:
            continue
        sub = tile[sy0 - ys:sy1 - ys, sx0 - xs:sx1 - xs]
        if gray:
            canvas[sy0:sy1, sx0:sx1] = sub
        else:
            canvas[sy0:sy1, sx0:sx1] = np.maximum(canvas[sy0:sy1, sx0:sx1], sub)


def resolve_mode(spec: LampSpec) -> tuple[str, str]:
    """(mode, kind) for a spec: photos and gray themes are lithophanes, else the theme default."""
    theme = themes.THEMES[spec.theme] if spec.theme else None
    kind = "gray" if (spec.image or (theme and theme.kind == "gray")) else "mask"
    mode = spec.mode or ("litho" if kind == "gray" else (theme.default_mode if theme else "glow"))
    if kind == "gray":
        mode = "litho"
    if mode not in MODES:
        raise ValueError(f"mode must be one of {MODES}")
    return mode, kind


def compose(spec: LampSpec, mode: str | None = None) -> tuple[np.ndarray, str, dict]:
    """Returns (canvas, kind, layout). Canvas row 0 = top of the shade, column 0 = u = 0."""
    mode = mode or resolve_mode(spec)[0]
    geom = spec.geom
    U, H = geom.arc_len, spec.height
    Wpx, Hpx = int(round(U * PPM)), int(round(H * PPM))
    canvas = np.zeros((Hpx, Wpx), dtype=np.float32)
    fr = 0.0 if geom.periodic else spec.frame
    u0, u1 = fr, U - fr
    v0, v1 = spec.rim_height, H - spec.rim_height
    text_band = None
    if spec.text:
        tb = spec.text_height + 3.0
        if spec.text_pos == "top":
            text_band = (v1 - tb, v1); v1 = v1 - tb - 1.0
        else:
            text_band = (v0, v0 + tb); v0 = v0 + tb + 1.0
    band = (v0, v1)
    layout = {"U": U, "H": H, "content_u": (u0, u1), "symbol_band": band, "text_band": text_band}

    theme = themes.THEMES[spec.theme] if spec.theme else None
    kind = "gray" if (spec.image or (theme and theme.kind == "gray")) else "mask"
    params = {"text": spec.theme_text, "seed": spec.seed, "min_wall": spec.min_wall, "max_wall": spec.max_wall}

    cw_px, ch_px = int(round((u1 - u0) * PPM)), int(round((v1 - v0) * PPM))
    cx_canvas = ((u0 + u1) / 2.0) * PPM
    cy_canvas = (H - (v0 + v1) / 2.0) * PPM

    if kind == "gray":
        if spec.image:
            g = raster.load_gray(spec.image)
            g = raster.enhance(g, spec.gamma, 0.0, True, spec.invert)
            if spec.blur_mm > 0:
                k = max(int(2 * round(spec.blur_mm * PPM) + 1), 3)
                g = cv2.GaussianBlur(g, (k, k), spec.blur_mm * PPM)
        else:
            g = theme.fn(max(ch_px, 64), params | {"width_px": max(cw_px, 64)})
            if spec.invert:
                g = 1.0 - g
        tile = raster.fit(g, cw_px, ch_px, spec.fit)
        if spec.image and spec.feather > 0:
            f = int(spec.feather * PPM)
            ramp = np.ones(tile.shape, dtype=np.float32)
            win = 0.5 - 0.5 * np.cos(np.linspace(0, np.pi, f))
            ramp[:f, :] *= win[:, None]; ramp[-f:, :] *= win[::-1][:, None]
            if not geom.periodic:
                ramp[:, :f] *= win[None, :]; ramp[:, -f:] *= win[::-1][None, :]
            tile = tile * ramp
        _paste(canvas, tile, cx_canvas, cy_canvas, False, gray=True)
    else:
        m = theme.fn(1400, params)
        if mode == "cutout" and (theme.cutout_features or spec.features):
            m = themes.features_only(m)
        elif spec.features:
            m = themes.features_only(m)
        h, w = m.shape
        n = max(int(spec.repeat), 1)
        sym_h = spec.symbol_frac * (v1 - v0) * PPM
        slot_w = ((u1 - u0) / n) * PPM * 0.86
        s = min(sym_h / h, slot_w / w)
        tile = cv2.resize(m, (max(int(w * s), 2), max(int(h * s), 2)), interpolation=cv2.INTER_AREA)
        tile = (tile > 0.5).astype(np.float32)
        for k in range(n):
            if geom.periodic:
                cx = (U / 2.0 + U * k / n) % U * PPM
            else:
                cx = (u0 + (u1 - u0) * (k + 0.5) / n) * PPM
            _paste(canvas, tile, cx, cy_canvas, geom.periodic)

    if spec.text and text_band:
        t = fonts.render_text(spec.text, int(spec.text_height * PPM))
        t = (t > 127).astype(np.float32)
        max_w = (u1 - u0) * PPM * 0.9
        if t.shape[1] > max_w:
            s = max_w / t.shape[1]
            t = cv2.resize(t, (int(t.shape[1] * s), max(int(t.shape[0] * s), 2)), interpolation=cv2.INTER_AREA)
            t = (t > 0.5).astype(np.float32)
        tcx = (U / 2.0 if geom.periodic else (u0 + u1) / 2.0) * PPM
        tcy = (H - (text_band[0] + text_band[1]) / 2.0) * PPM
        _paste(canvas, t, tcx, tcy, geom.periodic)
    return canvas, kind, layout


# ---------------------------------------------------------------------------- build
def build(spec: LampSpec, preview_only: bool = False) -> tuple[dict, dict, np.ndarray, dict]:
    """Returns (parts, modes, preview, meta). ``preview_only`` skips every mesh (fast product images)."""
    geom = spec.geom
    mode, kind = resolve_mode(spec)
    canvas, kind, layout = compose(spec, mode)
    R = spec.diameter / 2.0
    t_rim = spec.max_wall if mode == "litho" else spec.wall
    warnings: list[str] = []
    parts, modes = {}, {}
    preview = canvas.copy()

    if mode in ("litho", "glow"):
        ny, nx = geom.grid_shape(spec.pitch)
        src = canvas
        if mode == "glow" and spec.soft_edge_mm > 0:
            k = max(int(2 * round(spec.soft_edge_mm * PPM) + 1), 3)
            src = cv2.GaussianBlur(canvas, (k, k), spec.soft_edge_mm * PPM)
        g = raster.resample_mask(src, nx, ny)
        g = np.flipud(g)                                  # grid row 0 = bottom
        if mode == "litho":
            t = spec.max_wall - (spec.max_wall - spec.min_wall) * g
        else:
            t = spec.wall - (spec.wall - spec.min_wall) * np.maximum(g, spec.bg)
        rows = int(round(spec.rim_height / spec.pitch))
        cols = int(round(spec.frame / spec.pitch))
        t[rim_mask(ny, nx, geom.periodic, rows, cols)] = t_rim
        transmittance = np.exp(-MU_PLA * (t - spec.min_wall))
        preview = src
        if preview_only:
            meta = asdict(spec) | {"mode": mode, "kind": kind, "layout": layout, "warnings": warnings,
                                   "_transmittance": transmittance}
            return {}, {}, preview, meta
        shade = shade_from_heightmap(t, geom, relief_in=spec.relief_in)
        if mode == "glow" and len(shade.faces) > 200_000:
            try:  # glow shades are mostly flat: decimation keeps the look, cuts the file 5x
                d = shade.simplify_quadric_decimation(face_count=160_000)
                if d.is_watertight and abs(d.volume - shade.volume) / shade.volume < 0.01:
                    shade = d
            except Exception as e:
                warnings.append(f"decimation skipped: {e}")
        parts["shade"] = shade
        modes["shade"] = mode
        preview = src
    else:
        m = raster.enforce_min_features(canvas, PPM, spec.min_cut, spec.min_bridge if mode == "cutout" else 0.0)
        polys = raster.trace(m, PPM, spec.height)
        if polys:
            vs = [p.bounds[1] for p in polys] + [p.bounds[3] for p in polys]
            layout["symbol_v_extent"] = (min(vs), max(vs))
        nb = 0
        if mode == "cutout":
            polys, nb = raster.add_bridges(polys, spec.bridge_w)
        if preview_only:
            preview = raster.rasterize(polys, PPM, geom.arc_len, spec.height)
            ny, nx = geom.grid_shape(0.5)
            pm = np.flipud(raster.resample_mask(preview, nx, ny))
            wall_T = math.exp(-MU_PLA * (spec.wall - spec.min_wall))
            T = pm + (1.0 - pm) * wall_T if mode == "cutout" else np.full((ny, nx), wall_T) * (1.0 + 0.6 * pm)
            meta = asdict(spec) | {"mode": mode, "kind": kind, "layout": layout, "warnings": warnings,
                                   "_transmittance": T}
            return {}, {}, preview, meta
        if geom.periodic:
            shell = tube(R, spec.wall, spec.height)
        elif geom.shape == "arc":
            shell = arc_shell(R, spec.wall, spec.height, spec.arc_deg)
        else:
            ny, nx = geom.grid_shape(0.5)
            shell = shade_from_heightmap(np.full((ny, nx), spec.wall), geom)
        cutters = bent_prisms(polys, geom, spec.wall)
        body = difference(shell, cutters)
        parts["shade"] = body
        modes["shade"] = mode
        if mode == "inlay":
            parts["symbol"] = intersection(shell, cutters)
            modes["symbol"] = "inlay"
        if mode == "cutout" and body.body_count > 1:
            warnings.append(f"cut-out shade has {body.body_count} bodies: an island is still loose, add bridges (-h) or use glow mode")
        layout["bridges"] = nb
        layout["cut_polygons"] = len(polys)
        preview = raster.rasterize(polys, PPM, geom.arc_len, spec.height)
        ny, nx = geom.grid_shape(0.5)
        pm = np.flipud(raster.resample_mask(preview, nx, ny))
        wall_T = math.exp(-MU_PLA * (spec.wall - spec.min_wall))
        transmittance = pm + (1.0 - pm) * wall_T if mode == "cutout" else np.full((ny, nx), wall_T) * (1.0 + 0.6 * pm)

    if spec.with_cap:
        if geom.shape != "cylinder":
            warnings.append("cap is only generated for cylinder shades")
        else:
            parts["cap"] = cap_mesh(R, t_rim)
            modes["cap"] = "base"

    if spec.with_base:
        if geom.shape != "cylinder":
            warnings.append("base is only generated for cylinder shades (arc/flat bases: TODO)")
        else:
            dia, dep = LED_PRESETS.get(spec.led, LED_PRESETS["tealight"])
            if spec.led_dia is not None:
                dia = spec.led_dia
            if spec.led_depth is not None:
                dep = spec.led_depth
            parts["base"] = base_mesh(BaseSpec(R, t_rim, dia, dep, cable_slot=5.0 if spec.cable else 0.0))
            modes["base"] = "base"

    for name, m in parts.items():
        f = check(m, name)
        if not f["watertight"]:
            warnings.append(f"{name} is not watertight")

    ext = layout.get("symbol_v_extent", layout["symbol_band"])
    meta = asdict(spec) | {"mode": mode, "kind": kind, "layout": layout, "warnings": warnings,
                           "inlay_band_frac": (ext[1] - ext[0]) / spec.height if mode == "inlay" else 0.0,
                           "_transmittance": transmittance}
    return parts, modes, preview, meta
