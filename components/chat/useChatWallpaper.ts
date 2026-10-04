// Which wallpaper a chat uses: its own choice, otherwise the "all chats"
// choice, otherwise the default. Saved on this device only.
import { useEffect, useSyncExternalStore } from "react";

import { DEFAULT_WALLPAPER, type Wallpaper } from "@/constants/wallpapers";
import { getPref, setPref } from "@/utils/prefsStorage";

const ALL_CHATS = "__all";

// conversationId (or ALL_CHATS) -> wallpaper (null = none chosen).
const cache = new Map<string, Wallpaper | null>();
const loading = new Set<string>();
const listeners = new Set<() => void>();

function storageKey(key: string) {
  return `cosquest.wallpaper.${key}`;
}

function emit() {
  listeners.forEach((listener) => listener());
}

function parse(value: string | null): Wallpaper | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value);

    if (parsed?.kind === "preset" && typeof parsed.id === "string") {
      return parsed;
    }

    if (parsed?.kind === "photo" && typeof parsed.uri === "string") {
      return parsed;
    }
  } catch {
    // Unreadable - ignore.
  }

  return null;
}

async function ensureLoaded(key: string) {
  if (cache.has(key) || loading.has(key)) {
    return;
  }

  loading.add(key);
  cache.set(key, parse(await getPref(storageKey(key))));
  loading.delete(key);
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

function currentFor(conversationId: string): Wallpaper {
  return (
    (conversationId ? cache.get(conversationId) : null) ||
    cache.get(ALL_CHATS) ||
    DEFAULT_WALLPAPER
  );
}

// useSyncExternalStore (not a plain read) so React - and the React
// Compiler, which remembers results inside screens - always shows the
// latest saved wallpaper. A plain read was remembered as "Default" and
// never updated once the saved wallpaper finished loading.
export function useChatWallpaper(conversationId: string): Wallpaper {
  useEffect(() => {
    ensureLoaded(ALL_CHATS);

    if (conversationId) {
      ensureLoaded(conversationId);
    }
  }, [conversationId]);

  return useSyncExternalStore(
    subscribe,
    () => currentFor(conversationId),
    () => currentFor(conversationId),
  );
}

// Save for one chat.
export async function setChatWallpaper(
  conversationId: string,
  wallpaper: Wallpaper,
) {
  cache.set(conversationId, wallpaper);
  emit();
  return setPref(storageKey(conversationId), JSON.stringify(wallpaper));
}

// Save for every chat (and let this chat follow it, too).
export async function setAllChatsWallpaper(
  wallpaper: Wallpaper,
  currentConversationId?: string,
) {
  cache.set(ALL_CHATS, wallpaper);

  if (currentConversationId) {
    cache.set(currentConversationId, null);
    await setPref(storageKey(currentConversationId), null);
  }

  emit();
  return setPref(storageKey(ALL_CHATS), JSON.stringify(wallpaper));
}
