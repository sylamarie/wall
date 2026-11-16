import { describe, expect, it } from "vitest";

import { FEED_LIMIT, addPost, formatAgo, type Post } from "./posts";

// A fixed "now" so the tests never depend on the real clock.
const NOW = Date.UTC(2026, 10, 16, 12, 0, 0);
const minutesAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();
const post = (id: string, createdAt: string): Post => ({
  id,
  author_name: "Test",
  content: id,
  created_at: createdAt,
});

describe("addPost", () => {
  it("keeps the newest post first", () => {
    let feed: Post[] = [];
    feed = addPost(feed, post("old", minutesAgo(60)));
    feed = addPost(feed, post("new", minutesAgo(1)));
    feed = addPost(feed, post("middle", minutesAgo(30)));
    expect(feed.map((p) => p.id)).toEqual(["new", "middle", "old"]);
  });

  it("ignores a post that is already in the feed", () => {
    // A post can arrive twice: once from our own Share, once from the live update.
    const feed = addPost([], post("a", minutesAgo(5)));
    expect(addPost(feed, post("a", minutesAgo(5)))).toBe(feed);
  });

  it("never shows more than the feed limit, dropping the oldest", () => {
    let feed: Post[] = [];
    for (let i = 0; i < FEED_LIMIT + 20; i++) {
      feed = addPost(feed, post(`p${i}`, minutesAgo(1000 - i)));
    }
    expect(feed).toHaveLength(FEED_LIMIT);
    expect(feed[0].id).toBe(`p${FEED_LIMIT + 19}`); // the newest is kept
    expect(feed.some((p) => p.id === "p0")).toBe(false); // the oldest is gone
  });

  it("does not change the list it was given", () => {
    const original = [post("a", minutesAgo(5))];
    addPost(original, post("b", minutesAgo(1)));
    expect(original).toHaveLength(1);
  });
});

describe("formatAgo", () => {
  const ago = (ms: number) => new Date(NOW - ms).toISOString();

  it('says "now" for the first minute', () => {
    expect(formatAgo(ago(0), NOW)).toBe("now");
    expect(formatAgo(ago(30_000), NOW)).toBe("now");
  });

  it('says "now" if the clock is slightly off and the time is in the future', () => {
    expect(formatAgo(ago(-90_000), NOW)).toBe("now");
  });

  it("counts minutes, hours and days", () => {
    expect(formatAgo(minutesAgo(5), NOW)).toBe("5m");
    expect(formatAgo(minutesAgo(59), NOW)).toBe("59m");
    expect(formatAgo(minutesAgo(60), NOW)).toBe("1h");
    expect(formatAgo(minutesAgo(180), NOW)).toBe("3h");
    expect(formatAgo(minutesAgo(60 * 24 * 2), NOW)).toBe("2d");
  });

  it("switches to a date after a week", () => {
    const label = formatAgo(minutesAgo(60 * 24 * 10), NOW);
    expect(label).toMatch(/[A-Za-z]/); // contains a month name
    expect(label).not.toMatch(/\d+d$/); // is not "10d"
  });
});
