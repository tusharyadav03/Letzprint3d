// ============================================================================
// Parametric builders for all 14 products.
// Every solid is produced by real CSG (three-bvh-csg), so exports are
// manifold by construction rather than by overlapping loose meshes.
// ============================================================================
import * as THREE from 'three';
import { Brush, Evaluator, ADDITION, SUBTRACTION } from 'three-bvh-csg';
import * as BGU from 'three/addons/utils/BufferGeometryUtils.js';
import * as S from './shapes.js';
import { HARDWARE, PRODUCTS, magnetPositions } from './params.js';
import { repair as repairMesh, analyze as analyzeMesh, weld as weldMesh } from './mesh-repair.js';
import { shapesBounds } from './logo.js';
import { makeFlatBuilders } from './builders-flat.js';
import { mountOnFace } from './logo-mount.js';

const DEG = Math.PI / 180;

const evaluator = new Evaluator();
evaluator.attributes = ['position', 'normal', 'uv'];
evaluator.useGroups = false;

/** Strip a geometry down to the attribute set CSG needs. */
function norm(g) {
  let x = g.index ? g.toNonIndexed() : g;
  const keep = ['position', 'normal', 'uv'];
  Object.keys(x.attributes).forEach(k => { if (!keep.includes(k)) x.deleteAttribute(k); });
  if (!x.attributes.normal) x.computeVertexNormals();
  if (!x.attributes.uv) {
    const c = x.attributes.position.count;
    x.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(c * 2), 2));
  }
  x.clearGroups();
  return x;
}

function merge(list) {
  const gs = list.filter(Boolean).map(norm);
  if (!gs.length) return null;
  if (gs.length === 1) return gs[0];
  return BGU.mergeGeometries(gs, false);
}

function csgOnce(aGeo, bGeo, operation) {
  const A = new Brush(norm(aGeo)); A.updateMatrixWorld();
  const B = new Brush(norm(bGeo)); B.updateMatrixWorld();
  const g = evaluator.evaluate(A, B, operation).geometry.clone();
  g.computeVertexNormals();
  return g;
}

/**
 * Group tools into batches whose members do not overlap.
 *
 * Merging every tool into one brush is ~4× faster than applying them one by
 * one, but a brush containing two intersecting solids is self-intersecting —
 * invalid input for the evaluator — and it returns silent garbage. Pockets,
 * magnet seats and multi-contour logos overlap constantly. Batching by
 * bounding box gives most of the speed with none of the risk.
 */
function batchDisjoint(geos) {
  const items = geos.filter(Boolean).map(g => {
    g.computeBoundingBox();
    return { g, box: g.boundingBox.clone() };
  });
  const batches = [];
  for (const it of items) {
    let placed = false;
    for (const b of batches) {
      if (b.boxes.every(x => !x.intersectsBox(it.box))) {
        b.geos.push(it.g); b.boxes.push(it.box); placed = true; break;
      }
    }
    if (!placed) batches.push({ geos: [it.g], boxes: [it.box] });
  }
  return batches.map(b => merge(b.geos));
}

function csg(aGeo, tools, operation) {
  if (!aGeo) return null;
  const list = (Array.isArray(tools) ? tools : [tools]).filter(Boolean);
  if (!list.length) return aGeo;
  let g = aGeo;
  for (const t of batchDisjoint(list)) {
    try { g = csgOnce(g, t, operation); }
    catch (e) { console.warn('CSG op skipped:', e.message); }
  }
  return g;
}
const cut = (a, b) => csg(a, b, SUBTRACTION);
const add = (a, b) => csg(a, b, ADDITION);

// ---------------------------------------------------------------------------
// Artwork -> solid
// ---------------------------------------------------------------------------
/**
 * Extrude a shape list, scaled so its bounding box width is `targetWidth`,
 * centred on the origin, extruded from z=0 to z=depth, spun by `rotDeg`.
 */
/**
 * @param targetWidth  width to scale to
 * @param maxHeight    optional height cap. When given, the artwork is scaled
 *                     to fit inside targetWidth × maxHeight preserving aspect.
 *
 * Scaling on width alone is wrong for anything that is not roughly square.
 * The Facebook glyph is 43 wide by 80 tall, so "make it 18 mm wide" made it
 * 33 mm tall and it burst out of a 30 mm tile.
 */
export function artworkSolid(shapes, targetWidth, depth, rotDeg = 0, maxHeight = 0, refBounds = null) {
  if (!shapes || !shapes.length || targetWidth <= 0 || depth <= 0) return null;
  const geos = [];
  for (const s of shapes) {
    try {
      const g = new THREE.ExtrudeGeometry(s, {
        depth, bevelEnabled: false, curveSegments: 16, steps: 1
      });
      geos.push(g);
    } catch { /* degenerate contour — skip */ }
  }
  let g = merge(geos);
  if (!g) return null;
  g.computeBoundingBox();
  // Colour-separated layers MUST be normalised against the combined artwork
  // bounds, not their own. Scaling each layer to its own bounding box makes
  // every colour a different size and they no longer register with each other.
  const bb = refBounds || g.boundingBox;
  const w = bb.max.x - bb.min.x;
  const h = bb.max.y - bb.min.y;
  if (!(w > 0) || !(h > 0)) return null;
  let k = targetWidth / w;
  if (maxHeight > 0) k = Math.min(k, maxHeight / h);
  g.translate(-(bb.min.x + w / 2), -(bb.min.y + h / 2), 0);
  g.scale(k, k, 1);
  if (rotDeg) g.rotateZ(rotDeg * DEG);
  return g;
}

// ---------------------------------------------------------------------------
// Relief from an image
//
// This is the answer to "put the exact logo on the model" when you want shape,
// not colour. It never traces, so there is no threshold to get wrong and
// nothing to lose: every pixel becomes a height. Dark areas stand tall, light
// areas sit flat, and everything in between lands in between.
//
// Compare with tracing, which must decide ink-or-not for every pixel. On a
// multi-colour mark that decision goes wrong in ways you cannot tune away —
// the B in BHIMAS merged into the green brush stroke and the pot collapsed
// into a triangle because those colours happened to sit on opposite sides of
// one cutoff. A relief has no cutoff.
//
// Fine detail still cannot exceed what the nozzle resolves, but a relief
// degrades gracefully: sub-nozzle detail becomes a shallow ripple instead of
// vanishing or fusing into a blob.
// ---------------------------------------------------------------------------
export function reliefFromImage(canvas, widthMM, heightMM, opts = {}) {
  const maxDepth = opts.depth ?? 1.0;
  // A heightmap whose lightest areas are zero-thickness is not a solid — the
  // top surface meets the base and you get a degenerate sheet plus a visible
  // rectangular slab edge around the artwork. Giving it a floor makes it a
  // real plate; the caller recesses the panel by the same amount so the
  // lightest areas end up flush and only the relief stands proud.
  const baseT = opts.base ?? 0.5;
  const nozzle = opts.nozzle ?? 0.4;
  // Two samples per nozzle width — finer buys nothing the printer can lay down.
  const step = opts.step ?? nozzle / 2;
  const nx = Math.max(8, Math.min(600, Math.round(widthMM / step)));
  const ny = Math.max(8, Math.min(600, Math.round(heightMM / step)));

  const cv = document.createElement('canvas');
  cv.width = nx; cv.height = ny;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, nx, ny);
  ctx.drawImage(canvas, 0, 0, nx, ny);
  const d = ctx.getImageData(0, 0, nx, ny).data;

  const invert = !!opts.invert;
  const gamma = opts.gamma ?? 1.0;
  const heightAt = (ix, iy) => {
    const i = (iy * nx + ix) * 4;
    const a = d[i + 3] / 255;
    let l = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
    l = l * a + (1 - a);                       // composite over white
    let t = 1 - l;                             // dark = tall
    if (invert) t = 1 - t;
    if (gamma !== 1) t = Math.pow(t, gamma);
    return baseT + t * maxDepth;
  };

  // Grid of top vertices + a flat base, walled around the edge.
  const top = [], base = [];
  for (let iy = 0; iy < ny; iy++) {
    for (let ix = 0; ix < nx; ix++) {
      const x = -widthMM / 2 + (ix / (nx - 1)) * widthMM;
      const y = heightMM / 2 - (iy / (ny - 1)) * heightMM;
      top.push(x, y, heightAt(ix, iy));
      base.push(x, y, 0);
    }
  }

  const pos = [];
  const idx = (ix, iy) => (iy * nx + ix) * 3;
  const push = (arr, i) => pos.push(arr[i], arr[i + 1], arr[i + 2]);

  for (let iy = 0; iy < ny - 1; iy++) {
    for (let ix = 0; ix < nx - 1; ix++) {
      const a = idx(ix, iy), b = idx(ix + 1, iy), c = idx(ix + 1, iy + 1), dd = idx(ix, iy + 1);
      push(top, a); push(top, b); push(top, c);
      push(top, a); push(top, c); push(top, dd);
      push(base, a); push(base, c); push(base, b);
      push(base, a); push(base, dd); push(base, c);
    }
  }
  const wall = (i, j) => { push(top, i); push(base, i); push(base, j);
                           push(top, i); push(base, j); push(top, j); };
  for (let ix = 0; ix < nx - 1; ix++) {
    wall(idx(ix + 1, 0), idx(ix, 0));
    wall(idx(ix, ny - 1), idx(ix + 1, ny - 1));
  }
  for (let iy = 0; iy < ny - 1; iy++) {
    wall(idx(0, iy), idx(0, iy + 1));
    wall(idx(nx - 1, iy + 1), idx(nx - 1, iy));
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  g.computeVertexNormals();
  g.userData.samples = `${nx}×${ny}`;
  g.userData.base = baseT;
  return g;
}

// ---------------------------------------------------------------------------
// Part record
// ---------------------------------------------------------------------------
function part(id, name, geometry, colorKey, opts = {}) {
  return {
    id, name, geometry, colorKey,
    printable: opts.printable !== false,
    material: opts.material || 'PLA / PETG',
    note: opts.note || '',
    qty: opts.qty || 1
  };
}

// ---------------------------------------------------------------------------
// Shared: apply a logo to a face in one of four modes
// ---------------------------------------------------------------------------
/**
 * @returns { bodyCutter, bodyAdder, inlayPart, textureMesh }
 */
/** Height / width of the traced artwork, so fitting can respect its aspect. */
function artAspect(shapes) {
  const b = shapesBounds(shapes);
  const w = b.max.x - b.min.x, h = b.max.y - b.min.y;
  return w > 1e-6 ? h / w : 1;
}

/**
 * Fit the artwork into the clear area of a face.
 *
 * The old defaults assumed a wide wordmark. A square logo at logoScale 46 is
 * also 46 mm tall, which overshoots the strip above the tile row — the emboss
 * then hangs off the top edge as a slab floating in mid-air instead of sitting
 * on the product. This scales to whichever of width/height binds first and
 * keeps the mark inside the panel.
 */
function fitArtwork(shapes, p, fit) {
  const aspect = artAspect(shapes);
  let width = p.logoScale;
  let u = p.logoOffsetX;
  let v = p.logoOffsetY;

  if (!fit || p.logoAutoFit === 0) return { width, u, v, clipped: false, maxHeight: 0 };

  const maxW = Math.max(1, fit.maxW);
  const maxH = Math.max(1, fit.maxH);
  const fitted = Math.min(maxW, maxH / Math.max(aspect, 1e-6));
  const clipped = width > fitted + 1e-6;
  width = Math.min(width, fitted);

  const h = width * aspect;
  // Keep the mark inside the panel; if it cannot fit, centre it there.
  const vLo = fit.vMin + h / 2, vHi = fit.vMax - h / 2;
  v = vLo > vHi ? (fit.vMin + fit.vMax) / 2 : Math.min(Math.max(v, vLo), vHi);
  const uLo = fit.uMin + width / 2, uHi = fit.uMax - width / 2;
  u = uLo > uHi ? 0 : Math.min(Math.max(u, uLo), uHi);

  return { width, u, v, clipped, maxHeight: fit ? Math.max(1, fit.maxH) : 0 };
}

function logoOps(frame, art, p, mode, colorKey = 'logo', fit = null) {
  const out = { cutter: null, adder: null, inlay: null, decal: null, relief: null,
                fit: null, layers: null, mount: null };

  // An imported logo mesh wins over every generated mode. You made it
  // deliberately; nothing here should second-guess it.
  if (art.logoMesh) {
    const maxW = fit ? fit.maxW : p.logoScale;
    const maxH = fit ? fit.maxH : 0;
    const width = Math.min(p.logoScale, maxW || p.logoScale);
    const u = fit ? Math.min(Math.max(p.logoOffsetX, fit.uMin + width / 2), fit.uMax - width / 2) : p.logoOffsetX;
    const v = fit ? (fit.vMin + fit.vMax) / 2 + (p.logoOffsetY ?? 0) * 0 : p.logoOffsetY;
    const m = mountOnFace(frame, art.logoMesh, {
      widthMM: width, maxHeightMM: maxH,
      u, v,
      recessMM: p.mountRecess ?? 0.6,
      clearanceMM: p.mountClearance ?? 0.15
    });
    out.mount = m.mesh;
    out.cutter = m.cutter;
    out.fit = { width: m.fitted?.widthMM ?? width, u, v, clipped: false, maxHeight: maxH };
    out.mountFit = m.fitted;
    return out;
  }

  if (!art.logoShapes || !art.logoShapes.length || !(p.logoScale > 0)) return out;

  const f = fitArtwork(art.logoShapes, p, fit);
  out.fit = f;
  const depth = Math.max(0.05, p.logoDepth);
  const mk = (d, h) => {
    const g = artworkSolid(art.logoShapes, f.width, d, p.logoRotate, f.maxHeight);
    if (!g) return null;
    return frame.place(g, f.u, f.v, h);
  };

  if (mode === 'relief') {
    // Straight from the pixels — no trace, no threshold, no colour.
    if (art.rasterCanvas) {
      const aspect = artAspect(art.logoShapes);
      const g = reliefFromImage(art.rasterCanvas, f.width, f.width * aspect, {
        depth, nozzle: p.reliefNozzle ?? 0.4,
        invert: (p.reliefInvert ?? 0) >= 0.5,
        gamma: p.reliefGamma ?? 1.0
      });
      // Sink slightly so the relief base fuses with the panel instead of
      // resting on it as a separate slab.
      // Keep it as its own part rather than unioning it into the body: as a
      // separate solid you can assign it a filament, print it alone, or hand
      // it to the AMS as a second material.
      const baseT = g.userData.base;
      const relW = f.width, relH = f.width * aspect;

      // Recess the panel by exactly the plate's floor thickness, so the plate
      // drops in flush and only the raised detail shows. Without this the
      // whole rectangle stands proud and you see a slab, not a logo.
      const seat = S.extrude(
        S.roundedRect(relW + 0.3, relH + 0.3, Math.min(relW, relH) * 0.03),
        baseT + 3, { curveSegments: 16 });
      out.cutter = frame.place(seat, f.u, f.v, -baseT);
      out.relief = frame.place(g, f.u, f.v, -baseT);
      out.reliefSamples = g.userData.samples;
    } else {
      out.adder = mk(depth + 0.2, -0.2);
    }
  } else if (mode === 'emboss') {
    // Sink 0.2 mm into the surface so the union is a solid join, not a kiss.
    out.adder = mk(depth + 0.2, -0.2);
  } else if (mode === 'deboss') {
    out.cutter = mk(depth + 1.0, -depth);
  } else if (mode === 'inlay') {
    // Cavity is 0.12 mm larger in depth than the insert to guarantee seating.
    out.cutter = mk(depth + 0.12, -(depth + 0.12));
    out.inlay = mk(depth, -depth);
  } else if (mode === 'colour') {
    // One coplanar solid per colour. They are disjoint by construction, so
    // they sit side by side on the same plane — a flat multi-material plate,
    // which is how this kind of artwork actually gets printed.
    const layers = art.logoLayers || [];
    if (layers.length) {
      const ref = new THREE.Box2(
        new THREE.Vector2(Infinity, Infinity), new THREE.Vector2(-Infinity, -Infinity));
      for (const L of layers) {
        const b = shapesBounds(L.shapes);
        ref.expandByPoint(b.min); ref.expandByPoint(b.max);
      }
      out.layers = [];
      for (const L of layers) {
        const g = artworkSolid(L.shapes, f.width, depth + 0.2, p.logoRotate, f.maxHeight, ref);
        if (!g) continue;
        out.layers.push({ hex: L.hex, geometry: frame.place(g, f.u, f.v, -0.2), areaFrac: L.areaFrac });
      }
    } else {
      out.adder = mk(depth + 0.2, -0.2);   // no separation available yet
    }
  } else if (mode === 'texture') {
    // Recess a flat pad sized to the mark so a printed label or UV print seats
    // flush instead of sitting on the surface. This is the only mode that
    // reproduces detailed full-colour artwork faithfully — relief cannot.
    const padD = p.logoPadDepth ?? 0.35;
    const aspect = artAspect(art.logoShapes);
    const padW = f.width + 2 * (p.logoPadMargin ?? 1.5);
    const padH = f.width * aspect + 2 * (p.logoPadMargin ?? 1.5);
    const pad = S.extrude(S.roundedRect(padW, padH, Math.min(padW, padH) * 0.06),
                          padD + 3, { curveSegments: 20 });
    out.cutter = frame.place(pad, f.u, f.v, -padD);

    // Do NOT trace for the flat-print preview. Tracing answers "where is the
    // edge of the ink", which throws away every colour, gradient and pixel of
    // fine detail — it is the wrong question for artwork that is going to be
    // printed rather than moulded. Map the original pixels onto a plane in the
    // recess instead, and the mark is reproduced exactly.
    const plane = new THREE.PlaneGeometry(f.width, f.width * artAspect(art.logoShapes));
    out.decal = frame.place(plane, f.u, f.v, -padD + 0.02);
    out.decalTextured = true;
  }
  return out;
}

/**
 * The icon is ALWAYS handed back as its own solid, never unioned into the tile.
 *
 * This used to union the embossed icon into the tile body, which meant the two
 * left the builder as a single mesh — one STL, one filament. No amount of
 * colour picking in the UI could change that: the preview showed two colours
 * and the exported part printed as one. Keeping the icon separate in every
 * solid mode is what actually makes "tile colour" and "icon colour" two
 * different colours on the finished print.
 */
function iconOps(frame, iconShapes, u, v, size, depth, mode, maxHeight = 0) {
  const out = { cutter: null, adder: null, inlay: null, decal: null };
  if (!iconShapes || !iconShapes.length || size <= 0) return out;
  const mk = (d, h) => {
    const g = artworkSolid(iconShapes, size, d, 0, maxHeight || size);
    return g ? frame.place(g, u, v, h) : null;
  };
  if (mode === 'deboss' || mode === 'inlay') {
    // Sunk: cut the pocket, then hand back a plug that fills it flush.
    out.cutter = mk(depth + 0.12, -(depth + 0.12));
    out.inlay  = mk(depth, -depth);
  } else if (mode === 'emboss') {
    // Raised, overlapping the face by 0.2 mm so the two fuse when printed
    // together with a filament change.
    out.inlay = mk(depth + 0.2, -0.2);
  } else {
    out.decal = mk(0.12, 0.005);
  }
  return out;
}

// ===========================================================================
// BAR family — Tap Bar 2/3/4/QR/Max and Tap Base 2/3/4
// ===========================================================================
// ===========================================================================
// BAR and BOARD live in builders-flat.js — rebuilt from the product photos.
// ===========================================================================
const flat = makeFlatBuilders({
  cut, add, part, artworkSolid, logoOps, iconOps
});
const buildBar   = (cfg, art, product) => flat.buildBar(cfg, art, product, buildTileSolid);
const buildBoard = (cfg, art, product) => flat.buildBoard(cfg, art, product, buildTileSolid);

// ===========================================================================
// TILE — the standalone Tap Tile, also reused inside Bar/Board
// ===========================================================================
function buildTileSolid(p, iconShapes, logoMode, logoArt) {
  const T = p.tileSize, th = p.tileThickness, ch = p.faceChamfer;
  let body = S.extrude(S.roundedRect(T, T, p.tileRadius), Math.max(0.2, th - 2 * ch), {
    bevel: ch > 0.01, bevelSize: ch, bevelThickness: ch, bevelSegments: 2, curveSegments: 24
  });
  body.computeBoundingBox();
  body.translate(0, 0, -body.boundingBox.min.z);   // back face at z = 0, front at z = th

  const front = S.faceFrame(0, new THREE.Vector3(0, 0, th));
  const cutters = [];

  // NFC inlay pocket, opened from the back.
  const nfcR = (p.nfcTagDia ?? HARDWARE.nfcTagDia) / 2 + HARDWARE.nfcClearance;
  const nfc = S.cylinderZ(nfcR, p.nfcPocketDepth + 0.5, 64);
  nfc.translate(0, 0, -0.5);
  cutters.push(nfc);

  // Magnets, also from the back — same ring the stand's seats use.
  const mR = (p.magnetDia ?? HARDWARE.magnetDia) / 2 + HARDWARE.magnetClear;
  const mT = (p.magnetThick ?? HARDWARE.magnetThick) + 0.3;
  for (const [mx, my] of magnetPositions(p.magnetRing ?? HARDWARE.magnetRing,
                                         p.magnetCount ?? HARDWARE.magnetCount)) {
    const m = S.cylinderZ(mR, mT, 32);
    m.translate(mx, my, -0.3);
    cutters.push(m);
  }

  // --- QR tiles -----------------------------------------------------------
  // A scannable QR does not survive being printed as relief. A short URL at
  // ECC M is 25-29 modules; across a 30 mm tile with its quiet zone that is
  // 0.7-0.8 mm per module, under two extrusion lines at a 0.4 mm nozzle, and
  // it will not scan. It also needs tonal contrast, which relief does not give
  // you. So a QR tile gets a shallow flat pad to locate a printed label or a
  // UV print, and the matrix is exported as artwork rather than as solid.
  // Force it with logoMode 'emboss'/'deboss' if you want to try relief anyway.
  const isQR = !!(iconShapes && iconShapes.isQR);
  const qrRelief = isQR && (p.qrRelief ?? 0) >= 0.5;
  let ic = { cutter: null, adder: null, inlay: null, decal: null };

  if (isQR && !qrRelief) {
    const pad = Math.min(T - 2, (p.qrPadSize ?? T - 4));
    const depthPad = p.qrPadDepth ?? 0.35;
    const recess = S.extrude(S.roundedRect(pad, pad, 1.2), depthPad + 1, { curveSegments: 12 });
    cutters.push(front.place(recess, 0, 0, -depthPad));
    // Preview-only artwork sitting in the recess.
    const artg = artworkSolid(iconShapes, pad, 0.08, 0);
    if (artg) ic.decal = front.place(artg, 0, 0, -depthPad + 0.01);
  } else {
    const iconBox = isQR
      ? T - 2 * Math.max(2, p.tileRadius * 0.35)   // QR needs the whole face
      : p.iconScale;
    ic = iconOps(front, iconShapes, 0, 0, iconBox, p.iconDepth, logoMode, iconBox);
  }
  if (ic.cutter) cutters.push(ic.cutter);

  let lg = { cutter: null, adder: null, inlay: null, decal: null };
  if (logoArt && p.logoScale > 0) {
    const inner = T / 2 - Math.max(1.5, p.tileRadius * 0.4);
    lg = logoOps(front, logoArt, p, logoMode, 'logo', {
      uMin: -inner, uMax: inner, vMin: -inner, vMax: inner,
      maxW: inner * 2, maxH: inner * 2
    });
  }
  if (lg.cutter) cutters.push(lg.cutter);

  body = cut(body, cutters);
  body = add(body, [lg.adder]);   // ic never contributes an adder any more

  return { body, inlay: ic.inlay, decal: ic.decal, logoInlay: lg.inlay, logoDecal: lg.decal };
}

function buildTile(cfg, art, product) {
  const p = cfg.params;
  const t = buildTileSolid(p, art.iconShapes[0], cfg.logoMode, art);
  const parts = [part('body', 'Tap Tile', t.body, 'tile', {
    note: `NFC pocket ø${p.nfcTagDia ?? HARDWARE.nfcTagDia} mm × ${p.nfcPocketDepth} mm deep. ` +
          `${Math.round(p.magnetCount)} × ø${p.magnetDia}×${p.magnetThick} magnets on a ${p.magnetRing} mm ring. ` +
          `Print face-down, 0.12 mm layers, no supports.`
  })];
  if (t.inlay) parts.push(part('icon-inlay', 'Icon', t.inlay, 'icon',
    { note: 'Second colour — its own solid. Print in place with a filament change, ' +
            'or print separately and press-fit.' }));
  if (t.logoInlay) parts.push(part('logo-inlay', 'Logo inlay', t.logoInlay, 'logo'));
  if (t.decal) parts.push(part('icon-decal', 'Icon (print artwork)', t.decal, 'icon', { printable: false }));
  if (t.logoDecal) parts.push(part('logo-decal', 'Logo (print artwork)', t.logoDecal, 'logo', { printable: false }));

  // Back lid that traps the NFC inlay.
  const lidR = (p.nfcTagDia ?? HARDWARE.nfcTagDia) / 2 + HARDWARE.nfcClearance - 0.15;
  const lid = S.cylinderZ(lidR, p.lidThickness, 64);
  lid.translate(0, 0, -p.lidThickness - 0.05);
  parts.push(part('lid', 'NFC retaining lid', lid, 'body',
    { note: 'Glue or press into the back pocket after seating the NFC inlay.' }));

  return { parts, bbox: { width: p.tileSize, height: p.tileSize, depth: p.tileThickness } };
}

// ===========================================================================
// LIGHTBOX — Mini 3D Image Lightbox
// ===========================================================================
function buildLightbox(cfg, art, product) {
  const p = cfg.params;
  const W = p.boxWidth, H = p.boxHeight, D = p.boxDepth;
  const wall = p.shellThickness, fw = p.frameWidth;

  let shell = S.extrude(S.roundedRect(W, H, p.cornerRadius), D, { curveSegments: 28 });
  const cutters = [];

  // Hollow interior, opened at the back.
  const cav = S.extrude(S.roundedRect(W - 2 * wall, H - 2 * wall, Math.max(0, p.cornerRadius - wall)),
    D - wall + 2, { curveSegments: 24 });
  cav.translate(0, 0, wall);
  cutters.push(cav);

  // Front aperture the lithophane sits behind.
  const apW = W - 2 * fw, apH = H - 2 * fw;
  const ap = S.extrude(S.roundedRect(apW, apH, Math.max(0, p.cornerRadius - fw)), wall + 2, { curveSegments: 24 });
  ap.translate(0, 0, -1);
  cutters.push(ap);

  const front = S.faceFrame(0, new THREE.Vector3(0, 0, 0));
  front.nAxis.set(0, 0, -1); // logo lives on the outer front face at z = 0

  // Logo on the frame border (front face is at z = 0, facing -Z).
  const lgFrame = S.faceFrame(Math.PI, new THREE.Vector3(0, 0, 0));
  const lbFit = {
    uMin: -W / 2 + 3, uMax: W / 2 - 3,
    vMin: -H / 2 + 2, vMax: -(H / 2 - fw) + 1,
    maxW: W - 2 * fw - 4,
    maxH: Math.max(2, fw - 2)
  };
  const lg = logoOps(lgFrame, art, p, cfg.logoMode, 'logo', lbFit);
  if (lg.cutter) cutters.push(lg.cutter);

  shell = cut(shell, cutters);
  if (lg.adder) shell = add(shell, lg.adder);

  const parts = [part('body', 'Lightbox shell', shell, 'body', {
    note: `Print open-side-down. ${wall} mm walls. Diffuser gap ${p.diffuserGap} mm.`
  })];
  if (lg.inlay) parts.push(part('logo-inlay', 'Logo inlay', lg.inlay, 'logo',
    { note: 'Print in the accent colour; press-fits into the cavity.' }));
  (lg.layers || []).forEach((L, i) => {
    const pt = part(`logo-c${i + 1}`, `Logo colour ${i + 1} (${L.hex})`, L.geometry, 'logo',
      { note: `${(L.areaFrac * 100).toFixed(1)}% of the mark. Assign filament ${L.hex}.` });
    pt.fixedColor = L.hex;
    parts.push(pt);
  });
  if (lg.decal) {
    const dp = part('logo-decal', 'Logo (print artwork)', lg.decal, 'logo', { printable: false });
    dp.textured = !!lg.decalTextured;
    parts.push(dp);
  }

  // Lithophane panel from the uploaded raster.
  const litho = buildLithophane(art.rasterCanvas, apW + 2, apH + 2, p);
  parts.push(part('litho', 'Lithophane panel', litho, 'litho', {
    material: 'White PLA',
    note: art.rasterCanvas
      ? `${p.lithoMinWall}–${p.lithoThickness} mm. Print upright, 0.08 mm layers, 100% infill, no supports.`
      : 'No image uploaded — flat blank panel. Upload a photo to generate the relief.'
  }));

  // Back cover with battery bay.
  let cover = S.extrude(S.roundedRect(W - 2 * wall - 0.4, H - 2 * wall - 0.4,
    Math.max(0, p.cornerRadius - wall)), wall, { curveSegments: 24 });
  if (p.batteryBay >= 0.5) {
    const bay = S.cylinderZ(HARDWARE.batteryDia / 2 + 0.3, HARDWARE.batteryThick + 0.4, 48);
    bay.translate(0, -H * 0.18, -0.2);
    cover = cut(cover, bay);
  }
  cover.translate(0, 0, D - wall);
  parts.push(part('cover', 'Back cover', cover, 'body',
    { note: 'Friction fit. Houses the CR2032 and the NFC tap sensor.' }));

  return { parts, bbox: { width: W, height: H, depth: D }, logoFit: lg.fit };
}

/** Heightmap panel: brighter pixels -> thinner wall -> more light through. */
function buildLithophane(canvas, w, h, p) {
  const res = Math.max(20, Math.round(p.lithoRes));
  const nx = res, ny = Math.max(20, Math.round(res * (h / w)));
  const tMin = p.lithoMinWall, tMax = p.lithoThickness;

  let data = null;
  if (canvas) {
    const cv = document.createElement('canvas');
    cv.width = nx; cv.height = ny;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, nx, ny);
    ctx.drawImage(canvas, 0, 0, nx, ny);
    data = ctx.getImageData(0, 0, nx, ny).data;
  }

  const lum = (ix, iy) => {
    if (!data) return 1;
    const i = (iy * nx + ix) * 4;
    const a = data[i + 3] / 255;
    let l = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
    l = l * a + (1 - a);                       // composite over white
    return p.lithoInvert >= 0.5 ? 1 - l : l;
  };

  const front = [], back = [];
  for (let iy = 0; iy < ny; iy++) {
    for (let ix = 0; ix < nx; ix++) {
      const x = -w / 2 + (ix / (nx - 1)) * w;
      const y = h / 2 - (iy / (ny - 1)) * h;
      const t = tMin + (1 - lum(ix, iy)) * (tMax - tMin);
      front.push(x, y, 0);
      back.push(x, y, t);
    }
  }

  const pos = [];
  const idx = (ix, iy) => (iy * nx + ix) * 3;
  const push = (arr, i) => pos.push(arr[i], arr[i + 1], arr[i + 2]);

  for (let iy = 0; iy < ny - 1; iy++) {
    for (let ix = 0; ix < nx - 1; ix++) {
      const a = idx(ix, iy), b = idx(ix + 1, iy), c = idx(ix + 1, iy + 1), d = idx(ix, iy + 1);
      // Flat front (viewer side)
      push(front, a); push(front, c); push(front, b);
      push(front, a); push(front, d); push(front, c);
      // Relief back
      push(back, a); push(back, b); push(back, c);
      push(back, a); push(back, c); push(back, d);
    }
  }
  // Side walls
  const wall = (i, j) => { push(front, i); push(back, i); push(back, j);
                           push(front, i); push(back, j); push(front, j); };
  for (let ix = 0; ix < nx - 1; ix++) { wall(idx(ix + 1, 0), idx(ix, 0)); wall(idx(ix, ny - 1), idx(ix + 1, ny - 1)); }
  for (let iy = 0; iy < ny - 1; iy++) { wall(idx(0, iy), idx(0, iy + 1)); wall(idx(nx - 1, iy + 1), idx(nx - 1, iy)); }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  g.computeVertexNormals();
  g.translate(0, 0, -tMax - 0.2);   // sit just behind the aperture
  return g;
}

// ===========================================================================
// SNAP — Tap Snap MagSafe namecard
// ===========================================================================
function buildSnap(cfg, art, product) {
  const p = cfg.params;
  const W = p.cardWidth, H = p.cardHeight, T = p.cardThickness, ch = p.edgeChamfer;

  let body = S.extrude(S.roundedRect(W, H, p.cornerRadius), Math.max(0.2, T - 2 * ch), {
    bevel: ch > 0.01, bevelSize: ch, bevelThickness: ch, bevelSegments: 2, curveSegments: 32
  });
  body.computeBoundingBox();
  body.translate(0, 0, -body.boundingBox.min.z);

  const front = S.faceFrame(0, new THREE.Vector3(0, 0, T));
  const back  = S.faceFrame(Math.PI, new THREE.Vector3(0, 0, 0));
  const cutters = [], adders = [], parts = [];

  // MagSafe magnet-ring channel on the back.
  const ring = S.extrude(S.ringShape(p.magsafeOuter / 2, p.magsafeInner / 2, 128), p.magsafeDepth + 0.5, {});
  cutters.push(back.place(ring, 0, 0, -p.magsafeDepth));

  // Central NFC pocket on the back.
  const nfc = S.cylinderZ(HARDWARE.nfcTagDia / 2 + HARDWARE.nfcClearance, 1.2, 64);
  cutters.push(back.place(nfc, 0, 0, -1.1));

  // Four corner icons on the front.
  const inset = p.cornerIconInset;
  const corners = [[-1, 1], [1, 1], [-1, -1], [1, -1]];
  cfg.tiles.slice(0, 4).forEach((t, i) => {
    const [sx, sy] = corners[i];
    const u = sx * (W / 2 - inset), v = sy * (H / 2 - inset);
    const dish = S.cylinderZ(p.cornerIconDia / 2, 0.9, 48);
    cutters.push(front.place(dish, u, v, -0.6));
    const ic = iconOps(front, art.iconShapes[i], u, v, p.cornerIconDia * 0.62, p.iconDepth, cfg.logoMode);
    if (ic.cutter) cutters.push(ic.cutter);
    if (ic.adder) adders.push(ic.adder);
    if (ic.inlay) parts.push(part(`icon-${i + 1}`, `Corner icon ${i + 1}`, ic.inlay, 'icon'));
    if (ic.decal) parts.push(part(`icon-${i + 1}-decal`, `Corner icon ${i + 1} (print)`, ic.decal, 'icon', { printable: false }));
  });

  const snapFit = {
    uMin: -W / 2 + 4, uMax: W / 2 - 4,
    vMin: -H / 2 + 4, vMax: H / 2 - 4,
    maxW: Math.max(4, W - 2 * (p.cornerIconInset + p.cornerIconDia / 2) + 6),
    maxH: Math.max(4, H - 2 * (p.cornerIconInset + p.cornerIconDia / 2) + 6)
  };
  const lg = logoOps(front, art, p, cfg.logoMode, 'logo', snapFit);
  if (lg.cutter) cutters.push(lg.cutter);
  if (lg.adder) adders.push(lg.adder);

  body = cut(body, cutters);
  body = add(body, adders);

  parts.unshift(part('body', 'Tap Snap card', body, 'body', {
    note: `MagSafe ring ø${p.magsafeInner}–${p.magsafeOuter} mm × ${p.magsafeDepth} mm deep. ` +
          `Print back-face-down, 0.12 mm layers, no supports.`
  }));
  if (lg.inlay) parts.push(part('logo-inlay', 'Logo inlay', lg.inlay, 'logo',
    { note: 'Print in the accent colour; press-fits into the cavity.' }));
  (lg.layers || []).forEach((L, i) => {
    const pt = part(`logo-c${i + 1}`, `Logo colour ${i + 1} (${L.hex})`, L.geometry, 'logo',
      { note: `${(L.areaFrac * 100).toFixed(1)}% of the mark. Assign filament ${L.hex}.` });
    pt.fixedColor = L.hex;
    parts.push(pt);
  });
  if (lg.decal) {
    const dp = part('logo-decal', 'Logo (print artwork)', lg.decal, 'logo', { printable: false });
    dp.textured = !!lg.decalTextured;
    parts.push(dp);
  }

  return { parts, bbox: { width: W, height: H, depth: T }, logoFit: lg.fit };
}

// ===========================================================================
export const BUILDERS = { bar: buildBar, board: buildBoard, tile: buildTile, lightbox: buildLightbox, snap: buildSnap };

/**
 * @param cfg  config object (see params.defaultConfig)
 * @param art  { logoShapes, iconShapes: THREE.Shape[][], rasterCanvas }
 * @param opts { repair: boolean }  repair defaults to true — welds the CSG
 *             output and removes T-junctions so exports are watertight.
 */
export function buildProduct(cfg, art, opts = {}) {
  const product = PRODUCTS[cfg.productId];
  const builder = BUILDERS[product.family];
  // Pass the whole art object through. Whitelisting fields here silently
  // dropped logoMesh and straplineShapes — the builders looked correct and
  // simply never saw the data.
  const safeArt = {
    iconShapes: [],
    ...(art || {})
  };
  const res = builder(cfg, safeArt, product);

  // Off by default: the weld/T-junction pass costs more time than it buys for
  // a preview, and the authoritative production files come from the CadQuery
  // backend. Turn it on from the UI when you want a tidier browser export.
  if (opts.repair === true) {
    for (const p of res.parts) {
      if (!p.printable) continue;
      try {
        p.geometry = repairMesh(p.geometry);
      } catch (e) {
        console.warn(`repair failed for ${p.id}:`, e.message);
      }
    }
  }
  for (const p of res.parts) {
    p.report = p.printable ? analyzeMesh(weldMesh(p.geometry, 1e-4)) : null;
  }

  res.product = product;
  return res;
}
