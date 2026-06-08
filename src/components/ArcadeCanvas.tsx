'use client';

import React, { useEffect, useRef, useState } from 'react';
import { BrandText } from './BrandText';

// Flip to false before shipping — gates the keyboard test shortcuts (O/G/B/P/U/C/J).
const DEBUG = false;
// On mobile the game renders at a fixed 16:9 reference resolution (1280x720, set on the
// page-level stage wrapper) and is uniformly scaled to fit — so the phone shows the exact
// desktop layout, counters and all, just smaller. Desktop still uses the live window size.
// Late-game combo multiplier saturates here so mindless mashing can't scale forever.
const COMBO_CAP = 12;
// Hard ceiling on stored blaster charges so you can't hoard a stockpile and mash-fire
// aimlessly through the late game. Temporary egg modes may stack a little higher.
const MAX_BLASTER_CHARGES = 9;

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
  isShield?: boolean; isTripleJump?: boolean; isMagnet?: boolean;
  isGolden?: boolean; isHazard?: boolean;
  isTime?: boolean; isGhost?: boolean; isDoubleTap?: boolean;
  isOvercharge?: boolean; isMirror?: boolean; isFloat?: boolean;
  isPurpleUnicorn?: boolean; isApex?: boolean;
}
interface Boss {
  x: number; y: number; width: number; height: number;
  health: number; maxHealth: number;
  vx: number; phase: number; animFrame: number;
  alive: boolean; name: string;
  pattern: number;        // which attack pattern (0=track,1=charge,2=shoot,3=mix)
  chargeVy: number;       // for pattern 1 horizontal charge
  shootCooldown: number;  // for pattern 2/3
}
interface BossProjectile {
  x: number; y: number; vx: number; vy: number; alive: boolean;
}
interface Alien {
  type: 'normal' | 'super' | 'speedy' | 'sniper' | 'tank' | 'bomber' | 'prism' | 'unicorn' | 'chariot';
  health: number; zigzagPhase: number;
  id: number; x: number; y: number;
  width: number; height: number; vx: number;
  animFrame: number; alive: boolean;
  bomberDropped?: boolean;   // bomber only fires once
  straightRunner?: boolean;  // normal aliens: true = flies dead straight, false = weaves up/down (set at spawn)
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

  playJump()       { this.sfx(200, 400,  'sine',     0.12, 0.18); }
  playBlaster()    { this.sfx(880, 110,  'sawtooth', 0.18, 0.28); }
  playWideShot()   { this.sfx(660, 80,   'sawtooth', 0.28, 0.38); }
  playRapidShot()  {
    this.sfx(1100, 200, 'square', 0.12, 0.3);
    setTimeout(() => this.sfx(1300, 250, 'square', 0.12, 0.3), 120);
    setTimeout(() => this.sfx(1500, 300, 'square', 0.12, 0.3), 240);
  }
  playNova()       {
    this.sfx(200, 40, 'sawtooth', 0.8, 0.5);
    setTimeout(() => this.sfx(800, 1600, 'sine', 0.6, 0.4), 100);
    setTimeout(() => this.sfx(400, 20, 'triangle', 0.7, 0.45), 200);
  }
  playChargeUp()   { this.sfx(300, 1200, 'sine',     0.05, 0.08); }
  playExplosion()  { this.sfx(180, 35,   'triangle', 0.28, 0.40); }
  playCrystal()    { this.sfx(520, 900,  'sine',     0.22, 0.20); }
  playCharge()     { this.sfx(300, 700,  'sine',     0.30, 0.25); }
  playHurt()       { this.sfx(120, 60,   'sawtooth', 0.30, 0.40); }
  playCombo(n: number) { this.sfx(400 + n * 80, 800 + n * 80, 'sine', 0.25, 0.22); }
  playShield()     { this.sfx(200, 1200, 'sine',     0.45, 0.28); }
  playShieldBreak(){ this.sfx(600, 80,   'sawtooth', 0.30, 0.35); }
  playSpeedBoost() { this.sfx(300, 1400, 'triangle', 0.35, 0.30); }
  playSuperKill()  {
    this.sfx(800, 40, 'sawtooth', 0.6, 0.5);
    setTimeout(() => this.sfx(600, 30, 'square',   0.4, 0.4), 80);
    setTimeout(() => this.sfx(400, 20, 'triangle', 0.5, 0.45), 160);
  }
  playScoreMult()  { this.sfx(400, 1600, 'sine',     0.4, 0.3); }
  playTripleJump() { this.sfx(300, 1200, 'triangle', 0.3, 0.25); }
  playPerkDraft()  { this.sfx(500, 1800, 'sine',     0.5, 0.3); }
  playMagnet()     { this.sfx(350, 900,  'sine',     0.3, 0.22); }
  playBossIntro()  {
    this.sfx(120, 40, 'sawtooth', 0.8, 0.5);
    setTimeout(() => this.sfx(80, 30, 'square', 0.6, 0.4), 200);
  }
  playBossHit()    { this.sfx(400, 150, 'sawtooth', 0.2, 0.3); }
  playBossKill()   {
    this.sfx(600, 20, 'sawtooth', 1.0, 0.5);
    setTimeout(() => this.sfx(800, 30, 'square',   0.7, 0.45), 120);
    setTimeout(() => this.sfx(1200, 40, 'triangle', 0.5, 0.4),  240);
  }
  playGoldenKill() { this.sfx(900, 1800, 'sine', 0.5, 0.4); setTimeout(() => this.sfx(1200, 2400, 'sine', 0.4, 0.35), 80); }
  playPerfectShot(){ this.sfx(800, 2000, 'sine', 0.3, 0.35); setTimeout(() => this.sfx(1200, 2800, 'sine', 0.25, 0.3), 80); }
  playWeather()    { this.sfx(80, 40, 'triangle', 0.8, 0.35); }
  playChainTick()  { this.sfx(600 + this.intensityLevel * 40, 900, 'sine', 0.08, 0.12); }
  playHazard()     { this.sfx(150, 60, 'sawtooth', 0.35, 0.45); setTimeout(() => this.sfx(100, 40, 'sawtooth', 0.25, 0.35), 150); }
  playSniper()     { this.sfx(1200, 300, 'square', 0.1, 0.2); }
  playTankHit()    { this.sfx(200, 100, 'sawtooth', 0.2, 0.35); }
  playBomberDrop() { this.sfx(400, 80, 'sawtooth', 0.25, 0.3); }
  playTimeCrystal(){ this.sfx(200, 800, 'sine', 0.4, 0.3); setTimeout(()=>this.sfx(400,1200,'sine',0.3,0.25),150); }
  playGhostCrystal(){ this.sfx(600,1800,'sine',0.3,0.2); setTimeout(()=>this.sfx(900,2400,'sine',0.2,0.15),100); }
  playMirrorCrystal(){ this.sfx(300,1500,'triangle',0.35,0.28); }
  playFloatCrystal(){ this.sfx(400,2000,'sine',0.5,0.35); setTimeout(()=>this.sfx(600,2400,'triangle',0.4,0.3),100); setTimeout(()=>this.sfx(800,2800,'sine',0.3,0.25),200); }
  playOuroMode()  { this.sfx(200,1600,'sine',0.8,0.5); setTimeout(()=>this.sfx(400,2400,'triangle',0.6,0.45),150); setTimeout(()=>this.sfx(800,3200,'sine',0.5,0.4),300); }
  playBerserker() { this.sfx(100,50,'sawtooth',0.6,0.7); setTimeout(()=>this.sfx(150,60,'sawtooth',0.5,0.6),100); }
  playGhostRun()  { this.sfx(800,200,'triangle',0.5,0.35); setTimeout(()=>this.sfx(600,150,'sine',0.4,0.3),150); }
  setMuted(m: boolean) { this.masterGain.gain.setTargetAtTime(m ? 0 : 0.14, this.ctx.currentTime, 0.1); }
}

// Perk display (pt-PT). The keys stay in English because the game logic matches on them
// (hasPerk('drain halved') etc.) — only the shown label/description is localized.
const PERK_LABEL: Record<string, string> = {
  'drain halved': 'DRENO REDUZIDO',
  'blaster fast': 'CARGA RÁPIDA',
  'aliens drop charges': 'ALIENS DÃO CARGA',
  'combo never resets': 'COMBO FIXO',
  'crystal magnet always': 'ÍMAN PERMANENTE',
};
const PERK_DESC: Record<string, string> = {
  'drain halved': 'perda de estabilidade ÷2',
  'blaster fast': 'carga a cada 3 cristais',
  'aliens drop charges': '40% de hipótese por abate',
  'combo never resets': 'ser atingido não quebra o combo',
  'crystal magnet always': 'campo de atração permanente',
};
const perkLabel = (k: string) => PERK_LABEL[k] ?? k;

// ---- COMPONENT ----
export const ArcadeCanvas: React.FC<{ stageScale?: number; isMobileStage?: boolean }> = ({ stageScale = 1, isMobileStage = false }) => {
  const canvasRef   = useRef<HTMLCanvasElement | null>(null);
  const synthRef    = useRef<ArcadeSynth | null>(null);
  const resumeAudioRef = useRef<(() => void) | null>(null);  // lets the mount-time unlock listener call the latest resumeAudio
  const frameRef    = useRef<number>(0);
  const textIdRef   = useRef(0);
  const spaceHeldRef = useRef(false);
  // ---- MOBILE TOUCH CONTROLS ----
  const lastStabRef = useRef(100);                        // throttles the stability HUD re-render to once per integer change
  const lastChargeUiRef = useRef(0);                      // throttles the charge-bar HUD re-render (was firing every frame while charging)
  const jumpRef     = useRef<(() => void) | null>(null);  // bridges effect-scoped doJump to touch handlers
  const leftDownRef = useRef(0);                          // timestamp of left-pad press (quick-tap vs hold)
  const pausedRef   = useRef(false);                      // freezes the sim while held in portrait on mobile

  const [score,            setScore]            = useState(0);
  const [crystalCount,     setCrystalCount]     = useState(0);
  const [blasterCharges,   setBlasterCharges]   = useState(0);
  const [stability,        setStability]        = useState(100);
  const [isPlaying,        setIsPlaying]        = useState(false);  // gated behind the intro/mode-select screen
  const [isMuted,          setIsMuted]          = useState(false);
  // Auto-pick Mobile on touch devices; the intro screen lets the player override either way.
  const [controlMode,      setControlMode]      = useState<'desktop' | 'mobile'>(
    () => (typeof window !== 'undefined' && (('ontouchstart' in window) || (navigator.maxTouchPoints || 0) > 0)) ? 'mobile' : 'desktop'
  );
  const [showIntro,        setShowIntro]        = useState(true);   // mode-select / start screen
  const [isPortrait,       setIsPortrait]       = useState(false);
  const [ignoreRotate,     setIgnoreRotate]     = useState(false);  // player chose "play anyway" in portrait
  const [comboCount,       setComboCount]       = useState(0);
  const [hasShield,        setHasShield]        = useState(false);
  const [speedBoosted,     setSpeedBoosted]     = useState(false);
  const [tripleJumpActive, setTripleJumpActive] = useState(false);
  const [scoreMultActive,  setScoreMultActive]  = useState(false);
  const [magnetActive,     setMagnetActive]     = useState(false);
  const [perkDraft,        setPerkDraft]        = useState<string[] | null>(null);
  const [personalBest,     setPersonalBest]     = useState(() => {
    try { return parseInt(localStorage.getItem('arcade_pb') || '0'); } catch { return 0; }
  });
  const [runStreak,        setRunStreak]        = useState(0);
  const [weaponTier,       setWeaponTier]       = useState(0);
  const [chargeLevel,      setChargeLevel]      = useState(0);
  const [novaReady,        setNovaReady]        = useState(false);
  const [crystalChain,     setCrystalChain]     = useState(0);
  const [weatherEvent,     setWeatherEvent]     = useState<string | null>(null);
  const [easterEggMode,    setEasterEggMode]    = useState<string | null>(null); // 'ouro'|'ghost_run'|'berserker'
  const [timeSlow,         setTimeSlow]         = useState(false);
  const [ghostMode,        setGhostMode]        = useState(false);
  const [mirrorMode,       setMirrorMode]       = useState(false);
  const [floatMode,        setFloatMode]        = useState(false);

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
    accumulator:       0,   // fixed-timestep: leftover ms carried between frames
    screenFlash:       0,
    screenShake:       0,
    milesTraveled:     0,
    comboCount:        0,
    crystalsTotal:     0,
    crystalsSinceCharge: 0,
    blasterCharges:    0,
    alienIdInc:        0,
    meteorIdInc:       0,
    coyoteCounter:     0,
    jumpBufferCounter: 0,
    // reward mechanics
    killCombo:         0,
    comboTimer:        0,   // ticks since last kill — drives combo decay
    shieldActive:      false,
    speedBoostTicks:   0,
    crystalsSinceShield: 0,
    tripleJumpTicks:   0,
    scoreMultTicks:    0,
    crystalsSinceTriple: 0,
    superAlienSpawned: false,
    calmTicks:         0,
    boss:              null as Boss | null,
    bossProjectiles:   [] as any[],
    magnetTicks:       0,
    perks:             [] as string[],
    crystalsSincePerks: 0,
    crystalsSinceBoss:  0,
    bossSpeedReliefTicks: 0,
    streakTicks:        0,
    perkDraftPending:   false,
    perkOptions:        [] as string[],
    crystalsSinceMagnet: 0,
    // weapon system
    weaponTier:         0,  // 0=standard 1=wide 2=rapid 3=nova
    chargeHeld:         0,
    chargeMax:          90,
    novaUnlocked:       false,
    lastChargeRatio:    0,  // for perfect shot detection
    // crystal chain
    crystalChain:       0,
    crystalChainTimer:  0,
    // golden alien cooldown
    goldenCooldown:     0,
    prismCooldown:      0,   // PRISM alien spawn spacing
    unicornCooldown:    0,   // UNICORN spawn spacing
    chariotCooldown:    0,   // GOLD CHARIOT spawn spacing
    // weather
    weatherTicks:       0,
    weatherType:        '' as string,
    weatherWarnTicks:   0,
    nextWeatherAt:      2700,
    nextHazardWaveAt:   1800,   // first debris storm ~30s in, then escalates
    // boss escalation
    bossCount:          0,
    // hazard crystal — rare speed surge
    hazardSpeedTicks:   0,
    crystalsSinceHazard: 0,
    // new crystal power-ups
    timeSlowTicks:      0,   // TIME crystal
    ghostTicks:         0,   // GHOST crystal
    mirrorTicks:        0,   // MIRROR crystal — aliens reverse
    floatTicks:         0,   // FLOAT crystal — infinite jumps
    doubleTapReady:     false, // DOUBLE TAP crystal — next shot 2x
    overchargeReady:    false, // OVERCHARGE crystal — instant full charge
    // easter egg tracking
    easterEggMode:      '' as string,  // 'ouro'|'ghost_run'|'berserker'
    easterEggTicks:     0,
    ouroModeAirCrystals: 0,  // crystals collected airborne during FLOAT for OURO trigger
    ghostRunShotsFired: 0,   // tracks if player fired (for GHOST RUN)
    ghostRunTimer:      0,   // ticks survived without firing
    berserkerKills:     0,   // kills in current window (only counts when NOT already raging)
    berserkerTimer:     0,   // resets the kill window every 720 ticks
    berserkerCooldown:  0,   // lockout after berserker ends so rapid-fire can't instantly re-arm it
    crystalsSinceRarePerk: 0, // spacing for new rare crystals
    platformsSinceStair: 0,  // spacing so crystal staircases only appear every so often
    warpToast: { active: false, text: '', life: 0, maxLife: 90, y: 0 },
  });

  const feedbackWords = ['ALMA', 'DOBRO', 'OURO', 'CRU', 'BRUTO', 'ENERGIA', 'REVOLTA', 'SUAV'];

  // ---- SYNTH LIFECYCLE ----
  // NOTE: we deliberately DON'T create the AudioContext here. iOS only lets a context make sound
  // if it's created/resumed inside a user gesture — creating it in this mount effect left it
  // permanently suspended on phones. Creation happens in resumeAudio() (wired to the first tap);
  // here we only drive the music loop once the synth exists.
  useEffect(() => {
    if (isPlaying) synthRef.current?.startLoop();
    else synthRef.current?.stopLoop();
    return () => synthRef.current?.stopLoop();
  }, [isPlaying]);

  // Bulletproof mobile unlock: the very first touch anywhere on the page creates + kickstarts the
  // audio context, regardless of which control the user happens to hit first.
  useEffect(() => {
    const unlock = () => { try { resumeAudioRef.current?.(); } catch {} };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('touchend', unlock, { once: true });
    return () => { window.removeEventListener('pointerdown', unlock); window.removeEventListener('touchend', unlock); };
  }, []);

  const toggleMute = () => {
    if (!synthRef.current) return;
    synthRef.current.setMuted(!isMuted);
    setIsMuted(!isMuted);
  };

  // Canvas-space height (the fixed reference size on mobile, live window on desktop).
  // Shot/nova/toast sizing must key off this, not the live window, or they break when scaled.
  const viewH = () => canvasRef.current?.height || window.innerHeight;

  // ---- WEAPON: release fires based on charge + tier ----
  const releaseBlaster = () => {
    const state = stateRef.current;
    if (!isPlaying || state.blasterCharges < 1) { state.chargeHeld = 0; setChargeLevel(0); return; }

    const chargeRatio = Math.min(1, state.chargeHeld / state.chargeMax);
    state.lastChargeRatio = chargeRatio;
    state.chargeHeld = 0;
    setChargeLevel(0);
    // Ghost run — any shot breaks the streak
    state.ghostRunShotsFired++;

    const tier = state.weaponTier;
    const px = state.player.x + PW + 4;
    const py = state.player.y + PH / 2;

    // Overcharge — override charge ratio to full
    const effectiveCharge = state.overchargeReady ? 1.0 : chargeRatio;
    if (state.overchargeReady) {
      state.overchargeReady = false;
      state.screenFlash = 0.2;
    }

    // NOVA — full charge + tier 3 + unlocked
    if (state.novaUnlocked && effectiveCharge >= 0.9 && tier >= 3) {
      state.novaUnlocked = false; state.blasterCharges--;
      setNovaReady(false); setBlasterCharges(state.blasterCharges);
      synthRef.current?.playNova();
      for (let i = 0; i < 5; i++) {
        state.projectiles.push({ x: px, y: i * (viewH() / 5), width: 160, height: Math.round(viewH() / 5) + 10, vx: 22, alive: true });
      }
      state.screenFlash = 0.7; state.calmTicks = 60 * 3;
      state.warpToast.active = true; state.warpToast.text = 'NOVA DISCHARGED — FULL CLEAR';
      state.warpToast.life = state.warpToast.maxLife; state.warpToast.y = viewH() * 0.22;
      return;
    }

    state.blasterCharges--;
    setBlasterCharges(state.blasterCharges);

    if (tier === 0 || effectiveCharge < 0.4) {
      // STANDARD
      synthRef.current?.playBlaster();
      const h = Math.round(viewH() * 0.07);
      state.projectiles.push({ x: px, y: py - h / 2, width: 80, height: h, vx: 20, alive: true });
      if (state.doubleTapReady) { state.doubleTapReady = false; setTimeout(() => stateRef.current.projectiles.push({ x: px, y: py - h / 2, width: 80, height: h, vx: 22, alive: true }), 120); }
    } else if (tier === 1 || effectiveCharge < 0.7) {
      // WIDE
      synthRef.current?.playWideShot();
      const h = Math.round(viewH() * 0.18);
      state.projectiles.push({ x: px, y: py - h / 2, width: 110, height: h, vx: 18, alive: true });
      const h2 = Math.round(viewH() * 0.06);
      state.projectiles.push({ x: px + 20, y: py - h / 2 - h2 - 4, width: 70, height: h2, vx: 22, alive: true });
      state.projectiles.push({ x: px + 20, y: py + h / 2 + 4,       width: 70, height: h2, vx: 22, alive: true });
    } else if (tier === 2 || effectiveCharge < 0.95) {
      // RAPID — 3 staggered shots
      synthRef.current?.playRapidShot();
      const h = Math.round(viewH() * 0.1);
      for (let i = 0; i < 3; i++) {
        setTimeout(() => {
          stateRef.current.projectiles.push({ x: px + i * 35, y: py - h / 2, width: 65, height: h, vx: 24 + i * 2, alive: true });
        }, i * 100);
      }
    } else {
      // FULL CHARGE max power
      synthRef.current?.playWideShot();
      const h = Math.round(viewH() * (0.07 + tier * 0.06));
      state.projectiles.push({ x: px, y: py - h / 2, width: 120, height: h, vx: 22, alive: true });
      state.screenFlash = 0.2;
    }
  };

  const handleCanvasClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    resumeAudio();
    const state = stateRef.current;
    if (controlMode === 'mobile') return;  // mobile uses the on-screen pads, not click-to-shoot
    if (!isPlaying || state.blasterCharges < 1) return;
    state.blasterCharges--; setBlasterCharges(state.blasterCharges);
    state.lastChargeRatio = 0;
    state.ghostRunShotsFired++;
    synthRef.current?.playBlaster();
    const h = Math.round(viewH() * 0.07);
    state.projectiles.push({ x: state.player.x + PW + 4, y: state.player.y + PH / 2 - h / 2, width: 80, height: h, vx: 20, alive: true });
  };

  // ---- MOBILE TOUCH HANDLERS ----
  // Mobile audio unlock: iOS only lets a Web Audio context start from inside a user gesture.
  // The synth was previously created in a React effect (after the tap), so its context was born
  // outside any gesture and stayed suspended → no sound on phone. Create it lazily HERE (called
  // from the INITIALIZE tap and every pad press) so the context is born + resumed in-gesture.
  const resumeAudio = () => {
    if (!synthRef.current) synthRef.current = new ArcadeSynth();
    const c = synthRef.current.ctx;
    // iOS "kickstart": playing a 1-sample silent buffer synchronously inside the gesture is what
    // actually flips the context to running — resume() alone is often ignored on Safari.
    try {
      const b = c.createBuffer(1, 1, 22050);
      const src = c.createBufferSource(); src.buffer = b; src.connect(c.destination); src.start(0);
    } catch {}
    if (c.state === 'suspended') c.resume().catch(() => {});
    if (synthRef.current && isPlaying) synthRef.current.startLoop();
  };
  resumeAudioRef.current = resumeAudio;

  // Right pad — tap to jump (same as W/↑).
  const onJumpTouch = (e: React.PointerEvent) => { e.preventDefault(); e.stopPropagation(); resumeAudio(); jumpRef.current?.(); };

  // Left pad — press starts a charge; a quick tap (released fast) fires an instant shot instead.
  const onFireDown = (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation(); resumeAudio();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}  // keep pointerup on this pad even if the finger slides off
    leftDownRef.current = (typeof performance !== 'undefined' ? performance.now() : 0);
    const s = stateRef.current;
    if (isPlaying && s.blasterCharges > 0 && !spaceHeldRef.current) { spaceHeldRef.current = true; s.chargeHeld = 1; }
  };
  const onFireUp = (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    const s = stateRef.current;
    const held = (typeof performance !== 'undefined' ? performance.now() : 0) - leftDownRef.current;
    spaceHeldRef.current = false;
    if (held < 180) {
      // Quick tap = instant standard shot (mirrors F / canvas click).
      s.chargeHeld = 0; setChargeLevel(0);
      if (isPlaying && s.blasterCharges >= 1) {
        s.blasterCharges--; setBlasterCharges(s.blasterCharges);
        s.lastChargeRatio = 0; s.ghostRunShotsFired++;
        synthRef.current?.playBlaster();
        const h = Math.round(viewH() * 0.07);
        s.projectiles.push({ x: s.player.x + PW + 4, y: s.player.y + PH / 2 - h / 2, width: 80, height: h, vx: 20, alive: true });
      }
    } else {
      // Held = release a charged shot.
      if (s.chargeHeld > 0) releaseBlaster();
      s.chargeHeld = 0; setChargeLevel(0);
    }
  };

  const startGame = () => { resumeAudio(); setShowIntro(false); reboot(); };

  // ---- ORIENTATION TRACKING (mobile) ----
  useEffect(() => {
    // matchMedia is far more reliable than comparing innerW/innerH — on mobile the
    // dimensions lag behind orientationchange, which made the rotate prompt get stuck.
    const compute = () => {
      const portrait = (typeof window.matchMedia === 'function')
        ? window.matchMedia('(orientation: portrait)').matches
        : window.innerHeight > window.innerWidth;
      setIsPortrait(portrait);
    };
    compute();
    const onChange = () => { compute(); setTimeout(compute, 350); };  // re-check after dimensions settle
    window.addEventListener('resize', onChange);
    window.addEventListener('orientationchange', onChange);
    const mq = (typeof window.matchMedia === 'function') ? window.matchMedia('(orientation: portrait)') : null;
    mq?.addEventListener?.('change', compute);
    return () => {
      window.removeEventListener('resize', onChange);
      window.removeEventListener('orientationchange', onChange);
      mq?.removeEventListener?.('change', compute);
    };
  }, []);
  // Freeze the sim (no drain) while held in portrait — unless the player chose "play anyway".
  useEffect(() => { pausedRef.current = controlMode === 'mobile' && isPortrait && !ignoreRotate && !showIntro; }, [controlMode, isPortrait, ignoreRotate, showIntro]);

  // ---- MATRIX RAIN INIT ----
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const state = stateRef.current;
    state.matrixColumns = [];
    const mw = canvas.clientWidth  || window.innerWidth;
    const mh = canvas.clientHeight || window.innerHeight;
    // The matrix rain is the heaviest cheap-draw: every char is a per-frame fillText. On mobile
    // we space columns wider (≈half as many) and cap their length, slashing fillText calls.
    const isMob   = controlMode === 'mobile';
    const spacing = isMob ? 44 : 24;
    const maxLen  = isMob ? 9  : 20;
    const cols = Math.floor(mw / spacing);
    for (let i = 0; i < cols; i++) {
      const chars: string[] = [];
      for (let j = 0; j < Math.floor(Math.random() * (maxLen - 6)) + 6; j++) chars.push(Math.random() > 0.5 ? '1' : '0');
      state.matrixColumns.push({ x: i * spacing, y: Math.random() * -mh, speed: Math.random() * 3.5 + 2, chars });
    }
  }, []);

  // ---- MAIN LOOP ----
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    // alpha:false → opaque canvas. The bg is repainted full-screen every frame anyway, so we
    // gain nothing from a transparent backing store and the browser can composite it faster.
    const ctx = canvas.getContext('2d', { alpha: false }) as CanvasRenderingContext2D; if (!ctx) return;
    // Mobile perf: the neon glow (canvas shadowBlur) is by far the most expensive op on phone
    // GPUs — applied to nearly every draw it murders the framerate. Clamp it to 0 on mobile so
    // the shapes/colours stay but the costly bloom halos are skipped. Desktop keeps the glow.
    if (controlMode === 'mobile') {
      try { Object.defineProperty(ctx, 'shadowBlur', { configurable: true, get: () => 0, set: () => {} }); } catch {}
    }
    const state = stateRef.current;

    const spawnBanner = () => {
      const pool = ['SIMULAÇÃO DE ENTROPIA', 'PERDA DE ESTABILIDADE', 'LINHA DE VIDA CRÍTICA', 'PARÂMETRO DE SOBREVIVÊNCIA', 'MATRIZ DE REVOLTA'];
      state.bannerTexts.push({ text: pool[Math.floor(Math.random() * pool.length)], x: canvas.width + 160, y: Math.random() * canvas.height * 0.45 + 100, speed: Math.random() * 1.5 + 1, size: Math.floor(Math.random() * 40) + 45, alpha: Math.random() * 0.03 + 0.015, driftY: (Math.random() - 0.5) * 0.2 });
    };

    const resize = () => {
      // Match the drawing buffer to the canvas's LAYOUT size (clientWidth/Height ignore CSS
      // transforms, so on mobile this is the fixed 1280x720 stage; on desktop it's the live
      // window). The page-level wrapper owns the scale-to-fit; here we just fill the parent.
      // NOTE: the game's layout is hardcoded to 1280x720 (many fixed pixel positions), so the
      // buffer must stay 1:1 with the stage — do NOT downscale it or the layout breaks.
      canvas.width  = canvas.clientWidth  || window.innerWidth;
      canvas.height = canvas.clientHeight || window.innerHeight;
      state.bannerTexts = []; for (let i = 0; i < 3; i++) spawnBanner();
    };
    // orientationchange lands before the new dimensions settle on mobile — re-fit after a beat.
    const onOrient = () => { resize(); setTimeout(resize, 350); };
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', onOrient);
    resize();

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
      // Mobile: ~40% fewer particles per burst. Particles are cheap individually but explosions
      // stack them in the hundreds; trimming the count keeps the juice without the frame hitch.
      if (controlMode === 'mobile') count = Math.ceil(count * 0.6);
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

    const toast = (text: string) => {
      state.warpToast.active = true; state.warpToast.text = text;
      state.warpToast.life = state.warpToast.maxLife; state.warpToast.y = canvas.height * 0.22;
    };

    const hasPerk = (name: string) => state.perks.includes(name);

    // ---- UNICORN BLESSING — shared whether you shoot it or catch it ----
    const blessUnicorn = (x: number, y: number) => {
      synthRef.current?.playOuroMode();
      synthRef.current?.playFloatCrystal();
      // Full restore + a stack of everything good, for 8 seconds
      state.coreStability = 100; setStability(100);
      state.shieldActive = true; setHasShield(true);
      state.blasterCharges += 3; setBlasterCharges(state.blasterCharges);
      state.speedBoostTicks = Math.max(state.speedBoostTicks, 60 * 8); setSpeedBoosted(true);
      state.magnetTicks     = Math.max(state.magnetTicks, 60 * 8);     setMagnetActive(true);
      state.scoreMultTicks  = Math.max(state.scoreMultTicks, 60 * 8);  setScoreMultActive(true);
      state.calmTicks       = Math.max(state.calmTicks, 60 * 8);
      state.screenFlash = 0.9;
      const blessPts = 3000 + Math.min(14, Math.floor(state.crystalsTotal / 5)) * 300;
      setScore(prev => prev + blessPts);
      const rainbow = ['#ff0000','#ff8800','#ffff00','#00ff88','#4488ff','#cc44ff','#ffffff'];
      for (let ring = 0; ring < 8; ring++) setTimeout(() => burst(x, y, rainbow[ring % rainbow.length], 45, 9 + ring * 2), ring * 60);
      toast(`🦄 UNICORN BLESSING — FULL HEAL + SHIELD + EVERYTHING 8 SEC — +${blessPts.toLocaleString()}`);
      floatFeedback(x, y - 25, `🦄 BLESSED +${blessPts.toLocaleString()}`);
    };

    // ---- GOLD CHARIOT REWARD — shared whether you shoot it or catch it ----
    // Now also tops up the stability bar, so the chariot is a genuine "help" pickup.
    const rewardChariot = (x: number, y: number, scoreMult: number, caught: boolean) => {
      synthRef.current?.playGoldenKill();
      state.screenFlash = 0.7; state.screenShake = 5;
      for (let ring = 0; ring < 7; ring++) setTimeout(() => burst(x, y, ['#ffd700','#ffe65c','#ffffff','#ffaa00'][ring % 4], 45, 9 + ring * 2), ring * 55);
      state.blasterCharges += 2; setBlasterCharges(state.blasterCharges);
      state.scoreMultTicks = 60 * 12; setScoreMultActive(true);
      state.coreStability = Math.min(100, state.coreStability + 45); setStability(Math.floor(state.coreStability));
      const pts = Math.floor((4000 + Math.min(14, Math.floor(state.crystalsTotal / 5)) * 400) * scoreMult);
      setScore(prev => prev + pts);
      toast(`🏆 GOLD CHARIOT${caught ? ' CAUGHT' : ''} — +${pts.toLocaleString()} + ×2 SCORE + 2 CHARGES + HEAL`);
      floatFeedback(x, y - 20, `🏆 CHARIOT +${pts.toLocaleString()}`);
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
        floatFeedback(p.x, p.y - 20, 'SALTO DUPLO');
        synthRef.current?.playJump();
      } else if (p.jumpCount === 2 && !p.isGrounded && state.tripleJumpTicks > 0) {
        p.vy = -11.5; p.jumpCount = 3; p.stretch = 1.55; state.jumpBufferCounter = 0;
        burst(p.x + p.width / 2, p.y + p.height / 2, '#cc44ff', 30, 5);
        burst(p.x + p.width / 2, p.y + p.height / 2, '#ffffff', 15, 4);
        floatFeedback(p.x, p.y - 20, 'SALTO TRIPLO!');
        synthRef.current?.playTripleJump();
      } else if (p.jumpCount >= 2 && !p.isGrounded && state.floatTicks > 0) {
        // FLOAT — infinite jumps while active
        p.vy = -11.0; p.stretch = 1.3; state.jumpBufferCounter = 0;
        burst(p.x + p.width / 2, p.y + p.height / 2, '#ff44ff', 18, 4);
        synthRef.current?.playJump();
      } else if (p.jumpCount === 2 && !p.isGrounded) {
        p.vy = 18.5; p.jumpCount = 3; state.jumpBufferCounter = 0;
        burst(p.x + p.width / 2, p.y, '#ffffff', 15, 4.5);
        floatFeedback(p.x, p.y - 20, 'PANCADA GRAVÍTICA');
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isPlaying) return;

      // ---- DEV SHORTCUTS — test easter eggs ----
      if (DEBUG && e.code === 'KeyO') {
        state.easterEggMode = 'ouro'; state.easterEggTicks = 60 * 20;
        state.floatTicks = 60 * 20;
        state.magnetTicks = 60 * 20; setMagnetActive(true);
        state.scoreMultTicks = 60 * 20; setScoreMultActive(true);
        setFloatMode(true);
        setEasterEggMode('ouro'); synthRef.current?.playOuroMode();
        state.calmTicks = 60 * 20; state.screenFlash = 1.0;
        for (let ring = 0; ring < 8; ring++) setTimeout(() => burst(state.player.x + PW/2, state.player.y + PH/2, ['#ffd700','#ffe65c','#ffffff','#ff44ff'][ring%4], 50, 10+ring), ring * 80);
        toast('✨ [DEV] MODO OURO — SALTOS INFINITOS + ÍMAN + ×10 PONTOS 20 SEG ✨');
        return;
      }
      if (DEBUG && e.code === 'KeyG') {
        state.easterEggMode = 'ghost_run'; state.easterEggTicks = 60 * 20;
        setEasterEggMode('ghost_run'); synthRef.current?.playGhostRun();
        toast('👻 [DEV] CORRIDA FANTASMA — 20 SEG');
        return;
      }
      if (DEBUG && e.code === 'KeyB') {
        state.easterEggMode = 'berserker'; state.easterEggTicks = 60 * 8;
        setEasterEggMode('berserker'); synthRef.current?.playBerserker();
        state.speedBoostTicks = 60 * 8; setSpeedBoosted(true);
        state.screenFlash = 0.8;
        burst(state.player.x + PW/2, state.player.y + PH/2, '#ff0000', 60, 10);
        toast('🔥 [DEV] BERSERKER — 8 SEG');
        return;
      }
      if (DEBUG && e.code === 'KeyP') {
        // Spawn a PRISM alien just ahead of the player, at a reachable height
        state.alienIdInc++;
        state.aliens.push({
          id: state.alienIdInc,
          x: canvas.width * 0.65,
          y: Math.max(60, state.player.y - 40),
          width: 44, height: 44,
          vx: -2.2, animFrame: 0, alive: true, type: 'prism',
          health: 1, zigzagPhase: Math.random() * Math.PI * 2, bomberDropped: false,
        });
        synthRef.current?.playFloatCrystal();
        toast('🌈 [DEV] PRISMA A CHEGAR — DISPARA');
        return;
      }
      if (DEBUG && e.code === 'KeyU') {
        // Spawn a UNICORN just ahead — catch it or shoot it
        state.alienIdInc++;
        state.aliens.push({
          id: state.alienIdInc,
          x: canvas.width * 0.7,
          y: Math.max(60, state.player.y - 30),
          width: 48, height: 48,
          vx: -3.4, animFrame: 0, alive: true, type: 'unicorn',
          health: 1, zigzagPhase: Math.random() * Math.PI * 2, bomberDropped: false,
        });
        synthRef.current?.playOuroMode();
        toast('🦄 [DEV] UNICÓRNIO A CHEGAR — APANHA OU DISPARA');
        return;
      }
      if (DEBUG && e.code === 'KeyC') {
        // Spawn a GOLD CHARIOT just ahead — shoot it for crazy points
        state.alienIdInc++;
        state.aliens.push({
          id: state.alienIdInc,
          x: canvas.width * 0.7,
          y: Math.max(60, state.player.y - 30),
          width: 54, height: 54,
          vx: -3.6, animFrame: 0, alive: true, type: 'chariot',
          health: 1, zigzagPhase: Math.random() * Math.PI * 2, bomberDropped: false,
        });
        synthRef.current?.playGoldenKill();
        toast('🏆 [DEV] CARRUAGEM DOURADA A CHEGAR — DISPARA');
        return;
      }
      if (DEBUG && e.code === 'KeyJ') {
        // Drop a PURPLE UNICORN pickup at the top edge — fetch it
        state.crystals.push({ x: canvas.width * 0.75, y: 24, size: 46, collected: false, pulseOffset: Math.random() * Math.PI * 2, isPurpleUnicorn: true });
        synthRef.current?.playFloatCrystal();
        toast('🦄 [DEV] UNICÓRNIO ROXO NO TOPO — VAI BUSCAR');
        return;
      }

      // Perk draft 1/2/3
      if (state.perkDraftPending && ['Digit1','Digit2','Digit3'].includes(e.code)) {
        const idx = parseInt(e.code.replace('Digit', '')) - 1;
        const chosen = state.perkOptions[idx];
        if (chosen) {
          state.perks.push(chosen);
          state.perkDraftPending = false;
          setPerkDraft(null);
          toast(`PERK ACQUIRED: ${chosen.toUpperCase()}`);
          synthRef.current?.playPerkDraft();
          burst(state.player.x + PW / 2, state.player.y, '#ffe65c', 35, 7);
        }
        return;
      }

      // F — instant standard shot
      if (e.code === 'KeyF' || e.code === 'Enter') {
        if (state.blasterCharges < 1) return;
        state.blasterCharges--; setBlasterCharges(state.blasterCharges);
        state.lastChargeRatio = 0;
        state.ghostRunShotsFired++; // breaks ghost run streak
        synthRef.current?.playBlaster();
        const h = Math.round(viewH() * 0.07);
        state.projectiles.push({ x: state.player.x + PW + 4, y: state.player.y + PH / 2 - h / 2, width: 80, height: h, vx: 20, alive: true });
        return;
      }

      // W / ArrowUp — always jump
      if (e.code === 'ArrowUp' || e.code === 'KeyW') { state.jumpBufferCounter = 6; doJump(); return; }

      // Space — charge if has ammo, else jump
      if (e.code === 'Space' && !spaceHeldRef.current) {
        spaceHeldRef.current = true;
        if (state.blasterCharges > 0) {
          state.chargeHeld = 1;
        } else {
          state.jumpBufferCounter = 6;
          doJump();
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spaceHeldRef.current = false;
        if (state.chargeHeld > 0) releaseBlaster();
        state.chargeHeld = 0; setChargeLevel(0);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    // Bridge the effect-scoped jump (needs doJump/burst/etc.) out to the touch handlers.
    jumpRef.current = () => { state.jumpBufferCounter = 6; doJump(); };

    // ---- SPAWN ALIEN ----
    const spawnAlien = (tier: number) => {
      state.alienIdInc++;
      const p = state.player;
      // Spread aliens across the whole vertical playfield instead of hugging the player's
      // height — this rewards actually aiming and pushes vertical (jump-to-line-up) play.
      // Bias the band slightly toward the player so the top/bottom edges stay less crowded.
      const spawnBandTop = 60;
      const spawnBandBottom = canvas.height - 140;
      const playerAnchor = p.y + p.height / 2 - 18;
      const fullSpread = spawnBandTop + Math.random() * (spawnBandBottom - spawnBandTop);
      // 70% fully-random height, 30% near the player so they're not always chasing crosshairs
      const spawnY = Math.random() < 0.3 ? playerAnchor + (Math.random() - 0.5) * 160 : fullSpread;
      let type: Alien['type'] = 'normal';
      const roll = Math.random();

      // ~0.5% PRISM alien — rare crystal piñata. Needs real progression first.
      if (Math.random() < 0.005 && state.prismCooldown === 0 && state.crystalsTotal >= 15) {
        type = 'prism';
      }
      // ~3% UNICORN — magical, catch it OR shoot it for a blessing. Kept rare.
      else if (Math.random() < 0.03 && state.unicornCooldown === 0 && state.crystalsTotal >= 12) {
        type = 'unicorn';
      }
      // ~1.5% GOLD CHARIOT — fancy bonus racer worth crazy points. Wants progression + spacing.
      else if (Math.random() < 0.015 && state.chariotCooldown === 0 && state.crystalsTotal >= 20) {
        type = 'chariot';
      }
      // Rare late-game alien types (crystal 30+)
      else if (state.crystalsTotal >= 30) {
        if      (roll < 0.06 && tier >= 4) type = 'sniper';
        else if (roll < 0.11 && tier >= 5) type = 'tank';
        else if (roll < 0.16 && tier >= 6) type = 'bomber';
        else if (roll < 0.24 && tier >= 3 && !state.superAlienSpawned) type = 'super';
        else if (roll < 0.42) type = 'speedy';
      } else {
        if (roll < 0.12 && tier >= 3 && !state.superAlienSpawned) type = 'super';
        else if (roll < 0.35) type = 'speedy';
      }

      const isSuper  = type === 'super';
      const isSpeedy = type === 'speedy';
      const isSniper = type === 'sniper';
      const isTank   = type === 'tank';
      const isBomber = type === 'bomber';
      const isPrism  = type === 'prism';
      const isUnicorn = type === 'unicorn';
      const isChariot = type === 'chariot';

      const size  = isSuper ? 60 : isTank ? 64 : isSpeedy || isSniper ? 20 : isPrism ? 44 : isUnicorn ? 48 : isChariot ? 54 : 36;
      const speed = isSuper  ? 2   + tier * 0.15
                  : isSpeedy ? 5   + tier * 0.4  + Math.random() * 2
                  : isSniper ? 7   + tier * 0.5  // fast, straight
                  : isTank   ? 1.2 + tier * 0.1  // slow
                  : isBomber ? 4   + tier * 0.2  // medium, flies past
                  : isPrism  ? 2.2 + tier * 0.05 // slow & floaty — catchable
                  : isUnicorn ? 3.4 + tier * 0.08 // graceful canter
                  : isChariot ? 3.6 + tier * 0.07 // a swift, flashy racer
                  :            3   + tier * 0.28 + Math.random() * 1.5;

      if (isPrism) state.prismCooldown = 1800;  // ~30s gap between prisms
      if (isUnicorn) state.unicornCooldown = 2700;  // ~45s gap between unicorns
      if (isChariot) state.chariotCooldown = 2400;  // ~40s gap between chariots

      if (isSuper) state.superAlienSpawned = true;
      state.aliens.push({
        id: state.alienIdInc,
        x: canvas.width + 60 + Math.random() * 100,
        y: Math.max(40, Math.min(canvas.height - 120, spawnY)),
        width: size, height: size,
        vx: -speed, animFrame: 0, alive: true, type,
        health: isSuper ? 2 : isTank ? 3 : 1,
        zigzagPhase: Math.random() * Math.PI * 2,
        bomberDropped: false,
        straightRunner: type === 'normal' && Math.random() < 0.5,  // half of normals run straight, half weave
      });
    };

    const spawnMeteor = (tier: number) => {
      state.meteorIdInc++;
      state.meteors.push({ id: state.meteorIdInc, x: canvas.width + Math.random() * 200, y: -60, size: Math.floor(Math.random() * 22) + 18, vx: -(2 + Math.random() * 2 + tier * 0.1), vy: 3.5 + Math.random() * 3 + tier * 0.12, rotation: Math.random() * Math.PI, alive: true });
    };

    // ---- UPDATE ----
    const update = () => {
      if (!isPlaying) return;
      if (pausedRef.current) return;       // frozen: mobile held in portrait
      if (state.perkDraftPending) return;  // freeze while picking perk
      state.gameTicks++;

      if (state.warpToast.active) { state.warpToast.life--; if (state.warpToast.life <= 0) state.warpToast.active = false; }

      // Stability drain — now climbs with run time so the late game can't be coasted
      const drainMult = hasPerk('drain halved') ? 0.5 : 1;
      const endurance = state.gameTicks / 3600;  // +1 per minute (spawn cadence + heal falloff self-plateau via their own floors)
      // Difficulty plateaus into a hard-but-sustainable flow state: the stability drain
      // stops climbing after ~6 min, so heal-vs-drain settles into an equilibrium you hold
      // with skill rather than a death spiral. Past the plateau, only bosses escalate.
      const drainEndurance = Math.min(endurance, 6);
      const drain = (0.04 + Math.min(state.crystalsTotal, 40) * 0.001 + drainEndurance * 0.025) * drainMult;
      state.coreStability = Math.max(0, state.coreStability - drain);
      // Only re-render the HUD when the displayed integer actually changes — calling setState
      // every frame forced a full re-render of this whole component 60x/sec, which tanked mobile.
      { const stab = Math.floor(state.coreStability); if (stab !== lastStabRef.current) { lastStabRef.current = stab; setStability(stab); } }
      if (state.coreStability <= 0) {
        setScore(prev => { const f = prev; setPersonalBest(pb => { if (f > pb) { try { localStorage.setItem('arcade_pb', String(f)); } catch {} return f; } return pb; }); return f; });
        setIsPlaying(false); return;
      }

      const tier     = Math.min(14, Math.floor(state.crystalsTotal / 5));
      const diffTier = Math.min(10, tier);   // endurance cap

      // Countdowns
      if (state.speedBoostTicks > 0) { state.speedBoostTicks--; if (state.speedBoostTicks === 0) setSpeedBoosted(false); }
      if (state.tripleJumpTicks > 0) { state.tripleJumpTicks--; if (state.tripleJumpTicks === 0) setTripleJumpActive(false); }
      if (state.scoreMultTicks  > 0) { state.scoreMultTicks--;  if (state.scoreMultTicks  === 0) setScoreMultActive(false); }
      if (state.calmTicks       > 0) state.calmTicks--;
      if (state.magnetTicks     > 0) { state.magnetTicks--;     if (state.magnetTicks     === 0) setMagnetActive(false); }
      if (hasPerk('crystal magnet always') && state.magnetTicks === 0) { state.magnetTicks = 10; setMagnetActive(true); }
      if (state.goldenCooldown  > 0) state.goldenCooldown--;
      if (state.prismCooldown   > 0) state.prismCooldown--;
      if (state.unicornCooldown > 0) state.unicornCooldown--;
      if (state.chariotCooldown > 0) state.chariotCooldown--;
      // Kill-combo decay — combos bleed away if you stop landing kills, so
      // late-game mash-and-hold can't keep an unbounded multiplier alive.
      if (state.killCombo > 0) {
        state.comboTimer++;
        if (state.comboTimer >= 90) {            // ~1.5s without a kill
          state.killCombo = Math.max(0, state.killCombo - 1);
          setComboCount(state.killCombo);
          state.comboTimer = 30;                 // then bleed one every ~0.5s
        }
      }
      if (state.bossSpeedReliefTicks > 0) state.bossSpeedReliefTicks--;
      if (state.hazardSpeedTicks     > 0) state.hazardSpeedTicks--;
      // New crystal power-up countdowns
      if (state.timeSlowTicks > 0) { state.timeSlowTicks--; if (state.timeSlowTicks === 0) setTimeSlow(false); }
      if (state.ghostTicks    > 0) { state.ghostTicks--;    if (state.ghostTicks    === 0) setGhostMode(false); }
      if (state.mirrorTicks   > 0) {
        state.mirrorTicks--;
        
        if (state.mirrorTicks === 0) {
          setMirrorMode(false);
          // Reverse aliens back
          state.aliens.forEach(al => { al.vx = -Math.abs(al.vx); });
        }
      }
      if (state.floatTicks > 0) { state.floatTicks--; if (state.floatTicks === 0) { setFloatMode(false); state.ouroModeAirCrystals = 0; } }
      if (state.easterEggTicks > 0) { state.easterEggTicks--; if (state.easterEggTicks === 0) {
        // Berserker ending: arm a cooldown and wipe the kill window so the rapid-fire
        // spree you just had can't immediately bounce you straight back into it.
        if (state.easterEggMode === 'berserker') { state.berserkerCooldown = 600; state.berserkerKills = 0; state.berserkerTimer = 0; }
        state.easterEggMode = ''; setEasterEggMode(null);
      } }

      // ---- EASTER EGG MODE — CONTINUOUS PERKS WHILE ACTIVE ----
      if (state.easterEggMode && state.easterEggTicks > 0) {
        // Core is protected during any egg mode (gentle regen beats the drain)
        state.coreStability = Math.min(100, state.coreStability + 0.12);

        if (state.easterEggMode === 'ouro') {
          state.calmTicks = Math.max(state.calmTicks, 3);
          if (state.gameTicks % 6 === 0)  setScore(prev => prev + 250 + diffTier * 25);   // passive score drip
          state.magnetTicks = Math.max(state.magnetTicks, 6);                              // permanent pull
          if (state.gameTicks % 75 === 0 && state.blasterCharges < 9) { state.blasterCharges++; setBlasterCharges(state.blasterCharges); }
        } else if (state.easterEggMode === 'ghost_run') {
          state.calmTicks       = Math.max(state.calmTicks, 3);
          state.speedBoostTicks = Math.max(state.speedBoostTicks, 3);                      // untouchable
          state.magnetTicks     = Math.max(state.magnetTicks, 6);
          if (state.gameTicks % 10 === 0) setScore(prev => prev + 120 + state.streakTicks * 5);
        } else if (state.easterEggMode === 'berserker') {
          // No calm — keep the rage on. Pure offense.
          state.speedBoostTicks = Math.max(state.speedBoostTicks, 3);                      // godmode
          if (state.gameTicks % 10 === 0 && state.blasterCharges < 12) { state.blasterCharges++; setBlasterCharges(state.blasterCharges); }  // auto-recharge spam
          if (state.gameTicks % 8 === 0)  setScore(prev => prev + 100);
        }
      }

      // ---- GHOST RUN tracking ----
      if (state.ghostRunShotsFired === 0) {
        state.ghostRunTimer++;
        if (state.ghostRunTimer >= 2700 && state.easterEggMode !== 'ghost_run') {
          state.easterEggMode = 'ghost_run';
          state.easterEggTicks = 60 * 20;
          setEasterEggMode('ghost_run');
          synthRef.current?.playGhostRun();
          // Activation rewards: full core, a shield, a stack of charges, invincibility
          state.coreStability = 100; setStability(100);
          state.shieldActive = true; setHasShield(true);
          state.blasterCharges += 5; setBlasterCharges(state.blasterCharges);
          state.speedBoostTicks = 60 * 20; setSpeedBoosted(true);
          const ghostBonus = state.crystalsTotal * 300 + state.streakTicks * 100;
          setScore(prev => prev + ghostBonus);
          burst(state.player.x + PW / 2, state.player.y + PH / 2, '#ffffff', 50, 8);
          toast(`👻 GHOST RUN! UNTOUCHABLE + SHIELD + 5 CHARGES — +${ghostBonus.toLocaleString()}`);
        }
      } else {
        // Shot fired — reset timer so you have to start the 60 sec over
        state.ghostRunTimer = 0;
        state.ghostRunShotsFired = 0; // reset flag so timer can run again next attempt
      }

      // ---- BERSERKER tracking — 7 kills in 720 ticks, then a cooldown before it can re-arm ----
      if (state.berserkerCooldown > 0) state.berserkerCooldown--;
      state.berserkerTimer++;
      if (state.berserkerTimer >= 720) { state.berserkerTimer = 0; state.berserkerKills = 0; }

      // Weapon charge
      if (state.chargeHeld > 0 && state.blasterCharges > 0) {
        state.chargeHeld = Math.min(state.chargeMax, state.chargeHeld + 1);
        // Only push the charge bar to React when it moves a visible step (was a full re-render
        // every frame while holding fire — a real per-frame cost on mobile).
        const cl = state.chargeHeld / state.chargeMax;
        if (cl >= 1 || Math.abs(cl - lastChargeUiRef.current) >= 0.04) { lastChargeUiRef.current = cl; setChargeLevel(cl); }
        if (state.chargeHeld % 15 === 0) synthRef.current?.playChargeUp();
      }

      // Crystal chain timer — breaks after 2.5 sec without a crystal
      if (state.crystalChain > 0) {
        state.crystalChainTimer++;
        if (state.crystalChainTimer > 150) {
          state.crystalChain = 0; state.crystalChainTimer = 0; setCrystalChain(0);
        }
      }

      // Weather system
      if (state.weatherWarnTicks > 0) {
        state.weatherWarnTicks--;
        if (state.weatherWarnTicks === 0) {
          const dur = state.weatherType === 'flare' ? 60 * 10 : 60 * 8;
          state.weatherTicks = dur;
          setWeatherEvent(state.weatherType);
          synthRef.current?.playWeather();
          const labels: Record<string,string> = { blackout: '🌑 BLACKOUT — 8 SEC', storm: '⛈ STORM — 8 SEC', flare: '☀ SOLAR FLARE — 10 SEC' };
          toast(labels[state.weatherType] ?? 'WEATHER EVENT');
        }
      }
      if (state.weatherTicks > 0) { state.weatherTicks--; if (state.weatherTicks === 0) { setWeatherEvent(null); state.weatherType = ''; } }
      if (state.gameTicks >= state.nextWeatherAt && state.weatherTicks === 0 && state.weatherWarnTicks === 0) {
        state.nextWeatherAt = state.gameTicks + 2700 + Math.floor(Math.random() * 900);
        const types = ['blackout', 'storm', 'flare'];
        state.weatherType = types[Math.floor(Math.random() * types.length)];
        state.weatherWarnTicks = 120;
        toast(`⚠ INCOMING: ${state.weatherType.toUpperCase()} IN 2 SEC`);
      }

      // Run streak
      if (state.gameTicks % 60 === 0) { state.streakTicks++; setRunStreak(state.streakTicks); }

      const hazardMult   = state.hazardSpeedTicks > 0 ? 1.4  : 1;
      const timeSlowMult = state.timeSlowTicks    > 0 ? 0.6  : 1;
      const worldSpeed = state.baseSpeed * (1 + diffTier * 0.06) * hazardMult * timeSlowMult
        * (state.bossSpeedReliefTicks > 0 ? 0.55 + (1 - state.bossSpeedReliefTicks / 600) * 0.45 : 1);

      const p = state.player;
      state.milesTraveled += worldSpeed * 0.025;
      if (state.screenFlash > 0) state.screenFlash -= 0.07;
      if (state.screenShake > 0) state.screenShake = Math.max(0, state.screenShake - 0.08);
      if (state.jumpBufferCounter > 0) state.jumpBufferCounter--;
      if (p.isGrounded) state.coyoteCounter = 5;
      else if (state.coyoteCounter > 0) state.coyoteCounter--;

      if (state.gameTicks % 150 === 0 && state.bannerTexts.length < 5) spawnBanner();
      state.bannerTexts.forEach(b => { b.x -= worldSpeed * 0.2 + b.speed; b.y += b.driftY; });
      state.bannerTexts = state.bannerTexts.filter(b => b.x > -500);
      state.matrixColumns.forEach(col => { col.y += col.speed; if (col.y > canvas.height) col.y = Math.random() * -140 - 40; });

      state.platforms.forEach(pl => { pl.x -= worldSpeed; });

      // Crystal scroll + magnet
      state.crystals.forEach(c => {
        c.x -= worldSpeed;
        if (state.magnetTicks > 0 && !c.collected) {
          const dx = (p.x + PW / 2) - (c.x + c.size / 2);
          const dy = (p.y + PH / 2) - (c.y + c.size / 2);
          const dist = Math.hypot(dx, dy);
          if (dist < 320) { c.x += (dx / dist) * 4.5; c.y += (dy / dist) * 4.5; }
        }
      });

      // Player physics
      p.vy += 0.76; if (p.vy > 20) p.vy = 20;
      p.y += p.vy;
      p.stretch += (1 - p.stretch) * 0.15;
      if (!p.isGrounded && Math.abs(p.vy) > 2) p.stretch = 1 + Math.abs(p.vy) * 0.025;

      let onGround = false;
      for (const pl of state.platforms) {
        if (p.x + p.width > pl.x && p.x < pl.x + pl.width && p.y + p.height >= pl.y && p.y + p.height - p.vy <= pl.y + 18) {
          if (!p.isGrounded && p.vy > 5) { p.stretch = 0.7; burst(p.x + p.width / 2, pl.y, '#ff4e3e', 8, 2); }
          p.y = pl.y - p.height; p.vy = 0; p.isGrounded = true; p.jumpCount = 0;
          state.comboCount = 0; state.lastLandingTick = state.gameTicks; onGround = true;
          // Landing breaks crystal chain
          if (state.crystalChain > 0) { state.crystalChain = 0; state.crystalChainTimer = 0; setCrystalChain(0); }
          if (state.jumpBufferCounter > 0) doJump();
        }
      }
      if (!onGround) p.isGrounded = false;

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
        al.x += al.vx; al.animFrame++;

        if (al.type === 'speedy') {
          al.zigzagPhase += 0.12;
          al.y += Math.sin(al.zigzagPhase) * 4;
          al.y = Math.max(30, Math.min(canvas.height - al.height - 30, al.y));
        } else if (al.type === 'sniper') {
          // Straight line — no Y tracking, tiny, fast
          // y is fixed at spawn
        } else if (al.type === 'tank') {
          // Slow lumbering wall — gentle bob, no longer homes onto the player. Aim for it.
          al.zigzagPhase += 0.02;
          al.y += Math.sin(al.zigzagPhase) * 1.2;
          al.y = Math.max(30, Math.min(canvas.height - al.height - 30, al.y));
        } else if (al.type === 'bomber') {
          // Cruises at its spawn height (no Y-homing) and lobs a bomb straight down when it
          // crosses the player's column — a vertical hazard you dodge or shoot, not a tracker.
          al.zigzagPhase += 0.05;
          al.y += Math.sin(al.zigzagPhase) * 1.5;
          al.y = Math.max(30, Math.min(canvas.height - al.height - 30, al.y));
          if (!al.bomberDropped && al.x + al.width / 2 <= p.x + p.width / 2) {
            al.bomberDropped = true;
            synthRef.current?.playBomberDrop();
            state.meteorIdInc++;
            state.meteors.push({ id: state.meteorIdInc, x: al.x, y: al.y, size: 28, vx: 0, vy: 5 + diffTier * 0.3, rotation: 0, alive: true });
            floatFeedback(al.x, al.y - 20, 'BOMBA LARGADA!');
          }
        } else if (al.type === 'prism') {
          // Slow, hypnotic float — gentle wide sine bob, no tracking (it's a catchable bonus)
          al.zigzagPhase += 0.05;
          al.y += Math.sin(al.zigzagPhase) * 1.6;
          al.y = Math.max(30, Math.min(canvas.height - al.height - 30, al.y));
        } else if (al.type === 'unicorn') {
          // Graceful cantering arc, leaves a rainbow trail
          al.zigzagPhase += 0.07;
          al.y += Math.sin(al.zigzagPhase) * 3.2;
          al.y = Math.max(40, Math.min(canvas.height - al.height - 40, al.y));
          const rainbow = ['#ff0000','#ff8800','#ffff00','#00ff88','#4488ff','#cc44ff'];
          if (state.gameTicks % 2 === 0) {
            const ci = Math.floor(state.gameTicks / 4) % rainbow.length;
            state.particles.push({ x: al.x + al.width / 2, y: al.y + al.height / 2 + (Math.random() - 0.5) * al.height, vx: 1.5 + Math.random(), vy: (Math.random() - 0.5) * 1.5, color: rainbow[ci], alpha: 1, life: 24, size: Math.random() * 3 + 2 });
          }
        } else if (al.type === 'chariot') {
          // Swift gold chariot — galloping bob + a trailing dust of gold sparks
          al.zigzagPhase += 0.09;
          al.y += Math.sin(al.zigzagPhase) * 2.6;
          al.y = Math.max(40, Math.min(canvas.height - al.height - 40, al.y));
          if (state.gameTicks % 2 === 0) {
            const gold = ['#ffd700','#ffe65c','#ffaa00','#ffffff'];
            state.particles.push({ x: al.x + al.width / 2, y: al.y + al.height * 0.7, vx: 1.5 + Math.random() * 1.5, vy: (Math.random() - 0.2) * 1.5, color: gold[Math.floor(state.gameTicks / 3) % gold.length], alpha: 1, life: 22, size: Math.random() * 3 + 2 });
          }
        } else if (al.type === 'super') {
          // Big and tanky but no longer homes — a slow, wide vertical sweep you have to aim at.
          al.zigzagPhase += 0.03;
          al.y += Math.sin(al.zigzagPhase) * 3.5;
          al.y = Math.max(30, Math.min(canvas.height - al.height - 30, al.y));
        } else {
          // Normal aliens: no player tracking. Half run dead straight (set at spawn),
          // half weave up and down — so you have to lead and aim, not just spam-fire forward.
          if (!al.straightRunner) {
            al.zigzagPhase += 0.06;
            al.y += Math.sin(al.zigzagPhase) * 2.4;
            al.y = Math.max(30, Math.min(canvas.height - al.height - 30, al.y));
          }
        }

        // Projectile hits alien
        for (const pr of state.projectiles) {
          if (!pr.alive || !al.alive) continue;
          if (pr.x < al.x + al.width && pr.x + pr.width > al.x && pr.y < al.y + al.height && pr.y + pr.height > al.y) {
            pr.alive = false; al.health--;
            if (al.health > 0) {
              // Tank has 3 hp — show remaining
              const label = al.type === 'tank' ? `TANK ${al.health} HP LEFT!` : 'HIT! ONE MORE!';
              burst(al.x + al.width / 2, al.y + al.height / 2, al.type === 'tank' ? '#888' : '#ff4e3e', 15, 4);
              floatFeedback(al.x, al.y - 10, label);
              if (al.type === 'tank') synthRef.current?.playTankHit();
              return;
            }

            al.alive = false;
            if (al.type === 'super') state.superAlienSpawned = false;

            // ---- PERFECT SHOT CHECK ----
            const isPerfect = state.lastChargeRatio >= 0.9;
            if (isPerfect) { synthRef.current?.playPerfectShot(); burst(al.x + al.width / 2, al.y + al.height / 2, '#ffffff', 20, 6); floatFeedback(al.x, al.y - 25, 'TIRO PERFEITO!'); state.screenFlash = 0.12; }
            // Egg-mode kill score multiplier — OURO ×5, BERSERKER ×4, GHOST RUN ×3
            const ouroMult =
              state.easterEggMode === 'ouro'      ? 5 :
              state.easterEggMode === 'berserker' ? 4 :
              state.easterEggMode === 'ghost_run' ? 3 : 1;

            synthRef.current?.playExplosion();

            // Kill rewards
            if (al.type === 'super') {
              synthRef.current?.playSuperKill();
              state.blasterCharges += 2; setBlasterCharges(state.blasterCharges);
              state.speedBoostTicks = 60 * 10; setSpeedBoosted(true);
              state.screenFlash = 1.0; state.screenShake = 8;
              for (let ring = 0; ring < 6; ring++) setTimeout(() => burst(al.x + al.width / 2, al.y + al.height / 2, ['#ff4e3e','#ffe65c','#ffffff','#cc44ff','#00cfff'][ring % 5], 40, 8 + ring * 2), ring * 80);
              const pts = (2000 + tier * 200) * Math.max(1, state.killCombo) * (isPerfect ? 3 : 1) * ouroMult;
              setScore(prev => prev + pts); toast(`SUPER ALIEN PURGED — GODMODE 10 SEC + 2 CHARGES`);
              floatFeedback(al.x, al.y - 20, `SUPER PURGED +${pts.toLocaleString()}`);
            } else if (al.type === 'speedy') {
              synthRef.current?.playScoreMult();
              state.scoreMultTicks = 60 * 10; setScoreMultActive(true);
              burst(al.x + al.width / 2, al.y + al.height / 2, '#ffe65c', 30, 6);
              const pts = (600 + tier * 60) * Math.max(1, state.killCombo) * (state.scoreMultTicks > 0 ? 2 : 1) * (isPerfect ? 3 : 1) * ouroMult;
              setScore(prev => prev + pts); toast(`SPEEDY PURGED — ×2 SCORE 10 SEC`);
              floatFeedback(al.x, al.y - 10, `SPEEDY +${pts.toLocaleString()}`);
            } else if (al.type === 'sniper') {
              // Sniper — hard to hit, worth more, gives a charge
              synthRef.current?.playCharge();
              state.blasterCharges++; setBlasterCharges(state.blasterCharges);
              burst(al.x + al.width / 2, al.y + al.height / 2, '#00cfff', 25, 6);
              const pts = (800 + tier * 80) * Math.max(1, state.killCombo) * (isPerfect ? 3 : 1) * ouroMult;
              setScore(prev => prev + pts);
              floatFeedback(al.x, al.y - 10, `SNIPER DOWN +${pts.toLocaleString()}`);
              toast(`SNIPER ELIMINATED — +1 CHARGE`);
            } else if (al.type === 'tank') {
              // Tank — 3 hits, big points, brief calm
              burst(al.x + al.width / 2, al.y + al.height / 2, '#888888', 30, 6);
              burst(al.x + al.width / 2, al.y + al.height / 2, '#ff4e3e', 20, 4);
              state.calmTicks = Math.max(state.calmTicks, 60 * 3);
              const pts = (1200 + tier * 120) * Math.max(1, state.killCombo) * (isPerfect ? 3 : 1) * ouroMult;
              setScore(prev => prev + pts);
              floatFeedback(al.x, al.y - 10, `TANK DESTROYED +${pts.toLocaleString()}`);
            } else if (al.type === 'bomber') {
              burst(al.x + al.width / 2, al.y + al.height / 2, '#ff8800', 25, 5);
              const pts = (700 + tier * 70) * Math.max(1, state.killCombo) * (isPerfect ? 3 : 1) * ouroMult;
              setScore(prev => prev + pts);
              floatFeedback(al.x, al.y - 10, `BOMBER DOWN +${pts.toLocaleString()}`);
            } else if (al.type === 'prism') {
              // ---- PRISM PIÑATA — shatters into a crystal shower ----
              synthRef.current?.playGoldenKill();
              synthRef.current?.playFloatCrystal();
              state.screenFlash = 0.6; state.screenShake = 4;
              for (let ring = 0; ring < 7; ring++) setTimeout(() => burst(al.x + al.width / 2, al.y + al.height / 2, ['#ff0000','#ff8800','#ffff00','#00ff88','#4488ff','#cc44ff','#ffffff'][ring % 7], 40, 8 + ring * 2), ring * 50);

              const cx = al.x + al.width / 2, cy = al.y + al.height / 2;
              const drop = (props: Partial<Crystal>) => {
                state.crystals.push({ x: cx + (Math.random() - 0.5) * 340, y: Math.max(40, cy - 30 - Math.random() * 130), size: 26, collected: false, pulseOffset: Math.random() * Math.PI * 2, ...props });
              };

              // Always: a handful of regular crystals
              const regulars = 4 + Math.floor(diffTier / 2);
              for (let i = 0; i < regulars; i++) drop({ size: 24 });

              // 1% spawn is rare enough — it ALWAYS drops one of every rare type + a golden
              drop({ isTime: true }); drop({ isGhost: true }); drop({ isDoubleTap: true });
              drop({ isOvercharge: true }); drop({ isMirror: true }); drop({ isFloat: true });
              drop({ isGolden: true, size: 30 });
              toast('🌈 PRISMA DESTRUÍDO — CAÍRAM TODOS OS TIPOS DE CRISTAL!');

              const pts = (1000 + tier * 100) * Math.max(1, state.killCombo) * (isPerfect ? 3 : 1) * ouroMult;
              setScore(prev => prev + pts);
              floatFeedback(al.x, al.y - 20, `✦ PRISM +${pts.toLocaleString()}`);
            } else if (al.type === 'unicorn') {
              blessUnicorn(al.x + al.width / 2, al.y + al.height / 2);
            } else if (al.type === 'chariot') {
              // Fancy bonus racer: crazy points + score mult + charges + a stability top-up
              rewardChariot(al.x + al.width / 2, al.y + al.height / 2, Math.max(1, state.killCombo) * (isPerfect ? 3 : 1) * ouroMult, false);
            } else {
              burst(al.x + al.width / 2, al.y + al.height / 2, '#ffe65c', 22, 5);
              burst(al.x + al.width / 2, al.y + al.height / 2, '#ff4e3e', 14, 4);
              const scoreMult = state.killCombo >= 5 ? 3 : state.killCombo >= 3 ? 2 : 1;
              const scoreFinal = (state.scoreMultTicks > 0 ? 2 : 1) * (isPerfect ? 3 : 1) * ouroMult;
              const pts = (400 + tier * 50) * Math.max(1, state.killCombo) * scoreMult * scoreFinal;
              setScore(prev => prev + pts);
              floatFeedback(al.x, al.y - 10, isPerfect ? `PERFECT ×3 +${pts.toLocaleString()}` : state.killCombo > 1 ? `×${state.killCombo} +${pts.toLocaleString()}` : `PURGED +${pts}`);
            }

            // Combo milestones
            state.killCombo = Math.min(COMBO_CAP, state.killCombo + 1);
            state.comboTimer = 0;
            setComboCount(state.killCombo);
            synthRef.current?.playCombo(state.killCombo);
            if (hasPerk('aliens drop charges') && Math.random() > 0.4) { state.blasterCharges++; setBlasterCharges(state.blasterCharges); floatFeedback(al.x, al.y - 25, 'CARGA EXTRA!'); }

            // Ghost run — alien drops a crystal when killed during ghost run mode
            if (state.easterEggMode === 'ghost_run') {
              stateRef.current.crystals.push({ x: al.x, y: al.y, size: 24, collected: false, pulseOffset: 0 });
            }

            // BERSERKER tracking — kills only count toward the next berserker when you're
            // NOT already raging and the post-berserker cooldown has elapsed. This is what
            // stops a rapid-fire mash from chaining one berserker straight into the next.
            if (state.easterEggMode !== 'berserker' && state.berserkerCooldown === 0) state.berserkerKills++;
            if (state.berserkerKills >= 7 && state.easterEggMode !== 'berserker' && state.berserkerCooldown === 0) {
              state.easterEggMode = 'berserker';
              state.easterEggTicks = 60 * 8; // 5s → 8s
              setEasterEggMode('berserker');
              synthRef.current?.playBerserker();
              state.speedBoostTicks = 60 * 8; setSpeedBoosted(true);
              // Activation rewards: refill charges, force rapid fire, score spike
              state.blasterCharges += 5; setBlasterCharges(state.blasterCharges);
              if (state.weaponTier < 2) { state.weaponTier = 2; setWeaponTier(2); }
              const berserkBonus = 2000 + state.killCombo * 500;
              setScore(prev => prev + berserkBonus);
              state.screenFlash = 0.8; state.calmTicks = 0;
              burst(p.x + PW/2, p.y + PH/2, '#ff0000', 60, 10);
              toast(`🔥 BERSERKER — GODMODE 8 SEC + RAPID FIRE + 5 CHARGES — +${berserkBonus.toLocaleString()}`);
              state.berserkerKills = 0; state.berserkerTimer = 0;
            }

            if (al.type !== 'super') {
              if (state.killCombo === 2) {
                state.blasterCharges++; setBlasterCharges(state.blasterCharges);
                synthRef.current?.playCharge(); state.calmTicks = 60 * 4;
                toast('COMBO ×2 — CARGA GRÁTIS + CALMA'); burst(p.x + p.width / 2, p.y, '#ffe65c', 25, 6);
              } else if (state.killCombo === 3) {
                state.speedBoostTicks = 60 * 3; setSpeedBoosted(true);
                synthRef.current?.playSpeedBoost(); state.calmTicks = 60 * 6;
                if (state.weaponTier < 1) { state.weaponTier = 1; setWeaponTier(1); toast('COMBO ×3 — TIRO LARGO + INTOCÁVEL'); }
                else toast('COMBO ×3 — INTOCÁVEL + CALMA 6 SEG');
                burst(p.x + p.width / 2, p.y + p.height / 2, '#00cfff', 40, 8);
              } else if (state.killCombo === 5) {
                state.speedBoostTicks = 60 * 5; setSpeedBoosted(true);
                synthRef.current?.playSpeedBoost(); state.calmTicks = 60 * 10;
                if (state.weaponTier < 2) { state.weaponTier = 2; setWeaponTier(2); toast('COMBO ×5 — TIRO RÁPIDO + MODO DEUS'); }
                else toast('COMBO ×5 — MODO DEUS ×3 PONTOS + CALMA 10 SEG');
                burst(p.x + p.width / 2, p.y + p.height / 2, '#ffe65c', 50, 9);
                burst(p.x + p.width / 2, p.y + p.height / 2, '#ffffff', 20, 5);
              } else if (state.killCombo > 5 && state.killCombo % 2 === 0) {
                state.calmTicks = Math.max(state.calmTicks, 60 * 4);
                toast(`GODMODE ×${state.killCombo}  ×3 SCORE ACTIVE`);
              }
            }
          }
        }

        // Alien hits player
        if (al.alive && p.x < al.x + al.width && p.x + p.width > al.x && p.y < al.y + al.height && p.y + p.height > al.y) {
          // Unicorn & chariot — touching them is a CATCH (heal + reward), not a hit
          if (al.type === 'unicorn') { al.alive = false; blessUnicorn(al.x + al.width / 2, al.y + al.height / 2); return; }
          if (al.type === 'chariot') { al.alive = false; rewardChariot(al.x + al.width / 2, al.y + al.height / 2, Math.max(1, state.killCombo), true); return; }
          // Ghost mode — pass through, no damage
          if (state.ghostTicks > 0) { floatFeedback(al.x, al.y - 10, 'FANTASMA!'); return; }
          al.alive = false;
          if (al.type === 'super') state.superAlienSpawned = false;
          if (state.speedBoostTicks > 0) {
            burst(al.x + al.width / 2, al.y + al.height / 2, '#00cfff', 12, 4); floatFeedback(al.x, al.y - 10, 'INVENCÍVEL!');
          } else if (state.shieldActive && al.type !== 'sniper') {
            // Shield blocks everything EXCEPT sniper
            state.shieldActive = false; setHasShield(false);
            synthRef.current?.playShieldBreak();
            burst(p.x + p.width / 2, p.y + p.height / 2, '#00cfff', 30, 6);
            toast('O ESCUDO ABSORVEU O GOLPE'); floatFeedback(p.x, p.y - 20, 'BLOQUEIO!');
          } else {
            if (state.shieldActive && al.type === 'sniper') {
              // Sniper one-shots shield AND still damages
              state.shieldActive = false; setHasShield(false);
              synthRef.current?.playShieldBreak();
              toast('⚠ O SNIPER FUROU O TEU ESCUDO!');
            }
            const dmg = al.type === 'super' ? 35 : al.type === 'tank' ? 30 : al.type === 'sniper' ? 25 : 20;
            state.coreStability = Math.max(0, state.coreStability - dmg);
            state.screenShake = al.type === 'super' ? 6 : 3;
            state.screenFlash = al.type === 'super' ? 0.6 : 0.4;
            state.calmTicks = 0;
            synthRef.current?.playHurt();
            burst(p.x + p.width / 2, p.y + p.height / 2, '#ff4e3e', 18, 4);
            floatFeedback(p.x, p.y - 20, al.type === 'super' ? 'SUPER IMPACTO!' : al.type === 'sniper' ? 'TIRO DE SNIPER!' : al.type === 'tank' ? 'PANCADA DE TANQUE!' : 'IMPACTO!');
            if (!hasPerk('combo never resets')) { state.killCombo = 0; setComboCount(0); }
          }
        }
      });
      state.aliens = state.aliens.filter(al => al.x + al.width > -80 && al.alive);

      // ---- METEORS ----
      state.meteors.forEach(m => {
        m.x += m.vx; m.y += m.vy; m.rotation += 0.04;
        if (!m.alive) return;
        for (const pr of state.projectiles) {
          if (!pr.alive) continue;
          if (pr.x < m.x + m.size && pr.x + pr.width > m.x && pr.y < m.y + m.size && pr.y + pr.height > m.y) {
            pr.alive = false; m.alive = false;
            synthRef.current?.playExplosion();
            burst(m.x + m.size / 2, m.y + m.size / 2, '#ffffff', 16, 4);
            setScore(prev => prev + 200); floatFeedback(m.x, m.y, 'ABATIDO +200');
          }
        }
        if (m.alive && p.x < m.x + m.size && p.x + p.width > m.x && p.y < m.y + m.size && p.y + p.height > m.y) {
          m.alive = false;
          if (state.speedBoostTicks > 0) { burst(m.x + m.size / 2, m.y + m.size / 2, '#00cfff', 16, 5); floatFeedback(m.x, m.y, 'INVENCÍVEL!'); }
          else if (state.shieldActive) { state.shieldActive = false; setHasShield(false); synthRef.current?.playShieldBreak(); burst(p.x + p.width / 2, p.y + p.height / 2, '#00cfff', 30, 6); toast('O ESCUDO ABSORVEU O GOLPE'); }
          else { state.coreStability = Math.max(0, state.coreStability - 25); state.screenShake = 4; state.screenFlash = 0.45; synthRef.current?.playHurt(); burst(p.x + p.width / 2, p.y + p.height / 2, '#ffffff', 22, 5); floatFeedback(p.x, p.y - 20, 'METEOR BREACH'); if (!hasPerk('combo never resets')) { state.killCombo = 0; setComboCount(0); } }
        }
      });
      state.meteors = state.meteors.filter(m => m.alive && m.y < canvas.height + 80 && m.x + m.size > -80);

      // ---- CRYSTAL COLLECT ----
      state.crystals.forEach(c => {
        if (c.collected) return;
        if (p.x < c.x + c.size && p.x + p.width > c.x && p.y < c.y + c.size && p.y + p.height > c.y) {
          c.collected = true;

          // ---- AIR-CHAIN — grabbing a crystal mid-air gives your jump back ----
          // This is the staircase trick: snag a crystal and you can leap again instead of
          // hitting the gravity stamp on the 3rd press, so you climb step-by-step as long
          // as you keep nailing crystals. Pure timing skill, no permanent buff.
          if (!p.isGrounded) { p.jumpCount = Math.min(p.jumpCount, 1); p.stretch = 1.3; }

          // ---- APEX SUPER CRYSTAL — the reward for nailing the hardest staircase ----
          if (c.isApex) {
            synthRef.current?.playGoldenKill();
            synthRef.current?.playFloatCrystal();
            state.screenFlash = 0.6; state.screenShake = 4;
            for (let ring = 0; ring < 7; ring++) setTimeout(() => burst(c.x + c.size / 2, c.y + c.size / 2, ['#00ffd0','#44ddff','#ffffff','#ffd700'][ring % 4], 46, 9 + ring * 2), ring * 55);
            const apts = 10000 + diffTier * 1200;
            setScore(prev => prev + apts);
            state.scoreMultTicks = 60 * 12; setScoreMultActive(true);
            state.coreStability = Math.min(100, state.coreStability + 20); setStability(Math.floor(state.coreStability));
            state.blasterCharges += 2; setBlasterCharges(state.blasterCharges);
            toast(`🏆 APEX CRYSTAL — TRICK SHOT MASTER +${apts.toLocaleString()} + ×2 SCORE`);
            floatFeedback(c.x, c.y - 22, `🏆 +${apts.toLocaleString()}`);
            return;
          }

          if (c.isHazard) {
            state.hazardSpeedTicks = 60 * 20;
            synthRef.current?.playHazard();
            state.screenFlash = 0.4; state.screenShake = 3;
            burst(c.x + c.size / 2, c.y + c.size / 2, '#ff4400', 30, 6);
            const hpts = 300 + diffTier * 50;
            setScore(prev => prev + hpts);
            toast(`☠ HAZARD CRYSTAL — WORLD SPEED +40% FOR 20 SEC`);
            floatFeedback(c.x, c.y - 15, `HAZARD +${hpts}`);
            return;
          }

          // ---- TIME CRYSTAL — slow-mo ----
          if (c.isTime) {
            state.timeSlowTicks = 60 * 8;
            setTimeSlow(true);
            synthRef.current?.playTimeCrystal();
            burst(c.x + c.size / 2, c.y + c.size / 2, '#4488ff', 40, 7);
            toast('⏱ CRISTAL DO TEMPO — MUNDO LENTO 8 SEG');
            floatFeedback(c.x, c.y - 15, 'DOBRA TEMPORAL!');
            return;
          }

          // ---- GHOST CRYSTAL — pass-through ----
          if (c.isGhost) {
            state.ghostTicks = 60 * 5;
            setGhostMode(true);
            synthRef.current?.playGhostCrystal();
            burst(c.x + c.size / 2, c.y + c.size / 2, '#ffffff', 40, 7);
            state.calmTicks = Math.max(state.calmTicks, 60 * 5);
            toast('👻 CRISTAL FANTASMA — INTOCÁVEL + INVISÍVEL 5 SEG');
            floatFeedback(c.x, c.y - 15, 'MODO FANTASMA!');
            return;
          }

          // ---- DOUBLE TAP — next shot fires twice ----
          if (c.isDoubleTap) {
            state.doubleTapReady = true;
            burst(c.x + c.size / 2, c.y + c.size / 2, '#ff8800', 35, 6);
            toast('⚡ TOQUE DUPLO — O PRÓXIMO TIRO DISPARA DUAS VEZES');
            floatFeedback(c.x, c.y - 15, 'TOQUE DUPLO!');
            return;
          }

          // ---- OVERCHARGE — instant full charge ----
          if (c.isOvercharge) {
            state.overchargeReady = true;
            burst(c.x + c.size / 2, c.y + c.size / 2, '#ffff00', 35, 6);
            state.screenFlash = 0.25;
            toast('⚡ SOBRECARGA — PRÓXIMO TIRO NO MÁXIMO');
            floatFeedback(c.x, c.y - 15, 'SOBRECARGA!');
            return;
          }

          // ---- MIRROR CRYSTAL — aliens reverse ----
          if (c.isMirror) {
            state.mirrorTicks = 60 * 6;
            setMirrorMode(true);
            synthRef.current?.playMirrorCrystal();
            // Reverse all alive aliens
            state.aliens.forEach(al => { al.vx = Math.abs(al.vx) * 0.7; });
            burst(c.x + c.size / 2, c.y + c.size / 2, '#aaaaff', 40, 7);
            toast('🪞 CRISTAL ESPELHO — ALIENS INVERTIDOS 6 SEG');
            floatFeedback(c.x, c.y - 15, 'ESPELHO!');
            return;
          }

          // ---- FLOAT CRYSTAL — infinite jumps (ultra rare) ----
          if (c.isFloat) {
            state.floatTicks = 60 * 17;
            state.ouroModeAirCrystals = 0;
            setFloatMode(true);
            synthRef.current?.playFloatCrystal();
            burst(c.x + c.size / 2, c.y + c.size / 2, '#ff44ff', 50, 8);
            burst(c.x + c.size / 2, c.y + c.size / 2, '#ffffff', 25, 5);
            state.screenFlash = 0.3; state.calmTicks = Math.max(state.calmTicks, 60 * 15);
            toast('✨ CRISTAL FLUTUAR — SALTOS INFINITOS 17 SEG // APANHA 7 NO AR PARA O MODO OURO');
            floatFeedback(c.x, c.y - 15, 'FLUTUAR!');
            return;
          }

          // ---- PURPLE UNICORN — top/bottom fetch windfall ----
          if (c.isPurpleUnicorn) {
            synthRef.current?.playGoldenKill();
            synthRef.current?.playFloatCrystal();
            state.screenFlash = 0.5; state.screenShake = 3;
            for (let ring = 0; ring < 6; ring++) setTimeout(() => burst(c.x + c.size / 2, c.y + c.size / 2, ['#cc44ff','#ff44ff','#ffffff','#ffd700'][ring % 4], 42, 8 + ring * 2), ring * 60);
            const upts = 6000 + diffTier * 600;
            setScore(prev => prev + upts);
            state.scoreMultTicks = 60 * 15; setScoreMultActive(true);
            state.coreStability = Math.min(100, state.coreStability + 25);
            setStability(Math.floor(state.coreStability));
            state.blasterCharges += 2; setBlasterCharges(state.blasterCharges);
            state.calmTicks = Math.max(state.calmTicks, 60 * 6);
            toast(`🦄 PURPLE UNICORN — +${upts.toLocaleString()} + ×2 SCORE 15 SEC + HEAL`);
            floatFeedback(c.x, c.y - 18, `🦄 +${upts.toLocaleString()}`);
            return;
          }

          if (c.isGolden) {
            // GOLDEN ALIEN DROP — big points + random bonus
            synthRef.current?.playGoldenKill();
            for (let ring = 0; ring < 5; ring++) setTimeout(() => burst(c.x + c.size / 2, c.y + c.size / 2, ['#ffd700','#ffe65c','#ffffff'][ring % 3], 35, 7 + ring * 2), ring * 60);
            const gpts = 5000 + diffTier * 500;
            setScore(prev => prev + gpts);
            const bonuses = ['charge', 'invincible', 'scoremult'];
            const bonus = bonuses[Math.floor(Math.random() * bonuses.length)];
            if (bonus === 'charge') { state.blasterCharges += 2; setBlasterCharges(state.blasterCharges); toast(`✦ GOLDEN +${gpts.toLocaleString()} + 2 CHARGES`); }
            else if (bonus === 'invincible') { state.speedBoostTicks = 60 * 5; setSpeedBoosted(true); toast(`✦ GOLDEN +${gpts.toLocaleString()} + INVINCIBLE 5 SEC`); }
            else { state.scoreMultTicks = 60 * 15; setScoreMultActive(true); toast(`✦ GOLDEN +${gpts.toLocaleString()} + ×2 SCORE 15 SEC`); }
            floatFeedback(c.x, c.y - 15, `✦ +${gpts.toLocaleString()}`);
            return;
          }

          if (c.isTripleJump) {
            state.tripleJumpTicks = 60 * 15; setTripleJumpActive(true);
            synthRef.current?.playTripleJump();
            burst(c.x + c.size / 2, c.y + c.size / 2, '#cc44ff', 40, 7);
            toast('SALTO TRIPLO — 15 SEG'); floatFeedback(c.x, c.y - 15, 'SALTO TRIPLO!');
          } else if (c.isMagnet) {
            state.magnetTicks = 60 * 8; setMagnetActive(true);
            synthRef.current?.playMagnet();
            burst(c.x + c.size / 2, c.y + c.size / 2, '#ff44aa', 40, 7);
            toast('ÍMAN DE CRISTAIS — 8 SEG'); floatFeedback(c.x, c.y - 15, 'ÍMAN!');
          } else if (c.isShield) {
            state.shieldActive = true; setHasShield(true);
            synthRef.current?.playShield();
            burst(c.x + c.size / 2, c.y + c.size / 2, '#00cfff', 40, 7);
            toast('🛡 ESCUDO ATIVO — PRÓXIMO GOLPE BLOQUEADO'); floatFeedback(c.x, c.y - 15, 'ESCUDO!');
          } else {
            // REGULAR CRYSTAL
            state.crystalsTotal++;
            state.crystalsSinceCharge++;
            state.crystalsSinceShield++;
            state.crystalsSinceTriple++;
            state.crystalsSincePerks++;
            state.crystalsSinceBoss++;
            setCrystalCount(state.crystalsTotal);
            state.coreStability = Math.min(100, state.coreStability + Math.max(6, 14 - endurance * 1.5));

            // Crystal chain
            state.crystalChain++;
            state.crystalChainTimer = 0;
            setCrystalChain(state.crystalChain);
            const chainMult = Math.min(5, 1 + (state.crystalChain - 1) * 0.5);
            const basePts = (100 + tier * 20) * Math.max(1, Math.floor(state.killCombo * 0.5));
            const pts = Math.floor(basePts * chainMult);
            setScore(prev => prev + pts);

            burst(c.x + c.size / 2, c.y + c.size / 2, '#ffe65c', 24, 4.5);
            synthRef.current?.playCrystal();
            if (state.crystalChain >= 2) { synthRef.current?.playChainTick(); }
            synthRef.current?.setIntensity(state.crystalsTotal);

            if (state.crystalChain >= 3) floatFeedback(c.x, c.y - 15, `CHAIN ×${state.crystalChain} +${pts}`);
            else floatFeedback(c.x, c.y - 15, `+${pts}`);

            if (state.crystalChain === 5) {
              toast('CADEIA DE CRISTAIS ×5 — CARGA BÓNUS');
              state.blasterCharges++; setBlasterCharges(state.blasterCharges);
              burst(c.x + c.size / 2, c.y + c.size / 2, '#ffffff', 35, 7);
            }

            // OURO MODE tracking — count airborne crystals during float
            if (state.floatTicks > 0 && !p.isGrounded) {
              state.ouroModeAirCrystals++;
              if (state.ouroModeAirCrystals >= 11 && state.easterEggMode !== 'ouro') {
                state.easterEggMode = 'ouro';
                state.easterEggTicks = 60 * 20;
                setEasterEggMode('ouro');
                synthRef.current?.playOuroMode();
                state.calmTicks = 60 * 20;
                state.screenFlash = 1.0;
                // OURO: extend float for full duration + magnet + score mult
                state.floatTicks = 60 * 20; setFloatMode(true);
                state.magnetTicks = 60 * 20; setMagnetActive(true);
                state.scoreMultTicks = 60 * 20; setScoreMultActive(true);
                for (let ring = 0; ring < 10; ring++) setTimeout(() => burst(p.x + PW/2, p.y + PH/2, ['#ffd700','#ffe65c','#ffffff','#ff44ff'][ring%4], 50, 10+ring), ring * 80);
                toast('✨ MODO OURO — SALTOS INFINITOS + ÍMAN + ×5×2 PONTOS 20 SEG ✨');
              }
            }
            if (state.crystalsSinceCharge >= (hasPerk('blaster fast') ? 3 : 5)) {
              state.crystalsSinceCharge = 0;
              state.blasterCharges++; setBlasterCharges(state.blasterCharges);
              synthRef.current?.playCharge();
              toast(`BLASTER CHARGED ×${state.blasterCharges} — HOLD SPACE`);
              burst(c.x + c.size / 2, c.y + c.size / 2, '#ffffff', 30, 6);
            }

            // 2% golden alien spawn
            if (Math.random() < 0.02 && state.goldenCooldown === 0) {
              state.goldenCooldown = 300;
              setTimeout(() => {
                const s = stateRef.current;
                const spawnX = canvas.width + 80;
                // Place at a comfortable mid-screen height — always reachable
                const spawnY = canvas.height * 0.35 + (Math.random() - 0.5) * canvas.height * 0.2;
                s.crystals.push({ x: spawnX, y: spawnY, size: 30, collected: false, pulseOffset: Math.random() * Math.PI * 2, isGolden: true });
                toast('✦ CRISTAL DOURADO A CHEGAR — ALTO VALOR');
              }, 800);
            }
          }
        }
      });

      // Enemy spawning
      const alienInterval = Math.max(45, 180 - diffTier * 9 - Math.floor(endurance) * 7);
      if (state.gameTicks % alienInterval === 0 && !state.boss) spawnAlien(diffTier);
      const meteorInterval = Math.max(70, 250 - diffTier * 12 - Math.floor(endurance) * 9);
      if (state.gameTicks % meteorInterval === 0) spawnMeteor(diffTier);

      // ---- HAZARD WAVES — escalating debris storms re-introduce late-game pressure ----
      if (state.crystalsTotal >= 15 && state.gameTicks >= state.nextHazardWaveAt && !state.boss) {
        const gap = Math.max(540, 1500 - Math.floor(endurance) * 110);  // storms get more frequent over time
        state.nextHazardWaveAt = state.gameTicks + gap;
        const debris = 3 + Math.floor(endurance);
        for (let i = 0; i < debris; i++) setTimeout(() => { if (isPlaying) spawnMeteor(diffTier); }, i * 160);
        // Sniper escort — pierces shields, so it bites even when you're cozy
        const snipers = 1 + Math.floor(endurance / 3);
        for (let s = 0; s < snipers; s++) {
          state.alienIdInc++;
          state.aliens.push({ id: state.alienIdInc, x: canvas.width + 60 + s * 90, y: Math.max(40, Math.min(canvas.height - 80, p.y + (Math.random() - 0.5) * 140)), width: 20, height: 20, vx: -(7 + diffTier * 0.5), animFrame: 0, alive: true, type: 'sniper', health: 1, zigzagPhase: 0, bomberDropped: false });
        }
        synthRef.current?.playWeather();
        toast(`☄ DEBRIS STORM — ${debris} METEORS + ${snipers} SNIPER${snipers > 1 ? 'S' : ''} INBOUND`);
      }

      // Boss wave every 40 crystals
      if (state.crystalsSinceBoss >= 40 && !state.boss && state.crystalsTotal >= 40) {
        state.crystalsSinceBoss = 0;
        const BOSS_NAMES = ['ENTROPIA PRIME', 'ARQUITETO DO VAZIO', 'QUEBRA-NÚCLEO', 'FANTASMA DE SINAL', 'PROTOCOLO ZERO', 'DAEMON NULO', 'FENDA ÓMEGA'];
        const bname = BOSS_NAMES[state.bossCount % BOSS_NAMES.length];
        const bossHp    = 3 + state.bossCount;               // boss 1=3hp, 2=4hp, 3=5hp...
        const bossSpeed = -(2.8 + state.bossCount * 0.3);    // gets faster each time
        const pattern   = Math.min(state.bossCount, 3);      // 0=track,1=charge,2=shoot,3=mix
        state.boss = { x: canvas.width + 80, y: canvas.height / 2 - 50, width: 80, height: 80, health: bossHp, maxHealth: bossHp, vx: bossSpeed, phase: 0, animFrame: 0, alive: true, name: bname, pattern, chargeVy: 0, shootCooldown: 80 };
        state.bossProjectiles = [];
        synthRef.current?.playBossIntro();
        const patternLabel = pattern === 0 ? 'PERSEGUIR' : pattern === 1 ? 'INVESTIDA' : pattern === 2 ? 'DISPARO' : 'TUDO';
        toast(`⚠ CHEFE #${state.bossCount + 1} — ${bname} [${patternLabel}] ${bossHp}HP`);
        state.aliens = [];
      }

      // Boss update — pattern-based
      if (state.boss) {
        const b = state.boss;
        b.x += b.vx; b.animFrame++; b.phase += 0.025;
        b.shootCooldown--;

        // Pattern 0: tracking (original)
        if (b.pattern === 0 || (b.pattern === 3 && Math.floor(b.animFrame / 120) % 3 === 0)) {
          const bTargetY = p.y + PH / 2 - b.height / 2;
          b.y += (bTargetY - b.y) * 0.02 + Math.sin(b.phase) * 2;
          b.y = Math.max(30, Math.min(canvas.height - b.height - 30, b.y));
        }
        // Pattern 1: horizontal charge — lunges at player Y then resets
        else if (b.pattern === 1 || (b.pattern === 3 && Math.floor(b.animFrame / 120) % 3 === 1)) {
          if (b.animFrame % 90 === 0) {
            // Lock onto player Y and charge fast
            b.chargeVy = (p.y + PH / 2 - b.height / 2 - b.y) * 0.12;
          }
          b.y += b.chargeVy; b.chargeVy *= 0.85;
          b.y = Math.max(30, Math.min(canvas.height - b.height - 30, b.y));
        }
        // Pattern 2: shoots 3-spread projectiles
        else if (b.pattern === 2 || (b.pattern === 3 && Math.floor(b.animFrame / 120) % 3 === 2)) {
          const bTargetY = p.y + PH / 2 - b.height / 2;
          b.y += (bTargetY - b.y) * 0.015;
          b.y = Math.max(30, Math.min(canvas.height - b.height - 30, b.y));
          if (b.shootCooldown <= 0 && b.x < canvas.width - 80) {
            b.shootCooldown = Math.max(40, 80 - state.bossCount * 8);
            const dx = p.x - b.x; const dy = (p.y + PH / 2) - (b.y + b.height / 2);
            const dist = Math.hypot(dx, dy);
            // 3-spread
            for (let spread = -1; spread <= 1; spread++) {
              const angle = Math.atan2(dy, dx) + spread * 0.35;
              state.bossProjectiles.push({ x: b.x, y: b.y + b.height / 2, vx: Math.cos(angle) * 6, vy: Math.sin(angle) * 6, alive: true });
            }
          }
        }

        // Boss projectile movement + player collision
        state.bossProjectiles.forEach(bp => {
          bp.x += bp.vx; bp.y += bp.vy;
          if (!bp.alive) return;
          if (p.x < bp.x + 10 && p.x + PW > bp.x && p.y < bp.y + 10 && p.y + PH > bp.y) {
            bp.alive = false;
            if (state.speedBoostTicks > 0) { floatFeedback(bp.x, bp.y, 'INVENCÍVEL!'); }
            else if (state.shieldActive) { state.shieldActive = false; setHasShield(false); synthRef.current?.playShieldBreak(); toast('O ESCUDO BLOQUEOU O TIRO DO CHEFE'); }
            else { state.coreStability = Math.max(0, state.coreStability - 14); state.screenFlash = 0.3; state.screenShake = 2; synthRef.current?.playHurt(); if (!hasPerk('combo never resets')) { state.killCombo = 0; setComboCount(0); } floatFeedback(p.x, p.y - 20, 'TIRO DO CHEFE!'); }
          }
        });
        state.bossProjectiles = state.bossProjectiles.filter(bp => bp.alive && bp.x > -20 && bp.x < canvas.width + 20 && bp.y > -20 && bp.y < canvas.height + 20);

        // Player blasts hit boss
        for (const pr of state.projectiles) {
          if (!pr.alive || !b.alive) continue;
          if (pr.x < b.x + b.width && pr.x + pr.width > b.x && pr.y < b.y + b.height && pr.y + pr.height > b.y) {
            pr.alive = false; b.health--;
            synthRef.current?.playBossHit();
            burst(b.x + b.width / 2, b.y + b.height / 2, '#ff4e3e', 20, 5);
            floatFeedback(b.x, b.y - 10, b.health > 0 ? `CHEFE ATINGIDO! RESTAM ${b.health}` : 'GOLPE FINAL!');
            if (b.health <= 0) {
              b.alive = false; state.boss = null; state.bossProjectiles = [];
              synthRef.current?.playBossKill();
              state.bossCount++;
              state.blasterCharges += 2; setBlasterCharges(state.blasterCharges);
              state.speedBoostTicks = 60 * 6; setSpeedBoosted(true);
              state.coreStability = Math.min(100, state.coreStability + 40);
              state.calmTicks = 60 * 10;
              state.bossSpeedReliefTicks = 600;
              state.crystalsSinceBoss = 0;
              if (state.weaponTier >= 2 && !state.novaUnlocked) { state.novaUnlocked = true; setNovaReady(true); }
              if (state.weaponTier < 3) { state.weaponTier = Math.min(3, state.weaponTier + 1); setWeaponTier(state.weaponTier); }
              const bpts = (3000 + diffTier * 300 + state.bossCount * 500) * Math.max(1, state.killCombo);
              setScore(prev => prev + bpts);
              state.screenFlash = 0.9;
              for (let ring = 0; ring < 8; ring++) setTimeout(() => burst(b.x + b.width / 2, b.y + b.height / 2, ['#ff4e3e','#ffe65c','#ffffff','#cc44ff','#00cfff'][ring % 5], 35, 8 + ring * 2), ring * 60);
              toast(`CHEFE #${state.bossCount} OBLITERADO — +${bpts.toLocaleString()} // PRÓXIMO CHEFE: ${state.bossCount + 1}HP, MAIS RÁPIDO`);
            }
          }
        }

        // Boss body collision
        if (b.alive && p.x < b.x + b.width && p.x + PW > b.x && p.y < b.y + b.height && p.y + PH > b.y) {
          if (state.speedBoostTicks > 0) { floatFeedback(p.x, p.y - 20, 'INVENCÍVEL!'); }
          else if (state.shieldActive) { state.shieldActive = false; setHasShield(false); synthRef.current?.playShieldBreak(); burst(p.x + PW / 2, p.y + PH / 2, '#00cfff', 25, 6); toast('O ESCUDO BLOQUEOU A COLISÃO COM O CHEFE'); }
          else { state.coreStability = Math.max(0, state.coreStability - 28); state.screenShake = 5; state.screenFlash = 0.5; state.calmTicks = 0; synthRef.current?.playHurt(); if (!hasPerk('combo never resets')) { state.killCombo = 0; setComboCount(0); } burst(p.x + PW / 2, p.y + PH / 2, '#ff4e3e', 25, 5); floatFeedback(p.x, p.y - 20, 'COLISÃO COM O CHEFE!'); }
        }
        if (b.x + b.width < -100) { state.boss = null; state.bossProjectiles = []; }
      }

      // Perk draft every 20 crystals
      if (state.crystalsSincePerks >= 20 && !state.perkDraftPending && state.crystalsTotal >= 20) {
        state.crystalsSincePerks = 0;
        const ALL_PERKS = ['drain halved', 'blaster fast', 'aliens drop charges', 'combo never resets', 'crystal magnet always'];
        const available = ALL_PERKS.filter(perk => !state.perks.includes(perk));
        if (available.length >= 2) {
          const shuffled = available.sort(() => Math.random() - 0.5).slice(0, 3);
          state.perkOptions = shuffled; state.perkDraftPending = true;
          setPerkDraft(shuffled); synthRef.current?.playPerkDraft();
        }
      }

      // Streak bonus every 10 sec
      if (state.gameTicks % 600 === 0 && state.gameTicks > 0) {
        const streakBonus = state.streakTicks * 50 * Math.max(1, state.killCombo);
        setScore(prev => prev + streakBonus);
        floatFeedback(p.x, p.y - 30, `SOBREVIVÊNCIA +${streakBonus}`);
      }

      // Platform + crystal generation
      state.platforms = state.platforms.filter(pl => pl.x + pl.width > -120);
      state.crystals  = state.crystals.filter(c => c.x > -50);
      if (state.platforms.length < 6) {
        const last = state.platforms[state.platforms.length - 1];
        let style: 'solid' | 'pillar' | 'glitch' = 'solid';
        if (diffTier >= 3) style = Math.random() > 0.55 ? 'pillar' : 'solid';
        if (diffTier >= 7) style = Math.random() > 0.45 ? 'glitch' : 'pillar';
        const w   = Math.random() * 100 + 280;
        const gap = Math.min(160, 80 + diffTier * 7 + Math.random() * 40);
        const nx  = last.x + last.width + gap;
        const dir = Math.random() > 0.5 ? 1 : -1;
        const vs  = Math.min(80, 25 + diffTier * 6);
        const ny  = Math.max(canvas.height - 420, Math.min(canvas.height - 180, last.baseY + Math.random() * vs * dir));
        state.platforms.push({ x: nx, y: ny, baseY: ny, width: w, height: 600, styleType: style, waveOffset: 0 });
        // Crystals are sparse. Most platforms get nothing; ~22% get a single low crystal.
        // Every so often a CRYSTAL STAIRCASE appears instead — a diagonal run climbing up
        // and to the right. Grab the first and you can chain jumps step-by-step to the top:
        // a pure timing trick that rewards skill with a string of crystals (no permanent buff).
        // Crystals are deliberately sparse so a MAGNET pickup never vacuums the whole
        // screen. Most platforms get nothing; only ~10% drop a single low crystal. The real
        // crystal source is the STAIRCASE set-piece, spaced well apart.
        state.platformsSinceStair++;
        if (state.platformsSinceStair >= 8 && Math.random() < 0.45) {
          state.platformsSinceStair = 0;
          // ---- CRYSTAL STAIRCASE — the trick-shot set piece, harder the deeper you get ----
          // Air-chaining (each grab refunds a jump) is what climbs it. Higher diffTier =>
          // more steps, taller vertical gaps, and wider/more-varied horizontal spacing.
          const steps = 3 + Math.floor(diffTier / 3) + Math.floor(Math.random() * 2);  // 3 → ~7
          const vStep = 50 + diffTier * 4;          // 50 → 90px climbs (near the air-chain limit)
          const baseY = ny - 120 - diffTier * 6;    // whole staircase starts higher over time
          let sx = nx + 40, topY = baseY;
          for (let i = 0; i < steps; i++) {
            const sy = Math.max(46, baseY - i * vStep - Math.random() * 24);
            state.crystals.push({ x: sx, y: sy, size: 24, collected: false, pulseOffset: Math.random() * Math.PI * 2 });
            topY = Math.min(topY, sy);
            sx += 95 + diffTier * 6 + Math.random() * 55;   // wider, more varied gaps as you go
          }
          // ---- APEX SUPER CRYSTAL — only on the hardest staircases, a brutal trick shot ----
          // Sits a near-max jump above the final step: you must grab the last rung (for the
          // jump refund) then immediately nail a perfect leap. Huge payoff if you land it.
          if (diffTier >= 6 && Math.random() < 0.3) {
            state.crystals.push({ x: sx - 20, y: Math.max(30, topY - 92), size: 34, collected: false, pulseOffset: Math.random() * Math.PI * 2, isApex: true });
          }
        } else if (Math.random() < 0.10) {
          state.crystals.push({ x: nx + w / 2 - 12, y: ny - 50 - Math.random() * 35, size: 24, collected: false, pulseOffset: Math.random() * Math.PI * 2 });
        }
        if (state.crystalsSinceShield >= 12 && Math.random() > 0.5) { state.crystalsSinceShield = 0; state.crystals.push({ x: nx + w / 2 + 40, y: ny - 80 - Math.random() * 30, size: 28, collected: false, pulseOffset: Math.random() * Math.PI * 2, isShield: true }); }
        if (state.crystalsSinceTriple >= 18 && Math.random() > 0.6) { state.crystalsSinceTriple = 0; state.crystals.push({ x: nx + w / 2 - 50, y: ny - 90 - Math.random() * 30, size: 28, collected: false, pulseOffset: Math.random() * Math.PI * 2, isTripleJump: true }); }
        state.crystalsSinceMagnet++;
        if (state.crystalsSinceMagnet >= 15 && Math.random() > 0.55) { state.crystalsSinceMagnet = 0; state.crystals.push({ x: nx + w / 2 + 20, y: ny - 70 - Math.random() * 30, size: 26, collected: false, pulseOffset: Math.random() * Math.PI * 2, isMagnet: true }); }
        // Hazard crystal
        state.crystalsSinceHazard++;
        if (state.crystalsSinceHazard >= 20 && Math.random() > 0.6 && state.crystalsTotal >= 15) {
          state.crystalsSinceHazard = 0;
          state.crystals.push({ x: nx + w / 2 - 30, y: ny - 55 - Math.random() * 25, size: 26, collected: false, pulseOffset: Math.random() * Math.PI * 2, isHazard: true });
        }
        // New rare perk crystals — one per pool roll, every ~25 crystals
        state.crystalsSinceRarePerk++;
        if (state.crystalsSinceRarePerk >= 21) {
          state.crystalsSinceRarePerk = 0;
          const rarePerkRoll = Math.random();
          const midY = ny - 80 - Math.random() * 30;
          if      (rarePerkRoll < 0.2)  state.crystals.push({ x: nx + w / 2 + 60, y: midY, size: 26, collected: false, pulseOffset: Math.random()*Math.PI*2, isTime: true });
          else if (rarePerkRoll < 0.4)  state.crystals.push({ x: nx + w / 2 + 60, y: midY, size: 26, collected: false, pulseOffset: Math.random()*Math.PI*2, isGhost: true });
          else if (rarePerkRoll < 0.6)  state.crystals.push({ x: nx + w / 2 + 60, y: midY, size: 26, collected: false, pulseOffset: Math.random()*Math.PI*2, isDoubleTap: true });
          else if (rarePerkRoll < 0.78) state.crystals.push({ x: nx + w / 2 + 60, y: midY, size: 26, collected: false, pulseOffset: Math.random()*Math.PI*2, isOvercharge: true });
          else if (rarePerkRoll < 0.87) state.crystals.push({ x: nx + w / 2 + 60, y: midY, size: 26, collected: false, pulseOffset: Math.random()*Math.PI*2, isMirror: true });
          else {
            state.crystals.push({ x: nx + w / 2 + 60, y: midY, size: 30, collected: false, pulseOffset: Math.random()*Math.PI*2, isFloat: true }); // ~13% of rare slots
            // 30% of the time a float crystal also summons a PURPLE UNICORN at the very top
            // or bottom of the arena — ride the float's infinite jumps to fetch it for a windfall.
            if (Math.random() < 0.30) {
              const edgeY = Math.random() < 0.5 ? 24 : canvas.height - 96;
              state.crystals.push({ x: nx + w / 2 + 120, y: edgeY, size: 46, collected: false, pulseOffset: Math.random()*Math.PI*2, isPurpleUnicorn: true });
            }
          }
        }
      }

      state.particles.forEach(pt => { pt.x += pt.vx; pt.y += pt.vy; pt.life--; pt.alpha = Math.max(0, pt.life / 20); });
      state.particles = state.particles.filter(pt => pt.life > 0);
      state.floatTexts.forEach(t => { t.y += t.vy; t.life--; t.alpha = Math.max(0, t.life / 45); });
      state.floatTexts = state.floatTexts.filter(t => t.life > 0);

      // Hard cap on stored blaster charges — clamped once per tick after every source has
      // added, so no hoarding a stockpile to mash-fire through the late game. Egg modes (temporary) stack higher.
      const chargeCap = state.easterEggMode ? 12 : MAX_BLASTER_CHARGES;
      if (state.blasterCharges > chargeCap) { state.blasterCharges = chargeCap; setBlasterCharges(chargeCap); }
    };

    // ---- DRAW ----
    const draw = () => {
      const sd = stateRef.current;
      const tier      = Math.min(14, Math.floor(sd.crystalsTotal / 5));
      const isCalm    = sd.calmTicks > 0;
      const calmStr   = isCalm ? Math.min(1, sd.calmTicks / 120) : 0;

      let pc = '#ff4e3e', sc = '#ffe65c', bg = '#000000', glitch = false;
      if (tier >= 4 && tier < 7)   { pc = '#ffe65c'; sc = '#ff4e3e'; }
      else if (tier >= 7 && tier < 11) { pc = '#ffffff'; sc = '#ff4e3e'; bg = '#090000'; }
      else if (tier >= 11) {
        if (isCalm) { pc = '#ff4e3e'; sc = '#ffe65c'; bg = '#000000'; }
        else { glitch = true; pc = sd.gameTicks%8<4?'#ff4e3e':'#ffe65c'; sc = sd.gameTicks%4<2?'#ffffff':'#000000'; bg = '#000000'; }
      }

      ctx.save();
      if (sd.screenShake > 0 && !isCalm) ctx.translate((Math.random()-0.5)*sd.screenShake*4, (Math.random()-0.5)*sd.screenShake*4);
      ctx.fillStyle = bg; ctx.fillRect(0, 0, canvas.width, canvas.height);
      if (sd.screenFlash > 0 && !isCalm) { ctx.fillStyle = `rgba(255,78,62,${sd.screenFlash*0.15})`; ctx.fillRect(0, 0, canvas.width, canvas.height); }
      if (isCalm && calmStr > 0.1) { ctx.fillStyle = `rgba(0,180,255,${calmStr*0.04})`; ctx.fillRect(0, 0, canvas.width, canvas.height); }

      // ---- EASTER EGG MODE OVERLAYS ----
      if (sd.easterEggMode === 'ouro') {
        // Gold shimmer overlay
        ctx.fillStyle = `rgba(255,215,0,${0.06 + Math.sin(sd.gameTicks*0.08)*0.03})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        // Gold border pulse
        const gp = 0.5 + Math.sin(sd.gameTicks*0.12)*0.4;
        ctx.save(); ctx.strokeStyle=`rgba(255,215,0,${gp})`; ctx.lineWidth=16; ctx.strokeRect(0,0,canvas.width,canvas.height); ctx.restore();
      }
      if (sd.easterEggMode === 'ghost_run') {
        // Inverted tint
        ctx.fillStyle = `rgba(255,255,255,${0.04 + Math.sin(sd.gameTicks*0.06)*0.02})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.save(); ctx.strokeStyle='rgba(255,255,255,0.3)'; ctx.lineWidth=8; ctx.strokeRect(0,0,canvas.width,canvas.height); ctx.restore();
      }
      if (sd.easterEggMode === 'berserker') {
        // Red rage overlay
        ctx.fillStyle = `rgba(255,0,0,${0.07 + Math.sin(sd.gameTicks*0.2)*0.04})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.save(); ctx.strokeStyle=`rgba(255,0,0,${0.6+Math.sin(sd.gameTicks*0.15)*0.3})`; ctx.lineWidth=20; ctx.strokeRect(0,0,canvas.width,canvas.height); ctx.restore();
      }
      if (sd.timeSlowTicks > 0) {
        // Subtle blue frost
        ctx.fillStyle = `rgba(60,100,255,${0.04 * Math.min(1,sd.timeSlowTicks/60)})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      // ---- WEATHER OVERLAYS ----
      if (sd.weatherTicks > 0) {
        const fade = Math.min(1, sd.weatherTicks / 60);
        if (sd.weatherType === 'blackout') {
          ctx.fillStyle = `rgba(0,0,0,${0.82 * fade})`; ctx.fillRect(0, 0, canvas.width, canvas.height);
          // Player halo visible through blackout
          const hg = ctx.createRadialGradient(sd.player.x+PW/2, sd.player.y+PH/2, 10, sd.player.x+PW/2, sd.player.y+PH/2, 140);
          hg.addColorStop(0, 'rgba(255,230,92,0.2)'); hg.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = hg; ctx.fillRect(0, 0, canvas.width, canvas.height);
        } else if (sd.weatherType === 'storm') {
          ctx.fillStyle = `rgba(60,60,90,${0.25 * fade})`; ctx.fillRect(0, 0, canvas.width, canvas.height);
          for (let i = 0; i < 50; i++) { ctx.fillStyle = `rgba(255,255,255,${Math.random()*0.45*fade})`; ctx.fillRect(Math.random()*canvas.width, Math.random()*canvas.height, Math.random()*3+1, Math.random()*3+1); }
        } else if (sd.weatherType === 'flare') {
          const age = 1 - sd.weatherTicks / (60*10);
          ctx.fillStyle = age < 0.1 ? `rgba(255,255,255,${(0.1-age)/0.1*0.7})` : `rgba(180,20,0,${0.18*fade})`;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
      }

      // Screen border glow
      if (sd.coreStability < 25) {
        const pulse = 0.5 + Math.sin(sd.gameTicks * 0.15) * 0.4;
        ctx.save(); ctx.strokeStyle = `rgba(255,0,0,${pulse*0.9})`; ctx.lineWidth = 12; ctx.strokeRect(0,0,canvas.width,canvas.height);
        ctx.strokeStyle = `rgba(255,100,0,${pulse*0.5})`; ctx.lineWidth = 24; ctx.strokeRect(0,0,canvas.width,canvas.height); ctx.restore();
      } else if (sd.coreStability < 45) {
        ctx.save(); ctx.strokeStyle = 'rgba(255,140,0,0.5)'; ctx.lineWidth = 8; ctx.strokeRect(0,0,canvas.width,canvas.height); ctx.restore();
      } else if (sd.coreStability > 70) {
        ctx.save(); ctx.strokeStyle = 'rgba(30,215,96,0.2)'; ctx.lineWidth = 6; ctx.strokeRect(0,0,canvas.width,canvas.height); ctx.restore();
      }
      if (sd.magnetTicks > 0) { ctx.save(); ctx.strokeStyle = `rgba(255,68,170,${0.3+Math.sin(sd.gameTicks*0.2)*0.2})`; ctx.lineWidth = 5; ctx.strokeRect(3,3,canvas.width-6,canvas.height-6); ctx.restore(); }

      // Grid
      ctx.save(); ctx.strokeStyle = `rgba(255,78,62,${tier>=4?0.07:0.035})`; ctx.lineWidth = tier>=5?1.8:1.4;
      const hor = canvas.height * 0.35;
      for (let i = -200; i < canvas.width+200; i += 75) { ctx.beginPath(); ctx.moveTo(i,canvas.height); ctx.lineTo(canvas.width/2+(i-canvas.width/2)*0.08,hor); ctx.stroke(); }
      ctx.restore();

      // Matrix rain
      ctx.save(); ctx.font = '13px monospace';
      sd.matrixColumns.forEach(col => { col.chars.forEach((ch, idx) => { const cy=col.y+idx*18; if(cy>0&&cy<canvas.height){ ctx.fillStyle=idx===col.chars.length-1?sc:`rgba(255,78,62,${0.08+(idx/col.chars.length)*0.28})`; ctx.fillText(ch,col.x,cy); } }); }); ctx.restore();

      // Banners
      // Faint scrolling banner words — atmospheric only (alpha ~0.02). Skipped on mobile: each is
      // a large fillText + font switch per frame and the effect is barely perceptible on a phone.
      if (controlMode !== 'mobile') { ctx.save(); sd.bannerTexts.forEach(b => { ctx.font=`900 ${b.size}px "Helvetica Neue",sans-serif`; ctx.fillStyle=`rgba(255,78,62,${glitch?b.alpha*2.5:b.alpha})`; ctx.fillText(b.text,b.x,b.y); }); ctx.restore(); }

      // Distance watermark
      ctx.save(); ctx.font='900 13vw "Helvetica Neue",sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillStyle=tier>=7?'rgba(255,78,62,0.018)':'rgba(255,78,62,0.032)';
      ctx.fillText(String(Math.floor(sd.milesTraveled)).padStart(4,'0'),canvas.width/2,canvas.height/2); ctx.restore();

      // Platforms
      sd.platforms.forEach(pl => { ctx.fillStyle=pc; ctx.fillRect(pl.x,pl.y,pl.width,pl.height); ctx.fillStyle=sc; ctx.fillRect(pl.x,pl.y,pl.width,5); });

      // Crystals
      sd.crystals.forEach(c => {
        if (c.collected) return;
        const fy = Math.sin(sd.gameTicks*0.12+c.pulseOffset)*7;
        ctx.save(); ctx.translate(c.x+c.size/2, c.y+c.size/2+fy); ctx.rotate(sd.gameTicks*0.035);
        if (c.isGolden) {
          // Gold spinning diamond with sparkles
          ctx.shadowColor='#ffd700'; ctx.shadowBlur=28;
          ctx.fillStyle='#ffd700';
          ctx.beginPath(); ctx.moveTo(0,-c.size*0.7); ctx.lineTo(c.size*0.5,0); ctx.lineTo(0,c.size*0.7); ctx.lineTo(-c.size*0.5,0); ctx.closePath(); ctx.fill();
          ctx.fillStyle='#fffacd';
          ctx.beginPath(); ctx.moveTo(0,-c.size*0.35); ctx.lineTo(c.size*0.25,0); ctx.lineTo(0,c.size*0.35); ctx.lineTo(-c.size*0.25,0); ctx.closePath(); ctx.fill();
          for (let i=0; i<4; i++) { const ta=sd.gameTicks*0.1+i*Math.PI/2; ctx.fillStyle=`rgba(255,215,0,${0.4+Math.sin(ta)*0.3})`; ctx.beginPath(); ctx.arc(Math.cos(ta)*c.size*0.85,Math.sin(ta)*c.size*0.85,3,0,Math.PI*2); ctx.fill(); }
        } else if (c.isTripleJump) {
          ctx.fillStyle='#cc44ff'; ctx.shadowColor='#cc44ff'; ctx.shadowBlur=22;
          ctx.strokeStyle='#ffffff'; ctx.lineWidth=2;
          ctx.beginPath(); ctx.arc(0,0,c.size*0.85,0,Math.PI*2); ctx.stroke();
          ctx.globalAlpha=0.5+Math.sin(sd.gameTicks*0.2)*0.3;
          ctx.beginPath(); ctx.arc(0,0,c.size*1.1,0,Math.PI*2); ctx.stroke(); ctx.globalAlpha=1;
        } else if (c.isHazard) {
          const hp = 0.6 + Math.sin(sd.gameTicks * 0.25) * 0.4;
          ctx.shadowColor = '#ff4400'; ctx.shadowBlur = 18 * hp;
          ctx.strokeStyle = `rgba(255,100,0,${hp})`; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(0, 0, c.size * 0.8, 0, Math.PI * 2); ctx.stroke();
          ctx.strokeStyle = `rgba(255,68,0,${hp})`; ctx.lineWidth = 2.5;
          const xs = c.size * 0.3;
          ctx.beginPath(); ctx.moveTo(-xs,-xs); ctx.lineTo(xs,xs); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(xs,-xs); ctx.lineTo(-xs,xs); ctx.stroke();
          ctx.fillStyle = '#cc2200';
        } else if (c.isMagnet) {
          ctx.fillStyle='#ff44aa'; ctx.shadowColor='#ff44aa'; ctx.shadowBlur=20;
          ctx.strokeStyle='#ffffff'; ctx.lineWidth=2;
          ctx.beginPath(); ctx.arc(0,0,c.size*0.8,0,Math.PI*2); ctx.stroke();
          const oa=sd.gameTicks*0.08; ctx.fillStyle='#ffffff';
          ctx.beginPath(); ctx.arc(Math.cos(oa)*c.size*0.7,Math.sin(oa)*c.size*0.7,3,0,Math.PI*2); ctx.fill();
          ctx.beginPath(); ctx.arc(Math.cos(oa+Math.PI)*c.size*0.7,Math.sin(oa+Math.PI)*c.size*0.7,3,0,Math.PI*2); ctx.fill();
        } else if (c.isShield) {
          ctx.fillStyle='#00cfff'; ctx.shadowColor='#00cfff'; ctx.shadowBlur=20;
          ctx.strokeStyle='#ffffff'; ctx.lineWidth=2;
          ctx.beginPath(); ctx.arc(0,0,c.size*0.8,0,Math.PI*2); ctx.stroke();
        } else if (c.isTime) {
          // Blue clock
          ctx.fillStyle='#4488ff'; ctx.shadowColor='#4488ff'; ctx.shadowBlur=22;
          ctx.strokeStyle='#aaccff'; ctx.lineWidth=2;
          ctx.beginPath(); ctx.arc(0,0,c.size*0.8,0,Math.PI*2); ctx.stroke();
          // Clock hands
          const ha = sd.gameTicks * 0.05; ctx.strokeStyle='#ffffff'; ctx.lineWidth=1.5;
          ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(Math.cos(ha)*c.size*0.4, Math.sin(ha)*c.size*0.4); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(Math.cos(ha*3)*c.size*0.25, Math.sin(ha*3)*c.size*0.25); ctx.stroke();
        } else if (c.isGhost) {
          // White translucent
          ctx.globalAlpha = 0.5 + Math.sin(sd.gameTicks*0.15)*0.25;
          ctx.fillStyle='#ffffff'; ctx.shadowColor='#ffffff'; ctx.shadowBlur=25;
          ctx.strokeStyle='#ccccff'; ctx.lineWidth=2;
          ctx.beginPath(); ctx.arc(0,0,c.size*0.8,0,Math.PI*2); ctx.stroke();
          ctx.globalAlpha=1;
        } else if (c.isDoubleTap) {
          // Orange double diamond
          ctx.fillStyle='#ff8800'; ctx.shadowColor='#ff8800'; ctx.shadowBlur=20;
          ctx.beginPath(); ctx.moveTo(-c.size*0.2,-c.size*0.5); ctx.lineTo(c.size*0.3,0); ctx.lineTo(-c.size*0.2,c.size*0.5); ctx.lineTo(-c.size*0.6,0); ctx.closePath(); ctx.fill();
          ctx.beginPath(); ctx.moveTo(c.size*0.1,-c.size*0.5); ctx.lineTo(c.size*0.6,0); ctx.lineTo(c.size*0.1,c.size*0.5); ctx.lineTo(-c.size*0.3,0); ctx.closePath(); ctx.fill();
        } else if (c.isOvercharge) {
          // Jagged electric yellow
          const jp = 0.6 + Math.sin(sd.gameTicks*0.3)*0.4;
          ctx.fillStyle=`rgba(255,255,0,${jp})`; ctx.shadowColor='#ffff00'; ctx.shadowBlur=24*jp;
          ctx.beginPath();
          for (let i=0;i<8;i++) { const a=(i/8)*Math.PI*2; const r=i%2===0?c.size*0.8:c.size*0.45; i===0?ctx.moveTo(Math.cos(a)*r,Math.sin(a)*r):ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r); }
          ctx.closePath(); ctx.fill();
        } else if (c.isMirror) {
          // Silver spinning square
          ctx.fillStyle='#aaaacc'; ctx.shadowColor='#ccccff'; ctx.shadowBlur=18;
          ctx.strokeStyle='#ffffff'; ctx.lineWidth=2;
          ctx.save(); ctx.rotate(Math.PI/4 + sd.gameTicks*0.04);
          ctx.fillRect(-c.size*0.55,-c.size*0.55,c.size*1.1,c.size*1.1);
          ctx.strokeRect(-c.size*0.55,-c.size*0.55,c.size*1.1,c.size*1.1);
          ctx.restore();
        } else if (c.isFloat) {
          // Rainbow pulsing — ultra rare
          const rf = sd.gameTicks * 0.06;
          ctx.shadowBlur=30; ctx.lineWidth=3;
          const rainbow = ['#ff0000','#ff8800','#ffff00','#00ff88','#4488ff','#cc44ff'];
          for (let ri=0;ri<rainbow.length;ri++) {
            ctx.strokeStyle=rainbow[ri]; ctx.shadowColor=rainbow[ri];
            ctx.globalAlpha=0.6+Math.sin(rf+ri*0.8)*0.3;
            ctx.beginPath(); ctx.arc(0,0,c.size*(0.5+ri*0.07),0,Math.PI*2); ctx.stroke();
          }
          ctx.globalAlpha=1; ctx.fillStyle='#ffffff'; ctx.shadowColor='#ffffff'; ctx.shadowBlur=15;
        } else if (c.isPurpleUnicorn) {
          // Purple unicorn — drawn upright (cancel the diamond spin), golden horn, flowing mane
          ctx.rotate(-sd.gameTicks*0.035);
          const gl=0.6+Math.sin(sd.gameTicks*0.12+c.pulseOffset)*0.4;
          const mane=['#cc44ff','#ff44aa','#8844ff','#ff88ff'];
          for (let i=0;i<mane.length;i++){ ctx.strokeStyle=mane[i]; ctx.lineWidth=3; ctx.shadowColor=mane[i]; ctx.shadowBlur=12; const off=(i-mane.length/2)*4; const wob=Math.sin(sd.gameTicks*0.15+i)*5; ctx.beginPath(); ctx.moveTo(c.size*0.1,off); ctx.quadraticCurveTo(c.size*0.5,off+wob,c.size*0.8,off+wob*1.5); ctx.stroke(); }
          ctx.shadowColor='#cc44ff'; ctx.shadowBlur=24*gl; ctx.fillStyle='#e6b3ff';
          ctx.beginPath(); ctx.ellipse(0,0,c.size*0.42,c.size*0.34,0,0,Math.PI*2); ctx.fill();
          ctx.beginPath(); ctx.ellipse(-c.size*0.32,-c.size*0.12,c.size*0.2,c.size*0.16,0.4,0,Math.PI*2); ctx.fill();
          ctx.fillStyle='#ffd700'; ctx.shadowColor='#ffd700'; ctx.shadowBlur=16;
          ctx.beginPath(); ctx.moveTo(-c.size*0.42,-c.size*0.3); ctx.lineTo(-c.size*0.6,-c.size*0.62); ctx.lineTo(-c.size*0.5,-c.size*0.28); ctx.closePath(); ctx.fill();
          ctx.fillStyle='#000'; ctx.shadowBlur=0; ctx.beginPath(); ctx.arc(-c.size*0.36,-c.size*0.14,2.2,0,Math.PI*2); ctx.fill();
          ctx.fillStyle=`rgba(255,255,255,${gl})`; ctx.beginPath(); ctx.arc(-c.size*0.6,-c.size*0.5,2.6,0,Math.PI*2); ctx.fill();
        } else if (c.isApex) {
          // APEX super crystal — pulsing cyan/gold beacon, unmistakably a big-deal target
          const ap = 0.6 + Math.sin(sd.gameTicks*0.18+c.pulseOffset)*0.4;
          ctx.shadowColor='#00ffd0'; ctx.shadowBlur=34*ap;
          ctx.strokeStyle=`rgba(0,255,208,${ap})`; ctx.lineWidth=2.5;
          ctx.beginPath(); ctx.arc(0,0,c.size*0.95,0,Math.PI*2); ctx.stroke();
          ctx.strokeStyle=`rgba(255,215,0,${ap})`; ctx.lineWidth=2;
          ctx.beginPath(); ctx.arc(0,0,c.size*1.25,0,Math.PI*2); ctx.stroke();
          ctx.fillStyle='#00ffd0';
        } else {
          ctx.fillStyle=sc; ctx.shadowColor=sc; ctx.shadowBlur=8;
        }
        if (!c.isPurpleUnicorn) { ctx.beginPath(); ctx.moveTo(0,-c.size/2); ctx.lineTo(c.size/2,0); ctx.lineTo(0,c.size/2); ctx.lineTo(-c.size/2,0); ctx.closePath(); ctx.fill(); }
        ctx.restore();
      });

      // Projectiles — visual per tier
      sd.projectiles.forEach(pr => {
        ctx.save();
        const isNova  = pr.height > canvas.height * 0.15;
        const isWide  = pr.height > canvas.height * 0.12;
        const isRapid = pr.width < 70;
        if (isNova) {
          ctx.shadowColor='#cc44ff'; ctx.shadowBlur=50;
          const g=ctx.createLinearGradient(pr.x,0,pr.x+pr.width,0);
          g.addColorStop(0,'rgba(204,68,255,0.0)'); g.addColorStop(0.3,'rgba(204,68,255,0.7)'); g.addColorStop(0.8,'rgba(255,255,255,0.95)'); g.addColorStop(1,'rgba(255,255,255,1)');
          ctx.fillStyle=g; ctx.fillRect(pr.x,pr.y,pr.width,pr.height);
        } else if (isWide) {
          ctx.shadowColor='#ff8800'; ctx.shadowBlur=25;
          const g=ctx.createLinearGradient(pr.x,0,pr.x+pr.width,0);
          g.addColorStop(0,'rgba(255,136,0,0.0)'); g.addColorStop(0.25,'rgba(255,136,0,0.6)'); g.addColorStop(0.7,'rgba(255,230,92,0.9)'); g.addColorStop(1,'rgba(255,255,255,0.95)');
          ctx.fillStyle=g; ctx.fillRect(pr.x,pr.y,pr.width,pr.height);
          ctx.fillStyle='rgba(255,255,255,0.7)'; ctx.fillRect(pr.x+pr.width-12,pr.y+pr.height*0.3,12,pr.height*0.4);
        } else if (isRapid) {
          ctx.shadowColor='#ff44aa'; ctx.shadowBlur=15; ctx.fillStyle='#ff44aa'; ctx.fillRect(pr.x,pr.y,pr.width,pr.height);
          ctx.fillStyle='#ffffff'; ctx.fillRect(pr.x+pr.width-10,pr.y+2,10,pr.height-4);
        } else {
          ctx.shadowColor='#1ED760'; ctx.shadowBlur=40;
          const g=ctx.createLinearGradient(pr.x,0,pr.x+pr.width,0);
          g.addColorStop(0,'rgba(30,215,96,0.0)'); g.addColorStop(0.2,'rgba(30,215,96,0.55)'); g.addColorStop(0.6,'rgba(30,215,96,0.8)'); g.addColorStop(1,'rgba(255,255,255,0.9)');
          ctx.fillStyle=g; ctx.fillRect(pr.x,pr.y,pr.width,pr.height);
          ctx.fillStyle='rgba(255,255,255,0.95)'; ctx.fillRect(pr.x+pr.width-18,pr.y,18,pr.height);
        }
        ctx.restore();
      });

      // Aliens
      sd.aliens.forEach(al => {
        if (!al.alive) return;
        ctx.save(); ctx.translate(al.x+al.width/2, al.y+al.height/2);
        const flap=Math.sin(al.animFrame*0.22)*7;
        if (al.type==='super') {
          const pulse=0.7+Math.sin(al.animFrame*0.08)*0.3;
          ctx.shadowColor='#ff0044'; ctx.shadowBlur=30*pulse;
          ctx.strokeStyle=`rgba(255,0,68,${pulse})`; ctx.lineWidth=3;
          ctx.beginPath(); ctx.arc(0,0,al.width*0.65,0,Math.PI*2); ctx.stroke();
          ctx.fillStyle=`rgba(220,0,80,${0.8+pulse*0.2})`;
          ctx.beginPath(); ctx.moveTo(0,-al.height/2); ctx.lineTo(al.width/2,0); ctx.lineTo(0,al.height/2); ctx.lineTo(-al.width/2,0); ctx.closePath(); ctx.fill();
          ctx.fillStyle=`rgba(255,200,200,${pulse*0.6})`;
          ctx.beginPath(); ctx.moveTo(0,-al.height/4); ctx.lineTo(al.width/4,0); ctx.lineTo(0,al.height/4); ctx.lineTo(-al.width/4,0); ctx.closePath(); ctx.fill();
          ctx.fillStyle='#ffe65c'; ctx.beginPath(); ctx.arc(-6,-6,9,0,Math.PI*2); ctx.fill();
          ctx.fillStyle='#000'; ctx.beginPath(); ctx.arc(-6,-6,4,0,Math.PI*2); ctx.fill();
          ctx.fillStyle='#ff0044'; ctx.beginPath(); ctx.arc(-6,-6,1.5,0,Math.PI*2); ctx.fill();
          ctx.fillStyle='rgba(220,0,80,0.4)';
          ctx.beginPath(); ctx.moveTo(-al.width/2,0); ctx.lineTo(-al.width/2-22,-10+flap); ctx.lineTo(-al.width/2-14,14-flap); ctx.closePath(); ctx.fill();
          ctx.beginPath(); ctx.moveTo(al.width/2,0); ctx.lineTo(al.width/2+22,-10+flap); ctx.lineTo(al.width/2+14,14-flap); ctx.closePath(); ctx.fill();
          ctx.fillStyle='#333'; ctx.fillRect(-al.width/2,-al.height/2-12,al.width,6);
          ctx.fillStyle=al.health===2?'#ff0044':'#ff8800'; ctx.fillRect(-al.width/2,-al.height/2-12,al.width*(al.health/2),6);
        } else if (al.type==='speedy') {
          ctx.shadowColor='#ffe65c'; ctx.shadowBlur=16; ctx.fillStyle='#ffe65c';
          ctx.beginPath(); ctx.moveTo(0,-al.height*0.7); ctx.lineTo(al.width*0.4,0); ctx.lineTo(0,al.height*0.7); ctx.lineTo(-al.width*0.4,0); ctx.closePath(); ctx.fill();
          ctx.strokeStyle='#ff4e3e'; ctx.lineWidth=2;
          ctx.beginPath(); ctx.moveTo(0,-al.height*0.7); ctx.lineTo(al.width*0.4,0); ctx.lineTo(0,al.height*0.7); ctx.lineTo(-al.width*0.4,0); ctx.closePath(); ctx.stroke();
          ctx.fillStyle='#000'; ctx.beginPath(); ctx.arc(-3,-3,3,0,Math.PI*2); ctx.fill();
          ctx.strokeStyle='rgba(255,230,92,0.3)'; ctx.lineWidth=1.5;
          for (let i=1;i<=3;i++) { ctx.beginPath(); ctx.moveTo(-i*8,-al.height*0.3); ctx.lineTo(-i*8,al.height*0.3); ctx.stroke(); }
        } else if (al.type==='sniper') {
          // Tiny, cyan, crosshair silhouette
          ctx.shadowColor='#00cfff'; ctx.shadowBlur=14; ctx.fillStyle='#00cfff';
          ctx.beginPath(); ctx.arc(0,0,al.width*0.45,0,Math.PI*2); ctx.fill();
          ctx.strokeStyle='#ffffff'; ctx.lineWidth=1.5;
          ctx.beginPath(); ctx.moveTo(-al.width*0.7,0); ctx.lineTo(al.width*0.7,0); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(0,-al.height*0.7); ctx.lineTo(0,al.height*0.7); ctx.stroke();
          ctx.fillStyle='#001133'; ctx.beginPath(); ctx.arc(0,0,al.width*0.2,0,Math.PI*2); ctx.fill();
        } else if (al.type==='tank') {
          // Big grey hexagon, slow, intimidating
          const pulse=0.8+Math.sin(al.animFrame*0.05)*0.2;
          ctx.shadowColor='#888888'; ctx.shadowBlur=20*pulse; ctx.fillStyle=`rgba(100,100,110,${0.9+pulse*0.1})`;
          ctx.beginPath();
          for (let i=0;i<6;i++) { const a=(i/6)*Math.PI*2; i===0?ctx.moveTo(Math.cos(a)*al.width/2,Math.sin(a)*al.height/2):ctx.lineTo(Math.cos(a)*al.width/2,Math.sin(a)*al.height/2); }
          ctx.closePath(); ctx.fill();
          ctx.strokeStyle='#cccccc'; ctx.lineWidth=3; ctx.stroke();
          // HP pips
          ctx.fillStyle='#ff4400';
          for (let i=0;i<al.health;i++) { ctx.beginPath(); ctx.arc(-al.width*0.25+i*al.width*0.25,-al.height*0.5-8,5,0,Math.PI*2); ctx.fill(); }
          ctx.fillStyle='#888'; ctx.beginPath(); ctx.arc(0,0,al.width*0.2,0,Math.PI*2); ctx.fill();
          ctx.fillStyle='#ccc'; ctx.font=`bold ${al.width*0.25}px monospace`; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText('⬡',0,0);
        } else if (al.type==='bomber') {
          // Orange, wedge-shaped
          ctx.shadowColor='#ff8800'; ctx.shadowBlur=16; ctx.fillStyle='#ff8800';
          ctx.beginPath(); ctx.moveTo(al.width*0.6,0); ctx.lineTo(-al.width*0.5,-al.height*0.5); ctx.lineTo(-al.width*0.5,al.height*0.5); ctx.closePath(); ctx.fill();
          ctx.strokeStyle='#ffcc00'; ctx.lineWidth=2; ctx.stroke();
          ctx.fillStyle='#ffcc00'; ctx.beginPath(); ctx.arc(-al.width*0.15,0,4,0,Math.PI*2); ctx.fill();
          // Bomb drop indicator
          if (!al.bomberDropped) { ctx.strokeStyle='rgba(255,100,0,0.5)'; ctx.lineWidth=1; ctx.setLineDash([3,3]); ctx.beginPath(); ctx.moveTo(0,al.height*0.5); ctx.lineTo(0,al.height*1.5+Math.sin(al.animFrame*0.2)*5); ctx.stroke(); ctx.setLineDash([]); }
        } else if (al.type==='prism') {
          // Rotating rainbow gem — clearly a reward target
          ctx.rotate(al.animFrame*0.04);
          const rainbow=['#ff0000','#ff8800','#ffff00','#00ff88','#4488ff','#cc44ff'];
          const seg=rainbow.length;
          for (let i=0;i<seg;i++) {
            const a0=(i/seg)*Math.PI*2, a1=((i+1)/seg)*Math.PI*2;
            ctx.fillStyle=rainbow[i]; ctx.shadowColor=rainbow[i]; ctx.shadowBlur=18;
            ctx.beginPath(); ctx.moveTo(0,0);
            ctx.lineTo(Math.cos(a0)*al.width*0.6, Math.sin(a0)*al.height*0.6);
            ctx.lineTo(Math.cos(a1)*al.width*0.6, Math.sin(a1)*al.height*0.6);
            ctx.closePath(); ctx.fill();
          }
          // White core
          ctx.shadowColor='#ffffff'; ctx.shadowBlur=20; ctx.fillStyle='#ffffff';
          ctx.beginPath(); ctx.arc(0,0,al.width*0.22,0,Math.PI*2); ctx.fill();
          // Orbiting sparkles
          for (let i=0;i<3;i++) { const sa=al.animFrame*0.1+i*(Math.PI*2/3); ctx.fillStyle='rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.arc(Math.cos(sa)*al.width*0.75,Math.sin(sa)*al.height*0.75,3,0,Math.PI*2); ctx.fill(); }
        } else if (al.type==='unicorn') {
          ctx.scale(-1, 1);  // face direction of travel (leftward)
          // Flowing rainbow mane/tail
          const rainbow=['#ff0000','#ff8800','#ffff00','#00ff88','#4488ff','#cc44ff'];
          for (let i=0;i<rainbow.length;i++) {
            ctx.strokeStyle=rainbow[i]; ctx.lineWidth=3; ctx.shadowColor=rainbow[i]; ctx.shadowBlur=10;
            const off=(i-rainbow.length/2)*4; const wob=Math.sin(al.animFrame*0.15+i)*5;
            ctx.beginPath(); ctx.moveTo(-al.width*0.2,off);
            ctx.quadraticCurveTo(-al.width*0.6,off+wob,-al.width*0.9,off+wob*1.5); ctx.stroke();
          }
          // Body — soft white glow
          ctx.shadowColor='#ffffff'; ctx.shadowBlur=22; ctx.fillStyle='#fffefb';
          ctx.beginPath(); ctx.ellipse(0,0,al.width*0.42,al.height*0.34,0,0,Math.PI*2); ctx.fill();
          // Head
          ctx.beginPath(); ctx.ellipse(al.width*0.32,-al.height*0.12,al.width*0.2,al.height*0.16,-0.4,0,Math.PI*2); ctx.fill();
          // Golden horn
          ctx.fillStyle='#ffd700'; ctx.shadowColor='#ffd700'; ctx.shadowBlur=16;
          ctx.beginPath(); ctx.moveTo(al.width*0.42,-al.height*0.3); ctx.lineTo(al.width*0.6,-al.height*0.62); ctx.lineTo(al.width*0.5,-al.height*0.28); ctx.closePath(); ctx.fill();
          // Eye
          ctx.fillStyle='#000'; ctx.shadowBlur=0; ctx.beginPath(); ctx.arc(al.width*0.36,-al.height*0.14,2.2,0,Math.PI*2); ctx.fill();
          // Sparkle
          ctx.fillStyle=`rgba(255,255,255,${0.5+Math.sin(al.animFrame*0.2)*0.5})`; ctx.beginPath(); ctx.arc(al.width*0.6,-al.height*0.5,2.5,0,Math.PI*2); ctx.fill();
        } else if (al.type==='chariot') {
          // Fancy gold chariot — gold cart, waving banner, spinning spoked wheels
          const gl=0.7+Math.sin(al.animFrame*0.12)*0.3;
          ctx.shadowColor='#ffd700'; ctx.shadowBlur=26*gl;
          // Cart body — gold trapezoid
          ctx.fillStyle='#ffd700';
          ctx.beginPath();
          ctx.moveTo(-al.width*0.45, al.height*0.05); ctx.lineTo(al.width*0.4, al.height*0.05);
          ctx.lineTo(al.width*0.28, al.height*0.32); ctx.lineTo(-al.width*0.4, al.height*0.32);
          ctx.closePath(); ctx.fill();
          // Bright rim
          ctx.fillStyle='#fff6c0'; ctx.fillRect(-al.width*0.45, al.height*0.0, al.width*0.85, al.height*0.07);
          // Waving banner
          ctx.fillStyle='#ff44aa'; ctx.shadowColor='#ff44aa'; ctx.shadowBlur=12;
          const wav=Math.sin(al.animFrame*0.2)*4;
          ctx.beginPath();
          ctx.moveTo(-al.width*0.1, al.height*0.02); ctx.lineTo(-al.width*0.1, -al.height*0.5);
          ctx.lineTo(al.width*0.25+wav, -al.height*0.38); ctx.lineTo(-al.width*0.1, -al.height*0.26);
          ctx.closePath(); ctx.fill();
          // Spinning spoked wheels
          ctx.shadowColor='#ffd700'; ctx.shadowBlur=14;
          for (const wx of [-al.width*0.28, al.width*0.22]) {
            ctx.save(); ctx.translate(wx, al.height*0.34); ctx.rotate(al.animFrame*0.3);
            ctx.strokeStyle='#ffe65c'; ctx.lineWidth=3;
            ctx.beginPath(); ctx.arc(0,0,al.height*0.2,0,Math.PI*2); ctx.stroke();
            for (let s=0;s<6;s++){ const sa=(s/6)*Math.PI*2; ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(Math.cos(sa)*al.height*0.2, Math.sin(sa)*al.height*0.2); ctx.stroke(); }
            ctx.restore();
          }
          // Sparkle
          ctx.fillStyle=`rgba(255,255,255,${0.5+Math.sin(al.animFrame*0.25)*0.5})`; ctx.beginPath(); ctx.arc(-al.width*0.4,-al.height*0.18,3,0,Math.PI*2); ctx.fill();
        } else {
          ctx.shadowColor='#ff4e3e'; ctx.shadowBlur=16; ctx.fillStyle='#ff4e3e';
          ctx.beginPath(); ctx.moveTo(0,-al.height/2); ctx.lineTo(al.width/2,0); ctx.lineTo(0,al.height/2); ctx.lineTo(-al.width/2,0); ctx.closePath(); ctx.fill();
          ctx.strokeStyle=sc; ctx.lineWidth=2;
          ctx.beginPath(); ctx.moveTo(0,-al.height/2); ctx.lineTo(al.width/2,0); ctx.lineTo(0,al.height/2); ctx.lineTo(-al.width/2,0); ctx.closePath(); ctx.stroke();
          ctx.fillStyle='#ffe65c'; ctx.beginPath(); ctx.arc(-5,-4,5,0,Math.PI*2); ctx.fill();
          ctx.fillStyle='#000'; ctx.beginPath(); ctx.arc(-5,-4,2.5,0,Math.PI*2); ctx.fill();
          ctx.fillStyle='rgba(255,78,62,0.45)';
          ctx.beginPath(); ctx.moveTo(-al.width/2,0); ctx.lineTo(-al.width/2-14,-6+flap); ctx.lineTo(-al.width/2-9,10-flap); ctx.closePath(); ctx.fill();
          ctx.beginPath(); ctx.moveTo(al.width/2,0); ctx.lineTo(al.width/2+14,-6+flap); ctx.lineTo(al.width/2+9,10-flap); ctx.closePath(); ctx.fill();
        }
        ctx.restore();
      });

      // Boss projectiles
      sd.bossProjectiles.forEach(bp => {
        if (!bp.alive) return;
        ctx.save(); ctx.shadowColor='#ff0044'; ctx.shadowBlur=10;
        ctx.fillStyle='#ff0044'; ctx.beginPath(); ctx.arc(bp.x,bp.y,7,0,Math.PI*2); ctx.fill();
        ctx.fillStyle='#ffaaaa'; ctx.beginPath(); ctx.arc(bp.x,bp.y,3,0,Math.PI*2); ctx.fill();
        ctx.restore();
      });

      // Meteors
      sd.meteors.forEach(m => {
        if (!m.alive) return;
        ctx.save(); ctx.translate(m.x+m.size/2,m.y+m.size/2); ctx.rotate(m.rotation);
        ctx.shadowColor='#ffffff'; ctx.shadowBlur=8; ctx.fillStyle='#cccccc';
        ctx.beginPath();
        for (let i=0;i<8;i++) { const a=(i/8)*Math.PI*2; const r=(m.size/2)*(0.7+Math.sin(i*2.3)*0.3); i===0?ctx.moveTo(Math.cos(a)*r,Math.sin(a)*r):ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r); }
        ctx.closePath(); ctx.fill(); ctx.restore();
      });

      // Particles
      // Batch the particles under ONE save/restore instead of per-particle — during explosions
      // there can be hundreds, and a save()/restore() each was a real per-frame cost on mobile.
      ctx.save(); ctx.shadowBlur = 0;
      sd.particles.forEach(pt => { ctx.globalAlpha=pt.alpha; ctx.fillStyle=pt.color; ctx.fillRect(pt.x,pt.y,pt.size,pt.size); });
      ctx.globalAlpha = 1; ctx.restore();

      // Player
      const p2=sd.player; const th=p2.height*p2.stretch; const tw=p2.width/(p2.stretch*0.85);
      ctx.save(); ctx.translate(p2.x+p2.width/2, p2.y+(p2.height-th)+th/2);
      if (!p2.isGrounded) ctx.rotate(p2.vy*0.02);
      const inv=sd.speedBoostTicks>0;
      if (inv) {
        ctx.save(); ctx.globalAlpha=0.25+Math.sin(sd.gameTicks*0.3)*0.2;
        for (let ring=1;ring<=3;ring++) { ctx.strokeStyle=ring%2===0?'#00cfff':'#ffffff'; ctx.lineWidth=2; ctx.shadowColor='#0000cfff'; ctx.shadowBlur=20;
        ctx.beginPath(); ctx.arc(0,0,(Math.max(tw,th)*0.5)+ring*8+Math.sin(sd.gameTicks*0.2+ring)*4,0,Math.PI*2); ctx.stroke(); }
        ctx.restore();
      }
      if (sd.shieldActive && !inv) {
        ctx.save(); ctx.globalAlpha=0.35+Math.sin(sd.gameTicks*0.15)*0.15; ctx.strokeStyle='#00cfff'; ctx.lineWidth=3; ctx.shadowColor='#00cfff'; ctx.shadowBlur=20;
        ctx.beginPath(); ctx.arc(0,0,Math.max(tw,th)*0.75,0,Math.PI*2); ctx.stroke(); ctx.restore();
      }
      const showP=!inv||sd.gameTicks%4<3;
      if (showP) {
        // Ghost mode — player is semi-transparent
        if (sd.ghostTicks > 0) ctx.globalAlpha = 0.35 + Math.sin(sd.gameTicks*0.2)*0.15;
        ctx.fillStyle=inv?'#00cfff':sd.ghostTicks>0?'#ffffff':sc;
        ctx.shadowColor=inv?'#00cfff':sd.ghostTicks>0?'#ffffff':sc;
        ctx.shadowBlur=inv?24:sd.ghostTicks>0?30:10;
        ctx.beginPath(); ctx.moveTo(0,-th/2); ctx.lineTo(tw/2,0); ctx.lineTo(0,th/2); ctx.lineTo(-tw/2,0); ctx.closePath(); ctx.fill();
        ctx.globalAlpha=1;
      }
      ctx.restore();

      // Boss
      if (sd.boss) {
        const b=sd.boss; ctx.save(); ctx.translate(b.x+b.width/2,b.y+b.height/2);
        const bP=0.7+Math.sin(b.animFrame*0.06)*0.3;
        ctx.strokeStyle=`rgba(255,0,68,${bP})`; ctx.lineWidth=4; ctx.shadowColor='#ff0044'; ctx.shadowBlur=40*bP;
        ctx.beginPath(); ctx.arc(0,0,b.width*0.72,0,Math.PI*2); ctx.stroke();
        ctx.beginPath(); ctx.arc(0,0,b.width*0.9,0,Math.PI*2); ctx.stroke();
        ctx.fillStyle=`rgba(180,0,60,${0.85+bP*0.15})`;
        ctx.beginPath();
        for (let i=0;i<8;i++) { const a=(i/8)*Math.PI*2+b.animFrame*0.01; const r=b.width/2*(0.85+Math.sin(i*1.3)*0.1); i===0?ctx.moveTo(Math.cos(a)*r,Math.sin(a)*r):ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r); }
        ctx.closePath(); ctx.fill();
        ctx.fillStyle=`rgba(255,200,200,${bP*0.7})`; ctx.beginPath(); ctx.arc(0,0,b.width*0.25,0,Math.PI*2); ctx.fill();
        ctx.fillStyle='#ffe65c'; ctx.beginPath(); ctx.arc(-10,-8,8,0,Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.arc(10,-8,8,0,Math.PI*2); ctx.fill();
        ctx.fillStyle='#000'; ctx.beginPath(); ctx.arc(-10,-8,4,0,Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.arc(10,-8,4,0,Math.PI*2); ctx.fill();
        ctx.fillStyle='#ff0044'; ctx.beginPath(); ctx.arc(-10,-8,2,0,Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.arc(10,-8,2,0,Math.PI*2); ctx.fill();
        ctx.fillStyle='#222'; ctx.fillRect(-b.width/2,-b.height/2-16,b.width,8);
        ctx.fillStyle=b.health===3?'#1ED760':b.health===2?'#ff8800':'#ff0000'; ctx.fillRect(-b.width/2,-b.height/2-16,b.width*(b.health/b.maxHealth),8);
        ctx.font='bold 11px monospace'; ctx.fillStyle='#ffffff'; ctx.textAlign='center'; ctx.fillText(b.name,0,-b.height/2-22);
        ctx.restore();
      }

      // Floating feedback ("+100", combo words) — drawn on the canvas instead of as React DOM.
      // Previously these re-rendered the whole component 20×/sec (setFloatTexts) which tanked
      // mobile; on canvas they cost almost nothing, sit in the correct game-space position, and
      // are kept smaller + lower-alpha on mobile so they don't crowd the screen.
      if (sd.floatTexts.length) {
        const lowFx = controlMode === 'mobile';
        ctx.save();
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = `900 ${lowFx ? 15 : 22}px "Helvetica Neue",sans-serif`;
        for (const ft of sd.floatTexts) {
          ctx.globalAlpha = ft.alpha * (lowFx ? 0.7 : 1);
          ctx.fillStyle = '#000'; ctx.fillText(ft.text, ft.x + 1.5, ft.y + 1.5);
          ctx.fillStyle = '#ffe65c'; ctx.fillText(ft.text, ft.x, ft.y);
        }
        ctx.globalAlpha = 1;
        ctx.restore();
      }

      // Warp toast
      const t=sd.warpToast;
      if (t.active) {
        const lowFx = controlMode === 'mobile';
        ctx.save(); ctx.font=`900 ${lowFx ? 18 : 32}px "Helvetica Neue",sans-serif`; ctx.textAlign='center'; ctx.textBaseline='middle';
        const tw2=ctx.measureText(t.text).width; const sx=canvas.width/2-tw2/2;
        const ph = lowFx ? 40 : 70;
        ctx.fillStyle='rgba(0,0,0,0.88)'; ctx.fillRect(sx-24,t.y-ph/2,tw2+48,ph);
        ctx.strokeStyle=sc; ctx.lineWidth=2; ctx.strokeRect(sx-24,t.y-ph/2,tw2+48,ph);
        if (lowFx) {
          // Mobile: a single flat draw — the per-2px clipped slice loop below is both a frame
          // hitch and visually noisy on a small screen.
          ctx.fillStyle=sc; ctx.fillText(t.text,canvas.width/2,t.y);
        } else {
          for (let i=0;i<tw2;i+=2) { const yo=Math.sin((sd.gameTicks*0.25)+(i*0.04))*10; ctx.save(); ctx.beginPath(); ctx.rect(sx+i,t.y-40,2,80); ctx.clip(); ctx.fillStyle=(sd.gameTicks%10<5)?sc:pc; ctx.fillText(t.text,canvas.width/2,t.y+yo); ctx.restore(); }
        }
        ctx.restore();
      }

      ctx.restore(); // screen shake
    };

    // Fixed-timestep loop. The whole sim is tick-based ("pixels per frame"), so we must advance
    // it by a FIXED 60Hz step regardless of how fast the device actually renders. We accumulate
    // real elapsed time and run update() as many whole steps as have built up, then draw once.
    // A 45fps phone now runs update() ~1.33×/frame to stay on wall-clock — no more slow-motion;
    // a 120Hz screen runs it ≤1×/frame — no more double-speed. Both just render the same sim.
    const loop = (now: number) => {
      frameRef.current = requestAnimationFrame(loop);
      if (state.lastTime === 0) state.lastTime = now;
      let delta = now - state.lastTime;
      state.lastTime = now;
      if (delta > 250) delta = 250;          // clamp after tab-away so we don't fast-forward
      state.accumulator += delta;
      let steps = 0;
      while (state.accumulator >= state.fpsInterval && steps < 5) {
        update();
        state.accumulator -= state.fpsInterval;
        steps++;
      }
      if (steps === 5) state.accumulator = 0; // too far behind to catch up — resync, don't spiral
      draw();
    };
    frameRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(frameRef.current);
      window.removeEventListener('resize', resize);
      window.removeEventListener('orientationchange', onOrient);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isPlaying]);

  // ---- REBOOT ----
  const reboot = () => {
    const e = stateRef.current;
    e.player.x=140; e.player.y=300; e.player.vy=0; e.player.jumpCount=0; e.player.stretch=1;
    e.gameTicks=0; e.milesTraveled=0; e.coyoteCounter=0; e.jumpBufferCounter=0;
    e.coreStability=100; e.crystalsTotal=0; e.crystalsSinceCharge=0; e.blasterCharges=0;
    e.comboCount=0; e.killCombo=0; e.comboTimer=0; e.shieldActive=false; e.speedBoostTicks=0;
    e.crystalsSinceShield=0; e.tripleJumpTicks=0; e.scoreMultTicks=0;
    e.crystalsSinceTriple=0; e.superAlienSpawned=false; e.calmTicks=0;
    e.boss=null; e.bossProjectiles=[]; e.magnetTicks=0;
    e.perks=[]; e.crystalsSincePerks=0; e.crystalsSinceBoss=0; e.bossSpeedReliefTicks=0;
    e.streakTicks=0; e.perkDraftPending=false; e.crystalsSinceMagnet=0;
    e.weaponTier=0; e.chargeHeld=0; e.novaUnlocked=false; e.lastChargeRatio=0;
    e.crystalChain=0; e.crystalChainTimer=0; e.goldenCooldown=0; e.prismCooldown=0; e.unicornCooldown=0; e.chariotCooldown=0;
    e.weatherTicks=0; e.weatherType=''; e.weatherWarnTicks=0; e.nextWeatherAt=2700; e.nextHazardWaveAt=1800;
    e.bossCount=0; e.hazardSpeedTicks=0; e.crystalsSinceHazard=0;
    e.timeSlowTicks=0; e.ghostTicks=0; e.mirrorTicks=0; e.floatTicks=0;
    e.doubleTapReady=false; e.overchargeReady=false;
    e.easterEggMode=''; e.easterEggTicks=0; e.ouroModeAirCrystals=0;
    e.ghostRunShotsFired=0; e.ghostRunTimer=0; e.berserkerKills=0; e.berserkerTimer=0; e.berserkerCooldown=0;
    e.crystalsSinceRarePerk=0;
    e.platformsSinceStair=0;
    e.aliens=[]; e.projectiles=[]; e.meteors=[]; e.warpToast.active=false;
    spaceHeldRef.current = false;
    setScore(0); setCrystalCount(0); setBlasterCharges(0); setStability(100);
    setComboCount(0); setHasShield(false); setSpeedBoosted(false);
    setTripleJumpActive(false); setScoreMultActive(false);
    setMagnetActive(false); setPerkDraft(null);
    setRunStreak(0); setWeaponTier(0); setChargeLevel(0); setNovaReady(false);
    setCrystalChain(0); setWeatherEvent(null);
    setEasterEggMode(null); setTimeSlow(false); setGhostMode(false);
    setMirrorMode(false); setFloatMode(false); setIsPlaying(true);
  };

  // ---- RENDER ----
  const mob = controlMode === 'mobile';
  return (
    <div className="relative w-full h-full select-none overflow-hidden" onClick={handleCanvasClick}
      style={{ touchAction: 'none', WebkitUserSelect: 'none', userSelect: 'none', WebkitTouchCallout: 'none' }}>
      {/* GAME VIEW — on mobile this is the fixed 1280x720 stage scaled to fit (letterboxed, exact
          desktop look). The HUD/controls below live OUTSIDE this box so they render at native
          device size instead of being shrunk with the canvas. */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="relative shrink-0 origin-center"
          style={isMobileStage ? { width: 1280, height: 720, transform: `scale(${stageScale})` } : { width: '100%', height: '100%' }}>
          <canvas ref={canvasRef} className="absolute inset-0 block w-full h-full" />
        </div>
      </div>

      {/* ---- MOBILE TOUCH PADS — left half = fire/charge, right half = jump ----
          z-40 keeps these ABOVE the HUD/power-up stack so a tall stack of perks can never
          steal the jump/fire taps. Visual pads sit at the vertical middle of each side
          (natural thumb reach in landscape) and clear of the top HUD + bottom hints. */}
      {isPlaying && mob && (
        <div className="absolute inset-0 z-40 flex select-none" style={{ touchAction: 'none' }}>
          <div
            className="w-1/2 h-full relative pointer-events-auto"
            onPointerDown={onFireDown} onPointerUp={onFireUp} onPointerCancel={onFireUp} onContextMenu={e => e.preventDefault()}>
            <div className="absolute top-1/2 -translate-y-1/2 left-5 w-20 h-20 rounded-full border-2 border-[#ff4e3e]/50 bg-[#ff4e3e]/10 backdrop-blur-sm flex flex-col items-center justify-center text-[#ff4e3e]/80 font-mono pointer-events-none active:bg-[#ff4e3e]/25">
              <span className="text-2xl leading-none">✦</span>
              <span className="text-[9px] tracking-widest mt-1">FOGO</span>
              <span className="text-[7px] tracking-widest opacity-70">SEGURA</span>
            </div>
          </div>
          <div
            className="w-1/2 h-full relative pointer-events-auto"
            onPointerDown={onJumpTouch} onContextMenu={e => e.preventDefault()}>
            <div className="absolute top-1/2 -translate-y-1/2 right-5 w-20 h-20 rounded-full border-2 border-brandYellow/50 bg-brandYellow/10 backdrop-blur-sm flex flex-col items-center justify-center text-brandYellow/80 font-mono pointer-events-none active:bg-brandYellow/25">
              <span className="text-2xl leading-none">⤒</span>
              <span className="text-[9px] tracking-widest mt-1">SALTO</span>
            </div>
          </div>
        </div>
      )}


      <div className={`absolute flex justify-between items-start font-mono pointer-events-none z-10 select-none ${mob ? 'top-2 left-2 right-2 gap-2' : 'top-6 left-6 right-6'}`}>
        <div className="flex flex-col">
          <span className={`text-brandRed opacity-60 uppercase tracking-widest ${mob ? 'text-[8px]' : 'text-xs'}`}>NÚCLEO ARCADE HARDCORE</span>
          {!mob && <BrandText text="SIMULAÇÃO INFINITA" className="text-2xl text-brandYellow font-bold uppercase leading-none" />}
        </div>
        <div className={`flex flex-col items-center px-2 pt-1 ${mob ? 'w-32' : 'w-64 md:w-80 px-4'}`}>
          <div className={`w-full flex justify-between text-brandYellow font-bold uppercase tracking-widest pb-1 ${mob ? 'text-[8px]' : 'text-[10px]'}`}>
            <span>ESTABILIDADE</span>
            <span className={stability < 35 ? 'text-brandRed animate-pulse font-black' : 'text-white'}>{stability}%</span>
          </div>
          <div className={`w-full border border-brandYellow/40 bg-black/60 p-[2px] ${mob ? 'h-2' : 'h-3'}`}>
            <div className={`h-full transition-all duration-500 ${stability < 35 ? 'bg-brandRed animate-pulse' : 'bg-brandYellow'}`} style={{ width: `${stability}%` }} />
          </div>
        </div>
        <div className={`flex text-right items-start ${mob ? 'gap-3' : 'gap-6'}`}>
          <div className="flex flex-col"><span className={`text-brandRed opacity-60 ${mob ? 'text-[8px]' : 'text-xs'}`}>CRISTAIS</span><span className={`text-brandYellow font-bold ${mob ? 'text-sm' : 'text-xl'}`}>{crystalCount}</span></div>
          <div className="flex flex-col"><span className={`text-brandRed opacity-60 ${mob ? 'text-[8px]' : 'text-xs'}`}>PONTOS</span><span className={`text-white font-bold tracking-wider ${mob ? 'text-sm' : 'text-xl'}`}>{score.toLocaleString()}</span></div>
          <div className="flex flex-col"><span className={`text-brandRed opacity-60 ${mob ? 'text-[8px]' : 'text-xs'}`}>RECORDE</span><span className={`font-bold ${mob ? 'text-sm' : 'text-xl'} ${score > personalBest && personalBest > 0 ? 'text-[#1ED760] animate-pulse' : 'text-gray-500'}`}>{personalBest > 0 ? personalBest.toLocaleString() : '---'}</span></div>
          {runStreak > 0 && <div className="flex flex-col"><span className={`text-brandRed opacity-60 ${mob ? 'text-[8px]' : 'text-xs'}`}>TEMPO</span><span className={`text-[#ff44aa] font-bold ${mob ? 'text-sm' : 'text-xl'}`}>{runStreak}s</span></div>}
          {stateRef.current.bossSpeedReliefTicks > 0 && <div className="flex flex-col"><span className="text-[9px] text-[#1ED760] opacity-80 uppercase">ALÍVIO</span><span className="text-sm text-[#1ED760] font-bold animate-pulse">▼</span></div>}
        </div>
      </div>

      {isPlaying && (
        // On mobile this whole stack is pointer-events-none and shrunk into the top-right corner
        // BELOW the touch-pad layer (z-40), so a tall run of perks can never intercept jump/fire
        // taps, and a capped height keeps it from sprawling across the screen.
        <div className={`absolute flex flex-col items-end z-30 ${mob ? 'top-12 right-2 gap-1 pointer-events-none scale-[0.78] origin-top-right max-h-[80%] overflow-hidden' : 'top-24 right-6 gap-2 pointer-events-auto'}`}>
          {!mob && <button onClick={e => { e.stopPropagation(); toggleMute(); }}
            className="font-mono text-xs tracking-widest border border-brandYellow/40 px-3 py-1 text-brandYellow/60 hover:text-brandYellow hover:border-brandYellow bg-black/40 transition-all">
            {isMuted ? '[ ATIVAR SOM ]' : '[ SILENCIAR ]'}
          </button>}
          <div className="font-mono text-[11px] bg-black/60 border border-brandYellow/30 px-3 py-2 flex flex-col items-end gap-1 pointer-events-none">
            <div className="flex items-center gap-2 w-full justify-between">
              <span className="text-brandRed opacity-70 tracking-widest uppercase text-[9px]">{weaponTier===0?'PADRÃO':weaponTier===1?'TIRO LARGO':weaponTier===2?'TIRO RÁPIDO':'NÍVEL NOVA'}</span>
              <span className={`text-[9px] font-black ${weaponTier===0?'text-gray-500':weaponTier===1?'text-brandYellow':weaponTier===2?'text-[#ff44aa]':'text-[#cc44ff]'}`}>{'▮'.repeat(weaponTier+1)}{'▯'.repeat(3-weaponTier)}</span>
            </div>
            {chargeLevel > 0 && (
              <div className="w-full h-2 bg-black/60 border border-brandYellow/40 p-[1px]">
                <div className="h-full" style={{ width: `${chargeLevel*100}%`, background: chargeLevel>0.9?'#cc44ff':chargeLevel>0.6?'#ff44aa':chargeLevel>0.35?'#ffe65c':'#ff4e3e' }} />
              </div>
            )}
            {novaReady && <span className="text-[#cc44ff] text-[10px] font-black animate-pulse tracking-widest">NOVA PRONTA — CARGA MÁXIMA</span>}
            <div className="flex gap-1 items-center">
              {Array.from({ length: Math.max(5, blasterCharges) }).map((_, i) => (
                <div key={i} className={`w-3 h-3 rotate-45 border ${i < blasterCharges ? 'bg-brandYellow border-brandYellow shadow-[0_0_6px_#ffe65c]' : 'bg-transparent border-brandYellow/20'}`} />
              ))}
              {blasterCharges === 0 && <span className="text-brandRed/60 text-[9px] ml-1">5 CRISTAIS</span>}
            </div>
            <span className={`text-[10px] font-black tracking-widest ${blasterCharges > 0 ? 'text-[#1ED760] animate-pulse' : 'text-gray-600'}`}>{blasterCharges > 0 ? (mob ? 'SEGURA P/ CARREGAR' : 'SEGURA [ESPAÇO] P/ CARREGAR') : 'SEM CARGA'}</span>
          </div>
          {crystalChain >= 2 && (
            <div className="font-mono bg-black/70 border-2 px-3 py-2 flex flex-col items-end pointer-events-none"
              style={{ borderColor: crystalChain>=5?'#cc44ff':crystalChain>=3?'#ff44aa':'#ffe65c' }}>
              <span className="text-[9px] opacity-60 uppercase tracking-widest" style={{ color: crystalChain>=5?'#cc44ff':crystalChain>=3?'#ff44aa':'#ffe65c' }}>CADEIA DE CRISTAIS</span>
              <span className="text-2xl font-black leading-none animate-pulse" style={{ color: crystalChain>=5?'#cc44ff':crystalChain>=3?'#ff44aa':'#ffe65c' }}>×{crystalChain}</span>
            </div>
          )}
          {comboCount >= 2 && (
            <div className="font-mono bg-black/70 border-2 border-brandYellow px-3 py-2 flex flex-col items-end pointer-events-none shadow-[0_0_20px_rgba(255,230,92,0.4)]">
              <span className="text-[9px] text-brandYellow/60 uppercase tracking-widest">COMBO DE ABATES</span>
              <span className="text-2xl text-brandYellow font-black leading-none animate-pulse">×{comboCount}</span>
            </div>
          )}
          {hasShield && <div className="font-mono bg-black/70 border-2 border-[#00cfff] px-3 py-2 flex flex-col items-end pointer-events-none shadow-[0_0_20px_rgba(0,207,255,0.5)]"><span className="text-[9px] text-[#00cfff]/70 uppercase tracking-widest">ESCUDO</span><span className="text-sm text-[#00cfff] font-black animate-pulse">ATIVO</span></div>}
          {tripleJumpActive && <div className="font-mono bg-black/70 border-2 border-[#cc44ff] px-3 py-2 flex flex-col items-end pointer-events-none shadow-[0_0_20px_rgba(204,68,255,0.6)]"><span className="text-[9px] text-[#cc44ff]/70 uppercase tracking-widest">SALTO TRIPLO</span><span className="text-sm text-[#cc44ff] font-black animate-pulse">ATIVO ↑↑↑</span></div>}
          {scoreMultActive && <div className="font-mono bg-black/70 border-2 border-brandYellow px-3 py-2 flex flex-col items-end pointer-events-none shadow-[0_0_20px_rgba(255,230,92,0.5)]"><span className="text-[9px] text-brandYellow/70 uppercase tracking-widest">BÓNUS PONTOS</span><span className="text-sm text-brandYellow font-black animate-pulse">×2 ATIVO</span></div>}
          {speedBoosted && <div className="font-mono bg-black/70 border-2 border-[#00cfff] px-3 py-2 flex flex-col items-end pointer-events-none shadow-[0_0_20px_rgba(0,207,255,0.6)]"><span className="text-[9px] text-[#00cfff]/70 uppercase tracking-widest">{comboCount>=5?'MODO DEUS ×3':'INTOCÁVEL'}</span><span className="text-sm text-[#00cfff] font-black animate-pulse">INVENCÍVEL ⚡</span></div>}
          {magnetActive && <div className="font-mono bg-black/70 border-2 border-[#ff44aa] px-3 py-2 flex flex-col items-end pointer-events-none shadow-[0_0_20px_rgba(255,68,170,0.6)]"><span className="text-[9px] text-[#ff44aa]/70 uppercase tracking-widest">ÍMAN DE CRISTAIS</span><span className="text-sm text-[#ff44aa] font-black animate-pulse">A PUXAR ✦</span></div>}
          {timeSlow && <div className="font-mono bg-black/70 border-2 border-[#4488ff] px-3 py-2 flex flex-col items-end pointer-events-none shadow-[0_0_20px_rgba(68,136,255,0.6)]"><span className="text-[9px] text-[#4488ff]/70 uppercase tracking-widest">CRISTAL DO TEMPO</span><span className="text-sm text-[#4488ff] font-black animate-pulse">⏱ MUNDO LENTO</span></div>}
          {ghostMode && <div className="font-mono bg-black/70 border-2 border-white px-3 py-2 flex flex-col items-end pointer-events-none shadow-[0_0_20px_rgba(255,255,255,0.4)]"><span className="text-[9px] text-white/60 uppercase tracking-widest">CRISTAL FANTASMA</span><span className="text-sm text-white font-black animate-pulse">👻 INTOCÁVEL</span></div>}
          {mirrorMode && <div className="font-mono bg-black/70 border-2 border-[#aaaacc] px-3 py-2 flex flex-col items-end pointer-events-none shadow-[0_0_20px_rgba(170,170,204,0.5)]"><span className="text-[9px] text-[#aaaacc]/70 uppercase tracking-widest">ESPELHO ATIVO</span><span className="text-sm text-[#aaaacc] font-black animate-pulse">🪞 INVERTIDO</span></div>}
          {floatMode && <div className="font-mono bg-black/70 border-2 border-[#ff44ff] px-3 py-2 flex flex-col items-end pointer-events-none shadow-[0_0_20px_rgba(255,68,255,0.6)]"><span className="text-[9px] text-[#ff44ff]/70 uppercase tracking-widest">FLUTUAR — {stateRef.current.ouroModeAirCrystals}/11 AR</span><span className="text-sm text-[#ff44ff] font-black animate-pulse">✨ SALTO INFINITO</span></div>}
          {easterEggMode === 'ouro' && <div className="font-mono bg-black/70 border-2 border-[#ffd700] px-3 py-2 flex flex-col items-end pointer-events-none shadow-[0_0_30px_rgba(255,215,0,0.8)]"><span className="text-[9px] text-[#ffd700]/70 uppercase tracking-widest">MODO OURO ×5</span><span className="text-sm text-[#ffd700] font-black animate-pulse">✨ PONTOS AUTO + RECARGA</span></div>}
          {easterEggMode === 'ghost_run' && <div className="font-mono bg-black/70 border-2 border-white px-3 py-2 flex flex-col items-end pointer-events-none shadow-[0_0_20px_rgba(255,255,255,0.4)]"><span className="text-[9px] text-white/60 uppercase tracking-widest">CORRIDA FANTASMA ×3</span><span className="text-sm text-white font-black animate-pulse">👻 INTOCÁVEL</span></div>}
          {easterEggMode === 'berserker' && <div className="font-mono bg-black/70 border-2 border-red-500 px-3 py-2 flex flex-col items-end pointer-events-none shadow-[0_0_30px_rgba(255,0,0,0.8)]"><span className="text-[9px] text-red-400/70 uppercase tracking-widest">BERSERKER ×4</span><span className="text-sm text-red-400 font-black animate-pulse">🔥 MODO DEUS + RECARGA</span></div>}
          {stateRef.current.doubleTapReady && <div className="font-mono bg-black/70 border-2 border-[#ff8800] px-3 py-2 flex flex-col items-end pointer-events-none"><span className="text-[9px] text-[#ff8800]/70 uppercase tracking-widest">TOQUE DUPLO</span><span className="text-sm text-[#ff8800] font-black animate-pulse">⚡ PRONTO</span></div>}
          {stateRef.current.overchargeReady && <div className="font-mono bg-black/70 border-2 border-yellow-300 px-3 py-2 flex flex-col items-end pointer-events-none"><span className="text-[9px] text-yellow-300/70 uppercase tracking-widest">SOBRECARGA</span><span className="text-sm text-yellow-300 font-black animate-pulse">⚡ PRONTO</span></div>}
          {weatherEvent && <div className="font-mono bg-black/70 border-2 border-gray-500 px-3 py-2 flex flex-col items-end pointer-events-none"><span className="text-[9px] text-gray-400 uppercase tracking-widest">CLIMA</span><span className={`text-sm font-black animate-pulse ${weatherEvent==='blackout'?'text-gray-300':weatherEvent==='storm'?'text-blue-300':'text-orange-400'}`}>{weatherEvent==='blackout'?'🌑 APAGÃO':weatherEvent==='storm'?'⛈ TEMPESTADE':'☀ ERUPÇÃO'}</span></div>}
          {stateRef.current.perks.length > 0 && <div className="font-mono bg-black/70 border border-brandYellow/30 px-3 py-2 flex flex-col items-end pointer-events-none"><span className="text-[9px] text-brandYellow/50 uppercase tracking-widest pb-1">EXTRAS</span>{stateRef.current.perks.map((perk, i) => <span key={i} className="text-[9px] text-brandYellow font-bold uppercase">{perkLabel(perk)}</span>)}</div>}
        </div>
      )}

      {perkDraft && (
        <div className="absolute inset-0 flex items-center justify-center z-40 pointer-events-auto">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div className="relative z-10 flex flex-col items-center gap-6 px-8 max-w-2xl w-full">
            <div className="text-center">
              <span className="text-[10px] text-brandYellow font-mono tracking-[0.4em] uppercase block animate-pulse">// JOGO EM PAUSA — ESCOLHE UM EXTRA //</span>
              <span className="text-xs text-gray-500 font-mono uppercase">{mob ? 'Toca numa carta — o jogo continua já' : 'Carrega 1, 2 ou 3 — o jogo continua já'}</span>
            </div>
            <div className="grid grid-cols-3 gap-4 w-full">
              {perkDraft.map((perk, i) => (
                <div key={i} className="bg-black border-2 border-brandYellow p-4 flex flex-col items-center gap-2 cursor-pointer hover:bg-brandYellow/10 transition-all shadow-[0_0_20px_rgba(255,230,92,0.3)]"
                  onClick={() => { const s=stateRef.current; s.perks.push(perk); s.perkDraftPending=false; setPerkDraft(null); synthRef.current?.playPerkDraft(); }}>
                  <span className="text-brandYellow font-black text-2xl">[{i+1}]</span>
                  <span className="text-white font-mono text-[10px] uppercase tracking-widest text-center leading-relaxed">{perkLabel(perk)}</span>
                  <span className="text-brandRed/60 font-mono text-[9px] uppercase text-center">
                    {PERK_DESC[perk] ?? ''}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {isPlaying && !mob && (
        <div className="absolute bottom-6 left-6 right-6 flex justify-between font-mono text-[10px] tracking-wider text-brandYellow/40 pointer-events-none select-none z-10 uppercase">
          <div className="flex flex-col gap-1 text-left">
            <span>[W] / [↑] — SALTAR  //  [SEGURA ESPAÇO] CARREGAR + [SOLTA] DISPARAR  //  [F] TIRO INSTANTÂNEO</span>
            <span>COMBO ×3 = TIRO LARGO  //  ×5 = TIRO RÁPIDO  //  ABATE DE CHEFE = NOVA</span>
            <span className="text-[#44ddff]/60">ENCADEIA SALTOS PELA ESCADARIA DE CRISTAIS PARA LIMPAR TUDO</span>
          </div>
          <div className="text-right text-brandYellow/50 font-bold"><span>CRISTAIS RESTAURAM ESTABILIDADE // CADEIA NO AR = MULTIPLICADOR</span></div>
        </div>
      )}

      {!isPlaying && !showIntro && (
        <div className={`absolute inset-0 bg-brandBlack flex justify-center z-50 overflow-y-auto ${mob ? 'items-start py-4' : 'items-center'}`}>
          <div className="absolute inset-0 opacity-10 bg-[linear-gradient(rgba(255,78,62,0.3)_1px,transparent_1px)] bg-[size:100%_4px] pointer-events-none" />
          <div className={`w-full max-w-2xl text-left relative z-10 ${mob ? 'px-5 space-y-4 pb-16' : 'px-12 space-y-8'}`}>
            <div className={`border-l-4 border-brandRed ${mob ? 'space-y-1 pl-4' : 'space-y-2 pl-6'}`}>
              <span className="text-xs text-brandRed font-mono tracking-[0.3em] block uppercase opacity-70">// LINHA_DE_VIDA_DO_NÚCLEO_TERMINADA</span>
              <h2><BrandText text="NÚCLEO ESGOTADO" className={`text-brandRed block font-black tracking-tighter leading-none ${mob ? 'text-3xl' : 'text-5xl md:text-6xl'}`} /></h2>
            </div>
            <div className="font-mono text-xs text-gray-400 uppercase leading-relaxed grid grid-cols-1 md:grid-cols-2 gap-6 border border-brandRed/20 p-6 bg-black/60 backdrop-blur-md">
              <div className="space-y-2">
                <p className="text-brandYellow font-bold">RESUMO DA CORRIDA:</p>
                <p>PONTOS: <span className="text-white font-bold">{score.toLocaleString()} PTS</span></p>
                {score >= personalBest && personalBest > 0 && <p className="text-[#1ED760] font-black animate-pulse">🏆 NOVO RECORDE PESSOAL!</p>}
                <p>RECORDE: <span className="text-brandYellow font-bold">{personalBest.toLocaleString()} PTS</span></p>
                <p>CRISTAIS: <span className="text-white font-bold">{crystalCount}</span></p>
                <p>SOBREVIVEU: <span className="text-[#ff44aa] font-bold">{runStreak}s</span></p>
                <p>DISTÂNCIA: <span className="text-white font-bold">{Math.floor(stateRef.current.milesTraveled)} UNIDADES</span></p>
                {stateRef.current.perks.length > 0 && <div className="pt-1"><p className="text-brandYellow/60 text-[10px]">EXTRAS DESTA CORRIDA:</p>{stateRef.current.perks.map((perk, i) => <p key={i} className="text-brandYellow text-[10px]">• {perkLabel(perk)}</p>)}</div>}
              </div>
              <div className="border-t md:border-t-0 md:border-l border-brandYellow/20 pt-4 md:pt-0 md:pl-6 space-y-2">
                <p className="text-brandYellow font-bold">// TOP 3 MELHORES PONTUAÇÕES //</p>
                {leaderboard.map((e, i) => (
                  <div key={i} className="flex justify-between text-[11px] font-mono tracking-tight uppercase">
                    <span className="text-gray-500 font-bold">{i+1}. {e.name}</span>
                    <span className="text-white font-bold">{e.score} PTS</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="pt-2 flex flex-wrap gap-4 items-center">
              <button onClick={reboot} className="bg-brandYellow hover:bg-brandRed text-black font-helvetica font-black py-4 px-10 text-sm uppercase tracking-widest transition-all duration-200 cursor-pointer pointer-events-auto border-none active:scale-95 shadow-[4px_4px_0px_#ff4e3e]">REINICIAR NÚCLEO</button>
              <a href="https://open.spotify.com/artist/4JNKjNlt3rtcIl84NiK4Lr" target="_blank" rel="noopener noreferrer"
                className="bg-[#000] border-[3px] border-[#1ED760] hover:bg-[#1ED760] hover:text-black text-[#1ED760] font-helvetica font-black py-4 px-10 text-base uppercase tracking-widest transition-all duration-200 cursor-pointer pointer-events-auto shadow-[5px_5px_0px_#1ED760] flex items-center gap-3">
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.24 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.84.24 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.6.18-1.2.72-1.38 4.26-1.321 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.56.3z"/></svg>
                SEGUIR NO SPOTIFY
              </a>
            </div>
          </div>
        </div>
      )}

      {/* ---- INTRO / MODE SELECT ---- */}
      {showIntro && (
        <div className={`absolute inset-0 bg-brandBlack flex justify-center z-50 pointer-events-auto overflow-y-auto ${mob ? 'items-start py-4' : 'items-center'}`}>
          <div className="absolute inset-0 opacity-10 bg-[linear-gradient(rgba(255,230,92,0.25)_1px,transparent_1px)] bg-[size:100%_4px] pointer-events-none" />
          <div className={`w-full max-w-xl text-left relative z-10 ${mob ? 'px-5 space-y-4 pb-16' : 'px-10 space-y-7'}`}>
            <div className={`border-l-4 border-brandYellow ${mob ? 'space-y-1 pl-4' : 'space-y-2 pl-6'}`}>
              <span className="text-xs text-brandRed font-mono tracking-[0.3em] block uppercase opacity-70">// NÚCLEO_ARCADE_HARDCORE</span>
              <h2><BrandText text="SIMULAÇÃO INFINITA" className={`text-brandYellow block font-black tracking-tighter leading-none ${mob ? 'text-3xl' : 'text-4xl md:text-5xl'}`} /></h2>
            </div>

            <div className="space-y-3">
              <p className="text-[10px] text-brandYellow/60 font-mono uppercase tracking-widest">// ESCOLHE OS CONTROLOS</p>
              <div className="flex gap-3">
                <button onClick={() => setControlMode('desktop')}
                  className={`flex-1 font-mono uppercase tracking-widest py-3 px-4 border-2 transition-all ${controlMode === 'desktop' ? 'border-brandYellow bg-brandYellow/15 text-brandYellow' : 'border-brandYellow/30 text-brandYellow/50 hover:border-brandYellow/60'}`}>
                  <span className="block text-sm font-black">⌨ COMPUTADOR</span>
                  <span className="block text-[9px] opacity-70 mt-1">TECLADO + RATO</span>
                </button>
                <button onClick={() => setControlMode('mobile')}
                  className={`flex-1 font-mono uppercase tracking-widest py-3 px-4 border-2 transition-all ${controlMode === 'mobile' ? 'border-brandYellow bg-brandYellow/15 text-brandYellow' : 'border-brandYellow/30 text-brandYellow/50 hover:border-brandYellow/60'}`}>
                  <span className="block text-sm font-black">📱 TELEMÓVEL</span>
                  <span className="block text-[9px] opacity-70 mt-1">VIRA O TELEMÓVEL DE LADO</span>
                </button>
              </div>
              <div className="font-mono text-[10px] text-gray-400 uppercase leading-relaxed border border-brandYellow/20 p-4 bg-black/60">
                {controlMode === 'mobile'
                  ? <><p><span className="text-[#ff4e3e] font-bold">LADO ESQUERDO</span> — TOCA PARA DISPARAR, SEGURA PARA CARREGAR + SOLTA</p><p><span className="text-brandYellow font-bold">LADO DIREITO</span> — TOCA PARA SALTAR (TOCA OUTRA VEZ NO AR PARA SALTO DUPLO)</p><p className="text-[#44ddff]/70 pt-1">SEGURA O TELEMÓVEL NA HORIZONTAL PARA A VISTA COMPLETA</p></>
                  : <><p><span className="text-brandYellow font-bold">[W] / [↑]</span> — SALTAR   <span className="text-brandYellow font-bold">[SEGURA ESPAÇO]</span> — CARREGAR + SOLTA PARA DISPARAR</p><p><span className="text-brandYellow font-bold">[F] / CLIQUE</span> — TIRO INSTANTÂNEO</p><p className="text-[#44ddff]/70 pt-1">ENCADEIA SALTOS PELAS ESCADARIAS DE CRISTAIS — CADA CRISTAL DEVOLVE UM SALTO</p></>}
              </div>
            </div>

            <button onClick={startGame}
              className="bg-brandYellow hover:bg-brandRed text-black font-helvetica font-black py-4 px-10 text-base uppercase tracking-widest transition-all duration-200 cursor-pointer pointer-events-auto border-none active:scale-95 shadow-[4px_4px_0px_#ff4e3e]">
              ▶ INICIAR NÚCLEO
            </button>
          </div>
        </div>
      )}

      {/* ---- ROTATE-TO-LANDSCAPE NUDGE (mobile, portrait) ---- */}
      {controlMode === 'mobile' && isPortrait && !ignoreRotate && (
        <div className="absolute inset-0 bg-brandBlack/95 flex flex-col items-center justify-center z-[60] pointer-events-auto text-center px-8">
          <span className="text-6xl animate-pulse mb-6">↻</span>
          <BrandText text="RODA O TELEMÓVEL" className="text-2xl text-brandYellow font-black uppercase tracking-tight" />
          <p className="font-mono text-xs text-gray-400 uppercase tracking-widest mt-3">Vira o telemóvel de lado (horizontal) para a vista completa</p>
          {!showIntro && <p className="font-mono text-[10px] text-[#1ED760]/70 uppercase tracking-widest mt-2">— jogo em pausa —</p>}
          <button onClick={() => setIgnoreRotate(true)}
            className="mt-8 font-mono text-xs uppercase tracking-widest border-2 border-brandYellow/60 text-brandYellow px-6 py-3 hover:bg-brandYellow hover:text-black transition-all pointer-events-auto active:scale-95">
            JOGAR ASSIM MESMO →
          </button>
        </div>
      )}
    </div>

  );
};
