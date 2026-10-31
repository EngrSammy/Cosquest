import { apiRequest } from "./api";

export type Money = { amount: number; currency: string };

// The shape GET /api/quests returns (status: "live" | "upcoming" | ...).
export type Quest = {
  id: string;
  slug?: string;
  title: string;
  description?: string;
  coverImageUrl?: string;
  hostName?: string;
  status?: string;
  startsAt?: string;
  endsAt?: string;
  location?: {
    name?: string;
    address?: string;
    lat?: number;
    lng?: number;
  };
  prizePool?: Money | null;
  entryFee?: Money | null;
  maxParticipants?: number;
  registrationCount?: number;
  spacesRemaining?: number;
  interests?: string[];
  faction?: string | null;
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

  // The backend answers { quests: [...] }.
  const response = await apiRequest<{ quests?: Quest[] } | Quest[]>(
    `/api/quests${queryString ? `?${queryString}` : ""}`,
  );

  return Array.isArray(response) ? response : response?.quests || [];
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
