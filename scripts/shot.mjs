import { chromium } from 'playwright';

const URL = process.env.SHOT_URL || 'http://localhost:3000';
const OUT = process.env.SHOT_OUT || '/tmp/shots';
const TAG = process.env.SHOT_TAG || 'cur';
import { mkdirSync } from 'fs';
mkdirSync(OUT, { recursive: true });

// Landscape phone (iPhone-ish) — the orientation the game is meant to be played in.
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 844, height: 390 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
// Real phones report maxTouchPoints>0, which is what page.tsx uses to switch on the
// fit-to-screen mobile scaling. Playwright doesn't set it, so force it to match a real device.
await ctx.addInitScript(() => {
  Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 5 });
});
const page = await ctx.newPage();
const shot = async (name) => { await page.screenshot({ path: `${OUT}/${TAG}-${name}.png` }); console.log('shot', name); };
const wait = (ms) => new Promise(r => setTimeout(r, ms));

await page.goto(URL, { waitUntil: 'domcontentloaded' });
await wait(1500); await shot('1-landing');

// Enter the arcade (nav "Jogar" button)
await page.getByRole('button', { name: /Jogar/i }).click().catch(() => {});
await wait(900); await shot('3-arcade-intro');

// Pick TELEMÓVEL controls + start
await page.getByText('TELEMÓVEL', { exact: false }).first().click().catch(() => {});
await wait(200);
await page.getByText('INICIAR NÚCLEO', { exact: false }).click().catch(() => {});
await wait(1200); await shot('4-gameplay');

await browser.close();
console.log('done');
