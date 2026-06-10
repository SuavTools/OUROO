// Shared isometric furniture renderer — the SINGLE source of truth for how a furni looks. Used by
// the PRAÇA room (full size, animated) AND by the menu thumbnails (scaled down). Everything draws in
// absolute pixels relative to a tile origin (sx, sy); callers scale/translate as needed.
//
// `accent` = the room accent colour; `t` = frame counter for the few animated pieces.

import { defOf } from './furni';

export const TILE_W = 64, TILE_H = 32, TW = TILE_W / 2, TH = TILE_H / 2, STACK_H = 26;

const hexA = (hex: string, a: number) => { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };
const shade = (hex: string, f: number) => { const n = parseInt(hex.slice(1), 16); const r = Math.min(255, Math.round(((n >> 16) & 255) * f)), g = Math.min(255, Math.round(((n >> 8) & 255) * f)), b = Math.min(255, Math.round((n & 255) * f)); return `rgb(${r},${g},${b})`; };

const diamond = (ctx: CanvasRenderingContext2D, cx: number, cy: number, hw: number, hh: number) => { ctx.beginPath(); ctx.moveTo(cx, cy - hh); ctx.lineTo(cx + hw, cy); ctx.lineTo(cx, cy + hh); ctx.lineTo(cx - hw, cy); ctx.closePath(); };

const block = (ctx: CanvasRenderingContext2D, cx: number, cyBase: number, h: number, base: string, accent: string, foot: number, emoji?: string) => {
  const hw = TW * foot * 0.9, hh = TH * foot * 0.9, Hh = h * STACK_H, cyTop = cyBase - Hh;
  ctx.fillStyle = shade(base, 0.55); ctx.beginPath(); ctx.moveTo(cx - hw, cyBase); ctx.lineTo(cx, cyBase + hh); ctx.lineTo(cx, cyTop + hh); ctx.lineTo(cx - hw, cyTop); ctx.closePath(); ctx.fill();
  ctx.fillStyle = shade(base, 0.8); ctx.beginPath(); ctx.moveTo(cx, cyBase + hh); ctx.lineTo(cx + hw, cyBase); ctx.lineTo(cx + hw, cyTop); ctx.lineTo(cx, cyTop + hh); ctx.closePath(); ctx.fill();
  ctx.fillStyle = shade(base, 1.25); diamond(ctx, cx, cyTop, hw, hh); ctx.fill();
  ctx.strokeStyle = hexA(accent, 0.35); ctx.lineWidth = 1; diamond(ctx, cx, cyTop, hw, hh); ctx.stroke();
  if (emoji) { ctx.font = `${Math.round(13 * foot + 4)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(emoji, cx, cyTop); }
  return cyTop;
};
const boxAt = (ctx: CanvasRenderingContext2D, cx: number, cyB: number, fw: number, fd: number, h: number, color: string, accent?: string, top = true) => {
  const hw = TW * fw, hh = TH * fd, Hh = h * STACK_H, cyT = cyB - Hh;
  ctx.fillStyle = shade(color, 0.55); ctx.beginPath(); ctx.moveTo(cx - hw, cyB); ctx.lineTo(cx, cyB + hh); ctx.lineTo(cx, cyT + hh); ctx.lineTo(cx - hw, cyT); ctx.closePath(); ctx.fill();
  ctx.fillStyle = shade(color, 0.82); ctx.beginPath(); ctx.moveTo(cx, cyB + hh); ctx.lineTo(cx + hw, cyB); ctx.lineTo(cx + hw, cyT); ctx.lineTo(cx, cyT + hh); ctx.closePath(); ctx.fill();
  if (top) { ctx.fillStyle = shade(color, 1.22); diamond(ctx, cx, cyT, hw, hh); ctx.fill(); if (accent) { ctx.strokeStyle = hexA(accent, 0.3); ctx.lineWidth = 1; diamond(ctx, cx, cyT, hw, hh); ctx.stroke(); } }
  return cyT;
};
const poly = (ctx: CanvasRenderingContext2D, pts: number[][], fill?: string, stroke?: string, lw = 1) => { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath(); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); } };

// ★ HI-FI lounge set — hand-drawn iso, lots of layered detail.
const drawCouch = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string) => {
  const P = (u: number, v: number, z = 0): number[] => [sx + (u - v) * TW, sy + (u + v) * TH - z * STACK_H];
  const cT = shade(base, 1.3), cR = shade(base, 0.95), cL = shade(base, 0.7), cD = shade(base, 0.48), hi = shade(base, 1.55);
  const span = (u0: number, u1: number, v0: number, v1: number, z0: number, z1: number, t: string, r: string, l: string) => {
    poly(ctx, [P(u1, v0, z1), P(u1, v1, z1), P(u1, v1, z0), P(u1, v0, z0)], r);
    poly(ctx, [P(u0, v1, z1), P(u1, v1, z1), P(u1, v1, z0), P(u0, v1, z0)], l);
    poly(ctx, [P(u0, v0, z1), P(u1, v0, z1), P(u1, v1, z1), P(u0, v1, z1)], t);
  };
  ctx.save(); ctx.globalAlpha = 0.32; ctx.fillStyle = '#000'; const sc = P(0.5, 0, 0); ctx.beginPath(); ctx.ellipse(sc[0], sc[1] + TH * 0.4, TILE_W * 1.05, TILE_H * 1.05, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  for (const [u, v] of [[-0.28, -0.28], [1.28, -0.28], [-0.28, 0.28], [1.28, 0.28]] as [number, number][]) span(u - 0.06, u + 0.06, v - 0.06, v + 0.06, 0, 0.16, '#3a2616', '#2a1c10', '#1f140a');
  span(-0.4, 1.4, -0.42, -0.16, 0.5, 1.5, cT, cR, cL);
  span(-0.42, -0.12, -0.42, 0.4, 0.5, 1.04, cT, cR, cL);
  { const a = P(-0.27, -0.01, 1.04); ctx.save(); ctx.globalAlpha = 0.45; ctx.fillStyle = hi; ctx.beginPath(); ctx.ellipse(a[0], a[1], TW * 0.42, TH * 0.7, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
  for (const [u0, u1] of [[-0.08, 0.6], [0.6, 1.32]] as [number, number][]) {
    span(u0, u1, -0.16, 0.02, 0.56, 1.42, shade(base, 1.16), cR, cL);
    for (let bx = 0; bx < 2; bx++) for (let by = 0; by < 2; by++) { const pt = P(u0 + 0.2 + bx * 0.3, 0.0, 0.82 + by * 0.32); ctx.fillStyle = cD; ctx.beginPath(); ctx.arc(pt[0], pt[1], 1.8, 0, Math.PI * 2); ctx.fill(); }
  }
  span(-0.34, 1.34, -0.16, 0.36, 0.18, 0.52, cT, cR, cL);
  for (const [u0, u1] of [[-0.3, 0.5], [0.5, 1.3]] as [number, number][]) {
    span(u0 + 0.02, u1 - 0.02, -0.28, 0.34, 0.52, 0.76, shade(base, 1.24), cR, cL);
    const c = P((u0 + u1) / 2, 0.03, 0.76); const g = ctx.createRadialGradient(c[0], c[1], 2, c[0], c[1], 28); g.addColorStop(0, 'rgba(255,255,255,0.16)'); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(c[0], c[1], TW * 0.55, TH * 0.55, 0, 0, Math.PI * 2); ctx.fill();
    poly(ctx, [P(u0 + 0.02, -0.28, 0.76), P(u1 - 0.02, -0.28, 0.76), P(u1 - 0.02, 0.34, 0.76), P(u0 + 0.02, 0.34, 0.76)], undefined, hexA(hi, 0.5), 1);
  }
  { const pc = P(0.12, 0.04, 0.82); ctx.save(); ctx.translate(pc[0], pc[1]); ctx.rotate(-0.22); ctx.fillStyle = accent; ctx.beginPath(); ctx.roundRect(-12, -9, 24, 18, 5); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.beginPath(); ctx.roundRect(-12, -9, 24, 8, 5); ctx.fill(); ctx.strokeStyle = hexA('#000', 0.2); ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(-12, -9, 24, 18, 5); ctx.stroke(); ctx.restore(); }
  span(1.12, 1.42, -0.42, 0.4, 0.5, 1.04, cT, cR, cL);
  { const a = P(1.27, -0.01, 1.04); ctx.save(); ctx.globalAlpha = 0.45; ctx.fillStyle = hi; ctx.beginPath(); ctx.ellipse(a[0], a[1], TW * 0.42, TH * 0.7, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
};

const drawArmchair = (ctx: CanvasRenderingContext2D, sx: number, sy: number, _accent: string, base: string) => {
  void _accent;
  const P = (u: number, v: number, z = 0): number[] => [sx + (u - v) * TW, sy + (u + v) * TH - z * STACK_H];
  const cT = shade(base, 1.3), cR = shade(base, 0.95), cL = shade(base, 0.7), hi = shade(base, 1.55);
  const span = (u0: number, u1: number, v0: number, v1: number, z0: number, z1: number, t: string, r: string, l: string) => { poly(ctx, [P(u1, v0, z1), P(u1, v1, z1), P(u1, v1, z0), P(u1, v0, z0)], r); poly(ctx, [P(u0, v1, z1), P(u1, v1, z1), P(u1, v1, z0), P(u0, v1, z0)], l); poly(ctx, [P(u0, v0, z1), P(u1, v0, z1), P(u1, v1, z1), P(u0, v1, z1)], t); };
  ctx.save(); ctx.globalAlpha = 0.32; ctx.fillStyle = '#000'; const sc = P(0, 0, 0); ctx.beginPath(); ctx.ellipse(sc[0], sc[1] + TH * 0.4, TILE_W * 0.62, TILE_H * 0.62, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  for (const [u, v] of [[-0.28, -0.28], [0.28, -0.28], [-0.28, 0.28], [0.28, 0.28]] as [number, number][]) span(u - 0.06, u + 0.06, v - 0.06, v + 0.06, 0, 0.16, '#3a2616', '#2a1c10', '#1f140a');
  span(-0.4, 0.4, -0.42, -0.14, 0.5, 1.45, cT, cR, cL);
  span(-0.42, -0.12, -0.42, 0.4, 0.5, 1.0, cT, cR, cL);
  span(-0.3, 0.3, -0.14, 0.36, 0.18, 0.52, cT, cR, cL);
  { const u0 = -0.28, u1 = 0.28; span(u0, u1, -0.26, 0.34, 0.52, 0.78, shade(base, 1.24), cR, cL); const c = P(0, 0.04, 0.78); const g = ctx.createRadialGradient(c[0], c[1], 2, c[0], c[1], 22); g.addColorStop(0, 'rgba(255,255,255,0.16)'); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(c[0], c[1], TW * 0.5, TH * 0.5, 0, 0, Math.PI * 2); ctx.fill(); poly(ctx, [P(u0, -0.26, 0.78), P(u1, -0.26, 0.78), P(u1, 0.34, 0.78), P(u0, 0.34, 0.78)], undefined, hexA(hi, 0.5), 1); }
  span(0.12, 0.42, -0.42, 0.4, 0.5, 1.0, cT, cR, cL);
};

const drawCoffee = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string) => {
  const P = (u: number, v: number, z = 0): number[] => [sx + (u - v) * TW, sy + (u + v) * TH - z * STACK_H];
  const cT = shade(base, 1.3), cR = shade(base, 0.95), cL = shade(base, 0.65);
  const span = (u0: number, u1: number, v0: number, v1: number, z0: number, z1: number, t: string, r: string, l: string) => { poly(ctx, [P(u1, v0, z1), P(u1, v1, z1), P(u1, v1, z0), P(u1, v0, z0)], r); poly(ctx, [P(u0, v1, z1), P(u1, v1, z1), P(u1, v1, z0), P(u0, v1, z0)], l); poly(ctx, [P(u0, v0, z1), P(u1, v0, z1), P(u1, v1, z1), P(u0, v1, z1)], t); };
  ctx.save(); ctx.globalAlpha = 0.3; ctx.fillStyle = '#000'; const sc = P(0, 0, 0); ctx.beginPath(); ctx.ellipse(sc[0], sc[1] + TH * 0.3, TILE_W * 0.6, TILE_H * 0.6, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  for (const [u, v] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]] as [number, number][]) span(u - 0.05, u + 0.05, v - 0.05, v + 0.05, 0, 0.42, cT, shade(base, 0.8), cL);
  span(-0.36, 0.36, -0.36, 0.36, 0.42, 0.56, cT, cR, cL);
  const z = 0.62; ctx.save(); ctx.globalAlpha = 0.34; ctx.fillStyle = '#bfe6ee'; poly(ctx, [P(-0.34, -0.34, z), P(0.34, -0.34, z), P(0.34, 0.34, z), P(-0.34, 0.34, z)]); ctx.fill();
  ctx.globalAlpha = 0.5; ctx.fillStyle = '#ffffff'; poly(ctx, [P(-0.24, -0.1, z), P(-0.05, -0.28, z), P(0.0, -0.22, z), P(-0.18, -0.04, z)]); ctx.fill(); ctx.restore();
  poly(ctx, [P(-0.34, -0.34, z), P(0.34, -0.34, z), P(0.34, 0.34, z), P(-0.34, 0.34, z)], undefined, hexA('#dff4f8', 0.5), 1);
  { const b = P(-0.12, 0.08, z); ctx.save(); ctx.translate(b[0], b[1]); ctx.rotate(0.2); ctx.fillStyle = accent; ctx.fillRect(-9, -6, 18, 12); ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillRect(-9, -6, 18, 2.5); ctx.restore(); }
  { const m = P(0.16, -0.05, z); ctx.fillStyle = '#e8e8ee'; ctx.beginPath(); ctx.ellipse(m[0], m[1], 5, 3, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(m[0] - 5, m[1] - 7, 10, 7); ctx.fillStyle = '#5a3a22'; ctx.beginPath(); ctx.ellipse(m[0], m[1] - 7, 5, 2.4, 0, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#e8e8ee'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(m[0] + 6, m[1] - 4, 3, -1, 1.4); ctx.stroke(); }
};

// Draw furni `kind` so its tile origin sits at (sx, sy). accent = room accent, t = frame counter.
export function drawFurniSprite(ctx: CanvasRenderingContext2D, kind: string, sx: number, sy: number, accent: string, t: number) {
  const d = defOf(kind);
  switch (d.special) {
    case 'couch': drawCouch(ctx, sx, sy, accent, d.color); break;
    case 'armchair': drawArmchair(ctx, sx, sy, accent, d.color); break;
    case 'coffee': drawCoffee(ctx, sx, sy, accent, d.color); break;
    case 'rug': { const hw = TW * 0.92, hh = TH * 0.92, top = block(ctx, sx, sy, 1, d.color, '#fff', 1); ctx.save(); ctx.globalAlpha = 0.5; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; for (let i = 1; i < 4; i++) { const f = i / 4; diamond(ctx, sx, top, hw * f, hh * f); ctx.stroke(); } ctx.restore(); break; }
    case 'water': { const top = block(ctx, sx, sy, 1, d.color, accent, 1); ctx.save(); ctx.globalAlpha = 0.4 + Math.sin(t * 0.1) * 0.2; ctx.fillStyle = '#fff'; diamond(ctx, sx, top, TW * 0.5, TH * 0.5); ctx.fill(); ctx.restore(); break; }
    case 'stair': { const top = block(ctx, sx, sy, 1, d.color, accent, 1); ctx.strokeStyle = hexA(accent, 0.6); ctx.lineWidth = 1.5; for (let i = 1; i < 3; i++) { ctx.beginPath(); ctx.moveTo(sx - TW * 0.7, top + i * 5); ctx.lineTo(sx, top + i * 5 + TH * 0.7); ctx.stroke(); } break; }
    case 'wall': { block(ctx, sx, sy, d.h, d.color, accent, d.foot); break; }
    case 'plant': { const top = block(ctx, sx, sy, 1, '#8a4f2a', accent, d.foot * 0.8); const lc = kind === 'flores' ? '#ff66aa' : '#1ED760'; const lvl = d.h; for (let r = 0; r < (lvl === 2 ? 5 : 3); r++) { const ox = (r - 1) * 7; ctx.fillStyle = lc; ctx.beginPath(); ctx.ellipse(sx + ox, top - 8 - (lvl === 2 ? r * 6 : 0), 6, 13, ox * 0.05, 0, Math.PI * 2); ctx.fill(); } break; }
    case 'lamp': { const top = block(ctx, sx, sy, d.h, '#2a2a30', accent, d.foot); ctx.save(); ctx.shadowColor = d.color; ctx.shadowBlur = 22; ctx.globalAlpha = 0.5 + Math.abs(Math.sin(t * 0.08)) * 0.4; ctx.fillStyle = d.color; ctx.beginPath(); ctx.arc(sx, top - 4, 7, 0, Math.PI * 2); ctx.fill(); ctx.restore(); break; }
    case 'speaker': { const top = block(ctx, sx, sy, 2, '#23232f', accent, 0.7); ctx.fillStyle = hexA(accent, 0.6 + Math.abs(Math.sin(t * 0.15)) * 0.4); ctx.beginPath(); ctx.arc(sx + 8, top + 26, 6, 0, Math.PI * 2); ctx.fill(); break; }
    case 'tv': { const top = block(ctx, sx, sy, d.h, d.color, accent, d.foot); ctx.fillStyle = hexA(accent, 0.7); ctx.fillRect(sx - 14, top - 12, 28, 18); ctx.fillStyle = `hsl(${(t * 3) % 360},80%,60%)`; ctx.globalAlpha = 0.5; ctx.fillRect(sx - 12, top - 10, 24, 14); ctx.globalAlpha = 1; break; }
    case 'sign': { const top = block(ctx, sx, sy, 1, d.color, accent, d.foot); ctx.fillStyle = accent; ctx.font = '900 10px Helvetica, Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('SUAV', sx, top); break; }
    case 'disco': { const cy = sy - 2.6 * STACK_H; ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(sx, cy - 22); ctx.lineTo(sx, cy - 56); ctx.stroke(); ctx.save(); ctx.translate(sx, cy); ctx.rotate(t * 0.04); const grd = ctx.createRadialGradient(-6, -6, 3, 0, 0, 20); grd.addColorStop(0, '#fff'); grd.addColorStop(1, '#8893b8'); ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(0, 0, 20, 0, Math.PI * 2); ctx.fill(); for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + t * 0.04; ctx.fillStyle = `hsla(${(t * 4 + i * 60) % 360},90%,65%,0.9)`; ctx.beginPath(); ctx.arc(Math.cos(a) * 12, Math.sin(a) * 12, 3.5, 0, Math.PI * 2); ctx.fill(); } ctx.restore(); break; }
    case 'chair': {
      boxAt(ctx, sx, sy - TH * 0.2, 0.52, 0.14, 1.15, shade(d.color, 1.08), accent);
      const top = boxAt(ctx, sx, sy + TH * 0.16, 0.52, 0.5, 0.5, d.color, accent);
      ctx.fillStyle = shade(d.color, 1.35); diamond(ctx, sx, top, TW * 0.46, TH * 0.46); ctx.fill();
      break;
    }
    case 'sofa': {
      const w = d.foot * 0.92;
      boxAt(ctx, sx, sy - TH * 0.22, w, 0.16, 1.0, shade(d.color, 1.06), accent);
      boxAt(ctx, sx - TW * w * 0.9, sy, 0.16, 0.5, 0.85, shade(d.color, 0.92), accent);
      boxAt(ctx, sx + TW * w * 0.9, sy, 0.16, 0.5, 0.85, shade(d.color, 0.92), accent);
      const top = boxAt(ctx, sx, sy + TH * 0.16, w, 0.52, 0.5, d.color, accent);
      ctx.fillStyle = shade(d.color, 1.32); diamond(ctx, sx, top, TW * w * 0.9, TH * 0.46); ctx.fill();
      break;
    }
    case 'stool': {
      const top = boxAt(ctx, sx, sy, 0.4, 0.4, 0.7, shade(d.color, 0.85), accent, false);
      ctx.fillStyle = shade(d.color, 1.25); ctx.beginPath(); ctx.ellipse(sx, top, TW * 0.4, TH * 0.4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = hexA(accent, 0.3); ctx.lineWidth = 1; ctx.stroke();
      break;
    }
    case 'throne': {
      boxAt(ctx, sx, sy - TH * 0.22, 0.66, 0.16, 2.1, d.color, accent);
      boxAt(ctx, sx - TW * 0.62, sy, 0.16, 0.5, 1.0, d.color, accent);
      boxAt(ctx, sx + TW * 0.62, sy, 0.16, 0.5, 1.0, d.color, accent);
      boxAt(ctx, sx, sy + TH * 0.15, 0.66, 0.5, 0.7, shade(d.color, 1.12), accent);
      ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(sx, sy - 2.1 * STACK_H + 7, 4, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'puff': {
      ctx.fillStyle = shade(d.color, 0.7); ctx.beginPath(); ctx.ellipse(sx, sy, TW * 0.5, TH * 0.52, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = shade(d.color, 1.15); ctx.beginPath(); ctx.ellipse(sx, sy - 9, TW * 0.5, TH * 0.46, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = hexA(accent, 0.3); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(sx - TW * 0.5, sy - 4); ctx.lineTo(sx, sy - 9 + TH * 0.46); ctx.lineTo(sx + TW * 0.5, sy - 4); ctx.stroke();
      break;
    }
    case 'table': {
      const w = d.foot, legH = 0.7 * STACK_H, top = sy - legH;
      ctx.strokeStyle = shade(d.color, 0.55); ctx.lineWidth = 3;
      for (const [lx, ly] of [[-TW * w * 0.8, 0], [TW * w * 0.8, 0], [0, -TH * w * 0.8], [0, TH * w * 0.8]] as [number, number][]) { ctx.beginPath(); ctx.moveTo(sx + lx, sy + ly); ctx.lineTo(sx + lx, sy + ly - legH); ctx.stroke(); }
      ctx.fillStyle = shade(d.color, 0.7); ctx.beginPath(); ctx.moveTo(sx - TW * w, top); ctx.lineTo(sx, top + TH * w); ctx.lineTo(sx + TW * w, top); ctx.lineTo(sx + TW * w, top + 4); ctx.lineTo(sx, top + TH * w + 4); ctx.lineTo(sx - TW * w, top + 4); ctx.closePath(); ctx.fill();
      ctx.fillStyle = shade(d.color, 1.22); diamond(ctx, sx, top, TW * w, TH * w); ctx.fill();
      ctx.strokeStyle = hexA(accent, 0.3); ctx.lineWidth = 1; diamond(ctx, sx, top, TW * w, TH * w); ctx.stroke();
      break;
    }
    case 'counter': { const top = boxAt(ctx, sx, sy, d.foot, d.foot, 2, d.color, accent); ctx.fillStyle = shade(d.color, 1.4); diamond(ctx, sx, top - 2, TW * d.foot * 1.06, TH * d.foot * 1.06); ctx.fill(); break; }
    case 'shelf': {
      const top = boxAt(ctx, sx, sy, d.foot, d.foot, 2, d.color, accent);
      ctx.strokeStyle = hexA(accent, 0.4); ctx.lineWidth = 1.5;
      for (let i = 1; i <= 2; i++) { const yy = top + i * (2 * STACK_H / 3); ctx.beginPath(); ctx.moveTo(sx - TW * d.foot, yy - TH * d.foot); ctx.lineTo(sx + TW * d.foot, yy + TH * d.foot); ctx.stroke(); }
      break;
    }
    case 'fridge': {
      const top = boxAt(ctx, sx, sy, d.foot, d.foot, 2, d.color, accent);
      ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(sx + TW * d.foot * 0.5, top + TH * d.foot * 0.5); ctx.lineTo(sx + TW * d.foot * 0.5, top + TH * d.foot * 0.5 + 1.8 * STACK_H); ctx.stroke();
      ctx.strokeStyle = shade(d.color, 0.5); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(sx + TW * d.foot * 0.18, top + 16); ctx.lineTo(sx + TW * d.foot * 0.18, top + 34); ctx.stroke();
      break;
    }
    case 'vending': {
      const top = boxAt(ctx, sx, sy, d.foot, d.foot, 2, d.color, accent);
      ctx.fillStyle = 'rgba(10,20,30,0.7)'; ctx.beginPath(); ctx.moveTo(sx + 4, top + TH * d.foot * 0.3); ctx.lineTo(sx + TW * d.foot * 0.72, top); ctx.lineTo(sx + TW * d.foot * 0.72, top + 1.6 * STACK_H); ctx.lineTo(sx + 4, top + TH * d.foot * 0.3 + 1.6 * STACK_H); ctx.closePath(); ctx.fill();
      ctx.fillStyle = hexA(accent, 0.6); ctx.fillRect(sx - TW * d.foot * 0.55, top + 5, TW * d.foot * 0.5, 4);
      break;
    }
    case 'jukebox': {
      const top = boxAt(ctx, sx, sy, d.foot, d.foot, 2, d.color, accent);
      ctx.fillStyle = shade(d.color, 1.4); ctx.beginPath(); ctx.ellipse(sx, top, TW * d.foot, TH * d.foot, 0, Math.PI, 0); ctx.fill();
      for (let i = 0; i < 5; i++) { ctx.fillStyle = `hsl(${(t * 4 + i * 70) % 360},90%,62%)`; ctx.beginPath(); ctx.arc(sx - 12 + i * 6, top + 10, 2, 0, Math.PI * 2); ctx.fill(); }
      break;
    }
    case 'frame': { const w = 18, h = 24, by = sy - 6; ctx.fillStyle = d.color; ctx.fillRect(sx - w / 2 - 3, by - h - 3, w + 6, h + 6); ctx.fillStyle = '#243a6a'; ctx.fillRect(sx - w / 2, by - h, w, h); ctx.fillStyle = hexA(accent, 0.5); ctx.fillRect(sx - w / 2 + 3, by - h + 4, w - 6, 5); break; }
    case 'trophy': { const cy = sy - 5; ctx.fillStyle = '#b88a14'; ctx.fillRect(sx - 6, cy - 2, 12, 4); ctx.fillStyle = d.color; ctx.fillRect(sx - 2, cy - 11, 4, 9); ctx.beginPath(); ctx.moveTo(sx - 9, cy - 24); ctx.quadraticCurveTo(sx, cy - 9, sx + 9, cy - 24); ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#fff3a0'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(sx - 9, cy - 20, 4, Math.PI * 0.4, Math.PI * 1.5); ctx.stroke(); ctx.beginPath(); ctx.arc(sx + 9, cy - 20, 4, -Math.PI * 0.5, Math.PI * 0.6); ctx.stroke(); break; }
    case 'vase': { const cy = sy - 4; ctx.fillStyle = d.color; ctx.beginPath(); ctx.moveTo(sx - 7, cy); ctx.quadraticCurveTo(sx - 13, cy - 13, sx - 4, cy - 22); ctx.lineTo(sx + 4, cy - 22); ctx.quadraticCurveTo(sx + 13, cy - 13, sx + 7, cy); ctx.closePath(); ctx.fill(); ctx.strokeStyle = shade(d.color, 1.35); ctx.lineWidth = 1; ctx.stroke(); break; }
    case 'duck': { const cy = sy - 4; ctx.fillStyle = d.color; ctx.beginPath(); ctx.ellipse(sx - 1, cy - 6, 11, 8, 0, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(sx + 7, cy - 14, 5, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#ff8800'; ctx.beginPath(); ctx.moveTo(sx + 11, cy - 14); ctx.lineTo(sx + 18, cy - 13); ctx.lineTo(sx + 11, cy - 11); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(sx + 8, cy - 15, 1.2, 0, Math.PI * 2); ctx.fill(); break; }
    case 'cone': { const cy = sy - 2; ctx.fillStyle = d.color; ctx.beginPath(); ctx.moveTo(sx, cy - 28); ctx.lineTo(sx + 10, cy); ctx.lineTo(sx - 10, cy); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(sx - 6, cy - 13); ctx.lineTo(sx + 6, cy - 13); ctx.lineTo(sx + 5, cy - 9); ctx.lineTo(sx - 5, cy - 9); ctx.closePath(); ctx.fill(); ctx.fillStyle = shade(d.color, 0.8); ctx.fillRect(sx - 12, cy - 2, 24, 4); break; }
    case 'statue': { const ped = boxAt(ctx, sx, sy, d.foot * 0.8, d.foot * 0.8, 0.45, '#55555f', accent); ctx.fillStyle = d.color; ctx.beginPath(); ctx.moveTo(sx - 8, ped); ctx.lineTo(sx + 8, ped); ctx.lineTo(sx + 5, ped - 30); ctx.lineTo(sx - 5, ped - 30); ctx.closePath(); ctx.fill(); ctx.beginPath(); ctx.arc(sx, ped - 36, 6, 0, Math.PI * 2); ctx.fill(); break; }
    default: block(ctx, sx, sy, d.h, d.color, accent, d.foot);
  }
}
