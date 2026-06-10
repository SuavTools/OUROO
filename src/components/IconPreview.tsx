'use client';

import { useEffect, useRef } from 'react';
import { drawIconSpec, type IconSpec } from '@/lib/icons';

// Small animated canvas that renders a custom icon spec — the icon equivalent of <SkinPreview>.
export function IconPreview({ spec, size = 48, animate = false }: { spec: IconSpec; size?: number; animate?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const dpr = Math.min(2, (typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1);
    c.width = size * dpr; c.height = size * dpr;
    const ctx = c.getContext('2d'); if (!ctx) return;
    ctx.scale(dpr, dpr);
    let raf = 0; let t = 0;
    const render = () => {
      ctx.clearRect(0, 0, size, size);
      ctx.save(); ctx.translate(size / 2, size / 2);
      drawIconSpec(ctx, spec, size * 0.92, t);
      ctx.restore();
      if (animate) { t++; raf = requestAnimationFrame(render); }
    };
    render();
    return () => { if (raf) cancelAnimationFrame(raf); };
  }, [spec, size, animate]);
  return <canvas ref={ref} style={{ width: size, height: size }} />;
}
