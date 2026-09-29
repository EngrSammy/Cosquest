import { useEffect, useRef } from "react";
import { AppState } from "react-native";

import { normalizeCall } from "@/services/calls";
import {
      connectSocket,
      disconnectSocket,
      getSocket,
      pauseSocket,
      resumeSocket,
} from "@/services/socket";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
      socketCallIncoming,
      socketCallUpdated,
} from "@/store/slices/callSlice";
import {
      socketPresenceChanged,
      socketTypingStarted,
      socketTypingStopped,
} from "@/store/slices/chatSlice";
import { socketFollowerAdded } from "@/store/slices/followSlice";
import { fetchIncomingCall } from "@/store/thunks/callThunks";
import { fetchConversation } from "@/store/thunks/chatThunks";

// How long someone stays showing as "online" after their connection
// actually drops — covers a brief app-background/network-blip without
// flickering the dot, same idea as most chat apps' grace windows.
// Purely a frontend delay: the backend's presence:offline event still
// fires immediately and honestly, this just chooses not to act on it
// right away.
const OFFLINE_GRACE_MS = 3 * 60 * 1000;

// The backend's exact `sanitize(notification)` output wasn't shown to
// me — this reads defensively (nested `actor.profile.username` OR a
// flattened `actor.username`) rather than assuming one exact shape.
// Verify against a real "someone followed you" payload once tested; if
// nothing shows up in the followers list live, log the raw payload here
// to see which shape it actually is.
function extractFollowActor(payload: any): {
  id: string;
  username: string;
  name: string;
  avatarKey?: string | null;
  avatarPhotoUrl?: string | null;
  faction?: string | null;
} | null {
  const actor = payload?.actor;

  if (!actor) {
    return null;
  }

  const id = actor.id || actor._id;

  if (!id) {
    return null;
  }

  const profile = actor.profile || actor;

  const username = profile?.username || actor?.username || "";

  const firstName = profile?.firstName || actor?.firstName || "";

  const lastName = profile?.lastName || actor?.lastName || "";

  const name = [firstName, lastName].filter(Boolean).join(" ") || username;

  return {
    id: String(id),
    username,
    name,
    avatarKey: profile?.avatarKey ?? actor?.avatarKey ?? null,
    avatarPhotoUrl: profile?.avatarPhotoUrl ?? actor?.avatarPhotoUrl ?? null,
    faction: profile?.faction ?? actor?.faction ?? null,
  };
}

// Call this once, near the root of the app (e.g. app/_layout.tsx) —
// NOT inside individual screens. A single socket connection is meant to
// persist across navigation, and everything wired up in here (presence,
// typing, follow notifications, live preview refresh, calls) needs to
// keep running no matter which screen is currently on top, not just
// while one specific chat happens to be open.
export function useSocketConnection() {
  const dispatch = useAppDispatch();

  const token = useAppSelector((state) => state.auth.token);

  // DM conversation ids, kept in a ref so the reconnect handler below can
  // refresh them without re-subscribing every time the list changes.
  const conversations = useAppSelector((state) => state.chat.conversations);
  const dmIdsRef = useRef<string[]>([]);
  dmIdsRef.current = conversations
    .filter((chat) => chat.type === "dm")
    .map((chat) => chat.id);

  useEffect(() => {
    if (!token) {
      disconnectSocket();

      return;
    }

    connectSocket(token);
  }, [token]);

  // Pending "go offline" timers, keyed by userId — lets a presence:online
  // arriving within the grace window cancel the pending offline instead
  // of letting it fire. Held in a ref since this is a single side-table
  // for socket-driven timers, not something that should trigger re-renders.
  const offlineTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  useEffect(() => {
    if (!token) {
      return;
    }

    const socket = getSocket();

    if (!socket) {
      return;
    }

    const handleNotification = (payload: any) => {
      if (payload?.type !== "follow") {
        // Other notification types (system-wide announcements, etc.)
        // aren't handled here — wire in a dedicated notifications
        // slice/screen the same way once you have one to show them in.
        return;
      }

      const actor = extractFollowActor(payload);

      if (actor) {
        dispatch(socketFollowerAdded(actor));
      }
    };

    const handlePresenceOnline = (payload: { userId: string }) => {
      const pendingOffline = offlineTimersRef.current.get(payload.userId);

      if (pendingOffline) {
        clearTimeout(pendingOffline);
        offlineTimersRef.current.delete(payload.userId);
      }

      dispatch(socketPresenceChanged({ userId: payload.userId, online: true }));
    };

    // lastActiveAt is sent by the backend (presence.js) — the moment they
    // actually left — so "last seen ..." shows the real time.
    const handlePresenceOffline = (payload: {
      userId: string;
      lastActiveAt?: string;
    }) => {
      // Don't flip to offline immediately — wait out the grace window
      // in case they reconnect (brief backgrounding, a network blip).
      // If a NEW offline event arrives before the old timer fires
      // (shouldn't normally happen, but defensively), replace rather
      // than stack a second timer for the same user.
      const existing = offlineTimersRef.current.get(payload.userId);

      if (existing) {
        clearTimeout(existing);
      }

      const timer = setTimeout(() => {
        offlineTimersRef.current.delete(payload.userId);

        dispatch(
          socketPresenceChanged({
            userId: payload.userId,
            online: false,
            lastActiveAt: payload.lastActiveAt,
          }),
        );
      }, OFFLINE_GRACE_MS);

      offlineTimersRef.current.set(payload.userId, timer);
    };

    const handleTypingStart = (payload: { conversationId: string }) => {
      dispatch(socketTypingStarted({ conversationId: payload.conversationId }));
    };

    const handleTypingStop = (payload: { conversationId: string }) => {
      dispatch(socketTypingStopped({ conversationId: payload.conversationId }));
    };

    // chat:preview only ever carries { conversationId } — deliberately
    // no message content, per the backend's own design — so the
    // client's job is just to re-fetch that one conversation's current
    // state (unreadCount, lastMessage) and let the existing
    // fetchConversation.fulfilled reducer update both
    // conversationDetails and the conversations list array, which is
    // what the Direct Message list actually renders from.
    const handleChatPreview = (payload: { conversationId: string }) => {
      if (!payload?.conversationId) {
        return;
      }

      dispatch(
        fetchConversation({
          conversationId: payload.conversationId,
          token,
        }),
      );
    };

    // ======================================
    // CALLS
    // ======================================
    // call:incoming → someone is calling you (shows the ringing screen)
    // call:updated  → accepted / declined / missed / cancelled / ended
    // Both are sent by callController.js with emitToUsers, to the
    // user:<id> room this socket joins on connect.

    const handleCallIncoming = (payload: { call: any }) => {
      if (payload?.call) {
        dispatch(socketCallIncoming({ call: normalizeCall(payload.call) }));
      }
    };

    const handleCallUpdated = (payload: { call: any }) => {
      if (payload?.call) {
        dispatch(socketCallUpdated({ call: normalizeCall(payload.call) }));
      }
    };

    // Safety net: if the phone was asleep or the socket dropped when the
    // call:incoming event was sent, ask the backend once on reconnect /
    // when the app comes back to the foreground.
    const checkForMissedRinging = () => {
      dispatch(fetchIncomingCall(token));
    };

    // ======================================
    // RECONNECT: catch up on anything missed while disconnected
    // ======================================
    // While the app was in the background (socket paused) we couldn't
    // receive presence events, so someone may have come online or gone
    // offline meanwhile. Refreshing each DM conversation brings back the
    // current isOnline / lastActiveAt / lastReadAt for every chat.
    let hasConnectedBefore = socket.connected;

    const handleConnect = () => {
      checkForMissedRinging();

      if (hasConnectedBefore) {
        dmIdsRef.current.forEach((conversationId) => {
          dispatch(fetchConversation({ conversationId, token }));
        });
      }

      hasConnectedBefore = true;
    };

    // ======================================
    // APP BACKGROUND / FOREGROUND
    // ======================================
    // Leaving the app → disconnect, so the other person sees you go
    // offline (after the 3-minute grace window, then "last seen").
    // Coming back → reconnect, which shows you online again right away.

    const appStateSubscription = AppState.addEventListener(
      "change",
      (nextState) => {
        if (nextState === "active") {
          resumeSocket();
        } else if (nextState === "background") {
          pauseSocket();
        }
      },
    );

    socket.on("notification:new", handleNotification);
    socket.on("presence:online", handlePresenceOnline);
    socket.on("presence:offline", handlePresenceOffline);
    socket.on("typing:start", handleTypingStart);
    socket.on("typing:stop", handleTypingStop);
    socket.on("chat:preview", handleChatPreview);
    socket.on("call:incoming", handleCallIncoming);
    socket.on("call:updated", handleCallUpdated);
    socket.on("connect", handleConnect);

    return () => {
      socket.off("notification:new", handleNotification);
      socket.off("presence:online", handlePresenceOnline);
      socket.off("presence:offline", handlePresenceOffline);
      socket.off("typing:start", handleTypingStart);
      socket.off("typing:stop", handleTypingStop);
      socket.off("chat:preview", handleChatPreview);
      socket.off("call:incoming", handleCallIncoming);
      socket.off("call:updated", handleCallUpdated);
      socket.off("connect", handleConnect);

      appStateSubscription.remove();

      // Clear any still-pending offline timers so they don't fire
      // (and dispatch into a socket that's being torn down) after
      // this effect's own listeners are already gone.
      offlineTimersRef.current.forEach((timer) => clearTimeout(timer));
      offlineTimersRef.current.clear();
    };
  }, [token, dispatch]);
}
