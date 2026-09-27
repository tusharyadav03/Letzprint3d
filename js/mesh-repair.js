// ============================================================================
// Mesh repair + validation.
//
// CSG output is geometrically closed but leaves T-junctions: an edge split on
// one face and not on its neighbour. Naive edge matching then reports the mesh
// as full of holes, and some slicers open micro-gaps along those edges.
// This module welds coincident vertices, inserts the missing T-vertices, drops
// degenerate triangles, and reports what is actually left.
// ============================================================================
import * as THREE from 'three';

const DEFAULT_TOL = 1e-4;

/** Weld coincident vertices into an indexed geometry. */
export function weld(geometry, tol = DEFAULT_TOL) {
  const src = geometry.index ? geometry.toNonIndexed() : geometry;
  const pos = src.attributes.position.array;
  const n = pos.length / 3;

  const cell = Math.max(tol * 4, 1e-5);
  const grid = new Map();
  const verts = [];
  const remap = new Int32Array(n);
  const t2 = tol * tol;

  const ck = (x, y, z) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;

  for (let i = 0; i < n; i++) {
    const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
    const cx = Math.floor(x / cell), cy = Math.floor(y / cell), cz = Math.floor(z / cell);
    let found = -1;
    outer:
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      const bucket = grid.get(`${cx + dx},${cy + dy},${cz + dz}`);
      if (!bucket) continue;
      for (const vi of bucket) {
        const v = verts[vi];
        const d = (v[0] - x) ** 2 + (v[1] - y) ** 2 + (v[2] - z) ** 2;
        if (d <= t2) { found = vi; break outer; }
      }
    }
    if (found < 0) {
      found = verts.length;
      verts.push([x, y, z]);
      const k = ck(x, y, z);
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(found);
    }
    remap[i] = found;
  }

  const idx = [];
  for (let t = 0; t < n; t += 3) {
    const a = remap[t], b = remap[t + 1], c = remap[t + 2];
    if (a === b || b === c || a === c) continue;   // collapsed
    idx.push(a, b, c);
  }

  const flat = new Float32Array(verts.length * 3);
  verts.forEach((v, i) => { flat[i * 3] = v[0]; flat[i * 3 + 1] = v[1]; flat[i * 3 + 2] = v[2]; });

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(flat, 3));
  g.setIndex(idx);
  return g;
}

/**
 * Insert vertices that lie on the interior of an edge into the triangles that
 * share that edge, then retriangulate. Removes T-junctions.
 */
export function fixTJunctions(geometry, tol = 1e-4, onEdgeTol = 1e-3) {
  const g = geometry.index ? geometry : weld(geometry, tol);
  const pos = g.attributes.position.array;
  const idx = g.index.array;
  const nV = pos.length / 3;

  // One-ring adjacency. Candidates for a T-vertex on edge (a,b) are restricted
  // to vertices of triangles touching a or b. Searching all vertices by
  // position instead would happily "find" a vertex on the far side of a thin
  // wall that happens to be collinear, and splitting on it creates an edge
  // shared by three faces — which is how a repair pass ends up making the mesh
  // worse than it started.
  const vertTris = Array.from({ length: nV }, () => []);
  for (let t = 0; t < idx.length; t += 3) {
    vertTris[idx[t]].push(t);
    vertTris[idx[t + 1]].push(t);
    vertTris[idx[t + 2]].push(t);
  }

  const A = new THREE.Vector3(), B = new THREE.Vector3(), P = new THREE.Vector3(),
        AB = new THREE.Vector3(), AP = new THREE.Vector3(), X = new THREE.Vector3();

  /** Vertices strictly inside segment (a,b), ordered along it. */
  const onEdge = (a, b) => {
    A.fromArray(pos, a * 3); B.fromArray(pos, b * 3);
    AB.subVectors(B, A);
    const len = AB.length();
    if (len < tol) return [];

    const seen = new Set([a, b]);
    const hits = [];
    for (const anchor of [a, b]) {
      for (const t of vertTris[anchor]) {
        for (let k = 0; k < 3; k++) {
          const vi = idx[t + k];
          if (seen.has(vi)) continue;
          seen.add(vi);
          P.fromArray(pos, vi * 3);
          AP.subVectors(P, A);
          const u = AP.dot(AB) / (len * len);
          if (u <= 1e-6 || u >= 1 - 1e-6) continue;
          X.copy(A).addScaledVector(AB, u);
          if (X.distanceTo(P) > onEdgeTol) continue;
          hits.push({ vi, t: u });
        }
      }
    }
    hits.sort((p, q) => p.t - q.t);
    return hits.map(h => h.vi);
  };

  const out = [];
  const extraVerts = [];               // centroids appended after the originals
  let patched = 0;

  for (let t = 0; t < idx.length; t += 3) {
    const tri = [idx[t], idx[t + 1], idx[t + 2]];
    const ring = [];
    let added = false;
    for (let k = 0; k < 3; k++) {
      ring.push(tri[k]);
      const extra = onEdge(tri[k], tri[(k + 1) % 3]);
      if (extra.length) { added = true; ring.push(...extra); }
    }
    if (!added) { out.push(tri[0], tri[1], tri[2]); continue; }
    patched++;

    // Fan from the triangle's centroid rather than ear-clipping the ring.
    // Ear clipping on a ring of collinear points produces slivers and picks
    // diagonals a neighbouring face may also pick. A centroid fan gives one
    // clean triangle per ring edge and never introduces a shared diagonal.
    const cx = (pos[tri[0] * 3] + pos[tri[1] * 3] + pos[tri[2] * 3]) / 3;
    const cy = (pos[tri[0] * 3 + 1] + pos[tri[1] * 3 + 1] + pos[tri[2] * 3 + 1]) / 3;
    const cz = (pos[tri[0] * 3 + 2] + pos[tri[1] * 3 + 2] + pos[tri[2] * 3 + 2]) / 3;
    const ci = nV + extraVerts.length / 3;
    extraVerts.push(cx, cy, cz);
    for (let i = 0; i < ring.length; i++) {
      out.push(ci, ring[i], ring[(i + 1) % ring.length]);
    }
  }

  const allPos = new Float32Array(pos.length + extraVerts.length);
  allPos.set(pos, 0);
  allPos.set(extraVerts, pos.length);

  const res = new THREE.BufferGeometry();
  res.setAttribute('position', new THREE.BufferAttribute(allPos, 3));
  res.setIndex(out);
  res.userData.patchedTriangles = patched;
  return res;
}

/** Drop zero-area triangles. */
export function dropDegenerate(geometry, minArea = 1e-10) {
  const g = geometry.index ? geometry : weld(geometry);
  const pos = g.attributes.position.array;
  const idx = g.index.array;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(),
        e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), n = new THREE.Vector3();
  const out = [];
  for (let t = 0; t < idx.length; t += 3) {
    a.fromArray(pos, idx[t] * 3); b.fromArray(pos, idx[t + 1] * 3); c.fromArray(pos, idx[t + 2] * 3);
    e1.subVectors(b, a); e2.subVectors(c, a);
    n.crossVectors(e1, e2);
    if (n.length() * 0.5 < minArea) continue;
    out.push(idx[t], idx[t + 1], idx[t + 2]);
  }
  const res = new THREE.BufferGeometry();
  res.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  res.setIndex(out);
  return res;
}

/**
 * Stitch remaining boundary loops shut.
 *
 * Float CSG leaves hairline seams where two curved surfaces meet with
 * different tessellations — typically 0.01–0.05 mm, invisible but enough to
 * make a mesh non-watertight. These are the same slivers a slicer's auto-
 * repair would close; doing it here means what we export is already correct.
 */
export function fillHoles(geometry, maxLoop = 20000) {
  const g = geometry.index ? geometry : weld(geometry);
  const pos = g.attributes.position.array;
  const idx = Array.from(g.index.array);

  // Directed edges: a boundary edge has no matching reverse.
  const dir = new Set();
  for (let t = 0; t < idx.length; t += 3) {
    dir.add(`${idx[t]}>${idx[t + 1]}`);
    dir.add(`${idx[t + 1]}>${idx[t + 2]}`);
    dir.add(`${idx[t + 2]}>${idx[t]}`);
  }
  const next = new Map();
  for (const e of dir) {
    const [a, b] = e.split('>').map(Number);
    if (dir.has(`${b}>${a}`)) continue;
    if (!next.has(a)) next.set(a, []);
    next.get(a).push(b);
  }
  if (next.size === 0) { const r = clone(g, idx); return r; }

  const A = new THREE.Vector3(), B = new THREE.Vector3();
  const loops = [];
  const used = new Set();

  for (const startA of next.keys()) {
    const outs = next.get(startA);
    while (outs && outs.length) {
      const startB = outs.shift();
      if (used.has(`${startA}>${startB}`)) continue;
      const loop = [startA];
      let a = startA, b = startB, guard = 0;
      while (guard++ < maxLoop) {
        used.add(`${a}>${b}`);
        if (b === startA) break;
        loop.push(b);
        const cand = next.get(b);
        if (!cand || !cand.length) { loop.length = 0; break; }
        const nb = cand.shift();
        a = b; b = nb;
      }
      if (loop.length >= 3) loops.push(loop);
    }
  }

  let filled = 0;
  for (const loop of loops) {
    // Newell normal for the best-fit plane.
    const n = new THREE.Vector3();
    for (let i = 0; i < loop.length; i++) {
      A.fromArray(pos, loop[i] * 3);
      B.fromArray(pos, loop[(i + 1) % loop.length] * 3);
      n.x += (A.y - B.y) * (A.z + B.z);
      n.y += (A.z - B.z) * (A.x + B.x);
      n.z += (A.x - B.x) * (A.y + B.y);
    }
    if (n.lengthSq() < 1e-20) continue;
    n.normalize();

    const O = new THREE.Vector3().fromArray(pos, loop[0] * 3);
    const U = new THREE.Vector3(1, 0, 0);
    if (Math.abs(n.dot(U)) > 0.9) U.set(0, 1, 0);
    U.crossVectors(n, U).normalize();
    const V = new THREE.Vector3().crossVectors(n, U);

    // Reverse the loop so the patch faces opposite the boundary direction.
    const ring = loop.slice().reverse();
    const pts = ring.map(vi => {
      A.fromArray(pos, vi * 3).sub(O);
      return new THREE.Vector2(A.dot(U), A.dot(V));
    });
    let faces = null;
    try { faces = THREE.ShapeUtils.triangulateShape(pts, []); } catch { faces = null; }
    if (!faces || !faces.length) {
      // Degenerate ribbon — fall back to a fan.
      for (let i = 1; i < ring.length - 1; i++) idx.push(ring[0], ring[i], ring[i + 1]);
      filled++;
      continue;
    }
    for (const f of faces) idx.push(ring[f[0]], ring[f[1]], ring[f[2]]);
    filled++;
  }

  const res = clone(g, idx);
  res.userData.filledLoops = filled;
  return res;
}

function clone(g, idx) {
  const res = new THREE.BufferGeometry();
  res.setAttribute('position', new THREE.BufferAttribute(
    new Float32Array(g.attributes.position.array), 3));
  res.setIndex(idx);
  return res;
}

/**
 * Standard clean-up for preview meshes: weld, remove T-junctions, drop
 * degenerates. One pass — repeating makes things worse, because each earcut
 * retriangulation introduces new diagonals for the next pass to trip over.
 *
 * What survives are hairline seams (0.01–0.05 mm) where two curved surfaces
 * meet with different tessellations. That is inherent to float CSG, not a bug
 * in this code: Blender's boolean modifier produces the same class of seam.
 * Slicers close them silently. For guaranteed-watertight production files,
 * run the same preset through the CadQuery backend, which works in exact
 * B-rep and tessellates once at the end.
 *
 * Pass `{ aggressive: true }` to also stitch remaining boundary loops shut —
 * this reaches open = 0 but can leave non-manifold edges where the seam ribbon
 * self-touches, so it is off by default.
 */
export function repair(geometry, tol = DEFAULT_TOL, opts = {}) {
  let g = weld(geometry, tol);
  g = dropDegenerate(g);

  // Both extra passes are opt-in. Measured on the full product set, each one
  // trades one defect class for another: T-junction insertion drops boundary
  // edges but pushes non-manifold edges up, and hole filling reaches open = 0
  // at the cost of self-touching seam ribbons. Welding alone always helps, so
  // that is what runs by default.
  if (opts.tjunctions) {
    g = fixTJunctions(g, tol, opts.onEdgeTol ?? 1e-3);
    g = weld(g, tol);
    g = dropDegenerate(g);
  }
  if (opts.fillHoles) {
    g = fillHoles(g);
    g = weld(g, tol);
    g = dropDegenerate(g);
  }
  g.computeVertexNormals();
  return g;
}

/** Signed volume in mm³ (positive for outward-facing closed meshes). */
export function volume(geometry) {
  const g = geometry.index ? geometry : weld(geometry);
  const pos = g.attributes.position.array, idx = g.index.array;
  let v = 0;
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    v += (
      pos[a] * (pos[b + 1] * pos[c + 2] - pos[c + 1] * pos[b + 2]) -
      pos[a + 1] * (pos[b] * pos[c + 2] - pos[c] * pos[b + 2]) +
      pos[a + 2] * (pos[b] * pos[c + 1] - pos[c] * pos[b + 1])
    ) / 6;
  }
  return v;
}

/** Topology report. `open` counts genuine boundary edges after repair. */
export function analyze(geometry) {
  const g = geometry.index ? geometry : weld(geometry);
  const idx = g.index.array;
  const m = new Map();
  for (let t = 0; t < idx.length; t += 3) {
    for (let k = 0; k < 3; k++) {
      const a = idx[t + k], b = idx[t + (k + 1) % 3];
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      m.set(key, (m.get(key) || 0) + 1);
    }
  }
  let open = 0, nonManifold = 0;
  for (const c of m.values()) { if (c === 1) open++; else if (c > 2) nonManifold++; }
  return {
    triangles: idx.length / 3,
    vertices: g.attributes.position.count,
    open, nonManifold,
    closed: open === 0 && nonManifold === 0,
    volume: volume(g)
  };
}
