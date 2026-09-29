import { apiRequest } from "./api";

export type SharePerson = {
  id: string;
  username: string;
  name?: string;
  avatarKey?: string;
  avatarPhotoUrl?: string | null;
  faction?: string;
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

export async function getSuggestedPeople(token: string) {
  /*
   * The backend's following endpoint supports
   * an unfiltered paginated list.
   *
   * We use the user's own following list
   * as the initial Share suggestions.
   *
   * The username is supplied by the current
   * caller in ShareSheet if needed later.
   */
  throw new Error("Use searchPeople for friend suggestions.");
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
