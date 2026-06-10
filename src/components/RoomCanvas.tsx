'use client';

// OUROO PRAÇA — isometric social room with a big furni catalogue + Habbo-style heights:
// furni has height, you walk ON walkable pieces, and you can only step up/down ONE level at a
// time (so a height-2 thing blocks you — build stairs out of 1-high pieces to go up). Live via
// Supabase presence/broadcast; furni persists in room_items. Some rooms are locked (curated).

import React, { useEffect, useRef, useState } from 'react';
import { supabase, supabaseReady } from '@/lib/supabase';
import { getLocalPlayer } from '@/lib/leaderboard';
import { getAuthIdentity, useUser, signInWithDiscord } from '@/lib/auth';
import { amIModerator } from '@/lib/chat';
import { drawSkinShape, skinById, getSelectedSkinId } from '@/lib/skins';
import { validateMessage } from '@/lib/names';
import { CATS, FURNI, defOf, furniPrice, sitHeight, isRotatable, isFurniFree } from '@/lib/furni';
import { type IconSpec, drawIconSpec, iconPrimaryColor } from '@/lib/icons';
import { resolveAppearance } from '@/lib/catalog';
import { buyFurni, furniCount, consumeFurni, returnFurni, refreshWalletFromCloud, useWallet, CURRENCY_SYMBOL } from '@/lib/wallet';
import { InventoryModal } from '@/components/InventoryModal';
import { CatIcon, FurniSprite } from '@/components/UiIcon';
import { drawFurniSprite, effSpan } from '@/lib/furniRender';
import { type RoomRow, fetchRooms, fetchMyRooms, roomByCode, createRoom, deleteRoom, updateRoomPerms } from '@/lib/rooms';
import { type RoomPlan, ROOM_PLANS, PLAN_GRID, planById, planMask, planWaterMask, planSpawn } from '@/lib/roomPlans';

const STAGE_W = 1280, STAGE_H = 720;
const GRID = PLAN_GRID;   // max grid (array stride); the actual room footprint comes from its plan
const TILE_W = 64, TILE_H = 32, TW = TILE_W / 2, TH = TILE_H / 2;
const STACK_H = 26;
const WALL_H = 3;
const WALK = 0.09;          // tiles per 60Hz step
const BUBBLE_FRAMES = 60 * 6;
const MAX_ITEMS = 200, PLACE_CAP = 20;

type RoomDef = { slug: string; name: string; accent: string; floor: string; locked?: boolean; owner?: string; buildAll?: boolean; rights?: string[]; plan?: string; day?: boolean };
// Who may drop/take furni in a room: a mod always; in a PERSONAL room also the owner, an open
// ("build_all") room, or a granted handle. Official/public rooms are MODS ONLY.
const canBuildIn = (def: RoomDef, ownerId: string, handle: string, mod: boolean): boolean => {
  if (mod) return true;
  if (!def.owner) return false;   // official/public rooms — only moderators build or take
  return def.owner === ownerId || !!def.buildAll || (def.rights ?? []).some(h => h.toLowerCase() === (handle || '').toLowerCase());
};
const ROOMS: RoomDef[] = [
  { slug: 'praca',   name: 'Praça',     accent: '#00cfff', floor: '#161628', plan: 'salao' },
  { slug: 'disco',   name: 'Discoteca', accent: '#ff44aa', floor: '#1e1226', plan: 'octo' },
  { slug: 'lounge',  name: 'Lounge',    accent: '#ffd23a', floor: '#1e1a12', plan: 'quadrado' },
  { slug: 'telhado', name: 'Telhado',   accent: '#1ED760', floor: '#121e18', plan: 'palco' },
  { slug: 'cave',    name: 'Cave',      accent: '#cc44ff', floor: '#181226', plan: 'cruz' },
  { slug: 'atrio',   name: 'Átrio',     accent: '#ffffff', floor: '#191921', locked: true, plan: 'patio' },
  { slug: 'clube',   name: 'Clube',     accent: '#1aa3d8', floor: '#2c4a5e', locked: true, plan: 'clube', day: true },
];
const roomOf = (slug: string) => ROOMS.find(r => r.slug === slug) ?? ROOMS[0];

// Curated decor + NPCs baked into a room (not user-placed, not in the DB, not removable). Seats among
// them are still sittable; solids are pathed around. NPCs are static avatars with name tags.
type NpcDef = { handle: string; skinId: string; gx: number; gy: number; lvl?: number };
const CURATED_ITEMS: Record<string, [string, number, number, number?][]> = {
  clube: [
    ['arvore', 8, 8], ['arvore', 25, 8], ['arvore', 8, 25], ['arvore', 25, 25],
    ['palmeira', 11, 11], ['palmeira', 22, 11], ['palmeira', 11, 22], ['palmeira', 22, 22],
    ['rececao', 15, 8, 0],
    ['lounge_couch', 6, 23, 0], ['lounge_chair', 10, 22, 2], ['lounge_table', 8, 24, 0],
    ['lounge_couch', 24, 23, 2], ['lounge_chair', 23, 22, 1], ['lounge_table', 25, 24, 0],
    ['banco_jd', 12, 31, 0], ['banco_jd', 19, 31, 0], ['banco_jd', 10, 17, 0], ['banco_jd', 22, 17, 0],
    ['estatua', 16, 16, 0], ['planta', 14, 14, 0], ['planta', 19, 19, 0], ['planta', 14, 9, 0], ['planta', 18, 9, 0],
  ],
};
const CURATED_NPCS: Record<string, NpcDef[]> = {
  clube: [
    { handle: 'Rita ✦', skinId: 'heart-rosa', gx: 15, gy: 7 },
    { handle: 'Tó', skinId: 'nave-verde', gx: 17, gy: 7 },
    { handle: 'DJ Nuno', skinId: 'star-ciano', gx: 16, gy: 15, lvl: 1 },
    { handle: 'Guia', skinId: 'diamond-cyan', gx: 10, gy: 28 },
  ],
};

// Tiny preview of a floor plan: a grid sized to the plan's footprint where present tiles glow
// (brighter = higher level). Bigger plans read as denser thumbnails.
const PlanThumb: React.FC<{ plan: RoomPlan; accent: string }> = ({ plan, accent }) => {
  const rh = plan.rows.length, rw = plan.rows.reduce((m, r) => Math.max(m, r.length), 0);
  const step = Math.max(1, Math.ceil(Math.max(rw, rh) / 24));   // downsample big plans so the DOM stays light
  const w = Math.ceil(rw / step), h = Math.ceil(rh / step);
  return (
    <div className="grid gap-px" style={{ gridTemplateColumns: `repeat(${w}, 1fr)`, width: 40, height: 40 * (h / w) }}>
      {Array.from({ length: w * h }, (_, i) => {
        const ch = (plan.rows[(i / w | 0) * step] || '')[(i % w) * step];
        const water = ch === 'w' || ch === 'W'; const on = !!ch && ch !== 'x' && ch !== ' ' && ch !== '.'; const lv = on && !water ? ch.charCodeAt(0) - 48 : 0;
        const bg = water ? 'rgba(120,220,255,0.6)' : on ? hexA(accent, 0.35 + Math.min(lv, 3) * 0.2) : 'transparent';
        return <span key={i} style={{ background: bg, borderRadius: 1 }} />;
      })}
    </div>
  );
};

// Furni catalogue + economy helpers now live in @/lib/furni (shared with the inventory).
type Item = { id: string; kind: string; gx: number; gy: number; dir?: number; elev?: number; createdBy?: string };
// Direction + elevation persist inside the room_items `kind` text as `kind@dir^elev` (no migration).
const encodeKind = (kind: string, dir: number, elev = 0) => `${kind}${dir ? `@${dir}` : ''}${elev ? `^${elev}` : ''}`;
const decodeKind = (raw: string): { kind: string; dir: number; elev: number } => { const m = raw.match(/^([^@^]+)(?:@(\d+))?(?:\^(\d+(?:\.\d+)?))?$/); return m ? { kind: m[1], dir: m[2] ? (Number(m[2]) % 4 + 4) % 4 : 0, elev: m[3] ? Number(m[3]) : 0 } : { kind: raw, dir: 0, elev: 0 }; };
type Avatar = { handle: string; skinId: string; icon?: IconSpec | null; fx: number; fy: number; tx: number; ty: number; z: number; lvl: number; bubble: string; bubbleLife: number; af: number };
type Self = Avatar & { id: string; path: { gx: number; gy: number; z: number }[] };

const hexA = (hex: string, a: number) => { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };
const shade = (hex: string, f: number) => { const n = parseInt(hex.slice(1), 16); const r = Math.min(255, Math.round(((n >> 16) & 255) * f)), g = Math.min(255, Math.round(((n >> 8) & 255) * f)), b = Math.min(255, Math.round((n & 255) * f)); return `rgb(${r},${g},${b})`; };
// World-space iso (no origin) — positioned + scaled on screen by the room camera (see computeCam).
const iso = (gx: number, gy: number, gz = 0) => ({ sx: (gx - gy) * TW, sy: (gx + gy) * TH - gz * STACK_H });
type Cam = { x: number; y: number; s: number };
const worldToTile = (wx: number, wy: number) => { const a = wx / TW, b = wy / TH; return { gx: (a + b) / 2, gy: (b - a) / 2 }; };
// Fit the plan's walkable footprint into the stage (leaving room for the title up top). Bigger rooms
// → smaller scale (zoom out). Capped so tiny rooms don't balloon.
const computeCam = (mask: Int8Array, grid: number): Cam => {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, any = false;
  for (let gy = 0; gy < grid; gy++) for (let gx = 0; gx < grid; gx++) {
    const L = mask[gy * grid + gx]; if (L < 0) continue; any = true;
    const cx = (gx - gy) * TW, cy = (gx + gy) * TH - L * STACK_H;
    if (cx - TW < minX) minX = cx - TW; if (cx + TW > maxX) maxX = cx + TW;
    if (cy - TH - WALL_H * STACK_H < minY) minY = cy - TH - WALL_H * STACK_H;   // wall above
    if (cy + TH + STACK_H > maxY) maxY = cy + TH + STACK_H;                     // riser below
  }
  if (!any) { minX = -TW; maxX = TW; minY = -TH; maxY = TH; }
  const w = maxX - minX, h = maxY - minY;
  const padX = 46, padTop = 118, padBot = 28;
  const availW = STAGE_W - padX * 2, availH = STAGE_H - padTop - padBot;
  const s = Math.min(availW / w, availH / h, 1.18);
  return { x: padX + (availW - w * s) / 2 - minX * s, y: padTop + (availH - h * s) / 2 - minY * s, s };
};
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
  const outerRef = useRef<HTMLDivElement | null>(null);
  const [fitScale, setFitScale] = useState(1);   // uniform scale to FIT the 1280×720 stage (never stretch)
  const rafRef = useRef(0);
  const channelRef = useRef<ReturnType<NonNullable<typeof supabase>['channel']> | null>(null);
  const joinedRef = useRef(false);   // true only while the channel is actually SUBSCRIBED — never send otherwise (avoids REST-fallback floods)
  const selfRef = useRef<Self>({ id: '', handle: 'Convidado', skinId: getSelectedSkinId(), fx: 5, fy: 5, tx: 5, ty: 5, z: 0, lvl: 0, bubble: '', bubbleLife: 0, af: 0, path: [] });
  const remotesRef = useRef<Map<string, Avatar>>(new Map());
  const itemsRef = useRef<Item[]>([]);
  const decorRef = useRef<Item[]>([]);    // curated, non-removable furniture for the room
  const npcsRef = useRef<Avatar[]>([]);   // curated static NPCs
  const deviceRef = useRef('');   // stable device token — furni ownership (persists across reloads)
  const sessionRef = useRef('');  // unique per tab/session — presence key + broadcast id (so two sessions don't collide)
  const surfRef = useRef<number[][]>(Array.from({ length: GRID * GRID }, () => []));  // walkable surface levels per tile (layered)
  const solidRef = useRef<Uint8Array>(new Uint8Array(GRID * GRID));        // 1 = blocked
  const planRef = useRef<Int8Array>(planMask(planById('salao')));          // base floor level per tile (-1 = void)
  const waterRef = useRef<Uint8Array>(planWaterMask(planById('salao')));    // 1 = pool/water tile
  const planLvl = (gx: number, gy: number) => (gx < 0 || gy < 0 || gx >= GRID || gy >= GRID ? -1 : planRef.current[gy * GRID + gx]);
  const isWater = (gx: number, gy: number) => gx >= 0 && gy >= 0 && gx < GRID && gy < GRID && waterRef.current[gy * GRID + gx] === 1;
  const camRef = useRef<Cam>(computeCam(planRef.current, GRID));            // fits the room footprint into the stage
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
  const [roomMeta, setRoomMeta] = useState<RoomDef>(roomOf('praca'));   // current room's def (official or personal)
  const roomMetaRef = useRef<RoomDef>(roomMeta);
  const [showRooms, setShowRooms] = useState(false);
  const [personalRooms, setPersonalRooms] = useState<RoomRow[]>([]);
  const [myRooms, setMyRooms] = useState<RoomRow[]>([]);
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomPrivate, setNewRoomPrivate] = useState(false);
  const [newRoomPlan, setNewRoomPlan] = useState('salao');
  const [joinCode, setJoinCode] = useState('');
  // Permissions editor (for one of your own rooms): open everyone-toggle + a list of granted handles.
  const [permsRoom, setPermsRoom] = useState<RoomRow | null>(null);
  const [permsAll, setPermsAll] = useState(false);
  const [permsList, setPermsList] = useState<string[]>([]);
  const [permsHandle, setPermsHandle] = useState('');
  const [myOwnerId, setMyOwnerId] = useState('');
  const ownerIdRef = useRef('');
  const [myHandle, setMyHandle] = useState('Convidado');
  const myHandleRef = useRef('Convidado');
  const themeRef = useRef<RoomDef>(roomMeta);
  useEffect(() => { themeRef.current = roomMeta; roomMetaRef.current = roomMeta; }, [roomMeta]);
  const refreshRoomLists = () => { fetchRooms().then(setPersonalRooms); fetchMyRooms().then(setMyRooms); };
  useEffect(() => { if (showRooms) refreshRoomLists(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [showRooms]);
  // Keep the room a fixed 1280×720 stage, scaled uniformly to fit its container — resizing rescales, never stretches.
  useEffect(() => {
    const el = outerRef.current; if (!el) return;
    const compute = () => { const w = el.clientWidth, h = el.clientHeight; if (w && h) setFitScale(Math.min(w / STAGE_W, h / STAGE_H)); };
    compute();
    const ro = new ResizeObserver(compute); ro.observe(el);
    window.addEventListener('resize', compute); window.addEventListener('orientationchange', compute);
    return () => { ro.disconnect(); window.removeEventListener('resize', compute); window.removeEventListener('orientationchange', compute); };
  }, []);
  const [placingKind, setPlacingKind] = useState<string | null>(null);
  const [removeMode, setRemoveMode] = useState(false);
  const [rotateMode, setRotateMode] = useState(false);
  const [placeDir, setPlaceDir] = useState(0);
  const placeDirRef = useRef(0);
  useEffect(() => { placeDirRef.current = placeDir; }, [placeDir]);
  const [placeElev, setPlaceElev] = useState(0);   // lift (levels off the floor) for floating decks / bridges
  const placeElevRef = useRef(0);
  useEffect(() => { placeElevRef.current = placeElev; }, [placeElev]);
  const [decorOpen, setDecorOpen] = useState(false);
  const [entered, setEntered] = useState(false);   // lobby gate — connect to the room only on deliberate entry
  const [cat, setCat] = useState('tier1');
  const uiRef = useRef({ decorOpen: false, placingKind: null as string | null, removeMode: false, rotateMode: false });
  useEffect(() => { uiRef.current = { decorOpen, placingKind, removeMode, rotateMode }; }, [decorOpen, placingKind, removeMode, rotateMode]);
  const [isMod, setIsMod] = useState(false);
  const [myCount, setMyCount] = useState(0);
  const [hint, setHint] = useState('');
  const flashHint = (t: string) => { setHint(t); setTimeout(() => setHint(''), 1900); };
  // You can build if: you're a mod, the owner, an open ("everyone") room, or a granted handle.
  const canBuild = canBuildIn(roomMeta, myOwnerId, myHandle, isMod);
  const locked = !canBuild;
  // Same check from inside canvas closures (reads refs, not render state).
  const canBuildHere = () => canBuildIn(roomMetaRef.current, ownerIdRef.current, myHandleRef.current, modRef.current);
  const [invOpen, setInvOpen] = useState(false);
  const wallet = useWallet();
  // Guests can walk + chat; building/creating needs a Discord account → kick off sign-in.
  const { user } = useUser();
  const signedIn = !!user;
  const signedInRef = useRef(false);
  useEffect(() => { signedInRef.current = signedIn; }, [signedIn]);
  const requireAccount = (): boolean => { if (signedInRef.current) return true; flashHint('Cria conta para construir 🛸'); signInWithDiscord(); return false; };

  // Equip a skin or custom icon on the live avatar and broadcast it to the room.
  const equipAppearance = (id: string) => {
    const me = selfRef.current; me.skinId = id;
    const ap = resolveAppearance(id); me.icon = ap.kind === 'icon' ? ap.spec : null;
    channelRef.current?.track({ id: me.id, handle: me.handle, skinId: me.skinId, icon: me.icon ?? undefined, fx: +me.fx.toFixed(2), fy: +me.fy.toFixed(2), lvl: me.lvl });
  };

  const pushFeed = (handle: string, text: string) => { const id = ++feedId.current; setFeed(f => [...f.slice(-5), { id, handle, text }]); setTimeout(() => setFeed(f => f.filter(m => m.id !== id)), 9000); };
  const say = (raw: string) => {
    const v = validateMessage(raw); if (!v.ok) { flashHint(v.error); return; }
    const text = v.value.slice(0, 120); const me = selfRef.current; me.bubble = text; me.bubbleLife = BUBBLE_FRAMES;
    channelRef.current?.send({ type: 'broadcast', event: 'say', payload: { id: me.id, text } });
    pushFeed(me.handle, text); setMsg('');
  };
  const switchRoom = (def: RoomDef) => {
    setShowRooms(false); if (def.slug === room) return;
    const sp = planSpawn(planById(def.plan));
    const me = selfRef.current; me.fx = sp.gx; me.fy = sp.gy; me.tx = sp.gx; me.ty = sp.gy; me.z = sp.lvl; me.lvl = sp.lvl; me.path = []; me.bubble = ''; me.bubbleLife = 0;
    remotesRef.current.clear(); itemsRef.current = []; setMyCount(0); setPlacingKind(null); setRemoveMode(false); setRotateMode(false); setPlaceElev(0); setDecorOpen(false);
    setRoomMeta(def); setRoom(def.slug);
  };
  const roomDefOf = (r: RoomRow): RoomDef => ({ slug: r.slug, name: r.name, accent: r.accent, floor: r.floor, owner: r.owner, buildAll: r.build_all, rights: r.rights, plan: r.plan });
  const doCreateRoom = async () => {
    if (!requireAccount()) return;
    const res = await createRoom(newRoomName, !newRoomPrivate, newRoomPlan);
    if (!res.ok) { flashHint(res.error || 'Erro ao criar sala'); return; }
    setNewRoomName(''); flashHint(`Sala criada · código ${res.room.code}`); switchRoom(roomDefOf(res.room));
  };
  const doJoinByCode = async () => {
    const r = await roomByCode(joinCode);
    if (!r) { flashHint('Sala não encontrada'); return; }
    setJoinCode(''); switchRoom(roomDefOf(r));
  };
  const doDeleteRoom = async (r: RoomRow) => {
    if (!confirm(`Apagar "${r.name}"? Os móveis dela vão-se.`)) return;
    const ok = await deleteRoom(r.slug);
    if (!ok) { flashHint('Erro ao apagar'); return; }
    if (room === r.slug) switchRoom(roomOf('praca'));
    refreshRoomLists();
  };
  const openPerms = (r: RoomRow) => { setPermsRoom(r); setPermsAll(r.build_all); setPermsList(r.rights ?? []); setPermsHandle(''); };
  const addPermHandle = () => {
    const h = permsHandle.trim(); if (!h) return;
    if (!permsList.some(x => x.toLowerCase() === h.toLowerCase())) setPermsList(l => [...l, h]);
    setPermsHandle('');
  };
  const savePerms = async () => {
    if (!permsRoom) return;
    const list = Array.from(new Set(permsList.map(h => h.trim()).filter(Boolean)));
    const ok = await updateRoomPerms(permsRoom.slug, permsAll, list);
    if (!ok) { flashHint('Erro ao guardar permissões'); return; }
    // Reflect immediately in local lists + the live room if it's the one open.
    setMyRooms(rs => rs.map(r => r.slug === permsRoom.slug ? { ...r, build_all: permsAll, rights: list } : r));
    if (room === permsRoom.slug) setRoomMeta(m => ({ ...m, buildAll: permsAll, rights: list }));
    setPermsRoom(null); flashHint('Permissões guardadas ✓');
  };

  // recompute the heightmap (walkable height + solid mask) from items
  // Layered heightmap: each tile holds a sorted list of WALKABLE surface levels. Floor pieces sit at
  // elev 0 (cover the ground); floating pieces (elev>0) leave the ground exposed → a tunnel under +
  // a deck above. Solids block the whole tile.
  const rebuildHeight = () => {
    const surf = surfRef.current, S = solidRef.current; S.fill(0);
    for (let i = 0; i < surf.length; i++) surf[i].length = 0;
    const grounded = new Uint8Array(GRID * GRID);
    for (const it of (decorRef.current.length ? itemsRef.current.concat(decorRef.current) : itemsRef.current)) {
      const d = defOf(it.kind); const [sw, sh] = effSpan(it.kind, it.dir || 0); const elev = it.elev || 0; const sit = sitHeight(it.kind);
      for (let du = 0; du < sw; du++) for (let dv = 0; dv < sh; dv++) {
        const gx = it.gx + du, gy = it.gy + dv; if (gx >= GRID || gy >= GRID) continue;
        const k = key(gx, gy); const base = planRef.current[k]; if (base < 0) continue;   // can't sit on a void tile
        if (d.walk) { surf[k].push(base + elev + d.h); if (elev <= 0.01) grounded[k] = 1; }
        else if (sit != null) { surf[k].push(base + elev + sit); if (elev <= 0.01) grounded[k] = 1; }
        else S[k] = 1;
      }
    }
    for (let k = 0; k < surf.length; k++) {
      const base = planRef.current[k];
      if (base < 0) { S[k] = 1; surf[k].length = 0; continue; }   // void tile — no floor, blocked
      if (S[k]) { surf[k].length = 0; continue; }
      if (!grounded[k]) surf[k].push(base);          // exposed floor at its base level (walk under floating decks)
      surf[k].sort((a, b) => a - b);
    }
  };
  // Apply the current room's floor plan (shape + base levels), then rebuild walkability. Repositions
  // you to the plan's spawn if your tile became void after a shape change.
  useEffect(() => {
    const plan = planById(roomMeta.plan);
    planRef.current = planMask(plan);
    waterRef.current = planWaterMask(plan);
    camRef.current = computeCam(planRef.current, GRID);
    decorRef.current = (CURATED_ITEMS[roomMeta.slug] ?? []).map(([kind, gx, gy, dir], i) => ({ id: `c_${roomMeta.slug}_${i}`, kind, gx, gy, dir: dir ?? 0, elev: 0, createdBy: 'curated' }));
    npcsRef.current = (CURATED_NPCS[roomMeta.slug] ?? []).map(n => ({ handle: n.handle, skinId: n.skinId, icon: null, fx: n.gx, fy: n.gy, tx: n.gx, ty: n.gy, z: n.lvl ?? 0, lvl: n.lvl ?? 0, bubble: '', bubbleLife: 0, af: 0 }));
    const me = selfRef.current;
    if (planLvl(clampTile(me.fx), clampTile(me.fy)) < 0) {
      const sp = planSpawn(plan); me.fx = sp.gx; me.fy = sp.gy; me.tx = sp.gx; me.ty = sp.gy; me.z = sp.lvl; me.lvl = sp.lvl; me.path = [];
    }
    rebuildHeight();
  }, [roomMeta.slug, roomMeta.plan]);
  // Level-aware BFS over (tile, surface) nodes: step to a neighbour surface within ±1 of the current
  // level. From the ground you can't reach a high deck (gap>1) so you pass UNDER it; ramps/stairs add
  // the intermediate surfaces to climb ON. Returns waypoints {gx,gy,z}.
  const findPath = (sx: number, sy: number, slvl: number, tx: number, ty: number) => {
    const surf = surfRef.current, S = solidRef.current; const tk = key(tx, ty);
    if (S[tk] || !surf[tk].length || (sx === tx && sy === ty)) return [];
    const id = (k: number, l: number) => `${k}:${l}`;
    const start = { k: key(sx, sy), l: slvl }; const startId = id(start.k, start.l);
    const prev = new Map<string, string>(); const info = new Map<string, { gx: number; gy: number; z: number }>();
    const seen = new Set([startId]); const q: { k: number; l: number }[] = [start];
    const N = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    while (q.length) {
      const cur = q.shift()!; const cx = cur.k % GRID, cy = (cur.k / GRID) | 0; const cid = id(cur.k, cur.l);
      if (cx === tx && cy === ty) { const path: { gx: number; gy: number; z: number }[] = []; let c = cid; while (c !== startId) { const inf = info.get(c); if (!inf) break; path.unshift(inf); c = prev.get(c)!; } return path; }
      for (const [dx, dy] of N) {
        const nx = cx + dx, ny = cy + dy; if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID) continue;
        const k2 = key(nx, ny); if (S[k2]) continue;
        if (dx && dy && S[key(cx + dx, cy)] && S[key(cx, cy + dy)]) continue;   // no diagonal through a corner
        for (let si = surf[k2].length - 1; si >= 0; si--) {   // prefer highest reachable surface (step ON, not under)
          const sz = surf[k2][si];
          if (Math.abs(sz - cur.l) > 1.001) continue;
          const i2 = id(k2, sz); if (seen.has(i2)) continue;
          seen.add(i2); prev.set(i2, cid); info.set(i2, { gx: nx, gy: ny, z: sz }); q.push({ k: k2, l: sz });
        }
      }
    }
    return null;
  };

  // ---- furniture ----
  const placeItem = (kind: string, gx: number, gy: number) => {
    if (!requireAccount()) return;
    if (!canBuildHere()) { flashHint('Sem permissão para construir aqui'); return; }
    // Inventory: non-mods need stock (free basics are unlimited). Mods build freely (creative mode).
    if (!modRef.current && furniCount(kind) < 1) { flashHint(isFurniFree(kind) ? 'Indisponível' : 'Sem stock — compra mais ✦'); return; }
    if (itemsRef.current.length >= MAX_ITEMS) { flashHint('Sala cheia'); return; }
    const mine = itemsRef.current.filter(i => i.createdBy === deviceRef.current).length;
    if (!modRef.current && mine >= PLACE_CAP) { flashHint(`Máximo ${PLACE_CAP} por pessoa`); return; }
    const dir = isRotatable(kind) ? placeDirRef.current : 0;
    const elev = defOf(kind).walk ? placeElevRef.current : 0;   // only walkable pieces float (decks/bridges)
    const [sw, sh] = effSpan(kind, dir);
    if (gx + sw > GRID || gy + sh > GRID) { flashHint('Não cabe aqui'); return; }
    for (let du = 0; du < sw; du++) for (let dv = 0; dv < sh; dv++) if (planLvl(gx + du, gy + dv) < 0) { flashHint('Não cabe aqui'); return; }
    if (!modRef.current) consumeFurni(kind);   // take one from inventory (free basics: no-op)
    const id = (crypto?.randomUUID?.() ?? `it_${Date.now()}_${Math.floor(Math.random() * 1e9)}`);
    const item: Item = { id, kind, gx, gy, dir, elev, createdBy: deviceRef.current };
    itemsRef.current.push(item); setMyCount(c => c + 1); rebuildHeight();
    channelRef.current?.send({ type: 'broadcast', event: 'place', payload: { id, kind, gx, gy, dir, elev, by: item.createdBy } });
    supabase?.from('room_items').insert({ id, room, kind: encodeKind(kind, dir, elev), x: gx, y: gy, created_by: item.createdBy }).then(undefined, () => {});
  };
  // Rotate the top item on a tile (own items / mods) one 90° step.
  const rotateAt = (gx: number, gy: number) => {
    const hit = [...itemsRef.current].reverse().find(i => { const [sw, sh] = effSpan(i.kind, i.dir || 0); return gx >= i.gx && gx < i.gx + sw && gy >= i.gy && gy < i.gy + sh && (canBuildHere() || i.createdBy === deviceRef.current); });
    if (!hit) return;
    if (!isRotatable(hit.kind)) { flashHint('Este objeto não roda'); return; }
    hit.dir = ((hit.dir ?? 0) + 1) % 4;
    channelRef.current?.send({ type: 'broadcast', event: 'rotate', payload: { id: hit.id, dir: hit.dir } });
    supabase?.from('room_items').update({ kind: encodeKind(hit.kind, hit.dir, hit.elev || 0) }).eq('id', hit.id).then(undefined, () => {});
  };
  const removeAt = (gx: number, gy: number) => {
    const hit = [...itemsRef.current].reverse().find(i => { const [sw, sh] = effSpan(i.kind, i.dir || 0); return gx >= i.gx && gx < i.gx + sw && gy >= i.gy && gy < i.gy + sh && (canBuildHere() || i.createdBy === deviceRef.current); });
    if (!hit) return;
    returnFurni(hit.kind);   // pick it up into MY inventory (free basics: no-op)
    itemsRef.current = itemsRef.current.filter(i => i.id !== hit.id);
    if (hit.createdBy === deviceRef.current) setMyCount(c => Math.max(0, c - 1)); rebuildHeight();
    channelRef.current?.send({ type: 'broadcast', event: 'unplace', payload: { id: hit.id } });
    supabase?.from('room_items').delete().eq('id', hit.id).then(undefined, () => {});
  };

  // ---- identity + realtime ----
  useEffect(() => {
    const lp = getLocalPlayer();
    deviceRef.current = lp.device || `guest_${Math.floor(Math.random() * 1e9)}`;
    if (!sessionRef.current) {
      // Per-TAB id (sessionStorage): survives a refresh (same id → presence replaces, no ghost duplicate)
      // but differs between tabs/windows (no collision). Falls back to a fresh id if storage is blocked.
      let s = ''; try { s = sessionStorage.getItem('ouroo_sess') || ''; } catch { /* ignore */ }
      if (!s) { s = (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random()}`).slice(0, 8); try { sessionStorage.setItem('ouroo_sess', s); } catch { /* ignore */ } }
      sessionRef.current = s;
    }
    // Presence/broadcast id is UNIQUE per session so two tabs/accounts never collide; ownership uses the stable device.
    selfRef.current.id = `${deviceRef.current}::${sessionRef.current}`;
    selfRef.current.handle = lp.handle || 'Convidado';
    myHandleRef.current = selfRef.current.handle; setMyHandle(selfRef.current.handle);
    const ap0 = getSelectedSkinId(); selfRef.current.skinId = ap0;
    const r0 = resolveAppearance(ap0); selfRef.current.icon = r0.kind === 'icon' ? r0.spec : null;
    refreshWalletFromCloud();
    setMyOwnerId(deviceRef.current); ownerIdRef.current = deviceRef.current;
    getAuthIdentity().then(a => { if (a?.handle) { selfRef.current.handle = a.handle; myHandleRef.current = a.handle; setMyHandle(a.handle); } if (a?.device) { setMyOwnerId(a.device); ownerIdRef.current = a.device; } });
    amIModerator().then(m => { modRef.current = m; setIsMod(m); });

    if (!supabase || !entered) return;   // wait for the lobby "Entrar" so the join is deliberate + clean
    const sb = supabase;
    const me = selfRef.current;
    remotesRef.current.clear(); itemsRef.current = []; rebuildHeight(); setPopulation(1); setConnected(false);
    let alive = true; let rejoinTimer: ReturnType<typeof setTimeout> | null = null;

    // (Re)create + subscribe the room channel. Auto-rejoins itself if the socket/channel drops.
    const connect = () => {
      if (!alive) return;
      const ch = sb.channel(`room:${room}`, { config: { presence: { key: me.id }, broadcast: { self: false } } });
      channelRef.current = ch;
      const rebuild = () => {
        const state = ch.presenceState() as Record<string, Array<Record<string, unknown>>>;
        const seen = new Set<string>([me.id]);
        for (const k in state) {
          const meta = state[k]?.[0]; if (!meta) continue; const id = String(meta.id ?? k); if (id === me.id) continue;
          seen.add(id); const fx = Number(meta.fx), fy = Number(meta.fy); let r = remotesRef.current.get(id); const lvl = Number(meta.lvl) || 0;
          if (!r) remotesRef.current.set(id, { handle: String(meta.handle ?? '???'), skinId: String(meta.skinId ?? 'diamond-gold'), icon: null, fx, fy, tx: fx, ty: fy, z: lvl, lvl, bubble: '', bubbleLife: 0, af: Math.random() * 100 });
          else { r.handle = String(meta.handle ?? r.handle); r.skinId = String(meta.skinId ?? r.skinId); r.lvl = lvl; }
        }
        for (const id of [...remotesRef.current.keys()]) if (!seen.has(id)) remotesRef.current.delete(id);
        setPopulation(remotesRef.current.size + 1);
      };
      ch.on('presence', { event: 'sync' }, rebuild)
        .on('broadcast', { event: 'pos' }, ({ payload }) => {
          const pl = payload as Record<string, unknown>; const id = String(pl?.id ?? ''); if (!id || id === me.id) return;
          const fx = Number(pl.fx), fy = Number(pl.fy); if (!Number.isFinite(fx) || !Number.isFinite(fy)) return;
          const lvl = Number(pl.lvl) || 0; const h = pl.h != null ? String(pl.h) : null; const s = pl.s != null ? String(pl.s) : null; const ic = parseIcon(pl.icon);
          let r = remotesRef.current.get(id);
          if (!r) { r = { handle: h ?? '…', skinId: s ?? 'diamond-gold', icon: ic, fx, fy, tx: fx, ty: fy, z: lvl, lvl, bubble: '', bubbleLife: 0, af: Math.random() * 100 }; remotesRef.current.set(id, r); setPopulation(remotesRef.current.size + 1); }
          else { r.tx = fx; r.ty = fy; r.lvl = lvl; if (h) r.handle = h; if (s) r.skinId = s; r.icon = ic; }
        })
        .on('broadcast', { event: 'say' }, ({ payload }) => {
          const pl = payload as Record<string, unknown>; const id = String(pl?.id ?? ''); const text = String(pl?.text ?? '');
          if (!id || id === me.id || !text) return; const r = remotesRef.current.get(id); if (r) { r.bubble = text; r.bubbleLife = BUBBLE_FRAMES; } pushFeed(r?.handle ?? '???', text);
        })
        .on('broadcast', { event: 'place' }, ({ payload }) => {
          const pl = payload as Record<string, unknown>; const id = String(pl?.id ?? ''); if (!id || itemsRef.current.some(i => i.id === id)) return;
          itemsRef.current.push({ id, kind: String(pl.kind), gx: Number(pl.gx), gy: Number(pl.gy), dir: Number(pl.dir) || 0, elev: Number(pl.elev) || 0, createdBy: String(pl.by ?? '') }); rebuildHeight();
        })
        .on('broadcast', { event: 'rotate' }, ({ payload }) => { const pl = payload as Record<string, unknown>; const id = String(pl?.id ?? ''); const it = itemsRef.current.find(i => i.id === id); if (it) it.dir = Number(pl.dir) || 0; })
        .on('broadcast', { event: 'unplace' }, ({ payload }) => { const id = String((payload as Record<string, unknown>)?.id ?? ''); itemsRef.current = itemsRef.current.filter(i => i.id !== id); rebuildHeight(); })
        .on('broadcast', { event: 'leave' }, ({ payload }) => { const id = String((payload as Record<string, unknown>)?.id ?? ''); if (id && remotesRef.current.delete(id)) setPopulation(remotesRef.current.size + 1); })   // someone left/refreshed → drop them now (don't wait for presence timeout)
        .subscribe(async status => {
          if (!alive) return;
          joinedRef.current = status === 'SUBSCRIBED';
          if (status === 'SUBSCRIBED') {
            setConnected(true);
            const a = await getAuthIdentity().catch(() => null); if (a?.handle) me.handle = a.handle;
            await ch.track({ id: me.id, handle: me.handle, skinId: me.skinId, fx: me.fx, fy: me.fy, lvl: me.lvl });   // small payload only — no nested objects
            const { data } = await sb.from('room_items').select('id,kind,x,y,created_by').eq('room', room).order('created_at');
            if (data) { itemsRef.current = data.map(d => { const dk = decodeKind(String(d.kind)); return { id: String(d.id), kind: dk.kind, dir: dk.dir, elev: dk.elev, gx: Number(d.x), gy: Number(d.y), createdBy: String(d.created_by ?? '') }; }); setMyCount(itemsRef.current.filter(i => i.createdBy === deviceRef.current).length); rebuildHeight(); }
          } else {
            setConnected(false);
            if (alive && (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT')) {   // self-heal: rebuild the channel
              if (rejoinTimer) clearTimeout(rejoinTimer);
              rejoinTimer = setTimeout(() => { try { sb.removeChannel(ch); } catch { /* ignore */ } connect(); }, 2000);
            }
          }
        });
    };
    connect();

    const onResume = () => { if (document.visibilityState === 'visible' && channelRef.current && joinedRef.current) { const m = selfRef.current; channelRef.current.track({ id: m.id, handle: m.handle, skinId: m.skinId, fx: m.fx, fy: m.fy, lvl: m.lvl }); } };
    // On unload (refresh / tab close / navigation) announce a leave so others drop us immediately,
    // then untrack — instead of leaving a frozen ghost until Supabase's presence heartbeat times out.
    const onLeave = () => { try { channelRef.current?.send({ type: 'broadcast', event: 'leave', payload: { id: me.id } }); channelRef.current?.untrack(); } catch { /* ignore */ } };
    document.addEventListener('visibilitychange', onResume); window.addEventListener('focus', onResume); window.addEventListener('online', onResume); window.addEventListener('pagehide', onLeave); window.addEventListener('beforeunload', onLeave);
    return () => { alive = false; if (rejoinTimer) clearTimeout(rejoinTimer); setConnected(false); joinedRef.current = false; onLeave(); document.removeEventListener('visibilitychange', onResume); window.removeEventListener('focus', onResume); window.removeEventListener('online', onResume); window.removeEventListener('pagehide', onLeave); window.removeEventListener('beforeunload', onLeave); try { if (channelRef.current) sb.removeChannel(channelRef.current); } catch { /* ignore */ } channelRef.current = null; };
  }, [room, entered]);

  // ---- main loop ----
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false }) as CanvasRenderingContext2D; if (!ctx) return;
    canvas.width = STAGE_W; canvas.height = STAGE_H;
    const update = () => {
      framesRef.current++;
      const me = selfRef.current;
      let moving = false;
      if (me.path.length) {
        const wp = me.path[0]; const dx = wp.gx - me.fx, dy = wp.gy - me.fy; const d = Math.hypot(dx, dy);
        if (d < 0.12) { me.fx = wp.gx; me.fy = wp.gy; me.lvl = wp.z; me.path.shift(); }
        else { const s = Math.min(WALK, d); me.fx += dx / d * s; me.fy += dy / d * s; moving = true; me.af += 1; }
      }
      if (!moving) me.af += 0.3;
      const targetZ = me.path.length ? me.path[0].z : me.lvl;   // climb toward the next surface as we walk
      me.z += (targetZ - me.z) * 0.25;
      if (me.bubbleLife > 0) me.bubbleLife--;
      const ch = channelRef.current;
      if (ch && joinedRef.current) {   // only emit while actually joined — never REST-fallback flood a dead channel
        const posPayload = () => ({ id: me.id, h: me.handle, s: me.skinId, icon: me.icon ?? undefined, fx: +me.fx.toFixed(2), fy: +me.fy.toFixed(2), lvl: me.lvl });
        if (moving && ++posAccum.current >= 8) { posAccum.current = 0; ch.send({ type: 'broadcast', event: 'pos', payload: posPayload() }); }
        if (wasMovingRef.current && !moving) ch.send({ type: 'broadcast', event: 'pos', payload: posPayload() });   // final position; no mid-session re-track (that bounced the channel)
      }
      wasMovingRef.current = moving;
      for (const r of remotesRef.current.values()) { r.fx += (r.tx - r.fx) * 0.3; r.fy += (r.ty - r.fy) * 0.3; r.z += (r.lvl - r.z) * 0.28; r.af += Math.hypot(r.tx - r.fx, r.ty - r.fy) > 0.02 ? 1 : 0.3; if (r.bubbleLife > 0) r.bubbleLife--; }
    };

    const diamond = (cx: number, cy: number, hw: number, hh: number) => { ctx.beginPath(); ctx.moveTo(cx, cy - hh); ctx.lineTo(cx + hw, cy); ctx.lineTo(cx, cy + hh); ctx.lineTo(cx - hw, cy); ctx.closePath(); };
    // Furni sprites are drawn by the shared renderer in @/lib/furniRender (drawFurniSprite).

    const drawAvatar = (a: Avatar, isSelf: boolean) => {
      const wade = isWater(clampTile(a.fx), clampTile(a.fy)) ? 6 : 0;   // sink + ripple when standing in a pool
      const p = iso(a.fx, a.fy, a.z); const sx = p.sx, sy = p.sy + wade;
      const col = a.icon ? iconPrimaryColor(a.icon) : skinById(a.skinId).color;
      const moving = isSelf ? selfRef.current.path.length > 0 : Math.hypot(a.tx - a.fx, a.ty - a.fy) > 0.02;
      if (wade) { ctx.save(); ctx.strokeStyle = hexA('#bff2ff', 0.7); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(sx, sy, 15 + Math.sin(framesRef.current * 0.12) * 2, 7, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }
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
      const theme = themeRef.current; const t = framesRef.current; const day = !!theme.day;
      const bg = ctx.createLinearGradient(0, 0, 0, STAGE_H);
      if (day) { bg.addColorStop(0, '#aedcff'); bg.addColorStop(0.5, '#cfeaff'); bg.addColorStop(1, '#eaf6ef'); }
      else { bg.addColorStop(0, '#08080e'); bg.addColorStop(0.55, '#0b0912'); bg.addColorStop(1, '#0a0610'); }
      ctx.fillStyle = bg; ctx.fillRect(0, 0, STAGE_W, STAGE_H);
      if (day) {   // soft sun glow + drifting clouds instead of dust motes
        ctx.save(); const sun = ctx.createRadialGradient(STAGE_W * 0.78, 120, 10, STAGE_W * 0.78, 120, 230); sun.addColorStop(0, 'rgba(255,250,224,0.9)'); sun.addColorStop(1, 'rgba(255,250,224,0)'); ctx.fillStyle = sun; ctx.fillRect(0, 0, STAGE_W, 360);
        ctx.fillStyle = 'rgba(255,255,255,0.5)'; for (let i = 0; i < 5; i++) { const cx = ((i * 320 + t * 0.25) % (STAGE_W + 240)) - 120, cy = 60 + (i % 3) * 46; ctx.beginPath(); ctx.ellipse(cx, cy, 60, 17, 0, 0, Math.PI * 2); ctx.ellipse(cx + 40, cy + 6, 44, 14, 0, 0, Math.PI * 2); ctx.ellipse(cx - 36, cy + 7, 38, 12, 0, 0, Math.PI * 2); ctx.fill(); } ctx.restore();
      } else { ctx.save(); ctx.fillStyle = '#fff'; for (let i = 0; i < 22; i++) { const mx = (i * 197.3) % STAGE_W; const my = (i * 71 + t * (0.12 + (i % 4) * 0.05)) % 210; ctx.globalAlpha = 0.03 + (i % 5) * 0.012; ctx.fillRect(mx, 200 - my, 2, 2); } ctx.restore(); }
      ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '900 58px Helvetica, Arial'; ctx.shadowColor = theme.accent; ctx.shadowBlur = 30; ctx.fillStyle = hexA(theme.accent, 0.92); ctx.fillText(theme.name.toUpperCase(), STAGE_W / 2, 70); ctx.shadowBlur = 0; ctx.font = '700 12px monospace'; ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fillText(theme.owner ? '· SALA PESSOAL ·' : theme.locked ? '· CURADA ·' : '· S U A V ·', STAGE_W / 2, 102); ctx.restore();

      // camera: scale + position the whole room so its footprint fits the stage (bigger rooms zoom out)
      const cam = camRef.current; ctx.save(); ctx.translate(cam.x, cam.y); ctx.scale(cam.s, cam.s);

      // floor + walls follow the room PLAN: skip void tiles, raise each to its base level, draw side
      // risers (floor thickness) toward lower/void neighbours, and back walls only behind the footprint.
      const plan = planRef.current; const wh = WALL_H * STACK_H;
      const lvl = (gx: number, gy: number) => (gx < 0 || gy < 0 || gx >= GRID || gy >= GRID ? -1 : plan[gy * GRID + gx]);
      for (let gx = 0; gx < GRID; gx++) for (let gy = 0; gy < GRID; gy++) {
        const L = lvl(gx, gy); if (L < 0) continue;
        const b = iso(gx, gy, L);
        const top = b.sy - TH, rX = b.sx + TW, lX = b.sx - TW, botY = b.sy + TH;
        // back walls behind edges whose neighbour is absent (up-right = gy-1, up-left = gx-1)
        if (lvl(gx, gy - 1) < 0) { ctx.fillStyle = shade(theme.floor, 1.5); ctx.beginPath(); ctx.moveTo(b.sx, top); ctx.lineTo(rX, b.sy); ctx.lineTo(rX, b.sy - wh); ctx.lineTo(b.sx, top - wh); ctx.closePath(); ctx.fill(); }
        if (lvl(gx - 1, gy) < 0) { ctx.fillStyle = shade(theme.floor, 1.0); ctx.beginPath(); ctx.moveTo(b.sx, top); ctx.lineTo(lX, b.sy); ctx.lineTo(lX, b.sy - wh); ctx.lineTo(b.sx, top - wh); ctx.closePath(); ctx.fill(); }
        // side risers toward lower front neighbours (down-right = gx+1, down-left = gy+1); void drops to 0
        const rn = lvl(gx + 1, gy), dr = (L - (rn < 0 ? 0 : rn)) * STACK_H;
        if (rn < L && dr > 0) { ctx.fillStyle = shade(theme.floor, 0.6); ctx.beginPath(); ctx.moveTo(b.sx, botY); ctx.lineTo(rX, b.sy); ctx.lineTo(rX, b.sy + dr); ctx.lineTo(b.sx, botY + dr); ctx.closePath(); ctx.fill(); }
        const ln = lvl(gx, gy + 1), dl = (L - (ln < 0 ? 0 : ln)) * STACK_H;
        if (ln < L && dl > 0) { ctx.fillStyle = shade(theme.floor, 0.42); ctx.beginPath(); ctx.moveTo(b.sx, botY); ctx.lineTo(lX, b.sy); ctx.lineTo(lX, b.sy + dl); ctx.lineTo(b.sx, botY + dl); ctx.closePath(); ctx.fill(); }
        // top face — water tiles render as a sunken animated pool, else solid floor
        if (waterRef.current[gy * GRID + gx] === 1) {
          diamond(b.sx, b.sy + 5, TW, TH); ctx.fillStyle = '#05202c'; ctx.fill();                      // sunken basin shadow
          diamond(b.sx, b.sy + 2, TW, TH); ctx.fillStyle = hexA('#127a99', 0.92); ctx.fill();          // water body
          const ph = Math.sin((gx * 0.7 + gy * 0.5) + t * 0.05) * 0.5 + 0.5;                            // moving caustics
          ctx.fillStyle = hexA('#8fe6ff', 0.10 + ph * 0.16); ctx.fill();
          ctx.strokeStyle = hexA('#bff2ff', 0.22); ctx.lineWidth = 1; ctx.stroke();
        } else {
          diamond(b.sx, b.sy, TW, TH); ctx.fillStyle = theme.floor; ctx.fill();
          ctx.fillStyle = (gx + gy) % 2 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.22)'; ctx.fill();
          ctx.strokeStyle = hexA(theme.accent, 0.10); ctx.lineWidth = 1; ctx.stroke();
        }
      }
      const hv = hoverRef.current, ui = uiRef.current;
      if (ui.decorOpen && (ui.placingKind || ui.removeMode || ui.rotateMode) && hv && lvl(hv.gx, hv.gy) >= 0) { const { sx, sy } = iso(hv.gx, hv.gy, lvl(hv.gx, hv.gy)); diamond(sx, sy, TW, TH); ctx.fillStyle = hexA(ui.removeMode ? '#ff4e3e' : theme.accent, 0.3); ctx.fill(); ctx.strokeStyle = ui.removeMode ? '#ff4e3e' : theme.accent; ctx.lineWidth = 2; ctx.stroke(); }

      // support posts under a floating deck (so it reads as a bridge)
      const drawSupports = (it: Item, z: number, sw: number, sh: number) => {
        ctx.fillStyle = 'rgba(18,18,26,0.55)';
        for (let du = 0; du < sw; du++) for (let dv = 0; dv < sh; dv++) { const { sx, sy } = iso(it.gx + du, it.gy + dv, 0); ctx.fillRect(sx - 2.5, sy - z * STACK_H, 5, z * STACK_H); }
      };
      // depth-sorted furni + avatars (sorted by tile + surface level so layers occlude correctly)
      const ents: Array<{ s: number; draw: () => void }> = [];
      const allItems = decorRef.current.length ? itemsRef.current.concat(decorRef.current) : itemsRef.current;
      for (const it of allItems) { const dd = defOf(it.kind); const [sw, sh] = effSpan(it.kind, it.dir || 0); const ii = it, lift = it.elev || 0, zb = Math.max(0, planLvl(it.gx, it.gy)), z = zb + lift; const surfZ = z + (dd.h || 0); ents.push({ s: (it.gx + sw - 1) + (it.gy + sh - 1) + surfZ * 0.02, draw: () => { if (lift > 0 && dd.walk) drawSupports(ii, z, sw, sh); const { sx, sy } = iso(ii.gx, ii.gy, z); drawFurniSprite(ctx, ii.kind, sx, sy, theme.accent, framesRef.current, ii.dir || 0); } }); }
      // an avatar sitting on a (possibly multi-tile) seat must sort ABOVE it — multi-tile sprites
      // sort by their front corner, so add a boost when standing on a seat's footprint.
      const seatBoost = (fx: number, fy: number) => { const cx = clampTile(fx), cy = clampTile(fy); for (const it of allItems) { if (sitHeight(it.kind) == null) continue; const [sw, sh] = effSpan(it.kind, it.dir || 0); if (cx >= it.gx && cx < it.gx + sw && cy >= it.gy && cy < it.gy + sh) return 1.2; } return 0; };
      for (const n of npcsRef.current) { const nn = n; ents.push({ s: nn.fx + nn.fy + nn.z * 0.02 + 0.005 + seatBoost(nn.fx, nn.fy), draw: () => drawAvatar(nn, false) }); }
      ents.push({ s: selfRef.current.fx + selfRef.current.fy + selfRef.current.z * 0.02 + 0.01 + seatBoost(selfRef.current.fx, selfRef.current.fy), draw: () => drawAvatar(selfRef.current, true) });
      for (const r of remotesRef.current.values()) { const rr = r; ents.push({ s: rr.fx + rr.fy + rr.z * 0.02 + 0.01 + seatBoost(rr.fx, rr.fy), draw: () => drawAvatar(rr, false) }); }
      ents.sort((a, b) => a.s - b.s); for (const e of ents) e.draw();
      ctx.restore();

      const vig = ctx.createRadialGradient(STAGE_W / 2, STAGE_H * 0.54, STAGE_H * 0.34, STAGE_W / 2, STAGE_H * 0.54, STAGE_H * 0.85);
      vig.addColorStop(0, 'rgba(0,0,0,0)'); vig.addColorStop(1, day ? 'rgba(20,40,30,0.22)' : 'rgba(0,0,0,0.5)'); ctx.fillStyle = vig; ctx.fillRect(0, 0, STAGE_W, STAGE_H);
    };

    let last = 0, acc = 0; const STEP = 1000 / 60;
    const loop = (now: number) => { rafRef.current = requestAnimationFrame(loop); if (last === 0) last = now; let dt = now - last; last = now; if (dt > 250) dt = 250; acc += dt; let n = 0; while (acc >= STEP && n < 5) { update(); acc -= STEP; n++; } draw(); };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const evtTile = (e: React.PointerEvent) => {
    const canvas = canvasRef.current!; const rect = canvas.getBoundingClientRect();
    const sx = (e.clientX - rect.left) / rect.width * STAGE_W, sy = (e.clientY - rect.top) / rect.height * STAGE_H;
    const cam = camRef.current; const wx = (sx - cam.x) / cam.s, wy = (sy - cam.y) / cam.s;   // invert the room camera
    const raw = worldToTile(wx, wy); let gx = clampTile(raw.gx), gy = clampTile(raw.gy);
    // Prefer a RAISED tile whose lifted top is under the cursor (so clicks land on raised floors).
    for (let L = 1; L <= 9; L++) { const r = worldToTile(wx, wy + L * STACK_H); const cx = Math.round(r.gx), cy = Math.round(r.gy); if (cx >= 0 && cy >= 0 && cx < GRID && cy < GRID && planLvl(cx, cy) === L) { gx = cx; gy = cy; } }
    return { gx, gy, raw };
  };
  const onPointerDown = (e: React.PointerEvent) => {
    const { gx, gy } = evtTile(e);
    if (planLvl(gx, gy) < 0) return;   // clicked off the room footprint / a void tile
    if (placingKind) { placeItem(placingKind, gx, gy); return; }
    if (removeMode) { removeAt(gx, gy); return; }
    if (rotateMode) { rotateAt(gx, gy); return; }
    const me = selfRef.current; const p = findPath(clampTile(me.fx), clampTile(me.fy), me.lvl, gx, gy); if (p && p.length) me.path = p;
  };
  const onPointerMove = (e: React.PointerEvent) => { if (!decorOpen) { hoverRef.current = null; return; } const { gx, gy } = evtTile(e); hoverRef.current = planLvl(gx, gy) < 0 ? null : { gx, gy }; };

  return (
    <div ref={outerRef} className="relative w-full h-full select-none overflow-hidden bg-black" style={{ touchAction: 'none', WebkitUserSelect: 'none', userSelect: 'none' }}>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="relative shrink-0 origin-center" style={{ width: STAGE_W, height: STAGE_H, transform: `scale(${fitScale})` }}>
          <canvas ref={canvasRef} onPointerDown={onPointerDown} onPointerMove={onPointerMove} className="absolute inset-0 block w-full h-full" />
        </div>
      </div>

      {!entered && (
        <div className="absolute inset-0 z-[60] bg-black/92 backdrop-blur-sm flex items-center justify-center px-6">
          <div className="w-full max-w-md text-center">
            <p className="text-[11px] uppercase tracking-[0.4em] text-white/40 mb-2">Sala Social · Beta</p>
            <h2 className="font-helvetica font-black text-5xl text-white leading-none mb-4">PRAÇA<span style={{ color: roomMeta.accent }}>.</span></h2>
            <p className="text-white/60 text-sm leading-relaxed mb-3">Um espaço isométrico em tempo real. Entra com a tua skin, passeia pelos tiles e vê toda a gente ao vivo — fala com balões por cima da cabeça e decora a sala.</p>
            <ul className="text-white/45 text-[12px] leading-relaxed mb-6 space-y-0.5 inline-block text-left">
              <li>· Toca num tile para andar — senta-te em sofás e cadeiras</li>
              <li>· <span className="text-brandYellow">✦ Decorar</span> — móveis, alturas, pontes e túneis</li>
              <li>· <span className="text-white/70">☻ Personagem</span> — troca a skin ou o teu ícone</li>
            </ul>
            <button onClick={() => setEntered(true)} className="w-full bg-[#00cfff] text-black font-bold uppercase tracking-[0.2em] text-sm py-3.5 hover:bg-white transition-colors active:scale-[0.99]">Entrar na Praça ▸</button>
            {onExit && <button onClick={onExit} className="mt-3 text-[11px] uppercase tracking-[0.2em] text-white/40 hover:text-white transition-colors">← Voltar</button>}
          </div>
        </div>
      )}

      <div className="absolute top-3 left-4 z-40 pointer-events-none">
        <p className="font-helvetica font-black text-xl text-white leading-none uppercase">{roomMeta.name}</p>
        <p className="text-[11px] uppercase tracking-[0.2em] text-white/45 mt-1">{supabaseReady ? (connected ? `${population} ${population === 1 ? 'pessoa' : 'pessoas'}` : 'a ligar…') : 'offline'}</p>
      </div>

      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-40 flex gap-2">
        <button onClick={() => setShowRooms(s => !s)} className="text-[11px] font-mono uppercase tracking-widest text-white border border-white/25 bg-black/50 px-3 py-1.5 hover:bg-white hover:text-black transition-all">⤧ Salas</button>
        <button onClick={() => setInvOpen(true)} className="text-[11px] font-mono uppercase tracking-widest text-white border border-white/25 bg-black/50 px-3 py-1.5 hover:bg-white hover:text-black transition-all">☻ <span className="text-brandYellow">{CURRENCY_SYMBOL}{wallet.balance.toLocaleString('pt-PT')}</span></button>
        {!locked && <button onClick={() => { if (!decorOpen && !requireAccount()) return; setDecorOpen(o => !o); setPlacingKind(null); setRemoveMode(false); }} className={`text-[11px] font-mono uppercase tracking-widest border px-3 py-1.5 transition-all ${decorOpen ? 'bg-brandYellow text-black border-brandYellow' : 'text-white border-white/25 bg-black/50 hover:bg-white hover:text-black'}`}>✦ Decorar</button>}
      </div>

      {(hint || placingKind || removeMode) && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-40 pointer-events-none text-[11px] font-mono uppercase tracking-widest bg-black/70 px-3 py-1" style={{ color: hint ? '#ff4e3e' : '#ffe65c' }}>
          {hint || (placingKind ? 'toca num tile · clica de novo para empilhar' : 'toca para apanhar (volta ao teu inventário)')}
        </div>
      )}

      {decorOpen && !locked && (
        <div className="absolute z-40 left-1/2 -translate-x-1/2 w-full max-w-2xl px-2 sm:px-3" style={{ bottom: 'calc(max(0.75rem, env(safe-area-inset-bottom)) + 52px)' }}>
          <div className="bg-black/85 backdrop-blur-md border border-white/15 rounded-xl overflow-hidden shadow-2xl">
            {/* header: count + altura (for floating decks) + balance */}
            <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b border-white/10">
              <span className="text-[10px] font-mono uppercase tracking-widest text-white/50 shrink-0">{isMod ? 'moderador' : `objetos ${myCount}/${PLACE_CAP}`}</span>
              {placingKind && defOf(placingKind).walk && (
                <span className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest text-[#00cfff]">
                  Altura
                  <button onClick={() => setPlaceElev(e => Math.max(0, e - 1))} className="w-5 h-5 border border-[#00cfff]/40 leading-none hover:bg-[#00cfff]/15">▼</button>
                  <span className="w-3 text-center text-white">{placeElev}</span>
                  <button onClick={() => setPlaceElev(e => Math.min(6, e + 1))} className="w-5 h-5 border border-[#00cfff]/40 leading-none hover:bg-[#00cfff]/15">▲</button>
                </span>
              )}
              <span className="text-[10px] font-mono uppercase tracking-widest text-brandYellow shrink-0">{CURRENCY_SYMBOL} {wallet.balance.toLocaleString('pt-PT')}</span>
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
              <button onClick={() => { setRemoveMode(r => !r); setPlacingKind(null); setRotateMode(false); }} title="Apanhar"
                className={`shrink-0 flex flex-col items-center gap-0.5 w-[3.1rem] py-1 rounded-lg transition-colors ${removeMode ? 'bg-brandRed/20' : 'hover:bg-white/5'}`}>
                <CatIcon catId="remove" size={22} color={removeMode ? '#ff4e3e' : '#cfd2dc'} />
                <span className={`text-[7px] uppercase tracking-wide leading-none ${removeMode ? 'text-brandRed' : 'text-white/50'}`}>Apanhar</span>
              </button>
            </div>
            {/* item grid — 2 rows, horizontal scroll, drawn thumbnails + price/owned */}
            {removeMode ? (
              <p className="text-[11px] text-center text-brandRed/80 py-4 px-3">Toca num objeto para o apanhar — volta ao teu inventário.</p>
            ) : rotateMode ? (
              <p className="text-[11px] text-center text-[#00cfff]/90 py-4 px-3">Toca num objeto para o rodar (assentos, TV, bar, frigorífico, máquinas…).</p>
            ) : (
              <div className="grid grid-rows-2 grid-flow-col auto-cols-max gap-1.5 overflow-x-auto p-2" style={{ maxHeight: '9.5rem' }}>
                {FURNI.filter(f => f.cat === cat).map(f => {
                  const free = isFurniFree(f.kind);
                  const n = furniCount(f.kind);          // Infinity for free basics
                  const canPlace = isMod || n > 0;
                  const sel = placingKind === f.kind;
                  return (
                    <button key={f.kind} onClick={() => {
                      if (!canPlace) { const r = buyFurni(f.kind); flashHint(r.ok ? 'Comprado ✦ — toca para colocar' : (r.error || 'Sem Cristais')); return; }
                      setPlacingKind(k => k === f.kind ? null : f.kind); setRemoveMode(false); setRotateMode(false);
                    }} className={`relative flex flex-col items-center justify-start gap-0.5 w-[4rem] h-[4rem] border rounded-lg pt-1 transition-colors ${sel ? 'border-brandYellow bg-brandYellow/15' : canPlace ? 'border-white/12 bg-white/[0.03] hover:border-white/40' : 'border-white/10 bg-black/40 hover:border-brandYellow/50'}`}>
                      <FurniSprite kind={f.kind} size={38} accent={roomMeta.accent} />
                      <span className="text-[7px] uppercase tracking-wide leading-none text-center text-white/65 truncate w-full px-0.5">{f.name}</span>
                      {!free && Number.isFinite(n) && n > 0 && <span className="absolute top-0.5 right-0.5 text-[8px] font-bold text-white bg-black/75 px-1 rounded tabular-nums">×{n}</span>}
                      {!canPlace && <span className="absolute top-0.5 right-0.5 text-[7px] font-bold text-brandYellow bg-black/75 px-1 rounded">{CURRENCY_SYMBOL}{furniPrice(f.kind)}</span>}
                      {sel && <span className="absolute top-0.5 left-0.5 w-1.5 h-1.5 rounded-full bg-brandYellow" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {showRooms && (() => {
        const myKeys = new Set(myRooms.map(r => r.slug));
        const community = personalRooms.filter(r => r.owner !== myOwnerId && !myKeys.has(r.slug));
        const roomBtn = (d: RoomDef, tag?: string) => (
          <button key={d.slug} onClick={() => switchRoom(d)} className={`flex items-center gap-3 p-3 border transition-colors ${d.slug === room ? 'border-white bg-white/5' : 'border-white/15 hover:border-white/40'}`}>
            <span className="w-4 h-4 rounded-full shrink-0" style={{ background: d.accent, boxShadow: `0 0 10px ${d.accent}` }} />
            <span className="font-bold text-white truncate">{d.name}</span>
            {d.locked && <span className="text-[10px] uppercase tracking-widest text-white/40">🔒</span>}
            <span className="ml-auto text-[10px] uppercase tracking-widest text-white/40">{d.slug === room ? 'aqui' : tag || ''}</span>
          </button>
        );
        const copyCode = (c: string) => { try { navigator.clipboard?.writeText(c); flashHint(`Código ${c} copiado`); } catch { /* ignore */ } };
        return (
          <div className="absolute inset-0 z-50 bg-black/80 flex justify-center overflow-y-auto px-6 py-10" onClick={() => setShowRooms(false)}>
            <div className="w-full max-w-sm bg-black border border-white/15 p-5 h-fit" onClick={e => e.stopPropagation()}>
              <p className="text-[11px] uppercase tracking-[0.3em] text-white/40 mb-2">Salas oficiais</p>
              <div className="flex flex-col gap-2">{ROOMS.map(r => roomBtn(r))}</div>

              {myRooms.length > 0 && (<>
                <p className="text-[11px] uppercase tracking-[0.3em] text-white/40 mt-5 mb-2">As tuas salas</p>
                <div className="flex flex-col gap-2">{myRooms.map(r => (
                  <div key={r.slug} className={`flex items-center gap-2 p-3 border ${r.slug === room ? 'border-white bg-white/5' : 'border-white/15'}`}>
                    <button onClick={() => switchRoom(roomDefOf(r))} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                      <span className="w-4 h-4 rounded-full shrink-0" style={{ background: r.accent, boxShadow: `0 0 10px ${r.accent}` }} />
                      <span className="font-bold text-white truncate">{r.name}</span>
                      {!r.public && <span className="text-[10px] uppercase tracking-widest text-white/40">🔒 privada</span>}
                    </button>
                    {(r.build_all || (r.rights ?? []).length > 0) && <span title={r.build_all ? 'Todos podem construir' : `${r.rights.length} com permissão`} className="text-[10px] text-[#1ED760] shrink-0">{r.build_all ? '✦ aberta' : `+${r.rights.length}`}</span>}
                    {r.code && <button onClick={() => copyCode(r.code)} title="Copiar código de convite" className="text-[11px] font-mono tracking-widest text-[#00cfff] border border-[#00cfff]/30 px-2 py-1 hover:bg-[#00cfff]/10">{r.code}</button>}
                    <button onClick={() => openPerms(r)} title="Permissões" className="text-white/40 hover:text-white text-base leading-none px-1">⚙</button>
                    <button onClick={() => doDeleteRoom(r)} title="Apagar sala" className="text-white/30 hover:text-brandRed text-lg leading-none px-1">✕</button>
                  </div>
                ))}</div>
              </>)}

              {community.length > 0 && (<>
                <p className="text-[11px] uppercase tracking-[0.3em] text-white/40 mt-5 mb-2">Salas da comunidade</p>
                <div className="flex flex-col gap-2 max-h-60 overflow-y-auto">{community.map(r => roomBtn(roomDefOf(r)))}</div>
              </>)}

              <p className="text-[11px] uppercase tracking-[0.3em] text-white/40 mt-5 mb-2">Entrar com código</p>
              <div className="flex gap-2">
                <input value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())} maxLength={6} placeholder="CÓDIGO" onKeyDown={e => { if (e.key === 'Enter') doJoinByCode(); }}
                  className="flex-1 min-w-0 bg-white/5 border border-white/15 text-white px-3 py-2 text-sm tracking-[0.3em] font-mono outline-none focus:border-[#00cfff]" />
                <button onClick={doJoinByCode} className="bg-white/10 text-white font-bold uppercase text-xs tracking-widest px-4 hover:bg-white hover:text-black transition-colors active:scale-95">Entrar</button>
              </div>

              <p className="text-[11px] uppercase tracking-[0.3em] text-white/40 mt-5 mb-2">Cria a tua sala</p>
              <p className="text-[10px] uppercase tracking-widest text-white/35 mb-1.5">Forma da sala</p>
              <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
                {ROOM_PLANS.map(p => (
                  <button key={p.id} onClick={() => setNewRoomPlan(p.id)} title={p.name}
                    className={`shrink-0 flex flex-col items-center gap-1 p-1.5 border rounded transition-colors ${newRoomPlan === p.id ? 'border-[#00cfff] bg-[#00cfff]/10' : 'border-white/12 hover:border-white/40'}`}>
                    <PlanThumb plan={p} accent="#00cfff" />
                    <span className="text-[8px] uppercase tracking-wide text-white/60">{p.name}</span>
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input value={newRoomName} onChange={e => setNewRoomName(e.target.value)} maxLength={24} placeholder="Nome da sala"
                  className="flex-1 min-w-0 bg-white/5 border border-white/15 text-white px-3 py-2 text-sm outline-none focus:border-[#00cfff]" />
                <button onClick={doCreateRoom} className="bg-[#00cfff] text-black font-bold uppercase text-xs tracking-widest px-4 hover:bg-white transition-colors active:scale-95">Criar</button>
              </div>
              <label className="flex items-center gap-2 mt-2 text-[11px] text-white/55 cursor-pointer">
                <input type="checkbox" checked={newRoomPrivate} onChange={e => setNewRoomPrivate(e.target.checked)} className="accent-[#00cfff]" />
                Privada — só por código (não aparece na lista)
              </label>
              <p className="text-[10px] text-white/35 mt-2">A tua sala é tua para decorar. Partilha o <span className="text-[#00cfff]">código</span> para convidar e dá permissão (⚙) a quem quiseres. Nas salas oficiais só os moderadores constroem.</p>
            </div>
          </div>
        );
      })()}

      {permsRoom && (
        <div className="absolute inset-0 z-[60] bg-black/85 flex justify-center overflow-y-auto px-6 py-10" onClick={() => setPermsRoom(null)}>
          <div className="w-full max-w-sm bg-black border border-white/15 p-5 h-fit" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <p className="text-[11px] uppercase tracking-[0.3em] text-white/40">Permissões</p>
              <button onClick={() => setPermsRoom(null)} className="text-white/40 hover:text-white text-lg leading-none">✕</button>
            </div>
            <p className="font-bold text-white truncate mb-4">{permsRoom.name}</p>

            <label className="flex items-center gap-3 p-3 border border-white/15 cursor-pointer hover:border-white/35">
              <input type="checkbox" checked={permsAll} onChange={e => setPermsAll(e.target.checked)} className="accent-[#1ED760] w-4 h-4" />
              <span className="text-sm text-white">Todos podem construir<br /><span className="text-[11px] text-white/45">Qualquer visitante pode largar e apanhar móveis.</span></span>
            </label>

            <p className={`text-[11px] uppercase tracking-[0.3em] text-white/40 mt-5 mb-2 ${permsAll ? 'opacity-40' : ''}`}>Pessoas com permissão</p>
            <div className={`flex flex-col gap-2 ${permsAll ? 'opacity-40 pointer-events-none' : ''}`}>
              {permsList.length === 0 && <p className="text-[11px] text-white/35">Ninguém ainda. Adiciona pelo handle.</p>}
              {permsList.map(h => (
                <div key={h} className="flex items-center gap-2 px-3 py-2 border border-white/12 bg-white/[0.03]">
                  <span className="flex-1 min-w-0 truncate text-sm text-white">{h}</span>
                  <button onClick={() => setPermsList(l => l.filter(x => x !== h))} title="Remover" className="text-white/30 hover:text-brandRed text-lg leading-none px-1">✕</button>
                </div>
              ))}
              <div className="flex gap-2">
                <input value={permsHandle} onChange={e => setPermsHandle(e.target.value)} maxLength={32} placeholder="Handle da pessoa" onKeyDown={e => { if (e.key === 'Enter') addPermHandle(); }}
                  className="flex-1 min-w-0 bg-white/5 border border-white/15 text-white px-3 py-2 text-sm outline-none focus:border-[#1ED760]" />
                <button onClick={addPermHandle} className="bg-white/10 text-white font-bold uppercase text-xs tracking-widest px-4 hover:bg-white hover:text-black transition-colors active:scale-95">Add</button>
              </div>
            </div>
            <p className="text-[10px] text-white/35 mt-2">O handle tem de bater certo com o nome da conta da pessoa. Construir inclui apanhar/tirar móveis.</p>

            <button onClick={savePerms} className="w-full mt-4 bg-[#1ED760] text-black font-bold uppercase text-xs tracking-widest py-2.5 hover:bg-white transition-colors active:scale-95">Guardar</button>
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
