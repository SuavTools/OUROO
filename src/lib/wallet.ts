// OUROO wallet — the soft-currency economy ("Cristais ✦") plus everything you own beyond the
// free defaults: bought skins, bought premium furni, and custom icons.
//
// Storage model: localStorage is authoritative on a device (synchronous, works offline, lets the
// game loop read the balance with zero latency). Supabase mirrors it best-effort so a logged-in
// player doesn't lose progress on a new device / cleared storage — on a FRESH wallet we adopt the
// cloud snapshot; thereafter every change is pushed up fire-and-forget. The `wallets` table has a
// permissive policy (same posture as room_items — tighten later), and EVERYTHING degrades
// gracefully if the table/env is missing.

import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { getAuthIdentity } from './auth';
import { getLocalPlayer, getCristalScoreBasis } from './leaderboard';
import { type CustomIcon, type IconSpec } from './icons';
import { isFurniFree, furniPrice } from './furni';
import { itemById } from './items';

export const CURRENCY = 'Cristais';
export const CURRENCY_SYMBOL = '✦';
export const ICON_PRICE = 1200;            // Cristais to mint one custom icon
export const POINTS_PER_CRISTAL = 1000;    // 1 ✦ per 1000 points of your BEST score in each game

// Bump when the earn formula changes so stale balances recompute. v2 = peak-score basis (was the
// grindy lifetime-sum). Migration keeps owned cosmetics but resets balance + scoreCredited so the
// new formula re-grants cleanly.
const WALLET_VERSION = 2;

// `scoreCredited` is a high-water mark: the most Cristais ever GRANTED from your score basis. Spending
// lowers `balance` but not this, so spent Cristais are never re-earned and reconnecting never double-
// counts. The basis = sum of your BEST score per game (skill, not grind) — see getCristalScoreBasis.
// `furni` is now a QUANTITY map { kind: count } (Habbo-style inventory): buying adds to the count,
// placing a piece consumes one, picking one up returns one. (Older wallets stored a string[] of owned
// kinds — that's normalised to {kind:1} on read.)
export type WalletData = { balance: number; skins: string[]; furni: Record<string, number>; items: Record<string, number>; icons: CustomIcon[]; scoreCredited: number; version: number };

const LS_KEY = 'ouroo_wallet';
const empty = (): WalletData => ({ balance: 0, skins: [], furni: {}, items: {}, icons: [], scoreCredited: 0, version: WALLET_VERSION });
const normFurni = (f: unknown): Record<string, number> => {
  if (Array.isArray(f)) { const o: Record<string, number> = {}; for (const k of f) o[String(k)] = (o[String(k)] || 0) + 1; return o; }
  if (f && typeof f === 'object') { const o: Record<string, number> = {}; for (const [k, v] of Object.entries(f as Record<string, unknown>)) { const n = Math.floor(Number(v) || 0); if (n > 0) o[k] = n; } return o; }
  return {};
};

// ---- pub/sub so the UI (and the PRAÇA balance chip) refresh after any change ----
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(fn => { try { fn(); } catch { /* ignore */ } });
export const subscribeWallet = (fn: () => void): (() => void) => { listeners.add(fn); return () => listeners.delete(fn); };

// ---- core (synchronous, localStorage) ----
export function getWallet(): WalletData {
  if (typeof window === 'undefined') return empty();
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return empty();
    const w = JSON.parse(raw) as Partial<WalletData>;
    const skins = Array.isArray(w.skins) ? w.skins.map(String) : [];
    const furni = normFurni(w.furni);
    const items = normFurni(w.items);  // same qty-map shape
    const icons = Array.isArray(w.icons) ? (w.icons as CustomIcon[]) : [];
    // Earn-formula migration: keep what you OWN, but reset money so the new basis re-grants cleanly.
    if (Number(w.version) !== WALLET_VERSION) return { balance: 0, skins, furni, items, icons, scoreCredited: 0, version: WALLET_VERSION };
    return {
      balance: Math.max(0, Math.floor(Number(w.balance) || 0)),
      skins, furni, items, icons,
      scoreCredited: Math.max(0, Math.floor(Number(w.scoreCredited) || 0)),
      version: WALLET_VERSION,
    };
  } catch { return empty(); }
}

function save(w: WalletData) {
  if (typeof window !== 'undefined') localStorage.setItem(LS_KEY, JSON.stringify(w));
  notify();
  void pushWallet(w);   // best-effort cloud mirror
}

const isFresh = (w: WalletData) => w.balance === 0 && !w.skins.length && !w.furni.length && !w.icons.length && w.scoreCredited === 0;

// ---- balance ----
export const getBalance = (): number => getWallet().balance;
export function addBalance(n: number): number { const w = getWallet(); w.balance = Math.max(0, w.balance + Math.floor(n)); save(w); return w.balance; }
export function spend(n: number): boolean { const w = getWallet(); if (w.balance < n) return false; w.balance -= Math.floor(n); save(w); return true; }

// Grant Cristais for lifetime points not yet credited. Returns how many were just granted (the delta
// since last reconcile). Backfills existing players on first run and tops up after every new score.
export function reconcileFromScores(lifetimePoints: number): number {
  const target = Math.floor(Math.max(0, lifetimePoints) / POINTS_PER_CRISTAL);
  const w = getWallet();
  if (target <= w.scoreCredited) return 0;
  const delta = target - w.scoreCredited;
  w.balance += delta; w.scoreCredited = target; save(w); return delta;
}
// Fetch the peak-score basis for this device and reconcile. Returns the Cristais just granted.
export async function reconcileNow(): Promise<number> {
  const device = await deviceToken();
  if (!device) return 0;
  const basis = await getCristalScoreBasis(device);
  return reconcileFromScores(basis);
}

// ---- skins (currency-bought; default/score/code unlocks are tracked elsewhere) ----
export const ownsSkin = (id: string): boolean => getWallet().skins.includes(id);
export function buySkin(id: string, price: number): { ok: boolean; error?: string } {
  const w = getWallet();
  if (w.skins.includes(id)) return { ok: true };
  if (w.balance < price) return { ok: false, error: 'Cristais insuficientes' };
  w.balance -= price; w.skins.push(id); save(w); return { ok: true };
}

// ---- furni inventory (quantity per kind; first couple of each basic category are free + unlimited) ----
// How many of this kind you hold (free basics are unlimited → Infinity).
export function furniCount(kind: string): number { return isFurniFree(kind) ? Infinity : (getWallet().furni[kind] || 0); }
export function ownsFurni(kind: string): boolean { return furniCount(kind) > 0; }
// Buy one more into the inventory (free basics need no buying).
export function buyFurni(kind: string): { ok: boolean; error?: string } {
  if (isFurniFree(kind)) return { ok: true };
  const w = getWallet();
  const price = furniPrice(kind);
  if (w.balance < price) return { ok: false, error: 'Cristais insuficientes' };
  w.balance -= price; w.furni[kind] = (w.furni[kind] || 0) + 1; save(w); return { ok: true };
}
// Consume one when placing (free basics are unlimited → never consumed). Returns false if out of stock.
export function consumeFurni(kind: string): boolean {
  if (isFurniFree(kind)) return true;
  const w = getWallet(); const n = w.furni[kind] || 0; if (n < 1) return false;
  if (n <= 1) delete w.furni[kind]; else w.furni[kind] = n - 1; save(w); return true;
}
// Return one to the inventory when picking a placed piece back up (free basics are not tracked).
export function returnFurni(kind: string): void {
  if (isFurniFree(kind)) return;
  const w = getWallet(); w.furni[kind] = (w.furni[kind] || 0) + 1; save(w);
}

// ---- custom icons ----
export const getIcons = (): CustomIcon[] => getWallet().icons;
export const getIcon = (id: string): CustomIcon | undefined => getWallet().icons.find(i => i.id === id);
const newIconId = (): string => (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `ic_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

// Add an icon to the wallet WITHOUT charging — for moderators (who get cosmetics free).
export function mintIcon(name: string, spec: IconSpec): CustomIcon {
  const w = getWallet();
  const icon: CustomIcon = { id: newIconId(), name: name.slice(0, 24) || 'Icon', spec };
  w.icons.push(icon); save(w); return icon;
}
// Mint a new icon (costs ICON_PRICE). Returns the created icon, or an error.
export function buyIcon(name: string, spec: IconSpec): { ok: boolean; icon?: CustomIcon; error?: string } {
  const w = getWallet();
  if (w.balance < ICON_PRICE) return { ok: false, error: 'Not enough Crystals' };
  const icon: CustomIcon = { id: newIconId(), name: name.slice(0, 24) || 'Icon', spec };
  w.balance -= ICON_PRICE; w.icons.push(icon); save(w); return { ok: true, icon };
}
export function removeIcon(id: string) { const w = getWallet(); w.icons = w.icons.filter(i => i.id !== id); save(w); }

// ---- cloud sync (best-effort) ----
async function deviceToken(): Promise<string> {
  const auth = await getAuthIdentity().catch(() => null);
  return auth?.device ?? getLocalPlayer().device;
}

// If the `wallets` table isn't deployed (404 / 42P01), stop hitting the cloud — wallet stays local.
let cloudOff = false;
const markCloud = (error: { code?: string; message?: string } | null) => { if (error && (error.code === '42P01' || /not exist|not find the table|schema cache/i.test(error.message || ''))) cloudOff = true; };

let pushTimer: ReturnType<typeof setTimeout> | null = null;
async function pushWallet(w: WalletData) {
  if (!supabase || cloudOff) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(async () => {
    try {
      const device = await deviceToken();
      if (!device) return;
      const { error } = await supabase!.from('wallets').upsert({ device_token: device, balance: w.balance, data: { skins: w.skins, furni: w.furni, items: w.items, icons: w.icons, scoreCredited: w.scoreCredited, version: WALLET_VERSION } }, { onConflict: 'device_token' });
      markCloud(error);
    } catch { /* ignore */ }
  }, 600);
}

// Pull the cloud snapshot; adopt it only when the local wallet is still fresh (nothing to lose).
export async function refreshWalletFromCloud(): Promise<void> {
  if (!supabase || cloudOff) return;
  try {
    const device = await deviceToken();
    if (!device) return;
    const { data, error } = await supabase.from('wallets').select('balance, data').eq('device_token', device).maybeSingle();
    if (error) { markCloud(error); return; }
    if (!data) return;
    const local = getWallet();
    if (!isFresh(local)) return;
    const d = (data.data ?? {}) as Partial<WalletData>;
    if (Number(d.version) !== WALLET_VERSION) return;   // ignore stale (pre-v2) cloud snapshots
    save({
      balance: Math.max(0, Math.floor(Number(data.balance) || 0)),
      skins: Array.isArray(d.skins) ? d.skins.map(String) : [],
      furni: normFurni(d.furni),
      items: normFurni(d.items),
      icons: Array.isArray(d.icons) ? (d.icons as CustomIcon[]) : [],
      scoreCredited: Math.max(0, Math.floor(Number(d.scoreCredited) || 0)),
      version: WALLET_VERSION,
    });
  } catch { /* ignore */ }
}

// Full wallet sync: pull the cloud snapshot (if local is fresh), then credit any lifetime points
// not yet banked. Run on mount so opening the inventory / entering PRAÇA backfills your balance.
export async function syncWallet(): Promise<void> {
  await refreshWalletFromCloud();
  await reconcileNow();
}

// ---- consumable / multi-use / permanent items ----
export function itemCount(id: string): number { return getWallet().items[id] || 0; }
export function ownsItem(id: string): boolean { return itemCount(id) > 0; }
export function grantItem(id: string): void { const w = getWallet(); w.items[id] = (w.items[id] || 0) + 1; save(w); }
export function buyItem(id: string, price: number): { ok: boolean; error?: string } {
  const w = getWallet();
  if (w.balance < price) return { ok: false, error: 'Cristais insuficientes' };
  w.balance -= price; w.items[id] = (w.items[id] || 0) + 1; save(w); return { ok: true };
}
// Consume one charge. Returns false if not owned. Permanent items are never consumed.
export function consumeItem(id: string): boolean {
  const item = itemById(id);
  if (!item || item.useType === 'permanent') return true;
  const w = getWallet(); const n = w.items[id] || 0; if (n < 1) return false;
  if (n <= 1) delete w.items[id]; else w.items[id] = n - 1; save(w); return true;
}
export function totalItemCount(): number { const w = getWallet(); return Object.values(w.items).reduce((s, n) => s + n, 0); }

// React hook: live wallet that re-renders on any change.
export function useWallet(): WalletData {
  const [w, setW] = useState<WalletData>(empty);
  useEffect(() => {
    setW(getWallet());
    syncWallet();
    return subscribeWallet(() => setW(getWallet()));
  }, []);
  return w;
}
