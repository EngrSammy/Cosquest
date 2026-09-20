import { apiRequest } from "./api";

export type FollowUser = {
  id: string;
  username: string;
  name: string;
  avatarKey?: string | null;
  avatarPhotoUrl?: string | null;
  faction?: string | null;
};

export type FollowUsersResponse = {
  users: FollowUser[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
  };
};

export type FollowActionResponse = {
  message: string;
  following: boolean;
};

export async function getFollowers(
  username: string,
  token: string,
  search?: string,
) {
  const searchPart = search?.trim()
    ? `&search=${encodeURIComponent(search.trim())}`
    : "";

  return apiRequest<FollowUsersResponse>(
    `/api/users/${encodeURIComponent(
      username,
    )}/followers?page=1&limit=20${searchPart}`,
    {
      token,
    },
  );
}

export async function getFollowing(
  username: string,
  token: string,
  search?: string,
) {
  const searchPart = search?.trim()
    ? `&search=${encodeURIComponent(search.trim())}`
    : "";

  return apiRequest<FollowUsersResponse>(
    `/api/users/${encodeURIComponent(
      username,
    )}/following?page=1&limit=20${searchPart}`,
    {
      token,
    },
  );
}

export async function followUser(username: string, token: string) {
  return apiRequest<FollowActionResponse>(
    `/api/users/${encodeURIComponent(username)}/follow`,
    {
      method: "POST",
      token,
    },
  );
}

export async function unfollowUser(username: string, token: string) {
  return apiRequest<FollowActionResponse>(
    `/api/users/${encodeURIComponent(username)}/follow`,
    {
      method: "DELETE",
      token,
    },
  );
}
