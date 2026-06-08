import { supabase, supabaseReady } from './supabase';

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
  try {
    const res = await fetch('/api/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gameId: GAME_ID,
        score,
        device: p.device,
        handle: handle ?? p.handle ?? '',
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
