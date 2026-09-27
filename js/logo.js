// ============================================================================
// Logo + icon pipeline.
//   raster (PNG/JPG/WEBP) -> binary mask -> marching squares -> contours
//                         -> simplify -> nesting -> THREE.Shape[]
//   vector (SVG)          -> SVGLoader -> THREE.Shape[]
// Shapes are then normalised to a target width and extruded by geometry.js.
// ============================================================================
import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';

// ---------------------------------------------------------------------------
// Built-in glyph set.
//
// Be straight about what these are: the social entries are hand-drawn
// approximations of well-known platform marks, close enough to be recognised
// on a 30 mm tile. They are NOT official assets and they are NOT cleared for
// use. Every one of those platforms publishes brand guidelines covering
// colour, clear space and permitted alteration, and using a redrawn mark on a
// product you sell is your call to make, not this tool's.
//
// The functional glyphs (menu, booking, wifi, location, phone, email, shop,
// qr, loyalty, feedback, website, paynow) are generic pictograms with no such
// constraint.
//
// For anything you are shipping to a customer, pick "Custom (upload)" and
// supply the official asset.
// ---------------------------------------------------------------------------
const G = {
  // google-review and facebook are drawn in CANVAS_ICONS below — these two
  // entries are only a fallback if canvas is unavailable.
  'google-review': 'M50 8 L61 38 L93 38 L67 57 L77 88 L50 69 L23 88 L33 57 L7 38 L39 38 Z',
  'instagram':     'M26 14 H74 A12 12 0 0 1 86 26 V74 A12 12 0 0 1 74 86 H26 A12 12 0 0 1 14 74 V26 A12 12 0 0 1 26 14 Z M50 32 A18 18 0 1 0 50 68 A18 18 0 1 0 50 32 Z M72 22 A6 6 0 1 0 72 34 A6 6 0 1 0 72 22 Z',
  'whatsapp':      'M50 12 A38 38 0 0 0 17 69 L12 88 L32 83 A38 38 0 1 0 50 12 Z M38 34 C42 34 43 45 46 50 C49 55 55 59 58 60 C61 61 64 56 66 58 C68 60 72 64 70 67 C68 70 62 72 56 70 C46 67 34 55 31 45 C29 38 32 34 38 34 Z',
  'tiktok':        'M58 10 H70 C71 24 79 32 92 33 V46 C82 46 74 42 70 37 V64 A26 26 0 1 1 44 38 V51 A13 13 0 1 0 58 64 Z',
  'facebook':      'M56 92 V56 H68 L70 42 H56 V33 C56 29 58 26 64 26 H71 V13 C69 13 63 12 57 12 C45 12 40 20 40 32 V42 H28 V56 H40 V92 Z',
  'linkedin':      'M18 38 H34 V88 H18 Z M26 12 A9 9 0 1 0 26 30 A9 9 0 1 0 26 12 Z M44 38 H59 V45 C62 40 68 36 76 36 C88 36 94 44 94 58 V88 H78 V61 C78 54 76 50 70 50 C64 50 60 54 60 62 V88 H44 Z',
  'youtube':       'M12 32 C12 24 18 20 26 20 H74 C82 20 88 24 88 32 V68 C88 76 82 80 74 80 H26 C18 80 12 76 12 68 Z M42 36 L68 50 L42 64 Z',
  'telegram':      'M90 14 L8 46 L32 55 L40 82 L54 66 L74 82 L90 14 Z M38 56 L74 28 L46 62 Z',
  'website':       'M50 8 A42 42 0 1 0 50 92 A42 42 0 1 0 50 8 Z M50 18 C60 30 60 70 50 82 C40 70 40 30 50 18 Z M12 40 H88 M12 60 H88',
  'menu':          'M22 14 H78 A6 6 0 0 1 84 20 V80 A6 6 0 0 1 78 86 H22 A6 6 0 0 1 16 80 V20 A6 6 0 0 1 22 14 Z M30 32 H70 M30 46 H70 M30 60 H58',
  'booking':       'M18 24 H82 A6 6 0 0 1 88 30 V82 A6 6 0 0 1 82 88 H18 A6 6 0 0 1 12 82 V30 A6 6 0 0 1 18 24 Z M12 44 H88 M30 10 V32 M70 10 V32 M32 58 L44 70 L68 50',
  'paynow':        'M50 8 A42 42 0 1 0 50 92 A42 42 0 1 0 50 8 Z M50 22 V78 M36 36 H58 A10 10 0 0 1 58 56 H42 A10 10 0 0 0 42 76 H64',
  'loyalty':       'M50 84 C24 66 12 52 12 38 A22 22 0 0 1 50 24 A22 22 0 0 1 88 38 C88 52 76 66 50 84 Z',
  'feedback':      'M18 16 H82 A8 8 0 0 1 90 24 V64 A8 8 0 0 1 82 72 H44 L24 90 V72 H18 A8 8 0 0 1 10 64 V24 A8 8 0 0 1 18 16 Z M50 28 V50 M50 56 V62',
  'wifi':          'M50 78 A8 8 0 1 0 50 62 A8 8 0 1 0 50 78 Z M28 52 A32 32 0 0 1 72 52 M16 36 A50 50 0 0 1 84 36',
  'location':      'M50 92 C30 66 18 52 18 38 A32 32 0 0 1 82 38 C82 52 70 66 50 92 Z M50 24 A14 14 0 1 0 50 52 A14 14 0 1 0 50 24 Z',
  'phone':         'M30 10 C38 10 40 26 44 33 C48 40 40 44 38 48 C44 60 52 68 64 74 C68 72 72 64 79 68 C86 72 92 76 92 84 C92 90 84 94 76 92 C46 84 18 56 10 26 C8 16 20 10 30 10 Z',
  'email':         'M12 24 H88 A6 6 0 0 1 94 30 V72 A6 6 0 0 1 88 78 H12 A6 6 0 0 1 6 72 V30 A6 6 0 0 1 12 24 Z M8 28 L50 56 L92 28',
  'shop':          'M18 32 H82 L88 88 H12 Z M34 32 V22 A16 16 0 0 1 66 22 V32',
  'qr':            'M14 14 H40 V40 H14 Z M22 22 H32 V32 H22 Z M60 14 H86 V40 H60 Z M68 22 H78 V32 H68 Z M14 60 H40 V86 H14 Z M22 68 H32 V78 H22 Z M52 52 H62 V62 H52 Z M74 52 H86 V62 H74 Z M52 74 H62 V86 H52 Z M74 74 H86 V86 H74 Z'
};

// Which glyphs are drawn as strokes rather than filled outlines.
const STROKED = new Set(['website', 'menu', 'booking', 'paynow', 'wifi', 'feedback', 'email', 'shop', 'youtube']);

/** Build the SVG source for a built-in icon id. */
export function iconSVG(id, strokeWidth = 8) {
  const d = G[id] || G['website'];
  const stroke = STROKED.has(id);
  const style = stroke
    ? `fill="none" stroke="#000" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"`
    : `fill="#000" fill-rule="evenodd"`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="${d}" ${style}/></svg>`;
}

export function iconIds() { return Object.keys(G); }

// ---------------------------------------------------------------------------
// SVG -> shapes
// ---------------------------------------------------------------------------
/**
 * True-vector path: fills only. Crisp, but ignores stroked paths.
 * Most real logos are filled outlines, so this is the default for SVG.
 * If a stroke is detected we fall back to the raster tracer, which handles
 * fills, strokes, even-odd rules and clipping uniformly.
 */
export function svgToShapes(svgText) {
  const loader = new SVGLoader();
  const data = loader.parse(svgText);
  const shapes = [];
  let sawStroke = false;
  for (const path of data.paths) {
    const style = path.userData?.style || {};
    if (style.stroke && style.stroke !== 'none') sawStroke = true;
    if (style.fill && style.fill !== 'none') {
      SVGLoader.createShapes(path).forEach(s => shapes.push(s));
    }
  }
  if (sawStroke || shapes.length === 0) return null; // caller rasterises instead
  shapes.forEach(s => flipShapeY(s));
  return shapes;
}

// ---------------------------------------------------------------------------
// Upscaling
//
// Straight talk about what this does and does not do: it adds pixels, not
// detail. A 225 px source holds a fixed amount of information and resampling
// cannot invent more. What it DOES buy you is real:
//
//   · progressive 2x steps instead of one big jump, which approximates a
//     Lanczos kernel and avoids the blocky artefacts of a single bilinear pull
//   · an unsharp mask afterwards to restore the edge acuity that any
//     interpolation softens
//
// The result is smoother contours and less stair-stepping when the mark is
// printed large. Feature sizes in millimetres are unchanged — if the sub-line
// was below your nozzle floor before, it still is.
// ---------------------------------------------------------------------------
export function upscale(source, targetPx, opts = {}) {
  const sw = source.width, sh = source.height;
  const scale = targetPx / Math.max(sw, sh);
  if (scale <= 1.001) return source;

  // Progressive doubling: each step only ever interpolates between adjacent
  // pixels, which keeps edges cleaner than one large resample.
  let cur = source;
  let cw = sw, ch = sh;
  while (cw * 2 <= targetPx * 1.05) {
    const next = document.createElement('canvas');
    next.width = Math.round(cw * 2);
    next.height = Math.round(ch * 2);
    const c = next.getContext('2d');
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = 'high';
    c.drawImage(cur, 0, 0, next.width, next.height);
    cur = next; cw = next.width; ch = next.height;
  }
  if (cw !== Math.round(sw * scale)) {
    const fin = document.createElement('canvas');
    fin.width = Math.round(sw * scale);
    fin.height = Math.round(sh * scale);
    const c = fin.getContext('2d');
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = 'high';
    c.drawImage(cur, 0, 0, fin.width, fin.height);
    cur = fin;
  }

  const amount = opts.sharpen ?? 0.6;
  return amount > 0 ? unsharp(cur, amount) : cur;
}

/** Unsharp mask: original + amount x (original - blurred). */
function unsharp(cv, amount) {
  const w = cv.width, h = cv.height;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  const src = ctx.getImageData(0, 0, w, h);
  const d = src.data;
  const blur = new Uint8ClampedArray(d);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      for (let c = 0; c < 3; c++) {
        let sum = 0, n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy; if (yy < 0 || yy >= h) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx; if (xx < 0 || xx >= w) continue;
            sum += d[(yy * w + xx) * 4 + c]; n++;
          }
        }
        blur[(y * w + x) * 4 + c] = sum / n;
      }
    }
  }
  for (let i = 0; i < d.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      d[i + c] = Math.max(0, Math.min(255,
        d[i + c] + amount * (d[i + c] - blur[i + c])));
    }
  }
  ctx.putImageData(src, 0, 0);
  return cv;
}

/** Rasterise SVG text to a canvas at `size` px on the long edge. */
export async function rasterizeSVG(svgText, size = 1024) {
  const blob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const im = new Image();
    im.decoding = 'sync';
    await new Promise((res, rej) => {
      im.onload = res; im.onerror = () => rej(new Error('SVG could not be rendered'));
      im.src = url;
    });
    const iw = im.naturalWidth || im.width || size;
    const ih = im.naturalHeight || im.height || size;
    const k = size / Math.max(iw, ih);
    const cv = document.createElement('canvas');
    cv.width = Math.max(8, Math.round(iw * k));
    cv.height = Math.max(8, Math.round(ih * k));
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(im, 0, 0, cv.width, cv.height);
    return cv;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ---------------------------------------------------------------------------
// Icons drawn directly to canvas.
//
// Some marks are geometric constructions rather than outlines, and hand-writing
// their bezier data blind produces something that is merely "a shape" — the
// Google entry was a five-pointed star, which is a rating glyph, not Google.
// Drawing them from their actual construction (arcs, radii, a real typeface)
// gets the proportions right and is far easier to verify.
// ---------------------------------------------------------------------------
const CANVAS_ICONS = {
  /**
   * Google G: a broken ring with a horizontal bar running from the centre out
   * to the right edge. The ring starts where the bar's top edge meets it
   * (asin(barHalf / R) ≈ 10°) and sweeps 300° anticlockwise, leaving the
   * notch below the bar.
   */
  'google-review'(ctx, s) {
    const c = s / 2;
    const R = s * 0.42;
    const r = s * 0.24;              // ~22% of the diameter as stroke width
    const barH = s * 0.155;

    // What separates a G from an e is which side of the bar the aperture sits.
    // On a G the opening is ABOVE the bar: the ring terminates around 1
    // o'clock, the gap runs down to the bar's top edge, and the ring picks up
    // again at the bar's underside and carries on round the bottom. Put the
    // gap below the bar instead and you get a lowercase e, which is what the
    // first attempt drew.
    const aperture = 35 * Math.PI / 180;           // ring terminal, ~1 o'clock
    const sweep = 305 * Math.PI / 180;             // round to the bar's underside

    ctx.fillStyle = '#000';
    ctx.beginPath();
    // Canvas angles run clockwise (y is down); negate to work in maths space.
    ctx.arc(c, c, R, -aperture, -(aperture + sweep), true);
    ctx.arc(c, c, r, -(aperture + sweep), -aperture, false);
    ctx.closePath();
    ctx.fill();

    // Bar from the centre of the mark out to the rim, its lower-right corner
    // landing on the circle rather than poking through it.
    const barW = Math.sqrt(R * R - barH * barH);
    ctx.fillRect(c, c, barW, barH);
  },

  /** Facebook: the f knocked out of a filled disc, as the app badge. */
  facebook(ctx, s) {
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(s / 2, s / 2, s * 0.46, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = '#000';
    ctx.font = `700 ${Math.round(s * 0.90)}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('f', s * 0.53, s * 0.88);
    ctx.restore();
  }
};

/** Shapes for a built-in glyph, traced from a high-res render. */
const _iconCache = new Map();
export async function iconShapes(id, strokeWidth = 8) {
  const key = `${id}:${strokeWidth}`;
  if (_iconCache.has(key)) return _iconCache.get(key);

  let cv;
  if (CANVAS_ICONS[id]) {
    const size = 768;
    cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const c = cv.getContext('2d', { willReadFrequently: true });
    CANVAS_ICONS[id](c, size);
  } else {
    cv = await rasterizeSVG(iconSVG(id, strokeWidth), 768);
  }

  const ctx = cv.getContext('2d', { willReadFrequently: true });
  const shapes = imageToShapes(ctx.getImageData(0, 0, cv.width, cv.height), {
    threshold: 0.5, useAlpha: true, simplify: 0.5, smooth: 1
  });
  _iconCache.set(key, shapes);
  return shapes;
}

/** Preview canvas for an icon — used by the tile picker. */
export async function iconPreview(id, size = 96) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  if (CANVAS_ICONS[id]) { CANVAS_ICONS[id](ctx, size); return cv; }
  const src = await rasterizeSVG(iconSVG(id), size);
  ctx.drawImage(src, 0, 0, size, size);
  return cv;
}

function flipShapeY(shape) {
  const flipPath = (p) => {
    p.curves.forEach(c => {
      ['v0','v1','v2','v3'].forEach(k => { if (c[k]) c[k].y *= -1; });
      if (c.aY !== undefined) { c.aY *= -1; c.aStartAngle *= -1; c.aEndAngle *= -1; c.aClockwise = !c.aClockwise; }
      if (c.points) c.points.forEach(pt => pt.y *= -1);
    });
  };
  flipPath(shape);
  (shape.holes || []).forEach(flipPath);
}

// ---------------------------------------------------------------------------
// Raster -> shapes (marching squares)
// ---------------------------------------------------------------------------

/**
 * @param {ImageData} img
 * @param {object} o  { threshold 0..1, useAlpha, invert, simplify (px), smooth (0..3), maxDim }
 * @returns {THREE.Shape[]}
 */
export function imageToShapes(img, o = {}) {
  const threshold = o.threshold ?? 0.5;
  const useAlpha  = o.useAlpha ?? true;
  const invert    = !!o.invert;
  const simplifyEps = o.simplify ?? 0.6;
  const smooth    = o.smooth ?? 1;

  const w = img.width, h = img.height, d = img.data;
  // Scalar field: 1 = inside the mark.
  const gw = w + 2, gh = h + 2;
  const f = new Float32Array(gw * gh); // padded with 0 so contours always close
  let anyAlpha = false;
  for (let i = 3; i < d.length; i += 4) { if (d[i] < 250) { anyAlpha = true; break; } }
  const alphaMode = useAlpha && anyAlpha;

  // Without alpha, decide what is ink by distance from the *background*
  // rather than by darkness. A fixed "dark = ink" rule turns any logo on a
  // mid-tone or coloured backdrop into one solid rectangle — the whole image
  // reads as ink and you get a slab with the mark engraved into it.
  const bg = alphaMode ? null : estimateBackground(img);

  let maxDist = 0;
  if (!alphaMode) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const dr = d[i] - bg[0], dg = d[i + 1] - bg[1], db = d[i + 2] - bg[2];
        const dist = Math.sqrt((dr * dr + dg * dg + db * db) / 3);
        f[(y + 1) * gw + (x + 1)] = dist;
        if (dist > maxDist) maxDist = dist;
      }
    }
    // Normalise against the strongest contrast present, so a low-contrast pair
    // like gold-on-forest traces at the same threshold as black-on-white.
    const k = maxDist > 4 ? 1 / maxDist : 0;
    for (let i = 0; i < f.length; i++) {
      let v = Math.min(1, f[i] * k);
      if (invert) v = 1 - v;
      f[i] = v;
    }
    // The padding ring must stay outside the mark even after inversion.
    if (invert) {
      for (let x = 0; x < gw; x++) { f[x] = 0; f[(gh - 1) * gw + x] = 0; }
      for (let y = 0; y < gh; y++) { f[y * gw] = 0; f[y * gw + gw - 1] = 0; }
    }
  } else {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let v = d[(y * w + x) * 4 + 3] / 255;
        if (invert) v = 1 - v;
        f[(y + 1) * gw + (x + 1)] = v;
      }
    }
    if (invert) {
      for (let x = 0; x < gw; x++) { f[x] = 0; f[(gh - 1) * gw + x] = 0; }
      for (let y = 0; y < gh; y++) { f[y * gw] = 0; f[y * gw + gw - 1] = 0; }
    }
  }

  // Condition the mask to the printing process before any contouring.
  // opts.mmPerPx tells us how big a pixel is on the finished part, which is
  // the only way to express "0.8 mm" in image space.
  let conditioned = f;
  if (o.minFeatureMM > 0 && o.mmPerPx > 0) {
    const px = o.minFeatureMM / o.mmPerPx;
    conditioned = conditionForPrint(f, gw, gh, {
      closePx: Math.max(0, Math.round(px / 2)),
      thickenPx: Math.max(0, Math.round((px / 2) * (o.thicken ?? 1)))
    });
    for (let i = 0; i < f.length; i++) f[i] = conditioned[i];
  }

  // How much of the frame reads as ink — used to warn when the background
  // has been swallowed into the mark.
  let inkPixels = 0;
  for (let i = 0; i < f.length; i++) if (f[i] > threshold) inkPixels++;
  const coverage = inkPixels / (w * h);

  const shapes = fieldToShapes(f, gw, gh, threshold, { simplify: simplifyEps, smooth });
  shapes.meta = {
    coverage,
    background: alphaMode ? null : `#${bg.map(c => Math.round(c).toString(16).padStart(2, '0')).join('')}`,
    mode: alphaMode ? 'alpha' : 'background-distance'
  };
  return shapes;
}

// ---------------------------------------------------------------------------
// Printability filter
//
// A tracer that faithfully reproduces detail your nozzle cannot lay down is
// not accurate — it is dishonest. It hands the slicer 0.1 mm strokes, the
// slicer drops or smears them, and the print does not match the preview.
//
// This conditions the mask to the process BEFORE tracing:
//   · close    — welds gaps narrower than the nozzle, so gaps that cannot
//                exist in plastic do not appear in the model
//   · thicken  — grows strokes to the minimum printable width instead of
//                letting them vanish, which keeps small lettering legible
//
// The result is a trace of what will actually print. Everything downstream —
// preview, STL, feature report — then agrees with the finished part.
// ---------------------------------------------------------------------------

/** 3×3 max filter, `n` passes ≈ dilation by `n` pixels. */
function dilate(f, w, h, n) {
  let src = f;
  for (let p = 0; p < n; p++) {
    const dst = new Float32Array(src.length);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let m = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy; if (yy < 0 || yy >= h) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx; if (xx < 0 || xx >= w) continue;
            const v = src[yy * w + xx]; if (v > m) m = v;
          }
        }
        dst[y * w + x] = m;
      }
    }
    src = dst;
  }
  return src;
}

/** 3×3 min filter, `n` passes ≈ erosion by `n` pixels. */
function erode(f, w, h, n) {
  let src = f;
  for (let p = 0; p < n; p++) {
    const dst = new Float32Array(src.length);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let m = 1;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy; if (yy < 0 || yy >= h) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx; if (xx < 0 || xx >= w) continue;
            const v = src[yy * w + xx]; if (v < m) m = v;
          }
        }
        dst[y * w + x] = m;
      }
    }
    src = dst;
  }
  return src;
}

/**
 * @param closePx    weld gaps narrower than 2× this
 * @param thickenPx  grow every stroke by this much
 */
export function conditionForPrint(f, w, h, { closePx = 0, thickenPx = 0 } = {}) {
  let out = f;
  if (closePx > 0) out = erode(dilate(out, w, h, closePx), w, h, closePx);
  if (thickenPx > 0) out = dilate(out, w, h, thickenPx);
  return out;
}

/**
 * Scalar field -> nested THREE.Shape[]. Shared by the single-threshold tracer
 * and the colour separator so both produce identical contour quality.
 */
export function fieldToShapes(f, gw, gh, threshold, opts = {}) {
  const eps = opts.simplify ?? 0.4;
  const smooth = opts.smooth ?? 0;
  const loops = marchingSquares(f, gw, gh, threshold);
  let polys = loops
    .map(p => simplify(p, eps))
    .filter(p => p.length >= 3 && Math.abs(area(p)) > 2);
  for (let i = 0; i < smooth; i++) polys = polys.map(chaikin);
  polys = polys.map(p => simplify(p, eps * 0.6));
  return nestToShapes(polys);
}

/** Median colour of the 1 px border — a reliable read of the backdrop. */
export function estimateBackgroundRGB(img) { return estimateBackground(img); }
function estimateBackground(img) {
  const { width: w, height: h, data: d } = img;
  const rs = [], gs = [], bs = [];
  const push = (x, y) => {
    const i = (y * w + x) * 4;
    rs.push(d[i]); gs.push(d[i + 1]); bs.push(d[i + 2]);
  };
  const step = Math.max(1, Math.floor(Math.max(w, h) / 128));
  for (let x = 0; x < w; x += step) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y += step) { push(0, y); push(w - 1, y); }
  const med = a => { a.sort((p, q) => p - q); return a[a.length >> 1] ?? 255; };
  return [med(rs), med(gs), med(bs)];
}

function marchingSquares(f, gw, gh, iso) {
  const segs = [];
  const lerp = (p, q, vp, vq) => {
    const t = (iso - vp) / ((vq - vp) || 1e-9);
    return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
  };
  for (let y = 0; y < gh - 1; y++) {
    for (let x = 0; x < gw - 1; x++) {
      const v0 = f[y * gw + x],           p0 = [x, y];          // TL
      const v1 = f[y * gw + x + 1],       p1 = [x + 1, y];      // TR
      const v2 = f[(y + 1) * gw + x + 1], p2 = [x + 1, y + 1];  // BR
      const v3 = f[(y + 1) * gw + x],     p3 = [x, y + 1];      // BL
      let c = 0;
      if (v0 > iso) c |= 8;
      if (v1 > iso) c |= 4;
      if (v2 > iso) c |= 2;
      if (v3 > iso) c |= 1;
      if (c === 0 || c === 15) continue;
      const T = () => lerp(p0, p1, v0, v1);
      const R = () => lerp(p1, p2, v1, v2);
      const B = () => lerp(p3, p2, v3, v2);
      const L = () => lerp(p0, p3, v0, v3);
      const push = (a, b) => segs.push([a, b]);
      switch (c) {
        case 1:  push(L(), B()); break;
        case 2:  push(B(), R()); break;
        case 3:  push(L(), R()); break;
        case 4:  push(R(), T()); break;
        case 5:  push(L(), T()); push(B(), R()); break;
        case 6:  push(B(), T()); break;
        case 7:  push(L(), T()); break;
        case 8:  push(T(), L()); break;
        case 9:  push(T(), B()); break;
        case 10: push(T(), R()); push(L(), B()); break;
        case 11: push(T(), R()); break;
        case 12: push(R(), L()); break;
        case 13: push(R(), B()); break;
        case 14: push(B(), L()); break;
      }
    }
  }
  return joinSegments(segs);
}

function joinSegments(segs) {
  const key = (p) => `${Math.round(p[0] * 1000)}:${Math.round(p[1] * 1000)}`;
  const start = new Map();
  segs.forEach((s, i) => {
    const k = key(s[0]);
    if (!start.has(k)) start.set(k, []);
    start.get(k).push(i);
  });
  const used = new Array(segs.length).fill(false);
  const loops = [];
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue;
    const loop = [segs[i][0], segs[i][1]];
    used[i] = true;
    let cur = segs[i][1];
    let guard = 0;
    while (guard++ < 200000) {
      const cands = start.get(key(cur));
      if (!cands) break;
      const next = cands.find(j => !used[j]);
      if (next === undefined) break;
      used[next] = true;
      cur = segs[next][1];
      if (key(cur) === key(loop[0])) break;
      loop.push(cur);
    }
    if (loop.length >= 3) loops.push(loop);
  }
  return loops;
}

function area(p) {
  let a = 0;
  for (let i = 0, n = p.length; i < n; i++) {
    const q = p[(i + 1) % n];
    a += p[i][0] * q[1] - q[0] * p[i][1];
  }
  return a / 2;
}

function simplify(pts, eps) {
  if (pts.length < 4 || eps <= 0) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let maxD = 0, idx = -1;
    const [ax, ay] = pts[a], [bx, by] = pts[b];
    const dx = bx - ax, dy = by - ay;
    const len = Math.hypot(dx, dy) || 1e-9;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / len;
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > eps && idx > 0) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

function chaikin(pts) {
  const n = pts.length;
  if (n < 4) return pts;
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
    out.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
  }
  return out;
}

function pointInPoly(pt, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    if ((yi > pt[1]) !== (yj > pt[1]) &&
        pt[0] < ((xj - xi) * (pt[1] - yi)) / ((yj - yi) || 1e-9) + xi) inside = !inside;
  }
  return inside;
}

/** Classify loops into outer contours and their holes by containment depth. */
function nestToShapes(polys) {
  const info = polys.map(p => ({ p, a: Math.abs(area(p)), depth: 0 }));
  for (let i = 0; i < info.length; i++) {
    for (let j = 0; j < info.length; j++) {
      if (i === j) continue;
      if (info[j].a > info[i].a && pointInPoly(info[i].p[0], info[j].p)) info[i].depth++;
    }
  }
  const shapes = [];
  const outers = info.filter(o => o.depth % 2 === 0).sort((a, b) => b.a - a.a);
  const holes  = info.filter(o => o.depth % 2 === 1);
  for (const o of outers) {
    const s = new THREE.Shape(o.p.map(([x, y]) => new THREE.Vector2(x, -y))); // flip Y for 3D
    for (const hle of holes) {
      if (hle.used) continue;
      if (pointInPoly(hle.p[0], o.p)) {
        // Only attach to the tightest containing outer.
        const tighter = outers.some(o2 => o2 !== o && o2.a < o.a && pointInPoly(hle.p[0], o2.p));
        if (tighter) continue;
        hle.used = true;
        s.holes.push(new THREE.Path(hle.p.map(([x, y]) => new THREE.Vector2(x, -y))));
      }
    }
    shapes.push(s);
  }
  return shapes;
}

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------
/** Bounding box of a shape list. */
export function shapesBounds(shapes) {
  const box = new THREE.Box2(
    new THREE.Vector2(Infinity, Infinity),
    new THREE.Vector2(-Infinity, -Infinity)
  );
  shapes.forEach(s => {
    s.getPoints(48).forEach(p => box.expandByPoint(p));
    (s.holes || []).forEach(h => h.getPoints(48).forEach(p => box.expandByPoint(p)));
  });
  return box;
}

/**
 * Load a File (svg/png/jpg/webp) into shapes.
 * SVG takes the vector path when it is fill-only, otherwise it is rasterised.
 */
export async function loadArtwork(file, opts = {}) {
  const isSVG = /svg/i.test(file.type) || /\.svg$/i.test(file.name);
  const maxDim = opts.maxDim ?? 768;

  if (isSVG) {
    const text = await file.text();
    let shapes = null;
    try { shapes = svgToShapes(text); } catch { shapes = null; }
    if (shapes && shapes.length) {
      const cv = await rasterizeSVG(text, 320).catch(() => null);
      return { shapes, source: 'svg-vector', raster: cv, meta: shapes.meta || null };
    }
    const cv = await rasterizeSVG(text, maxDim);
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    const tracedSVG = imageToShapes(ctx.getImageData(0, 0, cv.width, cv.height), opts);
    return { shapes: tracedSVG, source: 'svg-traced', raster: cv, meta: tracedSVG.meta || null };
  }

  const bmp = await createImageBitmap(file);
  const sourcePx = { w: bmp.width, h: bmp.height };

  let cv = document.createElement('canvas');
  cv.width = bmp.width; cv.height = bmp.height;
  cv.getContext('2d').drawImage(bmp, 0, 0);

  // Upscale first if asked, so everything downstream sees the larger canvas.
  let upscaled = null;
  if (opts.upscaleTo && opts.upscaleTo > Math.max(bmp.width, bmp.height)) {
    cv = upscale(cv, opts.upscaleTo, { sharpen: opts.sharpen ?? 0.6 });
    upscaled = { w: cv.width, h: cv.height };
  }

  const scale = Math.min(1, maxDim / Math.max(cv.width, cv.height));
  const cw = Math.max(8, Math.round(cv.width * scale));
  const ch = Math.max(8, Math.round(cv.height * scale));
  const work = document.createElement('canvas');
  work.width = cw; work.height = ch;
  const ctx = work.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(cv, 0, 0, cw, ch);
  cv = work;
  const traced = imageToShapes(ctx.getImageData(0, 0, cw, ch), opts);
  return { shapes: traced, source: 'raster', raster: cv, sourcePx, upscaled,
           meta: traced.meta || null };
}
