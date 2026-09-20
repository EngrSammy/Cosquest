import { apiRequest } from "./api";

export async function getNotifications(token: string) {
  return apiRequest("/api/users/me/notifications", {
    token,
  });
}

export async function markNotificationsAsRead(token: string) {
  return apiRequest("/api/users/me/notifications/read", {
    method: "PATCH",
    token,
  });
}
