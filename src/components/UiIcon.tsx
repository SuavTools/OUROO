'use client';

import { useEffect, useRef } from 'react';
import { drawCatIcon, drawFurniThumb } from '@/lib/uiicons';
import { type FurniDef } from '@/lib/furni';

const dpr = () => Math.min(2, (typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1);

// Self-drawn category glyph (replaces the category emojis).
export function CatIcon({ catId, size = 22, color = '#cfd2dc' }: { catId: string; size?: number; color?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const r = dpr(); c.width = size * r; c.height = size * r;
    const ctx = c.getContext('2d'); if (!ctx) return;
    ctx.scale(r, r); ctx.clearRect(0, 0, size, size);
    ctx.save(); ctx.translate(size / 2, size / 2); drawCatIcon(ctx, catId, size, color); ctx.restore();
  }, [catId, size, color]);
  return <canvas ref={ref} style={{ width: size, height: size }} />;
}

// Generic iso thumbnail for a furni (replaces the per-item emoji).
export function FurniThumb({ def, size = 34 }: { def: FurniDef; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const r = dpr(); c.width = size * r; c.height = size * r;
    const ctx = c.getContext('2d'); if (!ctx) return;
    ctx.scale(r, r); ctx.clearRect(0, 0, size, size);
    ctx.save(); ctx.translate(size / 2, size / 2); drawFurniThumb(ctx, def, size); ctx.restore();
  }, [def, size]);
  return <canvas ref={ref} style={{ width: size, height: size }} />;
}
