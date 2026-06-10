-- Add a short shareable invite code to rooms (for joining private/invite-only rooms by code).
-- Run once in the Supabase SQL editor. Safe to re-run.

alter table public.rooms add column if not exists code text;
create index if not exists rooms_code_idx on public.rooms (code);
