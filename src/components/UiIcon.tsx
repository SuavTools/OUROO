'use client';

import { useEffect, useRef } from 'react';
import { drawCatIcon } from '@/lib/uiicons';
import { drawFurniSprite, TW, TH, STACK_H } from '@/lib/furniRender';
import { defOf } from '@/lib/furni';
import type { Prefab } from '@/lib/prefabs';

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

// Pre-made building thumbnail — renders the whole prefab as a tiny iso model, depth-sorted + auto-fit.
export function PrefabThumb({ prefab, size = 52, accent = '#00cfff' }: { prefab: Prefab; size?: number; accent?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const r = dpr(); c.width = size * r; c.height = size * r;
    const ctx = c.getContext('2d'); if (!ctx) return;
    ctx.scale(r, r); ctx.clearRect(0, 0, size, size);
    // iso base point of each piece, plus the vertical span it covers (footprint diamond + its height).
    const pos = prefab.pieces.map(p => ({ p, px: (p.x - p.y) * TW, py: (p.x + p.y) * TH - p.elev * STACK_H }));
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const { p, px, py } of pos) {
      const h = defOf(p.kind).h || 1;
      minX = Math.min(minX, px - TW); maxX = Math.max(maxX, px + TW);
      minY = Math.min(minY, py - h * STACK_H - TH); maxY = Math.max(maxY, py + TH);
    }
    const bw = maxX - minX, bh = maxY - minY, pad = 4;
    const k = Math.min((size - pad * 2) / bw, (size - pad * 2) / bh);
    ctx.save();
    ctx.translate((size - bw * k) / 2 - minX * k, (size - bh * k) / 2 - minY * k);
    ctx.scale(k, k);
    // draw back-to-front so the building occludes correctly (lower x+y+elev is further back)
    for (const { p, px, py } of [...pos].sort((a, b) => (a.p.x + a.p.y + a.p.elev) - (b.p.x + b.p.y + b.p.elev)))
      drawFurniSprite(ctx, p.kind, px, py, accent, 0, p.dir);
    ctx.restore();
  }, [prefab, size, accent]);
  return <canvas ref={ref} style={{ width: size, height: size }} />;
}
