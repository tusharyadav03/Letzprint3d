// ============================================================================
// Logo STL mounting.
//
// The logo stops being this pipeline's problem. You make it however you like —
// Tinkercad, Blender, Fusion, a vectoriser, a designer — and this seats it on
// the product correctly.
//
// "Correctly" is the whole job, and it is more than an import button:
//
//   · scaled in MILLIMETRES, not by eye
//   · oriented so its flat back faces the panel
//   · seated in a recess cut to match, so it sits flush instead of floating
//   · welded and checked, because most STLs arrive with open edges
//
// Nothing here guesses at your artwork. It only positions what you supply.
// ============================================================================
import * as THREE from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { weld, analyze } from './mesh-repair.js';

/**
 * Load an STL/OBJ-style mesh file into a normalised geometry.
 *
 * Normalised means: centred on the origin in X/Y, back face at z = 0, front
 * standing in +z. That is the convention the placement code expects, so a
 * logo exported from any tool lands the same way.
 */
export async function loadLogoMesh(file, opts = {}) {
  const buf = await file.arrayBuffer();
  let g;
  try {
    g = new STLLoader().parse(buf);
  } catch (e) {
    throw new Error(`could not read ${file.name} as STL: ${e.message}`);
  }
  if (!g.attributes.position || g.attributes.position.count < 3) {
    throw new Error('that file contains no geometry');
  }

  g = weld(g, 1e-4);
  const before = analyze(g);

  // Most logo exports are built on the XY plane and extruded in +Z, which is
  // what we want. `uprightAxis` covers tools that export Y-up.
  if (opts.uprightAxis === 'y') g.rotateX(-Math.PI / 2);
  if (opts.rotateZ) g.rotateZ(opts.rotateZ * Math.PI / 180);

  g.computeBoundingBox();
  const b = g.boundingBox;
  const size = new THREE.Vector3().subVectors(b.max, b.min);

  // Centre in X/Y, put the back face on z = 0.
  g.translate(-(b.min.x + size.x / 2), -(b.min.y + size.y / 2), -b.min.z);
  g.computeVertexNormals();

  return {
    geometry: g,
    sourceMM: { w: +size.x.toFixed(2), h: +size.y.toFixed(2), d: +size.z.toFixed(2) },
    report: before
  };
}

/**
 * Scale a normalised logo mesh to a target width and seat it on a face.
 *
 * @param frame   faceFrame from shapes.js
 * @param norm    result of loadLogoMesh
 * @param opts    { widthMM, maxHeightMM, u, v, recessMM, clearanceMM }
 * @returns { mesh, cutter, fitted }
 *
 * `recessMM` is how deep the logo sinks into the panel. Zero leaves it fully
 * proud; anything more cuts a matching pocket so the logo drops in and only
 * the part above the recess shows.
 */
export function mountOnFace(frame, norm, opts = {}) {
  const src = norm.sourceMM;
  if (!(src.w > 0) || !(src.h > 0)) return { mesh: null, cutter: null, fitted: null };

  const targetW = opts.widthMM ?? 40;
  const maxH = opts.maxHeightMM ?? 0;
  let k = targetW / src.w;
  if (maxH > 0) k = Math.min(k, maxH / src.h);

  const g = norm.geometry.clone();
  g.scale(k, k, k);          // uniform — non-uniform would shear the artwork

  const w = src.w * k, h = src.h * k, d = src.d * k;
  const recess = Math.min(opts.recessMM ?? 0, d - 0.2);   // never swallow it whole
  const u = opts.u ?? 0, v = opts.v ?? 0;

  // Seat: the back face sits at -recess, so `d - recess` stands proud.
  const mesh = frame.place(g, u, v, -recess);

  // Matching pocket, with a printing clearance so it actually drops in.
  let cutter = null;
  if (recess > 0.02) {
    const clr = opts.clearanceMM ?? 0.15;
    const pocket = new THREE.BoxGeometry(w + 2 * clr, h + 2 * clr, recess + 2);
    pocket.translate(0, 0, (recess + 2) / 2);
    cutter = frame.place(pocket, u, v, -recess);
  }

  return {
    mesh, cutter,
    fitted: {
      widthMM: +w.toFixed(2), heightMM: +h.toFixed(2), depthMM: +d.toFixed(2),
      proudMM: +(d - recess).toFixed(2), recessMM: +recess.toFixed(2), scale: +k.toFixed(4)
    }
  };
}

/**
 * Print-readiness of an imported logo, against the nozzle actually fitted.
 * Reports what the importer cannot fix so you find out now, not mid-print.
 */
export function mountNotes(norm, fitted, nozzle = 0.4) {
  const notes = [];
  const floor = nozzle * 2;
  const r = norm.report;

  if (!r.closed) {
    notes.push({
      level: 'warn',
      text: `Imported mesh is not watertight (${r.open} open edges). Slicers usually ` +
            `repair this, but the source tool exported a mesh with holes.`
    });
  }
  if (fitted.proudMM < floor) {
    notes.push({
      level: 'error',
      text: `Logo stands only ${fitted.proudMM} mm proud — under the ${floor} mm floor ` +
            `for a ${nozzle} mm nozzle. Reduce the recess or use a thicker logo.`
    });
  }
  if (fitted.scale < 0.05 || fitted.scale > 20) {
    notes.push({
      level: 'warn',
      text: `Scaled by ${fitted.scale}× — the source is ${norm.sourceMM.w} mm wide. ` +
            `Check the exporting tool's units; a 25.4× error means inches.`
    });
  }
  if (r.triangles > 300000) {
    notes.push({
      level: 'warn',
      text: `${r.triangles.toLocaleString()} triangles. It will slice, but decimating ` +
            `in your modeller first will keep the file manageable.`
    });
  }
  return notes;
}
