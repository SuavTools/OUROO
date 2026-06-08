import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Single browser/server client using the public (publishable/anon) key. RLS is what actually
// guards the data — this key is meant to ship to the browser. We accept either env name so it
// works whether Supabase/Vercel injected PUBLISHABLE_KEY (new) or ANON_KEY (legacy).
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// `null` when env isn't configured yet — callers degrade gracefully instead of crashing the build.
// In the browser it's auth-aware (persists the Discord session, exchanges the OAuth code via PKCE);
// on the server (API routes) it stays stateless.
const isBrowser = typeof window !== 'undefined';
export const supabase: SupabaseClient | null =
  url && key
    ? createClient(url, key, {
        auth: {
          persistSession: isBrowser,
          autoRefreshToken: isBrowser,
          detectSessionInUrl: isBrowser,
          // Implicit flow: tokens come back in the URL fragment, so there's no PKCE code-verifier
          // to lose across the mobile OAuth redirect (which was leaving sessions un-detected).
          flowType: 'implicit',
        },
      })
    : null;

export const supabaseReady = Boolean(url && key);
