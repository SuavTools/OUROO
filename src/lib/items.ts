export type UseType = 'single' | 'multi' | 'permanent';

export type ItemEffect =
  | { type: 'speed'; multiplier: number; durationMs: number }
  | { type: 'jump'; multiplier: number; durationMs: number }
  | { type: 'emote_unlock'; emoteId: string };

export type Item = {
  id: string;
  name: string;
  description: string;
  useType: UseType;
  uses?: number;   // charges per unit purchased, for 'multi' only
  effect: ItemEffect;
  price: number;   // Cristais
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
  const ef = item.effect;
  const expiresAt = 'durationMs' in ef ? Date.now() + ef.durationMs : Number.MAX_SAFE_INTEGER;
  const effects = loadEffects().filter(e => e.effect.type !== ef.type); // replace same-type effect
  effects.push({ itemId: id, effect: ef, expiresAt });
  saveEffects(effects);
  return true;
}

// Returns the combined speed multiplier from all active speed effects (1 = no boost).
export function getSpeedMultiplier(): number {
  const now = Date.now(); let mult = 1;
  for (const e of loadEffects()) {
    if (e.effect.type === 'speed' && e.expiresAt > now) mult *= e.effect.multiplier;
  }
  return mult;
}
