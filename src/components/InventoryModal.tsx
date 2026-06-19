'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useUser, getAuthIdentity } from '@/lib/auth';
import { amIModerator } from '@/lib/chat';
import { getPlayerStats, getBestAcrossGames, getLocalPlayer } from '@/lib/leaderboard';
import { fetchUnlocks } from '@/lib/economy';
import { SKINS, skinById, getSelectedSkinId, setSelectedSkinId, fmtScore } from '@/lib/skins';
import { SkinPreview } from '@/components/SkinPreview';
import { IconPreview } from '@/components/IconPreview';
import { IconEditor } from '@/components/IconEditor';
import { PersonPreview } from '@/components/PersonPreview';
import { type PersonSpec, defaultPerson, encodePerson, parsePerson, isPersonId, TONES, HAIR, HATS, TOPS, PANTS, SHOES, MOUTHS, ACCS, EYES, HAIR_COLORS, CLOTH_COLORS } from '@/lib/person';
import { CATS, FURNI, furniPrice, isFurniFree } from '@/lib/furni';
import { ITEMS, activateItem } from '@/lib/items';
import { getEquipped, equipWeapon, equipShield, weaponOf, shieldOf } from '@/lib/combat';
import { skinPrice, isSkinOwned, isIconId, iconLocalId, iconAppearanceId, resolveAppearance } from '@/lib/catalog';
import { CURRENCY_SYMBOL, useWallet, buySkin, buyFurni, furniCount, removeIcon, itemCount, consumeItem } from '@/lib/wallet';
import { CatIcon, FurniSprite } from '@/components/UiIcon';

type Tab = 'items' | 'person' | 'skins' | 'furni' | 'icons';

// The cosmetics hub: balance, owned counts, buy/equip across skins · furni · custom icons.
// Mounted on the landing AND inside PRAÇA — pass `onEquip` so equipping updates a live avatar.
export function InventoryModal({ open, onClose, onEquip, onItemUsed, title = 'Inventory' }: {
  open: boolean; onClose: () => void; onEquip?: (appearanceId: string) => void; onItemUsed?: (itemId: string) => void; title?: string;
}) {
  const { user } = useUser();
  const wallet = useWallet();
  const [tab, setTab] = useState<Tab>('items');
  const [selected, setSelected] = useState(getSelectedSkinId());
  const [person, setPerson] = useState<PersonSpec>(() => { const s = getSelectedSkinId(); return isPersonId(s) ? parsePerson(s) : defaultPerson(); });
  const setP = (patch: Partial<PersonSpec>) => setPerson(p => ({ ...p, ...patch }));
  const [best, setBest] = useState(0);
  const [codeUnlocks, setCodeUnlocks] = useState<string[]>([]);
  const [isMod, setIsMod] = useState(false);
  const [furniCat, setFurniCat] = useState('tier1');
  const [openPanel, setOpenPanel] = useState<'eyes' | 'mouth' | 'hair' | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  const flash = (ok: boolean, text: string) => { setToast({ ok, text }); setTimeout(() => setToast(null), 2200); };
  const [eqWeapon, setEqWeapon] = useState<string | null>(() => getEquipped().weapon);
  const [eqShield, setEqShield] = useState<string | null>(() => getEquipped().shield);

  useEffect(() => { if (open) { const s = getSelectedSkinId(); setSelected(s); if (isPersonId(s)) setPerson(parsePerson(s)); const eq = getEquipped(); setEqWeapon(eq.weapon); setEqShield(eq.shield); } }, [open]);
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

  const equip = (id: string) => { setSelectedSkinId(id); setSelected(id); onEquip?.(id); flash(true, 'Equipped'); };
  const doBuySkin = (id: string) => { const sk = skinById(id); const p = skinPrice(sk); if (p == null) return; const r = buySkin(id, p); r.ok ? flash(true, `${sk.name} purchased`) : flash(false, r.error || 'Error'); };
  const doBuyFurni = (kind: string) => { const r = buyFurni(kind); r.ok ? flash(true, 'Purchased') : flash(false, r.error || 'Error'); };
  const doEquipWeapon = (id: string | null) => { equipWeapon(id); setEqWeapon(id); flash(true, id ? `${weaponOf(id).name} equipped` : 'Fists equipped'); };
  const doEquipShield = (id: string | null) => { equipShield(id); setEqShield(id); flash(true, id ? `${shieldOf(id)?.name ?? 'Shield'} equipped` : 'Shield removed'); };

  const ownedSkins = SKINS.filter(s => isSkinOwned(s, best, codeUnlocks, isMod)).length;
  const paidFurni = FURNI.filter(f => !isFurniFree(f.kind));
  const ownedPaidFurni = paidFurni.filter(f => furniCount(f.kind) > 0).length;

  const totalItems = Object.values(wallet.items ?? {}).reduce((s, n) => s + n, 0);
  const TABS: { id: Tab; label: string; badge: string }[] = [
    { id: 'items', label: 'Items', badge: `${totalItems}` },
    { id: 'person', label: 'Char', badge: '👤' },
    { id: 'skins', label: 'Skins', badge: `${ownedSkins}/${SKINS.length}` },
    { id: 'furni', label: 'Furni', badge: `${ownedPaidFurni}/${paidFurni.length}` },
    { id: 'icons', label: 'Icons', badge: `${wallet.icons.length}` },
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
              {cur.kind === 'person' ? <PersonPreview spec={cur.person} size={44} /> : cur.kind === 'icon' && cur.spec ? <IconPreview spec={cur.spec} size={44} /> : <SkinPreview skin={skinById(selected)} size={44} />}
            </div>
            <div className="min-w-0">
              <p className="font-helvetica font-black text-xl text-white leading-none">{title}</p>
              <p className="text-[11px] uppercase tracking-[0.2em] text-white/40 mt-1">Equipped</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="font-helvetica font-black text-2xl text-brandYellow tabular-nums leading-none">{CURRENCY_SYMBOL} {wallet.balance.toLocaleString('pt-PT')}</p>
              <p className="text-[10px] uppercase tracking-[0.2em] text-white/40 mt-1">Crystals</p>
            </div>
            <button onClick={onClose} className="text-white/40 hover:text-white text-2xl leading-none">✕</button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1.5 mb-4">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex-1 flex items-center justify-center gap-1 py-2.5 border text-xs font-bold uppercase tracking-wide transition-colors ${tab === t.id ? 'border-white text-white' : 'border-white/12 text-white/45 hover:text-white/80'}`}>
              {t.label}<span className="text-[10px] text-white/40 tabular-nums">{t.badge}</span>
            </button>
          ))}
        </div>

        {toast && <p className={`text-[12px] text-center mb-3 ${toast.ok ? 'text-[#1ED760]' : 'text-brandRed'}`}>{toast.text}</p>}

        {/* ITEMS */}
        {tab === 'items' && (() => {
          const owned = ITEMS.filter(item => itemCount(item.id) > 0);
          const weapons = owned.filter(i => i.effect.type === 'weapon');
          const shields = owned.filter(i => i.effect.type === 'shield');
          const heals = owned.filter(i => i.effect.type === 'heal');
          const absorbs = owned.filter(i => i.effect.type === 'shield_absorb');
          const COMBAT_TYPES = ['weapon', 'shield', 'heal', 'shield_absorb'];
          const consumables = owned.filter(i => !COMBAT_TYPES.includes(i.effect.type));
          const useLabelOf = (item: typeof ITEMS[number]) => item.useType === 'single' ? 'Single use' : item.useType === 'multi' ? `${item.uses ?? '?'} uses` : 'Permanent';

          const ItemCard = ({ item, action }: { item: typeof ITEMS[number]; action: ReactNode }) => (
            <div className="border border-white/10 p-3 flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <span className="text-2xl leading-none">{item.emoji}</span>
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-white truncate">{item.name}</p>
                  <p className="text-[9px] uppercase tracking-wide text-white/35">{useLabelOf(item)}</p>
                </div>
                <span className="ml-auto text-[10px] font-bold text-white bg-white/10 px-1.5 py-0.5 tabular-nums shrink-0">×{itemCount(item.id)}</span>
              </div>
              <p className="text-[10px] text-white/50 leading-snug">{item.description}</p>
              {action}
            </div>
          );
          const UseBtn = ({ item }: { item: typeof ITEMS[number] }) => (
            <button
              onClick={() => { if (consumeItem(item.id)) { activateItem(item.id); flash(true, `${item.name} used`); onItemUsed?.(item.id); } else flash(false, 'None left'); }}
              className="mt-auto text-[9px] uppercase tracking-wide py-1.5 border border-white/20 hover:border-white text-white/60 hover:text-white transition-colors">
              Use
            </button>
          );
          const Section = ({ label, children }: { label: string; children: ReactNode }) => (
            <div className="space-y-2">
              <p className="text-[10px] uppercase tracking-[0.25em] text-white/40">{label}</p>
              <div className="grid grid-cols-2 gap-2">{children}</div>
            </div>
          );

          if (owned.length === 0) return (
            <div className="py-10 text-center space-y-3">
              <p className="text-3xl">🎒</p>
              <p className="text-white/60 text-sm font-bold uppercase tracking-widest">No items</p>
              <p className="text-[11px] text-white/35 max-w-xs mx-auto">
                Find shops in the world to pick things up — gear up with weapons, shields, food and potions.
              </p>
            </div>
          );

          return (
            <div className="space-y-5">
              {/* Loadout summary */}
              <div className="flex items-center gap-3 border border-brandRed/30 bg-brandRed/[0.06] px-3 py-2">
                <span className="text-[10px] uppercase tracking-[0.25em] text-brandRed/80">Loadout</span>
                <span className="text-xs text-white">{weaponOf(eqWeapon).emoji} {weaponOf(eqWeapon).name}</span>
                <span className="text-white/25">·</span>
                <span className="text-xs text-white">{eqShield ? `${shieldOf(eqShield)?.emoji ?? '🛡️'} ${shieldOf(eqShield)?.name}` : '🛡️ No shield'}</span>
              </div>

              {/* Weapons (equip one) */}
              <Section label="Weapons">
                <div className="border border-white/10 p-3 flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl leading-none">🤜</span>
                    <div className="min-w-0"><p className="text-[11px] font-bold uppercase tracking-wide text-white truncate">Fists</p><p className="text-[9px] uppercase tracking-wide text-white/35">Default</p></div>
                  </div>
                  <p className="text-[10px] text-white/50 leading-snug">Your bare hands. Always available.</p>
                  <button onClick={() => doEquipWeapon(null)} disabled={!eqWeapon}
                    className={`mt-auto text-[9px] uppercase tracking-wide py-1.5 border transition-colors ${!eqWeapon ? 'border-brandRed text-brandRed bg-brandRed/10' : 'border-white/20 hover:border-white text-white/60 hover:text-white'}`}>
                    {!eqWeapon ? 'Equipped' : 'Equip'}
                  </button>
                </div>
                {weapons.map(item => (
                  <ItemCard key={item.id} item={item} action={
                    <button onClick={() => doEquipWeapon(eqWeapon === item.id ? null : item.id)}
                      className={`mt-auto text-[9px] uppercase tracking-wide py-1.5 border transition-colors ${eqWeapon === item.id ? 'border-brandRed text-brandRed bg-brandRed/10' : 'border-white/20 hover:border-white text-white/60 hover:text-white'}`}>
                      {eqWeapon === item.id ? 'Unequip' : 'Equip'}
                    </button>
                  } />
                ))}
              </Section>

              {/* Shields */}
              {(shields.length > 0 || absorbs.length > 0) && (
                <Section label="Shields">
                  {shields.map(item => (
                    <ItemCard key={item.id} item={item} action={
                      <button onClick={() => doEquipShield(eqShield === item.id ? null : item.id)}
                        className={`mt-auto text-[9px] uppercase tracking-wide py-1.5 border transition-colors ${eqShield === item.id ? 'border-brandRed text-brandRed bg-brandRed/10' : 'border-white/20 hover:border-white text-white/60 hover:text-white'}`}>
                        {eqShield === item.id ? 'Unequip' : 'Equip'}
                      </button>
                    } />
                  ))}
                  {absorbs.map(item => <ItemCard key={item.id} item={item} action={<UseBtn item={item} />} />)}
                </Section>
              )}

              {/* Heals */}
              {heals.length > 0 && (
                <Section label="Food & Meds">
                  {heals.map(item => <ItemCard key={item.id} item={item} action={<UseBtn item={item} />} />)}
                </Section>
              )}

              {/* Other consumables */}
              {consumables.length > 0 && (
                <Section label="Consumables">
                  {consumables.map(item => <ItemCard key={item.id} item={item} action={<UseBtn item={item} />} />)}
                </Section>
              )}
            </div>
          );
        })()}

        {/* DESIGN A PERSON */}
        {tab === 'person' && (() => {
          const isWorn = selected === encodePerson(person);
          const Chips = (opts: string[], val: number, on: (i: number) => void) => (
            <div className="flex flex-wrap gap-1">{opts.map((o, i) => (
              <button key={o} onClick={() => on(i)} className={`text-[10px] uppercase tracking-wide px-2 py-1 border transition-colors ${val === i ? 'border-white text-white bg-white/10' : 'border-white/15 text-white/55 hover:text-white/80'}`}>{o}</button>
            ))}</div>
          );
          const Swatches = (cols: string[], val: string, on: (c: string) => void) => (
            <div className="flex flex-wrap gap-1">{cols.map(c => (
              <button key={c} onClick={() => on(c)} title={c} className={`w-5 h-5 rounded-full border ${val === c ? 'border-white scale-110' : 'border-white/20'}`} style={{ background: c }} />
            ))}</div>
          );
          const Row = ({ label, children }: { label: string; children: ReactNode }) => (
            <div className="space-y-1"><p className="text-[10px] uppercase tracking-[0.2em] text-white/40">{label}</p>{children}</div>
          );
          return (
            <div className="space-y-3">
              <div className="flex items-start gap-4 border border-white/12 bg-black/40 p-3">
                <div className="w-24 h-28 bg-black/50 border border-white/10 flex items-center justify-center shrink-0"><PersonPreview spec={person} size={104} animate /></div>
                <div className="flex-1 space-y-2">
                  <Row label="Body">{Chips(['Slim', 'Broad'], person.g, i => setP({ g: i }))}</Row>
                  <Row label="Skin tone"><div className="flex gap-1">{TONES.map((c, i) => (<button key={c} onClick={() => setP({ tone: i })} className={`w-6 h-6 rounded-full border ${person.tone === i ? 'border-white scale-110' : 'border-white/20'}`} style={{ background: c }} />))}</div></Row>
                  <div className="flex gap-1">
                    {(['eyes', 'mouth', 'hair'] as const).map(key => {
                      const isOpen = openPanel === key;
                      return (
                        <button key={key} onClick={() => setOpenPanel(isOpen ? null : key)}
                          className={`flex-1 flex items-center justify-between gap-1 px-2 py-1.5 border text-[10px] uppercase tracking-wide transition-colors ${isOpen ? 'border-white text-white bg-white/10' : 'border-white/15 text-white/55 hover:text-white/80'}`}>
                          {key}<span className="text-[8px] text-white/30">{isOpen ? '▴' : '▾'}</span>
                        </button>
                      );
                    })}
                  </div>
                  {openPanel === 'eyes' && Chips(EYES, person.eyes ?? 0, i => setP({ eyes: i }))}
                  {openPanel === 'mouth' && Chips(MOUTHS, person.mouth, i => setP({ mouth: i }))}
                  {openPanel === 'hair' && <div className="space-y-1.5">{Chips(HAIR, person.hair, i => setP({ hair: i }))}{person.hair !== 0 && Swatches(HAIR_COLORS, person.hairC, c => setP({ hairC: c }))}</div>}
                </div>
              </div>
              <Row label="Hat">{Chips(HATS, person.hat, i => setP({ hat: i }))}</Row>
              {person.hat !== 0 && Swatches(CLOTH_COLORS, person.hatC, c => setP({ hatC: c }))}
              <Row label="Top">{Chips(TOPS, person.top, i => setP({ top: i }))}</Row>
              {Swatches(CLOTH_COLORS, person.topC, c => setP({ topC: c }))}
              {person.top !== 4 && (<><Row label="Legs">{Chips(PANTS, person.pants, i => setP({ pants: i }))}</Row>{Swatches(CLOTH_COLORS, person.pantsC, c => setP({ pantsC: c }))}</>)}
              <Row label="Shoes">{Chips(SHOES, person.shoes, i => setP({ shoes: i }))}</Row>
              {person.shoes !== 2 && Swatches(CLOTH_COLORS, person.shoeC, c => setP({ shoeC: c }))}
              <Row label="Accessory">{Chips(ACCS, person.acc, i => setP({ acc: i }))}</Row>
              <button onClick={() => equip(encodePerson(person))} disabled={isWorn}
                className="w-full mt-1 bg-[#00cfff] text-black font-bold uppercase text-xs tracking-widest py-3 hover:bg-white transition-colors active:scale-95 disabled:opacity-50 disabled:bg-[#1ED760]">
                {isWorn ? 'Wearing this ✓' : 'Wear this character ▸'}
              </button>
              <p className="text-[11px] text-white/35">Build a person — gender, skin tone, hair, hats, clothes, shoes and accessories. The skins and icons tabs are still there for the specialty looks.</p>
            </div>
          );
        })()}

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
                      {isSel ? 'EQUIPPED' : 'Equip'}
                    </button>
                  ) : price == null ? (
                    <span className="absolute inset-x-0 bottom-0 text-[8px] text-center py-1 text-white/40">🔒 code</span>
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
            <div className="flex gap-0.5 overflow-x-auto pb-2 mb-1">
              {CATS.map(c => {
                const on = furniCat === c.id;
                return (
                  <button key={c.id} onClick={() => setFurniCat(c.id)} title={c.name}
                    className={`shrink-0 flex flex-col items-center gap-0.5 w-[3.2rem] py-1.5 rounded-lg transition-colors ${on ? 'bg-white/10' : 'hover:bg-white/5'}`}>
                    <CatIcon catId={c.id} size={22} color={on ? '#ffe65c' : '#cfd2dc'} />
                    <span className={`text-[7px] uppercase tracking-wide leading-none text-center ${on ? 'text-brandYellow' : 'text-white/50'}`}>{c.name.replace('★ ', '')}</span>
                  </button>
                );
              })}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {FURNI.filter(f => f.cat === furniCat).map(f => {
                const free = isFurniFree(f.kind);
                const n = furniCount(f.kind);
                const price = furniPrice(f.kind);
                return (
                  <div key={f.kind} className="relative border border-white/10 p-2 flex flex-col items-center gap-1">
                    <FurniSprite kind={f.kind} size={42} accent="#00cfff" />
                    {!free && n > 0 && <span className="absolute top-1 right-1 text-[9px] font-bold text-white bg-white/10 px-1 rounded tabular-nums">×{n}</span>}
                    <span className="text-[9px] uppercase tracking-wide text-white/70 text-center leading-tight">{f.name}</span>
                    {free ? (
                      <span className="text-[8px] uppercase tracking-widest text-white/35">included</span>
                    ) : (
                      <button onClick={() => doBuyFurni(f.kind)} disabled={wallet.balance < price}
                        className="text-[8px] uppercase tracking-wide px-2 py-0.5 bg-brandYellow/15 hover:bg-brandYellow/30 text-brandYellow disabled:opacity-40">
                        {n > 0 ? `+1 ${CURRENCY_SYMBOL}${price}` : `${CURRENCY_SYMBOL}${price}`}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="text-[11px] text-white/40 mt-3">You get 2 of each category for free. The rest are cheap — buy them and place them in the Praça under <b className="text-white/60">Decorate</b>. <span className="text-brandYellow">✦ Hi-Fi</span> collections are premium.</p>
          </div>
        )}

        {/* ICONS */}
        {tab === 'icons' && (
          <div>
            <button onClick={() => setEditorOpen(true)}
              className="w-full mb-4 border border-dashed border-brandYellow/40 text-brandYellow py-3 text-sm font-bold uppercase tracking-widest hover:bg-brandYellow/10 transition-colors">
              ✦ Create new icon
            </button>
            {wallet.icons.length === 0 ? (
              <p className="text-[12px] text-white/40 text-center py-6">No icons yet. Make your own — shapes and colors, no emojis. 🛸</p>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {wallet.icons.map(ic => {
                  const aid = iconAppearanceId(ic.id);
                  const isSel = isIconId(selected) && iconLocalId(selected) === ic.id;
                  return (
                    <div key={ic.id} className={`relative aspect-square border flex flex-col items-center justify-center ${isSel ? 'border-white' : 'border-white/10'}`}>
                      <IconPreview spec={ic.spec} size={40} animate={isSel} />
                      {isSel && <span className="absolute top-1 right-1 text-[10px] text-[#1ED760]">✓</span>}
                      <button onClick={() => removeIcon(ic.id)} title="delete" className="absolute top-0.5 left-1 text-[10px] text-white/30 hover:text-brandRed">✕</button>
                      <button onClick={() => equip(aid)} disabled={isSel}
                        className="absolute inset-x-0 bottom-0 text-[8px] uppercase tracking-wide py-1 bg-white/5 hover:bg-white/15 text-white/80 disabled:text-[#1ED760] disabled:bg-transparent">
                        {isSel ? 'EQUIPPED' : 'Equip'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            <p className="text-[11px] text-white/40 mt-3">Icons show up as your character in the <b className="text-white/60">Praça</b>.</p>
          </div>
        )}
      </div>

      <IconEditor open={editorOpen} onClose={() => setEditorOpen(false)} onSaved={ic => { equip(iconAppearanceId(ic.id)); setTab('icons'); }} />
    </div>
  );
}
