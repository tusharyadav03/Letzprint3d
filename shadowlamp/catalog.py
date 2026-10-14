"""Render the product catalogue for the store: one lit product image per theme (+ a cut-out variant
where that is the natural look) and a catalog.json the Next.js site reads.

    python -m shadowlamp.catalog --out store/public/products --json store/content/catalog.json
"""
from __future__ import annotations

import argparse
import json
import math
import os
import time

import cv2
import numpy as np
from PIL import Image

from . import themes
from .lamp import LampSpec, build

CATEGORY_LABELS = {
    "hindu": "Hindu & Diwali", "christian": "Christian", "islam": "Islamic", "jewish": "Jewish",
    "buddhist": "Buddhist", "sikh": "Sikh", "bahai": "Baháʼí", "taoist": "Taoist", "shinto": "Shinto",
    "spiritual": "Spiritual", "love": "Love", "halloween": "Halloween", "christmas": "Christmas",
    "night": "Night light", "pets": "Pets", "nerd": "Science & nerd", "custom": "Your words",
}
GROUPS = {
    "faith": ["hindu", "christian", "islam", "jewish", "buddhist", "sikh", "bahai", "taoist", "shinto", "spiritual"],
    "season": ["halloween", "christmas", "night", "love", "pets"],
    "nerd": ["nerd"],
    "custom": ["custom"],
}
SKIP = {"calibration", "mandelbrot", "glyph", "text", "element"}   # tooling or text-driven (own pages)
PRICES = {"shade": 29.90, "lamp": 36.90, "photo": 44.90, "name": 24.90, "nfc_stand": 34.90}


def front_image(T: np.ndarray, radius: float, height: float, px: float = 8.0, base_h: float = 14.0,
                halo: bool = True) -> np.ndarray:
    """Lit front view on a warm dark room background, RGB float in [0,1]."""
    ny, nx = T.shape
    R = radius
    fw = int(2 * R * px)
    x = (np.arange(fw) + 0.5) / fw * 2 - 1
    theta = np.arcsin(np.clip(x, -1, 1))
    col = np.round(((theta - np.pi) % (2 * np.pi)) / (2 * np.pi) * nx).astype(int) % nx
    front = T[:, col]
    shade = (0.5 + 0.5 * np.cos(theta)).astype(np.float32) ** 0.8
    warm = np.array([1.0, 0.84, 0.58], dtype=np.float32)
    rgb = front[:, :, None] * shade[None, :, None] * warm[None, None, :]
    fh = int(height * px)
    lamp = cv2.resize(np.flipud(rgb).astype(np.float32), (fw, fh), interpolation=cv2.INTER_AREA)
    # canvas: room
    pad = int(0.22 * fw)
    bh = int(base_h * px)
    W, H = fw + 2 * pad, fh + bh + 2 * pad
    bg = np.array([0.082, 0.067, 0.055], dtype=np.float32)
    canvas = np.tile(bg, (H, W, 1))
    # halo: blurred lamp light bleeding into the room
    if halo:
        glow = np.zeros((H, W, 3), dtype=np.float32)
        glow[pad:pad + fh, pad:pad + fw] = lamp
        k = int(fw * 0.5) | 1
        glow = cv2.GaussianBlur(glow, (k, k), fw * 0.18)
        canvas = canvas + 0.55 * glow
        # light pool on the table
        pool = np.zeros((H, W, 3), dtype=np.float32)
        cv2.ellipse(pool, (W // 2, pad + fh + bh), (int(fw * 0.9), int(bh * 1.6)), 0, 0, 360, (1.0, 0.84, 0.58), -1)
        pool = cv2.GaussianBlur(pool, (k, k), fw * 0.15)
        canvas = canvas + 0.10 * pool * front.mean()
    canvas[pad:pad + fh, pad:pad + fw] = np.maximum(canvas[pad:pad + fh, pad:pad + fw], lamp)
    # base: dark disc with a lit rim
    x0, x1 = pad - int(0.08 * fw), pad + fw + int(0.08 * fw)
    cv2.rectangle(canvas, (x0, pad + fh), (x1, pad + fh + bh), (0.16, 0.14, 0.12), -1)
    cv2.rectangle(canvas, (x0, pad + fh), (x1, pad + fh + 2), (0.35, 0.29, 0.22), -1)
    return np.clip(canvas, 0, 1)


def save_webp(img: np.ndarray, path: str, quality: int = 86, width: int | None = None):
    im = Image.fromarray((img * 255).astype(np.uint8), "RGB")
    if width and im.width > width:
        im = im.resize((width, int(im.height * width / im.width)), Image.LANCZOS)
    im.save(path, "WEBP", quality=quality, method=6)


def render_product(theme: str, mode: str, text: str | None = None) -> np.ndarray:
    spec = LampSpec(theme=theme, mode=mode, text=text, pitch=0.5)
    _, _, _, meta = build(spec, preview_only=True)
    return front_image(meta["_transmittance"], spec.diameter / 2.0, spec.height)


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="store/public/products")
    ap.add_argument("--json", default="store/content/catalog.json")
    ap.add_argument("--width", type=int, default=900)
    ns = ap.parse_args(argv)
    os.makedirs(ns.out, exist_ok=True)
    os.makedirs(os.path.dirname(ns.json), exist_ok=True)
    items = []
    t0 = time.time()
    for name, th in themes.THEMES.items():
        if name in SKIP or th.kind != "mask":
            continue
        variants = []
        modes = ["glow", "cutout"] if (th.default_mode == "cutout" or th.cutout_features) else ["glow"]
        for mode in modes:
            img = render_product(name, mode)
            fn = f"{name}-{mode}.webp"
            save_webp(img, os.path.join(ns.out, fn), width=ns.width)
            variants.append({"mode": mode, "image": f"/products/{fn}"})
        items.append({
            "slug": name,
            "name": name.replace("-", " ").title().replace("Of", "of").replace("Ik Onkar", "Ik Onkar"),
            "category": th.category,
            "categoryLabel": CATEGORY_LABELS.get(th.category, th.category.title()),
            "group": next((g for g, cats in GROUPS.items() if th.category in cats), "other"),
            "defaultMode": th.default_mode,
            "variants": variants,
            "note": th.note,
        })
        print(f"{name:16s} {modes}  {time.time() - t0:.0f}s")
    # text-driven products
    name_img = render_product("text", "glow", None)
    for slug, text, mode in (("name-lamp", "Léa", "glow"), ("hello-world", "Hello,|World!", "glow")):
        spec = LampSpec(theme="text", theme_text=text, mode=mode, pitch=0.5)
        _, _, _, meta = build(spec, preview_only=True)
        save_webp(front_image(meta["_transmittance"], spec.diameter / 2.0, spec.height),
                  os.path.join(ns.out, f"{slug}.webp"), width=ns.width)
    spec = LampSpec(theme="element", theme_text="Lu|Luxembourg|71", mode="glow", pitch=0.5)
    _, _, _, meta = build(spec, preview_only=True)
    save_webp(front_image(meta["_transmittance"], spec.diameter / 2.0, spec.height),
              os.path.join(ns.out, "element.webp"), width=ns.width)
    catalog = {"generated": time.strftime("%Y-%m-%d"), "prices": PRICES, "categories": CATEGORY_LABELS,
               "groups": GROUPS, "items": items}
    with open(ns.json, "w", encoding="utf-8") as fh:
        json.dump(catalog, fh, indent=1, ensure_ascii=False)
    print(f"{len(items)} products, {time.time() - t0:.0f}s")


if __name__ == "__main__":
    main()
