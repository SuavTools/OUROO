-- ===== OUROO wallet: soft currency (Cristais) + owned cosmetics =====
-- Mirrors the device-local wallet so a player keeps their balance / bought skins / custom icons
-- across devices and cleared storage. The app is localStorage-first; this is a best-effort backup
-- (everything degrades gracefully if this table is absent). Keyed by device token (anon device id
-- or `discord:<id>` for logged-in players), matching the room_items posture.
--
-- Run once in the Supabase SQL editor. Safe to re-run.

create table if not exists public.wallets (
  device_token text primary key,           -- anon device id, or discord:<userId>
  balance      int not null default 0,
  data         jsonb not null default '{}'::jsonb,   -- { skins:[], furni:[], icons:[] }
  updated_at   timestamptz not null default now()
);

alter table public.wallets enable row level security;

-- Permissive like room_items — RLS hardening (binding rows to auth.uid) is a later pass.
drop policy if exists "wallets read"   on public.wallets;
drop policy if exists "wallets upsert" on public.wallets;
drop policy if exists "wallets update" on public.wallets;
create policy "wallets read"   on public.wallets for select using (true);
create policy "wallets upsert" on public.wallets for insert with check (true);
create policy "wallets update" on public.wallets for update using (true) with check (true);
