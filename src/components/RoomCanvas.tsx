'use client';

// OUROO PRAÇA — isometric social room with a big furni catalogue + Habbo-style heights:
// furni has height, you walk ON walkable pieces, and you can only step up/down ONE level at a
// time (so a height-2 thing blocks you — build stairs out of 1-high pieces to go up). Live via
// Supabase presence/broadcast; furni persists in room_items. Some rooms are locked (curated).

import React, { useEffect, useRef, useState } from 'react';
import { supabase, supabaseReady } from '@/lib/supabase';
import { getLocalPlayer } from '@/lib/leaderboard';
import { getAuthIdentity } from '@/lib/auth';
import { amIModerator } from '@/lib/chat';
import { drawSkinShape, skinById, getSelectedSkinId } from '@/lib/skins';
import { validateMessage } from '@/lib/names';
import { CATS, FURNI, defOf, isFurniPremium, furniPrice } from '@/lib/furni';
import { type IconSpec, drawIconSpec, iconPrimaryColor } from '@/lib/icons';
import { resolveAppearance } from '@/lib/catalog';
import { ownsFurni, buyFurni, refreshWalletFromCloud, useWallet, CURRENCY_SYMBOL } from '@/lib/wallet';
import { InventoryModal } from '@/components/InventoryModal';

const STAGE_W = 1280, STAGE_H = 720;
const GRID = 11;
const TILE_W = 64, TILE_H = 32, TW = TILE_W / 2, TH = TILE_H / 2;
const STACK_H = 26;
const ORIGIN_X = STAGE_W / 2, ORIGIN_Y = 236;
const WALL_H = 3;
const WALK = 0.09;          // tiles per 60Hz step
const BUBBLE_FRAMES = 60 * 6;
const MAX_ITEMS = 200, PLACE_CAP = 20;

type RoomDef = { slug: string; name: string; accent: string; floor: string; locked?: boolean };
const ROOMS: RoomDef[] = [
  { slug: 'praca',   name: 'Praça',     accent: '#00cfff', floor: '#161628' },
  { slug: 'disco',   name: 'Discoteca', accent: '#ff44aa', floor: '#1e1226' },
  { slug: 'lounge',  name: 'Lounge',    accent: '#ffd23a', floor: '#1e1a12' },
  { slug: 'telhado', name: 'Telhado',   accent: '#1ED760', floor: '#121e18' },
  { slug: 'cave',    name: 'Cave',      accent: '#cc44ff', floor: '#181226' },
  { slug: 'atrio',   name: 'Átrio',     accent: '#ffffff', floor: '#191921', locked: true },
];
const roomOf = (slug: string) => ROOMS.find(r => r.slug === slug) ?? ROOMS[0];

// Furni catalogue + economy helpers now live in @/lib/furni (shared with the inventory).
type Item = { id: string; kind: string; gx: number; gy: number; createdBy?: string };
type Avatar = { handle: string; skinId: string; icon?: IconSpec | null; fx: number; fy: number; tx: number; ty: number; z: number; bubble: string; bubbleLife: number; af: number };
type Self = Avatar & { id: string; path: { gx: number; gy: number }[] };

const hexA = (hex: string, a: number) => { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };
const shade = (hex: string, f: number) => { const n = parseInt(hex.slice(1), 16); const r = Math.min(255, Math.round(((n >> 16) & 255) * f)), g = Math.min(255, Math.round(((n >> 8) & 255) * f)), b = Math.min(255, Math.round((n & 255) * f)); return `rgb(${r},${g},${b})`; };
const iso = (gx: number, gy: number, gz = 0) => ({ sx: ORIGIN_X + (gx - gy) * TW, sy: ORIGIN_Y + (gx + gy) * TH - gz * STACK_H });
const screenToTile = (sx: number, sy: number) => { const a = (sx - ORIGIN_X) / TW, b = (sy - ORIGIN_Y) / TH; return { gx: (a + b) / 2, gy: (b - a) / 2 }; };
const clampTile = (v: number) => Math.max(0, Math.min(GRID - 1, Math.round(v)));
const key = (gx: number, gy: number) => gy * GRID + gx;
// Validate an icon spec received over presence (others may broadcast a custom-icon avatar).
const parseIcon = (v: unknown): IconSpec | null => {
  if (!v || typeof v !== 'object') return null;
  const o = v as { layers?: unknown };
  return Array.isArray(o.layers) && o.layers.length ? (v as IconSpec) : null;
};

export const RoomCanvas: React.FC<{ stageScale?: number; isMobileStage?: boolean; onExit?: () => void }> = ({
  stageScale = 1, isMobileStage = false, onExit,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef(0);
  const channelRef = useRef<ReturnType<NonNullable<typeof supabase>['channel']> | null>(null);
  const selfRef = useRef<Self>({ id: '', handle: 'Convidado', skinId: getSelectedSkinId(), fx: 5, fy: 5, tx: 5, ty: 5, z: 0, bubble: '', bubbleLife: 0, af: 0, path: [] });
  const remotesRef = useRef<Map<string, Avatar>>(new Map());
  const itemsRef = useRef<Item[]>([]);
  const heightRef = useRef<Float32Array>(new Float32Array(GRID * GRID));   // walkable height per tile
  const solidRef = useRef<Uint8Array>(new Uint8Array(GRID * GRID));        // 1 = blocked
  const hoverRef = useRef<{ gx: number; gy: number } | null>(null);
  const framesRef = useRef(0);
  const posAccum = useRef(0);
  const wasMovingRef = useRef(false);
  const modRef = useRef(false);

  const [msg, setMsg] = useState('');
  const [population, setPopulation] = useState(1);
  const [connected, setConnected] = useState(false);
  const [feed, setFeed] = useState<{ id: number; handle: string; text: string }[]>([]);
  const feedId = useRef(0);
  const [room, setRoom] = useState('praca');
  const [showRooms, setShowRooms] = useState(false);
  const themeRef = useRef<RoomDef>(roomOf('praca'));
  useEffect(() => { themeRef.current = roomOf(room); }, [room]);
  const [placingKind, setPlacingKind] = useState<string | null>(null);
  const [removeMode, setRemoveMode] = useState(false);
  const [decorOpen, setDecorOpen] = useState(false);
  const [cat, setCat] = useState('tier1');
  const uiRef = useRef({ decorOpen: false, placingKind: null as string | null, removeMode: false });
  useEffect(() => { uiRef.current = { decorOpen, placingKind, removeMode }; }, [decorOpen, placingKind, removeMode]);
  const [isMod, setIsMod] = useState(false);
  const [myCount, setMyCount] = useState(0);
  const [hint, setHint] = useState('');
  const flashHint = (t: string) => { setHint(t); setTimeout(() => setHint(''), 1900); };
  const locked = roomOf(room).locked && !isMod;
  const [invOpen, setInvOpen] = useState(false);
  const wallet = useWallet();

  // Equip a skin or custom icon on the live avatar and broadcast it to the room.
  const equipAppearance = (id: string) => {
    const me = selfRef.current; me.skinId = id;
    const ap = resolveAppearance(id); me.icon = ap.kind === 'icon' ? ap.spec : null;
    channelRef.current?.track({ id: me.id, handle: me.handle, skinId: me.skinId, icon: me.icon ?? undefined, fx: +me.fx.toFixed(2), fy: +me.fy.toFixed(2) });
  };

  const pushFeed = (handle: string, text: string) => { const id = ++feedId.current; setFeed(f => [...f.slice(-5), { id, handle, text }]); setTimeout(() => setFeed(f => f.filter(m => m.id !== id)), 9000); };
  const say = (raw: string) => {
    const v = validateMessage(raw); if (!v.ok) { flashHint(v.error); return; }
    const text = v.value.slice(0, 120); const me = selfRef.current; me.bubble = text; me.bubbleLife = BUBBLE_FRAMES;
    channelRef.current?.send({ type: 'broadcast', event: 'say', payload: { id: me.id, text } });
    pushFeed(me.handle, text); setMsg('');
  };
  const switchRoom = (slug: string) => {
    setShowRooms(false); if (slug === room) return;
    const me = selfRef.current; me.fx = 5; me.fy = 5; me.tx = 5; me.ty = 5; me.z = 0; me.path = []; me.bubble = ''; me.bubbleLife = 0;
    remotesRef.current.clear(); itemsRef.current = []; setMyCount(0); setPlacingKind(null); setRemoveMode(false); setDecorOpen(false);
    setRoom(slug);
  };

  // recompute the heightmap (walkable height + solid mask) from items
  const rebuildHeight = () => {
    const H = heightRef.current, S = solidRef.current; H.fill(0); S.fill(0);
    for (const it of itemsRef.current) {
      const d = defOf(it.kind); const [sw, sh] = d.span ?? [1, 1];
      for (let du = 0; du < sw; du++) for (let dv = 0; dv < sh; dv++) {
        const gx = it.gx + du, gy = it.gy + dv; if (gx >= GRID || gy >= GRID) continue;
        const k = key(gx, gy); if (d.walk) H[k] += d.h; else S[k] = 1;
      }
    }
  };
  // BFS over tiles; step allowed if not solid and |Δheight| ≤ 1 (the climb rule).
  const findPath = (sx: number, sy: number, tx: number, ty: number) => {
    const H = heightRef.current, S = solidRef.current;
    if (S[key(tx, ty)] || (sx === tx && sy === ty)) return [];
    const prev = new Int16Array(GRID * GRID).fill(-1); const seen = new Uint8Array(GRID * GRID);
    const q = [key(sx, sy)]; seen[key(sx, sy)] = 1;
    const N = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    while (q.length) {
      const cur = q.shift()!; const cx = cur % GRID, cy = (cur / GRID) | 0;
      if (cx === tx && cy === ty) { const path: { gx: number; gy: number }[] = []; let c = cur; while (c !== key(sx, sy)) { path.unshift({ gx: c % GRID, gy: (c / GRID) | 0 }); c = prev[c]; } return path; }
      for (const [dx, dy] of N) {
        const nx = cx + dx, ny = cy + dy; if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID) continue;
        const nk = key(nx, ny); if (seen[nk] || S[nk]) continue;
        if (Math.abs(H[nk] - H[cur]) > 1) continue;                         // can't step up/down >1
        if (dx && dy && (S[key(cx + dx, cy)] && S[key(cx, cy + dy)])) continue; // no diagonal through a corner
        seen[nk] = 1; prev[nk] = cur; q.push(nk);
      }
    }
    return null;
  };

  // ---- furniture ----
  const placeItem = (kind: string, gx: number, gy: number) => {
    if (roomOf(room).locked && !modRef.current) { flashHint('Sala bloqueada'); return; }
    if (!modRef.current && isFurniPremium(kind) && !ownsFurni(kind)) { flashHint('Compra primeiro ✦'); return; }
    if (itemsRef.current.length >= MAX_ITEMS) { flashHint('Sala cheia'); return; }
    const mine = itemsRef.current.filter(i => i.createdBy === selfRef.current.id).length;
    if (!modRef.current && mine >= PLACE_CAP) { flashHint(`Máximo ${PLACE_CAP} por pessoa`); return; }
    const [sw, sh] = defOf(kind).span ?? [1, 1];
    if (gx + sw > GRID || gy + sh > GRID) { flashHint('Não cabe aqui'); return; }
    const id = (crypto?.randomUUID?.() ?? `it_${Date.now()}_${Math.floor(Math.random() * 1e9)}`);
    const item: Item = { id, kind, gx, gy, createdBy: selfRef.current.id };
    itemsRef.current.push(item); setMyCount(c => c + 1); rebuildHeight();
    channelRef.current?.send({ type: 'broadcast', event: 'place', payload: { id, kind, gx, gy, by: item.createdBy } });
    supabase?.from('room_items').insert({ id, room, kind, x: gx, y: gy, created_by: item.createdBy }).then(undefined, () => {});
  };
  const removeAt = (gx: number, gy: number) => {
    const hit = [...itemsRef.current].reverse().find(i => { const [sw, sh] = defOf(i.kind).span ?? [1, 1]; return gx >= i.gx && gx < i.gx + sw && gy >= i.gy && gy < i.gy + sh && (modRef.current || i.createdBy === selfRef.current.id); });
    if (!hit) return;
    itemsRef.current = itemsRef.current.filter(i => i.id !== hit.id);
    if (hit.createdBy === selfRef.current.id) setMyCount(c => Math.max(0, c - 1)); rebuildHeight();
    channelRef.current?.send({ type: 'broadcast', event: 'unplace', payload: { id: hit.id } });
    supabase?.from('room_items').delete().eq('id', hit.id).then(undefined, () => {});
  };

  // ---- identity + realtime ----
  useEffect(() => {
    const lp = getLocalPlayer();
    selfRef.current.id = lp.device || `guest_${Math.floor(Math.random() * 1e9)}`;
    selfRef.current.handle = lp.handle || 'Convidado';
    const ap0 = getSelectedSkinId(); selfRef.current.skinId = ap0;
    const r0 = resolveAppearance(ap0); selfRef.current.icon = r0.kind === 'icon' ? r0.spec : null;
    refreshWalletFromCloud();
    getAuthIdentity().then(a => { if (a?.handle) selfRef.current.handle = a.handle; });
    amIModerator().then(m => { modRef.current = m; setIsMod(m); });

    if (!supabase) return;
    const me = selfRef.current;
    remotesRef.current.clear(); itemsRef.current = []; rebuildHeight(); setPopulation(1); setConnected(false);
    const ch = supabase.channel(`room:${room}`, { config: { presence: { key: me.id }, broadcast: { self: false } } });
    channelRef.current = ch;

    const rebuild = () => {
      const state = ch.presenceState() as Record<string, Array<Record<string, unknown>>>;
      const seen = new Set<string>([me.id]);
      for (const k in state) {
        const meta = state[k]?.[0]; if (!meta) continue; const id = String(meta.id ?? k); if (id === me.id) continue;
        seen.add(id); const fx = Number(meta.fx), fy = Number(meta.fy); let r = remotesRef.current.get(id);
        if (!r) remotesRef.current.set(id, { handle: String(meta.handle ?? '???'), skinId: String(meta.skinId ?? 'diamond-gold'), icon: parseIcon(meta.icon), fx, fy, tx: fx, ty: fy, z: 0, bubble: '', bubbleLife: 0, af: Math.random() * 100 });
        else { r.handle = String(meta.handle ?? r.handle); r.skinId = String(meta.skinId ?? r.skinId); r.icon = parseIcon(meta.icon); }
      }
      for (const id of [...remotesRef.current.keys()]) if (!seen.has(id)) remotesRef.current.delete(id);
      setPopulation(remotesRef.current.size + 1);
    };

    ch.on('presence', { event: 'sync' }, rebuild)
      .on('broadcast', { event: 'pos' }, ({ payload }) => {
        const pl = payload as Record<string, unknown>; const id = String(pl?.id ?? ''); if (!id || id === me.id) return;
        const fx = Number(pl.fx), fy = Number(pl.fy); if (!Number.isFinite(fx) || !Number.isFinite(fy)) return;
        let r = remotesRef.current.get(id);
        if (!r) { r = { handle: '…', skinId: 'diamond-gold', fx, fy, tx: fx, ty: fy, z: 0, bubble: '', bubbleLife: 0, af: Math.random() * 100 }; remotesRef.current.set(id, r); setPopulation(remotesRef.current.size + 1); }
        else { r.tx = fx; r.ty = fy; }
      })
      .on('broadcast', { event: 'say' }, ({ payload }) => {
        const pl = payload as Record<string, unknown>; const id = String(pl?.id ?? ''); const text = String(pl?.text ?? '');
        if (!id || id === me.id || !text) return; const r = remotesRef.current.get(id); if (r) { r.bubble = text; r.bubbleLife = BUBBLE_FRAMES; } pushFeed(r?.handle ?? '???', text);
      })
      .on('broadcast', { event: 'place' }, ({ payload }) => {
        const pl = payload as Record<string, unknown>; const id = String(pl?.id ?? ''); if (!id || itemsRef.current.some(i => i.id === id)) return;
        itemsRef.current.push({ id, kind: String(pl.kind), gx: Number(pl.gx), gy: Number(pl.gy), createdBy: String(pl.by ?? '') }); rebuildHeight();
      })
      .on('broadcast', { event: 'unplace' }, ({ payload }) => { const id = String((payload as Record<string, unknown>)?.id ?? ''); itemsRef.current = itemsRef.current.filter(i => i.id !== id); rebuildHeight(); })
      .subscribe(async status => {
        if (status === 'SUBSCRIBED') {
          setConnected(true);
          await ch.track({ id: me.id, handle: me.handle, skinId: me.skinId, icon: me.icon ?? undefined, fx: me.fx, fy: me.fy });
          const { data } = await supabase!.from('room_items').select('id,kind,x,y,created_by').eq('room', room).order('created_at');
          if (data) { itemsRef.current = data.map(d => ({ id: String(d.id), kind: String(d.kind), gx: Number(d.x), gy: Number(d.y), createdBy: String(d.created_by ?? '') })); setMyCount(itemsRef.current.filter(i => i.createdBy === me.id).length); rebuildHeight(); }
        }
      });

    const onResume = () => { if (document.visibilityState === 'visible' && channelRef.current) { const m = selfRef.current; channelRef.current.track({ id: m.id, handle: m.handle, skinId: m.skinId, icon: m.icon ?? undefined, fx: m.fx, fy: m.fy }); } };
    document.addEventListener('visibilitychange', onResume); window.addEventListener('focus', onResume); window.addEventListener('online', onResume);
    return () => { setConnected(false); document.removeEventListener('visibilitychange', onResume); window.removeEventListener('focus', onResume); window.removeEventListener('online', onResume); supabase?.removeChannel(ch); channelRef.current = null; };
  }, [room]);

  // ---- main loop ----
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false }) as CanvasRenderingContext2D; if (!ctx) return;
    canvas.width = STAGE_W; canvas.height = STAGE_H;
    const H = heightRef.current;
    const tileZ = (fx: number, fy: number) => H[key(clampTile(fx), clampTile(fy))] || 0;

    const update = () => {
      framesRef.current++;
      const me = selfRef.current;
      let moving = false;
      if (me.path.length) {
        const wp = me.path[0]; const dx = wp.gx - me.fx, dy = wp.gy - me.fy; const d = Math.hypot(dx, dy);
        if (d < 0.12) { me.fx = wp.gx; me.fy = wp.gy; me.path.shift(); }
        else { const s = Math.min(WALK, d); me.fx += dx / d * s; me.fy += dy / d * s; moving = true; me.af += 1; }
      }
      if (!moving) me.af += 0.3;
      me.z += (tileZ(me.fx, me.fy) - me.z) * 0.25;
      if (me.bubbleLife > 0) me.bubbleLife--;
      const ch = channelRef.current;
      if (ch) {
        if (moving && ++posAccum.current >= 7) { posAccum.current = 0; ch.send({ type: 'broadcast', event: 'pos', payload: { id: me.id, fx: +me.fx.toFixed(2), fy: +me.fy.toFixed(2) } }); }
        if (wasMovingRef.current && !moving) { ch.send({ type: 'broadcast', event: 'pos', payload: { id: me.id, fx: +me.fx.toFixed(2), fy: +me.fy.toFixed(2) } }); ch.track({ id: me.id, handle: me.handle, skinId: me.skinId, icon: me.icon ?? undefined, fx: +me.fx.toFixed(2), fy: +me.fy.toFixed(2) }); }
      }
      wasMovingRef.current = moving;
      for (const r of remotesRef.current.values()) { r.fx += (r.tx - r.fx) * 0.2; r.fy += (r.ty - r.fy) * 0.2; r.z += (tileZ(r.fx, r.fy) - r.z) * 0.25; r.af += Math.hypot(r.tx - r.fx, r.ty - r.fy) > 0.02 ? 1 : 0.3; if (r.bubbleLife > 0) r.bubbleLife--; }
    };

    const diamond = (cx: number, cy: number, hw: number, hh: number) => { ctx.beginPath(); ctx.moveTo(cx, cy - hh); ctx.lineTo(cx + hw, cy); ctx.lineTo(cx, cy + hh); ctx.lineTo(cx - hw, cy); ctx.closePath(); };
    const block = (cx: number, cyBase: number, h: number, base: string, accent: string, foot: number, emoji?: string) => {
      const hw = TW * foot * 0.9, hh = TH * foot * 0.9, Hh = h * STACK_H, cyTop = cyBase - Hh;
      ctx.fillStyle = shade(base, 0.55); ctx.beginPath(); ctx.moveTo(cx - hw, cyBase); ctx.lineTo(cx, cyBase + hh); ctx.lineTo(cx, cyTop + hh); ctx.lineTo(cx - hw, cyTop); ctx.closePath(); ctx.fill();
      ctx.fillStyle = shade(base, 0.8); ctx.beginPath(); ctx.moveTo(cx, cyBase + hh); ctx.lineTo(cx + hw, cyBase); ctx.lineTo(cx + hw, cyTop); ctx.lineTo(cx, cyTop + hh); ctx.closePath(); ctx.fill();
      ctx.fillStyle = shade(base, 1.25); diamond(cx, cyTop, hw, hh); ctx.fill();
      ctx.strokeStyle = hexA(accent, 0.35); ctx.lineWidth = 1; diamond(cx, cyTop, hw, hh); ctx.stroke();
      if (emoji) { ctx.font = `${Math.round(13 * foot + 4)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(emoji, cx, cyTop); }
      return cyTop;
    };
    // general iso box with independent footprint (fw×fd, fractions of a tile) — the building
    // block for real furniture (seats, backrests, armrests, legs, cabinets…).
    const boxAt = (cx: number, cyB: number, fw: number, fd: number, h: number, color: string, accent?: string, top = true) => {
      const hw = TW * fw, hh = TH * fd, Hh = h * STACK_H, cyT = cyB - Hh;
      ctx.fillStyle = shade(color, 0.55); ctx.beginPath(); ctx.moveTo(cx - hw, cyB); ctx.lineTo(cx, cyB + hh); ctx.lineTo(cx, cyT + hh); ctx.lineTo(cx - hw, cyT); ctx.closePath(); ctx.fill();
      ctx.fillStyle = shade(color, 0.82); ctx.beginPath(); ctx.moveTo(cx, cyB + hh); ctx.lineTo(cx + hw, cyB); ctx.lineTo(cx + hw, cyT); ctx.lineTo(cx, cyT + hh); ctx.closePath(); ctx.fill();
      if (top) { ctx.fillStyle = shade(color, 1.22); diamond(cx, cyT, hw, hh); ctx.fill(); if (accent) { ctx.strokeStyle = hexA(accent, 0.3); ctx.lineWidth = 1; diamond(cx, cyT, hw, hh); ctx.stroke(); } }
      return cyT;
    };
    const poly = (pts: number[][], fill?: string, stroke?: string, lw = 1) => { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath(); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); } };

    // ★ HI-FI lounge set — hand-drawn iso, lots of layered detail.
    const drawCouch = (sx: number, sy: number, theme: RoomDef, base: string) => {
      const P = (u: number, v: number, z = 0): number[] => [sx + (u - v) * TW, sy + (u + v) * TH - z * STACK_H];
      const cT = shade(base, 1.3), cR = shade(base, 0.95), cL = shade(base, 0.7), cD = shade(base, 0.48), hi = shade(base, 1.55);
      const span = (u0: number, u1: number, v0: number, v1: number, z0: number, z1: number, t: string, r: string, l: string) => {
        poly([P(u1, v0, z1), P(u1, v1, z1), P(u1, v1, z0), P(u1, v0, z0)], r);   // +u face
        poly([P(u0, v1, z1), P(u1, v1, z1), P(u1, v1, z0), P(u0, v1, z0)], l);   // +v face
        poly([P(u0, v0, z1), P(u1, v0, z1), P(u1, v1, z1), P(u0, v1, z1)], t);   // top
      };
      // contact shadow under the whole 2-tile footprint
      ctx.save(); ctx.globalAlpha = 0.32; ctx.fillStyle = '#000'; const sc = P(0.5, 0, 0); ctx.beginPath(); ctx.ellipse(sc[0], sc[1] + TH * 0.4, TILE_W * 1.05, TILE_H * 1.05, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      // legs
      for (const [u, v] of [[-0.28, -0.28], [1.28, -0.28], [-0.28, 0.28], [1.28, 0.28]] as [number, number][]) span(u - 0.06, u + 0.06, v - 0.06, v + 0.06, 0, 0.16, '#3a2616', '#2a1c10', '#1f140a');
      // back rest (tall) — drawn before front parts
      span(-0.4, 1.4, -0.42, -0.16, 0.5, 1.5, cT, cR, cL);
      // left arm (back), back cushions, seat base, seat cushions, pillow, right arm (front)
      span(-0.42, -0.12, -0.42, 0.4, 0.5, 1.04, cT, cR, cL);
      { const a = P(-0.27, -0.01, 1.04); ctx.save(); ctx.globalAlpha = 0.45; ctx.fillStyle = hi; ctx.beginPath(); ctx.ellipse(a[0], a[1], TW * 0.42, TH * 0.7, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
      // back cushions with button tufting
      for (const [u0, u1] of [[-0.08, 0.6], [0.6, 1.32]] as [number, number][]) {
        span(u0, u1, -0.16, 0.02, 0.56, 1.42, shade(base, 1.16), cR, cL);
        for (let bx = 0; bx < 2; bx++) for (let by = 0; by < 2; by++) { const pt = P(u0 + 0.2 + bx * 0.3, 0.0, 0.82 + by * 0.32); ctx.fillStyle = cD; ctx.beginPath(); ctx.arc(pt[0], pt[1], 1.8, 0, Math.PI * 2); ctx.fill(); }
      }
      // seat base
      span(-0.34, 1.34, -0.16, 0.36, 0.18, 0.52, cT, cR, cL);
      // seat cushions (puffy, highlighted, piped)
      for (const [u0, u1] of [[-0.3, 0.5], [0.5, 1.3]] as [number, number][]) {
        span(u0 + 0.02, u1 - 0.02, -0.28, 0.34, 0.52, 0.76, shade(base, 1.24), cR, cL);
        const c = P((u0 + u1) / 2, 0.03, 0.76); const g = ctx.createRadialGradient(c[0], c[1], 2, c[0], c[1], 28); g.addColorStop(0, 'rgba(255,255,255,0.16)'); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(c[0], c[1], TW * 0.55, TH * 0.55, 0, 0, Math.PI * 2); ctx.fill();
        poly([P(u0 + 0.02, -0.28, 0.76), P(u1 - 0.02, -0.28, 0.76), P(u1 - 0.02, 0.34, 0.76), P(u0 + 0.02, 0.34, 0.76)], undefined, hexA(hi, 0.5), 1);
      }
      // throw pillow (accent) on the left seat
      { const pc = P(0.12, 0.04, 0.82); ctx.save(); ctx.translate(pc[0], pc[1]); ctx.rotate(-0.22); ctx.fillStyle = theme.accent; ctx.beginPath(); ctx.roundRect(-12, -9, 24, 18, 5); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.beginPath(); ctx.roundRect(-12, -9, 24, 8, 5); ctx.fill(); ctx.strokeStyle = hexA('#000', 0.2); ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(-12, -9, 24, 18, 5); ctx.stroke(); ctx.restore(); }
      // right arm (front, occludes)
      span(1.12, 1.42, -0.42, 0.4, 0.5, 1.04, cT, cR, cL);
      { const a = P(1.27, -0.01, 1.04); ctx.save(); ctx.globalAlpha = 0.45; ctx.fillStyle = hi; ctx.beginPath(); ctx.ellipse(a[0], a[1], TW * 0.42, TH * 0.7, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
    };

    const drawArmchair = (sx: number, sy: number, theme: RoomDef, base: string) => {
      const P = (u: number, v: number, z = 0): number[] => [sx + (u - v) * TW, sy + (u + v) * TH - z * STACK_H];
      const cT = shade(base, 1.3), cR = shade(base, 0.95), cL = shade(base, 0.7), hi = shade(base, 1.55);
      const span = (u0: number, u1: number, v0: number, v1: number, z0: number, z1: number, t: string, r: string, l: string) => { poly([P(u1, v0, z1), P(u1, v1, z1), P(u1, v1, z0), P(u1, v0, z0)], r); poly([P(u0, v1, z1), P(u1, v1, z1), P(u1, v1, z0), P(u0, v1, z0)], l); poly([P(u0, v0, z1), P(u1, v0, z1), P(u1, v1, z1), P(u0, v1, z1)], t); };
      ctx.save(); ctx.globalAlpha = 0.32; ctx.fillStyle = '#000'; const sc = P(0, 0, 0); ctx.beginPath(); ctx.ellipse(sc[0], sc[1] + TH * 0.4, TILE_W * 0.62, TILE_H * 0.62, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      for (const [u, v] of [[-0.28, -0.28], [0.28, -0.28], [-0.28, 0.28], [0.28, 0.28]] as [number, number][]) span(u - 0.06, u + 0.06, v - 0.06, v + 0.06, 0, 0.16, '#3a2616', '#2a1c10', '#1f140a');
      span(-0.4, 0.4, -0.42, -0.14, 0.5, 1.45, cT, cR, cL);                  // back
      span(-0.42, -0.12, -0.42, 0.4, 0.5, 1.0, cT, cR, cL);                  // left arm
      span(-0.3, 0.3, -0.14, 0.36, 0.18, 0.52, cT, cR, cL);                  // seat base
      { const u0 = -0.28, u1 = 0.28; span(u0, u1, -0.26, 0.34, 0.52, 0.78, shade(base, 1.24), cR, cL); const c = P(0, 0.04, 0.78); const g = ctx.createRadialGradient(c[0], c[1], 2, c[0], c[1], 22); g.addColorStop(0, 'rgba(255,255,255,0.16)'); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(c[0], c[1], TW * 0.5, TH * 0.5, 0, 0, Math.PI * 2); ctx.fill(); poly([P(u0, -0.26, 0.78), P(u1, -0.26, 0.78), P(u1, 0.34, 0.78), P(u0, 0.34, 0.78)], undefined, hexA(hi, 0.5), 1); }
      span(0.12, 0.42, -0.42, 0.4, 0.5, 1.0, cT, cR, cL);                    // right arm (front)
    };

    const drawCoffee = (sx: number, sy: number, theme: RoomDef, base: string) => {
      const P = (u: number, v: number, z = 0): number[] => [sx + (u - v) * TW, sy + (u + v) * TH - z * STACK_H];
      const cT = shade(base, 1.3), cR = shade(base, 0.95), cL = shade(base, 0.65);
      const span = (u0: number, u1: number, v0: number, v1: number, z0: number, z1: number, t: string, r: string, l: string) => { poly([P(u1, v0, z1), P(u1, v1, z1), P(u1, v1, z0), P(u1, v0, z0)], r); poly([P(u0, v1, z1), P(u1, v1, z1), P(u1, v1, z0), P(u0, v1, z0)], l); poly([P(u0, v0, z1), P(u1, v0, z1), P(u1, v1, z1), P(u0, v1, z1)], t); };
      ctx.save(); ctx.globalAlpha = 0.3; ctx.fillStyle = '#000'; const sc = P(0, 0, 0); ctx.beginPath(); ctx.ellipse(sc[0], sc[1] + TH * 0.3, TILE_W * 0.6, TILE_H * 0.6, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      for (const [u, v] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]] as [number, number][]) span(u - 0.05, u + 0.05, v - 0.05, v + 0.05, 0, 0.42, cT, shade(base, 0.8), cL);
      span(-0.36, 0.36, -0.36, 0.36, 0.42, 0.56, cT, cR, cL);               // wood frame top
      // glass top (translucent) with a reflection streak
      const z = 0.62; ctx.save(); ctx.globalAlpha = 0.34; ctx.fillStyle = '#bfe6ee'; poly([P(-0.34, -0.34, z), P(0.34, -0.34, z), P(0.34, 0.34, z), P(-0.34, 0.34, z)]); ctx.fill();
      ctx.globalAlpha = 0.5; ctx.fillStyle = '#ffffff'; poly([P(-0.24, -0.1, z), P(-0.05, -0.28, z), P(0.0, -0.22, z), P(-0.18, -0.04, z)]); ctx.fill(); ctx.restore();
      ctx.strokeStyle = hexA('#dff4f8', 0.5); ctx.lineWidth = 1; poly([P(-0.34, -0.34, z), P(0.34, -0.34, z), P(0.34, 0.34, z), P(-0.34, 0.34, z)], undefined, hexA('#dff4f8', 0.5), 1);
      // a little book + mug on the glass
      { const b = P(-0.12, 0.08, z); ctx.save(); ctx.translate(b[0], b[1]); ctx.rotate(0.2); ctx.fillStyle = theme.accent; ctx.fillRect(-9, -6, 18, 12); ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillRect(-9, -6, 18, 2.5); ctx.restore(); }
      { const m = P(0.16, -0.05, z); ctx.fillStyle = '#e8e8ee'; ctx.beginPath(); ctx.ellipse(m[0], m[1], 5, 3, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(m[0] - 5, m[1] - 7, 10, 7); ctx.fillStyle = '#5a3a22'; ctx.beginPath(); ctx.ellipse(m[0], m[1] - 7, 5, 2.4, 0, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#e8e8ee'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(m[0] + 6, m[1] - 4, 3, -1, 1.4); ctx.stroke(); }
    };

    const drawFurni = (it: Item, gz: number, theme: RoomDef) => {
      const d = defOf(it.kind); const { sx, sy } = iso(it.gx, it.gy, gz);
      switch (d.special) {
        case 'couch': drawCouch(sx, sy, theme, d.color); break;
        case 'armchair': drawArmchair(sx, sy, theme, d.color); break;
        case 'coffee': drawCoffee(sx, sy, theme, d.color); break;
        case 'rug': { const hw = TW * 0.92, hh = TH * 0.92, top = block(sx, sy, 1, d.color, '#fff', 1); ctx.save(); ctx.globalAlpha = 0.5; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; for (let i = 1; i < 4; i++) { const f = i / 4; diamond(sx, top, hw * f, hh * f); ctx.stroke(); } ctx.restore(); break; }
        case 'water': { const top = block(sx, sy, 1, d.color, theme.accent, 1); ctx.save(); ctx.globalAlpha = 0.4 + Math.sin(framesRef.current * 0.1) * 0.2; ctx.fillStyle = '#fff'; diamond(sx, top, TW * 0.5, TH * 0.5); ctx.fill(); ctx.restore(); break; }
        case 'stair': { const top = block(sx, sy, 1, d.color, theme.accent, 1); ctx.strokeStyle = hexA(theme.accent, 0.6); ctx.lineWidth = 1.5; for (let i = 1; i < 3; i++) { ctx.beginPath(); ctx.moveTo(sx - TW * 0.7, top + i * 5); ctx.lineTo(sx, top + i * 5 + TH * 0.7); ctx.stroke(); } break; }
        case 'wall': { block(sx, sy, d.h, d.color, theme.accent, d.foot); break; }
        case 'plant': { const top = block(sx, sy, 1, '#8a4f2a', theme.accent, d.foot * 0.8); const lc = it.kind === 'flores' ? '#ff66aa' : '#1ED760'; const lvl = d.h; for (let r = 0; r < (lvl === 2 ? 5 : 3); r++) { const ox = (r - 1) * 7; ctx.fillStyle = lc; ctx.beginPath(); ctx.ellipse(sx + ox, top - 8 - (lvl === 2 ? r * 6 : 0), 6, 13, ox * 0.05, 0, Math.PI * 2); ctx.fill(); } break; }
        case 'lamp': { const top = block(sx, sy, d.h, '#2a2a30', theme.accent, d.foot); ctx.save(); ctx.shadowColor = d.color; ctx.shadowBlur = 22; ctx.globalAlpha = 0.5 + Math.abs(Math.sin(framesRef.current * 0.08)) * 0.4; ctx.fillStyle = d.color; ctx.beginPath(); ctx.arc(sx, top - 4, 7, 0, Math.PI * 2); ctx.fill(); ctx.restore(); break; }
        case 'speaker': { const top = block(sx, sy, 2, '#23232f', theme.accent, 0.7); ctx.fillStyle = hexA(theme.accent, 0.6 + Math.abs(Math.sin(framesRef.current * 0.15)) * 0.4); ctx.beginPath(); ctx.arc(sx + 8, top + 26, 6, 0, Math.PI * 2); ctx.fill(); break; }
        case 'tv': { const top = block(sx, sy, d.h, d.color, theme.accent, d.foot); ctx.fillStyle = hexA(theme.accent, 0.7); ctx.fillRect(sx - 14, top - 12, 28, 18); ctx.fillStyle = `hsl(${(framesRef.current * 3) % 360},80%,60%)`; ctx.globalAlpha = 0.5; ctx.fillRect(sx - 12, top - 10, 24, 14); ctx.globalAlpha = 1; break; }
        case 'sign': { const top = block(sx, sy, 1, d.color, theme.accent, d.foot); ctx.fillStyle = theme.accent; ctx.font = '900 10px Helvetica, Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('SUAV', sx, top); break; }
        case 'disco': { const cy = sy - 2.6 * STACK_H; ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(sx, cy - 22); ctx.lineTo(sx, cy - 56); ctx.stroke(); ctx.save(); ctx.translate(sx, cy); ctx.rotate(framesRef.current * 0.04); const grd = ctx.createRadialGradient(-6, -6, 3, 0, 0, 20); grd.addColorStop(0, '#fff'); grd.addColorStop(1, '#8893b8'); ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(0, 0, 20, 0, Math.PI * 2); ctx.fill(); for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + framesRef.current * 0.04; ctx.fillStyle = `hsla(${(framesRef.current * 4 + i * 60) % 360},90%,65%,0.9)`; ctx.beginPath(); ctx.arc(Math.cos(a) * 12, Math.sin(a) * 12, 3.5, 0, Math.PI * 2); ctx.fill(); } ctx.restore(); break; }
        case 'chair': {
          boxAt(sx, sy - TH * 0.2, 0.52, 0.14, 1.15, shade(d.color, 1.08), theme.accent);   // backrest
          const top = boxAt(sx, sy + TH * 0.16, 0.52, 0.5, 0.5, d.color, theme.accent);       // seat
          ctx.fillStyle = shade(d.color, 1.35); diamond(sx, top, TW * 0.46, TH * 0.46); ctx.fill();
          break;
        }
        case 'sofa': {
          const w = d.foot * 0.92;
          boxAt(sx, sy - TH * 0.22, w, 0.16, 1.0, shade(d.color, 1.06), theme.accent);          // back
          boxAt(sx - TW * w * 0.9, sy, 0.16, 0.5, 0.85, shade(d.color, 0.92), theme.accent);     // left arm
          boxAt(sx + TW * w * 0.9, sy, 0.16, 0.5, 0.85, shade(d.color, 0.92), theme.accent);     // right arm
          const top = boxAt(sx, sy + TH * 0.16, w, 0.52, 0.5, d.color, theme.accent);            // seat
          ctx.fillStyle = shade(d.color, 1.32); diamond(sx, top, TW * w * 0.9, TH * 0.46); ctx.fill();
          break;
        }
        case 'stool': {
          const top = boxAt(sx, sy, 0.4, 0.4, 0.7, shade(d.color, 0.85), theme.accent, false);
          ctx.fillStyle = shade(d.color, 1.25); ctx.beginPath(); ctx.ellipse(sx, top, TW * 0.4, TH * 0.4, 0, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = hexA(theme.accent, 0.3); ctx.lineWidth = 1; ctx.stroke();
          break;
        }
        case 'throne': {
          boxAt(sx, sy - TH * 0.22, 0.66, 0.16, 2.1, d.color, theme.accent);                     // tall back
          boxAt(sx - TW * 0.62, sy, 0.16, 0.5, 1.0, d.color, theme.accent);
          boxAt(sx + TW * 0.62, sy, 0.16, 0.5, 1.0, d.color, theme.accent);
          const top = boxAt(sx, sy + TH * 0.15, 0.66, 0.5, 0.7, shade(d.color, 1.12), theme.accent);
          ctx.fillStyle = theme.accent; ctx.beginPath(); ctx.arc(sx, sy - 2.1 * STACK_H + 7, 4, 0, Math.PI * 2); ctx.fill();
          void top; break;
        }
        case 'puff': {
          ctx.fillStyle = shade(d.color, 0.7); ctx.beginPath(); ctx.ellipse(sx, sy, TW * 0.5, TH * 0.52, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = shade(d.color, 1.15); ctx.beginPath(); ctx.ellipse(sx, sy - 9, TW * 0.5, TH * 0.46, 0, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = hexA(theme.accent, 0.3); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(sx - TW * 0.5, sy - 4); ctx.lineTo(sx, sy - 9 + TH * 0.46); ctx.lineTo(sx + TW * 0.5, sy - 4); ctx.stroke();
          break;
        }
        case 'table': {
          const w = d.foot, legH = 0.7 * STACK_H, top = sy - legH;
          ctx.strokeStyle = shade(d.color, 0.55); ctx.lineWidth = 3;
          for (const [lx, ly] of [[-TW * w * 0.8, 0], [TW * w * 0.8, 0], [0, -TH * w * 0.8], [0, TH * w * 0.8]] as [number, number][]) { ctx.beginPath(); ctx.moveTo(sx + lx, sy + ly); ctx.lineTo(sx + lx, sy + ly - legH); ctx.stroke(); }
          ctx.fillStyle = shade(d.color, 0.7); ctx.beginPath(); ctx.moveTo(sx - TW * w, top); ctx.lineTo(sx, top + TH * w); ctx.lineTo(sx + TW * w, top); ctx.lineTo(sx + TW * w, top + 4); ctx.lineTo(sx, top + TH * w + 4); ctx.lineTo(sx - TW * w, top + 4); ctx.closePath(); ctx.fill();
          ctx.fillStyle = shade(d.color, 1.22); diamond(sx, top, TW * w, TH * w); ctx.fill();
          ctx.strokeStyle = hexA(theme.accent, 0.3); ctx.lineWidth = 1; diamond(sx, top, TW * w, TH * w); ctx.stroke();
          break;
        }
        case 'counter': { const top = boxAt(sx, sy, d.foot, d.foot, 2, d.color, theme.accent); ctx.fillStyle = shade(d.color, 1.4); diamond(sx, top - 2, TW * d.foot * 1.06, TH * d.foot * 1.06); ctx.fill(); break; }
        case 'shelf': {
          const top = boxAt(sx, sy, d.foot, d.foot, 2, d.color, theme.accent);
          ctx.strokeStyle = hexA(theme.accent, 0.4); ctx.lineWidth = 1.5;
          for (let i = 1; i <= 2; i++) { const yy = top + i * (2 * STACK_H / 3); ctx.beginPath(); ctx.moveTo(sx - TW * d.foot, yy - TH * d.foot); ctx.lineTo(sx + TW * d.foot, yy + TH * d.foot); ctx.stroke(); }
          break;
        }
        case 'fridge': {
          const top = boxAt(sx, sy, d.foot, d.foot, 2, d.color, theme.accent);
          ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(sx + TW * d.foot * 0.5, top + TH * d.foot * 0.5); ctx.lineTo(sx + TW * d.foot * 0.5, top + TH * d.foot * 0.5 + 1.8 * STACK_H); ctx.stroke();
          ctx.strokeStyle = shade(d.color, 0.5); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(sx + TW * d.foot * 0.18, top + 16); ctx.lineTo(sx + TW * d.foot * 0.18, top + 34); ctx.stroke();
          break;
        }
        case 'vending': {
          const top = boxAt(sx, sy, d.foot, d.foot, 2, d.color, theme.accent);
          ctx.fillStyle = 'rgba(10,20,30,0.7)'; ctx.beginPath(); ctx.moveTo(sx + 4, top + TH * d.foot * 0.3); ctx.lineTo(sx + TW * d.foot * 0.72, top); ctx.lineTo(sx + TW * d.foot * 0.72, top + 1.6 * STACK_H); ctx.lineTo(sx + 4, top + TH * d.foot * 0.3 + 1.6 * STACK_H); ctx.closePath(); ctx.fill();
          ctx.fillStyle = hexA(theme.accent, 0.6); ctx.fillRect(sx - TW * d.foot * 0.55, top + 5, TW * d.foot * 0.5, 4);
          break;
        }
        case 'jukebox': {
          const top = boxAt(sx, sy, d.foot, d.foot, 2, d.color, theme.accent);
          ctx.fillStyle = shade(d.color, 1.4); ctx.beginPath(); ctx.ellipse(sx, top, TW * d.foot, TH * d.foot, 0, Math.PI, 0); ctx.fill();
          for (let i = 0; i < 5; i++) { ctx.fillStyle = `hsl(${(framesRef.current * 4 + i * 70) % 360},90%,62%)`; ctx.beginPath(); ctx.arc(sx - 12 + i * 6, top + 10, 2, 0, Math.PI * 2); ctx.fill(); }
          break;
        }
        case 'frame': { const w = 18, h = 24, by = sy - 6; ctx.fillStyle = d.color; ctx.fillRect(sx - w / 2 - 3, by - h - 3, w + 6, h + 6); ctx.fillStyle = '#243a6a'; ctx.fillRect(sx - w / 2, by - h, w, h); ctx.fillStyle = hexA(theme.accent, 0.5); ctx.fillRect(sx - w / 2 + 3, by - h + 4, w - 6, 5); break; }
        case 'trophy': { const cy = sy - 5; ctx.fillStyle = '#b88a14'; ctx.fillRect(sx - 6, cy - 2, 12, 4); ctx.fillStyle = d.color; ctx.fillRect(sx - 2, cy - 11, 4, 9); ctx.beginPath(); ctx.moveTo(sx - 9, cy - 24); ctx.quadraticCurveTo(sx, cy - 9, sx + 9, cy - 24); ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#fff3a0'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(sx - 9, cy - 20, 4, Math.PI * 0.4, Math.PI * 1.5); ctx.stroke(); ctx.beginPath(); ctx.arc(sx + 9, cy - 20, 4, -Math.PI * 0.5, Math.PI * 0.6); ctx.stroke(); break; }
        case 'vase': { const cy = sy - 4; ctx.fillStyle = d.color; ctx.beginPath(); ctx.moveTo(sx - 7, cy); ctx.quadraticCurveTo(sx - 13, cy - 13, sx - 4, cy - 22); ctx.lineTo(sx + 4, cy - 22); ctx.quadraticCurveTo(sx + 13, cy - 13, sx + 7, cy); ctx.closePath(); ctx.fill(); ctx.strokeStyle = shade(d.color, 1.35); ctx.lineWidth = 1; ctx.stroke(); break; }
        case 'duck': { const cy = sy - 4; ctx.fillStyle = d.color; ctx.beginPath(); ctx.ellipse(sx - 1, cy - 6, 11, 8, 0, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(sx + 7, cy - 14, 5, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#ff8800'; ctx.beginPath(); ctx.moveTo(sx + 11, cy - 14); ctx.lineTo(sx + 18, cy - 13); ctx.lineTo(sx + 11, cy - 11); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(sx + 8, cy - 15, 1.2, 0, Math.PI * 2); ctx.fill(); break; }
        case 'cone': { const cy = sy - 2; ctx.fillStyle = d.color; ctx.beginPath(); ctx.moveTo(sx, cy - 28); ctx.lineTo(sx + 10, cy); ctx.lineTo(sx - 10, cy); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(sx - 6, cy - 13); ctx.lineTo(sx + 6, cy - 13); ctx.lineTo(sx + 5, cy - 9); ctx.lineTo(sx - 5, cy - 9); ctx.closePath(); ctx.fill(); ctx.fillStyle = shade(d.color, 0.8); ctx.fillRect(sx - 12, cy - 2, 24, 4); break; }
        case 'statue': { const ped = boxAt(sx, sy, d.foot * 0.8, d.foot * 0.8, 0.45, '#55555f', theme.accent); ctx.fillStyle = d.color; ctx.beginPath(); ctx.moveTo(sx - 8, ped); ctx.lineTo(sx + 8, ped); ctx.lineTo(sx + 5, ped - 30); ctx.lineTo(sx - 5, ped - 30); ctx.closePath(); ctx.fill(); ctx.beginPath(); ctx.arc(sx, ped - 36, 6, 0, Math.PI * 2); ctx.fill(); break; }
        default: block(sx, sy, d.h, d.color, theme.accent, d.foot);   // plain clean block (no emoji)
      }
    };

    const drawAvatar = (a: Avatar, isSelf: boolean) => {
      const { sx, sy } = iso(a.fx, a.fy, a.z);
      const col = a.icon ? iconPrimaryColor(a.icon) : skinById(a.skinId).color;
      const moving = isSelf ? selfRef.current.path.length > 0 : Math.hypot(a.tx - a.fx, a.ty - a.fy) > 0.02;
      ctx.save(); ctx.globalAlpha = 0.4; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(sx, sy, 18, 8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.5; ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 14; ctx.beginPath(); ctx.ellipse(sx, sy, 12, 5, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      const bob = moving ? Math.sin(a.af * 0.3) * 3 : 0;
      ctx.save(); ctx.translate(sx, sy - 30 + bob); ctx.shadowColor = col; ctx.shadowBlur = isSelf ? 22 : 12;
      if (a.icon) drawIconSpec(ctx, a.icon, 46, a.af);
      else { const sk = skinById(a.skinId); drawSkinShape(ctx, sk.shape, sk.color, 38, 50, a.af); }
      ctx.restore();
      ctx.save(); ctx.font = '700 11px Helvetica, Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const nw = ctx.measureText(a.handle).width + 12, ny = sy + 13;
      ctx.fillStyle = 'rgba(8,8,14,0.72)'; ctx.beginPath(); ctx.roundRect(sx - nw / 2, ny - 8, nw, 16, 8); ctx.fill();
      if (isSelf) { ctx.strokeStyle = hexA(col, 0.8); ctx.lineWidth = 1; ctx.stroke(); }
      ctx.fillStyle = isSelf ? col : 'rgba(255,255,255,0.82)'; ctx.fillText(a.handle, sx, ny); ctx.restore();
      if (a.bubbleLife > 0 && a.bubble) {
        const alpha = Math.min(1, a.bubbleLife / 30); ctx.save(); ctx.globalAlpha = alpha; ctx.font = '600 15px Helvetica, Arial';
        const tw = ctx.measureText(a.bubble).width, bw = tw + 22, bh = 28, bx = sx - bw / 2, by = sy - 86;
        ctx.fillStyle = 'rgba(10,10,18,0.94)'; ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 8); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(sx - 6, by + bh); ctx.lineTo(sx + 6, by + bh); ctx.lineTo(sx, by + bh + 8); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(a.bubble, sx, by + bh / 2); ctx.restore();
      }
    };

    const draw = () => {
      const theme = themeRef.current; const t = framesRef.current;
      const bg = ctx.createLinearGradient(0, 0, 0, STAGE_H); bg.addColorStop(0, '#08080e'); bg.addColorStop(0.55, '#0b0912'); bg.addColorStop(1, '#0a0610');
      ctx.fillStyle = bg; ctx.fillRect(0, 0, STAGE_W, STAGE_H);
      ctx.save(); ctx.fillStyle = '#fff'; for (let i = 0; i < 22; i++) { const mx = (i * 197.3) % STAGE_W; const my = (i * 71 + t * (0.12 + (i % 4) * 0.05)) % 210; ctx.globalAlpha = 0.03 + (i % 5) * 0.012; ctx.fillRect(mx, 200 - my, 2, 2); } ctx.restore();
      ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '900 58px Helvetica, Arial'; ctx.shadowColor = theme.accent; ctx.shadowBlur = 30; ctx.fillStyle = hexA(theme.accent, 0.92); ctx.fillText(theme.name.toUpperCase(), STAGE_W / 2, 70); ctx.shadowBlur = 0; ctx.font = '700 12px monospace'; ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fillText(roomOf(room).locked ? '· CURADA ·' : '· S U A V ·', STAGE_W / 2, 102); ctx.restore();

      // walls
      const bc = iso(-0.5, -0.5), rEnd = iso(GRID - 0.5, -0.5), lEnd = iso(-0.5, GRID - 0.5), wh = WALL_H * STACK_H;
      ctx.fillStyle = shade(theme.floor, 1.5); ctx.beginPath(); ctx.moveTo(bc.sx, bc.sy); ctx.lineTo(rEnd.sx, rEnd.sy); ctx.lineTo(rEnd.sx, rEnd.sy - wh); ctx.lineTo(bc.sx, bc.sy - wh); ctx.closePath(); ctx.fill();
      ctx.fillStyle = shade(theme.floor, 1.0); ctx.beginPath(); ctx.moveTo(bc.sx, bc.sy); ctx.lineTo(lEnd.sx, lEnd.sy); ctx.lineTo(lEnd.sx, lEnd.sy - wh); ctx.lineTo(bc.sx, bc.sy - wh); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = hexA(theme.accent, 0.5); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(rEnd.sx, rEnd.sy - wh); ctx.lineTo(bc.sx, bc.sy - wh); ctx.lineTo(lEnd.sx, lEnd.sy - wh); ctx.stroke();

      // floor tiles
      for (let gx = 0; gx < GRID; gx++) for (let gy = 0; gy < GRID; gy++) {
        const { sx, sy } = iso(gx, gy); diamond(sx, sy, TW, TH); ctx.fillStyle = theme.floor; ctx.fill();
        ctx.fillStyle = (gx + gy) % 2 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.22)'; ctx.fill();
        ctx.strokeStyle = hexA(theme.accent, 0.10); ctx.lineWidth = 1; ctx.stroke();
      }
      const hv = hoverRef.current, ui = uiRef.current;
      if (ui.decorOpen && (ui.placingKind || ui.removeMode) && hv) { const { sx, sy } = iso(hv.gx, hv.gy); diamond(sx, sy, TW, TH); ctx.fillStyle = hexA(ui.removeMode ? '#ff4e3e' : theme.accent, 0.3); ctx.fill(); ctx.strokeStyle = ui.removeMode ? '#ff4e3e' : theme.accent; ctx.lineWidth = 2; ctx.stroke(); }

      // depth-sorted furni + avatars
      const stack = new Map<string, number>();
      const ents: Array<{ s: number; draw: () => void }> = [];
      for (const it of itemsRef.current) { const k = `${it.gx},${it.gy}`; const gz = stack.get(k) ?? 0; const dd = defOf(it.kind); const [sw, sh] = dd.span ?? [1, 1]; stack.set(k, gz + (dd.h || 0)); const ii = it, z = gz; ents.push({ s: (it.gx + sw - 1) + (it.gy + sh - 1) + z * 0.01, draw: () => drawFurni(ii, z, theme) }); }
      ents.push({ s: selfRef.current.fx + selfRef.current.fy + selfRef.current.z * 0.01 + 0.005, draw: () => drawAvatar(selfRef.current, true) });
      for (const r of remotesRef.current.values()) { const rr = r; ents.push({ s: rr.fx + rr.fy + rr.z * 0.01 + 0.005, draw: () => drawAvatar(rr, false) }); }
      ents.sort((a, b) => a.s - b.s); for (const e of ents) e.draw();

      const vig = ctx.createRadialGradient(STAGE_W / 2, STAGE_H * 0.54, STAGE_H * 0.34, STAGE_W / 2, STAGE_H * 0.54, STAGE_H * 0.85);
      vig.addColorStop(0, 'rgba(0,0,0,0)'); vig.addColorStop(1, 'rgba(0,0,0,0.5)'); ctx.fillStyle = vig; ctx.fillRect(0, 0, STAGE_W, STAGE_H);
    };

    let last = 0, acc = 0; const STEP = 1000 / 60;
    const loop = (now: number) => { rafRef.current = requestAnimationFrame(loop); if (last === 0) last = now; let dt = now - last; last = now; if (dt > 250) dt = 250; acc += dt; let n = 0; while (acc >= STEP && n < 5) { update(); acc -= STEP; n++; } draw(); };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const evtTile = (e: React.PointerEvent) => { const canvas = canvasRef.current!; const rect = canvas.getBoundingClientRect(); const sx = (e.clientX - rect.left) / rect.width * STAGE_W, sy = (e.clientY - rect.top) / rect.height * STAGE_H; const raw = screenToTile(sx, sy); return { gx: clampTile(raw.gx), gy: clampTile(raw.gy), raw }; };
  const onPointerDown = (e: React.PointerEvent) => {
    const { gx, gy, raw } = evtTile(e);
    if (raw.gx < -0.5 || raw.gx > GRID - 0.5 || raw.gy < -0.5 || raw.gy > GRID - 0.5) return;
    if (placingKind) { placeItem(placingKind, gx, gy); return; }
    if (removeMode) { removeAt(gx, gy); return; }
    const me = selfRef.current; const p = findPath(clampTile(me.fx), clampTile(me.fy), gx, gy); if (p && p.length) me.path = p;
  };
  const onPointerMove = (e: React.PointerEvent) => { if (!decorOpen) { hoverRef.current = null; return; } const { gx, gy, raw } = evtTile(e); hoverRef.current = (raw.gx < -0.5 || raw.gx > GRID - 0.5 || raw.gy < -0.5 || raw.gy > GRID - 0.5) ? null : { gx, gy }; };

  return (
    <div className="relative w-full h-full select-none overflow-hidden bg-black" style={{ touchAction: 'none', WebkitUserSelect: 'none', userSelect: 'none' }}>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="relative shrink-0 origin-center" style={isMobileStage ? { width: STAGE_W, height: STAGE_H, transform: `scale(${stageScale})` } : { width: '100%', height: '100%' }}>
          <canvas ref={canvasRef} onPointerDown={onPointerDown} onPointerMove={onPointerMove} className="absolute inset-0 block w-full h-full" />
        </div>
      </div>

      <div className="absolute top-3 left-4 z-40 pointer-events-none">
        <p className="font-helvetica font-black text-xl text-white leading-none uppercase">{roomOf(room).name}</p>
        <p className="text-[11px] uppercase tracking-[0.2em] text-white/45 mt-1">{supabaseReady ? (connected ? `${population} ${population === 1 ? 'pessoa' : 'pessoas'}` : 'a ligar…') : 'offline'}</p>
      </div>

      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-40 flex gap-2">
        <button onClick={() => setShowRooms(s => !s)} className="text-[11px] font-mono uppercase tracking-widest text-white border border-white/25 bg-black/50 px-3 py-1.5 hover:bg-white hover:text-black transition-all">⤧ Salas</button>
        <button onClick={() => setInvOpen(true)} className="text-[11px] font-mono uppercase tracking-widest text-white border border-white/25 bg-black/50 px-3 py-1.5 hover:bg-white hover:text-black transition-all">☻ <span className="text-brandYellow">{CURRENCY_SYMBOL}{wallet.balance.toLocaleString('pt-PT')}</span></button>
        {!locked && <button onClick={() => { setDecorOpen(o => !o); setPlacingKind(null); setRemoveMode(false); }} className={`text-[11px] font-mono uppercase tracking-widest border px-3 py-1.5 transition-all ${decorOpen ? 'bg-brandYellow text-black border-brandYellow' : 'text-white border-white/25 bg-black/50 hover:bg-white hover:text-black'}`}>✦ Decorar</button>}
      </div>

      {(hint || placingKind || removeMode) && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-40 pointer-events-none text-[11px] font-mono uppercase tracking-widest bg-black/70 px-3 py-1" style={{ color: hint ? '#ff4e3e' : '#ffe65c' }}>
          {hint || (placingKind ? 'toca num tile · clica de novo para empilhar' : 'toca para remover')}
        </div>
      )}

      {decorOpen && !locked && (
        <div className="absolute z-40 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 w-full max-w-2xl px-3" style={{ bottom: 'calc(max(0.75rem, env(safe-area-inset-bottom)) + 56px)' }}>
          <p className="text-[10px] font-mono uppercase tracking-widest text-white/50">{isMod ? 'moderador · sem limite' : `os teus objetos: ${myCount}/${PLACE_CAP}`}</p>
          <div className="flex gap-1 overflow-x-auto w-full justify-start sm:justify-center pb-1">
            {CATS.map(c => (
              <button key={c.id} onClick={() => setCat(c.id)} className={`shrink-0 text-[10px] font-mono uppercase tracking-wider px-2 py-1 border ${cat === c.id ? 'border-brandYellow text-brandYellow' : 'border-white/15 text-white/55 hover:text-white'}`}>{c.name}</button>
            ))}
            <button onClick={() => { setRemoveMode(r => !r); setPlacingKind(null); }} className={`shrink-0 text-[10px] font-mono uppercase tracking-wider px-2 py-1 border ${removeMode ? 'border-brandRed text-brandRed' : 'border-white/15 text-white/55 hover:text-white'}`}>🗑️</button>
          </div>
          <div className="flex gap-2 overflow-x-auto w-full pb-1 justify-start sm:justify-center">
            {FURNI.filter(f => f.cat === cat).map(f => {
              const lockedFurni = isFurniPremium(f.kind) && !ownsFurni(f.kind) && !isMod;
              return (
                <button key={f.kind} onClick={() => {
                  if (lockedFurni) { const r = buyFurni(f.kind); flashHint(r.ok ? 'Comprado ✦ — toca outra vez' : (r.error || 'Sem Cristais')); return; }
                  setPlacingKind(k => k === f.kind ? null : f.kind); setRemoveMode(false);
                }} className={`relative shrink-0 flex flex-col items-center justify-center w-14 h-14 border text-[8px] gap-0.5 transition-colors ${placingKind === f.kind ? 'border-brandYellow bg-brandYellow/15 text-white' : lockedFurni ? 'border-white/15 bg-black/60 text-white/45 hover:border-brandYellow/50' : 'border-white/20 bg-black/60 text-white/80 hover:border-white/50'}`}>
                  <span className="text-lg leading-none">{f.emoji}</span><span className="uppercase tracking-wide leading-none text-center">{f.name}</span>
                  {lockedFurni && <span className="absolute top-0.5 right-0.5 text-[7px] font-bold text-brandYellow">{CURRENCY_SYMBOL}{furniPrice(f.kind)}</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {showRooms && (
        <div className="absolute inset-0 z-50 bg-black/70 flex items-center justify-center px-6" onClick={() => setShowRooms(false)}>
          <div className="w-full max-w-xs bg-black border border-white/15 p-5" onClick={e => e.stopPropagation()}>
            <p className="text-[11px] uppercase tracking-[0.3em] text-white/40 mb-3">Escolhe uma sala</p>
            <div className="flex flex-col gap-2">
              {ROOMS.map(r => (
                <button key={r.slug} onClick={() => switchRoom(r.slug)} className={`flex items-center gap-3 p-3 border transition-colors ${r.slug === room ? 'border-white bg-white/5' : 'border-white/15 hover:border-white/40'}`}>
                  <span className="w-4 h-4 rounded-full shrink-0" style={{ background: r.accent, boxShadow: `0 0 10px ${r.accent}` }} />
                  <span className="font-bold text-white">{r.name}</span>
                  {r.locked && <span className="text-[10px] uppercase tracking-widest text-white/40">🔒</span>}
                  {r.slug === room && <span className="ml-auto text-[10px] uppercase tracking-widest text-white/40">aqui</span>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="absolute left-3 z-40 pointer-events-none flex flex-col gap-1 max-w-[60%] sm:max-w-md" style={{ bottom: 'calc(max(0.75rem, env(safe-area-inset-bottom)) + 56px)' }}>
        {feed.map(m => (<p key={m.id} className="text-sm leading-tight" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.95)' }}><span className="text-brandYellow font-bold">{m.handle}</span><span className="text-white/90">: {m.text}</span></p>))}
      </div>

      <form onSubmit={e => { e.preventDefault(); say(msg); }} className="absolute bottom-0 inset-x-0 z-40 p-3 flex justify-center" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
        <div className="flex gap-2 w-full max-w-md">
          <input value={msg} onChange={e => setMsg(e.target.value)} maxLength={120} placeholder="diz algo…" className="flex-1 min-w-0 bg-black/60 border border-white/20 text-white px-3 py-2 text-sm outline-none focus:border-brandYellow rounded" />
          <button type="submit" className="bg-brandYellow text-black font-bold uppercase text-xs tracking-widest px-4 rounded active:scale-95 hover:bg-white transition-colors">Dizer</button>
        </div>
      </form>

      {onExit && <button onClick={onExit} className="absolute top-3 right-4 z-40 text-[11px] font-mono text-brandYellow border border-brandYellow bg-black/60 px-3 py-1.5 hover:bg-brandYellow hover:text-black transition-all">[ SAIR ]</button>}

      <InventoryModal open={invOpen} onClose={() => setInvOpen(false)} onEquip={equipAppearance} title="Personagem" />
    </div>
  );
};
