'use client';

import { useEffect, useRef, useState } from 'react';

export function BinaryRain({ visible }: { visible: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible) {
      setMounted(true);
    } else {
      const t = setTimeout(() => setMounted(false), 650);
      return () => clearTimeout(t);
    }
  }, [visible]);

  useEffect(() => {
    if (!mounted) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const FONT = 14;
    let drops: number[] = [];

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      const cols = Math.floor(canvas.width / FONT);
      drops = Array.from({ length: cols }, () =>
        Math.floor(Math.random() * (canvas.height / FONT))
      );
    };
    resize();
    window.addEventListener('resize', resize);

    let raf: number;
    let last = 0;

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (now - last < 55) return;
      last = now;

      const W = canvas.width, H = canvas.height;
      ctx.fillStyle = 'rgba(0,0,0,0.07)';
      ctx.fillRect(0, 0, W, H);

      ctx.font = `${FONT}px monospace`;

      for (let i = 0; i < drops.length; i++) {
        const y = drops[i] * FONT;
        // Head character flickers between bright gold and deep amber
        const flicker = Math.random();
        ctx.fillStyle = flicker > 0.85 ? '#fff0a0' : flicker > 0.4 ? '#ffd23c' : '#c8860a';
        ctx.fillText(Math.random() > 0.5 ? '1' : '0', i * FONT, y);
        if (y > H && Math.random() > 0.975) {
          drops[i] = Math.floor(Math.random() * -20);
        }
        drops[i]++;
      }
    };

    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [mounted]);

  if (!mounted) return null;

  return (
    <div
      className="fixed inset-0 z-[150] bg-black pointer-events-none"
      style={{ opacity: visible ? 1 : 0, transition: 'opacity 0.9s ease-in-out' }}
    >
      <canvas ref={canvasRef} className="absolute inset-0" />
      <div className="absolute inset-0 flex items-center justify-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.4em] text-[#ffd23c]/50 animate-pulse">
          connecting
        </p>
      </div>
    </div>
  );
}
