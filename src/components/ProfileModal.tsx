'use client';

import { useEffect, useState } from 'react';
import { useUser, signOut, getAuthIdentity } from '@/lib/auth';
import { getPlayerStats, getLocalPlayer, type PlayerStats } from '@/lib/leaderboard';
import { Leaderboard } from '@/components/Leaderboard';
import { shareStatsCard } from '@/lib/sharecard';

// Cosmetics groundwork: skins unlock by best score. Selection is stored locally now; wiring the
// chosen colour into the in-game character is the next step.
const SKINS = [
  { id: 'default', name: 'Padrão', color: '#ffe65c', need: 0 },
  { id: 'emerald', name: 'Esmeralda', color: '#1ED760', need: 10000 },
  { id: 'magenta', name: 'Magenta', color: '#ff44aa', need: 30000 },
  { id: 'violet', name: 'Violeta', color: '#cc44ff', need: 60000 },
  { id: 'cyan', name: 'Ciano', color: '#00cfff', need: 100000 },
];

export function ProfileModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useUser();
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [skin, setSkin] = useState('default');
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') setSkin(localStorage.getItem('ouroo_skin') || 'default');
  }, []);

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
  const pickSkin = (id: string, unlocked: boolean) => { if (!unlocked) return; setSkin(id); localStorage.setItem('ouroo_skin', id); };

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

        {/* Cosmetics groundwork */}
        <div className="mb-7">
          <div className="flex items-end justify-between mb-3">
            <h3 className="font-helvetica font-black text-lg text-white">Skins</h3>
            <span className="text-[10px] uppercase tracking-[0.2em] text-white/40">Ganha ao jogar</span>
          </div>
          <div className="grid grid-cols-5 gap-2">
            {SKINS.map(s => {
              const unlocked = best >= s.need;
              const selected = skin === s.id;
              return (
                <button key={s.id} onClick={() => pickSkin(s.id, unlocked)} title={unlocked ? s.name : `Desbloqueia aos ${s.need.toLocaleString('pt-PT')}`}
                  className={`relative aspect-square border flex items-center justify-center transition-all ${selected ? 'border-white' : 'border-white/10'} ${unlocked ? 'hover:border-white/50' : 'opacity-40'}`}>
                  <span className="w-5 h-5 rotate-45" style={{ background: s.color }} />
                  {!unlocked && <span className="absolute bottom-1 right-1 text-[9px]">🔒</span>}
                  {selected && <span className="absolute top-1 left-1 text-[9px] text-white">✓</span>}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-white/40 mt-2">A skin selecionada será aplicada ao teu personagem em breve.</p>
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
