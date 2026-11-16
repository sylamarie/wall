// What a post looks like, plus small helpers for the feed. No React in here.

// One row of the "posts" table in Supabase.
export type Post = {
  id: string;
  author_name: string;
  content: string;
  created_at: string; // a timestamp such as "2026-11-16T07:05:12.123+00:00"
};

export const MAX_LENGTH = 280; // longest message allowed
export const FEED_LIMIT = 50; // how many posts the feed shows

// Adds a post to the feed and keeps the newest first.
// If the post is already in the list we ignore it. That happens because a post
// can arrive twice: once from our own Share, and once from the live update.
export function addPost(list: Post[], post: Post): Post[] {
  if (list.some((p) => p.id === post.id)) return list;
  return [...list, post]
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    .slice(0, FEED_LIMIT);
}

// "now", "5m", "2h", "3d", or a date for anything older than a week.
export function formatAgo(createdAt: string, now: number): string {
  const seconds = Math.max(0, Math.floor((now - Date.parse(createdAt)) / 1000));
  if (seconds < 60) return "now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(createdAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
