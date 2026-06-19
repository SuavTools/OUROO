-- OUROO COMBAT — a room can be flagged as a PvP zone. When `combat_enabled` is true, players in the
-- room can attack + loot each other (HP / weapons / shields, handled client-side via @/lib/combat).
-- Mod-gated in the UI; off by default so existing rooms stay safe. Safe to re-run.

alter table public.rooms add column if not exists combat_enabled boolean not null default false;
