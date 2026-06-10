// OUROO PRAÇA — room floor PLANS (Habbo-style). A plan is an 11×11 grid of tiles where each cell is
// either VOID ('x' / space — no floor, not walkable) or a FLOOR at a base height level ('0'–'9').
// This lets rooms be shapes other than a full square: L-rooms, crosses, octagons, courtyards, and
// split-level floors (you step up/down one level, same ±1 rule as furni decks). Rows/cols beyond the
// strings are treated as void, so plans can be smaller than the grid.

export const PLAN_GRID = 11;

export type RoomPlan = { id: string; name: string; rows: string[]; spawn?: [number, number] };

const F = '00000000000';
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

// Spawn tile: explicit, else the first walkable cell (scanning from the front/centre outward).
export const planSpawn = (plan: RoomPlan): { gx: number; gy: number; lvl: number } => {
  if (plan.spawn && planLevelAt(plan, plan.spawn[0], plan.spawn[1]) >= 0) return { gx: plan.spawn[0], gy: plan.spawn[1], lvl: planLevelAt(plan, plan.spawn[0], plan.spawn[1]) };
  const c = (PLAN_GRID - 1) / 2;
  let best: { gx: number; gy: number; lvl: number } | null = null, bd = Infinity;
  for (let gy = 0; gy < PLAN_GRID; gy++) for (let gx = 0; gx < PLAN_GRID; gx++) {
    const l = planLevelAt(plan, gx, gy); if (l < 0) continue;
    const d = (gx - c) ** 2 + (gy - c) ** 2; if (d < bd) { bd = d; best = { gx, gy, lvl: l }; }
  }
  return best ?? { gx: 5, gy: 5, lvl: 0 };
};
