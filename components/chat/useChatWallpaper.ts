// Which wallpaper a chat uses: its own choice, otherwise the "all chats"
// choice, otherwise the default. Saved on this device only.
import { useEffect, useReducer } from "react";

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

export function useChatWallpaper(conversationId: string): Wallpaper {
  const [, rerender] = useReducer((count: number) => count + 1, 0);

  useEffect(() => {
    listeners.add(rerender);

    ensureLoaded(ALL_CHATS);

    if (conversationId) {
      ensureLoaded(conversationId);
    }

    return () => {
      listeners.delete(rerender);
    };
  }, [conversationId]);

  return (
    (conversationId ? cache.get(conversationId) : null) ||
    cache.get(ALL_CHATS) ||
    DEFAULT_WALLPAPER
  );
}

// Save for one chat.
export async function setChatWallpaper(
  conversationId: string,
  wallpaper: Wallpaper,
) {
  cache.set(conversationId, wallpaper);
  emit();
  await setPref(storageKey(conversationId), JSON.stringify(wallpaper));
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
  await setPref(storageKey(ALL_CHATS), JSON.stringify(wallpaper));
}
