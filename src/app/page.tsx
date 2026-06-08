'use client';

import { useState, useEffect, useRef } from 'react';
import { ArcadeCanvas } from '@/components/ArcadeCanvas';

type View = 'landing' | 'arcade';

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
  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
    const onBIP = (e: Event) => { e.preventDefault(); deferredPrompt.current = e as never; setCanInstall(true); };
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
    if (dp?.prompt) { dp.prompt(); await dp.userChoice?.catch(() => {}); deferredPrompt.current = null; setCanInstall(false); }
    else if (iosInstall) setShowIosSheet(true);
  };

  const enterArcade = () => {
    if (isZooming) return;
    setIsZooming(true);
    setTimeout(() => { setView('arcade'); setIsZooming(false); }, 550);
  };

  // ==========================================================================
  // THE ARCADE
  // ==========================================================================
  if (view === 'arcade') {
    return (
      <main className="relative w-screen h-[100dvh] bg-brandBlack overflow-hidden touch-none">
        <ArcadeCanvas stageScale={stage.scale} isMobileStage={stage.mobile} />
        <button
          onClick={() => setView('landing')}
          className="absolute bottom-3 left-1/2 -translate-x-1/2 z-50 text-[10px] font-mono text-brandYellow border border-brandYellow bg-black/60 px-3 py-1.5 hover:bg-brandYellow hover:text-black transition-all"
        >
          [ SAIR PARA SUAV ]
        </button>
      </main>
    );
  }

  // ==========================================================================
  // SUAV — ARTIST LANDING
  // ==========================================================================
  return (
    <main className="relative min-h-[100dvh] w-full bg-black text-white overflow-x-hidden">
      <div
        className={`transition-all duration-[550ms] will-change-transform ${isZooming ? 'scale-[6] opacity-0 blur-2xl pointer-events-none' : 'scale-100 opacity-100'}`}
        style={{ transitionTimingFunction: 'cubic-bezier(0.7,0,0.84,0)' }}
      >
        {/* ---- NAV ---- */}
        <header className="sticky top-0 z-40 backdrop-blur-md bg-black/70 border-b border-white/10">
          <nav className="mx-auto max-w-5xl px-5 sm:px-8 h-14 flex items-center justify-between">
            <a href="#top" className="font-helvetica font-black text-xl tracking-tight">SUAV</a>
            <div className="flex items-center gap-5 text-[11px] uppercase tracking-[0.2em] text-white/60">
              <a href="#listen" className="hidden sm:inline hover:text-white transition-colors">Ouvir</a>
              <a href="#live" className="hidden sm:inline hover:text-white transition-colors">Concertos</a>
              <button onClick={enterArcade} className="font-bold text-black bg-brandRed px-4 py-1.5 tracking-[0.2em] hover:bg-white transition-colors">Jogar ▸</button>
            </div>
          </nav>
        </header>

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
    </main>
  );
}
