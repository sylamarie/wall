-- Step 3 of 3: let visitors upload photos. Run this ONCE, after step 2.
-- Only under a random name like "<id>.jpg". There is deliberately no rule to
-- list, replace or delete photos, so visitors cannot browse or remove them.
create policy "Anyone can upload wall images"
  on storage.objects for insert
  to anon, authenticated
  with check (
    bucket_id = 'wall-images'
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|png|gif|webp)$'
  );
