// Generate a square stats/ranking card and share it (Web Share API) or download it.
// Pure client-side canvas — no server, no deps.

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.crossOrigin = 'anonymous';   // needed so the canvas isn't tainted on export
    im.onload = () => resolve(im);
    im.onerror = reject;
    im.src = src;
  });
}

export async function shareStatsCard(opts: { name: string; avatar?: string | null; best: number; rank: number | null }) {
  const W = 1080, H = 1080;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  if (!ctx) return;

  // Background + subtle frame
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 2;
  ctx.strokeRect(48, 48, W - 96, H - 96);

  const cx = W / 2;
  ctx.textAlign = 'center';

  // Header
  ctx.fillStyle = '#ff4e3e';
  ctx.font = '700 26px "Helvetica Neue", Arial, sans-serif';
  ctx.fillText('S U A V   //   O U R O O   A R C A D E', cx, 150);

  // Avatar (optional) — circular
  let y = 250;
  if (opts.avatar) {
    try {
      const im = await loadImg(opts.avatar);
      const r = 80;
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, y + r, r, 0, Math.PI * 2); ctx.closePath(); ctx.clip();
      ctx.drawImage(im, cx - r, y, r * 2, r * 2);
      ctx.restore();
      ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(cx, y + r, r, 0, Math.PI * 2); ctx.stroke();
      y += r * 2 + 40;
    } catch { y += 20; }
  }

  // Name
  ctx.fillStyle = '#fff';
  ctx.font = '900 64px "Helvetica Neue", Arial, sans-serif';
  ctx.fillText(opts.name.toUpperCase(), cx, y + 60);
  y += 130;

  // Rank — the hero number
  if (opts.rank != null) {
    ctx.fillStyle = '#ffe65c';
    ctx.font = '900 200px "Helvetica Neue", Arial, sans-serif';
    ctx.fillText(`#${opts.rank}`, cx, y + 180);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '700 30px "Helvetica Neue", Arial, sans-serif';
    ctx.fillText('NO RANKING GLOBAL', cx, y + 240);
    y += 320;
  }

  // Best score
  ctx.fillStyle = '#fff';
  ctx.font = '900 80px "Helvetica Neue", Arial, sans-serif';
  ctx.fillText(opts.best.toLocaleString('pt-PT'), cx, y + 70);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = '700 28px "Helvetica Neue", Arial, sans-serif';
  ctx.fillText('MELHOR PONTUAÇÃO', cx, y + 115);

  // Footer URL
  ctx.fillStyle = '#ff4e3e';
  ctx.font = '700 30px "Helvetica Neue", Arial, sans-serif';
  ctx.fillText('ouroo.vercel.app', cx, H - 90);

  const blob = await new Promise<Blob | null>(res => c.toBlob(res, 'image/png'));
  if (!blob) return;
  const file = new File([blob], 'ouroo-ranking.png', { type: 'image/png' });
  const text = opts.rank != null
    ? `Estou em #${opts.rank} no ranking OUROO de SUAV 🎮`
    : `O meu recorde no OUROO de SUAV: ${opts.best.toLocaleString('pt-PT')} 🎮`;

  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: 'OUROO', text }).catch(() => {});
  } else {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'ouroo-ranking.png'; a.click();
    URL.revokeObjectURL(url);
  }
}
