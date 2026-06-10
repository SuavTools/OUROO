// OUROO PRAÇA — room floor PLANS (Habbo-style). A plan is an 11×11 grid of tiles where each cell is
// either VOID ('x' / space — no floor, not walkable) or a FLOOR at a base height level ('0'–'9').
// This lets rooms be shapes other than a full square: L-rooms, crosses, octagons, courtyards, and
// split-level floors (you step up/down one level, same ±1 rule as furni decks). Rows/cols beyond the
// strings are treated as void, so plans can be smaller than the grid.

// Max grid the engine supports (array stride + bounds). Plans can be any size up to this; the room
// camera scales the footprint to fit the stage, so bigger plans just zoom out.
export const PLAN_GRID = 40;

// Cell chars: 'x'/' '/'.' = void · '0'–'9' = floor at that base level · 'w' = water/pool (walkable,
// sunken) · material floors at ground level: 'm' marble-checker, 'g' grass, 'c' carpet, 'k' dark-check.
export type RoomPlan = { id: string; name: string; rows: string[]; spawn?: [number, number] };
const MATERIALS: Record<string, number> = { m: 1, g: 2, c: 3, k: 4 };   // 0 = default room floor

const F = '00000000000';
// Generators for the bigger rooms (kept terse so the shapes stay readable).
const full = (n: number) => Array.from({ length: n }, () => '0'.repeat(n));
const octa = (n: number, k: number) => Array.from({ length: n }, (_, y) =>
  Array.from({ length: n }, (_, x) => ((x + y < k) || (x + (n - 1 - y) < k) || ((n - 1 - x) + y < k) || ((n - 1 - x) + (n - 1 - y) < k)) ? 'x' : '0').join(''));

// The grand CLUBE lobby — a big octagonal hall with a raised central dais, two side pools and a front
// reflecting pool. Curated (mods-only), ~34×34 so the camera zooms right out like a Habbo Club lobby.
const clube = (): string[] => {
  const n = 34, k = 9; const g: string[][] = [];
  for (let y = 0; y < n; y++) { const row: string[] = []; for (let x = 0; x < n; x++) { const corner = (x + y < k) || (x + (n - 1 - y) < k) || ((n - 1 - x) + y < k) || ((n - 1 - x) + (n - 1 - y) < k); row.push(corner ? 'x' : 'm'); } g.push(row); }   // base = marble
  const fill = (x0: number, x1: number, y0: number, y1: number, ch: string) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (g[y] && g[y][x] !== 'x') g[y][x] = ch; };
  fill(11, 22, 4, 8, '1');     // raised STAGE across the back
  fill(5, 9, 10, 12, 'g'); fill(24, 28, 10, 12, 'g');   // grass beds flanking the stage
  fill(4, 8, 14, 24, 'w'); fill(25, 29, 14, 24, 'w');   // two long side pools
  fill(16, 18, 9, 31, 'c');    // red carpet runway: entrance → stage
  fill(5, 10, 27, 31, 'g'); fill(23, 28, 27, 31, 'g');  // grass beds at the entrance corners
  return g.map(r => r.join(''));
};

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
  { id: 'clube', name: 'Clube', rows: clube(), spawn: [17, 31] },
];

export const planById = (id?: string): RoomPlan => ROOM_PLANS.find(p => p.id === id) ?? ROOM_PLANS[0];

// Base level of a cell, or -1 for void / out of bounds. Water ('w') is walkable floor at ground level.
export const planLevelAt = (plan: RoomPlan, gx: number, gy: number): number => {
  if (gx < 0 || gy < 0 || gx >= PLAN_GRID || gy >= PLAN_GRID) return -1;
  const row = plan.rows[gy]; if (!row) return -1;
  const ch = row[gx]; if (!ch || ch === 'x' || ch === 'X' || ch === ' ' || ch === '.') return -1;
  if (ch === 'w' || ch === 'W' || ch in MATERIALS) return 0;   // water + material floors are ground level
  const n = ch.charCodeAt(0) - 48; return n >= 0 && n <= 9 ? n : -1;
};

// Floor material code at a cell (0 default · 1 marble · 2 grass · 3 carpet · 4 dark-check).
export const planMaterialAt = (plan: RoomPlan, gx: number, gy: number): number => {
  const row = plan.rows[gy]; const ch = row && row[gx]; return ch ? (MATERIALS[ch] ?? 0) : 0;
};
export const planMaterialMask = (plan: RoomPlan): Uint8Array => {
  const m = new Uint8Array(PLAN_GRID * PLAN_GRID);
  for (let gy = 0; gy < PLAN_GRID; gy++) for (let gx = 0; gx < PLAN_GRID; gx++) m[gy * PLAN_GRID + gx] = planMaterialAt(plan, gx, gy);
  return m;
};

// Is this cell a pool/water tile?
export const planIsWaterAt = (plan: RoomPlan, gx: number, gy: number): boolean => {
  const row = plan.rows[gy]; const ch = row && row[gx]; return ch === 'w' || ch === 'W';
};

// Flat mask of water tiles (1 = water), indexed gy*PLAN_GRID + gx.
export const planWaterMask = (plan: RoomPlan): Uint8Array => {
  const m = new Uint8Array(PLAN_GRID * PLAN_GRID);
  for (let gy = 0; gy < PLAN_GRID; gy++) for (let gx = 0; gx < PLAN_GRID; gx++) if (planIsWaterAt(plan, gx, gy)) m[gy * PLAN_GRID + gx] = 1;
  return m;
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
