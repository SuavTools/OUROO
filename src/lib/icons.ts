// OUROO custom icons — procedural, JSON-spec cosmetics. No image uploads: an icon is a small
// stack of coloured shapes, drawn on the same canvas pipeline as the built-in skins. Users
// compose them in the IconEditor; the spec is stored in the wallet and can be worn in PRAÇA.

export const ICON_SHAPES = ['diamond', 'circle', 'square', 'triangle', 'star', 'heart', 'ring', 'hex'] as const;
export type IconShape = (typeof ICON_SHAPES)[number];

export type IconLayer = {
  shape: IconShape;
  color: string;
  scale: number;   // 0..1 of the icon box
  rot: number;     // turns, 0..1
  dx: number;      // -1..1 horizontal offset (fraction of half-box)
  dy: number;      // -1..1 vertical offset
  spin?: boolean;  // slow idle rotation when animated
};

export type IconSpec = { layers: IconLayer[]; bg?: string | null };
export type CustomIcon = { id: string; name: string; spec: IconSpec };

export const MAX_ICON_LAYERS = 6;

export const ICON_PALETTE = [
  '#ffe65c', '#ff4e3e', '#1ED760', '#00cfff', '#ff44aa', '#cc44ff',
  '#ffffff', '#ff8800', '#4488ff', '#ffd700', '#1a1a24', '#9aa0b5',
];

// A representative colour for shadows / name tints (first layer, else white).
export const iconPrimaryColor = (spec: IconSpec): string => spec.layers[0]?.color ?? '#ffffff';

export const emptyIcon = (): IconSpec => ({
  bg: null,
  layers: [{ shape: 'diamond', color: '#ffe65c', scale: 0.8, rot: 0, dx: 0, dy: 0 }],
});

function path(ctx: CanvasRenderingContext2D, shape: IconShape, r: number) {
  switch (shape) {
    case 'circle': ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); break;
    case 'square': ctx.beginPath(); ctx.rect(-r * 0.82, -r * 0.82, r * 1.64, r * 1.64); break;
    case 'triangle':
      ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(r * 0.92, r * 0.72); ctx.lineTo(-r * 0.92, r * 0.72); ctx.closePath(); break;
    case 'hex':
      ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = -Math.PI / 2 + i * Math.PI / 3; const x = Math.cos(a) * r, y = Math.sin(a) * r; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.closePath(); break;
    case 'star':
      ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5; const rr = i % 2 ? r * 0.45 : r; const x = Math.cos(a) * rr, y = Math.sin(a) * rr; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.closePath(); break;
    case 'heart': {
      const u = r * 0.92; ctx.beginPath(); ctx.moveTo(0, u * 0.72);
      ctx.bezierCurveTo(-u * 1.25, -u * 0.25, -u * 0.45, -u * 1.0, 0, -u * 0.3);
      ctx.bezierCurveTo(u * 0.45, -u * 1.0, u * 1.25, -u * 0.25, 0, u * 0.72); ctx.closePath(); break;
    }
    case 'ring': // handled by caller (stroke)
    case 'diamond':
    default:
      ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(r, 0); ctx.lineTo(0, r); ctx.lineTo(-r, 0); ctx.closePath();
  }
}

// Draw an icon centred at the current origin, fitting a `size`×`size` box. `t` = anim frame.
export function drawIconSpec(ctx: CanvasRenderingContext2D, spec: IconSpec, size: number, t = 0) {
  const half = size / 2;
  if (spec.bg) {
    ctx.save(); ctx.fillStyle = spec.bg; ctx.beginPath();
    ctx.roundRect(-half, -half, size, size, size * 0.22);
    ctx.fill(); ctx.restore();
  }
  for (const ly of spec.layers) {
    const r = Math.max(1, (ly.scale || 0.5) * half * 0.92);
    ctx.save();
    ctx.translate((ly.dx || 0) * half * 0.6, (ly.dy || 0) * half * 0.6);
    ctx.rotate((ly.rot || 0) * Math.PI * 2 + (ly.spin ? t * 0.03 : 0));
    ctx.shadowColor = ly.color; ctx.shadowBlur = size * 0.18;
    if (ly.shape === 'ring') {
      ctx.strokeStyle = ly.color; ctx.lineWidth = Math.max(2, r * 0.28);
      ctx.beginPath(); ctx.arc(0, 0, r * 0.82, 0, Math.PI * 2); ctx.stroke();
    } else {
      ctx.fillStyle = ly.color; path(ctx, ly.shape, r); ctx.fill();
    }
    ctx.restore();
  }
}
