'use client';

import { useEffect, useRef } from 'react';
import { drawCatIcon } from '@/lib/uiicons';
import { drawFurniSprite, TW, TH } from '@/lib/furniRender';
import { defOf } from '@/lib/furni';

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

// Real furniture thumbnail — the actual iso sprite from the shared renderer, scaled to fit the box.
export function FurniSprite({ kind, size = 38, accent = '#00cfff' }: { kind: string; size?: number; accent?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const r = dpr(); c.width = size * r; c.height = size * r;
    const ctx = c.getContext('2d'); if (!ctx) return;
    ctx.scale(r, r); ctx.clearRect(0, 0, size, size);
    const d = defOf(kind);
    const [sw, sh] = d.span ?? [1, 1];
    // Multi-tile pieces draw off-origin; shift so the sprite's footprint centre lands in the box.
    const offX = ((sw - 1) / 2 - (sh - 1) / 2) * TW;
    const offY = ((sw - 1) / 2 + (sh - 1) / 2) * TH;
    const k = size / 104;   // full-size furni metrics → small box
    ctx.save();
    ctx.translate(size / 2, size * 0.7);
    ctx.scale(k, k);
    drawFurniSprite(ctx, kind, -offX, -offY, accent, 0);
    ctx.restore();
  }, [kind, size, accent]);
  return <canvas ref={ref} style={{ width: size, height: size }} />;
}
