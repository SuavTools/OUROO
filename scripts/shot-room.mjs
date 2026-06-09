// Two-player test: confirm B sees A MOVE live (broadcast position) and sees A's message in
// the feed. Walks A to two spots, screenshotting B's view each time.
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
await wait(2500);

// A walks far left, then types a message
await A.page.mouse.click(260, 500);
await wait(1500);
await B.page.screenshot({ path: `${OUT}/move-B-1-left.png` });

await A.page.evaluate(() => {
  const inp = document.querySelector('input[placeholder="diz algo…"]');
  const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
  set.call(inp,'segue-me!'); inp.dispatchEvent(new Event('input',{bubbles:true}));
});
await A.page.getByRole('button', { name: /Dizer/i }).click().catch(()=>{});
await wait(600);

// A walks far right — B should see the avatar travel across
await A.page.mouse.click(1040, 600);
await wait(1700);
await B.page.screenshot({ path: `${OUT}/move-B-2-right.png` });

console.log('ERRORS:', [...A.errs, ...B.errs].slice(0, 8).join('\n') || 'none');
await browser.close();
