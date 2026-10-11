import { Platform } from "react-native";

import { apiRequest } from "./api";

// ==========================================
// SEARCH IN CHAT (M16) · MESSAGE CONTEXT (M16) · ALBUMS (M17)
// ==========================================

export type SearchResult = {
  message: any;
  context: { label: string; sparkId: string | null; sparkSubject: string | null };
};

function chatPath(conversationId: string) {
  return `/api/chats/${encodeURIComponent(conversationId)}`;
}

export async function searchChat(conversationId: string, query: string, page: number, token: string) {
  const params = new URLSearchParams({ q: query, page: String(page), limit: "20" });
  const response = await apiRequest<any>(`${chatPath(conversationId)}/search?${params.toString()}`, { token });
  return {
    results: (response?.results || []).map((item: any) => ({
      ...item,
      message: { ...item.message, id: String(item.message?.id ?? item.message?._id ?? ""), conversationId },
    })) as SearchResult[],
    total: Number(response?.pagination?.total) || 0,
    hasMore: !!response?.pagination?.hasMore,
  };
}

// The message with the conversation around it (oldest first).
export async function getMessageContext(conversationId: string, messageId: string, token: string) {
  const response = await apiRequest<any>(
    `${chatPath(conversationId)}/messages/${encodeURIComponent(messageId)}/context?size=12`,
    { token },
  );
  return {
    targetId: String(response?.targetId || messageId),
    messages: (response?.messages || []).map((m: any) => ({ ...m, id: String(m?.id ?? m?._id ?? ""), conversationId })),
  };
}

export type PickedMedia = {
  uri: string;
  name: string;
  type: string;
  kind: "image" | "video";
  // seconds (videos)
  duration?: number | null;
};

async function appendFile(form: FormData, field: string, file: PickedMedia) {
  if (Platform.OS === "web") {
    const blob = await (await fetch(file.uri)).blob();
    form.append(field, blob, file.name);
  } else {
    form.append(field, { uri: file.uri, name: file.name, type: file.type } as any);
  }
}

// Several photos/videos in ONE message, with one caption.
export async function sendAlbum(
  conversationId: string,
  files: PickedMedia[],
  caption: string,
  token: string,
  extra: { replyTo?: string | null; sparkId?: string | null } = {},
) {
  const form = new FormData();
  for (const file of files) await appendFile(form, "media", file);
  if (caption.trim()) form.append("content", caption.trim());
  if (extra.replyTo) form.append("replyTo", extra.replyTo);
  if (extra.sparkId) form.append("sparkId", extra.sparkId);

  const response = await apiRequest<any>(`${chatPath(conversationId)}/album`, {
    method: "POST",
    body: form as any,
    token,
  });
  const message = response?.message ?? response;
  return { ...message, id: String(message?.id ?? message?._id ?? ""), conversationId };
}
