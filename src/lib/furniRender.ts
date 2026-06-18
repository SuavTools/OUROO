// Shared isometric furniture renderer — the SINGLE source of truth for how a furni looks. Used by
// the PRAÇA room (full size, animated) AND by the menu thumbnails (scaled down). Everything draws in
// absolute pixels relative to a tile origin (sx, sy); callers scale/translate as needed.
//
// `accent` = the room accent colour; `t` = frame counter for the few animated pieces.

import { defOf } from './furni';
import { hasSvg, drawSvgFurni } from './furniSvg';
import { hasPng, drawPngFurni } from './furniPng';

export const TILE_W = 64, TILE_H = 32, TW = TILE_W / 2, TH = TILE_H / 2, STACK_H = 26;

const hexA = (hex: string, a: number) => { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };
const shade = (hex: string, f: number) => { const n = parseInt(hex.slice(1), 16); const r = Math.min(255, Math.round(((n >> 16) & 255) * f)), g = Math.min(255, Math.round(((n >> 8) & 255) * f)), b = Math.min(255, Math.round((n & 255) * f)); return `rgb(${r},${g},${b})`; };

const diamond = (ctx: CanvasRenderingContext2D, cx: number, cy: number, hw: number, hh: number) => { ctx.beginPath(); ctx.moveTo(cx, cy - hh); ctx.lineTo(cx + hw, cy); ctx.lineTo(cx, cy + hh); ctx.lineTo(cx - hw, cy); ctx.closePath(); };

const block = (ctx: CanvasRenderingContext2D, cx: number, cyBase: number, h: number, base: string, accent: string, foot: number, emoji?: string, noAccent?: boolean) => {
  const f = noAccent ? 1.0 : 0.9;
  const hw = TW * foot * f, hh = TH * foot * f, Hh = h * STACK_H, cyTop = cyBase - Hh;
  ctx.fillStyle = shade(base, 0.55); ctx.beginPath(); ctx.moveTo(cx - hw, cyBase); ctx.lineTo(cx, cyBase + hh); ctx.lineTo(cx, cyTop + hh); ctx.lineTo(cx - hw, cyTop); ctx.closePath(); ctx.fill();
  ctx.fillStyle = shade(base, 0.8); ctx.beginPath(); ctx.moveTo(cx, cyBase + hh); ctx.lineTo(cx + hw, cyBase); ctx.lineTo(cx + hw, cyTop); ctx.lineTo(cx, cyTop + hh); ctx.closePath(); ctx.fill();
  ctx.fillStyle = shade(base, 1.25); diamond(ctx, cx, cyTop, hw, hh); ctx.fill();
  if (!noAccent) { ctx.strokeStyle = hexA(accent, 0.35); ctx.lineWidth = 1; diamond(ctx, cx, cyTop, hw, hh); ctx.stroke(); }
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

// ───────── Building kit: textured iso blocks + rotatable doors/windows ─────────
// A face is a parallelogram [A,B,C,D] = bottom-left, bottom-right, top-right, top-left. fp(fx,fy)
// bilinearly maps a 0..1 face coord onto it (fy 0 = floor, 1 = top), so texture/openings sit in iso.
const lerp2 = (a: number[], b: number[], f: number): number[] => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
const fp = (A: number[], B: number[], C: number[], D: number[], fx: number, fy: number) => lerp2(lerp2(A, B, fx), lerp2(D, C, fx), fy);
const fLine = (ctx: CanvasRenderingContext2D, F: number[][], x0: number, y0: number, x1: number, y1: number, col: string, lw = 1) => { const p = fp(F[0], F[1], F[2], F[3], x0, y0), q = fp(F[0], F[1], F[2], F[3], x1, y1); ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke(); };
const fQuad = (ctx: CanvasRenderingContext2D, F: number[][], x0: number, x1: number, y0: number, y1: number, fill?: string, stroke?: string, lw = 1) => poly(ctx, [fp(F[0], F[1], F[2], F[3], x0, y0), fp(F[0], F[1], F[2], F[3], x1, y0), fp(F[0], F[1], F[2], F[3], x1, y1), fp(F[0], F[1], F[2], F[3], x0, y1)], fill, stroke, lw);
const texOf = (kind: string): string | null => /brick/.test(kind) ? 'brick' : /wood|thatch/.test(kind) ? 'wood' : /stone|pillar/.test(kind) ? 'stone' : /marble/.test(kind) ? 'marble' : /metal/.test(kind) ? 'metal' : /glass/.test(kind) ? 'glass' : null;
const faceTex = (ctx: CanvasRenderingContext2D, F: number[][], tex: string | null, base: string, rows: number) => {
  if (!tex) return; ctx.save();
  const dk = shade(base, 0.5), lt = shade(base, 1.15);
  if (tex === 'brick') { for (let i = 1; i < rows; i++) fLine(ctx, F, 0, i / rows, 1, i / rows, dk, 1); for (let i = 0; i < rows; i++) { const off = (i % 2) ? 0.25 : 0; for (let c = 0; c <= 2; c++) { const fx = c * 0.5 + off; if (fx > 0.02 && fx < 0.98) fLine(ctx, F, fx, i / rows, fx, (i + 1) / rows, dk, 1); } } }
  else if (tex === 'wood') { for (let c = 1; c < 4; c++) fLine(ctx, F, c / 4, 0, c / 4, 1, dk, 1.2); for (let c = 0; c < 4; c++) fLine(ctx, F, c / 4 + 0.06, 0, c / 4 + 0.06, 1, hexA(lt, 0.4), 0.6); }
  else if (tex === 'stone') { for (let i = 1; i < rows; i++) fLine(ctx, F, 0, i / rows, 1, i / rows, dk, 1); for (let i = 0; i < rows; i++) { const fx = 0.3 + (i % 3) * 0.2; fLine(ctx, F, fx, i / rows, fx, (i + 1) / rows, dk, 1); } }
  else if (tex === 'marble') { ctx.globalAlpha = 0.5; fLine(ctx, F, 0.15, 0.85, 0.6, 0.25, hexA(dk, 0.7), 1); fLine(ctx, F, 0.55, 0.9, 0.85, 0.5, hexA(dk, 0.5), 1); }
  else if (tex === 'metal') { for (const fx of [0.33, 0.66]) fLine(ctx, F, fx, 0, fx, 1, dk, 1.2); ctx.fillStyle = lt; for (const c of [[0.08, 0.1], [0.92, 0.1], [0.08, 0.9], [0.92, 0.9]]) { const p = fp(F[0], F[1], F[2], F[3], c[0], c[1]); ctx.beginPath(); ctx.arc(p[0], p[1], 1.2, 0, Math.PI * 2); ctx.fill(); } }
  else if (tex === 'glass') { fQuad(ctx, F, 0.12, 0.88, 0.12, 0.92, hexA('#bfe6ff', 0.35)); fLine(ctx, F, 0.5, 0.1, 0.5, 0.92, hexA('#fff', 0.5), 1); fLine(ctx, F, 0.12, 0.5, 0.88, 0.5, hexA('#fff', 0.5), 1); }
  ctx.restore();
};
// A full-tile iso cube with material texture; optional doorway / window carved on a chosen face (dir).
const drawBuilt = (ctx: CanvasRenderingContext2D, cx: number, cyB: number, h: number, base: string, accent: string, foot: number, kind: string, opening: 'door' | 'window' | null = null, dir = 0, noAccent = false) => {
  const f = noAccent ? 1.0 : 0.9;
  const hw = TW * foot * f, hh = TH * foot * f, cyT = cyB - h * STACK_H, tex = texOf(kind), rows = Math.max(3, Math.round(h * 3));
  const L = [[cx - hw, cyB], [cx, cyB + hh], [cx, cyT + hh], [cx - hw, cyT]];   // left face A,B,C,D
  const R = [[cx, cyB + hh], [cx + hw, cyB], [cx + hw, cyT], [cx, cyT + hh]];   // right face
  poly(ctx, L, shade(base, 0.62)); poly(ctx, R, shade(base, 0.82));
  ctx.fillStyle = shade(base, 1.2); diamond(ctx, cx, cyT, hw, hh); ctx.fill(); if (!noAccent) { ctx.strokeStyle = hexA(accent, 0.3); ctx.lineWidth = 1; diamond(ctx, cx, cyT, hw, hh); ctx.stroke(); }
  faceTex(ctx, L, tex, base, rows); faceTex(ctx, R, tex, base, rows);
  if (opening) {
    const F = (((dir % 4) + 4) % 4) % 2 === 1 ? R : L;   // rotate the opening between the two iso faces
    if (opening === 'door') {
      // All doors are full-block now — the opening fills (nearly) the whole face. `double` keeps a centre
      // split; `arch` keeps a rounded top. (`door_full*` kept as aliases.)
      const dbl = /double/.test(kind), arch = /arch/.test(kind);
      const x0 = 0.12, x1 = 0.88, yTop = 0.95;
      if (arch) {   // rounded-top opening
        const pts: number[][] = [fp(F[0], F[1], F[2], F[3], x0, 0), fp(F[0], F[1], F[2], F[3], x0, yTop - 0.28)];
        for (let a = 0; a <= 7; a++) { const fx = x0 + (x1 - x0) * (a / 7), fy = (yTop - 0.28) + 0.28 * Math.sin(Math.PI * (a / 7)); pts.push(fp(F[0], F[1], F[2], F[3], fx, fy)); }
        pts.push(fp(F[0], F[1], F[2], F[3], x1, 0)); poly(ctx, pts, 'rgba(8,8,12,0.92)', hexA(accent, 0.5), 1.5);
      } else {
        fQuad(ctx, F, x0, x1, 0.0, yTop, 'rgba(8,8,12,0.92)', hexA(accent, 0.5), 1.5);
      }
      if (dbl) fLine(ctx, F, 0.5, 0, 0.5, arch ? 0.62 : 0.78, hexA(accent, 0.45), 1.2);   // split line for double doors
      ctx.fillStyle = shade(base, 1.4);
      for (const hx of dbl ? [0.44, 0.56] : [0.64]) { const hp = fp(F[0], F[1], F[2], F[3], hx, 0.4); ctx.beginPath(); ctx.arc(hp[0], hp[1], 1.6, 0, Math.PI * 2); ctx.fill(); }
    } else {
      const P = (fx: number, fy: number) => fp(F[0], F[1], F[2], F[3], fx, fy);
      if (/round/.test(kind)) {   // porthole — circular pane
        const ring = (rad: number, fill: string) => { const pts: number[][] = []; for (let a = 0; a < 16; a++) { const an = (a / 16) * Math.PI * 2; pts.push(P(0.5 + Math.cos(an) * rad, 0.58 + Math.sin(an) * rad * 1.5)); } poly(ctx, pts, fill); };
        ring(0.3, shade(base, 0.5)); ring(0.24, '#9fd0f0');
        fLine(ctx, F, 0.5, 0.34, 0.5, 0.82, hexA('#fff', 0.6), 1); fLine(ctx, F, 0.26, 0.58, 0.74, 0.58, hexA('#fff', 0.6), 1);
      } else if (/arch/.test(kind)) {   // arched-top pane
        const pane = (x0: number, x1: number, yb: number, top: number, fill: string) => { const pts: number[][] = [P(x0, yb), P(x0, top)]; for (let a = 0; a <= 6; a++) { const fx = x0 + (x1 - x0) * (a / 6); pts.push(P(fx, top + 0.16 * Math.sin(Math.PI * (a / 6)))); } pts.push(P(x1, top), P(x1, yb)); poly(ctx, pts, fill); };
        pane(0.18, 0.82, 0.34, 0.72, shade(base, 0.5)); pane(0.24, 0.76, 0.4, 0.68, '#9fd0f0');
        fLine(ctx, F, 0.5, 0.36, 0.5, 0.82, hexA('#fff', 0.7), 1.2);
      } else {
        fQuad(ctx, F, 0.18, 0.82, 0.34, 0.82, shade(base, 0.5));   // frame
        fQuad(ctx, F, 0.22, 0.78, 0.38, 0.78, '#9fd0f0');           // glass
        fLine(ctx, F, 0.5, 0.36, 0.5, 0.8, hexA('#fff', 0.7), 1.2); fLine(ctx, F, 0.22, 0.58, 0.78, 0.58, hexA('#fff', 0.7), 1.2);
      }
    }
  }
};

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

// 2-tile-wide GATE — two jambs + a top lintel spanning the full width, open in the middle and walk-through.
// Built from rotatable iso parts so it turns to sit on either wall direction (span [2,1]).
const drawGate = (ctx: CanvasRenderingContext2D, sx: number, sy: number, _a: string, base: string, dir: number, h: number) => {
  void _a; const t = shade(base, 1.2), r = shade(base, 0.82), l = shade(base, 0.62);
  const jamb = (u0: number, u1: number): IsoPart => ({ u0, u1, v0: -0.4, v1: 0.4, z0: 0, z1: h, t, r, l });
  const parts: IsoPart[] = [
    jamb(-1.0, -0.58),                                                          // left post
    jamb(0.58, 1.0),                                                            // right post
    { u0: -1.0, u1: 1.0, v0: -0.4, v1: 0.4, z0: h - 0.55, z1: h, t, r, l },     // lintel beam across the top
  ];
  drawParts(ctx, sx, sy, dir, 0, 0, parts);
};

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
const drawTree = (ctx: CanvasRenderingContext2D, sx: number, sy: number, _a: string, base: string, dir: number) => {
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
  ctx.save(); ctx.globalAlpha = 0.45; ctx.fillStyle = '#cdfaa8'; for (let i = 0; i < 16; i++) { const a = i * 2.39917 + dir * 1.571, rr = TW * (0.2 + (i % 5) * 0.13); ctx.beginPath(); ctx.arc(sx + Math.cos(a) * rr, cy - TH * 0.3 + Math.sin(a) * rr * 0.6, 1.8, 0, Math.PI * 2); ctx.fill(); } ctx.restore();
};

// Palm: curved segmented trunk + a crown of arcing gradient fronds with midribs and coconuts.
const drawPalm = (ctx: CanvasRenderingContext2D, sx: number, sy: number, _a: string, base: string, dir: number) => {
  void _a; const flip = fwd(dir)[0] < 0; ctx.save(); if (flip) { ctx.translate(sx, 0); ctx.scale(-1, 1); ctx.translate(-sx, 0); }
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
  ctx.restore();
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

// Reception desk (3 tiles): tall wood body, marble counter-top overhang, accent strip.
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
const drawFountain = (ctx: CanvasRenderingContext2D, sx: number, sy: number, _a: string, base: string, t: number, dir: number) => {
  void _a; void dir; const stone = base;
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
const drawTopiary = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  void dir; const top = boxAt(ctx, sx, sy, 0.4, 0.4, 0.55, '#b5572f', accent);
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
const drawLantern = (ctx: CanvasRenderingContext2D, sx: number, sy: number, _a: string, base: string, t: number, dir: number) => {
  void _a; void dir; const top = boxAt(ctx, sx, sy, 0.16, 0.16, 0.18, '#2c2c34', '#000', false);
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

// ═══════════ Japanese-garden pieces — procedural ISO, 4-way rotatable (no flat billboards) ═══════════
// Directional projector centred on the piece's tile origin (u = right, v = left, z = up), rotated by dir.
const proj = (sx: number, sy: number, dir: number) => (u: number, v: number, z = 0): [number, number] => {
  const [ru, rv] = rotUV(u, v, dir, 0, 0); return [sx + (ru - rv) * TW, sy + (ru + rv) * TH - z * STACK_H];
};
// Forward screen vector a piece "faces" for each dir (matches the egg-chair convention).
const fwd = (dir: number): [number, number] => ([[-1, 1], [1, 1], [1, -1], [-1, -1]] as [number, number][])[((dir % 4) + 4) % 4];
// Low hip roof drawn as an iso slab (eave thickness on the two front faces) + four facets to a ridge
// peak; returns the peak y. Used by the pagoda + stone lantern so their roofs sit in iso space.
const hipRoof = (ctx: CanvasRenderingContext2D, sx: number, top: number, foot: number, col: string, th: number, ridgeF = 0.7, gold = false) => {
  const hw = TW * foot, hh = TH * foot;
  poly(ctx, [[sx - hw, top], [sx, top + hh], [sx, top + hh + th], [sx - hw, top + th]], shade(col, 0.55));   // left eave
  poly(ctx, [[sx, top + hh], [sx + hw, top], [sx + hw, top + th], [sx, top + hh + th]], shade(col, 0.78));   // right eave
  const pk = top - hh * ridgeF;
  poly(ctx, [[sx - hw, top], [sx, top - hh], [sx, pk]], shade(col, 1.0));    // back-left facet
  poly(ctx, [[sx, top - hh], [sx + hw, top], [sx, pk]], shade(col, 1.22));   // back-right facet (lit)
  poly(ctx, [[sx + hw, top], [sx, top + hh], [sx, pk]], shade(col, 1.08));   // front-right facet
  poly(ctx, [[sx, top + hh], [sx - hw, top], [sx, pk]], shade(col, 0.84));   // front-left facet
  if (gold) { ctx.strokeStyle = hexA('#e8c66a', 0.85); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(sx - hw, top); ctx.lineTo(sx, pk); ctx.lineTo(sx + hw, top); ctx.stroke(); }
  return pk;
};

// Torii gate (3 tiles, walkable): tapered vermilion posts, a nuki tie-beam behind them, an upturned
// kasagi lintel + hanging tablet. Rotates to span either iso axis.
const drawTorii = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  void accent; const P = proj(sx, sy, dir); const red = base, pw = TW * 0.13;
  const lN = P(-1, 0, 2.4), rN = P(1, 0, 2.4);
  ctx.lineCap = 'butt'; ctx.strokeStyle = shade(red, 0.7); ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(lN[0], lN[1]); ctx.lineTo(rN[0], rN[1]); ctx.stroke();   // nuki (behind posts)
  for (const u of [-1, 1]) {
    const b = P(u, 0, 0), top = P(u, 0, 3.0);
    const g = ctx.createLinearGradient(b[0] - pw, 0, b[0] + pw, 0); g.addColorStop(0, shade(red, 0.58)); g.addColorStop(0.5, shade(red, 1.28)); g.addColorStop(1, shade(red, 0.58));
    ctx.fillStyle = g; ctx.fillRect(b[0] - pw, top[1], pw * 2, b[1] - top[1]);
    ctx.fillStyle = '#181818'; ctx.fillRect(b[0] - pw - 1, b[1] - 5, pw * 2 + 2, 6);   // footing
  }
  const lK = P(-1.2, 0, 3.0), rK = P(1.2, 0, 3.0), mK = P(0, 0, 3.24);
  ctx.lineCap = 'round'; ctx.strokeStyle = '#181818'; ctx.lineWidth = 14; ctx.beginPath(); ctx.moveTo(lK[0], lK[1] + 4); ctx.quadraticCurveTo(mK[0], mK[1] + 4, rK[0], rK[1] + 4); ctx.stroke();
  ctx.strokeStyle = shade(red, 1.12); ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(lK[0], lK[1]); ctx.quadraticCurveTo(mK[0], mK[1], rK[0], rK[1]); ctx.stroke();   // kasagi
  const tb = P(0, 0, 2.6); ctx.fillStyle = '#181818'; ctx.fillRect(tb[0] - 7, tb[1] - 8, 14, 15); ctx.fillStyle = '#caa24a'; ctx.fillRect(tb[0] - 5, tb[1] - 6, 10, 11);   // tablet
};

// Pagoda (4 high): stacked cream-walled tiers, each capped by a wide upturned vermilion roof, gold
// sōrin finial. Near 4-fold symmetric so it reads as a tower from every angle.
const drawPagoda = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  void dir; const red = base, wall = '#ece4d2';
  let top = boxAt(ctx, sx, sy, 0.6, 0.6, 1.1, wall, accent); hipRoof(ctx, sx, top, 0.96, red, STACK_H * 0.3, 0.7, true);
  top = boxAt(ctx, sx, top - TH * 0.55, 0.48, 0.48, 1.0, wall, accent); hipRoof(ctx, sx, top, 0.78, red, STACK_H * 0.28, 0.7, true);
  top = boxAt(ctx, sx, top - TH * 0.45, 0.36, 0.36, 0.9, wall, accent); const pk = hipRoof(ctx, sx, top, 0.6, red, STACK_H * 0.24, 0.7, true);
  ctx.fillStyle = '#caa24a'; ctx.fillRect(sx - 2, pk - STACK_H * 0.55, 4, STACK_H * 0.55);
  ctx.fillStyle = '#e8c66a'; ctx.beginPath(); ctx.arc(sx, pk - STACK_H * 0.55, 4, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = hexA('#caa24a', 0.8); ctx.lineWidth = 1.4; for (const r of [5, 8]) { ctx.beginPath(); ctx.ellipse(sx, pk - STACK_H * 0.22, r, r * 0.4, 0, 0, Math.PI * 2); ctx.stroke(); }
};

// Stone lantern / tōrō: stacked granite — base, post, glowing fire-box, upturned roof + finial. The warm
// windows sit on the two camera-facing faces, so it lives in iso space instead of facing flat-out.
const drawToro = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  void dir; const st = base;
  let top = boxAt(ctx, sx, sy, 0.4, 0.4, 0.42, shade(st, 0.86), accent);                 // base
  top = boxAt(ctx, sx, top + TH * 0.4, 0.13, 0.13, 0.95, shade(st, 1.0), accent);        // post
  const fbTop = boxAt(ctx, sx, top + TH * 0.13, 0.3, 0.3, 0.62, shade(st, 0.92), accent); // fire box
  const cyW = (top + fbTop) / 2;
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; const g = ctx.createRadialGradient(sx, cyW, 1, sx, cyW, 15); g.addColorStop(0, 'rgba(255,210,110,0.8)'); g.addColorStop(1, 'rgba(255,210,110,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, cyW, 15, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  ctx.fillStyle = '#ffd66a'; ctx.fillRect(sx - 5, cyW - 5, 4.2, 10); ctx.fillRect(sx + 0.8, cyW - 5, 4.2, 10);   // two glowing windows on the front faces
  hipRoof(ctx, sx, fbTop, 0.42, st, STACK_H * 0.2, 0.7, false);
  const pk = fbTop - TH * 0.42 * 0.7; ctx.fillStyle = shade(st, 1.2); ctx.beginPath(); ctx.arc(sx, pk - 2, 3, 0, Math.PI * 2); ctx.fill();   // finial
};

// Sakura: iso-grounded curved trunk (leans with dir) + a billowing pink blossom canopy of radial lobes
// with petal speckle. Canopy is rotationally even, so nothing "faces" the camera.
const drawSakura = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  void accent; void base; const f = fwd(dir), lean = 7, H = STACK_H * 2.2, tx = sx + f[0] * lean, ty = sy - H;
  ctx.save(); ctx.globalAlpha = 0.16; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(sx, sy, TW * 0.6, TH * 0.6, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  ctx.lineCap = 'round'; const tg = ctx.createLinearGradient(sx - 6, 0, sx + 6, 0); tg.addColorStop(0, '#52371f'); tg.addColorStop(0.5, '#7d573a'); tg.addColorStop(1, '#4a3119');
  ctx.strokeStyle = tg; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(sx + f[0] * lean * 0.5, sy - H * 0.55, tx, ty); ctx.stroke();
  ctx.lineWidth = 4; ctx.strokeStyle = '#5e4026'; ctx.beginPath(); ctx.moveTo(tx, ty + 14); ctx.lineTo(tx - 13, ty + 4); ctx.moveTo(tx, ty + 10); ctx.lineTo(tx + 14, ty - 2); ctx.stroke();
  const cy = ty - 6, lobe = (ox: number, oy: number, r: number) => { const g = ctx.createRadialGradient(tx + ox - r * 0.3, cy + oy - r * 0.35, 1, tx + ox, cy + oy, r); g.addColorStop(0, '#ffd9ea'); g.addColorStop(0.55, '#ff9ec7'); g.addColorStop(1, '#e06a9f'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(tx + ox, cy + oy, r, 0, Math.PI * 2); ctx.fill(); };
  lobe(0, 8, 22); lobe(-18, 2, 16); lobe(18, 0, 16); lobe(-9, -12, 14); lobe(11, -10, 13); lobe(0, -20, 12);
  ctx.save(); ctx.globalAlpha = 0.85; ctx.fillStyle = '#fff2f8'; for (let i = 0; i < 7; i++) { const a = i * 2.39917 + dir; ctx.beginPath(); ctx.arc(tx + Math.cos(a) * 16, cy - 4 + Math.sin(a) * 12, 2.2, 0, Math.PI * 2); ctx.fill(); } ctx.restore();
};

// Luxe bonsai: glazed iso pot + a gnarled trunk (leans with dir) and three trimmed foliage pads.
const drawBonsai = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  void base; const f = fwd(dir);
  const potTop = boxAt(ctx, sx, sy, 0.36, 0.36, 0.34, '#3a6a8a', accent);
  ctx.fillStyle = '#2c5470'; ctx.beginPath(); ctx.ellipse(sx, potTop, TW * 0.34, TH * 0.32, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#3a2a1a'; ctx.beginPath(); ctx.ellipse(sx, potTop, TW * 0.26, TH * 0.24, 0, 0, Math.PI * 2); ctx.fill();   // soil
  const bx = sx + f[0] * 3, by = potTop - 2;
  ctx.lineCap = 'round'; ctx.strokeStyle = '#5e4026'; ctx.lineWidth = 4.5; ctx.beginPath(); ctx.moveTo(sx, by); ctx.quadraticCurveTo(sx + f[0] * 8, by - 14, bx, by - 24); ctx.stroke();
  const pad = (ox: number, oy: number, r: number) => { const g = ctx.createRadialGradient(bx + ox - r * 0.3, by - 24 + oy - r * 0.3, 1, bx + ox, by - 24 + oy, r); g.addColorStop(0, '#4cbf6a'); g.addColorStop(0.7, '#2f9a4c'); g.addColorStop(1, '#1c6e34'); ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(bx + ox, by - 24 + oy, r, r * 0.6, 0, 0, Math.PI * 2); ctx.fill(); };
  pad(-12, 6, 13); pad(12, -2, 14); pad(0, -10, 11);
};

// Statue: iso plinth + a robed figure whose face + front sheen turn toward the camera with dir.
const drawStatue = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  const f = fwd(dir), ped = boxAt(ctx, sx, sy, 0.5, 0.5, 0.5, '#55555f', accent);
  const bh = STACK_H * 1.5, topY = ped - bh;
  const g = ctx.createLinearGradient(sx - 11, 0, sx + 11, 0); g.addColorStop(0, shade(base, 0.62)); g.addColorStop(0.5, shade(base, 1.2)); g.addColorStop(1, shade(base, 0.7));
  ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(sx - 11, ped); ctx.quadraticCurveTo(sx - 7, topY + 6, sx - 5, topY); ctx.lineTo(sx + 5, topY); ctx.quadraticCurveTo(sx + 7, topY + 6, sx + 11, ped); ctx.closePath(); ctx.fill();
  ctx.fillStyle = shade(base, 1.1); ctx.beginPath(); ctx.arc(sx, topY - 5, 6, 0, Math.PI * 2); ctx.fill();   // head
  if (f[1] > 0) { ctx.save(); ctx.globalAlpha = 0.5; ctx.fillStyle = shade(base, 1.5); ctx.beginPath(); ctx.arc(sx + f[0] * 2, topY - 5, 4, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }   // lit face on camera side
};

// Garden duckling: iso contact shadow + plump body, with the head + beak turning to face its dir.
const drawDuck = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  void accent; const f = fwd(dir);
  ctx.save(); ctx.globalAlpha = 0.2; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(sx, sy, TW * 0.34, TH * 0.34, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  const cy = sy - 7;
  ctx.fillStyle = shade(base, 0.85); ctx.beginPath(); ctx.ellipse(sx, cy, 11, 8, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = base; ctx.beginPath(); ctx.ellipse(sx, cy - 2, 11, 7, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(sx - f[0] * 9, cy - 3 - f[1] * 1.5, 4, 3, 0, 0, Math.PI * 2); ctx.fill();   // tail (opposite forward)
  const hx = sx + f[0] * 7, hy = cy - 9 - f[1] * 1.5;
  ctx.fillStyle = base; ctx.beginPath(); ctx.arc(hx, hy, 5, 0, Math.PI * 2); ctx.fill();                  // head
  ctx.fillStyle = '#ff8800'; ctx.beginPath(); ctx.moveTo(hx + f[0] * 4, hy); ctx.lineTo(hx + f[0] * 9, hy + 1); ctx.lineTo(hx + f[0] * 4, hy + 3); ctx.closePath(); ctx.fill();   // beak (forward)
  ctx.fillStyle = '#1a1a1a'; ctx.beginPath(); ctx.arc(hx + f[0] * 2, hy - 1, 1.2, 0, Math.PI * 2); ctx.fill();   // eye
};

// ═══════════ HIGH-END animated pieces (contact shadow is added by the caller) ═══════════

// Lava lamp: chrome cone base + cap, a glass capsule of tinted fluid, and gooey glowing blobs that rise
// and fall on the frame counter. The hero piece — lots of love.
const drawLavaLamp = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, t: number) => {
  void accent; const col = base, bw = TW * 0.34, gw = TW * 0.25;
  const baseH = STACK_H * 0.5, capBot = sy - baseH, capH = STACK_H * 1.7, capTop = capBot - capH;
  const metal = (x0: number, x1: number, yTop: number, yBot: number) => { const g = ctx.createLinearGradient(sx + x0, 0, sx + x1, 0); g.addColorStop(0, '#3a3a44'); g.addColorStop(0.5, '#aab0bd'); g.addColorStop(1, '#3a3a44'); ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(sx + x0, yBot); ctx.lineTo(sx + x1, yBot); ctx.lineTo(sx + x1 * 0.7, yTop); ctx.lineTo(sx + x0 * 0.7, yTop); ctx.closePath(); ctx.fill(); };
  metal(-bw, bw, capBot, sy);                                   // cone base
  ctx.fillStyle = '#22232a'; ctx.beginPath(); ctx.ellipse(sx, sy, bw, TH * 0.34, 0, 0, Math.PI * 2); ctx.fill();
  const capsule = () => { ctx.beginPath(); ctx.moveTo(sx - gw, capBot); ctx.lineTo(sx - gw * 0.6, capTop + 7); ctx.quadraticCurveTo(sx, capTop - 11, sx + gw * 0.6, capTop + 7); ctx.lineTo(sx + gw, capBot); ctx.closePath(); };
  ctx.save(); capsule(); ctx.clip();
  ctx.fillStyle = hexA(col, 0.3); ctx.fillRect(sx - gw, capTop - 14, gw * 2, capH + 16);                       // tinted fluid
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; const hg = ctx.createRadialGradient(sx, capBot - 4, 2, sx, capBot - 4, gw * 2.4); hg.addColorStop(0, hexA(col, 0.75)); hg.addColorStop(1, hexA(col, 0)); ctx.fillStyle = hg; ctx.fillRect(sx - gw, capTop - 14, gw * 2, capH + 16); ctx.restore();
  const blob = (ph: number, rad: number, c: string) => {
    const yy = capBot - 7 - (0.5 + 0.5 * Math.sin(t * 0.018 + ph)) * (capH - 18);
    const xx = sx + Math.sin(t * 0.011 + ph * 1.7) * gw * 0.32, r = rad * (0.82 + 0.26 * Math.sin(t * 0.03 + ph));
    const g = ctx.createRadialGradient(xx - r * 0.3, yy - r * 0.35, 1, xx, yy, r); g.addColorStop(0, shade(c, 1.55)); g.addColorStop(0.6, c); g.addColorStop(1, shade(c, 0.65));
    ctx.fillStyle = g; ctx.shadowColor = c; ctx.shadowBlur = 10; ctx.beginPath(); ctx.ellipse(xx, yy, r, r * 1.3, 0, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
  };
  blob(0, 7, col); blob(2.1, 5.4, shade(col, 1.18)); blob(4.2, 6.1, col); blob(1.0, 3.8, shade(col, 0.82)); blob(5.4, 4.6, shade(col, 1.1));
  ctx.restore();
  capsule(); ctx.strokeStyle = hexA('#ffffff', 0.28); ctx.lineWidth = 1.4; ctx.stroke();                        // glass rim
  ctx.fillStyle = hexA('#ffffff', 0.16); ctx.beginPath(); ctx.ellipse(sx - gw * 0.42, capTop + capH * 0.45, 2.4, capH * 0.32, 0, 0, Math.PI * 2); ctx.fill();   // specular streak
  metal(-gw * 0.55, gw * 0.55, capTop - 9, capTop + 6);                                                         // cap
};

// Aquarium: a big translucent glass tank with lit water faces, gravel, weed, drifting fish + bubbles.
const drawAquarium = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, t: number) => {
  void accent; void base; const w = TW * 0.94, d = TH * 0.94, H = STACK_H * 1.75, ty = sy - H;
  ctx.fillStyle = 'rgba(28,132,166,0.62)'; poly(ctx, [[sx - w, sy], [sx, sy + d], [sx, sy + d - H], [sx - w, ty]]);     // left water face
  ctx.fillStyle = 'rgba(20,108,140,0.74)'; poly(ctx, [[sx, sy + d], [sx + w, sy], [sx + w, ty], [sx, sy + d - H]]);     // right water face
  ctx.save(); ctx.beginPath(); ctx.moveTo(sx - w, sy); ctx.lineTo(sx, sy + d); ctx.lineTo(sx + w, sy); ctx.lineTo(sx, ty + d); ctx.lineTo(sx - w, ty); ctx.lineTo(sx, sy + d - H); ctx.closePath(); ctx.clip();   // contents stay inside
  ctx.fillStyle = '#374a34'; ctx.beginPath(); ctx.ellipse(sx, sy + d * 0.25, w * 0.96, 8, 0, 0, Math.PI * 2); ctx.fill();   // gravel bed
  ctx.fillStyle = '#46583f'; for (let i = 0; i < 9; i++) { ctx.beginPath(); ctx.arc(sx - w * 0.75 + i * w * 0.19, sy + d * 0.18 + (i % 2) * 4, 2.2, 0, Math.PI * 2); ctx.fill(); }
  ctx.strokeStyle = '#2e8d4a'; ctx.lineWidth = 3.5; ctx.lineCap = 'round'; for (const px of [-w * 0.58, w * 0.5]) { ctx.beginPath(); ctx.moveTo(sx + px, sy + d * 0.2); ctx.quadraticCurveTo(sx + px + Math.sin(t * 0.04) * 5, ty + H * 0.42, sx + px - 4, ty + H * 0.24); ctx.stroke(); }   // weed
  const fish = (ph: number, c: string) => { const fx = sx + Math.sin(t * 0.02 + ph) * w * 0.55, fy = ty + 18 + (0.5 + 0.5 * Math.sin(t * 0.013 + ph * 2)) * (H - 36), dir = Math.cos(t * 0.02 + ph) >= 0 ? 1 : -1; ctx.save(); ctx.translate(fx, fy); ctx.scale(dir, 1); ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(0, 0, 9, 5.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(-14, -5); ctx.lineTo(-14, 5); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(5, -1.5, 1.9, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#0a0a0a'; ctx.beginPath(); ctx.arc(5.6, -1.5, 0.95, 0, Math.PI * 2); ctx.fill(); ctx.restore(); };
  fish(0, '#ff8a3a'); fish(2.3, '#ffd23a'); fish(4.2, '#ff5a8a');
  ctx.fillStyle = 'rgba(255,255,255,0.55)'; for (let i = 0; i < 6; i++) { const bx = sx - w * 0.2 + i * 8, by = sy + d - ((t * 0.8 + i * 40) % (H + 10)); ctx.beginPath(); ctx.arc(bx, by, 1.8, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
  ctx.fillStyle = 'rgba(140,212,238,0.4)'; poly(ctx, [[sx - w, ty + 3], [sx, ty - d + 3], [sx + w, ty + 3], [sx, ty + d + 3]]);   // water surface
  ctx.strokeStyle = 'rgba(210,238,248,0.6)'; ctx.lineWidth = 2; poly(ctx, [[sx - w, ty], [sx, ty - d], [sx + w, ty], [sx, ty + d]]);   // top rim
  ctx.beginPath(); ctx.moveTo(sx - w, sy); ctx.lineTo(sx - w, ty); ctx.moveTo(sx, sy + d); ctx.lineTo(sx, sy + d - H); ctx.moveTo(sx + w, sy); ctx.lineTo(sx + w, ty); ctx.stroke();   // glass posts
};

// Fireplace: a stone block with a dark firebox on the camera-facing front, logs, and flickering flames.
const drawFireplace = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, t: number) => {
  const top = boxAt(ctx, sx, sy, 0.92, 0.6, 1.5, base, accent);
  for (let i = 0; i < 5; i++) { ctx.fillStyle = hexA('#000', 0.12); ctx.fillRect(sx - 18 + (i % 3) * 13, top + 6 + Math.floor(i / 3) * 14, 11, 6); }   // brick hints
  const fy = sy - STACK_H * 0.45;
  ctx.fillStyle = '#140d08'; ctx.beginPath(); ctx.moveTo(sx - 16, fy - 28); ctx.lineTo(sx + 16, fy - 28); ctx.lineTo(sx + 16, fy); ctx.quadraticCurveTo(sx, fy + 4, sx - 16, fy); ctx.closePath(); ctx.fill();   // firebox
  ctx.fillStyle = '#5a3a22'; ctx.fillRect(sx - 12, fy - 7, 24, 4); ctx.save(); ctx.translate(sx, fy - 9); ctx.rotate(0.18); ctx.fillRect(-10, -2, 20, 4); ctx.restore();   // logs
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const flame = (ox: number, h: number, c: string, ph: number) => { const fl = h * (0.78 + 0.22 * Math.sin(t * 0.3 + ph)); ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(sx + ox - 5, fy - 6); ctx.quadraticCurveTo(sx + ox - 4, fy - 6 - fl * 0.6, sx + ox + Math.sin(t * 0.2 + ph) * 3, fy - 6 - fl); ctx.quadraticCurveTo(sx + ox + 4, fy - 6 - fl * 0.6, sx + ox + 5, fy - 6); ctx.closePath(); ctx.fill(); };
  flame(-6, 22, 'rgba(255,90,20,0.8)', 0); flame(6, 20, 'rgba(255,90,20,0.8)', 1.6); flame(0, 28, 'rgba(255,150,30,0.85)', 0.7); flame(0, 15, 'rgba(255,232,120,0.92)', 2.2);
  const g = ctx.createRadialGradient(sx, fy - 6, 1, sx, fy - 6, 24); g.addColorStop(0, 'rgba(255,140,40,0.5)'); g.addColorStop(1, 'rgba(255,140,40,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, fy - 6, 24, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
};

// ═══════════ ITALIAN BRAINROT — café gear + the iconic AI-meme characters (front-facing figures) ═══════════

// Espresso bar: chrome machine body, group head, a filling cup, accent strip + curling steam.
const drawEspresso = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, t: number) => {
  const top = boxAt(ctx, sx, sy, 0.6, 0.48, 1.25, base, accent);
  ctx.fillStyle = accent; ctx.fillRect(sx - 9, top + 2, 18, 3);
  ctx.fillStyle = '#2a2a30'; ctx.fillRect(sx - 3, top + 9, 6, 9); ctx.fillStyle = '#1a1a1f'; ctx.fillRect(sx - 7, top + 17, 14, 3);   // group head + portafilter
  ctx.fillStyle = '#f2ede2'; ctx.beginPath(); ctx.moveTo(sx - 5, top + 21); ctx.lineTo(sx + 5, top + 21); ctx.lineTo(sx + 4, top + 29); ctx.lineTo(sx - 4, top + 29); ctx.closePath(); ctx.fill();   // cup
  ctx.fillStyle = '#3a2218'; ctx.fillRect(sx - 4, top + 22, 8, 2);
  ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 2; ctx.lineCap = 'round'; for (const ox of [-2.5, 2.5]) { ctx.beginPath(); ctx.moveTo(sx + ox, top + 20); for (let s = 1; s <= 4; s++) ctx.lineTo(sx + ox + Math.sin(t * 0.12 + s + ox) * 3, top + 20 - s * 6); ctx.stroke(); } ctx.restore();   // steam
};

// Giant cappuccino: saucer, glossy cup, foam cap with cocoa dot + handle.
const drawCappuccino = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  void accent; void dir; const cup = base, ch = STACK_H * 0.95, cy = sy - 5;
  ctx.fillStyle = shade(cup, 0.82); ctx.beginPath(); ctx.ellipse(sx, sy - 3, TW * 0.5, TH * 0.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = cup; ctx.beginPath(); ctx.ellipse(sx, sy - 5, TW * 0.36, TH * 0.36, 0, 0, Math.PI * 2); ctx.fill();   // saucer
  const g = ctx.createLinearGradient(sx - 14, 0, sx + 14, 0); g.addColorStop(0, shade(cup, 0.78)); g.addColorStop(0.5, shade(cup, 1.12)); g.addColorStop(1, shade(cup, 0.82));
  ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(sx - 13, cy - 4); ctx.quadraticCurveTo(sx - 15, cy - ch, sx - 9, cy - ch - 2); ctx.lineTo(sx + 9, cy - ch - 2); ctx.quadraticCurveTo(sx + 15, cy - ch, sx + 13, cy - 4); ctx.closePath(); ctx.fill();   // cup body
  ctx.strokeStyle = cup; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.arc(sx + 15, cy - ch * 0.5, 5, -1, 1.4); ctx.stroke();   // handle
  ctx.fillStyle = '#f0e6d2'; ctx.beginPath(); ctx.ellipse(sx, cy - ch - 2, 12, 4.6, 0, 0, Math.PI * 2); ctx.fill();   // foam
  ctx.fillStyle = '#8a5a32'; ctx.beginPath(); ctx.moveTo(sx, cy - ch - 5); ctx.bezierCurveTo(sx - 5, cy - ch - 1, sx - 2, cy - ch + 1, sx, cy - ch + 1); ctx.bezierCurveTo(sx + 2, cy - ch + 1, sx + 5, cy - ch - 1, sx, cy - ch - 5); ctx.closePath(); ctx.fill();   // cocoa leaf art
};

// Pizza margherita on the floor — crust, cheese, pepperoni, basil, slice scoring.
const drawPizza = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  void accent; void base; void dir; const cy = sy - 3;
  ctx.fillStyle = '#d9a441'; ctx.beginPath(); ctx.ellipse(sx, cy, TW * 0.62, TH * 0.62, 0, 0, Math.PI * 2); ctx.fill();   // crust
  ctx.fillStyle = '#f2c84b'; ctx.beginPath(); ctx.ellipse(sx, cy - 1, TW * 0.5, TH * 0.5, 0, 0, Math.PI * 2); ctx.fill();   // cheese
  ctx.fillStyle = '#c0392b'; for (const [ox, oy] of [[-9, -2], [7, -3], [0, 3], [-4, 5], [10, 4], [3, -6]] as [number, number][]) { ctx.beginPath(); ctx.ellipse(sx + ox, cy + oy * 0.5, 3, 2, 0, 0, Math.PI * 2); ctx.fill(); }   // pepperoni
  ctx.fillStyle = '#2e7d32'; for (const [ox, oy] of [[-2, -4], [6, 2], [-7, 3]] as [number, number][]) { ctx.beginPath(); ctx.ellipse(sx + ox, cy + oy * 0.5, 1.9, 1.2, 0, 0, Math.PI * 2); ctx.fill(); }   // basil
  ctx.strokeStyle = 'rgba(150,86,18,0.4)'; ctx.lineWidth = 1; for (let i = 0; i < 4; i++) { const a = i * Math.PI / 4; ctx.beginPath(); ctx.moveTo(sx - Math.cos(a) * TW * 0.5, cy - Math.sin(a) * TH * 0.5); ctx.lineTo(sx + Math.cos(a) * TW * 0.5, cy + Math.sin(a) * TH * 0.5); ctx.stroke(); }
};

// Vespa scooter: stamped step-through body, rear cowl, wheels, handlebar + headlight. Rotates (flips).
const drawVespa = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  void accent; const col = base, cy = sy - 4; ctx.save(); if (fwd(dir)[0] < 0) { ctx.translate(sx, 0); ctx.scale(-1, 1); ctx.translate(-sx, 0); } ctx.translate(sx, cy); ctx.scale(1.4, 1.4); ctx.translate(-sx, -cy);
  ctx.fillStyle = '#15151a'; for (const wx of [-12, 12]) { ctx.beginPath(); ctx.arc(sx + wx, cy, 5, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = '#3a3a44'; for (const wx of [-12, 12]) { ctx.beginPath(); ctx.arc(sx + wx, cy, 2, 0, Math.PI * 2); ctx.fill(); }
  const g = ctx.createLinearGradient(0, cy - 16, 0, cy); g.addColorStop(0, shade(col, 1.2)); g.addColorStop(1, shade(col, 0.85));
  ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(sx - 16, cy - 2); ctx.quadraticCurveTo(sx - 18, cy - 14, sx - 8, cy - 15); ctx.lineTo(sx + 4, cy - 15); ctx.quadraticCurveTo(sx + 14, cy - 15, sx + 15, cy - 2); ctx.lineTo(sx + 8, cy - 2); ctx.lineTo(sx + 4, cy - 8); ctx.lineTo(sx - 6, cy - 8); ctx.lineTo(sx - 10, cy - 2); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.ellipse(sx - 13, cy - 7, 5, 6, 0, 0, Math.PI * 2); ctx.fill();   // rear cowl
  ctx.fillStyle = '#241c14'; ctx.beginPath(); ctx.ellipse(sx - 7, cy - 15, 7, 3, 0, 0, Math.PI * 2); ctx.fill();   // seat
  ctx.strokeStyle = shade(col, 0.7); ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(sx + 12, cy - 2); ctx.lineTo(sx + 15, cy - 18); ctx.stroke();
  ctx.fillStyle = '#2a2a30'; ctx.beginPath(); ctx.ellipse(sx + 15, cy - 19, 4, 2.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffe9a0'; ctx.beginPath(); ctx.arc(sx + 16, cy - 9, 2.4, 0, Math.PI * 2); ctx.fill();   // headlight
  ctx.restore();
};

// Tralalero Tralala — athletic blue shark standing on three elongated fin-legs in blue Nike sneakers.
const drawTralalero = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  void accent; void dir; const blue = base, cy = sy - 28;
  const legX = [-9, 0, 9];
  ctx.strokeStyle = shade(blue, 0.82); ctx.lineWidth = 5; ctx.lineCap = 'round'; for (const lx of legX) { ctx.beginPath(); ctx.moveTo(sx + lx * 0.5, cy + 13); ctx.lineTo(sx + lx, sy - 5); ctx.stroke(); }
  for (const lx of legX) {   // blue Nike sneakers with white sole + swoosh
    const ex = sx + lx;
    ctx.fillStyle = '#2b6cff'; ctx.beginPath(); ctx.moveTo(ex - 6, sy - 6); ctx.quadraticCurveTo(ex - 8, sy + 1, ex + 7, sy + 1); ctx.lineTo(ex + 7, sy - 4); ctx.quadraticCurveTo(ex + 1, sy - 8, ex - 6, sy - 6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(ex - 8, sy + 1); ctx.lineTo(ex + 7, sy + 1); ctx.lineTo(ex + 7, sy + 3); ctx.lineTo(ex - 8, sy + 3); ctx.closePath(); ctx.fill();   // sole
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(ex - 4, sy - 2); ctx.quadraticCurveTo(ex + 1, sy - 1, ex + 6, sy - 6); ctx.stroke();   // swoosh
  }
  ctx.fillStyle = shade(blue, 0.85);
  ctx.beginPath(); ctx.moveTo(sx - 2, cy - 18); ctx.lineTo(sx + 5, cy - 32); ctx.lineTo(sx + 10, cy - 15); ctx.closePath(); ctx.fill();   // dorsal
  ctx.beginPath(); ctx.moveTo(sx - 13, cy + 2); ctx.lineTo(sx - 25, cy + 9); ctx.lineTo(sx - 12, cy + 10); ctx.closePath(); ctx.fill();   // left arm-fin
  ctx.beginPath(); ctx.moveTo(sx + 13, cy + 2); ctx.lineTo(sx + 25, cy + 9); ctx.lineTo(sx + 12, cy + 10); ctx.closePath(); ctx.fill();   // right arm-fin
  const g = ctx.createLinearGradient(sx, cy - 22, sx, cy + 18); g.addColorStop(0, shade(blue, 1.26)); g.addColorStop(1, shade(blue, 0.82));
  ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(sx, cy, 15, 22, 0, 0, Math.PI * 2); ctx.fill();   // body
  ctx.fillStyle = shade(blue, 1.5); ctx.beginPath(); ctx.ellipse(sx, cy + 6, 9, 13, 0, 0, Math.PI * 2); ctx.fill();   // belly
  ctx.strokeStyle = shade(blue, 0.68); ctx.lineWidth = 1.2; for (const gx of [-10, -7, -4]) { ctx.beginPath(); ctx.moveTo(sx + gx, cy - 6); ctx.lineTo(sx + gx + 1, cy + 2); ctx.stroke(); }   // gills
  ctx.fillStyle = '#21323d'; ctx.beginPath(); ctx.ellipse(sx, cy + 9, 8, 4.5, 0, 0, Math.PI); ctx.fill();   // grin
  ctx.fillStyle = '#fff'; for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(sx + i * 2.4 - 1, cy + 7.5); ctx.lineTo(sx + i * 2.4, cy + 11); ctx.lineTo(sx + i * 2.4 + 1, cy + 7.5); ctx.closePath(); ctx.fill(); }   // teeth
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(sx - 5, cy - 5, 3.4, 0, Math.PI * 2); ctx.arc(sx + 5, cy - 5, 3.4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(sx - 5, cy - 4, 1.5, 0, Math.PI * 2); ctx.arc(sx + 5, cy - 4, 1.5, 0, Math.PI * 2); ctx.fill();
};

// Bombardiro Crocodilo — a crocodile/strategic-bomber hybrid: scaled green fuselage, steel swept wings
// + engines, open toothy jaws, dropping a bomb.
const drawBombardiro = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  void accent; void dir; const grn = base, steel = '#5b6a55', cy = sy - 26; ctx.save(); ctx.translate(sx, cy); ctx.scale(1.18, 1.18); ctx.translate(-sx, -cy);
  ctx.fillStyle = steel;
  ctx.beginPath(); ctx.moveTo(sx - 4, cy - 1); ctx.lineTo(sx - 27, cy + 12); ctx.lineTo(sx - 22, cy + 13); ctx.lineTo(sx + 2, cy + 4); ctx.closePath(); ctx.fill();   // left wing
  ctx.beginPath(); ctx.moveTo(sx + 4, cy - 1); ctx.lineTo(sx + 25, cy + 11); ctx.lineTo(sx + 20, cy + 12); ctx.lineTo(sx - 2, cy + 4); ctx.closePath(); ctx.fill();   // right wing
  ctx.beginPath(); ctx.moveTo(sx - 22, cy - 2); ctx.lineTo(sx - 31, cy - 14); ctx.lineTo(sx - 18, cy - 1); ctx.closePath(); ctx.fill();   // tail fin
  const g = ctx.createLinearGradient(sx, cy - 9, sx, cy + 9); g.addColorStop(0, shade(grn, 1.15)); g.addColorStop(1, shade(grn, 0.8));
  ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(sx - 27, cy); ctx.quadraticCurveTo(sx - 20, cy - 8, sx + 10, cy - 8); ctx.quadraticCurveTo(sx + 28, cy - 7, sx + 30, cy - 3); ctx.quadraticCurveTo(sx + 28, cy + 6, sx + 10, cy + 8); ctx.quadraticCurveTo(sx - 20, cy + 8, sx - 27, cy); ctx.closePath(); ctx.fill();   // fuselage
  ctx.fillStyle = shade(grn, 0.7); for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(sx - 13 + i * 7, cy - 8); ctx.lineTo(sx - 10 + i * 7, cy - 13); ctx.lineTo(sx - 7 + i * 7, cy - 8); ctx.closePath(); ctx.fill(); }   // back scales
  ctx.fillStyle = '#3a3a40'; ctx.beginPath(); ctx.ellipse(sx - 13, cy + 9, 5, 3, 0, 0, Math.PI * 2); ctx.ellipse(sx + 9, cy + 9, 5, 3, 0, 0, Math.PI * 2); ctx.fill();   // engines
  ctx.fillStyle = shade(grn, 1.12); ctx.beginPath(); ctx.moveTo(sx + 28, cy - 6); ctx.lineTo(sx + 48, cy - 4); ctx.lineTo(sx + 30, cy - 1); ctx.closePath(); ctx.fill();   // upper jaw
  ctx.beginPath(); ctx.moveTo(sx + 30, cy + 1); ctx.lineTo(sx + 46, cy + 4); ctx.lineTo(sx + 30, cy + 5); ctx.closePath(); ctx.fill();   // lower jaw
  ctx.fillStyle = '#fff'; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(sx + 32 + i * 3, cy - 2.5); ctx.lineTo(sx + 33 + i * 3, cy + 0.5); ctx.lineTo(sx + 34 + i * 3, cy - 2.5); ctx.closePath(); ctx.fill(); }   // teeth
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(sx + 26, cy - 9, 3.2, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(sx + 27, cy - 9, 1.5, 0, Math.PI * 2); ctx.fill();   // eye
  ctx.fillStyle = '#2a2a30'; ctx.beginPath(); ctx.ellipse(sx - 4, cy + 17, 4, 7, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#1a1a1f'; ctx.beginPath(); ctx.moveTo(sx - 7, cy + 23); ctx.lineTo(sx - 4, cy + 19); ctx.lineTo(sx - 1, cy + 23); ctx.closePath(); ctx.fill();   // falling bomb + fins
  ctx.restore();
};

// Ballerina Cappuccina — ballerina en pointe with a steaming cappuccino-mug for a head.
const drawBallerina = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  void accent; void dir; const tutu = base, cy = sy - 24, cup = '#efe9dd';
  ctx.strokeStyle = '#e8c9a8'; ctx.lineWidth = 3.2; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(sx - 2, cy + 7); ctx.lineTo(sx - 5, sy - 2); ctx.moveTo(sx + 2, cy + 7); ctx.lineTo(sx + 5, sy - 1); ctx.stroke();   // legs
  ctx.fillStyle = shade(tutu, 0.9); for (const [ex, ey] of [[sx - 5, sy - 2], [sx + 5, sy - 1]] as [number, number][]) { ctx.beginPath(); ctx.ellipse(ex, ey, 4, 2.2, 0, 0, Math.PI * 2); ctx.fill(); }   // pointe shoes
  ctx.fillStyle = tutu; ctx.beginPath(); ctx.moveTo(sx - 16, cy + 9); ctx.quadraticCurveTo(sx, cy + 14, sx + 16, cy + 9); ctx.lineTo(sx + 6, cy + 1); ctx.lineTo(sx - 6, cy + 1); ctx.closePath(); ctx.fill();   // tutu
  ctx.fillStyle = shade(tutu, 1.15); ctx.beginPath(); ctx.moveTo(sx - 12, cy + 6); ctx.quadraticCurveTo(sx, cy + 10, sx + 12, cy + 6); ctx.lineTo(sx + 5, cy + 1); ctx.lineTo(sx - 5, cy + 1); ctx.closePath(); ctx.fill();   // tutu top layer
  ctx.fillStyle = shade(tutu, 0.82); ctx.beginPath(); ctx.ellipse(sx, cy - 3, 5, 9, 0, 0, Math.PI * 2); ctx.fill();   // leotard
  ctx.strokeStyle = '#e8c9a8'; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.moveTo(sx - 4, cy - 5); ctx.quadraticCurveTo(sx - 13, cy - 13, sx - 7, cy - 22); ctx.moveTo(sx + 4, cy - 5); ctx.quadraticCurveTo(sx + 13, cy - 13, sx + 7, cy - 22); ctx.stroke();   // arms
  const hy = cy - 19;
  ctx.fillStyle = cup; ctx.beginPath(); ctx.moveTo(sx - 9, hy - 7); ctx.lineTo(sx + 9, hy - 7); ctx.lineTo(sx + 7, hy + 7); ctx.lineTo(sx - 7, hy + 7); ctx.closePath(); ctx.fill();   // mug head
  ctx.fillStyle = shade(cup, 0.88); ctx.beginPath(); ctx.moveTo(sx + 9, hy - 7); ctx.lineTo(sx + 7, hy + 7); ctx.lineTo(sx + 4, hy + 6); ctx.lineTo(sx + 6, hy - 6); ctx.closePath(); ctx.fill();   // side shade
  ctx.strokeStyle = cup; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.arc(sx + 10, hy, 4, -1, 1.4); ctx.stroke();   // handle
  ctx.fillStyle = '#f3ead6'; ctx.beginPath(); ctx.ellipse(sx, hy - 7, 9, 3.2, 0, 0, Math.PI * 2); ctx.fill();   // foam
  ctx.fillStyle = '#9a6a3e'; ctx.beginPath(); ctx.arc(sx, hy - 7, 2, 0, Math.PI * 2); ctx.fill();   // cocoa dot
  ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 1.5; for (const ox of [-3, 3]) { ctx.beginPath(); ctx.moveTo(sx + ox, hy - 9); ctx.quadraticCurveTo(sx + ox + 3, hy - 15, sx + ox - 2, hy - 21); ctx.stroke(); }   // steam
  ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(sx - 3, hy, 1.3, 0, Math.PI * 2); ctx.arc(sx + 3, hy, 1.3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,120,150,0.4)'; ctx.beginPath(); ctx.arc(sx - 5, hy + 2, 1.6, 0, Math.PI * 2); ctx.arc(sx + 5, hy + 2, 1.6, 0, Math.PI * 2); ctx.fill();   // cheeks
  ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(sx, hy + 2, 2, 0.1, Math.PI - 0.1); ctx.stroke();   // smile
};

// Tung Tung Tung Sahur — a wooden kentongan-drum spirit with an angry face, wielding a mallet.
const drawTungTung = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  void accent; void dir; const wood = base, cy = sy - 4, bH = STACK_H * 1.7, by = cy - 6;
  ctx.strokeStyle = shade(wood, 0.7); ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(sx - 4, cy - 6); ctx.lineTo(sx - 5, cy); ctx.moveTo(sx + 4, cy - 6); ctx.lineTo(sx + 5, cy); ctx.stroke();   // legs
  ctx.fillStyle = shade(wood, 0.6); ctx.fillRect(sx - 9, cy - 1, 8, 2.5); ctx.fillRect(sx + 1, cy - 1, 8, 2.5);   // feet
  const g = ctx.createLinearGradient(sx - 12, 0, sx + 12, 0); g.addColorStop(0, shade(wood, 0.7)); g.addColorStop(0.5, shade(wood, 1.12)); g.addColorStop(1, shade(wood, 0.74));
  ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(sx - 11, by); ctx.lineTo(sx - 10, by - bH); ctx.quadraticCurveTo(sx, by - bH - 6, sx + 10, by - bH); ctx.lineTo(sx + 11, by); ctx.quadraticCurveTo(sx, by + 4, sx - 11, by); ctx.closePath(); ctx.fill();   // drum body
  ctx.strokeStyle = hexA('#3a2410', 0.35); ctx.lineWidth = 1; for (const gx of [-5, 0, 5]) { ctx.beginPath(); ctx.moveTo(sx + gx, by - 4); ctx.lineTo(sx + gx, by - bH + 4); ctx.stroke(); }   // grain
  ctx.fillStyle = '#2a1a0c'; ctx.fillRect(sx - 2, by - bH * 0.66, 4, bH * 0.36);   // slit
  const fy = by - bH * 0.8;
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(sx - 4, fy, 3.2, 0, Math.PI * 2); ctx.arc(sx + 4, fy, 3.2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(sx - 4, fy + 0.5, 1.5, 0, Math.PI * 2); ctx.arc(sx + 4, fy + 0.5, 1.5, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#2a1a0c'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(sx - 7, fy - 4); ctx.lineTo(sx - 1, fy - 2); ctx.moveTo(sx + 7, fy - 4); ctx.lineTo(sx + 1, fy - 2); ctx.stroke();   // angry brows
  ctx.fillStyle = '#2a1208'; ctx.beginPath(); ctx.ellipse(sx, fy + 8, 4.5, 5.5, 0, 0, Math.PI * 2); ctx.fill();   // shouting mouth
  ctx.strokeStyle = shade(wood, 0.88); ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(sx - 10, by - bH * 0.5); ctx.lineTo(sx - 18, by - bH * 0.5 + 6); ctx.moveTo(sx + 10, by - bH * 0.5); ctx.lineTo(sx + 18, by - bH * 0.66); ctx.stroke();   // arms
  ctx.save(); ctx.translate(sx + 18, by - bH * 0.66); ctx.rotate(-0.5); ctx.fillStyle = shade(wood, 1.0); ctx.beginPath(); ctx.roundRect(-2.5, -17, 5.5, 19, 2.5); ctx.fill(); ctx.fillStyle = shade(wood, 0.65); ctx.fillRect(-2.5, 0, 5.5, 4); ctx.restore();   // mallet
};

// Lirilì Larilà — an elephant head on a two-legged green cactus body, in sandals.
const drawLirili = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  void accent; void dir; const cac = base, cy = sy - 4, bH = STACK_H * 1.5, by = cy - 10;
  ctx.strokeStyle = shade(cac, 0.8); ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(sx - 5, cy - 12); ctx.lineTo(sx - 6, cy - 1); ctx.moveTo(sx + 5, cy - 12); ctx.lineTo(sx + 6, cy - 1); ctx.stroke();   // legs
  ctx.fillStyle = '#8a5a2a'; ctx.fillRect(sx - 10, cy - 1, 9, 2.5); ctx.fillRect(sx + 1, cy - 1, 9, 2.5);   // sandals
  const g = ctx.createLinearGradient(sx - 13, 0, sx + 13, 0); g.addColorStop(0, shade(cac, 0.7)); g.addColorStop(0.5, shade(cac, 1.15)); g.addColorStop(1, shade(cac, 0.72));
  ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(sx, by - bH * 0.4, 13, bH * 0.55, 0, 0, Math.PI * 2); ctx.fill();   // cactus torso
  ctx.beginPath(); ctx.ellipse(sx + 15, by - bH * 0.45, 5, 9, 0.3, 0, Math.PI * 2); ctx.fill();   // cactus arm
  ctx.strokeStyle = '#dfe8c0'; ctx.lineWidth = 1; for (let i = 0; i < 9; i++) { const yy = by - 4 - i * 5.5; ctx.beginPath(); ctx.moveTo(sx - 3, yy); ctx.lineTo(sx - 5, yy - 1); ctx.moveTo(sx + 3, yy); ctx.lineTo(sx + 5, yy - 1); ctx.stroke(); }   // spines
  const hy = by - bH * 0.74;
  ctx.fillStyle = '#9a9aa4'; ctx.beginPath(); ctx.ellipse(sx - 12, hy, 5, 8, -0.3, 0, Math.PI * 2); ctx.ellipse(sx + 12, hy, 5, 8, 0.3, 0, Math.PI * 2); ctx.fill();   // ears
  ctx.beginPath(); ctx.ellipse(sx, hy, 12, 10, 0, 0, Math.PI * 2); ctx.fill();   // head
  ctx.strokeStyle = '#9a9aa4'; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(sx, hy + 4); ctx.quadraticCurveTo(sx + 2, hy + 14, sx - 3, hy + 18); ctx.stroke();   // trunk
  ctx.strokeStyle = '#f0ead8'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(sx - 5, hy + 7); ctx.lineTo(sx - 7, hy + 12); ctx.moveTo(sx + 5, hy + 7); ctx.lineTo(sx + 7, hy + 12); ctx.stroke();   // tusks
  ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(sx - 5, hy - 2, 1.5, 0, Math.PI * 2); ctx.arc(sx + 5, hy - 2, 1.5, 0, Math.PI * 2); ctx.fill();   // eyes
};

// Brr Brr Patapim — a proboscis-monkey face on a leafy-topped tree-trunk body with root legs.
const drawPatapim = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  void accent; void dir; const bark = base, cy = sy - 4, bH = STACK_H * 1.6, by = cy - 8;
  ctx.strokeStyle = shade(bark, 0.7); ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(sx - 5, cy - 10); ctx.quadraticCurveTo(sx - 9, cy - 4, sx - 11, cy); ctx.moveTo(sx + 5, cy - 10); ctx.quadraticCurveTo(sx + 9, cy - 4, sx + 11, cy); ctx.stroke();   // root legs
  const g = ctx.createLinearGradient(sx - 13, 0, sx + 13, 0); g.addColorStop(0, shade(bark, 0.72)); g.addColorStop(0.5, shade(bark, 1.12)); g.addColorStop(1, shade(bark, 0.76));
  ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(sx - 12, by); ctx.lineTo(sx - 10, by - bH); ctx.lineTo(sx + 10, by - bH); ctx.lineTo(sx + 12, by); ctx.quadraticCurveTo(sx, by + 4, sx - 12, by); ctx.closePath(); ctx.fill();   // trunk
  ctx.strokeStyle = hexA('#2a1a0c', 0.3); ctx.lineWidth = 1; for (const gx of [-6, 0, 6]) { ctx.beginPath(); ctx.moveTo(sx + gx, by - 3); ctx.lineTo(sx + gx + 1, by - bH + 3); ctx.stroke(); }   // bark
  ctx.strokeStyle = shade(bark, 0.8); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(sx - 11, by - bH * 0.55); ctx.lineTo(sx - 20, by - bH * 0.7); ctx.moveTo(sx + 11, by - bH * 0.55); ctx.lineTo(sx + 20, by - bH * 0.45); ctx.stroke();   // branch arms
  const ty = by - bH, greens = ['#2f8a3f', '#3aa64f', '#247a34'];
  for (const [ox, oy, r, ci] of [[-8, 2, 9, 0], [8, 2, 9, 1], [0, -4, 11, 2], [-3, -8, 8, 1], [5, -7, 8, 0]] as [number, number, number, number][]) { ctx.fillStyle = greens[ci]; ctx.beginPath(); ctx.arc(sx + ox, ty + oy, r, 0, Math.PI * 2); ctx.fill(); }   // canopy
  const fy = by - bH * 0.5;
  ctx.fillStyle = '#caa074'; ctx.beginPath(); ctx.ellipse(sx, fy, 9, 8, 0, 0, Math.PI * 2); ctx.fill();   // face patch
  ctx.beginPath(); ctx.arc(sx - 9, fy - 3, 2.5, 0, Math.PI * 2); ctx.arc(sx + 9, fy - 3, 2.5, 0, Math.PI * 2); ctx.fill();   // ears
  ctx.fillStyle = '#d98a6a'; ctx.beginPath(); ctx.ellipse(sx, fy + 5, 3.5, 7, 0, 0, Math.PI * 2); ctx.fill();   // big nose
  ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(sx - 4, fy - 2, 1.5, 0, Math.PI * 2); ctx.arc(sx + 4, fy - 2, 1.5, 0, Math.PI * 2); ctx.fill();   // eyes
};

// Chimpanzini Bananini — a little chimp peeking out of a banana body.
const drawBananini = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  void accent; void dir; const ban = base, cy = sy - 4;
  ctx.strokeStyle = '#5a3a22'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(sx - 3, cy - 8); ctx.lineTo(sx - 5, cy); ctx.moveTo(sx + 3, cy - 8); ctx.lineTo(sx + 5, cy); ctx.stroke();   // legs
  const g = ctx.createLinearGradient(sx - 12, 0, sx + 12, 0); g.addColorStop(0, shade(ban, 0.8)); g.addColorStop(0.5, shade(ban, 1.1)); g.addColorStop(1, shade(ban, 0.8));
  ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(sx - 11, cy - 6); ctx.quadraticCurveTo(sx - 16, cy - 30, sx - 2, cy - 40); ctx.quadraticCurveTo(sx + 14, cy - 34, sx + 11, cy - 8); ctx.quadraticCurveTo(sx, cy - 2, sx - 11, cy - 6); ctx.closePath(); ctx.fill();   // banana
  ctx.fillStyle = '#6a4a2c'; ctx.beginPath(); ctx.arc(sx - 2, cy - 41, 2, 0, Math.PI * 2); ctx.fill();   // tip
  ctx.strokeStyle = shade(ban, 0.62); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(sx - 7, cy - 10); ctx.quadraticCurveTo(sx - 10, cy - 28, sx - 2, cy - 37); ctx.stroke();   // peel ridge
  const fy = cy - 18;
  ctx.fillStyle = '#5a3a22'; ctx.beginPath(); ctx.arc(sx - 8, fy - 2, 3, 0, Math.PI * 2); ctx.arc(sx + 8, fy - 2, 3, 0, Math.PI * 2); ctx.fill();   // ears
  ctx.beginPath(); ctx.ellipse(sx, fy, 8, 8, 0, 0, Math.PI * 2); ctx.fill();   // head
  ctx.fillStyle = '#caa074'; ctx.beginPath(); ctx.ellipse(sx, fy + 2, 5.5, 5, 0, 0, Math.PI * 2); ctx.fill();   // muzzle
  ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(sx - 3, fy - 1, 1.4, 0, Math.PI * 2); ctx.arc(sx + 3, fy - 1, 1.4, 0, Math.PI * 2); ctx.fill();   // eyes
  ctx.strokeStyle = '#2a1a0c'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(sx, fy + 3, 2, 0.1, Math.PI - 0.1); ctx.stroke();   // mouth
  ctx.strokeStyle = '#5a3a22'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(sx - 7, fy + 7); ctx.lineTo(sx - 12, fy + 12); ctx.moveTo(sx + 7, fy + 7); ctx.lineTo(sx + 12, fy + 12); ctx.stroke();   // arms
};

// ═══════════ HOME — real rotatable iso furniture (built on drawParts, world-axis faces) ═══════════

// Double bed (2×2): wood frame, mattress, tall headboard at the back, duvet + two pillows.
const drawBed = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  const wood = base, cT = shade(wood, 1.2), cR = shade(wood, 0.9), cL = shade(wood, 0.58);
  const sheet = '#eef1f6', sT = shade(sheet, 1.0), sR = shade(sheet, 0.92), sL = shade(sheet, 0.8);
  const parts: IsoPart[] = [
    { u0: -0.95, u1: 0.95, v0: -0.95, v1: 0.95, z0: 0, z1: 0.32, t: cT, r: cR, l: cL },        // frame
    { u0: -0.88, u1: 0.88, v0: -0.7, v1: 0.9, z0: 0.32, z1: 0.6, t: sT, r: sR, l: sL },         // mattress
    { u0: -0.92, u1: 0.92, v0: -0.95, v1: -0.74, z0: 0.32, z1: 1.45, t: cT, r: cR, l: cL }];    // headboard
  drawParts(ctx, sx, sy, dir, 0, 0, parts, (P) => {
    poly(ctx, [P(-0.86, 0.12, 0.6), P(0.86, 0.12, 0.6), P(0.86, 0.88, 0.6), P(-0.86, 0.88, 0.6)], hexA(accent, 0.8));   // duvet
    poly(ctx, [P(-0.86, 0.12, 0.6), P(0.86, 0.12, 0.6), P(0.86, 0.12, 0.52), P(-0.86, 0.12, 0.52)], hexA(accent, 0.55));
    for (const u of [-0.42, 0.42]) { const c = P(u, -0.5, 0.6); ctx.fillStyle = shade(sheet, 1.15); ctx.beginPath(); ctx.ellipse(c[0], c[1] - 3, 15, 8, 0, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = hexA('#c8ccd4', 0.6); ctx.lineWidth = 1; ctx.stroke(); }   // pillows
  });
};

// Wardrobe (3 high): tall cabinet, twin panelled doors + brass handles on the camera-facing front.
const drawWardrobe = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  void accent; const wood = base, cT = shade(wood, 1.18), cR = shade(wood, 0.92), cL = shade(wood, 0.58);
  const parts: IsoPart[] = [{ u0: -0.42, u1: 0.42, v0: -0.3, v1: 0.3, z0: 0, z1: 3, t: cT, r: cR, l: cL }];
  drawParts(ctx, sx, sy, dir, 0, 0, parts, (P) => {
    if (!faceVisible(0, 1, dir)) return;
    for (const [u0, u1] of [[-0.4, -0.02], [0.02, 0.4]] as [number, number][]) {
      poly(ctx, [P(u0 + 0.04, 0.3, 2.6), P(u1 - 0.04, 0.3, 2.6), P(u1 - 0.04, 0.3, 0.4), P(u0 + 0.04, 0.3, 0.4)], hexA('#fff', 0.06), hexA('#000', 0.28), 1);
    }
    for (const u of [-0.06, 0.06]) { const h = P(u, 0.3, 1.5); ctx.fillStyle = '#caa24a'; ctx.beginPath(); ctx.ellipse(h[0], h[1], 2, 5, 0, 0, Math.PI * 2); ctx.fill(); }   // handles
  });
};

// Bookcase (2.6 high): open carcass with shelves + a wall of coloured book spines on the front.
const drawBookcase = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  void accent; const wood = base, cT = shade(wood, 1.15), cR = shade(wood, 0.9), cL = shade(wood, 0.56);
  const parts: IsoPart[] = [{ u0: -0.45, u1: 0.45, v0: -0.28, v1: 0.3, z0: 0, z1: 2.6, t: cT, r: cR, l: cL }];
  const cols = ['#b3242e', '#2e7d4a', '#caa24a', '#3a7bd0', '#7a4ba0', '#d8702a'];
  drawParts(ctx, sx, sy, dir, 0, 0, parts, (P) => {
    if (!faceVisible(0, 1, dir)) return;
    poly(ctx, [P(-0.4, 0.3, 2.42), P(0.4, 0.3, 2.42), P(0.4, 0.3, 0.16), P(-0.4, 0.3, 0.16)], '#2a1f16');   // interior
    for (let s = 0; s < 4; s++) {
      const zb = 0.2 + s * 0.57;
      poly(ctx, [P(-0.4, 0.3, zb), P(0.4, 0.3, zb), P(0.4, 0.3, zb - 0.06), P(-0.4, 0.3, zb - 0.06)], shade(wood, 0.8));   // shelf
      for (let bI = 0; bI < 7; bI++) { const u = -0.36 + bI * 0.1, bh = 0.3 + ((bI * 37) % 5) * 0.04; poly(ctx, [P(u, 0.3, zb + bh), P(u + 0.075, 0.3, zb + bh), P(u + 0.075, 0.3, zb), P(u, 0.3, zb)], cols[(bI + s) % 6]); }
    }
  });
};

// Desk (2×1): wood top on a drawer pedestal + legs, with a glowing monitor + keyboard on top.
const drawDesk = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  const wood = base, cT = shade(wood, 1.2), cR = shade(wood, 0.92), cL = shade(wood, 0.6);
  const parts: IsoPart[] = [
    ...legs([[-0.82, -0.2], [-0.82, 0.28]], 0.58).map(p => ({ ...p, t: shade(wood, 0.9), r: shade(wood, 0.7), l: shade(wood, 0.5) })),
    { u0: 0.5, u1: 0.88, v0: -0.24, v1: 0.32, z0: 0, z1: 0.58, t: cT, r: cR, l: cL },           // drawer pedestal
    { u0: -0.9, u1: 0.9, v0: -0.28, v1: 0.34, z0: 0.58, z1: 0.72, t: cT, r: cR, l: cL }];       // top
  drawParts(ctx, sx, sy, dir, 0, 0, parts, (P) => {
    if (faceVisible(0, 1, dir)) for (const z of [0.18, 0.4]) { const h = P(0.69, 0.32, z); ctx.fillStyle = '#caa24a'; ctx.fillRect(h[0] - 5, h[1] - 1.5, 10, 3); }   // drawer handles
    const b = P(-0.3, 0.0, 0.72); ctx.fillStyle = '#2a2a30'; ctx.fillRect(b[0] - 2, b[1] - 18, 4, 18);
    ctx.fillStyle = '#15151f'; ctx.fillRect(b[0] - 15, b[1] - 36, 30, 19); ctx.fillStyle = hexA(accent, 0.75); ctx.fillRect(b[0] - 12, b[1] - 33, 24, 13);   // monitor
    const k = P(-0.18, 0.2, 0.72); ctx.fillStyle = '#3a3a44'; ctx.fillRect(k[0] - 9, k[1] - 3, 18, 5);   // keyboard
  });
};

// Kitchen counter (2×1): cabinet body, stone worktop overhang, inset sink + tap, cupboard doors.
const drawKitchen = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  void accent; const body = base, cT = shade(body, 1.18), cR = shade(body, 0.92), cL = shade(body, 0.56), top = '#d8dce4';
  const parts: IsoPart[] = [{ u0: -0.9, u1: 0.9, v0: -0.2, v1: 0.34, z0: 0, z1: 1.4, t: cT, r: cR, l: cL }];
  drawParts(ctx, sx, sy, dir, 0, 0, parts, (P) => {
    const z = 1.4;
    poly(ctx, [P(-0.96, -0.26, z), P(0.96, -0.26, z), P(0.96, 0.4, z), P(-0.96, 0.4, z)], shade(top, 1.2));
    poly(ctx, [P(-0.96, 0.4, z), P(0.96, 0.4, z), P(0.96, 0.4, z - 0.1), P(-0.96, 0.4, z - 0.1)], shade(top, 0.8));
    const s = P(-0.45, 0.04, z); ctx.fillStyle = '#9aa0aa'; ctx.beginPath(); ctx.ellipse(s[0], s[1], 14, 8, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#5a6068'; ctx.beginPath(); ctx.ellipse(s[0], s[1], 10, 5.5, 0, 0, Math.PI * 2); ctx.fill();   // sink
    const tp = P(-0.45, -0.12, z); ctx.strokeStyle = '#cfd6e2'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(tp[0], tp[1]); ctx.lineTo(tp[0], tp[1] - 9); ctx.lineTo(tp[0] + 6, tp[1] - 9); ctx.stroke();   // tap
    if (faceVisible(0, 1, dir)) for (const u of [-0.62, -0.2, 0.42]) { poly(ctx, [P(u - 0.16, 0.34, 1.2), P(u + 0.16, 0.34, 1.2), P(u + 0.16, 0.34, 0.15), P(u - 0.16, 0.34, 0.15)], undefined, hexA('#000', 0.22), 1); const h = P(u + 0.12, 0.34, 1.0); ctx.fillStyle = '#cfd6e2'; ctx.fillRect(h[0] - 1, h[1] - 5, 2.5, 10); }
  });
};

// Bathtub (2×1): enamel shell with an inner basin of water, foam, and a chrome tap at one end.
const drawBathtub = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  void accent; const en = base, cT = shade(en, 1.15), cR = shade(en, 0.9), cL = shade(en, 0.74);
  const parts: IsoPart[] = [{ u0: -0.85, u1: 0.85, v0: -0.3, v1: 0.34, z0: 0, z1: 0.7, t: cT, r: cR, l: cL }];
  drawParts(ctx, sx, sy, dir, 0, 0, parts, (P) => {
    const z = 0.7;
    poly(ctx, [P(-0.74, -0.2, z), P(0.74, -0.2, z), P(0.74, 0.24, z), P(-0.74, 0.24, z)], shade(en, 0.78));
    poly(ctx, [P(-0.66, -0.14, z), P(0.66, -0.14, z), P(0.66, 0.18, z), P(-0.66, 0.18, z)], 'rgba(96,184,214,0.75)');   // water
    ctx.fillStyle = 'rgba(255,255,255,0.6)'; for (const [u, v] of [[-0.4, 0], [0.2, 0.05], [0.5, -0.04]] as [number, number][]) { const c = P(u, v, z); ctx.beginPath(); ctx.arc(c[0], c[1], 3, 0, Math.PI * 2); ctx.fill(); }   // foam
    const tp = P(0.8, 0.02, z); ctx.strokeStyle = '#cfd6e2'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(tp[0], tp[1]); ctx.lineTo(tp[0], tp[1] - 11); ctx.lineTo(tp[0] - 7, tp[1] - 11); ctx.stroke();   // tap
  });
};

// Grandfather clock (3 high): slim case, a clock face with hands + ticks, glass body + brass pendulum.
const drawClock = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  void accent; const wood = base, cT = shade(wood, 1.15), cR = shade(wood, 0.9), cL = shade(wood, 0.54);
  const parts: IsoPart[] = [{ u0: -0.28, u1: 0.28, v0: -0.22, v1: 0.22, z0: 0, z1: 3, t: cT, r: cR, l: cL }];
  drawParts(ctx, sx, sy, dir, 0, 0, parts, (P) => {
    if (!faceVisible(0, 1, dir)) return;
    poly(ctx, [P(-0.2, 0.22, 2.2), P(0.2, 0.22, 2.2), P(0.2, 0.22, 0.4), P(-0.2, 0.22, 0.4)], 'rgba(18,28,38,0.5)');   // glass
    const top = P(0, 0.22, 2.0), pv = P(0, 0.22, 1.05); ctx.strokeStyle = '#caa24a'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(top[0], top[1]); ctx.lineTo(pv[0], pv[1]); ctx.stroke(); ctx.fillStyle = '#e8c66a'; ctx.beginPath(); ctx.arc(pv[0], pv[1], 5, 0, Math.PI * 2); ctx.fill();   // pendulum
    const f = P(0, 0.22, 2.55); ctx.fillStyle = '#f4efe2'; ctx.beginPath(); ctx.arc(f[0], f[1], 11, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#caa24a'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#2a2a30'; for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; ctx.beginPath(); ctx.arc(f[0] + Math.cos(a) * 8, f[1] + Math.sin(a) * 8, 0.9, 0, Math.PI * 2); ctx.fill(); }
    ctx.strokeStyle = '#2a2a30'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(f[0], f[1]); ctx.lineTo(f[0] + 5, f[1] - 4); ctx.moveTo(f[0], f[1]); ctx.lineTo(f[0] - 2, f[1] + 7); ctx.stroke();   // hands
  });
};

// Dresser (2×1): low chest, top slab, two columns of three drawers with brass pulls on the front.
const drawDresser = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  void accent; const wood = base, cT = shade(wood, 1.18), cR = shade(wood, 0.92), cL = shade(wood, 0.6);
  const parts: IsoPart[] = [{ u0: -0.9, u1: 0.9, v0: -0.24, v1: 0.34, z0: 0, z1: 1.2, t: cT, r: cR, l: cL }];
  drawParts(ctx, sx, sy, dir, 0, 0, parts, (P) => {
    poly(ctx, [P(-0.94, -0.3, 1.2), P(0.94, -0.3, 1.2), P(0.94, 0.4, 1.2), P(-0.94, 0.4, 1.2)], shade(wood, 1.3));   // top slab
    if (!faceVisible(0, 1, dir)) return;
    for (let r = 0; r < 3; r++) { const z0 = 0.12 + r * 0.34, z1 = z0 + 0.28; for (const [u0, u1] of [[-0.84, -0.04], [0.04, 0.84]] as [number, number][]) { poly(ctx, [P(u0, 0.34, z1), P(u1, 0.34, z1), P(u1, 0.34, z0), P(u0, 0.34, z0)], hexA('#fff', 0.05), hexA('#000', 0.22), 1); const h = P((u0 + u1) / 2, 0.34, (z0 + z1) / 2); ctx.fillStyle = '#caa24a'; ctx.fillRect(h[0] - 4, h[1] - 1.5, 8, 3); } }
  });
};

// Draw furni `kind` so its tile origin sits at (sx, sy). accent = room accent, t = frame counter.
// Effective footprint of a (possibly rotated) piece: 90°/270° swap width & depth.
// ═══════════ GYM — rotatable iso fitness gear ═══════════

// Treadmill (1×2): dark belt deck + side rails, an upright console with a glowing screen + handrails.
const drawTreadmill = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  const m = base, cT = shade(m, 1.2), cR = shade(m, 0.9), cL = shade(m, 0.58);
  const parts: IsoPart[] = [
    { u0: -0.36, u1: 0.36, v0: -0.85, v1: 0.6, z0: 0, z1: 0.22, t: '#14151a', r: cR, l: cL },
    { u0: -0.42, u1: -0.3, v0: -0.85, v1: 0.6, z0: 0.22, z1: 0.34, t: cT, r: cR, l: cL },
    { u0: 0.3, u1: 0.42, v0: -0.85, v1: 0.6, z0: 0.22, z1: 0.34, t: cT, r: cR, l: cL },
    { u0: -0.42, u1: 0.42, v0: -0.9, v1: -0.76, z0: 0, z1: 1.3, t: cT, r: cR, l: cL }];
  drawParts(ctx, sx, sy, dir, 0, 0, parts, (P) => {
    ctx.strokeStyle = hexA('#000', 0.35); ctx.lineWidth = 1; for (let i = 0; i < 6; i++) { const v = -0.6 + i * 0.2, a = P(-0.3, v, 0.23), b = P(0.3, v, 0.23); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }   // belt slats
    if (faceVisible(0, 1, dir)) { poly(ctx, [P(-0.32, -0.76, 1.25), P(0.32, -0.76, 1.25), P(0.32, -0.76, 0.72), P(-0.32, -0.76, 0.72)], '#0e1c26'); poly(ctx, [P(-0.26, -0.76, 1.18), P(0.26, -0.76, 1.18), P(0.26, -0.76, 0.8), P(-0.26, -0.76, 0.8)], hexA(accent, 0.6)); }   // console
    ctx.strokeStyle = '#9aa0ac'; ctx.lineWidth = 3; ctx.lineCap = 'round'; for (const u of [-0.38, 0.38]) { const a = P(u, -0.86, 1.25), b = P(u, -0.45, 0.95); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }   // handrails
  });
};

// Weight bench (1×2): padded bench on a steel frame + two uprights holding a loaded barbell.
const drawWeightBench = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  void accent; const pad = base, cT = shade(pad, 1.25), cR = shade(pad, 0.95), cL = shade(pad, 0.62), m = '#3a3e46';
  const parts: IsoPart[] = [
    ...legs([[-0.18, -0.55], [0.18, -0.55], [-0.18, 0.5], [0.18, 0.5]], 0.42).map(p => ({ ...p, t: m, r: shade(m, 0.8), l: shade(m, 0.5) })),
    { u0: -0.22, u1: 0.22, v0: -0.6, v1: 0.55, z0: 0.42, z1: 0.6, t: cT, r: cR, l: cL },
    { u0: -0.3, u1: -0.2, v0: -0.7, v1: -0.6, z0: 0, z1: 1.1, t: m, r: shade(m, 0.8), l: shade(m, 0.5) },
    { u0: 0.2, u1: 0.3, v0: -0.7, v1: -0.6, z0: 0, z1: 1.1, t: m, r: shade(m, 0.8), l: shade(m, 0.5) }];
  drawParts(ctx, sx, sy, dir, 0, 0, parts, (P) => {
    const a = P(-0.5, -0.65, 1.08), b = P(0.5, -0.65, 1.08); ctx.strokeStyle = '#aab0bd'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();   // bar
    for (const u of [-0.46, 0.46]) { const c = P(u, -0.65, 1.08); ctx.fillStyle = '#1a1a1f'; ctx.beginPath(); ctx.ellipse(c[0], c[1], 3, 9, 0, 0, Math.PI * 2); ctx.fill(); }   // plates
  });
};

// Free-standing heavy bag: weighted base, a curved boom arm, and a strapped punching bag on a chain.
const drawHeavyBag = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  void accent; const bag = base;
  const parts: IsoPart[] = [{ u0: -0.3, u1: 0.3, v0: -0.05, v1: 0.35, z0: 0, z1: 0.18, t: '#2a2e36', r: '#22252c', l: '#15171b' }];
  drawParts(ctx, sx, sy, dir, 0, 0, parts, (P) => {
    const b = P(0, 0.3, 0.18), top = P(0, 0.3, 2.3), arm = P(0, -0.15, 2.3);
    ctx.strokeStyle = '#888f9e'; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(b[0], b[1]); ctx.lineTo(top[0], top[1]); ctx.quadraticCurveTo((top[0] + arm[0]) / 2, top[1] - 10, arm[0], arm[1]); ctx.stroke();
    ctx.strokeStyle = '#5a5f6a'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(arm[0], arm[1]); ctx.lineTo(arm[0], arm[1] + 6); ctx.stroke();
    const bx = arm[0], by = arm[1] + 6, g = ctx.createLinearGradient(bx - 12, 0, bx + 12, 0); g.addColorStop(0, shade(bag, 0.7)); g.addColorStop(0.5, shade(bag, 1.18)); g.addColorStop(1, shade(bag, 0.72));
    ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(bx - 11, by, 22, 42, 9); ctx.fill();
    ctx.fillStyle = hexA('#000', 0.25); ctx.fillRect(bx - 11, by + 20, 22, 3); ctx.fillRect(bx - 11, by + 32, 22, 3);
    ctx.fillStyle = hexA('#fff', 0.15); ctx.fillRect(bx - 9, by + 3, 5, 36);
  });
};

// Dumbbell rack: a low steel A-rack holding two tiers of colour-capped dumbbells.
const drawDumbbells = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  void accent; const m = base, cT = shade(m, 1.2), cR = shade(m, 0.9), cL = shade(m, 0.58), cols = ['#b3242e', '#caa24a', '#2e7d4a', '#3a7bd0', '#7a4ba0'];
  const parts: IsoPart[] = [
    { u0: -0.5, u1: 0.5, v0: -0.05, v1: 0.25, z0: 0, z1: 0.24, t: cT, r: cR, l: cL },
    { u0: -0.5, u1: 0.5, v0: 0.0, v1: 0.08, z0: 0.24, z1: 0.66, t: cT, r: cR, l: cL }];
  drawParts(ctx, sx, sy, dir, 0, 0, parts, (P) => {
    for (const [z, vv] of [[0.34, 0.16], [0.62, 0.05]] as [number, number][]) for (let i = 0; i < 5; i++) { const u = -0.4 + i * 0.2, c = P(u, vv, z); ctx.fillStyle = '#2a2a30'; ctx.fillRect(c[0] - 6, c[1] - 2, 12, 4); ctx.fillStyle = cols[i]; ctx.beginPath(); ctx.arc(c[0] - 6, c[1], 3.2, 0, Math.PI * 2); ctx.arc(c[0] + 6, c[1], 3.2, 0, Math.PI * 2); ctx.fill(); }
  });
};

// Spin bike (1×2): weighted flywheel at the front, frame, saddle + handlebars.
const drawExBike = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  void accent; const m = base;
  const parts: IsoPart[] = [
    ...legs([[-0.1, -0.5], [-0.1, 0.45]], 0.1).map(p => ({ ...p, t: '#3a3e46', r: '#2a2e36', l: '#15171b' })),
    { u0: -0.06, u1: 0.06, v0: -0.5, v1: 0.45, z0: 0.08, z1: 0.16, t: '#3a3e46', r: '#2a2e36', l: '#15171b' }];
  drawParts(ctx, sx, sy, dir, 0, 0, parts, (P) => {
    const fw = P(0, -0.5, 0.52); ctx.fillStyle = '#4a4e56'; ctx.beginPath(); ctx.arc(fw[0], fw[1], 11, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#888f9e'; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = '#2a2e36'; ctx.beginPath(); ctx.arc(fw[0], fw[1], 4, 0, Math.PI * 2); ctx.fill();   // flywheel
    const crank = P(0, -0.2, 0.4), seat = P(0, 0.35, 1.0), hbar = P(0, -0.42, 1.15);
    ctx.strokeStyle = shade(m, 1.1); ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(crank[0], crank[1]); ctx.lineTo(seat[0], seat[1]); ctx.moveTo(crank[0], crank[1]); ctx.lineTo(hbar[0], hbar[1]); ctx.stroke();
    ctx.fillStyle = '#1a1a1f'; ctx.beginPath(); ctx.ellipse(seat[0], seat[1] - 2, 7, 3, 0, 0, Math.PI * 2); ctx.fill();   // saddle
    ctx.strokeStyle = '#888f9e'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(hbar[0] - 6, hbar[1]); ctx.lineTo(hbar[0] + 6, hbar[1]); ctx.stroke();   // bars
  });
};

// Gym lockers (3h): metal twin cabinet, louvre vents + handles on the camera-facing front.
const drawLocker = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  void accent; const m = base, cT = shade(m, 1.18), cR = shade(m, 0.92), cL = shade(m, 0.56);
  const parts: IsoPart[] = [{ u0: -0.45, u1: 0.45, v0: -0.3, v1: 0.3, z0: 0, z1: 2.6, t: cT, r: cR, l: cL }];
  drawParts(ctx, sx, sy, dir, 0, 0, parts, (P) => {
    if (!faceVisible(0, 1, dir)) return;
    for (const [u0, u1] of [[-0.42, -0.02], [0.02, 0.42]] as [number, number][]) {
      poly(ctx, [P(u0, 0.3, 2.55), P(u1, 0.3, 2.55), P(u1, 0.3, 0.1), P(u0, 0.3, 0.1)], undefined, hexA('#000', 0.3), 1);
      ctx.strokeStyle = hexA('#000', 0.3); ctx.lineWidth = 1; for (let i = 0; i < 3; i++) { const a = P(u0 + 0.04, 0.3, 2.4 - i * 0.08), b = P(u1 - 0.04, 0.3, 2.4 - i * 0.08); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
      const h = P(u1 - 0.06, 0.3, 1.3); ctx.fillStyle = '#cfd6e2'; ctx.fillRect(h[0] - 1.5, h[1] - 6, 3, 12);
    }
  });
};

// ═══════════ OUTDOOR — rotatable iso patio / garden gear ═══════════

// Kettle BBQ: tripod legs, a domed bowl with a glowing grill grate + coal glow, side handle.
const drawBBQ = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  void accent; const m = base;
  const parts: IsoPart[] = [...legs([[-0.28, -0.1], [0.28, -0.1], [0, 0.32]], 0.55).map(p => ({ ...p, t: '#3a3e46', r: '#2a2e36', l: '#15171b' }))];
  drawParts(ctx, sx, sy, dir, 0, 0, parts, (P) => {
    const c = P(0, 0.05, 0.7), g = ctx.createRadialGradient(c[0] - 5, c[1] - 5, 2, c[0], c[1], 18); g.addColorStop(0, shade(m, 1.4)); g.addColorStop(1, shade(m, 0.7));
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(c[0], c[1], 18, 10, 0, 0, Math.PI); ctx.fill();   // bowl
    ctx.fillStyle = '#33363c'; ctx.beginPath(); ctx.ellipse(c[0], c[1], 18, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; const gg = ctx.createRadialGradient(c[0], c[1], 1, c[0], c[1], 12); gg.addColorStop(0, 'rgba(255,140,40,0.6)'); gg.addColorStop(1, 'rgba(255,140,40,0)'); ctx.fillStyle = gg; ctx.beginPath(); ctx.ellipse(c[0], c[1], 15, 6, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();   // coals
    ctx.strokeStyle = '#9aa0ac'; ctx.lineWidth = 1; for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(c[0] + i * 6, c[1] - 4.5); ctx.lineTo(c[0] + i * 6, c[1] + 4.5); ctx.stroke(); }   // grate
    const hd = P(0.42, 0.05, 0.7); ctx.strokeStyle = '#2a2e36'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(hd[0], hd[1], 4, -1.2, 1.2); ctx.stroke();   // handle
  });
};

// Picnic table (2×1): A-frame timber table with attached bench seats both sides.
const drawPicnicTable = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  void accent; const wood = base, cT = shade(wood, 1.22), cR = shade(wood, 0.92), cL = shade(wood, 0.58);
  const parts: IsoPart[] = [
    { u0: -0.7, u1: -0.6, v0: -0.5, v1: 0.5, z0: 0, z1: 0.5, t: shade(wood, 0.85), r: cR, l: cL },
    { u0: 0.6, u1: 0.7, v0: -0.5, v1: 0.5, z0: 0, z1: 0.5, t: shade(wood, 0.85), r: cR, l: cL },
    { u0: -0.85, u1: 0.85, v0: -0.55, v1: -0.42, z0: 0.26, z1: 0.34, t: cT, r: cR, l: cL },
    { u0: -0.85, u1: 0.85, v0: 0.42, v1: 0.55, z0: 0.26, z1: 0.34, t: cT, r: cR, l: cL },
    { u0: -0.85, u1: 0.85, v0: -0.22, v1: 0.22, z0: 0.5, z1: 0.62, t: cT, r: cR, l: cL }];
  drawParts(ctx, sx, sy, dir, 0, 0, parts);
};

// Hot tub (2×2): timber-clad tub with a sunken pool of bubbling, steaming water (animated).
const drawHotTub = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, t: number, dir: number) => {
  void accent; const wood = base, cT = shade(wood, 1.18), cR = shade(wood, 0.92), cL = shade(wood, 0.58);
  const parts: IsoPart[] = [{ u0: -0.92, u1: 0.92, v0: -0.92, v1: 0.92, z0: 0, z1: 0.7, t: cT, r: cR, l: cL }];
  drawParts(ctx, sx, sy, dir, 0, 0, parts, (P) => {
    const z = 0.7;
    poly(ctx, [P(-0.8, -0.8, z), P(0.8, -0.8, z), P(0.8, 0.8, z), P(-0.8, 0.8, z)], 'rgba(58,160,200,0.85)');   // water
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; for (let i = 0; i < 11; i++) { const ph = t * 0.06 + i, u = -0.6 + ((i * 7) % 5) * 0.3, v = -0.6 + ((i * 3) % 5) * 0.3, c = P(u, v, z), r = 1.5 + Math.abs(Math.sin(ph)) * 2.5; ctx.beginPath(); ctx.arc(c[0], c[1], r, 0, Math.PI * 2); ctx.fill(); }   // bubbles
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 2; ctx.lineCap = 'round'; for (const [u, v] of [[-0.3, -0.2], [0.3, 0.2]] as [number, number][]) { const c = P(u, v, z); ctx.beginPath(); ctx.moveTo(c[0], c[1]); ctx.quadraticCurveTo(c[0] + 4 + Math.sin(t * 0.1) * 2, c[1] - 14, c[0] - 3, c[1] - 26); ctx.stroke(); }   // steam
  });
};

// Porch swing (2×1): a free-standing A-frame with a slatted bench hung on chains.
const drawSwingBench = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  void accent; const wood = base, m = '#3a3e46', cT = shade(wood, 1.22), cR = shade(wood, 0.92), cL = shade(wood, 0.6);
  const post = (u0: number, u1: number, v0: number, v1: number): IsoPart => ({ u0, u1, v0, v1, z0: 0, z1: 1.6, t: m, r: shade(m, 0.8), l: shade(m, 0.5) });
  const parts: IsoPart[] = [
    post(-0.85, -0.74, -0.3, -0.2), post(-0.85, -0.74, 0.2, 0.3), post(0.74, 0.85, -0.3, -0.2), post(0.74, 0.85, 0.2, 0.3),
    { u0: -0.85, u1: 0.85, v0: -0.05, v1: 0.05, z0: 1.55, z1: 1.65, t: m, r: shade(m, 0.8), l: shade(m, 0.5) }];
  drawParts(ctx, sx, sy, dir, 0, 0, parts, (P) => {
    ctx.strokeStyle = '#888f9e'; ctx.lineWidth = 1.5; for (const u of [-0.5, 0.5]) { const top = P(u, 0, 1.55), s = P(u, 0.12, 0.85); ctx.beginPath(); ctx.moveTo(top[0], top[1]); ctx.lineTo(s[0], s[1]); ctx.stroke(); }   // chains
    poly(ctx, [P(-0.55, -0.12, 0.85), P(0.55, -0.12, 0.85), P(0.55, 0.3, 0.85), P(-0.55, 0.3, 0.85)], cT);   // seat
    poly(ctx, [P(-0.55, 0.3, 0.85), P(0.55, 0.3, 0.85), P(0.55, 0.3, 0.76), P(-0.55, 0.3, 0.76)], cL);
    poly(ctx, [P(-0.55, -0.14, 1.32), P(0.55, -0.14, 1.32), P(0.55, -0.14, 0.85), P(-0.55, -0.14, 0.85)], cR);   // backrest
  });
};

// Street lamp (4h): tall pole, a curved arm reaching out, glowing lantern head.
const drawStreetLamp = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  void accent; const m = base;
  const parts: IsoPart[] = [
    { u0: -0.1, u1: 0.1, v0: -0.12, v1: 0.12, z0: 0, z1: 0.18, t: shade(m, 1.0), r: shade(m, 0.8), l: shade(m, 0.5) },
    { u0: -0.07, u1: 0.07, v0: -0.07, v1: 0.07, z0: 0.18, z1: 3.6, t: shade(m, 1.2), r: shade(m, 0.9), l: shade(m, 0.6) }];
  drawParts(ctx, sx, sy, dir, 0, 0, parts, (P) => {
    const top = P(0, 0, 3.6), arm = P(0, -0.5, 3.5);
    ctx.strokeStyle = shade(m, 1.0); ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(top[0], top[1]); ctx.quadraticCurveTo(top[0], top[1] - 8, arm[0], arm[1]); ctx.stroke();
    ctx.fillStyle = '#3a3e46'; ctx.beginPath(); ctx.moveTo(arm[0] - 7, arm[1]); ctx.lineTo(arm[0] + 7, arm[1]); ctx.lineTo(arm[0] + 4, arm[1] + 9); ctx.lineTo(arm[0] - 4, arm[1] + 9); ctx.closePath(); ctx.fill();   // head
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; const g = ctx.createRadialGradient(arm[0], arm[1] + 9, 1, arm[0], arm[1] + 9, 22); g.addColorStop(0, 'rgba(255,225,150,0.6)'); g.addColorStop(1, 'rgba(255,225,150,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(arm[0], arm[1] + 9, 22, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    ctx.fillStyle = '#fff3c0'; ctx.beginPath(); ctx.ellipse(arm[0], arm[1] + 7, 5, 2.5, 0, 0, Math.PI * 2); ctx.fill();
  });
};

// Mailbox: timber post + a rounded-top metal box (opening + red flag on the camera-facing front).
const drawMailbox = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  void accent; const m = base;
  const parts: IsoPart[] = [{ u0: -0.05, u1: 0.05, v0: -0.05, v1: 0.05, z0: 0, z1: 1.0, t: '#6a4a2c', r: '#5a3f24', l: '#3a2818' }];
  drawParts(ctx, sx, sy, dir, 0, 0, parts, (P) => {
    const c = P(0, 0, 1.0), cT = shade(m, 1.2), cR = shade(m, 0.9), cL = shade(m, 0.6), bw = 12, bd = 16, bh = 13;
    poly(ctx, [[c[0] - bw, c[1]], [c[0], c[1] + bd * 0.32], [c[0], c[1] - bh], [c[0] - bw, c[1] - bh - bd * 0.32]], cL);
    poly(ctx, [[c[0], c[1] + bd * 0.32], [c[0] + bw, c[1]], [c[0] + bw, c[1] - bh], [c[0], c[1] - bh - bd * 0.32]], cR);
    ctx.fillStyle = cT; ctx.beginPath(); ctx.ellipse(c[0], c[1] - bh - bd * 0.16, bw, bd * 0.32, 0, Math.PI, 0); ctx.fill();
    if (faceVisible(0, 1, dir)) { const f = P(0.0, 0.12, 1.0); ctx.fillStyle = '#d22'; ctx.fillRect(f[0] + 7, f[1] - 13, 2, 11); ctx.fillRect(f[0] + 9, f[1] - 13, 5, 5); }   // flag
  });
};

// ═══════════ FENCES ═══════════
// All fences sit at the BACK edge of their tile (v = -0.5) so they land on the tile boundary.
// Rotating 90° moves the fence to the right edge, 180° to the front, 270° to the left.

// Classic wooden picket fence — two posts with five narrow pickets between them.
const drawFencePicket = (ctx: CanvasRenderingContext2D, sx: number, sy: number, _a: string, base: string, dir: number) => {
  void _a;
  const t = shade(base, 1.22), r = shade(base, 0.88), l = shade(base, 0.58);
  const post = (u0: number, u1: number): IsoPart => ({ u0, u1, v0: -0.57, v1: -0.43, z0: 0, z1: 1.1, t, r, l });
  const pk   = (u: number): IsoPart           => ({ u0: u - 0.038, u1: u + 0.038, v0: -0.555, v1: -0.445, z0: 0, z1: 0.92, t, r, l });
  drawParts(ctx, sx, sy, dir, 0, 0, [post(-0.46, -0.36), post(0.36, 0.46), pk(-0.24), pk(-0.12), pk(0), pk(0.12), pk(0.24)]);
};

// Wrought-iron fence — square posts, thin vertical bars capped with spear tips, two horizontal rails.
const drawFenceIron = (ctx: CanvasRenderingContext2D, sx: number, sy: number, _a: string, base: string, dir: number) => {
  void _a;
  const t = shade(base, 1.2), r = shade(base, 0.85), l = shade(base, 0.58);
  const post = (u0: number, u1: number): IsoPart => ({ u0, u1, v0: -0.57, v1: -0.43, z0: 0, z1: 1.35, t, r, l });
  const rail = (z0: number, z1: number): IsoPart => ({ u0: -0.44, u1: 0.44, v0: -0.545, v1: -0.455, z0, z1, t, r, l });
  const bar  = (u: number): IsoPart              => ({ u0: u - 0.028, u1: u + 0.028, v0: -0.54, v1: -0.46, z0: 0.1, z1: 1.2, t, r, l });
  const tip  = (u: number): IsoPart              => ({ u0: u - 0.042, u1: u + 0.042, v0: -0.542, v1: -0.458, z0: 1.18, z1: 1.34, t: shade(base, 1.35), r, l });
  drawParts(ctx, sx, sy, dir, 0, 0, [
    post(-0.46, -0.36), post(0.36, 0.46),
    rail(0.08, 0.16), rail(0.92, 1.0),
    bar(-0.26), bar(-0.13), bar(0), bar(0.13), bar(0.26),
    tip(-0.26), tip(-0.13), tip(0), tip(0.13), tip(0.26),
  ]);
};

// Horizontal rail fence — two posts with three stacked rails (ranch / paddock style).
const drawFenceRail = (ctx: CanvasRenderingContext2D, sx: number, sy: number, _a: string, base: string, dir: number) => {
  void _a;
  const t = shade(base, 1.2), r = shade(base, 0.85), l = shade(base, 0.58);
  const post = (u: number): IsoPart              => ({ u0: u - 0.07, u1: u + 0.07, v0: -0.57, v1: -0.43, z0: 0, z1: 1.0, t, r, l });
  const rail = (z0: number, z1: number): IsoPart => ({ u0: -0.46, u1: 0.46, v0: -0.548, v1: -0.452, z0, z1, t, r, l });
  drawParts(ctx, sx, sy, dir, 0, 0, [post(-0.42), post(0.42), rail(0.14, 0.24), rail(0.48, 0.58), rail(0.78, 0.88)]);
};

// Solid board privacy fence — darker posts, full-height panel, cap rail on top.
const drawFenceSolid = (ctx: CanvasRenderingContext2D, sx: number, sy: number, _a: string, base: string, dir: number) => {
  void _a;
  const t = shade(base, 1.18), r = shade(base, 0.85), l = shade(base, 0.58);
  const post = (u0: number, u1: number): IsoPart => ({ u0, u1, v0: -0.57, v1: -0.43, z0: 0, z1: 1.12, t: shade(base, 0.72), r: shade(base, 0.52), l: shade(base, 0.4) });
  const panel: IsoPart = { u0: -0.38, u1: 0.38, v0: -0.55, v1: -0.45, z0: 0, z1: 1.0, t, r, l };
  const cap:   IsoPart = { u0: -0.47, u1: 0.47, v0: -0.57, v1: -0.43, z0: 1.0, z1: 1.08, t: shade(base, 1.3), r: shade(base, 0.9), l: shade(base, 0.62) };
  drawParts(ctx, sx, sy, dir, 0, 0, [post(-0.46, -0.36), post(0.36, 0.46), panel, cap]);
};

// ═══════════ NEW PLANTS ═══════════

// Pine tree: narrow bark trunk + four stacked triangular tiers tapering to a spike.
const drawPineTree = (ctx: CanvasRenderingContext2D, sx: number, sy: number, _a: string, base: string, dir: number) => {
  void _a; void dir;
  ctx.save(); ctx.globalAlpha = 0.18; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(sx, sy, TW * 0.38, TH * 0.38, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  const trunkH = STACK_H * 1.0, tw = TW * 0.1;
  const tg = ctx.createLinearGradient(sx - tw, 0, sx + tw, 0); tg.addColorStop(0, shade(base, 0.5)); tg.addColorStop(0.5, shade(base, 1.05)); tg.addColorStop(1, shade(base, 0.63));
  ctx.fillStyle = tg; ctx.fillRect(sx - tw, sy - trunkH, tw * 2, trunkH);
  const greens = ['#1a4d28', '#225e34', '#1d5530', '#297840'];
  const tiers = 4, step = STACK_H * 0.68;
  for (let i = 0; i < tiers; i++) {
    const rw = TW * (0.80 - i * 0.15);
    const btmY = sy - trunkH - i * step * 0.58;
    const tipY = btmY - STACK_H * (0.94 - i * 0.12);
    const g = ctx.createLinearGradient(sx - rw, 0, sx + rw, 0);
    g.addColorStop(0, shade(greens[i], 0.54)); g.addColorStop(0.42, shade(greens[i], 1.28)); g.addColorStop(1, shade(greens[i], 0.68));
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(sx, tipY); ctx.lineTo(sx + rw, btmY); ctx.lineTo(sx - rw, btmY); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = hexA('#000', 0.07); ctx.lineWidth = 0.5; ctx.stroke();
  }
};

// Cubic hedge: a tight-trimmed box of foliage with light speckle on the top face. Rotatable.
const drawHedge = (ctx: CanvasRenderingContext2D, sx: number, sy: number, _a: string, base: string, dir: number) => {
  void _a;
  const t = shade(base, 1.1), r = shade(base, 0.76), l = shade(base, 0.5);
  const parts: IsoPart[] = [{ u0: -0.48, u1: 0.48, v0: -0.48, v1: 0.48, z0: 0, z1: 1.0, t, r, l }];
  drawParts(ctx, sx, sy, dir, 0, 0, parts, (P) => {
    ctx.save(); ctx.globalAlpha = 0.22;
    for (let i = 0; i < 12; i++) {
      const u = -0.34 + (i % 4) * 0.22, v = -0.34 + Math.floor(i / 4) * 0.34;
      const c = P(u, v, 1.0); ctx.fillStyle = shade(base, 1.5); ctx.beginPath(); ctx.arc(c[0], c[1], 2.2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  });
};

// Shrub: low cluster of rounded leafy blobs with no visible trunk, sits flat on the ground.
const drawShrub = (ctx: CanvasRenderingContext2D, sx: number, sy: number, _a: string, base: string, dir: number) => {
  void _a; void dir;
  ctx.save(); ctx.globalAlpha = 0.15; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(sx, sy, TW * 0.54, TH * 0.54, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  const greens = ['#2a7a40', '#338c4e', '#1f6432', '#3aa05a'];
  const cy = sy - 10;
  const blob = (ox: number, oy: number, r: number, col: string) => {
    const g = ctx.createRadialGradient(sx + ox - r * 0.3, cy + oy - r * 0.36, 1, sx + ox, cy + oy, r);
    g.addColorStop(0, shade(col, 1.36)); g.addColorStop(0.6, col); g.addColorStop(1, shade(col, 0.64));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx + ox, cy + oy, r, 0, Math.PI * 2); ctx.fill();
  };
  blob(0, TH * 0.5, TW * 0.7, greens[3]);
  blob(-TW * 0.44, TH * 0.1, TW * 0.44, greens[1]); blob(TW * 0.44, TH * 0.1, TW * 0.44, greens[1]);
  blob(-TW * 0.2, -TH * 0.85, TW * 0.42, greens[2]); blob(TW * 0.24, -TH * 0.78, TW * 0.44, greens[0]);
  blob(0, -TH * 1.55, TW * 0.34, greens[3]);
  ctx.save(); ctx.globalAlpha = 0.36; ctx.fillStyle = '#cdfaa8';
  for (let i = 0; i < 8; i++) { const a = i * 2.4; ctx.beginPath(); ctx.arc(sx + Math.cos(a) * TW * 0.22, cy - 6 + Math.sin(a) * TW * 0.16, 1.4, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
};

// Oak tree: short wide trunk with root flares + a broad spreading canopy with more spread than the default tree.
const drawOakTree = (ctx: CanvasRenderingContext2D, sx: number, sy: number, _a: string, base: string, dir: number) => {
  void _a; void dir;
  ctx.save(); ctx.globalAlpha = 0.22; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(sx, sy, TW * 0.78, TH * 0.78, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  const trunkH = STACK_H * 1.4, tw = TW * 0.2;
  const tg = ctx.createLinearGradient(sx - tw, 0, sx + tw, 0); tg.addColorStop(0, shade(base, 0.5)); tg.addColorStop(0.5, shade(base, 1.18)); tg.addColorStop(1, shade(base, 0.62));
  ctx.fillStyle = tg; ctx.beginPath();
  ctx.moveTo(sx - tw, sy); ctx.quadraticCurveTo(sx - tw * 0.55, sy - trunkH * 0.5, sx - tw * 0.55, sy - trunkH);
  ctx.lineTo(sx + tw * 0.55, sy - trunkH); ctx.quadraticCurveTo(sx + tw * 0.55, sy - trunkH * 0.5, sx + tw, sy);
  ctx.lineTo(sx + tw * 2.0, sy + 3); ctx.lineTo(sx - tw * 2.0, sy + 3); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = hexA('#000', 0.14); ctx.lineWidth = 1; for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(sx + i * tw * 0.45, sy - 4); ctx.lineTo(sx + i * tw * 0.32, sy - trunkH + 4); ctx.stroke(); }
  const cy = sy - trunkH - TH * 0.4;
  const greens = ['#1e6634', '#27824a', '#30985a', '#176028', '#3aaa60'];
  const blob = (ox: number, oy: number, r: number, col: string) => {
    const g = ctx.createRadialGradient(sx + ox - r * 0.32, cy + oy - r * 0.36, r * 0.1, sx + ox, cy + oy, r);
    g.addColorStop(0, shade(col, 1.38)); g.addColorStop(0.6, col); g.addColorStop(1, shade(col, 0.65));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx + ox, cy + oy, r, 0, Math.PI * 2); ctx.fill();
  };
  blob(0, TH * 0.55, TW * 1.04, greens[3]);
  blob(-TW * 0.70, TH * 0.15, TW * 0.64, greens[1]); blob(TW * 0.70, TH * 0.15, TW * 0.64, greens[1]);
  blob(-TW * 0.42, -TH * 0.5, TW * 0.58, greens[2]); blob(TW * 0.42, -TH * 0.42, TW * 0.60, greens[0]);
  blob(-TW * 0.80, -TH * 0.08, TW * 0.44, greens[4]); blob(TW * 0.80, -TH * 0.08, TW * 0.44, greens[4]);
  blob(0, -TH * 0.9, TW * 0.54, greens[2]);
  ctx.save(); ctx.globalAlpha = 0.42; ctx.fillStyle = '#cdfaa8';
  for (let i = 0; i < 18; i++) { const a = i * 2.39917 + dir * 1.571, rr = TW * (0.26 + (i % 5) * 0.15); ctx.beginPath(); ctx.arc(sx + Math.cos(a) * rr, cy - TH * 0.15 + Math.sin(a) * rr * 0.58, 1.7, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
};

// Wildflower patch: free-standing blooms with no base tile.
const drawWildflowerPatch = (ctx: CanvasRenderingContext2D, sx: number, sy: number, kind: string) => {
  const top = sy;
  const G = '#2e8c40', GD = '#1a5c28';
  const pts: [number,number][] = [[-12,-4],[14,-5],[-6,5],[10,5],[0,-1]];
  switch (kind) {
    case 'hyacinth': {
      for (const [dx,dy] of pts) {
        const fx = sx+dx, fy = top+dy;
        ctx.strokeStyle = G; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(fx,fy); ctx.lineTo(fx,fy-24); ctx.stroke();
        for (let b = 0; b < 9; b++) {
          const pct = b/8, ang = (b-4)*0.55;
          ctx.fillStyle = pct < 0.5 ? '#7c3cc4' : '#b885e2';
          ctx.beginPath(); ctx.ellipse(fx+Math.sin(ang)*3.5*(1-pct*0.3), fy-6-pct*16, 2, 2.8, ang*0.2, 0, Math.PI*2); ctx.fill();
        }
      }
      break;
    }
    case 'tulip': {
      for (const [dx,dy] of pts.slice(0,4)) {
        const fx = sx+dx, fy = top+dy, sH = 22;
        ctx.strokeStyle = G; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(fx,fy); ctx.lineTo(fx,fy-sH); ctx.stroke();
        ctx.fillStyle = GD; ctx.beginPath(); ctx.ellipse(fx-3,fy-sH*0.5,2.5,6,-0.45,0,Math.PI*2); ctx.fill();
        const hd = fy-sH;
        ctx.fillStyle = '#c8253c';
        ctx.beginPath(); ctx.moveTo(fx,hd-8); ctx.bezierCurveTo(fx+5,hd-5,fx+5,hd+1,fx+3,hd+3); ctx.lineTo(fx-3,hd+3); ctx.bezierCurveTo(fx-5,hd+1,fx-5,hd-5,fx,hd-8); ctx.fill();
        ctx.fillStyle = '#ea6070'; ctx.beginPath(); ctx.ellipse(fx,hd+3,3,1.5,0,0,Math.PI*2); ctx.fill();
      }
      break;
    }
    case 'sunflower': {
      for (const [dx,dy] of pts.slice(0,3)) {
        const fx = sx+dx, fy = top+dy, sH = 28;
        ctx.strokeStyle = G; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(fx,fy); ctx.lineTo(fx,fy-sH); ctx.stroke();
        ctx.fillStyle = GD; ctx.beginPath(); ctx.ellipse(fx-4,fy-sH*0.55,2,5,-0.4,0,Math.PI*2); ctx.fill();
        const hd = fy-sH;
        for (let p = 0; p < 8; p++) {
          const pa = p*Math.PI/4;
          ctx.fillStyle = p%2 ? '#f9ca24' : '#e8b800';
          ctx.beginPath(); ctx.ellipse(fx+Math.cos(pa)*7, hd+Math.sin(pa)*5, 4, 2, pa, 0, Math.PI*2); ctx.fill();
        }
        ctx.fillStyle = '#5c3a0e'; ctx.beginPath(); ctx.arc(fx,hd,5,0,Math.PI*2); ctx.fill();
        ctx.fillStyle = '#7a5020'; ctx.beginPath(); ctx.arc(fx,hd,3,0,Math.PI*2); ctx.fill();
      }
      break;
    }
    case 'poppy': {
      for (const [dx,dy] of pts) {
        const fx = sx+dx, fy = top+dy, sH = 20;
        ctx.strokeStyle = G; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(fx,fy); ctx.quadraticCurveTo(fx+3,fy-sH*0.5,fx,fy-sH); ctx.stroke();
        const hd = fy-sH;
        for (let p = 0; p < 4; p++) {
          const pa = p*Math.PI/2+Math.PI/4;
          ctx.fillStyle = p%2 ? '#c81a28' : '#e03040';
          ctx.beginPath(); ctx.ellipse(fx+Math.cos(pa)*5, hd+Math.sin(pa)*3.5, 5, 3.5, pa, 0, Math.PI*2); ctx.fill();
        }
        ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(fx,hd,2.8,0,Math.PI*2); ctx.fill();
      }
      break;
    }
    case 'violet': {
      for (const [dx,dy] of pts) {
        const fx = sx+dx, fy = top+dy, sH = 12;
        ctx.strokeStyle = G; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.moveTo(fx,fy); ctx.lineTo(fx,fy-sH); ctx.stroke();
        const hd = fy-sH;
        for (let p = 0; p < 5; p++) {
          const pa = p*Math.PI*2/5 - Math.PI/2;
          ctx.fillStyle = p < 2 ? '#7b1fa2' : '#ba68c8';
          ctx.beginPath(); ctx.ellipse(fx+Math.cos(pa)*4, hd+Math.sin(pa)*3, 4, 3, pa, 0, Math.PI*2); ctx.fill();
        }
        ctx.fillStyle = '#fff176'; ctx.beginPath(); ctx.arc(fx,hd,1.8,0,Math.PI*2); ctx.fill();
      }
      break;
    }
    case 'buttercup': {
      for (const [dx,dy] of pts) {
        const fx = sx+dx, fy = top+dy, sH = 14;
        ctx.strokeStyle = G; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.moveTo(fx,fy); ctx.lineTo(fx,fy-sH); ctx.stroke();
        ctx.fillStyle = GD; ctx.beginPath(); ctx.ellipse(fx-2,fy-sH*0.4,2,4,-0.4,0,Math.PI*2); ctx.fill();
        const hd = fy-sH;
        for (let p = 0; p < 5; p++) {
          const pa = p*Math.PI*2/5;
          ctx.fillStyle = '#fdd835';
          ctx.beginPath(); ctx.ellipse(fx+Math.cos(pa)*4, hd+Math.sin(pa)*3, 4, 2.5, pa, 0, Math.PI*2); ctx.fill();
        }
        ctx.fillStyle = '#f57f00'; ctx.beginPath(); ctx.arc(fx,hd,2.5,0,Math.PI*2); ctx.fill();
      }
      break;
    }
    case 'rose': {
      for (const [dx,dy] of pts.slice(0,4)) {
        const fx = sx+dx, fy = top+dy, sH = 22;
        ctx.strokeStyle = G; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(fx,fy); ctx.lineTo(fx,fy-sH); ctx.stroke();
        ctx.fillStyle = GD; ctx.beginPath(); ctx.ellipse(fx+3,fy-sH*0.45,2.5,6,0.5,0,Math.PI*2); ctx.fill();
        const hd = fy-sH, rc = '#b71c2e';
        ctx.fillStyle = shade(rc,0.6); ctx.beginPath(); ctx.ellipse(fx+1,hd+1,6,5,0.2,0,Math.PI*2); ctx.fill();
        ctx.fillStyle = rc; ctx.beginPath(); ctx.ellipse(fx,hd-1,5,4,-0.2,0,Math.PI*2); ctx.fill();
        ctx.fillStyle = shade(rc,1.2); ctx.beginPath(); ctx.ellipse(fx-1,hd-2,3,2.5,0,0,Math.PI*2); ctx.fill();
        ctx.fillStyle = shade(rc,1.45); ctx.beginPath(); ctx.arc(fx,hd-3,1.5,0,Math.PI*2); ctx.fill();
      }
      break;
    }
    case 'lily': {
      for (const [dx,dy] of pts.slice(0,4)) {
        const fx = sx+dx, fy = top+dy, sH = 24;
        ctx.strokeStyle = G; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(fx,fy); ctx.lineTo(fx,fy-sH); ctx.stroke();
        ctx.fillStyle = GD; ctx.beginPath(); ctx.ellipse(fx-4,fy-sH*0.4,2,5,-0.55,0,Math.PI*2); ctx.fill();
        const hd = fy-sH;
        for (let p = 0; p < 6; p++) {
          const pa = p*Math.PI/3;
          ctx.fillStyle = p%2 ? '#f0ece8' : '#e8e2dc';
          ctx.beginPath(); ctx.ellipse(fx+Math.cos(pa)*6, hd+Math.sin(pa)*4, 5, 2.5, pa, 0, Math.PI*2); ctx.fill();
        }
        ctx.fillStyle = '#ffe57a';
        for (let s = 0; s < 3; s++) {
          const sa = s*Math.PI*2/3;
          ctx.beginPath(); ctx.arc(fx+Math.cos(sa)*2.5, hd+Math.sin(sa)*1.8, 1.2, 0, Math.PI*2); ctx.fill();
        }
      }
      break;
    }
  }
};

// White ceramic flower pot with pink roses.
const drawFlores = (ctx: CanvasRenderingContext2D, sx: number, sy: number, _accent: string) => {
  void _accent;
  const cx = sx;
  const pot = '#f4f4f4';
  const ptw = TW * 0.44, pbw = TW * 0.28, ph = STACK_H * 0.68;
  const topY = sy - ph + TH * 0.38;

  // pot body – horizontal gradient fakes a curved ceramic surface
  const g = ctx.createLinearGradient(cx - ptw, 0, cx + ptw, 0);
  g.addColorStop(0,    shade(pot, 0.68));
  g.addColorStop(0.38, shade(pot, 1.0));
  g.addColorStop(0.58, shade(pot, 1.06));
  g.addColorStop(1,    shade(pot, 0.75));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.moveTo(cx - pbw, sy); ctx.lineTo(cx + pbw, sy); ctx.lineTo(cx + ptw, topY); ctx.lineTo(cx - ptw, topY); ctx.closePath(); ctx.fill();

  // decorative band near rim
  const bandY = topY + ph * 0.1;
  ctx.strokeStyle = shade(pot, 0.82); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(cx - ptw * 0.9, bandY); ctx.lineTo(cx + ptw * 0.9, bandY); ctx.stroke();

  // rim ellipse top – lighter than sides
  ctx.fillStyle = shade(pot, 1.14);
  ctx.beginPath(); ctx.ellipse(cx, topY, ptw, TH * 0.46, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = shade(pot, 0.78); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.ellipse(cx, topY, ptw, TH * 0.46, 0, 0, Math.PI * 2); ctx.stroke();

  // soil
  ctx.fillStyle = '#2c1a0e';
  ctx.beginPath(); ctx.ellipse(cx, topY, ptw * 0.82, TH * 0.38, 0, 0, Math.PI * 2); ctx.fill();

  // stems + rose heads
  const stems: [number, number, number][] = [[-8, 24, 0.95], [1, 28, 1.1], [9, 21, 0.92], [-2, 17, 0.78]];
  const rc = '#e8407a', G = '#2a7a3a', GD = '#1a5c28';
  for (const [dx, sH, sc] of stems) {
    const fx = cx + dx, fy = topY;
    ctx.strokeStyle = G; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.moveTo(fx, fy); ctx.quadraticCurveTo(fx + dx * 0.25, fy - sH * 0.55, fx, fy - sH); ctx.stroke();
    ctx.fillStyle = GD; ctx.beginPath(); ctx.ellipse(fx + 3, fy - sH * 0.48, 3.5 * sc, 5.5 * sc, 0.48, 0, Math.PI * 2); ctx.fill();
    const hd = fy - sH;
    ctx.fillStyle = shade(rc, 0.58); ctx.beginPath(); ctx.ellipse(fx + 1, hd + 1.5, 7 * sc, 5.5 * sc, 0.18, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = shade(rc, 0.8);  ctx.beginPath(); ctx.ellipse(fx, hd, 5.8 * sc, 4.8 * sc, -0.1, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = rc;               ctx.beginPath(); ctx.ellipse(fx - 0.5, hd - 1, 4.2 * sc, 3.6 * sc, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = shade(rc, 1.28); ctx.beginPath(); ctx.ellipse(fx, hd - 1.8, 2.5 * sc, 2.2 * sc, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = shade(rc, 1.55); ctx.beginPath(); ctx.arc(fx, hd - 2.5, 1.3 * sc, 0, Math.PI * 2); ctx.fill();
  }
};

// ═══════════ STUDIO ═══════════
const drawDrumkit = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  const sh = base;
  const parts: IsoPart[] = [{ u0: -0.4, u1: 0.4, v0: -0.1, v1: 0.4, z0: 0, z1: 0.7, t: shade(sh, 1.1), r: shade(sh, 0.85), l: shade(sh, 0.6) }];
  drawParts(ctx, sx, sy, dir, 0, 0, parts, (P) => {
    if (faceVisible(0, 1, dir)) { const c = P(0, 0.4, 0.35); ctx.fillStyle = '#efe9dd'; ctx.beginPath(); ctx.ellipse(c[0], c[1], 16, 22, 0, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = hexA(accent, 0.8); ctx.lineWidth = 2; ctx.stroke(); }
    for (const u of [-0.18, 0.18]) { const c = P(u, 0.1, 0.7); ctx.fillStyle = shade(sh, 1.2); ctx.beginPath(); ctx.ellipse(c[0], c[1] - 4, 8, 4, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#efe9dd'; ctx.beginPath(); ctx.ellipse(c[0], c[1] - 7, 8, 3.5, 0, 0, Math.PI * 2); ctx.fill(); }
    const sn = P(0.4, 0.3, 0.45); ctx.fillStyle = shade(sh, 1.1); ctx.beginPath(); ctx.ellipse(sn[0], sn[1], 9, 4, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#e8e8ee'; ctx.beginPath(); ctx.ellipse(sn[0], sn[1] - 4, 9, 4, 0, 0, Math.PI * 2); ctx.fill();
    for (const [u, z] of [[-0.5, 1.1], [0.5, 1.0]] as [number, number][]) { const cy2 = P(u, -0.1, z), base2 = P(u, -0.1, 0); ctx.strokeStyle = '#888f9e'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(base2[0], base2[1]); ctx.lineTo(cy2[0], cy2[1]); ctx.stroke(); ctx.fillStyle = '#caa24a'; ctx.beginPath(); ctx.ellipse(cy2[0], cy2[1], 12, 4, 0, 0, Math.PI * 2); ctx.fill(); }
  });
};
const drawAmpStack = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  void accent; const m = base, cT = shade(m, 1.15), cR = shade(m, 0.9), cL = shade(m, 0.56);
  const parts: IsoPart[] = [{ u0: -0.4, u1: 0.4, v0: -0.3, v1: 0.3, z0: 0, z1: 1.3, t: cT, r: cR, l: cL }, { u0: -0.4, u1: 0.4, v0: -0.3, v1: 0.3, z0: 1.3, z1: 2.5, t: cT, r: cR, l: cL }];
  drawParts(ctx, sx, sy, dir, 0, 0, parts, (P) => {
    if (!faceVisible(0, 1, dir)) return;
    for (const [z0, z1] of [[0.15, 1.1], [1.45, 2.3]] as [number, number][]) { poly(ctx, [P(-0.34, 0.3, z1), P(0.34, 0.3, z1), P(0.34, 0.3, z0), P(-0.34, 0.3, z0)], '#1a140e'); ctx.fillStyle = hexA('#3a2a1a', 0.5); for (let gx = 0; gx < 5; gx++) for (let gz = 0; gz < 4; gz++) { const c = P(-0.28 + gx * 0.14, 0.3, z0 + 0.12 + gz * 0.22); ctx.beginPath(); ctx.arc(c[0], c[1], 1, 0, Math.PI * 2); ctx.fill(); } }
    const c = P(0, 0.3, 2.4); ctx.fillStyle = '#caa24a'; ctx.font = '900 7px Helvetica'; ctx.textAlign = 'center'; ctx.fillText('AMP', c[0], c[1]);
  });
};
const drawMixer = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  const m = base, cT = shade(m, 1.2), cR = shade(m, 0.9), cL = shade(m, 0.58);
  const parts: IsoPart[] = [{ u0: -0.85, u1: 0.85, v0: -0.25, v1: 0.3, z0: 0, z1: 0.55, t: cT, r: cR, l: cL }];
  drawParts(ctx, sx, sy, dir, 0, 0, parts, (P) => {
    const z = 0.55; poly(ctx, [P(-0.85, -0.25, z), P(0.85, -0.25, z), P(0.85, 0.3, z), P(-0.85, 0.3, z)], shade(m, 1.35));
    for (let i = 0; i < 10; i++) { const u = -0.7 + i * 0.155, a = P(u, 0.18, z), b = P(u, -0.05, z); ctx.strokeStyle = hexA('#000', 0.4); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); const kn = P(u, 0.05 + ((i * 3) % 4) * 0.05, z); ctx.fillStyle = hexA(accent, 0.8); ctx.fillRect(kn[0] - 2, kn[1] - 3, 4, 5); const k = P(u, -0.15, z); ctx.fillStyle = '#1a1a1f'; ctx.beginPath(); ctx.arc(k[0], k[1], 2.5, 0, Math.PI * 2); ctx.fill(); }
  });
};
const drawMicStand = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  void accent; const m = base;
  const parts: IsoPart[] = [{ u0: -0.18, u1: 0.18, v0: -0.18, v1: 0.18, z0: 0, z1: 0.1, t: shade(m, 1.0), r: shade(m, 0.8), l: shade(m, 0.5) }];
  drawParts(ctx, sx, sy, dir, 0, 0, parts, (P) => {
    const base2 = P(0, 0, 0.1), top = P(0, 0, 2.0), boom = P(0, -0.4, 1.95);
    ctx.strokeStyle = shade(m, 1.1); ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(base2[0], base2[1]); ctx.lineTo(top[0], top[1]); ctx.lineTo(boom[0], boom[1]); ctx.stroke();
    ctx.fillStyle = '#1a1a1f'; ctx.beginPath(); ctx.ellipse(boom[0], boom[1] + 4, 4, 7, 0.3, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#3a3a44'; ctx.beginPath(); ctx.ellipse(boom[0] - 1, boom[1] + 1, 3, 4, 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = shade(m, 0.9); ctx.lineWidth = 2; for (const [u, v] of [[-0.16, -0.08], [0.16, -0.08], [0, 0.16]] as [number, number][]) { const f = P(u, v, 0); ctx.beginPath(); ctx.moveTo(base2[0], base2[1]); ctx.lineTo(f[0], f[1]); ctx.stroke(); }
  });
};
const drawSynth = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  const m = base, cT = shade(m, 1.2), cR = shade(m, 0.9), cL = shade(m, 0.58);
  const parts: IsoPart[] = [
    { u0: -0.6, u1: -0.5, v0: -0.1, v1: 0.1, z0: 0, z1: 0.5, t: '#2a2e36', r: '#22252c', l: '#15171b' },
    { u0: 0.5, u1: 0.6, v0: -0.1, v1: 0.1, z0: 0, z1: 0.5, t: '#2a2e36', r: '#22252c', l: '#15171b' },
    { u0: -0.7, u1: 0.7, v0: -0.16, v1: 0.2, z0: 0.5, z1: 0.62, t: cT, r: cR, l: cL }];
  drawParts(ctx, sx, sy, dir, 0, 0, parts, (P) => {
    const z = 0.62; poly(ctx, [P(-0.66, -0.14, z), P(0.66, -0.14, z), P(0.66, 0.0, z), P(-0.66, 0.0, z)], shade(m, 1.35));
    for (let i = 0; i < 8; i++) { const u = -0.55 + i * 0.155, k = P(u, -0.07, z); ctx.fillStyle = hexA(accent, 0.8); ctx.beginPath(); ctx.arc(k[0], k[1], 1.8, 0, Math.PI * 2); ctx.fill(); }
    poly(ctx, [P(-0.66, 0.0, z), P(0.66, 0.0, z), P(0.66, 0.18, z), P(-0.66, 0.18, z)], '#f0ede6');
    ctx.strokeStyle = '#999'; ctx.lineWidth = 0.6; for (let i = 1; i < 16; i++) { const u = -0.66 + i * 0.0825, a = P(u, 0.0, z), b = P(u, 0.18, z); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
    ctx.fillStyle = '#1a1a1f'; for (let i = 0; i < 15; i++) { if (i % 7 === 2 || i % 7 === 6) continue; const u = -0.62 + i * 0.0825, c = P(u, 0.05, z); ctx.fillRect(c[0] - 1.5, c[1] - 4, 3, 6); }
  });
};
const drawVinyl = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  const m = base, cT = shade(m, 1.2), cR = shade(m, 0.9), cL = shade(m, 0.58);
  const parts: IsoPart[] = [{ u0: -0.45, u1: 0.45, v0: -0.3, v1: 0.3, z0: 0, z1: 0.4, t: cT, r: cR, l: cL }];
  drawParts(ctx, sx, sy, dir, 0, 0, parts, (P) => {
    const z = 0.4; poly(ctx, [P(-0.45, -0.3, z), P(0.45, -0.3, z), P(0.45, 0.3, z), P(-0.45, 0.3, z)], shade(m, 1.3));
    const c = P(-0.08, 0.0, z); ctx.fillStyle = '#1a1a1f'; ctx.beginPath(); ctx.ellipse(c[0], c[1], 15, 9, 0, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = hexA('#555', 0.8); ctx.lineWidth = 0.6; for (const rr of [12, 9, 6]) { ctx.beginPath(); ctx.ellipse(c[0], c[1], rr, rr * 0.6, 0, 0, Math.PI * 2); ctx.stroke(); } ctx.fillStyle = accent; ctx.beginPath(); ctx.ellipse(c[0], c[1], 4, 2.4, 0, 0, Math.PI * 2); ctx.fill();
    const piv = P(0.32, -0.18, z); ctx.strokeStyle = '#cfd6e2'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(piv[0], piv[1]); ctx.lineTo(c[0] + 6, c[1]); ctx.stroke(); ctx.fillStyle = '#888f9e'; ctx.beginPath(); ctx.arc(piv[0], piv[1], 3, 0, Math.PI * 2); ctx.fill();
  });
};

// ═══════════ DINER ═══════════
const drawDinerBooth = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  void accent; const pad = base, cT = shade(pad, 1.25), cR = shade(pad, 0.95), cL = shade(pad, 0.6);
  const parts: IsoPart[] = [{ u0: -0.85, u1: 0.85, v0: -0.1, v1: 0.4, z0: 0, z1: 0.5, t: cT, r: cR, l: cL }, { u0: -0.85, u1: 0.85, v0: -0.3, v1: -0.1, z0: 0, z1: 1.5, t: cT, r: cR, l: cL }];
  drawParts(ctx, sx, sy, dir, 0, 0, parts, (P) => {
    if (faceVisible(0, 1, dir)) { ctx.strokeStyle = hexA('#000', 0.2); ctx.lineWidth = 1; for (let i = 0; i < 4; i++) { const z = 0.6 + i * 0.22, a = P(-0.8, -0.1, z), b = P(0.8, -0.1, z); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); } }
    poly(ctx, [P(-0.8, -0.05, 0.5), P(0.8, -0.05, 0.5), P(0.8, 0.35, 0.5), P(-0.8, 0.35, 0.5)], hexA(shade(pad, 1.4), 0.5));
  });
};
const drawSodaFount = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  void accent; const m = base, cT = shade(m, 1.15), cR = shade(m, 0.9), cL = shade(m, 0.56);
  const parts: IsoPart[] = [{ u0: -0.35, u1: 0.35, v0: -0.25, v1: 0.25, z0: 0, z1: 1.4, t: cT, r: cR, l: cL }];
  drawParts(ctx, sx, sy, dir, 0, 0, parts, (P) => {
    if (!faceVisible(0, 1, dir)) return;
    for (const [u, c] of [[-0.2, '#b3242e'], [0, '#caa24a'], [0.2, '#3a7bd0']] as [number, string][]) poly(ctx, [P(u - 0.09, 0.25, 1.25), P(u + 0.09, 0.25, 1.25), P(u + 0.09, 0.25, 0.7), P(u - 0.09, 0.25, 0.7)], c);
    for (const u of [-0.2, 0, 0.2]) { const n = P(u, 0.25, 0.62); ctx.fillStyle = '#888f9e'; ctx.fillRect(n[0] - 1.5, n[1] - 4, 3, 6); }
    poly(ctx, [P(-0.32, 0.25, 0.58), P(0.32, 0.25, 0.58), P(0.32, 0.25, 0.5), P(-0.32, 0.25, 0.5)], '#3a3a44');
  });
};
const drawPopcorn = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  void accent; const m = base, cT = shade(m, 1.2), cR = shade(m, 0.9), cL = shade(m, 0.58);
  const parts: IsoPart[] = [...legs([[-0.3, -0.2], [0.3, -0.2], [-0.3, 0.2], [0.3, 0.2]], 0.4).map(p => ({ ...p, t: '#caa24a', r: shade('#caa24a', 0.8), l: shade('#caa24a', 0.5) })), { u0: -0.36, u1: 0.36, v0: -0.28, v1: 0.28, z0: 0.4, z1: 0.7, t: cT, r: cR, l: cL }];
  drawParts(ctx, sx, sy, dir, 0, 0, parts, (P) => {
    if (faceVisible(0, 1, dir)) { ctx.fillStyle = '#fff'; for (let i = 0; i < 4; i++) { const a = P(-0.3 + i * 0.18, 0.28, 0.5); ctx.fillRect(a[0] - 3, a[1] - 8, 6, 16); } }
    poly(ctx, [P(-0.34, 0.28, 1.5), P(0.34, 0.28, 1.5), P(0.34, 0.28, 0.72), P(-0.34, 0.28, 0.72)], 'rgba(200,220,235,0.16)');
    ctx.fillStyle = '#f4e3a0'; for (let i = 0; i < 22; i++) { const c = P(-0.3 + ((i * 7) % 7) * 0.09, 0.1, 0.8 + ((i * 5) % 4) * 0.06); ctx.beginPath(); ctx.arc(c[0], c[1], 3, 0, Math.PI * 2); ctx.fill(); }
    poly(ctx, [P(-0.4, 0.0, 1.7), P(0.0, -0.34, 1.7), P(0.4, 0.0, 1.7), P(0.0, 0.34, 1.7)], shade(m, 1.1));
  });
};
const drawIcecream = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  void accent; const m = base, cT = shade(m, 1.18), cR = shade(m, 0.92), cL = shade(m, 0.58);
  const parts: IsoPart[] = [{ u0: -0.7, u1: 0.7, v0: -0.3, v1: 0.3, z0: 0, z1: 0.75, t: cT, r: cR, l: cL }];
  drawParts(ctx, sx, sy, dir, 0, 0, parts, (P) => {
    const z = 0.75; poly(ctx, [P(-0.66, -0.26, z), P(0.66, -0.26, z), P(0.66, 0.26, z), P(-0.66, 0.26, z)], 'rgba(180,215,235,0.45)');
    const cols = ['#f4b8d0', '#a9713f', '#f3ead6', '#7fe39a']; for (let i = 0; i < 4; i++) { const c = P(-0.45 + i * 0.3, 0.0, z - 0.04); ctx.fillStyle = cols[i]; ctx.beginPath(); ctx.ellipse(c[0], c[1], 9, 5, 0, 0, Math.PI * 2); ctx.fill(); }
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1; const a = P(0, -0.26, z), b = P(0, 0.26, z); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    if (faceVisible(0, 1, dir)) { const s = P(0, 0.3, 0.5); ctx.fillStyle = '#caa24a'; ctx.beginPath(); ctx.moveTo(s[0], s[1] + 6); ctx.lineTo(s[0] - 5, s[1] - 4); ctx.lineTo(s[0] + 5, s[1] - 4); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#f4b8d0'; ctx.beginPath(); ctx.arc(s[0], s[1] - 6, 5, 0, Math.PI * 2); ctx.fill(); }
  });
};
const drawRegister = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  const m = base, cT = shade(m, 1.18), cR = shade(m, 0.92), cL = shade(m, 0.58);
  const parts: IsoPart[] = [{ u0: -0.3, u1: 0.3, v0: -0.2, v1: 0.25, z0: 0, z1: 0.4, t: cT, r: cR, l: cL }, { u0: -0.24, u1: 0.02, v0: -0.18, v1: 0.05, z0: 0.4, z1: 0.78, t: cT, r: cR, l: cL }];
  drawParts(ctx, sx, sy, dir, 0, 0, parts, (P) => {
    const scr = P(-0.11, 0.05, 0.8); ctx.fillStyle = '#10202a'; ctx.fillRect(scr[0] - 7, scr[1] - 7, 14, 8); ctx.fillStyle = hexA(accent, 0.7); ctx.fillRect(scr[0] - 5, scr[1] - 6, 10, 5);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) { const k = P(-0.1 + c * 0.1, 0.1 + r * 0.05, 0.4); ctx.fillStyle = hexA('#000', 0.4); ctx.fillRect(k[0] - 2, k[1] - 1.5, 4, 3); }
  });
};
const drawShakeBar = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  void accent; const m = base, cT = shade(m, 1.2), cR = shade(m, 0.9), cL = shade(m, 0.56);
  const parts: IsoPart[] = [{ u0: -0.3, u1: 0.3, v0: -0.2, v1: 0.2, z0: 0, z1: 0.3, t: cT, r: cR, l: cL }, { u0: -0.28, u1: -0.18, v0: -0.18, v1: -0.08, z0: 0.3, z1: 1.4, t: cT, r: cR, l: cL }, { u0: -0.28, u1: 0.28, v0: -0.18, v1: -0.08, z0: 1.3, z1: 1.4, t: cT, r: cR, l: cL }];
  drawParts(ctx, sx, sy, dir, 0, 0, parts, (P) => {
    for (const u of [-0.1, 0.1]) { const top = P(u, -0.13, 1.3), bot = P(u, -0.13, 0.7); ctx.strokeStyle = '#888f9e'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(top[0], top[1]); ctx.lineTo(bot[0], bot[1]); ctx.stroke(); const cup = P(u, 0.0, 0.3); ctx.fillStyle = '#e8e8ee'; ctx.beginPath(); ctx.moveTo(cup[0] - 4, cup[1]); ctx.lineTo(cup[0] + 4, cup[1]); ctx.lineTo(cup[0] + 3, cup[1] - 12); ctx.lineTo(cup[0] - 3, cup[1] - 12); ctx.closePath(); ctx.fill(); ctx.fillStyle = hexA('#f4b8d0', 0.9); ctx.fillRect(cup[0] - 3, cup[1] - 11, 6, 3); }
  });
};

// ═══════════ BATHROOM ═══════════
const drawToilet = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  void accent; const en = base, cT = shade(en, 1.12), cR = shade(en, 0.9), cL = shade(en, 0.74);
  const parts: IsoPart[] = [{ u0: -0.22, u1: 0.22, v0: -0.1, v1: 0.3, z0: 0, z1: 0.55, t: cT, r: cR, l: cL }, { u0: -0.28, u1: 0.28, v0: -0.32, v1: -0.12, z0: 0, z1: 1.0, t: cT, r: cR, l: cL }];
  drawParts(ctx, sx, sy, dir, 0, 0, parts, (P) => {
    const c = P(0, 0.12, 0.55); ctx.fillStyle = cT; ctx.beginPath(); ctx.ellipse(c[0], c[1], 13, 9, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = shade(en, 0.7); ctx.beginPath(); ctx.ellipse(c[0], c[1], 8, 5, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = 'rgba(150,200,220,0.5)'; ctx.beginPath(); ctx.ellipse(c[0], c[1], 5, 3, 0, 0, Math.PI * 2); ctx.fill();
    const lid = P(0, -0.22, 1.0); ctx.fillStyle = shade(en, 1.2); ctx.beginPath(); ctx.ellipse(lid[0], lid[1], 14, 5, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#cfd6e2'; ctx.beginPath(); ctx.arc(lid[0], lid[1], 2.5, 0, Math.PI * 2); ctx.fill();
  });
};
const drawVanity = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  void accent; const m = base, cT = shade(m, 1.18), cR = shade(m, 0.92), cL = shade(m, 0.56), top = '#d8dce4';
  const parts: IsoPart[] = [{ u0: -0.6, u1: 0.6, v0: -0.2, v1: 0.28, z0: 0, z1: 0.95, t: cT, r: cR, l: cL }];
  drawParts(ctx, sx, sy, dir, 0, 0, parts, (P) => {
    const z = 0.95; poly(ctx, [P(-0.64, -0.26, z), P(0.64, -0.26, z), P(0.64, 0.34, z), P(-0.64, 0.34, z)], shade(top, 1.2)); poly(ctx, [P(-0.64, 0.34, z), P(0.64, 0.34, z), P(0.64, 0.34, z - 0.08), P(-0.64, 0.34, z - 0.08)], shade(top, 0.8));
    const s = P(0, 0.05, z); ctx.fillStyle = '#9aa0aa'; ctx.beginPath(); ctx.ellipse(s[0], s[1], 12, 7, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#dfe6ee'; ctx.beginPath(); ctx.ellipse(s[0], s[1], 9, 5, 0, 0, Math.PI * 2); ctx.fill();
    const tp = P(0, -0.1, z); ctx.strokeStyle = '#cfd6e2'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(tp[0], tp[1]); ctx.lineTo(tp[0], tp[1] - 9); ctx.lineTo(tp[0] + 5, tp[1] - 9); ctx.stroke();
    if (faceVisible(0, 1, dir)) for (const u of [-0.3, 0.3]) { poly(ctx, [P(u - 0.24, 0.28, 0.85), P(u + 0.24, 0.28, 0.85), P(u + 0.24, 0.28, 0.12), P(u - 0.24, 0.28, 0.12)], undefined, hexA('#000', 0.2), 1); const h = P(u + (u < 0 ? 0.18 : -0.18), 0.28, 0.5); ctx.fillStyle = '#cfd6e2'; ctx.fillRect(h[0] - 1, h[1] - 4, 2.5, 8); }
  });
};
const drawShower = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  void accent; const tray = base;
  const parts: IsoPart[] = [{ u0: -0.42, u1: 0.42, v0: -0.42, v1: 0.42, z0: 0, z1: 0.12, t: shade(tray, 1.1), r: shade(tray, 0.9), l: shade(tray, 0.7) }];
  drawParts(ctx, sx, sy, dir, 0, 0, parts, (P) => {
    poly(ctx, [P(-0.42, -0.42, 2.4), P(-0.42, 0.42, 2.4), P(-0.42, 0.42, 0.12), P(-0.42, -0.42, 0.12)], 'rgba(150,165,180,0.55)');
    poly(ctx, [P(-0.42, -0.42, 2.4), P(0.42, -0.42, 2.4), P(0.42, -0.42, 0.12), P(-0.42, -0.42, 0.12)], 'rgba(170,185,200,0.5)');
    poly(ctx, [P(0.42, -0.42, 2.2), P(0.42, 0.42, 2.2), P(0.42, 0.42, 0.12), P(0.42, -0.42, 0.12)], 'rgba(200,225,240,0.16)');
    poly(ctx, [P(-0.42, 0.42, 2.2), P(0.42, 0.42, 2.2), P(0.42, 0.42, 0.12), P(-0.42, 0.42, 0.12)], 'rgba(200,225,240,0.16)');
    const arm = P(-0.36, -0.36, 2.1), head = P(-0.18, -0.18, 2.0); ctx.strokeStyle = '#cfd6e2'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(arm[0], arm[1]); ctx.lineTo(head[0], head[1]); ctx.stroke(); ctx.fillStyle = '#cfd6e2'; ctx.beginPath(); ctx.ellipse(head[0], head[1] + 2, 5, 2.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(180,220,240,0.4)'; ctx.lineWidth = 1; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(head[0] - 3 + i * 2, head[1] + 4); ctx.lineTo(head[0] - 3 + i * 2, head[1] + 18); ctx.stroke(); }
  });
};
const drawTowelRail = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  void accent; const m = base;
  const parts: IsoPart[] = [{ u0: -0.3, u1: -0.24, v0: -0.05, v1: 0.05, z0: 0, z1: 1.4, t: m, r: shade(m, 0.8), l: shade(m, 0.5) }, { u0: 0.24, u1: 0.3, v0: -0.05, v1: 0.05, z0: 0, z1: 1.4, t: m, r: shade(m, 0.8), l: shade(m, 0.5) }];
  drawParts(ctx, sx, sy, dir, 0, 0, parts, (P) => {
    ctx.strokeStyle = shade(m, 1.1); ctx.lineWidth = 2.5; ctx.lineCap = 'round'; for (const z of [0.3, 0.6, 0.9, 1.2]) { const a = P(-0.27, 0, z), b = P(0.27, 0, z); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
    if (faceVisible(0, 1, dir)) poly(ctx, [P(-0.18, 0.06, 1.2), P(0.18, 0.06, 1.2), P(0.18, 0.06, 0.55), P(-0.18, 0.06, 0.55)], '#7fbfe0');
  });
};
const drawWasher = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, t: number, dir: number) => {
  void accent; const m = base, cT = shade(m, 1.12), cR = shade(m, 0.92), cL = shade(m, 0.62);
  const parts: IsoPart[] = [{ u0: -0.4, u1: 0.4, v0: -0.3, v1: 0.3, z0: 0, z1: 1.2, t: cT, r: cR, l: cL }];
  drawParts(ctx, sx, sy, dir, 0, 0, parts, (P) => {
    if (!faceVisible(0, 1, dir)) return;
    poly(ctx, [P(-0.36, 0.3, 1.1), P(0.36, 0.3, 1.1), P(0.36, 0.3, 0.92), P(-0.36, 0.3, 0.92)], shade(m, 0.85)); const dial = P(0.24, 0.3, 1.0); ctx.fillStyle = '#2a2e36'; ctx.beginPath(); ctx.arc(dial[0], dial[1], 4, 0, Math.PI * 2); ctx.fill();
    const c = P(0, 0.3, 0.5); ctx.fillStyle = '#2a2e36'; ctx.beginPath(); ctx.arc(c[0], c[1], 13, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.arc(c[0], c[1], 10, 0, Math.PI * 2); ctx.clip(); ctx.fillStyle = 'rgba(120,190,220,0.6)'; ctx.fillRect(c[0] - 10, c[1] - 10, 20, 20); ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 2; for (let i = 0; i < 3; i++) { const a = t * 0.15 + i * 2.1; ctx.beginPath(); ctx.moveTo(c[0], c[1]); ctx.lineTo(c[0] + Math.cos(a) * 10, c[1] + Math.sin(a) * 10); ctx.stroke(); } ctx.restore();
    ctx.strokeStyle = '#888f9e'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(c[0], c[1], 13, 0, Math.PI * 2); ctx.stroke();
  });
};
const drawMirror = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  void accent; const m = base;
  const parts: IsoPart[] = [
    { u0: -0.22, u1: -0.14, v0: 0.0, v1: 0.3, z0: 0, z1: 0.1, t: shade(m, 1.0), r: shade(m, 0.8), l: shade(m, 0.5) },
    { u0: 0.14, u1: 0.22, v0: 0.0, v1: 0.3, z0: 0, z1: 0.1, t: shade(m, 1.0), r: shade(m, 0.8), l: shade(m, 0.5) },
    { u0: -0.26, u1: -0.18, v0: 0.08, v1: 0.14, z0: 0, z1: 2.2, t: shade(m, 1.15), r: shade(m, 0.9), l: shade(m, 0.6) },
    { u0: 0.18, u1: 0.26, v0: 0.08, v1: 0.14, z0: 0, z1: 2.2, t: shade(m, 1.15), r: shade(m, 0.9), l: shade(m, 0.6) },
    { u0: -0.26, u1: 0.26, v0: 0.08, v1: 0.14, z0: 2.1, z1: 2.2, t: shade(m, 1.15), r: shade(m, 0.9), l: shade(m, 0.6) }];
  drawParts(ctx, sx, sy, dir, 0, 0, parts, (P) => {
    if (faceVisible(0, 1, dir)) { poly(ctx, [P(-0.2, 0.12, 2.05), P(0.2, 0.12, 2.05), P(0.2, 0.12, 0.15), P(-0.2, 0.12, 0.15)], 'rgba(150,180,200,0.4)'); poly(ctx, [P(-0.14, 0.12, 1.8), P(-0.04, 0.12, 1.8), P(0.06, 0.12, 0.4), P(-0.04, 0.12, 0.4)], 'rgba(255,255,255,0.18)'); }
    else poly(ctx, [P(-0.2, 0.12, 2.05), P(0.2, 0.12, 2.05), P(0.2, 0.12, 0.15), P(-0.2, 0.12, 0.15)], shade(m, 0.7));
  });
};

// ═══════════ OFFICE ═══════════
const drawOfficeChair = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  void accent; const m = base, cu = shade(m, 1.2), cuR = shade(m, 0.92), cuL = shade(m, 0.6), met = '#3a3e46';
  const parts: IsoPart[] = [{ u0: -0.3, u1: 0.3, v0: -0.28, v1: 0.3, z0: 0.5, z1: 0.66, t: cu, r: cuR, l: cuL }, { u0: -0.28, u1: 0.28, v0: -0.34, v1: -0.24, z0: 0.5, z1: 1.5, t: cu, r: cuR, l: cuL }];
  drawParts(ctx, sx, sy, dir, 0, 0, parts, (P) => {
    const top = P(0, 0.0, 0.5), bot = P(0, 0.0, 0.12); ctx.strokeStyle = met; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(top[0], top[1]); ctx.lineTo(bot[0], bot[1]); ctx.stroke();
    for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2, w = P(Math.cos(a) * 0.3, Math.sin(a) * 0.3, 0.05); ctx.strokeStyle = met; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(bot[0], bot[1]); ctx.lineTo(w[0], w[1]); ctx.stroke(); ctx.fillStyle = '#1a1a1f'; ctx.beginPath(); ctx.arc(w[0], w[1] + 2, 3, 0, Math.PI * 2); ctx.fill(); }
    for (const u of [-0.32, 0.32]) { const a = P(u, 0.0, 0.66), b = P(u, 0.0, 0.85); ctx.strokeStyle = met; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
  });
};
const drawFileCab = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  void accent; const m = base, cT = shade(m, 1.16), cR = shade(m, 0.92), cL = shade(m, 0.56);
  const parts: IsoPart[] = [{ u0: -0.32, u1: 0.32, v0: -0.3, v1: 0.3, z0: 0, z1: 2.0, t: cT, r: cR, l: cL }];
  drawParts(ctx, sx, sy, dir, 0, 0, parts, (P) => {
    if (!faceVisible(0, 1, dir)) return;
    for (let r = 0; r < 4; r++) { const z0 = 0.1 + r * 0.46, z1 = z0 + 0.4; poly(ctx, [P(-0.3, 0.3, z1), P(0.3, 0.3, z1), P(0.3, 0.3, z0), P(-0.3, 0.3, z0)], undefined, hexA('#000', 0.25), 1); const lab = P(0, 0.3, z0 + 0.28); ctx.fillStyle = hexA('#fff', 0.5); ctx.fillRect(lab[0] - 8, lab[1] - 2, 16, 4); const h = P(0, 0.3, z0 + 0.1); ctx.fillStyle = '#cfd6e2'; ctx.fillRect(h[0] - 6, h[1] - 1.5, 12, 3); }
  });
};
const drawCopier = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  const m = base, cT = shade(m, 1.16), cR = shade(m, 0.92), cL = shade(m, 0.56);
  const parts: IsoPart[] = [{ u0: -0.4, u1: 0.4, v0: -0.32, v1: 0.32, z0: 0, z1: 0.9, t: cT, r: cR, l: cL }, { u0: -0.4, u1: 0.4, v0: -0.32, v1: 0.32, z0: 0.9, z1: 1.15, t: shade(m, 1.0), r: cR, l: cL }];
  drawParts(ctx, sx, sy, dir, 0, 0, parts, (P) => {
    if (faceVisible(0, 1, dir)) { poly(ctx, [P(-0.3, 0.32, 0.5), P(0.3, 0.32, 0.5), P(0.3, 0.32, 0.35), P(-0.3, 0.32, 0.35)], shade(m, 0.7)); const cp = P(0.2, 0.32, 0.78); ctx.fillStyle = '#10202a'; ctx.fillRect(cp[0] - 7, cp[1] - 5, 14, 8); ctx.fillStyle = hexA(accent, 0.7); ctx.fillRect(cp[0] - 5, cp[1] - 4, 10, 5); const pp = P(-0.1, 0.32, 0.55); ctx.fillStyle = '#fff'; ctx.fillRect(pp[0] - 6, pp[1] - 2, 12, 3); }
    const sl = P(0, 0.0, 0.9); ctx.save(); ctx.globalAlpha = 0.3; ctx.fillStyle = hexA(accent, 0.6); ctx.fillRect(sl[0] - 15, sl[1] - 1, 30, 2); ctx.restore();
  });
};
const drawWaterCooler = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  void accent; const m = base, cT = shade(m, 1.15), cR = shade(m, 0.9), cL = shade(m, 0.58);
  const parts: IsoPart[] = [{ u0: -0.22, u1: 0.22, v0: -0.18, v1: 0.22, z0: 0, z1: 1.0, t: cT, r: cR, l: cL }];
  drawParts(ctx, sx, sy, dir, 0, 0, parts, (P) => {
    const c = P(0, 0.0, 1.0); ctx.fillStyle = 'rgba(120,190,220,0.6)'; ctx.beginPath(); ctx.moveTo(c[0] - 11, c[1]); ctx.quadraticCurveTo(c[0] - 13, c[1] - 22, c[0], c[1] - 30); ctx.quadraticCurveTo(c[0] + 13, c[1] - 22, c[0] + 11, c[1]); ctx.closePath(); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(c[0] - 7, c[1] - 26, 4, 22);
    if (faceVisible(0, 1, dir)) for (const [u, col] of [[-0.08, '#3a7bd0'], [0.08, '#b3242e']] as [number, string][]) { const tp = P(u, 0.22, 0.55); ctx.fillStyle = col; ctx.fillRect(tp[0] - 2, tp[1] - 4, 4, 4); ctx.fillStyle = '#888f9e'; ctx.fillRect(tp[0] - 1, tp[1], 2, 4); }
  });
};
const drawWhiteboard = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  void accent; void base; const m = '#3a3e46';
  const parts: IsoPart[] = [{ u0: -0.7, u1: -0.6, v0: 0.0, v1: 0.1, z0: 0, z1: 1.0, t: m, r: shade(m, 0.8), l: shade(m, 0.5) }, { u0: 0.6, u1: 0.7, v0: 0.0, v1: 0.1, z0: 0, z1: 1.0, t: m, r: shade(m, 0.8), l: shade(m, 0.5) }];
  drawParts(ctx, sx, sy, dir, 0, 0, parts, (P) => {
    poly(ctx, [P(-0.8, 0.08, 2.0), P(0.8, 0.08, 2.0), P(0.8, 0.08, 1.0), P(-0.8, 0.08, 1.0)], faceVisible(0, 1, dir) ? '#f4f4f0' : '#cfd2d8');
    if (faceVisible(0, 1, dir)) { ctx.strokeStyle = hexA('#b3242e', 0.8); ctx.lineWidth = 2; const a = P(-0.5, 0.08, 1.7); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(a[0] + 20, a[1] - 8); ctx.lineTo(a[0] + 40, a[1] + 4); ctx.stroke(); ctx.strokeStyle = hexA('#3a7bd0', 0.8); const b = P(-0.4, 0.08, 1.4); ctx.beginPath(); ctx.moveTo(b[0], b[1]); ctx.lineTo(b[0] + 50, b[1]); ctx.stroke(); const tr = P(0, 0.1, 1.0); ctx.fillStyle = m; ctx.fillRect(tr[0] - 30, tr[1] - 2, 60, 3); }
  });
};
const drawServerRack = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  const m = base, cT = shade(m, 1.4), cR = shade(m, 1.0), cL = shade(m, 0.6);
  const parts: IsoPart[] = [{ u0: -0.3, u1: 0.3, v0: -0.26, v1: 0.26, z0: 0, z1: 2.6, t: cT, r: cR, l: cL }];
  drawParts(ctx, sx, sy, dir, 0, 0, parts, (P) => {
    if (!faceVisible(0, 1, dir)) return;
    poly(ctx, [P(-0.27, 0.26, 2.5), P(0.27, 0.26, 2.5), P(0.27, 0.26, 0.1), P(-0.27, 0.26, 0.1)], '#0e0f14');
    for (let r = 0; r < 10; r++) { const z = 0.25 + r * 0.22; poly(ctx, [P(-0.24, 0.26, z + 0.16), P(0.24, 0.26, z + 0.16), P(0.24, 0.26, z), P(-0.24, 0.26, z)], '#22252c'); for (let i = 0; i < 5; i++) { const l = P(-0.18 + i * 0.09, 0.26, z + 0.08), on = ((r * 7 + i * 3 + (i % 2)) % 3) === 0; ctx.fillStyle = on ? (i % 2 ? '#1ED760' : accent) : '#2a3a2a'; ctx.beginPath(); ctx.arc(l[0], l[1], 1.3, 0, Math.PI * 2); ctx.fill(); } }
  });
};

// ═══════════ ARCADE / GAMES ═══════════
const drawPoolTable = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  void accent; const wood = base, cT = shade(wood, 1.2), cR = shade(wood, 0.9), cL = shade(wood, 0.56);
  const parts: IsoPart[] = [...legs([[-0.75, -0.4], [0.75, -0.4], [-0.75, 0.4], [0.75, 0.4]], 0.5).map(p => ({ ...p, t: cT, r: cR, l: cL })), { u0: -0.92, u1: 0.92, v0: -0.55, v1: 0.55, z0: 0.5, z1: 0.66, t: cT, r: cR, l: cL }];
  drawParts(ctx, sx, sy, dir, 0, 0, parts, (P) => {
    const z = 0.66; poly(ctx, [P(-0.82, -0.46, z), P(0.82, -0.46, z), P(0.82, 0.46, z), P(-0.82, 0.46, z)], '#1f7a44');
    ctx.fillStyle = '#0a0a0a'; for (const [u, v] of [[-0.82, -0.46], [0, -0.46], [0.82, -0.46], [-0.82, 0.46], [0, 0.46], [0.82, 0.46]] as [number, number][]) { const c = P(u, v, z); ctx.beginPath(); ctx.arc(c[0], c[1], 4, 0, Math.PI * 2); ctx.fill(); }
    const cols = ['#caa24a', '#b3242e', '#3a7bd0', '#2e7d4a', '#7a4ba0', '#e07b1f', '#fff', '#1a1a1f']; for (let i = 0; i < 8; i++) { const c = P(0.2 + (i % 3) * 0.1, -0.2 + Math.floor(i / 3) * 0.14, z); ctx.fillStyle = cols[i]; ctx.beginPath(); ctx.arc(c[0], c[1], 3, 0, Math.PI * 2); ctx.fill(); }
    const cb = P(-0.4, 0.1, z); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cb[0], cb[1], 3, 0, Math.PI * 2); ctx.fill(); const cue1 = P(-0.7, 0.3, z), cue2 = P(-0.3, 0.05, z); ctx.strokeStyle = '#caa24a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cue1[0], cue1[1]); ctx.lineTo(cue2[0], cue2[1]); ctx.stroke();
  });
};
const drawFoosball = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  void accent; const wood = base, cT = shade(wood, 1.2), cR = shade(wood, 0.9), cL = shade(wood, 0.56);
  const parts: IsoPart[] = [...legs([[-0.7, -0.3], [0.7, -0.3], [-0.7, 0.3], [0.7, 0.3]], 0.6).map(p => ({ ...p, t: cT, r: cR, l: cL })), { u0: -0.85, u1: 0.85, v0: -0.4, v1: 0.4, z0: 0.6, z1: 0.74, t: cT, r: cR, l: cL }];
  drawParts(ctx, sx, sy, dir, 0, 0, parts, (P) => {
    const z = 0.74; poly(ctx, [P(-0.78, -0.34, z), P(0.78, -0.34, z), P(0.78, 0.34, z), P(-0.78, 0.34, z)], '#2e7d44');
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1; const a = P(0, -0.34, z), b = P(0, 0.34, z); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    for (let i = 0; i < 4; i++) { const u = -0.55 + i * 0.37, r1 = P(u, -0.45, z + 0.08), r2 = P(u, 0.45, z + 0.08); ctx.strokeStyle = '#9aa0ac'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(r1[0], r1[1]); ctx.lineTo(r2[0], r2[1]); ctx.stroke(); const col = i < 2 ? '#b3242e' : '#3a7bd0'; for (const v of [-0.15, 0.15]) { const p = P(u, v, z + 0.02); ctx.fillStyle = col; ctx.fillRect(p[0] - 2, p[1] - 7, 4, 7); } }
  });
};
const drawClawMachine = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  const m = base, cT = shade(m, 1.2), cR = shade(m, 0.9), cL = shade(m, 0.56);
  const parts: IsoPart[] = [{ u0: -0.4, u1: 0.4, v0: -0.3, v1: 0.3, z0: 0, z1: 0.9, t: cT, r: cR, l: cL }, { u0: -0.4, u1: 0.4, v0: -0.3, v1: 0.3, z0: 2.4, z1: 2.7, t: cT, r: cR, l: cL }];
  drawParts(ctx, sx, sy, dir, 0, 0, parts, (P) => {
    poly(ctx, [P(-0.36, 0.3, 2.4), P(0.36, 0.3, 2.4), P(0.36, 0.3, 0.9), P(-0.36, 0.3, 0.9)], 'rgba(190,215,235,0.16)');
    poly(ctx, [P(0.4, -0.3, 2.4), P(0.4, 0.3, 2.4), P(0.4, 0.3, 0.9), P(0.4, -0.3, 0.9)], 'rgba(160,190,215,0.14)');
    const cols = ['#f4b8d0', '#7fe39a', '#caa24a', '#3a7bd0', '#e07b1f']; for (let i = 0; i < 7; i++) { const c = P(-0.3 + ((i * 7) % 5) * 0.14, 0.0 + ((i * 3) % 3 - 1) * 0.12, 1.05); ctx.fillStyle = cols[i % 5]; ctx.beginPath(); ctx.arc(c[0], c[1], 4, 0, Math.PI * 2); ctx.fill(); }
    const rail = P(0, -0.2, 2.3), claw = P(0.0, -0.1, 1.7); ctx.strokeStyle = '#888f9e'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(claw[0], claw[1]); ctx.lineTo(claw[0], rail[1]); ctx.stroke(); ctx.fillStyle = '#cfd6e2'; ctx.beginPath(); ctx.moveTo(claw[0] - 5, claw[1]); ctx.lineTo(claw[0], claw[1] + 8); ctx.lineTo(claw[0] + 5, claw[1]); ctx.closePath(); ctx.fill();
    if (faceVisible(0, 1, dir)) { poly(ctx, [P(-0.4, 0.3, 2.7), P(0.4, 0.3, 2.7), P(0.4, 0.3, 2.4), P(-0.4, 0.3, 2.4)], hexA(accent, 0.5)); }
  });
};
// Squid-Game prize vault — a slim column topped by a glass cube that fills with green cash at the bottom.
const drawCashVault = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, t: number, dir: number) => {
  const m = base, cT = shade(m, 1.25), cR = shade(m, 0.92), cL = shade(m, 0.55);
  const parts: IsoPart[] = [
    { u0: -0.34, u1: 0.34, v0: -0.34, v1: 0.34, z0: 0, z1: 0.2, t: cT, r: cR, l: cL },     // plinth
    { u0: -0.18, u1: 0.18, v0: -0.18, v1: 0.18, z0: 0.2, z1: 1.5, t: cT, r: cR, l: cL },   // column
  ];
  drawParts(ctx, sx, sy, dir, 0, 0, parts, (P) => {
    // iso cube helper: 4 side faces (front two emphasised) + top
    const cube = (hu: number, z0: number, z1: number, top: string, rt: string, lf: string, bk: string) => {
      poly(ctx, [P(-hu, -hu, z1), P(hu, -hu, z1), P(hu, -hu, z0), P(-hu, -hu, z0)], bk);     // back -v
      poly(ctx, [P(-hu, -hu, z1), P(-hu, hu, z1), P(-hu, hu, z0), P(-hu, -hu, z0)], bk);     // back -u
      poly(ctx, [P(hu, -hu, z1), P(hu, hu, z1), P(hu, hu, z0), P(hu, -hu, z0)], rt);         // +u
      poly(ctx, [P(-hu, hu, z1), P(hu, hu, z1), P(hu, hu, z0), P(-hu, hu, z0)], lf);         // +v
      poly(ctx, [P(-hu, -hu, z1), P(hu, -hu, z1), P(hu, hu, z1), P(-hu, hu, z1)], top);      // top
    };
    const lvl = 0.55 + 0.12 * Math.sin(t * 0.05);   // cash level gently rises/settles
    cube(0.3, 1.55, 1.55 + lvl, '#2e8f48', '#2e8f48', '#247a3a', '#1c5e2c');   // green cash mass
    // stacked-bill banding lines on the cash
    ctx.strokeStyle = hexA('#0c3a1c', 0.6); ctx.lineWidth = 1;
    for (let i = 1; i <= 3; i++) { const z = 1.55 + lvl * (i / 4); ctx.beginPath(); ctx.moveTo(...(P(-0.3, 0.3, z) as [number, number])); ctx.lineTo(...(P(0.3, 0.3, z) as [number, number])); ctx.stroke(); }
    ctx.fillStyle = hexA('#bff0cf', 0.7); for (let i = 0; i < 4; i++) { const c = P(-0.18 + (i % 2) * 0.2, 0.18, 1.6 + (i * 0.12) % lvl); ctx.beginPath(); ctx.arc(c[0], c[1], 2, 0, Math.PI * 2); ctx.fill(); }   // $ specks
    // glass case (translucent over the cash)
    cube(0.36, 1.5, 3.3, 'rgba(190,225,245,0.16)', 'rgba(150,195,225,0.16)', 'rgba(175,210,235,0.2)', 'rgba(150,195,225,0.08)');
    // bright glass edges + a glint
    ctx.strokeStyle = hexA('#dff2ff', 0.55); ctx.lineWidth = 1.2;
    const e = [P(-0.36, 0.36, 3.3), P(0.36, 0.36, 3.3), P(0.36, -0.36, 3.3), P(0.36, 0.36, 1.5)];
    ctx.beginPath(); ctx.moveTo(e[0][0], e[0][1]); ctx.lineTo(e[1][0], e[1][1]); ctx.lineTo(e[2][0], e[2][1]); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(e[1][0], e[1][1]); ctx.lineTo(e[3][0], e[3][1]); ctx.stroke();
    const g0 = P(0.12, 0.36, 3.1), g1 = P(0.24, 0.36, 2.2); ctx.strokeStyle = hexA('#ffffff', 0.5); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(g0[0], g0[1]); ctx.lineTo(g1[0], g1[1]); ctx.stroke();
    if (faceVisible(0, 1, dir)) { const mk = P(0, 0.36, 3.55); ctx.fillStyle = hexA(accent, 0.9); ctx.beginPath(); ctx.arc(mk[0], mk[1], 6, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#1a1a22'; ctx.font = '900 8px Helvetica'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('₩', mk[0], mk[1] + 0.5); ctx.textBaseline = 'alphabetic'; }
  });
};
// Pac-Man-style upright arcade cabinet — yellow body, a maze screen (pac + dots + ghost), joystick + coin slot.
const drawPacman = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, t: number, dir: number) => {
  const m = base, cT = shade(m, 1.22), cR = shade(m, 0.9), cL = shade(m, 0.55);
  const parts: IsoPart[] = [
    { u0: -0.34, u1: 0.34, v0: -0.26, v1: 0.26, z0: 0, z1: 2.15, t: cT, r: cR, l: cL },     // cabinet body
    { u0: -0.36, u1: 0.36, v0: -0.28, v1: 0.28, z0: 2.15, z1: 2.5, t: shade(m, 1.3), r: cR, l: cL },   // marquee
  ];
  drawParts(ctx, sx, sy, dir, 0, 0, parts, (P) => {
    if (!faceVisible(0, 1, dir)) return;   // all the art lives on the front face
    const F = 0.27;   // front plane (v)
    // screen
    poly(ctx, [P(-0.26, F, 2.05), P(0.26, F, 2.05), P(0.26, F, 1.4), P(-0.26, F, 1.4)], '#05060a');
    poly(ctx, [P(-0.24, F, 2.0), P(0.24, F, 2.0), P(0.24, F, 1.45), P(-0.24, F, 1.45)], '#0a0e2a');
    // pac-man centred on screen, slow wide chomp
    const chomp = 0.65 * Math.abs(Math.sin(t * 0.06));
    const pac = P(0, F, 1.72); ctx.fillStyle = '#ffe23a'; ctx.beginPath(); ctx.arc(pac[0], pac[1], 4, chomp, Math.PI * 2 - chomp); ctx.lineTo(pac[0], pac[1]); ctx.closePath(); ctx.fill();
    // control panel + joystick + buttons
    poly(ctx, [P(-0.26, F, 1.32), P(0.26, F, 1.32), P(0.26, F, 1.1), P(-0.26, F, 1.1)], shade(m, 0.78));
    const js = P(-0.1, F, 1.22); ctx.strokeStyle = '#15171b'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(js[0], js[1] + 3); ctx.lineTo(js[0], js[1] - 3); ctx.stroke(); ctx.fillStyle = '#e0457b'; ctx.beginPath(); ctx.arc(js[0], js[1] - 4, 2.5, 0, Math.PI * 2); ctx.fill();
    for (const [u, col] of [[0.06, '#ff5a5a'], [0.16, '#3a7bd0']] as [number, string][]) { const b = P(u, F, 1.22); ctx.fillStyle = col; ctx.beginPath(); ctx.arc(b[0], b[1], 2.2, 0, Math.PI * 2); ctx.fill(); }
    const coin = P(0, F, 0.55); ctx.fillStyle = '#15171b'; ctx.fillRect(coin[0] - 3, coin[1] - 5, 6, 10);   // coin door
    // marquee band — iso front face
    poly(ctx, [P(-0.36, F, 2.5), P(0.36, F, 2.5), P(0.36, F, 2.15), P(-0.36, F, 2.15)], hexA(accent, 0.85));
  });
};
// Red-and-yellow retro upright arcade cabinet with animated space-invaders screen.
const drawRetroArcadeCab = (ctx: CanvasRenderingContext2D, sx: number, sy: number, _accent: string, _base: string, t: number, dir: number) => {
  void _accent; void _base;
  const red = '#cc1a0a', yellow = '#f5c518';
  const cT = shade(red, 1.22), cR = shade(red, 0.9), cL = shade(red, 0.55);
  const parts: IsoPart[] = [
    { u0: -0.34, u1: 0.34, v0: -0.26, v1: 0.26, z0: 0,    z1: 2.15, t: cT, r: cR, l: cL },
    { u0: -0.37, u1: 0.37, v0: -0.28, v1: 0.28, z0: 2.15, z1: 2.55, t: shade(red, 1.28), r: shade(red, 0.94), l: shade(red, 0.6) },
  ];
  drawParts(ctx, sx, sy, dir, 0, 0, parts, (P) => {
    if (!faceVisible(0, 1, dir)) return;
    const F = 0.27;
    // screen bezel + glass
    poly(ctx, [P(-0.26, F, 2.06), P(0.26, F, 2.06), P(0.26, F, 1.37), P(-0.26, F, 1.37)], '#1a0800');
    poly(ctx, [P(-0.23, F, 2.01), P(0.23, F, 2.01), P(0.23, F, 1.41), P(-0.23, F, 1.41)], '#050810');
    // scanlines
    ctx.save(); ctx.globalAlpha = 0.07;
    for (let r = 0; r < 9; r++) { const z = 1.42 + r * 0.065; poly(ctx, [P(-0.22, F, z), P(0.22, F, z), P(0.22, F, z+0.038), P(-0.22, F, z+0.038)], '#ffffff'); }
    ctx.restore();
    // space-invader grid (2 rows × 4 cols, alternating yellow/orange blink)
    const invColors = ['#f5c518', '#ff7718'];
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 4; col++) {
        const blink = ((t >> 4) + col + row) % 2 === 0;
        const inv = P(-0.16 + col * 0.105, F, 1.94 - row * 0.15);
        ctx.fillStyle = blink ? invColors[row % 2] : shade(invColors[row % 2], 0.5);
        ctx.fillRect(inv[0] - 3, inv[1] - 2, 5, 3);
        ctx.fillRect(inv[0] - 4, inv[1] + 1, 2, 2);
        ctx.fillRect(inv[0] + 2, inv[1] + 1, 2, 2);
      }
    }
    // player ship at bottom of screen, drifts left/right
    const shipU = 0.0 + Math.sin(t * 0.03) * 0.12;
    const ship = P(shipU, F, 1.47);
    ctx.fillStyle = '#44ff88';
    ctx.fillRect(ship[0] - 3, ship[1] - 2, 6, 3);
    ctx.fillRect(ship[0] - 1, ship[1] - 4, 2, 2);
    // laser bolt
    if ((t % 36) < 18) {
      const prog = (t % 36) / 36;
      const lz = 1.47 + prog * 0.5;
      const bolt = P(shipU, F, lz);
      ctx.fillStyle = yellow;
      ctx.fillRect(bolt[0] - 0.8, bolt[1] - 4, 1.6, 5);
    }
    // score line at top of screen
    const sc = P(0, F, 1.99);
    ctx.fillStyle = yellow; ctx.font = '600 5px monospace'; ctx.textAlign = 'center';
    ctx.fillText(`${String(((t >> 3) % 1000)).padStart(5, '0')}`, sc[0], sc[1] - 1);
    // control panel
    poly(ctx, [P(-0.26, F, 1.29), P(0.26, F, 1.29), P(0.26, F, 1.09), P(-0.26, F, 1.09)], shade(red, 0.72));
    // joystick
    const js = P(-0.12, F, 1.20);
    ctx.strokeStyle = '#1a0800'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(js[0], js[1] + 3); ctx.lineTo(js[0], js[1] - 3); ctx.stroke();
    ctx.fillStyle = yellow; ctx.beginPath(); ctx.arc(js[0], js[1] - 3, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = shade(yellow, 1.3); ctx.beginPath(); ctx.arc(js[0] - 1, js[1] - 4, 1.2, 0, Math.PI * 2); ctx.fill();
    // buttons (three yellow, one orange accent)
    for (const [u, col] of [[0.04, yellow], [0.12, yellow], [0.20, '#ff8c00']] as [number, string][]) {
      const b = P(u, F, 1.20);
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(b[0], b[1], 2.6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = shade(col, 1.35); ctx.beginPath(); ctx.arc(b[0] - 0.8, b[1] - 0.8, 1, 0, Math.PI * 2); ctx.fill();
    }
    // coin door slot
    const coin = P(0, F, 0.54);
    ctx.fillStyle = '#1a0800'; ctx.fillRect(coin[0] - 5, coin[1] - 7, 10, 14);
    ctx.fillStyle = shade(red, 0.58); ctx.fillRect(coin[0] - 4, coin[1] - 1, 8, 2);
    // marquee band — iso front face of the marquee box
    poly(ctx, [P(-0.37, F, 2.55), P(0.37, F, 2.55), P(0.37, F, 2.15), P(-0.37, F, 2.15)], red);
  });
};
const drawArcadeSign = (ctx: CanvasRenderingContext2D, sx: number, sy: number, _a: string, _b: string, t: number, dir: number) => {
  void _a; void _b;
  const red = '#c41a0c', yel = '#f4c518', cream = '#fef0c0', blk = '#06040c';
  // full tile width; pushed to back edge so front face (+v) points toward tile centre
  const u0 = -0.48, u1 = 0.48, v0 = -0.48, v1 = -0.38, zBot = 0.52, zTop = 3.0;
  const parts: IsoPart[] = [{ u0, u1, v0, v1, z0: zBot, z1: zTop, t: '#141018', r: shade(yel, 0.86), l: shade(red, 0.62) }];
  drawParts(ctx, sx, sy, dir, 0, 0, parts, (P) => {
    if (!faceVisible(0, 1, dir)) return;
    // red panel background
    poly(ctx, [P(u0, v1, zTop), P(u1, v1, zTop), P(u1, v1, zBot), P(u0, v1, zBot)], red);
    // black border frame
    const bz = 0.10, bu = 0.045;
    poly(ctx, [P(u0, v1, zTop),       P(u1, v1, zTop),       P(u1, v1, zTop - bz),  P(u0, v1, zTop - bz)],  blk);
    poly(ctx, [P(u0, v1, zBot + bz),  P(u1, v1, zBot + bz),  P(u1, v1, zBot),        P(u0, v1, zBot)],       blk);
    poly(ctx, [P(u0, v1, zTop),       P(u0 + bu, v1, zTop),  P(u0 + bu, v1, zBot),   P(u0, v1, zBot)],       blk);
    poly(ctx, [P(u1 - bu, v1, zTop),  P(u1, v1, zTop),       P(u1, v1, zBot),        P(u1 - bu, v1, zBot)],  blk);
    // white inner accent line under top bar
    poly(ctx, [P(u0 + bu, v1, zTop - bz), P(u1 - bu, v1, zTop - bz), P(u1 - bu, v1, zTop - bz - 0.022), P(u0 + bu, v1, zTop - bz - 0.022)], '#ffffff');
    // "ARCADE" text vertically — centred on full inner panel, inset enough so A and E clear the border bars
    ctx.save();
    ctx.font = '900 8px Arial,Helvetica,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const arcUc = (u0 + bu + u1 - bu) / 2, arcZT = zTop - bz - 0.22, arcZB = zBot + bz + 0.22;
    const arcStep = (arcZT - arcZB) / 5;
    for (let i = 0; i < 6; i++) {
      const pt = P(arcUc, v1, arcZT - i * arcStep);
      ctx.fillStyle = blk; ctx.fillText('ARCADE'[i], pt[0] + 0.7, pt[1] + 0.6);
      ctx.fillStyle = cream; ctx.fillText('ARCADE'[i], pt[0], pt[1]);
    }
    ctx.restore();
    // dot-bulb border (chaser animation)
    const ph = Math.floor(t / 8) % 4, dr = 2.0;
    const uRange = u1 - bu - (u0 + bu + 0.02);
    for (let i = 0; i < 7; i++) {  // top row
      const pt = P(u0 + bu + 0.01 + i * uRange / 6, v1, zTop - bz * 0.52);
      ctx.fillStyle = (i + ph) % 2 === 0 ? yel : '#7a6010';
      ctx.beginPath(); ctx.arc(pt[0], pt[1], dr, 0, Math.PI * 2); ctx.fill();
    }
    for (let i = 0; i < 7; i++) {  // bottom row
      const pt = P(u0 + bu + 0.01 + i * uRange / 6, v1, zBot + bz * 0.52);
      ctx.fillStyle = (i + ph + 1) % 2 === 0 ? yel : '#7a6010';
      ctx.beginPath(); ctx.arc(pt[0], pt[1], dr, 0, Math.PI * 2); ctx.fill();
    }
    const zRange = zTop - bz - 0.02 - (zBot + bz + 0.02);
    for (let i = 0; i < 10; i++) {  // right column
      const pt = P(u1 - bu * 0.5, v1, zTop - bz - 0.01 - i * zRange / 9);
      ctx.fillStyle = (i + ph + 2) % 2 === 0 ? yel : '#7a6010';
      ctx.beginPath(); ctx.arc(pt[0], pt[1], dr, 0, Math.PI * 2); ctx.fill();
    }
    for (let i = 0; i < 10; i++) {  // left column
      const pt = P(u0 + bu * 0.5, v1, zTop - bz - 0.01 - i * zRange / 9);
      ctx.fillStyle = (i + ph) % 2 === 0 ? yel : '#7a6010';
      ctx.beginPath(); ctx.arc(pt[0], pt[1], dr, 0, Math.PI * 2); ctx.fill();
    }
  });
};
const drawNeonSignArcade = (ctx: CanvasRenderingContext2D, sx: number, sy: number, _a: string, _b: string, t: number, dir: number) => {
  void _a; void _b;
  // left edge flush with tile boundary; extends ~4 tiles to the right
  const u0 = -0.55, u1 = 3.42, v0 = -0.48, v1 = -0.38, zBot = 0.15, zTop = 1.85;
  const P = proj(sx, sy, dir);
  const bkDark = '#04050e';
  if (faceVisible(1, 0, dir)) poly(ctx, [P(u1, v0, zTop), P(u1, v1, zTop), P(u1, v1, zBot), P(u1, v0, zBot)], bkDark);
  if (!faceVisible(0, 1, dir)) return;
  poly(ctx, [P(u0, v1, zTop), P(u1, v1, zTop), P(u1, v1, zBot), P(u0, v1, zBot)], bkDark);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  // Blue neon border
  const blue = '#2244dd';
  const pad = 0.06, zpad = 0.09;
  const borderPts = (): [number, number][] => [
    P(u0 + pad, v1, zTop - zpad), P(u1 - pad, v1, zTop - zpad),
    P(u1 - pad, v1, zBot + zpad), P(u0 + pad, v1, zBot + zpad),
  ] as [number, number][];
  const strokeFrame = (lw: number, color: string, blur: number) => {
    const pts = borderPts();
    ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.shadowColor = blue; ctx.shadowBlur = blur;
    ctx.beginPath(); pts.forEach((p, i) => i === 0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1])); ctx.closePath(); ctx.stroke();
  };
  strokeFrame(3.5, hexA(blue, 0.7), 18);
  strokeFrame(1.4, 'rgba(160,185,255,0.6)', 6);
  // Red-pink neon "ARCADE" letters
  const nRed = '#ff1833';
  const flicker = 0.88 + 0.12 * Math.abs(Math.sin(t * 0.07));
  ctx.font = '900 italic 14px Arial,Helvetica,sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const zMid = (zBot + zTop) / 2;
  const iU0 = u0 + 0.22, iU1 = u1 - 0.22;
  const lStep = (iU1 - iU0) / 6;
  for (let i = 0; i < 6; i++) {
    const u = iU0 + (i + 0.5) * lStep;
    const [px, py] = P(u, v1, zMid);
    ctx.shadowColor = nRed; ctx.shadowBlur = 22 * flicker;
    ctx.fillStyle = hexA(nRed, 0.35 * flicker); ctx.fillText('ARCADE'[i], px, py);
    ctx.shadowBlur = 11 * flicker;
    ctx.fillStyle = hexA('#ff4455', 0.75 * flicker); ctx.fillText('ARCADE'[i], px, py);
    ctx.shadowBlur = 3;
    ctx.fillStyle = hexA('#ffbcc4', Math.min(1, flicker)); ctx.fillText('ARCADE'[i], px, py);
  }
  ctx.restore();
};
const drawPinball = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  const m = base, cT = shade(m, 1.2), cR = shade(m, 0.9), cL = shade(m, 0.56);
  const parts: IsoPart[] = [...legs([[-0.3, -0.5], [0.3, -0.5], [-0.3, 0.5], [0.3, 0.5]], 0.55).map(p => ({ ...p, t: cT, r: cR, l: cL })), { u0: -0.36, u1: 0.36, v0: -0.6, v1: 0.6, z0: 0.55, z1: 0.72, t: cT, r: cR, l: cL }, { u0: -0.36, u1: 0.36, v0: -0.66, v1: -0.5, z0: 0.72, z1: 1.8, t: cT, r: cR, l: cL }];
  drawParts(ctx, sx, sy, dir, 0, 0, parts, (P) => {
    const z = 0.72; poly(ctx, [P(-0.32, -0.55, z), P(0.32, -0.55, z), P(0.32, 0.55, z), P(-0.32, 0.55, z)], shade(m, 1.5));
    ctx.fillStyle = hexA(accent, 0.85); for (const [u, v] of [[-0.12, -0.2], [0.14, -0.1], [0, 0.0]] as [number, number][]) { const c = P(u, v, z); ctx.beginPath(); ctx.arc(c[0], c[1], 4, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#fff'; for (const u of [-0.12, 0.12]) { const c = P(u, 0.42, z); ctx.fillRect(c[0] - 5, c[1] - 1.5, 10, 3); }
    if (faceVisible(0, 1, dir)) { poly(ctx, [P(-0.32, -0.5, 1.75), P(0.32, -0.5, 1.75), P(0.32, -0.5, 0.8), P(-0.32, -0.5, 0.8)], hexA(accent, 0.5)); }
  });
};
const drawAirHockey = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  void accent; const m = base, cT = shade(m, 1.2), cR = shade(m, 0.9), cL = shade(m, 0.56);
  const parts: IsoPart[] = [...legs([[-0.7, -0.3], [0.7, -0.3], [-0.7, 0.3], [0.7, 0.3]], 0.55).map(p => ({ ...p, t: '#2a2e36', r: '#22252c', l: '#15171b' })), { u0: -0.85, u1: 0.85, v0: -0.4, v1: 0.4, z0: 0.55, z1: 0.7, t: cT, r: cR, l: cL }];
  drawParts(ctx, sx, sy, dir, 0, 0, parts, (P) => {
    const z = 0.7; poly(ctx, [P(-0.78, -0.34, z), P(0.78, -0.34, z), P(0.78, 0.34, z), P(-0.78, 0.34, z)], '#e8f0f6');
    ctx.strokeStyle = hexA(m, 0.8); ctx.lineWidth = 1.5; const a = P(0, -0.34, z), b = P(0, 0.34, z); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); const cc = P(0, 0, z); ctx.beginPath(); ctx.arc(cc[0], cc[1], 8, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#1a1a1f'; for (const u of [-0.78, 0.78]) { const g = P(u, 0, z); ctx.fillRect(g[0] - 2, g[1] - 8, 4, 16); }
    const puck = P(0.2, 0.05, z); ctx.fillStyle = '#1a1a1f'; ctx.beginPath(); ctx.arc(puck[0], puck[1], 2.5, 0, Math.PI * 2); ctx.fill();
    for (const [u, col] of [[-0.5, '#b3242e'], [0.5, '#caa24a']] as [number, string][]) { const mp = P(u, -0.1, z); ctx.fillStyle = col; ctx.beginPath(); ctx.arc(mp[0], mp[1], 5, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = shade(col, 1.4); ctx.beginPath(); ctx.arc(mp[0], mp[1], 2, 0, Math.PI * 2); ctx.fill(); }
  });
};
const drawToyChest = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  void accent; const wood = base, cT = shade(wood, 1.2), cR = shade(wood, 0.9), cL = shade(wood, 0.56);
  const parts: IsoPart[] = [{ u0: -0.45, u1: 0.45, v0: -0.3, v1: 0.3, z0: 0, z1: 0.7, t: cT, r: cR, l: cL }];
  drawParts(ctx, sx, sy, dir, 0, 0, parts, (P) => {
    const z = 0.7; poly(ctx, [P(-0.45, -0.3, z), P(0.45, -0.3, z), P(0.45, 0.3, z), P(-0.45, 0.3, z)], shade(wood, 1.3));
    const cols = ['#b3242e', '#caa24a', '#3a7bd0', '#2e7d4a']; for (let i = 0; i < 4; i++) { const c = P(-0.3 + i * 0.2, 0.0, z + 0.05); ctx.fillStyle = cols[i]; ctx.beginPath(); ctx.arc(c[0], c[1], 5, 0, Math.PI * 2); ctx.fill(); }
    if (faceVisible(0, 1, dir)) { const l = P(0, 0.3, 0.4); ctx.fillStyle = '#caa24a'; ctx.fillRect(l[0] - 4, l[1] - 4, 8, 8); const f = P(0, 0.3, 0.5); ctx.fillStyle = hexA('#fff', 0.85); ctx.font = '900 9px Helvetica'; ctx.textAlign = 'center'; ctx.fillText('TOYS', f[0], f[1]); }
  });
};

// ═══════════ CAFÉ / BAR ═══════════
const drawPastryCase = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  void accent; const m = base, cT = shade(m, 1.18), cR = shade(m, 0.92), cL = shade(m, 0.56);
  const parts: IsoPart[] = [{ u0: -0.7, u1: 0.7, v0: -0.28, v1: 0.28, z0: 0, z1: 0.7, t: cT, r: cR, l: cL }];
  drawParts(ctx, sx, sy, dir, 0, 0, parts, (P) => {
    poly(ctx, [P(-0.66, -0.24, 0.85), P(0.66, -0.24, 0.85), P(0.66, 0.24, 0.85), P(-0.66, 0.24, 0.85)], shade(m, 1.3));
    const cols = ['#f4b8d0', '#a9713f', '#caa24a', '#f3ead6']; for (let i = 0; i < 4; i++) { const c = P(-0.45 + i * 0.3, 0.0, 0.85); ctx.fillStyle = cols[i]; ctx.beginPath(); ctx.ellipse(c[0], c[1] - 3, 9, 5, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = shade(cols[i], 1.3); ctx.beginPath(); ctx.ellipse(c[0], c[1] - 6, 9, 4, 0, 0, Math.PI * 2); ctx.fill(); }
    poly(ctx, [P(-0.66, 0.26, 1.25), P(0.66, 0.26, 1.25), P(0.66, 0.26, 0.72), P(-0.66, 0.26, 0.72)], 'rgba(200,225,240,0.16)');
    poly(ctx, [P(-0.66, -0.26, 1.25), P(0.66, -0.26, 1.25), P(0.66, 0.26, 1.25), P(-0.66, 0.26, 1.25)], 'rgba(220,235,245,0.1)');
  });
};
const drawWineRack = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  void accent; const wood = base, cT = shade(wood, 1.18), cR = shade(wood, 0.92), cL = shade(wood, 0.56);
  const parts: IsoPart[] = [{ u0: -0.4, u1: 0.4, v0: -0.25, v1: 0.25, z0: 0, z1: 1.6, t: cT, r: cR, l: cL }];
  drawParts(ctx, sx, sy, dir, 0, 0, parts, (P) => {
    if (!faceVisible(0, 1, dir)) return;
    const wc = ['#5a1020', '#3a2410', '#2a3a1a']; for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) { const e = P(-0.28 + c * 0.185, 0.25, 0.25 + r * 0.34); ctx.fillStyle = hexA('#000', 0.4); ctx.beginPath(); ctx.arc(e[0], e[1], 6, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = wc[(r + c) % 3]; ctx.beginPath(); ctx.arc(e[0], e[1], 4.5, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#caa24a'; ctx.beginPath(); ctx.arc(e[0], e[1], 1.5, 0, Math.PI * 2); ctx.fill(); }
  });
};
const drawKegTap = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  void accent; const m = base;
  const parts: IsoPart[] = [{ u0: -0.3, u1: 0.3, v0: -0.25, v1: 0.25, z0: 0, z1: 0.7, t: shade(m, 1.0), r: shade(m, 0.85), l: shade(m, 0.6) }];
  drawParts(ctx, sx, sy, dir, 0, 0, parts, (P) => {
    const top = P(0, 0, 0.7); ctx.fillStyle = shade(m, 1.25); ctx.beginPath(); ctx.ellipse(top[0], top[1], TW * 0.3, TH * 0.3, 0, 0, Math.PI * 2); ctx.fill();
    const tw = P(0, 0, 1.3), tb = P(0, 0, 0.7); ctx.fillStyle = '#cfd6e2'; ctx.fillRect(tb[0] - 3, tw[1], 6, tb[1] - tw[1]);
    if (faceVisible(0, 1, dir)) for (const u of [-0.06, 0.06]) { const h = P(u, 0.1, 1.05); ctx.fillStyle = '#b3242e'; ctx.fillRect(h[0] - 2, h[1] - 8, 4, 8); const sp = P(u, 0.16, 0.88); ctx.fillStyle = '#888f9e'; ctx.fillRect(sp[0] - 1.5, sp[1], 3, 5); }
  });
};
const drawCocktailCart = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  void accent; const m = base;
  const parts: IsoPart[] = [
    ...legs([[-0.5, -0.18], [0.5, -0.18], [-0.5, 0.18], [0.5, 0.18]], 0.7).map(p => ({ ...p, t: shade(m, 1.0), r: shade(m, 0.8), l: shade(m, 0.5) })),
    { u0: -0.55, u1: 0.55, v0: -0.22, v1: 0.22, z0: 0.32, z1: 0.4, t: shade(m, 1.2), r: shade(m, 0.9), l: shade(m, 0.6) },
    { u0: -0.55, u1: 0.55, v0: -0.22, v1: 0.22, z0: 0.7, z1: 0.78, t: shade(m, 1.2), r: shade(m, 0.9), l: shade(m, 0.6) }];
  drawParts(ctx, sx, sy, dir, 0, 0, parts, (P) => {
    const cols = ['#2e7d4a', '#b3242e', '#caa24a', '#3a7bd0']; for (let i = 0; i < 4; i++) { const c = P(-0.4 + i * 0.22, 0.0, 0.78); ctx.fillStyle = cols[i]; ctx.fillRect(c[0] - 2, c[1] - 13, 4, 13); ctx.fillStyle = '#caa24a'; ctx.fillRect(c[0] - 1, c[1] - 16, 2, 3); }
    for (let i = 0; i < 3; i++) { const c = P(-0.3 + i * 0.3, 0.0, 0.4); ctx.strokeStyle = 'rgba(220,235,245,0.7)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(c[0] - 3, c[1] - 8); ctx.lineTo(c[0] - 2, c[1]); ctx.lineTo(c[0] + 2, c[1]); ctx.lineTo(c[0] + 3, c[1] - 8); ctx.stroke(); }
    for (const u of [-0.5, 0.5]) { const w = P(u, 0.18, 0); ctx.fillStyle = '#1a1a1f'; ctx.beginPath(); ctx.arc(w[0], w[1] + 2, 3, 0, Math.PI * 2); ctx.fill(); }
  });
};
const drawCoffeeBar = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  const m = base, cT = shade(m, 1.18), cR = shade(m, 0.92), cL = shade(m, 0.56), top = '#3a2a1a';
  const parts: IsoPart[] = [{ u0: -0.85, u1: 0.85, v0: -0.2, v1: 0.34, z0: 0, z1: 1.0, t: cT, r: cR, l: cL }];
  drawParts(ctx, sx, sy, dir, 0, 0, parts, (P) => {
    const z = 1.0; poly(ctx, [P(-0.9, -0.26, z), P(0.9, -0.26, z), P(0.9, 0.4, z), P(-0.9, 0.4, z)], shade(top, 1.3)); poly(ctx, [P(-0.9, 0.4, z), P(0.9, 0.4, z), P(0.9, 0.4, z - 0.1), P(-0.9, 0.4, z - 0.1)], shade(top, 0.8));
    const e = P(-0.4, 0.0, z); ctx.fillStyle = '#c8ccd4'; ctx.fillRect(e[0] - 14, e[1] - 22, 28, 22); ctx.fillStyle = hexA(accent, 0.7); ctx.fillRect(e[0] - 12, e[1] - 20, 24, 3); ctx.fillStyle = '#2a2a30'; ctx.fillRect(e[0] - 3, e[1] - 8, 6, 8);
    for (let i = 0; i < 3; i++) { const c = P(0.3, 0.05, z); ctx.fillStyle = '#efe9dd'; ctx.fillRect(c[0] - 5, c[1] - 4 - i * 4, 10, 4); }
    if (faceVisible(0, 1, dir)) { const s = P(0, 0.4, 0.6); ctx.fillStyle = '#1a1a14'; ctx.fillRect(s[0] - 18, s[1] - 14, 36, 24); ctx.fillStyle = hexA('#fff', 0.7); ctx.font = '900 6px Helvetica'; ctx.textAlign = 'center'; ctx.fillText('COFFEE', s[0], s[1] - 2); }
  });
};
const drawBistro = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  void accent; void dir; const m = base, legH = STACK_H * 0.85, top = sy - legH;
  ctx.strokeStyle = shade(m, 0.8); ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx, top); ctx.stroke();
  ctx.fillStyle = shade(m, 0.7); ctx.beginPath(); ctx.ellipse(sx, sy, 10, 5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = shade(m, 0.6); ctx.beginPath(); ctx.ellipse(sx, top + 3, TW * 0.5, TH * 0.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = shade(m, 1.2); ctx.beginPath(); ctx.ellipse(sx, top, TW * 0.5, TH * 0.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = hexA('#fff', 0.15); ctx.lineWidth = 1; ctx.stroke();
};

// ═══════════ SCI-FI / NEON ═══════════
const drawHoloPod = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, t: number, dir: number) => {
  void base; void dir; const c = accent;
  ctx.fillStyle = '#2a2e36'; ctx.beginPath(); ctx.ellipse(sx, sy, TW * 0.5, TH * 0.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = hexA(c, 0.8); ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(sx, sy - 2, TW * 0.4, TH * 0.4, 0, 0, Math.PI * 2); ctx.stroke();
  for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2 + t * 0.02; ctx.fillStyle = hexA(c, 0.9); ctx.beginPath(); ctx.arc(sx + Math.cos(a) * TW * 0.4, sy - 2 + Math.sin(a) * TH * 0.4, 2, 0, Math.PI * 2); ctx.fill(); }
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; const g = ctx.createLinearGradient(sx, sy, sx, sy - STACK_H * 2); g.addColorStop(0, hexA(c, 0.3)); g.addColorStop(1, hexA(c, 0)); ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(sx - TW * 0.35, sy - 2); ctx.lineTo(sx - 10, sy - STACK_H * 2); ctx.lineTo(sx + 10, sy - STACK_H * 2); ctx.lineTo(sx + TW * 0.35, sy - 2); ctx.closePath(); ctx.fill();
  const hy = sy - STACK_H * 1.5; ctx.strokeStyle = hexA(c, 0.8); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(sx, hy, 12, 0, Math.PI * 2); ctx.stroke(); for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.ellipse(sx, hy, 12, 12 * Math.abs(Math.cos(i * 0.6 + t * 0.04)), 0, 0, Math.PI * 2); ctx.stroke(); } ctx.restore();
};
const drawTeleporter = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, t: number, dir: number) => {
  void base; void dir; const c = accent;
  ctx.fillStyle = '#1a1c22'; ctx.beginPath(); ctx.ellipse(sx, sy, TW * 0.85, TH * 0.85, 0, 0, Math.PI * 2); ctx.fill();
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 4; i++) { const ph = (t * 0.04 + i * 0.25) % 1; ctx.strokeStyle = hexA(c, (1 - ph) * 0.8); ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(sx, sy, TW * 0.8 * ph, TH * 0.8 * ph, 0, 0, Math.PI * 2); ctx.stroke(); }
  const g = ctx.createRadialGradient(sx, sy, 1, sx, sy, TW * 0.5); g.addColorStop(0, hexA(c, 0.7)); g.addColorStop(1, hexA(c, 0)); ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(sx, sy, TW * 0.5, TH * 0.5, 0, 0, Math.PI * 2); ctx.fill();
  const bg = ctx.createLinearGradient(sx, sy, sx, sy - STACK_H * 3); bg.addColorStop(0, hexA(c, 0.4)); bg.addColorStop(1, hexA(c, 0)); ctx.fillStyle = bg; ctx.fillRect(sx - TW * 0.3, sy - STACK_H * 3, TW * 0.6, STACK_H * 3); ctx.restore();
};
const drawNeonArch = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  void base; const P = proj(sx, sy, dir), c = accent;
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
  for (const u of [-1.1, 1.1]) { const b = P(u, 0, 0), top = P(u, 0, 2.6); ctx.shadowColor = c; ctx.shadowBlur = 10; ctx.strokeStyle = c; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(b[0], b[1]); ctx.lineTo(top[0], top[1]); ctx.stroke(); }
  const lt = P(-1.1, 0, 2.6), rt = P(1.1, 0, 2.6), ap = P(0, 0, 3.4); ctx.shadowColor = c; ctx.shadowBlur = 12; ctx.strokeStyle = c; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(lt[0], lt[1]); ctx.quadraticCurveTo(ap[0], ap[1] - 10, rt[0], rt[1]); ctx.stroke(); ctx.restore();
  ctx.strokeStyle = hexA('#fff', 0.7); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(lt[0], lt[1]); ctx.quadraticCurveTo(ap[0], ap[1] - 10, rt[0], rt[1]); ctx.stroke();
};
const drawPlasmaLamp = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, t: number, dir: number) => {
  void base; void dir; const c = accent;
  ctx.fillStyle = '#2a2e36'; ctx.beginPath(); ctx.ellipse(sx, sy, 12, 6, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#3a3e46'; ctx.fillRect(sx - 8, sy - 10, 16, 8);
  const cy = sy - STACK_H * 1.2, R = 16; ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(sx, cy, 1, sx, cy, R); g.addColorStop(0, hexA(c, 0.5)); g.addColorStop(1, hexA(c, 0.05)); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, cy, R, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = hexA(c, 0.9); ctx.lineWidth = 1.2; for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2 + t * 0.03, ex = sx + Math.cos(a) * R, ey = cy + Math.sin(a) * R; ctx.beginPath(); ctx.moveTo(sx, cy); ctx.quadraticCurveTo(sx + Math.cos(a + 0.5) * R * 0.5, cy + Math.sin(a + 0.5) * R * 0.5, ex, ey); ctx.stroke(); }
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(sx, cy, 3, 0, Math.PI * 2); ctx.fill(); ctx.restore(); ctx.strokeStyle = hexA('#fff', 0.2); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(sx, cy, R, 0, Math.PI * 2); ctx.stroke();
};
const drawConsole = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  const m = base, cT = shade(m, 1.3), cR = shade(m, 0.95), cL = shade(m, 0.6);
  const parts: IsoPart[] = [{ u0: -0.7, u1: 0.7, v0: -0.2, v1: 0.3, z0: 0, z1: 0.7, t: cT, r: cR, l: cL }];
  drawParts(ctx, sx, sy, dir, 0, 0, parts, (P) => {
    const z = 0.7; poly(ctx, [P(-0.7, -0.2, z), P(0.7, -0.2, z), P(0.7, 0.3, z), P(-0.7, 0.3, z)], shade(m, 1.5));
    for (let i = 0; i < 8; i++) { const b = P(-0.55 + i * 0.155, 0.15, z); ctx.fillStyle = hexA(accent, 0.8); ctx.beginPath(); ctx.arc(b[0], b[1], 2.5, 0, Math.PI * 2); ctx.fill(); }
    poly(ctx, [P(-0.6, -0.18, 1.5), P(0.6, -0.18, 1.5), P(0.6, -0.18, 0.7), P(-0.6, -0.18, 0.7)], '#0a1420'); poly(ctx, [P(-0.55, -0.18, 1.42), P(0.55, -0.18, 1.42), P(0.55, -0.18, 0.78), P(-0.55, -0.18, 0.78)], hexA(accent, 0.5));
    ctx.strokeStyle = hexA('#fff', 0.6); ctx.lineWidth = 1; const wy = P(0, -0.18, 1.1); ctx.beginPath(); for (let i = 0; i < 20; i++) { const x = wy[0] - 30 + i * 3, y = wy[1] + Math.sin(i * 0.8) * 5; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.stroke();
  });
};
const drawCryoPod = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  const m = base, cT = shade(m, 1.2), cR = shade(m, 0.92), cL = shade(m, 0.56);
  const parts: IsoPart[] = [{ u0: -0.3, u1: 0.3, v0: -0.22, v1: 0.22, z0: 0, z1: 2.2, t: cT, r: cR, l: cL }];
  drawParts(ctx, sx, sy, dir, 0, 0, parts, (P) => {
    if (!faceVisible(0, 1, dir)) return;
    poly(ctx, [P(-0.24, 0.22, 2.0), P(0.24, 0.22, 2.0), P(0.24, 0.22, 0.3), P(-0.24, 0.22, 0.3)], 'rgba(120,200,230,0.3)');
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; const c = P(0, 0.22, 1.1), g = ctx.createRadialGradient(c[0], c[1], 2, c[0], c[1], 22); g.addColorStop(0, hexA(accent, 0.4)); g.addColorStop(1, hexA(accent, 0)); ctx.fillStyle = g; ctx.fillRect(c[0] - 22, c[1] - 30, 44, 60); ctx.restore();
    const sl = P(0, 0.22, 0.4); ctx.fillStyle = hexA(accent, 0.9); ctx.beginPath(); ctx.arc(sl[0], sl[1], 2, 0, Math.PI * 2); ctx.fill();
  });
};

// ═══════════ BEACH / POOL ═══════════
const drawTikiBar = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  void accent; const bamb = base, cT = shade(bamb, 1.2), cR = shade(bamb, 0.9), cL = shade(bamb, 0.56);
  const parts: IsoPart[] = [{ u0: -0.85, u1: 0.85, v0: -0.16, v1: 0.34, z0: 0, z1: 1.2, t: cT, r: cR, l: cL }, { u0: -0.85, u1: -0.78, v0: -0.2, v1: -0.13, z0: 1.2, z1: 2.0, t: shade(bamb, 0.9), r: cR, l: cL }, { u0: 0.78, u1: 0.85, v0: -0.2, v1: -0.13, z0: 1.2, z1: 2.0, t: shade(bamb, 0.9), r: cR, l: cL }];
  drawParts(ctx, sx, sy, dir, 0, 0, parts, (P) => {
    if (faceVisible(0, 1, dir)) { ctx.strokeStyle = hexA('#000', 0.2); ctx.lineWidth = 1; for (let i = 0; i < 8; i++) { const u = -0.78 + i * 0.22, a = P(u, 0.34, 1.1), b = P(u, 0.34, 0.1); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); } }
    ctx.fillStyle = '#8a6a2a'; ctx.beginPath(); ctx.moveTo(P(-1.0, 0, 2.0)[0], P(-1.0, 0, 2.0)[1]); ctx.lineTo(P(0, -0.5, 2.0)[0], P(0, -0.5, 2.0)[1]); ctx.lineTo(P(1.0, 0, 2.0)[0], P(1.0, 0, 2.0)[1]); ctx.lineTo(P(0, 0.5, 2.0)[0], P(0, 0.5, 2.0)[1]); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#a07a30'; ctx.beginPath(); ctx.moveTo(P(-1.0, 0, 2.0)[0], P(-1.0, 0, 2.0)[1]); ctx.lineTo(P(0, 0, 2.5)[0], P(0, 0, 2.5)[1]); ctx.lineTo(P(1.0, 0, 2.0)[0], P(1.0, 0, 2.0)[1]); ctx.lineTo(P(0, 0.5, 2.0)[0], P(0, 0.5, 2.0)[1]); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = hexA('#5a3f18', 0.4); ctx.lineWidth = 1; for (let i = 0; i < 10; i++) { const u = -0.9 + i * 0.2, a = P(u, 0.3, 2.0), b = P(u, 0, 2.4); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
  });
};
const drawSurfRack = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  void accent; const m = base, cols = ['#3a7bd0', '#e07b1f', '#2e7d4a'];
  const parts: IsoPart[] = [{ u0: -0.4, u1: 0.4, v0: -0.08, v1: 0.08, z0: 0, z1: 0.2, t: shade(m, 1.1), r: shade(m, 0.9), l: shade(m, 0.6) }];
  drawParts(ctx, sx, sy, dir, 0, 0, parts, (P) => {
    for (let i = 0; i < 3; i++) { const u = -0.28 + i * 0.28, bot = P(u, 0.05, 0.2), top = P(u, -0.12, 2.0), mx = (bot[0] + top[0]) / 2, my = (bot[1] + top[1]) / 2, ang = Math.atan2(top[1] - bot[1], top[0] - bot[0]), len = Math.hypot(top[0] - bot[0], top[1] - bot[1]); ctx.save(); ctx.translate(mx, my); ctx.rotate(ang); ctx.fillStyle = cols[i]; ctx.beginPath(); ctx.ellipse(0, 0, len / 2, 7, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = hexA('#fff', 0.25); ctx.fillRect(-len / 2, -1, len, 1.5); ctx.restore(); }
  });
};
const drawLifeguard = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  void accent; const m = base, cT = shade(m, 1.2), cR = shade(m, 0.9), cL = shade(m, 0.56);
  const parts: IsoPart[] = [{ u0: -0.34, u1: -0.26, v0: -0.05, v1: 0.05, z0: 0, z1: 1.6, t: cT, r: cR, l: cL }, { u0: 0.26, u1: 0.34, v0: -0.05, v1: 0.05, z0: 0, z1: 1.6, t: cT, r: cR, l: cL }, { u0: -0.4, u1: 0.4, v0: -0.2, v1: 0.2, z0: 1.6, z1: 1.78, t: cT, r: cR, l: cL }, { u0: -0.4, u1: 0.4, v0: -0.22, v1: -0.14, z0: 1.78, z1: 2.4, t: cT, r: cR, l: cL }];
  drawParts(ctx, sx, sy, dir, 0, 0, parts, (P) => {
    const a = P(-0.3, 0, 0.2), b = P(0.3, 0, 1.0); ctx.strokeStyle = cL; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    const fp = P(0.4, -0.18, 2.4), ft = P(0.4, -0.18, 3.0); ctx.strokeStyle = '#888f9e'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(fp[0], fp[1]); ctx.lineTo(ft[0], ft[1]); ctx.stroke(); ctx.fillStyle = '#b3242e'; ctx.beginPath(); ctx.moveTo(ft[0], ft[1]); ctx.lineTo(ft[0] + 12, ft[1] + 3); ctx.lineTo(ft[0], ft[1] + 8); ctx.closePath(); ctx.fill();
  });
};
const drawBeachBall = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  void accent; void base; void dir; const R = 16, cy = sy - R * 0.6, cols = ['#fff', '#b3242e', '#caa24a', '#3a7bd0', '#2e7d4a', '#fff'];
  ctx.save(); ctx.globalAlpha = 0.2; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(sx, sy, R * 0.8, R * 0.4, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  for (let i = 0; i < 6; i++) { ctx.fillStyle = cols[i]; ctx.beginPath(); ctx.moveTo(sx, cy); ctx.arc(sx, cy, R, (i / 6) * Math.PI * 2, ((i + 1) / 6) * Math.PI * 2); ctx.closePath(); ctx.fill(); }
  ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.beginPath(); ctx.arc(sx - 5, cy - 5, 4, 0, Math.PI * 2); ctx.fill();
};
const drawHammock = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  void accent; const cloth = base, m = '#6a4a2c';
  const parts: IsoPart[] = [{ u0: -0.85, u1: -0.76, v0: -0.05, v1: 0.05, z0: 0, z1: 1.2, t: shade(m, 1.1), r: shade(m, 0.9), l: shade(m, 0.6) }, { u0: 0.76, u1: 0.85, v0: -0.05, v1: 0.05, z0: 0, z1: 1.2, t: shade(m, 1.1), r: shade(m, 0.9), l: shade(m, 0.6) }];
  drawParts(ctx, sx, sy, dir, 0, 0, parts, (P) => {
    const l = P(-0.8, 0, 1.1), r = P(0.8, 0, 1.1), mid = P(0, 0.05, 0.5);
    ctx.fillStyle = cloth; ctx.beginPath(); ctx.moveTo(l[0], l[1]); ctx.quadraticCurveTo(mid[0], mid[1] + 14, r[0], r[1]); ctx.quadraticCurveTo(mid[0], mid[1] + 22, l[0], l[1]); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = hexA('#fff', 0.3); ctx.lineWidth = 1.5; for (let i = 1; i < 6; i++) { const a = P(-0.8 + i * 0.27, 0.05, 0.5); ctx.beginPath(); ctx.moveTo(a[0], a[1] + 4); ctx.lineTo(a[0], a[1] + 16); ctx.stroke(); }
  });
};
const drawCooler = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  void accent; const m = base, cT = shade(m, 1.2), cR = shade(m, 0.9), cL = shade(m, 0.56);
  const parts: IsoPart[] = [{ u0: -0.4, u1: 0.4, v0: -0.28, v1: 0.28, z0: 0, z1: 0.5, t: cT, r: cR, l: cL }];
  drawParts(ctx, sx, sy, dir, 0, 0, parts, (P) => {
    poly(ctx, [P(-0.4, -0.28, 0.5), P(0.4, -0.28, 0.5), P(0.4, 0.0, 0.5), P(-0.4, 0.0, 0.5)], '#dfe6ee');
    poly(ctx, [P(-0.36, 0.0, 0.5), P(0.36, 0.0, 0.5), P(0.36, 0.24, 0.5), P(-0.36, 0.24, 0.5)], '#cfe6f0');
    const cols = ['#b3242e', '#caa24a', '#2e7d4a', '#fff']; for (let i = 0; i < 4; i++) { const c = P(-0.25 + i * 0.16, 0.1, 0.5); ctx.fillStyle = cols[i]; ctx.beginPath(); ctx.ellipse(c[0], c[1] - 3, 4, 2.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = shade(cols[i], 0.7); ctx.fillRect(c[0] - 4, c[1] - 3, 8, 3); }
    if (faceVisible(0, 1, dir)) { const h = P(0, 0.28, 0.3); ctx.strokeStyle = '#1a1a1f'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(h[0] - 8, h[1]); ctx.lineTo(h[0] + 8, h[1]); ctx.stroke(); }
  });
};

// ═══════════ GARAGE / WORKSHOP ═══════════
const drawWorkbench = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  void accent; const wood = base, cT = shade(wood, 1.2), cR = shade(wood, 0.92), cL = shade(wood, 0.56);
  const parts: IsoPart[] = [...legs([[-0.78, -0.22], [0.78, -0.22], [-0.78, 0.3], [0.78, 0.3]], 0.7).map(p => ({ ...p, t: cT, r: cR, l: cL })), { u0: -0.88, u1: 0.88, v0: -0.28, v1: 0.34, z0: 0.7, z1: 0.84, t: cT, r: cR, l: cL }, { u0: -0.88, u1: 0.88, v0: -0.32, v1: -0.26, z0: 0.84, z1: 1.7, t: shade(wood, 0.8), r: cR, l: cL }];
  drawParts(ctx, sx, sy, dir, 0, 0, parts, (P) => {
    const vz = P(0.6, 0.32, 0.84); ctx.fillStyle = '#3a3e46'; ctx.fillRect(vz[0] - 6, vz[1] - 8, 12, 8);
    const hm = P(0.1, 0.1, 0.84); ctx.fillStyle = '#5a3a22'; ctx.fillRect(hm[0] - 1, hm[1] - 1, 12, 2); ctx.fillStyle = '#3a3e46'; ctx.fillRect(hm[0] + 9, hm[1] - 3, 4, 6);
    if (faceVisible(0, 1, dir)) { ctx.fillStyle = hexA('#000', 0.2); for (let i = 0; i < 6; i++) { const p = P(-0.6 + i * 0.24, 0.34, 1.3); ctx.fillRect(p[0] - 1, p[1] - 8, 2, 8); } const w = P(-0.4, 0.34, 1.4); ctx.strokeStyle = '#9aa0ac'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(w[0], w[1]); ctx.lineTo(w[0], w[1] + 12); ctx.stroke(); }
  });
};
const drawToolCab = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  void accent; const m = base, cT = shade(m, 1.18), cR = shade(m, 0.92), cL = shade(m, 0.56);
  const parts: IsoPart[] = [{ u0: -0.36, u1: 0.36, v0: -0.28, v1: 0.28, z0: 0.12, z1: 1.5, t: cT, r: cR, l: cL }];
  drawParts(ctx, sx, sy, dir, 0, 0, parts, (P) => {
    for (const [u, v] of [[-0.3, 0.28], [0.3, 0.28]] as [number, number][]) { const w = P(u, v, 0); ctx.fillStyle = '#1a1a1f'; ctx.beginPath(); ctx.arc(w[0], w[1] + 2, 4, 0, Math.PI * 2); ctx.fill(); }
    if (!faceVisible(0, 1, dir)) return;
    for (let r = 0; r < 5; r++) { const z0 = 0.2 + r * 0.25, z1 = z0 + 0.2; poly(ctx, [P(-0.34, 0.28, z1), P(0.34, 0.28, z1), P(0.34, 0.28, z0), P(-0.34, 0.28, z0)], undefined, hexA('#000', 0.3), 1); const h = P(0, 0.28, (z0 + z1) / 2); ctx.fillStyle = '#cfd6e2'; ctx.fillRect(h[0] - 9, h[1] - 1.5, 18, 3); }
  });
};
const drawTireStack = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  void accent; void base; void dir;
  for (let i = 0; i < 4; i++) { const cy = sy - 2 - i * 9; ctx.fillStyle = i % 2 ? '#2a2a30' : '#22222a'; ctx.beginPath(); ctx.ellipse(sx, cy, TW * 0.55, TH * 0.55, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#15151a'; ctx.beginPath(); ctx.ellipse(sx, cy - 2, TW * 0.3, TH * 0.3, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#3a3a44'; ctx.beginPath(); ctx.ellipse(sx, cy - 2, TW * 0.18, TH * 0.18, 0, 0, Math.PI * 2); ctx.fill(); }
};
const drawGasPump = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  const m = base, cT = shade(m, 1.18), cR = shade(m, 0.92), cL = shade(m, 0.56);
  const parts: IsoPart[] = [{ u0: -0.26, u1: 0.26, v0: -0.2, v1: 0.2, z0: 0, z1: 1.8, t: cT, r: cR, l: cL }];
  drawParts(ctx, sx, sy, dir, 0, 0, parts, (P) => {
    const s = P(0, 0.2, 1.75); ctx.fillStyle = '#caa24a'; ctx.fillRect(s[0] - 12, s[1] - 6, 24, 8);
    if (!faceVisible(0, 1, dir)) return;
    const d = P(0, 0.2, 1.4); ctx.fillStyle = '#0a1420'; ctx.fillRect(d[0] - 12, d[1] - 10, 24, 14); ctx.fillStyle = hexA(accent, 0.7); ctx.font = '900 7px monospace'; ctx.textAlign = 'center'; ctx.fillText('$4.20', d[0], d[1] - 3);
    const n = P(0.26, 0.2, 0.9); ctx.strokeStyle = '#1a1a1f'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(n[0], n[1]); ctx.lineTo(n[0] + 4, n[1] + 10); ctx.stroke();
  });
};
const drawOilDrum = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  void accent; void dir; const m = base, w = TW * 0.42, h = STACK_H * 1.4, top = sy - h;
  const g = ctx.createLinearGradient(sx - w, 0, sx + w, 0); g.addColorStop(0, shade(m, 0.6)); g.addColorStop(0.5, shade(m, 1.2)); g.addColorStop(1, shade(m, 0.6));
  ctx.fillStyle = g; ctx.fillRect(sx - w, top, w * 2, h); ctx.fillStyle = shade(m, 0.7); ctx.beginPath(); ctx.ellipse(sx, sy, w, TH * 0.42, 0, 0, Math.PI); ctx.fill();
  ctx.strokeStyle = hexA('#000', 0.25); ctx.lineWidth = 2; for (const f of [0.25, 0.75]) { ctx.beginPath(); ctx.ellipse(sx, top + h * f, w, TH * 0.42, 0, 0, Math.PI); ctx.stroke(); }
  ctx.fillStyle = shade(m, 1.3); ctx.beginPath(); ctx.ellipse(sx, top, w, TH * 0.42, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = shade(m, 1.0); ctx.beginPath(); ctx.arc(sx - w * 0.4, top, 3, 0, Math.PI * 2); ctx.fill();
};
const drawWelder = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, t: number, dir: number) => {
  void accent; void base;
  const parts: IsoPart[] = [...legs([[-0.2, 0.0], [0.2, 0.0]], 0.1).map(p => ({ ...p, t: '#3a3e46', r: '#2a2e36', l: '#15171b' })), { u0: -0.24, u1: 0.24, v0: -0.1, v1: 0.1, z0: 0.08, z1: 0.2, t: '#3a3e46', r: '#2a2e36', l: '#15171b' }];
  drawParts(ctx, sx, sy, dir, 0, 0, parts, (P) => {
    for (const [u, col] of [[-0.1, '#2e7d4a'], [0.1, '#b3242e']] as [number, string][]) { const b = P(u, -0.04, 0.2); ctx.fillStyle = col; ctx.fillRect(b[0] - 5, b[1] - 30, 10, 30); ctx.fillStyle = shade(col, 1.3); ctx.beginPath(); ctx.ellipse(b[0], b[1] - 30, 5, 2.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#888f9e'; ctx.fillRect(b[0] - 2, b[1] - 34, 4, 4); }
    const sp = P(0.3, 0.1, 0); ctx.save(); ctx.globalCompositeOperation = 'lighter'; const fl = 0.5 + Math.abs(Math.sin(t * 0.4)) * 0.5, g = ctx.createRadialGradient(sp[0], sp[1], 1, sp[0], sp[1], 10 * fl); g.addColorStop(0, `rgba(180,220,255,${fl})`); g.addColorStop(1, 'rgba(180,220,255,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sp[0], sp[1], 10, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    ctx.strokeStyle = '#1a1a1f'; ctx.lineWidth = 1.5; const h = P(0.1, -0.04, 0.2); ctx.beginPath(); ctx.moveTo(h[0], h[1]); ctx.lineTo(sp[0], sp[1]); ctx.stroke();
  });
};

// ═══════════ FESTIVE / SEASONAL ═══════════
const drawXmasTree = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, t: number, dir: number) => {
  void accent; void dir; const grn = base, H = STACK_H * 2.4, cols = ['#b3242e', '#caa24a', '#3a7bd0', '#fff'];
  ctx.fillStyle = '#b3242e'; ctx.fillRect(sx - 8, sy - 10, 16, 10); ctx.fillStyle = '#8a1c24'; ctx.beginPath(); ctx.ellipse(sx, sy, 9, 3, 0, 0, Math.PI * 2); ctx.fill();
  for (let k = 0; k < 3; k++) { const baseY = sy - 10 - k * H * 0.28, w = TW * (0.7 - k * 0.18), ty = baseY - H * 0.4; ctx.fillStyle = shade(grn, 1.0 - k * 0.05); ctx.beginPath(); ctx.moveTo(sx - w, baseY); ctx.lineTo(sx, ty); ctx.lineTo(sx + w, baseY); ctx.closePath(); ctx.fill(); }
  for (let i = 0; i < 10; i++) { const a = i * 2.39917, r = TW * (0.15 + (i % 4) * 0.12), bx = sx + Math.cos(a) * r, by = sy - 20 - (i % 6) * 8, tw = 0.5 + 0.5 * Math.sin(t * 0.1 + i); ctx.fillStyle = hexA(cols[i % 4], 0.6 + tw * 0.4); ctx.beginPath(); ctx.arc(bx, by, 2.2, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = '#ffe65c'; ctx.save(); ctx.translate(sx, sy - 10 - 3 * H * 0.28 - 2); ctx.beginPath(); for (let i = 0; i < 10; i++) { const ang = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? 2.5 : 6, x = Math.cos(ang) * rr, y = Math.sin(ang) * rr; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.closePath(); ctx.fill(); ctx.restore();
};
const drawGiftPile = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  void accent; void base; void dir;
  const boxes: [number, number, number, string, string][] = [[-8, 2, 14, '#b3242e', '#caa24a'], [9, 0, 12, '#2e7d4a', '#fff'], [0, -10, 11, '#3a7bd0', '#caa24a']];
  for (const [ox, oy, s, col, rib] of boxes) { const bx = sx + ox, by = sy + oy; ctx.fillStyle = shade(col, 0.7); ctx.beginPath(); ctx.moveTo(bx - s, by - s * 0.5); ctx.lineTo(bx, by); ctx.lineTo(bx, by - s); ctx.lineTo(bx - s, by - s * 1.5); ctx.closePath(); ctx.fill(); ctx.fillStyle = shade(col, 0.9); ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + s, by - s * 0.5); ctx.lineTo(bx + s, by - s * 1.5); ctx.lineTo(bx, by - s); ctx.closePath(); ctx.fill(); ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(bx - s, by - s * 1.5); ctx.lineTo(bx, by - s); ctx.lineTo(bx + s, by - s * 1.5); ctx.lineTo(bx, by - s * 2); ctx.closePath(); ctx.fill(); ctx.fillStyle = rib; ctx.fillRect(bx - 1.5, by - s * 2 + 2, 3, s * 1.5); }
};
const drawSnowman = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  void accent; void base; void dir;
  ctx.save(); ctx.globalAlpha = 0.2; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(sx, sy, 14, 6, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  for (const [oy, r] of [[-8, 12], [-24, 9], [-38, 6]] as [number, number][]) { const c = sy + oy, g = ctx.createRadialGradient(sx - r * 0.3, c - r * 0.3, 2, sx, c, r); g.addColorStop(0, '#fff'); g.addColorStop(1, '#cdd6e0'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, c, r, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = '#1a1a1f'; ctx.beginPath(); ctx.arc(sx - 2, sy - 40, 1, 0, Math.PI * 2); ctx.arc(sx + 2, sy - 40, 1, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#e07b1f'; ctx.beginPath(); ctx.moveTo(sx, sy - 37); ctx.lineTo(sx + 7, sy - 36); ctx.lineTo(sx, sy - 35); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#1a1a1f'; for (const oy of [-26, -22, -18]) { ctx.beginPath(); ctx.arc(sx, sy + oy, 1, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = '#1a1a1f'; ctx.fillRect(sx - 7, sy - 44, 14, 2); ctx.fillRect(sx - 4, sy - 52, 8, 8);
  ctx.strokeStyle = '#6a4a2c'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(sx - 9, sy - 24); ctx.lineTo(sx - 18, sy - 30); ctx.moveTo(sx + 9, sy - 24); ctx.lineTo(sx + 18, sy - 30); ctx.stroke();
};
const drawPumpkin = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  void accent; void dir; const m = base, cy = sy - 9;
  ctx.save(); ctx.globalAlpha = 0.2; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(sx, sy, 14, 6, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  for (const [ox, r, sh] of [[-7, 9, 0.8], [7, 9, 0.8], [-3, 12, 1.05], [3, 12, 1.05], [0, 13, 1.2]] as [number, number, number][]) { ctx.fillStyle = shade(m, sh); ctx.beginPath(); ctx.ellipse(sx + ox, cy, r, 12, 0, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = '#3a5a28'; ctx.fillRect(sx - 2, cy - 14, 4, 5);
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(255,180,40,0.9)';
  ctx.beginPath(); ctx.moveTo(sx - 7, cy - 2); ctx.lineTo(sx - 3, cy - 2); ctx.lineTo(sx - 5, cy + 2); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(sx + 7, cy - 2); ctx.lineTo(sx + 3, cy - 2); ctx.lineTo(sx + 5, cy + 2); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(sx - 7, cy + 5); ctx.lineTo(sx - 3, cy + 8); ctx.lineTo(sx, cy + 5); ctx.lineTo(sx + 3, cy + 8); ctx.lineTo(sx + 7, cy + 5); ctx.lineTo(sx + 4, cy + 9); ctx.lineTo(sx - 4, cy + 9); ctx.closePath(); ctx.fill(); ctx.restore();
};
const drawMenorah = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  void accent; void dir; const gold = base;
  ctx.fillStyle = shade(gold, 0.8); ctx.beginPath(); ctx.ellipse(sx, sy - 2, 10, 4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = gold; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(sx, sy - 2); ctx.lineTo(sx, sy - 30); ctx.stroke();
  for (let i = -3; i <= 3; i++) { if (i === 0) continue; ctx.strokeStyle = gold; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(sx, sy - 14); ctx.quadraticCurveTo(sx + i * 7, sy - 30, sx + i * 7, sy - 22); ctx.stroke(); }
  for (const x of [-21, -14, -7, 0, 7, 14, 21]) { const cx = sx + x, top = sy - 24 - (x === 0 ? 6 : 0); ctx.fillStyle = '#f0e6d2'; ctx.fillRect(cx - 1.5, top, 3, 6); ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(255,200,80,0.9)'; ctx.beginPath(); ctx.ellipse(cx, top - 2, 2, 4, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
};
const drawStringLights = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  void base; const c = accent;
  const parts: IsoPart[] = [{ u0: -0.85, u1: -0.78, v0: -0.04, v1: 0.04, z0: 0, z1: 1.6, t: '#5a3f24', r: '#4a3018', l: '#3a2410' }, { u0: 0.78, u1: 0.85, v0: -0.04, v1: 0.04, z0: 0, z1: 1.6, t: '#5a3f24', r: '#4a3018', l: '#3a2410' }];
  drawParts(ctx, sx, sy, dir, 0, 0, parts, (P) => {
    const l = P(-0.82, 0, 1.55), r = P(0.82, 0, 1.55), mid = P(0, 0, 1.3);
    ctx.strokeStyle = '#2a2a30'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(l[0], l[1]); ctx.quadraticCurveTo(mid[0], mid[1] + 14, r[0], r[1]); ctx.stroke();
    void c; const cols = ['#ffe65c', '#b3242e', '#3a7bd0', '#2e7d4a']; ctx.save(); ctx.globalCompositeOperation = 'lighter'; for (let i = 1; i < 10; i++) { const f = i / 10, x = l[0] + (r[0] - l[0]) * f, y = l[1] + (r[1] - l[1]) * f + Math.sin(f * Math.PI) * 14; ctx.fillStyle = hexA(cols[i % 4], 0.9); ctx.beginPath(); ctx.arc(x, y + 3, 2.5, 0, Math.PI * 2); ctx.fill(); } ctx.restore();
  });
};

// ═══════════ MORE BENCHES ═══════════
// All-timber slatted bench: wood legs + gapped seat slats + a two-rail back. Rotates, sittable.
const drawWoodBench = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  void accent; const wood = base, cT = shade(wood, 1.25), cR = shade(wood, 0.92), cL = shade(wood, 0.58);
  const parts: IsoPart[] = [
    ...legs([[-0.8, -0.18], [0.8, -0.18], [-0.8, 0.28], [0.8, 0.28]], 0.42).map(p => ({ ...p, t: cR, r: shade(wood, 0.78), l: shade(wood, 0.5) })),
    { u0: -0.9, u1: 0.9, v0: -0.22, v1: -0.08, z0: 0.42, z1: 0.5, t: cT, r: cR, l: cL },
    { u0: -0.9, u1: 0.9, v0: -0.04, v1: 0.1, z0: 0.42, z1: 0.5, t: cT, r: cR, l: cL },
    { u0: -0.9, u1: 0.9, v0: 0.14, v1: 0.28, z0: 0.42, z1: 0.5, t: cT, r: cR, l: cL },
    { u0: -0.9, u1: 0.9, v0: -0.28, v1: -0.22, z0: 0.5, z1: 0.74, t: cT, r: cR, l: cL },
    { u0: -0.9, u1: 0.9, v0: -0.28, v1: -0.22, z0: 0.84, z1: 1.08, t: cT, r: cR, l: cL },
    { u0: -0.9, u1: -0.78, v0: -0.28, v1: -0.2, z0: 0.42, z1: 1.08, t: cR, r: shade(wood, 0.78), l: cL },
    { u0: 0.78, u1: 0.9, v0: -0.28, v1: -0.2, z0: 0.42, z1: 1.08, t: cR, r: shade(wood, 0.78), l: cL }];
  drawParts(ctx, sx, sy, dir, 0, 0, parts);
};
// Solid stone bench: two block legs + a chunky slab seat with weathered speckle.
const drawStoneBench = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  void accent; const st = base, cT = shade(st, 1.15), cR = shade(st, 0.9), cL = shade(st, 0.62);
  const parts: IsoPart[] = [
    { u0: -0.7, u1: -0.45, v0: -0.22, v1: 0.28, z0: 0, z1: 0.42, t: shade(st, 0.95), r: cR, l: cL },
    { u0: 0.45, u1: 0.7, v0: -0.22, v1: 0.28, z0: 0, z1: 0.42, t: shade(st, 0.95), r: cR, l: cL },
    { u0: -0.88, u1: 0.88, v0: -0.26, v1: 0.32, z0: 0.42, z1: 0.56, t: cT, r: cR, l: cL }];
  drawParts(ctx, sx, sy, dir, 0, 0, parts, (P) => {
    ctx.fillStyle = hexA('#000', 0.08); for (let i = 0; i < 10; i++) { const c = P(-0.7 + ((i * 13) % 8) * 0.18, -0.1 + ((i * 7) % 4) * 0.1, 0.56); ctx.beginPath(); ctx.arc(c[0], c[1], 1.5, 0, Math.PI * 2); ctx.fill(); }
  });
};
// Minimalist floating-slab bench on a single central plinth + an accent edge strip.
const drawModernBench = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  const m = base, cT = shade(m, 1.25), cR = shade(m, 0.95), cL = shade(m, 0.58);
  const parts: IsoPart[] = [
    { u0: -0.3, u1: 0.3, v0: -0.12, v1: 0.18, z0: 0, z1: 0.34, t: '#2a2e36', r: '#22252c', l: '#15171b' },
    { u0: -0.9, u1: 0.9, v0: -0.22, v1: 0.28, z0: 0.34, z1: 0.5, t: cT, r: cR, l: cL }];
  drawParts(ctx, sx, sy, dir, 0, 0, parts, (P) => {
    poly(ctx, [P(-0.9, 0.28, 0.42), P(0.9, 0.28, 0.42), P(0.9, 0.28, 0.36), P(-0.9, 0.28, 0.36)], hexA(accent, 0.7));
  });
};

// ═══════════ MORE TABLES ═══════════
// Round pedestal dining table — splayed feet, column, big round top. Symmetric.
const drawRoundTable = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  void accent; void dir; const m = base, legH = STACK_H * 0.7, top = sy - legH;
  ctx.strokeStyle = shade(m, 0.7); ctx.lineWidth = 4; ctx.lineCap = 'round'; for (const [dx, dy] of [[-12, 3], [12, 3], [0, 7], [0, -3]] as [number, number][]) { ctx.beginPath(); ctx.moveTo(sx, top + 2); ctx.lineTo(sx + dx, sy + dy); ctx.stroke(); }
  ctx.fillStyle = shade(m, 0.85); ctx.fillRect(sx - 3, top, 6, legH);
  ctx.fillStyle = shade(m, 0.6); ctx.beginPath(); ctx.ellipse(sx, top + 4, TW * 0.72, TH * 0.72, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = shade(m, 1.22); ctx.beginPath(); ctx.ellipse(sx, top, TW * 0.72, TH * 0.72, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = hexA('#fff', 0.12); ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(sx, top, TW * 0.72, TH * 0.72, 0, 0, Math.PI * 2); ctx.stroke();
};
// Glass table — chrome legs + a translucent top with an edge highlight and an accent vase.
const drawGlassTable = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  void base; const m = '#9aa0ac';
  const parts: IsoPart[] = [...legs([[-0.7, -0.2], [0.7, -0.2], [-0.7, 0.28], [0.7, 0.28]], 0.6).map(p => ({ ...p, t: m, r: shade(m, 0.8), l: shade(m, 0.5) }))];
  drawParts(ctx, sx, sy, dir, 0, 0, parts, (P) => {
    const z = 0.6;
    poly(ctx, [P(-0.82, -0.3, z), P(0.82, -0.3, z), P(0.82, 0.34, z), P(-0.82, 0.34, z)], 'rgba(190,220,235,0.22)');
    poly(ctx, [P(-0.82, -0.3, z), P(0.82, -0.3, z), P(0.82, 0.34, z), P(-0.82, 0.34, z)], undefined, hexA('#dff4f8', 0.5), 1.5);
    poly(ctx, [P(-0.5, -0.1, z), P(-0.2, -0.1, z), P(0.0, 0.2, z), P(-0.3, 0.2, z)], 'rgba(255,255,255,0.12)');
  });
};

// ═══════════ MORE LIGHTS ═══════════
// Floor lamp — slim pole + a glowing fabric shade casting warm light. Symmetric.
const drawFloorLamp = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  void accent; void dir; const m = '#3a3e46', sc = base, ty = sy - STACK_H * 2.4;
  ctx.fillStyle = m; ctx.beginPath(); ctx.ellipse(sx, sy, 10, 4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = shade(m, 1.1); ctx.fillRect(sx - 1.5, ty, 3, STACK_H * 2.4);
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; const g = ctx.createRadialGradient(sx, ty - 2, 2, sx, ty - 2, 20); g.addColorStop(0, hexA(sc, 0.5)); g.addColorStop(1, hexA(sc, 0)); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, ty - 2, 20, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  const sg = ctx.createLinearGradient(sx - 14, 0, sx + 14, 0); sg.addColorStop(0, shade(sc, 0.8)); sg.addColorStop(0.5, shade(sc, 1.2)); sg.addColorStop(1, shade(sc, 0.8));
  ctx.fillStyle = sg; ctx.beginPath(); ctx.moveTo(sx - 9, ty - 14); ctx.lineTo(sx + 9, ty - 14); ctx.lineTo(sx + 14, ty); ctx.lineTo(sx - 14, ty); ctx.closePath(); ctx.fill();
  ctx.fillStyle = hexA('#fff', 0.4); ctx.beginPath(); ctx.ellipse(sx, ty, 14, 4, 0, 0, Math.PI * 2); ctx.fill();
};
// Candle cluster — a brass holder with three candles + flickering flames. Symmetric, animated.
const drawCandle = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, t: number, dir: number) => {
  void accent; void dir; const wax = base;
  ctx.fillStyle = '#caa24a'; ctx.beginPath(); ctx.ellipse(sx, sy - 2, 11, 4, 0, 0, Math.PI * 2); ctx.fill();
  for (const [ox, h] of [[-6, 14], [0, 20], [6, 12]] as [number, number][]) { const cx = sx + ox, b2 = sy - 4, top = b2 - h; ctx.fillStyle = wax; ctx.fillRect(cx - 2.5, top, 5, h); ctx.fillStyle = shade(wax, 0.85); ctx.fillRect(cx + 1, top, 1.5, h);
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; const fl = 0.7 + 0.3 * Math.sin(t * 0.3 + ox); ctx.fillStyle = `rgba(255,200,90,${fl})`; ctx.beginPath(); ctx.ellipse(cx, top - 3, 2, 4.5, Math.sin(t * 0.2 + ox) * 0.2, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = `rgba(255,255,200,${fl})`; ctx.beginPath(); ctx.ellipse(cx, top - 2, 1, 2, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    ctx.strokeStyle = '#1a1a1f'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(cx, top); ctx.lineTo(cx, top + 2); ctx.stroke(); }
};
// Fire pit — a ring of stones around logs with a live flame + ember glow. Symmetric, animated.
const drawFirePit = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, t: number, dir: number) => {
  void accent; void dir; const st = base;
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2, rx = sx + Math.cos(a) * TW * 0.55, ry = sy + Math.sin(a) * TH * 0.55; ctx.fillStyle = i % 2 ? shade(st, 1.1) : shade(st, 0.85); ctx.beginPath(); ctx.ellipse(rx, ry, 5, 4, 0, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = '#1a120a'; ctx.beginPath(); ctx.ellipse(sx, sy, TW * 0.42, TH * 0.42, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#3a2414'; ctx.fillRect(sx - 10, sy - 1, 20, 3); ctx.save(); ctx.translate(sx, sy); ctx.rotate(0.5); ctx.fillRect(-9, -1, 18, 3); ctx.restore();
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const flame = (ox: number, h: number, c: string, ph: number) => { const fl = h * (0.8 + 0.2 * Math.sin(t * 0.3 + ph)); ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(sx + ox - 5, sy - 2); ctx.quadraticCurveTo(sx + ox - 3, sy - 2 - fl * 0.6, sx + ox + Math.sin(t * 0.2 + ph) * 3, sy - 2 - fl); ctx.quadraticCurveTo(sx + ox + 3, sy - 2 - fl * 0.6, sx + ox + 5, sy - 2); ctx.closePath(); ctx.fill(); };
  flame(-5, 18, 'rgba(255,90,20,0.8)', 0); flame(5, 16, 'rgba(255,90,20,0.8)', 1.5); flame(0, 24, 'rgba(255,150,30,0.85)', 0.7); flame(0, 13, 'rgba(255,232,120,0.9)', 2.2);
  const g = ctx.createRadialGradient(sx, sy - 4, 1, sx, sy - 4, 24); g.addColorStop(0, 'rgba(255,140,40,0.5)'); g.addColorStop(1, 'rgba(255,140,40,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, sy - 4, 24, 0, Math.PI * 2); ctx.fill(); ctx.restore();
};

// ───────── Boutique / clothes shop ─────────
const hangGarment = (ctx: CanvasRenderingContext2D, top: number[], bot: number[], w: number, col: string) => {
  ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(top[0] - w, top[1]); ctx.lineTo(top[0] + w, top[1]); ctx.lineTo(bot[0] + w * 0.8, bot[1]); ctx.lineTo(bot[0] - w * 0.8, bot[1]); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = shade(col, 0.72); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo((top[0] + bot[0]) / 2, top[1]); ctx.lineTo((top[0] + bot[0]) / 2, bot[1]); ctx.stroke();
};
// Splucci palette — muted luxe neutrals (cream / black / taupe / charcoal), no loud colour.
const GARMENTS = ['#e6ddca', '#1c1c20', '#c7b89c', '#3a3a40', '#f0ebdd', '#8c7e64', '#26262c', '#d4c8ac'];
// Round rack — circular rail on a post with garments hanging all the way around (symmetric).
const drawCloRack = (ctx: CanvasRenderingContext2D, sx: number, sy: number, _a: string, base: string) => {
  void _a; const yz = (z: number) => sy - z * STACK_H, ringRx = TW * 0.62, ringRy = TH * 0.62, ringY = yz(1.62);
  ctx.fillStyle = shade(base, 0.55); ctx.beginPath(); ctx.ellipse(sx, yz(0), TW * 0.34, TH * 0.34, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = shade(base, 0.9); ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(sx, yz(0.1)); ctx.lineTo(sx, yz(1.7)); ctx.stroke();
  const items = GARMENTS.map((c, i) => { const a = (i / GARMENTS.length) * Math.PI * 2; return { c, gx: sx + Math.cos(a) * ringRx, gy: ringY + Math.sin(a) * ringRy }; }).sort((p, q) => p.gy - q.gy);
  for (const g of items) hangGarment(ctx, [g.gx, g.gy], [g.gx, g.gy + STACK_H * 0.9], TW * 0.16, g.c);
  ctx.strokeStyle = shade(base, 1.2); ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(sx, ringY, ringRx, ringRy, 0, 0, Math.PI * 2); ctx.stroke();
};
// Clothing rail — a 2-tile straight rail with garments hanging in a row.
const drawCloRail = (ctx: CanvasRenderingContext2D, sx: number, sy: number, _a: string, base: string, dir: number) => {
  void _a; const m = base, cT = shade(m, 1.2), cR = shade(m, 0.92), cL = shade(m, 0.58);
  const post = (u0: number, u1: number): IsoPart => ({ u0, u1, v0: -0.05, v1: 0.05, z0: 0, z1: 1.9, t: cT, r: cR, l: cL });
  const parts: IsoPart[] = [post(-0.92, -0.8), post(0.8, 0.92), { u0: -0.6, u1: 0.6, v0: -0.06, v1: 0.06, z0: 0, z1: 0.08, t: cT, r: cR, l: cL }];
  drawParts(ctx, sx, sy, dir, 0, 0, parts, (P) => {
    const a = P(-0.9, 0, 1.85), b = P(0.9, 0, 1.85); ctx.strokeStyle = shade(m, 1.35); ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    for (let i = 0; i < 7; i++) { const u = -0.78 + (i / 6) * 1.56; hangGarment(ctx, P(u, 0, 1.78), P(u, 0, 0.95), 7, GARMENTS[i]); }
  });
};
// Mannequin — a dress form (draped in a colour) on a slim pole + base.
const drawMannequin = (ctx: CanvasRenderingContext2D, sx: number, sy: number, _a: string, base: string, dir: number) => {
  void _a; const form = base, cT = shade(form, 1.18), cR = shade(form, 0.9), cL = shade(form, 0.58);
  const dr = '#1c1c20', dT = shade(dr, 1.5), dR = shade(dr, 1.1), dL = shade(dr, 0.7);   // a sleek black drape
  const parts: IsoPart[] = [
    { u0: -0.18, u1: 0.18, v0: -0.18, v1: 0.18, z0: 0, z1: 0.08, t: shade(form, 0.7), r: shade(form, 0.6), l: shade(form, 0.45) },
    { u0: -0.04, u1: 0.04, v0: -0.04, v1: 0.04, z0: 0.08, z1: 0.95, t: '#3a3a44', r: '#2a2a32', l: '#1e1e24' },
    { u0: -0.2, u1: 0.2, v0: -0.13, v1: 0.13, z0: 0.95, z1: 1.32, t: dT, r: dR, l: dL },
    { u0: -0.22, u1: 0.22, v0: -0.14, v1: 0.14, z0: 1.32, z1: 1.84, t: dT, r: dR, l: dL },
    { u0: -0.25, u1: 0.25, v0: -0.15, v1: 0.15, z0: 1.84, z1: 1.95, t: cT, r: cR, l: cL },
    { u0: -0.05, u1: 0.05, v0: -0.05, v1: 0.05, z0: 1.95, z1: 2.12, t: cT, r: cR, l: cL },
  ];
  drawParts(ctx, sx, sy, dir, 0, 0, parts);
};
// Novelty satire — two suited figures standing side by side, inner hands clasped (a 2-tile span piece).
const drawLeaders = (ctx: CanvasRenderingContext2D, sx: number, sy: number, _a: string, base: string, dir: number) => {
  void _a; void base;
  type Pal = { suit: string; skin: string; hair: string; tie: string; swoop?: boolean };
  const trump: Pal = { suit: '#22314f', skin: '#e3a263', hair: '#e8cf63', tie: '#c0282d', swoop: true };
  const putin: Pal = { suit: '#3a3d45', skin: '#dcc2a6', hair: '#c2c2c8', tie: '#8a9bb5' };
  const person = (uc: number, p: Pal): IsoPart[] => {
    const sT = shade(p.suit, 1.25), sR = shade(p.suit, 0.95), sL = shade(p.suit, 0.6);
    const kT = shade(p.skin, 1.15), kR = shade(p.skin, 0.92), kL = shade(p.skin, 0.62);
    const tr = shade(p.suit, 0.62), tT = shade(tr, 1.2), tR = shade(tr, 0.9), tL = shade(tr, 0.56);
    const hT = shade(p.hair, 1.2), hR = shade(p.hair, 0.92), hL = shade(p.hair, 0.62);
    const out: IsoPart[] = [
      { u0: uc - 0.17, u1: uc - 0.01, v0: -0.16, v1: 0.06, z0: 0, z1: 0.08, t: '#16161b', r: '#101015', l: '#0a0a0d' },   // shoes
      { u0: uc + 0.01, u1: uc + 0.17, v0: -0.16, v1: 0.06, z0: 0, z1: 0.08, t: '#16161b', r: '#101015', l: '#0a0a0d' },
      { u0: uc - 0.16, u1: uc - 0.02, v0: -0.1, v1: 0.1, z0: 0.06, z1: 0.74, t: tT, r: tR, l: tL },                       // trouser legs
      { u0: uc + 0.02, u1: uc + 0.16, v0: -0.1, v1: 0.1, z0: 0.06, z1: 0.74, t: tT, r: tR, l: tL },
      { u0: uc - 0.21, u1: uc + 0.21, v0: -0.14, v1: 0.14, z0: 0.7, z1: 1.5, t: sT, r: sR, l: sL },                       // jacket / torso
      { u0: uc - 0.05, u1: uc + 0.05, v0: -0.17, v1: -0.14, z0: 0.78, z1: 1.46, t: p.tie, r: shade(p.tie, 0.85), l: shade(p.tie, 0.6) }, // tie strip (proud, front)
      { u0: uc - 0.06, u1: uc + 0.06, v0: -0.07, v1: 0.07, z0: 1.5, z1: 1.58, t: kT, r: kR, l: kL },                      // neck
      { u0: uc - 0.12, u1: uc + 0.12, v0: -0.11, v1: 0.11, z0: 1.58, z1: 1.92, t: kT, r: kR, l: kL },                     // head
      { u0: uc - 0.14, u1: uc + 0.14, v0: -0.13, v1: 0.13, z0: 1.9, z1: 2.04, t: hT, r: hR, l: hL },                      // hair
    ];
    if (p.swoop) out.push({ u0: uc - 0.15, u1: uc + 0.15, v0: -0.16, v1: -0.12, z0: 1.84, z1: 2.06, t: hT, r: hR, l: hL }); // signature forward swoop
    return out;
  };
  const ucL = -0.5, ucR = 0.5, sk = '#e0b07a';
  const parts: IsoPart[] = [
    ...person(ucL, trump),
    ...person(ucR, putin),
    { u0: ucL + 0.12, u1: -0.1, v0: -0.02, v1: 0.1, z0: 0.96, z1: 1.12, t: shade(trump.suit, 1.2), r: shade(trump.suit, 0.95), l: shade(trump.suit, 0.6) }, // left arm
    { u0: 0.1, u1: ucR - 0.12, v0: -0.02, v1: 0.1, z0: 0.96, z1: 1.12, t: shade(putin.suit, 1.2), r: shade(putin.suit, 0.95), l: shade(putin.suit, 0.6) },   // right arm
    { u0: -0.11, u1: 0.11, v0: -0.04, v1: 0.12, z0: 0.94, z1: 1.16, t: shade(sk, 1.12), r: shade(sk, 0.92), l: shade(sk, 0.62) },                            // clasped hands
  ];
  drawParts(ctx, sx, sy, dir, 0, 0, parts);
};
// Display table — a low table topped with folded clothes stacks.
const drawCloTable = (ctx: CanvasRenderingContext2D, sx: number, sy: number, _a: string, base: string, dir: number) => {
  void _a; const w = base, cT = shade(w, 1.2), cR = shade(w, 0.9), cL = shade(w, 0.56);
  const parts: IsoPart[] = [...legs([[-0.78, -0.32], [0.78, -0.32], [-0.78, 0.32], [0.78, 0.32]], 0.55).map(p => ({ ...p, t: cT, r: cR, l: cL })), { u0: -0.9, u1: 0.9, v0: -0.4, v1: 0.4, z0: 0.55, z1: 0.7, t: cT, r: cR, l: cL }];
  drawParts(ctx, sx, sy, dir, 0, 0, parts, (P) => {
    const stacks: [number, string][] = [[-0.55, '#e6ddca'], [-0.18, '#1c1c20'], [0.2, '#c7b89c'], [0.58, '#f0ebdd']];
    for (const [u, col] of stacks) for (let k = 0; k < 3; k++) {
      const z = 0.72 + k * 0.12, a = P(u - 0.15, -0.15, z), b = P(u + 0.15, -0.15, z), c = P(u + 0.15, 0.15, z), e = P(u - 0.15, 0.15, z);
      ctx.fillStyle = k % 2 ? shade(col, 0.82) : col; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(e[0], e[1]); ctx.closePath(); ctx.fill();
    }
  });
};
// Shoe display — a tall cabinet with shelves of shoe pairs on the front face.
const drawShoeWall = (ctx: CanvasRenderingContext2D, sx: number, sy: number, _a: string, base: string, dir: number) => {
  void _a; const w = base, cT = shade(w, 1.2), cR = shade(w, 0.9), cL = shade(w, 0.56);
  drawParts(ctx, sx, sy, dir, 0, 0, [{ u0: -0.4, u1: 0.4, v0: -0.16, v1: 0.16, z0: 0, z1: 2.0, t: cT, r: cR, l: cL }], (P) => {
    if (!faceVisible(0, 1, dir)) return; const F = 0.17, cols = ['#1c1c20', '#f0ebdd', '#c7b89c', '#8c7e64'];
    for (let r = 0; r < 4; r++) { const z0 = 0.2 + r * 0.45; const a = P(-0.38, F, z0), b = P(0.38, F, z0); ctx.strokeStyle = shade(w, 0.62); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      for (let s = 0; s < 2; s++) { const c = P(-0.2 + s * 0.4, F, z0 + 0.13); ctx.fillStyle = cols[(r + s) % cols.length]; ctx.beginPath(); ctx.ellipse(c[0] - 3, c[1], 3, 2, 0, 0, Math.PI * 2); ctx.ellipse(c[0] + 3, c[1], 3, 2, 0, 0, Math.PI * 2); ctx.fill(); } }
  });
};
// Fitting room — a curtained booth (curtain on the camera-facing side, slightly parted).
const drawFitRoom = (ctx: CanvasRenderingContext2D, sx: number, sy: number, _a: string, base: string, dir: number) => {
  void _a; const fr = '#3a3a44', cT = shade(fr, 1.2), cR = shade(fr, 0.9), cL = shade(fr, 0.56), cur = base;
  const parts: IsoPart[] = [
    { u0: -0.5, u1: -0.4, v0: -0.5, v1: 0.4, z0: 0, z1: 3, t: cT, r: cR, l: cL },
    { u0: 0.4, u1: 0.5, v0: -0.5, v1: 0.4, z0: 0, z1: 3, t: cT, r: cR, l: cL },
    { u0: -0.5, u1: 0.5, v0: -0.5, v1: -0.4, z0: 0, z1: 3, t: cT, r: cR, l: cL },
    { u0: -0.5, u1: 0.5, v0: 0.3, v1: 0.42, z0: 2.7, z1: 3.05, t: shade(cur, 1.15), r: cR, l: cL },
  ];
  drawParts(ctx, sx, sy, dir, 0, 0, parts, (P) => {
    if (!faceVisible(0, 1, dir)) return; const F = 0.4;
    for (const [u0, u1] of [[-0.4, -0.06], [0.06, 0.4]] as [number, number][]) {
      const tl = P(u0, F, 2.7), tr = P(u1, F, 2.7), br = P(u1, F, 0.05), bl = P(u0, F, 0.05);
      ctx.fillStyle = cur; ctx.beginPath(); ctx.moveTo(tl[0], tl[1]); ctx.lineTo(tr[0], tr[1]); ctx.lineTo(br[0], br[1]); ctx.lineTo(bl[0], bl[1]); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = shade(cur, 0.7); ctx.lineWidth = 1; for (let f = 1; f < 4; f++) { const fu = u0 + (u1 - u0) * (f / 4), t1 = P(fu, F, 2.65), b1 = P(fu, F, 0.1); ctx.beginPath(); ctx.moveTo(t1[0], t1[1]); ctx.lineTo(b1[0], b1[1]); ctx.stroke(); }
    }
  });
};
// Checkout counter — a 2-tile desk with a register + a shopping bag on top.
const drawCloCounter = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string, dir: number) => {
  void accent; const gold = '#bfa468', cream = '#e6ddca';   // brass + cream, ignore room accent (Splucci is its own palette)
  const w = base, cT = shade(w, 1.4), cR = shade(w, 1.05), cL = shade(w, 0.7);
  const parts: IsoPart[] = [
    { u0: -0.9, u1: 0.9, v0: -0.34, v1: 0.34, z0: 0, z1: 0.95, t: cT, r: cR, l: cL },
    { u0: -0.95, u1: 0.95, v0: -0.4, v1: 0.4, z0: 0.95, z1: 1.08, t: shade(w, 1.7), r: cR, l: cL },
  ];
  drawParts(ctx, sx, sy, dir, 0, 0, parts, (P) => {
    const reg = P(-0.4, -0.05, 1.08); ctx.fillStyle = '#161619'; ctx.fillRect(reg[0] - 7, reg[1] - 12, 14, 12); ctx.fillStyle = gold; ctx.fillRect(reg[0] - 5, reg[1] - 10, 10, 5);
    const bag = P(0.45, 0, 1.08); ctx.fillStyle = cream; ctx.beginPath(); ctx.roundRect(bag[0] - 6, bag[1] - 13, 12, 13, 1.5); ctx.fill(); ctx.fillStyle = gold; ctx.fillRect(bag[0] - 6, bag[1] - 9, 12, 1.6); ctx.strokeStyle = gold; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(bag[0] - 3, bag[1] - 13, 2, Math.PI, 0); ctx.arc(bag[0] + 3, bag[1] - 13, 2, Math.PI, 0); ctx.stroke();
    if (faceVisible(0, 1, dir)) { const a = P(-0.9, 0.34, 0.5), b = P(0.9, 0.34, 0.5); ctx.strokeStyle = hexA(gold, 0.7); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
  });
};

const GOLD = '#bfa468', CREAM = '#e6ddca';
// Display plinth — a podium with a luxury handbag on top.
const drawPlinth = (ctx: CanvasRenderingContext2D, sx: number, sy: number, _a: string, base: string, dir: number) => {
  void _a; const col = base, cT = shade(col, 1.3), cR = shade(col, 1.0), cL = shade(col, 0.66), gT = shade(GOLD, 1.2), gR = shade(GOLD, 0.92), gL = shade(GOLD, 0.6);
  const parts: IsoPart[] = [
    { u0: -0.28, u1: 0.28, v0: -0.28, v1: 0.28, z0: 0, z1: 0.1, t: gT, r: gR, l: gL },
    { u0: -0.2, u1: 0.2, v0: -0.2, v1: 0.2, z0: 0.1, z1: 1.3, t: cT, r: cR, l: cL },
    { u0: -0.24, u1: 0.24, v0: -0.24, v1: 0.24, z0: 1.3, z1: 1.42, t: gT, r: gR, l: gL },
  ];
  drawParts(ctx, sx, sy, dir, 0, 0, parts, (P) => {
    const c = P(0, 0, 1.42);
    ctx.fillStyle = CREAM; ctx.beginPath(); ctx.roundRect(c[0] - 8, c[1] - 14, 16, 12, 2); ctx.fill();
    ctx.strokeStyle = GOLD; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(c[0] - 4, c[1] - 14, 3.2, Math.PI, 0); ctx.arc(c[0] + 4, c[1] - 14, 3.2, Math.PI, 0); ctx.stroke();
    ctx.fillStyle = GOLD; ctx.fillRect(c[0] - 1.5, c[1] - 9, 3, 3);
  });
};
// Perfume stand — a slim console on gold legs with gold-capped bottles.
const drawPerfume = (ctx: CanvasRenderingContext2D, sx: number, sy: number, _a: string, base: string, dir: number) => {
  void _a; const col = base, cT = shade(col, 1.35), cR = shade(col, 1.05), cL = shade(col, 0.62);
  const parts: IsoPart[] = [...legs([[-0.4, -0.16], [0.4, -0.16], [-0.4, 0.16], [0.4, 0.16]], 0.7).map(p => ({ ...p, t: GOLD, r: shade(GOLD, 0.8), l: shade(GOLD, 0.55) })), { u0: -0.46, u1: 0.46, v0: -0.2, v1: 0.2, z0: 0.7, z1: 0.82, t: cT, r: cR, l: cL }];
  drawParts(ctx, sx, sy, dir, 0, 0, parts, (P) => {
    const cols = [CREAM, '#c7b89c', '#f0ebdd'];
    for (let i = 0; i < 3; i++) { const b = P(-0.28 + i * 0.28, 0, 0.82); ctx.fillStyle = hexA(cols[i], 0.85); ctx.beginPath(); ctx.roundRect(b[0] - 3, b[1] - 10, 6, 10, 1.5); ctx.fill(); ctx.fillStyle = GOLD; ctx.fillRect(b[0] - 1.5, b[1] - 14, 3, 4); }
  });
};
// Jewelry case — a 2-tile glass display cabinet with a velvet pad, gold sparkles + gold trim.
const drawJewelCase = (ctx: CanvasRenderingContext2D, sx: number, sy: number, _a: string, base: string, dir: number) => {
  void _a; const col = base, cT = shade(col, 1.3), cR = shade(col, 1.0), cL = shade(col, 0.62);
  drawParts(ctx, sx, sy, dir, 0, 0, [{ u0: -0.85, u1: 0.85, v0: -0.3, v1: 0.3, z0: 0, z1: 0.72, t: cT, r: cR, l: cL }], (P) => {
    const pad = [P(-0.8, -0.26, 0.72), P(0.8, -0.26, 0.72), P(0.8, 0.26, 0.72), P(-0.8, 0.26, 0.72)];
    poly(ctx, pad, '#2a2620');
    ctx.fillStyle = GOLD; for (let i = 0; i < 6; i++) { const c = P(-0.6 + i * 0.24, 0, 0.74); ctx.beginPath(); ctx.arc(c[0], c[1], 1.8, 0, Math.PI * 2); ctx.fill(); }
    const z0 = 0.72, z1 = 1.12, hu = 0.85, hv = 0.3;
    poly(ctx, [P(hu, -hv, z1), P(hu, hv, z1), P(hu, hv, z0), P(hu, -hv, z0)], 'rgba(205,224,238,0.12)');
    poly(ctx, [P(-hu, hv, z1), P(hu, hv, z1), P(hu, hv, z0), P(-hu, hv, z0)], 'rgba(205,224,238,0.15)');
    poly(ctx, [P(-hu, -hv, z1), P(hu, -hv, z1), P(hu, hv, z1), P(-hu, hv, z1)], 'rgba(215,230,242,0.1)');
    ctx.strokeStyle = GOLD; ctx.lineWidth = 1.5; const e = [P(-hu, hv, z1), P(hu, hv, z1), P(hu, -hv, z1), P(hu, hv, z0)];
    ctx.beginPath(); ctx.moveTo(e[0][0], e[0][1]); ctx.lineTo(e[1][0], e[1][1]); ctx.lineTo(e[2][0], e[2][1]); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(e[1][0], e[1][1]); ctx.lineTo(e[3][0], e[3][1]); ctx.stroke();
  });
};
// Gilt mirror — a tall ornate gold-framed standing mirror.
const drawGoldMirror = (ctx: CanvasRenderingContext2D, sx: number, sy: number, _a: string, base: string, dir: number) => {
  void _a; const gold = base, gT = shade(gold, 1.3), gR = shade(gold, 1.0), gL = shade(gold, 0.62);
  const parts: IsoPart[] = [
    { u0: -0.04, u1: 0.04, v0: -0.18, v1: 0.18, z0: 0, z1: 0.12, t: gT, r: gR, l: gL },
    { u0: -0.3, u1: 0.3, v0: -0.06, v1: 0.06, z0: 0.12, z1: 2.6, t: gT, r: gR, l: gL },
  ];
  drawParts(ctx, sx, sy, dir, 0, 0, parts, (P) => {
    if (!faceVisible(0, 1, dir)) return; const F = 0.07;
    const tl = P(-0.24, F, 2.45), tr = P(0.24, F, 2.45), br = P(0.24, F, 0.22), bl = P(-0.24, F, 0.22);
    const g = ctx.createLinearGradient(tl[0], tl[1], br[0], br[1]); g.addColorStop(0, '#dfe6ec'); g.addColorStop(0.5, '#aeb8c2'); g.addColorStop(1, '#cfd8e0');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(tl[0], tl[1]); ctx.lineTo(tr[0], tr[1]); ctx.lineTo(br[0], br[1]); ctx.lineTo(bl[0], bl[1]); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 3; const s1 = P(-0.1, F, 2.2), s2 = P(0.14, F, 1.2); ctx.beginPath(); ctx.moveTo(s1[0], s1[1]); ctx.lineTo(s2[0], s2[1]); ctx.stroke();
    ctx.fillStyle = gold; const ft = P(0, F, 2.55); ctx.beginPath(); ctx.arc(ft[0], ft[1], 4, 0, Math.PI * 2); ctx.fill();
  });
};
// Velvet bench — a tufted 2-tile seat on gold legs.
const drawVelvetBench = (ctx: CanvasRenderingContext2D, sx: number, sy: number, _a: string, base: string, dir: number) => {
  void _a; const v = base, cT = shade(v, 1.3), cR = shade(v, 1.0), cL = shade(v, 0.62);
  const parts: IsoPart[] = [...legs([[-0.72, -0.26], [0.72, -0.26], [-0.72, 0.26], [0.72, 0.26]], 0.4).map(p => ({ ...p, t: GOLD, r: shade(GOLD, 0.8), l: shade(GOLD, 0.55) })), { u0: -0.82, u1: 0.82, v0: -0.32, v1: 0.32, z0: 0.4, z1: 0.64, t: cT, r: cR, l: cL }];
  drawParts(ctx, sx, sy, dir, 0, 0, parts, (P) => {
    ctx.fillStyle = shade(v, 0.78); for (const u of [-0.5, -0.17, 0.17, 0.5]) for (const vv of [-0.12, 0.12]) { const c = P(u, vv, 0.64); ctx.beginPath(); ctx.arc(c[0], c[1], 1.6, 0, Math.PI * 2); ctx.fill(); }
  });
};

export const effSpan = (kind: string, dir: number): [number, number] => { const [sw, sh] = defOf(kind).span ?? [1, 1]; return dir % 2 ? [sh, sw] : [sw, sh]; };

const drawVending = (ctx: CanvasRenderingContext2D, sx: number, sy: number, _a: string, base: string, dir: number) => {
  void _a;
  const half = 0.35, u0 = -half, u1 = half, v0 = -half, v1 = half, zTop = 1.95;
  const parts: IsoPart[] = [{ u0, u1, v0, v1, z0: 0, z1: zTop, t: shade(base, 1.12), r: shade(base, 0.88), l: shade(base, 0.58) }];
  drawParts(ctx, sx, sy, dir, 0, 0, parts, (P) => {
    // ── Front face (+v): glass display ──
    if (faceVisible(0, 1, dir)) {
      const gU0 = u0 + 0.04, gU1 = u1 - 0.04, gZT = zTop - 0.06, gZB = 0.13;
      poly(ctx, [P(gU0, v1, gZT), P(gU1, v1, gZT), P(gU1, v1, gZB), P(gU0, v1, gZB)], '#09131e');
      // glass shimmer
      poly(ctx, [P(gU0, v1, gZT), P(gU0 + 0.03, v1, gZT), P(gU0 + 0.03, v1, gZB), P(gU0, v1, gZB)], 'rgba(255,255,255,0.07)');
      // 3 shelf bars
      const sZ = [0.46, 0.90, 1.34];
      for (const sz of sZ) poly(ctx, [P(gU0, v1, sz + 0.025), P(gU1, v1, sz + 0.025), P(gU1, v1, sz), P(gU0, v1, sz)], '#182430');
      const cols = 3, step = (gU1 - gU0 - 0.04) / cols;
      // Bottom shelf: white snack packs
      for (let i = 0; i < cols; i++) {
        const pu = gU0 + 0.02 + i * step, bz = sZ[0] + 0.03, pw = step - 0.03;
        poly(ctx, [P(pu, v1, bz + 0.20), P(pu + pw, v1, bz + 0.20), P(pu + pw, v1, bz), P(pu, v1, bz)], '#c8d4dc');
        poly(ctx, [P(pu, v1, bz + 0.20), P(pu + 0.025, v1, bz + 0.20), P(pu + 0.025, v1, bz), P(pu, v1, bz)], 'rgba(255,255,255,0.2)');
        poly(ctx, [P(pu, v1, bz + 0.14), P(pu + pw, v1, bz + 0.14), P(pu + pw, v1, bz + 0.10), P(pu, v1, bz + 0.10)], 'rgba(100,140,180,0.5)');
      }
      // Middle shelf: blue cans
      for (let i = 0; i < cols; i++) {
        const pu = gU0 + 0.02 + i * step, bz = sZ[1] + 0.03, pw = step - 0.03;
        poly(ctx, [P(pu, v1, bz + 0.25), P(pu + pw, v1, bz + 0.25), P(pu + pw, v1, bz), P(pu, v1, bz)], '#3a68a0');
        poly(ctx, [P(pu, v1, bz + 0.25), P(pu + pw, v1, bz + 0.25), P(pu + pw, v1, bz + 0.21), P(pu, v1, bz + 0.21)], '#7ab0d8');
        poly(ctx, [P(pu, v1, bz + 0.06), P(pu + pw, v1, bz + 0.06), P(pu + pw, v1, bz + 0.02), P(pu, v1, bz + 0.02)], '#7ab0d8');
        poly(ctx, [P(pu, v1, bz + 0.25), P(pu + 0.02, v1, bz + 0.25), P(pu + 0.02, v1, bz), P(pu, v1, bz)], 'rgba(255,255,255,0.15)');
      }
      // Top shelf: Coke-style bottles — wide body, sharp waist, narrow neck
      for (let i = 0; i < cols; i++) {
        const cx = gU0 + 0.005 + (i + 0.5) * step, bz = sZ[2] + 0.03;
        const col = '#b85060', cap = '#8a2840';
        poly(ctx, [P(cx-0.034, v1, bz+0.06), P(cx+0.034, v1, bz+0.06), P(cx+0.034, v1, bz    ), P(cx-0.034, v1, bz    )], col); // base
        poly(ctx, [P(cx-0.040, v1, bz+0.17), P(cx+0.040, v1, bz+0.17), P(cx+0.034, v1, bz+0.06), P(cx-0.034, v1, bz+0.06)], col); // lower body (widest)
        poly(ctx, [P(cx-0.018, v1, bz+0.23), P(cx+0.018, v1, bz+0.23), P(cx+0.040, v1, bz+0.17), P(cx-0.040, v1, bz+0.17)], col); // shoulder taper
        poly(ctx, [P(cx-0.016, v1, bz+0.33), P(cx+0.016, v1, bz+0.33), P(cx+0.018, v1, bz+0.23), P(cx-0.018, v1, bz+0.23)], col); // neck
        poly(ctx, [P(cx-0.021, v1, bz+0.38), P(cx+0.021, v1, bz+0.38), P(cx+0.016, v1, bz+0.33), P(cx-0.016, v1, bz+0.33)], cap); // cap
        poly(ctx, [P(cx-0.040, v1, bz+0.17), P(cx-0.025, v1, bz+0.17), P(cx-0.020, v1, bz), P(cx-0.034, v1, bz)], 'rgba(255,255,255,0.20)'); // highlight
      }
      // Bottom body strip below glass — clearly red
      poly(ctx, [P(gU0, v1, gZB), P(gU1, v1, gZB), P(gU1, v1, 0), P(gU0, v1, 0)], shade(base, 0.72));
      // Red border + dark interior around tray area under bottom shelf
      const tZ0 = gZB, tZ1 = sZ[0] - 0.005;
      poly(ctx, [P(gU0, v1, tZ1), P(gU1, v1, tZ1), P(gU1, v1, tZ0), P(gU0, v1, tZ0)], shade(base, 0.82));
      poly(ctx, [P(gU0 + 0.04, v1, tZ1 - 0.04), P(gU1 - 0.04, v1, tZ1 - 0.04), P(gU1 - 0.04, v1, tZ0 + 0.014), P(gU0 + 0.04, v1, tZ0 + 0.014)], '#09131e');
    }
    // ── Right face (+u): control panel ──
    if (faceVisible(1, 0, dir)) {
      // Screen
      poly(ctx, [P(u1, v0 + 0.04, 1.62), P(u1, v0 + 0.26, 1.62), P(u1, v0 + 0.26, 1.32), P(u1, v0 + 0.04, 1.32)], '#0e2a3a');
      poly(ctx, [P(u1, v0 + 0.05, 1.60), P(u1, v0 + 0.25, 1.60), P(u1, v0 + 0.25, 1.34), P(u1, v0 + 0.05, 1.34)], '#287080');
      // Keypad (3×4 grid of buttons)
      ctx.fillStyle = shade(base, 0.62);
      for (let row = 0; row < 4; row++) for (let col = 0; col < 3; col++) {
        const pt = P(u1, v0 + 0.06 + col * 0.09, 1.26 - row * 0.16);
        ctx.beginPath(); ctx.arc(pt[0], pt[1], 1.5, 0, Math.PI * 2); ctx.fill();
      }
      // Card/coin slot
      poly(ctx, [P(u1, v0 + 0.06, 0.42), P(u1, v0 + 0.28, 0.42), P(u1, v0 + 0.28, 0.36), P(u1, v0 + 0.06, 0.36)], '#06101a');
      // Return tray
      poly(ctx, [P(u1, v0 + 0.10, 0.22), P(u1, v0 + 0.26, 0.22), P(u1, v0 + 0.26, 0.16), P(u1, v0 + 0.10, 0.16)], '#06101a');
    }
  });
};

function drawRaw(ctx: CanvasRenderingContext2D, kind: string, sx: number, sy: number, accent: string, t: number, dir = 0) {
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
    case 'tree': drawTree(ctx, sx, sy, accent, d.color, dir); break;
    case 'oak':  drawOakTree(ctx, sx, sy, accent, d.color, dir); break;
    case 'flores':     drawFlores(ctx, sx, sy, accent); break;
    case 'wildflower': drawWildflowerPatch(ctx, sx, sy, kind); break;
    case 'pine': drawPineTree(ctx, sx, sy, accent, d.color, dir); break;
    case 'hedge': drawHedge(ctx, sx, sy, accent, d.color, dir); break;
    case 'shrub': drawShrub(ctx, sx, sy, accent, d.color, dir); break;
    case 'palm': drawPalm(ctx, sx, sy, accent, d.color, dir); break;
    case 'torii': drawTorii(ctx, sx, sy, accent, d.color, dir); break;
    case 'pagoda': drawPagoda(ctx, sx, sy, accent, d.color, dir); break;
    case 'toro': drawToro(ctx, sx, sy, accent, d.color, dir); break;
    case 'sakura': drawSakura(ctx, sx, sy, accent, d.color, dir); break;
    case 'bonsai_lux': drawBonsai(ctx, sx, sy, accent, d.color, dir); break;
    case 'bench': drawBench(ctx, sx, sy, accent, d.color, dir); break;
    case 'reception': drawReception(ctx, sx, sy, accent, d.color, dir); break;
    case 'pa': { const beat = Math.pow(Math.abs(Math.sin(t * 0.2)), 3); ctx.save(); ctx.translate(Math.sin(t * 0.63) * 0.9, -beat * 2.5); drawPA(ctx, sx, sy, accent, d.color, t, dir); ctx.restore(); break; }
    case 'ladder': drawLadder(ctx, sx, sy, accent, d.color, dir); break;
    case 'rope': drawRope(ctx, sx, sy, accent, d.color, dir); break;
    case 'booth': drawBooth(ctx, sx, sy, accent, d.color, t, dir); break;
    case 'parasol': drawParasol(ctx, sx, sy, accent, d.color); break;
    case 'lounger': drawLounger(ctx, sx, sy, accent, d.color, dir); break;
    case 'topiary': drawTopiary(ctx, sx, sy, accent, d.color, dir); break;
    case 'banner': drawBanner(ctx, sx, sy, accent, d.color); break;
    case 'canopy': drawCanopy(ctx, sx, sy, accent, d.color, dir); break;
    case 'eggchair': drawEgg(ctx, sx, sy, accent, d.color, dir); break;
    case 'lantern': drawLantern(ctx, sx, sy, accent, d.color, t, dir); break;
    case 'chaise': drawChaise(ctx, sx, sy, accent, d.color, dir); break;
    case 'greekcol': drawGreekCol(ctx, sx, sy, accent, d.color); break;
    case 'arch': drawArch(ctx, sx, sy, accent, d.color, dir); break;
    case 'peacock': drawPeacock(ctx, sx, sy, accent, d.color, dir); break;
    case 'cloud': drawCloud(ctx, sx, sy, accent, d.color, dir); break;
    case 'pit': drawPit(ctx, sx, sy, accent, d.color); break;
    case 'chandelier': drawChandelier(ctx, sx, sy, accent, d.color, t); break;
    case 'float': drawFloat(ctx, sx, sy, accent, d.color, t); break;
    case 'fountain': drawFountain(ctx, sx, sy, accent, d.color, t, dir); break;
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
      if (d.cat !== 'constr') { ctx.strokeStyle = hexA(accent, 0.25); ctx.lineWidth = 1; diamond(ctx, sx, sy - STACK_H, TW, TH); ctx.stroke(); }
      break;
    }
    case 'wall': { drawBuilt(ctx, sx, sy, d.h, d.color, accent, d.foot, kind, null, 0, d.cat === 'constr'); break; }
    case 'door': { drawBuilt(ctx, sx, sy, d.h, d.color, accent, 1, kind, 'door', dir, d.cat === 'constr'); break; }       // rotatable iso doorway
    case 'window': { drawBuilt(ctx, sx, sy, d.h, d.color, accent, 1, kind, 'window', dir, d.cat === 'constr'); break; }   // rotatable iso window
    case 'gate': { drawGate(ctx, sx, sy, accent, d.color, dir, d.h); break; }                          // 2-tile-wide walk-through gate
    case 'roof': { hipRoof(ctx, sx, sy + TH * 0.7, 0.98, d.color, STACK_H * 0.7, 0.55, false); break; }
    case 'lavablock': {   // walkable molten block — hazard at its top level (handled in RoomCanvas)
      const hw = TW * 0.9, hh = TH * 0.9, cyT = sy - d.h * STACK_H, pulse = 0.5 + 0.5 * Math.sin(t * 0.08);
      poly(ctx, [[sx - hw, sy], [sx, sy + hh], [sx, cyT + hh], [sx - hw, cyT]], '#2a0f08'); poly(ctx, [[sx, sy + hh], [sx + hw, sy], [sx + hw, cyT], [sx, cyT + hh]], '#1d0904');
      ctx.fillStyle = `hsl(${14 + pulse * 10},90%,${26 + pulse * 14}%)`; diamond(ctx, sx, cyT, hw, hh); ctx.fill();
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = `hsla(28,100%,60%,${0.3 + pulse * 0.4})`; ctx.lineWidth = 1.5; diamond(ctx, sx, cyT, hw * 0.66, hh * 0.66); ctx.stroke();
      for (let q = 0; q < 2; q++) { const bp = ((t * (0.9 + q * 0.5) + q * 40) % 60) / 60, by = cyT + hh * 0.35 - bp * hh * 0.6, r = (1 - Math.abs(bp - 0.5) * 2) * 3; if (r > 0.3) { ctx.fillStyle = `hsla(${36 + q * 10},100%,${60 + bp * 20}%,${0.7 * (1 - bp)})`; ctx.beginPath(); ctx.arc(sx + (q ? 6 : -6), by, r, 0, Math.PI * 2); ctx.fill(); } }
      ctx.restore(); break;
    }
    case 'voidblock': {   // walkable abyss block — time-based hazard at its top level
      const hw = TW * 0.9, hh = TH * 0.9, cyT = sy - d.h * STACK_H;
      poly(ctx, [[sx - hw, sy], [sx, sy + hh], [sx, cyT + hh], [sx - hw, cyT]], '#0a0a16'); poly(ctx, [[sx, sy + hh], [sx + hw, sy], [sx + hw, cyT], [sx, cyT + hh]], '#06060e');
      ctx.fillStyle = '#04040a'; diamond(ctx, sx, cyT, hw, hh); ctx.fill();
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; for (let q = 0; q < 6; q++) { const sxv = sx + ((q * 23) % 36) - 18, syv = cyT + ((q * 13 + (t >> 4)) % 18) - 9; ctx.globalAlpha = 0.3 + 0.5 * Math.abs(Math.sin(t * 0.05 + q)); ctx.fillStyle = q % 2 ? '#8a9cff' : '#fff'; ctx.fillRect(sxv, syv, 1.5, 1.5); } ctx.restore(); break;
    }
    case 'plant': { const top = block(ctx, sx, sy, 1, '#8a4f2a', accent, d.foot * 0.8); const lc = kind === 'flores' ? '#ff66aa' : '#1ED760'; const lvl = d.h; for (let r = 0; r < (lvl === 2 ? 5 : 3); r++) { const ox = (r - 1) * 7; ctx.fillStyle = lc; ctx.beginPath(); ctx.ellipse(sx + ox, top - 8 - (lvl === 2 ? r * 6 : 0), 6, 13, ox * 0.05, 0, Math.PI * 2); ctx.fill(); } break; }
    case 'lamp': { const top = block(ctx, sx, sy, d.h, '#2a2a30', accent, d.foot); ctx.save(); ctx.shadowColor = d.color; ctx.shadowBlur = 22; ctx.globalAlpha = 0.5 + Math.abs(Math.sin(t * 0.08)) * 0.4; ctx.fillStyle = d.color; ctx.beginPath(); ctx.arc(sx, top - 4, 7, 0, Math.PI * 2); ctx.fill(); ctx.restore(); break; }
    case 'lavalamp': drawLavaLamp(ctx, sx, sy, accent, d.color, t); break;
    case 'aquarium': drawAquarium(ctx, sx, sy, accent, d.color, t); break;
    case 'fireplace': drawFireplace(ctx, sx, sy, accent, d.color, t); break;
    case 'espresso': drawEspresso(ctx, sx, sy, accent, d.color, t); break;
    case 'cappuccino': drawCappuccino(ctx, sx, sy, accent, d.color, dir); break;
    case 'pizza': drawPizza(ctx, sx, sy, accent, d.color, dir); break;
    case 'vespa': drawVespa(ctx, sx, sy, accent, d.color, dir); break;
    case 'tralalero': drawTralalero(ctx, sx, sy, accent, d.color, dir); break;
    case 'bombardiro': drawBombardiro(ctx, sx, sy, accent, d.color, dir); break;
    case 'ballerina': drawBallerina(ctx, sx, sy, accent, d.color, dir); break;
    case 'tungtung': drawTungTung(ctx, sx, sy, accent, d.color, dir); break;
    case 'lirili': drawLirili(ctx, sx, sy, accent, d.color, dir); break;
    case 'patapim': drawPatapim(ctx, sx, sy, accent, d.color, dir); break;
    case 'bananini': drawBananini(ctx, sx, sy, accent, d.color, dir); break;
    case 'bed': drawBed(ctx, sx, sy, accent, d.color, dir); break;
    case 'wardrobe': drawWardrobe(ctx, sx, sy, accent, d.color, dir); break;
    case 'bookcase': drawBookcase(ctx, sx, sy, accent, d.color, dir); break;
    case 'desk': drawDesk(ctx, sx, sy, accent, d.color, dir); break;
    case 'kitchen': drawKitchen(ctx, sx, sy, accent, d.color, dir); break;
    case 'bathtub': drawBathtub(ctx, sx, sy, accent, d.color, dir); break;
    case 'clock': drawClock(ctx, sx, sy, accent, d.color, dir); break;
    case 'dresser': drawDresser(ctx, sx, sy, accent, d.color, dir); break;
    case 'treadmill': drawTreadmill(ctx, sx, sy, accent, d.color, dir); break;
    case 'weightbench': drawWeightBench(ctx, sx, sy, accent, d.color, dir); break;
    case 'heavybag': drawHeavyBag(ctx, sx, sy, accent, d.color, dir); break;
    case 'dumbbells': drawDumbbells(ctx, sx, sy, accent, d.color, dir); break;
    case 'exbike': drawExBike(ctx, sx, sy, accent, d.color, dir); break;
    case 'locker': drawLocker(ctx, sx, sy, accent, d.color, dir); break;
    case 'bbq': drawBBQ(ctx, sx, sy, accent, d.color, dir); break;
    case 'picnictable': drawPicnicTable(ctx, sx, sy, accent, d.color, dir); break;
    case 'hottub': drawHotTub(ctx, sx, sy, accent, d.color, t, dir); break;
    case 'swingbench': drawSwingBench(ctx, sx, sy, accent, d.color, dir); break;
    case 'streetlamp': drawStreetLamp(ctx, sx, sy, accent, d.color, dir); break;
    case 'mailbox': drawMailbox(ctx, sx, sy, accent, d.color, dir); break;
    case 'fence_picket': drawFencePicket(ctx, sx, sy, accent, d.color, dir); break;
    case 'fence_iron':   drawFenceIron(ctx, sx, sy, accent, d.color, dir); break;
    case 'fence_rail':   drawFenceRail(ctx, sx, sy, accent, d.color, dir); break;
    case 'fence_solid':  drawFenceSolid(ctx, sx, sy, accent, d.color, dir); break;
    case 'drumkit': drawDrumkit(ctx, sx, sy, accent, d.color, dir); break;
    case 'ampstack': drawAmpStack(ctx, sx, sy, accent, d.color, dir); break;
    case 'mixer': drawMixer(ctx, sx, sy, accent, d.color, dir); break;
    case 'micstand': drawMicStand(ctx, sx, sy, accent, d.color, dir); break;
    case 'synth': drawSynth(ctx, sx, sy, accent, d.color, dir); break;
    case 'vinyl': drawVinyl(ctx, sx, sy, accent, d.color, dir); break;
    case 'dinerbooth': drawDinerBooth(ctx, sx, sy, accent, d.color, dir); break;
    case 'sodafount': drawSodaFount(ctx, sx, sy, accent, d.color, dir); break;
    case 'popcorn': drawPopcorn(ctx, sx, sy, accent, d.color, dir); break;
    case 'icecream': drawIcecream(ctx, sx, sy, accent, d.color, dir); break;
    case 'register': drawRegister(ctx, sx, sy, accent, d.color, dir); break;
    case 'shakebar': drawShakeBar(ctx, sx, sy, accent, d.color, dir); break;
    case 'toilet': drawToilet(ctx, sx, sy, accent, d.color, dir); break;
    case 'vanity': drawVanity(ctx, sx, sy, accent, d.color, dir); break;
    case 'shower': drawShower(ctx, sx, sy, accent, d.color, dir); break;
    case 'towelrail': drawTowelRail(ctx, sx, sy, accent, d.color, dir); break;
    case 'washer': drawWasher(ctx, sx, sy, accent, d.color, t, dir); break;
    case 'mirror': drawMirror(ctx, sx, sy, accent, d.color, dir); break;
    case 'officechair': drawOfficeChair(ctx, sx, sy, accent, d.color, dir); break;
    case 'filecab': drawFileCab(ctx, sx, sy, accent, d.color, dir); break;
    case 'copier': drawCopier(ctx, sx, sy, accent, d.color, dir); break;
    case 'watercooler': drawWaterCooler(ctx, sx, sy, accent, d.color, dir); break;
    case 'whiteboard': drawWhiteboard(ctx, sx, sy, accent, d.color, dir); break;
    case 'serverrack': drawServerRack(ctx, sx, sy, accent, d.color, dir); break;
    case 'pooltable': drawPoolTable(ctx, sx, sy, accent, d.color, dir); break;
    case 'foosball': drawFoosball(ctx, sx, sy, accent, d.color, dir); break;
    case 'clawmachine': drawClawMachine(ctx, sx, sy, accent, d.color, dir); break;
    case 'pinball': drawPinball(ctx, sx, sy, accent, d.color, dir); break;
    case 'airhockey': drawAirHockey(ctx, sx, sy, accent, d.color, dir); break;
    case 'toychest': drawToyChest(ctx, sx, sy, accent, d.color, dir); break;
    case 'pastrycase': drawPastryCase(ctx, sx, sy, accent, d.color, dir); break;
    case 'winerack': drawWineRack(ctx, sx, sy, accent, d.color, dir); break;
    case 'kegtap': drawKegTap(ctx, sx, sy, accent, d.color, dir); break;
    case 'cocktailcart': drawCocktailCart(ctx, sx, sy, accent, d.color, dir); break;
    case 'coffeebar': drawCoffeeBar(ctx, sx, sy, accent, d.color, dir); break;
    case 'bistro': drawBistro(ctx, sx, sy, accent, d.color, dir); break;
    case 'holopod': drawHoloPod(ctx, sx, sy, accent, d.color, t, dir); break;
    case 'teleporter': drawTeleporter(ctx, sx, sy, accent, d.color, t, dir); break;
    case 'neonarch': drawNeonArch(ctx, sx, sy, accent, d.color, dir); break;
    case 'plasmalamp': drawPlasmaLamp(ctx, sx, sy, accent, d.color, t, dir); break;
    case 'console': drawConsole(ctx, sx, sy, accent, d.color, dir); break;
    case 'cryopod': drawCryoPod(ctx, sx, sy, accent, d.color, dir); break;
    case 'tikibar': drawTikiBar(ctx, sx, sy, accent, d.color, dir); break;
    case 'surfrack': drawSurfRack(ctx, sx, sy, accent, d.color, dir); break;
    case 'lifeguard': drawLifeguard(ctx, sx, sy, accent, d.color, dir); break;
    case 'beachball': drawBeachBall(ctx, sx, sy, accent, d.color, dir); break;
    case 'hammock': drawHammock(ctx, sx, sy, accent, d.color, dir); break;
    case 'cooler': drawCooler(ctx, sx, sy, accent, d.color, dir); break;
    case 'workbench': drawWorkbench(ctx, sx, sy, accent, d.color, dir); break;
    case 'toolcab': drawToolCab(ctx, sx, sy, accent, d.color, dir); break;
    case 'tirestack': drawTireStack(ctx, sx, sy, accent, d.color, dir); break;
    case 'gaspump': drawGasPump(ctx, sx, sy, accent, d.color, dir); break;
    case 'oildrum': drawOilDrum(ctx, sx, sy, accent, d.color, dir); break;
    case 'welder': drawWelder(ctx, sx, sy, accent, d.color, t, dir); break;
    case 'xmastree': drawXmasTree(ctx, sx, sy, accent, d.color, t, dir); break;
    case 'giftpile': drawGiftPile(ctx, sx, sy, accent, d.color, dir); break;
    case 'snowman': drawSnowman(ctx, sx, sy, accent, d.color, dir); break;
    case 'pumpkin': drawPumpkin(ctx, sx, sy, accent, d.color, dir); break;
    case 'menorah': drawMenorah(ctx, sx, sy, accent, d.color, dir); break;
    case 'stringlights': drawStringLights(ctx, sx, sy, accent, d.color, dir); break;
    case 'woodbench': drawWoodBench(ctx, sx, sy, accent, d.color, dir); break;
    case 'stonebench': drawStoneBench(ctx, sx, sy, accent, d.color, dir); break;
    case 'modernbench': drawModernBench(ctx, sx, sy, accent, d.color, dir); break;
    case 'roundtable': drawRoundTable(ctx, sx, sy, accent, d.color, dir); break;
    case 'glasstable': drawGlassTable(ctx, sx, sy, accent, d.color, dir); break;
    case 'floorlamp': drawFloorLamp(ctx, sx, sy, accent, d.color, dir); break;
    case 'candle': drawCandle(ctx, sx, sy, accent, d.color, t, dir); break;
    case 'firepit': drawFirePit(ctx, sx, sy, accent, d.color, t, dir); break;
    case 'speaker': { const beat = Math.pow(Math.abs(Math.sin(t * 0.2)), 3); ctx.save(); ctx.translate(Math.sin(t * 0.63) * 0.9, -beat * 2.5); const top = block(ctx, sx, sy, 2, '#23232f', accent, 0.7); faceWrap(() => { ctx.fillStyle = hexA(accent, 0.6 + Math.abs(Math.sin(t * 0.15)) * 0.4); ctx.beginPath(); ctx.arc(sx + 8, top + 26, 6, 0, Math.PI * 2); ctx.fill(); }); ctx.restore(); break; }
    case 'tv': drawTV(ctx, sx, sy, accent, d.color, t, dir); break;
    case 'pacman': drawPacman(ctx, sx, sy, accent, d.color, t, dir); break;
    case 'retrocab': drawRetroArcadeCab(ctx, sx, sy, accent, d.color, t, dir); break;
    case 'arcsign': drawArcadeSign(ctx, sx, sy, accent, d.color, t, dir); break;
    case 'neonsign': drawNeonSignArcade(ctx, sx, sy, accent, d.color, t, dir); break;
    case 'cashvault': drawCashVault(ctx, sx, sy, accent, d.color, t, dir); break;
    case 'clorack': drawCloRack(ctx, sx, sy, accent, d.color); break;
    case 'clorail': drawCloRail(ctx, sx, sy, accent, d.color, dir); break;
    case 'mannequin': drawMannequin(ctx, sx, sy, accent, d.color, dir); break;
    case 'leaders': drawLeaders(ctx, sx, sy, accent, d.color, dir); break;
    case 'clotable': drawCloTable(ctx, sx, sy, accent, d.color, dir); break;
    case 'shoewall': drawShoeWall(ctx, sx, sy, accent, d.color, dir); break;
    case 'fitroom': drawFitRoom(ctx, sx, sy, accent, d.color, dir); break;
    case 'clocounter': drawCloCounter(ctx, sx, sy, accent, d.color, dir); break;
    case 'plinth': drawPlinth(ctx, sx, sy, accent, d.color, dir); break;
    case 'perfume': drawPerfume(ctx, sx, sy, accent, d.color, dir); break;
    case 'jewelcase': drawJewelCase(ctx, sx, sy, accent, d.color, dir); break;
    case 'goldmirror': drawGoldMirror(ctx, sx, sy, accent, d.color, dir); break;
    case 'velvetbench': drawVelvetBench(ctx, sx, sy, accent, d.color, dir); break;
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
    case 'vending': drawVending(ctx, sx, sy, accent, d.color, dir); break;
    case 'jukebox': {
      const top = boxAt(ctx, sx, sy, d.foot, d.foot, 2, d.color, accent);
      faceWrap(() => { ctx.fillStyle = shade(d.color, 1.4); ctx.beginPath(); ctx.ellipse(sx, top, TW * d.foot, TH * d.foot, 0, Math.PI, 0); ctx.fill(); for (let i = 0; i < 5; i++) { ctx.fillStyle = `hsl(${(t * 4 + i * 70) % 360},90%,62%)`; ctx.beginPath(); ctx.arc(sx - 12 + i * 6, top + 10, 2, 0, Math.PI * 2); ctx.fill(); } });
      break;
    }
    case 'frame': { const w = 18, h = 24, by = sy - 6; ctx.fillStyle = d.color; ctx.fillRect(sx - w / 2 - 3, by - h - 3, w + 6, h + 6); ctx.fillStyle = '#243a6a'; ctx.fillRect(sx - w / 2, by - h, w, h); ctx.fillStyle = hexA(accent, 0.5); ctx.fillRect(sx - w / 2 + 3, by - h + 4, w - 6, 5); break; }
    case 'trophy': { const cy = sy - 5; ctx.fillStyle = '#b88a14'; ctx.fillRect(sx - 6, cy - 2, 12, 4); ctx.fillStyle = d.color; ctx.fillRect(sx - 2, cy - 11, 4, 9); ctx.beginPath(); ctx.moveTo(sx - 9, cy - 24); ctx.quadraticCurveTo(sx, cy - 9, sx + 9, cy - 24); ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#fff3a0'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(sx - 9, cy - 20, 4, Math.PI * 0.4, Math.PI * 1.5); ctx.stroke(); ctx.beginPath(); ctx.arc(sx + 9, cy - 20, 4, -Math.PI * 0.5, Math.PI * 0.6); ctx.stroke(); break; }
    case 'vase': { const cy = sy - 4; ctx.fillStyle = d.color; ctx.beginPath(); ctx.moveTo(sx - 7, cy); ctx.quadraticCurveTo(sx - 13, cy - 13, sx - 4, cy - 22); ctx.lineTo(sx + 4, cy - 22); ctx.quadraticCurveTo(sx + 13, cy - 13, sx + 7, cy); ctx.closePath(); ctx.fill(); ctx.strokeStyle = shade(d.color, 1.35); ctx.lineWidth = 1; ctx.stroke(); break; }
    case 'duck': drawDuck(ctx, sx, sy, accent, d.color, dir); break;
    case 'cone': { const cy = sy - 2; ctx.fillStyle = d.color; ctx.beginPath(); ctx.moveTo(sx, cy - 28); ctx.lineTo(sx + 10, cy); ctx.lineTo(sx - 10, cy); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(sx - 6, cy - 13); ctx.lineTo(sx + 6, cy - 13); ctx.lineTo(sx + 5, cy - 9); ctx.lineTo(sx - 5, cy - 9); ctx.closePath(); ctx.fill(); ctx.fillStyle = shade(d.color, 0.8); ctx.fillRect(sx - 12, cy - 2, 24, 4); break; }
    case 'statue': drawStatue(ctx, sx, sy, accent, d.color, dir); break;
    case 'goldblock': {
      const hw = TW * d.foot, hh = TH * d.foot, Hh = d.h * STACK_H, cyTop = sy - Hh;
      block(ctx, sx, sy, d.h, d.color, accent, d.foot, undefined, true);
      ctx.strokeStyle = GOLD; ctx.lineWidth = 1.5; ctx.lineJoin = 'round';
      const y1 = cyTop + Hh / 3, y2 = sy - Hh / 3;
      ctx.beginPath();
      ctx.moveTo(sx - hw, y1); ctx.lineTo(sx, y1 + hh); ctx.lineTo(sx + hw, y1);
      ctx.moveTo(sx - hw, y2); ctx.lineTo(sx, y2 + hh); ctx.lineTo(sx + hw, y2);
      ctx.stroke();
      break;
    }
    case 'rubbish': {
      // Three lumpy bin bags — back pair, then front bag on top
      const bag = (bx: number, by: number, rx: number, ry: number, sf: number) => {
        ctx.fillStyle = shade(d.color, sf);
        ctx.beginPath(); ctx.ellipse(sx + bx, sy + by, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = shade(d.color, sf * 0.45); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.ellipse(sx + bx, sy + by - ry * 0.72, rx * 0.28, ry * 0.13, 0, 0, Math.PI * 2); ctx.stroke();  // tie
      };
      bag(-9, -13, 8, 11, 0.85); bag(9, -11, 8, 11, 1.0); bag(0, -9, 10, 13, 0.95);
      break;
    }
    case 'trashcan': {
      const top = boxAt(ctx, sx, sy, 0.38, 0.38, 0.9, d.color, accent);
      // lid — slightly wider and cocked to one side
      ctx.fillStyle = shade(d.color, 1.3); diamond(ctx, sx + 1, top - 2, TW * 0.44, TH * 0.44); ctx.fill();
      // horizontal ridges on the body
      ctx.strokeStyle = shade(d.color, 0.4); ctx.lineWidth = 0.8;
      [0.33, 0.66].forEach(f => { const yy = sy + (top - sy) * f; ctx.beginPath(); ctx.moveTo(sx - TW * 0.38, yy); ctx.lineTo(sx, yy + TH * 0.38); ctx.lineTo(sx + TW * 0.38, yy); ctx.stroke(); });
      // rubbish sticking out the top
      ctx.strokeStyle = '#5a3a1e'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(sx - 3, top); ctx.lineTo(sx - 5, top - 8); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(sx + 4, top + 1); ctx.lineTo(sx + 7, top - 6); ctx.stroke();
      break;
    }
    case 'newspaper': {
      // Three crumpled sheets scattered on the floor
      const sheet = (ox: number, oy: number, hw: number, hh: number) => {
        diamond(ctx, sx + ox, sy + oy, hw, hh); ctx.fillStyle = d.color; ctx.fill();
        ctx.strokeStyle = shade(d.color, 0.5); ctx.lineWidth = 0.7;
        for (let r = -1; r <= 1; r++) { ctx.beginPath(); ctx.moveTo(sx + ox - hw * 0.65, sy + oy + r * hh * 0.33); ctx.lineTo(sx + ox + hw * 0.65, sy + oy + r * hh * 0.33); ctx.stroke(); }
        ctx.strokeStyle = shade(d.color, 0.72); ctx.lineWidth = 0.5; diamond(ctx, sx + ox, sy + oy, hw, hh); ctx.stroke();
      };
      sheet(-10, -2, 14, 9); sheet(7, -3, 11, 7); sheet(-2, 5, 13, 8);
      break;
    }
    case 'puddle': {
      // Shallow dirty puddle with animated ripples (in ANIMATED set)
      const ph = Math.sin(t * 0.07) * 0.5 + 0.5;
      const hw = TW * 0.86, hh = TH * 0.7;
      diamond(ctx, sx, sy, hw, hh); ctx.fillStyle = d.color; ctx.fill();
      ctx.save();
      ctx.fillStyle = hexA('#b0ccd8', 0.08 + ph * 0.1); diamond(ctx, sx, sy, hw, hh); ctx.fill();
      ctx.strokeStyle = hexA('#c8dde8', 0.18 + ph * 0.22); ctx.lineWidth = 0.8;
      diamond(ctx, sx, sy, hw * 0.55, hh * 0.55); ctx.stroke();
      diamond(ctx, sx + 5, sy + 2, hw * 0.28, hh * 0.25); ctx.stroke();
      ctx.restore();
      break;
    }
    case 'fishbone': {
      // A picked-clean fishbone on the ground
      const col = d.color, by = sy - 3;
      ctx.strokeStyle = col; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(sx - 14, by); ctx.lineTo(sx + 12, by); ctx.stroke();
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.moveTo(sx - 14, by); ctx.lineTo(sx - 21, by - 6); ctx.lineTo(sx - 21, by + 6); ctx.closePath(); ctx.fill();  // tail
      ctx.lineWidth = 1;
      for (let i = 0; i < 5; i++) { const rx = sx - 7 + i * 5, ang = i % 2 === 0 ? 6 : -6; ctx.beginPath(); ctx.moveTo(rx, by); ctx.lineTo(rx - 2, by + ang); ctx.stroke(); ctx.beginPath(); ctx.moveTo(rx, by); ctx.lineTo(rx - 2, by - ang); ctx.stroke(); }
      ctx.beginPath(); ctx.arc(sx + 12, by, 3, 0, Math.PI * 2); ctx.fillStyle = shade(col, 1.1); ctx.fill();  // head
      break;
    }
    case 'brokenbottle': {
      // Scattered glass shards with a periodic glint (in ANIMATED set)
      const col = d.color;
      const shard = (ox: number, oy: number, pts: [number, number][]) => {
        ctx.beginPath(); ctx.moveTo(sx + ox + pts[0][0], sy + oy + pts[0][1]);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(sx + ox + pts[i][0], sy + oy + pts[i][1]);
        ctx.closePath(); ctx.fillStyle = hexA(col, 0.65); ctx.fill();
        ctx.strokeStyle = hexA(col, 0.35); ctx.lineWidth = 0.5; ctx.stroke();
      };
      shard(-6, -4, [[-4, 0], [0, -5], [5, 2], [2, 6]]);
      shard(5, -2, [[0, -4], [4, 0], [1, 5], [-4, 2]]);
      shard(-2, 5, [[-5, 0], [0, -4], [4, 1], [0, 5]]);
      shard(1, -2, [[-2, -7], [2, -5], [3, 1], [-1, 3], [-3, -1]]);
      const glint = Math.abs(Math.sin(t * 0.09 + 1.3));
      if (glint > 0.8) { ctx.save(); ctx.globalAlpha = (glint - 0.8) / 0.2; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(sx + 3, sy - 8); ctx.lineTo(sx + 4, sy - 4); ctx.lineTo(sx + 3, sy); ctx.lineTo(sx + 2, sy - 4); ctx.closePath(); ctx.fill(); ctx.restore(); }
      break;
    }
    case 'oilstain': {
      // Iridescent rainbow oil slick (in ANIMATED set)
      const hw = TW * 0.9, hh = TH * 0.72;
      diamond(ctx, sx, sy, hw, hh); ctx.fillStyle = d.color; ctx.fill();
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const hue = (t * 1.5) % 360;
      ctx.fillStyle = `hsla(${hue},90%,55%,0.12)`; diamond(ctx, sx, sy, hw, hh); ctx.fill();
      ctx.fillStyle = `hsla(${(hue + 120) % 360},90%,55%,0.09)`; diamond(ctx, sx - 4, sy + 2, hw * 0.7, hh * 0.58); ctx.fill();
      ctx.fillStyle = `hsla(${(hue + 240) % 360},90%,55%,0.1)`; diamond(ctx, sx + 5, sy - 3, hw * 0.5, hh * 0.42); ctx.fill();
      ctx.restore();
      break;
    }
    case 'shoppingcart': {
      // 2×1 tile shopping cart — wire-grid basket, rust brackets, handle at u=+1 end
      const col = d.color, bkt = '#b84828', bH = 0.82;
      const Pt = (u: number, v: number, z: number): number[] => [sx + (u - v) * TW, sy + (u + v) * TH - z * STACK_H];
      // Wire grid: rectangular holes punched into a parallelogram face using fQuad
      const wireGrid = (F: number[][], cols: number, rows: number) => {
        const w = 0.13;
        for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) {
          fQuad(ctx, F, c / cols + w * 0.6, (c + 1) / cols - w * 0.6, r / rows + w * 1.1, (r + 1) / rows - w * 1.1, 'rgba(8,12,18,0.58)');
        }
      };
      // Left face — long side (v = +0.5), 5×3 hole grid
      const FL: number[][] = [Pt(-1, 0.5, 0), Pt(1, 0.5, 0), Pt(1, 0.5, bH), Pt(-1, 0.5, bH)];
      poly(ctx, FL, shade(col, 0.5)); wireGrid(FL, 5, 3);
      // Right face — short handle-end (u = +1), 2×3 hole grid
      const FR: number[][] = [Pt(1, 0.5, 0), Pt(1, -0.5, 0), Pt(1, -0.5, bH), Pt(1, 0.5, bH)];
      poly(ctx, FR, shade(col, 0.7)); wireGrid(FR, 2, 3);
      // Top rim outline (open basket top)
      const rim = [Pt(-1, -0.5, bH), Pt(1, -0.5, bH), Pt(1, 0.5, bH), Pt(-1, 0.5, bH)];
      ctx.strokeStyle = shade(col, 1.22); ctx.lineWidth = 2.5; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(rim[0][0], rim[0][1]); for (let i = 1; i < rim.length; i++) ctx.lineTo(rim[i][0], rim[i][1]); ctx.closePath(); ctx.stroke();
      // Corner posts + bracket squares
      ctx.lineCap = 'round';
      for (const [u, v] of [[-1, 0.5], [1, 0.5], [1, -0.5]] as [number, number][]) {
        const b = Pt(u, v, 0), tp = Pt(u, v, bH);
        ctx.strokeStyle = bkt; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(b[0], b[1]); ctx.lineTo(tp[0], tp[1]); ctx.stroke();
        ctx.fillStyle = bkt; ctx.fillRect(tp[0] - 3, tp[1] - 3, 6, 6); ctx.fillRect(b[0] - 3, b[1] - 3, 6, 6);
      }
      // Handle — two posts rising from the u=+1 end, joined by a horizontal bar
      const hs1 = Pt(1, -0.28, bH), hs2 = Pt(1, 0.28, bH);
      const h1 = Pt(1, -0.28, bH + 0.42), h2 = Pt(1, 0.28, bH + 0.42);
      ctx.strokeStyle = bkt; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(hs1[0], hs1[1]); ctx.lineTo(h1[0], h1[1]); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(hs2[0], hs2[1]); ctx.lineTo(h2[0], h2[1]); ctx.stroke();
      ctx.strokeStyle = shade(col, 1.22); ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(h1[0], h1[1]); ctx.lineTo(h2[0], h2[1]); ctx.stroke();
      ctx.lineCap = 'butt';
      // Wheels — 4 dark ellipses at basket corners
      ctx.fillStyle = '#1a1a1a';
      for (const [u, v] of [[-1, 0.5], [1, 0.5], [-1, -0.5], [1, -0.5]] as [number, number][]) {
        const wp = Pt(u, v, 0); ctx.beginPath(); ctx.ellipse(wp[0], wp[1] + 3, 4.5, 2.8, 0, 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
    case 'graffiti': {
      // Spray-paint tag on the floor
      ctx.save(); ctx.strokeStyle = d.color; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      const strokes: [number, number][][] = [
        [[sx - 18, sy - 4], [sx - 10, sy - 9], [sx + 2, sy - 2], [sx + 10, sy - 9], [sx + 18, sy - 3]],
        [[sx - 14, sy + 3], [sx - 6, sy - 5], [sx + 6, sy + 4], [sx + 14, sy - 3]],
        [[sx - 8, sy + 6], [sx + 1, sy], [sx + 8, sy + 5]],
      ];
      for (const s of strokes) { ctx.beginPath(); ctx.moveTo(s[0][0], s[0][1]); for (let i = 1; i < s.length; i++) ctx.lineTo(s[i][0], s[i][1]); ctx.stroke(); }
      ctx.globalAlpha = 0.28; ctx.fillStyle = d.color;
      for (let i = 0; i < 10; i++) { const ox = ((i * 73 + 13) % 44) - 22, oy = ((i * 47 + 7) % 24) - 12; ctx.beginPath(); ctx.arc(sx + ox, sy + oy, 1 + (i % 3) * 0.5, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
      break;
    }
    case 'pigeon': {
      // Head-bobbing pigeon (in ANIMATED set)
      const col = d.color, py = sy - 7, bob = Math.sin(t * 0.18) * 2.5;
      ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(sx, py, 9, 6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = shade(col, 1.18); ctx.beginPath(); ctx.ellipse(sx - 2, py - 1, 6, 3.5, 0, 0, Math.PI * 2); ctx.fill();  // wing sheen
      ctx.fillStyle = shade(col, 0.78); ctx.beginPath(); ctx.moveTo(sx - 7, py); ctx.lineTo(sx - 14, py + 3); ctx.lineTo(sx - 12, py - 3); ctx.closePath(); ctx.fill();  // tail
      const [hx, hy] = [sx + 8, py - 5 + bob];
      ctx.fillStyle = shade(col, 1.12); ctx.beginPath(); ctx.arc(hx, hy, 4, 0, Math.PI * 2); ctx.fill();  // head
      ctx.fillStyle = '#c8a040'; ctx.beginPath(); ctx.moveTo(hx + 3, hy); ctx.lineTo(hx + 8, hy + 1); ctx.lineTo(hx + 4, hy + 2); ctx.closePath(); ctx.fill();  // beak
      ctx.fillStyle = '#1a1a1a'; ctx.beginPath(); ctx.arc(hx + 2, hy - 1, 1.2, 0, Math.PI * 2); ctx.fill();  // eye
      ctx.strokeStyle = '#c8a040'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(sx + 2, py + 5); ctx.lineTo(sx, py + 10); ctx.lineTo(sx - 4, py + 11); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(sx - 3, py + 5); ctx.lineTo(sx - 5, py + 10); ctx.lineTo(sx - 9, py + 11); ctx.stroke();
      break;
    }
    case 'drain': {
      const col = d.color, hw = TW * 0.76, hh = TH * 0.76;
      diamond(ctx, sx, sy, hw, hh); ctx.fillStyle = col; ctx.fill();
      ctx.strokeStyle = shade(col, 0.28); ctx.lineWidth = 1.5;
      for (let i = -2; i <= 2; i++) { const oy = i * hh * 0.32; ctx.beginPath(); ctx.moveTo(sx - hw * 0.82, sy + oy); ctx.lineTo(sx + hw * 0.82, sy + oy); ctx.stroke(); }  // grate slots
      ctx.strokeStyle = shade(col, 1.22); ctx.lineWidth = 1;
      diamond(ctx, sx, sy, hw, hh); ctx.stroke(); diamond(ctx, sx, sy, hw * 0.88, hh * 0.88); ctx.stroke();
      break;
    }
    case 'dumpster': {
      // Large 2×1 wheeled dumpster — corrugated sides, split lid with front panel ajar
      const col = d.color, dH = 1.65;
      const Pt = (u: number, v: number, z: number): number[] => [sx + (u - v) * TW, sy + (u + v) * TH - z * STACK_H];
      // Left face (v = +0.5) — long side
      const FL: number[][] = [Pt(-1, 0.5, 0), Pt(1, 0.5, 0), Pt(1, 0.5, dH), Pt(-1, 0.5, dH)];
      poly(ctx, FL, shade(col, 0.54));
      for (const r of [0.28, 0.56]) { fQuad(ctx, FL, 0, 1, r - 0.036, r + 0.036, shade(col, 0.38)); fQuad(ctx, FL, 0, 1, r, r + 0.02, shade(col, 0.68)); }
      // Right face (u = +1) — short end
      const FR: number[][] = [Pt(1, 0.5, 0), Pt(1, -0.5, 0), Pt(1, -0.5, dH), Pt(1, 0.5, dH)];
      poly(ctx, FR, shade(col, 0.7));
      for (const r of [0.28, 0.56]) { fQuad(ctx, FR, 0, 1, r - 0.036, r + 0.036, shade(col, 0.54)); fQuad(ctx, FR, 0, 1, r, r + 0.02, shade(col, 0.86)); }
      // Lid — back half flat, front half propped ajar
      const ajar = 0.3;
      poly(ctx, [Pt(-1, -0.5, dH), Pt(1, -0.5, dH), Pt(1, 0, dH), Pt(-1, 0, dH)], shade(col, 0.92));  // back lid
      poly(ctx, [Pt(-1, 0, dH), Pt(1, 0, dH), Pt(1, 0.5, dH + ajar), Pt(-1, 0.5, dH + ajar)], shade(col, 1.08));  // front lid ajar
      // Dark interior glimpse under the open front lid
      poly(ctx, [Pt(-1, 0, dH - 0.06), Pt(1, 0, dH - 0.06), Pt(1, 0.34, dH - 0.12), Pt(-1, 0.34, dH - 0.12)], '#060a06');
      // Hinge seam between the two lids
      const [h0, h1] = [Pt(-1, 0, dH), Pt(1, 0, dH)];
      ctx.strokeStyle = shade(col, 0.3); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(h0[0], h0[1]); ctx.lineTo(h1[0], h1[1]); ctx.stroke();
      // Vertical frame posts at visible corners
      ctx.strokeStyle = shade(col, 1.12); ctx.lineWidth = 2.5; ctx.lineCap = 'round';
      for (const [u, v] of [[-1, 0.5], [1, 0.5], [1, -0.5]] as [number, number][]) {
        const b = Pt(u, v, 0), tp = Pt(u, v, dH); ctx.beginPath(); ctx.moveTo(b[0], b[1]); ctx.lineTo(tp[0], tp[1]); ctx.stroke();
      }
      ctx.lineCap = 'butt';
      // Wheels/casters
      ctx.fillStyle = '#111';
      for (const [u, v] of [[-0.78, 0.5], [0.78, 0.5], [-0.78, -0.5], [0.78, -0.5]] as [number, number][]) {
        const wp = Pt(u, v, 0); ctx.beginPath(); ctx.ellipse(wp[0], wp[1] + 5, 5.5, 3.5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#333'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.ellipse(wp[0], wp[1] + 5, 5.5, 3.5, 0, 0, Math.PI * 2); ctx.stroke();
      }
      break;
    }
    case 'mattress': {
      // Old mattress lying flat — 2×1 footprint, ticking stripes, brown stains
      const col = d.color, mH = 0.2;
      const Pt = (u: number, v: number, z: number): number[] => [sx + (u - v) * TW, sy + (u + v) * TH - z * STACK_H];
      // Thin left face (v = +0.5)
      poly(ctx, [Pt(-1, 0.5, 0), Pt(1, 0.5, 0), Pt(1, 0.5, mH), Pt(-1, 0.5, mH)], shade(col, 0.52));
      // Thin right face (u = +1)
      poly(ctx, [Pt(1, 0.5, 0), Pt(1, -0.5, 0), Pt(1, -0.5, mH), Pt(1, 0.5, mH)], shade(col, 0.68));
      // Top face — main mattress surface
      const FT: number[][] = [Pt(-1, -0.5, mH), Pt(1, -0.5, mH), Pt(1, 0.5, mH), Pt(-1, 0.5, mH)];
      poly(ctx, FT, shade(col, 1.06));
      // Ticking stripes (blue-gray bands along the length)
      const sc = hexA('#6878a0', 0.45);
      for (let i = 0; i < 3; i++) { const x0 = i / 3 + 0.03; fQuad(ctx, FT, x0, x0 + 0.14, 0, 1, sc); }
      // Horizontal seam lines
      fLine(ctx, FT, 0, 0.14, 1, 0.14, shade(col, 0.6), 0.6);
      fLine(ctx, FT, 0, 0.86, 1, 0.86, shade(col, 0.6), 0.6);
      // Stains — dirty brown blotches
      fQuad(ctx, FT, 0.52, 0.70, 0.25, 0.55, 'rgba(88,60,18,0.36)');
      fQuad(ctx, FT, 0.16, 0.27, 0.58, 0.76, 'rgba(70,48,12,0.28)');
      // Sagging dip in the centre (subtle dark)
      fQuad(ctx, FT, 0.28, 0.72, 0.28, 0.72, 'rgba(0,0,0,0.07)');
      // Border piping around top edge
      ctx.strokeStyle = shade(col, 0.65); ctx.lineWidth = 1.5; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(FT[0][0], FT[0][1]); for (let i = 1; i < FT.length; i++) ctx.lineTo(FT[i][0], FT[i][1]); ctx.closePath(); ctx.stroke();
      break;
    }
    case 'manhole': {
      const col = d.color, hw = TW * 0.68, hh = TH * 0.68;
      diamond(ctx, sx, sy, hw, hh); ctx.fillStyle = col; ctx.fill();
      ctx.strokeStyle = shade(col, 1.28); ctx.lineWidth = 1;
      for (const f of [0.84, 0.64, 0.38]) { diamond(ctx, sx, sy, hw * f, hh * f); ctx.stroke(); }  // concentric rings
      ctx.strokeStyle = shade(col, 0.44); ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(sx - hw * 0.68, sy); ctx.lineTo(sx + hw * 0.68, sy); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(sx, sy - hh * 0.68); ctx.lineTo(sx, sy + hh * 0.68); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(sx - hw * 0.5, sy - hh * 0.5); ctx.lineTo(sx + hw * 0.5, sy + hh * 0.5); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(sx - hw * 0.5, sy + hh * 0.5); ctx.lineTo(sx + hw * 0.5, sy - hh * 0.5); ctx.stroke();  // ribs
      ctx.fillStyle = shade(col, 0.32);
      for (const [bx, by] of [[0, -hh * 0.78], [hw * 0.78, 0], [0, hh * 0.78], [-hw * 0.78, 0]] as [number, number][]) { ctx.beginPath(); ctx.arc(sx + bx, sy + by, 2, 0, Math.PI * 2); ctx.fill(); }  // bolts
      break;
    }
    case 'trashblock': {
      const col = d.color;
      const hw = TW * d.foot, hh = TH * d.foot, Hh = d.h * STACK_H;
      block(ctx, sx, sy, d.h, col, accent, d.foot);
      // Horizontal compression layer lines
      ctx.lineWidth = 0.8;
      const nLines = d.h * 3 + 1;
      for (let i = 1; i < nLines; i++) {
        const dy = -(i / nLines) * Hh;
        ctx.strokeStyle = i % 2 === 0 ? shade(col, 0.28) : shade(col, 0.44);
        ctx.beginPath(); ctx.moveTo(sx - hw, sy + dy); ctx.lineTo(sx, sy + hh + dy); ctx.lineTo(sx + hw, sy + dy); ctx.stroke();
      }
      // Coloured junk bits visible on the top face
      const topY = sy - Hh;
      ctx.fillStyle = '#8a3a1a'; ctx.fillRect(sx - 5, topY - 2, 7, 2);
      ctx.fillStyle = '#6a6a4a'; ctx.fillRect(sx + 3, topY + 1, 4, 2);
      ctx.fillStyle = '#c89860'; ctx.fillRect(sx - 2, topY - 3, 5, 1.5);
      ctx.fillStyle = '#3a5a3a'; ctx.fillRect(sx + 5, topY - 1, 3, 1.8);
      break;
    }
    case 'forklift': {
      const col = d.color;
      const Pt = (u: number, v: number, z: number): number[] => [sx + (u - v) * TW, sy + (u + v) * TH - z * STACK_H];
      // Wheels
      ctx.fillStyle = '#111';
      for (const [wu, wv] of [[-1.7, 0.85], [-1.7, -0.85], [1.65, 0.85], [1.65, -0.85]] as [number, number][]) {
        const wp = Pt(wu, wv, 0);
        ctx.beginPath(); ctx.ellipse(wp[0], wp[1] + 3, 7, 4.5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#2a2a2a'; ctx.beginPath(); ctx.ellipse(wp[0], wp[1] + 3, 4, 2.5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#111';
      }
      // Forks (two flat beams extending forward)
      const fW = 0.11, fH = 0.15;
      for (const fv of [-0.3, 0.3] as number[]) {
        poly(ctx, [Pt(-2, fv - fW, fH), Pt(-0.05, fv - fW, fH), Pt(-0.05, fv + fW, fH), Pt(-2, fv + fW, fH)], shade(col, 0.9));
        poly(ctx, [Pt(-2, fv + fW, 0), Pt(-0.05, fv + fW, 0), Pt(-0.05, fv + fW, fH), Pt(-2, fv + fW, fH)], shade(col, 0.55));
        poly(ctx, [Pt(-2, fv - fW, 0), Pt(-2, fv + fW, 0), Pt(-2, fv + fW, fH), Pt(-2, fv - fW, fH)], shade(col, 0.7));
      }
      // Fork carriage
      const fcH = 0.6;
      poly(ctx, [Pt(-0.05, 0.5, 0), Pt(0.1, 0.5, 0), Pt(0.1, 0.5, fcH), Pt(-0.05, 0.5, fcH)], shade(col, 0.55));
      poly(ctx, [Pt(0.1, 0.5, 0), Pt(0.1, -0.5, 0), Pt(0.1, -0.5, fcH), Pt(0.1, 0.5, fcH)], shade(col, 0.72));
      poly(ctx, [Pt(-0.05, -0.5, fcH), Pt(0.1, -0.5, fcH), Pt(0.1, 0.5, fcH), Pt(-0.05, 0.5, fcH)], shade(col, 0.9));
      // Mast posts
      const mastH = 2.35;
      for (const mv of [-0.88, 0.88] as number[]) {
        poly(ctx, [Pt(0, mv + 0.07, 0), Pt(0.12, mv + 0.07, 0), Pt(0.12, mv + 0.07, mastH), Pt(0, mv + 0.07, mastH)], shade(col, 0.56));
        poly(ctx, [Pt(0.12, mv - 0.07, 0), Pt(0.12, mv + 0.07, 0), Pt(0.12, mv + 0.07, mastH), Pt(0.12, mv - 0.07, mastH)], shade(col, 0.72));
        poly(ctx, [Pt(0, mv - 0.07, mastH), Pt(0.12, mv - 0.07, mastH), Pt(0.12, mv + 0.07, mastH), Pt(0, mv + 0.07, mastH)], shade(col, 0.9));
      }
      // Mast cross bars
      for (const mz of [0.6, 1.2, 1.8, 2.25] as number[]) {
        poly(ctx, [Pt(0, -0.88, mz), Pt(0, 0.88, mz), Pt(0, 0.88, mz + 0.06), Pt(0, -0.88, mz + 0.06)], shade(col, 0.5));
      }
      // Cab body
      const cabH = 1.12;
      poly(ctx, [Pt(0.12, 1, 0), Pt(2, 1, 0), Pt(2, 1, cabH), Pt(0.12, 1, cabH)], shade(col, 0.52));
      poly(ctx, [Pt(2, 1, 0), Pt(2, -1, 0), Pt(2, -1, cabH), Pt(2, 1, cabH)], shade(col, 0.7));
      poly(ctx, [Pt(0.12, -1, cabH), Pt(2, -1, cabH), Pt(2, 1, cabH), Pt(0.12, 1, cabH)], shade(col, 1.08));
      // Cab front face + windshield glass
      const WF: number[][] = [Pt(0.12, 1, 0), Pt(0.12, -1, 0), Pt(0.12, -1, cabH), Pt(0.12, 1, cabH)];
      poly(ctx, WF, shade(col, 0.38));
      fQuad(ctx, WF, 0.08, 0.92, 0.22, 0.84, hexA('#7ad8f0', 0.42));
      // Overhead guard frame
      const ogZ = cabH + 0.08;
      ctx.strokeStyle = shade(col, 0.88); ctx.lineWidth = 2.5; ctx.lineCap = 'round';
      const ogC: [number, number][] = [[0.12, 1], [2, 1], [2, -1], [0.12, -1]];
      const fp0 = Pt(ogC[0][0], ogC[0][1], ogZ); ctx.beginPath(); ctx.moveTo(fp0[0], fp0[1]);
      for (let i = 1; i < ogC.length; i++) { const fp = Pt(ogC[i][0], ogC[i][1], ogZ); ctx.lineTo(fp[0], fp[1]); }
      ctx.closePath(); ctx.stroke();
      for (const [cu, cv] of ogC) {
        const bot = Pt(cu, cv, cabH - 0.02), top = Pt(cu, cv, ogZ);
        ctx.beginPath(); ctx.moveTo(bot[0], bot[1]); ctx.lineTo(top[0], top[1]); ctx.stroke();
      }
      ctx.lineCap = 'butt';
      // Counterweight
      const cw = '#3a3838';
      poly(ctx, [Pt(1.65, 1, 0), Pt(2, 1, 0), Pt(2, 1, 0.5), Pt(1.65, 1, 0.5)], shade(cw, 0.8));
      poly(ctx, [Pt(2, 1, 0), Pt(2, -1, 0), Pt(2, -1, 0.5), Pt(2, 1, 0.5)], shade(cw, 1.0));
      poly(ctx, [Pt(1.65, -1, 0.5), Pt(2, -1, 0.5), Pt(2, 1, 0.5), Pt(1.65, 1, 0.5)], shade(cw, 1.15));
      break;
    }
    case 'rustycar': {
      const col = d.color;
      const Pt = (u: number, v: number, z: number): number[] => [sx + (u - v) * TW, sy + (u + v) * TH - z * STACK_H];
      const S = (v: number, z: number) => Pt(1, v, z);   // side face at u=1 (car drives along v)
      const F = (u: number, z: number) => Pt(u, 2, z);   // front face at v=2 (faces bottom-left)
      const Z = 1.6;    // chassis/hood/trunk height
      const ZR = 2.6;   // roof height
      const WR = 0.5;   // wheel radius (tile units)
      const wRot = Math.atan2(TH, TW);                          // ≈ 0.4636 rad — iso projection tilt
      const wRx = WR * Math.sqrt(TW * TW + TH * TH);           // ≈ 17.9px semi-major
      const wRy = WR * STACK_H;                                 // = 13px semi-minor
      // Front face — chamfered bottom-left corner avoids clipping artefact
      poly(ctx, [F(-0.75, 0), F(1, 0), F(1, Z), F(-1, Z), F(-1, 0.15)], shade(col, 0.52));
      const headlight = (uu: number) => {
        const p = F(uu, Z * 0.62);
        ctx.fillStyle = '#1c1818'; ctx.beginPath(); ctx.ellipse(p[0], p[1], 8, 5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(220,200,100,0.32)'; ctx.beginPath(); ctx.ellipse(p[0] - 1, p[1] - 1, 4, 2.5, 0, 0, Math.PI * 2); ctx.fill();
      };
      headlight(-0.65); headlight(0.65);
      for (let gi = 0; gi < 3; gi++) {
        const gz = Z * 0.08 + gi * Z * 0.13;
        poly(ctx, [F(-0.45, gz), F(0.45, gz), F(0.45, gz + Z * 0.065), F(-0.45, gz + Z * 0.065)], '#28261e');
      }
      poly(ctx, [F(-1, Z * 0.04), F(1, Z * 0.04), F(1, Z * 0.12), F(-1, Z * 0.12)], '#787868');
      // Side body — boxy sedan silhouette (front at v=2, rear at v=-2)
      poly(ctx, [
        S(2, 0), S(2, Z),
        S(0.6, Z), S(0.0, ZR),
        S(-1.0, ZR), S(-1.6, Z),
        S(-2, Z), S(-2, 0),
      ], col);
      // Windshield glass (prominent A-pillar panel)
      poly(ctx, [S(0.6, Z), S(0.0, ZR), S(-0.65, ZR), S(-0.05, Z)], hexA('#5ab0c8', 0.5));
      // Windshield cracks — zigzag + branch (coordinates scale with Z/ZR)
      ctx.strokeStyle = 'rgba(12,10,8,0.82)'; ctx.lineWidth = 1.2;
      ctx.beginPath();
      const wc = [
        S(0.45, Z + 0.06),
        S(0.1, Z + (ZR - Z) * 0.38),
        S(0.22, Z + (ZR - Z) * 0.23),
        S(-0.25, Z + (ZR - Z) * 0.82),
      ];
      ctx.moveTo(wc[0][0], wc[0][1]);
      for (let i = 1; i < wc.length; i++) ctx.lineTo(wc[i][0], wc[i][1]);
      const wb = [S(0.1, Z + (ZR - Z) * 0.38), S(-0.15, Z + (ZR - Z) * 0.90)];
      ctx.moveTo(wb[0][0], wb[0][1]); ctx.lineTo(wb[1][0], wb[1][1]);
      ctx.stroke();
      // Side door window (B-pillar to C-pillar)
      poly(ctx, [S(-0.05, Z), S(-0.05, ZR), S(-1.0, ZR), S(-1.0, Z)], hexA('#5ab0c8', 0.32));
      // Side window crack
      ctx.strokeStyle = 'rgba(12,10,8,0.55)'; ctx.lineWidth = 0.9;
      ctx.beginPath();
      const wsc = [S(-0.35, ZR - 0.22), S(-0.55, ZR - 0.62), S(-0.7, ZR - 0.44)];
      ctx.moveTo(wsc[0][0], wsc[0][1]);
      for (let i = 1; i < wsc.length; i++) ctx.lineTo(wsc[i][0], wsc[i][1]);
      ctx.stroke();
      // Rear quarter window (slanted C-pillar)
      poly(ctx, [S(-1.0, ZR), S(-1.6, Z), S(-1.78, Z), S(-1.18, ZR)], hexA('#5ab0c8', 0.28));
      // Door crease line
      ctx.strokeStyle = shade(col, 0.55); ctx.lineWidth = 0.8;
      const dl = [S(0.55, Z * 0.15), S(-1.55, Z * 0.15)];
      ctx.beginPath(); ctx.moveTo(dl[0][0], dl[0][1]); ctx.lineTo(dl[1][0], dl[1][1]); ctx.stroke();
      // Door handle
      const dh = [S(-0.3, Z * 0.35), S(-0.55, Z * 0.35)];
      ctx.strokeStyle = shade(col, 0.58); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(dh[0][0], dh[0][1]); ctx.lineTo(dh[1][0], dh[1][1]); ctx.stroke();
      // Wheel arch cutouts — tilted dark oval matching wheel shape
      ctx.fillStyle = '#0d0d0d';
      for (const vv of [1.3, -1.3] as number[]) {
        const ap = Pt(1, vv, WR);
        ctx.beginPath(); ctx.ellipse(ap[0], ap[1], wRx * 1.25, wRy * 1.25, wRot, 0, Math.PI * 2); ctx.fill();
      }
      // Rust patches
      ctx.fillStyle = 'rgba(72,26,8,0.52)';
      const rp1 = S(-0.5, Z * 0.32); ctx.beginPath(); ctx.ellipse(rp1[0], rp1[1], 12, 7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(55,20,6,0.48)';
      const rp2 = S(1.1, Z * 0.22); ctx.beginPath(); ctx.ellipse(rp2[0], rp2[1], 8, 5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(75,28,8,0.45)';
      const rp3 = S(-1.8, Z * 0.26); ctx.beginPath(); ctx.ellipse(rp3[0], rp3[1], 9, 5, 0, 0, Math.PI * 2); ctx.fill();
      // Top faces — hood, roof, trunk
      poly(ctx, [Pt(-1, 2, Z), Pt(1, 2, Z), Pt(1, 0.6, Z), Pt(-1, 0.6, Z)], shade(col, 0.9));
      poly(ctx, [Pt(-1, 0.0, ZR), Pt(1, 0.0, ZR), Pt(1, -1.0, ZR), Pt(-1, -1.0, ZR)], shade(col, 1.05));
      poly(ctx, [Pt(-1, -1.6, Z), Pt(1, -1.6, Z), Pt(1, -2, Z), Pt(-1, -2, Z)], shade(col, 0.88));
      // Wheels — proper iso tilted ellipses, centre lifted to wheel radius
      for (const vv of [1.3, -1.3] as number[]) {
        const wp = Pt(1, vv, WR);
        ctx.fillStyle = '#0a0808'; ctx.beginPath(); ctx.ellipse(wp[0], wp[1], wRx, wRy, wRot, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#2e2e2e'; ctx.beginPath(); ctx.ellipse(wp[0], wp[1], wRx * 0.62, wRy * 0.62, wRot, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#5a5050'; ctx.beginPath(); ctx.ellipse(wp[0], wp[1], wRx * 0.30, wRy * 0.30, wRot, 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
    case 'hazardsign': {
      const col = d.color;
      const postH = 1.72 * STACK_H;
      const pW = 3;
      // Post (three faces of a thin isometric column)
      ctx.fillStyle = '#4a4a4a';
      ctx.beginPath(); ctx.moveTo(sx - pW, sy); ctx.lineTo(sx, sy + pW * 0.5); ctx.lineTo(sx, sy - postH + pW * 0.5); ctx.lineTo(sx - pW, sy - postH); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#5a5a5a';
      ctx.beginPath(); ctx.moveTo(sx, sy + pW * 0.5); ctx.lineTo(sx + pW, sy); ctx.lineTo(sx + pW, sy - postH); ctx.lineTo(sx, sy - postH + pW * 0.5); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#6a6a6a';
      ctx.beginPath(); ctx.moveTo(sx - pW, sy - postH); ctx.lineTo(sx, sy - postH - pW * 0.5); ctx.lineTo(sx + pW, sy - postH); ctx.lineTo(sx, sy - postH + pW * 0.5); ctx.closePath(); ctx.fill();
      // Yellow warning diamond sign
      const sCX = sx, sCY = sy - postH - 22;
      const half = 17;
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.beginPath(); ctx.moveTo(sCX + 1, sCY - half + 1); ctx.lineTo(sCX + half + 1, sCY + 1); ctx.lineTo(sCX + 1, sCY + half + 1); ctx.lineTo(sCX - half + 1, sCY + 1); ctx.closePath(); ctx.fill();
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.moveTo(sCX, sCY - half); ctx.lineTo(sCX + half, sCY); ctx.lineTo(sCX, sCY + half); ctx.lineTo(sCX - half, sCY); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#1a1200'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(sCX, sCY - half); ctx.lineTo(sCX + half, sCY); ctx.lineTo(sCX, sCY + half); ctx.lineTo(sCX - half, sCY); ctx.closePath(); ctx.stroke();
      const ih = half - 3;
      ctx.strokeStyle = shade(col, 0.68); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(sCX, sCY - ih); ctx.lineTo(sCX + ih, sCY); ctx.lineTo(sCX, sCY + ih); ctx.lineTo(sCX - ih, sCY); ctx.closePath(); ctx.stroke();
      ctx.fillStyle = '#1a1200'; ctx.font = 'bold 19px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('!', sCX, sCY + 1);
      break;
    }
    default: kind.startsWith('blk_') ? drawBuilt(ctx, sx, sy, d.h, d.color, accent, d.foot, kind, null, 0, d.cat === 'constr') : block(ctx, sx, sy, d.h, d.color, accent, d.foot, undefined, d.cat === 'constr');
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// Sprite cache + quality pass. Static pieces are rendered ONCE to an offscreen canvas at 2×, with a
// baked dark keyline OUTLINE (8-way silhouette stamp) and a soft contact SHADOW — then blitted. This
// is what lifts the look toward Habbo (crisp edges + grounding) and lets each piece carry far more
// detail with no per-frame cost. Animated pieces (screens, flames, water, spin) still draw live.
// ═══════════════════════════════════════════════════════════════════════════════════════════
const SS = 2, SPR_W = 240, SPR_H = 300, OX = 120, OY = 224;   // sprite canvas + local tile-origin
const ANIMATED = new Set(['ball_hc', 'tv', 'laptop', 'pa', 'booth', 'lamp', 'lantern', 'speaker', 'disco', 'fountain', 'float', 'chandelier', 'water', 'jukebox', 'lavalamp', 'aquarium', 'fireplace', 'espresso', 'hottub', 'washer', 'holopod', 'teleporter', 'plasmalamp', 'welder', 'xmastree', 'candle', 'firepit', 'lavablock', 'voidblock', 'retrocab', 'duelcab', 'pacman', 'arcsign', 'neonsign', 'puddle', 'brokenbottle', 'oilstain', 'pigeon']);
// Urban floor props that sit flush with the ground — no contact shadow or outline
const NO_SHADOW = new Set(['newspaper', 'puddle', 'fishbone', 'brokenbottle', 'oilstain', 'graffiti', 'pigeon', 'drain', 'manhole', 'disco', 'ball_hc']);
const spriteCache = new Map<string, HTMLCanvasElement>();
const spriteOrder: string[] = []; const SPRITE_CAP = 140;
const mkCanvas = (w: number, h: number) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

function buildSprite(kind: string, accent: string, dir: number): HTMLCanvasElement {
  const W = SPR_W * SS, H = SPR_H * SS;
  // 1) the art on its own layer
  const art = mkCanvas(W, H); const ax = art.getContext('2d')!; ax.scale(SS, SS); drawRaw(ax, kind, OX, OY, accent, 0, dir);
  // 2) a solid dark silhouette of the art (for the outline)
  const sil = mkCanvas(W, H); const sc = sil.getContext('2d')!; sc.drawImage(art, 0, 0); sc.globalCompositeOperation = 'source-in'; sc.fillStyle = 'rgba(12,10,16,0.95)'; sc.fillRect(0, 0, W, H);
  // 3) compose: contact shadow → outline (silhouette stamped around) → art on top
  const out = mkCanvas(W, H); const cx = out.getContext('2d')!;
  if (defOf(kind).cat !== 'constr' && kind !== 'neonarch' && !NO_SHADOW.has(defOf(kind).special ?? '')) { cx.save(); cx.globalAlpha = 0.26; cx.fillStyle = '#000'; cx.beginPath(); cx.ellipse(OX * SS, OY * SS, TW * 0.82 * SS, TH * 0.72 * SS, 0, 0, Math.PI * 2); cx.fill(); cx.restore(); }
  if (defOf(kind).cat !== 'constr' && kind !== 'neonarch' && !NO_SHADOW.has(defOf(kind).special ?? '')) { const k = Math.round(1.6 * SS); for (let a = 0; a < 8; a++) cx.drawImage(sil, Math.round(Math.cos(a * Math.PI / 4) * k), Math.round(Math.sin(a * Math.PI / 4) * k)); }
  cx.drawImage(art, 0, 0);
  return out;
}

function getSprite(kind: string, accent: string, dir: number): HTMLCanvasElement {
  const key = `${kind}|${accent}|${dir}`;
  let c = spriteCache.get(key);
  if (!c) { c = buildSprite(kind, accent, dir); spriteCache.set(key, c); spriteOrder.push(key); if (spriteOrder.length > SPRITE_CAP) { const old = spriteOrder.shift(); if (old) spriteCache.delete(old); } }
  return c;
}

// Public entry: cached blit for static pieces (with baked outline + shadow); live draw for animated ones.
export function drawFurniSprite(ctx: CanvasRenderingContext2D, kind: string, sx: number, sy: number, accent: string, t: number, dir = 0) {
  const d = defOf(kind);
  // Hand-authored raster (PNG) or SVG art (with a soft contact shadow). Multi-tile pieces centre on
  // their footprint. PNGs already bake their own outline/shadow, so no extra contact ellipse for them.
  if (hasPng(kind)) {
    let cx = sx, cy = sy; const [esw, esh] = effSpan(kind, dir);
    if (esw !== 1 || esh !== 1) { const ocx = (esw - 1) / 2, ocy = (esh - 1) / 2; cx += (ocx - ocy) * TW; cy += (ocx + ocy) * TH; }
    if (drawPngFurni(ctx, kind, cx, cy)) return;   // fall through to procedural only until the image loads
  }
  if (hasSvg(kind)) {
    let cx = sx, cy = sy; const [esw, esh] = effSpan(kind, dir);
    if (esw !== 1 || esh !== 1) { const ocx = (esw - 1) / 2, ocy = (esh - 1) / 2; cx += (ocx - ocy) * TW; cy += (ocx + ocy) * TH; }
    ctx.save(); ctx.globalAlpha = 0.24; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(cx, cy, TW * (esw + esh) * 0.42, TH * 0.7, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    if (drawSvgFurni(ctx, kind, cx, cy)) return;   // fall through to procedural only until the image loads
  }
  if (ANIMATED.has(d.special ?? '')) {
    if (d.cat !== 'constr' && kind !== 'arcsign' && kind !== 'neonsign' && !NO_SHADOW.has(d.special ?? '')) { ctx.save(); ctx.globalAlpha = 0.22; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(sx, sy, TW * 0.72, TH * 0.62, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
    drawRaw(ctx, kind, sx, sy, accent, t, dir); return;
  }
  try { ctx.drawImage(getSprite(kind, accent, dir), 0, 0, SPR_W * SS, SPR_H * SS, sx - OX, sy - OY, SPR_W, SPR_H); }
  catch { drawRaw(ctx, kind, sx, sy, accent, t, dir); }   // fall back to live draw if offscreen canvas is unavailable
}
