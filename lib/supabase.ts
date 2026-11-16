import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { IMAGE_BUCKET } from "./posts";

// These two values come from the .env.local file (and from Vercel's
// "Environment Variables" once the site is live). Both are meant to be public:
// the "anon / publishable" key is safe in the browser because the database's
// own rules (see supabase/schema.sql) decide what visitors may do.
// NEVER put the "service_role" / "secret" key here.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
// Supabase's dashboard calls this key "anon" in older projects and
// "publishable" in newer ones, so we accept either variable name.
const key =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

// If the keys are missing, this is null and the page shows a helpful message
// instead of crashing.
export const supabase: SupabaseClient | null =
  url && key ? createClient(url, key) : null;

// The public web address of a photo, given its file name in storage.
export function publicImageUrl(path: string): string | null {
  if (!supabase) return null;
  return supabase.storage.from(IMAGE_BUCKET).getPublicUrl(path).data.publicUrl;
}
