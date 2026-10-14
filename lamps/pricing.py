"""
Cost model for a printed part — the PRD formula, made explicit.

    material    = grams × cost_per_gram
    electricity = printer_kw × hours × cost_per_kwh
    wear        = wear_per_hour × hours
    failure     = (material + electricity + wear) × failure_rate
    setup       = setup_minutes × hourly_wage / 60          (per part)
    cost        = sum of the above (+ components, packaging)
    floor_price = cost × (1 + margin)

The formula gives a FLOOR, not a price. Personalised gifts are priced on
value (what a photo lamp is worth to the buyer), and the floor only tells
you when a sale would lose money. Every number lives in `Rates` so that the
calibration can be changed in one place once real prints have been logged.
"""

from __future__ import annotations

from dataclasses import dataclass, field, asdict
import math


@dataclass
class Rates:
    pla_density_g_cm3: float = 1.24      # PLA
    cost_per_gram: float = 0.022         # €22 / kg PLA (PRD baseline)
    printer_kw: float = 0.12             # Bambu P1S average draw while printing PLA, enclosure warm
    cost_per_kwh: float = 0.18           # Luxembourg baseline (PRD)
    wear_per_hour: float = 0.15          # capital cost / expected life (PRD: 3000 h)
    failure_rate: float = 0.07           # PRD: 7 % buffer
    setup_minutes: float = 10.0          # per part: plate prep, removal, check
    hourly_wage: float = 15.0            # → €2.50 per part (PRD)
    packaging: float = 1.00              # box + tissue + sticker
    margin: float = 1.00                 # PRD: 50–100 % on cost → floor
    retail_multiplier: float = 3.0       # value-based suggestion: 3 × cost
    # Print-time heuristic: effective deposition in mm³/s per profile.
    # Calibrate against logged prints — see calibration.json.
    flow_mm3_s: dict = field(default_factory=lambda: {
        "lithophane": 4.0,   # 0.12 mm layers, 100 % infill, outer-wall quality speed
        "solid": 9.0,        # 0.20 mm layers, 15 % infill, standard speed
    })
    travel_overhead: float = 1.15        # accelerations, travel, retractions


@dataclass
class PartEstimate:
    name: str
    volume_mm3: float
    deposited_mm3: float
    grams: float
    hours: float
    profile: str


def deposited_volume(volume_mm3: float, area_mm2: float, profile: str,
                     infill: float = 0.15, shell_mm: float = 1.2) -> float:
    """Plastic actually extruded. Lithophanes are 100 % infill; solid parts
    are a shell plus sparse infill, estimated from surface area × shell."""
    if profile == "lithophane":
        return volume_mm3
    shell = min(volume_mm3, area_mm2 * shell_mm)
    core = max(0.0, volume_mm3 - shell)
    return shell + core * infill


def estimate_part(name: str, volume_mm3: float, area_mm2: float, profile: str,
                  rates: Rates, infill: float = 0.15) -> PartEstimate:
    dep = deposited_volume(volume_mm3, area_mm2, profile, infill)
    grams = dep / 1000.0 * rates.pla_density_g_cm3
    hours = dep / rates.flow_mm3_s[profile] / 3600.0 * rates.travel_overhead
    return PartEstimate(name, volume_mm3, dep, grams, hours, profile)


def _round_90(x: float) -> float:
    """Round up to the next .90 price point (€23.4 → €23.90, €23.95 → €24.90)."""
    base = math.floor(x)
    return base + 0.90 if x <= base + 0.90 else base + 1.90


def quote(parts: list[PartEstimate], rates: Rates, components: dict[str, float] | None = None,
          min_retail: float = 0.0) -> dict:
    components = components or {}
    grams = sum(p.grams for p in parts)
    hours = sum(p.hours for p in parts)
    material = grams * rates.cost_per_gram
    electricity = rates.printer_kw * hours * rates.cost_per_kwh
    wear = rates.wear_per_hour * hours
    failure = (material + electricity + wear) * rates.failure_rate
    setup = len(parts) * rates.setup_minutes * rates.hourly_wage / 60.0
    comp = sum(components.values())
    cost = material + electricity + wear + failure + setup + comp + rates.packaging
    floor_price = cost * (1 + rates.margin)
    retail = max(min_retail, cost * rates.retail_multiplier)
    return {
        "parts": [asdict(p) for p in parts],
        "grams_total": round(grams, 1),
        "hours_total": round(hours, 2),
        "cost_breakdown": {
            "material": round(material, 2),
            "electricity": round(electricity, 2),
            "machine_wear": round(wear, 2),
            "failure_buffer": round(failure, 2),
            "setup_labour": round(setup, 2),
            "components": {k: round(v, 2) for k, v in components.items()},
            "packaging": round(rates.packaging, 2),
        },
        "cost_total": round(cost, 2),
        "floor_price": round(_round_90(floor_price), 2),
        "suggested_retail": round(_round_90(retail), 2),
        "revenue_per_print_hour_at_retail": round(_round_90(retail) / hours, 2) if hours else None,
        "rates": asdict(rates),
    }
