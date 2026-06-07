'use client';

import { useState, useEffect, useRef } from 'react';
import { BrandText } from '@/components/BrandText';
import { ArcadeCanvas } from '@/components/ArcadeCanvas';

type SystemState = 'intro' | 'hub' | 'arcade';

export default function Home() {
  const [gameState, setGameState] = useState<SystemState>('intro');
  const [introStage, setIntroStage] = useState<number>(0);
  const [isZooming, setIsZooming] = useState<boolean>(false);

  // On phones, render the arcade at a fixed 1280x720 stage and uniformly scale it to fit —
  // so the game looks exactly like desktop (HUD, counters and all), just smaller, letterboxed.
  const [stage, setStage] = useState<{ scale: number; mobile: boolean }>({ scale: 1, mobile: false });
  useEffect(() => {
    const compute = () => {
      const touch = ('ontouchstart' in window) || (navigator.maxTouchPoints || 0) > 0;
      const small = Math.min(window.innerWidth, window.innerHeight) <= 600;
      const mobile = touch && small;
      const scale = mobile ? Math.min(window.innerWidth / 1280, window.innerHeight / 720) : 1;
      setStage({ scale, mobile });
    };
    compute();
    const onOrient = () => { compute(); setTimeout(compute, 350); };
    window.addEventListener('resize', compute);
    window.addEventListener('orientationchange', onOrient);
    return () => { window.removeEventListener('resize', compute); window.removeEventListener('orientationchange', onOrient); };
  }, []);

  // ---- PWA INSTALL ----
  // canInstall → Android / desktop Chrome (we can trigger the native install dialog).
  // iosInstall → iPhone Safari (Apple blocks programmatic install; we show instructions).
  const deferredPrompt = useRef<any>(null);
  const [canInstall, setCanInstall] = useState(false);
  const [iosInstall, setIosInstall] = useState(false);
  const [showIosSheet, setShowIosSheet] = useState(false);
  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
    const onBIP = (e: Event) => { e.preventDefault(); deferredPrompt.current = e; setCanInstall(true); };
    const onInstalled = () => { setCanInstall(false); deferredPrompt.current = null; };
    window.addEventListener('beforeinstallprompt', onBIP);
    window.addEventListener('appinstalled', onInstalled);
    const ua = navigator.userAgent || '';
    const isIOS = /iphone|ipad|ipod/i.test(ua) || (/Mac/.test(ua) && navigator.maxTouchPoints > 1);
    const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
    if (isIOS && !standalone) setIosInstall(true);
    return () => { window.removeEventListener('beforeinstallprompt', onBIP); window.removeEventListener('appinstalled', onInstalled); };
  }, []);

  const handleInstall = async () => {
    const dp = deferredPrompt.current;
    if (dp) { dp.prompt(); await dp.userChoice.catch(() => {}); deferredPrompt.current = null; setCanInstall(false); }
    else if (iosInstall) setShowIosSheet(true);
  };

  const handleNextStage = () => {
    if (isZooming) return;

    if (introStage < 2) {
      setIntroStage(prev => prev + 1);
    } else {
      // Trigger the cinematic warp forward zoom into the HUB
      setIsZooming(true);
      setTimeout(() => {
        setGameState('hub');
        setIsZooming(false); // Reset zoom state for the hub rendering
      }, 550); 
    }
  };

  const launchModule = (mode: SystemState) => {
    setIsZooming(true);
    setTimeout(() => {
      setGameState(mode);
      setIsZooming(false);
    }, 550);
  };

  // --------------------------------------------------------
  // STAGE 1: THE CINEMATIC INTRO
  // --------------------------------------------------------
  if (gameState === 'intro') {
    return (
      <main
        onClick={handleNextStage}
        className={`relative min-h-[100dvh] w-full bg-brandBlack flex overflow-x-hidden overflow-y-auto select-none z-50 p-6 ${
          introStage < 2 ? 'cursor-pointer' : 'cursor-default'
        }`}
      >
        <div
          className={`m-auto text-center w-full max-w-4xl space-y-12 transition-all transform origin-center will-change-transform ${
            isZooming 
              ? 'scale-[8] opacity-0 blur-2xl pointer-events-none' 
              : 'scale-100 opacity-100'
          }`}
          style={{ 
            transitionDuration: '550ms',
            transitionTimingFunction: 'cubic-bezier(0.7, 0, 0.84, 0)' 
          }}
        >
          {introStage === 0 && (
            <div className="animate-pulse font-mono text-xs text-brandRed tracking-widest uppercase opacity-60">
              [ CLICK TO INITIALIZE SYSTEM ]
            </div>
          )}

          {introStage >= 1 && (
            <div className="animate-fade-in duration-300">
              <BrandText 
                text="ASSINO E DEVOLVO EM DOBRO." 
                className="text-4xl sm:text-6xl md:text-7xl font-black text-brandRed tracking-tighter" 
              />
            </div>
          )}

          {introStage >= 2 && (
            <div className="animate-fade-in duration-500 pt-4 space-y-16">
              <BrandText 
                text="TUDO O QUE LEVO DEVOLVO COM ALMA." 
                className="text-2xl sm:text-4xl md:text-5xl font-extrabold text-brandYellow tracking-tight" 
              />
              
              <div className="pt-12 block clear-both cursor-pointer" onClick={handleNextStage}>
                <span className="bg-brandRed text-black font-mono font-black text-xs px-8 py-4 tracking-widest uppercase animate-pulse border border-brandRed shadow-[0_0_20px_rgba(255,78,62,0.2)]">
                  ACCESS TERMINAL
                </span>
              </div>
            </div>
          )}
        </div>
      </main>
    );
  }

  // --------------------------------------------------------
  // STAGE 2: THE MAIN TERMINAL HUB
  // --------------------------------------------------------
  if (gameState === 'hub') {
    return (
      <main className="relative min-h-[100dvh] w-full bg-brandBlack flex overflow-x-hidden overflow-y-auto select-none z-50 p-6">

        {/* Subtle grid background to match the game aesthetic */}
        <div className="fixed inset-0 opacity-10 bg-[linear-gradient(rgba(255,78,62,0.3)_1px,transparent_1px)] bg-[size:100%_4px] pointer-events-none" />

        <div className={`m-auto w-full max-w-5xl z-10 transition-all transform origin-center will-change-transform ${
            isZooming ? 'scale-[8] opacity-0 blur-2xl pointer-events-none' : 'scale-100 opacity-100 animate-fade-in'
          }`}
          style={{ transitionDuration: '550ms', transitionTimingFunction: 'cubic-bezier(0.7, 0, 0.84, 0)' }}
        >
          
          <div className="mb-8 border-l-4 border-brandRed pl-6">
            <span className="text-xs text-brandRed font-mono tracking-[0.4em] block uppercase animate-pulse mb-2">
              // CHEF_MODE_ENGAGED
            </span>
            <BrandText text="MAIN TERMINAL" className="text-5xl md:text-7xl font-black text-white tracking-tighter" />
          </div>

          {/* Install affordance — Android/desktop Chrome fire the native dialog; iOS shows instructions */}
          {(canInstall || iosInstall) && (
            <button
              onClick={handleInstall}
              className="mb-8 inline-flex items-center gap-3 bg-brandYellow text-black font-mono font-black text-sm uppercase tracking-widest px-6 py-3 border-2 border-brandYellow hover:bg-black hover:text-brandYellow transition-all active:scale-95 shadow-[4px_4px_0px_#ff4e3e]"
            >
              📲 Install App {iosInstall && !canInstall ? '— Add to Home Screen' : ''}
            </button>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 font-mono">

            {/* MODULE 2: THE ARCADE */}
            <div 
              onClick={() => launchModule('arcade')}
              className="group relative border-2 border-brandYellow p-8 bg-black/40 hover:bg-brandYellow transition-all cursor-pointer shadow-[6px_6px_0px_rgba(255,230,92,0.15)] hover:shadow-[6px_6px_0px_rgba(255,230,92,1)]"
            >
              <span className="text-xs text-brandYellow group-hover:text-black block tracking-widest font-bold mb-2">// OPS_02</span>
              <h3 className="text-3xl font-black text-white group-hover:text-black mb-4 uppercase">Arcade Core</h3>
              <p className="text-xs text-gray-500 group-hover:text-black/80 leading-relaxed uppercase">
                Endless entropy simulation. Harvest crystals to survive. Eradicate alien vectors. Top 3 global leaderboard.
              </p>
            </div>

            {/* MODULE 3: THE COOKBOOK */}
            <div 
              className="group relative border-2 border-gray-800 p-8 bg-black/40 hover:border-white transition-all cursor-pointer"
              onClick={() => window.open('https://open.spotify.com/artist/4JNKjNlt3rtcIl84NiK4Lr', '_blank')}
            >
              <span className="text-xs text-gray-500 group-hover:text-white block tracking-widest font-bold mb-2">// ARCHIVE</span>
              <h3 className="text-3xl font-black text-gray-600 group-hover:text-white mb-4 uppercase">The Cook Book</h3>
              <p className="text-xs text-gray-600 group-hover:text-gray-300 leading-relaxed uppercase">
                Audio repository. The manual for dissent. Stream the raw output directly.
              </p>
            </div>

            {/* MODULE 4: DATES / INFO */}
            <div 
              className="group relative border-2 border-gray-800 p-8 bg-black/40 transition-all opacity-50"
            >
              <span className="text-xs text-gray-500 block tracking-widest font-bold mb-2">// DIRECTIVE</span>
              <h3 className="text-3xl font-black text-gray-600 mb-4 uppercase">PT_2027 OPS</h3>
              <p className="text-xs text-gray-600 leading-relaxed uppercase">
                Live deployment coordinates and residency metrics. [ CURRENTLY LOCKED. AWAITING DECLASSIFICATION ]
              </p>
            </div>

          </div>
        </div>

        {/* iOS install instructions (Apple blocks programmatic install) */}
        {showIosSheet && (
          <div className="fixed inset-0 z-[60] bg-black/85 flex items-center justify-center p-6 pointer-events-auto" onClick={() => setShowIosSheet(false)}>
            <div className="max-w-sm w-full border-2 border-brandYellow bg-black p-6 font-mono text-center space-y-4" onClick={(e) => e.stopPropagation()}>
              <p className="text-brandYellow font-black uppercase tracking-widest text-lg">Install on iPhone</p>
              <p className="text-gray-300 text-sm uppercase leading-relaxed">
                1. Tap the <span className="text-brandYellow font-bold">Share</span> button <span className="text-brandYellow">⬆️</span> at the bottom of Safari
              </p>
              <p className="text-gray-300 text-sm uppercase leading-relaxed">
                2. Scroll down and tap <span className="text-brandYellow font-bold">&quot;Add to Home Screen&quot;</span>
              </p>
              <p className="text-gray-500 text-xs uppercase">Then launch it from the icon — fullscreen, no browser.</p>
              <button onClick={() => setShowIosSheet(false)} className="mt-2 text-xs font-bold uppercase tracking-widest text-black bg-brandYellow px-5 py-2 active:scale-95">Got it</button>
            </div>
          </div>
        )}
      </main>
    );
  }

  // --------------------------------------------------------
  // STAGE 3: EXECUTE SELECTED GAME MODULE
  // --------------------------------------------------------
  if (gameState === 'arcade') {
    return (
      <main className="relative w-screen h-[100dvh] bg-brandBlack overflow-hidden touch-none flex items-center justify-center">
        {/* On mobile: fixed 1280x720 stage scaled to fit (exact desktop layout, letterboxed).
            On desktop: fills the window as before. */}
        <div
          className="relative origin-center shrink-0"
          style={stage.mobile
            ? { width: 1280, height: 720, transform: `scale(${stage.scale})` }
            : { width: '100%', height: '100%' }}
        >
          <ArcadeCanvas />
        </div>
        {/* Outside the scaled stage so it stays a real, tappable size. Bottom-center clears both pads. */}
        <button
          onClick={() => setGameState('hub')}
          className="absolute bottom-3 left-1/2 -translate-x-1/2 z-50 text-[10px] font-mono text-brandYellow border border-brandYellow bg-black/60 px-3 py-1.5 hover:bg-brandYellow hover:text-black transition-all"
        >
          [ ABORT TO TERMINAL ]
        </button>
      </main>
    );
  }

  return null;
}


