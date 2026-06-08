-- OUROO / SUAV — unified multi-game leaderboard
-- Applied automatically by the Supabase GitHub integration (or `supabase db push`).

-- Players: stable identity. device_token = anonymous device id now; discord_id filled in later.
create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  handle text not null,
  device_token text unique,
  discord_id text unique,
  created_at timestamptz default now()
);

-- Scores: one row per submitted run. Unified across games via game_id.
create table if not exists scores (
  id bigint generated always as identity primary key,
  game_id text not null default 'ouroo',
  player_id uuid references players(id) on delete cascade,
  handle text not null,
  score integer not null check (score >= 0 and score <= 100000000),
  hidden boolean not null default false,   -- moderation kill-switch (never hard-delete)
  created_at timestamptz default now()
);

create index if not exists scores_game_score_idx on scores (game_id, score desc) where hidden = false;
create index if not exists scores_game_created_idx on scores (game_id, created_at desc);

-- Best score per player per game → the leaderboard the UI reads.
create or replace view leaderboard as
select distinct on (game_id, player_id)
  game_id, player_id, handle, score, created_at
from scores
where hidden = false
order by game_id, player_id, score desc;

-- Row-Level Security: read open, insert open, NO update/delete from the browser anon key.
alter table players enable row level security;
alter table scores  enable row level security;

create policy "read players"   on players for select using (true);
create policy "insert players" on players for insert with check (true);
create policy "read scores"    on scores  for select using (true);
create policy "insert scores"  on scores  for insert with check (true);
