import { apiRequest } from "./api";

// Settings > Privacy & Visibility
// GET / PATCH /api/users/me/privacy
export type PrivacySettings = {
  profileVisibility: "public" | "friends" | "private";
  showActivityFeed: boolean;
  allowDirectMessages: boolean;
  showOnlineStatus: boolean;
  allowFriendRequests: boolean;
  // Off: others don't see when you've read their messages, and you don't
  // see when they've read yours (like WhatsApp).
  readReceipts: boolean;
};

export const DEFAULT_PRIVACY: PrivacySettings = {
  profileVisibility: "public",
  showActivityFeed: true,
  allowDirectMessages: true,
  showOnlineStatus: true,
  allowFriendRequests: true,
  readReceipts: true,
};

function normalize(raw: any): PrivacySettings {
  const privacy = raw?.privacy || raw || {};

  return {
    ...DEFAULT_PRIVACY,
    ...privacy,
    // Accounts from before read receipts existed have no value: it's on.
    readReceipts: privacy.readReceipts !== false,
  };
}

export async function getPrivacy(token: string): Promise<PrivacySettings> {
  return normalize(await apiRequest<any>("/api/users/me/privacy", { token }));
}

export async function updatePrivacy(
  changes: Partial<PrivacySettings>,
  token: string,
): Promise<PrivacySettings> {
  return normalize(
    await apiRequest<any>("/api/users/me/privacy", {
      method: "PATCH",
      body: changes,
      token,
    }),
  );
}
