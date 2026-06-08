-- ===== Skin economy: lore-codes + unlocks =====

create table if not exists unlocks (
  user_id uuid not null,
  skin_id text not null,
  created_at timestamptz default now(),
  primary key (user_id, skin_id)
);
alter table unlocks enable row level security;
drop policy if exists "read own unlocks" on unlocks;
create policy "read own unlocks" on unlocks for select to authenticated using (user_id = auth.uid());
-- Inserts only happen through redeem_code() (security definer) — no client insert policy.

create table if not exists codes (
  code text primary key,
  skin_id text not null,
  max_uses int,            -- null = unlimited
  uses int not null default 0,
  created_at timestamptz default now()
);
alter table codes enable row level security;
-- Codes are secret: only supers read/write directly; redemption goes through the function.
drop policy if exists "super read codes" on codes;
create policy "super read codes" on codes for select to authenticated using (public.is_super_mod(auth.uid()));
drop policy if exists "super write codes" on codes;
create policy "super write codes" on codes for insert to authenticated with check (public.is_super_mod(auth.uid()));
drop policy if exists "super update codes" on codes;
create policy "super update codes" on codes for update to authenticated using (public.is_super_mod(auth.uid()));
drop policy if exists "super del codes" on codes;
create policy "super del codes" on codes for delete to authenticated using (public.is_super_mod(auth.uid()));

create or replace function public.redeem_code(p_code text)
returns text language plpgsql security definer as $$
declare v_skin text; v_max int; v_uses int; v_norm text;
begin
  if auth.uid() is null then raise exception 'auth_required'; end if;
  v_norm := upper(regexp_replace(coalesce(p_code, ''), '\s', '', 'g'));
  select skin_id, max_uses, uses into v_skin, v_max, v_uses from public.codes where code = v_norm;
  if v_skin is null then raise exception 'invalid_code'; end if;
  if v_max is not null and v_uses >= v_max then raise exception 'code_used_up'; end if;
  insert into public.unlocks (user_id, skin_id) values (auth.uid(), v_skin) on conflict do nothing;
  update public.codes set uses = uses + 1 where code = v_norm;
  return v_skin;
end; $$;
grant execute on function public.redeem_code(text) to authenticated;

-- Seed lore-codes from SUAV's phrases (edit/extend any time).
insert into codes (code, skin_id) values
  ('SUAVNANAVE', 'nave-suav'),
  ('ASSINO',     'chariot-rubra'),
  ('EMDOBRO',    'unicorn-cosmico'),
  ('NAPAZ',      'nave-cosmica')
on conflict (code) do nothing;
