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
  if (!user) return { ok: false, error: 'Liga o Discord para resgatar.' };
  const { data, error } = await supabase.rpc('redeem_code', { p_code: code });
  if (error) {
    const m = error.message || '';
    if (m.includes('invalid_code')) return { ok: false, error: 'Código inválido.' };
    if (m.includes('code_used_up')) return { ok: false, error: 'Código esgotado.' };
    if (m.includes('auth_required')) return { ok: false, error: 'Liga o Discord.' };
    return { ok: false, error: 'Erro ao resgatar.' };
  }
  return { ok: true, skinId: data as string };
}

// Super-admin: mint a new code for a skin.
export async function createCode(code: string, skinId: string, maxUses?: number): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Offline.' };
  const norm = code.toUpperCase().replace(/\s/g, '');
  if (norm.length < 3) return { ok: false, error: 'Código demasiado curto.' };
  const { error } = await supabase.from('codes').insert({ code: norm, skin_id: skinId, max_uses: maxUses ?? null });
  if (error) return { ok: false, error: error.code === '23505' ? 'Esse código já existe.' : error.message };
  return { ok: true };
}
