# Shadow Lamp engine

Turns a symbol, a photo or a line of text into a print-ready lamp: shade STL/3MF, matching base,
preview, and a production sheet with grams, hours, cost, price and €/print-hour.
Everything is generated — no downloaded models, no licence problems. Fonts are OFL (see `fonts/FONTS.md`).

```bash
pip install -r shadowlamp/requirements.txt
python -m shadowlamp themes                                    # 45 themes: religions, festivals, nerd, pets, text
python -m shadowlamp make --theme om --text "शुभ दीपावली" --with-base --out out/om
python -m shadowlamp make --image photo.jpg --text "Mia · 2026" --with-base --out out/order-0001
python -m shadowlamp make --theme pumpkin --mode cutout --out out/pumpkin
python -m shadowlamp make --theme text --theme-text "Leo|2026" --shape arc --arc 180 --height 80 --out out/leo
python -m shadowlamp make --theme glyph --theme-text "☥" --bg 0.3 --relief-in --out out/ankh   # any glyph, airy background, smooth outside
python -m shadowlamp samples --out out/samples [--image photo.jpg]   # the starter set to print first
```

Run it on any machine with Python 3.10+ (Windows is fine). Output per job:
`shade.stl`, `base.stl` / `cap.stl` (optional), `symbol.stl` (inlay), `print_pack.3mf` (all parts, named — open
directly in Bambu Studio), `preview.png` (unrolled panel), `preview_backlit.png` (Beer-Lambert front view, what
the customer will see), `production.md/json`.

## Modes

| mode | what it is | print | when |
|---|---|---|---|
| `litho` | grayscale → wall thickness 0.8–2.8 mm (photo lithophane) | white PLA, 0.08–0.12 mm, 100 % walls, upright, slow | photos, Mandelbrot, calibration |
| `glow` | symbol = thin wall (0.8), rest thick (2.4): symbol glows, wall stays intact | white PLA, 0.12 mm, fast-ish | default for symbols, text, names |
| `cutout` | symbol cut through the wall; islands get automatic bridges; `cutout_features` themes cut the *holes* (pumpkin face, dice pips) | any colour, 0.16 mm, no supports | shadow projection on walls, arc sconces |
| `inlay` | two objects: body + symbol, same wall, for AMS two-colour | assign filaments per object | premium only — AMS swaps every layer cost 3–6 h extra (the sheet shows it) |

Shapes: `cylinder` (full, seam at the back, image faces +X), `arc` (e.g. 180° wall sconce), `flat` (panel).
`--repeat N` puts N copies around a cylinder. `--text` adds a name/date band (any script: Devanagari, Arabic,
Hebrew, Gurmukhi, Latin). `--with-base` adds a base with a groove for the shade and an LED cavity
(`--led tealight|usb-puck|none`, `--led-dia/--led-depth` to override, `--cable` for a cable slot); `--with-cap`
adds a top ring. `--bg 0.3` lets the background glow a little (airier, faster); `--relief-in` keeps the outside
smooth; `--feather` fades photo edges into the wall.

## Print the calibration strip first

`samples/calibration-strip` is an 80 × 40 mm panel with eight labelled steps from 0.6 to 3.0 mm. Print it
upright in the white PLA you will use, hold it against a lamp, and read off the thinnest wall that prints
cleanly and the thickest that still passes light. Put those into `--min-wall` / `--max-wall`. Then log the
real print time of every sample into `pricing.RATE_MM3_S` — the hours in the sheet are a model, not a measurement.

## Hardware assumptions

Bambu P1S (256 mm bed, 0.4 nozzle). Default lamp: Ø90 × 110 mm shade, base Ø107 × 14 mm with a Ø39 × 12 mm
tea-light cavity. A Ø90 cylinder at 0.3 mm pitch is ~700 k faces (lithophane) — normal for lithophanes; glow
shades are decimated to ~160 k faces.

## Layout

```
shadowlamp/
  themes.py    theme library (geometry + font glyphs), registry, features_only()
  fonts.py     script-aware font picking, text rendering (libraqm shaping)
  raster.py    photo prep, mask tracing (OpenCV), min-feature cleanup, stencil bridges
  mesher.py    watertight shade from heightmap (flat/arc/cylinder), tube, revolved base,
               bent prisms + manifold booleans
  lamp.py      LampSpec, compose(), build()
  pricing.py   PRD cost formula, AMS swap model, market floors, €/print-hour
  calibration.json  measured rates override pricing.py — fill after the first real prints
  export.py    STL / 3MF / preview / production sheet
  __main__.py  CLI
  fonts/       bundled OFL fonts + licences
```

## Known gaps

- Bases only for cylinder shades; arc/flat need a slotted foot (TODO).
- `inlay` is an honest two-object split; a cheaper two-colour route is a 0.8 mm coloured insert plate (TODO).
- No browser preview yet — the shop will get a three.js version of `compose()` + the heightmap mesher.
- Ganesha, Buddha, Hamsa, real star maps ("the sky on your birthday"): not drawn yet.
- Credits: the Beer-Lambert preview, cap ring, `--bg`, `--relief-in`, d20 / constellation / spiderweb motifs
  were merged from the parallel `lamps/` generator (commit b66f360).
