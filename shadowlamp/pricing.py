"""Cost and price model (PRD formula) + the KPI that matters on one printer: EUR per print-hour.

All rates are starting values. ``RATE_MM3_S`` (effective deposition rate per mode) is the
uncalibrated part: log real print times from the P1S for the first 20 prints and adjust.
"""
from __future__ import annotations

import math

PLA_DENSITY_G_CM3 = 1.24
FILAMENT_EUR_PER_G = 0.022      # ~EUR 22 / kg
KWH_PRICE = 0.18
PRINTER_KW = 0.12               # P1S average draw printing PLA (bed 55 C), incl. AMS
WEAR_EUR_PER_H = 0.15           # ~EUR 450 printer / 3000 h
FAILURE_RATE = 0.07
SETUP_EUR = 2.50                # cleaning, bed prep, file handling per part
LAYER_H = 0.12

# effective material throughput by mode (mm^3/s) - lithophanes are slow: tiny perimeters
RATE_MM3_S = {"litho": 4.5, "glow": 7.5, "inlay": 7.0, "cutout": 8.5, "base": 14.0}
# AMS colour change cost per swap (two swaps per layer inside the inlay band)
SWAP_SECONDS = 20.0            # P1S + AMS: cut, retract, load, purge, wipe
PURGE_G_PER_SWAP = 0.35        # with reduced flush volumes; default Bambu flush is worse

MARGIN = {"personalised": 2.5, "catalogue": 2.0, "b2b": 1.6}
# fraction of the mesh volume that becomes filament (shades are solid walls; bases print with infill)
SOLID_FRACTION = {"base": 0.38}


def part_estimate(volume_mm3: float, mode: str, height_mm: float = 0.0, inlay_band_frac: float = 0.0) -> dict:
    volume_mm3 = volume_mm3 * SOLID_FRACTION.get(mode, 1.0)
    grams = volume_mm3 / 1000.0 * PLA_DENSITY_G_CM3
    rate = RATE_MM3_S.get(mode, 8.0)
    hours = 0.08 + volume_mm3 / (rate * 3600.0)
    swaps = 0
    purge_g = 0.0
    if mode == "inlay" and height_mm > 0:
        layers = height_mm / LAYER_H
        swaps = int(2 * layers * max(inlay_band_frac, 0.0))
        hours += swaps * SWAP_SECONDS / 3600.0
        purge_g = swaps * PURGE_G_PER_SWAP
    grams_total = grams + purge_g
    material = grams_total * FILAMENT_EUR_PER_G
    electricity = PRINTER_KW * hours * KWH_PRICE
    wear = WEAR_EUR_PER_H * hours
    return {
        "mode": mode,
        "volume_mm3": round(volume_mm3, 1),
        "grams": round(grams, 1),
        "purge_g": round(purge_g, 1),
        "ams_swaps": swaps,
        "hours": round(hours, 2),
        "material_eur": round(material, 2),
        "electricity_eur": round(electricity, 2),
        "wear_eur": round(wear, 2),
    }


# what comparable personalised lamps sell for (Etsy EU, 2026): never list below this
MARKET_MIN = {"litho": 34.9, "glow": 24.9, "cutout": 24.9, "inlay": 39.9}


def price(parts: list[dict], category: str = "personalised", extra_cost: float = 0.0,
          market_min: float | None = None) -> dict:
    """``parts``: list of part_estimate dicts. ``extra_cost``: LED, packaging, NFC tag ..."""
    base = sum(p["material_eur"] + p["electricity_eur"] + p["wear_eur"] for p in parts)
    hours = sum(p["hours"] for p in parts)
    cost = base * (1.0 + FAILURE_RATE) + SETUP_EUR * len(parts) + extra_cost
    m = MARGIN.get(category, 2.0)
    rec = _pretty(max(cost * m, market_min or 0.0))
    floor = _pretty(cost * 1.5)
    return {
        "print_hours": round(hours, 2),
        "cost_eur": round(cost, 2),
        "price_min_eur": floor,
        "price_rec_eur": rec,
        "eur_per_print_hour": round(rec / max(hours, 0.05), 2),
        "margin_used": m,
        "note": "time model uncalibrated: log real P1S times and adjust RATE_MM3_S",
    }


def _pretty(x: float) -> float:
    """Round up to the next .90 price point."""
    return math.floor(x) + 0.90 if x - math.floor(x) <= 0.90 else math.floor(x) + 1.90
