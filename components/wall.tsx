"use client";

import Image from "next/image";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { OWNER } from "@/lib/config";
import {
  FEED_LIMIT,
  IMAGE_BUCKET,
  IMAGE_EXTENSIONS,
  MAX_LENGTH,
  addPost,
  checkImage,
  formatAgo,
  type Post,
} from "@/lib/posts";
import { publicImageUrl, supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

type Status = "loading" | "ready" | "error" | "unconfigured";

// Returns "the current time" and refreshes it every 30 seconds, so the
// "5m", "2h" labels on posts stay up to date without a page reload.
function subscribeToClock(onTick: () => void) {
  const id = setInterval(onTick, 30_000);
  return () => clearInterval(id);
}
const clockNow = () => Math.floor(Date.now() / 30_000) * 30_000;
function useNow() {
  return useSyncExternalStore(subscribeToClock, clockNow, () => 0);
}

// The visitor's name is remembered in their own browser (localStorage), so
// they don't have to type it again. If the browser blocks storage (for example
// in a private window) we fall back to remembering it until the page closes.
const NAME_KEY = "wall:name";
const MAX_NAME_LENGTH = 40;
const DEFAULT_NAME = "Guest";
let memoryName = "";
const nameListeners = new Set<() => void>();

function subscribeToName(onChange: () => void) {
  nameListeners.add(onChange);
  window.addEventListener("storage", onChange); // another tab changed it
  return () => {
    nameListeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}
function readName() {
  try {
    const stored = localStorage.getItem(NAME_KEY);
    if (stored !== null) return stored;
  } catch {
    // storage is blocked: use the in-memory copy below
  }
  return memoryName;
}
function writeName(value: string) {
  memoryName = value;
  try {
    localStorage.setItem(NAME_KEY, value);
  } catch {
    // storage is blocked: the in-memory copy is enough
  }
  nameListeners.forEach((listener) => listener());
}
function useStoredName() {
  const name = useSyncExternalStore(subscribeToName, readName, () => "");
  return [name, writeName] as const;
}

// A round avatar with the writer's initials, like the small profile pictures on
// the 2008 wall. The colour comes from the name, so the same person always gets
// the same colour.
function Avatar({ name }: { name: string }) {
  const firstLetter = (word: string) => Array.from(word)[0] ?? "";
  const words = name.trim().split(/\s+/).filter(Boolean);
  const initials = (
    firstLetter(words[0] ?? "?") +
    (words.length > 1 ? firstLetter(words[words.length - 1]) : "")
  ).toUpperCase();

  let hue = 0;
  for (const ch of name) hue = (hue * 31 + (ch.codePointAt(0) ?? 0)) % 360;

  return (
    <span
      aria-hidden
      className="flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white select-none"
      style={{ background: `oklch(0.55 0.13 ${hue})` }}
    >
      {initials}
    </span>
  );
}

// A photo inside a post. A plain <img> keeps this simple: the photos come from
// Supabase Storage, and Next.js's image optimiser would need extra setup for
// that address. "lazy" means photos far down the page load only when scrolled to.
function PostPhoto({ path, author }: { path: string; author: string }) {
  const src = publicImageUrl(path);
  if (!src) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={`Photo shared by ${author}`}
      loading="lazy"
      decoding="async"
      className="mt-2 max-h-96 w-auto max-w-full rounded-md border"
    />
  );
}

export function Wall() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [status, setStatus] = useState<Status>(
    supabase ? "loading" : "unconfigured",
  );
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [cooling, setCooling] = useState(false); // short pause after each post
  const [name, setName] = useStoredName();
  const [photo, setPhoto] = useState<File | null>(null); // the photo chosen to share
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const coolTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const now = useNow();

  // A temporary address so we can show a preview of the chosen photo.
  const previewUrl = useMemo(
    () => (photo ? URL.createObjectURL(photo) : null),
    [photo],
  );
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl); // free the memory
    };
  }, [previewUrl]);

  // If the page goes away, stop the "pause after posting" timer.
  useEffect(() => {
    return () => {
      if (coolTimer.current) clearTimeout(coolTimer.current);
    };
  }, []);

  function clearPhoto() {
    setPhoto(null);
    if (photoInputRef.current) photoInputRef.current.value = ""; // allow re-picking the same file
  }

  function onPhotoChosen(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const problem = checkImage(file);
    if (problem) {
      setShareError(problem);
      clearPhoto();
      return;
    }
    setShareError(null);
    setPhoto(file);
  }

  // On load: fetch the newest posts, then listen for new ones arriving live.
  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    let cancelled = false;

    async function load() {
      const { data, error } = await client
        .from("posts")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(FEED_LIMIT);
      if (cancelled) return;
      if (error) {
        console.error("Could not load posts:", error.message);
        setStatus("error");
        return;
      }
      // Merge with anything that already arrived live while we were loading.
      setPosts((current) =>
        (data as Post[]).reduce((list, post) => addPost(list, post), current),
      );
      setStatus("ready");
    }
    load();

    const channel = client
      .channel("wall-posts")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "posts" },
        (payload) => setPosts((current) => addPost(current, payload.new as Post)),
      )
      .subscribe();

    // Tidy up if the page goes away.
    return () => {
      cancelled = true;
      client.removeChannel(channel);
    };
  }, []);

  async function share(event?: FormEvent) {
    event?.preventDefault();
    const content = text.trim();
    // A post needs some text, a photo, or both.
    if (
      !supabase ||
      sending ||
      cooling ||
      (content.length === 0 && !photo) ||
      content.length > MAX_LENGTH
    ) {
      return;
    }
    // A blank name posts as "Guest".
    const author = name.trim().slice(0, MAX_NAME_LENGTH) || DEFAULT_NAME;

    setSending(true);
    setShareError(null);

    // Step 1: if there is a photo, upload it first. It gets a random file name,
    // so nobody can guess it and it can never overwrite someone else's photo.
    let imagePath: string | undefined;
    if (photo) {
      const problem = checkImage(photo);
      if (problem) {
        setShareError(problem);
        setSending(false);
        return;
      }
      imagePath = `${crypto.randomUUID()}.${IMAGE_EXTENSIONS[photo.type]}`;
      const { error: uploadError } = await supabase.storage
        .from(IMAGE_BUCKET)
        .upload(imagePath, photo, {
          contentType: photo.type,
          cacheControl: "31536000", // photos never change, so browsers may keep them
          upsert: false,
        });
      if (uploadError) {
        console.error("Could not upload photo:", uploadError.message);
        setShareError("Sorry, your photo could not be uploaded. Please try again.");
        setSending(false);
        return;
      }
    }

    // Step 2: save the post. "image_path" is only sent when there is a photo, so
    // posts without photos keep working even on an older database.
    const { data, error } = await supabase
      .from("posts")
      .insert({
        author_name: author,
        content,
        ...(imagePath ? { image_path: imagePath } : {}),
      })
      .select()
      .single();

    if (error) {
      console.error("Could not share post:", error.message);
      setShareError("Sorry, your message could not be shared. Please try again.");
    } else {
      setPosts((current) => addPost(current, data as Post));
      setText("");
      clearPhoto();
      textareaRef.current?.focus(); // ready to type the next one

      // A short pause (3 seconds) before the next post. It slows down
      // accidental double-posts. It is not a security feature: someone
      // determined could skip the website and call the database directly.
      setCooling(true);
      coolTimer.current = setTimeout(() => setCooling(false), 3000);
    }
    setSending(false);
  }

  // Ctrl+Enter (or Cmd+Enter on a Mac) also shares, like many social sites.
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      share();
    }
  }

  const remaining = MAX_LENGTH - text.length;
  const canShare =
    (text.trim().length > 0 || photo !== null) &&
    !sending &&
    !cooling &&
    status !== "unconfigured";

  return (
    <div className="flex min-h-svh flex-col">
      <header className="bg-primary text-primary-foreground shadow-sm">
        <div className="mx-auto flex h-12 max-w-4xl items-center px-4">
          <span className="text-xl font-bold tracking-tight">wall</span>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-4xl flex-1 content-start gap-6 px-4 py-6 md:grid-cols-[14rem_1fr]">
        {/* Left: profile photo, name and information */}
        <aside>
          <div className="flex items-start gap-4 md:block">
            <Image
              src="/profile.jpg"
              alt={`Photo of ${OWNER.name}`}
              width={720}
              height={900}
              priority
              sizes="(min-width: 768px) 224px, 112px"
              className="h-auto w-28 shrink-0 rounded-sm border bg-white p-0.5 shadow-sm md:w-full"
            />
            <div className="md:mt-3">
              <h1 className="text-xl leading-tight font-bold">{OWNER.name}</h1>
              <p className="text-sm text-muted-foreground">wall</p>
            </div>
          </div>

          <div className="mt-5 overflow-hidden rounded-md border bg-card text-sm shadow-sm">
            <div className="border-b bg-muted px-3 py-1.5 font-semibold">
              Information
            </div>
            <dl className="space-y-3 px-3 py-3">
              {OWNER.info.map(({ label, value }) => (
                <div key={label}>
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </aside>

        {/* Right: the message box and the feed */}
        <section aria-labelledby="wall-heading" className="min-w-0">
          <h2 id="wall-heading" className="mb-2 text-lg font-semibold">
            Wall
          </h2>

          {status === "unconfigured" && (
            <p
              role="status"
              className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
            >
              This wall isn&apos;t connected to Supabase yet. Copy{" "}
              <code>.env.local.example</code> to <code>.env.local</code>, add your
              two Supabase values, then restart <code>npm run dev</code>.
            </p>
          )}

          <form onSubmit={share}>
            <div className="mb-2 flex items-center gap-2">
              <label
                htmlFor="author"
                className="text-sm whitespace-nowrap text-muted-foreground"
              >
                Posting as
              </label>
              <Input
                id="author"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={MAX_NAME_LENGTH}
                placeholder="Your name (optional)"
                autoComplete="nickname"
                className="h-8 max-w-56 bg-card"
              />
            </div>
            <label htmlFor="message" className="sr-only">
              Write a message
            </label>
            <Textarea
              id="message"
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKeyDown}
              maxLength={MAX_LENGTH}
              rows={3}
              placeholder="What's on your mind?"
              // Light-blue tint fading to white with a dashed border, like the mockup.
              className="resize-none border-dashed border-primary/40 bg-linear-to-r from-primary/10 to-card"
            />

            {/* Optional photo: pick one, see a preview, and remove it if you change your mind. */}
            <div className="mt-2">
              <input
                id="photo"
                ref={photoInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                onChange={onPhotoChosen}
                className="peer sr-only"
              />
              {photo && previewUrl ? (
                <div className="relative inline-block">
                  {/* eslint-disable-next-line @next/next/no-img-element -- just a local preview */}
                  <img
                    src={previewUrl}
                    alt="Preview of the photo you chose"
                    className="max-h-40 w-auto rounded-md border"
                  />
                  <button
                    type="button"
                    onClick={clearPhoto}
                    aria-label="Remove photo"
                    className="absolute -top-2 -right-2 flex size-6 items-center justify-center rounded-full bg-foreground text-sm leading-none text-background shadow"
                  >
                    ×
                  </button>
                </div>
              ) : (
                <label
                  htmlFor="photo"
                  className="flex cursor-pointer flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed border-primary/40 bg-card/60 px-3 py-3 text-center text-sm hover:bg-card peer-focus-visible:ring-2 peer-focus-visible:ring-ring"
                >
                  <span className="font-medium">
                    Click to add photo{" "}
                    <span className="font-normal text-muted-foreground">(optional)</span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    JPG, PNG, GIF or WebP, up to 5 MB
                  </span>
                </label>
              )}
            </div>

            <div className="mt-1.5 flex items-start justify-between gap-3">
              <p
                className={cn(
                  "text-sm",
                  cooling
                    ? "font-medium text-green-700"
                    : remaining <= 20
                      ? "font-medium text-destructive"
                      : "text-muted-foreground",
                )}
              >
                {cooling ? "Shared! ✓" : `${remaining} characters remaining`}
              </p>
              <Button type="submit" disabled={!canShare}>
                {sending ? "Sharing…" : "Share"}
              </Button>
            </div>
            {shareError && (
              <p role="alert" className="mt-2 text-sm text-destructive">
                {shareError}
              </p>
            )}
          </form>

          {status === "loading" && (
            <p className="mt-6 text-sm text-muted-foreground">Loading posts…</p>
          )}
          {status === "error" && (
            <p role="alert" className="mt-6 text-sm text-destructive">
              Sorry, the wall could not be loaded. Please refresh the page.
            </p>
          )}
          {status === "ready" && posts.length === 0 && (
            <p className="mt-6 text-sm text-muted-foreground">
              Nothing here yet. Be the first to share something!
            </p>
          )}

          <ul className="mt-6 divide-y" aria-live="polite">
            {posts.map((post) => (
              // "post-in" fades each post in (see globals.css).
              <li key={post.id} className="post-in flex gap-3 py-3">
                <Avatar name={post.author_name} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-semibold">{post.author_name}</span>
                    <time
                      dateTime={post.created_at}
                      title={new Date(post.created_at).toLocaleString()}
                      className="shrink-0 text-xs text-muted-foreground"
                    >
                      {formatAgo(post.created_at, now)}
                    </time>
                  </div>
                  {post.content && (
                    <p className="mt-0.5 break-words whitespace-pre-wrap">
                      {post.content}
                    </p>
                  )}
                  {post.image_path && (
                    <PostPhoto path={post.image_path} author={post.author_name} />
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}
