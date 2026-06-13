'use client';

import { useEffect, useState } from 'react';
import { getAdminStats, getRecentAccounts, getSuperAdminIds, setSuperAdmin, type AdminStats, type AdminAccount } from '@/lib/admin';

function when(iso: string): string {
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return 'now';
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' });
}

export function AdminModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [accounts, setAccounts] = useState<AdminAccount[] | null>(null);
  const [supers, setSupers] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setStats(null); setAccounts(null);
    getAdminStats().then(setStats);
    getRecentAccounts(40).then(setAccounts);
    getSuperAdminIds().then(ids => setSupers(new Set(ids)));
  }, [open]);

  const toggleAdmin = async (a: AdminAccount) => {
    if (!a.userId) return;
    const on = !supers.has(a.userId); setBusy(a.userId);
    const res = await setSuperAdmin(a.userId, on);
    setBusy(null);
    if (!res.ok) { alert(res.error || 'Failed — are you signed in as a super-admin?'); return; }
    setSupers(prev => { const n = new Set(prev); if (on) n.add(a.userId!); else n.delete(a.userId!); return n; });
  };

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
        <p className="text-[11px] uppercase tracking-[0.2em] text-white/40 mb-5">Only you see this · the space growing</p>

        <div className="grid grid-cols-2 gap-3 mb-6">
          <Stat label="Accounts" value={stats?.accounts ?? 0} sub={stats ? `${stats.discordAccounts} with Discord` : undefined} />
          <Stat label="Rooms" value={stats?.rooms ?? 0} />
          <Stat label="Runs" value={stats?.runs ?? 0} sub={stats ? `${stats.runsToday} today` : undefined} />
          <Stat label="Messages" value={stats?.messages ?? 0} sub={stats ? `${stats.messagesToday} today` : undefined} />
        </div>

        <h3 className="font-helvetica font-black text-lg text-white mb-2">Recent accounts</h3>
        {accounts === null && <p className="text-white/40 text-sm">Loading…</p>}
        {accounts?.length === 0 && <p className="text-white/40 text-sm">Nobody yet. 👀</p>}
        <ol className="divide-y divide-white/10">
          {accounts?.map((a, i) => (
            <li key={i} className="flex items-center justify-between py-2.5 gap-3">
              <span className="flex items-center gap-2 min-w-0">
                <span className="text-sm text-white truncate font-bold uppercase tracking-wide">{a.handle}</span>
                <span className="text-[10px]">{a.discord ? '🟣' : '👤'}</span>
                {a.userId && supers.has(a.userId) && <span className="text-[9px] font-mono uppercase tracking-wider text-brandYellow border border-brandYellow/40 px-1 rounded">admin</span>}
              </span>
              <span className="flex items-center gap-2 shrink-0">
                {a.discord
                  ? <button onClick={() => toggleAdmin(a)} disabled={busy === a.userId}
                      className={`text-[10px] font-mono uppercase tracking-widest border px-2 py-1 transition-colors ${supers.has(a.userId!) ? 'text-white/50 border-white/20 hover:border-brandRed hover:text-brandRed' : 'text-brandYellow border-brandYellow/40 hover:bg-brandYellow hover:text-black'} ${busy === a.userId ? 'opacity-40' : ''}`}>
                      {busy === a.userId ? '…' : supers.has(a.userId!) ? 'revoke' : 'make admin'}
                    </button>
                  : <span className="text-[10px] text-white/25">guest</span>}
                <span className="text-[11px] text-white/40">{when(a.created_at)}</span>
              </span>
            </li>
          ))}
        </ol>

        <p className="text-[11px] text-white/30 mt-5">Traffic and geography (visits, where they come from) live in Vercel Analytics — check the Vercel dashboard.</p>
      </div>
    </div>
  );
}
