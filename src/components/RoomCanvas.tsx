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
import { drawSkinShape, skinById, getSelectedSkinId } from '@/lib/skins';

const STAGE_W = 1280, STAGE_H = 720;
// Floor area the avatars can stand in (a perspective slab); y doubles as depth.
const FLOOR_TOP = 312, FLOOR_BOT = 648;
const FLOOR_TOP_INSET = 360, FLOOR_BOT_INSET = 150;   // how far the trapezoid pinches in at top
const WALK_SPEED = 3.4;                                // px / 60Hz step
const BUBBLE_FRAMES = 60 * 6;                          // speech bubble lifetime

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
  const trackAccum = useRef(0);
  const dirtyRef = useRef(true);   // pos changed since last presence track

  const [msg, setMsg] = useState('');
  const [population, setPopulation] = useState(1);
  const [connected, setConnected] = useState(false);

  // ---- broadcast a chat line + show it over my own head ----
  const say = (raw: string) => {
    const text = raw.trim().slice(0, 120);
    if (!text) return;
    selfRef.current.bubble = text; selfRef.current.bubbleLife = BUBBLE_FRAMES;
    channelRef.current?.send({ type: 'broadcast', event: 'say', payload: { id: selfRef.current.id, text } });
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

    if (!supabase) return;   // offline → still walk around solo
    const me = selfRef.current;
    const ch = supabase.channel('room:praca', {
      config: { presence: { key: me.id }, broadcast: { self: false } },
    });
    channelRef.current = ch;

    const rebuild = () => {
      const state = ch.presenceState() as Record<string, Array<Record<string, unknown>>>;
      const seen = new Set<string>([me.id]);
      let pop = 1;
      for (const key in state) {
        const meta = state[key]?.[0]; if (!meta) continue;
        const id = String(meta.id ?? key);
        if (id === me.id) continue;
        seen.add(id); pop++;
        const mx = Number(meta.x), my = Number(meta.y);
        let r = remotesRef.current.get(id);
        if (!r) {
          r = { handle: String(meta.handle ?? '???'), skinId: String(meta.skinId ?? 'diamond-gold'),
                x: mx, y: my, tx: mx, ty: my, bubble: '', bubbleLife: 0, af: Math.random() * 100 };
          remotesRef.current.set(id, r);
        } else {
          r.tx = mx; r.ty = my; r.handle = String(meta.handle ?? r.handle); r.skinId = String(meta.skinId ?? r.skinId);
        }
      }
      for (const id of [...remotesRef.current.keys()]) if (!seen.has(id)) remotesRef.current.delete(id);
      setPopulation(pop);
    };

    ch.on('presence', { event: 'sync' }, rebuild)
      .on('broadcast', { event: 'say' }, ({ payload }) => {
        const id = String((payload as Record<string, unknown>)?.id ?? '');
        const text = String((payload as Record<string, unknown>)?.text ?? '');
        if (!id || id === me.id) return;
        const r = remotesRef.current.get(id);
        if (r) { r.bubble = text; r.bubbleLife = BUBBLE_FRAMES; }
      })
      .subscribe(async status => {
        if (status === 'SUBSCRIBED') {
          setConnected(true);
          await ch.track({ id: me.id, handle: me.handle, skinId: me.skinId, x: me.x, y: me.y });
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
  }, []);

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
      const me = selfRef.current;
      const wasMoving = Math.hypot(me.tx - me.x, me.ty - me.y) > 1.5;
      stepAvatar(me);
      if (wasMoving) dirtyRef.current = true;
      // Remotes ease toward their last broadcast position.
      for (const r of remotesRef.current.values()) {
        r.x += (r.tx - r.x) * 0.18; r.y += (r.ty - r.y) * 0.18;
        r.af += Math.hypot(r.tx - r.x, r.ty - r.y) > 1 ? 1 : 0.3;
        if (r.bubbleLife > 0) r.bubbleLife--;
      }
      // Throttle presence updates to ~8/s, only when we've actually moved.
      trackAccum.current++;
      if (trackAccum.current >= 7 && dirtyRef.current && channelRef.current) {
        trackAccum.current = 0; dirtyRef.current = false;
        channelRef.current.track({ id: me.id, handle: me.handle, skinId: me.skinId, x: Math.round(me.x), y: Math.round(me.y) });
      }
    };

    const drawAvatar = (a: Avatar, isSelf: boolean) => {
      const sk = skinById(a.skinId);
      const sc = depthScale(a.y);
      // shadow
      ctx.save();
      ctx.globalAlpha = 0.35; ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.ellipse(a.x, a.y, 22 * sc, 7 * sc, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      // body (bob while walking)
      const bob = Math.sin(a.af * 0.3) * 3 * sc * (Math.hypot(a.tx - a.x, a.ty - a.y) > 1 ? 1 : 0);
      ctx.save();
      ctx.translate(a.x, a.y - 30 * sc + bob);
      ctx.scale(sc, sc);
      if (isSelf) { ctx.shadowColor = sk.color; ctx.shadowBlur = 18; }
      drawSkinShape(ctx, sk.shape, sk.color, 40, 54, a.af);
      ctx.restore();
      // name tag
      ctx.save();
      ctx.font = `700 ${Math.round(12 * sc)}px monospace`; ctx.textAlign = 'center';
      ctx.fillStyle = isSelf ? '#ffe65c' : 'rgba(255,255,255,0.8)';
      ctx.fillText(a.handle, a.x, a.y + 16 * sc);
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
      // background
      const g = ctx.createLinearGradient(0, 0, 0, STAGE_H);
      g.addColorStop(0, '#0a0a12'); g.addColorStop(1, '#14060c');
      ctx.fillStyle = g; ctx.fillRect(0, 0, STAGE_W, STAGE_H);

      // back wall band + sign
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.02)'; ctx.fillRect(0, 0, STAGE_W, FLOOR_TOP);
      ctx.font = '900 56px Helvetica, Arial, sans-serif'; ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillText('PRAÇA SUAV', STAGE_W / 2, FLOOR_TOP * 0.5);
      ctx.restore();

      // perspective floor (trapezoid) + neon grid
      const [tl, tr] = floorXRange(FLOOR_TOP);
      const [bl, br] = floorXRange(FLOOR_BOT);
      ctx.save();
      ctx.beginPath(); ctx.moveTo(tl, FLOOR_TOP); ctx.lineTo(tr, FLOOR_TOP); ctx.lineTo(br, FLOOR_BOT); ctx.lineTo(bl, FLOOR_BOT); ctx.closePath();
      ctx.fillStyle = '#12121e'; ctx.fill();
      ctx.clip();
      ctx.strokeStyle = 'rgba(0,207,255,0.16)'; ctx.lineWidth = 1.5;
      for (let i = 0; i <= 10; i++) {           // depth lines
        const y = FLOOR_TOP + (FLOOR_BOT - FLOOR_TOP) * (i / 10);
        const [a, b] = floorXRange(y);
        ctx.beginPath(); ctx.moveTo(a, y); ctx.lineTo(b, y); ctx.stroke();
      }
      for (let i = 0; i <= 12; i++) {           // converging verticals
        const fx = i / 12;
        ctx.beginPath(); ctx.moveTo(tl + (tr - tl) * fx, FLOOR_TOP); ctx.lineTo(bl + (br - bl) * fx, FLOOR_BOT); ctx.stroke();
      }
      ctx.restore();
      // glowing floor edge
      ctx.save(); ctx.strokeStyle = 'rgba(255,78,62,0.5)'; ctx.lineWidth = 3; ctx.shadowColor = '#ff4e3e'; ctx.shadowBlur = 14;
      ctx.beginPath(); ctx.moveTo(bl, FLOOR_BOT); ctx.lineTo(br, FLOOR_BOT); ctx.stroke(); ctx.restore();

      // avatars, painter-sorted back→front
      const all: Array<{ a: Avatar; self: boolean }> = [{ a: selfRef.current, self: true }];
      for (const r of remotesRef.current.values()) all.push({ a: r, self: false });
      all.sort((p, q) => p.a.y - q.a.y);
      for (const { a, self } of all) drawAvatar(a, self);
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
    const ty = Math.max(FLOOR_TOP, Math.min(FLOOR_BOT, y));
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

      {/* top bar: population + connection */}
      <div className="absolute top-3 left-4 z-40 pointer-events-none">
        <p className="font-helvetica font-black text-xl text-white leading-none">PRAÇA</p>
        <p className="text-[11px] uppercase tracking-[0.2em] text-white/45 mt-1">
          {supabaseReady ? (connected ? `${population} ${population === 1 ? 'pessoa' : 'pessoas'}` : 'a ligar…') : 'offline'}
        </p>
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
