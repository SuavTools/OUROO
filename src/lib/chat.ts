import { supabase } from './supabase';
import { validateMessage, validateHandle, normalizeText } from './names';

export type Channel = { id: string; slug: string; name: string; kind: string; is_system: boolean };
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
    .from('channels').select('id,slug,name,kind,is_system')
    .order('is_system', { ascending: false }).order('created_at', { ascending: true });
  return (data ?? []) as Channel[];
}

function slugify(name: string): string {
  return normalizeText(name).slice(0, 24) || 'sala';
}

export async function createChannel(name: string): Promise<{ ok: true; channel: Channel } | { ok: false; error: string }> {
  const sb = supabase;
  if (!sb) return { ok: false, error: 'Offline.' };
  const v = validateHandle(name);   // reuse: 3–16 chars, no slurs
  if (!v.ok) return { ok: false, error: v.error };
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, error: 'Liga o Discord para criar salas.' };
  const { data, error } = await sb
    .from('channels')
    .insert({ slug: slugify(v.value), name: v.value, kind: 'chat', is_system: false, created_by: user.id })
    .select('id,slug,name,kind,is_system').single();
  if (error) return { ok: false, error: error.code === '23505' ? 'Já existe uma sala com esse nome.' : error.message };
  return { ok: true, channel: data as Channel };
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

export function subscribeMessages(channelId: string, onInsert: (m: ChatMessage) => void): () => void {
  const sb = supabase;
  if (!sb || !channelId) return () => {};
  const ch = sb
    .channel(`messages:${channelId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `channel_id=eq.${channelId}` },
      (payload) => { const m = payload.new as ChatMessage; if (!m.hidden) onInsert(m); })
    .subscribe();
  return () => { sb.removeChannel(ch); };
}

export async function sendMessage(channelId: string, body: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const sb = supabase;
  if (!sb) return { ok: false, error: 'Chat offline.' };
  if (!channelId) return { ok: false, error: 'Sala inválida.' };
  const check = validateMessage(body);
  if (!check.ok) return { ok: false, error: check.error };
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, error: 'Liga o Discord para falar.' };
  const m = user.user_metadata || {};
  const handle = String(m.full_name || m.name || m.preferred_username || 'Discord').slice(0, 32);
  const avatar = (m.avatar_url as string) || null;
  const { error } = await sb.from('messages').insert({ channel_id: channelId, user_id: user.id, handle, avatar, body: check.value });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
