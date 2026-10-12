// ==========================================
// SPARKS HOOKS (Subomi's on-phone AI)
// ==========================================
// useSparksBoot(): start the SDK once after login (Chats hub, chat screen).
// useSparksFeed(chatId, messages): give the SDK the open chat's members and
//   every message on screen, so this phone can do AI work for the group.
// Both do nothing on the website or while EXPO_PUBLIC_SPARKS_ENGINE isn't "module".
import { useEffect, useRef } from "react";

import { apiRequest } from "@/services/api";
import { userIdFromToken } from "@/services/calls";
import { feedMembers, feedMessages, sparksEnabled, startSparks } from "@/services/sparksSdk";
import { useAppSelector } from "@/store/hooks";

function useMyUserId() {
  const token = useAppSelector((state) => state.auth.token);
  const myUserId = useAppSelector((state) => state.call.myUserId);
  return { token, userId: myUserId || userIdFromToken(token) };
}

export function useSparksBoot() {
  const { token, userId } = useMyUserId();

  useEffect(() => {
    if (!sparksEnabled() || !token || !userId) return;
    startSparks(userId, () => token).catch(() => {});
  }, [token, userId]);
}

export function useSparksFeed(chatId: string | undefined, messages: any[]) {
  const { token, userId } = useMyUserId();
  const ready = useRef<string | null>(null);

  // Start the SDK, then give it this chat's members (once per chat).
  useEffect(() => {
    if (!sparksEnabled() || !token || !userId || !chatId) return;
    let cancelled = false;
    (async () => {
      const sdk = await startSparks(userId, () => token);
      if (!sdk || cancelled) return;
      try {
        // Members as Sparks sees them (roles, ranks, admin flags).
        const result = await apiRequest<any>(`/api/chats/${encodeURIComponent(chatId)}/sparks/members`, { token });
        if (!cancelled) await feedMembers(chatId, result?.members || []);
      } catch {}
      if (!cancelled) ready.current = chatId;
    })();
    return () => {
      cancelled = true;
    };
  }, [chatId, token, userId]);

  // Every message on screen (history, live, my own sends once numbered).
  useEffect(() => {
    if (!sparksEnabled() || !chatId || !messages?.length) return;
    const timer = setTimeout(() => {
      feedMessages(chatId, messages).catch(() => {});
    }, 400);
    return () => clearTimeout(timer);
  }, [chatId, messages]);
}
