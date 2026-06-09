// Headless completability check: an autopilot reads live crystal/platform positions via the
// dev __leap hook and times jumps (the player only controls altitude), then we report the max
// level reached. If a greedy controller clears several levels, the course is winnable.
import { chromium } from 'playwright';
const URL = process.env.SHOT_URL || 'http://localhost:3000';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
const wait = ms => new Promise(r => setTimeout(r, ms));

await page.goto(URL, { waitUntil: 'domcontentloaded' });
await wait(1600);
await page.getByRole('button', { name: /Novo Modo|LEAP/i }).first().click().catch(()=>{});
await wait(900);
await page.getByRole('button', { name: /Saltar/i }).first().click().catch(()=>{});
await wait(400);

const result = await page.evaluate(async () => {
  const hook = window.__leap;
  if (!hook) return { error: 'no __leap hook' };
  const { PW, PH, PLAYER_X } = hook;
  const G = 0.76, TERM = 20;
  const px = PLAYER_X + PW / 2;
  let maxLevel = 1, frames = 0, crystalsGot = 0;
  const samples = [];
  return await new Promise(resolve => {
    const tick = () => {
      const st = hook.state();
      const p = st.player;
      maxLevel = Math.max(maxLevel, st.level);
      frames++;
      crystalsGot = st.crystals.filter(c => c.collected).length;
      const pcy = p.y + PH / 2;

      // AIM ONLY AT CRYSTALS: match their height so we pass through (grab → jump refunded).
      // When no crystal is ahead, we're between the last crystal and the platform — do nothing
      // and let gravity land us on the platform top.
      let tcx = Infinity, tcy = 0;
      for (const c of st.crystals) {
        if (c.collected) continue;
        const cx = c.x + c.size / 2;
        if (cx > px - 12 && cx < tcx) { tcx = cx; tcy = c.y + c.size / 2; }
      }

      if (tcx !== Infinity) {
        const ws = st.worldSpeed;
        const f = Math.max(1, (tcx - px) / ws);
        // Only act once the target is within ~one jump's airtime; reacting earlier wastes the
        // jump (and the prediction is unreliable over long horizons).
        if (f < 40) {
          const vy = Math.min(p.vy, TERM);
          const predictNoJump = pcy + vy * f + 0.5 * G * f * f;
          const canJump = p.grounded || p.coyote > 0 || p.jumpCount < 2;
          if (predictNoJump > tcy + 4 && canJump) hook.jump();
        }
      }

      if (frames % 120 === 0) samples.push({ s: Math.round(frames/60), lvl: st.level, got: crystalsGot, y: Math.round(p.y) });

      if (p.y > 760) { resolve({ maxLevel, frames, died: true, score: st.curScore, crystalsGot, samples }); return; }
      if (frames > 60 * 40) { resolve({ maxLevel, frames, died: false, score: st.curScore, crystalsGot, samples }); return; }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
});

console.log('RESULT:', JSON.stringify(result));
console.log('PAGE ERRORS:', errs.length ? JSON.stringify(errs.slice(0,5)) : 'none');
await page.screenshot({ path: '/tmp/shots/leap-autopilot.png' });
await browser.close();
