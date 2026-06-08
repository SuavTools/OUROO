-- Daily leaderboard: best score per player among today's runs (Lisbon time), resets each day.
create or replace view leaderboard_today as
select distinct on (game_id, player_id)
  game_id, player_id, handle, score, created_at
from scores
where hidden = false
  and created_at >= date_trunc('day', now() at time zone 'Europe/Lisbon') at time zone 'Europe/Lisbon'
order by game_id, player_id, score desc;

grant select on leaderboard_today to anon, authenticated;
