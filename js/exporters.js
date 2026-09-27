// ============================================================================
// Exporters: binary STL, coloured 3MF, OBJ, JSON preset, print sheet.
// ============================================================================
import * as THREE from 'three';

/** World-space triangle list for a geometry (+ optional matrix). */
function triangles(geometry, matrix) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  if (matrix) g.applyMatrix4(matrix);
  const pos = g.attributes.position.array;
  return { pos, count: pos.length / 9 };
}

// ---------------------------------------------------------------------------
// STL (binary)
// ---------------------------------------------------------------------------
export function exportSTL(parts, { header = 'Tap Studio Pipeline' } = {}) {
  const sets = parts.map(p => triangles(p.geometry, p.matrix));
  const total = sets.reduce((a, s) => a + s.count, 0);
  const buf = new ArrayBuffer(84 + total * 50);
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);

  const head = header.slice(0, 79);
  for (let i = 0; i < head.length; i++) bytes[i] = head.charCodeAt(i) & 0x7f;
  view.setUint32(80, total, true);

  let o = 84;
  const n = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(),
        c = new THREE.Vector3(), ab = new THREE.Vector3(), ac = new THREE.Vector3();

  for (const s of sets) {
    for (let t = 0; t < s.count; t++) {
      const i = t * 9;
      a.set(s.pos[i], s.pos[i + 1], s.pos[i + 2]);
      b.set(s.pos[i + 3], s.pos[i + 4], s.pos[i + 5]);
      c.set(s.pos[i + 6], s.pos[i + 7], s.pos[i + 8]);
      ab.subVectors(b, a); ac.subVectors(c, a);
      n.crossVectors(ab, ac).normalize();
      view.setFloat32(o, n.x, true); view.setFloat32(o + 4, n.y, true); view.setFloat32(o + 8, n.z, true);
      view.setFloat32(o + 12, a.x, true); view.setFloat32(o + 16, a.y, true); view.setFloat32(o + 20, a.z, true);
      view.setFloat32(o + 24, b.x, true); view.setFloat32(o + 28, b.y, true); view.setFloat32(o + 32, b.z, true);
      view.setFloat32(o + 36, c.x, true); view.setFloat32(o + 40, c.y, true); view.setFloat32(o + 44, c.z, true);
      view.setUint16(o + 48, 0, true);
      o += 50;
    }
  }
  return new Blob([buf], { type: 'model/stl' });
}

// ---------------------------------------------------------------------------
// OBJ (handy for Blender round-tripping)
// ---------------------------------------------------------------------------
export function exportOBJ(parts) {
  let out = '# Tap Studio Pipeline\n';
  let base = 1;
  for (const p of parts) {
    const g = p.geometry.index ? p.geometry.toNonIndexed() : p.geometry.clone();
    if (p.matrix) g.applyMatrix4(p.matrix);
    const pos = g.attributes.position.array;
    out += `o ${p.id}\n`;
    for (let i = 0; i < pos.length; i += 3) out += `v ${pos[i].toFixed(4)} ${pos[i + 1].toFixed(4)} ${pos[i + 2].toFixed(4)}\n`;
    const n = pos.length / 9;
    for (let t = 0; t < n; t++) out += `f ${base + t * 3} ${base + t * 3 + 1} ${base + t * 3 + 2}\n`;
    base += pos.length / 3;
  }
  return new Blob([out], { type: 'text/plain' });
}

// ---------------------------------------------------------------------------
// 3MF — multi-object with per-object colour, so slicers open it ready to go.
// Written by hand (a 3MF is a zip); we build a STORED (uncompressed) zip.
// ---------------------------------------------------------------------------
function crc32(buf) {
  let c, table = crc32.table;
  if (!table) {
    table = crc32.table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function zipStore(files) {
  const enc = new TextEncoder();
  const chunks = [], central = [];
  let offset = 0;

  for (const f of files) {
    const nameBuf = enc.encode(f.name);
    const data = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
    const crc = crc32(data);

    const local = new Uint8Array(30 + nameBuf.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true); lv.setUint16(6, 0, true); lv.setUint16(8, 0, true);
    lv.setUint16(10, 0, true); lv.setUint16(12, 0, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, nameBuf.length, true); lv.setUint16(28, 0, true);
    local.set(nameBuf, 30);
    chunks.push(local, data);

    const cd = new Uint8Array(46 + nameBuf.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true); cv.setUint16(6, 20, true);
    cv.setUint16(8, 0, true); cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true); cv.setUint16(14, 0, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true); cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBuf.length, true);
    cv.setUint32(42, offset, true);
    cd.set(nameBuf, 46);
    central.push(cd);
    offset += local.length + data.length;
  }

  const cdSize = central.reduce((a, c) => a + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true);
  ev.setUint32(12, cdSize, true); ev.setUint32(16, offset, true);

  return new Blob([...chunks, ...central, end], { type: 'application/vnd.ms-package.3dmanufacturing-3dmodel+xml' });
}

export function export3MF(parts, { unit = 'millimeter' } = {}) {
  const colors = [...new Set(parts.map(p => (p.color || '#cccccc').toUpperCase()))];
  const baseMaterials = colors
    .map((c, i) => `      <base name="Colour ${i + 1}" displaycolor="${c}FF"/>`)
    .join('\n');

  let objXML = '', buildXML = '', id = 2;
  for (const p of parts) {
    const g = p.geometry.index ? p.geometry.toNonIndexed() : p.geometry.clone();
    if (p.matrix) g.applyMatrix4(p.matrix);
    const pos = g.attributes.position.array;
    const nV = pos.length / 3;
    const verts = [];
    for (let i = 0; i < pos.length; i += 3) {
      verts.push(`<vertex x="${pos[i].toFixed(4)}" y="${pos[i + 1].toFixed(4)}" z="${pos[i + 2].toFixed(4)}"/>`);
    }
    const tris = [];
    for (let t = 0; t < nV / 3; t++) tris.push(`<triangle v1="${t * 3}" v2="${t * 3 + 1}" v3="${t * 3 + 2}"/>`);
    const pIndex = colors.indexOf((p.color || '#cccccc').toUpperCase());
    objXML += `  <object id="${id}" type="model" pid="1" pindex="${pIndex}" name="${escapeXML(p.name || p.id)}">
    <mesh><vertices>${verts.join('')}</vertices><triangles>${tris.join('')}</triangles></mesh>
  </object>\n`;
    buildXML += `  <item objectid="${id}"/>\n`;
    id++;
  }

  const model = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="${unit}" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:m="http://schemas.microsoft.com/3dmanufacturing/material/2015/02">
  <metadata name="Application">Tap Studio Pipeline</metadata>
  <resources>
    <m:basematerials id="1">
${baseMaterials}
    </m:basematerials>
${objXML}  </resources>
  <build>
${buildXML}  </build>
</model>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
</Types>`;

  const rels = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>`;

  return zipStore([
    { name: '[Content_Types].xml', data: contentTypes },
    { name: '_rels/.rels', data: rels },
    { name: '3D/3dmodel.model', data: model }
  ]);
}

function escapeXML(s) {
  return String(s).replace(/[<>&"']/g, ch =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[ch]));
}

// ---------------------------------------------------------------------------
// Job sheet — everything the person at the printer and the NFC writer needs
// ---------------------------------------------------------------------------
export function jobSheet(cfg, built, extra = {}) {
  const p = built.product;
  const L = [];
  L.push(`TAP STUDIO — PRODUCTION SHEET`);
  L.push(`=`.repeat(58));
  L.push(`Product      : ${p.name} (${cfg.productId})   ${p.price}`);
  L.push(`Generated    : ${new Date().toISOString().slice(0, 19).replace('T', ' ')}`);
  if (extra.brand) L.push(`Customer     : ${extra.brand}`);
  L.push(`Logo mode    : ${cfg.logoMode}`);
  L.push(`Overall size : ${built.bbox.width.toFixed(1)} × ${built.bbox.height.toFixed(1)} × ${built.bbox.depth.toFixed(1)} mm`);
  L.push('');
  L.push(`COLOURS`);
  Object.entries(cfg.colors).forEach(([k, v]) => L.push(`  ${k.padEnd(8)} ${v}`));
  L.push('');
  L.push(`PARTS`);
  built.parts.filter(x => x.printable).forEach(x => {
    L.push(`  [${x.id}] ${x.name}`);
    L.push(`      material: ${x.material}`);
    if (x.note) L.push(`      note    : ${x.note}`);
  });
  const artOnly = built.parts.filter(x => !x.printable);
  if (artOnly.length) {
    L.push('');
    L.push(`PRINT / UV ARTWORK (not 3D printed)`);
    artOnly.forEach(x => L.push(`  [${x.id}] ${x.name}`));
  }
  L.push('');
  L.push(`NFC PROGRAMMING`);
  cfg.tiles.forEach((t, i) => L.push(`  Tile ${i + 1}  ${String(t.icon).padEnd(16)} -> ${t.link || '(not set)'}`));
  L.push('');
  L.push(`HARDWARE`);
  L.push(`  NFC inlay   ø25 mm NTAG215 wet inlay`);
  L.push(`  Magnets     ø6 × 2 mm N35 neodymium`);
  L.push('');
  L.push(`SUGGESTED PRINT SETTINGS`);
  L.push(`  Layer height   0.12 mm (0.08 mm for lithophane panels)`);
  L.push(`  Walls          3   Top/bottom 5   Infill 20% gyroid`);
  L.push(`  Lithophane     100% infill, 0 top/bottom, 0.4 mm nozzle`);
  L.push(`  Supports       none required for any part in this set`);
  L.push('');
  L.push(`PARAMETERS`);
  Object.entries(cfg.params).forEach(([k, v]) => L.push(`  ${k.padEnd(18)} ${v}`));
  if (cfg.notes) { L.push(''); L.push(`NOTES`); L.push('  ' + cfg.notes); }
  return new Blob([L.join('\n')], { type: 'text/plain' });
}

// ---------------------------------------------------------------------------
// Traced logo contours — the handoff to the exact-CAD backend.
// The browser does raster -> vector; CadQuery turns these polygons into real
// B-rep faces, so the production model never sees a triangle-soup logo.
// ---------------------------------------------------------------------------
export function exportContours(shapes, targetWidthMM, divisions = 96) {
  const poly = p => p.getPoints(divisions).map(v => [v.x, v.y]);
  const raw = (shapes || []).map(s => ({
    outer: poly(s),
    holes: (s.holes || []).map(poly)
  })).filter(s => s.outer.length >= 3);

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  raw.forEach(s => s.outer.forEach(([x, y]) => {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }));
  const w = maxX - minX;
  const k = w > 0 && targetWidthMM > 0 ? targetWidthMM / w : 1;
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const xf = ([x, y]) => [+(((x - cx) * k).toFixed(4)), +(((y - cy) * k).toFixed(4))];

  const data = {
    units: 'mm',
    generator: 'Tap Studio browser tracer',
    targetWidth: targetWidthMM,
    shapes: raw.map(s => ({ outer: s.outer.map(xf), holes: s.holes.map(h => h.map(xf)) }))
  };
  return new Blob([JSON.stringify(data)], { type: 'application/json' });
}

export function exportPreset(cfg) {
  return new Blob([JSON.stringify(cfg, null, 2)], { type: 'application/json' });
}

export function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
