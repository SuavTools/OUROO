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
  const cT = shade(base, 1.32), cR = shade(base, 0.98), cL = shade(base, 0.64), hi = shade(base, 1.62);
  const span = (u0: number, u1: number, v0: number, v1: number, z0: number, z1: number, t: string, r: string, l: string) => { poly(ctx, [P(u1, v0, z1), P(u1, v1, z1), P(u1, v1, z0), P(u1, v0, z0)], r); poly(ctx, [P(u0, v1, z1), P(u1, v1, z1), P(u1, v1, z0), P(u0, v1, z0)], l); poly(ctx, [P(u0, v0, z1), P(u1, v0, z1), P(u1, v1, z1), P(u0, v1, z1)], t); };
  // legs
  for (const [u, v] of [[-0.34, -0.3], [0.34, -0.3], [-0.34, 0.34], [0.34, 0.34]] as [number, number][]) span(u - 0.05, u + 0.05, v - 0.05, v + 0.05, 0, 0.16, '#3a2616', '#2a1c10', '#1f140a');
  // rolled side arm (thin, at a u-extreme so the seat stays clear)
  const arm = (uc: number) => {
    span(uc - 0.08, uc + 0.08, -0.44, 0.4, 0.3, 0.92, cT, cR, cL);
    const a = P(uc, -0.02, 0.92); const g = ctx.createRadialGradient(a[0] - 2, a[1] - 3, 1, a[0], a[1], TW * 0.34); g.addColorStop(0, hi); g.addColorStop(0.6, cT); g.addColorStop(1, cR);
    ctx.save(); ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(a[0], a[1], TW * 0.3, TH * 0.52, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  };
  span(-0.42, 0.42, -0.46, -0.26, 0.3, 1.4, cT, cR, cL);                  // back rest (full width)
  arm(-0.4);                                                             // left arm (behind)
  span(-0.32, 0.32, -0.24, -0.06, 0.44, 1.04, shade(base, 1.16), cR, cL); // back cushion
  span(-0.34, 0.34, -0.24, 0.4, 0.16, 0.46, cT, cR, cL);                 // seat base
  span(-0.3, 0.3, -0.2, 0.38, 0.46, 0.72, shade(base, 1.24), cR, cL);    // seat cushion (real sitting space)
  { const c = P(0, 0.08, 0.72); const g = ctx.createRadialGradient(c[0], c[1] - 3, 2, c[0], c[1], 24); g.addColorStop(0, hexA(hi, 0.5)); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(c[0], c[1], TW * 0.5, TH * 0.54, 0, 0, Math.PI * 2); ctx.fill(); poly(ctx, [P(-0.3, -0.2, 0.72), P(0.3, -0.2, 0.72), P(0.3, 0.38, 0.72), P(-0.3, 0.38, 0.72)], undefined, hexA(hi, 0.45), 1); }
  arm(0.4);                                                             // right arm (front, occludes)
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
const drawCouchHC = (ctx: CanvasRenderingContext2D, sx: number, sy: number, accent: string, base: string) => {
  const P = (u: number, v: number, z = 0): number[] => [sx + (u - v) * TW, sy + (u + v) * TH - z * STACK_H];
  const span = (u0: number, u1: number, v0: number, v1: number, z0: number, z1: number, t: string, r: string, l: string) => { poly(ctx, [P(u1, v0, z1), P(u1, v1, z1), P(u1, v1, z0), P(u1, v0, z0)], r); poly(ctx, [P(u0, v1, z1), P(u1, v1, z1), P(u1, v1, z0), P(u0, v1, z0)], l); poly(ctx, [P(u0, v0, z1), P(u1, v0, z1), P(u1, v1, z1), P(u0, v1, z1)], t); };
  const cT = shade(base, 1.34), cR = shade(base, 1.0), cL = shade(base, 0.62), cD = shade(base, 0.38), hi = shade(base, 1.8);
  const brass = '#c9a44f';
  // brass tapered feet
  for (const [u, v] of [[-0.28, -0.26], [1.28, -0.26], [-0.28, 0.32], [1.28, 0.32]] as [number, number][]) span(u - 0.045, u + 0.045, v - 0.045, v + 0.045, 0, 0.2, shade(brass, 1.2), shade(brass, 0.85), shade(brass, 0.55));
  // back rest (tall)
  span(-0.42, 1.42, -0.48, -0.18, 0.42, 1.5, cT, cR, cL);
  // diamond button tufting on the back's front face
  ctx.save();
  const rows = [0.66, 0.95, 1.24];
  for (let zi = 0; zi < rows.length; zi++) {
    const z = rows[zi], offset = zi % 2 ? 0.18 : 0;
    for (let u = -0.2; u <= 1.32; u += 0.36) {
      const b = P(u + offset, -0.2, z);
      const g = ctx.createRadialGradient(b[0], b[1] + 1, 0, b[0], b[1], 6); g.addColorStop(0, cD); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = 0.85; ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(b[0], b[1], 5, 4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1; ctx.fillStyle = cD; ctx.beginPath(); ctx.arc(b[0], b[1], 1.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = hexA(hi, 0.7); ctx.beginPath(); ctx.arc(b[0] - 0.6, b[1] - 0.8, 0.9, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.restore();
  const arm = (uc: number) => {
    span(uc - 0.16, uc + 0.16, -0.46, 0.42, 0.42, 1.06, cT, cR, cL);
    const a = P(uc, -0.02, 1.06); ctx.save(); const g = ctx.createRadialGradient(a[0] - 3, a[1] - 4, 1, a[0], a[1], TILE_W * 0.5); g.addColorStop(0, hi); g.addColorStop(0.6, cT); g.addColorStop(1, cR); ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(a[0], a[1], TW * 0.5, TH * 0.8, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    for (let v = -0.4; v <= 0.38; v += 0.16) { const n = P(uc + 0.16, v, 0.5); ctx.fillStyle = brass; ctx.beginPath(); ctx.arc(n[0], n[1], 1.3, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = hexA('#fff', 0.6); ctx.beginPath(); ctx.arc(n[0] - 0.4, n[1] - 0.4, 0.5, 0, Math.PI * 2); ctx.fill(); }
  };
  arm(-0.26);
  span(-0.34, 1.34, -0.18, 0.4, 0.16, 0.5, cT, cR, cL);   // seat base
  for (const [u0, u1] of [[-0.3, 0.5], [0.5, 1.3]] as [number, number][]) {
    span(u0 + 0.03, u1 - 0.03, -0.32, 0.36, 0.5, 0.8, shade(base, 1.22), cR, cL);
    const c = P((u0 + u1) / 2, 0.02, 0.8); const g = ctx.createRadialGradient(c[0], c[1] - 3, 2, c[0], c[1], 30); g.addColorStop(0, hexA(hi, 0.55)); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(c[0], c[1], TW * 0.6, TH * 0.62, 0, 0, Math.PI * 2); ctx.fill();
    poly(ctx, [P(u0 + 0.03, -0.32, 0.8), P(u1 - 0.03, -0.32, 0.8), P(u1 - 0.03, 0.36, 0.8), P(u0 + 0.03, 0.36, 0.8)], undefined, hexA(hi, 0.5), 1);
  }
  arm(1.26);
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
export function drawFurniSprite(ctx: CanvasRenderingContext2D, kind: string, sx: number, sy: number, accent: string, t: number) {
  const d = defOf(kind);
  switch (d.special) {
    case 'couch': drawCouch(ctx, sx, sy, accent, d.color); break;
    case 'armchair': drawArmchair(ctx, sx, sy, accent, d.color); break;
    case 'coffee': drawCoffee(ctx, sx, sy, accent, d.color); break;
    case 'couch_hc': drawCouchHC(ctx, sx, sy, accent, d.color); break;
    case 'plant_hc': drawPlantHC(ctx, sx, sy, accent, d.color); break;
    case 'column_hc': drawColumnHC(ctx, sx, sy, accent, d.color); break;
    case 'ball_hc': drawBallHC(ctx, sx, sy, accent, d.color, t); break;
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
