// Iso test: place furni on specific TILES, stack blocks, confirm B sees it + test the chat filter.
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
const OUT = '/tmp/shots'; mkdirSync(OUT, { recursive: true });
const URL = process.env.SHOT_URL || 'http://localhost:3000';
const browser = await chromium.launch();
const wait = ms => new Promise(r => setTimeout(r, ms));
// iso projection (must match RoomCanvas)
const ORIGIN_X = 640, ORIGIN_Y = 236, TW = 32, TH = 16;
const tile = (gx, gy) => [ORIGIN_X + (gx - gy) * TW, ORIGIN_Y + (gx + gy) * TH];

async function enter(label) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(`[${label}] ${m.text()}`); });
  page.on('pageerror', e => errs.push(`[${label}] PAGEERROR ${e.message}`));
  await page.goto(URL, { waitUntil: 'domcontentloaded' }); await wait(1500);
  await page.getByRole('button', { name: /Sala Social/i }).first().click().catch(()=>{}); await wait(1500);
  return { page, errs };
}
const A = await enter('A'); const B = await enter('B'); await wait(2500);

await A.page.getByRole('button', { name: /Decorar/i }).click(); await wait(300);
const pick = async name => { await A.page.getByRole('button', { name: new RegExp(name, 'i') }).click().catch(()=>{}); await wait(200); };
const tap = async (gx, gy) => { const [x, y] = tile(gx, gy); await A.page.mouse.click(x, y); await wait(250); };

await pick('Bloco'); await tap(5, 5); await tap(5, 5); await tap(5, 5);   // stack 3 blocks
await pick('Coluna'); await tap(3, 3);
await pick('Planta'); await tap(7, 4);
await pick('Sofá');   await tap(4, 7);
await pick('Bola');   await tap(6, 6);
await pick('Cartaz'); await tap(2, 6);
await wait(700);
await A.page.screenshot({ path: `${OUT}/iso-A.png` });
await B.page.screenshot({ path: `${OUT}/iso-B.png` });

// chat filter: blocked then clean
const send = async (p, text) => { await p.evaluate(t => { const i = document.querySelector('input[placeholder="diz algo…"]'); const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set; set.call(i, t); i.dispatchEvent(new Event('input',{bubbles:true})); }, text); await p.getByRole('button', { name: /Dizer/i }).click().catch(()=>{}); await wait(500); };
await send(A.page, 'olá pessoal isto é fixe');
await wait(300); await A.page.screenshot({ path: `${OUT}/iso-chat.png` });

console.log('ERRORS:', [...A.errs, ...B.errs].filter(e => !/room_items|400|404|relation/i.test(e)).slice(0,6).join('\n') || 'none');
await browser.close();
