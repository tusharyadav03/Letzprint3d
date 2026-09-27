// ============================================================================
// Tap Studio — application shell.
// Wires the product schema, the parametric builders, the logo tracer and the
// exporters into a single configurator.
// ============================================================================
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  PRODUCTS, PRODUCT_ORDER, PARAM_DEFS, PALETTE, ICONS, defaultConfig
} from './params.js';
import { buildProduct } from './geometry.js';
import { repair as repairMesh, analyze as analyzeMesh } from './mesh-repair.js';
import { iconShapes, imageToShapes } from './logo.js';
import { qrShapes, qrPrintCheck, qrCanvas } from './qr.js';
import { loadLogoMesh, mountNotes } from './logo-mount.js';
import {
  exportSTL, exportOBJ, export3MF, jobSheet, exportPreset, download
} from './exporters.js';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let cfg = defaultConfig('tapbar-2');
// The logo is now something you supply as an STL. This app only mounts it.
let art = { iconShapes: [], straplineShapes: null, logoMesh: null };
let built = null;
let exploded = false;
/**
 * Which swatch the palette applies to. `scope` is 'global' for a key in
 * cfg.colors, or 'tile' for a per-tile override, in which case `index` is the
 * tile and `key` is 'color' or 'iconColor'.
 */
let activeColor = { scope: 'global', key: 'body', label: 'Body / shell' };

/**
 * Every colour <input> on screen, so a change can be reflected without tearing
 * the panel down and rebuilding it.
 *
 * Rebuilding was the bug: `oninput` fires continuously while you drag inside
 * the OS colour picker, and each one replaced the very <input> the picker was
 * attached to. The picker then updates a detached element, so your choice
 * never lands — the swatch snaps back to the old colour the moment you close
 * it. Colour inputs are now created once and only their values are synced.
 */
let colorInputs = [];

// ---------------------------------------------------------------------------
// Three.js scene
// ---------------------------------------------------------------------------
const canvas = document.getElementById('cv');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(34, 1, 1, 4000);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const key = new THREE.DirectionalLight(0xffffff, 2.1);
key.position.set(120, 190, 160);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.near = 10; key.shadow.camera.far = 900;
[key.shadow.camera.left, key.shadow.camera.right] = [-200, 200];
key.shadow.camera.top = 200; key.shadow.camera.bottom = -200;
key.shadow.bias = -0.0009;
scene.add(key);
scene.add(new THREE.DirectionalLight(0x9fb6ff, 0.55).translateX(-160).translateY(90).translateZ(-120));
scene.add(new THREE.AmbientLight(0xffffff, 0.35));

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(3000, 3000),
  new THREE.ShadowMaterial({ opacity: 0.32 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const root = new THREE.Group();
scene.add(root);

function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(canvas);

(function loop() {
  requestAnimationFrame(loop);
  controls.update();
  renderer.render(scene, camera);
})();

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------
const matCache = new Map();
function mat(hex, opts = {}) {
  const k = `${hex}|${opts.rough ?? 0.55}|${opts.trans ?? 0}`;
  if (matCache.has(k)) return matCache.get(k);
  const m = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(hex),
    roughness: opts.rough ?? 0.55,
    metalness: 0.02,
    clearcoat: 0.25,
    clearcoatRoughness: 0.6,
    transmission: opts.trans ?? 0,
    thickness: opts.trans ? 3 : 0,
    side: THREE.DoubleSide
  });
  matCache.set(k, m);
  return m;
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------
const busy = document.getElementById('busy');
let buildToken = 0;

let qrNotes = [];

/**
 * The embossed "((( TAP TO CONNECT )))" strapline across the tray front.
 * Rendered with the system font to a canvas and put through the same tracer
 * the logos use, so it becomes real extruded geometry rather than a texture.
 */
let _strapCache = { key: null, shapes: null };
function ensureStrapline() {
  const txt = (cfg.strapline ?? 'TAP TO CONNECT').trim();
  if (!txt) { art.straplineShapes = null; return; }
  const full = `((( ${txt.toUpperCase()} )))`;
  if (_strapCache.key === full) { art.straplineShapes = _strapCache.shapes; return; }

  const font = '900 160px ui-rounded, "Avenir Next", "Segoe UI", system-ui, sans-serif';
  const probe = document.createElement('canvas').getContext('2d');
  probe.font = font;
  const w = Math.ceil(probe.measureText(full).width) + 48;

  const cv = document.createElement('canvas');
  cv.width = w; cv.height = 240;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.font = font; ctx.fillStyle = '#000000';
  ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
  ctx.fillText(full, cv.width / 2, cv.height / 2);

  const shapes = imageToShapes(ctx.getImageData(0, 0, cv.width, cv.height),
    { threshold: 0.5, useAlpha: false, simplify: 0.35, smooth: 0 });
  _strapCache = { key: full, shapes };
  art.straplineShapes = shapes;
}

async function ensureIcons() {
  const n = cfg.tiles.length;
  const out = [];
  qrNotes = [];
  const tileMM = cfg.params.tileSize ?? 30;
  const face = tileMM - 2 * Math.max(2, (cfg.params.tileRadius ?? 6) * 0.35);

  for (let i = 0; i < n; i++) {
    const t = cfg.tiles[i];
    if (t.icon === 'custom') { out.push(null); continue; }

    if (t.icon === 'qr') {
      // Encode the tile's real destination, not a picture of a QR code.
      try {
        const res = qrShapes(t.link, face, { ecc: t.qrEcc || 'M' });
        res.shapes.isQR = true;
        out.push(res.shapes);
        qrNotes.push({
          tile: i + 1, level: 'ok',
          text: `Tile ${i + 1}: QR v${res.version}, ${res.count}×${res.count} modules at ` +
            `${res.moduleMM.toFixed(2)} mm.`
        });
        qrPrintCheck(res.moduleMM, cfg.nozzle ?? 0.4).forEach(nt => qrNotes.push({ tile: i + 1, ...nt }));
      } catch (e) {
        qrNotes.push({ tile: i + 1, level: 'error', text: `Tile ${i + 1}: ${e.message}` });
        out.push(null);
      }
      continue;
    }

    try { out.push(await iconShapes(t.icon)); } catch { out.push(null); }
  }
  art.iconShapes = out;
}

let rebuildTimer = null;
function scheduleRebuild(delay = 130) {
  clearTimeout(rebuildTimer);
  rebuildTimer = setTimeout(rebuild, delay);
}

async function rebuild() {
  const token = ++buildToken;
  busy.classList.add('on');
  await new Promise(r => requestAnimationFrame(r));
  try {
    await ensureIcons();
    ensureStrapline();
    if (token !== buildToken) return;
    cfg.params.reliefNozzle = cfg.nozzle ?? 0.4;   // keep the relief sampler in step
    built = buildProduct(cfg, art);
    if (token !== buildToken) return;
    renderParts();
    updateHUD();
    updateCheck();
  } catch (e) {
    console.error(e);
    document.getElementById('hud').textContent = 'Build error — see console.\n' + e.message;
  } finally {
    if (token === buildToken) busy.classList.remove('on');
  }
}

function colorFor(part, i) {
  if (part.fixedColor) return part.fixedColor;
  if (part.colorKey === 'litho') return '#f2efe8';
  if (part.colorKey === 'tile') {
    const m = /^tile-(\d+)/.exec(part.id);
    if (m) {
      const t = cfg.tiles[+m[1] - 1];
      if (t && t.color) return t.color;
    }
  }
  if (part.colorKey === 'icon') {
    const m = /^tile-(\d+)/.exec(part.id);
    if (m) {
      const t = cfg.tiles[+m[1] - 1];
      if (t && t.iconColor) return t.iconColor;
    }
  }
  return cfg.colors[part.colorKey] || cfg.colors.body;
}

function renderParts() {
  while (root.children.length) {
    const c = root.children.pop();
    c.geometry?.dispose?.();
  }
  if (!built) return;

  built.parts.forEach((p, i) => {
    let m;
    if (p.textured && art.rasterCanvas) {
      // Flat print: show the real artwork, pixel for pixel. No trace involved.
      const tex = new THREE.CanvasTexture(art.rasterCanvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
      m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false });
    } else {
      const hex = colorFor(p, i);
      const isLitho = p.colorKey === 'litho';
      m = mat(hex, { rough: isLitho ? 0.85 : 0.5, trans: isLitho ? 0.55 : 0 });
    }
    const mesh = new THREE.Mesh(p.geometry, m);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.userData.part = p;
    root.add(mesh);
  });

  applyExplode();

  // Sit the model on the ground plane and frame it.
  const box = new THREE.Box3().setFromObject(root);
  root.position.y -= box.min.y;
  const box2 = new THREE.Box3().setFromObject(root);
  const size = box2.getSize(new THREE.Vector3());
  const center = box2.getCenter(new THREE.Vector3());
  controls.target.copy(center);
  if (!camera.userData.framed || camera.userData.framedFor !== cfg.productId) {
    const d = Math.max(size.x, size.y, size.z) * 2.35 + 40;
    camera.position.set(center.x + d * 0.62, center.y + d * 0.5, center.z + d * 0.72);
    camera.userData.framed = true;
    camera.userData.framedFor = cfg.productId;
  }
  camera.near = 1; camera.far = 6000; camera.updateProjectionMatrix();
}

function applyExplode() {
  root.children.forEach((m, i) => {
    const p = m.userData.part;
    if (!exploded) { m.position.set(0, 0, 0); return; }
    const k = /tile-\d+$/.test(p.id) ? 26 : /inlay|decal|icon/.test(p.id) ? 40 : /lid|cover|litho/.test(p.id) ? 30 : 0;
    m.position.set(0, 0, k);
  });
}

// ---------------------------------------------------------------------------
// HUD + model check
// ---------------------------------------------------------------------------
function triCount() {
  return root.children.reduce((a, m) =>
    a + (m.userData.part.printable ? m.geometry.attributes.position.count / 3 : 0), 0);
}

function updateHUD() {
  if (!built) return;
  const b = built.bbox;
  document.getElementById('hud').textContent =
    `${built.product.name}   ${built.product.price}\n` +
    `${b.width.toFixed(1)} × ${b.height.toFixed(1)} × ${b.depth.toFixed(1)} mm\n` +
    `${built.parts.filter(p => p.printable).length} printable parts · ${Math.round(triCount()).toLocaleString()} triangles`;
  document.getElementById('hTitle').textContent = built.product.name;
}

/** Boundary-edge count: a closed manifold solid has none. */
function manifoldReport(geometry) {
  const pos = (geometry.index ? geometry.toNonIndexed() : geometry).attributes.position.array;
  const q = v => Math.round(v * 1000);
  const map = new Map();
  let edges = 0;
  for (let t = 0; t < pos.length; t += 9) {
    const v = [];
    for (let k = 0; k < 3; k++) v.push(`${q(pos[t + k * 3])},${q(pos[t + k * 3 + 1])},${q(pos[t + k * 3 + 2])}`);
    for (let k = 0; k < 3; k++) {
      const a = v[k], b = v[(k + 1) % 3];
      const key = a < b ? a + '|' + b : b + '|' + a;
      map.set(key, (map.get(key) || 0) + 1);
      edges++;
    }
  }
  let open = 0, nonMan = 0;
  for (const c of map.values()) { if (c === 1) open++; else if (c > 2) nonMan++; }
  return { open, nonMan, edges };
}

function updateCheck() {
  const el = document.getElementById('check');
  if (!built) { el.innerHTML = ''; return; }
  const printable = built.parts.filter(p => p.printable);
  let html = '';
  let seams = 0;
  for (const p of printable) {
    const r = p.report || manifoldReport(p.geometry);
    const open = r.open ?? 0, non = r.nonManifold ?? r.nonMan ?? 0;
    const ok = open === 0 && non === 0;
    seams += open;
    html += `<div class="stat"><span>${p.name}</span>` +
      `<span style="color:${ok ? 'var(--ok)' : 'var(--warn)'}">${ok ? 'watertight' : `${open} seam edge${open === 1 ? '' : 's'}`}</span></div>`;
    if (r.volume !== undefined) {
      html += `<div class="stat"><span style="padding-left:12px;opacity:.7">volume</span>` +
        `<span style="opacity:.7">${(Math.abs(r.volume) / 1000).toFixed(2)} cm³ ` +
        `· ~${(Math.abs(r.volume) * 0.00124 * 0.25).toFixed(1)} g @20%</span></div>`;
    }
  }

  const p = cfg.params;
  const warns = [];
  if (p.shellThickness !== undefined && p.shellThickness < 1.2) warns.push('Wall thickness below 1.2 mm — under three perimeters at a 0.4 mm nozzle.');
  if (p.logoDepth !== undefined && p.logoDepth < 0.24) warns.push('Logo relief below 0.24 mm — thinner than two layers at 0.12 mm.');
  if (p.iconDepth !== undefined && p.iconDepth < 0.24) warns.push('Icon relief below 0.24 mm — will not resolve cleanly.');
  if (p.tileRecess !== undefined && p.tileThickness !== undefined && p.tileRecess >= p.tileThickness)
    warns.push('Tile recess is deeper than the tile — the tile will sit below the surface.');
  if (p.lithoMinWall !== undefined && p.lithoMinWall < 0.4) warns.push('Lithophane minimum wall below 0.4 mm — likely to tear at a 0.4 mm nozzle.');

  // Hardware fit: the magnet ring must clear the NFC antenna pocket and the edge.
  if (p.nfcTagDia !== undefined && p.magnetCount > 0) {
    const nfcR = p.nfcTagDia / 2 + 0.35;
    const magR = p.magnetDia / 2 + 0.15;
    const T = p.tileSize ?? 30;
    if (p.magnetRing - magR < nfcR)
      warns.push(`Magnets overlap the NFC pocket: ring ${p.magnetRing} mm needs to be at least ` +
        `${(nfcR + magR).toFixed(1)} mm for a ø${p.nfcTagDia} mm tag, or use a smaller tag.`);
    if (p.magnetRing + magR > T / 2 - 0.8)
      warns.push(`Magnets break through the tile edge: ring must stay under ` +
        `${(T / 2 - 0.8 - magR).toFixed(1)} mm for a ${T} mm tile.`);
    if (p.magnetThick + 0.3 >= (p.tileThickness ?? 4) - 0.8)
      warns.push('Magnet pocket leaves under 0.8 mm of face — the magnets will show through.');
  }

  for (const nt of qrNotes) {
    if (nt.level !== 'ok') warns.push(nt.text);
  }
  if (art.logoMesh && built.logoFit) {
    const mf = built.parts.find(x => x.id === 'logo-mount');
    if (mf) for (const nt of mountNotes(art.logoMesh, built.mountFit || {
      proudMM: 99, scale: 1, widthMM: built.logoFit.width
    }, cfg.nozzle ?? 0.4)) warns.push(nt.text);
  }

  el.innerHTML = html +
    (seams === 0
      ? `<div class="okbox">Every printable part is watertight and manifold.</div>`
      : `<div class="warnbox"><b>${seams} hairline seam edges</b> across the set. These are
         0.01–0.05 mm tessellation mismatches where two curved surfaces meet — inherent to
         float booleans, the same class Blender's boolean modifier leaves behind, and every
         slicer closes them silently on import. For guaranteed-watertight production files,
         run this preset through <b>cad/tap_cad.py</b>, which works in exact B-rep and
         tessellates once at the end.</div>`) +
    warns.map(w => `<div class="warnbox">${w}</div>`).join('');
}

// ---------------------------------------------------------------------------
// UI — product rail
// ---------------------------------------------------------------------------
const GROUPS = [
  ['Tap Bar', ['tapbar-2', 'tapbar-3', 'tapbar-4', 'tapbar-qr', 'tapbar-max']],
  ['Tap Base', ['tapbase-2', 'tapbase-3', 'tapbase-4']],
  ['Tap Board', ['tapboard-2', 'tapboard-3', 'tapboard-4']],
  ['Single & special', ['taptile', 'lightbox-mini', 'tapsnap']]
];

function buildRail() {
  const rail = document.getElementById('rail');
  rail.innerHTML = '';
  for (const [label, ids] of GROUPS) {
    const g = document.createElement('div');
    g.className = 'grp'; g.textContent = label;
    rail.appendChild(g);
    for (const id of ids) {
      const p = PRODUCTS[id];
      const d = document.createElement('div');
      d.className = 'prod' + (id === cfg.productId ? ' on' : '');
      d.innerHTML = `<b>${p.name}</b><i>${p.price}</i>`;
      d.onclick = () => selectProduct(id);
      rail.appendChild(d);
    }
  }
}

function selectProduct(id) {
  const keepLogoMode = cfg.logoMode;
  const keepColors = { ...cfg.colors };
  const keepTiles = cfg.tiles;
  cfg = defaultConfig(id);
  cfg.logoMode = keepLogoMode;
  cfg.colors = keepColors;
  cfg.tiles = cfg.tiles.map((t, i) => keepTiles[i] ? { ...t, ...keepTiles[i] } : t);
  buildRail();
  buildDims();
  buildTiles();
  camera.userData.framedFor = null;
  scheduleRebuild(0);
}

// ---------------------------------------------------------------------------
// UI — dimensions
// ---------------------------------------------------------------------------
function buildDims() {
  const pane = document.querySelector('[data-pane="dims"]');
  pane.innerHTML = '';
  const defs = PARAM_DEFS[PRODUCTS[cfg.productId].family];
  const groups = [...new Set(defs.map(d => d.group))];
  for (const g of groups) {
    const lbl = document.createElement('span');
    lbl.className = 'lbl'; lbl.textContent = g;
    pane.appendChild(lbl);
    for (const d of defs.filter(x => x.group === g)) {
      const row = document.createElement('div');
      row.className = 'row';
      const v = cfg.params[d.key] ?? d.min;
      row.innerHTML = `<label title="${d.key}">${d.label}</label>
        <input type="range" min="${d.min}" max="${d.max}" step="${d.step}" value="${v}">
        <div class="num">${fmt(v, d.step)}</div>`;
      const inp = row.querySelector('input');
      const num = row.querySelector('.num');
      inp.oninput = () => {
        cfg.params[d.key] = parseFloat(inp.value);
        num.textContent = fmt(cfg.params[d.key], d.step);
        if (d.key === 'tileCount') { syncTileCount(); buildTiles(); }
        scheduleRebuild();
      };
      pane.appendChild(row);
    }
  }
  const reset = document.createElement('button');
  reset.textContent = 'Reset to product defaults';
  reset.style.cssText = 'width:100%;margin-top:14px';
  reset.onclick = () => {
    cfg.params = { ...PRODUCTS[cfg.productId].params };
    buildDims(); scheduleRebuild(0);
  };
  pane.appendChild(reset);
}
const fmt = (v, step) => (step >= 1 ? String(Math.round(v)) : v.toFixed(step >= 0.1 ? 1 : 2));

function syncTileCount() {
  const n = Math.max(1, Math.round(cfg.params.tileCount ?? cfg.tiles.length));
  while (cfg.tiles.length < n) cfg.tiles.push({ icon: 'website', link: '', color: null, iconColor: null });
  cfg.tiles.length = Math.max(n, PRODUCTS[cfg.productId].family === 'snap' ? 4 : n);
}

// ---------------------------------------------------------------------------
// UI — tiles
// ---------------------------------------------------------------------------
/** Current value of a registered colour target, resolving inheritance. */
function colorValue(reg) {
  if (reg.scope === 'tile') {
    const t = cfg.tiles[reg.index];
    return (t && t[reg.key]) || cfg.colors[reg.key === 'iconColor' ? 'icon' : 'tile'];
  }
  return cfg.colors[reg.key];
}

function sameTarget(a, b) {
  return a.scope === b.scope && a.key === b.key && (a.scope !== 'tile' || a.index === b.index);
}

/** Push model state back into the inputs, in place. Never rebuilds the DOM. */
function syncColorInputs() {
  for (const reg of colorInputs) {
    const v = colorValue(reg);
    if (v && reg.input.value.toLowerCase() !== v.toLowerCase()) reg.input.value = v;
    if (reg.inh) {
      const own = reg.scope === 'tile' ? cfg.tiles[reg.index]?.[reg.key] : true;
      reg.inh.style.display = own ? 'none' : '';
    }
    reg.row.classList.toggle('sel', sameTarget(reg, activeColor));
  }
  const hint = document.getElementById('swHint');
  if (hint) hint.textContent = `Swatch click applies to: ${activeColor.label}`;
}

/**
 * Wire one colour row: a live input, plus click-to-target so the palette
 * swatches below can be aimed at it — including at an individual tile, which
 * previously was not reachable at all.
 */
function registerColorRow(row, reg, onPick) {
  reg.row = row;
  reg.input = row.querySelector('input[type=color]');
  reg.inh = row.querySelector('.inh');
  reg.onPick = onPick;
  reg.input.value = colorValue(reg) || '#cccccc';
  const select = () => { activeColor = reg; syncColorInputs(); };
  row.onclick = select;
  reg.input.onfocus = select;
  reg.input.oninput = () => {
    // Read the picked value BEFORE anything can sync over it. Selecting first
    // would run syncColorInputs while the model still holds the old colour,
    // which writes that old colour straight back into the input — and then
    // that is what gets committed. The pick would silently do nothing.
    const hex = reg.input.value;
    activeColor = reg;
    onPick(hex);
  };
  colorInputs.push(reg);
}

function applyColor(reg, hex) {
  if (reg.scope === 'tile') cfg.tiles[reg.index][reg.key] = hex;
  else cfg.colors[reg.key] = hex;
  syncColorInputs();
  renderParts();
}

function buildTiles() {
  const pane = document.querySelector('[data-pane="tiles"]');
  pane.innerHTML = '';
  colorInputs = colorInputs.filter(r => r.scope !== 'tile');   // drop dead rows
  if (activeColor.scope === 'tile') activeColor = colorInputs[0] || activeColor;
  const fam = PRODUCTS[cfg.productId].family;
  if (fam === 'lightbox') {
    pane.innerHTML = `<div class="hint">The Lightbox has no tiles. Upload a photo on the
      Design tab — it is traced into a lithophane relief automatically. Use the
      Dimensions tab to tune thickness, minimum wall and resolution.</div>`;
    return;
  }
  cfg.tiles.forEach((t, i) => {
    const d = document.createElement('div');
    d.className = 'tile';
    d.innerHTML = `<h4>${fam === 'snap' ? 'Corner ' : 'Tile '}${i + 1}</h4>
      <select>${ICONS.map(ic => `<option value="${ic.id}"${ic.id === t.icon ? ' selected' : ''}>${ic.label}</option>`).join('')}</select>
      <input class="tLink" type="url" placeholder="Destination link (written to NFC)" value="${t.link || ''}">
      <div class="colorRow" data-k="color"><span>Tile colour <i class="inh">(inherited)</i></span>
        <input type="color"></div>
      <div class="colorRow" data-k="iconColor"><span>Icon colour <i class="inh">(inherited)</i></span>
        <input type="color"></div>
      <button class="resetCol" style="width:100%;font-size:11px;padding:5px">Reset to inherited colours</button>`;
    const [sel] = d.getElementsByTagName('select');
    const link = d.querySelector('.tLink');
    sel.onchange = () => { t.icon = sel.value; scheduleRebuild(0); };
    link.oninput = () => {
      t.link = link.value;
      if (t.icon === 'qr') scheduleRebuild(500);   // re-encode the matrix
    };
    d.querySelectorAll('.colorRow').forEach(row => {
      const key = row.dataset.k;
      const reg = {
        scope: 'tile', index: i, key,
        label: `Tile ${i + 1} ${key === 'color' ? 'tile' : 'icon'} colour`
      };
      registerColorRow(row, reg, hex => applyColor(reg, hex));
    });
    d.querySelector('.resetCol').onclick = e => {
      e.stopPropagation();
      t.color = null; t.iconColor = null;
      syncColorInputs(); renderParts();
    };
    pane.appendChild(d);
  });
  const hint = document.createElement('div');
  hint.className = 'hint';
  hint.innerHTML = `The social icons are hand-drawn approximations of the real platform
    marks, not official assets, and they are not cleared for use — each platform publishes
    brand guidelines covering colour, clear space and alteration. For anything going out to
    a customer, choose <b>Custom (upload)</b> and supply the official artwork.
    The functional icons (menu, booking, wifi, location, phone, email, shop, QR) are generic
    pictograms with no such constraint.`;
  pane.appendChild(hint);
  syncColorInputs();
}

// ---------------------------------------------------------------------------
// UI — design tab
// ---------------------------------------------------------------------------

const COLOR_FIELDS = [
  ['body', 'Body / shell'],
  ['tile', 'Tiles'],
  ['icon', 'Icons'],
  ['logo', 'Logo'],
  ['strapline', 'Strapline'],
  ['accent', 'Accent']
];

function buildColors() {
  const el = document.getElementById('colors');
  el.innerHTML = '';
  colorInputs = colorInputs.filter(r => r.scope !== 'global');
  COLOR_FIELDS.forEach(([k, label]) => {
    const r = document.createElement('div');
    r.className = 'colorRow';
    r.innerHTML = `<span>${label}</span><input type="color">`;
    el.appendChild(r);
    const reg = { scope: 'global', key: k, label };
    registerColorRow(r, reg, hex => applyColor(reg, hex));
  });

  const sw = document.getElementById('swatches');
  sw.innerHTML = '';
  PALETTE.forEach(c => {
    const d = document.createElement('div');
    d.className = 'sw';
    d.style.background = c.hex;
    d.title = c.name;
    // A palette swatch applies to whichever row is selected — including an
    // individual tile, which the old version could not target at all: it
    // always wrote to cfg.colors, so clicking a swatch after selecting a tile
    // silently recoloured the whole product instead.
    d.onclick = () => applyColor(activeColor, c.hex);
    sw.appendChild(d);
  });
  syncColorInputs();
}

// ---------------------------------------------------------------------------
// Logo loading
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Logo STL mounting. You make the logo; this only seats it.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Logo STL. You make the logo; this only seats it on the product.
// ---------------------------------------------------------------------------
const dropStl = document.getElementById('dropStl');
const fileStl = document.getElementById('fileStl');
const stlInfo = document.getElementById('stlInfo');
const btnClearStl = document.getElementById('btnClearStl');

async function handleStl(file) {
  busy.classList.add('on');
  try {
    const norm = await loadLogoMesh(file);
    art.logoMesh = norm;
    const r = norm.report;
    stlInfo.innerHTML =
      `<b>${file.name}</b><br>source ${norm.sourceMM.w} × ${norm.sourceMM.h} × ` +
      `${norm.sourceMM.d} mm · ${r.triangles.toLocaleString()} triangles · ` +
      `${r.closed ? 'watertight' : r.open + ' open edges'}<br>` +
      `Set <b>Logo width</b> on the Dimensions tab for its size on the part, and ` +
      `<b>Imported logo seat</b> for how deep it sinks in.`;
    btnClearStl.style.display = 'block';
    dropStl.querySelector('b').textContent = file.name;
  } catch (e) {
    stlInfo.textContent = 'Could not load: ' + e.message;
    art.logoMesh = null;
  } finally {
    busy.classList.remove('on');
  }
  scheduleRebuild(0);
}

if (dropStl) {
  dropStl.onclick = () => fileStl.click();
  ['dragenter', 'dragover'].forEach(e => dropStl.addEventListener(e, ev => {
    ev.preventDefault(); dropStl.classList.add('hot');
  }));
  ['dragleave', 'drop'].forEach(e => dropStl.addEventListener(e, ev => {
    ev.preventDefault(); dropStl.classList.remove('hot');
  }));
  dropStl.addEventListener('drop', ev => {
    if (ev.dataTransfer.files[0]) handleStl(ev.dataTransfer.files[0]);
  });
  fileStl.onchange = () => { if (fileStl.files[0]) handleStl(fileStl.files[0]); };
  btnClearStl.onclick = () => {
    art.logoMesh = null;
    btnClearStl.style.display = 'none';
    dropStl.querySelector('b').textContent = 'Drop logo STL here';
    stlInfo.textContent = 'No STL loaded — the sign panel prints plain.';
    scheduleRebuild(0);
  };
}

// ---------------------------------------------------------------------------
// Tabs / view tools
// ---------------------------------------------------------------------------
document.querySelectorAll('.tab').forEach(t => t.onclick = () => {
  document.querySelectorAll('.tab').forEach(x => x.classList.toggle('on', x === t));
  document.querySelectorAll('.pane').forEach(p =>
    p.classList.toggle('on', p.dataset.pane === t.dataset.tab));
});

document.querySelectorAll('#vtools [data-view]').forEach(b => b.onclick = () => {
  const box = new THREE.Box3().setFromObject(root);
  const c = box.getCenter(new THREE.Vector3());
  const s = box.getSize(new THREE.Vector3());
  const d = Math.max(s.x, s.y, s.z) * 2.4 + 40;
  const v = b.dataset.view;
  const pos = {
    iso: [c.x + d * .62, c.y + d * .5, c.z + d * .72],
    front: [c.x, c.y, c.z + d * 1.2],
    top: [c.x, c.y + d * 1.25, c.z + 0.01],
    back: [c.x, c.y + d * .2, c.z - d * 1.2]
  }[v];
  camera.position.set(...pos);
  controls.target.copy(c);
});

document.getElementById('btnExplode').onclick = () => {
  exploded = !exploded;
  document.getElementById('btnExplode').textContent = exploded ? 'Assemble' : 'Explode';
  applyExplode();
};

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

function slug() {
  const brand = (document.getElementById('brand').value || '').trim()
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return (brand ? brand + '_' : '') + cfg.productId;
}

function printableParts() {
  const polish = document.getElementById('polish')?.checked;
  return built.parts.filter(p => p.printable).map(p => {
    let geometry = p.geometry;
    if (polish) {
      try { geometry = repairMesh(geometry); }
      catch (e) { console.warn('polish failed for', p.id, e.message); }
    }
    return { ...p, geometry, color: colorFor(p), matrix: null };
  });
}


document.querySelectorAll('[data-x]').forEach(b => b.onclick = async () => {
  if (!built) return;
  cfg.notes = document.getElementById('notes').value;
  const parts = printableParts();
  const s = slug();
  switch (b.dataset.x) {
    case 'stl-all': download(exportSTL(parts), `${s}_all.stl`); break;
    case 'stl-split': parts.forEach(p => download(exportSTL([p]), `${s}_${p.id}.stl`)); break;
    case '3mf': download(export3MF(parts), `${s}.3mf`); break;
    case 'obj': download(exportOBJ(parts), `${s}.obj`); break;
    case 'sheet': download(jobSheet(cfg, built, { brand: document.getElementById('brand').value }), `${s}_production.txt`); break;
    case 'preset': download(exportPreset(cfg), `${s}.json`); break;
    case 'qr': {
      const withQR = cfg.tiles.map((t, i) => ({ t, i })).filter(x => x.t.icon === 'qr' && x.t.link);
      if (!withQR.length) { alert('No tile is set to QR with a destination link.'); break; }
      for (const { t, i } of withQR) {
        const cv = qrCanvas(t.link, 2048, { ecc: t.qrEcc || 'M' });
        const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
        download(blob, `${s}_tile${i + 1}_qr.png`);
      }
      break;
    }
  }
});

document.getElementById('btnExportAll').onclick = async () => {
  if (!built) return;
  cfg.notes = document.getElementById('notes').value;
  const parts = printableParts();
  const s = slug();
  parts.forEach(p => download(exportSTL([p]), `${s}_${p.id}.stl`));
  download(export3MF(parts), `${s}.3mf`);
  download(jobSheet(cfg, built, { brand: document.getElementById('brand').value }), `${s}_production.txt`);
  download(exportPreset(cfg), `${s}.json`);
  for (let i = 0; i < cfg.tiles.length; i++) {
    const t = cfg.tiles[i];
    if (t.icon !== 'qr' || !t.link) continue;
    const cv = qrCanvas(t.link, 2048, { ecc: t.qrEcc || 'M' });
    const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
    download(blob, `${s}_tile${i + 1}_qr.png`);
  }
};

document.getElementById('btnSavePreset').onclick = () => {
  cfg.notes = document.getElementById('notes').value;
  download(exportPreset(cfg), `${slug()}.json`);
};

document.getElementById('btnPreset').onclick = () => {
  const i = document.createElement('input');
  i.type = 'file'; i.accept = '.json';
  i.onchange = async () => {
    try {
      const j = JSON.parse(await i.files[0].text());
      if (!PRODUCTS[j.productId]) throw new Error('Unknown product in preset');
      cfg = { ...defaultConfig(j.productId), ...j };
      buildRail(); buildDims(); buildTiles(); buildColors();
      camera.userData.framedFor = null;
      scheduleRebuild(0);
    } catch (e) { alert('Could not load preset: ' + e.message); }
  };
  i.click();
};

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
buildRail();
buildDims();
buildTiles();
buildColors();
resize();
rebuild();

// Expose for the console / automation.
window.TapStudio = {
  get config() { return cfg; },
  set config(v) { cfg = v; buildRail(); buildDims(); buildTiles(); buildColors(); rebuild(); },
  get built() { return built; },
  rebuild, PRODUCTS, imageToShapes
};
