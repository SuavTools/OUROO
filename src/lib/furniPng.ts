// Hand-authored PNG furniture — raster sprites the engine blits as images (with a procedural fallback
// while the file loads). Each entry: the file's blit size (w,h) and the anchor (ax,ay) = the point in
// the art that sits on the tile origin. The engine positions the art so (ax,ay) lands on (sx,sy).
// Files live in /public/furni/<kind>.png and are exported at 1× (the canvas is already supersampled).

export type PngDef = { w: number; h: number; ax: number; ay: number };

// Keyed by furni `kind`. (ax,ay) must match the procedural sprite's tile origin (OX,OY) so a PNG piece
// lands on the exact same tile spot as its drawn counterpart.
export const PNG_FURNI: Record<string, PngDef> = {};

export const hasPng = (kind: string): boolean => kind in PNG_FURNI;

const imgCache = new Map<string, HTMLImageElement>();
const getImg = (kind: string): HTMLImageElement | null => {
  const def = PNG_FURNI[kind]; if (!def || typeof Image === 'undefined') return null;
  let img = imgCache.get(kind);
  if (!img) { img = new Image(); img.src = `/furni/${kind}.png`; imgCache.set(kind, img); }
  return img;
};

// Blit the PNG so its anchor sits on (sx,sy). Returns false (not yet loaded) so the caller can fall back.
export const drawPngFurni = (ctx: CanvasRenderingContext2D, kind: string, sx: number, sy: number): boolean => {
  const def = PNG_FURNI[kind]; const img = getImg(kind);
  if (!def || !img || !img.complete || !img.naturalWidth) return false;
  ctx.drawImage(img, sx - def.ax, sy - def.ay, def.w, def.h);
  return true;
};
