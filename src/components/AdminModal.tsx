'use client';

import { useEffect, useState } from 'react';
import { getAdminStats, getRecentAccounts, type AdminStats, type AdminAccount } from '@/lib/admin';

function when(iso: string): string {
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return 'agora';
  if (diff < 3600) return `há ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `há ${Math.floor(diff / 3600)}h`;
  return d.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' });
}

export function AdminModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [accounts, setAccounts] = useState<AdminAccount[] | null>(null);

  useEffect(() => {
    if (!open) return;
    setStats(null); setAccounts(null);
    getAdminStats().then(setStats);
    getRecentAccounts(40).then(setAccounts);
  }, [open]);

  if (!open) return null;

  const Stat = ({ label, value, sub }: { label: string; value: string | number; sub?: string }) => (
    <div className="border border-white/10 p-4">
      <p className="font-helvetica font-black text-2xl text-white tabular-nums">{stats === null ? '…' : value}</p>
      <p className="text-[10px] uppercase tracking-[0.2em] text-white/40 mt-1">{label}</p>
      {sub && <p className="text-[11px] text-[#1ED760] mt-0.5">{sub}</p>}
    </div>
  );

  return (
    <div className="fixed inset-0 z-[70] bg-black/95 backdrop-blur-sm flex justify-center overflow-y-auto" onClick={onClose}>
      <div className="w-full max-w-lg min-h-full px-5" onClick={e => e.stopPropagation()}
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 2rem)', paddingBottom: 'calc(env(safe-area-inset-bottom) + 2rem)' }}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-helvetica font-black text-2xl text-white">📊 Admin</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white text-2xl leading-none">✕</button>
        </div>
        <p className="text-[11px] uppercase tracking-[0.2em] text-white/40 mb-5">Só tu vês isto · o espaço a crescer</p>

        <div className="grid grid-cols-2 gap-3 mb-6">
          <Stat label="Contas" value={stats?.accounts ?? 0} sub={stats ? `${stats.discordAccounts} com Discord` : undefined} />
          <Stat label="Salas" value={stats?.rooms ?? 0} />
          <Stat label="Corridas" value={stats?.runs ?? 0} sub={stats ? `${stats.runsToday} hoje` : undefined} />
          <Stat label="Mensagens" value={stats?.messages ?? 0} sub={stats ? `${stats.messagesToday} hoje` : undefined} />
        </div>

        <h3 className="font-helvetica font-black text-lg text-white mb-2">Contas recentes</h3>
        {accounts === null && <p className="text-white/40 text-sm">A carregar…</p>}
        {accounts?.length === 0 && <p className="text-white/40 text-sm">Ainda ninguém. 👀</p>}
        <ol className="divide-y divide-white/10">
          {accounts?.map((a, i) => (
            <li key={i} className="flex items-center justify-between py-2.5 gap-3">
              <span className="flex items-center gap-2 min-w-0">
                <span className="text-sm text-white truncate font-bold uppercase tracking-wide">{a.handle}</span>
                <span className="text-[10px]">{a.discord ? '🟣' : '👤'}</span>
              </span>
              <span className="text-[11px] text-white/40 shrink-0">{when(a.created_at)}</span>
            </li>
          ))}
        </ol>

        <p className="text-[11px] text-white/30 mt-5">Tráfego e geografia (visitas, de onde vêm) ficam no Vercel Analytics — liga no painel da Vercel.</p>
      </div>
    </div>
  );
}
