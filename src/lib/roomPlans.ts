// OUROO PRAÇA — room floor PLANS (Habbo-style). A plan is an 11×11 grid of tiles where each cell is
// either VOID ('x' / space — no floor, not walkable) or a FLOOR at a base height level ('0'–'9').
// This lets rooms be shapes other than a full square: L-rooms, crosses, octagons, courtyards, and
// split-level floors (you step up/down one level, same ±1 rule as furni decks). Rows/cols beyond the
// strings are treated as void, so plans can be smaller than the grid.

// Max grid the engine supports (array stride + bounds). Plans can be any size up to this; the room
// camera scales the footprint to fit the stage, so bigger plans just zoom out.
export const PLAN_GRID = 20;

export type RoomPlan = { id: string; name: string; rows: string[]; spawn?: [number, number] };

const F = '00000000000';
// Generators for the bigger rooms (kept terse so the shapes stay readable).
const full = (n: number) => Array.from({ length: n }, () => '0'.repeat(n));
const octa = (n: number, k: number) => Array.from({ length: n }, (_, y) =>
  Array.from({ length: n }, (_, x) => ((x + y < k) || (x + (n - 1 - y) < k) || ((n - 1 - x) + y < k) || ((n - 1 - x) + (n - 1 - y) < k)) ? 'x' : '0').join(''));

export const ROOM_PLANS: RoomPlan[] = [
  { id: 'salao', name: 'Salão', rows: [F, F, F, F, F, F, F, F, F, F, F] },
  {
    id: 'quadrado', name: 'Quadrado', rows: [
      'xxxxxxxxxxx',
      'x000000000x',
      'x000000000x',
      'x000000000x',
      'x000000000x',
      'x000000000x',
      'x000000000x',
      'x000000000x',
      'x000000000x',
      'x000000000x',
      'xxxxxxxxxxx',
    ],
  },
  {
    id: 'ele', name: 'L', rows: [
      '000000xxxxx',
      '000000xxxxx',
      '000000xxxxx',
      '000000xxxxx',
      '000000xxxxx',
      '00000000000',
      '00000000000',
      '00000000000',
      '00000000000',
      '00000000000',
      '00000000000',
    ], spawn: [1, 9],
  },
  {
    id: 'cruz', name: 'Cruz', rows: [
      'xxxx000xxxx',
      'xxxx000xxxx',
      'xxxx000xxxx',
      'xxxx000xxxx',
      '00000000000',
      '00000000000',
      '00000000000',
      'xxxx000xxxx',
      'xxxx000xxxx',
      'xxxx000xxxx',
      'xxxx000xxxx',
    ], spawn: [5, 5],
  },
  {
    id: 'octo', name: 'Octógono', rows: [
      'xxx00000xxx',
      'xx0000000xx',
      'x000000000x',
      '00000000000',
      '00000000000',
      '00000000000',
      '00000000000',
      '00000000000',
      'x000000000x',
      'xx0000000xx',
      'xxx00000xxx',
    ], spawn: [5, 5],
  },
  {
    id: 'palco', name: 'Palco', rows: [
      '11111111111',
      '11111111111',
      '00000000000',
      '00000000000',
      '00000000000',
      '00000000000',
      '00000000000',
      '00000000000',
      '00000000000',
      '00000000000',
      '00000000000',
    ], spawn: [5, 8],
  },
  {
    id: 'patio', name: 'Pátio', rows: [
      '00000000000',
      '00000000000',
      '00xxxxxxx00',
      '00xxxxxxx00',
      '00xxxxxxx00',
      '00xxxxxxx00',
      '00xxxxxxx00',
      '00xxxxxxx00',
      '00xxxxxxx00',
      '00000000000',
      '00000000000',
    ], spawn: [5, 0],
  },
  { id: 'grande', name: 'Grande', rows: full(14) },
  { id: 'enorme', name: 'Enorme', rows: full(18) },
  { id: 'pista', name: 'Pista', rows: octa(16, 5), spawn: [8, 8] },
];

export const planById = (id?: string): RoomPlan => ROOM_PLANS.find(p => p.id === id) ?? ROOM_PLANS[0];

// Base level of a cell, or -1 for void / out of bounds.
export const planLevelAt = (plan: RoomPlan, gx: number, gy: number): number => {
  if (gx < 0 || gy < 0 || gx >= PLAN_GRID || gy >= PLAN_GRID) return -1;
  const row = plan.rows[gy]; if (!row) return -1;
  const ch = row[gx]; if (!ch || ch === 'x' || ch === 'X' || ch === ' ' || ch === '.') return -1;
  const n = ch.charCodeAt(0) - 48; return n >= 0 && n <= 9 ? n : -1;
};

// Flat Int8Array of base levels (-1 = void), indexed gy*PLAN_GRID + gx.
export const planMask = (plan: RoomPlan): Int8Array => {
  const m = new Int8Array(PLAN_GRID * PLAN_GRID);
  for (let gy = 0; gy < PLAN_GRID; gy++) for (let gx = 0; gx < PLAN_GRID; gx++) m[gy * PLAN_GRID + gx] = planLevelAt(plan, gx, gy);
  return m;
};

// Bounding box of the walkable footprint (used to centre the camera + the spawn).
export const planFootprint = (plan: RoomPlan): { minX: number; minY: number; maxX: number; maxY: number } => {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let gy = 0; gy < PLAN_GRID; gy++) for (let gx = 0; gx < PLAN_GRID; gx++) {
    if (planLevelAt(plan, gx, gy) < 0) continue;
    if (gx < minX) minX = gx; if (gx > maxX) maxX = gx; if (gy < minY) minY = gy; if (gy > maxY) maxY = gy;
  }
  return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : { minX: 0, minY: 0, maxX: 0, maxY: 0 };
};

// Spawn tile: explicit, else the walkable cell nearest the footprint centre.
export const planSpawn = (plan: RoomPlan): { gx: number; gy: number; lvl: number } => {
  if (plan.spawn && planLevelAt(plan, plan.spawn[0], plan.spawn[1]) >= 0) return { gx: plan.spawn[0], gy: plan.spawn[1], lvl: planLevelAt(plan, plan.spawn[0], plan.spawn[1]) };
  const fp = planFootprint(plan); const cx = (fp.minX + fp.maxX) / 2, cy = (fp.minY + fp.maxY) / 2;
  let best: { gx: number; gy: number; lvl: number } | null = null, bd = Infinity;
  for (let gy = 0; gy < PLAN_GRID; gy++) for (let gx = 0; gx < PLAN_GRID; gx++) {
    const l = planLevelAt(plan, gx, gy); if (l < 0) continue;
    const d = (gx - cx) ** 2 + (gy - cy) ** 2; if (d < bd) { bd = d; best = { gx, gy, lvl: l }; }
  }
  return best ?? { gx: 5, gy: 5, lvl: 0 };
};
