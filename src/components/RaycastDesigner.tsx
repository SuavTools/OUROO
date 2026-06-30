'use client';

// OUROO R3D DESIGNER — a paint-grid editor for first-person 3D realms. Pick a brush (wall textures,
// floor, lava, pits, crystals, exit, spawn), drag to paint the grid, name it, save it (localStorage),
// and test-play instantly in the real raycaster. Saved realms appear in the room's portal maker, so a
// mod can drop a portal whose destination is `r3d:<id>` and summon the world they just built.

import React, { useState, useRef, useCallback } from 'react';
import {
  type Level3D, type Floor3D, ATMOS, SKIES, listLevels, saveLevel, deleteLevel, getLevel, blankLevel, isBuiltin, newLevelId,
} from '@/lib/raycast/levels';
import { RaycastCanvas } from './RaycastCanvas';
import { NpcEditor, type NpcData } from './NpcEditor';

type Brush = { ch: string; label: string; color: string };
const BRUSHES: Brush[] = [
  { ch: '#', label: 'Stone', color: '#787496' },
  { ch: '1', label: 'Brick', color: '#965a50' },
  { ch: '2', label: 'Blue', color: '#465a78' },
  { ch: '3', label: 'Moss', color: '#28dcb4' },
  { ch: '4', label: 'Gold', color: '#a08c46' },
  { ch: '.', label: 'Floor', color: '#26242f' },
  { ch: 'g', label: 'Grass', color: '#2e7830' },
  { ch: 'w', label: 'Water', color: '#1a5aaa' },
  { ch: 'T', label: 'Tree', color: '#1e6b2e' },
  { ch: 'L', label: 'Lava', color: '#ff5a1e' },
  { ch: '~', label: 'Pit', color: '#050308' },
  { ch: 'C', label: 'Crystal', color: '#9beaff' },
  { ch: 'O', label: 'Tunnel', color: '#b35cff' },
  { ch: '>', label: 'Stairs ↑', color: '#9be07a' },
  { ch: '<', label: 'Stairs ↓', color: '#3a4a66' },
  { ch: 'M', label: 'Stalker', color: '#b03030' },
  { ch: 'E', label: 'Exit', color: '#1ee0ff' },
  { ch: 'S', label: 'Spawn', color: '#ffd400' },
];
const colorOf = (ch: string) => BRUSHES.find(b => b.ch === ch)?.color ?? '#26242f';

// Resize a rows[] grid, preserving overlap; new cells are walls on the edge, floor inside.
function resizeRows(rows: string[], w: number, h: number): string[] {
  const out: string[] = [];
  for (let y = 0; y < h; y++) {
    let row = '';
    for (let x = 0; x < w; x++) {
      const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1;
      const prev = rows[y]?.[x];
      row += prev ?? (edge ? '#' : '.');
    }
    out.push(row);
  }
  return out;
}

// Ensure exactly one spawn cell: when you paint a new 'S', clear the old one.
function setCell(rows: string[], x: number, y: number, ch: string): string[] {
  const out = rows.map((r, ry) => {
    if (ch === 'S') r = r.replace(/S/g, '.');   // single spawn
    if (ry !== y) return r;
    return r.substring(0, x) + ch + r.substring(x + 1);
  });
  return out;
}

// Height map helpers — a parallel grid of digits ('0'–'9'), lazily created and kept the size of rows.
function normHeights(rows: string[], heights?: string[]): string[] {
  return rows.map((r, y) => {
    const src = heights?.[y] ?? '';
    let out = '';
    for (let x = 0; x < r.length; x++) out += src[x] && /[0-9]/.test(src[x]) ? src[x] : '0';
    return out;
  });
}
function bumpHeight(rows: string[], heights: string[] | undefined, x: number, y: number, delta: number): string[] {
  const h = normHeights(rows, heights);
  const cur = h[y].charCodeAt(x) - 48;
  const next = Math.max(0, Math.min(9, cur + delta));
  h[y] = h[y].substring(0, x) + String(next) + h[y].substring(x + 1);
  return h;
}

// A fresh blank storey: solid border wall, open floor inside.
const blankFloorRows = (w: number, h: number): string[] =>
  Array.from({ length: h }, (_, y) =>
    Array.from({ length: w }, (_, x) => (x === 0 || y === 0 || x === w - 1 || y === h - 1 ? '#' : '.')).join(''));

// The designer always edits in multi-floor form; normalise any level into floors[] on load.
const toFloors = (l: Level3D): Level3D =>
  l.floors && l.floors.length ? l : { ...l, floors: [{ rows: l.rows, heights: l.heights, npcs: l.npcs }] };
// …and collapse a single-storey realm back to the simple grid format on save (so old realms stay tidy).
const collapse = (l: Level3D): Level3D => {
  const fs = l.floors ?? [{ rows: l.rows, heights: l.heights, npcs: l.npcs }];
  if (fs.length === 1) { const { floors: _drop, ...rest } = l; void _drop; return { ...rest, rows: fs[0].rows, heights: fs[0].heights, npcs: fs[0].npcs }; }
  return { ...l, floors: fs, rows: fs[0].rows, heights: undefined, npcs: undefined };   // mirror floor0 into the required rows
};

export const RaycastDesigner: React.FC<{
  initialId?: string;
  isMobileStage?: boolean;
  onExit?: (levelId?: string) => void;   // passes the realm id back so the room can arm a portal to it
}> = ({ initialId, isMobileStage = false, onExit }) => {
  const [level, setLevel] = useState<Level3D>(() => toFloors((initialId && getLevel(initialId)) || blankLevel()));
  const [brush, setBrush] = useState('#');
  const [testing, setTesting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [library, setLibrary] = useState(false);
  const [floorIdx, setFloorIdx] = useState(0);   // which storey you're editing
  const [npcCell, setNpcCell] = useState<{ x: number; y: number } | null>(null);   // open the builder for this cell
  const painting = useRef(false);

  const floors = level.floors ?? [{ rows: level.rows, heights: level.heights, npcs: level.npcs }];
  const fIdx = Math.max(0, Math.min(floorIdx, floors.length - 1));
  const cur = floors[fIdx];                       // the storey currently on the easel
  const npcAt = (x: number, y: number) => (cur.npcs ?? []).find(n => n.x === x && n.y === y);

  const rows = cur.rows;
  const w = rows[0]?.length ?? 0, h = rows.length;
  const builtin = isBuiltin(level.id);
  const spawnFi = Math.max(0, floors.findIndex(f => f.rows.some(r => r.includes('S'))));   // the ground = the spawn storey
  const floorRel = fIdx - spawnFi;
  const floorName = floorRel === 0 ? 'Ground' : floorRel > 0 ? `Floor +${floorRel}` : `Basement ${floorRel}`;

  // Edit just the active storey; keep floor0 mirrored into level.rows (the required field).
  const setActiveFloor = (updater: (f: Floor3D) => Floor3D) => {
    setLevel(l => {
      const fs = (l.floors ?? [{ rows: l.rows, heights: l.heights, npcs: l.npcs }]).map((f, i) => i === fIdx ? updater(f) : f);
      return { ...l, floors: fs, rows: fs[0].rows };
    });
    setSaved(false);
  };

  const paint = useCallback((x: number, y: number) => {
    if (brush === 'NPC') { setNpcCell({ x, y }); return; }   // open the character builder for this tile
    if (brush === 'S') {
      // spawn is unique across the WHOLE realm — clear 'S' on every storey, then set it here
      setLevel(l => {
        const fs = (l.floors ?? [{ rows: l.rows, heights: l.heights, npcs: l.npcs }]).map((f, i) => {
          const rws = f.rows.map(r => r.replace(/S/g, '.'));
          if (i === fIdx) rws[y] = rws[y].substring(0, x) + 'S' + rws[y].substring(x + 1);
          const npcs = i === fIdx ? (f.npcs ?? []).filter(n => !(n.x === x && n.y === y)) : f.npcs;
          return { ...f, rows: rws, npcs: npcs && npcs.length ? npcs : undefined };
        });
        return { ...l, floors: fs, rows: fs[0].rows };
      });
      setSaved(false);
      return;
    }
    if (brush === 'H+' || brush === 'H-') {
      setActiveFloor(f => {
        // can't raise a wall cell — heights are for floors you walk on
        if (/[#1-9]/.test(f.rows[y]?.[x] ?? '#')) return f;
        return { ...f, heights: bumpHeight(f.rows, f.heights, x, y, brush === 'H+' ? 1 : -1) };
      });
      return;
    }
    setActiveFloor(f => {
      // painting a cell also clears any NPC sitting on it
      const npcs = (f.npcs ?? []).filter(n => !(n.x === x && n.y === y));
      return { ...f, rows: setCell(f.rows, x, y, brush), npcs: npcs.length ? npcs : undefined };
    });
  }, [brush, fIdx]);   // eslint-disable-line react-hooks/exhaustive-deps

  // Character builder placed/updated a character → store it on the active storey at the chosen tile.
  const placeNpc = (d: NpcData) => {
    if (!npcCell) return;
    const { x, y } = npcCell;
    setActiveFloor(f => {
      const npcs = (f.npcs ?? []).filter(n => !(n.x === x && n.y === y));
      npcs.push({ x, y, a: d.a, n: d.n || undefined, sz: d.sz, lines: d.l?.length ? d.l : undefined });
      return { ...f, npcs };
    });
    setNpcCell(null);
  };

  const doResize = (nw: number, nh: number) => {
    const cw = Math.max(4, Math.min(40, nw)), ch = Math.max(4, Math.min(40, nh));
    setLevel(l => {
      const fs = (l.floors ?? [{ rows: l.rows, heights: l.heights, npcs: l.npcs }]).map(f => {
        const rws = resizeRows(f.rows, cw, ch);
        return { ...f, rows: rws, heights: f.heights ? normHeights(rws, f.heights) : undefined };
      });
      return { ...l, floors: fs, rows: fs[0].rows };
    });
    setSaved(false);
  };

  // ── Storeys: add one above, dig a basement below, or remove the current one ──────────────────
  const addFloor = (where: 'above' | 'below') => {
    setLevel(l => {
      const fs = [...(l.floors ?? [{ rows: l.rows, heights: l.heights, npcs: l.npcs }])];
      const nf: Floor3D = { rows: blankFloorRows(fs[0].rows[0].length, fs[0].rows.length) };
      if (where === 'above') { fs.push(nf); setFloorIdx(fs.length - 1); }
      else { fs.unshift(nf); setFloorIdx(0); }   // new basement slots in at the bottom
      return { ...l, floors: fs, rows: fs[0].rows };
    });
    setSaved(false);
  };
  const removeFloor = () => {
    setLevel(l => {
      const fs = [...(l.floors ?? [])];
      if (fs.length <= 1) return l;
      fs.splice(fIdx, 1);
      setFloorIdx(Math.max(0, fIdx - 1));
      return { ...l, floors: fs, rows: fs[0].rows };
    });
    setSaved(false);
  };

  const save = () => {
    // Builtins are read-only — fork to a fresh id so the original demo stays intact.
    let toSave = collapse(level);
    if (builtin) { toSave = { ...toSave, id: newLevelId(), name: level.name + ' (copy)' }; setLevel(toFloors(toSave)); }
    saveLevel(toSave);
    setSaved(true);
  };

  const startNew = () => { setLevel(toFloors(blankLevel())); setFloorIdx(0); setSaved(false); setLibrary(false); };
  const load = (id: string) => { const l = getLevel(id); if (l) { setLevel(toFloors(l)); setFloorIdx(0); setSaved(true); setLibrary(false); } };
  const remove = (id: string) => { deleteLevel(id); if (id === level.id) startNew(); };

  const allRows = floors.flatMap(f => f.rows);
  const hasSpawn = allRows.some(r => r.includes('S'));   // spawn can live on any storey
  const hasExit = allRows.some(r => r.includes('E'));

  // Done → save the realm (so a portal can reference it) and hand its id back to the room.
  const finish = () => {
    const out = collapse(level);
    if (hasSpawn && !builtin) { saveLevel(out); onExit?.(out.id); }
    else onExit?.(builtin ? level.id : undefined);
  };

  if (testing) {
    return (
      <div className="relative w-full h-full">
        <RaycastCanvas level={level} isMobileStage={isMobileStage} onExit={() => setTesting(false)} />
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-40 font-mono text-[10px] uppercase tracking-[0.3em] text-[#1ee0ff]/80 pointer-events-none">test play</div>
      </div>
    );
  }

  // Cell size scales down for bigger grids so the whole map fits the panel.
  const cellPx = Math.max(12, Math.min(30, Math.floor(560 / Math.max(w, h))));

  return (
    <div className="relative w-full h-full flex flex-col bg-[#0a0a12] text-white overflow-hidden" style={{ touchAction: 'none' }}>
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10 shrink-0">
        <span className="font-mono text-[11px] uppercase tracking-[0.35em] text-[#1ee0ff]">◢ realm forge</span>
        <input
          value={level.name}
          onChange={e => { setLevel(l => ({ ...l, name: e.target.value })); setSaved(false); }}
          className="bg-white/5 border border-white/15 px-3 py-1.5 text-sm outline-none focus:border-[#1ee0ff] font-mono"
          placeholder="Realm name"
        />
        <div className="flex-1" />
        <button onClick={() => setLibrary(v => !v)} className="text-[11px] font-mono uppercase tracking-wider border border-white/20 px-3 py-1.5 hover:border-white/50">Library</button>
        <button onClick={startNew} className="text-[11px] font-mono uppercase tracking-wider border border-white/20 px-3 py-1.5 hover:border-white/50">New</button>
        <button onClick={finish} className="text-[11px] font-mono uppercase tracking-wider text-brandYellow border border-brandYellow px-3 py-1.5 hover:bg-brandYellow hover:text-black">Done → portal</button>
      </div>

      <div className="flex-1 flex min-h-0">
        {/* Tools */}
        <div className="w-44 shrink-0 border-r border-white/10 p-3 flex flex-col gap-2 overflow-y-auto">
          <p className="text-[9px] uppercase tracking-widest text-white/40">Brush</p>
          <div className="grid grid-cols-2 gap-1.5">
            {BRUSHES.map(b => (
              <button key={b.ch} onClick={() => setBrush(b.ch)}
                className={`flex items-center gap-1.5 px-2 py-1.5 border text-[10px] font-mono transition-colors ${brush === b.ch ? 'border-[#1ee0ff] bg-[#1ee0ff]/10' : 'border-white/15 hover:border-white/40'}`}>
                <span className="w-3 h-3 border border-white/30" style={{ background: b.color }} />
                {b.label}
              </button>
            ))}
          </div>

          <button onClick={() => setBrush('NPC')}
            className={`mt-1 px-2 py-1.5 border text-[10px] font-mono transition-colors ${brush === 'NPC' ? 'border-[#1ED760] bg-[#1ED760]/10 text-[#1ED760]' : 'border-white/15 hover:border-white/40'}`}>
            ☻ NPC dropper <span className="text-white/30 normal-case">(character builder)</span>
          </button>

          <p className="text-[9px] uppercase tracking-widest text-white/40 mt-2">Height <span className="text-white/25 normal-case tracking-normal">(steps · climb 1)</span></p>
          <div className="grid grid-cols-2 gap-1.5">
            {([['H+', '▲ Raise'], ['H-', '▼ Lower']] as [string, string][]).map(([ch, label]) => (
              <button key={ch} onClick={() => setBrush(ch)}
                className={`px-2 py-1.5 border text-[10px] font-mono transition-colors ${brush === ch ? 'border-[#ffd400] bg-[#ffd400]/10 text-[#ffd400]' : 'border-white/15 hover:border-white/40'}`}>
                {label}
              </button>
            ))}
          </div>

          <p className="text-[9px] uppercase tracking-widest text-white/40 mt-2">Atmosphere</p>
          <div className="flex flex-wrap gap-1">
            {Object.entries(ATMOS).map(([key, a]) => (
              <button key={key} onClick={() => { setLevel(l => ({ ...l, atmo: key })); setSaved(false); }}
                className={`text-[9px] font-mono px-2 py-1 border transition-colors ${(level.atmo ?? 'dungeon') === key ? 'border-[#1ee0ff] bg-[#1ee0ff]/10 text-[#1ee0ff]' : 'border-white/15 text-white/60 hover:border-white/40'}`}>
                {a.light ? '☾ ' : ''}{a.label}
              </button>
            ))}
          </div>

          <p className="text-[9px] uppercase tracking-widest text-white/40 mt-2">Sky</p>
          <div className="flex flex-wrap gap-1">
            <button onClick={() => { setLevel(l => ({ ...l, sky: undefined })); setSaved(false); }}
              className={`text-[9px] font-mono px-2 py-1 border transition-colors ${!level.sky ? 'border-[#1ee0ff] bg-[#1ee0ff]/10 text-[#1ee0ff]' : 'border-white/15 text-white/60 hover:border-white/40'}`}>Roof</button>
            {Object.entries(SKIES).map(([key, s]) => (
              <button key={key} onClick={() => { setLevel(l => ({ ...l, sky: key })); setSaved(false); }}
                className={`text-[9px] font-mono px-2 py-1 border transition-colors ${level.sky === key ? 'border-[#1ee0ff] bg-[#1ee0ff]/10 text-[#1ee0ff]' : 'border-white/15 text-white/60 hover:border-white/40'}`}>
                {s.label}
              </button>
            ))}
          </div>

          <label className="flex items-center gap-2 text-[10px] font-mono text-white/70 mt-2 cursor-pointer">
            <input type="checkbox" checked={!!level.combat} onChange={e => { setLevel(l => ({ ...l, combat: e.target.checked })); setSaved(false); }} className="accent-brandRed" />
            ⚔ Combat (else run-and-hide)
          </label>

          <p className="text-[9px] uppercase tracking-widest text-white/40 mt-2">Size</p>
          <div className="flex items-center gap-1.5 text-[11px] font-mono">
            <button onClick={() => doResize(w - 1, h)} className="w-7 h-7 border border-white/20 hover:border-white/50">–</button>
            <span className="w-8 text-center">{w}w</span>
            <button onClick={() => doResize(w + 1, h)} className="w-7 h-7 border border-white/20 hover:border-white/50">+</button>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] font-mono">
            <button onClick={() => doResize(w, h - 1)} className="w-7 h-7 border border-white/20 hover:border-white/50">–</button>
            <span className="w-8 text-center">{h}h</span>
            <button onClick={() => doResize(w, h + 1)} className="w-7 h-7 border border-white/20 hover:border-white/50">+</button>
          </div>

          <p className="text-[9px] uppercase tracking-widest text-white/40 mt-2">Storeys <span className="text-white/25 normal-case tracking-normal">(stairs ↑/↓ connect)</span></p>
          <div className="flex items-center gap-1 text-[11px] font-mono">
            <button onClick={() => setFloorIdx(Math.min(floors.length - 1, fIdx + 1))} disabled={fIdx >= floors.length - 1}
              className="w-7 h-7 border border-white/20 hover:border-white/50 disabled:opacity-30">▲</button>
            <span className="flex-1 text-center text-[10px]">{floorName}<span className="text-white/30"> · {fIdx + 1}/{floors.length}</span></span>
            <button onClick={() => setFloorIdx(Math.max(0, fIdx - 1))} disabled={fIdx <= 0}
              className="w-7 h-7 border border-white/20 hover:border-white/50 disabled:opacity-30">▼</button>
          </div>
          <div className="flex items-center gap-1 text-[9px] font-mono">
            <button onClick={() => addFloor('above')} className="flex-1 border border-white/15 hover:border-white/40 py-1">+ Above</button>
            <button onClick={() => addFloor('below')} className="flex-1 border border-white/15 hover:border-white/40 py-1">+ Basement</button>
            <button onClick={removeFloor} disabled={floors.length <= 1} className="border border-brandRed/40 text-brandRed/80 hover:bg-brandRed/10 py-1 px-2 disabled:opacity-30">✕</button>
          </div>

          <div className="mt-auto pt-3 flex flex-col gap-1.5">
            {!hasSpawn && <p className="text-[10px] text-brandRed font-mono">⚠ place a Spawn</p>}
            {!hasExit && <p className="text-[10px] text-brandYellow/80 font-mono">no Exit — add one to escape</p>}
            <button onClick={() => setTesting(true)} disabled={!hasSpawn}
              className="text-[11px] font-mono uppercase tracking-wider bg-[#1ee0ff] text-black font-bold py-2 disabled:opacity-30 hover:bg-white">▸ Test play</button>
            <button onClick={save}
              className="text-[11px] font-mono uppercase tracking-wider border border-[#1ee0ff]/60 text-[#1ee0ff] py-2 hover:bg-[#1ee0ff]/10">
              {saved ? '✓ Saved' : builtin ? 'Fork & save' : 'Save'}
            </button>
            {saved && <p className="text-[9px] text-white/40 font-mono break-all">portal → r3d:{level.id}</p>}
          </div>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-auto p-4 flex items-start justify-center"
          onPointerUp={() => { painting.current = false; }}
          onPointerLeave={() => { painting.current = false; }}>
          <div className="inline-grid border border-white/10"
            style={{ gridTemplateColumns: `repeat(${w}, ${cellPx}px)` }}>
            {rows.flatMap((row, y) =>
              Array.from({ length: w }, (_, x) => {
                const ch = row[x] || '.';
                const hd = cur.heights?.[y]?.[x];
                const raised = hd && hd !== '0';
                return (
                  <button
                    key={`${x}-${y}`}
                    onPointerDown={() => { painting.current = true; paint(x, y); }}
                    onPointerEnter={() => { if (painting.current) paint(x, y); }}
                    className="flex items-center justify-center relative"
                    style={{
                      width: cellPx, height: cellPx, background: colorOf(ch),
                      outline: '1px solid rgba(255,255,255,0.05)',
                      fontSize: cellPx * 0.5, lineHeight: 1,
                      boxShadow: raised ? `inset 0 0 0 ${Math.max(1, Math.round(Number(hd)))}px rgba(255,212,0,0.5)` : undefined,
                    }}
                  >
                    {npcAt(x, y) ? <span className="text-[#1ED760]">☻</span> : ch === 'C' ? '◆' : ch === 'S' ? '★' : ch === 'E' ? '⎋' : ch === 'M' ? '☠' : ch === 'T' ? '♣' : ch === 'O' ? '◎' : ch === '>' ? '▲' : ch === '<' ? '▼' : ''}
                    {raised && <span className="absolute bottom-0 right-0.5 text-[#ffd400] font-mono" style={{ fontSize: cellPx * 0.32 }}>{hd}</span>}
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Character builder (same one the rooms use) — drops the character at the chosen tile */}
      <NpcEditor open={!!npcCell} initial={npcCell ? (npcAt(npcCell.x, npcCell.y) ? { n: npcAt(npcCell.x, npcCell.y)!.n ?? '', a: npcAt(npcCell.x, npcCell.y)!.a, l: npcAt(npcCell.x, npcCell.y)!.lines ?? [], sz: npcAt(npcCell.x, npcCell.y)!.sz } : null) : null}
        onPlace={placeNpc} onClose={() => setNpcCell(null)} />

      {/* Library drawer */}
      {library && (
        <div className="absolute inset-0 z-40 bg-black/85 flex items-center justify-center p-6" onClick={() => setLibrary(false)}>
          <div className="w-full max-w-md border border-[#1ee0ff]/40 bg-black p-5 space-y-3 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <p className="font-mono text-[10px] uppercase tracking-[0.35em] text-[#1ee0ff]">Realm library</p>
            {listLevels().map(l => (
              <div key={l.id} className="flex items-center gap-2 border border-white/15 px-3 py-2">
                <button onClick={() => load(l.id)} className="flex-1 text-left text-sm font-mono hover:text-[#1ee0ff]">
                  {l.name} <span className="text-white/30 text-[10px]">{isBuiltin(l.id) ? 'demo' : l.rows[0].length + '×' + l.rows.length}</span>
                </button>
                {!isBuiltin(l.id) && <button onClick={() => remove(l.id)} className="text-brandRed/70 hover:text-brandRed text-xs">✕</button>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default RaycastDesigner;
