# Letzprint3d — production tools

Two generators live here:

* **Tap Studio** (`index.html`, `js/`, `cad/`, `blender/`, `validate/`) — parametric NFC stands, boards and
  tiles with logo embossing, QR tiles, coloured 3MF export and a print-readiness validator. Defaults now
  assume ø25 mm NTAG inlays (38 mm tiles, magnets on a 16 mm ring).
* **Shadow Lamp engine** (`shadowlamp/`) — symbol / photo / text → lithophane and shadow lamps with base,
  cap, backlit preview and production sheet. See [`shadowlamp/README.md`](shadowlamp/README.md).
  (The earlier `lamps/` generator was merged into it on 14 Oct 2026; its history is at commit b66f360.)

---

# Tap Studio — internal 3D production pipeline

An in-house tool, not a shopfront. You pick a product, drop in a customer's
logo, set colours and icons, and it gives you print-ready files plus a
production sheet. It rebuilds the full Tap To Connect range as parametric 3D
models: **Tap Bar 2 / 3 / 4 / QR / Max, Tap Base 2 / 3 / 4, Tap Board 2 / 3 / 4,
Tap Tile, Mini 3D Image Lightbox, and Tap Snap.**

---

## Start here

```bash
# macOS — double-click, or:
./start.command

# anything else
python3 -m http.server 8787
# then open http://localhost:8787/index.html
```

It must be served over `http://`, not opened as a file — browsers block ES
modules loaded from `file://`. First load pulls three.js from unpkg, so you
need a connection once; after that the browser caches it.

---

## The three stages

The pipeline deliberately splits design from production, because the two need
different maths.

```
   ┌─────────────────┐    preset.json     ┌──────────────────┐    STL/STEP   ┌──────────────┐
   │  Browser studio │  logo_contours.json│  CadQuery (cad/) │──────────────▶│  Slicer      │
   │   index.html    │───────────────────▶│  exact B-rep     │               │  / printer   │
   └─────────────────┘                    └──────────────────┘               └──────────────┘
          │                                        │
          │ preview STL / 3MF                      │ *_meta.json
          ▼                                        ▼
   quick test prints                       ┌──────────────────┐
                                           │ Blender (blender/)│ renders, lithophanes
                                           └──────────────────┘
                                                    │
                                           ┌──────────────────┐
                                           │ validate/        │ print-readiness report
                                           └──────────────────┘
```

### 1. Browser studio — design

Instant feedback. Every dimension is a live slider, the logo is traced the
moment you drop it in, and the model rebuilds in one to three seconds.

It builds solids with real CSG (`three-bvh-csg`), which is float-based. On
curved intersections that leaves hairline seams of 0.01–0.05 mm where two
surfaces meet with different tessellations. This is inherent to float booleans —
Blender's boolean modifier produces the same class of seam — and every slicer
closes them silently on import.

The **Weld** checkbox on the Export tab is on by default: it merges duplicate
vertices and drops degenerate triangles, which cuts file size roughly 40% and
takes non-manifold edges to near zero. `mesh-repair.js` also has T-junction
insertion and hole filling, but both are opt-in, because measured across the
full product set each one trades one defect class for another — T-junction
insertion drops boundary edges while pushing non-manifold edges up, and hole
filling reaches zero open edges at the cost of self-touching seam ribbons.
Welding alone always helps, so that is what runs.

Use browser STL for test prints and visual checks. For customer files, go to
stage 2.

### 2. CadQuery — production

```bash
pip install -r cad/requirements.txt
python cad/tap_cad.py acme_tapbar-4.json \
       --contours acme_tapbar-4_logo_contours.json \
       --out out --format all
```

Same parameters, rebuilt in OpenCascade as exact B-rep and tessellated once at
the end. The result is watertight by construction — no repair step, no slicer
warnings, and you also get STEP for anyone who needs real CAD.

The logo arrives as `logo_contours.json`: the browser does the raster → vector
tracing, CadQuery turns those polygons into real faces. The logo never becomes
triangle soup.

### 3. Blender — renders and lithophanes

```bash
# customer proof render
blender --background --python blender/tap_blender.py -- \
        --meta out/tapbar-4_meta.json --stl-dir out \
        --preset acme_tapbar-4.json --render out/renders --frames 8

# lithophane panel for the Lightbox
blender --background --python blender/tap_blender.py -- \
        --lithophane customer_photo.jpg --out out/litho.stl \
        --width 58 --height 58 --min-wall 0.6 --max-wall 2.6
```

### Check before you print

```bash
pip install -r validate/requirements.txt
python validate/check_mesh.py out --meta out/tapbar-4_meta.json
```

Reports watertightness, volume and filament grams, steep overhangs, walls under
your extrusion width, bed fit, and whether the magnet ring actually clears the
NFC antenna pocket.

---

## Working the tool

**Design tab** — drop a logo (PNG, JPG, WEBP or SVG). Fill-only SVGs go through
as true vectors; anything with strokes is rendered at 768 px and traced, which
handles strokes, even-odd fills and clipping uniformly.

The tracer reads the backdrop from the image border and measures every pixel's
distance from it, then normalises against the strongest contrast in the frame.
So a dark mark on white, a dark mark on salmon, white on black and gold on
forest green all trace identically at the same threshold. It reports the
detected background colour and what percentage of the frame became ink — if
that number is above 80% the backdrop has been swallowed into the mark and you
get a slab with the logo cut into it, so the studio says so and tells you what
to change.

The logo is **auto-fitted** to the clear area of whichever face it lands on,
scaled to whichever of width or height binds first and clamped so it stays on
the product. Without that, a square mark at the default 46 mm width overshoots
the strip above the tile row and the emboss hangs off the top edge. Turn it off
in *Dimensions → Logo* if you want deliberate overhang.

**Form** — a Tap Bar is an L: a shallow tray with a near-vertical sign panel on
its back edge, a recessed sign field with a raised border, and the branding
embossed inside that field. Tiles sit **proud** on a shallow seat, standing
about 3.5 mm above the tray, so you lift one straight off. A Tap Base is the
same tray without the panel; a Tap Board is the same language as a wall plate.

**QR tiles encode the real link.** Set a tile to QR, put the destination in its
link field, and the matrix is generated from that URL. It is laid out as a
shallow flat pad rather than relief, because a scannable code does not survive
being printed: a short URL at ECC M is 25–29 modules, which across a 30 mm tile
with its quiet zone works out at 0.7–0.8 mm per module — under two extrusion
lines at a 0.4 mm nozzle, and relief gives no tonal contrast to read anyway.
The pad locates a printed label or UV print, and the studio exports the matrix
as a 2048 px PNG. Force relief with `qrRelief` if you want to try it; the
print check will tell you the module size either way.

**Logo modes**

| Mode | What it does | When |
|---|---|---|
| Embossed | Logo raised off the surface | Matches the branded Tap Bar look |
| Debossed | Logo cut into the surface | Cleanest single-colour print; good for paint fill |
| Multi-colour inlay | Cavity in the body + a matching insert as its own STL | Two-colour prints on AMS/MMU, or press-fit |
| Flat print / UV texture | No geometry change; exports a PNG | When you UV-print rather than print the logo |

**Dimensions tab** — every parameter, grouped. The site publishes no
dimensions, so the defaults are proportion-derived estimates anchored to real
NFC and magnet hardware. Measure one of your actual units, set the values here,
then **Save preset** — that preset becomes your source of truth and drives the
CAD backend too.

**Tiles tab** — icon and destination link per tile, plus per-tile colours. The
links go into the production sheet for whoever programs the NFC inlays.

**Export tab** — individual STLs, a coloured multi-object 3MF that opens in
Bambu/Orca/Prusa with colours already assigned, OBJ, the production sheet, the
preset, the logo PNG, and the logo contours for CadQuery. **Export print pack**
does the lot in one click.

---

## About the icons

Straight answer: the eight social entries — Google, Instagram, WhatsApp,
TikTok, Facebook, LinkedIn, YouTube, Telegram — are hand-drawn approximations
of the real platform marks. Close enough to be recognised on a 30 mm tile, but
they are not official assets and they are not cleared for use. Each of those
platforms publishes brand guidelines covering colour, clear space and permitted
alteration, and a redrawn mark on a product you sell is a decision for you, not
for this tool.

The remaining twelve (menu, booking, wifi, location, phone, email, shop, QR,
loyalty, feedback, website, pay) are generic pictograms with no such constraint.

For anything shipping to a customer, set that tile to **Custom (upload)** and
supply the official artwork.

---

## Hardware, and one thing worth knowing

The defaults assume:

- **NFC:** ø25 mm round NTAG inlay, 0.55 mm thick (stock on hand; 18 mm also supported)
- **Magnets:** 4 × ø4 × 1.5 mm N35, on a 16 mm ring, 38 mm tiles
- **Wall mount:** M3 screws, ø6.4 mm heads

The tag size matters more than it looks. A 30 mm tile physically cannot hold a
25 mm inlay *and* magnets side by side — the magnet ring lands inside the
antenna pocket, and steel or neodymium sitting over an NFC antenna detunes it
badly. With an 18 mm tag the magnets clear the antenna by about 1 mm and the
tile edge by 0.8 mm.

If you already source 25 mm inlays, you have three options: go to a 36 mm tile,
move the magnets into the stand only and use a ferrite-backed on-metal tag, or
switch to a smaller tag. Change `nfcTagDia` on the Dimensions tab and the
validator will tell you immediately whether the geometry still fits.

---

## Suggested print settings

| | |
|---|---|
| Layer height | 0.12 mm (0.08 mm for lithophane panels) |
| Walls | 3 · Top/bottom 5 · Infill 20% gyroid |
| Lithophane | 100% infill, 0 top/bottom, print upright |
| Supports | none needed for any part in the set |
| Orientation | bodies open-side-down, plates and tiles face-down |

Embossed or debossed detail below about 0.24 mm won't resolve at 0.12 mm
layers. The studio warns you when you cross that line.

---

## Layout

```
tap-studio-pipeline/
  index.html              browser studio
  start.command           local server + browser launcher
  js/
    params.js             all 14 products, parameter schema, palette, hardware
    shapes.js             2D shape and face-frame primitives
    geometry.js           the five parametric builders + CSG
    logo.js               raster/SVG tracing, marching squares, glyph set
    mesh-repair.js        weld, T-junction removal, hole filling, topology report
    exporters.js          STL, 3MF, OBJ, contours, production sheet
    app.js                UI, three.js scene, wiring
  cad/tap_cad.py          exact B-rep backend (CadQuery)
  blender/tap_blender.py  renders, lithophanes, mesh repair
  validate/check_mesh.py  print-readiness report
```

---

## Known gaps

- **The CadQuery backend still builds the old wedge.** `cad/tap_cad.py` has not
  been brought across to the L-body, recessed sign field and proud tile seats.
  Until it is, the browser is the only path that produces the correct form.
- **Dimensions are proportion-derived, not measured.** The form now matches the
  photography, but the absolute millimetres are read off images. Callipers on a
  real unit will pin them down; every value is a slider.
- **The lithophane is browser/Blender only.** A heightmap isn't a B-rep
  feature, so CadQuery builds the Lightbox shell and cover but not the panel.
- **Browser STL is preview quality.** See stage 1 above. CadQuery is the
  production path.
- **A square logo gets a small home on the Tap Bar.** With 30 mm tiles at the
  default row position there is roughly 16 mm of clear face above them, so a
  square mark auto-fits to about 15 mm wide. Raise *tile row offset* to push
  the tiles down, or shorten the mark, if you want it larger.
