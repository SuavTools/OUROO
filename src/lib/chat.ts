import { supabase } from './supabase';
import { validateMessage, validateHandle, normalizeText } from './names';

export type Channel = { id: string; slug: string; name: string; kind: string; is_system: boolean; created_by: string | null; pinned: string | null };
export type ChatMessage = {
  id: number;
  user_id: string;
  handle: string;
  avatar: string | null;
  body: string;
  created_at: string;
  hidden?: boolean;
};

// ---- channels ----
export async function fetchChannels(): Promise<Channel[]> {
  if (!supabase) return [];
  const { data } = await supabase
    .from('channels').select('id,slug,name,kind,is_system,created_by,pinned')
    .order('is_system', { ascending: false }).order('created_at', { ascending: true });
  return (data ?? []) as Channel[];
}

function slugify(name: string): string {
  return normalizeText(name).slice(0, 24) || 'room';
}

export async function createChannel(name: string): Promise<{ ok: true; channel: Channel } | { ok: false; error: string }> {
  const sb = supabase;
  if (!sb) return { ok: false, error: 'Offline.' };
  const v = validateHandle(name);   // reuse: 3–16 chars, no slurs
  if (!v.ok) return { ok: false, error: v.error };
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, error: 'Connect Discord to create rooms.' };
  const { data, error } = await sb
    .from('channels')
    .insert({ slug: slugify(v.value), name: v.value, kind: 'chat', is_system: false, created_by: user.id })
    .select('id,slug,name,kind,is_system,created_by,pinned').single();
  if (error) {
    if (error.code === '23505') return { ok: false, error: 'A room with that name already exists.' };
    if (error.message?.includes('channel_limit_reached')) return { ok: false, error: 'You’ve hit the 3-room limit. Delete one to make another.' };
    return { ok: false, error: error.message };
  }
  return { ok: true, channel: data as Channel };
}

export async function deleteChannel(id: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('channels').delete().eq('id', id);
  return !error;
}

// Set/clear a channel's pinned message (moderators only — enforced by RLS).
export async function setChannelPinned(id: string, pinned: string | null): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('channels').update({ pinned: pinned?.trim() || null }).eq('id', id);
  return !error;
}

export async function deleteMessage(id: number): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('messages').delete().eq('id', id);
  return !error;
}

// ---- moderation ----
export async function amIModerator(): Promise<boolean> {
  if (!supabase) return false;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase.from('moderators').select('user_id').eq('user_id', user.id).maybeSingle();
  return !!data;
}

// Super-admin (SUAV) — gates the private Admin panel.
export async function amISuperAdmin(): Promise<boolean> {
  if (!supabase) return false;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase.from('moderators').select('is_super').eq('user_id', user.id).maybeSingle();
  return !!data?.is_super;
}

// Mod action: ban a user AND purge their messages (for hate/spam).
export async function banUser(userId: string, reason = ''): Promise<boolean> {
  const sb = supabase;
  if (!sb) return false;
  const { data: { user } } = await sb.auth.getUser();
  const { error } = await sb.from('bans').insert({ user_id: userId, reason, by: user?.id });
  if (error) return false;
  await sb.from('messages').delete().eq('user_id', userId);   // RLS allows: requester is a mod
  return true;
}

// ---- messages ----
export async function fetchMessages(channelId: string, limit = 50): Promise<ChatMessage[]> {
  if (!supabase || !channelId) return [];
  const { data } = await supabase
    .from('messages').select('id,user_id,handle,avatar,body,created_at')
    .eq('channel_id', channelId).eq('hidden', false)
    .order('created_at', { ascending: false }).limit(limit);
  return ((data ?? []) as ChatMessage[]).reverse();
}

export function subscribeMessages(
  channelId: string,
  handlers: { onInsert: (m: ChatMessage) => void; onDelete: (id: number) => void },
): () => void {
  const sb = supabase;
  if (!sb || !channelId) return () => {};
  const ch = sb
    .channel(`messages:${channelId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `channel_id=eq.${channelId}` },
      (payload) => { const m = payload.new as ChatMessage; if (!m.hidden) handlers.onInsert(m); })
    // DELETE events arrive without the channel filter (only the pk), so we just drop by id if present.
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' },
      (payload) => { const id = (payload.old as { id?: number }).id; if (id != null) handlers.onDelete(id); })
    .subscribe();
  return () => { sb.removeChannel(ch); };
}

export async function sendMessage(channelId: string, body: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const sb = supabase;
  if (!sb) return { ok: false, error: 'Chat offline.' };
  if (!channelId) return { ok: false, error: 'Invalid room.' };
  const check = validateMessage(body);
  if (!check.ok) return { ok: false, error: check.error };
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, error: 'Connect Discord to chat.' };
  const m = user.user_metadata || {};
  const handle = String(m.full_name || m.name || m.preferred_username || 'Discord').slice(0, 32);
  const avatar = (m.avatar_url as string) || null;
  const { error } = await sb.from('messages').insert({ channel_id: channelId, user_id: user.id, handle, avatar, body: check.value });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
