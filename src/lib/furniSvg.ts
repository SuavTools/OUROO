// Hand-authored SVG furniture — higher-fidelity vector art that the engine blits as images (with a
// procedural fallback while the image loads). Each entry: the SVG markup + the blit size (w,h) and the
// anchor (ax,ay) = the point in the art that sits on the tile origin. The engine positions the art so
// (ax,ay) lands on (sx,sy). SVGs render crisp on the supersampled canvas.

export type SvgDef = { w: number; h: number; ax: number; ay: number; svg: string };

// ── Stone lantern (Tōrō): stacked granite segments, glowing fire box, upturned roof, finial. ──
const TORO = `<svg xmlns="http://www.w3.org/2000/svg" width="152" height="240" viewBox="0 0 76 120">
<defs><linearGradient id="t_st" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8d8d83"/><stop offset=".5" stop-color="#dad9cd"/><stop offset="1" stop-color="#8d8d83"/></linearGradient></defs>
<ellipse cx="38" cy="113" rx="23" ry="7" fill="#5f5f57"/>
<rect x="23" y="98" width="30" height="15" fill="url(#t_st)"/><ellipse cx="38" cy="98" rx="15" ry="4.5" fill="#e7e6da"/>
<rect x="31" y="64" width="14" height="35" fill="url(#t_st)"/>
<rect x="25" y="56" width="26" height="10" fill="url(#t_st)"/><ellipse cx="38" cy="56" rx="13" ry="4" fill="#e7e6da"/>
<rect x="27" y="36" width="22" height="22" fill="url(#t_st)"/>
<rect x="32" y="40" width="12" height="14" rx="2" fill="#2c1f0e"/><rect x="33.5" y="41.5" width="9" height="11" rx="2" fill="#ffd66a"/>
<path d="M18 39 Q38 14 58 39 Q49 33 38 32 Q27 33 18 39 Z" fill="#74746c"/>
<path d="M20 38 Q38 18 56 38" fill="none" stroke="#a2a298" stroke-width="2"/>
<circle cx="38" cy="19" r="4.5" fill="#9a9a90"/><rect x="36.5" y="8" width="3" height="11" fill="#9a9a90"/>
</svg>`;

// ── Sakura (cherry blossom tree): curved trunk + layered blossom canopy with speckle + petals. ──
const SAKURA = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="340" viewBox="0 0 150 170">
<defs><radialGradient id="s_bl" cx=".4" cy=".34" r=".72"><stop offset="0" stop-color="#ffd9ea"/><stop offset=".55" stop-color="#ff9ec7"/><stop offset="1" stop-color="#e06a9f"/></radialGradient>
<linearGradient id="s_tr" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#52371f"/><stop offset=".5" stop-color="#7d573a"/><stop offset="1" stop-color="#4a3119"/></linearGradient></defs>
<ellipse cx="75" cy="163" rx="26" ry="7" fill="#000" opacity=".12"/>
<path d="M68 163 C63 132 62 112 71 92 L82 92 C90 114 84 138 82 163 Z" fill="url(#s_tr)"/>
<path d="M74 112 C60 102 50 94 41 86" stroke="#5e4026" stroke-width="6" fill="none" stroke-linecap="round"/>
<path d="M77 100 C93 93 102 86 112 80" stroke="#5e4026" stroke-width="6" fill="none" stroke-linecap="round"/>
<g><circle cx="75" cy="58" r="43" fill="url(#s_bl)"/><circle cx="41" cy="73" r="30" fill="url(#s_bl)"/><circle cx="109" cy="70" r="31" fill="url(#s_bl)"/><circle cx="59" cy="38" r="27" fill="url(#s_bl)"/><circle cx="97" cy="42" r="25" fill="url(#s_bl)"/><circle cx="75" cy="30" r="22" fill="url(#s_bl)"/></g>
<g fill="#fff2f8" opacity=".9"><circle cx="60" cy="50" r="3"/><circle cx="86" cy="46" r="3"/><circle cx="72" cy="66" r="3"/><circle cx="46" cy="70" r="2.5"/><circle cx="104" cy="64" r="2.5"/><circle cx="92" cy="74" r="2.5"/><circle cx="66" cy="40" r="2.5"/></g>
<g fill="#ffb6d4"><circle cx="40" cy="104" r="2.4"/><circle cx="112" cy="100" r="2.4"/><circle cx="96" cy="116" r="2"/><circle cx="54" cy="120" r="2"/></g>
</svg>`;

// ── Torii gate: vermilion tapered posts, black footings, nuki + curved kasagi, tablet, gold caps. ──
const TORII = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="360" viewBox="0 0 200 180">
<defs><linearGradient id="to_v" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e8492f"/><stop offset="1" stop-color="#b22f1c"/></linearGradient></defs>
<ellipse cx="48" cy="173" rx="14" ry="4" fill="#000" opacity=".12"/><ellipse cx="152" cy="173" rx="14" ry="4" fill="#000" opacity=".12"/>
<path d="M40 172 L56 172 L52 50 L44 50 Z" fill="url(#to_v)"/>
<path d="M144 172 L160 172 L156 50 L148 50 Z" fill="url(#to_v)"/>
<rect x="38" y="168" width="20" height="9" rx="1.5" fill="#1c1c1c"/><rect x="142" y="168" width="20" height="9" rx="1.5" fill="#1c1c1c"/>
<rect x="44" y="86" width="112" height="12" fill="#c93a26"/>
<rect x="42" y="60" width="116" height="9" fill="#8f2718"/>
<path d="M22 58 L30 48 Q100 30 170 48 L178 58 L170 66 Q100 48 30 66 Z" fill="url(#to_v)"/>
<rect x="92" y="68" width="16" height="18" rx="1" fill="#1c1c1c"/><rect x="94" y="70" width="12" height="14" fill="#caa24a"/>
<rect x="20" y="44" width="14" height="7" fill="#caa24a"/><rect x="166" y="44" width="14" height="7" fill="#caa24a"/>
</svg>`;

// ── Pagoda: 3 tiers of cream walls + wide upturned vermilion roofs with gold ridges + a sōrin finial. ──
const roof = (x0: number, x1: number, y: number) => { const cx = (x0 + x1) / 2; return `<path d="M${x0} ${y} L${x0 + 7} ${y - 7} Q${cx} ${y - 22} ${x1 - 7} ${y - 7} L${x1} ${y} L${x1 - 11} ${y + 11} Q${cx} ${y - 2} ${x0 + 11} ${y + 11} Z" fill="url(#p_rf)"/><path d="M${x0 + 7} ${y - 6} Q${cx} ${y - 20} ${x1 - 7} ${y - 6}" fill="none" stroke="#e8c66a" stroke-width="2"/>`; };
const PAGODA = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="420" viewBox="0 0 150 210">
<defs><linearGradient id="p_rf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d8402a"/><stop offset="1" stop-color="#9e2c1a"/></linearGradient><linearGradient id="p_wl" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#d8d0bd"/><stop offset=".5" stop-color="#f3ede0"/><stop offset="1" stop-color="#cfc7b2"/></linearGradient></defs>
<ellipse cx="75" cy="202" rx="48" ry="11" fill="#000" opacity=".14"/>
<rect x="46" y="152" width="58" height="48" fill="url(#p_wl)"/><rect x="46" y="192" width="58" height="8" fill="#6b5436"/>
<rect x="52" y="152" width="5" height="44" fill="#7a5230"/><rect x="93" y="152" width="5" height="44" fill="#7a5230"/><rect x="72" y="160" width="6" height="32" fill="#4a3a26"/>
${roof(24, 126, 152)}
<rect x="56" y="116" width="38" height="38" fill="url(#p_wl)"/><rect x="56" y="148" width="38" height="6" fill="#6b5436"/><rect x="72" y="122" width="6" height="26" fill="#4a3a26"/>
${roof(38, 112, 116)}
<rect x="63" y="84" width="24" height="34" fill="url(#p_wl)"/><rect x="63" y="112" width="24" height="6" fill="#6b5436"/><rect x="72" y="90" width="6" height="22" fill="#4a3a26"/>
${roof(48, 102, 84)}
<rect x="73" y="44" width="4" height="42" fill="#caa24a"/><circle cx="75" cy="42" r="5" fill="#e8c66a"/>
<circle cx="75" cy="58" r="6" fill="none" stroke="#caa24a" stroke-width="2"/><circle cx="75" cy="70" r="7" fill="none" stroke="#caa24a" stroke-width="2"/>
</svg>`;

// ── Bonsai: glazed oval pot, gnarled trunk, three trimmed foliage pads. ──
const BONSAI = `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180" viewBox="0 0 90 90">
<defs><radialGradient id="b_f" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#4cbf6a"/><stop offset=".7" stop-color="#2f9a4c"/><stop offset="1" stop-color="#1c6e34"/></radialGradient></defs>
<ellipse cx="45" cy="84" rx="20" ry="5" fill="#000" opacity=".12"/>
<path d="M27 70 L63 70 L59 82 Q45 86 31 82 Z" fill="#3a6a8a"/><ellipse cx="45" cy="70" rx="18" ry="4.5" fill="#2c5470"/><ellipse cx="45" cy="69" rx="14" ry="3" fill="#3a2a1a"/>
<path d="M44 69 C40 58 50 52 46 42 C44 36 48 32 52 30" stroke="#5e4026" stroke-width="5" fill="none" stroke-linecap="round"/>
<path d="M46 50 C40 46 36 44 31 43" stroke="#5e4026" stroke-width="4" fill="none" stroke-linecap="round"/>
<ellipse cx="30" cy="40" rx="15" ry="9" fill="url(#b_f)"/><ellipse cx="58" cy="30" rx="16" ry="10" fill="url(#b_f)"/><ellipse cx="46" cy="22" rx="13" ry="8" fill="url(#b_f)"/>
<g fill="#7fe39a" opacity=".5"><circle cx="26" cy="38" r="2"/><circle cx="56" cy="27" r="2"/><circle cx="46" cy="20" r="2"/></g>
</svg>`;

export const SVG_FURNI: Record<string, SvgDef> = {
  toro: { w: 76, h: 120, ax: 38, ay: 113, svg: TORO },
  sakura: { w: 150, h: 170, ax: 75, ay: 163, svg: SAKURA },
  torii: { w: 200, h: 180, ax: 100, ay: 173, svg: TORII },
  pagoda: { w: 150, h: 210, ax: 75, ay: 202, svg: PAGODA },
  bonsai_lux: { w: 90, h: 90, ax: 45, ay: 84, svg: BONSAI },
};

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
