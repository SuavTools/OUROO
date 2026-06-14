'use client';

// OUROO PRAÇA — isometric social room with a big furni catalogue + Habbo-style heights:
// furni has height, you walk ON walkable pieces, and you can only step up/down ONE level at a
// time (so a height-2 thing blocks you — build stairs out of 1-high pieces to go up). Live via
// Supabase presence/broadcast; furni persists in room_items. Some rooms are locked (curated).

import React, { useEffect, useRef, useState } from 'react';
import { supabase, supabaseReady } from '@/lib/supabase';
import { getLocalPlayer } from '@/lib/leaderboard';
import { getAuthIdentity, useUser, signInWithDiscord } from '@/lib/auth';
import { amIModerator, amISuperAdmin } from '@/lib/chat';
import { drawSkinShape, skinById, getSelectedSkinId, SKINS } from '@/lib/skins';
import { grantSkin, getJarTotal } from '@/lib/economy';
import { validateMessage } from '@/lib/names';
import { CATS, FURNI, defOf, furniPrice, sitHeight, isRotatable, isFurniFree } from '@/lib/furni';
import { type IconSpec, drawIconSpec, iconPrimaryColor } from '@/lib/icons';
import { drawPerson, parsePerson, personPrimaryColor } from '@/lib/person';
import { resolveAppearance } from '@/lib/catalog';
import { buyFurni, furniCount, consumeFurni, returnFurni, refreshWalletFromCloud, useWallet, CURRENCY_SYMBOL, addBalance } from '@/lib/wallet';
import { InventoryModal } from '@/components/InventoryModal';
import { CatIcon, FurniSprite, PrefabThumb } from '@/components/UiIcon';
import { PREFABS, PREFAB_GROUPS, type Prefab } from '@/lib/prefabs';
import { drawFurniSprite, effSpan } from '@/lib/furniRender';
import { type RoomRow, fetchRooms, fetchMyRooms, roomByCode, roomBySlug, setRoomPublic, createRoom, deleteRoom, updateRoomPerms } from '@/lib/rooms';
import { type RoomPlan, ROOM_PLANS, PLAN_GRID, planById, planMask, planWaterMask, planMaterialMask, planSpawn } from '@/lib/roomPlans';
import { RoomMusic } from '@/lib/roomMusic';
import { Oracle } from '@/components/Oracle';
import { MenuModal } from '@/components/MenuModal';
import { GlitchSequence } from '@/components/GlitchSequence';
import { AdminModal } from '@/components/AdminModal';
import { SkinPreview } from '@/components/SkinPreview';
import { NpcEditor, type NpcData } from '@/components/NpcEditor';

const STAGE_W = 1280, STAGE_H = 720;
const GRID = PLAN_GRID;   // max grid (array stride); the actual room footprint comes from its plan
const TILE_W = 64, TILE_H = 32, TW = TILE_W / 2, TH = TILE_H / 2;
const STACK_H = 26;
const WALL_H = 3;
const WALK = 0.09;          // tiles per 60Hz step
const BUBBLE_FRAMES = 60 * 11;   // how long a speech bubble lingers (~11s)
// Wrap bubble text into up to 3 lines, max 7 words per line, for readability.
const wrapBubble = (text: string): string[] => {
  const words = text.split(/\s+/).filter(Boolean); const lines: string[] = [];
  for (let i = 0; i < words.length; i += 7) lines.push(words.slice(i, i + 7).join(' '));
  if (lines.length > 3) { lines.length = 3; lines[2] = lines[2].replace(/\s*\S*$/, '') + '…'; }
  return lines.length ? lines : [text];
};
// No real per-person / per-room limit — keep only a very high safety ceiling so a runaway loop or bad
// import can't insert unbounded rows. Place as much as you like.
const MAX_ITEMS = 100000;

type RoomDef = { slug: string; name: string; accent: string; floor: string; locked?: boolean; owner?: string; buildAll?: boolean; rights?: string[]; plan?: string; day?: boolean; veranda?: boolean };
// Who may drop/take furni in a room: a mod always; in a PERSONAL room also the owner, an open
// ("build_all") room, or a granted handle. Official/public rooms are MODS ONLY.
const canBuildIn = (def: RoomDef, ownerId: string, handle: string, mod: boolean): boolean => {
  if (mod) return true;
  if (!def.owner) return false;   // official/public rooms — only moderators build or take
  return def.owner === ownerId || !!def.buildAll || (def.rights ?? []).some(h => h.toLowerCase() === (handle || '').toLowerCase());
};
// The guided tutorial is a chain of SOLO rooms (canon: tutorial-sequence-spec), linked by portals:
//   t_oracle (movement + a cryptic code) → t_arcade (play the one game once) → t_terminal (easter egg
//   + the terminal → character creator) → t_yourroom (your own room) → TOWN (the social hub).
const TUT_ROOMS: Record<string, RoomDef> = {
  oracle:   { slug: 't_oracle',   name: 'Induction',    accent: '#00cfff', floor: '#0c0c16', plan: 'quadrado' },
  arcade:   { slug: 't_arcade',   name: 'The Arcade',   accent: '#ffd23a', floor: '#16121f', plan: 'quadrado' },
  terminal: { slug: 't_terminal', name: 'The Terminal', accent: '#8a9cff', floor: '#0d0f1c', plan: 'quadrado' },
  yourroom: { slug: 't_yourroom', name: 'Your Room',    accent: '#1ED760', floor: '#161628', plan: 'quadrado' },
};
const TOWN: RoomDef   = { slug: 'town',   name: 'Town',      accent: '#00cfff', floor: '#161628', plan: 'mega' };
const ARCADE: RoomDef = { slug: 'arcade', name: 'Arcade',    accent: '#ffd23a', floor: '#16121f', plan: 'enorme' };
const WOODS: RoomDef  = { slug: 'woods',  name: 'The Woods', accent: '#4fd96b', floor: '#16271a', plan: 'grove', day: true };
// The menu's destinations (the tutorial rooms are start-only, never listed): Arcade holds the games,
// Town is the social hub, the Woods are the wild edge.
const ROOMS: RoomDef[] = [TOWN, ARCADE, WOODS];
const TUT_BY_SLUG: Record<string, RoomDef> = Object.fromEntries(Object.values(TUT_ROOMS).map(r => [r.slug, r]));
const roomOf = (slug: string) => TUT_BY_SLUG[slug] ?? ROOMS.find(r => r.slug === slug) ?? TOWN;
const isTutRoom = (slug: string) => slug.startsWith('t_');
// Which tutorial room each onboarding step lives in ('character' shares the terminal room).
const tutSlugFor = (step: string): string | null => (({ oracle: 't_oracle', arcade: 't_arcade', terminal: 't_terminal', character: 't_terminal', yourroom: 't_yourroom' }) as Record<string, string>)[step] ?? null;

// Secret/lore sectors are gone for now — the lore sequence is being rebuilt. Kept as an empty map so
// player-made portals (which resolve public slugs / room codes) still compile.
const SECRET_ROOMS: Record<string, RoomDef> = {};
type Portal = { gx: number; gy: number; code: string; to: string; reward?: number; user?: boolean };
// Curated portal-maze cleared — only player-made portals (stored as room_items) exist right now.
const PORTALS: Record<string, Portal[]> = {};
// ARCADE MACHINES — the games live INSIDE the world now. Walk CLOSE to a machine and a modal opens
// listing the games on it; pick one to launch. Different machines (in different rooms / corners of
// town) carry different games, so finding new games is part of exploring. `id` maps to a game view
// up in the page conductor (see onLaunchGame). The Plaza machine is the tutorial's first game.
type GameSlot = { id: string; name: string; tag: string };
// Special rules a game can launch with. Stored as a flat flag set so it round-trips cleanly through
// the kind string and forwards to the game component. The flags are PLUMBING ONLY for now — encoded,
// placed, carried to launch — but the games don't act on them yet.
type GameRules = Record<string, boolean>;
const RULE_FLAGS: { key: string; token: string; label: string }[] = [
  { key: 'doubleCrystals', token: 'dc', label: 'Double crystals' },
  { key: 'infiniteJump', token: 'ij', label: 'Infinite jump' },
];
// Rules encode as a sorted dotted token list inside the kind string (e.g. `dc.ij`), avoiding the `:`
// segment separator. Empty string = no rules.
const encodeRules = (r: GameRules): string => RULE_FLAGS.filter(f => r[f.key]).map(f => f.token).sort().join('.');
const decodeRules = (s: string): GameRules => { const t = s.split('.'); const o: GameRules = {}; for (const f of RULE_FLAGS) if (t.includes(f.token)) o[f.key] = true; return o; };
// rules?: when a machine is a placed trigger (or retargeted by a set-game event) it carries the rules
// the launch should pass along; hardcoded machines leave it undefined (no modifiers).
type Machine = { gx: number; gy: number; games: GameSlot[]; rules?: GameRules };
const GAME_OUROO: GameSlot = { id: 'ouroo', name: 'OUROO', tag: 'survive the swarm · mine crystals' };
const GAME_LEAP: GameSlot = { id: 'leap', name: 'LEAP', tag: 'climb the crystal staircase' };
// Single source of truth for "which games exist" — the admin Games tab lists from this.
const GAMES: GameSlot[] = [GAME_OUROO, GAME_LEAP];
const gameById = (id: string): GameSlot => GAMES.find(g => g.id === id) ?? { id, name: id.toUpperCase(), tag: '' };
const MACHINES: Record<string, Machine[]> = {
  t_arcade: [{ gx: 5, gy: 2, games: [GAME_OUROO] }],               // tutorial: the single machine
  // arcade: triggers are admin-placed via the Games tab, not hardcoded here
  // Town has NO machine — you reach the Arcade from the menu.
};
const MACHINE_RANGE = 1.9;   // tiles — "walk close" radius that pops the game picker / terminal
const TUT_PORTAL_TILE = { gx: 9, gy: 5 } as const;   // every tutorial room's onward door sits here
// RETURN-TO-ORIGIN — launching a game unmounts the whole world, so we stash where you launched from in
// localStorage (the established "survive the unmount" pattern) and respawn there on the next mount.
const ORIGIN_KEY = 'ouroo_game_origin';
type GameOrigin = { slug: string; gx: number; gy: number };
const readOrigin = (): GameOrigin | null => {
  try { const s = localStorage.getItem(ORIGIN_KEY); if (!s) return null; const o = JSON.parse(s); return (o && typeof o.slug === 'string' && typeof o.gx === 'number' && typeof o.gy === 'number') ? o as GameOrigin : null; } catch { return null; }
};

// First-visit reward modal kept (empty) — re-attached when the lore sequence + its rooms come back.
const SECRET_INTRO: Record<string, { title: string; body: string }> = {};

// The Oracle's on-screen tutorial voice, per step (see /LORE.md + tutorial-sequence-spec). The Curator
// inducts you on the surface; once you "enter the simulation" it speaks as a familiar, human voice.
type TutScript = { persona: string; code?: string; lines: string[] };
const TUT_SCRIPT: Record<string, TutScript> = {
  oracle: { persona: 'the Curator', code: 'OURO', lines: [
    'Someone new. It has been a long while since the Loop drew fresh signal. I am the Curator — I keep this place lit for the ones who logged off, and never came back.',
    'Learn to move first: tap or click anywhere to walk there. Go on — try a few steps.',
    'A world no one watches forgets itself, and forgetting is how it dies. You can hold that back just by being here. There is a door in this room. The code is the world’s first name — OURO. Walk to the door and speak it.',
  ] },
  arcade_pre: { persona: 'the Curator', lines: [
    'Through the door. This is the front line — where the world fights back against Entropy. One machine, one game. Step close to it and play.',
  ] },
  arcade_post: { persona: 'the Curator', lines: [
    'You held the dark back, and the world minted a little signal for it. Crystals are not money — they are cached attention, your presence made solid, the only thing that keeps OUROO awake.',
    'There are more games than this one, scattered through the Loop; find them and you fill your wallet. A door has opened behind you. Walk through.',
  ] },
  terminal: { persona: 'the Curator', lines: [
    'A terminal — the old machines still answer, if you ask. Step up to it and let it read you; it is time the world learned your face. (And the wall at the top of this room… some say it gives, if you touch it.)',
  ] },
  yourroom: { persona: 'a familiar voice', lines: [
    'You made it inside the simulation. This — this is yours. Your own corner of the Loop.',
    'Everything you place here, the world remembers; building is how you teach a dead world to have shape again. Furniture is bought with crystals — that comes later. When you are ready, step through the door to Town.',
  ] },
  town: { persona: 'a familiar voice', lines: [
    'Town. The heart of what is left — where everyone still here comes to gather.',
    'From the menu you can reach the Arcade to mine more signal, and the Woods at the wild edge. The town centre holds the jar; fill it together and the Loop runs warmer.',
    'That is everything I can teach you. The rest is yours to find. Good luck out there — the Loop runs warmer when someone is watching.',
  ] },
};
const EASTER_EGG_REWARD = 250;   // the hidden top-centre wall in the terminal room

// Curated decor + NPCs baked into a room (not user-placed, not in the DB, not removable). Seats among
// them are still sittable; solids are pathed around. NPCs are static avatars with name tags.
// Three kinds of NPC speech, in priority order on approach:
//   `hints`  → CYCLE forever (repeat) — the actionable clues + codes; weave the key into a line so a
//              player who lingers/returns always catches it. Use for guide/clue NPCs (easy wins).
//   `beats`  → ordered lore, delivered ONCE each (per-player memory in localStorage). Use for story.
//   `lines`  → ambient idle chatter (random). `id` keys saved beat progress.
type NpcDef = { handle: string; skinId: string; gx: number; gy: number; lvl?: number; lines?: string[]; roam?: number; beats?: string[]; hints?: string[]; id?: string };
// Admin-placed NPCs persist in room_items as `npc:<encodeURIComponent(JSON)>` (name + appearance + lines).
const encodeNpc = (d: NpcData) => `npc:${encodeURIComponent(JSON.stringify(d))}`;
const decodeNpc = (raw: string): NpcData | null => {
  try { const o = JSON.parse(decodeURIComponent(raw.slice(4))); if (!o || typeof o.n !== 'string') return null;
    return { n: String(o.n).slice(0, 24), a: String(o.a || 'diamond-gold'), l: Array.isArray(o.l) ? o.l.map(String).slice(0, 8) : [] }; }
  catch { return null; }
};
const CURATED_ITEMS: Record<string, [string, number, number, number?, number?][]> = {
  // ── TUTORIAL ROOMS (solo) — the onward door always sits at TUT_PORTAL_TILE (9,5). ──
  // t_oracle: the room you wake in. Just the Oracle's voice + a coded door.
  t_oracle: [
    ['teleporter', 9, 5, 0],
    ['planta', 1, 1, 0], ['planta', 1, 9, 0],
    ['floorlamp', 9, 1, 0], ['floorlamp', 9, 9, 0],
  ],
  // t_arcade: a single machine + the onward door (opens after you've played).
  t_arcade: [
    ['arcade', 5, 2, 0],
    ['teleporter', 9, 5, 0],
    ['neon', 5, 1, 0],
    ['floorlamp', 1, 1, 0], ['floorlamp', 1, 9, 0],
  ],
  // t_terminal: the computer terminal + the onward door (opens after the character creator). The hidden
  // wall easter egg is the top-centre tile (5,1) — handled in the click handler, not a furni.
  t_terminal: [
    ['console', 4, 2, 0],
    ['serverrack', 1, 2, 0], ['serverrack', 8, 2, 0],
    ['teleporter', 9, 5, 0],
    ['floorlamp', 1, 9, 0], ['floorlamp', 9, 9, 0],
  ],
  // t_yourroom: your own room — a starter set the Oracle talks you through + the door to Town.
  t_yourroom: [
    ['teleporter', 9, 5, 0],
    ['sofa', 2, 3, 0], ['mesa', 4, 4, 0], ['tv', 7, 2, 0],
    ['planta', 1, 8, 0], ['floorlamp', 8, 8, 0], ['banco_jd', 4, 8, 0],
  ],
  // ── TOWN — the big social hub (22×22). NO arcade here — the Arcade is its own place via the menu. ──
  town: [
    ['fonte', 11, 5, 0],   // town-centre fountain (the Money Jar lands near here later)
    ['planta', 2, 2, 0], ['planta', 19, 2, 0], ['planta', 2, 19, 0], ['planta', 19, 19, 0],
    ['arvore', 2, 11, 0], ['arvore', 19, 11, 0],
    ['banco_jd', 7, 9, 0], ['banco_jd', 14, 9, 0], ['banco_jd', 7, 14, 0], ['banco_jd', 14, 14, 0],
    ['floorlamp', 4, 5, 0], ['floorlamp', 17, 5, 0], ['floorlamp', 4, 17, 0], ['floorlamp', 17, 17, 0],
  ],
  // ── ARCADE — the big games room (18×18). One cabinet per game (more slot in as they're built). ──
  arcade: [
    ['arcade', 5, 3, 0], ['arcade', 12, 3, 0],   // the game cabinets (OUROO, LEAP — see MACHINES)
    ['neon', 8, 2, 0],
    ['holofote', 2, 2, 0], ['holofote', 15, 2, 0],
    ['vending', 2, 8, 0],
    ['banco_jd', 6, 12, 0], ['banco_jd', 10, 12, 0],
    ['floorlamp', 2, 15, 0], ['floorlamp', 15, 15, 0],
  ],
  // ── THE WOODS — the big wild edge (22-tile octagon). Trees + a spring (pond/fishing comes later). ──
  woods: [
    ['arvore', 4, 4, 0], ['arvore', 17, 4, 0], ['arvore', 4, 17, 0], ['arvore', 17, 17, 0],
    ['arvore', 2, 11, 0], ['arvore', 19, 11, 0], ['arvore', 11, 2, 0], ['arvore', 11, 19, 0],
    ['palmeira', 7, 6, 0], ['palmeira', 14, 6, 0], ['palmeira', 7, 15, 0], ['palmeira', 14, 15, 0],
    ['relva', 5, 11, 0], ['relva', 16, 11, 0], ['relva', 11, 16, 0],
    ['flores', 8, 9, 0], ['flores', 13, 9, 0],
    ['cato', 4, 8, 0], ['cato', 17, 14, 0],
    ['fonte', 11, 8, 0],   // a wild spring — the pond proper arrives with fishing later
  ],
};
const CURATED_NPCS: Record<string, NpcDef[]> = {};   // NPCs cleared — the lore cast gets rebuilt on the new sequence

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
// portalTo/portalCode ride along on PLAYER-PLACED portals (a teleporter that links to another room).
type Item = { id: string; kind: string; gx: number; gy: number; dir?: number; elev?: number; createdBy?: string; portalTo?: string; portalCode?: string; portalHidden?: boolean; gameId?: string; gameRules?: GameRules; gameHidden?: boolean; gameSet?: boolean };
// Direction + elevation persist inside the room_items `kind` text as `kind@dir^elev` (no migration).
const encodeKind = (kind: string, dir: number, elev = 0) => `${kind}${dir ? `@${dir}` : ''}${elev ? `^${elev}` : ''}`;
const decodeKind = (raw: string): { kind: string; dir: number; elev: number } => { const m = raw.match(/^([^@^]+)(?:@(\d+))?(?:\^(\d+(?:\.\d+)?))?$/); return m ? { kind: m[1], dir: m[2] ? (Number(m[2]) % 4 + 4) % 4 : 0, elev: m[3] ? Number(m[3]) : 0 } : { kind: raw, dir: 0, elev: 0 }; };
// PLAYER PORTALS persist in the SAME room_items table (no migration) as a special kind string:
//   `portal:<encoded dest>:<encoded access-code>[:1]`.  A trailing `:1` marks a HIDDEN trigger (no
//   visible teleporter sprite — a disguised floor trigger). encodeURIComponent escapes any @ / ^ / :
//   in the dest/code, so the segments stay clean; we hydrate it into a `teleporter` item with the link.
const encodePortal = (to: string, code: string, hidden = false) => `portal:${encodeURIComponent(to)}:${encodeURIComponent(code)}${hidden ? ':1' : ''}`;
// GAME TRIGGERS — admin-placed game events, persisted in the SAME room_items table (no migration):
//   `game:<gameId>:<rules>[:1]`     PLAY trigger: walk close → picker → launch <gameId> with <rules>.
//                                   trailing `:1` = a HIDDEN cabinet (disguised floor trigger).
//   `setgame:<gameId>:<rules>`      SET event: retargets THIS room's machines to <gameId> (no launch).
// rules is the dotted token list from encodeRules (':'-free), so the colon segments stay clean.
const encodeGameTrigger = (gameId: string, rules: GameRules, hidden = false) => `game:${encodeURIComponent(gameId)}:${encodeRules(rules)}${hidden ? ':1' : ''}`;
const encodeSetGame = (gameId: string, rules: GameRules) => `setgame:${encodeURIComponent(gameId)}:${encodeRules(rules)}`;
// LORE MARKERS — admin-authored Oracle lore, persisted in room_items as `lore:<mode>:<encoded text>`.
//   mode 'enter' → spoken once per player when they arrive in the room (tile ignored).
//   mode 'tile'  → spoken when a player walks close to the marker's tile (re-fires per approach).
type LoreMode = 'enter' | 'tile';
type LoreStyle = 'oracle' | 'glitch' | 'reward';   // spoken card / full-screen terminal takeover / a payout
type LoreMarker = { id: string; mode: LoreMode; style: LoreStyle; gx: number; gy: number; text: string; crystals?: number; skinId?: string; near?: boolean };
// oracle markers persist as `lore:<mode>:<text>`, glitch as `seq:<mode>:<text>`, rewards as
// `reward:<mode>:<crystals>:<skinId>` (skinId may be empty). All fire once per player for on-enter;
// reward tile markers also fire once per player (claimed), text ones re-fire on each approach.
const encodeMarker = (style: LoreStyle, mode: LoreMode, text: string) => `${style === 'glitch' ? 'seq' : 'lore'}:${mode}:${encodeURIComponent(text)}`;
const encodeReward = (mode: LoreMode, crystals: number, skinId: string) => `reward:${mode}:${Math.max(0, Math.floor(crystals) || 0)}:${encodeURIComponent(skinId || '')}`;
// ROOM ATMOSPHERE — an admin-chosen backdrop layer, persisted as a `bg:<id>` row. 'auto' = the room's
// built-in day/night. The rest override it for storytelling (sunny, rainy, Matrix-style code rain, a
// glitched-out signal). The atmosphere paints the sky/void BEHIND the isometric room.
type Atmo = 'auto' | 'day' | 'night' | 'rain' | 'coderain' | 'glitch' | 'lava' | 'purplehaze' | 'swamp' | 'cosmic' | 'sunset';
const ATMOS: { id: Atmo; label: string; sw: string }[] = [
  { id: 'auto', label: 'Room default', sw: '#7a8090' },
  { id: 'day', label: 'Sunny day', sw: '#aedcff' },
  { id: 'night', label: 'Night', sw: '#0b0912' },
  { id: 'rain', label: 'Rainy day', sw: '#6f7884' },
  { id: 'coderain', label: 'Code rain', sw: '#1d7a3a' },
  { id: 'glitch', label: 'Glitch', sw: '#cc44ff' },
  { id: 'lava', label: 'Lava land', sw: '#ff5a1e' },
  { id: 'purplehaze', label: 'Purple haze', sw: '#9b4dff' },
  { id: 'swamp', label: 'Green swamp', sw: '#3f6e3a' },
  { id: 'cosmic', label: 'Cosmic', sw: '#5b3a8a' },
  { id: 'sunset', label: 'Sunset', sw: '#ff7e5f' },
];
type RoomItemRow = { id: string; kind: string; x: number; y: number; created_by?: string | null };
// Load EVERY row for a room — PostgREST caps a single select at ~1000 rows, so page through with range()
// until a short page comes back. Without this a room silently stops loading past ~1000 pieces.
async function fetchAllRoomItems(sb: NonNullable<typeof supabase>, room: string): Promise<RoomItemRow[]> {
  const PAGE = 1000; const all: RoomItemRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb.from('room_items').select('id,kind,x,y,created_by').eq('room', room).order('created_at').range(from, from + PAGE - 1);
    if (error || !data || !data.length) break;
    all.push(...(data as RoomItemRow[]));
    if (data.length < PAGE) break;
  }
  return all;
}
const hydrateItem = (rawKind: string, id: string, gx: number, gy: number, createdBy: string): Item => {
  if (rawKind.startsWith('portal:')) {
    const [, to = '', code = '', hidden = ''] = rawKind.split(':');
    return { id, kind: 'teleporter', gx, gy, dir: 0, elev: 0, createdBy, portalTo: decodeURIComponent(to), portalCode: decodeURIComponent(code), portalHidden: hidden === '1' };
  }
  if (rawKind.startsWith('setgame:')) {
    const [, gid = '', rules = ''] = rawKind.split(':');
    return { id, kind: 'setgame', gx, gy, dir: 0, elev: 0, createdBy, gameId: decodeURIComponent(gid), gameRules: decodeRules(rules), gameSet: true };
  }
  if (rawKind.startsWith('game:')) {
    const [, gid = '', rules = '', hidden = ''] = rawKind.split(':');
    return { id, kind: 'arcade', gx, gy, dir: 0, elev: 0, createdBy, gameId: decodeURIComponent(gid), gameRules: decodeRules(rules), gameHidden: hidden === '1' };
  }
  const dk = decodeKind(rawKind);
  return { id, kind: dk.kind, dir: dk.dir, elev: dk.elev, gx, gy, createdBy };
};
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
// `headroom` is how many levels of vertical space to reserve above the floor — defaults to the room's
// own wall height, but grows to fit the TALLEST placed build (towers, multi-storey shops) so nothing
// gets clipped off the top of the stage.
const computeCam = (mask: Int8Array, grid: number, headroom = WALL_H): Cam => {
  const top = Math.max(WALL_H, headroom);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, any = false;
  for (let gy = 0; gy < grid; gy++) for (let gx = 0; gx < grid; gx++) {
    const L = mask[gy * grid + gx]; if (L < 0) continue; any = true;
    const cx = (gx - gy) * TW, cy = (gx + gy) * TH - L * STACK_H;
    if (cx - TW < minX) minX = cx - TW; if (cx + TW > maxX) maxX = cx + TW;
    if (cy - TH - top * STACK_H < minY) minY = cy - TH - top * STACK_H;        // tallest build above
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

type OnboardStep = 'oracle' | 'arcade' | 'terminal' | 'character' | 'yourroom' | 'town' | 'done';
export const RoomCanvas: React.FC<{ stageScale?: number; isMobileStage?: boolean; onExit?: () => void; onLaunchGame?: (id: string, mods?: GameRules) => void; onboarding?: OnboardStep; gamePlayed?: boolean; onSetStep?: (s: OnboardStep) => void }> = ({
  stageScale = 1, isMobileStage = false, onExit, onLaunchGame, onboarding = 'done', gamePlayed = false, onSetStep,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const outerRef = useRef<HTMLDivElement | null>(null);
  const [fitScale, setFitScale] = useState(1);   // uniform scale to FIT the 1280×720 stage (never stretch)
  const rafRef = useRef(0);
  const channelRef = useRef<ReturnType<NonNullable<typeof supabase>['channel']> | null>(null);
  const joinedRef = useRef(false);   // true only while the channel is actually SUBSCRIBED — never send otherwise (avoids REST-fallback floods)
  // Consume the launch origin once on mount. Tutorial users are exempt (their room is forced by the
  // onboarding step) — only "done" players returning from a game honor it.
  const [origin] = useState<GameOrigin | null>(() => (tutSlugFor(onboarding) ? null : readOrigin()));
  const selfRef = useRef<Self>({ id: '', handle: 'Guest', skinId: getSelectedSkinId(), fx: origin?.gx ?? 5, fy: origin?.gy ?? 5, tx: origin?.gx ?? 5, ty: origin?.gy ?? 5, z: 0, lvl: 0, bubble: '', bubbleLife: 0, af: 0, path: [] });
  const remotesRef = useRef<Map<string, Avatar>>(new Map());
  const itemsRef = useRef<Item[]>([]);
  const decorRef = useRef<Item[]>([]);    // curated, non-removable furniture for the room
  const npcsRef = useRef<(Avatar & { id?: string; lines?: string[]; hx?: number; hy?: number; roam?: number; beats?: string[]; hints?: string[]; hintIdx?: number; nid?: string; near?: boolean; cool?: number })[]>([]);   // curated + admin-placed NPCs (hints + lore beats + chatter + roaming)
  const placedNpcsRef = useRef<{ id: string; gx: number; gy: number; data: NpcData }[]>([]);   // admin-placed NPCs (persisted as `npc:` rows)
  const deviceRef = useRef('');   // stable device token — furni ownership (persists across reloads)
  const sessionRef = useRef('');  // unique per tab/session — presence key + broadcast id (so two sessions don't collide)
  const surfRef = useRef<number[][]>(Array.from({ length: GRID * GRID }, () => []));  // walkable surface levels per tile (layered)
  const solidRef = useRef<Uint8Array>(new Uint8Array(GRID * GRID));        // 1 = blocked
  const planRef = useRef<Int8Array>(planMask(planById('salao')));          // base floor level per tile (-1 = void)
  const waterRef = useRef<Uint8Array>(planWaterMask(planById('salao')));    // 1 = pool/water tile
  const matRef = useRef<Uint8Array>(planMaterialMask(planById('salao')));   // floor material per tile (from the plan)
  // Admin tile-painting overrides: tileKey → material (0-5). Persisted in room_items as `mat:<n>` rows
  // (so it works for the hardcoded official + tutorial rooms, which aren't in the rooms table).
  const matOverrideRef = useRef<Map<number, number>>(new Map());
  const matIdRef = useRef<Map<number, string>>(new Map());   // tileKey → the room_items id of its override row
  // Admins can pick up baked-in (curated) furniture too; removals persist as `del:<curatedId>` tombstone
  // rows in room_items so the piece stays gone for everyone.
  const delCuratedRef = useRef<Set<string>>(new Set());
  // Admin-authored Oracle lore markers in this room (on-enter + per-tile).
  const loreRef = useRef<LoreMarker[]>([]);
  // Room atmosphere (backdrop layer). bgRef is read by the draw loop; bgAtmo mirrors it for the editor.
  const bgRef = useRef<Atmo>('auto');
  const bgIdRef = useRef<string | null>(null);   // room_items id of the `bg:` row (for update/delete)
  const planLvl = (gx: number, gy: number) => (gx < 0 || gy < 0 || gx >= GRID || gy >= GRID ? -1 : planRef.current[gy * GRID + gx]);
  const isWater = (gx: number, gy: number) => gx >= 0 && gy >= 0 && gx < GRID && gy < GRID && waterRef.current[gy * GRID + gx] === 1;
  const camRef = useRef<Cam>(computeCam(planRef.current, GRID));            // fits the room footprint into the stage
  const peakRef = useRef(WALL_H);   // tallest build in the room (levels) — the camera zooms out to keep it in frame
  const hoverRef = useRef<{ gx: number; gy: number } | null>(null);
  const framesRef = useRef(0);
  const posAccum = useRef(0);
  const wasMovingRef = useRef(false);
  const strideRef = useRef(0);   // distance walked since the last footstep sound
  const lastPortalKeyRef = useRef<string | null>(null);   // rising-edge guard so a portal fires once per arrival
  const portalTileRef = useRef(-1);                       // last tile we ran the portal check on (skip the per-frame scan otherwise)
  const voidTimerRef = useRef(0);   // frames the player has lingered on a void tile (time-based hazard)
  const modRef = useRef(false);

  const [msg, setMsg] = useState('');
  const [population, setPopulation] = useState(1);
  const [connected, setConnected] = useState(false);
  const [feed, setFeed] = useState<{ id: number; handle: string; text: string }[]>([]);
  const feedId = useRef(0);
  // New players start in the tutorial's first room; returning-from-a-game players land back at their
  // launch origin; everyone else lands in Town.
  const startSlug = tutSlugFor(onboarding) ?? origin?.slug ?? 'town';
  const [room, setRoom] = useState(startSlug);
  const [roomMeta, setRoomMeta] = useState<RoomDef>(roomOf(startSlug));   // current room's def (official or personal)
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
  const [permsPublic, setPermsPublic] = useState(false);   // room is a public main room (pickable portal destination)
  const [permsList, setPermsList] = useState<string[]>([]);
  const [permsHandle, setPermsHandle] = useState('');
  const [myOwnerId, setMyOwnerId] = useState('');
  const ownerIdRef = useRef('');
  const [myHandle, setMyHandle] = useState('Guest');
  const myHandleRef = useRef('Guest');
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
  const [tileMode, setTileMode] = useState(false);   // admin tile-painting mode
  const [buildMode, setBuildMode] = useState(false);          // pre-made buildings (prefabs) palette
  const [placingPrefab, setPlacingPrefab] = useState<Prefab | null>(null);
  const placingPrefabRef = useRef<Prefab | null>(null);
  useEffect(() => { placingPrefabRef.current = placingPrefab; }, [placingPrefab]);
  // Tap a placed object (while decorating, no tool armed) to SELECT it — a little popup offers rotate + pick-up.
  const [editSel, setEditSel] = useState<{ id: string; kind: string } | null>(null);
  const editSelRef = useRef<{ id: string; kind: string } | null>(null);
  useEffect(() => { editSelRef.current = editSel; }, [editSel]);
  // Click-drag painting: stamp floor/carpet (or admin tile-paint) across every tile the cursor sweeps.
  const paintDragRef = useRef<{ on: boolean; kind: string | null; tile: number }>({ on: false, kind: null, tile: -1 });
  // Drag a selected object to reposition it (press an object + drag → it follows the cursor; release to drop).
  const moveDragRef = useRef<{ id: string | null; moved: boolean }>({ id: null, moved: false });
  // NPC editor (admin): design a character → tap a tile to drop it.
  const [npcEditor, setNpcEditor] = useState(false);
  const [placeNpc, setPlaceNpc] = useState(false);
  const pendingNpcRef = useRef<NpcData | null>(null);
  const [paintMat, setPaintMat] = useState(2);       // material to paint (2 = grass); -1 = clear to default
  const paintMatRef = useRef(2);
  useEffect(() => { paintMatRef.current = paintMat; }, [paintMat]);
  // ── Lore authoring + display ──
  const [loreEditor, setLoreEditor] = useState(false);   // the admin lore editor modal
  const [loreText, setLoreText] = useState('');          // textarea contents (new / editing)
  const [loreEditId, setLoreEditId] = useState<string | null>(null);   // marker being edited (null = new)
  const [placeLore, setPlaceLore] = useState(false);     // armed to drop a tile marker on the next tap
  const [loreCard, setLoreCard] = useState<string | null>(null);   // the Oracle lore currently being spoken
  const [glitchSeq, setGlitchSeq] = useState<string | null>(null); // the full-screen glitch/terminal takeover
  const [rewardReveal, setRewardReveal] = useState<{ crystals: number; skinId: string } | null>(null);   // screen-takeover reward celebration
  const [bgAtmo, setBgAtmo] = useState<Atmo>('auto');   // current room atmosphere (mirrors bgRef, for the editor)
  const [atmoMode, setAtmoMode] = useState(false);      // showing the atmosphere palette in Decorate
  const [gamesMode, setGamesMode] = useState(false);    // admin: the Games tab (place game triggers / set-game events)
  const [gTab, setGTab] = useState<'play' | 'set'>('play');   // Games tab: which event type to place
  const [gGameId, setGGameId] = useState('ouroo');      // Games tab: chosen game
  const [gRules, setGRules] = useState<GameRules>({});  // Games tab: special-rule toggles (plumbing only)
  const [gHidden, setGHidden] = useState(false);        // Games tab: place a hidden cabinet (Play only)
  const [mkMode, setMkMode] = useState<LoreMode>('enter');     // editor: trigger of the marker being authored
  const [mkStyle, setMkStyle] = useState<LoreStyle>('oracle'); // editor: presentation of the marker
  const [mkCrystals, setMkCrystals] = useState(100);           // editor: reward crystal amount
  const [mkSkin, setMkSkin] = useState('');                    // editor: reward skin to unlock ('' = none)
  const pendingLoreRef = useRef<{ text: string; style: LoreStyle; crystals: number; skinId: string }>({ text: '', style: 'oracle', crystals: 0, skinId: '' });   // marker waiting to drop on a tap
  const [, setLoreVer] = useState(0);   // bump to re-render the editor list after loreRef mutations
  const [placeDir, setPlaceDir] = useState(0);
  const placeDirRef = useRef(0);
  useEffect(() => { placeDirRef.current = placeDir; }, [placeDir]);
  const [placeElev, setPlaceElev] = useState(0);   // lift (levels off the floor) for floating decks / bridges
  const placeElevRef = useRef(0);
  useEffect(() => { placeElevRef.current = placeElev; }, [placeElev]);
  const [decorOpen, setDecorOpen] = useState(false);
  const [decorMin, setDecorMin] = useState(false);                       // collapse the decorate panel to its title bar
  const [decorPos, setDecorPos] = useState<{ x: number; y: number } | null>(null);   // null = default (docked bottom-centre); set once dragged
  const decorPanelRef = useRef<HTMLDivElement>(null);
  // Drag the decorate panel anywhere (so it doesn't sit on top of the spot you want to build). Works on
  // touch + mouse via pointer events; clamps to the viewport. Grabs from the title bar only (not buttons).
  const startDecorDrag = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    const el = decorPanelRef.current; if (!el) return;
    const rect = el.getBoundingClientRect();
    const offX = e.clientX - rect.left, offY = e.clientY - rect.top;
    const move = (ev: PointerEvent) => {
      const x = Math.max(4, Math.min(window.innerWidth - el.offsetWidth - 4, ev.clientX - offX));
      const y = Math.max(4, Math.min(window.innerHeight - el.offsetHeight - 4, ev.clientY - offY));
      setDecorPos({ x, y });
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };
  const closeDecor = () => { setDecorOpen(false); setDecorMin(false); setPlacingKind(null); setRemoveMode(false); setRotateMode(false); setTileMode(false); setAtmoMode(false); setGamesMode(false); setPlaceLore(false); setBuildMode(false); setPlacingPrefab(null); setEditSel(null); setNpcEditor(false); setPlaceNpc(false); };
  const [entered] = useState(true);   // instant spawn — you arrive straight in the Plaza lore room (no lobby gate)
  const [portalPrompt, setPortalPrompt] = useState<Portal | null>(null);   // code prompt when you walk onto a coded portal
  const [portalCode, setPortalCode] = useState('');
  const [machinePrompt, setMachinePrompt] = useState<Machine | null>(null);   // game picker when you walk close to an arcade machine
  // ── Tutorial in-room state ──
  const [tutLine, setTutLine] = useState(0);        // index into the current step's Oracle speech
  const [tutCardDone, setTutCardDone] = useState(false);   // dismissed the speech card for this room
  const [bootAnim, setBootAnim] = useState(false);  // terminal boot/code-running overlay
  const [simFade, setSimFade] = useState(false);    // "enter the simulation" fade-to-white
  const [simConfirm, setSimConfirm] = useState(false);  // "enter the simulation?" prompt at the terminal-room door
  const [charDone, setCharDone] = useState(false);  // finished the character creator (account + design)
  const [guestChosen, setGuestChosen] = useState(false);   // chose "continue as guest" in the creator
  const [eggClaimed, setEggClaimed] = useState(false);     // hidden-wall easter egg taken (this room)
  const nearMachineRef = useRef<string | null>(null);   // key of the machine currently in range (null = none); changes trigger the picker
  const machineOverrideRef = useRef<{ gameId: string; rules: GameRules } | null>(null);   // a placed set-game event retargets this room's machines
  const nearTermRef = useRef(false);      // rising-edge guard for the terminal
  const tutPortalArmRef = useRef(false);  // rising-edge guard for the onward tutorial door
  const onLaunchGameRef = useRef(onLaunchGame);
  useEffect(() => { onLaunchGameRef.current = onLaunchGame; }, [onLaunchGame]);
  // Record where we're launching from so EXIT comes back here. Called at every launch site. Tutorial
  // rooms are skipped — their room is forced by the onboarding step, and a stale tutorial slug must
  // never leak into a "done" player's respawn.
  const writeOrigin = () => { const slug = roomMetaRef.current.slug; if (isTutRoom(slug)) return; try { localStorage.setItem(ORIGIN_KEY, JSON.stringify({ slug, gx: clampTile(selfRef.current.fx), gy: clampTile(selfRef.current.fy) })); } catch { /* ignore */ } };
  // One-shot: an origin we consumed on mount is cleared so a later plain "enter the Plaza" doesn't
  // teleport to a stale tile; arm the machine guard so the picker doesn't instantly re-fire under us.
  useEffect(() => { if (origin) { try { localStorage.removeItem(ORIGIN_KEY); } catch { /* ignore */ } nearMachineRef.current = 'origin'; } }, [origin]);
  const onSetStepRef = useRef(onSetStep);
  useEffect(() => { onSetStepRef.current = onSetStep; }, [onSetStep]);
  const gamePlayedRef = useRef(gamePlayed);
  useEffect(() => { gamePlayedRef.current = gamePlayed; }, [gamePlayed]);
  const onboardingRef = useRef(onboarding);
  useEffect(() => { onboardingRef.current = onboarding; }, [onboarding]);
  const charDoneRef = useRef(false);
  useEffect(() => { charDoneRef.current = charDone; }, [charDone]);
  // Reset the per-room tutorial state whenever the step changes (new room = fresh speech, guards re-armed).
  useEffect(() => { setTutLine(0); setTutCardDone(false); setSimConfirm(false); nearMachineRef.current = null; nearTermRef.current = false; tutPortalArmRef.current = false; }, [onboarding]);
  // Persisted character-creator progress (survives the Discord OAuth round-trip mid-tutorial).
  useEffect(() => {
    try { setCharDone(localStorage.getItem('ouroo_tut_char') === '1'); setGuestChosen(localStorage.getItem('ouroo_tut_guest') === '1'); } catch { /* ignore */ }
  }, []);
  const [arrivalModal, setArrivalModal] = useState<{ title: string; body: string; reward: number } | null>(null);   // first-visit reward + onboarding
  // Player portal-maker: pick a destination + optional access code, then drop the portal onto a tile.
  const [portalMaker, setPortalMaker] = useState(false);
  const [pmDest, setPmDest] = useState('town');      // a public slug, or 'code' to link by room code
  const [pmRoomCode, setPmRoomCode] = useState('');  // the destination room's invite code (when pmDest==='code')
  const [pmAccess, setPmAccess] = useState('');      // optional access code the next person must speak
  const [pmHidden, setPmHidden] = useState(false);   // disguised trigger — no visible teleporter sprite
  const makePortal = () => {
    const to = pmDest === 'code' ? `code:${pmRoomCode.trim().toUpperCase()}` : pmDest;
    if (pmDest === 'code' && !pmRoomCode.trim()) { flashHint('Enter the destination room code'); return; }
    setPlacingKind(encodePortal(to, pmAccess.trim(), pmHidden)); setRemoveMode(false); setRotateMode(false); setTileMode(false);
    setPortalMaker(false); flashHint(pmHidden ? 'Tap a tile to drop the hidden trigger ◌' : 'Tap a tile to drop the portal ✦');
  };
  // Ambient room music — the SUAV signal (generated, royalty-free; see lib/roomMusic). Off persists per device.
  const musicRef = useRef<RoomMusic | null>(null);
  const [musicOff, setMusicOff] = useState<boolean>(() => { try { return localStorage.getItem('ouroo_music_off') === '1'; } catch { return false; } });
  useEffect(() => {
    const m = new RoomMusic(); musicRef.current = m;
    m.setMuted(musicOff); m.setRoom(roomMetaRef.current.slug);
    m.start();   // attempts to resume; if the context is still suspended, the gesture listener below arms it
    const arm = () => m.start();
    window.addEventListener('pointerdown', arm); window.addEventListener('keydown', arm);
    return () => { window.removeEventListener('pointerdown', arm); window.removeEventListener('keydown', arm); m.dispose(); musicRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { musicRef.current?.setRoom(roomMeta.slug); }, [roomMeta.slug]);
  const toggleMusic = () => setMusicOff(v => { const nv = !v; musicRef.current?.setMuted(nv); try { localStorage.setItem('ouroo_music_off', nv ? '1' : '0'); } catch { /* ignore */ } return nv; });
  const [oracleOpen, setOracleOpen] = useState(false);   // the lore codex + Oracle Q&A
  const [menuOpen, setMenuOpen] = useState(false);       // the ☰ menu (account / leaderboard / about)
  // First time you reach the world as a guest, nudge the menu button to make an account (sticky until
  // you open the menu, so a stray tap-away doesn't lose the prompt).
  const [menuSeen, setMenuSeen] = useState(true);
  useEffect(() => { try { setMenuSeen(localStorage.getItem('ouroo_menu_seen') === '1'); } catch { /* ignore */ } }, []);
  const openMenu = () => { setMenuOpen(true); setMenuSeen(true); try { localStorage.setItem('ouroo_menu_seen', '1'); } catch { /* ignore */ } };
  const [cat, setCat] = useState('tier1');
  const uiRef = useRef({ decorOpen: false, placingKind: null as string | null, removeMode: false, rotateMode: false, tileMode: false, placingPrefab: false });
  useEffect(() => { uiRef.current = { decorOpen, placingKind, removeMode, rotateMode, tileMode, placingPrefab: !!placingPrefab }; }, [decorOpen, placingKind, removeMode, rotateMode, tileMode, placingPrefab]);
  const [isMod, setIsMod] = useState(false);
  const [isSuper, setIsSuper] = useState(false);   // super-admin → can open the Admin panel + grant admins
  const [adminOpen, setAdminOpen] = useState(false);
  const [jarTotal, setJarTotal] = useState(0);     // Town money jar — real money spent all-time ($)
  const [myCount, setMyCount] = useState(0);
  const [hint, setHint] = useState('');
  const flashHint = (t: string) => { setHint(t); setTimeout(() => setHint(''), 1900); };
  // You can build if: you're a mod, the owner, an open ("everyone") room, or a granted handle.
  const canBuild = canBuildIn(roomMeta, myOwnerId, myHandle, isMod);
  const locked = !canBuild;
  // During the tutorial (before an account + character exist) the world is stripped back to just the
  // Oracle + the first game — the Rooms / wallet / Decorate tools unlock once onboarding is done.
  const tutorial = onboarding !== 'done';
  // Same check from inside canvas closures (reads refs, not render state).
  const canBuildHere = () => canBuildIn(roomMetaRef.current, ownerIdRef.current, myHandleRef.current, modRef.current);
  const [invOpen, setInvOpen] = useState(false);
  const wallet = useWallet();
  // Guests can walk + chat; building/creating needs a Discord account → kick off sign-in.
  const { user } = useUser();
  const signedIn = !!user;
  // Character-creator step: once they've chosen Discord (signed in) or guest, throw open the wardrobe.
  useEffect(() => { if (onboarding === 'character' && (signedIn || guestChosen) && !charDone) setInvOpen(true); }, [onboarding, signedIn, guestChosen, charDone]);
  // Town money jar — fetch the all-time total whenever you enter Town (0 until purchases are wired up).
  useEffect(() => { if (room === 'town') getJarTotal().then(setJarTotal); }, [room]);
  const signedInRef = useRef(false);
  useEffect(() => { signedInRef.current = signedIn; }, [signedIn]);
  const requireAccount = (): boolean => { if (signedInRef.current) return true; flashHint('Create an account to build 🛸'); signInWithDiscord(); return false; };

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
    lastPortalKeyRef.current = `${sp.gx},${sp.gy}`;   // don't auto-fire a portal we happen to spawn on; arm on the first step off
    setRoomMeta(def); setRoom(def.slug);
  };
  const switchRoomRef = useRef(switchRoom); useEffect(() => { switchRoomRef.current = switchRoom; });   // latest switchRoom for the animation loop
  // Follow the onboarding step into its room — each tutorial step has its own solo room; 'town'/'done'
  // land in Town. (The fade/transition that motivates the move is played before the step is advanced.)
  useEffect(() => {
    const target = tutSlugFor(onboarding) ?? 'town';
    if (roomMetaRef.current.slug !== target) switchRoom(roomOf(target));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onboarding]);
  // Terminal boot/code-running animation, then the character creator opens (step → 'character').
  useEffect(() => { if (!bootAnim) return; const t = setTimeout(() => { setBootAnim(false); onSetStepRef.current?.('character'); }, 1700); return () => clearTimeout(t); }, [bootAnim]);
  // Character-creator choices (persisted so the Discord OAuth round-trip can resume mid-tutorial).
  const chooseGuest = () => { setGuestChosen(true); try { localStorage.setItem('ouroo_tut_guest', '1'); } catch { /* ignore */ } };
  const finishCharacter = () => { setCharDone(true); try { localStorage.setItem('ouroo_tut_char', '1'); } catch { /* ignore */ } };
  // "Enter the simulation?" → fade to white → Your Room.
  const enterSimulation = () => { setSimConfirm(false); setSimFade(true); setTimeout(() => { setSimFade(false); onSetStepRef.current?.('yourroom'); }, 1200); };
  const roomDefOf = (r: RoomRow): RoomDef => ({ slug: r.slug, name: r.name, accent: r.accent, floor: r.floor, owner: r.owner, buildAll: r.build_all, rights: r.rights, plan: r.plan });
  const doCreateRoom = async () => {
    if (!requireAccount()) return;
    const res = await createRoom(newRoomName, !newRoomPrivate, newRoomPlan);
    if (!res.ok) { flashHint(res.error || 'Failed to create room'); return; }
    setNewRoomName(''); flashHint(`Room created · code ${res.room.code}`); switchRoom(roomDefOf(res.room));
  };
  const doJoinByCode = async () => {
    const r = await roomByCode(joinCode);
    if (!r) { flashHint('Room not found'); return; }
    setJoinCode(''); switchRoom(roomDefOf(r));
  };
  // Is there a portal on this tile? (curated maze portals OR a player-placed portal item.)
  const portalAtTile = (gx: number, gy: number): Portal | null => {
    const c = (PORTALS[roomMetaRef.current.slug] ?? []).find(pt => pt.gx === gx && pt.gy === gy);
    if (c) return c;
    const items = itemsRef.current;   // scan back-to-front WITHOUT copying (runs while exploring; rooms can hold thousands)
    for (let i = items.length - 1; i >= 0; i--) { const up = items[i]; if (up.portalTo && up.gx === gx && up.gy === gy) return { gx, gy, code: up.portalCode || '', to: up.portalTo, user: true }; }
    return null;
  };
  // Resolve a portal destination: a curated secret slug, a public room slug, or `code:<INVITE>` (any room).
  const resolveDest = async (to: string): Promise<RoomDef | null> => {
    if (SECRET_ROOMS[to]) return SECRET_ROOMS[to];
    const pub = ROOMS.find(r => r.slug === to); if (pub) return pub;   // official room
    if (to.startsWith('code:')) { const r = await roomByCode(to.slice(5)); return r ? roomDefOf(r) : null; }
    const known = personalRooms.find(r => r.slug === to) || myRooms.find(r => r.slug === to);
    if (known) return roomDefOf(known);                                // already-loaded public/own room (no round-trip)
    const r = await roomBySlug(to); return r ? roomDefOf(r) : null;    // a public (or any) room by slug
  };
  // Travel through a portal (curated portals pay out + show the lore modal on first visit; player portals don't).
  const travelTo = async (p: Portal) => {
    const def = await resolveDest(p.to);
    if (!def) { flashHint('That door leads nowhere now.'); return; }
    musicRef.current?.portal();   // threshold-crossing shimmer
    switchRoom(def);
    if (p.user) return;
    try {
      const fk = `ouroo_secret_${def.slug}`;
      if (localStorage.getItem(fk) !== '1') {   // first visit → reward + "you found it" modal
        const reward = p.reward ?? 0; if (reward) addBalance(reward);
        localStorage.setItem(fk, '1');
        const intro = SECRET_INTRO[def.slug];
        if (intro) setArrivalModal({ title: intro.title, body: intro.body, reward });
      }
    } catch { /* ignore */ }
  };
  // The movement loop is mounted once, so it must call the LATEST travelTo (fresh `room`/personalRooms) —
  // a stale closure compared def.slug against the INITIAL room, which silently no-op'd return-trip portals.
  const travelToRef = useRef(travelTo); useEffect(() => { travelToRef.current = travelTo; });
  // Speak a portal's code → travel. (No code → handled directly on walk-on; see the movement loop.)
  const tryPortal = async () => {
    const p = portalPrompt; if (!p) return;
    if (p.code && portalCode.trim().toUpperCase() !== p.code.toUpperCase()) { flashHint('The door stays shut.'); setPortalCode(''); return; }
    setPortalPrompt(null); setPortalCode('');
    if (p.to === '__tut__') { onSetStepRef.current?.('arcade'); return; }   // the Oracle's coded door advances the tutorial
    await travelTo(p);
  };
  const doDeleteRoom = async (r: RoomRow) => {
    if (!confirm(`Delete "${r.name}"? Its furniture will be gone.`)) return;
    const ok = await deleteRoom(r.slug);
    if (!ok) { flashHint('Failed to delete'); return; }
    if (room === r.slug) switchRoom(roomOf('town'));
    refreshRoomLists();
  };
  const openPerms = (r: RoomRow) => { setPermsRoom(r); setPermsAll(r.build_all); setPermsPublic(r.public); setPermsList(r.rights ?? []); setPermsHandle(''); };
  const addPermHandle = () => {
    const h = permsHandle.trim(); if (!h) return;
    if (!permsList.some(x => x.toLowerCase() === h.toLowerCase())) setPermsList(l => [...l, h]);
    setPermsHandle('');
  };
  const savePerms = async () => {
    if (!permsRoom) return;
    const list = Array.from(new Set(permsList.map(h => h.trim()).filter(Boolean)));
    const ok = await updateRoomPerms(permsRoom.slug, permsAll, list);
    if (!ok) { flashHint('Failed to save permissions'); return; }
    if (permsPublic !== permsRoom.public) await setRoomPublic(permsRoom.slug, permsPublic);   // flip public ↔ invite-only
    // Reflect immediately in local lists + the live room if it's the one open.
    setMyRooms(rs => rs.map(r => r.slug === permsRoom.slug ? { ...r, build_all: permsAll, rights: list, public: permsPublic } : r));
    if (room === permsRoom.slug) setRoomMeta(m => ({ ...m, buildAll: permsAll, rights: list }));
    refreshRoomLists();   // public flag changed → refresh the public-room list (portal picker + browser)
    setPermsRoom(null); flashHint('Permissions saved ✓');
  };

  // recompute the heightmap (walkable height + solid mask) from items
  // Layered heightmap: each tile holds a sorted list of WALKABLE surface levels. Floor pieces sit at
  // elev 0 (cover the ground); floating pieces (elev>0) leave the ground exposed → a tunnel under +
  // a deck above. Solids block the whole tile.
  const rebuildHeight = () => {
    const surf = surfRef.current, S = solidRef.current; S.fill(0);
    for (let i = 0; i < surf.length; i++) surf[i].length = 0;
    const grounded = new Uint8Array(GRID * GRID); let peak = WALL_H;
    for (const it of (decorRef.current.length ? itemsRef.current.concat(decorRef.current) : itemsRef.current)) {
      if (it.gameSet) continue;   // set-game events are invisible behaviour markers — never block or raise a tile
      const d = defOf(it.kind); const [sw, sh] = effSpan(it.kind, it.dir || 0); const elev = it.elev || 0; const sit = sitHeight(it.kind);
      for (let du = 0; du < sw; du++) for (let dv = 0; dv < sh; dv++) {
        const gx = it.gx + du, gy = it.gy + dv; if (gx >= GRID || gy >= GRID) continue;
        const k = key(gx, gy); const base = planRef.current[k]; if (base < 0) continue;   // can't sit on a void tile
        if (base + elev + (d.h || 0) > peak) peak = base + elev + (d.h || 0);   // track the topmost point for the camera
        if (d.pass) { /* walk-through (doorways/roof): never blocks, never raises the floor */ }
        else if (d.walk) { surf[k].push(base + elev + d.h); if (elev <= 0.01) grounded[k] = 1; }
        else if (sit != null) { surf[k].push(base + elev + sit); if (elev <= 0.01) grounded[k] = 1; }
        else S[k] = 1;
      }
    }
    // Keep the whole build in frame: if it grew taller than before, re-fit the camera (zoom out a touch).
    if (Math.ceil(peak) !== Math.ceil(peakRef.current)) { peakRef.current = peak; camRef.current = computeCam(planRef.current, GRID, Math.ceil(peak) + 1); }
    for (let k = 0; k < surf.length; k++) {
      const base = planRef.current[k];
      if (base < 0) { S[k] = 1; surf[k].length = 0; continue; }   // void tile — no floor, blocked
      if (S[k]) { surf[k].length = 0; continue; }
      if (!grounded[k]) surf[k].push(base);          // exposed floor at its base level (walk under floating decks)
      surf[k].sort((a, b) => a - b);
    }
  };
  // Pay out a reward marker: crystals to the wallet + (if set) unlock a skin on the account.
  const claimReward = (mk: LoreMarker) => {
    if (mk.crystals && mk.crystals > 0) addBalance(mk.crystals);
    if (mk.skinId) grantSkin(mk.skinId);   // signed-in only; degrades silently otherwise
    musicRef.current?.chime();
    setRewardReveal({ crystals: mk.crystals || 0, skinId: mk.skinId || '' });   // screen-takeover celebration
  };
  // Present/claim a marker by style (caller handles once-per-player gating where relevant).
  const fireMarker = (mk: LoreMarker) => {
    if (mk.style === 'reward') { claimReward(mk); return; }
    if (mk.style === 'glitch') setGlitchSeq(mk.text); else setLoreCard(mk.text);
  };
  // Split loaded room_items rows into furni (→ itemsRef) and tile-material overrides (`mat:<n>` → maps).
  const ingestItemRows = (rows: { id: string; kind: string; x: number; y: number; created_by?: string | null }[]) => {
    matOverrideRef.current.clear(); matIdRef.current.clear(); delCuratedRef.current.clear(); loreRef.current = []; placedNpcsRef.current = []; bgRef.current = 'auto'; bgIdRef.current = null; machineOverrideRef.current = null;
    const items: Item[] = [];
    for (const d of rows) {
      const raw = String(d.kind);
      const m = raw.match(/^mat:(\d+)$/);   // \d+ — Wood/Neon/Void are 10/11/12; \d alone dropped them (→ unknown furni "blue block")
      if (m) { const k = key(Number(d.x), Number(d.y)); matOverrideRef.current.set(k, Number(m[1])); matIdRef.current.set(k, String(d.id)); continue; }
      if (raw.startsWith('npc:')) { const nd = decodeNpc(raw); if (nd) placedNpcsRef.current.push({ id: String(d.id), gx: Number(d.x), gy: Number(d.y), data: nd }); continue; }   // admin-placed NPC
      if (raw.startsWith('del:')) { delCuratedRef.current.add(raw.slice(4)); continue; }   // tombstone: a removed curated piece
      if (raw.startsWith('bg:')) { const a = raw.slice(3) as Atmo; if (ATMOS.some(x => x.id === a)) { bgRef.current = a; bgIdRef.current = String(d.id); } continue; }
      if (raw.startsWith('reward:')) { const p = raw.split(':'); const mode = (p[1] === 'enter' ? 'enter' : 'tile') as LoreMode; loreRef.current.push({ id: String(d.id), mode, style: 'reward', gx: Number(d.x), gy: Number(d.y), text: '', crystals: Number(p[2]) || 0, skinId: decodeURIComponent(p[3] || '') }); continue; }
      if (raw.startsWith('lore:') || raw.startsWith('seq:')) { const style: LoreStyle = raw.startsWith('seq:') ? 'glitch' : 'oracle'; const i1 = raw.indexOf(':'), i2 = raw.indexOf(':', i1 + 1); const mode = raw.slice(i1 + 1, i2) as LoreMode; const text = decodeURIComponent(raw.slice(i2 + 1)); loreRef.current.push({ id: String(d.id), mode: mode === 'enter' ? 'enter' : 'tile', style, gx: Number(d.x), gy: Number(d.y), text }); continue; }
      items.push(hydrateItem(raw, String(d.id), Number(d.x), Number(d.y), String(d.created_by ?? '')));
    }
    setBgAtmo(bgRef.current);
    itemsRef.current = items; setMyCount(items.filter(i => i.createdBy === deviceRef.current).length);
    const setg = items.find(i => i.gameSet && i.gameId); machineOverrideRef.current = setg ? { gameId: setg.gameId!, rules: setg.gameRules ?? {} } : null;   // retarget machines if a set-game event sits in the room
    if (delCuratedRef.current.size) decorRef.current = decorRef.current.filter(d => !delCuratedRef.current.has(d.id));   // hide removed curated decor
    setLoreVer(v => v + 1); rebuildHeight(); rebuildNpcs();
    // On-enter markers: fire once per player (per marker id) — Oracle card / glitch sequence / reward.
    for (const mk of loreRef.current.filter(l => l.mode === 'enter')) {
      let unseen = true; try { unseen = localStorage.getItem(`ouroo_lore_${mk.id}`) !== '1'; localStorage.setItem(`ouroo_lore_${mk.id}`, '1'); } catch { /* ignore */ }
      if (unseen) fireMarker(mk);
    }
  };
  // Apply the current room's floor plan (shape + base levels), then rebuild walkability. Repositions
  // you to the plan's spawn if your tile became void after a shape change.
  useEffect(() => {
    const plan = planById(roomMeta.plan);
    planRef.current = planMask(plan);
    waterRef.current = planWaterMask(plan);
    matRef.current = planMaterialMask(plan);
    matOverrideRef.current.clear(); matIdRef.current.clear(); loreRef.current = []; bgRef.current = 'auto'; bgIdRef.current = null;   // overrides + lore + atmosphere reload per room
    camRef.current = computeCam(planRef.current, GRID);
    decorRef.current = (CURATED_ITEMS[roomMeta.slug] ?? []).map(([kind, gx, gy, dir, elev], i) => ({ id: `c_${roomMeta.slug}_${i}`, kind, gx, gy, dir: dir ?? 0, elev: elev ?? 0, createdBy: 'curated' })).filter(d => !delCuratedRef.current.has(d.id));
    placedNpcsRef.current = [];   // admin-placed NPCs reload per room (from room_items via ingest)
    rebuildNpcs();
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
    if (!canBuildHere()) { flashHint('No permission to build here'); return; }
    const isPortal = kind.startsWith('portal:');   // a player-made portal (free; renders + behaves as a teleporter)
    const isGame = kind.startsWith('game:');        // a placed play-trigger (renders as an arcade cabinet)
    const isSetGame = kind.startsWith('setgame:');  // a retarget event (invisible, zero-footprint)
    const isFree = isPortal || isGame || isSetGame; // admin events: no inventory, raw kind persisted as-is
    const engineKind = isPortal ? 'teleporter' : isGame ? 'arcade' : isSetGame ? 'setgame' : kind;
    // Inventory: non-mods need stock for real furni (free basics are unlimited; admin events are free). Mods build freely.
    if (!isFree && !modRef.current && furniCount(kind) < 1) { flashHint(isFurniFree(kind) ? 'Unavailable' : 'Out of stock — buy more ✦'); return; }
    if (itemsRef.current.length >= MAX_ITEMS) { flashHint('Room is full'); return; }   // generous safety ceiling only
    const dir = isRotatable(engineKind) ? placeDirRef.current : 0;
    const elev = isFree ? 0 : placeElevRef.current;   // any piece can be lifted — stack decks, mount decor on tables, build tall
    const [sw, sh] = effSpan(engineKind, dir);
    if (!isSetGame) {   // set-game is a 1×1 behaviour marker — no footprint to fit
      if (gx + sw > GRID || gy + sh > GRID) { flashHint('Doesn\'t fit here'); return; }
      for (let du = 0; du < sw; du++) for (let dv = 0; dv < sh; dv++) if (planLvl(gx + du, gy + dv) < 0) { flashHint('Doesn\'t fit here'); return; }
    }
    if (!isFree && !modRef.current) consumeFurni(kind);   // take one from inventory (free basics: no-op)
    const id = (crypto?.randomUUID?.() ?? `it_${Date.now()}_${Math.floor(Math.random() * 1e9)}`);
    const dbKind = isFree ? kind : encodeKind(engineKind, dir, elev);   // the room_items `kind` text (carries dir/elev or the event link)
    const item = hydrateItem(dbKind, id, gx, gy, deviceRef.current);
    itemsRef.current.push(item); setMyCount(c => c + 1); rebuildHeight();
    if (isPortal) flashHint('Portal placed ✦ walk onto it to travel');
    else if (isGame) flashHint('Game placed ✦ walk close to play');
    else if (isSetGame) { machineOverrideRef.current = { gameId: item.gameId ?? '', rules: item.gameRules ?? {} }; flashHint('Machines in this room retargeted ✦'); }
    channelRef.current?.send({ type: 'broadcast', event: 'place', payload: { id, kind: isFree ? dbKind : engineKind, gx, gy, dir, elev, by: item.createdBy } });
    supabase?.from('room_items').insert({ id, room, kind: dbKind, x: gx, y: gy, created_by: item.createdBy }).then(undefined, () => {});
  };
  // Drop a whole pre-made building (prefab) CENTERED on the tapped tile, so it lands where you point.
  // Pieces reuse the same construction kinds + dir/elev encoding as single placements; one batched DB
  // insert keeps persistence cheap. It's a building TOOL — free to place and exempt from the per-person
  // cap (a building is dozens of pieces), but still bounded by the room-wide item cap.
  const prefabOrigin = (p: Prefab, gx: number, gy: number) => ({ ox: gx - ((p.w - 1) >> 1), oy: gy - ((p.d - 1) >> 1) });
  const placePrefab = (p: Prefab, gx: number, gy: number) => {
    if (!requireAccount()) return;
    if (!canBuildHere()) { flashHint('No permission to build here'); return; }
    const { ox, oy } = prefabOrigin(p, gx, gy);
    if (ox < 0 || oy < 0 || ox + p.w > GRID || oy + p.d > GRID) { flashHint('Building doesn\'t fit here'); return; }
    for (let x = 0; x < p.w; x++) for (let y = 0; y < p.d; y++) if (planLvl(ox + x, oy + y) < 0) { flashHint('Building doesn\'t fit here'); return; }
    if (itemsRef.current.length + p.pieces.length > MAX_ITEMS) { flashHint('Not enough room left for that'); return; }
    // Pieces are tagged created_by:'prefab' (like curated decor) — it's a free building TOOL, so picking a
    // piece back up just removes it (no inventory refund minted), and the bundle is exempt from the cap.
    const by = 'prefab';
    const rows = p.pieces.map(pc => {
      const id = (crypto?.randomUUID?.() ?? `it_${Date.now()}_${Math.floor(Math.random() * 1e9)}`);
      const ax = ox + pc.x, ay = oy + pc.y, dir = isRotatable(pc.kind) ? pc.dir : 0;
      itemsRef.current.push({ id, kind: pc.kind, gx: ax, gy: ay, dir, elev: pc.elev, createdBy: by });
      channelRef.current?.send({ type: 'broadcast', event: 'place', payload: { id, kind: pc.kind, gx: ax, gy: ay, dir, elev: pc.elev, by } });
      return { id, room, kind: encodeKind(pc.kind, dir, pc.elev), x: ax, y: ay, created_by: by };
    });
    rebuildHeight();
    flashHint(`${p.name} placed ✦`);
    supabase?.from('room_items').insert(rows).then(undefined, () => {});
  };
  // Rebuild the live NPC roster = curated cast + admin-placed NPCs (called on room load + on add/remove).
  const rebuildNpcs = () => {
    const slug = roomMetaRef.current.slug;
    const curated = (CURATED_NPCS[slug] ?? []).map(n => ({ handle: n.handle, skinId: n.skinId, icon: null, fx: n.gx, fy: n.gy, tx: n.gx, ty: n.gy, z: n.lvl ?? 0, lvl: n.lvl ?? 0, bubble: '', bubbleLife: 0, af: 0, lines: n.lines, hx: n.gx, hy: n.gy, roam: n.roam, beats: n.beats, hints: n.hints, hintIdx: 0, nid: n.id ?? n.handle, near: false, cool: 0 }));
    const placed = placedNpcsRef.current.map(p => { const lvl = Math.max(0, planLvl(p.gx, p.gy)); return { id: p.id, handle: p.data.n, skinId: p.data.a, icon: null, fx: p.gx, fy: p.gy, tx: p.gx, ty: p.gy, z: lvl, lvl, bubble: '', bubbleLife: 0, af: 0, lines: p.data.l, hx: p.gx, hy: p.gy, roam: 0, beats: [] as string[], hints: [] as string[], hintIdx: 0, nid: p.id, near: false, cool: 0 }; });
    npcsRef.current = [...curated, ...placed];
  };
  // Drop a designed NPC at a tile (admin). Persists as an `npc:` row + live-broadcasts to the room.
  const placeNpcAt = (gx: number, gy: number) => {
    const d = pendingNpcRef.current; if (!d) { setPlaceNpc(false); return; }
    if (!canBuildHere()) { flashHint('No permission to build here'); return; }
    const id = (crypto?.randomUUID?.() ?? `npc_${Date.now()}_${Math.floor(Math.random() * 1e9)}`);
    placedNpcsRef.current.push({ id, gx, gy, data: d }); rebuildNpcs();
    const kind = encodeNpc(d);
    channelRef.current?.send({ type: 'broadcast', event: 'npc', payload: { id, kind, x: gx, y: gy } });
    supabase?.from('room_items').insert({ id, room, kind, x: gx, y: gy, created_by: deviceRef.current }).then(undefined, () => {});
    setPlaceNpc(false); pendingNpcRef.current = null; flashHint(`${d.n} placed ☻`);
  };
  const openNpcEditor = () => { setNpcEditor(true); setPlacingKind(null); setRemoveMode(false); setRotateMode(false); setTileMode(false); setAtmoMode(false); setGamesMode(false); setBuildMode(false); setPlacingPrefab(null); setEditSel(null); };
  // Arm the next tile-tap to drop a game event: a Play trigger (proximity cabinet) or a Set event
  // (retargets this room's machines). The chosen rules ride along (plumbing only for now).
  const armGamePlacement = () => {
    const kind = gTab === 'set' ? encodeSetGame(gGameId, gRules) : encodeGameTrigger(gGameId, gRules, gHidden);
    setPlacingKind(kind); setGamesMode(false); setRemoveMode(false); setRotateMode(false); setTileMode(false); setAtmoMode(false); setBuildMode(false); setPlacingPrefab(null);
    flashHint(gTab === 'set' ? 'Tap a tile to retarget this room\'s machines ▸' : gHidden ? 'Tap a tile to drop the hidden cabinet ◌' : 'Tap a tile to drop the game cabinet ▸');
  };
  // The top editable player item on a tile (own items, or anything if you can build here).
  const topItemAt = (gx: number, gy: number): Item | undefined =>
    [...itemsRef.current].reverse().find(i => { const [sw, sh] = effSpan(i.kind, i.dir || 0); return gx >= i.gx && gx < i.gx + sw && gy >= i.gy && gy < i.gy + sh && (canBuildHere() || i.createdBy === deviceRef.current); });
  // Rotate one specific placed item 90° (live + persisted).
  const rotateItem = (hit: Item) => {
    if (!isRotatable(hit.kind)) { flashHint('This object doesn\'t rotate'); return; }
    hit.dir = ((hit.dir ?? 0) + 1) % 4;
    channelRef.current?.send({ type: 'broadcast', event: 'rotate', payload: { id: hit.id, dir: hit.dir } });
    supabase?.from('room_items').update({ kind: encodeKind(hit.kind, hit.dir, hit.elev || 0) }).eq('id', hit.id).then(undefined, () => {});
  };
  // Pick one specific placed item back up (returns to inventory unless it's a portal / prefab piece).
  const dropItem = (hit: Item) => {
    if (!hit.portalTo && hit.createdBy !== 'prefab') returnFurni(hit.kind);
    itemsRef.current = itemsRef.current.filter(i => i.id !== hit.id);
    if (hit.createdBy === deviceRef.current) setMyCount(c => Math.max(0, c - 1)); rebuildHeight();
    if (editSelRef.current?.id === hit.id) setEditSel(null);
    channelRef.current?.send({ type: 'broadcast', event: 'unplace', payload: { id: hit.id } });
    supabase?.from('room_items').delete().eq('id', hit.id).then(undefined, () => {});
  };
  // Rotate the top item on a tile (own items / mods) one 90° step.
  const rotateAt = (gx: number, gy: number) => { const hit = topItemAt(gx, gy); if (hit) rotateItem(hit); };
  const removeAt = (gx: number, gy: number) => {
    const hit = topItemAt(gx, gy);
    if (hit) { dropItem(hit); return; }
    // No player furni here — admins may also pick up an admin-placed NPC, or a baked-in (curated) decor piece.
    if (modRef.current) {
      const npc = placedNpcsRef.current.find(p => p.gx === gx && p.gy === gy);
      if (npc) {
        placedNpcsRef.current = placedNpcsRef.current.filter(p => p.id !== npc.id); rebuildNpcs();
        channelRef.current?.send({ type: 'broadcast', event: 'npcdel', payload: { id: npc.id } });
        supabase?.from('room_items').delete().eq('id', npc.id).then(undefined, () => {});
        flashHint('NPC removed ☻'); return;
      }
      // Persist a tombstone so a removed curated piece stays gone for everyone.
      const cur = [...decorRef.current].reverse().find(i => { const [sw, sh] = effSpan(i.kind, i.dir || 0); return gx >= i.gx && gx < i.gx + sw && gy >= i.gy && gy < i.gy + sh; });
      if (!cur) return;
      delCuratedRef.current.add(cur.id);
      decorRef.current = decorRef.current.filter(d => d.id !== cur.id); rebuildHeight();
      channelRef.current?.send({ type: 'broadcast', event: 'delcurated', payload: { id: cur.id } });
      const tid = (crypto?.randomUUID?.() ?? `del_${Date.now()}_${Math.floor(Math.random() * 1e9)}`);
      supabase?.from('room_items').insert({ id: tid, room, kind: `del:${cur.id}`, x: cur.gx, y: cur.gy, created_by: deviceRef.current }).then(undefined, () => {});
      flashHint('Removed (baked-in piece) ✦');
    }
  };
  // Admin tile-painting — set a tile's material (grass/marble/…) or clear it (paintMat -1) back to the
  // plan default. Persisted as a `mat:<n>` room_items row keyed to the tile (works in any room slug).
  const paintTile = (gx: number, gy: number) => {
    if (!modRef.current) { flashHint('Admins only'); return; }
    if (planLvl(gx, gy) < 0) return;
    const k = key(gx, gy); const n = paintMatRef.current; const existing = matIdRef.current.get(k);
    channelRef.current?.send({ type: 'broadcast', event: 'mat', payload: { x: gx, y: gy, n } });   // live for others in the room
    if (n < 0) {   // clear → revert to the plan's material
      matOverrideRef.current.delete(k); matIdRef.current.delete(k);
      if (existing) supabase?.from('room_items').delete().eq('id', existing).then(undefined, () => {});
      return;
    }
    matOverrideRef.current.set(k, n);
    if (existing) supabase?.from('room_items').update({ kind: `mat:${n}` }).eq('id', existing).then(undefined, () => {});
    else { const id = (crypto?.randomUUID?.() ?? `mat_${Date.now()}_${Math.floor(Math.random() * 1e9)}`); matIdRef.current.set(k, id); supabase?.from('room_items').insert({ id, room, kind: `mat:${n}`, x: gx, y: gy, created_by: deviceRef.current }).then(undefined, () => {}); }
  };
  // ── Lore-marker authoring (admins) ──
  const newId = (p: string) => (crypto?.randomUUID?.() ?? `${p}_${Date.now()}_${Math.floor(Math.random() * 1e9)}`);
  const removeLore = (id: string) => {
    loreRef.current = loreRef.current.filter(l => l.id !== id); setLoreVer(v => v + 1);
    supabase?.from('room_items').delete().eq('id', id).then(undefined, () => {});
  };
  const kindFor = (style: LoreStyle, mode: LoreMode, text: string) => style === 'reward' ? encodeReward(mode, mkCrystals, mkSkin) : encodeMarker(style, mode, text);
  const saveMarker = () => {
    const reward = mkStyle === 'reward';
    const text = loreText.trim(); if (!reward && !text) { flashHint('Write something first'); return; }
    if (reward && !(mkCrystals > 0) && !mkSkin) { flashHint('Set crystals or a skin'); return; }
    if (loreEditId) {   // edit an existing marker in place (keep its mode + tile; allow style/value change)
      const m = loreRef.current.find(l => l.id === loreEditId); if (m) { m.text = text; m.style = mkStyle; m.crystals = mkCrystals; m.skinId = mkSkin; supabase?.from('room_items').update({ kind: kindFor(mkStyle, m.mode, text) }).eq('id', m.id).then(undefined, () => {}); }
      setLoreEditId(null); setLoreText(''); setLoreVer(v => v + 1); flashHint('Marker updated ✦'); return;
    }
    if (mkMode === 'enter') {   // on-enter marker — saved immediately (tile ignored)
      const id = newId('lore'); loreRef.current.push({ id, mode: 'enter', style: mkStyle, gx: 0, gy: 0, text, crystals: mkCrystals, skinId: mkSkin });
      supabase?.from('room_items').insert({ id, room, kind: kindFor(mkStyle, 'enter', text), x: 0, y: 0, created_by: deviceRef.current }).then(undefined, () => {});
      setLoreText(''); setLoreVer(v => v + 1); flashHint('On-enter marker saved ✦'); return;
    }
    pendingLoreRef.current = { text, style: mkStyle, crystals: mkCrystals, skinId: mkSkin }; setPlaceLore(true); setLoreEditor(false); flashHint('Tap a tile to drop the marker ✎');
  };
  const placeTileLoreAt = (gx: number, gy: number) => {
    const { text, style, crystals, skinId } = pendingLoreRef.current; if (style !== 'reward' && !text) { setPlaceLore(false); return; }
    const id = newId('lore'); loreRef.current.push({ id, mode: 'tile', style, gx, gy, text, crystals, skinId });
    const kind = style === 'reward' ? encodeReward('tile', crystals, skinId) : encodeMarker(style, 'tile', text);
    supabase?.from('room_items').insert({ id, room, kind, x: gx, y: gy, created_by: deviceRef.current }).then(undefined, () => {});
    pendingLoreRef.current = { text: '', style: 'oracle', crystals: 0, skinId: '' }; setPlaceLore(false); setLoreText(''); setLoreVer(v => v + 1); flashHint('Marker placed ✎');
  };
  const openLoreEditor = () => { setLoreText(''); setLoreEditId(null); setMkMode('enter'); setMkStyle('oracle'); setMkCrystals(100); setMkSkin(''); setLoreEditor(true); setPlacingKind(null); setGamesMode(false); setRemoveMode(false); setRotateMode(false); setTileMode(false); setAtmoMode(false); setBuildMode(false); setPlacingPrefab(null); };
  // Set the room's atmosphere (backdrop layer). 'auto' clears the override; otherwise upsert a `bg:` row.
  const setAtmosphere = (a: Atmo) => {
    bgRef.current = a; setBgAtmo(a);
    channelRef.current?.send({ type: 'broadcast', event: 'bg', payload: { a } });   // live for others
    const existing = bgIdRef.current;
    if (a === 'auto') { bgIdRef.current = null; if (existing) supabase?.from('room_items').delete().eq('id', existing).then(undefined, () => {}); return; }
    if (existing) supabase?.from('room_items').update({ kind: `bg:${a}` }).eq('id', existing).then(undefined, () => {});
    else { const id = newId('bg'); bgIdRef.current = id; supabase?.from('room_items').insert({ id, room, kind: `bg:${a}`, x: 0, y: 0, created_by: deviceRef.current }).then(undefined, () => {}); }
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
    selfRef.current.handle = lp.handle || 'Guest';
    myHandleRef.current = selfRef.current.handle; setMyHandle(selfRef.current.handle);
    const ap0 = getSelectedSkinId(); selfRef.current.skinId = ap0;
    const r0 = resolveAppearance(ap0); selfRef.current.icon = r0.kind === 'icon' ? r0.spec : null;
    refreshWalletFromCloud();
    setMyOwnerId(deviceRef.current); ownerIdRef.current = deviceRef.current;
    getAuthIdentity().then(a => { if (a?.handle) { selfRef.current.handle = a.handle; myHandleRef.current = a.handle; setMyHandle(a.handle); } if (a?.device) { setMyOwnerId(a.device); ownerIdRef.current = a.device; } });
    Promise.all([amIModerator(), amISuperAdmin()]).then(([m, s]) => { const ok = m || s; modRef.current = ok; setIsMod(ok); setIsSuper(s); });   // super-admins build in curated rooms too

    // Tutorial rooms are SOLO instances — no presence/broadcast join (just you + the Oracle). We still
    // LOAD their furni from the DB so admins can dress them and the decor persists; placement/removal
    // writes straight to room_items (channel sends are no-ops without a channel).
    if (isTutRoom(room)) {
      remotesRef.current.clear(); itemsRef.current = []; matOverrideRef.current.clear(); rebuildHeight(); setPopulation(1); setConnected(false);
      if (!supabase) return;
      let aliveTut = true;
      fetchAllRoomItems(supabase, room).then(rows => { if (aliveTut) ingestItemRows(rows); });
      return () => { aliveTut = false; };
    }
    if (!supabase || !entered) return;   // wait for the lobby "Enter" so the join is deliberate + clean
    if (!supabase || !entered) return;   // wait for the lobby "Enter" so the join is deliberate + clean
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
          const rawK = String(pl.kind);
          if (rawK.startsWith('portal:') || rawK.startsWith('game:') || rawK.startsWith('setgame:')) { const it = hydrateItem(rawK, id, Number(pl.gx), Number(pl.gy), String(pl.by ?? '')); itemsRef.current.push(it); if (it.gameSet && it.gameId) machineOverrideRef.current = { gameId: it.gameId, rules: it.gameRules ?? {} }; }
          else itemsRef.current.push({ id, kind: rawK, gx: Number(pl.gx), gy: Number(pl.gy), dir: Number(pl.dir) || 0, elev: Number(pl.elev) || 0, createdBy: String(pl.by ?? '') });
          rebuildHeight();
        })
        .on('broadcast', { event: 'rotate' }, ({ payload }) => { const pl = payload as Record<string, unknown>; const id = String(pl?.id ?? ''); const it = itemsRef.current.find(i => i.id === id); if (it) it.dir = Number(pl.dir) || 0; })
        .on('broadcast', { event: 'move' }, ({ payload }) => { const pl = payload as Record<string, unknown>; const it = itemsRef.current.find(i => i.id === String(pl?.id ?? '')); if (it) { it.gx = Number(pl.gx); it.gy = Number(pl.gy); rebuildHeight(); } })
        .on('broadcast', { event: 'npc' }, ({ payload }) => { const pl = payload as Record<string, unknown>; const id = String(pl?.id ?? ''); if (!id || placedNpcsRef.current.some(p => p.id === id)) return; const nd = decodeNpc(String(pl.kind)); if (nd) { placedNpcsRef.current.push({ id, gx: Number(pl.x), gy: Number(pl.y), data: nd }); rebuildNpcs(); } })
        .on('broadcast', { event: 'npcdel' }, ({ payload }) => { const id = String((payload as Record<string, unknown>)?.id ?? ''); if (id) { placedNpcsRef.current = placedNpcsRef.current.filter(p => p.id !== id); rebuildNpcs(); } })
        .on('broadcast', { event: 'unplace' }, ({ payload }) => { const id = String((payload as Record<string, unknown>)?.id ?? ''); itemsRef.current = itemsRef.current.filter(i => i.id !== id); rebuildHeight(); })
        .on('broadcast', { event: 'mat' }, ({ payload }) => { const pl = payload as Record<string, unknown>; const k = key(Number(pl.x), Number(pl.y)); const n = Number(pl.n); if (n < 0) matOverrideRef.current.delete(k); else matOverrideRef.current.set(k, n); })   // live tile-paint
        .on('broadcast', { event: 'bg' }, ({ payload }) => { const a = String((payload as Record<string, unknown>)?.a ?? 'auto') as Atmo; if (ATMOS.some(x => x.id === a)) { bgRef.current = a; setBgAtmo(a); } })   // live atmosphere change
        .on('broadcast', { event: 'delcurated' }, ({ payload }) => { const id = String((payload as Record<string, unknown>)?.id ?? ''); if (id) { delCuratedRef.current.add(id); decorRef.current = decorRef.current.filter(d => d.id !== id); rebuildHeight(); } })   // admin removed a baked-in piece
        .on('broadcast', { event: 'leave' }, ({ payload }) => { const id = String((payload as Record<string, unknown>)?.id ?? ''); if (id && remotesRef.current.delete(id)) setPopulation(remotesRef.current.size + 1); })   // someone left/refreshed → drop them now (don't wait for presence timeout)
        .subscribe(async status => {
          if (!alive) return;
          joinedRef.current = status === 'SUBSCRIBED';
          if (status === 'SUBSCRIBED') {
            setConnected(true);
            const a = await getAuthIdentity().catch(() => null); if (a?.handle) me.handle = a.handle;
            await ch.track({ id: me.id, handle: me.handle, skinId: me.skinId, fx: me.fx, fy: me.fy, lvl: me.lvl });   // small payload only — no nested objects
            ingestItemRows(await fetchAllRoomItems(sb, room));
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
    // Supersample: back the 1280×720 stage with 2× device pixels so everything renders crisp (not soft-upscaled).
    const SS = 2; canvas.width = STAGE_W * SS; canvas.height = STAGE_H * SS; ctx.setTransform(SS, 0, 0, SS, 0, 0);
    const update = () => {
      framesRef.current++;
      const me = selfRef.current;
      let moving = false;
      if (me.path.length) {
        const wp = me.path[0]; const dx = wp.gx - me.fx, dy = wp.gy - me.fy; const d = Math.hypot(dx, dy);
        if (d < 0.12) { me.fx = wp.gx; me.fy = wp.gy; me.lvl = wp.z; me.path.shift(); }
        else { const s = Math.min(WALK, d); me.fx += dx / d * s; me.fy += dy / d * s; moving = true; me.af += 1; strideRef.current += s; }
      }
      if (moving) { if (!wasMovingRef.current || strideRef.current >= 1.05) { strideRef.current = 0; musicRef.current?.footstep(); } }
      else { me.af += 0.3; strideRef.current = 1.05; }   // primed so the next walk's first step sounds at once
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
      // PORTALS activate by WALKING ONTO them — fires the instant your tile becomes a portal tile (whether
      // you stop on it OR walk straight over it), rising-edge so it triggers once per arrival; stepping off
      // re-arms it. No code → travel straight away; coded → prompt.
      { const cgx = clampTile(me.fx), cgy = clampTile(me.fy), ct = cgy * GRID + cgx;
        if (ct !== portalTileRef.current) {   // only scan when our tile actually changes (not every frame)
          portalTileRef.current = ct;
          const pt = portalAtTile(cgx, cgy); const pk = pt ? `${pt.gx},${pt.gy}` : null;
          if (pt && lastPortalKeyRef.current !== pk) { if (pt.code) { setPortalPrompt(pt); setPortalCode(''); } else { travelToRef.current(pt); } }
          lastPortalKeyRef.current = pk;
        }
      }
      // ARCADE MACHINES — pop the game picker when the player steps onto a tile adjacent to the cabinet.
      // Rising edge → opens once per approach; re-arms when you step away.
      {
        const override = machineOverrideRef.current;   // a set-game event retargets every hardcoded cabinet in the room
        const ms = MACHINES[roomMetaRef.current.slug] ?? [];
        const px = clampTile(me.fx), py = clampTile(me.fy);
        const adjTo = (gx: number, gy: number) => Math.max(Math.abs(px - gx), Math.abs(py - gy)) === 1;
        let near: Machine | null = null;
        for (const m of ms) { if (adjTo(m.gx, m.gy)) { near = override ? { gx: m.gx, gy: m.gy, games: [gameById(override.gameId)], rules: override.rules } : m; break; } }
        // admin-placed play-triggers (hydrated as `arcade` items carrying a gameId) — each is its own machine
        if (!near) for (const it of itemsRef.current) { if (it.kind === 'arcade' && it.gameId && adjTo(it.gx, it.gy)) { near = { gx: it.gx, gy: it.gy, games: [gameById(it.gameId)], rules: it.gameRules }; break; } }
        const nearKey = near ? `${near.gx},${near.gy}` : null;
        if (near && nearKey !== nearMachineRef.current) { musicRef.current?.chime(); setMachinePrompt(near); }
        nearMachineRef.current = nearKey;
      }
      // ── TUTORIAL flow ── the onward door (TUT_PORTAL_TILE) + the terminal, gated by the current step.
      {
        const step = onboardingRef.current;
        // Terminal (t_terminal) — walk close → boot animation → character creator.
        if (step === 'terminal') {
          const nearTerm = Math.hypot(5 - me.fx, 2 - me.fy) < MACHINE_RANGE;
          if (nearTerm && !nearTermRef.current) { musicRef.current?.chime(); setBootAnim(true); }
          nearTermRef.current = nearTerm;
        }
        // The onward door: which action it triggers (or null if not yet open this step).
        const door = step === 'oracle' ? 'code'
          : step === 'arcade' ? (gamePlayedRef.current ? 'go' : null)
          : step === 'character' ? (charDoneRef.current ? 'sim' : null)
          : step === 'yourroom' ? 'go' : null;
        const onDoor = clampTile(me.fx) === TUT_PORTAL_TILE.gx && clampTile(me.fy) === TUT_PORTAL_TILE.gy;
        if (!moving && me.path.length === 0 && door && onDoor && !tutPortalArmRef.current) {
          tutPortalArmRef.current = true;
          musicRef.current?.portal();
          if (door === 'code') { setPortalPrompt({ gx: TUT_PORTAL_TILE.gx, gy: TUT_PORTAL_TILE.gy, code: TUT_SCRIPT.oracle.code!, to: '__tut__' }); setPortalCode(''); }
          else if (door === 'sim') setSimConfirm(true);
          else { const nx = step === 'arcade' ? 'terminal' : 'town'; onSetStepRef.current?.(nx as OnboardStep); }
        } else if (!onDoor) tutPortalArmRef.current = false;   // re-arm when you step off the door
      }
      // LORE MARKERS — speak the Oracle's authored lore when you walk close to a tile marker (rising edge).
      for (const lm of loreRef.current) {
        if (lm.mode !== 'tile') continue;
        const near = Math.hypot(lm.gx - me.fx, lm.gy - me.fy) < MACHINE_RANGE;
        if (near && !lm.near) {
          if (lm.style === 'reward') {   // claim once per player ever
            let unseen = true; try { unseen = localStorage.getItem(`ouroo_lore_${lm.id}`) !== '1'; localStorage.setItem(`ouroo_lore_${lm.id}`, '1'); } catch { /* ignore */ }
            if (unseen) claimReward(lm);
          } else { musicRef.current?.chime(); if (lm.style === 'glitch') setGlitchSeq(lm.text); else setLoreCard(lm.text); }
        }
        lm.near = near;
      }
      // SPECIALTY TILES (material/block properties) — lava + void hazards, at the player's CURRENT level.
      if (roomMetaRef.current.slug !== 'town') {
        const px = clampTile(me.fx), py = clampTile(me.fy), sk = key(px, py), pbase = Math.max(0, planLvl(px, py));
        const smat = matOverrideRef.current.has(sk) ? matOverrideRef.current.get(sk)! : matRef.current[sk];
        const onFloor = Math.abs(me.lvl - pbase) < 0.3;   // floor material only counts when you're on the ground floor
        let onLava = onFloor && smat === 7, onVoid = onFloor && smat === 12;
        // lava/void BLOCKS — a hazard when you're standing on that block's top (any elevation).
        const all = decorRef.current.length ? itemsRef.current.concat(decorRef.current) : itemsRef.current;
        for (const it of all) {
          if (it.kind !== 'blk_lava' && it.kind !== 'blk_void') continue;
          const [sw, sh] = effSpan(it.kind, it.dir || 0);
          if (px >= it.gx && px < it.gx + sw && py >= it.gy && py < it.gy + sh) {
            const surf = Math.max(0, planLvl(it.gx, it.gy)) + (it.elev || 0) + defOf(it.kind).h;
            if (Math.abs(surf - me.lvl) < 0.25) { if (it.kind === 'blk_lava') onLava = true; else onVoid = true; }
          }
        }
        if (onLava && !moving && me.path.length === 0) { flashHint('The lava takes you — back to Town.'); musicRef.current?.portal(); switchRoomRef.current(TOWN); }
        if (onVoid) {
          voidTimerRef.current++;
          if (voidTimerRef.current === 70) flashHint('The void is pulling you under…');
          if (voidTimerRef.current > 200) { voidTimerRef.current = 0; flashHint('The void swallows you — back to Town.'); musicRef.current?.portal(); switchRoomRef.current(TOWN); }
        } else voidTimerRef.current = 0;
      } else voidTimerRef.current = 0;
      for (const r of remotesRef.current.values()) { r.fx += (r.tx - r.fx) * 0.3; r.fy += (r.ty - r.fy) * 0.3; r.z += (r.lvl - r.z) * 0.28; r.af += Math.hypot(r.tx - r.fx, r.ty - r.fy) > 0.02 ? 1 : 0.3; if (r.bubbleLife > 0) r.bubbleLife--; }
      const sf = selfRef.current;
      for (const n of npcsRef.current) {   // idle life + gentle roaming for NPCs
        if (n.roam && n.hx != null && n.hy != null) {
          n.fx += (n.tx - n.fx) * 0.06; n.fy += (n.ty - n.fy) * 0.06;
          const moving = Math.hypot(n.tx - n.fx, n.ty - n.fy) > 0.06; n.af += moving ? 1 : 0.4;
          if (!moving && Math.random() < 0.012) { const ang = Math.random() * 6.283, r = Math.random() * n.roam, nx = Math.round(n.hx + Math.cos(ang) * r), ny = Math.round(n.hy + Math.sin(ang) * r); if (planLvl(nx, ny) >= 0 && !isWater(nx, ny) && !solidRef.current[ny * GRID + nx]) { n.tx = nx; n.ty = ny; } }
        } else n.af += 0.5;
        if (n.bubbleLife > 0) n.bubbleLife--;
        if (n.cool && n.cool > 0) n.cool--;
        // ── Speech on approach ── while the player is near, the NPC talks on a cadence (repeats while you
        // linger). Priority: hints (cycle forever — the clues/codes) → unseen lore beats (once) → ambient.
        const near = Math.hypot(n.fx - sf.fx, n.fy - sf.fy) < 2.4;
        if (near && !n.near) musicRef.current?.chime();   // soft chime the moment you enter an NPC's range
        if (near && n.bubbleLife <= 0 && (n.cool ?? 0) <= 0) {
          let said = false;
          if (n.hints && n.hints.length) { n.bubble = n.hints[(n.hintIdx ?? 0) % n.hints.length]; n.hintIdx = (n.hintIdx ?? 0) + 1; said = true; }
          else if (n.beats && n.beats.length) {
            const k = `ouroo_lore_${roomMeta.slug}_${n.nid ?? n.handle}`;
            let p = 0; try { p = Number(localStorage.getItem(k) || 0); } catch { /* ignore */ }
            if (p < n.beats.length) { n.bubble = n.beats[p]; try { localStorage.setItem(k, String(p + 1)); } catch { /* ignore */ } said = true; }
          }
          if (!said && n.lines && n.lines.length) { n.bubble = n.lines[Math.floor(Math.random() * n.lines.length)]; said = true; }
          if (said) { n.bubbleLife = 240; n.cool = 300; }
        }
        n.near = near;
      }
      // Ambient chatter — only NPCs WITHOUT lore beats (so a beat is never talked over).
      if (npcsRef.current.length && framesRef.current % 80 === 0) { const pool = npcsRef.current.filter(s => (!s.beats || !s.beats.length) && s.lines && s.lines.length); const sp = pool[Math.floor(Math.random() * pool.length)]; if (sp && sp.bubbleLife <= 0) { sp.bubble = sp.lines![Math.floor(Math.random() * sp.lines!.length)]; sp.bubbleLife = 210; } }
    };

    const diamond = (cx: number, cy: number, hw: number, hh: number) => { ctx.beginPath(); ctx.moveTo(cx, cy - hh); ctx.lineTo(cx + hw, cy); ctx.lineTo(cx, cy + hh); ctx.lineTo(cx - hw, cy); ctx.closePath(); };
    // Furni sprites are drawn by the shared renderer in @/lib/furniRender (drawFurniSprite).

    // Avatar BODY (shadow + skin) — drawn in the depth-sorted pass so it occludes / is occluded correctly.
    const drawAvatarBody = (a: Avatar, isSelf: boolean) => {
      const wade = isWater(clampTile(a.fx), clampTile(a.fy)) ? 6 : 0;   // sink + ripple when standing in a pool
      const p = iso(a.fx, a.fy, a.z); const sx = p.sx, sy = p.sy + wade;
      const pi = a.skinId && a.skinId.startsWith('person:') ? parsePerson(a.skinId) : null;
      const col = pi ? personPrimaryColor(pi) : a.icon ? iconPrimaryColor(a.icon) : skinById(a.skinId).color;
      const moving = isSelf ? selfRef.current.path.length > 0 : Math.hypot(a.tx - a.fx, a.ty - a.fy) > 0.02;
      if (wade) { ctx.save(); ctx.strokeStyle = hexA('#bff2ff', 0.7); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(sx, sy, 15 + Math.sin(framesRef.current * 0.12) * 2, 7, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }
      ctx.save(); ctx.globalAlpha = 0.4; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(sx, sy, 18, 8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.5; ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 14; ctx.beginPath(); ctx.ellipse(sx, sy, 12, 5, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      const bob = moving ? Math.sin(a.af * 0.3) * 3 : Math.sin(a.af * 0.07) * 1.1;   // idle breathing when still
      ctx.save(); ctx.translate(sx, sy - 30 + bob); ctx.shadowColor = col; ctx.shadowBlur = isSelf ? 22 : 12;
      if (pi) drawPerson(ctx, pi, 42, 56, a.af);
      else if (a.icon) drawIconSpec(ctx, a.icon, 46, a.af);
      else { const sk = skinById(a.skinId); drawSkinShape(ctx, sk.shape, sk.color, 38, 50, a.af); }
      ctx.restore();
    };
    // Avatar NAME LABEL + chat BUBBLE — drawn in a separate pass AFTER everything, so a tall piece of
    // furniture in front can never hide who someone is or what they just said.
    const drawAvatarLabel = (a: Avatar, isSelf: boolean) => {
      const wade = isWater(clampTile(a.fx), clampTile(a.fy)) ? 6 : 0;
      const p = iso(a.fx, a.fy, a.z); const sx = p.sx, sy = p.sy + wade;
      const col = a.skinId && a.skinId.startsWith('person:') ? personPrimaryColor(parsePerson(a.skinId)) : a.icon ? iconPrimaryColor(a.icon) : skinById(a.skinId).color;
      ctx.save(); ctx.font = '700 11px Helvetica, Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const nw = ctx.measureText(a.handle).width + 14, ny = sy + 14;
      ctx.fillStyle = 'rgba(6,6,10,0.9)'; ctx.beginPath(); ctx.roundRect(sx - nw / 2, ny - 8, nw, 16, 8); ctx.fill();   // solid plate so the name reads over any avatar/atmosphere
      ctx.strokeStyle = isSelf ? hexA(col, 0.85) : 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = isSelf ? col : '#fff'; ctx.fillText(a.handle, sx, ny); ctx.restore();
      if (a.bubbleLife > 0 && a.bubble) {
        const alpha = Math.min(1, a.bubbleLife / 30); ctx.save(); ctx.globalAlpha = alpha; ctx.font = '600 15px Helvetica, Arial';
        const lines = wrapBubble(a.bubble); const lh = 19, padY = 7;
        const tw = Math.max(...lines.map(l => ctx.measureText(l).width)), bw = tw + 22, bh = lines.length * lh + padY * 2;
        const bx = sx - bw / 2, by = sy - 56 - bh;   // sit the whole box above the head regardless of line count
        ctx.fillStyle = 'rgba(10,10,18,0.94)'; ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 8); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(sx - 6, by + bh); ctx.lineTo(sx + 6, by + bh); ctx.lineTo(sx, by + bh + 8); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        lines.forEach((l, i) => ctx.fillText(l, sx, by + padY + lh / 2 + i * lh));
        ctx.restore();
      }
    };

    const draw = () => {
      const theme = themeRef.current; const t = framesRef.current;
      const atmo: Atmo = bgRef.current === 'auto' ? (theme.day ? 'day' : 'night') : bgRef.current;
      const day = atmo === 'day' || atmo === 'rain' || atmo === 'sunset';   // "bright" → sky + lighter vignette/veranda
      const bg = ctx.createLinearGradient(0, 0, 0, STAGE_H);
      if (atmo === 'day') { bg.addColorStop(0, '#aedcff'); bg.addColorStop(0.5, '#cfeaff'); bg.addColorStop(1, '#eaf6ef'); }
      else if (atmo === 'rain') { bg.addColorStop(0, '#4d555f'); bg.addColorStop(0.5, '#5f6873'); bg.addColorStop(1, '#727b86'); }
      else if (atmo === 'coderain') { bg.addColorStop(0, '#020603'); bg.addColorStop(1, '#04140a'); }
      else if (atmo === 'glitch') { bg.addColorStop(0, '#0a0612'); bg.addColorStop(0.5, '#120a1e'); bg.addColorStop(1, '#060410'); }
      else if (atmo === 'lava') { bg.addColorStop(0, '#1a0603'); bg.addColorStop(0.55, '#3a0e05'); bg.addColorStop(1, '#7a1c06'); }
      else if (atmo === 'purplehaze') { bg.addColorStop(0, '#1a0a2e'); bg.addColorStop(0.5, '#3a1a5e'); bg.addColorStop(1, '#5a2a7a'); }
      else if (atmo === 'swamp') { bg.addColorStop(0, '#0a1408'); bg.addColorStop(0.55, '#13230f'); bg.addColorStop(1, '#1d3318'); }
      else if (atmo === 'cosmic') { bg.addColorStop(0, '#03020a'); bg.addColorStop(0.6, '#0a0820'); bg.addColorStop(1, '#140a2e'); }
      else if (atmo === 'sunset') { bg.addColorStop(0, '#2a2a6e'); bg.addColorStop(0.45, '#c8527a'); bg.addColorStop(0.7, '#ff9a5a'); bg.addColorStop(1, '#ffd27a'); }
      else { bg.addColorStop(0, '#08080e'); bg.addColorStop(0.55, '#0b0912'); bg.addColorStop(1, '#0a0610'); }
      ctx.fillStyle = bg; ctx.fillRect(0, 0, STAGE_W, STAGE_H);
      if (atmo === 'day') {   // soft sun glow + drifting clouds
        ctx.save(); const sun = ctx.createRadialGradient(STAGE_W * 0.78, 120, 10, STAGE_W * 0.78, 120, 230); sun.addColorStop(0, 'rgba(255,250,224,0.9)'); sun.addColorStop(1, 'rgba(255,250,224,0)'); ctx.fillStyle = sun; ctx.fillRect(0, 0, STAGE_W, 360);
        ctx.fillStyle = 'rgba(255,255,255,0.5)'; for (let i = 0; i < 5; i++) { const cx = ((i * 320 + t * 0.25) % (STAGE_W + 240)) - 120, cy = 60 + (i % 3) * 46; ctx.beginPath(); ctx.ellipse(cx, cy, 60, 17, 0, 0, Math.PI * 2); ctx.ellipse(cx + 40, cy + 6, 44, 14, 0, 0, Math.PI * 2); ctx.ellipse(cx - 36, cy + 7, 38, 12, 0, 0, Math.PI * 2); ctx.fill(); }
        ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(255,248,214,0.05)'; for (const bx of [STAGE_W * 0.34, STAGE_W * 0.62]) { ctx.beginPath(); ctx.moveTo(bx, 0); ctx.lineTo(bx + 110, 0); ctx.lineTo(bx + 300, STAGE_H); ctx.lineTo(bx + 150, STAGE_H); ctx.closePath(); ctx.fill(); } ctx.restore();   // god-rays
      } else if (atmo === 'rain') {   // overcast clouds + slanting rain
        ctx.save(); ctx.fillStyle = 'rgba(28,32,38,0.55)'; for (let i = 0; i < 5; i++) { const cx = ((i * 300 + t * 0.5) % (STAGE_W + 260)) - 130, cy = 50 + (i % 3) * 40; ctx.beginPath(); ctx.ellipse(cx, cy, 74, 19, 0, 0, Math.PI * 2); ctx.ellipse(cx + 46, cy + 7, 52, 15, 0, 0, Math.PI * 2); ctx.ellipse(cx - 40, cy + 8, 44, 13, 0, 0, Math.PI * 2); ctx.fill(); }
        ctx.strokeStyle = 'rgba(190,210,230,0.32)'; ctx.lineWidth = 1; for (let i = 0; i < 150; i++) { const x = (i * 97.3 + t * 11) % (STAGE_W + 40) - 20, y = (i * 53.7 + t * 26) % STAGE_H; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 5, y + 16); ctx.stroke(); } ctx.restore();
      } else if (atmo === 'coderain') {   // Matrix-style green code falling
        ctx.save(); ctx.font = '14px monospace'; ctx.textBaseline = 'top'; const cols = Math.floor(STAGE_W / 14);
        for (let c = 0; c < cols; c++) { const x = c * 14, speed = 2 + (c % 5), head = (t * speed + c * 53) % (STAGE_H + 240);
          for (let r = 0; r < 12; r++) { const y = head - r * 18; if (y < -16 || y > STAGE_H) continue; const ch = String.fromCharCode(0x30A0 + ((c * 7 + r * 13 + (t >> 3)) % 96)); ctx.fillStyle = r === 0 ? 'rgba(200,255,210,0.92)' : `rgba(60,220,90,${Math.max(0, 0.42 - r * 0.035)})`; ctx.fillText(ch, x, y); } } ctx.restore();
      } else if (atmo === 'glitch') {   // jittering RGB-split bands + scanlines
        ctx.save(); for (let i = 0; i < 7; i++) { const y = ((Math.sin(t * 0.045 + i * 1.7) * 0.5 + 0.5) * STAGE_H) | 0, h = 6 + (i % 3) * 12, off = Math.sin(t * 0.3 + i * 2.1) * 16; ctx.globalAlpha = 0.4; ctx.fillStyle = `hsl(${(t * 5 + i * 60) % 360},90%,55%)`; ctx.fillRect(off, y, STAGE_W, h); }
        ctx.globalAlpha = 0.05; ctx.fillStyle = '#00cfff'; for (let y = 0; y < STAGE_H; y += 4) ctx.fillRect(0, y, STAGE_W, 1); ctx.restore();
      } else if (atmo === 'lava') {   // molten glow at the base + rising embers
        ctx.save(); const glow = ctx.createRadialGradient(STAGE_W / 2, STAGE_H, 20, STAGE_W / 2, STAGE_H, STAGE_H * 0.8); glow.addColorStop(0, 'rgba(255,120,30,0.5)'); glow.addColorStop(0.5, 'rgba(220,60,10,0.18)'); glow.addColorStop(1, 'rgba(220,60,10,0)'); ctx.fillStyle = glow; ctx.fillRect(0, 0, STAGE_W, STAGE_H);
        ctx.globalCompositeOperation = 'lighter'; for (let i = 0; i < 36; i++) { const x = (i * 113.7 + Math.sin(t * 0.02 + i) * 30) % STAGE_W, y = STAGE_H - ((i * 67 + t * (1.4 + (i % 4) * 0.5)) % (STAGE_H + 80)); const s = 1 + (i % 3); ctx.globalAlpha = 0.5 + 0.3 * Math.sin(t * 0.1 + i); ctx.fillStyle = i % 3 ? '#ff9a3a' : '#ffd24a'; ctx.fillRect(x, y, s, s); } ctx.restore();
      } else if (atmo === 'purplehaze') {   // drifting magenta haze blobs
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; for (let i = 0; i < 6; i++) { const cx = ((i * 260 + t * (0.3 + i * 0.05)) % (STAGE_W + 320)) - 160, cy = 80 + (i % 3) * 90 + Math.sin(t * 0.02 + i) * 24; const g = ctx.createRadialGradient(cx, cy, 10, cx, cy, 180); const hue = 270 + (i % 3) * 18; g.addColorStop(0, `hsla(${hue},80%,60%,0.16)`); g.addColorStop(1, `hsla(${hue},80%,60%,0)`); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, 180, 0, Math.PI * 2); ctx.fill(); } ctx.restore();
      } else if (atmo === 'swamp') {   // low mist + drifting spores / fireflies
        ctx.save(); ctx.fillStyle = 'rgba(120,160,90,0.05)'; for (let i = 0; i < 4; i++) { const my = STAGE_H * 0.5 + i * 60 + Math.sin(t * 0.02 + i) * 10; ctx.fillRect(0, my, STAGE_W, 50); }
        ctx.globalCompositeOperation = 'lighter'; for (let i = 0; i < 26; i++) { const x = (i * 151.3 + Math.sin(t * 0.03 + i) * 40) % STAGE_W, y = (i * 89 + Math.cos(t * 0.025 + i) * 30 + t * 0.2) % STAGE_H; ctx.globalAlpha = 0.3 + 0.4 * Math.sin(t * 0.08 + i * 1.3); ctx.fillStyle = '#aef07a'; ctx.beginPath(); ctx.arc(x, y, 1.6, 0, Math.PI * 2); ctx.fill(); } ctx.restore();
      } else if (atmo === 'cosmic') {   // starfield + a soft nebula
        ctx.save(); const neb = ctx.createRadialGradient(STAGE_W * 0.7, 160, 20, STAGE_W * 0.7, 160, 320); neb.addColorStop(0, 'rgba(120,70,200,0.22)'); neb.addColorStop(1, 'rgba(120,70,200,0)'); ctx.fillStyle = neb; ctx.fillRect(0, 0, STAGE_W, STAGE_H);
        for (let i = 0; i < 90; i++) { const x = (i * 137.5) % STAGE_W, y = (i * 79.3) % STAGE_H; ctx.globalAlpha = 0.3 + 0.6 * Math.abs(Math.sin(t * 0.04 + i)); ctx.fillStyle = i % 7 ? '#fff' : '#bfd0ff'; const s = i % 11 === 0 ? 2 : 1; ctx.fillRect(x, y, s, s); } ctx.restore();
      } else if (atmo === 'sunset') {   // low sun + warm haze bands
        ctx.save(); const sun = ctx.createRadialGradient(STAGE_W * 0.5, STAGE_H * 0.72, 8, STAGE_W * 0.5, STAGE_H * 0.72, 200); sun.addColorStop(0, 'rgba(255,240,200,0.95)'); sun.addColorStop(0.5, 'rgba(255,180,120,0.5)'); sun.addColorStop(1, 'rgba(255,180,120,0)'); ctx.fillStyle = sun; ctx.beginPath(); ctx.arc(STAGE_W * 0.5, STAGE_H * 0.72, 200, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(120,60,90,0.18)'; for (let i = 0; i < 4; i++) { const cy = 70 + i * 50 + Math.sin(t * 0.02 + i) * 6; ctx.beginPath(); ctx.ellipse(((i * 360 + t * 0.3) % (STAGE_W + 280)) - 140, cy, 90, 14, 0, 0, Math.PI * 2); ctx.fill(); } ctx.restore();
      } else {   // night — moon glow + crescent + twinkling stars + drifting dust
        ctx.save(); const moonX = STAGE_W * 0.8, moonY = 110;
        const moon = ctx.createRadialGradient(moonX, moonY, 6, moonX, moonY, 135); moon.addColorStop(0, 'rgba(210,224,255,0.45)'); moon.addColorStop(0.5, 'rgba(170,190,255,0.12)'); moon.addColorStop(1, 'rgba(170,190,255,0)'); ctx.fillStyle = moon; ctx.fillRect(0, 0, STAGE_W, 330);
        for (let i = 0; i < 70; i++) { const x = (i * 149.3) % STAGE_W, y = (i * 83.7) % (STAGE_H * 0.55); ctx.globalAlpha = 0.2 + 0.55 * Math.abs(Math.sin(t * 0.03 + i * 1.3)); ctx.fillStyle = i % 9 ? '#fff' : '#bcd0ff'; const s = i % 13 === 0 ? 2 : 1; ctx.fillRect(x, y, s, s); }
        ctx.globalAlpha = 1; ctx.fillStyle = '#e7edff'; ctx.beginPath(); ctx.arc(moonX, moonY, 24, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#0b0912'; ctx.beginPath(); ctx.arc(moonX + 11, moonY - 3, 22, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff'; for (let i = 0; i < 22; i++) { const mx = (i * 197.3) % STAGE_W; const my = (i * 71 + t * (0.12 + (i % 4) * 0.05)) % 210; ctx.globalAlpha = 0.03 + (i % 5) * 0.012; ctx.fillRect(mx, 200 - my, 2, 2); } ctx.restore();
      }
      ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '900 58px Helvetica, Arial'; ctx.shadowColor = theme.accent; ctx.shadowBlur = 30; ctx.fillStyle = hexA(theme.accent, 0.92); ctx.fillText(theme.name.toUpperCase(), STAGE_W / 2, 70); ctx.shadowBlur = 0; ctx.font = '700 12px monospace'; ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fillText(theme.owner ? '· PERSONAL ROOM ·' : theme.locked ? '· CURATED ·' : '· S U A V ·', STAGE_W / 2, 102); ctx.restore();

      // camera: scale + position the whole room so its footprint fits the stage (bigger rooms zoom out)
      const cam = camRef.current; ctx.save(); ctx.translate(cam.x, cam.y); ctx.scale(cam.s, cam.s);

      // floor + walls follow the room PLAN: skip void tiles, raise each to its base level, draw side
      // risers (floor thickness) toward lower/void neighbours, and back walls only behind the footprint.
      const plan = planRef.current; const wh = WALL_H * STACK_H; const veranda = !!theme.day && !!theme.veranda;
      const lvl = (gx: number, gy: number) => (gx < 0 || gy < 0 || gx >= GRID || gy >= GRID ? -1 : plan[gy * GRID + gx]);
      // A veranda bay: an open balcony onto a sky/sea view — clipped sky, a clean white balustrade,
      // a top beam, and a slim stone column at the near corner (adjacent bays line up into a colonnade).
      const verandaBay = (ax: number, ay: number, bx: number, by: number) => {
        const a1y = ay - wh, b1y = by - wh;
        ctx.save(); ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.lineTo(bx, b1y); ctx.lineTo(ax, a1y); ctx.closePath(); ctx.clip();
        const yTop = Math.min(a1y, b1y), yBot = Math.max(ay, by), sky = ctx.createLinearGradient(0, yTop, 0, yBot);
        sky.addColorStop(0, '#86c8f7'); sky.addColorStop(0.52, '#cdeaff'); sky.addColorStop(0.58, '#eef7ff'); sky.addColorStop(0.63, '#7fb8df'); sky.addColorStop(1, '#3f7fb0');   // sky → horizon → sea
        ctx.fillStyle = sky; ctx.fillRect(Math.min(ax, bx) - 4, yTop - 2, Math.abs(bx - ax) + 8, wh + 6);
        const sunX = ax + (bx - ax) * 0.5, sunY = yTop + wh * 0.42, sg = ctx.createRadialGradient(sunX, sunY, 1, sunX, sunY, 20); sg.addColorStop(0, 'rgba(255,250,224,0.95)'); sg.addColorStop(1, 'rgba(255,250,224,0)'); ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(sunX, sunY, 20, 0, Math.PI * 2); ctx.fill();
        // balustrade: bottom rail, balusters, top rail (white stone)
        const railH = wh * 0.32;
        ctx.strokeStyle = '#eef0e8'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(ax, ay - railH); ctx.lineTo(bx, by - railH); ctx.stroke();
        ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(ax, ay - 2); ctx.lineTo(bx, by - 2); ctx.stroke();
        ctx.strokeStyle = '#dcd8cb'; ctx.lineWidth = 2; for (let i = 1; i < 6; i++) { const f = i / 6, px = ax + (bx - ax) * f, py = ay + (by - ay) * f; ctx.beginPath(); ctx.moveTo(px, py - 2); ctx.lineTo(px, py - railH); ctx.stroke(); }
        // top beam (lintel)
        ctx.strokeStyle = shade('#cfcabb', 1.1); ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(ax, a1y + 3); ctx.lineTo(bx, b1y + 3); ctx.stroke();
        ctx.restore();
        // slim stone column at the near (shared) corner
        const cg = ctx.createLinearGradient(ax - 4, 0, ax + 4, 0); cg.addColorStop(0, shade('#cfcabb', 0.7)); cg.addColorStop(0.5, shade('#eceadf', 1.0)); cg.addColorStop(1, shade('#cfcabb', 0.7));
        ctx.fillStyle = cg; ctx.fillRect(ax - 3.5, a1y, 7, ay - a1y);
        ctx.fillStyle = shade('#cfcabb', 1.05); ctx.fillRect(ax - 5, a1y - 2, 10, 4); ctx.fillRect(ax - 5, ay - 4, 10, 4);
      };
      for (let gx = 0; gx < GRID; gx++) for (let gy = 0; gy < GRID; gy++) {
        const L = lvl(gx, gy); if (L < 0) continue;
        const b = iso(gx, gy, L);
        const top = b.sy - TH, rX = b.sx + TW, lX = b.sx - TW, botY = b.sy + TH;
        // back walls behind edges whose neighbour is absent (up-right = gy-1, up-left = gx-1)
        if (lvl(gx, gy - 1) < 0) { if (veranda) verandaBay(b.sx, top, rX, b.sy); else { ctx.fillStyle = shade(theme.floor, 1.5); ctx.beginPath(); ctx.moveTo(b.sx, top); ctx.lineTo(rX, b.sy); ctx.lineTo(rX, b.sy - wh); ctx.lineTo(b.sx, top - wh); ctx.closePath(); ctx.fill(); } }
        if (lvl(gx - 1, gy) < 0) { if (veranda) verandaBay(b.sx, top, lX, b.sy); else { ctx.fillStyle = shade(theme.floor, 1.0); ctx.beginPath(); ctx.moveTo(b.sx, top); ctx.lineTo(lX, b.sy); ctx.lineTo(lX, b.sy - wh); ctx.lineTo(b.sx, top - wh); ctx.closePath(); ctx.fill(); } }
        // side risers toward lower front neighbours (down-right = gx+1, down-left = gy+1); void drops to 0
        const rn = lvl(gx + 1, gy), dr = (L - (rn < 0 ? 0 : rn)) * STACK_H;
        if (rn < L && dr > 0) { ctx.fillStyle = shade(theme.floor, 0.6); ctx.beginPath(); ctx.moveTo(b.sx, botY); ctx.lineTo(rX, b.sy); ctx.lineTo(rX, b.sy + dr); ctx.lineTo(b.sx, botY + dr); ctx.closePath(); ctx.fill(); }
        const ln = lvl(gx, gy + 1), dl = (L - (ln < 0 ? 0 : ln)) * STACK_H;
        if (ln < L && dl > 0) { ctx.fillStyle = shade(theme.floor, 0.42); ctx.beginPath(); ctx.moveTo(b.sx, botY); ctx.lineTo(lX, b.sy); ctx.lineTo(lX, b.sy + dl); ctx.lineTo(b.sx, botY + dl); ctx.closePath(); ctx.fill(); }
        // top face — pool (sunken water + marble coping), material floor, or plain room floor
        if (waterRef.current[gy * GRID + gx] === 1) {
          const wAt = (x: number, y: number) => x >= 0 && y >= 0 && x < GRID && y < GRID && waterRef.current[y * GRID + x] === 1;
          const topY = b.sy - TH, botY = b.sy + TH, rX = b.sx + TW, lX = b.sx - TW, dp = 6;
          // far interior basin walls (back edges that border non-water) → reads as a recessed pool
          const wall = (ax: number, ay: number, bx: number, by: number, c: string) => { ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.lineTo(bx, by + dp); ctx.lineTo(ax, ay + dp); ctx.closePath(); ctx.fill(); };
          if (!wAt(gx, gy - 1)) wall(b.sx, topY, rX, b.sy, '#d3d8e0');
          if (!wAt(gx - 1, gy)) wall(b.sx, topY, lX, b.sy, '#c2c8d2');
          diamond(b.sx, b.sy + dp, TW * 0.99, TH * 0.99); ctx.fillStyle = '#0c5e78'; ctx.fill();        // recessed water body
          const ph = Math.sin((gx * 0.7 + gy * 0.5) + t * 0.05) * 0.5 + 0.5;
          ctx.fillStyle = hexA('#7fdcff', 0.12 + ph * 0.16); diamond(b.sx, b.sy + dp, TW * 0.99, TH * 0.99); ctx.fill();
          ctx.save(); ctx.globalAlpha = 0.22 + 0.13 * Math.sin(t * 0.08 + gx); ctx.strokeStyle = '#cdf3ff'; ctx.lineWidth = 1; diamond(b.sx, b.sy + dp, TW * 0.58, TH * 0.58); ctx.stroke(); ctx.restore();
          // marble coping cap (raised lip) on every edge that borders non-water
          const cap = (ax: number, ay: number, bx: number, by: number) => { ctx.fillStyle = '#e9ecf2'; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.lineTo(bx, by - 3); ctx.lineTo(ax, ay - 3); ctx.closePath(); ctx.fill(); };
          if (!wAt(gx, gy - 1)) cap(b.sx, topY, rX, b.sy);
          if (!wAt(gx - 1, gy)) cap(b.sx, topY, lX, b.sy);
          if (!wAt(gx + 1, gy)) cap(b.sx, botY, rX, b.sy);
          if (!wAt(gx, gy + 1)) cap(b.sx, botY, lX, b.sy);
        } else {
          const mk = gy * GRID + gx; const mat = matOverrideRef.current.has(mk) ? matOverrideRef.current.get(mk)! : matRef.current[mk]; const odd = (gx + gy) % 2 === 1;
          diamond(b.sx, b.sy, TW, TH);
          if (mat === 1) { ctx.fillStyle = odd ? '#e9e4d8' : '#bdb6a6'; ctx.fill(); }                     // marble checker
          else if (mat === 2) { ctx.fillStyle = odd ? '#3f9d49' : '#358540'; ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fill(); }   // grass
          else if (mat === 3) { ctx.fillStyle = '#9c1f29'; ctx.fill(); ctx.fillStyle = odd ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.12)'; ctx.fill(); }   // carpet
          else if (mat === 4) { ctx.fillStyle = odd ? '#33333f' : '#1d1d27'; ctx.fill(); }                 // dark check
          else if (mat === 5) { const hue = (t * 2.4 + (gx * 41 + gy * 67)) % 360, lum = 44 + Math.sin(t * 0.13 + (gx + gy)) * 16; ctx.fillStyle = `hsl(${hue},88%,${lum}%)`; ctx.fill(); ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = `hsla(${(hue + 40) % 360},90%,70%,0.18)`; diamond(b.sx, b.sy, TW * 0.6, TH * 0.6); ctx.fill(); ctx.restore(); }   // animated dancefloor
          else if (mat === 6) {   // water — animated ripples
            const ph = Math.sin((gx * 0.7 + gy * 0.5) + t * 0.06) * 0.5 + 0.5; ctx.fillStyle = '#0c5e78'; ctx.fill();
            ctx.fillStyle = hexA('#7fdcff', 0.14 + ph * 0.18); ctx.fill();
            ctx.save(); ctx.globalAlpha = 0.22 + 0.13 * Math.sin(t * 0.09 + gx + gy); ctx.strokeStyle = '#cdf3ff'; ctx.lineWidth = 1; diamond(b.sx, b.sy, TW * 0.58, TH * 0.58); ctx.stroke(); ctx.restore();
          }
          else if (mat === 7) {   // bubbling lava — molten crust + glowing cracks + rising bubbles
            const pulse = 0.5 + 0.5 * Math.sin(t * 0.08 + (gx * 1.3 + gy)); ctx.fillStyle = `hsl(${14 + pulse * 10}, 90%, ${24 + pulse * 14}%)`; ctx.fill();
            ctx.save(); ctx.globalCompositeOperation = 'lighter';
            ctx.strokeStyle = `hsla(28, 100%, 60%, ${0.25 + pulse * 0.4})`; ctx.lineWidth = 1.5; diamond(b.sx, b.sy, TW * 0.8, TH * 0.8); ctx.stroke();   // glowing crack
            for (let q = 0; q < 2; q++) { const bp = ((t * (0.9 + q * 0.5) + (gx * 53 + gy * 31) + q * 40) % 60) / 60; const by = b.sy + TH * 0.5 - bp * TH; const r = (1 - Math.abs(bp - 0.5) * 2) * 3.4; if (r > 0.3) { ctx.fillStyle = `hsla(${36 + q * 10},100%,${60 + bp * 20}%,${0.7 * (1 - bp)})`; ctx.beginPath(); ctx.arc(b.sx + (q ? 7 : -6), by, r, 0, Math.PI * 2); ctx.fill(); } }   // bubbles
            ctx.restore();
          }
          else if (mat === 8) { ctx.fillStyle = odd ? '#e6d2a0' : '#dcc88c'; ctx.fill(); ctx.fillStyle = 'rgba(120,90,40,0.18)'; for (let q = 0; q < 4; q++) ctx.fillRect(b.sx + (q - 2) * 7 + ((gx * 7 + gy) % 5), b.sy + ((q % 2) - 0.5) * 8, 1.5, 1.5); }   // sand
          else if (mat === 9) { ctx.fillStyle = odd ? '#eef4fb' : '#dde8f5'; ctx.fill(); ctx.save(); ctx.globalAlpha = 0.4 + 0.4 * Math.abs(Math.sin(t * 0.06 + gx + gy)); ctx.fillStyle = '#fff'; ctx.fillRect(b.sx - 2, b.sy - 1, 2, 2); ctx.restore(); }   // snow / ice sparkle
          else if (mat === 10) { ctx.fillStyle = odd ? '#8a5a32' : '#7a4e2a'; ctx.fill(); ctx.strokeStyle = 'rgba(40,24,10,0.4)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(b.sx - TW * 0.7, b.sy + TH * 0.2); ctx.lineTo(b.sx + TW * 0.3, b.sy - TH * 0.3); ctx.stroke(); }   // wood planks
          else if (mat === 11) { ctx.fillStyle = '#0a0a16'; ctx.fill(); ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = hexA(theme.accent, 0.5 + 0.3 * Math.sin(t * 0.1 + gx + gy)); ctx.lineWidth = 1.5; diamond(b.sx, b.sy, TW * 0.92, TH * 0.92); ctx.stroke(); ctx.restore(); }   // neon grid
          else if (mat === 12) {   // void — abyss with drifting stars (the slow hazard)
            ctx.fillStyle = '#04040a'; ctx.fill();
            ctx.save(); ctx.globalCompositeOperation = 'lighter';
            for (let q = 0; q < 3; q++) { const sxv = b.sx + ((gx * 13 + gy * 7 + q * 29) % 40) - 20, syv = b.sy + ((gy * 11 + q * 17 + (t >> 4)) % 24) - 12; ctx.globalAlpha = 0.3 + 0.5 * Math.abs(Math.sin(t * 0.05 + gx + q)); ctx.fillStyle = q ? '#8a9cff' : '#fff'; ctx.fillRect(sxv, syv, 1.5, 1.5); }
            ctx.restore();
          }
          else { ctx.fillStyle = theme.floor; ctx.fill(); ctx.fillStyle = odd ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.22)'; ctx.fill(); }
          if (mat === 3) { ctx.strokeStyle = hexA('#e8c66a', 0.5); ctx.lineWidth = 1; diamond(b.sx, b.sy, TW * 0.84, TH * 0.84); ctx.stroke(); }   // carpet gold trim
          else if (mat === 2) { ctx.save(); ctx.globalAlpha = 0.5; ctx.strokeStyle = '#2c6e34'; for (let q = 0; q < 5; q++) { const gxp = b.sx + (q - 2) * 6, gyp = b.sy + ((q % 2) - 0.5) * 6; ctx.beginPath(); ctx.moveTo(gxp, gyp + 3); ctx.lineTo(gxp, gyp - 4); ctx.stroke(); } ctx.restore(); }   // grass blades
          ctx.strokeStyle = hexA(mat === 1 ? '#8a8475' : theme.accent, mat ? 0.16 : 0.10); ctx.lineWidth = 1; diamond(b.sx, b.sy, TW, TH); ctx.stroke();
        }
      }
      // stage light show — volumetric beams from the rig + animated spotlights on the dancefloor (Clube)
      if (theme.slug === 'clube') {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 4; i++) { const ph = t * 0.018 + i * 1.6; const apex = iso(11 + (i % 2) * 10, 6, 3.4); const foot = iso(13 + Math.sin(ph) * 4 + i * 1.5, 11 + Math.cos(ph * 0.8) * 1.2, 0); const hue = (t * 2 + i * 80) % 360; ctx.fillStyle = `hsla(${hue},90%,62%,0.09)`; ctx.beginPath(); ctx.moveTo(apex.sx - 3, apex.sy); ctx.lineTo(foot.sx - 28, foot.sy); ctx.lineTo(foot.sx + 28, foot.sy); ctx.lineTo(apex.sx + 3, apex.sy); ctx.closePath(); ctx.fill(); }   // beams
        for (let i = 0; i < 5; i++) { const ph = t * 0.022 + i * 1.4; const sgx = 16 + Math.sin(ph) * (3 + i * 0.9), sgy = 10.5 + Math.cos(ph * 0.7) * 1.6; const p = iso(sgx, sgy, 0); const hue = (t * 2 + i * 72) % 360; const rg = ctx.createRadialGradient(p.sx, p.sy, 2, p.sx, p.sy, 50); rg.addColorStop(0, `hsla(${hue},92%,62%,0.5)`); rg.addColorStop(1, `hsla(${hue},92%,62%,0)`); ctx.fillStyle = rg; ctx.beginPath(); ctx.ellipse(p.sx, p.sy, 50, 26, 0, 0, Math.PI * 2); ctx.fill(); }   // floor pools
        ctx.restore();
      }
      const hv = hoverRef.current, ui = uiRef.current;
      if (ui.decorOpen && ui.placingPrefab && placingPrefabRef.current && hv && lvl(hv.gx, hv.gy) >= 0) {
        const pf = placingPrefabRef.current;   // footprint preview (centered on the cursor) — green where it lands, red where it won't fit
        const ox = hv.gx - ((pf.w - 1) >> 1), oy = hv.gy - ((pf.d - 1) >> 1);
        for (let x = 0; x < pf.w; x++) for (let y = 0; y < pf.d; y++) {
          const gx = ox + x, gy = oy + y, inb = gx >= 0 && gy >= 0 && gx < GRID && gy < GRID, L = inb ? lvl(gx, gy) : -1, fits = inb && L >= 0;
          const { sx, sy } = iso(gx, gy, Math.max(0, L)); const col = fits ? theme.accent : '#ff4e3e';
          diamond(sx, sy, TW, TH); ctx.fillStyle = hexA(col, 0.28); ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 1.5; diamond(sx, sy, TW, TH); ctx.stroke();
        }
      } else if (ui.decorOpen && (ui.placingKind || ui.removeMode || ui.rotateMode || ui.tileMode) && hv && lvl(hv.gx, hv.gy) >= 0) { const { sx, sy } = iso(hv.gx, hv.gy, lvl(hv.gx, hv.gy)); diamond(sx, sy, TW, TH); ctx.fillStyle = hexA(ui.removeMode ? '#ff4e3e' : theme.accent, 0.3); ctx.fill(); ctx.strokeStyle = ui.removeMode ? '#ff4e3e' : theme.accent; ctx.lineWidth = 2; ctx.stroke(); }
      // Lore tile markers — invisible to players; a small glyph only while an admin is decorating.
      if (ui.decorOpen) for (const lm of loreRef.current) { if (lm.mode !== 'tile') continue; const L = Math.max(0, planLvl(lm.gx, lm.gy)); const { sx, sy } = iso(lm.gx, lm.gy, L); const pulse = 0.3 + 0.2 * Math.sin(framesRef.current * 0.08); ctx.save(); ctx.globalAlpha = pulse; ctx.strokeStyle = '#00cfff'; ctx.setLineDash([3, 3]); ctx.lineWidth = 1.5; diamond(sx, sy, TW * 0.6, TH * 0.6); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 0.9; ctx.fillStyle = '#00cfff'; ctx.font = '700 12px Helvetica, Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('✎', sx, sy - 1); ctx.restore(); }

      // support posts under a floating deck (so it reads as a bridge)
      const drawSupports = (it: Item, z: number, sw: number, sh: number) => {
        ctx.fillStyle = 'rgba(18,18,26,0.55)';
        for (let du = 0; du < sw; du++) for (let dv = 0; dv < sh; dv++) { const { sx, sy } = iso(it.gx + du, it.gy + dv, 0); ctx.fillRect(sx - 2.5, sy - z * STACK_H, 5, z * STACK_H); }
      };
      // depth-sorted furni + avatars (sorted by tile + surface level so layers occlude correctly)
      const ents: Array<{ s: number; draw: () => void }> = [];
      const allItems = decorRef.current.length ? itemsRef.current.concat(decorRef.current) : itemsRef.current;
      for (const it of allItems) { const dd = defOf(it.kind); const [sw, sh] = effSpan(it.kind, it.dir || 0); const ii = it, lift = it.elev || 0, zb = Math.max(0, planLvl(it.gx, it.gy)), z = zb + lift; const surfZ = z + (dd.h || 0); ents.push({ s: (it.gx + sw - 1) + (it.gy + sh - 1) + surfZ * 0.02, draw: () => {
        const { sx, sy } = iso(ii.gx, ii.gy, z);
        // disguised triggers — invisible to players, but ADMINS always see a soft glow (stronger while
        // decorating) so they can find/manage them. Portals glow purple; game events glow arcade-yellow.
        // A set-game event has no visible body at all (it only retargets machines), so it's always glow-only.
        if (ii.portalHidden || ii.gameHidden || ii.gameSet) {
          if (uiRef.current.decorOpen || modRef.current) {
            const col = ii.portalHidden ? '#cc66ff' : '#ffd23a';
            const pulse = 0.3 + 0.2 * Math.sin(framesRef.current * 0.08); ctx.save();
            const g = ctx.createRadialGradient(sx, sy, 1, sx, sy, TW * 0.85); g.addColorStop(0, hexA(col, 0.14 + 0.28 * pulse)); g.addColorStop(1, hexA(col, 0));
            ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(sx, sy, TW * 0.85, TH * 0.85, 0, 0, Math.PI * 2); ctx.fill();
            ctx.globalAlpha = uiRef.current.decorOpen ? 0.7 : 0.45; ctx.strokeStyle = col; ctx.setLineDash([4, 4]); ctx.lineWidth = 1.5; diamond(sx, sy, TW * 0.7, TH * 0.7); ctx.stroke(); ctx.restore();
          }
          return;
        }
        if (lift > 0 && dd.walk && dd.cat !== 'constr') drawSupports(ii, z, sw, sh);
        drawFurniSprite(ctx, ii.kind, sx, sy, theme.accent, framesRef.current, ii.dir || 0);
      } }); }
      // an avatar sitting on a (possibly multi-tile) seat must sort ABOVE it — multi-tile sprites
      // sort by their front corner, so add a boost when standing on a seat's footprint.
      const seatBoost = (fx: number, fy: number) => { const cx = clampTile(fx), cy = clampTile(fy); for (const it of allItems) { if (sitHeight(it.kind) == null) continue; const [sw, sh] = effSpan(it.kind, it.dir || 0); if (cx >= it.gx && cx < it.gx + sw && cy >= it.gy && cy < it.gy + sh) return 1.2; } return 0; };
      for (const n of npcsRef.current) { const nn = n; ents.push({ s: nn.fx + nn.fy + nn.z * 0.02 + 0.005 + seatBoost(nn.fx, nn.fy), draw: () => drawAvatarBody(nn, false) }); }
      ents.push({ s: selfRef.current.fx + selfRef.current.fy + selfRef.current.z * 0.02 + 0.01 + seatBoost(selfRef.current.fx, selfRef.current.fy), draw: () => drawAvatarBody(selfRef.current, true) });
      for (const r of remotesRef.current.values()) { const rr = r; ents.push({ s: rr.fx + rr.fy + rr.z * 0.02 + 0.01 + seatBoost(rr.fx, rr.fy), draw: () => drawAvatarBody(rr, false) }); }
      ents.sort((a, b) => a.s - b.s); for (const e of ents) e.draw();
      // Selected-object highlight — drawn AFTER the pieces (so it isn't hidden behind a tall one): a pulsing
      // ring around the footprint + a bobbing chevron above, marking the piece the edit popup is acting on.
      if (uiRef.current.decorOpen && editSelRef.current) {
        const it = itemsRef.current.find(i => i.id === editSelRef.current!.id);
        if (it) {
          const [sw, sh] = effSpan(it.kind, it.dir || 0), pulse = 0.45 + 0.3 * Math.sin(framesRef.current * 0.12);
          for (let du = 0; du < sw; du++) for (let dv = 0; dv < sh; dv++) { const { sx, sy } = iso(it.gx + du, it.gy + dv, Math.max(0, planLvl(it.gx + du, it.gy + dv)) + (it.elev || 0)); diamond(sx, sy, TW, TH); ctx.fillStyle = hexA('#ffe65c', 0.16); ctx.fill(); ctx.strokeStyle = hexA('#ffe65c', pulse); ctx.lineWidth = 2.5; diamond(sx, sy, TW, TH); ctx.stroke(); }
          const dd = defOf(it.kind), topZ = Math.max(0, planLvl(it.gx, it.gy)) + (it.elev || 0) + (dd.h || 0) + 0.6;
          const c = iso(it.gx + (sw - 1) / 2, it.gy + (sh - 1) / 2, topZ), bob = Math.sin(framesRef.current * 0.12) * 2.5;
          ctx.fillStyle = '#ffe65c'; ctx.beginPath(); ctx.moveTo(c.sx - 6, c.sy - 10 + bob); ctx.lineTo(c.sx + 6, c.sy - 10 + bob); ctx.lineTo(c.sx, c.sy - 2 + bob); ctx.closePath(); ctx.fill();
        }
      }
      ctx.restore();

      const vig = ctx.createRadialGradient(STAGE_W / 2, STAGE_H * 0.54, STAGE_H * 0.34, STAGE_W / 2, STAGE_H * 0.54, STAGE_H * 0.85);
      vig.addColorStop(0, 'rgba(0,0,0,0)'); vig.addColorStop(1, day ? 'rgba(20,40,30,0.22)' : 'rgba(0,0,0,0.5)'); ctx.fillStyle = vig; ctx.fillRect(0, 0, STAGE_W, STAGE_H);

      // Names + chat bubbles render DEAD LAST — over furniture, other avatars, AND the vignette — so a
      // character's name is never occluded by anything. Re-apply the room camera for this pass only.
      ctx.save(); ctx.translate(cam.x, cam.y); ctx.scale(cam.s, cam.s);
      for (const n of npcsRef.current) drawAvatarLabel(n, false);
      for (const r of remotesRef.current.values()) drawAvatarLabel(r, false);
      drawAvatarLabel(selfRef.current, true);   // your own name on top of the pile
      ctx.restore();
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
    // Hidden easter egg — the wall at the top-centre of the Terminal room pays out, once.
    if (room === 't_terminal' && gx === 5 && gy === 1 && !eggClaimed) {
      setEggClaimed(true); addBalance(EASTER_EGG_REWARD); musicRef.current?.chime();
      flashHint(`The wall gives. ${CURRENCY_SYMBOL}+${EASTER_EGG_REWARD} ✦`);
      return;
    }
    if (placeLore) { placeTileLoreAt(gx, gy); return; }
    if (placeNpc) { placeNpcAt(gx, gy); return; }
    if (tileMode) { paintTile(gx, gy); startPaintDrag(e, null); return; }                                 // admin floor-paint (drag to sweep)
    if (placingPrefab) { placePrefab(placingPrefab, gx, gy); return; }
    if (placingKind) { placeItem(placingKind, gx, gy); if (isFloorPaint(placingKind)) startPaintDrag(e, placingKind); return; }   // carpet/floor → drag to lay a swathe
    if (removeMode) { removeAt(gx, gy); return; }
    if (rotateMode) { rotateAt(gx, gy); return; }
    // Decorating with no tool armed: press an object to SELECT it + arm a move-drag (drag to reposition,
    // release to drop; a plain tap just selects → rotate/pick-up popup). Tap empty floor to deselect + walk.
    if (decorOpen && !portalMaker) {
      const hit = topItemAt(gx, gy);
      if (hit) {
        setEditSel({ id: hit.id, kind: hit.kind });
        moveDragRef.current = { id: hit.id, moved: false };
        try { (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); } catch { /* ignore */ }
        return;
      }
      if (editSelRef.current) { setEditSel(null); return; }
    }
    // Portals aren't tapped — you WALK onto them (see the movement loop). Tapping a portal tile just paths you there.
    const me = selfRef.current;
    // Tapping a retrocab or pacman cabinet routes the player to the tile directly in front of it.
    const cab = [...itemsRef.current, ...decorRef.current].find(it => (it.kind === 'retrocab' || it.kind === 'pacman') && it.gx === gx && it.gy === gy);
    if (cab) {
      const [dx, dy] = ([[0, 1], [-1, 0], [0, -1], [1, 0]] as [number, number][])[((cab.dir ?? 0) % 4 + 4) % 4];
      const tx = gx + dx, ty = gy + dy;
      if (planLvl(tx, ty) >= 0) { const fp = findPath(clampTile(me.fx), clampTile(me.fy), me.lvl, tx, ty); if (fp && fp.length) { me.path = fp; return; } }
    }
    const p = findPath(clampTile(me.fx), clampTile(me.fy), me.lvl, gx, gy); if (p && p.length) me.path = p;
  };
  // ── Click-drag floor/carpet painting ──
  const isFloorPaint = (kind: string): boolean => { const d = defOf(kind); const [sw, sh] = d.span ?? [1, 1]; return !!d.walk && (d.h ?? 0) <= 1 && sw === 1 && sh === 1 && d.special !== 'stair'; };
  const startPaintDrag = (e: React.PointerEvent, kind: string | null) => {
    const { gx, gy } = evtTile(e); paintDragRef.current = { on: true, kind, tile: key(gx, gy) };
    try { (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); } catch { /* ignore */ }
  };
  const endPaintDrag = (e: React.PointerEvent) => {
    const md = moveDragRef.current;
    if (md.id) {
      const it = itemsRef.current.find(i => i.id === md.id);
      if (it && md.moved) {   // dropped somewhere new → broadcast + persist the new position
        channelRef.current?.send({ type: 'broadcast', event: 'move', payload: { id: it.id, gx: it.gx, gy: it.gy } });
        supabase?.from('room_items').update({ x: it.gx, y: it.gy }).eq('id', it.id).then(undefined, () => {});
        setEditSel(s => (s && s.id === it.id ? { ...s } : s));   // re-anchor the popup to the new spot
      }
      moveDragRef.current = { id: null, moved: false };
    }
    paintDragRef.current = { on: false, kind: null, tile: -1 };
    try { (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId); } catch { /* ignore */ }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!decorOpen) { hoverRef.current = null; return; }
    const { gx, gy } = evtTile(e); const off = planLvl(gx, gy) < 0; hoverRef.current = off ? null : { gx, gy };
    const md = moveDragRef.current;
    if (md.id) {   // dragging a selected object → it follows the cursor (only onto valid floor its footprint fits)
      if (!off) { const it = itemsRef.current.find(i => i.id === md.id);
        if (it && (it.gx !== gx || it.gy !== gy)) {
          const [sw, sh] = effSpan(it.kind, it.dir || 0); let fits = gx >= 0 && gy >= 0 && gx + sw <= GRID && gy + sh <= GRID;
          for (let du = 0; du < sw && fits; du++) for (let dv = 0; dv < sh && fits; dv++) if (planLvl(gx + du, gy + dv) < 0) fits = false;
          if (fits) { it.gx = gx; it.gy = gy; md.moved = true; rebuildHeight(); }
        }
      }
      return;
    }
    const dr = paintDragRef.current;
    if (dr.on && !off) { const k = key(gx, gy); if (k !== dr.tile) { dr.tile = k;
      if (dr.kind === null) paintTile(gx, gy);
      else if (modRef.current || isFurniFree(dr.kind) || furniCount(dr.kind) > 0) placeItem(dr.kind, gx, gy);   // skip silently when out of stock (no hint spam)
    } }
  };

  // ── Tutorial render state ── which Oracle speech to show, and the residual steer once it's dismissed.
  const tutKey = onboarding === 'arcade' ? (gamePlayed ? 'arcade_post' : 'arcade_pre') : onboarding;
  const tutScript: TutScript | undefined = TUT_SCRIPT[tutKey];
  const showTutCard = !!tutScript && onboarding !== 'character' && !tutCardDone;   // covers tut rooms + the Town tour ('done' has no script)
  const tutLastLine = tutScript ? tutLine >= tutScript.lines.length - 1 : true;
  const tutSteer: string = (isTutRoom(room) && !showTutCard) ? (({
    oracle: '🚪 walk to the door and speak the code',
    arcade: gamePlayed ? '🚪 a door has opened — walk through' : '🕹 walk close to the machine to play',
    terminal: '🖥 step up to the terminal',
    character: charDone ? '🚪 the door is open — step through' : '',
    yourroom: '🚪 step through the door to Town',
  }) as Record<string, string>)[onboarding] ?? '' : '';
  // Character-creator account prompt (Discord / guest) — shown in the Terminal room after the boot.
  const showAcct = onboarding === 'character' && !signedIn && !guestChosen;

  return (
    <div ref={outerRef} className="relative w-full h-full select-none overflow-hidden bg-black" style={{ touchAction: 'none', WebkitUserSelect: 'none', userSelect: 'none' }}>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="relative shrink-0 origin-center" style={{ width: STAGE_W, height: STAGE_H, transform: `scale(${fitScale})` }}>
          <canvas ref={canvasRef} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endPaintDrag} onPointerCancel={endPaintDrag} className="absolute inset-0 block w-full h-full" />
          {/* Selected-object editor — a little popup over the piece with rotate + pick-up (drop, then edit right there). */}
          {decorOpen && editSel && !placingKind && !placingPrefab && !removeMode && !rotateMode && !tileMode && !buildMode && !atmoMode && !placeLore && !portalMaker && (() => {
            const it = itemsRef.current.find(i => i.id === editSel.id);
            if (!it) return null;
            const cam = camRef.current, d = defOf(it.kind), [sw, sh] = effSpan(it.kind, it.dir || 0);
            const cz = Math.max(0, planLvl(it.gx, it.gy)) + (it.elev || 0) + (d.h || 0);
            const a = iso(it.gx + (sw - 1) / 2, it.gy + (sh - 1) / 2, cz);
            const px = cam.x + a.sx * cam.s, py = cam.y + a.sy * cam.s;
            return (
              <div className="absolute z-30 flex items-center gap-1 -translate-x-1/2 -translate-y-full bg-black/85 border border-white/20 rounded-lg px-1.5 py-1 shadow-2xl" style={{ left: px, top: py - 8 }}>
                <span className="text-[10px] text-white/55 px-1 max-w-[6rem] truncate">{d.name}</span>
                {isRotatable(it.kind) && <button onClick={() => rotateItem(it)} title="Rotate" className="w-8 h-8 flex items-center justify-center rounded-md bg-white/5 hover:bg-[#00cfff]/25 text-[#9fe3ff] text-lg leading-none">⟳</button>}
                <button onClick={() => dropItem(it)} title="Pick up" className="w-8 h-8 flex items-center justify-center rounded-md bg-white/5 hover:bg-brandRed/30 text-base leading-none">🗑</button>
                <button onClick={() => setEditSel(null)} title="Done" className="w-6 h-8 flex items-center justify-center rounded-md text-white/40 hover:text-white text-xs leading-none">✕</button>
              </div>
            );
          })()}
        </div>
      </div>

      <div className="absolute top-3 left-4 z-40 pointer-events-none">
        <p className="font-helvetica font-black text-xl text-white leading-none uppercase">{roomMeta.name}</p>
        <p className="text-[11px] uppercase tracking-[0.2em] text-white/45 mt-1">{isTutRoom(room) ? '· tutorial ·' : supabaseReady ? (connected ? `${population} ${population === 1 ? 'person' : 'people'}` : 'connecting…') : 'offline'}</p>
      </div>

      {/* Town money jar — real money spent on the game, all-time. Not explained; it just sits there. */}
      {room === 'town' && (
        <div className="absolute top-[112px] left-1/2 -translate-x-1/2 z-30 pointer-events-none">
          <span className="font-mono font-bold text-brandYellow text-lg tracking-[0.25em] bg-black/45 border border-brandYellow/30 px-3 py-1" style={{ textShadow: '0 0 12px rgba(255,210,60,0.55)' }}>
            ${jarTotal.toLocaleString('en-US')}
          </span>
        </div>
      )}

      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-40 flex gap-2">
        {!tutorial && (
          <div className="relative">
            <button onClick={openMenu} title="Menu — account, leaderboard, about" className={`text-[11px] font-mono uppercase tracking-widest border px-3 py-1.5 transition-all ${!menuSeen && !signedIn ? 'text-black bg-brandYellow border-brandYellow animate-pulse' : 'text-white border-white/25 bg-black/50 hover:bg-white hover:text-black'}`}>☰ Menu</button>
            {!menuSeen && !signedIn && (
              <button onClick={openMenu} className="absolute top-full mt-2 left-1/2 -translate-x-1/2 w-max max-w-[70vw] border border-brandYellow/50 bg-black/90 px-3 py-2 text-left active:scale-95">
                <span className="block text-[11px] font-bold text-brandYellow">Create an account to save your progress →</span>
                <span className="block text-[10px] text-white/55 leading-snug">crystals, scores, skins & your room — tap here</span>
              </button>
            )}
          </div>
        )}
        {!tutorial && <button onClick={() => setShowRooms(s => !s)} className="text-[11px] font-mono uppercase tracking-widest text-white border border-white/25 bg-black/50 px-3 py-1.5 hover:bg-white hover:text-black transition-all">⤧ Rooms</button>}
        {!tutorial && <button onClick={() => setInvOpen(true)} className="text-[11px] font-mono uppercase tracking-widest text-white border border-white/25 bg-black/50 px-3 py-1.5 hover:bg-white hover:text-black transition-all">☻ <span className="text-brandYellow">{CURRENCY_SYMBOL}{wallet.balance.toLocaleString('pt-PT')}</span></button>}
        <button onClick={() => setOracleOpen(true)} title="The Oracle — lore & questions" className="text-[11px] font-mono uppercase tracking-widest text-[#00cfff] border border-[#00cfff]/40 bg-black/50 px-3 py-1.5 hover:bg-[#00cfff] hover:text-black transition-all">❖ Oracle</button>
        {!tutorial && isSuper && <button onClick={() => setAdminOpen(true)} title="Admin panel" className="text-[11px] font-mono uppercase tracking-widest text-brandYellow border border-brandYellow/40 bg-black/50 px-3 py-1.5 hover:bg-brandYellow hover:text-black transition-all">📊</button>}
        {!tutorial && !locked && <button onClick={() => { if (!decorOpen && !requireAccount()) return; setDecorOpen(o => !o); setDecorMin(false); setPlacingKind(null); setRemoveMode(false); }} className={`text-[11px] font-mono uppercase tracking-widest border px-3 py-1.5 transition-all ${decorOpen ? 'bg-brandYellow text-black border-brandYellow' : 'text-white border-white/25 bg-black/50 hover:bg-white hover:text-black'}`}>✦ Decorate</button>}
      </div>

      {/* ── TUTORIAL · the Oracle speaks ── on-screen guidance per room (lore + the steer). */}
      {showTutCard && tutScript && (
        <div className="absolute inset-x-0 z-[60] flex justify-center px-4 pointer-events-none" style={{ bottom: 'calc(max(0.75rem, env(safe-area-inset-bottom)) + 64px)' }}>
          <div className="w-full max-w-md border border-[#00cfff]/40 bg-black/85 backdrop-blur-md p-5 pointer-events-auto shadow-2xl">
            <div className="flex items-center justify-between mb-2">
              <p className="font-mono text-[10px] uppercase tracking-[0.35em] text-[#00cfff]">❖ {tutScript.persona}</p>
              <p className="font-mono text-[10px] tracking-widest text-white/30">{tutLine + 1}/{tutScript.lines.length}</p>
            </div>
            <p className="text-[13.5px] text-white/80 leading-relaxed min-h-[4.5rem]">{tutScript.lines[Math.min(tutLine, tutScript.lines.length - 1)]}</p>
            <button
              onClick={() => { if (!tutLastLine) setTutLine(s => s + 1); else if (onboarding === 'town') onSetStep?.('done'); else setTutCardDone(true); }}
              className="mt-3 w-full bg-[#00cfff] text-black font-bold uppercase text-[11px] tracking-[0.25em] py-2.5 hover:bg-white transition-colors active:scale-95">
              {!tutLastLine ? 'Next ▸' : onboarding === 'town' ? 'Good luck ▸' : 'Got it ▸'}
            </button>
          </div>
        </div>
      )}

      {/* Residual steer once the speech is dismissed — until they reach the next thing. */}
      {!!tutSteer && !machinePrompt && !showAcct && !simConfirm && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-40 pointer-events-none text-center">
          <p className="text-[11px] font-mono uppercase tracking-[0.25em] text-[#00cfff] bg-black/70 px-4 py-1.5 inline-block">{tutSteer}</p>
        </div>
      )}

      {/* ── CHARACTER CREATOR · account prompt ── Discord login or continue as guest (no save). */}
      {showAcct && (
        <div className="absolute inset-0 z-[95] bg-black/90 backdrop-blur-sm flex items-center justify-center p-6"
          style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1.5rem)', paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.5rem)' }}>
          <div className="max-w-sm w-full border border-[#5865F2]/40 bg-black p-7 text-center space-y-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.35em] text-[#00cfff]">terminal · identity</p>
            <p className="font-helvetica font-black uppercase tracking-wide text-xl text-white leading-tight">Make your mark</p>
            <p className="text-[13px] text-white/65 leading-relaxed">The terminal wants to remember you. Sign in with Discord and the world keeps everything — crystals, scores, skins, the room you build. Or carry on as a guest, and nothing is saved.</p>
            <button onClick={() => signInWithDiscord()} className="w-full bg-[#5865F2] text-white font-bold uppercase text-xs tracking-widest py-3 hover:bg-[#6c78f5] transition-colors active:scale-95">Continue with Discord</button>
            <button onClick={chooseGuest} className="w-full border border-white/20 text-white/60 hover:text-white text-xs uppercase tracking-widest py-2.5 active:scale-95">Continue as guest</button>
          </div>
        </div>
      )}

      {/* ── "Enter the simulation?" ── the door out of the Terminal room, after the creator. */}
      {simConfirm && (
        <div className="absolute inset-0 z-[95] bg-black/90 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="max-w-xs w-full border border-[#00cfff]/40 bg-black p-7 text-center space-y-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.35em] text-[#00cfff]">ready</p>
            <p className="font-helvetica font-black uppercase tracking-wide text-lg text-white leading-tight">Enter the simulation?</p>
            <p className="text-[13px] text-white/60 leading-relaxed">Step through, and you’re really in. There’s a room waiting that’s yours.</p>
            <div className="flex gap-2">
              <button onClick={enterSimulation} className="flex-1 bg-[#00cfff] text-black font-bold uppercase text-xs tracking-widest py-3 hover:bg-white transition-colors active:scale-95">Enter ▸</button>
              <button onClick={() => setSimConfirm(false)} className="px-4 border border-white/20 text-white/50 hover:text-white text-xs uppercase tracking-widest active:scale-95">Wait</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Flavour animations ── terminal boot/code-running, and the fade-to-white into the simulation. */}
      {bootAnim && (
        <div className="absolute inset-0 z-[96] bg-black flex items-center justify-center font-mono text-[#00cfff] text-xs sm:text-sm p-8 overflow-hidden">
          <div className="space-y-1 animate-[fadeIn_0.3s_ease]">
            {['> OURO // terminal handshake', '> reading signal…', '> allocating identity buffer…', '> rendering avatar shell…', '> ░▒▓ booting character creator ▓▒░'].map((l, i) => (
              <p key={i} style={{ animation: `fadeIn 0.4s ease ${i * 0.28}s both` }}>{l}</p>
            ))}
          </div>
        </div>
      )}
      {simFade && <div className="absolute inset-0 z-[97] bg-white animate-[fadeIn_1s_ease] pointer-events-none" />}

      {(hint || placingKind || placingPrefab || placeNpc || removeMode || placeLore || tileMode) && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-40 pointer-events-none text-[11px] font-mono uppercase tracking-widest bg-black/70 px-3 py-1" style={{ color: hint ? '#ff4e3e' : '#ffe65c' }}>
          {hint || (placeLore ? 'tap a tile to drop the lore marker ✎' : placeNpc ? 'tap a tile to drop the NPC ☻' : tileMode ? 'tap tiles to paint the floor' : placingPrefab ? 'tap a tile to drop the building 🏠' : placingKind ? 'tap a tile · tap again to stack' : 'tap to pick up (returns to your inventory)')}
        </div>
      )}

      {decorOpen && !locked && (
        <div
          ref={decorPanelRef}
          className="absolute z-40 w-[min(42rem,calc(100vw-1rem))] bg-black/85 backdrop-blur-md border border-white/15 rounded-xl overflow-hidden shadow-2xl"
          style={decorPos
            ? { left: decorPos.x, top: decorPos.y }
            : { left: '50%', transform: 'translateX(-50%)', bottom: 'calc(max(0.75rem, env(safe-area-inset-bottom)) + 52px)' }}
        >
          {/* draggable title bar — move the panel off the map; minimise / close right here (no trip back to the top) */}
          <div onPointerDown={startDecorDrag} className="flex items-center justify-between px-2.5 py-1 border-b border-white/10 cursor-move select-none touch-none">
            <span className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-white/45"><span className="text-white/30 text-xs leading-none">⠿</span> Decorate</span>
            <span className="flex items-center gap-0.5">
              <button onClick={() => setDecorMin(m => !m)} title={decorMin ? 'Expand' : 'Minimise'} className="w-6 h-6 flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 rounded leading-none">{decorMin ? '▢' : '–'}</button>
              <button onClick={closeDecor} title="Close" className="w-6 h-6 flex items-center justify-center text-white/50 hover:text-brandRed hover:bg-white/10 rounded text-sm leading-none">✕</button>
            </span>
          </div>
          {!decorMin && (<>
            {/* header: count + altura (for floating decks) + balance */}
            <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b border-white/10">
              <span className="text-[10px] font-mono uppercase tracking-widest text-white/50 shrink-0">{isMod ? 'moderator' : `objects ${myCount}`}</span>
              {placingKind && (
                <span className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest text-[#00cfff]">
                  Height
                  <button onClick={() => setPlaceElev(e => Math.max(0, e - 1))} className="w-5 h-5 border border-[#00cfff]/40 leading-none hover:bg-[#00cfff]/15">▼</button>
                  <span className="w-4 text-center text-white tabular-nums">{placeElev}</span>
                  <button onClick={() => setPlaceElev(e => Math.min(16, e + 1))} className="w-5 h-5 border border-[#00cfff]/40 leading-none hover:bg-[#00cfff]/15">▲</button>
                </span>
              )}
              <span className="text-[10px] font-mono uppercase tracking-widest text-brandYellow shrink-0">{CURRENCY_SYMBOL} {wallet.balance.toLocaleString('pt-PT')}</span>
            </div>
            {/* category rail (self-drawn icons, no emojis) */}
            <div className="flex gap-0.5 overflow-x-auto px-2 py-1.5 border-b border-white/10">
              {CATS.map(c => {
                const on = cat === c.id && !removeMode;
                return (
                  <button key={c.id} onClick={() => { setCat(c.id); setGamesMode(false); setRemoveMode(false); setTileMode(false); setAtmoMode(false); setBuildMode(false); setPlacingPrefab(null); }} title={c.name}
                    className={`shrink-0 flex flex-col items-center gap-0.5 w-[3.1rem] py-1 rounded-lg transition-colors ${on ? 'bg-white/10' : 'hover:bg-white/5'}`}>
                    <CatIcon catId={c.id} size={22} color={on ? '#ffe65c' : '#cfd2dc'} />
                    <span className={`text-[7px] uppercase tracking-wide leading-none text-center ${on ? 'text-brandYellow' : 'text-white/50'}`}>{c.name.replace('★ ', '')}</span>
                  </button>
                );
              })}
              {(() => { const spin = !!(placingKind && isRotatable(placingKind)); const on = rotateMode || spin; return (
                <button onClick={() => { if (spin) { setPlaceDir(d => (d + 1) % 4); } else { setRotateMode(r => !r); setPlacingKind(null); setGamesMode(false); setRemoveMode(false); setTileMode(false); setAtmoMode(false); setBuildMode(false); setPlacingPrefab(null); } }} title="Rotate"
                  className={`shrink-0 flex flex-col items-center gap-0.5 w-[3.1rem] py-1 rounded-lg transition-colors ml-auto ${on ? 'bg-[#00cfff]/15' : 'hover:bg-white/5'}`}>
                  <CatIcon catId="rotate" size={22} color={on ? '#00cfff' : '#cfd2dc'} />
                  <span className={`text-[7px] uppercase tracking-wide leading-none ${on ? 'text-[#00cfff]' : 'text-white/50'}`}>{spin ? `Turn ${placeDir + 1}/4` : 'Rotate'}</span>
                </button>
              ); })()}
              <button onClick={() => { setRemoveMode(r => !r); setPlacingKind(null); setGamesMode(false); setRotateMode(false); setTileMode(false); setAtmoMode(false); setBuildMode(false); setPlacingPrefab(null); }} title="Pick up"
                className={`shrink-0 flex flex-col items-center gap-0.5 w-[3.1rem] py-1 rounded-lg transition-colors ${removeMode ? 'bg-brandRed/20' : 'hover:bg-white/5'}`}>
                <CatIcon catId="remove" size={22} color={removeMode ? '#ff4e3e' : '#cfd2dc'} />
                <span className={`text-[7px] uppercase tracking-wide leading-none ${removeMode ? 'text-brandRed' : 'text-white/50'}`}>Pick up</span>
              </button>
              <button onClick={() => { setBuildMode(b => { const nb = !b; if (!nb) setPlacingPrefab(null); return nb; }); setPlacingKind(null); setGamesMode(false); setRemoveMode(false); setRotateMode(false); setTileMode(false); setAtmoMode(false); }} title="Pre-made buildings"
                className={`shrink-0 flex flex-col items-center gap-0.5 w-[3.1rem] py-1 rounded-lg transition-colors ${buildMode ? 'bg-brandYellow/20' : 'hover:bg-white/5'}`}>
                <span className="text-[18px] leading-none" style={{ marginTop: '-1px', color: buildMode ? '#ffe65c' : '#cfd2dc' }}>🏠</span>
                <span className={`text-[7px] uppercase tracking-wide leading-none ${buildMode ? 'text-brandYellow' : 'text-white/50'}`}>Builds</span>
              </button>
              <button onClick={() => { refreshRoomLists(); setPortalMaker(true); setGamesMode(false); setRemoveMode(false); setRotateMode(false); setPlacingKind(null); setTileMode(false); setAtmoMode(false); setBuildMode(false); setPlacingPrefab(null); setEditSel(null); }} title="Place a portal to another room"
                className="shrink-0 flex flex-col items-center justify-center gap-0.5 w-[3.1rem] py-1 rounded-lg transition-colors hover:bg-[#cc66ff]/15">
                <span className="text-[18px] leading-none text-[#cc66ff]" style={{ marginTop: '-1px' }}>◎</span>
                <span className="text-[7px] uppercase tracking-wide leading-none text-[#cc66ff]">Portal</span>
              </button>
              {isMod && (
                <button onClick={() => { setTileMode(t => !t); setPlacingKind(null); setGamesMode(false); setRemoveMode(false); setRotateMode(false); setAtmoMode(false); setBuildMode(false); setPlacingPrefab(null); }} title="Paint floor tiles (admin)"
                  className={`shrink-0 flex flex-col items-center justify-center gap-0.5 w-[3.1rem] py-1 rounded-lg transition-colors ${tileMode ? 'bg-[#1ED760]/20' : 'hover:bg-[#1ED760]/15'}`}>
                  <span className="text-[18px] leading-none" style={{ marginTop: '-1px', color: tileMode ? '#1ED760' : '#9fe0b3' }}>▦</span>
                  <span className="text-[7px] uppercase tracking-wide leading-none" style={{ color: tileMode ? '#1ED760' : '#9fe0b3' }}>Tiles</span>
                </button>
              )}
              {isMod && (
                <button onClick={openLoreEditor} title="Author Oracle lore (admin)"
                  className="shrink-0 flex flex-col items-center justify-center gap-0.5 w-[3.1rem] py-1 rounded-lg transition-colors hover:bg-[#00cfff]/15">
                  <span className="text-[16px] leading-none text-[#00cfff]" style={{ marginTop: '-1px' }}>✎</span>
                  <span className="text-[7px] uppercase tracking-wide leading-none text-[#00cfff]">Lore</span>
                </button>
              )}
              {isMod && (
                <button onClick={() => { setAtmoMode(a => !a); setPlacingKind(null); setGamesMode(false); setRemoveMode(false); setRotateMode(false); setTileMode(false); setBuildMode(false); setPlacingPrefab(null); }} title="Room atmosphere (admin)"
                  className={`shrink-0 flex flex-col items-center justify-center gap-0.5 w-[3.1rem] py-1 rounded-lg transition-colors ${atmoMode ? 'bg-[#cc66ff]/20' : 'hover:bg-[#cc66ff]/15'}`}>
                  <span className="text-[16px] leading-none" style={{ marginTop: '-1px', color: atmoMode ? '#cc66ff' : '#c79fe0' }}>☁</span>
                  <span className="text-[7px] uppercase tracking-wide leading-none" style={{ color: atmoMode ? '#cc66ff' : '#c79fe0' }}>Atmo</span>
                </button>
              )}
              {isMod && (
                <button onClick={openNpcEditor} title="Design + place an NPC (admin)"
                  className={`shrink-0 flex flex-col items-center justify-center gap-0.5 w-[3.1rem] py-1 rounded-lg transition-colors ${placeNpc || npcEditor ? 'bg-[#ffb84d]/20' : 'hover:bg-[#ffb84d]/15'}`}>
                  <span className="text-[16px] leading-none" style={{ marginTop: '-1px', color: placeNpc || npcEditor ? '#ffb84d' : '#e0c79f' }}>☻</span>
                  <span className="text-[7px] uppercase tracking-wide leading-none" style={{ color: placeNpc || npcEditor ? '#ffb84d' : '#e0c79f' }}>NPC</span>
                </button>
              )}
              {isMod && (
                <button onClick={() => { setGamesMode(g => !g); setPlacingKind(null); setRemoveMode(false); setRotateMode(false); setTileMode(false); setAtmoMode(false); setBuildMode(false); setPlacingPrefab(null); }} title="Place game events (admin)"
                  className={`shrink-0 flex flex-col items-center justify-center gap-0.5 w-[3.1rem] py-1 rounded-lg transition-colors ${gamesMode ? 'bg-[#ffd23a]/20' : 'hover:bg-[#ffd23a]/15'}`}>
                  <span className="text-[16px] leading-none" style={{ marginTop: '-1px', color: gamesMode ? '#ffd23a' : '#e0d099' }}>🕹</span>
                  <span className="text-[7px] uppercase tracking-wide leading-none" style={{ color: gamesMode ? '#ffd23a' : '#e0d099' }}>Games</span>
                </button>
              )}
            </div>
            {/* item grid — 2 rows, horizontal scroll, drawn thumbnails + price/owned */}
            {gamesMode ? (
              <div className="p-3 space-y-2.5">
                {/* event type */}
                <div className="flex gap-1.5">
                  {([['play', 'Play game', 'a cabinet players walk up to'], ['set', 'Set game', 'retarget this room’s machines']] as [('play' | 'set'), string, string][]).map(([t, label, note]) => (
                    <button key={t} onClick={() => setGTab(t)}
                      className={`flex-1 px-2.5 py-1.5 border rounded-lg text-left transition-colors ${gTab === t ? 'border-[#ffd23a] bg-[#ffd23a]/10' : 'border-white/15 hover:border-white/40'}`}>
                      <span className={`block text-[11px] font-bold ${gTab === t ? 'text-white' : 'text-white/70'}`}>{label}</span>
                      <span className="block text-[9px] text-white/40 leading-tight">{note}</span>
                    </button>
                  ))}
                </div>
                {/* game picker */}
                <div className="flex flex-wrap gap-1.5">
                  {GAMES.map(g => (
                    <button key={g.id} onClick={() => setGGameId(g.id)}
                      className={`px-2.5 py-1.5 border rounded-lg text-left transition-colors ${gGameId === g.id ? 'border-[#ffd23a] bg-[#ffd23a]/10 text-white' : 'border-white/15 text-white/65 hover:border-white/40'}`}>
                      <span className="block text-[11px] font-bold leading-none">{g.name}</span>
                      <span className="block text-[9px] text-white/40 mt-0.5">{g.tag}</span>
                    </button>
                  ))}
                </div>
                {/* special rules (plumbing only for now) */}
                <div className="flex flex-wrap gap-1.5">
                  {RULE_FLAGS.map(f => (
                    <button key={f.key} onClick={() => setGRules(r => ({ ...r, [f.key]: !r[f.key] }))}
                      className={`px-2.5 py-1.5 border rounded-lg text-[11px] transition-colors ${gRules[f.key] ? 'border-[#1ED760] bg-[#1ED760]/10 text-white' : 'border-white/15 text-white/55 hover:border-white/40'}`}>
                      {gRules[f.key] ? '☑' : '☐'} {f.label}
                    </button>
                  ))}
                </div>
                <p className="text-[9px] text-white/30 leading-snug">Special rules are saved on the event but don&apos;t change gameplay yet.</p>
                {/* hidden (Play only) + place */}
                <div className="flex items-center justify-between gap-2 pt-0.5">
                  {gTab === 'play' ? (
                    <button onClick={() => setGHidden(v => !v)} className="text-[10px] text-white/55 hover:text-white flex items-center gap-1">
                      {gHidden ? '☑' : '☐'} Hidden cabinet
                    </button>
                  ) : <span className="text-[9px] text-white/30">Invisible · admins see a glow</span>}
                  <button onClick={armGamePlacement} className="bg-[#ffd23a] text-black font-bold uppercase text-[11px] tracking-widest px-4 py-2 rounded active:scale-95 hover:bg-white transition-colors">
                    {gTab === 'set' ? 'Place event ▸' : 'Place cabinet ▸'}
                  </button>
                </div>
                <div className="pt-1 border-t border-white/10">
                  <button
                    onClick={() => {
                      const games = itemsRef.current.filter(i => i.kind === 'arcade' || i.kind === 'setgame');
                      if (games.length === 0) { flashHint('No game objects in this room'); return; }
                      games.forEach(dropItem);
                      flashHint(`Cleared ${games.length} game object${games.length === 1 ? '' : 's'}`);
                    }}
                    className="w-full px-3 py-1.5 border border-brandRed/40 rounded-lg text-[11px] text-brandRed/70 hover:border-brandRed hover:text-brandRed transition-colors text-left"
                  >
                    Clear all games in room
                  </button>
                </div>
              </div>
            ) : atmoMode ? (
              <div className="p-3">
                <p className="text-[11px] text-[#cc66ff]/90 mb-2">Set the room&apos;s backdrop — a storytelling layer behind the world. Applies live for everyone.</p>
                <div className="flex flex-wrap gap-1.5">
                  {ATMOS.map(a => (
                    <button key={a.id} onClick={() => setAtmosphere(a.id)}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 border rounded-lg text-[11px] transition-colors ${bgAtmo === a.id ? 'border-[#cc66ff] bg-[#cc66ff]/10 text-white' : 'border-white/15 text-white/65 hover:border-white/40'}`}>
                      <span className="w-3.5 h-3.5 rounded-sm border border-white/20" style={{ background: a.sw }} />{a.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : tileMode ? (
              <div className="p-3">
                <p className="text-[11px] text-[#1ED760]/90 mb-2">Pick a floor and tap tiles to paint it. Furniture and triggers are untouched.</p>
                <div className="flex flex-wrap gap-1.5">
                  {([[-1, 'Default', '#2a2a36'], [2, 'Grass', '#358540'], [1, 'Marble', '#bdb6a6'], [3, 'Carpet', '#9c1f29'], [4, 'Dark', '#1d1d27'], [5, 'Disco', '#cc44ff'], [6, 'Water', '#0c5e78'], [7, 'Lava', '#e0531e'], [8, 'Sand', '#dcc88c'], [9, 'Snow', '#dde8f5'], [10, 'Wood', '#8a5a32'], [11, 'Neon', '#0a0a16'], [12, 'Void', '#04040a']] as [number, string, string][]).map(([m, label, col]) => (
                    <button key={m} onClick={() => setPaintMat(m)}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 border rounded-lg text-[11px] transition-colors ${paintMat === m ? 'border-[#1ED760] bg-[#1ED760]/10 text-white' : 'border-white/15 text-white/65 hover:border-white/40'}`}>
                      <span className="w-3.5 h-3.5 rounded-sm border border-white/20" style={{ background: col }} />{label}
                    </button>
                  ))}
                </div>
              </div>
            ) : buildMode ? (
              <div className="overflow-x-auto overflow-y-hidden p-2" style={{ maxHeight: '11rem' }}>
                <p className="text-[10px] text-brandYellow/80 mb-1.5 px-1">Pick a building, then tap a tile — it drops the whole structure (floor it lands on must fit the footprint).</p>
                <div className="flex gap-3">
                  {PREFAB_GROUPS.map(g => (
                    <div key={g.id} className="shrink-0">
                      <p className="text-[8px] uppercase tracking-widest text-white/40 mb-1 px-0.5">{g.name}</p>
                      <div className="flex gap-1.5">
                        {PREFABS.filter(p => p.group === g.id).map(p => {
                          const sel = placingPrefab?.id === p.id;
                          return (
                            <button key={p.id} onClick={() => setPlacingPrefab(cur => cur?.id === p.id ? null : p)} title={`${p.name} — ${p.note}`}
                              className={`relative flex flex-col items-center justify-start gap-0.5 w-[4.6rem] h-[6rem] border rounded-lg pt-1 transition-colors ${sel ? 'border-brandYellow bg-brandYellow/15' : 'border-white/12 bg-white/[0.03] hover:border-white/40'}`}>
                              <PrefabThumb prefab={p} size={52} accent={p.accent} />
                              <span className="text-[8px] uppercase tracking-wide leading-tight text-center text-white/75 w-full px-0.5">{p.name}</span>
                              <span className="text-[7px] leading-none text-white/40 tabular-nums">{p.w}×{p.d} · h{p.h}</span>
                              {sel && <span className="absolute top-0.5 left-0.5 w-1.5 h-1.5 rounded-full bg-brandYellow" />}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : removeMode ? (
              <p className="text-[11px] text-center text-brandRed/80 py-4 px-3">Tap an object to pick it up — it returns to your inventory.</p>
            ) : rotateMode ? (
              <p className="text-[11px] text-center text-[#00cfff]/90 py-4 px-3">Tap an object to rotate it (seats, TV, bar, fridge, machines…).</p>
            ) : (
              <div className="grid grid-rows-2 grid-flow-col auto-cols-max gap-1.5 overflow-x-auto p-2" style={{ maxHeight: '9.5rem' }}>
                {FURNI.filter(f => f.cat === cat).map(f => {
                  const free = isFurniFree(f.kind);
                  const n = furniCount(f.kind);          // Infinity for free basics
                  const canPlace = isMod || n > 0;
                  const sel = placingKind === f.kind;
                  return (
                    <button key={f.kind} onClick={() => {
                      if (!canPlace) { const r = buyFurni(f.kind); flashHint(r.ok ? 'Bought ✦ — tap to place' : (r.error || 'Not enough Crystals')); return; }
                      setPlacingKind(k => k === f.kind ? null : f.kind); setRemoveMode(false); setRotateMode(false); setTileMode(false); setAtmoMode(false); setBuildMode(false); setPlacingPrefab(null);
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
          </>)}
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
            <span className="ml-auto text-[10px] uppercase tracking-widest text-white/40">{d.slug === room ? 'here' : tag || ''}</span>
          </button>
        );
        const copyCode = (c: string) => { try { navigator.clipboard?.writeText(c); flashHint(`Code ${c} copied`); } catch { /* ignore */ } };
        return (
          <div className="absolute inset-0 z-50 bg-black/80 flex justify-center overflow-y-auto px-6 py-10" onClick={() => setShowRooms(false)}>
            <div className="w-full max-w-sm bg-black border border-white/15 p-5 h-fit" onClick={e => e.stopPropagation()}>
              <p className="text-[11px] uppercase tracking-[0.3em] text-white/40 mb-2">Official rooms</p>
              <div className="flex flex-col gap-2">{ROOMS.map(r => roomBtn(r))}</div>

              {isMod && (<>
                <p className="text-[11px] uppercase tracking-[0.3em] text-[#1ED760]/70 mt-5 mb-2">Tutorial rooms · admin</p>
                <div className="flex flex-col gap-2">{Object.values(TUT_ROOMS).map(r => roomBtn(r, 'solo'))}</div>
              </>)}

              {myRooms.length > 0 && (<>
                <p className="text-[11px] uppercase tracking-[0.3em] text-white/40 mt-5 mb-2">Your rooms</p>
                <div className="flex flex-col gap-2">{myRooms.map(r => (
                  <div key={r.slug} className={`flex items-center gap-2 p-3 border ${r.slug === room ? 'border-white bg-white/5' : 'border-white/15'}`}>
                    <button onClick={() => switchRoom(roomDefOf(r))} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                      <span className="w-4 h-4 rounded-full shrink-0" style={{ background: r.accent, boxShadow: `0 0 10px ${r.accent}` }} />
                      <span className="font-bold text-white truncate">{r.name}</span>
                      {!r.public && <span className="text-[10px] uppercase tracking-widest text-white/40">🔒 private</span>}
                    </button>
                    {(r.build_all || (r.rights ?? []).length > 0) && <span title={r.build_all ? 'Everyone can build' : `${r.rights.length} with permission`} className="text-[10px] text-[#1ED760] shrink-0">{r.build_all ? '✦ open' : `+${r.rights.length}`}</span>}
                    {r.code && <button onClick={() => copyCode(r.code)} title="Copy invite code" className="text-[11px] font-mono tracking-widest text-[#00cfff] border border-[#00cfff]/30 px-2 py-1 hover:bg-[#00cfff]/10">{r.code}</button>}
                    <button onClick={() => openPerms(r)} title="Permissions" className="text-white/40 hover:text-white text-base leading-none px-1">⚙</button>
                    <button onClick={() => doDeleteRoom(r)} title="Delete room" className="text-white/30 hover:text-brandRed text-lg leading-none px-1">✕</button>
                  </div>
                ))}</div>
              </>)}

              {community.length > 0 && (<>
                <p className="text-[11px] uppercase tracking-[0.3em] text-white/40 mt-5 mb-2">Community rooms</p>
                <div className="flex flex-col gap-2 max-h-60 overflow-y-auto">{community.map(r => roomBtn(roomDefOf(r)))}</div>
              </>)}

              <p className="text-[11px] uppercase tracking-[0.3em] text-white/40 mt-5 mb-2">Join with a code</p>
              <div className="flex gap-2">
                <input value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())} maxLength={6} placeholder="CODE" onKeyDown={e => { if (e.key === 'Enter') doJoinByCode(); }}
                  className="flex-1 min-w-0 bg-white/5 border border-white/15 text-white px-3 py-2 text-sm tracking-[0.3em] font-mono outline-none focus:border-[#00cfff]" />
                <button onClick={doJoinByCode} className="bg-white/10 text-white font-bold uppercase text-xs tracking-widest px-4 hover:bg-white hover:text-black transition-colors active:scale-95">Enter</button>
              </div>

              <p className="text-[11px] uppercase tracking-[0.3em] text-white/40 mt-5 mb-2">Create your room</p>
              <p className="text-[10px] uppercase tracking-widest text-white/35 mb-1.5">Room shape</p>
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
                <input value={newRoomName} onChange={e => setNewRoomName(e.target.value)} maxLength={24} placeholder="Room name"
                  className="flex-1 min-w-0 bg-white/5 border border-white/15 text-white px-3 py-2 text-sm outline-none focus:border-[#00cfff]" />
                <button onClick={doCreateRoom} className="bg-[#00cfff] text-black font-bold uppercase text-xs tracking-widest px-4 hover:bg-white transition-colors active:scale-95">Create</button>
              </div>
              <label className="flex items-center gap-2 mt-2 text-[11px] text-white/55 cursor-pointer">
                <input type="checkbox" checked={newRoomPrivate} onChange={e => setNewRoomPrivate(e.target.checked)} className="accent-[#00cfff]" />
                Private — code only (won't show in the list)
              </label>
              <p className="text-[10px] text-white/35 mt-2">Your room is yours to decorate. Share the <span className="text-[#00cfff]">code</span> to invite people and grant permission (⚙) to whoever you like. In official rooms only moderators build.</p>
            </div>
          </div>
        );
      })()}

      {permsRoom && (
        <div className="absolute inset-0 z-[60] bg-black/85 flex justify-center overflow-y-auto px-6 py-10" onClick={() => setPermsRoom(null)}>
          <div className="w-full max-w-sm bg-black border border-white/15 p-5 h-fit" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <p className="text-[11px] uppercase tracking-[0.3em] text-white/40">Permissions</p>
              <button onClick={() => setPermsRoom(null)} className="text-white/40 hover:text-white text-lg leading-none">✕</button>
            </div>
            <p className="font-bold text-white truncate mb-4">{permsRoom.name}</p>

            <label className="flex items-center gap-3 p-3 border border-white/15 cursor-pointer hover:border-white/35 mb-2">
              <input type="checkbox" checked={permsPublic} onChange={e => setPermsPublic(e.target.checked)} className="accent-[#cc66ff] w-4 h-4" />
              <span className="text-sm text-white">Public main room<br /><span className="text-[11px] text-white/45">Listed in the browser + pickable as a portal destination.</span></span>
            </label>
            <label className="flex items-center gap-3 p-3 border border-white/15 cursor-pointer hover:border-white/35">
              <input type="checkbox" checked={permsAll} onChange={e => setPermsAll(e.target.checked)} className="accent-[#1ED760] w-4 h-4" />
              <span className="text-sm text-white">Everyone can build<br /><span className="text-[11px] text-white/45">Any visitor can drop and pick up furniture.</span></span>
            </label>

            <p className={`text-[11px] uppercase tracking-[0.3em] text-white/40 mt-5 mb-2 ${permsAll ? 'opacity-40' : ''}`}>People with permission</p>
            <div className={`flex flex-col gap-2 ${permsAll ? 'opacity-40 pointer-events-none' : ''}`}>
              {permsList.length === 0 && <p className="text-[11px] text-white/35">No one yet. Add someone by handle.</p>}
              {permsList.map(h => (
                <div key={h} className="flex items-center gap-2 px-3 py-2 border border-white/12 bg-white/[0.03]">
                  <span className="flex-1 min-w-0 truncate text-sm text-white">{h}</span>
                  <button onClick={() => setPermsList(l => l.filter(x => x !== h))} title="Remove" className="text-white/30 hover:text-brandRed text-lg leading-none px-1">✕</button>
                </div>
              ))}
              <div className="flex gap-2">
                <input value={permsHandle} onChange={e => setPermsHandle(e.target.value)} maxLength={32} placeholder="Person's handle" onKeyDown={e => { if (e.key === 'Enter') addPermHandle(); }}
                  className="flex-1 min-w-0 bg-white/5 border border-white/15 text-white px-3 py-2 text-sm outline-none focus:border-[#1ED760]" />
                <button onClick={addPermHandle} className="bg-white/10 text-white font-bold uppercase text-xs tracking-widest px-4 hover:bg-white hover:text-black transition-colors active:scale-95">Add</button>
              </div>
            </div>
            <p className="text-[10px] text-white/35 mt-2">The handle must match the person's account name exactly. Building includes picking up / removing furniture.</p>

            <button onClick={savePerms} className="w-full mt-4 bg-[#1ED760] text-black font-bold uppercase text-xs tracking-widest py-2.5 hover:bg-white transition-colors active:scale-95">Save</button>
          </div>
        </div>
      )}

      <div className="absolute left-3 z-40 pointer-events-none flex flex-col gap-1 max-w-[60%] sm:max-w-md" style={{ bottom: 'calc(max(0.75rem, env(safe-area-inset-bottom)) + 56px)' }}>
        {feed.map(m => (<p key={m.id} className="text-sm leading-tight" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.95)' }}><span className="text-brandYellow font-bold">{m.handle}</span><span className="text-white/90">: {m.text}</span></p>))}
      </div>

      <form onSubmit={e => { e.preventDefault(); say(msg); }} className="absolute bottom-0 inset-x-0 z-40 p-3 flex justify-center" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
        <div className="flex gap-2 w-full max-w-md">
          <input value={msg} onChange={e => setMsg(e.target.value)} maxLength={120} placeholder="say something…" className="flex-1 min-w-0 bg-black/60 border border-white/20 text-white px-3 py-2 text-sm outline-none focus:border-brandYellow rounded" />
          <button type="submit" className="bg-brandYellow text-black font-bold uppercase text-xs tracking-widest px-4 rounded active:scale-95 hover:bg-white transition-colors">Say</button>
        </div>
      </form>

      {portalPrompt && (
        <div className="absolute inset-0 z-[60] bg-black/85 backdrop-blur-sm flex items-center justify-center p-6" onClick={() => { setPortalPrompt(null); setPortalCode(''); }}>
          <div className="w-full max-w-xs border border-[#00cfff]/30 bg-black p-6 text-center space-y-4" onClick={e => e.stopPropagation()}>
            <p className="font-mono text-[10px] uppercase tracking-[0.35em] text-[#00cfff]">sealed door</p>
            <p className="text-sm text-white/65 leading-relaxed">A portal hums. It wants a code.</p>
            <input value={portalCode} onChange={e => setPortalCode(e.target.value.toUpperCase())} maxLength={12} autoFocus placeholder="CODE" onKeyDown={e => { if (e.key === 'Enter') tryPortal(); }}
              className="w-full bg-white/5 border border-white/15 text-white text-center px-3 py-2.5 text-sm tracking-[0.4em] font-mono outline-none focus:border-[#00cfff]" />
            <div className="flex gap-2">
              <button onClick={tryPortal} className="flex-1 bg-[#00cfff] text-black font-bold uppercase text-xs tracking-widest py-3 active:scale-95 hover:bg-white transition-colors">Open ▸</button>
              <button onClick={() => { setPortalPrompt(null); setPortalCode(''); }} className="px-4 border border-white/20 text-white/50 hover:text-white text-xs uppercase tracking-widest active:scale-95">Leave</button>
            </div>
          </div>
        </div>
      )}

      {machinePrompt && (
        <div className="absolute inset-0 z-[65] bg-black/85 backdrop-blur-sm flex items-center justify-center p-6" onClick={() => setMachinePrompt(null)}>
          <div className="w-full max-w-sm border border-brandYellow/40 bg-black p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <p className="font-mono text-[10px] uppercase tracking-[0.35em] text-brandYellow">🕹 arcade machine</p>
              <button onClick={() => setMachinePrompt(null)} className="text-white/40 hover:text-white text-lg leading-none">✕</button>
            </div>
            <p className="text-sm text-white/60 leading-relaxed">Slot in. Pick a game — survive, score, walk away with crystals.</p>
            <div className="flex flex-col gap-2">
              {machinePrompt.games.map(g => (
                <button key={g.id} onClick={() => { const rules = machinePrompt.rules; setMachinePrompt(null); nearMachineRef.current = 'launched'; writeOrigin(); (onLaunchGameRef.current ?? onLaunchGame)?.(g.id, rules); }}
                  className="group flex items-center justify-between gap-3 border border-white/15 hover:border-brandYellow bg-white/[0.03] hover:bg-brandYellow/10 px-4 py-3 text-left transition-colors">
                  <span>
                    <span className="block font-helvetica font-black text-lg text-white leading-none">{g.name}</span>
                    <span className="block text-[11px] text-white/45 mt-1">{g.tag}</span>
                  </span>
                  <span className="text-brandYellow font-bold uppercase text-xs tracking-widest opacity-60 group-hover:opacity-100">Play ▸</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <NpcEditor open={npcEditor} onClose={() => setNpcEditor(false)}
        onPlace={d => { pendingNpcRef.current = d; setNpcEditor(false); setPlaceNpc(true); setPlacingKind(null); setRemoveMode(false); setRotateMode(false); setTileMode(false); setAtmoMode(false); setBuildMode(false); setEditSel(null); flashHint('Tap a tile to drop the NPC ☻'); }} />

      {portalMaker && (
        <div className="absolute inset-0 z-[70] bg-black/85 backdrop-blur-sm flex items-center justify-center p-6" onClick={() => setPortalMaker(false)}>
          <div className="w-full max-w-sm border border-[#cc66ff]/40 bg-black p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.35em] text-[#cc66ff]">◎ new portal</p>
              <p className="text-sm text-white/60 leading-relaxed mt-1">Drop a door that leads somewhere else. People walk onto it to travel — find it, walk to it.</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-white/40 mb-1.5">Leads to</p>
              <div className="flex flex-wrap gap-1.5 max-h-44 overflow-y-auto">
                {([
                  ...ROOMS.map(r => [r.slug, r.name] as [string, string]),                 // official public rooms
                  ...personalRooms.map(r => [r.slug, r.name] as [string, string]),         // admin/community public rooms
                  ['code', 'Room code…'],
                ] as [string, string][]).map(([id, label]) => (
                  <button key={id} onClick={() => setPmDest(id)}
                    className={`text-[11px] font-mono uppercase tracking-wider px-3 py-1.5 border transition-colors ${pmDest === id ? 'bg-[#cc66ff] text-black border-[#cc66ff]' : 'text-white/70 border-white/20 hover:border-[#cc66ff]/60'}`}>{label}</button>
                ))}
              </div>
              {pmDest === 'code' && (
                <input value={pmRoomCode} onChange={e => setPmRoomCode(e.target.value.toUpperCase())} maxLength={8} placeholder="ROOM CODE"
                  className="mt-2 w-full bg-white/5 border border-white/15 text-white px-3 py-2 text-sm tracking-[0.3em] font-mono outline-none focus:border-[#cc66ff]" />
              )}
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-white/40 mb-1.5">Access code <span className="text-white/25 normal-case tracking-normal">(optional — leave blank for an open door)</span></p>
              <input value={pmAccess} onChange={e => setPmAccess(e.target.value.toUpperCase())} maxLength={12} placeholder="NO CODE"
                className="w-full bg-white/5 border border-white/15 text-white px-3 py-2 text-sm tracking-[0.3em] font-mono outline-none focus:border-[#cc66ff]" />
            </div>
            <label className="flex items-center gap-2 text-[11px] text-white/60 cursor-pointer">
              <input type="checkbox" checked={pmHidden} onChange={e => setPmHidden(e.target.checked)} className="accent-[#cc66ff]" />
              Hidden trigger — no visible door (a disguised spot players have to find)
            </label>
            <div className="flex gap-2 pt-1">
              <button onClick={makePortal} className="flex-1 bg-[#cc66ff] text-black font-bold uppercase text-xs tracking-widest py-3 active:scale-95 hover:bg-white transition-colors">Place portal ▸</button>
              <button onClick={() => setPortalMaker(false)} className="px-4 border border-white/20 text-white/50 hover:text-white text-xs uppercase tracking-widest active:scale-95">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {arrivalModal && (
        <div className="absolute inset-0 z-[80] bg-black/90 backdrop-blur-sm flex items-center justify-center p-6"
          style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1.5rem)', paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.5rem)' }}>
          <div className="max-w-sm w-full border border-[#00cfff]/30 bg-black p-7 text-center space-y-4 overflow-y-auto max-h-full">
            <p className="font-mono text-[10px] uppercase tracking-[0.35em] text-[#00cfff]">portal opened</p>
            <p className="font-helvetica font-black uppercase tracking-wide text-lg text-white leading-tight">{arrivalModal.title}</p>
            {arrivalModal.reward > 0 && <p className="font-mono text-2xl text-brandYellow">✦ +{arrivalModal.reward}</p>}
            <p className="text-[13px] text-white/65 leading-relaxed whitespace-pre-line text-left">{arrivalModal.body}</p>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setArrivalModal(null)} className="flex-1 bg-[#00cfff] text-black font-bold uppercase text-xs tracking-widest py-3 active:scale-95 hover:bg-white transition-colors">Explore ▸</button>
              <button onClick={() => { setArrivalModal(null); setShowRooms(true); }} className="px-4 border border-white/20 text-white/60 hover:text-white text-xs uppercase tracking-widest active:scale-95">Build a room</button>
            </div>
          </div>
        </div>
      )}

      <button onClick={toggleMusic} title={musicOff ? 'Signal muted — tap to listen' : 'SUAV signal — tap to mute'} aria-label="Toggle music"
        className={`absolute top-3 z-40 text-[15px] font-mono border border-brandYellow bg-black/60 w-8 h-8 flex items-center justify-center hover:bg-brandYellow hover:text-black transition-all ${musicOff ? 'text-brandYellow/40 line-through' : 'text-brandYellow'}`}
        style={{ right: onExit ? '5.5rem' : '1rem' }}>♪</button>

      {onExit && <button onClick={onExit} className="absolute top-3 right-4 z-40 text-[11px] font-mono text-brandYellow border border-brandYellow bg-black/60 px-3 py-1.5 hover:bg-brandYellow hover:text-black transition-all">[ EXIT ]</button>}

      <Oracle open={oracleOpen} onClose={() => setOracleOpen(false)} roomSlug={roomMeta.slug} roomName={roomMeta.name} />

      {/* ── Oracle lore — spoken to ANY player when a marker triggers (on-enter / walking onto a spot). ── */}
      {loreCard && (
        <div className="absolute inset-x-0 z-[78] flex justify-center px-4" style={{ bottom: 'calc(max(0.75rem, env(safe-area-inset-bottom)) + 64px)' }} onClick={() => setLoreCard(null)}>
          <div className="w-full max-w-md border border-[#00cfff]/40 bg-black/90 backdrop-blur-md p-5 shadow-2xl" onClick={e => e.stopPropagation()}>
            <p className="font-mono text-[10px] uppercase tracking-[0.35em] text-[#00cfff] mb-2">❖ the Oracle</p>
            <p className="text-[13.5px] text-white/85 leading-relaxed whitespace-pre-line">{loreCard}</p>
            <button onClick={() => setLoreCard(null)} className="mt-3 w-full bg-[#00cfff] text-black font-bold uppercase text-[11px] tracking-[0.25em] py-2.5 hover:bg-white transition-colors active:scale-95">Close ▸</button>
          </div>
        </div>
      )}

      {/* ── Lore editor (admin) ── author / edit / remove the room's on-enter + spot lore. ── */}
      {loreEditor && (() => {
        const markers = loreRef.current;
        return (
        <div className="absolute inset-0 z-[76] bg-black/85 backdrop-blur-sm flex justify-center overflow-y-auto px-4 py-8" onClick={() => setLoreEditor(false)}>
          <div className="w-full max-w-md bg-black border border-[#00cfff]/30 h-fit p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <p className="font-helvetica font-black uppercase tracking-widest text-white">Lore &amp; events · {roomMeta.name}</p>
              <button onClick={() => setLoreEditor(false)} className="text-white/40 hover:text-white text-xl leading-none">✕</button>
            </div>

            {/* existing markers */}
            <div className="flex flex-col gap-1.5">
              {markers.length === 0 && <p className="text-[11px] text-white/35">No markers yet. Add one below.</p>}
              {markers.map(l => (
                <div key={l.id} className="flex items-center gap-2 border border-white/12 bg-white/[0.03] px-3 py-2">
                  <span className={`shrink-0 text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded ${l.style === 'glitch' ? 'bg-[#cc44ff]/20 text-[#cc44ff]' : l.style === 'reward' ? 'bg-brandYellow/20 text-brandYellow' : 'bg-[#00cfff]/15 text-[#00cfff]'}`}>{l.mode === 'enter' ? 'enter' : `${l.gx},${l.gy}`}</span>
                  <span className="flex-1 min-w-0 text-[12px] text-white/70 truncate">{l.style === 'reward' ? `✦ ${l.crystals || 0}${l.skinId ? ` · ${skinById(l.skinId).name}` : ''}` : l.text}</span>
                  <button onClick={() => { setLoreText(l.text); setLoreEditId(l.id); setMkStyle(l.style); setMkMode(l.mode); setMkCrystals(l.crystals || 0); setMkSkin(l.skinId || ''); }} className="text-[#00cfff]/70 hover:text-[#00cfff] text-[11px] uppercase tracking-widest">edit</button>
                  <button onClick={() => removeLore(l.id)} title="Remove" className="text-white/30 hover:text-brandRed text-lg leading-none">✕</button>
                </div>
              ))}
            </div>

            {/* author / edit */}
            <div className="border-t border-white/10 pt-3 space-y-2">
              <p className="text-[11px] uppercase tracking-widest text-white/45">{loreEditId ? 'Edit marker' : 'New marker'}</p>
              <div className="flex gap-2">
                <div className="flex-1">
                  <p className="text-[9px] uppercase tracking-widest text-white/35 mb-1">Trigger</p>
                  <div className="flex gap-1">
                    {(['enter', 'tile'] as LoreMode[]).map(m => (
                      <button key={m} disabled={!!loreEditId} onClick={() => setMkMode(m)} className={`flex-1 text-[10px] uppercase tracking-wider py-1.5 border transition-colors ${mkMode === m ? 'bg-white/10 text-white border-white/40' : 'text-white/50 border-white/15'} ${loreEditId ? 'opacity-40' : ''}`}>{m === 'enter' ? 'On enter' : 'On a tile'}</button>
                    ))}
                  </div>
                </div>
                <div className="flex-1">
                  <p className="text-[9px] uppercase tracking-widest text-white/35 mb-1">Style</p>
                  <div className="flex gap-1">
                    {([['oracle', 'Oracle'], ['glitch', 'Glitch'], ['reward', 'Reward']] as [LoreStyle, string][]).map(([s, lbl]) => (
                      <button key={s} onClick={() => setMkStyle(s)} className={`flex-1 text-[10px] uppercase tracking-wider py-1.5 border transition-colors ${mkStyle === s ? (s === 'glitch' ? 'bg-[#cc44ff]/20 text-[#cc44ff] border-[#cc44ff]/50' : s === 'reward' ? 'bg-brandYellow/20 text-brandYellow border-brandYellow/50' : 'bg-[#00cfff]/15 text-[#00cfff] border-[#00cfff]/50') : 'text-white/50 border-white/15'}`}>{lbl}</button>
                    ))}
                  </div>
                </div>
              </div>
              {mkStyle === 'reward' ? (
                <div className="flex gap-2">
                  <div className="w-28">
                    <p className="text-[9px] uppercase tracking-widest text-white/35 mb-1">Crystals ✦</p>
                    <input type="number" min={0} value={mkCrystals} onChange={e => setMkCrystals(Math.max(0, parseInt(e.target.value) || 0))} className="w-full bg-white/5 border border-white/15 text-white px-3 py-2 text-sm outline-none focus:border-brandYellow tabular-nums" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[9px] uppercase tracking-widest text-white/35 mb-1">Unlock skin</p>
                    <select value={mkSkin} onChange={e => setMkSkin(e.target.value)} className="w-full bg-white/5 border border-white/15 text-white px-2 py-2 text-sm outline-none focus:border-brandYellow">
                      <option value="">— none —</option>
                      {SKINS.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                </div>
              ) : (
                <textarea value={loreText} onChange={e => setLoreText(e.target.value)} rows={mkStyle === 'glitch' ? 4 : 3}
                  placeholder={mkStyle === 'glitch' ? '> terminal lines…\n> one per line — typed out over the glitch' : 'The Oracle’s words…'}
                  className="w-full bg-white/5 border border-white/15 text-white px-3 py-2 text-sm outline-none focus:border-[#00cfff] resize-none font-mono" />
              )}
              <div className="flex gap-2">
                <button onClick={saveMarker} className="flex-1 bg-[#00cfff] text-black font-bold uppercase text-[11px] tracking-widest py-2 hover:bg-white transition-colors active:scale-95">{loreEditId ? 'Update' : mkMode === 'enter' ? 'Save on-enter' : 'Place on a tile ▸'}</button>
                {loreEditId && <button onClick={() => { setLoreEditId(null); setLoreText(''); }} className="px-3 border border-white/20 text-white/50 hover:text-white text-[11px] uppercase tracking-widest active:scale-95">Cancel</button>}
              </div>
              {mkStyle === 'glitch' && <button onClick={() => setGlitchSeq(loreText || '> preview…')} className="w-full text-[10px] uppercase tracking-widest text-[#cc44ff]/70 hover:text-[#cc44ff] py-1">▶ preview sequence</button>}
            </div>
            <p className="text-[10px] text-white/35">Markers persist for everyone. Players see new/changed lore on their next visit to the room.</p>
          </div>
        </div>
        );
      })()}

      {glitchSeq !== null && <GlitchSequence text={glitchSeq} onClose={() => setGlitchSeq(null)} />}

      {/* ── Reward reveal ── a screen-takeover congratulating the player on what they just won. ── */}
      {rewardReveal && (() => { const sk = rewardReveal.skinId ? skinById(rewardReveal.skinId) : null; return (
        <div className="fixed inset-0 z-[115] flex items-center justify-center p-6 overflow-hidden" onClick={() => setRewardReveal(null)}
          style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1.5rem)' }}>
          <div className="absolute inset-0 bg-black/92" />
          {/* radiant burst */}
          <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[140vmin] h-[140vmin]"
            style={{ background: 'radial-gradient(circle, rgba(255,210,60,0.18), rgba(255,210,60,0.04) 35%, transparent 65%)', animation: 'rwd-spin 18s linear infinite' }} />
          <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[120vmin] h-[120vmin] opacity-40"
            style={{ background: 'repeating-conic-gradient(from 0deg, rgba(255,210,60,0.10) 0deg 6deg, transparent 6deg 12deg)', animation: 'rwd-spin 24s linear infinite reverse' }} />

          <div className="relative text-center" style={{ animation: 'rwd-pop 0.5s cubic-bezier(0.34,1.56,0.64,1) both' }} onClick={e => e.stopPropagation()}>
            <p className="font-mono text-[11px] uppercase tracking-[0.5em] text-brandYellow/80 mb-2">Reward unlocked</p>
            <p className="font-helvetica font-black uppercase tracking-tight text-4xl sm:text-5xl text-white mb-6" style={{ textShadow: '0 0 24px rgba(255,210,60,0.5)' }}>Congratulations!</p>

            {sk && (
              <div className="mb-6 flex flex-col items-center gap-3">
                <div className="relative" style={{ animation: 'rwd-float 2.6s ease-in-out infinite' }}>
                  <div className="absolute inset-0 -m-6 rounded-full" style={{ background: `radial-gradient(circle, ${sk.color}55, transparent 70%)` }} />
                  <div className="relative"><SkinPreview skin={sk} size={120} /></div>
                </div>
                <p className="font-helvetica font-black text-2xl text-white">{sk.name}</p>
                <p className="text-[11px] uppercase tracking-[0.3em] text-brandYellow/80">new skin</p>
              </div>
            )}

            {rewardReveal.crystals > 0 && (
              <p className="font-mono font-bold text-3xl sm:text-4xl text-brandYellow mb-6" style={{ textShadow: '0 0 18px rgba(255,210,60,0.55)' }}>✦ +{rewardReveal.crystals.toLocaleString('pt-PT')}</p>
            )}

            <button onClick={() => setRewardReveal(null)} className="bg-brandYellow text-black font-bold uppercase tracking-[0.3em] text-sm px-10 py-3.5 hover:bg-white transition-colors active:scale-95">Claim ▸</button>
          </div>
          <style>{`@keyframes rwd-spin{to{transform:translate(-50%,-50%) rotate(360deg)}}@keyframes rwd-pop{from{opacity:0;transform:scale(0.8)}to{opacity:1;transform:scale(1)}}@keyframes rwd-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}`}</style>
        </div>
      ); })()}

      <MenuModal open={menuOpen} onClose={() => setMenuOpen(false)} />

      {isSuper && <AdminModal open={adminOpen} onClose={() => setAdminOpen(false)} />}

      <InventoryModal open={invOpen} onClose={() => { setInvOpen(false); if (onboarding === 'character') finishCharacter(); }} onEquip={equipAppearance} title={onboarding === 'character' ? 'Design your character' : 'Character'} />
    </div>
  );
};
