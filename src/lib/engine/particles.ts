// Tiny shared particle pool — same Particle shape OUROO uses, so the spark/burst look
// is consistent across modes. Plain array in, mutate in place; the host owns the array.
export interface Particle {
  x: number; y: number; vx: number; vy: number;
  color: string; alpha: number; life: number; size: number;
}

type BurstOpts = { count?: number; speed?: number; size?: number; life?: number; gravity?: number; spread?: number; angle?: number };

// Push a radial burst of particles into `out`. `angle`/`spread` (radians) aim it; the
// default fires in all directions. `gravity` adds downward drift per frame in update().
export function spawnBurst(out: Particle[], x: number, y: number, color: string, opts: BurstOpts = {}) {
  const count = opts.count ?? 10;
  const baseSpeed = opts.speed ?? 4;
  const size = opts.size ?? 3;
  const life = opts.life ?? 28;
  const spread = opts.spread ?? Math.PI * 2;
  const aim = opts.angle ?? 0;
  for (let i = 0; i < count; i++) {
    const a = aim + (Math.random() - 0.5) * spread;
    const sp = baseSpeed * (0.4 + Math.random() * 0.8);
    out.push({
      x, y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      color,
      alpha: 1,
      life: life * (0.7 + Math.random() * 0.6),
      size: size * (0.6 + Math.random() * 0.8),
    });
  }
}

// Advance + fade particles, dropping dead ones. `gravity` pulls them down each frame.
export function updateParticles(arr: Particle[], gravity = 0.15) {
  for (let i = arr.length - 1; i >= 0; i--) {
    const p = arr[i];
    p.x += p.vx; p.y += p.vy; p.vy += gravity;
    p.life -= 1;
    p.alpha = Math.max(0, p.life / 28);
    if (p.life <= 0) arr.splice(i, 1);
  }
}

// Draw additive glowing dots. Caller sets any global transform; this saves/restores ctx.
export function drawParticles(ctx: CanvasRenderingContext2D, arr: Particle[]) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const p of arr) {
    ctx.globalAlpha = Math.max(0, Math.min(1, p.alpha));
    ctx.fillStyle = p.color;
    ctx.shadowBlur = 8;
    ctx.shadowColor = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
