'use client';

// OUROO LEAP — a second game on the same engine foundation.
// Auto-runner remix: the world scrolls left like OUROO, but coins are the ONLY footing.
// The player sits at a fixed X and times jumps (the exact OUROO impulses) to land
// coin-to-coin across gaps. Miss → fall → run over. Every stretch of distance bumps the
// level: faster scroll, wider gaps, smaller coins. Score = distance travelled.
// Reuses: the shared ArcadeSynth (same sound identity), drawSkinShape (same skin you own),
// the engine physics constants + particle pool, and submits to its own LEAP board.

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
  jumpAirtime, jumpRise,
} from '@/lib/engine/physics';
import { spawnBurst, updateParticles, drawParticles, type Particle } from '@/lib/engine/particles';

interface Coin { x: number; y: number; r: number; id: number; landed: boolean; pulse: number; }
interface LeapPlayer { x: number; y: number; vy: number; grounded: boolean; jumps: number; stretch: number; coyote: number; }
interface Star { x: number; y: number; z: number; }

const PW = 38, PH = 52;          // player draw size (matches OUROO)
const BASE_SPEED = 4.2;          // level-1 scroll speed
const MAX_SPEED = 12;
const LEVEL_DIST = 2200;         // distance per level

export const LeapCanvas: React.FC<{ stageScale?: number; isMobileStage?: boolean; onExit?: () => void }> = ({
  stageScale = 1, isMobileStage = false, onExit,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const synthRef = useRef<ArcadeSynth | null>(null);
  const rafRef = useRef<number>(0);
  const endedRef = useRef(false);
  const skinRef = useRef<{ shape: SkinShape; color: string }>({ shape: 'diamond', color: '#ffe65c' });

  const stateRef = useRef({
    player: { x: 360, y: 360, vy: 0, grounded: true, jumps: 0, stretch: 1, coyote: 0 } as LeapPlayer,
    coins: [] as Coin[],
    particles: [] as Particle[],
    stars: [] as Star[],
    distance: 0,
    bonus: 0,
    worldSpeed: BASE_SPEED,
    level: 1,
    gameTicks: 0,
    coinIdInc: 0,
    jumpBuffer: 0,
    bannerText: '',
    bannerLife: 0,
    curScore: 0,
  });

  const [showIntro, setShowIntro] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [finalScore, setFinalScore] = useState(0);
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

  // ---- coin generation: place each coin inside the reachable arc of the previous one ----
  const ensureCoins = (canvas: HTMLCanvasElement, st: typeof stateRef.current) => {
    const air = jumpAirtime(JUMP_VY);          // frames a single ground-jump lasts
    const reach = st.worldSpeed * air;         // px the world scrolls during that jump
    const rise = jumpRise(JUMP_VY);            // px a single jump climbs
    const bandTop = canvas.height * 0.30;
    const bandBot = canvas.height * 0.84;
    let last = st.coins[st.coins.length - 1];
    while (!last || last.x < canvas.width + 140) {
      const prevX = last ? last.x : st.player.x;
      const prevY = last ? last.y : st.player.y + PH / 2;
      const r = Math.max(13, 26 - st.level * 1.1);
      // Decide vertical move first; a higher target needs a shorter hop, so couple dx to it.
      const upMax = rise * 0.42;
      const dropMax = 60 + st.level * 14;
      const delta = -upMax + Math.random() * (upMax + dropMax);
      let ny = prevY + delta;
      ny = Math.max(bandTop, Math.min(bandBot, ny));
      const goingUp = ny < prevY - 8;
      let gapFrac = 0.40 + Math.random() * 0.18 + Math.min(0.20, st.level * 0.012);
      if (goingUp) gapFrac = Math.min(gapFrac, 0.5);   // less airtime budget when climbing
      const dx = reach * gapFrac + r + PW * 0.3;       // clear a real gap edge-to-edge
      const coin: Coin = { x: prevX + dx, y: ny, r, id: st.coinIdInc++, landed: false, pulse: Math.random() * 6 };
      st.coins.push(coin);
      last = coin;
    }
  };

  const resetGame = (canvas: HTMLCanvasElement) => {
    const st = stateRef.current;
    st.coins = []; st.particles = [];
    st.distance = 0; st.bonus = 0; st.worldSpeed = BASE_SPEED; st.level = 1;
    st.gameTicks = 0; st.coinIdInc = 0; st.jumpBuffer = 0; st.bannerLife = 0; st.curScore = 0;
    // Starting coin sits directly under the player so the run begins grounded.
    const startR = 46, startY = canvas.height * 0.6;
    st.coins.push({ x: 360, y: startY, r: startR, id: st.coinIdInc++, landed: true, pulse: 0 });
    st.player = { x: 360, y: startY - startR - PH / 2, vy: 0, grounded: true, jumps: 0, stretch: 1, coyote: 0 };
    // Parallax starfield.
    st.stars = [];
    for (let i = 0; i < 70; i++) st.stars.push({ x: Math.random() * canvas.width, y: Math.random() * canvas.height, z: 0.2 + Math.random() * 0.9 });
    ensureCoins(canvas, st);
  };

  const groundJump = (st: typeof stateRef.current) => {
    const p = st.player;
    p.vy = JUMP_VY; p.grounded = false; p.coyote = 0; p.jumps = 1; p.stretch = 1.35;
    synthRef.current?.playJump();
  };

  const doJump = () => {
    const st = stateRef.current;
    const p = st.player;
    if (p.grounded || p.coyote > 0) { groundJump(st); }
    else if (p.jumps < 2) { p.vy = AIR_JUMP_VY; p.jumps++; p.stretch = 1.45; synthRef.current?.playJump(); }
    else { st.jumpBuffer = JUMP_BUFFER_FRAMES; }   // remember the press; fire it on the next landing
  };
  const doJumpRef = useRef(doJump);
  doJumpRef.current = doJump;

  const startGame = () => {
    refreshSkin();
    if (!synthRef.current) { try { synthRef.current = new ArcadeSynth(); } catch { /* audio optional */ } }
    synthRef.current?.setMuted(isMuted);
    synthRef.current?.setIntensity(4);
    synthRef.current?.startLoop();
    const canvas = canvasRef.current;
    if (canvas) resetGame(canvas);
    endedRef.current = false;
    submittedRef.current = false;
    setLbState('idle'); setLbRank(null); setLbError(''); setLbHandle('');
    setGameOver(false); setShowIntro(false); setIsPlaying(true);
  };

  const playAgain = () => {
    setGameOver(false);
    startGame();
  };

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

      // Distance / score / level.
      st.distance += st.worldSpeed;
      st.curScore = Math.floor(st.distance) + st.bonus;
      const newLevel = 1 + Math.floor(st.distance / LEVEL_DIST);
      if (newLevel > st.level) {
        st.level = newLevel;
        st.worldSpeed = Math.min(MAX_SPEED, BASE_SPEED + (newLevel - 1) * 0.6);
        st.bannerText = `NÍVEL ${newLevel}`;
        st.bannerLife = 90;
        synthRef.current?.setIntensity(newLevel * 4);
        synthRef.current?.playCombo(Math.min(newLevel, 6));
      }
      if (st.bannerLife > 0) st.bannerLife--;

      // Scroll the world.
      for (const c of st.coins) c.x -= st.worldSpeed;
      st.coins = st.coins.filter(c => c.x + c.r > -40);
      for (const s of st.stars) { s.x -= st.worldSpeed * s.z * 0.6; if (s.x < -2) { s.x = canvas.width + 2; s.y = Math.random() * canvas.height; } }
      ensureCoins(canvas, st);

      // Gravity + integrate.
      p.vy = Math.min(p.vy + GRAVITY, TERMINAL_VY);
      p.y += p.vy;
      p.stretch += (1 - p.stretch) * 0.2;   // ease squash/stretch back to neutral

      // Footing: re-test every frame so coins sliding out from under the player drop them.
      const wasGrounded = p.grounded;
      p.grounded = false;
      const feetY = p.y + PH / 2;
      for (const c of st.coins) {
        if (p.vy < 0) continue;                         // only land while falling/level
        const top = c.y - c.r;
        if (Math.abs(p.x - c.x) < c.r + PW * 0.34 && feetY >= top - 2 && feetY <= top + Math.max(16, c.r)) {
          p.y = top - PH / 2;
          p.vy = 0;
          p.grounded = true;
          p.jumps = 0;
          if (!c.landed) {
            c.landed = true;
            st.bonus += 30 * st.level;
            spawnBurst(st.particles, c.x, top, '#ffe65c', { count: 9, speed: 3, angle: -Math.PI / 2, spread: Math.PI, life: 26 });
            synthRef.current?.playCrystal();
          }
          break;
        }
      }
      // Coyote bookkeeping.
      if (wasGrounded && !p.grounded) p.coyote = COYOTE_FRAMES;
      else if (!p.grounded && p.coyote > 0) p.coyote--;

      // Buffered jump fires the instant we have footing again.
      if (st.jumpBuffer > 0) {
        st.jumpBuffer--;
        if (p.grounded || p.coyote > 0) { groundJump(st); st.jumpBuffer = 0; }
      }

      updateParticles(st.particles, 0.18);

      // Death: fell past the bottom.
      if (p.y - PH / 2 > canvas.height + 50) endRun();
    };

    const draw = () => {
      const st = stateRef.current;
      const w = canvas.width, h = canvas.height;
      // Background.
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#0a0a12'); g.addColorStop(1, '#13060d');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      // Stars.
      ctx.save();
      for (const s of st.stars) { ctx.globalAlpha = 0.12 + s.z * 0.4; ctx.fillStyle = '#ffffff'; ctx.fillRect(s.x, s.y, s.z * 2, s.z * 2); }
      ctx.restore();

      // Coins.
      for (const c of st.coins) {
        const pulse = 1 + Math.sin(st.gameTicks * 0.12 + c.pulse) * 0.06;
        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.shadowBlur = 18; ctx.shadowColor = '#ffd700';
        ctx.fillStyle = c.landed ? '#fff2a8' : '#ffd23a';
        ctx.beginPath(); ctx.arc(0, 0, c.r * pulse, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.lineWidth = Math.max(2, c.r * 0.16); ctx.strokeStyle = '#a8780a';
        ctx.beginPath(); ctx.arc(0, 0, c.r * pulse * 0.66, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 0.85; ctx.fillStyle = '#fffbe6';
        ctx.beginPath(); ctx.arc(-c.r * 0.28, -c.r * 0.3, c.r * 0.16, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }

      // Particles.
      drawParticles(ctx, st.particles);

      // Player (with squash/stretch).
      const p = st.player;
      const sy = p.stretch, sx = 2 - p.stretch;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.scale(sx, sy);
      drawSkinShape(ctx, skinRef.current.shape, skinRef.current.color, PW, PH, st.gameTicks);
      ctx.restore();

      // HUD (on-canvas to avoid per-frame React churn).
      ctx.save();
      ctx.fillStyle = '#ffffff';
      ctx.font = '900 44px Helvetica, Arial, sans-serif';
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(String(st.curScore).padStart(0), 28, 24);
      ctx.font = '700 13px monospace';
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillText('DISTÂNCIA', 30, 72);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#ffd23a';
      ctx.font = '900 22px Helvetica, Arial, sans-serif';
      ctx.fillText(`NÍVEL ${st.level}`, w - 28, 26);
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.font = '700 12px monospace';
      ctx.fillText(`RECORDE ${Math.max(best, st.curScore)}`, w - 28, 56);
      ctx.restore();

      // Level banner.
      if (st.bannerLife > 0) {
        const a = Math.min(1, st.bannerLife / 30);
        ctx.save();
        ctx.globalAlpha = a;
        ctx.fillStyle = '#ffd23a';
        ctx.shadowBlur = 24; ctx.shadowColor = '#ffd23a';
        ctx.font = '900 60px Helvetica, Arial, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(st.bannerText, w / 2, h * 0.32);
        ctx.restore();
      }
    };

    const loop = () => {
      update();
      draw();
      if (!endedRef.current) rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    // Input.
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

      {/* Mute toggle (always available). */}
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
            Salta de moeda em moeda. As moedas são o teu único apoio — falha o salto e cais.
            Quanto mais longe, mais rápido. <b className="text-white/85">Distância = pontos.</b>
          </p>
          <p className="mt-3 text-[12px] text-white/45 font-mono">ESPAÇO / TOCA para saltar &middot; toca outra vez no ar para salto duplo</p>
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
          <p className="text-[12px] text-white/50 mt-1">distância {finalScore >= best ? '· novo recorde 🏆' : `· recorde ${best}`}</p>

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
