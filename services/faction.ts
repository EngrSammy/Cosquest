import { apiRequest } from "./api";

// Matches src/models/factionModel.js exactly. The backend has no `id` or
// `image` field at all — `key` is the identifier (e.g. "celestials") and
// `color` is a hex string, not an image.
export type Faction = {
  key: string;
  name: string;
  color: string;
  description: string;
  perks: string[];
  // Only populated by GET /api/factions (the aggregated onboarding
  // list). GET /api/factions/:key/members' own `faction` field comes
  // from getFaction() on the backend, which does NOT include these —
  // use that endpoint's `pagination.total` for a real member count
  // instead, not `faction.memberCount`.
  memberCount?: number;
  activeQuestCount?: number;
};

export type FactionMemberPreview = {
  id: string;
  username: string;
  name: string;
  avatarKey?: string | null;
  avatarPhotoUrl?: string | null;
  faction: string;
};

export type FactionMembersResponse = {
  faction: Faction | null;
  users: FactionMemberPreview[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
  };
};

// GET /api/factions — public. Onboarding step 2's full list, all six
// with a live memberCount/activeQuestCount each. The response is
// { factions: [...] }, not a bare array — the previous version of this
// function typed it as Faction[] directly, which was wrong.
export async function getFactions() {
  const response = await apiRequest<{ factions: Faction[] }>("/api/factions");

  return response.factions;
}

// GET /api/factions/:key/members — public. Builds the profile faction
// card: `faction` for name/color/description/perks, `users` for the
// small avatar-row preview, `pagination.total` for the REAL total
// member count.
export async function getFactionMembers(key: string, page = 1, limit = 4) {
  return apiRequest<FactionMembersResponse>(
    `/api/factions/${encodeURIComponent(key)}/members?page=${page}&limit=${limit}`,
  );
}
