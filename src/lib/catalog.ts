// OUROO catalog — ties the cosmetics together: skin pricing (so Cristais can buy what used to be
// score-only), unified ownership (default / score / code / bought / moderator), and the appearance
// model where a worn look is either a real skin id or an `icon:<id>` custom icon.

import { type Skin, isSkinUnlocked } from './skins';
import { type IconSpec } from './icons';
import { type PersonSpec, isPersonId, parsePerson } from './person';
import { getWallet, getIcon } from './wallet';

// ---- appearance ids (stored in `ouroo_skin`) ----
export const ICON_PREFIX = 'icon:';
export const isIconId = (id: string): boolean => id.startsWith(ICON_PREFIX);
export const iconAppearanceId = (localId: string): string => `${ICON_PREFIX}${localId}`;
export const iconLocalId = (id: string): string => id.slice(ICON_PREFIX.length);

export type Appearance =
  | { kind: 'skin'; id: string }
  | { kind: 'icon'; id: string; spec: IconSpec | null }
  | { kind: 'person'; id: string; person: PersonSpec };

// Resolve a worn appearance id into something drawable. Icon specs come from the local wallet; person
// specs are fully encoded in the id (self-contained, so they render for everyone over the wire).
export function resolveAppearance(id: string): Appearance {
  if (isPersonId(id)) return { kind: 'person', id, person: parsePerson(id) };
  if (isIconId(id)) { const ic = getIcon(iconLocalId(id)); return { kind: 'icon', id, spec: ic?.spec ?? null }; }
  return { kind: 'skin', id };
}

// ---- skin pricing ----
// Score-locked skins can be bought early with Cristais (price scales with the score they'd need);
// default skins are free; code skins stay secret (never buyable).
export function skinPrice(skin: Skin): number | null {
  if (skin.unlock.type === 'default') return 0;
  if (skin.unlock.type === 'score') return Math.max(200, Math.round(skin.unlock.need / 200));
  return null;
}

// Owned = default, OR earned by score, OR redeemed by code, OR bought with Cristais, OR moderator.
export function isSkinOwned(skin: Skin, best: number, codeUnlocks: string[], isMod: boolean): boolean {
  if (isMod) return true;
  if (isSkinUnlocked(skin, best, codeUnlocks)) return true;
  return getWallet().skins.includes(skin.id);
}
