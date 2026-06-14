'use client';

// OUROO LEAP — a second game on the same engine foundation.
// Same auto-scroll + fixed-X feel as OUROO: the world slides left, the avatar holds its X
// and falls under OUROO's gravity. You start GROUNDED on a platform (just like the base
// game), then leap a CRYSTAL STAIRCASE across the gap — grabbing a crystal mid-air refunds
// your jump (the OG air-chain trick), so you climb crystal-to-crystal until you land on the
// next platform. Each platform you reach clears a level; the next staircase is taller, wider
// and faster. Miss the chain and you fall. Score = levels cleared + crystals grabbed.
// Reuses: the shared ArcadeSynth (same sound), drawSkinShape (same skin), the engine
// physics constants + particle pool, and submits to its own LEAP board.

import React, { useEffect, useRef, useState } from 'react';
import { Leaderboard } from '@/components/Leaderboard';
import { submitScore, getLocalPlayer, LEAP_GAME_ID } from '@/lib/leaderboard';
import { validateHandle } from '@/lib/names';
import { supabaseReady } from '@/lib/supabase';
import { useUser } from '@/lib/auth';
import { drawSkinShape, skinById, getSelectedSkinId, type SkinShape } from '@/lib/skins';
import { ArcadeSynth } from '@/lib/engine/synth';
import {
  GRAVITY, TERMINAL_VY, JUMP_VY, AIR_JUMP_VY, COYOTE_FRAMES, JUMP_BUFFER_FRAMES,
} from '@/lib/engine/physics';
import { spawnBurst, updateParticles, drawParticles, type Particle } from '@/lib/engine/particles';

// A platform you can stand on; reaching a fresh one clears a level.
interface Platform { x: number; top: number; width: number; reached: boolean; level: number; }
// A crystal step in the staircase — grab mid-air to refund a jump (footing for the gap).
interface Crystal { x: number; y: number; size: number; collected: boolean; pulse: number; }
interface LeapPlayer { x: number; y: number; vy: number; grounded: boolean; jumpCount: number; stretch: number; coyote: number; }
interface Star { x: number; y: number; z: number; }

const PW = 38, PH = 52;          // player draw + collision box (matches OUROO)
const PLAYER_X = 360;            // locked horizontal position (top-left)
const BASE_SPEED = 4.0;          // level-1 scroll speed
const MAX_SPEED = 6.5;           // gentle cap — difficulty comes from patterns, not raw speed
const CRYSTAL_SIZE = 26;

// The world's accent colour drifts with the level: relaxing cyan/blue early, climbing through
// the spectrum as you go, then a full cycling RAINBOW once you reach the deep levels.
const RAINBOW_LEVEL = 10;
function accentColor(level: number, ticks: number): string {
  if (level >= RAINBOW_LEVEL) return `hsl(${(ticks * 2.2) % 360}, 90%, 62%)`;
  const hue = (195 + (level - 1) * 26) % 360;   // 195 = cyan; drifts ~26°/level
  const sat = level <= 2 ? 100 : 88;
  return `hsl(${hue}, ${sat}%, 58%)`;
}

export const LeapCanvas: React.FC<{ stageScale?: number; isMobileStage?: boolean; gameMods?: Record<string, boolean> | null; onExit?: () => void }> = ({
  stageScale = 1, isMobileStage = false, gameMods: _gameMods = null, onExit,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const synthRef = useRef<ArcadeSynth | null>(null);
  const rafRef = useRef<number>(0);
  const endedRef = useRef(false);
  const skinRef = useRef<{ shape: SkinShape; color: string }>({ shape: 'diamond', color: '#ffe65c' });

  const stateRef = useRef({
    player: { x: PLAYER_X, y: 300, vy: 0, grounded: true, jumpCount: 0, stretch: 1, coyote: 0 } as LeapPlayer,
    platforms: [] as Platform[],
    crystals: [] as Crystal[],
    particles: [] as Particle[],
    stars: [] as Star[],
    worldSpeed: BASE_SPEED,
    level: 1,            // platforms reached so far
    genLevel: 0,         // platforms generated so far (drives difficulty of new segments)
    cursorX: 0,          // generation frontier (world x)
    cursorY: 0,          // generation frontier (height)
    gameTicks: 0,
    jumpBuffer: 0,
    bonus: 0,            // crystal + platform points
    dist: 0,             // distance scrolled (trickles into score)
    combo: 0,            // crystals chained this run — drives the score multiplier
    comboBest: 0,
    curScore: 0,
    bannerText: '',
    bannerLife: 0,
  });

  const [showIntro, setShowIntro] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [finalScore, setFinalScore] = useState(0);
  const [hudLevel, setHudLevel] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [best, setBest] = useState(() => { try { return parseInt(localStorage.getItem('leap_pb') || '0'); } catch { return 0; } });

  // ---- leaderboard submit (game over) ----
  const [lbState, setLbState] = useState<'idle' | 'need-handle' | 'submitting' | 'done' | 'error'>('idle');
  const [lbHandle, setLbHandle] = useState('');
  const [lbRank, setLbRank] = useState<number | null>(null);
  const [lbError, setLbError] = useState('');
  const [lbPlayerId, setLbPlayerId] = useState<string | null>(null);
  const [lbRefresh, setLbRefresh] = useState(0);
  const submittedRef = useRef(false);
  const { user: discordUser } = useUser();

  const refreshSkin = () => { const s = skinById(getSelectedSkinId()); skinRef.current = { shape: s.shape, color: s.color }; };

  const doSubmit = async (handle?: string) => {
    setLbState('submitting'); setLbError('');
    const res = await submitScore(finalScore, handle, LEAP_GAME_ID);
    if (res.ok) { setLbRank(res.rank); setLbPlayerId(res.playerId); setLbState('done'); setLbRefresh(r => r + 1); }
    else { setLbError(res.error); setLbState('error'); }
  };

  // Auto-submit on game over when we already know the player's name; otherwise ask for one.
  useEffect(() => {
    if (!gameOver || submittedRef.current) return;
    submittedRef.current = true;
    if (!supabaseReady) { setLbState('idle'); return; }
    const known = getLocalPlayer().handle || discordUser?.name;
    if (known) doSubmit(); else setLbState('need-handle');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameOver]);

  // How far a hop can climb over T frames: |v|·T − ½·g·T². The first hop off a PLATFORM uses
  // the ground jump (−14.6); every crystal-to-crystal hop uses the weaker air jump (−12.4),
  // because the air-chain only refunds that one. Cap placements below this so each hop is
  // actually makeable.
  const reachUp = (T: number, impulse: number) => Math.max(0, Math.abs(impulse) * T - 0.5 * GRAVITY * T * T);

  // ---- procedural generation: a CRYSTAL PATTERN then a landing PLATFORM ----
  // The player only controls altitude (the world carries each crystal to a fixed X), so a
  // "shape" is just a sequence of up/down/flat hops. Difficulty comes from SPACING (the frame
  // gap between footings — wider = longer airtime to manage) and OFFSET (how much each hop
  // climbs or drops), plus richer patterns the deeper you go. Everything stays inside reachUp()
  // so it's always makeable.
  const genSegment = (canvas: HTMLCanvasElement, st: typeof stateRef.current) => {
    const g = st.genLevel;
    const bandTop = 110;
    const bandBot = canvas.height - 170;
    const ws = st.worldSpeed;
    const steps = 2 + Math.min(5, Math.floor(g / 2));            // 2 → 7 crystals

    // Pattern menu unlocks with difficulty. 'arc' = up-then-down, 'valley' = drop-then-climb
    // (leap DOWN to a crystal, then back UP onto the platform), 'zigzag' = alternating hops.
    const menu = ['ascend', 'arc'];
    if (g >= 2) menu.push('valley', 'flat');
    if (g >= 4) menu.push('zigzag', 'descend');
    const pat = menu[Math.floor(Math.random() * menu.length)];
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

    // SPACING (frames between footings) GROWS WITH SPEED, so the faster the world scrolls the
    // wider the crystal gaps get — the player keeps a steady reaction window instead of getting
    // crushed. Pixel gap = ws × T, so it widens more than linearly with speed. OFFSET (how steep
    // each hop climbs/drops) is what ramps the actual difficulty, via genLevel.
    const reactT = 24 + (ws - BASE_SPEED) * 3;
    const upFrac = 0.5 + Math.min(0.28, g * 0.035);
    const dropAmt = 46 + Math.min(110, g * 14);

    for (let i = 0; i < steps; i++) {
      const kind = kindOf(i);
      const impulse = i === 0 ? JUMP_VY : AIR_JUMP_VY;           // first hop is off the platform
      let T = reactT * (0.92 + Math.random() * 0.2);
      if (kind === 'up') T = Math.min(T, 24);                    // up-reach shrinks past ~24 frames
      let dy: number;
      if (kind === 'up')        dy = -reachUp(T, impulse) * upFrac * (0.85 + Math.random() * 0.3);
      else if (kind === 'down') dy =  dropAmt * (0.6 + Math.random() * 0.7);
      else                      dy = (Math.random() * 2 - 1) * 16;
      // Keep inside the band; if clamping would distort an 'up' hop into the ceiling, ease off.
      st.cursorX += ws * T;
      st.cursorY = Math.max(bandTop, Math.min(bandBot, st.cursorY + dy));
      st.crystals.push({ x: st.cursorX, y: st.cursorY, size: CRYSTAL_SIZE, collected: false, pulse: Math.random() * Math.PI * 2 });
    }

    // Landing platform — reachable from the last crystal with an air-jump. Valley/descend climb
    // back UP onto it; everything else sits at/below the last crystal so you fall onto the top.
    const Tp = reactT;
    const pdy = (pat === 'valley' || pat === 'descend')
      ? -reachUp(Tp, AIR_JUMP_VY) * 0.55
      : 20 + Math.random() * 55;
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
    // Size the canvas up front — resetGame runs before the loop effect's resize(), so without
    // this the start platform + first staircase get laid out against the default 150px height.
    canvas.width = canvas.clientWidth || window.innerWidth;
    canvas.height = canvas.clientHeight || window.innerHeight;
    const st = stateRef.current;
    st.platforms = []; st.crystals = []; st.particles = [];
    st.worldSpeed = BASE_SPEED; st.level = 1; st.genLevel = 0;
    st.gameTicks = 0; st.jumpBuffer = 0; st.bonus = 0; st.curScore = 0; st.bannerLife = 0;
    st.dist = 0; st.combo = 0; st.comboBest = 0;

    // Start platform — wide, centred under the player, exactly like the base game's opener.
    const startTop = canvas.height * 0.62;
    const start: Platform = { x: PLAYER_X - 240, top: startTop, width: 560, reached: true, level: 1 };
    st.platforms.push(start);
    st.player = { x: PLAYER_X, y: startTop - PH, vy: 0, grounded: true, jumpCount: 0, stretch: 1, coyote: 0 };
    st.cursorX = start.x + start.width;
    st.cursorY = startTop;

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
    else st.jumpBuffer = JUMP_BUFFER_FRAMES * 2;   // remember the press a bit longer so an early
                                                   // tap survives until the next crystal grab
  };
  const doJumpRef = useRef(doJump);
  doJumpRef.current = doJump;

  const startGame = () => {
    refreshSkin();
    if (!synthRef.current) { try { synthRef.current = new ArcadeSynth(); } catch { /* audio optional */ } }
    synthRef.current?.setMuted(isMuted);
    synthRef.current?.setIntensity(2);
    synthRef.current?.startLoop();
    const canvas = canvasRef.current;
    if (canvas) resetGame(canvas);
    endedRef.current = false;
    submittedRef.current = false;
    setLbState('idle'); setLbRank(null); setLbError(''); setLbHandle('');
    setGameOver(false); setShowIntro(false); setIsPlaying(true);
  };

  const playAgain = () => { setGameOver(false); startGame(); };

  const toggleMute = () => {
    setIsMuted(m => { const nv = !m; synthRef.current?.setMuted(nv); return nv; });
  };

  // ---- main loop (runs while playing) ----
  useEffect(() => {
    if (!isPlaying) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false }) as CanvasRenderingContext2D;
    if (!ctx) return;

    const resize = () => {
      canvas.width = canvas.clientWidth || window.innerWidth;
      canvas.height = canvas.clientHeight || window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    // Dev-only test hook: lets an autopilot read positions + trigger jumps to verify the
    // course is actually completable. Stripped from production builds.
    if (process.env.NODE_ENV !== 'production') {
      (window as unknown as Record<string, unknown>).__leap = {
        state: () => stateRef.current, jump: () => doJumpRef.current(), PW, PH, PLAYER_X,
      };
    }

    const endRun = () => {
      if (endedRef.current) return;
      endedRef.current = true;
      const st = stateRef.current;
      synthRef.current?.playHurt();
      synthRef.current?.stopLoop();
      const score = st.curScore;
      setFinalScore(score);
      if (score > best) { setBest(score); try { localStorage.setItem('leap_pb', String(score)); } catch { /* ignore */ } }
      setIsPlaying(false);
      setGameOver(true);
    };

    const update = () => {
      const st = stateRef.current;
      const p = st.player;
      st.gameTicks++;
      if (st.bannerLife > 0) st.bannerLife--;

      // Scroll the world left and keep content ahead.
      const ws = st.worldSpeed;
      for (const pl of st.platforms) pl.x -= ws;
      for (const c of st.crystals) c.x -= ws;
      st.cursorX -= ws;
      for (const s of st.stars) { s.x -= ws * s.z * 0.6; if (s.x < -2) { s.x = canvas.width + 2; s.y = Math.random() * canvas.height; } }
      st.platforms = st.platforms.filter(pl => pl.x + pl.width > -60);
      st.crystals = st.crystals.filter(c => c.x + c.size > -40);
      ensureAhead(canvas, st);

      // Gravity + integrate.
      p.vy = Math.min(p.vy + GRAVITY, TERMINAL_VY);
      p.y += p.vy;
      p.stretch += (1 - p.stretch) * 0.2;

      // ---- platform footing: land on a top surface ----
      // Generous catch window so brushing a platform near the apex or a hair low snaps you onto
      // it instead of phasing into the solid bar (the "glitch out"). We allow catching while
      // barely rising (vy >= -4) so you can step up onto a platform at the top of an arc.
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
            st.bannerLife = 95;
            synthRef.current?.playCombo(Math.min(st.level, 6));
            spawnBurst(st.particles, p.x + PW / 2, pl.top, accentColor(st.level, st.gameTicks), { count: 16, speed: 4, angle: -Math.PI / 2, spread: Math.PI, life: 30 });
            setHudLevel(st.level);
          }
          break;
        }
      }
      if (wasGrounded && !p.grounded) p.coyote = COYOTE_FRAMES;
      else if (!p.grounded && p.coyote > 0) p.coyote--;

      // ---- crystal air-chain: grab mid-air to refund a jump (forgiving, center-distance) ----
      const pcx = p.x + PW / 2, pcy = p.y + PH / 2;
      for (const c of st.crystals) {
        if (c.collected) continue;
        const ccx = c.x + c.size / 2, ccy = c.y + c.size / 2;
        if (Math.abs(pcx - ccx) < PW / 2 + c.size * 0.7 && Math.abs(pcy - ccy) < PH / 2 + c.size * 0.7) {
          c.collected = true;
          if (!p.grounded) { p.jumpCount = Math.min(p.jumpCount, 1); p.stretch = 1.3; }
          // Chain multiplier: every crystal grabbed without dying builds the chain, and the
          // chain multiplies each crystal's worth — long clean runs score big.
          st.combo++;
          if (st.combo > st.comboBest) st.comboBest = st.combo;
          const mult = 1 + Math.floor(st.combo / 5);
          st.bonus += 50 * mult;
          spawnBurst(st.particles, c.x + c.size / 2, c.y + c.size / 2, '#ffe65c', { count: 9, speed: 3, life: 24 });
          synthRef.current?.playCrystal();
          synthRef.current?.setIntensity(Math.min(15, Math.floor(st.combo / 3)));
        }
      }

      // Buffered jump fires the instant ANY jump becomes available again — a platform/coyote
      // (ground jump) OR a crystal grab that just refunded the air-jump. Without the air-jump
      // case, taps made a hair before grabbing a crystal got silently eaten — the "dead" feel.
      if (st.jumpBuffer > 0) {
        st.jumpBuffer--;
        if (p.grounded || p.coyote > 0) { groundJump(st); st.jumpBuffer = 0; }
        else if (p.jumpCount < 2) { p.vy = AIR_JUMP_VY; p.jumpCount++; p.stretch = 1.45; synthRef.current?.playJump(); st.jumpBuffer = 0; }
      }

      st.dist += st.worldSpeed;
      st.curScore = st.bonus + Math.floor(st.dist / 8);   // distance trickles in too
      updateParticles(st.particles, 0.18);

      // Death: fell past the bottom of the screen.
      if (p.y > canvas.height + 60) endRun();
    };

    const draw = () => {
      const st = stateRef.current;
      const w = canvas.width, h = canvas.height;
      const accent = accentColor(st.level, st.gameTicks);
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#0a0a12'); g.addColorStop(1, '#13060d');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      // Level-tint wash — barely-there cyan early (relaxing), stronger + shifting as you climb,
      // full rainbow once you're deep. Kept low-alpha so it sets mood without blinding.
      ctx.save();
      ctx.globalAlpha = 0.04 + Math.min(0.10, st.level * 0.011);
      ctx.fillStyle = accent; ctx.fillRect(0, 0, w, h);
      ctx.restore();

      // Stars.
      ctx.save();
      for (const s of st.stars) { ctx.globalAlpha = 0.12 + s.z * 0.4; ctx.fillStyle = '#ffffff'; ctx.fillRect(s.x, s.y, s.z * 2, s.z * 2); }
      ctx.restore();

      // Platforms — solid bar + glowing accent top edge (OUROO style).
      for (const pl of st.platforms) {
        ctx.fillStyle = '#1b1b28';
        ctx.fillRect(pl.x, pl.top, pl.width, h - pl.top + 40);
        ctx.fillStyle = accent;
        ctx.fillRect(pl.x, pl.top, pl.width, 5);
        ctx.save(); ctx.globalAlpha = 0.25; ctx.shadowColor = accent; ctx.shadowBlur = 14;
        ctx.fillRect(pl.x, pl.top, pl.width, 5); ctx.restore();
      }

      // Crystals — spinning gold diamonds (OUROO style).
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

      // Player (with squash/stretch) + jump pips.
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

      // HUD (on-canvas).
      ctx.save();
      ctx.fillStyle = '#ffffff'; ctx.font = '900 44px Helvetica, Arial, sans-serif';
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(String(st.curScore), 28, 24);
      ctx.font = '700 13px monospace'; ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillText('SCORE', 30, 72);
      // Chain + multiplier — the juicy bit: a long clean chain pumps the multiplier.
      if (st.combo > 1) {
        const mult = 1 + Math.floor(st.combo / 5);
        ctx.fillStyle = '#ffe65c'; ctx.font = '900 20px Helvetica, Arial, sans-serif';
        ctx.fillText(`CHAIN ${st.combo}`, 30, 94);
        if (mult > 1) { ctx.fillStyle = accent; ctx.fillText(`×${mult}`, 30 + ctx.measureText(`CHAIN ${st.combo} `).width, 94); }
      }
      ctx.textAlign = 'right'; ctx.fillStyle = accent; ctx.font = '900 22px Helvetica, Arial, sans-serif';
      ctx.fillText(`LEVEL ${st.level}`, w - 28, 26);
      ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.font = '700 12px monospace';
      ctx.fillText(`BEST ${Math.max(best, st.curScore)}`, w - 28, 56);
      ctx.restore();

      // Level banner.
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

    // Fixed 60Hz timestep — same as the base game. We accumulate real elapsed time and run
    // update() in whole 60Hz steps, then draw once, so the sim runs at the same wall-clock
    // speed on a 60Hz phone or a 144Hz monitor (no double-speed "insane gravity").
    let lastTime = 0, accumulator = 0;
    const FPS_INTERVAL = 1000 / 60;
    const loop = (now: number) => {
      if (!endedRef.current) rafRef.current = requestAnimationFrame(loop);
      if (lastTime === 0) lastTime = now;
      let delta = now - lastTime;
      lastTime = now;
      if (delta > 250) delta = 250;          // clamp after tab-away so we don't fast-forward
      accumulator += delta;
      let steps = 0;
      while (accumulator >= FPS_INTERVAL && steps < 5 && !endedRef.current) {
        update();
        accumulator -= FPS_INTERVAL;
        steps++;
      }
      if (steps === 5) accumulator = 0;      // too far behind to catch up — resync, don't spiral
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
  }, [isPlaying, best]);

  // Stop music if the component unmounts mid-run.
  useEffect(() => () => { synthRef.current?.stopLoop(); }, []);

  const onPointerDown = () => { if (isPlaying) doJumpRef.current(); };

  return (
    <div className="relative w-full h-full select-none overflow-hidden"
      onPointerDown={onPointerDown}
      style={{ touchAction: 'none', WebkitUserSelect: 'none', userSelect: 'none', WebkitTouchCallout: 'none' }}>
      {/* GAME VIEW — mobile renders the fixed 1280x720 stage scaled to fit, like OUROO. */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="relative shrink-0 origin-center"
          style={isMobileStage ? { width: 1280, height: 720, transform: `scale(${stageScale})` } : { width: '100%', height: '100%' }}>
          <canvas ref={canvasRef} className="absolute inset-0 block w-full h-full bg-black" />
        </div>
      </div>

      {/* Mute toggle. */}
      <button onClick={(e) => { e.stopPropagation(); toggleMute(); }}
        className="absolute top-3 left-1/2 -translate-x-1/2 z-50 text-[11px] font-mono text-white/60 border border-white/20 bg-black/50 px-2.5 py-1 hover:text-white">
        {isMuted ? '🔇' : '🔊'}
      </button>

      {/* INTRO / START */}
      {showIntro && !isPlaying && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm px-6 text-center">
          <p className="text-[11px] uppercase tracking-[0.4em] text-brandYellow mb-2">OUROO ARCADE</p>
          <h1 className="font-helvetica font-black text-5xl sm:text-7xl tracking-tighter text-white leading-none">LEAP<span className="text-brandYellow">.</span></h1>
          <p className="mt-4 max-w-sm text-white/65 text-sm leading-relaxed">
            You start on a platform. Leap the <b className="text-white/85">crystal staircase</b> —
            grabbing a crystal mid-air gives your jump back, so you chain crystal to crystal
            until you land on the next platform. Each platform climbs a level.
          </p>
          <p className="mt-3 text-[12px] text-white/45 font-mono">SPACE / TAP to jump &middot; grab crystals in the air to jump again</p>
          <button onClick={startGame}
            className="mt-7 bg-brandYellow text-black font-bold uppercase tracking-[0.2em] text-sm px-8 py-3.5 hover:bg-white transition-colors active:scale-[0.98]">
            ▶ Leap
          </button>
          {onExit && (
            <button onClick={onExit} className="mt-4 text-[11px] font-mono text-white/40 hover:text-white">[ switch game ]</button>
          )}
        </div>
      )}

      {/* GAME OVER */}
      {gameOver && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-start overflow-y-auto bg-black/85 backdrop-blur-sm px-5 py-8">
          <p className="text-[11px] uppercase tracking-[0.4em] text-brandRed mb-1">You fell</p>
          <h2 className="font-helvetica font-black text-5xl tracking-tighter text-white leading-none">{finalScore}</h2>
          <p className="text-[12px] text-white/50 mt-1">level {hudLevel} {finalScore >= best ? '· new best 🏆' : `· best ${best}`}</p>

          {/* Submit / handle */}
          <div className="w-full max-w-sm mt-5">
            {lbState === 'need-handle' && (
              <form onSubmit={(e) => { e.preventDefault(); const v = validateHandle(lbHandle); if (!v.ok) { setLbError(v.error); return; } doSubmit(v.value); }}
                className="flex flex-col gap-2">
                <p className="text-[12px] text-white/55 text-center">Pick a name for the LEAP ranking:</p>
                <div className="flex gap-2">
                  <input value={lbHandle} onChange={(e) => { setLbHandle(e.target.value); setLbError(''); }} placeholder="YOUR NAME" autoFocus
                    className="flex-1 min-w-0 bg-white/5 border border-white/15 text-white px-3 py-2.5 text-sm uppercase tracking-widest outline-none focus:border-brandYellow" />
                  <button type="submit" className="bg-brandYellow text-black font-bold uppercase text-xs tracking-widest px-4 hover:bg-white transition-colors active:scale-95">Submit</button>
                </div>
                {lbError && <p className="text-[11px] text-brandRed text-center">{lbError}</p>}
              </form>
            )}
            {lbState === 'submitting' && <p className="text-center text-white/50 text-sm">Submitting…</p>}
            {lbState === 'done' && <p className="text-center text-[#1ED760] text-sm font-bold">On the board{lbRank ? ` · #${lbRank}` : ''} ✓</p>}
            {lbState === 'error' && <p className="text-center text-brandRed text-sm">{lbError || 'Submission failed.'}</p>}
            {lbState === 'idle' && !supabaseReady && <p className="text-center text-white/40 text-[12px]">Ranking offline.</p>}
          </div>

          {/* LEAP leaderboard */}
          <div className="w-full max-w-sm mt-6 border border-white/10 p-4">
            <div className="flex items-end justify-between mb-3">
              <h3 className="font-helvetica font-black text-lg text-white">Ranking</h3>
              <span className="text-[10px] uppercase tracking-[0.2em] text-white/40">LEAP</span>
            </div>
            <Leaderboard game={LEAP_GAME_ID} limit={8} highlightId={lbPlayerId} refreshKey={lbRefresh} compact />
          </div>

          <div className="flex gap-3 mt-6">
            <button onClick={playAgain}
              className="bg-brandYellow text-black font-bold uppercase tracking-[0.2em] text-sm px-7 py-3 hover:bg-white transition-colors active:scale-[0.98]">
              ↺ Again
            </button>
            {onExit && (
              <button onClick={onExit}
                className="border border-white/20 text-white/70 font-bold uppercase tracking-[0.2em] text-sm px-6 py-3 hover:bg-white hover:text-black transition-colors">
                Switch
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
