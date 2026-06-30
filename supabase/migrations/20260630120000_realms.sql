-- OUROO R3D — shared 3D realms (the first-person worlds built in the Realm Forge designer).
-- Realms used to live ONLY in the builder's browser localStorage, so a portal pointing at
-- `r3d:<id>` worked for the author but showed "realm has collapsed" for everyone else. This table
-- makes a saved realm shared: the designer upserts it here, and any player who walks the portal
-- fetches it by id. The whole Level3D (floors, heights, npcs, palette…) lives in `data` as jsonb;
-- `name`/`author` are duplicated out for listing the library. Built-in demo realms stay in code.
--
-- Permissive RLS like room_items / rooms / wallets — the app gates who edits; tighter ownership
-- (binding rows to auth.uid) is a later pass. Run once in the Supabase SQL editor. Safe to re-run.

create table if not exists public.realms (
  id         text primary key,                    -- realm id (matches the portal's r3d:<id>)
  name       text not null,
  data       jsonb not null,                       -- the full Level3D payload
  author     text,                                 -- creator id: discord:<id> if signed in, else device token
  updated_at timestamptz not null default now()
);

create index if not exists realms_updated_idx on public.realms (updated_at desc);

alter table public.realms enable row level security;

drop policy if exists "realms read"   on public.realms;
drop policy if exists "realms insert" on public.realms;
drop policy if exists "realms update" on public.realms;
drop policy if exists "realms delete" on public.realms;
create policy "realms read"   on public.realms for select using (true);
create policy "realms insert" on public.realms for insert with check (true);
create policy "realms update" on public.realms for update using (true) with check (true);
create policy "realms delete" on public.realms for delete using (true);
