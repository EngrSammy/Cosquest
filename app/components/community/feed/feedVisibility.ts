// Which feed posts are on screen (audit B2): the feed list reports them
// (onViewableItemsChanged) and each video asks about its own post, so only
// that video re-renders when it scrolls in or out, and only visible videos
// play. A video outside the feed (a post's own page) has no row: it plays.
import { createContext, useContext, useSyncExternalStore } from "react";

let visible = new Set<string>();
const listeners = new Set<() => void>();

export function setVisiblePosts(ids: Iterable<string>) {
  const next = new Set(ids);
  if (next.size === visible.size && [...next].every((id) => visible.has(id))) return;
  visible = next;
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

/** The post id of the feed row this is drawn in (null outside the feed). */
export const FeedRowContext = createContext<string | null>(null);

/** True when this post is on screen, or when it isn't in the feed at all. */
export function usePostOnScreen(): boolean {
  const postId = useContext(FeedRowContext);
  return useSyncExternalStore(
    subscribe,
    () => postId === null || visible.has(postId),
    () => true,
  );
}

// One clock for every "5 mins ago" on screen (audit B2): it ticks every 30 s
// and only the time labels re-render, not the feed.
let now = Date.now();
const clockListeners = new Set<() => void>();
let clockTimer: ReturnType<typeof setInterval> | null = null;

function subscribeClock(l: () => void) {
  clockListeners.add(l);
  if (!clockTimer) {
    clockTimer = setInterval(() => {
      now = Date.now();
      clockListeners.forEach((fn) => fn());
    }, 30000);
  }
  return () => {
    clockListeners.delete(l);
    if (clockListeners.size === 0 && clockTimer) {
      clearInterval(clockTimer);
      clockTimer = null;
    }
  };
}

export function useFeedClock(): number {
  return useSyncExternalStore(subscribeClock, () => now, () => now);
}
