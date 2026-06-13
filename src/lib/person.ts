// OUROO "design a person" avatars — a procedural paper-doll human, drawn on the same canvas pipeline
// as the skins/icons. Fully self-contained in the appearance id (`person:<packed>`), so it broadcasts
// without any wallet lookup. The packed string is 14 ~-separated fields (indices + #-less hex colors).

export type PersonSpec = {
  g: number;        // body: 0 = slimmer, 1 = broader
  tone: number;     // skin-tone index (pale → dark)
  hair: number; hairC: string;
  hat: number; hatC: string;
  top: number; topC: string;
  pants: number; pantsC: string;
  shoes: number; shoeC: string;
  face: number;     // expression
  acc: number;      // accessory
};

// ── option sets (labels drive the creator UI) ──
export const TONES = ['#f3d6bd', '#e7b48f', '#cd8d5f', '#a06a43', '#6f4a2d', '#41291a'];   // white → black
export const HAIR = ['Bald', 'Short', 'Long', 'Afro', 'Bun', 'Mohawk', 'Ponytail'];
export const HATS = ['None', 'Cap', 'Beanie', 'Top hat', 'Crown', 'Cowboy'];
export const TOPS = ['Tee', 'Hoodie', 'Tank', 'Jacket', 'Dress'];
export const PANTS = ['Pants', 'Shorts', 'Skirt'];
export const SHOES = ['Sneakers', 'Boots', 'Barefoot'];
export const FACES = ['Neutral', 'Smile', 'Cool'];
export const ACCS = ['None', 'Glasses', 'Shades', 'Earrings', 'Beard'];
export const HAIR_COLORS = ['#1a1410', '#3a2616', '#6b4423', '#a9712f', '#d9b25a', '#e8e2d0', '#9a9a9a', '#b03028', '#cc44aa', '#4488ff'];
export const CLOTH_COLORS = ['#ff4e3e', '#ff8800', '#ffd23a', '#1ED760', '#00cfff', '#4466dd', '#cc44ff', '#ff66aa', '#ffffff', '#1a1a24', '#9aa0b5', '#7a4e2a'];

export const defaultPerson = (): PersonSpec => ({ g: 0, tone: 1, hair: 1, hairC: '#3a2616', hat: 0, hatC: '#1a1a24', top: 0, topC: '#00cfff', pants: 0, pantsC: '#1a1a24', shoes: 0, shoeC: '#ffffff', face: 1, acc: 0 });

const hx = (c: string) => c.replace('#', '');
export const isPersonId = (id: string) => id.startsWith('person:');
export function encodePerson(p: PersonSpec): string {
  return ['person:' + p.g, p.tone, p.hair, hx(p.hairC), p.hat, hx(p.hatC), p.top, hx(p.topC), p.pants, hx(p.pantsC), p.shoes, hx(p.shoeC), p.face, p.acc].join('~');
}
export function parsePerson(id: string): PersonSpec {
  const f = id.replace(/^person:/, '').split('~'); const n = (i: number, d = 0) => { const v = parseInt(f[i]); return Number.isFinite(v) ? v : d; }; const col = (i: number, d: string) => f[i] ? '#' + f[i] : d;
  const d = defaultPerson();
  return { g: n(0), tone: n(1, 1), hair: n(2, 1), hairC: col(3, d.hairC), hat: n(4), hatC: col(5, d.hatC), top: n(6), topC: col(7, d.topC), pants: n(8), pantsC: col(9, d.pantsC), shoes: n(10), shoeC: col(11, d.shoeC), face: n(12, 1), acc: n(13) };
}
export const personPrimaryColor = (p: PersonSpec): string => p.topC || '#00cfff';

const rr = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); };
const shadeC = (hex: string, f: number) => { const n = parseInt(hex.slice(1), 16); const r = Math.min(255, Math.round(((n >> 16) & 255) * f)), g = Math.min(255, Math.round(((n >> 8) & 255) * f)), b = Math.min(255, Math.round((n & 255) * f)); return `rgb(${r},${g},${b})`; };

// Draw a person centred at the current origin, fitting roughly w×h, `af` = anim frame (subtle sway).
export function drawPerson(ctx: CanvasRenderingContext2D, p: PersonSpec, w: number, h: number, af: number) {
  const s = h / 50, tone = TONES[p.tone] ?? TONES[1], sway = Math.sin(af * 0.12) * 0.6 * s;
  const broad = p.g === 1;
  const hbW = (broad ? 9 : 7.6) * s;     // torso half-width
  const dress = p.top === 4;
  const headY = -15 * s, headR = 7.2 * s, torsoTop = -7 * s, torsoBot = 9 * s, hipY = 9 * s, legBot = 21 * s;

  ctx.save(); ctx.lineJoin = 'round'; ctx.shadowBlur = 0;

  // ── legs / lower body ──
  if (dress || p.pants === 2) {   // skirt / dress flare
    const skC = dress ? p.topC : p.pantsC; ctx.fillStyle = skC;
    ctx.beginPath(); ctx.moveTo(-hbW * 0.7, hipY - 2 * s); ctx.lineTo(hbW * 0.7, hipY - 2 * s); ctx.lineTo(hbW * 1.15, legBot - 2 * s); ctx.lineTo(-hbW * 1.15, legBot - 2 * s); ctx.closePath(); ctx.fill();
    // lower legs (tone) below the hem
    ctx.fillStyle = tone; rr(ctx, -4.2 * s, legBot - 4 * s, 3.4 * s, 6 * s, 1.6 * s); ctx.fill(); rr(ctx, 0.8 * s, legBot - 4 * s, 3.4 * s, 6 * s, 1.6 * s); ctx.fill();
  } else {
    const short = p.pants === 1; const legLen = short ? 7 * s : (legBot - hipY); ctx.fillStyle = p.pantsC;
    rr(ctx, -4.6 * s, hipY, 3.8 * s, legLen, 1.8 * s); ctx.fill(); rr(ctx, 0.8 * s, hipY, 3.8 * s, legLen, 1.8 * s); ctx.fill();
    if (short) { ctx.fillStyle = tone; rr(ctx, -4.2 * s, hipY + legLen, 3.2 * s, (legBot - hipY) - legLen, 1.4 * s); ctx.fill(); rr(ctx, 1 * s, hipY + legLen, 3.2 * s, (legBot - hipY) - legLen, 1.4 * s); ctx.fill(); }
  }
  // ── shoes ──
  if (p.shoes !== 2) { ctx.fillStyle = p.shoeC; const sh = (p.shoes === 1 ? 5 : 3.2) * s; rr(ctx, -5 * s, legBot - 1 * s, 4.2 * s, sh, 1.6 * s); ctx.fill(); rr(ctx, 0.8 * s, legBot - 1 * s, 4.2 * s, sh, 1.6 * s); ctx.fill(); }
  else { ctx.fillStyle = tone; rr(ctx, -4.6 * s, legBot - 1 * s, 3.6 * s, 3 * s, 1.4 * s); ctx.fill(); rr(ctx, 1 * s, legBot - 1 * s, 3.6 * s, 3 * s, 1.4 * s); ctx.fill(); }

  // ── arms (behind torso) ──
  const longSleeve = p.top === 1 || p.top === 3;   // hoodie / jacket
  for (const side of [-1, 1]) {
    const ax = side * (hbW + 1.4 * s), aSwing = side * sway;
    ctx.fillStyle = longSleeve ? p.topC : tone; rr(ctx, ax - 1.8 * s, torsoTop + 1 * s + aSwing, 3.6 * s, 11 * s, 1.8 * s); ctx.fill();
    ctx.fillStyle = tone; ctx.beginPath(); ctx.arc(ax, torsoTop + 13 * s + aSwing, 2 * s, 0, Math.PI * 2); ctx.fill();   // hand
  }

  // ── torso / top ──
  ctx.fillStyle = p.topC;
  if (dress) { ctx.beginPath(); ctx.moveTo(-hbW, torsoTop); ctx.lineTo(hbW, torsoTop); ctx.lineTo(hbW * 0.9, hipY); ctx.lineTo(-hbW * 0.9, hipY); ctx.closePath(); ctx.fill(); }
  else { rr(ctx, -hbW, torsoTop, hbW * 2, torsoBot - torsoTop + 3 * s, 3 * s); ctx.fill(); }
  if (p.top === 2) { ctx.fillStyle = tone; rr(ctx, -hbW * 0.5, torsoTop - 1 * s, hbW, 5 * s, 2 * s); ctx.fill(); ctx.fillStyle = p.topC; for (const sx of [-hbW * 0.7, hbW * 0.3]) { rr(ctx, sx, torsoTop - 1 * s, hbW * 0.4, 6 * s, 1.5 * s); ctx.fill(); } }   // tank: straps
  if (p.top === 1) { ctx.fillStyle = shadeC(p.topC, 0.8); rr(ctx, -3.5 * s, torsoTop - 2.5 * s, 7 * s, 4 * s, 2 * s); ctx.fill(); ctx.strokeStyle = shadeC(p.topC, 0.6); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, torsoTop + 1 * s); ctx.lineTo(0, torsoBot); ctx.stroke(); }   // hoodie hood + zip
  if (p.top === 3) { ctx.strokeStyle = shadeC(p.topC, 0.6); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(0, torsoTop); ctx.lineTo(0, torsoBot + 2 * s); ctx.stroke(); }   // jacket zip

  // ── neck + head ──
  ctx.fillStyle = tone; rr(ctx, -2.2 * s, headY + headR - 1 * s, 4.4 * s, 5 * s, 1.6 * s); ctx.fill();
  ctx.beginPath(); ctx.arc(0, headY, headR, 0, Math.PI * 2); ctx.fill();
  if (p.acc === 4) { ctx.fillStyle = shadeC(p.hairC, 0.7); ctx.beginPath(); ctx.arc(0, headY + headR * 0.55, headR * 0.95, 0.15, Math.PI - 0.15); ctx.fill(); }   // beard

  // ── face ──
  ctx.fillStyle = '#1c1c22';
  const eyeY = headY - 0.5 * s, eyeX = 2.6 * s;
  if (p.acc !== 2) { ctx.beginPath(); ctx.arc(-eyeX, eyeY, 1.1 * s, 0, Math.PI * 2); ctx.arc(eyeX, eyeY, 1.1 * s, 0, Math.PI * 2); ctx.fill(); }
  ctx.strokeStyle = '#7a4a3a'; ctx.lineWidth = 1.2 * s; ctx.beginPath();
  if (p.face === 1) ctx.arc(0, headY + 2.6 * s, 2.4 * s, 0.2, Math.PI - 0.2);   // smile
  else if (p.face === 2) { ctx.moveTo(-2.4 * s, headY + 3.2 * s); ctx.lineTo(2.4 * s, headY + 3.2 * s); }   // straight (cool)
  else { ctx.moveTo(-1.8 * s, headY + 3.2 * s); ctx.lineTo(1.8 * s, headY + 3.2 * s); }
  ctx.stroke();

  // ── hair (drawn around/over the head per style) ──
  ctx.fillStyle = p.hairC; const hc = p.hairC;
  if (p.hair === 1) { ctx.beginPath(); ctx.arc(0, headY, headR + 0.8 * s, Math.PI * 1.05, Math.PI * 1.95); ctx.lineTo(headR * 0.8, headY - 1 * s); ctx.lineTo(-headR * 0.8, headY - 1 * s); ctx.closePath(); ctx.fill(); }   // short cap
  else if (p.hair === 2) { ctx.beginPath(); ctx.arc(0, headY, headR + 1 * s, Math.PI, Math.PI * 2); ctx.fill(); rr(ctx, -headR - 1 * s, headY, 2.4 * s, 10 * s, 1.2 * s); ctx.fill(); rr(ctx, headR - 1.4 * s, headY, 2.4 * s, 10 * s, 1.2 * s); ctx.fill(); }   // long
  else if (p.hair === 3) { ctx.beginPath(); ctx.arc(0, headY - 1 * s, headR + 2.4 * s, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = tone; ctx.beginPath(); ctx.arc(0, headY + 1 * s, headR, 0, Math.PI * 2); ctx.fill(); }   // afro
  else if (p.hair === 4) { ctx.beginPath(); ctx.arc(0, headY, headR + 0.8 * s, Math.PI, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(0, headY - headR - 1.5 * s, 2.6 * s, 0, Math.PI * 2); ctx.fill(); }   // bun
  else if (p.hair === 5) { rr(ctx, -1.4 * s, headY - headR - 3 * s, 2.8 * s, headR + 3 * s, 1 * s); ctx.fill(); }   // mohawk
  else if (p.hair === 6) { ctx.beginPath(); ctx.arc(0, headY, headR + 0.8 * s, Math.PI, Math.PI * 2); ctx.fill(); rr(ctx, headR - 1 * s, headY - 1 * s, 2.6 * s, 12 * s, 1.3 * s); ctx.fill(); }   // ponytail
  void hc;

  // ── hat ──
  if (p.hat) {
    ctx.fillStyle = p.hatC;
    if (p.hat === 1) { rr(ctx, -headR, headY - headR - 1.5 * s, headR * 2, 4 * s, 1.5 * s); ctx.fill(); rr(ctx, -headR - 1 * s, headY - headR + 1.5 * s, headR + 2 * s, 2 * s, 1 * s); ctx.fill(); }   // cap
    else if (p.hat === 2) { ctx.beginPath(); ctx.arc(0, headY - 1 * s, headR + 1 * s, Math.PI, Math.PI * 2); ctx.fill(); rr(ctx, -headR - 1 * s, headY - 1 * s, headR * 2 + 2 * s, 2 * s, 1 * s); ctx.fill(); }   // beanie
    else if (p.hat === 3) { rr(ctx, -headR - 1.5 * s, headY - headR - 1 * s, headR * 2 + 3 * s, 1.8 * s, 0.6 * s); ctx.fill(); rr(ctx, -headR * 0.8, headY - headR - 7 * s, headR * 1.6, 7 * s, 1 * s); ctx.fill(); }   // top hat
    else if (p.hat === 4) { ctx.beginPath(); for (let i = 0; i <= 6; i++) { const x = -headR + (headR * 2) * (i / 6), y = headY - headR + (i % 2 ? 2 * s : -3 * s); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.lineTo(headR, headY - headR + 2 * s); ctx.lineTo(-headR, headY - headR + 2 * s); ctx.closePath(); ctx.fill(); }   // crown
    else if (p.hat === 5) { ctx.beginPath(); ctx.ellipse(0, headY - headR + 1 * s, headR + 3 * s, 2 * s, 0, 0, Math.PI * 2); ctx.fill(); rr(ctx, -headR * 0.8, headY - headR - 5 * s, headR * 1.6, 6 * s, 2 * s); ctx.fill(); }   // cowboy
  }

  // ── accessory: glasses / shades / earrings ──
  if (p.acc === 1 || p.acc === 2) {
    const gy = headY - 0.5 * s; ctx.strokeStyle = '#1c1c22'; ctx.lineWidth = 1 * s;
    if (p.acc === 2) { ctx.fillStyle = '#1c1c22'; rr(ctx, -eyeX - 2.2 * s, gy - 1.6 * s, 9.2 * s, 3.2 * s, 1 * s); ctx.fill(); }
    else { ctx.beginPath(); ctx.arc(-eyeX, gy, 1.8 * s, 0, Math.PI * 2); ctx.arc(eyeX, gy, 1.8 * s, 0, Math.PI * 2); ctx.moveTo(-eyeX + 1.8 * s, gy); ctx.lineTo(eyeX - 1.8 * s, gy); ctx.stroke(); }
  }
  if (p.acc === 3) { ctx.fillStyle = '#ffd23a'; ctx.beginPath(); ctx.arc(-headR + 0.5 * s, headY + 2 * s, 1.2 * s, 0, Math.PI * 2); ctx.arc(headR - 0.5 * s, headY + 2 * s, 1.2 * s, 0, Math.PI * 2); ctx.fill(); }

  ctx.restore();
}
