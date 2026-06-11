// Self-drawn UI icons (no emojis): category glyphs for the room designer. Furni thumbnails use the
// real isometric renderer (see FurniSprite / @/lib/furniRender). All draw centred at the origin.

export type CatGlyph = 'tier1' | 'constr' | 'tapetes' | 'assentos' | 'mesas' | 'plantas' | 'luzes' | 'electro' | 'deco' | 'remove';

// A clean line/fill glyph per furni category — drawn, not an emoji.
export function drawCatIcon(ctx: CanvasRenderingContext2D, cat: string, S: number, color = '#cfd2dc') {
  const u = S * 0.42;
  ctx.save();
  ctx.strokeStyle = color; ctx.fillStyle = color;
  ctx.lineWidth = Math.max(1.4, S * 0.055); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const diamond = (cy: number, w: number, h: number) => { ctx.beginPath(); ctx.moveTo(0, cy - h); ctx.lineTo(w, cy); ctx.lineTo(0, cy + h); ctx.lineTo(-w, cy); ctx.closePath(); };
  switch (cat) {
    case 'tier1': {  // sparkle (premium)
      const p = [[0, -u], [u * 0.24, -u * 0.24], [u, 0], [u * 0.24, u * 0.24], [0, u], [-u * 0.24, u * 0.24], [-u, 0], [-u * 0.24, -u * 0.24]];
      ctx.beginPath(); p.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.closePath(); ctx.fill(); break;
    }
    case 'brainrot': {  // espresso cup + steam
      ctx.beginPath(); ctx.moveTo(-u * 0.5, -u * 0.08); ctx.lineTo(u * 0.4, -u * 0.08); ctx.lineTo(u * 0.28, u * 0.55); ctx.lineTo(-u * 0.38, u * 0.55); ctx.closePath(); ctx.stroke();   // cup
      ctx.beginPath(); ctx.arc(u * 0.5, u * 0.18, u * 0.22, -Math.PI * 0.5, Math.PI * 0.5); ctx.stroke();   // handle
      ctx.beginPath(); ctx.moveTo(-u * 0.18, -u * 0.32); ctx.quadraticCurveTo(-u * 0.03, -u * 0.48, -u * 0.18, -u * 0.66); ctx.moveTo(u * 0.12, -u * 0.32); ctx.quadraticCurveTo(u * 0.27, -u * 0.48, u * 0.12, -u * 0.66); ctx.stroke();   // steam
      break;
    }
    case 'home': {  // house
      ctx.beginPath(); ctx.moveTo(-u * 0.7, -u * 0.05); ctx.lineTo(0, -u * 0.7); ctx.lineTo(u * 0.7, -u * 0.05); ctx.stroke();   // roof
      ctx.beginPath(); ctx.moveTo(-u * 0.5, -u * 0.05); ctx.lineTo(-u * 0.5, u * 0.65); ctx.lineTo(u * 0.5, u * 0.65); ctx.lineTo(u * 0.5, -u * 0.05); ctx.stroke();   // walls
      ctx.beginPath(); ctx.moveTo(-u * 0.12, u * 0.65); ctx.lineTo(-u * 0.12, u * 0.2); ctx.lineTo(u * 0.18, u * 0.2); ctx.lineTo(u * 0.18, u * 0.65); ctx.stroke();   // door
      break;
    }
    case 'gym': {  // dumbbell
      ctx.lineWidth = Math.max(2, S * 0.07); ctx.beginPath(); ctx.moveTo(-u * 0.35, 0); ctx.lineTo(u * 0.35, 0); ctx.stroke();
      for (const x of [-u * 0.45, u * 0.45]) { ctx.beginPath(); ctx.moveTo(x, -u * 0.4); ctx.lineTo(x, u * 0.4); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x + (x < 0 ? u * 0.18 : -u * 0.18), -u * 0.28); ctx.lineTo(x + (x < 0 ? u * 0.18 : -u * 0.18), u * 0.28); ctx.stroke(); }
      break;
    }
    case 'outdoor': {  // sun
      ctx.beginPath(); ctx.arc(0, 0, u * 0.4, 0, Math.PI * 2); ctx.stroke();
      for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; ctx.beginPath(); ctx.moveTo(Math.cos(a) * u * 0.55, Math.sin(a) * u * 0.55); ctx.lineTo(Math.cos(a) * u * 0.78, Math.sin(a) * u * 0.78); ctx.stroke(); }
      break;
    }
    case 'constr': { diamond(u * 0.42, u * 0.72, u * 0.36); ctx.stroke(); diamond(-u * 0.12, u * 0.72, u * 0.36); ctx.stroke(); break; }  // stacked blocks
    case 'tapetes': { diamond(0, u, u * 0.62); ctx.stroke(); diamond(0, u * 0.5, u * 0.3); ctx.stroke(); break; }            // rug w/ inner
    case 'assentos': {  // chair
      ctx.beginPath(); ctx.moveTo(-u * 0.55, -u * 0.7); ctx.lineTo(-u * 0.55, u * 0.2); ctx.lineTo(u * 0.55, u * 0.2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-u * 0.55, u * 0.2); ctx.lineTo(-u * 0.55, u * 0.75); ctx.moveTo(u * 0.55, u * 0.2); ctx.lineTo(u * 0.55, u * 0.75); ctx.stroke(); break;
    }
    case 'mesas': {  // table
      ctx.beginPath(); ctx.moveTo(-u * 0.82, -u * 0.18); ctx.lineTo(u * 0.82, -u * 0.18); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-u * 0.55, -u * 0.18); ctx.lineTo(-u * 0.55, u * 0.7); ctx.moveTo(u * 0.55, -u * 0.18); ctx.lineTo(u * 0.55, u * 0.7); ctx.stroke(); break;
    }
    case 'plantas': {  // pot + leaves
      ctx.beginPath(); ctx.moveTo(-u * 0.32, u * 0.2); ctx.lineTo(u * 0.32, u * 0.2); ctx.lineTo(u * 0.22, u * 0.72); ctx.lineTo(-u * 0.22, u * 0.72); ctx.closePath(); ctx.stroke();
      for (const a of [-0.55, 0, 0.55]) { ctx.beginPath(); ctx.ellipse(a * u * 0.4, -u * 0.18, u * 0.15, u * 0.42, a * 0.6, 0, Math.PI * 2); ctx.stroke(); } break;
    }
    case 'luzes': {  // bulb
      ctx.beginPath(); ctx.arc(0, -u * 0.12, u * 0.46, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-u * 0.2, u * 0.36); ctx.lineTo(u * 0.2, u * 0.36); ctx.moveTo(-u * 0.14, u * 0.58); ctx.lineTo(u * 0.14, u * 0.58); ctx.stroke(); break;
    }
    case 'electro': {  // screen
      ctx.beginPath(); ctx.roundRect(-u * 0.78, -u * 0.58, u * 1.56, u * 1.0, u * 0.12); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, u * 0.42); ctx.lineTo(0, u * 0.64); ctx.moveTo(-u * 0.26, u * 0.64); ctx.lineTo(u * 0.26, u * 0.64); ctx.stroke(); break;
    }
    case 'deco': { ctx.strokeRect(-u * 0.6, -u * 0.6, u * 1.2, u * 1.2); ctx.strokeRect(-u * 0.3, -u * 0.3, u * 0.6, u * 0.6); break; }  // frame
    case 'rotate': {  // circular arrow
      ctx.beginPath(); ctx.arc(0, 0, u * 0.62, Math.PI * 0.55, Math.PI * 2.15); ctx.stroke();
      const ang = Math.PI * 2.15, ex = Math.cos(ang) * u * 0.62, ey = Math.sin(ang) * u * 0.62;
      ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex - u * 0.26, ey + u * 0.02); ctx.moveTo(ex, ey); ctx.lineTo(ex - u * 0.04, ey - u * 0.26); ctx.stroke();
      break;
    }
    case 'remove': {  // trash can
      ctx.beginPath(); ctx.moveTo(-u * 0.55, -u * 0.42); ctx.lineTo(u * 0.55, -u * 0.42); ctx.moveTo(-u * 0.28, -u * 0.42); ctx.lineTo(-u * 0.28, -u * 0.6); ctx.lineTo(u * 0.28, -u * 0.6); ctx.lineTo(u * 0.28, -u * 0.42); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-u * 0.42, -u * 0.42); ctx.lineTo(-u * 0.32, u * 0.64); ctx.lineTo(u * 0.32, u * 0.64); ctx.lineTo(u * 0.42, -u * 0.42); ctx.stroke(); break;
    }
    default: diamond(0, u * 0.7, u * 0.5); ctx.stroke();
  }
  ctx.restore();
}
