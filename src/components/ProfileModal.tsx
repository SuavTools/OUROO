'use client';

import { useEffect, useState } from 'react';
import { useUser, signOut, getAuthIdentity } from '@/lib/auth';
import { getPlayerStats, getBestAcrossGames, getLocalPlayer, type PlayerStats } from '@/lib/leaderboard';
import { amIModerator } from '@/lib/chat';
import { Leaderboard } from '@/components/Leaderboard';
import { shareStatsCard } from '@/lib/sharecard';
import { SKINS, isSkinUnlocked, getSelectedSkinId, setSelectedSkinId, DEFAULT_SKIN_ID, skinById, fmtScore } from '@/lib/skins';
import { SkinPreview } from '@/components/SkinPreview';
import { fetchUnlocks, redeemCode, createCode } from '@/lib/economy';

export function ProfileModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useUser();
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [unlockBest, setUnlockBest] = useState(0);   // best across ALL games — skins unlock from this, not just OUROO
  const [skin, setSkin] = useState(DEFAULT_SKIN_ID);
  const [sharing, setSharing] = useState(false);
  const [allUnlocked, setAllUnlocked] = useState(false);   // moderators (SUAV) get every skin
  const [codeUnlocks, setCodeUnlocks] = useState<string[]>([]);
  const [codeInput, setCodeInput] = useState('');
  const [codeMsg, setCodeMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => { if (typeof window !== 'undefined') setSkin(getSelectedSkinId()); }, [open]);
  useEffect(() => { if (open) { amIModerator().then(setAllUnlocked); fetchUnlocks().then(setCodeUnlocks); } }, [open, user]);

  const redeem = async (e: React.FormEvent) => {
    e.preventDefault(); setCodeMsg(null);
    const res = await redeemCode(codeInput);
    if (res.ok) {
      setCodeUnlocks(u => (u.includes(res.skinId) ? u : [...u, res.skinId]));
      setCodeMsg({ ok: true, text: `Unlocked: ${skinById(res.skinId).name} 🛸` });
      setCodeInput('');
    } else setCodeMsg({ ok: false, text: res.error });
  };

  useEffect(() => {
    if (!open) return;
    setStats(null);
    (async () => {
      const auth = await getAuthIdentity();
      const device = auth?.device ?? getLocalPlayer().device;
      const [s, allBest] = await Promise.all([getPlayerStats(device), getBestAcrossGames(device)]);
      setStats(s);
      setUnlockBest(Math.max(allBest, s.best));
    })();
  }, [open, user]);

  if (!open) return null;

  const best = stats?.best ?? 0;
  const pickSkin = (id: string, unlocked: boolean) => { if (!unlocked) return; setSkin(id); setSelectedSkinId(id); };

  const doShare = async () => {
    setSharing(true);
    await shareStatsCard({ name: user?.name || stats?.handle || 'OUROO', avatar: user?.avatar, best, rank: stats?.rank ?? null });
    setSharing(false);
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/90 backdrop-blur-sm flex justify-center overflow-y-auto" onClick={onClose}>
      <div className="w-full max-w-lg min-h-full px-5" onClick={e => e.stopPropagation()}
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 2rem)', paddingBottom: 'calc(env(safe-area-inset-bottom) + 2rem)' }}>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3 min-w-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {user?.avatar
              ? <img src={user.avatar} alt="" className="w-12 h-12 rounded-full border border-white/20" />
              : <div className="w-12 h-12 rounded-full border border-white/20 bg-white/5 flex items-center justify-center font-helvetica font-black text-white/70">{(user?.name || stats?.handle || '?').slice(0, 1).toUpperCase()}</div>}
            <div className="min-w-0">
              <p className="font-helvetica font-black text-xl text-white truncate">{user?.name || stats?.handle || 'Player'}</p>
              <p className="text-[11px] uppercase tracking-[0.2em] text-white/40">{user ? 'Discord' : 'Anonymous'}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white text-2xl leading-none">✕</button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { k: 'Rank', v: stats?.rank != null ? `#${stats.rank}` : '—', accent: 'text-brandYellow' },
            { k: 'Best', v: best ? best.toLocaleString('pt-PT') : '—', accent: 'text-white' },
            { k: 'Runs', v: stats ? String(stats.runs) : '—', accent: 'text-white' },
          ].map(s => (
            <div key={s.k} className="border border-white/10 p-4 text-center">
              <p className={`font-helvetica font-black text-2xl ${s.accent} tabular-nums`}>{stats === null ? '…' : s.v}</p>
              <p className="text-[10px] uppercase tracking-[0.2em] text-white/40 mt-1">{s.k}</p>
            </div>
          ))}
        </div>

        {/* Share */}
        <button onClick={doShare} disabled={sharing}
          className="w-full mb-7 bg-brandRed text-black font-bold uppercase tracking-[0.2em] text-sm py-3.5 hover:bg-white transition-colors active:scale-[0.99] disabled:opacity-60">
          {sharing ? 'Generating…' : '↗ Share my card'}
        </button>

        {/* Skins */}
        <div className="mb-7">
          <div className="flex items-end justify-between mb-3">
            <h3 className="font-helvetica font-black text-lg text-white">Skins</h3>
            <span className="text-[10px] uppercase tracking-[0.2em] text-white/40">Earn by playing</span>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {SKINS.map(s => {
              const unlocked = allUnlocked || isSkinUnlocked(s, unlockBest, codeUnlocks);
              const selected = skin === s.id;
              const hint = s.unlock.type === 'score' ? fmtScore(s.unlock.need)
                : s.unlock.type === 'code' ? '🔒 code' : '';
              return (
                <button key={s.id} onClick={() => pickSkin(s.id, unlocked)} title={unlocked ? s.name : hint}
                  className={`relative aspect-square border flex flex-col items-center justify-center gap-0.5 transition-all ${selected ? 'border-white' : 'border-white/10'} ${unlocked ? 'hover:border-white/50' : ''}`}>
                  <SkinPreview skin={s} size={40} locked={!unlocked} />
                  {!unlocked && <span className="absolute inset-0 flex items-center justify-center text-sm">{s.unlock.type === 'code' ? '🔒' : ''}</span>}
                  {!unlocked && s.unlock.type === 'score' && <span className="text-[8px] text-white/40">{hint}</span>}
                  {selected && <span className="absolute top-1 right-1 text-[10px] text-[#1ED760]">✓</span>}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-white/40 mt-2">Applies to your character on the next run. Some only via <b className="text-white/60">secret codes</b>. 🛸</p>
        </div>

        {/* Redeem a lore-code */}
        <div className="mb-7">
          <h3 className="font-helvetica font-black text-lg text-white mb-1">Redeem code</h3>
          <p className="text-[11px] text-white/40 mb-3">Catch codes in the tracks, videos and shows. 🛸</p>
          {user ? (
            <form onSubmit={redeem} className="flex gap-2">
              <input value={codeInput} onChange={e => { setCodeInput(e.target.value); setCodeMsg(null); }} placeholder="SECRET CODE"
                className="flex-1 min-w-0 bg-white/5 border border-white/15 text-white px-3 py-2.5 text-sm uppercase tracking-widest outline-none focus:border-brandRed" />
              <button type="submit" disabled={!codeInput.trim()} className="bg-brandRed text-black font-bold uppercase text-xs tracking-widest px-4 hover:bg-white transition-colors active:scale-95 disabled:opacity-50">Redeem</button>
            </form>
          ) : (
            <p className="text-[11px] text-white/40">Connect Discord to redeem and save your unlocks.</p>
          )}
          {codeMsg && <p className={`text-[11px] mt-1.5 ${codeMsg.ok ? 'text-[#1ED760]' : 'text-brandRed'}`}>{codeMsg.text}</p>}
        </div>

        {/* Admin: mint codes (super-admin only) */}
        {allUnlocked && <AdminCodes />}

        {/* Leaderboard with you highlighted */}
        <div className="mb-7">
          <h3 className="font-helvetica font-black text-lg text-white mb-3">Ranking</h3>
          <Leaderboard compact limit={10} highlightId={stats?.playerId} />
        </div>

        {user && (
          <button onClick={() => { signOut(); onClose(); }} className="text-[11px] uppercase tracking-[0.2em] text-white/40 hover:text-white transition-colors">
            Sign out
          </button>
        )}
      </div>
    </div>
  );
}

// Super-admin only: mint lore-codes for code-locked skins.
function AdminCodes() {
  const codeSkins = SKINS.filter(s => s.unlock.type === 'code');
  const [code, setCode] = useState('');
  const [skinId, setSkinId] = useState(codeSkins[0]?.id ?? '');
  const [uses, setUses] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setMsg(null);
    const res = await createCode(code, skinId, uses ? parseInt(uses) : undefined);
    if (res.ok) { setMsg({ ok: true, text: `Code created for ${skinById(skinId).name}.` }); setCode(''); }
    else setMsg({ ok: false, text: res.error || 'Error.' });
  };
  return (
    <div className="mb-7 border border-brandYellow/20 p-4">
      <h3 className="font-helvetica font-black text-base text-brandYellow mb-2">🛠 Create code (admin)</h3>
      <form onSubmit={submit} className="space-y-2">
        <input value={code} onChange={e => setCode(e.target.value)} placeholder="CODE"
          className="w-full bg-white/5 border border-white/15 text-white px-3 py-2 text-sm uppercase tracking-widest outline-none focus:border-brandYellow" />
        <div className="flex gap-2">
          <select value={skinId} onChange={e => setSkinId(e.target.value)} className="flex-1 min-w-0 bg-black border border-white/15 text-white px-2 py-2 text-sm outline-none">
            {codeSkins.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <input value={uses} onChange={e => setUses(e.target.value)} placeholder="uses ∞" inputMode="numeric"
            className="w-20 bg-white/5 border border-white/15 text-white px-2 py-2 text-sm outline-none focus:border-brandYellow" />
          <button type="submit" className="bg-brandYellow text-black font-bold uppercase text-xs px-3 tracking-widest active:scale-95">Create</button>
        </div>
      </form>
      {msg && <p className={`text-[11px] mt-1.5 ${msg.ok ? 'text-[#1ED760]' : 'text-brandRed'}`}>{msg.text}</p>}
    </div>
  );
}
