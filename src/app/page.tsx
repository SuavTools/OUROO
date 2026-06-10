'use client';

import { useState, useEffect, useRef } from 'react';
import { ArcadeCanvas } from '@/components/ArcadeCanvas';
import { LeapCanvas } from '@/components/LeapCanvas';
import { RoomCanvas } from '@/components/RoomCanvas';
import { Leaderboard } from '@/components/Leaderboard';
import { useUser, signInWithDiscord } from '@/lib/auth';
import { supabaseReady } from '@/lib/supabase';
import { amISuperAdmin } from '@/lib/chat';
import { ProfileModal } from '@/components/ProfileModal';
import { InventoryModal } from '@/components/InventoryModal';
import { ChatModal } from '@/components/ChatModal';
import { AdminModal } from '@/components/AdminModal';
import { OpenInBrowser } from '@/components/OpenInBrowser';

type View = 'landing' | 'arcade' | 'leap' | 'lobby';

// --- Artist content (edit here) ---------------------------------------------
const VIDEO_ID = 's5dhOrRjs7Q';                       // latest clip (YouTube)
const SPOTIFY_ARTIST = '4JNKjNlt3rtcIl84NiK4Lr';      // Spotify artist id
const SPOTIFY_URL = `https://open.spotify.com/artist/${SPOTIFY_ARTIST}`;
const INSTAGRAM_URL = 'https://www.instagram.com/suav.wav/';
const BOOKING = { name: 'João Dinis', agency: 'Primeira Linha', url: 'https://www.primeiralinha.pt/' };

// Upcoming shows — add entries here. Empty array shows the "announced soon" state.
const SHOWS: { date: string; city: string; venue: string; ticket?: string }[] = [
  // { date: '12 JUL', city: 'Lisboa', venue: 'TBA', ticket: '#' },
];
// ----------------------------------------------------------------------------

export default function Home() {
  const [view, setView] = useState<View>('landing');
  const [isZooming, setIsZooming] = useState(false);
  const { user } = useUser();   // Discord login state (null when logged out)
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

  // ==========================================================================
  // THE ARCADE
  // ==========================================================================
  if (view === 'arcade') {
    return (
      <main className="relative w-screen h-[100dvh] bg-brandBlack overflow-hidden touch-none">
        <ArcadeCanvas stageScale={stage.scale} isMobileStage={stage.mobile} />
        {/* In-app-browser users hit the no-rotate wall here — float the "open in browser" nudge on top. */}
        <div className="fixed top-0 inset-x-0 z-[80]"><OpenInBrowser /></div>
        <button
          onClick={() => setView('landing')}
          style={{ bottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
          className="absolute left-1/2 -translate-x-1/2 z-50 text-[10px] font-mono text-brandYellow border border-brandYellow bg-black/60 px-3 py-1.5 hover:bg-brandYellow hover:text-black transition-all"
        >
          [ SAIR PARA SUAV ]
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
        <LeapCanvas stageScale={stage.scale} isMobileStage={stage.mobile} onExit={() => setView('landing')} />
        <div className="fixed top-0 inset-x-0 z-[80]"><OpenInBrowser /></div>
        <button
          onClick={() => setView('landing')}
          style={{ bottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
          className="absolute left-1/2 -translate-x-1/2 z-50 text-[10px] font-mono text-brandYellow border border-brandYellow bg-black/60 px-3 py-1.5 hover:bg-brandYellow hover:text-black transition-all"
        >
          [ SAIR PARA SUAV ]
        </button>
      </main>
    );
  }

  // ==========================================================================
  // PRAÇA — SOCIAL ROOM
  // ==========================================================================
  if (view === 'lobby') {
    return (
      <main className="relative w-screen h-[100dvh] bg-brandBlack overflow-hidden touch-none">
        <RoomCanvas stageScale={stage.scale} isMobileStage={stage.mobile} onExit={() => setView('landing')} />
        <div className="fixed top-0 inset-x-0 z-[80]"><OpenInBrowser /></div>
      </main>
    );
  }

  // ==========================================================================
  // SUAV — ARTIST LANDING
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
            <a href="#top" className="font-helvetica font-black text-xl tracking-tight">SUAV</a>
            <div className="flex items-center gap-4 sm:gap-5 text-[11px] uppercase tracking-[0.2em] text-white/60">
              <a href="#listen" className="hidden sm:inline hover:text-white transition-colors">Ouvir</a>
              <a href="#live" className="hidden sm:inline hover:text-white transition-colors">Concertos</a>
              <button onClick={() => setChatOpen(true)} className="hover:text-white transition-colors">Chat</button>
              <button onClick={() => setInventoryOpen(true)} className="hover:text-white transition-colors">Inventário</button>
              {isSuper && <button onClick={() => setAdminOpen(true)} title="Admin" className="text-brandYellow hover:text-white transition-colors">📊</button>}
              {supabaseReady && (user
                ? (
                  <button onClick={() => setProfileOpen(true)} title="O meu perfil" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {user.avatar && <img src={user.avatar} alt="" className="w-6 h-6 rounded-full border border-white/20" />}
                    <span className="hidden sm:inline normal-case tracking-normal text-white/80 max-w-[120px] truncate">{user.name}</span>
                  </button>
                )
                : <button onClick={() => signInWithDiscord()} className="text-[#5865F2] hover:text-white transition-colors"><span className="sm:hidden">Discord</span><span className="hidden sm:inline">Ligar Discord</span></button>
              )}
              {installable && (
                <button onClick={handleInstall} title="Instalar como app" className="flex items-center gap-1 font-bold text-brandYellow hover:text-white transition-colors animate-pulse">
                  📲<span className="hidden sm:inline">&nbsp;App</span>
                </button>
              )}
              <button onClick={enterArcade} className="font-bold text-black bg-brandRed px-4 py-1.5 tracking-[0.2em] hover:bg-white transition-colors">Jogar ▸</button>
            </div>
          </nav>
        </header>

        {/* ---- "SAVE AS APP" BANNER — explains the install along the journey ---- */}
        {installable && installBanner && (
          <div className="mx-auto max-w-5xl px-5 sm:px-8 mt-3">
            <div className="relative border border-brandYellow/40 bg-brandYellow/[0.06] p-4 flex items-center gap-3">
              <span className="text-2xl">📲</span>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm text-white">Instala a OUROO no telemóvel</p>
                <p className="text-[12px] text-white/55 leading-snug">Joga em ecrã inteiro, sem barras do navegador — abre direto do ícone como uma app.</p>
              </div>
              <button onClick={handleInstall} className="shrink-0 bg-brandYellow text-black font-bold uppercase text-[11px] tracking-widest px-3 py-2 active:scale-95">Instalar</button>
              <button onClick={dismissInstallBanner} className="shrink-0 text-white/30 hover:text-white text-lg leading-none">✕</button>
            </div>
          </div>
        )}

        {/* ---- HERO ---- */}
        <section id="top" className="mx-auto max-w-5xl px-5 sm:px-8 pt-10 sm:pt-16 pb-10">
          <p className="text-[11px] uppercase tracking-[0.4em] text-brandRed mb-3">Último Lançamento</p>
          <h1 className="font-helvetica font-black tracking-tighter leading-[0.92] text-6xl sm:text-8xl">SUAV</h1>
          <p className="mt-4 max-w-xl text-white/60 text-sm sm:text-base leading-relaxed">
            Novos visuais, som e o arcade OUROO — tudo num só lugar. Carrega play.
          </p>

          {/* Featured clip — autoplays muted */}
          <div className="mt-8 relative w-full aspect-video bg-white/5 border border-white/10 overflow-hidden">
            <iframe
              className="absolute inset-0 w-full h-full"
              src={`https://www.youtube.com/embed/${VIDEO_ID}?autoplay=1&mute=1&loop=1&playlist=${VIDEO_ID}&rel=0&modestbranding=1&playsinline=1`}
              title="SUAV — latest video"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
            />
          </div>
        </section>

        {/* ---- LISTEN ---- */}
        <section id="listen" className="mx-auto max-w-5xl px-5 sm:px-8 py-10 border-t border-white/10">
          <div className="flex items-end justify-between mb-5">
            <h2 className="font-helvetica font-black text-3xl sm:text-4xl tracking-tight">Ouvir</h2>
            <a href={SPOTIFY_URL} target="_blank" rel="noopener noreferrer" className="text-[11px] uppercase tracking-[0.2em] text-white/60 hover:text-brandRed transition-colors">Abrir no Spotify →</a>
          </div>
          <div className="w-full overflow-hidden border border-white/10 bg-white/5">
            <iframe
              className="w-full"
              style={{ height: 352 }}
              src={`https://open.spotify.com/embed/artist/${SPOTIFY_ARTIST}?utm_source=generator&theme=0`}
              title="SUAV on Spotify"
              loading="lazy"
              allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            />
          </div>
        </section>

        {/* ---- LIVE ---- */}
        <section id="live" className="mx-auto max-w-5xl px-5 sm:px-8 py-10 border-t border-white/10">
          <h2 className="font-helvetica font-black text-3xl sm:text-4xl tracking-tight mb-5">Concertos</h2>
          {SHOWS.length > 0 ? (
            <ul className="divide-y divide-white/10">
              {SHOWS.map((s, i) => (
                <li key={i} className="flex items-center justify-between py-4 gap-4">
                  <div className="flex items-baseline gap-4 min-w-0">
                    <span className="font-helvetica font-black text-brandRed w-16 shrink-0">{s.date}</span>
                    <span className="truncate"><span className="font-bold">{s.city}</span><span className="text-white/50"> · {s.venue}</span></span>
                  </div>
                  {s.ticket
                    ? <a href={s.ticket} target="_blank" rel="noopener noreferrer" className="text-[11px] uppercase tracking-[0.2em] border border-white/20 px-4 py-2 hover:bg-white hover:text-black transition-colors shrink-0">Bilhetes</a>
                    : <span className="text-[11px] uppercase tracking-[0.2em] text-white/40 shrink-0">Em breve</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-white/50 text-sm leading-relaxed">Novas datas em breve. Para contratações, fala connosco abaixo.</p>
          )}

          {/* Bookings */}
          <div className="mt-8 border border-white/10 p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.3em] text-brandRed mb-1">Contratações</p>
              <p className="text-sm"><span className="font-bold">{BOOKING.name}</span><span className="text-white/50"> — {BOOKING.agency}</span></p>
            </div>
            <a href={BOOKING.url} target="_blank" rel="noopener noreferrer" className="text-[11px] uppercase tracking-[0.2em] font-bold border border-white/20 px-5 py-2.5 hover:bg-white hover:text-black transition-colors text-center">Primeira Linha →</a>
          </div>
        </section>

        {/* ---- THE ARCADE (featured) ---- */}
        <section className="mx-auto max-w-5xl px-5 sm:px-8 py-10 border-t border-white/10">
          <button
            onClick={enterArcade}
            className="group relative w-full overflow-hidden border border-brandRed/40 bg-gradient-to-br from-brandRed/10 to-transparent p-8 sm:p-12 text-left transition-all hover:border-brandRed"
          >
            <p className="text-[11px] uppercase tracking-[0.4em] text-brandYellow mb-3">A Jogar Agora</p>
            <h2 className="font-helvetica font-black text-4xl sm:text-6xl tracking-tighter leading-none">OUROO<span className="text-brandRed">.</span></h2>
            <p className="mt-3 max-w-md text-white/60 text-sm leading-relaxed">
              Arcade de entropia infinita. Apanha cristais, sobrevive à horda, sobe no ranking. Melhor no telemóvel, na horizontal.
            </p>
            <span className="mt-6 inline-flex items-center gap-3 font-bold uppercase tracking-[0.2em] text-sm text-black bg-brandRed px-6 py-3 group-hover:bg-white transition-colors">
              ▶ Entrar no Arcade
            </span>
          </button>

          {/* Second game — OUROO LEAP, on the shared engine + skins, its own ranking. */}
          <button
            onClick={enterLeap}
            className="group relative w-full overflow-hidden border border-brandYellow/40 bg-gradient-to-br from-brandYellow/10 to-transparent p-8 sm:p-12 text-left transition-all hover:border-brandYellow mt-5"
          >
            <p className="text-[11px] uppercase tracking-[0.4em] text-brandRed mb-3">Novo Modo</p>
            <h2 className="font-helvetica font-black text-4xl sm:text-6xl tracking-tighter leading-none">LEAP<span className="text-brandYellow">.</span></h2>
            <p className="mt-3 max-w-md text-white/60 text-sm leading-relaxed">
              Salta a escadaria de cristais de plataforma em plataforma — apanha um cristal no ar e o salto volta. Cada plataforma sobe um nível. Mesma skin, novo ranking.
            </p>
            <span className="mt-6 inline-flex items-center gap-3 font-bold uppercase tracking-[0.2em] text-sm text-black bg-brandYellow px-6 py-3 group-hover:bg-white transition-colors">
              ▶ Saltar
            </span>
          </button>

          {/* Social room — your skin walks around live with others. Canvas + vectors. */}
          <button
            onClick={enterLobby}
            className="group relative w-full overflow-hidden border border-[#00cfff]/40 bg-gradient-to-br from-[#00cfff]/10 to-transparent p-8 sm:p-12 text-left transition-all hover:border-[#00cfff] mt-5"
          >
            <p className="text-[11px] uppercase tracking-[0.4em] text-brandRed mb-3">Sala Social · Beta</p>
            <h2 className="font-helvetica font-black text-4xl sm:text-6xl tracking-tighter leading-none">PRAÇA<span className="text-[#00cfff]">.</span></h2>
            <p className="mt-3 max-w-md text-white/60 text-sm leading-relaxed">
              Entra com a tua skin e passeia. Vê quem está online ao vivo e fala com balões por cima da cabeça. Tudo em tempo real.
            </p>
            <span className="mt-6 inline-flex items-center gap-3 font-bold uppercase tracking-[0.2em] text-sm text-black bg-[#00cfff] px-6 py-3 group-hover:bg-white transition-colors">
              ▶ Entrar
            </span>
          </button>

          {/* Unified leaderboard — built multi-game; OUROO for now, more games slot in later. */}
          <div className="mt-8 border border-white/10 p-5 sm:p-8">
            <div className="flex items-end justify-between mb-4">
              <h3 className="font-helvetica font-black text-2xl sm:text-3xl tracking-tight">Ranking</h3>
              <span className="text-[11px] uppercase tracking-[0.2em] text-white/40">OUROO</span>
            </div>
            <Leaderboard limit={10} showToggle />
          </div>
        </section>

        {/* ---- FOOTER ---- */}
        <footer className="mx-auto max-w-5xl px-5 sm:px-8 py-10 border-t border-white/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
          <div className="flex items-center gap-5 text-[11px] uppercase tracking-[0.2em] text-white/60">
            <a href={SPOTIFY_URL} target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Spotify</a>
            <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Instagram</a>
            <a href={`https://www.youtube.com/watch?v=${VIDEO_ID}`} target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">YouTube</a>
          </div>
          <div className="flex items-center gap-4">
            {(canInstall || iosInstall) && (
              <button onClick={handleInstall} className="text-[11px] uppercase tracking-[0.2em] border border-white/20 px-4 py-2 hover:bg-white hover:text-black transition-colors">
                📲 Instalar App
              </button>
            )}
            <span className="font-helvetica font-black text-sm tracking-tight">SUAV</span>
          </div>
        </footer>
      </div>

      {/* iOS install instructions */}
      {showIosSheet && (
        <div className="fixed inset-0 z-[60] bg-black/85 flex items-center justify-center p-6" onClick={() => setShowIosSheet(false)}>
          <div className="max-w-sm w-full border border-white/20 bg-black p-6 text-center space-y-4" onClick={(e) => e.stopPropagation()}>
            <p className="font-helvetica font-black uppercase tracking-widest text-lg">Instalar no iPhone</p>
            <p className="text-white/70 text-sm leading-relaxed">1. Toca no botão <span className="text-brandRed font-bold">Partilhar</span> no fundo do Safari</p>
            <p className="text-white/70 text-sm leading-relaxed">2. Desce e toca em <span className="text-brandRed font-bold">&quot;Adicionar ao Ecrã Principal&quot;</span></p>
            <button onClick={() => setShowIosSheet(false)} className="mt-2 text-xs font-bold uppercase tracking-widest text-black bg-brandRed px-5 py-2 active:scale-95">Entendido</button>
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
