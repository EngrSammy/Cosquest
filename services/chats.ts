import { appendFileToFormData } from "@/utils/appendFileToFormData";

import { apiRequest } from "./api";

export type ChatType = "community" | "faction" | "dm";

export type ChatParticipant = {
  id?: string;
  _id?: string;
  userId?: string;
  username?: string;
  profilePicture?: string | null;
  avatar?: string | null;
  avatarUrl?: string | null;
  avatarPhotoUrl?: string | null;
  isOnline?: boolean;
  lastActiveAt?: string;
  // When this participant last read the conversation, kept live via the
  // chat:read socket event — used to color a sent message's checkmark
  // pink once its createdAt falls at or before this timestamp.
  lastReadAt?: string | null;
};

export type MessageReaction = {
  emoji: string;
  userId?: string;
  username?: string;
  count?: number;
  mine?: boolean;
};

export type ChatMessageFile = {
  uri: string;
  name?: string;
  type?: string;
  mimeType?: string;
};

export type ChatMedia = {
  url?: string;
  uri?: string;
  name?: string;
  filename?: string;
  type?: string;
  mimeType?: string;
  size?: number;
  duration?: number;
  // Voice-note transcription, set by the backend once speech-to-text
  // finishes. transcribing:true while it's still processing.
  transcript?: string | null;
  transcribing?: boolean;
};

export type ChatMessage = {
  id: string;
  _id?: string;
  conversationId?: string;

  kind?: "text" | "audio" | "image" | "video" | "document" | string;

  content?: string;

  media?: ChatMedia | null;

  sender?: ChatParticipant;

  replyTo?: ChatMessage | null;

  reactions?: MessageReaction[];

  deleted?: boolean;

  editedAt?: string | null;

  createdAt?: string;

  updatedAt?: string;

  forwarded?: boolean;
};

export type ChatLastMessage = {
  senderName?: string;
  preview?: string;
  createdAt?: string;
};

export type Chat = {
  id: string;
  _id?: string;

  type?: ChatType;

  title?: string;

  name?: string;

  factionKey?: string;

  memberCount?: number;

  unreadCount?: number;

  lastMessage?: ChatLastMessage | null;

  pinnedMessage?: (Partial<ChatMessage> & { id: string }) | null;

  otherParticipant?: ChatParticipant | null;

  participants?: ChatParticipant[];

  createdAt?: string;

  updatedAt?: string;
};

export type SearchUser = {
  id?: string;
  _id?: string;
  username?: string;
  profilePicture?: string | null;
  avatar?: string | null;
  avatarUrl?: string | null;
  avatarPhotoUrl?: string | null;
  isOnline?: boolean;
  lastActiveAt?: string;
};

export type PinResponse = {
  messageId?: string | null;
  pinnedMessageId?: string | null;
  success?: boolean;
  message?: string;
};

export type ReactionResponse = {
  success?: boolean;
  message?: string;
  reaction?: MessageReaction;
  reactions?: MessageReaction[];
  likeCount?: number;
  count?: number;
};

export type ForwardResponse = {
  success?: boolean;
  message?: string;
  messageId?: string;
  conversationId?: string;
  conversation?: Chat;
};

export type ShareResponse = {
  url?: string;
  shareUrl?: string;
  link?: string;
  shareLink?: string;
};

export type SeenResponse = {
  users?: ChatParticipant[];
  seenBy?: ChatParticipant[];
  count?: number;
};

export type SearchUsersResponse = {
  users?: SearchUser[];
  data?: SearchUser[];
  results?: SearchUser[];
};

// Options for GET /messages. All optional and purely additive — a backend
// that doesn't recognize these query params will simply ignore them and
// return its current (full-history) response, so this is safe to ship
// before the backend implements pagination.
export type GetMessagesOptions = {
  // Ask for only messages newer than this message id / timestamp. Use this
  // on poll ticks once you already have some messages loaded, instead of
  // re-requesting the whole conversation.
  after?: string;
  // Ask for messages older than this message id / timestamp — for
  // "load more" when scrolling up into history.
  before?: string;
  // Cap the page size on the initial load.
  limit?: number;
};

/* =========================================================
   HELPERS
========================================================= */

function getConversationId(chat: Chat): string {
  return String(chat.id || chat._id || "");
}

function normalizeChat(raw: any): Chat {
  return {
    ...raw,
    id: String(raw?.id ?? raw?._id ?? ""),
  };
}

function normalizeMessage(raw: any): ChatMessage {
  return {
    ...raw,
    id: String(raw?.id ?? raw?._id ?? ""),
  };
}

/* =========================================================
   GET CHATS
   GET /api/chats
========================================================= */

export async function getChats(token: string): Promise<Chat[]> {
  const response = await apiRequest<any>("/api/chats", {
    method: "GET",
    token,
  });

  const data = Array.isArray(response)
    ? response
    : (response?.chats ?? response?.conversations ?? response?.data ?? []);

  return data.map(normalizeChat);
}

/* =========================================================
   CREATE DIRECT CHAT
   POST /api/chats/dm
========================================================= */

export async function createDirectChat(
  username: string,
  token: string,
): Promise<Chat> {
  const response = await apiRequest<any>("/api/chats/dm", {
    method: "POST",
    body: {
      username,
    },
    token,
  });

  const chat =
    response?.conversation ?? response?.chat ?? response?.data ?? response;

  return normalizeChat(chat);
}

/* =========================================================
   GET CONVERSATION
   GET /api/chats/:conversationId
========================================================= */

export async function getConversation(
  conversationId: string,
  token: string,
): Promise<Chat> {
  const response = await apiRequest<any>(
    `/api/chats/${encodeURIComponent(conversationId)}`,
    {
      method: "GET",
      token,
    },
  );

  const chat =
    response?.conversation ?? response?.chat ?? response?.data ?? response;

  return normalizeChat(chat);
}

/* =========================================================
   GET MESSAGES
   GET /api/chats/:conversationId/messages
   GET /api/chats/:conversationId/messages?after=<id>&limit=<n>

   `options` is additive/optional — see GetMessagesOptions above. Until
   the backend actually implements after/before/limit, these params are
   harmless extras that a typical REST handler ignores, and this keeps
   returning the full list exactly as before.
========================================================= */

export async function getMessages(
  conversationId: string,
  token: string,
  options?: GetMessagesOptions,
): Promise<ChatMessage[]> {
  const params = new URLSearchParams();

  if (options?.after) {
    params.set("after", options.after);
  }

  if (options?.before) {
    params.set("before", options.before);
  }

  if (options?.limit) {
    params.set("limit", String(options.limit));
  }

  const query = params.toString();

  const response = await apiRequest<any>(
    `/api/chats/${encodeURIComponent(conversationId)}/messages${
      query ? `?${query}` : ""
    }`,
    {
      method: "GET",
      token,
    },
  );

  const data = Array.isArray(response)
    ? response
    : (response?.messages ?? response?.data ?? []);

  return data.map(normalizeMessage);
}

/* =========================================================
   SEND MESSAGE
   POST /api/chats/:conversationId/messages
========================================================= */

export async function sendMessage(
  conversationId: string,
  data: {
    content?: string;
    kind?: string;
    media?: ChatMedia | null;
    replyTo?: string;
    parentMessage?: string;
    file?: ChatMessageFile | null;
  },
  token: string,
): Promise<ChatMessage> {
  const endpoint = `/api/chats/${encodeURIComponent(conversationId)}/messages`;

  let body: unknown = data;

  if (data.file?.uri) {
    const formData = new FormData();

    if (data.content) {
      formData.append("content", data.content);
    }

    if (data.kind) {
      formData.append("kind", data.kind);
    }

    if (data.replyTo) {
      formData.append("replyTo", data.replyTo);
    }

    if (data.parentMessage) {
      formData.append("parentMessage", data.parentMessage);
    }

    await appendFileToFormData(formData, "media", data.file);

    body = formData;
  }

  const response = await apiRequest<any>(endpoint, {
    method: "POST",
    body,
    token,
  });

  const message = response?.message ?? response?.data ?? response;

  return normalizeMessage(message);
}

/* =========================================================
   EDIT MESSAGE
   PATCH /api/chats/:conversationId/messages/:messageId
========================================================= */

export async function updateMessage(
  conversationId: string,
  messageId: string,
  data: {
    content: string;
  },
  token: string,
): Promise<ChatMessage> {
  const response = await apiRequest<any>(
    `/api/chats/${encodeURIComponent(
      conversationId,
    )}/messages/${encodeURIComponent(messageId)}`,
    {
      method: "PATCH",
      body: data,
      token,
    },
  );

  const message = response?.message ?? response?.data ?? response;

  return normalizeMessage(message);
}

/* =========================================================
   DELETE MESSAGE
   DELETE ...?scope=me
   DELETE ...?scope=everyone
========================================================= */

export async function deleteMessage(
  conversationId: string,
  messageId: string,
  token: string,
  scope: "me" | "everyone" = "me",
) {
  return apiRequest<any>(
    `/api/chats/${encodeURIComponent(
      conversationId,
    )}/messages/${encodeURIComponent(messageId)}?scope=${scope}`,
    {
      method: "DELETE",
      token,
    },
  );
}

/* =========================================================
   MESSAGE REACTION
   POST /api/chats/:conversationId/messages/:messageId/reactions
========================================================= */

export async function reactToMessage(
  conversationId: string,
  messageId: string,
  emoji: string,
  token: string,
): Promise<ReactionResponse> {
  return apiRequest<ReactionResponse>(
    `/api/chats/${encodeURIComponent(
      conversationId,
    )}/messages/${encodeURIComponent(messageId)}/reactions`,
    {
      method: "POST",
      body: {
        emoji,
      },
      token,
    },
  );
}

/* =========================================================
   REMOVE MESSAGE REACTION
   DELETE /api/chats/:conversationId/messages/:messageId/reactions
========================================================= */

export async function removeMessageReaction(
  conversationId: string,
  messageId: string,
  emoji: string,
  token: string,
): Promise<ReactionResponse> {
  return apiRequest<ReactionResponse>(
    `/api/chats/${encodeURIComponent(
      conversationId,
    )}/messages/${encodeURIComponent(messageId)}/reactions`,
    {
      method: "DELETE",
      body: {
        emoji,
      },
      token,
    },
  );
}

/* =========================================================
   PIN MESSAGE
   PATCH /api/chats/:conversationId/pinned-message
========================================================= */

export async function pinMessage(
  conversationId: string,
  messageId: string,
  token: string,
): Promise<PinResponse> {
  return apiRequest<PinResponse>(
    `/api/chats/${encodeURIComponent(conversationId)}/pinned-message`,
    {
      method: "PATCH",
      body: {
        messageId,
      },
      token,
    },
  );
}

/* =========================================================
   UNPIN MESSAGE

   The backend endpoint is the same endpoint.
   Sending null clears the pinned message.
========================================================= */

export async function unpinMessage(
  conversationId: string,
  token: string,
): Promise<PinResponse> {
  return apiRequest<PinResponse>(
    `/api/chats/${encodeURIComponent(conversationId)}/pinned-message`,
    {
      method: "PATCH",
      body: {
        messageId: null,
      },
      token,
    },
  );
}

/* =========================================================
   FORWARD MESSAGE
   POST /api/chats/:conversationId/messages/:messageId/forward
========================================================= */

export async function forwardMessage(
  conversationId: string,
  messageId: string,
  token: string,
  targetConversationId?: string,
  targetUsername?: string,
): Promise<ForwardResponse> {
  const body: {
    targetConversationId?: string;
    targetUsername?: string;
  } = {};

  if (targetConversationId) {
    body.targetConversationId = targetConversationId;
  }

  if (targetUsername) {
    body.targetUsername = targetUsername;
  }

  return apiRequest<ForwardResponse>(
    `/api/chats/${encodeURIComponent(
      conversationId,
    )}/messages/${encodeURIComponent(messageId)}/forward`,
    {
      method: "POST",
      body,
      token,
    },
  );
}

/* =========================================================
   MESSAGE SEEN
   GET /api/chats/:conversationId/messages/:messageId/seen
========================================================= */

export async function getMessageSeen(
  conversationId: string,
  messageId: string,
  token: string,
): Promise<SeenResponse> {
  return apiRequest<SeenResponse>(
    `/api/chats/${encodeURIComponent(
      conversationId,
    )}/messages/${encodeURIComponent(messageId)}/seen`,
    {
      method: "GET",
      token,
    },
  );
}

/* =========================================================
   CHAT SHARE
   GET /api/chats/:conversationId/share
========================================================= */

export async function getChatShare(
  conversationId: string,
  token: string,
): Promise<ShareResponse> {
  return apiRequest<ShareResponse>(
    `/api/chats/${encodeURIComponent(conversationId)}/share`,
    {
      method: "GET",
      token,
    },
  );
}

/* =========================================================
   MESSAGE SHARE
   GET /api/chats/:conversationId/messages/:messageId/share
========================================================= */

export async function getMessageShare(
  conversationId: string,
  messageId: string,
  token: string,
): Promise<ShareResponse> {
  return apiRequest<ShareResponse>(
    `/api/chats/${encodeURIComponent(
      conversationId,
    )}/messages/${encodeURIComponent(messageId)}/share`,
    {
      method: "GET",
      token,
    },
  );
}

/* =========================================================
   SEARCH USERS
   GET /api/users/search?search=mark
========================================================= */

export async function searchChatUsers(
  search: string,
  token: string,
): Promise<SearchUser[]> {
  const query = encodeURIComponent(search.trim());

  const response = await apiRequest<SearchUsersResponse>(
    `/api/users/search?search=${query}`,
    {
      method: "GET",
      token,
    },
  );

  const users = response?.users ?? response?.data ?? response?.results ?? [];

  return users;
}

/* =========================================================
   MARK CONVERSATION READ
   PATCH /api/chats/:conversationId/read
========================================================= */

export async function markConversationRead(
  conversationId: string,
  token: string,
) {
  return apiRequest<any>(
    `/api/chats/${encodeURIComponent(conversationId)}/read`,
    {
      method: "PATCH",
      token,
    },
  );
}
