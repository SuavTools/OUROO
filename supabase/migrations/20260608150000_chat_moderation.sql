-- ===== Moderation: roles, bans, delete rules, room caps =====

-- Tables first (the helper functions below reference them, and SQL functions
-- are validated at creation time).
create table if not exists moderators (
  user_id uuid primary key,
  is_super boolean not null default false,
  created_at timestamptz default now()
);
create table if not exists bans (
  user_id uuid primary key,
  reason text,
  by uuid,
  created_at timestamptz default now()
);

-- security-definer helpers (read role/ban tables without RLS recursion)
create or replace function public.is_moderator(uid uuid) returns boolean language sql stable security definer as $$
  select exists(select 1 from public.moderators where user_id = uid);
$$;
create or replace function public.is_super_mod(uid uuid) returns boolean language sql stable security definer as $$
  select exists(select 1 from public.moderators where user_id = uid and is_super);
$$;
create or replace function public.is_banned(uid uuid) returns boolean language sql stable security definer as $$
  select exists(select 1 from public.bans where user_id = uid);
$$;

alter table moderators enable row level security;
drop policy if exists "read moderators" on moderators;
create policy "read moderators" on moderators for select using (true);
drop policy if exists "super add mods" on moderators;
create policy "super add mods" on moderators for insert to authenticated with check (public.is_super_mod(auth.uid()));
drop policy if exists "super del mods" on moderators;
create policy "super del mods" on moderators for delete to authenticated using (public.is_super_mod(auth.uid()));

-- Seed SUAV as super-admin.
insert into moderators (user_id, is_super) values ('15aaa1b1-7dd6-4e4e-801a-0e4a0fcf0293', true)
on conflict (user_id) do update set is_super = true;

-- Bans (table created above).
alter table bans enable row level security;
drop policy if exists "read bans" on bans;
create policy "read bans" on bans for select using (true);
drop policy if exists "mods ban" on bans;
create policy "mods ban" on bans for insert to authenticated with check (public.is_moderator(auth.uid()));
drop policy if exists "mods unban" on bans;
create policy "mods unban" on bans for delete to authenticated using (public.is_moderator(auth.uid()));

-- Posting: must be yourself AND not banned.
drop policy if exists "insert messages" on messages;
create policy "insert messages" on messages for insert to authenticated
  with check (auth.uid() = user_id and not public.is_banned(auth.uid()));

-- Deleting a message: your own OR a moderator.
drop policy if exists "delete own messages" on messages;
drop policy if exists "delete messages" on messages;
create policy "delete messages" on messages for delete to authenticated
  using (auth.uid() = user_id or public.is_moderator(auth.uid()));

-- Deleting a room: your own (non-system) OR a moderator.
drop policy if exists "delete own channels" on channels;
drop policy if exists "delete channels" on channels;
create policy "delete channels" on channels for delete to authenticated
  using ((auth.uid() = created_by and is_system = false) or public.is_moderator(auth.uid()));

-- Anti-spam: cap non-system rooms per user (mods exempt).
create or replace function public.enforce_channel_limit() returns trigger language plpgsql as $$
begin
  if not new.is_system and not public.is_moderator(new.created_by) and (
    select count(*) from public.channels where created_by = new.created_by and not is_system
  ) >= 3 then
    raise exception 'channel_limit_reached';
  end if;
  return new;
end; $$;
drop trigger if exists channel_limit on public.channels;
create trigger channel_limit before insert on public.channels
  for each row execute function public.enforce_channel_limit();
