-- Step 1 of 3: change the posts table so a post can have a photo.
-- Run this ONCE. It is a single statement, and it is all-or-nothing.
-- Your existing posts are not touched.
alter table public.posts
  add column image_path text,
  alter column content set default '',
  drop constraint posts_content_check,
  add constraint posts_content_check check (
    char_length(content) <= 280
    and (char_length(btrim(content)) >= 1 or image_path is not null)
  ),
  add constraint posts_image_path_check check (
    image_path is null
    or image_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|png|gif|webp)$'
  );
