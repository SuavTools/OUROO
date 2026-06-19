-- OUROO DISCOVERABLE ROOMS — a room can be flagged as discoverable. Discoverable rooms are hidden
-- from the community browser until a player has physically entered the room (via portal, code, or
-- direct link). Once visited, the room appears in the player's "Discovered Rooms" section.
-- Safe to re-run.

alter table public.rooms add column if not exists discoverable boolean not null default false;

-- Tracks which players have entered which discoverable rooms (first-visit keyed by owner_id + slug).
create table if not exists public.room_visits (
  owner_id   text        not null,               -- player owner id (discord:<id> or device token)
  room_slug  text        not null,               -- slug of the visited room
  visited_at timestamptz not null default now(),
  primary key (owner_id, room_slug)
);

alter table public.room_visits enable row level security;

drop policy if exists "room_visits read"   on public.room_visits;
drop policy if exists "room_visits insert" on public.room_visits;
drop policy if exists "room_visits upsert" on public.room_visits;
create policy "room_visits read"   on public.room_visits for select using (true);
create policy "room_visits insert" on public.room_visits for insert with check (true);
create policy "room_visits upsert" on public.room_visits for update using (true) with check (true);
