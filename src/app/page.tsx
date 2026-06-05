'use client';

import { useState, useEffect } from 'react';
import { BrandText } from '@/components/BrandText';
import { GameCanvas } from '@/components/GameCanvas';

export default function Home() {
  const [gameState, setGameState] = useState<'intro' | 'playing'>('intro');
  const [introStage, setIntroStage] = useState<number>(0);

  useEffect(() => {
    if (gameState !== 'intro') return;

    // Trigger phrase 1
    const timer1 = setTimeout(() => setIntroStage(1), 1500);
    // Trigger phrase 2
    const timer2 = setTimeout(() => setIntroStage(2), 3500);
    // Launch the game canvas matrix
    const timer3 = setTimeout(() => setGameState('playing'), 6000);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
    };
  }, [gameState]);

  if (gameState === 'intro') {
    return (
      <main className="fixed inset-0 bg-brandBlack flex flex-col items-center justify-center overflow-hidden select-none z-50">
        <div className="text-center px-6">
          {introStage === 1 && (
            <div className="animate-pulse">
              <BrandText text="ASSINO E DEVOLVO EM DOBRO." className="text-4xl md:text-6xl text-brandRed" />
            </div>
          )}
          {introStage === 2 && (
            <div className="space-y-4">
              <BrandText text="TUDO O QUE LEVO DEVOLVO COM ALMA." className="text-3xl md:text-5xl text-brandYellow" />
              <div className="text-xs text-brandRed font-mono tracking-widest uppercase opacity-40 animate-ping mt-4">
                LOADING MATRIX...
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
