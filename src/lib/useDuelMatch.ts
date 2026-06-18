'use client';

// useDuelMatch — the reusable 1v1 duel layer any game plugs into. "First to lose loses": both players
// run their own game; whoever scores higher (= survives longer / didn't bust first) wins. The game just
// streams its live score and calls finish(score) at game-over; this hook owns the live `duel:<id>`
// channel, the opponent's score, and settlement (friendly compare, or wager escrow payout via duel.ts).
//
// Launched with no ticket it's inert (isDuel=false) so a game runs as normal single-player.

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';
import {
  readTicket, clearTicket, reportResult, creditStake, payoutMult, stakeLabel,
  type DuelTicket, type DuelWinner,
} from './duel';

export type DuelOutcome = { iWon: boolean; draw: boolean; myScore: number; oppScore: number; stakeText: string; note: string };

// `enabled` is passed true only when the game was launched into the duel view, so a leftover ticket can
// never hijack a normal single-player run.
export function useDuelMatch(enabled: boolean): {
  isDuel: boolean;
  friendly: boolean;
  ticket: DuelTicket | null;
  oppHandle: string;
  oppScore: number;       // opponent's live score (for an on-screen meter)
  oppOut: boolean;        // opponent has finished
  settling: boolean;      // waiting on the opponent / pot settlement
  outcome: DuelOutcome | null;
  progress: (score: number) => void;   // stream my live score (throttled internally)
  finish: (score: number) => void;     // call once at game-over
} {
  const ticketRef = useRef<DuelTicket | null>(null);
  if (enabled && ticketRef.current === null) ticketRef.current = readTicket();   // read once, synchronously
  const ticket = enabled ? ticketRef.current : null;

  const channelRef = useRef<ReturnType<NonNullable<typeof supabase>['channel']> | null>(null);
  const oppDoneRef = useRef<number | null>(null);
  const oppScoreRef = useRef(0);   // latest opponent live score (for early resolution while waiting)
  const sawOppRef = useRef(false); // did we ever hear from the opponent? (refund a wager if they never showed)
  const settledRef = useRef(false);
  const tickAccRef = useRef(0);

  const [oppScore, setOppScore] = useState(0);
  const [oppOut, setOppOut] = useState(false);
  const [settling, setSettling] = useState(false);
  const [outcome, setOutcome] = useState<DuelOutcome | null>(null);

  // Connect the live channel for the match (once), then clear the ticket so a refresh doesn't re-enter.
  useEffect(() => {
    const t = ticket;
    if (!t || !supabase) return;
    const ch = supabase.channel(`duel:${t.id}`, { config: { broadcast: { self: false } } });
    channelRef.current = ch;
    ch.on('broadcast', { event: 'tick' }, ({ payload }) => {
      const p = payload as { role?: string; score?: number };
      if (!p || p.role === t.role) return;
      sawOppRef.current = true;
      const s = Number(p.score) || 0;
      oppScoreRef.current = Math.max(oppScoreRef.current, s);
      setOppScore(oppScoreRef.current);
    }).on('broadcast', { event: 'done' }, ({ payload }) => {
      const p = payload as { role?: string; score?: number };
      if (!p || p.role === t.role) return;
      sawOppRef.current = true;
      const s = Number(p.score) || 0;
      oppDoneRef.current = s;
      oppScoreRef.current = Math.max(oppScoreRef.current, s);
      setOppScore(oppScoreRef.current);
      setOppOut(true);
    }).subscribe();
    clearTicket();
    return () => { try { if (supabase) supabase.removeChannel(ch); } catch { /* ignore */ } channelRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const progress = useCallback((score: number) => {
    const t = ticketRef.current, ch = channelRef.current;
    if (!t || !ch) return;
    if (++tickAccRef.current < 10) return;   // ~6/sec at 60Hz
    tickAccRef.current = 0;
    ch.send({ type: 'broadcast', event: 'tick', payload: { role: t.role, score } });
  }, []);

  // Settle entirely over the live channel (no DB dependency): higher score wins ("first to lose loses").
  // Resolves the instant the result is certain — opponent finished, OR their live score already passed
  // mine. A wager pays out 2× to the winner / refunds a draw; if the opponent never showed at all, the
  // wager ante is refunded. The audit row (reportResult) is written best-effort and never blocks.
  const finish = useCallback((myScore: number) => {
    const t = ticketRef.current;
    if (!t) return;
    setSettling(true);
    try { channelRef.current?.send({ type: 'broadcast', event: 'done', payload: { role: t.role, score: myScore } }); } catch { /* ignore */ }
    const stake = t.stake;
    const stakeText = stake ? stakeLabel(stake) : '';

    const resolve = (oppScoreFinal: number, note = '') => {
      if (settledRef.current) return;
      settledRef.current = true;
      const iWon = myScore > oppScoreFinal, draw = myScore === oppScoreFinal;
      const winner: DuelWinner = iWon ? t.role : draw ? 'draw' : (t.role === 'host' ? 'guest' : 'host');
      if (!t.friendly && stake) creditStake(stake, payoutMult(t.role, winner));   // wager payout
      if (!t.friendly) void reportResult(t.id, t.role, myScore).catch(() => {});   // best-effort audit
      setOutcome({ iWon, draw, myScore, oppScore: oppScoreFinal, stakeText, note });
      setSettling(false);
    };
    const refund = (note: string) => {   // opponent never showed → give a wager ante back
      if (settledRef.current) return;
      settledRef.current = true;
      if (!t.friendly && stake) creditStake(stake, 1);
      setOutcome({ iWon: false, draw: true, myScore, oppScore: oppScoreRef.current, stakeText, note });
      setSettling(false);
    };

    if (oppDoneRef.current != null) { resolve(oppDoneRef.current); return; }
    if (oppScoreRef.current > myScore) { resolve(oppScoreRef.current); return; }   // already beaten
    let n = 0;
    const poll = setInterval(() => {
      if (settledRef.current) { clearInterval(poll); return; }
      if (oppDoneRef.current != null) { clearInterval(poll); resolve(oppDoneRef.current); return; }
      if (oppScoreRef.current > myScore) { clearInterval(poll); resolve(oppScoreRef.current); return; }
      if (++n >= 90) {   // ~90s backstop
        clearInterval(poll);
        if (sawOppRef.current) resolve(oppScoreRef.current, `${t.oppHandle} didn't finish.`);
        else if (!t.friendly) refund(`${t.oppHandle} never showed — your ante was refunded.`);
        else resolve(0, `${t.oppHandle} never showed.`);
      }
    }, 1000);
  }, []);

  return {
    isDuel: !!ticket,
    friendly: !!ticket?.friendly,
    ticket,
    oppHandle: ticket?.oppHandle ?? 'Opponent',
    oppScore, oppOut, settling, outcome, progress, finish,
  };
}
