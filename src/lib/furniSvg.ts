// Hand-authored SVG furniture pipeline — blits vector art as images with a procedural fallback.
// Currently EMPTY: the Japanese-garden pieces (pagoda, torii, stone lantern, sakura, luxe bonsai) were
// flat camera-facing SVGs, so they were rebuilt as procedural ISO geometry in furniRender.ts (4-way
// rotatable, world-axis faces — nothing faces the player). This module stays wired so future hand-drawn
// art can be dropped straight back into SVG_FURNI without touching the renderer.

export type SvgDef = { w: number; h: number; ax: number; ay: number; svg: string };

export const SVG_FURNI: Record<string, SvgDef> = {};

export const hasSvg = (kind: string): boolean => kind in SVG_FURNI;

const imgCache = new Map<string, HTMLImageElement>();
const getImg = (kind: string): HTMLImageElement | null => {
  const def = SVG_FURNI[kind]; if (!def || typeof Image === 'undefined') return null;
  let img = imgCache.get(kind);
  if (!img) { img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(def.svg); imgCache.set(kind, img); }
  return img;
};

// Blit the SVG so its anchor sits on (sx,sy). Returns false (not yet loaded) so the caller can fall back.
export const drawSvgFurni = (ctx: CanvasRenderingContext2D, kind: string, sx: number, sy: number): boolean => {
  const def = SVG_FURNI[kind]; const img = getImg(kind);
  if (!def || !img || !img.complete || !img.naturalWidth) return false;
  ctx.drawImage(img, sx - def.ax, sy - def.ay, def.w, def.h);
  return true;
};

// ── URL-based SVG sprites (files in /public/furni/*.svg) ──────────────────────
export type SvgUrlDef = { w: number; h: number; ax: number; ay: number };

export const SVG_URL_FURNI: Record<string, SvgUrlDef> = {
  bld_house: { w: 259, h: 257, ax: 130, ay: 249 },
};

export const hasSvgUrl = (kind: string): boolean => kind in SVG_URL_FURNI;

const urlImgCache = new Map<string, HTMLImageElement>();
const getUrlImg = (kind: string): HTMLImageElement | null => {
  if (typeof Image === 'undefined') return null;
  let img = urlImgCache.get(kind);
  if (!img) { img = new Image(); img.src = `/furni/${kind}.svg`; urlImgCache.set(kind, img); }
  return img;
};

export const drawSvgUrlFurni = (ctx: CanvasRenderingContext2D, kind: string, sx: number, sy: number): boolean => {
  const def = SVG_URL_FURNI[kind]; const img = getUrlImg(kind);
  if (!def || !img || !img.complete || !img.naturalWidth) return false;
  ctx.drawImage(img, sx - def.ax, sy - def.ay, def.w, def.h);
  return true;
};
