import { apiRequest } from "./api";

// ==========================================
// Chat preferences, join requests and expertise roles (backend Phase 8)
// ==========================================

// "Mute only Sparks / thread activity" for me in this chat.
export async function setSparksMuted(conversationId: string, sparksMuted: boolean, token: string) {
  return apiRequest<{ sparksMuted: boolean }>(`/api/chats/${encodeURIComponent(conversationId)}/notifications`, {
    method: "PATCH",
    body: { sparksMuted },
    token,
  });
}

// Cancel my pending request to join a group.
export async function cancelJoinRequest(groupId: string, token: string) {
  return apiRequest<{ cancelled: boolean }>(`/api/groups/${encodeURIComponent(groupId)}/requests/mine`, {
    method: "DELETE",
    token,
  });
}

export type ExpertiseRole = { key: string; label: string };

export async function getExpertiseRoles(): Promise<ExpertiseRole[]> {
  const response = await apiRequest<any>("/api/expertise");
  return Array.isArray(response?.expertise) ? response.expertise : [];
}

// Set (or clear with null) my expertise role.
export async function setMyExpertise(expertise: string | null, token: string) {
  return apiRequest<any>("/api/expertise/me", { method: "PATCH", body: { expertise }, token });
}
