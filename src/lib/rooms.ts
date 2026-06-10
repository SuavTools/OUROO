// OUROO PRAÇA — user-created personal rooms (Supabase `rooms` table). The official rooms stay
// hardcoded in RoomCanvas; these are player-made. Degrades to [] if the table/env is missing.

import { supabase } from './supabase';
import { getAuthIdentity } from './auth';
import { getLocalPlayer } from './leaderboard';

export type RoomRow = { slug: string; name: string; owner: string; accent: string; floor: string; public: boolean; code: string; build_all: boolean; rights: string[] };

const ACCENTS = ['#00cfff', '#ff44aa', '#ffd23a', '#1ED760', '#cc44ff', '#ff6a3a'];
const SEL = 'slug,name,owner,accent,floor,public,code,build_all,rights';
// Normalise a raw row: rights may come back null (pre-migration) — always expose an array.
const norm = (r: Record<string, unknown>): RoomRow => ({ ...(r as RoomRow), rights: Array.isArray(r.rights) ? (r.rights as string[]) : [] });
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

// Create a personal room owned by the current player. `isPublic=false` → invite-only (join by code).
export async function createRoom(name: string, isPublic = true): Promise<{ ok: true; room: RoomRow } | { ok: false; error: string }> {
  if (!supabase) return { ok: false, error: 'Offline.' };
  const oid = await ownerId();
  const rnd = (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}${Math.random()}`).replace(/[^a-z0-9]/gi, '').slice(0, 12);
  const room: RoomRow = { slug: `u_${rnd}`, name: name.trim().slice(0, 24) || 'A Minha Sala', owner: oid, accent: ACCENTS[rnd.charCodeAt(0) % ACCENTS.length], floor: '#161628', public: isPublic, code: newCode(), build_all: false, rights: [] };
  const { error } = await supabase.from('rooms').insert(room);
  if (error) {
    const m = error.message || '';
    if (/schema cache|does not exist|not find the table|relation .* does not exist|column .* does not exist/i.test(m)) return { ok: false, error: 'Salas ainda não ativadas no servidor 🛠️' };
    return { ok: false, error: m };
  }
  return { ok: true, room };
}

// Update a room's build permissions (owner-gated in the UI). `rights` = handles allowed to build.
export async function updateRoomPerms(slug: string, build_all: boolean, rights: string[]): Promise<boolean> {
  if (!supabase) return false;
  const clean = Array.from(new Set(rights.map(h => h.trim()).filter(Boolean))).slice(0, 50);
  const { error } = await supabase.from('rooms').update({ build_all, rights: clean }).eq('slug', slug);
  return !error;
}

// Delete a room and all its placed furniture (owner-gated in the UI).
export async function deleteRoom(slug: string): Promise<boolean> {
  if (!supabase) return false;
  try { await supabase.from('room_items').delete().eq('room', slug); } catch { /* ignore */ }
  const { error } = await supabase.from('rooms').delete().eq('slug', slug);
  return !error;
}
