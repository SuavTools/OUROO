import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { validateHandle } from '@/lib/names';

export const dynamic = 'force-dynamic';

const ALLOWED_GAMES = new Set(['ouroo', 'ouroo-leap']);

export async function POST(request: Request) {
  if (!supabase) return NextResponse.json({ ok: false, error: 'Leaderboard offline.' }, { status: 503 });

  let body: { gameId?: string; score?: number; device?: string; handle?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, error: 'Pedido inválido.' }, { status: 400 }); }

  const gameId = String(body.gameId || 'ouroo');
  if (!ALLOWED_GAMES.has(gameId)) return NextResponse.json({ ok: false, error: 'Jogo desconhecido.' }, { status: 400 });

  const score = Math.floor(Number(body.score));
  if (!Number.isFinite(score) || score < 0 || score > 100_000_000)
    return NextResponse.json({ ok: false, error: 'Pontuação inválida.' }, { status: 400 });

  const device = String(body.device || '').slice(0, 100);
  if (!device) return NextResponse.json({ ok: false, error: 'Sem identificação de dispositivo.' }, { status: 400 });

  // Server-side name enforcement — this is the real gate, not the client.
  const check = validateHandle(String(body.handle || ''));
  if (!check.ok) return NextResponse.json({ ok: false, error: check.error }, { status: 400 });
  const handle = check.value;

  // Find or create the player for this device.
  let playerId: string | null = null;
  const { data: existing } = await supabase.from('players').select('id').eq('device_token', device).maybeSingle();
  if (existing?.id) {
    playerId = existing.id;
  } else {
    const { data: created, error: insErr } = await supabase
      .from('players').insert({ handle, device_token: device }).select('id').single();
    if (created?.id) playerId = created.id;
    else {
      // Likely a race on the unique device_token — re-read.
      const { data: again } = await supabase.from('players').select('id').eq('device_token', device).maybeSingle();
      playerId = again?.id ?? null;
      if (!playerId) return NextResponse.json({ ok: false, error: insErr?.message || 'Erro de jogador.' }, { status: 500 });
    }
  }

  // Record the run.
  const { error: scoreErr } = await supabase.from('scores').insert({ game_id: gameId, player_id: playerId, handle, score });
  if (scoreErr) return NextResponse.json({ ok: false, error: scoreErr.message }, { status: 500 });

  // Player's best score in this game, then rank = (#players with a better best) + 1.
  const { data: best } = await supabase
    .from('leaderboard').select('score').eq('game_id', gameId).eq('player_id', playerId).maybeSingle();
  const bestScore = best?.score ?? score;
  const { count } = await supabase
    .from('leaderboard').select('*', { count: 'exact', head: true }).eq('game_id', gameId).gt('score', bestScore);
  const rank = (count ?? 0) + 1;

  return NextResponse.json({ ok: true, playerId, handle, rank });
}
