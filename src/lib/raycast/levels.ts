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
//   'O'                  tunnel (walkable; step on to warp to the NEXT tunnel cell — two make an A↔B
//                        pair, three+ form a loop you cycle through in reading order)
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
  sky?: string;            // sky preset key (see SKIES) — gradient + weather instead of a flat ceiling
  music?: Mood;            // override the ambience mood (else derived from atmo/sky)
  combat?: boolean;        // can you fight back? false = a run-and-hide world (no weapon, just survive)
  npcs?: Npc3D[];          // friendly/scripted NPC characters dropped into the realm
  palette?: Partial<Palette>;   // per-level overrides on top of the atmosphere
  heights?: string[];      // OPTIONAL per-cell floor level ('0'–'9'), same dims as rows. Absent/all-'0'
                           // = flat (classic renderer). Steps of 1 level are climbable; bigger = a wall.
  author?: string;
};

// 'M' cells spawn a HAZARD NPC (a stalker that hunts you). It's walkable floor otherwise.
export const MONSTER_CHAR = 'M';

// 'O' cells are tunnels: stepping onto one warps you to the next tunnel cell (reading order, wrapping).
export const TUNNEL_CHAR = 'O';

// Friendly/scripted NPCs placed in a realm — built with the same character builder as the rooms.
// `a` is an appearance id (person:… / creature:… / skin id / icon:…); rendered as a billboard in 3D.
export type Npc3D = { x: number; y: number; a: string; n?: string; sz?: number; lines?: string[] };

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
  candle:   { label: 'Candle',   palette: { ceil: [10, 6, 4], floor: [44, 33, 24], fog: [0, 0, 0], wall: { '#': [140, 112, 82] } }, light: { radius: 7, ambient: 0.09, flicker: 0.16 } },
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

// ── Skies ────────────────────────────────────────────────────────────────────────────────────────
// When a realm has a sky, the "ceiling" region renders this vertical gradient (top → horizon) instead
// of a solid ceiling, plus an optional overlay effect (rain/stars/embers/mist). null sky = dungeon roof.
export type Sky = { label: string; top: [number, number, number]; horizon: [number, number, number]; fx?: 'rain' | 'stars' | 'embers' | 'mist' | 'snow' };
export const SKIES: Record<string, Sky> = {
  day:      { label: 'Day',     top: [60, 130, 230], horizon: [170, 200, 240] },
  sunset:   { label: 'Sunset',  top: [40, 30, 90], horizon: [240, 120, 60] },
  night:    { label: 'Night',   top: [4, 6, 20], horizon: [20, 26, 54], fx: 'stars' },
  overcast: { label: 'Overcast', top: [90, 96, 104], horizon: [150, 154, 160] },
  rain:     { label: 'Rain',    top: [40, 46, 56], horizon: [78, 86, 96], fx: 'rain' },
  mist:     { label: 'Mist',    top: [120, 126, 130], horizon: [180, 184, 188], fx: 'mist' },
  haze:     { label: 'Haze',    top: [150, 130, 100], horizon: [210, 180, 140], fx: 'mist' },
  lava:     { label: 'Lava',    top: [30, 6, 4], horizon: [150, 40, 10], fx: 'embers' },
  void:     { label: 'Void',    top: [0, 0, 0], horizon: [10, 4, 18], fx: 'stars' },
  snow:     { label: 'Snow',    top: [120, 134, 150], horizon: [200, 210, 220], fx: 'snow' },
};
export const skyOf = (level: Level3D): Sky | null => (level.sky && SKIES[level.sky]) || null;

// ── Music mood ───────────────────────────────────────────────────────────────────────────────────
// Spooky levels get spooky tunes, chill levels chill. Derived from the atmosphere/sky unless the level
// sets `music` explicitly. The RaycastCanvas ambience synth reads this.
export type Mood = 'chill' | 'spooky' | 'tense';
export function moodOf(level: Level3D): Mood {
  if (level.music === 'chill' || level.music === 'spooky' || level.music === 'tense') return level.music;
  if (level.atmo === 'candle' || level.atmo === 'blackout' || level.sky === 'void' || level.sky === 'night') return 'spooky';
  if (level.atmo === 'hell' || level.sky === 'lava') return 'tense';
  return 'chill';
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
    '#S.O.#.....#....C#',
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
    '#.O.#....E.....#.#',
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

// THE SPRAWL — a big open ruin under a night sky: a raised central plaza (climb the steps), lava
// patches, a pit, crystals to grab, and five stalkers ('M') hunting you in the dark. Spooky music.
const SPRAWL: Level3D = (() => {
  const W = 22, H = 16;
  const g: string[] = [], h: string[] = [];
  for (let y = 0; y < H; y++) {
    let row = '', hr = '';
    for (let x = 0; x < W; x++) {
      const border = x === 0 || y === 0 || x === W - 1 || y === H - 1;
      if (border) { row += '#'; hr += '0'; continue; }
      row += '.';
      const cx = Math.abs(x - 11), cy = Math.abs(y - 8);
      hr += String(cx <= 3 && cy <= 2 ? 2 : cx <= 4 && cy <= 3 ? 1 : 0);   // raised central plaza
    }
    g.push(row); h.push(hr);
  }
  const set = (x: number, y: number, ch: string) => { g[y] = g[y].substring(0, x) + ch + g[y].substring(x + 1); };
  ([[3, 3], [3, 12], [18, 3], [18, 12], [8, 6], [14, 6], [8, 10], [14, 10]] as [number, number][])
    .forEach(([x, y]) => { set(x, y, '#'); set(x + 1, y, '#'); });   // pillar blocks
  ([[2, 8], [3, 8], [19, 8]] as [number, number][]).forEach(([x, y]) => set(x, y, 'L'));   // lava
  set(11, 2, '~'); set(11, 3, '~');                                                          // a pit
  ([[5, 2], [17, 2], [5, 13], [17, 13], [11, 11]] as [number, number][]).forEach(([x, y]) => set(x, y, 'M'));  // stalkers
  ([[11, 8], [10, 8], [12, 8], [2, 2], [20, 2], [2, 13], [20, 13]] as [number, number][]).forEach(([x, y]) => set(x, y, 'C'));
  set(1, 1, 'S'); set(20, 14, 'E');
  return { id: 'sprawl', name: 'The Sprawl', spawnDir: 0, atmo: 'candle', sky: 'night', music: 'spooky' as Mood, rows: g, heights: h };
})();

// THE GLADE — an outdoor grass clearing under a day sky: a pond to swim across (don't linger or you
// drown), scattered trees, crystals. Shows grass/water/trees + the breath mechanic.
const GLADE: Level3D = (() => {
  const W = 16, H = 12, g: string[] = [];
  for (let y = 0; y < H; y++) {
    let row = '';
    for (let x = 0; x < W; x++) row += (x === 0 || y === 0 || x === W - 1 || y === H - 1) ? '#' : 'g';
    g.push(row);
  }
  const set = (x: number, y: number, ch: string) => { g[y] = g[y].substring(0, x) + ch + g[y].substring(x + 1); };
  for (let y = 4; y <= 7; y++) for (let x = 6; x <= 10; x++) set(x, y, 'w');     // pond
  ([[2, 2], [13, 2], [3, 9], [12, 9], [7, 2], [11, 10], [2, 6], [13, 6]] as [number, number][]).forEach(([x, y]) => set(x, y, 'T'));
  ([[2, 4], [13, 4], [8, 10]] as [number, number][]).forEach(([x, y]) => set(x, y, 'C'));
  set(1, 1, 'S'); set(14, 10, 'E');
  return { id: 'glade', name: 'The Glade', spawnDir: 0, sky: 'day', music: 'chill' as Mood, rows: g };
})();

export const BUILTIN_LEVELS: Level3D[] = [UNDERVAULT, NEONGRID, HOLLOW, ASCENT, SPRAWL, GLADE];

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
