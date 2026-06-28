// In-game character skins: shape (diamond / chariot / unicorn) × colour.
// Unlocked by best score, or by a secret lore-code (redeemed separately).

export type SkinShape = 'diamond' | 'chariot' | 'unicorn' | 'nave' | 'star' | 'heart' | 'shark' | 'crocbomber' | 'ballerina'
  // creatures — used by hazardous NPCs (animals / robots / mythical), recolourable via `creature:` ids
  | 'dragon' | 'wolf' | 'spider' | 'snake' | 'bat' | 'slime' | 'ghost' | 'robot' | 'drone'
  | 'demon' | 'golem' | 'kraken' | 'eyeball' | 'mushroom' | 'crab' | 'scorpion' | 'beetle' | 'mech' | 'ufo'
  | 'rat' | 'pigeon' | 'cat' | 'dog' | 'cow';
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
  // mythical
  { shape: 'dragon', name: 'Dragon' }, { shape: 'demon', name: 'Demon' }, { shape: 'golem', name: 'Golem' },
  { shape: 'kraken', name: 'Kraken' }, { shape: 'eyeball', name: 'Eye' }, { shape: 'mushroom', name: 'Myconid' },
  { shape: 'ghost', name: 'Ghost' }, { shape: 'slime', name: 'Slime' },
  // animal
  { shape: 'wolf', name: 'Wolf' }, { shape: 'bat', name: 'Bat' }, { shape: 'spider', name: 'Spider' },
  { shape: 'snake', name: 'Snake' }, { shape: 'crab', name: 'Crab' }, { shape: 'scorpion', name: 'Scorpion' },
  { shape: 'beetle', name: 'Beetle' },
  { shape: 'rat', name: 'Rat' }, { shape: 'pigeon', name: 'Pigeon' }, { shape: 'cat', name: 'Cat' },
  { shape: 'dog', name: 'Dog' }, { shape: 'cow', name: 'Cow' },
  // mechanical
  { shape: 'robot', name: 'Robot' }, { shape: 'drone', name: 'Drone' }, { shape: 'mech', name: 'Mech' },
  { shape: 'ufo', name: 'UFO' },
];
const CREATURE_SET = new Set<string>(CREATURE_SHAPES.map(c => c.shape));
const isHex = (c: string | undefined): c is string => !!c && /^#[0-9a-fA-F]{3,8}$/.test(c);
// lighten (amt>0) / darken (amt<0) a hex colour by amt in [-1,1].
export function shade(hex: string, amt: number): string {
  let h = hex.replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const n = parseInt(h.slice(0, 6) || '7bd16b', 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(amt >= 0 ? c + (255 - c) * amt : c * (1 + amt))));
  const r = f((n >> 16) & 255), g = f((n >> 8) & 255), b = f(n & 255);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}
export const isCreatureId = (id: string): boolean => id.startsWith('creature:');
// `creature:<shape>:<color>:<accent?>` — accent defaults to a darker shade of the body colour.
export function parseCreature(id: string): { shape: SkinShape; color: string; accent: string } {
  const [, shape, color, accent] = id.split(':');
  const c = isHex(color) ? color : '#7bd16b';
  return {
    shape: (CREATURE_SET.has(shape) ? shape : 'dragon') as SkinShape,
    color: c, accent: isHex(accent) ? accent : shade(c, -0.42),
  };
}
export const encodeCreature = (shape: SkinShape, color: string, accent?: string): string =>
  `creature:${shape}:${color}${accent ? ':' + accent : ''}`;

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
export function drawSkinShape(ctx: CanvasRenderingContext2D, shape: SkinShape, color: string, w: number, h: number, af: number, accent: string = color) {
  // ── creatures (hazardous NPCs) — all face right, centred at origin, glow + frame-based motion.
  //    `accent` is the two-tone secondary (wings / limbs / underside); body stays `color`. ──
  if (shape === 'dragon') {
    const W = w * 1.15, H = h, flap = Math.sin(af * 0.18) * 0.5 + 0.5, sway = Math.sin(af * 0.12) * W * 0.03;
    ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 13;
    // serpentine S body, drawn as overlapping tapering segments: tail (bottom-left) coils up to head (top-right)
    const spine: [number, number][] = [[-W * 0.34, H * 0.46], [-W * 0.12, H * 0.38], [W * 0.05, H * 0.18], [W * 0.07, -H * 0.04], [-W * 0.04, -H * 0.24], [W * 0.07, -H * 0.4], [W * 0.2, -H * 0.5]];
    for (let i = 0; i < spine.length; i++) { const t = i / (spine.length - 1), r = H * 0.17 * (1 - t * 0.6); ctx.beginPath(); ctx.ellipse(spine[i][0] + sway * t, spine[i][1], r * 0.95, r, 0, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = 'rgba(255,255,255,0.16)'; ctx.shadowBlur = 0;   // belly scale highlights
    for (let i = 1; i < spine.length - 1; i++) { const t = i / (spine.length - 1); ctx.beginPath(); ctx.ellipse(spine[i][0] + sway * t, spine[i][1] + H * 0.04, H * 0.06, H * 0.035, 0, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 13;
    ctx.beginPath(); ctx.moveTo(-W * 0.34, H * 0.46); ctx.lineTo(-W * 0.52, H * 0.52); ctx.lineTo(-W * 0.36, H * 0.34); ctx.closePath(); ctx.fill();   // tail spade
    // raised bat wings from the upper back, scalloped trailing edge (accent; far dim, near full)
    ctx.fillStyle = accent;
    for (const [s, a] of [[0.7, 0.5], [1, 1]] as const) {
      ctx.globalAlpha = a; const bx = W * 0.0, by = -H * 0.14;
      ctx.beginPath(); ctx.moveTo(bx, by);
      ctx.lineTo(bx - W * 0.46 * s, by - H * (0.36 + flap * 0.18));
      ctx.quadraticCurveTo(bx - W * 0.34 * s, by - H * 0.1, bx - W * 0.28 * s, by - H * 0.04);
      ctx.quadraticCurveTo(bx - W * 0.32 * s, by + H * 0.04, bx - W * 0.16 * s, by + H * 0.04);
      ctx.quadraticCurveTo(bx - W * 0.18 * s, by + H * 0.1, bx - W * 0.04, by + H * 0.06);
      ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
    }
    ctx.fillStyle = color;
    // head at the top: snout-right, two horns swept back
    const hx = W * 0.2 + sway, hy = -H * 0.52;
    ctx.beginPath(); ctx.ellipse(hx, hy, W * 0.16, H * 0.11, -0.1, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(hx + W * 0.02, hy - H * 0.03); ctx.lineTo(hx + W * 0.32, hy + H * 0.0); ctx.lineTo(hx + W * 0.02, hy + H * 0.06); ctx.closePath(); ctx.fill();   // snout
    ctx.fillStyle = accent; for (const dx of [-W * 0.05, W * 0.04]) { ctx.beginPath(); ctx.moveTo(hx + dx, hy - H * 0.06); ctx.lineTo(hx + dx - W * 0.08, hy - H * 0.24); ctx.lineTo(hx + dx + W * 0.03, hy - H * 0.06); ctx.closePath(); ctx.fill(); }   // horns (accent)
    ctx.fillStyle = '#1a0008'; ctx.shadowBlur = 0; ctx.beginPath(); ctx.arc(hx + W * 0.07, hy - H * 0.01, W * 0.03, 0, 7); ctx.fill();   // eye
    return;
  }
  if (shape === 'wolf') {
    const W = w * 1.15, H = h, gait = Math.sin(af * 0.3), tw = Math.sin(af * 0.2) * H * 0.08;
    ctx.fillStyle = color; ctx.strokeStyle = accent; ctx.shadowColor = color; ctx.shadowBlur = 12; ctx.lineWidth = Math.max(3, W * 0.09); ctx.lineCap = 'round';
    const ly = H * 0.16;
    ctx.beginPath(); ctx.moveTo(-W * 0.28, ly); ctx.lineTo(-W * 0.28 + gait * W * 0.06, H * 0.46); ctx.moveTo(W * 0.26, ly); ctx.lineTo(W * 0.26 - gait * W * 0.06, H * 0.46); ctx.stroke();   // legs (accent, pair A)
    ctx.beginPath(); ctx.moveTo(-W * 0.16, ly); ctx.lineTo(-W * 0.16 - gait * W * 0.06, H * 0.46); ctx.moveTo(W * 0.14, ly); ctx.lineTo(W * 0.14 + gait * W * 0.06, H * 0.46); ctx.stroke();   // legs (accent, pair B)
    ctx.beginPath(); ctx.ellipse(0, 0, W * 0.4, H * 0.22, 0, 0, Math.PI * 2); ctx.fill();   // body
    ctx.fillStyle = accent; ctx.beginPath(); ctx.moveTo(-W * 0.36, -H * 0.02); ctx.quadraticCurveTo(-W * 0.62, -H * 0.1 + tw, -W * 0.52, -H * 0.28 + tw); ctx.lineTo(-W * 0.34, -H * 0.1); ctx.closePath(); ctx.fill();   // tail (accent)
    ctx.fillStyle = 'rgba(255,255,255,0.32)'; ctx.shadowBlur = 0; ctx.beginPath(); ctx.ellipse(W * 0.06, H * 0.12, W * 0.2, H * 0.12, 0, 0, Math.PI * 2); ctx.fill();   // pale belly
    ctx.fillStyle = accent; for (const px of [-W * 0.28, -W * 0.16, W * 0.26, W * 0.14]) { ctx.beginPath(); ctx.ellipse(px, H * 0.46, W * 0.05, H * 0.03, 0, 0, Math.PI * 2); ctx.fill(); }   // paws
    ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 12; ctx.beginPath(); ctx.ellipse(W * 0.42, -H * 0.08, W * 0.2, H * 0.18, 0, 0, Math.PI * 2); ctx.fill();   // head
    ctx.beginPath(); ctx.moveTo(W * 0.58, -H * 0.08); ctx.lineTo(W * 0.78, -H * 0.02); ctx.lineTo(W * 0.58, H * 0.05); ctx.closePath(); ctx.fill();   // snout
    ctx.fillStyle = accent; ctx.beginPath(); ctx.moveTo(W * 0.3, -H * 0.22); ctx.lineTo(W * 0.36, -H * 0.44); ctx.lineTo(W * 0.46, -H * 0.24); ctx.closePath(); ctx.fill();   // ear (accent)
    ctx.shadowBlur = 0; ctx.beginPath(); ctx.arc(W * 0.78, -H * 0.0, W * 0.035, 0, 7); ctx.fill();   // nose (accent)
    ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(W * 0.47, -H * 0.1, W * 0.03, 0, 7); ctx.fill();   // eye
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(W * 0.48, -H * 0.11, W * 0.012, 0, 7); ctx.fill();   // eye glint
    return;
  }
  if (shape === 'spider') {
    const W = w, H = h, wig = Math.sin(af * 0.3) * H * 0.04;
    ctx.strokeStyle = accent; ctx.shadowColor = color; ctx.shadowBlur = 10; ctx.lineWidth = Math.max(2, W * 0.05); ctx.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      const ly = -H * 0.14 + i * H * 0.1, k = (i % 2 === 0 ? 1 : -1) * wig;
      ctx.beginPath(); ctx.moveTo(-W * 0.1, ly); ctx.quadraticCurveTo(-W * 0.4, ly - H * 0.04 + k, -W * 0.5, ly + H * 0.13 + k); ctx.moveTo(W * 0.1, ly); ctx.quadraticCurveTo(W * 0.4, ly - H * 0.04 - k, W * 0.5, ly + H * 0.13 - k); ctx.stroke();
    }
    ctx.fillStyle = color; ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.ellipse(0, H * 0.1, W * 0.26, H * 0.22, 0, 0, Math.PI * 2); ctx.fill();   // abdomen
    ctx.fillStyle = accent; ctx.shadowBlur = 0; ctx.beginPath(); ctx.moveTo(0, H * 0.0); ctx.lineTo(-W * 0.07, H * 0.14); ctx.lineTo(0, H * 0.1); ctx.lineTo(W * 0.07, H * 0.14); ctx.closePath(); ctx.fill();   // hourglass marking
    ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 12; ctx.beginPath(); ctx.ellipse(0, -H * 0.16, W * 0.18, H * 0.15, 0, 0, Math.PI * 2); ctx.fill();   // head
    ctx.fillStyle = accent; ctx.shadowBlur = 0; ctx.beginPath(); ctx.moveTo(-W * 0.05, -H * 0.04); ctx.lineTo(-W * 0.07, H * 0.04); ctx.lineTo(-W * 0.02, -H * 0.03); ctx.closePath(); ctx.moveTo(W * 0.05, -H * 0.04); ctx.lineTo(W * 0.07, H * 0.04); ctx.lineTo(W * 0.02, -H * 0.03); ctx.closePath(); ctx.fill();   // fangs
    ctx.fillStyle = '#ff2b2b'; ctx.shadowColor = '#ff2b2b'; ctx.shadowBlur = 6; ctx.beginPath(); ctx.arc(-W * 0.07, -H * 0.18, W * 0.03, 0, 7); ctx.arc(W * 0.07, -H * 0.18, W * 0.03, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(-W * 0.13, -H * 0.13, W * 0.018, 0, 7); ctx.arc(W * 0.13, -H * 0.13, W * 0.018, 0, 7); ctx.fill();   // extra eyes
    return;
  }
  if (shape === 'snake') {
    const W = w * 1.2, H = h;
    ctx.strokeStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 12; ctx.lineWidth = Math.max(5, H * 0.16); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    const N = 6; for (let i = 0; i <= N; i++) { const t = i / N, x = -W * 0.5 + t * W, y = Math.sin(t * Math.PI * 2.2 + af * 0.15) * H * 0.18; i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
    ctx.stroke();
    ctx.fillStyle = accent; ctx.shadowBlur = 0;   // diamond pattern along the back
    for (let i = 1; i < N; i++) { const t = i / N, x = -W * 0.5 + t * W, y = Math.sin(t * Math.PI * 2.2 + af * 0.15) * H * 0.18; ctx.beginPath(); ctx.moveTo(x, y - H * 0.06); ctx.lineTo(x + W * 0.04, y); ctx.lineTo(x, y + H * 0.06); ctx.lineTo(x - W * 0.04, y); ctx.closePath(); ctx.fill(); }
    ctx.shadowColor = color; ctx.shadowBlur = 12;
    const hy = Math.sin(Math.PI * 2.2 + af * 0.15) * H * 0.18;
    ctx.fillStyle = accent; ctx.beginPath(); ctx.ellipse(W * 0.5, hy, W * 0.11, H * 0.12, 0, 0, Math.PI * 2); ctx.fill();   // head (accent)
    ctx.strokeStyle = '#ff3333'; ctx.shadowBlur = 0; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(W * 0.59, hy); ctx.lineTo(W * 0.7, hy); ctx.stroke();   // tongue
    ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(W * 0.52, hy - H * 0.03, W * 0.025, 0, 7); ctx.fill();   // eye
    return;
  }
  if (shape === 'bat') {
    const W = w * 1.25, H = h, flap = Math.sin(af * 0.25) * H * 0.12;
    ctx.fillStyle = accent; ctx.shadowColor = color; ctx.shadowBlur = 14;
    for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(0, -H * 0.02);
      ctx.quadraticCurveTo(s * W * 0.28, -H * 0.18 - flap, s * W * 0.5, -H * 0.05 - flap);
      ctx.quadraticCurveTo(s * W * 0.42, -flap, s * W * 0.44, H * 0.1 - flap);
      ctx.quadraticCurveTo(s * W * 0.3, H * 0.02, s * W * 0.18, H * 0.08);
      ctx.quadraticCurveTo(s * W * 0.12, 0, 0, H * 0.04); ctx.closePath(); ctx.fill();
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.shadowBlur = 0; ctx.lineWidth = 1.4;   // wing finger-bones
    for (const s of [-1, 1]) for (const [ex, ey] of [[0.5, -0.05], [0.44, 0.1], [0.2, 0.06]] as const) { ctx.beginPath(); ctx.moveTo(0, -H * 0.02); ctx.lineTo(s * W * ex, ey * H - flap); ctx.stroke(); }
    ctx.shadowColor = color; ctx.shadowBlur = 14;
    ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(0, 0, W * 0.12, H * 0.2, 0, 0, Math.PI * 2); ctx.fill();   // body
    ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.shadowBlur = 0; ctx.beginPath(); ctx.ellipse(-W * 0.03, H * 0.02, W * 0.05, H * 0.12, 0, 0, Math.PI * 2); ctx.fill(); ctx.shadowColor = color; ctx.shadowBlur = 14; ctx.fillStyle = color;   // fur sheen
    ctx.beginPath(); ctx.moveTo(-W * 0.08, -H * 0.16); ctx.lineTo(-W * 0.12, -H * 0.34); ctx.lineTo(-W * 0.01, -H * 0.18); ctx.closePath(); ctx.moveTo(W * 0.08, -H * 0.16); ctx.lineTo(W * 0.12, -H * 0.34); ctx.lineTo(W * 0.01, -H * 0.18); ctx.closePath(); ctx.fill();   // ears
    ctx.fillStyle = '#fff'; ctx.shadowBlur = 0; ctx.beginPath(); ctx.arc(-W * 0.05, -H * 0.06, W * 0.025, 0, 7); ctx.arc(W * 0.05, -H * 0.06, W * 0.025, 0, 7); ctx.fill();
    return;
  }
  if (shape === 'slime') {
    const W = w, H = h, sq = Math.sin(af * 0.12) * 0.07, bw = W * (0.46 + sq), bh = H * (0.42 - sq * 1.5);
    ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 16;
    ctx.beginPath(); ctx.moveTo(-bw, H * 0.28); ctx.quadraticCurveTo(-bw, -bh, 0, -bh); ctx.quadraticCurveTo(bw, -bh, bw, H * 0.28); ctx.closePath(); ctx.fill();   // dome
    ctx.fillStyle = accent; ctx.beginPath(); ctx.ellipse(0, H * 0.26, bw * 1.04, H * 0.1, 0, 0, Math.PI * 2); ctx.fill();   // base (accent)
    ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.shadowBlur = 0; ctx.beginPath(); ctx.ellipse(-W * 0.16, -H * 0.1, W * 0.09, H * 0.12, -0.3, 0, Math.PI * 2); ctx.fill();   // shine
    ctx.fillStyle = 'rgba(255,255,255,0.22)'; for (const [bx, by, br] of [[W * 0.18, -H * 0.06, 0.04], [-W * 0.02, -H * 0.18, 0.03], [W * 0.06, H * 0.1, 0.025]] as const) { ctx.beginPath(); ctx.arc(bx, by, W * br, 0, 7); ctx.fill(); }   // inner bubbles
    ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 16; ctx.beginPath(); ctx.ellipse(W * 0.26, H * 0.16, W * 0.05, H * 0.08, 0, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;   // drip
    ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(-W * 0.12, H * 0.02, W * 0.05, 0, 7); ctx.arc(W * 0.12, H * 0.02, W * 0.05, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-W * 0.1, 0, W * 0.018, 0, 7); ctx.arc(W * 0.14, 0, W * 0.018, 0, 7); ctx.fill();
    return;
  }
  if (shape === 'ghost') {
    const W = w, H = h, cy = -H * 0.05, R = W * 0.34, baseY = H * 0.32;
    ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 18; ctx.globalAlpha = 0.92;
    ctx.beginPath(); ctx.arc(0, cy, R, Math.PI, Math.PI * 2); ctx.lineTo(R, baseY);
    const segs = 4; let x = R; for (let i = 0; i < segs; i++) { const nx = R - (i + 1) * (2 * R / segs), dip = (i % 2 === 0 ? 1 : 0.4) * H * 0.1 + Math.sin(af * 0.2 + i) * H * 0.02; ctx.quadraticCurveTo((x + nx) / 2, baseY + dip, nx, baseY); x = nx; }
    ctx.lineTo(-R, cy); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.ellipse(-R * 0.96, cy + H * 0.06, W * 0.07, H * 0.05, 0.5, 0, Math.PI * 2); ctx.ellipse(R * 0.96, cy + H * 0.06, W * 0.07, H * 0.05, -0.5, 0, Math.PI * 2); ctx.fill();   // wispy arms
    ctx.globalAlpha = 1;
    ctx.fillStyle = accent; ctx.globalAlpha = 0.55; ctx.shadowBlur = 0; ctx.beginPath(); ctx.ellipse(0, H * 0.16, W * 0.22, H * 0.13, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;   // accent underside
    ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.beginPath(); ctx.ellipse(-W * 0.16, -H * 0.16, W * 0.07, H * 0.1, -0.3, 0, Math.PI * 2); ctx.fill();   // sheen
    ctx.fillStyle = 'rgba(18,8,36,0.85)';
    ctx.beginPath(); ctx.ellipse(-W * 0.12, -H * 0.06, W * 0.06, H * 0.09, 0, 0, Math.PI * 2); ctx.ellipse(W * 0.12, -H * 0.06, W * 0.06, H * 0.09, 0, 0, Math.PI * 2); ctx.fill();   // eyes
    ctx.beginPath(); ctx.ellipse(0, H * 0.11, W * 0.06, H * 0.06, 0, 0, Math.PI * 2); ctx.fill();   // mouth
    return;
  }
  if (shape === 'robot') {
    const W = w, H = h, bob = Math.sin(af * 0.15) * H * 0.02;
    ctx.shadowColor = color; ctx.shadowBlur = 14;
    ctx.fillStyle = accent; ctx.fillRect(-W * 0.22, H * 0.2, W * 0.16, H * 0.28); ctx.fillRect(W * 0.06, H * 0.2, W * 0.16, H * 0.28);   // legs (accent)
    ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(-W * 0.3, -H * 0.18 + bob, W * 0.6, H * 0.42, W * 0.06); ctx.fill();   // body
    ctx.fillStyle = accent; ctx.fillRect(-W * 0.42, -H * 0.12 + bob, W * 0.1, H * 0.3); ctx.fillRect(W * 0.32, -H * 0.12 + bob, W * 0.1, H * 0.3);   // arms (accent)
    const pw = W * 0.26, ph = H * 0.2, py = -H * 0.04 + bob;   // centred chest plate
    ctx.fillStyle = accent; ctx.shadowBlur = 0; ctx.beginPath(); ctx.roundRect(-pw / 2, py, pw, ph, W * 0.03); ctx.fill();
    ctx.fillStyle = color; for (const rx of [-pw / 2 + W * 0.035, pw / 2 - W * 0.035]) for (const ry of [py + H * 0.035, py + ph - H * 0.035]) { ctx.beginPath(); ctx.arc(rx, ry, W * 0.018, 0, 7); ctx.fill(); }   // corner rivets
    ctx.fillStyle = '#00eaff'; ctx.shadowColor = '#00eaff'; ctx.shadowBlur = 6; ctx.beginPath(); ctx.arc(0, py + ph / 2, W * 0.035, 0, 7); ctx.fill();   // core light
    ctx.shadowColor = color; ctx.shadowBlur = 14;
    ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(-W * 0.2, -H * 0.46 + bob, W * 0.4, H * 0.3, W * 0.05); ctx.fill();   // head
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -H * 0.46 + bob); ctx.lineTo(0, -H * 0.6 + bob); ctx.stroke(); ctx.beginPath(); ctx.arc(0, -H * 0.63 + bob, W * 0.04, 0, 7); ctx.fill();   // antenna
    ctx.fillStyle = '#00eaff'; ctx.shadowColor = '#00eaff'; ctx.shadowBlur = 8; ctx.beginPath(); ctx.arc(-W * 0.08, -H * 0.32 + bob, W * 0.05, 0, 7); ctx.arc(W * 0.08, -H * 0.32 + bob, W * 0.05, 0, 7); ctx.fill();   // eyes
    ctx.strokeStyle = accent; ctx.shadowBlur = 0; ctx.lineWidth = 1.5; for (let i = 0; i < 3; i++) { const gx = -W * 0.06 + i * W * 0.06; ctx.beginPath(); ctx.moveTo(gx, -H * 0.24 + bob); ctx.lineTo(gx, -H * 0.2 + bob); ctx.stroke(); }   // mouth grille
    return;
  }
  if (shape === 'drone') {
    const W = w, H = h, spin = af * 0.6;
    ctx.save(); ctx.strokeStyle = accent; ctx.shadowColor = color; ctx.shadowBlur = 10; ctx.lineWidth = 2.5; ctx.globalAlpha = 0.5;   // twin rotor blades (crossed blur)
    ctx.beginPath(); ctx.ellipse(0, -H * 0.28, W * 0.34 * Math.abs(Math.cos(spin)) + W * 0.04, H * 0.04, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, -H * 0.28, W * 0.34 * Math.abs(Math.sin(spin)) + W * 0.04, H * 0.04, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    ctx.strokeStyle = accent; ctx.shadowColor = color; ctx.shadowBlur = 14; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, -H * 0.28); ctx.lineTo(0, -H * 0.1); ctx.stroke();   // shaft (accent)
    ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(0, H * 0.02, W * 0.3, H * 0.26, 0, 0, Math.PI * 2); ctx.fill();   // body
    ctx.strokeStyle = accent; ctx.lineWidth = 2; ctx.shadowBlur = 0; ctx.beginPath(); ctx.moveTo(-W * 0.16, H * 0.24); ctx.lineTo(-W * 0.22, H * 0.38); ctx.moveTo(W * 0.16, H * 0.24); ctx.lineTo(W * 0.22, H * 0.38); ctx.stroke();   // landing legs
    ctx.fillStyle = '#ffd24a'; ctx.shadowColor = '#ffd24a'; ctx.shadowBlur = 6; ctx.beginPath(); ctx.arc(-W * 0.24, H * 0.04, W * 0.025, 0, 7); ctx.arc(W * 0.24, H * 0.04, W * 0.025, 0, 7); ctx.fill();   // side lights
    ctx.fillStyle = '#fff'; ctx.shadowBlur = 0; ctx.beginPath(); ctx.arc(0, H * 0.0, W * 0.14, 0, 7); ctx.fill();
    ctx.fillStyle = '#ff3333'; ctx.shadowColor = '#ff3333'; ctx.shadowBlur = 8; ctx.beginPath(); ctx.arc(W * 0.03, 0, W * 0.06, 0, 7); ctx.fill();   // eye
    return;
  }
  if (shape === 'demon') {
    const W = w * 1.1, H = h, flap = Math.sin(af * 0.2) * 0.5 + 0.5, tw = Math.sin(af * 0.18) * W * 0.04;
    ctx.fillStyle = accent; ctx.shadowColor = color; ctx.shadowBlur = 14;
    for (const s of [-1, 1]) {   // bat wings (accent)
      ctx.beginPath(); ctx.moveTo(s * W * 0.1, -H * 0.12);
      ctx.quadraticCurveTo(s * W * 0.5, -H * (0.42 + flap * 0.2), s * W * 0.56, -H * 0.02);
      ctx.quadraticCurveTo(s * W * 0.42, -H * 0.04, s * W * 0.4, H * 0.14);
      ctx.quadraticCurveTo(s * W * 0.3, 0, s * W * 0.12, H * 0.04); ctx.closePath(); ctx.fill();
    }
    ctx.strokeStyle = accent; ctx.lineWidth = Math.max(3, W * 0.05); ctx.lineCap = 'round';   // barbed tail
    ctx.beginPath(); ctx.moveTo(-W * 0.08, H * 0.3); ctx.quadraticCurveTo(-W * 0.36, H * 0.4 + tw, -W * 0.3, H * 0.52 + tw); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-W * 0.3, H * 0.52 + tw); ctx.lineTo(-W * 0.4, H * 0.48 + tw); ctx.lineTo(-W * 0.3, H * 0.6 + tw); ctx.lineTo(-W * 0.2, H * 0.48 + tw); ctx.closePath(); ctx.fill();
    ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(0, H * 0.14, W * 0.26, H * 0.24, 0, 0, Math.PI * 2); ctx.fill();   // body
    ctx.fillRect(-W * 0.16, H * 0.3, W * 0.1, H * 0.18); ctx.fillRect(W * 0.06, H * 0.3, W * 0.1, H * 0.18);   // legs
    ctx.beginPath(); ctx.ellipse(0, -H * 0.16, W * 0.21, H * 0.18, 0, 0, Math.PI * 2); ctx.fill();   // head
    ctx.fillStyle = accent; for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * W * 0.1, -H * 0.3); ctx.quadraticCurveTo(s * W * 0.24, -H * 0.52, s * W * 0.36, -H * 0.4); ctx.lineTo(s * W * 0.13, -H * 0.27); ctx.closePath(); ctx.fill(); }   // horns
    ctx.fillStyle = '#fff200'; ctx.shadowColor = '#ff5a00'; ctx.shadowBlur = 9;   // glowing eyes
    ctx.beginPath(); ctx.moveTo(-W * 0.13, -H * 0.21); ctx.lineTo(-W * 0.03, -H * 0.17); ctx.lineTo(-W * 0.13, -H * 0.13); ctx.closePath(); ctx.moveTo(W * 0.13, -H * 0.21); ctx.lineTo(W * 0.03, -H * 0.17); ctx.lineTo(W * 0.13, -H * 0.13); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#1a0000'; ctx.shadowBlur = 0; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-W * 0.09, -H * 0.06); ctx.lineTo(0, -H * 0.03); ctx.lineTo(W * 0.09, -H * 0.06); ctx.stroke();   // grin
    return;
  }
  if (shape === 'golem') {
    const W = w, H = h, bob = Math.sin(af * 0.1) * H * 0.015;
    ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 12;
    ctx.fillRect(-W * 0.26, H * 0.22, W * 0.2, H * 0.26); ctx.fillRect(W * 0.06, H * 0.22, W * 0.2, H * 0.26);   // legs
    ctx.beginPath(); ctx.ellipse(-W * 0.4, H * 0.02 + bob, W * 0.16, H * 0.2, 0, 0, Math.PI * 2); ctx.ellipse(W * 0.4, H * 0.02 + bob, W * 0.16, H * 0.2, 0, 0, Math.PI * 2); ctx.fill();   // boulder arms
    ctx.beginPath(); ctx.roundRect(-W * 0.34, -H * 0.24 + bob, W * 0.68, H * 0.5, W * 0.12); ctx.fill();   // torso
    ctx.beginPath(); ctx.roundRect(-W * 0.18, -H * 0.46 + bob, W * 0.36, H * 0.26, W * 0.08); ctx.fill();   // head
    ctx.strokeStyle = accent; ctx.lineWidth = 2.2; ctx.shadowBlur = 0;   // cracks (accent)
    ctx.beginPath(); ctx.moveTo(-W * 0.1, -H * 0.2 + bob); ctx.lineTo(-W * 0.02, -H * 0.05 + bob); ctx.lineTo(-W * 0.12, H * 0.06 + bob); ctx.moveTo(W * 0.14, -H * 0.12 + bob); ctx.lineTo(W * 0.05, H * 0.0 + bob); ctx.stroke();
    ctx.fillStyle = '#ffd24a'; ctx.shadowColor = '#ffd24a'; ctx.shadowBlur = 12;   // glowing core + eyes
    ctx.beginPath(); ctx.arc(0, H * 0.02 + bob, W * 0.07, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(-W * 0.08, -H * 0.34 + bob, W * 0.035, 0, 7); ctx.arc(W * 0.08, -H * 0.34 + bob, W * 0.035, 0, 7); ctx.fill();
    return;
  }
  if (shape === 'kraken') {
    const W = w, H = h;
    ctx.strokeStyle = accent; ctx.shadowColor = color; ctx.shadowBlur = 14; ctx.lineCap = 'round'; ctx.lineWidth = Math.max(3, W * 0.08);
    for (let i = 0; i < 6; i++) { const t = (i - 2.5) / 2.5, ph = af * 0.13 + i;   // tentacles fan outward (accent)
      const bx = t * W * 0.22, ex = t * W * 0.52 + Math.sin(ph) * W * 0.05;
      ctx.beginPath(); ctx.moveTo(bx, H * 0.14); ctx.quadraticCurveTo(t * W * 0.48, H * 0.32, ex, H * 0.5); ctx.stroke(); }
    ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(0, -H * 0.06, W * 0.34, H * 0.32, 0, 0, Math.PI * 2); ctx.fill();   // round mantle
    ctx.fillStyle = '#fff'; ctx.shadowBlur = 0; ctx.beginPath(); ctx.arc(-W * 0.13, -H * 0.08, W * 0.12, 0, 7); ctx.arc(W * 0.13, -H * 0.08, W * 0.12, 0, 7); ctx.fill();   // big eyes
    ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(-W * 0.1, -H * 0.06, W * 0.055, 0, 7); ctx.arc(W * 0.16, -H * 0.06, W * 0.055, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-W * 0.15, -H * 0.11, W * 0.025, 0, 7); ctx.arc(W * 0.11, -H * 0.11, W * 0.025, 0, 7); ctx.fill();   // glints
    return;
  }
  if (shape === 'eyeball') {
    const W = w, H = h, look = Math.sin(af * 0.08) * W * 0.05;
    ctx.strokeStyle = accent; ctx.shadowColor = color; ctx.shadowBlur = 10; ctx.lineWidth = Math.max(2, W * 0.045); ctx.lineCap = 'round';
    for (let i = 0; i < 5; i++) { const a0 = -Math.PI * 0.5 + (i - 2) * 0.55, bx = Math.cos(a0) * W * 0.3, by = -H * 0.06 + Math.sin(a0) * H * 0.24, ph = af * 0.12 + i;   // eyestalk tendrils (accent)
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.quadraticCurveTo(bx + Math.cos(a0) * W * 0.1, by + Math.sin(a0) * H * 0.12 + Math.sin(ph) * 4, bx + Math.cos(a0) * W * 0.22, by + Math.sin(a0) * H * 0.22); ctx.stroke(); }
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(0, 0, W * 0.34, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.shadowBlur = 0; ctx.beginPath(); ctx.arc(0, 0, W * 0.26, 0, 7); ctx.fill();   // sclera
    ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(look, 0, W * 0.14, 0, 7); ctx.fill();   // iris (accent)
    ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(look, 0, W * 0.07, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(look - W * 0.04, -H * 0.04, W * 0.03, 0, 7); ctx.fill();
    return;
  }
  if (shape === 'mushroom') {
    const W = w, H = h, sway = Math.sin(af * 0.1) * 0.04;
    ctx.save(); ctx.rotate(sway); ctx.shadowColor = color; ctx.shadowBlur = 14;
    ctx.fillStyle = accent; ctx.beginPath(); ctx.moveTo(-W * 0.16, H * 0.4); ctx.quadraticCurveTo(-W * 0.2, 0, -W * 0.12, -H * 0.08); ctx.lineTo(W * 0.12, -H * 0.08); ctx.quadraticCurveTo(W * 0.2, 0, W * 0.16, H * 0.4); ctx.closePath(); ctx.fill();   // stem (accent)
    ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(0, -H * 0.12, W * 0.4, H * 0.26, 0, Math.PI, Math.PI * 2); ctx.lineTo(-W * 0.4, -H * 0.12); ctx.closePath(); ctx.fill();   // cap dome
    ctx.beginPath(); ctx.ellipse(0, -H * 0.1, W * 0.4, H * 0.07, 0, 0, Math.PI * 2); ctx.fill();   // cap rim
    ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.shadowBlur = 0; for (const [dx, dy] of [[-W * 0.18, -H * 0.22], [W * 0.16, -H * 0.26], [0, -H * 0.16], [W * 0.28, -H * 0.12]]) { ctx.beginPath(); ctx.ellipse(dx, dy, W * 0.06, H * 0.045, 0, 0, Math.PI * 2); ctx.fill(); }   // spots
    ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(-W * 0.07, H * 0.08, W * 0.035, 0, 7); ctx.arc(W * 0.07, H * 0.08, W * 0.035, 0, 7); ctx.fill();   // eyes
    ctx.restore();
    return;
  }
  if (shape === 'crab') {
    const W = w, H = h, claw = Math.sin(af * 0.15) * 0.18;
    ctx.strokeStyle = accent; ctx.shadowColor = color; ctx.shadowBlur = 12; ctx.lineWidth = Math.max(2, W * 0.04); ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) { const ly = H * 0.02 + i * H * 0.08; ctx.beginPath(); ctx.moveTo(-W * 0.26, ly); ctx.lineTo(-W * 0.5, ly + H * 0.12); ctx.moveTo(W * 0.26, ly); ctx.lineTo(W * 0.5, ly + H * 0.12); ctx.stroke(); }   // legs (accent)
    ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(0, H * 0.06, W * 0.36, H * 0.22, 0, 0, Math.PI * 2); ctx.fill();   // shell
    ctx.strokeStyle = accent; ctx.beginPath(); ctx.moveTo(-W * 0.3, -H * 0.04); ctx.lineTo(-W * 0.44, -H * 0.16); ctx.moveTo(W * 0.3, -H * 0.04); ctx.lineTo(W * 0.44, -H * 0.16); ctx.stroke();   // arms
    ctx.fillStyle = accent; for (const s of [-1, 1]) { ctx.save(); ctx.translate(s * W * 0.48, -H * 0.2); ctx.rotate(s * claw); ctx.beginPath(); ctx.ellipse(0, 0, W * 0.13, H * 0.1, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(s * W * 0.02, -H * 0.03); ctx.lineTo(s * W * 0.17, -H * 0.05); ctx.lineTo(s * W * 0.17, H * 0.01); ctx.closePath(); ctx.fill(); ctx.fillStyle = accent; ctx.restore(); }   // claws with pincer gap
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-W * 0.1, -H * 0.14); ctx.lineTo(-W * 0.1, -H * 0.3); ctx.moveTo(W * 0.1, -H * 0.14); ctx.lineTo(W * 0.1, -H * 0.3); ctx.stroke();   // eyestalks
    ctx.fillStyle = '#000'; ctx.shadowBlur = 0; ctx.beginPath(); ctx.arc(-W * 0.1, -H * 0.32, W * 0.035, 0, 7); ctx.arc(W * 0.1, -H * 0.32, W * 0.035, 0, 7); ctx.fill();
    return;
  }
  if (shape === 'scorpion') {
    const W = w * 1.1, H = h, sting = Math.sin(af * 0.15) * H * 0.04;
    ctx.strokeStyle = accent; ctx.shadowColor = color; ctx.shadowBlur = 12; ctx.lineWidth = Math.max(2, W * 0.04); ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) { const lx = -W * 0.04 + i * W * 0.12; ctx.beginPath(); ctx.moveTo(lx, H * 0.08); ctx.lineTo(lx - W * 0.08, H * 0.26); ctx.moveTo(lx, H * 0.08); ctx.lineTo(lx + W * 0.1, H * 0.26); ctx.stroke(); }   // legs (accent)
    ctx.fillStyle = color; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse(-W * 0.1 + i * W * 0.14, H * 0.02, W * 0.16, H * 0.13, 0, 0, Math.PI * 2); ctx.fill(); }   // segmented body
    ctx.fillStyle = accent; const tail = [[-W * 0.32, -H * 0.02], [-W * 0.44, -H * 0.18], [-W * 0.38, -H * 0.38], [-W * 0.2, -H * 0.46 + sting]];   // curled tail (accent)
    for (const [tx, ty] of tail) { ctx.beginPath(); ctx.arc(tx, ty, W * 0.06, 0, 7); ctx.fill(); }
    ctx.beginPath(); ctx.moveTo(-W * 0.2, -H * 0.46 + sting); ctx.lineTo(-W * 0.08, -H * 0.56 + sting); ctx.lineTo(-W * 0.16, -H * 0.4 + sting); ctx.closePath(); ctx.fill();   // stinger
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(W * 0.34, H * 0.0 + s * H * 0.07, W * 0.12, H * 0.06, 0.2 * s, 0, Math.PI * 2); ctx.fill(); }   // pincers
    ctx.fillStyle = '#000'; ctx.shadowBlur = 0; ctx.beginPath(); ctx.arc(W * 0.06, -H * 0.03, W * 0.025, 0, 7); ctx.fill();
    return;
  }
  if (shape === 'beetle') {
    const W = w, H = h;
    ctx.strokeStyle = accent; ctx.shadowColor = color; ctx.shadowBlur = 12; ctx.lineWidth = Math.max(2, W * 0.045); ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) { const ly = -H * 0.04 + i * H * 0.12; ctx.beginPath(); ctx.moveTo(-W * 0.2, ly); ctx.lineTo(-W * 0.42, ly + H * 0.06); ctx.moveTo(W * 0.2, ly); ctx.lineTo(W * 0.42, ly + H * 0.06); ctx.stroke(); }   // legs (accent)
    ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(0, H * 0.06, W * 0.34, H * 0.3, 0, 0, Math.PI * 2); ctx.fill();   // shell
    ctx.strokeStyle = accent; ctx.lineWidth = 2; ctx.shadowBlur = 0; ctx.beginPath(); ctx.moveTo(0, -H * 0.2); ctx.lineTo(0, H * 0.34); ctx.stroke();   // elytra split
    ctx.fillStyle = accent; ctx.shadowBlur = 12; ctx.beginPath(); ctx.ellipse(0, -H * 0.24, W * 0.14, H * 0.1, 0, 0, Math.PI * 2); ctx.fill();   // head
    ctx.beginPath(); ctx.moveTo(0, -H * 0.3); ctx.quadraticCurveTo(W * 0.05, -H * 0.52, -W * 0.05, -H * 0.56); ctx.quadraticCurveTo(W * 0.03, -H * 0.48, W * 0.0, -H * 0.32); ctx.closePath(); ctx.fill();   // horn
    ctx.shadowBlur = 0; for (const [dx, dy] of [[-W * 0.16, H * 0.0], [W * 0.16, H * 0.0], [-W * 0.12, H * 0.18], [W * 0.12, H * 0.18]]) { ctx.beginPath(); ctx.arc(dx, dy, W * 0.03, 0, 7); ctx.fill(); }   // shell dots
    return;
  }
  // ── urban animals — flat naturalistic style (no glow), facing right ──
  if (shape === 'rat') {
    ctx.save(); ctx.translate(0, h * 0.18);
    const W = w * 0.525, H = h * 0.5, bob = Math.sin(af * 0.24) * H * 0.04, gait = Math.sin(af * 0.3);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = shade(color, -0.18); ctx.lineWidth = Math.max(1.5, W * 0.03); ctx.lineCap = 'round';
    const tsw = Math.sin(af * 0.18) * W * 0.07;
    ctx.beginPath(); ctx.moveTo(-W * 0.25, H * 0.1); ctx.quadraticCurveTo(-W * 0.55, H * 0.18 + tsw, -W * 0.72, -H * 0.1 + tsw); ctx.stroke();   // tail
    ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(0, H * 0.08, W * 0.3, H * 0.16, 0, 0, Math.PI * 2); ctx.fill();   // body
    ctx.fillStyle = shade(color, 0.28); ctx.beginPath(); ctx.ellipse(W * 0.06, H * 0.12, W * 0.16, H * 0.08, 0, 0, Math.PI * 2); ctx.fill();   // pale belly
    ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(W * 0.36, bob, W * 0.15, H * 0.13, 0, 0, Math.PI * 2); ctx.fill();   // head
    ctx.fillStyle = shade(color, -0.1); ctx.beginPath(); ctx.moveTo(W * 0.48, H * 0.04 + bob); ctx.lineTo(W * 0.68, H * 0.08 + bob); ctx.lineTo(W * 0.5, H * 0.13 + bob); ctx.closePath(); ctx.fill();   // pointed snout
    ctx.fillStyle = shade(color, 0.08); ctx.beginPath(); ctx.arc(W * 0.26, -H * 0.1 + bob, W * 0.09, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(W * 0.4, -H * 0.11 + bob, W * 0.075, 0, Math.PI * 2); ctx.fill();   // ears
    ctx.fillStyle = 'rgba(255,155,155,0.55)'; ctx.beginPath(); ctx.arc(W * 0.26, -H * 0.1 + bob, W * 0.05, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(W * 0.4, -H * 0.11 + bob, W * 0.042, 0, Math.PI * 2); ctx.fill();   // pink inner ear
    ctx.strokeStyle = shade(color, -0.14); ctx.lineWidth = Math.max(2, W * 0.06); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-W * 0.12, H * 0.21); ctx.lineTo(-W * 0.1, H * 0.36 + gait * H * 0.05); ctx.moveTo(W * 0.08, H * 0.21); ctx.lineTo(W * 0.06, H * 0.36 - gait * H * 0.05); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-W * 0.22, H * 0.21); ctx.lineTo(-W * 0.2, H * 0.36 - gait * H * 0.05); ctx.moveTo(W * 0.18, H * 0.21); ctx.lineTo(W * 0.16, H * 0.36 + gait * H * 0.05); ctx.stroke();   // legs
    ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(W * 0.48, -H * 0.02 + bob, W * 0.028, 0, Math.PI * 2); ctx.fill();   // eye
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(W * 0.49, -H * 0.03 + bob, W * 0.011, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#cc5566'; ctx.beginPath(); ctx.arc(W * 0.66, H * 0.06 + bob, W * 0.022, 0, Math.PI * 2); ctx.fill();   // pink nose
    ctx.restore(); return;
  }
  if (shape === 'pigeon') {
    ctx.save(); ctx.translate(0, h * 0.21);
    const W = w * 0.5, H = h * 0.5, bob = Math.sin(af * 0.18) * H * 0.05;
    ctx.shadowBlur = 0;
    ctx.fillStyle = shade(color, -0.22); ctx.beginPath(); ctx.moveTo(-W * 0.28, H * 0.1); ctx.lineTo(-W * 0.58, H * 0.16); ctx.lineTo(-W * 0.5, -H * 0.04); ctx.closePath(); ctx.fill();   // tail fan
    ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(0, H * 0.08, W * 0.34, H * 0.18, 0, 0, Math.PI * 2); ctx.fill();   // body
    ctx.fillStyle = shade(color, 0.2); ctx.beginPath(); ctx.ellipse(-W * 0.04, H * 0.02, W * 0.18, H * 0.09, -0.2, 0, Math.PI * 2); ctx.fill();   // wing sheen
    ctx.fillStyle = 'rgba(120,190,255,0.3)'; ctx.beginPath(); ctx.ellipse(W * 0.18, H * 0.06, W * 0.07, H * 0.06, 0, 0, Math.PI * 2); ctx.fill();   // iridescent throat
    ctx.fillStyle = shade(color, 0.1); ctx.beginPath(); ctx.arc(W * 0.32, -H * 0.08 + bob, W * 0.14, 0, Math.PI * 2); ctx.fill();   // head
    ctx.fillStyle = '#b89030'; ctx.beginPath(); ctx.moveTo(W * 0.44, -H * 0.07 + bob); ctx.lineTo(W * 0.62, -H * 0.04 + bob); ctx.lineTo(W * 0.44, H * 0.0 + bob); ctx.closePath(); ctx.fill();   // beak
    ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(W * 0.4, -H * 0.12 + bob, W * 0.028, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(W * 0.41, -H * 0.13 + bob, W * 0.011, 0, Math.PI * 2); ctx.fill();   // eye + glint
    ctx.strokeStyle = '#b89030'; ctx.lineWidth = Math.max(1.5, W * 0.04); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(W * 0.06, H * 0.24); ctx.lineTo(W * 0.08, H * 0.4); ctx.lineTo(W * 0.2, H * 0.42); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-W * 0.08, H * 0.24); ctx.lineTo(-W * 0.06, H * 0.4); ctx.lineTo(-W * 0.18, H * 0.42); ctx.stroke();   // legs
    ctx.restore(); return;
  }
  if (shape === 'cat') {
    const W = w, H = h, tw = Math.sin(af * 0.16) * W * 0.08;
    ctx.shadowBlur = 0;
    ctx.strokeStyle = shade(color, -0.16); ctx.lineWidth = Math.max(2, W * 0.05); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-W * 0.28, H * 0.12); ctx.quadraticCurveTo(-W * 0.54, -H * 0.06 + tw, -W * 0.38, -H * 0.38 + tw); ctx.stroke();   // curved tail
    ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(0, H * 0.08, W * 0.32, H * 0.2, 0, 0, Math.PI * 2); ctx.fill();   // body
    ctx.fillStyle = shade(color, 0.3); ctx.beginPath(); ctx.ellipse(W * 0.04, H * 0.14, W * 0.16, H * 0.1, 0, 0, Math.PI * 2); ctx.fill();   // belly
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(W * 0.34, -H * 0.06, W * 0.18, 0, Math.PI * 2); ctx.fill();   // head
    ctx.beginPath(); ctx.moveTo(W * 0.2, -H * 0.18); ctx.lineTo(W * 0.13, -H * 0.38); ctx.lineTo(W * 0.3, -H * 0.2); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(W * 0.38, -H * 0.2); ctx.lineTo(W * 0.36, -H * 0.42); ctx.lineTo(W * 0.5, -H * 0.22); ctx.closePath(); ctx.fill();   // pointed ears
    ctx.fillStyle = 'rgba(255,155,155,0.42)'; ctx.beginPath(); ctx.moveTo(W * 0.22, -H * 0.2); ctx.lineTo(W * 0.16, -H * 0.34); ctx.lineTo(W * 0.29, -H * 0.21); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(W * 0.39, -H * 0.22); ctx.lineTo(W * 0.37, -H * 0.37); ctx.lineTo(W * 0.48, -H * 0.24); ctx.closePath(); ctx.fill();   // pink inner ear
    ctx.fillStyle = shade(color, 0.22); ctx.beginPath(); ctx.ellipse(W * 0.48, -H * 0.02, W * 0.1, H * 0.07, 0, 0, Math.PI * 2); ctx.fill();   // muzzle pad
    ctx.fillStyle = '#cc5577'; ctx.beginPath(); ctx.arc(W * 0.5, -H * 0.04, W * 0.022, 0, Math.PI * 2); ctx.fill();   // nose
    ctx.fillStyle = '#1a2a1a'; ctx.beginPath(); ctx.ellipse(W * 0.3, -H * 0.1, W * 0.04, W * 0.03, 0, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.ellipse(W * 0.44, -H * 0.1, W * 0.04, W * 0.03, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(W * 0.31, -H * 0.11, W * 0.013, 0, Math.PI * 2); ctx.fill();   // eyes + glint
    ctx.strokeStyle = shade(color, 0.5); ctx.lineWidth = 0.9;
    ctx.beginPath(); ctx.moveTo(W * 0.46, -H * 0.0); ctx.lineTo(W * 0.72, -H * 0.03); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(W * 0.46, -H * 0.04); ctx.lineTo(W * 0.72, -H * 0.04); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(W * 0.46, -H * 0.08); ctx.lineTo(W * 0.72, -H * 0.05); ctx.stroke();   // whiskers
    ctx.strokeStyle = shade(color, -0.12); ctx.lineWidth = Math.max(2, W * 0.055); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-W * 0.12, H * 0.24); ctx.lineTo(-W * 0.1, H * 0.4); ctx.moveTo(W * 0.08, H * 0.24); ctx.lineTo(W * 0.06, H * 0.4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-W * 0.22, H * 0.24); ctx.lineTo(-W * 0.2, H * 0.4); ctx.moveTo(W * 0.18, H * 0.24); ctx.lineTo(W * 0.16, H * 0.4); ctx.stroke();   // legs
    return;
  }
  if (shape === 'dog') {
    const W = w * 1.05, H = h, tw = Math.max(0, Math.sin(af * 0.32)) * H * 0.18;
    ctx.shadowBlur = 0;
    ctx.strokeStyle = color; ctx.lineWidth = Math.max(2.5, W * 0.065); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-W * 0.28, H * 0.06); ctx.quadraticCurveTo(-W * 0.5, -H * 0.1, -W * 0.46, -H * 0.28 - tw); ctx.stroke();   // wagging tail
    ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(0, H * 0.1, W * 0.36, H * 0.2, 0, 0, Math.PI * 2); ctx.fill();   // body
    ctx.fillStyle = shade(color, 0.28); ctx.beginPath(); ctx.ellipse(W * 0.04, H * 0.16, W * 0.18, H * 0.1, 0, 0, Math.PI * 2); ctx.fill();   // belly
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(W * 0.36, -H * 0.04, W * 0.2, 0, Math.PI * 2); ctx.fill();   // head
    ctx.fillStyle = shade(color, -0.18); ctx.beginPath(); ctx.ellipse(W * 0.23, H * 0.02, W * 0.1, H * 0.15, 0.3, 0, Math.PI * 2); ctx.fill();   // floppy ear
    ctx.fillStyle = shade(color, -0.1); ctx.beginPath(); ctx.moveTo(W * 0.38, -H * 0.2); ctx.lineTo(W * 0.32, -H * 0.4); ctx.lineTo(W * 0.52, -H * 0.22); ctx.closePath(); ctx.fill();   // upright ear
    ctx.fillStyle = shade(color, 0.18); ctx.beginPath(); ctx.ellipse(W * 0.52, -H * 0.02, W * 0.14, H * 0.08, 0, 0, Math.PI * 2); ctx.fill();   // snout
    ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(W * 0.56, -H * 0.04, W * 0.04, 0, Math.PI * 2); ctx.fill();   // nose
    ctx.fillStyle = '#2a1a0a'; ctx.beginPath(); ctx.arc(W * 0.34, -H * 0.1, W * 0.04, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(W * 0.46, -H * 0.1, W * 0.04, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(W * 0.35, -H * 0.11, W * 0.015, 0, Math.PI * 2); ctx.fill();   // eyes + glint
    ctx.strokeStyle = shade(color, -0.14); ctx.lineWidth = Math.max(2.5, W * 0.07); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-W * 0.14, H * 0.26); ctx.lineTo(-W * 0.12, H * 0.42); ctx.moveTo(W * 0.1, H * 0.26); ctx.lineTo(W * 0.08, H * 0.42); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-W * 0.24, H * 0.26); ctx.lineTo(-W * 0.22, H * 0.42); ctx.moveTo(W * 0.2, H * 0.26); ctx.lineTo(W * 0.18, H * 0.42); ctx.stroke();   // legs
    return;
  }
  if (shape === 'cow') {
    const W = w * 2.2, H = h * 2, sway = Math.sin(af * 0.1) * H * 0.02;
    ctx.shadowBlur = 0;
    ctx.strokeStyle = shade(color, -0.2); ctx.lineWidth = Math.max(2, W * 0.045); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-W * 0.36, H * 0.0); ctx.quadraticCurveTo(-W * 0.56, H * 0.18, -W * 0.5, H * 0.34 + sway); ctx.stroke();
    ctx.fillStyle = shade(color, -0.2); ctx.beginPath(); ctx.ellipse(-W * 0.5, H * 0.34 + sway, W * 0.04, W * 0.07, 0, 0, Math.PI * 2); ctx.fill();   // tail + tuft
    ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(0, H * 0.04, W * 0.44, H * 0.22, 0, 0, Math.PI * 2); ctx.fill();   // large body
    ctx.fillStyle = accent; ctx.beginPath(); ctx.ellipse(-W * 0.14, -H * 0.04, W * 0.14, H * 0.09, -0.4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(W * 0.18, H * 0.1, W * 0.1, H * 0.07, 0.5, 0, Math.PI * 2); ctx.fill();   // spots (accent)
    ctx.fillStyle = 'rgba(255,195,185,0.8)'; ctx.beginPath(); ctx.ellipse(W * 0.1, H * 0.25, W * 0.12, H * 0.06, 0, 0, Math.PI * 2); ctx.fill();   // udder
    ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(W * 0.48, -H * 0.06 + sway, W * 0.2, H * 0.16, 0, 0, Math.PI * 2); ctx.fill();   // head
    ctx.fillStyle = shade(color, -0.1); ctx.beginPath(); ctx.ellipse(W * 0.34, -H * 0.04 + sway, W * 0.07, H * 0.12, 0.5, 0, Math.PI * 2); ctx.fill();   // drooping ear
    ctx.strokeStyle = '#c8a030'; ctx.lineWidth = Math.max(2, W * 0.04); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(W * 0.4, -H * 0.17 + sway); ctx.quadraticCurveTo(W * 0.34, -H * 0.36 + sway, W * 0.42, -H * 0.38 + sway); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(W * 0.54, -H * 0.17 + sway); ctx.quadraticCurveTo(W * 0.6, -H * 0.36 + sway, W * 0.52, -H * 0.38 + sway); ctx.stroke();   // horns
    ctx.fillStyle = 'rgba(255,185,175,0.8)'; ctx.beginPath(); ctx.ellipse(W * 0.64, -H * 0.04 + sway, W * 0.1, H * 0.07, 0, 0, Math.PI * 2); ctx.fill();   // pink nose
    ctx.fillStyle = '#553333'; ctx.beginPath(); ctx.arc(W * 0.61, -H * 0.04 + sway, W * 0.026, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(W * 0.68, -H * 0.04 + sway, W * 0.026, 0, Math.PI * 2); ctx.fill();   // nostrils
    ctx.fillStyle = '#1a1a1a'; ctx.beginPath(); ctx.arc(W * 0.5, -H * 0.12 + sway, W * 0.038, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(W * 0.51, -H * 0.13 + sway, W * 0.014, 0, Math.PI * 2); ctx.fill();   // eye
    ctx.strokeStyle = shade(color, -0.14); ctx.lineWidth = Math.max(3, W * 0.08); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-W * 0.22, H * 0.22); ctx.lineTo(-W * 0.2, H * 0.44); ctx.moveTo(W * 0.14, H * 0.22); ctx.lineTo(W * 0.12, H * 0.44); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-W * 0.32, H * 0.22); ctx.lineTo(-W * 0.3, H * 0.44); ctx.moveTo(W * 0.24, H * 0.22); ctx.lineTo(W * 0.22, H * 0.44); ctx.stroke();   // legs
    return;
  }
  if (shape === 'mech') {
    const W = w, H = h, bob = Math.sin(af * 0.12) * H * 0.015;
    ctx.fillStyle = accent; ctx.shadowColor = color; ctx.shadowBlur = 14;
    ctx.fillRect(-W * 0.24, H * 0.16, W * 0.12, H * 0.2); ctx.fillRect(W * 0.12, H * 0.16, W * 0.12, H * 0.2);   // legs
    ctx.fillRect(-W * 0.28, H * 0.36, W * 0.18, H * 0.08); ctx.fillRect(W * 0.1, H * 0.36, W * 0.18, H * 0.08);   // feet
    ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(-W * 0.28, -H * 0.2 + bob, W * 0.56, H * 0.4, W * 0.05); ctx.fill();   // torso
    ctx.fillStyle = accent; ctx.fillRect(-W * 0.46, -H * 0.18 + bob, W * 0.16, H * 0.16);   // shoulder
    ctx.fillRect(W * 0.28, -H * 0.18 + bob, W * 0.12, H * 0.12); ctx.fillRect(W * 0.36, -H * 0.14 + bob, W * 0.2, H * 0.08);   // cannon
    ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(-W * 0.14, -H * 0.4 + bob, W * 0.28, H * 0.2, W * 0.04); ctx.fill();   // cockpit head
    ctx.fillStyle = '#ff5a3c'; ctx.shadowColor = '#ff5a3c'; ctx.shadowBlur = 8; ctx.fillRect(-W * 0.1, -H * 0.34 + bob, W * 0.2, H * 0.05);   // visor
    ctx.fillStyle = '#ffd24a'; ctx.shadowColor = '#ffd24a'; ctx.beginPath(); ctx.arc(0, -H * 0.02 + bob, W * 0.05, 0, 7); ctx.fill();   // chest light
    return;
  }
  if (shape === 'ufo') {
    const W = w * 1.2, H = h, spin = af * 0.1;
    ctx.save(); ctx.globalAlpha = 0.28; ctx.fillStyle = accent; ctx.shadowColor = accent; ctx.shadowBlur = 10;   // tractor beam
    ctx.beginPath(); ctx.moveTo(-W * 0.1, H * 0.06); ctx.lineTo(-W * 0.26, H * 0.44); ctx.lineTo(W * 0.26, H * 0.44); ctx.lineTo(W * 0.1, H * 0.06); ctx.closePath(); ctx.fill(); ctx.restore();
    ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 14; ctx.beginPath(); ctx.ellipse(0, H * 0.04, W * 0.42, H * 0.13, 0, 0, Math.PI * 2); ctx.fill();   // saucer
    ctx.fillStyle = accent; ctx.beginPath(); ctx.ellipse(0, H * 0.0, W * 0.2, H * 0.18, 0, Math.PI, Math.PI * 2); ctx.fill();   // dome
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.shadowBlur = 0; ctx.beginPath(); ctx.ellipse(-W * 0.05, -H * 0.06, W * 0.05, H * 0.05, 0, 0, Math.PI * 2); ctx.fill();   // glass glint
    for (let i = 0; i < 5; i++) { const lx = -W * 0.32 + i * W * 0.16, on = Math.sin(spin + i) > 0; ctx.fillStyle = on ? '#ffe24a' : '#7a6a20'; ctx.shadowColor = '#ffe24a'; ctx.shadowBlur = on ? 8 : 0; ctx.beginPath(); ctx.arc(lx, H * 0.07, W * 0.03, 0, 7); ctx.fill(); }   // running lights
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
