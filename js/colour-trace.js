// ============================================================================
// Colour-separated tracing.
//
// The single-threshold tracer cannot represent a logo like the Bhimas
// medallion, and no amount of slider tweaking will fix that. It asks one
// question per pixel — "is this ink?" — and collapses an orange scalloped
// border, a green ring, a yellow field, a brown pot and white lettering into
// a single silhouette. Detail inside the mark is not degraded, it is
// structurally absent.
//
// This separates the artwork into its actual colours first, then traces each
// one on its own. You get one closed region set per colour, coplanar and
// disjoint, which is exactly what a multi-material printer wants: same flat
// plate, one filament per layer.
// ============================================================================
import { fieldToShapes, estimateBackgroundRGB } from './logo.js';

/**
 * Median-cut quantisation. Chosen over k-means because it is deterministic —
 * the same artwork gives the same separation every time, which matters when a
 * customer re-orders and the parts have to match the first run.
 */
function medianCut(pixels, k) {
  let boxes = [pixels];
  while (boxes.length < k) {
    // Split the box with the largest spread on its widest channel.
    let bi = -1, bestRange = -1, bestCh = 0;
    boxes.forEach((box, i) => {
      if (box.length < 2) return;
      for (let ch = 0; ch < 3; ch++) {
        let lo = 255, hi = 0;
        for (const p of box) { const v = p[ch]; if (v < lo) lo = v; if (v > hi) hi = v; }
        const range = hi - lo;
        if (range > bestRange) { bestRange = range; bi = i; bestCh = ch; }
      }
    });
    if (bi < 0 || bestRange <= 0) break;
    const box = boxes[bi];
    box.sort((a, b) => a[bestCh] - b[bestCh]);
    const mid = box.length >> 1;
    boxes.splice(bi, 1, box.slice(0, mid), box.slice(mid));
  }
  return boxes.filter(b => b.length).map(box => {
    let r = 0, g = 0, b = 0;
    for (const p of box) { r += p[0]; g += p[1]; b += p[2]; }
    const n = box.length;
    return [r / n, g / n, b / n];
  });
}

const dist2 = (a, br, bg, bb) =>
  (a[0] - br) ** 2 + (a[1] - bg) ** 2 + (a[2] - bb) ** 2;

const toHex = (c) =>
  '#' + c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');

/** Small box blur so binary masks trace as smooth edges, not 45° staircases. */
function blur(f, w, h, passes = 1) {
  let src = f;
  for (let p = 0; p < passes; p++) {
    const dst = new Float32Array(src.length);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let sum = 0, n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy; if (yy < 0 || yy >= h) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx; if (xx < 0 || xx >= w) continue;
            sum += src[yy * w + xx]; n++;
          }
        }
        dst[y * w + x] = sum / n;
      }
    }
    src = dst;
  }
  return src;
}

/**
 * @param {ImageData} img
 * @param {object} o  { colours, simplify, smooth, minAreaFrac, mergeBackground }
 * @returns {{layers: Array, background: string, palette: string[]}}
 *   Each layer: { hex, shapes, areaFrac, pixels }
 */
export function traceLayers(img, o = {}) {
  const k = Math.max(2, Math.min(8, Math.round(o.colours ?? 5)));
  const minAreaFrac = o.minAreaFrac ?? 0.004;
  const w = img.width, h = img.height, d = img.data;

  // Sample for quantisation — every pixel is unnecessary and slow.
  const step = Math.max(1, Math.floor(Math.sqrt((w * h) / 24000)));
  const sample = [];
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const i = (y * w + x) * 4;
      if (d[i + 3] < 128) continue;                 // ignore transparent
      sample.push([d[i], d[i + 1], d[i + 2]]);
    }
  }
  if (!sample.length) return { layers: [], background: '#ffffff', palette: [] };

  // Quantise including the background, then drop whichever cluster is the
  // background — otherwise the paper becomes a printed layer.
  const palette = medianCut(sample, k + 1);
  const bg = estimateBackgroundRGB(img);
  let bgIdx = 0, bgBest = Infinity;
  palette.forEach((c, i) => {
    const dd = dist2(c, bg[0], bg[1], bg[2]);
    if (dd < bgBest) { bgBest = dd; bgIdx = i; }
  });

  // Assign every pixel to its nearest palette entry.
  const gw = w + 2, gh = h + 2;
  const masks = palette.map(() => new Float32Array(gw * gh));
  const counts = new Array(palette.length).fill(0);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (d[i + 3] < 128) continue;
      let best = 0, bd = Infinity;
      for (let c = 0; c < palette.length; c++) {
        const dd = dist2(palette[c], d[i], d[i + 1], d[i + 2]);
        if (dd < bd) { bd = dd; best = c; }
      }
      masks[best][(y + 1) * gw + (x + 1)] = 1;
      counts[best]++;
    }
  }

  const total = w * h;
  const layers = [];
  for (let c = 0; c < palette.length; c++) {
    if (c === bgIdx && o.mergeBackground !== false) continue;
    const areaFrac = counts[c] / total;
    if (areaFrac < minAreaFrac) continue;
    const field = blur(masks[c], gw, gh, o.smoothMask ?? 1);
    const shapes = fieldToShapes(field, gw, gh, 0.5, {
      simplify: o.simplify ?? 0.4,
      smooth: o.smooth ?? 0
    });
    if (!shapes.length) continue;
    layers.push({ hex: toHex(palette[c]), shapes, areaFrac, pixels: counts[c] });
  }

  layers.sort((a, b) => b.areaFrac - a.areaFrac);
  return { layers, background: toHex(bg), palette: palette.map(toHex) };
}

/**
 * Smallest printable feature in a traced layer, in millimetres, once the
 * artwork is scaled to `widthMM`.
 *
 * Estimated as area / perimeter × 2 per contour — the width of the equivalent
 * strip. Crude, but it reliably catches hairlines and 1 mm lettering, which is
 * what actually kills a print.
 */
export function minFeatureMM(shapes, widthMM) {
  let minX = Infinity, maxX = -Infinity;
  const metrics = [];
  for (const s of shapes) {
    const pts = s.getPoints(64);
    let area = 0, per = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      area += a.x * b.y - b.x * a.y;
      per += Math.hypot(b.x - a.x, b.y - a.y);
      if (a.x < minX) minX = a.x;
      if (a.x > maxX) maxX = a.x;
    }
    area = Math.abs(area) / 2;
    if (per > 0 && area > 0) metrics.push((2 * area) / per);
  }
  const spanPx = maxX - minX;
  if (!metrics.length || !(spanPx > 0)) return null;
  const scale = widthMM / spanPx;
  return { minMM: Math.min(...metrics) * scale, medianMM: median(metrics) * scale };
}

function median(a) {
  const s = [...a].sort((x, y) => x - y);
  return s[s.length >> 1];
}

/**
 * Print verdict for a traced layer set.
 * The rule of thumb that matters: a feature narrower than two extrusion
 * widths will not print as a distinct shape.
 */
export function featureCheck(shapes, widthMM, nozzle = 0.4) {
  const m = minFeatureMM(shapes, widthMM);
  if (!m) return [];
  const floor = nozzle * 2;
  const notes = [];
  if (m.minMM < floor) {
    notes.push({
      level: 'error',
      text: `Finest detail is ${m.minMM.toFixed(2)} mm at ${widthMM.toFixed(0)} mm wide — ` +
            `below the ${floor.toFixed(1)} mm floor for a ${nozzle} mm nozzle. ` +
            `Scale to about ${(widthMM * floor / m.minMM).toFixed(0)} mm, simplify the ` +
            `artwork, or print it flat instead of as relief.`
    });
  } else if (m.minMM < floor * 1.5) {
    notes.push({
      level: 'warn',
      text: `Finest detail is ${m.minMM.toFixed(2)} mm — printable but fragile. ` +
            `Consider ${(widthMM * 1.4).toFixed(0)} mm or a 0.2 mm nozzle.`
    });
  }
  return notes;
}
