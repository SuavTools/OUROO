'use client';

import { useEffect, useState } from 'react';
import { useUser, signOut, getAuthIdentity } from '@/lib/auth';
import { getPlayerStats, getLocalPlayer, type PlayerStats } from '@/lib/leaderboard';
import { amIModerator } from '@/lib/chat';
import { Leaderboard } from '@/components/Leaderboard';
import { shareStatsCard } from '@/lib/sharecard';
import { SKINS, isSkinUnlocked, getSelectedSkinId, setSelectedSkinId, DEFAULT_SKIN_ID } from '@/lib/skins';
import { SkinPreview } from '@/components/SkinPreview';

export function ProfileModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useUser();
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [skin, setSkin] = useState(DEFAULT_SKIN_ID);
  const [sharing, setSharing] = useState(false);
  const [allUnlocked, setAllUnlocked] = useState(false);   // moderators (SUAV) get every skin
  // Lore-code unlocks come next phase (server-side); empty for now so code skins read as locked.
  const codeUnlocks: string[] = [];

  useEffect(() => { if (typeof window !== 'undefined') setSkin(getSelectedSkinId()); }, [open]);
  useEffect(() => { if (open) amIModerator().then(setAllUnlocked); }, [open, user]);

  useEffect(() => {
    if (!open) return;
    setStats(null);
    (async () => {
      const auth = await getAuthIdentity();
      const device = auth?.device ?? getLocalPlayer().device;
      setStats(await getPlayerStats(device));
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
              <p className="font-helvetica font-black text-xl text-white truncate">{user?.name || stats?.handle || 'Jogador'}</p>
              <p className="text-[11px] uppercase tracking-[0.2em] text-white/40">{user ? 'Discord' : 'Anónimo'}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white text-2xl leading-none">✕</button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { k: 'Rank', v: stats?.rank != null ? `#${stats.rank}` : '—', accent: 'text-brandYellow' },
            { k: 'Recorde', v: best ? best.toLocaleString('pt-PT') : '—', accent: 'text-white' },
            { k: 'Corridas', v: stats ? String(stats.runs) : '—', accent: 'text-white' },
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
          {sharing ? 'A gerar…' : '↗ Partilhar o meu cartão'}
        </button>

        {/* Skins */}
        <div className="mb-7">
          <div className="flex items-end justify-between mb-3">
            <h3 className="font-helvetica font-black text-lg text-white">Skins</h3>
            <span className="text-[10px] uppercase tracking-[0.2em] text-white/40">Ganha ao jogar</span>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {SKINS.map(s => {
              const unlocked = allUnlocked || isSkinUnlocked(s, best, codeUnlocks);
              const selected = skin === s.id;
              const hint = s.unlock.type === 'score' ? `${s.unlock.need.toLocaleString('pt-PT')} pts`
                : s.unlock.type === 'code' ? '🔒 código' : '';
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
          <p className="text-[11px] text-white/40 mt-2">Aplica-se ao teu personagem na próxima corrida. Algumas só com <b className="text-white/60">códigos secretos</b>. 🛸</p>
        </div>

        {/* Leaderboard with you highlighted */}
        <div className="mb-7">
          <h3 className="font-helvetica font-black text-lg text-white mb-3">Ranking</h3>
          <Leaderboard compact limit={10} highlightId={stats?.playerId} />
        </div>

        {user && (
          <button onClick={() => { signOut(); onClose(); }} className="text-[11px] uppercase tracking-[0.2em] text-white/40 hover:text-white transition-colors">
            Terminar sessão
          </button>
        )}
      </div>
    </div>
  );
}
