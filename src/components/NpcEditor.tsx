'use client';

// NPC editor — design a placeable character (reusing the "design a person" options + every skin),
// name them, and write the lines they say when you walk up. Returns an NpcData to drop on a tile.

import { useState, type ReactNode } from 'react';
import {
  type PersonSpec, defaultPerson, encodePerson, parsePerson, isPersonId,
  TONES, HAIR, HATS, TOPS, PANTS, SHOES, MOUTHS, ACCS, EYES, HAIR_COLORS, CLOTH_COLORS,
} from '@/lib/person';
import { SKINS, skinById } from '@/lib/skins';
import { ITEMS } from '@/lib/items';
import { PersonPreview } from '@/components/PersonPreview';
import { SkinPreview } from '@/components/SkinPreview';

// Persisted in room_items as `npc:<encodeURIComponent(JSON)>`. n = name, a = appearance id
// (a `person:` spec or a skin id), l = the lines spoken on approach, h = optional hazard config
// (makes the NPC killable — see HazardSpec).
export type NpcData = { n: string; a: string; l: string[]; h?: HazardSpec };

// What happens once-per-player when you land the killing blow. Each maps onto a system that
// already exists: toast=pushFeed, beat=ouroo_lore one-time line, skin=grantSkin, portal=a flag a
// hidden teleporter reads. Triggers fire at most once per player (they're one-shots by nature).
export type KillTrigger =
  | { kind: 'toast'; text: string }
  | { kind: 'beat'; text: string }
  | { kind: 'skin'; skinId: string }
  | { kind: 'portal'; flag: string };

// A hazardous (killable) NPC. Fought per-player and entirely client-side: HP, defeat state and the
// reward grant all live on the attacker's device. policy controls farming:
//   'once'      → after death it turns peaceful FOR YOU (swaps to deadLines), never hazardous again.
//   'no-refarm' → respawns full HP and stays aggressive, but loot/onKill fire only the first kill.
//   'farmable'  → respawns after respawnMs; loot drops every kill (onKill still one-shot).
export type HazardSpec = {
  maxHp: number;
  contactDamage: number;          // damage it deals when it auto-swings at you (0 = punching bag)
  attackCooldownMs: number;       // how often it can hit you
  loot: { crystals?: number; items?: Record<string, number> };
  policy: 'once' | 'no-refarm' | 'farmable';
  respawnMs?: number;             // 'farmable' only
  onKill?: KillTrigger;
  deadLines?: string[];           // dialogue after defeat (policy 'once')
};

// Clamp/validate an untrusted hazard blob from storage or the network. Returns undefined for a
// non-hazardous NPC. Shared by the decoder in RoomCanvas so both paths agree on the shape.
export function sanitizeHazard(o: unknown): HazardSpec | undefined {
  if (!o || typeof o !== 'object') return undefined;
  const h = o as Record<string, unknown>;
  const num = (v: unknown, d: number, min: number, max: number) => {
    const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : d;
  };
  const policy = (['once', 'no-refarm', 'farmable'] as const).includes(h.policy as never)
    ? (h.policy as HazardSpec['policy']) : 'once';
  const lootIn = (h.loot ?? {}) as Record<string, unknown>;
  const items: Record<string, number> = {};
  if (lootIn.items && typeof lootIn.items === 'object') {
    for (const [k, v] of Object.entries(lootIn.items as Record<string, unknown>)) {
      const q = num(v, 0, 0, 99); if (q > 0) items[String(k).slice(0, 40)] = q;
    }
  }
  let onKill: KillTrigger | undefined;
  const t = h.onKill as Record<string, unknown> | undefined;
  if (t && typeof t === 'object') {
    if (t.kind === 'toast') onKill = { kind: 'toast', text: String(t.text ?? '').slice(0, 120) };
    else if (t.kind === 'beat') onKill = { kind: 'beat', text: String(t.text ?? '').slice(0, 120) };
    else if (t.kind === 'skin') onKill = { kind: 'skin', skinId: String(t.skinId ?? '').slice(0, 60) };
    else if (t.kind === 'portal') onKill = { kind: 'portal', flag: String(t.flag ?? '').slice(0, 60) };
  }
  return {
    maxHp: num(h.maxHp, 80, 1, 9999),
    contactDamage: num(h.contactDamage, 8, 0, 999),
    attackCooldownMs: num(h.attackCooldownMs, 1200, 200, 60000),
    loot: { crystals: num((h.loot as Record<string, unknown>)?.crystals, 0, 0, 1_000_000), items },
    policy,
    respawnMs: policy === 'farmable' ? num(h.respawnMs, 600000, 1000, 86_400_000) : undefined,
    onKill,
    deadLines: Array.isArray(h.deadLines) ? (h.deadLines as unknown[]).map(s => String(s).slice(0, 120)).slice(0, 8) : undefined,
  };
}

export const NpcEditor: React.FC<{
  open: boolean;
  initial?: NpcData | null;
  onPlace: (d: NpcData) => void;
  onClose: () => void;
  onDelete?: () => void;
}> = ({ open, initial, onPlace, onClose, onDelete }) => {
  const initPerson = initial && isPersonId(initial.a) ? parsePerson(initial.a) : defaultPerson();
  const [appMode, setAppMode] = useState<'person' | 'skin'>(initial && !isPersonId(initial.a) ? 'skin' : 'person');
  const [openPanel, setOpenPanel] = useState<'eyes' | 'mouth' | 'hair' | null>(null);
  const [person, setPerson] = useState<PersonSpec>(initPerson);
  const [skinSel, setSkinSel] = useState<string>(initial && !isPersonId(initial.a) ? initial.a : 'diamond-gold');
  const [name, setName] = useState(initial?.n ?? '');
  const [linesText, setLinesText] = useState((initial?.l ?? []).join('\n'));

  // ── hazard (killable) config ──
  const ih = initial?.h;
  const [hazard, setHazard] = useState(!!ih);
  const [maxHp, setMaxHp] = useState(ih?.maxHp ?? 80);
  const [contactDamage, setContactDamage] = useState(ih?.contactDamage ?? 8);
  const [cooldownMs, setCooldownMs] = useState(ih?.attackCooldownMs ?? 1200);
  const [lootCrystals, setLootCrystals] = useState(ih?.loot.crystals ?? 25);
  const [lootItems, setLootItems] = useState<Record<string, number>>(ih?.loot.items ?? {});
  const [policy, setPolicy] = useState<HazardSpec['policy']>(ih?.policy ?? 'once');
  const [respawnMin, setRespawnMin] = useState(Math.round((ih?.respawnMs ?? 600000) / 60000));
  const [deadLinesText, setDeadLinesText] = useState((ih?.deadLines ?? []).join('\n'));
  const [trigKind, setTrigKind] = useState<KillTrigger['kind'] | 'none'>(ih?.onKill?.kind ?? 'none');
  const [trigVal, setTrigVal] = useState(
    ih?.onKill ? ('text' in ih.onKill ? ih.onKill.text : 'skinId' in ih.onKill ? ih.onKill.skinId : ih.onKill.flag) : ''
  );

  if (!open) return null;
  const setP = (patch: Partial<PersonSpec>) => setPerson(p => ({ ...p, ...patch }));

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

  const splitLines = (t: string) => t.split('\n').map(s => s.trim()).filter(Boolean).slice(0, 8).map(s => s.slice(0, 120));
  const setLootQty = (id: string, q: number) => setLootItems(m => {
    const next = { ...m }; if (q <= 0) delete next[id]; else next[id] = Math.min(99, q); return next;
  });

  const place = () => {
    const a = appMode === 'person' ? encodePerson(person) : skinSel;
    const l = splitLines(linesText);
    let h: HazardSpec | undefined;
    if (hazard) {
      let onKill: KillTrigger | undefined;
      const v = trigVal.trim();
      if (trigKind === 'toast' && v) onKill = { kind: 'toast', text: v.slice(0, 120) };
      else if (trigKind === 'beat' && v) onKill = { kind: 'beat', text: v.slice(0, 120) };
      else if (trigKind === 'skin' && v) onKill = { kind: 'skin', skinId: v.slice(0, 60) };
      else if (trigKind === 'portal' && v) onKill = { kind: 'portal', flag: v.slice(0, 60) };
      h = sanitizeHazard({
        maxHp, contactDamage, attackCooldownMs: cooldownMs,
        loot: { crystals: lootCrystals, items: lootItems },
        policy, respawnMs: respawnMin * 60000, onKill,
        deadLines: policy === 'once' ? splitLines(deadLinesText) : undefined,
      });
    }
    onPlace({ n: name.trim().slice(0, 24) || 'NPC', a, l, ...(h ? { h } : {}) });
  };

  const NumField = ({ label, val, set, min, max, step = 1, suffix }: { label: string; val: number; set: (n: number) => void; min: number; max: number; step?: number; suffix?: string }) => (
    <label className="flex-1 space-y-1">
      <span className="text-[10px] uppercase tracking-[0.2em] text-white/40">{label}</span>
      <span className="flex items-center gap-1">
        <input type="number" value={val} min={min} max={max} step={step}
          onChange={e => set(Math.min(max, Math.max(min, Math.round(Number(e.target.value) || 0))))}
          className="w-full bg-white/5 border border-white/15 text-white px-2 py-1.5 text-sm outline-none focus:border-[#ff5d5d]" />
        {suffix && <span className="text-[10px] text-white/30">{suffix}</span>}
      </span>
    </label>
  );

  return (
    <div className="absolute inset-0 z-[70] bg-black/85 backdrop-blur-sm flex justify-center overflow-y-auto px-4 py-8" onClick={onClose}>
      <div className="w-full max-w-md border border-[#ffb84d]/40 bg-black p-5 h-fit space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <p className="font-mono text-[10px] uppercase tracking-[0.35em] text-[#ffb84d]">☻ design an npc</p>
          <button onClick={onClose} className="text-white/40 hover:text-white text-lg leading-none">✕</button>
        </div>

        <div>
          <p className="text-[10px] uppercase tracking-widest text-white/40 mb-1.5">Name</p>
          <input value={name} onChange={e => setName(e.target.value)} maxLength={24} placeholder="Name…"
            className="w-full bg-white/5 border border-white/15 text-white px-3 py-2 text-sm outline-none focus:border-[#ffb84d]" />
        </div>

        {/* appearance: design a person, or pick any skin */}
        <div className="flex gap-1">
          {(['person', 'skin'] as const).map(m => (
            <button key={m} onClick={() => setAppMode(m)} className={`flex-1 text-[11px] uppercase tracking-widest py-2 border transition-colors ${appMode === m ? 'bg-[#ffb84d] text-black border-[#ffb84d]' : 'text-white/60 border-white/20 hover:border-white/40'}`}>{m === 'person' ? 'Design a person' : 'Pick a skin'}</button>
          ))}
        </div>

        {appMode === 'person' ? (
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
          </div>
        ) : (
          <div className="flex items-center gap-4">
            <div className="w-24 h-28 bg-black/50 border border-white/10 flex items-center justify-center shrink-0"><SkinPreview skin={skinById(skinSel)} size={104} /></div>
            <div className="grid grid-cols-4 gap-1.5 max-h-44 overflow-y-auto flex-1 pr-1">
              {SKINS.map(s => (
                <button key={s.id} onClick={() => setSkinSel(s.id)} title={s.name}
                  className={`aspect-square flex items-center justify-center border rounded-md transition-colors ${skinSel === s.id ? 'border-[#ffb84d] bg-[#ffb84d]/15' : 'border-white/12 bg-white/[0.03] hover:border-white/40'}`}>
                  <SkinPreview skin={s} size={40} />
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <p className="text-[10px] uppercase tracking-widest text-white/40 mb-1.5">Lines on approach <span className="text-white/25 normal-case tracking-normal">(one per line — they speak when you walk up)</span></p>
          <textarea value={linesText} onChange={e => setLinesText(e.target.value)} rows={4} placeholder={'Welcome, traveller.\nThe Loop keeps turning…'}
            className="w-full bg-white/5 border border-white/15 text-white px-3 py-2 text-sm outline-none focus:border-[#ffb84d] resize-none leading-relaxed" />
        </div>

        {/* ── hazardous (killable) NPC ── */}
        <div className="border border-[#ff5d5d]/30 bg-[#ff5d5d]/[0.04]">
          <button onClick={() => setHazard(h => !h)}
            className="w-full flex items-center justify-between px-3 py-2.5 text-left active:scale-[0.99] transition-transform">
            <span className="flex items-center gap-2 text-[11px] uppercase tracking-widest text-[#ff8a8a] font-bold">⚔ Hazardous — can be fought & killed</span>
            <span className={`w-9 h-5 rounded-full border flex items-center px-0.5 transition-colors ${hazard ? 'bg-[#ff5d5d] border-[#ff5d5d] justify-end' : 'bg-white/5 border-white/20 justify-start'}`}>
              <span className="w-4 h-4 rounded-full bg-white" />
            </span>
          </button>

          {hazard && (
            <div className="px-3 pb-3 space-y-3 border-t border-[#ff5d5d]/20 pt-3">
              <div className="flex gap-2">
                <NumField label="Health" val={maxHp} set={setMaxHp} min={1} max={9999} />
                <NumField label="Its damage" val={contactDamage} set={setContactDamage} min={0} max={999} />
                <NumField label="Hit speed" val={cooldownMs} set={setCooldownMs} min={200} max={60000} step={100} suffix="ms" />
              </div>
              <p className="text-[10px] text-white/30 -mt-1">Its damage 0 = a punching bag that never hits back.</p>

              <Row label="Reward — Cristais">
                <input type="number" value={lootCrystals} min={0} max={1000000}
                  onChange={e => setLootCrystals(Math.max(0, Math.round(Number(e.target.value) || 0)))}
                  className="w-full bg-white/5 border border-white/15 text-white px-3 py-2 text-sm outline-none focus:border-[#ff5d5d]" />
              </Row>

              <Row label="Reward — items (tap to add, tap qty to bump)">
                <div className="grid grid-cols-2 gap-1 max-h-36 overflow-y-auto pr-1">
                  {ITEMS.map(it => {
                    const q = lootItems[it.id] ?? 0;
                    return (
                      <button key={it.id} onClick={() => setLootQty(it.id, q + 1)}
                        onContextMenu={e => { e.preventDefault(); setLootQty(it.id, q - 1); }}
                        title={`${it.name} — left-click +1, right-click −1`}
                        className={`flex items-center gap-1.5 px-2 py-1.5 border text-left text-[11px] transition-colors ${q > 0 ? 'border-[#ff5d5d] bg-[#ff5d5d]/15 text-white' : 'border-white/12 text-white/55 hover:border-white/30'}`}>
                        <span>{it.emoji}</span>
                        <span className="flex-1 truncate">{it.name}</span>
                        {q > 0 && <span className="font-mono text-[#ff8a8a]">×{q}</span>}
                      </button>
                    );
                  })}
                </div>
              </Row>

              <Row label="After defeat">
                <div className="flex flex-col gap-1">
                  {([
                    ['once', 'Once & done — turns peaceful for you after one kill'],
                    ['no-refarm', 'Endless threat — respawns, but loot drops only the first kill'],
                    ['farmable', 'Farmable — drops loot every kill, respawns on a timer'],
                  ] as const).map(([val, desc]) => (
                    <button key={val} onClick={() => setPolicy(val)}
                      className={`text-left px-2.5 py-1.5 border text-[11px] transition-colors ${policy === val ? 'border-[#ff5d5d] bg-[#ff5d5d]/15 text-white' : 'border-white/12 text-white/55 hover:border-white/30'}`}>
                      <span className="uppercase tracking-wide font-bold text-[10px]">{val}</span> <span className="text-white/40">— {desc}</span>
                    </button>
                  ))}
                </div>
              </Row>

              {policy === 'farmable' && (
                <NumField label="Respawn delay" val={respawnMin} set={setRespawnMin} min={1} max={1440} suffix="min" />
              )}

              {policy === 'once' && (
                <Row label="Lines after defeat (now peaceful)">
                  <textarea value={deadLinesText} onChange={e => setDeadLinesText(e.target.value)} rows={2} placeholder={'You bested me. I yield.'}
                    className="w-full bg-white/5 border border-white/15 text-white px-3 py-2 text-sm outline-none focus:border-[#ff5d5d] resize-none leading-relaxed" />
                </Row>
              )}

              <Row label="On-kill trigger (fires once)">
                <div className="flex gap-1 mb-1.5">
                  {(['none', 'toast', 'beat', 'skin', 'portal'] as const).map(k => (
                    <button key={k} onClick={() => setTrigKind(k)}
                      className={`flex-1 text-[10px] uppercase tracking-wide py-1.5 border transition-colors ${trigKind === k ? 'border-[#ff5d5d] bg-[#ff5d5d]/15 text-white' : 'border-white/12 text-white/50 hover:border-white/30'}`}>{k}</button>
                  ))}
                </div>
                {trigKind !== 'none' && (
                  <input value={trigVal} onChange={e => setTrigVal(e.target.value)}
                    placeholder={trigKind === 'toast' ? 'Feed message shown on kill…' : trigKind === 'beat' ? 'One-time lore line revealed…' : trigKind === 'skin' ? 'skin id to grant (e.g. diamond-gold)' : 'portal flag to unlock (e.g. vault_open)'}
                    className="w-full bg-white/5 border border-white/15 text-white px-3 py-2 text-sm outline-none focus:border-[#ff5d5d]" />
                )}
              </Row>
            </div>
          )}
        </div>

        <div className="flex gap-2 pt-1">
          <button onClick={place} className="flex-1 bg-[#ffb84d] text-black font-bold uppercase text-xs tracking-widest py-3 active:scale-95 hover:bg-white transition-colors">{initial ? 'Update NPC ▸' : 'Place NPC ▸'}</button>
          <button onClick={onClose} className="px-4 border border-white/20 text-white/50 hover:text-white text-xs uppercase tracking-widest active:scale-95">Cancel</button>
        </div>
        {onDelete && (
          <button onClick={onDelete} className="w-full border border-red-500/40 text-red-400 hover:bg-red-500/15 hover:text-red-300 text-xs uppercase tracking-widest py-2 transition-colors active:scale-95">
            Delete NPC
          </button>
        )}
      </div>
    </div>
  );
};
