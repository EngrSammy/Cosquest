import { apiRequest } from "./api";

export async function getChats(token: string) {
  return apiRequest("/api/chats", {
    token,
  });
}

export async function createDirectChat(token: string, data: unknown) {
  return apiRequest("/api/chats/dm", {
    method: "POST",
    body: data,
    token,
  });
}

export async function getConversation(conversationId: string, token: string) {
  return apiRequest(`/api/chats/${conversationId}`, {
    token,
  });
}

export async function getMessages(conversationId: string, token: string) {
  return apiRequest(`/api/chats/${conversationId}/messages`, {
    token,
  });
}

export async function sendMessage(
  conversationId: string,
  token: string,
  data: unknown,
) {
  return apiRequest(`/api/chats/${conversationId}/messages`, {
    method: "POST",
    body: data,
    token,
  });
}

export async function updateMessage(
  conversationId: string,
  messageId: string,
  token: string,
  data: unknown,
) {
  return apiRequest(`/api/chats/${conversationId}/messages/${messageId}`, {
    method: "PATCH",
    body: data,
    token,
  });
}

export async function deleteMessage(
  conversationId: string,
  messageId: string,
  token: string,
) {
  return apiRequest(`/api/chats/${conversationId}/messages/${messageId}`, {
    method: "DELETE",
    token,
  });
}

export async function markConversationRead(
  conversationId: string,
  token: string,
) {
  return apiRequest(`/api/chats/${conversationId}/read`, {
    method: "PATCH",
    token,
  });
}
