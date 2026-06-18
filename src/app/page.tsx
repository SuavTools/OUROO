'use client';

import { useState, useEffect, useRef } from 'react';
import { ArcadeCanvas } from '@/components/ArcadeCanvas';
import { LeapCanvas } from '@/components/LeapCanvas';
import { DuelClimbCanvas } from '@/components/DuelClimbCanvas';
import { TankDuelCanvas } from '@/components/TankDuelCanvas';
import { RoomCanvas } from '@/components/RoomCanvas';
import { Leaderboard } from '@/components/Leaderboard';
import { useUser, signInWithDiscord } from '@/lib/auth';
import { readTicket } from '@/lib/duel';
import { supabaseReady } from '@/lib/supabase';
import { amISuperAdmin } from '@/lib/chat';
import { ProfileModal } from '@/components/ProfileModal';
import { InventoryModal } from '@/components/InventoryModal';
import { ChatModal } from '@/components/ChatModal';
import { AdminModal } from '@/components/AdminModal';
import { OpenInBrowser } from '@/components/OpenInBrowser';

type View = 'landing' | 'arcade' | 'leap' | 'duel' | 'lobby';
// Onboarding spine — a portal-chained, Oracle-guided tutorial (canon: tutorial-sequence-spec):
//   oracle → arcade → terminal → character → yourroom → town → done.
// page.tsx owns the persisted step + whether the tutorial game was played (that fact has to survive
// the game launch, which unmounts the world). RoomCanvas owns everything inside each room.
type OnboardStep = 'oracle' | 'arcade' | 'terminal' | 'character' | 'yourroom' | 'town' | 'done';
const ONBOARD_KEY = 'ouroo_onboard';
const TUT_PLAYED_KEY = 'ouroo_tut_played';
const TUT_STEPS: OnboardStep[] = ['oracle', 'arcade', 'terminal', 'character', 'yourroom', 'town'];

export default function Home() {
  const [view, setView] = useState<View>('lobby');   // launch straight into the world, not a marketing page
  const [isZooming, setIsZooming] = useState(false);
  const [onboard, setOnboard] = useState<OnboardStep>(() => {
    if (typeof window === 'undefined') return 'oracle';
    try { const s = localStorage.getItem(ONBOARD_KEY) as OnboardStep | null; return s === 'done' ? 'done' : (s && TUT_STEPS.includes(s) ? s : 'oracle'); } catch { return 'oracle'; }
  });
  const setStep = (s: OnboardStep) => { setOnboard(s); try { localStorage.setItem(ONBOARD_KEY, s); } catch { /* ignore */ } };
  const [gamePlayed, setGamePlayed] = useState<boolean>(() => { if (typeof window === 'undefined') return false; try { return localStorage.getItem(TUT_PLAYED_KEY) === '1'; } catch { return false; } });
  const markGamePlayed = () => { setGamePlayed(true); try { localStorage.setItem(TUT_PLAYED_KEY, '1'); } catch { /* ignore */ } };
  const { user } = useUser();   // Discord login state (null when logged out)
  // Special-rule modifiers a game launches with (e.g. double crystals) — set at launch, forwarded
  // to the game component. Inert for now; the games accept the prop but don't act on it yet.
  const [gameMods, setGameMods] = useState<Record<string, boolean> | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [isSuper, setIsSuper] = useState(false);
  useEffect(() => { if (user) amISuperAdmin().then(setIsSuper); else setIsSuper(false); }, [user]);

  // Phones render the arcade at a fixed 1280x720 stage scaled to fit (handled inside ArcadeCanvas).
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
  const deferredPrompt = useRef<Event & { prompt?: () => void; userChoice?: Promise<unknown> } | null>(null);
  const [canInstall, setCanInstall] = useState(false);
  const [iosInstall, setIosInstall] = useState(false);
  const [showIosSheet, setShowIosSheet] = useState(false);
  const [standalone, setStandalone] = useState(false);   // already installed → hide install prompts
  const [installBanner, setInstallBanner] = useState(false);
  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
    const onBIP = (e: Event) => { e.preventDefault(); deferredPrompt.current = e as never; setCanInstall(true); };
    const onInstalled = () => { setCanInstall(false); deferredPrompt.current = null; };
    window.addEventListener('beforeinstallprompt', onBIP);
    window.addEventListener('appinstalled', onInstalled);
    const ua = navigator.userAgent || '';
    const isIOS = /iphone|ipad|ipod/i.test(ua) || (/Mac/.test(ua) && navigator.maxTouchPoints > 1);
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
    setStandalone(isStandalone);
    if (isIOS && !isStandalone) setIosInstall(true);
    // Show the "save as app" banner once per session (unless already installed or dismissed).
    if (!isStandalone && sessionStorage.getItem('ouroo_install_x') !== '1') setInstallBanner(true);
    return () => { window.removeEventListener('beforeinstallprompt', onBIP); window.removeEventListener('appinstalled', onInstalled); };
  }, []);
  const dismissInstallBanner = () => { sessionStorage.setItem('ouroo_install_x', '1'); setInstallBanner(false); };
  const installable = (canInstall || iosInstall) && !standalone;
  const handleInstall = async () => {
    const dp = deferredPrompt.current;
    if (dp?.prompt) { dp.prompt(); await dp.userChoice?.catch(() => {}); deferredPrompt.current = null; setCanInstall(false); }
    else if (iosInstall) setShowIosSheet(true);
  };

  const enterArcade = () => {
    if (isZooming) return;
    setIsZooming(true);
    setTimeout(() => { setView('arcade'); setIsZooming(false); }, 550);
  };

  const enterLeap = () => {
    if (isZooming) return;
    setIsZooming(true);
    setTimeout(() => { setView('leap'); setIsZooming(false); }, 550);
  };

  const enterLobby = () => {
    if (isZooming) return;
    setIsZooming(true);
    setTimeout(() => { setView('lobby'); setIsZooming(false); }, 550);
  };

  // Launch a game from inside the world (walking up to an arcade machine or a placed game trigger).
  // RoomCanvas records where you launched from (ouroo_game_origin) so exit returns you there.
  // Which game the current duel runs (read from the launch ticket when entering the duel view).
  const [duelGameId, setDuelGameId] = useState<string>('climb');
  const launchGame = (id: string, mods?: Record<string, boolean>) => {
    setGameMods(mods ?? null);
    if (id === 'duel') setDuelGameId(readTicket()?.gameId ?? 'climb');
    setView(id === 'leap' ? 'leap' : id === 'duel' ? 'duel' : 'arcade');
  };

  // ==========================================================================
  // THE ARCADE
  // ==========================================================================
  if (view === 'arcade') {
    return (
      <main className="relative w-screen h-[100dvh] bg-brandBlack overflow-hidden touch-none">
        <ArcadeCanvas stageScale={stage.scale} isMobileStage={stage.mobile} gameMods={gameMods} onFirstGameOver={onboard === 'arcade' ? () => { markGamePlayed(); setView('lobby'); } : undefined} />
        {/* In-app-browser users hit the no-rotate wall here — float the "open in browser" nudge on top. */}
        <div className="fixed top-0 inset-x-0 z-[80]"><OpenInBrowser /></div>
        <button
          onClick={() => setView('lobby')}
          style={{ bottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
          className="absolute left-1/2 -translate-x-1/2 z-50 text-[10px] font-mono text-brandYellow border border-brandYellow bg-black/60 px-3 py-1.5 hover:bg-brandYellow hover:text-black transition-all"
        >
          [ EXIT ]
        </button>
      </main>
    );
  }

  // ==========================================================================
  // OUROO LEAP
  // ==========================================================================
  if (view === 'leap') {
    return (
      <main className="relative w-screen h-[100dvh] bg-brandBlack overflow-hidden touch-none">
        <LeapCanvas stageScale={stage.scale} isMobileStage={stage.mobile} gameMods={gameMods} onExit={() => setView('lobby')} />
        <div className="fixed top-0 inset-x-0 z-[80]"><OpenInBrowser /></div>
        <button
          onClick={() => setView('lobby')}
          style={{ bottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
          className="absolute left-1/2 -translate-x-1/2 z-50 text-[10px] font-mono text-brandYellow border border-brandYellow bg-black/60 px-3 py-1.5 hover:bg-brandYellow hover:text-black transition-all"
        >
          [ EXIT ]
        </button>
      </main>
    );
  }

  // ==========================================================================
  // OUROO DUEL — 1v1 wagered Climb Race (launched from the Plaza)
  // ==========================================================================
  if (view === 'duel') {
    return (
      <main className="relative w-screen h-[100dvh] bg-brandBlack overflow-hidden touch-none">
        {duelGameId === 'tank'
          ? <TankDuelCanvas stageScale={stage.scale} isMobileStage={stage.mobile} onExit={() => setView('lobby')} />
          : duelGameId === 'ouroo'
          ? <ArcadeCanvas stageScale={stage.scale} isMobileStage={stage.mobile} duel onExit={() => setView('lobby')} />
          : duelGameId === 'leap'
          ? <LeapCanvas stageScale={stage.scale} isMobileStage={stage.mobile} duel onExit={() => setView('lobby')} />
          : <DuelClimbCanvas stageScale={stage.scale} isMobileStage={stage.mobile} onExit={() => setView('lobby')} />}
        <div className="fixed top-0 inset-x-0 z-[80]"><OpenInBrowser /></div>
      </main>
    );
  }

  // ==========================================================================
  // PRAÇA — SOCIAL ROOM
  // ==========================================================================
  if (view === 'lobby') {
    return (
      <main className="relative w-screen h-[100dvh] bg-brandBlack overflow-hidden touch-none">
        <RoomCanvas stageScale={stage.scale} isMobileStage={stage.mobile} onLaunchGame={launchGame} onboarding={onboard} gamePlayed={gamePlayed} onSetStep={setStep} />
        <div className="fixed top-0 inset-x-0 z-[80]"><OpenInBrowser /></div>
      </main>
    );
  }

  // ==========================================================================
  // OUROO — GAME LANDING
  // ==========================================================================
  return (
    <main className="relative min-h-[100dvh] w-full bg-black text-white overflow-x-hidden">
      <OpenInBrowser />
      <div
        className={`transition-all duration-[550ms] will-change-transform ${isZooming ? 'scale-[6] opacity-0 blur-2xl pointer-events-none' : 'scale-100 opacity-100'}`}
        style={{ transitionTimingFunction: 'cubic-bezier(0.7,0,0.84,0)' }}
      >
        {/* ---- NAV ---- (safe-area top so it clears the iOS status bar / notch in installed-app mode) */}
        <header className="sticky top-0 z-40 backdrop-blur-md bg-black/70 border-b border-white/10" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
          <nav className="mx-auto max-w-5xl px-5 sm:px-8 h-14 flex items-center justify-between">
            <a href="#top" className="font-helvetica font-black text-xl tracking-tight">OUROO<span className="text-brandRed">.</span></a>
            <div className="flex items-center gap-4 sm:gap-5 text-[11px] uppercase tracking-[0.2em] text-white/60">
              <button onClick={enterLobby} className="hidden sm:inline hover:text-white transition-colors">Plaza</button>
              <button onClick={() => setChatOpen(true)} className="hover:text-white transition-colors">Chat</button>
              <button onClick={() => setInventoryOpen(true)} className="hover:text-white transition-colors">Inventory</button>
              {isSuper && <button onClick={() => setAdminOpen(true)} title="Admin" className="text-brandYellow hover:text-white transition-colors">📊</button>}
              {supabaseReady && (user
                ? (
                  <button onClick={() => setProfileOpen(true)} title="My profile" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {user.avatar && <img src={user.avatar} alt="" className="w-6 h-6 rounded-full border border-white/20" />}
                    <span className="hidden sm:inline normal-case tracking-normal text-white/80 max-w-[120px] truncate">{user.name}</span>
                  </button>
                )
                : <button onClick={() => signInWithDiscord()} className="text-[#5865F2] hover:text-white transition-colors"><span className="sm:hidden">Discord</span><span className="hidden sm:inline">Sign in with Discord</span></button>
              )}
              {installable && (
                <button onClick={handleInstall} title="Install as app" className="flex items-center gap-1 font-bold text-brandYellow hover:text-white transition-colors animate-pulse">
                  📲<span className="hidden sm:inline">&nbsp;App</span>
                </button>
              )}
              <button onClick={enterArcade} className="font-bold text-black bg-brandRed px-4 py-1.5 tracking-[0.2em] hover:bg-white transition-colors">Play ▸</button>
            </div>
          </nav>
        </header>

        {/* ---- "SAVE AS APP" BANNER — explains the install along the journey ---- */}
        {installable && installBanner && (
          <div className="mx-auto max-w-5xl px-5 sm:px-8 mt-3">
            <div className="relative border border-brandYellow/40 bg-brandYellow/[0.06] p-4 flex items-center gap-3">
              <span className="text-2xl">📲</span>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm text-white">Install OUROO on your phone</p>
                <p className="text-[12px] text-white/55 leading-snug">Play full-screen, no browser bars — launch straight from the icon like a real app.</p>
              </div>
              <button onClick={handleInstall} className="shrink-0 bg-brandYellow text-black font-bold uppercase text-[11px] tracking-widest px-3 py-2 active:scale-95">Install</button>
              <button onClick={dismissInstallBanner} className="shrink-0 text-white/30 hover:text-white text-lg leading-none">✕</button>
            </div>
          </div>
        )}

        {/* ---- HERO ---- */}
        <section id="top" className="mx-auto max-w-5xl px-5 sm:px-8 pt-10 sm:pt-16 pb-10">
          <p className="text-[11px] uppercase tracking-[0.4em] text-brandRed mb-3">The loop that pays in crystals</p>
          <h1 className="font-helvetica font-black tracking-tighter leading-[0.92] text-6xl sm:text-8xl">OUROO<span className="text-brandRed">.</span></h1>
          <p className="mt-4 max-w-xl text-white/60 text-sm sm:text-base leading-relaxed">
            A world that eats its own tail. Mine crystals in the arcade, outlast the swarm, then spend every last one making your corner of the Plaza yours. Many games, one wallet, one world. Press play.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <button onClick={enterArcade} className="inline-flex items-center gap-3 font-bold uppercase tracking-[0.2em] text-sm text-black bg-brandRed px-6 py-3 hover:bg-white transition-colors">
              ▶ Enter the Arcade
            </button>
            <button onClick={enterLobby} className="inline-flex items-center gap-3 font-bold uppercase tracking-[0.2em] text-sm text-white border border-[#00cfff]/50 px-6 py-3 hover:bg-[#00cfff] hover:text-black transition-colors">
              Walk into the Plaza
            </button>
          </div>
        </section>

        {/* ---- THE WORLDS ---- */}
        <section className="mx-auto max-w-5xl px-5 sm:px-8 py-10 border-t border-white/10">
          <button
            onClick={enterArcade}
            className="group relative w-full overflow-hidden border border-brandRed/40 bg-gradient-to-br from-brandRed/10 to-transparent p-8 sm:p-12 text-left transition-all hover:border-brandRed"
          >
            <p className="text-[11px] uppercase tracking-[0.4em] text-brandYellow mb-3">Now Playing</p>
            <h2 className="font-helvetica font-black text-4xl sm:text-6xl tracking-tighter leading-none">OUROO<span className="text-brandRed">.</span></h2>
            <p className="mt-3 max-w-md text-white/60 text-sm leading-relaxed">
              An arcade of infinite entropy. Harvest crystals, survive the swarm, climb the board. Best on a phone, held sideways.
            </p>
            <span className="mt-6 inline-flex items-center gap-3 font-bold uppercase tracking-[0.2em] text-sm text-black bg-brandRed px-6 py-3 group-hover:bg-white transition-colors">
              ▶ Enter the Arcade
            </span>
          </button>

          {/* Second game — OUROO LEAP, on the shared engine + skins, its own ranking. */}
          <button
            onClick={enterLeap}
            className="group relative w-full overflow-hidden border border-brandYellow/40 bg-gradient-to-br from-brandYellow/10 to-transparent p-8 sm:p-12 text-left transition-all hover:border-brandYellow mt-5"
          >
            <p className="text-[11px] uppercase tracking-[0.4em] text-brandRed mb-3">New Mode</p>
            <h2 className="font-helvetica font-black text-4xl sm:text-6xl tracking-tighter leading-none">LEAP<span className="text-brandYellow">.</span></h2>
            <p className="mt-3 max-w-md text-white/60 text-sm leading-relaxed">
              Climb the crystal staircase, platform to platform — snag a crystal mid-air and your jump comes back. Every platform is another rung. Same skin, new board.
            </p>
            <span className="mt-6 inline-flex items-center gap-3 font-bold uppercase tracking-[0.2em] text-sm text-black bg-brandYellow px-6 py-3 group-hover:bg-white transition-colors">
              ▶ Leap
            </span>
          </button>

          {/* Social room — your skin walks around live with others. Canvas + vectors. */}
          <button
            onClick={enterLobby}
            className="group relative w-full overflow-hidden border border-[#00cfff]/40 bg-gradient-to-br from-[#00cfff]/10 to-transparent p-8 sm:p-12 text-left transition-all hover:border-[#00cfff] mt-5"
          >
            <p className="text-[11px] uppercase tracking-[0.4em] text-brandRed mb-3">The Plaza · Beta</p>
            <h2 className="font-helvetica font-black text-4xl sm:text-6xl tracking-tighter leading-none">PRAÇA<span className="text-[#00cfff]">.</span></h2>
            <p className="mt-3 max-w-md text-white/60 text-sm leading-relaxed">
              Walk in with your skin and hang out. See who's online live, talk in bubbles over your head, and furnish the place with everything you mined. All in real time.
            </p>
            <span className="mt-6 inline-flex items-center gap-3 font-bold uppercase tracking-[0.2em] text-sm text-black bg-[#00cfff] px-6 py-3 group-hover:bg-white transition-colors">
              ▶ Enter
            </span>
          </button>

          {/* Unified leaderboard — built multi-game; OUROO for now, more games slot in later. */}
          <div className="mt-8 border border-white/10 p-5 sm:p-8">
            <div className="flex items-end justify-between mb-4">
              <h3 className="font-helvetica font-black text-2xl sm:text-3xl tracking-tight">Leaderboard</h3>
              <span className="text-[11px] uppercase tracking-[0.2em] text-white/40">OUROO</span>
            </div>
            <Leaderboard limit={10} showToggle />
          </div>
        </section>

        {/* ---- FOOTER ---- */}
        <footer className="mx-auto max-w-5xl px-5 sm:px-8 py-10 border-t border-white/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
          <p className="text-[11px] uppercase tracking-[0.2em] text-white/40 leading-relaxed max-w-sm">
            One world. One wallet. Mine it, spend it, show it off. The signal running through all of it is SUAV.
          </p>
          <div className="flex items-center gap-4">
            {(canInstall || iosInstall) && (
              <button onClick={handleInstall} className="text-[11px] uppercase tracking-[0.2em] border border-white/20 px-4 py-2 hover:bg-white hover:text-black transition-colors">
                📲 Install App
              </button>
            )}
            <span className="font-helvetica font-black text-sm tracking-tight">OUROO<span className="text-brandRed">.</span></span>
          </div>
        </footer>
      </div>

      {/* iOS install instructions */}
      {showIosSheet && (
        <div className="fixed inset-0 z-[60] bg-black/85 flex items-center justify-center p-6" onClick={() => setShowIosSheet(false)}>
          <div className="max-w-sm w-full border border-white/20 bg-black p-6 text-center space-y-4" onClick={(e) => e.stopPropagation()}>
            <p className="font-helvetica font-black uppercase tracking-widest text-lg">Install on iPhone</p>
            <p className="text-white/70 text-sm leading-relaxed">1. Tap the <span className="text-brandRed font-bold">Share</span> button at the bottom of Safari</p>
            <p className="text-white/70 text-sm leading-relaxed">2. Scroll down and tap <span className="text-brandRed font-bold">&quot;Add to Home Screen&quot;</span></p>
            <button onClick={() => setShowIosSheet(false)} className="mt-2 text-xs font-bold uppercase tracking-widest text-black bg-brandRed px-5 py-2 active:scale-95">Got it</button>
          </div>
        </div>
      )}

      <ProfileModal open={profileOpen} onClose={() => setProfileOpen(false)} />
      <InventoryModal open={inventoryOpen} onClose={() => setInventoryOpen(false)} />
      <ChatModal open={chatOpen} onClose={() => setChatOpen(false)} />
      {isSuper && <AdminModal open={adminOpen} onClose={() => setAdminOpen(false)} />}
    </main>
  );
}
