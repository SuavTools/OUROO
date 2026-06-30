// OUROO R3D — first-person 3D "realms" reachable through portals. A level is a grid of single-char
// cells (same spirit as roomPlans), but the RaycastCanvas reads it as a first-person space: solid
// cells are walls you bump into, open cells are floor you walk on, and special cells are hazards,
// pickups, the spawn, or the exit back to the flat room. Designed in RaycastDesigner, summoned by a
// portal whose destination is `r3d:<id>`.
//
// Cell chars:
//   '#' '1' '2' '3' '4'  walls (texture variants — block movement)
//   '.' ' '              floor (walkable)
//   'L'                  lava  (walkable, but drains HP while you stand in it)
//   '~'                  pit   (walkable onto — you fall and die)
//   'C'                  crystal pickup (walkable; grab for a small reward)
//   'E'                  exit  (walkable; step on it to return to the flat room)
//   'S'                  spawn (walkable; where you appear — exactly one)

export type Palette = {
  ceil: [number, number, number];   // ceiling colour (top of the world)
  floor: [number, number, number];  // default floor colour
  fog: [number, number, number];    // colour distance fades toward
  wall: Record<string, [number, number, number]>;  // base colour per wall char
};

export type Level3D = {
  id: string;
  name: string;
  rows: string[];          // grid; row index = world Y (north→south), col index = world X (west→east)
  spawnDir?: number;       // facing in degrees (0 = +X / east), default 0
  atmo?: string;           // atmosphere preset key (see ATMOS) — sets palette + lighting mood
  palette?: Partial<Palette>;   // per-level overrides on top of the atmosphere
  heights?: string[];      // OPTIONAL per-cell floor level ('0'–'9'), same dims as rows. Absent/all-'0'
                           // = flat (classic renderer). Steps of 1 level are climbable; bigger = a wall.
  author?: string;
};

// Floor level (0–9) of an open cell — 0 when no height map. Walls ignore this.
export const heightAt = (level: Pick<Level3D, 'heights'>, x: number, y: number): number => {
  const h = level.heights; if (!h) return 0;
  const row = h[y]; const c = row && row[x];
  const n = c ? c.charCodeAt(0) - 48 : 0;
  return n >= 1 && n <= 9 ? n : 0;
};
export const hasHeightMap = (level: Pick<Level3D, 'heights'>): boolean =>
  !!level.heights && level.heights.some(r => /[1-9]/.test(r));

// Lighting model. radius>0 = a "lantern" world: brightness falls to `ambient` past `radius` tiles, so
// everything beyond your light is swallowed by black (Amnesia/Slender dread). flicker animates it.
export type Lighting = { radius: number; ambient: number; flicker: number };

export const WALL_CHARS = new Set(['#', '1', '2', '3', '4']);
export const isWall = (ch: string) => WALL_CHARS.has(ch);

export const DEFAULT_PALETTE: Palette = {
  ceil: [14, 14, 26],
  floor: [38, 36, 54],
  fog: [8, 8, 16],
  wall: {
    '#': [120, 116, 150],   // stone
    '1': [150, 90, 80],     // brick / rust
    '2': [70, 120, 150],    // cold blue
    '3': [90, 150, 100],    // mossy
    '4': [160, 140, 70],    // gold / sand
  },
};

// ── Atmosphere presets ───────────────────────────────────────────────────────────────────────────
// Each sets a palette mood and (optionally) a lantern light. The designer exposes these as one click;
// a level may still override individual palette colours on top.
export const ATMOS: Record<string, { label: string; palette: Partial<Palette>; light?: Lighting }> = {
  dungeon:  { label: 'Dungeon',  palette: { ceil: [14, 14, 26], floor: [38, 36, 54], fog: [8, 8, 16] } },
  hell:     { label: 'Hell',     palette: { ceil: [30, 6, 4], floor: [40, 14, 8], fog: [40, 6, 2], wall: { '#': [150, 70, 60] } } },
  fog:      { label: 'Fog',      palette: { ceil: [60, 64, 70], floor: [54, 56, 60], fog: [120, 124, 130] } },
  neon:     { label: 'Neon',     palette: { ceil: [4, 8, 16], floor: [10, 16, 24], fog: [2, 6, 14] } },
  // Horror lanterns — most of the world is pitch black; you see only a small ring around you.
  blackout: { label: 'Blackout', palette: { ceil: [2, 2, 4], floor: [16, 14, 18], fog: [0, 0, 0] }, light: { radius: 4.5, ambient: 0.04, flicker: 0 } },
  candle:   { label: 'Candle',   palette: { ceil: [10, 6, 4], floor: [30, 22, 16], fog: [0, 0, 0], wall: { '#': [120, 96, 70] } }, light: { radius: 5.5, ambient: 0.05, flicker: 0.18 } },
};

export function paletteOf(level: Level3D): Palette {
  const atmo = (level.atmo && ATMOS[level.atmo]?.palette) || {};
  const p = { ...atmo, ...(level.palette ?? {}) };   // level overrides win over the atmosphere
  return {
    ceil: p.ceil ?? DEFAULT_PALETTE.ceil,
    floor: p.floor ?? DEFAULT_PALETTE.floor,
    fog: p.fog ?? DEFAULT_PALETTE.fog,
    wall: { ...DEFAULT_PALETTE.wall, ...(atmo.wall ?? {}), ...(level.palette?.wall ?? {}) },
  };
}

export function lightingOf(level: Level3D): Lighting | null {
  return (level.atmo && ATMOS[level.atmo]?.light) || null;
}

// Grid helpers — cells beyond the row strings read as solid wall, so the world is always enclosed.
export const cellAt = (rows: string[], x: number, y: number): string => {
  if (y < 0 || y >= rows.length) return '#';
  const row = rows[y];
  if (x < 0 || x >= row.length) return '#';
  return row[x] || '#';
};

export function findSpawn(rows: string[]): { x: number; y: number } {
  for (let y = 0; y < rows.length; y++) {
    const x = rows[y].indexOf('S');
    if (x >= 0) return { x: x + 0.5, y: y + 0.5 };
  }
  // fall back to the first open cell, else the centre
  for (let y = 0; y < rows.length; y++)
    for (let x = 0; x < rows[y].length; x++)
      if (!isWall(cellAt(rows, x, y))) return { x: x + 0.5, y: y + 0.5 };
  return { x: 1.5, y: 1.5 };
}

// ── Built-in demo realms ────────────────────────────────────────────────────────────────────────
// THE UNDERVAULT — a starter dungeon: stone halls, a lava moat with a narrow crossing, a bottomless
// pit, a few crystals to grab, and an exit gate on the far side.
const UNDERVAULT: Level3D = {
  id: 'undervault',
  name: 'The Undervault',
  spawnDir: 0,
  rows: [
    '################',
    '#S....#....C...#',
    '#.....#...#....#',
    '#.....#...#....1',
    '#..C..#...#....1',
    '###.###LLL#.####',
    '#.....LLLLL....#',
    '#..~~.LLLLL.~~.#',
    '#..~~..LLL..~~.#',
    '#..~~.......~~.#',
    '#2222.....C..22#',
    '#2....#####...2#',
    '#2.C..#...#...2#',
    '#2....#.E.#...2#',
    '#2....#####...2#',
    '################',
  ],
  palette: {
    wall: { '1': [150, 90, 80], '2': [90, 80, 120] },
    floor: [40, 36, 48],
    fog: [6, 4, 12],
  },
};

// NEON GRID — a brighter, open arena to show off textures/strafing without hazards crowding it.
const NEONGRID: Level3D = {
  id: 'neongrid',
  name: 'Neon Grid',
  spawnDir: 0,
  rows: [
    '############',
    '#S.........#',
    '#.3.3.3.3..#',
    '#..........#',
    '#.3.3.3.3.C#',
    '#..........#',
    '#.3.3.3.3..#',
    '#....C.....#',
    '#.3.3.3.3..#',
    '#.........E#',
    '############',
  ],
  palette: {
    ceil: [4, 8, 16], floor: [10, 16, 24], fog: [2, 6, 14],
    wall: { '3': [40, 220, 180] },
  },
};

// THE HOLLOW — a pitch-black maze lit only by your candle. Crystals glow as beacons in the dark; find
// your way to the exit before the dark gets to you. Slender/Amnesia in lo-fi.
const HOLLOW: Level3D = {
  id: 'hollow',
  name: 'The Hollow',
  spawnDir: 0,
  atmo: 'candle',
  rows: [
    '##################',
    '#S...#.....#....C#',
    '###.#.###.#.####.#',
    '#...#...#.#....#.#',
    '#.#####.#.###.#.##',
    '#.#...#.#...#.#..#',
    '#.#.#.#.###.#.##.#',
    '#...#...#C#.#..#.#',
    '###.###.#.#.##.#.#',
    '#C..#...#.#..#..C#',
    '#.###.###.##.###.#',
    '#.#...#....#...#.#',
    '#.#.###.##.###.#.#',
    '#...#...##...#...#',
    '###.#.######.###.#',
    '#...#....E.....#.#',
    '#.############.#.#',
    '##################',
  ],
};

// THE ASCENT — a stepped pyramid: climb the rings (each one level higher) to the exit at the summit.
// Shows off verticality — steps, looking down off the edge, crystals on the mid-tiers.
const ASCENT: Level3D = (() => {
  const n = 11, rows: string[] = [], heights: string[] = [];
  for (let y = 0; y < n; y++) {
    let r = '', h = '';
    for (let x = 0; x < n; x++) {
      const ring = Math.min(x, y, n - 1 - x, n - 1 - y);
      if (ring === 0) { r += '#'; h += '0'; continue; }
      const lvl = Math.min(ring - 1, 3);
      let ch = '.';
      if (x === 5 && y === 5) ch = 'E';                       // summit exit
      else if (x === 1 && y === 1) ch = 'S';                  // start in a low corner
      else if ((x === 5 && y === 1) || (x === 1 && y === 5) || (x === 9 && y === 5)) ch = 'C';
      r += ch; h += String(lvl);
    }
    rows.push(r); heights.push(h);
  }
  return { id: 'ascent', name: 'The Ascent', spawnDir: 0, atmo: 'dungeon', rows, heights };
})();

export const BUILTIN_LEVELS: Level3D[] = [UNDERVAULT, NEONGRID, HOLLOW, ASCENT];

// ── localStorage store (localStorage-first, like the wallet) ─────────────────────────────────────
const STORE_KEY = 'ouroo_r3d_levels';

function readStore(): Record<string, Level3D> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, Level3D>) : {};
  } catch { return {}; }
}
function writeStore(store: Record<string, Level3D>) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch { /* quota / private mode */ }
}

export function listLevels(): Level3D[] {
  const custom = Object.values(readStore()).sort((a, b) => a.name.localeCompare(b.name));
  return [...BUILTIN_LEVELS, ...custom];
}

export function getLevel(id: string): Level3D | null {
  return readStore()[id] ?? BUILTIN_LEVELS.find(l => l.id === id) ?? null;
}

export function saveLevel(level: Level3D): void {
  const store = readStore();
  store[level.id] = level;
  writeStore(store);
}

export function deleteLevel(id: string): void {
  const store = readStore();
  delete store[id];
  writeStore(store);
}

export const isBuiltin = (id: string) => BUILTIN_LEVELS.some(l => l.id === id);

// Short, URL-safe id for a new user level (e.g. "w-7f3a9c"). Plain runtime code — Date/Math are fine.
export function newLevelId(): string {
  return 'w-' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);
}

export function blankLevel(w = 12, h = 12): Level3D {
  const rows: string[] = [];
  for (let y = 0; y < h; y++) {
    let row = '';
    for (let x = 0; x < w; x++) {
      const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1;
      row += edge ? '#' : (x === 1 && y === 1 ? 'S' : '.');
    }
    rows.push(row);
  }
  return { id: newLevelId(), name: 'Untitled Realm', rows, spawnDir: 0 };
}
