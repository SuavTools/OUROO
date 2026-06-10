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
import { CATS, FURNI, defOf, furniPrice, sitHeight, isRotatable } from '@/lib/furni';
import { type IconSpec, drawIconSpec, iconPrimaryColor } from '@/lib/icons';
import { resolveAppearance } from '@/lib/catalog';
import { ownsFurni, buyFurni, refreshWalletFromCloud, useWallet, CURRENCY_SYMBOL } from '@/lib/wallet';
import { InventoryModal } from '@/components/InventoryModal';
import { CatIcon, FurniSprite } from '@/components/UiIcon';
import { drawFurniSprite } from '@/lib/furniRender';

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
type Item = { id: string; kind: string; gx: number; gy: number; dir?: number; createdBy?: string };
// Direction is persisted inside the room_items `kind` text as `kind@dir` (no migration needed).
const encodeKind = (kind: string, dir: number) => (dir ? `${kind}@${dir}` : kind);
const decodeKind = (raw: string): { kind: string; dir: number } => { const i = raw.indexOf('@'); return i < 0 ? { kind: raw, dir: 0 } : { kind: raw.slice(0, i), dir: (Number(raw.slice(i + 1)) % 4 + 4) % 4 }; };
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
  const [rotateMode, setRotateMode] = useState(false);
  const [placeDir, setPlaceDir] = useState(0);
  const placeDirRef = useRef(0);
  useEffect(() => { placeDirRef.current = placeDir; }, [placeDir]);
  const [decorOpen, setDecorOpen] = useState(false);
  const [cat, setCat] = useState('tier1');
  const uiRef = useRef({ decorOpen: false, placingKind: null as string | null, removeMode: false, rotateMode: false });
  useEffect(() => { uiRef.current = { decorOpen, placingKind, removeMode, rotateMode }; }, [decorOpen, placingKind, removeMode, rotateMode]);
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
    remotesRef.current.clear(); itemsRef.current = []; setMyCount(0); setPlacingKind(null); setRemoveMode(false); setRotateMode(false); setDecorOpen(false);
    setRoom(slug);
  };

  // recompute the heightmap (walkable height + solid mask) from items
  const rebuildHeight = () => {
    const H = heightRef.current, S = solidRef.current; H.fill(0); S.fill(0);
    for (const it of itemsRef.current) {
      const d = defOf(it.kind); const [sw, sh] = d.span ?? [1, 1];
      for (let du = 0; du < sw; du++) for (let dv = 0; dv < sh; dv++) {
        const gx = it.gx + du, gy = it.gy + dv; if (gx >= GRID || gy >= GRID) continue;
        const k = key(gx, gy);
        if (d.walk) { H[k] += d.h; continue; }
        const sit = sitHeight(it.kind);   // seats: stand/sit ON them (walkable at sit height), not solid
        if (sit != null) H[k] = Math.max(H[k], sit); else S[k] = 1;
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
    if (!modRef.current && !ownsFurni(kind)) { flashHint('Compra primeiro ✦'); return; }
    if (itemsRef.current.length >= MAX_ITEMS) { flashHint('Sala cheia'); return; }
    const mine = itemsRef.current.filter(i => i.createdBy === selfRef.current.id).length;
    if (!modRef.current && mine >= PLACE_CAP) { flashHint(`Máximo ${PLACE_CAP} por pessoa`); return; }
    const [sw, sh] = defOf(kind).span ?? [1, 1];
    if (gx + sw > GRID || gy + sh > GRID) { flashHint('Não cabe aqui'); return; }
    const id = (crypto?.randomUUID?.() ?? `it_${Date.now()}_${Math.floor(Math.random() * 1e9)}`);
    const dir = isRotatable(kind) ? placeDirRef.current : 0;
    const item: Item = { id, kind, gx, gy, dir, createdBy: selfRef.current.id };
    itemsRef.current.push(item); setMyCount(c => c + 1); rebuildHeight();
    channelRef.current?.send({ type: 'broadcast', event: 'place', payload: { id, kind, gx, gy, dir, by: item.createdBy } });
    supabase?.from('room_items').insert({ id, room, kind: encodeKind(kind, dir), x: gx, y: gy, created_by: item.createdBy }).then(undefined, () => {});
  };
  // Rotate the top item on a tile (own items / mods) one 90° step.
  const rotateAt = (gx: number, gy: number) => {
    const hit = [...itemsRef.current].reverse().find(i => { const [sw, sh] = defOf(i.kind).span ?? [1, 1]; return gx >= i.gx && gx < i.gx + sw && gy >= i.gy && gy < i.gy + sh && (modRef.current || i.createdBy === selfRef.current.id); });
    if (!hit) return;
    if (!isRotatable(hit.kind)) { flashHint('Este objeto não roda'); return; }
    hit.dir = ((hit.dir ?? 0) + 1) % 4;
    channelRef.current?.send({ type: 'broadcast', event: 'rotate', payload: { id: hit.id, dir: hit.dir } });
    supabase?.from('room_items').update({ kind: encodeKind(hit.kind, hit.dir) }).eq('id', hit.id).then(undefined, () => {});
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
        itemsRef.current.push({ id, kind: String(pl.kind), gx: Number(pl.gx), gy: Number(pl.gy), dir: Number(pl.dir) || 0, createdBy: String(pl.by ?? '') }); rebuildHeight();
      })
      .on('broadcast', { event: 'rotate' }, ({ payload }) => { const pl = payload as Record<string, unknown>; const id = String(pl?.id ?? ''); const it = itemsRef.current.find(i => i.id === id); if (it) it.dir = Number(pl.dir) || 0; })
      .on('broadcast', { event: 'unplace' }, ({ payload }) => { const id = String((payload as Record<string, unknown>)?.id ?? ''); itemsRef.current = itemsRef.current.filter(i => i.id !== id); rebuildHeight(); })
      .subscribe(async status => {
        if (status === 'SUBSCRIBED') {
          setConnected(true);
          await ch.track({ id: me.id, handle: me.handle, skinId: me.skinId, icon: me.icon ?? undefined, fx: me.fx, fy: me.fy });
          const { data } = await supabase!.from('room_items').select('id,kind,x,y,created_by').eq('room', room).order('created_at');
          if (data) { itemsRef.current = data.map(d => { const dk = decodeKind(String(d.kind)); return { id: String(d.id), kind: dk.kind, dir: dk.dir, gx: Number(d.x), gy: Number(d.y), createdBy: String(d.created_by ?? '') }; }); setMyCount(itemsRef.current.filter(i => i.createdBy === me.id).length); rebuildHeight(); }
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
    // Furni sprites are drawn by the shared renderer in @/lib/furniRender (drawFurniSprite).

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
      if (ui.decorOpen && (ui.placingKind || ui.removeMode || ui.rotateMode) && hv) { const { sx, sy } = iso(hv.gx, hv.gy); diamond(sx, sy, TW, TH); ctx.fillStyle = hexA(ui.removeMode ? '#ff4e3e' : theme.accent, 0.3); ctx.fill(); ctx.strokeStyle = ui.removeMode ? '#ff4e3e' : theme.accent; ctx.lineWidth = 2; ctx.stroke(); }

      // depth-sorted furni + avatars
      const stack = new Map<string, number>();
      const ents: Array<{ s: number; draw: () => void }> = [];
      for (const it of itemsRef.current) { const k = `${it.gx},${it.gy}`; const gz = stack.get(k) ?? 0; const dd = defOf(it.kind); const [sw, sh] = dd.span ?? [1, 1]; stack.set(k, gz + (dd.h || 0)); const ii = it, z = gz; ents.push({ s: (it.gx + sw - 1) + (it.gy + sh - 1) + z * 0.01, draw: () => { const { sx, sy } = iso(ii.gx, ii.gy, z); drawFurniSprite(ctx, ii.kind, sx, sy, theme.accent, framesRef.current, ii.dir || 0); } }); }
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
    if (rotateMode) { rotateAt(gx, gy); return; }
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
        <div className="absolute z-40 left-1/2 -translate-x-1/2 w-full max-w-2xl px-2 sm:px-3" style={{ bottom: 'calc(max(0.75rem, env(safe-area-inset-bottom)) + 52px)' }}>
          <div className="bg-black/85 backdrop-blur-md border border-white/15 rounded-xl overflow-hidden shadow-2xl">
            {/* header: count + balance */}
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/10">
              <span className="text-[10px] font-mono uppercase tracking-widest text-white/50">{isMod ? 'moderador · sem limite' : `objetos ${myCount}/${PLACE_CAP}`}</span>
              <span className="text-[10px] font-mono uppercase tracking-widest text-brandYellow">{CURRENCY_SYMBOL} {wallet.balance.toLocaleString('pt-PT')}</span>
            </div>
            {/* category rail (self-drawn icons, no emojis) */}
            <div className="flex gap-0.5 overflow-x-auto px-2 py-1.5 border-b border-white/10">
              {CATS.map(c => {
                const on = cat === c.id && !removeMode;
                return (
                  <button key={c.id} onClick={() => { setCat(c.id); setRemoveMode(false); }} title={c.name}
                    className={`shrink-0 flex flex-col items-center gap-0.5 w-[3.1rem] py-1 rounded-lg transition-colors ${on ? 'bg-white/10' : 'hover:bg-white/5'}`}>
                    <CatIcon catId={c.id} size={22} color={on ? '#ffe65c' : '#cfd2dc'} />
                    <span className={`text-[7px] uppercase tracking-wide leading-none text-center ${on ? 'text-brandYellow' : 'text-white/50'}`}>{c.name.replace('★ ', '')}</span>
                  </button>
                );
              })}
              {(() => { const spin = !!(placingKind && isRotatable(placingKind)); const on = rotateMode || spin; return (
                <button onClick={() => { if (spin) { setPlaceDir(d => (d + 1) % 4); } else { setRotateMode(r => !r); setPlacingKind(null); setRemoveMode(false); } }} title="Rodar"
                  className={`shrink-0 flex flex-col items-center gap-0.5 w-[3.1rem] py-1 rounded-lg transition-colors ml-auto ${on ? 'bg-[#00cfff]/15' : 'hover:bg-white/5'}`}>
                  <CatIcon catId="rotate" size={22} color={on ? '#00cfff' : '#cfd2dc'} />
                  <span className={`text-[7px] uppercase tracking-wide leading-none ${on ? 'text-[#00cfff]' : 'text-white/50'}`}>{spin ? `Virar ${placeDir + 1}/4` : 'Rodar'}</span>
                </button>
              ); })()}
              <button onClick={() => { setRemoveMode(r => !r); setPlacingKind(null); setRotateMode(false); }} title="Remover"
                className={`shrink-0 flex flex-col items-center gap-0.5 w-[3.1rem] py-1 rounded-lg transition-colors ${removeMode ? 'bg-brandRed/20' : 'hover:bg-white/5'}`}>
                <CatIcon catId="remove" size={22} color={removeMode ? '#ff4e3e' : '#cfd2dc'} />
                <span className={`text-[7px] uppercase tracking-wide leading-none ${removeMode ? 'text-brandRed' : 'text-white/50'}`}>Remover</span>
              </button>
            </div>
            {/* item grid — 2 rows, horizontal scroll, drawn thumbnails + price/owned */}
            {removeMode ? (
              <p className="text-[11px] text-center text-brandRed/80 py-4 px-3">Toca num objeto para o remover.</p>
            ) : rotateMode ? (
              <p className="text-[11px] text-center text-[#00cfff]/90 py-4 px-3">Toca num assento para o rodar (cadeira · sofá · poltrona · trono).</p>
            ) : (
              <div className="grid grid-rows-2 grid-flow-col auto-cols-max gap-1.5 overflow-x-auto p-2" style={{ maxHeight: '9.5rem' }}>
                {FURNI.filter(f => f.cat === cat).map(f => {
                  const owned = ownsFurni(f.kind) || isMod;
                  const sel = placingKind === f.kind;
                  return (
                    <button key={f.kind} onClick={() => {
                      if (!owned) { const r = buyFurni(f.kind); flashHint(r.ok ? 'Comprado ✦ — toca para colocar' : (r.error || 'Sem Cristais')); return; }
                      setPlacingKind(k => k === f.kind ? null : f.kind); setRemoveMode(false); setRotateMode(false);
                    }} className={`relative flex flex-col items-center justify-start gap-0.5 w-[4rem] h-[4rem] border rounded-lg pt-1 transition-colors ${sel ? 'border-brandYellow bg-brandYellow/15' : owned ? 'border-white/12 bg-white/[0.03] hover:border-white/40' : 'border-white/10 bg-black/40 hover:border-brandYellow/50'}`}>
                      <FurniSprite kind={f.kind} size={38} accent={roomOf(room).accent} />
                      <span className="text-[7px] uppercase tracking-wide leading-none text-center text-white/65 truncate w-full px-0.5">{f.name}</span>
                      {!owned && <span className="absolute top-0.5 right-0.5 text-[7px] font-bold text-brandYellow bg-black/75 px-1 rounded">{CURRENCY_SYMBOL}{furniPrice(f.kind)}</span>}
                      {sel && <span className="absolute top-0.5 left-0.5 w-1.5 h-1.5 rounded-full bg-brandYellow" />}
                    </button>
                  );
                })}
              </div>
            )}
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
