// OUROO PRAÇA — furniture catalogue (data only; the iso renderers live in RoomCanvas).
// Extracted into a lib so the inventory/economy can read the same source of truth.
//
// Economy seam: most furni is BASIC — free and owned by default (placing it has always been
// free, that doesn't change). Premium categories (Hi-Fi today, more collections later) cost
// Cristais and must be bought into your wallet before you can place them. `premium` on a CAT
// turns the whole collection into a paid one; `CAT_PRICE` sets the per-item Cristais cost.

export type FurniDef = {
  kind: string; name: string; emoji: string; cat: string; color: string;
  h: number; walk: boolean; foot: number; special?: string; span?: [number, number];
};

export type FurniCat = { id: string; name: string; premium?: boolean };

export const CATS: FurniCat[] = [
  { id: 'tier1',    name: '★ Hi-Fi', premium: true },
  { id: 'constr',   name: 'Construção' },
  { id: 'tapetes',  name: 'Pisos' },
  { id: 'assentos', name: 'Assentos' },
  { id: 'mesas',    name: 'Mesas' },
  { id: 'plantas',  name: 'Plantas' },
  { id: 'luzes',    name: 'Luzes' },
  { id: 'electro',  name: 'Eletrónica' },
  { id: 'deco',     name: 'Decoração' },
];

// Per-item Cristais price for premium collections (0 / absent = free basic furni).
export const CAT_PRICE: Record<string, number> = {
  tier1: 1500,
};

export const FURNI: FurniDef[] = [
  // ★ HI-FI — 1st-tier hand-drawn lounge set (couch spans 2 tiles)
  { kind: 'lounge_couch', name: 'Sofá Lounge', emoji: '🛋️', cat: 'tier1', color: '#a9713f', h: 1, walk: false, foot: 1, special: 'couch', span: [2, 1] },
  { kind: 'lounge_chair', name: 'Poltrona',    emoji: '💺', cat: 'tier1', color: '#a9713f', h: 1, walk: false, foot: 1, special: 'armchair' },
  { kind: 'lounge_table', name: 'Mesa Centro', emoji: '🪵', cat: 'tier1', color: '#4a3120', h: 1, walk: false, foot: 1, special: 'coffee' },
  { kind: 'hc_sofa',   name: 'Sofá HC',      emoji: '🛋️', cat: 'tier1', color: '#7b2d3a', h: 1, walk: false, foot: 1,    special: 'couch_hc', span: [2, 1] },
  { kind: 'hc_plant',  name: 'Planta HC',    emoji: '🪴', cat: 'tier1', color: '#1f7a3a', h: 2, walk: false, foot: 0.8,  special: 'plant_hc' },
  { kind: 'hc_column', name: 'Coluna HC',    emoji: '🏛️', cat: 'tier1', color: '#dfe2ea', h: 3, walk: false, foot: 0.5,  special: 'column_hc' },
  { kind: 'hc_ball',   name: 'Bola Espelho', emoji: '🪩', cat: 'tier1', color: '#cfe0ff', h: 0, walk: true,  foot: 1,    special: 'ball_hc' },
  // construção (walkable build pieces + solid walls)
  { kind: 'bloco',      name: 'Bloco',     emoji: '🧊', cat: 'constr', color: '#3a3a5a', h: 1, walk: true,  foot: 1 },
  { kind: 'meio',       name: 'Cubo',      emoji: '🔲', cat: 'constr', color: '#45455f', h: 1, walk: true,  foot: 0.7 },
  { kind: 'plataforma', name: 'Plataforma',emoji: '⬛', cat: 'constr', color: '#303048', h: 1, walk: true,  foot: 1 },
  { kind: 'escada',     name: 'Escada',    emoji: '🪜', cat: 'constr', color: '#4a4a66', h: 1, walk: true,  foot: 1, special: 'stair' },
  { kind: 'rampa',      name: 'Rampa',     emoji: '📐', cat: 'constr', color: '#40405a', h: 1, walk: true,  foot: 1, special: 'stair' },
  { kind: 'pilar',      name: 'Pilar',     emoji: '🏛️', cat: 'constr', color: '#2e2e3e', h: 2, walk: false, foot: 0.55 },
  { kind: 'parede',     name: 'Parede',    emoji: '🧱', cat: 'constr', color: '#3a2e2e', h: 2, walk: false, foot: 1, special: 'wall' },
  { kind: 'cerca',      name: 'Cerca',     emoji: '🚧', cat: 'constr', color: '#6a5a2a', h: 1, walk: false, foot: 1, special: 'wall' },
  { kind: 'corrimao',   name: 'Corrimão',  emoji: '🪜', cat: 'constr', color: '#cfd6e0', h: 1, walk: false, foot: 0.5, special: 'ladder' },
  // pisos / tapetes (walkable, 1-high — carpets have height!)
  { kind: 'tap_red',  name: 'Tapete',  emoji: '🟥', cat: 'tapetes', color: '#b3242e', h: 0, walk: true, foot: 1, special: 'rug' },
  { kind: 'tap_blu',  name: 'Tapete',  emoji: '🟦', cat: 'tapetes', color: '#2452b3', h: 0, walk: true, foot: 1, special: 'rug' },
  { kind: 'tap_grn',  name: 'Tapete',  emoji: '🟩', cat: 'tapetes', color: '#1ea64a', h: 0, walk: true, foot: 1, special: 'rug' },
  { kind: 'tap_pur',  name: 'Tapete',  emoji: '🟪', cat: 'tapetes', color: '#8a44cc', h: 0, walk: true, foot: 1, special: 'rug' },
  { kind: 'relva',    name: 'Relva',   emoji: '🌿', cat: 'tapetes', color: '#2e7d32', h: 0, walk: true, foot: 1, special: 'rug' },
  { kind: 'agua',     name: 'Água',    emoji: '💧', cat: 'tapetes', color: '#1d6fb3', h: 0, walk: true, foot: 1, special: 'water' },
  { kind: 'gelo',     name: 'Gelo',    emoji: '🧊', cat: 'tapetes', color: '#aee3ff', h: 0, walk: true, foot: 1, special: 'rug' },
  { kind: 'lava',     name: 'Lava',    emoji: '🌋', cat: 'tapetes', color: '#d23a1a', h: 0, walk: true, foot: 1, special: 'water' },
  { kind: 'xadrez',   name: 'Xadrez',  emoji: '♟️', cat: 'tapetes', color: '#2a2a36', h: 0, walk: true, foot: 1, special: 'rug' },
  // assentos
  { kind: 'cadeira',  name: 'Cadeira',  emoji: '🪑', cat: 'assentos', color: '#6a5436', h: 1, walk: false, foot: 0.7, special: 'chair' },
  { kind: 'poltrona', name: 'Poltrona', emoji: '💺', cat: 'assentos', color: '#5a4080', h: 1, walk: false, foot: 0.8, special: 'sofa' },
  { kind: 'sofa',     name: 'Sofá',     emoji: '🛋️', cat: 'assentos', color: '#4a3768', h: 1, walk: false, foot: 1,   special: 'sofa' },
  { kind: 'sofahc',   name: 'Sofá HC',  emoji: '👑', cat: 'assentos', color: '#ffd23a', h: 1, walk: false, foot: 1,   special: 'sofa' },
  { kind: 'banco',    name: 'Banco',    emoji: '🪑', cat: 'assentos', color: '#6a6a76', h: 1, walk: false, foot: 0.6, special: 'stool' },
  { kind: 'trono',    name: 'Trono',    emoji: '👑', cat: 'assentos', color: '#7a1aaa', h: 2, walk: false, foot: 0.8, special: 'throne' },
  { kind: 'puff',     name: 'Puff',     emoji: '🟢', cat: 'assentos', color: '#1ED760', h: 1, walk: false, foot: 0.7, special: 'puff' },
  { kind: 'banco_jd', name: 'Banco Jardim', emoji: '🪑', cat: 'assentos', color: '#5a6e44', h: 1, walk: false, foot: 1, special: 'bench', span: [2, 1] },
  // mesas
  { kind: 'mesa',     name: 'Mesa',      emoji: '🟫', cat: 'mesas', color: '#7a542a', h: 1, walk: false, foot: 0.9, special: 'table' },
  { kind: 'mesajant', name: 'Jantar',    emoji: '🍽️', cat: 'mesas', color: '#6a441a', h: 1, walk: false, foot: 1,   special: 'table' },
  { kind: 'mesacafe', name: 'Café',      emoji: '☕', cat: 'mesas', color: '#4a3a2a', h: 1, walk: false, foot: 0.8, special: 'table' },
  { kind: 'bar',      name: 'Bar',       emoji: '🍹', cat: 'mesas', color: '#2a2a3a', h: 2, walk: false, foot: 1,   special: 'counter' },
  { kind: 'rececao',  name: 'Receção',   emoji: '🛎️', cat: 'mesas', color: '#6b4a2c', h: 2, walk: false, foot: 1,   special: 'reception', span: [3, 1] },
  { kind: 'prat',     name: 'Prateleira',emoji: '📚', cat: 'mesas', color: '#4a3420', h: 2, walk: false, foot: 0.6, special: 'shelf' },
  // plantas
  { kind: 'planta',   name: 'Planta',   emoji: '🪴', cat: 'plantas', color: '#8a4f2a', h: 1, walk: false, foot: 0.7, special: 'plant' },
  { kind: 'cato',     name: 'Cato',     emoji: '🌵', cat: 'plantas', color: '#8a4f2a', h: 1, walk: false, foot: 0.6, special: 'plant' },
  { kind: 'bonsai',   name: 'Bonsai',   emoji: '🎍', cat: 'plantas', color: '#8a4f2a', h: 1, walk: false, foot: 0.7, special: 'plant' },
  { kind: 'arvore',   name: 'Árvore',   emoji: '🌳', cat: 'plantas', color: '#6a4326', h: 3, walk: false, foot: 0.85, special: 'tree' },
  { kind: 'palmeira', name: 'Palmeira', emoji: '🌴', cat: 'plantas', color: '#7a5230', h: 3, walk: false, foot: 0.7, special: 'palm' },
  { kind: 'flores',   name: 'Flores',   emoji: '🌷', cat: 'plantas', color: '#8a4f2a', h: 1, walk: false, foot: 0.6, special: 'plant' },
  // luzes
  { kind: 'candeeiro',name: 'Candeeiro',emoji: '💡', cat: 'luzes', color: '#ffe65c', h: 2, walk: false, foot: 0.4, special: 'lamp' },
  { kind: 'neon',     name: 'Néon',     emoji: '🔆', cat: 'luzes', color: '#ff44aa', h: 1, walk: false, foot: 0.8, special: 'lamp' },
  { kind: 'disco',    name: 'Bola Disco',emoji: '🪩', cat: 'luzes', color: '#cfd6ff', h: 0, walk: true,  foot: 1, special: 'disco' },
  { kind: 'holofote', name: 'Holofote', emoji: '🔦', cat: 'luzes', color: '#ffffff', h: 1, walk: false, foot: 0.5, special: 'lamp' },
  { kind: 'lavalamp', name: 'Lava Lamp',emoji: '🟣', cat: 'luzes', color: '#cc44ff', h: 1, walk: false, foot: 0.4, special: 'lamp' },
  { kind: 'tocha',    name: 'Tocha',    emoji: '🔥', cat: 'luzes', color: '#ff8800', h: 1, walk: false, foot: 0.4, special: 'lamp' },
  { kind: 'lustre',   name: 'Lustre',   emoji: '🛋️', cat: 'luzes', color: '#ffd98a', h: 0, walk: true, foot: 0.5, special: 'chandelier' },
  // eletrónica
  { kind: 'tv',       name: 'TV',       emoji: '📺', cat: 'electro', color: '#15151f', h: 1, walk: false, foot: 1, special: 'tv' },
  { kind: 'coluna',   name: 'Coluna',   emoji: '🔈', cat: 'electro', color: '#23232f', h: 2, walk: false, foot: 0.7, special: 'speaker' },
  { kind: 'arcade',   name: 'Arcade',   emoji: '🕹️', cat: 'electro', color: '#2a1a4a', h: 2, walk: false, foot: 0.8, special: 'tv' },
  { kind: 'frigo',    name: 'Frigorífico',emoji: '🧊', cat: 'electro', color: '#cdd6e0', h: 2, walk: false, foot: 0.7, special: 'fridge' },
  { kind: 'vending',  name: 'Máquina',  emoji: '🥤', cat: 'electro', color: '#b3242e', h: 2, walk: false, foot: 0.7, special: 'vending' },
  { kind: 'pc',       name: 'Portátil', emoji: '💻', cat: 'electro', color: '#3a3f4e', h: 1, walk: false, foot: 0.6, special: 'laptop' },
  { kind: 'pa',       name: 'Torre PA', emoji: '🔊', cat: 'electro', color: '#1a1a22', h: 3, walk: false, foot: 0.62, special: 'pa' },
  // decoração
  { kind: 'cartaz',   name: 'Cartaz',   emoji: '🪧', cat: 'deco', color: '#16161f', h: 1, walk: false, foot: 0.7, special: 'sign' },
  { kind: 'quadro',   name: 'Quadro',   emoji: '🖼️', cat: 'deco', color: '#caa24a', h: 1, walk: false, foot: 0.6, special: 'frame' },
  { kind: 'trofeu',   name: 'Troféu',   emoji: '🏆', cat: 'deco', color: '#ffd700', h: 1, walk: false, foot: 0.4, special: 'trophy' },
  { kind: 'vaso',     name: 'Vaso',     emoji: '🏺', cat: 'deco', color: '#c4632e', h: 1, walk: false, foot: 0.5, special: 'vase' },
  { kind: 'pato',     name: 'Patinho',  emoji: '🦆', cat: 'deco', color: '#ffd23a', h: 1, walk: false, foot: 0.4, special: 'duck' },
  { kind: 'cone',     name: 'Cone',     emoji: '🚧', cat: 'deco', color: '#ff6a00', h: 1, walk: false, foot: 0.4, special: 'cone' },
  { kind: 'estatua',  name: 'Estátua',  emoji: '🗿', cat: 'deco', color: '#9a9aa6', h: 2, walk: false, foot: 0.6, special: 'statue' },
  { kind: 'fonte',    name: 'Fonte',    emoji: '⛲', cat: 'deco', color: '#c8ccd4', h: 1, walk: false, foot: 0.9, special: 'fountain' },
  { kind: 'poste',    name: 'Cordão VIP',emoji: '🪢', cat: 'deco', color: '#caa24a', h: 0, walk: true,  foot: 0.3, special: 'rope', span: [3, 1] },
  { kind: 'boia',     name: 'Bóia',     emoji: '🛟', cat: 'deco', color: '#ff5a5a', h: 0, walk: true,  foot: 0.6, special: 'float' },
];

export const FMAP: Record<string, FurniDef> = Object.fromEntries(FURNI.map(f => [f.kind, f]));
export const defOf = (kind: string): FurniDef =>
  FMAP[kind] ?? { kind, name: '?', emoji: '?', cat: 'deco', color: '#666', h: 1, walk: false, foot: 0.8 };

const catOf = (id: string): FurniCat | undefined => CATS.find(c => c.id === id);

// Position of each furni within its own category (array order). The first FREE_PER_CAT items of every
// NON-premium category are free + owned by default; the rest are cheap, to nudge a little grind even
// at the basic level. Premium categories (Hi-Fi) have no free items.
export const FREE_PER_CAT = 2;
const CAT_INDEX: Record<string, number> = (() => {
  const seen: Record<string, number> = {}, out: Record<string, number> = {};
  for (const f of FURNI) { const n = seen[f.cat] ?? 0; out[f.kind] = n; seen[f.cat] = n + 1; }
  return out;
})();

// Seats you can sit on: walking onto the tile rests the avatar at this z (sit height in levels),
// keyed by the renderer `special`. Non-seats return null (they stay solid blockers).
const SEAT_SIT: Record<string, number> = { chair: 0.72, sofa: 0.66, stool: 0.7, throne: 0.7, puff: 0.45, armchair: 0.72, couch: 0.78, couch_hc: 0.8, bench: 0.6 };
export const sitHeight = (kind: string): number | null => { const s = defOf(kind).special; return s && s in SEAT_SIT ? SEAT_SIT[s] : null; };

// Pieces that have proper 4-way directional art (rotate visibly). Others ignore direction.
const ROTATABLE = new Set(['chair', 'sofa', 'armchair', 'throne', 'couch', 'couch_hc', 'tv', 'laptop', 'counter', 'fridge', 'vending', 'speaker', 'shelf', 'sign', 'table', 'bench', 'reception', 'pa', 'ladder', 'rope']);
export const isRotatable = (kind: string): boolean => ROTATABLE.has(defOf(kind).special ?? '');

// Is this furniture from a paid collection? (Hi-Fi today; more later.)
export const isFurniPremium = (kind: string): boolean => Boolean(catOf(defOf(kind).cat)?.premium);
// Free + owned by default: the first couple of each basic category.
export const isFurniFree = (kind: string): boolean => !isFurniPremium(kind) && (CAT_INDEX[kind] ?? 99) < FREE_PER_CAT;
// Cristais price: premium uses CAT_PRICE; free basics cost 0; other basics are cheap (a touch by height).
export function furniPrice(kind: string): number {
  const d = defOf(kind);
  if (catOf(d.cat)?.premium) return CAT_PRICE[d.cat] ?? 0;
  if (isFurniFree(kind)) return 0;
  return 120 + Math.max(0, d.h) * 60;   // ≈ 180 (1-high) / 240 (2-high)
}
