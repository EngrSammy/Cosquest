import { apiRequest } from "./api";

export type SpotlightEntry = {
  id: string;
  userId?: string;
  username?: string;
  name?: string;

  avatar?: string | null;
  avatarUrl?: string | null;
  avatarPhotoUrl?: string | null;
  profilePicture?: string | null;

  points: number;

  realm?: string | null;
  interest?: string | null;

  rank?: number;

  level?: number;
};

export type SpotlightRealm = {
  id?: string;
  name?: string;
  slug?: string;
  interest?: string;
  count?: number;
};

export type SpotlightLeaderboardResponse = {
  leaderboard?: SpotlightEntry[];
  data?: SpotlightEntry[];
  results?: SpotlightEntry[];

  page?: number;
  limit?: number;
  total?: number;
  totalPages?: number;
  hasNextPage?: boolean;
};

export type SpotlightRealmsResponse = {
  realms?: SpotlightRealm[];
  data?: SpotlightRealm[];
};

export type MyPointsResponse = {
  points?: number;
  totalPoints?: number;
  level?: number;
  realm?: string;
  data?: {
    points?: number;
    totalPoints?: number;
    level?: number;
    realm?: string;
  };
};

/* =========================================================
   NORMALIZE LEADERBOARD ENTRY
========================================================= */

function normalizeLeaderboardEntry(raw: any, index: number): SpotlightEntry {
  return {
    id: String(raw?.id ?? raw?._id ?? raw?.userId ?? `spotlight-${index}`),

    userId:
      raw?.userId ?? raw?.user?.id ?? raw?.user?._id ?? raw?.id ?? raw?._id,

    username:
      raw?.username ?? raw?.user?.username ?? raw?.profile?.username ?? "",

    name:
      raw?.name ??
      raw?.displayName ??
      raw?.user?.name ??
      raw?.user?.profile?.displayName ??
      raw?.username ??
      raw?.user?.username ??
      "CosQuest User",

    avatar:
      raw?.avatar ??
      raw?.avatarPhotoUrl ??
      raw?.avatarUrl ??
      raw?.profilePicture ??
      raw?.user?.avatar ??
      raw?.user?.avatarPhotoUrl ??
      raw?.user?.avatarUrl ??
      raw?.user?.profilePicture ??
      null,

    avatarUrl: raw?.avatarUrl ?? raw?.user?.avatarUrl ?? null,

    avatarPhotoUrl: raw?.avatarPhotoUrl ?? raw?.user?.avatarPhotoUrl ?? null,

    profilePicture: raw?.profilePicture ?? raw?.user?.profilePicture ?? null,

    points: Number(raw?.points ?? raw?.totalPoints ?? raw?.score ?? 0),

    realm: raw?.realm ?? raw?.realmName ?? raw?.user?.realm ?? null,

    interest: raw?.interest ?? raw?.interestName ?? null,

    rank: raw?.rank != null ? Number(raw.rank) : index + 1,

    level: raw?.level != null ? Number(raw.level) : undefined,
  };
}

/* =========================================================
   GET LEADERBOARD
   GET /api/spotlight/leaderboard?page=1&limit=20
========================================================= */

export async function getSpotlightLeaderboard(
  token: string,
  page = 1,
  limit = 20,
  interest?: string,
): Promise<{
  leaderboard: SpotlightEntry[];
  page?: number;
  limit?: number;
  total?: number;
  totalPages?: number;
  hasNextPage?: boolean;
}> {
  const params = new URLSearchParams();

  params.append("page", String(page));
  params.append("limit", String(limit));

  if (interest?.trim()) {
    params.append("interest", interest.trim());
  }

  const response = await apiRequest<SpotlightLeaderboardResponse>(
    `/api/spotlight/leaderboard?${params.toString()}`,
    {
      method: "GET",
      token,
    },
  );

  const rawList =
    response?.leaderboard ?? response?.data ?? response?.results ?? [];

  const leaderboard = Array.isArray(rawList)
    ? rawList.map(normalizeLeaderboardEntry)
    : [];

  return {
    leaderboard,
    page: response?.page,
    limit: response?.limit,
    total: response?.total,
    totalPages: response?.totalPages,
    hasNextPage: response?.hasNextPage,
  };
}

/* =========================================================
   GET REALMS
   GET /api/spotlight/realms
========================================================= */

export async function getSpotlightRealms(
  token: string,
): Promise<SpotlightRealm[]> {
  const response = await apiRequest<SpotlightRealmsResponse>(
    "/api/spotlight/realms",
    {
      method: "GET",
      token,
    },
  );

  return response?.realms ?? response?.data ?? [];
}

/* =========================================================
   GET CURRENT USER POINTS
   GET /api/users/me/points
========================================================= */

export async function getMySpotlightPoints(
  token: string,
): Promise<MyPointsResponse> {
  return apiRequest<MyPointsResponse>("/api/users/me/points", {
    method: "GET",
    token,
  });
}
