'use client';

import { useState } from 'react';
import { BrandText } from '@/components/BrandText';
import { GameCanvas } from '@/components/GameCanvas';

export default function Home() {
  const [gameState, setGameState] = useState<'intro' | 'playing'>('intro');
  const [introStage, setIntroStage] = useState<number>(0);
  const [isZooming, setIsZooming] = useState<boolean>(false);

  const handleNextStage = () => {
    if (isZooming) return;

    if (introStage < 2) {
      setIntroStage(prev => prev + 1);
    } else {
      // Trigger the cinematic warp forward zoom
      setIsZooming(true);
      setTimeout(() => {
        setGameState('playing');
      }, 550); // Adjusted slightly to fully catch the tail end of the long stretch
    }
  };

  if (gameState === 'intro') {
    return (
      <main 
        onClick={handleNextStage}
        className="fixed inset-0 bg-brandBlack flex flex-col items-center justify-center overflow-hidden select-none z-50 p-6 cursor-pointer"
      >
        <div 
          className={`text-center max-w-4xl mx-auto space-y-12 transition-all transform origin-center will-change-transform ${
            isZooming 
              ? 'scale-[8] opacity-0 blur-2xl pointer-events-none' 
              : 'scale-100 opacity-100'
          }`}
          style={{ 
            transitionDuration: '550ms',
            // Custom cinematic curve: absolute flat start, sudden exponential vertical climb out
            transitionTimingFunction: 'cubic-bezier(0.7, 0, 0.84, 0)' 
          }}
        >
          {/* Initial state prompt */}
          {introStage === 0 && (
            <div className="animate-pulse font-mono text-xs text-brandRed tracking-widest uppercase opacity-60">
              [ CLICK TO START ]
            </div>
          )}

          {/* Title 1 */}
          {introStage >= 1 && (
            <div className="animate-fade-in duration-300">
              <BrandText 
                text="ASSINO E DEVOLVO EM DOBRO." 
                className="text-4xl sm:text-6xl md:text-7xl font-black text-brandRed tracking-tighter" 
              />
            </div>
          )}

          {/* Title 2 + Init Call */}
          {introStage >= 2 && (
            <div className="animate-fade-in duration-500 pt-4 space-y-16">
              <BrandText 
                text="TUDO O QUE LEVO DEVOLVO COM ALMA." 
                className="text-2xl sm:text-4xl md:text-5xl font-extrabold text-brandYellow tracking-tight" 
              />
              
              {/* Massive separation step to isolate action from the payload header */}
              <div className="pt-12 block clear-both">
                <span className="bg-brandRed text-black font-mono font-black text-xs px-8 py-4 tracking-widest uppercase animate-pulse border border-brandRed shadow-[0_0_20px_rgba(255,78,62,0.2)]">
                  CLICK TO INITIATE GAME
                </span>
              </div>
            </div>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="relative w-screen h-screen bg-brandBlack overflow-hidden">
      <GameCanvas />
    </main>
  );
}


