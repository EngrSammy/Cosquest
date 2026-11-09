import { apiRequest } from "./api";

export type SharePerson = {
  id: string;
  username: string;
  name?: string;
  avatarKey?: string | null;
  avatarPhotoUrl?: string | null;
  faction?: string | null;
};

type PeopleResponse = {
  users: SharePerson[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
  };
};

type ChatResponse = {
  chat: {
    id: string;
    type: "dm";
    otherParticipant?: {
      username?: string;
    };
  };
};

type MessageResponse = {
  message: {
    id: string;
    kind?: string;
    content?: string;
    createdAt?: string;
  };
};

export async function searchPeople(token: string, search: string) {
  return apiRequest<PeopleResponse>(
    `/api/users/search?search=${encodeURIComponent(
      search.trim(),
    )}&page=1&limit=20`,
    {
      token,
    },
  );
}

// ==========================================
// SUGGESTED PEOPLE
// GET /api/users/:username/following
// ==========================================
// The people you follow — the same endpoint the Following screen uses
// (services/follow.ts). Before, this function always threw an error on
// purpose, which is why Share always said "No suggested friends yet".
export async function getSuggestedPeople(token: string, username: string) {
  return apiRequest<PeopleResponse>(
    `/api/users/${encodeURIComponent(username)}/following?page=1&limit=20`,
    {
      token,
    },
  );
}

export async function createShareChat(token: string, username: string) {
  return apiRequest<ChatResponse>("/api/chats/dm", {
    method: "POST",
    body: {
      username,
    },
    token,
  });
}

export async function sendSharedPostMessage(
  token: string,
  conversationId: string,
  content: string,
) {
  return apiRequest<MessageResponse>(`/api/chats/${conversationId}/messages`, {
    method: "POST",
    body: {
      content,
    },
    token,
  });
}
