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
export type Floor3D = { rows: string[]; heights?: string[]; npcs?: Npc3D[] };

export type Level3D = {
  id: string;
  name: string;
  rows: string[];          // grid; row index = world Y (north→south), col index = world X (west→east)
  floors?: Floor3D[];      // OPTIONAL storey stack, ordered bottom→top. Present = multi-floor realm;
                           // absent = single floor built from rows/heights/npcs (back-compat).
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
// Each atmosphere gets its OWN theme for immersion — from a warm daytime tune, through airy mist and
// moody dungeons, to eerie spooky worlds, cold mystery, and full hell menace. Derived from atmo/sky
// unless the level sets `music` explicitly. The RaycastCanvas synth plays a distinct drone+melody per theme.
export type Mood = 'day' | 'mist' | 'dungeon' | 'spooky' | 'mystery' | 'hell';
const MOODS: Mood[] = ['day', 'mist', 'dungeon', 'spooky', 'mystery', 'hell'];
export function moodOf(level: Level3D): Mood {
  const m = level.music as string | undefined;
  if (m && MOODS.includes(m as Mood)) return m as Mood;
  if (m === 'tense') return 'hell';        // back-compat with old saved realms
  if (m === 'chill') return 'day';
  const a = level.atmo, s = level.sky;
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
    : [{ rows: level.rows, heights: level.heights, npcs: level.npcs }];

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

export const BUILTIN_LEVELS: Level3D[] = [STARTER];

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
