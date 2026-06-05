'use client';

import React, { useEffect, useRef, useState } from 'react';
import { BrandText } from './BrandText';

interface Player {
  x: number;
  y: number;
  width: number;
  height: number;
  vx: number;
  vy: number;
  isGrounded: boolean;
  jumpCount: number;
  stretch: number;
}

interface Platform {
  x: number;
  y: number;
  baseY: number;
  width: number;
  height: number;
  styleType: 'solid' | 'pillar' | 'glitch';
  waveOffset: number;
  isSafeZone?: boolean;
}

interface Crystal {
  x: number;
  y: number;
  size: number;
  collected: boolean;
  pulseOffset: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  alpha: number;
  life: number;
  size: number;
}

interface FloatText {
  id: number;
  text: string;
  x: number;
  y: number;
  vy: number;
  alpha: number;
  life: number;
}

interface MatrixColumn {
  x: number;
  y: number;
  speed: number;
  chars: string[];
}

interface BannerText {
  text: string;
  x: number;
  y: number;
  speed: number;
  size: number;
  alpha: number;
  driftY: number;
}

// --- AUDIO TRACK MAP ---
// 17 levels split across 4 tracks evenly
const TRACK_AUDIO_MAP: Record<number, { file: string; name: string }> = {
  1:  { file: '/audio/01-ouro.mp3',           name: 'Ouro' },
  2:  { file: '/audio/01-ouro.mp3',           name: 'Ouro' },
  3:  { file: '/audio/01-ouro.mp3',           name: 'Ouro' },
  4:  { file: '/audio/01-ouro.mp3',           name: 'Ouro' },
  5:  { file: '/audio/02-melhores-dias.mp3',  name: 'Melhores Dias' },
  6:  { file: '/audio/02-melhores-dias.mp3',  name: 'Melhores Dias' },
  7:  { file: '/audio/02-melhores-dias.mp3',  name: 'Melhores Dias' },
  8:  { file: '/audio/02-melhores-dias.mp3',  name: 'Melhores Dias' },
  9:  { file: '/audio/07-dilema.mp3',         name: 'Dilema' },
  10: { file: '/audio/07-dilema.mp3',         name: 'Dilema' },
  11: { file: '/audio/07-dilema.mp3',         name: 'Dilema' },
  12: { file: '/audio/07-dilema.mp3',         name: 'Dilema' },
  13: { file: '/audio/14-jazzadelica.mp3',    name: 'Jazzadelica' },
  14: { file: '/audio/14-jazzadelica.mp3',    name: 'Jazzadelica' },
  15: { file: '/audio/14-jazzadelica.mp3',    name: 'Jazzadelica' },
  16: { file: '/audio/14-jazzadelica.mp3',    name: 'Jazzadelica' },
  17: { file: '/audio/14-jazzadelica.mp3',    name: 'Jazzadelica' },
};

export const GameCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [score, setScore] = useState<number>(0);
  const [currentTrack, setCurrentTrack] = useState<number>(1);
  const [trackTransition, setTrackTransition] = useState<boolean>(false);
  const [floatTexts, setFloatTexts] = useState<FloatText[]>([]);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [toastActive, setToastActive] = useState<boolean>(false);
  const [toastText, setToastText] = useState<string>('');
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [nowPlayingName, setNowPlayingName] = useState<string>('Ouro');

  const [hasLevelFiveCheckpoint, setHasLevelFiveCheckpoint] = useState<boolean>(false);
  const [hasLevelTenCheckpoint, setHasLevelTenCheckpoint] = useState<boolean>(false);

  const [isTrackThreeMilestone, setIsTrackThreeMilestone] = useState<boolean>(false);
  const [isLevelFiveMilestone, setIsLevelFiveMilestone] = useState<boolean>(false);
  const [isLevelTenMilestone, setIsLevelTenMilestone] = useState<boolean>(false);
  const [isAlbumCleared, setIsAlbumCleared] = useState<boolean>(false);

  const textIdCounter = useRef(0);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // --- MUSIC PLAYER REFS ---
  const musicRef = useRef<HTMLAudioElement | null>(null);
  const currentAudioFileRef = useRef<string>('');
  const isMutedRef = useRef<boolean>(false);

  const DEFAULT_PLAYER_WIDTH = 38;
  const DEFAULT_PLAYER_HEIGHT = 52;

  const stateRef = useRef({
    player: { x: 140, y: 300, width: DEFAULT_PLAYER_WIDTH, height: DEFAULT_PLAYER_HEIGHT, vx: 0, vy: 0, isGrounded: false, jumpCount: 0, stretch: 1 } as Player,
    platforms: [] as Platform[],
    crystals: [] as Crystal[],
    particles: [] as Particle[],
    floatTexts: [] as FloatText[],
    matrixColumns: [] as MatrixColumn[],
    bannerTexts: [] as BannerText[],
    gameTicks: 0,
    keys: { ArrowUp: false, Space: false, KeyW: false },
    baseSpeed: 5.2,
    difficultyModifier: 1,
    scoreAccumulator: 0,
    lastTime: 0,
    fpsInterval: 1000 / 60,
    screenFlash: 0,
    milesTraveled: 0,
    comboCount: 0,
    crystalsCaughtTotal: 0,
    coyoteCounter: 0,
    jumpBufferCounter: 0,
    trackSeventeenCrystals: 0,
    warpToast: {
      active: false,
      text: '',
      life: 0,
      maxLife: 90,
      y: 0
    }
  });

  const feedbackWords = ['SOUL', 'ALMA', 'DOBRO', 'OURO', 'RAW', 'WILD', 'ENERGY', 'DISSENT', 'ENTROPY'];
  const milestonePhrases = ['MATRIX TUNED', 'ALMA LINKED', 'CHEF LEVEL UP', 'SOVEREIGN CORE', 'ENTROPY STABLE'];

  // --- MUSIC CONTROL FUNCTIONS ---
  const playMusicForTrack = (trackNum: number, fadein = false) => {
    const entry = TRACK_AUDIO_MAP[trackNum];
    if (!entry) return;

    // Same song already playing — don't restart
    if (currentAudioFileRef.current === entry.file && musicRef.current && !musicRef.current.paused) {
      return;
    }

    // Fade out current if playing
    if (musicRef.current && !musicRef.current.paused) {
      const old = musicRef.current;
      const fadeOut = setInterval(() => {
        if (old.volume > 0.05) {
          old.volume = Math.max(0, old.volume - 0.05);
        } else {
          clearInterval(fadeOut);
          old.pause();
          old.src = '';
        }
      }, 40);
    }

    const audio = new Audio(entry.file);
    audio.loop = true;
    audio.volume = fadein ? 0 : (isMutedRef.current ? 0 : 1);
    musicRef.current = audio;
    currentAudioFileRef.current = entry.file;
    setNowPlayingName(entry.name);

    audio.play().catch(() => {
      // Autoplay blocked — user gesture needed, will retry on next interaction
    });

    if (fadein && !isMutedRef.current) {
      const fadeIn = setInterval(() => {
        if (audio.volume < 0.95) {
          audio.volume = Math.min(1, audio.volume + 0.04);
        } else {
          audio.volume = 1;
          clearInterval(fadeIn);
        }
      }, 40);
    }
  };

  const stopMusic = (fade = true) => {
    if (!musicRef.current) return;
    if (!fade) {
      musicRef.current.pause();
      return;
    }
    const audio = musicRef.current;
    const fadeOut = setInterval(() => {
      if (audio.volume > 0.05) {
        audio.volume = Math.max(0, audio.volume - 0.05);
      } else {
        clearInterval(fadeOut);
        audio.pause();
      }
    }, 40);
  };

  const toggleMute = () => {
    const next = !isMutedRef.current;
    isMutedRef.current = next;
    setIsMuted(next);
    if (musicRef.current) {
      musicRef.current.volume = next ? 0 : 1;
    }
  };

  // Start music when game begins / track changes
  useEffect(() => {
    if (isPlaying && !isAlbumCleared) {
      playMusicForTrack(currentTrack, true);
    }
  }, [currentTrack, isPlaying]);

  // Stop music on game over or album cleared
  useEffect(() => {
    if (!isPlaying || isAlbumCleared) {
      stopMusic(true);
    }
  }, [isPlaying, isAlbumCleared]);

  // Retry music on click (unblock autoplay)
  const handleCanvasClick = () => {
    if (audioCtxRef.current?.state === 'suspended') audioCtxRef.current.resume();
    if (musicRef.current && musicRef.current.paused && isPlaying && !isAlbumCleared) {
      musicRef.current.play().catch(() => {});
    }
  };

  const getRequiredScoreForClear = (track: number) => {
    if (track <= 5) return 500;
    if (track === 17) return 1700;
    return 700;
  };

  const playSynthSound = (frequency: number, type: OscillatorType, duration: number, volume: number) => {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') ctx.resume();

      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gainNode = ctx.createGain();

      osc.type = type === 'sawtooth' || type === 'square' ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(frequency, ctx.currentTime);

      if (frequency > 400) {
        osc.frequency.exponentialRampToValueAtTime(frequency * 1.3, ctx.currentTime + duration);
      } else {
        osc.frequency.exponentialRampToValueAtTime(frequency * 0.4, ctx.currentTime + duration);
      }

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(frequency * 2, ctx.currentTime);
      filter.frequency.exponentialRampToValueAtTime(frequency * 0.8, ctx.currentTime + duration);
      filter.Q.setValueAtTime(1.5, ctx.currentTime);

      gainNode.gain.setValueAtTime(0.001, ctx.currentTime);
      gainNode.gain.linearRampToValueAtTime(volume * 0.8, ctx.currentTime + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);

      osc.connect(filter);
      filter.connect(gainNode);
      gainNode.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch (e) {
      console.warn('Audio synthesis node failure:', e);
    }
  };

  const triggerGlitchWarpToast = (forcedText: string) => {
    const state = stateRef.current;
    state.warpToast.active = true;
    state.warpToast.text = forcedText;
    state.warpToast.life = state.warpToast.maxLife;
    state.warpToast.y = window.innerHeight * 0.22;
    playSynthSound(480, 'sawtooth', 0.25, 0.18);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const state = stateRef.current;

    const initializeMatrixRain = () => {
      state.matrixColumns = [];
      const columnsCount = Math.floor(canvas.width / 24);
      for (let i = 0; i < columnsCount; i++) {
        const charsArr = [];
        const length = Math.floor(Math.random() * 15) + 8;
        for (let j = 0; j < length; j++) {
          charsArr.push(Math.random() > 0.5 ? '1' : '0');
        }
        state.matrixColumns.push({
          x: i * 24, y: Math.random() * -canvas.height,
          speed: Math.random() * 4 + 2, chars: charsArr
        });
      }
    };

    initializeMatrixRain();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const state = stateRef.current;

    const spawnBannerText = () => {
      let wordsPool = ['THE COOKBOOK', 'CHEF MODE', 'RAW OUTPUT', 'OURO ARCHIVE'];
      if (currentTrack >= 3) wordsPool = ['DROOPY SOUL', 'WILD CORES', 'BROKEN AESTHETIC', 'DISSENT ENGINE'];
      if (currentTrack >= 5) wordsPool = ['SOVEREIGNTY', 'QUANTITY FOR SOVEREIGNTY', 'ANTI-SANITIZATION', 'TROJAN HORSE'];
      if (currentTrack >= 13) wordsPool = ['FINAL MILESTONE', 'ALMA SYNC STABLE', 'MAXIMUM ENERGY', 'SOVEREIGN CORE'];

      state.bannerTexts.push({
        text: wordsPool[Math.floor(Math.random() * wordsPool.length)],
        x: canvas.width + 150,
        y: Math.random() * (canvas.height * 0.5) + 120,
        speed: Math.random() * 2 + 1,
        size: Math.floor(Math.random() * 50) + 50,
        alpha: Math.random() * 0.04 + 0.02,
        driftY: (Math.random() - 0.5) * 0.3
      });
    };

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      state.bannerTexts = [];
      for (let i = 0; i < 3; i++) spawnBannerText();
    };

    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    const resetLevelLayout = () => {
      state.platforms = [
        { x: 0, y: canvas.height - 180, baseY: canvas.height - 180, width: 950, height: 600, styleType: 'solid', waveOffset: 0, isSafeZone: true },
      ];
      state.crystals = [
        { x: 450, y: canvas.height - 210, size: 24, collected: false, pulseOffset: 0 },
        { x: 700, y: canvas.height - 210, size: 24, collected: false, pulseOffset: 1 }
      ];
      state.particles = [];
      state.floatTexts = [];
      state.comboCount = 0;
      state.crystalsCaughtTotal = 0;
      state.coyoteCounter = 0;
      state.jumpBufferCounter = 0;
      state.trackSeventeenCrystals = 0;
      state.warpToast.active = false;
    };

    if (state.gameTicks === 0 && isPlaying) {
      resetLevelLayout();
    }

    const injectSafeZoneCheckpoint = () => {
      state.platforms = [];
      state.crystals = [];

      const targetY = canvas.height - 200;

      state.player.x = 140;
      state.player.y = targetY - state.player.height - 20;
      state.player.vy = 0;
      state.player.isGrounded = true;

      state.platforms.push({
        x: 0, y: targetY, baseY: targetY,
        width: canvas.width + 400, height: 600,
        styleType: 'solid', waveOffset: 0, isSafeZone: true
      });

      for (let i = 0; i < 2; i++) {
        state.crystals.push({
          x: 500 + (i * 250), y: targetY - 50,
          size: 24, collected: false, pulseOffset: i
        });
      }
    };

    const executePlayerJumpInput = () => {
      const p = state.player;
      if (p.isGrounded || state.coyoteCounter > 0) {
        p.vy = -14.6; p.isGrounded = false; p.jumpCount = 1; p.stretch = 1.35;
        state.coyoteCounter = 0; state.jumpBufferCounter = 0;
        spawnParticleBurst(p.x + p.width / 2, p.y + p.height, '#ff4e3e', 15, 3);
        playSynthSound(160, 'square', 0.12, 0.15);
      } else if (p.jumpCount === 1) {
        p.vy = -12.4; p.jumpCount = 2; p.stretch = 1.45;
        state.jumpBufferCounter = 0;
        spawnParticleBurst(p.x + p.width / 2, p.y + p.height / 2, '#ffe65c', 25, 4);
        triggerTextFeedback(p.x, p.y - 20, 'DOUBLE JUMP');
        playSynthSound(240, 'square', 0.15, 0.12);
      } else if (p.jumpCount === 2 && !p.isGrounded) {
        p.vy = 18.5; p.jumpCount = 3; state.jumpBufferCounter = 0;
        spawnParticleBurst(p.x + p.width / 2, p.y, '#ffffff', 18, 5);
        triggerTextFeedback(p.x, p.y - 20, 'GRAVITY DROP');
        playSynthSound(90, 'sawtooth', 0.2, 0.25);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isPlaying || isAlbumCleared) return;

      // Mute toggle
      if (e.code === 'KeyM') {
        toggleMute();
        return;
      }

      if (e.code === 'Digit1') {
        setCurrentTrack(1); setScore(0); state.scoreAccumulator = 0; state.trackSeventeenCrystals = 0; injectSafeZoneCheckpoint();
        playSynthSound(300, 'sine', 0.2, 0.2); return;
      }
      if (e.code === 'Digit3') {
        setCurrentTrack(3); setScore(1000); state.scoreAccumulator = 0; state.trackSeventeenCrystals = 0; injectSafeZoneCheckpoint();
        setIsTrackThreeMilestone(true); setTimeout(() => setIsTrackThreeMilestone(false), 2000);
        playSynthSound(350, 'sine', 0.2, 0.2); return;
      }
      if (e.code === 'Digit5') {
        setCurrentTrack(5); setScore(2200); state.scoreAccumulator = 0; state.trackSeventeenCrystals = 0; injectSafeZoneCheckpoint();
        setHasLevelFiveCheckpoint(true); setIsLevelFiveMilestone(true); setTimeout(() => setIsLevelFiveMilestone(false), 2200);
        playSynthSound(400, 'sine', 0.2, 0.2); return;
      }
      if (e.code === 'Digit0') {
        setCurrentTrack(10); setScore(5700); state.scoreAccumulator = 0; state.trackSeventeenCrystals = 0; injectSafeZoneCheckpoint();
        setHasLevelTenCheckpoint(true); setIsLevelTenMilestone(true); setTimeout(() => setIsLevelTenMilestone(false), 2400);
        playSynthSound(450, 'sine', 0.2, 0.2); return;
      }
      if (e.code === 'Digit6') {
        setCurrentTrack(15); setScore(9200); state.scoreAccumulator = 0; state.trackSeventeenCrystals = 0; injectSafeZoneCheckpoint();
        triggerTextFeedback(140, 200, 'THE FINAL 3');
        playSynthSound(500, 'sine', 0.25, 0.25); return;
      }
      if (e.code === 'Digit9') {
        setCurrentTrack(17); setScore(10600); state.scoreAccumulator = 1600; state.trackSeventeenCrystals = 16; injectSafeZoneCheckpoint();
        triggerTextFeedback(140, 200, 'FINALE APEX');
        playSynthSound(600, 'sine', 0.3, 0.3); return;
      }

      if (['ArrowUp', ' ', 'KeyW'].includes(e.code)) {
        state.jumpBufferCounter = 6;
        executePlayerJumpInput();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (['ArrowUp', ' ', 'KeyW'].includes(e.code)) {
        if (e.code === 'Space') state.keys.Space = false;
        if (e.code === 'ArrowUp') state.keys.ArrowUp = false;
        if (e.code === 'KeyW') state.keys.KeyW = false;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    const spawnParticleBurst = (x: number, y: number, color: string, count: number, force: number) => {
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * force + 1.5;
        state.particles.push({
          x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
          color, alpha: 1, life: Math.random() * 25 + 15, size: Math.random() * 3.5 + 1
        });
      }
    };

    const triggerTextFeedback = (x: number, y: number, forcedWord?: string) => {
      const word = forcedWord || feedbackWords[Math.floor(Math.random() * feedbackWords.length)];
      textIdCounter.current++;
      state.floatTexts.push({
        id: textIdCounter.current,
        text: word, x, y, vy: -2.5 - Math.random() * 2, alpha: 1, life: 45
      });
    };

    let animationFrameId: number;
    state.lastTime = performance.now();

    const updatePhysics = () => {
      if (!isPlaying || isAlbumCleared) return;

      if (state.warpToast.active) {
        state.warpToast.life--;
        if (state.warpToast.life <= 0) state.warpToast.active = false;
      }

      if (trackTransition || isTrackThreeMilestone || isLevelFiveMilestone || isLevelTenMilestone) {
        state.particles.forEach(part => { part.x += part.vx; part.y += part.vy; part.life--; part.alpha = Math.max(0, part.life / 25); });
        state.particles = state.particles.filter(part => part.life > 0);

        const p = state.player;
        p.vy += 0.74;
        if (p.vy > 19) p.vy = 19;
        p.y += p.vy;

        state.platforms.forEach(plat => {
          if (p.x + p.width > plat.x && p.x < plat.x + plat.width && p.y + p.height >= plat.y && p.y + p.height - p.vy <= plat.y + 18) {
            p.y = plat.y - p.height; p.vy = 0; p.isGrounded = true; p.jumpCount = 0;
          }
        });
        return;
      }

      state.gameTicks++;

      const speedClampIndex = Math.min(12, currentTrack);
      state.difficultyModifier = 1 + (speedClampIndex - 1) * 0.07;
      const currentSpeed = state.baseSpeed * state.difficultyModifier;
      const p = state.player;

      state.milesTraveled += currentSpeed * 0.025;
      if (state.screenFlash > 0) state.screenFlash -= 0.08;

      if (state.jumpBufferCounter > 0) state.jumpBufferCounter--;
      if (p.isGrounded) {
        state.coyoteCounter = 5;
      } else {
        if (state.coyoteCounter > 0) state.coyoteCounter--;
      }

      if (state.gameTicks % 140 === 0 && state.bannerTexts.length < 5) spawnBannerText();
      state.bannerTexts.forEach(b => { b.x -= currentSpeed * 0.2 + b.speed; b.y += b.driftY; });
      state.bannerTexts = state.bannerTexts.filter(b => b.x > -500);

      state.matrixColumns.forEach(col => {
        col.y += col.speed;
        if (col.y > canvas.height) col.y = Math.random() * -150 - 50;
      });

      state.platforms.forEach(plat => {
        if (!trackTransition) {
          plat.x -= p.vx;
        }

        if (currentTrack >= 3 && !plat.isSafeZone) {
          const oscillationFactor = currentTrack === 17 ? 0.032 : (currentTrack >= 13 ? 0.025 : 0.014);
          const waveSpeed = oscillationFactor + (currentTrack * 0.003);
          const waveAmplitude = Math.min(130, 10 + (currentTrack * 6));

          const oldY = plat.y;
          plat.y = plat.baseY + Math.sin(state.gameTicks * waveSpeed + plat.waveOffset) * waveAmplitude;

          if (p.isGrounded && p.x + p.width > plat.x && p.x < plat.x + plat.width && Math.abs((p.y + p.height) - oldY) < 4) {
            p.y += (plat.y - oldY);
          }
        }
      });

      p.vy += 0.76;
      if (p.vy > 20) p.vy = 20;
      p.y += p.vy;
      p.vx = currentSpeed;

      p.stretch += (1 - p.stretch) * 0.15;
      if (!p.isGrounded && Math.abs(p.vy) > 2) {
        p.stretch = 1 + Math.abs(p.vy) * 0.025;
      }

      let platformUnderneath = false;
      for (const plat of state.platforms) {
        if (
          p.x + p.width > plat.x && p.x < plat.x + plat.width &&
          p.y + p.height >= plat.y && p.y + p.height - p.vy <= plat.y + 18
        ) {
          if (!p.isGrounded && p.vy > 5) {
            p.stretch = 0.7;
            spawnParticleBurst(p.x + p.width / 2, plat.y, '#ff4e3e', 10, 2.5);
          }
          p.y = plat.y - p.height;
          p.vy = 0;
          p.isGrounded = true;
          p.jumpCount = 0;
          state.comboCount = 0;
          platformUnderneath = true;

          if (state.jumpBufferCounter > 0) {
            executePlayerJumpInput();
          }
        }
      }
      if (!platformUnderneath) p.isGrounded = false;

      if (p.y > canvas.height) {
        setIsPlaying(false);
        playSynthSound(110, 'sawtooth', 0.5, 0.3);
        return;
      }

      state.crystals.forEach(cryst => {
        if (!trackTransition) {
          cryst.x -= p.vx;
        }

        if (!cryst.collected &&
          p.x < cryst.x + cryst.size && p.x + p.width > cryst.x &&
          p.y < cryst.y + cryst.size && p.y + p.height > cryst.y) {
          cryst.collected = true;
          state.scoreAccumulator += 100; state.screenFlash = 0.35;
          setScore(prev => prev + 100);

          state.comboCount++;
          state.crystalsCaughtTotal++;

          if (currentTrack === 17) {
            state.trackSeventeenCrystals++;
          }

          spawnParticleBurst(cryst.x + cryst.size / 2, cryst.y + cryst.size / 2, '#ffe65c', 25, 5);
          playSynthSound(520 + (state.comboCount * 60), 'sine', 0.08, 0.15);

          if (currentTrack === 17) {
            if (state.trackSeventeenCrystals === 5) triggerGlitchWarpToast("CHEF CRANKING THE HEAT");
            else if (state.trackSeventeenCrystals === 10) triggerGlitchWarpToast("BRAND SOVEREIGNTY SECURED");
            else if (state.trackSeventeenCrystals === 15) triggerGlitchWarpToast("TROJAN HORSE BREACH");
            else if (state.trackSeventeenCrystals === 16) triggerGlitchWarpToast("TRANSMITTING MAXIMUM DISSENT...");
          } else {
            if (state.crystalsCaughtTotal % 5 === 0) {
              if (currentTrack === 3) triggerGlitchWarpToast("LIQUID REBEL_ DETECTED");
              else if (currentTrack === 6) triggerGlitchWarpToast("QUANTITY_ FOR_ SOVEREIGNTY");
              else if (currentTrack === 10) triggerGlitchWarpToast("ENTROPY RESIST_ DEPLOYED");
              else if (currentTrack === 14) triggerGlitchWarpToast("THE COOKBOOK ACQUISITION");
              else {
                setToastText(milestonePhrases[Math.floor(Math.random() * milestonePhrases.length)]);
                setToastActive(true);
                setTimeout(() => setToastActive(false), 1400);
              }
            }
          }

          if (state.comboCount >= 2) {
            triggerTextFeedback(cryst.x, cryst.y - 30, `COMBO x${state.comboCount}`);
          } else {
            triggerTextFeedback(cryst.x, cryst.y - 15);
          }

          const requiredTarget = getRequiredScoreForClear(currentTrack);
          if (state.scoreAccumulator >= requiredTarget) {
            state.scoreAccumulator = 0;
            const nextTrackIndex = currentTrack + 1;

            if (currentTrack === 17) {
              setIsAlbumCleared(true);
              playSynthSound(180, 'sine', 1.2, 0.35);
              return;
            }

            setCurrentTrack(nextTrackIndex);
            injectSafeZoneCheckpoint();
            playSynthSound(440, 'triangle', 0.4, 0.2);

            if (nextTrackIndex === 3) {
              setIsTrackThreeMilestone(true);
              setTimeout(() => setIsTrackThreeMilestone(false), 2000);
            } else if (nextTrackIndex === 5) {
              setHasLevelFiveCheckpoint(true);
              setIsLevelFiveMilestone(true);
              setTimeout(() => setIsLevelFiveMilestone(false), 2200);
            } else if (nextTrackIndex === 10) {
              setHasLevelTenCheckpoint(true);
              setIsLevelTenMilestone(true);
              setTimeout(() => setIsLevelTenMilestone(false), 2400);
            } else {
              setTrackTransition(true);
              setTimeout(() => setTrackTransition(false), 1500);
            }
          }
        }
      });

      if (trackTransition || isTrackThreeMilestone || isLevelFiveMilestone || isLevelTenMilestone) return;

      state.platforms = state.platforms.filter(plat => plat.x + plat.width > -120);
      state.crystals = state.crystals.filter(cryst => cryst.x > -50);

      if (state.platforms.length < 6) {
        const lastPlat = state.platforms[state.platforms.length - 1];
        let platformStyle: 'solid' | 'pillar' | 'glitch' = 'solid';

        let minAllowedWidth = currentTrack === 17 ? 150 : (currentTrack >= 15 ? 200 : 260);
        let maxAllowedWidth = currentTrack === 17 ? 250 : (currentTrack >= 15 ? 300 : 380);
        let gapSize = currentTrack === 17 ? Math.random() * 40 + 120 : (currentTrack >= 15 ? Math.random() * 40 + 95 : Math.random() * 80 + 90);

        let nextWidth = Math.random() * (maxAllowedWidth - minAllowedWidth) + minAllowedWidth;

        if (currentTrack >= 5 && currentTrack < 12) {
          platformStyle = Math.random() > 0.4 ? 'pillar' : 'solid';
          if (platformStyle === 'pillar') nextWidth = Math.random() * 50 + 240;
        } else if (currentTrack >= 12) {
          platformStyle = Math.random() > 0.45 ? 'glitch' : 'pillar';
          if (currentTrack < 15) nextWidth = Math.random() * 60 + 240;
        }

        const nextX = lastPlat.x + lastPlat.width + gapSize;

        let maxVerticalShift = 20;
        if (currentTrack >= 3) {
          const heightScalingFactor = currentTrack === 17 ? 12 : 10;
          const baseHeightShift = currentTrack === 17 ? 70 : 50;
          const progressiveClimbMultiplier = currentTrack * heightScalingFactor;
          maxVerticalShift = Math.min(190, baseHeightShift + progressiveClimbMultiplier);
        }

        const verticalDirection = Math.random() > 0.45 ? 1 : -1;
        const nextBaseY = Math.max(
          canvas.height - 480,
          Math.min(canvas.height - 180, lastPlat.baseY + (Math.random() * maxVerticalShift * verticalDirection))
        );

        state.platforms.push({
          x: nextX, y: nextBaseY, baseY: nextBaseY,
          width: nextWidth, height: 600, styleType: platformStyle,
          waveOffset: Math.random() * Math.PI * 2
        });

        if (Math.random() > 0.25) {
          const targetCrystalHeight = (currentTrack <= 3) ? 45 : 50 + Math.random() * 40;
          state.crystals.push({
            x: nextX + nextWidth / 2 - 12,
            y: nextBaseY - targetCrystalHeight,
            size: 24,
            collected: false,
            pulseOffset: Math.random() * Math.PI * 2
          });
        }
      }

      state.particles.forEach(part => { part.x += part.vx; part.y += part.vy; part.life--; part.alpha = Math.max(0, part.life / 25); });
      state.particles = state.particles.filter(part => part.life > 0);
      state.floatTexts.forEach(txt => { txt.y += txt.vy; txt.life--; txt.alpha = Math.max(0, txt.life / 45); });
      state.floatTexts = state.floatTexts.filter(txt => txt.life > 0);

      if (state.gameTicks % 3 === 0) setFloatTexts([...state.floatTexts]);
    };

    const drawCanvas = () => {
      const stateData = stateRef.current;

      let primaryColor = '#ff4e3e';
      let secondaryColor = '#ffe65c';
      let bgColor = '#000000';
      let glitchPhase = false;

      if (currentTrack >= 3 && currentTrack < 5) {
        primaryColor = '#ff4e3e'; secondaryColor = '#ffe65c';
      } else if (currentTrack >= 5 && currentTrack < 9) {
        primaryColor = '#ffe65c'; secondaryColor = '#ff4e3e';
      } else if (currentTrack >= 9 && currentTrack < 13) {
        primaryColor = '#ffffff'; secondaryColor = '#ff4e3e'; bgColor = '#0b0000';
      } else if (currentTrack >= 13) {
        glitchPhase = true;
        primaryColor = stateData.gameTicks % 8 < 4 ? '#ff4e3e' : '#ffe65c';
        secondaryColor = stateData.gameTicks % 4 < 2 ? '#ffffff' : '#000000';
        bgColor = stateData.gameTicks % 30 === 0 ? '#150000' : '#000000';
      }

      ctx.save();

      if (currentTrack >= 3) {
        const driftOffset = Math.sin(stateData.gameTicks * 0.01) * 15;
        ctx.translate(driftOffset, 0);
      }

      if (glitchPhase && stateData.gameTicks % 15 < 3) ctx.translate((Math.random() - 0.5) * 12, 0);

      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      if (stateData.screenFlash > 0) {
        ctx.fillStyle = `rgba(255, 78, 62, ${stateData.screenFlash * 0.12})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      ctx.save();
      const gridOpacity = currentTrack >= 3 ? 0.09 : 0.04;
      ctx.strokeStyle = glitchPhase ? 'rgba(255, 78, 62, 0.1)' : `rgba(255, 78, 62, ${gridOpacity})`;
      ctx.lineWidth = currentTrack >= 3 ? 2.0 : 1.5;
      const perspectiveHorizon = canvas.height * 0.35;
      for (let i = -200; i < canvas.width + 200; i += 70) {
        ctx.beginPath(); ctx.moveTo(i, canvas.height); ctx.lineTo(canvas.width / 2 + (i - canvas.width / 2) * 0.08, perspectiveHorizon); ctx.stroke();
      }
      ctx.restore();

      if (stateData.milesTraveled < 500) {
        ctx.save();
        ctx.font = '900 28px "Helvetica Neue", Arial, sans-serif';
        ctx.fillStyle = secondaryColor;
        ctx.textAlign = 'center';
        ctx.fillText('CATCH THE CRYSTALS TO CLEAR THE LEVELS', canvas.width / 2, canvas.height * 0.28);
        ctx.restore();
      }

      ctx.save();
      stateData.bannerTexts.forEach(b => {
        ctx.font = `900 ${b.size}px "Helvetica Neue", sans-serif`;
        ctx.fillStyle = `rgba(255, 78, 62, ${glitchPhase ? b.alpha * 2.5 : b.alpha})`;
        ctx.fillText(b.text, b.x, b.y);
      });
      ctx.restore();

      ctx.save();
      ctx.font = '900 14vw "Helvetica Neue", sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = currentTrack >= 9 ? 'rgba(255, 78, 62, 0.025)' : 'rgba(255, 78, 62, 0.04)';
      const milesString = String(Math.floor(stateData.milesTraveled)).padStart(4, '0');
      ctx.fillText(milesString, canvas.width / 2, canvas.height / 2);
      ctx.restore();

      ctx.save();
      ctx.fillStyle = 'rgba(255, 78, 62, 0.12)';
      ctx.font = '13px monospace';
      stateData.matrixColumns.forEach(col => {
        col.chars.forEach((char, index) => {
          const charY = col.y + index * 18;
          if (charY > 0 && charY < canvas.height) {
            if (index === col.chars.length - 1) { ctx.fillStyle = secondaryColor; }
            else { ctx.fillStyle = `rgba(255, 78, 62, ${0.1 + (index / col.chars.length) * 0.35})`; }
            ctx.fillText(char, col.x, charY);
          }
        });
      });
      ctx.restore();

      stateData.platforms.forEach(plat => {
        ctx.fillStyle = primaryColor;
        ctx.fillRect(plat.x, plat.y, plat.width, plat.height);
        ctx.fillStyle = secondaryColor;
        ctx.fillRect(plat.x, plat.y, plat.width, 5);
      });

      stateData.crystals.forEach(cryst => {
        if (cryst.collected) return;
        const floatY = Math.sin(stateData.gameTicks * 0.1 + cryst.pulseOffset) * 8;
        ctx.save();
        ctx.translate(cryst.x + cryst.size / 2, cryst.y + cryst.size / 2 + floatY);
        ctx.rotate((stateData.gameTicks * 0.04));
        ctx.fillStyle = secondaryColor;
        ctx.beginPath();
        ctx.moveTo(0, -cryst.size / 2); ctx.lineTo(cryst.size / 2, 0);
        ctx.lineTo(0, cryst.size / 2); ctx.lineTo(-cryst.size / 2, 0);
        ctx.closePath(); ctx.fill();
        ctx.restore();
      });

      stateData.particles.forEach(part => {
        ctx.save(); ctx.globalAlpha = part.alpha; ctx.fillStyle = part.color;
        ctx.fillRect(part.x, part.y, part.size, part.size); ctx.restore();
      });

      const p = stateData.player;
      const targetHeight = p.height * p.stretch;
      const targetWidth = p.width / (p.stretch * 0.85);
      const characterY = p.y + (p.height - targetHeight);
      const centerX = p.x + p.width / 2;

      ctx.save();
      ctx.translate(centerX, characterY + targetHeight / 2);
      if (!p.isGrounded) ctx.rotate(p.vy * 0.025);

      ctx.fillStyle = secondaryColor;
      ctx.beginPath();
      ctx.moveTo(0, -targetHeight / 2); ctx.lineTo(targetWidth / 2, 0);
      ctx.lineTo(0, targetHeight / 2); ctx.lineTo(-targetWidth / 2, 0);
      ctx.closePath(); ctx.fill();
      ctx.restore();

      const t = stateData.warpToast;
      if (t.active) {
        ctx.save();
        ctx.font = '900 36px "Helvetica Neue", Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const textWidthMetrics = ctx.measureText(t.text).width;
        const startX = (canvas.width / 2) - (textWidthMetrics / 2);

        ctx.fillStyle = 'rgba(0, 0, 0, 0.82)';
        ctx.fillRect((canvas.width / 2) - (textWidthMetrics / 2) - 40, t.y - 35, textWidthMetrics + 80, 70);
        ctx.strokeStyle = secondaryColor;
        ctx.lineWidth = 2;
        ctx.strokeRect((canvas.width / 2) - (textWidthMetrics / 2) - 40, t.y - 35, textWidthMetrics + 80, 70);

        for (let i = 0; i < textWidthMetrics; i += 2) {
          const waveFrequencyFactor = 0.04;
          const shiftAmplitude = 14;
          const pixelYOffset = Math.sin((stateData.gameTicks * 0.2) + (i * waveFrequencyFactor)) * shiftAmplitude;

          ctx.save();
          ctx.beginPath();
          ctx.rect(startX + i, t.y - 40, 2, 80);
          ctx.clip();

          ctx.fillStyle = (stateData.gameTicks % 10 < 5) ? secondaryColor : primaryColor;
          ctx.fillText(t.text, canvas.width / 2, t.y + pixelYOffset);
          ctx.restore();
        }

        ctx.font = 'bold 9px monospace';
        ctx.fillStyle = primaryColor;
        ctx.fillText("// OUTPUT_OVERRIDE_SIGNAL //", canvas.width / 2, t.y - 48);
        ctx.restore();
      }

      ctx.restore();
    };

    const gameLoop = (now: number) => {
      animationFrameId = requestAnimationFrame(gameLoop);
      const currentEngineState = stateRef.current;
      const elapsed = now - currentEngineState.lastTime;

      if (elapsed > currentEngineState.fpsInterval) {
        currentEngineState.lastTime = now - (elapsed % currentEngineState.fpsInterval);
        updatePhysics();
        drawCanvas();
      }
    };

    animationFrameId = requestAnimationFrame(gameLoop);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', resizeCanvas);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isPlaying, currentTrack, trackTransition, isTrackThreeMilestone, isLevelFiveMilestone, isLevelTenMilestone, isAlbumCleared]);

  const handleManualReboot = (targetTier: 'T-01' | 'T-05' | 'T-10') => {
    const engine = stateRef.current;
    engine.player.x = 140; engine.player.y = 300; engine.player.vy = 0;
    engine.player.jumpCount = 0; engine.player.stretch = 1;
    engine.scoreAccumulator = 0; engine.gameTicks = 0; engine.milesTraveled = 0;
    engine.coyoteCounter = 0;
    engine.jumpBufferCounter = 0;
    engine.trackSeventeenCrystals = 0;
    engine.warpToast.active = false;

    setScore(0);
    setIsAlbumCleared(false);

    if (targetTier === 'T-10' && hasLevelTenCheckpoint) {
      setCurrentTrack(10);
    } else if (targetTier === 'T-05' && hasLevelFiveCheckpoint) {
      setCurrentTrack(5);
    } else {
      setCurrentTrack(1);
    }

    setIsPlaying(true);
  };

  return (
    <div className="relative w-full h-full select-none overflow-hidden" onClick={handleCanvasClick}>
      <canvas ref={canvasRef} className="absolute inset-0 block w-full h-full" />

      {isPlaying && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden z-20">
          {floatTexts.map((txt) => (
            <div
              key={txt.id}
              className="absolute transform -translate-x-1/2 -translate-y-1/2 font-black text-2xl tracking-tight drop-shadow-[0_2px_5px_rgba(0,0,0,1)] mix-blend-difference select-none animate-pulse"
              style={{ left: `${txt.x}px`, top: `${txt.y}px`, opacity: txt.alpha }}
            >
              <BrandText text={txt.text} className="text-brandYellow font-black" />
            </div>
          ))}
        </div>
      )}

      {/* HUD — top bar */}
      <div className="absolute top-6 left-6 right-6 flex justify-between items-start font-mono pointer-events-none z-10">
        <div className="flex flex-col">
          <span className="text-xs text-brandRed opacity-60">ALBUM PROJECT</span>
          <BrandText text="OURO" className="text-3xl text-brandYellow" />
        </div>

        {/* NOW PLAYING */}
        {isPlaying && (
          <div className="flex flex-col items-center">
            <span className="text-xs text-brandRed opacity-60 tracking-widest">NOW PLAYING</span>
            <span className="text-sm text-brandYellow font-bold tracking-wide uppercase">{nowPlayingName}</span>
          </div>
        )}

        <div className="flex gap-12 text-right">
          <div className="flex flex-col">
            <span className="text-xs text-brandRed opacity-60">MATRIX LEVEL</span>
            <span className="text-xl text-brandYellow font-bold">
              TRACK {String(currentTrack).padStart(2, '0')}/17
              {currentTrack === 17 && ` [${stateRef.current.trackSeventeenCrystals}/17]`}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-xs text-brandRed opacity-60">ENERGY CAPTURED</span>
            <span className="text-xl text-white font-bold tracking-wider">{score} pts</span>
          </div>
        </div>
      </div>

      {/* Mute button */}
      {isPlaying && (
        <button
          onClick={(e) => { e.stopPropagation(); toggleMute(); }}
          className="absolute top-6 right-6 z-30 pointer-events-auto font-mono text-xs tracking-widest border border-brandYellow/40 px-3 py-1 text-brandYellow/60 hover:text-brandYellow hover:border-brandYellow transition-all bg-black/40"
          style={{ marginTop: '80px' }}
        >
          {isMuted ? '[ UNMUTE ]' : '[ MUTE ]'}
        </button>
      )}

      {toastActive && !isAlbumCleared && (
        <div className="absolute top-28 left-1/2 transform -translate-x-1/2 px-8 py-4 border-2 border-brandYellow bg-black font-mono text-center select-none z-50 animate-[ping_0.15s_ease-in-out_1] shadow-[4px_4px_0px_#ff4e3e]">
          <span className="text-[10px] text-brandRed block tracking-widest font-bold uppercase pb-1">// SYSTEM DATA INGEST //</span>
          <BrandText text={toastText} className="text-2xl text-brandYellow font-black tracking-tight block" />
        </div>
      )}

      {isPlaying && (
        <div className="absolute bottom-6 left-6 right-6 flex justify-between font-mono text-[10px] tracking-wider text-brandYellow/40 pointer-events-none select-none z-10 uppercase">
          <div className="flex flex-col gap-1 text-left">
            <span>[SPACE] / [W] — JUMP / DOUBLE LEAP</span>
            <span>[MID-AIR TAP] — GRAVITY DOWN STAMP</span>
            <span>[M] — MUTE / UNMUTE</span>
          </div>
          <div className="text-right flex flex-col justify-end text-brandYellow opacity-80 font-bold">
            <span>DEV KEYS // [1] T-01 // [3] T-03 // [5] T-05 // [0] T-10 // [6] T-15 // [9] CREDITS</span>
          </div>
        </div>
      )}

      {!isPlaying && (
        <div className="absolute inset-0 bg-brandBlack flex items-center justify-center z-50 transition-all duration-300">
          <div className="absolute inset-0 opacity-10 bg-[linear-gradient(rgba(255,78,62,0.3)_1px,transparent_1px)] bg-[size:100%_4px] pointer-events-none" />

          <div className="w-full max-w-xl px-12 text-left space-y-8 relative z-10">
            <div className="space-y-2 border-l-4 border-brandRed pl-6">
              <span className="text-xs text-brandRed font-mono tracking-[0.3em] block uppercase opacity-70">
                // ENGINE_SHUTDOWN_SEQUENCE_METRICS
              </span>
              <h2 className="block">
                <BrandText text="OUTOFBOUNDS" className="text-5xl md:text-6xl text-brandRed block font-black tracking-tighter leading-none" />
              </h2>
            </div>

            <div className="font-mono text-xs text-gray-500 leading-relaxed max-w-md space-y-2 uppercase">
              <p>&gt; RUN STATUS: TERMINATED</p>
              <p>&gt; RECORDED LOCATION STAMP OVERVIEW: TRACK {String(currentTrack).padStart(2, '0')}</p>
              <div className="space-y-1 text-brandYellow font-bold pt-1">
                {hasLevelTenCheckpoint && <p>&gt; RESTORE OVERRIDE: SECURE BACKUP NODE ONLINE AT TRACK 10.</p>}
                {hasLevelFiveCheckpoint && <p>&gt; RESTORE OVERRIDE: SECURE BACKUP NODE ONLINE AT TRACK 05.</p>}
              </div>
            </div>

            <div className="pt-2 flex flex-wrap gap-4">
              {hasLevelTenCheckpoint && (
                <button
                  onClick={() => handleManualReboot('T-10')}
                  className="bg-brandYellow hover:bg-brandYellow/80 text-black font-helvetica font-black py-4 px-6 text-xs uppercase tracking-widest transition-all cursor-pointer pointer-events-auto border-none active:scale-95"
                >
                  RESPAWN AT NODE (T-10)
                </button>
              )}
              {hasLevelFiveCheckpoint && (
                <button
                  onClick={() => handleManualReboot('T-05')}
                  className="bg-white hover:bg-white/80 text-black font-helvetica font-black py-4 px-6 text-xs uppercase tracking-widest transition-all cursor-pointer pointer-events-auto border-none active:scale-95"
                >
                  RESPAWN AT CHECKPOINT (T-05)
                </button>
              )}
              <button
                onClick={() => handleManualReboot('T-01')}
                className="bg-brandRed hover:bg-brandRed/80 text-black font-helvetica font-black py-4 px-6 text-xs uppercase tracking-widest transition-all cursor-pointer pointer-events-auto border-none active:scale-95"
              >
                TOTAL REBOOT (T-01)
              </button>
            </div>
          </div>
        </div>
      )}

      {isTrackThreeMilestone && (
        <div className="absolute inset-0 bg-[#000000] flex flex-col items-center justify-center z-40 transition-all">
          <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#ff4e3e_1.5px,transparent_1.5px)] bg-[size:24px_24px] pointer-events-none" />
          <div className="text-center max-w-xl px-12 space-y-3 border-y border-brandRed/40 py-10 bg-[#050000]">
            <span className="text-xs text-brandRed font-mono tracking-[0.4em] block uppercase animate-pulse">
              // WARNING: GRID GEOMETRY COUPLING //
            </span>
            <h2 className="block">
              <BrandText text="PHASE 02: DROOPY SOUL" className="text-4xl md:text-5xl text-brandYellow block font-black tracking-tight" />
            </h2>
            <p className="text-[10px] text-gray-500 font-mono block uppercase tracking-widest">
              TUNNEL DISTORTION ACTIVATED. PARALLAX ANOMALIES EN ROUTE.
            </p>
          </div>
        </div>
      )}

      {trackTransition && (
        <div className="absolute inset-0 bg-brandBlack/95 backdrop-blur-md flex flex-col items-center justify-center z-40 animate-fade-in">
          <div className="text-center space-y-2 max-w-md px-6 border-y border-brandRed/30 py-8 bg-[#050000]">
            <span className="text-xs text-brandRed font-mono tracking-[0.4em] block uppercase animate-pulse">
              SYNCHRONIZING REBEL OUTPUT MATRIX...
            </span>
            <h2 className="block">
              <BrandText text={`TRACK ${String(currentTrack).padStart(2, '0')}`} className="text-5xl md:text-6xl text-brandYellow block font-black" />
            </h2>
            <span className="text-xs text-brandYellow/60 font-mono block pt-1 uppercase tracking-widest">
              {TRACK_AUDIO_MAP[currentTrack]?.name}
            </span>
            <span className="text-[10px] text-gray-500 font-mono block pt-2 uppercase tracking-widest">
              SAFE GRID LEVEL SECTOR INJECTED_
            </span>
          </div>
        </div>
      )}

      {isLevelFiveMilestone && (
        <div className="absolute inset-0 bg-[#000000] flex flex-col items-center justify-center z-40 transition-all">
          <div className="absolute inset-0 opacity-20 bg-[linear-gradient(rgba(255,230,92,0.4)_1px,transparent_1px)] bg-[size:100%_6px] pointer-events-none" />
          <div className="text-center max-w-xl px-12 space-y-4 border border-brandYellow py-12 bg-[#080500] shadow-[0_0_50px_rgba(255,230,92,0.15)] animate-pulse">
            <span className="text-xs text-brandYellow font-mono tracking-[0.4em] block uppercase">
              // WARNING: SYSTEM METRIC EXTRAPOLATION //
            </span>
            <h2 className="block">
              <BrandText text="THE REBEL MATRIX ACCELERATES" className="text-4xl md:text-5xl text-brandRed block font-black tracking-tighter leading-none" />
            </h2>
            <p className="text-xs text-brandYellow/60 font-mono uppercase tracking-widest">
              NOW PLAYING: Melhores Dias
            </p>
            <p className="text-[11px] text-gray-400 font-mono max-w-xs mx-auto pt-2 uppercase">
              GRID ARCHITECTURE UNSTABLE. BASELINE SPEED ENHANCED. SESSION RECOVERY CHECKPOINT CREATED AT T-05.
            </p>
          </div>
        </div>
      )}

      {isLevelTenMilestone && (
        <div className="absolute inset-0 bg-[#000000] flex flex-col items-center justify-center z-40 transition-all duration-200">
          <div className="absolute inset-0 opacity-20 bg-[linear-gradient(rgba(255,230,92,0.4)_1px,transparent_1px)] bg-[size:100%_6px] pointer-events-none" />
          <div className="text-center max-w-2xl px-12 space-y-4 border-2 border-brandRed py-16 bg-[#000000] shadow-[0_0_60px_rgba(255,78,62,0.3)]">
            <span className="text-xs text-brandRed font-mono tracking-[0.5em] block uppercase font-black">
              [!!] CORE SYSTEM PURGE DETECTED [!!]
            </span>
            <h2 className="block">
              <BrandText text="ENTROPY OVERLOAD" className="text-5xl md:text-6xl text-brandYellow block font-black tracking-tight" />
            </h2>
            <p className="text-xs text-brandYellow/60 font-mono uppercase tracking-widest">
              NOW PLAYING: Dilema
            </p>
            <p className="text-xs text-gray-400 font-mono max-w-sm mx-auto pt-2 uppercase leading-relaxed">
              PLATFORM FOOTPRINT COORDINATES CORRUPTED. DISCS ARE INITIALIZING INTERMITTENT GLITCH PHASES. SESSION CHECKPOINT LOGGED_
            </p>
          </div>
        </div>
      )}

      {isAlbumCleared && (
        <div className="absolute inset-0 bg-brandBlack flex items-center justify-center z-50 animate-fade-in">
          <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#ffe65c_1.5px,transparent_1.5px)] bg-[size:32px_32px] pointer-events-none" />

          <div className="w-full max-w-2xl px-12 text-left space-y-8 relative z-10">
            <div className="space-y-3 border-l-4 border-brandYellow pl-6">
              <span className="text-xs text-brandYellow font-mono tracking-[0.4em] block uppercase">
                // COMPILATION_COMPLETE_SEQUENCE_SUCCESS //
              </span>
              <h1 className="block">
                <BrandText text="ALBUM TRANSMITTED" className="text-5xl md:text-6xl text-brandYellow block font-black tracking-tighter leading-none" />
              </h1>
            </div>

            <div className="font-mono text-xs text-gray-400 uppercase leading-relaxed space-y-3 max-w-md border border-brandYellow/20 p-6 bg-black/40 backdrop-blur-sm shadow-[8px_8px_0px_rgba(255,230,92,0.05)]">
              <p className="text-brandYellow font-bold">&gt; RUN INTEGRITY: MAXIMUM MASTERED [17/17 TRACKS CLEAR]</p>
              <p>&gt; TOTAL ENERGY CAPTURED: {score} METRIC UNITS</p>
              <p>&gt; TOTAL DISTANCE TRAVELED: {Math.floor(stateRef.current.milesTraveled)} STEPS</p>
              <p className="pt-2 text-gray-500 text-[10px] leading-normal font-sans tracking-wide">
                THE 17-TRACK MATRIX HAS TRAVELED DIRECTLY ACROSS THE DISCS OF DISSENT. THE CHEF HAS SECURED ABSOLUTE BRAND SOVEREIGNTY WITHIN THE SYSTEM LOOP. EXIT EN ROUTE.
              </p>
            </div>

            <div className="pt-2">
              <button
                onClick={() => handleManualReboot('T-01')}
                className="bg-brandYellow hover:bg-brandRed text-black font-helvetica font-black py-4 px-10 text-sm uppercase tracking-widest transition-all duration-200 cursor-pointer pointer-events-auto border-none active:scale-95 shadow-[4px_4px_0px_#ff4e3e]"
              >
                REBOOT MAIN GRIDS
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};