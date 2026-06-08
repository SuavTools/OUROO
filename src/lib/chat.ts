import { supabase } from './supabase';
import { validateMessage } from './names';

export type ChatMessage = {
  id: number;
  user_id: string;
  handle: string;
  avatar: string | null;
  body: string;
  created_at: string;
  hidden?: boolean;
};

// Last N messages, oldest-first for display.
export async function fetchMessages(limit = 50): Promise<ChatMessage[]> {
  if (!supabase) return [];
  const { data } = await supabase
    .from('messages')
    .select('id,user_id,handle,avatar,body,created_at')
    .eq('hidden', false)
    .order('created_at', { ascending: false })
    .limit(limit);
  return ((data ?? []) as ChatMessage[]).reverse();
}

// Live subscription to new messages. Returns an unsubscribe fn.
export function subscribeMessages(onInsert: (m: ChatMessage) => void): () => void {
  const sb = supabase;
  if (!sb) return () => {};
  const ch = sb
    .channel('public:messages')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
      const m = payload.new as ChatMessage;
      if (!m.hidden) onInsert(m);
    })
    .subscribe();
  return () => { sb.removeChannel(ch); };
}

// Post a message. Requires a logged-in Discord session (RLS enforces auth.uid() = user_id).
export async function sendMessage(body: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const sb = supabase;
  if (!sb) return { ok: false, error: 'Chat offline.' };
  const check = validateMessage(body);
  if (!check.ok) return { ok: false, error: check.error };
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, error: 'Liga o Discord para falar.' };
  const m = user.user_metadata || {};
  const handle = String(m.full_name || m.name || m.preferred_username || 'Discord').slice(0, 32);
  const avatar = (m.avatar_url as string) || null;
  const { error } = await sb.from('messages').insert({ user_id: user.id, handle, avatar, body: check.value });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
