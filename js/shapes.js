// ============================================================================
// Shape / geometry primitives shared by every product family.
// Pure maths + THREE.Shape construction. No CSG here.
// ============================================================================
import * as THREE from 'three';

export const DEG = Math.PI / 180;

/** Rounded rectangle centred on the origin, in the shape XY plane. */
export function roundedRect(w, h, r) {
  r = Math.max(0, Math.min(r, Math.min(w, h) / 2 - 1e-4));
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  if (r <= 1e-4) {
    s.moveTo(x, y); s.lineTo(x + w, y); s.lineTo(x + w, y + h); s.lineTo(x, y + h); s.closePath();
    return s;
  }
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
  s.lineTo(x + w, y + h - r);
  s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
  s.lineTo(x + r, y + h);
  s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(x, y + r);
  s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
  s.closePath();
  return s;
}

/** Circle shape centred on the origin. */
export function circleShape(radius, segments = 96) {
  const s = new THREE.Shape();
  s.absarc(0, 0, radius, 0, Math.PI * 2, false);
  s.curveSegments = segments;
  return s;
}

/** Ring (annulus) shape. */
export function ringShape(outerR, innerR, segments = 96) {
  const s = circleShape(outerR, segments);
  const hole = new THREE.Path();
  hole.absarc(0, 0, innerR, 0, Math.PI * 2, true);
  s.holes.push(hole);
  return s;
}

/**
 * Polygon with filleted corners. Points are [x, y] pairs, CCW.
 * Handles convex and mildly concave outlines; radius is clamped per corner.
 */
export function roundedPolygon(pts, radius) {
  const n = pts.length;
  const s = new THREE.Shape();
  const get = (i) => pts[(i % n + n) % n];
  const corners = [];

  for (let i = 0; i < n; i++) {
    const p = get(i), a = get(i - 1), b = get(i + 1);
    const v1 = [a[0] - p[0], a[1] - p[1]];
    const v2 = [b[0] - p[0], b[1] - p[1]];
    const l1 = Math.hypot(v1[0], v1[1]) || 1;
    const l2 = Math.hypot(v2[0], v2[1]) || 1;
    const u1 = [v1[0] / l1, v1[1] / l1];
    const u2 = [v2[0] / l2, v2[1] / l2];
    let dot = Math.max(-1, Math.min(1, u1[0] * u2[0] + u1[1] * u2[1]));
    const ang = Math.acos(dot);
    let r = Math.min(radius, l1 / 2.02, l2 / 2.02);
    if (ang < 1e-3 || Math.abs(Math.PI - ang) < 1e-3) r = 0;
    const tanLen = r > 0 ? r / Math.tan(ang / 2) : 0;
    const t1 = [p[0] + u1[0] * tanLen, p[1] + u1[1] * tanLen];
    const t2 = [p[0] + u2[0] * tanLen, p[1] + u2[1] * tanLen];
    corners.push({ p, t1, t2, r });
  }

  s.moveTo(corners[0].t2[0], corners[0].t2[1]);
  for (let i = 1; i <= n; i++) {
    const c = corners[i % n];
    s.lineTo(c.t1[0], c.t1[1]);
    if (c.r > 0) s.quadraticCurveTo(c.p[0], c.p[1], c.t2[0], c.t2[1]);
  }
  s.closePath();
  return s;
}

/**
 * Inset a convex polygon using exact edge-line offsetting.
 * `t` may be a number (uniform) or an array of per-edge offsets, where edge i
 * runs from pts[i] to pts[i+1]. Points CCW; returns a new CCW polygon.
 */
export function insetConvex(pts, t) {
  const n = pts.length;
  const off = (i) => (Array.isArray(t) ? t[i] : t);
  const lines = [];
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    // For CCW winding the inward normal of edge (a->b) is (-dy, dx)/len.
    const nx = -dy / len, ny = dx / len;
    const k = off(i);
    lines.push({ px: a[0] + nx * k, py: a[1] + ny * k, dx: dx / len, dy: dy / len });
  }
  const out = [];
  for (let i = 0; i < n; i++) {
    const L1 = lines[(i - 1 + n) % n], L2 = lines[i];
    const det = L1.dx * (-L2.dy) - L1.dy * (-L2.dx);
    if (Math.abs(det) < 1e-9) { out.push([L2.px, L2.py]); continue; }
    const rx = L2.px - L1.px, ry = L2.py - L1.py;
    const s = (rx * (-L2.dy) - ry * (-L2.dx)) / det;
    out.push([L1.px + L1.dx * s, L1.py + L1.dy * s]);
  }
  return out;
}

/**
 * Extrude a shape (or shape array) by `depth` along +Z, optional bevel.
 *
 * three's default `bevelOffset: 0` grows the silhouette outward by bevelSize —
 * a 2 mm end rounding pushed the bar 2 mm below the build plate and 4 mm wider
 * than its own width, so it no longer sat flat. Offsetting by -bevelSize makes
 * the bevel start inset and finish exactly on the outline, which rounds the
 * ends without changing the overall size.
 */
export function extrude(shape, depth, opts = {}) {
  const bevelSize = opts.bevelSize ?? 0.4;
  const g = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: !!opts.bevel,
    bevelThickness: opts.bevelThickness ?? 0.4,
    bevelSize,
    bevelOffset: opts.bevelOffset ?? -bevelSize,
    bevelSegments: opts.bevelSegments ?? 3,
    curveSegments: opts.curveSegments ?? 24,
    steps: 1
  });
  g.computeVertexNormals();
  return g;
}

/** Axis-aligned cylinder along +Z, base at z=0. */
export function cylinderZ(radius, height, segments = 48) {
  const g = new THREE.CylinderGeometry(radius, radius, height, segments, 1, false);
  g.rotateX(Math.PI / 2);
  g.translate(0, 0, height / 2);
  g.computeVertexNormals();
  return g;
}

/** Axis-aligned cylinder along +Y, base at y=0. */
export function cylinderY(radius, height, segments = 48) {
  const g = new THREE.CylinderGeometry(radius, radius, height, segments, 1, false);
  g.translate(0, height / 2, 0);
  g.computeVertexNormals();
  return g;
}

/** Box with min corner at origin extending +X/+Y/+Z. */
export function boxAt(w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(w / 2, h / 2, d / 2);
  return g;
}

// ---------------------------------------------------------------------------
// Face frame: maps 2D face coordinates (u across, v up) + height above the
// surface into world space for a surface tilted back by `angle` radians.
// ---------------------------------------------------------------------------
export function faceFrame(angleRad, centerWorld) {
  const c = Math.cos(angleRad), s = Math.sin(angleRad);
  const uAxis = new THREE.Vector3(1, 0, 0);
  const vAxis = new THREE.Vector3(0, c, -s);
  const nAxis = new THREE.Vector3(0, s, c);
  return {
    angle: angleRad,
    uAxis, vAxis, nAxis,
    center: centerWorld.clone(),
    /** World position of face point (u, v) raised `h` above the surface. */
    at(u, v, h = 0) {
      return this.center.clone()
        .addScaledVector(this.uAxis, u)
        .addScaledVector(this.vAxis, v)
        .addScaledVector(this.nAxis, h);
    },
    /** Apply this frame's orientation + placement to a geometry built in shape space. */
    place(geometry, u, v, h = 0, spin = 0) {
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-this.angle, 0, 0, 'XYZ'));
      if (spin) q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), spin));
      m.compose(this.at(u, v, h), q, new THREE.Vector3(1, 1, 1));
      geometry.applyMatrix4(m);
      return geometry;
    }
  };
}

/** Merge an array of BufferGeometry (same attributes) into one. */
export function mergeGeometries(geos) {
  const list = geos.filter(Boolean);
  if (list.length === 0) return null;
  if (list.length === 1) return list[0];
  const merged = new THREE.BufferGeometry();
  let vCount = 0, iCount = 0;
  list.forEach(g => {
    const nonIdx = g.index ? g.toNonIndexed() : g;
    vCount += nonIdx.attributes.position.count;
  });
  const pos = new Float32Array(vCount * 3);
  const nor = new Float32Array(vCount * 3);
  const uvs = new Float32Array(vCount * 2);
  let po = 0, no = 0, uo = 0;
  list.forEach(g => {
    const ng = g.index ? g.toNonIndexed() : g;
    pos.set(ng.attributes.position.array, po); po += ng.attributes.position.array.length;
    if (ng.attributes.normal) { nor.set(ng.attributes.normal.array, no); }
    no += ng.attributes.position.array.length;
    const c = ng.attributes.position.count;
    if (ng.attributes.uv) uvs.set(ng.attributes.uv.array, uo);
    uo += c * 2;
  });
  merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  merged.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  merged.computeVertexNormals();
  return merged;
}
