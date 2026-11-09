// ==========================================
// PUSH NOTIFICATIONS: register this phone (Emmanuel's PUSH.md)
// ==========================================
// Once signed in (and notifications aren't switched off in settings):
//   1. The Android channels the server sends to: default, messages, calls,
//      game, alerts.
//   2. Notification permission (asked once; not again if refused).
//   3. This phone's Expo push token -> POST /api/users/me/devices, and again
//      whenever the token changes.
// Sign-out removes it (utils/pushDevice.ts). Mounted once in app/_layout.tsx.
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { useEffect } from "react";
import { Platform } from "react-native";

import { useAppSelector } from "@/store/hooks";
import { registerThisPhone } from "@/utils/pushDevice";

const PROJECT_ID =
  (Constants.expoConfig as any)?.extra?.eas?.projectId || (Constants as any).easConfig?.projectId || "4cb596a0-3a90-4c2d-b8f7-2e090efcd80f";

async function createChannels() {
  if (Platform.OS !== "android") return;
  const channels: [string, string, Notifications.AndroidImportance][] = [
    ["default", "Activity", Notifications.AndroidImportance.HIGH],
    ["messages", "Messages", Notifications.AndroidImportance.HIGH],
    ["calls", "Calls", Notifications.AndroidImportance.MAX],
    ["game", "Game", Notifications.AndroidImportance.HIGH],
    ["alerts", "Faction alerts", Notifications.AndroidImportance.MAX],
  ];
  await Promise.all(
    channels.map(([id, name, importance]) =>
      Notifications.setNotificationChannelAsync(id, {
        name,
        importance,
        sound: "default",
        vibrationPattern: id === "alerts" ? [0, 500, 250, 500, 250, 900] : [0, 250, 150, 250],
        lightColor: "#C34D9C",
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      }).catch(() => {}),
    ),
  );
}

async function pushTokenIfAllowed(): Promise<string | null> {
  let { status, canAskAgain } = await Notifications.getPermissionsAsync();
  if (status !== "granted" && canAskAgain) {
    ({ status } = await Notifications.requestPermissionsAsync());
  }
  if (status !== "granted") return null;
  const { data } = await Notifications.getExpoPushTokenAsync({ projectId: PROJECT_ID });
  return data || null;
}

export default function PushRegistration() {
  const token = useAppSelector((state) => state.auth.token);
  const notificationsOn = useAppSelector((state) => (state.user.user as any)?.preferences?.notificationsEnabled !== false);

  useEffect(() => {
    createChannels();
  }, []);

  useEffect(() => {
    if (!token || !notificationsOn) return;
    let cancelled = false;
    (async () => {
      try {
        const pushToken = await pushTokenIfAllowed();
        if (pushToken && !cancelled) await registerThisPhone(pushToken, token);
      } catch (error) {
        // Most often: Firebase isn't set up in this build yet (google-services.json).
        console.warn("Push registration skipped:", (error as any)?.message || error);
      }
    })();
    // A new token (rare): register it too.
    const subscription = Notifications.addPushTokenListener(async () => {
      try {
        const pushToken = await pushTokenIfAllowed();
        if (pushToken) await registerThisPhone(pushToken, token);
      } catch {}
    });
    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, [token, notificationsOn]);

  return null;
}
