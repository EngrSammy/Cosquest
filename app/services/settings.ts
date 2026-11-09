import { apiRequest } from "./api";

/* =========================================================
   TYPES
========================================================= */

export type ThemeMode = "Light" | "Dark" | "System";

export type FontSize = "Small" | "Medium" | "Large";

export type ProfileVisibility = "Public" | "Friends" | "Private";

export type SettingsOverview = Record<string, any>;

export type PrivacySettings = {
  visibility?: ProfileVisibility | string;
  profileVisibility?: ProfileVisibility | string;

  showOnlineStatus?: boolean;
  onlineStatus?: boolean;

  showActivityFeed?: boolean;
  activityFeed?: boolean;

  allowFriendRequests?: boolean;
  friendRequests?: boolean;

  allowDirectMessages?: boolean;
  directMessages?: boolean;
};

export type NotificationSettings = {
  notificationsEnabled?: boolean;

  eventReminders?: boolean;
  questUpdates?: boolean;
  factionNews?: boolean;
  friendActivity?: boolean;
  rankChanges?: boolean;

  weeklyNewsletter?: boolean;
  promotionalEvents?: boolean;
};

export type AppearanceSettings = {
  theme?: ThemeMode | string;
  themeMode?: ThemeMode | string;

  accentColor?: string;

  fontSize?: FontSize | string;

  reduceMotion?: boolean;
};

export type DataUsageSettings = {
  wifiOnly?: boolean;
  downloadOverWifiOnly?: boolean;

  autoPlayVideos?: boolean;
  autoplayVideos?: boolean;

  imageQuality?: "Low" | "Medium" | "High" | string;
};

export type BlockedUser = {
  id?: string;
  _id?: string;
  userId?: string;
  username?: string;
  displayName?: string;
  avatar?: string | null;
  avatarUrl?: string | null;
  avatarPhotoUrl?: string | null;
  profilePicture?: string | null;
};

export type HelpSettings = {
  faq?: unknown;
  knowledgeBase?: unknown;
  contactSupport?: unknown;
  reportBug?: unknown;
  termsOfService?: unknown;
  privacyPolicy?: unknown;
  [key: string]: unknown;
};

/* =========================================================
   RESPONSE HELPERS
========================================================= */

function unwrap<T>(response: any, keys: string[] = []): T {
  if (response == null) {
    return response as T;
  }

  if (response.data !== undefined) {
    if (typeof response.data === "object" && response.data !== null) {
      for (const key of keys) {
        if (response.data[key] !== undefined) {
          return response.data[key] as T;
        }
      }
    }

    return response.data as T;
  }

  for (const key of keys) {
    if (response[key] !== undefined) {
      return response[key] as T;
    }
  }

  return response as T;
}

/* =========================================================
   SETTINGS OVERVIEW
========================================================= */

export async function getSettings(token: string) {
  const response = await apiRequest("/api/users/me/settings", {
    method: "GET",
    token,
  });

  return unwrap<SettingsOverview>(response, ["settings"]);
}

/* =========================================================
   ACCOUNT
========================================================= */

export async function getAccountSettings(token: string) {
  const response = await apiRequest("/api/users/me/account", {
    method: "GET",
    token,
  });

  return unwrap<any>(response, ["account", "user"]);
}

export async function updateAccountSettings(
  token: string,
  data: Record<string, unknown>,
) {
  const response = await apiRequest("/api/users/me/account", {
    method: "PATCH",
    token,
    body: data,
  });

  return unwrap<any>(response, ["account", "user"]);
}

/* =========================================================
   PRIVACY
========================================================= */

export async function getPrivacySettings(token: string) {
  const response = await apiRequest("/api/users/me/privacy", {
    method: "GET",
    token,
  });

  return unwrap<PrivacySettings>(response, ["privacy", "settings"]);
}

export async function updatePrivacySettings(
  token: string,
  data: Partial<PrivacySettings>,
) {
  const response = await apiRequest("/api/users/me/privacy", {
    method: "PATCH",
    token,
    body: data,
  });

  return unwrap<PrivacySettings>(response, ["privacy", "settings"]);
}

/* =========================================================
   BLOCKED USERS
========================================================= */

export async function getBlockedUsers(token: string) {
  const response = await apiRequest("/api/users/me/blocked", {
    method: "GET",
    token,
  });

  return unwrap<BlockedUser[]>(response, ["blockedUsers", "users", "blocked"]);
}

/* =========================================================
   NOTIFICATIONS
========================================================= */

export async function getNotificationSettings(token: string) {
  const response = await apiRequest("/api/users/me/preferences/notifications", {
    method: "GET",
    token,
  });

  return unwrap<NotificationSettings>(response, [
    "notifications",
    "preferences",
    "settings",
  ]);
}

export async function updateNotificationSettings(
  token: string,
  data: Partial<NotificationSettings>,
) {
  const response = await apiRequest("/api/users/me/preferences/notifications", {
    method: "PATCH",
    token,
    body: data,
  });

  return unwrap<NotificationSettings>(response, [
    "notifications",
    "preferences",
    "settings",
  ]);
}

/* =========================================================
   DEVICES
========================================================= */

export async function registerDevice(
  token: string,
  data: Record<string, unknown>,
) {
  const response = await apiRequest("/api/users/me/devices", {
    method: "POST",
    token,
    body: data,
  });

  return unwrap<any>(response, ["device"]);
}

/* =========================================================
   APPEARANCE
========================================================= */

export async function getAppearanceSettings(token: string) {
  const response = await apiRequest("/api/users/me/appearance", {
    method: "GET",
    token,
  });

  return unwrap<AppearanceSettings>(response, ["appearance", "settings"]);
}

export async function updateAppearanceSettings(
  token: string,
  data: Partial<AppearanceSettings>,
) {
  const response = await apiRequest("/api/users/me/appearance", {
    method: "PATCH",
    token,
    body: data,
  });

  return unwrap<AppearanceSettings>(response, ["appearance", "settings"]);
}

/* =========================================================
   DATA USAGE
========================================================= */

export async function getDataUsageSettings(token: string) {
  const response = await apiRequest("/api/users/me/data-usage", {
    method: "GET",
    token,
  });

  return unwrap<DataUsageSettings>(response, [
    "dataUsage",
    "dataUsageSettings",
    "settings",
  ]);
}

export async function updateDataUsageSettings(
  token: string,
  data: Partial<DataUsageSettings>,
) {
  const response = await apiRequest("/api/users/me/data-usage", {
    method: "PATCH",
    token,
    body: data,
  });

  return unwrap<DataUsageSettings>(response, [
    "dataUsage",
    "dataUsageSettings",
    "settings",
  ]);
}

/* =========================================================
   HELP
========================================================= */

export async function getHelpSettings(token: string) {
  const response = await apiRequest("/api/users/me/help", {
    method: "GET",
    token,
  });

  return unwrap<HelpSettings>(response, ["help", "support"]);
}

/* =========================================================
   SUPPORT REQUEST
========================================================= */

export async function createSupportRequest(
  token: string,
  data: Record<string, unknown>,
) {
  const response = await apiRequest("/api/users/me/support-requests", {
    method: "POST",
    token,
    body: data,
  });

  return unwrap<any>(response, ["supportRequest", "request"]);
}

/* =========================================================
   CONTACT
========================================================= */

export async function getContactSettings(token: string) {
  const response = await apiRequest("/api/users/me/contact", {
    method: "GET",
    token,
  });

  return unwrap<any>(response, ["contact"]);
}

export async function updateContactSettings(
  token: string,
  data: Record<string, unknown>,
) {
  const response = await apiRequest("/api/users/me/contact", {
    method: "PATCH",
    token,
    body: data,
  });

  return unwrap<any>(response, ["contact"]);
}

/* =========================================================
   LOCATION
========================================================= */

export async function updateLocationPreference(
  token: string,
  data: Record<string, unknown>,
) {
  const response = await apiRequest("/api/users/me/preferences/location", {
    method: "PATCH",
    token,
    body: data,
  });

  return unwrap<any>(response, ["location", "preferences"]);
}

/* =========================================================
   LOGOUT
========================================================= */

export async function logoutUser(token: string) {
  return apiRequest("/api/auth/logout", {
    method: "POST",
    token,
  });
}
