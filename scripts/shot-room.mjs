// Two-player presence test: open the PRAÇA in two independent browser contexts (two devices),
// walk one of them, say a line, and screenshot both — to confirm they see each other live.
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

const A = await enter('A');
const B = await enter('B');
await wait(2500);   // let presence sync

// A walks to a spot, then says hello
await A.page.mouse.click(420, 520);
await wait(800);
await A.page.evaluate(() => {
  const inp = document.querySelector('input[placeholder="diz algo…"]');
  if (inp) { const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set; set.call(inp,'olá praça!'); inp.dispatchEvent(new Event('input',{bubbles:true})); }
});
await A.page.getByRole('button', { name: /Dizer/i }).click().catch(()=>{});
await wait(1200);
// B walks elsewhere
await B.page.mouse.click(900, 600);
await wait(1500);

await A.page.screenshot({ path: `${OUT}/room-A.png` });
await B.page.screenshot({ path: `${OUT}/room-B.png` });

// Read population text from each
const popA = await A.page.evaluate(() => document.body.innerText.match(/\d+ pessoa/)?.[0] || 'n/a');
const popB = await B.page.evaluate(() => document.body.innerText.match(/\d+ pessoa/)?.[0] || 'n/a');
console.log('A sees:', popA, '| B sees:', popB);
console.log('ERRORS:', [...A.errs, ...B.errs].slice(0, 10).join('\n') || 'none');
await browser.close();
