'use client';

import { useEffect, useState } from 'react';
import { fetchLeaderboard, type LbEntry, GAME_ID } from '@/lib/leaderboard';

// Unified leaderboard list. game prop lets future games reuse it; highlight marks the current player.
export function Leaderboard({
  game = GAME_ID,
  limit = 10,
  highlightId,
  refreshKey,
  compact = false,
}: {
  game?: string;
  limit?: number;
  highlightId?: string | null;
  refreshKey?: number;
  compact?: boolean;
}) {
  const [rows, setRows] = useState<LbEntry[] | null>(null);

  useEffect(() => {
    let alive = true;
    fetchLeaderboard(game, limit).then(r => { if (alive) setRows(r); });
    return () => { alive = false; };
  }, [game, limit, refreshKey]);

  if (rows === null) {
    return <p className={`text-white/40 ${compact ? 'text-xs' : 'text-sm'}`}>A carregar ranking…</p>;
  }
  if (rows.length === 0) {
    return <p className={`text-white/40 ${compact ? 'text-xs' : 'text-sm'}`}>Ainda sem pontuações — sê o primeiro. 👑</p>;
  }

  return (
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
  );
}
