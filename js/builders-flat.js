// ============================================================================
// BAR and BOARD builders, rebuilt from the actual product photography.
//
// What the earlier version got wrong, and why it matters:
//
//   · The body is not a wedge. A Tap Bar is an L: a shallow horizontal tray
//     with a tall, near-vertical sign panel rising off its back edge. The
//     wedge shape I invented shares no silhouette with the real thing.
//
//   · The sign panel carries a recessed inner field with a raised border, and
//     the branding is embossed inside that field — not floated on a flat face.
//
//   · Tiles sit PROUD on a shallow seat, standing roughly two thirds of their
//     thickness above the tray. They were sunk into deep flush pockets, which
//     is why there was no way to get one out. Proud seating is the whole
//     removal mechanism — you just lift it off.
//
//   · There is an embossed "((( TAP TO CONNECT )))" strapline across the front
//     face of the tray.
//
//   · A Tap Base is the same tray with no panel; a Tap Board is the same
//     language flattened into a wall plate.
// ============================================================================
import * as THREE from 'three';
import * as S from './shapes.js';
import { HARDWARE, magnetPositions } from './params.js';

const DEG = Math.PI / 180;

/**
 * Factory: the two builders need the same private helpers from geometry.js
 * (CSG, artwork extrusion, part records), so they are injected rather than
 * duplicated or exported into a cycle.
 */
export function makeFlatBuilders(ctx) {
  const { cut, add, part, artworkSolid, logoOps, iconOps } = ctx;

  /** Footprint extrusion: rounded rect laid flat, +Y up, front at +Z. */
  function slab(w, d, h, r, opts = {}) {
    const g = S.extrude(S.roundedRect(w, d, r), h, opts);
    g.rotateX(-Math.PI / 2);          // shape +Z -> world +Y, shape +Y -> world -Z
    return g;
  }

  /** Front-view extrusion: rounded rect standing up, extruded along +Z. */
  function panelSlab(w, h, t, r, opts = {}) {
    return S.extrude(S.roundedRect(w, h, r), t, opts);
  }

  /** Tile seats, strapline and shared tray detailing. */
  function trayDetails({ p, n, T, gap, width, trayD, trayH, cutters, adders, art, mode }) {
    const seatDepth = p.tileSeatDepth ?? 1.4;
    const fit = p.tileFit;
    const rowZ = p.tileRowZ ?? (trayD / 2 - T / 2 - 3);

    // Top face of the tray. faceFrame(90°) gives an upward normal; +v then
    // runs toward the back of the tray.
    const top = S.faceFrame(Math.PI / 2, new THREE.Vector3(0, trayH, 0));
    const tileU = [];

    for (let i = 0; i < n; i++) {
      const u = (i - (n - 1) / 2) * (T + gap);
      tileU.push(u);

      // Shallow seat — deep enough to locate the tile, shallow enough that it
      // stands proud and can be lifted straight off.
      const seat = S.extrude(
        S.roundedRect(T + 2 * fit, T + 2 * fit, p.tileRadius + fit),
        seatDepth + 6, { curveSegments: 20 }
      );
      cutters.push(top.place(seat, u, -rowZ, -seatDepth));

      const md = (p.magnetThick ?? HARDWARE.magnetThick) + 0.25;
      const mR = (p.magnetDia ?? HARDWARE.magnetDia) / 2 + HARDWARE.magnetClear;
      for (const [mx, my] of magnetPositions(p.magnetRing ?? HARDWARE.magnetRing,
                                             p.magnetCount ?? HARDWARE.magnetCount)) {
        const m = S.cylinderZ(mR, md, 32);
        cutters.push(top.place(m, u + mx, -rowZ + my, -(seatDepth + md)));
      }
    }

    // Strapline across the tray's front face. Kept as its own solid rather
    // than fused into the shell, so it can take its own filament — fused in,
    // it could only ever be the body colour.
    let straplineGeo = null;
    if (art.straplineShapes && art.straplineShapes.length && (p.straplineHeight ?? 0) > 0) {
      const front = S.faceFrame(0, new THREE.Vector3(0, trayH / 2, trayD / 2));
      const d = p.straplineDepth ?? 0.6;
      const g = artworkSolid(art.straplineShapes, width * (p.straplineWidth ?? 0.55),
                             d + 0.2, 0, p.straplineHeight);
      // Sunk 0.2 mm into the face so the two fuse when printed together.
      if (g) straplineGeo = front.place(g, 0, p.straplineOffsetY ?? 0, -0.2);
    }

    return { top, tileU, rowZ, seatDepth, straplineGeo };
  }

  /** Recessed sign field + embossed branding, shared by the panel and board. */
  function signField({ p, frame, w, h, cutters, art, mode, branded, cx = 0, cy = 0 }) {
    const inset = p.panelInset ?? 6;
    const recess = p.panelRecess ?? 1.2;
    const fw = Math.max(4, w - 2 * inset);
    const fh = Math.max(4, h - 2 * inset);

    if (recess > 0.02) {
      const field = S.extrude(S.roundedRect(fw, fh, Math.max(0, (p.cornerRadius ?? 6) - inset * 0.4)),
                              recess + 4, { curveSegments: 24 });
      cutters.push(frame.place(field, cx, cy, -recess));
    }

    // Branding sits inside the recessed field, inset again so it never
    // collides with the border.
    const pad = 3;
    const fit = {
      uMin: cx - fw / 2 + pad, uMax: cx + fw / 2 - pad,
      vMin: cy - fh / 2 + pad, vMax: cy + fh / 2 - pad,
      maxW: fw - 2 * pad, maxH: fh - 2 * pad
    };
    return branded
      ? logoOps(frame, art, { ...p, logoOffsetY: (p.logoOffsetY ?? 0) + cy }, mode, 'logo', fit)
      : { cutter: null, adder: null, inlay: null, decal: null, fit: null, mount: null };
  }

  // =========================================================================
  // BAR — Tap Bar 2/3/4/QR/Max (tray + sign panel) and Tap Base 2/3/4 (tray)
  // =========================================================================
  function buildBar(cfg, art, product, buildTileSolid) {
    const p = cfg.params;
    const n = Math.max(1, Math.round(p.tileCount));
    const T = p.tileSize, gap = p.tileGap;
    const width = n * T + (n - 1) * gap + 2 * p.sideMargin;

    const trayD = p.trayDepth ?? 46;
    const trayH = p.trayHeight ?? 12;
    const panelT = p.panelThickness ?? 8;
    const panelH = p.panelHeight ?? 46;
    const lean = (p.panelLean ?? 2) * DEG;
    const r = p.cornerRadius ?? 6;
    const hasPanel = !!product.branded && panelH > 1;

    const cutters = [], adders = [], parts = [];

    // --- tray -------------------------------------------------------------
    let body = slab(width, trayD, trayH, r, { curveSegments: 28 });

    // --- sign panel -------------------------------------------------------
    let panelFrame = null;
    const panelTotalH = trayH + panelH;
    if (hasPanel) {
      let panel = panelSlab(width, panelTotalH, panelT, p.panelCornerRadius ?? 9,
                            { curveSegments: 28 });
      // Stand it on the plate, flush with the tray's back edge, leaning back.
      panel.translate(0, panelTotalH / 2, -panelT / 2);
      const m = new THREE.Matrix4().makeRotationX(-lean);
      panel.applyMatrix4(m);
      panel.translate(0, 0, -trayD / 2 + panelT);
      body = add(body, panel);

      // The panel's front face, in the tilted frame.
      const fz = -trayD / 2 + panelT;
      panelFrame = S.faceFrame(lean, new THREE.Vector3(
        0, trayH + panelH / 2,
        fz + Math.sin(lean) * (trayH + panelH / 2)
      ));
    }

    // --- tile seats + strapline -------------------------------------------
    const { top, tileU, rowZ, seatDepth, straplineGeo } =
      trayDetails({ p, n, T, gap, width, trayD, trayH, cutters, adders, art, mode: cfg.logoMode });

    // --- anti-slip pads ---------------------------------------------------
    if ((p.footDepth ?? 0) > 0.01) {
      const fr = Math.min(5, (p.footInset ?? 8) * 0.6);
      for (const sx of [-(width / 2 - p.footInset), width / 2 - p.footInset]) {
        for (const z of [-(trayD / 2 - p.footInset), trayD / 2 - p.footInset]) {
          // Start the cutter exactly at the build plate. Dropping it below
          // leaves a sliver of the pad ring proud of z=0, so the part no
          // longer sits flat and the first layer prints on four small rings.
          const pad = S.cylinderY(fr, p.footDepth, 32);
          pad.translate(sx, 0, z);
          cutters.push(pad);
        }
      }
    }

    // --- sign field + branding -------------------------------------------
    let lg = { cutter: null, adder: null, inlay: null, decal: null, fit: null };
    if (hasPanel && panelFrame) {
      lg = signField({
        p, frame: panelFrame, w: width, h: panelH, cutters, art,
        mode: cfg.logoMode, branded: product.branded
      });
      if (lg.cutter) cutters.push(lg.cutter);
      if (lg.adder) adders.push(lg.adder);
    }

    body = cut(body, cutters);
    body = add(body, adders);

    parts.push(part('body', product.name + ' — body', body, 'body', {
      note: hasPanel
        ? `L-body: ${trayD} mm tray with a ${panelH} mm sign panel. Print upright on the ` +
          `tray base — the panel is self-supporting at ${p.panelLean ?? 2}°.`
        : `Flat tray. Print face-up, no supports.`
    }));
    if (straplineGeo) parts.push(part('strapline', 'Strapline', straplineGeo, 'strapline',
      { note: `Embossed ${p.straplineDepth ?? 0.6} mm on the tray front. ` +
              `Overlaps 0.2 mm so it fuses if printed together.` }));
  if (lg.mount) parts.push(part('logo-mount', 'Logo (imported STL)', lg.mount, 'logo',
      { note: lg.mountFit
          ? `${lg.mountFit.widthMM} × ${lg.mountFit.heightMM} × ${lg.mountFit.depthMM} mm, ` +
            `${lg.mountFit.proudMM} mm proud, seated ${lg.mountFit.recessMM} mm. ` +
            `Scaled ${lg.mountFit.scale}× from source.`
          : 'Imported logo mesh.' }));
    if (lg.inlay) parts.push(part('logo-inlay', 'Logo inlay', lg.inlay, 'logo',
      { note: 'Second colour; press-fits into the recessed sign field.' }));
    if (lg.decal) parts.push(part('logo-decal', 'Logo (print artwork)', lg.decal, 'logo',
      { printable: false }));

    // --- tiles, seated proud ---------------------------------------------
    cfg.tiles.slice(0, n).forEach((t, i) => {
      const tg = buildTileSolid({
        ...p, faceChamfer: p.tileFaceChamfer ?? 0.5, nfcPocketDepth: 1.1,
        iconScale: T * 0.6, logoScale: 0
      }, art.iconShapes[i], cfg.logoMode, null);

      const g = tg.body.clone();
      top.place(g, tileU[i], -rowZ, -seatDepth);
      const proud = (p.tileThickness - seatDepth).toFixed(1);
      parts.push(part(`tile-${i + 1}`, `Tile ${i + 1} — ${t.icon}`, g, 'tile', {
        note: `Sits ${proud} mm proud of the tray — lift it straight off. ` +
              `NFC pocket ø${p.nfcTagDia ?? HARDWARE.nfcTagDia} mm. Link: ${t.link || '(not set)'}`
      }));
      for (const [key, geo, ck, label] of [
        ['icon', tg.inlay, 'icon', 'icon'],
        ['decal', tg.decal, 'icon', 'icon (print)']
      ]) {
        if (!geo) continue;
        const gg = geo.clone();
        top.place(gg, tileU[i], -rowZ, -seatDepth);
        parts.push(part(`tile-${i + 1}-${key}`, `Tile ${i + 1} ${label}`, gg, ck,
          { printable: key !== 'decal' }));
      }
    });

    return {
      parts,
      bbox: { width, height: hasPanel ? trayH + panelH : trayH, depth: trayD },
      frame: top, logoFit: lg.fit
    };
  }

  // =========================================================================
  // BOARD — Tap Board 2/3/4: the same language as a flat wall plate
  // =========================================================================
  function buildBoard(cfg, art, product, buildTileSolid) {
    const p = cfg.params;
    const n = Math.max(1, Math.round(p.tileCount));
    const T = p.tileSize, gap = p.tileGap;
    const width = n * T + (n - 1) * gap + 2 * p.sideMargin;
    const H = p.boardHeight;
    const th = p.plateThickness;
    const ch = p.edgeChamfer;

    let body = panelSlab(width, H, Math.max(0.2, th - 2 * ch), p.cornerRadius, {
      bevel: ch > 0.01, bevelSize: ch, bevelThickness: ch, bevelSegments: 2, curveSegments: 28
    });
    body.computeBoundingBox();
    body.translate(0, 0, -body.boundingBox.min.z);   // back at z = 0, front at z = th

    const front = S.faceFrame(0, new THREE.Vector3(0, 0, th));
    const back = S.faceFrame(Math.PI, new THREE.Vector3(0, 0, 0));
    const cutters = [], adders = [], parts = [];

    const fit = p.tileFit;
    const seatDepth = p.tileSeatDepth ?? 1.4;
    // Tiles ride low on the plate, overlapping the bottom edge as in the photo.
    const rowV = p.tileRowOffset ?? -(H / 2 - T / 2 - 2);
    const tileU = [];

    for (let i = 0; i < n; i++) {
      const u = (i - (n - 1) / 2) * (T + gap);
      tileU.push(u);
      const seat = S.extrude(S.roundedRect(T + 2 * fit, T + 2 * fit, p.tileRadius + fit),
        seatDepth + 6, { curveSegments: 20 });
      cutters.push(front.place(seat, u, rowV, -seatDepth));

      const md = (p.magnetThick ?? HARDWARE.magnetThick) + 0.25;
      const mR = (p.magnetDia ?? HARDWARE.magnetDia) / 2 + HARDWARE.magnetClear;
      for (const [mx, my] of magnetPositions(p.magnetRing ?? HARDWARE.magnetRing,
                                             p.magnetCount ?? HARDWARE.magnetCount)) {
        const m = S.cylinderZ(mR, md, 32);
        cutters.push(front.place(m, u + mx, rowV + my, -(seatDepth + md)));
      }
    }

    // Mounting
    if (p.mountMode >= 0.5) {
      const yTop = H / 2 - p.keyholeInset;
      for (const s of (n > 1 ? [-1, 1] : [0])) {
        const u = s * (width / 2 - p.keyholeInset);
        const head = S.cylinderZ(HARDWARE.screwHeadDia / 2, th + 2, 32);
        cutters.push(back.place(head, u, -yTop, -1));
        const slot = S.extrude(S.roundedRect(HARDWARE.screwDia, 7, HARDWARE.screwDia / 2), th + 2, {});
        cutters.push(front.place(slot, u, yTop - 3.5, -th - 1));
      }
    } else if (p.adhesiveRecess > 0.01) {
      const pad = S.extrude(S.roundedRect(width - 8, H - 8, Math.max(0, p.cornerRadius - 4)),
        p.adhesiveRecess + 1, { curveSegments: 20 });
      cutters.push(back.place(pad, 0, 0, -p.adhesiveRecess));
    }

    // Recessed sign field over the upper area, clear of the tile row.
    const fieldBottom = rowV + T / 2 + 2;
    const fieldH = Math.max(6, (H / 2) - fieldBottom - 2);
    const lg = signField({
      p, frame: front, w: width, h: fieldH + 2 * (p.panelInset ?? 6),
      cutters, art, mode: cfg.logoMode, branded: product.branded,
      cy: fieldBottom + fieldH / 2
    });
    if (lg.cutter) cutters.push(lg.cutter);
    if (lg.adder) adders.push(lg.adder);

    // Strapline along the bottom strip — again its own solid.
    let straplineGeo = null;
    if (art.straplineShapes && art.straplineShapes.length && (p.straplineHeight ?? 0) > 0) {
      const d = p.straplineDepth ?? 0.6;
      const g = artworkSolid(art.straplineShapes, width * (p.straplineWidth ?? 0.5),
                             d + 0.2, 0, p.straplineHeight);
      if (g) straplineGeo = front.place(g, 0, -(H / 2) + (p.straplineHeight ?? 4) / 2 + 3, -0.2);
    }

    body = cut(body, cutters);
    body = add(body, adders);

    parts.push(part('body', product.name + ' — plate', body, 'body', {
      note: (p.mountMode >= 0.5 ? 'Keyhole mount. ' : 'Adhesive-pad recess on the back. ') +
            'Print face-down, no supports.'
    }));
    if (straplineGeo) parts.push(part('strapline', 'Strapline', straplineGeo, 'strapline',
      { note: `Embossed ${p.straplineDepth ?? 0.6} mm on the plate front.` }));
    if (lg.mount) parts.push(part('logo-mount', 'Logo (imported STL)', lg.mount, 'logo',
      { note: lg.mountFit
          ? `${lg.mountFit.widthMM} × ${lg.mountFit.heightMM} × ${lg.mountFit.depthMM} mm, ` +
            `${lg.mountFit.proudMM} mm proud, seated ${lg.mountFit.recessMM} mm. ` +
            `Scaled ${lg.mountFit.scale}× from source.`
          : 'Imported logo mesh.' }));
    if (lg.inlay) parts.push(part('logo-inlay', 'Logo inlay', lg.inlay, 'logo'));
    if (lg.decal) parts.push(part('logo-decal', 'Logo (print artwork)', lg.decal, 'logo',
      { printable: false }));

    cfg.tiles.slice(0, n).forEach((t, i) => {
      const tg = buildTileSolid({
        ...p, faceChamfer: p.tileFaceChamfer ?? 0.5, nfcPocketDepth: 1.1,
        iconScale: T * 0.6, logoScale: 0
      }, art.iconShapes[i], cfg.logoMode, null);
      const g = tg.body.clone();
      front.place(g, tileU[i], rowV, -seatDepth);
      parts.push(part(`tile-${i + 1}`, `Tile ${i + 1} — ${t.icon}`, g, 'tile', {
        note: `Sits ${(p.tileThickness - seatDepth).toFixed(1)} mm proud — lift it straight off. ` +
              `Link: ${t.link || '(not set)'}`
      }));
      for (const [key, geo, ck, label] of [
        ['icon', tg.inlay, 'icon', 'icon'],
        ['decal', tg.decal, 'icon', 'icon (print)']
      ]) {
        if (!geo) continue;
        const gg = geo.clone();
        front.place(gg, tileU[i], rowV, -seatDepth);
        parts.push(part(`tile-${i + 1}-${key}`, `Tile ${i + 1} ${label}`, gg, ck,
          { printable: key !== 'decal' }));
      }
    });

    return { parts, bbox: { width, height: H, depth: th }, frame: front, logoFit: lg.fit };
  }

  return { buildBar, buildBoard };
}
