-- OUROO PRAÇA — user-created personal rooms.
-- The hardcoded official rooms (praca/disco/…) stay in code; these are player-made rooms whose
-- furniture lives in room_items keyed by this slug. Run once in the Supabase SQL editor. Safe to re-run.

create table if not exists public.rooms (
  slug       text primary key,                 -- channel topic + room_items.room
  name       text not null,
  owner      text not null,                     -- owner id: discord:<id> if signed in, else device token
  accent     text not null default '#00cfff',
  floor      text not null default '#161628',
  public     boolean not null default true,     -- listed for everyone vs invite-only (join by slug)
  created_at timestamptz not null default now()
);

create index if not exists rooms_owner_idx on public.rooms (owner);

alter table public.rooms enable row level security;

-- Permissive like room_items (the app gates who can edit a room; tighten to owner later).
drop policy if exists "rooms read"   on public.rooms;
drop policy if exists "rooms insert" on public.rooms;
drop policy if exists "rooms update" on public.rooms;
drop policy if exists "rooms delete" on public.rooms;
create policy "rooms read"   on public.rooms for select using (true);
create policy "rooms insert" on public.rooms for insert with check (true);
create policy "rooms update" on public.rooms for update using (true) with check (true);
create policy "rooms delete" on public.rooms for delete using (true);
