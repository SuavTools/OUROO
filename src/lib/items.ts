import { healHP, addAbsorb } from './combat';

export type UseType = 'single' | 'multi' | 'permanent';

export type ItemEffect =
  | { type: 'speed'; multiplier: number; durationMs: number }
  | { type: 'sway'; intensity: number; durationMs: number }
  | { type: 'jump'; multiplier: number; durationMs: number }
  | { type: 'fly'; durationMs: number }
  | { type: 'emote_unlock'; emoteId: string }
  // combat (see combat.ts): weapons + permanent shields are EQUIPPED from the inventory; heals +
  // absorb shields are USED (consumed) like the buff items above.
  | { type: 'weapon'; damage: number; range: number; cooldownMs: number; style: 'melee' | 'magic' | 'gun' }
  | { type: 'shield'; defense: number }          // permanent, equipped: fraction of damage reduced (0..0.9)
  | { type: 'shield_absorb'; absorb: number }    // consumable: grants a one-off damage-soak buffer
  | { type: 'heal'; hp: number }                 // consumable: restores hp
  | { type: 'ammo_recharge'; weaponId: string }  // consumable: charges are stored as itemCount, consumed per shot
  | { type: 'fist_boost'; multiplier: number; durationMs: number }; // temporary fist damage multiplier

export type Item = {
  id: string;
  name: string;
  description: string;
  useType: UseType;
  uses?: number;          // charges per unit purchased, for 'multi' only
  effect: ItemEffect;
  extraEffects?: ItemEffect[];   // secondary effects activated alongside the primary
  price: number;          // Cristais
  emoji: string;
};

export const ITEMS: Item[] = [
  {
    id: 'coffee',
    name: 'Coffee',
    description: 'A strong cup that sharpens your stride.',
    useType: 'single',
    effect: { type: 'speed', multiplier: 1.25, durationMs: 10 * 60 * 1000 },
    price: 200,
    emoji: '☕',
  },
  {
    id: 'beer',
    name: 'Beer',
    description: 'Cold and honest. Takes the edge off — and doubles your fist damage.',
    useType: 'single',
    effect: { type: 'sway', intensity: 3, durationMs: 8 * 60 * 1000 },
    extraEffects: [{ type: 'fist_boost', multiplier: 2, durationMs: 8 * 60 * 1000 }],
    price: 100,
    emoji: '🍺',
  },
  {
    id: 'wine',
    name: 'Wine',
    description: 'Aged slowly. Best enjoyed in company — and doubles your fist damage.',
    useType: 'single',
    effect: { type: 'sway', intensity: 5, durationMs: 12 * 60 * 1000 },
    extraEffects: [{ type: 'fist_boost', multiplier: 2, durationMs: 12 * 60 * 1000 }],
    price: 150,
    emoji: '🍷',
  },
  {
    id: 'spirit',
    name: 'Spirit',
    description: 'Burns going down. The room shifts — and doubles your fist damage.',
    useType: 'single',
    effect: { type: 'sway', intensity: 10, durationMs: 3 * 60 * 1000 },
    extraEffects: [{ type: 'fist_boost', multiplier: 2, durationMs: 3 * 60 * 1000 }],
    price: 250,
    emoji: '🥃',
  },
  {
    id: 'cocktail',
    name: 'Cocktail',
    description: 'Mixed with care. You feel it settle in — and doubles your fist damage.',
    useType: 'single',
    effect: { type: 'sway', intensity: 7, durationMs: 20 * 60 * 1000 },
    extraEffects: [{ type: 'fist_boost', multiplier: 2, durationMs: 20 * 60 * 1000 }],
    price: 300,
    emoji: '🍹',
  },
  {
    id: 'wings',
    name: 'Wings',
    description: 'Lifts you off the ground — climb straight up onto rooftops and upper floors. No stairs needed.',
    useType: 'single',
    effect: { type: 'fly', durationMs: 5 * 60 * 1000 },
    price: 500,
    emoji: '🪽',
  },
  // ---- combat: weapons (equip one at a time; fists are the free default in combat.ts) ----
  {
    id: 'knife',
    name: 'Knife',
    description: 'Quick and close. Equip it to hit harder than your fists in combat zones.',
    useType: 'permanent',
    effect: { type: 'weapon', damage: 18, range: 1, cooldownMs: 600, style: 'melee' },
    price: 600,
    emoji: '🔪',
  },
  {
    id: 'sword',
    name: 'Sword',
    description: 'Heavy swings, serious damage. The honest way to end an alley scrap.',
    useType: 'permanent',
    effect: { type: 'weapon', damage: 40, range: 1, cooldownMs: 850, style: 'melee' },
    price: 1500,
    emoji: '🗡️',
  },
  {
    id: 'staff',
    name: 'Magic Staff',
    description: 'Hurls a bolt from a distance — strike foes three tiles away.',
    useType: 'permanent',
    effect: { type: 'weapon', damage: 22, range: 3, cooldownMs: 950, style: 'magic' },
    price: 2200,
    emoji: '🪄',
  },
  {
    id: 'pistol',
    name: 'Pistol',
    description: 'A compact firearm — shoot targets up to three tiles away. Requires Pistol Ammo to fire.',
    useType: 'permanent',
    effect: { type: 'weapon', damage: 20, range: 3, cooldownMs: 700, style: 'gun' },
    price: 1800,
    emoji: '🔫',
  },
  {
    id: 'pistol_ammo',
    name: 'Pistol Ammo',
    description: 'Loads 6 shots into your Pistol. The pistol won\'t fire without it.',
    useType: 'multi',
    uses: 6,
    effect: { type: 'ammo_recharge', weaponId: 'pistol' },
    price: 300,
    emoji: '🔋',
  },
  // ---- combat: shields ----
  {
    id: 'iron_guard',
    name: 'Iron Guard',
    description: 'A permanent shield. Equip it to soak 30% of every hit you take.',
    useType: 'permanent',
    effect: { type: 'shield', defense: 0.3 },
    price: 1200,
    emoji: '🛡️',
  },
  {
    id: 'bubble_shield',
    name: 'Bubble Shield',
    description: 'Pop it for a 50-point barrier that absorbs damage before your health. One-time use.',
    useType: 'single',
    effect: { type: 'shield_absorb', absorb: 50 },
    price: 300,
    emoji: '🫧',
  },
  // ---- combat: heals (always bought, consumed on use) ----
  {
    id: 'food',
    name: 'Food',
    description: 'A quick bite. Restores 25 health.',
    useType: 'single',
    effect: { type: 'heal', hp: 25 },
    price: 120,
    emoji: '🍔',
  },
  {
    id: 'medkit',
    name: 'Medication',
    description: 'Proper patch-up. Restores 60 health.',
    useType: 'single',
    effect: { type: 'heal', hp: 60 },
    price: 350,
    emoji: '💊',
  },
];

export const itemById = (id: string): Item | undefined => ITEMS.find(i => i.id === id);

// ---- active effect tracking (localStorage, same pattern as wallet) ----
// Stored as { itemId, effect, expiresAt } — expiresAt is a UTC ms timestamp.
// Permanent effects use Number.MAX_SAFE_INTEGER so they never expire.
type StoredEffect = { itemId: string; effect: ItemEffect; expiresAt: number };
const EFFECTS_KEY = 'ouroo_active_effects';

const loadEffects = (): StoredEffect[] => {
  if (typeof window === 'undefined') return [];
  try { const r = localStorage.getItem(EFFECTS_KEY); return r ? (JSON.parse(r) as StoredEffect[]) : []; }
  catch { return []; }
};
const saveEffects = (effects: StoredEffect[]) => {
  if (typeof window !== 'undefined') localStorage.setItem(EFFECTS_KEY, JSON.stringify(effects));
};

// Activate an item's effect. Call consumeItem() from wallet before this.
export function activateItem(id: string): boolean {
  const item = itemById(id); if (!item) return false;
  const applyEffect = (ef: ItemEffect) => {
    if (ef.type === 'heal') { healHP(ef.hp); return; }
    if (ef.type === 'shield_absorb') { addAbsorb(ef.absorb); return; }
    if (ef.type === 'weapon' || ef.type === 'shield' || ef.type === 'ammo_recharge') return;
    const expiresAt = 'durationMs' in ef ? Date.now() + ef.durationMs : Number.MAX_SAFE_INTEGER;
    const effects = loadEffects().filter(e => e.effect.type !== ef.type);
    effects.push({ itemId: id, effect: ef, expiresAt });
    saveEffects(effects);
  };
  applyEffect(item.effect);
  for (const ef of item.extraEffects ?? []) applyEffect(ef);
  return true;
}

// Returns the active fist damage multiplier (1 = no boost).
export function getFistBoostMultiplier(): number {
  const now = Date.now();
  for (const e of loadEffects()) {
    if (e.effect.type === 'fist_boost' && e.expiresAt > now) return e.effect.multiplier;
  }
  return 1;
}

// Returns the combined speed multiplier from all active speed effects (1 = no boost).
export function getSpeedMultiplier(): number {
  const now = Date.now(); let mult = 1;
  for (const e of loadEffects()) {
    if (e.effect.type === 'speed' && e.expiresAt > now) mult *= e.effect.multiplier;
  }
  return mult;
}

// Returns the strongest active sway intensity (0 = none).
export function getSwayIntensity(): number {
  const now = Date.now(); let intensity = 0;
  for (const e of loadEffects()) {
    if (e.effect.type === 'sway' && e.expiresAt > now) intensity = Math.max(intensity, e.effect.intensity);
  }
  return intensity;
}

// Returns the active sway effect with its expiry, for broadcasting to other users.
export function getSwayEffect(): { intensity: number; expiresAt: number } {
  const now = Date.now(); let intensity = 0; let expiresAt = 0;
  for (const e of loadEffects()) {
    if (e.effect.type === 'sway' && e.expiresAt > now && e.effect.intensity > intensity) {
      intensity = e.effect.intensity; expiresAt = e.expiresAt;
    }
  }
  return { intensity, expiresAt };
}

// Returns the active speed effect with its expiry, for broadcasting to other users.
export function getSpeedEffect(): { multiplier: number; expiresAt: number } {
  const now = Date.now(); let multiplier = 1; let expiresAt = 0;
  for (const e of loadEffects()) {
    if (e.effect.type === 'speed' && e.expiresAt > now) {
      multiplier *= e.effect.multiplier; expiresAt = Math.max(expiresAt, e.expiresAt);
    }
  }
  return { multiplier, expiresAt };
}

// True while a Wings effect is active — lets the player climb any height (reach roofs/upper floors).
export function getFlyActive(): boolean {
  const now = Date.now();
  return loadEffects().some(e => e.effect.type === 'fly' && e.expiresAt > now);
}

// Ms remaining on the active fly effect (0 = none) — used for HUD/UI countdowns.
export function getFlyRemainingMs(): number {
  const now = Date.now(); let rem = 0;
  for (const e of loadEffects()) {
    if (e.effect.type === 'fly' && e.expiresAt > now) rem = Math.max(rem, e.expiresAt - now);
  }
  return rem;
}
