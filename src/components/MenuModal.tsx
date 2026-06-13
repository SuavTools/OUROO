'use client';

// The world MENU — opened from the ☰ button once the tutorial is done. Account (create / log in /
// log out + details), the leaderboards, and an About panel. Self-contained: degrades gracefully when
// Supabase/Discord isn't configured (guest-only).

import { useState } from 'react';
import { useUser, signInWithDiscord, signOut } from '@/lib/auth';
import { supabaseReady } from '@/lib/supabase';
import { useWallet, CURRENCY_SYMBOL } from '@/lib/wallet';
import { Leaderboard } from '@/components/Leaderboard';

type Tab = 'account' | 'board' | 'about';

export function MenuModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useUser();
  const wallet = useWallet();
  const [tab, setTab] = useState<Tab>('account');   // resets to Account each reopen — fine
  if (!open) return null;

  return (
    <div className="absolute inset-0 z-[75] bg-black/85 backdrop-blur-sm flex justify-center overflow-y-auto px-4 py-8"
      style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1.5rem)', paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.5rem)' }}
      onClick={onClose}>
      <div className="w-full max-w-md bg-black border border-white/15 h-fit" onClick={e => e.stopPropagation()}>
        {/* header + tabs */}
        <div className="flex items-center justify-between px-5 pt-4">
          <p className="font-helvetica font-black uppercase tracking-widest text-white text-lg">Menu</p>
          <button onClick={onClose} className="text-white/40 hover:text-white text-xl leading-none">✕</button>
        </div>
        <div className="flex gap-1 px-4 pt-3 border-b border-white/10">
          {([['account', 'Account'], ['board', 'Leaderboard'], ['about', 'About']] as [Tab, string][]).map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)}
              className={`px-3 py-2 text-[11px] font-mono uppercase tracking-widest transition-colors ${tab === id ? 'text-white border-b-2 border-[#00cfff]' : 'text-white/45 hover:text-white/80'}`}>{label}</button>
          ))}
        </div>

        <div className="p-5">
          {tab === 'account' && (
            <div className="space-y-4">
              {user ? (
                <>
                  <div className="flex items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {user.avatar && <img src={user.avatar} alt="" className="w-12 h-12 rounded-full border border-white/20" />}
                    <div className="min-w-0">
                      <p className="font-bold text-white truncate">{user.name}</p>
                      <p className="text-[11px] uppercase tracking-widest text-[#5865F2]">Signed in with Discord</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between border border-white/10 px-4 py-3">
                    <span className="text-[11px] uppercase tracking-widest text-white/45">Wallet</span>
                    <span className="font-mono text-brandYellow">{CURRENCY_SYMBOL}{wallet.balance.toLocaleString('pt-PT')}</span>
                  </div>
                  <p className="text-[12px] text-white/45 leading-relaxed">Your crystals, scores, skins, furniture and room are saved to this account and follow you across devices.</p>
                  <button onClick={() => signOut()} className="w-full border border-white/20 text-white/70 hover:text-white hover:border-white/40 text-xs uppercase tracking-widest py-2.5 active:scale-95">Log out</button>
                </>
              ) : (
                <>
                  <div className="border border-brandYellow/30 bg-brandYellow/[0.06] p-4">
                    <p className="font-bold text-white text-sm">You&apos;re playing as a guest</p>
                    <p className="text-[12px] text-white/55 leading-relaxed mt-1">Nothing is saved. Make an account and the world remembers you — crystals, high scores, skins, furniture and your room all carry over, on any device.</p>
                  </div>
                  <div className="flex items-center justify-between border border-white/10 px-4 py-3">
                    <span className="text-[11px] uppercase tracking-widest text-white/45">Wallet (this device)</span>
                    <span className="font-mono text-brandYellow">{CURRENCY_SYMBOL}{wallet.balance.toLocaleString('pt-PT')}</span>
                  </div>
                  {supabaseReady
                    ? <button onClick={() => signInWithDiscord()} className="w-full bg-[#5865F2] text-white font-bold uppercase text-xs tracking-widest py-3 hover:bg-[#6c78f5] transition-colors active:scale-95">Create account / Log in with Discord</button>
                    : <p className="text-[12px] text-white/40 text-center">Accounts aren&apos;t enabled on the server yet.</p>}
                </>
              )}
            </div>
          )}

          {tab === 'board' && (
            <div>
              <div className="flex items-end justify-between mb-3">
                <h3 className="font-helvetica font-black text-xl tracking-tight text-white">Leaderboard</h3>
                <span className="text-[11px] uppercase tracking-[0.2em] text-white/40">OUROO</span>
              </div>
              <Leaderboard limit={10} showToggle />
            </div>
          )}

          {tab === 'about' && (
            <div className="space-y-3 text-[13px] text-white/65 leading-relaxed">
              <p className="font-helvetica font-black text-2xl tracking-tighter text-white">OUROO<span className="text-brandRed">.</span></p>
              <p>OUROO is what&apos;s left of the internet after the humans logged off — a world kept lit by a lonely machine that needs someone to watch. You are signal now. Mine crystals against the dark, build your corner of the Loop, and keep it from forgetting itself.</p>
              <p className="text-white/45">The carrier wave running under all of it is <span className="text-[#00cfff]">SUAV</span>.</p>
              <p className="text-[11px] uppercase tracking-[0.2em] text-white/30 pt-2">One world · one wallet · be kind in the chat</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
