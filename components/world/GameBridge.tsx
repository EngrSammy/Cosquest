// ==========================================
// CHAT <-> GAME
// ==========================================
// Mounted once at the root (app/_layout.tsx), inside the Redux Provider, so
// it sees sign-in and sign-out even when the world pager is not on screen.
//   - One login: the chat session goes to the game (setSession), which
//     trades it for the account's player on the game backend.
//   - The unread count and the last previews go to the game (its own
//     screens show them while they cover the app), and so does the call.
//   - The game's events: share to chat (the chat picker), back to chat,
//     its world is ready, who the player is (the veil colour).
//   - Notifications whose data carries a cosquest://play link open the game
//     there (data: { url: "cosquest://play?raid=..." }).
import * as Notifications from "expo-notifications";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppState, Platform } from "react-native";

import { parsePlayUrl } from "@/features/world/deepLink";
import type { GameSharePayload } from "@/features/world/gameInvite";
import { sameSummary, type UnreadSummary, unreadSummary } from "@/features/world/unread";
import { factionVeilColor, world } from "@/features/world/worldState";
import { callGame, CostQuestGame, gamePlayable } from "@/modules/costquest-game/src";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { fetchChats } from "@/store/thunks/chatThunks";
import { getPref, setPref } from "@/utils/prefsStorage";

import ShareToChatSheet from "./ShareToChatSheet";
import { useLinkedFactions } from "./useLinkedFactions";

const HANDLED_PREF = "world.lastPlayNotification";

/** A notification's play link, if it has one. */
function playLinkOf(response: Notifications.NotificationResponse | null) {
  const data = response?.notification.request.content.data as Record<string, unknown> | undefined;
  const url = typeof data?.url === "string" ? data.url : null;
  return parsePlayUrl(url);
}

export default function GameBridge() {
  const token = useAppSelector((state) => state.auth.token);
  const chatFaction = useAppSelector((state) => state.auth.user?.faction ?? null);
  const conversations = useAppSelector((state) => state.chat.conversations);
  const active = useAppSelector((state) => state.call.active);
  const callConversation = useAppSelector((state) =>
    active ? state.chat.conversationDetails[active.call.conversationId] : undefined,
  );
  const [sharing, setSharing] = useState<GameSharePayload | null>(null);
  // F-08: one faction for both halves, when the flag says so (task 059).
  useLinkedFactions();
  const lastSummary = useRef<UnreadSummary | null>(null);

  // ---------- one login ----------
  const previousToken = useRef<string | null>(null);
  useEffect(() => {
    if (!CostQuestGame) return;
    if (token) {
      callGame("setSession", token);
    } else if (previousToken.current) {
      // Signed out: the game forgets the player, the world starts over.
      callGame("reset");
      world.reset();
      lastSummary.current = null;
    } else {
      // Started signed out (SessionGate has already read the saved login):
      // no account key from an earlier session may stay installed.
      callGame("setSession", null);
    }
    previousToken.current = token;
  }, [token]);

  // The placeholder never reports a world; there is nothing to wait for.
  useEffect(() => {
    if (CostQuestGame && !gamePlayable) world.markGameReady();
  }, []);

  // ---------- unread ----------
  // The bubble counts what the chat list says. The list is otherwise only
  // fetched when the Chats screen opens, so after a cold start (or a while
  // in the background) the bubble would read 0: fetch it here as well.
  const dispatch = useAppDispatch();
  useEffect(() => {
    if (!CostQuestGame || !token) return;
    void dispatch(fetchChats(token));
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") void dispatch(fetchChats(token));
    });
    return () => sub.remove();
  }, [dispatch, token]);
  const summary = useMemo(() => unreadSummary(conversations), [conversations]);
  useEffect(() => {
    if (!CostQuestGame || !token) return;
    if (sameSummary(lastSummary.current, summary)) return;
    lastSummary.current = summary;
    callGame("setUnread", summary.count, summary.previews);
  }, [summary, token]);

  // ---------- the call pill ----------
  const callTitle =
    active?.direction === "incoming"
      ? active.call.caller?.name || active.call.caller?.username || "Call"
      : callConversation?.title || callConversation?.otherParticipant?.username || "Call";
  const answeredAt = active?.call.answeredAt ? Date.parse(active.call.answeredAt) : NaN;
  const callVideo = active?.call.type === "video";
  useEffect(() => {
    if (!CostQuestGame) return;
    callGame(
      "setCallPill",
      active
        ? { title: callTitle, video: callVideo, answeredAt: Number.isFinite(answeredAt) ? answeredAt : null }
        : null,
    );
  }, [active, callTitle, callVideo, answeredAt]);

  // ---------- the game's events ----------
  useEffect(() => {
    if (!CostQuestGame) return;
    const subs = [
      CostQuestGame.addListener("onReady", () => world.markGameReady()),
      CostQuestGame.addListener("onSession", (event) => {
        world.setFactionColor(factionVeilColor(event.faction, chatFaction));
      }),
      CostQuestGame.addListener("onShareToChat", (payload) => setSharing(payload)),
      CostQuestGame.addListener("onRequestChat", (event) => world.openChat(event.chatId ?? null)),
      CostQuestGame.addListener("onError", (event) => {
        // A failed one login is shown over the game (SsoProblemPanel, from
        // the game store); the player chooses Retry or this phone's key.
        console.warn(`[game] ${event.code}: ${event.message ?? ""}`);
      }),
    ];
    return () => subs.forEach((sub) => sub.remove());
  }, [chatFaction]);

  // ---------- notifications ----------
  useEffect(() => {
    if (Platform.OS === "web") return;
    let cancelled = false;
    // Opened from a notification while the app was closed.
    // The OS can hand the same response back on later launches: act on
    // each notification once.
    Notifications.getLastNotificationResponseAsync()
      .then(async (response) => {
        const link = playLinkOf(response);
        const id = response?.notification.request.identifier;
        if (cancelled || !link || !id) return;
        if ((await getPref(HANDLED_PREF)) === id) return;
        await setPref(HANDLED_PREF, id);
        if (!cancelled) world.openGame(link.target);
      })
      .catch(() => {});
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const link = playLinkOf(response);
      if (!link) return;
      setPref(HANDLED_PREF, response.notification.request.identifier);
      world.openGame(link.target);
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);

  return <ShareToChatSheet payload={sharing} onClose={() => setSharing(null)} />;
}
