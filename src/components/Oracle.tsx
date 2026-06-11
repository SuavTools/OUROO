'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { askOracle, deckFor, ORACLE_OPENERS, type LoreCard } from '@/lib/lore';

// The Oracle: a self-paced lore codex you can read like a pocket deck, plus a question-and-answer
// terminal that always replies (pre-written, keyword-matched). Opened from a room; styled to match the
// cold-open Intro — mono, cyan signal, scanlines.

type Turn = { who: 'you' | 'oracle'; text: string };

export function Oracle({ open, onClose, roomSlug, roomName }: { open: boolean; onClose: () => void; roomSlug?: string; roomName?: string }) {
  const [tab, setTab] = useState<'read' | 'ask'>('read');
  const cards: LoreCard[] = useMemo(() => deckFor(roomSlug), [roomSlug]);
  const [page, setPage] = useState(0);
  const [convo, setConvo] = useState<Turn[]>([]);
  const [draft, setDraft] = useState('');
  const [suggested, setSuggested] = useState<string[]>(ORACLE_OPENERS);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // First open seeds a greeting; reset the page when the room (and thus the deck) changes.
  useEffect(() => { setPage(0); }, [roomSlug]);
  useEffect(() => {
    if (open && convo.length === 0) setConvo([{ who: 'oracle', text: 'I am the Oracle. I keep what OUROO remembers of itself — and I am honest about what it has forgotten. Read the manuscript, or ask me anything.' }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => { if (tab === 'ask') scrollRef.current?.scrollTo({ top: 9e9, behavior: 'smooth' }); }, [convo, tab]);

  if (!open) return null;

  const ask = (qRaw: string) => {
    const q = qRaw.trim(); if (!q) return;
    const r = askOracle(q);
    setConvo(c => [...c, { who: 'you', text: q }, { who: 'oracle', text: r.a }]);
    setSuggested(r.next && r.next.length ? r.next : ORACLE_OPENERS);
    setDraft('');
  };

  const card = cards[page];

  return (
    <div className="fixed inset-0 z-[80] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4"
      style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1rem)', paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)' }}>
      {/* scanline wash */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.05]" style={{ backgroundImage: 'repeating-linear-gradient(0deg, #fff 0px, #fff 1px, transparent 1px, transparent 3px)' }} />

      <div className="relative w-full max-w-lg h-[78vh] max-h-[640px] border border-[#00cfff]/30 bg-black flex flex-col overflow-hidden"
        style={{ boxShadow: '0 0 60px rgba(0,207,255,0.08)' }}>
        {/* signal glow */}
        <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(circle at 50% 0%, rgba(0,207,255,0.10), transparent 55%)' }} />

        {/* header */}
        <div className="relative flex items-center justify-between px-5 pt-4 pb-3 border-b border-white/10">
          <div>
            <p className="font-mono text-[#00cfff] text-sm tracking-[0.25em] uppercase">The Oracle</p>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/30 mt-0.5">{roomName ? `reading from · ${roomName}` : 'the manuscript'}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-white/40 hover:text-white text-xl leading-none px-2 -mr-2">×</button>
        </div>

        {/* tabs */}
        <div className="relative flex gap-1 px-5 pt-3">
          {(['read', 'ask'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`font-mono text-[11px] uppercase tracking-[0.2em] px-3 py-1.5 border-b-2 transition-colors ${tab === t ? 'text-[#00cfff] border-[#00cfff]' : 'text-white/40 border-transparent hover:text-white/70'}`}>
              {t === 'read' ? 'Manuscript' : 'Ask'}
            </button>
          ))}
        </div>

        {tab === 'read' ? (
          <div className="relative flex-1 flex flex-col px-6 py-5 min-h-0">
            <div key={page} className="flex-1 overflow-y-auto animate-[oFade_0.35s_ease]">
              <p className="font-mono text-[#00cfff] text-[13px] tracking-[0.18em] uppercase mb-4">{card.title}</p>
              <p className="text-white/80 text-[14px] leading-[1.75] whitespace-pre-line">{card.body}</p>
            </div>
            <div className="flex items-center justify-between pt-4 mt-3 border-t border-white/10">
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                className="font-mono text-[11px] uppercase tracking-[0.2em] text-white/60 hover:text-white disabled:opacity-20 disabled:hover:text-white/60">◂ Prev</button>
              <span className="font-mono text-[10px] tracking-[0.2em] text-white/30">{page + 1} / {cards.length}</span>
              <button onClick={() => setPage(p => Math.min(cards.length - 1, p + 1))} disabled={page === cards.length - 1}
                className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#00cfff] hover:text-white disabled:opacity-20 disabled:hover:text-[#00cfff]">Next ▸</button>
            </div>
          </div>
        ) : (
          <div className="relative flex-1 flex flex-col min-h-0">
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {convo.map((t, i) => (
                <div key={i} className={t.who === 'you' ? 'text-right' : ''}>
                  <p className={`font-mono text-[9px] uppercase tracking-[0.2em] mb-1 ${t.who === 'you' ? 'text-white/30' : 'text-[#00cfff]/60'}`}>{t.who === 'you' ? 'you' : 'oracle'}</p>
                  <p className={`text-[13.5px] leading-[1.7] ${t.who === 'you' ? 'text-white/55' : 'text-white/85'} ${t.who === 'oracle' ? 'border-l-2 border-[#00cfff]/30 pl-3' : ''}`}>{t.text}</p>
                </div>
              ))}
            </div>
            {/* suggested questions */}
            <div className="px-5 pb-2 flex flex-wrap gap-1.5">
              {suggested.map(s => (
                <button key={s} onClick={() => ask(s)} className="font-mono text-[10px] text-[#00cfff]/80 border border-[#00cfff]/25 px-2 py-1 hover:bg-[#00cfff] hover:text-black transition-colors">{s}</button>
              ))}
            </div>
            {/* input */}
            <div className="px-5 pb-5 pt-1 flex gap-2 border-t border-white/10 mt-1">
              <input value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') ask(draft); }}
                placeholder="Ask the Oracle…" maxLength={160}
                className="flex-1 bg-black border border-white/20 px-3 py-2.5 text-[13px] text-white placeholder:text-white/25 focus:border-[#00cfff]/60 outline-none font-mono" />
              <button onClick={() => ask(draft)} className="bg-[#00cfff] text-black font-bold uppercase text-[11px] tracking-widest px-4 active:scale-95 hover:bg-white transition-colors">Ask ▸</button>
            </div>
          </div>
        )}
      </div>
      <style>{`@keyframes oFade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}`}</style>
    </div>
  );
}
