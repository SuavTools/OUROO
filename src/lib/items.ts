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
