'use client';

// OUROO PRAÇA — a tiny social room. Your vector skin walks where you tap; everyone else in
// the room shows up live via Supabase Realtime PRESENCE; speech bubbles float overhead via
// ephemeral BROADCAST. Nothing here touches the existing text chat or any table — presence and
// broadcast are in-memory only, so this is purely additive. All canvas + vectors, same engine
// feel (fixed 60Hz step, drawSkinShape avatars).

import React, { useEffect, useRef, useState } from 'react';
import { supabase, supabaseReady } from '@/lib/supabase';
import { getLocalPlayer } from '@/lib/leaderboard';
import { getAuthIdentity } from '@/lib/auth';
import { amIModerator } from '@/lib/chat';
import { drawSkinShape, skinById, getSelectedSkinId } from '@/lib/skins';

const STAGE_W = 1280, STAGE_H = 720;
// Floor area the avatars can stand in (a perspective slab); y doubles as depth.
const FLOOR_TOP = 312, FLOOR_BOT = 648;
const FLOOR_TOP_INSET = 360, FLOOR_BOT_INSET = 150;   // how far the trapezoid pinches in at top
const WALK_SPEED = 3.4;                                // px / 60Hz step
const BUBBLE_FRAMES = 60 * 6;                          // speech bubble lifetime

// The rooms you can hop between. Each is its own realtime channel (room:<slug>) with its own
// colour identity. Add more here — the switcher and theming pick them up automatically.
type RoomDef = { slug: string; name: string; accent: string; floor: string };
const ROOMS: RoomDef[] = [
  { slug: 'praca',   name: 'Praça',     accent: '#00cfff', floor: '#12121e' },
  { slug: 'disco',   name: 'Discoteca', accent: '#ff44aa', floor: '#1a0e1e' },
  { slug: 'lounge',  name: 'Lounge',    accent: '#ffd23a', floor: '#1a160e' },
  { slug: 'telhado', name: 'Telhado',   accent: '#1ED760', floor: '#0e1a14' },
  { slug: 'cave',    name: 'Cave',      accent: '#cc44ff', floor: '#140e1e' },
];
const roomOf = (slug: string) => ROOMS.find(r => r.slug === slug) ?? ROOMS[0];
// hex → rgba string (accents are 6-digit hex).
const hexA = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};
const freshSpawn = () => ({ x: STAGE_W / 2 + (Math.random() - 0.5) * 320, y: 500 + Math.random() * 120 });

// Furniture catalogue — vector items you can drop in a room. Each persists to room_items and
// syncs live over broadcast.
const FURNI: { kind: string; name: string; emoji: string }[] = [
  { kind: 'speaker', name: 'Coluna',     emoji: '🔈' },
  { kind: 'disco',   name: 'Bola Disco', emoji: '🪩' },
  { kind: 'plant',   name: 'Planta',     emoji: '🪴' },
  { kind: 'rug',     name: 'Tapete',     emoji: '🟪' },
  { kind: 'sofa',    name: 'Sofá',       emoji: '🛋️' },
  { kind: 'stool',   name: 'Banco',      emoji: '🪑' },
  { kind: 'sign',    name: 'Cartaz',     emoji: '🪧' },
];
const MAX_ITEMS = 80;     // hard cap per room (backstop)
const PLACE_CAP = 8;      // how many items one (non-moderator) person may have in a room
type Item = { id: string; kind: string; x: number; y: number; createdBy?: string };

type Avatar = {
  handle: string; skinId: string;
  x: number; y: number; tx: number; ty: number;        // pos + walk target
  bubble: string; bubbleLife: number; af: number;
};

// x-extent of the walkable floor at a given depth y (trapezoid → narrower at the back).
function floorXRange(y: number): [number, number] {
  const t = (y - FLOOR_TOP) / (FLOOR_BOT - FLOOR_TOP);
  const inset = FLOOR_TOP_INSET + (FLOOR_BOT_INSET - FLOOR_TOP_INSET) * t;
  return [inset, STAGE_W - inset];
}
const depthScale = (y: number) => 0.62 + ((y - FLOOR_TOP) / (FLOOR_BOT - FLOOR_TOP)) * 0.55;

export const RoomCanvas: React.FC<{ stageScale?: number; isMobileStage?: boolean; onExit?: () => void }> = ({
  stageScale = 1, isMobileStage = false, onExit,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef(0);
  const channelRef = useRef<ReturnType<NonNullable<typeof supabase>['channel']> | null>(null);
  // Spawn a little off-centre so two people who haven't moved yet don't perfectly overlap
  // (which reads as a single avatar). Random is fine here — it's just a cosmetic start spot.
  const spawnX = STAGE_W / 2 + (Math.random() - 0.5) * 320;
  const spawnY = 500 + Math.random() * 120;
  const selfRef = useRef<Avatar & { id: string }>({
    id: '', handle: 'Convidado', skinId: getSelectedSkinId(),
    x: spawnX, y: spawnY, tx: spawnX, ty: spawnY, bubble: '', bubbleLife: 0, af: 0,
  });
  const remotesRef = useRef<Map<string, Avatar>>(new Map());
  const posAccum = useRef(0);          // throttle for outgoing position broadcasts
  const wasMovingRef = useRef(false);
  const itemsRef = useRef<Item[]>([]);
  const framesRef = useRef(0);
  const modRef = useRef(false);        // moderators can remove anyone's furni
  const [placingKind, setPlacingKind] = useState<string | null>(null);
  const [removeMode, setRemoveMode] = useState(false);
  const [decorOpen, setDecorOpen] = useState(false);
  const [isMod, setIsMod] = useState(false);
  const [myCount, setMyCount] = useState(0);   // my items in this room (for the per-person cap)
  const [hint, setHint] = useState('');
  const flashHint = (t: string) => { setHint(t); setTimeout(() => setHint(''), 1900); };

  const [msg, setMsg] = useState('');
  const [population, setPopulation] = useState(1);
  const [connected, setConnected] = useState(false);
  const [feed, setFeed] = useState<{ id: number; handle: string; text: string }[]>([]);
  const feedId = useRef(0);
  const [room, setRoom] = useState('praca');
  const [showRooms, setShowRooms] = useState(false);
  const themeRef = useRef<RoomDef>(roomOf('praca'));
  useEffect(() => { themeRef.current = roomOf(room); }, [room]);

  // Hop to another room: drop the current crowd, respawn, and let the presence effect re-join
  // the new channel (it depends on `room`).
  const switchRoom = (slug: string) => {
    setShowRooms(false);
    if (slug === room) return;
    const sp = freshSpawn();
    const me = selfRef.current;
    me.x = sp.x; me.y = sp.y; me.tx = sp.x; me.ty = sp.y; me.bubble = ''; me.bubbleLife = 0;
    remotesRef.current.clear();
    itemsRef.current = []; setMyCount(0);
    setRoom(slug);
  };

  // ---- furniture: place (persist + broadcast) / remove (own or moderator) ----
  const placeItem = (kind: string, x: number, y: number) => {
    if (itemsRef.current.length >= MAX_ITEMS) { flashHint('Sala cheia'); return; }
    const mine = itemsRef.current.filter(i => i.createdBy === selfRef.current.id).length;
    if (!modRef.current && mine >= PLACE_CAP) { flashHint(`Máximo ${PLACE_CAP} objetos por pessoa`); return; }
    const ty = Math.max(FLOOR_TOP, Math.min(FLOOR_BOT, y));
    const [lo, hi] = floorXRange(ty);
    const tx = Math.max(lo, Math.min(hi, x));
    const id = (crypto?.randomUUID?.() ?? `it_${Date.now()}_${Math.floor(Math.random() * 1e9)}`);
    const item: Item = { id, kind, x: tx, y: ty, createdBy: selfRef.current.id };
    itemsRef.current.push(item);
    setMyCount(c => c + 1);
    channelRef.current?.send({ type: 'broadcast', event: 'place', payload: { id, kind, x: tx, y: ty, by: item.createdBy } });
    supabase?.from('room_items').insert({ id, room, kind, x: tx, y: ty, created_by: item.createdBy }).then(undefined, () => {});
  };
  const removeAt = (x: number, y: number) => {
    // topmost item under the tap that I'm allowed to remove (mine, or anyone's if moderator)
    const hit = [...itemsRef.current].reverse().find(i =>
      Math.abs(i.x - x) < 42 && Math.abs(i.y - y) < 54 && (modRef.current || i.createdBy === selfRef.current.id));
    if (!hit) return;
    itemsRef.current = itemsRef.current.filter(i => i.id !== hit.id);
    if (hit.createdBy === selfRef.current.id) setMyCount(c => Math.max(0, c - 1));
    channelRef.current?.send({ type: 'broadcast', event: 'unplace', payload: { id: hit.id } });
    supabase?.from('room_items').delete().eq('id', hit.id).then(undefined, () => {});
  };

  // Append to the readable chat feed (last few lines, auto-expire) so messages don't depend on
  // catching the floating bubble.
  const pushFeed = (handle: string, text: string) => {
    const id = ++feedId.current;
    setFeed(f => [...f.slice(-5), { id, handle, text }]);
    setTimeout(() => setFeed(f => f.filter(m => m.id !== id)), 9000);
  };

  // ---- broadcast a chat line + show it over my own head + log it ----
  const say = (raw: string) => {
    const text = raw.trim().slice(0, 120);
    if (!text) return;
    const me = selfRef.current;
    me.bubble = text; me.bubbleLife = BUBBLE_FRAMES;
    channelRef.current?.send({ type: 'broadcast', event: 'say', payload: { id: me.id, text } });
    pushFeed(me.handle, text);
    setMsg('');
  };

  // ---- identity + realtime presence ----
  useEffect(() => {
    const lp = getLocalPlayer();
    selfRef.current.id = lp.device || `guest_${Math.floor(Math.random() * 1e9)}`;
    selfRef.current.handle = lp.handle || 'Convidado';
    selfRef.current.skinId = getSelectedSkinId();
    // Refine with the signed-in name if there is one.
    getAuthIdentity().then(a => { if (a?.handle) selfRef.current.handle = a.handle; });
    amIModerator().then(m => { modRef.current = m; setIsMod(m); });

    if (!supabase) return;   // offline → still walk around solo
    const me = selfRef.current;
    remotesRef.current.clear(); itemsRef.current = []; setPopulation(1); setConnected(false);
    const ch = supabase.channel(`room:${room}`, {
      config: { presence: { key: me.id }, broadcast: { self: false } },
    });
    channelRef.current = ch;

    const rebuild = () => {
      const state = ch.presenceState() as Record<string, Array<Record<string, unknown>>>;
      const seen = new Set<string>([me.id]);
      for (const key in state) {
        const meta = state[key]?.[0]; if (!meta) continue;
        const id = String(meta.id ?? key);
        if (id === me.id) continue;
        seen.add(id);
        const mx = Number(meta.x), my = Number(meta.y);
        let r = remotesRef.current.get(id);
        if (!r) {
          r = { handle: String(meta.handle ?? '???'), skinId: String(meta.skinId ?? 'diamond-gold'),
                x: mx, y: my, tx: mx, ty: my, bubble: '', bubbleLife: 0, af: Math.random() * 100 };
          remotesRef.current.set(id, r);
        } else {
          // Identity may change; POSITION is driven by live 'pos' broadcasts, so don't clobber
          // tx/ty here with the (stale) presence value or the avatar snaps backwards.
          r.handle = String(meta.handle ?? r.handle); r.skinId = String(meta.skinId ?? r.skinId);
        }
      }
      for (const id of [...remotesRef.current.keys()]) if (!seen.has(id)) remotesRef.current.delete(id);
      setPopulation(remotesRef.current.size + 1);
    };

    ch.on('presence', { event: 'sync' }, rebuild)
      // live movement — broadcast is low-latency (presence would coalesce and look frozen)
      .on('broadcast', { event: 'pos' }, ({ payload }) => {
        const pl = payload as Record<string, unknown>;
        const id = String(pl?.id ?? ''); if (!id || id === me.id) return;
        const x = Number(pl.x), y = Number(pl.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        let r = remotesRef.current.get(id);
        if (!r) {
          r = { handle: '…', skinId: 'diamond-gold', x, y, tx: x, ty: y, bubble: '', bubbleLife: 0, af: Math.random() * 100 };
          remotesRef.current.set(id, r); setPopulation(remotesRef.current.size + 1);
        } else { r.tx = x; r.ty = y; }
      })
      .on('broadcast', { event: 'say' }, ({ payload }) => {
        const pl = payload as Record<string, unknown>;
        const id = String(pl?.id ?? ''); const text = String(pl?.text ?? '');
        if (!id || id === me.id || !text) return;
        const r = remotesRef.current.get(id);
        if (r) { r.bubble = text; r.bubbleLife = BUBBLE_FRAMES; }
        pushFeed(r?.handle ?? '???', text);
      })
      .on('broadcast', { event: 'place' }, ({ payload }) => {
        const pl = payload as Record<string, unknown>;
        const id = String(pl?.id ?? ''); if (!id || itemsRef.current.some(i => i.id === id)) return;
        itemsRef.current.push({ id, kind: String(pl.kind), x: Number(pl.x), y: Number(pl.y), createdBy: String(pl.by ?? '') });
      })
      .on('broadcast', { event: 'unplace' }, ({ payload }) => {
        const id = String((payload as Record<string, unknown>)?.id ?? '');
        itemsRef.current = itemsRef.current.filter(i => i.id !== id);
      })
      .subscribe(async status => {
        if (status === 'SUBSCRIBED') {
          setConnected(true);
          await ch.track({ id: me.id, handle: me.handle, skinId: me.skinId, x: me.x, y: me.y });
          // load this room's saved furniture (no-ops gracefully if the table isn't created yet)
          const { data } = await supabase!.from('room_items').select('id,kind,x,y,created_by').eq('room', room);
          if (data) {
            itemsRef.current = data.map(d => ({ id: String(d.id), kind: String(d.kind), x: Number(d.x), y: Number(d.y), createdBy: String(d.created_by ?? '') }));
            setMyCount(itemsRef.current.filter(i => i.createdBy === me.id).length);
          }
        }
      });

    // Mobile suspends the realtime socket when the PWA/tab is backgrounded (screen off, app
    // switch), which silently drops you from the room. Re-assert presence the moment we're
    // visible/online again so you rejoin instead of vanishing for everyone else.
    const onResume = () => {
      if (document.visibilityState !== 'visible' || !channelRef.current) return;
      const m = selfRef.current;
      channelRef.current.track({ id: m.id, handle: m.handle, skinId: m.skinId, x: Math.round(m.x), y: Math.round(m.y) });
    };
    document.addEventListener('visibilitychange', onResume);
    window.addEventListener('focus', onResume);
    window.addEventListener('online', onResume);

    return () => {
      setConnected(false);
      document.removeEventListener('visibilitychange', onResume);
      window.removeEventListener('focus', onResume);
      window.removeEventListener('online', onResume);
      supabase?.removeChannel(ch); channelRef.current = null;
    };
  }, [room]);

  // ---- main loop (fixed 60Hz step, like the games) ----
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false }) as CanvasRenderingContext2D; if (!ctx) return;
    canvas.width = STAGE_W; canvas.height = STAGE_H;

    const stepAvatar = (a: Avatar) => {
      const dx = a.tx - a.x, dy = a.ty - a.y;
      const d = Math.hypot(dx, dy);
      const moving = d > 1.5;
      if (moving) { const s = Math.min(WALK_SPEED, d); a.x += (dx / d) * s; a.y += (dy / d) * s; }
      a.af += moving ? 1 : 0.3;
      if (a.bubbleLife > 0) a.bubbleLife--;
      return moving;
    };

    const update = () => {
      framesRef.current++;
      const me = selfRef.current;
      const moving = Math.hypot(me.tx - me.x, me.ty - me.y) > 1.5;
      stepAvatar(me);
      const ch = channelRef.current;
      if (ch) {
        // Stream position while walking (~8.5/s, under the realtime rate limit).
        if (moving && ++posAccum.current >= 7) {
          posAccum.current = 0;
          ch.send({ type: 'broadcast', event: 'pos', payload: { id: me.id, x: Math.round(me.x), y: Math.round(me.y) } });
        }
        // On arrival: one final broadcast so watchers land on the exact spot, and record the
        // resting position in presence so anyone who joins later sees us where we actually are.
        if (wasMovingRef.current && !moving) {
          ch.send({ type: 'broadcast', event: 'pos', payload: { id: me.id, x: Math.round(me.x), y: Math.round(me.y) } });
          ch.track({ id: me.id, handle: me.handle, skinId: me.skinId, x: Math.round(me.x), y: Math.round(me.y) });
        }
      }
      wasMovingRef.current = moving;
      // Remotes ease toward their last broadcast position.
      for (const r of remotesRef.current.values()) {
        r.x += (r.tx - r.x) * 0.22; r.y += (r.ty - r.y) * 0.22;
        r.af += Math.hypot(r.tx - r.x, r.ty - r.y) > 1 ? 1 : 0.3;
        if (r.bubbleLife > 0) r.bubbleLife--;
      }
    };

    // Vector furniture. Drawn at the item's floor position, scaled by depth like avatars.
    const drawItem = (it: Item, theme: RoomDef) => {
      const sc = depthScale(it.y);
      const t = framesRef.current;
      ctx.save();
      ctx.translate(it.x, it.y);
      ctx.scale(sc, sc);
      if (it.kind !== 'rug') {   // grounded furni casts a soft shadow
        ctx.save(); ctx.globalAlpha = 0.32; ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.ellipse(0, 0, 24, 7, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      }
      switch (it.kind) {
        case 'rug': {
          ctx.globalAlpha = 0.5; ctx.fillStyle = theme.accent;
          ctx.beginPath(); ctx.ellipse(0, 0, 60, 22, 0, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 0.9; ctx.lineWidth = 3; ctx.strokeStyle = '#fff';
          ctx.beginPath(); ctx.ellipse(0, 0, 52, 18, 0, 0, Math.PI * 2); ctx.stroke();
          break;
        }
        case 'speaker': {
          ctx.fillStyle = '#15151f'; ctx.strokeStyle = theme.accent; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.roundRect(-20, -70, 40, 70, 4); ctx.fill(); ctx.stroke();
          ctx.fillStyle = '#0a0a12';
          for (const [cy, r] of [[-50, 12], [-22, 16]] as [number, number][]) { ctx.beginPath(); ctx.arc(0, cy, r, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = theme.accent; ctx.lineWidth = 1.5; ctx.stroke(); }
          // pulsing cone glow
          ctx.globalAlpha = 0.25 + Math.abs(Math.sin(t * 0.15)) * 0.3; ctx.fillStyle = theme.accent;
          ctx.beginPath(); ctx.arc(0, -22, 8, 0, Math.PI * 2); ctx.fill();
          break;
        }
        case 'disco': {
          ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(0, -86); ctx.lineTo(0, -54); ctx.stroke();
          const R = 26;
          ctx.save(); ctx.translate(0, -28); ctx.rotate(t * 0.04);
          const grd = ctx.createRadialGradient(-8, -8, 4, 0, 0, R);
          grd.addColorStop(0, '#ffffff'); grd.addColorStop(1, '#8893b8');
          ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill();
          for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + t * 0.04; ctx.fillStyle = `hsla(${(t * 4 + i * 60) % 360},90%,65%,0.9)`; ctx.beginPath(); ctx.arc(Math.cos(a) * R * 0.6, Math.sin(a) * R * 0.6, 4, 0, Math.PI * 2); ctx.fill(); }
          ctx.restore();
          break;
        }
        case 'plant': {
          ctx.fillStyle = '#b5552e'; ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(14, 0); ctx.lineTo(10, -22); ctx.lineTo(-10, -22); ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#1ED760';
          for (const dx of [-10, 0, 10]) { ctx.beginPath(); ctx.ellipse(dx, -34, 7, 18, dx * 0.04, 0, Math.PI * 2); ctx.fill(); }
          break;
        }
        case 'sofa': {
          ctx.fillStyle = '#3a2a55'; ctx.strokeStyle = theme.accent; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.roundRect(-42, -28, 84, 30, 8); ctx.fill(); ctx.stroke();   // back
          ctx.fillStyle = '#4a3768'; ctx.beginPath(); ctx.roundRect(-46, -12, 92, 18, 8); ctx.fill();   // seat
          ctx.beginPath(); ctx.roundRect(-46, -22, 10, 24, 4); ctx.fill(); ctx.beginPath(); ctx.roundRect(36, -22, 10, 24, 4); ctx.fill();
          break;
        }
        case 'stool': {
          ctx.strokeStyle = '#888'; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(-7, -14); ctx.moveTo(10, 0); ctx.lineTo(7, -14); ctx.stroke();
          ctx.fillStyle = theme.accent; ctx.beginPath(); ctx.ellipse(0, -16, 14, 6, 0, 0, Math.PI * 2); ctx.fill();
          break;
        }
        case 'sign': {
          ctx.strokeStyle = '#666'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -34); ctx.stroke();
          ctx.fillStyle = '#0a0a12'; ctx.strokeStyle = theme.accent; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.roundRect(-30, -66, 60, 34, 4); ctx.fill(); ctx.stroke();
          ctx.fillStyle = theme.accent; ctx.font = '900 18px Helvetica, Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText('SUAV', 0, -49);
          break;
        }
      }
      ctx.restore();
    };

    const drawAvatar = (a: Avatar, isSelf: boolean) => {
      const sk = skinById(a.skinId);
      const sc = depthScale(a.y);
      // soft contact shadow + accent foot-glow
      ctx.save();
      ctx.fillStyle = '#000'; ctx.globalAlpha = 0.4;
      ctx.beginPath(); ctx.ellipse(a.x, a.y, 24 * sc, 8 * sc, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.5; ctx.fillStyle = sk.color; ctx.shadowColor = sk.color; ctx.shadowBlur = 16 * sc;
      ctx.beginPath(); ctx.ellipse(a.x, a.y, 15 * sc, 4.5 * sc, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      // body (bob while walking)
      const bob = Math.sin(a.af * 0.3) * 3 * sc * (Math.hypot(a.tx - a.x, a.ty - a.y) > 1 ? 1 : 0);
      ctx.save();
      ctx.translate(a.x, a.y - 30 * sc + bob);
      ctx.scale(sc, sc);
      ctx.shadowColor = sk.color; ctx.shadowBlur = isSelf ? 22 : 12;
      drawSkinShape(ctx, sk.shape, sk.color, 40, 54, a.af);
      ctx.restore();
      // name plate (rounded pill)
      ctx.save();
      ctx.font = `700 ${Math.round(11 * sc)}px Helvetica, Arial, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const nw = ctx.measureText(a.handle).width + 14 * sc, nh = 17 * sc, ny = a.y + 14 * sc;
      ctx.fillStyle = 'rgba(8,8,14,0.7)';
      ctx.beginPath(); ctx.roundRect(a.x - nw / 2, ny - nh / 2, nw, nh, nh / 2); ctx.fill();
      if (isSelf) { ctx.strokeStyle = hexA(sk.color, 0.8); ctx.lineWidth = 1; ctx.stroke(); }
      ctx.fillStyle = isSelf ? sk.color : 'rgba(255,255,255,0.82)';
      ctx.fillText(a.handle, a.x, ny);
      ctx.restore();
      // speech bubble
      if (a.bubbleLife > 0 && a.bubble) {
        const alpha = Math.min(1, a.bubbleLife / 30);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.font = '600 16px Helvetica, Arial, sans-serif';
        const tw = ctx.measureText(a.bubble).width;
        const bw = tw + 24, bh = 30, bx = a.x - bw / 2, by = a.y - 78 * sc;
        ctx.fillStyle = 'rgba(10,10,18,0.92)'; ctx.strokeStyle = sk.color; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 8); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(a.x - 6, by + bh); ctx.lineTo(a.x + 6, by + bh); ctx.lineTo(a.x, by + bh + 8); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(a.bubble, a.x, by + bh / 2);
        ctx.restore();
      }
    };

    const draw = () => {
      const theme = themeRef.current;
      const t = framesRef.current;
      // ---- deep background ----
      const bg = ctx.createLinearGradient(0, 0, 0, STAGE_H);
      bg.addColorStop(0, '#08080e'); bg.addColorStop(0.55, '#0b0912'); bg.addColorStop(1, '#0a0610');
      ctx.fillStyle = bg; ctx.fillRect(0, 0, STAGE_W, STAGE_H);

      // ---- back wall: accent haze near the horizon + slow dust motes + neon sign ----
      const wall = ctx.createLinearGradient(0, 0, 0, FLOOR_TOP);
      wall.addColorStop(0, 'rgba(255,255,255,0)'); wall.addColorStop(1, hexA(theme.accent, 0.06));
      ctx.fillStyle = wall; ctx.fillRect(0, 0, STAGE_W, FLOOR_TOP + 30);
      ctx.save(); ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 26; i++) {
        const mx = (i * 197.3) % STAGE_W;
        const my = (i * 71 + t * (0.12 + (i % 4) * 0.05)) % (FLOOR_TOP + 60);
        ctx.globalAlpha = 0.03 + (i % 5) * 0.012;
        ctx.fillRect(mx, FLOOR_TOP + 50 - my, 2, 2);
      }
      ctx.restore();
      ctx.save();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = '900 64px Helvetica, Arial, sans-serif';
      ctx.shadowColor = theme.accent; ctx.shadowBlur = 30; ctx.fillStyle = hexA(theme.accent, 0.92);
      ctx.fillText(theme.name.toUpperCase(), STAGE_W / 2, FLOOR_TOP * 0.4);
      ctx.shadowBlur = 0; ctx.font = '700 13px monospace'; ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.fillText('· S U A V ·', STAGE_W / 2, FLOOR_TOP * 0.4 + 42);
      ctx.restore();

      // ---- tiled perspective floor ----
      const [tl, tr] = floorXRange(FLOOR_TOP);
      const [bl, br] = floorXRange(FLOOR_BOT);
      const ROWS = 8, COLS = 12;
      ctx.save();
      ctx.beginPath(); ctx.moveTo(tl, FLOOR_TOP); ctx.lineTo(tr, FLOOR_TOP); ctx.lineTo(br, FLOOR_BOT); ctx.lineTo(bl, FLOOR_BOT); ctx.closePath();
      ctx.fillStyle = theme.floor; ctx.fill();
      ctx.clip();
      for (let r = 0; r < ROWS; r++) {
        const yA = FLOOR_TOP + (FLOOR_BOT - FLOOR_TOP) * (r / ROWS);
        const yB = FLOOR_TOP + (FLOOR_BOT - FLOOR_TOP) * ((r + 1) / ROWS);
        const [aL, aR] = floorXRange(yA); const [bL2, bR2] = floorXRange(yB);
        for (let c = 0; c < COLS; c++) {
          const f0 = c / COLS, f1 = (c + 1) / COLS;
          ctx.beginPath();
          ctx.moveTo(aL + (aR - aL) * f0, yA); ctx.lineTo(aL + (aR - aL) * f1, yA);
          ctx.lineTo(bL2 + (bR2 - bL2) * f1, yB); ctx.lineTo(bL2 + (bR2 - bL2) * f0, yB); ctx.closePath();
          ctx.fillStyle = (r + c) % 2 ? 'rgba(255,255,255,0.028)' : 'rgba(0,0,0,0.20)';
          ctx.fill();
        }
      }
      // pool of accent light on the floor
      const pool = ctx.createRadialGradient(STAGE_W / 2, FLOOR_BOT - 60, 30, STAGE_W / 2, FLOOR_BOT - 60, 540);
      pool.addColorStop(0, hexA(theme.accent, 0.12)); pool.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = pool; ctx.fillRect(0, FLOOR_TOP, STAGE_W, FLOOR_BOT - FLOOR_TOP + 4);
      // faint accent grout
      ctx.globalAlpha = 0.09; ctx.strokeStyle = theme.accent; ctx.lineWidth = 1;
      for (let r = 0; r <= ROWS; r++) { const y = FLOOR_TOP + (FLOOR_BOT - FLOOR_TOP) * (r / ROWS); const [a, b] = floorXRange(y); ctx.beginPath(); ctx.moveTo(a, y); ctx.lineTo(b, y); ctx.stroke(); }
      for (let c = 0; c <= COLS; c++) { const f = c / COLS; ctx.beginPath(); ctx.moveTo(tl + (tr - tl) * f, FLOOR_TOP); ctx.lineTo(bl + (br - bl) * f, FLOOR_BOT); ctx.stroke(); }
      ctx.restore();

      // ---- floor slab thickness + glowing front edge ----
      const THICK = 18;
      ctx.save();
      ctx.fillStyle = '#06060b';
      ctx.beginPath(); ctx.moveTo(bl, FLOOR_BOT); ctx.lineTo(br, FLOOR_BOT); ctx.lineTo(br, FLOOR_BOT + THICK); ctx.lineTo(bl, FLOOR_BOT + THICK); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 0.9; ctx.strokeStyle = theme.accent; ctx.lineWidth = 3; ctx.shadowColor = theme.accent; ctx.shadowBlur = 16;
      ctx.beginPath(); ctx.moveTo(bl, FLOOR_BOT); ctx.lineTo(br, FLOOR_BOT); ctx.stroke();
      ctx.restore();

      // flat items (rugs) lie ON the floor, under everyone
      for (const it of itemsRef.current) if (it.kind === 'rug') drawItem(it, theme);

      // standing furni + avatars, painter-sorted back→front so nearer things overlap farther
      const ents: Array<{ y: number; draw: () => void }> = [];
      ents.push({ y: selfRef.current.y, draw: () => drawAvatar(selfRef.current, true) });
      for (const r of remotesRef.current.values()) { const rr = r; ents.push({ y: rr.y, draw: () => drawAvatar(rr, false) }); }
      for (const it of itemsRef.current) { if (it.kind === 'rug') continue; const ii = it; ents.push({ y: ii.y, draw: () => drawItem(ii, theme) }); }
      ents.sort((p, q) => p.y - q.y);
      for (const e of ents) e.draw();

      // ---- vignette: darken the edges to focus the room ----
      const vig = ctx.createRadialGradient(STAGE_W / 2, STAGE_H * 0.54, STAGE_H * 0.32, STAGE_W / 2, STAGE_H * 0.54, STAGE_H * 0.82);
      vig.addColorStop(0, 'rgba(0,0,0,0)'); vig.addColorStop(1, 'rgba(0,0,0,0.5)');
      ctx.fillStyle = vig; ctx.fillRect(0, 0, STAGE_W, STAGE_H);
    };

    // fixed 60Hz accumulator (refresh-rate independent walk speed)
    let last = 0, acc = 0; const STEP = 1000 / 60;
    const loop = (now: number) => {
      rafRef.current = requestAnimationFrame(loop);
      if (last === 0) last = now;
      let dt = now - last; last = now;
      if (dt > 250) dt = 250;
      acc += dt; let n = 0;
      while (acc >= STEP && n < 5) { update(); acc -= STEP; n++; }
      draw();
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  // tap/click the floor to walk there
  const onPointerDown = (e: React.PointerEvent) => {
    const canvas = canvasRef.current; if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * STAGE_W;
    const y = ((e.clientY - rect.top) / rect.height) * STAGE_H;
    if (placingKind) { placeItem(placingKind, x, y); return; }   // decorating → drop furni
    if (removeMode) { removeAt(x, y); return; }                  // editing → pick up furni
    const ty = Math.max(FLOOR_TOP, Math.min(FLOOR_BOT, y));      // else → walk there
    const [lo, hi] = floorXRange(ty);
    selfRef.current.tx = Math.max(lo, Math.min(hi, x));
    selfRef.current.ty = ty;
  };

  return (
    <div className="relative w-full h-full select-none overflow-hidden bg-black"
      style={{ touchAction: 'none', WebkitUserSelect: 'none', userSelect: 'none' }}>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="relative shrink-0 origin-center"
          style={isMobileStage ? { width: STAGE_W, height: STAGE_H, transform: `scale(${stageScale})` } : { width: '100%', height: '100%' }}>
          <canvas ref={canvasRef} onPointerDown={onPointerDown} className="absolute inset-0 block w-full h-full" />
        </div>
      </div>

      {/* top bar: current room + population */}
      <div className="absolute top-3 left-4 z-40 pointer-events-none">
        <p className="font-helvetica font-black text-xl text-white leading-none uppercase">{roomOf(room).name}</p>
        <p className="text-[11px] uppercase tracking-[0.2em] text-white/45 mt-1">
          {supabaseReady ? (connected ? `${population} ${population === 1 ? 'pessoa' : 'pessoas'}` : 'a ligar…') : 'offline'}
        </p>
      </div>

      {/* room switcher + decorate toggle */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-40 flex gap-2">
        <button onClick={() => setShowRooms(s => !s)}
          className="text-[11px] font-mono uppercase tracking-widest text-white border border-white/25 bg-black/50 px-3 py-1.5 hover:bg-white hover:text-black transition-all">
          ⤧ Salas
        </button>
        <button onClick={() => { setDecorOpen(o => !o); setPlacingKind(null); setRemoveMode(false); }}
          className={`text-[11px] font-mono uppercase tracking-widest border px-3 py-1.5 transition-all ${decorOpen ? 'bg-brandYellow text-black border-brandYellow' : 'text-white border-white/25 bg-black/50 hover:bg-white hover:text-black'}`}>
          ✦ Decorar
        </button>
      </div>

      {/* mode banner / hint */}
      {(hint || placingKind || removeMode) && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-40 pointer-events-none text-[11px] font-mono uppercase tracking-widest bg-black/70 px-3 py-1"
          style={{ color: hint ? '#ff4e3e' : '#ffe65c' }}>
          {hint || (placingKind ? 'toca para colocar' : 'toca para remover')}
        </div>
      )}

      {/* furni tray */}
      {decorOpen && (
        <div className="absolute z-40 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 px-3 max-w-[94%]"
          style={{ bottom: 'calc(max(0.75rem, env(safe-area-inset-bottom)) + 56px)' }}>
          <p className="text-[10px] font-mono uppercase tracking-widest text-white/50">
            {isMod ? 'moderador · sem limite' : `os teus objetos: ${myCount}/${PLACE_CAP}`}
          </p>
          <div className="flex flex-wrap justify-center gap-2">
          {FURNI.map(f => (
            <button key={f.kind}
              onClick={() => { setPlacingKind(k => k === f.kind ? null : f.kind); setRemoveMode(false); }}
              className={`flex flex-col items-center justify-center w-16 h-16 border text-[10px] gap-1 transition-colors ${placingKind === f.kind ? 'border-brandYellow bg-brandYellow/15 text-white' : 'border-white/20 bg-black/60 text-white/80 hover:border-white/50'}`}>
              <span className="text-xl leading-none">{f.emoji}</span>
              <span className="uppercase tracking-wider">{f.name}</span>
            </button>
          ))}
          <button onClick={() => { setRemoveMode(r => !r); setPlacingKind(null); }}
            className={`flex flex-col items-center justify-center w-16 h-16 border text-[10px] gap-1 transition-colors ${removeMode ? 'border-brandRed bg-brandRed/20 text-white' : 'border-white/20 bg-black/60 text-white/80 hover:border-white/50'}`}>
            <span className="text-xl leading-none">🗑️</span>
            <span className="uppercase tracking-wider">Remover</span>
          </button>
          </div>
        </div>
      )}
      {showRooms && (
        <div className="absolute inset-0 z-50 bg-black/70 flex items-center justify-center px-6" onClick={() => setShowRooms(false)}>
          <div className="w-full max-w-xs bg-black border border-white/15 p-5" onClick={e => e.stopPropagation()}>
            <p className="text-[11px] uppercase tracking-[0.3em] text-white/40 mb-3">Escolhe uma sala</p>
            <div className="flex flex-col gap-2">
              {ROOMS.map(r => (
                <button key={r.slug} onClick={() => switchRoom(r.slug)}
                  className={`flex items-center gap-3 p-3 border transition-colors ${r.slug === room ? 'border-white bg-white/5' : 'border-white/15 hover:border-white/40'}`}>
                  <span className="w-4 h-4 rounded-full shrink-0" style={{ background: r.accent, boxShadow: `0 0 10px ${r.accent}` }} />
                  <span className="font-bold text-white">{r.name}</span>
                  {r.slug === room && <span className="ml-auto text-[10px] uppercase tracking-widest text-white/40">aqui</span>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* readable chat feed — last few lines, auto-expire (so you don't have to catch a bubble) */}
      <div className="absolute left-3 z-40 pointer-events-none flex flex-col gap-1 max-w-[70%] sm:max-w-md"
        style={{ bottom: 'calc(max(0.75rem, env(safe-area-inset-bottom)) + 56px)' }}>
        {feed.map(m => (
          <p key={m.id} className="text-sm leading-tight" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.95)' }}>
            <span className="text-brandYellow font-bold">{m.handle}</span>
            <span className="text-white/90">: {m.text}</span>
          </p>
        ))}
      </div>

      {/* chat line — ephemeral bubbles only; does NOT touch the real chat */}
      <form onSubmit={e => { e.preventDefault(); say(msg); }}
        className="absolute bottom-0 inset-x-0 z-40 p-3 flex justify-center"
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
        <div className="flex gap-2 w-full max-w-md">
          <input value={msg} onChange={e => setMsg(e.target.value)} maxLength={120} placeholder="diz algo…"
            className="flex-1 min-w-0 bg-black/60 border border-white/20 text-white px-3 py-2 text-sm outline-none focus:border-brandYellow rounded" />
          <button type="submit" className="bg-brandYellow text-black font-bold uppercase text-xs tracking-widest px-4 rounded active:scale-95 hover:bg-white transition-colors">Dizer</button>
        </div>
      </form>

      {onExit && (
        <button onClick={onExit}
          className="absolute top-3 right-4 z-40 text-[11px] font-mono text-brandYellow border border-brandYellow bg-black/60 px-3 py-1.5 hover:bg-brandYellow hover:text-black transition-all">
          [ SAIR ]
        </button>
      )}
    </div>
  );
};
