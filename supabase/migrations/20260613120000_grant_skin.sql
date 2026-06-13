-- ===== grant_skin: let admin reward markers unlock a skin on the player's account =====
-- Run once in the Supabase SQL editor. Inserts into `unlocks` for the calling user (security definer,
-- like redeem_code). Note: callable by any signed-in user — consistent with the game's client-trust
-- model (the wallet is local-first too); tighten later if abuse becomes a concern.

create or replace function public.grant_skin(p_skin text) returns void
  language sql security definer as $$
  insert into public.unlocks (user_id, skin_id) values (auth.uid(), p_skin) on conflict do nothing;
$$;
grant execute on function public.grant_skin(text) to authenticated;
