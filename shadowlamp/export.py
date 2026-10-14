"""Write print files + production sheet for one lamp job."""
from __future__ import annotations

import json
import os
from datetime import datetime

import cv2
import numpy as np
import trimesh

from . import pricing
from .mesher import check

SLICER_SETTINGS = {
    "litho": "0.08-0.12 mm layers, 100% infill (or 8 walls), 0 top/bottom, no supports, print UPRIGHT, white PLA, 'Arachne' walls, speed ~60 mm/s outer wall",
    "glow": "0.12 mm layers, 6 walls + 100% infill, no supports, upright, white PLA",
    "inlay": "0.12 mm layers, 6 walls, upright; assign filament per object in Bambu Studio (body white, symbol colour); set flush volumes low (same-ish colours) or use 'flush into object'",
    "cutout": "0.16 mm layers, 5 walls, no supports (holes bridge themselves), upright, any colour; 'cooling overhangs' on",
    "base": "0.2 mm layers, 15% gyroid, 4 walls, flat as is",
}


def backlit_preview(T: np.ndarray, shape: str, radius: float, arc_deg: float, width: float, height: float,
                    base_h: float, path: str, px: float = 3.0) -> None:
    """Front view of the lamp lit from inside (T = transmittance grid, row 0 = bottom) next to the
    unrolled map. Ported from lamps/shadowlamp.py (Beer-Lambert, warm tint, Lambert shading)."""
    ny, nx = T.shape
    warm = np.array([1.0, 0.86, 0.62], dtype=np.float32)
    if shape == "flat":
        front = T[:, ::-1]                       # viewed from +Y the panel is mirrored (see mesher)
        shade = np.ones(front.shape[1], dtype=np.float32)
        fw = int(width * px)
    else:
        R = radius
        arc = 2 * np.pi if shape == "cylinder" else np.radians(arc_deg)
        half = min(arc / 2, np.pi / 2)
        fw = int(2 * R * np.sin(half) * px)
        x = (np.arange(fw) + 0.5) / fw * 2 - 1
        theta = np.arcsin(np.clip(x, -1, 1)) * (np.sin(half) if half < np.pi / 2 else 1.0)
        theta = np.arcsin(np.clip(x * np.sin(half), -1, 1))
        if shape == "cylinder":
            col = np.round(((theta - np.pi) % (2 * np.pi)) / (2 * np.pi) * nx).astype(int) % nx
        else:
            col = np.clip(np.round((theta + arc / 2) / arc * (nx - 1)).astype(int), 0, nx - 1)
        front = T[:, col]
        shade = (0.55 + 0.45 * np.cos(theta)).astype(np.float32)
    rgb = front[:, :, None] * shade[None, :, None] * warm[None, None, :]
    fh = int(height * px)
    img = cv2.resize(np.flipud(rgb), (max(fw, 2), max(fh, 2)), interpolation=cv2.INTER_AREA)
    bh = int(base_h * px)
    canvas = np.full((fh + bh + 40, fw + 40, 3), 18 / 255, dtype=np.float32)
    canvas[20:20 + fh, 20:20 + fw] = img
    if bh > 0:
        canvas[20 + fh:20 + fh + bh, 8:fw + 32] = 40 / 255
    un = np.flipud(T)
    uh = 360
    un = cv2.resize(un, (max(int(un.shape[1] * uh / un.shape[0]), 2), uh), interpolation=cv2.INTER_AREA)
    un_rgb = np.repeat(un[:, :, None], 3, axis=2)
    out = np.full((max(canvas.shape[0], uh + 40), canvas.shape[1] + un.shape[1] + 60, 3), 18 / 255, dtype=np.float32)
    out[20:20 + uh, 20:20 + un.shape[1]] = un_rgb
    out[:canvas.shape[0], un.shape[1] + 40:un.shape[1] + 40 + canvas.shape[1]] = canvas
    bgr = np.ascontiguousarray((np.clip(out, 0, 1) * 255).astype(np.uint8)[:, :, ::-1])
    cv2.putText(bgr, "unrolled transmittance", (20, 14), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (170, 170, 160), 1)
    cv2.putText(bgr, "front view, backlit", (un.shape[1] + 40, 14), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (170, 170, 160), 1)
    cv2.imwrite(path, bgr)


def write_job(outdir: str, parts: dict[str, trimesh.Trimesh], meta: dict, preview: np.ndarray | None,
              modes: dict[str, str], category: str = "personalised", extra_cost: float = 0.0,
              inlay_band_frac: float = 0.0) -> dict:
    os.makedirs(outdir, exist_ok=True)
    meta = dict(meta)
    T = meta.pop("_transmittance", None)
    if T is not None:
        try:
            backlit_preview(T, meta["shape"], meta["diameter"] / 2.0, meta["arc_deg"], meta["width"], meta["height"],
                            14.0 if "base" in parts else 0.0, os.path.join(outdir, "preview_backlit.png"))
        except Exception as e:  # preview must never block a job
            meta.setdefault("warnings", []).append(f"backlit preview failed: {e}")
    facts, estimates = {}, []
    for name, m in parts.items():
        m.export(os.path.join(outdir, f"{name}.stl"))
        f = check(m, name)
        facts[name] = f
        est = pricing.part_estimate(f["volume_mm3"], modes.get(name, "glow"),
                                    height_mm=f["bbox_mm"][2], inlay_band_frac=inlay_band_frac)
        est["part"] = name
        estimates.append(est)
    # one 3MF with every part as a named object (Bambu/Orca/Prusa import this directly)
    scene = trimesh.Scene()
    for name, m in parts.items():
        scene.add_geometry(m, node_name=name, geom_name=name)
    try:
        scene.export(os.path.join(outdir, "print_pack.3mf"))
    except Exception as e:  # pragma: no cover
        meta["3mf_error"] = str(e)
    if preview is not None:
        p = preview
        if p.shape[1] > 1800:
            s = 1800 / p.shape[1]
            p = cv2.resize(p, (1800, max(int(p.shape[0] * s), 1)), interpolation=cv2.INTER_AREA)
        cv2.imwrite(os.path.join(outdir, "preview.png"), (np.clip(p, 0, 1) * 255).astype(np.uint8))
    main_mode = modes.get("shade", "glow")
    lamp_sized = "shade" in facts and facts["shade"]["bbox_mm"][2] >= 60
    pr = pricing.price(estimates, category, extra_cost,
                       pricing.MARKET_MIN.get(main_mode) if lamp_sized else None)
    sheet = {
        "generated": datetime.now().isoformat(timespec="seconds"),
        "spec": meta,
        "parts": facts,
        "estimates": estimates,
        "pricing": pr,
        "slicer": {name: SLICER_SETTINGS.get(modes.get(name, "glow"), "") for name in parts},
    }
    with open(os.path.join(outdir, "production.json"), "w", encoding="utf-8") as fh:
        json.dump(sheet, fh, indent=2, ensure_ascii=False)
    with open(os.path.join(outdir, "production.md"), "w", encoding="utf-8") as fh:
        fh.write(_markdown(sheet))
    return sheet


def _markdown(s: dict) -> str:
    L = [f"# Production sheet — {s['spec'].get('job', 'lamp')}", "",
         f"_generated {s['generated']}_", "", "## Spec", ""]
    for k, v in s["spec"].items():
        L.append(f"- **{k}**: {v}")
    L += ["", "## Parts", "", "| part | watertight | bodies | faces | bbox mm | grams | est. hours | mode |", "|---|---|---|---|---|---|---|---|"]
    for e in s["estimates"]:
        f = s["parts"][e["part"]]
        bb = " x ".join(f"{x:.1f}" for x in f["bbox_mm"])
        L.append(f"| {e['part']} | {'yes' if f['watertight'] else 'NO'} | {f['bodies']} | {f['faces']} | {bb} | {e['grams']} | {e['hours']} | {e['mode']} |")
    p = s["pricing"]
    L += ["", "## Price", "",
          f"- print hours (all parts): **{p['print_hours']} h**",
          f"- cost (material + power + wear, +7% failures, +setup): **€{p['cost_eur']}**",
          f"- price floor (x1.5): €{p['price_min_eur']}",
          f"- recommended (x{p['margin_used']}): **€{p['price_rec_eur']}**",
          f"- **€/print-hour at recommended price: {p['eur_per_print_hour']}**  (target ≥ 6)",
          f"- {p['note']}", "", "## Slicer settings", ""]
    for name, txt in s["slicer"].items():
        L.append(f"- **{name}**: {txt}")
    L.append("")
    return "\n".join(L)
