'use client';

// NPC editor — design a placeable character (reusing the "design a person" options + every skin),
// name them, and write the lines they say when you walk up. Returns an NpcData to drop on a tile.

import { useState, type ReactNode } from 'react';
import {
  type PersonSpec, defaultPerson, encodePerson, parsePerson, isPersonId,
  TONES, HAIR, HATS, TOPS, PANTS, SHOES, FACES, ACCS, EYES, HAIR_COLORS, CLOTH_COLORS,
} from '@/lib/person';
import { SKINS, skinById } from '@/lib/skins';
import { PersonPreview } from '@/components/PersonPreview';
import { SkinPreview } from '@/components/SkinPreview';

// Persisted in room_items as `npc:<encodeURIComponent(JSON)>`. n = name, a = appearance id
// (a `person:` spec or a skin id), l = the lines spoken on approach.
export type NpcData = { n: string; a: string; l: string[] };

export const NpcEditor: React.FC<{
  open: boolean;
  initial?: NpcData | null;
  onPlace: (d: NpcData) => void;
  onClose: () => void;
}> = ({ open, initial, onPlace, onClose }) => {
  const initPerson = initial && isPersonId(initial.a) ? parsePerson(initial.a) : defaultPerson();
  const [appMode, setAppMode] = useState<'person' | 'skin'>(initial && !isPersonId(initial.a) ? 'skin' : 'person');
  const [designTab, setDesignTab] = useState<'style' | 'eyes'>('style');
  const [person, setPerson] = useState<PersonSpec>(initPerson);
  const [skinSel, setSkinSel] = useState<string>(initial && !isPersonId(initial.a) ? initial.a : 'diamond-gold');
  const [name, setName] = useState(initial?.n ?? '');
  const [linesText, setLinesText] = useState((initial?.l ?? []).join('\n'));
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

  const place = () => {
    const a = appMode === 'person' ? encodePerson(person) : skinSel;
    const l = linesText.split('\n').map(s => s.trim()).filter(Boolean).slice(0, 8).map(s => s.slice(0, 120));
    onPlace({ n: name.trim().slice(0, 24) || 'NPC', a, l });
  };

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
            <div className="flex items-center gap-4 border border-white/12 bg-black/40 p-3">
              <div className="w-24 h-28 bg-black/50 border border-white/10 flex items-center justify-center shrink-0"><PersonPreview spec={person} size={104} animate /></div>
              <div className="flex-1 space-y-2">
                <Row label="Body">{Chips(['Slim', 'Broad'], person.g, i => setP({ g: i }))}</Row>
                <Row label="Skin tone"><div className="flex gap-1">{TONES.map((c, i) => (<button key={c} onClick={() => setP({ tone: i })} className={`w-6 h-6 rounded-full border ${person.tone === i ? 'border-white scale-110' : 'border-white/20'}`} style={{ background: c }} />))}</div></Row>
                <Row label="Face">{Chips(FACES, person.face, i => setP({ face: i }))}</Row>
              </div>
            </div>
            {/* Tab bar */}
            <div className="flex gap-1">
              {(['style', 'eyes'] as const).map(tab => (
                <button key={tab} onClick={() => setDesignTab(tab)}
                  className={`px-4 py-1.5 text-[10px] uppercase tracking-widest border transition-colors ${designTab === tab ? 'bg-white/12 border-white/35 text-white' : 'border-white/12 text-white/45 hover:text-white/70 hover:border-white/25'}`}>
                  {tab === 'style' ? 'Style' : 'Eyes'}
                </button>
              ))}
            </div>
            {designTab === 'style' ? (<>
              <Row label="Hair">{Chips(HAIR, person.hair, i => setP({ hair: i }))}</Row>
              {person.hair !== 0 && Swatches(HAIR_COLORS, person.hairC, c => setP({ hairC: c }))}
              <Row label="Hat">{Chips(HATS, person.hat, i => setP({ hat: i }))}</Row>
              {person.hat !== 0 && Swatches(CLOTH_COLORS, person.hatC, c => setP({ hatC: c }))}
              <Row label="Top">{Chips(TOPS, person.top, i => setP({ top: i }))}</Row>
              {Swatches(CLOTH_COLORS, person.topC, c => setP({ topC: c }))}
              {person.top !== 4 && (<><Row label="Legs">{Chips(PANTS, person.pants, i => setP({ pants: i }))}</Row>{Swatches(CLOTH_COLORS, person.pantsC, c => setP({ pantsC: c }))}</>)}
              <Row label="Shoes">{Chips(SHOES, person.shoes, i => setP({ shoes: i }))}</Row>
              {person.shoes !== 2 && Swatches(CLOTH_COLORS, person.shoeC, c => setP({ shoeC: c }))}
              <Row label="Accessory">{Chips(ACCS, person.acc, i => setP({ acc: i }))}</Row>
            </>) : (
              <Row label="Eye style">{Chips(EYES, person.eyes ?? 0, i => setP({ eyes: i }))}</Row>
            )}
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

        <div className="flex gap-2 pt-1">
          <button onClick={place} className="flex-1 bg-[#ffb84d] text-black font-bold uppercase text-xs tracking-widest py-3 active:scale-95 hover:bg-white transition-colors">Place NPC ▸</button>
          <button onClick={onClose} className="px-4 border border-white/20 text-white/50 hover:text-white text-xs uppercase tracking-widest active:scale-95">Cancel</button>
        </div>
      </div>
    </div>
  );
};
