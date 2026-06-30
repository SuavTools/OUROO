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
  type Level3D, paletteOf, cellAt, isWall, findSpawn, getLevel,
} from '@/lib/raycast/levels';

const STEP = 1000 / 60;            // fixed sim tick
const RES_H = 240;                 // internal vertical resolution (RES_W tracks aspect for square pixels)
const MOVE = 0.045;                // tiles per tick (walk)
const RUN = 0.085;                 // tiles per tick (run)
const TURN = 0.045;                // radians per tick (keyboard/stick turn)
const RADIUS = 0.22;               // player collision radius (tiles)
const LAVA_DPS = 0.55;             // HP drained per tick standing in lava
const MAX_HP = 100;

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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !level) return;
    const ctx = canvas.getContext('2d', { alpha: false }) as CanvasRenderingContext2D;
    if (!ctx) return;

    const rows = level.rows;
    const pal = paletteOf(level);
    const spawn = findSpawn(rows);

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

    // ── Player state ──────────────────────────────────────────────────────────────────────────
    let px = spawn.x, py = spawn.y;
    let dir = ((level.spawnDir ?? 0) * Math.PI) / 180;
    let hp = MAX_HP;
    let respawn = 0;            // >0 = dead, counting down a fade before respawn
    let exited = false;
    let tick = 0;
    let bob = 0;               // view bob phase
    let shake = 0;             // damage shake

    // ── Offscreen framebuffer (low-res, blitted up for the chunky retro look) ───────────────────
    const buf = document.createElement('canvas');
    const bctx = buf.getContext('2d', { alpha: false }) as CanvasRenderingContext2D;
    let RES_W = 0, img: ImageData, data: Uint8ClampedArray, zbuf: Float32Array;
    const setupBuffer = (aspect: number) => {
      RES_W = Math.max(120, Math.min(640, Math.round(RES_H * aspect)));
      buf.width = RES_W; buf.height = RES_H;
      img = bctx.createImageData(RES_W, RES_H);
      data = img.data;
      zbuf = new Float32Array(RES_W);
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

    // ── Input ─────────────────────────────────────────────────────────────────────────────────
    const keys = new Set<string>();
    const kd = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
      keys.add(k);
      if (k === 'escape') onExitRef.current?.();
    };
    const ku = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);

    // Mouse-look via pointer lock (desktop)
    const onClick = () => { if (!isMobileStage && document.pointerLockElement !== canvas) canvas.requestPointerLock?.(); };
    const onMouseMove = (e: MouseEvent) => { if (document.pointerLockElement === canvas) dir += e.movementX * 0.0022; };
    canvas.addEventListener('click', onClick);
    window.addEventListener('mousemove', onMouseMove);

    // Touch: left half = move stick, right half = turn stick
    type Stick = { id: number; ox: number; oy: number; x: number; y: number };
    let moveStick: Stick | null = null, turnStick: Stick | null = null;
    const td = (e: PointerEvent) => {
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

    // ── Collision: try to move to (nx,ny); slide along walls; never enter a wall cell ───────────
    const blocked = (x: number, y: number) =>
      isWall(cellAt(rows, Math.floor(x - RADIUS), Math.floor(y))) ||
      isWall(cellAt(rows, Math.floor(x + RADIUS), Math.floor(y))) ||
      isWall(cellAt(rows, Math.floor(x), Math.floor(y - RADIUS))) ||
      isWall(cellAt(rows, Math.floor(x), Math.floor(y + RADIUS)));
    const tryMove = (nx: number, ny: number) => {
      if (!blocked(nx, py)) px = nx;
      if (!blocked(px, ny)) py = ny;
    };

    const doRespawn = () => { px = spawn.x; py = spawn.y; dir = ((level.spawnDir ?? 0) * Math.PI) / 180; hp = MAX_HP; respawn = 0; };

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

      pushHud();
    };

    // ── Render ────────────────────────────────────────────────────────────────────────────────
    const draw = () => {
      const W = RES_W, H = RES_H;
      const cos = Math.cos(dir), sin = Math.sin(dir);
      const planeLen = (W / H) * 0.5;          // square pixels on any aspect
      const planeX = -sin * planeLen, planeY = cos * planeLen;
      const horizon = H >> 1;
      const fog = pal.fog;

      const fogMix = (r: number, g: number, b: number, t: number): [number, number, number] => {
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        return [r + (fog[0] - r) * t, g + (fog[1] - g) * t, b + (fog[2] - b) * t];
      };

      // 1) Floor + ceiling cast (per pixel). Left/right edge rays bound the row.
      const rdx0 = cos - planeX, rdy0 = sin - planeY;   // leftmost ray
      const rdx1 = cos + planeX, rdy1 = sin + planeY;   // rightmost ray
      for (let y = horizon + 1; y < H; y++) {
        const p = y - horizon;
        const rowDist = (0.5 * H) / p;                  // camera height 0.5
        const stepX = (rowDist * (rdx1 - rdx0)) / W;
        const stepY = (rowDist * (rdy1 - rdy0)) / W;
        let fx = px + rowDist * rdx0;
        let fy = py + rowDist * rdy0;
        const fogT = 1 - 1 / (1 + rowDist * rowDist * 0.012);
        const floorRow = y * W * 4;
        const ceilRow = (H - y - 1) * W * 4;
        for (let x = 0; x < W; x++, fx += stepX, fy += stepY) {
          const c = cellAt(rows, Math.floor(fx), Math.floor(fy));
          // floor colour by tile
          let fr: number, fg: number, fb: number;
          if (c === 'L') {                               // lava — glowing, shimmering
            const sh = 0.6 + 0.4 * Math.sin((fx + fy) * 6 + tick * 0.25);
            fr = 255 * sh; fg = 90 * sh + 30; fb = 20 * sh;
          } else if (c === '~') {                         // pit — near-black void
            fr = 4; fg = 3; fb = 8;
          } else if (c === 'E') {                         // exit — cyan pad
            const sh = 0.7 + 0.3 * Math.sin(tick * 0.18);
            fr = 30; fg = 200 * sh; fb = 230 * sh;
          } else {                                        // normal floor with a faint checker
            const chk = ((Math.floor(fx) + Math.floor(fy)) & 1) ? 1 : 0.86;
            fr = pal.floor[0] * chk; fg = pal.floor[1] * chk; fb = pal.floor[2] * chk;
          }
          const isVoid = c === '~';
          const [r, g, b] = isVoid ? [fr, fg, fb] : fogMix(fr, fg, fb, fogT);
          let o = floorRow + x * 4;
          data[o] = r; data[o + 1] = g; data[o + 2] = b; data[o + 3] = 255;
          // ceiling (mirror) — palette ceil with light fog
          const [cr, cg, cb] = fogMix(pal.ceil[0], pal.ceil[1], pal.ceil[2], fogT * 0.7);
          o = ceilRow + x * 4;
          data[o] = cr; data[o + 1] = cg; data[o + 2] = cb; data[o + 3] = 255;
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
        zbuf[x] = perp;
        const lineH = Math.min(H * 12, Math.max(1, Math.floor(H / perp)));
        let drawStart = horizon - (lineH >> 1);
        let drawEnd = drawStart + lineH;
        const top = Math.max(0, drawStart), bot = Math.min(H, drawEnd);
        // texture X (where the ray hit along the wall face)
        const wallX = (side === 0 ? py + perp * rdy : px + perp * rdx) % 1;
        const base = pal.wall[hitCh] ?? pal.wall['#'];
        const sideDark = side === 1 ? 0.7 : 1;           // N/S faces darker for depth
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
        const vCenter = kind === 'exit' ? horizon : horizon + Math.floor(sizeBase * 0.18) - Math.floor(Math.sin(tick * 0.08) * sizeBase * 0.04);
        const half = sz >> 1;
        const sx0 = Math.max(0, screenX - half), sx1 = Math.min(W, screenX + half);
        const sy0 = Math.max(0, vCenter - half), sy1 = Math.min(H, vCenter + (kind === 'exit' ? half : 0) + 1);
        const fogT = 1 - 1 / (1 + camY * camY * 0.012);
        for (let x = sx0; x < sx1; x++) {
          if (camY >= zbuf[x]) continue;                 // behind a wall
          const u = (x - (screenX - half)) / sz - 0.5;   // -0.5..0.5 across sprite
          for (let y = sy0; y < sy1; y++) {
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

      bctx.putImageData(img, 0, 0);

      // Blit the low-res scene up to the visible canvas (crisp pixels), with a subtle damage shake.
      const sx = shake > 0.2 ? (((tick * 7) % 3) - 1) * shake : 0;
      const sy = shake > 0.2 ? (((tick * 13) % 3) - 1) * shake : 0;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(buf, sx, sy, canvas.width, canvas.height);

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
      // player dot + facing
      ctx.fillStyle = '#ffd400';
      ctx.fillRect(pad + px * cell - 1.5, pad + py * cell - 1.5, 3, 3);
      ctx.strokeStyle = '#ffd400'; ctx.beginPath();
      ctx.moveTo(pad + px * cell, pad + py * cell);
      ctx.lineTo(pad + px * cell + Math.cos(dir) * 6, pad + py * cell + Math.sin(dir) * 6);
      ctx.stroke();
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

      {/* Controls hint */}
      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-20 text-center text-[10px] font-mono text-white/40 pointer-events-none">
        {isMobileStage ? 'left = move · right = turn · reach the cyan gate' : 'WASD / arrows move · A·D or mouse turn · Q·E strafe · Shift run · Esc exit'}
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
