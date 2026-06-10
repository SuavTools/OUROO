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

// ───────── 4-way rotation framework ─────────
// A directional piece is a list of iso-box "parts". For a given dir (0..3 = 90° steps) each part's
// (u,v) footprint is rotated, then parts are drawn back-to-front (depth = nearest rotated corner) so
// occlusion is correct in every direction. Box faces are world-axis (+u right, +v left, top) — always
// camera-facing — so nothing turns inside-out. Decorations attach to the always-visible top.
const rotUV = (u: number, v: number, dir: number, cu: number, cv: number): [number, number] => {
  let du = u - cu, dv = v - cv; const n = ((dir % 4) + 4) % 4;
  for (let i = 0; i < n; i++) { const t = du; du = -dv; dv = t; }
  return [du + cu, dv + cv];
};
type IsoPart = { u0: number; u1: number; v0: number; v1: number; z0: number; z1: number; t: string; r: string; l: string };
const drawParts = (ctx: CanvasRenderingContext2D, sx: number, sy: number, dir: number, cu: number, cv: number, parts: IsoPart[], deco?: (P: (u: number, v: number, z?: number) => number[]) => void) => {
  const W = (u: number, v: number, z: number): number[] => [sx + (u - v) * TW, sy + (u + v) * TH - z * STACK_H];
  const corners = (p: IsoPart): [number, number][] => [[p.u0, p.v0], [p.u1, p.v0], [p.u1, p.v1], [p.u0, p.v1]];
  const depth = (p: IsoPart) => Math.max(...corners(p).map(([u, v]) => { const [ru, rv] = rotUV(u, v, dir, cu, cv); return ru + rv; }));
  for (const p of [...parts].sort((a, b) => depth(a) - depth(b))) {
    let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
    for (const [u, v] of corners(p)) { const [ru, rv] = rotUV(u, v, dir, cu, cv); u0 = Math.min(u0, ru); u1 = Math.max(u1, ru); v0 = Math.min(v0, rv); v1 = Math.max(v1, rv); }
    poly(ctx, [W(u1, v0, p.z1), W(u1, v1, p.z1), W(u1, v1, p.z0), W(u1, v0, p.z0)], p.r);
    poly(ctx, [W(u0, v1, p.z1), W(u1, v1, p.z1), W(u1, v1, p.z0), W(u0, v1, p.z0)], p.l);
    poly(ctx, [W(u0, v0, p.z1), W(u1, v0, p.z1), W(u1, v1, p.z1), W(u0, v1, p.z1)], p.t);
  }
  if (deco) deco((u, v, z = 0) => { const [ru, rv] = rotUV(u, v, dir, cu, cv); return [sx + (ru - rv) * TW, sy + (ru + rv) * TH - z * STACK_H]; });
};
const legs = (us: [number, number][], z1: number): IsoPart[] => us.map(([u, v]) => ({ u0: u - 0.05, u1: u + 0.05, v0: v - 0.05, v1: v + 0.05, z0: 0, z1, t: '#3a2616', r: '#2a1c10', l: '#1f140a' }));
const drawChair = (ctx: CanvasRenderingContext2D, sx: number, sy: number, _a: string, base: string, dir: number) => {
  void _a; const cT = shade(base, 1.32), cR = shade(base, 0.98), cL = shade(base, 0.64);
  const parts: IsoPart[] = [...legs([[-0.28, -0.28], [0.28, -0.28], [-0.28, 0.28], [0.28, 0.28]], 0.16),
    { u0: -0.34, u1: 0.34, v0: -0.44, v1: -0.26, z0: 0.16, z1: 1.25, t: cT, r: cR, l: cL },
    { u0: -0.34, u1: 0.34, v0: -0.24, v1: 0.34, z0: 0.16, z1: 0.5, t: cT, r: cR, l: cL },
    { u0: -0.3, u1: 0.3, v0: -0.2, v1: 0.32, z0: 0.5, z1: 0.72, t: shade(base, 1.24), r: cR, l: cL }];
  drawParts(ctx, sx, sy, dir, 0, 0, parts);
};

const drawSofaR = (ctx: CanvasRenderingContext2D, sx: number, sy: number, _a: string, base: string, dir: number) => {
  void _a; const cT = shade(base, 1.32), cR = shade(base, 0.98), cL = shade(base, 0.64), hi = shade(base, 1.6);
  const parts: IsoPart[] = [
    { u0: -0.45, u1: 0.45, v0: -0.46, v1: -0.28, z0: 0.14, z1: 1.0, t: cT, r: cR, l: cL },
    { u0: -0.46, u1: -0.3, v0: -0.46, v1: 0.4, z0: 0.14, z1: 0.78, t: cT, r: cR, l: cL },
    { u0: 0.3, u1: 0.46, v0: -0.46, v1: 0.4, z0: 0.14, z1: 0.78, t: cT, r: cR, l: cL },
    { u0: -0.32, u1: 0.32, v0: -0.26, v1: 0.42, z0: 0.14, z1: 0.46, t: cT, r: cR, l: cL },
    { u0: -0.3, u1: 0.3, v0: -0.22, v1: 0.4, z0: 0.46, z1: 0.66, t: shade(base, 1.24), r: cR, l: cL }];
  drawParts(ctx, sx, sy, dir, 0, 0, parts, (P) => {
    for (const uc of [-0.38, 0.38]) { const a = P(uc, -0.03, 0.78); const g = ctx.createRadialGradient(a[0] - 2, a[1] - 3, 1, a[0], a[1], TW * 0.3); g.addColorStop(0, hi); g.addColorStop(0.6, cT); g.addColorStop(1, cR); ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(a[0], a[1], TW * 0.26, TH * 0.46, 0, 0, Math.PI * 2); ctx.fill(); }
  });
};

const drawThroneR = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  const cT = shade(base, 1.32), cR = shade(base, 0.98), cL = shade(base, 0.62);
  const parts: IsoPart[] = [
    { u0: -0.4, u1: 0.4, v0: -0.46, v1: -0.3, z0: 0.15, z1: 2.1, t: cT, r: cR, l: cL },
    { u0: -0.42, u1: -0.28, v0: -0.46, v1: 0.4, z0: 0.15, z1: 1.0, t: cT, r: cR, l: cL },
    { u0: 0.28, u1: 0.42, v0: -0.46, v1: 0.4, z0: 0.15, z1: 1.0, t: cT, r: cR, l: cL },
    { u0: -0.34, u1: 0.34, v0: -0.28, v1: 0.42, z0: 0.15, z1: 0.7, t: shade(base, 1.12), r: cR, l: cL }];
  drawParts(ctx, sx, sy, dir, 0, 0, parts, (P) => { const g = P(0, -0.38, 2.1); ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(g[0], g[1], 3.5, 0, Math.PI * 2); ctx.fill(); });
};

// ★ HI-FI lounge set — 2-tile couch, centered local frame so it rotates 4 ways.
const drawCouch = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  const cT = shade(base, 1.3), cR = shade(base, 0.95), cL = shade(base, 0.7), hi = shade(base, 1.55), bc = shade(base, 1.16), sc = shade(base, 1.24);
  const parts: IsoPart[] = [
    ...legs([[-0.78, -0.28], [0.78, -0.28], [-0.78, 0.28], [0.78, 0.28]], 0.16),
    { u0: -0.9, u1: 0.9, v0: -0.42, v1: -0.16, z0: 0.5, z1: 1.5, t: cT, r: cR, l: cL },              // back
    { u0: -0.58, u1: 0.08, v0: -0.18, v1: 0.0, z0: 0.56, z1: 1.42, t: bc, r: cR, l: cL },            // back cushion L
    { u0: 0.08, u1: 0.82, v0: -0.18, v1: 0.0, z0: 0.56, z1: 1.42, t: bc, r: cR, l: cL },             // back cushion R
    { u0: -0.92, u1: -0.62, v0: -0.42, v1: 0.4, z0: 0.5, z1: 1.04, t: cT, r: cR, l: cL },            // left arm
    { u0: 0.62, u1: 0.92, v0: -0.42, v1: 0.4, z0: 0.5, z1: 1.04, t: cT, r: cR, l: cL },              // right arm
    { u0: -0.84, u1: 0.84, v0: -0.16, v1: 0.36, z0: 0.18, z1: 0.52, t: cT, r: cR, l: cL },           // seat base
    { u0: -0.78, u1: -0.02, v0: -0.28, v1: 0.34, z0: 0.52, z1: 0.78, t: sc, r: cR, l: cL },          // seat cushion L
    { u0: 0.02, u1: 0.78, v0: -0.28, v1: 0.34, z0: 0.52, z1: 0.78, t: sc, r: cR, l: cL }];           // seat cushion R
  drawParts(ctx, sx, sy, dir, 0, 0, parts, (P) => {
    for (const [u0, u1] of [[-0.78, -0.02], [0.02, 0.78]] as [number, number][]) poly(ctx, [P(u0, -0.28, 0.78), P(u1, -0.28, 0.78), P(u1, 0.34, 0.78), P(u0, 0.34, 0.78)], undefined, hexA(hi, 0.5), 1);
    for (const uc of [-0.77, 0.77]) { const a = P(uc, -0.01, 1.04); ctx.save(); ctx.globalAlpha = 0.45; ctx.fillStyle = hi; ctx.beginPath(); ctx.ellipse(a[0], a[1], TW * 0.42, TH * 0.7, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
    const pc = P(-0.38, 0.04, 0.82); ctx.save(); ctx.translate(pc[0], pc[1]); ctx.rotate(-0.22); ctx.fillStyle = accent; ctx.beginPath(); ctx.roundRect(-12, -9, 24, 18, 5); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.beginPath(); ctx.roundRect(-12, -9, 24, 8, 5); ctx.fill(); ctx.strokeStyle = hexA('#000', 0.2); ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(-12, -9, 24, 18, 5); ctx.stroke(); ctx.restore();
  });
};

const drawArmchair = (ctx: CanvasRenderingContext2D, sx: number, sy: number, _accent: string, base: string, dir: number) => {
  void _accent; const cT = shade(base, 1.32), cR = shade(base, 0.98), cL = shade(base, 0.64), hi = shade(base, 1.62);
  const parts: IsoPart[] = [...legs([[-0.34, -0.3], [0.34, -0.3], [-0.34, 0.34], [0.34, 0.34]], 0.16),
    { u0: -0.42, u1: 0.42, v0: -0.46, v1: -0.26, z0: 0.16, z1: 1.36, t: cT, r: cR, l: cL },     // back
    { u0: -0.42, u1: -0.3, v0: -0.44, v1: 0.4, z0: 0.16, z1: 0.92, t: cT, r: cR, l: cL },       // left arm
    { u0: 0.3, u1: 0.42, v0: -0.44, v1: 0.4, z0: 0.16, z1: 0.92, t: cT, r: cR, l: cL },         // right arm
    { u0: -0.32, u1: 0.32, v0: -0.24, v1: 0.4, z0: 0.16, z1: 0.46, t: cT, r: cR, l: cL },       // seat base
    { u0: -0.3, u1: 0.3, v0: -0.2, v1: 0.38, z0: 0.46, z1: 0.72, t: shade(base, 1.24), r: cR, l: cL }]; // cushion
  drawParts(ctx, sx, sy, dir, 0, 0, parts, (P) => {
    for (const uc of [-0.36, 0.36]) { const a = P(uc, -0.02, 0.92); const g = ctx.createRadialGradient(a[0] - 2, a[1] - 3, 1, a[0], a[1], TW * 0.34); g.addColorStop(0, hi); g.addColorStop(0.6, cT); g.addColorStop(1, cR); ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(a[0], a[1], TW * 0.28, TH * 0.5, 0, 0, Math.PI * 2); ctx.fill(); }
  });
};

const drawCoffee = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string) => {
  const P = (u: number, v: number, z = 0): number[] => [sx + (u - v) * TW, sy + (u + v) * TH - z * STACK_H];
  const cT = shade(base, 1.3), cR = shade(base, 0.95), cL = shade(base, 0.65);
  const span = (u0: number, u1: number, v0: number, v1: number, z0: number, z1: number, t: string, r: string, l: string) => { poly(ctx, [P(u1, v0, z1), P(u1, v1, z1), P(u1, v1, z0), P(u1, v0, z0)], r); poly(ctx, [P(u0, v1, z1), P(u1, v1, z1), P(u1, v1, z0), P(u0, v1, z0)], l); poly(ctx, [P(u0, v0, z1), P(u1, v0, z1), P(u1, v1, z1), P(u0, v1, z1)], t); };
  for (const [u, v] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]] as [number, number][]) span(u - 0.05, u + 0.05, v - 0.05, v + 0.05, 0, 0.42, cT, shade(base, 0.8), cL);
  span(-0.36, 0.36, -0.36, 0.36, 0.42, 0.56, cT, cR, cL);
  const z = 0.62; ctx.save(); ctx.globalAlpha = 0.34; ctx.fillStyle = '#bfe6ee'; poly(ctx, [P(-0.34, -0.34, z), P(0.34, -0.34, z), P(0.34, 0.34, z), P(-0.34, 0.34, z)]); ctx.fill();
  ctx.globalAlpha = 0.5; ctx.fillStyle = '#ffffff'; poly(ctx, [P(-0.24, -0.1, z), P(-0.05, -0.28, z), P(0.0, -0.22, z), P(-0.18, -0.04, z)]); ctx.fill(); ctx.restore();
  poly(ctx, [P(-0.34, -0.34, z), P(0.34, -0.34, z), P(0.34, 0.34, z), P(-0.34, 0.34, z)], undefined, hexA('#dff4f8', 0.5), 1);
  { const b = P(-0.12, 0.08, z); ctx.save(); ctx.translate(b[0], b[1]); ctx.rotate(0.2); ctx.fillStyle = accent; ctx.fillRect(-9, -6, 18, 12); ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillRect(-9, -6, 18, 2.5); ctx.restore(); }
  { const m = P(0.16, -0.05, z); ctx.fillStyle = '#e8e8ee'; ctx.beginPath(); ctx.ellipse(m[0], m[1], 5, 3, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(m[0] - 5, m[1] - 7, 10, 7); ctx.fillStyle = '#5a3a22'; ctx.beginPath(); ctx.ellipse(m[0], m[1] - 7, 5, 2.4, 0, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#e8e8ee'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(m[0] + 6, m[1] - 4, 3, -1, 1.4); ctx.stroke(); }
};

// ═══════════════════════════════════════════════════════════════════════════════════════════
// ★ HI-FI tier — highest-fidelity pieces (layered shadows, tufting, gradients, specular).
// ═══════════════════════════════════════════════════════════════════════════════════════════

// Tufted Chesterfield-style sofa (2 tiles): diamond button tufting, rolled arms, brass feet + nailheads.
// Tufted Chesterfield (2 tiles, centered local frame so it rotates 4 ways).
const drawCouchHC = (ctx: CanvasRenderingContext2D, sx: number, sy: number, _a: string, base: string, dir: number) => {
  void _a; const cT = shade(base, 1.34), cR = shade(base, 1.0), cL = shade(base, 0.62), hi = shade(base, 1.8), brass = '#c9a44f';
  const parts: IsoPart[] = [
    { u0: -0.825, u1: -0.735, v0: -0.305, v1: -0.215, z0: 0, z1: 0.2, t: shade(brass, 1.2), r: shade(brass, 0.85), l: shade(brass, 0.55) },
    { u0: 0.735, u1: 0.825, v0: -0.305, v1: -0.215, z0: 0, z1: 0.2, t: shade(brass, 1.2), r: shade(brass, 0.85), l: shade(brass, 0.55) },
    { u0: -0.825, u1: -0.735, v0: 0.275, v1: 0.365, z0: 0, z1: 0.2, t: shade(brass, 1.2), r: shade(brass, 0.85), l: shade(brass, 0.55) },
    { u0: 0.735, u1: 0.825, v0: 0.275, v1: 0.365, z0: 0, z1: 0.2, t: shade(brass, 1.2), r: shade(brass, 0.85), l: shade(brass, 0.55) },
    { u0: -0.92, u1: 0.92, v0: -0.48, v1: -0.18, z0: 0.42, z1: 1.5, t: cT, r: cR, l: cL },         // back
    { u0: -0.92, u1: -0.66, v0: -0.46, v1: 0.42, z0: 0.42, z1: 1.06, t: cT, r: cR, l: cL },        // left arm
    { u0: 0.66, u1: 0.92, v0: -0.46, v1: 0.42, z0: 0.42, z1: 1.06, t: cT, r: cR, l: cL },          // right arm
    { u0: -0.84, u1: 0.84, v0: -0.18, v1: 0.4, z0: 0.16, z1: 0.5, t: cT, r: cR, l: cL },           // seat base
    { u0: -0.77, u1: -0.03, v0: -0.32, v1: 0.36, z0: 0.5, z1: 0.8, t: shade(base, 1.22), r: cR, l: cL }, // seat cushion L
    { u0: 0.03, u1: 0.77, v0: -0.32, v1: 0.36, z0: 0.5, z1: 0.8, t: shade(base, 1.22), r: cR, l: cL }];  // seat cushion R
  drawParts(ctx, sx, sy, dir, 0, 0, parts, (P) => {
    // seat cushion piping (top)
    for (const [u0, u1] of [[-0.77, -0.03], [0.03, 0.77]] as [number, number][]) poly(ctx, [P(u0, -0.32, 0.8), P(u1, -0.32, 0.8), P(u1, 0.36, 0.8), P(u0, 0.36, 0.8)], undefined, hexA(hi, 0.5), 1);
    // rolled-arm sheen (top-facing)
    for (const uc of [-0.79, 0.79]) { const a = P(uc, -0.02, 1.06); ctx.save(); const g = ctx.createRadialGradient(a[0] - 3, a[1] - 4, 1, a[0], a[1], TILE_W * 0.5); g.addColorStop(0, hi); g.addColorStop(0.6, cT); g.addColorStop(1, cR); ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(a[0], a[1], TW * 0.5, TH * 0.8, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
  });
};

// Habbo-club style plant: glossy pot, soil, layered monstera leaves with veins + gradients.
const drawPlantHC = (ctx: CanvasRenderingContext2D, sx: number, sy: number, _accent: string, base: string) => {
  void _accent;
  const cx = sx;
  // pot (tapered, glossy charcoal-terracotta)
  const pot = '#b5572f', ptw = TW * 0.52, pbw = TW * 0.36, ph = STACK_H * 1.0, topY = sy - ph + TH * 0.4;
  const g = ctx.createLinearGradient(cx - ptw, 0, cx + ptw, 0); g.addColorStop(0, shade(pot, 0.55)); g.addColorStop(0.5, shade(pot, 1.12)); g.addColorStop(1, shade(pot, 0.66));
  ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(cx - pbw, sy); ctx.lineTo(cx + pbw, sy); ctx.lineTo(cx + ptw, topY); ctx.lineTo(cx - ptw, topY); ctx.closePath(); ctx.fill();
  ctx.fillStyle = shade(pot, 1.2); ctx.beginPath(); ctx.ellipse(cx, topY, ptw, TH * 0.55, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#33241a'; ctx.beginPath(); ctx.ellipse(cx, topY, ptw * 0.82, TH * 0.44, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = hexA('#fff', 0.28); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(cx, topY, ptw, TH * 0.55, 0, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
  // leaves
  const cyL = topY - TH * 0.2;
  const greens = ['#1f7a3a', '#176b32', '#27904a', '#155f2c'];
  const leaf = (ang: number, len: number, wid: number, col: string) => {
    ctx.save(); ctx.translate(cx, cyL); ctx.rotate(ang);
    ctx.globalAlpha = 0.25; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.moveTo(2, 2); ctx.bezierCurveTo(-wid + 2, -len * 0.45, -wid * 0.5 + 2, -len * 0.9, 2, -len + 2); ctx.bezierCurveTo(wid * 0.5 + 2, -len * 0.9, wid + 2, -len * 0.45, 2, 2); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
    const lg = ctx.createLinearGradient(0, 0, 0, -len); lg.addColorStop(0, shade(col, 0.58)); lg.addColorStop(1, shade(col, 1.3));
    ctx.fillStyle = lg; ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(-wid, -len * 0.45, -wid * 0.5, -len * 0.9, 0, -len); ctx.bezierCurveTo(wid * 0.5, -len * 0.9, wid, -len * 0.45, 0, 0); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = hexA(shade(col, 1.55), 0.55); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(0, -2); ctx.lineTo(0, -len * 0.93); ctx.stroke();
    ctx.strokeStyle = hexA(shade(col, 1.35), 0.35); ctx.lineWidth = 0.8;
    for (let s = 1; s <= 4; s++) { const ly = -len * (0.18 + s * 0.17), lw = wid * (0.66 - s * 0.12); ctx.beginPath(); ctx.moveTo(0, ly); ctx.lineTo(-lw, ly - lw * 0.5); ctx.moveTo(0, ly); ctx.lineTo(lw, ly - lw * 0.5); ctx.stroke(); }
    ctx.restore();
  };
  const set: [number, number][] = [[-1.05, 1.0], [-0.52, 1.2], [0, 1.3], [0.52, 1.2], [1.05, 1.0], [-0.8, 0.72], [0.8, 0.72]];
  set.sort((a, b) => a[1] - b[1]);
  set.forEach((s, i) => leaf(s[0], STACK_H * 1.7 * s[1], TW * 0.36, greens[i % greens.length]));
};

// Marble column: stepped plinth, fluted round shaft (gradient + flutes + veining), flared capital.
const drawColumnHC = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string) => {
  const cx = sx, m = base;
  const totalH = 3 * STACK_H, baseH = STACK_H * 0.5, capH = STACK_H * 0.5, shaftW = TW * 0.42;
  const shaftBottom = sy - baseH, shaftTop = sy - (totalH - capH);
  // plinth
  boxAt(ctx, cx, sy, 0.52, 0.52, baseH / STACK_H, shade(m, 0.82), accent);
  boxAt(ctx, cx, sy - baseH * 0.45, 0.42, 0.42, baseH * 0.55 / STACK_H, shade(m, 0.95), accent);
  // shaft body (round via horizontal gradient)
  const g = ctx.createLinearGradient(cx - shaftW, 0, cx + shaftW, 0);
  g.addColorStop(0, shade(m, 0.55)); g.addColorStop(0.28, shade(m, 1.05)); g.addColorStop(0.5, shade(m, 1.28)); g.addColorStop(0.72, shade(m, 1.0)); g.addColorStop(1, shade(m, 0.5));
  ctx.fillStyle = g; ctx.fillRect(cx - shaftW, shaftTop, shaftW * 2, shaftBottom - shaftTop);
  ctx.beginPath(); ctx.ellipse(cx, shaftBottom, shaftW, TH * 0.42, 0, 0, Math.PI); ctx.fill();
  // flutes
  ctx.save();
  for (let i = -3; i <= 3; i++) { const x = cx + i * shaftW * 0.26; ctx.strokeStyle = hexA('#000', 0.13); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, shaftTop + 2); ctx.lineTo(x, shaftBottom); ctx.stroke(); ctx.strokeStyle = hexA('#fff', 0.13); ctx.beginPath(); ctx.moveTo(x + 1.4, shaftTop + 2); ctx.lineTo(x + 1.4, shaftBottom); ctx.stroke(); }
  ctx.restore();
  // marble veining (clipped) + specular streak
  ctx.save(); ctx.beginPath(); ctx.rect(cx - shaftW, shaftTop, shaftW * 2, shaftBottom - shaftTop); ctx.clip();
  ctx.strokeStyle = hexA('#9aa3b5', 0.3); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cx - shaftW, shaftTop + 18); ctx.bezierCurveTo(cx, shaftTop + 28, cx - 5, shaftTop + 52, cx + shaftW, shaftTop + 46); ctx.stroke();
  const sg = ctx.createLinearGradient(cx - shaftW * 0.6, 0, cx - shaftW * 0.05, 0); sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(0.5, 'rgba(255,255,255,0.5)'); sg.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = sg; ctx.fillRect(cx - shaftW * 0.6, shaftTop, shaftW * 0.55, shaftBottom - shaftTop); ctx.restore();
  // top of shaft
  ctx.fillStyle = shade(m, 1.32); ctx.beginPath(); ctx.ellipse(cx, shaftTop, shaftW, TH * 0.42, 0, 0, Math.PI * 2); ctx.fill();
  // capital (flared) + abacus slab
  boxAt(ctx, cx, shaftTop + TH * 0.4, 0.5, 0.5, capH * 0.7 / STACK_H, shade(m, 1.1), accent);
  boxAt(ctx, cx, shaftTop - capH * 0.3, 0.6, 0.6, 0.22, shade(m, 1.0), accent);
};

// Crystal mirror ball: hanging, faceted shimmering sphere with specular, rim light, beams + sparkles.
const drawBallHC = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, _base: string, t: number) => {
  void _base;
  const cx = sx, cy = sy - 2.0 * STACK_H, R = TW * 0.66;
  // chain + mount
  ctx.strokeStyle = 'rgba(200,210,235,0.5)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy - R - STACK_H * 1.5); ctx.stroke();
  ctx.fillStyle = '#2c303c'; ctx.fillRect(cx - 4, cy - R - STACK_H * 1.5 - 4, 8, 6);
  // faceted sphere (clipped to circle)
  ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();
  const cols = 12, rows = 10, fw = (2 * R) / cols, fh = (2 * R) / rows;
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const fx = cx - R + (i + 0.5) * fw, fy = cy - R + (j + 0.5) * fh;
    const b = 0.5 + 0.42 * Math.sin(i * 0.9 + j * 0.5 + t * 0.06) * Math.cos(i * 0.5 - t * 0.045);
    const lum = Math.max(0.12, Math.min(1, b));
    if ((i * 3 + j * 5) % 7 === 0) ctx.fillStyle = `hsla(${(i * 40 + j * 30 + t * 2.5) % 360},75%,${38 + lum * 42}%,1)`;
    else ctx.fillStyle = `rgb(${Math.round(205 * lum + 25)},${Math.round(214 * lum + 26)},${Math.round(235 * lum + 28)})`;
    ctx.fillRect(fx - fw / 2, fy - fh / 2, fw + 0.7, fh + 0.7);
  }
  // sphere volume + edge AO
  const rg = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R * 1.05); rg.addColorStop(0, 'rgba(255,255,255,0.5)'); rg.addColorStop(0.5, 'rgba(255,255,255,0)'); rg.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = rg; ctx.fillRect(cx - R, cy - R, 2 * R, 2 * R);
  ctx.restore();
  // rim + specular hotspot
  ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; const hg = ctx.createRadialGradient(cx - R * 0.4, cy - R * 0.45, 0, cx - R * 0.4, cy - R * 0.45, R * 0.55); hg.addColorStop(0, 'rgba(255,255,255,0.9)'); hg.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(cx - R * 0.4, cy - R * 0.45, R * 0.55, 0, Math.PI * 2); ctx.fill(); ctx.restore();
};

// Draw furni `kind` so its tile origin sits at (sx, sy). accent = room accent, t = frame counter.
// Effective footprint of a (possibly rotated) piece: 90°/270° swap width & depth.
export const effSpan = (kind: string, dir: number): [number, number] => { const [sw, sh] = defOf(kind).span ?? [1, 1]; return dir % 2 ? [sh, sw] : [sw, sh]; };

export function drawFurniSprite(ctx: CanvasRenderingContext2D, kind: string, sx: number, sy: number, accent: string, t: number, dir = 0) {
  const d = defOf(kind);
  // Multi-tile pieces draw in a centered local frame — shift the anchor to the footprint centre.
  const [esw, esh] = effSpan(kind, dir);
  if (esw !== 1 || esh !== 1) { const ocx = (esw - 1) / 2, ocy = (esh - 1) / 2; sx += (ocx - ocy) * TW; sy += (ocx + ocy) * TH; }
  // Box pieces (TV, fridge…) keep a symmetric body; only the front detail turns: shown facing the
  // camera for dirs 0/1 (mirrored for 1) and hidden when it faces away (2/3) so you see the plain back.
  const showDet = dir < 2, mirD = dir === 1;
  const faceWrap = (draw: () => void) => { if (!showDet) return; ctx.save(); if (mirD) { ctx.translate(sx, 0); ctx.scale(-1, 1); ctx.translate(-sx, 0); } draw(); ctx.restore(); };
  switch (d.special) {
    case 'couch': drawCouch(ctx, sx, sy, accent, d.color, dir); break;
    case 'couch_hc': drawCouchHC(ctx, sx, sy, accent, d.color, dir); break;
    case 'armchair': drawArmchair(ctx, sx, sy, accent, d.color, dir); break;
    case 'chair': drawChair(ctx, sx, sy, accent, d.color, dir); break;
    case 'sofa': drawSofaR(ctx, sx, sy, accent, d.color, dir); break;
    case 'throne': drawThroneR(ctx, sx, sy, accent, d.color, dir); break;
    case 'coffee': drawCoffee(ctx, sx, sy, accent, d.color); break;
    case 'plant_hc': drawPlantHC(ctx, sx, sy, accent, d.color); break;
    case 'column_hc': drawColumnHC(ctx, sx, sy, accent, d.color); break;
    case 'ball_hc': drawBallHC(ctx, sx, sy, accent, d.color, t); break;
    case 'rug': { const hw = TW * 0.94, hh = TH * 0.94, top = d.h === 0 ? (diamond(ctx, sx, sy, hw, hh), ctx.fillStyle = d.color, ctx.fill(), sy) : block(ctx, sx, sy, 1, d.color, '#fff', 1); ctx.save(); ctx.globalAlpha = 0.5; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; for (let i = 1; i < 4; i++) { const f = i / 4; diamond(ctx, sx, top, hw * f, hh * f); ctx.stroke(); } ctx.restore(); break; }
    case 'water': { const top = d.h === 0 ? (diamond(ctx, sx, sy, TW * 0.94, TH * 0.94), ctx.fillStyle = d.color, ctx.fill(), sy) : block(ctx, sx, sy, 1, d.color, accent, 1); ctx.save(); ctx.globalAlpha = 0.4 + Math.sin(t * 0.1) * 0.2; ctx.fillStyle = '#fff'; diamond(ctx, sx, top, TW * 0.5, TH * 0.5); ctx.fill(); ctx.restore(); break; }
    case 'stair': {
      const n = 4, base = d.color, Pl = (u: number, v: number, z: number): number[] => [sx + (u - v) * TW, sy + (u + v) * TH - z * STACK_H];
      const t = shade(base, 1.25), r = shade(base, 0.82), l = shade(base, 0.55);
      for (let i = n - 1; i >= 0; i--) {   // back (high) → front (low) so steps occlude correctly
        const v0 = -0.5 + i / n, v1 = v0 + 1 / n, z = (i + 1) / n;
        poly(ctx, [Pl(0.5, v0, z), Pl(0.5, v1, z), Pl(0.5, v1, 0), Pl(0.5, v0, 0)], r);   // +u face
        poly(ctx, [Pl(-0.5, v1, z), Pl(0.5, v1, z), Pl(0.5, v1, 0), Pl(-0.5, v1, 0)], l); // +v riser
        poly(ctx, [Pl(-0.5, v0, z), Pl(0.5, v0, z), Pl(0.5, v1, z), Pl(-0.5, v1, z)], t); // tread
      }
      ctx.strokeStyle = hexA(accent, 0.25); ctx.lineWidth = 1; diamond(ctx, sx, sy - STACK_H, TW, TH); ctx.stroke();
      break;
    }
    case 'wall': { block(ctx, sx, sy, d.h, d.color, accent, d.foot); break; }
    case 'plant': { const top = block(ctx, sx, sy, 1, '#8a4f2a', accent, d.foot * 0.8); const lc = kind === 'flores' ? '#ff66aa' : '#1ED760'; const lvl = d.h; for (let r = 0; r < (lvl === 2 ? 5 : 3); r++) { const ox = (r - 1) * 7; ctx.fillStyle = lc; ctx.beginPath(); ctx.ellipse(sx + ox, top - 8 - (lvl === 2 ? r * 6 : 0), 6, 13, ox * 0.05, 0, Math.PI * 2); ctx.fill(); } break; }
    case 'lamp': { const top = block(ctx, sx, sy, d.h, '#2a2a30', accent, d.foot); ctx.save(); ctx.shadowColor = d.color; ctx.shadowBlur = 22; ctx.globalAlpha = 0.5 + Math.abs(Math.sin(t * 0.08)) * 0.4; ctx.fillStyle = d.color; ctx.beginPath(); ctx.arc(sx, top - 4, 7, 0, Math.PI * 2); ctx.fill(); ctx.restore(); break; }
    case 'speaker': { const top = block(ctx, sx, sy, 2, '#23232f', accent, 0.7); faceWrap(() => { ctx.fillStyle = hexA(accent, 0.6 + Math.abs(Math.sin(t * 0.15)) * 0.4); ctx.beginPath(); ctx.arc(sx + 8, top + 26, 6, 0, Math.PI * 2); ctx.fill(); }); break; }
    case 'tv': { const top = block(ctx, sx, sy, d.h, d.color, accent, d.foot); faceWrap(() => { ctx.fillStyle = hexA(accent, 0.7); ctx.fillRect(sx - 14, top - 12, 28, 18); ctx.fillStyle = `hsl(${(t * 3) % 360},80%,60%)`; ctx.globalAlpha = 0.5; ctx.fillRect(sx - 12, top - 10, 24, 14); ctx.globalAlpha = 1; }); break; }
    case 'sign': { const top = block(ctx, sx, sy, 1, d.color, accent, d.foot); if (showDet) { ctx.fillStyle = accent; ctx.font = '900 10px Helvetica, Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('SUAV', sx, top); } break; }
    case 'disco': { const cy = sy - 2.6 * STACK_H; ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(sx, cy - 22); ctx.lineTo(sx, cy - 56); ctx.stroke(); ctx.save(); ctx.translate(sx, cy); ctx.rotate(t * 0.04); const grd = ctx.createRadialGradient(-6, -6, 3, 0, 0, 20); grd.addColorStop(0, '#fff'); grd.addColorStop(1, '#8893b8'); ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(0, 0, 20, 0, Math.PI * 2); ctx.fill(); for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + t * 0.04; ctx.fillStyle = `hsla(${(t * 4 + i * 60) % 360},90%,65%,0.9)`; ctx.beginPath(); ctx.arc(Math.cos(a) * 12, Math.sin(a) * 12, 3.5, 0, Math.PI * 2); ctx.fill(); } ctx.restore(); break; }
    case 'stool': {
      const top = boxAt(ctx, sx, sy, 0.4, 0.4, 0.7, shade(d.color, 0.85), accent, false);
      ctx.fillStyle = shade(d.color, 1.25); ctx.beginPath(); ctx.ellipse(sx, top, TW * 0.4, TH * 0.4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = hexA(accent, 0.3); ctx.lineWidth = 1; ctx.stroke();
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
      faceWrap(() => { ctx.strokeStyle = hexA(accent, 0.4); ctx.lineWidth = 1.5; for (let i = 1; i <= 2; i++) { const yy = top + i * (2 * STACK_H / 3); ctx.beginPath(); ctx.moveTo(sx - TW * d.foot, yy - TH * d.foot); ctx.lineTo(sx + TW * d.foot, yy + TH * d.foot); ctx.stroke(); } });
      break;
    }
    case 'fridge': {
      const top = boxAt(ctx, sx, sy, d.foot, d.foot, 2, d.color, accent);
      faceWrap(() => {
        ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(sx + TW * d.foot * 0.5, top + TH * d.foot * 0.5); ctx.lineTo(sx + TW * d.foot * 0.5, top + TH * d.foot * 0.5 + 1.8 * STACK_H); ctx.stroke();
        ctx.strokeStyle = shade(d.color, 0.5); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(sx + TW * d.foot * 0.18, top + 16); ctx.lineTo(sx + TW * d.foot * 0.18, top + 34); ctx.stroke();
      });
      break;
    }
    case 'vending': {
      const top = boxAt(ctx, sx, sy, d.foot, d.foot, 2, d.color, accent);
      faceWrap(() => {
        ctx.fillStyle = 'rgba(10,20,30,0.7)'; ctx.beginPath(); ctx.moveTo(sx + 4, top + TH * d.foot * 0.3); ctx.lineTo(sx + TW * d.foot * 0.72, top); ctx.lineTo(sx + TW * d.foot * 0.72, top + 1.6 * STACK_H); ctx.lineTo(sx + 4, top + TH * d.foot * 0.3 + 1.6 * STACK_H); ctx.closePath(); ctx.fill();
        ctx.fillStyle = hexA(accent, 0.6); ctx.fillRect(sx - TW * d.foot * 0.55, top + 5, TW * d.foot * 0.5, 4);
      });
      break;
    }
    case 'jukebox': {
      const top = boxAt(ctx, sx, sy, d.foot, d.foot, 2, d.color, accent);
      faceWrap(() => { ctx.fillStyle = shade(d.color, 1.4); ctx.beginPath(); ctx.ellipse(sx, top, TW * d.foot, TH * d.foot, 0, Math.PI, 0); ctx.fill(); for (let i = 0; i < 5; i++) { ctx.fillStyle = `hsl(${(t * 4 + i * 70) % 360},90%,62%)`; ctx.beginPath(); ctx.arc(sx - 12 + i * 6, top + 10, 2, 0, Math.PI * 2); ctx.fill(); } });
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
