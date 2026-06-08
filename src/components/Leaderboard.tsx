'use client';

import { useEffect, useState } from 'react';
import { fetchLeaderboard, type LbEntry, type LbPeriod, GAME_ID } from '@/lib/leaderboard';

// Unified leaderboard list. game prop lets future games reuse it; highlight marks the current player.
// showToggle adds a Global / Hoje (daily) switch — the daily board is the "desafio diário".
export function Leaderboard({
  game = GAME_ID,
  limit = 10,
  highlightId,
  refreshKey,
  compact = false,
  showToggle = false,
}: {
  game?: string;
  limit?: number;
  highlightId?: string | null;
  refreshKey?: number;
  compact?: boolean;
  showToggle?: boolean;
}) {
  const [rows, setRows] = useState<LbEntry[] | null>(null);
  const [period, setPeriod] = useState<LbPeriod>('all');

  useEffect(() => {
    let alive = true;
    setRows(null);
    fetchLeaderboard(game, limit, period).then(r => { if (alive) setRows(r); });
    return () => { alive = false; };
  }, [game, limit, refreshKey, period]);

  const toggle = showToggle ? (
    <div className="flex gap-1 mb-3 text-[10px] uppercase tracking-[0.2em]">
      {(['all', 'today'] as LbPeriod[]).map(p => (
        <button key={p} onClick={() => setPeriod(p)}
          className={`px-3 py-1.5 font-bold transition-colors ${period === p ? 'bg-brandRed text-black' : 'text-white/40 hover:text-white border border-white/15'}`}>
          {p === 'all' ? 'Global' : 'Hoje'}
        </button>
      ))}
    </div>
  ) : null;

  if (rows === null) {
    return <>{toggle}<p className={`text-white/40 ${compact ? 'text-xs' : 'text-sm'}`}>A carregar ranking…</p></>;
  }
  if (rows.length === 0) {
    return <>{toggle}<p className={`text-white/40 ${compact ? 'text-xs' : 'text-sm'}`}>{period === 'today' ? 'Ainda ninguém jogou hoje — abre o desafio. 🏁' : 'Ainda sem pontuações — sê o primeiro. 👑'}</p></>;
  }

  return (
    <>
    {toggle}
    <ol className="divide-y divide-white/10">
      {rows.map((r, i) => {
        const me = highlightId && r.player_id === highlightId;
        return (
          <li
            key={r.player_id}
            className={`flex items-center justify-between gap-3 ${compact ? 'py-2' : 'py-3'} ${me ? 'text-brandRed' : ''}`}
          >
            <div className="flex items-baseline gap-3 min-w-0">
              <span className={`font-helvetica font-black tabular-nums w-7 shrink-0 ${i === 0 ? 'text-brandYellow' : me ? 'text-brandRed' : 'text-white/40'} ${compact ? 'text-sm' : 'text-lg'}`}>
                {i + 1}
              </span>
              <span className={`truncate font-bold uppercase tracking-wide ${compact ? 'text-xs' : 'text-sm'} ${me ? 'text-brandRed' : 'text-white'}`}>
                {r.handle}{me ? ' ·' : ''}
              </span>
            </div>
            <span className={`tabular-nums font-bold shrink-0 ${compact ? 'text-xs' : 'text-sm'} ${me ? 'text-brandRed' : 'text-white/70'}`}>
              {r.score.toLocaleString('pt-PT')}
            </span>
          </li>
        );
      })}
    </ol>
    </>
  );
}
