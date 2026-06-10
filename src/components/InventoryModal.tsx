'use client';

import { useEffect, useState } from 'react';
import { useUser, getAuthIdentity } from '@/lib/auth';
import { amIModerator } from '@/lib/chat';
import { getPlayerStats, getBestAcrossGames, getLocalPlayer } from '@/lib/leaderboard';
import { fetchUnlocks } from '@/lib/economy';
import { SKINS, skinById, getSelectedSkinId, setSelectedSkinId, fmtScore } from '@/lib/skins';
import { SkinPreview } from '@/components/SkinPreview';
import { IconPreview } from '@/components/IconPreview';
import { IconEditor } from '@/components/IconEditor';
import { CATS, FURNI, furniPrice, isFurniPremium } from '@/lib/furni';
import { skinPrice, isSkinOwned, isIconId, iconLocalId, iconAppearanceId, resolveAppearance } from '@/lib/catalog';
import { CURRENCY_SYMBOL, useWallet, buySkin, buyFurni, ownsFurni, removeIcon } from '@/lib/wallet';

type Tab = 'skins' | 'furni' | 'icons';

// The cosmetics hub: balance, owned counts, buy/equip across skins · furni · custom icons.
// Mounted on the landing AND inside PRAÇA — pass `onEquip` so equipping updates a live avatar.
export function InventoryModal({ open, onClose, onEquip, title = 'Inventário' }: {
  open: boolean; onClose: () => void; onEquip?: (appearanceId: string) => void; title?: string;
}) {
  const { user } = useUser();
  const wallet = useWallet();
  const [tab, setTab] = useState<Tab>('skins');
  const [selected, setSelected] = useState(getSelectedSkinId());
  const [best, setBest] = useState(0);
  const [codeUnlocks, setCodeUnlocks] = useState<string[]>([]);
  const [isMod, setIsMod] = useState(false);
  const [furniCat, setFurniCat] = useState('tier1');
  const [editorOpen, setEditorOpen] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  const flash = (ok: boolean, text: string) => { setToast({ ok, text }); setTimeout(() => setToast(null), 2200); };

  useEffect(() => { if (open) setSelected(getSelectedSkinId()); }, [open]);
  useEffect(() => {
    if (!open) return;
    amIModerator().then(setIsMod);
    fetchUnlocks().then(setCodeUnlocks);
    (async () => {
      const auth = await getAuthIdentity();
      const device = auth?.device ?? getLocalPlayer().device;
      const [s, allBest] = await Promise.all([getPlayerStats(device), getBestAcrossGames(device)]);
      setBest(Math.max(allBest, s.best));
    })();
  }, [open, user]);

  if (!open) return null;

  const equip = (id: string) => { setSelectedSkinId(id); setSelected(id); onEquip?.(id); flash(true, 'Equipado'); };
  const doBuySkin = (id: string) => { const sk = skinById(id); const p = skinPrice(sk); if (p == null) return; const r = buySkin(id, p); r.ok ? flash(true, `${sk.name} comprado`) : flash(false, r.error || 'Erro'); };
  const doBuyFurni = (kind: string) => { const r = buyFurni(kind); r.ok ? flash(true, 'Comprado') : flash(false, r.error || 'Erro'); };

  const ownedSkins = SKINS.filter(s => isSkinOwned(s, best, codeUnlocks, isMod)).length;
  const premiumFurni = FURNI.filter(f => isFurniPremium(f.kind));
  const ownedPremiumFurni = premiumFurni.filter(f => ownsFurni(f.kind)).length;

  const TABS: { id: Tab; label: string; badge: string }[] = [
    { id: 'skins', label: 'Skins', badge: `${ownedSkins}/${SKINS.length}` },
    { id: 'furni', label: 'Móveis', badge: `${ownedPremiumFurni}/${premiumFurni.length}` },
    { id: 'icons', label: 'Ícones', badge: `${wallet.icons.length}` },
  ];

  const cur = resolveAppearance(selected);

  return (
    <div className="fixed inset-0 z-[70] bg-black/92 backdrop-blur-sm flex justify-center overflow-y-auto" onClick={onClose}>
      <div className="w-full max-w-lg min-h-full px-5" onClick={e => e.stopPropagation()}
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1.5rem)', paddingBottom: 'calc(env(safe-area-inset-bottom) + 2rem)' }}>

        {/* Header: equipped look + balance */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-12 h-12 border border-white/15 bg-black/60 flex items-center justify-center shrink-0">
              {cur.kind === 'icon' && cur.spec ? <IconPreview spec={cur.spec} size={44} /> : <SkinPreview skin={skinById(selected)} size={44} />}
            </div>
            <div className="min-w-0">
              <p className="font-helvetica font-black text-xl text-white leading-none">{title}</p>
              <p className="text-[11px] uppercase tracking-[0.2em] text-white/40 mt-1">Equipado</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="font-helvetica font-black text-2xl text-brandYellow tabular-nums leading-none">{CURRENCY_SYMBOL} {wallet.balance.toLocaleString('pt-PT')}</p>
              <p className="text-[10px] uppercase tracking-[0.2em] text-white/40 mt-1">Cristais</p>
            </div>
            <button onClick={onClose} className="text-white/40 hover:text-white text-2xl leading-none">✕</button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1.5 mb-4">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 border text-xs font-bold uppercase tracking-widest transition-colors ${tab === t.id ? 'border-white text-white' : 'border-white/12 text-white/45 hover:text-white/80'}`}>
              {t.label}<span className="text-[10px] text-white/40 tabular-nums">{t.badge}</span>
            </button>
          ))}
        </div>

        {toast && <p className={`text-[12px] text-center mb-3 ${toast.ok ? 'text-[#1ED760]' : 'text-brandRed'}`}>{toast.text}</p>}

        {/* SKINS */}
        {tab === 'skins' && (
          <div className="grid grid-cols-4 gap-2">
            {SKINS.map(s => {
              const owned = isSkinOwned(s, best, codeUnlocks, isMod);
              const isSel = selected === s.id;
              const price = skinPrice(s);
              return (
                <div key={s.id} className={`relative aspect-square border flex flex-col items-center justify-center gap-0.5 ${isSel ? 'border-white' : 'border-white/10'}`}>
                  <SkinPreview skin={s} size={38} locked={!owned} />
                  {isSel && <span className="absolute top-1 right-1 text-[10px] text-[#1ED760]">✓</span>}
                  {owned ? (
                    <button onClick={() => equip(s.id)} disabled={isSel}
                      className="absolute inset-x-0 bottom-0 text-[8px] uppercase tracking-wide py-1 bg-white/5 hover:bg-white/15 text-white/80 disabled:text-[#1ED760] disabled:bg-transparent">
                      {isSel ? 'EQUIPADO' : 'Equipar'}
                    </button>
                  ) : price == null ? (
                    <span className="absolute inset-x-0 bottom-0 text-[8px] text-center py-1 text-white/40">🔒 código</span>
                  ) : (
                    <button onClick={() => doBuySkin(s.id)} disabled={wallet.balance < price}
                      className="absolute inset-x-0 bottom-0 text-[8px] uppercase tracking-wide py-1 bg-brandYellow/15 hover:bg-brandYellow/30 text-brandYellow disabled:opacity-40">
                      {CURRENCY_SYMBOL}{price}
                    </button>
                  )}
                  {!owned && s.unlock.type === 'score' && <span className="absolute top-1 left-1 text-[7px] text-white/35">{fmtScore(s.unlock.need)}</span>}
                </div>
              );
            })}
          </div>
        )}

        {/* FURNI */}
        {tab === 'furni' && (
          <div>
            <div className="flex gap-1 overflow-x-auto pb-2 mb-1">
              {CATS.map(c => (
                <button key={c.id} onClick={() => setFurniCat(c.id)}
                  className={`shrink-0 text-[10px] font-mono uppercase tracking-wider px-2 py-1 border ${furniCat === c.id ? 'border-brandYellow text-brandYellow' : 'border-white/15 text-white/55 hover:text-white'}`}>
                  {c.name}{c.premium ? ' ✦' : ''}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {FURNI.filter(f => f.cat === furniCat).map(f => {
                const premium = isFurniPremium(f.kind);
                const owned = ownsFurni(f.kind);
                const price = furniPrice(f.kind);
                return (
                  <div key={f.kind} className="border border-white/10 p-2 flex flex-col items-center gap-1">
                    <span className="text-2xl leading-none">{f.emoji}</span>
                    <span className="text-[9px] uppercase tracking-wide text-white/70 text-center leading-tight">{f.name}</span>
                    {!premium ? (
                      <span className="text-[8px] uppercase tracking-widest text-white/35">incluído</span>
                    ) : owned ? (
                      <span className="text-[8px] uppercase tracking-widest text-[#1ED760]">✓ teu</span>
                    ) : (
                      <button onClick={() => doBuyFurni(f.kind)} disabled={wallet.balance < price}
                        className="text-[8px] uppercase tracking-wide px-2 py-0.5 bg-brandYellow/15 hover:bg-brandYellow/30 text-brandYellow disabled:opacity-40">
                        {CURRENCY_SYMBOL}{price}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="text-[11px] text-white/40 mt-3">Os móveis básicos são grátis e já são teus. Compra coleções <span className="text-brandYellow">✦ premium</span> e coloca-as na Praça em <b className="text-white/60">Decorar</b>.</p>
          </div>
        )}

        {/* ICONS */}
        {tab === 'icons' && (
          <div>
            <button onClick={() => setEditorOpen(true)}
              className="w-full mb-4 border border-dashed border-brandYellow/40 text-brandYellow py-3 text-sm font-bold uppercase tracking-widest hover:bg-brandYellow/10 transition-colors">
              ✦ Criar novo ícone
            </button>
            {wallet.icons.length === 0 ? (
              <p className="text-[12px] text-white/40 text-center py-6">Ainda não tens ícones. Cria o teu — formas e cores, sem emojis. 🛸</p>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {wallet.icons.map(ic => {
                  const aid = iconAppearanceId(ic.id);
                  const isSel = isIconId(selected) && iconLocalId(selected) === ic.id;
                  return (
                    <div key={ic.id} className={`relative aspect-square border flex flex-col items-center justify-center ${isSel ? 'border-white' : 'border-white/10'}`}>
                      <IconPreview spec={ic.spec} size={40} animate={isSel} />
                      {isSel && <span className="absolute top-1 right-1 text-[10px] text-[#1ED760]">✓</span>}
                      <button onClick={() => removeIcon(ic.id)} title="apagar" className="absolute top-0.5 left-1 text-[10px] text-white/30 hover:text-brandRed">✕</button>
                      <button onClick={() => equip(aid)} disabled={isSel}
                        className="absolute inset-x-0 bottom-0 text-[8px] uppercase tracking-wide py-1 bg-white/5 hover:bg-white/15 text-white/80 disabled:text-[#1ED760] disabled:bg-transparent">
                        {isSel ? 'EQUIPADO' : 'Equipar'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            <p className="text-[11px] text-white/40 mt-3">Os ícones aparecem como o teu personagem na <b className="text-white/60">Praça</b>.</p>
          </div>
        )}
      </div>

      <IconEditor open={editorOpen} onClose={() => setEditorOpen(false)} onSaved={ic => { equip(iconAppearanceId(ic.id)); setTab('icons'); }} />
    </div>
  );
}
