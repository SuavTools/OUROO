-- ===== OUROO DUEL — 1v1 wagered Climb Race =====
-- The durable referee + escrow record for a head-to-head duel launched inside the Praça. Two players
-- ante the SAME stake (crystals + items); both run an identical seeded climb tower; the higher climber
-- takes the pot. The row is the shared source of truth for "what was staked / who won" so neither
-- client can rewrite the outcome alone — wallet debits/credits still happen client-side (localStorage
-- is authoritative on each device), but they're gated on this row's agreed state.
--
-- Trust tier (v1): Discord-gated + light escrow. Tokens are `discord:<id>` (verified identity); results
-- are self-reported and settlement is computed identically on both clients, with this row as the audit
-- trail. Cheat-resistant against casual players, not determined ones (deferred: server-validated result
-- via a service-role route + deterministic checksum).
--
-- Run once in the Supabase SQL editor (Dashboard → SQL → New query → paste → Run). Safe to re-run.

create table if not exists public.duels (
  id            uuid primary key default gen_random_uuid(),
  room          text not null,                          -- room slug the challenge happened in
  seed          bigint not null,                        -- deterministic tower seed (both clients build the same course)
  host_token    text not null,                          -- challenger identity (discord:<id>)
  host_handle   text not null,
  guest_token   text not null,                          -- challenged identity (discord:<id>)
  guest_handle  text not null,
  stake_crystals int not null default 0,                -- Cristais each side antes (symmetric)
  stake_items   jsonb not null default '{}'::jsonb,     -- { furniKind: count } each side antes (symmetric)
  state         text not null default 'pending',        -- pending | locked | playing | settled | void
  host_locked   boolean not null default false,         -- host has escrowed their ante
  guest_locked  boolean not null default false,         -- guest has escrowed their ante
  host_result   int,                                    -- host's final height (null until reported)
  guest_result  int,                                    -- guest's final height
  winner        text,                                   -- 'host' | 'guest' | 'draw' (null until settled)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists duels_room_idx    on public.duels (room);
create index if not exists duels_host_idx     on public.duels (host_token);
create index if not exists duels_guest_idx    on public.duels (guest_token);
create index if not exists duels_created_idx  on public.duels (created_at desc);

alter table public.duels enable row level security;

-- Permissive like room_items / wallets — the app gates who may act on a row; hard server-side
-- enforcement (binding rows to auth.uid, validating results) is a later pass.
drop policy if exists "duels read"   on public.duels;
drop policy if exists "duels insert" on public.duels;
drop policy if exists "duels update" on public.duels;
create policy "duels read"   on public.duels for select using (true);
create policy "duels insert" on public.duels for insert with check (true);
create policy "duels update" on public.duels for update using (true) with check (true);

-- Live coordination uses Supabase broadcast channels (duel:<id>), same posture as the room channel —
-- no postgres_changes subscription required. The row is polled/refetched at the settlement barrier.
