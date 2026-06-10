// OUROO PRAÇA — user-created personal rooms (Supabase `rooms` table). The official rooms stay
// hardcoded in RoomCanvas; these are player-made. Degrades to [] if the table/env is missing.

import { supabase } from './supabase';
import { getAuthIdentity } from './auth';
import { getLocalPlayer } from './leaderboard';

export type RoomRow = { slug: string; name: string; owner: string; accent: string; floor: string; public: boolean };

const ACCENTS = ['#00cfff', '#ff44aa', '#ffd23a', '#1ED760', '#cc44ff', '#ff6a3a'];

// Stable owner id — Discord identity if signed in (so a room follows you across devices), else device.
export async function ownerId(): Promise<string> {
  const a = await getAuthIdentity().catch(() => null);
  return a?.device ?? getLocalPlayer().device;
}

// All public personal rooms (most recent first).
export async function fetchRooms(): Promise<RoomRow[]> {
  if (!supabase) return [];
  const { data } = await supabase.from('rooms').select('slug,name,owner,accent,floor,public').eq('public', true).order('created_at', { ascending: false }).limit(80);
  return (data ?? []) as RoomRow[];
}

// Rooms owned by the current player (incl. private ones).
export async function fetchMyRooms(): Promise<RoomRow[]> {
  if (!supabase) return [];
  const oid = await ownerId();
  const { data } = await supabase.from('rooms').select('slug,name,owner,accent,floor,public').eq('owner', oid).order('created_at');
  return (data ?? []) as RoomRow[];
}

// Create a personal room owned by the current player. Returns the row, or an error string.
export async function createRoom(name: string, isPublic = true): Promise<{ ok: true; room: RoomRow } | { ok: false; error: string }> {
  if (!supabase) return { ok: false, error: 'Offline.' };
  const oid = await ownerId();
  const rnd = (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}${Math.random()}`).replace(/[^a-z0-9]/gi, '').slice(0, 12);
  const room: RoomRow = { slug: `u_${rnd}`, name: name.trim().slice(0, 24) || 'A Minha Sala', owner: oid, accent: ACCENTS[rnd.charCodeAt(0) % ACCENTS.length], floor: '#161628', public: isPublic };
  const { error } = await supabase.from('rooms').insert(room);
  if (error) return { ok: false, error: error.message };
  return { ok: true, room };
}
