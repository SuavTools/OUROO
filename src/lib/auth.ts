'use client';

import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { HANDLE_MAX } from './names';

export type DiscordUser = { id: string; name: string; avatar: string | null };

function toDiscord(u: User | null | undefined): DiscordUser | null {
  if (!u) return null;
  const m = u.user_metadata || {};
  const name = (m.full_name || m.name || m.preferred_username || m.user_name || 'Discord') as string;
  return { id: u.id, name, avatar: (m.avatar_url as string) || null };
}

export async function signInWithDiscord() {
  if (!supabase) return;
  await supabase.auth.signInWithOAuth({
    provider: 'discord',
    options: { redirectTo: window.location.origin },
  });
}

export async function signOut() {
  await supabase?.auth.signOut();
}

// React hook: current Discord user (null when logged out), live across login/logout.
export function useUser(): { user: DiscordUser | null; loading: boolean } {
  const [user, setUser] = useState<DiscordUser | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    supabase.auth.getSession().then(({ data }) => { setUser(toDiscord(data.session?.user)); setLoading(false); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => setUser(toDiscord(session?.user)));
    return () => sub.subscription.unsubscribe();
  }, []);
  return { user, loading };
}

// For score submission: the logged-in identity (stable across devices) if signed in, else null.
export async function getAuthIdentity(): Promise<{ device: string; handle: string } | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  const d = toDiscord(data.user);
  if (!d) return null;
  return { device: `discord:${d.id}`, handle: d.name.slice(0, HANDLE_MAX) };
}
