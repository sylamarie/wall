-- Database setup for the wall. Run this ONCE in the Supabase dashboard:
--   SQL Editor  >  New query  >  paste everything below  >  Run
-- It is safe to run again: it won't duplicate anything.

-- 1. The "posts" table: one row per message.
create table if not exists public.posts (
  id          uuid        primary key default gen_random_uuid(),
  author_name text        not null check (char_length(author_name) between 1 and 60),
  content     text        not null check (char_length(btrim(content)) >= 1 and char_length(content) <= 280),
  created_at  timestamptz not null default now()
);

-- 2. Makes "newest 50 posts" fast.
create index if not exists posts_created_at_idx on public.posts (created_at desc);

-- 3. Row Level Security: the database's own rules. Turned on, nobody can do
--    anything unless a policy below allows it.
alter table public.posts enable row level security;

-- Permissions: the website talks to the database as the "anon" role. Give it
-- exactly two abilities on this table, reading and adding, and nothing else.
-- (This also makes things work when "Automatically expose new tables" is
-- switched off, which is Supabase's recommended setting.)
grant usage on schema public to anon, authenticated;
grant select, insert on public.posts to anon, authenticated;

-- Anyone may read the wall.
drop policy if exists "Anyone can read posts" on public.posts;
create policy "Anyone can read posts"
  on public.posts for select
  to anon, authenticated
  using (true);

-- Anyone may add a post (there is no login). The length rules above still apply.
drop policy if exists "Anyone can add posts" on public.posts;
create policy "Anyone can add posts"
  on public.posts for insert
  to anon, authenticated
  with check (true);

-- There is deliberately NO policy for update or delete, so visitors can never
-- edit or remove posts.

-- 4. Realtime: lets the feed update live without a refresh.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'posts'
  ) then
    alter publication supabase_realtime add table public.posts;
  end if;
end $$;
