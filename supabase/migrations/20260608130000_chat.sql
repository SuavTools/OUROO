-- Community chat
create table if not exists messages (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  handle text not null,
  avatar text,
  body text not null check (char_length(body) between 1 and 300),
  hidden boolean not null default false,   -- moderation kill-switch
  created_at timestamptz default now()
);
create index if not exists messages_created_idx on messages (created_at desc) where hidden = false;

alter table messages enable row level security;
-- Anyone can read; only logged-in (Discord) users can post, and only as themselves.
create policy "read messages"   on messages for select using (true);
create policy "insert messages" on messages for insert to authenticated with check (auth.uid() = user_id);

-- Enable Realtime for live messages (idempotent).
do $$ begin
  alter publication supabase_realtime add table messages;
exception when duplicate_object then null; end $$;
