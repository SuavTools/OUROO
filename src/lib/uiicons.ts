// Self-drawn UI icons (no emojis) for the room designer: category glyphs + generic iso furni thumbs.
// All draw centred at the current transform origin, fitting a size×size box.

import { type FurniDef } from './furni';

const shade = (hex: string, f: number): string => {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((n >> 8) & 255) * f));
  const b = Math.min(255, Math.round((n & 255) * f));
  return `rgb(${r},${g},${b})`;
};

export type CatGlyph = 'tier1' | 'constr' | 'tapetes' | 'assentos' | 'mesas' | 'plantas' | 'luzes' | 'electro' | 'deco' | 'remove';

// A clean line/fill glyph per furni category — drawn, not an emoji.
export function drawCatIcon(ctx: CanvasRenderingContext2D, cat: string, S: number, color = '#cfd2dc') {
  const u = S * 0.42;
  ctx.save();
  ctx.strokeStyle = color; ctx.fillStyle = color;
  ctx.lineWidth = Math.max(1.4, S * 0.055); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const diamond = (cy: number, w: number, h: number) => { ctx.beginPath(); ctx.moveTo(0, cy - h); ctx.lineTo(w, cy); ctx.lineTo(0, cy + h); ctx.lineTo(-w, cy); ctx.closePath(); };
  switch (cat) {
    case 'tier1': {  // sparkle (premium)
      const p = [[0, -u], [u * 0.24, -u * 0.24], [u, 0], [u * 0.24, u * 0.24], [0, u], [-u * 0.24, u * 0.24], [-u, 0], [-u * 0.24, -u * 0.24]];
      ctx.beginPath(); p.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.closePath(); ctx.fill(); break;
    }
    case 'constr': { diamond(u * 0.42, u * 0.72, u * 0.36); ctx.stroke(); diamond(-u * 0.12, u * 0.72, u * 0.36); ctx.stroke(); break; }  // stacked blocks
    case 'tapetes': { diamond(0, u, u * 0.62); ctx.stroke(); diamond(0, u * 0.5, u * 0.3); ctx.stroke(); break; }            // rug w/ inner
    case 'assentos': {  // chair
      ctx.beginPath(); ctx.moveTo(-u * 0.55, -u * 0.7); ctx.lineTo(-u * 0.55, u * 0.2); ctx.lineTo(u * 0.55, u * 0.2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-u * 0.55, u * 0.2); ctx.lineTo(-u * 0.55, u * 0.75); ctx.moveTo(u * 0.55, u * 0.2); ctx.lineTo(u * 0.55, u * 0.75); ctx.stroke(); break;
    }
    case 'mesas': {  // table
      ctx.beginPath(); ctx.moveTo(-u * 0.82, -u * 0.18); ctx.lineTo(u * 0.82, -u * 0.18); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-u * 0.55, -u * 0.18); ctx.lineTo(-u * 0.55, u * 0.7); ctx.moveTo(u * 0.55, -u * 0.18); ctx.lineTo(u * 0.55, u * 0.7); ctx.stroke(); break;
    }
    case 'plantas': {  // pot + leaves
      ctx.beginPath(); ctx.moveTo(-u * 0.32, u * 0.2); ctx.lineTo(u * 0.32, u * 0.2); ctx.lineTo(u * 0.22, u * 0.72); ctx.lineTo(-u * 0.22, u * 0.72); ctx.closePath(); ctx.stroke();
      for (const a of [-0.55, 0, 0.55]) { ctx.beginPath(); ctx.ellipse(a * u * 0.4, -u * 0.18, u * 0.15, u * 0.42, a * 0.6, 0, Math.PI * 2); ctx.stroke(); } break;
    }
    case 'luzes': {  // bulb
      ctx.beginPath(); ctx.arc(0, -u * 0.12, u * 0.46, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-u * 0.2, u * 0.36); ctx.lineTo(u * 0.2, u * 0.36); ctx.moveTo(-u * 0.14, u * 0.58); ctx.lineTo(u * 0.14, u * 0.58); ctx.stroke(); break;
    }
    case 'electro': {  // screen
      ctx.beginPath(); ctx.roundRect(-u * 0.78, -u * 0.58, u * 1.56, u * 1.0, u * 0.12); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, u * 0.42); ctx.lineTo(0, u * 0.64); ctx.moveTo(-u * 0.26, u * 0.64); ctx.lineTo(u * 0.26, u * 0.64); ctx.stroke(); break;
    }
    case 'deco': { ctx.strokeRect(-u * 0.6, -u * 0.6, u * 1.2, u * 1.2); ctx.strokeRect(-u * 0.3, -u * 0.3, u * 0.6, u * 0.6); break; }  // frame
    case 'remove': {  // trash can
      ctx.beginPath(); ctx.moveTo(-u * 0.55, -u * 0.42); ctx.lineTo(u * 0.55, -u * 0.42); ctx.moveTo(-u * 0.28, -u * 0.42); ctx.lineTo(-u * 0.28, -u * 0.6); ctx.lineTo(u * 0.28, -u * 0.6); ctx.lineTo(u * 0.28, -u * 0.42); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-u * 0.42, -u * 0.42); ctx.lineTo(-u * 0.32, u * 0.64); ctx.lineTo(u * 0.32, u * 0.64); ctx.lineTo(u * 0.42, -u * 0.42); ctx.stroke(); break;
    }
    default: diamond(0, u * 0.7, u * 0.5); ctx.stroke();
  }
  ctx.restore();
}

// A small generic isometric cuboid coloured to the furni — a clean, consistent thumbnail (no emoji).
export function drawFurniThumb(ctx: CanvasRenderingContext2D, d: FurniDef, S: number) {
  const TW = S * 0.34, TH = S * 0.17, STACK = S * 0.2;
  const cyBase = S * 0.07;
  const h = Math.max(d.h > 0 ? d.h : 0.5, 0.5), foot = Math.min(1, d.foot || 0.9);
  const hw = TW * foot, hh = TH * foot, cyT = cyBase - h * STACK;
  const base = d.color || '#888';
  ctx.fillStyle = shade(base, 0.55); ctx.beginPath(); ctx.moveTo(-hw, cyBase); ctx.lineTo(0, cyBase + hh); ctx.lineTo(0, cyT + hh); ctx.lineTo(-hw, cyT); ctx.closePath(); ctx.fill();
  ctx.fillStyle = shade(base, 0.82); ctx.beginPath(); ctx.moveTo(0, cyBase + hh); ctx.lineTo(hw, cyBase); ctx.lineTo(hw, cyT); ctx.lineTo(0, cyT + hh); ctx.closePath(); ctx.fill();
  ctx.fillStyle = shade(base, 1.28); ctx.beginPath(); ctx.moveTo(0, cyT - hh); ctx.lineTo(hw, cyT); ctx.lineTo(0, cyT + hh); ctx.lineTo(-hw, cyT); ctx.closePath(); ctx.fill();
}
