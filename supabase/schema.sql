-- Full database setup for the wall, for a NEW Supabase project. Run it in the
-- Supabase dashboard:
--   SQL Editor  >  New query  >  paste everything below  >  Run
--
-- It is safe to run again: it will not change a table that already exists.
-- (Already set up before photos were added? Run add-photos.sql instead.)

-- ---------------------------------------------------------------------------
-- 1. The "posts" table: one row per message.
-- ---------------------------------------------------------------------------
create table if not exists public.posts (
  id          uuid        primary key default gen_random_uuid(),
  author_name text        not null check (char_length(author_name) between 1 and 60),
  content     text        not null default '',
  image_path  text,
  created_at  timestamptz not null default now(),

  -- A post needs some text, a photo, or both. Text is at most 280 characters.
  constraint posts_content_check check (
    char_length(content) <= 280
    and (char_length(btrim(content)) >= 1 or image_path is not null)
  ),

  -- A photo's name must look like "<random-id>.jpg" (or png, gif, webp). That
  -- way a post can only point at a photo in our own bucket, never at some
  -- other website.
  constraint posts_image_path_check check (
    image_path is null
    or image_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|png|gif|webp)$'
  )
);

-- Makes "newest 50 posts" fast.
create index if not exists posts_created_at_idx on public.posts (created_at desc);

-- ---------------------------------------------------------------------------
-- 2. Row Level Security: the database's own rules. Turned on, nobody can do
--    anything unless a policy below allows it.
-- ---------------------------------------------------------------------------
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

-- Anyone may add a post (there is no login). The rules above still apply.
drop policy if exists "Anyone can add posts" on public.posts;
create policy "Anyone can add posts"
  on public.posts for insert
  to anon, authenticated
  with check (true);

-- There is deliberately NO policy for update or delete, so visitors can never
-- edit or remove posts.

-- ---------------------------------------------------------------------------
-- 3. Realtime: lets the feed update live without a refresh.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'posts'
  ) then
    alter publication supabase_realtime add table public.posts;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Photos: a Storage "bucket" called wall-images.
--    - Public, so a photo can be shown to anyone who opens the wall.
--    - Images only (no SVG, which can carry scripts) and at most 5 MB each.
--      Supabase enforces both limits on its servers.
--    - Anyone may UPLOAD, but only under a file name like "<random-id>.jpg".
--      There is deliberately no rule to list, replace or delete photos, so
--      visitors cannot browse the bucket or remove anyone's photo.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'wall-images',
  'wall-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/gif', 'image/webp']
)
on conflict (id) do update
  set public = true,
      file_size_limit = 5242880,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

drop policy if exists "Anyone can upload wall images" on storage.objects;
create policy "Anyone can upload wall images"
  on storage.objects for insert
  to anon, authenticated
  with check (
    bucket_id = 'wall-images'
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|png|gif|webp)$'
  );
