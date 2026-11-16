# Wall

A small 2008-style Facebook wall. Type a message, press **Share**, and it appears in a feed below. Messages are saved in a **Supabase** database, so they are still there after a refresh, and new messages show up live without reloading the page.

Built with **React 19**, **Next.js**, **Supabase**, **Tailwind CSS** and **shadcn/ui**.

**Live site:** https://wall-syla.vercel.app

## What it does

- Write a message (up to 280 characters, with a live "characters remaining" counter) and press **Share**, or press `Ctrl+Enter`.
- Every message is saved to a `posts` table in Supabase.
- The feed shows the newest 50 messages, newest first.
- The feed updates live: if someone else posts, it appears on your screen without a refresh (Supabase Realtime).
- Times show as "now", "5m", "2h", "3d", and keep updating on their own.
- No login is needed. Visitors can type a name in the "Posting as" box (it is remembered in their browser, and a blank name posts as "Guest"). The wall owner's profile is set in `lib/config.ts`.
- After posting, the cursor returns to the message box, and there is a short 3-second pause before the next post to slow down accidental double-posts.

## Run it yourself

You need [Node.js](https://nodejs.org) 20 or newer and a free [Supabase](https://supabase.com) account.

**1. Install the packages**

```bash
npm install
```

**2. Create the database.** In your Supabase project, open **SQL Editor**, click **New query**, paste the contents of [`supabase/schema.sql`](supabase/schema.sql) and press **Run**. It creates the `posts` table, the access rules, and turns on Realtime. It is safe to run twice.

**3. Add your keys.** Copy `.env.local.example` to `.env.local` and fill in two values from **Project Settings > API** in Supabase:

```
NEXT_PUBLIC_SUPABASE_URL=       # your Project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=  # the "anon" / "publishable" key
```

Use the public key only. Never use the `service_role` or "secret" key.

**4. Start it**

```bash
npm run dev
```

Then open the address it prints (usually http://localhost:3000).

Other commands:

```bash
npm run build   # make the production version
npm run lint    # check the code for problems
npm test        # run the automated tests (feed order, "5m / 2h" labels)
```

## How the data is protected

There is no login, so anyone can read and add posts. The database itself enforces the limits (Row Level Security in `supabase/schema.sql`):

- Anyone may **read** posts and **add** posts.
- Nobody can **edit or delete** posts, because no rule allows it.
- The database rejects empty messages, messages over 280 characters, and names over 60 characters, even if someone skips the website and talks to the database directly.

The `anon` key is meant to be public. It is safe in the browser because the rules above decide what it can do.

## How the code is organised

| File | What it does |
| --- | --- |
| `components/wall.tsx` | The whole screen: profile, message box, feed, loading, live updates. |
| `lib/supabase.ts` | Connects to Supabase using the two keys. |
| `lib/posts.ts` | The shape of a post, keeping the feed newest-first, and the "5m / 2h" labels. |
| `lib/config.ts` | The wall owner's name and information. Change these to make it yours. |
| `supabase/schema.sql` | The database setup. |
| `public/profile.jpg` | The profile photo. |

## Built with

- [Next.js](https://nextjs.org) (App Router) and [React 19](https://react.dev)
- [Supabase](https://supabase.com) (Postgres database and Realtime)
- [TypeScript](https://www.typescriptlang.org)
- [Tailwind CSS](https://tailwindcss.com) v4
- [shadcn/ui](https://ui.shadcn.com) (Button and Textarea)

I built this with the help of an AI coding assistant (Claude Code), which the challenge encourages.
