// Other people's profiles, following and blocking.
// (Routes: src/routes/profileRoutes.js + postRoutes.js on the backend.)
import { apiRequest } from "./api";

export type PublicProfile = {
  id: string;
  username: string;
  name: string;
  avatarKey?: string | null;
  avatarPhotoUrl?: string | null;
  faction?: string | null;
  bio?: string;
  category?: string | null;
  stats?: {
    followers?: number;
    following?: number;
    posts?: number;
    quests?: number;
    wins?: number;
    points?: number;
  };
  createdAt?: string;
};

export type ProfilePost = {
  id: string;
  type: "image" | "reel" | "thought" | string;
  content?: string;
  media?: { url: string; resourceType?: string }[];
  createdAt?: string;
};

function auth(token?: string | null) {
  return token ? { token } : {};
}

function user(username: string) {
  return encodeURIComponent(username.replace(/^@/, ""));
}

// GET /api/users/:username/profile  (404 = private, blocked or not found)
export async function getPublicProfile(
  username: string,
  token?: string | null,
) {
  const response = await apiRequest<{ profile: PublicProfile }>(
    `/api/users/${user(username)}/profile`,
    auth(token),
  );

  return response.profile;
}

// GET /api/users/:username/posts
export async function getUserPosts(username: string, token?: string | null) {
  const response = await apiRequest<{ posts?: ProfilePost[] }>(
    `/api/users/${user(username)}/posts?page=1&limit=50`,
    auth(token),
  );

  return Array.isArray(response?.posts) ? response.posts : [];
}

export async function followUser(username: string, token: string) {
  return apiRequest(`/api/users/${user(username)}/follow`, {
    method: "POST",
    token,
  });
}

export async function unfollowUser(username: string, token: string) {
  return apiRequest(`/api/users/${user(username)}/follow`, {
    method: "DELETE",
    token,
  });
}

export async function blockUser(username: string, token: string) {
  return apiRequest(`/api/users/${user(username)}/block`, {
    method: "POST",
    token,
  });
}

export async function unblockUser(username: string, token: string) {
  return apiRequest(`/api/users/${user(username)}/block`, {
    method: "DELETE",
    token,
  });
}

// GET /api/users/me/blocked -> the usernames YOU have blocked (lower-case).
export async function getBlockedUsernames(token: string): Promise<Set<string>> {
  const response = await apiRequest<any>("/api/users/me/blocked", { token });

  const list =
    response?.users ??
    response?.blocked ??
    response?.blockedUsers ??
    response?.data ??
    [];

  const names = new Set<string>();

  (Array.isArray(list) ? list : []).forEach((item: any) => {
    const name =
      item?.username ?? item?.profile?.username ?? item?.blocked?.username;

    if (typeof name === "string" && name) {
      names.add(name.replace(/^@/, "").toLowerCase());
    }
  });

  return names;
}
