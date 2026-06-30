'use client';

// OUROO R3D — a real first-person 3D realm rendered into a 2D canvas with a software raycaster
// (Wolfenstein/Doom-style): DDA wall casting + per-pixel floor/ceiling casting (so lava actually
// glows on the ground ahead of you) + billboard sprites for crystals and the exit gate. It reads a
// grid Level3D (see lib/raycast/levels) and is summoned by a portal whose destination is `r3d:<id>`.
//
// Movement is full free-look: forward/back, turn left/right, strafe, run — driven by the same fixed
// 60Hz accumulator the rest of the game uses, so physics never doubles on high-refresh screens.
// Hazards are real: lava drains HP, pits drop you to your death; both respawn you at the spawn tile.

import React, { useEffect, useRef, useState } from 'react';
import {
  type Level3D, type Mood, type Npc3D, paletteOf, lightingOf, skyOf, moodOf, cellAt, isWall, getLevel, heightAt, hasHeightMap, MONSTER_CHAR, TUNNEL_CHAR,
  STAIR_UP, STAIR_DOWN, floorsOf, findSpawnFloor, AIR, isAir, STOREY_LEVELS, getRealmRemote,
} from '@/lib/raycast/levels';
import { resolveAppearance } from '@/lib/catalog';
import { drawPerson } from '@/lib/person';
import { drawSkinShape, skinById, isCreatureId, parseCreature } from '@/lib/skins';
import { drawIconSpec } from '@/lib/icons';

const STEP = 1000 / 60;            // fixed sim tick
const RES_H = 240;                 // internal vertical resolution (RES_W tracks aspect for square pixels)
const MOVE = 0.045;                // tiles per tick (walk)
const RUN = 0.085;                 // tiles per tick (run)
const TURN = 0.045;                // radians per tick (keyboard/stick turn)
const RADIUS = 0.22;               // player collision radius (tiles)
const LAVA_DPS = 0.55;             // HP drained per tick standing in lava
const MAX_HP = 100;
const STEP_UNIT = 0.32;            // world height of one floor level (wall = 1.0 tall)
const EYE_BASE = 0.5;              // eye height above the floor you stand on
const CEIL_GAP = 1.0;             // flat ceiling sits this far above the highest floor
const JUMP_V = 0.18;              // stacked realms: jump launch velocity (apex clears one storey → hop onto blocks)
const GRAV = 0.012;              // stacked realms: gravity pull per tick

type Sprite = { x: number; y: number; kind: 'crystal' | 'exit' | 'tree' | 'bush' | 'flower' | 'rock' | 'lamp'; key?: string };

export const RaycastCanvas: React.FC<{
  levelId?: string;
  level?: Level3D;                 // pass a live (unsaved) level to test-play from the designer
  stageScale?: number;
  isMobileStage?: boolean;
  onExit?: () => void;            // back to the flat room
  onReward?: (n: number) => void; // crystals grabbed → economy hook (optional)
}> = ({ levelId, level: levelProp, isMobileStage = false, onExit, onReward }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Resolve the realm. A live designer level wins; otherwise load by id — builtin/local-cache first
  // (instant, synchronous), then the SHARED store. That last step is the fix for "works for me, not my
  // mate": a realm an admin built lives in the DB, so a portal to it now loads on any account/device.
  const [level, setLevelState] = useState<Level3D | null>(() => levelProp ?? (levelId ? getLevel(levelId) : null));
  const [loadingRealm, setLoadingRealm] = useState(false);
  useEffect(() => {
    if (levelProp) { setLevelState(levelProp); return; }
    if (!levelId) { setLevelState(null); return; }
    const local = getLevel(levelId);
    if (local) { setLevelState(local); setLoadingRealm(false); return; }   // builtin or already cached
    setLevelState(null); setLoadingRealm(true);
    let cancelled = false;
    getRealmRemote(levelId).then(r => { if (!cancelled) { setLevelState(r); setLoadingRealm(false); } }).catch(() => { if (!cancelled) setLoadingRealm(false); });
    return () => { cancelled = true; };
  }, [levelId, levelProp]);

  // HUD mirror (kept tiny — only what the React overlay needs)
  const [hud, setHud] = useState({ hp: MAX_HP, crystals: 0, total: 0, dead: false, exited: false, breath: 100, submerged: false });
  const onExitRef = useRef(onExit); useEffect(() => { onExitRef.current = onExit; });
  const onRewardRef = useRef(onReward); useEffect(() => { onRewardRef.current = onReward; });
  const attackFnRef = useRef<(() => void) | null>(null);   // mobile FIRE button → the in-effect attack
  const jumpRef = useRef(false);                           // mobile JUMP button → held this tick
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(false); useEffect(() => { mutedRef.current = muted; }, [muted]);
  const ambToggleRef = useRef<((m: boolean) => void) | null>(null);   // ♪ button → start/stop ambience

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !level) return;
    const ctx = canvas.getContext('2d', { alpha: false }) as CanvasRenderingContext2D;
    if (!ctx) return;

    const floors = floorsOf(level);       // storey stack (one entry for a single-grid realm)
    const pal = paletteOf(level);
    const lighting = lightingOf(level);   // lantern darkness (horror) or null for a flatly-lit world
    const skyDef = skyOf(level);          // sky gradient + weather, or null for a solid ceiling
    const sky: [[number, number, number], [number, number, number]] | null = skyDef ? [skyDef.top, skyDef.horizon] : null;
    const skyFx = skyDef?.fx;
    const mood: Mood = moodOf(level);     // ambience: spooky / tense / chill
    const canFight = !!level.combat;      // false = run-and-hide world (no weapon)
    const sp0 = findSpawnFloor(floors);   // the one spawn 'S' lives on exactly one storey
    const spawnFloor = sp0.fi;
    const spawn = { x: sp0.x, y: sp0.y };

    // Crystals are a whole-realm goal; remember grabbed ones by floor+tile so they stay gone across storeys.
    const totalCrystals = floors.reduce((n, f) => n + f.rows.reduce((m, r) => m + (r.match(/C/g)?.length ?? 0), 0), 0);
    const grabbed = new Set<string>();    // "fi:x:y" keys of crystals already collected

    type Enemy = { x: number; y: number; hx: number; hy: number; chasing: boolean; wx: number; wy: number; wt: number; hit: number; hp: number; flash: number; k?: number };

    // ── Active storey (mutable — swapped when you take the stairs) ───────────────────────────────
    let fi = spawnFloor;
    let rows = floors[fi].rows;
    let fHeights: string[] | undefined = floors[fi].heights;
    let heightMap = false, maxLvl = 0, CEIL_Z = 0;     // terrain within the current floor
    let sprites: Sprite[] = [];                        // crystals / exit / trees on this floor
    let tunnels: { x: number; y: number }[] = [];      // 'O' warp pads on this floor
    let npcs: Npc3D[] = [];                             // friendly billboards on this floor
    let enemies: Enemy[] = [];                          // stalkers spawned from this floor's 'M' cells
    const floorLvl = (x: number, y: number) => heightAt({ heights: fHeights }, x, y);

    // (Re)build everything that depends on which storey you're standing on.
    const loadFloor = (index: number) => {
      fi = Math.max(0, Math.min(floors.length - 1, index));
      const fl = floors[fi];
      rows = fl.rows;
      fHeights = fl.heights;
      heightMap = hasHeightMap(fl);
      maxLvl = 0;
      if (heightMap) for (let y = 0; y < rows.length; y++) for (let x = 0; x < rows[y].length; x++) maxLvl = Math.max(maxLvl, floorLvl(x, y));
      CEIL_Z = maxLvl * STEP_UNIT + CEIL_GAP;          // flat ceiling above the tallest platform on this floor
      sprites = []; tunnels = []; enemies = [];
      for (let y = 0; y < rows.length; y++)
        for (let x = 0; x < rows[y].length; x++) {
          const c = rows[y][x];
          if (c === 'C') sprites.push({ x: x + 0.5, y: y + 0.5, kind: 'crystal', key: `${fi}:${x}:${y}` });
          else if (c === 'E') sprites.push({ x: x + 0.5, y: y + 0.5, kind: 'exit' });
          else if (c === 'T') sprites.push({ x: x + 0.5, y: y + 0.5, kind: 'tree' });
          else if (c === 'b') sprites.push({ x: x + 0.5, y: y + 0.5, kind: 'bush' });
          else if (c === 'f') sprites.push({ x: x + 0.5, y: y + 0.5, kind: 'flower' });
          else if (c === 'r') sprites.push({ x: x + 0.5, y: y + 0.5, kind: 'rock' });
          else if (c === 'l') sprites.push({ x: x + 0.5, y: y + 0.5, kind: 'lamp' });
          else if (c === TUNNEL_CHAR) tunnels.push({ x: x + 0.5, y: y + 0.5 });
          else if (c === MONSTER_CHAR) enemies.push({ x: x + 0.5, y: y + 0.5, hx: x + 0.5, hy: y + 0.5, chasing: false, wx: x + 0.5, wy: y + 0.5, wt: 0, hit: 0, hp: 3, flash: 0 });
        }
      npcs = fl.npcs ?? [];
    };
    loadFloor(spawnFloor);

    // ── Stacked voxel world (2+ floors) ─────────────────────────────────────────────────────────
    // When a realm has multiple floors we stop swapping a single active grid and instead treat the
    // whole stack as ONE 3D world: every layer sits STOREY_H above the one below, walls are solid
    // blocks a storey tall (stand on their roof), '.'/etc are thin walkable slabs (their underside is
    // the ceiling for the layer below), and ' ' (air) is empty — you see and fall straight through it.
    // That's what lets you walk UNDER an overhang and look DOWN a shaft to the floor below.
    const stacked = floors.length > 1;
    const STOREY_H = STOREY_LEVELS * STEP_UNIT;       // world height of one storey (≈ one wall tall)
    const nLayers = floors.length;
    const grids = floors.map(f => f.rows);
    const baseZ = (k: number) => k * STOREY_H;        // floor height of layer k
    const cellL = (k: number, x: number, y: number) => (k < 0 || k >= nLayers) ? '#' : cellAt(grids[k], x, y);
    // Per-cell terrain height ALSO applies inside a stacked realm: the Raise/Lower tool lifts a walkable
    // slab within its storey (capped so it never pokes into the floor above). This is what lets raised
    // terrain and storeys coexist instead of being one-or-the-other.
    const hLvl = (k: number, x: number, y: number) => { const ch = floors[k]?.heights?.[y]?.[x]; return ch && ch >= '0' && ch <= '9' ? ch.charCodeAt(0) - 48 : 0; };
    const slabZ = (k: number, x: number, y: number) => baseZ(k) + Math.min(hLvl(k, x, y) * STEP_UNIT, STOREY_H - 0.05);
    const isSolidProp = (ch: string) => ch === 'T' || ch === 'r' || ch === 'l';
    const bodyBlocks = (ch: string) => isWall(ch) || isSolidProp(ch);      // fills its whole storey → blocks your body
    const STEP_UP = STEP_UNIT + 0.02;                 // you auto-step up a ledge this tall; taller needs a jump
    // every standable surface in a column: wall roofs (base+STOREY_H) and thin slab tops (base + raise).
    const standTops = (x: number, y: number): number[] => {
      const t: number[] = [];
      for (let k = 0; k < nLayers; k++) { const c = cellL(k, x, y); if (isWall(c)) t.push(baseZ(k) + STOREY_H); else if (!isAir(c)) t.push(slabZ(k, x, y)); }
      return t;
    };
    // movement collision that allows STEPPING: walls/props always block the body; raised terrain only
    // blocks the part that's more than one step above your feet, so 1-level terrain forms walkable ramps.
    const solidFor = (x: number, y: number, feet: number): boolean => {
      const zLo = feet + 0.12, zHi = feet + 0.7;
      for (let k = 0; k < nLayers; k++) {
        const c = cellL(k, x, y);
        if (bodyBlocks(c)) { const b = baseZ(k); if (zHi > b && zLo < b + STOREY_H) return true; }                       // walls/props: solid full storey
        else if (!isAir(c)) { const b = baseZ(k), top = slabZ(k, x, y); if (top > feet + STEP_UP && zHi > b && zLo < top) return true; }   // raised terrain: a SOLID hill you can't step straight up
      }
      return false;
    };
    // lowest block underside above `head` (head-bonk while jumping); +∞ = open sky above.
    const ceilAbove = (x: number, y: number, head: number): number => {
      let lo = Infinity; for (let k = 0; k < nLayers; k++) { const c = cellL(k, x, y); if (!bodyBlocks(c)) continue; const b = baseZ(k); if (b >= head - 0.001 && b < lo) lo = b; } return lo;
    };
    // which layer's surface you're standing on (for hazard/pickup/exit effects under your feet).
    // floor() not round() so raised terrain (a slab lifted within its storey) still reads as its own layer.
    const layerAt = (z: number) => Math.max(0, Math.min(nLayers - 1, Math.floor(z / STOREY_H + 0.001)));

    // Pull crystals/exit/props, stalkers and NPCs from EVERY layer — they all render at once (you see
    // the crystal on the floor above through a hole), each tagged with its layer k for its height.
    type LSprite = Sprite & { k: number };
    const allSprites: LSprite[] = [];
    const allNpcs: (Npc3D & { k: number })[] = [];
    if (stacked) {
      const all: Enemy[] = [];
      for (let k = 0; k < nLayers; k++) {
        const g = grids[k];
        for (let y = 0; y < g.length; y++) for (let x = 0; x < g[y].length; x++) {
          const c = g[y][x];
          if (c === 'C') allSprites.push({ x: x + 0.5, y: y + 0.5, kind: 'crystal', key: `${k}:${x}:${y}`, k });
          else if (c === 'E') allSprites.push({ x: x + 0.5, y: y + 0.5, kind: 'exit', k });
          else if (c === 'T') allSprites.push({ x: x + 0.5, y: y + 0.5, kind: 'tree', k });
          else if (c === 'b') allSprites.push({ x: x + 0.5, y: y + 0.5, kind: 'bush', k });
          else if (c === 'f') allSprites.push({ x: x + 0.5, y: y + 0.5, kind: 'flower', k });
          else if (c === 'r') allSprites.push({ x: x + 0.5, y: y + 0.5, kind: 'rock', k });
          else if (c === 'l') allSprites.push({ x: x + 0.5, y: y + 0.5, kind: 'lamp', k });
          else if (c === MONSTER_CHAR) all.push({ x: x + 0.5, y: y + 0.5, hx: x + 0.5, hy: y + 0.5, chasing: false, wx: x + 0.5, wy: y + 0.5, wt: 0, hit: 0, hp: 3, flash: 0, k });
        }
        for (const n of (floors[k].npcs ?? [])) allNpcs.push({ ...n, k });
      }
      enemies = all;       // stalker AI / attacks / minimap iterate this (each enemy carries its layer)
    }

    // Friendly/hazard NPC billboard buffer + appearance renderer (shared across floors).
    const npcBuf = document.createElement('canvas'); npcBuf.width = 96; npcBuf.height = 128;
    const npcCtx = npcBuf.getContext('2d') as CanvasRenderingContext2D;
    const renderAppearance = (a: string, af: number) => {
      npcCtx.clearRect(0, 0, npcBuf.width, npcBuf.height);
      npcCtx.save();
      npcCtx.translate(npcBuf.width / 2, npcBuf.height * 0.56);   // origin ~ mid-body; feet land near the bottom
      const app = resolveAppearance(a);
      if (app.kind === 'person') drawPerson(npcCtx, app.person, 64, 86, af);
      else if (app.kind === 'icon' && app.spec) drawIconSpec(npcCtx, app.spec, 72, af);
      else if (isCreatureId(a)) { const cr = parseCreature(a); drawSkinShape(npcCtx, cr.shape, cr.color, 60, 78, af, cr.accent); }
      else { const sk = skinById(app.kind === 'skin' ? app.id : 'diamond-gold'); drawSkinShape(npcCtx, sk.shape, sk.color, 60, 78, af); }
      npcCtx.restore();
    };

    // ── Player state ──────────────────────────────────────────────────────────────────────────
    let px = spawn.x, py = spawn.y;
    let dir = ((level.spawnDir ?? 0) * Math.PI) / 180;
    let pz = stacked ? baseZ(spawnFloor) : floorLvl(Math.floor(px), Math.floor(py)) * STEP_UNIT;   // feet height (stacked) / eased standing height (flat)
    let viewZ = pz;                                                  // eye height eased toward pz (smooth steps)
    let pitch = 0;                                                   // look up/down (screen px)
    let jz = 0, vz = 0, grounded = true;                            // jump: hop height, velocity, on-ground
    let groundZ = pz;                                               // height of the surface you last stood on (for fall damage)
    let atkCd = 0, atkAnim = 0;                                      // weapon cooldown + swing animation
    let breath = 100, submerged = false;                            // swimming: air left, are you under water
    let hp = MAX_HP;
    let respawn = 0;            // >0 = dead, counting down a fade before respawn
    let exited = false;
    let tick = 0;
    let bob = 0;               // view bob phase
    let shake = 0;             // damage shake
    let tpLock = false;        // true while standing on the tunnel you just arrived at (no instant re-warp)

    // ── Offscreen framebuffer (low-res, blitted up for the chunky retro look) ───────────────────
    const buf = document.createElement('canvas');
    const bctx = buf.getContext('2d', { alpha: false }) as CanvasRenderingContext2D;
    let RES_W = 0, img: ImageData, data: Uint8ClampedArray, depth: Float32Array;
    const setupBuffer = (aspect: number) => {
      RES_W = Math.max(120, Math.min(640, Math.round(RES_H * aspect)));
      buf.width = RES_W; buf.height = RES_H;
      img = bctx.createImageData(RES_W, RES_H);
      data = img.data;
      depth = new Float32Array(RES_W * RES_H);   // per-pixel depth → sprites occlude correctly behind steps
    };

    // Size the visible canvas to its box; recompute internal width from the aspect ratio.
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      const w = Math.max(1, Math.round(r.width));
      const h = Math.max(1, Math.round(r.height));
      canvas.width = w; canvas.height = h;
      ctx.imageSmoothingEnabled = false;
      setupBuffer(w / h);
    };
    resize();
    const ro = new ResizeObserver(resize); ro.observe(canvas);

    // ── Audio (tiny, optional) ──────────────────────────────────────────────────────────────────
    let actx: AudioContext | null = null;
    const beep = (freq: number, dur: number, type: OscillatorType = 'square', gain = 0.05) => {
      try {
        if (!actx) actx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        const o = actx.createOscillator(), g = actx.createGain();
        o.type = type; o.frequency.value = freq; g.gain.value = gain;
        o.connect(g); g.connect(actx.destination);
        const t = actx.currentTime; o.start(t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.stop(t + dur);
      } catch { /* audio blocked */ }
    };
    // Softer voiced note (attack + release) for the melodic layer over the drone.
    const tone = (freq: number, dur: number, type: OscillatorType = 'sine', gain = 0.05) => {
      if (mutedRef.current) return;
      try {
        if (!actx) actx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        const o = actx.createOscillator(), g = actx.createGain();
        o.type = type; o.frequency.value = freq; g.gain.value = 0;
        o.connect(g); g.connect(actx.destination);
        const t = actx.currentTime; o.start(t);
        g.gain.linearRampToValueAtTime(gain, t + Math.min(0.18, dur * 0.3));
        g.gain.linearRampToValueAtTime(0.0001, t + dur);
        o.stop(t + dur + 0.05);
      } catch { /* audio blocked */ }
    };
    // Melodic scales per mood (semitones over a root). Spooky = Phrygian dread; chill = warm pentatonic.
    const ROOT = mood === 'tense' ? 98 : mood === 'spooky' ? 130.81 : 261.63;   // G2 / C3 / C4
    const SCALE = mood === 'spooky' ? [0, 1, 3, 5, 7, 8] : mood === 'tense' ? [0, 3, 5, 6, 7, 10] : [0, 2, 4, 7, 9];
    const noteHz = (semi: number) => ROOT * Math.pow(2, semi / 12);

    // ── Ambience — generative drone matching the level's mood (spooky/tense/chill). Starts on the
    // first user gesture (audio policy); a ♪ button mutes it. Spooky/tense get eerie stings over time.
    let amb: { master: GainNode; nodes: OscillatorNode[] } | null = null;
    const startAmbience = () => {
      if (amb || mutedRef.current) return;
      try {
        if (!actx) actx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        const master = actx.createGain(); master.gain.value = 0; master.connect(actx.destination);
        master.gain.linearRampToValueAtTime(mood === 'chill' ? 0.1 : 0.13, actx.currentTime + 2.5);
        const nodes: OscillatorNode[] = [];
        const mk = (f: number, type: OscillatorType, g: number) => {
          const o = actx!.createOscillator(), gg = actx!.createGain();
          o.type = type; o.frequency.value = f; gg.gain.value = g; o.connect(gg); gg.connect(master); o.start(); nodes.push(o); return o;
        };
        if (mood === 'spooky') {
          mk(52, 'sawtooth', 0.32); mk(55.5, 'sawtooth', 0.2);          // low detuned dread drone (beating)
          const eerie = mk(415, 'sine', 0.05);                          // high wavering tone
          const lfo = actx.createOscillator(); lfo.frequency.value = 0.07; const lg = actx.createGain(); lg.gain.value = 8; lfo.connect(lg); lg.connect(eerie.frequency); lfo.start(); nodes.push(lfo);
        } else if (mood === 'tense') {
          mk(65, 'square', 0.16); mk(32.5, 'sine', 0.3); mk(98, 'sawtooth', 0.05);
        } else {
          mk(130.8, 'sine', 0.16); mk(196, 'sine', 0.11); mk(261.6, 'sine', 0.05);   // soft consonant pad
        }
        amb = { master, nodes };
      } catch { /* audio blocked */ }
    };
    const stopAmbience = () => {
      if (!amb || !actx) return;
      const a = amb; amb = null;
      try { a.master.gain.linearRampToValueAtTime(0, actx.currentTime + 0.4); } catch { /* noop */ }
      setTimeout(() => a.nodes.forEach(n => { try { n.stop(); } catch { /* noop */ } }), 500);
    };
    ambToggleRef.current = (m: boolean) => { if (m) stopAmbience(); else startAmbience(); };

    // ── Input ─────────────────────────────────────────────────────────────────────────────────
    const keys = new Set<string>();
    const kd = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
      keys.add(k);
      startAmbience();
      if (k === 'escape') onExitRef.current?.();
      if (k === 'f') attackFnRef.current?.();
    };
    const ku = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);

    // Mouse-look via pointer lock (desktop). Once locked, a click swings your weapon (combat realms).
    const onClick = () => {
      if (isMobileStage) return;
      startAmbience();
      if (document.pointerLockElement === canvas) attackFnRef.current?.();
      else canvas.requestPointerLock?.();
    };
    const onMouseMove = (e: MouseEvent) => {
      if (document.pointerLockElement !== canvas) return;
      dir += e.movementX * 0.0022;
      pitch = Math.max(-RES_H * 0.55, Math.min(RES_H * 0.55, pitch - e.movementY * 0.5));   // look up/down
    };
    canvas.addEventListener('click', onClick);
    window.addEventListener('mousemove', onMouseMove);

    // Touch: left half = move stick, right half = turn stick
    type Stick = { id: number; ox: number; oy: number; x: number; y: number };
    let moveStick: Stick | null = null, turnStick: Stick | null = null;
    const td = (e: PointerEvent) => {
      startAmbience();
      const r = canvas.getBoundingClientRect();
      const lx = e.clientX - r.left;
      const s: Stick = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY };
      if (lx < r.width / 2) moveStick = s; else turnStick = s;
    };
    const tm = (e: PointerEvent) => {
      if (moveStick && e.pointerId === moveStick.id) { moveStick.x = e.clientX; moveStick.y = e.clientY; }
      if (turnStick && e.pointerId === turnStick.id) { turnStick.x = e.clientX; turnStick.y = e.clientY; }
    };
    const tu = (e: PointerEvent) => {
      if (moveStick && e.pointerId === moveStick.id) moveStick = null;
      if (turnStick && e.pointerId === turnStick.id) turnStick = null;
    };
    if (isMobileStage) {
      canvas.addEventListener('pointerdown', td);
      window.addEventListener('pointermove', tm);
      window.addEventListener('pointerup', tu);
      window.addEventListener('pointercancel', tu);
    }

    // ── Collision: try to move to (nx,ny); slide along walls; never enter a wall cell. A floor more
    // than one level above where you stand is too tall to climb (acts like a wall); dropping down any
    // amount is fine (you step/fall down). `base` = the level you're currently standing on.
    const tooTall = (cx: number, cy: number, base: number) => floorLvl(cx, cy) - base > (jz > 0.1 ? 2 : 1);
    const blocked = (x: number, y: number, base: number) => {
      const pts: [number, number][] = [[x - RADIUS, y], [x + RADIUS, y], [x, y - RADIUS], [x, y + RADIUS]];
      for (const [sx, sy] of pts) {
        const cx = Math.floor(sx), cy = Math.floor(sy);
        const c = cellAt(rows, cx, cy);
        if (isWall(c) || c === 'T' || c === 'r' || c === 'l') return true;   // trees, rocks, lamp posts are solid
        if (heightMap && tooTall(cx, cy, base)) return true;
      }
      return false;
    };
    const tryMove = (nx: number, ny: number) => {
      const base = floorLvl(Math.floor(px), Math.floor(py));
      if (!blocked(nx, py, base)) px = nx;
      if (!blocked(px, ny, base)) py = ny;
    };

    const doRespawn = () => { if (!stacked && fi !== spawnFloor) loadFloor(spawnFloor); px = spawn.x; py = spawn.y; dir = ((level.spawnDir ?? 0) * Math.PI) / 180; pz = stacked ? baseZ(spawnFloor) : floorLvl(Math.floor(px), Math.floor(py)) * STEP_UNIT; viewZ = pz; vz = 0; grounded = true; pitch = 0; hp = MAX_HP; breath = 100; respawn = 0; tpLock = false; };

    let hudHp = -1, hudCry = -1, hudDead = false, hudBr = -1;
    const pushHud = () => {
      const c = grabbed.size, br = Math.round(breath);
      if (hp !== hudHp || c !== hudCry || (respawn > 0) !== hudDead || br !== hudBr) {
        hudHp = hp; hudCry = c; hudDead = respawn > 0; hudBr = br;
        setHud({ hp: Math.max(0, Math.round(hp)), crystals: c, total: totalCrystals, dead: respawn > 0, exited, breath: br, submerged });
      }
    };

    // ── Sim tick ────────────────────────────────────────────────────────────────────────────────
    const update = () => {
      tick++;
      if (atkCd > 0) atkCd--;
      if (atkAnim > 0) atkAnim--;
      if (exited) return;
      if (respawn > 0) { respawn--; if (respawn === 0) doRespawn(); return; }

      // jump — a hop you can use to mount a ledge one extra level high while airborne
      if ((keys.has(' ') || keys.has('spacebar')) && grounded) { vz = 0.05; grounded = false; }
      if (!grounded) { jz += vz; vz -= 0.006; if (jz <= 0) { jz = 0; vz = 0; grounded = true; } }

      // intent
      let fwd = 0, strafe = 0, turn = 0;
      const run = keys.has('shift');
      if (keys.has('w') || keys.has('arrowup')) fwd += 1;
      if (keys.has('s') || keys.has('arrowdown')) fwd -= 1;
      if (keys.has('q')) strafe -= 1;
      if (keys.has('e')) strafe += 1;
      if (keys.has('a') || keys.has('arrowleft')) turn -= 1;
      if (keys.has('d') || keys.has('arrowright')) turn += 1;
      if (moveStick) {
        const dx = moveStick.x - moveStick.ox, dy = moveStick.y - moveStick.oy;
        const max = 70;
        fwd += Math.max(-1, Math.min(1, -dy / max));
        strafe += Math.max(-1, Math.min(1, dx / max));
      }
      if (turnStick) turn += Math.max(-1, Math.min(1, (turnStick.x - turnStick.ox) / 70));

      dir += turn * TURN;
      const sp = run ? RUN : MOVE;
      const cos = Math.cos(dir), sin = Math.sin(dir);
      let nx = px, ny = py;
      if (fwd) { nx += cos * fwd * sp; ny += sin * fwd * sp; }
      if (strafe) { nx += -sin * strafe * sp; ny += cos * strafe * sp; }
      if (nx !== px || ny !== py) {
        tryMove(nx, ny);
        bob += sp;
      }

      // ease eye-height toward the floor you're standing on (so steps feel smooth, not teleporty)
      const standZ = floorLvl(Math.floor(px), Math.floor(py)) * STEP_UNIT;
      pz += (standZ - pz) * 0.25;

      // standing-tile effects
      const cx = Math.floor(px), cy = Math.floor(py);
      const here = cellAt(rows, cx, cy);
      if (here === TUNNEL_CHAR) {               // tunnel — warp to the next tunnel cell (loops/pairs)
        if (!tpLock && tunnels.length > 1) {
          const idx = tunnels.findIndex(t => Math.floor(t.x) === cx && Math.floor(t.y) === cy);
          const dst = tunnels[(idx + 1) % tunnels.length];
          px = dst.x; py = dst.y;
          pz = floorLvl(Math.floor(px), Math.floor(py)) * STEP_UNIT;
          tpLock = true;                         // don't bounce off the destination pad on arrival
          shake = Math.min(4, shake + 1.2);
          beep(520, 0.1, 'sine', 0.05); beep(780, 0.12, 'sine', 0.045); beep(1180, 0.14, 'sine', 0.04);
        }
      } else if (here === STAIR_UP || here === STAIR_DOWN) {   // stairs — change storey, land at the same x,y
        if (!tpLock) {
          const dest = fi + (here === STAIR_UP ? 1 : -1);
          if (dest >= 0 && dest < floors.length) {
            loadFloor(dest);
            pz = floorLvl(cx, cy) * STEP_UNIT;   // ease onto the new floor's terrain
            tpLock = true;                       // don't immediately ride the stair back
            beep(here === STAIR_UP ? 560 : 360, 0.12, 'triangle', 0.05); beep(here === STAIR_UP ? 840 : 240, 0.14, 'triangle', 0.045);
          }
        }
      } else { tpLock = false; }                 // stepped off a pad/stair → warps armed again
      if (here === '~') {                       // pit — you fall and die
        beep(180, 0.5, 'sawtooth', 0.06);
        hp = 0; respawn = 70;
      } else if (here === 'L') {                // lava — drains HP
        hp -= LAVA_DPS; shake = Math.min(4, shake + 0.8);
        if (tick % 14 === 0) beep(90, 0.08, 'sawtooth', 0.04);
        if (hp <= 0) { hp = 0; respawn = 70; beep(150, 0.5, 'sawtooth', 0.06); }
      }
      if (shake > 0) shake *= 0.85;

      // swimming — water saps your air; surface (any non-water tile) to breathe, or you drown
      submerged = here === 'w';
      if (submerged) {
        breath -= 0.38;
        if (tick % 50 === 0) beep(420, 0.12, 'sine', 0.025);            // bubble
        if (breath <= 0) { breath = 0; hp -= 0.7; if (tick % 10 === 0) beep(120, 0.2, 'sawtooth', 0.05); if (hp <= 0) { hp = 0; respawn = 70; } }
      } else if (breath < 100) {
        breath = Math.min(100, breath + 2.2);                           // gulp air back fast on the surface
      }

      // crystal pickups
      for (const s of sprites) {
        if (s.kind !== 'crystal' || !s.key || grabbed.has(s.key)) continue;
        if (Math.abs(s.x - px) < 0.45 && Math.abs(s.y - py) < 0.45) {
          grabbed.add(s.key); onRewardRef.current?.(5); beep(880, 0.12, 'triangle', 0.05); beep(1320, 0.1, 'triangle', 0.04);
        }
      }

      // exit
      if (here === 'E') { exited = true; beep(660, 0.15, 'sine', 0.06); beep(990, 0.2, 'sine', 0.05); setTimeout(() => onExitRef.current?.(), 220); }

      updateEnemies();
      musicStep();
      pushHud();
    };

    // ── Melodic layer over the drone — evolving, not a flat pad ──────────────────────────────────
    let musicSeq = 0;
    const musicStep = () => {
      if (!amb || mutedRef.current) return;
      if (mood === 'chill') {
        // gentle rolling arpeggio that drifts up and down the pentatonic, plus a soft bass swell
        if (tick % 26 === 0) {
          const n = SCALE.length, i = musicSeq % (n * 2), idx = i < n ? i : n * 2 - 1 - i;   // up then down
          tone(noteHz(SCALE[idx] + 12), 0.9, 'sine', 0.05); musicSeq++;
        }
        if (tick % 208 === 0) tone(noteHz(SCALE[(musicSeq * 3) % SCALE.length]) / 2, 3.5, 'triangle', 0.045);
      } else if (mood === 'tense') {
        // driving pulse + a stab every other bar
        if (tick % 18 === 0) { tone(noteHz(0) / 2, 0.14, 'square', 0.05); musicSeq++; }
        if (tick % 144 === 72) tone(noteHz(SCALE[(musicSeq) % SCALE.length] + 12), 0.4, 'sawtooth', 0.04);
      } else {
        // spooky: sparse, irregular minor notes that creep in + a low tritone swell
        const phr = tick % 168;
        if (phr === 0) { tone(noteHz(SCALE[(musicSeq * 5) % SCALE.length] + 12), 1.6, 'sine', 0.04); musicSeq++; }
        else if (phr === 70) tone(noteHz(SCALE[(musicSeq * 2 + 1) % SCALE.length] + 12) * 1.0, 1.1, 'sine', 0.03);
        else if (phr === 118 && (musicSeq & 1)) tone(noteHz(6) / 2, 2.2, 'sawtooth', 0.03);   // creeping tritone
      }
    };

    // ── Stalker AI ──────────────────────────────────────────────────────────────────────────────
    const SIGHT = 4.5, LOSE = 7.5, E_WANDER = 0.012, E_CHASE = 0.038, E_DMG = 0.9;   // close to notice, slower than a running player → you can run & hide
    const eBlocked = (g: string[], x: number, y: number) =>
      isWall(cellAt(g, Math.floor(x), Math.floor(y))) || cellAt(g, Math.floor(x), Math.floor(y)) === '~' || isAir(cellAt(g, Math.floor(x), Math.floor(y)));   // walls, pits AND air-edges pen a stalker in
    const lineClear = (g: string[], x0: number, y0: number, x1: number, y1: number) => {
      const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 4);
      for (let i = 1; i < steps; i++) {
        const t = i / steps;
        if (isWall(cellAt(g, Math.floor(x0 + (x1 - x0) * t), Math.floor(y0 + (y1 - y0) * t)))) return false;
      }
      return true;
    };
    const updateEnemies = () => {
      for (const e of enemies) {
        if (e.hp <= 0) continue;
        const g = e.k != null ? grids[e.k] : rows;     // stalkers hunt within their own storey's grid
        const sameZ = e.k == null || Math.abs(baseZ(e.k) - pz) < 1.2;   // only menace you if you're on roughly its level
        if (e.hit > 0) e.hit--;
        if (e.flash > 0) e.flash--;
        const dx = px - e.x, dy = py - e.y;
        const dist = Math.hypot(dx, dy);
        const sees = sameZ && dist < SIGHT && lineClear(g, e.x, e.y, px, py);
        if (sees) e.chasing = true; else if (dist > LOSE || !sameZ) e.chasing = false;   // give up if you break line of sight / change floors

        let tx: number, ty: number, sp: number;
        if (e.chasing) { tx = px; ty = py; sp = E_CHASE; }
        else {
          if (e.wt <= 0 || (Math.abs(e.x - e.wx) < 0.2 && Math.abs(e.y - e.wy) < 0.2)) {
            // pick a new wander point near home (deterministic-ish via tick + position, no RNG needed)
            const ang = (tick * 0.13 + e.hx * 1.7 + e.hy * 2.3) % (Math.PI * 2);
            e.wx = e.hx + Math.cos(ang) * 2.2; e.wy = e.hy + Math.sin(ang) * 2.2; e.wt = 160;
          }
          e.wt--; tx = e.wx; ty = e.wy; sp = E_WANDER;
        }
        const a = Math.atan2(ty - e.y, tx - e.x);
        const nx = e.x + Math.cos(a) * sp, ny = e.y + Math.sin(a) * sp;
        if (!eBlocked(g, nx, e.y)) e.x = nx;
        if (!eBlocked(g, e.x, ny)) e.y = ny;

        // touch → damage (with a short cooldown so it ticks, not nukes)
        if (sameZ && dist < 0.6 && e.hit === 0 && respawn === 0) {
          hp -= E_DMG * 8; e.hit = 40; shake = 4; beep(70, 0.25, 'sawtooth', 0.07);
          if (hp <= 0) { hp = 0; respawn = 70; beep(140, 0.6, 'sawtooth', 0.07); }
        }
      }
    };

    // Attack — only in combat realms. A short-range frontal swing; run-and-hide realms have no weapon.
    const doAttack = () => {
      if (!canFight || atkCd > 0 || respawn > 0 || exited) return;
      atkCd = 24; atkAnim = 10; beep(260, 0.06, 'square', 0.05);
      const cos = Math.cos(dir), sin = Math.sin(dir);
      for (const e of enemies) {
        if (e.hp <= 0) continue;
        if (e.k != null && Math.abs(baseZ(e.k) - pz) > 1.0) continue;   // can't hit a stalker a storey away
        const dx = e.x - px, dy = e.y - py, dist = Math.hypot(dx, dy);
        if (dist > 1.8 || dist < 0.001) continue;
        if ((dx * cos + dy * sin) / dist < 0.5) continue;   // must be roughly in front (~60° arc)
        e.hp -= 1; e.flash = 8; e.chasing = true; shake = 2; beep(150, 0.1, 'square', 0.05);
        if (e.hp <= 0) { onRewardRef.current?.(10); beep(440, 0.18, 'triangle', 0.06); }
      }
    };
    attackFnRef.current = doAttack;

    // ── Render ────────────────────────────────────────────────────────────────────────────────
    const draw = () => {
      const W = RES_W, H = RES_H;
      const cos = Math.cos(dir), sin = Math.sin(dir);
      const planeLen = (W / H) * 0.5;          // square pixels on any aspect
      const planeX = -sin * planeLen, planeY = cos * planeLen;
      const horizon = (H >> 1) + Math.round(pitch) + (heightMap ? 0 : Math.round(jz * 120));   // pitch + jump-bob (flat)
      const fog = pal.fog;

      const fogMix = (r: number, g: number, b: number, t: number): [number, number, number] => {
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        return [r + (fog[0] - r) * t, g + (fog[1] - g) * t, b + (fog[2] - b) * t];
      };

      // Lantern light: 1 near you, falling to `ambient` past `radius`; flickers if asked. The black
      // beyond your light is what makes the horror atmospheres terrifying. 1 (no darkening) otherwise.
      const flick = lighting && lighting.flicker
        ? 1 - lighting.flicker * (0.5 + 0.5 * Math.sin(tick * 0.7) * Math.sin(tick * 0.21 + 1.3))
        : 1;
      const lightAt = (dist: number): number => {
        if (!lighting) return 1;
        const f = 1 - dist / lighting.radius;
        return (f < lighting.ambient ? lighting.ambient : f) * flick;
      };

      // Sky: when a realm has one, the "ceiling" region renders a vertical gradient (day/night/etc.)
      // instead of a flat ceiling. null = a solid dungeon ceiling. Sky ignores the lantern (it's far off).
      const skyGrad = sky;   // [topRGB, horizonRGB] or null
      const skyColAt = (y: number): [number, number, number] => {
        const t = horizon <= 0 ? 1 : Math.max(0, Math.min(1, y / horizon));
        return [skyGrad![0][0] + (skyGrad![1][0] - skyGrad![0][0]) * t,
                skyGrad![0][1] + (skyGrad![1][1] - skyGrad![0][1]) * t,
                skyGrad![0][2] + (skyGrad![1][2] - skyGrad![0][2]) * t];
      };

      depth.fill(1e9);     // reset per-pixel depth + clear colour so a shifted horizon never tears
      data.fill(0);

      if (!heightMap) {
      // 1a) Sky / ceiling — colour depends only on the row, so fill each row once. Cover the horizon
      // row too (≤ horizon) so a pitched view never leaves an uncovered tearing line.
      for (let y = 0; y <= horizon && y < H; y++) {
        const p = Math.max(1, horizon - y);
        const rowDist = (0.5 * H) / p;
        let cr: number, cg: number, cb: number, dd: number;
        if (sky) { [cr, cg, cb] = skyColAt(y); dd = 1e9; }
        else { const lf = lightAt(rowDist); const ft = 1 - 1 / (1 + rowDist * rowDist * 0.012); const m = fogMix(pal.ceil[0], pal.ceil[1], pal.ceil[2], ft * 0.7); cr = m[0] * lf; cg = m[1] * lf; cb = m[2] * lf; dd = rowDist; }
        for (let x = 0; x < W; x++) { const o = (y * W + x) * 4; data[o] = cr; data[o + 1] = cg; data[o + 2] = cb; data[o + 3] = 255; depth[y * W + x] = dd; }
      }
      // 1b) Floor cast (per pixel). Left/right edge rays bound the row.
      const rdx0 = cos - planeX, rdy0 = sin - planeY;   // leftmost ray
      const rdx1 = cos + planeX, rdy1 = sin + planeY;   // rightmost ray
      for (let y = Math.max(0, horizon + 1); y < H; y++) {
        const p = y - horizon;
        const rowDist = (0.5 * H) / p;                  // camera height 0.5
        const stepX = (rowDist * (rdx1 - rdx0)) / W;
        const stepY = (rowDist * (rdy1 - rdy0)) / W;
        let fx = px + rowDist * rdx0;
        let fy = py + rowDist * rdy0;
        const fogT = 1 - 1 / (1 + rowDist * rowDist * 0.012);
        const lf = lightAt(rowDist);
        const floorRow = y * W * 4;
        for (let x = 0; x < W; x++, fx += stepX, fy += stepY) {
          const c = cellAt(rows, Math.floor(fx), Math.floor(fy));
          // floor colour by tile. Lava and the exit pad are EMISSIVE — they light themselves, so the
          // lantern darkness doesn't dim them (they read as beacons in a blackout).
          let fr: number, fg: number, fb: number, emissive = false;
          if (c === 'L') {                               // lava — glowing, shimmering
            const sh = 0.6 + 0.4 * Math.sin((fx + fy) * 6 + tick * 0.25);
            fr = 255 * sh; fg = 90 * sh + 30; fb = 20 * sh; emissive = true;
          } else if (c === 'w') {                         // water — animated blue ripples
            const sh = 0.7 + 0.3 * Math.sin((fx * 3 + fy * 2) * 2 + tick * 0.12);
            fr = 20 * sh; fg = 90 * sh; fb = 170 * sh; emissive = true;
          } else if (c === '~') {                         // pit — near-black void
            fr = 4; fg = 3; fb = 8; emissive = true;
          } else if (c === 'E') {                         // exit — cyan pad
            const sh = 0.7 + 0.3 * Math.sin(tick * 0.18);
            fr = 30; fg = 200 * sh; fb = 230 * sh; emissive = true;
          } else if (c === TUNNEL_CHAR) {                 // tunnel — swirling violet warp pad
            const sw = 0.55 + 0.45 * Math.sin((fx + fy) * 5 - tick * 0.3);
            fr = 150 * sw + 40; fg = 40 * sw; fb = 210 * sw + 40; emissive = true;
          } else if (c === STAIR_UP) {                    // stairs up — bright banded steps
            const st = (Math.floor(fy * 4 + fx * 4) & 1) ? 1 : 0.7;
            fr = 180 * st; fg = 200 * st; fb = 150 * st; emissive = true;
          } else if (c === STAIR_DOWN) {                  // stairs down — a dark recessed shaft
            const st = (Math.floor(fy * 4 + fx * 4) & 1) ? 0.5 : 0.28;
            fr = 40 * st; fg = 44 * st; fb = 60 * st; emissive = true;
          } else if (c === 'g' || c === 'b' || c === 'f') {  // grass (also under bushes/flowers)
            const chk = ((Math.floor(fx) + Math.floor(fy)) & 1) ? 1 : 0.88;
            fr = 46 * chk; fg = 120 * chk; fb = 48 * chk;
          } else if (c === 'p') {                          // pavement — light stone tiles with grout
            const gx = fx - Math.floor(fx), gy = fy - Math.floor(fy);
            const grout = (gx < 0.06 || gx > 0.94 || gy < 0.06 || gy > 0.94) ? 0.55 : 1;
            const chk = ((Math.floor(fx) + Math.floor(fy)) & 1) ? 1 : 0.9;
            fr = 150 * chk * grout; fg = 150 * chk * grout; fb = 162 * chk * grout;
          } else {                                        // normal floor with a faint checker
            const chk = ((Math.floor(fx) + Math.floor(fy)) & 1) ? 1 : 0.86;
            fr = pal.floor[0] * chk; fg = pal.floor[1] * chk; fb = pal.floor[2] * chk;
          }
          const isVoid = c === '~';
          let [r, g, b] = isVoid ? [fr, fg, fb] : fogMix(fr, fg, fb, fogT);
          if (!emissive) { r *= lf; g *= lf; b *= lf; }
          const o = floorRow + x * 4;
          data[o] = r; data[o + 1] = g; data[o + 2] = b; data[o + 3] = 255;
          depth[y * W + x] = rowDist;
        }
      }

      // 2) Wall cast (DDA), one column per screen X. Overwrites the floor/ceil band.
      for (let x = 0; x < W; x++) {
        const camX = (2 * x) / W - 1;
        const rdx = cos + planeX * camX, rdy = sin + planeY * camX;
        let mapX = Math.floor(px), mapY = Math.floor(py);
        const ddx = Math.abs(1 / rdx), ddy = Math.abs(1 / rdy);
        let sideX: number, sideY: number, stepX: number, stepY: number;
        if (rdx < 0) { stepX = -1; sideX = (px - mapX) * ddx; } else { stepX = 1; sideX = (mapX + 1 - px) * ddx; }
        if (rdy < 0) { stepY = -1; sideY = (py - mapY) * ddy; } else { stepY = 1; sideY = (mapY + 1 - py) * ddy; }
        let side = 0, hitCh = '#';
        for (let guard = 0; guard < 64; guard++) {
          if (sideX < sideY) { sideX += ddx; mapX += stepX; side = 0; } else { sideY += ddy; mapY += stepY; side = 1; }
          const c = cellAt(rows, mapX, mapY);
          if (isWall(c)) { hitCh = c; break; }
        }
        const perp = Math.max(0.02, side === 0 ? sideX - ddx : sideY - ddy);
        const lineH = Math.min(H * 12, Math.max(1, Math.floor(H / perp)));
        let drawStart = horizon - (lineH >> 1);
        let drawEnd = drawStart + lineH;
        const top = Math.max(0, drawStart), bot = Math.min(H, drawEnd);
        // texture X (where the ray hit along the wall face)
        const wallX = (side === 0 ? py + perp * rdy : px + perp * rdx) % 1;
        const base = pal.wall[hitCh] ?? pal.wall['#'];
        const sideDark = (side === 1 ? 0.7 : 1) * lightAt(perp);   // N/S faces darker + lantern falloff
        const fogT = 1 - 1 / (1 + perp * perp * 0.012);
        for (let y = top; y < bot; y++) {
          const ty = (y - drawStart) / lineH;            // 0..1 down the wall
          // cheap procedural brick: mortar lines + per-brick tint
          const brickRow = Math.floor(ty * 6);
          const offset = (brickRow & 1) ? 0.5 : 0;
          const bx = (wallX + offset) % 1;
          const mortar = (ty * 6) % 1 < 0.09 || (bx * 3) % 1 < 0.06 ? 0.55 : 1;
          const shade = sideDark * mortar * (0.8 + 0.2 * (1 - ty));
          const [r, g, b] = fogMix(base[0] * shade, base[1] * shade, base[2] * shade, fogT);
          const o = (y * W + x) * 4;
          data[o] = r; data[o + 1] = g; data[o + 2] = b; data[o + 3] = 255;
          depth[y * W + x] = perp;
        }
      }
      } else {
        // ── Multi-height renderer ──────────────────────────────────────────────────────────────────
        // Per column, march cells near→far. For each cell draw its floor at its OWN height, the flat
        // ceiling, and a vertical riser wherever the floor steps up/down. A free window [yCeil, yFloor)
        // shrinks as we go, so nearer geometry occludes farther — the trick that makes height read.
        const eye = pz + EYE_BASE + jz;   // jump raises your eye in 3D-height realms
        const projF = (z: number, d: number) => horizon + ((eye - z) * H) / d;
        const fogTd = (d: number) => 1 - 1 / (1 + d * d * 0.012);
        for (let x = 0; x < W; x++) {
          const camX = (2 * x) / W - 1;
          const rdx = cos + planeX * camX, rdy = sin + planeY * camX;
          let mapX = Math.floor(px), mapY = Math.floor(py);
          const ddx = Math.abs(1 / rdx), ddy = Math.abs(1 / rdy);
          let sideX: number, sideY: number, stepX: number, stepY: number;
          if (rdx < 0) { stepX = -1; sideX = (px - mapX) * ddx; } else { stepX = 1; sideX = (mapX + 1 - px) * ddx; }
          if (rdy < 0) { stepY = -1; sideY = (py - mapY) * ddy; } else { stepY = 1; sideY = (mapY + 1 - py) * ddy; }
          let curCh = cellAt(rows, mapX, mapY);
          let curZ = floorLvl(mapX, mapY) * STEP_UNIT;
          let dEnter = 0.0001, yFloor = H, yCeil = 0;
          for (let guard = 0; guard < 96 && yFloor > yCeil; guard++) {
            let side: number, dExit: number;
            if (sideX < sideY) { dExit = sideX; sideX += ddx; mapX += stepX; side = 0; }
            else { dExit = sideY; sideY += ddy; mapY += stepY; side = 1; }
            if (dExit < dEnter + 0.0001) dExit = dEnter + 0.0001;

            // floor of the current cell over [dEnter, dExit] (only visible when below your eye)
            if (curZ < eye) {
              const a = Math.max(yCeil, Math.floor(projF(curZ, dExit)));      // floor/ceil rounding expands
              const b = Math.min(yFloor, Math.ceil(projF(curZ, dEnter)));     // each strip 1px → no seams
              for (let y = a; y < b; y++) {
                const pp = y - horizon; if (pp <= 0) continue;
                const d = ((eye - curZ) * H) / pp;
                const fx = px + d * rdx, fy = py + d * rdy;
                let fr: number, fg: number, fb: number, emis = false;
                if (curCh === 'L') { const sh = 0.6 + 0.4 * Math.sin((fx + fy) * 6 + tick * 0.25); fr = 255 * sh; fg = 90 * sh + 30; fb = 20 * sh; emis = true; }
                else if (curCh === 'w') { const sh = 0.7 + 0.3 * Math.sin((fx * 3 + fy * 2) * 2 + tick * 0.12); fr = 20 * sh; fg = 90 * sh; fb = 170 * sh; emis = true; }
                else if (curCh === 'E') { const sh = 0.7 + 0.3 * Math.sin(tick * 0.18); fr = 30; fg = 200 * sh; fb = 230 * sh; emis = true; }
                else if (curCh === TUNNEL_CHAR) { const sw = 0.55 + 0.45 * Math.sin((fx + fy) * 5 - tick * 0.3); fr = 150 * sw + 40; fg = 40 * sw; fb = 210 * sw + 40; emis = true; }
                else if (curCh === STAIR_UP) { const st = (Math.floor(fy * 4 + fx * 4) & 1) ? 1 : 0.7; fr = 180 * st; fg = 200 * st; fb = 150 * st; emis = true; }
                else if (curCh === STAIR_DOWN) { const st = (Math.floor(fy * 4 + fx * 4) & 1) ? 0.5 : 0.28; fr = 40 * st; fg = 44 * st; fb = 60 * st; emis = true; }
                else if (curCh === '~') { fr = 4; fg = 3; fb = 8; emis = true; }
                else if (curCh === 'g' || curCh === 'b' || curCh === 'f') { const chk = ((Math.floor(fx) + Math.floor(fy)) & 1) ? 1 : 0.88; fr = 46 * chk; fg = 120 * chk; fb = 48 * chk; }
                else if (curCh === 'p') { const gx = fx - Math.floor(fx), gy = fy - Math.floor(fy); const grout = (gx < 0.06 || gx > 0.94 || gy < 0.06 || gy > 0.94) ? 0.55 : 1; const chk = ((Math.floor(fx) + Math.floor(fy)) & 1) ? 1 : 0.9; fr = 150 * chk * grout; fg = 150 * chk * grout; fb = 162 * chk * grout; }
                else { const chk = ((Math.floor(fx) + Math.floor(fy)) & 1) ? 1 : 0.94; fr = pal.floor[0] * chk; fg = pal.floor[1] * chk; fb = pal.floor[2] * chk; }
                let r: number, g: number, bl: number;
                if (emis) { r = fr; g = fg; bl = fb; } else { [r, g, bl] = fogMix(fr, fg, fb, fogTd(d)); const lf = lightAt(d); r *= lf; g *= lf; bl *= lf; }
                const o = (y * W + x) * 4; data[o] = r; data[o + 1] = g; data[o + 2] = bl; data[o + 3] = 255;
                depth[y * W + x] = d;
              }
              yFloor = Math.min(yFloor, a);
            }

            // ceiling / sky over [dEnter, dExit] (only visible above the horizon)
            {
              const ct = Math.max(yCeil, Math.floor(projF(CEIL_Z, dEnter)));
              const cb = Math.min(yFloor, Math.ceil(projF(CEIL_Z, dExit)));
              for (let y = ct; y < cb; y++) {
                const pp = y - horizon; if (pp >= 0) continue;
                const o = (y * W + x) * 4;
                if (sky) { const [sr, sg, sb] = skyColAt(y); data[o] = sr; data[o + 1] = sg; data[o + 2] = sb; data[o + 3] = 255; depth[y * W + x] = 1e9; }
                else { const d = ((eye - CEIL_Z) * H) / pp; const lf = lightAt(d); const [cr, cg, cbl] = fogMix(pal.ceil[0], pal.ceil[1], pal.ceil[2], fogTd(d) * 0.7); data[o] = cr * lf; data[o + 1] = cg * lf; data[o + 2] = cbl * lf; data[o + 3] = 255; depth[y * W + x] = d; }
              }
              yCeil = Math.max(yCeil, cb);
            }

            const nextCh = cellAt(rows, mapX, mapY);
            if (isWall(nextCh)) {                                   // full wall → close the column
              const base = pal.wall[nextCh] ?? pal.wall['#'];
              const sd = (side === 1 ? 0.7 : 1) * lightAt(dExit);
              const ft = fogTd(dExit);
              const wTopF = projF(CEIL_Z, dExit), wBotF = projF(curZ, dExit);
              const span = Math.max(1, wBotF - wTopF);
              const wxv = side === 0 ? py + dExit * rdy : px + dExit * rdx;
              const wxf = wxv - Math.floor(wxv);
              const wt = Math.max(yCeil, Math.floor(wTopF)), wb = Math.min(yFloor, Math.ceil(wBotF));
              for (let y = wt; y < wb; y++) {
                const ty = (y - wTopF) / span;
                const off = (Math.floor(ty * 6) & 1) ? 0.5 : 0;
                const mortar = (ty * 6) % 1 < 0.09 || (((wxf + off) % 1) * 3) % 1 < 0.06 ? 0.55 : 1;
                const shade = sd * mortar * (0.8 + 0.2 * (1 - ty));
                const [r, g, bl] = fogMix(base[0] * shade, base[1] * shade, base[2] * shade, ft);
                const o = (y * W + x) * 4; data[o] = r; data[o + 1] = g; data[o + 2] = bl; data[o + 3] = 255;
                depth[y * W + x] = dExit;
              }
              break;
            }
            const nZ = floorLvl(mapX, mapY) * STEP_UNIT;
            if (nZ !== curZ) {                                      // step up/down → vertical riser
              const zHi = Math.max(curZ, nZ), zLo = Math.min(curZ, nZ);
              const sd = (side === 1 ? 0.5 : 0.62) * lightAt(dExit);
              const ft = fogTd(dExit);
              const base = pal.floor;                              // a SHADOWED ledge (darkened floor), not bright stone
              const ra = Math.max(yCeil, Math.floor(projF(zHi, dExit)));
              const rb = Math.min(yFloor, Math.ceil(projF(zLo, dExit)));
              const [r, g, bl] = fogMix(base[0] * sd, base[1] * sd, base[2] * sd, ft);
              for (let y = ra; y < rb; y++) { const o = (y * W + x) * 4; data[o] = r; data[o + 1] = g; data[o + 2] = bl; data[o + 3] = 255; depth[y * W + x] = dExit; }
              yFloor = Math.min(yFloor, ra);
              curZ = nZ;
            }
            curCh = nextCh;
            dEnter = dExit;
            if (dExit > 48) break;
          }
        }
      }

      // 3) Sprites (crystals + exit gate) — billboard, depth-tested per column against zbuf.
      // Canonical raycaster inverse camera matrix (Lodev): dir=(cos,sin), plane=(planeX,planeY).
      const invDet = 1 / (planeX * sin - cos * planeY);
      const order = sprites
        .map((s, i) => ({ s, i, d: (s.x - px) ** 2 + (s.y - py) ** 2 }))
        .filter(o => !(o.s.kind === 'crystal' && o.s.key && grabbed.has(o.s.key)))
        .sort((a, b) => b.d - a.d);
      for (const { s, kind } of order.map(o => ({ s: o.s, kind: o.s.kind }))) {
        const relX = s.x - px, relY = s.y - py;
        const camY = invDet * (-planeY * relX + planeX * relY);  // depth (forward)
        if (camY <= 0.1) continue;
        const camX = invDet * (sin * relX - cos * relY);
        const screenX = Math.floor((W / 2) * (1 + camX / camY));
        const sizeBase = Math.abs(Math.floor(H / camY));
        const zfS = heightMap ? floorLvl(Math.floor(s.x), Math.floor(s.y)) * STEP_UNIT : 0;
        const eyeH2 = heightMap ? pz + EYE_BASE + jz : 0.5;
        const groundY = horizon + ((eyeH2 - zfS) * H) / camY;             // where this cell's floor meets the sprite
        const hShift = heightMap ? Math.round(((pz - zfS) * H) / camY) : 0;
        const szMul = kind === 'tree' ? 1.4 : kind === 'lamp' ? 1.1 : kind === 'rock' ? 0.72 : kind === 'bush' ? 0.62 : kind === 'flower' ? 0.42 : kind === 'exit' ? 1 : 0.55;
        const sz = kind === 'exit' ? sizeBase : Math.floor(sizeBase * szMul);
        const half = sz >> 1;
        const isGround = kind === 'tree' || kind === 'bush' || kind === 'flower' || kind === 'rock' || kind === 'lamp';
        // ground props stand ON the floor; crystals float; the exit gate sits at the horizon
        const vCenter = isGround ? Math.round(groundY) - half
          : (kind === 'exit' ? horizon : horizon + Math.floor(sizeBase * 0.18) - Math.floor(Math.sin(tick * 0.08) * sizeBase * 0.04)) + hShift;
        const lfTree = isGround ? lightAt(camY) : 1;
        const hue = (Math.floor(s.x) * 7 + Math.floor(s.y) * 13) % 5;   // flower colour variety by tile
        const sx0 = Math.max(0, screenX - half), sx1 = Math.min(W, screenX + half);
        const sy0 = Math.max(0, vCenter - half), sy1 = Math.min(H, vCenter + (kind === 'exit' ? half : 0) + 1);
        const fogT = 1 - 1 / (1 + camY * camY * 0.012);
        for (let x = sx0; x < sx1; x++) {
          const u = (x - (screenX - half)) / sz - 0.5;   // -0.5..0.5 across sprite
          for (let y = sy0; y < sy1; y++) {
            if (camY >= depth[y * W + x]) continue;       // per-pixel depth → steps/walls occlude it
            const v = (y - (vCenter - half)) / sz - 0.5;  // -0.5 top .. 0.5 bottom
            let on = false, r = 0, g = 0, b = 0, lit = false;
            if (kind === 'crystal') {                     // glowing diamond
              const dd = Math.abs(u) + Math.abs(v);
              if (dd < 0.42) { on = true; const gl = 1 - dd / 0.42; r = 120 + 135 * gl; g = 230; b = 255; }
            } else if (kind === 'tree') {                 // trunk + leafy canopy (lantern-lit, not emissive)
              if (v > 0.12 && Math.abs(u) < 0.07) { on = true; lit = true; r = 96; g = 64; b = 36; }                    // trunk
              else { const cu = u, cv = v + 0.18; const dd = Math.sqrt(cu * cu + cv * cv * 1.1); if (dd < 0.4) { on = true; lit = true; const sh = 0.7 + 0.3 * Math.sin(u * 9 + v * 9 + tick * 0.05); r = 28 * sh; g = (95 + 40 * (1 - dd / 0.4)) * sh; b = 38 * sh; } }   // canopy
            } else if (kind === 'bush') {                 // low rounded shrub
              const cu = u, cv = v - 0.16; const dd = Math.sqrt(cu * cu * 1.15 + cv * cv);
              if (dd < 0.42) { on = true; lit = true; const sh = 0.7 + 0.3 * Math.sin(u * 12 + v * 10 + tick * 0.04); r = 30 * sh; g = (88 + 46 * (1 - dd / 0.42)) * sh; b = 44 * sh; }
            } else if (kind === 'flower') {               // slender stem + a coloured bloom
              if (Math.abs(u) < 0.04 && v > -0.04) { on = true; lit = true; r = 40; g = 112; b = 52; }                  // stem
              else { const cu = u, cv = v + 0.28; const dd = Math.sqrt(cu * cu + cv * cv);
                if (dd < 0.2) { on = true; lit = true;
                  if (dd < 0.06) { r = 250; g = 220; b = 70; }                                                          // golden centre
                  else { const P = [[235, 80, 90], [235, 150, 60], [210, 90, 220], [90, 150, 240], [240, 240, 250]][hue]; r = P[0]; g = P[1]; b = P[2]; } } }
            } else if (kind === 'rock') {                 // grey boulder
              const cu = u, cv = v - 0.2; const dd = Math.sqrt(cu * cu + cv * cv * 1.3);
              if (dd < 0.44) { on = true; lit = true; const sh = 0.55 + 0.45 * (1 - dd / 0.44) + 0.07 * Math.sin(u * 16); const g0 = 120 * sh; r = g0; g = g0 + 4; b = g0 + 14; }
            } else if (kind === 'lamp') {                 // post + glowing lantern (the orb lights itself)
              if (Math.abs(u) < 0.05 && v > -0.18) { on = true; lit = true; r = 52; g = 50; b = 60; }                   // post
              else { const cu = u, cv = v + 0.34; const dd = Math.sqrt(cu * cu + cv * cv);
                if (dd < 0.17) { on = true; const gl = 0.7 + 0.3 * Math.sin(tick * 0.12); r = 255 * gl; g = 222 * gl; b = 120 * gl; } }   // emissive orb
            } else {                                       // exit — bright cyan archway/beam
              if (Math.abs(u) < 0.34 && v > -0.5) { on = true; const gl = 0.6 + 0.4 * Math.sin(tick * 0.2 + y * 0.3); r = 60 * gl; g = 230 * gl; b = 255 * gl; }
            }
            if (!on) continue;
            if (lit) { r *= lfTree; g *= lfTree; b *= lfTree; }
            const [rr, gg, bb] = fogMix(r, g, b, fogT * 0.6);
            const o = (y * W + x) * 4;
            data[o] = rr; data[o + 1] = gg; data[o + 2] = bb; data[o + 3] = 255;
          }
        }
      }

      // 4) Stalkers — dark humanoid billboards with glowing eyes, standing on their floor, depth-tested.
      const eyeH = heightMap ? pz + EYE_BASE + jz : 0.5;
      const eorder = enemies.filter(e => e.hp > 0)
        .map(e => ({ e, d: (e.x - px) ** 2 + (e.y - py) ** 2 })).sort((a, b) => b.d - a.d);
      for (const { e } of eorder) {
        const relX = e.x - px, relY = e.y - py;
        const camY = invDet * (-planeY * relX + planeX * relY);
        if (camY <= 0.05) continue;
        const camX = invDet * (sin * relX - cos * relY);
        const screenX = (W / 2) * (1 + camX / camY);
        const sizeBase = Math.abs(H / camY);
        const zfE = heightMap ? floorLvl(Math.floor(e.x), Math.floor(e.y)) * STEP_UNIT : 0;
        const groundY = horizon + ((eyeH - zfE) * H) / camY;
        const figH = sizeBase * 0.95, figW = sizeBase * 0.46;
        const top = groundY - figH, halfW = figW / 2;
        const sway = Math.sin(tick * 0.12 + e.hx) * 0.04 * (e.chasing ? 2 : 1);
        const sx0 = Math.max(0, Math.floor(screenX - halfW)), sx1 = Math.min(W, Math.ceil(screenX + halfW));
        const sy0 = Math.max(0, Math.floor(top)), sy1 = Math.min(H, Math.ceil(groundY));
        const fogT = 1 - 1 / (1 + camY * camY * 0.012);
        const lf = Math.max(lightAt(camY), 0.45);    // self-lit floor so they loom out of the dark, never vanish
        const eR = e.chasing ? 255 : 200, eG = e.chasing ? 30 : 120, eB = 30;
        for (let x = sx0; x < sx1; x++) {
          const u = (x - screenX) / figW + sway;          // -0.5..0.5 across the figure
          for (let y = sy0; y < sy1; y++) {
            if (camY > depth[y * W + x] + 0.35) continue;  // occluded only by geometry clearly IN FRONT (bias stops the floor it stands on from culling it up close)
            const v = (y - top) / figH;                    // 0 head .. 1 feet
            const bodyW = v < 0.16 ? 0.22 : v < 0.62 ? 0.5 : Math.max(0.04, 0.5 - (v - 0.62) * 0.9);
            const au = Math.abs(u);
            if (au > bodyW) continue;
            let r: number, g: number, b: number;
            if (v > 0.06 && v < 0.13 && Math.abs(au - 0.11) < 0.05) { r = eR; g = eG; b = eB; }            // glowing eyes (unfogged)
            else if (e.flash > 0) { r = 255; g = 230; b = 230; }                                          // hit flash
            else {
              const rim = Math.pow(au / Math.max(0.01, bodyW), 3);   // bright silhouette edge → reads against the dark
              let R = 26 + 95 * rim, G = 22 + 40 * rim, B = 34 + 110 * rim;
              if (e.chasing) { R += 70 * rim + 14; G -= 10 * rim; }  // angry red rim when hunting
              R *= lf; G *= lf; B *= lf;
              const m = fogMix(R, G, B, fogT * 0.45); r = m[0]; g = m[1]; b = m[2];
            }
            const o = (y * W + x) * 4; data[o] = r; data[o + 1] = g; data[o + 2] = b; data[o + 3] = 255;
          }
        }
      }

      bctx.putImageData(img, 0, 0);

      // Blit the low-res scene up to the visible canvas (crisp pixels), with a subtle damage shake.
      const sx = shake > 0.2 ? (((tick * 7) % 3) - 1) * shake : 0;
      const sy = shake > 0.2 ? (((tick * 13) % 3) - 1) * shake : 0;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(buf, sx, sy, canvas.width, canvas.height);

      // NPC billboards (your character-builder characters) — full-res overlay, feet on their floor,
      // coarsely occluded by walls via a centre depth sample. Drawn smooth (they're detailed sprites).
      if (npcs.length) {
        const S = canvas.height / H;
        const invDet = 1 / (planeX * sin - cos * planeY);
        const eyeH = heightMap ? pz + EYE_BASE + jz : 0.5;
        const ord = npcs.map((nn) => ({ nn, d: (nn.x + 0.5 - px) ** 2 + (nn.y + 0.5 - py) ** 2 })).sort((a, b) => b.d - a.d);
        ctx.imageSmoothingEnabled = true; ctx.textAlign = 'center';
        for (const { nn } of ord) {
          const relX = nn.x + 0.5 - px, relY = nn.y + 0.5 - py;
          const camY = invDet * (-planeY * relX + planeX * relY);
          if (camY <= 0.3) continue;
          const camX = invDet * (sin * relX - cos * relY);
          const scrX = (W / 2) * (1 + camX / camY);
          const zfN = heightMap ? floorLvl(nn.x, nn.y) * STEP_UNIT : 0;
          const groundY = horizon + ((eyeH - zfN) * H) / camY;
          const bx = Math.max(0, Math.min(W - 1, Math.floor(scrX)));
          const by = Math.max(0, Math.min(H - 1, Math.floor(groundY - (H / camY) * 0.4)));
          if (camY > depth[by * W + bx] + 0.3) continue;   // torso behind a wall → hide
          const figScreen = (H / camY) * 0.82 * (nn.sz ?? 1) * S;
          const drawH = figScreen / 0.6, drawW = drawH * (npcBuf.width / npcBuf.height);
          renderAppearance(nn.a, tick * 0.5);
          ctx.drawImage(npcBuf, scrX * S - drawW / 2, groundY * S - drawH * 0.84, drawW, drawH);
          const headY = groundY * S - figScreen;
          if (nn.n) { const fs = Math.max(9, Math.round(figScreen * 0.12)); ctx.font = `${fs}px monospace`; ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillText(nn.n, scrX * S + 1, headY + 1); ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fillText(nn.n, scrX * S, headY); }
          // speech — when you're close, the NPC talks (cycles its lines)
          const dist = Math.hypot(relX, relY);
          if (nn.lines && nn.lines.length && dist < 2.6) {
            const line = nn.lines[Math.floor(tick / 200) % nn.lines.length];
            if (line) {
              const fs = Math.max(11, Math.round(canvas.height * 0.018));
              ctx.font = `${fs}px monospace`; ctx.textAlign = 'center';
              const tw = ctx.measureText(line).width, padX = 10, bw = tw + padX * 2, bh = fs + 12;
              const bxc = scrX * S, byc = headY - (nn.n ? fs + 8 : 6) - bh;
              ctx.fillStyle = 'rgba(0,0,0,0.78)'; ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 1;
              ctx.beginPath(); ctx.rect(bxc - bw / 2, byc, bw, bh); ctx.fill(); ctx.stroke();
              ctx.beginPath(); ctx.moveTo(bxc - 5, byc + bh); ctx.lineTo(bxc + 5, byc + bh); ctx.lineTo(bxc, byc + bh + 7); ctx.closePath(); ctx.fill();   // tail
              ctx.fillStyle = '#fff'; ctx.fillText(line, bxc, byc + fs + 2);
            }
          }
        }
        ctx.textAlign = 'left'; ctx.imageSmoothingEnabled = false;
      }

      if (skyFx) drawWeather(skyFx);

      // Weapon viewmodel — a blade that swings when you attack (combat realms only).
      if (canFight) {
        const cw = canvas.width, ch = canvas.height, swing = atkAnim > 0 ? atkAnim / 10 : 0;
        ctx.save();
        ctx.translate(cw * 0.70, ch - cw * 0.02 + swing * ch * 0.05);
        ctx.rotate(-0.45 + swing * 0.85);
        ctx.fillStyle = '#3a2e20'; ctx.fillRect(-cw * 0.02, 0, cw * 0.04, ch * 0.12);             // hilt
        ctx.fillStyle = '#d7dde6'; ctx.fillRect(-cw * 0.013, -ch * 0.30, cw * 0.026, ch * 0.30);  // blade
        ctx.fillStyle = '#9aa3ad'; ctx.fillRect(-cw * 0.003, -ch * 0.30, cw * 0.006, ch * 0.30);  // edge highlight
        ctx.restore();
      }

      // Hazard / death vignette
      if (hp < 40 || respawn > 0) {
        const a = respawn > 0 ? Math.min(0.85, (70 - respawn) / 30) : (40 - hp) / 100;
        ctx.fillStyle = `rgba(120,0,0,${a})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      if (exited) { ctx.fillStyle = 'rgba(40,220,255,0.25)'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
      // underwater — blue murk that deepens as your air runs out
      if (submerged) {
        ctx.fillStyle = `rgba(20,80,150,${0.28 + 0.4 * (1 - breath / 100)})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      // Minimap (top-left)
      drawMinimap();
    };

    const drawMinimap = () => {
      const cell = 5, pad = 10;
      const mw = rows[0].length * cell, mh = rows.length * cell;
      ctx.save();
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(pad - 2, pad - 2, mw + 4, mh + 4);
      for (let y = 0; y < rows.length; y++)
        for (let x = 0; x < rows[y].length; x++) {
          const c = rows[y][x];
          if (c === '#' || c === '1' || c === '2' || c === '3' || c === '4') ctx.fillStyle = '#6a6a86';
          else if (c === 'L') ctx.fillStyle = '#ff5a1e';
          else if (c === '~') ctx.fillStyle = '#000';
          else if (c === 'E') ctx.fillStyle = '#1ee0ff';
          else if (c === TUNNEL_CHAR) ctx.fillStyle = '#b35cff';
          else if (c === STAIR_UP) ctx.fillStyle = '#9be07a';
          else if (c === STAIR_DOWN) ctx.fillStyle = '#3a4a66';
          else continue;
          ctx.fillRect(pad + x * cell, pad + y * cell, cell, cell);
        }
      // stalkers (red = hunting, dim = wandering)
      for (const e of enemies) {
        if (e.hp <= 0) continue;
        ctx.fillStyle = e.chasing ? '#ff2d2d' : '#a05050';
        ctx.fillRect(pad + e.x * cell - 1.5, pad + e.y * cell - 1.5, 3, 3);
      }
      // player dot + facing
      ctx.fillStyle = '#ffd400';
      ctx.fillRect(pad + px * cell - 1.5, pad + py * cell - 1.5, 3, 3);
      ctx.strokeStyle = '#ffd400'; ctx.beginPath();
      ctx.moveTo(pad + px * cell, pad + py * cell);
      ctx.lineTo(pad + px * cell + Math.cos(dir) * 6, pad + py * cell + Math.sin(dir) * 6);
      ctx.stroke();
      // storey indicator (only for multi-floor realms): which floor you're on, relative to the ground
      if (floors.length > 1) {
        const rel = fi - spawnFloor;
        const label = rel === 0 ? 'GROUND' : rel > 0 ? `FLOOR +${rel}` : `BASEMENT ${rel}`;
        ctx.globalAlpha = 1; ctx.font = 'bold 9px monospace'; ctx.textAlign = 'left';
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(pad - 2, pad + mh + 4, mw + 4, 12);
        ctx.fillStyle = '#ffd400'; ctx.fillText(label, pad + 2, pad + mh + 13);
      }
      ctx.restore();
    };

    // ── Weather overlay (full-res, drawn over the blitted scene) ─────────────────────────────────
    // Stars are a DISTANT background — only paint them where the sky is actually visible (depth = far),
    // so they don't speckle over walls/ceilings. Rain/snow/embers are foreground, drawn everywhere.
    const skyVisibleAt = (sx: number, sy: number) => {
      const bx = Math.min(RES_W - 1, Math.max(0, Math.floor((sx / canvas.width) * RES_W)));
      const by = Math.min(RES_H - 1, Math.max(0, Math.floor((sy / canvas.height) * RES_H)));
      return depth[by * RES_W + bx] > 1e8;
    };
    const drawWeather = (fx: string) => {
      const w = canvas.width, h = canvas.height, t = tick;
      if (fx === 'rain') {
        ctx.strokeStyle = 'rgba(175,195,215,0.35)'; ctx.lineWidth = 1; ctx.beginPath();
        for (let i = 0; i < 160; i++) { const xx = ((i * 97 + t * 9) % (w + 40)) - 20; const yy = ((i * 53 + t * 26) % (h + 40)) - 20; ctx.moveTo(xx, yy); ctx.lineTo(xx - 6, yy + 20); }
        ctx.stroke();
      } else if (fx === 'snow') {
        ctx.fillStyle = 'rgba(232,240,247,0.8)';
        for (let i = 0; i < 120; i++) { const xx = ((i * 131 + Math.sin(t * 0.02 + i) * 22) % (w + 20)) - 10; const yy = ((i * 71 + t * 1.6) % (h + 20)) - 10; ctx.fillRect(xx, yy, 2, 2); }
      } else if (fx === 'stars') {
        const pan = (dir / (Math.PI * 2)) * w * 2;
        for (let i = 0; i < 150; i++) { const xx = (((i * 167) - pan) % w + w) % w; const yy = (i * 89) % (h * 0.6); if (!skyVisibleAt(xx, yy)) continue; const tw = 0.5 + 0.5 * Math.sin(t * 0.05 + i); ctx.fillStyle = `rgba(255,255,255,${0.25 + 0.55 * tw})`; ctx.fillRect(xx, yy, 1.6, 1.6); }
      } else if (fx === 'embers') {
        for (let i = 0; i < 90; i++) { const xx = ((i * 149 + Math.sin(t * 0.03 + i) * 30) % w + w) % w; const yy = h - ((i * 53 + t * 2.4) % h); const a = yy / h; ctx.fillStyle = `rgba(255,${110 + 80 * Math.abs(Math.sin(i))},40,${0.55 * a})`; ctx.fillRect(xx, yy, 2, 2); }
      } else if (fx === 'mist') {
        const g = ctx.createLinearGradient(0, h * 0.25, 0, h); g.addColorStop(0, 'rgba(190,195,200,0)'); g.addColorStop(1, 'rgba(190,195,200,0.4)'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      }
    };

    // ── Stacked sim tick (real gravity, jump, walk-under-overhangs) ───────────────────────────────
    const clamp1 = (v: number) => v < -1 ? -1 : v > 1 ? 1 : v;
    const updateStacked = () => {
      tick++;
      if (atkCd > 0) atkCd--;
      if (atkAnim > 0) atkAnim--;
      if (exited) return;
      if (respawn > 0) { respawn--; if (respawn === 0) doRespawn(); return; }

      // intent
      let fwd = 0, strafe = 0, turn = 0;
      const run = keys.has('shift');
      if (keys.has('w') || keys.has('arrowup')) fwd += 1;
      if (keys.has('s') || keys.has('arrowdown')) fwd -= 1;
      if (keys.has('q')) strafe -= 1;
      if (keys.has('e')) strafe += 1;
      if (keys.has('a') || keys.has('arrowleft')) turn -= 1;
      if (keys.has('d') || keys.has('arrowright')) turn += 1;
      if (moveStick) { const dx = moveStick.x - moveStick.ox, dy = moveStick.y - moveStick.oy; fwd += clamp1(-dy / 70); strafe += clamp1(dx / 70); }
      if (turnStick) turn += clamp1((turnStick.x - turnStick.ox) / 70);
      dir += turn * TURN;

      // jump
      if ((keys.has(' ') || keys.has('spacebar') || jumpRef.current) && grounded) { vz = JUMP_V; grounded = false; }

      // horizontal move — collide against solid blocks at BODY height only, so you pass freely under
      // a slab/overhang above your head. Slide per-axis.
      const sp = run ? RUN : MOVE;
      const cos = Math.cos(dir), sin = Math.sin(dir);
      let nx = px, ny = py;
      if (fwd) { nx += cos * fwd * sp; ny += sin * fwd * sp; }
      if (strafe) { nx += -sin * strafe * sp; ny += cos * strafe * sp; }
      if (nx !== px || ny !== py) {
        const free = (x: number, y: number) => {
          const pts: [number, number][] = [[x - RADIUS, y], [x + RADIUS, y], [x, y - RADIUS], [x, y + RADIUS]];
          for (const [sx, sy] of pts) if (solidFor(Math.floor(sx), Math.floor(sy), pz)) return false;
          return true;
        };
        if (free(nx, py)) px = nx;
        if (free(px, ny)) py = ny;
        bob += sp;
      }

      // gravity, stepping & landing (real Z) — Minecraft-style. You auto-step UP a one-level ledge (so
      // raised terrain becomes walkable ramps), must JUMP a full wall to climb it, and take graduated
      // fall damage coming down. `groundZ` = the surface you left, so jumps never inflate a fall.
      const cx = Math.floor(px), cy = Math.floor(py);
      const tops = standTops(cx, cy);
      const highestUnder = (feet: number, tol: number) => { let s = -Infinity; for (const t of tops) if (t <= feet + tol && t > s) s = t; return s; };
      const fallDamage = (drop: number): boolean => {            // drop in world height → true if it killed you
        const storeys = drop / STOREY_H;                         // a one-wall (one-storey) drop is free
        if (storeys < 1.6) return false;
        hp -= Math.round((storeys - 1.5) * 34);                  // ~2 storeys: a scratch · ~3: hurts · ~4.5: lethal
        shake = Math.min(4, shake + 2); beep(120, 0.2, 'sawtooth', 0.06);
        if (hp <= 0) { hp = 0; respawn = 70; beep(150, 0.5, 'sawtooth', 0.07); return true; }
        return false;
      };
      if (grounded && vz <= 0) {
        // walking: stick to the ground, auto-stepping up/down a ledge no taller than one level
        const s = highestUnder(pz, STEP_UP);
        if (s > -Infinity && s >= pz - STEP_UP) { pz = s; groundZ = s; }
        else { grounded = false; vz -= GRAV; pz += vz; }            // walked off a ledge taller than a step → fall
      } else {
        // airborne: integrate gravity (capped at a terminal velocity so a long fall can't tunnel THROUGH
        // thin floors), bonk on ceilings, then SWEEP for the highest surface we crossed this tick.
        const pzPrev = pz;
        vz = Math.max(-0.6, vz - GRAV);
        pz += vz;
        if (vz > 0) { const head = ceilAbove(cx, cy, pz + 0.2); if (pz + 0.78 > head) { pz = head - 0.78; vz = 0; } }   // head-bonk
        let s = -Infinity;
        for (const t of tops) if (t <= pzPrev + 0.06 && pz <= t && t > s) s = t;   // were above it, have now reached it
        if (s > -Infinity) { if (vz < 0) fallDamage(groundZ - s); pz = s; vz = 0; grounded = true; groundZ = s; }
        else grounded = false;
      }
      if (!grounded && pz < -0.8 && highestUnder(pz, 0.06) === -Infinity) {   // nothing left to land on below → reset, scaled by the fall
        if (!fallDamage(groundZ - pz)) { px = spawn.x; py = spawn.y; dir = ((level.spawnDir ?? 0) * Math.PI) / 180; pz = baseZ(spawnFloor); vz = 0; grounded = true; groundZ = pz; shake = Math.min(4, shake + 2); beep(200, 0.18, 'sine', 0.05); }
      }
      // smooth the eye for stair lifts/landings, but keep jumps crisp
      if (grounded) viewZ += (pz - viewZ) * 0.4; else viewZ = pz;

      // standing-tile effects on the layer under your feet
      const pk = layerAt(pz);
      const here = cellL(pk, cx, cy);
      if (here === TUNNEL_CHAR) {                 // tunnel — warp to the next tunnel on this layer
        if (!tpLock) {
          const g = grids[pk]; const ts: { x: number; y: number }[] = [];
          for (let y = 0; y < g.length; y++) for (let x = 0; x < g[y].length; x++) if (g[y][x] === TUNNEL_CHAR) ts.push({ x: x + 0.5, y: y + 0.5 });
          if (ts.length > 1) {
            const idx = ts.findIndex(t => Math.floor(t.x) === cx && Math.floor(t.y) === cy);
            const dst = ts[(idx + 1) % ts.length]; px = dst.x; py = dst.y; tpLock = true; shake = Math.min(4, shake + 1.2);
            beep(520, 0.1, 'sine', 0.05); beep(780, 0.12, 'sine', 0.045); beep(1180, 0.14, 'sine', 0.04);
          }
        }
      } else if (here === STAIR_UP || here === STAIR_DOWN) {   // stairs — a quick lift up/down one storey
        if (!tpLock) {
          const dest = pk + (here === STAIR_UP ? 1 : -1);
          if (dest >= 0 && dest < nLayers) { pz = baseZ(dest); vz = 0; grounded = true; tpLock = true; beep(here === STAIR_UP ? 560 : 360, 0.12, 'triangle', 0.05); beep(here === STAIR_UP ? 840 : 240, 0.14, 'triangle', 0.045); }
        }
      } else { tpLock = false; }
      if (here === '~') { beep(180, 0.5, 'sawtooth', 0.06); hp = 0; respawn = 70; }   // pit
      else if (here === 'L') { hp -= LAVA_DPS; shake = Math.min(4, shake + 0.8); if (tick % 14 === 0) beep(90, 0.08, 'sawtooth', 0.04); if (hp <= 0) { hp = 0; respawn = 70; beep(150, 0.5, 'sawtooth', 0.06); } }

      // swimming
      submerged = here === 'w';
      if (submerged) { breath -= 0.38; if (tick % 50 === 0) beep(420, 0.12, 'sine', 0.025); if (breath <= 0) { breath = 0; hp -= 0.7; if (tick % 10 === 0) beep(120, 0.2, 'sawtooth', 0.05); if (hp <= 0) { hp = 0; respawn = 70; } } }
      else if (breath < 100) breath = Math.min(100, breath + 2.2);

      if (shake > 0) shake *= 0.85;

      // crystal pickups — must be on roughly the same level as the crystal
      for (const s of allSprites) {
        if (s.kind !== 'crystal' || !s.key || grabbed.has(s.key)) continue;
        if (Math.abs(s.x - px) < 0.45 && Math.abs(s.y - py) < 0.45 && Math.abs(baseZ(s.k) - pz) < 0.7) {
          grabbed.add(s.key); onRewardRef.current?.(5); beep(880, 0.12, 'triangle', 0.05); beep(1320, 0.1, 'triangle', 0.04);
        }
      }
      if (here === 'E') { exited = true; beep(660, 0.15, 'sine', 0.06); beep(990, 0.2, 'sine', 0.05); setTimeout(() => onExitRef.current?.(), 220); }

      updateEnemies();
      musicStep();
      pushHud();
    };

    // ── Stacked renderer — every layer drawn at its true height at once (overhangs, holes, depth) ──
    const drawStacked = () => {
      const W = RES_W, H = RES_H;
      const cos = Math.cos(dir), sin = Math.sin(dir);
      const planeLen = (W / H) * 0.5;
      const planeX = -sin * planeLen, planeY = cos * planeLen;
      const horizon = (H >> 1) + Math.round(pitch);
      const eye = viewZ + EYE_BASE;
      const fog = pal.fog;
      const topZ = baseZ(nLayers - 1) + STOREY_H + CEIL_GAP;   // sky/ceiling cap above the whole stack

      const fogMix = (r: number, g: number, b: number, t: number): [number, number, number] => { t = t < 0 ? 0 : t > 1 ? 1 : t; return [r + (fog[0] - r) * t, g + (fog[1] - g) * t, b + (fog[2] - b) * t]; };
      const flick = lighting && lighting.flicker ? 1 - lighting.flicker * (0.5 + 0.5 * Math.sin(tick * 0.7) * Math.sin(tick * 0.21 + 1.3)) : 1;
      const lightAt = (d: number) => { if (!lighting) return 1; const f = 1 - d / lighting.radius; return (f < lighting.ambient ? lighting.ambient : f) * flick; };
      const skyColAt = (y: number): [number, number, number] => { const t = horizon <= 0 ? 1 : Math.max(0, Math.min(1, y / horizon)); return [sky![0][0] + (sky![1][0] - sky![0][0]) * t, sky![0][1] + (sky![1][1] - sky![0][1]) * t, sky![0][2] + (sky![1][2] - sky![0][2]) * t]; };
      const fogTd = (d: number) => 1 - 1 / (1 + d * d * 0.012);
      const projF = (z: number, d: number) => horizon + ((eye - z) * H) / d;

      // surface colour for a floor/slab cell at world (fx,fy) → [r,g,b,emissive]
      const floorColor = (c: string, fx: number, fy: number): [number, number, number, boolean] => {
        if (c === 'L') { const sh = 0.6 + 0.4 * Math.sin((fx + fy) * 6 + tick * 0.25); return [255 * sh, 90 * sh + 30, 20 * sh, true]; }
        if (c === 'w') { const sh = 0.7 + 0.3 * Math.sin((fx * 3 + fy * 2) * 2 + tick * 0.12); return [20 * sh, 90 * sh, 170 * sh, true]; }
        if (c === '~') return [4, 3, 8, true];
        if (c === 'E') { const sh = 0.7 + 0.3 * Math.sin(tick * 0.18); return [30, 200 * sh, 230 * sh, true]; }
        if (c === TUNNEL_CHAR) { const sw = 0.55 + 0.45 * Math.sin((fx + fy) * 5 - tick * 0.3); return [150 * sw + 40, 40 * sw, 210 * sw + 40, true]; }
        if (c === STAIR_UP) { const st = (Math.floor(fy * 4 + fx * 4) & 1) ? 1 : 0.7; return [180 * st, 200 * st, 150 * st, true]; }
        if (c === STAIR_DOWN) { const st = (Math.floor(fy * 4 + fx * 4) & 1) ? 0.5 : 0.28; return [40 * st, 44 * st, 60 * st, true]; }
        if (c === 'g' || c === 'b' || c === 'f') { const chk = ((Math.floor(fx) + Math.floor(fy)) & 1) ? 1 : 0.88; return [46 * chk, 120 * chk, 48 * chk, false]; }
        if (c === 'p') { const gx = fx - Math.floor(fx), gy = fy - Math.floor(fy); const grout = (gx < 0.06 || gx > 0.94 || gy < 0.06 || gy > 0.94) ? 0.55 : 1; const chk = ((Math.floor(fx) + Math.floor(fy)) & 1) ? 1 : 0.9; return [150 * chk * grout, 150 * chk * grout, 162 * chk * grout, false]; }
        const chk = ((Math.floor(fx) + Math.floor(fy)) & 1) ? 1 : 0.9; return [pal.floor[0] * chk, pal.floor[1] * chk, pal.floor[2] * chk, false];
      };

      depth.fill(1e9);
      data.fill(0);

      // draw a horizontal surface (floor top or block roof) at height z over the depth slice [dA,dB]
      const drawHoriz = (x: number, c: string, z: number, dA: number, dB: number, rdx: number, rdy: number, roof: boolean) => {
        const ya = Math.floor(projF(z, dB)), yb = Math.ceil(projF(z, dA));   // far edge → near edge
        const y0 = Math.max(0, Math.min(ya, yb)), y1 = Math.min(H, Math.max(ya, yb));
        for (let y = y0; y < y1; y++) {
          const pp = y - horizon; if (pp <= 0) continue;            // floor is below the horizon
          const d = ((eye - z) * H) / pp; if (d < dA - 0.002 || d > dB + 0.002) continue;
          if (d >= depth[y * W + x]) continue;
          const fx = px + d * rdx, fy = py + d * rdy;
          let R: number, G: number, B: number;
          if (roof) { const base = pal.wall[c] ?? pal.wall['#']; const chk = ((Math.floor(fx) + Math.floor(fy)) & 1) ? 0.92 : 0.78; const ft = fogTd(d), lf = lightAt(d); [R, G, B] = fogMix(base[0] * chk, base[1] * chk, base[2] * chk, ft); R *= lf; G *= lf; B *= lf; }
          else { const [r, g, b, emis] = floorColor(c, fx, fy); if (emis) { R = r; G = g; B = b; } else { const ft = fogTd(d), lf = lightAt(d); [R, G, B] = fogMix(r, g, b, ft); R *= lf; G *= lf; B *= lf; } }
          const o = (y * W + x) * 4; data[o] = R; data[o + 1] = G; data[o + 2] = B; data[o + 3] = 255; depth[y * W + x] = d;
        }
      };
      // draw the UNDERSIDE of a slab/block above your eye over [dA,dB] — the ceiling you walk under
      const drawUnder = (x: number, c: string, z: number, dA: number, dB: number, rdx: number, rdy: number) => {
        const ya = Math.floor(projF(z, dA)), yb = Math.ceil(projF(z, dB));   // near edge → far edge (above horizon)
        const y0 = Math.max(0, Math.min(ya, yb)), y1 = Math.min(H, Math.max(ya, yb));
        for (let y = y0; y < y1; y++) {
          const pp = y - horizon; if (pp >= 0) continue;            // underside is above the horizon
          const d = ((eye - z) * H) / pp; if (d < dA - 0.002 || d > dB + 0.002) continue;
          if (d >= depth[y * W + x]) continue;
          const fx = px + d * rdx, fy = py + d * rdy;
          const [r, g, b] = floorColor(c, fx, fy); const ft = fogTd(d), lf = lightAt(d);
          const [R, G, B] = fogMix(r * 0.45, g * 0.45, b * 0.45, ft);   // a shadowed underside
          const o = (y * W + x) * 4; data[o] = R * lf; data[o + 1] = G * lf; data[o + 2] = B * lf; data[o + 3] = 255; depth[y * W + x] = d;
        }
      };

      // 1) Per-column voxel march — for each cell along the ray, draw every layer's faces.
      for (let x = 0; x < W; x++) {
        const camX = (2 * x) / W - 1;
        const rdx = cos + planeX * camX, rdy = sin + planeY * camX;
        let mapX = Math.floor(px), mapY = Math.floor(py);
        const ddx = Math.abs(1 / rdx), ddy = Math.abs(1 / rdy);
        let sideX: number, sideY: number, stepX: number, stepY: number;
        if (rdx < 0) { stepX = -1; sideX = (px - mapX) * ddx; } else { stepX = 1; sideX = (mapX + 1 - px) * ddx; }
        if (rdy < 0) { stepY = -1; sideY = (py - mapY) * ddy; } else { stepY = 1; sideY = (mapY + 1 - py) * ddy; }
        let dEnter = 0.0001, entrySide = 0;
        for (let guard = 0; guard < 80; guard++) {
          let dExit = sideX < sideY ? sideX : sideY;
          if (dExit < dEnter + 0.0001) dExit = dEnter + 0.0001;
          for (let k = 0; k < nLayers; k++) {
            const c = cellL(k, mapX, mapY);
            if (isAir(c)) continue;
            if (isWall(c)) {
              const zb = baseZ(k), zt = zb + STOREY_H;
              // near vertical face — the wall you see/bump (depth = entry distance)
              const wTopF = projF(zt, dEnter), wBotF = projF(zb, dEnter), span = Math.max(1, wBotF - wTopF);
              const base = pal.wall[c] ?? pal.wall['#'];
              const wxv = entrySide === 0 ? py + dEnter * rdy : px + dEnter * rdx, wxf = wxv - Math.floor(wxv);
              const sd = (entrySide === 1 ? 0.7 : 1) * lightAt(dEnter), ft = fogTd(dEnter);
              const wt = Math.max(0, Math.floor(wTopF)), wb = Math.min(H, Math.ceil(wBotF));
              for (let y = wt; y < wb; y++) {
                if (dEnter >= depth[y * W + x]) continue;
                const ty = (y - wTopF) / span; const off = (Math.floor(ty * 6) & 1) ? 0.5 : 0;
                const mortar = (ty * 6) % 1 < 0.09 || (((wxf + off) % 1) * 3) % 1 < 0.06 ? 0.55 : 1;
                const shade = sd * mortar * (0.8 + 0.2 * (1 - ty));
                const [r, g, bl] = fogMix(base[0] * shade, base[1] * shade, base[2] * shade, ft);
                const o = (y * W + x) * 4; data[o] = r; data[o + 1] = g; data[o + 2] = bl; data[o + 3] = 255; depth[y * W + x] = dEnter;
              }
              if (zt < eye) drawHoriz(x, c, zt, dEnter, dExit, rdx, rdy, true);   // walk on its roof
              if (zb > eye) drawUnder(x, c, zb, dEnter, dExit, rdx, rdy);          // its underside (rare)
            } else {
              const z = slabZ(k, mapX, mapY);                                      // raised terrain lifts the slab
              const zb = baseZ(k);
              if (z > zb + 0.02) {                                                 // SOLID cliff face — raised ground is a filled hill, not a floating shelf
                const fTopF = projF(z, dEnter), fBotF = projF(zb, dEnter);
                const y0 = Math.max(0, Math.floor(fTopF)), y1 = Math.min(H, Math.ceil(fBotF));
                const [cr0, cg0, cb0] = floorColor(c, px + dEnter * rdx, py + dEnter * rdy);
                const sd = (entrySide === 1 ? 0.6 : 0.82) * lightAt(dEnter), ftf = fogTd(dEnter);
                for (let y = y0; y < y1; y++) { if (dEnter >= depth[y * W + x]) continue; const [r, g, bl] = fogMix(cr0 * sd, cg0 * sd, cb0 * sd, ftf); const o = (y * W + x) * 4; data[o] = r; data[o + 1] = g; data[o + 2] = bl; data[o + 3] = 255; depth[y * W + x] = dEnter; }
              }
              if (z < eye) drawHoriz(x, c, z, dEnter, dExit, rdx, rdy, false);     // top of the raised ground (walk on it)
              else if (z > eye) drawUnder(x, c, z, dEnter, dExit, rdx, rdy);       // underside, if it's above your eye
            }
          }
          if (sideX < sideY) { sideX += ddx; mapX += stepX; entrySide = 0; } else { sideY += ddy; mapY += stepY; entrySide = 1; }
          dEnter = dExit;
          if (dEnter > 44) break;
        }

        // 2) Fill anything still open (sky if the realm has one, else the flat ceiling cap).
        for (let y = 0; y < H; y++) {
          if (depth[y * W + x] < 1e8) continue;
          const o = (y * W + x) * 4;
          if (sky) { const [sr, sg, sb] = skyColAt(y); data[o] = sr; data[o + 1] = sg; data[o + 2] = sb; data[o + 3] = 255; }
          else { const pp = horizon - y; const d = pp > 0 ? ((topZ - eye) * H) / pp : 40; const lf = lightAt(d); const [cr, cg, cb] = fogMix(pal.ceil[0], pal.ceil[1], pal.ceil[2], fogTd(d) * 0.7); data[o] = cr * lf; data[o + 1] = cg * lf; data[o + 2] = cb * lf; data[o + 3] = 255; depth[y * W + x] = d; }
        }
      }

      // 3) Sprites (crystals/exit/props) — billboard, anchored to their layer's slab, depth-tested.
      const invDet = 1 / (planeX * sin - cos * planeY);
      const order = allSprites
        .map(s => ({ s, d: (s.x - px) ** 2 + (s.y - py) ** 2 }))
        .filter(o => !(o.s.kind === 'crystal' && o.s.key && grabbed.has(o.s.key)))
        .sort((a, b) => b.d - a.d);
      for (const { s } of order) {
        const kind = s.kind;
        const relX = s.x - px, relY = s.y - py;
        const camY = invDet * (-planeY * relX + planeX * relY);
        if (camY <= 0.1) continue;
        const camX = invDet * (sin * relX - cos * relY);
        const screenX = Math.floor((W / 2) * (1 + camX / camY));
        const sizeBase = Math.abs(Math.floor(H / camY));
        const zf = baseZ(s.k);
        const groundY = horizon + ((eye - zf) * H) / camY;        // where this layer's floor meets the sprite
        const szMul = kind === 'tree' ? 1.4 : kind === 'lamp' ? 1.1 : kind === 'rock' ? 0.72 : kind === 'bush' ? 0.62 : kind === 'flower' ? 0.42 : kind === 'exit' ? 1 : 0.55;
        const sz = Math.floor(sizeBase * szMul), half = sz >> 1;
        const isGround = kind !== 'crystal';
        const vCenter = isGround ? Math.round(groundY) - half : Math.round(groundY) - Math.floor(sizeBase * 0.5) - Math.floor(Math.sin(tick * 0.08) * sizeBase * 0.04);
        const lfTree = lightAt(camY);
        const hue = (Math.floor(s.x) * 7 + Math.floor(s.y) * 13) % 5;
        const sx0 = Math.max(0, screenX - half), sx1 = Math.min(W, screenX + half);
        const sy0 = Math.max(0, vCenter - half), sy1 = Math.min(H, vCenter + half + 1);
        const fogT = 1 - 1 / (1 + camY * camY * 0.012);
        for (let x = sx0; x < sx1; x++) {
          const u = (x - (screenX - half)) / sz - 0.5;
          for (let y = sy0; y < sy1; y++) {
            if (camY >= depth[y * W + x]) continue;
            const v = (y - (vCenter - half)) / sz - 0.5;
            let on = false, r = 0, g = 0, b = 0, lit = false;
            if (kind === 'crystal') { const dd = Math.abs(u) + Math.abs(v); if (dd < 0.42) { on = true; const gl = 1 - dd / 0.42; r = 120 + 135 * gl; g = 230; b = 255; } }
            else if (kind === 'tree') { if (v > 0.12 && Math.abs(u) < 0.07) { on = true; lit = true; r = 96; g = 64; b = 36; } else { const cu = u, cv = v + 0.18; const dd = Math.sqrt(cu * cu + cv * cv * 1.1); if (dd < 0.4) { on = true; lit = true; const sh = 0.7 + 0.3 * Math.sin(u * 9 + v * 9 + tick * 0.05); r = 28 * sh; g = (95 + 40 * (1 - dd / 0.4)) * sh; b = 38 * sh; } } }
            else if (kind === 'bush') { const cu = u, cv = v - 0.16; const dd = Math.sqrt(cu * cu * 1.15 + cv * cv); if (dd < 0.42) { on = true; lit = true; const sh = 0.7 + 0.3 * Math.sin(u * 12 + v * 10 + tick * 0.04); r = 30 * sh; g = (88 + 46 * (1 - dd / 0.42)) * sh; b = 44 * sh; } }
            else if (kind === 'flower') { if (Math.abs(u) < 0.04 && v > -0.04) { on = true; lit = true; r = 40; g = 112; b = 52; } else { const cu = u, cv = v + 0.28; const dd = Math.sqrt(cu * cu + cv * cv); if (dd < 0.2) { on = true; lit = true; if (dd < 0.06) { r = 250; g = 220; b = 70; } else { const P = [[235, 80, 90], [235, 150, 60], [210, 90, 220], [90, 150, 240], [240, 240, 250]][hue]; r = P[0]; g = P[1]; b = P[2]; } } } }
            else if (kind === 'rock') { const cu = u, cv = v - 0.2; const dd = Math.sqrt(cu * cu + cv * cv * 1.3); if (dd < 0.44) { on = true; lit = true; const sh = 0.55 + 0.45 * (1 - dd / 0.44) + 0.07 * Math.sin(u * 16); const g0 = 120 * sh; r = g0; g = g0 + 4; b = g0 + 14; } }
            else if (kind === 'lamp') { if (Math.abs(u) < 0.05 && v > -0.18) { on = true; lit = true; r = 52; g = 50; b = 60; } else { const cu = u, cv = v + 0.34; const dd = Math.sqrt(cu * cu + cv * cv); if (dd < 0.17) { on = true; const gl = 0.7 + 0.3 * Math.sin(tick * 0.12); r = 255 * gl; g = 222 * gl; b = 120 * gl; } } }
            else { if (Math.abs(u) < 0.34 && v > -0.5) { on = true; const gl = 0.6 + 0.4 * Math.sin(tick * 0.2 + y * 0.3); r = 60 * gl; g = 230 * gl; b = 255 * gl; } }
            if (!on) continue;
            if (lit) { r *= lfTree; g *= lfTree; b *= lfTree; }
            const [rr, gg, bb] = fogMix(r, g, b, fogT * 0.6);
            const o = (y * W + x) * 4; data[o] = rr; data[o + 1] = gg; data[o + 2] = bb; data[o + 3] = 255;
          }
        }
      }

      // 4) Stalkers — dark billboards on their own layer, depth-tested.
      const eorder = enemies.filter(e => e.hp > 0).map(e => ({ e, d: (e.x - px) ** 2 + (e.y - py) ** 2 })).sort((a, b) => b.d - a.d);
      for (const { e } of eorder) {
        const relX = e.x - px, relY = e.y - py;
        const camY = invDet * (-planeY * relX + planeX * relY);
        if (camY <= 0.05) continue;
        const camX = invDet * (sin * relX - cos * relY);
        const screenX = (W / 2) * (1 + camX / camY);
        const sizeBase = Math.abs(H / camY);
        const zfE = baseZ(e.k ?? 0);
        const groundY = horizon + ((eye - zfE) * H) / camY;
        const figH = sizeBase * 0.95, figW = sizeBase * 0.46, top = groundY - figH;
        const sway = Math.sin(tick * 0.12 + e.hx) * 0.04 * (e.chasing ? 2 : 1);
        const sx0 = Math.max(0, Math.floor(screenX - figW / 2)), sx1 = Math.min(W, Math.ceil(screenX + figW / 2));
        const sy0 = Math.max(0, Math.floor(top)), sy1 = Math.min(H, Math.ceil(groundY));
        const fogT = 1 - 1 / (1 + camY * camY * 0.012);
        const lf = Math.max(lightAt(camY), 0.45);
        const eR = e.chasing ? 255 : 200, eG = e.chasing ? 30 : 120, eB = 30;
        for (let x = sx0; x < sx1; x++) {
          const u = (x - screenX) / figW + sway;
          for (let y = sy0; y < sy1; y++) {
            if (camY > depth[y * W + x] + 0.35) continue;
            const v = (y - top) / figH;
            const bodyW = v < 0.16 ? 0.22 : v < 0.62 ? 0.5 : Math.max(0.04, 0.5 - (v - 0.62) * 0.9);
            const au = Math.abs(u); if (au > bodyW) continue;
            let r: number, g: number, b: number;
            if (v > 0.06 && v < 0.13 && Math.abs(au - 0.11) < 0.05) { r = eR; g = eG; b = eB; }
            else if (e.flash > 0) { r = 255; g = 230; b = 230; }
            else { const rim = Math.pow(au / Math.max(0.01, bodyW), 3); let R = 26 + 95 * rim, G = 22 + 40 * rim, B = 34 + 110 * rim; if (e.chasing) { R += 70 * rim + 14; G -= 10 * rim; } R *= lf; G *= lf; B *= lf; const m = fogMix(R, G, B, fogT * 0.45); r = m[0]; g = m[1]; b = m[2]; }
            const o = (y * W + x) * 4; data[o] = r; data[o + 1] = g; data[o + 2] = b; data[o + 3] = 255;
          }
        }
      }

      bctx.putImageData(img, 0, 0);
      const shx = shake > 0.2 ? (((tick * 7) % 3) - 1) * shake : 0;
      const shy = shake > 0.2 ? (((tick * 13) % 3) - 1) * shake : 0;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(buf, shx, shy, canvas.width, canvas.height);

      // 5) NPC billboards (full-res overlay) — feet on their layer's floor.
      if (allNpcs.length) {
        const S = canvas.height / H;
        const ord = allNpcs.map(nn => ({ nn, d: (nn.x + 0.5 - px) ** 2 + (nn.y + 0.5 - py) ** 2 })).sort((a, b) => b.d - a.d);
        ctx.imageSmoothingEnabled = true; ctx.textAlign = 'center';
        for (const { nn } of ord) {
          const relX = nn.x + 0.5 - px, relY = nn.y + 0.5 - py;
          const camY = invDet * (-planeY * relX + planeX * relY);
          if (camY <= 0.3) continue;
          const camX = invDet * (sin * relX - cos * relY);
          const scrX = (W / 2) * (1 + camX / camY);
          const groundY = horizon + ((eye - baseZ(nn.k)) * H) / camY;
          const bx = Math.max(0, Math.min(W - 1, Math.floor(scrX))), by = Math.max(0, Math.min(H - 1, Math.floor(groundY - (H / camY) * 0.4)));
          if (camY > depth[by * W + bx] + 0.3) continue;
          const figScreen = (H / camY) * 0.82 * (nn.sz ?? 1) * S, drawH = figScreen / 0.6, drawW = drawH * (npcBuf.width / npcBuf.height);
          renderAppearance(nn.a, tick * 0.5);
          ctx.drawImage(npcBuf, scrX * S - drawW / 2, groundY * S - drawH * 0.84, drawW, drawH);
          const headY = groundY * S - figScreen;
          if (nn.n) { const fs = Math.max(9, Math.round(figScreen * 0.12)); ctx.font = `${fs}px monospace`; ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillText(nn.n, scrX * S + 1, headY + 1); ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fillText(nn.n, scrX * S, headY); }
          const dist = Math.hypot(relX, relY);
          if (nn.lines && nn.lines.length && dist < 2.6) {
            const line = nn.lines[Math.floor(tick / 200) % nn.lines.length];
            if (line) {
              const fs = Math.max(11, Math.round(canvas.height * 0.018)); ctx.font = `${fs}px monospace`; ctx.textAlign = 'center';
              const tw = ctx.measureText(line).width, bw = tw + 20, bh = fs + 12, bxc = scrX * S, byc = headY - (nn.n ? fs + 8 : 6) - bh;
              ctx.fillStyle = 'rgba(0,0,0,0.78)'; ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 1;
              ctx.beginPath(); ctx.rect(bxc - bw / 2, byc, bw, bh); ctx.fill(); ctx.stroke();
              ctx.beginPath(); ctx.moveTo(bxc - 5, byc + bh); ctx.lineTo(bxc + 5, byc + bh); ctx.lineTo(bxc, byc + bh + 7); ctx.closePath(); ctx.fill();
              ctx.fillStyle = '#fff'; ctx.fillText(line, bxc, byc + fs + 2);
            }
          }
        }
        ctx.textAlign = 'left'; ctx.imageSmoothingEnabled = false;
      }

      if (skyFx) drawWeather(skyFx);
      if (canFight) {
        const cw = canvas.width, ch = canvas.height, swing = atkAnim > 0 ? atkAnim / 10 : 0;
        ctx.save(); ctx.translate(cw * 0.70, ch - cw * 0.02 + swing * ch * 0.05); ctx.rotate(-0.45 + swing * 0.85);
        ctx.fillStyle = '#3a2e20'; ctx.fillRect(-cw * 0.02, 0, cw * 0.04, ch * 0.12);
        ctx.fillStyle = '#d7dde6'; ctx.fillRect(-cw * 0.013, -ch * 0.30, cw * 0.026, ch * 0.30);
        ctx.fillStyle = '#9aa3ad'; ctx.fillRect(-cw * 0.003, -ch * 0.30, cw * 0.006, ch * 0.30); ctx.restore();
      }
      if (hp < 40 || respawn > 0) { const a = respawn > 0 ? Math.min(0.85, (70 - respawn) / 30) : (40 - hp) / 100; ctx.fillStyle = `rgba(120,0,0,${a})`; ctx.fillRect(0, 0, canvas.width, canvas.height); }
      if (exited) { ctx.fillStyle = 'rgba(40,220,255,0.25)'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
      if (submerged) { ctx.fillStyle = `rgba(20,80,150,${0.28 + 0.4 * (1 - breath / 100)})`; ctx.fillRect(0, 0, canvas.width, canvas.height); }

      drawMinimapStacked();
    };

    // Minimap for stacked realms — shows the layer you're standing on + a storey label.
    const drawMinimapStacked = () => {
      const pk = layerAt(pz), g = grids[pk], cell = 5, pad = 10;
      const mw = g[0].length * cell, mh = g.length * cell;
      ctx.save(); ctx.globalAlpha = 0.8; ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(pad - 2, pad - 2, mw + 4, mh + 4);
      for (let y = 0; y < g.length; y++) for (let x = 0; x < g[y].length; x++) {
        const c = g[y][x];
        if (c === '#' || c === '1' || c === '2' || c === '3' || c === '4') ctx.fillStyle = '#6a6a86';
        else if (c === 'L') ctx.fillStyle = '#ff5a1e';
        else if (c === '~') ctx.fillStyle = '#000';
        else if (c === 'E') ctx.fillStyle = '#1ee0ff';
        else if (c === TUNNEL_CHAR) ctx.fillStyle = '#b35cff';
        else if (c === STAIR_UP) ctx.fillStyle = '#9be07a';
        else if (c === STAIR_DOWN) ctx.fillStyle = '#3a4a66';
        else if (isAir(c)) { continue; }
        else continue;
        ctx.fillRect(pad + x * cell, pad + y * cell, cell, cell);
      }
      for (const e of enemies) { if (e.hp <= 0 || (e.k ?? 0) !== pk) continue; ctx.fillStyle = e.chasing ? '#ff2d2d' : '#a05050'; ctx.fillRect(pad + e.x * cell - 1.5, pad + e.y * cell - 1.5, 3, 3); }
      ctx.fillStyle = '#ffd400'; ctx.fillRect(pad + px * cell - 1.5, pad + py * cell - 1.5, 3, 3);
      ctx.strokeStyle = '#ffd400'; ctx.beginPath(); ctx.moveTo(pad + px * cell, pad + py * cell); ctx.lineTo(pad + px * cell + Math.cos(dir) * 6, pad + py * cell + Math.sin(dir) * 6); ctx.stroke();
      const rel = pk - spawnFloor, label = rel === 0 ? 'GROUND' : rel > 0 ? `FLOOR +${rel}` : `BASEMENT ${rel}`;
      ctx.globalAlpha = 1; ctx.font = 'bold 9px monospace'; ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(pad - 2, pad + mh + 4, mw + 4, 12);
      ctx.fillStyle = '#ffd400'; ctx.fillText(label, pad + 2, pad + mh + 13);
      ctx.restore();
    };

    // ── Loop (fixed 60Hz accumulator) ───────────────────────────────────────────────────────────
    let raf = 0, last = 0, acc = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (last === 0) last = now;
      let dt = now - last; last = now;
      if (dt > 250) dt = 250;
      acc += dt;
      let n = 0;
      while (acc >= STEP && n < 5) { (stacked ? updateStacked : update)(); acc -= STEP; n++; }
      (stacked ? drawStacked : draw)();
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
      window.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('click', onClick);
      canvas.removeEventListener('pointerdown', td);
      window.removeEventListener('pointermove', tm);
      window.removeEventListener('pointerup', tu);
      window.removeEventListener('pointercancel', tu);
      if (document.pointerLockElement === canvas) document.exitPointerLock?.();
      stopAmbience();
      try { actx?.close(); } catch { /* noop */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level?.id, levelProp]);

  if (!level) {
    return (
      <div className="relative w-full h-full flex flex-col items-center justify-center bg-black text-center gap-4">
        {loadingRealm
          ? <p className="font-mono text-sm text-[#1ee0ff]/80 animate-pulse">summoning realm…</p>
          : <p className="font-mono text-sm text-white/60">That realm has collapsed — no level data.</p>}
        {!loadingRealm && <button onClick={() => onExit?.()} className="border border-white/20 text-white/70 text-xs uppercase tracking-widest px-5 py-2.5 hover:bg-white hover:text-black transition-colors">Back</button>}
      </div>
    );
  }

  return (
    <div className="relative w-full h-full select-none overflow-hidden bg-black" style={{ touchAction: 'none' }}>
      <canvas ref={canvasRef} className="absolute inset-0 block w-full h-full" style={{ cursor: isMobileStage ? 'auto' : 'crosshair' }} />

      {/* HUD */}
      <div className="absolute top-3 right-4 z-30 flex flex-col items-end gap-1.5 pointer-events-none">
        <div className="font-mono text-[11px] uppercase tracking-[0.3em] text-[#1ee0ff]">{level.name}</div>
        <div className="flex items-center gap-2">
          <div className="w-28 h-2.5 border border-white/30 bg-black/60">
            <div className="h-full bg-gradient-to-r from-brandRed to-[#ff9d3d] transition-all" style={{ width: `${hud.hp}%` }} />
          </div>
          <span className="font-mono text-[10px] text-white/70">{hud.hp}</span>
        </div>
        {hud.total > 0 && <div className="font-mono text-[11px] text-[#9beaff]">◆ {hud.crystals}/{hud.total}</div>}
        {(hud.submerged || hud.breath < 100) && (
          <div className="flex items-center gap-2">
            <div className="w-28 h-2.5 border border-[#4fb3ff]/50 bg-black/60">
              <div className="h-full bg-gradient-to-r from-[#1e6fff] to-[#7fe3ff] transition-all" style={{ width: `${hud.breath}%` }} />
            </div>
            <span className="font-mono text-[10px] text-[#9beaff]">⧗ air</span>
          </div>
        )}
      </div>

      {/* Mute / ambience toggle */}
      <button onClick={() => { const m = !muted; setMuted(m); ambToggleRef.current?.(m); }}
        className="absolute top-3 left-3 z-30 text-[12px] font-mono text-white/50 border border-white/15 bg-black/50 px-2 py-1 hover:text-white">{muted ? '♪̸' : '♪'}</button>

      {/* Mobile FIRE button (combat realms) */}
      {isMobileStage && level.combat && (
        <button onPointerDown={(e) => { e.preventDefault(); attackFnRef.current?.(); }}
          style={{ bottom: 'max(4.5rem, env(safe-area-inset-bottom))' }}
          className="absolute right-6 z-30 w-16 h-16 rounded-full border-2 border-brandRed/70 bg-brandRed/20 text-brandRed font-mono text-xs flex items-center justify-center active:bg-brandRed/40">FIRE</button>
      )}

      {/* Mobile JUMP button — climb/hop between levels in stacked realms */}
      {isMobileStage && (
        <button onPointerDown={(e) => { e.preventDefault(); jumpRef.current = true; }} onPointerUp={() => { jumpRef.current = false; }} onPointerLeave={() => { jumpRef.current = false; }}
          style={{ bottom: 'max(4.5rem, env(safe-area-inset-bottom))', right: level.combat ? '6.5rem' : '1.5rem' }}
          className="absolute z-30 w-16 h-16 rounded-full border-2 border-[#1ee0ff]/70 bg-[#1ee0ff]/20 text-[#1ee0ff] font-mono text-xs flex items-center justify-center active:bg-[#1ee0ff]/40">JUMP</button>
      )}

      {/* Controls hint */}
      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-20 text-center text-[10px] font-mono text-white/40 pointer-events-none">
        {isMobileStage ? 'left = move · right = turn · tap to jump' : `WASD move · mouse/AD turn · QE strafe · Shift run · Space jump${level.combat ? ' · click attack' : ''} · Esc exit`}
      </div>

      {hud.dead && (
        <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
          <p className="font-mono text-2xl uppercase tracking-[0.4em] text-brandRed animate-pulse">you died</p>
        </div>
      )}

      <button onClick={() => onExit?.()} style={{ bottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
        className="absolute right-3 z-30 text-[10px] font-mono text-brandYellow border border-brandYellow bg-black/60 px-3 py-1.5 hover:bg-brandYellow hover:text-black transition-all">[ EXIT ]</button>
    </div>
  );
};

export default RaycastCanvas;
