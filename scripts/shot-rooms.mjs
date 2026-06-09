// Multi-room test: A and B meet in Praça; A hops to Discoteca (leaves B behind); then B
// follows and they meet again. Screenshots show per-room colour + correct population.
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
  return { ctx, page, errs };
}
const hop = async (p, roomName) => {
  await p.getByRole('button', { name: /Salas/i }).click().catch(()=>{});
  await wait(300);
  await p.getByRole('button', { name: new RegExp(roomName, 'i') }).click().catch(()=>{});
  await wait(1500);
};

const A = await enter('A');
const B = await enter('B');
await wait(2500);
await A.page.screenshot({ path: `${OUT}/rooms-A-praca.png` });   // both in Praça → 2 pessoas, cyan

await hop(A.page, 'Discoteca');
await A.page.screenshot({ path: `${OUT}/rooms-A-disco.png` });   // A alone in Discoteca → pink
await B.page.screenshot({ path: `${OUT}/rooms-B-praca-alone.png` }); // B alone in Praça now

await hop(B.page, 'Discoteca');
await wait(800);
await B.page.screenshot({ path: `${OUT}/rooms-B-disco.png` });   // both in Discoteca → 2 pessoas

console.log('ERRORS:', [...A.errs, ...B.errs].slice(0, 8).join('\n') || 'none');
await browser.close();
