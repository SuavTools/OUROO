// In-game character skins: shape (diamond / chariot / unicorn) × colour.
// Unlocked by best score, or by a secret lore-code (redeemed separately).

export type SkinShape = 'diamond' | 'chariot' | 'unicorn' | 'nave' | 'star' | 'heart';
export type Skin = {
  id: string;
  name: string;
  shape: SkinShape;
  color: string;
  unlock: { type: 'default' } | { type: 'score'; need: number } | { type: 'code' };
};

export const SKINS: Skin[] = [
  // Diamonds 💎
  { id: 'diamond-gold',    name: 'Diamante',          shape: 'diamond', color: '#ffe65c', unlock: { type: 'default' } },
  { id: 'diamond-emerald', name: 'Diamante Esmeralda',shape: 'diamond', color: '#1ED760', unlock: { type: 'score', need: 50000 } },
  { id: 'diamond-magenta', name: 'Diamante Magenta',  shape: 'diamond', color: '#ff44aa', unlock: { type: 'score', need: 100000 } },
  { id: 'diamond-azul',    name: 'Diamante Azul',     shape: 'diamond', color: '#4488ff', unlock: { type: 'score', need: 200000 } },
  { id: 'diamond-cyan',    name: 'Diamante Ciano',    shape: 'diamond', color: '#00cfff', unlock: { type: 'score', need: 400000 } },
  { id: 'diamond-branco',  name: 'Diamante Branco',   shape: 'diamond', color: '#ffffff', unlock: { type: 'score', need: 700000 } },
  // Chariots 🛞 — most expensive tier
  { id: 'chariot-gold',    name: 'Carruagem Dourada', shape: 'chariot', color: '#ffd700', unlock: { type: 'score', need: 1000000 } },
  { id: 'chariot-esmeralda',name:'Carruagem Esmeralda',shape:'chariot', color: '#1ED760', unlock: { type: 'score', need: 2000000 } },
  { id: 'chariot-violet',  name: 'Carruagem Violeta', shape: 'chariot', color: '#cc44ff', unlock: { type: 'score', need: 3000000 } },
  { id: 'chariot-rubra',   name: 'Carruagem Rubra',   shape: 'chariot', color: '#ff4e3e', unlock: { type: 'code' } },
  // Unicorns 🦄 — most expensive tier
  { id: 'unicorn-white',   name: 'Unicórnio',         shape: 'unicorn', color: '#fffefb', unlock: { type: 'score', need: 1200000 } },
  { id: 'unicorn-dourado', name: 'Unicórnio Dourado', shape: 'unicorn', color: '#ffd700', unlock: { type: 'score', need: 2200000 } },
  { id: 'unicorn-rosa',    name: 'Unicórnio Rosa',    shape: 'unicorn', color: '#ff88cc', unlock: { type: 'score', need: 3500000 } },
  { id: 'unicorn-cosmico', name: 'Unicórnio Cósmico', shape: 'unicorn', color: '#cc44ff', unlock: { type: 'code' } },
  // Naves 🛸 (SUAV na nave)
  { id: 'nave-prata',      name: 'Nave Prata',        shape: 'nave',    color: '#c4c8e0', unlock: { type: 'score', need: 120000 } },
  { id: 'nave-verde',      name: 'Nave Verde',        shape: 'nave',    color: '#1ED760', unlock: { type: 'score', need: 450000 } },
  { id: 'nave-laranja',    name: 'Nave Laranja',      shape: 'nave',    color: '#ff8800', unlock: { type: 'score', need: 900000 } },
  { id: 'nave-cosmica',    name: 'Nave Cósmica',      shape: 'nave',    color: '#00cfff', unlock: { type: 'code' } },
  { id: 'nave-suav',       name: 'Nave SUAV',         shape: 'nave',    color: '#ff4e3e', unlock: { type: 'code' } },
  // Stars ⭐
  { id: 'star-dourada',    name: 'Estrela Dourada',   shape: 'star',    color: '#ffe65c', unlock: { type: 'score', need: 80000 } },
  { id: 'star-rosa',       name: 'Estrela Rosa',      shape: 'star',    color: '#ff44aa', unlock: { type: 'score', need: 250000 } },
  { id: 'star-ciano',      name: 'Estrela Ciano',     shape: 'star',    color: '#00cfff', unlock: { type: 'score', need: 550000 } },
  { id: 'star-cadente',    name: 'Estrela Cadente',   shape: 'star',    color: '#ffffff', unlock: { type: 'code' } },
  // Hearts ❤️ (devolvo com alma)
  { id: 'heart-vermelho',  name: 'Coração Vermelho',  shape: 'heart',   color: '#ff4e3e', unlock: { type: 'score', need: 150000 } },
  { id: 'heart-rosa',      name: 'Coração Rosa',      shape: 'heart',   color: '#ff88cc', unlock: { type: 'score', need: 350000 } },
  { id: 'heart-dourado',   name: 'Coração Dourado',   shape: 'heart',   color: '#ffd700', unlock: { type: 'score', need: 800000 } },
  { id: 'heart-alma',      name: 'Coração com Alma',  shape: 'heart',   color: '#cc44ff', unlock: { type: 'code' } },
];

export const DEFAULT_SKIN_ID = 'diamond-gold';
export const skinById = (id: string): Skin => SKINS.find(s => s.id === id) ?? SKINS[0];

// Compact score label: 50000 → "50k", 1500000 → "1.5M".
export function fmtScore(n: number): string {
  if (n >= 1_000_000) return `${String(n / 1_000_000).replace(/\.0$/, '')}M`;
  if (n >= 1000) return `${n / 1000}k`;
  return String(n);
}

export function isSkinUnlocked(s: Skin, best: number, codeUnlocks: string[]): boolean {
  if (s.unlock.type === 'default') return true;
  if (s.unlock.type === 'score') return best >= s.unlock.need;
  return codeUnlocks.includes(s.id);
}

export function getSelectedSkinId(): string {
  if (typeof window === 'undefined') return DEFAULT_SKIN_ID;
  return localStorage.getItem('ouroo_skin') || DEFAULT_SKIN_ID;
}
export function setSelectedSkinId(id: string) { localStorage.setItem('ouroo_skin', id); }

// ---- shared canvas drawing (used by the game player + dashboard previews) ----
// All draw centred at the current transform origin, sized to w×h, `af` = anim frame.
export function drawSkinShape(ctx: CanvasRenderingContext2D, shape: SkinShape, color: string, w: number, h: number, af: number) {
  if (shape === 'chariot') {
    const W = w * 1.25, H = h * 0.95;
    const gl = 0.7 + Math.sin(af * 0.12) * 0.3;
    ctx.shadowColor = color; ctx.shadowBlur = 20 * gl; ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(-W * 0.45, H * 0.05); ctx.lineTo(W * 0.4, H * 0.05);
    ctx.lineTo(W * 0.28, H * 0.32); ctx.lineTo(-W * 0.4, H * 0.32); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect(-W * 0.45, 0, W * 0.85, H * 0.06);
    ctx.fillStyle = '#ff44aa'; ctx.shadowColor = '#ff44aa'; ctx.shadowBlur = 10;
    const wav = Math.sin(af * 0.2) * 4;
    ctx.beginPath();
    ctx.moveTo(-W * 0.1, H * 0.02); ctx.lineTo(-W * 0.1, -H * 0.5);
    ctx.lineTo(W * 0.25 + wav, -H * 0.38); ctx.lineTo(-W * 0.1, -H * 0.26); ctx.closePath(); ctx.fill();
    ctx.shadowColor = color; ctx.shadowBlur = 12; ctx.strokeStyle = color; ctx.lineWidth = 3;
    for (const wx of [-W * 0.28, W * 0.22]) {
      ctx.save(); ctx.translate(wx, H * 0.34); ctx.rotate(af * 0.3);
      ctx.beginPath(); ctx.arc(0, 0, H * 0.2, 0, Math.PI * 2); ctx.stroke();
      for (let s = 0; s < 6; s++) { const sa = (s / 6) * Math.PI * 2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(sa) * H * 0.2, Math.sin(sa) * H * 0.2); ctx.stroke(); }
      ctx.restore();
    }
    return;
  }
  if (shape === 'unicorn') {
    const W = w * 1.2, H = h;
    const rainbow = ['#ff0000', '#ff8800', '#ffff00', '#00ff88', '#4488ff', '#cc44ff'];
    for (let i = 0; i < rainbow.length; i++) {
      ctx.strokeStyle = rainbow[i]; ctx.lineWidth = 3; ctx.shadowColor = rainbow[i]; ctx.shadowBlur = 8;
      const off = (i - rainbow.length / 2) * 4; const wob = Math.sin(af * 0.15 + i) * 5;
      ctx.beginPath(); ctx.moveTo(-W * 0.2, off); ctx.quadraticCurveTo(-W * 0.6, off + wob, -W * 0.9, off + wob * 1.5); ctx.stroke();
    }
    ctx.shadowColor = color; ctx.shadowBlur = 18; ctx.fillStyle = color;
    ctx.beginPath(); ctx.ellipse(0, 0, W * 0.42, H * 0.34, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(W * 0.32, -H * 0.12, W * 0.2, H * 0.16, -0.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffd700'; ctx.shadowColor = '#ffd700'; ctx.shadowBlur = 14;
    ctx.beginPath(); ctx.moveTo(W * 0.42, -H * 0.3); ctx.lineTo(W * 0.6, -H * 0.62); ctx.lineTo(W * 0.5, -H * 0.28); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#000'; ctx.shadowBlur = 0; ctx.beginPath(); ctx.arc(W * 0.36, -H * 0.14, 2.2, 0, Math.PI * 2); ctx.fill();
    return;
  }
  if (shape === 'nave') {
    const W = w * 1.35, H = h;
    // Engine flame (flickers, trails left)
    const fl = 0.6 + Math.sin(af * 0.5) * 0.4;
    ctx.fillStyle = `rgba(255,140,0,${fl})`; ctx.shadowColor = '#ff8800'; ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.moveTo(-W * 0.35, -H * 0.12); ctx.lineTo(-W * 0.62 - fl * 10, 0); ctx.lineTo(-W * 0.35, H * 0.12); ctx.closePath(); ctx.fill();
    // Hull — sleek arrow pointing right
    ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.moveTo(W * 0.58, 0); ctx.lineTo(-W * 0.35, -H * 0.3); ctx.lineTo(-W * 0.22, 0); ctx.lineTo(-W * 0.35, H * 0.3); ctx.closePath(); ctx.fill();
    // Fins
    ctx.beginPath(); ctx.moveTo(-W * 0.15, -H * 0.18); ctx.lineTo(-W * 0.42, -H * 0.46); ctx.lineTo(-W * 0.1, -H * 0.02); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-W * 0.15, H * 0.18); ctx.lineTo(-W * 0.42, H * 0.46); ctx.lineTo(-W * 0.1, H * 0.02); ctx.closePath(); ctx.fill();
    // Cockpit
    ctx.shadowBlur = 0; ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.arc(W * 0.18, 0, H * 0.13, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(0,180,255,0.85)'; ctx.beginPath(); ctx.arc(W * 0.18, 0, H * 0.08, 0, Math.PI * 2); ctx.fill();
    return;
  }
  if (shape === 'star') {
    const R = Math.min(w, h) * 0.62;
    // little trailing sparkles
    for (let i = 1; i <= 3; i++) { ctx.fillStyle = `rgba(255,255,255,${0.5 / i})`; ctx.shadowColor = color; ctx.shadowBlur = 8; ctx.beginPath(); ctx.arc(-R - i * 7, R * 0.2, 2.5 / i + 1, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 16;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) { const ang = -Math.PI / 2 + i * Math.PI / 5; const rr = i % 2 === 0 ? R : R * 0.45; const x = Math.cos(ang) * rr, y = Math.sin(ang) * rr; i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.shadowBlur = 0; ctx.beginPath(); ctx.arc(0, 0, R * 0.16, 0, Math.PI * 2); ctx.fill();
    return;
  }
  if (shape === 'heart') {
    const u = Math.min(w, h) * 0.5;
    ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.moveTo(0, u * 0.72);
    ctx.bezierCurveTo(-u * 1.25, -u * 0.25, -u * 0.45, -u * 1.0, 0, -u * 0.3);
    ctx.bezierCurveTo(u * 0.45, -u * 1.0, u * 1.25, -u * 0.25, 0, u * 0.72);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.shadowBlur = 0;
    ctx.beginPath(); ctx.ellipse(-u * 0.35, -u * 0.35, u * 0.16, u * 0.24, -0.5, 0, Math.PI * 2); ctx.fill();
    return;
  }
  // diamond
  ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 10;
  ctx.beginPath(); ctx.moveTo(0, -h / 2); ctx.lineTo(w / 2, 0); ctx.lineTo(0, h / 2); ctx.lineTo(-w / 2, 0); ctx.closePath(); ctx.fill();
}
