'use client';

import { useEffect, useRef } from 'react';
import { drawPerson, type PersonSpec } from '@/lib/person';

// Small canvas that renders a "design a person" avatar for the creator + previews.
export function PersonPreview({ spec, size = 64, animate = false }: { spec: PersonSpec; size?: number; animate?: boolean }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
    c.width = size * dpr; c.height = size * dpr; const ctx = c.getContext('2d'); if (!ctx) return;
    let raf = 0, af = 0;
    const draw = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, size, size);
      ctx.save(); ctx.translate(size / 2, size * 0.57); drawPerson(ctx, spec, size * 0.52, size * 0.74, af); ctx.restore();
      if (animate) { af++; raf = requestAnimationFrame(draw); }
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [spec, size, animate]);
  return <canvas ref={ref} style={{ width: size, height: size }} />;
}
