'use client';

import React, { useEffect, useRef, useState } from 'react';
import { BrandText } from './BrandText';

// ---- INTERFACES ----
interface Player {
  x: number; y: number; width: number; height: number;
  vy: number; isGrounded: boolean; jumpCount: number; stretch: number;
}
interface Platform {
  x: number; y: number; baseY: number; width: number; height: number;
  styleType: 'solid' | 'pillar' | 'glitch'; waveOffset: number;
}
interface Crystal {
  x: number; y: number; size: number; collected: boolean; pulseOffset: number;
  isShield?: boolean;
  isTripleJump?: boolean;
  isCurse?: boolean;
  isMagnet?: boolean;
}
interface Boss {
  x: number; y: number; width: number; height: number;
  health: number; maxHealth: number;
  vx: number; phase: number; animFrame: number;
  alive: boolean; name: string;
  shootCooldown: number;
}
interface Alien {
  type: 'normal' | 'super' | 'speedy';
  health: number;
  zigzagPhase: number;
  id: number;
  x: number; y: number;
  width: number; height: number;
  vx: number;       // approach speed (negative = moving left)
  animFrame: number;
  alive: boolean;
}
interface Projectile {
  x: number; y: number; width: number; height: number; vx: number; alive: boolean;
}
interface Meteor {
  id: number; x: number; y: number; size: number;
  vx: number; vy: number; rotation: number; alive: boolean;
}
interface Particle {
  x: number; y: number; vx: number; vy: number;
  color: string; alpha: number; life: number; size: number;
}
interface FloatText {
  id: number; text: string; x: number; y: number;
  vy: number; alpha: number; life: number;
}
interface MatrixColumn { x: number; y: number; speed: number; chars: string[]; }
interface BannerText {
  text: string; x: number; y: number;
  speed: number; size: number; alpha: number; driftY: number;
}

// ---- SYNTH ----
class ArcadeSynth {
  ctx: AudioContext;
  filter: BiquadFilterNode;
  masterGain: GainNode;
  isPlaying = false;
  intensityLevel = 0;
  nextNoteTime = 0;
  noteIndex = 0;
  scheduleInterval: number | null = null;
  scaleNotes = [55, 65.41, 73.42, 82.41, 98, 110, 130.81, 146.83, 164.81, 196, 220];
  rhythmGrid = [1, 0, 1, 1, 0, 1, 0, 1];

  constructor() {
    this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.filter = this.ctx.createBiquadFilter();
    this.masterGain = this.ctx.createGain();
    this.filter.type = 'lowpass'; this.filter.Q.value = 9;
    this.masterGain.gain.value = 0.14;
    this.filter.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);
  }

  startLoop() {
    if (this.isPlaying) return;
    this.isPlaying = true;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.nextNoteTime = this.ctx.currentTime + 0.05;
    this.noteIndex = 0;
    this.scheduleInterval = window.setInterval(() => {
      while (this.nextNoteTime < this.ctx.currentTime + 0.1) {
        if (this.rhythmGrid[this.noteIndex % this.rhythmGrid.length] === 1) this.emitNote(this.nextNoteTime);
        const bpm = 135 + this.intensityLevel * 9;
        this.nextNoteTime += (60 / bpm) * 0.25;
        this.noteIndex++;
      }
    }, 30);
  }

  stopLoop() {
    this.isPlaying = false;
    if (this.scheduleInterval) { window.clearInterval(this.scheduleInterval); this.scheduleInterval = null; }
  }

  setIntensity(n: number) { this.intensityLevel = Math.min(15, Math.floor(n / 4)); }

  emitNote(time: number) {
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = this.intensityLevel > 8 ? 'sawtooth' : 'square';
    let idx = Math.min((this.noteIndex % 6) + Math.floor(this.intensityLevel / 3), this.scaleNotes.length - 1);
    let freq = this.scaleNotes[idx];
    if (this.intensityLevel > 4 && this.noteIndex % 4 === 0) freq *= 2;
    if (this.intensityLevel > 10 && this.noteIndex % 8 >= 6) freq *= 2;
    osc.frequency.setValueAtTime(freq, time);
    this.filter.frequency.setValueAtTime(450 + this.intensityLevel * 140, time);
    this.filter.frequency.exponentialRampToValueAtTime(130, time + 0.14);
    env.gain.setValueAtTime(0, time);
    env.gain.linearRampToValueAtTime(0.5, time + 0.006);
    env.gain.exponentialRampToValueAtTime(0.001, time + 0.12);
    osc.connect(env); env.connect(this.filter);
    osc.start(time); osc.stop(time + 0.15);
  }

  sfx(f0: number, f1: number, type: OscillatorType, dur: number, vol: number) {
    if (this.ctx.state === 'suspended') this.ctx.resume();
    const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, this.ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(f1, this.ctx.currentTime + dur);
    g.gain.setValueAtTime(vol, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
    o.connect(g); g.connect(this.ctx.destination);
    o.start(); o.stop(this.ctx.currentTime + dur + 0.01);
  }

  playJump()      { this.sfx(200, 400, 'sine',     0.12, 0.18); }
  playBlaster()   { this.sfx(880, 110, 'sawtooth', 0.18, 0.28); }
  playWideShot()  { this.sfx(660, 80,  'sawtooth', 0.28, 0.38); }
  playRapidShot() {
    this.sfx(1100, 200, 'square', 0.12, 0.3);
    setTimeout(() => this.sfx(1300, 250, 'square', 0.12, 0.3), 120);
    setTimeout(() => this.sfx(1500, 300, 'square', 0.12, 0.3), 240);
  }
  playNova()      {
    this.sfx(200, 40, 'sawtooth', 0.8, 0.5);
    setTimeout(() => this.sfx(800, 1600, 'sine', 0.6, 0.4), 100);
    setTimeout(() => this.sfx(400, 20,   'triangle', 0.7, 0.45), 200);
  }
  playChargeUp()  { this.sfx(300, 1200, 'sine', 0.05, 0.08); } // subtle rising hum
  playExplosion() { this.sfx(180,  35, 'triangle', 0.28, 0.40); }
  playCrystal()   { this.sfx(520, 900, 'sine',     0.22, 0.20); }
  playCharge()    { this.sfx(300, 700, 'sine',     0.30, 0.25); }
  playHurt()      { this.sfx(120,  60, 'sawtooth', 0.30, 0.40); }
  playCombo(n: number) {
    // Rising pitch per combo level
    this.sfx(400 + n * 80, 800 + n * 80, 'sine', 0.25, 0.22);
  }
  playShield()    { this.sfx(200, 1200, 'sine',    0.45, 0.28); } // big rising sweep
  playShieldBreak(){ this.sfx(600, 80,  'sawtooth',0.30, 0.35); }
  playSpeedBoost(){ this.sfx(300, 1400, 'triangle',0.35, 0.30); } // fast ascending
  playSuperKill() {
    this.sfx(800, 40,  'sawtooth', 0.6, 0.5);
    setTimeout(() => this.sfx(600, 30, 'square',   0.4, 0.4), 80);
    setTimeout(() => this.sfx(400, 20, 'triangle', 0.5, 0.45), 160);
  }
  playScoreMult() { this.sfx(400, 1600, 'sine',    0.4, 0.3); }
  playTripleJump(){ this.sfx(300, 1200, 'triangle', 0.3, 0.25); }
  playCurse()     { this.sfx(200, 80,   'sawtooth', 0.4, 0.35); }
  playPerkDraft() { this.sfx(500, 1800, 'sine',     0.5, 0.3); }
  playMagnet()    { this.sfx(350, 900,  'sine',     0.3, 0.22); }
  playBossIntro() {
    this.sfx(120, 40, 'sawtooth', 0.8, 0.5);
    setTimeout(() => this.sfx(80, 30, 'square', 0.6, 0.4), 200);
  }
  playBossHit()   { this.sfx(400, 150, 'sawtooth', 0.2, 0.3); }
  playBossKill()  {
    this.sfx(600, 20, 'sawtooth', 1.0, 0.5);
    setTimeout(() => this.sfx(800, 30, 'square', 0.7, 0.45), 120);
    setTimeout(() => this.sfx(1200, 40, 'triangle', 0.5, 0.4), 240);
  }
  setMuted(m: boolean) { this.masterGain.gain.setTargetAtTime(m ? 0 : 0.14, this.ctx.currentTime, 0.1); }
}

// ---- COMPONENT ----
export const ArcadeCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const synthRef  = useRef<ArcadeSynth | null>(null);
  const frameRef  = useRef<number>(0);
  const textIdRef = useRef(0);

  const [score,          setScore]          = useState(0);
  const [crystalCount,   setCrystalCount]   = useState(0);
  const [blasterCharges, setBlasterCharges] = useState(0);
  const [stability,      setStability]      = useState(100);
  const [isPlaying,      setIsPlaying]      = useState(true);
  const [isMuted,        setIsMuted]        = useState(false);
  const [floatTexts,     setFloatTexts]     = useState<FloatText[]>([]);
  const [comboCount,     setComboCount]     = useState(0);
  const [hasShield,      setHasShield]      = useState(false);
  const [speedBoosted,   setSpeedBoosted]   = useState(false);
  const [tripleJumpActive, setTripleJumpActive] = useState(false);
  const [scoreMultActive,  setScoreMultActive]  = useState(false);
  const [magnetActive,     setMagnetActive]     = useState(false);
  const [curseActive,      setCurseActive]      = useState<string | null>(null);
  const [perkDraft,        setPerkDraft]        = useState<string[] | null>(null);
  const [personalBest,     setPersonalBest]     = useState(() => {
    try { return parseInt(localStorage.getItem('arcade_pb') || '0'); } catch { return 0; }
  });
  const [runStreak,        setRunStreak]        = useState(0);
  const [weaponTier,       setWeaponTier]       = useState(0);
  const [chargeLevel,      setChargeLevel]      = useState(0); // 0-1 for HUD bar
  const [novaReady,        setNovaReady]        = useState(false);
  const spaceHeldRef = useRef(false); // track space held outside stateRef for keyup

  const [leaderboard] = useState([
    { name: 'ALMA_CORE', score: 85400 },
    { name: 'OURO_CHEF', score: 62100 },
    { name: 'DISSENT_9', score: 39500 },
  ]);

  const PW = 38, PH = 52;

  const stateRef = useRef({
    player: { x: 140, y: 300, width: PW, height: PH, vy: 0, isGrounded: false, jumpCount: 0, stretch: 1 } as Player,
    platforms:    [] as Platform[],
    crystals:     [] as Crystal[],
    aliens:       [] as Alien[],
    projectiles:  [] as Projectile[],
    meteors:      [] as Meteor[],
    particles:    [] as Particle[],
    floatTexts:   [] as FloatText[],
    matrixColumns:[] as MatrixColumn[],
    bannerTexts:  [] as BannerText[],
    gameTicks:         0,
    lastLandingTick:   0,
    baseSpeed:         5.2,
    coreStability:     100,
    lastTime:          0,
    fpsInterval:       1000 / 60,
    screenFlash:       0,
    screenShake:       0,
    milesTraveled:     0,
    comboCount:        0,
    crystalsTotal:     0,   // all-time crystal count
    crystalsSinceCharge: 0, // counts toward next blaster charge (resets every 5)
    blasterCharges:    0,   // stockpile of charges
    alienIdInc:        0,
    meteorIdInc:       0,
    coyoteCounter:     0,
    jumpBufferCounter: 0,
    // ---- REWARD MECHANICS ----
    killCombo:         0,
    shieldActive:      false,
    speedBoostTicks:   0,
    crystalsSinceShield: 0,
    tripleJumpTicks:   0,    // countdown for triple jump power-up
    scoreMultTicks:    0,    // countdown for ×2 score multiplier
    crystalsSinceTriple: 0,  // track when to spawn triple jump crystal
    superAlienSpawned: false,
    calmTicks:         0,
    boss:              null as any,
    bossProjectiles:   [] as any[],
    magnetTicks:       0,
    curseTicks:        0,
    curseType:         '' as string,
    perks:             [] as string[],
    crystalsSincePerks: 0,
    crystalsSinceBoss:  0,
    bossSpeedReliefTicks: 0, // post-kill speed ease — counts down from 600 (10 sec)
    streakTicks:        0,
    runStreakScore:      0,
    perkDraftPending:   false,
    perkOptions:        [] as string[],
    crystalsSinceMagnet: 0,
    crystalsSinceCurse:  0,
    // ---- WEAPON SYSTEM ----
    weaponTier:       0,   // 0=standard 1=wide 2=rapid 3=nova
    chargeHeld:       0,   // ticks space has been held (0 = not held)
    chargeMax:        90,  // 1.5 sec full charge
    novaUnlocked:     false, // one-use, earned from boss kill
    warpToast: { active: false, text: '', life: 0, maxLife: 90, y: 0 },
  });

  const feedbackWords = ['SOUL', 'ALMA', 'DOBRO', 'OURO', 'RAW', 'WILD', 'ENERGY', 'DISSENT'];

  // ---- SYNTH ----
  useEffect(() => {
    if (!synthRef.current) synthRef.current = new ArcadeSynth();
    if (isPlaying) synthRef.current.startLoop();
    else synthRef.current.stopLoop();
    return () => synthRef.current?.stopLoop();
  }, [isPlaying]);

  const toggleMute = () => {
    if (!synthRef.current) return;
    const next = !isMuted;
    synthRef.current.setMuted(next);
    setIsMuted(next);
  };

  // ---- WEAPON SYSTEM ----
  // Space held = charge builds, release = fires based on charge level + weapon tier
  const releaseBlaster = () => {
    const state = stateRef.current;
    if (!isPlaying || state.blasterCharges < 1) { state.chargeHeld = 0; setChargeLevel(0); return; }

    const chargeRatio = Math.min(1, state.chargeHeld / state.chargeMax);
    const tier = state.weaponTier;
    state.chargeHeld = 0;
    setChargeLevel(0);

    // Nova — one use, ignores charge, clears screen
    if (state.novaUnlocked && chargeRatio >= 0.9 && tier >= 2) {
      state.novaUnlocked = false; state.blasterCharges--;
      setNovaReady(false); setBlasterCharges(state.blasterCharges);
      synthRef.current?.playNova();
      // Ring expands outward — spawn 3 wide projectiles stacked vertically
      for (let i = 0; i < 5; i++) {
        state.projectiles.push({
          x: state.player.x + PW + 4,
          y: i * (window.innerHeight / 5),
          width: 160, height: Math.round(window.innerHeight / 5) + 10,
          vx: 22, alive: true,
        });
      }
      state.screenFlash = 0.7; state.calmTicks = 60 * 3;
      warpToastRef(state, 'NOVA DISCHARGED — FULL CLEAR');
      return;
    }

    state.blasterCharges--;
    setBlasterCharges(state.blasterCharges);

    const px = state.player.x + PW + 4;
    const py = state.player.y + PH / 2;

    if (tier === 0 || chargeRatio < 0.4) {
      // STANDARD — 7% height tight beam
      synthRef.current?.playBlaster();
      const h = Math.round(window.innerHeight * 0.07);
      state.projectiles.push({ x: px, y: py - h/2, width: 80, height: h, vx: 20, alive: true });

    } else if (tier === 1 || chargeRatio < 0.7) {
      // WIDE — 18% height, unlocked at combo ×3
      synthRef.current?.playWideShot();
      const h = Math.round(window.innerHeight * 0.18);
      state.projectiles.push({ x: px, y: py - h/2, width: 110, height: h, vx: 18, alive: true });
      // Bonus: second thinner beam slightly offset
      const h2 = Math.round(window.innerHeight * 0.06);
      state.projectiles.push({ x: px + 20, y: py - h/2 - h2 - 4, width: 70, height: h2, vx: 22, alive: true });
      state.projectiles.push({ x: px + 20, y: py + h/2 + 4, width: 70, height: h2, vx: 22, alive: true });

    } else if (tier === 2 || chargeRatio < 0.95) {
      // RAPID — 3 quick shots, unlocked at combo ×5
      synthRef.current?.playRapidShot();
      const h = Math.round(window.innerHeight * 0.1);
      for (let i = 0; i < 3; i++) {
        setTimeout(() => {
          if (!stateRef.current.blasterCharges && i > 0) return; // don't fire if out
          stateRef.current.projectiles.push({ x: px + i * 35, y: py - h/2, width: 65, height: h, vx: 24 + i * 2, alive: true });
        }, i * 100);
      }

    } else {
      // FULL CHARGE — fire current tier at max power with extra visual
      synthRef.current?.playWideShot();
      const h = Math.round(window.innerHeight * (0.07 + tier * 0.06));
      state.projectiles.push({ x: px, y: py - h/2, width: 120, height: h, vx: 22, alive: true });
      state.screenFlash = 0.2;
    }
  };

  // Needed inside canvas useEffect closure
  const warpToastRef = (state: any, text: string) => {
    state.warpToast.active = true; state.warpToast.text = text;
    state.warpToast.life = state.warpToast.maxLife; state.warpToast.y = window.innerHeight * 0.22;
  };

  const handleCanvasClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (synthRef.current?.ctx.state === 'suspended') synthRef.current.ctx.resume();
    // Click fires standard shot immediately
    const state = stateRef.current;
    if (!isPlaying || state.blasterCharges < 1) return;
    state.blasterCharges--; setBlasterCharges(state.blasterCharges);
    synthRef.current?.playBlaster();
    const h = Math.round(window.innerHeight * 0.07);
    const py = state.player.y + PH / 2;
    state.projectiles.push({ x: state.player.x + PW + 4, y: py - h/2, width: 80, height: h, vx: 20, alive: true });
  };

  // ---- MATRIX RAIN ----
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const state = stateRef.current;
    state.matrixColumns = [];
    const cols = Math.floor(window.innerWidth / 24);
    for (let i = 0; i < cols; i++) {
      const chars: string[] = [];
      for (let j = 0; j < Math.floor(Math.random() * 14) + 6; j++) chars.push(Math.random() > 0.5 ? '1' : '0');
      state.matrixColumns.push({ x: i * 24, y: Math.random() * -window.innerHeight, speed: Math.random() * 3.5 + 2, chars });
    }
  }, []);

  // ---- MAIN LOOP ----
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    const state = stateRef.current;

    // ---- LAYOUT ----
    const spawnBanner = () => {
      const pool = ['ENTROPY SIMULATION', 'CORE STABILITY LOSS', 'CRITICAL LIFELINE', 'SURVIVAL PARAMETER', 'DISSENT MATRIX'];
      state.bannerTexts.push({ text: pool[Math.floor(Math.random() * pool.length)], x: canvas.width + 160, y: Math.random() * canvas.height * 0.45 + 100, speed: Math.random() * 1.5 + 1, size: Math.floor(Math.random() * 40) + 45, alpha: Math.random() * 0.03 + 0.015, driftY: (Math.random() - 0.5) * 0.2 });
    };

    const resize = () => {
      canvas.width = window.innerWidth; canvas.height = window.innerHeight;
      state.bannerTexts = []; for (let i = 0; i < 3; i++) spawnBanner();
    };
    window.addEventListener('resize', resize); resize();

    const resetLayout = () => {
      const ty = canvas.height - 180;
      state.platforms = [{ x: 0, y: ty, baseY: ty, width: 1100, height: 600, styleType: 'solid', waveOffset: 0 }];
      state.crystals  = [{ x: 500, y: ty - 50, size: 24, collected: false, pulseOffset: 0 }];
      state.aliens = []; state.projectiles = []; state.meteors = [];
      state.particles = []; state.floatTexts = [];
      state.gameTicks = 0; state.coreStability = 100; state.milesTraveled = 0;
      state.crystalsTotal = 0; state.crystalsSinceCharge = 0; state.blasterCharges = 0;
      state.comboCount = 0;
      setScore(0); setCrystalCount(0); setBlasterCharges(0); setStability(100);
      state.warpToast.active = false;
    };
    if (state.gameTicks === 0 && isPlaying) resetLayout();

    // ---- HELPERS ----
    const burst = (x: number, y: number, color: string, count: number, force: number) => {
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2; const sp = Math.random() * force + 1.2;
        state.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, color, alpha: 1, life: Math.random() * 22 + 14, size: Math.random() * 3 + 1 });
      }
    };

    const floatFeedback = (x: number, y: number, word?: string) => {
      const w = word ?? feedbackWords[Math.floor(Math.random() * feedbackWords.length)];
      textIdRef.current++;
      state.floatTexts.push({ id: textIdRef.current, text: w, x, y, vy: -2.2 - Math.random() * 1.8, alpha: 1, life: 45 });
    };

    const warpToast = (text: string) => {
      state.warpToast.active = true; state.warpToast.text = text;
      state.warpToast.life = state.warpToast.maxLife; state.warpToast.y = window.innerHeight * 0.22;
    };

    // ---- JUMP ----
    const doJump = () => {
      const p = state.player;
      if (p.isGrounded || state.coyoteCounter > 0) {
        p.vy = -14.6; p.isGrounded = false; p.jumpCount = 1; p.stretch = 1.35;
        state.coyoteCounter = 0; state.jumpBufferCounter = 0;
        burst(p.x + p.width / 2, p.y + p.height, '#ff4e3e', 14, 2.5);
        synthRef.current?.playJump();
      } else if (p.jumpCount === 1) {
        p.vy = -12.4; p.jumpCount = 2; p.stretch = 1.45; state.jumpBufferCounter = 0;
        burst(p.x + p.width / 2, p.y + p.height / 2, '#ffe65c', 20, 3.5);
        floatFeedback(p.x, p.y - 20, 'DOUBLE LEAP');
        synthRef.current?.playJump();
      } else if (p.jumpCount === 2 && !p.isGrounded && state.tripleJumpTicks > 0) {
        // Triple jump — only when power-up active
        p.vy = -11.5; p.jumpCount = 3; p.stretch = 1.55; state.jumpBufferCounter = 0;
        burst(p.x + p.width / 2, p.y + p.height / 2, '#cc44ff', 30, 5);
        burst(p.x + p.width / 2, p.y + p.height / 2, '#ffffff', 15, 4);
        floatFeedback(p.x, p.y - 20, 'TRIPLE LEAP!');
        synthRef.current?.playTripleJump();
      } else if (p.jumpCount === 2 && !p.isGrounded && state.tripleJumpTicks <= 0) {
        // Normal gravity stamp (no triple jump)
        p.vy = 18.5; p.jumpCount = 3; state.jumpBufferCounter = 0;
        burst(p.x + p.width / 2, p.y, '#ffffff', 15, 4.5);
        floatFeedback(p.x, p.y - 20, 'GRAVITY STAMP');
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isPlaying) return;

      // Perk draft selection — 1/2/3
      if (state.perkDraftPending && ['Digit1','Digit2','Digit3'].includes(e.code)) {
        const idx = parseInt(e.code.replace('Digit','')) - 1;
        const chosen = state.perkOptions[idx];
        if (chosen) {
          state.perks.push(chosen);
          state.perkDraftPending = false;
          setPerkDraft(null);
          warpToast(`PERK ACQUIRED: ${chosen.toUpperCase()}`);
          synthRef.current?.playPerkDraft();
          burst(state.player.x + PW/2, state.player.y, '#ffe65c', 35, 7);
        }
        return;
      }

      // F or Enter — instant standard shot
      if (e.code === 'KeyF' || e.code === 'Enter') {
        const p = state.player;
        if (state.blasterCharges < 1) return;
        state.blasterCharges--; setBlasterCharges(state.blasterCharges);
        synthRef.current?.playBlaster();
        const h = Math.round(window.innerHeight * 0.07);
        state.projectiles.push({ x: p.x + PW + 4, y: p.y + PH/2 - h/2, width: 80, height: h, vx: 20, alive: true });
        return;
      }

      // W or ArrowUp — always jump
      if (e.code === 'ArrowUp' || e.code === 'KeyW') { state.jumpBufferCounter = 6; doJump(); return; }

      // Space — start charging if has charges, else jump
      if (e.code === 'Space' && !spaceHeldRef.current) {
        spaceHeldRef.current = true;
        if (state.blasterCharges > 0) {
          // Start charging — don't fire yet, wait for keyup
          state.chargeHeld = 1;
        } else {
          // No charges — jump
          state.jumpBufferCounter = 6;
          doJump();
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spaceHeldRef.current = false;
        if (state.chargeHeld > 0) {
          // Release — fire based on charge
          releaseBlaster();
        }
        state.chargeHeld = 0;
        setChargeLevel(0);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    // ---- SPAWN ALIEN ----
    const spawnAlien = (tier: number, forceType?: 'normal' | 'super' | 'speedy') => {
      state.alienIdInc++;
      const p = state.player;
      const spawnY = p.y + p.height / 2 - 18 + (Math.random() - 0.5) * 180;

      // Determine type
      let type: 'normal' | 'super' | 'speedy' = forceType ?? 'normal';
      if (!forceType) {
        const roll = Math.random();
        if (roll < 0.12 && tier >= 3 && !state.superAlienSpawned) type = 'super';
        else if (roll < 0.35) type = 'speedy';
      }

      const isSuper  = type === 'super';
      const isSpeedy = type === 'speedy';
      const size     = isSuper ? 60 : isSpeedy ? 24 : 36;
      const speed    = isSuper
        ? 2 + tier * 0.15                          // slow and menacing
        : isSpeedy
          ? 5 + tier * 0.4 + Math.random() * 2     // fast
          : 3 + tier * 0.28 + Math.random() * 1.5; // normal

      if (isSuper) state.superAlienSpawned = true;

      state.aliens.push({
        id: state.alienIdInc,
        x: canvas.width + 60 + Math.random() * 100,
        y: Math.max(40, Math.min(canvas.height - 120, spawnY)),
        width: size, height: size,
        vx: -speed,
        animFrame: 0,
        alive: true,
        type,
        health: isSuper ? 2 : 1,
        zigzagPhase: Math.random() * Math.PI * 2,
      });
    };

    const spawnMeteor = (tier: number) => {
      state.meteorIdInc++;
      state.meteors.push({
        id: state.meteorIdInc,
        x: canvas.width + Math.random() * 200,
        y: -60,
        size: Math.floor(Math.random() * 22) + 18,
        vx: -(2 + Math.random() * 2 + tier * 0.1),
        vy: 3.5 + Math.random() * 3 + tier * 0.12,
        rotation: Math.random() * Math.PI,
        alive: true,
      });
    };

    // ---- UPDATE ----
    const update = () => {
      if (!isPlaying) return;
      // Freeze everything while perk draft is open — player hangs, world pauses
      if (state.perkDraftPending) return;
      state.gameTicks++;

      // Warp toast
      if (state.warpToast.active) { state.warpToast.life--; if (state.warpToast.life <= 0) state.warpToast.active = false; }

      // Stability drain — slow and steady, modified by curse/perk
      const hasPerkEarly = (name: string) => stateRef.current.perks.includes(name);
      const drainMultEarly = hasPerkEarly('drain halved') ? 0.5 : state.curseType === 'drain' ? 2.0 : 1;
      const drain = (0.04 + Math.min(state.crystalsTotal, 40) * 0.001) * drainMultEarly;
      state.coreStability = Math.max(0, state.coreStability - drain);
      setStability(Math.floor(state.coreStability));
      if (state.coreStability <= 0) {
        // Save personal best
        setScore(prev => {
          const final = prev;
          setPersonalBest(pb => {
            if (final > pb) {
              try { localStorage.setItem('arcade_pb', String(final)); } catch {}
              return final;
            }
            return pb;
          });
          return final;
        });
        setIsPlaying(false); return;
      }

      // Speed tier — based on crystals, capped gently
      const tier = Math.min(14, Math.floor(state.crystalsTotal / 5));
      // Endurance cap — tier 11+ locks difficulty so it's about sustaining, not surviving escalation
      const diffTier = Math.min(10, tier);

      // Invincibility countdown (from combo milestone)
      if (state.speedBoostTicks > 0) {
        state.speedBoostTicks--;
        if (state.speedBoostTicks === 0) setSpeedBoosted(false);
      }
      // Triple jump countdown
      if (state.tripleJumpTicks > 0) {
        state.tripleJumpTicks--;
        if (state.tripleJumpTicks === 0) setTripleJumpActive(false);
      }
      // Score multiplier countdown
      if (state.scoreMultTicks > 0) {
        state.scoreMultTicks--;
        if (state.scoreMultTicks === 0) setScoreMultActive(false);
      }
      // Calm countdown — suppresses visual chaos
      if (state.calmTicks > 0) state.calmTicks--;
      // Weapon charge — tick up while space held, play hum every 15 ticks
      if (state.chargeHeld > 0 && state.blasterCharges > 0) {
        state.chargeHeld = Math.min(state.chargeMax, state.chargeHeld + 1);
        setChargeLevel(state.chargeHeld / state.chargeMax);
        if (state.chargeHeld % 15 === 0) synthRef.current?.playChargeUp();
      }
      // Magnet countdown
      if (state.magnetTicks > 0) { state.magnetTicks--; if (state.magnetTicks === 0) setMagnetActive(false); }
      // Perk: crystal magnet always on
      if (hasPerkEarly('crystal magnet always') && state.magnetTicks === 0) { state.magnetTicks = 10; setMagnetActive(true); }
      // Curse countdown
      if (state.curseTicks > 0) { state.curseTicks--; if (state.curseTicks === 0) { setCurseActive(null); state.curseType = ''; } }
      // Run streak — ticks every second
      if (state.gameTicks % 60 === 0) {
        state.streakTicks++;
        setRunStreak(state.streakTicks);
      }

      // Apply active perks to worldSpeed
      const hasPerk = (name: string) => state.perks.includes(name);
      const drainMult = hasPerk('drain halved') ? 0.5 : state.curseType === 'drain' ? 2.0 : 1;
      // Perk: blaster cooldown halved — handled in fireBlaster check
      // Perk: combo never resets — handled in hit section

      const worldSpeed = state.baseSpeed * (1 + diffTier * 0.06) * (state.curseType === 'fast' ? 1.35 : 1)
        * (state.bossSpeedReliefTicks > 0
            // ease back: starts at 0.55x, linearly returns to 1x over 10 sec
            ? 0.55 + (1 - state.bossSpeedReliefTicks / 600) * 0.45
            : 1);
      if (state.bossSpeedReliefTicks > 0) state.bossSpeedReliefTicks--;

      const p = state.player;
      state.milesTraveled += worldSpeed * 0.025;
      if (state.screenFlash > 0) state.screenFlash -= 0.07;
      if (state.screenShake > 0) state.screenShake = Math.max(0, state.screenShake - 0.08);
      if (state.jumpBufferCounter > 0) state.jumpBufferCounter--;
      if (p.isGrounded) state.coyoteCounter = 5;
      else if (state.coyoteCounter > 0) state.coyoteCounter--;

      // Banners + matrix
      if (state.gameTicks % 150 === 0 && state.bannerTexts.length < 5) spawnBanner();
      state.bannerTexts.forEach(b => { b.x -= worldSpeed * 0.2 + b.speed; b.y += b.driftY; });
      state.bannerTexts = state.bannerTexts.filter(b => b.x > -500);
      state.matrixColumns.forEach(col => { col.y += col.speed; if (col.y > canvas.height) col.y = Math.random() * -140 - 40; });

      // Platforms scroll — NO oscillation, always stable
      state.platforms.forEach(pl => { pl.x -= worldSpeed; });

      // Crystals scroll + magnet pull
      state.crystals.forEach(c => {
        c.x -= worldSpeed;
        // Magnet — pull uncollected crystals toward player
        if (state.magnetTicks > 0 && !c.collected) {
          const dx = (p.x + PW/2) - (c.x + c.size/2);
          const dy = (p.y + PH/2) - (c.y + c.size/2);
          const dist = Math.hypot(dx, dy);
          if (dist < 320) {
            c.x += (dx / dist) * 4.5;
            c.y += (dy / dist) * 4.5;
          }
        }
      });

      // Player physics
      p.vy += 0.76; if (p.vy > 20) p.vy = 20;
      p.y += p.vy;
      p.stretch += (1 - p.stretch) * 0.15;
      if (!p.isGrounded && Math.abs(p.vy) > 2) p.stretch = 1 + Math.abs(p.vy) * 0.025;

      let onGround = false;
      for (const pl of state.platforms) {
        if (p.x + p.width > pl.x && p.x < pl.x + pl.width &&
            p.y + p.height >= pl.y && p.y + p.height - p.vy <= pl.y + 18) {
          if (!p.isGrounded && p.vy > 5) { p.stretch = 0.7; burst(p.x + p.width / 2, pl.y, '#ff4e3e', 8, 2); }
          p.y = pl.y - p.height; p.vy = 0; p.isGrounded = true; p.jumpCount = 0;
          state.comboCount = 0; state.lastLandingTick = state.gameTicks; onGround = true;
          if (state.jumpBufferCounter > 0) doJump();
        }
      }
      if (!onGround) p.isGrounded = false;

      // Fall off bottom
      if (p.y > canvas.height) {
        state.coreStability = Math.max(0, state.coreStability - 25);
        p.y = canvas.height - 380; p.vy = -8;
        state.screenShake = 3; state.screenFlash = 0.35;
        synthRef.current?.playHurt();
      }

      // ---- PROJECTILES ----
      state.projectiles.forEach(pr => { pr.x += pr.vx; if (pr.x > canvas.width + 80) pr.alive = false; });
      state.projectiles = state.projectiles.filter(pr => pr.alive);

      // ---- ALIENS ----
      state.aliens.forEach(al => {
        if (!al.alive) return;
        al.x += al.vx;
        al.animFrame++;

        if (al.type === 'speedy') {
          // Zigzag vertically
          al.zigzagPhase += 0.12;
          al.y += Math.sin(al.zigzagPhase) * 4;
          al.y = Math.max(30, Math.min(canvas.height - al.height - 30, al.y));
        } else {
          // Normal + super: gentle track toward player Y
          const targetY = p.y + p.height / 2 - al.height / 2;
          al.y += (targetY - al.y) * (al.type === 'super' ? 0.012 : 0.02);
          al.y = Math.max(30, Math.min(canvas.height - al.height - 30, al.y));
        }

        // Projectile hits alien
        for (const pr of state.projectiles) {
          if (!pr.alive || !al.alive) continue;
          if (pr.x < al.x + al.width && pr.x + pr.width > al.x &&
              pr.y < al.y + al.height && pr.y + pr.height > al.y) {
            pr.alive = false;
            al.health--;

            if (al.health > 0) {
              // Super alien took a hit but survived — flash
              burst(al.x + al.width / 2, al.y + al.height / 2, '#ff4e3e', 15, 4);
              floatFeedback(al.x, al.y - 10, 'HIT! ONE MORE!');
              return;
            }

            al.alive = false;
            if (al.type === 'super') state.superAlienSpawned = false;
            synthRef.current?.playExplosion();

            // ---- KILL REWARDS PER TYPE ----
            if (al.type === 'super') {
              // SUPER KILL — screen nuke, 2 charges, 10 sec godmode
              synthRef.current?.playSuperKill();
              state.blasterCharges += 2;
              setBlasterCharges(state.blasterCharges);
              state.speedBoostTicks = 60 * 10;
              setSpeedBoosted(true);
              state.screenFlash = 1.0;
              state.screenShake = 8;
              // Massive particle explosion
              for (let ring = 0; ring < 6; ring++) {
                setTimeout(() => {
                  burst(al.x + al.width / 2, al.y + al.height / 2, ['#ff4e3e','#ffe65c','#ffffff','#cc44ff','#00cfff'][ring % 5], 40, 8 + ring * 2);
                }, ring * 80);
              }
              warpToast(`SUPER ALIEN PURGED — GODMODE 10 SEC + 2 CHARGES`);
              const pts = (2000 + tier * 200) * Math.max(1, state.killCombo);
              setScore(prev => prev + pts);
              floatFeedback(al.x, al.y - 20, `SUPER PURGED +${pts.toLocaleString()}`);
            } else if (al.type === 'speedy') {
              // SPEEDY KILL — score ×2 for 10 sec
              synthRef.current?.playScoreMult();
              state.scoreMultTicks = 60 * 10;
              setScoreMultActive(true);
              burst(al.x + al.width / 2, al.y + al.height / 2, '#ffe65c', 30, 6);
              burst(al.x + al.width / 2, al.y + al.height / 2, '#ff4e3e', 15, 4);
              warpToast(`SPEEDY PURGED — ×2 SCORE 10 SEC`);
              const pts = (600 + tier * 60) * Math.max(1, state.killCombo) * (state.scoreMultTicks > 0 ? 2 : 1);
              setScore(prev => prev + pts);
              floatFeedback(al.x, al.y - 10, `SPEEDY +${pts.toLocaleString()}`);
            } else {
              // NORMAL KILL
              burst(al.x + al.width / 2, al.y + al.height / 2, '#ffe65c', 22, 5);
              burst(al.x + al.width / 2, al.y + al.height / 2, '#ff4e3e', 14, 4);
              const scoreMult2 = state.killCombo >= 5 ? 3 : state.killCombo >= 3 ? 2 : 1;
              const scoreFinal = state.scoreMultTicks > 0 ? 2 : 1;
              const pts = (400 + tier * 50) * state.killCombo * scoreMult2 * scoreFinal;
              setScore(prev => prev + pts);
              if (state.killCombo > 1) floatFeedback(al.x, al.y - 10, `×${state.killCombo} +${pts.toLocaleString()}`);
              else floatFeedback(al.x, al.y - 10, `PURGED +${pts}`);
            }

            // ---- COMBO MILESTONES (all types) ----
            state.killCombo++;
            setComboCount(state.killCombo);
            synthRef.current?.playCombo(state.killCombo);

            // Perk: aliens drop charges
            if (hasPerk('aliens drop charges') && Math.random() > 0.4) {
              state.blasterCharges++; setBlasterCharges(state.blasterCharges);
              floatFeedback(al.x, al.y - 25, 'CHARGE DROP!');
            }

            if (al.type !== 'super') {
              if (state.killCombo === 2) {
                state.blasterCharges++; setBlasterCharges(state.blasterCharges);
                synthRef.current?.playCharge();
                state.calmTicks = 60 * 4;
                warpToast(`COMBO ×2 — FREE CHARGE + CALM`);
                burst(p.x + p.width / 2, p.y, '#ffe65c', 25, 6);
              } else if (state.killCombo === 3) {
                state.speedBoostTicks = 60 * 3; setSpeedBoosted(true);
                synthRef.current?.playSpeedBoost();
                state.calmTicks = 60 * 6;
                // Unlock WIDE shot
                if (state.weaponTier < 1) { state.weaponTier = 1; setWeaponTier(1); warpToast(`COMBO ×3 — WIDE SHOT UNLOCKED + UNTOUCHABLE`); }
                else warpToast(`COMBO ×3 — UNTOUCHABLE + CALM 6 SEC`);
                burst(p.x + p.width / 2, p.y + p.height / 2, '#00cfff', 40, 8);
              } else if (state.killCombo === 5) {
                state.speedBoostTicks = 60 * 5; setSpeedBoosted(true);
                synthRef.current?.playSpeedBoost();
                state.calmTicks = 60 * 10;
                // Unlock RAPID shot
                if (state.weaponTier < 2) { state.weaponTier = 2; setWeaponTier(2); warpToast(`COMBO ×5 — RAPID FIRE UNLOCKED + GODMODE`); }
                else warpToast(`COMBO ×5 — GODMODE ×3 SCORE + CALM 10 SEC`);
                burst(p.x + p.width / 2, p.y + p.height / 2, '#ffe65c', 50, 9);
                burst(p.x + p.width / 2, p.y + p.height / 2, '#ffffff', 20, 5);
              } else if (state.killCombo > 5 && state.killCombo % 2 === 0) {
                state.calmTicks = Math.max(state.calmTicks, 60 * 4);
                warpToast(`GODMODE ×${state.killCombo}  ×3 SCORE ACTIVE`);
              }
            }
          }
        }

        // Alien hits player
        if (al.alive &&
            p.x < al.x + al.width && p.x + p.width > al.x &&
            p.y < al.y + al.height && p.y + p.height > al.y) {
          al.alive = false;
          if (al.type === 'super') state.superAlienSpawned = false;

          if (state.speedBoostTicks > 0) {
            burst(al.x + al.width / 2, al.y + al.height / 2, '#00cfff', 12, 4);
            floatFeedback(al.x, al.y - 10, 'INVINCIBLE!');
          } else if (state.shieldActive) {
            state.shieldActive = false; setHasShield(false);
            synthRef.current?.playShieldBreak();
            burst(p.x + p.width / 2, p.y + p.height / 2, '#00cfff', 30, 6);
            warpToast('SHIELD ABSORBED THE HIT');
            floatFeedback(p.x, p.y - 20, 'SHIELD BLOCK!');
          } else {
            const dmg = al.type === 'super' ? 35 : 20;
            state.coreStability = Math.max(0, state.coreStability - dmg);
            state.screenShake = al.type === 'super' ? 6 : 3;
            state.screenFlash = al.type === 'super' ? 0.6 : 0.4;
            state.calmTicks = 0;
            synthRef.current?.playHurt();
            burst(p.x + p.width / 2, p.y + p.height / 2, '#ff4e3e', 18, 4);
            floatFeedback(p.x, p.y - 20, al.type === 'super' ? 'SUPER IMPACT!' : 'IMPACT!');
            if (!hasPerk('combo never resets')) { state.killCombo = 0; setComboCount(0); }
          }
        }
      });
      state.aliens = state.aliens.filter(al => al.x + al.width > -80 && al.alive);

      // ---- METEORS ----
      state.meteors.forEach(m => {
        m.x += m.vx; m.y += m.vy; m.rotation += 0.04;
        if (!m.alive) return;
        // Shot down by projectile
        for (const pr of state.projectiles) {
          if (!pr.alive) continue;
          if (pr.x < m.x + m.size && pr.x + pr.width > m.x &&
              pr.y < m.y + m.size && pr.y + pr.height > m.y) {
            pr.alive = false; m.alive = false;
            synthRef.current?.playExplosion();
            burst(m.x + m.size / 2, m.y + m.size / 2, '#ffffff', 16, 4);
            setScore(prev => prev + 200);
            floatFeedback(m.x, m.y, 'SHOT DOWN +200');
          }
        }
        // Hits player
        if (m.alive &&
            p.x < m.x + m.size && p.x + p.width > m.x &&
            p.y < m.y + m.size && p.y + p.height > m.y) {
          m.alive = false;
          if (state.speedBoostTicks > 0) {
            burst(m.x + m.size / 2, m.y + m.size / 2, '#00cfff', 16, 5);
            floatFeedback(m.x, m.y, 'INVINCIBLE!');
          } else if (state.shieldActive) {
            state.shieldActive = false;
            setHasShield(false);
            synthRef.current?.playShieldBreak();
            burst(p.x + p.width / 2, p.y + p.height / 2, '#00cfff', 30, 6);
            warpToast('SHIELD ABSORBED THE HIT');
          } else {
            state.coreStability = Math.max(0, state.coreStability - 25);
            state.screenShake = 4; state.screenFlash = 0.45;
            synthRef.current?.playHurt();
            burst(p.x + p.width / 2, p.y + p.height / 2, '#ffffff', 22, 5);
            floatFeedback(p.x, p.y - 20, 'METEOR BREACH');
            state.killCombo = 0;
            setComboCount(0);
          }
        }
      });
      state.meteors = state.meteors.filter(m => m.alive && m.y < canvas.height + 80 && m.x + m.size > -80);

      // ---- CRYSTAL COLLECT ----
      state.crystals.forEach(c => {
        if (c.collected) return;
        if (p.x < c.x + c.size && p.x + p.width > c.x &&
            p.y < c.y + c.size && p.y + p.height > c.y) {
          c.collected = true;

          if (c.isTripleJump) {
            state.tripleJumpTicks = 60 * 15; setTripleJumpActive(true);
            synthRef.current?.playTripleJump();
            burst(c.x + c.size / 2, c.y + c.size / 2, '#cc44ff', 40, 7);
            burst(c.x + c.size / 2, c.y + c.size / 2, '#ffffff', 20, 5);
            warpToast(`TRIPLE JUMP — 15 SEC`);
            floatFeedback(c.x, c.y - 15, 'TRIPLE JUMP!');
          } else if ((c as any).isMagnet) {
            state.magnetTicks = 60 * 8; setMagnetActive(true);
            synthRef.current?.playMagnet();
            burst(c.x + c.size / 2, c.y + c.size / 2, '#ff44aa', 40, 7);
            burst(c.x + c.size / 2, c.y + c.size / 2, '#ffffff', 20, 5);
            warpToast(`CRYSTAL MAGNET — 8 SEC`);
            floatFeedback(c.x, c.y - 15, 'MAGNET!');
          } else if (c.isShield) {
            state.shieldActive = true; setHasShield(true);
            synthRef.current?.playShield();
            burst(c.x + c.size / 2, c.y + c.size / 2, '#00cfff', 40, 7);
            burst(c.x + c.size / 2, c.y + c.size / 2, '#ffffff', 20, 5);
            warpToast('🛡 SHIELD ONLINE — NEXT HIT BLOCKED');
            floatFeedback(c.x, c.y - 15, 'SHIELD!');
          } else {
            // ---- REGULAR CRYSTAL ----
            state.crystalsTotal++;
            state.crystalsSinceCharge++;
            state.crystalsSinceShield++;
            state.crystalsSinceTriple++;
            state.crystalsSincePerks++;
            state.crystalsSinceBoss++;
            setCrystalCount(state.crystalsTotal);
            state.coreStability = Math.min(100, state.coreStability + 14);
            const pts = (100 + tier * 20) * Math.max(1, Math.floor(state.killCombo * 0.5));
            setScore(prev => prev + pts);
            burst(c.x + c.size / 2, c.y + c.size / 2, '#ffe65c', 24, 4.5);
            synthRef.current?.playCrystal();
            synthRef.current?.setIntensity(state.crystalsTotal);
            floatFeedback(c.x, c.y - 15, `+${pts}`);

            // Every 5 crystals = blaster charge (3 with blaster fast perk)
            const chargeThreshold = hasPerkEarly('blaster fast') ? 3 : 5;
            if (state.crystalsSinceCharge >= chargeThreshold) {
              state.crystalsSinceCharge = 0;
              state.blasterCharges++;
              setBlasterCharges(state.blasterCharges);
              synthRef.current?.playCharge();
              warpToast(`BLASTER CHARGED ×${state.blasterCharges} — SPACE TO FIRE`);
              burst(c.x + c.size / 2, c.y + c.size / 2, '#ffffff', 30, 6);
            }
          }
        }
      });

      // ---- ENEMY SPAWNING ----
      const alienInterval = Math.max(75, 180 - diffTier * 9);
      if (state.gameTicks % alienInterval === 0 && !state.boss) spawnAlien(diffTier);

      const meteorInterval = Math.max(120, 250 - diffTier * 12);
      if (state.gameTicks % meteorInterval === 0) spawnMeteor(diffTier);

      // ---- BOSS WAVE every 40 crystals ----
      if (state.crystalsSinceBoss >= 40 && !state.boss && state.crystalsTotal >= 40) {
        state.crystalsSinceBoss = 0;
        const BOSS_NAMES = ['ENTROPY PRIME', 'VOID ARCHITECT', 'CORE BREAKER', 'SIGNAL GHOST', 'ZERO PROTOCOL'];
        const bname = BOSS_NAMES[Math.floor(Math.random() * BOSS_NAMES.length)];
        state.boss = {
          x: canvas.width + 80, y: canvas.height / 2 - 50,
          width: 80, height: 80,
          health: 3, maxHealth: 3,
          // Boss moves at a fixed comfortable speed regardless of tier
          vx: -2.8,
          phase: 0, animFrame: 0, alive: true,
          name: bname,
          shootCooldown: 9999, // unused — no projectiles
        };
        synthRef.current?.playBossIntro();
        warpToast(`⚠ BOSS INCOMING — ${bname}`);
        state.aliens = [];
      }

      // ---- BOSS UPDATE ----
      if (state.boss) {
        const b = state.boss;
        b.x += b.vx;
        b.animFrame++;
        b.phase += 0.025;
        // Sine wave vertical — tracks player Y gently
        const bTargetY = p.y + PH / 2 - b.height / 2;
        b.y += (bTargetY - b.y) * 0.015;
        b.y += Math.sin(b.phase) * 80 * 0.025; // gentle oscillation on top
        b.y = Math.max(30, Math.min(canvas.height - b.height - 30, b.y));

        // Player blast hits boss
        for (const pr of state.projectiles) {
          if (!pr.alive || !b.alive) continue;
          if (pr.x < b.x + b.width && pr.x + pr.width > b.x && pr.y < b.y + b.height && pr.y + pr.height > b.y) {
            pr.alive = false; b.health--;
            synthRef.current?.playBossHit();
            burst(b.x + b.width/2, b.y + b.height/2, '#ff4e3e', 20, 5);
            floatFeedback(b.x, b.y - 10, b.health > 0 ? `BOSS HIT! ${b.health} LEFT` : 'FINAL HIT!');
            if (b.health <= 0) {
              b.alive = false; state.boss = null; state.bossProjectiles = [];
              synthRef.current?.playBossKill();
              // BOSS REWARD
              state.blasterCharges += 2; setBlasterCharges(state.blasterCharges);
              state.speedBoostTicks = 60 * 6; setSpeedBoosted(true);
              state.coreStability = Math.min(100, state.coreStability + 40);
              state.calmTicks = 60 * 10;
              state.bossSpeedReliefTicks = 600;
              state.crystalsSinceBoss = 0;
              // Unlock nova if weapon tier 2+
              if (state.weaponTier >= 2 && !state.novaUnlocked) {
                state.novaUnlocked = true; setNovaReady(true);
              }
              // Also bump weapon tier if not maxed
              if (state.weaponTier < 3) { state.weaponTier = Math.min(3, state.weaponTier + 1); setWeaponTier(state.weaponTier); }
              const bpts = (3000 + diffTier * 300) * Math.max(1, state.killCombo);
              setScore(prev => prev + bpts);
              state.screenFlash = 0.9;
              for (let ring = 0; ring < 8; ring++) {
                setTimeout(() => burst(b.x + b.width/2, b.y + b.height/2, ['#ff4e3e','#ffe65c','#ffffff','#cc44ff','#00cfff'][ring%5], 35, 8+ring*2), ring * 60);
              }
              warpToast(`BOSS OBLITERATED — +${bpts.toLocaleString()} PTS // SPEED EASING...`);
            }
          }
        }

        // Boss body collision with player — no projectiles, just dodge
        if (b.alive && p.x < b.x + b.width && p.x + PW > b.x && p.y < b.y + b.height && p.y + PH > b.y) {
          if (state.speedBoostTicks > 0) {
            floatFeedback(p.x, p.y - 20, 'INVINCIBLE!');
          } else if (state.shieldActive) {
            state.shieldActive = false; setHasShield(false);
            synthRef.current?.playShieldBreak();
            burst(p.x+PW/2, p.y+PH/2, '#00cfff', 25, 6);
            warpToast('SHIELD BLOCKED BOSS COLLISION');
            floatFeedback(p.x, p.y - 20, 'SHIELD BLOCK!');
          } else {
            state.coreStability = Math.max(0, state.coreStability - 28);
            state.screenShake = 5; state.screenFlash = 0.5; state.calmTicks = 0;
            synthRef.current?.playHurt();
            if (!hasPerk('combo never resets')) { state.killCombo = 0; setComboCount(0); }
            burst(p.x+PW/2, p.y+PH/2, '#ff4e3e', 25, 5);
            floatFeedback(p.x, p.y - 20, 'BOSS COLLISION!');
          }
        }

        // Boss exits screen without being killed — no penalty, just moves on
        if (b.x + b.width < -100) { state.boss = null; state.bossProjectiles = []; }
      }

      // ---- PERK DRAFT every 20 crystals ----
      if (state.crystalsSincePerks >= 20 && !state.perkDraftPending && state.crystalsTotal >= 20) {
        state.crystalsSincePerks = 0;
        const ALL_PERKS = ['drain halved', 'blaster fast', 'aliens drop charges', 'combo never resets', 'crystal magnet always'];
        // Pick 3 random perks not already owned
        const available = ALL_PERKS.filter(p => !state.perks.includes(p));
        if (available.length >= 2) {
          const shuffled = available.sort(() => Math.random() - 0.5).slice(0, 3);
          state.perkOptions = shuffled;
          state.perkDraftPending = true;
          setPerkDraft(shuffled);
          synthRef.current?.playPerkDraft();
        }
      }

      // ---- STREAK SCORE — add to score every 10 sec survived ----
      if (state.gameTicks % 600 === 0 && state.gameTicks > 0) {
        const streakBonus = state.streakTicks * 50 * Math.max(1, state.killCombo);
        setScore(prev => prev + streakBonus);
        floatFeedback(p.x, p.y - 30, `SURVIVAL +${streakBonus}`);
      }

      // ---- PLATFORM + CRYSTAL GENERATION ----
      state.platforms = state.platforms.filter(pl => pl.x + pl.width > -120);
      state.crystals  = state.crystals.filter(c => c.x > -50);

      if (state.platforms.length < 6) {
        const last = state.platforms[state.platforms.length - 1];
        let style: 'solid'|'pillar'|'glitch' = 'solid';
        if (diffTier >= 3) style = Math.random() > 0.55 ? 'pillar' : 'solid';
        if (diffTier >= 7) style = Math.random() > 0.45 ? 'glitch' : 'pillar';
        // Platforms stay at a comfortable size throughout — never get too narrow
        // Slight variation (±30px) but no tier scaling so they're always jumpable
        const wMin = 280;
        const wMax = 380;
        const w    = Math.random() * (wMax - wMin) + wMin;
        const gap  = Math.min(160, 80 + diffTier * 7 + Math.random() * 40);
        const nx   = last.x + last.width + gap;
        const dir  = Math.random() > 0.5 ? 1 : -1;
        const vs   = Math.min(80, 25 + diffTier * 6);
        const ny   = Math.max(canvas.height - 420, Math.min(canvas.height - 180, last.baseY + Math.random() * vs * dir));
        state.platforms.push({ x: nx, y: ny, baseY: ny, width: w, height: 600, styleType: style, waveOffset: 0 });
        // Crystal on most platforms
        if (Math.random() > 0.18) {
          state.crystals.push({ x: nx + w / 2 - 12, y: ny - 50 - Math.random() * 35, size: 24, collected: false, pulseOffset: Math.random() * Math.PI * 2 });
        }
        // Shield crystal — rare, every ~12 regular crystals
        if (state.crystalsSinceShield >= 12 && Math.random() > 0.5) {
          state.crystalsSinceShield = 0;
          state.crystals.push({ x: nx + w / 2 + 40, y: ny - 80 - Math.random() * 30, size: 28, collected: false, pulseOffset: Math.random() * Math.PI * 2, isShield: true });
        }
        // Triple jump crystal — very rare, every ~18 regular crystals
        if (state.crystalsSinceTriple >= 18 && Math.random() > 0.6) {
          state.crystalsSinceTriple = 0;
          state.crystals.push({ x: nx + w / 2 - 50, y: ny - 90 - Math.random() * 30, size: 28, collected: false, pulseOffset: Math.random() * Math.PI * 2, isTripleJump: true });
        }
        // Magnet crystal — pink/hot, every ~15 crystals
        state.crystalsSinceMagnet++;
        if (state.crystalsSinceMagnet >= 15 && Math.random() > 0.55) {
          state.crystalsSinceMagnet = 0;
          state.crystals.push({ x: nx + w / 2 + 20, y: ny - 70 - Math.random() * 30, size: 26, collected: false, pulseOffset: Math.random() * Math.PI * 2, isMagnet: true } as any);
        }
      }

      // ---- PARTICLES + FLOAT TEXTS ----
      state.particles.forEach(pt => { pt.x += pt.vx; pt.y += pt.vy; pt.life--; pt.alpha = Math.max(0, pt.life / 20); });
      state.particles = state.particles.filter(pt => pt.life > 0);
      state.floatTexts.forEach(t => { t.y += t.vy; t.life--; t.alpha = Math.max(0, t.life / 45); });
      state.floatTexts = state.floatTexts.filter(t => t.life > 0);
      if (state.gameTicks % 3 === 0) setFloatTexts([...state.floatTexts]);
    };

    // ---- DRAW ----
    const draw = () => {
      const sd = stateRef.current;
      const tier = Math.min(14, Math.floor(sd.crystalsTotal / 5));
      const isCalm = sd.calmTicks > 0;
      // How calm — 0 = full chaos, 1 = fully calm. Fades back in over last 120 ticks
      const calmStrength = isCalm ? Math.min(1, sd.calmTicks / 120) : 0;

      let pc = '#ff4e3e', sc = '#ffe65c', bg = '#000000', glitch = false;
      if (tier >= 4 && tier < 7)  { pc = '#ffe65c'; sc = '#ff4e3e'; }
      else if (tier >= 7 && tier < 11) { pc = '#ffffff'; sc = '#ff4e3e'; bg = '#090000'; }
      else if (tier >= 11) {
        if (isCalm) {
          // Calm mode: solid clean colours, no strobing
          pc = '#ff4e3e'; sc = '#ffe65c'; bg = '#000000';
        } else {
          glitch = true;
          pc = sd.gameTicks%8<4?'#ff4e3e':'#ffe65c';
          sc = sd.gameTicks%4<2?'#ffffff':'#000000';
          bg = '#000000';
        }
      }

      ctx.save();
      // Screen shake — suppressed during calm
      if (sd.screenShake > 0 && !isCalm) {
        ctx.translate(
          (Math.random() - 0.5) * sd.screenShake * 4,
          (Math.random() - 0.5) * sd.screenShake * 4
        );
      }

      ctx.fillStyle = bg; ctx.fillRect(0, 0, canvas.width, canvas.height);
      // Screen flash suppressed during calm
      if (sd.screenFlash > 0 && !isCalm) {
        ctx.fillStyle = `rgba(255,78,62,${sd.screenFlash*0.15})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      // Subtle calm overlay — soft blue tint to signal the calm window
      if (isCalm && calmStrength > 0.1) {
        ctx.fillStyle = `rgba(0, 180, 255, ${calmStrength * 0.04})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      // ---- SCREEN BORDER GLOW — stability awareness ----
      const borderGrad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      if (sd.coreStability < 25) {
        // Critical — red pulsing border
        const pulse = 0.5 + Math.sin(sd.gameTicks * 0.15) * 0.4;
        ctx.save();
        ctx.strokeStyle = `rgba(255, 0, 0, ${pulse * 0.9})`;
        ctx.lineWidth = 12;
        ctx.strokeRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = `rgba(255, 100, 0, ${pulse * 0.5})`;
        ctx.lineWidth = 24;
        ctx.strokeRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
      } else if (sd.coreStability < 45) {
        // Warning — orange border
        ctx.save();
        ctx.strokeStyle = `rgba(255, 140, 0, 0.5)`;
        ctx.lineWidth = 8;
        ctx.strokeRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
      } else if (sd.coreStability > 70) {
        // Healthy — subtle green border
        ctx.save();
        ctx.strokeStyle = `rgba(30, 215, 96, 0.2)`;
        ctx.lineWidth = 6;
        ctx.strokeRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
      }
      // Curse border — dark red shimmer
      if (sd.curseTicks > 0) {
        ctx.save();
        ctx.strokeStyle = `rgba(150, 0, 0, ${0.3 + Math.sin(sd.gameTicks * 0.1) * 0.2})`;
        ctx.lineWidth = 6;
        ctx.setLineDash([20, 10]);
        ctx.strokeRect(3, 3, canvas.width - 6, canvas.height - 6);
        ctx.setLineDash([]);
        ctx.restore();
      }
      // Magnet border — pink pulse
      if (sd.magnetTicks > 0) {
        ctx.save();
        ctx.strokeStyle = `rgba(255, 68, 170, ${0.3 + Math.sin(sd.gameTicks * 0.2) * 0.2})`;
        ctx.lineWidth = 5;
        ctx.strokeRect(3, 3, canvas.width - 6, canvas.height - 6);
        ctx.restore();
      }

      // Grid lines
      ctx.save();
      ctx.strokeStyle = `rgba(255,78,62,${tier >= 4 ? 0.07 : 0.035})`;
      ctx.lineWidth = tier >= 5 ? 1.8 : 1.4;
      const hor = canvas.height * 0.35;
      for (let i = -200; i < canvas.width + 200; i += 75) {
        ctx.beginPath(); ctx.moveTo(i, canvas.height); ctx.lineTo(canvas.width / 2 + (i - canvas.width / 2) * 0.08, hor); ctx.stroke();
      }
      ctx.restore();

      // Matrix rain
      ctx.save(); ctx.font = '13px monospace';
      sd.matrixColumns.forEach(col => {
        col.chars.forEach((ch, idx) => {
          const cy = col.y + idx * 18;
          if (cy > 0 && cy < canvas.height) {
            ctx.fillStyle = idx === col.chars.length - 1 ? sc : `rgba(255,78,62,${0.08 + (idx / col.chars.length) * 0.28})`;
            ctx.fillText(ch, col.x, cy);
          }
        });
      }); ctx.restore();

      // Banner text
      ctx.save();
      sd.bannerTexts.forEach(b => {
        ctx.font = `900 ${b.size}px "Helvetica Neue",sans-serif`;
        ctx.fillStyle = `rgba(255,78,62,${glitch ? b.alpha * 2.5 : b.alpha})`;
        ctx.fillText(b.text, b.x, b.y);
      }); ctx.restore();

      // Distance watermark
      ctx.save(); ctx.font = '900 13vw "Helvetica Neue",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = tier >= 7 ? 'rgba(255,78,62,0.018)' : 'rgba(255,78,62,0.032)';
      ctx.fillText(String(Math.floor(sd.milesTraveled)).padStart(4, '0'), canvas.width / 2, canvas.height / 2);
      ctx.restore();

      // Platforms — solid, no oscillation
      sd.platforms.forEach(pl => {
        ctx.fillStyle = pc; ctx.fillRect(pl.x, pl.y, pl.width, pl.height);
        ctx.fillStyle = sc; ctx.fillRect(pl.x, pl.y, pl.width, 5);
      });

      // Crystals — shield=cyan, triple jump=purple, regular=yellow
      sd.crystals.forEach(c => {
        if (c.collected) return;
        const fy = Math.sin(sd.gameTicks * 0.12 + c.pulseOffset) * 7;
        ctx.save();
        ctx.translate(c.x + c.size / 2, c.y + c.size / 2 + fy);
        ctx.rotate(sd.gameTicks * 0.035);

        if (c.isTripleJump) {
          ctx.fillStyle = '#cc44ff';
          ctx.shadowColor = '#cc44ff'; ctx.shadowBlur = 22;
          ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(0, 0, c.size * 0.85, 0, Math.PI * 2); ctx.stroke();
          ctx.globalAlpha = 0.5 + Math.sin(sd.gameTicks * 0.2) * 0.3;
          ctx.beginPath(); ctx.arc(0, 0, c.size * 1.1, 0, Math.PI * 2); ctx.stroke();
          ctx.globalAlpha = 1;
        } else if ((c as any).isMagnet) {
          // Magnet — hot pink with orbiting dots
          ctx.fillStyle = '#ff44aa';
          ctx.shadowColor = '#ff44aa'; ctx.shadowBlur = 20;
          ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(0, 0, c.size * 0.8, 0, Math.PI * 2); ctx.stroke();
          const orbitAngle = sd.gameTicks * 0.08;
          ctx.fillStyle = '#ffffff';
          ctx.beginPath(); ctx.arc(Math.cos(orbitAngle) * c.size * 0.7, Math.sin(orbitAngle) * c.size * 0.7, 3, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(Math.cos(orbitAngle + Math.PI) * c.size * 0.7, Math.sin(orbitAngle + Math.PI) * c.size * 0.7, 3, 0, Math.PI * 2); ctx.fill();
        } else if (c.isShield) {
          ctx.fillStyle = '#00cfff';
          ctx.shadowColor = '#00cfff'; ctx.shadowBlur = 20;
          ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(0, 0, c.size * 0.8, 0, Math.PI * 2); ctx.stroke();
        } else {
          ctx.fillStyle = sc;
          ctx.shadowColor = sc; ctx.shadowBlur = 8;
        }
        ctx.beginPath(); ctx.moveTo(0, -c.size/2); ctx.lineTo(c.size/2, 0); ctx.lineTo(0, c.size/2); ctx.lineTo(-c.size/2, 0); ctx.closePath(); ctx.fill();
        ctx.restore();
      });

      // Blast — visual differs by weapon tier/size
      sd.projectiles.forEach(pr => {
        ctx.save();
        const isWide  = pr.height > window.innerHeight * 0.12;
        const isNova  = pr.height > window.innerHeight * 0.15;
        const isRapid = pr.width < 70;

        if (isNova) {
          // Nova — purple/white expanding wall
          ctx.shadowColor = '#cc44ff'; ctx.shadowBlur = 50;
          const grad = ctx.createLinearGradient(pr.x, 0, pr.x + pr.width, 0);
          grad.addColorStop(0, 'rgba(204,68,255,0.0)');
          grad.addColorStop(0.3, 'rgba(204,68,255,0.7)');
          grad.addColorStop(0.8, 'rgba(255,255,255,0.95)');
          grad.addColorStop(1, 'rgba(255,255,255,1.0)');
          ctx.fillStyle = grad;
          ctx.fillRect(pr.x, pr.y, pr.width, pr.height);
        } else if (isWide) {
          // Wide — orange/yellow fan
          ctx.shadowColor = '#ff8800'; ctx.shadowBlur = 25;
          const grad = ctx.createLinearGradient(pr.x, 0, pr.x + pr.width, 0);
          grad.addColorStop(0, 'rgba(255,136,0,0.0)');
          grad.addColorStop(0.25, 'rgba(255,136,0,0.6)');
          grad.addColorStop(0.7, 'rgba(255,230,92,0.9)');
          grad.addColorStop(1, 'rgba(255,255,255,0.95)');
          ctx.fillStyle = grad;
          ctx.fillRect(pr.x, pr.y, pr.width, pr.height);
          ctx.fillStyle = 'rgba(255,255,255,0.7)';
          ctx.fillRect(pr.x + pr.width - 12, pr.y + pr.height * 0.3, 12, pr.height * 0.4);
        } else if (isRapid) {
          // Rapid — hot pink tight darts
          ctx.shadowColor = '#ff44aa'; ctx.shadowBlur = 15;
          ctx.fillStyle = '#ff44aa';
          ctx.fillRect(pr.x, pr.y, pr.width, pr.height);
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(pr.x + pr.width - 10, pr.y + 2, 10, pr.height - 4);
        } else {
          // Standard — green laser
          ctx.shadowColor = '#1ED760'; ctx.shadowBlur = 40;
          const grad = ctx.createLinearGradient(pr.x, 0, pr.x + pr.width, 0);
          grad.addColorStop(0, 'rgba(30,215,96,0.0)');
          grad.addColorStop(0.2, 'rgba(30,215,96,0.55)');
          grad.addColorStop(0.6, 'rgba(30,215,96,0.8)');
          grad.addColorStop(1, 'rgba(255,255,255,0.9)');
          ctx.fillStyle = grad;
          ctx.fillRect(pr.x, pr.y, pr.width, pr.height);
          ctx.fillStyle = 'rgba(255,255,255,0.95)';
          ctx.fillRect(pr.x + pr.width - 18, pr.y, 18, pr.height);
        }
        ctx.restore();
      });

      // Aliens — drawn per type
      sd.aliens.forEach(al => {
        if (!al.alive) return;
        ctx.save();
        ctx.translate(al.x + al.width / 2, al.y + al.height / 2);
        const flap = Math.sin(al.animFrame * 0.22) * 7;

        if (al.type === 'super') {
          // ---- SUPER ALIEN — big, pulsing red/magenta, menacing ----
          const pulse = 0.7 + Math.sin(al.animFrame * 0.08) * 0.3;
          ctx.shadowColor = '#ff0044'; ctx.shadowBlur = 30 * pulse;
          // Outer ring
          ctx.strokeStyle = `rgba(255, 0, 68, ${pulse})`;
          ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(0, 0, al.width * 0.65, 0, Math.PI * 2); ctx.stroke();
          // Body
          ctx.fillStyle = `rgba(220, 0, 80, ${0.8 + pulse * 0.2})`;
          ctx.beginPath();
          ctx.moveTo(0, -al.height / 2); ctx.lineTo(al.width / 2, 0);
          ctx.lineTo(0, al.height / 2); ctx.lineTo(-al.width / 2, 0);
          ctx.closePath(); ctx.fill();
          // Inner core flash
          ctx.fillStyle = `rgba(255, 200, 200, ${pulse * 0.6})`;
          ctx.beginPath();
          ctx.moveTo(0, -al.height / 4); ctx.lineTo(al.width / 4, 0);
          ctx.lineTo(0, al.height / 4); ctx.lineTo(-al.width / 4, 0);
          ctx.closePath(); ctx.fill();
          // Big scary eye
          ctx.fillStyle = '#ffe65c'; ctx.beginPath(); ctx.arc(-6, -6, 9, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#000';    ctx.beginPath(); ctx.arc(-6, -6, 4, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#ff0044'; ctx.beginPath(); ctx.arc(-6, -6, 1.5, 0, Math.PI * 2); ctx.fill();
          // Wings — big
          ctx.fillStyle = 'rgba(220,0,80,0.4)';
          ctx.beginPath(); ctx.moveTo(-al.width/2,0); ctx.lineTo(-al.width/2-22,-10+flap); ctx.lineTo(-al.width/2-14,14-flap); ctx.closePath(); ctx.fill();
          ctx.beginPath(); ctx.moveTo(al.width/2,0); ctx.lineTo(al.width/2+22,-10+flap); ctx.lineTo(al.width/2+14,14-flap); ctx.closePath(); ctx.fill();
          // HP bar
          ctx.fillStyle = '#333'; ctx.fillRect(-al.width/2, -al.height/2 - 12, al.width, 6);
          ctx.fillStyle = al.health === 2 ? '#ff0044' : '#ff8800';
          ctx.fillRect(-al.width/2, -al.height/2 - 12, al.width * (al.health / 2), 6);

        } else if (al.type === 'speedy') {
          // ---- SPEEDY ALIEN — yellow, slim, darty ----
          ctx.shadowColor = '#ffe65c'; ctx.shadowBlur = 16;
          ctx.fillStyle = '#ffe65c';
          // Slim elongated diamond
          ctx.beginPath();
          ctx.moveTo(0, -al.height * 0.7); ctx.lineTo(al.width * 0.4, 0);
          ctx.lineTo(0, al.height * 0.7); ctx.lineTo(-al.width * 0.4, 0);
          ctx.closePath(); ctx.fill();
          ctx.strokeStyle = '#ff4e3e'; ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(0, -al.height * 0.7); ctx.lineTo(al.width * 0.4, 0);
          ctx.lineTo(0, al.height * 0.7); ctx.lineTo(-al.width * 0.4, 0);
          ctx.closePath(); ctx.stroke();
          // Tiny eye
          ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(-3, -3, 3, 0, Math.PI * 2); ctx.fill();
          // Speed lines behind
          ctx.strokeStyle = 'rgba(255,230,92,0.3)'; ctx.lineWidth = 1.5;
          for (let i = 1; i <= 3; i++) {
            ctx.beginPath(); ctx.moveTo(-i*8, -al.height*0.3); ctx.lineTo(-i*8, al.height*0.3); ctx.stroke();
          }
        } else {
          // ---- NORMAL ALIEN ----
          ctx.shadowColor = '#ff4e3e'; ctx.shadowBlur = 16;
          ctx.fillStyle = '#ff4e3e';
          ctx.beginPath();
          ctx.moveTo(0, -al.height/2); ctx.lineTo(al.width/2, 0);
          ctx.lineTo(0, al.height/2); ctx.lineTo(-al.width/2, 0);
          ctx.closePath(); ctx.fill();
          ctx.strokeStyle = sc; ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(0, -al.height/2); ctx.lineTo(al.width/2, 0);
          ctx.lineTo(0, al.height/2); ctx.lineTo(-al.width/2, 0);
          ctx.closePath(); ctx.stroke();
          ctx.fillStyle = '#ffe65c'; ctx.beginPath(); ctx.arc(-5, -4, 5, 0, Math.PI*2); ctx.fill();
          ctx.fillStyle = '#000';    ctx.beginPath(); ctx.arc(-5, -4, 2.5, 0, Math.PI*2); ctx.fill();
          ctx.fillStyle = 'rgba(255,78,62,0.45)';
          ctx.beginPath(); ctx.moveTo(-al.width/2,0); ctx.lineTo(-al.width/2-14,-6+flap); ctx.lineTo(-al.width/2-9,10-flap); ctx.closePath(); ctx.fill();
          ctx.beginPath(); ctx.moveTo(al.width/2,0); ctx.lineTo(al.width/2+14,-6+flap); ctx.lineTo(al.width/2+9,10-flap); ctx.closePath(); ctx.fill();
        }

        ctx.restore();
      });

      // Meteors
      sd.meteors.forEach(m => {
        if (!m.alive) return;
        ctx.save();
        ctx.translate(m.x + m.size / 2, m.y + m.size / 2); ctx.rotate(m.rotation);
        ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 8;
        ctx.fillStyle = '#cccccc';
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          const r = (m.size / 2) * (0.7 + Math.sin(i * 2.3) * 0.3);
          i === 0 ? ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r) : ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        ctx.closePath(); ctx.fill();
        ctx.restore();
      });

      // Particles
      sd.particles.forEach(pt => {
        ctx.save(); ctx.globalAlpha = pt.alpha; ctx.fillStyle = pt.color;
        ctx.fillRect(pt.x, pt.y, pt.size, pt.size); ctx.restore();
      });

      // Player
      const p = sd.player;
      const th = p.height * p.stretch; const tw = p.width / (p.stretch * 0.85);
      ctx.save();
      ctx.translate(p.x + p.width / 2, p.y + (p.height - th) + th / 2);
      if (!p.isGrounded) ctx.rotate(p.vy * 0.02);

      const invincible = sd.speedBoostTicks > 0;

      // Invincibility electric aura
      if (invincible) {
        ctx.save();
        ctx.globalAlpha = 0.25 + Math.sin(sd.gameTicks * 0.3) * 0.2;
        // Pulsing cyan corona
        for (let ring = 1; ring <= 3; ring++) {
          ctx.strokeStyle = ring % 2 === 0 ? '#00cfff' : '#ffffff';
          ctx.lineWidth = 2;
          ctx.shadowColor = '#00cfff'; ctx.shadowBlur = 20;
          ctx.beginPath();
          ctx.arc(0, 0, (Math.max(tw, th) * 0.5) + ring * 8 + Math.sin(sd.gameTicks * 0.2 + ring) * 4, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();
      }

      // Shield aura
      if (sd.shieldActive && !invincible) {
        ctx.save();
        ctx.globalAlpha = 0.35 + Math.sin(sd.gameTicks * 0.15) * 0.15;
        ctx.strokeStyle = '#00cfff';
        ctx.lineWidth = 3;
        ctx.shadowColor = '#00cfff'; ctx.shadowBlur = 20;
        ctx.beginPath(); ctx.arc(0, 0, Math.max(tw, th) * 0.75, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }

      // Player body — flicker when invincible
      const showPlayer = !invincible || sd.gameTicks % 4 < 3;
      if (showPlayer) {
        ctx.fillStyle = invincible ? '#00cfff' : sc;
        ctx.shadowColor = invincible ? '#00cfff' : sc;
        ctx.shadowBlur = invincible ? 24 : 10;
        ctx.beginPath(); ctx.moveTo(0, -th/2); ctx.lineTo(tw/2, 0); ctx.lineTo(0, th/2); ctx.lineTo(-tw/2, 0); ctx.closePath(); ctx.fill();
      }
      ctx.restore();

      // ---- BOSS DRAW ----
      if (sd.boss) {
        const b = sd.boss;
        ctx.save();
        ctx.translate(b.x + b.width / 2, b.y + b.height / 2);
        const bPulse = 0.7 + Math.sin(b.animFrame * 0.06) * 0.3;
        ctx.strokeStyle = `rgba(255,0,68,${bPulse})`;
        ctx.lineWidth = 4; ctx.shadowColor = '#ff0044'; ctx.shadowBlur = 40 * bPulse;
        ctx.beginPath(); ctx.arc(0, 0, b.width * 0.72, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 0, b.width * 0.9, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = `rgba(180,0,60,${0.85 + bPulse * 0.15})`;
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2 + b.animFrame * 0.01;
          const r = b.width / 2 * (0.85 + Math.sin(i * 1.3) * 0.1);
          i === 0 ? ctx.moveTo(Math.cos(a)*r, Math.sin(a)*r) : ctx.lineTo(Math.cos(a)*r, Math.sin(a)*r);
        }
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = `rgba(255,200,200,${bPulse * 0.7})`;
        ctx.beginPath(); ctx.arc(0, 0, b.width * 0.25, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffe65c';
        ctx.beginPath(); ctx.arc(-10,-8,8,0,Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(10,-8,8,0,Math.PI*2); ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(-10,-8,4,0,Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(10,-8,4,0,Math.PI*2); ctx.fill();
        ctx.fillStyle = '#ff0044';
        ctx.beginPath(); ctx.arc(-10,-8,2,0,Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(10,-8,2,0,Math.PI*2); ctx.fill();
        ctx.fillStyle = '#222'; ctx.fillRect(-b.width/2,-b.height/2-16,b.width,8);
        ctx.fillStyle = b.health === 3 ? '#1ED760' : b.health === 2 ? '#ff8800' : '#ff0000';
        ctx.fillRect(-b.width/2,-b.height/2-16,b.width*(b.health/b.maxHealth),8);
        ctx.font = 'bold 11px monospace'; ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center';
        ctx.fillText(b.name, 0, -b.height/2 - 22);
        ctx.restore();
        sd.bossProjectiles.forEach((bp: any) => {
          ctx.save(); ctx.shadowColor = '#ff0044'; ctx.shadowBlur = 10;
          ctx.fillStyle = '#ff0044'; ctx.beginPath(); ctx.arc(bp.x,bp.y,7,0,Math.PI*2); ctx.fill();
          ctx.fillStyle = '#ffaaaa'; ctx.beginPath(); ctx.arc(bp.x,bp.y,3,0,Math.PI*2); ctx.fill();
          ctx.restore();
        });
      }

      // Warp toast
      const t = sd.warpToast;
      if (t.active) {
        ctx.save(); ctx.font = '900 32px "Helvetica Neue",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const tw2 = ctx.measureText(t.text).width; const sx = canvas.width / 2 - tw2 / 2;
        ctx.fillStyle = 'rgba(0,0,0,0.88)'; ctx.fillRect(sx - 40, t.y - 35, tw2 + 80, 70);
        ctx.strokeStyle = sc; ctx.lineWidth = 2; ctx.strokeRect(sx - 40, t.y - 35, tw2 + 80, 70);
        for (let i = 0; i < tw2; i += 2) {
          const yo = Math.sin((sd.gameTicks * 0.25) + (i * 0.04)) * 10;
          ctx.save(); ctx.beginPath(); ctx.rect(sx + i, t.y - 40, 2, 80); ctx.clip();
          ctx.fillStyle = (sd.gameTicks % 10 < 5) ? sc : pc;
          ctx.fillText(t.text, canvas.width / 2, t.y + yo); ctx.restore();
        }
        ctx.restore();
      }

      ctx.restore(); // screen shake
    };

    const loop = (now: number) => {
      frameRef.current = requestAnimationFrame(loop);
      const el = now - state.lastTime;
      if (el > state.fpsInterval) { state.lastTime = now - (el % state.fpsInterval); update(); draw(); }
    };
    frameRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(frameRef.current);
      window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isPlaying]);

  // ---- REBOOT ----
  const reboot = () => {
    const e = stateRef.current;
    e.player.x = 140; e.player.y = 300; e.player.vy = 0; e.player.jumpCount = 0; e.player.stretch = 1;
    e.gameTicks = 0; e.milesTraveled = 0; e.coyoteCounter = 0; e.jumpBufferCounter = 0;
    e.coreStability = 100; e.crystalsTotal = 0; e.crystalsSinceCharge = 0; e.blasterCharges = 0;
    e.comboCount = 0; e.killCombo = 0; e.shieldActive = false; e.speedBoostTicks = 0;
    e.crystalsSinceShield = 0; e.tripleJumpTicks = 0; e.scoreMultTicks = 0;
    e.crystalsSinceTriple = 0; e.superAlienSpawned = false; e.calmTicks = 0;
    e.boss = null; e.bossProjectiles = []; e.magnetTicks = 0; e.curseTicks = 0;
    e.curseType = ''; e.perks = []; e.crystalsSincePerks = 0; e.crystalsSinceBoss = 0; e.bossSpeedReliefTicks = 0;
    e.streakTicks = 0; e.runStreakScore = 0; e.perkDraftPending = false;
    e.crystalsSinceMagnet = 0; e.crystalsSinceCurse = 0;
    e.weaponTier = 0; e.chargeHeld = 0; e.novaUnlocked = false;
    spaceHeldRef.current = false;
    e.aliens = []; e.projectiles = []; e.meteors = []; e.warpToast.active = false;
    setScore(0); setCrystalCount(0); setBlasterCharges(0); setStability(100);
    setComboCount(0); setHasShield(false); setSpeedBoosted(false);
    setTripleJumpActive(false); setScoreMultActive(false);
    setMagnetActive(false); setCurseActive(null); setPerkDraft(null);
    setRunStreak(0); setWeaponTier(0); setChargeLevel(0); setNovaReady(false); setIsPlaying(true);
  };

  // ---- RENDER ----
  return (
    <div className="relative w-full h-full select-none overflow-hidden" onClick={handleCanvasClick}>
      <canvas ref={canvasRef} className="absolute inset-0 block w-full h-full" />

      {/* Float texts */}
      {isPlaying && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden z-20">
          {floatTexts.map(txt => (
            <div key={txt.id} className="absolute transform -translate-x-1/2 -translate-y-1/2 font-black text-2xl tracking-tight select-none mix-blend-difference drop-shadow-[0_2px_4px_rgba(0,0,0,1)] animate-pulse"
              style={{ left: `${txt.x}px`, top: `${txt.y}px`, opacity: txt.alpha }}>
              <BrandText text={txt.text} className="text-brandYellow font-black" />
            </div>
          ))}
        </div>
      )}

      {/* HUD */}
      <div className="absolute top-6 left-6 right-6 flex justify-between items-start font-mono pointer-events-none z-10 select-none">
        <div className="flex flex-col">
          <span className="text-xs text-brandRed opacity-60 uppercase tracking-widest">ARCADE HARDCORE CORE</span>
          <BrandText text="ENDLESS SIMULATION" className="text-2xl text-brandYellow font-bold uppercase leading-none" />
        </div>

        {/* Stability bar */}
        <div className="flex flex-col items-center w-64 md:w-80 px-4 pt-1">
          <div className="w-full flex justify-between text-[10px] text-brandYellow font-bold uppercase tracking-widest pb-1">
            <span>CORE STABILITY</span>
            <span className={stability < 35 ? 'text-brandRed animate-pulse font-black' : 'text-white'}>{stability}%</span>
          </div>
          <div className="w-full h-3 border border-brandYellow/40 bg-black/60 p-[2px]">
            <div className={`h-full transition-all duration-500 ${stability < 35 ? 'bg-brandRed animate-pulse' : 'bg-brandYellow'}`}
              style={{ width: `${stability}%` }} />
          </div>
        </div>

        <div className="flex gap-8 text-right">
          <div className="flex flex-col">
            <span className="text-xs text-brandRed opacity-60">CRYSTALS</span>
            <span className="text-xl text-brandYellow font-bold">{crystalCount}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-xs text-brandRed opacity-60">SCORE</span>
            <span className="text-xl text-white font-bold tracking-wider">{score.toLocaleString()} pts</span>
          </div>
          <div className="flex flex-col">
            <span className="text-xs text-brandRed opacity-60">PERSONAL BEST</span>
            <span className={`text-xl font-bold tracking-wider ${score > personalBest && personalBest > 0 ? 'text-[#1ED760] animate-pulse' : 'text-gray-500'}`}>
              {personalBest > 0 ? personalBest.toLocaleString() : '---'}
            </span>
          </div>
          {runStreak > 0 && (
            <div className="flex flex-col">
              <span className="text-xs text-brandRed opacity-60">STREAK</span>
              <span className="text-xl text-[#ff44aa] font-bold">{runStreak}s</span>
            </div>
          )}
          {stateRef.current.bossSpeedReliefTicks > 0 && (
            <div className="flex flex-col">
              <span className="text-xs text-[#1ED760] opacity-80 uppercase tracking-widest text-[9px]">SPEED EASING</span>
              <span className="text-sm text-[#1ED760] font-bold animate-pulse">▼ SLOW</span>
            </div>
          )}
        </div>
      </div>

      {/* Blaster charges + status indicators */}
      {isPlaying && (
        <div className="absolute top-24 right-6 flex flex-col items-end gap-2 z-30 pointer-events-auto">
          <button onClick={e => { e.stopPropagation(); toggleMute(); }}
            className="font-mono text-xs tracking-widest border border-brandYellow/40 px-3 py-1 text-brandYellow/60 hover:text-brandYellow hover:border-brandYellow bg-black/40 transition-all">
            {isMuted ? '[ UNMUTE ]' : '[ MUTE ]'}
          </button>

          {/* Blaster charges + weapon tier */}
          <div className="font-mono text-[11px] bg-black/60 border border-brandYellow/30 px-3 py-2 flex flex-col items-end gap-1 pointer-events-none">
            <div className="flex items-center gap-2 w-full justify-between">
              <span className="text-brandRed opacity-70 tracking-widest uppercase text-[9px]">
                {weaponTier === 0 ? 'STANDARD' : weaponTier === 1 ? 'WIDE SHOT' : weaponTier === 2 ? 'RAPID FIRE' : 'NOVA TIER'}
              </span>
              <span className={`text-[9px] font-black ${weaponTier === 0 ? 'text-gray-500' : weaponTier === 1 ? 'text-brandYellow' : weaponTier === 2 ? 'text-[#ff44aa]' : 'text-[#cc44ff]'}`}>
                {'▮'.repeat(weaponTier + 1)}{'▯'.repeat(3 - weaponTier)}
              </span>
            </div>
            {/* Charge bar — shows while holding space */}
            {chargeLevel > 0 && (
              <div className="w-full h-2 bg-black/60 border border-brandYellow/40 p-[1px]">
                <div className="h-full transition-none"
                  style={{
                    width: `${chargeLevel * 100}%`,
                    background: chargeLevel > 0.9 ? '#cc44ff' : chargeLevel > 0.6 ? '#ff44aa' : chargeLevel > 0.35 ? '#ffe65c' : '#ff4e3e'
                  }} />
              </div>
            )}
            {/* Nova ready indicator */}
            {novaReady && (
              <span className="text-[#cc44ff] text-[10px] font-black animate-pulse tracking-widest">NOVA READY — FULL CHARGE</span>
            )}
            <div className="flex gap-1 items-center">
              {Array.from({ length: Math.max(5, blasterCharges) }).map((_, i) => (
                <div key={i} className={`w-3 h-3 rotate-45 border ${i < blasterCharges ? 'bg-brandYellow border-brandYellow shadow-[0_0_6px_#ffe65c]' : 'bg-transparent border-brandYellow/20'}`} />
              ))}
              {blasterCharges === 0 && <span className="text-brandRed/60 text-[9px] ml-1">5 CRYSTALS</span>}
            </div>
            <span className={`text-[10px] font-black tracking-widest ${blasterCharges > 0 ? 'text-[#1ED760] animate-pulse' : 'text-gray-600'}`}>
              {blasterCharges > 0 ? `HOLD [SPACE] TO CHARGE` : 'NOT CHARGED'}
            </span>
          </div>

          {/* Kill combo */}
          {comboCount >= 2 && (
            <div className="font-mono bg-black/70 border-2 border-brandYellow px-3 py-2 flex flex-col items-end pointer-events-none shadow-[0_0_20px_rgba(255,230,92,0.4)]">
              <span className="text-[9px] text-brandYellow/60 uppercase tracking-widest">KILL COMBO</span>
              <span className="text-2xl text-brandYellow font-black leading-none animate-pulse">×{comboCount}</span>
            </div>
          )}

          {/* Shield indicator */}
          {hasShield && (
            <div className="font-mono bg-black/70 border-2 border-[#00cfff] px-3 py-2 flex flex-col items-end pointer-events-none shadow-[0_0_20px_rgba(0,207,255,0.5)]">
              <span className="text-[9px] text-[#00cfff]/70 uppercase tracking-widest">SHIELD</span>
              <span className="text-sm text-[#00cfff] font-black animate-pulse">ACTIVE</span>
            </div>
          )}

          {/* Triple jump indicator */}
          {tripleJumpActive && (
            <div className="font-mono bg-black/70 border-2 border-[#cc44ff] px-3 py-2 flex flex-col items-end pointer-events-none shadow-[0_0_20px_rgba(204,68,255,0.6)]">
              <span className="text-[9px] text-[#cc44ff]/70 uppercase tracking-widest">TRIPLE JUMP</span>
              <span className="text-sm text-[#cc44ff] font-black animate-pulse">ACTIVE ↑↑↑</span>
            </div>
          )}

          {/* Score multiplier indicator */}
          {scoreMultActive && (
            <div className="font-mono bg-black/70 border-2 border-brandYellow px-3 py-2 flex flex-col items-end pointer-events-none shadow-[0_0_20px_rgba(255,230,92,0.5)]">
              <span className="text-[9px] text-brandYellow/70 uppercase tracking-widest">SCORE BOOST</span>
              <span className="text-sm text-brandYellow font-black animate-pulse">×2 ACTIVE</span>
            </div>
          )}
          {/* Invincibility indicator */}
          {speedBoosted && (
            <div className="font-mono bg-black/70 border-2 border-[#00cfff] px-3 py-2 flex flex-col items-end pointer-events-none shadow-[0_0_20px_rgba(0,207,255,0.6)]">
              <span className="text-[9px] text-[#00cfff]/70 uppercase tracking-widest">
                {comboCount >= 5 ? 'GODMODE ×3 SCORE' : 'UNTOUCHABLE'}
              </span>
              <span className="text-sm text-[#00cfff] font-black animate-pulse">INVINCIBLE ⚡</span>
            </div>
          )}

          {/* Magnet indicator */}
          {magnetActive && (
            <div className="font-mono bg-black/70 border-2 border-[#ff44aa] px-3 py-2 flex flex-col items-end pointer-events-none shadow-[0_0_20px_rgba(255,68,170,0.6)]">
              <span className="text-[9px] text-[#ff44aa]/70 uppercase tracking-widest">CRYSTAL MAGNET</span>
              <span className="text-sm text-[#ff44aa] font-black animate-pulse">PULLING ✦</span>
            </div>
          )}

          {/* Curse indicator */}
          {curseActive && (
            <div className="font-mono bg-black/70 border-2 border-red-800 px-3 py-2 flex flex-col items-end pointer-events-none shadow-[0_0_20px_rgba(180,0,0,0.6)]">
              <span className="text-[9px] text-red-500/70 uppercase tracking-widest">CURSE ACTIVE</span>
              <span className="text-sm text-red-400 font-black animate-pulse">
                {curseActive === 'narrow' ? '☠ NARROW' : curseActive === 'fast' ? '☠ FAST' : '☠ DRAIN'}
              </span>
            </div>
          )}

          {/* Active perks */}
          {stateRef.current.perks.length > 0 && (
            <div className="font-mono bg-black/70 border border-brandYellow/30 px-3 py-2 flex flex-col items-end pointer-events-none">
              <span className="text-[9px] text-brandYellow/50 uppercase tracking-widest pb-1">ACTIVE PERKS</span>
              {stateRef.current.perks.map((perk, i) => (
                <span key={i} className="text-[9px] text-brandYellow font-bold uppercase">{perk}</span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* PERK DRAFT OVERLAY */}
      {perkDraft && (
        <div className="absolute inset-0 flex items-center justify-center z-40 pointer-events-auto">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div className="relative z-10 flex flex-col items-center gap-6 px-8 max-w-2xl w-full">
            <div className="text-center">
              <span className="text-[10px] text-brandYellow font-mono tracking-[0.4em] uppercase block animate-pulse">// GAME PAUSED — PERK DRAFT //</span>
              <span className="text-xs text-gray-500 font-mono uppercase">Press 1, 2, or 3 to choose — run resumes instantly</span>
            </div>
            <div className="grid grid-cols-3 gap-4 w-full">
              {perkDraft.map((perk, i) => (
                <div key={i}
                  className="bg-black border-2 border-brandYellow p-4 flex flex-col items-center gap-2 cursor-pointer hover:bg-brandYellow/10 transition-all shadow-[0_0_20px_rgba(255,230,92,0.3)]"
                  onClick={() => {
                    const state = stateRef.current;
                    state.perks.push(perk);
                    state.perkDraftPending = false;
                    setPerkDraft(null);
                    synthRef.current?.playPerkDraft();
                  }}>
                  <span className="text-brandYellow font-black text-2xl">[{i + 1}]</span>
                  <span className="text-white font-mono text-[10px] uppercase tracking-widest text-center leading-relaxed">{perk}</span>
                  <span className="text-brandRed/60 font-mono text-[9px] uppercase text-center">
                    {perk === 'drain halved' && 'stability drain ÷2'}
                    {perk === 'blaster fast' && 'charges cost 3 crystals'}
                    {perk === 'aliens drop charges' && '40% chance per kill'}
                    {perk === 'combo never resets' && 'hits don\'t break combo'}
                    {perk === 'crystal magnet always' && 'permanent pull field'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Controls hint */}
      {isPlaying && (
        <div className="absolute bottom-6 left-6 right-6 flex justify-between font-mono text-[10px] tracking-wider text-brandYellow/40 pointer-events-none select-none z-10 uppercase">
          <div className="flex flex-col gap-1 text-left">
            <span>[W] / [↑] — JUMP</span>
            <span>[HOLD SPACE] — CHARGE SHOT / [RELEASE] — FIRE</span>
            <span>[F] — INSTANT STANDARD SHOT</span>
            <span>COMBO ×3 = WIDE SHOT  //  ×5 = RAPID FIRE  //  BOSS KILL = NOVA</span>
          </div>
          <div className="text-right text-brandYellow/50 font-bold">
            <span>DODGE OR SHOOT ALIENS // CRYSTALS RESTORE STABILITY</span>
          </div>
        </div>
      )}

      {/* Game over */}
      {!isPlaying && (
        <div className="absolute inset-0 bg-brandBlack flex items-center justify-center z-50">
          <div className="absolute inset-0 opacity-10 bg-[linear-gradient(rgba(255,78,62,0.3)_1px,transparent_1px)] bg-[size:100%_4px] pointer-events-none" />
          <div className="w-full max-w-2xl px-12 text-left space-y-8 relative z-10">
            <div className="space-y-2 border-l-4 border-brandRed pl-6">
              <span className="text-xs text-brandRed font-mono tracking-[0.3em] block uppercase opacity-70">// CRITICAL_CORE_LIFELINE_TERMINATED</span>
              <h2><BrandText text="CORE DEPLETED" className="text-5xl md:text-6xl text-brandRed block font-black tracking-tighter leading-none" /></h2>
            </div>
            <div className="font-mono text-xs text-gray-400 uppercase leading-relaxed grid grid-cols-1 md:grid-cols-2 gap-6 border border-brandRed/20 p-6 bg-black/60 backdrop-blur-md">
              <div className="space-y-2">
                <p className="text-brandYellow font-bold">TERMINATION SUMMARY:</p>
                <p>TOTAL SCORE: <span className="text-white font-bold">{score.toLocaleString()} PTS</span></p>
                {score >= personalBest && personalBest > 0 && (
                  <p className="text-[#1ED760] font-black animate-pulse">🏆 NEW PERSONAL BEST!</p>
                )}
                <p>PERSONAL BEST: <span className="text-brandYellow font-bold">{personalBest.toLocaleString()} PTS</span></p>
                <p>CRYSTALS: <span className="text-white font-bold">{crystalCount}</span></p>
                <p>SURVIVED: <span className="text-[#ff44aa] font-bold">{runStreak}s</span></p>
                <p>DISTANCE: <span className="text-white font-bold">{Math.floor(stateRef.current.milesTraveled)} UNITS</span></p>
                {stateRef.current.perks.length > 0 && (
                  <div className="pt-1">
                    <p className="text-brandYellow/60 text-[10px]">PERKS THIS RUN:</p>
                    {stateRef.current.perks.map((perk, i) => (
                      <p key={i} className="text-brandYellow text-[10px]">• {perk}</p>
                    ))}
                  </div>
                )}
              </div>
              <div className="border-t md:border-t-0 md:border-l border-brandYellow/20 pt-4 md:pt-0 md:pl-6 space-y-2">
                <p className="text-brandYellow font-bold">// TOP 3 HIGH SCORES //</p>
                {leaderboard.map((e, i) => (
                  <div key={i} className="flex justify-between text-[11px] font-mono tracking-tight uppercase">
                    <span className="text-gray-500 font-bold">{i + 1}. {e.name}</span>
                    <span className="text-white font-bold">{e.score} PTS</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="pt-2 flex flex-wrap gap-4 items-center">
              <button onClick={reboot} className="bg-brandYellow hover:bg-brandRed text-black font-helvetica font-black py-4 px-10 text-sm uppercase tracking-widest transition-all duration-200 cursor-pointer pointer-events-auto border-none active:scale-95 shadow-[4px_4px_0px_#ff4e3e]">
                RE-INITIALIZE CORE
              </button>
              <a href="https://open.spotify.com/artist/4JNKjNlt3rtcIl84NiK4Lr" target="_blank" rel="noopener noreferrer"
                className="bg-[#000] border-[3px] border-[#1ED760] hover:bg-[#1ED760] hover:text-black text-[#1ED760] font-helvetica font-black py-4 px-10 text-base uppercase tracking-widest transition-all duration-200 cursor-pointer pointer-events-auto shadow-[5px_5px_0px_#1ED760] flex items-center gap-3">
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.24 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.84.24 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.6.18-1.2.72-1.38 4.26-1.321 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.56.3z"/></svg>
                FOLLOW ON SPOTIFY
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};