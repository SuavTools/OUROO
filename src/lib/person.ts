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
  mouth: number;    // mouth style
  acc: number;      // accessory
  eyes: number;     // eye style
};

// ── option sets (labels drive the creator UI) ──
export const TONES = ['#f3d6bd', '#e7b48f', '#cd8d5f', '#a06a43', '#6f4a2d', '#41291a'];   // white → black
export const HAIR = ['Bald', 'Short', 'Long', 'Afro', 'Bun', 'Mohawk', 'Ponytail', 'Curly', 'Spiky'];
export const HATS = ['None', 'Cap', 'Beanie', 'Top hat', 'Crown', 'Cowboy'];
export const TOPS = ['Tee', 'Hoodie', 'Tank', 'Jacket', 'Dress', 'Suit'];
export const PANTS = ['Pants', 'Shorts', 'Skirt'];
export const SHOES = ['Sneakers', 'Boots', 'Barefoot'];
export const MOUTHS = ['Neutral', 'Smile', 'Cool', 'Grin', 'Open', 'Tongue', 'Tiny O', 'Smirk', 'Pucker', 'Grit', 'Wavy', 'Ooh', 'Wide', 'Lol'];
export const ACCS = ['None', 'Glasses', 'Shades', 'Earrings', 'Beard'];
export const EYES = ['Dot', 'Wide', 'Sleepy', 'Happy', 'Surprised', 'Angry', 'Tired', 'Stars', 'Spiral', 'Heart', 'Cross', 'Teary'];
export const HAIR_COLORS = ['#1a1410', '#3a2616', '#6b4423', '#a9712f', '#d9b25a', '#e8e2d0', '#9a9a9a', '#b03028', '#cc44aa', '#4488ff'];
export const CLOTH_COLORS = ['#ff4e3e', '#ff8800', '#ffd23a', '#1ED760', '#00cfff', '#4466dd', '#cc44ff', '#ff66aa', '#ffffff', '#1a1a24', '#9aa0b5', '#7a4e2a'];

export const defaultPerson = (): PersonSpec => ({ g: 0, tone: 1, hair: 1, hairC: '#3a2616', hat: 0, hatC: '#1a1a24', top: 0, topC: '#00cfff', pants: 0, pantsC: '#1a1a24', shoes: 0, shoeC: '#ffffff', mouth: 1, acc: 0, eyes: 0 });

const hx = (c: string) => c.replace('#', '');
export const isPersonId = (id: string) => id.startsWith('person:');
export function encodePerson(p: PersonSpec): string {
  return ['person:' + p.g, p.tone, p.hair, hx(p.hairC), p.hat, hx(p.hatC), p.top, hx(p.topC), p.pants, hx(p.pantsC), p.shoes, hx(p.shoeC), p.mouth, p.acc, p.eyes].join('~');
}
export function parsePerson(id: string): PersonSpec {
  const f = id.replace(/^person:/, '').split('~'); const n = (i: number, d = 0) => { const v = parseInt(f[i]); return Number.isFinite(v) ? v : d; }; const col = (i: number, d: string) => f[i] ? '#' + f[i] : d;
  const d = defaultPerson();
  return { g: n(0), tone: n(1, 1), hair: n(2, 1), hairC: col(3, d.hairC), hat: n(4), hatC: col(5, d.hatC), top: n(6), topC: col(7, d.topC), pants: n(8), pantsC: col(9, d.pantsC), shoes: n(10), shoeC: col(11, d.shoeC), mouth: n(12, 1), acc: n(13), eyes: n(14) };
}
export const personPrimaryColor = (p: PersonSpec): string => p.topC || '#00cfff';

const rr = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); };
const shadeC = (hex: string, f: number) => { const n = parseInt(hex.slice(1), 16); const r = Math.min(255, Math.round(((n >> 16) & 255) * f)), g = Math.min(255, Math.round(((n >> 8) & 255) * f)), b = Math.min(255, Math.round((n & 255) * f)); return `rgb(${r},${g},${b})`; };

// Draw a person centred at the current origin, fitting roughly w×h, `af` = anim frame (subtle sway).
// `armLift` 0→1 rotates arms out to the sides and overhead (jumping-jack style).
// `shoulderShrug` scales the idle arm-sway amplitude (default 1; pass higher for dramatic dance).
// `legFold` 0→1 folds legs into a cross-legged seated pose (thighs rotate out, shins fold in).
export function drawPerson(ctx: CanvasRenderingContext2D, p: PersonSpec, w: number, h: number, af: number, armLift = 0, shoulderShrug = 1, legFold = 0) {
  const s = h / 50, tone = TONES[p.tone] ?? TONES[1], sway = Math.sin(af * 0.12) * 0.6 * s * shoulderShrug;
  const broad = p.g === 1;
  const hbW = (broad ? 9 : 7.6) * s;     // torso half-width
  const dress = p.top === 4;
  const torsoTop = -7 * s, torsoBot = 9 * s, hipY = 9 * s, legBot = 21 * s;
  ctx.save(); ctx.lineJoin = 'round'; ctx.shadowBlur = 0;

  // ── legs / lower body ──
  if (dress || p.pants === 2) {   // skirt / dress flare
    const skC = dress ? p.topC : p.pantsC; ctx.fillStyle = skC;
    ctx.beginPath(); ctx.moveTo(-hbW * 0.7, hipY - 2 * s); ctx.lineTo(hbW * 0.7, hipY - 2 * s); ctx.lineTo(hbW * 1.15, legBot - 2 * s); ctx.lineTo(-hbW * 1.15, legBot - 2 * s); ctx.closePath(); ctx.fill();
    for (const side of [-1, 1]) {   // lower legs + shoes rotate from hem exit
      ctx.save(); ctx.translate(side * 2.5 * s, legBot - 4 * s); ctx.rotate(-side * armLift * Math.PI * 0.15);
      ctx.fillStyle = tone; rr(ctx, -1.7 * s, 0, 3.4 * s, 6 * s, 1.6 * s); ctx.fill();
      if (p.shoes !== 2) { const sh = (p.shoes === 1 ? 5 : 3.2) * s; ctx.fillStyle = p.shoeC; rr(ctx, -2.1 * s, 3 * s, 4.2 * s, sh, 1.6 * s); ctx.fill(); ctx.fillStyle = shadeC(p.shoeC, 0.6); rr(ctx, -2.2 * s, 3 * s + sh - 1.4 * s, 4.4 * s, 1.6 * s, 0.8 * s); ctx.fill(); }
      else { ctx.fillStyle = tone; rr(ctx, -1.8 * s, 3 * s, 3.6 * s, 3 * s, 1.4 * s); ctx.fill(); }
      ctx.restore();
    }
  } else {
    const short = p.pants === 1; const legLen = short ? 7 * s : (legBot - hipY); const fullLen = legBot - hipY;
    const halfLen = fullLen * 0.5;
    for (const side of [-1, 1]) {   // each leg pivots at hip joint
      ctx.save(); ctx.translate(side * 2.7 * s, hipY);
      if (legFold > 0) {
        // thigh rotates outward: right CCW (-), left CW (+)
        ctx.rotate(-side * legFold * Math.PI * 0.40);
        ctx.fillStyle = p.pantsC; rr(ctx, -1.9 * s, 0, 3.8 * s, halfLen, 1.8 * s); ctx.fill();
        // shin pivots at knee, rotates inward: right CW (+), left CCW (-)
        ctx.translate(0, halfLen); ctx.rotate(side * legFold * Math.PI * 0.55);
        ctx.fillStyle = short ? tone : p.pantsC; rr(ctx, -1.9 * s, 0, 3.8 * s, halfLen, 1.8 * s); ctx.fill();
        if (p.shoes !== 2) { const sh = (p.shoes === 1 ? 5 : 3.2) * s; ctx.fillStyle = p.shoeC; rr(ctx, -2.1 * s, halfLen - 1 * s, 4.2 * s, sh, 1.6 * s); ctx.fill(); ctx.fillStyle = shadeC(p.shoeC, 0.6); rr(ctx, -2.2 * s, halfLen - 1 * s + sh - 1.4 * s, 4.4 * s, 1.6 * s, 0.8 * s); ctx.fill(); }
        else { ctx.fillStyle = tone; rr(ctx, -1.8 * s, halfLen - 1 * s, 3.6 * s, 3 * s, 1.4 * s); ctx.fill(); }
      } else {
        ctx.rotate(-side * armLift * Math.PI * 0.15);
        ctx.fillStyle = p.pantsC; rr(ctx, -1.9 * s, 0, 3.8 * s, legLen, 1.8 * s); ctx.fill();
        if (short) { ctx.fillStyle = tone; rr(ctx, -1.6 * s, legLen, 3.2 * s, fullLen - legLen, 1.4 * s); ctx.fill(); }
        if (p.shoes !== 2) { const sh = (p.shoes === 1 ? 5 : 3.2) * s; ctx.fillStyle = p.shoeC; rr(ctx, -2.1 * s, fullLen - 1 * s, 4.2 * s, sh, 1.6 * s); ctx.fill(); ctx.fillStyle = shadeC(p.shoeC, 0.6); rr(ctx, -2.2 * s, fullLen - 1 * s + sh - 1.4 * s, 4.4 * s, 1.6 * s, 0.8 * s); ctx.fill(); }
        else { ctx.fillStyle = tone; rr(ctx, -1.8 * s, fullLen - 1 * s, 3.6 * s, 3 * s, 1.4 * s); ctx.fill(); }
      }
      ctx.restore();
    }
  }

  // ── arms (behind torso) ──
  const longSleeve = p.top === 1 || p.top === 3;   // hoodie / jacket
  for (const side of [-1, 1]) {
    const ax = side * (hbW + 1.4 * s);
    if (armLift > 0) {
      // Rotate the arm around the shoulder joint: negative side-factor because rotating away from body
      // means CCW for right arm, CW for left arm (canvas +rotation = clockwise on screen).
      ctx.save();
      ctx.translate(ax, torsoTop + 1 * s);
      ctx.rotate(-side * armLift * Math.PI * 0.85);
      ctx.fillStyle = longSleeve ? p.topC : tone; rr(ctx, -1.8 * s, 0, 3.6 * s, 11 * s, 1.8 * s); ctx.fill();
      ctx.fillStyle = tone; ctx.beginPath(); ctx.arc(0, 12 * s, 2 * s, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    } else {
      const aSwing = side * sway;
      ctx.fillStyle = longSleeve ? p.topC : tone; rr(ctx, ax - 1.8 * s, torsoTop + 1 * s + aSwing, 3.6 * s, 11 * s, 1.8 * s); ctx.fill();
      ctx.fillStyle = tone; ctx.beginPath(); ctx.arc(ax, torsoTop + 13 * s + aSwing, 2 * s, 0, Math.PI * 2); ctx.fill();   // hand
    }
  }

  // ── torso / top ──
  const topD = shadeC(p.topC, 0.76), topL = shadeC(p.topC, 1.12);
  ctx.fillStyle = p.topC;
  if (dress) { ctx.beginPath(); ctx.moveTo(-hbW, torsoTop); ctx.lineTo(hbW, torsoTop); ctx.lineTo(hbW * 0.9, hipY); ctx.lineTo(-hbW * 0.9, hipY); ctx.closePath(); ctx.fill(); }
  else { rr(ctx, -hbW, torsoTop, hbW * 2, torsoBot - torsoTop + 3 * s, 3 * s); ctx.fill(); }
  ctx.save(); ctx.beginPath(); rr(ctx, -hbW, torsoTop, hbW * 2, torsoBot - torsoTop + 3 * s, 3 * s); ctx.clip(); ctx.globalAlpha = 0.5; ctx.fillStyle = topD; rr(ctx, hbW * 0.35, torsoTop, hbW * 0.7, torsoBot - torsoTop + 3 * s, 0); ctx.fill(); ctx.restore();   // side shade for depth
  ctx.strokeStyle = topD; ctx.lineWidth = 0.8 * s; if (!dress) { rr(ctx, -hbW, torsoTop, hbW * 2, torsoBot - torsoTop + 3 * s, 3 * s); ctx.stroke(); }   // outline
  ctx.fillStyle = shadeC(tone, 0.95); rr(ctx, -2.4 * s, torsoTop - 0.5 * s, 4.8 * s, 1.6 * s, 0.8 * s); ctx.fill();   // collar gap of neck/skin
  if (p.top === 2) { ctx.fillStyle = tone; rr(ctx, -hbW * 0.5, torsoTop - 1 * s, hbW, 5 * s, 2 * s); ctx.fill(); ctx.fillStyle = p.topC; for (const sx of [-hbW * 0.7, hbW * 0.3]) { rr(ctx, sx, torsoTop - 1 * s, hbW * 0.4, 6 * s, 1.5 * s); ctx.fill(); } }   // tank straps
  else if (p.top === 1) { ctx.fillStyle = topD; rr(ctx, -3.6 * s, torsoTop - 2.5 * s, 7.2 * s, 4 * s, 2 * s); ctx.fill(); ctx.strokeStyle = topD; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, torsoTop + 1 * s); ctx.lineTo(0, torsoBot); ctx.stroke(); ctx.lineWidth = 1.4 * s; ctx.beginPath(); ctx.arc(0, torsoBot - 1 * s, hbW * 0.5, 0.15, Math.PI - 0.15); ctx.stroke(); }   // hoodie: hood, zip, kangaroo pocket
  else if (p.top === 3) { ctx.fillStyle = topD; ctx.beginPath(); ctx.moveTo(0, torsoTop); ctx.lineTo(-hbW * 0.45, torsoTop); ctx.lineTo(-1.5 * s, torsoTop + 6 * s); ctx.closePath(); ctx.fill(); ctx.beginPath(); ctx.moveTo(0, torsoTop); ctx.lineTo(hbW * 0.45, torsoTop); ctx.lineTo(1.5 * s, torsoTop + 6 * s); ctx.closePath(); ctx.fill(); ctx.strokeStyle = topD; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, torsoTop + 5 * s); ctx.lineTo(0, torsoBot + 2 * s); ctx.stroke(); }   // jacket lapels + zip
  else if (p.top === 5) { ctx.fillStyle = topL; rr(ctx, -2.6 * s, torsoTop, 5.2 * s, torsoBot - torsoTop, 1 * s); ctx.fill(); ctx.fillStyle = topD; ctx.beginPath(); ctx.moveTo(0, torsoTop); ctx.lineTo(-hbW * 0.5, torsoTop); ctx.lineTo(-1.6 * s, torsoTop + 7 * s); ctx.closePath(); ctx.fill(); ctx.beginPath(); ctx.moveTo(0, torsoTop); ctx.lineTo(hbW * 0.5, torsoTop); ctx.lineTo(1.6 * s, torsoTop + 7 * s); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#c02530'; ctx.beginPath(); ctx.moveTo(-1.2 * s, torsoTop + 1 * s); ctx.lineTo(1.2 * s, torsoTop + 1 * s); ctx.lineTo(0.7 * s, torsoBot - 1 * s); ctx.lineTo(-0.7 * s, torsoBot - 1 * s); ctx.closePath(); ctx.fill(); }   // suit: shirt + lapels + tie

  // ── neck (world-space) + 2× head ──
  // headCenter = -22.2s so neck top (headCenter + 14.4s - 1s = -8.8s) matches the original position.
  const headCenterY = -22.2 * s;
  ctx.fillStyle = tone; rr(ctx, -2.2 * s, headCenterY + 14.4 * s - 1 * s, 4.4 * s, 5 * s, 1.6 * s); ctx.fill();   // neck
  ctx.save(); ctx.translate(0, headCenterY); ctx.scale(2, 2);   // 2× head scale — all head features below scale proportionally
  const headY = 0, headR = 7.2 * s;
  ctx.fillStyle = shadeC(tone, 0.9); ctx.beginPath(); ctx.arc(-headR + 0.4 * s, headY + 1 * s, 1.5 * s, 0, Math.PI * 2); ctx.arc(headR - 0.4 * s, headY + 1 * s, 1.5 * s, 0, Math.PI * 2); ctx.fill();   // ears
  ctx.fillStyle = tone; ctx.beginPath(); ctx.ellipse(0, headY + 0.4 * s, headR, headR * 1.04, 0, 0, Math.PI * 2); ctx.fill();   // head (slightly oval)
  ctx.strokeStyle = shadeC(tone, 0.78); ctx.lineWidth = 0.8 * s; ctx.beginPath(); ctx.ellipse(0, headY + 0.4 * s, headR, headR * 1.04, 0, 0, Math.PI * 2); ctx.stroke();   // soft outline
  if (p.acc === 4) { ctx.fillStyle = shadeC(p.hairC, 0.7); ctx.beginPath(); ctx.arc(0, headY + headR * 0.55, headR * 0.95, 0.15, Math.PI - 0.15); ctx.fill(); }   // beard

  // ── face ──
  const eyeY = headY + 0.4 * s, eyeX = 2.6 * s;
  if (p.acc !== 2) {
    const eyeE = p.eyes ?? 0;
    for (const sx of [-eyeX, eyeX]) {
      ctx.fillStyle = '#1c1c22';
      switch (eyeE) {
        default:
        case 0: // Dot
          ctx.beginPath(); ctx.arc(sx, eyeY, 1.1 * s, 0, Math.PI * 2); ctx.fill();
          break;
        case 1: { // Wide — large oval sclera + pupil + glint
          ctx.fillStyle = '#fff';
          ctx.beginPath(); ctx.ellipse(sx, eyeY, 2.1 * s, 2.5 * s, 0, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = '#1c1c22'; ctx.lineWidth = 0.5 * s; ctx.stroke();
          ctx.fillStyle = '#1c1c22';
          ctx.beginPath(); ctx.arc(sx, eyeY + 0.3 * s, 1.3 * s, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#fff';
          ctx.beginPath(); ctx.arc(sx + 0.5 * s, eyeY - 0.7 * s, 0.5 * s, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#1c1c22';
          break;
        }
        case 2: { // Sleepy — half-lidded
          ctx.fillStyle = '#fff';
          ctx.beginPath(); ctx.ellipse(sx, eyeY + 0.4 * s, 1.7 * s, 1.3 * s, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#1c1c22';
          ctx.beginPath(); ctx.arc(sx, eyeY + 0.5 * s, 0.85 * s, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = tone;
          ctx.fillRect(sx - 2.1 * s, eyeY - 1.1 * s, 4.2 * s, 1.6 * s);
          ctx.strokeStyle = '#1c1c22'; ctx.lineWidth = 0.65 * s;
          ctx.beginPath(); ctx.moveTo(sx - 2.1 * s, eyeY + 0.35 * s); ctx.lineTo(sx + 2.1 * s, eyeY + 0.35 * s); ctx.stroke();
          ctx.fillStyle = '#1c1c22';
          break;
        }
        case 3: // Happy — upward arcs (∩ shape)
          ctx.strokeStyle = '#1c1c22'; ctx.lineWidth = 1.3 * s;
          ctx.beginPath(); ctx.arc(sx, eyeY + 0.6 * s, 1.5 * s, Math.PI + 0.25, Math.PI * 2 - 0.25); ctx.stroke();
          ctx.fillStyle = '#1c1c22';
          break;
        case 4: { // Surprised — large circles
          ctx.fillStyle = '#fff';
          ctx.beginPath(); ctx.arc(sx, eyeY, 2.0 * s, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = '#1c1c22'; ctx.lineWidth = 0.6 * s; ctx.stroke();
          ctx.fillStyle = '#1c1c22';
          ctx.beginPath(); ctx.arc(sx, eyeY, 1.1 * s, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#fff';
          ctx.beginPath(); ctx.arc(sx + 0.5 * s, eyeY - 0.5 * s, 0.4 * s, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#1c1c22';
          break;
        }
        case 5: { // Angry — angled top lid (V-shape brows)
          ctx.fillStyle = '#fff';
          ctx.beginPath(); ctx.ellipse(sx, eyeY, 1.7 * s, 1.2 * s, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#1c1c22';
          ctx.beginPath(); ctx.arc(sx, eyeY, 0.85 * s, 0, Math.PI * 2); ctx.fill();
          // outer corner high, inner corner low (brow angled toward nose)
          const outerLidY = eyeY - 1.2 * s;
          const innerLidY = eyeY - 0.1 * s;
          const leftLidY = sx < 0 ? outerLidY : innerLidY;
          const rightLidY = sx < 0 ? innerLidY : outerLidY;
          ctx.fillStyle = tone;
          ctx.beginPath();
          ctx.moveTo(sx - 2.2 * s, leftLidY); ctx.lineTo(sx + 2.2 * s, rightLidY);
          ctx.lineTo(sx + 2.2 * s, eyeY - 2.5 * s); ctx.lineTo(sx - 2.2 * s, eyeY - 2.5 * s);
          ctx.closePath(); ctx.fill();
          ctx.strokeStyle = '#1c1c22'; ctx.lineWidth = 0.75 * s;
          ctx.beginPath(); ctx.moveTo(sx - 2.2 * s, leftLidY); ctx.lineTo(sx + 2.2 * s, rightLidY); ctx.stroke();
          ctx.fillStyle = '#1c1c22';
          break;
        }
        case 6: { // Tired — droopy with bags under eyes
          ctx.fillStyle = '#fff';
          ctx.beginPath(); ctx.ellipse(sx, eyeY, 1.6 * s, 1.3 * s, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#1c1c22';
          ctx.beginPath(); ctx.arc(sx, eyeY, 0.85 * s, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = shadeC(tone, 0.72); ctx.lineWidth = 0.55 * s;
          ctx.beginPath(); ctx.arc(sx, eyeY + 0.8 * s, 1.4 * s, 0.15, Math.PI - 0.15); ctx.stroke();
          ctx.fillStyle = '#1c1c22';
          break;
        }
        case 7: { // Stars — 6-pointed golden stars
          ctx.fillStyle = '#ffd23a';
          const sr = 2.2 * s;
          ctx.beginPath();
          for (let i = 0; i < 12; i++) {
            const a = (i * Math.PI) / 6 - Math.PI / 2;
            const rad = i % 2 === 0 ? sr : sr * 0.42;
            i === 0 ? ctx.moveTo(sx + Math.cos(a) * rad, eyeY + Math.sin(a) * rad)
                    : ctx.lineTo(sx + Math.cos(a) * rad, eyeY + Math.sin(a) * rad);
          }
          ctx.closePath(); ctx.fill();
          ctx.strokeStyle = '#c89020'; ctx.lineWidth = 0.4 * s; ctx.stroke();
          ctx.fillStyle = '#1c1c22';
          break;
        }
        case 8: { // Spiral — hypnotic
          ctx.strokeStyle = '#1c1c22'; ctx.lineWidth = 0.55 * s;
          ctx.beginPath();
          for (let t = 0.05; t <= Math.PI * 3.5; t += 0.08) {
            const r = (t / (Math.PI * 3.5)) * 2.1 * s;
            const px = sx + Math.cos(t) * r, py = eyeY + Math.sin(t) * r;
            t <= 0.1 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
          }
          ctx.stroke();
          ctx.fillStyle = '#1c1c22';
          break;
        }
        case 9: { // Heart
          ctx.fillStyle = '#ff4e3e';
          const hs = 1.5 * s;
          ctx.beginPath();
          ctx.moveTo(sx, eyeY + hs * 0.8);
          ctx.bezierCurveTo(sx - hs * 1.6, eyeY + hs * 0.1, sx - hs * 1.6, eyeY - hs * 1.1, sx, eyeY - hs * 0.3);
          ctx.bezierCurveTo(sx + hs * 1.6, eyeY - hs * 1.1, sx + hs * 1.6, eyeY + hs * 0.1, sx, eyeY + hs * 0.8);
          ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#1c1c22';
          break;
        }
        case 10: { // Cross/X — dizzy
          const prevLineCap = ctx.lineCap;
          ctx.lineCap = 'round';
          ctx.strokeStyle = '#1c1c22'; ctx.lineWidth = 1.3 * s;
          const cr = 1.4 * s;
          ctx.beginPath();
          ctx.moveTo(sx - cr, eyeY - cr); ctx.lineTo(sx + cr, eyeY + cr);
          ctx.moveTo(sx + cr, eyeY - cr); ctx.lineTo(sx - cr, eyeY + cr);
          ctx.stroke();
          ctx.lineCap = prevLineCap;
          ctx.fillStyle = '#1c1c22';
          break;
        }
        case 11: { // Teary — dot with teardrop
          ctx.fillStyle = '#1c1c22';
          ctx.beginPath(); ctx.arc(sx, eyeY, 1.1 * s, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#7ad4ff';
          ctx.beginPath();
          ctx.moveTo(sx - 0.7 * s, eyeY + 1.6 * s);
          ctx.lineTo(sx, eyeY + 0.7 * s);
          ctx.lineTo(sx + 0.7 * s, eyeY + 1.6 * s);
          ctx.arc(sx, eyeY + 1.6 * s, 0.7 * s, 0, Math.PI);
          ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#1c1c22';
          break;
        }
      }
    }
  }
  { // ── mouth ──
    const mo = p.mouth ?? 0, my = headY + 4.2 * s;
    ctx.strokeStyle = '#7a4a3a'; ctx.lineWidth = 1.2 * s;
    switch (mo) {
      case 1: // Smile
        ctx.beginPath(); ctx.arc(0, headY + 3.5 * s, 2.4 * s, 0.2, Math.PI - 0.2); ctx.stroke(); break;
      case 2: // Cool
        ctx.beginPath(); ctx.moveTo(-2.4 * s, my); ctx.lineTo(2.4 * s, my); ctx.stroke(); break;
      case 3: { // Grin — wide smile showing upper teeth
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(-3 * s, my - 0.6 * s); ctx.quadraticCurveTo(0, my + 1.4 * s, 3 * s, my - 0.6 * s); ctx.lineTo(3 * s, my + 1.4 * s); ctx.lineTo(-3 * s, my + 1.4 * s); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#d0c8c0'; ctx.lineWidth = 0.3 * s; for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(i * 1.2 * s, my - 0.3 * s); ctx.lineTo(i * 1.2 * s, my + 1.4 * s); ctx.stroke(); }
        ctx.strokeStyle = '#7a4a3a'; ctx.lineWidth = 1.2 * s; ctx.beginPath(); ctx.moveTo(-3 * s, my - 0.6 * s); ctx.quadraticCurveTo(0, my + 1.4 * s, 3 * s, my - 0.6 * s); ctx.moveTo(-3 * s, my + 1.4 * s); ctx.lineTo(3 * s, my + 1.4 * s); ctx.stroke(); break;
      }
      case 4: { // Open — oval open mouth
        ctx.fillStyle = '#3a1510'; ctx.beginPath(); ctx.ellipse(0, my, 2 * s, 1.6 * s, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); break;
      }
      case 5: { // Tongue — wide open + tongue hanging down
        ctx.fillStyle = '#3a1510'; ctx.beginPath(); ctx.arc(0, my - 1 * s, 2.6 * s, 0, Math.PI); ctx.fill();
        ctx.strokeStyle = '#7a4a3a'; ctx.lineWidth = 1.2 * s; ctx.beginPath(); ctx.arc(0, my - 1 * s, 2.6 * s, 0, Math.PI); ctx.stroke();
        ctx.fillStyle = '#e87878'; ctx.beginPath(); ctx.ellipse(0, my + 2.5 * s, 1.3 * s, 2 * s, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#c04040'; ctx.lineWidth = 0.7 * s; ctx.stroke(); break;
      }
      case 6: { // Tiny O — small surprised circle
        ctx.fillStyle = '#3a1510'; ctx.beginPath(); ctx.arc(0, my, 0.9 * s, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); break;
      }
      case 7: { // Smirk — one corner curled up
        ctx.beginPath(); ctx.moveTo(-1.5 * s, my + 0.3 * s); ctx.quadraticCurveTo(0.5 * s, my + 0.5 * s, 2 * s, my - 1 * s); ctx.stroke(); break;
      }
      case 8: { // Pucker — small pursed oval lips
        ctx.fillStyle = '#d46060'; ctx.beginPath(); ctx.ellipse(0, my, 1.5 * s, 1 * s, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#a03030'; ctx.lineWidth = 0.9 * s; ctx.stroke();
        ctx.strokeStyle = '#7a4a3a'; ctx.lineWidth = 0.5 * s; ctx.beginPath(); ctx.moveTo(-1.5 * s, my); ctx.lineTo(1.5 * s, my); ctx.stroke(); break;
      }
      case 9: { // Grit — flat bar of gritted teeth
        ctx.fillStyle = '#fff'; rr(ctx, -2.4 * s, my - 0.9 * s, 4.8 * s, 1.8 * s, 0.4 * s); ctx.fill();
        ctx.strokeStyle = '#d0c8c0'; ctx.lineWidth = 0.3 * s; for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(i * 1.2 * s, my - 0.9 * s); ctx.lineTo(i * 1.2 * s, my + 0.9 * s); ctx.stroke(); }
        ctx.strokeStyle = '#7a4a3a'; ctx.lineWidth = 1.2 * s; rr(ctx, -2.4 * s, my - 0.9 * s, 4.8 * s, 1.8 * s, 0.4 * s); ctx.stroke(); break;
      }
      case 10: { // Wavy — squiggly line
        ctx.beginPath(); ctx.moveTo(-2.4 * s, my); ctx.bezierCurveTo(-1.6 * s, my - 1.1 * s, -0.8 * s, my + 1.1 * s, 0, my); ctx.bezierCurveTo(0.8 * s, my - 1.1 * s, 1.6 * s, my + 1.1 * s, 2.4 * s, my); ctx.stroke(); break;
      }
      case 11: { // Ooh — big open circle
        ctx.fillStyle = '#3a1510'; ctx.beginPath(); ctx.arc(0, my, 2.4 * s, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); break;
      }
      case 12: { // Wide — open with top + bottom teeth rows
        const wW = 2.8 * s, th = 1.1 * s, wy = my - 1.5 * s;
        ctx.fillStyle = '#fff'; rr(ctx, -wW, wy, wW * 2, th, 0.4 * s); ctx.fill(); rr(ctx, -wW, wy + th + 1 * s, wW * 2, th, 0.4 * s); ctx.fill();
        ctx.fillStyle = '#3a1510'; ctx.fillRect(-wW, wy + th, wW * 2, 1 * s);
        ctx.strokeStyle = '#d0c8c0'; ctx.lineWidth = 0.3 * s;
        for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(i * 1.4 * s, wy); ctx.lineTo(i * 1.4 * s, wy + th); ctx.stroke(); ctx.beginPath(); ctx.moveTo(i * 1.4 * s, wy + th + 1 * s); ctx.lineTo(i * 1.4 * s, wy + th + 1 * s + th); ctx.stroke(); }
        ctx.strokeStyle = '#7a4a3a'; ctx.lineWidth = 1.2 * s; rr(ctx, -wW, wy, wW * 2, th * 2 + 1 * s, 0.4 * s); ctx.stroke(); break;
      }
      case 13: { // Lol — tongue lolling out to the side
        ctx.fillStyle = '#e87878'; ctx.beginPath(); ctx.ellipse(2 * s, my + 0.5 * s, 1.8 * s, 1.2 * s, -0.5, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#c04040'; ctx.lineWidth = 0.7 * s; ctx.stroke();
        ctx.strokeStyle = '#7a4a3a'; ctx.lineWidth = 1.2 * s; ctx.beginPath(); ctx.moveTo(-1.8 * s, my); ctx.lineTo(1.8 * s, my); ctx.stroke(); break;
      }
      default: // 0: Neutral
        ctx.beginPath(); ctx.moveTo(-1.8 * s, my); ctx.lineTo(1.8 * s, my); ctx.stroke(); break;
    }
  }

  // ── hair (drawn around/over the head per style) ──
  ctx.fillStyle = p.hairC; const hc = p.hairC;
  if (p.hair === 1) { ctx.beginPath(); ctx.arc(0, headY, headR + 0.8 * s, Math.PI * 1.05, Math.PI * 1.95); ctx.lineTo(headR * 0.8, headY - 1 * s); ctx.lineTo(-headR * 0.8, headY - 1 * s); ctx.closePath(); ctx.fill(); }   // short cap
  else if (p.hair === 2) { ctx.beginPath(); ctx.arc(0, headY, headR + 1 * s, Math.PI, Math.PI * 2); ctx.fill(); rr(ctx, -headR - 1 * s, headY, 2.4 * s, 10 * s, 1.2 * s); ctx.fill(); rr(ctx, headR - 1.4 * s, headY, 2.4 * s, 10 * s, 1.2 * s); ctx.fill(); }   // long
  else if (p.hair === 3) { ctx.save(); ctx.beginPath(); ctx.arc(0, headY - 1 * s, headR + 2.4 * s, 0, Math.PI * 2, false); ctx.ellipse(0, headY + 0.4 * s, headR, headR * 1.04, 0, 0, Math.PI * 2, true); ctx.clip(); ctx.beginPath(); ctx.arc(0, headY - 1 * s, headR + 2.4 * s, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }   // afro — clipped donut so face features show through
  else if (p.hair === 4) { ctx.beginPath(); ctx.arc(0, headY, headR + 0.8 * s, Math.PI, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(0, headY - headR - 1.5 * s, 2.6 * s, 0, Math.PI * 2); ctx.fill(); }   // bun
  else if (p.hair === 5) { rr(ctx, -1.4 * s, headY - headR - 3 * s, 2.8 * s, headR + 3 * s, 1 * s); ctx.fill(); }   // mohawk
  else if (p.hair === 6) { ctx.beginPath(); ctx.arc(0, headY, headR + 0.8 * s, Math.PI, Math.PI * 2); ctx.fill(); rr(ctx, headR - 1 * s, headY - 1 * s, 2.6 * s, 12 * s, 1.3 * s); ctx.fill(); }   // ponytail
  else if (p.hair === 7) { for (let i = 0; i < 7; i++) { const a = Math.PI + (i / 6) * Math.PI; ctx.beginPath(); ctx.arc(Math.cos(a) * (headR - 0.5 * s), headY + Math.sin(a) * (headR - 0.5 * s), 2.3 * s, 0, Math.PI * 2); ctx.fill(); } }   // curly
  else if (p.hair === 8) { for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(i * 1.9 * s - 1.4 * s, headY - headR + 1 * s); ctx.lineTo(i * 1.9 * s, headY - headR - 3.5 * s); ctx.lineTo(i * 1.9 * s + 1.4 * s, headY - headR + 1 * s); ctx.closePath(); ctx.fill(); } ctx.beginPath(); ctx.arc(0, headY, headR + 0.6 * s, Math.PI, Math.PI * 2); ctx.fill(); }   // spiky
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

  ctx.restore();   // end 2× head scale
  ctx.restore();
}
