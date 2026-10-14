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


def write_job(outdir: str, parts: dict[str, trimesh.Trimesh], meta: dict, preview: np.ndarray | None,
              modes: dict[str, str], category: str = "personalised", extra_cost: float = 0.0,
              inlay_band_frac: float = 0.0) -> dict:
    os.makedirs(outdir, exist_ok=True)
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
