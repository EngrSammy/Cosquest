// ==========================================
// THIS PHONE'S PUSH TOKEN (Emmanuel's PUSH.md)
// ==========================================
//   POST   /api/users/me/devices { pushToken, platform }   (signed in)
//   DELETE /api/users/me/devices/:pushToken                (on sign-out)
// The token this phone registered is remembered, so sign-out can remove it
// (before the session ends) and a new token replaces the old one.
import { Platform } from "react-native";

import { apiRequest } from "@/services/api";
import { getPref, setPref } from "@/utils/prefsStorage";

const KEY = "push:registeredToken";

export async function registerThisPhone(pushToken: string, token: string) {
  const previous = await getPref(KEY);
  if (previous === pushToken) return;
  await apiRequest("/api/users/me/devices", { method: "POST", token, body: { pushToken, platform: Platform.OS } });
  await setPref(KEY, pushToken);
}

/** Sign-out: this phone stops getting this account's pushes. Never throws. */
export async function unregisterThisPhone(token: string | null | undefined) {
  if (Platform.OS === "web" || !token) return;
  try {
    const pushToken = await getPref(KEY);
    if (!pushToken) return;
    await apiRequest(`/api/users/me/devices/${encodeURIComponent(pushToken)}`, { method: "DELETE", token });
  } catch {
    // Signing out carries on either way.
  } finally {
    await setPref(KEY, null);
  }
}
