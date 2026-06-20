'use client';

import { useEffect, useRef } from 'react';
import { drawSkinShape, type Skin } from '@/lib/skins';

// Small canvas that renders a skin so dashboard tiles show the real thing.
export function SkinPreview({ skin, size = 52, locked = false, accent }: { skin: Skin; size?: number; locked?: boolean; accent?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const dpr = Math.min(2, (typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1);
    c.width = size * dpr; c.height = size * dpr;
    const ctx = c.getContext('2d'); if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.translate(size / 2, size / 2 + 2);
    if (locked) ctx.globalAlpha = 0.25;
    drawSkinShape(ctx, skin.shape, skin.color, size * 0.45, size * 0.6, 8, accent);
    ctx.restore();
  }, [skin, size, locked, accent]);
  return <canvas ref={ref} style={{ width: size, height: size }} />;
}
