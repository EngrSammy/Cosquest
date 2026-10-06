import { apiRequest } from "./api";

export type NotificationActor = {
  id?: string;
  username?: string;
  name?: string;
  avatarKey?: string | null;
  avatarPhotoUrl?: string | null;
};

export type AppNotificationItem = {
  id: string;
  // Only "follow" is confirmed from the backend doc (createForUser's
  // { type: 'follow' } call site) — other values (e.g. a future
  // "system" broadcast) are read as-is, just not specially handled yet.
  type?: string;
  message?: string;
  read?: boolean;
  createdAt?: string;
  actor?: NotificationActor | null;
  // @ mention notifications: the chat (and message) to open.
  conversationId?: string | null;
  messageId?: string | null;
};

function normalizeActor(raw: any): NotificationActor | null {
  if (!raw) {
    return null;
  }

  const profile = raw.profile || raw;

  return {
    id: raw.id || raw._id,
    username: profile?.username || raw?.username,
    name:
      profile?.displayName ||
      [profile?.firstName, profile?.lastName].filter(Boolean).join(" ") ||
      profile?.username ||
      raw?.username,
    avatarKey: profile?.avatarKey ?? raw?.avatarKey ?? null,
    avatarPhotoUrl: profile?.avatarPhotoUrl ?? raw?.avatarPhotoUrl ?? null,
  };
}

function normalizeNotification(item: any): AppNotificationItem {
  return {
    id: String(item?.id ?? item?._id ?? ""),
    type: item?.type,
    message: item?.message,
    read: !!item?.read,
    createdAt: item?.createdAt,
    actor: normalizeActor(item?.actor),
    conversationId: item?.conversationId ?? null,
    messageId: item?.messageId ?? null,
  };
}

// The exact REST response shape wasn't confirmed to me — only the
// socket-pushed shape (createForUser's sanitize(notification)) was.
// Reads defensively: either a bare array, or { notifications: [...] }.
// If notifications don't show up, log the raw response here to see
// which shape it actually is.
function normalizeList(response: any): AppNotificationItem[] {
  const list = Array.isArray(response) ? response : response?.notifications;

  if (!Array.isArray(list)) {
    return [];
  }

  return list.map(normalizeNotification);
}

export async function getNotifications(
  token: string,
): Promise<AppNotificationItem[]> {
  const response = await apiRequest<any>("/api/users/me/notifications", {
    token,
  });

  return normalizeList(response);
}

export async function markNotificationsAsRead(token: string) {
  return apiRequest("/api/users/me/notifications/read", {
    method: "PATCH",
    token,
  });
}
