'use client';

import { useEffect, useRef, useState } from 'react';
import { useUser, signInWithDiscord } from '@/lib/auth';
import { fetchMessages, subscribeMessages, sendMessage, type ChatMessage } from '@/lib/chat';
import { MSG_MAX } from '@/lib/names';

export function ChatModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useUser();
  const [msgs, setMsgs] = useState<ChatMessage[] | null>(null);
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastSent = useRef(0);

  // Load history + subscribe while open.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setMsgs(null);
    fetchMessages(50).then(m => { if (alive) setMsgs(m); });
    const unsub = subscribeMessages(m => {
      setMsgs(prev => (prev ? (prev.some(x => x.id === m.id) ? prev : [...prev, m]) : [m]));
    });
    return () => { alive = false; unsub(); };
  }, [open]);

  // Auto-scroll to newest.
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs]);

  if (!open) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    const now = Date.now();
    if (now - lastSent.current < 1500) { setErr('Espera um segundo…'); return; }
    setSending(true);
    const res = await sendMessage(text);
    setSending(false);
    if (res.ok) { setText(''); lastSent.current = now; }
    else setErr(res.error);
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/95 backdrop-blur-sm flex justify-center" onClick={onClose}>
      <div className="w-full max-w-lg flex flex-col" onClick={e => e.stopPropagation()}
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1rem)', paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pb-3 border-b border-white/10">
          <div>
            <h2 className="font-helvetica font-black text-xl text-white">Comunidade</h2>
            <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">SUAV · OUROO</p>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white text-2xl leading-none">✕</button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 min-h-0">
          {msgs === null && <p className="text-white/40 text-sm">A carregar…</p>}
          {msgs?.length === 0 && <p className="text-white/40 text-sm">Ainda sem mensagens. Diz olá 👋</p>}
          {msgs?.map(m => (
            <div key={m.id} className="flex items-start gap-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {m.avatar
                ? <img src={m.avatar} alt="" className="w-7 h-7 rounded-full border border-white/15 mt-0.5 shrink-0" />
                : <div className="w-7 h-7 rounded-full border border-white/15 bg-white/5 mt-0.5 shrink-0 flex items-center justify-center text-[10px] text-white/60">{m.handle.slice(0, 1).toUpperCase()}</div>}
              <div className="min-w-0">
                <span className="text-[12px] font-bold text-brandRed">{m.handle}</span>
                <p className="text-sm text-white/90 break-words whitespace-pre-wrap leading-snug">{m.body}</p>
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Composer */}
        <div className="px-5 pt-3 border-t border-white/10">
          {user ? (
            <form onSubmit={submit} className="flex items-center gap-2">
              <input
                value={text}
                onChange={e => { setText(e.target.value); setErr(''); }}
                maxLength={MSG_MAX}
                placeholder="Escreve algo…"
                className="flex-1 min-w-0 bg-white/5 border border-white/15 text-white px-3 py-2.5 text-sm focus:border-brandRed outline-none rounded-none"
              />
              <button type="submit" disabled={sending || !text.trim()}
                className="bg-brandRed text-black font-bold uppercase text-xs tracking-widest px-4 py-2.5 hover:bg-white transition-colors active:scale-95 disabled:opacity-50">
                Enviar
              </button>
            </form>
          ) : (
            <button onClick={() => signInWithDiscord()} className="w-full bg-[#5865F2] text-white font-bold uppercase text-xs tracking-widest py-3 hover:opacity-90 transition-opacity">
              Liga o Discord para participar
            </button>
          )}
          {err && <p className="text-brandRed text-[11px] mt-1.5">{err}</p>}
        </div>
      </div>
    </div>
  );
}
