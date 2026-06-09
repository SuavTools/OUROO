import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
const OUT = '/tmp/shots'; mkdirSync(OUT, { recursive: true });
const URL = 'http://localhost:3000';
const browser = await chromium.launch();
const wait = (ms) => new Promise(r => setTimeout(r, ms));

// Portrait phone, full page
const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const p1 = await phone.newPage();
await p1.goto(URL, { waitUntil: 'domcontentloaded' }); await wait(1800);
await p1.screenshot({ path: `${OUT}/land-phone.png`, fullPage: true });
console.log('phone shot');

// Desktop, viewport
const desk = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const p2 = await desk.newPage();
await p2.goto(URL, { waitUntil: 'domcontentloaded' }); await wait(1800);
await p2.screenshot({ path: `${OUT}/land-desktop.png` });
console.log('desktop shot');

await browser.close();
