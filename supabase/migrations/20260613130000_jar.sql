-- ===== Money jar: total real money spent on the game, all-time (Town counter) =====
-- Run once in the Supabase SQL editor. A single-row counter. Reads are public (the Town shows it);
-- writes will come from the purchase/webhook flow later (service role), so no client write policy.

create table if not exists public.jar (
  id    int primary key default 1,
  total numeric not null default 0    -- dollars (or cents — decide when purchases are wired)
);
insert into public.jar (id, total) values (1, 0) on conflict (id) do nothing;

alter table public.jar enable row level security;
drop policy if exists "read jar" on public.jar;
create policy "read jar" on public.jar for select using (true);
