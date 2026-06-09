import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
const OUT = '/tmp/shots'; mkdirSync(OUT, { recursive: true });
const URL = process.env.SHOT_URL || 'http://localhost:3000';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
const wait = ms => new Promise(r => setTimeout(r, ms));
const shot = async n => { await page.screenshot({ path: `${OUT}/leap-${n}.png` }); console.log('shot', n); };

await page.goto(URL, { waitUntil: 'domcontentloaded' });
await wait(2000); await shot('1-landing');

// Click the LEAP card (the "Saltar" entry button on the landing page)
await page.getByRole('button', { name: /^▶ Saltar$/i }).click().catch(async () => {
  await page.getByText('LEAP', { exact: false }).first().click().catch(()=>{});
});
await wait(1200); await shot('2-leap-intro');

// Start the game from the intro
await page.getByRole('button', { name: /Saltar/i }).last().click().catch(()=>{});
await wait(400); await shot('3-leap-start');

// Play a little: jump a few times
for (let i = 0; i < 6; i++) { await page.keyboard.press('Space'); await wait(450); }
await shot('4-leap-play');
await wait(1500); await shot('5-leap-later');

console.log('CONSOLE ERRORS:', errs.length ? JSON.stringify(errs.slice(0,10), null, 2) : 'none');
await browser.close();
