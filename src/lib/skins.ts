// In-game character skins: shape (diamond / chariot / unicorn) × colour.
// Unlocked by best score, or by a secret lore-code (redeemed separately).

export type SkinShape = 'diamond' | 'chariot' | 'unicorn';
export type Skin = {
  id: string;
  name: string;
  shape: SkinShape;
  color: string;
  unlock: { type: 'default' } | { type: 'score'; need: number } | { type: 'code' };
};

export const SKINS: Skin[] = [
  // Diamonds
  { id: 'diamond-gold',    name: 'Diamante',          shape: 'diamond', color: '#ffe65c', unlock: { type: 'default' } },
  { id: 'diamond-emerald', name: 'Diamante Esmeralda',shape: 'diamond', color: '#1ED760', unlock: { type: 'score', need: 10000 } },
  { id: 'diamond-magenta', name: 'Diamante Magenta',  shape: 'diamond', color: '#ff44aa', unlock: { type: 'score', need: 30000 } },
  { id: 'diamond-cyan',    name: 'Diamante Ciano',    shape: 'diamond', color: '#00cfff', unlock: { type: 'score', need: 60000 } },
  // Chariots
  { id: 'chariot-gold',    name: 'Carruagem Dourada', shape: 'chariot', color: '#ffd700', unlock: { type: 'score', need: 25000 } },
  { id: 'chariot-violet',  name: 'Carruagem Violeta', shape: 'chariot', color: '#cc44ff', unlock: { type: 'score', need: 80000 } },
  { id: 'chariot-rubra',   name: 'Carruagem Rubra',   shape: 'chariot', color: '#ff4e3e', unlock: { type: 'code' } },
  // Unicorns
  { id: 'unicorn-white',   name: 'Unicórnio',         shape: 'unicorn', color: '#fffefb', unlock: { type: 'score', need: 50000 } },
  { id: 'unicorn-rosa',    name: 'Unicórnio Rosa',    shape: 'unicorn', color: '#ff88cc', unlock: { type: 'score', need: 120000 } },
  { id: 'unicorn-cosmico', name: 'Unicórnio Cósmico', shape: 'unicorn', color: '#cc44ff', unlock: { type: 'code' } },
];

export const DEFAULT_SKIN_ID = 'diamond-gold';
export const skinById = (id: string): Skin => SKINS.find(s => s.id === id) ?? SKINS[0];

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
  // diamond
  ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 10;
  ctx.beginPath(); ctx.moveTo(0, -h / 2); ctx.lineTo(w / 2, 0); ctx.lineTo(0, h / 2); ctx.lineTo(-w / 2, 0); ctx.closePath(); ctx.fill();
}
