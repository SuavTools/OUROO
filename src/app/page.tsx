'use client';

import { useState } from 'react';
import { BrandText } from '@/components/BrandText';
import { GameCanvas } from '@/components/GameCanvas';
import { ArcadeCanvas } from '@/components/ArcadeCanvas';

type SystemState = 'intro' | 'hub' | 'campaign' | 'arcade';

export default function Home() {
  const [gameState, setGameState] = useState<SystemState>('intro');
  const [introStage, setIntroStage] = useState<number>(0);
  const [isZooming, setIsZooming] = useState<boolean>(false);

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
        className={`fixed inset-0 bg-brandBlack flex flex-col items-center justify-center overflow-hidden select-none z-50 p-6 ${
          introStage < 2 ? 'cursor-pointer' : 'cursor-default'
        }`}
      >
        <div 
          className={`text-center w-full max-w-4xl mx-auto space-y-12 transition-all transform origin-center will-change-transform ${
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
      <main className="fixed inset-0 bg-brandBlack flex flex-col items-center justify-center overflow-hidden select-none z-50 p-6">
        
        {/* Subtle grid background to match the game aesthetic */}
        <div className="absolute inset-0 opacity-10 bg-[linear-gradient(rgba(255,78,62,0.3)_1px,transparent_1px)] bg-[size:100%_4px] pointer-events-none" />

        <div className={`w-full max-w-5xl z-10 transition-all transform origin-center will-change-transform ${
            isZooming ? 'scale-[8] opacity-0 blur-2xl pointer-events-none' : 'scale-100 opacity-100 animate-fade-in'
          }`}
          style={{ transitionDuration: '550ms', transitionTimingFunction: 'cubic-bezier(0.7, 0, 0.84, 0)' }}
        >
          
          <div className="mb-12 border-l-4 border-brandRed pl-6">
            <span className="text-xs text-brandRed font-mono tracking-[0.4em] block uppercase animate-pulse mb-2">
              // CHEF_MODE_ENGAGED
            </span>
            <BrandText text="MAIN TERMINAL" className="text-5xl md:text-7xl font-black text-white tracking-tighter" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 font-mono">
            
            {/* MODULE 1: THE CAMPAIGN */}
            <div 
              onClick={() => launchModule('campaign')}
              className="group relative border-2 border-brandRed p-8 bg-black/40 hover:bg-brandRed transition-all cursor-pointer shadow-[6px_6px_0px_rgba(255,78,62,0.15)] hover:shadow-[6px_6px_0px_rgba(255,78,62,1)]"
            >
              <span className="text-xs text-brandRed group-hover:text-black block tracking-widest font-bold mb-2">// OPS_01</span>
              <h3 className="text-3xl font-black text-white group-hover:text-black mb-4 uppercase">Campaign</h3>
              <p className="text-xs text-gray-500 group-hover:text-black/80 leading-relaxed uppercase">
                The 17-track mastered arc. Traverse the definitive aesthetic matrix. Establish sovereignty.
              </p>
            </div>

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
      </main>
    );
  }

  // --------------------------------------------------------
  // STAGE 3: EXECUTE SELECTED GAME MODULE
  // --------------------------------------------------------
  if (gameState === 'campaign') {
    return (
      <main className="relative w-screen h-screen bg-brandBlack overflow-hidden">
        <GameCanvas />
        <button 
          onClick={() => setGameState('hub')}
          className="absolute bottom-6 left-6 z-50 text-xs font-mono text-brandRed border border-brandRed bg-black/50 px-4 py-2 hover:bg-brandRed hover:text-black transition-all"
        >
          [ ABORT TO TERMINAL ]
        </button>
      </main>
    );
  }

  if (gameState === 'arcade') {
    return (
      <main className="relative w-screen h-screen bg-brandBlack overflow-hidden">
        <ArcadeCanvas />
        <button 
          onClick={() => setGameState('hub')}
          className="absolute bottom-6 left-6 z-50 text-xs font-mono text-brandYellow border border-brandYellow bg-black/50 px-4 py-2 hover:bg-brandYellow hover:text-black transition-all"
        >
          [ ABORT TO TERMINAL ]
        </button>
      </main>
    );
  }

  return null;
}


