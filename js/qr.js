// ============================================================================
// QR code -> printable geometry.
//
// The "QR" tile used to be just another pictogram — a drawing of a QR code,
// which scans as nothing. This encodes the tile's actual destination link into
// a real, scannable matrix and turns the dark modules into solid geometry.
//
// Uses qrcode-generator, loaded as a UMD global from index.html.
// ============================================================================
import * as THREE from 'three';

/** Error-correction levels, worst-to-best redundancy. */
export const ECC = ['L', 'M', 'Q', 'H'];

function lib() {
  const q = globalThis.qrcode;
  if (typeof q !== 'function') {
    throw new Error('QR encoder not loaded — check the qrcode-generator script tag in index.html');
  }
  return q;
}

/**
 * Encode `text` and return the module matrix.
 * @returns {{count:number, dark:(r:number,c:number)=>boolean, version:number}}
 */
export function encode(text, ecc = 'M') {
  const qrcode = lib();
  const src = String(text || '').trim();
  if (!src) throw new Error('nothing to encode — set the tile\'s destination link first');

  // typeNumber 0 asks the library to pick the smallest version that fits.
  const qr = qrcode(0, ECC.includes(ecc) ? ecc : 'M');
  qr.addData(src);
  qr.make();
  const count = qr.getModuleCount();
  return { count, dark: (r, c) => qr.isDark(r, c), version: (count - 17) / 4 };
}

/**
 * Build QR geometry sized to fill `sizeMM` including the quiet zone.
 *
 * Adjacent dark modules are merged into horizontal runs before being turned
 * into rectangles. A 29-module code has ~420 dark modules; as individual
 * squares that is 420 separate solids for the boolean engine to chew through,
 * and run-merging typically cuts it to under 120 while producing exactly the
 * same silhouette.
 *
 * @returns {{shapes:THREE.Shape[], moduleMM:number, count:number, version:number}}
 */
export function qrShapes(text, sizeMM, opts = {}) {
  const ecc = opts.ecc || 'M';
  const quiet = opts.quietZone ?? 4;          // spec minimum is 4 modules
  const { count, dark, version } = encode(text, ecc);

  const total = count + quiet * 2;
  const m = sizeMM / total;                    // millimetres per module
  const half = sizeMM / 2;

  // Nudge each run outward so neighbouring runs fuse instead of hairline-touching.
  const bleed = (opts.bleed ?? 0.02) * m;

  const shapes = [];
  for (let r = 0; r < count; r++) {
    let c = 0;
    while (c < count) {
      if (!dark(r, c)) { c++; continue; }
      let end = c;
      while (end + 1 < count && dark(r, end + 1)) end++;
      const x0 = (quiet + c) * m - half - bleed;
      const x1 = (quiet + end + 1) * m - half + bleed;
      // Matrix rows run top-down; flip Y so the code is upright in 3D.
      const y1 = half - (quiet + r) * m + bleed;
      const y0 = half - (quiet + r + 1) * m - bleed;
      const s = new THREE.Shape();
      s.moveTo(x0, y0); s.lineTo(x1, y0); s.lineTo(x1, y1); s.lineTo(x0, y1); s.closePath();
      shapes.push(s);
      c = end + 1;
    }
  }

  return { shapes, moduleMM: m, count, version, quiet, ecc };
}

/**
 * Print sanity check. A QR only scans if the printer can actually resolve a
 * module and the two levels read as different tones.
 */
export function qrPrintCheck(moduleMM, nozzle = 0.4) {
  const notes = [];
  const linesPerModule = moduleMM / nozzle;
  if (linesPerModule < 2) {
    notes.push({
      level: 'error',
      text: `Each module is only ${moduleMM.toFixed(2)} mm — under two extrusion lines at a ` +
            `${nozzle} mm nozzle. It will not scan. Use a shorter link, a bigger tile, or ` +
            `error correction L.`
    });
  } else if (linesPerModule < 3) {
    notes.push({
      level: 'warn',
      text: `Modules are ${moduleMM.toFixed(2)} mm (${linesPerModule.toFixed(1)} lines). ` +
            `Scannable, but print it in two colours — a single-colour relief QR reads poorly.`
    });
  }
  return notes;
}

/** Draw the code to a canvas — used for the preview swatch and UV print files. */
export function qrCanvas(text, px = 512, opts = {}) {
  const quiet = opts.quietZone ?? 4;
  const { count, dark } = encode(text, opts.ecc || 'M');
  const total = count + quiet * 2;
  const scale = Math.max(1, Math.floor(px / total));
  const cv = document.createElement('canvas');
  cv.width = cv.height = total * scale;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = opts.light || '#ffffff';
  ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.fillStyle = opts.dark || '#000000';
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (dark(r, c)) ctx.fillRect((quiet + c) * scale, (quiet + r) * scale, scale, scale);
    }
  }
  return cv;
}
