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
  readTicket, clearTicket, reportResult, fetchDuel, voidDuel, creditStake, payoutMult, stakeLabel,
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
      const s = Number(p.score) || 0;
      oppScoreRef.current = Math.max(oppScoreRef.current, s);
      setOppScore(oppScoreRef.current);
    }).on('broadcast', { event: 'done' }, ({ payload }) => {
      const p = payload as { role?: string; score?: number };
      if (!p || p.role === t.role) return;
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

  const finish = useCallback((myScore: number) => {
    const t = ticketRef.current;
    if (!t) return;
    setSettling(true);
    try { channelRef.current?.send({ type: 'broadcast', event: 'done', payload: { role: t.role, score: myScore } }); } catch { /* ignore */ }
    const stake = t.stake;
    const stakeText = stake ? stakeLabel(stake) : '';

    const show = (winner: DuelWinner, oppScore: number, note = '') => {
      if (settledRef.current) return;
      settledRef.current = true;
      const iWon = winner !== 'draw' && winner === t.role;
      const draw = winner === 'draw';
      if (!t.friendly && stake) creditStake(stake, payoutMult(t.role, winner));   // wager payout
      setOutcome({ iWon, draw, myScore, oppScore, stakeText, note });
      setSettling(false);
    };

    // FRIENDLY: higher score wins. Resolve the instant the result is certain — opponent finished, OR their
    // live score already passed mine (they're ahead and still going → I've lost). Generous backstop otherwise.
    if (t.friendly) {
      const decide = (opp: number, note = '') => show(myScore > opp ? t.role : myScore === opp ? 'draw' : (t.role === 'host' ? 'guest' : 'host'), opp, note);
      if (oppDoneRef.current != null) { decide(oppDoneRef.current); return; }
      if (oppScoreRef.current > myScore) { decide(oppScoreRef.current); return; }   // already beaten
      let n = 0;
      const poll = setInterval(() => {
        if (settledRef.current) { clearInterval(poll); return; }
        if (oppDoneRef.current != null) { clearInterval(poll); decide(oppDoneRef.current); return; }
        if (oppScoreRef.current > myScore) { clearInterval(poll); decide(oppScoreRef.current); return; }
        if (++n >= 90) { clearInterval(poll); decide(oppScoreRef.current, `${t.oppHandle} didn't finish.`); }   // ~90s backstop
      }, 1000);
      return;
    }

    // WAGER: write my result to the durable row; settle when both are in (symmetric on both clients).
    void (async () => {
      let row = await reportResult(t.id, t.role, myScore).catch(() => null);
      const oppOf = (r: NonNullable<typeof row>) => t.role === 'host' ? (r.guest_result ?? 0) : (r.host_result ?? 0);
      if (row?.state === 'settled' && row.winner) { show(row.winner, oppOf(row)); return; }
      for (let i = 0; i < 18 && !settledRef.current; i++) {     // ~27s
        await new Promise(r => setTimeout(r, 1500));
        row = await fetchDuel(t.id).catch(() => null);
        if (row?.state === 'settled' && row.winner) { show(row.winner, oppOf(row)); return; }
        if (row?.state === 'void') { if (stake && !settledRef.current) { settledRef.current = true; creditStake(stake, 1); setOutcome({ iWon: false, draw: true, myScore, oppScore, stakeText, note: 'Duel voided — your ante was refunded.' }); setSettling(false); } return; }
      }
      if (!settledRef.current) {   // opponent never finished → void + refund
        settledRef.current = true;
        await voidDuel(t.id).catch(() => {});
        if (stake) creditStake(stake, 1);
        setOutcome({ iWon: false, draw: true, myScore, oppScore, stakeText, note: `${t.oppHandle} didn't finish — your ante was refunded.` });
        setSettling(false);
      }
    })();
  }, [oppScore]);

  return {
    isDuel: !!ticket,
    friendly: !!ticket?.friendly,
    ticket,
    oppHandle: ticket?.oppHandle ?? 'Opponent',
    oppScore, oppOut, settling, outcome, progress, finish,
  };
}
