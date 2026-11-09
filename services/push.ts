// Phone push notifications (task 059): the Expo push token after the person
// allows notifications, registered with the chat backend through the
// existing register-device thunk; the foreground handler; where a tap goes;
// the app badge. Mounted by components/PushBridge.tsx.
//
// The token needs the EAS project id (app.json extra.eas.projectId) and, on
// Android, Firebase (google-services.json). Without them getting a token
// fails quietly and the app works as before (in-app notifications only).
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { getPref, setPref } from "@/utils/prefsStorage";

import { apiRequest } from "./api";
import { openChatId } from "./chatFocus";

const TOKEN_PREF = "push.token";

let handlerSet = false;

/** Show pushes while the app is open, except for the chat already on screen. */
export function setForegroundHandler() {
  if (handlerSet || Platform.OS === "web") return;
  handlerSet = true;
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const data = (notification.request.content.data ?? {}) as Record<string, unknown>;
      const here = typeof data.conversationId === "string" && data.conversationId === openChatId();
      return {
        shouldShowBanner: !here,
        shouldShowList: !here,
        shouldPlaySound: !here,
        shouldSetBadge: true,
      };
    },
  });
}

/** The Expo push token, if notifications are allowed and this build can get one. */
export async function getPushToken(): Promise<string | null> {
  if (Platform.OS === "web") return null;
  try {
    const perm = await Notifications.getPermissionsAsync();
    if (!perm.granted) return null;
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "Messages and game",
        importance: Notifications.AndroidImportance.HIGH,
      });
    }
    const projectId = (Constants.expoConfig?.extra as any)?.eas?.projectId ?? (Constants as any).easConfig?.projectId;
    if (!projectId) return null;
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    return data || null;
  } catch {
    // No Firebase config on Android, no APNs entitlement, a simulator: no push.
    return null;
  }
}

export async function rememberedPushToken(): Promise<string | null> {
  return getPref(TOKEN_PREF);
}

export async function rememberPushToken(token: string | null) {
  await setPref(TOKEN_PREF, token ?? "");
}

/** Signing out: the backend forgets this phone (servers without the route just say 404). */
export async function forgetPushToken(authToken: string | null) {
  const pushToken = await rememberedPushToken();
  if (!pushToken || !authToken) return;
  try {
    await apiRequest("/api/users/me/devices", { method: "DELETE", token: authToken, body: { pushToken } });
  } catch {
    // an older server: the token is moved on the next sign-in anyway
  }
  await rememberPushToken(null);
}

export async function setBadge(count: number) {
  if (Platform.OS === "web") return;
  try {
    await Notifications.setBadgeCountAsync(Math.max(0, Math.floor(count)));
  } catch {
    // launchers without badges
  }
}
