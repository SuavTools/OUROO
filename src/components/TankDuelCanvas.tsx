'use client';

// OUROO TANKS — a real-time 1v1 tank duel for the shelf (not a fork of the other games).
// Top-down tanks in a fixed symmetric maze: drive, aim, shoot, dodge. Best of 3 rounds.
//
// Netcode (no server): each client OWNS its own tank and is authoritative over its own death. You
// broadcast your tank pose + your shots; bullets fly deterministically on both screens from the "fire"
// event; the VICTIM detects the hit and reports it (so there's never an argument over who hit whom).
// The maze is identical on both sides, so simulated bullets line up. Round wins settle through the shared
// duel layer (useDuelMatch): rounds-won is the score, higher wins. Launched with no ticket → a practice
// range (drive + shoot a respawning dummy).

import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { ArcadeSynth } from '@/lib/engine/synth';
import { spawnBurst, updateParticles, drawParticles, type Particle } from '@/lib/engine/particles';
import { useDuelMatch } from '@/lib/useDuelMatch';

const W = 1280, H = 720;                 // fixed arena (scaled to fit; keeps the maze fair on any screen)
const TANK_R = 17;                       // tank collision radius
const SPEED = 3.0;                       // tank px/frame
const BSPEED = 8.5;                      // bullet px/frame
const BR = 5;                            // bullet radius
const FIRE_CD = 26;                      // frames between shots
const BLIFE = 150;                       // bullet lifetime (frames)
const MAXB = 4;                          // max simultaneous bullets per player
const WIN_ROUNDS = 2;                    // best of 3
const COUNTDOWN = 110;                   // frames before a round starts
const RESOLVE = 40;                      // frames after a death before the round tallies (catches double-KO)
const HOST_COL = '#19e0ff', GUEST_COL = '#ff3df0';

type Rect = { x: number; y: number; w: number; h: number };
// Symmetric maze (rotationally symmetric about the centre, so neither side is favoured).
const WALLS: Rect[] = (() => {
  const t = 22;                          // wall thickness
  const r: Rect[] = [
    { x: 0, y: 0, w: W, h: t }, { x: 0, y: H - t, w: W, h: t },          // top/bottom border
    { x: 0, y: 0, w: t, h: H }, { x: W - t, y: 0, w: t, h: H },          // left/right border
  ];
  // interior cover — define for the top-left quadrant, then mirror 180° to the bottom-right.
  const pieces: Rect[] = [
    { x: 250, y: 150, w: t, h: 170 },     // vertical bar
    { x: 250, y: 150, w: 150, h: t },     // its top foot (L)
    { x: 470, y: 300, w: 200, h: t },     // central horizontal slab (left half)
    { x: 150, y: 470, w: 230, h: t },     // lower-left rail
    { x: 560, y: 110, w: t, h: 130 },     // upper-mid post
  ];
  for (const p of pieces) { r.push(p); r.push({ x: W - p.x - p.w, y: H - p.y - p.h, w: p.w, h: p.h }); }
  return r;
})();
const SPAWN = { host: { x: 90, y: 360 }, guest: { x: W - 90, y: 360 } };

type Tank = { x: number; y: number; tx: number; ty: number; a: number; aim: number; alive: boolean };
type Bullet = { x: number; y: number; vx: number; vy: number; life: number; mine: boolean };

// Closest point on a rect to a circle centre → push the circle out if overlapping. Returns adjusted pos.
function resolveWall(x: number, y: number, r: number): { x: number; y: number; hit: boolean } {
  let hit = false;
  for (const w of WALLS) {
    const cx = Math.max(w.x, Math.min(x, w.x + w.w));
    const cy = Math.max(w.y, Math.min(y, w.y + w.h));
    const dx = x - cx, dy = y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 < r * r) {
      hit = true;
      const d = Math.sqrt(d2) || 0.0001;
      const push = r - d;
      x += (dx / d) * push; y += (dy / d) * push;
    }
  }
  return { x, y, hit };
}
const bulletInWall = (x: number, y: number): boolean => WALLS.some(w => x > w.x - BR && x < w.x + w.w + BR && y > w.y - BR && y < w.y + w.h + BR);

export const TankDuelCanvas: React.FC<{ stageScale?: number; isMobileStage?: boolean; onExit?: () => void }> = ({
  isMobileStage = false, onExit,
}) => {
  const duelMatch = useDuelMatch(true);
  const duelRef = useRef(duelMatch); duelRef.current = duelMatch;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const synthRef = useRef<ArcadeSynth | null>(null);
  const rafRef = useRef(0);
  const chRef = useRef<ReturnType<NonNullable<typeof supabase>['channel']> | null>(null);
  const fitRef = useRef({ s: 1, ox: 0, oy: 0 });
  const finishedRef = useRef(false);

  const ticketRef = useRef(duelMatch.ticket);
  const roleRef = useRef<'host' | 'guest'>(duelMatch.ticket?.role ?? 'host');

  const st = useRef({
    me: { x: 0, y: 0, tx: 0, ty: 0, a: 0, aim: 0, alive: true } as Tank,
    opp: { x: 0, y: 0, tx: 0, ty: 0, a: 0, aim: Math.PI, alive: true } as Tank,
    bullets: [] as Bullet[],
    parts: [] as Particle[],
    round: 1, myWins: 0, oppWins: 0,
    phase: 'countdown' as 'countdown' | 'playing' | 'resolving' | 'matchover',
    phaseT: COUNTDOWN,
    fireCd: 0, ticks: 0, sendAcc: 0,
    deadMe: false, deadOpp: false,
    dummyAlive: true, dummyT: 0, practiceHits: 0,   // practice range
  });

  // input
  const keys = useRef<Record<string, boolean>>({});
  const moveVec = useRef({ x: 0, y: 0 });        // mobile move joystick (normalized)
  const aimStage = useRef({ x: W / 2, y: H / 2 });// aim target in stage coords (desktop mouse / mobile fire touch)
  const fireHeld = useRef(false);
  const movePtr = useRef<number | null>(null);
  const firePtr = useRef<number | null>(null);
  const moveOrigin = useRef({ x: 0, y: 0 });

  const [practice, setPractice] = useState(false);
  const [hud, setHud] = useState({ my: 0, opp: 0, round: 1, phase: 'countdown' as string, count: 3 });

  const isDuel = duelMatch.isDuel;
  const myCol = () => roleRef.current === 'host' ? HOST_COL : GUEST_COL;
  const oppCol = () => roleRef.current === 'host' ? GUEST_COL : HOST_COL;
  const mySpawn = () => roleRef.current === 'host' ? SPAWN.host : SPAWN.guest;
  const oppSpawn = () => roleRef.current === 'host' ? SPAWN.guest : SPAWN.host;

  const placeForRound = () => {
    const s = st.current; const m = mySpawn(); const o = oppSpawn();
    s.me.x = s.me.tx = m.x; s.me.y = s.me.ty = m.y; s.me.alive = true; s.me.a = roleRef.current === 'host' ? 0 : Math.PI; s.me.aim = s.me.a;
    s.opp.x = s.opp.tx = o.x; s.opp.y = s.opp.ty = o.y; s.opp.alive = true; s.opp.aim = roleRef.current === 'host' ? Math.PI : 0;
    s.bullets = []; s.deadMe = false; s.deadOpp = false; s.fireCd = 0;
    aimStage.current = { x: o.x, y: o.y };   // default the turret toward the opponent (until you move the mouse/aim)
  };

  // ---- networking ----
  const sendState = () => {
    const t = ticketRef.current, ch = chRef.current; if (!t || !ch) return;
    const m = st.current.me;
    ch.send({ type: 'broadcast', event: 'st', payload: { x: +m.x.toFixed(1), y: +m.y.toFixed(1), a: +m.a.toFixed(2), aim: +m.aim.toFixed(2), alive: m.alive } });
  };
  const sendFire = (b: Bullet) => {
    chRef.current?.send({ type: 'broadcast', event: 'fire', payload: { x: +b.x.toFixed(1), y: +b.y.toFixed(1), vx: +b.vx.toFixed(2), vy: +b.vy.toFixed(2) } });
  };
  const sendDead = () => { chRef.current?.send({ type: 'broadcast', event: 'dead', payload: { round: st.current.round } }); };

  const connect = () => {
    const t = ticketRef.current; if (!t || !supabase) return;
    const ch = supabase.channel(`duel:${t.id}:tank`, { config: { broadcast: { self: false } } });
    chRef.current = ch;
    ch.on('broadcast', { event: 'st' }, ({ payload }) => {
      const p = payload as { x: number; y: number; a: number; aim: number; alive: boolean };
      const o = st.current.opp; o.tx = Number(p.x); o.ty = Number(p.y); o.a = Number(p.a); o.aim = Number(p.aim);
      if (p.alive === false) o.alive = false;
    }).on('broadcast', { event: 'fire' }, ({ payload }) => {
      const p = payload as { x: number; y: number; vx: number; vy: number };
      st.current.bullets.push({ x: Number(p.x), y: Number(p.y), vx: Number(p.vx), vy: Number(p.vy), life: BLIFE, mine: false });
      synthRef.current?.playBlaster?.();
    }).on('broadcast', { event: 'dead' }, ({ payload }) => {
      const p = payload as { round: number };
      const s = st.current;
      if (Number(p.round) !== s.round || s.deadOpp) return;
      s.deadOpp = true; s.opp.alive = false;
      spawnBurst(s.parts, s.opp.x, s.opp.y, oppCol(), { count: 30, speed: 6, life: 36 });
      synthRef.current?.playExplosion?.();
      if (s.phase === 'playing') { s.phase = 'resolving'; s.phaseT = RESOLVE; }
    }).subscribe();
  };

  // ---- round / match flow ----
  const tallyRound = () => {
    const s = st.current;
    if (s.deadMe && !s.deadOpp) s.oppWins++;
    else if (s.deadOpp && !s.deadMe) s.myWins++;
    // both dead → draw round, no score
    if (s.myWins >= WIN_ROUNDS || s.oppWins >= WIN_ROUNDS) {
      s.phase = 'matchover';
      if (!finishedRef.current) { finishedRef.current = true; duelRef.current.finish(s.myWins); }
    } else {
      s.round++;
      duelRef.current.progress(s.myWins);   // keep the settlement layer's live score in sync
      placeForRound();
      s.phase = 'countdown'; s.phaseT = COUNTDOWN;
    }
  };

  const fire = () => {
    const s = st.current;
    if (s.phase !== 'playing' || !s.me.alive) return;
    if (s.fireCd > 0 || s.bullets.filter(b => b.mine).length >= MAXB) return;
    const m = s.me; const dx = Math.cos(m.aim), dy = Math.sin(m.aim);
    s.bullets.push({ x: m.x + dx * (TANK_R + 6), y: m.y + dy * (TANK_R + 6), vx: dx * BSPEED, vy: dy * BSPEED, life: BLIFE, mine: true });
    s.fireCd = FIRE_CD;
    if (isDuel) sendFire(s.bullets[s.bullets.length - 1]);
    synthRef.current?.playBlaster?.();
  };

  useEffect(() => {
    const t = duelMatch.ticket;
    ticketRef.current = t; roleRef.current = t?.role ?? 'host';
    setPractice(!t);
    if (!synthRef.current) { try { synthRef.current = new ArcadeSynth(); } catch { /* optional */ } }
    placeForRound();
    if (t) connect();
    return () => { try { if (chRef.current && supabase) supabase.removeChannel(chRef.current); } catch { /* ignore */ } synthRef.current?.stopLoop?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- main loop ----
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false }) as CanvasRenderingContext2D; if (!ctx) return;

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(r.width)); canvas.height = Math.max(1, Math.round(r.height));
      const s = Math.min(canvas.width / W, canvas.height / H);
      fitRef.current = { s, ox: (canvas.width - W * s) / 2, oy: (canvas.height - H * s) / 2 };
    };
    resize();
    window.addEventListener('resize', resize);

    const clientToStage = (cx: number, cy: number) => {
      const r = canvas.getBoundingClientRect(); const f = fitRef.current;
      return { x: (cx - r.left - f.ox) / f.s, y: (cy - r.top - f.oy) / f.s };
    };

    const update = () => {
      const s = st.current; s.ticks++;
      if (s.fireCd > 0) s.fireCd--;

      // phase timers
      if (s.phase === 'countdown') { if (--s.phaseT <= 0) s.phase = 'playing'; }

      const playing = s.phase === 'playing' || s.phase === 'resolving';

      // ---- my tank ----
      if (s.me.alive && playing) {
        let mx = 0, my = 0;
        if (keys.current['w'] || keys.current['arrowup']) my -= 1;
        if (keys.current['s'] || keys.current['arrowdown']) my += 1;
        if (keys.current['a'] || keys.current['arrowleft']) mx -= 1;
        if (keys.current['d'] || keys.current['arrowright']) mx += 1;
        mx += moveVec.current.x; my += moveVec.current.y;
        const ml = Math.hypot(mx, my);
        if (ml > 0.15) {
          mx /= ml; my /= ml; if (ml > 1) { /* keep dir */ }
          const nx = s.me.x + mx * SPEED, ny = s.me.y + my * SPEED;
          const rx = resolveWall(nx, s.me.y, TANK_R); s.me.x = rx.x;
          const ry = resolveWall(s.me.x, ny, TANK_R); s.me.y = ry.y;
          s.me.a = Math.atan2(my, mx);
        }
        // aim toward the aim target (stage coords)
        s.me.aim = Math.atan2(aimStage.current.y - s.me.y, aimStage.current.x - s.me.x);
        if (s.phase === 'playing' && fireHeld.current) fire();
      }

      // smooth remote tank
      s.opp.x += (s.opp.tx - s.opp.x) * 0.35; s.opp.y += (s.opp.ty - s.opp.y) * 0.35;

      // ---- bullets ----
      for (let i = s.bullets.length - 1; i >= 0; i--) {
        const b = s.bullets[i];
        b.x += b.vx; b.y += b.vy; b.life--;
        if (b.life <= 0 || bulletInWall(b.x, b.y)) { spawnBurst(s.parts, b.x, b.y, b.mine ? myCol() : oppCol(), { count: 4, speed: 2, life: 10 }); s.bullets.splice(i, 1); continue; }
        if (playing) {
          // opponent's bullets can kill ME (I'm authoritative over my own death)
          if (!b.mine && s.me.alive && Math.hypot(b.x - s.me.x, b.y - s.me.y) < TANK_R + BR) {
            s.bullets.splice(i, 1); s.me.alive = false; s.deadMe = true;
            spawnBurst(s.parts, s.me.x, s.me.y, myCol(), { count: 30, speed: 6, life: 36 });
            synthRef.current?.playExplosion?.();
            if (isDuel) sendDead();
            if (s.phase === 'playing') { s.phase = 'resolving'; s.phaseT = RESOLVE; }
            continue;
          }
          // PRACTICE: my bullets pop the dummy
          if (practice && b.mine && s.dummyAlive && Math.hypot(b.x - W / 2, b.y - H / 2) < TANK_R + BR) {
            s.bullets.splice(i, 1); s.dummyAlive = false; s.dummyT = 90; s.practiceHits++;
            spawnBurst(s.parts, W / 2, H / 2, '#ffd23a', { count: 30, speed: 6, life: 36 });
            synthRef.current?.playExplosion?.();
          }
        }
      }
      updateParticles(s.parts, 0.04);

      // practice dummy respawn
      if (practice && !s.dummyAlive) { if (--s.dummyT <= 0) s.dummyAlive = true; }

      // resolving → tally
      if (s.phase === 'resolving') { if (--s.phaseT <= 0 && !practice) tallyRound(); }

      // network: stream my pose ~30/sec
      if (isDuel && ++s.sendAcc >= 2) { s.sendAcc = 0; sendState(); }

      // mirror to HUD a few times a sec
      if (s.ticks % 6 === 0) setHud({ my: s.myWins, opp: s.oppWins, round: s.round, phase: s.phase, count: Math.ceil(s.phaseT / 60) });
    };

    const drawTank = (t: Tank, col: string, dead: boolean) => {
      ctx.save(); ctx.translate(t.x, t.y);
      if (dead) {
        ctx.globalAlpha = 0.5; ctx.fillStyle = '#555'; ctx.fillRect(-TANK_R, -TANK_R, TANK_R * 2, TANK_R * 2); ctx.restore(); return;
      }
      // body
      ctx.save(); ctx.rotate(t.a);
      ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 12;
      ctx.fillRect(-TANK_R, -TANK_R + 3, TANK_R * 2, TANK_R * 2 - 6);
      ctx.fillStyle = '#0a0a12'; ctx.fillRect(-TANK_R, -TANK_R + 3, 4, TANK_R * 2 - 6); ctx.fillRect(TANK_R - 4, -TANK_R + 3, 4, TANK_R * 2 - 6);
      ctx.restore();
      // turret + barrel
      ctx.save(); ctx.rotate(t.aim);
      ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 14;
      ctx.fillRect(0, -3, TANK_R + 10, 6);
      ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fillStyle = '#0a0a12'; ctx.fill();
      ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill();
      ctx.restore();
      ctx.restore();
    };

    const draw = () => {
      const s = st.current;
      // Recompute the fit from the live CSS size every frame so the aim mapping can't drift / start wrong.
      const cw = canvas.clientWidth || canvas.width, chh = canvas.clientHeight || canvas.height;
      if (canvas.width !== cw || canvas.height !== chh) { canvas.width = cw; canvas.height = chh; }
      const sc = Math.min(cw / W, chh / H);
      const f = { s: sc, ox: (cw - W * sc) / 2, oy: (chh - H * sc) / 2 };
      fitRef.current = f;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#05060a'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(f.s, 0, 0, f.s, f.ox, f.oy);
      // playfield
      ctx.fillStyle = '#0a0c14'; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(255,255,255,0.035)'; ctx.lineWidth = 1;
      for (let x = 0; x <= W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
      for (let y = 0; y <= H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
      // walls
      for (const w of WALLS) {
        ctx.fillStyle = '#1a2030'; ctx.fillRect(w.x, w.y, w.w, w.h);
        ctx.strokeStyle = 'rgba(120,170,255,0.4)'; ctx.lineWidth = 2; ctx.strokeRect(w.x + 1, w.y + 1, w.w - 2, w.h - 2);
      }
      // bullets
      for (const b of s.bullets) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = b.mine ? myCol() : oppCol(); ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 12;
        ctx.beginPath(); ctx.arc(b.x, b.y, BR, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      }
      drawParticles(ctx, s.parts);
      // tanks
      if (practice) { if (s.dummyAlive) drawTank({ x: W / 2, y: H / 2, tx: 0, ty: 0, a: 0, aim: Math.PI, alive: true }, '#ffd23a', false); }
      else drawTank(s.opp, oppCol(), !s.opp.alive);
      drawTank(s.me, myCol(), !s.me.alive);

      // AIM: trajectory line from the barrel + a reticle at the aim point (your cursor = your aim).
      if (s.me.alive && (s.phase === 'playing' || s.phase === 'countdown')) {
        const ax = aimStage.current.x, ay = aimStage.current.y;
        const bx = s.me.x + Math.cos(s.me.aim) * (TANK_R + 10), by = s.me.y + Math.sin(s.me.aim) * (TANK_R + 10);
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = myCol(); ctx.shadowColor = myCol();
        ctx.globalAlpha = 0.22; ctx.lineWidth = 2; ctx.setLineDash([5, 11]);
        ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(ax, ay); ctx.stroke(); ctx.setLineDash([]);
        ctx.globalAlpha = 0.9; ctx.shadowBlur = 8;
        ctx.beginPath(); ctx.arc(ax, ay, 12, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(ax - 19, ay); ctx.lineTo(ax - 6, ay); ctx.moveTo(ax + 6, ay); ctx.lineTo(ax + 19, ay);
        ctx.moveTo(ax, ay - 19); ctx.lineTo(ax, ay - 6); ctx.moveTo(ax, ay + 6); ctx.lineTo(ax, ay + 19);
        ctx.stroke(); ctx.restore();
      }

      // HUD: round score
      ctx.save();
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      if (!practice) {
        ctx.font = '900 30px Helvetica, Arial, sans-serif';
        ctx.fillStyle = myCol(); ctx.fillText('●'.repeat(s.myWins) || '○', W / 2 - 60, 30);
        ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = '700 16px monospace'; ctx.fillText(`ROUND ${s.round}`, W / 2, 36);
        ctx.fillStyle = oppCol(); ctx.font = '900 30px Helvetica, Arial, sans-serif'; ctx.fillText('●'.repeat(s.oppWins) || '○', W / 2 + 60, 30);
        ctx.fillStyle = myCol(); ctx.font = '700 13px monospace'; ctx.textAlign = 'left'; ctx.fillText('YOU', 34, 30);
        ctx.fillStyle = oppCol(); ctx.textAlign = 'right'; ctx.fillText((ticketRef.current?.oppHandle ?? 'OPP').slice(0, 14).toUpperCase(), W - 34, 30);
      } else {
        ctx.fillStyle = '#ffd23a'; ctx.font = '700 16px monospace'; ctx.fillText(`PRACTICE · ${s.practiceHits} hits`, W / 2, 32);
      }
      // countdown
      if (s.phase === 'countdown') {
        const n = Math.ceil(s.phaseT / 37);
        ctx.fillStyle = '#ffffff'; ctx.font = '900 110px Helvetica, Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.globalAlpha = 0.85; ctx.fillText(n > 0 ? String(n) : 'GO', W / 2, H / 2 - 40);
      }
      ctx.restore();
    };

    let last = 0, acc = 0; const STEP = 1000 / 60;
    const loop = (now: number) => {
      rafRef.current = requestAnimationFrame(loop);
      if (!last) last = now; let dt = now - last; last = now; if (dt > 250) dt = 250; acc += dt;
      let n = 0; while (acc >= STEP && n < 5) { update(); acc -= STEP; n++; } if (n === 5) acc = 0;
      draw();
    };
    rafRef.current = requestAnimationFrame(loop);

    // ---- input ----
    const onKey = (e: KeyboardEvent, down: boolean) => {
      const k = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
      if (k === ' ') { fireHeld.current = down; if (down) fire(); return; }
      keys.current[k] = down;
    };
    const kd = (e: KeyboardEvent) => onKey(e, true); const ku = (e: KeyboardEvent) => onKey(e, false);
    const mm = (e: MouseEvent) => { aimStage.current = clientToStage(e.clientX, e.clientY); };
    const md = (e: MouseEvent) => { aimStage.current = clientToStage(e.clientX, e.clientY); fireHeld.current = true; fire(); };
    const mu = () => { fireHeld.current = false; };
    window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
    if (!isMobileStage) { window.addEventListener('mousemove', mm); window.addEventListener('mousedown', md); window.addEventListener('mouseup', mu); }

    // touch: left half = move joystick, right half = aim + fire
    const tp = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return;
      const leftZone = e.clientX < window.innerWidth * 0.5;
      if (leftZone && movePtr.current === null) { movePtr.current = e.pointerId; moveOrigin.current = { x: e.clientX, y: e.clientY }; moveVec.current = { x: 0, y: 0 }; }
      else if (!leftZone) { firePtr.current = e.pointerId; aimStage.current = clientToStage(e.clientX, e.clientY); fireHeld.current = true; fire(); }
    };
    const tm = (e: PointerEvent) => {
      if (e.pointerId === movePtr.current) {
        const dx = e.clientX - moveOrigin.current.x, dy = e.clientY - moveOrigin.current.y; const l = Math.hypot(dx, dy) || 1;
        const c = Math.min(l, 55) / 55; moveVec.current = { x: (dx / l) * c, y: (dy / l) * c };
      } else if (e.pointerId === firePtr.current) { aimStage.current = clientToStage(e.clientX, e.clientY); }
    };
    const tu = (e: PointerEvent) => {
      if (e.pointerId === movePtr.current) { movePtr.current = null; moveVec.current = { x: 0, y: 0 }; }
      if (e.pointerId === firePtr.current) { firePtr.current = null; fireHeld.current = false; }
    };
    if (isMobileStage) { window.addEventListener('pointerdown', tp); window.addEventListener('pointermove', tm); window.addEventListener('pointerup', tu); window.addEventListener('pointercancel', tu); }

    return () => {
      cancelAnimationFrame(rafRef.current); window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku);
      window.removeEventListener('mousemove', mm); window.removeEventListener('mousedown', md); window.removeEventListener('mouseup', mu);
      window.removeEventListener('pointerdown', tp); window.removeEventListener('pointermove', tm); window.removeEventListener('pointerup', tu); window.removeEventListener('pointercancel', tu);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobileStage, practice, isDuel]);

  const o = duelMatch.outcome;
  return (
    <div className="relative w-full h-full select-none overflow-hidden bg-[#05060a]" style={{ touchAction: 'none' }}>
      <canvas ref={canvasRef} className="absolute inset-0 block w-full h-full" style={{ cursor: isMobileStage ? 'auto' : 'none' }} />

      {/* control hint */}
      {hud.phase === 'countdown' && hud.round === 1 && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 text-center text-[11px] font-mono text-white/45 pointer-events-none">
          {isMobileStage ? 'left = drive · right = aim + fire' : 'WASD / arrows drive · mouse aims · click / space fires'}
        </div>
      )}

      {/* MATCH OVER — settle via the duel layer */}
      {!practice && hud.phase === 'matchover' && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black/85 backdrop-blur-sm px-6 text-center">
          {duelMatch.settling || !o ? (
            <>
              <div className="animate-pulse text-white/70 text-lg font-bold">{duelMatch.friendly ? 'Checking the result…' : 'Settling the pot…'}</div>
              <p className="text-[12px] text-white/45 mt-2">Waiting for {duelMatch.oppHandle}…</p>
            </>
          ) : (
            <>
              <p className={`text-[11px] uppercase tracking-[0.4em] mb-1 ${o.iWon ? 'text-[#1ED760]' : o.draw ? 'text-white/60' : 'text-brandRed'}`}>
                {o.iWon ? (duelMatch.friendly ? 'You win' : 'You won the pot') : o.draw ? 'Draw' : (duelMatch.friendly ? 'You lose' : 'You lost the pot')}
              </p>
              <div className="text-6xl leading-none my-1">{o.iWon ? '🏆' : o.draw ? '🤝' : '💀'}</div>
              <p className="text-sm text-white/70 mt-2">Rounds — you {o.myScore} · {duelMatch.oppHandle} {o.oppScore}</p>
              {!duelMatch.friendly && o.stakeText && (
                <p className={`mt-2 text-sm font-bold ${o.iWon ? 'text-[#1ED760]' : o.draw ? 'text-white/60' : 'text-brandRed'}`}>
                  {o.iWon ? `+ ${o.stakeText}` : o.draw ? `${o.stakeText} returned` : `− ${o.stakeText}`}
                </p>
              )}
              {o.note && <p className="text-[12px] text-white/45 mt-2">{o.note}</p>}
              {onExit && <button onClick={onExit} className="mt-6 border border-white/20 text-white/70 font-bold uppercase tracking-[0.2em] text-sm px-6 py-3 hover:bg-white hover:text-black transition-colors">Back to Plaza</button>}
            </>
          )}
        </div>
      )}

      {onExit && hud.phase !== 'matchover' && (
        <button onClick={onExit} style={{ bottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
          className="absolute right-3 z-30 text-[10px] font-mono text-white/40 border border-white/15 bg-black/50 px-2.5 py-1 hover:text-white">exit</button>
      )}
    </div>
  );
};
