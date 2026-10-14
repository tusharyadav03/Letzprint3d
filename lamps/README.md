# Shadow lamps — motif → print-ready lithophane lamp

One command turns a symbol, a name or a photo into a lamp for the P1S: a
cylinder shade whose wall thickness carries the image (thin = light passes,
thick = blocked) plus a base with an LED cavity. Watertight by construction,
no repair step, slices clean.

```bash
pip install -r lamps/requirements.txt

python lamps/shadowlamp.py --list                                  # catalogue
python lamps/shadowlamp.py --motif om --out out/om
python lamps/shadowlamp.py --motif diya --text "Happy Diwali" --out out/diwali
python lamps/shadowlamp.py --motif pumpkin --repeat 3 --span 100 --out out/pumpkin
python lamps/shadowlamp.py --text "Léa" --motif snowflake --out out/lea     # Kleeschen / name lamp
python lamps/shadowlamp.py --image photo.jpg --span 200 --res 3 --out out/photo
python lamps/shadowlamp.py --motif atom --invert --out out/atom              # glowing background, ~half the print time
```

Every run writes to `--out`:

| file | what |
|---|---|
| `lamp.3mf` | shade + base in one file, coloured (white / black) so the AMS slots map straight away |
| `shade.stl`, `base.stl` (`cap.stl`) | the same parts separately |
| `preview.png` | backlit simulation (Beer–Lambert, μ = 1.2 /mm) — unwrapped 360° and front view |
| `heightmap.png` | the light map that drove the geometry |
| `job.json` | dimensions, mesh checks, grams, print time, cost floor, suggested retail, settings |

## Catalogue

| group | motifs |
|---|---|
| faith | om, lotus, diya, cross, star-crescent, star-of-david, menorah, dharma-wheel, khanda, ankh, yin-yang, peace |
| nerd | atom, dna, circuit, d20, planet, constellation, rocket, pixel-heart, binary, pi, infinity, radioactive, chess-knight, omega, sum |
| halloween | pumpkin, ghost, bat, spiderweb |
| season | snowflake, christmas-tree, star, heart |
| custom | `--text "…"` (Poppins Bold, any language the font covers), `--image photo.jpg`, or any single Unicode character as `--motif` |

Procedural motifs are drawn in `motifs.py` with thick strokes that survive a
0.4 mm nozzle. Glyph motifs come from GNU FreeFont (GPL + font exception) and
Poppins (OFL) — both allow selling products made with them. Nothing in the
library is a branded character or logo; keep it that way, and route customer
logos through `--image`.

## How the wall is built

```
light level L (0 = dark … 1 = bright)  →  wall t = tmin + (1 − L)·(tmax − tmin)
defaults: tmin 0.6 mm, tmax 2.6 mm, background L = 0.30 (≈ 2.0 mm), motif L = 1.0 (0.6 mm)
```

- `--span` is the panel width in degrees; `--repeat n` places n copies around.
- `--bg` sets how much the rest of the shade glows. 0.30 reads as a warm dark
  body with a bright motif; 0.5 is airier and prints faster.
- `--invert` swaps motif and background: dark symbol on a glowing wall. Half
  the material, half the time, more fragile — raise `--tmin` to 0.8 for those.
- `--blur` softens edges (mm). 0.25 hides raster stair-steps; 0 for crisp text.
- `--relief in` puts the relief on the inside for a smooth outer surface.
- Photos: `--span 180…220`, `--res 3`, `--gamma 1.2` if faces come out flat.

## Base and LED

The base is a puck with a plug the shade slides over (0.25 mm clearance per
side) and a cavity for the light:

| `--led` | cavity | for |
|---|---|---|
| `tealight` (default) | Ø 39 × 16 mm | battery LED tea light, no cable |
| `puck70` / `puck80` | Ø 71 / 81 × 14 mm | USB LED puck; add `--usb-slot` (needs `pip install manifold3d`) |
| custom | `--led-dia`, `--led-depth` | anything else |

`--cap` adds a top ring with an open centre. `--base-h` sets the puck height.

## Print settings (P1S)

| part | material | layers | infill | walls | notes |
|---|---|---|---|---|---|
| shade | white PLA | 0.12 mm | 100 % | 3 | upright, no supports, outer wall ≤ 60 mm/s, 0 top/bottom layers |
| base | black PLA | 0.20 mm | 15 % gyroid | 3 | plug face up, no supports |

Print the two parts as separate plates or on one plate with two AMS slots —
the 3MF carries the colours either way.

## Pricing

`pricing.py` is the PRD cost formula: material €0.022/g, electricity €0.18/kWh,
wear €0.15/h, 7 % failure buffer, €2.50 setup per part, packaging, LED. It
prints a **floor** (cost × 2) and a **suggested retail** (cost × 3, never below
`--min-retail`). Price on value, not on the floor — a personalised lamp is a
gift, not a kilogram of PLA.

Print-time comes from a deposition heuristic (`flow_mm3_s`). After the first
prints, write the real figures into `lamps/calibration.json`:

```json
{ "flow_mm3_s": { "lithophane": 4.0, "solid": 9.0 }, "printer_kw": 0.12 }
```

Any `Rates` field can be overridden there. Log actual grams and minutes from
Bambu Studio for every job for the first two weeks; that log is what makes the
quotes trustworthy.

## Checking

`validate/check_mesh.py out/om --min-wall 0.6 --infill 100` runs the repo's
print-readiness report on the parts (it now merges STL vertices before
checking, so closed meshes report as closed).

## Known limits

- Lithophane detail is limited by the nozzle: features under ~0.8 mm wide blur.
  Keep text ≥ 8 mm tall on an Ø80 shade.
- Islands are fine (no stencil cut-outs), which is why this is a thickness
  map and not a cut pattern. A `--mode stencil` for true shadow projection is
  on the list.
- No in-browser preview yet; the plan is to port the light-map → mesh step to
  three.js in the shop so customers see their photo lamp before paying.
