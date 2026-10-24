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

  // A search: the first page is enough.
  if (searchPart) {
    return apiRequest<FollowUsersResponse>(
      `/api/users/${encodeURIComponent(username)}/following?page=1&limit=20${searchPart}`,
      { token },
    );
  }

  // EVERYONE YOU FOLLOW: every page, so Follow / Following is right for
  // all of them (not only the first 20).
  const users: FollowUser[] = [];
  let total = 0;
  for (let page = 1; page <= 50; page++) {
    const response = await apiRequest<FollowUsersResponse>(
      `/api/users/${encodeURIComponent(username)}/following?page=${page}&limit=50`,
      { token },
    );
    users.push(...(response?.users || []));
    total = response?.pagination?.total ?? users.length;
    if (!response?.pagination?.hasMore || !response?.users?.length) break;
  }
  return { users, pagination: { page: 1, limit: users.length, total, hasMore: false } } as FollowUsersResponse;
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
