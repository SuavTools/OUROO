import { supabase } from './supabase';

// Skins the logged-in user has unlocked via lore-codes.
export async function fetchUnlocks(): Promise<string[]> {
  if (!supabase) return [];
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase.from('unlocks').select('skin_id').eq('user_id', user.id);
  return (data ?? []).map(r => r.skin_id as string);
}

// Redeem a lore-code → unlocks a skin on the account (validated server-side; codes never exposed).
export async function redeemCode(code: string): Promise<{ ok: true; skinId: string } | { ok: false; error: string }> {
  if (!supabase) return { ok: false, error: 'Offline.' };
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Connect Discord to redeem.' };
  const { data, error } = await supabase.rpc('redeem_code', { p_code: code });
  if (error) {
    const m = error.message || '';
    if (m.includes('invalid_code')) return { ok: false, error: 'Invalid code.' };
    if (m.includes('code_used_up')) return { ok: false, error: 'Code used up.' };
    if (m.includes('auth_required')) return { ok: false, error: 'Connect Discord.' };
    return { ok: false, error: 'Error redeeming.' };
  }
  return { ok: true, skinId: data as string };
}

// Super-admin: mint a new code for a skin.
export async function createCode(code: string, skinId: string, maxUses?: number): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Offline.' };
  const norm = code.toUpperCase().replace(/\s/g, '');
  if (norm.length < 3) return { ok: false, error: 'Code too short.' };
  const { error } = await supabase.from('codes').insert({ code: norm, skin_id: skinId, max_uses: maxUses ?? null });
  if (error) return { ok: false, error: error.code === '23505' ? 'That code already exists.' : error.message };
  return { ok: true };
}

// Grant a skin to the current account (used by admin reward markers). Server-side via the grant_skin
// RPC (security definer). Needs that migration applied + the player signed in; degrades to false.
export async function grantSkin(skinId: string): Promise<boolean> {
  if (!supabase || !skinId) return false;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { error } = await supabase.rpc('grant_skin', { p_skin: skinId });
  return !error;
}

// The Town money jar — total real money spent on the game, all-time (filled by purchases later).
// Returns 0 if the `jar` table isn't there yet, so the counter shows $0 until it's wired up.
export async function getJarTotal(): Promise<number> {
  if (!supabase) return 0;
  const { data } = await supabase.from('jar').select('total').eq('id', 1).maybeSingle();
  return data ? Number(data.total) || 0 : 0;
}
