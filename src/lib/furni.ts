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
  pass?: boolean;     // walk-THROUGH (doorways): renders tall but never blocks the tile or raises the floor
  obscures?: boolean; // tile is treated as obscured for pathfinding (blocks auto-routing from > 1 tile away)
};

export type FurniCat = { id: string; name: string; premium?: boolean };

export const CATS: FurniCat[] = [
  { id: 'tier1',    name: '★ Hi-Fi', premium: true },
  { id: 'brainrot', name: '★ Brainrot', premium: true },
  { id: 'home',     name: 'Home' },
  { id: 'gym',      name: 'Gym' },
  { id: 'outdoor',  name: 'Outdoor' },
  { id: 'studio',   name: 'Studio' },
  { id: 'diner',    name: 'Diner' },
  { id: 'bath',     name: 'Bathroom' },
  { id: 'office',   name: 'Office' },
  { id: 'games',    name: 'Arcade' },
  { id: 'cafe',     name: 'Café' },
  { id: 'scifi',    name: 'Sci-Fi' },
  { id: 'beach',    name: 'Beach' },
  { id: 'garage',   name: 'Garage' },
  { id: 'festive',  name: 'Festive' },
  { id: 'boutique', name: 'Splucci' },
  { id: 'constr',   name: 'Construction' },
  { id: 'tapetes',  name: 'Floors' },
  { id: 'assentos', name: 'Seats' },
  { id: 'mesas',    name: 'Tables' },
  { id: 'plantas',  name: 'Plants' },
  { id: 'luzes',    name: 'Lights' },
  { id: 'electro',  name: 'Electronics' },
  { id: 'deco',     name: 'Decoration' },
  { id: 'urban',    name: 'Urban' },
  { id: 'junkyard', name: 'Junkyard' },
];

// Per-item Cristais price for premium collections (0 / absent = free basic furni).
export const CAT_PRICE: Record<string, number> = {
  tier1: 1500,
  brainrot: 1200,
};

export const FURNI: FurniDef[] = [
  // ★ HI-FI — 1st-tier hand-drawn lounge set (couch spans 2 tiles)
  { kind: 'lounge_couch', name: 'Lounge Couch', emoji: '🛋️', cat: 'tier1', color: '#a9713f', h: 1, walk: false, foot: 1, special: 'couch', span: [2, 1] },
  { kind: 'lounge_chair', name: 'Armchair',    emoji: '💺', cat: 'tier1', color: '#a9713f', h: 1, walk: false, foot: 1, special: 'armchair' },
  { kind: 'lounge_table', name: 'Coffee Table', emoji: '🪵', cat: 'tier1', color: '#4a3120', h: 1, walk: false, foot: 1, special: 'coffee' },
  { kind: 'hc_sofa',   name: 'HC Couch',     emoji: '🛋️', cat: 'tier1', color: '#7b2d3a', h: 1, walk: false, foot: 1,    special: 'couch_hc', span: [2, 1] },
  { kind: 'hc_plant',  name: 'HC Plant',     emoji: '🪴', cat: 'tier1', color: '#1f7a3a', h: 2, walk: false, foot: 0.8,  special: 'plant_hc' },
  { kind: 'hc_column', name: 'HC Column',    emoji: '🏛️', cat: 'tier1', color: '#dfe2ea', h: 3, walk: false, foot: 0.5,  special: 'column_hc' },
  { kind: 'hc_ball',   name: 'Mirror Ball', emoji: '🪩', cat: 'tier1', color: '#cfe0ff', h: 0, walk: false, foot: 1,    special: 'ball_hc', pass: true },
  { kind: 'chaise',    name: 'Luxe Chaise', emoji: '🛋️', cat: 'tier1', color: '#5a2d4a', h: 1, walk: false, foot: 1,    special: 'chaise', span: [2, 1] },
  { kind: 'peacock',   name: 'Peacock Throne', emoji: '🦚', cat: 'tier1', color: '#0e6f78', h: 3, walk: false, foot: 0.8,  special: 'peacock' },
  { kind: 'cloud',     name: 'Cloud Couch',  emoji: '☁️', cat: 'tier1', color: '#eef1f6', h: 1, walk: false, foot: 1,    special: 'cloud', span: [2, 1] },
  { kind: 'pit',       name: 'Round Couch',  emoji: '🛋️', cat: 'tier1', color: '#caa24a', h: 1, walk: false, foot: 1,    special: 'pit' },
  { kind: 'lavalux',   name: 'Lava Lamp XL', emoji: '🫧', cat: 'tier1', color: '#ff4ea8', h: 2, walk: false, foot: 0.5,  special: 'lavalamp' },
  { kind: 'aquarium',  name: 'Aquarium',     emoji: '🐠', cat: 'tier1', color: '#1a7896', h: 2, walk: false, foot: 0.9,  special: 'aquarium' },
  { kind: 'fireplace', name: 'Fireplace',    emoji: '🔥', cat: 'tier1', color: '#8a8a92', h: 2, walk: false, foot: 0.9,  special: 'fireplace' },
  { kind: 'coluna_gr', name: 'Greek Column', emoji: '🏛️', cat: 'tier1', color: '#e8e8ee', h: 4, walk: false, foot: 0.5,  special: 'greekcol' },
  { kind: 'arco_gr',   name: 'Greek Arch',  emoji: '🏛️', cat: 'tier1', color: '#e8e8ee', h: 3, walk: true,  foot: 1,    special: 'arch', span: [3, 1] },
  // construção (walkable build pieces + solid walls)
  { kind: 'bloco',      name: 'Block',     emoji: '🧊', cat: 'constr', color: '#303048', h: 1, walk: false, foot: 1 },
  { kind: 'meio',       name: 'Cube',      emoji: '🔲', cat: 'constr', color: '#45455f', h: 1, walk: false, foot: 0.7 },
  { kind: 'plataforma',        name: 'Platform',        emoji: '⬛', cat: 'constr', color: '#303048', h: 1, walk: true, foot: 1 },
  { kind: 'block-gold',   name: 'Block Gold Line',   emoji: '🟫', cat: 'constr', color: '#303048', h: 1, walk: false, foot: 1, special: 'goldblock' },
  { kind: 'block-cream',  name: 'Block Cream',  emoji: '⬜', cat: 'constr', color: '#f0ece0', h: 1, walk: false, foot: 1 },
  { kind: 'block-yellow', name: 'Block Yellow', emoji: '🟨', cat: 'constr', color: '#f5e876', h: 1, walk: false, foot: 1 },
  { kind: 'block-blue',   name: 'Block Blue',   emoji: '🟦', cat: 'constr', color: '#89b4dc', h: 1, walk: false, foot: 1 },
  { kind: 'block-red',    name: 'Block Red',    emoji: '🟥', cat: 'constr', color: '#cc3333', h: 1, walk: false, foot: 1 },
  { kind: 'escada',     name: 'Stairs',    emoji: '🪜', cat: 'constr', color: '#4a4a66', h: 1, walk: true,  foot: 1, special: 'stair' },
  { kind: 'rampa',      name: 'Ramp',      emoji: '📐', cat: 'constr', color: '#40405a', h: 1, walk: true,  foot: 1, special: 'stair' },
  { kind: 'pilar',      name: 'Pillar',    emoji: '🏛️', cat: 'constr', color: '#2e2e3e', h: 2, walk: false, foot: 0.55 },
  { kind: 'parede',     name: 'Wall',      emoji: '🧱', cat: 'constr', color: '#3a2e2e', h: 2, walk: false, foot: 1, special: 'wall' },
  { kind: 'cerca',      name: 'Fence',     emoji: '🚧', cat: 'constr', color: '#6a5a2a', h: 1, walk: false, foot: 1, special: 'wall' },
  { kind: 'corrimao',   name: 'Railing',   emoji: '🪜', cat: 'constr', color: '#cfd6e0', h: 1, walk: false, foot: 0.5, special: 'ladder' },
  // ── Building kit (houses): walkable floor blocks + solid walls in marble/wood/metal, doors, windows, roof ──
  { kind: 'blk_marble', name: 'Marble Block', emoji: '⬜', cat: 'constr', color: '#d8d4c8', h: 1, walk: false, foot: 1 },
  { kind: 'blk_wood',   name: 'Wood Block',   emoji: '🟫', cat: 'constr', color: '#8a5a32', h: 1, walk: false, foot: 1 },
  { kind: 'blk_metal',  name: 'Metal Block',  emoji: '⬛', cat: 'constr', color: '#9aa3b0', h: 1, walk: false, foot: 1 },
  { kind: 'wall_marble',name: 'Marble Wall',  emoji: '🧱', cat: 'constr', color: '#d8d4c8', h: 2, walk: false, foot: 1, special: 'wall' },
  { kind: 'wall_wood',  name: 'Wood Wall',    emoji: '🧱', cat: 'constr', color: '#8a5a32', h: 2, walk: false, foot: 1, special: 'wall' },
  { kind: 'wall_metal', name: 'Metal Wall',   emoji: '🧱', cat: 'constr', color: '#9aa3b0', h: 2, walk: false, foot: 1, special: 'wall' },
  { kind: 'door',       name: 'Door',         emoji: '🚪', cat: 'constr', color: '#8a5a32', h: 2, walk: false, foot: 1, special: 'door', pass: true },
  { kind: 'window',     name: 'Window',       emoji: '🪟', cat: 'constr', color: '#cfd6e0', h: 2, walk: false, foot: 1, special: 'window' },
  { kind: 'roof',       name: 'Roof',         emoji: '🛖', cat: 'constr', color: '#9c3a2e', h: 1, walk: false, foot: 1, special: 'roof', pass: true },
  { kind: 'blk_lava',   name: 'Lava Block',   emoji: '🌋', cat: 'constr', color: '#e0531e', h: 1, walk: true,  foot: 1, special: 'lavablock' },
  { kind: 'blk_void',   name: 'Void Block',   emoji: '🕳️', cat: 'constr', color: '#04040a', h: 1, walk: true,  foot: 1, special: 'voidblock' },
  { kind: 'blk_glass',  name: 'Glass Block',  emoji: '🧊', cat: 'constr', color: '#bfe6ff', h: 1, walk: false, foot: 1 },
  { kind: 'blk_brick',  name: 'Brick Block',  emoji: '🧱', cat: 'constr', color: '#a3503a', h: 1, walk: false, foot: 1 },
  { kind: 'blk_stone',  name: 'Stone Block',  emoji: '🪨', cat: 'constr', color: '#8a8f98', h: 1, walk: false, foot: 1 },
  { kind: 'wall_brick', name: 'Brick Wall',   emoji: '🧱', cat: 'constr', color: '#a3503a', h: 2, walk: false, foot: 1, special: 'wall' },
  { kind: 'wall_stone', name: 'Stone Wall',   emoji: '🧱', cat: 'constr', color: '#8a8f98', h: 2, walk: false, foot: 1, special: 'wall' },
  { kind: 'wall_glass', name: 'Glass Wall',   emoji: '🪟', cat: 'constr', color: '#bfe6ff', h: 2, walk: false, foot: 1, special: 'wall' },
  { kind: 'pillar_stone',name: 'Stone Pillar',emoji: '🏛️', cat: 'constr', color: '#b8bcc4', h: 3, walk: false, foot: 0.5, special: 'wall' },
  { kind: 'roof_slate', name: 'Slate Roof',   emoji: '🛖', cat: 'constr', color: '#4a5560', h: 1, walk: false, foot: 1, special: 'roof', pass: true },
  { kind: 'roof_thatch',name: 'Thatch Roof',  emoji: '🛖', cat: 'constr', color: '#c79a52', h: 1, walk: false, foot: 1, special: 'roof', pass: true },
  { kind: 'roof_black', name: 'Black Roof',   emoji: '🛖', cat: 'constr', color: '#1a1a1a', h: 1, walk: false, foot: 1, special: 'roof', pass: true },
  { kind: 'roof_blue',  name: 'Blue Roof',    emoji: '🛖', cat: 'constr', color: '#1e4db7', h: 1, walk: false, foot: 1, special: 'roof', pass: true },
  { kind: 'roof_white', name: 'White Roof',   emoji: '🛖', cat: 'constr', color: '#e8e8e8', h: 1, walk: false, foot: 1, special: 'roof', pass: true },
  { kind: 'roof_green', name: 'Green Roof',   emoji: '🛖', cat: 'constr', color: '#2a7a3b', h: 1, walk: false, foot: 1, special: 'roof', pass: true },
  // ── More doors (rotatable, walk-through) — material + shape variants ──
  { kind: 'door_metal', name: 'Metal Door',   emoji: '🚪', cat: 'constr', color: '#9aa3b0', h: 2, walk: false, foot: 1, special: 'door', pass: true },
  { kind: 'door_stone', name: 'Stone Door',   emoji: '🚪', cat: 'constr', color: '#8a8f98', h: 2, walk: false, foot: 1, special: 'door', pass: true },
  { kind: 'door_glass', name: 'Glass Door',   emoji: '🚪', cat: 'constr', color: '#bfe6ff', h: 2, walk: false, foot: 1, special: 'door', pass: true },
  { kind: 'door_arch',  name: 'Arch Door',    emoji: '🚪', cat: 'constr', color: '#8a5a32', h: 2, walk: false, foot: 1, special: 'door', pass: true },
  { kind: 'door_double',name: 'Double Door',  emoji: '🚪', cat: 'constr', color: '#8a5a32', h: 2, walk: false, foot: 1, special: 'door', pass: true },
  // ── Full-block doors + 2-tile-wide gates (walk-through; the opening fills the block / a whole 2-wide span) ──
  { kind: 'door_full',  name: 'Full Door',    emoji: '🚪', cat: 'constr', color: '#8a5a32', h: 2, walk: false, foot: 1, special: 'door', pass: true },
  { kind: 'door_full_stone', name: 'Full Stone Door', emoji: '🚪', cat: 'constr', color: '#8a8f98', h: 2, walk: false, foot: 1, special: 'door', pass: true },
  { kind: 'gate',       name: 'Gate (2-wide)', emoji: '🚪', cat: 'constr', color: '#8a5a32', h: 2, walk: false, foot: 1, special: 'gate', pass: true, span: [2, 1] },
  { kind: 'gate_stone', name: 'Stone Gate (2-wide)', emoji: '🏰', cat: 'constr', color: '#8a8f98', h: 3, walk: false, foot: 1, special: 'gate', pass: true, span: [2, 1] },
  { kind: 'gate_metal', name: 'Metal Gate (2-wide)', emoji: '🚪', cat: 'constr', color: '#9aa3b0', h: 2, walk: false, foot: 1, special: 'gate', pass: true, span: [2, 1] },
  // ── More windows (rotatable) — material + shape variants ──
  { kind: 'window_wood',name: 'Wood Window',  emoji: '🪟', cat: 'constr', color: '#8a5a32', h: 2, walk: false, foot: 1, special: 'window' },
  { kind: 'window_metal',name:'Metal Window', emoji: '🪟', cat: 'constr', color: '#9aa3b0', h: 2, walk: false, foot: 1, special: 'window' },
  { kind: 'window_round',name:'Porthole',     emoji: '🪟', cat: 'constr', color: '#9aa3b0', h: 2, walk: false, foot: 1, special: 'window' },
  { kind: 'window_arch',name: 'Arch Window',  emoji: '🪟', cat: 'constr', color: '#cfd6e0', h: 2, walk: false, foot: 1, special: 'window' },
  // pisos / tapetes (walkable, 1-high — carpets have height!)
  { kind: 'tap_red',  name: 'Rug',     emoji: '🟥', cat: 'tapetes', color: '#b3242e', h: 0, walk: true, foot: 1, special: 'rug' },
  { kind: 'tap_blu',  name: 'Rug',     emoji: '🟦', cat: 'tapetes', color: '#2452b3', h: 0, walk: true, foot: 1, special: 'rug' },
  { kind: 'tap_grn',  name: 'Rug',     emoji: '🟩', cat: 'tapetes', color: '#1ea64a', h: 0, walk: true, foot: 1, special: 'rug' },
  { kind: 'tap_pur',  name: 'Rug',     emoji: '🟪', cat: 'tapetes', color: '#8a44cc', h: 0, walk: true, foot: 1, special: 'rug' },
  { kind: 'relva',    name: 'Grass',   emoji: '🌿', cat: 'tapetes', color: '#2e7d32', h: 0, walk: true, foot: 1, special: 'rug' },
  { kind: 'agua',     name: 'Water',   emoji: '💧', cat: 'tapetes', color: '#1d6fb3', h: 0, walk: true, foot: 1, special: 'water' },
  { kind: 'gelo',     name: 'Ice',     emoji: '🧊', cat: 'tapetes', color: '#aee3ff', h: 0, walk: true, foot: 1, special: 'rug' },
  { kind: 'lava',     name: 'Lava',    emoji: '🌋', cat: 'tapetes', color: '#d23a1a', h: 0, walk: true, foot: 1, special: 'water' },
  { kind: 'xadrez',   name: 'Checker', emoji: '♟️', cat: 'tapetes', color: '#2a2a36', h: 0, walk: true, foot: 1, special: 'rug' },
  // assentos
  { kind: 'cadeira',  name: 'Chair',    emoji: '🪑', cat: 'assentos', color: '#6a5436', h: 1, walk: false, foot: 0.7, special: 'chair' },
  { kind: 'poltrona', name: 'Armchair', emoji: '💺', cat: 'assentos', color: '#5a4080', h: 1, walk: false, foot: 0.8, special: 'sofa' },
  { kind: 'sofa',     name: 'Couch',    emoji: '🛋️', cat: 'assentos', color: '#4a3768', h: 1, walk: false, foot: 1,   special: 'sofa' },
  { kind: 'sofahc',   name: 'HC Couch',  emoji: '👑', cat: 'assentos', color: '#ffd23a', h: 1, walk: false, foot: 1,   special: 'sofa' },
  { kind: 'banco',    name: 'Stool',    emoji: '🪑', cat: 'assentos', color: '#6a6a76', h: 1, walk: false, foot: 0.6, special: 'stool' },
  { kind: 'trono',    name: 'Throne',   emoji: '👑', cat: 'assentos', color: '#7a1aaa', h: 2, walk: false, foot: 0.8, special: 'throne' },
  { kind: 'puff',     name: 'Pouffe',   emoji: '🟢', cat: 'assentos', color: '#1ED760', h: 1, walk: false, foot: 0.7, special: 'puff' },
  { kind: 'banco_jd', name: 'Garden Bench', emoji: '🪑', cat: 'assentos', color: '#5a6e44', h: 1, walk: false, foot: 1, special: 'bench', span: [2, 1] },
  { kind: 'banco_red', name: 'Park Bench (Red)', emoji: '🪑', cat: 'assentos', color: '#8a2e2e', h: 1, walk: false, foot: 1, special: 'bench', span: [2, 1] },
  { kind: 'banco_wht', name: 'Park Bench (White)', emoji: '🪑', cat: 'assentos', color: '#dfe3ea', h: 1, walk: false, foot: 1, special: 'bench', span: [2, 1] },
  { kind: 'woodbench', name: 'Wooden Bench', emoji: '🪑', cat: 'assentos', color: '#7a5230', h: 1, walk: false, foot: 1, special: 'woodbench', span: [2, 1] },
  { kind: 'stonebench',name: 'Stone Bench', emoji: '🪑', cat: 'assentos', color: '#8a8a92', h: 1, walk: false, foot: 1, special: 'stonebench', span: [2, 1] },
  { kind: 'modernbench',name:'Modern Bench', emoji: '🪑', cat: 'assentos', color: '#3a4450', h: 1, walk: false, foot: 1, special: 'modernbench', span: [2, 1] },
  { kind: 'espreguic',name: 'Sun Lounger', emoji: '🏖️', cat: 'assentos', color: '#e6ebf2', h: 1, walk: false, foot: 1, special: 'lounger', span: [2, 1] },
  { kind: 'cama_dossel', name: 'Canopy Bed', emoji: '🛏️', cat: 'assentos', color: '#6a3a52', h: 2, walk: false, foot: 1, special: 'canopy', span: [2, 1] },
  { kind: 'ovo',      name: 'Egg Chair', emoji: '🥚', cat: 'assentos', color: '#eef0f4', h: 2, walk: false, foot: 0.7, special: 'eggchair' },
  // mesas
  { kind: 'mesa',     name: 'Table',     emoji: '🟫', cat: 'mesas', color: '#7a542a', h: 1, walk: false, foot: 0.9, special: 'table' },
  { kind: 'mesajant', name: 'Dining',    emoji: '🍽️', cat: 'mesas', color: '#6a441a', h: 1, walk: false, foot: 1,   special: 'table' },
  { kind: 'mesacafe', name: 'Coffee',    emoji: '☕', cat: 'mesas', color: '#4a3a2a', h: 1, walk: false, foot: 0.8, special: 'table' },
  { kind: 'mesa_wht', name: 'White Table',emoji: '⬜', cat: 'mesas', color: '#dfe3ea', h: 1, walk: false, foot: 0.9, special: 'table' },
  { kind: 'mesa_blk', name: 'Black Table',emoji: '⬛', cat: 'mesas', color: '#26282e', h: 1, walk: false, foot: 0.9, special: 'table' },
  { kind: 'mesa_red', name: 'Red Table',  emoji: '🟥', cat: 'mesas', color: '#8a2e2e', h: 1, walk: false, foot: 0.9, special: 'table' },
  { kind: 'mesa_teal',name: 'Teal Table', emoji: '🟦', cat: 'mesas', color: '#2e6e6a', h: 1, walk: false, foot: 0.9, special: 'table' },
  { kind: 'mesa_gold',name: 'Gold Table', emoji: '🟨', cat: 'mesas', color: '#b89030', h: 1, walk: false, foot: 0.9, special: 'table' },
  { kind: 'roundtable',name:'Round Table', emoji: '🟤', cat: 'mesas', color: '#6a441a', h: 1, walk: false, foot: 1,   special: 'roundtable' },
  { kind: 'glasstable',name:'Glass Table', emoji: '🪟', cat: 'mesas', color: '#9aa0ac', h: 1, walk: false, foot: 1,   special: 'glasstable', span: [2, 1] },
  { kind: 'bar',      name: 'Bar',       emoji: '🍹', cat: 'mesas', color: '#3a2c34', h: 2, walk: false, foot: 1,   special: 'bartop', span: [2, 1] },
  { kind: 'rececao',  name: 'Reception', emoji: '🛎️', cat: 'mesas', color: '#6b4a2c', h: 2, walk: false, foot: 1,   special: 'reception', span: [3, 1] },
  { kind: 'prat',     name: 'Shelf',     emoji: '📚', cat: 'mesas', color: '#4a3420', h: 2, walk: false, foot: 0.6, special: 'shelf' },
  // plantas
  { kind: 'planta',   name: 'Plant',    emoji: '🪴', cat: 'plantas', color: '#8a4f2a', h: 1, walk: false, foot: 0.7, special: 'plant' },
  { kind: 'cato',     name: 'Cactus',   emoji: '🌵', cat: 'plantas', color: '#8a4f2a', h: 1, walk: false, foot: 0.6, special: 'plant' },
  { kind: 'bonsai',   name: 'Bonsai',   emoji: '🎍', cat: 'plantas', color: '#8a4f2a', h: 1, walk: false, foot: 0.7, special: 'plant' },
  { kind: 'arvore',   name: 'Tree',     emoji: '🌳', cat: 'plantas', color: '#6a4326', h: 3, walk: false, foot: 0.85, special: 'tree' },
  { kind: 'palmeira', name: 'Palm',     emoji: '🌴', cat: 'plantas', color: '#7a5230', h: 3, walk: false, foot: 0.7, special: 'palm' },
  { kind: 'flores',   name: 'Flowers',  emoji: '🌷', cat: 'plantas', color: '#f4f4f4', h: 1, walk: false, foot: 0.6, special: 'flores' },
  { kind: 'topiary',  name: 'Topiary',  emoji: '🌳', cat: 'plantas', color: '#2a8a44', h: 2, walk: false, foot: 0.7, special: 'topiary' },
  { kind: 'sakura',   name: 'Sakura',   emoji: '🌸', cat: 'plantas', color: '#ff9ec7', h: 3, walk: false, foot: 0.9, special: 'sakura' },
  { kind: 'bonsai_lux', name: 'Luxe Bonsai', emoji: '🎋', cat: 'plantas', color: '#2f9a4c', h: 1, walk: false, foot: 0.7, special: 'bonsai_lux' },
  { kind: 'pine',       name: 'Pine Tree',   emoji: '🌲', cat: 'plantas', color: '#5a3a1a', h: 3, walk: false, foot: 0.6, special: 'pine' },
  { kind: 'hedge',      name: 'Hedge',       emoji: '🌿', cat: 'plantas', color: '#2a7a3a', h: 1, walk: false, foot: 1,   special: 'hedge' },
  { kind: 'shrub',      name: 'Shrub',       emoji: '🌿', cat: 'plantas', color: '#2a6a36', h: 1, walk: false, foot: 0.8, special: 'shrub' },
  { kind: 'oak',        name: 'Oak Tree',    emoji: '🌳', cat: 'plantas', color: '#5a3a18', h: 3, walk: false, foot: 0.9, special: 'oak' },
  { kind: 'hyacinth',   name: 'Hyacinths',   emoji: '💐', cat: 'plantas', color: '#9b59d0', h: 1, walk: false, foot: 0.8, special: 'wildflower' },
  { kind: 'tulip',      name: 'Tulips',      emoji: '🌷', cat: 'plantas', color: '#c8253c', h: 1, walk: false, foot: 0.8, special: 'wildflower' },
  { kind: 'sunflower',  name: 'Sunflowers',  emoji: '🌻', cat: 'plantas', color: '#f9ca24', h: 1, walk: false, foot: 0.8, special: 'wildflower' },
  { kind: 'poppy',      name: 'Poppies',     emoji: '🌺', cat: 'plantas', color: '#c81a28', h: 1, walk: false, foot: 0.8, special: 'wildflower' },
  { kind: 'violet',     name: 'Violets',     emoji: '🌸', cat: 'plantas', color: '#7b1fa2', h: 1, walk: false, foot: 0.8, special: 'wildflower' },
  { kind: 'buttercup',  name: 'Buttercups',  emoji: '🌼', cat: 'plantas', color: '#fdd835', h: 1, walk: false, foot: 0.8, special: 'wildflower' },
  { kind: 'rose',       name: 'Roses',       emoji: '🌹', cat: 'plantas', color: '#b71c2e', h: 1, walk: false, foot: 0.8, special: 'wildflower' },
  { kind: 'lily',       name: 'Lilies',      emoji: '🌷', cat: 'plantas', color: '#f0ece8', h: 1, walk: false, foot: 0.8, special: 'wildflower' },
  // luzes
  { kind: 'candeeiro',name: 'Lamp',     emoji: '💡', cat: 'luzes', color: '#ffe65c', h: 2, walk: false, foot: 0.4, special: 'lamp' },
  { kind: 'neon',     name: 'Neon',     emoji: '🔆', cat: 'luzes', color: '#ff44aa', h: 1, walk: false, foot: 0.8, special: 'lamp' },
  { kind: 'disco',    name: 'Disco Ball',emoji: '🪩', cat: 'luzes', color: '#cfd6ff', h: 0, walk: false, foot: 1, special: 'disco', pass: true },
  { kind: 'holofote', name: 'Spotlight', emoji: '🔦', cat: 'luzes', color: '#ffffff', h: 1, walk: false, foot: 0.5, special: 'lamp' },
  { kind: 'lavalamp', name: 'Lava Lamp',emoji: '🟣', cat: 'luzes', color: '#cc44ff', h: 2, walk: false, foot: 0.4, special: 'lavalamp' },
  { kind: 'tocha',    name: 'Torch',    emoji: '🔥', cat: 'luzes', color: '#ff8800', h: 1, walk: false, foot: 0.4, special: 'lamp' },
  { kind: 'lanterna', name: 'Lantern',  emoji: '🏮', cat: 'luzes', color: '#ffcf7a', h: 1, walk: false, foot: 0.3, special: 'lantern' },
  { kind: 'lustre',   name: 'Chandelier', emoji: '🛋️', cat: 'luzes', color: '#ffd98a', h: 0, walk: false, foot: 0.5, special: 'chandelier', pass: true },
  { kind: 'lamp_cyan',name: 'Cyan Lamp',  emoji: '🔵', cat: 'luzes', color: '#00cfff', h: 2, walk: false, foot: 0.4, special: 'lamp' },
  { kind: 'lamp_grn', name: 'Green Lamp', emoji: '🟢', cat: 'luzes', color: '#1ED760', h: 2, walk: false, foot: 0.4, special: 'lamp' },
  { kind: 'neon_blue',name: 'Blue Neon',  emoji: '🟦', cat: 'luzes', color: '#3a7bd0', h: 1, walk: false, foot: 0.8, special: 'lamp' },
  { kind: 'neon_grn', name: 'Green Neon', emoji: '🟩', cat: 'luzes', color: '#1ED760', h: 1, walk: false, foot: 0.8, special: 'lamp' },
  { kind: 'floorlamp',name: 'Floor Lamp', emoji: '🛋️', cat: 'luzes', color: '#f0d890', h: 3, walk: false, foot: 0.5, special: 'floorlamp' },
  { kind: 'candle',   name: 'Candles',    emoji: '🕯️', cat: 'luzes', color: '#f0e6d2', h: 1, walk: false, foot: 0.4, special: 'candle' },
  { kind: 'firepit',  name: 'Fire Pit',   emoji: '🔥', cat: 'luzes', color: '#6a6a72', h: 1, walk: false, foot: 0.9, special: 'firepit' },
  // eletrónica
  { kind: 'tv',       name: 'TV',       emoji: '📺', cat: 'electro', color: '#15151f', h: 1, walk: false, foot: 1, special: 'tv' },
  { kind: 'coluna',   name: 'Speaker',  emoji: '🔈', cat: 'electro', color: '#23232f', h: 2, walk: false, foot: 0.7, special: 'speaker' },
  { kind: 'arcade',   name: 'Arcade',   emoji: '🕹️', cat: 'electro', color: '#2a1a4a', h: 2, walk: false, foot: 0.8, special: 'tv' },
  { kind: 'frigo',    name: 'Fridge',   emoji: '🧊', cat: 'electro', color: '#cdd6e0', h: 2, walk: false, foot: 0.7, special: 'fridge' },
  { kind: 'vending',  name: 'Vending Machine', emoji: '🥤', cat: 'electro', color: '#b3242e', h: 2, walk: false, foot: 0.7, special: 'vending' },
  { kind: 'pc',       name: 'Laptop',   emoji: '💻', cat: 'electro', color: '#3a3f4e', h: 1, walk: false, foot: 0.6, special: 'laptop' },
  { kind: 'pa',       name: 'Torre PA', emoji: '🔊', cat: 'electro', color: '#1a1a22', h: 3, walk: false, foot: 0.62, special: 'pa' },
  { kind: 'booth',    name: 'DJ Booth', emoji: '🎧', cat: 'electro', color: '#1b1b26', h: 2, walk: false, foot: 1, special: 'booth', span: [2, 1] },
  // decoração
  { kind: 'cartaz',   name: 'Poster',   emoji: '🪧', cat: 'deco', color: '#16161f', h: 1, walk: false, foot: 0.7, special: 'sign' },
  { kind: 'quadro',   name: 'Painting', emoji: '🖼️', cat: 'deco', color: '#caa24a', h: 1, walk: false, foot: 0.6, special: 'frame' },
  { kind: 'trofeu',   name: 'Trophy',   emoji: '🏆', cat: 'deco', color: '#ffd700', h: 1, walk: false, foot: 0.4, special: 'trophy' },
  { kind: 'vaso',     name: 'Vase',     emoji: '🏺', cat: 'deco', color: '#c4632e', h: 1, walk: false, foot: 0.5, special: 'vase' },
  { kind: 'pato',     name: 'Duckling', emoji: '🦆', cat: 'deco', color: '#ffd23a', h: 1, walk: false, foot: 0.4, special: 'duck' },
  { kind: 'cone',     name: 'Cone',     emoji: '🚧', cat: 'deco', color: '#ff6a00', h: 1, walk: false, foot: 0.4, special: 'cone' },
  { kind: 'estatua',  name: 'Statue',   emoji: '🗿', cat: 'deco', color: '#9a9aa6', h: 2, walk: false, foot: 0.6, special: 'statue' },
  { kind: 'torii',    name: 'Torii',    emoji: '⛩️', cat: 'deco', color: '#e8492f', h: 3, walk: true,  foot: 1, special: 'torii', span: [3, 1] },
  { kind: 'pagoda',   name: 'Pagoda',   emoji: '🏯', cat: 'deco', color: '#d8402a', h: 4, walk: false, foot: 0.8, special: 'pagoda' },
  { kind: 'toro',     name: 'Stone Lantern', emoji: '🏮', cat: 'deco', color: '#b8b8b0', h: 2, walk: false, foot: 0.5, special: 'toro' },
  { kind: 'fonte',    name: 'Fountain', emoji: '⛲', cat: 'deco', color: '#c8ccd4', h: 1, walk: false, foot: 0.9, special: 'fountain' },
  { kind: 'poste',    name: 'VIP Rope', emoji: '🪢', cat: 'deco', color: '#caa24a', h: 0, walk: false, foot: 0.3, special: 'rope', span: [3, 1] },
  { kind: 'boia',     name: 'Float',    emoji: '🛟', cat: 'deco', color: '#ff5a5a', h: 0, walk: true,  foot: 0.6, special: 'float' },
  { kind: 'parasol',  name: 'Parasol',  emoji: '⛱️', cat: 'deco', color: '#e23b46', h: 2, walk: false, foot: 0.8, special: 'parasol' },
  { kind: 'banner',   name: 'Banner',   emoji: '🎌', cat: 'deco', color: '#7a1020', h: 0, walk: true, foot: 0.4, special: 'banner' },
  { kind: 'leaders',  name: 'Trump & Putin', emoji: '🤝', cat: 'deco', color: '#22314f', h: 2, walk: false, foot: 1, special: 'leaders', span: [2, 1] },
  // ★ Italian Brainrot — café gear + the iconic AI-meme characters
  { kind: 'espresso',   name: 'Espresso Bar',           emoji: '☕', cat: 'brainrot', color: '#c8ccd4', h: 2, walk: false, foot: 0.6, special: 'espresso' },
  { kind: 'cappuccino', name: 'Cappuccino',             emoji: '☕', cat: 'brainrot', color: '#f4efe6', h: 1, walk: false, foot: 0.5, special: 'cappuccino' },
  { kind: 'pizza',      name: 'Pizza',                  emoji: '🍕', cat: 'brainrot', color: '#f2c84b', h: 1, walk: false, foot: 0.6, special: 'pizza' },
  { kind: 'vespa',      name: 'Vespa',                  emoji: '🛵', cat: 'brainrot', color: '#4aa3a0', h: 1, walk: false, foot: 1,   special: 'vespa' },
  { kind: 'tralalero',  name: 'Tralalero Tralala',      emoji: '🦈', cat: 'brainrot', color: '#5aa9d6', h: 2, walk: false, foot: 0.6, special: 'tralalero' },
  { kind: 'bombardiro', name: 'Bombardiro Crocodilo',   emoji: '🐊', cat: 'brainrot', color: '#3f6b3a', h: 2, walk: false, foot: 1,   special: 'bombardiro' },
  { kind: 'ballerina',  name: 'Ballerina Cappuccina',   emoji: '🩰', cat: 'brainrot', color: '#f4b8d0', h: 2, walk: false, foot: 0.5, special: 'ballerina' },
  { kind: 'tungtung',   name: 'Tung Tung Sahur',        emoji: '🪵', cat: 'brainrot', color: '#9a6b3f', h: 2, walk: false, foot: 0.5, special: 'tungtung' },
  { kind: 'lirili',     name: 'Lirilì Larilà',          emoji: '🌵', cat: 'brainrot', color: '#3a8f4a', h: 2, walk: false, foot: 0.6, special: 'lirili' },
  { kind: 'patapim',    name: 'Brr Brr Patapim',        emoji: '🐵', cat: 'brainrot', color: '#6a4a2c', h: 2, walk: false, foot: 0.6, special: 'patapim' },
  { kind: 'bananini',   name: 'Chimpanzini Bananini',   emoji: '🍌', cat: 'brainrot', color: '#f4c430', h: 2, walk: false, foot: 0.5, special: 'bananini' },
  // Home — rotatable iso furniture for building real rooms
  { kind: 'bed',      name: 'Double Bed',        emoji: '🛏️', cat: 'home', color: '#6b4a2c', h: 1, walk: false, foot: 1,   special: 'bed', span: [2, 2] },
  { kind: 'wardrobe', name: 'Wardrobe',          emoji: '🚪', cat: 'home', color: '#5a3f28', h: 3, walk: false, foot: 0.5, special: 'wardrobe' },
  { kind: 'bookcase', name: 'Bookcase',          emoji: '📚', cat: 'home', color: '#6a4a2e', h: 2, walk: false, foot: 0.6, special: 'bookcase' },
  { kind: 'desk',     name: 'Desk',              emoji: '🖥️', cat: 'home', color: '#7a5230', h: 1, walk: false, foot: 1,   special: 'desk', span: [2, 1] },
  { kind: 'kitchen',  name: 'Kitchen Counter',   emoji: '🚰', cat: 'home', color: '#3a4450', h: 2, walk: false, foot: 1,   special: 'kitchen', span: [2, 1] },
  { kind: 'bathtub',  name: 'Bathtub',           emoji: '🛁', cat: 'home', color: '#eef1f6', h: 1, walk: false, foot: 1,   special: 'bathtub', span: [2, 1] },
  { kind: 'clock',    name: 'Grandfather Clock', emoji: '🕰️', cat: 'home', color: '#5a3f28', h: 3, walk: false, foot: 0.4, special: 'clock' },
  { kind: 'dresser',  name: 'Dresser',           emoji: '🗄️', cat: 'home', color: '#6b4a2c', h: 1, walk: false, foot: 1,   special: 'dresser', span: [2, 1] },
  // Gym — rotatable fitness gear
  { kind: 'treadmill',  name: 'Treadmill',       emoji: '🏃', cat: 'gym', color: '#2a2e36', h: 1, walk: false, foot: 1,   special: 'treadmill', span: [1, 2] },
  { kind: 'weightbench',name: 'Weight Bench',    emoji: '🏋️', cat: 'gym', color: '#b3242e', h: 1, walk: false, foot: 1,   special: 'weightbench', span: [1, 2] },
  { kind: 'heavybag',   name: 'Punching Bag',    emoji: '🥊', cat: 'gym', color: '#8a2e2e', h: 2, walk: false, foot: 0.7, special: 'heavybag' },
  { kind: 'dumbbells',  name: 'Dumbbell Rack',   emoji: '🏋️', cat: 'gym', color: '#3a3e46', h: 1, walk: false, foot: 1,   special: 'dumbbells' },
  { kind: 'exbike',     name: 'Exercise Bike',   emoji: '🚲', cat: 'gym', color: '#2a2e36', h: 1, walk: false, foot: 1,   special: 'exbike', span: [1, 2] },
  { kind: 'locker',     name: 'Lockers',         emoji: '🔒', cat: 'gym', color: '#3f6b8a', h: 3, walk: false, foot: 0.6, special: 'locker' },
  // Outdoor — rotatable patio / garden gear
  { kind: 'bbq',        name: 'BBQ Grill',       emoji: '🍖', cat: 'outdoor', color: '#2a2e36', h: 1, walk: false, foot: 0.7, special: 'bbq' },
  { kind: 'picnictable',name: 'Picnic Table',    emoji: '🧺', cat: 'outdoor', color: '#7a5230', h: 1, walk: false, foot: 1,   special: 'picnictable', span: [2, 1] },
  { kind: 'hottub',     name: 'Hot Tub',         emoji: '♨️', cat: 'outdoor', color: '#6a4a2c', h: 1, walk: false, foot: 1,   special: 'hottub', span: [2, 2] },
  { kind: 'swingbench', name: 'Porch Swing',     emoji: '🪑', cat: 'outdoor', color: '#7a5230', h: 2, walk: false, foot: 1,   special: 'swingbench', span: [2, 1] },
  { kind: 'streetlamp', name: 'Street Lamp',     emoji: '💡', cat: 'outdoor', color: '#2a2e36', h: 4, walk: false, foot: 0.3, special: 'streetlamp' },
  { kind: 'mailbox',    name: 'Mailbox',         emoji: '📫', cat: 'outdoor', color: '#3f6b8a', h: 1, walk: false, foot: 0.3, special: 'mailbox' },
  { kind: 'fence_picket', name: 'Picket Fence',   emoji: '🏡', cat: 'outdoor', color: '#c8a060', h: 1.1, walk: false, foot: 1, special: 'fence_picket' },
  { kind: 'fence_picket_white', name: 'White Picket Fence', emoji: '🏡', cat: 'outdoor', color: '#e8ece8', h: 1.1, walk: false, foot: 1, special: 'fence_picket' },
  { kind: 'fence_iron',   name: 'Iron Fence',     emoji: '⚙️', cat: 'outdoor', color: '#2a2e3a', h: 1.4, walk: false, foot: 1, special: 'fence_iron' },
  { kind: 'fence_rail',   name: 'Rail Fence',     emoji: '🤠', cat: 'outdoor', color: '#8b6340', h: 1,   walk: false, foot: 1, special: 'fence_rail' },
  { kind: 'fence_solid',  name: 'Board Fence',    emoji: '🪵', cat: 'outdoor', color: '#7a5230', h: 1.1, walk: false, foot: 1, special: 'fence_solid' },
  // Studio — music gear
  { kind: 'drumkit',  name: 'Drum Kit',     emoji: '🥁', cat: 'studio', color: '#b3242e', h: 1, walk: false, foot: 1,   special: 'drumkit', span: [2, 1] },
  { kind: 'ampstack', name: 'Amp Stack',    emoji: '🔊', cat: 'studio', color: '#1b1b22', h: 2, walk: false, foot: 0.6, special: 'ampstack' },
  { kind: 'mixer',    name: 'Mixing Desk',  emoji: '🎛️', cat: 'studio', color: '#23232f', h: 1, walk: false, foot: 1,   special: 'mixer', span: [2, 1] },
  { kind: 'micstand', name: 'Mic Stand',    emoji: '🎤', cat: 'studio', color: '#2a2e36', h: 2, walk: false, foot: 0.4, special: 'micstand' },
  { kind: 'synth',    name: 'Synth',        emoji: '🎹', cat: 'studio', color: '#2a2e36', h: 1, walk: false, foot: 1,   special: 'synth', span: [2, 1] },
  { kind: 'vinyl',    name: 'Turntable',    emoji: '🎶', cat: 'studio', color: '#23232f', h: 1, walk: false, foot: 0.7, special: 'vinyl' },
  // Diner — retro food spot
  { kind: 'dinerbooth', name: 'Diner Booth',emoji: '🍽️', cat: 'diner', color: '#b3242e', h: 1, walk: false, foot: 1,   special: 'dinerbooth', span: [2, 1] },
  { kind: 'sodafount',  name: 'Soda Fountain',emoji: '🥤', cat: 'diner', color: '#c8ccd4', h: 2, walk: false, foot: 0.6, special: 'sodafount' },
  { kind: 'popcorn',    name: 'Popcorn Cart',emoji: '🍿', cat: 'diner', color: '#b3242e', h: 2, walk: false, foot: 0.7, special: 'popcorn' },
  { kind: 'icecream',   name: 'Ice Cream Freezer',emoji: '🍦', cat: 'diner', color: '#c8ccd4', h: 1, walk: false, foot: 1, special: 'icecream', span: [2, 1] },
  { kind: 'register',   name: 'Cash Register',emoji: '🧾', cat: 'diner', color: '#3a4450', h: 1, walk: false, foot: 0.5, special: 'register' },
  { kind: 'shakebar',   name: 'Shake Machine',emoji: '🥛', cat: 'diner', color: '#c8ccd4', h: 1, walk: false, foot: 0.5, special: 'shakebar' },
  // Bathroom
  { kind: 'toilet',   name: 'Toilet',       emoji: '🚽', cat: 'bath', color: '#eef1f6', h: 1, walk: false, foot: 0.5, special: 'toilet' },
  { kind: 'vanity',   name: 'Vanity Sink',  emoji: '🚰', cat: 'bath', color: '#3a4450', h: 1, walk: false, foot: 1,   special: 'vanity', span: [2, 1] },
  { kind: 'shower',   name: 'Shower',       emoji: '🚿', cat: 'bath', color: '#dfe3ea', h: 2, walk: false, foot: 1,   special: 'shower' },
  { kind: 'towelrail',name: 'Towel Rail',   emoji: '🧖', cat: 'bath', color: '#cfd6e2', h: 1, walk: false, foot: 0.5, special: 'towelrail' },
  { kind: 'washer',   name: 'Washing Machine',emoji: '🧺', cat: 'bath', color: '#dfe3ea', h: 1, walk: false, foot: 0.7, special: 'washer' },
  { kind: 'mirror',   name: 'Cheval Mirror',emoji: '🪞', cat: 'bath', color: '#6a4a2c', h: 2, walk: false, foot: 0.4, special: 'mirror' },
  // Office
  { kind: 'officechair',name: 'Office Chair',emoji: '🪑', cat: 'office', color: '#2a2e36', h: 1, walk: false, foot: 0.7, special: 'officechair' },
  { kind: 'filecab',  name: 'Filing Cabinet',emoji: '🗄️', cat: 'office', color: '#3a4450', h: 2, walk: false, foot: 0.6, special: 'filecab' },
  { kind: 'copier',   name: 'Photocopier',  emoji: '🖨️', cat: 'office', color: '#cfd2d8', h: 1, walk: false, foot: 0.8, special: 'copier' },
  { kind: 'watercooler',name: 'Water Cooler',emoji: '💧', cat: 'office', color: '#dfe3ea', h: 1, walk: false, foot: 0.4, special: 'watercooler' },
  { kind: 'whiteboard',name: 'Whiteboard',  emoji: '📋', cat: 'office', color: '#3a3e46', h: 2, walk: false, foot: 1,   special: 'whiteboard', span: [2, 1] },
  { kind: 'serverrack',name: 'Server Rack', emoji: '🖥️', cat: 'office', color: '#1a1c22', h: 2, walk: false, foot: 0.5, special: 'serverrack' },
  // Arcade / games
  { kind: 'pooltable',  name: 'Pool Table',  emoji: '🎱', cat: 'games', color: '#5a3f28', h: 1, walk: false, foot: 1,   special: 'pooltable', span: [2, 2] },
  { kind: 'foosball',   name: 'Foosball',    emoji: '⚽', cat: 'games', color: '#6a4a2e', h: 1, walk: false, foot: 1,   special: 'foosball', span: [2, 1] },
  { kind: 'clawmachine',name: 'Claw Machine',emoji: '🕹️', cat: 'games', color: '#b3242e', h: 2, walk: false, foot: 0.7, special: 'clawmachine' },
  { kind: 'pacman',     name: 'Pac Arcade',  emoji: '🟡', cat: 'games', color: '#f4c430', h: 2, walk: false, foot: 0.7, special: 'pacman' },
  { kind: 'retrocab',   name: 'Retro Arcade',emoji: '🕹️', cat: 'games', color: '#cc1a0a', h: 2, walk: false, foot: 0.7, special: 'retrocab' },
  { kind: 'duelcab',    name: 'Duel Cabinet',emoji: '⚔️', cat: 'games', color: '#7a1aaa', h: 2, walk: false, foot: 0.7, special: 'retrocab' },   // walk up → 1v1 Climb Race lobby (friendly or wager)
  { kind: 'arcsign',    name: 'Arcade Sign',  emoji: '🎰', cat: 'games', color: '#c41a0c', h: 3, walk: false, foot: 0.7, special: 'arcsign' },
  { kind: 'neonsign',   name: 'Neon Sign',    emoji: '💡', cat: 'games', color: '#2244dd', h: 2, walk: false, foot: 0.4, special: 'neonsign' },
  { kind: 'cashvault',  name: 'Prize Vault', emoji: '💰', cat: 'games', color: '#3a3e4a', h: 4, walk: false, foot: 0.7, special: 'cashvault' },
  { kind: 'pinball',    name: 'Pinball',     emoji: '🔴', cat: 'games', color: '#1b1b26', h: 1, walk: false, foot: 1,   special: 'pinball', span: [1, 2] },
  { kind: 'airhockey',  name: 'Air Hockey',  emoji: '🏒', cat: 'games', color: '#3a7bd0', h: 1, walk: false, foot: 1,   special: 'airhockey', span: [2, 1] },
  { kind: 'toychest',   name: 'Toy Chest',   emoji: '🧸', cat: 'games', color: '#6a4a2e', h: 1, walk: false, foot: 0.8, special: 'toychest' },
  // Café / Bar
  { kind: 'pastrycase', name: 'Pastry Case', emoji: '🧁', cat: 'cafe', color: '#3a4450', h: 1, walk: false, foot: 1,   special: 'pastrycase', span: [2, 1] },
  { kind: 'winerack',   name: 'Wine Rack',   emoji: '🍷', cat: 'cafe', color: '#5a3f28', h: 2, walk: false, foot: 0.6, special: 'winerack' },
  { kind: 'kegtap',     name: 'Beer Keg',    emoji: '🍺', cat: 'cafe', color: '#9aa0ac', h: 1, walk: false, foot: 0.5, special: 'kegtap' },
  { kind: 'cocktailcart',name: 'Bar Cart',   emoji: '🍹', cat: 'cafe', color: '#caa24a', h: 1, walk: false, foot: 1,   special: 'cocktailcart', span: [2, 1] },
  { kind: 'coffeebar',  name: 'Coffee Bar',  emoji: '☕', cat: 'cafe', color: '#5a3f28', h: 1, walk: false, foot: 1,   special: 'coffeebar', span: [2, 1] },
  { kind: 'bistro',     name: 'Bistro Table',emoji: '🪑', cat: 'cafe', color: '#2a2e36', h: 1, walk: false, foot: 0.6, special: 'bistro' },
  // Sci-Fi / Neon
  { kind: 'holopod',    name: 'Hologram Pod',emoji: '🛸', cat: 'scifi', color: '#00cfff', h: 0, walk: true,  foot: 1,   special: 'holopod' },
  { kind: 'teleporter', name: 'Teleporter',  emoji: '🌀', cat: 'scifi', color: '#cc44ff', h: 0, walk: true,  foot: 1,   special: 'teleporter' },
  { kind: 'neonarch',   name: 'Neon Arch',   emoji: '🌈', cat: 'scifi', color: '#ff44aa', h: 3, walk: true,  foot: 1,   special: 'neonarch', span: [3, 1] },
  { kind: 'plasmalamp', name: 'Plasma Lamp', emoji: '🔮', cat: 'scifi', color: '#cc44ff', h: 2, walk: false, foot: 0.4, special: 'plasmalamp' },
  { kind: 'console',    name: 'Control Console',emoji: '🖲️', cat: 'scifi', color: '#1a1c26', h: 1, walk: false, foot: 1, special: 'console', span: [2, 1] },
  { kind: 'cryopod',    name: 'Cryo Pod',    emoji: '🧊', cat: 'scifi', color: '#2a3340', h: 3, walk: false, foot: 0.5, special: 'cryopod' },
  // Beach / Pool
  { kind: 'tikibar',    name: 'Tiki Bar',    emoji: '🏝️', cat: 'beach', color: '#b5874a', h: 2, walk: false, foot: 1,   special: 'tikibar', span: [2, 1] },
  { kind: 'surfrack',   name: 'Surf Rack',   emoji: '🏄', cat: 'beach', color: '#6a4a2c', h: 3, walk: false, foot: 0.6, special: 'surfrack' },
  { kind: 'lifeguard',  name: 'Lifeguard Tower',emoji: '🛟', cat: 'beach', color: '#e8e2d0', h: 3, walk: false, foot: 0.7, special: 'lifeguard' },
  { kind: 'beachball',  name: 'Beach Ball',  emoji: '🏐', cat: 'beach', color: '#b3242e', h: 1, walk: false, foot: 0.5, special: 'beachball' },
  { kind: 'hammock',    name: 'Hammock',     emoji: '🌴', cat: 'beach', color: '#e07b1f', h: 1, walk: false, foot: 1,   special: 'hammock', span: [2, 1] },
  { kind: 'cooler',     name: 'Cooler',      emoji: '🧊', cat: 'beach', color: '#3a7bd0', h: 1, walk: false, foot: 0.6, special: 'cooler' },
  // Garage / Workshop
  { kind: 'workbench',  name: 'Workbench',   emoji: '🔧', cat: 'garage', color: '#7a5230', h: 1, walk: false, foot: 1,   special: 'workbench', span: [2, 1] },
  { kind: 'toolcab',    name: 'Tool Cabinet',emoji: '🧰', cat: 'garage', color: '#b3242e', h: 2, walk: false, foot: 0.6, special: 'toolcab' },
  { kind: 'tirestack',  name: 'Tire Stack',  emoji: '🛞', cat: 'garage', color: '#2a2a30', h: 1, walk: false, foot: 0.7, special: 'tirestack' },
  { kind: 'gaspump',    name: 'Gas Pump',    emoji: '⛽', cat: 'garage', color: '#b3242e', h: 2, walk: false, foot: 0.5, special: 'gaspump' },
  { kind: 'oildrum',    name: 'Oil Drum',    emoji: '🛢️', cat: 'garage', color: '#2e7d4a', h: 1, walk: false, foot: 0.5, special: 'oildrum' },
  { kind: 'welder',     name: 'Welding Cart',emoji: '🔥', cat: 'garage', color: '#3a3e46', h: 1, walk: false, foot: 0.5, special: 'welder' },
  // Splucci — high-end boutique (beige / black / white / brass): rails, racks, mannequins, fitting room, checkout
  { kind: 'clorack',   name: 'Round Rack',   emoji: '🧥', cat: 'boutique', color: '#bfa468', h: 2, walk: false, foot: 0.9, special: 'clorack' },
  { kind: 'clorail',   name: 'Clothing Rail', emoji: '👔', cat: 'boutique', color: '#bfa468', h: 2, walk: false, foot: 1, special: 'clorail', span: [2, 1] },
  { kind: 'mannequin', name: 'Mannequin',    emoji: '🧍', cat: 'boutique', color: '#d8cdb5', h: 2, walk: false, foot: 0.5, special: 'mannequin' },
  { kind: 'clotable',  name: 'Display Table', emoji: '🧣', cat: 'boutique', color: '#2a2620', h: 1, walk: false, foot: 1, special: 'clotable', span: [2, 1] },
  { kind: 'shoewall',  name: 'Shoe Display', emoji: '👞', cat: 'boutique', color: '#2a2620', h: 2, walk: false, foot: 0.6, special: 'shoewall' },
  { kind: 'fitroom',   name: 'Fitting Room', emoji: '🚪', cat: 'boutique', color: '#1c1c20', h: 3, walk: false, foot: 1, special: 'fitroom' },
  { kind: 'clocounter',name: 'Checkout',     emoji: '🛍️', cat: 'boutique', color: '#1f1f24', h: 2, walk: false, foot: 1, special: 'clocounter', span: [2, 1] },
  { kind: 'plinth',    name: 'Display Plinth', emoji: '👜', cat: 'boutique', color: '#e6ddca', h: 2, walk: false, foot: 0.6, special: 'plinth' },
  { kind: 'perfume',   name: 'Perfume Stand',  emoji: '🧴', cat: 'boutique', color: '#1c1c20', h: 1, walk: false, foot: 0.9, special: 'perfume' },
  { kind: 'jewelcase', name: 'Jewellery Case', emoji: '💍', cat: 'boutique', color: '#1c1c20', h: 1, walk: false, foot: 1, special: 'jewelcase', span: [2, 1] },
  { kind: 'goldmirror',name: 'Gilt Mirror',    emoji: '🪞', cat: 'boutique', color: '#bfa468', h: 3, walk: false, foot: 0.5, special: 'goldmirror' },
  { kind: 'velvetbench',name:'Velvet Bench',   emoji: '🛋️', cat: 'boutique', color: '#262230', h: 1, walk: false, foot: 1, special: 'velvetbench', span: [2, 1] },
  // Festive / Seasonal
  { kind: 'xmastree',   name: 'Christmas Tree',emoji: '🎄', cat: 'festive', color: '#1f7a3a', h: 3, walk: false, foot: 0.7, special: 'xmastree' },
  { kind: 'giftpile',   name: 'Gift Pile',   emoji: '🎁', cat: 'festive', color: '#b3242e', h: 1, walk: false, foot: 0.6, special: 'giftpile' },
  { kind: 'snowman',    name: 'Snowman',     emoji: '⛄', cat: 'festive', color: '#ffffff', h: 2, walk: false, foot: 0.5, special: 'snowman' },
  { kind: 'pumpkin',    name: 'Jack-o-Lantern',emoji: '🎃', cat: 'festive', color: '#e07b1f', h: 1, walk: false, foot: 0.5, special: 'pumpkin' },
  { kind: 'menorah',    name: 'Menorah',     emoji: '🕎', cat: 'festive', color: '#caa24a', h: 1, walk: false, foot: 0.5, special: 'menorah' },
  { kind: 'stringlights',name: 'String Lights',emoji: '✨', cat: 'festive', color: '#ffe65c', h: 2, walk: true,  foot: 1, special: 'stringlights', span: [2, 1] },
  // Urban — gritty street props
  { kind: 'rubbish',    name: 'Rubbish Bags',    emoji: '🗑️', cat: 'urban', color: '#3a3a28', h: 1,  walk: false, foot: 0.8, special: 'rubbish' },
  { kind: 'trashcan',   name: 'Trash Can',        emoji: '🗑️', cat: 'urban', color: '#585858', h: 1,  walk: false, foot: 0.4, special: 'trashcan' },
  { kind: 'newspaper',  name: 'Old Newspapers',   emoji: '📰', cat: 'urban', color: '#c8bf96', h: 0,  walk: true,  foot: 1,   special: 'newspaper' },
  { kind: 'puddle',     name: 'Puddle',           emoji: '💧', cat: 'urban', color: '#3a5a70', h: 0,  walk: true,  foot: 1,   special: 'puddle' },
  { kind: 'fishbone',   name: 'Fishbone',         emoji: '🐟', cat: 'urban', color: '#c0b898', h: 0,  walk: true,  foot: 0.5, special: 'fishbone' },
  { kind: 'brokenbottle',name:'Broken Bottle',    emoji: '🍶', cat: 'urban', color: '#4a8a70', h: 0,  walk: true,  foot: 0.5, special: 'brokenbottle' },
  { kind: 'oil_stain',  name: 'Oil Stain',        emoji: '🫧', cat: 'urban', color: '#1a1a22', h: 0,  walk: true,  foot: 1,   special: 'oilstain' },
  { kind: 'shopping_cart',name:'Shopping Cart',   emoji: '🛒', cat: 'urban', color: '#8a8a7a', h: 1,  walk: false, foot: 0.8, special: 'shoppingcart', span: [2, 1] },
  { kind: 'graffiti',   name: 'Graffiti Tag',     emoji: '🎨', cat: 'urban', color: '#cc2244', h: 0,  walk: true,  foot: 1,   special: 'graffiti' },
  { kind: 'pigeon',     name: 'Pigeon',           emoji: '🐦', cat: 'urban', color: '#8a8898', h: 0,  walk: true,  foot: 0.5, special: 'pigeon' },
  { kind: 'drain',      name: 'Drain',            emoji: '⬛', cat: 'urban', color: '#3a3a3a', h: 0,  walk: true,  foot: 0.8, special: 'drain' },
  { kind: 'manhole',    name: 'Manhole',          emoji: '⚫', cat: 'urban', color: '#4a4844', h: 0,  walk: true,  foot: 0.7, special: 'manhole' },
  { kind: 'mattress',  name: 'Old Mattress',     emoji: '🛌', cat: 'urban', color: '#b8b0a0', h: 1,  walk: false, foot: 1,   special: 'mattress', span: [2, 1] },
  { kind: 'dumpster',  name: 'Dumpster',         emoji: '🗑️', cat: 'urban', color: '#2a4a28', h: 2,  walk: false, foot: 1,   special: 'dumpster', span: [2, 1] },
  { kind: 'trash_block',  name: 'Compacted Trash Block',        emoji: '📦', cat: 'junkyard', color: '#4a4a3a', h: 1, walk: false, foot: 1,   special: 'trashblock', obscures: true },
  { kind: 'trash_wall',   name: 'Compacted Trash Double Block', emoji: '📦', cat: 'junkyard', color: '#4a4a3a', h: 2, walk: false, foot: 1,   special: 'trashblock', obscures: true },
  { kind: 'forklift',     name: 'Forklift',                     emoji: '🏗️', cat: 'junkyard', color: '#e8b820', h: 2, walk: false, foot: 1,   special: 'forklift',   span: [4, 2] },
  { kind: 'rusty_car',    name: 'Old Rusty Car',                emoji: '🚗', cat: 'junkyard', color: '#8a4a2e', h: 2, walk: false, foot: 1,   special: 'rustycar',   span: [2, 4] },
  { kind: 'hazard_sign',  name: 'Hazard Sign',                  emoji: '⚠️', cat: 'junkyard', color: '#f0c800', h: 2, walk: false, foot: 0.4, special: 'hazardsign' },
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
const SEAT_SIT: Record<string, number> = { chair: 0.72, sofa: 0.66, stool: 0.7, throne: 0.7, puff: 0.45, armchair: 0.72, couch: 0.78, couch_hc: 0.8, bench: 0.6, lounger: 0.5, canopy: 0.5, eggchair: 0.6, chaise: 0.5, peacock: 0.7, cloud: 0.55, pit: 0.42, officechair: 0.66, dinerbooth: 0.5, swingbench: 0.85, woodbench: 0.5, stonebench: 0.56, modernbench: 0.5, velvetbench: 0.6 };
export const sitHeight = (kind: string): number | null => { const s = defOf(kind).special; return s && s in SEAT_SIT ? SEAT_SIT[s] : null; };

// Pieces that have proper 4-way directional art (rotate visibly). Others ignore direction.
const ROTATABLE = new Set(['chair', 'sofa', 'armchair', 'throne', 'couch', 'couch_hc', 'tv', 'laptop', 'counter', 'fridge', 'vending', 'speaker', 'shelf', 'sign', 'table', 'bench', 'reception', 'pa', 'ladder', 'rope', 'bartop', 'booth', 'lounger', 'canopy', 'chaise', 'arch', 'peacock', 'cloud', 'stool', 'puff', 'eggchair', 'pit',
  // garden pieces — now procedural iso with 4-way directional art
  'tree', 'oak', 'palm', 'topiary', 'fountain', 'lantern', 'statue', 'duck', 'torii', 'pagoda', 'toro', 'sakura', 'bonsai_lux',
  'hedge',
  'vespa',
  // home pieces — all turn (front doors/headboard/taps face the camera correctly)
  'bed', 'wardrobe', 'bookcase', 'desk', 'kitchen', 'bathtub', 'clock', 'dresser',
  // gym + outdoor — all directional iso
  'treadmill', 'weightbench', 'heavybag', 'dumbbells', 'exbike', 'locker',
  'bbq', 'picnictable', 'hottub', 'swingbench', 'streetlamp', 'mailbox',
  // studio / diner / bathroom / office / arcade — all directional iso
  'drumkit', 'ampstack', 'mixer', 'micstand', 'synth', 'vinyl',
  'dinerbooth', 'sodafount', 'popcorn', 'icecream', 'register', 'shakebar',
  'toilet', 'vanity', 'shower', 'towelrail', 'washer', 'mirror',
  'officechair', 'filecab', 'copier', 'watercooler', 'whiteboard', 'serverrack',
  'pooltable', 'foosball', 'clawmachine', 'pinball', 'airhockey', 'toychest', 'pacman', 'cashvault', 'arcsign', 'neonsign',
  // boutique — rails/tables/shelves/booth/counter/displays face a direction (the round rack stays symmetric)
  'clorail', 'clotable', 'shoewall', 'fitroom', 'clocounter', 'mannequin',
  'plinth', 'perfume', 'jewelcase', 'goldmirror', 'velvetbench',
  // café / sci-fi / beach / garage / festive — the directional ones (round decorations stay symmetric)
  'pastrycase', 'winerack', 'kegtap', 'cocktailcart', 'coffeebar', 'neonarch', 'console', 'cryopod',
  'tikibar', 'surfrack', 'lifeguard', 'hammock', 'cooler', 'workbench', 'toolcab', 'gaspump', 'stringlights',
  // more benches + glass table
  'woodbench', 'stonebench', 'modernbench', 'glasstable',
  // novelty figures
  'leaders',
  // building kit — doors + windows + gates rotate to face either iso wall direction
  'door', 'window', 'gate',
  // outdoor fences — all 4-way directional
  'fence_picket', 'fence_iron', 'fence_rail', 'fence_solid']);
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
