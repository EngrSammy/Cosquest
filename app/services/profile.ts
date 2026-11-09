import { apiRequest } from "./api";

export async function getUserProfile(username: string, token: string) {
  return apiRequest(`/api/users/${encodeURIComponent(username)}/profile`, {
    token,
  });
}

export async function getUserQuests(username: string, token: string) {
  return apiRequest(`/api/users/${encodeURIComponent(username)}/quests`, {
    token,
  });
}

export async function getUserPosts(username: string, token: string) {
  return apiRequest(`/api/users/${encodeURIComponent(username)}/posts`, {
    token,
  });
}
