// Drives the autopilot and screenshots the world at each new level, to eyeball the colour
// progression (relaxing cyan → shifting hues → rainbow).
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
const OUT = '/tmp/shots'; mkdirSync(OUT, { recursive: true });
const URL = process.env.SHOT_URL || 'http://localhost:3000';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
const wait = ms => new Promise(r => setTimeout(r, ms));

await page.goto(URL, { waitUntil: 'domcontentloaded' });
await wait(1600);
await page.getByRole('button', { name: /Novo Modo|LEAP/i }).first().click().catch(()=>{});
await wait(900);
await page.getByRole('button', { name: /Saltar/i }).first().click().catch(()=>{});
await wait(300);

// Start a detached autopilot loop that also force-advances the level for screenshot purposes
// (we want to SEE high-level colours even if the bot would die first).
await page.evaluate(() => {
  const hook = window.__leap; const { PW, PH, PLAYER_X } = hook;
  const G = 0.76, TERM = 20; const px = PLAYER_X + PW / 2;
  window.__lvlForce = 0;
  const tick = () => {
    const st = hook.state(); const p = st.player; const pcy = p.y + PH / 2;
    if (window.__lvlForce && st.level < window.__lvlForce) st.level = window.__lvlForce; // for theme preview
    let tcx = Infinity, tcy = 0;
    for (const c of st.crystals) { if (c.collected) continue; const cx = c.x + c.size/2; if (cx > px-12 && cx < tcx) { tcx = cx; tcy = c.y + c.size/2; } }
    if (tcx !== Infinity) {
      const ws = st.worldSpeed; const f = Math.max(1,(tcx-px)/ws);
      const predictY = v0 => pcy + Math.min(v0,TERM)*f + 0.5*G*f*f;
      const distNo = Math.abs(predictY(p.vy)-tcy);
      const imp = (p.grounded||p.coyote>0)?-14.6:(p.jumpCount<2?-12.4:null);
      if (imp!==null && Math.abs(predictY(imp)-tcy) < distNo-2) hook.jump();
    }
    if (p.y > 800) { p.y = 300; p.vy = 0; }   // revive so we can keep previewing colours
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});

for (const lvl of [1, 3, 5, 7, 10]) {
  await page.evaluate(l => { window.__lvlForce = l; }, lvl);
  await wait(700);
  await page.screenshot({ path: `${OUT}/theme-L${lvl}.png` });
  console.log('shot L', lvl);
}
await browser.close();
