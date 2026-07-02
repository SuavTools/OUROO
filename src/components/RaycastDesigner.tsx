'use client';

// OUROO R3D DESIGNER — a paint-grid editor for first-person 3D realms. Pick a brush (wall textures,
// floor, lava, pits, crystals, exit, spawn), drag to paint the grid, name it, save it (localStorage),
// and test-play instantly in the real raycaster. Saved realms appear in the room's portal maker, so a
// mod can drop a portal whose destination is `r3d:<id>` and summon the world they just built.

import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  type Level3D, type Floor3D, ATMOS, SKIES, listLevels, getLevel, blankLevel, isBuiltin, newLevelId, blankAirRows, isAir, AIR,
  saveRealmRemote, fetchRealmsRemote, deleteRealmRemote,
} from '@/lib/raycast/levels';
import { RaycastCanvas } from './RaycastCanvas';
import { NpcEditor, type NpcData } from './NpcEditor';

type Brush = { ch: string; label: string; color: string; grp: string };
const BRUSHES: Brush[] = [
  // Floors — the walkable surface of a cell
  { ch: '.', label: 'Floor', color: '#26242f', grp: 'Floors' },
  { ch: 'g', label: 'Grass', color: '#2e7830', grp: 'Floors' },
  { ch: 'd', label: 'Dirt', color: '#6b5238', grp: 'Floors' },
  { ch: 'k', label: 'Wood', color: '#7a5a34', grp: 'Floors' },
  { ch: 'p', label: 'Road', color: '#969aa6', grp: 'Floors' },
  { ch: 'w', label: 'Water', color: '#1a5aaa', grp: 'Floors' },
  { ch: 'L', label: 'Lava', color: '#ff5a1e', grp: 'Floors' },
  { ch: '~', label: 'Pit', color: '#050308', grp: 'Floors' },
  { ch: AIR, label: 'Air / Erase', color: '#0a0a14', grp: 'Floors' },
  // Walls — full-storey structural (also used with Stack mode to build columns)
  { ch: '#', label: 'Stone', color: '#787496', grp: 'Walls' },
  { ch: '1', label: 'Brick', color: '#965a50', grp: 'Walls' },
  { ch: '2', label: 'Blue', color: '#465a78', grp: 'Walls' },
  { ch: '3', label: 'Moss', color: '#28dcb4', grp: 'Walls' },
  { ch: '4', label: 'Gold', color: '#a08c46', grp: 'Walls' },
  // Blocks — placed ON a floor cell (grass → rock on top). blk:<mat>, blk:. removes.
  { ch: 'blk:r', label: 'Stone', color: '#7a766e', grp: 'Blocks' },
  { ch: 'blk:c', label: 'Cobble', color: '#6c6e78', grp: 'Blocks' },
  { ch: 'blk:w', label: 'Wood', color: '#966c3e', grp: 'Blocks' },
  { ch: 'blk:b', label: 'Brick', color: '#964a3c', grp: 'Blocks' },
  { ch: 'blk:l', label: 'Leaves', color: '#2e7a36', grp: 'Blocks' },
  { ch: 'blk:x', label: 'Dark', color: '#42404a', grp: 'Blocks' },
  { ch: 'blk:i', label: 'Wood post', color: '#8c643a', grp: 'Blocks' },
  { ch: 'blk:o', label: 'Pillar', color: '#78746e', grp: 'Blocks' },
  { ch: 'blk:s', label: 'Slab', color: '#807c76', grp: 'Blocks' },
  { ch: 'blk:.', label: 'Un-block', color: '#1a1420', grp: 'Blocks' },
  // Props — voxel objects & connectors
  { ch: 'T', label: 'Tree', color: '#1e6b2e', grp: 'Props' },
  { ch: 'b', label: 'Bush', color: '#3c8a40', grp: 'Props' },
  { ch: 'f', label: 'Flower', color: '#e6557a', grp: 'Props' },
  { ch: 'r', label: 'Rock', color: '#8a8a92', grp: 'Props' },
  { ch: 'l', label: 'Lamp', color: '#ffd27a', grp: 'Props' },
  { ch: 'C', label: 'Crystal', color: '#9beaff', grp: 'Props' },
  { ch: 'H', label: 'Chest', color: '#c8963c', grp: 'Props' },
  { ch: 'O', label: 'Tunnel', color: '#b35cff', grp: 'Props' },
  { ch: '>', label: 'Stairs ↑', color: '#9be07a', grp: 'Props' },
  { ch: '<', label: 'Stairs ↓', color: '#3a4a66', grp: 'Props' },
  // Markers
  { ch: 'M', label: 'Stalker', color: '#b03030', grp: 'Marks' },
  { ch: 'E', label: 'Exit', color: '#1ee0ff', grp: 'Marks' },
  { ch: 'S', label: 'Spawn', color: '#ffd400', grp: 'Marks' },
];
const BRUSH_GROUPS = ['Floors', 'Walls', 'Blocks', 'Props', 'Marks'];
const colorOf = (ch: string) => BRUSHES.find(b => b.ch === ch)?.color ?? '#26242f';
const isBlockBrush = (b: string) => b.startsWith('blk:');
// Set a cell in the parallel BLOCK grid (creating/normalising it to the rows' size). ' ' = no block.
function setBlockCell(blocks: string[] | undefined, rows: string[], x: number, y: number, ch: string): string[] {
  const w = rows[0]?.length ?? 0;
  const grid = (blocks && blocks.length === rows.length)
    ? blocks.map(r => (r.length === w ? r : r.padEnd(w, ' ').slice(0, w)))
    : rows.map(() => ' '.repeat(w));
  grid[y] = grid[y].substring(0, x) + ch + grid[y].substring(x + 1);
  return grid;
}
// Bump a cell's block STACK height (1–9). Only where a block exists; returns the digit grid.
function bumpBlockH(rows: string[], blocks: string[] | undefined, blockH: string[] | undefined, x: number, y: number, delta: number): string[] | undefined {
  const w = rows[0]?.length ?? 0;
  const grid = (blockH && blockH.length === rows.length) ? blockH.map(r => (r.length === w ? r : r.padEnd(w, '1').slice(0, w))) : rows.map(() => '1'.repeat(w));
  const cur = grid[y].charCodeAt(x) - 48;
  const next = Math.max(1, Math.min(9, (cur >= 1 && cur <= 9 ? cur : 1) + delta));
  grid[y] = grid[y].substring(0, x) + String(next) + grid[y].substring(x + 1);
  return grid;
}

// Cell classification for the side elevation: walls are solid one-storey columns; pits/air are gaps;
// everything else is a thin walkable slab sitting at the floor's height.
const isWallCh = (c: string) => /[#1-4]/.test(c);
const isGapCh = (c: string) => isAir(c) || c === '~';

// ── SIDE ELEVATION (cross-section) ────────────────────────────────────────────────────────────────
// A read-only canvas that slices the realm vertically so you can SEE the stack: storeys at their true
// heights, walls as blocks, walkable slabs as thin shelves, air/pits as gaps. The slice follows the
// cell you hover in the top-down grid. Click a storey here to jump to editing it.
const SE_SL = 3;          // height-levels per storey (matches STOREY_LEVELS in the raycaster)
const SE_SLAB = 0.55;     // drawn thickness of a walkable slab, in height-levels
const SideElevation: React.FC<{
  floors: Floor3D[]; axis: 'front' | 'side'; slice: number; editIdx: number; w: number; h: number;
  onPick?: (k: number) => void;
}> = ({ floors, axis, slice, editIdx, w, h, onPick }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const geom = useRef({ padY: 0, plotH: 1, maxTop: 1, nF: 1 });

  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    const ctx = cv.getContext('2d'); if (!ctx) return;
    const nF = floors.length;
    const nCells = axis === 'front' ? w : h;
    const at = (k: number, i: number): [string, number] => {
      const f = floors[k]; if (!f) return [' ', 0];
      const row = axis === 'front' ? f.rows[slice] : f.rows[i];
      const ch = (axis === 'front' ? row?.[i] : row?.[slice]) ?? ' ';
      const hsrc = axis === 'front' ? f.heights?.[slice]?.[i] : f.heights?.[i]?.[slice];
      const hd = hsrc && /[0-9]/.test(hsrc) ? +hsrc : 0;
      return [ch, hd];
    };

    const draw = () => {
      const DPR = window.devicePixelRatio || 1;
      const cssW = cv.clientWidth || 1, cssH = cv.clientHeight || 1;
      cv.width = Math.round(cssW * DPR); cv.height = Math.round(cssH * DPR);
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);

      let maxTop = nF * SE_SL;
      for (let k = 0; k < nF; k++) for (let i = 0; i < nCells; i++) {
        const [ch, hd] = at(k, i); const base = k * SE_SL;
        if (isWallCh(ch)) maxTop = Math.max(maxTop, base + SE_SL);
        else if (!isGapCh(ch)) maxTop = Math.max(maxTop, base + hd + SE_SLAB);
      }
      maxTop += 0.5;

      const padX = 16, padY = 5;
      const plotW = cssW - padX - 5, plotH = cssH - 2 * padY;
      geom.current = { padY, plotH, maxTop, nF };
      const cw = plotW / nCells;
      const Y = (lvl: number) => padY + plotH - (lvl / maxTop) * plotH;
      const X = (i: number) => padX + i * cw;

      // editing-storey highlight band + per-storey ground lines and index labels
      ctx.fillStyle = 'rgba(30,224,255,0.06)';
      ctx.fillRect(padX, Y((editIdx + 1) * SE_SL), plotW, Y(editIdx * SE_SL) - Y((editIdx + 1) * SE_SL));
      ctx.font = '8px ui-monospace, monospace'; ctx.textBaseline = 'middle';
      for (let k = 0; k <= nF; k++) {
        const y = Y(k * SE_SL);
        ctx.strokeStyle = k === editIdx ? 'rgba(30,224,255,0.4)' : 'rgba(255,255,255,0.07)';
        ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(padX, y); ctx.lineTo(cssW - 5, y); ctx.stroke();
        if (k < nF) { ctx.fillStyle = k === editIdx ? '#1ee0ff' : 'rgba(255,255,255,0.3)'; ctx.textAlign = 'right'; ctx.fillText(String(k), padX - 3, Y(k * SE_SL + SE_SL / 2)); }
      }

      // the stack, storey by storey
      for (let k = 0; k < nF; k++) {
        const base = k * SE_SL;
        for (let i = 0; i < nCells; i++) {
          const [ch, hd] = at(k, i); const x = X(i);
          if (isWallCh(ch)) {
            const yT = Y(base + SE_SL), yB = Y(base);
            ctx.fillStyle = colorOf(ch); ctx.fillRect(x + 0.5, yT, Math.max(1, cw - 1), yB - yT);
            ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 0.5; ctx.strokeRect(x + 0.5, yT, Math.max(1, cw - 1), yB - yT);
          } else if (!isGapCh(ch)) {
            // raised terrain is a SOLID pillar from the storey floor up to its lifted top (matches the game);
            // a flat tile (hd 0) is just a thin walkable shelf.
            const yT = Y(base + hd + SE_SLAB), yB = Y(hd > 0 ? base : base + hd);
            ctx.fillStyle = colorOf(ch); ctx.fillRect(x + 0.5, yT, Math.max(1, cw - 1), Math.max(1.5, yB - yT));
            const m = ch === 'S' ? '★' : ch === 'E' ? '⎋' : ch === 'C' ? '◆' : ch === 'M' ? '☠' : ch === 'T' ? '♣' : ch === 'L' ? '' : '';
            if (m && cw > 5) { ctx.fillStyle = ch === 'S' ? '#ffd400' : ch === 'E' ? '#1ee0ff' : ch === 'C' ? '#9beaff' : '#fff'; ctx.font = `${Math.min(cw, 12)}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillText(m, x + cw / 2, yT - 1); ctx.textBaseline = 'middle'; ctx.font = '8px ui-monospace, monospace'; }
          }
        }
      }
    };

    draw();
    const ro = new ResizeObserver(draw); ro.observe(cv);
    return () => ro.disconnect();
  }, [floors, axis, slice, editIdx, w, h]);

  const click = (e: React.MouseEvent) => {
    const cv = ref.current; if (!cv || !onPick) return;
    const r = cv.getBoundingClientRect();
    const { padY, plotH, maxTop, nF } = geom.current;
    const lvl = (1 - (e.clientY - r.top - padY) / plotH) * maxTop;
    onPick(Math.max(0, Math.min(nF - 1, Math.floor(lvl / SE_SL))));
  };
  return <canvas ref={ref} onClick={click} className="w-full h-full block cursor-pointer" />;
};

// ── TOP-DOWN PAINT GRID (canvas) ────────────────────────────────────────────────────────────────
// One canvas for the whole map instead of one <button> per cell — so a 128×128 realm (16k cells) paints
// smoothly instead of choking the DOM. Draws cell colours, height shading, special-cell glyphs, the
// ghost of the floor below (for aligning overhangs), the live rectangle preview, and the slice line.
const GLYPH: Record<string, string> = { C: '◆', H: '▤', S: '★', E: '⎋', M: '☠', T: '♣', b: '♧', f: '✿', r: '●', l: '☀', O: '◎', '>': '▲', '<': '▼' };
const GridCanvas: React.FC<{
  rows: string[]; heights?: string[]; blocks?: string[]; blockH?: string[]; belowRows?: string[]; npcs?: { x: number; y: number }[];
  w: number; h: number; cellPx: number;
  rect: { ax: number; ay: number; bx: number; by: number } | null;
  sliceOn: boolean; sideAxis: 'front' | 'side'; slice: number;
  onDown: (x: number, y: number) => void; onMove: (x: number, y: number) => void; onUp: () => void;
}> = ({ rows, heights, blocks, blockH, belowRows, npcs, w, h, cellPx, rect, sliceOn, sideAxis, slice, onDown, onMove, onUp }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const last = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    const ctx = cv.getContext('2d'); if (!ctx) return;
    const DPR = window.devicePixelRatio || 1;
    const W = w * cellPx, H = h * cellPx;
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    cv.style.width = `${W}px`; cv.style.height = `${H}px`;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const npcSet = new Set((npcs ?? []).map(n => `${n.x}:${n.y}`));

    for (let y = 0; y < h; y++) {
      const row = rows[y] ?? '';
      for (let x = 0; x < w; x++) {
        const ch = row[x] || '.';
        const px = x * cellPx, py = y * cellPx;
        const air = isAir(ch);
        ctx.fillStyle = air ? '#0a0a14' : colorOf(ch);
        ctx.fillRect(px, py, cellPx, cellPx);
        // ghost of the solid cell directly below (so overhangs/holes line up while building upper storeys)
        if (air && belowRows) { const bc = belowRows[y]?.[x]; if (bc && !isAir(bc)) { ctx.fillStyle = colorOf(bc); ctx.globalAlpha = 0.28; const g = cellPx * 0.34; ctx.fillRect(px + g, py + g, cellPx - 2 * g, cellPx - 2 * g); ctx.globalAlpha = 1; } }
        // raised terrain — brighter the taller it is (block-stack height), with the level digit
        const hd = heights?.[y]?.[x]; const lvl = hd && hd !== '0' ? +hd : 0;
        if (lvl > 0) { ctx.fillStyle = `rgba(255,212,0,${0.08 + lvl * 0.07})`; ctx.fillRect(px, py, cellPx, cellPx); }
        // a placed BLOCK sitting on this cell's floor — an inset raised square with a lit top edge
        const bch = blocks?.[y]?.[x];
        if (bch && bch !== ' ') {
          const bc = colorOf('blk:' + bch); const g = cellPx * 0.16; ctx.fillStyle = bc; ctx.fillRect(px + g, py + g, cellPx - 2 * g, cellPx - 2 * g);
          ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.fillRect(px + g, py + g, cellPx - 2 * g, Math.max(1, cellPx * 0.12));
          const bh = blockH?.[y]?.[x]; if (bh && bh !== '1' && bh !== '0' && cellPx > 10) { ctx.fillStyle = '#fff'; ctx.font = `${cellPx * 0.34}px ui-monospace, monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(bh, px + cellPx / 2, py + cellPx / 2 + 1); }
        }
        // grid line
        ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1; ctx.strokeRect(px + 0.5, py + 0.5, cellPx - 1, cellPx - 1);
        // glyph / NPC marker
        if (cellPx > 8) {
          if (npcSet.has(`${x}:${y}`)) { ctx.fillStyle = '#1ED760'; ctx.font = `${cellPx * 0.6}px serif`; ctx.fillText('☻', px + cellPx / 2, py + cellPx / 2 + 1); }
          else if (GLYPH[ch]) { ctx.fillStyle = ch === 'S' ? '#ffd400' : ch === 'E' ? '#1ee0ff' : ch === 'C' ? '#9beaff' : '#fff'; ctx.font = `${cellPx * 0.55}px serif`; ctx.fillText(GLYPH[ch], px + cellPx / 2, py + cellPx / 2 + 1); }
          if (lvl > 0) { ctx.fillStyle = '#ffd400'; ctx.font = `${cellPx * 0.3}px ui-monospace, monospace`; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; ctx.fillText(hd!, px + cellPx - 1, py + cellPx - 1); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; }
        }
      }
    }
    // slice line the cross-section is cutting
    if (sliceOn) {
      ctx.fillStyle = 'rgba(155,234,255,0.14)';
      if (sideAxis === 'front') ctx.fillRect(0, slice * cellPx, W, cellPx);
      else ctx.fillRect(slice * cellPx, 0, cellPx, H);
    }
    // live rectangle preview
    if (rect) {
      const x0 = Math.min(rect.ax, rect.bx), x1 = Math.max(rect.ax, rect.bx), y0 = Math.min(rect.ay, rect.by), y1 = Math.max(rect.ay, rect.by);
      ctx.strokeStyle = 'rgba(30,224,255,0.9)'; ctx.lineWidth = 2;
      ctx.strokeRect(x0 * cellPx + 1, y0 * cellPx + 1, (x1 - x0 + 1) * cellPx - 2, (y1 - y0 + 1) * cellPx - 2);
    }
  }, [rows, heights, blocks, blockH, belowRows, npcs, w, h, cellPx, rect, sliceOn, sideAxis, slice]);

  const cellOf = (e: React.PointerEvent): { x: number; y: number } | null => {
    const cv = ref.current; if (!cv) return null;
    const r = cv.getBoundingClientRect();
    const x = Math.floor((e.clientX - r.left) / cellPx), y = Math.floor((e.clientY - r.top) / cellPx);
    if (x < 0 || x >= w || y < 0 || y >= h) return null;
    return { x, y };
  };
  return (
    <canvas ref={ref} className="block touch-none cursor-crosshair border border-white/10"
      onPointerDown={e => { const c = cellOf(e); if (!c) return; last.current = c; onDown(c.x, c.y); }}
      onPointerMove={e => { const c = cellOf(e); if (!c) return; if (last.current && last.current.x === c.x && last.current.y === c.y) return; last.current = c; onMove(c.x, c.y); }}
      onPointerUp={() => { last.current = null; onUp(); }}
      onPointerCancel={() => { last.current = null; onUp(); }}
    />
  );
};

// Resize a rows[] grid, preserving overlap; new cells are walls on the edge, floor inside.
// Grow/shrink a grid, KEEPING existing cells. New cells are padded with the floor's own base material:
// AIR for an air/overhang floor (so it never sprouts phantom walls + floating slabs up top), plain
// floor '.' for a solid floor (no auto rock border — the out-of-bounds is an implicit wall anyway).
function resizeRows(rows: string[], w: number, h: number, air: boolean): string[] {
  const fill = air ? AIR : '.';
  const out: string[] = [];
  for (let y = 0; y < h; y++) {
    let row = '';
    for (let x = 0; x < w; x++) row += rows[y]?.[x] ?? fill;
    out.push(row);
  }
  return out;
}
// An air/overhang floor is one that already has open sky in it (built via "add floor above").
const isAirFloor = (rows: string[]): boolean => rows.some(r => r.includes(AIR));

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
  l.floors && l.floors.length ? l : { ...l, floors: [{ rows: l.rows, heights: l.heights, blocks: l.blocks, blockH: l.blockH, npcs: l.npcs }] };
// …and collapse a single-storey realm back to the simple grid format on save (so old realms stay tidy).
const collapse = (l: Level3D): Level3D => {
  const fs = l.floors ?? [{ rows: l.rows, heights: l.heights, blocks: l.blocks, blockH: l.blockH, npcs: l.npcs }];
  if (fs.length === 1) { const { floors: _drop, ...rest } = l; void _drop; return { ...rest, rows: fs[0].rows, heights: fs[0].heights, blocks: fs[0].blocks, blockH: fs[0].blockH, npcs: fs[0].npcs }; }
  return { ...l, floors: fs, rows: fs[0].rows, heights: undefined, blocks: undefined, blockH: undefined, npcs: undefined };   // mirror floor0 into the required rows
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
  const [rectMode, setRectMode] = useState(false);   // drag a rectangle and fill it in one stroke
  const [rect, setRect] = useState<{ ax: number; ay: number; bx: number; by: number } | null>(null);   // live rect drag
  const [stackMode, setStackMode] = useState(false); // paint a wall = build a column N blocks tall from the ground
  const [stackN, setStackN] = useState(2);           // how many blocks tall stacked walls are
  const [libRealms, setLibRealms] = useState<Level3D[]>(() => listLevels());   // builtins + local; merged with shared on open
  const [libLoading, setLibLoading] = useState(false);
  const painting = useRef(false);
  const [sideOpen, setSideOpen] = useState(!isMobileStage);   // cross-section / elevation panel
  const [sideAxis, setSideAxis] = useState<'front' | 'side'>('front');
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);   // which cell the slice tracks

  const floors = level.floors ?? [{ rows: level.rows, heights: level.heights, npcs: level.npcs }];
  const fIdx = Math.max(0, Math.min(floorIdx, floors.length - 1));
  const cur = floors[fIdx];                       // the storey currently on the easel
  const npcAt = (x: number, y: number) => (cur.npcs ?? []).find(n => n.x === x && n.y === y);

  const rows = cur.rows;
  const w = rows[0]?.length ?? 0, h = rows.length;
  // The slice the side elevation shows: hovered row (front view) or column (side view), else the middle.
  const slice = sideAxis === 'front' ? Math.min(h - 1, hover?.y ?? Math.floor(h / 2)) : Math.min(w - 1, hover?.x ?? Math.floor(w / 2));
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

  // Build (or erase) an N-block-tall wall COLUMN from the ground up at (x,y): sets the wall char on floors
  // 0..N-1 (auto-adding air floors so the realm is tall enough) and air on floors above. This is the fast
  // way to build walls of a chosen height — pick "3" and paint, get a 3-block wall — no floor juggling.
  const stackWall = (x: number, y: number, ch: string, n: number) => {
    setLevel(l => {
      let fs = [...(l.floors ?? [{ rows: l.rows, heights: l.heights, npcs: l.npcs }])];
      const fw = fs[0].rows[0].length, fh = fs[0].rows.length;
      const erase = ch === AIR;
      while (!erase && fs.length < n) fs.push({ rows: blankAirRows(fw, fh) });
      fs = fs.map((f, i) => {
        const c = erase ? AIR : (i < n ? ch : AIR);
        const rws = [...f.rows]; rws[y] = rws[y].substring(0, x) + c + rws[y].substring(x + 1);
        const npcs = (f.npcs ?? []).filter(nn => !(nn.x === x && nn.y === y));
        return { ...f, rows: rws, npcs: npcs.length ? npcs : undefined };
      });
      return { ...l, floors: fs, rows: fs[0].rows };
    });
    setSaved(false);
  };

  const paint = useCallback((x: number, y: number) => {
    if (brush === 'NPC') { setNpcCell({ x, y }); return; }   // open the character builder for this tile
    if (stackMode && (isWallCh(brush) || brush === AIR)) { stackWall(x, y, brush, stackN); return; }   // build a wall column
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
    if (isBlockBrush(brush)) {   // place/remove a BLOCK on top of this cell's floor (parallel grid)
      const mat = brush.slice(4);
      setActiveFloor(f => ({ ...f, blocks: setBlockCell(f.blocks, f.rows, x, y, mat === '.' ? ' ' : mat) }));
      return;
    }
    if (brush === 'BH+' || brush === 'BH-') {   // stack the block on this cell taller / shorter
      setActiveFloor(f => { if (!f.blocks || f.blocks[y]?.[x] === ' ' || !f.blocks[y]?.[x]?.trim()) return f; return { ...f, blockH: bumpBlockH(f.rows, f.blocks, f.blockH, x, y, brush === 'BH+' ? 1 : -1) }; });
      return;
    }
    setActiveFloor(f => {
      // painting a cell also clears any NPC sitting on it
      const npcs = (f.npcs ?? []).filter(n => !(n.x === x && n.y === y));
      return { ...f, rows: setCell(f.rows, x, y, brush), npcs: npcs.length ? npcs : undefined };
    });
  }, [brush, fIdx, stackMode, stackN]);   // eslint-disable-line react-hooks/exhaustive-deps

  // Rectangle stroke — paint/erase a whole box of cells (or bump a box of heights) in one go, so
  // building floors, walls and big air openings is fast. Uses whatever brush is selected.
  const paintRect = (ax: number, ay: number, bx: number, by: number) => {
    if (brush === 'NPC') return;
    if (brush === 'S') { paint(bx, by); return; }   // spawn is unique — just drop it at the end cell
    const x0 = Math.min(ax, bx), x1 = Math.max(ax, bx), y0 = Math.min(ay, by), y1 = Math.max(ay, by);
    if (stackMode && (isWallCh(brush) || brush === AIR)) {   // drag a whole run of N-tall wall in one stroke
      setLevel(l => {
        let fs = [...(l.floors ?? [{ rows: l.rows, heights: l.heights, npcs: l.npcs }])];
        const fw = fs[0].rows[0].length, fh = fs[0].rows.length, erase = brush === AIR;
        while (!erase && fs.length < stackN) fs.push({ rows: blankAirRows(fw, fh) });
        fs = fs.map((f, i) => {
          const c = erase ? AIR : (i < stackN ? brush : AIR);
          const rws = [...f.rows];
          for (let y = y0; y <= y1; y++) { let r = rws[y]; for (let x = x0; x <= x1; x++) r = r.substring(0, x) + c + r.substring(x + 1); rws[y] = r; }
          return { ...f, rows: rws };
        });
        return { ...l, floors: fs, rows: fs[0].rows };
      });
      setSaved(false);
      return;
    }
    if (brush === 'H+' || brush === 'H-') {
      setActiveFloor(f => {
        const hh = normHeights(f.rows, f.heights);
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
          if (/[#1-9]/.test(f.rows[y]?.[x] ?? '#')) continue;
          const next = Math.max(0, Math.min(9, hh[y].charCodeAt(x) - 48 + (brush === 'H+' ? 1 : -1)));
          hh[y] = hh[y].substring(0, x) + String(next) + hh[y].substring(x + 1);
        }
        return { ...f, heights: hh };
      });
      return;
    }
    if (isBlockBrush(brush)) {   // fill a box of blocks
      const mat = brush.slice(4) === '.' ? ' ' : brush.slice(4);
      setActiveFloor(f => {
        let blk = f.blocks;
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) blk = setBlockCell(blk, f.rows, x, y, mat);
        return { ...f, blocks: blk };
      });
      return;
    }
    if (brush === 'BH+' || brush === 'BH-') {   // stack a box of blocks taller/shorter
      setActiveFloor(f => {
        if (!f.blocks) return f; let bh = f.blockH;
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const b = f.blocks[y]?.[x]; if (b && b !== ' ') bh = bumpBlockH(f.rows, f.blocks, bh, x, y, brush === 'BH+' ? 1 : -1); }
        return { ...f, blockH: bh };
      });
      return;
    }
    setActiveFloor(f => {
      const rws = [...f.rows];
      for (let y = y0; y <= y1; y++) { let r = rws[y]; for (let x = x0; x <= x1; x++) r = r.substring(0, x) + brush + r.substring(x + 1); rws[y] = r; }
      const npcs = (f.npcs ?? []).filter(n => !(n.x >= x0 && n.x <= x1 && n.y >= y0 && n.y <= y1));
      return { ...f, rows: rws, npcs: npcs.length ? npcs : undefined };
    });
  };

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
    const cw = Math.max(4, Math.min(128, nw)), ch = Math.max(4, Math.min(128, nh));
    setLevel(l => {
      const fs = (l.floors ?? [{ rows: l.rows, heights: l.heights, npcs: l.npcs }]).map(f => {
        const rws = resizeRows(f.rows, cw, ch, isAirFloor(f.rows));
        return { ...f, rows: rws, heights: f.heights ? normHeights(rws, f.heights) : undefined, blocks: f.blocks ? resizeRows(f.blocks, cw, ch, true) : undefined, blockH: f.blockH ? resizeRows(f.blockH, cw, ch, true) : undefined };
      });
      return { ...l, floors: fs, rows: fs[0].rows };
    });
    setSaved(false);
  };

  // ── Storeys: add one above, dig a basement below, or remove the current one ──────────────────
  const addFloor = (where: 'above' | 'below') => {
    setLevel(l => {
      const fs = [...(l.floors ?? [{ rows: l.rows, heights: l.heights, npcs: l.npcs }])];
      const fw = fs[0].rows[0].length, fh = fs[0].rows.length;
      // A floor ADDED ABOVE starts as open AIR — you carve platforms/walls into the sky so it doesn't
      // become a solid lid over the level. A BASEMENT starts as a real enclosed room to walk into.
      const nf: Floor3D = { rows: where === 'above' ? blankAirRows(fw, fh) : blankFloorRows(fw, fh) };
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
    setSaved(true);
    void saveRealmRemote(toSave);   // shared store (also writes the local cache) → portal works for everyone
  };

  // Open the library and merge in realms shared by other players (builtins + local first, then shared).
  const openLibrary = async () => {
    setLibrary(true); setLibLoading(true);
    const remote = await fetchRealmsRemote().catch(() => [] as Level3D[]);
    const byId = new Map<string, Level3D>();
    for (const l of listLevels()) byId.set(l.id, l);
    for (const l of remote) if (!isBuiltin(l.id)) byId.set(l.id, l);
    setLibRealms([...byId.values()]);
    setLibLoading(false);
  };

  const startNew = () => { setLevel(toFloors(blankLevel())); setFloorIdx(0); setSaved(false); setLibrary(false); };
  const load = (id: string) => { const l = libRealms.find(x => x.id === id) ?? getLevel(id); if (l) { setLevel(toFloors(l)); setFloorIdx(0); setSaved(true); setLibrary(false); } };
  const remove = (id: string) => { void deleteRealmRemote(id); setLibRealms(rs => rs.filter(r => r.id !== id)); if (id === level.id) startNew(); };

  const allRows = floors.flatMap(f => f.rows);
  const hasSpawn = allRows.some(r => r.includes('S'));   // spawn can live on any storey
  const hasExit = allRows.some(r => r.includes('E'));

  // Done → save the realm to the SHARED store (so a portal can reference it from any account) and hand
  // its id back to the room. Awaits the upsert so the realm exists server-side before a portal arms it.
  const finish = async () => {
    const out = collapse(level);
    if (hasSpawn && !builtin) { await saveRealmRemote(out); onExit?.(out.id); }
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

  // Cell size scales down for bigger grids so the whole map fits the panel (the canvas painter handles
  // large grids fine; below ~8px glyphs are dropped). The canvas itself scrolls inside its panel.
  const cellPx = Math.max(8, Math.min(30, Math.floor(760 / Math.max(w, h))));

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
        <button onClick={() => (library ? setLibrary(false) : openLibrary())} className="text-[11px] font-mono uppercase tracking-wider border border-white/20 px-3 py-1.5 hover:border-white/50">Library</button>
        <button onClick={startNew} className="text-[11px] font-mono uppercase tracking-wider border border-white/20 px-3 py-1.5 hover:border-white/50">New</button>
        <button onClick={finish} className="text-[11px] font-mono uppercase tracking-wider text-brandYellow border border-brandYellow px-3 py-1.5 hover:bg-brandYellow hover:text-black">Done → portal</button>
      </div>

      <div className="flex-1 flex min-h-0">
        {/* Tools */}
        <div className="w-44 shrink-0 border-r border-white/10 p-3 flex flex-col gap-2 overflow-y-auto">
          <p className="text-[9px] uppercase tracking-widest text-white/40">Brush</p>
          {BRUSH_GROUPS.map(grp => (
            <div key={grp}>
              <p className="text-[8px] uppercase tracking-widest text-white/30 mb-0.5">{grp}{grp === 'Blocks' ? ' · on floor' : ''}</p>
              <div className="grid grid-cols-2 gap-1.5">
                {BRUSHES.filter(b => b.grp === grp).map(b => (
                  <button key={b.ch} onClick={() => setBrush(b.ch)}
                    className={`flex items-center gap-1.5 px-2 py-1.5 border text-[10px] font-mono transition-colors ${brush === b.ch ? 'border-[#1ee0ff] bg-[#1ee0ff]/10' : 'border-white/15 hover:border-white/40'}`}>
                    <span className="w-3 h-3 border border-white/30" style={{ background: b.color }} />
                    {b.label}
                  </button>
                ))}
              </div>
            </div>
          ))}

          <button onClick={() => setBrush('NPC')}
            className={`mt-1 px-2 py-1.5 border text-[10px] font-mono transition-colors ${brush === 'NPC' ? 'border-[#1ED760] bg-[#1ED760]/10 text-[#1ED760]' : 'border-white/15 hover:border-white/40'}`}>
            ☻ NPC dropper <span className="text-white/30 normal-case">(character builder)</span>
          </button>

          <button onClick={() => setRectMode(v => !v)}
            className={`px-2 py-1.5 border text-[10px] font-mono transition-colors ${rectMode ? 'border-[#1ee0ff] bg-[#1ee0ff]/10 text-[#1ee0ff]' : 'border-white/15 hover:border-white/40'}`}>
            ▭ Rectangle fill <span className="text-white/30 normal-case">{rectMode ? '(drag a box)' : '(off)'}</span>
          </button>

          <button onClick={() => setStackMode(v => !v)}
            className={`px-2 py-1.5 border text-[10px] font-mono transition-colors ${stackMode ? 'border-[#ff8a3d] bg-[#ff8a3d]/10 text-[#ff8a3d]' : 'border-white/15 hover:border-white/40'}`}>
            🧱 Stack walls <span className="text-white/30 normal-case">{stackMode ? `(${stackN} tall)` : '(off)'}</span>
          </button>
          {stackMode && (
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5, 6].map(n => (
                <button key={n} onClick={() => setStackN(n)}
                  className={`flex-1 py-1 border text-[10px] font-mono transition-colors ${n === stackN ? 'border-[#ff8a3d] bg-[#ff8a3d]/10 text-[#ff8a3d]' : 'border-white/15 text-white/50 hover:border-white/40'}`}>{n}</button>
              ))}
            </div>
          )}
          {stackMode && <p className="text-[9px] text-white/30 font-mono leading-tight">paint a wall brush → builds it {stackN} blocks tall from the ground. Air erases the whole column.</p>}

          <p className="text-[9px] uppercase tracking-widest text-white/40 mt-2">Height <span className="text-white/25 normal-case tracking-normal">(steps · climb 1)</span></p>
          <div className="grid grid-cols-2 gap-1.5">
            {([['H+', '▲ Raise'], ['H-', '▼ Lower']] as [string, string][]).map(([ch, label]) => (
              <button key={ch} onClick={() => setBrush(ch)}
                className={`px-2 py-1.5 border text-[10px] font-mono transition-colors ${brush === ch ? 'border-[#ffd400] bg-[#ffd400]/10 text-[#ffd400]' : 'border-white/15 hover:border-white/40'}`}>
                {label}
              </button>
            ))}
          </div>

          <p className="text-[9px] uppercase tracking-widest text-white/40 mt-2">Stack blocks <span className="text-white/25 normal-case tracking-normal">(taller walls)</span></p>
          <div className="grid grid-cols-2 gap-1.5">
            {([['BH+', '⤒ Stack +'], ['BH-', '⤓ Stack −']] as [string, string][]).map(([ch, label]) => (
              <button key={ch} onClick={() => setBrush(ch)}
                className={`px-2 py-1.5 border text-[10px] font-mono transition-colors ${brush === ch ? 'border-[#c8963c] bg-[#c8963c]/10 text-[#c8963c]' : 'border-white/15 hover:border-white/40'}`}>
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

          <p className="text-[9px] uppercase tracking-widest text-white/40 mt-2">Exit door faces</p>
          <div className="flex flex-wrap gap-1">
            {([['Auto', undefined], ['East ▶', 0], ['South ▼', 90], ['West ◀', 180], ['North ▲', 270]] as const).map(([lbl, deg]) => (
              <button key={lbl} onClick={() => { setLevel(l => ({ ...l, exitDir: deg })); setSaved(false); }}
                className={`text-[9px] font-mono px-2 py-1 border transition-colors ${(level.exitDir ?? 'auto') === (deg ?? 'auto') ? 'border-[#1ee0ff] bg-[#1ee0ff]/10 text-[#1ee0ff]' : 'border-white/15 text-white/60 hover:border-white/40'}`}>
                {lbl}
              </button>
            ))}
          </div>

          <p className="text-[9px] uppercase tracking-widest text-white/40 mt-2">Size <span className="text-white/25 normal-case tracking-normal">(up to 128)</span></p>
          {([['w', w] as const, ['h', h] as const]).map(([dim, val]) => (
            <div key={dim} className="flex items-center gap-1.5 text-[11px] font-mono">
              <button onClick={() => (dim === 'w' ? doResize(w - 1, h) : doResize(w, h - 1))} className="w-7 h-7 border border-white/20 hover:border-white/50">–</button>
              <input type="number" min={4} max={128} value={val}
                onChange={e => { const n = parseInt(e.target.value, 10); if (!isNaN(n)) dim === 'w' ? doResize(n, h) : doResize(w, n); }}
                className="w-12 h-7 bg-white/5 border border-white/15 text-center outline-none focus:border-[#1ee0ff]" />
              <span className="text-white/40">{dim}</span>
              <button onClick={() => (dim === 'w' ? doResize(w + 1, h) : doResize(w, h + 1))} className="w-7 h-7 border border-white/20 hover:border-white/50">+</button>
            </div>
          ))}

          <p className="text-[9px] uppercase tracking-widest text-white/40 mt-2">Storeys <span className="text-white/25 normal-case tracking-normal">(2+ = walk under · jump up · air = see through)</span></p>
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
          {floors.length > 1 && (
            <>
              <p className="text-[9px] uppercase tracking-widest text-white/40 mt-2">Room height <span className="text-white/25 normal-case tracking-normal">(how tall each storey / cave stands)</span></p>
              <div className="flex items-center gap-1">
                {([['Tight', 2], ['Roomy', 3], ['Cavern', 4]] as const).map(([lbl, n]) => (
                  <button key={n} onClick={() => { setLevel(l => ({ ...l, storeyBlocks: n })); setSaved(false); }}
                    className={`flex-1 text-[9px] font-mono px-2 py-1 border transition-colors ${(level.storeyBlocks ?? 2) === n ? 'border-[#1ee0ff] bg-[#1ee0ff]/10 text-[#1ee0ff]' : 'border-white/15 text-white/60 hover:border-white/40'}`}>
                    {lbl} <span className="text-white/30">{n}▚</span>
                  </button>
                ))}
              </div>
            </>
          )}

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

        {/* Canvas column: top-down paint grid + side elevation */}
        <div className="flex-1 flex flex-col min-h-0">
        <div className="flex-1 overflow-auto p-4 flex items-start justify-center"
          onPointerUp={() => { if (rectMode && rect) { paintRect(rect.ax, rect.ay, rect.bx, rect.by); setRect(null); } painting.current = false; }}
          onPointerLeave={() => { if (rectMode && rect) { paintRect(rect.ax, rect.ay, rect.bx, rect.by); setRect(null); } painting.current = false; }}>
          <GridCanvas
            rows={rows} heights={cur.heights} blocks={cur.blocks} blockH={cur.blockH} belowRows={fIdx > 0 ? floors[fIdx - 1]?.rows : undefined} npcs={cur.npcs}
            w={w} h={h} cellPx={cellPx} rect={rect} sliceOn={sideOpen} sideAxis={sideAxis} slice={slice}
            onDown={(x, y) => { if (rectMode) { setRect({ ax: x, ay: y, bx: x, by: y }); } else { painting.current = true; paint(x, y); } }}
            onMove={(x, y) => { setHover({ x, y }); if (rectMode) { setRect(r => r ? { ...r, bx: x, by: y } : r); } else if (painting.current) paint(x, y); }}
            onUp={() => { painting.current = false; }}
          />
        </div>

        {/* Side elevation — a vertical cross-section so you can see the stack while you build */}
        {sideOpen ? (
          <div className="shrink-0 border-t border-white/10 bg-[#070710]">
            <div className="flex items-center gap-2 px-3 py-1.5">
              <span className="font-mono text-[9px] uppercase tracking-widest text-white/40">◧ Cross-section</span>
              <div className="flex gap-1">
                {(['front', 'side'] as const).map(a => (
                  <button key={a} onClick={() => setSideAxis(a)}
                    className={`text-[9px] font-mono px-2 py-0.5 border transition-colors ${sideAxis === a ? 'border-[#1ee0ff] bg-[#1ee0ff]/10 text-[#1ee0ff]' : 'border-white/15 text-white/55 hover:border-white/40'}`}>
                    {a === 'front' ? 'Front (W↔E)' : 'Side (N↔S)'}
                  </button>
                ))}
              </div>
              <span className="text-[9px] font-mono text-white/30">{sideAxis === 'front' ? `row ${slice}` : `col ${slice}`} · hover grid to slice · click a storey to edit it</span>
              <div className="flex-1" />
              <button onClick={() => setSideOpen(false)} className="text-[9px] font-mono text-white/40 border border-white/15 px-2 py-0.5 hover:border-white/40">hide</button>
            </div>
            <div className="h-44 px-2 pb-2">
              <SideElevation floors={floors} axis={sideAxis} slice={slice} editIdx={fIdx} w={w} h={h} onPick={setFloorIdx} />
            </div>
          </div>
        ) : (
          <button onClick={() => setSideOpen(true)}
            className="shrink-0 border-t border-white/10 bg-[#070710] py-1.5 text-[9px] font-mono uppercase tracking-widest text-white/40 hover:text-[#1ee0ff]">
            ◧ Show cross-section
          </button>
        )}
        </div>
      </div>

      {/* Character builder (same one the rooms use) — drops the character at the chosen tile */}
      <NpcEditor open={!!npcCell} initial={npcCell ? (npcAt(npcCell.x, npcCell.y) ? { n: npcAt(npcCell.x, npcCell.y)!.n ?? '', a: npcAt(npcCell.x, npcCell.y)!.a, l: npcAt(npcCell.x, npcCell.y)!.lines ?? [], sz: npcAt(npcCell.x, npcCell.y)!.sz } : null) : null}
        onPlace={placeNpc} onClose={() => setNpcCell(null)} />

      {/* Library drawer */}
      {library && (
        <div className="absolute inset-0 z-40 bg-black/85 flex items-center justify-center p-6" onClick={() => setLibrary(false)}>
          <div className="w-full max-w-md border border-[#1ee0ff]/40 bg-black p-5 space-y-3 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <p className="font-mono text-[10px] uppercase tracking-[0.35em] text-[#1ee0ff]">Realm library {libLoading && <span className="text-white/30 normal-case tracking-normal">· syncing…</span>}</p>
            {libRealms.map(l => (
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
