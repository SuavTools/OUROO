// OUROO COMBAT — HP, weapon/shield equip, and the damage / heal / loot math for PvP rooms.
//
// Trust model (mirrors duel.ts + the wallet): localStorage is authoritative on each device. Every
// client owns its OWN hp and its OWN losses — when you get hit, YOUR client computes the damage to
// your hp; when you die, YOUR client computes the 5% loot slice, removes it from your wallet, and
// tells the killer what they gained (the killer's client then credits exactly that). Broadcasts are
// best-effort mirrors. This is cheat-resistant against casual players, NOT determined ones — the same
// posture as the rest of the economy.

import { itemById, getFistBoostMultiplier } from './items';
import { getWallet, getBalance, spend, addBalance, takeItem, grantItem, itemCount } from './wallet';

// ---- balance knobs ----
export const MAX_HP = 100;
export const RESPAWN_HP = MAX_HP;          // hp you come back with after a knockout
export const KO_MS = 5000;                 // how long you're down (movement-locked) on death
const REGEN_DELAY_MS = 10_000;             // no passive regen for 10s after taking a hit
const REGEN_TICK_MS = 5_000;               // then…
const REGEN_PER_TICK = 5;                  // …+5 hp every 5s out of combat
export const LOOT_SHARE = 0.05;            // killer takes 5% of the victim's Cristais + 5% of items
const ABSORB_CAP = 200;                    // sanity cap on stacked consumable-shield buffer

// ---- weapon / shield specs (resolved from the item catalog) ----
export type WeaponSpec = { id: string; name: string; emoji: string; damage: number; range: number; cooldownMs: number; style: 'melee' | 'magic' | 'gun' };
export type ShieldSpec = { id: string; name: string; emoji: string; defense: number };  // defense = fraction reduced, 0..0.9

// Fists — the free default everyone swings with when no weapon is equipped.
export const FISTS: WeaponSpec = { id: 'fists', name: 'Fists', emoji: '🤜', damage: 8, range: 1, cooldownMs: 500, style: 'melee' };

// Resolve a weapon id to its spec (unknown / null → fists).
export function weaponOf(id: string | null | undefined): WeaponSpec {
  if (!id || id === 'fists') return FISTS;
  const it = itemById(id);
  if (it && it.effect.type === 'weapon') {
    const e = it.effect;
    return { id: it.id, name: it.name, emoji: it.emoji, damage: e.damage, range: e.range, cooldownMs: e.cooldownMs, style: e.style };
  }
  return FISTS;
}
// Resolve a permanent-shield id to its spec (unknown / null → no shield).
export function shieldOf(id: string | null | undefined): ShieldSpec | null {
  if (!id) return null;
  const it = itemById(id);
  if (it && it.effect.type === 'shield') return { id: it.id, name: it.name, emoji: it.emoji, defense: it.effect.defense };
  return null;
}

// ---- pub/sub so the HUD / inventory / room re-read after any combat change ----
const listeners = new Set<() => void>();
export const subscribeCombat = (fn: () => void): (() => void) => { listeners.add(fn); return () => listeners.delete(fn); };
const notify = () => listeners.forEach(fn => { try { fn(); } catch { /* ignore */ } });

// ---- hp state (localStorage). Stored hp is "hp as of `t`"; reads project passive regen forward, so
// regen never needs a timer and never drifts. Any mutation first materialises the projected hp. ----
type HpState = { hp: number; max: number; absorb: number; t: number };
const HP_KEY = 'ouroo_hp';
const clampHp = (n: number, max: number) => Math.max(0, Math.min(max, Math.round(n)));

function rawHp(): HpState {
  if (typeof window === 'undefined') return { hp: MAX_HP, max: MAX_HP, absorb: 0, t: 0 };
  try {
    const r = localStorage.getItem(HP_KEY);
    if (r) { const s = JSON.parse(r) as Partial<HpState>; const max = Math.max(1, Number(s.max) || MAX_HP); return { hp: clampHp(Number(s.hp) ?? max, max), max, absorb: Math.max(0, Number(s.absorb) || 0), t: Number(s.t) || 0 }; }
  } catch { /* ignore */ }
  return { hp: MAX_HP, max: MAX_HP, absorb: 0, t: 0 };
}
function writeHp(s: HpState) { if (typeof window !== 'undefined') localStorage.setItem(HP_KEY, JSON.stringify(s)); notify(); }

const regenSince = (t: number, now: number): number => {
  if (t === 0) return 0;
  const e = now - t - REGEN_DELAY_MS;
  if (e < 0) return 0;
  return (Math.floor(e / REGEN_TICK_MS) + 1) * REGEN_PER_TICK;
};

export type HpSnapshot = { hp: number; max: number; absorb: number };
// Current hp with passive regen projected in.
export function getHP(): HpSnapshot {
  const s = rawHp();
  return { hp: Math.min(s.max, s.hp + regenSince(s.t, Date.now())), max: s.max, absorb: s.absorb };
}

// Apply an incoming hit to MY hp (called by the victim's client). `myShield` is my equipped permanent
// shield spec. Damage is reduced by the shield %, then eats my absorb buffer, then my hp.
export function applyDamage(weapon: WeaponSpec, myShield: ShieldSpec | null): HpSnapshot & { dead: boolean; taken: number } {
  const cur = getHP();
  let dmg = weapon.damage;
  if (myShield) dmg = Math.max(1, Math.round(dmg * (1 - myShield.defense)));
  const taken = dmg;
  let absorb = cur.absorb;
  if (absorb > 0) { const a = Math.min(absorb, dmg); absorb -= a; dmg -= a; }
  const hp = Math.max(0, cur.hp - dmg);
  writeHp({ hp, max: cur.max, absorb, t: Date.now() });
  return { hp, max: cur.max, absorb, dead: hp <= 0, taken };
}

// Restore hp (food / medication). Returns the new snapshot.
export function healHP(n: number): HpSnapshot {
  const cur = getHP();
  const hp = Math.min(cur.max, cur.hp + Math.max(0, Math.round(n)));
  writeHp({ hp, max: cur.max, absorb: cur.absorb, t: Date.now() });
  return { hp, max: cur.max, absorb: cur.absorb };
}

// Add a consumable-shield absorb buffer (depletes before hp on the next hits).
export function addAbsorb(n: number): HpSnapshot {
  const cur = getHP();
  const absorb = Math.min(ABSORB_CAP, cur.absorb + Math.max(0, Math.round(n)));
  writeHp({ hp: cur.hp, max: cur.max, absorb, t: Date.now() });
  return { hp: cur.hp, max: cur.max, absorb };
}

// Come back to life at full hp, no absorb.
export function respawnHP(): HpSnapshot {
  writeHp({ hp: RESPAWN_HP, max: MAX_HP, absorb: 0, t: Date.now() });
  return { hp: RESPAWN_HP, max: MAX_HP, absorb: 0 };
}

// ---- equipped loadout (localStorage). null weapon = fists. ----
type Loadout = { weapon: string | null; shield: string | null };
const EQ_KEY = 'ouroo_equipped';
export function getEquipped(): Loadout {
  if (typeof window === 'undefined') return { weapon: null, shield: null };
  try { const r = localStorage.getItem(EQ_KEY); if (r) { const s = JSON.parse(r) as Partial<Loadout>; return { weapon: s.weapon ?? null, shield: s.shield ?? null }; } } catch { /* ignore */ }
  return { weapon: null, shield: null };
}
function writeEquipped(l: Loadout) { if (typeof window !== 'undefined') localStorage.setItem(EQ_KEY, JSON.stringify(l)); notify(); }
export function equipWeapon(id: string | null) { writeEquipped({ ...getEquipped(), weapon: id }); }
export function equipShield(id: string | null) { writeEquipped({ ...getEquipped(), shield: id }); }

// What I actually swing / defend with right now — falls back to fists / no-shield if the equipped item
// is no longer owned (e.g. it got looted off me).
export function equippedWeaponSpec(): WeaponSpec {
  const { weapon } = getEquipped();
  const usingFists = !weapon || weapon === 'fists' || itemCount(weapon) <= 0;
  if (usingFists) {
    const boost = getFistBoostMultiplier();
    return boost > 1 ? { ...FISTS, damage: Math.round(FISTS.damage * boost) } : FISTS;
  }
  return weaponOf(weapon);
}
export function equippedShieldSpec(): ShieldSpec | null {
  const { shield } = getEquipped();
  if (shield && itemCount(shield) <= 0) return null;
  return shieldOf(shield);
}

// ---- loot (the 5% slice) ----
export type Loot = { crystals: number; items: Record<string, number> };
export const lootIsEmpty = (l: Loot): boolean => l.crystals <= 0 && Object.keys(l.items).length === 0;

// Compute MY drop on death: 5% of Cristais + 5% of total item units (picked at random from my stacks).
export function computeLoot(): Loot {
  const w = getWallet();
  const crystals = Math.floor(getBalance() * LOOT_SHARE);
  const pool: string[] = [];
  for (const [id, n] of Object.entries(w.items)) for (let i = 0; i < n; i++) pool.push(id);
  const take = Math.floor(pool.length * LOOT_SHARE);
  const items: Record<string, number> = {};
  for (let k = 0; k < take && pool.length; k++) {
    const idx = Math.floor(Math.random() * pool.length);
    const id = pool.splice(idx, 1)[0];
    items[id] = (items[id] || 0) + 1;
  }
  return { crystals, items };
}
// Remove my drop from my wallet (victim side, on death).
export function dropLoot(loot: Loot): void {
  if (loot.crystals > 0) spend(loot.crystals);
  for (const [id, n] of Object.entries(loot.items)) for (let i = 0; i < n; i++) takeItem(id);
}
// Credit a drop into my wallet (killer side, on receiving the loot broadcast).
export function grantLoot(loot: Loot): void {
  if (loot.crystals > 0) addBalance(loot.crystals);
  for (const [id, n] of Object.entries(loot.items)) for (let i = 0; i < n; i++) grantItem(id);
}

// Chebyshev tile distance — melee range check uses this (matches the grid's 8-way adjacency).
export const tileDist = (ax: number, ay: number, bx: number, by: number): number => Math.max(Math.abs(ax - bx), Math.abs(ay - by));
