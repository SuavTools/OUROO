'use client';

// OUROO PRAÇA — isometric social room. A real tile grid: your skin walks tile-to-tile, furni
// snaps to tiles and STACKS vertically so you can actually build. Everyone shows up live via
// Supabase presence; movement/chat/furni sync over broadcast; furni persists in room_items.
// Some rooms are locked (curated — vibe only). Nothing here touches the text chat.

import React, { useEffect, useRef, useState } from 'react';
import { supabase, supabaseReady } from '@/lib/supabase';
import { getLocalPlayer } from '@/lib/leaderboard';
import { getAuthIdentity } from '@/lib/auth';
import { amIModerator } from '@/lib/chat';
import { drawSkinShape, skinById, getSelectedSkinId } from '@/lib/skins';
import { validateMessage } from '@/lib/names';

const STAGE_W = 1280, STAGE_H = 720;
const GRID = 11;                       // tiles per side
const TILE_W = 64, TILE_H = 32;        // iso diamond size
const TW = TILE_W / 2, TH = TILE_H / 2;
const STACK_H = 26;                    // pixels per stack level (vertical)
const ORIGIN_X = STAGE_W / 2, ORIGIN_Y = 236;
const WALL_H = 3;                      // wall height in stack units
const WALK = 0.085;                    // tiles per 60Hz step
const BUBBLE_FRAMES = 60 * 6;

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

// furni: per-kind stack height (rug/disco don't raise the stack)
const FURNI: { kind: string; name: string; emoji: string }[] = [
  { kind: 'block',   name: 'Bloco',     emoji: '🧊' },
  { kind: 'speaker', name: 'Coluna',    emoji: '🔈' },
  { kind: 'disco',   name: 'Bola',      emoji: '🪩' },
  { kind: 'plant',   name: 'Planta',    emoji: '🪴' },
  { kind: 'rug',     name: 'Tapete',    emoji: '🟪' },
  { kind: 'sofa',    name: 'Sofá',      emoji: '🛋️' },
  { kind: 'stool',   name: 'Banco',     emoji: '🪑' },
  { kind: 'sign',    name: 'Cartaz',    emoji: '🪧' },
];
const FURNI_H: Record<string, number> = { block: 1, speaker: 2, disco: 0, plant: 1, rug: 0, sofa: 1, stool: 1, sign: 1 };
const MAX_ITEMS = 120;
const PLACE_CAP = 12;
type Item = { id: string; kind: string; gx: number; gy: number; createdBy?: string };
type Avatar = { handle: string; skinId: string; fx: number; fy: number; tx: number; ty: number; bubble: string; bubbleLife: number; af: number };

const hexA = (hex: string, a: number) => { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };
const shade = (hex: string, f: number) => { const n = parseInt(hex.slice(1), 16); const r = Math.min(255, Math.round(((n >> 16) & 255) * f)), g = Math.min(255, Math.round(((n >> 8) & 255) * f)), b = Math.min(255, Math.round((n & 255) * f)); return `rgb(${r},${g},${b})`; };
const iso = (gx: number, gy: number, gz = 0) => ({ sx: ORIGIN_X + (gx - gy) * TW, sy: ORIGIN_Y + (gx + gy) * TH - gz * STACK_H });
const screenToTile = (sx: number, sy: number) => { const a = (sx - ORIGIN_X) / TW, b = (sy - ORIGIN_Y) / TH; return { gx: (a + b) / 2, gy: (b - a) / 2 }; };
const clampTile = (v: number) => Math.max(0, Math.min(GRID - 1, Math.round(v)));

export const RoomCanvas: React.FC<{ stageScale?: number; isMobileStage?: boolean; onExit?: () => void }> = ({
  stageScale = 1, isMobileStage = false, onExit,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef(0);
  const channelRef = useRef<ReturnType<NonNullable<typeof supabase>['channel']> | null>(null);
  const selfRef = useRef<Avatar & { id: string }>({
    id: '', handle: 'Convidado', skinId: getSelectedSkinId(),
    fx: GRID / 2, fy: GRID / 2, tx: GRID / 2, ty: GRID / 2, bubble: '', bubbleLife: 0, af: 0,
  });
  const remotesRef = useRef<Map<string, Avatar>>(new Map());
  const itemsRef = useRef<Item[]>([]);
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
  const uiRef = useRef({ decorOpen: false, placingKind: null as string | null, removeMode: false });
  useEffect(() => { uiRef.current = { decorOpen, placingKind, removeMode }; }, [decorOpen, placingKind, removeMode]);
  const [isMod, setIsMod] = useState(false);
  const [myCount, setMyCount] = useState(0);
  const [hint, setHint] = useState('');
  const flashHint = (t: string) => { setHint(t); setTimeout(() => setHint(''), 1900); };
  const locked = roomOf(room).locked && !isMod;

  const pushFeed = (handle: string, text: string) => {
    const id = ++feedId.current;
    setFeed(f => [...f.slice(-5), { id, handle, text }]);
    setTimeout(() => setFeed(f => f.filter(m => m.id !== id)), 9000);
  };
  const say = (raw: string) => {
    // Same filter as the real chat — length + slur/hate blocklist + link allowlist.
    const v = validateMessage(raw);
    if (!v.ok) { flashHint(v.error); return; }
    const text = v.value.slice(0, 120);
    const me = selfRef.current; me.bubble = text; me.bubbleLife = BUBBLE_FRAMES;
    channelRef.current?.send({ type: 'broadcast', event: 'say', payload: { id: me.id, text } });
    pushFeed(me.handle, text); setMsg('');
  };
  const switchRoom = (slug: string) => {
    setShowRooms(false); if (slug === room) return;
    const me = selfRef.current; me.fx = GRID / 2; me.fy = GRID / 2; me.tx = GRID / 2; me.ty = GRID / 2; me.bubble = ''; me.bubbleLife = 0;
    remotesRef.current.clear(); itemsRef.current = []; setMyCount(0);
    setPlacingKind(null); setRemoveMode(false); setDecorOpen(false);
    setRoom(slug);
  };

  // ---- furniture ----
  const placeItem = (kind: string, gx: number, gy: number) => {
    if (roomOf(room).locked && !modRef.current) { flashHint('Sala bloqueada'); return; }
    if (itemsRef.current.length >= MAX_ITEMS) { flashHint('Sala cheia'); return; }
    const mine = itemsRef.current.filter(i => i.createdBy === selfRef.current.id).length;
    if (!modRef.current && mine >= PLACE_CAP) { flashHint(`Máximo ${PLACE_CAP} por pessoa`); return; }
    const id = (crypto?.randomUUID?.() ?? `it_${Date.now()}_${Math.floor(Math.random() * 1e9)}`);
    const item: Item = { id, kind, gx, gy, createdBy: selfRef.current.id };
    itemsRef.current.push(item); setMyCount(c => c + 1);
    channelRef.current?.send({ type: 'broadcast', event: 'place', payload: { id, kind, gx, gy, by: item.createdBy } });
    supabase?.from('room_items').insert({ id, room, kind, x: gx, y: gy, created_by: item.createdBy }).then(undefined, () => {});
  };
  const removeAt = (gx: number, gy: number) => {
    const hit = [...itemsRef.current].reverse().find(i => i.gx === gx && i.gy === gy && (modRef.current || i.createdBy === selfRef.current.id));
    if (!hit) return;
    itemsRef.current = itemsRef.current.filter(i => i.id !== hit.id);
    if (hit.createdBy === selfRef.current.id) setMyCount(c => Math.max(0, c - 1));
    channelRef.current?.send({ type: 'broadcast', event: 'unplace', payload: { id: hit.id } });
    supabase?.from('room_items').delete().eq('id', hit.id).then(undefined, () => {});
  };

  // ---- identity + realtime ----
  useEffect(() => {
    const lp = getLocalPlayer();
    selfRef.current.id = lp.device || `guest_${Math.floor(Math.random() * 1e9)}`;
    selfRef.current.handle = lp.handle || 'Convidado';
    selfRef.current.skinId = getSelectedSkinId();
    getAuthIdentity().then(a => { if (a?.handle) selfRef.current.handle = a.handle; });
    amIModerator().then(m => { modRef.current = m; setIsMod(m); });

    if (!supabase) return;
    const me = selfRef.current;
    remotesRef.current.clear(); itemsRef.current = []; setPopulation(1); setConnected(false);
    const ch = supabase.channel(`room:${room}`, { config: { presence: { key: me.id }, broadcast: { self: false } } });
    channelRef.current = ch;

    const rebuild = () => {
      const state = ch.presenceState() as Record<string, Array<Record<string, unknown>>>;
      const seen = new Set<string>([me.id]);
      for (const key in state) {
        const meta = state[key]?.[0]; if (!meta) continue;
        const id = String(meta.id ?? key); if (id === me.id) continue;
        seen.add(id);
        const fx = Number(meta.fx), fy = Number(meta.fy);
        let r = remotesRef.current.get(id);
        if (!r) remotesRef.current.set(id, { handle: String(meta.handle ?? '???'), skinId: String(meta.skinId ?? 'diamond-gold'), fx, fy, tx: fx, ty: fy, bubble: '', bubbleLife: 0, af: Math.random() * 100 });
        else { r.handle = String(meta.handle ?? r.handle); r.skinId = String(meta.skinId ?? r.skinId); }
      }
      for (const id of [...remotesRef.current.keys()]) if (!seen.has(id)) remotesRef.current.delete(id);
      setPopulation(remotesRef.current.size + 1);
    };

    ch.on('presence', { event: 'sync' }, rebuild)
      .on('broadcast', { event: 'pos' }, ({ payload }) => {
        const pl = payload as Record<string, unknown>; const id = String(pl?.id ?? ''); if (!id || id === me.id) return;
        const fx = Number(pl.fx), fy = Number(pl.fy); if (!Number.isFinite(fx) || !Number.isFinite(fy)) return;
        let r = remotesRef.current.get(id);
        if (!r) { r = { handle: '…', skinId: 'diamond-gold', fx, fy, tx: fx, ty: fy, bubble: '', bubbleLife: 0, af: Math.random() * 100 }; remotesRef.current.set(id, r); setPopulation(remotesRef.current.size + 1); }
        else { r.tx = fx; r.ty = fy; }
      })
      .on('broadcast', { event: 'say' }, ({ payload }) => {
        const pl = payload as Record<string, unknown>; const id = String(pl?.id ?? ''); const text = String(pl?.text ?? '');
        if (!id || id === me.id || !text) return;
        const r = remotesRef.current.get(id); if (r) { r.bubble = text; r.bubbleLife = BUBBLE_FRAMES; }
        pushFeed(r?.handle ?? '???', text);
      })
      .on('broadcast', { event: 'place' }, ({ payload }) => {
        const pl = payload as Record<string, unknown>; const id = String(pl?.id ?? ''); if (!id || itemsRef.current.some(i => i.id === id)) return;
        itemsRef.current.push({ id, kind: String(pl.kind), gx: Number(pl.gx), gy: Number(pl.gy), createdBy: String(pl.by ?? '') });
      })
      .on('broadcast', { event: 'unplace' }, ({ payload }) => {
        const id = String((payload as Record<string, unknown>)?.id ?? ''); itemsRef.current = itemsRef.current.filter(i => i.id !== id);
      })
      .subscribe(async status => {
        if (status === 'SUBSCRIBED') {
          setConnected(true);
          await ch.track({ id: me.id, handle: me.handle, skinId: me.skinId, fx: me.fx, fy: me.fy });
          const { data } = await supabase!.from('room_items').select('id,kind,x,y,created_by').eq('room', room).order('created_at');
          if (data) { itemsRef.current = data.map(d => ({ id: String(d.id), kind: String(d.kind), gx: Number(d.x), gy: Number(d.y), createdBy: String(d.created_by ?? '') })); setMyCount(itemsRef.current.filter(i => i.createdBy === me.id).length); }
        }
      });

    const onResume = () => { if (document.visibilityState === 'visible' && channelRef.current) { const m = selfRef.current; channelRef.current.track({ id: m.id, handle: m.handle, skinId: m.skinId, fx: m.fx, fy: m.fy }); } };
    document.addEventListener('visibilitychange', onResume); window.addEventListener('focus', onResume); window.addEventListener('online', onResume);
    return () => { setConnected(false); document.removeEventListener('visibilitychange', onResume); window.removeEventListener('focus', onResume); window.removeEventListener('online', onResume); supabase?.removeChannel(ch); channelRef.current = null; };
  }, [room]);

  // ---- main loop ----
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false }) as CanvasRenderingContext2D; if (!ctx) return;
    canvas.width = STAGE_W; canvas.height = STAGE_H;

    const update = () => {
      framesRef.current++;
      const me = selfRef.current;
      const d = Math.hypot(me.tx - me.fx, me.ty - me.fy);
      const moving = d > 0.04;
      if (moving) { const s = Math.min(WALK, d); me.fx += (me.tx - me.fx) / d * s; me.fy += (me.ty - me.fy) / d * s; me.af += 1; } else me.af += 0.3;
      if (me.bubbleLife > 0) me.bubbleLife--;
      const ch = channelRef.current;
      if (ch) {
        if (moving && ++posAccum.current >= 7) { posAccum.current = 0; ch.send({ type: 'broadcast', event: 'pos', payload: { id: me.id, fx: +me.fx.toFixed(2), fy: +me.fy.toFixed(2) } }); }
        if (wasMovingRef.current && !moving) { ch.send({ type: 'broadcast', event: 'pos', payload: { id: me.id, fx: +me.fx.toFixed(2), fy: +me.fy.toFixed(2) } }); ch.track({ id: me.id, handle: me.handle, skinId: me.skinId, fx: +me.fx.toFixed(2), fy: +me.fy.toFixed(2) }); }
      }
      wasMovingRef.current = moving;
      for (const r of remotesRef.current.values()) { r.fx += (r.tx - r.fx) * 0.2; r.fy += (r.ty - r.fy) * 0.2; r.af += Math.hypot(r.tx - r.fx, r.ty - r.fy) > 0.02 ? 1 : 0.3; if (r.bubbleLife > 0) r.bubbleLife--; }
    };

    const diamond = (cx: number, cy: number, hw: number, hh: number) => { ctx.beginPath(); ctx.moveTo(cx, cy - hh); ctx.lineTo(cx + hw, cy); ctx.lineTo(cx, cy + hh); ctx.lineTo(cx - hw, cy); ctx.closePath(); };

    const drawBlock = (cx: number, cyBase: number, h: number, base: string, accent: string, emoji?: string) => {
      const hw = TW * 0.84, hh = TH * 0.84, H = h * STACK_H, cyTop = cyBase - H;
      ctx.fillStyle = shade(base, 0.55); ctx.beginPath(); ctx.moveTo(cx - hw, cyBase); ctx.lineTo(cx, cyBase + hh); ctx.lineTo(cx, cyTop + hh); ctx.lineTo(cx - hw, cyTop); ctx.closePath(); ctx.fill();
      ctx.fillStyle = shade(base, 0.8); ctx.beginPath(); ctx.moveTo(cx, cyBase + hh); ctx.lineTo(cx + hw, cyBase); ctx.lineTo(cx + hw, cyTop); ctx.lineTo(cx, cyTop + hh); ctx.closePath(); ctx.fill();
      ctx.fillStyle = shade(base, 1.25); diamond(cx, cyTop, hw, hh); ctx.fill();
      ctx.strokeStyle = hexA(accent, 0.4); ctx.lineWidth = 1; diamond(cx, cyTop, hw, hh); ctx.stroke();
      if (emoji) { ctx.font = '14px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(emoji, cx, cyTop); }
      return cyTop;
    };

    const drawFurni = (it: Item, gx: number, gy: number, gz: number, theme: RoomDef) => {
      const { sx, sy } = iso(gx, gy, gz);
      switch (it.kind) {
        case 'block':   drawBlock(sx, sy, 1, theme.floor === '#161628' ? '#3a3a5a' : shade(theme.accent, 0.5), theme.accent); break;
        case 'speaker': { const top = drawBlock(sx, sy, 2, '#23232f', theme.accent); ctx.fillStyle = hexA(theme.accent, 0.6 + Math.abs(Math.sin(framesRef.current * 0.15)) * 0.4); ctx.beginPath(); ctx.arc(sx + 10, top + 24, 6, 0, Math.PI * 2); ctx.fill(); break; }
        case 'sofa':    drawBlock(sx, sy, 1, '#4a3768', theme.accent, '🛋️'); break;
        case 'stool':   drawBlock(sx, sy, 1, '#50505c', theme.accent); break;
        case 'plant':   { const top = drawBlock(sx, sy, 1, '#8a4f2a', theme.accent); ctx.fillStyle = '#1ED760'; for (const dx of [-7, 0, 7]) { ctx.beginPath(); ctx.ellipse(sx + dx, top - 8, 6, 13, dx * 0.05, 0, Math.PI * 2); ctx.fill(); } break; }
        case 'sign':    { const top = drawBlock(sx, sy, 1, '#16161f', theme.accent); ctx.fillStyle = theme.accent; ctx.font = '900 11px Helvetica, Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('SUAV', sx, top); break; }
        case 'disco': {
          const cy = sy - 2.6 * STACK_H;
          ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(sx, cy - 22); ctx.lineTo(sx, cy - 60); ctx.stroke();
          ctx.save(); ctx.translate(sx, cy); ctx.rotate(framesRef.current * 0.04);
          const grd = ctx.createRadialGradient(-6, -6, 3, 0, 0, 20); grd.addColorStop(0, '#fff'); grd.addColorStop(1, '#8893b8'); ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(0, 0, 20, 0, Math.PI * 2); ctx.fill();
          for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + framesRef.current * 0.04; ctx.fillStyle = `hsla(${(framesRef.current * 4 + i * 60) % 360},90%,65%,0.9)`; ctx.beginPath(); ctx.arc(Math.cos(a) * 12, Math.sin(a) * 12, 3.5, 0, Math.PI * 2); ctx.fill(); }
          ctx.restore(); break;
        }
      }
    };

    const drawRug = (it: Item, theme: RoomDef) => {
      const { sx, sy } = iso(it.gx, it.gy, 0);
      ctx.save(); ctx.globalAlpha = 0.45; ctx.fillStyle = theme.accent; diamond(sx, sy, TW * 0.8, TH * 0.8); ctx.fill();
      ctx.globalAlpha = 0.8; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; diamond(sx, sy, TW * 0.62, TH * 0.62); ctx.stroke(); ctx.restore();
    };

    const drawAvatar = (a: Avatar, isSelf: boolean) => {
      const sk = skinById(a.skinId); const { sx, sy } = iso(a.fx, a.fy, 0);
      const moving = Math.hypot(a.tx - a.fx, a.ty - a.fy) > 0.02;
      ctx.save(); ctx.globalAlpha = 0.4; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(sx, sy, 18, 8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.5; ctx.fillStyle = sk.color; ctx.shadowColor = sk.color; ctx.shadowBlur = 14; ctx.beginPath(); ctx.ellipse(sx, sy, 12, 5, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      const bob = moving ? Math.sin(a.af * 0.3) * 3 : 0;
      ctx.save(); ctx.translate(sx, sy - 30 + bob); ctx.shadowColor = sk.color; ctx.shadowBlur = isSelf ? 22 : 12; drawSkinShape(ctx, sk.shape, sk.color, 38, 50, a.af); ctx.restore();
      ctx.save(); ctx.font = '700 11px Helvetica, Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const nw = ctx.measureText(a.handle).width + 12, ny = sy + 13;
      ctx.fillStyle = 'rgba(8,8,14,0.72)'; ctx.beginPath(); ctx.roundRect(sx - nw / 2, ny - 8, nw, 16, 8); ctx.fill();
      if (isSelf) { ctx.strokeStyle = hexA(sk.color, 0.8); ctx.lineWidth = 1; ctx.stroke(); }
      ctx.fillStyle = isSelf ? sk.color : 'rgba(255,255,255,0.82)'; ctx.fillText(a.handle, sx, ny); ctx.restore();
      if (a.bubbleLife > 0 && a.bubble) {
        const alpha = Math.min(1, a.bubbleLife / 30); ctx.save(); ctx.globalAlpha = alpha; ctx.font = '600 15px Helvetica, Arial';
        const tw = ctx.measureText(a.bubble).width, bw = tw + 22, bh = 28, bx = sx - bw / 2, by = sy - 86;
        ctx.fillStyle = 'rgba(10,10,18,0.94)'; ctx.strokeStyle = sk.color; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 8); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(sx - 6, by + bh); ctx.lineTo(sx + 6, by + bh); ctx.lineTo(sx, by + bh + 8); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(a.bubble, sx, by + bh / 2); ctx.restore();
      }
    };

    const draw = () => {
      const theme = themeRef.current; const t = framesRef.current;
      const bg = ctx.createLinearGradient(0, 0, 0, STAGE_H); bg.addColorStop(0, '#08080e'); bg.addColorStop(0.55, '#0b0912'); bg.addColorStop(1, '#0a0610');
      ctx.fillStyle = bg; ctx.fillRect(0, 0, STAGE_W, STAGE_H);
      // dust + neon sign
      ctx.save(); ctx.fillStyle = '#fff'; for (let i = 0; i < 22; i++) { const mx = (i * 197.3) % STAGE_W; const my = (i * 71 + t * (0.12 + (i % 4) * 0.05)) % 210; ctx.globalAlpha = 0.03 + (i % 5) * 0.012; ctx.fillRect(mx, 200 - my, 2, 2); } ctx.restore();
      ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '900 60px Helvetica, Arial'; ctx.shadowColor = theme.accent; ctx.shadowBlur = 30; ctx.fillStyle = hexA(theme.accent, 0.92); ctx.fillText(theme.name.toUpperCase(), STAGE_W / 2, 78);
      ctx.shadowBlur = 0; ctx.font = '700 12px monospace'; ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fillText(roomOf(room).locked ? '· CURADA ·' : '· S U A V ·', STAGE_W / 2, 112); ctx.restore();

      // walls (two back panels)
      const bc = iso(-0.5, -0.5); const rEnd = iso(GRID - 0.5, -0.5); const lEnd = iso(-0.5, GRID - 0.5); const wh = WALL_H * STACK_H;
      ctx.fillStyle = shade(theme.floor, 1.5); ctx.beginPath(); ctx.moveTo(bc.sx, bc.sy); ctx.lineTo(rEnd.sx, rEnd.sy); ctx.lineTo(rEnd.sx, rEnd.sy - wh); ctx.lineTo(bc.sx, bc.sy - wh); ctx.closePath(); ctx.fill();
      ctx.fillStyle = shade(theme.floor, 1.0); ctx.beginPath(); ctx.moveTo(bc.sx, bc.sy); ctx.lineTo(lEnd.sx, lEnd.sy); ctx.lineTo(lEnd.sx, lEnd.sy - wh); ctx.lineTo(bc.sx, bc.sy - wh); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = hexA(theme.accent, 0.5); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(rEnd.sx, rEnd.sy - wh); ctx.lineTo(bc.sx, bc.sy - wh); ctx.lineTo(lEnd.sx, lEnd.sy - wh); ctx.stroke();

      // floor tiles
      for (let gx = 0; gx < GRID; gx++) for (let gy = 0; gy < GRID; gy++) {
        const { sx, sy } = iso(gx, gy); diamond(sx, sy, TW, TH);
        ctx.fillStyle = theme.floor; ctx.fill();
        ctx.fillStyle = (gx + gy) % 2 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.22)'; ctx.fill();
        ctx.strokeStyle = hexA(theme.accent, 0.10); ctx.lineWidth = 1; ctx.stroke();
      }
      // hover highlight while decorating
      const hv = hoverRef.current; const ui = uiRef.current;
      if (ui.decorOpen && (ui.placingKind || ui.removeMode) && hv) { const { sx, sy } = iso(hv.gx, hv.gy); diamond(sx, sy, TW, TH); ctx.fillStyle = hexA(ui.removeMode ? '#ff4e3e' : theme.accent, 0.28); ctx.fill(); ctx.strokeStyle = ui.removeMode ? '#ff4e3e' : theme.accent; ctx.lineWidth = 2; ctx.stroke(); }

      // rugs (flat, under everything on their tile)
      for (const it of itemsRef.current) if (it.kind === 'rug') drawRug(it, theme);

      // stacked furni + avatars, depth-sorted by (gx+gy) then height
      const stack = new Map<string, number>();
      const ents: Array<{ s: number; draw: () => void }> = [];
      for (const it of itemsRef.current) {
        if (it.kind === 'rug') continue;
        const key = `${it.gx},${it.gy}`; const gz = stack.get(key) ?? 0; stack.set(key, gz + (FURNI_H[it.kind] ?? 1));
        const ii = it, z = gz; ents.push({ s: it.gx + it.gy + z * 0.01, draw: () => drawFurni(ii, ii.gx, ii.gy, z, theme) });
      }
      ents.push({ s: selfRef.current.fx + selfRef.current.fy + 0.005, draw: () => drawAvatar(selfRef.current, true) });
      for (const r of remotesRef.current.values()) { const rr = r; ents.push({ s: rr.fx + rr.fy + 0.005, draw: () => drawAvatar(rr, false) }); }
      ents.sort((a, b) => a.s - b.s);
      for (const e of ents) e.draw();

      const vig = ctx.createRadialGradient(STAGE_W / 2, STAGE_H * 0.54, STAGE_H * 0.34, STAGE_W / 2, STAGE_H * 0.54, STAGE_H * 0.85);
      vig.addColorStop(0, 'rgba(0,0,0,0)'); vig.addColorStop(1, 'rgba(0,0,0,0.5)'); ctx.fillStyle = vig; ctx.fillRect(0, 0, STAGE_W, STAGE_H);
    };

    let last = 0, acc = 0; const STEP = 1000 / 60;
    const loop = (now: number) => { rafRef.current = requestAnimationFrame(loop); if (last === 0) last = now; let dt = now - last; last = now; if (dt > 250) dt = 250; acc += dt; let n = 0; while (acc >= STEP && n < 5) { update(); acc -= STEP; n++; } draw(); };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const evtTile = (e: React.PointerEvent) => {
    const canvas = canvasRef.current!; const rect = canvas.getBoundingClientRect();
    const sx = (e.clientX - rect.left) / rect.width * STAGE_W, sy = (e.clientY - rect.top) / rect.height * STAGE_H;
    const { gx, gy } = screenToTile(sx, sy); return { gx: clampTile(gx), gy: clampTile(gy), raw: screenToTile(sx, sy) };
  };
  const onPointerDown = (e: React.PointerEvent) => {
    const { gx, gy, raw } = evtTile(e);
    if (raw.gx < -0.5 || raw.gx > GRID - 0.5 || raw.gy < -0.5 || raw.gy > GRID - 0.5) return;
    if (placingKind) { placeItem(placingKind, gx, gy); return; }
    if (removeMode) { removeAt(gx, gy); return; }
    selfRef.current.tx = gx; selfRef.current.ty = gy;
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!decorOpen) { hoverRef.current = null; return; }
    const { gx, gy, raw } = evtTile(e);
    hoverRef.current = (raw.gx < -0.5 || raw.gx > GRID - 0.5 || raw.gy < -0.5 || raw.gy > GRID - 0.5) ? null : { gx, gy };
  };

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
        {!locked && (
          <button onClick={() => { setDecorOpen(o => !o); setPlacingKind(null); setRemoveMode(false); }} className={`text-[11px] font-mono uppercase tracking-widest border px-3 py-1.5 transition-all ${decorOpen ? 'bg-brandYellow text-black border-brandYellow' : 'text-white border-white/25 bg-black/50 hover:bg-white hover:text-black'}`}>✦ Decorar</button>
        )}
      </div>

      {(hint || placingKind || removeMode) && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-40 pointer-events-none text-[11px] font-mono uppercase tracking-widest bg-black/70 px-3 py-1" style={{ color: hint ? '#ff4e3e' : '#ffe65c' }}>
          {hint || (placingKind ? 'toca num tile para colocar · clica de novo para empilhar' : 'toca para remover')}
        </div>
      )}

      {decorOpen && !locked && (
        <div className="absolute z-40 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 px-3 max-w-[96%]" style={{ bottom: 'calc(max(0.75rem, env(safe-area-inset-bottom)) + 56px)' }}>
          <p className="text-[10px] font-mono uppercase tracking-widest text-white/50">{isMod ? 'moderador · sem limite' : `os teus objetos: ${myCount}/${PLACE_CAP}`}</p>
          <div className="flex flex-wrap justify-center gap-2">
            {FURNI.map(f => (
              <button key={f.kind} onClick={() => { setPlacingKind(k => k === f.kind ? null : f.kind); setRemoveMode(false); }} className={`flex flex-col items-center justify-center w-14 h-14 border text-[9px] gap-1 transition-colors ${placingKind === f.kind ? 'border-brandYellow bg-brandYellow/15 text-white' : 'border-white/20 bg-black/60 text-white/80 hover:border-white/50'}`}>
                <span className="text-lg leading-none">{f.emoji}</span><span className="uppercase tracking-wider">{f.name}</span>
              </button>
            ))}
            <button onClick={() => { setRemoveMode(r => !r); setPlacingKind(null); }} className={`flex flex-col items-center justify-center w-14 h-14 border text-[9px] gap-1 transition-colors ${removeMode ? 'border-brandRed bg-brandRed/20 text-white' : 'border-white/20 bg-black/60 text-white/80 hover:border-white/50'}`}>
              <span className="text-lg leading-none">🗑️</span><span className="uppercase tracking-wider">Remover</span>
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
                <button key={r.slug} onClick={() => switchRoom(r.slug)} className={`flex items-center gap-3 p-3 border transition-colors ${r.slug === room ? 'border-white bg-white/5' : 'border-white/15 hover:border-white/40'}`}>
                  <span className="w-4 h-4 rounded-full shrink-0" style={{ background: r.accent, boxShadow: `0 0 10px ${r.accent}` }} />
                  <span className="font-bold text-white">{r.name}</span>
                  {r.locked && <span className="text-[10px] uppercase tracking-widest text-white/40">🔒 curada</span>}
                  {r.slug === room && <span className="ml-auto text-[10px] uppercase tracking-widest text-white/40">aqui</span>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="absolute left-3 z-40 pointer-events-none flex flex-col gap-1 max-w-[70%] sm:max-w-md" style={{ bottom: 'calc(max(0.75rem, env(safe-area-inset-bottom)) + 56px)' }}>
        {feed.map(m => (<p key={m.id} className="text-sm leading-tight" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.95)' }}><span className="text-brandYellow font-bold">{m.handle}</span><span className="text-white/90">: {m.text}</span></p>))}
      </div>

      <form onSubmit={e => { e.preventDefault(); say(msg); }} className="absolute bottom-0 inset-x-0 z-40 p-3 flex justify-center" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
        <div className="flex gap-2 w-full max-w-md">
          <input value={msg} onChange={e => setMsg(e.target.value)} maxLength={120} placeholder="diz algo…" className="flex-1 min-w-0 bg-black/60 border border-white/20 text-white px-3 py-2 text-sm outline-none focus:border-brandYellow rounded" />
          <button type="submit" className="bg-brandYellow text-black font-bold uppercase text-xs tracking-widest px-4 rounded active:scale-95 hover:bg-white transition-colors">Dizer</button>
        </div>
      </form>

      {onExit && (<button onClick={onExit} className="absolute top-3 right-4 z-40 text-[11px] font-mono text-brandYellow border border-brandYellow bg-black/60 px-3 py-1.5 hover:bg-brandYellow hover:text-black transition-all">[ SAIR ]</button>)}
    </div>
  );
};
