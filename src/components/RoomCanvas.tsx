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
import { drawSkinShape, skinById, getSelectedSkinId, SKINS, isCreatureId, parseCreature } from '@/lib/skins';
import { grantSkin, getJarTotal } from '@/lib/economy';
import { validateMessage } from '@/lib/names';
import { CATS, FURNI, defOf, furniPrice, sitHeight, isRotatable, isFurniFree } from '@/lib/furni';
import { type IconSpec, drawIconSpec, iconPrimaryColor } from '@/lib/icons';
import { drawPerson, parsePerson, personPrimaryColor } from '@/lib/person';
import { resolveAppearance } from '@/lib/catalog';
import { buyFurni, furniCount, consumeFurni, returnFurni, grantFurni, spend, refreshWalletFromCloud, useWallet, CURRENCY_SYMBOL, addBalance, getBalance, buyItem, grantItem, itemCount, takeItem, consumeItem } from '@/lib/wallet';
import { ITEMS, itemById, getSpeedMultiplier, getSwayIntensity, getSwayEffect, getSpeedEffect, getFlyActive } from '@/lib/items';
import {
  getHP, equippedWeaponSpec, equippedShieldSpec, weaponOf, applyDamage, respawnHP,
  computeLoot, dropLoot, grantLoot, lootIsEmpty, subscribeCombat, tileDist, MAX_HP, KO_MS, type Loot, type WeaponSpec,
} from '@/lib/combat';
import {
  canAfford, escrowAnte, creditStake, makeSeed, makeMatchId, createDuel, markLocked, voidDuel,
  stashTicket, stakeLabel, isWagerable, stakeIsEmpty, isDuelReady, CLIMB_GAME_ID, type DuelStake, type DuelIdentity,
} from '@/lib/duel';
import { InventoryModal } from '@/components/InventoryModal';
import { CatIcon, FurniSprite, PrefabThumb } from '@/components/UiIcon';
import { PREFABS, PREFAB_GROUPS, type Prefab } from '@/lib/prefabs';
import { drawFurniSprite, effSpan } from '@/lib/furniRender';
import { type RoomRow, fetchRooms, fetchMyRooms, fetchDiscoveredRooms, roomByCode, roomBySlug, setRoomPublic, createRoom, deleteRoom, updateRoomPerms, recordRoomVisit } from '@/lib/rooms';
import { type RoomPlan, ROOM_PLANS, PLAN_GRID, planById, planMask, planWaterMask, planMaterialMask, planSpawn } from '@/lib/roomPlans';
import { RoomMusic } from '@/lib/roomMusic';
import { Oracle } from '@/components/Oracle';
import { MenuModal } from '@/components/MenuModal';
import { GlitchSequence } from '@/components/GlitchSequence';
import { BinaryRain } from '@/components/BinaryRain';
import { AdminModal } from '@/components/AdminModal';
import { SkinPreview } from '@/components/SkinPreview';
import { NpcEditor, type NpcData, type HazardSpec, type KillTrigger, sanitizeHazard } from '@/components/NpcEditor';

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

type RoomDef = { slug: string; name: string; accent: string; floor: string; locked?: boolean; owner?: string; buildAll?: boolean; rights?: string[]; plan?: string; day?: boolean; veranda?: boolean; outdoor?: boolean; combat?: boolean; arena?: boolean; arenaMin?: number; arenaMax?: number; discoverable?: boolean };
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
const TOWN: RoomDef   = { slug: 'town',   name: 'Town',      accent: '#00cfff', floor: '#161628', plan: 'mega',   outdoor: true };
const ARCADE: RoomDef = { slug: 'arcade', name: 'Arcade',    accent: '#ffd23a', floor: '#16121f', plan: 'enorme' };
const WOODS: RoomDef  = { slug: 'woods',  name: 'The Woods', accent: '#4fd96b', floor: '#16271a', plan: 'grove',  day: true, outdoor: true };
// The menu's destinations (the tutorial rooms are start-only, never listed): Arcade holds the games,
// Town is the social hub, the Woods are the wild edge. Staked arenas are made per-room by mods via
// the perms panel (an `arena:<min>:<max>` marker), not hardcoded here.
const ROOMS: RoomDef[] = [TOWN, ARCADE, WOODS];
// Bet-band presets for the perms-panel "make this room an arena" toggle (max 0 = no ceiling).
const ARENA_TIERS: { label: string; min: number; max: number }[] = [
  { label: 'Pit', min: 10, max: 250 }, { label: 'Arena', min: 250, max: 1000 }, { label: 'Colosseum', min: 1000, max: 5000 }, { label: 'Vault', min: 5000, max: 0 },
];
const TUT_BY_SLUG: Record<string, RoomDef> = Object.fromEntries(Object.values(TUT_ROOMS).map(r => [r.slug, r]));
const roomOf = (slug: string) => TUT_BY_SLUG[slug] ?? ROOMS.find(r => r.slug === slug) ?? TOWN;
const isTutRoom = (slug: string) => slug.startsWith('t_');
// Which tutorial room each onboarding step lives in ('character' shares the terminal room).
const tutSlugFor = (step: string): string | null => (({ oracle: 't_oracle', arcade: 't_arcade', terminal: 't_terminal', character: 't_terminal', yourroom: 't_yourroom' }) as Record<string, string>)[step] ?? null;

// Secret/lore sectors are gone for now — the lore sequence is being rebuilt. Kept as an empty map so
// player-made portals (which resolve public slugs / room codes) still compile.
const SECRET_ROOMS: Record<string, RoomDef> = {};
type Portal = { gx: number; gy: number; code: string; to: string; reward?: number; user?: boolean; message?: string };
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
  // `duel` turns a dropped game into a 1v1 wager cabinet: walking up opens the lobby (friendly/wager)
  // for that game instead of a solo launch. Only takes effect for duel-ready games (see isDuelReady).
  { key: 'duel', token: 'du', label: '⚔ 1v1 duel' },
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
const GAME_CLIMB: GameSlot = { id: CLIMB_GAME_ID, name: 'Climb Race', tag: '1v1 seeded climb · friendly or wager' };
const GAME_TANK: GameSlot = { id: 'tank', name: 'TANKS', tag: '1v1 real-time tank duel · best of 3' };
// Single source of truth for "which games exist" — the admin Games tab lists from this. Drop any with the
// ⚔ duel flag to make it a wager cabinet; the flag only does something for duel-ready games (isDuelReady).
const GAMES: GameSlot[] = [GAME_OUROO, GAME_LEAP, GAME_CLIMB, GAME_TANK];
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
    const h = sanitizeHazard(o.h);
    const sz = Math.min(5, Math.max(1, Number(o.sz) || 1));
    return { n: String(o.n).slice(0, 24), a: String(o.a || 'diamond-gold'), l: Array.isArray(o.l) ? o.l.map(String).slice(0, 8) : [], ...(h ? { h } : {}), ...(sz !== 1 ? { sz } : {}) }; }
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
type Item = { id: string; kind: string; gx: number; gy: number; dir?: number; elev?: number; createdBy?: string; portalTo?: string; portalCode?: string; portalHidden?: boolean; portalMessage?: string; gameId?: string; gameRules?: GameRules; gameHidden?: boolean; gameSet?: boolean; shopItems?: string[]; shopName?: string; shopTriggers?: Array<{gx: number; gy: number}> };
// Direction + elevation persist inside the room_items `kind` text as `kind@dir^elev` (no migration).
const encodeKind = (kind: string, dir: number, elev = 0) => `${kind}${dir ? `@${dir}` : ''}${elev ? `^${elev}` : ''}`;
const decodeKind = (raw: string): { kind: string; dir: number; elev: number } => { const m = raw.match(/^([^@^]+)(?:@(\d+))?(?:\^(\d+(?:\.\d+)?))?$/); return m ? { kind: m[1], dir: m[2] ? (Number(m[2]) % 4 + 4) % 4 : 0, elev: m[3] ? Number(m[3]) : 0 } : { kind: raw, dir: 0, elev: 0 }; };
// PLAYER PORTALS persist in the SAME room_items table (no migration) as a special kind string:
//   `portal:<encoded dest>:<encoded access-code>[:1]`.  A trailing `:1` marks a HIDDEN trigger (no
//   visible teleporter sprite — a disguised floor trigger). encodeURIComponent escapes any @ / ^ / :
//   in the dest/code, so the segments stay clean; we hydrate it into a `teleporter` item with the link.
const encodePortal = (to: string, code: string, hidden = false, message = '') => {
  const base = `portal:${encodeURIComponent(to)}:${encodeURIComponent(code)}`;
  if (!message) return `${base}${hidden ? ':1' : ''}`;
  return `${base}:${hidden ? '1' : ''}:${encodeURIComponent(message)}`;
};
// GAME TRIGGERS — admin-placed game events, persisted in the SAME room_items table (no migration):
//   `game:<gameId>:<rules>[:1]`     PLAY trigger: walk close → picker → launch <gameId> with <rules>.
//                                   trailing `:1` = a HIDDEN cabinet (disguised floor trigger).
//   `setgame:<gameId>:<rules>`      SET event: retargets THIS room's machines to <gameId> (no launch).
// rules is the dotted token list from encodeRules (':'-free), so the colon segments stay clean.
const encodeGameTrigger = (gameId: string, rules: GameRules, hidden = false) => `game:${encodeURIComponent(gameId)}:${encodeRules(rules)}${hidden ? ':1' : ''}`;
const encodeSetGame = (gameId: string, rules: GameRules) => `setgame:${encodeURIComponent(gameId)}:${encodeRules(rules)}`;
// SHOP TRIGGERS — admin-placed shop events, invisible to players; walk close → shop modal.
//   `shop:<item1>,<item2>,...`   each item ID is URL-encoded so commas stay clean as delimiters.
// Format: `shop:<encodedName>:<item1>,<item2>,...[:<tx_ty;tx_ty;...>]`
// 4th segment (trigger tiles) is optional — omitted means fall back to Chebyshev-1 proximity.
// Backwards-compat: old rows have no name segment → `shop:<items>` (no second colon).
const encodeShopTrigger = (name: string, itemIds: string[], triggers?: Array<{gx: number; gy: number}>): string => {
  const base = `shop:${encodeURIComponent(name)}:${itemIds.map(encodeURIComponent).join(',')}`;
  return triggers && triggers.length > 0 ? `${base}:${triggers.map(t => `${t.gx}_${t.gy}`).join(';')}` : base;
};
const decodeShopItems = (s: string): string[] => s ? s.split(',').map(safeDecode).filter(Boolean) : [];
// LORE MARKERS — admin-authored Oracle lore, persisted in room_items as `lore:<mode>:<encoded text>`.
//   mode 'enter' → spoken once per player when they arrive in the room (tile ignored).
//   mode 'tile'  → spoken when a player walks close to the marker's tile (re-fires per approach).
type LoreMode = 'enter' | 'tile';
type LoreStyle = 'oracle' | 'glitch' | 'reward';   // spoken card / full-screen terminal takeover / a payout
type LoreMarker = { id: string; mode: LoreMode; style: LoreStyle; gx: number; gy: number; text: string; crystals?: number; skinId?: string; items?: Record<string, number>; furni?: Record<string, number>; near?: boolean };
// oracle markers persist as `lore:<mode>:<text>`, glitch as `seq:<mode>:<text>`, rewards as
// `reward:<mode>:<crystals>:<skinId>` (skinId may be empty). All fire once per player for on-enter;
// reward tile markers also fire once per player (claimed), text ones re-fire on each approach.
const encodeMarker = (style: LoreStyle, mode: LoreMode, text: string) => `${style === 'glitch' ? 'seq' : 'lore'}:${mode}:${encodeURIComponent(text)}`;
const encodeReward = (mode: LoreMode, crystals: number, skinId: string, items: Record<string, number> = {}, furni: Record<string, number> = {}) => {
  const base = `reward:${mode}:${Math.max(0, Math.floor(crystals) || 0)}:${encodeURIComponent(skinId || '')}`;
  const hi = Object.keys(items).length > 0, hf = Object.keys(furni).length > 0;
  return (hi || hf) ? `${base}:${encodeURIComponent(JSON.stringify(hi ? items : {}))}:${encodeURIComponent(JSON.stringify(hf ? furni : {}))}` : base;
};
// ROOM ATMOSPHERE — an admin-chosen backdrop layer, persisted as a `bg:<id>` row. 'auto' = the room's
// built-in day/night. The rest override it for storytelling (sunny, rainy, Matrix-style code rain, a
// glitched-out signal). The atmosphere paints the sky/void BEHIND the isometric room.
type Atmo = 'auto' | 'day' | 'night' | 'rain' | 'coderain' | 'glitch' | 'lava' | 'purplehaze' | 'swamp' | 'cosmic' | 'sunset' | 'disco';
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
  { id: 'disco', label: 'Disco', sw: '#ff44cc' },
];
// User-created outdoor rooms — follow the GMT+10 day/night schedule.
// Hardcoded rooms (Town, Woods) carry outdoor:true directly in their RoomDef.
// Add a new outdoor room's slug here; roomDefOf picks it up automatically.
const OUTDOOR_SLUGS = new Set([
  'u_00633691813b', // The Park
  'u_df131d039537', // Alleyway
  'u_7f1dc449d1f4', // More Alleyway
  'u_7ebfdc6ffa2b', // Even More Alleyway?
  'u_a4b6e410943b', // Junkyard
  'u_8c0a2afe1aaf', // Dirt Road
]);
// 5% per-hour rain probability → ~94% chance of at least one rain spell per 5-day period.
const RAIN_PROB = 0.05;
// Deterministic float in [0,1) from an integer seed — stable across frames for the same window.
const seededFrac = (n: number) => { const x = Math.sin(n + 1) * 43758.5453; return x - Math.floor(x); };
const scheduleAtmo = (): Atmo => {
  const now = new Date();
  const gmt10Min = (now.getUTCHours() * 60 + now.getUTCMinutes() + 10 * 60) % (24 * 60);
  if (gmt10Min >= 330 && gmt10Min < 420) return 'sunset';   // 5:30–7:00  sunrise glow
  if (gmt10Min >= 420 && gmt10Min < 1080) {                 // 7:00–18:00 daytime
    // Seed on (GMT+10 calendar day, hour) so the decision is stable per hour and shared across clients.
    const day = Math.floor((now.getTime() + 10 * 3600000) / 86400000);
    const curHour = Math.floor(gmt10Min / 60);
    for (let h = curHour; h >= Math.max(7, curHour - 1); h--) {
      const seed = day * 24 + h;
      if (seededFrac(seed) < RAIN_PROB) {
        const start = h * 60 + Math.floor(seededFrac(seed * 2) * 60); // random minute within hour
        const dur   = 5 + Math.floor(seededFrac(seed * 3) * 56);       // 5–60 min
        if (gmt10Min >= start && gmt10Min < Math.min(start + dur, 1080)) return 'rain';
      }
    }
    return 'day';
  }
  if (gmt10Min >= 1080 && gmt10Min < 1200) return 'sunset'; // 18:00–20:00 sunset
  return 'night';                                             // 20:00–5:30  night
};
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
const safeDecode = (s: string) => { try { return decodeURIComponent(s); } catch { return s; } };
const hydrateItem = (rawKind: string, id: string, gx: number, gy: number, createdBy: string): Item => {
  if (rawKind.startsWith('portal:')) {
    const [, to = '', code = '', hidden = '', msg = ''] = rawKind.split(':');
    return { id, kind: 'teleporter', gx, gy, dir: 0, elev: 0, createdBy, portalTo: safeDecode(to), portalCode: safeDecode(code), portalHidden: hidden === '1', portalMessage: msg ? safeDecode(msg) : undefined };
  }
  if (rawKind.startsWith('setgame:')) {
    const [, gid = '', rules = ''] = rawKind.split(':');
    return { id, kind: 'setgame', gx, gy, dir: 0, elev: 0, createdBy, gameId: safeDecode(gid), gameRules: decodeRules(rules), gameSet: true };
  }
  if (rawKind.startsWith('game:')) {
    const [, gid = '', rules = '', hidden = ''] = rawKind.split(':');
    return { id, kind: 'arcade', gx, gy, dir: 0, elev: 0, createdBy, gameId: safeDecode(gid), gameRules: decodeRules(rules), gameHidden: hidden === '1' };
  }
  if (rawKind.startsWith('shop:')) {
    const parts = rawKind.slice(5).split(':');
    const shopName = parts.length >= 2 ? safeDecode(parts[0]) : '';
    const itemsPart = parts.length >= 2 ? parts[1] : parts[0];
    const triggersPart = parts[2] ?? '';
    const shopTriggers = triggersPart ? triggersPart.split(';').map(t => { const [x, y] = t.split('_').map(Number); return { gx: x, gy: y }; }).filter(t => !isNaN(t.gx) && !isNaN(t.gy)) : undefined;
    return { id, kind: 'shop', gx, gy, dir: 0, elev: 0, createdBy, shopName, shopItems: decodeShopItems(itemsPart), shopTriggers };
  }
  const dk = decodeKind(rawKind);
  return { id, kind: dk.kind, dir: dk.dir, elev: dk.elev, gx, gy, createdBy };
};
type Avatar = { handle: string; skinId: string; icon?: IconSpec | null; fx: number; fy: number; tx: number; ty: number; z: number; lvl: number; bubble: string; bubbleLife: number; af: number; emote?: string | null; emoteAf?: number; swayIntensity?: number; swayExpiry?: number; speedMult?: number; speedExpiry?: number; hp?: number; maxHp?: number; absorb?: number; hpStamp?: number; weapon?: string; koUntil?: number; hitUntil?: number; attackUntil?: number; vx?: number; vy?: number; rxAt?: number; flying?: boolean; };
type Self = Avatar & { id: string; path: { gx: number; gy: number; z: number }[] };
type InteractPeer = { id: string; handle: string };
type TradeOffer = { type: 'item'; id: string } | { type: 'furni'; kind: string } | { type: 'crystals'; amount: number };

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
  const npcsRef = useRef<(Avatar & { id?: string; lines?: string[]; lineQueue?: string[]; hx?: number; hy?: number; roam?: number; path: { gx: number; gy: number; z: number }[]; wanderCool: number; beats?: string[]; hints?: string[]; hintIdx?: number; nid?: string; near?: boolean; cool?: number; lastLine?: string; hz?: HazardSpec; defeated?: boolean; peaceful?: boolean; lastNpcAtk?: number; respawnAt?: number; bodyScale?: number })[]>([]);   // curated + admin-placed NPCs (hints + lore beats + chatter + roaming + hazard combat)
  const placedNpcsRef = useRef<{ id: string; gx: number; gy: number; data: NpcData }[]>([]);   // admin-placed NPCs (persisted as `npc:` rows)
  const npcHpRef = useRef<Map<string, number>>(new Map());   // mid-fight NPC hp by nid — survives rebuildNpcs so a concurrent placement doesn't heal a boss
  const deviceRef = useRef('');   // stable device token — furni ownership (persists across reloads)
  const sessionRef = useRef('');  // unique per tab/session — presence key + broadcast id (so two sessions don't collide)
  const surfRef = useRef<number[][]>(Array.from({ length: GRID * GRID }, () => []));  // walkable surface levels per tile (layered)
  const solidRef = useRef<Uint8Array>(new Uint8Array(GRID * GRID));        // 1 = blocked
  const blockTopRef = useRef<Float32Array>(new Float32Array(GRID * GRID)); // max obstacle top height per tile (walls + roofs) — used by Wings fly clearance
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
  const heartbeatAccum = useRef(0);
  const wasMovingRef = useRef(false);
  const strideRef = useRef(0);   // distance walked since the last footstep sound
  const lastPortalKeyRef = useRef<string | null>(null);   // rising-edge guard so a portal fires once per arrival
  const portalFromRef = useRef<string | null>(null);       // source-room slug when arriving via a portal — consumed by ingest
  const portalTileRef = useRef(-1);                       // last tile we ran the portal check on (skip the per-frame scan otherwise)
  const voidTimerRef = useRef(0);   // frames the player has lingered on a void tile (time-based hazard)
  const modRef = useRef(false);

  const [msg, setMsg] = useState('');
  const [population, setPopulation] = useState(1);
  const [connected, setConnected] = useState(false);
  const [roomReady, setRoomReady] = useState(false);
  const [feed, setFeed] = useState<{ id: number; handle: string; text: string }[]>([]);
  const feedId = useRef(0);
  // New players start in the tutorial's first room; returning-from-a-game players land back at their
  // launch origin; everyone else lands in Town.
  const startSlug = tutSlugFor(onboarding) ?? origin?.slug ?? 'town';
  const [room, setRoom] = useState(startSlug);
  const [roomMeta, setRoomMeta] = useState<RoomDef>(roomOf(startSlug));   // current room's def (official or personal)
  const roomMetaRef = useRef<RoomDef>(roomMeta);
  const [showRooms, setShowRooms] = useState(false);
  const [roomSearch, setRoomSearch] = useState('');
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
  const [permsCombat, setPermsCombat] = useState(false);   // PvP toggle (mod-gated) in the perms modal
  const [permsDiscoverable, setPermsDiscoverable] = useState(false);   // discoverable toggle in perms modal
  const [permsArena, setPermsArena] = useState(false);     // staked-arena toggle (mod-gated) + its bet band
  const [permsArenaMin, setPermsArenaMin] = useState('10');
  const [permsArenaMax, setPermsArenaMax] = useState('0');   // 0 = no ceiling
  // ---- combat / hp ----
  const [selfHp, setSelfHp] = useState<{ hp: number; max: number; absorb: number }>(() => ({ hp: MAX_HP, max: MAX_HP, absorb: 0 }));
  const [huntable, setHuntable] = useState(false);   // a fightable hazardous NPC is present → show combat HUD/punch even outside PvP rooms
  const huntableRef = useRef(false);
  // ---- staked arena (betting PvP) ---- escrow lives in a ref + localStorage so a refresh mid-fight is safe.
  const arenaRef = useRef<{ slug: string; stake: number; balance: number } | null>(null);
  const arenaMarkerRef = useRef<string | null>(null);   // room_items id of the `arena:` marker flagging the current room
  const [arenaBal, setArenaBal] = useState<number | null>(null);   // HUD mirror of escrow balance (null = not staked)
  const [stakePrompt, setStakePrompt] = useState(false);
  const [stakeInput, setStakeInput] = useState('');
  const [koUntil, setKoUntil] = useState(0);   // self knockout: WASTED overlay + respawn countdown
  const [koMsg, setKoMsg] = useState('');      // optional message shown in the KO overlay (e.g. crystal loss)
  const [, setKoTick] = useState(0);           // forces re-render so the countdown ticks while down
  const koUntilRef = useRef(0);
  const [npcTargetPrompt, setNpcTargetPrompt] = useState<{ nid: string; handle: string } | null>(null);
  const [npcTarget, setNpcTarget] = useState<{ nid: string; handle: string } | null>(null);
  const npcTargetRef = useRef<{ nid: string; handle: string } | null>(null);
  const [arenaCountdown, setArenaCountdown] = useState<number | null>(null);
  const arenaCountdownRef = useRef<number | null>(null);   // ref mirror so animation loop can read it
  const lastAttackRef = useRef(0);             // weapon-cooldown gate
  const swingWeaponRef = useRef<() => void>(() => {});   // F key / punch button → radius swing
  const dmgFxRef = useRef<{ fx: number; fy: number; z: number; text: string; color: string; life: number }[]>([]);   // floating damage numbers (grid-anchored)
  const projRef = useRef<{ fx0: number; fy0: number; z0: number; fx1: number; fy1: number; z1: number; life: number; max: number; color: string; style?: string }[]>([]);   // projectiles in flight
  const broadcastHPRef = useRef<() => void>(() => {});
  const [myOwnerId, setMyOwnerId] = useState('');
  const ownerIdRef = useRef('');
  const [myHandle, setMyHandle] = useState('Guest');
  const myHandleRef = useRef('Guest');
  const themeRef = useRef<RoomDef>(roomMeta);
  useEffect(() => { themeRef.current = roomMeta; roomMetaRef.current = roomMeta; }, [roomMeta]);
  // Combat: keep the HUD hp in sync + re-broadcast my hp/weapon whenever combat state changes (hit, heal, equip).
  useEffect(() => { setSelfHp(getHP()); return subscribeCombat(() => { setSelfHp(getHP()); broadcastHPRef.current?.(); }); }, []);
  // Tick the WASTED respawn countdown while knocked out.
  useEffect(() => {
    if (koUntil <= Date.now()) return;
    const iv = setInterval(() => { if (Date.now() >= koUntil) { setKoUntil(0); setKoMsg(''); } else setKoTick(t => t + 1); }, 200);
    return () => clearInterval(iv);
  }, [koUntil]);
  // Tick the arena entry countdown; player is untracked (invisible to others) until it clears.
  useEffect(() => {
    if (arenaCountdown === null || arenaCountdown <= 0) return;
    const t = setTimeout(() => {
      const next = arenaCountdown - 1;
      if (next <= 0) {
        arenaCountdownRef.current = null; setArenaCountdown(null);
        broadcastHPRef.current();   // reappear in presence at spawn position
      } else {
        setArenaCountdown(next);
      }
    }, 1000);
    return () => clearTimeout(t);
  }, [arenaCountdown]);
  // In a combat room, refresh the HUD periodically so passive regen shows on your own bar.
  useEffect(() => {
    if (!roomMeta.combat) return;
    const iv = setInterval(() => { const h = getHP(); setSelfHp(prev => (prev.hp !== h.hp || prev.absorb !== h.absorb || prev.max !== h.max) ? h : prev); }, 1500);
    return () => clearInterval(iv);
  }, [roomMeta.combat]);
  // F (anywhere, not while typing) → swing your weapon at everyone in reach. Wired once; reads live state via ref.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'f' && e.key !== 'F' || e.repeat) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (!roomMetaRef.current.combat && !huntableRef.current) return;
      e.preventDefault();
      swingWeaponRef.current?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const [discoveredRooms, setDiscoveredRooms] = useState<RoomRow[]>([]);
  const refreshRoomLists = () => { fetchRooms().then(setPersonalRooms); fetchMyRooms().then(setMyRooms); fetchDiscoveredRooms().then(setDiscoveredRooms); };
  useEffect(() => { if (showRooms) { refreshRoomLists(); setRoomSearch(''); } /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [showRooms]);
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
  const [editingNpcId, setEditingNpcId] = useState<string | null>(null);
  const [npcMode, setNpcMode] = useState<'choose' | 'list' | null>(null);
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
  const [rewardReveal, setRewardReveal] = useState<{ crystals: number; skinId: string; items: Record<string, number>; furni: Record<string, number> } | null>(null);   // screen-takeover reward celebration
  const [bgAtmo, setBgAtmo] = useState<Atmo>('auto');   // current room atmosphere (mirrors bgRef, for the editor)
  const [inObscured, setInObscured] = useState(false);  // true while the player is inside an obscured (hidden) area
  const inObscuredRef = useRef(false);                   // shadow ref so the animation loop can gate setState
  const [flying, setFlying] = useState(false);           // true while Wings is active → show the ▲/▼ fly pad
  const flyingUiRef = useRef(false);                     // shadow ref so the loop only setState()s on change
  const [atmoMode, setAtmoMode] = useState(false);      // showing the atmosphere palette in Decorate
  const [gamesMode, setGamesMode] = useState(false);    // admin: the Games tab (place game triggers / set-game events)
  const [gTab, setGTab] = useState<'play' | 'set'>('play');   // Games tab: which event type to place
  const [gGameId, setGGameId] = useState('ouroo');      // Games tab: chosen game
  const [gRules, setGRules] = useState<GameRules>({});  // Games tab: special-rule toggles (plumbing only)
  const [gHidden, setGHidden] = useState(false);        // Games tab: place a hidden cabinet (Play only)
  const [shopsMode, setShopsMode] = useState(false);   // admin: the Shops tab (place shop triggers)
  const [sShopItems, setSShopItems] = useState<string[]>([]);   // item IDs selected for the shop being configured
  const [sShopName, setSShopName] = useState('');               // name of the shop being configured
  const [sEditShopId, setSEditShopId] = useState<string | null>(null);   // item ID of the shop being edited (null = new)
  const [sShowEditList, setSShowEditList] = useState(false);    // showing the "edit shops" list
  const [sTriggerMode, setSTriggerMode] = useState(false);      // admin is selecting activation tiles for a shop
  const [sTriggerShopId, setSTriggerShopId] = useState<string | null>(null);
  const [sTriggerTiles, setSTriggerTiles] = useState<string[]>([]); // selected tiles as "x_y" keys
  const [shopPrompt, setShopPrompt] = useState<{ items: string[]; name: string } | null>(null);   // shop modal when player walks close
  const [mkMode, setMkMode] = useState<LoreMode>('enter');     // editor: trigger of the marker being authored
  const [mkStyle, setMkStyle] = useState<LoreStyle>('oracle'); // editor: presentation of the marker
  const [mkCrystals, setMkCrystals] = useState(100);           // editor: reward crystal amount
  const [mkSkin, setMkSkin] = useState('');                    // editor: reward skin to unlock ('' = none)
  const [mkItems, setMkItems] = useState<Record<string, number>>({});   // editor: reward items { itemId → qty }
  const [mkFurni, setMkFurni] = useState<Record<string, number>>({});   // editor: reward furni { kind → qty }
  const [mkItemPick, setMkItemPick] = useState('');            // editor: item picker selection
  const [mkFurniPick, setMkFurniPick] = useState('');          // editor: furni picker selection
  const pendingLoreRef = useRef<{ text: string; style: LoreStyle; crystals: number; skinId: string; items: Record<string, number>; furni: Record<string, number> }>({ text: '', style: 'oracle', crystals: 0, skinId: '', items: {}, furni: {} });   // marker waiting to drop on a tap
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
  const closeDecor = () => { setDecorOpen(false); setDecorMin(false); setPlacingKind(null); setRemoveMode(false); setRotateMode(false); setTileMode(false); setAtmoMode(false); setGamesMode(false); setShopsMode(false); setPlaceLore(false); setBuildMode(false); setPlacingPrefab(null); setEditSel(null); setNpcEditor(false); setPlaceNpc(false); setEditingNpcId(null); setNpcMode(null); setPortalMode(null); setPortalEditing(null); setPortalMaker(false); };
  const [entered] = useState(true);   // instant spawn — you arrive straight in the Plaza lore room (no lobby gate)
  const [portalPrompt, setPortalPrompt] = useState<Portal | null>(null);   // code prompt when you walk onto a coded portal
  const [portalCode, setPortalCode] = useState('');
  const [portalMessagePrompt, setPortalMessagePrompt] = useState<Portal | null>(null);   // message modal before portal travel
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
  const nearShopRef = useRef<string | null>(null);      // key of the shop tile currently in range
  const replacingShopIdRef = useRef<string | null>(null); // when re-placing: ID of the old shop to drop first
  const lastPlacedShopIdRef = useRef<string | null>(null); // set by placeItem when a shop is placed; read to enter trigger mode
  const sTriggerTilesRef = useRef<Set<string>>(new Set()); // mirrors sTriggerTiles state for use in the draw loop
  const speedMultRef = useRef(1);                        // current speed multiplier from active item effects
  const swayIntensityRef = useRef(0);                    // current drunk sway intensity from active item effects
  const flyRef = useRef(false);                          // Wings active → can climb any height (reach roofs)
  const speedCheckRef = useRef(0);                       // frame counter for periodic effect refresh
  const machineOverrideRef = useRef<{ gameId: string; rules: GameRules } | null>(null);   // a placed set-game event retargets this room's machines
  const nearTermRef = useRef(false);      // rising-edge guard for the terminal
  const tutPortalArmRef = useRef(false);  // rising-edge guard for the onward tutorial door
  const onLaunchGameRef = useRef(onLaunchGame);
  useEffect(() => { onLaunchGameRef.current = onLaunchGame; }, [onLaunchGame]);
  const { user } = useUser();   // signed-in Discord user (null = guest); used by the duel-lobby wager gate

  // ── DUEL LOBBY (placeable cabinet) ── walk up to a Duel Cabinet → a waiting room keyed by that cabinet.
  // When a 2nd player walks up, the host (lower id, both agree) picks Friendly or a Wager, then starts.
  // Coordination runs over a per-cabinet presence channel (duel:lobby:<cabId>); the seeded Climb Race
  // (and, for wagers, the duels escrow row) take over once both launch. Discord is required only to wager.
  type LobbyPlayer = { id: string; handle: string; token: string | null };
  const [duelLobby, setDuelLobby] = useState<{ cabId: string; gameId: string } | null>(null);   // open lobby (null = closed): cabId keys the channel, gameId is the game to duel
  const [lobbyRoster, setLobbyRoster] = useState<LobbyPlayer[]>([]);
  const [lobbyMode, setLobbyMode] = useState<'friendly' | 'wager'>('friendly');
  const [duelStake, setDuelStake] = useState<DuelStake>({ crystals: 0, items: {} });
  const [lobbyMsg, setLobbyMsg] = useState('');
  // A wager needs BOTH players to agree: the host offers (nothing escrowed yet), the guest sees the stake
  // and accepts/declines, then both ante up and launch. Friendly needs no consent (nothing at risk).
  type WagerOffer = { matchId: string; gameId: string; seed: number; stake: DuelStake; hostId: string; hostHandle: string; hostToken: string };
  const [wagerOffer, setWagerOffer] = useState<WagerOffer | null>(null);   // guest: an incoming wager offer to accept/decline
  const [wagerWaiting, setWagerWaiting] = useState(false);                  // host: waiting for the guest to accept
  const pendingWagerRef = useRef<{ matchId: string; seed: number; gameId: string; stake: DuelStake; guest: LobbyPlayer } | null>(null);
  const acceptedMatchRef = useRef<string | null>(null);    // guest: matchId of the wager I accepted (gate for lobby_go)
  const lobbyChannelRef = useRef<ReturnType<NonNullable<typeof supabase>['channel']> | null>(null);
  const duelCabRef = useRef<string | null>(null);   // rising-edge guard for cabinet proximity
  const launchingDuelRef = useRef(false);            // guard: launch the match exactly once
  const hostStakeRef = useRef<DuelStake | null>(null);   // host's escrowed stake (for refund on guest nack)
  // Validate a stake received over the wire (never trust the payload shape).
  const normStake = (v: unknown): DuelStake => {
    const o = (v && typeof v === 'object') ? v as Record<string, unknown> : {};
    const items: Record<string, number> = {};
    if (o.items && typeof o.items === 'object') for (const [k, n] of Object.entries(o.items as Record<string, unknown>)) { const c = Math.floor(Number(n) || 0); if (c > 0) items[k] = c; }
    return { crystals: Math.max(0, Math.floor(Number(o.crystals) || 0)), items };
  };
  // My wagering identity, from the SAME signed-in user the rest of the UI trusts (useUser reads the
  // persisted session; getAuthIdentity's network getUser() was returning null spuriously).
  const meDuelIdentity = (): DuelIdentity | null => user ? { token: `discord:${user.id}`, handle: user.name.slice(0, 24) } : null;
  // Stash the ticket + launch the duel view (mirrors the arcade-machine launch path so EXIT returns here).
  const launchDuel = (ticket: Parameters<typeof stashTicket>[0]) => {
    stashTicket(ticket); nearMachineRef.current = 'launched'; writeOrigin();
    (onLaunchGameRef.current ?? onLaunchGame)?.('duel');
  };
  // Wagerable items: non-free, finitely-owned furni you hold.
  const wagerableItems = (): { kind: string; name: string; have: number }[] => {
    const w = wallet.furni;
    return Object.keys(w).filter(k => w[k] > 0 && isWagerable(k)).map(k => ({ kind: k, name: defOf(k)?.name ?? k, have: w[k] }));
  };
  const setStakeItem = (kind: string, n: number) => setDuelStake(s => { const items = { ...s.items }; if (n <= 0) delete items[kind]; else items[kind] = n; return { ...s, items }; });
  const leaveLobby = () => { setDuelLobby(null); setLobbyMsg(''); setLobbyMode('friendly'); setDuelStake({ crystals: 0, items: {} }); setWagerOffer(null); setWagerWaiting(false); pendingWagerRef.current = null; acceptedMatchRef.current = null; };
  // Host (lower id) starts the match. Friendly → share a seed and both launch immediately. Wager → send an
  // OFFER and wait for the guest to agree (no crystals move until both consent).
  const startLobbyDuel = async () => {
    const meId = selfRef.current.id;
    const host = lobbyRoster[0], guest = lobbyRoster[1];
    if (!host || !guest) { setLobbyMsg('Waiting for an opponent.'); return; }
    if (host.id !== meId) { setLobbyMsg('Only the host starts the match.'); return; }
    const slug = roomMetaRef.current.slug;
    const gameId = duelLobby?.gameId ?? CLIMB_GAME_ID;
    const seed = makeSeed();
    if (lobbyMode === 'friendly') {
      const matchId = makeMatchId();
      launchingDuelRef.current = true;
      // Await the broadcast so it flushes before launchDuel unmounts the room (and tears down this channel).
      await lobbyChannelRef.current?.send({ type: 'broadcast', event: 'lobby_go', payload: { matchId, gameId, seed, friendly: true, hostId: meId, hostHandle: selfRef.current.handle, guestId: guest.id } });
      launchDuel({ id: matchId, seed, gameId, role: 'host', room: slug, meHandle: selfRef.current.handle, oppHandle: guest.handle, friendly: true });
      return;
    }
    // wager → offer (no escrow yet; wait for the guest to accept)
    const me = meDuelIdentity();
    if (!me) { setLobbyMsg('Sign in with Discord to wager.'); return; }
    if (!guest.token) { setLobbyMsg(`${guest.handle} isn't signed in — friendly only.`); return; }
    if (stakeIsEmpty(duelStake)) { setLobbyMsg('Set a stake first.'); return; }
    const aff = canAfford(duelStake); if (!aff.ok) { setLobbyMsg(aff.reason ?? 'Insufficient stake.'); return; }
    const matchId = makeMatchId();
    pendingWagerRef.current = { matchId, seed, gameId, stake: duelStake, guest };
    setWagerWaiting(true); setLobbyMsg('');
    await lobbyChannelRef.current?.send({ type: 'broadcast', event: 'wager_offer', payload: { matchId, gameId, seed, stake: duelStake, hostId: meId, hostHandle: me.handle, hostToken: me.token, guestId: guest.id } });
  };
  const cancelWagerOffer = () => { pendingWagerRef.current = null; setWagerWaiting(false); setLobbyMsg(''); };
  // Guest: a wager offer arrived → show it for accept/decline (nothing escrowed yet).
  const onWagerOffer = (p: Record<string, unknown>) => {
    if (String(p.guestId ?? '') !== selfRef.current.id) return;
    setWagerOffer({ matchId: String(p.matchId), gameId: String(p.gameId ?? CLIMB_GAME_ID), seed: Number(p.seed) >>> 0, stake: normStake(p.stake), hostId: String(p.hostId), hostHandle: String(p.hostHandle ?? 'Host'), hostToken: String(p.hostToken ?? '') });
  };
  const acceptWager = async () => {
    const o = wagerOffer; if (!o) return;
    const me = meDuelIdentity();
    if (!me) { setLobbyMsg('Sign in with Discord to accept.'); return; }
    if (!canAfford(o.stake).ok) { setWagerOffer(null); setLobbyMsg('You cannot cover that stake.'); await lobbyChannelRef.current?.send({ type: 'broadcast', event: 'wager_decline', payload: { matchId: o.matchId, toId: o.hostId } }); return; }
    acceptedMatchRef.current = o.matchId;
    setWagerOffer(null); setLobbyMsg('Wager accepted — waiting for host to start…');
    await lobbyChannelRef.current?.send({ type: 'broadcast', event: 'wager_accept', payload: { matchId: o.matchId, guestId: selfRef.current.id, toId: o.hostId } });
  };
  const declineWager = async () => {
    const o = wagerOffer; if (!o) return;
    setWagerOffer(null);
    await lobbyChannelRef.current?.send({ type: 'broadcast', event: 'wager_decline', payload: { matchId: o.matchId, toId: o.hostId } });
  };
  // Host: guest accepted the wager → NOW escrow our ante, record the audit row, send the real start.
  const onWagerAccept = async (p: Record<string, unknown>) => {
    if (String(p.toId ?? '') !== selfRef.current.id) return;
    const pend = pendingWagerRef.current; if (!pend || pend.matchId !== String(p.matchId)) return;
    const me = meDuelIdentity(); if (!me) return;
    if (!canAfford(pend.stake).ok || !escrowAnte(pend.stake)) { setWagerWaiting(false); pendingWagerRef.current = null; setLobbyMsg('Could not escrow your ante.'); return; }
    const slug = roomMetaRef.current.slug;
    void createDuel({ id: pend.matchId, room: slug, seed: pend.seed, host: me, guest: { token: pend.guest.token!, handle: pend.guest.handle }, stake: pend.stake });   // best-effort audit
    hostStakeRef.current = pend.stake;
    launchingDuelRef.current = true;
    pendingWagerRef.current = null;
    await lobbyChannelRef.current?.send({ type: 'broadcast', event: 'lobby_go', payload: { matchId: pend.matchId, duelId: pend.matchId, gameId: pend.gameId, seed: pend.seed, friendly: false, stake: pend.stake, hostId: selfRef.current.id, hostHandle: me.handle, hostToken: me.token, guestId: pend.guest.id } });
    launchDuel({ id: pend.matchId, seed: pend.seed, gameId: pend.gameId, role: 'host', room: slug, meHandle: me.handle, meToken: me.token, oppHandle: pend.guest.handle, oppToken: pend.guest.token ?? undefined, stake: pend.stake, friendly: false });
  };
  const onWagerDecline = (p: Record<string, unknown>) => {
    if (String(p.toId ?? '') !== selfRef.current.id) return;
    const pend = pendingWagerRef.current; if (!pend || pend.matchId !== String(p.matchId)) return;
    pendingWagerRef.current = null; setWagerWaiting(false); setLobbyMsg(`${pend.guest.handle} declined the wager.`);
  };
  // Both sides launch on the host's start. Friendly: anyone. Wager: only the guest who accepted this match.
  const onLobbyGo = async (p: Record<string, unknown>) => {
    const meId = selfRef.current.id;
    if (String(p.guestId ?? '') !== meId || launchingDuelRef.current) return;
    const seed = Number(p.seed) >>> 0;
    const gameId = String(p.gameId ?? CLIMB_GAME_ID);
    const hostHandle = String(p.hostHandle ?? 'Host');
    const slug = roomMetaRef.current.slug;
    if (p.friendly) {
      launchingDuelRef.current = true;
      launchDuel({ id: String(p.matchId), seed, gameId, role: 'guest', room: slug, meHandle: selfRef.current.handle, oppHandle: hostHandle, friendly: true });
      return;
    }
    const duelId = String(p.duelId ?? p.matchId);
    if (acceptedMatchRef.current !== duelId) return;   // only launch a wager I explicitly accepted
    const me = meDuelIdentity();
    const stake = normStake(p.stake);
    if (!me) { lobbyChannelRef.current?.send({ type: 'broadcast', event: 'lobby_nack', payload: { duelId, toId: String(p.hostId) } }); setLobbyMsg('Sign in with Discord to accept a wager.'); return; }
    if (!canAfford(stake).ok || !escrowAnte(stake)) { lobbyChannelRef.current?.send({ type: 'broadcast', event: 'lobby_nack', payload: { duelId, toId: String(p.hostId) } }); setLobbyMsg('You could not cover the stake.'); return; }
    launchingDuelRef.current = true;
    await markLocked(duelId, 'guest').catch(() => {});
    launchDuel({ id: duelId, seed, gameId, role: 'guest', room: slug, meHandle: me.handle, meToken: me.token, oppHandle: hostHandle, oppToken: String(p.hostToken ?? ''), stake, friendly: false });
  };
  const onLobbyNack = (p: Record<string, unknown>) => {
    if (String(p.toId ?? '') !== selfRef.current.id) return;
    if (p.duelId) void voidDuel(String(p.duelId));
    if (hostStakeRef.current) { creditStake(hostStakeRef.current, 1); hostStakeRef.current = null; }
    launchingDuelRef.current = false;
    setLobbyMsg('Opponent could not match the stake — your ante was refunded.');
  };
  // Keep the latest lobby handlers reachable from the (once-created) lobby channel subscription.
  const onLobbyGoRef = useRef(onLobbyGo); onLobbyGoRef.current = onLobbyGo;
  const onLobbyNackRef = useRef(onLobbyNack); onLobbyNackRef.current = onLobbyNack;
  const onWagerOfferRef = useRef(onWagerOffer); onWagerOfferRef.current = onWagerOffer;
  const onWagerAcceptRef = useRef(onWagerAccept); onWagerAcceptRef.current = onWagerAccept;
  const onWagerDeclineRef = useRef(onWagerDecline); onWagerDeclineRef.current = onWagerDecline;
  // Join/leave the per-cabinet lobby channel while its overlay is open. Presence builds the roster; both
  // players agree on host = lowest id. Re-tracks when sign-in changes so the wager option unlocks live.
  useEffect(() => {
    const cabId = duelLobby?.cabId;
    if (!cabId || !supabase) { setLobbyRoster([]); return; }
    launchingDuelRef.current = false;
    const meId = selfRef.current.id;
    const myTok = user ? `discord:${user.id}` : null;
    const ch = supabase.channel(`duel:lobby:${cabId}`, { config: { presence: { key: meId }, broadcast: { self: false } } });
    lobbyChannelRef.current = ch;
    const rebuild = () => {
      const st = ch.presenceState() as Record<string, Array<Record<string, unknown>>>;
      const seen = new Map<string, LobbyPlayer>();
      for (const k in st) { const m = st[k]?.[0]; if (!m) continue; const id = String(m.id ?? k); seen.set(id, { id, handle: String(m.handle ?? '???'), token: m.token ? String(m.token) : null }); }
      setLobbyRoster([...seen.values()].sort((a, b) => a.id.localeCompare(b.id)));
    };
    ch.on('presence', { event: 'sync' }, rebuild)
      .on('broadcast', { event: 'wager_offer' }, ({ payload }) => { onWagerOfferRef.current(payload as Record<string, unknown>); })
      .on('broadcast', { event: 'wager_accept' }, ({ payload }) => { void onWagerAcceptRef.current(payload as Record<string, unknown>); })
      .on('broadcast', { event: 'wager_decline' }, ({ payload }) => { onWagerDeclineRef.current(payload as Record<string, unknown>); })
      .on('broadcast', { event: 'lobby_go' }, ({ payload }) => { void onLobbyGoRef.current(payload as Record<string, unknown>); })
      .on('broadcast', { event: 'lobby_nack' }, ({ payload }) => { onLobbyNackRef.current(payload as Record<string, unknown>); })
      .subscribe(async status => { if (status === 'SUBSCRIBED') { await ch.track({ id: meId, handle: selfRef.current.handle, token: myTok }).catch(() => {}); } });
    return () => { try { if (supabase) supabase.removeChannel(ch); } catch { /* ignore */ } if (lobbyChannelRef.current === ch) lobbyChannelRef.current = null; };
  }, [duelLobby, user]);
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
  useEffect(() => { setTutLine(0); setTutCardDone(false); setSimConfirm(false); nearMachineRef.current = null; nearShopRef.current = null; nearTermRef.current = false; tutPortalArmRef.current = false; }, [onboarding]);
  // Persisted character-creator progress (survives the Discord OAuth round-trip mid-tutorial).
  useEffect(() => {
    try { setCharDone(localStorage.getItem('ouroo_tut_char') === '1'); setGuestChosen(localStorage.getItem('ouroo_tut_guest') === '1'); } catch { /* ignore */ }
  }, []);
  const [arrivalModal, setArrivalModal] = useState<{ title: string; body: string; reward: number } | null>(null);   // first-visit reward + onboarding
  // Player portal-maker: pick a destination + optional access code, then drop the portal onto a tile.
  const [portalMaker, setPortalMaker] = useState(false);
  const [portalEditing, setPortalEditing] = useState<string | null>(null);  // item id of portal being edited
  const [portalMode, setPortalMode] = useState<'choose' | 'list' | null>(null);
  const [pmDest, setPmDest] = useState('town');      // a public slug, or 'code' to link by room code
  const [pmRoomCode, setPmRoomCode] = useState('');  // the destination room's invite code (when pmDest==='code')
  const [pmAccess, setPmAccess] = useState('');      // optional access code the next person must speak
  const [pmHidden, setPmHidden] = useState(false);   // disguised trigger — no visible teleporter sprite
  const [pmMessage, setPmMessage] = useState('');    // optional message shown to the player before travel
  const makePortal = () => {
    const to = pmDest === 'code' ? `code:${pmRoomCode.trim().toUpperCase()}` : pmDest;
    if (pmDest === 'code' && !pmRoomCode.trim()) { flashHint('Enter the destination room code'); return; }
    setPlacingKind(encodePortal(to, pmAccess.trim(), pmHidden, pmMessage.trim())); setRemoveMode(false); setRotateMode(false); setTileMode(false);
    setPortalMaker(false); flashHint(pmHidden ? 'Tap a tile to drop the hidden trigger ◌' : 'Tap a tile to drop the portal ✦');
  };
  const savePortalEdit = () => {
    if (!portalEditing) return;
    const it = itemsRef.current.find(i => i.id === portalEditing);
    if (!it) { setPortalEditing(null); setPortalMaker(false); return; }
    const to = pmDest === 'code' ? `code:${pmRoomCode.trim().toUpperCase()}` : pmDest;
    if (pmDest === 'code' && !pmRoomCode.trim()) { flashHint('Enter the destination room code'); return; }
    const newKind = encodePortal(to, pmAccess.trim(), pmHidden, pmMessage.trim());
    it.portalTo = to; it.portalCode = pmAccess.trim() || undefined; it.portalHidden = pmHidden; it.portalMessage = pmMessage.trim() || undefined;
    supabase?.from('room_items').update({ kind: newKind }).eq('id', portalEditing).then(undefined, () => {});
    setPortalEditing(null); setPortalMaker(false); flashHint('Portal updated ✦');
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
  const uiRef = useRef({ decorOpen: false, placingKind: null as string | null, removeMode: false, rotateMode: false, tileMode: false, placingPrefab: false, triggerMode: false });
  useEffect(() => { uiRef.current = { decorOpen, placingKind, removeMode, rotateMode, tileMode, placingPrefab: !!placingPrefab, triggerMode: sTriggerMode }; }, [decorOpen, placingKind, removeMode, rotateMode, tileMode, placingPrefab, sTriggerMode]);
  useEffect(() => { sTriggerTilesRef.current = new Set(sTriggerTiles); }, [sTriggerTiles]);
  const [isMod, setIsMod] = useState(false);
  const [isSuper, setIsSuper] = useState(false);   // super-admin → can open the Admin panel + grant admins
  const [adminOpen, setAdminOpen] = useState(false);
  const [jarTotal, setJarTotal] = useState(0);     // Town money jar — real money spent all-time ($)
  const [myCount, setMyCount] = useState(0);
  const [hint, setHint] = useState('');
  const flashHint = (t: string) => { setHint(t); setTimeout(() => setHint(''), 1900); };

  // ---- staked arena escrow ---- (client-side, like the rest of the economy; server authority is a later pass)
  const ARENA_KEY = 'ouroo_arena';
  const writeArena = (e: { slug: string; stake: number; balance: number } | null) => {
    arenaRef.current = e; setArenaBal(e ? e.balance : null);
    try { e ? localStorage.setItem(ARENA_KEY, JSON.stringify(e)) : localStorage.removeItem(ARENA_KEY); } catch { /* ignore */ }
  };
  const setArenaBalance = (balance: number) => { const e = arenaRef.current; if (e) writeArena({ ...e, balance }); };
  // Bank the current escrow back into the wallet and clear it (cash out / eject / leave).
  const cashOutArena = () => { const e = arenaRef.current; if (!e) return 0; if (e.balance > 0) addBalance(e.balance); writeArena(null); return e.balance; };
  // On load: if there's a dangling escrow, keep it if we reloaded inside that arena, else bank it back (crash/refresh safety).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(ARENA_KEY); if (!raw) return;
      const e = JSON.parse(raw) as { slug: string; stake: number; balance: number };
      if (!e || typeof e.balance !== 'number') return;
      if (e.slug === room) { arenaRef.current = e; setArenaBal(e.balance); }
      else { if (e.balance > 0) addBalance(e.balance); localStorage.removeItem(ARENA_KEY); }
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Player-to-player interaction system ──
  const [interactPrompt, setInteractPrompt] = useState<InteractPeer | null>(null);
  const [interactRequest, setInteractRequest] = useState<InteractPeer | null>(null);
  const [interactWaiting, setInteractWaiting] = useState(false);
  const [interactSession, setInteractSession] = useState<{ peer: InteractPeer; mode: 'menu' | 'chat' | 'gift' | 'trade' } | null>(null);
  const interactSessionRef = useRef<{ peer: InteractPeer; mode: 'menu' | 'chat' | 'gift' | 'trade' } | null>(null);
  useEffect(() => { interactSessionRef.current = interactSession; }, [interactSession]);
  const [privateMsgs, setPrivateMsgs] = useState<{ handle: string; text: string; mine: boolean }[]>([]);
  const [privateInput, setPrivateInput] = useState('');
  const [myOffer, setMyOffer] = useState<TradeOffer | null>(null);
  const myOfferRef = useRef<TradeOffer | null>(null);
  const [theirOffer, setTheirOffer] = useState<TradeOffer | null>(null);
  const theirOfferRef = useRef<TradeOffer | null>(null);
  const myTradeConfirmedRef = useRef(false);
  const theirTradeConfirmedRef = useRef(false);
  const [myTradeConfirmed, setMyTradeConfirmed] = useState(false);
  const [theirTradeConfirmed, setTheirTradeConfirmed] = useState(false);
  const [peerMode, setPeerMode] = useState<'chat' | 'gift' | 'trade' | null>(null);
  const [giftTab, setGiftTab] = useState<'item' | 'crystals' | 'furni'>('item');
  const [tradeTab, setTradeTab] = useState<'item' | 'crystals' | 'furni'>('item');
  const [offerCrystals, setOfferCrystals] = useState('');

  // ── NPC interaction (gift only; no accept/decline needed) ──
  const [npcInteract, setNpcInteract] = useState<{ handle: string; nid: string; mode: 'prompt' | 'gift' } | null>(null);
  const [npcGiftItem, setNpcGiftItem] = useState<string | null>(null);
  const sendNpcGift = () => {
    if (!npcInteract || !npcGiftItem) return;
    if (!takeItem(npcGiftItem)) { flashHint('Not enough items'); return; }
    const item = itemById(npcGiftItem);
    if (item) {
      const npc = npcsRef.current.find(n => (n.nid ?? n.handle) === npcInteract.nid);
      if (npc) {
        const ef = item.effect; const now = Date.now();
        if (ef.type === 'sway') {
          npc.swayIntensity = ef.intensity; npc.swayExpiry = now + ef.durationMs;
          npc.bubble = ['*hic*', 'woah~', '...heh', 'woozy'][Math.floor(Math.random() * 4)];
          npc.bubbleLife = BUBBLE_FRAMES;
        } else if (ef.type === 'speed') {
          npc.speedMult = ef.multiplier; npc.speedExpiry = now + ef.durationMs;
          npc.bubble = ["on it!", "woo!", "zoom~", "let's go!"][Math.floor(Math.random() * 4)];
          npc.bubbleLife = BUBBLE_FRAMES;
        }
      }
    }
    flashHint(`Gifted ${item?.emoji ?? ''} ${item?.name ?? npcGiftItem} to ${npcInteract.handle}`);
    setNpcGiftItem(null); setNpcInteract(null);
  };

  const closeInteract = (notify = true) => {
    if (notify && interactSessionRef.current) {
      channelRef.current?.send({ type: 'broadcast', event: 'interact_close', payload: { from: selfRef.current.id, to: interactSessionRef.current.peer.id } });
    }
    setInteractPrompt(null); setInteractRequest(null); setInteractWaiting(false);
    setInteractSession(null); interactSessionRef.current = null;
    setPrivateMsgs([]); setPrivateInput('');
    setMyOffer(null); setTheirOffer(null);
    myOfferRef.current = null; theirOfferRef.current = null;
    myTradeConfirmedRef.current = false; theirTradeConfirmedRef.current = false;
    setMyTradeConfirmed(false); setTheirTradeConfirmed(false);
    setPeerMode(null); setGiftTab('item'); setTradeTab('item'); setOfferCrystals('');
  };
  const broadcastMode = (mode: 'chat' | 'gift' | 'trade' | null) => {
    const sess = interactSessionRef.current;
    if (!sess || !channelRef.current) return;
    channelRef.current.send({ type: 'broadcast', event: 'interact_mode', payload: { from: selfRef.current.id, to: sess.peer.id, mode } });
  };
  const broadcastItemEffect = () => {
    if (!channelRef.current) return;
    const { intensity: swayIntensity, expiresAt: swayExpiry } = getSwayEffect();
    const { multiplier: speedMult, expiresAt: speedExpiry } = getSpeedEffect();
    const me = selfRef.current;
    channelRef.current.send({ type: 'broadcast', event: 'item_effect', payload: { id: me.id, swayIntensity, swayExpiry, speedMult, speedExpiry } });
    channelRef.current.track({ id: me.id, handle: me.handle, skinId: me.skinId, fx: +me.fx.toFixed(2), fy: +me.fy.toFixed(2), lvl: me.lvl, swayIntensity, swayExpiry, speedMult, speedExpiry, fly: flyRef.current ? 1 : 0, ...combatTrack() });
  };
  // ---- combat ----
  // The combat fields we attach to every presence track() so joiners/movers see health bars + held weapon.
  const combatTrack = () => { const h = getHP(); return { hp: h.hp, maxHp: h.max, absorb: h.absorb, wp: equippedWeaponSpec().id }; };
  // Push my current hp + weapon to the room (after a hit, heal, equip change, or respawn). The live 'hp'
  // BROADCAST fires every time (cheap, snappy bars). The presence TRACK is throttled — mid-session re-track
  // churns presence (see the movement loop's "bounced the channel" note), and in a fight broadcastHP runs
  // on every hit/heal, so re-tracking each time made avatars flicker/vanish. Presence is just the joiner
  // fallback, so once every few seconds (or when forced, e.g. respawn) is plenty.
  const lastHpTrackRef = useRef(0);
  const broadcastHP = (forceTrack = false) => {
    const ch = channelRef.current; if (!ch || !joinedRef.current) return;
    const me = selfRef.current; const h = getHP(); const wp = equippedWeaponSpec().id;
    ch.send({ type: 'broadcast', event: 'hp', payload: { id: me.id, hp: h.hp, maxHp: h.max, absorb: h.absorb, wp } });
    const now = Date.now();
    if (!forceTrack && now - lastHpTrackRef.current < 4000) return;   // skip the heavy presence re-track
    lastHpTrackRef.current = now;
    const swEf = getSwayEffect(); const spEf = getSpeedEffect();
    ch.track({ id: me.id, handle: me.handle, skinId: me.skinId, fx: +me.fx.toFixed(2), fy: +me.fy.toFixed(2), lvl: me.lvl, swayIntensity: swEf.intensity, swayExpiry: swEf.expiresAt, speedMult: spEf.multiplier, speedExpiry: spEf.expiresAt, fly: flyRef.current ? 1 : 0, ...combatTrack() });
  };
  broadcastHPRef.current = broadcastHP;
  const spawnDmg = (fx: number, fy: number, z: number, amount: number, color: string) => {
    dmgFxRef.current.push({ fx, fy, z, text: `-${Math.max(1, Math.round(amount))}`, color, life: 54 });
    if (dmgFxRef.current.length > 24) dmgFxRef.current.shift();
  };
  // Reset to the room's spawn tile at full hp and lock movement for the knockout window.
  const respawnSelf = () => {
    const me = selfRef.current;
    const sp = planSpawn(planById(roomMetaRef.current.plan ?? 'salao'));
    me.fx = sp.gx; me.fy = sp.gy; me.tx = sp.gx; me.ty = sp.gy; me.lvl = sp.lvl; me.z = sp.lvl; me.path = [];
    const hp = respawnHP(); setSelfHp(hp);
    koUntilRef.current = Date.now() + KO_MS; setKoUntil(koUntilRef.current);
    broadcastHP(true);   // force the presence re-track so everyone sees the new spawn position + full hp at once
    const ch = channelRef.current;
    if (ch && joinedRef.current) ch.send({ type: 'broadcast', event: 'pos', payload: { id: me.id, h: me.handle, s: me.skinId, icon: me.icon ?? undefined, fx: +me.fx.toFixed(2), fy: +me.fy.toFixed(2), lvl: me.lvl, tp: true } });
  };
  // Someone swung at me → MY client computes the damage to MY hp (authoritative over my own health).
  const onIncomingAttack = (pl: Record<string, unknown>) => {
    const me = selfRef.current;
    if (String(pl.to ?? '') !== me.id) return;            // only the target processes it
    if (!roomMetaRef.current.combat) return;              // safety: ignore outside PvP rooms
    if (koUntilRef.current > Date.now()) return;          // already down — invulnerable while respawning
    if (arenaCountdownRef.current !== null) return;       // invulnerable during entry countdown
    const wp = weaponOf(String(pl.wp ?? 'fists'));
    const res = applyDamage(wp, equippedShieldSpec());
    setSelfHp({ hp: res.hp, max: res.max, absorb: res.absorb });
    me.hitUntil = Date.now() + 220;
    spawnDmg(me.fx, me.fy, me.z, res.taken, '#ff5a5a');
    if (pl.kb && !res.dead) {
      const ax = Number(pl.ax ?? me.fx), ay = Number(pl.ay ?? me.fy);
      const dx = me.fx - ax, dy = me.fy - ay, len = Math.hypot(dx, dy) || 1;
      const nx = clampTile(Math.round(me.fx + dx / len)), ny = clampTile(Math.round(me.fy + dy / len));
      me.fx = nx; me.fy = ny; me.tx = nx; me.ty = ny; me.path = [];
      channelRef.current?.send({ type: 'broadcast', event: 'pos', payload: { id: me.id, h: me.handle, s: me.skinId, icon: me.icon ?? undefined, fx: nx, fy: ny, lvl: me.lvl, wp: equippedWeaponSpec().id } });
    }
    broadcastHP();
    if (res.dead) {
      const killer = String(pl.from ?? '');
      channelRef.current?.send({ type: 'broadcast', event: 'ko', payload: { id: me.id, by: killer } });
      // ── Arena death: hand the killer the bounty (smaller of the two bets), bank the remainder, get ejected.
      //    Never the normal wallet loot here — only the escrowed stake is ever at risk in an arena. ──
      if (roomMetaRef.current.arena) {
        if (arenaRef.current) {
          const killerStake = Math.max(0, Number(pl.stake) || 0);
          const bounty = Math.min(killerStake, arenaRef.current.balance);
          setArenaBalance(arenaRef.current.balance - bounty);   // killer takes the bounty; the rest is yours to bank
          if (bounty > 0) channelRef.current?.send({ type: 'broadcast', event: 'loot', payload: { from: me.id, to: killer, crystals: bounty, arena: true } });
          flashHint(bounty > 0 ? `Killed — lost ${CURRENCY_SYMBOL}${bounty.toLocaleString('pt-PT')}, banking the rest ✦` : 'Killed — ejected');
        }
        respawnHP(); setSelfHp(getHP());   // heal for next time
        switchRoom(roomOf('town'));   // ejected; switchRoom banks any remaining escrow
        return;
      }
      // ── Normal PvP: drop 5% of your wallet to the killer. ──
      const loot = computeLoot();
      dropLoot(loot);
      if (!lootIsEmpty(loot)) channelRef.current?.send({ type: 'broadcast', event: 'loot', payload: { from: me.id, to: killer, crystals: loot.crystals, items: loot.items } });
      if (!lootIsEmpty(loot)) {
        const parts: string[] = [];
        if (loot.crystals > 0) parts.push(`${CURRENCY_SYMBOL}${loot.crystals.toLocaleString('pt-PT')}`);
        for (const [id, q] of Object.entries(loot.items)) { const it = itemById(id); parts.push(`${it?.emoji ?? ''} ${it?.name ?? id}${q > 1 ? ` ×${q}` : ''}`.trim()); }
        setKoMsg(`Lost ${parts.join(', ')} ✦`);
      }
      respawnSelf();
    }
  };
  // Swing my equipped weapon (F key / punch button). No aiming: hits EVERY player within reach — a
  // radius, not a direction. Fists reach 1 tile; weapons reach further (weapon.range). Open PvP in
  // combat rooms; ALSO whittles down hazardous NPCs anywhere one is placed (huntable).
  const swingWeapon = () => {
    const me = selfRef.current;
    const pvp = roomMetaRef.current.combat;
    if (!pvp && !huntableRef.current) return;                 // nothing to swing at here
    if (roomMetaRef.current.arena && !arenaRef.current) return;   // must place a bet to fight in the arena
    if (koUntilRef.current > Date.now()) return;              // can't swing while knocked out
    if (arenaCountdownRef.current !== null) return;           // can't swing during entry countdown
    const wp = equippedWeaponSpec();
    if (wp.id === 'pistol' && itemCount('pistol_ammo') <= 0) { flashHint('No ammo — buy Pistol Ammo ✦'); return; }
    const now = Date.now();
    if (now - lastAttackRef.current < wp.cooldownMs) return;  // weapon still on cooldown
    lastAttackRef.current = now;
    if (wp.id === 'pistol') consumeItem('pistol_ammo');       // spend one shot on commit
    me.attackUntil = now + 280;                               // the swing animates even on a whiff
    musicRef.current?.punch();
    const mgx = clampTile(me.fx), mgy = clampTile(me.fy);
    // Flush a fresh position first so all observers have an accurate snapshot at hit-time.
    channelRef.current?.send({ type: 'broadcast', event: 'pos', payload: { id: me.id, h: me.handle, s: me.skinId, icon: me.icon ?? undefined, fx: +me.fx.toFixed(2), fy: +me.fy.toFixed(2), lvl: me.lvl, wp: wp.id } });
    const spiritKnockback = wp.id === 'fists' && getSwayIntensity() >= 10;
    if (pvp && !npcTargetRef.current) remotesRef.current.forEach((r, rid) => {
      if (r.koUntil && r.koUntil > now) return;               // skip players already down
      if (tileDist(mgx, mgy, clampTile(r.tx), clampTile(r.ty)) > wp.range) return;   // out of reach
      channelRef.current?.send({ type: 'broadcast', event: 'attack', payload: { from: me.id, to: rid, wp: wp.id, style: wp.style, stake: arenaRef.current?.stake ?? 0, ...(spiritKnockback ? { kb: 1, ax: me.fx, ay: me.fy } : {}) } });
      // Optimistic local prediction: drop their bar + flash NOW instead of after the hp round-trip.
      // The victim is authoritative — their 'hp' broadcast reconciles this a moment later.
      if (r.hp != null) r.hp = Math.max(0, r.hp - wp.damage);
      r.hpStamp = now;   // claim hp as live so presence sync doesn't flicker it back up before the broadcast lands
      r.hitUntil = now + 220;
      if (wp.style === 'magic') {
        projRef.current.push({ fx0: me.fx, fy0: me.fy, z0: me.z + 0.4, fx1: r.fx, fy1: r.fy, z1: r.z + 0.4, life: 18, max: 18, color: '#b98cff' });
      } else if (wp.style === 'gun') {
        projRef.current.push({ fx0: me.fx, fy0: me.fy, z0: me.z + 0.4, fx1: r.fx, fy1: r.fy, z1: r.z + 0.4, life: 10, max: 10, color: '#ffd700', style: 'gun' });
      }
    });
    // Hazardous NPCs — fought per-player, entirely local. Same reach rule as PvP (tileDist ≤ wp.range:
    // fists touch, weapons reach), but measured to the NPC's LIVE tile (fx/fy) since it's locally
    // simulated — using its lagging path-target would whiff on an NPC that's visually adjacent.
    for (const n of npcsRef.current) {
      const nid = n.nid; if (!nid || !n.hz || n.defeated || n.peaceful || n.hp == null) continue;
      if (npcTargetRef.current && npcTargetRef.current.nid !== nid) continue;   // targeting mode: only strike the chosen NPC
      if (tileDist(mgx, mgy, clampTile(n.fx), clampTile(n.fy)) > wp.range) continue;
      const armor = n.hz.armor ?? 0;
      const dmg = armor > 0 ? Math.max(1, Math.round(wp.damage * (1 - armor / 100))) : wp.damage;   // armour mitigates like a worn shield
      n.hp = Math.max(0, n.hp - dmg); npcHpRef.current.set(nid, n.hp);
      n.hitUntil = now + 220;
      if (spiritKnockback && n.hp > 0) {
        const dx = n.fx - me.fx, dy = n.fy - me.fy, len = Math.hypot(dx, dy) || 1;
        n.fx = clampTile(Math.round(n.fx + dx / len)); n.fy = clampTile(Math.round(n.fy + dy / len));
        n.tx = n.fx; n.ty = n.fy; n.path = [];
        channelRef.current?.send({ type: 'broadcast', event: 'npc_kb', payload: { nid, fx: n.fx, fy: n.fy } });
      }
      spawnDmg(n.fx, n.fy, n.z, dmg, '#ffd84a');
      if (wp.style === 'magic') projRef.current.push({ fx0: me.fx, fy0: me.fy, z0: me.z + 0.4, fx1: n.fx, fy1: n.fy, z1: n.z + 0.4, life: 18, max: 18, color: '#b98cff' });
      else if (wp.style === 'gun') projRef.current.push({ fx0: me.fx, fy0: me.fy, z0: me.z + 0.4, fx1: n.fx, fy1: n.fy, z1: n.z + 0.4, life: 10, max: 10, color: '#ffd700', style: 'gun' });
      if (n.hp <= 0) defeatNpc(n);
    }
    // Swing animation goes last — purely cosmetic, lower priority than pos/attack/hp in the send queue.
    channelRef.current?.send({ type: 'broadcast', event: 'swing', payload: { id: me.id, wp: wp.id } });
  };
  swingWeaponRef.current = swingWeapon;

  // ── hazardous NPC helpers ── per-player defeat state lives in localStorage, keyed by room+nid.
  // e = ever beaten (permanent — gates no-refarm reward + 'once' peace). u = "down until" timestamp
  // (ms): a respawning NPC is dead until then; u < 0 means permanently down (policy 'once').
  const NOREFARM_RESPAWN_MS = 20_000;
  const npcDefeatKey = (nid: string) => `ouroo_npc_${roomMetaRef.current.slug}_${nid}`;
  const loadNpcDefeat = (nid: string): { e: boolean; u: number } => {
    try { const o = JSON.parse(localStorage.getItem(npcDefeatKey(nid)) || ''); return { e: !!o.e, u: Number(o.u) || 0 }; } catch { return { e: false, u: 0 }; }
  };
  const saveNpcDefeat = (nid: string, e: boolean, u: number) => { try { localStorage.setItem(npcDefeatKey(nid), JSON.stringify({ e, u })); } catch { /* ignore */ } };

  // Fire the one-shot on-kill trigger (toast / lore beat / skin grant / portal-flag unlock). Guarded
  // by its own localStorage flag so it only ever pops once per player, even on a farmable NPC.
  const fireKillTrigger = (nid: string, trig: KillTrigger, handle: string) => {
    const fk = `ouroo_npckill_${roomMetaRef.current.slug}_${nid}`;
    try { if (localStorage.getItem(fk) === '1') return; localStorage.setItem(fk, '1'); } catch { /* ignore */ }
    if (trig.kind === 'toast') { pushFeed('💀', trig.text); flashHint(trig.text); }
    else if (trig.kind === 'beat') { try { localStorage.setItem(`ouroo_lore_${roomMetaRef.current.slug}_${nid}`, '0'); } catch { /* ignore */ } pushFeed(handle, trig.text); flashHint(trig.text); }
    else if (trig.kind === 'skin') { grantSkin(trig.skinId); flashHint(`Unlocked skin: ${trig.skinId} ✦`); }
    else if (trig.kind === 'portal') { try { localStorage.setItem(`ouroo_flag_${trig.flag}`, '1'); } catch { /* ignore */ } flashHint('A way forward opens…'); }
  };

  // Killing blow landed on a hazardous NPC: grant the reward (subject to policy), fire the trigger,
  // and record the defeat. 'once' → peaceful forever; 'no-refarm' → reward only the first time;
  // 'farmable' → reward every kill, respawns on a timer (handled in rebuildNpcs / the update loop).
  const defeatNpc = (n: typeof npcsRef.current[number]) => {
    const nid = n.nid, h = n.hz; if (!nid || !h) return;
    const prior = loadNpcDefeat(nid).e;                       // already beaten before this kill?
    const rewardable = h.policy === 'farmable' || !prior;     // no-refarm/once only pay the first time
    if (rewardable) {
      if (h.loot.crystals) addBalance(h.loot.crystals);
      for (const [id, q] of Object.entries(h.loot.items ?? {})) for (let i = 0; i < q; i++) grantItem(id);
      if (h.onKill) fireKillTrigger(nid, h.onKill, n.handle);
      const bits = [h.loot.crystals ? `${h.loot.crystals} ${CURRENCY_SYMBOL}` : '', ...Object.entries(h.loot.items ?? {}).map(([id, q]) => `${itemById(id)?.name ?? id}${q > 1 ? `×${q}` : ''}`)].filter(Boolean);
      const nname = n.handle || 'NPC';
      flashHint(bits.length ? `Defeated ${nname} — looted ${bits.join(', ')}` : `Defeated ${nname}`);
    } else flashHint(`Defeated ${n.handle || 'NPC'} again`);
    // schedule the respawn: 'once' → permanent peace (-1); others come back and stay a threat.
    const perma = h.policy === 'once';
    const downUntil = perma ? -1 : Date.now() + (h.policy === 'farmable' ? (h.respawnMs ?? 600_000) : NOREFARM_RESPAWN_MS);
    saveNpcDefeat(nid, true, downUntil);
    npcHpRef.current.delete(nid);
    n.hp = 0; n.defeated = true; n.respawnAt = perma ? Infinity : downUntil; n.path = [];
    if (npcTargetRef.current?.nid === nid) { npcTargetRef.current = null; setNpcTarget(null); }
    musicRef.current?.chime();
    // death puff
    for (let i = 0; i < 8; i++) { if (dmgFxRef.current.length < 24) dmgFxRef.current.push({ fx: n.fx, fy: n.fy, z: n.z + Math.random() * 0.6, text: '✦', color: '#ffd84a', life: 30 + (i * 2) }); }
    if (perma) { n.defeated = false; n.peaceful = true; n.lines = (h.deadLines && h.deadLines.length) ? h.deadLines : n.lines; }
    rebuildHuntable();
  };

  // NPC auto-swings at me (contact damage). Reuses MY victim-side damage path so my shield/absorb/
  // respawn all apply. Dying to an NPC costs the same 5% crystal share as a PvP death (no items —
  // there is no recipient to claim them).
  const npcAttackPlayer = (n: typeof npcsRef.current[number]) => {
    const h = n.hz; if (!h || !h.contactDamage) return;
    const me = selfRef.current;
    if (koUntilRef.current > Date.now()) return;
    if (arenaCountdownRef.current !== null) return;
    const synthetic: WeaponSpec = { id: 'npc', name: n.handle, emoji: '⚔', damage: h.contactDamage, range: 1, cooldownMs: h.attackCooldownMs, style: 'melee' };
    const res = applyDamage(synthetic, equippedShieldSpec());
    setSelfHp({ hp: res.hp, max: res.max, absorb: res.absorb });
    me.hitUntil = Date.now() + 220; n.attackUntil = Date.now() + 280;
    spawnDmg(me.fx, me.fy, me.z, res.taken, '#ff5a5a');
    if (roomMetaRef.current.combat) broadcastHP();             // let other players see my bar drop (PvP rooms)
    if (res.dead) { const loot = computeLoot(); if (loot.crystals > 0) { spend(loot.crystals); setKoMsg(`Lost ${CURRENCY_SYMBOL}${loot.crystals.toLocaleString('pt-PT')} ✦`); } respawnSelf(); }
  };

  // Recompute whether any fightable hazardous NPC is present (drives the combat HUD outside PvP rooms).
  const rebuildHuntable = () => {
    const on = npcsRef.current.some(n => n.hz && !n.peaceful && !n.defeated);
    huntableRef.current = on; setHuntable(on);
  };

  const executeTrade = (my: TradeOffer, their: TradeOffer) => {
    let gave = false;
    if (my.type === 'item') gave = takeItem(my.id);
    else if (my.type === 'furni') gave = consumeFurni(my.kind);
    else gave = spend(my.amount);
    if (gave) {
      if (their.type === 'item') grantItem(their.id);
      else if (their.type === 'furni') grantFurni(their.kind, 1);
      else addBalance(their.amount);
      const label = their.type === 'item' ? `${itemById(their.id)?.emoji ?? ''} ${itemById(their.id)?.name ?? their.id}` : their.type === 'furni' ? `${defOf(their.kind).emoji} ${defOf(their.kind).name}` : `${CURRENCY_SYMBOL}${their.amount}`;
      flashHint(`Trade complete! Received ${label}`);
    }
    setMyOffer(null); setTheirOffer(null);
    myOfferRef.current = null; theirOfferRef.current = null;
    myTradeConfirmedRef.current = false; theirTradeConfirmedRef.current = false;
    setMyTradeConfirmed(false); setTheirTradeConfirmed(false);
    setInteractSession(s => s ? { ...s, mode: 'menu' } : null);
  };
  const sendInteractRequest = () => {
    if (!interactPrompt || !channelRef.current) return;
    channelRef.current.send({ type: 'broadcast', event: 'interact_req', payload: { from: selfRef.current.id, to: interactPrompt.id, handle: selfRef.current.handle } });
    setInteractWaiting(true);
  };
  const acceptInteract = () => {
    if (!interactRequest || !channelRef.current) return;
    const peer = interactRequest;
    channelRef.current.send({ type: 'broadcast', event: 'interact_res', payload: { from: selfRef.current.id, to: peer.id, handle: selfRef.current.handle, accept: true } });
    setInteractRequest(null);
    const sess = { peer, mode: 'menu' as const };
    setInteractSession(sess); interactSessionRef.current = sess;
  };
  const declineInteract = () => {
    if (!interactRequest || !channelRef.current) return;
    channelRef.current.send({ type: 'broadcast', event: 'interact_res', payload: { from: selfRef.current.id, to: interactRequest.id, handle: selfRef.current.handle, accept: false } });
    setInteractRequest(null);
  };
  const sendPrivateMsg = (e: React.FormEvent) => {
    e.preventDefault();
    const sess = interactSessionRef.current;
    if (!sess || !privateInput.trim() || !channelRef.current) return;
    const text = privateInput.trim().slice(0, 300);
    channelRef.current.send({ type: 'broadcast', event: 'interact_chat', payload: { from: selfRef.current.id, to: sess.peer.id, handle: selfRef.current.handle, text } });
    setPrivateMsgs(prev => [...prev, { handle: selfRef.current.handle, text, mine: true }]);
    setPrivateInput('');
  };
  const sendGift = () => {
    const sess = interactSessionRef.current;
    if (!sess || !myOffer || !channelRef.current) return;
    if (myOffer.type === 'item') {
      if (!takeItem(myOffer.id)) { flashHint('Not enough items'); return; }
      channelRef.current.send({ type: 'broadcast', event: 'interact_gift', payload: { from: selfRef.current.id, to: sess.peer.id, handle: selfRef.current.handle, itemId: myOffer.id } });
      const item = itemById(myOffer.id);
      flashHint(`Gifted ${item?.emoji ?? ''} ${item?.name ?? myOffer.id} to ${sess.peer.handle}`);
    } else if (myOffer.type === 'crystals') {
      if (!spend(myOffer.amount)) { flashHint('Not enough Cristais'); return; }
      channelRef.current.send({ type: 'broadcast', event: 'interact_gift_crystals', payload: { from: selfRef.current.id, to: sess.peer.id, handle: selfRef.current.handle, amount: myOffer.amount } });
      flashHint(`Gifted ${CURRENCY_SYMBOL}${myOffer.amount} to ${sess.peer.handle}`);
    } else if (myOffer.type === 'furni') {
      if (!consumeFurni(myOffer.kind)) { flashHint('Not enough furniture'); return; }
      channelRef.current.send({ type: 'broadcast', event: 'interact_gift_furni', payload: { from: selfRef.current.id, to: sess.peer.id, handle: selfRef.current.handle, kind: myOffer.kind } });
      const f = defOf(myOffer.kind);
      flashHint(`Gifted ${f.emoji} ${f.name} to ${sess.peer.handle}`);
    }
    setMyOffer(null); myOfferRef.current = null; setOfferCrystals('');
    setInteractSession(s => s ? { ...s, mode: 'menu' } : null);
  };
  const sendTradeOffer = (offer: TradeOffer) => {
    const sess = interactSessionRef.current;
    if (!sess || !channelRef.current) return;
    channelRef.current.send({ type: 'broadcast', event: 'interact_trade_offer', payload: { from: selfRef.current.id, to: sess.peer.id, offer } });
  };
  const confirmTrade = () => {
    const sess = interactSessionRef.current;
    if (!sess || !myOfferRef.current || !channelRef.current) return;
    myTradeConfirmedRef.current = true;
    setMyTradeConfirmed(true);
    channelRef.current.send({ type: 'broadcast', event: 'interact_trade_accept', payload: { from: selfRef.current.id, to: sess.peer.id } });
    if (theirTradeConfirmedRef.current && theirOfferRef.current) {
      executeTrade(myOfferRef.current, theirOfferRef.current);
    }
  };

  // You can build if: you're a mod, the owner, an open ("everyone") room, or a granted handle.
  const canBuild = canBuildIn(roomMeta, myOwnerId, myHandle, isMod);
  const locked = !canBuild;
  // During the tutorial (before an account + character exist) the world is stripped back to just the
  // Oracle + the first game — the Rooms / wallet / Decorate tools unlock once onboarding is done.
  const tutorial = onboarding !== 'done';
  // Same check from inside canvas closures (reads refs, not render state).
  const canBuildHere = () => canBuildIn(roomMetaRef.current, ownerIdRef.current, myHandleRef.current, modRef.current);
  const [invOpen, setInvOpen] = useState(false);
  const [emoteOpen, setEmoteOpen] = useState(false);
  const [currentEmote, setCurrentEmote] = useState<string | null>(null);
  const wallet = useWallet();
  // Guests can walk + chat; building/creating needs a Discord account → kick off sign-in. (`user` is
  // declared earlier, above the duel-lobby block, so its effect deps can reference it.)
  const signedIn = !!user;
  // Character-creator step: once they've chosen Discord (signed in) or guest, throw open the wardrobe.
  useEffect(() => { if (onboarding === 'character' && (signedIn || guestChosen) && !charDone) setInvOpen(true); }, [onboarding, signedIn, guestChosen, charDone]);
  // Town money jar — fetch the all-time total whenever you enter Town (0 until purchases are wired up).
  useEffect(() => { if (room === 'town') getJarTotal().then(setJarTotal); }, [room]);
  const signedInRef = useRef(false);
  useEffect(() => { signedInRef.current = signedIn; }, [signedIn]);
  const requireAccount = (): boolean => { if (signedInRef.current) return true; flashHint('Create an account to build 🛸'); signInWithDiscord(); return false; };

  const activateEmote = (name: string | null) => {
    const me = selfRef.current;
    me.emote = name; me.emoteAf = 0;
    setCurrentEmote(name);
    setEmoteOpen(false);
    if (channelRef.current && joinedRef.current) {
      channelRef.current.send({ type: 'broadcast', event: 'emote', payload: { id: me.id, em: name } });
    }
  };

  // Equip a skin or custom icon on the live avatar and broadcast it to the room.
  const equipAppearance = (id: string) => {
    const me = selfRef.current; me.skinId = id;
    const ap = resolveAppearance(id); me.icon = ap.kind === 'icon' ? ap.spec : null;
    const swEf = getSwayEffect(); const spEf = getSpeedEffect();
    channelRef.current?.track({ id: me.id, handle: me.handle, skinId: me.skinId, icon: me.icon ?? undefined, fx: +me.fx.toFixed(2), fy: +me.fy.toFixed(2), lvl: me.lvl, swayIntensity: swEf.intensity, swayExpiry: swEf.expiresAt, speedMult: spEf.multiplier, speedExpiry: spEf.expiresAt, fly: flyRef.current ? 1 : 0 });
  };

  const pushFeed = (handle: string, text: string) => { const id = ++feedId.current; setFeed(f => [...f.slice(-5), { id, handle, text }]); };
  const say = (raw: string) => {
    const v = validateMessage(raw); if (!v.ok) { flashHint(v.error); return; }
    const text = v.value.slice(0, 120); const me = selfRef.current; me.bubble = text; me.bubbleLife = BUBBLE_FRAMES;
    channelRef.current?.send({ type: 'broadcast', event: 'say', payload: { id: me.id, text } });
    pushFeed(me.handle, text); setMsg('');
  };
  const switchRoom = (def: RoomDef) => {
    setShowRooms(false); if (def.slug === room) return;
    // Leaving an arena always banks the escrow (manual cash-out or post-eject remainder).
    if (roomMetaRef.current.arena && arenaRef.current) { const banked = cashOutArena(); if (banked > 0) flashHint(`Cashed out ${CURRENCY_SYMBOL}${banked.toLocaleString('pt-PT')} ✦`); }
    // Eagerly announce departure so others drop the avatar immediately — don't wait for the effect cleanup.
    try { const me = selfRef.current; channelRef.current?.send({ type: 'broadcast', event: 'leave', payload: { id: me.id } }); channelRef.current?.untrack(); } catch { /* ignore */ }
    closeInteract(false);
    npcTargetRef.current = null; setNpcTarget(null); setNpcTargetPrompt(null);
    const sp = planSpawn(planById(def.plan));
    const me = selfRef.current; me.fx = sp.gx; me.fy = sp.gy; me.tx = sp.gx; me.ty = sp.gy; me.z = sp.lvl; me.lvl = sp.lvl; me.path = []; me.bubble = ''; me.bubbleLife = 0;
    remotesRef.current.clear(); itemsRef.current = []; setMyCount(0); setPlacingKind(null); setRemoveMode(false); setRotateMode(false); setPlaceElev(0); setDecorOpen(false);
    lastPortalKeyRef.current = `${sp.gx},${sp.gy}`;   // don't auto-fire a portal we happen to spawn on; arm on the first step off
    setRoomMeta(def); setRoom(def.slug);
  };
  const switchRoomRef = useRef(switchRoom); useEffect(() => { switchRoomRef.current = switchRoom; });   // latest switchRoom for the animation loop

  // ---- arena staking ---- each tier has a bet band [min, max] (max 0 = no ceiling).
  const arenaBand = (def: RoomDef) => ({ min: def.arenaMin ?? 10, max: def.arenaMax && def.arenaMax > 0 ? def.arenaMax : Infinity });
  // Entering an arena (and not already staked) → ask for a bet. Leaving / already-staked → no prompt.
  useEffect(() => {
    if (roomMeta.arena && !arenaRef.current && !tutorial) { setStakeInput(''); setStakePrompt(true); }
    else setStakePrompt(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room, roomMeta.arena]);
  const confirmStake = () => {
    const def = roomMetaRef.current; const { min, max } = arenaBand(def);
    const amt = Math.floor(Number(stakeInput) || 0);
    if (amt < min) { flashHint(`Minimum bet ${CURRENCY_SYMBOL}${min.toLocaleString('pt-PT')}`); return; }
    if (amt > max) { flashHint(`This tier caps at ${CURRENCY_SYMBOL}${max.toLocaleString('pt-PT')}`); return; }
    if (getBalance() < amt) { flashHint('Not enough Cristais'); return; }
    spend(amt);
    writeArena({ slug: def.slug, stake: amt, balance: amt });
    setStakePrompt(false); setStakeInput('');
    flashHint(`Staked ${CURRENCY_SYMBOL}${amt.toLocaleString('pt-PT')} — fight to double it ⚔`);
    // Spawn as far from other players as possible.
    const others = [...remotesRef.current.values()];
    if (others.length > 0) {
      const S = solidRef.current, surf = surfRef.current;
      let bestKey = -1, bestDist = -1;
      for (let i = 0; i < GRID * GRID; i++) {
        if (S[i] || !surf[i]?.length) continue;
        const tx = i % GRID, ty = (i / GRID) | 0;
        let minDist = Infinity;
        for (const o of others) { const d = (o.fx - tx) ** 2 + (o.fy - ty) ** 2; if (d < minDist) minDist = d; }
        if (minDist > bestDist) { bestDist = minDist; bestKey = i; }
      }
      if (bestKey >= 0) {
        const me = selfRef.current, bx = bestKey % GRID, by = (bestKey / GRID) | 0;
        me.fx = bx; me.fy = by; me.tx = bx; me.ty = by; me.path = [];
      }
    }
    // Disappear from others' presence for the countdown window; reappear when it ends.
    channelRef.current?.untrack();
    arenaCountdownRef.current = 3; setArenaCountdown(3);
  };
  const declineStake = () => { setStakePrompt(false); switchRoom(roomOf('town')); };   // didn't bet → leave the arena
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
  const roomDefOf = (r: RoomRow): RoomDef => ({ slug: r.slug, name: r.name, accent: r.accent, floor: r.floor, owner: r.owner, buildAll: r.build_all, rights: r.rights, plan: r.plan, outdoor: OUTDOOR_SLUGS.has(r.slug), combat: r.combat_enabled, discoverable: r.discoverable });
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
    for (let i = items.length - 1; i >= 0; i--) { const up = items[i]; if (up.portalTo && up.gx === gx && up.gy === gy) return { gx, gy, code: up.portalCode || '', to: up.portalTo, user: true, message: up.portalMessage }; }
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
    portalFromRef.current = roomMetaRef.current.slug;   // remember origin so ingest can spawn near the return portal
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
  // Move the player off a portal tile to an adjacent walkable tile (used when they decline a message portal).
  const nudgeOffPortal = (pt: Portal) => {
    const me = selfRef.current;
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const nx = pt.gx + dx, ny = pt.gy + dy;
      if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID) continue;
      const k = ny * GRID + nx;
      if (!solidRef.current[k] && surfRef.current[k].length) { me.tx = nx; me.ty = ny; me.path = []; break; }
    }
    setPortalMessagePrompt(null);
  };
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
  const openPerms = (r: RoomRow) => {
    setPermsRoom(r); setPermsAll(r.build_all); setPermsPublic(r.public); setPermsList(r.rights ?? []); setPermsHandle(''); setPermsCombat(r.combat_enabled ?? false); setPermsDiscoverable(r.discoverable ?? false);
    setPermsArena(false); setPermsArenaMin('10'); setPermsArenaMax('0');   // load arena flag from its room_items marker (no DB column)
    supabase?.from('room_items').select('kind').eq('room', r.slug).like('kind', 'arena:%').limit(1).then(({ data }) => {
      const k = (data?.[0] as { kind?: string } | undefined)?.kind; if (!k) return;
      const p = k.split(':'); setPermsArena(true); setPermsArenaMin(String(Math.max(1, Number(p[1]) || 10))); setPermsArenaMax(String(Math.max(0, Number(p[2]) || 0)));
    }, () => {});
  };
  const addPermHandle = () => {
    const h = permsHandle.trim(); if (!h) return;
    if (!permsList.some(x => x.toLowerCase() === h.toLowerCase())) setPermsList(l => [...l, h]);
    setPermsHandle('');
  };
  const savePerms = async () => {
    if (!permsRoom) return;
    const list = Array.from(new Set(permsList.map(h => h.trim()).filter(Boolean)));
    const slug = permsRoom.slug;
    const aMin = Math.max(1, Math.floor(Number(permsArenaMin) || 10));
    const aMax = Math.max(0, Math.floor(Number(permsArenaMax) || 0));
    if (permsArena && aMax > 0 && aMin > aMax) { flashHint('Arena: min bet must be ≤ max'); return; }
    const combatFinal = permsCombat || permsArena;   // an arena is always a combat zone
    const ok = await updateRoomPerms(slug, permsAll, list, combatFinal, permsDiscoverable);
    if (!ok) { flashHint('Failed to save permissions'); return; }
    if (permsPublic !== permsRoom.public) await setRoomPublic(slug, permsPublic);   // flip public ↔ invite-only
    // Arena flag lives as a room_items marker (no DB column): clear any existing, then write the band if on.
    try {
      await supabase?.from('room_items').delete().eq('room', slug).like('kind', 'arena:%');
      if (permsArena) { const id = (crypto?.randomUUID?.() ?? `arena_${Date.now()}_${Math.floor(Math.random() * 1e9)}`); await supabase?.from('room_items').insert({ id, room: slug, kind: `arena:${aMin}:${aMax}`, x: 0, y: 0, created_by: deviceRef.current }); }
    } catch { /* ignore */ }
    // Reflect immediately in local lists + the live room if it's the one open.
    setMyRooms(rs => rs.map(r => r.slug === slug ? { ...r, build_all: permsAll, rights: list, public: permsPublic, combat_enabled: combatFinal, discoverable: permsDiscoverable } : r));
    if (room === slug) setRoomMeta(m => ({ ...m, buildAll: permsAll, rights: list, combat: combatFinal, discoverable: permsDiscoverable, arena: permsArena, arenaMin: permsArena ? aMin : undefined, arenaMax: permsArena ? aMax : undefined }));
    refreshRoomLists();   // public flag changed → refresh the public-room list (portal picker + browser)
    setPermsRoom(null); flashHint(permsArena ? 'Saved — room is now a staked arena ⚔' : 'Permissions saved ✓');
  };

  // recompute the heightmap (walkable height + solid mask) from items
  // Layered heightmap: each tile holds a sorted list of WALKABLE surface levels. Floor pieces sit at
  // elev 0 (cover the ground); floating pieces (elev>0) leave the ground exposed → a tunnel under +
  // a deck above. Solids block the whole tile.
  const rebuildHeight = () => {
    const surf = surfRef.current, S = solidRef.current, BT = blockTopRef.current; S.fill(0); BT.fill(0);
    for (let i = 0; i < surf.length; i++) surf[i].length = 0;
    const grounded = new Uint8Array(GRID * GRID); let peak = WALL_H;
    for (const it of (decorRef.current.length ? itemsRef.current.concat(decorRef.current) : itemsRef.current)) {
      if (it.gameSet) continue;   // set-game events are invisible behaviour markers — never block or raise a tile
      const d = defOf(it.kind); const [sw, sh] = effSpan(it.kind, it.dir || 0); const elev = it.elev || 0; const sit = sitHeight(it.kind);
      for (let du = 0; du < sw; du++) for (let dv = 0; dv < sh; dv++) {
        const gx = it.gx + du, gy = it.gy + dv; if (gx >= GRID || gy >= GRID) continue;
        const k = key(gx, gy); const base = planRef.current[k]; if (base < 0) continue;   // can't sit on a void tile
        if (base + elev + (d.h || 0) > peak) peak = base + elev + (d.h || 0);   // track the topmost point for the camera
        if (d.pass || (!d.walk && (d.cat === 'constr' || d.obscures) && elev >= 2)) { const top = base + elev + (d.h || 0); if (top > BT[k]) BT[k] = top; /* still doesn't block walking or raise the floor, but wings must clear it */ }
        else if (d.walk) { surf[k].push(base + elev + d.h); if (elev <= 0.01) grounded[k] = 1; const top = base + elev + d.h; if (top > BT[k]) BT[k] = top; }
        else if (sit != null) { surf[k].push(base + elev + sit); if (elev <= 0.01) grounded[k] = 1; }
        else { S[k] = 1; const top = base + elev + (d.h || 0); if (top > BT[k]) BT[k] = top; }
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
  // Pay out a reward marker: crystals + skin + items + furni.
  const claimReward = (mk: LoreMarker) => {
    if (mk.crystals && mk.crystals > 0) addBalance(mk.crystals);
    if (mk.skinId) grantSkin(mk.skinId);
    if (mk.items) for (const [id, q] of Object.entries(mk.items)) for (let i = 0; i < q; i++) grantItem(id);
    if (mk.furni) for (const [kind, q] of Object.entries(mk.furni)) grantFurni(kind, q);
    musicRef.current?.chime();
    setRewardReveal({ crystals: mk.crystals || 0, skinId: mk.skinId || '', items: mk.items || {}, furni: mk.furni || {} });
  };
  // Present/claim a marker by style (caller handles once-per-player gating where relevant).
  const fireMarker = (mk: LoreMarker) => {
    if (mk.style === 'reward') { claimReward(mk); return; }
    if (mk.style === 'glitch') setGlitchSeq(mk.text); else setLoreCard(mk.text);
  };
  // Split loaded room_items rows into furni (→ itemsRef) and tile-material overrides (`mat:<n>` → maps).
  const ingestItemRows = (rows: { id: string; kind: string; x: number; y: number; created_by?: string | null }[]) => {
    matOverrideRef.current.clear(); matIdRef.current.clear(); delCuratedRef.current.clear(); loreRef.current = []; placedNpcsRef.current = []; npcHpRef.current.clear(); arenaMarkerRef.current = null; bgRef.current = 'auto'; bgIdRef.current = null; machineOverrideRef.current = null; nearShopRef.current = null; setSTriggerMode(false); setSTriggerShopId(null); setSTriggerTiles([]);
    const items: Item[] = [];
    for (const d of rows) {
      const raw = String(d.kind);
      const m = raw.match(/^mat:(\d+)$/);   // \d+ — Wood/Neon/Void are 10/11/12; \d alone dropped them (→ unknown furni "blue block")
      if (m) { const k = key(Number(d.x), Number(d.y)); matOverrideRef.current.set(k, Number(m[1])); matIdRef.current.set(k, String(d.id)); continue; }
      if (raw.startsWith('npc:')) { const nd = decodeNpc(raw); if (nd) placedNpcsRef.current.push({ id: String(d.id), gx: Number(d.x), gy: Number(d.y), data: nd }); continue; }   // admin-placed NPC
      if (raw.startsWith('del:')) { delCuratedRef.current.add(raw.slice(4)); continue; }   // tombstone: a removed curated piece
      if (raw.startsWith('bg:')) { const a = raw.slice(3) as Atmo; if (ATMOS.some(x => x.id === a)) { bgRef.current = a; bgIdRef.current = String(d.id); } continue; }
      if (raw.startsWith('arena:')) { const p = raw.split(':'); const min = Math.max(1, Number(p[1]) || 10), max = Math.max(0, Number(p[2]) || 0); arenaMarkerRef.current = String(d.id); setRoomMeta(prev => ({ ...prev, arena: true, arenaMin: min, arenaMax: max })); continue; }   // mod-flagged staked arena
      if (raw.startsWith('reward:')) { const p = raw.split(':'); const mode = (p[1] === 'enter' ? 'enter' : 'tile') as LoreMode; let ritems: Record<string, number> = {}, rfurni: Record<string, number> = {}; try { if (p[4]) ritems = JSON.parse(safeDecode(p[4])) || {}; } catch { /* ignore */ } try { if (p[5]) rfurni = JSON.parse(safeDecode(p[5])) || {}; } catch { /* ignore */ } loreRef.current.push({ id: String(d.id), mode, style: 'reward', gx: Number(d.x), gy: Number(d.y), text: '', crystals: Number(p[2]) || 0, skinId: safeDecode(p[3] || ''), items: ritems, furni: rfurni }); continue; }
      if (raw.startsWith('lore:') || raw.startsWith('seq:')) { const style: LoreStyle = raw.startsWith('seq:') ? 'glitch' : 'oracle'; const i1 = raw.indexOf(':'), i2 = raw.indexOf(':', i1 + 1); const mode = raw.slice(i1 + 1, i2) as LoreMode; const text = safeDecode(raw.slice(i2 + 1)); loreRef.current.push({ id: String(d.id), mode: mode === 'enter' ? 'enter' : 'tile', style, gx: Number(d.x), gy: Number(d.y), text }); continue; }
      items.push(hydrateItem(raw, String(d.id), Number(d.x), Number(d.y), String(d.created_by ?? '')));
    }
    setBgAtmo(bgRef.current);
    itemsRef.current = items; setMyCount(items.filter(i => i.createdBy === deviceRef.current).length);
    const setg = items.find(i => i.gameSet && i.gameId); machineOverrideRef.current = setg ? { gameId: setg.gameId!, rules: setg.gameRules ?? {} } : null;   // retarget machines if a set-game event sits in the room
    if (delCuratedRef.current.size) decorRef.current = decorRef.current.filter(d => !delCuratedRef.current.has(d.id));   // hide removed curated decor
    setLoreVer(v => v + 1); rebuildHeight();
    // If the player spawned on a furniture-blocked tile, nudge them to the nearest clear tile.
    { const me = selfRef.current; const ox = clampTile(me.fx), oy = clampTile(me.fy);
      if (solidRef.current[key(ox, oy)]) {
        let placed = false;
        for (let r = 1; r < GRID && !placed; r++)
          for (let dx = -r; dx <= r && !placed; dx++) for (let dy = -r; dy <= r && !placed; dy++) {
            if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
            const nx = ox + dx, ny = oy + dy; if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID) continue;
            const k = key(nx, ny);
            if (!solidRef.current[k] && surfRef.current[k].length) { me.fx = nx; me.fy = ny; me.tx = nx; me.ty = ny; me.path = []; placed = true; }
          }
      }
    }
    // Cavity guard: if spawn is enclosed by furniture (not in the largest walkable region), move to the
    // nearest tile of the largest open area so the player can never be trapped on load.
    { const me = selfRef.current; const ox = clampTile(me.fx), oy = clampTile(me.fy);
      const S = solidRef.current, surf = surfRef.current, k0 = key(ox, oy);
      const vis = new Uint8Array(GRID * GRID); let myComp: Set<number> | null = null, bestComp = new Set<number>();
      for (let i = 0; i < GRID * GRID; i++) {
        if (vis[i] || S[i] || !surf[i].length) continue;
        const comp = new Set<number>(); const q = [i]; vis[i] = 1;
        while (q.length) {
          const c = q.shift()!; comp.add(c);
          const cx = c % GRID, cy = (c / GRID) | 0;
          for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
            const nx = cx+dx, ny = cy+dy; if (nx<0||ny<0||nx>=GRID||ny>=GRID) continue;
            const k2 = key(nx,ny); if (vis[k2]||S[k2]||!surf[k2].length) continue;
            vis[k2]=1; q.push(k2);
          }
        }
        if (comp.has(k0)) myComp = comp;
        if (comp.size > bestComp.size) bestComp = comp;
      }
      if (myComp !== bestComp && bestComp.size) {
        let nk = -1, nd = Infinity;
        for (const k of bestComp) { const d=(k%GRID-ox)**2+(((k/GRID)|0)-oy)**2; if(d<nd){nd=d;nk=k;} }
        if (nk>=0) { me.fx=nk%GRID; me.fy=(nk/GRID)|0; me.tx=me.fx; me.ty=me.fy; me.path=[]; }
      }
    }
    // Obscure guard: if spawn lands under an obscuring structure, step out to the nearest open tile.
    { const me = selfRef.current; const ox = clampTile(me.fx), oy = clampTile(me.fy);
      if (buildObscuredSet().has(key(ox, oy))) {
        const near = nearestUnobscuredTile(ox, oy);
        if (near) { me.fx = near.gx; me.fy = near.gy; me.tx = near.gx; me.ty = near.gy; me.path = []; }
      }
    }
    // Diagonal-behind guard: don't spawn 1 tile behind solid furniture on the vertical axis.
    // In iso (sort by gx+gy), solid at (ox+1,oy+1) renders in front and visually covers the player.
    { const me = selfRef.current; const ox = clampTile(me.fx), oy = clampTile(me.fy);
      const fx = ox + 1, fy = oy + 1;
      if (fx < GRID && fy < GRID && solidRef.current[key(fx, fy)]) {
        const near = nearestUnobscuredTile(ox, oy);
        if (near) { me.fx = near.gx; me.fy = near.gy; me.tx = near.gx; me.ty = near.gy; me.path = []; }
      }
    }
    // Portal-arrival guard: spawn adjacent to the return portal in the destination room.
    // If every adjacent tile is obscured, fall back to the nearest unobscured tile from that portal.
    { const from = portalFromRef.current;
      if (from) {
        portalFromRef.current = null;
        const slug = roomMetaRef.current.slug;
        const allItems = decorRef.current.length ? itemsRef.current.concat(decorRef.current) : itemsRef.current;
        const returnPortals: { gx: number; gy: number }[] = [
          ...(PORTALS[slug] ?? []).filter(rp => rp.to === from),
          ...allItems.filter(it => it.portalTo === from).map(it => ({ gx: it.gx, gy: it.gy })),
        ];
        const S = solidRef.current, surf = surfRef.current, obscured = buildObscuredSet();
        let placed = false;
        for (const portal of returnPortals) {
          if (placed) break;
          for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
            const nx = portal.gx + dx, ny = portal.gy + dy;
            if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID) continue;
            const k = key(nx, ny);
            if (S[k] || !surf[k].length || obscured.has(k)) continue;
            const me = selfRef.current;
            me.fx = nx; me.fy = ny; me.tx = nx; me.ty = ny; me.path = [];
            lastPortalKeyRef.current = `${portal.gx},${portal.gy}`;   // suppress immediate re-fire on the return portal
            placed = true; break;
          }
          if (!placed) {
            // All adjacent tiles are obscured — nearest unobscured tile to the portal instead
            const near = nearestUnobscuredTile(portal.gx, portal.gy);
            if (near) {
              const me = selfRef.current;
              me.fx = near.gx; me.fy = near.gy; me.tx = near.gx; me.ty = near.gy; me.path = [];
              lastPortalKeyRef.current = `${portal.gx},${portal.gy}`;
              placed = true;
            }
          }
        }
      }
    }
    // Elevation correction: after all positional guards, snap z/lvl to the highest walkable surface
    // at the chosen tile so the avatar stands on top of any platform rather than inside it.
    { const me = selfRef.current; const k = key(clampTile(me.fx), clampTile(me.fy));
      const surfs = surfRef.current[k];
      if (surfs && surfs.length > 0) { const top = Math.max(...surfs); me.z = top; me.lvl = top; }
    }
    rebuildNpcs();
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
  // Builds a set of tile keys covered by obscuring construction: all 'constr' structural items
  // (walls, pillars, roofs, windows) plus walkable blocks placed at elev >= 2 (overhead cover).
  // Doors/gates (pass=true, non-roof) are excluded — intentional walk-through entries.
  // Walkable blocks at elev 0-1 are ground-level platforms, not overhead covers.
  const buildObscuredSet = (): Set<number> => {
    const allItems = decorRef.current.length ? itemsRef.current.concat(decorRef.current) : itemsRef.current;
    const s = new Set<number>();
    for (const it of allItems) {
      const d = defOf(it.kind);
      if (!d.obscures && d.cat !== 'constr') continue;
      if (!d.obscures && d.pass && d.special !== 'roof') continue;  // skip doors/gates but not roofs
      if (!d.obscures && d.walk && (it.elev || 0) < 2) continue;   // walkable constr blocks only obscure when elevated
      if (!d.obscures && it.kind === 'plataforma') continue;         // platforms are flat surfaces, not overhead covers
      if (d.obscures && (it.elev || 0) < 2) continue;              // explicit-obscures items (e.g. trash blocks) require elev >= 2
      const [sw, sh] = effSpan(it.kind, it.dir || 0);
      for (let du = 0; du < sw; du++) for (let dv = 0; dv < sh; dv++) s.add(key(it.gx + du, it.gy + dv));
    }
    return s;
  };
  // Closest open (walkable, non-obscured) tile to (gx,gy) — used when a click lands on solid
  // furniture/construction so it redirects to a real destination instead of doing nothing.
  const nearestUnobscuredTile = (gx: number, gy: number): { gx: number; gy: number } | null => {
    const S = solidRef.current, surf = surfRef.current;
    const obscured = buildObscuredSet();
    for (let r = 1; r < GRID; r++) {
      for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;   // ring border only
        const nx = gx + dx, ny = gy + dy; if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID) continue;
        const k = key(nx, ny); if (S[k] || !surf[k].length) continue;
        if (obscured.has(k)) continue;
        return { gx: nx, gy: ny };
      }
    }
    return null;
  };
  // Level-aware BFS over (tile, surface) nodes: step to a neighbour surface within ±1 of the current
  // level. From the ground you can't reach a high deck (gap>1) so you pass UNDER it; ramps/stairs add
  // the intermediate surfaces to climb ON. Returns waypoints {gx,gy,z}.
  const findPath = (sx: number, sy: number, slvl: number, tx: number, ty: number, fly = flyRef.current) => {
    const surf = surfRef.current, S = solidRef.current; const tk = key(tx, ty);
    if (S[tk] || !surf[tk].length || (sx === tx && sy === ty)) return [];
    // Wings: ignore the ±1-level step limit and the obscured-structure routing guards, so you can
    // climb straight up onto rooftops and upper floors. Solid walls still block (you fly over via
    // adjacent walkable surfaces, never through them). Only the wing-wearer flies — NPCs pass fly=false.
    const obscured = fly ? new Set<number>() : buildObscuredSet();
    const playerObscured = obscured.has(key(sx, sy));
    // Block routing to an obscured tile from outside — unless already standing within 1 tile of it.
    // If the player is already inside an obscured area, lift all restrictions so they can navigate freely.
    if (!playerObscured && obscured.has(tk) && Math.max(Math.abs(sx - tx), Math.abs(sy - ty)) > 1) return [];
    // Avoid portal tiles unless the destination is within 1 tile of a portal (intentional approach).
    const allPortals = [...(PORTALS[roomMetaRef.current.slug] ?? []), ...itemsRef.current.filter(it => it.portalTo)] as { gx: number; gy: number }[];
    const destNearPortal = allPortals.some(pt => Math.max(Math.abs(pt.gx - tx), Math.abs(pt.gy - ty)) <= 1);
    const portalKeys = destNearPortal ? null : new Set(allPortals.map(pt => key(pt.gx, pt.gy)));
    // Avoid shop trigger tiles unless the destination IS a trigger tile (intentional entry).
    const allShopTriggers = itemsRef.current.filter(it => it.kind === 'shop' && it.shopTriggers?.length).flatMap(it => it.shopTriggers!);
    const destOnTrigger = allShopTriggers.some(t => t.gx === tx && t.gy === ty);
    const shopTriggerKeys = destOnTrigger ? null : new Set(allShopTriggers.map(t => key(t.gx, t.gy)));
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
        if (!playerObscured && k2 !== tk && obscured.has(k2)) continue;             // outside: don't route through obscured tiles; inside: navigate freely
        if (portalKeys?.has(k2)) continue;                                         // skip portal tiles unless intentionally approaching one
        if (shopTriggerKeys?.has(k2)) continue;                                    // skip shop trigger tiles unless intentionally stepping on one
        if (dx && dy && S[key(cx + dx, cy)] && S[key(cx, cy + dy)]) continue;   // no diagonal through a corner
        for (let si = surf[k2].length - 1; si >= 0; si--) {   // prefer highest reachable surface (step ON, not under)
          const sz = surf[k2][si];
          if (!fly && Math.abs(sz - cur.l) > 1.001) continue;
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
    const isShop = kind.startsWith('shop:');        // a shop trigger (invisible to players; admin-placed)
    const isFree = isPortal || isGame || isSetGame || isShop;
    const engineKind = isPortal ? 'teleporter' : isGame ? 'arcade' : isSetGame ? 'setgame' : isShop ? 'shop' : kind;
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
    if (isShop && replacingShopIdRef.current) { const old = itemsRef.current.find(i => i.id === replacingShopIdRef.current); if (old) dropItem(old); replacingShopIdRef.current = null; }
    const id = (crypto?.randomUUID?.() ?? `it_${Date.now()}_${Math.floor(Math.random() * 1e9)}`);
    if (isShop) lastPlacedShopIdRef.current = id;
    const dbKind = isFree ? kind : encodeKind(engineKind, dir, elev);   // the room_items `kind` text (carries dir/elev or the event link)
    const item = hydrateItem(dbKind, id, gx, gy, deviceRef.current);
    itemsRef.current.push(item); setMyCount(c => c + 1); rebuildHeight();
    if (isPortal) flashHint('Portal placed ✦ walk onto it to travel');
    else if (isGame) flashHint('Game placed ✦ walk close to play');
    else if (isSetGame) { machineOverrideRef.current = { gameId: item.gameId ?? '', rules: item.gameRules ?? {} }; flashHint('Machines in this room retargeted ✦'); }
    else if (isShop) flashHint('Shop placed ✦ walk close to browse');
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
    const curated = (CURATED_NPCS[slug] ?? []).map(n => ({ handle: n.handle, skinId: n.skinId, icon: null, fx: n.gx, fy: n.gy, tx: n.gx, ty: n.gy, z: n.lvl ?? 0, lvl: n.lvl ?? 0, bubble: '', bubbleLife: 0, af: 0, lines: n.lines, lineQueue: [] as string[], hx: n.gx, hy: n.gy, roam: n.roam, path: [] as { gx: number; gy: number; z: number }[], wanderCool: Math.floor(Math.random() * 841), beats: n.beats, hints: n.hints, hintIdx: 0, nid: n.id ?? n.handle, near: false, cool: 0 }));
    const placed = placedNpcsRef.current.map(p => {
      const lvl = Math.max(0, planLvl(p.gx, p.gy));
      const h = p.data.h;
      // resolve hazard state: 'once' beaten → peaceful forever; a respawning NPC is "down" until its
      // timer (defeated, no bar) then comes back live. e = ever beaten (gates no-refarm reward).
      let defeated = false, peaceful = false, hp: number | undefined, respawnAt = 0;
      if (h) {
        const saved = loadNpcDefeat(p.id);
        peaceful = h.policy === 'once' && saved.e;
        if (!peaceful && saved.e && saved.u > 0 && Date.now() < saved.u) { defeated = true; respawnAt = saved.u; }   // still down, awaiting respawn
        hp = (defeated || peaceful) ? 0 : (npcHpRef.current.get(p.id) ?? h.maxHp);
      }
      const lines = (peaceful && h?.deadLines?.length) ? h.deadLines : p.data.l;
      const bodyScale = Math.min(5, Math.max(1, p.data.sz ?? 1));
      return { id: p.id, handle: p.data.n, skinId: p.data.a, icon: null, fx: p.gx, fy: p.gy, tx: p.gx, ty: p.gy, z: lvl, lvl, bubble: '', bubbleLife: 0, af: 0, lines, lineQueue: [] as string[], hx: p.gx, hy: p.gy, roam: 4, path: [] as { gx: number; gy: number; z: number }[], wanderCool: Math.floor(Math.random() * 841), beats: [] as string[], hints: [] as string[], hintIdx: 0, nid: p.id, near: false, cool: 0, hz: h, defeated, peaceful, hp, maxHp: h?.maxHp, lastNpcAtk: 0, respawnAt, bodyScale };
    });
    npcsRef.current = [...curated, ...placed];
    rebuildHuntable();
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
  const updateNpc = (id: string, d: NpcData) => {
    const existing = placedNpcsRef.current.find(p => p.id === id); if (!existing) return;
    existing.data = d; rebuildNpcs();
    const kind = encodeNpc(d);
    supabase?.from('room_items').update({ kind }).eq('id', id).then(undefined, () => {});
    channelRef.current?.send({ type: 'broadcast', event: 'npcupdate', payload: { id, kind } });
    flashHint(`${d.n} updated ☻`);
  };
  const openNpcEditor = () => { setNpcEditor(true); setNpcMode(null); setPlacingKind(null); setRemoveMode(false); setRotateMode(false); setTileMode(false); setAtmoMode(false); setGamesMode(false); setShopsMode(false); setBuildMode(false); setPlacingPrefab(null); setEditSel(null); };
  // Arm the next tile-tap to drop a game event: a Play trigger (proximity cabinet) or a Set event
  // (retargets this room's machines). The chosen rules ride along (plumbing only for now).
  const armGamePlacement = () => {
    const kind = gTab === 'set' ? encodeSetGame(gGameId, gRules) : encodeGameTrigger(gGameId, gRules, gHidden);
    setPlacingKind(kind); setGamesMode(false); setShopsMode(false); setRemoveMode(false); setRotateMode(false); setTileMode(false); setAtmoMode(false); setBuildMode(false); setPlacingPrefab(null);
    flashHint(gTab === 'set' ? 'Tap a tile to retarget this room\'s machines ▸' : gHidden ? 'Tap a tile to drop the hidden cabinet ◌' : 'Tap a tile to drop the game cabinet ▸');
  };
  const armShopPlacement = () => {
    if (sShopItems.length === 0) { flashHint('Select at least one item first'); return; }
    const kind = encodeShopTrigger(sShopName, sShopItems);
    setPlacingKind(kind); setShopsMode(false); setGamesMode(false); setRemoveMode(false); setRotateMode(false); setTileMode(false); setAtmoMode(false); setBuildMode(false); setPlacingPrefab(null);
    flashHint('Tap a tile to place the shop ▸');
  };
  const saveShopEdit = () => {
    if (sShopItems.length === 0) { flashHint('Select at least one item first'); return; }
    const idx = itemsRef.current.findIndex(i => i.id === sEditShopId);
    if (idx === -1) { flashHint('Shop not found'); return; }
    const old = itemsRef.current[idx];
    const newKind = encodeShopTrigger(sShopName, sShopItems, old.shopTriggers);
    itemsRef.current[idx] = { ...old, shopName: sShopName, shopItems: sShopItems };
    supabase?.from('room_items').update({ kind: newKind }).eq('id', old.id).then(undefined, () => {});
    setSEditShopId(null); setSShopName(''); setSShopItems([]); setSShowEditList(false);
    flashHint('Shop updated ✦');
  };
  const confirmTriggers = () => {
    const idx = itemsRef.current.findIndex(i => i.id === sTriggerShopId);
    if (idx !== -1) {
      const shop = itemsRef.current[idx];
      const triggers = sTriggerTiles.map(k => { const [x, y] = k.split('_').map(Number); return { gx: x, gy: y }; });
      const newKind = encodeShopTrigger(shop.shopName ?? '', shop.shopItems ?? [], triggers);
      itemsRef.current[idx] = { ...shop, shopTriggers: triggers };
      supabase?.from('room_items').update({ kind: newKind }).eq('id', shop.id).then(undefined, () => {});
      flashHint(`Shop active on ${triggers.length} tile${triggers.length !== 1 ? 's' : ''} ✦`);
    }
    setSTriggerMode(false); setSTriggerShopId(null); setSTriggerTiles([]);
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
  const deleteNpc = (id: string) => {
    placedNpcsRef.current = placedNpcsRef.current.filter(p => p.id !== id); rebuildNpcs();
    channelRef.current?.send({ type: 'broadcast', event: 'npcdel', payload: { id } });
    supabase?.from('room_items').delete().eq('id', id).then(undefined, () => {});
    setNpcEditor(false); setEditingNpcId(null); flashHint('NPC deleted ☻');
  };
  const removeAt = (gx: number, gy: number) => {
    const hit = topItemAt(gx, gy);
    if (hit) { dropItem(hit); return; }
    // No player furni here — admins may also pick up a baked-in (curated) decor piece.
    if (modRef.current) {
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
  const kindFor = (style: LoreStyle, mode: LoreMode, text: string) => style === 'reward' ? encodeReward(mode, mkCrystals, mkSkin, mkItems, mkFurni) : encodeMarker(style, mode, text);
  const saveMarker = () => {
    const reward = mkStyle === 'reward';
    const text = loreText.trim(); if (!reward && !text) { flashHint('Write something first'); return; }
    if (reward && !(mkCrystals > 0) && !mkSkin && Object.keys(mkItems).length === 0 && Object.keys(mkFurni).length === 0) { flashHint('Set at least one reward'); return; }
    if (loreEditId) {   // edit an existing marker in place (keep its mode + tile; allow style/value change)
      const m = loreRef.current.find(l => l.id === loreEditId); if (m) { m.text = text; m.style = mkStyle; m.crystals = mkCrystals; m.skinId = mkSkin; m.items = mkItems; m.furni = mkFurni; supabase?.from('room_items').update({ kind: kindFor(mkStyle, m.mode, text) }).eq('id', m.id).then(undefined, () => {}); }
      setLoreEditId(null); setLoreText(''); setLoreVer(v => v + 1); flashHint('Marker updated ✦'); return;
    }
    if (mkMode === 'enter') {   // on-enter marker — saved immediately (tile ignored)
      const id = newId('lore'); loreRef.current.push({ id, mode: 'enter', style: mkStyle, gx: 0, gy: 0, text, crystals: mkCrystals, skinId: mkSkin, items: mkItems, furni: mkFurni });
      supabase?.from('room_items').insert({ id, room, kind: kindFor(mkStyle, 'enter', text), x: 0, y: 0, created_by: deviceRef.current }).then(undefined, () => {});
      setLoreText(''); setLoreVer(v => v + 1); flashHint('On-enter marker saved ✦'); return;
    }
    pendingLoreRef.current = { text, style: mkStyle, crystals: mkCrystals, skinId: mkSkin, items: mkItems, furni: mkFurni }; setPlaceLore(true); setLoreEditor(false); flashHint('Tap a tile to drop the marker ✎');
  };
  const placeTileLoreAt = (gx: number, gy: number) => {
    const { text, style, crystals, skinId, items, furni } = pendingLoreRef.current; if (style !== 'reward' && !text) { setPlaceLore(false); return; }
    const id = newId('lore'); loreRef.current.push({ id, mode: 'tile', style, gx, gy, text, crystals, skinId, items, furni });
    const kind = style === 'reward' ? encodeReward('tile', crystals, skinId, items, furni) : encodeMarker(style, 'tile', text);
    supabase?.from('room_items').insert({ id, room, kind, x: gx, y: gy, created_by: deviceRef.current }).then(undefined, () => {});
    pendingLoreRef.current = { text: '', style: 'oracle', crystals: 0, skinId: '', items: {}, furni: {} }; setPlaceLore(false); setLoreText(''); setLoreVer(v => v + 1); flashHint('Marker placed ✎');
  };
  const openLoreEditor = () => { setLoreText(''); setLoreEditId(null); setMkMode('enter'); setMkStyle('oracle'); setMkCrystals(100); setMkSkin(''); setMkItems({}); setMkFurni({}); setMkItemPick(''); setMkFurniPick(''); setLoreEditor(true); setPlacingKind(null); setGamesMode(false); setShopsMode(false); setRemoveMode(false); setRotateMode(false); setTileMode(false); setAtmoMode(false); setBuildMode(false); setPlacingPrefab(null); };
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

    setRoomReady(false);
    // Tutorial rooms are SOLO instances — no presence/broadcast join (just you + the Oracle). We still
    // LOAD their furni from the DB so admins can dress them and the decor persists; placement/removal
    // writes straight to room_items (channel sends are no-ops without a channel).
    if (isTutRoom(room)) {
      remotesRef.current.clear(); itemsRef.current = []; matOverrideRef.current.clear(); rebuildHeight(); setPopulation(1); setConnected(false);
      if (!supabase) return;
      let aliveTut = true;
      fetchAllRoomItems(supabase, room).then(rows => { if (aliveTut) { ingestItemRows(rows); setRoomReady(true); } });
      return () => { aliveTut = false; };
    }
    if (!supabase || !entered) return;   // wait for the lobby "Enter" so the join is deliberate + clean
    if (!supabase || !entered) return;   // wait for the lobby "Enter" so the join is deliberate + clean
    const sb = supabase;
    const me = selfRef.current;
    remotesRef.current.clear(); itemsRef.current = []; rebuildHeight(); setPopulation(1); setConnected(false);
    let alive = true; let connectGen = 0; let rejoinTimer: ReturnType<typeof setTimeout> | null = null;

    // (Re)create + subscribe the room channel. Auto-rejoins itself if the socket/channel drops.
    const connect = () => {
      if (!alive) return;
      const myGen = ++connectGen;
      const ch = sb.channel(`room:${room}`, { config: { presence: { key: me.id }, broadcast: { self: false } } });
      channelRef.current = ch;
      let presenceSynced = false;
      const rebuild = () => {
        const state = ch.presenceState() as Record<string, Array<Record<string, unknown>>>;
        const seen = new Set<string>([me.id]);
        for (const k in state) {
          const meta = state[k]?.[0]; if (!meta) continue; const id = String(meta.id ?? k); if (id === me.id) continue;
          seen.add(id); const fx = Number(meta.fx), fy = Number(meta.fy); let r = remotesRef.current.get(id); const lvl = Number(meta.lvl) || 0;
          const swayIntensity = Number(meta.swayIntensity) || 0; const swayExpiry = Number(meta.swayExpiry) || 0;
          const speedMult = Number(meta.speedMult) || 1; const speedExpiry = Number(meta.speedExpiry) || 0;
          const hp = meta.hp != null ? Number(meta.hp) : undefined; const maxHp = Number(meta.maxHp) || MAX_HP; const absorb = Number(meta.absorb) || 0; const weapon = meta.wp != null ? String(meta.wp) : undefined; const flying = Boolean(meta.fly);
          if (!r) remotesRef.current.set(id, { handle: String(meta.handle ?? '???'), skinId: String(meta.skinId ?? 'diamond-gold'), icon: null, fx, fy, tx: fx, ty: fy, z: lvl, lvl, bubble: '', bubbleLife: 0, af: Math.random() * 100, swayIntensity, swayExpiry, speedMult, speedExpiry, hp, maxHp, absorb, weapon, flying });
          else {
            r.handle = String(meta.handle ?? r.handle); r.skinId = String(meta.skinId ?? r.skinId); r.lvl = lvl; r.swayIntensity = swayIntensity; r.swayExpiry = swayExpiry; r.speedMult = speedMult; r.speedExpiry = speedExpiry; r.maxHp = maxHp; if (weapon != null) r.weapon = weapon; r.flying = flying;
            // hp/absorb from presence are a lagging cache — only trust them as a fallback when no live
            // 'hp' broadcast (or our own optimistic hit) has touched this player for a few seconds.
            // During an active fight the live broadcast owns hp; otherwise presence sync flickers the bar.
            if (hp != null && Date.now() - (r.hpStamp ?? 0) > 4000) { r.hp = hp; r.absorb = absorb; }
          }
        }
        for (const id of [...remotesRef.current.keys()]) if (!seen.has(id)) remotesRef.current.delete(id);
        setPopulation(remotesRef.current.size + 1);
        presenceSynced = true;
      };
      ch.on('presence', { event: 'sync' }, rebuild)
        .on('broadcast', { event: 'pos' }, ({ payload }) => {
          const pl = payload as Record<string, unknown>; const id = String(pl?.id ?? ''); if (!id || id === me.id) return;
          const fx = Number(pl.fx), fy = Number(pl.fy); if (!Number.isFinite(fx) || !Number.isFinite(fy)) return;
          const lvl = Number(pl.lvl) || 0; const h = pl.h != null ? String(pl.h) : null; const s = pl.s != null ? String(pl.s) : null; const ic = parseIcon(pl.icon);
          let r = remotesRef.current.get(id);
          if (!r) { r = { handle: h ?? '…', skinId: s ?? 'diamond-gold', icon: ic, fx, fy, tx: fx, ty: fy, z: lvl, lvl, bubble: '', bubbleLife: 0, af: Math.random() * 100, vx: 0, vy: 0, rxAt: performance.now() }; remotesRef.current.set(id, r); setPopulation(remotesRef.current.size + 1); }
          else {
            const now = performance.now(); const dt = now - (r.rxAt ?? now);
            if (!pl.tp && dt > 0 && dt < 500) {   // velocity from consecutive updates; ignore teleports and stale gaps
              const dtTicks = dt / (1000 / 60);
              const rawVx = (fx - r.tx) / dtTicks, rawVy = (fy - r.ty) / dtTicks;
              r.vx = Math.max(-WALK * 1.5, Math.min(WALK * 1.5, rawVx));
              r.vy = Math.max(-WALK * 1.5, Math.min(WALK * 1.5, rawVy));
            } else { r.vx = 0; r.vy = 0; }
            r.rxAt = now; r.tx = fx; r.ty = fy; r.lvl = lvl;
            if (pl.tp) { r.fx = fx; r.fy = fy; r.z = lvl; }   // tp = respawn teleport: snap, don't slide across the room
            if (h) r.handle = h; if (s) r.skinId = s; r.icon = ic; if (pl.wp != null) r.weapon = String(pl.wp); if (pl.fly != null) r.flying = Boolean(pl.fly);
          }
        })
        .on('broadcast', { event: 'say' }, ({ payload }) => {
          const pl = payload as Record<string, unknown>; const id = String(pl?.id ?? ''); const text = String(pl?.text ?? '');
          if (!id || id === me.id || !text) return; const r = remotesRef.current.get(id); if (r) { r.bubble = text; r.bubbleLife = BUBBLE_FRAMES; } pushFeed(r?.handle ?? '???', text);
        })
        .on('broadcast', { event: 'place' }, ({ payload }) => {
          const pl = payload as Record<string, unknown>; const id = String(pl?.id ?? ''); if (!id || itemsRef.current.some(i => i.id === id)) return;
          const rawK = String(pl.kind);
          if (rawK.startsWith('portal:') || rawK.startsWith('game:') || rawK.startsWith('setgame:') || rawK.startsWith('shop:')) { const it = hydrateItem(rawK, id, Number(pl.gx), Number(pl.gy), String(pl.by ?? '')); itemsRef.current.push(it); if (it.gameSet && it.gameId) machineOverrideRef.current = { gameId: it.gameId, rules: it.gameRules ?? {} }; }
          else itemsRef.current.push({ id, kind: rawK, gx: Number(pl.gx), gy: Number(pl.gy), dir: Number(pl.dir) || 0, elev: Number(pl.elev) || 0, createdBy: String(pl.by ?? '') });
          rebuildHeight();
        })
        .on('broadcast', { event: 'rotate' }, ({ payload }) => { const pl = payload as Record<string, unknown>; const id = String(pl?.id ?? ''); const it = itemsRef.current.find(i => i.id === id); if (it) it.dir = Number(pl.dir) || 0; })
        .on('broadcast', { event: 'move' }, ({ payload }) => { const pl = payload as Record<string, unknown>; const it = itemsRef.current.find(i => i.id === String(pl?.id ?? '')); if (it) { it.gx = Number(pl.gx); it.gy = Number(pl.gy); rebuildHeight(); } })
        .on('broadcast', { event: 'npc' }, ({ payload }) => { const pl = payload as Record<string, unknown>; const id = String(pl?.id ?? ''); if (!id || placedNpcsRef.current.some(p => p.id === id)) return; const nd = decodeNpc(String(pl.kind)); if (nd) { placedNpcsRef.current.push({ id, gx: Number(pl.x), gy: Number(pl.y), data: nd }); rebuildNpcs(); } })
        .on('broadcast', { event: 'npcdel' }, ({ payload }) => { const id = String((payload as Record<string, unknown>)?.id ?? ''); if (id) { placedNpcsRef.current = placedNpcsRef.current.filter(p => p.id !== id); rebuildNpcs(); } })
        .on('broadcast', { event: 'npcupdate' }, ({ payload }) => { const pl = payload as Record<string, unknown>; const id = String(pl?.id ?? ''); const nd = decodeNpc(String(pl?.kind ?? '')); const existing = placedNpcsRef.current.find(p => p.id === id); if (existing && nd) { existing.data = nd; rebuildNpcs(); } })
        .on('broadcast', { event: 'npc_kb' }, ({ payload }) => { const pl = payload as Record<string, unknown>; const nid = String(pl?.nid ?? ''); const fx = Number(pl?.fx); const fy = Number(pl?.fy); if (!nid || isNaN(fx) || isNaN(fy)) return; const n = npcsRef.current.find(x => x.nid === nid); if (n) { n.fx = fx; n.fy = fy; n.tx = fx; n.ty = fy; n.path = []; } })
        .on('broadcast', { event: 'unplace' }, ({ payload }) => { const id = String((payload as Record<string, unknown>)?.id ?? ''); itemsRef.current = itemsRef.current.filter(i => i.id !== id); rebuildHeight(); })
        .on('broadcast', { event: 'mat' }, ({ payload }) => { const pl = payload as Record<string, unknown>; const k = key(Number(pl.x), Number(pl.y)); const n = Number(pl.n); if (n < 0) matOverrideRef.current.delete(k); else matOverrideRef.current.set(k, n); })   // live tile-paint
        .on('broadcast', { event: 'bg' }, ({ payload }) => { const a = String((payload as Record<string, unknown>)?.a ?? 'auto') as Atmo; if (ATMOS.some(x => x.id === a)) { bgRef.current = a; setBgAtmo(a); } })   // live atmosphere change
        .on('broadcast', { event: 'delcurated' }, ({ payload }) => { const id = String((payload as Record<string, unknown>)?.id ?? ''); if (id) { delCuratedRef.current.add(id); decorRef.current = decorRef.current.filter(d => d.id !== id); rebuildHeight(); } })   // admin removed a baked-in piece
        .on('broadcast', { event: 'emote' }, ({ payload }) => { const pl = payload as Record<string, unknown>; const id = String(pl?.id ?? ''); if (!id || id === me.id) return; const r = remotesRef.current.get(id); if (r) { r.emote = pl.em ? String(pl.em) : null; r.emoteAf = 0; } })
        .on('broadcast', { event: 'leave' }, ({ payload }) => { const id = String((payload as Record<string, unknown>)?.id ?? ''); if (id && remotesRef.current.delete(id)) setPopulation(remotesRef.current.size + 1); })   // someone left/refreshed → drop them now (don't wait for presence timeout)
        .on('broadcast', { event: 'interact_req' }, ({ payload }) => {
          const pl = payload as Record<string, unknown>;
          if (String(pl.to ?? '') !== me.id || interactSessionRef.current) return;
          setInteractRequest({ id: String(pl.from ?? ''), handle: String(pl.handle ?? '???') });
        })
        .on('broadcast', { event: 'interact_res' }, ({ payload }) => {
          const pl = payload as Record<string, unknown>;
          if (String(pl.to ?? '') !== me.id) return;
          const peer = { id: String(pl.from ?? ''), handle: String(pl.handle ?? '???') };
          setInteractWaiting(false);
          if (Boolean(pl.accept)) {
            const sess = { peer, mode: 'menu' as const };
            setInteractSession(sess); interactSessionRef.current = sess;
          } else {
            setInteractPrompt(null);
            flashHint(`${peer.handle} declined.`);
          }
        })
        .on('broadcast', { event: 'interact_close' }, ({ payload }) => {
          const pl = payload as Record<string, unknown>;
          if (String(pl.to ?? '') !== me.id) return;
          const fromHandle = remotesRef.current.get(String(pl.from ?? ''))?.handle ?? String(pl.from ?? 'Someone');
          closeInteract(false);
          flashHint(`${fromHandle} ended the interaction.`);
        })
        .on('broadcast', { event: 'interact_chat' }, ({ payload }) => {
          const pl = payload as Record<string, unknown>;
          if (String(pl.to ?? '') !== me.id) return;
          const text = String(pl.text ?? ''); const handle = String(pl.handle ?? '???');
          if (!text) return;
          setPrivateMsgs(prev => [...prev, { handle, text, mine: false }]);
        })
        .on('broadcast', { event: 'interact_gift' }, ({ payload }) => {
          const pl = payload as Record<string, unknown>;
          if (String(pl.to ?? '') !== me.id) return;
          const itemId = String(pl.itemId ?? ''); const fromHandle = String(pl.handle ?? '???');
          const item = itemById(itemId); if (!item) return;
          grantItem(itemId);
          flashHint(`${fromHandle} gifted you ${item.emoji} ${item.name}!`);
        })
        .on('broadcast', { event: 'interact_gift_crystals' }, ({ payload }) => {
          const pl = payload as Record<string, unknown>;
          if (String(pl.to ?? '') !== me.id) return;
          const amount = Math.floor(Number(pl.amount ?? 0)); if (amount <= 0) return;
          addBalance(amount);
          flashHint(`${String(pl.handle ?? '???')} gifted you ${CURRENCY_SYMBOL}${amount}!`);
        })
        .on('broadcast', { event: 'interact_gift_furni' }, ({ payload }) => {
          const pl = payload as Record<string, unknown>;
          if (String(pl.to ?? '') !== me.id) return;
          const kind = String(pl.kind ?? ''); if (!kind) return;
          const f = defOf(kind);
          grantFurni(kind, 1);
          flashHint(`${String(pl.handle ?? '???')} gifted you ${f.emoji} ${f.name}!`);
        })
        .on('broadcast', { event: 'interact_trade_offer' }, ({ payload }) => {
          const pl = payload as Record<string, unknown>;
          if (String(pl.to ?? '') !== me.id) return;
          const offer = pl.offer as TradeOffer | undefined;
          if (!offer?.type) return;
          if (offer.type === 'item' && !itemById(offer.id)) return;
          if (offer.type === 'furni' && !offer.kind) return;
          if (offer.type === 'crystals' && !(Number(offer.amount) > 0)) return;
          setTheirOffer(offer); theirOfferRef.current = offer;
        })
        .on('broadcast', { event: 'interact_trade_accept' }, ({ payload }) => {
          const pl = payload as Record<string, unknown>;
          if (String(pl.to ?? '') !== me.id) return;
          theirTradeConfirmedRef.current = true; setTheirTradeConfirmed(true);
          if (myTradeConfirmedRef.current && myOfferRef.current && theirOfferRef.current) {
            executeTrade(myOfferRef.current, theirOfferRef.current);
          }
        })
        .on('broadcast', { event: 'interact_mode' }, ({ payload }) => {
          const pl = payload as Record<string, unknown>;
          if (String(pl.to ?? '') !== me.id) return;
          const m = pl.mode as string | null;
          setPeerMode(m === 'chat' || m === 'gift' || m === 'trade' ? m : null);
        })
        .on('broadcast', { event: 'item_effect' }, ({ payload }) => {
          const pl = payload as Record<string, unknown>;
          const id = String(pl.id ?? ''); if (!id || id === me.id) return;
          const r = remotesRef.current.get(id); if (!r) return;
          r.swayIntensity = Number(pl.swayIntensity) || 0;
          r.swayExpiry    = Number(pl.swayExpiry)    || 0;
          r.speedMult     = Number(pl.speedMult)     || 1;
          r.speedExpiry   = Number(pl.speedExpiry)   || 0;
        })
        // ---- combat ----
        .on('broadcast', { event: 'hp' }, ({ payload }) => {
          const pl = payload as Record<string, unknown>; const id = String(pl.id ?? ''); if (!id || id === me.id) return;
          const r = remotesRef.current.get(id); if (!r) return;
          r.hp = Number(pl.hp); r.maxHp = Number(pl.maxHp) || MAX_HP; r.absorb = Number(pl.absorb) || 0; r.hpStamp = Date.now(); if (pl.wp != null) r.weapon = String(pl.wp);
        })
        .on('broadcast', { event: 'swing' }, ({ payload }) => {
          const pl = payload as Record<string, unknown>;
          const id = String(pl.id ?? ''); const a = remotesRef.current.get(id);
          if (a) { a.attackUntil = Date.now() + 280; if (pl.wp != null) a.weapon = String(pl.wp); }
        })
        .on('broadcast', { event: 'attack' }, ({ payload }) => {
          const pl = payload as Record<string, unknown>;
          const from = String(pl.from ?? ''); const a = remotesRef.current.get(from);
          if (a) { a.attackUntil = Date.now() + 280; if (pl.wp != null) a.weapon = String(pl.wp); }   // show the attacker's swing
          // Show the projectile to everyone watching (attacker already pushed it locally).
          if (a) {
            const toId = String(pl.to ?? ''); const self = selfRef.current;
            const tgt = toId === self.id ? self : remotesRef.current.get(toId);
            if (tgt) {
              const style = String(pl.style ?? '');
              if (style === 'gun') projRef.current.push({ fx0: a.fx, fy0: a.fy, z0: a.z + 0.4, fx1: tgt.fx, fy1: tgt.fy, z1: tgt.z + 0.4, life: 10, max: 10, color: '#ffd700', style: 'gun' });
              else if (style === 'magic') projRef.current.push({ fx0: a.fx, fy0: a.fy, z0: a.z + 0.4, fx1: tgt.fx, fy1: tgt.fy, z1: tgt.z + 0.4, life: 18, max: 18, color: '#b98cff' });
            }
          }
          onIncomingAttack(pl);
        })
        .on('broadcast', { event: 'ko' }, ({ payload }) => {
          const pl = payload as Record<string, unknown>; const id = String(pl.id ?? ''); if (!id) return;
          const r = remotesRef.current.get(id); if (r) { r.koUntil = Date.now() + KO_MS; r.hp = 0; r.hpStamp = Date.now(); }
          const by = String(pl.by ?? '');
          const byHandle = by === me.id ? me.handle : (remotesRef.current.get(by)?.handle ?? 'someone');
          const victimHandle = id === me.id ? me.handle : (r?.handle ?? 'someone');
          pushFeed('⚔', `${byHandle} cooked ${victimHandle}`);
        })
        .on('broadcast', { event: 'loot' }, ({ payload }) => {
          const pl = payload as Record<string, unknown>; if (String(pl.to ?? '') !== me.id) return;
          // Arena bounty → credit my escrow pot (capped at 2× my stake), not my wallet. I bank it on cash-out.
          if (pl.arena) {
            const e = arenaRef.current; if (!e) return;
            const bounty = Math.max(0, Number(pl.crystals) || 0);
            const newBal = Math.min(e.stake * 2, e.balance + bounty);
            const gained = newBal - e.balance; setArenaBalance(newBal);
            const fromH = remotesRef.current.get(String(pl.from ?? ''))?.handle ?? 'them';
            flashHint(gained > 0 ? `Bounty +${CURRENCY_SYMBOL}${gained.toLocaleString('pt-PT')} from ${fromH} — pot ${CURRENCY_SYMBOL}${newBal.toLocaleString('pt-PT')}` : `Maxed out — cash out!`);
            return;
          }
          const loot: Loot = { crystals: Number(pl.crystals) || 0, items: (pl.items && typeof pl.items === 'object') ? pl.items as Record<string, number> : {} };
          if (lootIsEmpty(loot)) return;
          grantLoot(loot);
          const fromHandle = remotesRef.current.get(String(pl.from ?? ''))?.handle ?? 'them';
          const parts: string[] = []; if (loot.crystals > 0) parts.push(`${CURRENCY_SYMBOL}${loot.crystals.toLocaleString('pt-PT')}`);
          const ic = Object.values(loot.items).reduce((s, n) => s + n, 0); if (ic > 0) parts.push(`${ic} item${ic > 1 ? 's' : ''}`);
          flashHint(`Looted ${parts.join(' + ')} from ${fromHandle}`);
        })
        .subscribe(async status => {
          if (!alive || connectGen !== myGen) return;
          joinedRef.current = status === 'SUBSCRIBED';
          if (status === 'SUBSCRIBED') {
            setConnected(true);
            // Start item fetch immediately in the background — don't gate track() on it.
            const itemsP = fetchAllRoomItems(sb, room);
            // Resolve identity first, then track (track needs the correct handle).
            const a = await getAuthIdentity().catch(() => null);
            if (!alive || connectGen !== myGen) return;
            if (a?.handle) me.handle = a.handle;
            const swEf = getSwayEffect(); const spEf = getSpeedEffect();
            await ch.track({ id: me.id, handle: me.handle, skinId: me.skinId, fx: me.fx, fy: me.fy, lvl: me.lvl, swayIntensity: swEf.intensity, swayExpiry: swEf.expiresAt, speedMult: spEf.multiplier, speedExpiry: spEf.expiresAt, fly: flyRef.current ? 1 : 0, ...combatTrack() }).catch(() => {});
            if (!alive || connectGen !== myGen) return;
            // Wait for furniture AND the first presence sync (which populates remote avatars +
            // their effects). Both run in parallel; whichever is slower sets the pace.
            // The 600ms cap ensures a bad network never holds the loading screen indefinitely.
            const [itemRows] = await Promise.all([
              itemsP,
              new Promise<void>(resolve => {
                if (presenceSynced) { resolve(); return; }
                const iv = setInterval(() => { if (presenceSynced || !alive || connectGen !== myGen) { clearInterval(iv); resolve(); } }, 25);
                setTimeout(() => { clearInterval(iv); resolve(); }, 600);
              }),
            ]);
            if (!alive || connectGen !== myGen) return;
            ingestItemRows(itemRows);
            setRoomReady(true);
            if (roomMetaRef.current.discoverable) recordRoomVisit(room).catch(() => {});
          } else {
            setConnected(false);
            if (alive && (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT')) {   // self-heal: rebuild the channel
              if (rejoinTimer) clearTimeout(rejoinTimer);
              rejoinTimer = setTimeout(() => { try { sb.removeChannel(ch); } catch { /* ignore */ } connect(); }, 500);
            }
          }
        });
    };
    connect();

    const onResume = () => { if (document.visibilityState === 'visible' && channelRef.current && joinedRef.current) { const m = selfRef.current; const swEf = getSwayEffect(); const spEf = getSpeedEffect(); channelRef.current.track({ id: m.id, handle: m.handle, skinId: m.skinId, fx: m.fx, fy: m.fy, lvl: m.lvl, swayIntensity: swEf.intensity, swayExpiry: swEf.expiresAt, speedMult: spEf.multiplier, speedExpiry: spEf.expiresAt, fly: flyRef.current ? 1 : 0, ...combatTrack() }); } };
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
      // Combat FX lifetimes + knockout movement lock (fixed-timestep so they're refresh-rate independent).
      if (dmgFxRef.current.length) dmgFxRef.current = dmgFxRef.current.filter(d => { d.life--; d.z += 0.012; return d.life > 0; });
      if (projRef.current.length) projRef.current = projRef.current.filter(p => { p.life--; return p.life > 0; });
      if (koUntilRef.current > Date.now()) me.path = [];   // stay down (no walking) while knocked out
      if (arenaCountdownRef.current !== null) me.path = [];   // frozen during entry countdown
      let moving = false;
      if (++speedCheckRef.current >= 30) {
        speedCheckRef.current = 0; speedMultRef.current = getSpeedMultiplier(); swayIntensityRef.current = getSwayIntensity();
        const fa = getFlyActive(); flyRef.current = fa;
        if (fa !== flyingUiRef.current) {
          flyingUiRef.current = fa; setFlying(fa);
          if (channelRef.current && joinedRef.current) channelRef.current.send({ type: 'broadcast', event: 'pos', payload: { id: me.id, h: me.handle, s: me.skinId, icon: me.icon ?? undefined, fx: +me.fx.toFixed(2), fy: +me.fy.toFixed(2), lvl: me.lvl, wp: equippedWeaponSpec().id, fly: fa ? 1 : 0 } });
          if (!fa) {   // Wings expired mid-air → land on the surface below so you don't hang in the sky
            const k = key(clampTile(me.fx), clampTile(me.fy)), s = surfRef.current[k];
            me.lvl = s && s.length ? Math.max(...s) : Math.max(0, planLvl(clampTile(me.fx), clampTile(me.fy))); me.path = [];
          }
        }
      }
      if (me.path.length) {
        const wp = me.path[0]; const dx = wp.gx - me.fx, dy = wp.gy - me.fy; const d = Math.hypot(dx, dy);
        if (d < 0.12) { me.fx = wp.gx; me.fy = wp.gy; me.lvl = wp.z; me.path.shift(); }
        else { const s = Math.min(WALK * speedMultRef.current, d); me.fx += dx / d * s; me.fy += dy / d * s; moving = true; me.af += 1; strideRef.current += s; }
      }
      if (moving) { if (!wasMovingRef.current || strideRef.current >= 1.05) { strideRef.current = 0; musicRef.current?.footstep(); } }
      else { me.af += me.emote ? 1 : 0.3; if (me.emote) me.emoteAf = (me.emoteAf ?? 0) + 1; strideRef.current = 1.05; }   // primed so the next walk's first step sounds at once
      const targetZ = me.path.length ? me.path[0].z : me.lvl;   // climb toward the next surface as we walk
      me.z += (targetZ - me.z) * 0.25;
      if (me.bubbleLife > 0) me.bubbleLife--;
      const ch = channelRef.current;
      if (ch && joinedRef.current && arenaCountdownRef.current === null) {   // only emit while actually joined — never REST-fallback flood a dead channel
        const posPayload = () => ({ id: me.id, h: me.handle, s: me.skinId, icon: me.icon ?? undefined, fx: +me.fx.toFixed(2), fy: +me.fy.toFixed(2), lvl: me.lvl, wp: equippedWeaponSpec().id, fly: flyRef.current ? 1 : 0 });
        if (moving && ++posAccum.current >= (roomMetaRef.current.combat ? 2 : 5)) { posAccum.current = 0; heartbeatAccum.current = 0; ch.send({ type: 'broadcast', event: 'pos', payload: posPayload() }); }
        if (wasMovingRef.current && !moving) { heartbeatAccum.current = 0; ch.send({ type: 'broadcast', event: 'pos', payload: posPayload() }); }   // final position; no mid-session re-track (that bounced the channel)
        // Keep-alive: broadcast position every ~5 s while still so others can detect our disconnect within ~12 s.
        if (!moving && ++heartbeatAccum.current >= 300) { heartbeatAccum.current = 0; ch.send({ type: 'broadcast', event: 'pos', payload: posPayload() }); }
      }
      wasMovingRef.current = moving;
      // PORTALS activate by WALKING ONTO them — fires the instant your tile becomes a portal tile (whether
      // you stop on it OR walk straight over it), rising-edge so it triggers once per arrival; stepping off
      // re-arms it. No code → travel straight away; coded → prompt.
      { const cgx = clampTile(me.fx), cgy = clampTile(me.fy), ct = cgy * GRID + cgx;
        if (ct !== portalTileRef.current) {   // only scan when our tile actually changes (not every frame)
          portalTileRef.current = ct;
          const pt = portalAtTile(cgx, cgy); const pk = pt ? `${pt.gx},${pt.gy}` : null;
          if (pt && lastPortalKeyRef.current !== pk) { if (pt.message) { setPortalMessagePrompt(pt); } else if (pt.code) { setPortalPrompt(pt); setPortalCode(''); } else { travelToRef.current(pt); } }
          lastPortalKeyRef.current = pk;
          const nowObs = buildObscuredSet().has(ct);
          if (nowObs !== inObscuredRef.current) { inObscuredRef.current = nowObs; setInObscured(nowObs); }
          if (me.emote) { me.emote = null; me.emoteAf = 0; setCurrentEmote(null); if (ch && joinedRef.current) ch.send({ type: 'broadcast', event: 'emote', payload: { id: me.id, em: null } }); }
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
        // admin-placed play-triggers (hydrated as `arcade` items carrying a gameId) — each is its own
        // machine. Duel-flagged duel-ready triggers are handled by the duel-cabinet block below, not here.
        if (!near) for (const it of itemsRef.current) { if (it.kind === 'arcade' && it.gameId && !(it.gameRules?.duel && isDuelReady(it.gameId)) && adjTo(it.gx, it.gy)) { near = { gx: it.gx, gy: it.gy, games: [gameById(it.gameId)], rules: it.gameRules }; break; } }
        const nearKey = near ? `${near.gx},${near.gy}` : null;
        if (near && nearKey !== nearMachineRef.current) { musicRef.current?.chime(); setMachinePrompt(near); }
        nearMachineRef.current = nearKey;
      }
      // SHOPS — open the shop modal when the player steps adjacent to a shop trigger
      {
        const px = clampTile(me.fx), py = clampTile(me.fy);
        let nearShop: Item | null = null;
        for (const it of itemsRef.current) {
          if (it.kind === 'shop' && it.shopItems?.length) {
            const hit = it.shopTriggers?.length ? it.shopTriggers.some(t => px === t.gx && py === t.gy) : Math.max(Math.abs(px - it.gx), Math.abs(py - it.gy)) <= 1;
            if (hit) { nearShop = it; break; }
          }
        }
        const nearKey = nearShop ? `${nearShop.gx},${nearShop.gy}` : null;
        if (nearShop && nearKey !== nearShopRef.current) { musicRef.current?.chime(); setShopPrompt({ items: nearShop.shopItems!, name: nearShop.shopName ?? '' }); }
        nearShopRef.current = nearKey;
      }
      // DUEL CABINET — open the lobby (waiting room) when you step adjacent to a placed Duel Cabinet.
      {
        const px = clampTile(me.fx), py = clampTile(me.fy);
        let nearCab: { id: string; gameId: string } | null = null;
        for (const it of itemsRef.current) {
          if (Math.max(Math.abs(px - it.gx), Math.abs(py - it.gy)) !== 1) continue;
          // A dedicated duel cabinet (duelcab → Climb Race), OR any game trigger dropped with the ⚔ duel flag.
          if (it.kind === 'duelcab') { nearCab = { id: it.id, gameId: CLIMB_GAME_ID }; break; }
          if (it.kind === 'arcade' && it.gameId && it.gameRules?.duel && isDuelReady(it.gameId)) { nearCab = { id: it.id, gameId: it.gameId }; break; }
        }
        const nearKey = nearCab ? nearCab.id : null;
        if (nearCab && nearKey !== duelCabRef.current) { musicRef.current?.chime(); setDuelLobby({ cabId: nearCab.id, gameId: nearCab.gameId }); }
        duelCabRef.current = nearKey;
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
      for (const r of remotesRef.current.values()) {
        // Dead-reckoning: extrapolate from last received position using observed velocity,
        // capped at 12 ticks (~200ms) so a stalled update doesn't slide them forever.
        const ticksSinceRx = (performance.now() - (r.rxAt ?? 0)) / (1000 / 60);
        const extrap = Math.min(ticksSinceRx, 12);
        const extraX = r.tx + (r.vx ?? 0) * extrap, extraY = r.ty + (r.vy ?? 0) * extrap;
        const ddx = extraX - r.fx, ddy = extraY - r.fy;
        if (ddx * ddx + ddy * ddy > 2.25) { r.fx = extraX; r.fy = extraY; } else { r.fx += ddx * 0.3; r.fy += ddy * 0.3; }
        r.z += (r.lvl - r.z) * 0.28; r.af += Math.hypot(extraX - r.fx, extraY - r.fy) > 0.02 ? 1 : (r.emote ? 1 : 0.3); if (r.emote) r.emoteAf = (r.emoteAf ?? 0) + 1; if (r.bubbleLife > 0) r.bubbleLife--;
      }
      // Stale detection: avatars that haven't sent a pos in >12 s are treated as gone.
      // The 5-second heartbeat pos means connected users always have a fresh rxAt; only
      // disconnected ones (hard refresh, network drop) go silent and hit this threshold.
      { const nowMs = performance.now(); let pruned = false;
        for (const [id, r] of remotesRef.current) { if (r.rxAt && nowMs - r.rxAt > 12_000) { remotesRef.current.delete(id); pruned = true; } }
        if (pruned) setPopulation(remotesRef.current.size + 1); }
      // If every player in the room is knocked out, hazard NPCs reset to full HP.
      { const nowKo = Date.now(); const allKo = koUntilRef.current > nowKo && [...remotesRef.current.values()].every(r => r.koUntil && r.koUntil > nowKo);
        if (allKo) { for (const n of npcsRef.current) { if (n.hz && !n.defeated && !n.peaceful && n.hp != null && n.hz.maxHp && n.hp < n.hz.maxHp) { n.hp = n.hz.maxHp; if (n.nid) npcHpRef.current.set(n.nid, n.hz.maxHp); } } } }
      const sf = selfRef.current;
      for (const n of npcsRef.current) {   // pathfinding wander + speech for NPCs
        // ── respawn: a downed (non-'once') hazardous NPC comes back to full hp once its timer elapses ──
        if (n.hz && n.defeated && !n.peaceful && n.respawnAt && Number.isFinite(n.respawnAt) && Date.now() >= n.respawnAt) {
          n.defeated = false; n.hp = n.hz.maxHp; n.respawnAt = 0; n.lastNpcAtk = 0;
          if (n.nid) npcHpRef.current.set(n.nid, n.hp); rebuildHuntable();
        }
        // a downed hazardous NPC lies still (no wander/speech) until it respawns
        if (n.hz && n.defeated && !n.peaceful) { if (n.bubbleLife > 0) n.bubbleLife--; n.path = []; n.near = false; continue; }
        // ── hazardous NPC aggro: a live, hostile NPC chases the player and auto-swings in melee reach ──
        if (n.hz && !n.peaceful && !n.defeated && n.hp != null && n.hz.contactDamage > 0) {
          const distP = Math.hypot(n.fx - sf.fx, n.fy - sf.fy);
          if (distP <= 7) {   // wakes up within 7 tiles
            const now = Date.now();
            if (distP <= 1.5) {   // in reach → hold position and swing on cooldown
              n.path = []; n.af += 0.6;
              if (now - (n.lastNpcAtk ?? 0) >= n.hz.attackCooldownMs) { n.lastNpcAtk = now; npcAttackPlayer(n); }
            } else {   // chase: repath toward the player's tile a few times a second
              if (!n.path.length || (n.wanderCool ?? 0) <= 0) {
                const p = findPath(clampTile(n.fx), clampTile(n.fy), n.lvl, clampTile(sf.fx), clampTile(sf.fy), false);
                n.path = p && p.length ? p.slice(0, 6) : []; n.wanderCool = 18;
              }
              if (n.path.length) {
                const wp = n.path[0]; const dx = wp.gx - n.fx, dy = wp.gy - n.fy, d = Math.hypot(dx, dy);
                if (d < 0.12) { n.fx = wp.gx; n.fy = wp.gy; n.z = wp.z; n.lvl = wp.z; n.tx = wp.gx; n.ty = wp.gy; n.path.shift(); }
                else { const s = Math.min(WALK * 0.7, d); n.fx += dx / d * s; n.fy += dy / d * s; }   // a touch slower than you, so you can kite
              }
              n.af += 1; if ((n.wanderCool ?? 0) > 0) n.wanderCool--;
            }
            // fall through — bubbleLife, cool, near, and speech handled by the shared path below
          }
        }
        if (n.roam && n.hx != null && n.hy != null) {
          if (n.path.length) {   // advance along current path (collision-aware waypoints)
            const wp = n.path[0]; const dx = wp.gx - n.fx, dy = wp.gy - n.fy, d = Math.hypot(dx, dy);
            if (d < 0.12) { n.fx = wp.gx; n.fy = wp.gy; n.z = wp.z; n.lvl = wp.z; n.tx = wp.gx; n.ty = wp.gy; n.path.shift(); }
            else { const nspd = (n.speedExpiry ?? 0) > Date.now() ? (n.speedMult ?? 1) : 1; const s = Math.min(WALK * 0.55 * nspd, d); n.fx += dx / d * s; n.fy += dy / d * s; }
            n.af += 1;
          } else {
            n.af += 0.4;   // idle breathe while waiting
            if (n.wanderCool > 0) { n.wanderCool--; }
            else if (Math.hypot(n.fx - sf.fx, n.fy - sf.fy) >= 2) {   // only wander when no player is within 2 tiles
              const ang = Math.random() * 6.283, dist = Math.random() * 4;
              const hx = n.hx, hy = n.hy;
              const tx = Math.max(hx - 4, Math.min(hx + 4, Math.round(hx + Math.cos(ang) * dist)));
              const ty = Math.max(hy - 4, Math.min(hy + 4, Math.round(hy + Math.sin(ang) * dist)));
              const p = findPath(clampTile(n.fx), clampTile(n.fy), n.lvl, tx, ty, false);   // NPCs never fly
              if (p && p.length) { n.path = p; n.wanderCool = 540 + Math.floor(Math.random() * 301); }   // 9–14 s at 60 Hz
              else n.wanderCool = 60;   // short retry if no path found
            }
          }
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
          if (!said && n.lines && n.lines.length) { if (!n.lineQueue || !n.lineQueue.length) { n.lineQueue = [...n.lines].sort(() => Math.random() - 0.5); } n.bubble = n.lineQueue.shift()!; said = true; }
          if (said) { n.bubbleLife = 240; n.cool = 540 + Math.floor(Math.random() * 121); }
        }
        n.near = near;
      }
    };

    const diamond = (cx: number, cy: number, hw: number, hh: number) => { ctx.beginPath(); ctx.moveTo(cx, cy - hh); ctx.lineTo(cx + hw, cy); ctx.lineTo(cx, cy + hh); ctx.lineTo(cx - hw, cy); ctx.closePath(); };
    // Furni sprites are drawn by the shared renderer in @/lib/furniRender (drawFurniSprite).

    // Avatar BODY (shadow + skin) — drawn in the depth-sorted pass so it occludes / is occluded correctly.
    const drawAvatarBody = (a: Avatar, isSelf: boolean, isNpc = false) => {
      const wade = isWater(clampTile(a.fx), clampTile(a.fy)) ? 6 : 0;   // sink + ripple when standing in a pool
      const p = iso(a.fx, a.fy, a.z); const sx = p.sx, sy = p.sy + wade;
      // Floor indicators (shadow + glow) snap to the actual surface level so they don't lerp through
      // platform side-face geometry while the body sprite smoothly transitions between elevations.
      const sy_floor = iso(a.fx, a.fy, a.lvl).sy + wade;
      const pi = a.skinId && a.skinId.startsWith('person:') ? parsePerson(a.skinId) : null;
      const cr = a.skinId && isCreatureId(a.skinId) ? parseCreature(a.skinId) : null;
      const bodyScale = (a as { bodyScale?: number }).bodyScale ?? 1;   // big-NPC scale (default 1)
      const col = pi ? personPrimaryColor(pi) : cr ? cr.color : a.icon ? iconPrimaryColor(a.icon) : skinById(a.skinId).color;
      const moving = isSelf ? selfRef.current.path.length > 0 : Math.hypot(a.tx - a.fx, a.ty - a.fy) > 0.02;
      const flying = isSelf ? flyRef.current : !!(a.flying);   // Wings active → hover + aura + flapping wings
      const planBase = flying ? Math.max(0, planRef.current[key(clampTile(a.fx), clampTile(a.fy))] ?? 0) : 0;
      const sy_ground = flying ? iso(a.fx, a.fy, planBase).sy + wade : sy_floor;
      if (wade) { ctx.save(); ctx.strokeStyle = hexA('#bff2ff', 0.7); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(sx, sy_floor, 15 + Math.sin(framesRef.current * 0.12) * 2, 7, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }
      ctx.save(); ctx.globalAlpha = 0.4; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(sx, sy_ground, 18 * bodyScale, 8 * bodyScale, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      if (!isNpc) { ctx.save(); ctx.globalAlpha = 0.5; ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 14; ctx.beginPath(); ctx.ellipse(sx, sy_ground, 12 * bodyScale, 5 * bodyScale, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
      const em = a.emote ?? null;
      let bob: number, sway = 0, spin = 0, legFold = 0;
      if (em === 'dance') {
        const CYCLE = 186, SEG = CYCLE / 8, t = a.af % CYCLE, pt = (t % SEG) / SEG;
        const smooth = (x: number) => x * x * (3 - 2 * x);
        const X = 8, JUMP = 14, SB = 3;
        switch (Math.floor(t / SEG)) {
          case 0: sway = -X + smooth(pt) * X * 2; bob = -Math.sin(pt * Math.PI) * JUMP; break;             // jump right
          case 1: sway =  X; bob = 0; break;                                                                // pause right
          case 2: sway =  X - smooth(pt) * X * 2; bob = -Math.abs(Math.sin(pt * Math.PI * 2)) * SB; break; // slide left
          case 3: sway = -X + smooth(pt) * X * 2; bob = -Math.abs(Math.sin(pt * Math.PI * 2)) * SB; break; // slide right
          case 4: sway =  X - smooth(pt) * X * 2; bob = -Math.sin(pt * Math.PI) * JUMP; break;             // jump left
          case 5: sway = -X; bob = 0; break;                                                                // pause left
          case 6: sway = -X + smooth(pt) * X * 2; bob = -Math.abs(Math.sin(pt * Math.PI * 2)) * SB; break; // slide right
          default: sway =  X - smooth(pt) * X * 2; bob = -Math.abs(Math.sin(pt * Math.PI * 2)) * SB; break; // slide left
        }
      } else if (em === 'jump') {
        bob = -Math.max(0, Math.sin(a.af * 0.1)) * 22;
      } else if (em === 'jjack') {
        bob = -Math.max(0, Math.sin(a.af * 0.1)) * 22;
      } else if (em === 'levitate') {
        const introT = Math.min((a.emoteAf ?? 0) / 60, 1);
        const ease = introT * introT * (3 - 2 * introT);
        bob = ease * (-12 - Math.sin(a.af * 0.05) * 6);
        legFold = ease;
      } else {
        bob = moving ? Math.sin(a.af * 0.3) * 3 : Math.sin(a.af * 0.07) * 1.1;   // idle breathing when still
      }
      if (flying) bob += -14 - Math.sin(a.af * 0.06) * 4;   // float clear of the surface, gentle hover
      // Drunk tilt: rotate body around the feet pivot so feet stay grounded.
      // Angle and bob both scale linearly with the active item's intensity.
      const activeSway = isSelf ? swayIntensityRef.current : ((a.swayExpiry ?? 0) > Date.now() ? (a.swayIntensity ?? 0) : 0);
      const drunkTilt = activeSway > 0 ? Math.sin(framesRef.current * 0.035) * activeSway * 0.0175 : 0;
      const drunkBob  = activeSway > 0 ? Math.sin(framesRef.current * 0.07)  * 1.5 : 0;
      const armLift = em === 'jjack' ? Math.max(0, Math.sin(a.af * 0.1)) : 0;
      const shoulderShrug = em === 'dance' ? 4 : 1;
      // Hoist combat state so weaponArmLift is available for drawPerson and the overlay pass below.
      const nowT = Date.now();
      const swinging = !!a.attackUntil && a.attackUntil > nowT;
      const k_atk = swinging ? Math.max(0, Math.min(1, (a.attackUntil! - nowT) / 280)) : 0;
      const weaponId = isSelf ? equippedWeaponSpec().id : a.weapon;
      const wsp = weaponId ? weaponOf(weaponId) : null;
      // Right arm rotates upward when swinging a melee weapon (person avatars only).
      const weaponArmLift = (pi && swinging && wsp) ? k_atk : 0;
      if (em === 'levitate') {
        ctx.save(); ctx.globalAlpha = 0.5 + Math.sin(a.af * 0.08) * 0.2;
        ctx.strokeStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 20; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.ellipse(sx, sy_floor, 20 + Math.sin(a.af * 0.08) * 4, 9, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
      if (flying) {   // pulsing lift-ring on the ground tile below the hovering body
        ctx.save(); ctx.globalAlpha = 0.35 + Math.sin(a.af * 0.1) * 0.15;
        ctx.strokeStyle = '#bff2ff'; ctx.shadowColor = '#9fe3ff'; ctx.shadowBlur = 16; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.ellipse(sx, sy_ground, 15 + Math.sin(a.af * 0.1) * 3, 7, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
      ctx.save();
      ctx.translate(sx + sway, sy);                          // feet stay grounded; dance sway still slides whole avatar
      if (drunkTilt) ctx.rotate(drunkTilt);                  // tilt body around the feet pivot
      if (bodyScale !== 1) ctx.scale(bodyScale, bodyScale);  // grow big NPCs upward from their feet
      ctx.translate(0, -30 + bob + drunkBob);                // move up to body centre
      if (spin) ctx.rotate(spin);
      ctx.shadowColor = col; ctx.shadowBlur = em === 'levitate' ? 38 : (isSelf ? 22 : 12);
      if (flying) {   // feathered wings behind the body, flapping with the hover cadence
        const flap = (Math.sin(a.af * 0.22) + 1) * 0.5;   // 0..1
        ctx.save(); ctx.globalAlpha = 0.85; ctx.fillStyle = '#eaffff'; ctx.shadowColor = '#9fe3ff'; ctx.shadowBlur = 14;
        for (const s of [-1, 1]) {
          ctx.save();
          ctx.translate(s * 11, -6);
          ctx.rotate(s * (0.45 + flap * 0.5));   // sweep up on the flap
          ctx.beginPath(); ctx.ellipse(s * 7, 0, 7, 18, 0, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        }
        ctx.restore();
        ctx.shadowColor = col; ctx.shadowBlur = isSelf ? 22 : 12;   // restore body glow
      }
      if (wsp && wsp.style === 'magic' && themeRef.current.combat) {
        const p = Math.sin(a.af * 0.1);
        ctx.save();
        ctx.globalAlpha = 0.18 + p * 0.08;
        ctx.fillStyle = '#cc44ff'; ctx.shadowColor = '#9900ff'; ctx.shadowBlur = 28 + p * 8;
        ctx.beginPath(); ctx.ellipse(0, 0, 22, 30, 0, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 0.55 + p * 0.2;
        ctx.strokeStyle = '#dd88ff'; ctx.shadowBlur = 16 + p * 8; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.ellipse(0, 0, 22, 30, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
      if (pi) drawPerson(ctx, pi, 42, 56, a.af, armLift, shoulderShrug, legFold, weaponArmLift);
      else if (cr) drawSkinShape(ctx, cr.shape, cr.color, 40, 52, a.af, cr.accent);
      else if (a.icon) drawIconSpec(ctx, a.icon, 46, a.af);
      else { const sk = skinById(a.skinId); drawSkinShape(ctx, sk.shape, sk.color, 38, 50, a.af); }
      ctx.restore();
      // ---- combat overlays (screen space) ----
      // nowT / swinging / k_atk / weaponId / wsp were hoisted above for weaponArmLift.
      const handY = sy - 26 + bob;
      // Weapon position always tracks the arm's hand endpoint (person avatars) so it stays glued to the arm.
      let weapHandX: number, weapHandY: number;
      if (pi) {
        const s_dp = 56 / 50;
        const armTheta = -weaponArmLift * Math.PI * 0.5;
        const shoulderX = (sx + sway) + ((pi.g === 1 ? 9 : 7.6) + 1.4) * s_dp;
        const shoulderY = (sy - 30 + bob) + (-7 + 1) * s_dp;
        weapHandX = shoulderX - 12 * s_dp * Math.sin(armTheta);
        weapHandY = shoulderY + 12 * s_dp * Math.cos(armTheta);
      } else {
        weapHandX = sx + 15; weapHandY = handY;
      }
      if (wsp && wsp.id !== 'fists' && themeRef.current.combat) {   // held weapon by the hand; only visible in combat rooms
        ctx.save(); ctx.font = `700 ${swinging ? 30 : 22}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.translate(weapHandX, weapHandY); ctx.rotate(Math.PI + 0.35);
        if (wsp.style === 'gun') ctx.scale(1, -1);
        ctx.fillText(wsp.emoji, 0, 0); ctx.restore();
      }
      if (swinging) {   // a quick white slash arc
        ctx.save(); ctx.globalAlpha = 0.7 * k_atk; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.shadowColor = '#fff'; ctx.shadowBlur = 8;
        ctx.beginPath(); ctx.arc(weapHandX, weapHandY, 20, -0.9, 0.7); ctx.stroke(); ctx.restore();
      }
      if (a.hitUntil && a.hitUntil > nowT) {   // red flash when struck
        const k = (a.hitUntil - nowT) / 220;
        ctx.save(); ctx.globalAlpha = 0.5 * k; ctx.fillStyle = '#ff2a2a'; ctx.beginPath(); ctx.ellipse(sx, sy - 26, 19, 28, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      }
      if (a.koUntil && a.koUntil > nowT && !isSelf) {   // remote knocked-out marker
        ctx.save(); ctx.font = '700 18px serif'; ctx.textAlign = 'center'; ctx.fillText('💫', sx, sy - 64); ctx.restore();
      }
    };
    // Avatar NAME LABEL + chat BUBBLE — drawn in a separate pass AFTER everything, so a tall piece of
    // furniture in front can never hide who someone is or what they just said.
    const drawAvatarLabel = (a: Avatar, isSelf: boolean) => {
      if (!a.handle) return;
      const wade = isWater(clampTile(a.fx), clampTile(a.fy)) ? 6 : 0;
      const p = iso(a.fx, a.fy, a.z); const sx = p.sx, sy = p.sy + wade;
      const col = a.skinId && a.skinId.startsWith('person:') ? personPrimaryColor(parsePerson(a.skinId)) : a.skinId && isCreatureId(a.skinId) ? parseCreature(a.skinId).color : a.icon ? iconPrimaryColor(a.icon) : skinById(a.skinId).color;
      ctx.save(); ctx.font = '700 11px Helvetica, Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const nw = ctx.measureText(a.handle).width + 14, ny = sy + 14;
      ctx.fillStyle = 'rgba(6,6,10,0.9)'; ctx.beginPath(); ctx.roundRect(sx - nw / 2, ny - 8, nw, 16, 8); ctx.fill();   // solid plate so the name reads over any avatar/atmosphere
      ctx.strokeStyle = isSelf ? hexA(col, 0.85) : 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = isSelf ? col : '#fff'; ctx.fillText(a.handle, sx, ny); ctx.restore();
      // HP bar — sits just above the name plate. Self/remotes show in PvP rooms; hazardous NPCs show
      // their own bar anywhere (but not once they're peaceful/defeated). Self reads live hp.
      const haz = a as { hz?: HazardSpec; defeated?: boolean; peaceful?: boolean };
      const npcLift = (((a as { bodyScale?: number }).bodyScale ?? 1) - 1) * 50;   // raise bar/bubble clear of a big body
      const liveHazNpc = !!haz.hz && !haz.peaceful && !haz.defeated;
      const hideNpcBar = !!haz.hz && (haz.peaceful || haz.defeated);
      if ((themeRef.current.combat || liveHazNpc) && !hideNpcBar) {
        let hp = 0, max = MAX_HP, absorb = 0, have = false;
        if (isSelf) { const h = getHP(); hp = h.hp; max = h.max; absorb = h.absorb; have = true; }
        else if (a.hp != null) { hp = a.hp; max = a.maxHp ?? MAX_HP; absorb = a.absorb ?? 0; have = true; }
        if (have) {
          const bw = 36, bh = 4, bx = sx - bw / 2, by = sy - 2 - npcLift;
          const frac = Math.max(0, Math.min(1, hp / max));
          ctx.save();
          ctx.fillStyle = 'rgba(6,6,10,0.9)'; ctx.beginPath(); ctx.roundRect(bx - 1, by - 1, bw + 2, bh + 2, 2); ctx.fill();
          ctx.fillStyle = frac > 0.5 ? '#1ED760' : frac > 0.25 ? '#ffb020' : '#ff3b3b';
          ctx.fillRect(bx, by, bw * frac, bh);
          if (absorb > 0) { const aw = Math.min(bw, bw * (absorb / max)); ctx.fillStyle = '#7fd0ff'; ctx.fillRect(bx, by - 2.5, aw, 2); }   // shield buffer pip
          ctx.restore();
        }
      }
      if (a.bubbleLife > 0 && a.bubble) {
        const alpha = Math.min(1, a.bubbleLife / 30); ctx.save(); ctx.globalAlpha = alpha; ctx.font = '600 15px Helvetica, Arial';
        const lines = wrapBubble(a.bubble); const lh = 19, padY = 7;
        const tw = Math.max(...lines.map(l => ctx.measureText(l).width)), bw = tw + 22, bh = lines.length * lh + padY * 2;
        const bx = sx - bw / 2, by = sy - 88 - bh - npcLift;   // sit above the 2× scaled head (top ≈ sy-71), clearing big bodies
        ctx.fillStyle = 'rgba(10,10,18,0.94)'; ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 8); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(sx - 6, by + bh); ctx.lineTo(sx + 6, by + bh); ctx.lineTo(sx, by + bh + 8); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        lines.forEach((l, i) => ctx.fillText(l, sx, by + padY + lh / 2 + i * lh));
        ctx.restore();
      }
    };

    const draw = () => {
      const theme = themeRef.current; const t = framesRef.current;
      const atmo: Atmo = bgRef.current !== 'auto' ? bgRef.current : theme.outdoor ? scheduleAtmo() : (theme.day ? 'day' : 'night');
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
      else if (atmo === 'disco') { bg.addColorStop(0, '#08040f'); bg.addColorStop(0.5, '#0e0618'); bg.addColorStop(1, '#050310'); }
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
      } else if (atmo === 'disco') {   // disco ball reflections — coloured light patches sweeping the void + sparkle dots
        ctx.save();
        for (let i = 0; i < 18; i++) { const ph = t * 0.025 + i * (Math.PI * 2 / 18); const x = STAGE_W * 0.5 + Math.cos(ph * 0.71 + i * 0.38) * STAGE_W * 0.46; const y = STAGE_H * 0.38 + Math.sin(ph * 0.53 + i * 0.85) * STAGE_H * 0.36; const hue = (t * 2.5 + i * 20) % 360; const a = 0.13 + 0.09 * Math.abs(Math.sin(t * 0.06 + i * 1.1)); const rg = ctx.createRadialGradient(x, y, 2, x, y, 70); rg.addColorStop(0, `hsla(${hue},100%,68%,${a})`); rg.addColorStop(1, `hsla(${hue},100%,68%,0)`); ctx.fillStyle = rg; ctx.beginPath(); ctx.ellipse(x, y, 70, 38, 0, 0, Math.PI * 2); ctx.fill(); }
        for (let i = 0; i < 35; i++) { const x = ((i * 149.7 + t * (i % 2 ? 1.1 : -0.9)) % (STAGE_W + 20)); const y = (i * 83.1 + Math.sin(t * 0.05 + i * 0.6) * 18) % (STAGE_H * 0.75); const hue = (t * 5 + i * 10) % 360; ctx.globalAlpha = Math.max(0, Math.sin(t * 0.12 + i * 0.74)) * 0.85; ctx.fillStyle = `hsl(${hue},100%,82%)`; const s = i % 7 === 0 ? 3 : 2; ctx.fillRect(x, y, s, s); }
        ctx.restore();
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
          else if (mat === 13) { ctx.fillStyle = odd ? '#8a8a96' : '#797986'; ctx.fill(); ctx.strokeStyle = 'rgba(20,20,30,0.18)'; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(b.sx - TW * 0.5, b.sy); ctx.lineTo(b.sx + TW * 0.5, b.sy); ctx.moveTo(b.sx, b.sy - TH * 0.5); ctx.lineTo(b.sx, b.sy + TH * 0.5); ctx.stroke(); }   // concrete — flat gray with joint lines
          else if (mat === 14) { ctx.fillStyle = odd ? '#9a9690' : '#87837c'; ctx.fill(); ctx.fillStyle = 'rgba(36,30,22,0.28)'; for (let q = 0; q < 7; q++) ctx.fillRect(b.sx + ((gx * 11 + gy * 7 + q * 17) % 30) - 15, b.sy + ((gy * 9 + gx * 5 + q * 13) % 18) - 9, 2, 2); }   // gravel — speckled pebbles
          else if (mat === 15) { ctx.fillStyle = odd ? '#7a5a3a' : '#6a4e2e'; ctx.fill(); ctx.fillStyle = 'rgba(28,14,6,0.22)'; for (let q = 0; q < 5; q++) ctx.fillRect(b.sx + ((gx * 13 + gy * 9 + q * 19) % 32) - 16, b.sy + ((gy * 11 + gx * 7 + q * 11) % 20) - 10, 2.5, 1.5); }   // dirt — earthy brown with dark flecks
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
      // Trigger tile selection — green overlays for selected tiles + dashed cursor on hover
      if (ui.triggerMode) {
        for (const k of sTriggerTilesRef.current) {
          const [tgx, tgy] = k.split('_').map(Number); const L = Math.max(0, planLvl(tgx, tgy));
          const { sx, sy } = iso(tgx, tgy, L);
          diamond(sx, sy, TW, TH); ctx.fillStyle = hexA('#1ED760', 0.35); ctx.fill();
          ctx.strokeStyle = '#1ED760'; ctx.lineWidth = 2; diamond(sx, sy, TW, TH); ctx.stroke();
        }
        if (hv && lvl(hv.gx, hv.gy) >= 0) {
          const { sx, sy } = iso(hv.gx, hv.gy, lvl(hv.gx, hv.gy));
          const sel = sTriggerTilesRef.current.has(`${hv.gx}_${hv.gy}`);
          diamond(sx, sy, TW, TH); ctx.fillStyle = hexA('#1ED760', sel ? 0.55 : 0.18); ctx.fill();
          ctx.strokeStyle = '#1ED760'; ctx.lineWidth = 2; ctx.setLineDash([4, 4]); diamond(sx, sy, TW, TH); ctx.stroke(); ctx.setLineDash([]);
        }
      }
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
        if (ii.portalHidden || ii.gameHidden || ii.gameSet || ii.kind === 'shop') {
          if (uiRef.current.decorOpen || modRef.current) {
            const col = ii.portalHidden ? '#cc66ff' : ii.kind === 'shop' ? '#1ED760' : '#ffd23a';
            const pulse = 0.3 + 0.2 * Math.sin(framesRef.current * 0.08); ctx.save();
            const g = ctx.createRadialGradient(sx, sy, 1, sx, sy, TW * 0.85); g.addColorStop(0, hexA(col, 0.14 + 0.28 * pulse)); g.addColorStop(1, hexA(col, 0));
            ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(sx, sy, TW * 0.85, TH * 0.85, 0, 0, Math.PI * 2); ctx.fill();
            ctx.globalAlpha = uiRef.current.decorOpen ? 0.7 : 0.45; ctx.strokeStyle = col; ctx.setLineDash([4, 4]); ctx.lineWidth = 1.5; diamond(sx, sy, TW * 0.7, TH * 0.7); ctx.stroke(); ctx.restore();
          }
          return;
        }
        if (lift > 0 && dd.walk && dd.cat !== 'constr' && dd.special !== 'neonarch' && dd.special !== 'arch' && dd.special !== 'disco' && dd.special !== 'ball_hc') drawSupports(ii, z, sw, sh);
        drawFurniSprite(ctx, ii.kind, sx, sy, theme.accent, framesRef.current, ii.dir || 0);
      } }); }
      // Compute a sort key for an avatar that guarantees it renders after any item whose footprint
      // contains the avatar's current tile (Case 1: on-footprint — covers rugs, platforms, seats) or
      // whose front face the avatar is standing directly against (Case 2: adjacent south/east face of
      // multi-tile items — fixes furniture briefly rendering in front when 1 tile ahead on either axis).
      const avatarS = (fx: number, fy: number, lvl: number, tb: number) => {
        const cx = clampTile(fx), cy = clampTile(fy);
        let s = fx + fy + lvl * 0.02 + tb;
        for (const it of allItems) {
          const [sw, sh] = effSpan(it.kind, it.dir || 0);
          const surf = Math.max(0, planLvl(it.gx, it.gy)) + (it.elev || 0) + (defOf(it.kind).h || 0);
          const front = (it.gx + sw - 1) + (it.gy + sh - 1) + surf * 0.02;
          const inX = cx >= it.gx && cx < it.gx + sw, inY = cy >= it.gy && cy < it.gy + sh;
          if (inX && inY) { s = Math.max(s, front + 0.01); }
          else if ((sw > 1 || sh > 1) && ((cx === it.gx + sw && inY) || (cy === it.gy + sh && inX))) { s = Math.max(s, front + 0.01); }
        }
        return s;
      };
      for (const n of npcsRef.current) { const nn = n; ents.push({ s: avatarS(nn.fx, nn.fy, nn.lvl, 0.005), draw: () => drawAvatarBody(nn, false, true) }); }
      ents.push({ s: avatarS(selfRef.current.fx, selfRef.current.fy, selfRef.current.lvl, 0.01), draw: () => drawAvatarBody(selfRef.current, true) });
      for (const r of remotesRef.current.values()) { const rr = r; ents.push({ s: avatarS(rr.fx, rr.fy, rr.lvl, 0.01), draw: () => drawAvatarBody(rr, false) }); }
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
      // Projectiles in flight (interpolate start→target by elapsed fraction).
      for (const p of projRef.current) {
        const f = 1 - p.life / p.max;
        const gx = p.fx0 + (p.fx1 - p.fx0) * f, gy = p.fy0 + (p.fy1 - p.fy0) * f, gz = p.z0 + (p.z1 - p.z0) * f;
        const { sx, sy } = iso(gx, gy, gz);
        if (p.style === 'gun') {
          // Thin tracer line: draw from a short tail behind to the bullet tip.
          const tailF = Math.max(0, f - 0.2);
          const tx = p.fx0 + (p.fx1 - p.fx0) * tailF, ty = p.fy0 + (p.fy1 - p.fy0) * tailF, tz = p.z0 + (p.z1 - p.z0) * tailF;
          const { sx: tsx, sy: tsy } = iso(tx, ty, tz);
          ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = p.color; ctx.shadowColor = p.color; ctx.shadowBlur = 5; ctx.lineWidth = 1.5; ctx.lineCap = 'butt';
          ctx.beginPath(); ctx.moveTo(tsx, tsy); ctx.lineTo(sx, sy); ctx.stroke(); ctx.restore();
        } else {
          ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = p.color; ctx.shadowColor = p.color; ctx.shadowBlur = 12;
          ctx.beginPath(); ctx.arc(sx, sy, 5, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        }
      }
      // Floating damage numbers.
      for (const d of dmgFxRef.current) {
        const { sx, sy } = iso(d.fx, d.fy, d.z);
        ctx.save(); ctx.globalAlpha = Math.max(0, Math.min(1, d.life / 30)); ctx.font = '800 15px Helvetica, Arial';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.85)';
        ctx.strokeText(d.text, sx, sy - 40); ctx.fillStyle = d.color; ctx.fillText(d.text, sx, sy - 40); ctx.restore();
      }
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
  // Walk to the nearest open tile adjacent to (tgx, tgy). No-op if already adjacent.
  const walkAdjacentTo = (tgx: number, tgy: number) => {
    const me = selfRef.current;
    const mx = clampTile(me.fx), my = clampTile(me.fy);
    if (Math.max(Math.abs(mx - tgx), Math.abs(my - tgy)) <= 1) return;
    const dirs: [number, number][] = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]];
    dirs.sort(([ax,ay],[bx,by]) => Math.hypot(tgx+ax-mx,tgy+ay-my) - Math.hypot(tgx+bx-mx,tgy+by-my));
    for (const [dx, dy] of dirs) {
      const tx = tgx + dx, ty = tgy + dy;
      if (tx < 0 || ty < 0 || tx >= GRID || ty >= GRID) continue;
      const k = key(tx, ty);
      if (solidRef.current[k] || !surfRef.current[k].length) continue;
      const p = findPath(mx, my, me.lvl, tx, ty); if (p && p.length) { me.path = p; return; }
    }
  };
  const onPointerDown = (e: React.PointerEvent) => {
    setEmoteOpen(false);
    if (koUntilRef.current > Date.now() || arenaCountdownRef.current !== null) return;   // knocked out or in entry countdown
    const { gx, gy } = evtTile(e);
    if (planLvl(gx, gy) < 0) return;   // clicked off the room footprint / a void tile
    // COMBAT — in a PvP room there's no tap-targeting: you walk with taps (to get in reach) and swing
    // with F / the punch button, which hits everyone within your weapon's radius. So taps fall through
    // to normal movement below.
    // Hidden easter egg — the wall at the top-centre of the Terminal room pays out, once.
    // Requires the player to be adjacent (Chebyshev ≤ 1); clicking from afar falls through
    // to the solid-tile redirect so they walk up first.
    if (room === 't_terminal' && gx === 5 && gy === 1 && !eggClaimed) {
      const { fx, fy } = selfRef.current;
      if (Math.max(Math.abs(clampTile(fx) - 5), Math.abs(clampTile(fy) - 1)) <= 1) {
        setEggClaimed(true); addBalance(EASTER_EGG_REWARD); musicRef.current?.chime();
        flashHint(`The wall gives. ${CURRENCY_SYMBOL}+${EASTER_EGG_REWARD} ✦`);
        return;
      }
      // Too far away — fall through so the solid-redirect routes them toward the wall.
    }
    if (sTriggerMode) { const k = `${gx}_${gy}`; setSTriggerTiles(cur => cur.includes(k) ? cur.filter(t => t !== k) : [...cur, k]); return; }
    if (placeLore) { placeTileLoreAt(gx, gy); return; }
    if (placeNpc) { placeNpcAt(gx, gy); return; }
    if (tileMode) { paintTile(gx, gy); startPaintDrag(e, null); return; }                                 // admin floor-paint (drag to sweep)
    if (placingPrefab) { placePrefab(placingPrefab, gx, gy); return; }
    if (placingKind) {
      placeItem(placingKind, gx, gy);
      if (isFloorPaint(placingKind)) startPaintDrag(e, placingKind);
      else if (lastPlacedShopIdRef.current) {
        setSTriggerMode(true); setSTriggerShopId(lastPlacedShopIdRef.current); setSTriggerTiles([]);
        setPlacingKind(null); lastPlacedShopIdRef.current = null;
      }
      return;
    }
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
    // Clicking a tile occupied by another player offers interaction (not in tutorial, decor, or a PvP room — there a tap attacks).
    if (!tutorial && !decorOpen && !roomMetaRef.current.combat && !interactSession && !interactWaiting && !interactPrompt && !npcInteract) {
      for (const [rid, remote] of remotesRef.current) {
        if (Math.round(remote.fx) === gx && Math.round(remote.fy) === gy) {
          setInteractPrompt({ id: rid, handle: remote.handle });
          walkAdjacentTo(gx, gy);
          return;
        }
      }
    }
    // Clicking a tile occupied by an NPC opens gift interaction.
    if (!tutorial && !decorOpen && !interactSession && !interactWaiting && !interactPrompt && !npcInteract) {
      for (const npc of npcsRef.current) {
        if (Math.round(npc.fx) === gx && Math.round(npc.fy) === gy) {
          if (npc.hz && !npc.peaceful && !npc.defeated) {
            walkAdjacentTo(gx, gy);
            if (roomMetaRef.current.combat) { setNpcTargetPrompt({ nid: npc.nid ?? npc.handle, handle: npc.handle }); }
            else { flashHint(`${npc.handle} is hostile — press F to attack`); }
            return;
          }
          setNpcInteract({ handle: npc.handle, nid: npc.nid ?? npc.handle, mode: 'prompt' });
          walkAdjacentTo(gx, gy);
          return;
        }
      }
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
    // Wings: a plain tap flies you straight to that tile at your CURRENT altitude, gliding over furniture
    // and walls. Tap where you want to be, then ▼ to land — no surface snapping, no solid-tile redirect.
    if (flyRef.current) { const fp = flyPathTo(gx, gy); if (fp.length) me.path = fp; return; }
    // Clicking ON furniture/construction redirects to the nearest open tile instead of no-op'ing.
    // Exception: if the player is already inside an obscured area, don't eject them — just stay put.
    let dest = { gx, gy };
    if (solidRef.current[key(gx, gy)]) {
      const playerObscured = buildObscuredSet().has(key(clampTile(me.fx), clampTile(me.fy)));
      if (!playerObscured) { const near = nearestUnobscuredTile(gx, gy); if (near) dest = near; }
      else return;
    }
    const p = findPath(clampTile(me.fx), clampTile(me.fy), me.lvl, dest.gx, dest.gy); if (p && p.length) me.path = p;
  };
  // Move the player exactly one tile in the given grid delta — used by the obscured-area move pad.
  const moveStep = (dgx: number, dgy: number) => {
    const me = selfRef.current;
    const fx = clampTile(me.fx), fy = clampTile(me.fy);
    const tx = fx + dgx, ty = fy + dgy;
    if (tx < 0 || ty < 0 || tx >= GRID || ty >= GRID) return;
    const k = key(tx, ty);
    if (solidRef.current[k] || !surfRef.current[k].length) return;
    const reachable = surfRef.current[k].filter(z => flyRef.current || Math.abs(z - me.lvl) <= 1.001);
    if (!reachable.length) return;
    me.path = [{ gx: tx, gy: ty, z: Math.max(...reachable) }];
  };
  // Wings vertical command (▲/▼ pad): FREE altitude. Each press rises/sinks exactly one level — mid-air
  // hovering allowed, no snapping to surfaces. Up goes a few levels above the tallest build (open sky);
  // down stops at the ground under you. Keeps any in-progress horizontal glide, just at the new height.
  const flyVert = (dir: number) => {
    if (!flyRef.current) return;
    const me = selfRef.current;
    const floor = Math.max(0, planLvl(clampTile(me.fx), clampTile(me.fy)));   // can't sink below the ground beneath you
    const ceil = Math.ceil(peakRef.current) + 4;                              // a few levels of open sky above the tallest build
    const z = Math.max(floor, Math.min(ceil, Math.round(me.lvl) + dir));      // free 1-level step, clamped to [ground, sky]
    if (z === me.lvl) { flashHint(dir > 0 ? 'Already at max height' : 'Already on the ground'); return; }
    me.lvl = z;                                          // change altitude in place; me.z lerps for a smooth rise/sink
    for (const wp of me.path) wp.z = z;                  // keep flying horizontally, now at the new altitude
  };
  // Free-flight route while Wings is active: BFS over in-footprint tiles, ignoring surfaces, furniture and
  // walls (you're airborne) — holds your current altitude the whole way so you glide over everything. Land
  // by pressing ▼ to descend onto a roof/floor. Returns constant-z waypoints, or [] if unreachable/off-map.
  const flyPathTo = (tx: number, ty: number) => {
    const me = selfRef.current; const z = me.lvl;
    const sx = clampTile(me.fx), sy = clampTile(me.fy);
    if ((sx === tx && sy === ty) || planLvl(tx, ty) < 0) return [];
    const startK = key(sx, sy); const prev = new Map<number, number>();
    const seen = new Set([startK]); const q: number[] = [startK];
    const N = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    while (q.length) {
      const k = q.shift()!; const cx = k % GRID, cy = (k / GRID) | 0;
      if (cx === tx && cy === ty) {
        const path: { gx: number; gy: number; z: number }[] = []; let c = k;
        while (c !== startK) { path.unshift({ gx: c % GRID, gy: (c / GRID) | 0, z }); c = prev.get(c)!; }
        // Auto-raise altitude over walls/blocks/roofs — running max so the player stays up once risen
        let rz = z;
        for (const wp of path) { const bt = blockTopRef.current[key(wp.gx, wp.gy)]; if (bt > rz) rz = bt + 1; wp.z = rz; }
        return path;
      }
      for (const [dx, dy] of N) {
        const nx = cx + dx, ny = cy + dy; if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID) continue;
        const k2 = key(nx, ny); if (seen.has(k2) || planLvl(nx, ny) < 0) continue;   // stay over the room footprint
        seen.add(k2); prev.set(k2, k); q.push(k2);
      }
    }
    return [];
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
        {/* Combat HUD — weapon + health, plus the PvP-zone warning. Shows in PvP rooms, or anywhere a
            hazardous NPC is fightable (huntable). */}
        {(roomMeta.combat || huntable) && !tutorial && (
          <>
            <div className="mt-2 flex items-center gap-2">
              <span className="text-[9px] uppercase tracking-[0.25em] text-brandRed font-bold border border-brandRed/40 bg-black/60 px-1.5 py-0.5">{roomMeta.combat ? '⚔ Combat' : '⚔ Hostiles'}</span>
              <span className="text-base leading-none">{equippedWeaponSpec().emoji}</span>
              {equippedWeaponSpec().id === 'pistol' && (
                <span className="text-[10px] tabular-nums font-bold text-white/70">🔋{wallet.items['pistol_ammo'] ?? 0}</span>
              )}
              <span className="relative w-28 h-2.5 bg-white/10 border border-black/40 overflow-hidden">
                <span className="absolute inset-y-0 left-0" style={{ width: `${Math.max(0, Math.min(100, selfHp.hp / selfHp.max * 100))}%`, background: selfHp.hp / selfHp.max > 0.5 ? '#1ED760' : selfHp.hp / selfHp.max > 0.25 ? '#ffb020' : '#ff3b3b' }} />
              </span>
              <span className="text-[11px] tabular-nums font-bold text-white/85">{Math.round(selfHp.hp)}{selfHp.absorb > 0 ? <span className="text-[#7fd0ff]"> +{Math.round(selfHp.absorb)}</span> : null}</span>
            </div>
            <div style={{ height: 12 }} />
            <p className="hidden sm:block text-[11px] font-bold font-mono uppercase tracking-wider text-white/60">Press F to attack</p>
            {npcTarget && roomMeta.combat && (
              <div className="mt-1.5 flex items-center gap-1.5 pointer-events-auto">
                <span className="text-[10px] uppercase tracking-widest text-brandRed font-bold">⚔ {npcTarget.handle}</span>
                <button onClick={() => { npcTargetRef.current = null; setNpcTarget(null); }} className="text-white/35 hover:text-white text-xs leading-none">✕</button>
              </div>
            )}
          </>
        )}
        {/* Arena pot — your escrowed stake + winnings, with a cash-out button. */}
        {roomMeta.arena && arenaBal != null && arenaRef.current && (() => {
          const cap = arenaRef.current.stake * 2, maxed = arenaBal >= cap;
          return (
            <div className="mt-2 flex items-center gap-2 pointer-events-auto">
              <span className="text-[9px] uppercase tracking-[0.25em] text-[#ffd23a] font-bold border border-[#ffd23a]/40 bg-black/60 px-1.5 py-0.5">{CURRENCY_SYMBOL} Pot</span>
              <span className={`text-sm tabular-nums font-bold ${maxed ? 'text-[#1ED760]' : 'text-white'}`}>{CURRENCY_SYMBOL}{arenaBal.toLocaleString('pt-PT')}</span>
              <span className="text-[10px] text-white/40">/ {CURRENCY_SYMBOL}{cap.toLocaleString('pt-PT')}{maxed ? ' · maxed!' : ''}</span>
              <button onClick={() => switchRoom(roomOf('town'))} title="Bank your pot and leave"
                className="ml-1 text-[10px] uppercase tracking-widest border border-[#1ED760]/50 text-[#1ED760] bg-black/60 px-2 py-1 hover:bg-[#1ED760] hover:text-black active:scale-90 transition-all">Cash out ▸</button>
            </div>
          );
        })()}
      </div>

      {/* WASTED — knockout overlay with a respawn countdown. */}
      {koUntil > Date.now() && (
        <div className="absolute inset-0 z-[68] flex flex-col items-center justify-center bg-brandRed/10 backdrop-blur-[2px] pointer-events-none">
          <p className="font-helvetica font-black text-5xl text-brandRed tracking-tight" style={{ textShadow: '0 2px 24px rgba(0,0,0,0.8)' }}>You got cooked.</p>
          <p className="text-white/70 text-sm mt-2 uppercase tracking-[0.3em]">Back up in {Math.max(1, Math.ceil((koUntil - Date.now()) / 1000))}s</p>
          {koMsg && <p className="text-brandYellow text-sm mt-3 uppercase tracking-[0.25em]">{koMsg}</p>}
        </div>
      )}

      {/* NPC target prompt — left side popup in combat rooms when clicking a hostile NPC */}
      {npcTargetPrompt && (
        <div className="absolute left-4 top-1/2 -translate-y-1/2 z-[80] pointer-events-auto w-52 bg-black/90 border border-brandRed/40 shadow-2xl p-5">
          <p className="font-mono text-[10px] uppercase tracking-widest text-brandRed/70 mb-1">Target</p>
          <p className="font-mono font-bold text-white text-base mb-4">{npcTargetPrompt.handle}</p>
          <div className="flex gap-2">
            <button onClick={() => { npcTargetRef.current = npcTargetPrompt; setNpcTarget(npcTargetPrompt); setNpcTargetPrompt(null); }} className="flex-1 bg-brandRed text-white font-bold uppercase text-[11px] tracking-widest py-2.5 hover:bg-white hover:text-black transition-colors active:scale-95">Yes</button>
            <button onClick={() => setNpcTargetPrompt(null)} className="flex-1 border border-white/20 text-white/50 hover:text-white text-[11px] uppercase tracking-widest py-2.5 active:scale-95">No</button>
          </div>
        </div>
      )}

      {/* Arena entry countdown — player is invisible to others and frozen until this clears. */}
      {arenaCountdown !== null && (
        <div className="absolute inset-0 z-[69] flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm pointer-events-none select-none">
          <p className="font-helvetica font-black tabular-nums leading-none" style={{ fontSize: '14rem', color: roomMeta.accent, textShadow: `0 0 80px ${roomMeta.accent}` }}>{arenaCountdown}</p>
          <p className="text-white/55 text-xs uppercase tracking-[0.45em] mt-6">Get ready</p>
        </div>
      )}

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
        {!tutorial && (
          <div className="relative">
            <button onClick={() => setEmoteOpen(o => !o)} className={`text-[11px] font-mono uppercase tracking-widest border px-3 py-1.5 transition-all ${currentEmote ? 'text-[#c084fc] border-[#c084fc]/60 bg-black/50 hover:bg-[#c084fc] hover:text-black' : emoteOpen ? 'bg-white text-black border-white' : 'text-white border-white/25 bg-black/50 hover:bg-white hover:text-black'}`}>
              ◈{currentEmote ? ` ${{ dance: 'Dance', jump: 'Jump', jjack: 'Jumping Jack', levitate: 'Levitate' }[currentEmote] ?? currentEmote}` : ' Emote'}
            </button>
            {emoteOpen && (
              <div className="absolute top-full mt-1 left-0 z-50 flex flex-col bg-black/95 border border-white/20 p-1 min-w-max">
                {(['dance', 'jump', 'jjack', 'levitate'] as const).map(e => (
                  <button key={e} onClick={() => activateEmote(currentEmote === e ? null : e)}
                    className={`text-[11px] font-mono uppercase tracking-widest px-3 py-1.5 text-left transition-all ${currentEmote === e ? 'bg-[#c084fc] text-black' : 'text-white hover:bg-white hover:text-black'}`}>
                    {e === 'dance' ? '⬡ Dance' : e === 'jump' ? '△ Jump' : e === 'jjack' ? '✦ Jumping Jack' : '✦ Levitate'}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
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
                  <button key={c.id} onClick={() => { setCat(c.id); setGamesMode(false); setShopsMode(false); setRemoveMode(false); setTileMode(false); setAtmoMode(false); setBuildMode(false); setPlacingPrefab(null); }} title={c.name}
                    className={`shrink-0 flex flex-col items-center gap-0.5 w-[3.1rem] py-1 rounded-lg transition-colors ${on ? 'bg-white/10' : 'hover:bg-white/5'}`}>
                    <CatIcon catId={c.id} size={22} color={on ? '#ffe65c' : '#cfd2dc'} />
                    <span className={`text-[7px] uppercase tracking-wide leading-none text-center ${on ? 'text-brandYellow' : 'text-white/50'}`}>{c.name.replace('★ ', '')}</span>
                  </button>
                );
              })}
              {(() => { const spin = !!(placingKind && isRotatable(placingKind)); const on = rotateMode || spin; return (
                <button onClick={() => { if (spin) { setPlaceDir(d => (d + 1) % 4); } else { setRotateMode(r => !r); setPlacingKind(null); setGamesMode(false); setShopsMode(false); setRemoveMode(false); setTileMode(false); setAtmoMode(false); setBuildMode(false); setPlacingPrefab(null); } }} title="Rotate"
                  className={`shrink-0 flex flex-col items-center gap-0.5 w-[3.1rem] py-1 rounded-lg transition-colors ml-auto ${on ? 'bg-[#00cfff]/15' : 'hover:bg-white/5'}`}>
                  <CatIcon catId="rotate" size={22} color={on ? '#00cfff' : '#cfd2dc'} />
                  <span className={`text-[7px] uppercase tracking-wide leading-none ${on ? 'text-[#00cfff]' : 'text-white/50'}`}>{spin ? `Turn ${placeDir + 1}/4` : 'Rotate'}</span>
                </button>
              ); })()}
              <button onClick={() => { setRemoveMode(r => !r); setPlacingKind(null); setGamesMode(false); setShopsMode(false); setRotateMode(false); setTileMode(false); setAtmoMode(false); setBuildMode(false); setPlacingPrefab(null); }} title="Pick up"
                className={`shrink-0 flex flex-col items-center gap-0.5 w-[3.1rem] py-1 rounded-lg transition-colors ${removeMode ? 'bg-brandRed/20' : 'hover:bg-white/5'}`}>
                <CatIcon catId="remove" size={22} color={removeMode ? '#ff4e3e' : '#cfd2dc'} />
                <span className={`text-[7px] uppercase tracking-wide leading-none ${removeMode ? 'text-brandRed' : 'text-white/50'}`}>Pick up</span>
              </button>
              <button onClick={() => { setBuildMode(b => { const nb = !b; if (!nb) setPlacingPrefab(null); return nb; }); setPlacingKind(null); setGamesMode(false); setShopsMode(false); setRemoveMode(false); setRotateMode(false); setTileMode(false); setAtmoMode(false); }} title="Pre-made buildings"
                className={`shrink-0 flex flex-col items-center gap-0.5 w-[3.1rem] py-1 rounded-lg transition-colors ${buildMode ? 'bg-brandYellow/20' : 'hover:bg-white/5'}`}>
                <span className="text-[18px] leading-none" style={{ marginTop: '-1px', color: buildMode ? '#ffe65c' : '#cfd2dc' }}>🏠</span>
                <span className={`text-[7px] uppercase tracking-wide leading-none ${buildMode ? 'text-brandYellow' : 'text-white/50'}`}>Builds</span>
              </button>
              <button onClick={() => { refreshRoomLists(); setPortalMode(m => m ? null : 'choose'); setPortalMaker(false); setPortalEditing(null); setGamesMode(false); setShopsMode(false); setRemoveMode(false); setRotateMode(false); setPlacingKind(null); setTileMode(false); setAtmoMode(false); setBuildMode(false); setPlacingPrefab(null); setEditSel(null); setNpcMode(null); }} title="Portal tools"
                className={`shrink-0 flex flex-col items-center justify-center gap-0.5 w-[3.1rem] py-1 rounded-lg transition-colors ${portalMode ? 'bg-[#cc66ff]/20' : 'hover:bg-[#cc66ff]/15'}`}>
                <span className="text-[18px] leading-none text-[#cc66ff]" style={{ marginTop: '-1px' }}>◎</span>
                <span className="text-[7px] uppercase tracking-wide leading-none text-[#cc66ff]">Portal</span>
              </button>
              {isMod && (
                <button onClick={() => { setTileMode(t => !t); setPlacingKind(null); setGamesMode(false); setShopsMode(false); setRemoveMode(false); setRotateMode(false); setAtmoMode(false); setBuildMode(false); setPlacingPrefab(null); }} title="Paint floor tiles (admin)"
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
                <button onClick={() => { setAtmoMode(a => !a); setPlacingKind(null); setGamesMode(false); setShopsMode(false); setRemoveMode(false); setRotateMode(false); setTileMode(false); setBuildMode(false); setPlacingPrefab(null); }} title="Room atmosphere (admin)"
                  className={`shrink-0 flex flex-col items-center justify-center gap-0.5 w-[3.1rem] py-1 rounded-lg transition-colors ${atmoMode ? 'bg-[#cc66ff]/20' : 'hover:bg-[#cc66ff]/15'}`}>
                  <span className="text-[16px] leading-none" style={{ marginTop: '-1px', color: atmoMode ? '#cc66ff' : '#c79fe0' }}>☁</span>
                  <span className="text-[7px] uppercase tracking-wide leading-none" style={{ color: atmoMode ? '#cc66ff' : '#c79fe0' }}>Atmo</span>
                </button>
              )}
              {isMod && (
                <button onClick={() => { setNpcMode(m => m ? null : 'choose'); setPlacingKind(null); setRemoveMode(false); setRotateMode(false); setTileMode(false); setAtmoMode(false); setGamesMode(false); setShopsMode(false); setBuildMode(false); setPlacingPrefab(null); setEditSel(null); }} title="NPC tools (admin)"
                  className={`shrink-0 flex flex-col items-center justify-center gap-0.5 w-[3.1rem] py-1 rounded-lg transition-colors ${placeNpc || npcEditor || npcMode ? 'bg-[#ffb84d]/20' : 'hover:bg-[#ffb84d]/15'}`}>
                  <span className="text-[16px] leading-none" style={{ marginTop: '-1px', color: placeNpc || npcEditor || npcMode ? '#ffb84d' : '#e0c79f' }}>☻</span>
                  <span className="text-[7px] uppercase tracking-wide leading-none" style={{ color: placeNpc || npcEditor || npcMode ? '#ffb84d' : '#e0c79f' }}>NPC</span>
                </button>
              )}
              {isMod && (
                <button onClick={() => { setGamesMode(g => !g); setShopsMode(false); setPlacingKind(null); setRemoveMode(false); setRotateMode(false); setTileMode(false); setAtmoMode(false); setBuildMode(false); setPlacingPrefab(null); }} title="Place game events (admin)"
                  className={`shrink-0 flex flex-col items-center justify-center gap-0.5 w-[3.1rem] py-1 rounded-lg transition-colors ${gamesMode ? 'bg-[#ffd23a]/20' : 'hover:bg-[#ffd23a]/15'}`}>
                  <span className="text-[16px] leading-none" style={{ marginTop: '-1px', color: gamesMode ? '#ffd23a' : '#e0d099' }}>🕹</span>
                  <span className="text-[7px] uppercase tracking-wide leading-none" style={{ color: gamesMode ? '#ffd23a' : '#e0d099' }}>Games</span>
                </button>
              )}
              {isMod && (
                <button onClick={() => { setShopsMode(s => !s); setGamesMode(false); setPlacingKind(null); setRemoveMode(false); setRotateMode(false); setTileMode(false); setAtmoMode(false); setBuildMode(false); setPlacingPrefab(null); }} title="Place shop triggers (admin)"
                  className={`shrink-0 flex flex-col items-center justify-center gap-0.5 w-[3.1rem] py-1 rounded-lg transition-colors ${shopsMode ? 'bg-[#1ED760]/20' : 'hover:bg-[#1ED760]/15'}`}>
                  <span className="text-[16px] leading-none" style={{ marginTop: '-1px', color: shopsMode ? '#1ED760' : '#9fe0b4' }}>🛍</span>
                  <span className="text-[7px] uppercase tracking-wide leading-none" style={{ color: shopsMode ? '#1ED760' : '#9fe0b4' }}>Shops</span>
                </button>
              )}
            </div>
            {/* item grid — 2 rows, horizontal scroll, drawn thumbnails + price/owned */}
            {shopsMode ? (
              <div className="p-3 space-y-2.5">
                {sShowEditList ? (
                  /* ── Edit list ── */
                  <>
                    <p className="text-[11px] text-[#1ED760]/90">Select a shop to edit.</p>
                    {itemsRef.current.filter(i => i.kind === 'shop').length === 0 ? (
                      <p className="text-[10px] text-white/35 italic">No shops placed in this room yet.</p>
                    ) : (
                      <div className="flex flex-col gap-1.5">
                        {itemsRef.current.filter(i => i.kind === 'shop').map(s => (
                          <button key={s.id} onClick={() => { setSShopName(s.shopName ?? ''); setSShopItems(s.shopItems ?? []); setSEditShopId(s.id); setSShowEditList(false); }}
                            className="flex items-center justify-between gap-2 px-3 py-2 border border-white/15 hover:border-[#1ED760] text-left transition-colors">
                            <span>
                              <span className="block text-[11px] font-bold text-white">{s.shopName || 'Unnamed Shop'}</span>
                              <span className="block text-[9px] text-white/40">{s.shopItems?.length ?? 0} item{(s.shopItems?.length ?? 0) !== 1 ? 's' : ''} · {s.gx},{s.gy}</span>
                            </span>
                            <span className="text-[10px] text-[#1ED760]/70">Edit ▸</span>
                          </button>
                        ))}
                      </div>
                    )}
                    <button onClick={() => setSShowEditList(false)} className="text-[10px] text-white/45 hover:text-white">← Back</button>
                  </>
                ) : (
                  /* ── Create / Edit form ── */
                  <>
                    {sEditShopId && <p className="text-[11px] text-[#1ED760]/90 font-bold">Editing shop</p>}
                    <input
                      value={sShopName} onChange={e => setSShopName(e.target.value)} maxLength={32}
                      placeholder="Shop name (optional)"
                      className="w-full bg-white/5 border border-white/15 text-white text-[11px] px-2.5 py-1.5 outline-none focus:border-[#1ED760] placeholder:text-white/25"
                    />
                    {ITEMS.length === 0 ? (
                      <p className="text-[10px] text-white/35 italic">No items defined yet — add some to src/lib/items.ts first.</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {ITEMS.map(item => {
                          const sel = sShopItems.includes(item.id);
                          return (
                            <button key={item.id} onClick={() => setSShopItems(cur => sel ? cur.filter(i => i !== item.id) : [...cur, item.id])}
                              className={`px-2.5 py-1.5 border rounded-lg text-left transition-colors ${sel ? 'border-[#1ED760] bg-[#1ED760]/10 text-white' : 'border-white/15 text-white/65 hover:border-white/40'}`}>
                              <span className="block text-[11px] font-bold leading-none">{item.emoji} {item.name}</span>
                              <span className="block text-[9px] text-white/40 mt-0.5">{CURRENCY_SYMBOL}{item.price} · {item.useType}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {sEditShopId ? (
                      <div className="flex flex-col gap-1.5">
                        <div className="flex gap-2">
                          <button onClick={saveShopEdit} disabled={sShopItems.length === 0}
                            className="flex-1 bg-[#1ED760] text-black font-bold uppercase text-[11px] tracking-widest px-4 py-2 rounded active:scale-95 hover:bg-white transition-colors disabled:opacity-40">
                            Save shop ▸
                          </button>
                          <button onClick={() => { setSEditShopId(null); setSShopName(''); setSShopItems([]); }}
                            className="px-3 py-2 border border-white/20 text-white/50 hover:text-white text-[11px] rounded transition-colors">
                            Cancel
                          </button>
                        </div>
                        <button
                          disabled={sShopItems.length === 0}
                          onClick={() => {
                            if (sShopItems.length === 0) { flashHint('Select at least one item first'); return; }
                            replacingShopIdRef.current = sEditShopId;
                            const kind = encodeShopTrigger(sShopName, sShopItems);
                            setSEditShopId(null); setSShopName(''); setSShopItems([]);
                            setPlacingKind(kind); setShopsMode(false); setGamesMode(false); setRemoveMode(false); setRotateMode(false); setTileMode(false); setAtmoMode(false); setBuildMode(false); setPlacingPrefab(null);
                            flashHint('Tap a new tile to move the shop ▸');
                          }}
                          className="w-full px-3 py-1.5 border border-white/15 text-[11px] text-white/55 hover:border-[#1ED760] hover:text-[#1ED760] transition-colors disabled:opacity-40"
                        >
                          Place on new tile ▸
                        </button>
                        <button
                          onClick={() => {
                            const shop = itemsRef.current.find(i => i.id === sEditShopId);
                            setSTriggerTiles((shop?.shopTriggers ?? []).map(t => `${t.gx}_${t.gy}`));
                            setSTriggerShopId(sEditShopId);
                            setSTriggerMode(true);
                            setSEditShopId(null); setSShopName(''); setSShopItems([]);
                          }}
                          className="w-full px-3 py-1.5 border border-[#1ED760]/30 text-[11px] text-[#1ED760]/70 hover:border-[#1ED760] hover:text-[#1ED760] transition-colors"
                        >
                          Edit triggers ▸
                        </button>
                        <button
                          onClick={() => {
                            const old = itemsRef.current.find(i => i.id === sEditShopId);
                            if (old) dropItem(old);
                            setSEditShopId(null); setSShopName(''); setSShopItems([]);
                            flashHint('Shop removed');
                          }}
                          className="w-full px-3 py-1.5 border border-brandRed/40 text-[11px] text-brandRed/70 hover:border-brandRed hover:text-brandRed transition-colors"
                        >
                          Remove shop
                        </button>
                      </div>
                    ) : (
                      <button onClick={armShopPlacement} disabled={sShopItems.length === 0}
                        className="w-full bg-[#1ED760] text-black font-bold uppercase text-[11px] tracking-widest px-4 py-2 rounded active:scale-95 hover:bg-white transition-colors disabled:opacity-40">
                        Place shop ▸
                      </button>
                    )}
                    <div className="pt-1 border-t border-white/10">
                      <button onClick={() => { setSShowEditList(true); setSEditShopId(null); setSShopName(''); setSShopItems([]); }}
                        className="w-full px-3 py-1.5 border border-white/15 rounded-lg text-[11px] text-white/55 hover:border-white/40 hover:text-white transition-colors text-left">
                        Edit shops in room
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : gamesMode ? (
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
                  {([[-1, 'Default', '#2a2a36'], [2, 'Grass', '#358540'], [1, 'Marble', '#bdb6a6'], [3, 'Carpet', '#9c1f29'], [4, 'Dark', '#1d1d27'], [5, 'Disco', '#cc44ff'], [6, 'Water', '#0c5e78'], [7, 'Lava', '#e0531e'], [8, 'Sand', '#dcc88c'], [9, 'Snow', '#dde8f5'], [10, 'Wood', '#8a5a32'], [11, 'Neon', '#0a0a16'], [12, 'Void', '#04040a'], [13, 'Concrete', '#8a8a96'], [14, 'Gravel', '#87837c'], [15, 'Dirt', '#7a5a3a']] as [number, string, string][]).map(([m, label, col]) => (
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
            ) : portalMode ? (
              <div className="p-3 space-y-2">
                {portalMode === 'choose' ? (
                  <>
                    <p className="text-[11px] text-[#cc66ff]/90">What would you like to do?</p>
                    <button onClick={() => { setPmDest('town'); setPmRoomCode(''); setPmAccess(''); setPmHidden(false); setPmMessage(''); setPortalEditing(null); setPortalMode(null); setPortalMaker(true); }}
                      className="w-full flex items-center justify-between px-3 py-2.5 border border-white/15 hover:border-[#cc66ff] transition-colors text-left">
                      <span>
                        <span className="block text-[11px] font-bold text-white">Add New Portal</span>
                        <span className="block text-[9px] text-white/40">Place a door that leads to another room</span>
                      </span>
                      <span className="text-[10px] text-[#cc66ff]/70">▸</span>
                    </button>
                    <button onClick={() => setPortalMode('list')}
                      className="w-full flex items-center justify-between px-3 py-2.5 border border-white/15 hover:border-[#cc66ff] transition-colors text-left">
                      <span>
                        <span className="block text-[11px] font-bold text-white">Edit Existing Portal</span>
                        <span className="block text-[9px] text-white/40">Update a portal already in this room</span>
                      </span>
                      <span className="text-[10px] text-[#cc66ff]/70">▸</span>
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-[11px] text-[#cc66ff]/90">Select a portal to edit.</p>
                    {itemsRef.current.filter(i => i.portalTo).length === 0 ? (
                      <p className="text-[10px] text-white/35 italic">No portals placed in this room yet.</p>
                    ) : (
                      <div className="flex flex-col gap-1.5">
                        {itemsRef.current.filter(i => i.portalTo).map(p => {
                          const dest = p.portalTo!;
                          const destLabel = dest.startsWith('code:') ? `code: ${dest.slice(5)}` : (ROOMS.find(r => r.slug === dest)?.name ?? dest);
                          return (
                            <button key={p.id} onClick={() => {
                              if (dest.startsWith('code:')) { setPmDest('code'); setPmRoomCode(dest.slice(5)); } else { setPmDest(dest); setPmRoomCode(''); }
                              setPmAccess(p.portalCode || ''); setPmHidden(p.portalHidden || false); setPmMessage(p.portalMessage || '');
                              setPortalEditing(p.id); setPortalMode(null); setPortalMaker(true);
                            }} className="flex items-center justify-between gap-2 px-3 py-2 border border-white/15 hover:border-[#cc66ff] text-left transition-colors">
                              <span>
                                <span className="block text-[11px] font-bold text-white">→ {destLabel}</span>
                                <span className="block text-[9px] text-white/40">{p.portalCode ? `code: ${p.portalCode}` : 'open'}{p.portalHidden ? ' · hidden' : ''} · {p.gx},{p.gy}</span>
                              </span>
                              <span className="text-[10px] text-[#cc66ff]/70">Edit ▸</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                    <button onClick={() => setPortalMode('choose')} className="text-[10px] text-white/45 hover:text-white">← Back</button>
                  </>
                )}
              </div>
            ) : npcMode ? (
              <div className="p-3 space-y-2">
                {npcMode === 'choose' ? (
                  <>
                    <p className="text-[11px] text-[#ffb84d]/90">What would you like to do?</p>
                    <button onClick={() => { setNpcMode(null); setEditingNpcId(null); pendingNpcRef.current = null; openNpcEditor(); }}
                      className="w-full flex items-center justify-between px-3 py-2.5 border border-white/15 hover:border-[#ffb84d] transition-colors text-left">
                      <span>
                        <span className="block text-[11px] font-bold text-white">Create New NPC</span>
                        <span className="block text-[9px] text-white/40">Design and place a new character</span>
                      </span>
                      <span className="text-[10px] text-[#ffb84d]/70">▸</span>
                    </button>
                    <button onClick={() => setNpcMode('list')}
                      className="w-full flex items-center justify-between px-3 py-2.5 border border-white/15 hover:border-[#ffb84d] transition-colors text-left">
                      <span>
                        <span className="block text-[11px] font-bold text-white">Edit Existing NPC</span>
                        <span className="block text-[9px] text-white/40">Update a character already in this room</span>
                      </span>
                      <span className="text-[10px] text-[#ffb84d]/70">▸</span>
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-[11px] text-[#ffb84d]/90">Select an NPC to edit.</p>
                    {placedNpcsRef.current.length === 0 ? (
                      <p className="text-[10px] text-white/35 italic">No NPCs placed in this room yet.</p>
                    ) : (
                      <div className="flex flex-col gap-1.5">
                        {placedNpcsRef.current.map(p => (
                          <button key={p.id} onClick={() => { setEditingNpcId(p.id); pendingNpcRef.current = p.data; openNpcEditor(); }}
                            className="flex items-center justify-between gap-2 px-3 py-2 border border-white/15 hover:border-[#ffb84d] text-left transition-colors">
                            <span>
                              <span className="block text-[11px] font-bold text-white">{p.data.n}</span>
                              <span className="block text-[9px] text-white/40">{p.data.l?.length ?? 0} line{(p.data.l?.length ?? 0) !== 1 ? 's' : ''} · {p.gx},{p.gy}</span>
                            </span>
                            <span className="text-[10px] text-[#ffb84d]/70">Edit ▸</span>
                          </button>
                        ))}
                      </div>
                    )}
                    <button onClick={() => setNpcMode('choose')} className="text-[10px] text-white/45 hover:text-white">← Back</button>
                  </>
                )}
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
        const community = personalRooms.filter(r => r.owner !== myOwnerId && !myKeys.has(r.slug) && !r.discoverable);
        const discovered = discoveredRooms.filter(r => r.owner !== myOwnerId && !myKeys.has(r.slug));
        const roomBtn = (d: RoomDef, tag?: string) => (
          <button key={d.slug} onClick={() => switchRoom(d)} className={`flex items-center gap-3 p-3 border transition-colors ${d.slug === room ? 'border-white bg-white/5' : 'border-white/15 hover:border-white/40'}`}>
            <span className="w-4 h-4 rounded-full shrink-0" style={{ background: d.accent, boxShadow: `0 0 10px ${d.accent}` }} />
            <span className="font-bold text-white truncate">{d.name}</span>
            {d.locked && <span className="text-[10px] uppercase tracking-widest text-white/40">🔒</span>}
            <span className="ml-auto text-[10px] uppercase tracking-widest text-white/40">{d.slug === room ? 'here' : tag || ''}</span>
          </button>
        );
        const copyCode = (c: string) => { try { navigator.clipboard?.writeText(c); flashHint(`Code ${c} copied`); } catch { /* ignore */ } };
        const q = roomSearch.trim().toLowerCase();
        const matchName = (name: string) => name.toLowerCase().includes(q);
        const filteredOfficial = ROOMS.filter(r => matchName(r.name));
        const filteredTut = Object.values(TUT_ROOMS).filter(r => matchName(r.name));
        const filteredMy = myRooms.filter(r => matchName(r.name));
        const filteredCommunity = community.filter(r => matchName(r.name));
        const filteredDiscovered = discovered.filter(r => matchName(r.name));
        return (
          <div className="absolute inset-0 z-50 bg-black/80 flex justify-center overflow-y-auto px-6 py-10" onClick={() => setShowRooms(false)}>
            <div className="w-full max-w-sm bg-black border border-white/15 p-5 h-fit" onClick={e => e.stopPropagation()}>
              <input
                autoFocus
                value={roomSearch}
                onChange={e => setRoomSearch(e.target.value)}
                placeholder="Search rooms…"
                className="w-full bg-white/5 border border-white/15 text-white px-3 py-2 text-sm outline-none focus:border-[#00cfff] mb-5"
              />

              {filteredOfficial.length > 0 && (<>
                <p className="text-[11px] uppercase tracking-[0.3em] text-white/40 mb-2">Official rooms</p>
                <div className="flex flex-col gap-2">{filteredOfficial.map(r => roomBtn(r, r.arena ? `⚔ ${CURRENCY_SYMBOL}${(r.arenaMin ?? 0).toLocaleString('pt-PT')}${r.arenaMax ? `–${r.arenaMax.toLocaleString('pt-PT')}` : '+'}` : ''))}</div>
              </>)}

              {isMod && filteredTut.length > 0 && (<>
                <p className="text-[11px] uppercase tracking-[0.3em] text-[#1ED760]/70 mt-5 mb-2">Tutorial rooms · admin</p>
                <div className="flex flex-col gap-2">{filteredTut.map(r => roomBtn(r, 'solo'))}</div>
              </>)}

              {filteredMy.length > 0 && (<>
                <p className="text-[11px] uppercase tracking-[0.3em] text-white/40 mt-5 mb-2">Your rooms</p>
                <div className="flex flex-col gap-2">{filteredMy.map(r => (
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

              {filteredCommunity.length > 0 && (<>
                <p className="text-[11px] uppercase tracking-[0.3em] text-white/40 mt-5 mb-2">Community rooms</p>
                <div className="flex flex-col gap-2 max-h-60 overflow-y-auto">{filteredCommunity.map(r => roomBtn(roomDefOf(r)))}</div>
              </>)}

              {filteredDiscovered.length > 0 && (<>
                <p className="text-[11px] uppercase tracking-[0.3em] text-[#cc44ff]/70 mt-5 mb-2">Discovered rooms</p>
                <div className="flex flex-col gap-2 max-h-60 overflow-y-auto">{filteredDiscovered.map(r => roomBtn(roomDefOf(r)))}</div>
              </>)}

              {q && filteredOfficial.length === 0 && filteredMy.length === 0 && filteredCommunity.length === 0 && filteredDiscovered.length === 0 && (!isMod || filteredTut.length === 0) && (
                <p className="text-[11px] text-white/35 mt-1">No rooms match "{roomSearch.trim()}"</p>
              )}

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
            {isMod && (
              <label className="flex items-center gap-3 p-3 border border-brandRed/30 cursor-pointer hover:border-brandRed/55 mt-2">
                <input type="checkbox" checked={permsCombat} onChange={e => setPermsCombat(e.target.checked)} className="accent-brandRed w-4 h-4" />
                <span className="text-sm text-white">⚔ Combat zone<br /><span className="text-[11px] text-white/45">Players can attack &amp; loot each other here (5% of Cristais + items on a knockout). Mods only.</span></span>
              </label>
            )}
            {isMod && (<>
              <label className="flex items-center gap-3 p-3 border border-[#ffd23a]/30 cursor-pointer hover:border-[#ffd23a]/55 mt-2">
                <input type="checkbox" checked={permsArena} onChange={e => { setPermsArena(e.target.checked); if (e.target.checked) setPermsCombat(true); }} className="accent-[#ffd23a] w-4 h-4" />
                <span className="text-sm text-white">{CURRENCY_SYMBOL} Staked arena<br /><span className="text-[11px] text-white/45">Players bet to enter; a kill pays the smaller of the two bets (cap 2×), death loses the stake. Forces combat on. Mods only.</span></span>
              </label>
              {permsArena && (
                <div className="p-3 border border-[#ffd23a]/20 -mt-2 space-y-2.5">
                  <div className="flex gap-1.5">
                    {ARENA_TIERS.map(t => {
                      const on = Math.floor(Number(permsArenaMin) || 0) === t.min && Math.floor(Number(permsArenaMax) || 0) === t.max;
                      return (<button key={t.label} onClick={() => { setPermsArenaMin(String(t.min)); setPermsArenaMax(String(t.max)); }}
                        className={`flex-1 text-[10px] uppercase tracking-wide py-1.5 border transition-colors ${on ? 'border-[#ffd23a] bg-[#ffd23a]/15 text-white' : 'border-white/12 text-white/55 hover:border-white/30'}`}>{t.label}</button>);
                    })}
                  </div>
                  <div className="flex gap-2">
                    <label className="flex-1 space-y-1"><span className="text-[10px] uppercase tracking-[0.2em] text-white/40">Min bet</span>
                      <input value={permsArenaMin} onChange={e => setPermsArenaMin(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" className="w-full bg-white/5 border border-white/15 text-white px-2 py-1.5 text-sm tabular-nums outline-none focus:border-[#ffd23a]" /></label>
                    <label className="flex-1 space-y-1"><span className="text-[10px] uppercase tracking-[0.2em] text-white/40">Max bet (0 = ∞)</span>
                      <input value={permsArenaMax} onChange={e => setPermsArenaMax(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" className="w-full bg-white/5 border border-white/15 text-white px-2 py-1.5 text-sm tabular-nums outline-none focus:border-[#ffd23a]" /></label>
                  </div>
                </div>
              )}
            </>)}
            <label className="flex items-center gap-3 p-3 border border-[#cc44ff]/30 cursor-pointer hover:border-[#cc44ff]/55 mt-2">
              <input type="checkbox" checked={permsDiscoverable} onChange={e => setPermsDiscoverable(e.target.checked)} className="accent-[#cc44ff] w-4 h-4" />
              <span className="text-sm text-white">✦ Discoverable<br /><span className="text-[11px] text-white/45">Hidden from the community browser until a player physically enters the room (via portal or invite code).</span></span>
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

      {inObscured && (
        <div className="absolute right-3 z-40" style={{ bottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
          <div className="bg-black/60 border border-white/15 rounded-xl p-1.5 grid grid-cols-3 gap-1">
            {([
              ['↖', -1,  0], ['↑', -1, -1], ['↗',  0, -1],
              ['←', -1,  1], [null, 0,  0], ['→',  1, -1],
              ['↙',  0,  1], ['↓',  1,  1], ['↘',  1,  0],
            ] as ([string, number, number] | [null, number, number])[]).map(([arrow, dgx, dgy], i) =>
              arrow ? (
                <button key={i} onPointerDown={() => moveStep(dgx, dgy)}
                  className="w-8 h-8 flex items-center justify-center text-white/80 hover:text-white hover:bg-white/10 active:bg-white/20 active:scale-90 rounded transition-all text-base select-none">
                  {arrow}
                </button>
              ) : (
                <div key={i} className="w-8 h-8" />
              )
            )}
          </div>
        </div>
      )}

      {flying && (
        <div className="absolute right-3 z-40" style={{ bottom: `calc(max(0.75rem, env(safe-area-inset-bottom)) + ${inObscured ? 122 : 0}px)` }}>
          <div className="bg-black/60 border border-[#9fe3ff]/30 rounded-xl p-1.5 flex flex-col gap-1">
            <button onPointerDown={() => flyVert(1)} title="Fly up a level"
              className="w-10 h-10 flex items-center justify-center text-[#bff2ff] hover:text-white hover:bg-[#9fe3ff]/15 active:bg-[#9fe3ff]/25 active:scale-90 rounded transition-all text-lg leading-none select-none">▲</button>
            <button onPointerDown={() => flyVert(-1)} title="Fly down a level"
              className="w-10 h-10 flex items-center justify-center text-[#bff2ff] hover:text-white hover:bg-[#9fe3ff]/15 active:bg-[#9fe3ff]/25 active:scale-90 rounded transition-all text-lg leading-none select-none">▼</button>
          </div>
        </div>
      )}

      {portalMessagePrompt && (
        <div className="absolute inset-0 z-[60] bg-black/85 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="w-full max-w-xs border border-[#cc66ff]/30 bg-black p-6 text-center space-y-4" onClick={e => e.stopPropagation()}>
            <p className="font-mono text-[10px] uppercase tracking-[0.35em] text-[#cc66ff]">◎ portal message</p>
            <p className="text-sm text-white/80 leading-relaxed whitespace-pre-line text-left">{portalMessagePrompt.message}</p>
            <p className="text-[10px] uppercase tracking-widest text-white/40">Continue?</p>
            <div className="flex gap-2">
              <button onClick={() => { const p = portalMessagePrompt; setPortalMessagePrompt(null); if (p.code) { setPortalPrompt(p); setPortalCode(''); } else { travelToRef.current(p); } }}
                className="flex-1 bg-[#cc66ff] text-black font-bold uppercase text-xs tracking-widest py-3 active:scale-95 hover:bg-white transition-colors">Yes ▸</button>
              <button onClick={() => nudgeOffPortal(portalMessagePrompt)}
                className="px-4 border border-white/20 text-white/50 hover:text-white text-xs uppercase tracking-widest active:scale-95">No</button>
            </div>
          </div>
        </div>
      )}

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

      {stakePrompt && (() => {
        const bal = getBalance();
        const { min, max } = arenaBand(roomMeta);
        const bandLabel = max === Infinity ? `${CURRENCY_SYMBOL}${min.toLocaleString('pt-PT')}+` : `${CURRENCY_SYMBOL}${min.toLocaleString('pt-PT')}–${max.toLocaleString('pt-PT')}`;
        const amt = Math.floor(Number(stakeInput) || 0);
        const ok = amt >= min && amt <= max && amt <= bal;
        return (
          <div className="absolute inset-0 z-[60] bg-black/85 backdrop-blur-sm flex items-center justify-center p-6" onClick={declineStake}>
            <div className="w-full max-w-xs border bg-black p-6 text-center space-y-4" style={{ borderColor: `${roomMeta.accent}66` }} onClick={e => e.stopPropagation()}>
              <p className="font-mono text-[10px] uppercase tracking-[0.35em]" style={{ color: roomMeta.accent }}>⚔ {roomMeta.name}</p>
              <p className="text-[11px] uppercase tracking-[0.25em] text-white/40">stakes {bandLabel}</p>
              <p className="text-sm text-white/70 leading-relaxed">Each kill pays the <span className="text-white">smaller</span> of the two bets — double your stake and cash out, or lose it and get ejected.</p>
              <p className="text-[11px] text-white/45">Your purse: <span className="text-white/80 tabular-nums">{CURRENCY_SYMBOL}{bal.toLocaleString('pt-PT')}</span></p>
              <input value={stakeInput} onChange={e => setStakeInput(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" autoFocus placeholder={`bet ${bandLabel}`} onKeyDown={e => { if (e.key === 'Enter' && ok) confirmStake(); }}
                className="w-full bg-white/5 border border-white/15 text-white text-center px-3 py-2.5 text-base tabular-nums font-bold outline-none focus:border-white/40" />
              <div className="flex gap-2">
                <button disabled={!ok} onClick={confirmStake} className={`flex-1 font-bold uppercase text-xs tracking-widest py-3 transition-colors ${ok ? 'text-black hover:opacity-90 active:scale-95' : 'bg-white/10 text-white/30 cursor-not-allowed'}`} style={ok ? { background: roomMeta.accent } : undefined}>Bet {amt > 0 ? `${CURRENCY_SYMBOL}${amt.toLocaleString('pt-PT')} ` : ''}▸</button>
                <button onClick={declineStake} className="px-4 border border-white/20 text-white/50 hover:text-white text-xs uppercase tracking-widest active:scale-95">Leave</button>
              </div>
            </div>
          </div>
        );
      })()}

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

      {sTriggerMode && (
        <div className="absolute bottom-[4.5rem] left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-black/95 border border-[#1ED760]/40 px-4 py-2.5 pointer-events-auto">
          <span className="text-[11px] text-[#1ED760]/80 whitespace-nowrap">
            Tap tiles to set activation zone · <span className="font-bold text-[#1ED760]">{sTriggerTiles.length}</span> selected
          </span>
          <button onClick={() => { setSTriggerMode(false); setSTriggerShopId(null); setSTriggerTiles([]); }}
            className="text-[10px] text-white/45 hover:text-white transition-colors uppercase tracking-wide shrink-0">
            Skip
          </button>
          <button onClick={confirmTriggers}
            className="text-[10px] bg-[#1ED760] text-black font-bold uppercase tracking-widest px-3 py-1.5 hover:bg-white transition-colors active:scale-95 shrink-0">
            Confirm ✦
          </button>
        </div>
      )}

      {shopPrompt && (
        <div className="absolute inset-0 z-[65] bg-black/85 backdrop-blur-sm flex items-center justify-center p-6" onClick={() => setShopPrompt(null)}>
          <div className="w-full max-w-sm border border-[#1ED760]/40 bg-black p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <p className="font-mono text-[10px] uppercase tracking-[0.35em] text-[#1ED760]">🛍 {shopPrompt.name || 'shop'}</p>
              <button onClick={() => setShopPrompt(null)} className="text-white/40 hover:text-white text-lg leading-none">✕</button>
            </div>
            <p className="text-sm text-white/60 leading-relaxed">Browse the goods. Spend Cristais, take something useful.</p>
            <div className="flex flex-col gap-2">
              {shopPrompt.items.map(id => {
                const item = itemById(id); if (!item) return null;
                const owned = itemCount(id);
                const useLabel = item.useType === 'single' ? 'Single use' : item.useType === 'multi' ? `${item.uses ?? '?'} uses` : 'Permanent';
                return (
                  <div key={id} className="flex items-center justify-between gap-3 border border-white/15 bg-white/[0.03] px-4 py-3">
                    <span>
                      <span className="block font-helvetica font-black text-base text-white leading-none">{item.emoji} {item.name}</span>
                      <span className="block text-[11px] text-white/45 mt-1">{item.description}</span>
                      <span className="block text-[10px] text-white/30 mt-0.5">{useLabel}{owned > 0 ? ` · ×${owned} owned` : ''}</span>
                    </span>
                    <button
                      onClick={() => { if (isMod) { grantItem(id); flashHint(`${item.name} acquired ✦`); } else { const r = buyItem(id, item.price); flashHint(r.ok ? `${item.name} acquired ✦` : (r.error ?? 'Error')); } }}
                      disabled={!isMod && wallet.balance < item.price}
                      className="shrink-0 bg-[#1ED760] text-black font-bold uppercase text-[10px] tracking-widest px-3 py-2 hover:bg-white transition-colors active:scale-95 disabled:opacity-40">
                      {CURRENCY_SYMBOL}{item.price.toLocaleString('pt-PT')}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── DUEL CABINET LOBBY · walk up → wait for an opponent → friendly or wager → race ── */}
      {duelLobby && (() => {
        const meId = selfRef.current.id;
        const isHost = lobbyRoster[0]?.id === meId;
        const opp = isHost ? lobbyRoster[1] : lobbyRoster[0];
        const matched = lobbyRoster.length >= 2 && !!opp;
        return (
          <div className="absolute inset-0 z-[68] bg-black/85 backdrop-blur-sm flex items-center justify-center p-6" onClick={leaveLobby}>
            <div className="w-full max-w-sm border border-brandRed/40 bg-black p-6 space-y-4 max-h-[88vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <p className="font-mono text-[10px] uppercase tracking-[0.35em] text-brandRed">⚔ duel cabinet</p>
                <button onClick={leaveLobby} className="text-white/40 hover:text-white text-lg leading-none">✕</button>
              </div>

              {/* roster */}
              <div className="flex items-center justify-center gap-3 py-1">
                <span className="text-sm text-white font-bold">{selfRef.current.handle}{isHost && matched ? ' 👑' : ''}</span>
                <span className="text-white/30 font-mono text-xs">VS</span>
                <span className="text-sm font-bold text-white/80">{opp ? `${opp.handle}${!isHost ? ' 👑' : ''}` : <span className="text-white/35 italic font-normal">waiting…</span>}</span>
              </div>

              {!matched ? (
                <div className="py-4 text-center space-y-2">
                  <p className="text-sm text-white/70">Waiting for an opponent to step up to the cabinet…</p>
                  <div className="animate-pulse text-brandRed font-bold tracking-widest">● ● ●</div>
                  <p className="text-[12px] text-white/40">Both play the same game — first to lose loses (higher score wins).</p>
                </div>
              ) : !isHost ? (
                wagerOffer ? (
                  /* Guest: the host offered a WAGER — see the stake and agree before any crystals move */
                  <div className="py-2 text-center space-y-3">
                    <p className="font-mono text-[10px] uppercase tracking-[0.35em] text-brandRed">⚔ wager offer</p>
                    <p className="text-sm text-white/75"><b className="text-white">{wagerOffer.hostHandle}</b> wants to wager:</p>
                    <div className="border border-brandRed/30 px-3 py-2"><p className="text-brandRed font-bold">{stakeLabel(wagerOffer.stake)}</p><p className="text-[10px] uppercase tracking-widest text-white/40 mt-0.5">each side · winner takes all</p></div>
                    {!meDuelIdentity() && <p className="text-[12px] text-brandYellow">Sign in with Discord to accept.</p>}
                    {lobbyMsg && <p className="text-[12px] text-brandYellow">{lobbyMsg}</p>}
                    <div className="flex gap-3">
                      <button onClick={() => void acceptWager()} disabled={!meDuelIdentity()} className="flex-1 bg-brandRed text-black font-bold uppercase tracking-[0.2em] text-sm py-3 hover:bg-white transition-colors active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed">Accept</button>
                      <button onClick={() => void declineWager()} className="flex-1 border border-white/20 text-white/70 font-bold uppercase tracking-[0.2em] text-sm py-3 hover:bg-white hover:text-black transition-colors">Decline</button>
                    </div>
                  </div>
                ) : (
                  <div className="py-4 text-center space-y-2">
                    <p className="text-sm text-white/70"><b className="text-white">{opp!.handle}</b> is the host — they pick friendly or a wager.</p>
                    <p className="text-[12px] text-white/45">Waiting for them to start…</p>
                    <div className="animate-pulse text-brandRed font-bold tracking-widest">● ● ●</div>
                    {lobbyMsg && <p className="text-[12px] text-brandYellow">{lobbyMsg}</p>}
                  </div>
                )
              ) : wagerWaiting ? (
                /* Host: offered a wager, waiting for the guest to agree */
                <div className="py-4 text-center space-y-3">
                  <p className="text-sm text-white/70">Wager offer sent to <b className="text-white">{opp!.handle}</b>:</p>
                  <p className="text-brandRed font-bold">{stakeLabel(duelStake)}</p>
                  <p className="text-[12px] text-white/45">Waiting for them to accept…</p>
                  <div className="animate-pulse text-brandRed font-bold tracking-widest">● ● ●</div>
                  <button onClick={cancelWagerOffer} className="mt-1 text-[11px] font-mono uppercase tracking-widest text-white/60 border border-white/20 px-4 py-2 hover:bg-white hover:text-black transition-colors">Cancel</button>
                </div>
              ) : (
                <>
                  {/* mode toggle */}
                  <div className="flex gap-2">
                    <button onClick={() => setLobbyMode('friendly')} className={`flex-1 text-[12px] font-bold uppercase tracking-widest py-2 border transition-colors ${lobbyMode === 'friendly' ? 'bg-white text-black border-white' : 'text-white/70 border-white/20 hover:border-white/50'}`}>Friendly</button>
                    <button onClick={() => setLobbyMode('wager')} className={`flex-1 text-[12px] font-bold uppercase tracking-widest py-2 border transition-colors ${lobbyMode === 'wager' ? 'bg-brandRed text-black border-brandRed' : 'text-brandRed/80 border-brandRed/30 hover:border-brandRed/60'}`}>Wager ✦</button>
                  </div>

                  {lobbyMode === 'friendly' ? (
                    <p className="text-[12px] text-white/55 leading-relaxed">No stake — just bragging rights. Anyone can play (no sign-in needed).</p>
                  ) : !meDuelIdentity() ? (
                    <p className="text-[12px] text-brandYellow leading-relaxed">Sign in with Discord to put crystals or items on the line.</p>
                  ) : !opp!.token ? (
                    <p className="text-[12px] text-brandYellow leading-relaxed"><b className="text-white">{opp!.handle}</b> isn&apos;t signed in with Discord — friendly only.</p>
                  ) : (
                    <>
                      <div>
                        <p className="text-[10px] uppercase tracking-widest text-white/40 mb-1.5">Ante · Cristais (you have {CURRENCY_SYMBOL}{wallet.balance.toLocaleString('pt-PT')})</p>
                        <input type="number" min={0} max={wallet.balance} value={duelStake.crystals || ''} placeholder="0"
                          onChange={e => { const n = Math.max(0, Math.min(wallet.balance, Math.floor(Number(e.target.value) || 0))); setDuelStake(s => ({ ...s, crystals: n })); }}
                          className="w-full bg-white/5 border border-white/15 text-white px-3 py-2 text-sm outline-none focus:border-brandRed" />
                      </div>
                      {(() => {
                        const items = wagerableItems();
                        if (!items.length) return null;
                        return (
                          <div>
                            <p className="text-[10px] uppercase tracking-widest text-white/40 mb-1.5">Ante · items</p>
                            <div className="flex flex-col gap-1.5 max-h-36 overflow-y-auto">
                              {items.map(it => {
                                const n = duelStake.items[it.kind] ?? 0;
                                return (
                                  <div key={it.kind} className="flex items-center justify-between gap-2 border border-white/10 px-2.5 py-1.5">
                                    <span className="text-[12px] text-white/75 truncate">{it.name} <span className="text-white/35">×{it.have}</span></span>
                                    <span className="flex items-center gap-2 shrink-0">
                                      <button onClick={() => setStakeItem(it.kind, Math.max(0, n - 1))} className="w-6 h-6 border border-white/20 text-white/70 hover:bg-white hover:text-black leading-none">−</button>
                                      <span className="w-5 text-center text-sm text-white tabular-nums">{n}</span>
                                      <button onClick={() => setStakeItem(it.kind, Math.min(it.have, n + 1))} className="w-6 h-6 border border-white/20 text-white/70 hover:bg-white hover:text-black leading-none">+</button>
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })()}
                      <div className="text-[12px] text-white/55">Pot per side: <b className="text-brandRed">{stakeLabel(duelStake)}</b></div>
                    </>
                  )}

                  {lobbyMsg && <p className="text-[12px] text-brandYellow">{lobbyMsg}</p>}
                  <button onClick={() => void startLobbyDuel()} disabled={lobbyMode === 'wager' && (!meDuelIdentity() || !opp!.token || stakeIsEmpty(duelStake))}
                    className="w-full bg-brandRed text-black font-bold uppercase tracking-[0.2em] text-sm py-3 hover:bg-white transition-colors active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed">
                    {lobbyMode === 'wager' ? `⚔ Offer wager to ${opp!.handle}` : `▶ Start vs ${opp!.handle}`}
                  </button>
                </>
              )}
            </div>
          </div>
        );
      })()}

      <NpcEditor open={npcEditor} initial={editingNpcId ? pendingNpcRef.current : null}
        onClose={() => { setNpcEditor(false); setEditingNpcId(null); }}
        onDelete={editingNpcId ? () => deleteNpc(editingNpcId) : undefined}
        onPlace={d => {
          if (editingNpcId) {
            updateNpc(editingNpcId, d); setEditingNpcId(null); setNpcEditor(false);
          } else {
            pendingNpcRef.current = d; setNpcEditor(false); setPlaceNpc(true);
            setPlacingKind(null); setRemoveMode(false); setRotateMode(false); setTileMode(false); setAtmoMode(false); setBuildMode(false); setEditSel(null);
            flashHint('Tap a tile to drop the NPC ☻');
          }
        }} />

      {portalMaker && (
        <div className="absolute inset-0 z-[70] bg-black/85 backdrop-blur-sm flex items-center justify-center p-6" onClick={() => { setPortalMaker(false); setPortalEditing(null); }}>
          <div className="w-full max-w-sm border border-[#cc66ff]/40 bg-black p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.35em] text-[#cc66ff]">{portalEditing ? '◎ edit portal' : '◎ new portal'}</p>
              <p className="text-sm text-white/60 leading-relaxed mt-1">{portalEditing ? 'Update this portal\'s destination, access code, or message.' : 'Drop a door that leads somewhere else. People walk onto it to travel — find it, walk to it.'}</p>
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
            <div>
              <p className="text-[10px] uppercase tracking-widest text-white/40 mb-1.5">Message <span className="text-white/25 normal-case tracking-normal">(optional — shown before travel with a Yes/No prompt)</span></p>
              <textarea value={pmMessage} onChange={e => setPmMessage(e.target.value)} maxLength={300} placeholder="Leave blank for no message"
                className="w-full bg-white/5 border border-white/15 text-white px-3 py-2 text-sm outline-none focus:border-[#cc66ff] resize-none" rows={3} />
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={portalEditing ? savePortalEdit : makePortal} className="flex-1 bg-[#cc66ff] text-black font-bold uppercase text-xs tracking-widest py-3 active:scale-95 hover:bg-white transition-colors">{portalEditing ? 'Save changes ▸' : 'Place portal ▸'}</button>
              <button onClick={() => { setPortalMaker(false); setPortalEditing(null); }} className="px-4 border border-white/20 text-white/50 hover:text-white text-xs uppercase tracking-widest active:scale-95">Cancel</button>
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
                  <span className="flex-1 min-w-0 text-[12px] text-white/70 truncate">{l.style === 'reward' ? [l.crystals ? `✦ ${l.crystals}` : '', l.skinId ? skinById(l.skinId).name : '', ...Object.entries(l.items || {}).map(([id, q]) => `${itemById(id)?.emoji ?? ''} ×${q}`), ...Object.entries(l.furni || {}).map(([k, q]) => `${FURNI.find(f => f.kind === k)?.emoji ?? k} ×${q}`)].filter(Boolean).join(' · ') || '—' : l.text}</span>
                  <button onClick={() => { setLoreText(l.text); setLoreEditId(l.id); setMkStyle(l.style); setMkMode(l.mode); setMkCrystals(l.crystals || 0); setMkSkin(l.skinId || ''); setMkItems(l.items || {}); setMkFurni(l.furni || {}); setMkItemPick(''); setMkFurniPick(''); }} className="text-[#00cfff]/70 hover:text-[#00cfff] text-[11px] uppercase tracking-widest">edit</button>
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
                <div className="space-y-2">
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
                  {/* Items */}
                  <div>
                    <p className="text-[9px] uppercase tracking-widest text-white/35 mb-1">Items</p>
                    <div className="flex gap-1.5">
                      <select value={mkItemPick} onChange={e => setMkItemPick(e.target.value)} className="flex-1 min-w-0 bg-white/5 border border-white/15 text-white px-2 py-1.5 text-[12px] outline-none focus:border-brandYellow">
                        <option value="">— pick item —</option>
                        {ITEMS.map(it => <option key={it.id} value={it.id}>{it.emoji} {it.name}</option>)}
                      </select>
                      <button onClick={() => { if (!mkItemPick) return; setMkItems(prev => ({ ...prev, [mkItemPick]: (prev[mkItemPick] || 0) + 1 })); }} className="px-2.5 py-1.5 bg-white/10 text-white text-[11px] border border-white/20 hover:bg-white/20 active:scale-95">+1</button>
                    </div>
                    {Object.keys(mkItems).length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {Object.entries(mkItems).map(([id, q]) => { const it = itemById(id); return (
                          <span key={id} className="flex items-center gap-1 bg-white/8 border border-white/15 px-2 py-0.5 text-[11px] text-white">
                            {it?.emoji} {it?.name} ×{q}
                            <button onClick={() => setMkItems(prev => { const n = { ...prev }; if (n[id] > 1) n[id]--; else delete n[id]; return n; })} className="text-white/40 hover:text-brandRed ml-1 leading-none">✕</button>
                          </span>
                        ); })}
                      </div>
                    )}
                  </div>
                  {/* Furniture */}
                  <div>
                    <p className="text-[9px] uppercase tracking-widest text-white/35 mb-1">Furniture</p>
                    <div className="flex gap-1.5">
                      <select value={mkFurniPick} onChange={e => setMkFurniPick(e.target.value)} className="flex-1 min-w-0 bg-white/5 border border-white/15 text-white px-2 py-1.5 text-[12px] outline-none focus:border-brandYellow">
                        <option value="">— pick furniture —</option>
                        {CATS.map(cat => (
                          <optgroup key={cat.id} label={cat.name}>
                            {FURNI.filter(f => f.cat === cat.id).map(f => <option key={f.kind} value={f.kind}>{f.emoji} {f.name}</option>)}
                          </optgroup>
                        ))}
                      </select>
                      <button onClick={() => { if (!mkFurniPick) return; setMkFurni(prev => ({ ...prev, [mkFurniPick]: (prev[mkFurniPick] || 0) + 1 })); }} className="px-2.5 py-1.5 bg-white/10 text-white text-[11px] border border-white/20 hover:bg-white/20 active:scale-95">+1</button>
                    </div>
                    {Object.keys(mkFurni).length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {Object.entries(mkFurni).map(([kind, q]) => { const f = FURNI.find(x => x.kind === kind); return (
                          <span key={kind} className="flex items-center gap-1 bg-white/8 border border-white/15 px-2 py-0.5 text-[11px] text-white">
                            {f?.emoji} {f?.name} ×{q}
                            <button onClick={() => setMkFurni(prev => { const n = { ...prev }; if (n[kind] > 1) n[kind]--; else delete n[kind]; return n; })} className="text-white/40 hover:text-brandRed ml-1 leading-none">✕</button>
                          </span>
                        ); })}
                      </div>
                    )}
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
              <p className="font-mono font-bold text-3xl sm:text-4xl text-brandYellow mb-4" style={{ textShadow: '0 0 18px rgba(255,210,60,0.55)' }}>✦ +{rewardReveal.crystals.toLocaleString('pt-PT')}</p>
            )}
            {Object.keys(rewardReveal.items || {}).length > 0 && (
              <div className="flex flex-wrap justify-center gap-2 mb-4">
                {Object.entries(rewardReveal.items).map(([id, q]) => { const it = itemById(id); return (
                  <div key={id} className="flex items-center gap-1.5 bg-white/8 border border-white/20 px-3 py-1.5 text-white text-sm">
                    <span className="text-xl">{it?.emoji}</span>
                    <span>{it?.name ?? id}{q > 1 ? ` ×${q}` : ''}</span>
                  </div>
                ); })}
              </div>
            )}
            {Object.keys(rewardReveal.furni || {}).length > 0 && (
              <div className="flex flex-wrap justify-center gap-2 mb-4">
                {Object.entries(rewardReveal.furni).map(([kind, q]) => { const f = FURNI.find(x => x.kind === kind); return (
                  <div key={kind} className="flex items-center gap-1.5 bg-white/8 border border-white/20 px-3 py-1.5 text-white text-sm">
                    <span className="text-xl">{f?.emoji ?? '🪑'}</span>
                    <span>{f?.name ?? kind}{q > 1 ? ` ×${q}` : ''}</span>
                  </div>
                ); })}
              </div>
            )}

            <button onClick={() => setRewardReveal(null)} className="bg-brandYellow text-black font-bold uppercase tracking-[0.3em] text-sm px-10 py-3.5 hover:bg-white transition-colors active:scale-95">Claim ▸</button>
          </div>
          <style>{`@keyframes rwd-spin{to{transform:translate(-50%,-50%) rotate(360deg)}}@keyframes rwd-pop{from{opacity:0;transform:scale(0.8)}to{opacity:1;transform:scale(1)}}@keyframes rwd-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}`}</style>
        </div>
      ); })()}

      {/* ── Interaction: initiator prompt "Interact with X?" ── */}
      {interactPrompt && !interactWaiting && !interactSession && (
        <div className="absolute inset-0 z-[80] flex items-center justify-center pointer-events-none">
          <div className="pointer-events-auto w-64 bg-black/90 border border-white/20 shadow-2xl p-5 text-center">
            <p className="font-mono text-[10px] uppercase tracking-widest text-white/50 mb-1">Interact with</p>
            <p className="font-mono font-bold text-white text-base mb-4">{interactPrompt.handle}</p>
            <div className="flex gap-2">
              <button onClick={sendInteractRequest} className="flex-1 bg-[#00cfff] text-black font-bold uppercase text-[11px] tracking-widest py-2.5 hover:bg-white transition-colors active:scale-95">Yes</button>
              <button onClick={() => setInteractPrompt(null)} className="flex-1 border border-white/20 text-white/50 hover:text-white text-[11px] uppercase tracking-widest py-2.5 active:scale-95">No</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Interaction: waiting for response ── */}
      {interactWaiting && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-[80] flex items-center gap-3 bg-black/80 border border-white/15 px-4 py-2 pointer-events-auto">
          <span className="font-mono text-[11px] text-white/60 uppercase tracking-widest">Waiting for {interactPrompt?.handle}…</span>
          <button onClick={() => { setInteractWaiting(false); setInteractPrompt(null); }} className="text-white/40 hover:text-white text-sm leading-none">✕</button>
        </div>
      )}

      {/* ── Interaction: incoming request ── */}
      {interactRequest && !interactSession && (
        <div className="absolute inset-0 z-[80] flex items-center justify-center pointer-events-none">
          <div className="pointer-events-auto w-64 bg-black/90 border border-[#00cfff]/40 shadow-2xl p-5 text-center">
            <p className="font-mono text-[10px] uppercase tracking-widest text-[#00cfff]/70 mb-1">wants to interact</p>
            <p className="font-mono font-bold text-white text-base mb-4">{interactRequest.handle}</p>
            <div className="flex gap-2">
              <button onClick={acceptInteract} className="flex-1 bg-[#00cfff] text-black font-bold uppercase text-[11px] tracking-widest py-2.5 hover:bg-white transition-colors active:scale-95">Yes</button>
              <button onClick={declineInteract} className="flex-1 border border-white/20 text-white/50 hover:text-white text-[11px] uppercase tracking-widest py-2.5 active:scale-95">No</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Interaction: active session (menu / chat / gift / trade) ── */}
      {interactSession && (() => {
        const { peer, mode } = interactSession;
        const myOwnedItems = ITEMS.filter(it => itemCount(it.id) > 0);
        const myOwnedFurni = Object.entries(wallet.furni).filter(([, n]) => n > 0).map(([kind, count]) => ({ kind, count, def: defOf(kind) }));
        const offerLabel = (o: TradeOffer) => o.type === 'item' ? `${itemById(o.id)?.emoji ?? ''} ${itemById(o.id)?.name ?? o.id}` : o.type === 'furni' ? `${defOf(o.kind).emoji} ${defOf(o.kind).name}` : `${CURRENCY_SYMBOL}${o.amount.toLocaleString('pt-PT')}`;
        return (
          <div className="absolute inset-0 z-[80] flex items-end sm:items-center justify-center pointer-events-none" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 5rem)' }}>
            <div className="absolute inset-0 bg-black/50 pointer-events-auto" onClick={() => closeInteract()} />
            <div className="pointer-events-auto relative w-full max-w-sm mx-4 bg-black/95 border border-white/20 shadow-2xl">
              {/* Header */}
              <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10">
                {mode !== 'menu' && (
                  <button onClick={() => { setInteractSession(s => s ? { ...s, mode: 'menu' } : null); broadcastMode(null); }} className="text-white/40 hover:text-white text-xs font-mono mr-1">←</button>
                )}
                <span className="flex-1 font-mono text-[11px] uppercase tracking-widest text-white/60 truncate">
                  {mode === 'menu' ? peer.handle : mode === 'chat' ? `Chat · ${peer.handle}` : mode === 'gift' ? `Gift to ${peer.handle}` : `Trade with ${peer.handle}`}
                </span>
                <button onClick={() => closeInteract()} className="text-white/40 hover:text-white text-sm leading-none">✕</button>
              </div>

              {/* Menu */}
              {mode === 'menu' && (
                <div className="p-4 flex flex-col gap-2">
                  <button onClick={() => { setInteractSession(s => s ? { ...s, mode: 'chat' } : null); broadcastMode('chat'); }} className="w-full py-3 border border-white/15 text-white font-mono text-[11px] uppercase tracking-widest hover:bg-white/10 transition-colors px-4 flex items-center justify-between">
                    <span>💬  Chat</span>
                    {peerMode === 'chat' && <span className="font-mono text-[10px] text-[#00cfff] border border-[#00cfff] px-1.5 py-0.5 leading-none">{peer.handle}</span>}
                  </button>
                  <button onClick={() => { setMyOffer(null); myOfferRef.current = null; setOfferCrystals(''); setGiftTab('item'); setInteractSession(s => s ? { ...s, mode: 'gift' } : null); broadcastMode('gift'); }} className="w-full py-3 border border-white/15 text-white font-mono text-[11px] uppercase tracking-widest hover:bg-white/10 transition-colors px-4 flex items-center justify-between">
                    <span>🎁  Gift</span>
                    {peerMode === 'gift' && <span className="font-mono text-[10px] text-[#00cfff] border border-[#00cfff] px-1.5 py-0.5 leading-none">{peer.handle}</span>}
                  </button>
                  <button onClick={() => { setMyOffer(null); myOfferRef.current = null; setTheirOffer(null); theirOfferRef.current = null; setMyTradeConfirmed(false); myTradeConfirmedRef.current = false; setTheirTradeConfirmed(false); theirTradeConfirmedRef.current = false; setOfferCrystals(''); setTradeTab('item'); setInteractSession(s => s ? { ...s, mode: 'trade' } : null); broadcastMode('trade'); }} className="w-full py-3 border border-white/15 text-white font-mono text-[11px] uppercase tracking-widest hover:bg-white/10 transition-colors px-4 flex items-center justify-between">
                    <span>⇄  Trade</span>
                    {peerMode === 'trade' && <span className="font-mono text-[10px] text-[#00cfff] border border-[#00cfff] px-1.5 py-0.5 leading-none">{peer.handle}</span>}
                  </button>
                </div>
              )}

              {/* Private chat */}
              {mode === 'chat' && (
                <div className="flex flex-col" style={{ height: '18rem' }}>
                  <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
                    {privateMsgs.length === 0 && <p className="text-white/25 text-[11px] font-mono text-center mt-10">Say something to {peer.handle}</p>}
                    {privateMsgs.map((m, i) => (
                      <div key={i} className={`flex flex-col gap-0.5 ${m.mine ? 'items-end' : 'items-start'}`}>
                        <span className="font-mono text-[9px] text-white/35 uppercase">{m.mine ? 'you' : m.handle}</span>
                        <span className={`font-mono text-xs px-3 py-1.5 max-w-[80%] break-words ${m.mine ? 'bg-[#00cfff]/20 text-white' : 'bg-white/10 text-white'}`}>{m.text}</span>
                      </div>
                    ))}
                  </div>
                  <form className="flex border-t border-white/10" onSubmit={sendPrivateMsg}>
                    <input value={privateInput} onChange={e => setPrivateInput(e.target.value)} placeholder={`Message ${peer.handle}…`} maxLength={300} className="flex-1 bg-transparent px-3 py-2.5 text-xs font-mono text-white placeholder-white/25 outline-none" />
                    <button type="submit" className="px-4 text-[#00cfff] text-xs font-mono hover:text-white transition-colors">Send</button>
                  </form>
                </div>
              )}

              {/* Gift */}
              {mode === 'gift' && (
                <div className="p-4">
                  <div className="flex gap-1 mb-3">
                    {(['item', 'crystals', 'furni'] as const).map(tab => (
                      <button key={tab} onClick={() => { setGiftTab(tab); setMyOffer(null); myOfferRef.current = null; setOfferCrystals(''); }}
                        className={`flex-1 py-1 font-mono text-[10px] uppercase tracking-widest border transition-colors ${giftTab === tab ? 'border-[#00cfff] text-[#00cfff]' : 'border-white/10 text-white/40 hover:text-white/70'}`}>
                        {tab === 'item' ? 'Items' : tab === 'crystals' ? `${CURRENCY_SYMBOL} Cristais` : 'Furniture'}
                      </button>
                    ))}
                  </div>

                  {giftTab === 'item' && (myOwnedItems.length === 0 ? (
                    <p className="text-white/40 text-xs font-mono text-center py-8">You have no items to gift</p>
                  ) : (
                    <>
                      <p className="text-white/40 text-[10px] font-mono uppercase tracking-widest mb-3">Select an item</p>
                      <div className="space-y-1.5 max-h-44 overflow-y-auto mb-3">
                        {myOwnedItems.map(it => {
                          const sel = myOffer?.type === 'item' && myOffer.id === it.id;
                          return (
                            <button key={it.id} onClick={() => { const o: TradeOffer = { type: 'item', id: it.id }; const next = sel ? null : o; setMyOffer(next); myOfferRef.current = next; }}
                              className={`w-full flex items-center gap-3 px-3 py-2.5 border text-left transition-colors ${sel ? 'border-[#00cfff] bg-[#00cfff]/10' : 'border-white/10 hover:border-white/30'}`}>
                              <span className="text-xl leading-none">{it.emoji}</span>
                              <span className="flex-1 font-mono text-xs text-white">{it.name}</span>
                              <span className="font-mono text-[10px] text-white/40">×{itemCount(it.id)}</span>
                            </button>
                          );
                        })}
                      </div>
                      <button onClick={sendGift} disabled={!myOffer || myOffer.type !== 'item'}
                        className="w-full bg-[#00cfff] text-black font-bold uppercase text-[11px] tracking-widest py-2.5 hover:bg-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed active:scale-95">
                        Gift ▸
                      </button>
                    </>
                  ))}

                  {giftTab === 'crystals' && (
                    <>
                      <p className="text-white/35 text-[10px] font-mono uppercase tracking-widest mb-2">Balance: {CURRENCY_SYMBOL}{wallet.balance.toLocaleString('pt-PT')}</p>
                      <input type="number" min={1} max={wallet.balance} value={offerCrystals} placeholder="Amount"
                        onChange={e => {
                          const raw = e.target.value;
                          setOfferCrystals(raw);
                          const n = Math.max(0, Math.min(wallet.balance, Math.floor(Number(raw) || 0)));
                          const o = n > 0 ? { type: 'crystals' as const, amount: n } : null;
                          setMyOffer(o); myOfferRef.current = o;
                        }}
                        className="w-full bg-white/5 border border-white/20 px-3 py-2 font-mono text-sm text-white mb-2 outline-none" />
                      <div className="flex gap-1 mb-3">
                        {[10, 50, 100, 500].map(n => (
                          <button key={n} onClick={() => {
                            const amt = Math.min(n, wallet.balance);
                            setOfferCrystals(String(amt));
                            const o = amt > 0 ? { type: 'crystals' as const, amount: amt } : null;
                            setMyOffer(o); myOfferRef.current = o;
                          }} className="flex-1 py-1 font-mono text-[10px] border border-white/10 text-white/40 hover:text-white/70 transition-colors">+{n}</button>
                        ))}
                      </div>
                      <button onClick={sendGift} disabled={!myOffer || myOffer.type !== 'crystals'}
                        className="w-full bg-[#00cfff] text-black font-bold uppercase text-[11px] tracking-widest py-2.5 hover:bg-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed active:scale-95">
                        Gift {myOffer?.type === 'crystals' ? `${CURRENCY_SYMBOL}${myOffer.amount}` : CURRENCY_SYMBOL} ▸
                      </button>
                    </>
                  )}

                  {giftTab === 'furni' && (myOwnedFurni.length === 0 ? (
                    <p className="text-white/40 text-xs font-mono text-center py-8">You have no furniture to gift</p>
                  ) : (
                    <>
                      <p className="text-white/40 text-[10px] font-mono uppercase tracking-widest mb-3">Select furniture</p>
                      <div className="space-y-1.5 max-h-44 overflow-y-auto mb-3">
                        {myOwnedFurni.map(({ kind, count, def }) => {
                          const sel = myOffer?.type === 'furni' && myOffer.kind === kind;
                          return (
                            <button key={kind} onClick={() => { const o: TradeOffer = { type: 'furni', kind }; const next = sel ? null : o; setMyOffer(next); myOfferRef.current = next; }}
                              className={`w-full flex items-center gap-3 px-3 py-2.5 border text-left transition-colors ${sel ? 'border-[#00cfff] bg-[#00cfff]/10' : 'border-white/10 hover:border-white/30'}`}>
                              <span className="text-xl leading-none">{def.emoji}</span>
                              <span className="flex-1 font-mono text-xs text-white">{def.name}</span>
                              <span className="font-mono text-[10px] text-white/40">×{count}</span>
                            </button>
                          );
                        })}
                      </div>
                      <button onClick={sendGift} disabled={!myOffer || myOffer.type !== 'furni'}
                        className="w-full bg-[#00cfff] text-black font-bold uppercase text-[11px] tracking-widest py-2.5 hover:bg-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed active:scale-95">
                        Gift ▸
                      </button>
                    </>
                  ))}
                </div>
              )}

              {/* Trade */}
              {mode === 'trade' && (
                <div className="p-4 space-y-3">
                  <div>
                    <p className="text-white/40 text-[10px] font-mono uppercase tracking-widest mb-2">Your offer</p>
                    {myOffer ? (
                      <div className="flex items-center gap-3 px-3 py-2.5 border border-[#00cfff]/40 bg-[#00cfff]/5">
                        <span className="flex-1 font-mono text-xs text-white">{offerLabel(myOffer)}</span>
                        {!myTradeConfirmed && <button onClick={() => { setMyOffer(null); myOfferRef.current = null; setOfferCrystals(''); }} className="text-white/30 hover:text-white text-xs">✕</button>}
                        {myTradeConfirmed && <span className="font-mono text-[10px] text-[#00cfff]">✓</span>}
                      </div>
                    ) : (
                      <>
                        <div className="flex gap-1 mb-2">
                          {(['item', 'crystals', 'furni'] as const).map(tab => (
                            <button key={tab} onClick={() => { setTradeTab(tab); setOfferCrystals(''); }}
                              className={`flex-1 py-1 font-mono text-[10px] uppercase tracking-widest border transition-colors ${tradeTab === tab ? 'border-[#00cfff] text-[#00cfff]' : 'border-white/10 text-white/40 hover:text-white/70'}`}>
                              {tab === 'item' ? 'Items' : tab === 'crystals' ? CURRENCY_SYMBOL : 'Furni'}
                            </button>
                          ))}
                        </div>
                        {tradeTab === 'item' && (
                          <div className="space-y-1 max-h-28 overflow-y-auto">
                            {myOwnedItems.length === 0 ? (
                              <p className="text-white/30 text-xs font-mono text-center py-4">No items to offer</p>
                            ) : myOwnedItems.map(it => (
                              <button key={it.id} onClick={() => { const o: TradeOffer = { type: 'item', id: it.id }; setMyOffer(o); myOfferRef.current = o; sendTradeOffer(o); }}
                                className="w-full flex items-center gap-3 px-3 py-2 border border-white/10 hover:border-white/30 text-left transition-colors">
                                <span className="text-lg leading-none">{it.emoji}</span>
                                <span className="flex-1 font-mono text-xs text-white">{it.name}</span>
                                <span className="font-mono text-[10px] text-white/40">×{itemCount(it.id)}</span>
                              </button>
                            ))}
                          </div>
                        )}
                        {tradeTab === 'crystals' && (
                          <>
                            <p className="text-white/35 text-[10px] font-mono mb-1.5">Balance: {CURRENCY_SYMBOL}{wallet.balance.toLocaleString('pt-PT')}</p>
                            <div className="flex gap-1.5 mb-1">
                              <input type="number" min={1} max={wallet.balance} value={offerCrystals} placeholder="Amount"
                                onChange={e => setOfferCrystals(String(Math.max(0, Math.min(wallet.balance, Math.floor(Number(e.target.value) || 0)))))}
                                className="flex-1 bg-white/5 border border-white/20 px-2 py-1.5 font-mono text-xs text-white outline-none" />
                              <button onClick={() => { const n = Math.min(wallet.balance, Math.floor(Number(offerCrystals) || 0)); if (n <= 0) return; const o: TradeOffer = { type: 'crystals', amount: n }; setMyOffer(o); myOfferRef.current = o; sendTradeOffer(o); }}
                                disabled={!offerCrystals || Number(offerCrystals) <= 0}
                                className="px-3 py-1.5 bg-white/10 font-mono text-[10px] uppercase text-white/70 hover:text-white border border-white/10 disabled:opacity-30">Set</button>
                            </div>
                            <div className="flex gap-1">
                              {[10, 50, 100].map(n => (
                                <button key={n} onClick={() => setOfferCrystals(String(Math.min(n, wallet.balance)))}
                                  className="flex-1 py-1 font-mono text-[10px] border border-white/10 text-white/40 hover:text-white/70 transition-colors">+{n}</button>
                              ))}
                            </div>
                          </>
                        )}
                        {tradeTab === 'furni' && (
                          <div className="space-y-1 max-h-28 overflow-y-auto">
                            {myOwnedFurni.length === 0 ? (
                              <p className="text-white/30 text-xs font-mono text-center py-4">No furniture to offer</p>
                            ) : myOwnedFurni.map(({ kind, count, def }) => (
                              <button key={kind} onClick={() => { const o: TradeOffer = { type: 'furni', kind }; setMyOffer(o); myOfferRef.current = o; sendTradeOffer(o); }}
                                className="w-full flex items-center gap-3 px-3 py-2 border border-white/10 hover:border-white/30 text-left transition-colors">
                                <span className="text-lg leading-none">{def.emoji}</span>
                                <span className="flex-1 font-mono text-xs text-white">{def.name}</span>
                                <span className="font-mono text-[10px] text-white/40">×{count}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  <div>
                    <p className="text-white/40 text-[10px] font-mono uppercase tracking-widest mb-2">Their offer</p>
                    {theirOffer ? (
                      <div className="flex items-center gap-3 px-3 py-2.5 border border-white/20 bg-white/5">
                        <span className="flex-1 font-mono text-xs text-white">{offerLabel(theirOffer)}</span>
                        {theirTradeConfirmed && <span className="font-mono text-[10px] text-[#00cfff]">✓ confirmed</span>}
                      </div>
                    ) : (
                      <div className="h-11 flex items-center justify-center border border-white/5">
                        <span className="text-white/25 text-[11px] font-mono">Waiting for {peer.handle}…</span>
                      </div>
                    )}
                  </div>
                  {myTradeConfirmed ? (
                    <p className="text-center text-[11px] font-mono text-[#00cfff]/70">Waiting for {peer.handle} to confirm…</p>
                  ) : (
                    <button onClick={confirmTrade} disabled={!myOffer || !theirOffer}
                      className="w-full bg-[#00cfff] text-black font-bold uppercase text-[11px] tracking-widest py-2.5 hover:bg-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed active:scale-95">
                      Confirm Trade ▸
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── NPC interaction: prompt ── */}
      {npcInteract?.mode === 'prompt' && (
        <div className="absolute inset-0 z-[80] flex items-center justify-center pointer-events-none">
          <div className="pointer-events-auto w-64 bg-black/90 border border-white/20 shadow-2xl p-5 text-center">
            <p className="font-mono text-[10px] uppercase tracking-widest text-white/50 mb-1">Interact with</p>
            <p className="font-mono font-bold text-white text-base mb-4">{npcInteract.handle}</p>
            <div className="flex gap-2">
              <button onClick={() => { setNpcGiftItem(null); setNpcInteract(s => s ? { ...s, mode: 'gift' } : null); }} className="flex-1 bg-[#00cfff] text-black font-bold uppercase text-[11px] tracking-widest py-2.5 hover:bg-white transition-colors active:scale-95">Yes</button>
              <button onClick={() => setNpcInteract(null)} className="flex-1 border border-white/20 text-white/50 hover:text-white text-[11px] uppercase tracking-widest py-2.5 active:scale-95">No</button>
            </div>
          </div>
        </div>
      )}

      {/* ── NPC interaction: gift panel ── */}
      {npcInteract?.mode === 'gift' && (() => {
        const myOwnedItems = ITEMS.filter(it => itemCount(it.id) > 0);
        return (
          <div className="absolute inset-0 z-[80] flex items-end sm:items-center justify-center pointer-events-none" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 5rem)' }}>
            <div className="absolute inset-0 bg-black/50 pointer-events-auto" onClick={() => setNpcInteract(null)} />
            <div className="pointer-events-auto relative w-full max-w-sm mx-4 bg-black/95 border border-white/20 shadow-2xl">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10">
                <span className="flex-1 font-mono text-[11px] uppercase tracking-widest text-white/60 truncate">Gift to {npcInteract.handle}</span>
                <button onClick={() => setNpcInteract(null)} className="text-white/40 hover:text-white text-sm leading-none">✕</button>
              </div>
              <div className="p-4">
                {myOwnedItems.length === 0 ? (
                  <p className="text-white/40 text-xs font-mono text-center py-8">You have no items to gift</p>
                ) : (
                  <>
                    <p className="text-white/40 text-[10px] font-mono uppercase tracking-widest mb-3">Select an item</p>
                    <div className="space-y-1.5 max-h-44 overflow-y-auto mb-3">
                      {myOwnedItems.map(it => (
                        <button key={it.id} onClick={() => setNpcGiftItem(t => t === it.id ? null : it.id)}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 border text-left transition-colors ${npcGiftItem === it.id ? 'border-[#00cfff] bg-[#00cfff]/10' : 'border-white/10 hover:border-white/30'}`}>
                          <span className="text-xl leading-none">{it.emoji}</span>
                          <span className="flex-1 font-mono text-xs text-white">{it.name}</span>
                          <span className="font-mono text-[10px] text-white/40">×{itemCount(it.id)}</span>
                        </button>
                      ))}
                    </div>
                    <button onClick={sendNpcGift} disabled={!npcGiftItem}
                      className="w-full bg-[#00cfff] text-black font-bold uppercase text-[11px] tracking-widest py-2.5 hover:bg-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed active:scale-95">
                      Gift ▸
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      <MenuModal open={menuOpen} onClose={() => setMenuOpen(false)} />

      {isSuper && <AdminModal open={adminOpen} onClose={() => setAdminOpen(false)} />}

      <InventoryModal open={invOpen} onClose={() => { setInvOpen(false); if (onboarding === 'character') finishCharacter(); }} onEquip={equipAppearance} onItemUsed={broadcastItemEffect} title={onboarding === 'character' ? 'Design your character' : 'Character'} />

      <BinaryRain visible={!roomReady} />
    </div>
  );
};
