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
// True if a face whose local outward normal is (du,dv) points toward the camera under this dir.
const faceVisible = (du: number, dv: number, dir: number): boolean => { let u = du, v = dv; const n = ((dir % 4) + 4) % 4; for (let i = 0; i < n; i++) { const tt = u; u = -v; v = tt; } return u + v > 0.001; };

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

// Flatscreen TV on a pedestal stand: a thin panel that truly sits in iso space; the screen lights up
// on whichever broad face points at the camera, and you see the dark back when it's turned away.
const drawTV = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, t: number, dir: number) => {
  const ped = '#26262e';
  const parts: IsoPart[] = [
    { u0: -0.2, u1: 0.2, v0: -0.14, v1: 0.14, z0: 0, z1: 0.08, t: shade(ped, 1.15), r: shade(ped, 0.8), l: shade(ped, 0.6) },   // base
    { u0: -0.05, u1: 0.05, v0: -0.05, v1: 0.05, z0: 0.08, z1: 0.44, t: ped, r: shade(ped, 0.78), l: shade(ped, 0.62) },         // neck
    { u0: -0.46, u1: 0.46, v0: -0.045, v1: 0.045, z0: 0.42, z1: 1.18, t: shade(base, 1.15), r: shade(base, 0.7), l: shade(base, 0.92) }];  // panel (thin in v)
  drawParts(ctx, sx, sy, dir, 0, 0, parts, (P) => {
    if (!faceVisible(0, 1, dir)) return;   // screen on the +v broad face
    poly(ctx, [P(-0.38, 0.05, 1.08), P(0.38, 0.05, 1.08), P(0.38, 0.05, 0.52), P(-0.38, 0.05, 0.52)], hexA(accent, 0.75));
    ctx.save(); ctx.globalAlpha = 0.55; poly(ctx, [P(-0.33, 0.05, 1.02), P(0.33, 0.05, 1.02), P(0.33, 0.05, 0.58), P(-0.33, 0.05, 0.58)], `hsl(${(t * 3) % 360},80%,60%)`); ctx.restore();
  });
};

// Open laptop: keyboard deck (top always visible) + an upright lid whose screen glows toward the user.
const drawLaptop = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, t: number, dir: number) => {
  const parts: IsoPart[] = [
    { u0: -0.28, u1: 0.28, v0: -0.12, v1: 0.28, z0: 0, z1: 0.06, t: shade(base, 1.2), r: shade(base, 0.8), l: shade(base, 0.62) },   // keyboard deck
    { u0: -0.28, u1: 0.28, v0: -0.2, v1: -0.13, z0: 0.06, z1: 0.52, t: shade(base, 1.1), r: shade(base, 0.7), l: shade(base, 0.88) }]; // upright lid at back
  drawParts(ctx, sx, sy, dir, 0, 0, parts, (P) => {
    ctx.save(); ctx.fillStyle = hexA('#000', 0.3);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) { const kp = P(-0.18 + c * 0.09, -0.02 + r * 0.08, 0.07); ctx.fillRect(kp[0] - 2, kp[1] - 1.5, 4, 3); }
    const tp = P(0, 0.2, 0.07); ctx.fillStyle = hexA('#000', 0.22); ctx.fillRect(tp[0] - 5, tp[1] - 3, 10, 6); ctx.restore();
    if (faceVisible(0, 1, dir)) {   // screen on the lid's +v face (toward the keyboard)
      poly(ctx, [P(-0.24, -0.125, 0.48), P(0.24, -0.125, 0.48), P(0.24, -0.125, 0.12), P(-0.24, -0.125, 0.12)], hexA(accent, 0.7));
      ctx.save(); ctx.globalAlpha = 0.5; poly(ctx, [P(-0.2, -0.125, 0.44), P(0.2, -0.125, 0.44), P(0.2, -0.125, 0.16), P(-0.2, -0.125, 0.16)], `hsl(${(t * 2) % 360},70%,60%)`); ctx.restore();
    }
  });
};

// ═══════════ HI-FI garden / lobby pieces (trees, palm, park bench, reception desk) ═══════════

// Leafy tree: tapered bark trunk with root flare + a layered, gradient-shaded canopy and speckle light.
const drawTree = (ctx: CanvasRenderingContext2D, sx: number, sy: number, _a: string, base: string) => {
  void _a;
  ctx.save(); ctx.globalAlpha = 0.24; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(sx, sy, TW * 0.7, TH * 0.7, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  const trunkH = STACK_H * 1.7, tw = TW * 0.17;
  const tg = ctx.createLinearGradient(sx - tw, 0, sx + tw, 0); tg.addColorStop(0, shade(base, 0.5)); tg.addColorStop(0.5, shade(base, 1.18)); tg.addColorStop(1, shade(base, 0.62));
  ctx.fillStyle = tg; ctx.beginPath();
  ctx.moveTo(sx - tw, sy); ctx.quadraticCurveTo(sx - tw * 0.5, sy - trunkH * 0.5, sx - tw * 0.5, sy - trunkH);
  ctx.lineTo(sx + tw * 0.5, sy - trunkH); ctx.quadraticCurveTo(sx + tw * 0.5, sy - trunkH * 0.5, sx + tw, sy);
  ctx.lineTo(sx + tw * 1.7, sy + 3); ctx.lineTo(sx - tw * 1.7, sy + 3); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = hexA('#000', 0.16); ctx.lineWidth = 1; for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(sx + i * tw * 0.45, sy - 4); ctx.lineTo(sx + i * tw * 0.45, sy - trunkH + 4); ctx.stroke(); }
  const cy = sy - trunkH - TH * 0.2; const greens = ['#1c6e34', '#268a45', '#2fa356', '#185f2c', '#37b561'];
  const blob = (ox: number, oy: number, r: number, col: string) => { const g = ctx.createRadialGradient(sx + ox - r * 0.3, cy + oy - r * 0.35, r * 0.1, sx + ox, cy + oy, r); g.addColorStop(0, shade(col, 1.36)); g.addColorStop(0.6, col); g.addColorStop(1, shade(col, 0.68)); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx + ox, cy + oy, r, 0, Math.PI * 2); ctx.fill(); };
  blob(0, TH * 0.4, TW * 0.95, greens[3]);
  blob(-TW * 0.52, 0, TW * 0.56, greens[1]); blob(TW * 0.52, 0, TW * 0.56, greens[1]);
  blob(-TW * 0.26, -TH * 0.7, TW * 0.56, greens[2]); blob(TW * 0.32, -TH * 0.62, TW * 0.6, greens[2]);
  blob(0, -TH * 1.1, TW * 0.62, greens[4]);
  ctx.save(); ctx.globalAlpha = 0.45; ctx.fillStyle = '#cdfaa8'; for (let i = 0; i < 16; i++) { const a = i * 2.39917, rr = TW * (0.2 + (i % 5) * 0.13); ctx.beginPath(); ctx.arc(sx + Math.cos(a) * rr, cy - TH * 0.3 + Math.sin(a) * rr * 0.6, 1.8, 0, Math.PI * 2); ctx.fill(); } ctx.restore();
};

// Palm: curved segmented trunk + a crown of arcing gradient fronds with midribs and coconuts.
const drawPalm = (ctx: CanvasRenderingContext2D, sx: number, sy: number, _a: string, base: string) => {
  void _a;
  ctx.save(); ctx.globalAlpha = 0.2; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(sx, sy, TW * 0.55, TH * 0.6, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  const H = STACK_H * 2.1, lean = TW * 0.28, segs = 7;
  ctx.lineCap = 'round';
  for (let i = 0; i < segs; i++) { const f0 = i / segs, f1 = (i + 1) / segs; const x0 = sx + lean * f0 * f0, y0 = sy - H * f0, x1 = sx + lean * f1 * f1, y1 = sy - H * f1; ctx.strokeStyle = shade(base, 0.78 + (i % 2) * 0.28); ctx.lineWidth = TW * (0.21 - 0.07 * f0); ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); }
  const tx = sx + lean, ty = sy - H; const greens = ['#2aa050', '#1f8a42', '#33b85e', '#188036'];
  const blade = (ang: number, len: number, col: string) => {
    ctx.save(); ctx.translate(tx, ty); ctx.rotate(ang);
    const g = ctx.createLinearGradient(0, 0, len, 0); g.addColorStop(0, shade(col, 1.28)); g.addColorStop(1, shade(col, 0.64));
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(len * 0.55, -len * 0.22, len, -len * 0.02); ctx.quadraticCurveTo(len * 0.55, len * 0.07, 0, 0); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = hexA('#0a3a18', 0.5); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(len * 0.55, -len * 0.08, len, -len * 0.02); ctx.stroke(); ctx.restore();
  };
  const angs = [-3.0, -2.6, -2.2, -1.85, -1.5, -1.1, -0.7, -0.25, 0.2];
  angs.forEach((a, i) => blade(a, TW * (0.95 + (i % 3) * 0.13), greens[i % greens.length]));
  ctx.fillStyle = '#6b4a28'; for (const o of [[-4, 3], [3, 4], [0, 6]] as [number, number][]) { ctx.beginPath(); ctx.arc(tx + o[0], ty + o[1], 3, 0, Math.PI * 2); ctx.fill(); }
};

// Park bench: metal frame + legs/armrests with slatted wood seat and a gapped slatted back. Rotates 4 ways.
const drawBench = (ctx: CanvasRenderingContext2D, sx: number, sy: number, _a: string, base: string, dir: number) => {
  void _a; const cT = shade(base, 1.3), cR = shade(base, 0.95), cL = shade(base, 0.62); const m = '#2c2f36', mT = shade(m, 1.2), mR = shade(m, 0.8), mL = shade(m, 0.5);
  const parts: IsoPart[] = [
    ...legs([[-0.8, -0.16], [0.8, -0.16], [-0.8, 0.3], [0.8, 0.3]], 0.42).map(p => ({ ...p, t: mT, r: mR, l: mL })),
    { u0: -0.92, u1: 0.92, v0: -0.2, v1: -0.07, z0: 0.42, z1: 0.5, t: cT, r: cR, l: cL },          // seat slat back
    { u0: -0.92, u1: 0.92, v0: -0.03, v1: 0.1, z0: 0.42, z1: 0.5, t: cT, r: cR, l: cL },           // seat slat mid
    { u0: -0.92, u1: 0.92, v0: 0.14, v1: 0.28, z0: 0.42, z1: 0.5, t: cT, r: cR, l: cL },           // seat slat front
    { u0: -0.92, u1: 0.92, v0: -0.3, v1: -0.24, z0: 0.52, z1: 0.76, t: cT, r: cR, l: cL },         // back slat lower
    { u0: -0.92, u1: 0.92, v0: -0.3, v1: -0.24, z0: 0.84, z1: 1.06, t: cT, r: cR, l: cL },         // back slat upper
    { u0: -0.93, u1: -0.79, v0: -0.28, v1: 0.3, z0: 0.5, z1: 0.86, t: mT, r: mR, l: mL },          // left armrest
    { u0: 0.79, u1: 0.93, v0: -0.28, v1: 0.3, z0: 0.5, z1: 0.86, t: mT, r: mR, l: mL }];           // right armrest
  drawParts(ctx, sx, sy, dir, 0, 0, parts);
};

// Reception desk (3 tiles): tall wood body, marble counter-top overhang, accent strip + CLUBE logo.
const drawReception = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  const cT = shade(base, 1.24), cR = shade(base, 0.92), cL = shade(base, 0.6), top = '#dfe3ea';
  const parts: IsoPart[] = [{ u0: -1.42, u1: 1.42, v0: -0.16, v1: 0.34, z0: 0, z1: 1.5, t: cT, r: cR, l: cL }];
  drawParts(ctx, sx, sy, dir, 0, 0, parts, (P) => {
    const z = 1.5;
    poly(ctx, [P(-1.5, -0.26, z), P(1.5, -0.26, z), P(1.5, 0.42, z), P(-1.5, 0.42, z)], shade(top, 1.2));   // counter slab
    poly(ctx, [P(-1.5, 0.42, z), P(1.5, 0.42, z), P(1.5, 0.42, z - 0.14), P(-1.5, 0.42, z - 0.14)], shade(top, 0.82));   // front lip
    poly(ctx, [P(1.5, -0.26, z), P(1.5, 0.42, z), P(1.5, 0.42, z - 0.14), P(1.5, -0.26, z - 0.14)], shade(top, 0.7));    // right lip
    if (faceVisible(0, 1, dir)) {
      poly(ctx, [P(-1.3, 0.34, 1.18), P(1.3, 0.34, 1.18), P(1.3, 0.34, 0.86), P(-1.3, 0.34, 0.86)], hexA(accent, 0.85));   // accent strip
      const c = P(0, 0.34, 1.02); ctx.save(); ctx.fillStyle = '#fff'; ctx.font = '900 11px Helvetica, Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('CLUBE', c[0], c[1]); ctx.restore();
    }
  });
};

// PA speaker tower: a tall 3-high cabinet with two woofer cones + a tweeter on the camera-facing
// front, an accent power LED and pulsing cone glow. Front turns with dir; plain cabinet when away.
const drawPA = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, t: number, dir: number) => {
  const showFront = dir < 2, mir = dir === 1;
  const top = boxAt(ctx, sx, sy, 0.6, 0.42, 3, base, accent);
  if (!showFront) return;
  ctx.save(); if (mir) { ctx.translate(sx, 0); ctx.scale(-1, 1); ctx.translate(-sx, 0); }
  const cone = (cy: number, r: number) => {
    const g = ctx.createRadialGradient(sx - r * 0.3, cy - r * 0.3, 1, sx, cy, r);
    g.addColorStop(0, shade(base, 1.7)); g.addColorStop(0.55, shade(base, 0.7)); g.addColorStop(1, shade(base, 0.35));
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(sx, cy, r, r * 0.92, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = hexA(accent, 0.35 + Math.abs(Math.sin(t * 0.12)) * 0.4); ctx.beginPath(); ctx.ellipse(sx, cy, r * 0.34, r * 0.32, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = hexA('#000', 0.4); ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(sx, cy, r, r * 0.92, 0, 0, Math.PI * 2); ctx.stroke();
  };
  cone(top + STACK_H * 2.0, TW * 0.34); cone(top + STACK_H * 0.95, TW * 0.34);   // two woofers
  ctx.fillStyle = '#cdd2dc'; ctx.beginPath(); ctx.ellipse(sx, top + STACK_H * 0.34, TW * 0.13, TW * 0.12, 0, 0, Math.PI * 2); ctx.fill();   // tweeter
  ctx.fillStyle = hexA(accent, 0.9); ctx.beginPath(); ctx.arc(sx + TW * 0.4, top + 8, 2, 0, Math.PI * 2); ctx.fill();   // power LED
  ctx.restore();
};

// Pool handrail / ladder: two chrome posts with a curved grab-rail arcing over the pool edge + rungs.
const drawLadder = (ctx: CanvasRenderingContext2D, sx: number, sy: number, _a: string, _base: string, dir: number) => {
  void _a; void _base;
  const P = (u: number, v: number, z: number): number[] => { const [ru, rv] = rotUV(u, v, dir, 0, 0); return [sx + (ru - rv) * TW, sy + (ru + rv) * TH - z * STACK_H]; };
  const chrome = ctx.createLinearGradient(sx - 10, 0, sx + 10, 0); chrome.addColorStop(0, '#8b93a3'); chrome.addColorStop(0.5, '#eef2f8'); chrome.addColorStop(1, '#8b93a3');
  const rail = (uu: number) => {
    const a = P(uu, -0.26, 1.2), b = P(uu, -0.02, 1.2), c = P(uu, 0.16, 0.0);   // top-back → top-front → down into pool
    ctx.strokeStyle = chrome; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.quadraticCurveTo(b[0], b[1] - 8, c[0], c[1]); ctx.stroke();
  };
  rail(-0.22); rail(0.22);
  ctx.strokeStyle = '#cfd6e2'; ctx.lineWidth = 2.5;   // rungs
  for (const z of [0.85, 0.5, 0.18]) { const l = P(-0.22, 0.08, z), r = P(0.22, 0.08, z); ctx.beginPath(); ctx.moveTo(l[0], l[1]); ctx.lineTo(r[0], r[1]); ctx.stroke(); }
};

// VIP cordon (3 tiles): three chrome stanchions joined by two draped velvet ropes. Rotates 4 ways so
// it can line either carpet edge. Local frame spans u=-1..1; centred by the multi-tile shift.
const drawRope = (ctx: CanvasRenderingContext2D, sx: number, sy: number, _a: string, _base: string, dir: number) => {
  void _a; void _base;
  const P = (u: number, v: number, z: number): number[] => { const [ru, rv] = rotUV(u, v, dir, 0, 0); return [sx + (ru - rv) * TW, sy + (ru + rv) * TH - z * STACK_H]; };
  const us = [-1, 0, 1]; const ropeZ = 0.78;
  // velvet ropes between consecutive poles (drawn first, behind the poles)
  for (let i = 0; i < us.length - 1; i++) {
    const a = P(us[i], 0, ropeZ), b = P(us[i + 1], 0, ropeZ), mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2 + 11;
    ctx.lineCap = 'round'; ctx.strokeStyle = hexA('#7a1020', 0.95); ctx.lineWidth = 4.5; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.quadraticCurveTo(mx, my, b[0], b[1]); ctx.stroke();
    ctx.strokeStyle = hexA('#d4435e', 0.7); ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.quadraticCurveTo(mx, my - 1, b[0], b[1]); ctx.stroke();
  }
  // poles, back-to-front so they occlude the ropes correctly
  for (const u of [...us].sort((p, q) => { const [au, av] = rotUV(p, 0, dir, 0, 0); const [bu, bv] = rotUV(q, 0, dir, 0, 0); return (au + av) - (bu + bv); })) {
    const base = P(u, 0, 0), cap = P(u, 0, 0.98);
    ctx.fillStyle = '#b8923f'; ctx.beginPath(); ctx.ellipse(base[0], base[1], 7, 3.5, 0, 0, Math.PI * 2); ctx.fill();           // brass base
    const g = ctx.createLinearGradient(base[0] - 3, 0, base[0] + 3, 0); g.addColorStop(0, '#888f9e'); g.addColorStop(0.5, '#f2f5fa'); g.addColorStop(1, '#888f9e');
    ctx.fillStyle = g; ctx.fillRect(base[0] - 2.5, cap[1], 5, base[1] - cap[1]);                                                  // chrome post
    ctx.fillStyle = '#e8c66a'; ctx.beginPath(); ctx.arc(cap[0], cap[1], 4.8, 0, Math.PI * 2); ctx.fill();                        // gold ball cap
    ctx.fillStyle = 'rgba(255,255,255,0.65)'; ctx.beginPath(); ctx.arc(cap[0] - 1.5, cap[1] - 1.6, 1.7, 0, Math.PI * 2); ctx.fill();
  }
};

// Hanging chandelier: chain to the ceiling, warm glowing tiered ring with crystal drops.
const drawChandelier = (ctx: CanvasRenderingContext2D, sx: number, sy: number, _a: string, _base: string, t: number) => {
  void _a; void _base;
  const cy = sy - 3.4 * STACK_H;
  ctx.strokeStyle = 'rgba(210,214,225,0.55)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(sx, cy - 16); ctx.lineTo(sx, cy - 46); ctx.stroke();
  const pulse = 0.78 + Math.abs(Math.sin(t * 0.05)) * 0.22;
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; const gl = ctx.createRadialGradient(sx, cy, 2, sx, cy, 34); gl.addColorStop(0, hexA('#ffe6a8', 0.55 * pulse)); gl.addColorStop(1, 'rgba(255,230,168,0)'); ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(sx, cy, 34, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  ctx.fillStyle = '#caa24a'; ctx.beginPath(); ctx.ellipse(sx, cy, 17, 7, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = shade('#caa24a', 1.3); ctx.beginPath(); ctx.ellipse(sx, cy - 2, 11, 4.5, 0, 0, Math.PI * 2); ctx.fill();
  for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; const dx = sx + Math.cos(a) * 15, dy = cy + Math.sin(a) * 6 + 3; ctx.fillStyle = hexA('#fff6d8', 0.92); ctx.beginPath(); ctx.moveTo(dx, dy); ctx.lineTo(dx - 2, dy + 5); ctx.lineTo(dx, dy + 9); ctx.lineTo(dx + 2, dy + 5); ctx.closePath(); ctx.fill(); }
  ctx.save(); ctx.shadowColor = '#ffd98a'; ctx.shadowBlur = 14; ctx.fillStyle = hexA('#fff3cf', pulse); ctx.beginPath(); ctx.arc(sx, cy + 1, 4.5, 0, Math.PI * 2); ctx.fill(); ctx.restore();
};

// Pool float ring: a glossy two-tone inflatable bobbing on the water surface.
const drawFloat = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, t: number) => {
  const by = sy + 5 + Math.sin(t * 0.06 + sx * 0.05) * 1.6, rw = TW * 0.5, rh = TH * 0.62;
  ctx.save(); ctx.globalAlpha = 0.22; ctx.fillStyle = '#03313f'; ctx.beginPath(); ctx.ellipse(sx, by + 3, rw, rh, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  ctx.fillStyle = shade(base, 0.8); ctx.beginPath(); ctx.ellipse(sx, by, rw, rh, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = base; ctx.beginPath(); ctx.ellipse(sx, by - 2, rw, rh, 0, 0, Math.PI * 2); ctx.fill();
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; ctx.fillStyle = i % 2 ? '#ffffff' : accent; ctx.beginPath(); ctx.ellipse(sx + Math.cos(a) * rw * 0.74, by - 2 + Math.sin(a) * rh * 0.74, rw * 0.16, rh * 0.16, 0, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = '#0c5e78'; ctx.beginPath(); ctx.ellipse(sx, by - 2, rw * 0.44, rh * 0.44, 0, 0, Math.PI * 2); ctx.fill();   // water in the hole
  ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(sx - rw * 0.3, by - rh * 0.4, rw * 0.3, rh * 0.22, -0.5, 0, Math.PI * 2); ctx.stroke();
};

// Tiered stone fountain: round basin, a pedestal + upper bowl, and an animated water jet/cascade.
const drawFountain = (ctx: CanvasRenderingContext2D, sx: number, sy: number, _a: string, base: string, t: number) => {
  void _a; const stone = base;
  ctx.fillStyle = shade(stone, 0.7); ctx.beginPath(); ctx.ellipse(sx, sy, TW * 0.84, TH * 0.84, 0, 0, Math.PI * 2); ctx.fill();   // basin rim
  ctx.fillStyle = '#1d7fa0'; ctx.beginPath(); ctx.ellipse(sx, sy - 2, TW * 0.68, TH * 0.68, 0, 0, Math.PI * 2); ctx.fill();        // basin water
  ctx.save(); ctx.globalAlpha = 0.4 + 0.2 * Math.sin(t * 0.1); ctx.strokeStyle = '#bfe9ff'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(sx, sy - 2, TW * 0.4, TH * 0.4, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
  const pedH = STACK_H * 0.9; ctx.fillStyle = shade(stone, 1.05); ctx.fillRect(sx - 6, sy - pedH, 12, pedH);                       // pedestal
  ctx.fillStyle = shade(stone, 1.2); ctx.beginPath(); ctx.ellipse(sx, sy - pedH, TW * 0.42, TH * 0.42, 0, 0, Math.PI * 2); ctx.fill();   // upper bowl
  ctx.fillStyle = '#1d7fa0'; ctx.beginPath(); ctx.ellipse(sx, sy - pedH - 1, TW * 0.3, TH * 0.3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.save(); ctx.strokeStyle = hexA('#dff4ff', 0.85); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(sx, sy - pedH - 2); ctx.lineTo(sx, sy - pedH - 16 - Math.abs(Math.sin(t * 0.18)) * 5); ctx.stroke();   // jet
  ctx.globalAlpha = 0.7; for (let i = 0; i < 8; i++) { const ph = (t * 0.12 + i) % 6.283; const dx = Math.cos(i) * (4 + ph * 2), dy = -pedH - 14 + Math.sin(ph) * 4 + ph * 2; ctx.fillStyle = '#cdeeff'; ctx.beginPath(); ctx.arc(sx + dx, sy + dy, 1.5, 0, Math.PI * 2); ctx.fill(); } ctx.restore();
};

// Bar counter (2 tiles): dark body, wood top overhang, brass foot-rail + accent strip on the front,
// and a row of bottles + a brass tap on the bartop. Rotates 4 ways.
const drawBar = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  const cT = shade(base, 1.3), cR = shade(base, 0.95), cL = shade(base, 0.6), wood = '#7a5230';
  const parts: IsoPart[] = [{ u0: -0.92, u1: 0.92, v0: -0.16, v1: 0.34, z0: 0, z1: 1.45, t: cT, r: cR, l: cL }];
  drawParts(ctx, sx, sy, dir, 0, 0, parts, (P) => {
    const z = 1.45;
    poly(ctx, [P(-1.0, -0.24, z), P(1.0, -0.24, z), P(1.0, 0.42, z), P(-1.0, 0.42, z)], shade(wood, 1.2));            // wood top
    poly(ctx, [P(-1.0, 0.42, z), P(1.0, 0.42, z), P(1.0, 0.42, z - 0.12), P(-1.0, 0.42, z - 0.12)], shade(wood, 0.75));
    poly(ctx, [P(1.0, -0.24, z), P(1.0, 0.42, z), P(1.0, 0.42, z - 0.12), P(1.0, -0.24, z - 0.12)], shade(wood, 0.62));
    if (faceVisible(0, 1, dir)) {
      poly(ctx, [P(-0.9, 0.34, 1.0), P(0.9, 0.34, 1.0), P(0.9, 0.34, 0.95), P(-0.9, 0.34, 0.95)], hexA(accent, 0.7));     // accent strip
      poly(ctx, [P(-0.9, 0.34, 0.3), P(0.9, 0.34, 0.3), P(0.9, 0.34, 0.25), P(-0.9, 0.34, 0.25)], '#c9a44f');             // brass foot-rail
    }
    const bottle = (u: number, col: string) => { const b = P(u, 0.04, z); ctx.fillStyle = col; ctx.fillRect(b[0] - 2, b[1] - 13, 4, 13); ctx.fillStyle = shade(col, 1.5); ctx.fillRect(b[0] - 2, b[1] - 13, 1.4, 13); ctx.fillStyle = '#caa24a'; ctx.fillRect(b[0] - 1, b[1] - 16, 2, 3); };
    for (const [u, c] of [[-0.55, '#2e9e5a'], [-0.36, '#b3242e'], [-0.17, '#caa24a'], [0.5, '#3a7bd0']] as [number, string][]) bottle(u, c);
    const tp = P(0.18, 0.06, z); ctx.strokeStyle = '#c9a44f'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(tp[0], tp[1]); ctx.lineTo(tp[0], tp[1] - 11); ctx.lineTo(tp[0] + 6, tp[1] - 11); ctx.stroke();   // tap
  });
};

// DJ booth (2 tiles): angular console, two spinning turntables on the deck, glowing front panel with
// animated EQ bars. Rotates 4 ways.
const drawBooth = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, t: number, dir: number) => {
  const parts: IsoPart[] = [{ u0: -0.92, u1: 0.92, v0: -0.16, v1: 0.3, z0: 0, z1: 1.3, t: shade(base, 1.25), r: shade(base, 0.92), l: shade(base, 0.56) }];
  drawParts(ctx, sx, sy, dir, 0, 0, parts, (P) => {
    const z = 1.3;
    poly(ctx, [P(-0.96, -0.22, z), P(0.96, -0.22, z), P(0.96, 0.34, z), P(-0.96, 0.34, z)], shade(base, 1.45));   // top deck
    for (const u of [-0.45, 0.45]) { const c = P(u, 0.04, z); ctx.fillStyle = '#0c0c12'; ctx.beginPath(); ctx.ellipse(c[0], c[1], 10, 6, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#2a2a36'; ctx.beginPath(); ctx.ellipse(c[0], c[1], 7, 4.2, 0, 0, Math.PI * 2); ctx.fill(); ctx.save(); ctx.translate(c[0], c[1]); ctx.rotate(t * 0.12); ctx.strokeStyle = hexA(accent, 0.85); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(5, 2.6); ctx.stroke(); ctx.restore(); ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(c[0], c[1], 1.6, 0, Math.PI * 2); ctx.fill(); }
    if (faceVisible(0, 1, dir)) {
      poly(ctx, [P(-0.86, 0.3, 1.12), P(0.86, 0.3, 1.12), P(0.86, 0.3, 0.18), P(-0.86, 0.3, 0.18)], hexA(accent, 0.22));
      for (let i = 0; i < 11; i++) { const u = -0.78 + i * 0.156, h = 0.18 + Math.abs(Math.sin(t * 0.16 + i * 0.7)) * 0.7, a = P(u, 0.3, 0.22), b = P(u, 0.3, 0.22 + h * 0.78); ctx.strokeStyle = `hsl(${(t * 3 + i * 30) % 360},90%,60%)`; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
    }
  });
};

// Beach parasol: timber pole + a domed scalloped canopy in two-tone segments with a brass finial.
const drawParasol = (ctx: CanvasRenderingContext2D, sx: number, sy: number, _a: string, base: string) => {
  void _a; const cx = sx, poleH = STACK_H * 2.0;
  ctx.save(); ctx.globalAlpha = 0.18; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(cx, sy, TW * 0.5, TH * 0.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  ctx.strokeStyle = '#8a6a3a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx, sy); ctx.lineTo(cx, sy - poleH); ctx.stroke();
  const top = sy - poleH, rw = TW * 0.98, rh = TH * 0.74, segs = 10;
  for (let i = 0; i < segs; i++) { const a0 = (i / segs) * Math.PI * 2, a1 = ((i + 1) / segs) * Math.PI * 2, am = (a0 + a1) / 2; ctx.fillStyle = i % 2 ? base : shade(base, 1.3); ctx.beginPath(); ctx.moveTo(cx, top); ctx.lineTo(cx + Math.cos(a0) * rw, top + 9 + Math.sin(a0) * rh); ctx.lineTo(cx + Math.cos(am) * rw * 1.07, top + 12 + Math.sin(am) * rh * 1.07); ctx.lineTo(cx + Math.cos(a1) * rw, top + 9 + Math.sin(a1) * rh); ctx.closePath(); ctx.fill(); }
  ctx.fillStyle = shade(base, 1.5); ctx.beginPath(); ctx.ellipse(cx, top + 2, rw * 0.3, rh * 0.3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#caa24a'; ctx.beginPath(); ctx.arc(cx, top - 3, 3, 0, Math.PI * 2); ctx.fill();
};

// Sun lounger / daybed (2 tiles): chrome frame + legs, striped cushion and a raised backrest at one
// end. Sittable. Rotates 4 ways.
const drawLounger = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  const cu = shade(base, 1.2), cuR = shade(base, 0.9), cuL = shade(base, 0.6), m = '#9aa2af';
  const parts: IsoPart[] = [
    ...legs([[-0.8, -0.24], [0.8, -0.24], [-0.8, 0.3], [0.8, 0.3]], 0.18).map(p => ({ ...p, t: m, r: shade(m, 0.8), l: shade(m, 0.55) })),
    { u0: -0.9, u1: 0.92, v0: -0.3, v1: 0.34, z0: 0.18, z1: 0.34, t: cu, r: cuR, l: cuL },          // mattress base
    { u0: -0.86, u1: 0.88, v0: -0.28, v1: 0.32, z0: 0.34, z1: 0.5, t: shade(base, 1.3), r: cuR, l: cuL }, // cushion
    { u0: -0.92, u1: -0.62, v0: -0.3, v1: 0.34, z0: 0.34, z1: 1.02, t: shade(base, 1.3), r: cuR, l: cuL }]; // raised backrest (one end)
  drawParts(ctx, sx, sy, dir, 0, 0, parts, (P) => {
    for (let i = 0; i < 5; i++) { const u = -0.55 + i * 0.28; poly(ctx, [P(u - 0.06, -0.28, 0.5), P(u + 0.06, -0.28, 0.5), P(u + 0.06, 0.32, 0.5), P(u - 0.06, 0.32, 0.5)], hexA(accent, 0.16)); }   // cushion stripes
  });
};

// Topiary: glazed planter + a stack of three trimmed, gradient-shaded green spheres with leaf speckle.
const drawTopiary = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string) => {
  const top = boxAt(ctx, sx, sy, 0.4, 0.4, 0.55, '#b5572f', accent);
  ctx.fillStyle = '#33241a'; ctx.beginPath(); ctx.ellipse(sx, top, TW * 0.36, TH * 0.34, 0, 0, Math.PI * 2); ctx.fill();
  const ball = (cy: number, r: number) => { const g = ctx.createRadialGradient(sx - r * 0.3, cy - r * 0.35, 1, sx, cy, r); g.addColorStop(0, shade(base, 1.4)); g.addColorStop(0.65, base); g.addColorStop(1, shade(base, 0.66)); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, cy, r, 0, Math.PI * 2); ctx.fill(); ctx.save(); ctx.globalAlpha = 0.4; ctx.fillStyle = '#bdf0a0'; for (let i = 0; i < 6; i++) { const a = i * 2.4; ctx.beginPath(); ctx.arc(sx + Math.cos(a) * r * 0.6, cy + Math.sin(a) * r * 0.6, 1.4, 0, Math.PI * 2); ctx.fill(); } ctx.restore(); };
  ball(top - TW * 0.36, TW * 0.42); ball(top - TW * 0.36 - STACK_H * 0.7, TW * 0.33); ball(top - TW * 0.36 - STACK_H * 1.25, TW * 0.24);
};

// Hanging banner: ceiling bar, a two-tone draped cloth with a swallow-tail hem and an accent emblem.
const drawBanner = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string) => {
  const topY = sy - 3.4 * STACK_H, w = 17, h = 46;
  ctx.fillStyle = '#8a6a3a'; ctx.fillRect(sx - w / 2 - 3, topY - 4, w + 6, 4);
  const g = ctx.createLinearGradient(sx, topY, sx, topY + h); g.addColorStop(0, shade(base, 1.15)); g.addColorStop(1, shade(base, 0.7));
  ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(sx - w / 2, topY); ctx.lineTo(sx + w / 2, topY); ctx.lineTo(sx + w / 2, topY + h); ctx.lineTo(sx, topY + h - 7); ctx.lineTo(sx - w / 2, topY + h); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = hexA('#000', 0.18); ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = hexA(accent, 0.92); ctx.beginPath(); ctx.arc(sx, topY + 17, 6.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = '900 9px Helvetica, Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('C', sx, topY + 17);
};

// Canopy daybed (2 tiles): four gold posts, a translucent canopy roof with corner drapes, plush
// mattress + headboard, bolster pillows and an accent throw cushion. Tall + sittable. Rotates.
const drawCanopy = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  const cT = shade(base, 1.3), cR = shade(base, 0.95), cL = shade(base, 0.62), gold = '#caa24a';
  const post = (u: number, v: number): IsoPart => ({ u0: u - 0.05, u1: u + 0.05, v0: v - 0.05, v1: v + 0.05, z0: 0, z1: 1.75, t: shade(gold, 1.2), r: shade(gold, 0.85), l: shade(gold, 0.55) });
  const parts: IsoPart[] = [
    post(-0.85, -0.28), post(0.85, -0.28), post(-0.85, 0.3), post(0.85, 0.3),
    { u0: -0.9, u1: 0.9, v0: -0.3, v1: 0.34, z0: 0.16, z1: 0.34, t: cT, r: cR, l: cL },               // mattress base
    { u0: -0.86, u1: 0.86, v0: -0.28, v1: 0.32, z0: 0.34, z1: 0.52, t: shade(base, 1.32), r: cR, l: cL }, // cushion
    { u0: -0.9, u1: 0.9, v0: -0.32, v1: -0.24, z0: 0.34, z1: 0.92, t: cT, r: cR, l: cL }];              // headboard
  drawParts(ctx, sx, sy, dir, 0, 0, parts, (P) => {
    const z = 1.7;
    ctx.save(); ctx.globalAlpha = 0.5; poly(ctx, [P(-0.9, -0.3, z), P(0.9, -0.3, z), P(0.9, 0.34, z), P(-0.9, 0.34, z)], hexA(accent, 0.6)); ctx.restore();   // canopy roof
    poly(ctx, [P(-0.9, -0.3, z), P(0.9, -0.3, z), P(0.9, 0.34, z), P(-0.9, 0.34, z)], undefined, hexA('#fff', 0.4), 1);
    for (const u of [-0.85, 0.85]) { const a = P(u, -0.28, z), b = P(u, -0.28, z - 0.5); ctx.save(); ctx.globalAlpha = 0.4; ctx.fillStyle = hexA(accent, 0.7); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0] - 5, b[1]); ctx.lineTo(b[0] + 5, b[1]); ctx.closePath(); ctx.fill(); ctx.restore(); }   // corner drapes
    for (const u of [-0.4, 0.4]) { const c = P(u, 0.02, 0.52); ctx.fillStyle = shade(base, 1.5); ctx.beginPath(); ctx.ellipse(c[0], c[1] - 2, 9, 6, 0, 0, Math.PI * 2); ctx.fill(); }   // bolsters
    const pc = P(0, -0.08, 0.52); ctx.save(); ctx.translate(pc[0], pc[1]); ctx.rotate(0.2); ctx.fillStyle = accent; ctx.fillRect(-8, -7, 16, 13); ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(-8, -7, 16, 4); ctx.restore();   // throw cushion
  });
};

// Egg pod chair: weighted base, curved chrome arm, glossy open egg shell. The opening faces one of the
// 4 ISO directions (dir) — when it faces away from the camera you see the closed shell, as it should.
const drawEgg = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  const dv = [[-1, 1], [1, 1], [1, -1], [-1, -1]][((dir % 4) + 4) % 4];   // forward = iso screen dir the seat opens toward
  const fx = dv[0], fy = dv[1], facingCam = fy > 0;
  ctx.save(); ctx.globalAlpha = 0.2; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(sx, sy, TW * 0.4, TH * 0.4, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  ctx.fillStyle = '#3a3a44'; ctx.beginPath(); ctx.ellipse(sx, sy, 11, 5.5, 0, 0, Math.PI * 2); ctx.fill();
  const cy = sy - STACK_H * 1.18, eggCx = sx + fx * 4;
  // chrome arm from the BACK side (−forward) up to the top of the shell
  ctx.strokeStyle = '#9aa0ac'; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(sx - fx * 9, sy - 2 - fy * 2); ctx.quadraticCurveTo(sx - fx * 18, cy - STACK_H * 0.6, eggCx - fx * 2, cy - 22); ctx.stroke();
  // glossy shell
  const g = ctx.createLinearGradient(eggCx - 19, 0, eggCx + 19, 0); g.addColorStop(0, shade(base, 0.68)); g.addColorStop(0.5, shade(base, 1.22)); g.addColorStop(1, shade(base, 0.82));
  ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(eggCx, cy, 19, 25, 0, 0, Math.PI * 2); ctx.fill();
  if (facingCam) {   // opening toward the camera → show the scooped interior + cushion, offset along forward
    const ox = eggCx + fx * 5, oy = cy + fy * 5;
    ctx.fillStyle = shade(base, 0.5); ctx.beginPath(); ctx.ellipse(ox, oy, 13, 16, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = hexA(accent, 0.9); ctx.beginPath(); ctx.ellipse(ox, oy + 3, 11, 12, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.ellipse(eggCx - 7, cy - 9, 4, 9, -0.5, 0, Math.PI * 2); ctx.fill();   // shell sheen
};

// Small lantern: a glass cage with a warm pulsing flame, a metal cap and a top ring (mount it on tables).
const drawLantern = (ctx: CanvasRenderingContext2D, sx: number, sy: number, _a: string, base: string, t: number) => {
  void _a; const top = boxAt(ctx, sx, sy, 0.16, 0.16, 0.18, '#2c2c34', '#000', false);
  const gx = sx, gy = top - 9, gw = 6, gh = 12;
  ctx.fillStyle = hexA(base, 0.3); ctx.fillRect(gx - gw, gy - gh, gw * 2, gh);                                  // glass
  ctx.save(); ctx.shadowColor = base; ctx.shadowBlur = 14; ctx.globalAlpha = 0.6 + Math.abs(Math.sin(t * 0.1)) * 0.4; ctx.fillStyle = base; ctx.beginPath(); ctx.ellipse(gx, gy - gh * 0.45, 2.6, 4.2, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();   // flame
  ctx.fillStyle = '#3a3a44'; ctx.fillRect(gx - gw - 1, gy - gh - 3, gw * 2 + 2, 3); ctx.fillRect(gx - gw - 1, gy - 2, gw * 2 + 2, 3);   // metal cap + base
  ctx.strokeStyle = '#5a5a66'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(gx, gy - gh - 4, 2.5, Math.PI, 0); ctx.stroke();   // hanging ring
};

// Lux chaise longue (2 tiles): gold legs, deep cushion, a high sloped back at one end + scroll, with
// piping and an accent bolster. Sittable, rotates.
const drawChaise = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  const cT = shade(base, 1.32), cR = shade(base, 0.97), cL = shade(base, 0.6), hi = shade(base, 1.6), gold = '#caa24a';
  const parts: IsoPart[] = [
    ...legs([[-0.78, -0.24], [0.78, -0.24], [-0.78, 0.3], [0.78, 0.3]], 0.16).map(p => ({ ...p, t: shade(gold, 1.2), r: shade(gold, 0.85), l: shade(gold, 0.55) })),
    { u0: -0.9, u1: 0.92, v0: -0.3, v1: 0.34, z0: 0.16, z1: 0.36, t: cT, r: cR, l: cL },               // base
    { u0: -0.86, u1: 0.9, v0: -0.28, v1: 0.32, z0: 0.36, z1: 0.56, t: shade(base, 1.28), r: cR, l: cL }, // cushion
    { u0: -0.92, u1: -0.66, v0: -0.3, v1: 0.34, z0: 0.36, z1: 1.0, t: cT, r: cR, l: cL },               // back lower
    { u0: -0.92, u1: -0.76, v0: -0.3, v1: 0.34, z0: 1.0, z1: 1.34, t: cT, r: cR, l: cL }];              // back upper (sloped)
  drawParts(ctx, sx, sy, dir, 0, 0, parts, (P) => {
    poly(ctx, [P(-0.86, -0.28, 0.56), P(0.9, -0.28, 0.56), P(0.9, 0.32, 0.56), P(-0.86, 0.32, 0.56)], undefined, hexA(hi, 0.45), 1);   // cushion piping
    const c = P(0.66, 0.02, 0.56); ctx.fillStyle = accent; ctx.beginPath(); ctx.ellipse(c[0], c[1] - 4, 11, 7, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.beginPath(); ctx.ellipse(c[0] - 2, c[1] - 6, 4, 3, 0, 0, Math.PI * 2); ctx.fill();   // bolster
  });
};

// Tall Greek column (4 high): stepped plinth, fluted marble shaft with veining, flared capital, and a
// decorative urn finial on top.
const drawGreekCol = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string) => {
  const cx = sx, m = base, totalH = 4 * STACK_H, baseH = STACK_H * 0.5, capH = STACK_H * 0.55, shaftW = TW * 0.4;
  const shaftBottom = sy - baseH, shaftTop = sy - (totalH - capH);
  boxAt(ctx, cx, sy, 0.52, 0.52, baseH / STACK_H, shade(m, 0.82), accent);
  boxAt(ctx, cx, sy - baseH * 0.45, 0.42, 0.42, baseH * 0.55 / STACK_H, shade(m, 0.95), accent);
  const g = ctx.createLinearGradient(cx - shaftW, 0, cx + shaftW, 0); g.addColorStop(0, shade(m, 0.55)); g.addColorStop(0.3, shade(m, 1.08)); g.addColorStop(0.5, shade(m, 1.3)); g.addColorStop(0.7, shade(m, 1.0)); g.addColorStop(1, shade(m, 0.5));
  ctx.fillStyle = g; ctx.fillRect(cx - shaftW, shaftTop, shaftW * 2, shaftBottom - shaftTop);
  ctx.beginPath(); ctx.ellipse(cx, shaftBottom, shaftW, TH * 0.42, 0, 0, Math.PI); ctx.fill();
  for (let i = -3; i <= 3; i++) { const x = cx + i * shaftW * 0.26; ctx.strokeStyle = hexA('#000', 0.12); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, shaftTop + 2); ctx.lineTo(x, shaftBottom); ctx.stroke(); ctx.strokeStyle = hexA('#fff', 0.12); ctx.beginPath(); ctx.moveTo(x + 1.4, shaftTop + 2); ctx.lineTo(x + 1.4, shaftBottom); ctx.stroke(); }
  ctx.fillStyle = shade(m, 1.32); ctx.beginPath(); ctx.ellipse(cx, shaftTop, shaftW, TH * 0.42, 0, 0, Math.PI * 2); ctx.fill();
  boxAt(ctx, cx, shaftTop + TH * 0.4, 0.5, 0.5, capH * 0.7 / STACK_H, shade(m, 1.1), accent);
  boxAt(ctx, cx, shaftTop - capH * 0.3, 0.62, 0.62, 0.22, shade(m, 1.0), accent);
  const uy = shaftTop - capH * 0.3 - STACK_H * 0.5;   // urn finial
  ctx.fillStyle = shade(m, 1.12); ctx.beginPath(); ctx.moveTo(cx - 8, uy); ctx.quadraticCurveTo(cx - 11, uy - 11, cx - 4, uy - 16); ctx.lineTo(cx + 4, uy - 16); ctx.quadraticCurveTo(cx + 11, uy - 11, cx + 8, uy); ctx.closePath(); ctx.fill();
  ctx.fillStyle = shade(m, 0.9); ctx.fillRect(cx - 5, uy - 19, 10, 4);
  ctx.strokeStyle = hexA(accent, 0.4); ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(cx, uy - 16, 4, 2, 0, 0, Math.PI * 2); ctx.stroke();
};

// Greek arch (3 tiles): two fluted columns joined by a rounded arch with a keystone + accent underglow.
// Walkable so avatars pass under it. Rotates to span either axis.
const drawArch = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  const P = (u: number, v: number, z: number): number[] => { const [ru, rv] = rotUV(u, v, dir, 0, 0); return [sx + (ru - rv) * TW, sy + (ru + rv) * TH - z * STACK_H]; };
  const m = base;
  for (const u of [-1.1, 1.1]) {
    const b0 = P(u, 0, 0), top = P(u, 0, 2.6);
    const g = ctx.createLinearGradient(b0[0] - TW * 0.22, 0, b0[0] + TW * 0.22, 0); g.addColorStop(0, shade(m, 0.6)); g.addColorStop(0.5, shade(m, 1.28)); g.addColorStop(1, shade(m, 0.6));
    ctx.fillStyle = g; ctx.fillRect(b0[0] - TW * 0.2, top[1], TW * 0.4, b0[1] - top[1]);
    ctx.fillStyle = shade(m, 0.9); ctx.fillRect(b0[0] - TW * 0.26, b0[1] - 6, TW * 0.52, 6);
    ctx.fillStyle = shade(m, 1.12); ctx.fillRect(top[0] - TW * 0.27, top[1] - 2, TW * 0.54, 8);
  }
  const lt = P(-1.1, 0, 2.75), rt = P(1.1, 0, 2.75), ap = P(0, 0, 3.5);
  ctx.lineCap = 'round'; ctx.strokeStyle = shade(m, 1.15); ctx.lineWidth = 11; ctx.beginPath(); ctx.moveTo(lt[0], lt[1]); ctx.quadraticCurveTo(ap[0], ap[1] - 12, rt[0], rt[1]); ctx.stroke();
  ctx.strokeStyle = shade(m, 0.8); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(lt[0], lt[1]); ctx.quadraticCurveTo(ap[0], ap[1] - 12, rt[0], rt[1]); ctx.stroke();
  ctx.strokeStyle = hexA(accent, 0.5); ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(lt[0], lt[1] + 7); ctx.quadraticCurveTo(ap[0], ap[1] - 3, rt[0], rt[1] + 7); ctx.stroke();
  ctx.save(); ctx.fillStyle = shade(m, 1.32); ctx.translate(ap[0], ap[1] - 10); ctx.beginPath(); ctx.moveTo(-5, -9); ctx.lineTo(5, -9); ctx.lineTo(7, 9); ctx.lineTo(-7, 9); ctx.closePath(); ctx.fill(); ctx.restore();   // keystone
};

// Peacock throne: gold-framed seat with a towering fan of teal/green plumes tipped with jewelled
// eye-spots. Tall + sittable, rotates.
const drawPeacock = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  const gold = '#caa24a', cT = shade(gold, 1.2), cR = shade(gold, 0.9), cL = shade(gold, 0.58);
  const parts: IsoPart[] = [
    ...legs([[-0.34, -0.28], [0.34, -0.28], [-0.34, 0.32], [0.34, 0.32]], 0.16).map(p => ({ ...p, t: cT, r: cR, l: cL })),
    { u0: -0.4, u1: 0.4, v0: -0.26, v1: 0.34, z0: 0.16, z1: 0.52, t: cT, r: cR, l: cL },               // seat box
    { u0: -0.36, u1: 0.36, v0: -0.22, v1: 0.3, z0: 0.52, z1: 0.72, t: shade(base, 1.2), r: cR, l: cL }]; // cushion
  drawParts(ctx, sx, sy, dir, 0, 0, parts, (P) => {
    const root = P(0, -0.24, 0.52), blades = 13, spread = 2.3, len = STACK_H * 2.0;
    for (let i = 0; i < blades; i++) {
      const f = i / (blades - 1) - 0.5, a = f * spread, tipx = root[0] + Math.sin(a) * len * 0.62, tipy = root[1] - len + Math.abs(f) * len * 0.16;
      ctx.strokeStyle = i % 2 ? '#0e7c86' : '#1e8a4a'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(root[0], root[1]); ctx.quadraticCurveTo((root[0] + tipx) / 2, root[1] - len * 0.62, tipx, tipy); ctx.stroke();
      ctx.fillStyle = '#1f5fb0'; ctx.beginPath(); ctx.arc(tipx, tipy, 4.5, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#1e8a4a'; ctx.beginPath(); ctx.arc(tipx, tipy, 3, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#e8c66a'; ctx.beginPath(); ctx.arc(tipx, tipy, 1.5, 0, Math.PI * 2); ctx.fill();
    }
    const a = P(0, 0.04, 0.72); ctx.fillStyle = accent; ctx.beginPath(); ctx.ellipse(a[0], a[1] - 3, 10, 6, 0, 0, Math.PI * 2); ctx.fill();   // seat cushion accent
  });
};

// Cloud sofa: an oversized puffy sofa built from overlapping soft gradient lobes (back row + seat row).
const drawCloud = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  const cT = shade(base, 1.28), cR = shade(base, 0.96), cL = shade(base, 0.64);
  const parts: IsoPart[] = [{ u0: -0.92, u1: 0.92, v0: -0.3, v1: 0.34, z0: 0.1, z1: 0.5, t: cT, r: cR, l: cL }];
  drawParts(ctx, sx, sy, dir, 0, 0, parts, (P) => {
    const lobe = (u: number, zt: number, v: number, r: number) => { const c = P(u, v, zt); const g = ctx.createRadialGradient(c[0] - r * 0.3, c[1] - r * 0.4, 2, c[0], c[1], r); g.addColorStop(0, shade(base, 1.5)); g.addColorStop(0.7, shade(base, 1.18)); g.addColorStop(1, shade(base, 0.84)); ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(c[0], c[1], r, r * 0.82, 0, 0, Math.PI * 2); ctx.fill(); };
    for (const u of [-0.72, -0.36, 0, 0.36, 0.72]) lobe(u, 0.98, -0.12, 15);   // back lobes
    for (const u of [-0.58, 0, 0.58]) lobe(u, 0.62, 0.16, 16);                 // seat lobes
    const c = P(0.5, 0.0, 0.64); ctx.fillStyle = accent; ctx.beginPath(); ctx.ellipse(c[0], c[1] - 3, 8, 6, 0.3, 0, Math.PI * 2); ctx.fill();   // throw pillow
  });
};

// Round conversation pit: a circular sectional ring with backrest bumps + a low accent centre table.
const drawPit = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string) => {
  ctx.fillStyle = shade(base, 0.78); ctx.beginPath(); ctx.ellipse(sx, sy, TW * 0.96, TH * 0.96, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = shade(base, 1.26); ctx.beginPath(); ctx.ellipse(sx, sy - 8, TW * 0.96, TH * 0.82, 0, 0, Math.PI * 2); ctx.fill();
  for (let i = 0; i < 6; i++) { const ang = Math.PI * (1.08 + i * 0.165), bx = sx + Math.cos(ang) * TW * 0.82, by = sy - 8 + Math.sin(ang) * TH * 0.72; ctx.fillStyle = shade(base, 1.4); ctx.beginPath(); ctx.ellipse(bx, by - 6, 11, 9, 0, 0, Math.PI * 2); ctx.fill(); }   // backrest bumps
  ctx.fillStyle = shade(base, 0.5); ctx.beginPath(); ctx.ellipse(sx, sy - 6, TW * 0.5, TH * 0.42, 0, 0, Math.PI * 2); ctx.fill();   // sunken centre
  ctx.fillStyle = hexA(accent, 0.55); ctx.beginPath(); ctx.ellipse(sx, sy - 8, TW * 0.3, TH * 0.25, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = hexA('#fff', 0.3); ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(sx, sy - 8, TW * 0.3, TH * 0.25, 0, 0, Math.PI * 2); ctx.stroke();
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
    case 'tree': drawTree(ctx, sx, sy, accent, d.color); break;
    case 'palm': drawPalm(ctx, sx, sy, accent, d.color); break;
    case 'bench': drawBench(ctx, sx, sy, accent, d.color, dir); break;
    case 'reception': drawReception(ctx, sx, sy, accent, d.color, dir); break;
    case 'pa': drawPA(ctx, sx, sy, accent, d.color, t, dir); break;
    case 'ladder': drawLadder(ctx, sx, sy, accent, d.color, dir); break;
    case 'rope': drawRope(ctx, sx, sy, accent, d.color, dir); break;
    case 'booth': drawBooth(ctx, sx, sy, accent, d.color, t, dir); break;
    case 'parasol': drawParasol(ctx, sx, sy, accent, d.color); break;
    case 'lounger': drawLounger(ctx, sx, sy, accent, d.color, dir); break;
    case 'topiary': drawTopiary(ctx, sx, sy, accent, d.color); break;
    case 'banner': drawBanner(ctx, sx, sy, accent, d.color); break;
    case 'canopy': drawCanopy(ctx, sx, sy, accent, d.color, dir); break;
    case 'eggchair': drawEgg(ctx, sx, sy, accent, d.color, dir); break;
    case 'lantern': drawLantern(ctx, sx, sy, accent, d.color, t); break;
    case 'chaise': drawChaise(ctx, sx, sy, accent, d.color, dir); break;
    case 'greekcol': drawGreekCol(ctx, sx, sy, accent, d.color); break;
    case 'arch': drawArch(ctx, sx, sy, accent, d.color, dir); break;
    case 'peacock': drawPeacock(ctx, sx, sy, accent, d.color, dir); break;
    case 'cloud': drawCloud(ctx, sx, sy, accent, d.color, dir); break;
    case 'pit': drawPit(ctx, sx, sy, accent, d.color); break;
    case 'chandelier': drawChandelier(ctx, sx, sy, accent, d.color, t); break;
    case 'float': drawFloat(ctx, sx, sy, accent, d.color, t); break;
    case 'fountain': drawFountain(ctx, sx, sy, accent, d.color, t); break;
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
    case 'tv': drawTV(ctx, sx, sy, accent, d.color, t, dir); break;
    case 'laptop': drawLaptop(ctx, sx, sy, accent, d.color, t, dir); break;
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
    case 'bartop': drawBar(ctx, sx, sy, accent, d.color, dir); break;
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
