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
const MAX_SPEED = 11;
const CRYSTAL_SIZE = 26;
const CYAN = '#00cfff';

export const LeapCanvas: React.FC<{ stageScale?: number; isMobileStage?: boolean; onExit?: () => void }> = ({
  stageScale = 1, isMobileStage = false, onExit,
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
    bonus: 0,            // crystal points
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

  // ---- procedural generation: each call lays a CRYSTAL STAIRCASE then a landing PLATFORM ----
  // Reachable BY CONSTRUCTION. The player only controls altitude (the world brings each
  // crystal to a fixed X), so what matters is vertical timing, not horizontal distance. We
  // space steps by a constant FRAME gap (dx = speed × frames), which keeps the timing the
  // same at every speed, and cap each climb to what one well-timed jump clears in that gap.
  // Difficulty rises via: more steps, steeper (closer-to-limit) climbs, smaller platforms,
  // faster scroll (less reaction time) — never via an impossible jump.
  const genSegment = (canvas: HTMLCanvasElement, st: typeof stateRef.current) => {
    const g = st.genLevel;
    const bandTop = 110;
    const bandBot = canvas.height - 170;
    const ws = st.worldSpeed;
    const frameGap = 30;                                          // frames between footings
    // A jump (impulse JUMP_VY) rises this much over frameGap frames: |v|·t − ½·g·t².
    const climbReach = Math.abs(JUMP_VY) * frameGap - 0.5 * GRAVITY * frameGap * frameGap;
    const climbMax = Math.max(40, climbReach * 0.82);            // stay inside the envelope

    const steps = 2 + Math.min(5, Math.floor(g / 2));            // 2 → 7 crystals
    // Climb direction: mostly up (classic staircase), flip toward the middle at band edges.
    let dir = Math.random() > 0.4 ? -1 : 1;                       // -1 = up
    if (st.cursorY < bandTop + climbMax) dir = 1;
    if (st.cursorY > bandBot - climbMax) dir = -1;
    const steep = 0.45 + Math.min(0.45, g * 0.05);               // fraction of the reach used

    for (let i = 0; i < steps; i++) {
      st.cursorX += ws * frameGap * (0.92 + Math.random() * 0.16);
      const climb = dir < 0
        ? -climbMax * steep * (0.7 + Math.random() * 0.5)        // up, bounded by the envelope
        : climbMax * (0.5 + Math.random() * 0.7);                // down is always reachable
      st.cursorY = Math.max(bandTop, Math.min(bandBot, st.cursorY + climb));
      st.crystals.push({ x: st.cursorX, y: st.cursorY, size: CRYSTAL_SIZE, collected: false, pulse: Math.random() * Math.PI * 2 });
    }

    // Landing platform — one frame-gap past the last crystal, biased slightly below it so the
    // player descends onto the top surface, and within the climb envelope.
    st.cursorX += ws * frameGap;
    const top = Math.max(bandTop + 40, Math.min(bandBot + 70, st.cursorY + Math.random() * 60));
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
    else st.jumpBuffer = JUMP_BUFFER_FRAMES;   // remember the press; fire on next footing
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

      // ---- platform footing: land when falling onto a top surface ----
      const wasGrounded = p.grounded;
      p.grounded = false;
      const feetY = p.y + PH;
      for (const pl of st.platforms) {
        if (p.vy < 0) continue;
        if (p.x + PW > pl.x && p.x < pl.x + pl.width && feetY >= pl.top - 2 && feetY <= pl.top + Math.max(18, p.vy + 4)) {
          p.y = pl.top - PH; p.vy = 0; p.grounded = true; p.jumpCount = 0;
          if (!pl.reached) {
            pl.reached = true;
            st.level++;
            st.worldSpeed = Math.min(MAX_SPEED, BASE_SPEED + (st.level - 1) * 0.45);
            st.bonus += 200 * st.level;
            st.bannerText = `NÍVEL ${st.level}`;
            st.bannerLife = 95;
            synthRef.current?.setIntensity(st.level * 2);
            synthRef.current?.playCombo(Math.min(st.level, 6));
            spawnBurst(st.particles, p.x + PW / 2, pl.top, CYAN, { count: 16, speed: 4, angle: -Math.PI / 2, spread: Math.PI, life: 30 });
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
          st.bonus += 50;
          spawnBurst(st.particles, c.x + c.size / 2, c.y + c.size / 2, '#ffe65c', { count: 9, speed: 3, life: 24 });
          synthRef.current?.playCrystal();
        }
      }

      // Buffered jump fires the instant we have footing again.
      if (st.jumpBuffer > 0) {
        st.jumpBuffer--;
        if (p.grounded || p.coyote > 0) { groundJump(st); st.jumpBuffer = 0; }
      }

      st.curScore = st.bonus;
      updateParticles(st.particles, 0.18);

      // Death: fell past the bottom of the screen.
      if (p.y > canvas.height + 60) endRun();
    };

    const draw = () => {
      const st = stateRef.current;
      const w = canvas.width, h = canvas.height;
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#0a0a12'); g.addColorStop(1, '#13060d');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);

      // Stars.
      ctx.save();
      for (const s of st.stars) { ctx.globalAlpha = 0.12 + s.z * 0.4; ctx.fillStyle = '#ffffff'; ctx.fillRect(s.x, s.y, s.z * 2, s.z * 2); }
      ctx.restore();

      // Platforms — solid bar + cyan top edge (OUROO style).
      for (const pl of st.platforms) {
        ctx.fillStyle = '#1b1b28';
        ctx.fillRect(pl.x, pl.top, pl.width, h - pl.top + 40);
        ctx.fillStyle = CYAN;
        ctx.fillRect(pl.x, pl.top, pl.width, 5);
        ctx.save(); ctx.globalAlpha = 0.25; ctx.shadowColor = CYAN; ctx.shadowBlur = 14;
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
      ctx.fillText('PONTOS', 30, 72);
      ctx.textAlign = 'right'; ctx.fillStyle = CYAN; ctx.font = '900 22px Helvetica, Arial, sans-serif';
      ctx.fillText(`NÍVEL ${st.level}`, w - 28, 26);
      ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.font = '700 12px monospace';
      ctx.fillText(`RECORDE ${Math.max(best, st.curScore)}`, w - 28, 56);
      ctx.restore();

      // Level banner.
      if (st.bannerLife > 0) {
        const a = Math.min(1, st.bannerLife / 30);
        ctx.save();
        ctx.globalAlpha = a; ctx.fillStyle = CYAN; ctx.shadowBlur = 24; ctx.shadowColor = CYAN;
        ctx.font = '900 60px Helvetica, Arial, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(st.bannerText, w / 2, h * 0.3);
        ctx.restore();
      }
    };

    const loop = () => {
      update();
      draw();
      if (!endedRef.current) rafRef.current = requestAnimationFrame(loop);
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
            Começas numa plataforma. Salta a <b className="text-white/85">escadaria de cristais</b> —
            apanhar um cristal no ar devolve-te o salto, por isso encadeias de cristal em cristal
            até aterrar na próxima plataforma. Cada plataforma sobe um nível.
          </p>
          <p className="mt-3 text-[12px] text-white/45 font-mono">ESPAÇO / TOCA para saltar &middot; apanha cristais no ar para saltar outra vez</p>
          <button onClick={startGame}
            className="mt-7 bg-brandYellow text-black font-bold uppercase tracking-[0.2em] text-sm px-8 py-3.5 hover:bg-white transition-colors active:scale-[0.98]">
            ▶ Saltar
          </button>
          {onExit && (
            <button onClick={onExit} className="mt-4 text-[11px] font-mono text-white/40 hover:text-white">[ trocar de jogo ]</button>
          )}
        </div>
      )}

      {/* GAME OVER */}
      {gameOver && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-start overflow-y-auto bg-black/85 backdrop-blur-sm px-5 py-8">
          <p className="text-[11px] uppercase tracking-[0.4em] text-brandRed mb-1">Caíste</p>
          <h2 className="font-helvetica font-black text-5xl tracking-tighter text-white leading-none">{finalScore}</h2>
          <p className="text-[12px] text-white/50 mt-1">nível {hudLevel} {finalScore >= best ? '· novo recorde 🏆' : `· recorde ${best}`}</p>

          {/* Submit / handle */}
          <div className="w-full max-w-sm mt-5">
            {lbState === 'need-handle' && (
              <form onSubmit={(e) => { e.preventDefault(); const v = validateHandle(lbHandle); if (!v.ok) { setLbError(v.error); return; } doSubmit(v.value); }}
                className="flex flex-col gap-2">
                <p className="text-[12px] text-white/55 text-center">Escolhe um nome para o ranking LEAP:</p>
                <div className="flex gap-2">
                  <input value={lbHandle} onChange={(e) => { setLbHandle(e.target.value); setLbError(''); }} placeholder="O TEU NOME" autoFocus
                    className="flex-1 min-w-0 bg-white/5 border border-white/15 text-white px-3 py-2.5 text-sm uppercase tracking-widest outline-none focus:border-brandYellow" />
                  <button type="submit" className="bg-brandYellow text-black font-bold uppercase text-xs tracking-widest px-4 hover:bg-white transition-colors active:scale-95">Enviar</button>
                </div>
                {lbError && <p className="text-[11px] text-brandRed text-center">{lbError}</p>}
              </form>
            )}
            {lbState === 'submitting' && <p className="text-center text-white/50 text-sm">A enviar…</p>}
            {lbState === 'done' && <p className="text-center text-[#1ED760] text-sm font-bold">No ranking{lbRank ? ` · #${lbRank}` : ''} ✓</p>}
            {lbState === 'error' && <p className="text-center text-brandRed text-sm">{lbError || 'Erro ao enviar.'}</p>}
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
              ↺ Outra vez
            </button>
            {onExit && (
              <button onClick={onExit}
                className="border border-white/20 text-white/70 font-bold uppercase tracking-[0.2em] text-sm px-6 py-3 hover:bg-white hover:text-black transition-colors">
                Trocar
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
