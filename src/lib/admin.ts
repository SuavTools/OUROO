import { supabase } from './supabase';

// All numbers come from already-public tables (handles/scores are on the leaderboard, messages in
// chat) — this just aggregates them into a private SUAV-only view. No emails, no IPs.

export type AdminStats = {
  accounts: number; discordAccounts: number;
  runs: number; runsToday: number;
  messages: number; messagesToday: number;
  rooms: number;
};

function startOfTodayISO(): string {
  const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString();
}

export async function getAdminStats(): Promise<AdminStats> {
  const z: AdminStats = { accounts: 0, discordAccounts: 0, runs: 0, runsToday: 0, messages: 0, messagesToday: 0, rooms: 0 };
  if (!supabase) return z;
  const today = startOfTodayISO();
  const head = { count: 'exact' as const, head: true };
  const [acc, disc, runs, runsT, msg, msgT, rooms] = await Promise.all([
    supabase.from('players').select('*', head),
    supabase.from('players').select('*', head).like('device_token', 'discord:%'),
    supabase.from('scores').select('*', head),
    supabase.from('scores').select('*', head).gte('created_at', today),
    supabase.from('messages').select('*', head),
    supabase.from('messages').select('*', head).gte('created_at', today),
    supabase.from('channels').select('*', head),
  ]);
  return {
    accounts: acc.count ?? 0,
    discordAccounts: disc.count ?? 0,
    runs: runs.count ?? 0,
    runsToday: runsT.count ?? 0,
    messages: msg.count ?? 0,
    messagesToday: msgT.count ?? 0,
    rooms: rooms.count ?? 0,
  };
}

export type AdminAccount = { handle: string; created_at: string; discord: boolean; userId?: string };

export async function getRecentAccounts(limit = 40): Promise<AdminAccount[]> {
  if (!supabase) return [];
  const { data } = await supabase
    .from('players').select('handle,created_at,device_token')
    .order('created_at', { ascending: false }).limit(limit);
  return (data ?? []).map(r => {
    const tok = String(r.device_token || ''); const discord = tok.startsWith('discord:');
    return { handle: r.handle as string, created_at: r.created_at as string, discord, userId: discord ? tok.slice('discord:'.length) : undefined };
  });
}

// Super-admins (the `moderators.is_super` rows). A Discord account's auth uuid === its device_token
// minus the `discord:` prefix, so we grant/revoke by an account's userId.
export async function getSuperAdminIds(): Promise<string[]> {
  if (!supabase) return [];
  const { data } = await supabase.from('moderators').select('user_id').eq('is_super', true);
  return (data ?? []).map(r => String(r.user_id));
}

// Grant / revoke super-admin. RLS only lets an existing super-admin do this (insert/delete are gated
// by is_super_mod(auth.uid())), so it must run while signed in as a super-admin.
export async function setSuperAdmin(userId: string, on: boolean): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Offline.' };
  if (on) {
    const { error } = await supabase.from('moderators').insert({ user_id: userId, is_super: true });
    if (error && !/duplicate|conflict|unique/i.test(error.message)) return { ok: false, error: error.message };
    return { ok: true };
  }
  const { error } = await supabase.from('moderators').delete().eq('user_id', userId);
  return error ? { ok: false, error: error.message } : { ok: true };
}
