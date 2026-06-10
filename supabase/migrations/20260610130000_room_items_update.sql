-- Allow updating room furniture in place (e.g. rotating a placed item) — room_items previously only
-- had read/insert/delete policies, so .update() was silently rejected and rotations didn't persist.
-- Permissive like the rest of room_items (app gates who can edit; tighten later).
-- Run once in the Supabase SQL editor. Safe to re-run.

drop policy if exists "room_items update" on public.room_items;
create policy "room_items update" on public.room_items for update using (true) with check (true);
