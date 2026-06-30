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
  type Level3D, type Mood, paletteOf, lightingOf, skyOf, moodOf, cellAt, isWall, findSpawn, getLevel, heightAt, hasHeightMap, MONSTER_CHAR,
} from '@/lib/raycast/levels';

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

type Sprite = { x: number; y: number; kind: 'crystal' | 'exit' };

export const RaycastCanvas: React.FC<{
  levelId?: string;
  level?: Level3D;                 // pass a live (unsaved) level to test-play from the designer
  stageScale?: number;
  isMobileStage?: boolean;
  onExit?: () => void;            // back to the flat room
  onReward?: (n: number) => void; // crystals grabbed → economy hook (optional)
}> = ({ levelId, level: levelProp, isMobileStage = false, onExit, onReward }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const level = levelProp ?? (levelId ? getLevel(levelId) : null);

  // HUD mirror (kept tiny — only what the React overlay needs)
  const [hud, setHud] = useState({ hp: MAX_HP, crystals: 0, total: 0, dead: false, exited: false });
  const onExitRef = useRef(onExit); useEffect(() => { onExitRef.current = onExit; });
  const onRewardRef = useRef(onReward); useEffect(() => { onRewardRef.current = onReward; });
  const attackFnRef = useRef<(() => void) | null>(null);   // mobile FIRE button → the in-effect attack
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(false); useEffect(() => { mutedRef.current = muted; }, [muted]);
  const ambToggleRef = useRef<((m: boolean) => void) | null>(null);   // ♪ button → start/stop ambience

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !level) return;
    const ctx = canvas.getContext('2d', { alpha: false }) as CanvasRenderingContext2D;
    if (!ctx) return;

    const rows = level.rows;
    const pal = paletteOf(level);
    const lighting = lightingOf(level);   // lantern darkness (horror) or null for a flatly-lit world
    const skyDef = skyOf(level);          // sky gradient + weather, or null for a solid ceiling
    const sky: [[number, number, number], [number, number, number]] | null = skyDef ? [skyDef.top, skyDef.horizon] : null;
    const skyFx = skyDef?.fx;
    const mood: Mood = moodOf(level);     // ambience: spooky / tense / chill
    const canFight = !!level.combat;      // false = run-and-hide world (no weapon)
    const spawn = findSpawn(rows);
    const heightMap = hasHeightMap(level);                 // does this realm use verticality?
    const floorLvl = (x: number, y: number) => heightAt(level, x, y);
    let maxLvl = 0;
    if (heightMap) for (let y = 0; y < rows.length; y++) for (let x = 0; x < rows[y].length; x++) maxLvl = Math.max(maxLvl, floorLvl(x, y));
    const CEIL_Z = maxLvl * STEP_UNIT + CEIL_GAP;          // flat ceiling above the tallest platform

    // Collect sprites (crystals + exit gate) and count grabbables.
    const sprites: Sprite[] = [];
    for (let y = 0; y < rows.length; y++)
      for (let x = 0; x < rows[y].length; x++) {
        const c = rows[y][x];
        if (c === 'C') sprites.push({ x: x + 0.5, y: y + 0.5, kind: 'crystal' });
        else if (c === 'E') sprites.push({ x: x + 0.5, y: y + 0.5, kind: 'exit' });
      }
    const totalCrystals = sprites.filter(s => s.kind === 'crystal').length;
    const grabbed = new Set<number>();   // indices of crystals already collected

    // Hazard NPCs — stalkers that wander near home until they see you, then hunt. Spawned from 'M' cells.
    type Enemy = { x: number; y: number; hx: number; hy: number; chasing: boolean; wx: number; wy: number; wt: number; hit: number; hp: number; flash: number };
    const enemies: Enemy[] = [];
    for (let y = 0; y < rows.length; y++)
      for (let x = 0; x < rows[y].length; x++)
        if (rows[y][x] === MONSTER_CHAR)
          enemies.push({ x: x + 0.5, y: y + 0.5, hx: x + 0.5, hy: y + 0.5, chasing: false, wx: x + 0.5, wy: y + 0.5, wt: 0, hit: 0, hp: 3, flash: 0 });

    // ── Player state ──────────────────────────────────────────────────────────────────────────
    let px = spawn.x, py = spawn.y;
    let dir = ((level.spawnDir ?? 0) * Math.PI) / 180;
    let pz = floorLvl(Math.floor(px), Math.floor(py)) * STEP_UNIT;   // eased standing height
    let pitch = 0;                                                   // look up/down (screen px)
    let jz = 0, vz = 0, grounded = true;                            // jump: hop height, velocity, on-ground
    let atkCd = 0, atkAnim = 0;                                      // weapon cooldown + swing animation
    let hp = MAX_HP;
    let respawn = 0;            // >0 = dead, counting down a fade before respawn
    let exited = false;
    let tick = 0;
    let bob = 0;               // view bob phase
    let shake = 0;             // damage shake

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
        if (isWall(cellAt(rows, cx, cy))) return true;
        if (heightMap && tooTall(cx, cy, base)) return true;
      }
      return false;
    };
    const tryMove = (nx: number, ny: number) => {
      const base = floorLvl(Math.floor(px), Math.floor(py));
      if (!blocked(nx, py, base)) px = nx;
      if (!blocked(px, ny, base)) py = ny;
    };

    const doRespawn = () => { px = spawn.x; py = spawn.y; dir = ((level.spawnDir ?? 0) * Math.PI) / 180; pz = floorLvl(Math.floor(px), Math.floor(py)) * STEP_UNIT; pitch = 0; hp = MAX_HP; respawn = 0; };

    let hudHp = -1, hudCry = -1, hudDead = false;
    const pushHud = () => {
      const c = grabbed.size;
      if (hp !== hudHp || c !== hudCry || (respawn > 0) !== hudDead) {
        hudHp = hp; hudCry = c; hudDead = respawn > 0;
        setHud({ hp: Math.max(0, Math.round(hp)), crystals: c, total: totalCrystals, dead: respawn > 0, exited });
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
      if (here === '~') {                       // pit — you fall and die
        beep(180, 0.5, 'sawtooth', 0.06);
        hp = 0; respawn = 70;
      } else if (here === 'L') {                // lava — drains HP
        hp -= LAVA_DPS; shake = Math.min(4, shake + 0.8);
        if (tick % 14 === 0) beep(90, 0.08, 'sawtooth', 0.04);
        if (hp <= 0) { hp = 0; respawn = 70; beep(150, 0.5, 'sawtooth', 0.06); }
      }
      if (shake > 0) shake *= 0.85;

      // crystal pickups
      for (let i = 0; i < sprites.length; i++) {
        const s = sprites[i];
        if (s.kind !== 'crystal' || grabbed.has(i)) continue;
        if (Math.abs(s.x - px) < 0.45 && Math.abs(s.y - py) < 0.45) {
          grabbed.add(i); onRewardRef.current?.(5); beep(880, 0.12, 'triangle', 0.05); beep(1320, 0.1, 'triangle', 0.04);
        }
      }

      // exit
      if (here === 'E') { exited = true; beep(660, 0.15, 'sine', 0.06); beep(990, 0.2, 'sine', 0.05); setTimeout(() => onExitRef.current?.(), 220); }

      updateEnemies();
      // eerie sting every ~8s on spooky/tense realms (over the drone)
      if (amb && mood !== 'chill' && tick % 480 === 0) beep(mood === 'spooky' ? 300 + (tick % 5) * 50 : 140, mood === 'spooky' ? 0.6 : 0.3, 'sine', 0.03);
      pushHud();
    };

    // ── Stalker AI ──────────────────────────────────────────────────────────────────────────────
    const SIGHT = 8, E_WANDER = 0.012, E_CHASE = 0.03, E_DMG = 0.9;
    const eBlocked = (x: number, y: number) =>
      isWall(cellAt(rows, Math.floor(x), Math.floor(y))) || cellAt(rows, Math.floor(x), Math.floor(y)) === '~';
    const lineClear = (x0: number, y0: number, x1: number, y1: number) => {
      const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 4);
      for (let i = 1; i < steps; i++) {
        const t = i / steps;
        if (isWall(cellAt(rows, Math.floor(x0 + (x1 - x0) * t), Math.floor(y0 + (y1 - y0) * t)))) return false;
      }
      return true;
    };
    const updateEnemies = () => {
      for (const e of enemies) {
        if (e.hp <= 0) continue;
        if (e.hit > 0) e.hit--;
        if (e.flash > 0) e.flash--;
        const dx = px - e.x, dy = py - e.y;
        const dist = Math.hypot(dx, dy);
        const sees = dist < SIGHT && lineClear(e.x, e.y, px, py);
        if (sees) e.chasing = true; else if (dist > SIGHT * 1.6) e.chasing = false;

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
        if (!eBlocked(nx, e.y)) e.x = nx;
        if (!eBlocked(e.x, ny)) e.y = ny;

        // touch → damage (with a short cooldown so it ticks, not nukes)
        if (dist < 0.6 && e.hit === 0 && respawn === 0) {
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
          } else if (c === '~') {                         // pit — near-black void
            fr = 4; fg = 3; fb = 8; emissive = true;
          } else if (c === 'E') {                         // exit — cyan pad
            const sh = 0.7 + 0.3 * Math.sin(tick * 0.18);
            fr = 30; fg = 200 * sh; fb = 230 * sh; emissive = true;
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
              const a = Math.max(yCeil, Math.ceil(projF(curZ, dExit)));
              const b = Math.min(yFloor, Math.floor(projF(curZ, dEnter)));
              for (let y = a; y < b; y++) {
                const pp = y - horizon; if (pp <= 0) continue;
                const d = ((eye - curZ) * H) / pp;
                const fx = px + d * rdx, fy = py + d * rdy;
                let fr: number, fg: number, fb: number, emis = false;
                if (curCh === 'L') { const sh = 0.6 + 0.4 * Math.sin((fx + fy) * 6 + tick * 0.25); fr = 255 * sh; fg = 90 * sh + 30; fb = 20 * sh; emis = true; }
                else if (curCh === 'E') { const sh = 0.7 + 0.3 * Math.sin(tick * 0.18); fr = 30; fg = 200 * sh; fb = 230 * sh; emis = true; }
                else if (curCh === '~') { fr = 4; fg = 3; fb = 8; emis = true; }
                else { const chk = ((Math.floor(fx) + Math.floor(fy)) & 1) ? 1 : 0.86; fr = pal.floor[0] * chk; fg = pal.floor[1] * chk; fb = pal.floor[2] * chk; }
                let r: number, g: number, bl: number;
                if (emis) { r = fr; g = fg; bl = fb; } else { [r, g, bl] = fogMix(fr, fg, fb, fogTd(d)); const lf = lightAt(d); r *= lf; g *= lf; bl *= lf; }
                const o = (y * W + x) * 4; data[o] = r; data[o + 1] = g; data[o + 2] = bl; data[o + 3] = 255;
                depth[y * W + x] = d;
              }
              yFloor = Math.min(yFloor, a);
            }

            // ceiling / sky over [dEnter, dExit] (only visible above the horizon)
            {
              const ct = Math.max(yCeil, Math.ceil(projF(CEIL_Z, dEnter)));
              const cb = Math.min(yFloor, Math.floor(projF(CEIL_Z, dExit)));
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
              const wt = Math.max(yCeil, Math.ceil(wTopF)), wb = Math.min(yFloor, Math.floor(wBotF));
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
              const sd = (side === 1 ? 0.72 : 0.9) * lightAt(dExit);
              const ft = fogTd(dExit);
              const base = pal.wall['#'];
              const ra = Math.max(yCeil, Math.ceil(projF(zHi, dExit)));
              const rb = Math.min(yFloor, Math.floor(projF(zLo, dExit)));
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
        .filter(o => !(o.s.kind === 'crystal' && grabbed.has(o.i)))
        .sort((a, b) => b.d - a.d);
      for (const { s, kind } of order.map(o => ({ s: o.s, kind: o.s.kind }))) {
        const relX = s.x - px, relY = s.y - py;
        const camY = invDet * (-planeY * relX + planeX * relY);  // depth (forward)
        if (camY <= 0.1) continue;
        const camX = invDet * (sin * relX - cos * relY);
        const screenX = Math.floor((W / 2) * (1 + camX / camY));
        const sizeBase = Math.abs(Math.floor(H / camY));
        const sz = kind === 'exit' ? sizeBase : Math.floor(sizeBase * 0.55);
        // raise the sprite to sit on its platform when the realm has height (no-op for flat realms)
        const zfS = heightMap ? floorLvl(Math.floor(s.x), Math.floor(s.y)) * STEP_UNIT : 0;
        const hShift = heightMap ? Math.round(((pz - zfS) * H) / camY) : 0;
        const vCenter = (kind === 'exit' ? horizon : horizon + Math.floor(sizeBase * 0.18) - Math.floor(Math.sin(tick * 0.08) * sizeBase * 0.04)) + hShift;
        const half = sz >> 1;
        const sx0 = Math.max(0, screenX - half), sx1 = Math.min(W, screenX + half);
        const sy0 = Math.max(0, vCenter - half), sy1 = Math.min(H, vCenter + (kind === 'exit' ? half : 0) + 1);
        const fogT = 1 - 1 / (1 + camY * camY * 0.012);
        for (let x = sx0; x < sx1; x++) {
          const u = (x - (screenX - half)) / sz - 0.5;   // -0.5..0.5 across sprite
          for (let y = sy0; y < sy1; y++) {
            if (camY >= depth[y * W + x]) continue;       // per-pixel depth → steps/walls occlude it
            const v = (y - (vCenter - half)) / sz - 0.5;
            let on = false, r = 0, g = 0, b = 0;
            if (kind === 'crystal') {                     // glowing diamond
              const dd = Math.abs(u) + Math.abs(v);
              if (dd < 0.42) { on = true; const gl = 1 - dd / 0.42; r = 120 + 135 * gl; g = 230; b = 255; }
            } else {                                       // exit — bright cyan archway/beam
              if (Math.abs(u) < 0.34 && v > -0.5) { on = true; const gl = 0.6 + 0.4 * Math.sin(tick * 0.2 + y * 0.3); r = 60 * gl; g = 230 * gl; b = 255 * gl; }
            }
            if (!on) continue;
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
        if (camY <= 0.15) continue;
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
        const lf = lightAt(camY);
        const eR = e.chasing ? 255 : 170, eG = e.chasing ? 40 : 110, eB = 40;
        for (let x = sx0; x < sx1; x++) {
          const u = (x - screenX) / figW + sway;          // -0.5..0.5 across the figure
          for (let y = sy0; y < sy1; y++) {
            if (camY >= depth[y * W + x]) continue;        // occluded by walls/steps
            const v = (y - top) / figH;                    // 0 head .. 1 feet
            const bodyW = v < 0.16 ? 0.22 : v < 0.62 ? 0.5 : Math.max(0.04, 0.5 - (v - 0.62) * 0.9);
            if (Math.abs(u) > bodyW) continue;
            let r: number, g: number, b: number;
            if (v > 0.06 && v < 0.13 && Math.abs(Math.abs(u) - 0.11) < 0.05) { r = eR; g = eG; b = eB; }   // glowing eyes (unfogged)
            else if (e.flash > 0) { r = 255; g = 230; b = 230; }                                          // hit flash
            else { const edge = 1 - Math.abs(u) / Math.max(0.01, bodyW); r = (8 + 16 * edge) * lf; g = (6 + 12 * edge) * lf; b = (12 + 26 * edge) * lf; const m = fogMix(r, g, b, fogT * 0.7); r = m[0]; g = m[1]; b = m[2]; }
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
      ctx.restore();
    };

    // ── Weather overlay (full-res, drawn over the blitted scene) ─────────────────────────────────
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
        for (let i = 0; i < 150; i++) { const xx = (((i * 167) - pan) % w + w) % w; const yy = (i * 89) % (h * 0.55); const tw = 0.5 + 0.5 * Math.sin(t * 0.05 + i); ctx.fillStyle = `rgba(255,255,255,${0.25 + 0.55 * tw})`; ctx.fillRect(xx, yy, 1.6, 1.6); }
      } else if (fx === 'embers') {
        for (let i = 0; i < 90; i++) { const xx = ((i * 149 + Math.sin(t * 0.03 + i) * 30) % w + w) % w; const yy = h - ((i * 53 + t * 2.4) % h); const a = yy / h; ctx.fillStyle = `rgba(255,${110 + 80 * Math.abs(Math.sin(i))},40,${0.55 * a})`; ctx.fillRect(xx, yy, 2, 2); }
      } else if (fx === 'mist') {
        const g = ctx.createLinearGradient(0, h * 0.25, 0, h); g.addColorStop(0, 'rgba(190,195,200,0)'); g.addColorStop(1, 'rgba(190,195,200,0.4)'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      }
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
      while (acc >= STEP && n < 5) { update(); acc -= STEP; n++; }
      draw();
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
        <p className="font-mono text-sm text-white/60">That realm has collapsed — no level data.</p>
        <button onClick={() => onExit?.()} className="border border-white/20 text-white/70 text-xs uppercase tracking-widest px-5 py-2.5 hover:bg-white hover:text-black transition-colors">Back</button>
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
