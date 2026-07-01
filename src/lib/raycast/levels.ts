// OUROO R3D — first-person 3D "realms" reachable through portals. A level is a grid of single-char
// cells (same spirit as roomPlans), but the RaycastCanvas reads it as a first-person space: solid
// cells are walls you bump into, open cells are floor you walk on, and special cells are hazards,
// pickups, the spawn, or the exit back to the flat room. Designed in RaycastDesigner, summoned by a
// portal whose destination is `r3d:<id>`.
//
// Cell chars:
//   '#' '1' '2' '3' '4'  walls (texture variants — block movement)
//   '.' ' '              floor (walkable)
//   'g' 'w' 'p'          floors: grass · water (swim/drown) · pavement (stone tiles)
//   ' '                  AIR / hole — NO floor here. In a STACKED realm you see (and fall) straight
//                        through to the layer below; it's how overhangs & open shafts are carved.
//   'T' 'b' 'r' 'l'      props: tree & rock & lamp post are SOLID; lamp's orb glows. (billboards)
//   'f'                  flower (walkable decoration; bloom colour varies by tile)
//   'L'                  lava  (walkable, but drains HP while you stand in it)
//   '~'                  pit   (walkable onto — you fall and die)
//   'C'                  crystal pickup (walkable; grab for a small reward)
//   'H'                  chest (walkable; step onto it to OPEN → loot + reward. If a realm has any
//                        chests, the exit stays LOCKED until every chest is opened — a room condition)
//   'O'                  tunnel (walkable; step on to warp to the NEXT tunnel cell — two make an A↔B
//                        pair, three+ form a loop you cycle through in reading order)
//   '>'                  stairs UP   (walkable; step on to climb to the storey above, same x,y)
//   '<'                  stairs DOWN (walkable; step on to descend to the storey below, same x,y)
//   'E'                  exit  (walkable; step on it to return to the flat room)
//   'S'                  spawn (walkable; where you appear — exactly one across the whole realm)
//
// MULTI-STOREY: a realm may be a STACK of floors (`floors[]`, ordered bottom→top). When there are 2+
// floors the realm is rendered as a TRUE VOXEL STACK (see RaycastCanvas): every layer is drawn at its
// real height at once, so you physically walk UNDER overhangs and SEE/FALL through air holes — proper
// Minecraft-style verticality. Each layer sits STOREY_LEVELS units above the one below; a wall cell on
// a layer is a solid block one storey tall (stand on its top), an air cell (' ') is empty, every other
// cell is a thin walkable slab. You move between layers by jumping/stepping (gravity is real) or via
// the '>' / '<' stair cells (a quick lift up/down a storey). A single-grid level (just `rows`) is one
// flat floor, so old realms keep working untouched.

import { supabase } from '../supabase';
import { ownerId } from '../rooms';

export type Palette = {
  ceil: [number, number, number];   // ceiling colour (top of the world)
  floor: [number, number, number];  // default floor colour
  fog: [number, number, number];    // colour distance fades toward
  wall: Record<string, [number, number, number]>;  // base colour per wall char
};

// One storey of a multi-floor realm: its own walkable grid (+ optional per-cell terrain heights and
// placed NPCs). Floors stack bottom→top; you cross between them via '>' / '<' stair cells.
export type Floor3D = { rows: string[]; heights?: string[]; blocks?: string[]; blockH?: string[]; npcs?: Npc3D[] };

export type Level3D = {
  id: string;
  name: string;
  rows: string[];          // grid; row index = world Y (north→south), col index = world X (west→east)
  floors?: Floor3D[];      // OPTIONAL storey stack, ordered bottom→top. Present = multi-floor realm;
                           // absent = single floor built from rows/heights/npcs (back-compat).
  spawnDir?: number;       // facing in degrees (0 = +X / east), default 0
  exitDir?: number;        // exit DOOR facing in degrees (0/90/180/270). Absent = auto (faces the open side)
  atmo?: string;           // atmosphere preset key (see ATMOS) — sets palette + lighting mood
  sky?: string;            // sky preset key (see SKIES) — gradient + weather instead of a flat ceiling
  music?: Mood;            // override the ambience mood (else derived from atmo/sky)
  combat?: boolean;        // can you fight back? false = a run-and-hide world (no weapon, just survive)
  npcs?: Npc3D[];          // friendly/scripted NPC characters dropped into the realm
  palette?: Partial<Palette>;   // per-level overrides on top of the atmosphere
  heights?: string[];      // OPTIONAL per-cell floor level ('0'–'9'), same dims as rows. Absent/all-'0'
                           // = flat (classic renderer). Steps of 1 level are climbable; bigger = a wall.
  blocks?: string[];       // OPTIONAL per-cell BLOCK-on-top grid (same dims as rows). A block sits ON the
                           // floor material (grass/dirt/…), so you get "grass then rock on top". ' '/'.' = none.
  blockH?: string[];       // OPTIONAL per-cell block STACK height ('1'–'9', how many cubes tall). Absent = 1.
  author?: string;
};

// 'M' cells spawn a HAZARD NPC (a stalker that hunts you). It's walkable floor otherwise.
export const MONSTER_CHAR = 'M';

// 'O' cells are tunnels: stepping onto one warps you to the next tunnel cell (reading order, wrapping).
export const TUNNEL_CHAR = 'O';

// 'H' cells are chests: step onto one to open it (loot + reward). If a realm has any chests, its exit
// stays locked until they are ALL opened — the room-clear condition.
export const CHEST_CHAR = 'H';

// Inter-storey stairs: step on '>' to climb a floor, '<' to descend — you land at the same x,y.
export const STAIR_UP = '>';
export const STAIR_DOWN = '<';

// AIR — an empty cell on a stacked layer: no floor, no block. You look (and fall) straight through it
// to whatever's below. This is what makes overhangs/holes possible. Single-char ' ' so it reads as
// "nothing" in storage and the designer. (Legacy flat realms have no air cells, so they're unaffected.)
export const AIR = ' ';
export const isAir = (ch: string) => ch === AIR;

// A realm is a TRUE VOXEL STACK (overhangs, gravity, see-through holes) once it has 2+ floors.
export const isStacked = (level: Level3D): boolean => !!(level.floors && level.floors.length > 1);

// How many height-levels tall one storey is — the vertical gap between layer k and layer k+1. A wall
// block is exactly this tall, so floors stack flush (the block top of layer k == the floor of k+1).
export const STOREY_LEVELS = 3;

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

// ── Blocks ─────────────────────────────────────────────────────────────────────────────────────
// A BLOCK sits on top of a cell's floor material (stored in the parallel `blocks` grid). Each has a
// base colour (the voxel renderer adds pixel texture/shading) and a `thin` flag → a slender post/pillar
// (fence/support) that lets the floor show around it, vs a full-footprint cube. `tall` → 1 storey; a
// slab/roof piece is short. Solid to the player (walk around, stand on top).
export type BlockDef = { label: string; color: [number, number, number]; thin?: boolean; h?: number };
export const BLOCKS: Record<string, BlockDef> = {
  r: { label: 'Stone',  color: [122, 118, 112] },
  w: { label: 'Wood',   color: [150, 108, 62] },
  b: { label: 'Brick',  color: [150, 74, 60] },
  c: { label: 'Cobble', color: [108, 110, 120] },
  l: { label: 'Leaves', color: [46, 122, 54] },
  x: { label: 'Dark',   color: [66, 64, 74] },
  i: { label: 'Post',   color: [140, 100, 58], thin: true },   // slender wood post/pillar
  o: { label: 'Pillar', color: [120, 116, 110], thin: true },  // slender stone pillar
  s: { label: 'Slab',   color: [128, 124, 118], h: 0.34 },     // low stone slab / step / roof piece
};
export const blockAt = (f: Pick<Floor3D, 'blocks'>, x: number, y: number): string => {
  const b = f.blocks; if (!b) return '';
  const row = b[y]; const c = row && row[x];
  return c && BLOCKS[c] ? c : '';
};
// How many cubes tall a block is stacked (1–9). Absent height grid → 1.
export const blockHeightAt = (f: Pick<Floor3D, 'blockH'>, x: number, y: number): number => {
  const h = f.blockH; if (!h) return 1;
  const c = h[y]?.[x]; const n = c ? c.charCodeAt(0) - 48 : 0;
  return n >= 1 && n <= 9 ? n : 1;
};

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
  haven:    { label: 'Haven',    palette: { ceil: [120, 150, 200], floor: [92, 82, 68], fog: [150, 165, 190], wall: { '#': [186, 164, 132], '3': [120, 170, 110] } } },   // bright, warm, cheerful — happy music
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
// Each atmosphere gets its OWN theme for immersion — from a warm daytime tune, through airy mist and
// moody dungeons, to eerie spooky worlds, cold mystery, and full hell menace. Derived from atmo/sky
// unless the level sets `music` explicitly. The RaycastCanvas synth plays a distinct drone+melody per theme.
export type Mood = 'day' | 'mist' | 'dungeon' | 'spooky' | 'mystery' | 'hell' | 'haven';
const MOODS: Mood[] = ['day', 'mist', 'dungeon', 'spooky', 'mystery', 'hell', 'haven'];
export function moodOf(level: Level3D): Mood {
  const m = level.music as string | undefined;
  if (m && MOODS.includes(m as Mood)) return m as Mood;
  if (m === 'tense') return 'hell';        // back-compat with old saved realms
  if (m === 'chill') return 'day';
  const a = level.atmo, s = level.sky;
  if (a === 'haven') return 'haven';       // bright, cheerful realms
  if (a === 'hell' || s === 'lava') return 'hell';
  if (a === 'candle' || a === 'blackout') return 'spooky';
  if (s === 'void' || s === 'night') return 'mystery';
  if (a === 'neon') return 'mystery';
  if (a === 'fog' || s === 'mist' || s === 'overcast' || s === 'rain' || s === 'snow' || s === 'haze') return 'mist';
  if (a === 'dungeon' || !s) return 'dungeon';   // enclosed/roofed realms feel like moody dungeons
  return 'day';
}

// Grid helpers — cells beyond the row strings read as solid wall, so the world is always enclosed.
export const cellAt = (rows: string[], x: number, y: number): string => {
  if (y < 0 || y >= rows.length) return '#';
  const row = rows[y];
  if (x < 0 || x >= row.length) return '#';
  return row[x] || '#';
};

// The storey stack of a realm: explicit floors[] if multi-storey, else a single floor from rows.
export const floorsOf = (level: Level3D): Floor3D[] =>
  level.floors && level.floors.length
    ? level.floors
    : [{ rows: level.rows, heights: level.heights, blocks: level.blocks, blockH: level.blockH, npcs: level.npcs }];

// Which floor (and tile) holds the one spawn 'S'. Falls back to floor 0's open cell.
export function findSpawnFloor(floors: Floor3D[]): { fi: number; x: number; y: number } {
  for (let fi = 0; fi < floors.length; fi++)
    for (let y = 0; y < floors[fi].rows.length; y++) {
      const x = floors[fi].rows[y].indexOf('S');
      if (x >= 0) return { fi, x: x + 0.5, y: y + 0.5 };
    }
  const s = findSpawn(floors[0].rows);
  return { fi: 0, x: s.x, y: s.y };
}

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

// ── The one starter realm ─────────────────────────────────────────────────────────────────────────
// THE WIDE — a single big multi-storey sandbox that shows off the Minecraft-tall view. A far-and-wide
// ground plaza under open sky, a hill you climb, roofed TUNNELS you duck through (blocks sitting two
// levels up that you walk under), and overhang bridges. Walls are 2 blocks tall so you can't see over
// them; tunnel roofs sit 2 blocks up so you fit under. Fork it in the Forge to start building your own.
const STARTER: Level3D = (() => {
  const W = 40, H = 28;
  const g0: string[] = [], g1: string[] = [], g2: string[] = [], hh: string[] = [];
  for (let y = 0; y < H; y++) {
    let r0 = '', r1 = '', hr = '';
    for (let x = 0; x < W; x++) {
      const edge = x === 0 || y === 0 || x === W - 1 || y === H - 1;
      r0 += edge ? '#' : '.';
      r1 += edge ? '#' : ' ';   // 2-block-tall perimeter; open sky inside
      hr += '0';
    }
    g0.push(r0); g1.push(r1); g2.push(' '.repeat(W)); hh.push(hr);
  }
  const put = (g: string[], x: number, y: number, c: string) => { if (y >= 0 && y < H && x >= 0 && x < W) g[y] = g[y].substring(0, x) + c + g[y].substring(x + 1); };
  const wall2 = (x: number, y: number) => { put(g0, x, y, '#'); put(g1, x, y, '#'); };            // 2-block wall (can't see over)
  const corridor = (x: number, y: number) => { put(g0, x, y, '.'); put(g1, x, y, ' '); put(g2, x, y, '#'); };  // open floor + air + roof 2 up = tunnel you duck through
  const cry = (x: number, y: number) => put(g0, x, y, 'C');
  const setH = (x: number, y: number, n: number) => put(hh, x, y, String(Math.max(0, Math.min(3, n))));

  // a hill to climb — stepped raised terrain in the north-west
  const cx = 9, cy = 7, rad = 5;
  for (let y = cy - rad; y <= cy + rad; y++) for (let x = cx - rad; x <= cx + rad; x++) {
    const d = Math.hypot(x - cx, y - cy);
    if (d < rad) setH(x, y, Math.round(3 - d * 0.7));
  }
  cry(cx, cy);

  // main covered tunnel — a 1-wide roofed corridor running east across the south, exit at the far end
  const ty = 21;
  for (let x = 6; x <= 33; x++) { wall2(x, ty - 1); wall2(x, ty + 1); corridor(x, ty); }
  put(g0, 6, ty, '.'); put(g1, 6, ty, ' ');   // west mouth, open to the plaza
  cry(14, ty); cry(26, ty);
  put(g0, 33, ty, 'E'); put(g2, 33, ty, ' ');  // exit deep in the tunnel, open above it

  // a branch tunnel north to a small crystal alcove
  for (let y = 13; y <= ty; y++) { wall2(24 - 1, y); wall2(24 + 1, y); corridor(24, y); }
  cry(24, 14);

  // overhang bridges over the open plaza — blocks up top you stroll under
  for (let x = 15; x <= 21; x++) put(g2, x, 16, '#');
  for (let y = 3; y <= 8; y++) put(g2, 31, y, '#');

  // spawn out in the open west plaza + a few crystals to grab on the way
  put(g0, 4, 24, 'S');
  cry(6, 24); cry(20, 4); cry(35, 11); cry(4, 12);

  return {
    id: 'starter', name: 'The Wide', spawnDir: 0, sky: 'day', music: 'day' as Mood,
    rows: g0, floors: [{ rows: g0, heights: hh }, { rows: g1 }, { rows: g2 }],
  };
})();

// ── THE GREEN REACH — a 60×60 open grassland (Haven/day): a lake with a dock, forests, flower meadows,
// rock fields, lamp-lined roads, and a big walled COURTYARD KEEP built from tall STACKED-BLOCK walls
// (3 cubes high — real walls you can't hop) with a raised dais and the exit inside. Single open floor,
// so the whole thing is walkable under the open sky. Deterministic seeded layout (same each visit).
const GREEN_REACH: Level3D = (() => {
  const W = 60, H = 60;
  const g = Array.from({ length: H }, () => ' '.repeat(W));
  const Bl = Array.from({ length: H }, () => ' '.repeat(W));
  const BH = Array.from({ length: H }, () => '1'.repeat(W));
  const hh = Array.from({ length: H }, () => '0'.repeat(W));
  const setC = (grid: string[], x: number, y: number, c: string) => { if (x >= 0 && x < W && y >= 0 && y < H) grid[y] = grid[y].substring(0, x) + c + grid[y].substring(x + 1); };
  const put = (x: number, y: number, c: string) => setC(g, x, y, c);
  const blk = (x: number, y: number, c: string, n = 1) => { setC(Bl, x, y, c); setC(BH, x, y, String(n)); };
  const noblk = (x: number, y: number) => setC(Bl, x, y, ' ');
  const setH = (x: number, y: number, n: number) => setC(hh, x, y, String(Math.max(0, Math.min(9, Math.round(n)))));
  const R = (i: number) => { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
  const scatter = (c: string, x0: number, y0: number, x1: number, y1: number, n: number, seed: number) => {
    for (let i = 0; i < n; i++) { const x = x0 + Math.floor(R(seed + i * 2.3) * (x1 - x0 + 1)), y = y0 + Math.floor(R(seed + i * 2.3 + 0.7) * (y1 - y0 + 1)); if (g[y]?.[x] === 'g') put(x, y, c); }
  };
  // grassland with a stone border (the flat renderer draws '#' walls a fixed ~2 blocks tall)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) put(x, y, (x === 0 || y === 0 || x === W - 1 || y === H - 1) ? '#' : 'g');
  // gentle climbable hills
  const hill = (cx: number, cy: number, rad: number, top: number) => { for (let y = cy - rad; y <= cy + rad; y++) for (let x = cx - rad; x <= cx + rad; x++) { const d = Math.hypot(x - cx, y - cy); if (d < rad && g[y]?.[x] === 'g') setH(x, y, top - d * (top / rad)); } };
  hill(11, 49, 7, 4); hill(51, 12, 6, 3);
  // a lake with a dirt shore + a little wooden dock in the SE
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { if (g[y][x] !== 'g') continue; const d = Math.hypot(x - 45, y - 46); if (d < 8) put(x, y, 'w'); else if (d < 9.5) put(x, y, 'd'); }
  for (let x = 37; x <= 41; x++) put(x, 46, 'k'); put(36, 46, 'l');
  // forest (NE), flower meadow (SW), rock field (NW), crystals everywhere
  scatter('T', 40, 4, 57, 22, 46, 1); scatter('b', 40, 4, 57, 22, 22, 2); scatter('f', 40, 4, 57, 22, 16, 3);
  scatter('f', 4, 40, 24, 56, 80, 4); scatter('b', 4, 40, 24, 56, 20, 5); scatter('T', 5, 44, 20, 56, 12, 6);
  scatter('r', 4, 4, 18, 18, 15, 7); scatter('T', 4, 4, 16, 16, 8, 8); scatter('C', 3, 3, 56, 56, 26, 9);
  // lamp-lined road from the west spawn to the keep gate
  for (let x = 5; x <= 27; x++) { put(x, 30, 'p'); if (x % 5 === 0) { put(x, 28, 'l'); put(x, 32, 'l'); } }
  // a wood-post fence line + a few stone planters (decorative blocks)
  for (let y = 36; y <= 48; y++) blk(22, y, 'i', 1); for (let x = 8; x <= 12; x++) for (let y = 22; y <= 25; y++) if ((x + y) % 2 === 0) blk(x, y, 'r', 1);
  // ── the Keep — a walled courtyard of 3-high stacked STONE blocks with a gate, dais & exit ──
  const kx0 = 28, ky0 = 20, kx1 = 46, ky1 = 40;
  for (let x = kx0; x <= kx1; x++) { blk(x, ky0, 'r', 3); blk(x, ky1, 'r', 3); }
  for (let y = ky0; y <= ky1; y++) { blk(kx0, y, 'r', 3); blk(kx1, y, 'r', 3); }
  noblk(36, ky1); noblk(37, ky1); put(36, ky1, '.'); put(37, ky1, '.');   // south gate
  for (let x = kx0 + 1; x < kx1; x++) for (let y = ky0 + 1; y < ky1; y++) put(x, y, 'k');   // wood courtyard floor
  blk(kx0 + 2, ky0 + 2, 'i', 2); blk(kx1 - 2, ky0 + 2, 'i', 2); blk(kx0 + 2, ky1 - 2, 'i', 2); blk(kx1 - 2, ky1 - 2, 'i', 2);   // corner pillars
  put(31, 24, 'l'); put(43, 24, 'l'); put(31, 36, 'l'); put(43, 36, 'l');
  // a stepped stone dais in the middle with the exit portal on top
  for (let y = 28; y <= 32; y++) for (let x = 35; x <= 39; x++) { const d = Math.max(Math.abs(x - 37), Math.abs(y - 30)); setH(x, y, 2 - d); }
  put(37, 30, 'E'); put(34, 27, 'C'); put(40, 33, 'C'); put(35, 34, 'C'); put(39, 26, 'C');
  put(6, 30, 'S');
  return { id: 'green-reach', name: 'The Green Reach', atmo: 'haven', sky: 'day', music: 'haven' as Mood, spawnDir: 0, exitDir: 270, rows: g, heights: hh, blocks: Bl, blockH: BH };
})();

// ── THE SUNKEN HOLLOW — a 48×48 candle-lit RUIN (run-and-hide): a central stone dais ringed by a lava
// moat with narrow bridges, water pools, ruined chambers, rubble blocks, a broken tower you climb, and
// STALKERS hunting while you open the chests that unlock the exit gate. No weapon — survive and escape.
const SUNKEN_HOLLOW: Level3D = (() => {
  const W = 48, H = 48;
  const g = Array.from({ length: H }, () => ' '.repeat(W));
  const Bl = Array.from({ length: H }, () => ' '.repeat(W));
  const BH = Array.from({ length: H }, () => '1'.repeat(W));
  const hh = Array.from({ length: H }, () => '0'.repeat(W));
  const setC = (grid: string[], x: number, y: number, c: string) => { if (x >= 0 && x < W && y >= 0 && y < H) grid[y] = grid[y].substring(0, x) + c + grid[y].substring(x + 1); };
  const put = (x: number, y: number, c: string) => setC(g, x, y, c);
  const blk = (x: number, y: number, c: string, n = 1) => { setC(Bl, x, y, c); setC(BH, x, y, String(n)); };
  const noblk = (x: number, y: number) => setC(Bl, x, y, ' ');
  const setH = (x: number, y: number, n: number) => setC(hh, x, y, String(Math.max(0, Math.min(9, Math.round(n)))));
  const R = (i: number) => { const s = Math.sin(i * 91.7 + 47.3) * 24634.6345; return s - Math.floor(s); };
  // ruined block-wall ring — broken heights (some tall, some crumbled) for a ruin look; leaves a doorway
  const ruin = (x0: number, y0: number, x1: number, y1: number, mat: string, door: [number, number]) => {
    let i = 0;
    const wall = (x: number, y: number) => { const n = R(x * 3.1 + y * 7.7) > 0.35 ? 3 : (R(x + y) > 0.5 ? 2 : 1); blk(x, y, mat, n); i++; };
    for (let x = x0; x <= x1; x++) { wall(x, y0); wall(x, y1); } for (let y = y0; y <= y1; y++) { wall(x0, y); wall(x1, y); }
    noblk(door[0], door[1]); put(door[0], door[1], '.'); void i;
  };
  // dungeon floor + stone border (flat renderer draws '#' a fixed ~2 blocks tall)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) put(x, y, (x === 0 || y === 0 || x === W - 1 || y === H - 1) ? '#' : '.');
  // central raised dais ringed by a lava moat, with stone bridges across
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const d = Math.hypot(x - 24, y - 24); if (d < 4) setH(x, y, 2); else if (d >= 6 && d < 8.5) put(x, y, 'L'); }
  for (let t = 3; t <= 9; t++) { put(24, 24 - t, '.'); put(24, 24 + t, '.'); put(24 - t, 24, '.'); put(24 + t, 24, '.'); }
  put(24, 24, 'C'); put(23, 23, 'H'); blk(25, 25, 'x', 1); blk(22, 25, 'x', 1);
  // water pools + scattered rubble blocks
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { if (g[y][x] !== '.') continue; if (Math.hypot(x - 8, y - 40) < 4 || Math.hypot(x - 40, y - 8) < 3.5) put(x, y, 'w'); }
  for (let i = 0; i < 40; i++) { const x = 3 + Math.floor(R(i) * 42), y = 3 + Math.floor(R(i + 99) * 42); if (g[y]?.[x] === '.') blk(x, y, R(i * 3) > 0.5 ? 'c' : 'x', 1); }
  // ruined chambers (broken tall cobble walls) with a chest each
  ruin(4, 4, 14, 14, 'c', [9, 14]); put(9, 9, 'H'); put(6, 6, 'C');
  ruin(33, 33, 44, 44, 'c', [39, 33]); put(39, 39, 'H'); put(42, 42, 'C');
  // the locked EXIT gate chamber (north) — opens once every chest is looted
  ruin(18, 2, 30, 10, 'r', [24, 10]); put(24, 6, 'E');
  // a stepped stone ZIGGURAT you climb (raised terrain — no stairs) with a chest on the summit
  for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const d = Math.max(Math.abs(dx), Math.abs(dy)); if (d <= 4) setH(39 + dx, 8 + dy, 4 - d); }
  put(39, 8, 'H'); put(38, 8, 'C'); put(40, 9, 'C');
  // stalkers prowling the ruin + crystals to grab
  put(16, 24, 'M'); put(32, 22, 'M'); put(24, 34, 'M'); put(12, 34, 'M'); put(34, 30, 'M');
  for (let i = 0; i < 14; i++) { const x = 3 + Math.floor(R(i + 7) * 42), y = 3 + Math.floor(R(i + 51) * 42); if (g[y]?.[x] === '.') put(x, y, 'C'); }
  put(4, 24, 'S');
  return { id: 'sunken-hollow', name: 'The Sunken Hollow', atmo: 'candle', music: 'spooky' as Mood, combat: false, spawnDir: 0, rows: g, heights: hh, blocks: Bl, blockH: BH };
})();

export const BUILTIN_LEVELS: Level3D[] = [STARTER, GREEN_REACH, SUNKEN_HOLLOW];

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

// A wide-open AIR layer (used for floors added ABOVE in the stacked builder): nothing but sky, so it
// doesn't form a solid ceiling — the designer carves platforms/walls into it.
export const blankAirRows = (w: number, h: number): string[] =>
  Array.from({ length: h }, () => AIR.repeat(w));

// ── Shared realms (Supabase `realms` table) ──────────────────────────────────────────────────────
// localStorage is the local-first cache; the DB is what makes a realm visible to OTHER players. The
// designer pushes here on save, and entering a portal fetches by id when it isn't cached locally.
// Everything degrades to localStorage-only if the env/table is missing (supabase === null).

// Push a realm to the shared store so a portal pointing at it works for everyone (not just the author).
export async function saveRealmRemote(level: Level3D): Promise<boolean> {
  saveLevel(level);                                   // always keep the fast local copy
  if (!supabase) return false;
  let author: string | undefined;
  try { author = await ownerId(); } catch { /* anon */ }
  const { error } = await supabase.from('realms').upsert(
    { id: level.id, name: level.name, data: level, author, updated_at: new Date().toISOString() },
    { onConflict: 'id' },
  );
  return !error;
}

// Fetch a realm by id from the shared store (used when a player walks a portal to a realm they didn't
// build, so it isn't in their localStorage). Caches it locally on success for instant revisits.
export async function getRealmRemote(id: string): Promise<Level3D | null> {
  if (!supabase) return null;
  const { data } = await supabase.from('realms').select('data').eq('id', id).limit(1).maybeSingle();
  const lvl = (data?.data as Level3D | undefined) ?? null;
  if (lvl) { try { saveLevel(lvl); } catch { /* quota */ } }
  return lvl;
}

// All shared realms (most recent first) — for the designer's library, merged with builtins + local.
export async function fetchRealmsRemote(): Promise<Level3D[]> {
  if (!supabase) return [];
  const { data } = await supabase.from('realms').select('data').order('updated_at', { ascending: false }).limit(120);
  return (data ?? []).map((r: { data: Level3D }) => r.data).filter(Boolean);
}

// Remove a realm from the shared store (and the local cache).
export async function deleteRealmRemote(id: string): Promise<boolean> {
  deleteLevel(id);
  if (!supabase) return false;
  const { error } = await supabase.from('realms').delete().eq('id', id);
  return !error;
}

// A fresh realm is a 2-BLOCK-TALL room by default (two stacked floors of border wall), so you spawn into
// the Minecraft-tall view straight away and the walls actually enclose you. Interior is open to the sky.
export function blankLevel(w = 12, h = 12): Level3D {
  const g0: string[] = [], g1: string[] = [];
  for (let y = 0; y < h; y++) {
    let r0 = '', r1 = '';
    for (let x = 0; x < w; x++) {
      const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1;
      r0 += edge ? '#' : (x === 1 && y === 1 ? 'S' : '.');
      r1 += edge ? '#' : ' ';   // second course of wall → 2-block-tall room; air (open sky) inside
    }
    g0.push(r0); g1.push(r1);
  }
  return { id: newLevelId(), name: 'Untitled Realm', rows: g0, floors: [{ rows: g0 }, { rows: g1 }], spawnDir: 0, sky: 'day' };
}
