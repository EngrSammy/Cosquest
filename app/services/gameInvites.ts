// Game invites: chat messages of kind "game_invite" (a raid / shrine / duel
// card). The backend side is cosquest-backend gameController.js; the card's
// rules are features/world/gameInvite.ts.
import type { GameInviteType, GameResultCard } from "@/features/world/gameInvite";

import { apiRequest } from "./api";
import type { ChatMessage } from "./chats";

export type GameInviteBody = {
  type: GameInviteType;
  targetId: string;
  place?: string;
  lat?: number;
  lng?: number;
  startsAt?: string;
  note?: string;
  replyTo?: string;
};

/* =========================================================
   SEND A GAME INVITE
   POST /api/chats/:conversationId/game-invites
========================================================= */

export async function sendGameInvite(
  conversationId: string,
  body: GameInviteBody,
  token: string,
): Promise<ChatMessage> {
  const response = await apiRequest<any>(
    `/api/chats/${encodeURIComponent(conversationId)}/game-invites`,
    { method: "POST", body, token },
  );
  const message = response?.message ?? response?.data ?? response;
  return {
    ...message,
    id: String(message?.id ?? message?._id ?? ""),
    conversationId: message?.conversationId || conversationId,
  };
}

/* =========================================================
   SHARE A GAME RESULT AS A CARD (task 059)
   POST /api/chats/:conversationId/game-results
========================================================= */

export async function sendGameResult(
  conversationId: string,
  body: GameResultCard & { note?: string },
  token: string,
): Promise<ChatMessage> {
  const response = await apiRequest<any>(
    `/api/chats/${encodeURIComponent(conversationId)}/game-results`,
    { method: "POST", body, token },
  );
  const message = response?.message ?? response?.data ?? response;
  return {
    ...message,
    id: String(message?.id ?? message?._id ?? ""),
    conversationId: message?.conversationId || conversationId,
  };
}
