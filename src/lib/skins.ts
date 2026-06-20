// In-game character skins: shape (diamond / chariot / unicorn) × colour.
// Unlocked by best score, or by a secret lore-code (redeemed separately).

export type SkinShape = 'diamond' | 'chariot' | 'unicorn' | 'nave' | 'star' | 'heart' | 'shark' | 'crocbomber' | 'ballerina'
  // creatures — used by hazardous NPCs (animals / robots / mythical), recolourable via `creature:` ids
  | 'dragon' | 'wolf' | 'spider' | 'snake' | 'bat' | 'slime' | 'ghost' | 'robot' | 'drone';
export type Skin = {
  id: string;
  name: string;
  shape: SkinShape;
  color: string;
  unlock: { type: 'default' } | { type: 'score'; need: number } | { type: 'code' };
};

export const SKINS: Skin[] = [
  // Diamonds 💎
  { id: 'diamond-gold',    name: 'Diamond',           shape: 'diamond', color: '#ffe65c', unlock: { type: 'default' } },
  { id: 'diamond-emerald', name: 'Emerald Diamond',   shape: 'diamond', color: '#1ED760', unlock: { type: 'score', need: 50000 } },
  { id: 'diamond-magenta', name: 'Magenta Diamond',   shape: 'diamond', color: '#ff44aa', unlock: { type: 'score', need: 100000 } },
  { id: 'diamond-azul',    name: 'Blue Diamond',      shape: 'diamond', color: '#4488ff', unlock: { type: 'score', need: 200000 } },
  { id: 'diamond-cyan',    name: 'Cyan Diamond',      shape: 'diamond', color: '#00cfff', unlock: { type: 'score', need: 400000 } },
  { id: 'diamond-branco',  name: 'White Diamond',     shape: 'diamond', color: '#ffffff', unlock: { type: 'score', need: 700000 } },
  // Chariots 🛞 — most expensive tier
  { id: 'chariot-gold',    name: 'Golden Chariot',    shape: 'chariot', color: '#ffd700', unlock: { type: 'score', need: 1000000 } },
  { id: 'chariot-esmeralda',name:'Emerald Chariot',   shape:'chariot', color: '#1ED760', unlock: { type: 'score', need: 2000000 } },
  { id: 'chariot-violet',  name: 'Violet Chariot',    shape: 'chariot', color: '#cc44ff', unlock: { type: 'score', need: 3000000 } },
  { id: 'chariot-rubra',   name: 'Ruby Chariot',      shape: 'chariot', color: '#ff4e3e', unlock: { type: 'code' } },
  // Unicorns 🦄 — most expensive tier
  { id: 'unicorn-white',   name: 'Unicorn',           shape: 'unicorn', color: '#fffefb', unlock: { type: 'score', need: 1200000 } },
  { id: 'unicorn-dourado', name: 'Golden Unicorn',    shape: 'unicorn', color: '#ffd700', unlock: { type: 'score', need: 2200000 } },
  { id: 'unicorn-rosa',    name: 'Pink Unicorn',      shape: 'unicorn', color: '#ff88cc', unlock: { type: 'score', need: 3500000 } },
  { id: 'unicorn-cosmico', name: 'Cosmic Unicorn',    shape: 'unicorn', color: '#cc44ff', unlock: { type: 'code' } },
  // Naves 🛸 (SUAV na nave)
  { id: 'nave-prata',      name: 'Silver Ship',       shape: 'nave',    color: '#c4c8e0', unlock: { type: 'score', need: 120000 } },
  { id: 'nave-verde',      name: 'Green Ship',        shape: 'nave',    color: '#1ED760', unlock: { type: 'score', need: 450000 } },
  { id: 'nave-laranja',    name: 'Orange Ship',       shape: 'nave',    color: '#ff8800', unlock: { type: 'score', need: 900000 } },
  { id: 'nave-cosmica',    name: 'Cosmic Ship',       shape: 'nave',    color: '#00cfff', unlock: { type: 'code' } },
  { id: 'nave-suav',       name: 'SUAV Ship',         shape: 'nave',    color: '#ff4e3e', unlock: { type: 'code' } },
  // Stars ⭐
  { id: 'star-dourada',    name: 'Golden Star',       shape: 'star',    color: '#ffe65c', unlock: { type: 'score', need: 80000 } },
  { id: 'star-rosa',       name: 'Pink Star',         shape: 'star',    color: '#ff44aa', unlock: { type: 'score', need: 250000 } },
  { id: 'star-ciano',      name: 'Cyan Star',         shape: 'star',    color: '#00cfff', unlock: { type: 'score', need: 550000 } },
  { id: 'star-cadente',    name: 'Shooting Star',     shape: 'star',    color: '#ffffff', unlock: { type: 'code' } },
  // Hearts ❤️ (devolvo com alma)
  { id: 'heart-vermelho',  name: 'Red Heart',         shape: 'heart',   color: '#ff4e3e', unlock: { type: 'score', need: 150000 } },
  { id: 'heart-rosa',      name: 'Pink Heart',        shape: 'heart',   color: '#ff88cc', unlock: { type: 'score', need: 350000 } },
  { id: 'heart-dourado',   name: 'Golden Heart',      shape: 'heart',   color: '#ffd700', unlock: { type: 'score', need: 800000 } },
  { id: 'heart-alma',      name: 'Soul Heart',        shape: 'heart',   color: '#cc44ff', unlock: { type: 'code' } },
  // Italian Brainrot 🇮🇹
  { id: 'br-tralalero',    name: 'Tralalero Tralala',     shape: 'shark',      color: '#5aa9d6', unlock: { type: 'score', need: 300000 } },
  { id: 'br-bombardiro',   name: 'Bombardiro Crocodilo',  shape: 'crocbomber', color: '#3f6b3a', unlock: { type: 'score', need: 600000 } },
  { id: 'br-ballerina',    name: 'Ballerina Cappuccina',  shape: 'ballerina',  color: '#f4b8d0', unlock: { type: 'code' } },
];

export const DEFAULT_SKIN_ID = 'diamond-gold';
export const skinById = (id: string): Skin => SKINS.find(s => s.id === id) ?? SKINS[0];

// ── creature appearances ── a SkinShape + a free colour, encoded as `creature:<shape>:<color>`
// (mirrors how `person:` works). Used by hazardous NPCs; never enters the player skin catalog.
export const CREATURE_SHAPES: { shape: SkinShape; name: string }[] = [
  { shape: 'dragon', name: 'Dragon' }, { shape: 'wolf', name: 'Wolf' }, { shape: 'spider', name: 'Spider' },
  { shape: 'snake', name: 'Snake' }, { shape: 'bat', name: 'Bat' }, { shape: 'slime', name: 'Slime' },
  { shape: 'ghost', name: 'Ghost' }, { shape: 'robot', name: 'Robot' }, { shape: 'drone', name: 'Drone' },
];
const CREATURE_SET = new Set<string>(CREATURE_SHAPES.map(c => c.shape));
export const isCreatureId = (id: string): boolean => id.startsWith('creature:');
export function parseCreature(id: string): { shape: SkinShape; color: string } {
  const [, shape, color] = id.split(':');
  return {
    shape: (CREATURE_SET.has(shape) ? shape : 'dragon') as SkinShape,
    color: /^#[0-9a-fA-F]{3,8}$/.test(color || '') ? color : '#7bd16b',
  };
}
export const encodeCreature = (shape: SkinShape, color: string): string => `creature:${shape}:${color}`;

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
  // ── creatures (hazardous NPCs) — all face right, centred at origin, glow + frame-based motion ──
  if (shape === 'dragon') {
    const W = w * 1.15, H = h, flap = Math.sin(af * 0.18) * 0.5 + 0.5, sway = Math.sin(af * 0.12) * W * 0.03;
    ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 13;
    // serpentine S body, drawn as overlapping tapering segments: tail (bottom-left) coils up to head (top-right)
    const spine: [number, number][] = [[-W * 0.34, H * 0.46], [-W * 0.12, H * 0.38], [W * 0.05, H * 0.18], [W * 0.07, -H * 0.04], [-W * 0.04, -H * 0.24], [W * 0.07, -H * 0.4], [W * 0.2, -H * 0.5]];
    for (let i = 0; i < spine.length; i++) { const t = i / (spine.length - 1), r = H * 0.17 * (1 - t * 0.6); ctx.beginPath(); ctx.ellipse(spine[i][0] + sway * t, spine[i][1], r * 0.95, r, 0, 0, Math.PI * 2); ctx.fill(); }
    ctx.beginPath(); ctx.moveTo(-W * 0.34, H * 0.46); ctx.lineTo(-W * 0.52, H * 0.52); ctx.lineTo(-W * 0.36, H * 0.34); ctx.closePath(); ctx.fill();   // tail spade
    // raised bat wings from the upper back, scalloped trailing edge (far dim, near full)
    for (const [s, a] of [[0.7, 0.5], [1, 1]] as const) {
      ctx.globalAlpha = a; const bx = W * 0.0, by = -H * 0.14;
      ctx.beginPath(); ctx.moveTo(bx, by);
      ctx.lineTo(bx - W * 0.46 * s, by - H * (0.36 + flap * 0.18));
      ctx.quadraticCurveTo(bx - W * 0.34 * s, by - H * 0.1, bx - W * 0.28 * s, by - H * 0.04);
      ctx.quadraticCurveTo(bx - W * 0.32 * s, by + H * 0.04, bx - W * 0.16 * s, by + H * 0.04);
      ctx.quadraticCurveTo(bx - W * 0.18 * s, by + H * 0.1, bx - W * 0.04, by + H * 0.06);
      ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
    }
    // head at the top: snout-right, two horns swept back
    const hx = W * 0.2 + sway, hy = -H * 0.52;
    ctx.beginPath(); ctx.ellipse(hx, hy, W * 0.16, H * 0.11, -0.1, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(hx + W * 0.02, hy - H * 0.03); ctx.lineTo(hx + W * 0.32, hy + H * 0.0); ctx.lineTo(hx + W * 0.02, hy + H * 0.06); ctx.closePath(); ctx.fill();   // snout
    for (const dx of [-W * 0.05, W * 0.04]) { ctx.beginPath(); ctx.moveTo(hx + dx, hy - H * 0.06); ctx.lineTo(hx + dx - W * 0.08, hy - H * 0.24); ctx.lineTo(hx + dx + W * 0.03, hy - H * 0.06); ctx.closePath(); ctx.fill(); }   // horns
    ctx.fillStyle = '#1a0008'; ctx.shadowBlur = 0; ctx.beginPath(); ctx.arc(hx + W * 0.07, hy - H * 0.01, W * 0.03, 0, 7); ctx.fill();   // eye
    return;
  }
  if (shape === 'wolf') {
    const W = w * 1.15, H = h, gait = Math.sin(af * 0.3), tw = Math.sin(af * 0.2) * H * 0.08;
    ctx.fillStyle = color; ctx.strokeStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 12; ctx.lineWidth = Math.max(3, W * 0.09); ctx.lineCap = 'round';
    const ly = H * 0.16;
    ctx.beginPath(); ctx.moveTo(-W * 0.28, ly); ctx.lineTo(-W * 0.28 + gait * W * 0.06, H * 0.46); ctx.moveTo(W * 0.26, ly); ctx.lineTo(W * 0.26 - gait * W * 0.06, H * 0.46); ctx.stroke();   // legs (pair A)
    ctx.beginPath(); ctx.moveTo(-W * 0.16, ly); ctx.lineTo(-W * 0.16 - gait * W * 0.06, H * 0.46); ctx.moveTo(W * 0.14, ly); ctx.lineTo(W * 0.14 + gait * W * 0.06, H * 0.46); ctx.stroke();   // legs (pair B)
    ctx.beginPath(); ctx.ellipse(0, 0, W * 0.4, H * 0.22, 0, 0, Math.PI * 2); ctx.fill();   // body
    ctx.beginPath(); ctx.moveTo(-W * 0.36, -H * 0.02); ctx.quadraticCurveTo(-W * 0.62, -H * 0.1 + tw, -W * 0.52, -H * 0.28 + tw); ctx.lineTo(-W * 0.34, -H * 0.1); ctx.closePath(); ctx.fill();   // tail
    ctx.beginPath(); ctx.ellipse(W * 0.42, -H * 0.08, W * 0.2, H * 0.18, 0, 0, Math.PI * 2); ctx.fill();   // head
    ctx.beginPath(); ctx.moveTo(W * 0.58, -H * 0.08); ctx.lineTo(W * 0.78, -H * 0.02); ctx.lineTo(W * 0.58, H * 0.05); ctx.closePath(); ctx.fill();   // snout
    ctx.beginPath(); ctx.moveTo(W * 0.3, -H * 0.22); ctx.lineTo(W * 0.36, -H * 0.44); ctx.lineTo(W * 0.46, -H * 0.24); ctx.closePath(); ctx.fill();   // ear
    ctx.fillStyle = '#000'; ctx.shadowBlur = 0; ctx.beginPath(); ctx.arc(W * 0.47, -H * 0.1, W * 0.03, 0, 7); ctx.fill();   // eye
    return;
  }
  if (shape === 'spider') {
    const W = w, H = h, wig = Math.sin(af * 0.3) * H * 0.04;
    ctx.strokeStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 10; ctx.lineWidth = Math.max(2, W * 0.05); ctx.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      const ly = -H * 0.14 + i * H * 0.1, k = (i % 2 === 0 ? 1 : -1) * wig;
      ctx.beginPath(); ctx.moveTo(-W * 0.1, ly); ctx.quadraticCurveTo(-W * 0.4, ly - H * 0.04 + k, -W * 0.5, ly + H * 0.13 + k); ctx.moveTo(W * 0.1, ly); ctx.quadraticCurveTo(W * 0.4, ly - H * 0.04 - k, W * 0.5, ly + H * 0.13 - k); ctx.stroke();
    }
    ctx.fillStyle = color; ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.ellipse(0, H * 0.1, W * 0.26, H * 0.22, 0, 0, Math.PI * 2); ctx.fill();   // abdomen
    ctx.beginPath(); ctx.ellipse(0, -H * 0.16, W * 0.18, H * 0.15, 0, 0, Math.PI * 2); ctx.fill();   // head
    ctx.fillStyle = '#ff2b2b'; ctx.shadowColor = '#ff2b2b'; ctx.shadowBlur = 6; ctx.beginPath(); ctx.arc(-W * 0.07, -H * 0.18, W * 0.03, 0, 7); ctx.arc(W * 0.07, -H * 0.18, W * 0.03, 0, 7); ctx.fill();
    return;
  }
  if (shape === 'snake') {
    const W = w * 1.2, H = h;
    ctx.strokeStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 12; ctx.lineWidth = Math.max(5, H * 0.16); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    const N = 6; for (let i = 0; i <= N; i++) { const t = i / N, x = -W * 0.5 + t * W, y = Math.sin(t * Math.PI * 2.2 + af * 0.15) * H * 0.18; i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
    ctx.stroke();
    const hy = Math.sin(Math.PI * 2.2 + af * 0.15) * H * 0.18;
    ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(W * 0.5, hy, W * 0.11, H * 0.12, 0, 0, Math.PI * 2); ctx.fill();   // head
    ctx.strokeStyle = '#ff3333'; ctx.shadowBlur = 0; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(W * 0.59, hy); ctx.lineTo(W * 0.7, hy); ctx.stroke();   // tongue
    ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(W * 0.52, hy - H * 0.03, W * 0.025, 0, 7); ctx.fill();   // eye
    return;
  }
  if (shape === 'bat') {
    const W = w * 1.25, H = h, flap = Math.sin(af * 0.25) * H * 0.12;
    ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 14;
    for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(0, -H * 0.02);
      ctx.quadraticCurveTo(s * W * 0.28, -H * 0.18 - flap, s * W * 0.5, -H * 0.05 - flap);
      ctx.quadraticCurveTo(s * W * 0.42, -flap, s * W * 0.44, H * 0.1 - flap);
      ctx.quadraticCurveTo(s * W * 0.3, H * 0.02, s * W * 0.18, H * 0.08);
      ctx.quadraticCurveTo(s * W * 0.12, 0, 0, H * 0.04); ctx.closePath(); ctx.fill();
    }
    ctx.beginPath(); ctx.ellipse(0, 0, W * 0.12, H * 0.2, 0, 0, Math.PI * 2); ctx.fill();   // body
    ctx.beginPath(); ctx.moveTo(-W * 0.08, -H * 0.16); ctx.lineTo(-W * 0.12, -H * 0.34); ctx.lineTo(-W * 0.01, -H * 0.18); ctx.closePath(); ctx.moveTo(W * 0.08, -H * 0.16); ctx.lineTo(W * 0.12, -H * 0.34); ctx.lineTo(W * 0.01, -H * 0.18); ctx.closePath(); ctx.fill();   // ears
    ctx.fillStyle = '#fff'; ctx.shadowBlur = 0; ctx.beginPath(); ctx.arc(-W * 0.05, -H * 0.06, W * 0.025, 0, 7); ctx.arc(W * 0.05, -H * 0.06, W * 0.025, 0, 7); ctx.fill();
    return;
  }
  if (shape === 'slime') {
    const W = w, H = h, sq = Math.sin(af * 0.12) * 0.07, bw = W * (0.46 + sq), bh = H * (0.42 - sq * 1.5);
    ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 16;
    ctx.beginPath(); ctx.moveTo(-bw, H * 0.28); ctx.quadraticCurveTo(-bw, -bh, 0, -bh); ctx.quadraticCurveTo(bw, -bh, bw, H * 0.28); ctx.closePath(); ctx.fill();   // dome
    ctx.beginPath(); ctx.ellipse(0, H * 0.28, bw, H * 0.06, 0, 0, Math.PI * 2); ctx.fill();   // base
    ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.shadowBlur = 0; ctx.beginPath(); ctx.ellipse(-W * 0.16, -H * 0.1, W * 0.09, H * 0.12, -0.3, 0, Math.PI * 2); ctx.fill();   // shine
    ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(-W * 0.12, H * 0.02, W * 0.05, 0, 7); ctx.arc(W * 0.12, H * 0.02, W * 0.05, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-W * 0.1, 0, W * 0.018, 0, 7); ctx.arc(W * 0.14, 0, W * 0.018, 0, 7); ctx.fill();
    return;
  }
  if (shape === 'ghost') {
    const W = w, H = h, cy = -H * 0.05, R = W * 0.34, baseY = H * 0.32;
    ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 18; ctx.globalAlpha = 0.92;
    ctx.beginPath(); ctx.arc(0, cy, R, Math.PI, Math.PI * 2); ctx.lineTo(R, baseY);
    const segs = 4; let x = R; for (let i = 0; i < segs; i++) { const nx = R - (i + 1) * (2 * R / segs), dip = (i % 2 === 0 ? 1 : 0.4) * H * 0.1 + Math.sin(af * 0.2 + i) * H * 0.02; ctx.quadraticCurveTo((x + nx) / 2, baseY + dip, nx, baseY); x = nx; }
    ctx.lineTo(-R, cy); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(18,8,36,0.85)'; ctx.shadowBlur = 0;
    ctx.beginPath(); ctx.ellipse(-W * 0.12, -H * 0.06, W * 0.06, H * 0.09, 0, 0, Math.PI * 2); ctx.ellipse(W * 0.12, -H * 0.06, W * 0.06, H * 0.09, 0, 0, Math.PI * 2); ctx.fill();   // eyes
    ctx.beginPath(); ctx.ellipse(0, H * 0.11, W * 0.06, H * 0.06, 0, 0, Math.PI * 2); ctx.fill();   // mouth
    return;
  }
  if (shape === 'robot') {
    const W = w, H = h, bob = Math.sin(af * 0.15) * H * 0.02;
    ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 14;
    ctx.fillRect(-W * 0.22, H * 0.2, W * 0.16, H * 0.28); ctx.fillRect(W * 0.06, H * 0.2, W * 0.16, H * 0.28);   // legs
    ctx.beginPath(); ctx.roundRect(-W * 0.3, -H * 0.18 + bob, W * 0.6, H * 0.42, W * 0.06); ctx.fill();   // body
    ctx.fillRect(-W * 0.42, -H * 0.12 + bob, W * 0.1, H * 0.3); ctx.fillRect(W * 0.32, -H * 0.12 + bob, W * 0.1, H * 0.3);   // arms
    ctx.beginPath(); ctx.roundRect(-W * 0.2, -H * 0.46 + bob, W * 0.4, H * 0.3, W * 0.05); ctx.fill();   // head
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -H * 0.46 + bob); ctx.lineTo(0, -H * 0.6 + bob); ctx.stroke(); ctx.beginPath(); ctx.arc(0, -H * 0.63 + bob, W * 0.04, 0, 7); ctx.fill();   // antenna
    ctx.fillStyle = '#00eaff'; ctx.shadowColor = '#00eaff'; ctx.shadowBlur = 8; ctx.beginPath(); ctx.arc(-W * 0.08, -H * 0.32 + bob, W * 0.05, 0, 7); ctx.arc(W * 0.08, -H * 0.32 + bob, W * 0.05, 0, 7); ctx.fill();   // eyes
    return;
  }
  if (shape === 'drone') {
    const W = w, H = h, spin = af * 0.6;
    ctx.save(); ctx.strokeStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 10; ctx.lineWidth = 2.5; ctx.globalAlpha = 0.5;
    ctx.beginPath(); ctx.ellipse(0, -H * 0.28, W * 0.34 * Math.abs(Math.cos(spin)) + W * 0.04, H * 0.04, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    ctx.strokeStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 14; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, -H * 0.28); ctx.lineTo(0, -H * 0.1); ctx.stroke();   // shaft
    ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(0, H * 0.02, W * 0.3, H * 0.26, 0, 0, Math.PI * 2); ctx.fill();   // body
    ctx.fillStyle = '#fff'; ctx.shadowBlur = 0; ctx.beginPath(); ctx.arc(0, H * 0.0, W * 0.14, 0, 7); ctx.fill();
    ctx.fillStyle = '#ff3333'; ctx.shadowColor = '#ff3333'; ctx.shadowBlur = 8; ctx.beginPath(); ctx.arc(W * 0.03, 0, W * 0.06, 0, 7); ctx.fill();   // eye
    return;
  }
  if (shape === 'shark') {   // Tralalero Tralala — finned shark emblem with a toothy grin
    const W = w, H = h, wig = Math.sin(af * 0.2) * 3;
    ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 14;
    ctx.beginPath(); ctx.moveTo(-W * 0.4, 0); ctx.lineTo(-W * 0.62, -H * 0.22 + wig); ctx.lineTo(-W * 0.52, 0); ctx.lineTo(-W * 0.62, H * 0.22 + wig); ctx.closePath(); ctx.fill();   // tail
    ctx.beginPath(); ctx.ellipse(0, 0, W * 0.46, H * 0.3, 0, 0, Math.PI * 2); ctx.fill();   // body
    ctx.beginPath(); ctx.moveTo(0, -H * 0.28); ctx.lineTo(W * 0.12, -H * 0.52); ctx.lineTo(W * 0.2, -H * 0.26); ctx.closePath(); ctx.fill();   // dorsal
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.shadowBlur = 0; ctx.beginPath(); ctx.ellipse(W * 0.05, H * 0.12, W * 0.3, H * 0.15, 0, 0, Math.PI * 2); ctx.fill();   // belly
    ctx.fillStyle = '#21323d'; ctx.beginPath(); ctx.ellipse(W * 0.22, H * 0.08, W * 0.16, H * 0.08, 0, 0, Math.PI); ctx.fill();   // mouth
    ctx.fillStyle = '#fff'; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(W * 0.12 + i * W * 0.08, H * 0.04); ctx.lineTo(W * 0.14 + i * W * 0.08, H * 0.13); ctx.lineTo(W * 0.16 + i * W * 0.08, H * 0.04); ctx.closePath(); ctx.fill(); }
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(W * 0.18, -H * 0.08, W * 0.09, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(W * 0.2, -H * 0.08, W * 0.04, 0, Math.PI * 2); ctx.fill();
    return;
  }
  if (shape === 'crocbomber') {   // Bombardiro Crocodilo — crocodile-headed warplane
    const W = w, H = h;
    ctx.save(); ctx.rotate(Math.sin(af * 0.1) * 0.08);
    ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 14;
    ctx.beginPath(); ctx.moveTo(-W * 0.1, 0); ctx.lineTo(-W * 0.22, -H * 0.34); ctx.lineTo(W * 0.05, -H * 0.05); ctx.closePath(); ctx.fill();   // wings
    ctx.beginPath(); ctx.moveTo(-W * 0.1, 0); ctx.lineTo(-W * 0.22, H * 0.34); ctx.lineTo(W * 0.05, H * 0.05); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-W * 0.45, 0); ctx.lineTo(-W * 0.56, -H * 0.24); ctx.lineTo(-W * 0.4, 0); ctx.closePath(); ctx.fill();   // tail
    ctx.beginPath(); ctx.ellipse(0, 0, W * 0.5, H * 0.16, 0, 0, Math.PI * 2); ctx.fill();   // fuselage
    ctx.beginPath(); ctx.ellipse(W * 0.42, -H * 0.03, W * 0.2, H * 0.13, 0, 0, Math.PI * 2); ctx.fill();   // croc head
    ctx.beginPath(); ctx.moveTo(W * 0.56, -H * 0.07); ctx.lineTo(W * 0.82, -H * 0.02); ctx.lineTo(W * 0.56, H * 0.05); ctx.closePath(); ctx.fill();   // snout
    ctx.fillStyle = '#fff'; ctx.shadowBlur = 0; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(W * 0.58 + i * W * 0.07, H * 0.0); ctx.lineTo(W * 0.6 + i * W * 0.07, H * 0.07); ctx.lineTo(W * 0.62 + i * W * 0.07, H * 0.0); ctx.closePath(); ctx.fill(); }
    ctx.beginPath(); ctx.arc(W * 0.42, -H * 0.13, W * 0.06, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(W * 0.43, -H * 0.13, W * 0.03, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    return;
  }
  if (shape === 'ballerina') {   // Ballerina Cappuccina — cup-headed ballerina
    const W = w, H = h;
    ctx.save(); ctx.rotate(Math.sin(af * 0.15) * 0.1);
    ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.moveTo(-W * 0.4, H * 0.22); ctx.lineTo(W * 0.4, H * 0.22); ctx.lineTo(W * 0.12, H * 0.02); ctx.lineTo(-W * 0.12, H * 0.02); ctx.closePath(); ctx.fill();   // tutu
    ctx.strokeStyle = '#e8c9a8'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.shadowBlur = 0; ctx.beginPath(); ctx.moveTo(-W * 0.05, H * 0.2); ctx.lineTo(-W * 0.1, H * 0.5); ctx.moveTo(W * 0.05, H * 0.2); ctx.lineTo(W * 0.1, H * 0.5); ctx.stroke();   // legs
    ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(0, -H * 0.02, W * 0.12, H * 0.16, 0, 0, Math.PI * 2); ctx.fill();   // leotard
    ctx.strokeStyle = '#e8c9a8'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(-W * 0.08, -H * 0.08); ctx.quadraticCurveTo(-W * 0.28, -H * 0.2, -W * 0.18, -H * 0.36); ctx.moveTo(W * 0.08, -H * 0.08); ctx.quadraticCurveTo(W * 0.28, -H * 0.2, W * 0.18, -H * 0.36); ctx.stroke();   // arms
    ctx.fillStyle = '#f4efe6'; ctx.beginPath(); ctx.moveTo(-W * 0.2, -H * 0.3); ctx.lineTo(W * 0.2, -H * 0.3); ctx.lineTo(W * 0.15, -H * 0.05); ctx.lineTo(-W * 0.15, -H * 0.05); ctx.closePath(); ctx.fill();   // cup head
    ctx.fillStyle = '#f0e6d2'; ctx.beginPath(); ctx.ellipse(0, -H * 0.3, W * 0.2, H * 0.05, 0, 0, Math.PI * 2); ctx.fill();   // foam
    ctx.strokeStyle = '#f4efe6'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(W * 0.22, -H * 0.17, W * 0.08, -1, 1.4); ctx.stroke();   // handle
    ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(-W * 0.07, -H * 0.17, W * 0.03, 0, Math.PI * 2); ctx.arc(W * 0.07, -H * 0.17, W * 0.03, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    return;
  }
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
