import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Single browser/server client using the public (publishable/anon) key. RLS is what actually
// guards the data — this key is meant to ship to the browser. We accept either env name so it
// works whether Supabase/Vercel injected PUBLISHABLE_KEY (new) or ANON_KEY (legacy).
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// `null` when env isn't configured yet — callers degrade gracefully instead of crashing the build.
export const supabase: SupabaseClient | null =
  url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;

export const supabaseReady = Boolean(url && key);
