// ============================================================================
// TAP STUDIO PIPELINE — Product parameter schema
// All units are millimetres. Every value here is editable live in the UI.
// Dimensions are proportion-derived estimates; measure a real unit and tune.
// ============================================================================

export const PALETTE = [
  { name: 'Bone',        hex: '#F8F6F1' },
  { name: 'Chalk White', hex: '#FFFFFF' },
  { name: 'Sand',        hex: '#E3D5C0' },
  { name: 'Clay',        hex: '#C08A62' },
  { name: 'Terracotta',  hex: '#B4553A' },
  { name: 'Olive',       hex: '#6E7A4F' },
  { name: 'Forest',      hex: '#2F4F3E' },
  { name: 'Teal',        hex: '#1F6F6B' },
  { name: 'Navy',        hex: '#1E2A44' },
  { name: 'Cobalt',      hex: '#2D5BD1' },
  { name: 'Lilac',       hex: '#B9A7D6' },
  { name: 'Blush',       hex: '#E8B4B8' },
  { name: 'Mustard',     hex: '#D9A21B' },
  { name: 'Charcoal',    hex: '#2B2B2B' },
  { name: 'Jet Black',   hex: '#111111' },
  { name: 'Slate Grey',  hex: '#6B7280' },
  { name: 'Silk Silver', hex: '#C9CCD1' },
  { name: 'Brushed Gold',hex: '#C9A227' },
  { name: 'Copper',      hex: '#9C5B32' },
  { name: 'Transparent', hex: '#DDE7EA' }
];

// Tile designs. Entries marked `brand: true` approximate a third-party mark —
// see the note at the top of logo.js before shipping one to a customer.
export const ICONS = [
  { brand: true, id: 'google-review', label: 'Google Review' },
  { brand: true, id: 'instagram',     label: 'Instagram' },
  { brand: true, id: 'whatsapp',      label: 'WhatsApp' },
  { brand: true, id: 'tiktok',        label: 'TikTok' },
  { brand: true, id: 'facebook',      label: 'Facebook' },
  { brand: true, id: 'linkedin',      label: 'LinkedIn' },
  { brand: true, id: 'youtube',       label: 'YouTube' },
  { brand: true, id: 'telegram',      label: 'Telegram' },
  { id: 'website',       label: 'Website' },
  { id: 'menu',          label: 'Menu' },
  { id: 'booking',       label: 'Book Now' },
  { id: 'paynow',        label: 'PayNow / Pay' },
  { id: 'loyalty',       label: 'Loyalty' },
  { id: 'feedback',      label: 'Feedback' },
  { id: 'wifi',          label: 'WiFi' },
  { id: 'location',      label: 'Location' },
  { id: 'phone',         label: 'Call Us' },
  { id: 'email',         label: 'Email' },
  { id: 'shop',          label: 'Shop' },
  { id: 'qr',            label: 'QR Code (encodes the tile link)' },
  { id: 'custom',        label: 'Custom (upload)' }
];

// ---------------------------------------------------------------------------
// Shared hardware constants — these drive fit, so they are grouped separately.
// ---------------------------------------------------------------------------
// Stock on hand (Oct 2026) is ø25 mm NTAG inlays. A 30 mm tile cannot hold a
// 25 mm inlay AND magnets side by side, so the default tile is 38 mm with the
// 4 × ø4 magnets on a 16 mm ring (diagonals): 1.15 mm wall to the antenna
// pocket, 1.0 mm to the tile edge on-axis, 5+ mm on the diagonal.
// With 18 mm tags you can go back to tileSize 30 / magnetRing 12.2.
// Change these in the Hardware group if you source different parts.
export const HARDWARE = {
  nfcTagDia:      25.0,
  nfcTagThick:    0.55,
  nfcClearance:   0.35,
  magnetDia:      4.0,
  magnetThick:    1.5,
  magnetClear:    0.15,
  magnetCount:    4,
  magnetRing:     16.0,
  screwDia:       3.2,   // wall mount
  screwHeadDia:   6.4,
  batteryDia:     20.0,  // CR2032 for lightbox
  batteryThick:   3.2
};

/** Magnet centres for a tile / pocket, matched between stand and tile. */
export function magnetPositions(ring, count) {
  const n = Math.max(0, Math.round(count));
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.PI / 4;
    out.push([Math.cos(a) * ring, Math.sin(a) * ring]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Parameter descriptors: [key, label, min, max, step, group]
// ---------------------------------------------------------------------------
const P = (key, label, min, max, step, group = 'Body') => ({ key, label, min, max, step, group });

export const PARAM_DEFS = {
  bar: [
    P('tileCount',       'Tile count',            1, 6,   1,   'Layout'),
    P('tileSize',        'Tile size',            18, 60,  0.5, 'Tiles'),
    P('tileThickness',   'Tile thickness',        2.5, 10, 0.1, 'Tiles'),
    P('tileRadius',      'Tile corner radius',    0, 20,  0.5, 'Tiles'),
    P('tileGap',         'Gap between tiles',     0, 20,  0.5, 'Layout'),
    P('tileFit',         'Tile pocket clearance', 0.05, 0.6, 0.05, 'Tiles'),
    P('tileSeatDepth',   'Tile seat depth',       0.2, 4, 0.1, 'Tiles'),
    P('sideMargin',      'Side margin',           4, 40,  0.5, 'Layout'),
    P('tileRowZ',        'Tile row from centre',-40, 40,  0.5, 'Layout'),
    P('straplineWidth',  'Strapline width frac',  0.2, 0.95, 0.01, 'Strapline'),
    P('straplineHeight', 'Strapline height',      0, 12,  0.25,'Strapline'),
    P('straplineDepth',  'Strapline relief',      0.2, 2, 0.05,'Strapline'),
    P('straplineOffsetY','Strapline offset Y',  -10, 10,  0.25,'Strapline'),
    P('trayDepth',       'Tray depth',           25, 90,  0.5, 'Body'),
    P('trayHeight',      'Tray height',           5, 30,  0.5, 'Body'),
    P('panelHeight',     'Sign panel height',     0, 90,  0.5, 'Panel'),
    P('panelThickness',  'Sign panel thickness',  3, 20,  0.25,'Panel'),
    P('panelLean',       'Panel lean (deg)',      0, 20,  0.5, 'Panel'),
    P('panelCornerRadius','Panel corner radius',  0, 24,  0.5, 'Panel'),
    P('panelInset',      'Sign border width',     2, 20,  0.5, 'Panel'),
    P('panelRecess',     'Sign field depth',      0, 4,   0.05,'Panel'),
    P('cornerRadius',    'Tray corner radius',    0, 20,  0.25,'Body'),
    P('footInset',       'Foot pad inset',        2, 20,  0.5, 'Body'),
    P('footDepth',       'Foot pad depth',        0, 3,   0.1, 'Body'),
    P('nfcTagDia',       'NFC tag diameter',     10, 30,  0.5, 'Hardware'),
    P('magnetDia',       'Magnet diameter',       2, 10,  0.5, 'Hardware'),
    P('magnetThick',     'Magnet thickness',      0.5, 5, 0.1, 'Hardware'),
    P('magnetCount',     'Magnets per tile',      0, 6,   1,   'Hardware'),
    P('magnetRing',      'Magnet ring radius',    0, 25,  0.1, 'Hardware'),
    P('logoScale',       'Logo width',            5, 160, 0.5, 'Logo'),
    P('logoOffsetX',     'Logo offset X',      -100, 100, 0.5, 'Logo'),
    P('logoOffsetY',     'Logo offset Y',      -80,  80,  0.5, 'Logo'),
    P('logoRotate',      'Logo rotation (deg)',-180, 180, 1,   'Logo'),
    P('logoDepth',       'Logo emboss/deboss',    0.2, 3, 0.05,'Logo'),
    P('logoAutoFit',     'Auto-fit logo (0/1)',   0, 1,   1,   'Logo'),
    P('mountRecess',     'Imported logo seat',    0, 4,   0.05,'Logo'),
    P('mountClearance',  'Imported logo fit',     0, 0.5, 0.05,'Logo'),
    P('reliefGamma',     'Relief contrast',       0.3, 3, 0.05,'Logo'),
    P('reliefInvert',    'Relief invert (0/1)',   0, 1,   1,   'Logo'),
    P('reliefNozzle',    'Nozzle width',          0.2, 0.8, 0.05,'Logo'),
    P('logoPadDepth',    'Flat-print pad depth',  0, 1.5, 0.05,'Logo'),
    P('logoPadMargin',   'Flat-print pad margin', 0, 8,   0.25,'Logo'),
    P('iconDepth',       'Icon relief depth',     0.2, 2.5, 0.05, 'Tiles'),
    P('qrPadSize',       'QR label pad size',    10, 50,  0.5, 'QR'),
    P('qrPadDepth',      'QR label pad depth',    0.1, 1.5, 0.05, 'QR'),
    P('qrRelief',        'QR as relief (0/1)',    0, 1,   1,   'QR')
  ],
  board: [
    P('tileCount',       'Tile count',            1, 6,   1,   'Layout'),
    P('tileSize',        'Tile size',            18, 60,  0.5, 'Tiles'),
    P('tileThickness',   'Tile thickness',        2.5, 10, 0.1, 'Tiles'),
    P('tileRadius',      'Tile corner radius',    0, 20,  0.5, 'Tiles'),
    P('tileGap',         'Gap between tiles',     0, 20,  0.5, 'Layout'),
    P('tileFit',         'Tile seat clearance',   0.05, 0.6, 0.05, 'Tiles'),
    P('pocketNotch',     'Thumb notch (0/1)',     0, 1,   1,   'Tiles'),
    P('notchWidth',      'Thumb notch width',     5, 20,  0.5, 'Tiles'),
    P('sideMargin',      'Side margin',           4, 40,  0.5, 'Layout'),
    P('tileRowOffset',   'Tile row offset up',  -70, 70,  0.5, 'Layout'),
    P('plateThickness',  'Plate thickness',       3, 14,  0.25,'Body'),
    P('boardHeight',     'Plate height',         30, 180, 0.5, 'Body'),
    P('cornerRadius',    'Plate corner radius',   0, 24,  0.5, 'Body'),
    P('edgeChamfer',     'Edge chamfer',          0, 4,   0.1, 'Body'),
    P('mountMode',       '0 adhesive / 1 screw',  0, 1,   1,   'Mounting'),
    P('keyholeInset',    'Keyhole inset',         5, 40,  0.5, 'Mounting'),
    P('adhesiveRecess',  'Adhesive pad recess',   0, 2,   0.1, 'Mounting'),
    P('nfcTagDia',       'NFC tag diameter',     10, 30,  0.5, 'Hardware'),
    P('magnetDia',       'Magnet diameter',       2, 10,  0.5, 'Hardware'),
    P('magnetThick',     'Magnet thickness',      0.5, 5, 0.1, 'Hardware'),
    P('magnetCount',     'Magnets per tile',      0, 6,   1,   'Hardware'),
    P('magnetRing',      'Magnet ring radius',    0, 25,  0.1, 'Hardware'),
    P('logoScale',       'Logo width',            5, 160, 0.5, 'Logo'),
    P('logoOffsetX',     'Logo offset X',      -100, 100, 0.5, 'Logo'),
    P('logoOffsetY',     'Logo offset Y',      -90,  90,  0.5, 'Logo'),
    P('logoRotate',      'Logo rotation (deg)',-180, 180, 1,   'Logo'),
    P('logoDepth',       'Logo emboss/deboss',    0.2, 3, 0.05,'Logo'),
    P('logoAutoFit',     'Auto-fit logo (0/1)',   0, 1,   1,   'Logo'),
    P('mountRecess',     'Imported logo seat',    0, 4,   0.05,'Logo'),
    P('mountClearance',  'Imported logo fit',     0, 0.5, 0.05,'Logo'),
    P('reliefGamma',     'Relief contrast',       0.3, 3, 0.05,'Logo'),
    P('reliefInvert',    'Relief invert (0/1)',   0, 1,   1,   'Logo'),
    P('reliefNozzle',    'Nozzle width',          0.2, 0.8, 0.05,'Logo'),
    P('logoPadDepth',    'Flat-print pad depth',  0, 1.5, 0.05,'Logo'),
    P('logoPadMargin',   'Flat-print pad margin', 0, 8,   0.25,'Logo'),
    P('iconDepth',       'Icon relief depth',     0.2, 2.5, 0.05, 'Tiles')
  ],
  tile: [
    P('tileSize',        'Tile size',            18, 60,  0.5, 'Tiles'),
    P('tileThickness',   'Tile thickness',        2.5, 10, 0.1, 'Tiles'),
    P('tileRadius',      'Corner radius',         0, 20,  0.5, 'Tiles'),
    P('faceChamfer',     'Face chamfer',          0, 2,   0.05,'Tiles'),
    P('nfcTagDia',       'NFC tag diameter',     10, 30,  0.5, 'Hardware'),
    P('nfcPocketDepth',  'NFC pocket depth',      0.6, 3, 0.05,'Hardware'),
    P('magnetDia',       'Magnet diameter',       2, 10,  0.5, 'Hardware'),
    P('magnetThick',     'Magnet thickness',      0.5, 5, 0.1, 'Hardware'),
    P('magnetCount',     'Magnet count',          0, 6,   1,   'Hardware'),
    P('magnetRing',      'Magnet ring radius',    0, 25,  0.1, 'Hardware'),
    P('lidThickness',    'Back lid thickness',    0.6, 3, 0.1, 'Hardware'),
    P('iconScale',       'Icon size',             4, 50,  0.5, 'Logo'),
    P('iconDepth',       'Icon relief depth',     0.2, 2.5, 0.05, 'Logo'),
    P('logoScale',       'Logo width',            4, 50,  0.5, 'Logo'),
    P('logoOffsetX',     'Logo offset X',       -30, 30,  0.5, 'Logo'),
    P('logoOffsetY',     'Logo offset Y',       -30, 30,  0.5, 'Logo'),
    P('logoRotate',      'Logo rotation (deg)',-180, 180, 1,   'Logo'),
    P('logoDepth',       'Logo emboss/deboss',    0.2, 3, 0.05,'Logo'),
    P('logoAutoFit',     'Auto-fit logo (0/1)',   0, 1,   1,   'Logo'),
    P('mountRecess',     'Imported logo seat',    0, 4,   0.05,'Logo'),
    P('mountClearance',  'Imported logo fit',     0, 0.5, 0.05,'Logo'),
    P('reliefGamma',     'Relief contrast',       0.3, 3, 0.05,'Logo'),
    P('reliefInvert',    'Relief invert (0/1)',   0, 1,   1,   'Logo'),
    P('reliefNozzle',    'Nozzle width',          0.2, 0.8, 0.05,'Logo'),
    P('logoPadDepth',    'Flat-print pad depth',  0, 1.5, 0.05,'Logo'),
    P('logoPadMargin',   'Flat-print pad margin', 0, 8,   0.25,'Logo')
  ],
  lightbox: [
    P('boxWidth',        'Box width',            40, 160, 0.5, 'Body'),
    P('boxHeight',       'Box height',           40, 160, 0.5, 'Body'),
    P('boxDepth',        'Box depth',            18, 80,  0.5, 'Body'),
    P('frameWidth',      'Frame border width',    3, 20,  0.25,'Body'),
    P('shellThickness',  'Wall thickness',        1.2, 5, 0.1, 'Body'),
    P('cornerRadius',    'Corner radius',         0, 20,  0.5, 'Body'),
    P('lithoThickness',  'Lithophane thickness',  1.2, 4, 0.05,'Image'),
    P('lithoMinWall',    'Lithophane min wall',   0.4, 1.5, 0.02, 'Image'),
    P('lithoRes',        'Lithophane resolution', 60, 400, 10, 'Image'),
    P('lithoInvert',     'Invert image (0/1)',    0, 1,   1,   'Image'),
    P('batteryBay',      'Battery bay (0/1)',     0, 1,   1,   'Hardware'),
    P('diffuserGap',     'Diffuser gap',          1, 15,  0.5, 'Hardware'),
    P('logoScale',       'Logo width',            5, 80,  0.5, 'Logo'),
    P('logoOffsetX',     'Logo offset X',       -60, 60,  0.5, 'Logo'),
    P('logoOffsetY',     'Logo offset Y',       -60, 60,  0.5, 'Logo'),
    P('logoRotate',      'Logo rotation (deg)',-180, 180, 1,   'Logo'),
    P('logoDepth',       'Logo emboss/deboss',    0.2, 3, 0.05,'Logo'),
    P('logoAutoFit',     'Auto-fit logo (0/1)',   0, 1,   1,   'Logo'),
    P('mountRecess',     'Imported logo seat',    0, 4,   0.05,'Logo'),
    P('mountClearance',  'Imported logo fit',     0, 0.5, 0.05,'Logo'),
    P('reliefGamma',     'Relief contrast',       0.3, 3, 0.05,'Logo'),
    P('reliefInvert',    'Relief invert (0/1)',   0, 1,   1,   'Logo'),
    P('reliefNozzle',    'Nozzle width',          0.2, 0.8, 0.05,'Logo'),
    P('logoPadDepth',    'Flat-print pad depth',  0, 1.5, 0.05,'Logo'),
    P('logoPadMargin',   'Flat-print pad margin', 0, 8,   0.25,'Logo')
  ],
  snap: [
    P('cardWidth',       'Card width',           40, 100, 0.5, 'Body'),
    P('cardHeight',      'Card height',          40, 100, 0.5, 'Body'),
    P('cardThickness',   'Card thickness',        3, 12,  0.1, 'Body'),
    P('cornerRadius',    'Corner radius',         0, 40,  0.5, 'Body'),
    P('edgeChamfer',     'Edge chamfer',          0, 3,   0.05,'Body'),
    P('magsafeOuter',    'MagSafe ring OD',      40, 70,  0.5, 'Hardware'),
    P('magsafeInner',    'MagSafe ring ID',      30, 60,  0.5, 'Hardware'),
    P('magsafeDepth',    'MagSafe ring depth',    1, 5,   0.1, 'Hardware'),
    P('cornerIconDia',   'Corner icon diameter',  8, 30,  0.5, 'Tiles'),
    P('cornerIconInset', 'Corner icon inset',     6, 30,  0.5, 'Tiles'),
    P('iconDepth',       'Icon relief depth',     0.2, 2.5, 0.05, 'Tiles'),
    P('logoScale',       'Logo width',            5, 70,  0.5, 'Logo'),
    P('logoOffsetX',     'Logo offset X',       -40, 40,  0.5, 'Logo'),
    P('logoOffsetY',     'Logo offset Y',       -40, 40,  0.5, 'Logo'),
    P('logoRotate',      'Logo rotation (deg)',-180, 180, 1,   'Logo'),
    P('logoDepth',       'Logo emboss/deboss',    0.2, 3, 0.05,'Logo')
  ]
};

// ---------------------------------------------------------------------------
// The 14 products.
// `family` selects the geometry builder; `params` overrides family defaults.
// ---------------------------------------------------------------------------
const barBase = {
  // Proportions taken from the Tap Bar product photography: a shallow tray
  // with a tall sign panel, tiles standing proud near the front edge.
  tileCount: 4, tileSize: 38, tileThickness: 5, tileRadius: 7, tileGap: 4,
  tileSeatDepth: 1.4, tileFit: 0.25, sideMargin: 8, tileRowZ: 4,
  trayDepth: 46, trayHeight: 12, cornerRadius: 4,
  panelHeight: 46, panelThickness: 8, panelLean: 2, panelCornerRadius: 9,
  panelInset: 6, panelRecess: 1.2,
  footInset: 8, footDepth: 0.8,
  nfcTagDia: 18, magnetDia: 4, magnetThick: 1.5, magnetCount: 4, magnetRing: 12.2,
  straplineWidth: 0.55, straplineHeight: 4.5, straplineDepth: 0.6, straplineOffsetY: 0,
  logoScale: 70, logoOffsetX: 0, logoOffsetY: 0, logoRotate: 0,
  logoDepth: 1.0, logoAutoFit: 1, mountRecess: 0.6, mountClearance: 0.15,
  logoPadDepth: 0.35, logoPadMargin: 1.5,
  reliefGamma: 1.0, reliefInvert: 0, reliefNozzle: 0.4, iconDepth: 0.9,
  qrPadSize: 26, qrPadDepth: 0.35, qrRelief: 0
};

// Tap Base: the same tray, no sign panel, no branding.
const baseBase = { ...barBase, panelHeight: 0, trayHeight: 10, trayDepth: 42,
                   sideMargin: 7, logoScale: 0, straplineWidth: 0.45 };

const boardBase = {
  tileCount: 4, tileSize: 38, tileThickness: 5, tileRadius: 7, tileGap: 4,
  tileSeatDepth: 1.4, tileFit: 0.25, sideMargin: 8, tileRowOffset: -22,
  plateThickness: 8, boardHeight: 78, cornerRadius: 7, edgeChamfer: 0.8,
  mountMode: 0, keyholeInset: 12, adhesiveRecess: 0.6,
  panelInset: 6, panelRecess: 1.2,
  nfcTagDia: 18, magnetDia: 4, magnetThick: 1.5, magnetCount: 4, magnetRing: 12.2,
  straplineWidth: 0.5, straplineHeight: 4.5, straplineDepth: 0.6,
  logoScale: 60, logoOffsetX: 0, logoOffsetY: 0, logoRotate: 0,
  logoDepth: 1.0, logoAutoFit: 1, mountRecess: 0.6, mountClearance: 0.15,
  logoPadDepth: 0.35, logoPadMargin: 1.5,
  reliefGamma: 1.0, reliefInvert: 0, reliefNozzle: 0.4, iconDepth: 0.9,
  qrPadSize: 26, qrPadDepth: 0.35, qrRelief: 0
};

export const PRODUCTS = {
  'tapbar-2': {
    name: 'Tap Bar 2', family: 'bar', price: 'S$89', branded: true,
    blurb: '2-tile branded counter stand. Embossed logo. Custom icons.',
    parts: ['body', 'tiles', 'logo', 'icons'],
    params: { ...barBase, tileCount: 2 }
  },
  'tapbar-3': {
    name: 'Tap Bar 3', family: 'bar', price: 'S$99', branded: true,
    blurb: '3-tile branded stand. Review, follow, and one more.',
    parts: ['body', 'tiles', 'logo', 'icons'],
    params: { ...barBase, tileCount: 3 }
  },
  'tapbar-4': {
    name: 'Tap Bar 4', family: 'bar', price: 'S$129', branded: true,
    blurb: '4-tile branded stand. Four custom destinations.',
    parts: ['body', 'tiles', 'logo', 'icons'],
    params: { ...barBase, tileCount: 4 }
  },
  'tapbar-qr': {
    name: 'Tap Bar QR', family: 'bar', price: 'S$109', branded: true, qrSlot: true,
    blurb: 'NFC + QR hybrid. One taps, one scans. Best for payments.',
    parts: ['body', 'tiles', 'logo', 'icons'],
    params: { ...barBase, tileCount: 2, tileSize: 38, sideMargin: 10 }
  },
  'tapbar-max': {
    name: 'Tap Bar Max', family: 'bar', price: 'S$149', branded: true,
    blurb: 'Large-format 4-tile stand. Bold counter presence.',
    parts: ['body', 'tiles', 'logo', 'icons'],
    params: { ...barBase, tileCount: 4, tileSize: 38, tileGap: 6, sideMargin: 12,
              trayDepth: 54, trayHeight: 14, panelHeight: 58, panelThickness: 9,
              logoScale: 90, straplineHeight: 5.5 }
  },
  'tapbase-2': {
    name: 'Tap Base 2', family: 'bar', price: 'S$29', branded: false,
    blurb: '2-tile NFC stand. Generic icons. Plug and play.',
    parts: ['body', 'tiles', 'icons'],
    params: { ...baseBase, tileCount: 2 }
  },
  'tapbase-3': {
    name: 'Tap Base 3', family: 'bar', price: 'S$39', branded: false,
    blurb: '3-tile NFC stand. Review, follow, pay. Covered.',
    parts: ['body', 'tiles', 'icons'],
    params: { ...baseBase, tileCount: 3 }
  },
  'tapbase-4': {
    name: 'Tap Base 4', family: 'bar', price: 'S$49', branded: false,
    blurb: '4-tile NFC stand. Maximum links, minimal spend.',
    parts: ['body', 'tiles', 'icons'],
    params: { ...baseBase, tileCount: 4 }
  },
  'tapboard-2': {
    name: 'Tap Board 2', family: 'board', price: 'S$89', branded: true,
    blurb: '2-tile flat wall mount. Branded.',
    parts: ['body', 'tiles', 'logo', 'icons'],
    params: { ...boardBase, tileCount: 2 }
  },
  'tapboard-3': {
    name: 'Tap Board 3', family: 'board', price: 'S$99', branded: true,
    blurb: '3-tile flat mount. Review, follow, book from the wall.',
    parts: ['body', 'tiles', 'logo', 'icons'],
    params: { ...boardBase, tileCount: 3 }
  },
  'tapboard-4': {
    name: 'Tap Board 4', family: 'board', price: 'S$129', branded: true,
    blurb: '4-tile flat mount. Full link suite on the wall.',
    parts: ['body', 'tiles', 'logo', 'icons'],
    params: { ...boardBase, tileCount: 4 }
  },
  'taptile': {
    name: 'Tap Tile', family: 'tile', price: 'S$15', branded: true,
    blurb: 'A single customisable NFC tile — your colour, icon, and link.',
    parts: ['tiles', 'icons', 'logo'],
    params: {
      tileSize: 38, tileThickness: 4, tileRadius: 6, faceChamfer: 0.5,
      nfcTagDia: 18, nfcPocketDepth: 1.1, magnetDia: 4, magnetThick: 1.5,
      magnetCount: 4, magnetRing: 12.2, lidThickness: 1.0,
      iconScale: 18, iconDepth: 0.7, logoScale: 14, logoOffsetX: 0,
      logoOffsetY: 0, logoRotate: 0, logoDepth: 0.6, logoAutoFit: 1
    }
  },
  'lightbox-mini': {
    name: 'Mini 3D Image Lightbox', family: 'lightbox', price: 'S$39', branded: true,
    blurb: '70 × 70 × 30 mm. Tap to cycle warm light: Off, 50%, 100%.',
    parts: ['body', 'litho', 'logo'],
    params: {
      boxWidth: 70, boxHeight: 70, boxDepth: 30, frameWidth: 7,
      shellThickness: 2.0, cornerRadius: 4, lithoThickness: 2.6,
      lithoMinWall: 0.6, lithoRes: 180, lithoInvert: 0, batteryBay: 1,
      diffuserGap: 6, logoScale: 22, logoOffsetX: 0, logoOffsetY: -30,
      logoRotate: 0, logoDepth: 0.6, logoAutoFit: 1
    }
  },
  'tapsnap': {
    name: 'Tap Snap', family: 'snap', price: 'S$39', branded: true,
    blurb: 'MagSafe namecard. Four tappable corner icons. iPhone 12+.',
    parts: ['body', 'icons', 'logo'],
    params: {
      cardWidth: 66, cardHeight: 66, cardThickness: 5, cornerRadius: 14,
      edgeChamfer: 0.6, magsafeOuter: 56.5, magsafeInner: 49.5,
      magsafeDepth: 2.4, cornerIconDia: 18, cornerIconInset: 15,
      iconDepth: 0.6, logoScale: 26, logoOffsetX: 0, logoOffsetY: 0,
      logoRotate: 0, logoDepth: 0.6, logoAutoFit: 1
    }
  }
};

export const PRODUCT_ORDER = [
  'tapbar-2', 'tapbar-3', 'tapbar-4', 'tapbar-qr', 'tapbar-max',
  'tapbase-2', 'tapbase-3', 'tapbase-4',
  'tapboard-2', 'tapboard-3', 'tapboard-4',
  'taptile', 'lightbox-mini', 'tapsnap'
];

export const LOGO_MODES = [
  { id: 'emboss',  label: 'Embossed (raised)' },
  { id: 'deboss',  label: 'Debossed (recessed)' },
  { id: 'inlay',   label: 'Multi-colour inlay' },
  { id: 'relief',  label: 'Relief from image (exact)' },
  { id: 'colour',  label: 'Multi-colour separation' },
  { id: 'texture', label: 'Flat print / UV texture' }
];

export function defaultConfig(productId) {
  const p = PRODUCTS[productId];
  const n = p.params.tileCount ?? (p.family === 'snap' ? 4 : 1);
  return {
    productId,
    params: { ...p.params },
    logoMode: 'emboss',
    // Single source of truth for the process. Everything that depends on what
    // the printer can physically resolve reads this: the relief sampler, the
    // logo feature check, the QR module check and the trace conditioning.
    // Keeping three separate nozzle numbers in sync by hand is how a preview
    // ends up disagreeing with the finished part.
    nozzle: 0.4,
    strapline: 'TAP TO CONNECT',
    colors: {
      body:  '#F8F6F1',
      tile:  '#2F4F3E',
      icon:  '#F8F6F1',
      logo:  '#2B2B2B',
      strapline: '#2B2B2B',
      accent:'#C9A227'
    },
    tiles: Array.from({ length: n }, (_, i) => ({
      icon: ['google-review', 'instagram', 'whatsapp', 'website', 'menu', 'paynow'][i] || 'website',
      link: '',
      color: null,      // null = inherit colors.tile
      iconColor: null
    })),
    notes: ''
  };
}
