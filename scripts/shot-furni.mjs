// Furni test: A places several items; B (same room) should see them appear live. Then A removes
// one and B sees it go. (Persistence needs the room_items migration; this checks broadcast+render.)
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
const OUT = '/tmp/shots'; mkdirSync(OUT, { recursive: true });
const URL = process.env.SHOT_URL || 'http://localhost:3000';
const browser = await chromium.launch();
const wait = ms => new Promise(r => setTimeout(r, ms));

async function enter(label) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(`[${label}] ${m.text()}`); });
  page.on('pageerror', e => errs.push(`[${label}] PAGEERROR ${e.message}`));
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await wait(1500);
  await page.getByRole('button', { name: /Sala Social/i }).first().click().catch(()=>{});
  await wait(1500);
  return { page, errs };
}
const A = await enter('A');
const B = await enter('B');
await wait(2500);

await A.page.getByRole('button', { name: /Decorar/i }).click();
await wait(300);
const place = async (name, x, y) => {
  await A.page.getByRole('button', { name: new RegExp(name, 'i') }).click().catch(()=>{});
  await wait(200);
  await A.page.mouse.click(x, y);
  await wait(400);
};
await place('Bola Disco', 640, 470);
await place('Planta', 470, 520);
await place('Sofá', 820, 540);
await place('Coluna', 360, 560);
await place('Cartaz', 940, 470);
await wait(700);
await B.page.screenshot({ path: `${OUT}/furni-B-placed.png` });   // B should see all 5 items
await A.page.screenshot({ path: `${OUT}/furni-A-placed.png` });

// remove the plant
await A.page.getByRole('button', { name: /Remover/i }).click();
await wait(200);
await A.page.mouse.click(470, 520);
await wait(700);
await B.page.screenshot({ path: `${OUT}/furni-B-removed.png` });  // plant gone for B too

console.log('ERRORS:', [...A.errs, ...B.errs].filter(e => !/room_items|400|404|relation/i.test(e)).slice(0, 8).join('\n') || 'none');
await browser.close();
