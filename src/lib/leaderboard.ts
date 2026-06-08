import { supabase, supabaseReady } from './supabase';
import { getAuthIdentity } from './auth';

export const GAME_ID = 'ouroo';

export type LbEntry = { handle: string; score: number; player_id: string };

// Read the leaderboard straight from the browser (RLS allows select). Returns [] if Supabase
// isn't configured yet or on any error, so the UI never crashes.
export async function fetchLeaderboard(gameId = GAME_ID, limit = 10): Promise<LbEntry[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('leaderboard')
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
export async function submitScore(score: number, handle?: string): Promise<SubmitResult> {
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
        gameId: GAME_ID,
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
