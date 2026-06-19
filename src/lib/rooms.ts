// OUROO PRAÇA — user-created personal rooms (Supabase `rooms` table). The official rooms stay
// hardcoded in RoomCanvas; these are player-made. Degrades to [] if the table/env is missing.

import { supabase } from './supabase';
import { getAuthIdentity } from './auth';
import { getLocalPlayer } from './leaderboard';

export type RoomRow = { slug: string; name: string; owner: string; accent: string; floor: string; public: boolean; code: string; build_all: boolean; rights: string[]; plan: string; combat_enabled: boolean };

const ACCENTS = ['#00cfff', '#ff44aa', '#ffd23a', '#1ED760', '#cc44ff', '#ff6a3a'];
// `*` (not an explicit column list) so a row still loads if the optional `combat_enabled` column
// hasn't been migrated in yet — norm() defaults it to false. Old rooms therefore stay safe.
const SEL = '*';
// Normalise a raw row: rights/plan/combat_enabled may come back null (pre-migration) — always expose sane values.
const norm = (r: Record<string, unknown>): RoomRow => ({ ...(r as RoomRow), rights: Array.isArray(r.rights) ? (r.rights as string[]) : [], plan: typeof r.plan === 'string' && r.plan ? (r.plan as string) : 'salao', combat_enabled: !!r.combat_enabled });
// Short shareable code (no ambiguous chars) for inviting people to a room.
const newCode = () => Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');

// Stable owner id — Discord identity if signed in (so a room follows you across devices), else device.
export async function ownerId(): Promise<string> {
  const a = await getAuthIdentity().catch(() => null);
  return a?.device ?? getLocalPlayer().device;
}

// All PUBLIC personal rooms (most recent first). Private rooms are reached only by code.
export async function fetchRooms(): Promise<RoomRow[]> {
  if (!supabase) return [];
  const { data } = await supabase.from('rooms').select(SEL).eq('public', true).order('created_at', { ascending: false }).limit(80);
  return (data ?? []).map(norm);
}

// Rooms owned by the current player (incl. private ones).
export async function fetchMyRooms(): Promise<RoomRow[]> {
  if (!supabase) return [];
  const oid = await ownerId();
  const { data } = await supabase.from('rooms').select(SEL).eq('owner', oid).order('created_at');
  return (data ?? []).map(norm);
}

// Find a room by its invite code (case-insensitive). Used to join private rooms.
export async function roomByCode(code: string): Promise<RoomRow | null> {
  if (!supabase) return null;
  const c = code.trim().toUpperCase(); if (!c) return null;
  const { data } = await supabase.from('rooms').select(SEL).eq('code', c).limit(1).maybeSingle();
  return data ? norm(data) : null;
}

// Find a room by its slug (used to resolve a portal pointing at a public room).
export async function roomBySlug(slug: string): Promise<RoomRow | null> {
  if (!supabase) return null;
  const s = slug.trim(); if (!s) return null;
  const { data } = await supabase.from('rooms').select(SEL).eq('slug', s).limit(1).maybeSingle();
  return data ? norm(data) : null;
}

// Flip a room public (a pickable portal destination + listed in the browser) or back to invite-only.
export async function setRoomPublic(slug: string, isPublic: boolean): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('rooms').update({ public: isPublic }).eq('slug', slug);
  return !error;
}

// Create a personal room owned by the current player. `isPublic=false` → invite-only (join by code).
export async function createRoom(name: string, isPublic = true, plan = 'salao'): Promise<{ ok: true; room: RoomRow } | { ok: false; error: string }> {
  if (!supabase) return { ok: false, error: 'Offline.' };
  const oid = await ownerId();
  const rnd = (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}${Math.random()}`).replace(/[^a-z0-9]/gi, '').slice(0, 12);
  const room: RoomRow = { slug: `u_${rnd}`, name: name.trim().slice(0, 24) || 'My Room', owner: oid, accent: ACCENTS[rnd.charCodeAt(0) % ACCENTS.length], floor: '#161628', public: isPublic, code: newCode(), build_all: false, rights: [], plan, combat_enabled: false };
  // Don't insert combat_enabled — let the DB default fill it. This keeps room creation working even if
  // the combat migration hasn't been applied yet (the column would otherwise be rejected).
  const { combat_enabled: _omit, ...insertRow } = room;
  const { error } = await supabase.from('rooms').insert(insertRow);
  if (error) {
    const m = error.message || '';
    if (/schema cache|does not exist|not find the table|relation .* does not exist|column .* does not exist/i.test(m)) return { ok: false, error: 'Rooms aren’t enabled on the server yet 🛠️' };
    return { ok: false, error: m };
  }
  return { ok: true, room };
}

// Update a room's build permissions (owner-gated in the UI). `rights` = handles allowed to build.
// `combat_enabled` flags the room as a PvP zone (mod-gated in the UI) — players can fight + loot there.
export async function updateRoomPerms(slug: string, build_all: boolean, rights: string[], combat_enabled?: boolean): Promise<boolean> {
  if (!supabase) return false;
  const clean = Array.from(new Set(rights.map(h => h.trim()).filter(Boolean))).slice(0, 50);
  const patch: Record<string, unknown> = { build_all, rights: clean };
  if (combat_enabled !== undefined) patch.combat_enabled = combat_enabled;
  const { error } = await supabase.from('rooms').update(patch).eq('slug', slug);
  if (!error) return true;
  // If the combat_enabled column isn't migrated in yet, still save the build permissions.
  if (combat_enabled !== undefined && /column .* does not exist|combat_enabled|schema cache/i.test(error.message || '')) {
    const { error: e2 } = await supabase.from('rooms').update({ build_all, rights: clean }).eq('slug', slug);
    return !e2;
  }
  return false;
}

// Delete a room and all its placed furniture (owner-gated in the UI).
export async function deleteRoom(slug: string): Promise<boolean> {
  if (!supabase) return false;
  try { await supabase.from('room_items').delete().eq('room', slug); } catch { /* ignore */ }
  const { error } = await supabase.from('rooms').delete().eq('slug', slug);
  return !error;
}
