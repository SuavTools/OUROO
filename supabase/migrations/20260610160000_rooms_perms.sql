-- OUROO PRAÇA — per-room build permissions.
-- `build_all`: anyone in the room can drop/take furniture (open building).
-- `rights`:    list of handles granted build (drop + take) rights by the owner.
-- The official rooms stay code-locked; this only affects player-made rooms. Safe to re-run.

alter table public.rooms add column if not exists build_all boolean not null default false;
alter table public.rooms add column if not exists rights    jsonb   not null default '[]'::jsonb;
