'use client';

// OUROO DUEL — "Climb Race": a 1v1 wagered head-to-head on the LEAP engine.
// Both players run the SAME seeded crystal staircase (the duel's seed drives a deterministic RNG, so the
// course is identical on both screens — the race is pure skill, not luck). Each gets the same time budget;
// climb as high as you can. Higher score takes the pot (crystals + items both sides ante'd). A live meter
// shows your opponent's progress in real time over a `duel:<id>` broadcast channel.
//
// Stakes/escrow are handled by the challenge flow BEFORE launch (RoomCanvas escrows both antes and creates
// the duels row). This component only: plays the seeded course → reports the result → settles the row →
// credits the payout. Launched with no ticket, it runs as a free PRACTICE climb (no stakes, no network).
// See src/lib/duel.ts + supabase/migrations/..._duels.sql.

import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { drawSkinShape, skinById, getSelectedSkinId, type SkinShape } from '@/lib/skins';
import { ArcadeSynth } from '@/lib/engine/synth';
import { GRAVITY, TERMINAL_VY, JUMP_VY, AIR_JUMP_VY, COYOTE_FRAMES, JUMP_BUFFER_FRAMES } from '@/lib/engine/physics';
import { spawnBurst, updateParticles, drawParticles, type Particle } from '@/lib/engine/particles';
import {
  readTicket, clearTicket, mulberry32, reportResult, fetchDuel, voidDuel,
  creditStake, payoutMult, stakeLabel, type DuelTicket, type DuelWinner,
} from '@/lib/duel';

interface Platform { x: number; top: number; width: number; reached: boolean; level: number; }
interface Crystal { x: number; y: number; size: number; collected: boolean; pulse: number; }
interface DuelPlayer { x: number; y: number; vy: number; grounded: boolean; jumpCount: number; stretch: number; coyote: number; }
interface Star { x: number; y: number; z: number; }

const PW = 38, PH = 52;
const PLAYER_X = 360;
const BASE_SPEED = 4.0;
const MAX_SPEED = 6.5;
const CRYSTAL_SIZE = 26;
const MATCH_SECONDS = 75;                 // per-player time budget; both get the same
const MATCH_FRAMES = MATCH_SECONDS * 60;  // fixed 60Hz step → deterministic countdown
const RAINBOW_LEVEL = 10;

function accentColor(level: number, ticks: number): string {
  if (level >= RAINBOW_LEVEL) return `hsl(${(ticks * 2.2) % 360}, 90%, 62%)`;
  const hue = (195 + (level - 1) * 26) % 360;
  const sat = level <= 2 ? 100 : 88;
  return `hsl(${hue}, ${sat}%, 58%)`;
}

type Outcome = { result: DuelWinner; iWon: boolean; draw: boolean; myScore: number; oppScore: number; label: string };

export const DuelClimbCanvas: React.FC<{ stageScale?: number; isMobileStage?: boolean; onExit?: () => void }> = ({
  stageScale = 1, isMobileStage = false, onExit,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const synthRef = useRef<ArcadeSynth | null>(null);
  const rafRef = useRef<number>(0);
  const endedRef = useRef(false);
  const skinRef = useRef<{ shape: SkinShape; color: string }>({ shape: 'diamond', color: '#ffe65c' });

  // Duel context (null = practice). Read once on mount so it survives the world unmount.
  const ticketRef = useRef<DuelTicket | null>(null);
  const channelRef = useRef<ReturnType<NonNullable<typeof supabase>['channel']> | null>(null);
  const oppScoreRef = useRef(0);          // opponent's live score (from their ticks)
  const oppDoneRef = useRef<number | null>(null);   // opponent's final score, once they finish
  const sawOppRef = useRef(false);        // did we ever hear from the opponent? (forfeit detection)
  const settledRef = useRef(false);       // guard: credit the payout exactly once

  const stateRef = useRef({
    player: { x: PLAYER_X, y: 300, vy: 0, grounded: true, jumpCount: 0, stretch: 1, coyote: 0 } as DuelPlayer,
    platforms: [] as Platform[],
    crystals: [] as Crystal[],
    particles: [] as Particle[],
    stars: [] as Star[],
    rng: Math.random as () => number,    // replaced with a seeded RNG in resetGame
    worldSpeed: BASE_SPEED,
    level: 1, genLevel: 0, cursorX: 0, cursorY: 0,
    gameTicks: 0, framesLeft: MATCH_FRAMES, jumpBuffer: 0,
    bonus: 0, dist: 0, combo: 0, comboBest: 0, curScore: 0,
    bannerText: '', bannerLife: 0, oppPing: 0,
  });

  const [practice, setPractice] = useState(false);
  const [friendly, setFriendly] = useState(false);
  const [oppHandle, setOppHandle] = useState('Opponent');
  const [stakeText, setStakeText] = useState('');
  const [showIntro, setShowIntro] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [finished, setFinished] = useState(false);
  const [finalScore, setFinalScore] = useState(0);
  const [hudLevel, setHudLevel] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [settling, setSettling] = useState(false);   // waiting on the opponent + row settlement
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [settleNote, setSettleNote] = useState('');

  useEffect(() => {
    const t = readTicket();
    ticketRef.current = t;
    if (t) { setOppHandle(t.oppHandle); setFriendly(t.friendly); setStakeText(t.stake ? stakeLabel(t.stake) : ''); setPractice(false); }
    else setPractice(true);
    refreshSkin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshSkin = () => { const s = skinById(getSelectedSkinId()); skinRef.current = { shape: s.shape, color: s.color }; };

  const reachUp = (T: number, impulse: number) => Math.max(0, Math.abs(impulse) * T - 0.5 * GRAVITY * T * T);

  // ---- procedural generation (seeded): a crystal pattern, then a landing platform ----
  const genSegment = (canvas: HTMLCanvasElement, st: typeof stateRef.current) => {
    const rng = st.rng;
    const g = st.genLevel;
    const bandTop = 110;
    const bandBot = canvas.height - 170;
    const ws = st.worldSpeed;
    const steps = 2 + Math.min(5, Math.floor(g / 2));

    const menu = ['ascend', 'arc'];
    if (g >= 2) menu.push('valley', 'flat');
    if (g >= 4) menu.push('zigzag', 'descend');
    const pat = menu[Math.floor(rng() * menu.length)];
    const kindOf = (i: number): 'up' | 'down' | 'flat' => {
      switch (pat) {
        case 'ascend':  return 'up';
        case 'descend': return 'down';
        case 'arc':     return i < steps / 2 ? 'up' : 'down';
        case 'valley':  return i < steps / 2 ? 'down' : 'up';
        case 'zigzag':  return i % 2 === 0 ? 'up' : 'down';
        default:        return 'flat';
      }
    };

    const reactT = 24 + (ws - BASE_SPEED) * 3;
    const upFrac = 0.5 + Math.min(0.28, g * 0.035);
    const dropAmt = 46 + Math.min(110, g * 14);

    for (let i = 0; i < steps; i++) {
      const kind = kindOf(i);
      const impulse = i === 0 ? JUMP_VY : AIR_JUMP_VY;
      let T = reactT * (0.92 + rng() * 0.2);
      if (kind === 'up') T = Math.min(T, 24);
      let dy: number;
      if (kind === 'up')        dy = -reachUp(T, impulse) * upFrac * (0.85 + rng() * 0.3);
      else if (kind === 'down') dy =  dropAmt * (0.6 + rng() * 0.7);
      else                      dy = (rng() * 2 - 1) * 16;
      st.cursorX += ws * T;
      st.cursorY = Math.max(bandTop, Math.min(bandBot, st.cursorY + dy));
      st.crystals.push({ x: st.cursorX, y: st.cursorY, size: CRYSTAL_SIZE, collected: false, pulse: rng() * Math.PI * 2 });
    }

    const Tp = reactT;
    const pdy = (pat === 'valley' || pat === 'descend')
      ? -reachUp(Tp, AIR_JUMP_VY) * 0.55
      : 20 + rng() * 55;
    st.cursorX += ws * Tp;
    const top = Math.max(bandTop + 40, Math.min(bandBot + 70, st.cursorY + pdy));
    const width = Math.max(150, 300 - g * 12);
    st.genLevel = g + 1;
    st.platforms.push({ x: st.cursorX, top, width, reached: false, level: st.genLevel });
    st.cursorX += width;
    st.cursorY = top;
  };

  const ensureAhead = (canvas: HTMLCanvasElement, st: typeof stateRef.current) => {
    let guard = 0;
    while (st.cursorX < canvas.width + 260 && guard++ < 40) genSegment(canvas, st);
  };

  const resetGame = (canvas: HTMLCanvasElement) => {
    canvas.width = canvas.clientWidth || window.innerWidth;
    canvas.height = canvas.clientHeight || window.innerHeight;
    const st = stateRef.current;
    // Seeded RNG: identical course on both clients. Practice uses a fresh random seed.
    const seed = ticketRef.current ? ticketRef.current.seed : (Math.floor(Math.random() * 0xffffffff) >>> 0);
    st.rng = mulberry32(seed);
    st.platforms = []; st.crystals = []; st.particles = [];
    st.worldSpeed = BASE_SPEED; st.level = 1; st.genLevel = 0;
    st.gameTicks = 0; st.framesLeft = MATCH_FRAMES; st.jumpBuffer = 0;
    st.bonus = 0; st.curScore = 0; st.bannerLife = 0; st.dist = 0; st.combo = 0; st.comboBest = 0;

    const startTop = canvas.height * 0.62;
    const start: Platform = { x: PLAYER_X - 240, top: startTop, width: 560, reached: true, level: 1 };
    st.platforms.push(start);
    st.player = { x: PLAYER_X, y: startTop - PH, vy: 0, grounded: true, jumpCount: 0, stretch: 1, coyote: 0 };
    st.cursorX = start.x + start.width;
    st.cursorY = startTop;

    // Stars are cosmetic only → plain Math.random is fine (never affects the score).
    st.stars = [];
    for (let i = 0; i < 70; i++) st.stars.push({ x: Math.random() * canvas.width, y: Math.random() * canvas.height, z: 0.2 + Math.random() * 0.9 });
    ensureAhead(canvas, st);
    setHudLevel(1);
  };

  const groundJump = (st: typeof stateRef.current) => {
    const p = st.player;
    p.vy = JUMP_VY; p.grounded = false; p.coyote = 0; p.jumpCount = 1; p.stretch = 1.35;
    synthRef.current?.playJump();
  };

  const doJump = () => {
    const st = stateRef.current;
    const p = st.player;
    if (p.grounded || p.coyote > 0) groundJump(st);
    else if (p.jumpCount < 2) { p.vy = AIR_JUMP_VY; p.jumpCount++; p.stretch = 1.45; synthRef.current?.playJump(); }
    else st.jumpBuffer = JUMP_BUFFER_FRAMES * 2;
  };
  const doJumpRef = useRef(doJump);
  doJumpRef.current = doJump;

  // ---- live opponent channel ----
  const sendTick = (() => {
    let acc = 0;
    return (score: number, lvl: number) => {
      const t = ticketRef.current, ch = channelRef.current;
      if (!t || !ch) return;
      if (++acc < 10) return;        // ~6/sec at 60Hz
      acc = 0;
      ch.send({ type: 'broadcast', event: 'tick', payload: { role: t.role, score, lvl } });
    };
  })();

  const connectDuelChannel = () => {
    const t = ticketRef.current;
    if (!t || !supabase) return;
    const ch = supabase.channel(`duel:${t.id}`, { config: { broadcast: { self: false } } });
    channelRef.current = ch;
    ch.on('broadcast', { event: 'tick' }, ({ payload }) => {
      const p = payload as { role?: string; score?: number };
      if (!p || p.role === t.role) return;
      sawOppRef.current = true;
      oppScoreRef.current = Math.max(oppScoreRef.current, Number(p.score) || 0);
      stateRef.current.oppPing = 18;
    }).on('broadcast', { event: 'done' }, ({ payload }) => {
      const p = payload as { role?: string; score?: number };
      if (!p || p.role === t.role) return;
      sawOppRef.current = true;
      oppDoneRef.current = Number(p.score) || 0;
      oppScoreRef.current = Math.max(oppScoreRef.current, oppDoneRef.current);
    }).subscribe();
  };

  const startGame = () => {
    refreshSkin();
    if (!synthRef.current) { try { synthRef.current = new ArcadeSynth(); } catch { /* audio optional */ } }
    synthRef.current?.setMuted(isMuted);
    synthRef.current?.setIntensity(3);
    synthRef.current?.startLoop();
    if (!channelRef.current) connectDuelChannel();
    const canvas = canvasRef.current;
    if (canvas) resetGame(canvas);
    endedRef.current = false;
    settledRef.current = false;
    setOutcome(null); setSettleNote(''); setSettling(false);
    setFinished(false); setShowIntro(false); setIsPlaying(true);
  };

  const toggleMute = () => { setIsMuted(m => { const nv = !m; synthRef.current?.setMuted(nv); return nv; }); };

  // ---- friendly resolution: no stakes — just exchange final scores over the channel and show the winner ----
  const resolveFriendly = async (myScore: number) => {
    const t = ticketRef.current;
    if (!t) return;
    setSettling(true);
    try { channelRef.current?.send({ type: 'broadcast', event: 'done', payload: { role: t.role, score: myScore } }); } catch { /* ignore */ }
    const show = (oppScore: number, note = '') => {
      if (settledRef.current) return;
      settledRef.current = true;
      const iWon = myScore > oppScore, draw = myScore === oppScore;
      setOutcome({ result: iWon ? t.role : draw ? 'draw' : (t.role === 'host' ? 'guest' : 'host'), iWon, draw, myScore, oppScore, label: '' });
      if (note) setSettleNote(note);
      setSettling(false);
      synthRef.current?.stopLoop();
      if (iWon) synthRef.current?.playCombo(6); else if (!draw) synthRef.current?.playHurt();
    };
    if (oppDoneRef.current != null) { show(oppDoneRef.current); return; }
    for (let i = 0; i < 24 && !settledRef.current; i++) {     // ~24s grace for the opponent to finish
      await new Promise(r => setTimeout(r, 1000));
      if (oppDoneRef.current != null) { show(oppDoneRef.current); return; }
      if (i === 2) setSettleNote(`Waiting for ${t.oppHandle} to finish…`);
    }
    if (!settledRef.current) show(oppScoreRef.current, `${t.oppHandle} didn't finish.`);
  };

  // ---- wager settlement: report my score, wait for the opponent, credit the pot exactly once ----
  const settleDuel = async (myScore: number) => {
    const t = ticketRef.current;
    const stake = t?.stake;
    if (!t || !stake) return;   // practice / friendly: handled elsewhere
    setSettling(true);
    // Tell the opponent I'm done (so their client can settle without waiting on a poll).
    try { channelRef.current?.send({ type: 'broadcast', event: 'done', payload: { role: t.role, score: myScore } }); } catch { /* ignore */ }

    const credit = (winner: DuelWinner, oppScore: number) => {
      if (settledRef.current) return;
      settledRef.current = true;
      const mult = payoutMult(t.role, winner);
      creditStake(stake, mult);
      const iWon = winner !== 'draw' && winner === t.role;
      const draw = winner === 'draw';
      setOutcome({ result: winner, iWon, draw, myScore, oppScore, label: stakeLabel(stake) });
      setSettling(false);
      synthRef.current?.stopLoop();
      if (iWon) synthRef.current?.playCombo(6); else if (!draw) synthRef.current?.playHurt();
    };

    // First attempt: write my result; if the opponent already reported, this returns the settled row.
    let row = await reportResult(t.id, t.role, myScore).catch(() => null);
    if (row?.state === 'settled' && row.winner) { credit(row.winner, t.role === 'host' ? (row.guest_result ?? 0) : (row.host_result ?? 0)); return; }

    // Otherwise poll for settlement (the opponent finishing flips the row). Bounded wait.
    for (let i = 0; i < 18 && !settledRef.current; i++) {       // ~27s
      await new Promise(r => setTimeout(r, 1500));
      row = await fetchDuel(t.id).catch(() => null);
      if (row?.state === 'settled' && row.winner) { credit(row.winner, t.role === 'host' ? (row.guest_result ?? 0) : (row.host_result ?? 0)); return; }
      if (row?.state === 'void') { if (!settledRef.current) { settledRef.current = true; creditStake(stake, 1); setOutcome({ result: 'draw', iWon: false, draw: true, myScore, oppScore: oppScoreRef.current, label: stakeLabel(stake) }); setSettleNote('Duel voided — your ante was refunded.'); setSettling(false); synthRef.current?.stopLoop(); } return; }
      if (i === 2) setSettleNote(`Waiting for ${t.oppHandle} to finish…`);
    }

    // Timed out waiting on the opponent → void + refund my ante (forfeit-safe).
    if (!settledRef.current) {
      settledRef.current = true;
      await voidDuel(t.id).catch(() => {});
      creditStake(stake, 1);
      setOutcome({ result: 'draw', iWon: false, draw: true, myScore, oppScore: oppScoreRef.current, label: stakeLabel(stake) });
      setSettleNote(`${t.oppHandle} didn't finish — your ante was refunded.`);
      setSettling(false);
      synthRef.current?.stopLoop();
    }
  };

  // ---- main loop ----
  useEffect(() => {
    if (!isPlaying) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false }) as CanvasRenderingContext2D;
    if (!ctx) return;

    const resize = () => { canvas.width = canvas.clientWidth || window.innerWidth; canvas.height = canvas.clientHeight || window.innerHeight; };
    resize();
    window.addEventListener('resize', resize);

    const endRun = () => {
      if (endedRef.current) return;
      endedRef.current = true;
      const st = stateRef.current;
      synthRef.current?.playHurt();
      const score = st.curScore;
      setFinalScore(score);
      setIsPlaying(false);
      setFinished(true);
      if (practice) synthRef.current?.stopLoop();
      else if (ticketRef.current?.friendly) void resolveFriendly(score);
      else void settleDuel(score);
    };

    const update = () => {
      const st = stateRef.current;
      const p = st.player;
      st.gameTicks++;
      if (st.oppPing > 0) st.oppPing--;
      if (st.bannerLife > 0) st.bannerLife--;

      // Match timer (skip in practice → endless until death).
      if (!practice) { st.framesLeft--; if (st.framesLeft <= 0) { st.framesLeft = 0; endRun(); return; } }

      const ws = st.worldSpeed;
      for (const pl of st.platforms) pl.x -= ws;
      for (const c of st.crystals) c.x -= ws;
      st.cursorX -= ws;
      for (const s of st.stars) { s.x -= ws * s.z * 0.6; if (s.x < -2) { s.x = canvas.width + 2; s.y = Math.random() * canvas.height; } }
      st.platforms = st.platforms.filter(pl => pl.x + pl.width > -60);
      st.crystals = st.crystals.filter(c => c.x + c.size > -40);
      ensureAhead(canvas, st);

      p.vy = Math.min(p.vy + GRAVITY, TERMINAL_VY);
      p.y += p.vy;
      p.stretch += (1 - p.stretch) * 0.2;

      const wasGrounded = p.grounded;
      p.grounded = false;
      const feetY = p.y + PH;
      for (const pl of st.platforms) {
        if (p.vy < -4) continue;
        if (p.x + PW > pl.x && p.x < pl.x + pl.width && feetY >= pl.top - 8 && feetY <= pl.top + Math.max(26, p.vy + 6)) {
          p.y = pl.top - PH; p.vy = 0; p.grounded = true; p.jumpCount = 0;
          if (!pl.reached) {
            pl.reached = true;
            st.level++;
            st.worldSpeed = Math.min(MAX_SPEED, BASE_SPEED + (st.level - 1) * 0.2);
            st.bonus += 250 * st.level;
            st.bannerText = `LEVEL ${st.level}`;
            st.bannerLife = 80;
            synthRef.current?.playCombo(Math.min(st.level, 6));
            spawnBurst(st.particles, p.x + PW / 2, pl.top, accentColor(st.level, st.gameTicks), { count: 16, speed: 4, angle: -Math.PI / 2, spread: Math.PI, life: 30 });
            setHudLevel(st.level);
          }
          break;
        }
      }
      if (wasGrounded && !p.grounded) p.coyote = COYOTE_FRAMES;
      else if (!p.grounded && p.coyote > 0) p.coyote--;

      const pcx = p.x + PW / 2, pcy = p.y + PH / 2;
      for (const c of st.crystals) {
        if (c.collected) continue;
        const ccx = c.x + c.size / 2, ccy = c.y + c.size / 2;
        if (Math.abs(pcx - ccx) < PW / 2 + c.size * 0.7 && Math.abs(pcy - ccy) < PH / 2 + c.size * 0.7) {
          c.collected = true;
          if (!p.grounded) { p.jumpCount = Math.min(p.jumpCount, 1); p.stretch = 1.3; }
          st.combo++;
          if (st.combo > st.comboBest) st.comboBest = st.combo;
          const mult = 1 + Math.floor(st.combo / 5);
          st.bonus += 50 * mult;
          spawnBurst(st.particles, c.x + c.size / 2, c.y + c.size / 2, '#ffe65c', { count: 9, speed: 3, life: 24 });
          synthRef.current?.playCrystal();
          synthRef.current?.setIntensity(Math.min(15, Math.floor(st.combo / 3)));
        }
      }

      if (st.jumpBuffer > 0) {
        st.jumpBuffer--;
        if (p.grounded || p.coyote > 0) { groundJump(st); st.jumpBuffer = 0; }
        else if (p.jumpCount < 2) { p.vy = AIR_JUMP_VY; p.jumpCount++; p.stretch = 1.45; synthRef.current?.playJump(); st.jumpBuffer = 0; }
      }

      st.dist += st.worldSpeed;
      st.curScore = st.bonus + Math.floor(st.dist / 8);
      sendTick(st.curScore, st.level);
      updateParticles(st.particles, 0.18);

      if (p.y > canvas.height + 60) endRun();
    };

    const draw = () => {
      const st = stateRef.current;
      const w = canvas.width, h = canvas.height;
      const accent = accentColor(st.level, st.gameTicks);
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#0a0a12'); g.addColorStop(1, '#13060d');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      ctx.save();
      ctx.globalAlpha = 0.04 + Math.min(0.10, st.level * 0.011);
      ctx.fillStyle = accent; ctx.fillRect(0, 0, w, h);
      ctx.restore();

      ctx.save();
      for (const s of st.stars) { ctx.globalAlpha = 0.12 + s.z * 0.4; ctx.fillStyle = '#ffffff'; ctx.fillRect(s.x, s.y, s.z * 2, s.z * 2); }
      ctx.restore();

      for (const pl of st.platforms) {
        ctx.fillStyle = '#1b1b28';
        ctx.fillRect(pl.x, pl.top, pl.width, h - pl.top + 40);
        ctx.fillStyle = accent;
        ctx.fillRect(pl.x, pl.top, pl.width, 5);
        ctx.save(); ctx.globalAlpha = 0.25; ctx.shadowColor = accent; ctx.shadowBlur = 14;
        ctx.fillRect(pl.x, pl.top, pl.width, 5); ctx.restore();
      }

      for (const c of st.crystals) {
        if (c.collected) continue;
        const fy = Math.sin(st.gameTicks * 0.12 + c.pulse) * 6;
        ctx.save();
        ctx.translate(c.x + c.size / 2, c.y + c.size / 2 + fy);
        ctx.rotate(st.gameTicks * 0.035);
        ctx.shadowColor = '#ffd700'; ctx.shadowBlur = 20;
        ctx.fillStyle = '#ffd23a';
        ctx.beginPath(); ctx.moveTo(0, -c.size * 0.7); ctx.lineTo(c.size * 0.5, 0); ctx.lineTo(0, c.size * 0.7); ctx.lineTo(-c.size * 0.5, 0); ctx.closePath(); ctx.fill();
        ctx.shadowBlur = 0; ctx.fillStyle = '#fff6c0';
        ctx.beginPath(); ctx.moveTo(0, -c.size * 0.34); ctx.lineTo(c.size * 0.24, 0); ctx.lineTo(0, c.size * 0.34); ctx.lineTo(-c.size * 0.24, 0); ctx.closePath(); ctx.fill();
        ctx.restore();
      }

      drawParticles(ctx, st.particles);

      const p = st.player;
      const sy = p.stretch, sx = 2 - p.stretch;
      ctx.save();
      ctx.translate(p.x + PW / 2, p.y + PH / 2);
      ctx.scale(sx, sy);
      drawSkinShape(ctx, skinRef.current.shape, skinRef.current.color, PW, PH, st.gameTicks);
      ctx.restore();
      const jumpsLeft = p.grounded ? 2 : Math.max(0, 2 - p.jumpCount);
      for (let i = 0; i < 2; i++) {
        ctx.fillStyle = i < jumpsLeft ? '#1ED760' : 'rgba(255,255,255,0.18)';
        ctx.beginPath(); ctx.arc(p.x + PW / 2 - 9 + i * 18, p.y - 14, 4.5, 0, Math.PI * 2); ctx.fill();
      }

      // HUD: score + level (left), timer (center), opponent meter (right).
      ctx.save();
      ctx.fillStyle = '#ffffff'; ctx.font = '900 44px Helvetica, Arial, sans-serif';
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(String(st.curScore), 28, 24);
      ctx.font = '700 13px monospace'; ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillText('YOU', 30, 72);
      if (st.combo > 1) {
        const mult = 1 + Math.floor(st.combo / 5);
        ctx.fillStyle = '#ffe65c'; ctx.font = '900 20px Helvetica, Arial, sans-serif';
        ctx.fillText(`CHAIN ${st.combo}`, 30, 92);
        if (mult > 1) { ctx.fillStyle = accent; ctx.fillText(`×${mult}`, 30 + ctx.measureText(`CHAIN ${st.combo} `).width, 92); }
      }

      if (!practice) {
        // Countdown.
        const secs = Math.ceil(st.framesLeft / 60);
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillStyle = secs <= 10 ? '#ff5470' : 'rgba(255,255,255,0.85)';
        ctx.font = '900 30px Helvetica, Arial, sans-serif';
        ctx.fillText(`${secs}s`, w / 2, 22);

        // Opponent live score + lead/behind.
        const opp = oppScoreRef.current;
        ctx.textAlign = 'right'; ctx.textBaseline = 'top';
        ctx.fillStyle = st.oppPing > 0 ? '#ff8ab0' : 'rgba(255,138,176,0.85)';
        ctx.font = '900 26px Helvetica, Arial, sans-serif';
        ctx.fillText(String(opp), w - 28, 26);
        ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = '700 12px monospace';
        ctx.fillText(oppHandle.slice(0, 14).toUpperCase(), w - 28, 58);
        const lead = st.curScore - opp;
        ctx.fillStyle = lead >= 0 ? '#1ED760' : '#ff5470';
        ctx.font = '900 16px Helvetica, Arial, sans-serif';
        ctx.fillText(lead >= 0 ? `+${lead} AHEAD` : `${lead} BEHIND`, w - 28, 76);
      } else {
        ctx.textAlign = 'right'; ctx.fillStyle = accent; ctx.font = '900 22px Helvetica, Arial, sans-serif';
        ctx.textBaseline = 'top'; ctx.fillText(`LEVEL ${st.level}`, w - 28, 26);
        ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.font = '700 12px monospace';
        ctx.fillText('PRACTICE', w - 28, 56);
      }
      ctx.restore();

      if (st.bannerLife > 0) {
        const a = Math.min(1, st.bannerLife / 30);
        ctx.save();
        ctx.globalAlpha = a; ctx.fillStyle = accent; ctx.shadowBlur = 24; ctx.shadowColor = accent;
        ctx.font = '900 60px Helvetica, Arial, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(st.bannerText, w / 2, h * 0.3);
        ctx.restore();
      }
    };

    let lastTime = 0, accumulator = 0;
    const FPS_INTERVAL = 1000 / 60;
    const loop = (now: number) => {
      if (!endedRef.current) rafRef.current = requestAnimationFrame(loop);
      if (lastTime === 0) lastTime = now;
      let delta = now - lastTime;
      lastTime = now;
      if (delta > 250) delta = 250;
      accumulator += delta;
      let steps = 0;
      while (accumulator >= FPS_INTERVAL && steps < 5 && !endedRef.current) {
        update();
        accumulator -= FPS_INTERVAL;
        steps++;
      }
      if (steps === 5) accumulator = 0;
      draw();
    };
    rafRef.current = requestAnimationFrame(loop);

    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') { e.preventDefault(); doJumpRef.current(); }
    };
    window.addEventListener('keydown', onKey);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', onKey);
    };
  }, [isPlaying, practice, oppHandle]);

  // Tear down music + channel + ticket on unmount.
  useEffect(() => () => {
    synthRef.current?.stopLoop();
    try { if (channelRef.current && supabase) supabase.removeChannel(channelRef.current); } catch { /* ignore */ }
    clearTicket();
  }, []);

  const onPointerDown = () => { if (isPlaying) doJumpRef.current(); };

  return (
    <div className="relative w-full h-full select-none overflow-hidden"
      onPointerDown={onPointerDown}
      style={{ touchAction: 'none', WebkitUserSelect: 'none', userSelect: 'none', WebkitTouchCallout: 'none' }}>
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="relative shrink-0 origin-center"
          style={isMobileStage ? { width: 1280, height: 720, transform: `scale(${stageScale})` } : { width: '100%', height: '100%' }}>
          <canvas ref={canvasRef} className="absolute inset-0 block w-full h-full bg-black" />
        </div>
      </div>

      <button onClick={(e) => { e.stopPropagation(); toggleMute(); }}
        className="absolute top-3 left-1/2 -translate-x-1/2 z-50 text-[11px] font-mono text-white/60 border border-white/20 bg-black/50 px-2.5 py-1 hover:text-white">
        {isMuted ? '🔇' : '🔊'}
      </button>

      {/* INTRO / START */}
      {showIntro && !isPlaying && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black/75 backdrop-blur-sm px-6 text-center">
          <p className="text-[11px] uppercase tracking-[0.4em] text-brandYellow mb-2">OUROO DUEL</p>
          <h1 className="font-helvetica font-black text-5xl sm:text-7xl tracking-tighter text-white leading-none">CLIMB RACE<span className="text-brandYellow">.</span></h1>
          {practice ? (
            <p className="mt-4 max-w-sm text-white/65 text-sm leading-relaxed">
              Practice run — no stake. Same crystal-staircase climb as a real duel, so you can learn the course feel.
              In a real duel you and your opponent race the <b className="text-white/85">identical seeded tower</b> for {MATCH_SECONDS}s; higher score takes the pot.
            </p>
          ) : (
            <>
              <p className="mt-4 max-w-sm text-white/70 text-sm leading-relaxed">
                You vs <b className="text-white">{oppHandle}</b> — the same seeded tower, {MATCH_SECONDS} seconds each. Climb higher to win.
              </p>
              {friendly
                ? <p className="mt-3 text-sm text-white/55 font-bold">Friendly match · no stake</p>
                : <p className="mt-3 text-sm text-brandYellow font-bold">Pot on the line: {stakeText}</p>}
            </>
          )}
          <p className="mt-3 text-[12px] text-white/45 font-mono">SPACE / TAP to jump · grab crystals mid-air to jump again</p>
          <button onClick={startGame}
            className="mt-7 bg-brandYellow text-black font-bold uppercase tracking-[0.2em] text-sm px-8 py-3.5 hover:bg-white transition-colors active:scale-[0.98]">
            ▶ {practice ? 'Practice' : 'Race'}
          </button>
          {onExit && <button onClick={onExit} className="mt-4 text-[11px] font-mono text-white/40 hover:text-white">[ leave ]</button>}
        </div>
      )}

      {/* FINISH / SETTLEMENT */}
      {finished && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black/85 backdrop-blur-sm px-5 py-8 text-center">
          {practice ? (
            <>
              <p className="text-[11px] uppercase tracking-[0.4em] text-white/50 mb-1">Practice over</p>
              <h2 className="font-helvetica font-black text-5xl tracking-tighter text-white leading-none">{finalScore}</h2>
              <p className="text-[12px] text-white/50 mt-1">level {hudLevel}</p>
            </>
          ) : settling ? (
            <>
              <p className="text-[11px] uppercase tracking-[0.4em] text-brandYellow mb-2">You scored {finalScore}</p>
              <div className="animate-pulse text-white/70 text-lg font-bold">{friendly ? 'Checking the result…' : 'Settling the pot…'}</div>
              <p className="text-[12px] text-white/45 mt-2">{settleNote || `Waiting for ${oppHandle}…`}</p>
            </>
          ) : outcome ? (
            <>
              <p className={`text-[11px] uppercase tracking-[0.4em] mb-1 ${outcome.iWon ? 'text-[#1ED760]' : outcome.draw ? 'text-white/60' : 'text-brandRed'}`}>
                {outcome.iWon ? (friendly ? 'You win' : 'You won the pot') : outcome.draw ? 'Draw' : (friendly ? 'You lose' : 'You lost the pot')}
              </p>
              <h2 className="font-helvetica font-black text-5xl tracking-tighter text-white leading-none">
                {outcome.iWon ? '🏆' : outcome.draw ? '🤝' : '💀'}
              </h2>
              <p className="text-sm text-white/70 mt-3">
                You {outcome.myScore} · {oppHandle} {outcome.oppScore}
              </p>
              {!friendly && (
                <p className={`mt-2 text-sm font-bold ${outcome.iWon ? 'text-[#1ED760]' : outcome.draw ? 'text-white/60' : 'text-brandRed'}`}>
                  {outcome.iWon ? `+ ${outcome.label}` : outcome.draw ? `${outcome.label} returned` : `− ${outcome.label}`}
                </p>
              )}
              {settleNote && <p className="text-[12px] text-white/45 mt-2">{settleNote}</p>}
            </>
          ) : (
            <p className="text-white/60">Finishing…</p>
          )}

          {(practice || outcome) && (
            <div className="flex gap-3 mt-7">
              {practice && (
                <button onClick={startGame}
                  className="bg-brandYellow text-black font-bold uppercase tracking-[0.2em] text-sm px-7 py-3 hover:bg-white transition-colors active:scale-[0.98]">
                  ↺ Again
                </button>
              )}
              {onExit && (
                <button onClick={onExit}
                  className="border border-white/20 text-white/70 font-bold uppercase tracking-[0.2em] text-sm px-6 py-3 hover:bg-white hover:text-black transition-colors">
                  Back to Plaza
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
