'use client';

// OUROO R3D DESIGNER — a paint-grid editor for first-person 3D realms. Pick a brush (wall textures,
// floor, lava, pits, crystals, exit, spawn), drag to paint the grid, name it, save it (localStorage),
// and test-play instantly in the real raycaster. Saved realms appear in the room's portal maker, so a
// mod can drop a portal whose destination is `r3d:<id>` and summon the world they just built.

import React, { useState, useRef, useCallback } from 'react';
import {
  type Level3D, ATMOS, SKIES, listLevels, saveLevel, deleteLevel, getLevel, blankLevel, isBuiltin, newLevelId,
} from '@/lib/raycast/levels';
import { RaycastCanvas } from './RaycastCanvas';

type Brush = { ch: string; label: string; color: string };
const BRUSHES: Brush[] = [
  { ch: '#', label: 'Stone', color: '#787496' },
  { ch: '1', label: 'Brick', color: '#965a50' },
  { ch: '2', label: 'Blue', color: '#465a78' },
  { ch: '3', label: 'Moss', color: '#28dcb4' },
  { ch: '4', label: 'Gold', color: '#a08c46' },
  { ch: '.', label: 'Floor', color: '#26242f' },
  { ch: 'L', label: 'Lava', color: '#ff5a1e' },
  { ch: '~', label: 'Pit', color: '#050308' },
  { ch: 'C', label: 'Crystal', color: '#9beaff' },
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

export const RaycastDesigner: React.FC<{
  initialId?: string;
  isMobileStage?: boolean;
  onExit?: () => void;
}> = ({ initialId, isMobileStage = false, onExit }) => {
  const [level, setLevel] = useState<Level3D>(() => (initialId && getLevel(initialId)) || blankLevel());
  const [brush, setBrush] = useState('#');
  const [testing, setTesting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [library, setLibrary] = useState(false);
  const painting = useRef(false);

  const rows = level.rows;
  const w = rows[0]?.length ?? 0, h = rows.length;
  const builtin = isBuiltin(level.id);

  const paint = useCallback((x: number, y: number) => {
    setLevel(l => {
      if (brush === 'H+' || brush === 'H-') {
        // can't raise a wall cell — heights are for floors you walk on
        if (/[#1-9]/.test(l.rows[y]?.[x] ?? '#')) return l;
        return { ...l, heights: bumpHeight(l.rows, l.heights, x, y, brush === 'H+' ? 1 : -1) };
      }
      return { ...l, rows: setCell(l.rows, x, y, brush) };
    });
    setSaved(false);
  }, [brush]);

  const doResize = (nw: number, nh: number) => {
    const cw = Math.max(4, Math.min(40, nw)), ch = Math.max(4, Math.min(40, nh));
    setLevel(l => {
      const rows = resizeRows(l.rows, cw, ch);
      return { ...l, rows, heights: l.heights ? normHeights(rows, l.heights) : undefined };
    });
    setSaved(false);
  };

  const save = () => {
    // Builtins are read-only — fork to a fresh id so the original demo stays intact.
    let toSave = level;
    if (builtin) { toSave = { ...level, id: newLevelId(), name: level.name + ' (copy)' }; setLevel(toSave); }
    saveLevel(toSave);
    setSaved(true);
  };

  const startNew = () => { setLevel(blankLevel()); setSaved(false); setLibrary(false); };
  const load = (id: string) => { const l = getLevel(id); if (l) { setLevel(l); setSaved(true); setLibrary(false); } };
  const remove = (id: string) => { deleteLevel(id); if (id === level.id) startNew(); };

  const hasSpawn = rows.some(r => r.includes('S'));
  const hasExit = rows.some(r => r.includes('E'));

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
        <button onClick={() => onExit?.()} className="text-[11px] font-mono uppercase tracking-wider text-brandYellow border border-brandYellow px-3 py-1.5 hover:bg-brandYellow hover:text-black">Done</button>
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
                const hd = level.heights?.[y]?.[x];
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
                    {ch === 'C' ? '◆' : ch === 'S' ? '★' : ch === 'E' ? '⎋' : ch === 'M' ? '☠' : ''}
                    {raised && <span className="absolute bottom-0 right-0.5 text-[#ffd400] font-mono" style={{ fontSize: cellPx * 0.32 }}>{hd}</span>}
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>

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
