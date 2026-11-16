-- Step 2 of 3: create the photo bucket. Run this ONCE, after step 1.
-- Public (so photos can be shown), images only (no SVG), at most 5 MB each.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'wall-images',
  'wall-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/gif', 'image/webp']
);
