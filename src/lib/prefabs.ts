// OUROO PRAÇA — pre-made buildings (prefabs) for the builder/designer.
//
// A prefab is a bundle of construction pieces (the same `constr` kinds from @/lib/furni) laid out on a
// local grid. Tapping a tile in "Builds" mode drops the whole structure with its anchor (tap tile) at
// local (0,0) — the footprint grows toward +x (screen down-right) and +y (screen down-left).
//
// Iso/height model (matches RoomCanvas): walls/doors/windows are h:2 (one storey = 2 levels). A second
// storey stacks at elev:2, its roof at elev:4, and so on. Doors/windows carry a `dir` so their opening
// faces the camera on the building's two FRONT edges (max-x → dir 1 / R-face, max-y → dir 0 / L-face).

export type PrefabPiece = { kind: string; x: number; y: number; dir: number; elev: number };
export type PrefabGroup = 'shop' | 'house' | 'castle';
export type Prefab = {
  id: string; name: string; group: PrefabGroup;
  w: number; d: number; h: number;   // footprint w×d (tiles) + peak height (levels) — shown in the palette
  note: string;                       // one-line blurb
  accent: string;                     // thumbnail tint
  pieces: PrefabPiece[];
};

// ── layout helpers ───────────────────────────────────────────────────────────────────────────────
// A door/window sits on a perimeter cell; pick the dir that carves the opening on the camera-facing face.
const openDir = (x: number, y: number, w: number, d: number): number =>
  y === d - 1 ? 0 : x === w - 1 ? 1 : y === 0 ? 2 : 3;

type Open = { x: number; y: number; kind: string };
// One storey: a ring of `wall` around the w×d perimeter, with openings (doors/windows) swapped in.
const storey = (w: number, d: number, wall: string, elev: number, opens: Open[] = []): PrefabPiece[] => {
  const oMap = new Map(opens.map(o => [`${o.x},${o.y}`, o.kind]));
  const out: PrefabPiece[] = [];
  for (let x = 0; x < w; x++) for (let y = 0; y < d; y++) {
    if (!(x === 0 || x === w - 1 || y === 0 || y === d - 1)) continue;   // perimeter only
    const ok = oMap.get(`${x},${y}`);
    out.push(ok ? { kind: ok, x, y, dir: openDir(x, y, w, d), elev } : { kind: wall, x, y, dir: 0, elev });
  }
  return out;
};
// A floor/ceiling deck of walkable blocks. interiorOnly skips the perimeter (the walls cover it anyway).
const deck = (w: number, d: number, blk: string, elev: number, interiorOnly = true): PrefabPiece[] => {
  const out: PrefabPiece[] = [];
  for (let x = 0; x < w; x++) for (let y = 0; y < d; y++) {
    if (interiorOnly && (x === 0 || x === w - 1 || y === 0 || y === d - 1)) continue;
    out.push({ kind: blk, x, y, dir: 0, elev });
  }
  return out;
};
// A roof: hip-roof tiles over the footprint, with inner rings stepped UP so it reads as a pitched/hipped
// roof (a peak on square plans, a ridge on long ones) rather than a flat tiled deck.
const roofTop = (w: number, d: number, roof: string, elev: number): PrefabPiece[] => {
  const out: PrefabPiece[] = [];
  for (let x = 0; x < w; x++) for (let y = 0; y < d; y++) {
    const inset = Math.min(x, y, w - 1 - x, d - 1 - y);   // 0 at the eaves, higher toward the ridge/peak
    out.push({ kind: roof, x, y, dir: 0, elev: elev + inset * 0.7 });
  }
  return out;
};

// ── the catalogue ────────────────────────────────────────────────────────────────────────────────
export const PREFABS: Prefab[] = [
  // ── SHOPS ──
  {
    id: 'shop_corner', name: 'Corner Shop', group: 'shop', w: 4, d: 4, h: 5,
    note: '2 floors · glass shopfront + cute slate roof', accent: '#caa24a',
    pieces: [
      // ground floor: wood walls, a glass door + big shop windows facing the street
      ...storey(4, 4, 'wall_wood', 0, [
        { x: 1, y: 3, kind: 'door_glass' }, { x: 2, y: 3, kind: 'wall_glass' },
        { x: 3, y: 1, kind: 'wall_glass' }, { x: 3, y: 2, kind: 'wall_glass' },
      ]),
      ...deck(4, 4, 'blk_wood', 2),                 // upper floor deck
      // upper floor: lighter marble walls with arched windows
      ...storey(4, 4, 'wall_marble', 2, [
        { x: 1, y: 3, kind: 'window_arch' }, { x: 2, y: 3, kind: 'window_arch' },
        { x: 3, y: 1, kind: 'window' }, { x: 3, y: 2, kind: 'window' },
      ]),
      ...roofTop(4, 4, 'roof_slate', 4),
    ],
  },
  {
    id: 'emporium', name: 'Emporium', group: 'shop', w: 4, d: 8, h: 5,
    note: '4×8 · long 2-floor store, double doors', accent: '#6b8cce',
    pieces: [
      ...storey(4, 8, 'wall_marble', 0, [
        { x: 2, y: 7, kind: 'door_double' }, { x: 1, y: 7, kind: 'wall_glass' },
        { x: 3, y: 2, kind: 'wall_glass' }, { x: 3, y: 3, kind: 'wall_glass' },
        { x: 3, y: 5, kind: 'wall_glass' }, { x: 3, y: 6, kind: 'wall_glass' },
      ]),
      ...deck(4, 8, 'blk_marble', 2),
      ...storey(4, 8, 'wall_brick', 2, [
        { x: 1, y: 7, kind: 'window' }, { x: 2, y: 7, kind: 'window' },
        { x: 3, y: 2, kind: 'window' }, { x: 3, y: 4, kind: 'window' }, { x: 3, y: 6, kind: 'window' },
      ]),
      ...roofTop(4, 8, 'roof_slate', 4),
    ],
  },
  // ── HOUSES ──
  {
    id: 'cottage', name: 'Cottage', group: 'house', w: 4, d: 6, h: 3,
    note: '4×6 · cosy brick house, thatched roof + chimney', accent: '#a3503a',
    pieces: [
      ...storey(4, 6, 'wall_brick', 0, [
        { x: 1, y: 5, kind: 'door_arch' }, { x: 2, y: 5, kind: 'window_wood' },
        { x: 3, y: 2, kind: 'window_wood' }, { x: 3, y: 3, kind: 'window_wood' },
      ]),
      ...roofTop(4, 6, 'roof_thatch', 2),
      { kind: 'pillar_stone', x: 0, y: 1, dir: 0, elev: 2 },   // chimney poking through the thatch
    ],
  },
  {
    id: 'townhouse', name: 'Townhouse', group: 'house', w: 4, d: 4, h: 5,
    note: '4×4 · narrow 2-floor stone & brick home', accent: '#8a8f98',
    pieces: [
      ...storey(4, 4, 'wall_stone', 0, [
        { x: 1, y: 3, kind: 'door' }, { x: 2, y: 3, kind: 'window' }, { x: 3, y: 2, kind: 'window' },
      ]),
      ...deck(4, 4, 'blk_stone', 2),
      ...storey(4, 4, 'wall_brick', 2, [
        { x: 1, y: 3, kind: 'window' }, { x: 2, y: 3, kind: 'window' },
        { x: 3, y: 1, kind: 'window' }, { x: 3, y: 2, kind: 'window' },
      ]),
      ...roofTop(4, 4, 'roof_slate', 4),
    ],
  },
  // ── CASTLES / TALL ──
  {
    id: 'tower', name: 'Wizard Tower', group: 'castle', w: 4, d: 4, h: 7,
    note: '4×4 · 3 floors tall, pointed roof', accent: '#b8bcc4',
    pieces: [
      ...storey(4, 4, 'wall_stone', 0, [{ x: 1, y: 3, kind: 'door_arch' }, { x: 3, y: 2, kind: 'window_arch' }]),
      ...deck(4, 4, 'blk_stone', 2),
      ...storey(4, 4, 'wall_stone', 2, [{ x: 2, y: 3, kind: 'window_round' }, { x: 3, y: 1, kind: 'window_round' }]),
      ...deck(4, 4, 'blk_stone', 4),
      ...storey(4, 4, 'wall_stone', 4, [{ x: 1, y: 3, kind: 'window_arch' }, { x: 3, y: 2, kind: 'window_arch' }]),
      ...roofTop(4, 4, 'roof_slate', 6),
    ],
  },
  {
    id: 'keep', name: 'Castle Keep', group: 'castle', w: 8, d: 8, h: 6,
    note: '8×8 · curtain walls, corner towers + gatehouse', accent: '#8a8f98',
    pieces: [
      // curtain wall (one storey, h2) with an arched double gate on the front-left edge
      ...storey(8, 8, 'wall_stone', 0, [
        { x: 3, y: 7, kind: 'door_arch' }, { x: 4, y: 7, kind: 'door_arch' },
        { x: 7, y: 3, kind: 'window' }, { x: 7, y: 4, kind: 'window' },
      ]),
      // crenellations — every other perimeter cell gets a stub on top (toothy battlement)
      ...storey(8, 8, 'wall_stone', 2).filter((_, i) => i % 2 === 0),
      // four corner towers — pillars stacked two high (z0..6)
      ...([[0, 0], [7, 0], [0, 7], [7, 7]] as [number, number][]).flatMap(([x, y]) => [
        { kind: 'pillar_stone', x, y, dir: 0, elev: 0 },
        { kind: 'pillar_stone', x, y, dir: 0, elev: 3 },
        { kind: 'roof_slate', x, y, dir: 0, elev: 6 },
      ]),
      // inner keep — a small 2×2 tower in the courtyard with its own roof
      ...storey(2, 2, 'wall_stone', 0).map(p => ({ ...p, x: p.x + 3, y: p.y + 3 })),
      ...storey(2, 2, 'wall_brick', 2, [{ x: 1, y: 1, kind: 'window' }]).map(p => ({ ...p, x: p.x + 3, y: p.y + 3 })),
      ...roofTop(2, 2, 'roof_slate', 4).map(p => ({ ...p, x: p.x + 3, y: p.y + 3 })),
    ],
  },
];

export const PREFAB_GROUPS: { id: PrefabGroup; name: string }[] = [
  { id: 'shop', name: 'Shops' },
  { id: 'house', name: 'Houses' },
  { id: 'castle', name: 'Castles' },
];
