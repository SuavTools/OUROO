-- OUROO PRAÇA — persistent room furniture.
-- Run this once in the Supabase SQL editor (Dashboard → SQL → New query → paste → Run).
-- Safe to re-run.

create table if not exists public.room_items (
  id         uuid primary key default gen_random_uuid(),
  room       text not null,                 -- room slug (praca, disco, …)
  kind       text not null,                 -- furni kind (speaker, disco, plant, rug, sofa, stool, sign)
  x          real not null,
  y          real not null,
  created_by text,                          -- placer's device token (for own-item removal)
  created_at timestamptz not null default now()
);

create index if not exists room_items_room_idx on public.room_items (room);

alter table public.room_items enable row level security;

-- Public room: anyone may read and place. (Deletion is gated in the app to your own items or
-- moderators; for hard server-side enforcement, tighten this delete policy later.)
drop policy if exists "room_items read"   on public.room_items;
drop policy if exists "room_items insert" on public.room_items;
drop policy if exists "room_items update" on public.room_items;
drop policy if exists "room_items delete" on public.room_items;
create policy "room_items read"   on public.room_items for select using (true);
create policy "room_items insert" on public.room_items for insert with check (true);
create policy "room_items update" on public.room_items for update using (true) with check (true);   -- in-place edits (rotation)
create policy "room_items delete" on public.room_items for delete using (true);
