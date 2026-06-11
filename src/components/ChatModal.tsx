'use client';

import { useEffect, useRef, useState } from 'react';
import { useUser, signInWithDiscord } from '@/lib/auth';
import { fetchChannels, fetchMessages, subscribeMessages, sendMessage, createChannel, deleteMessage, deleteChannel, amIModerator, banUser, setChannelPinned, type ChatMessage, type Channel } from '@/lib/chat';
import { MSG_MAX } from '@/lib/names';
import { MessageBody } from '@/components/MessageBody';

export function ChatModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useUser();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [active, setActive] = useState<Channel | null>(null);
  const [msgs, setMsgs] = useState<ChatMessage[] | null>(null);
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const [sending, setSending] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [agreed, setAgreed] = useState(true);
  const [isMod, setIsMod] = useState(false);
  const [pinEditing, setPinEditing] = useState(false);
  const [pinText, setPinText] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastSent = useRef(0);
  const myId = user?.id;

  useEffect(() => { if (typeof window !== 'undefined') setAgreed(localStorage.getItem('ouroo_chat_ok') === '1'); }, []);
  useEffect(() => { if (open) amIModerator().then(setIsMod); else setIsMod(false); }, [open, user]);

  // Load channels when opened.
  useEffect(() => {
    if (!open) return;
    fetchChannels().then(cs => {
      setChannels(cs);
      setActive(prev => prev && cs.some(c => c.id === prev.id) ? prev : (cs.find(c => c.slug === 'geral') ?? cs[0] ?? null));
    });
  }, [open]);

  // Load + subscribe to the active channel's messages.
  useEffect(() => {
    if (!open || !active) return;
    let alive = true;
    setMsgs(null);
    fetchMessages(active.id).then(m => { if (alive) setMsgs(m); });
    const unsub = subscribeMessages(active.id, {
      onInsert: m => setMsgs(prev => (prev ? (prev.some(x => x.id === m.id) ? prev : [...prev, m]) : [m])),
      onDelete: id => setMsgs(prev => (prev ? prev.filter(x => x.id !== id) : prev)),
    });
    return () => { alive = false; unsub(); };
  }, [open, active]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs]);

  if (!open) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr('');
    if (!active) return;
    const now = Date.now();
    if (now - lastSent.current < 1500) { setErr('Wait a sec…'); return; }
    setSending(true);
    const res = await sendMessage(active.id, text);
    setSending(false);
    if (res.ok) { setText(''); lastSent.current = now; } else setErr(res.error);
  };

  const submitNewChannel = async (e: React.FormEvent) => {
    e.preventDefault(); setErr('');
    const res = await createChannel(newName);
    if (res.ok) {
      setChannels(cs => [...cs, res.channel]);
      setActive(res.channel); setCreating(false); setNewName('');
    } else setErr(res.error);
  };

  const removeMessage = async (id: number) => {
    setMsgs(prev => (prev ? prev.filter(x => x.id !== id) : prev));
    await deleteMessage(id);
  };
  const ban = async (m: ChatMessage) => {
    if (!confirm(`Ban ${m.handle} and delete their messages?`)) return;
    setMsgs(prev => (prev ? prev.filter(x => x.user_id !== m.user_id) : prev));
    await banUser(m.user_id);
  };
  const removeChannel = async () => {
    if (!active || active.is_system) return;
    if (!confirm(`Delete the room "${active.name}"?`)) return;
    await deleteChannel(active.id);
    setChannels(cs => cs.filter(c => c.id !== active.id));
    setActive(channels.find(c => c.slug === 'geral') ?? null);
  };
  const canDeleteRoom = !!active && !active.is_system && (active.created_by === myId || isMod);

  const savePin = async () => {
    if (!active) return;
    const ok = await setChannelPinned(active.id, pinText);
    if (ok) {
      const updated = { ...active, pinned: pinText.trim() || null };
      setActive(updated);
      setChannels(cs => cs.map(c => (c.id === active.id ? updated : c)));
      setPinEditing(false);
    }
  };

  const accept = () => { localStorage.setItem('ouroo_chat_ok', '1'); setAgreed(true); };

  return (
    <div className="fixed inset-0 z-[70] bg-black/95 backdrop-blur-sm flex justify-center" onClick={onClose}>
      <div className="w-full max-w-lg flex flex-col" onClick={e => e.stopPropagation()}
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1rem)', paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pb-3">
          <div>
            <h2 className="font-helvetica font-black text-xl text-white">Community</h2>
            <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">Public · moderated · be cool 🙏</p>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white text-2xl leading-none">✕</button>
        </div>

        {/* Channel tabs */}
        <div className="flex items-center gap-2 px-5 pb-3 overflow-x-auto border-b border-white/10 [scrollbar-width:none]">
          {channels.map(c => (
            <button key={c.id} onClick={() => setActive(c)}
              className={`shrink-0 px-3 py-1.5 text-xs font-bold uppercase tracking-widest transition-colors ${active?.id === c.id ? 'bg-brandRed text-black' : 'text-white/50 hover:text-white border border-white/15'}`}>
              {c.kind === 'radio' ? '📻 ' : '# '}{c.name}
            </button>
          ))}
          {user && <button onClick={() => { setCreating(v => !v); setErr(''); }} className="shrink-0 px-3 py-1.5 text-xs font-bold text-white/50 hover:text-white border border-white/15">＋</button>}
        </div>

        {creating && (
          <form onSubmit={submitNewChannel} className="px-5 py-2 flex gap-2 border-b border-white/10">
            <input value={newName} onChange={e => { setNewName(e.target.value); setErr(''); }} maxLength={16} autoFocus placeholder="Room name (3–16)"
              className="flex-1 min-w-0 bg-white/5 border border-white/15 text-white px-3 py-2 text-sm outline-none focus:border-brandRed" />
            <button type="submit" className="bg-white text-black font-bold uppercase text-xs px-3 tracking-widest active:scale-95">Create</button>
          </form>
        )}

        {/* Mod / room controls */}
        {(isMod || canDeleteRoom) && (
          <div className="flex items-center justify-between px-5 pt-2 text-[10px] uppercase tracking-widest">
            <span className="text-brandYellow/70">{isMod ? '🛡 Moderator' : ''}</span>
            {canDeleteRoom && <button onClick={removeChannel} className="text-white/30 hover:text-brandRed">🗑 Delete room</button>}
          </div>
        )}

        {/* Pinned message */}
        {active && (active.pinned || isMod) && (
          <div className="px-5 pt-2">
            <div className="border border-brandYellow/30 bg-brandYellow/[0.04] p-3">
              <div className="flex items-start justify-between gap-2">
                <span className="text-[10px] uppercase tracking-widest text-brandYellow/70">📌 Pinned</span>
                {isMod && !pinEditing && <button onClick={() => { setPinText(active.pinned || ''); setPinEditing(true); }} className="text-[10px] uppercase tracking-widest text-white/40 hover:text-white">Edit</button>}
              </div>
              {pinEditing ? (
                <div className="mt-1.5">
                  <textarea value={pinText} onChange={e => setPinText(e.target.value)} rows={5}
                    className="w-full bg-white/5 border border-white/15 text-white text-sm p-2 outline-none focus:border-brandRed resize-y" />
                  <div className="flex gap-2 mt-1.5">
                    <button onClick={savePin} className="bg-brandRed text-black font-bold uppercase text-[10px] tracking-widest px-3 py-1.5 active:scale-95">Save</button>
                    <button onClick={() => setPinEditing(false)} className="text-white/40 text-[10px] uppercase tracking-widest px-2">Cancel</button>
                  </div>
                </div>
              ) : active.pinned ? (
                <p className="mt-1 text-[13px] text-white/80 whitespace-pre-wrap leading-relaxed max-h-36 overflow-y-auto">{active.pinned}</p>
              ) : (
                <p className="mt-1 text-[12px] text-white/30">No pinned message. Tap &quot;Edit&quot; to add one.</p>
              )}
            </div>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 min-h-0">
          {msgs === null && <p className="text-white/40 text-sm">Loading…</p>}
          {msgs?.length === 0 && <p className="text-white/40 text-sm">No messages here yet. Say hi 👋</p>}
          {msgs?.map(m => (
            <div key={m.id} className="flex items-start gap-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {m.avatar
                ? <img src={m.avatar} alt="" className="w-7 h-7 rounded-full border border-white/15 mt-0.5 shrink-0" />
                : <div className="w-7 h-7 rounded-full border border-white/15 bg-white/5 mt-0.5 shrink-0 flex items-center justify-center text-[10px] text-white/60">{m.handle.slice(0, 1).toUpperCase()}</div>}
              <div className="min-w-0 group">
                <span className="text-[12px] font-bold text-brandRed">{m.handle}{isMod && m.user_id === myId ? ' ·' : ''}</span>
                <MessageBody text={m.body} />
                {(isMod || m.user_id === myId) && (
                  <div className="flex gap-3 mt-0.5">
                    <button onClick={() => removeMessage(m.id)} className="text-[10px] uppercase tracking-wider text-white/30 hover:text-white">Delete</button>
                    {isMod && m.user_id !== myId && <button onClick={() => ban(m)} className="text-[10px] uppercase tracking-wider text-brandRed/60 hover:text-brandRed">Ban</button>}
                  </div>
                )}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Composer */}
        <div className="px-5 pt-3 border-t border-white/10">
          {user ? (
            <form onSubmit={submit} className="flex items-center gap-2">
              <input value={text} onChange={e => { setText(e.target.value); setErr(''); }} maxLength={MSG_MAX} placeholder={`Message #${active?.name ?? ''}…`}
                className="flex-1 min-w-0 bg-white/5 border border-white/15 text-white px-3 py-2.5 text-sm focus:border-brandRed outline-none" />
              <button type="submit" disabled={sending || !text.trim()} className="bg-brandRed text-black font-bold uppercase text-xs tracking-widest px-4 py-2.5 hover:bg-white transition-colors active:scale-95 disabled:opacity-50">Send</button>
            </form>
          ) : (
            <button onClick={() => signInWithDiscord()} className="w-full bg-[#5865F2] text-white font-bold uppercase text-xs tracking-widest py-3 hover:opacity-90 transition-opacity">Sign in with Discord to join</button>
          )}
          {err && <p className="text-brandRed text-[11px] mt-1.5">{err}</p>}
        </div>

        {/* First-time disclaimer */}
        {!agreed && (
          <div className="absolute inset-0 bg-black/95 flex items-center justify-center p-6" onClick={e => e.stopPropagation()}>
            <div className="max-w-sm border border-white/15 p-6 space-y-3">
              <h3 className="font-helvetica font-black text-lg text-white">Before you jump in</h3>
              <p className="text-sm text-white/70 leading-relaxed"><b>Public, moderated chat.</b> No hate, harassment, spam or inappropriate content. Messages are tied to your Discord account. You must be 13 or older. By joining, you agree to these rules.</p>
              <div className="flex gap-2 pt-1">
                <button onClick={accept} className="flex-1 bg-brandRed text-black font-bold uppercase text-xs tracking-widest py-3 active:scale-95">Got it</button>
                <button onClick={onClose} className="px-4 text-white/40 hover:text-white text-xs uppercase tracking-widest">Leave</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
