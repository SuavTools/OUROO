-- Chat rooms / channels (public only — no private rooms by design)
create table if not exists channels (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  kind text not null default 'chat',     -- 'chat' | 'radio'
  is_system boolean not null default false,
  created_by uuid,
  created_at timestamptz default now()
);
alter table channels enable row level security;
create policy "read channels"   on channels for select using (true);
-- Logged-in users can create non-system channels as themselves.
create policy "insert channels" on channels for insert to authenticated
  with check (auth.uid() = created_by and is_system = false);

-- Messages belong to a channel.
alter table messages add column if not exists channel_id uuid references channels(id) on delete cascade;
create index if not exists messages_channel_idx on messages (channel_id, created_at desc) where hidden = false;

-- Seed the system rooms.
insert into channels (slug, name, kind, is_system) values
  ('geral',  'Geral',      'chat',  true),
  ('ranking','Ranking',    'chat',  true),
  ('radio',  'Rádio SUAV', 'radio', true)
on conflict (slug) do nothing;

-- Move any pre-existing messages into #geral.
update messages set channel_id = (select id from channels where slug = 'geral') where channel_id is null;

-- Live updates for new channels too.
do $$ begin
  alter publication supabase_realtime add table channels;
exception when duplicate_object then null; end $$;
