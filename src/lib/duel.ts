// OUROO DUEL — 1v1 wagered Climb Race: identity, deterministic seeding, and the crystal+item escrow.
//
// Trust tier (v1, chosen): Discord-gated + light escrow. You must be signed in with Discord to wager
// (verified identity; anonymous device ids are spoofable and not trusted with a pot). Both players ante
// the SAME stake; the `duels` row (see supabase/migrations/..._duels.sql) is the durable referee for
// "what was staked / who won". Wallet debits/credits still happen on each device (localStorage is
// authoritative here, matching the rest of the economy) — but they're gated on the agreed row state, so
// a loser can't quietly keep the pot. Results are self-reported and settlement is computed identically
// on both clients; this is cheat-resistant against casual players, NOT determined ones. Deferred: a
// service-role route that validates the seeded result with a checksum before paying out.

import { supabase } from './supabase';
import { getAuthIdentity } from './auth';
import { getBalance, spend, addBalance, furniCount, consumeFurni, grantFurni } from './wallet';
import { isFurniFree, defOf } from './furni';

// Display name for a furni kind (falls back to the raw kind if unknown).
const furniName = (kind: string): string => defOf(kind)?.name ?? kind;

// ---- identity (Discord only) ----
export type DuelIdentity = { token: string; handle: string };
// The wagering identity. Returns null unless signed in with Discord (token is `discord:<id>`).
export async function getDuelIdentity(): Promise<DuelIdentity | null> {
  const a = await getAuthIdentity().catch(() => null);
  if (!a || !a.device.startsWith('discord:')) return null;
  return { token: a.device, handle: a.handle };
}

// ---- deterministic RNG (both clients build the same tower from the seed) ----
// mulberry32 — tiny, fast, good-enough distribution for level generation. Same seed → same sequence.
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// A fresh 32-bit seed for a new duel.
export const makeSeed = (): number => Math.floor(Math.random() * 0xffffffff) >>> 0;
// A match id for a FRIENDLY duel (no durable row) — just names the live `duel:<id>` channel both join.
export const makeMatchId = (): string => (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `m_${Date.now()}_${Math.floor(Math.random() * 1e9)}`;

// ---- which games can be played as a 1v1 duel ----
// The wager/lobby layer is game-agnostic; a game becomes "duel-ready" once it can run a seeded, timed
// match and report a comparable score. The Climb Race (LEAP engine) is the first. Add a gameId here +
// route it in page.tsx's duel view as each game gets its duel-mode retrofit.
export const CLIMB_GAME_ID = 'climb';
// Games that currently run as a duel. The Climb Race is first; LEAP + OUROO get added as each game's
// game-over path is retrofitted to "first to lose loses" (report score → higher survival/score wins).
const DUEL_READY = new Set<string>([CLIMB_GAME_ID]);
export const isDuelReady = (gameId: string): boolean => DUEL_READY.has(gameId);

// ---- stake (symmetric: each side antes this) ----
export type DuelStake = { crystals: number; items: Record<string, number> };
export const emptyStake = (): DuelStake => ({ crystals: 0, items: {} });
export const stakeIsEmpty = (s: DuelStake): boolean =>
  s.crystals <= 0 && Object.values(s.items).every(n => n <= 0);

// Only NON-free, finitely-owned furni can be wagered (free basics are unlimited → meaningless to stake).
export const isWagerable = (kind: string): boolean => !isFurniFree(kind) && Number.isFinite(furniCount(kind));

// Can the local wallet cover this ante right now?
export function canAfford(s: DuelStake): { ok: boolean; reason?: string } {
  if (getBalance() < s.crystals) return { ok: false, reason: 'Cristais insuficientes' };
  for (const [kind, n] of Object.entries(s.items)) {
    if (n > 0 && furniCount(kind) < n) return { ok: false, reason: `Faltam ${furniName(kind)}` };
  }
  return { ok: true };
}

// A short human label for a stake ("✦1,200 + 2× Disco Ball").
export function stakeLabel(s: DuelStake): string {
  const parts: string[] = [];
  if (s.crystals > 0) parts.push(`✦${s.crystals.toLocaleString('pt-PT')}`);
  for (const [kind, n] of Object.entries(s.items)) if (n > 0) parts.push(`${n}× ${furniName(kind)}`);
  return parts.length ? parts.join(' + ') : 'nada';
}

// ---- escrow (local wallet) ----
// Debit the ante out of the wallet up front (the "lock"). Returns false (and changes nothing) if the
// wallet can't cover it — guard with canAfford() first, but this re-checks to stay atomic-ish.
export function escrowAnte(s: DuelStake): boolean {
  if (!canAfford(s).ok) return false;
  for (const [kind, n] of Object.entries(s.items)) {
    for (let i = 0; i < n; i++) { if (!consumeFurni(kind)) { /* shouldn't happen after canAfford */ return false; } }
  }
  if (s.crystals > 0 && !spend(s.crystals)) return false;
  return true;
}
// Credit `mult` copies of the stake back: winner mult=2 (whole pot), draw mult=1 (own ante back),
// loser mult=0 (nothing). Net result: winner +stake, loser −stake, draw 0.
export function creditStake(s: DuelStake, mult: number): void {
  if (mult <= 0) return;
  if (s.crystals > 0) addBalance(s.crystals * mult);
  for (const [kind, n] of Object.entries(s.items)) if (n > 0) grantFurni(kind, n * mult);
}

// ---- the duels row (durable referee) ----
export type DuelRole = 'host' | 'guest';
export type DuelWinner = 'host' | 'guest' | 'draw';
export type DuelState = 'pending' | 'locked' | 'playing' | 'settled' | 'void';
export type DuelRow = {
  id: string; room: string; seed: number;
  host_token: string; host_handle: string; guest_token: string; guest_handle: string;
  stake_crystals: number; stake_items: Record<string, number>;
  state: DuelState; host_locked: boolean; guest_locked: boolean;
  host_result: number | null; guest_result: number | null; winner: DuelWinner | null;
};

// Host creates the durable row at challenge-accept (after escrowing their own ante).
export async function createDuel(args: {
  room: string; seed: number; host: DuelIdentity; guest: DuelIdentity; stake: DuelStake;
}): Promise<DuelRow | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('duels').insert({
    room: args.room, seed: args.seed,
    host_token: args.host.token, host_handle: args.host.handle,
    guest_token: args.guest.token, guest_handle: args.guest.handle,
    stake_crystals: args.stake.crystals, stake_items: args.stake.items,
    state: 'locked', host_locked: true, guest_locked: false,
  }).select('*').single();
  if (error || !data) return null;
  return data as DuelRow;
}

export async function fetchDuel(id: string): Promise<DuelRow | null> {
  if (!supabase) return null;
  const { data } = await supabase.from('duels').select('*').eq('id', id).maybeSingle();
  return (data as DuelRow) ?? null;
}

// Mark my ante as escrowed on the row.
export async function markLocked(id: string, role: DuelRole): Promise<void> {
  if (!supabase) return;
  const patch = role === 'host' ? { host_locked: true } : { guest_locked: true };
  await supabase.from('duels').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
}

// Pure, symmetric winner rule — higher climb wins; equal = draw. Both clients compute the same answer.
export function decideWinner(hostResult: number, guestResult: number): DuelWinner {
  if (hostResult > guestResult) return 'host';
  if (guestResult > hostResult) return 'guest';
  return 'draw';
}

// Report my final height. If both results are now present, stamp the winner + settle the row (idempotent:
// whoever writes second computes it; a late reader just sees state='settled'). Returns the settled row
// when both are in, else null (still waiting on the opponent).
export async function reportResult(id: string, role: DuelRole, height: number): Promise<DuelRow | null> {
  if (!supabase) return null;
  const col = role === 'host' ? 'host_result' : 'guest_result';
  await supabase.from('duels').update({ [col]: Math.max(0, Math.floor(height)), updated_at: new Date().toISOString() }).eq('id', id);
  const row = await fetchDuel(id);
  if (!row) return null;
  if (row.state === 'settled') return row;
  if (row.host_result == null || row.guest_result == null) return null;
  const winner = decideWinner(row.host_result, row.guest_result);
  const { data } = await supabase.from('duels')
    .update({ winner, state: 'settled', updated_at: new Date().toISOString() })
    .eq('id', id).eq('state', 'locked').select('*').maybeSingle();   // only the first writer flips locked→settled
  return (data as DuelRow) ?? { ...row, winner, state: 'settled' };
}

// Void a duel (opponent never locked / disconnected / timed out) so both sides know to refund.
export async function voidDuel(id: string): Promise<void> {
  if (!supabase) return;
  await supabase.from('duels').update({ state: 'void', updated_at: new Date().toISOString() }).eq('id', id).neq('state', 'settled');
}

// What `mult` should THIS role credit on settlement: 2 if I won the pot, 1 on a draw (refund), 0 if I lost.
export function payoutMult(role: DuelRole, winner: DuelWinner): number {
  if (winner === 'draw') return 1;
  return winner === role ? 2 : 0;
}

// ---- the launch ticket (survives the world unmount, mirroring ouroo_game_origin) ----
// RoomCanvas stashes this right before launching the duel view; DuelClimbCanvas reads + clears it on mount.
// `friendly` duels carry no stake and no durable row — `id` is just the live channel name (makeMatchId).
export type DuelTicket = {
  id: string; seed: number; role: DuelRole; room: string;
  gameId: string;            // which game to run in duel mode (page.tsx routes on this)
  meHandle: string; oppHandle: string;
  friendly: boolean;
  meToken?: string; oppToken?: string;
  stake?: DuelStake;
};
const TICKET_KEY = 'ouroo_duel_ticket';
export function stashTicket(t: DuelTicket): void {
  try { localStorage.setItem(TICKET_KEY, JSON.stringify(t)); } catch { /* ignore */ }
}
export function readTicket(): DuelTicket | null {
  try { const s = localStorage.getItem(TICKET_KEY); return s ? JSON.parse(s) as DuelTicket : null; } catch { return null; }
}
export function clearTicket(): void {
  try { localStorage.removeItem(TICKET_KEY); } catch { /* ignore */ }
}
