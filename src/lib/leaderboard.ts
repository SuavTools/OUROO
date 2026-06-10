import { supabase, supabaseReady } from './supabase';
import { getAuthIdentity } from './auth';

export const GAME_ID = 'ouroo';            // OUROO arcade (default board)
export const LEAP_GAME_ID = 'ouroo-leap';  // OUROO LEAP — coin-to-coin auto-runner

export type LbEntry = { handle: string; score: number; player_id: string };
export type LbPeriod = 'all' | 'today';

// Read the leaderboard straight from the browser (RLS allows select). period 'today' reads the
// daily view (resets each day). Returns [] on any error so the UI never crashes.
export async function fetchLeaderboard(gameId = GAME_ID, limit = 10, period: LbPeriod = 'all'): Promise<LbEntry[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from(period === 'today' ? 'leaderboard_today' : 'leaderboard')
    .select('handle, score, player_id')
    .eq('game_id', gameId)
    .order('score', { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data as LbEntry[];
}

export type PlayerStats = { handle: string | null; best: number; runs: number; rank: number | null; playerId: string | null };

// Aggregate a player's stats (best score, run count, global rank) from existing score rows.
export async function getPlayerStats(device: string, gameId = GAME_ID): Promise<PlayerStats> {
  const empty: PlayerStats = { handle: null, best: 0, runs: 0, rank: null, playerId: null };
  if (!supabase || !device) return empty;
  const { data: player } = await supabase.from('players').select('id, handle').eq('device_token', device).maybeSingle();
  if (!player) return empty;
  const { data: rows } = await supabase
    .from('scores').select('score').eq('player_id', player.id).eq('game_id', gameId).order('score', { ascending: false });
  const best = rows?.[0]?.score ?? 0;
  const runs = rows?.length ?? 0;
  let rank: number | null = null;
  if (best > 0) {
    const { count } = await supabase
      .from('leaderboard').select('*', { count: 'exact', head: true }).eq('game_id', gameId).gt('score', best);
    rank = (count ?? 0) + 1;
  }
  return { handle: player.handle, best, runs, rank, playerId: player.id };
}

// Best score across EVERY game on the platform — drives skin unlocks, which are shared:
// a record set in any mode counts toward unlocking cosmetics for all of them.
export async function getBestAcrossGames(device: string): Promise<number> {
  if (!supabase || !device) return 0;
  const { data: player } = await supabase.from('players').select('id').eq('device_token', device).maybeSingle();
  if (!player) return 0;
  const { data: rows } = await supabase
    .from('scores').select('score').eq('player_id', player.id).order('score', { ascending: false }).limit(1);
  return rows?.[0]?.score ?? 0;
}

// Cristais earn basis: the sum of your BEST score in each game (peak performance, NOT total runs).
// This is deliberately grind-proof — replaying for the same score adds nothing; you only grow the
// basis by beating a personal record. One global number fed by the whole site. Degrades to 0.
export async function getCristalScoreBasis(device: string): Promise<number> {
  if (!supabase || !device) return 0;
  const { data: player } = await supabase.from('players').select('id').eq('device_token', device).maybeSingle();
  if (!player) return 0;
  const { data } = await supabase.from('scores').select('game_id, score').eq('player_id', player.id).limit(5000);
  if (!data) return 0;
  const best = new Map<string, number>();
  for (const r of data) { const g = String(r.game_id); const s = Number(r.score) || 0; if (s > (best.get(g) ?? 0)) best.set(g, s); }
  let sum = 0; for (const v of best.values()) sum += v; return sum;
}

// ---- local identity (anonymous device id; Discord can claim it later) ----
type LocalPlayer = { id: string | null; handle: string | null; device: string };

export function getLocalPlayer(): LocalPlayer {
  if (typeof window === 'undefined') return { id: null, handle: null, device: '' };
  let device = localStorage.getItem('ouroo_device');
  if (!device) {
    device = (crypto?.randomUUID?.() ?? `dev_${Date.now()}_${Math.floor(Math.random() * 1e9)}`);
    localStorage.setItem('ouroo_device', device);
  }
  return {
    id: localStorage.getItem('ouroo_pid'),
    handle: localStorage.getItem('ouroo_handle'),
    device,
  };
}

export function saveLocalPlayer(id: string, handle: string) {
  localStorage.setItem('ouroo_pid', id);
  localStorage.setItem('ouroo_handle', handle);
}

export type SubmitResult =
  | { ok: true; rank: number; handle: string; playerId: string }
  | { ok: false; error: string };

// Submit a score through the API route (server-side name filter + insert).
// gameId selects which board the run lands on (OUROO by default; pass LEAP_GAME_ID for Leap).
export async function submitScore(score: number, handle?: string, gameId: string = GAME_ID): Promise<SubmitResult> {
  if (!supabaseReady) return { ok: false, error: 'Leaderboard offline.' };
  const p = getLocalPlayer();
  // If signed in with Discord, use that stable identity (same player across devices) and name;
  // otherwise fall back to the anonymous device id. An explicit handle arg always wins.
  const auth = await getAuthIdentity();
  const device = auth?.device ?? p.device;
  const finalHandle = handle ?? auth?.handle ?? p.handle ?? '';
  try {
    const res = await fetch('/api/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gameId,
        score,
        device,
        handle: finalHandle,
      }),
    });
    const json = await res.json();
    if (!res.ok || !json.ok) return { ok: false, error: json.error || 'Erro ao enviar.' };
    saveLocalPlayer(json.playerId, json.handle);
    return { ok: true, rank: json.rank, handle: json.handle, playerId: json.playerId };
  } catch {
    return { ok: false, error: 'Sem ligação.' };
  }
}
