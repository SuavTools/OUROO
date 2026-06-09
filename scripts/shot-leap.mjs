import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
const OUT = '/tmp/shots'; mkdirSync(OUT, { recursive: true });
const URL = process.env.SHOT_URL || 'http://localhost:3000';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
const wait = ms => new Promise(r => setTimeout(r, ms));
const shot = async n => { await page.screenshot({ path: `${OUT}/leap-${n}.png` }); console.log('shot', n); };

await page.goto(URL, { waitUntil: 'domcontentloaded' });
await wait(1800);
// Enter LEAP — the landing card is a <button> whose accessible name contains "LEAP … Saltar".
await page.getByRole('button', { name: /Novo Modo|LEAP/i }).first().click().catch(()=>{});
await wait(900); await shot('A-intro');            // LEAP intro screen
// Start the run from the intro
await page.getByRole('button', { name: /Saltar/i }).first().click().catch(()=>{});
await wait(300); await shot('B-start-platform');   // grounded on the start platform

// Climb: tap roughly on a rhythm to chain crystals
for (let i = 0; i < 5; i++) { await page.keyboard.press('Space'); await wait(360); }
await shot('C-climbing');
for (let i = 0; i < 5; i++) { await page.keyboard.press('Space'); await wait(360); }
await shot('D-more');
await wait(900); await shot('E-later');

console.log('CONSOLE ERRORS:', errs.length ? JSON.stringify(errs.slice(0,8), null, 2) : 'none');
await browser.close();
