import { apiRequest } from "./api";

export type Quest = {
  id: string;
  title: string;
  description?: string;
  status?: string;
  latitude?: number;
  longitude?: number;
};

export async function getQuests(params?: {
  status?: string;
  lat?: number;
  lng?: number;
  radiusMiles?: number;
}) {
  const query = new URLSearchParams();

  if (params?.status) query.append("status", params.status);
  if (params?.lat !== undefined) query.append("lat", String(params.lat));
  if (params?.lng !== undefined) query.append("lng", String(params.lng));
  if (params?.radiusMiles !== undefined) {
    query.append("radiusMiles", String(params.radiusMiles));
  }

  const queryString = query.toString();

  return apiRequest<Quest[]>(
    `/api/quests${queryString ? `?${queryString}` : ""}`,
  );
}

export async function getQuest(questId: string) {
  return apiRequest<Quest>(`/api/quests/${questId}`);
}

export async function registerForQuest(questId: string, token: string) {
  return apiRequest(`/api/quests/${questId}/registrations`, {
    method: "POST",
    token,
  });
}

export async function unregisterFromQuest(questId: string, token: string) {
  return apiRequest(`/api/quests/${questId}/registrations`, {
    method: "DELETE",
    token,
  });
}
