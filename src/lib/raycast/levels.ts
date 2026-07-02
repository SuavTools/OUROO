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
export type Floor3D = {
  rows: string[]; heights?: string[]; blocks?: string[]; blockH?: string[]; npcs?: Npc3D[];
  // DEPTH BAND marker (optional): setting `atmo` on a floor starts a new atmosphere band from this storey
  // UP until the next marker — so a stack can go sunlit surface → gloom cave → hellfire deep, each with its
  // own light/palette/sky/music. The player's CURRENT band lights the whole view (v1: it reveals on entry).
  atmo?: string; sky?: string; music?: Mood;
};

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
  storeyBlocks?: number;   // OPTIONAL underground headroom in BLOCKS per storey (2 = tight … 3 = cavern). Default 2.
  viewDist?: 'cozy' | 'normal' | 'far';   // OPTIONAL fog/draw distance (see VIEW_PROFILES). Default 'normal'.
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

// How many height-levels tall one BLOCK/cube is (the fundamental unit: a wall cube, a placed block, one
// step of raised terrain × this). Kept at 3 so a cube ≈ 0.96 world units in the raycaster.
export const STOREY_LEVELS = 3;

// ── Underground / multi-floor headroom ──────────────────────────────────────────────────────────
// A stacked realm's floors used to sit exactly ONE block apart — but the player is ~1.8 blocks tall, so
// the floor above cut across your eyes ("thin slice at eye level") and no room was tall enough to stand
// in. A storey is now HEADROOM blocks of clear air + a 1-block-thick floor slab, so basements/caves are
// real walk-in rooms. `storeyBlocks` picks the headroom per realm: 2 = tight crypt, 3 = grand cavern.
export const HEADROOM_DEFAULT = 2;
export const headroomBlocksOf = (l: Pick<Level3D, 'storeyBlocks'>): number => {
  const n = l.storeyBlocks; return n && n >= 2 && n <= 4 ? Math.round(n) : HEADROOM_DEFAULT;
};

// ── View distance (fog + draw distance) ───────────────────────────────────────────────────────────
// The raycaster fades surfaces by `1 − 1/(1 + d²·fogK)`, so the world is half-swallowed by fog at
// √(1/fogK) tiles. `fogK` sets how far you see; `blockCull`/`grassCull` (squared tile radii) keep props
// visible to that horizon; `march` caps the ray length. Lantern realms stay dark regardless — their gloom
// is the light RADIUS, not fog — so a wider view here only opens up the bright/open worlds.
export type ViewDist = 'cozy' | 'normal' | 'far';
export const VIEW_PROFILES: Record<ViewDist, { fogK: number; blockCull: number; grassCull: number; march: number }> = {
  cozy:   { fogK: 0.011, blockCull: 34 * 34, grassCull: 12 * 12, march: 40 },   // ~9.5 tiles half-fog (the old tight look)
  normal: { fogK: 0.004, blockCull: 46 * 46, grassCull: 15 * 15, march: 54 },   // ~16 tiles — the new default
  far:    { fogK: 0.002, blockCull: 62 * 62, grassCull: 18 * 18, march: 70 },   // ~22 tiles — big open vistas
};
export const viewProfileOf = (l: Pick<Level3D, 'viewDist'>) =>
  VIEW_PROFILES[(l.viewDist && VIEW_PROFILES[l.viewDist]) ? l.viewDist! : 'normal'];

// The atmosphere BAND for storey `k`: the nearest floor at-or-below k that sets `atmo` wins (its sky/music
// come with it); if none do, the realm's own atmo/sky/music apply. `hasBands` = any floor is a marker, so
// the renderer only pays the per-frame band cost when a realm actually uses depth bands.
export const hasBands = (floors: Floor3D[]): boolean => floors.some(f => f.atmo !== undefined);
export const resolveBand = (level: Pick<Level3D, 'atmo' | 'sky' | 'music'>, floors: Floor3D[], k: number): { atmo?: string; sky?: string; music?: Mood } => {
  let atmo = level.atmo, sky = level.sky, music = level.music;
  const top = Math.min(k, floors.length - 1);
  for (let j = 0; j <= top; j++) { const f = floors[j]; if (f.atmo !== undefined) { atmo = f.atmo; sky = f.sky; music = f.music; } }
  return { atmo, sky, music };
};

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

// ── THE GREEN REACH — a MAX 128×128 grassland world (Haven/day). Lake + dock, forests, flower meadows,
// lamp-lined roads, a VILLAGE of houses with real block ROOFS you walk under, a walled keep, a roofed
// MAZE DUNGEON, a 9-tier PYRAMID you climb by hopping block-to-block, and a 2-level FORTRESS you ascend
// the same way. Verticality = jumping up single wall-blocks (Minecraft-style), not raised terrain.
const GREEN_REACH: Level3D = (() => {
  const W = 128, H = 128, NF = 3;
  const Fl = Array.from({ length: NF }, () => Array.from({ length: H }, () => ' '.repeat(W)));
  const Bl = Array.from({ length: NF }, () => Array.from({ length: H }, () => ' '.repeat(W)));
  const BHl = Array.from({ length: NF }, () => Array.from({ length: H }, () => '1'.repeat(W)));
  const hh = Array.from({ length: H }, () => '0'.repeat(W));
  const setC = (grid: string[], x: number, y: number, c: string) => { if (x >= 0 && x < W && y >= 0 && y < H) grid[y] = grid[y].substring(0, x) + c + grid[y].substring(x + 1); };
  const put = (x: number, y: number, c: string) => setC(Fl[0], x, y, c);
  const blk = (x: number, y: number, c: string, n = 1) => { setC(Bl[0], x, y, c); setC(BHl[0], x, y, String(n)); };
  const blkK = (k: number, x: number, y: number, c: string, n = 1) => { setC(Bl[k], x, y, c); setC(BHl[k], x, y, String(n)); };
  const noblk = (x: number, y: number) => setC(Bl[0], x, y, ' ');
  const roof = (x: number, y: number, mat = 'x') => setC(Bl[2], x, y, mat);   // a block roof on the top floor (≈2 storeys up)
  const setH = (x: number, y: number, n: number) => setC(hh, x, y, String(Math.max(0, Math.min(9, Math.round(n)))));
  let rc = 1; const R = (i: number) => { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }; const rnd = () => R(rc++);
  const scatter = (c: string, x0: number, y0: number, x1: number, y1: number, n: number, seed: number) => {
    for (let i = 0; i < n; i++) { const x = x0 + Math.floor(R(seed + i * 2.3) * (x1 - x0 + 1)), y = y0 + Math.floor(R(seed + i * 2.3 + 0.7) * (y1 - y0 + 1)); if (Fl[0][y]?.[x] === 'g') put(x, y, c); }
  };
  // grassland edged by a CHASM void (not a wall — so structures never raise the edges; step in = you fall)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const dE = Math.min(x, y, W - 1 - x, H - 1 - y); put(x, y, dE <= 1 ? '~' : 'g'); }
  // gentle hills
  const hill = (cx: number, cy: number, rad: number, top: number) => { for (let y = cy - rad; y <= cy + rad; y++) for (let x = cx - rad; x <= cx + rad; x++) { const d = Math.hypot(x - cx, y - cy); if (d < rad && Fl[0][y]?.[x] === 'g') setH(x, y, top - d * (top / rad)); } };
  hill(20, 104, 11, 4); hill(110, 24, 12, 5);
  // a lake with a dirt shore + a wooden dock
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { if (Fl[0][y][x] !== 'g') continue; const d = Math.hypot(x - 30, y - 40); if (d < 15) put(x, y, 'w'); else if (d < 16.5) put(x, y, 'd'); }
  for (let x = 44; x <= 50; x++) put(x, 40, 'k'); put(51, 40, 'l');
  // forests, meadows, rock fields, crystals everywhere
  scatter('T', 70, 4, 122, 40, 150, 1); scatter('b', 70, 4, 122, 40, 60, 2); scatter('f', 70, 4, 122, 40, 40, 3);
  scatter('f', 6, 72, 56, 122, 260, 4); scatter('b', 6, 72, 56, 122, 60, 5); scatter('T', 6, 84, 44, 122, 44, 6);
  scatter('r', 6, 6, 34, 34, 40, 7); scatter('T', 6, 54, 30, 84, 34, 8); scatter('C', 4, 4, 123, 123, 100, 9);
  // lamp-lined road west→keep
  for (let x = 6; x <= 58; x++) { put(x, 64, 'p'); if (x % 6 === 0) { put(x, 62, 'l'); put(x, 66, 'l'); } }
  // ── VILLAGE (NW) — houses with tall block walls and a real block ROOF you walk under ──
  const house = (x0: number, y0: number, x1: number, y1: number, wm: string, rm: string, dx: number, dy: number) => {
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) put(x, y, 'k');
    for (let x = x0; x <= x1; x++) { blk(x, y0, wm, 2); blk(x, y1, wm, 2); } for (let y = y0; y <= y1; y++) { blk(x0, y, wm, 2); blk(x1, y, wm, 2); }
    noblk(dx, dy); put(dx, dy, 'k');
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) roof(x, y, rm);
    put((x0 + x1) >> 1, (y0 + y1) >> 1, 'C'); put(x0 + 1, y0 + 1, 'l');
  };
  house(14, 74, 22, 81, 'w', 'w', 18, 81); house(26, 76, 35, 84, 'r', 'x', 30, 76); house(15, 86, 23, 93, 'w', 'w', 19, 86);
  house(28, 88, 37, 96, 'r', 'x', 32, 88); house(8, 84, 14, 90, 'w', 'w', 11, 90); house(40, 78, 48, 86, 'r', 'x', 44, 86);
  for (let x = 10; x <= 44; x++) put(x, 84, 'p');
  // ── the KEEP (centre) — walled courtyard of 3-high stone blocks with a dais & the exit ──
  const kx0 = 54, ky0 = 54, kx1 = 78, ky1 = 78;
  for (let x = kx0; x <= kx1; x++) { blk(x, ky0, 'r', 3); blk(x, ky1, 'r', 3); } for (let y = ky0; y <= ky1; y++) { blk(kx0, y, 'r', 3); blk(kx1, y, 'r', 3); }
  noblk(65, ky0); noblk(66, ky0); put(65, ky0, '.'); put(66, ky0, '.');
  for (let x = kx0 + 1; x < kx1; x++) for (let y = ky0 + 1; y < ky1; y++) put(x, y, 'k');
  blk(kx0 + 2, ky0 + 2, 'i', 3); blk(kx1 - 2, ky0 + 2, 'i', 3); blk(kx0 + 2, ky1 - 2, 'i', 3); blk(kx1 - 2, ky1 - 2, 'i', 3);
  put(60, 60, 'l'); put(72, 60, 'l'); put(60, 72, 'l'); put(72, 72, 'l');
  for (let y = 64; y <= 68; y++) for (let x = 64; x <= 68; x++) { const d = Math.max(Math.abs(x - 66), Math.abs(y - 66)); setH(x, y, 2 - d); }
  put(66, 66, 'E'); put(60, 62, 'C'); put(72, 70, 'C'); put(62, 71, 'C'); put(70, 61, 'C');
  for (let x = 44; x <= 54; x++) put(x, 64, 'p'); for (let x = 65; x <= 66; x++) for (let y = 54; y >= 50; y--) put(x, y, 'p');
  // ── 9-TIER PYRAMID (E) — climb it by JUMPING block-to-block, each ring one block higher than the last ──
  const px = 104, py = 56; for (let dy = -8; dy <= 8; dy++) for (let dx = -8; dx <= 8; dx++) { const d = Math.max(Math.abs(dx), Math.abs(dy)); if (d <= 8) blk(px + dx, py + dy, 'r', 9 - d); }
  for (let i = 0; i < 10; i++) put(px - 10 + i, py + 11, 'C');   // crystals at the base
  // ── 2-LEVEL FORTRESS (NE) — hop the block steps up to the mezzanine gallery (floor 2), open to the sky ──
  const fx0 = 94, fy0 = 78, fx1 = 116, fy1 = 100;
  for (let x = fx0; x <= fx1; x++) { blk(x, fy0, 'c', 3); blk(x, fy1, 'c', 3); } for (let y = fy0; y <= fy1; y++) { blk(fx0, y, 'c', 3); blk(fx1, y, 'c', 3); }
  noblk(105, fy1); noblk(106, fy1); put(105, fy1, '.'); put(106, fy1, '.');
  for (let x = fx0 + 1; x < fx1; x++) for (let y = fy0 + 1; y < fy1; y++) put(x, y, '.');
  put(98, 96, 'C'); put(112, 96, 'C'); put(105, 90, 'M');
  // steps up: ground → 1-high → floor2 mezzanine gallery (headroom under it)
  blk(97, 82, 'c', 1); blk(98, 82, 'c', 1); blk(99, 82, 'c', 1);
  for (let x = fx0 + 2; x <= fx0 + 12; x++) for (let y = fy0 + 2; y <= fy0 + 8; y++) setC(Fl[2], x, y, 'k');   // mezzanine (2 storeys up)
  setC(Fl[2], fx0 + 6, fy0 + 4, 'C'); setC(Fl[2], fx0 + 10, fy0 + 6, 'C');
  blk(fx0 + 1, fy0 + 5, 'c', 1); blkK(1, fx0 + 1, fy0 + 5, 'c', 1);   // a 2-step stair (floor0 + floor1 block) up to the mezzanine
  // ── MAZE DUNGEON (S) — a roofed labyrinth you thread; cobble walls, roof 2 storeys up ──
  const MX = 76, MY = 100, C = 12, Rn = 12;
  const cellT = (cx: number, cy: number): [number, number] => [MX + cx * 2, MY + cy * 2];
  const carved = Array.from({ length: Rn }, () => new Array(C).fill(false));
  const open = (tx: number, ty: number) => put(tx, ty, '.');
  const stack: [number, number][] = [[0, 0]]; carved[0][0] = true; open(...cellT(0, 0));
  while (stack.length) {
    const [cx, cy] = stack[stack.length - 1];
    const opts = ([[1, 0], [-1, 0], [0, 1], [0, -1]] as [number, number][]).filter(([ddx, ddy]) => { const nx = cx + ddx, ny = cy + ddy; return nx >= 0 && nx < C && ny >= 0 && ny < Rn && !carved[ny][nx]; });
    if (opts.length) { const [ddx, ddy] = opts[Math.floor(rnd() * opts.length)]; const nx = cx + ddx, ny = cy + ddy; carved[ny][nx] = true; const [tx, ty] = cellT(cx, cy), [ntx, nty] = cellT(nx, ny); open(ntx, nty); open((tx + ntx) >> 1, (ty + nty) >> 1); stack.push([nx, ny]); }
    else stack.pop();
  }
  for (let ty = MY - 1; ty <= MY + Rn * 2; ty++) for (let tx = MX - 1; tx <= MX + C * 2; tx++) {
    if (tx < 1 || ty < 1 || tx >= W - 1 || ty >= H - 1) continue;
    if (Fl[0][ty][tx] === '.') { roof(tx, ty, 'x'); } else { put(tx, ty, '.'); blk(tx, ty, 'c', 2); roof(tx, ty, 'x'); }
  }
  open(MX, MY - 1); open(MX, MY - 2); noblk(MX, MY - 1); noblk(MX, MY - 2);
  put(MX + (C - 1) * 2, MY + (Rn - 1) * 2, 'C');
  for (let i = 0; i < 16; i++) { const cx = Math.floor(rnd() * C), cy = Math.floor(rnd() * Rn); const [tx, ty] = cellT(cx, cy); if (Fl[0][ty]?.[tx] === '.') put(tx, ty, 'C'); }
  put(MX + 6, MY + 6, 'M'); put(MX + 14, MY + 16, 'M');
  put(8, 64, 'S');
  return { id: 'green-reach', name: 'The Green Reach', atmo: 'haven', sky: 'day', music: 'haven' as Mood, spawnDir: 0, exitDir: 90, rows: Fl[0], floors: Fl.map((rows, k) => ({ rows, blocks: Bl[k], blockH: BHl[k], heights: k === 0 ? hh : undefined })) };
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

// ── THE CAVE RUINS — a candle-lit UNDERGROUND delve that shows off real below-ground play. Two storeys:
// a ruined upper courtyard whose floor has COLLAPSED, and a torch-lit cavern beneath it. You descend the
// only way the ruin allows — DROP through the hole — and land in a proper walk-in cave (headroom, solid
// stone ceiling overhead, no thin slices) to loot crystals, open the chest that unlocks the gate, and
// escape through the exit deep at the bottom of the map. `storeyBlocks: 3` makes the cavern stand tall.
const CAVE_RUINS: Level3D = (() => {
  const W = 28, H = 22;
  const surf = Array.from({ length: H }, () => ' '.repeat(W));    // layer 1 (top) — the ruined surface
  const cave = Array.from({ length: H }, () => ' '.repeat(W));    // layer 0 (bottom) — the cavern
  const surfBl = Array.from({ length: H }, () => ' '.repeat(W));
  const surfBH = Array.from({ length: H }, () => '1'.repeat(W));
  const set = (grid: string[], x: number, y: number, c: string) => { if (x >= 0 && x < W && y >= 0 && y < H) grid[y] = grid[y].substring(0, x) + c + grid[y].substring(x + 1); };
  const sBlk = (x: number, y: number, c: string, n = 1) => { set(surfBl, x, y, c); set(surfBH, x, y, String(n)); };
  const R = (i: number) => { const s = Math.sin(i * 73.13 + 19.7) * 31871.19; return s - Math.floor(s); };
  const border = (g: string[]) => { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (x === 0 || y === 0 || x === W - 1 || y === H - 1) set(g, x, y, '#'); };

  // ── CAVE (bottom): enclosed stone/cobble cavern, floor '.', torch pools, treasure + gate at the far end
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) set(cave, x, y, '.');
  border(cave);
  // crumbled cobble outcrops that break the box into chambers/passages (leave the landing zone clear)
  const rock = (x: number, y: number) => { if (x > 0 && x < W - 1 && y > 0 && y < H - 1) set(cave, x, y, '2'); };
  for (let y = 3; y <= 8; y++) rock(9, y);                 // west divider wall with a gap
  set(cave, 9, 6, '.');                                    //   → doorway through it
  for (let x = 12; x <= 20; x++) rock(x, 5);               // north divider
  set(cave, 16, 5, '.');                                   //   → doorway
  for (let y = 12; y <= 18; y++) rock(18, y);              // east divider
  set(cave, 18, 15, '.');                                  //   → doorway
  for (let x = 4; x <= 10; x++) rock(x, 16);               // south rubble wall
  set(cave, 7, 16, '.');
  // a little dirt + a water seep for texture
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { if (cave[y][x] !== '.') continue; if (Math.hypot(x - 6, y - 12) < 2.4) set(cave, x, y, 'w'); else if (R(x * 5 + y * 11) > 0.86) set(cave, x, y, 'd'); }
  // torch posts (lamp props glow — vital in candle-light), crystals, the chest, a lurking stalker
  [[3, 3], [24, 3], [3, 18], [23, 18], [8, 4], [20, 9]].forEach(([x, y]) => set(cave, x, y, 'l'));   // (all clear of the landing zone)
  [[5, 4], [7, 8], [14, 3], [21, 6], [25, 9], [11, 17], [22, 13], [6, 19], [15, 18], [24, 16]].forEach(([x, y]) => set(cave, x, y, 'C'));
  set(cave, 23, 4, 'H');                                   // chest (locks the gate until opened)
  set(cave, 24, 19, 'E');                                  // the exit gate — deep in the SE of the cavern
  set(cave, 21, 16, 'M');                                  // one stalker prowling the dark (run-and-hide)

  // ── SURFACE (top): a ruined courtyard whose middle has COLLAPSED into the cave. Drop in to descend.
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) set(surf, x, y, 'd');
  border(surf);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (surf[y][x] === 'd' && R(x * 2.1 + y * 3.7) > 0.9) set(surf, x, y, 'g');   // grass tufts through the ruin
  // the collapse — an irregular hole (AIR) you fall through onto the cavern floor below
  for (let y = 7; y <= 14; y++) for (let x = 10; x <= 18; x++) { if (Math.hypot((x - 14) * 0.9, (y - 10.5)) < 4.6) set(surf, x, y, ' '); }
  // broken ruin walls + a couple of standing pillars around the courtyard (block props, varied heights)
  for (let x = 3; x <= 8; x++) if (R(x) > 0.3) sBlk(x, 3, 'c', R(x * 3) > 0.5 ? 2 : 1);
  for (let y = 15; y <= 19; y++) if (R(y + 5) > 0.3) sBlk(23, y, 'c', R(y) > 0.5 ? 2 : 1);
  sBlk(5, 17, 'r', 2); sBlk(22, 5, 'r', 2); sBlk(3, 10, 'c', 1); sBlk(24, 11, 'c', 1);
  [[4, 6], [7, 19], [24, 8], [20, 18]].forEach(([x, y]) => set(surf, x, y, 'l'));   // torches lighting the ruin
  [[6, 5], [23, 3], [4, 19], [25, 17]].forEach(([x, y]) => set(surf, x, y, 'C'));
  set(surf, 3, 11, 'S');                                    // spawn at the west edge, facing the collapse

  return {
    id: 'cave-ruins', name: 'The Cave Ruins', atmo: 'candle', music: 'spooky' as Mood, combat: false,
    spawnDir: 0, storeyBlocks: 3, rows: cave,
    floors: [
      { rows: cave },                                        // 0 = the cavern (bottom)
      { rows: surf, blocks: surfBl, blockH: surfBH },        // 1 = the ruined surface (spawn + collapse hole)
    ],
  };
})();

// ── THE DESCENT — a five-storey vertical world that shows off DEPTH BANDS: the atmosphere, light and
// music change with depth. Spawn on a sunlit green surface, drop down a staggered shaft through a
// torch-lit cave → pitch-black deep → a HELLFIRE cavern with the exit at the very bottom. Or climb the
// block staircase UP to misty rooftop ruins. Each storey re-lights the whole world as you cross into it.
const THE_DESCENT: Level3D = (() => {
  const W = 22, H = 22, NF = 5;
  const F = Array.from({ length: NF }, () => Array.from({ length: H }, () => ' '.repeat(W)));
  const Bl = Array.from({ length: NF }, () => Array.from({ length: H }, () => ' '.repeat(W)));
  const BH = Array.from({ length: NF }, () => Array.from({ length: H }, () => '1'.repeat(W)));
  const set = (g: string[], x: number, y: number, c: string) => { if (x >= 0 && x < W && y >= 0 && y < H) g[y] = g[y].substring(0, x) + c + g[y].substring(x + 1); };
  const put = (k: number, x: number, y: number, c: string) => set(F[k], x, y, c);
  const blk = (k: number, x: number, y: number, c: string, n = 1) => { set(Bl[k], x, y, c); set(BH[k], x, y, String(n)); };
  const fill = (k: number, ch: string) => { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) put(k, x, y, (x === 0 || y === 0 || x === W - 1 || y === H - 1) ? '#' : ch); };
  const clear3 = (k: number, cx: number, cy: number) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) put(k, cx + dx, cy + dy, '.'); };   // safe landing pad
  const R = (i: number) => { const s = Math.sin(i * 45.31 + 9.13) * 20261.1; return s - Math.floor(s); };
  const scatterC = (k: number, n: number, seed: number) => { for (let i = 0; i < n; i++) { const x = 2 + Math.floor(R(seed + i * 1.7) * (W - 4)), y = 2 + Math.floor(R(seed + i * 1.7 + 0.4) * (H - 4)); const c = F[k][y][x]; if (c === '.' || c === 'g') put(k, x, y, 'C'); } };

  // 0 HELL — a lava cavern; the EXIT sits at the bottom of the world
  fill(0, '.');
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (F[0][y][x] === '.' && (Math.hypot(x - 6, y - 15) < 3.2 || Math.hypot(x - 15, y - 7) < 3.2)) put(0, x, y, 'L');
  clear3(0, 16, 16);                     // landing under the deep-floor's hole
  clear3(0, 11, 11); put(0, 11, 11, 'E');   // the exit, on a safe pad
  [[3, 3], [18, 3], [3, 18]].forEach(([x, y]) => put(0, x, y, 'l'));
  scatterC(0, 6, 10);

  // 1 DEEP DARK — blackout; a stalker prowls; a hole drops to hell at (16,16)
  fill(1, '.');
  clear3(1, 5, 5);                       // landing under the cave's hole
  set(F[1], 16, 16, ' '); set(F[1], 16, 15, ' '); set(F[1], 15, 16, ' ');   // shaft down to hell
  put(1, 10, 10, 'M');
  [[4, 18], [18, 18]].forEach(([x, y]) => put(1, x, y, 'l'));
  scatterC(1, 7, 20);

  // 2 CAVE — candle torches; a hole drops to the deep at (5,5)
  fill(2, '.');
  clear3(2, 11, 11);                     // landing under the surface shaft
  set(F[2], 5, 5, ' '); set(F[2], 5, 6, ' '); set(F[2], 6, 5, ' ');         // shaft down to the deep
  [[3, 3], [18, 3], [3, 18], [18, 18]].forEach(([x, y]) => put(2, x, y, 'l'));
  scatterC(2, 8, 30);

  // 3 SURFACE — sunlit grass; SPAWN; the descent shaft; and a ROCK-BLOCK rooftop you climb (built from
  // stacked cubes, NOT a floor-layer — solid all the way up, so no floor-slab slice hangs over the field).
  fill(3, 'g');
  set(F[3], 11, 11, ' '); set(F[3], 11, 12, ' '); set(F[3], 12, 11, ' ');   // the shaft you drop into
  put(3, 3, 11, 'S');
  blk(3, 13, 11, 'r', 1); blk(3, 14, 11, 'r', 2);                            // steps: 1 then 2 blocks tall
  for (let y = 10; y <= 12; y++) for (let x = 15; x <= 18; x++) blk(3, x, y, 'r', 3);   // 3-tall roof slab (roof = floor-4 height)
  blk(3, 15, 9, 'r', 4); blk(3, 18, 9, 'r', 5); blk(3, 15, 13, 'r', 4); blk(3, 18, 13, 'r', 4);   // ruined corner stumps
  put(3, 6, 6, 'T'); put(3, 15, 6, 'T'); put(3, 7, 16, 'f'); put(3, 14, 16, 'f');
  scatterC(3, 6, 40);

  // 4 ROOFTOP BAND — floor 4 is ALL AIR (just the misty atmosphere marker). The geometry up here is the
  // rock blocks on the surface below, so nothing slabs the view; standing on the roof still reads as this
  // band's height, so it goes misty. Crystals (drawn at this layer's height) reward the climb.
  put(4, 16, 11, 'C'); put(4, 17, 11, 'C'); put(4, 16, 12, 'C');

  const floors: Floor3D[] = [
    { rows: F[0], blocks: Bl[0], blockH: BH[0], atmo: 'hell' },                  // hellfire
    { rows: F[1], blocks: Bl[1], blockH: BH[1], atmo: 'blackout' },              // pitch-black deep
    { rows: F[2], blocks: Bl[2], blockH: BH[2], atmo: 'candle' },                // torch-lit cave
    { rows: F[3], blocks: Bl[3], blockH: BH[3], atmo: 'haven', sky: 'day' },     // sunlit surface
    { rows: F[4], blocks: Bl[4], blockH: BH[4], atmo: 'fog', sky: 'day' },       // misty rooftop
  ];
  return { id: 'the-descent', name: 'The Descent', combat: false, spawnDir: 0, storeyBlocks: 2, viewDist: 'normal', rows: F[0], floors };
})();

// ── THE WARREN — a big 70×70 FOUR-storey journey: DESCEND from a lit stone hall through torch-lit
// tunnels and a wide dark cave into a pitch-black deep, then CLIMB back UP the far side — steps up and up
// — bursting out of the ground into a SUNLIT daytime top of wide grassy corridors and open plazas where
// the exit waits. Mix of narrow corridors, corridors that turn, and big rooms/caves. All on foot: every
// storey change is a walkable block staircase (auto-step up & down), no drops.
const THE_WARREN: Level3D = (() => {
  const W = 70, H = 70, NF = 4;
  const F = Array.from({ length: NF }, () => Array.from({ length: H }, () => '#'.repeat(W)));   // SOLID rock — carve tunnels into it
  const Bl = Array.from({ length: NF }, () => Array.from({ length: H }, () => ' '.repeat(W)));
  const BH = Array.from({ length: NF }, () => Array.from({ length: H }, () => '1'.repeat(W)));
  const set = (g: string[], x: number, y: number, c: string) => { if (x >= 0 && x < W && y >= 0 && y < H) g[y] = g[y].substring(0, x) + c + g[y].substring(x + 1); };
  const put = (k: number, x: number, y: number, c: string) => set(F[k], x, y, c);
  const blk = (k: number, x: number, y: number, c: string, n: number) => { set(Bl[k], x, y, c); set(BH[k], x, y, String(n)); };
  const carve = (k: number, x0: number, y0: number, x1: number, y1: number, ch = '.') => { for (let y = Math.max(1, y0); y <= Math.min(H - 2, y1); y++) for (let x = Math.max(1, x0); x <= Math.min(W - 2, x1); x++) set(F[k], x, y, ch); };
  const torch = (k: number, x: number, y: number) => set(F[k], x, y, 'l');
  const gems = (k: number, cells: [number, number][]) => cells.forEach(([x, y]) => { if (F[k][y][x] === '.' || F[k][y][x] === 'g') set(F[k], x, y, 'C'); });
  const props = (k: number, ch: string, cells: [number, number][]) => cells.forEach(([x, y]) => { if (F[k][y][x] === 'g') set(F[k], x, y, ch); });
  // A 3-cube-wide WALKABLE staircase between floor kLo (LOW) and kLo+1 (HIGH). up=false: HIGH end is WEST
  // (h3 at xW) descending east to the LOW end; so it climbs when you walk WEST, descends when you walk EAST.
  // Steps auto-step up AND walk down; the rock under them is carved and the ceiling above is opened.
  // Landings: floor kLo+1 at xW-1 (high/west), floor kLo at xW+3 (low/east).
  const stair = (kLo: number, xW: number, y0: number, y1: number, up: boolean) => {
    for (let i = 0; i < 3; i++) { const xx = xW + i, n = up ? i + 1 : 3 - i; for (let y = y0; y <= y1; y++) { set(F[kLo], xx, y, '.'); blk(kLo, xx, y, 'r', n); set(F[kLo + 1], xx, y, ' '); } }
  };

  // ══ DESCENT (top edge, rows 5–7, walking EAST and DOWN) ══
  carve(2, 3, 3, 13, 13); put(2, 7, 7, 'S'); gems(2, [[5, 5], [11, 11]]);   // spawn ROOM (dungeon-lit)
  carve(2, 13, 5, 22, 7);                                   // corridor east to the first steps
  stair(1, 23, 5, 7, false);                                // DOWN 2→1  (f2 @22 · f1 @26)
  carve(1, 26, 5, 38, 7); torch(1, 28, 6); torch(1, 32, 6); // torch-lit tunnel, light fading east
  carve(1, 28, 7, 40, 17); gems(1, [[33, 12], [37, 15], [30, 10]]); put(1, 35, 13, 'M');   // a WIDE cave room off it (+ a stalker)
  stair(0, 39, 5, 7, false);                                // DOWN 1→0  (f1 @38 · f0 @42)
  carve(0, 42, 5, 58, 7);                                   // dark corridor east
  carve(0, 56, 7, 58, 34);                                  // turn south, down the east wall
  carve(0, 43, 22, 63, 37); gems(0, [[48, 28], [58, 26], [52, 34], [61, 31]]); put(0, 50, 30, 'M'); torch(0, 45, 24);   // the DEEP CAVE (pitch black)

  // ══ ASCENT (bottom edge, rows 33–35, walking WEST and UP — back toward the light) ══
  carve(0, 40, 33, 56, 35);                                 // dark hall west out of the cave
  stair(0, 37, 33, 35, false);                              // UP 0→1  (f0 @40 · f1 @36)
  carve(1, 24, 33, 36, 35); carve(1, 24, 35, 34, 44); gems(1, [[28, 40], [32, 38]]); torch(1, 30, 34);   // hall + a room
  stair(1, 21, 33, 35, false);                              // UP 1→2  (f1 @24 · f2 @20)
  carve(2, 8, 33, 20, 35); gems(2, [[12, 34]]);             // stone hall
  stair(2, 5, 33, 35, false);                               // UP 2→3  (f2 @8 · f3 @4) → out into the sun

  // ══ FLOOR 3 (SUNLIT TOP · haven + day) — wide grassy corridors opening into bright plazas ══
  carve(3, 2, 31, 16, 37, 'g');                             // you emerge here, in the grass
  carve(3, 8, 20, 20, 32, 'g');                             // a wide corridor climbing north
  carve(3, 13, 5, 37, 25, 'g');                             // a big open sunny plaza
  props(3, 'T', [[17, 9], [30, 8], [34, 20], [16, 22]]);    // trees
  props(3, 'f', [[20, 12], [25, 18], [31, 14], [22, 22], [28, 11]]);   // flowers
  gems(3, [[19, 15], [27, 20], [33, 10]]);
  put(3, 25, 13, 'E');                                      // the EXIT — out in the sunshine

  const floors: Floor3D[] = [
    { rows: F[0], blocks: Bl[0], blockH: BH[0], atmo: 'blackout' },              // the deep — pitch black
    { rows: F[1], blocks: Bl[1], blockH: BH[1], atmo: 'candle' },                // torch-lit tunnels
    { rows: F[2], blocks: Bl[2], blockH: BH[2], atmo: 'dungeon' },               // lit stone halls
    { rows: F[3], blocks: Bl[3], blockH: BH[3], atmo: 'haven', sky: 'day' },     // SUNLIT top — grassy plazas
  ];
  return { id: 'the-warren', name: 'The Warren', combat: false, spawnDir: 0, storeyBlocks: 2, viewDist: 'normal', rows: F[0], floors };
})();

export const BUILTIN_LEVELS: Level3D[] = [STARTER, GREEN_REACH, SUNKEN_HOLLOW, CAVE_RUINS, THE_DESCENT, THE_WARREN];

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
