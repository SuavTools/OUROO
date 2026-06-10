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
import { getLocalPlayer } from './leaderboard';
import { type CustomIcon, type IconSpec } from './icons';
import { isFurniPremium, furniPrice } from './furni';

export const CURRENCY = 'Cristais';
export const CURRENCY_SYMBOL = '✦';
export const ICON_PRICE = 250;   // Cristais to mint one custom icon

export type WalletData = { balance: number; skins: string[]; furni: string[]; icons: CustomIcon[] };

const LS_KEY = 'ouroo_wallet';
const empty = (): WalletData => ({ balance: 0, skins: [], furni: [], icons: [] });

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
    return {
      balance: Math.max(0, Math.floor(Number(w.balance) || 0)),
      skins: Array.isArray(w.skins) ? w.skins.map(String) : [],
      furni: Array.isArray(w.furni) ? w.furni.map(String) : [],
      icons: Array.isArray(w.icons) ? (w.icons as CustomIcon[]) : [],
    };
  } catch { return empty(); }
}

function save(w: WalletData) {
  if (typeof window !== 'undefined') localStorage.setItem(LS_KEY, JSON.stringify(w));
  notify();
  void pushWallet(w);   // best-effort cloud mirror
}

const isFresh = (w: WalletData) => w.balance === 0 && !w.skins.length && !w.furni.length && !w.icons.length;

// ---- balance ----
export const getBalance = (): number => getWallet().balance;
export function addBalance(n: number): number { const w = getWallet(); w.balance = Math.max(0, w.balance + Math.floor(n)); save(w); return w.balance; }
export function spend(n: number): boolean { const w = getWallet(); if (w.balance < n) return false; w.balance -= Math.floor(n); save(w); return true; }

// Cristais earned from one arcade run: a slice of the score plus the crystals you actually grabbed.
export const runReward = (score: number, crystals: number): number => Math.max(0, Math.floor(score / 1000) + Math.max(0, crystals));
export function creditRun(score: number, crystals: number): number { const r = runReward(score, crystals); if (r > 0) addBalance(r); return r; }

// ---- skins (currency-bought; default/score/code unlocks are tracked elsewhere) ----
export const ownsSkin = (id: string): boolean => getWallet().skins.includes(id);
export function buySkin(id: string, price: number): { ok: boolean; error?: string } {
  const w = getWallet();
  if (w.skins.includes(id)) return { ok: true };
  if (w.balance < price) return { ok: false, error: 'Cristais insuficientes' };
  w.balance -= price; w.skins.push(id); save(w); return { ok: true };
}

// ---- furni (basic furni is free + owned by default; premium must be bought) ----
export function ownsFurni(kind: string): boolean { return !isFurniPremium(kind) || getWallet().furni.includes(kind); }
export function buyFurni(kind: string): { ok: boolean; error?: string } {
  if (!isFurniPremium(kind)) return { ok: true };
  const w = getWallet();
  if (w.furni.includes(kind)) return { ok: true };
  const price = furniPrice(kind);
  if (w.balance < price) return { ok: false, error: 'Cristais insuficientes' };
  w.balance -= price; w.furni.push(kind); save(w); return { ok: true };
}

// ---- custom icons ----
export const getIcons = (): CustomIcon[] => getWallet().icons;
export const getIcon = (id: string): CustomIcon | undefined => getWallet().icons.find(i => i.id === id);
const newIconId = (): string => (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `ic_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

// Add an icon to the wallet WITHOUT charging — for moderators (who get cosmetics free).
export function mintIcon(name: string, spec: IconSpec): CustomIcon {
  const w = getWallet();
  const icon: CustomIcon = { id: newIconId(), name: name.slice(0, 24) || 'Ícone', spec };
  w.icons.push(icon); save(w); return icon;
}
// Mint a new icon (costs ICON_PRICE). Returns the created icon, or an error.
export function buyIcon(name: string, spec: IconSpec): { ok: boolean; icon?: CustomIcon; error?: string } {
  const w = getWallet();
  if (w.balance < ICON_PRICE) return { ok: false, error: 'Cristais insuficientes' };
  const icon: CustomIcon = { id: newIconId(), name: name.slice(0, 24) || 'Ícone', spec };
  w.balance -= ICON_PRICE; w.icons.push(icon); save(w); return { ok: true, icon };
}
export function removeIcon(id: string) { const w = getWallet(); w.icons = w.icons.filter(i => i.id !== id); save(w); }

// ---- cloud sync (best-effort) ----
async function deviceToken(): Promise<string> {
  const auth = await getAuthIdentity().catch(() => null);
  return auth?.device ?? getLocalPlayer().device;
}

let pushTimer: ReturnType<typeof setTimeout> | null = null;
async function pushWallet(w: WalletData) {
  if (!supabase) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(async () => {
    try {
      const device = await deviceToken();
      if (!device) return;
      await supabase!.from('wallets').upsert({ device_token: device, balance: w.balance, data: { skins: w.skins, furni: w.furni, icons: w.icons } }, { onConflict: 'device_token' });
    } catch { /* table may not exist yet — ignore */ }
  }, 600);
}

// Pull the cloud snapshot; adopt it only when the local wallet is still fresh (nothing to lose).
export async function refreshWalletFromCloud(): Promise<void> {
  if (!supabase) return;
  try {
    const device = await deviceToken();
    if (!device) return;
    const { data } = await supabase.from('wallets').select('balance, data').eq('device_token', device).maybeSingle();
    if (!data) return;
    const local = getWallet();
    if (!isFresh(local)) return;
    const d = (data.data ?? {}) as Partial<WalletData>;
    save({
      balance: Math.max(0, Math.floor(Number(data.balance) || 0)),
      skins: Array.isArray(d.skins) ? d.skins.map(String) : [],
      furni: Array.isArray(d.furni) ? d.furni.map(String) : [],
      icons: Array.isArray(d.icons) ? (d.icons as CustomIcon[]) : [],
    });
  } catch { /* ignore */ }
}

// React hook: live wallet that re-renders on any change.
export function useWallet(): WalletData {
  const [w, setW] = useState<WalletData>(empty);
  useEffect(() => {
    setW(getWallet());
    refreshWalletFromCloud();
    return subscribeWallet(() => setW(getWallet()));
  }, []);
  return w;
}
