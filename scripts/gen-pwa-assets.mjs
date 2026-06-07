import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = process.cwd();
const PUB = join(ROOT, 'public');
const BG = '#000000';
const YELLOW = '#ffe65c';
const RED = '#ff4e3e';

// ---- The mark: a faceted crystal (the arcade's core collectible) ----
// Rendered on transparent so it can be composited at any size.
const markSVG = (s) => `
<svg width="${s}" height="${s}" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="glow" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="14" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <g filter="url(#glow)">
    <polygon points="256,72 440,256 256,440 72,256" fill="${YELLOW}"/>
    <polygon points="256,72 440,256 256,440 72,256" fill="none" stroke="${RED}" stroke-width="16" stroke-linejoin="round"/>
    <polygon points="256,150 362,256 256,362 150,256" fill="#fff4b0"/>
    <line x1="256" y1="72" x2="256" y2="440" stroke="${RED}" stroke-width="6" opacity="0.55"/>
    <line x1="72" y1="256" x2="440" y2="256" stroke="${RED}" stroke-width="6" opacity="0.55"/>
  </g>
</svg>`;

// ---- App icon (full-bleed black bg + centered mark) ----
async function icon(size, file, markScale = 0.78) {
  const m = Math.round(size * markScale);
  const mark = await sharp(Buffer.from(markSVG(m))).png().toBuffer();
  const bg = sharp({ create: { width: size, height: size, channels: 4, background: BG } });
  const out = await bg.composite([{ input: mark, gravity: 'center' }]).png().toBuffer();
  await writeFile(join(PUB, file), out);
  console.log('icon', file, size);
}

// ---- Splash: centered wordmark on black, sized per device ----
const splashLogoSVG = (w) => `
<svg width="${w}" height="${Math.round(w * 0.9)}" viewBox="0 0 800 720" xmlns="http://www.w3.org/2000/svg">
  <g transform="translate(400 210)">
    <polygon points="0,-130 130,0 0,130 -130,0" fill="${YELLOW}"/>
    <polygon points="0,-130 130,0 0,130 -130,0" fill="none" stroke="${RED}" stroke-width="12" stroke-linejoin="round"/>
    <polygon points="0,-66 66,0 0,66 -66,0" fill="#fff4b0"/>
  </g>
  <text x="400" y="470" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-weight="900" font-size="140" letter-spacing="6" fill="${YELLOW}">OUROO</text>
  <text x="400" y="545" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="40" letter-spacing="18" fill="${RED}">ARCADE CORE</text>
</svg>`;

async function splash(w, h, file) {
  const logoW = Math.round(Math.min(w, h) * 0.7);
  const logo = await sharp(Buffer.from(splashLogoSVG(logoW))).png().toBuffer();
  const bg = sharp({ create: { width: w, height: h, channels: 4, background: BG } });
  const out = await bg.composite([{ input: logo, gravity: 'center' }]).png().toBuffer();
  await writeFile(join(PUB, 'splash', file), out);
  console.log('splash', file, `${w}x${h}`);
}

await mkdir(join(PUB, 'splash'), { recursive: true });

// Icons
await icon(192, 'icon-192.png');
await icon(512, 'icon-512.png');
await icon(512, 'icon-maskable-512.png', 0.62); // extra padding for maskable safe zone
await icon(180, 'apple-icon.png', 0.84);

// iOS startup images — portrait device pixel sizes for common iPhones
const devices = [
  [1290, 2796], [1284, 2778], [1179, 2556], [1170, 2532],
  [1242, 2688], [1125, 2436], [828, 1792], [750, 1334],
];
for (const [w, h] of devices) await splash(w, h, `splash-${w}x${h}.png`);

console.log('done');
