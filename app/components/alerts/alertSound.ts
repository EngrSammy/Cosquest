// PHONES: the "alerts" notification channel (high importance, sound on), and
// the alert's own sound and vibration while the app is open.
import * as Notifications from "expo-notifications";
import { Platform, Vibration } from "react-native";

export async function ensureAlertChannel() {
  if (Platform.OS !== "android") return;
  try {
    await Notifications.setNotificationChannelAsync("alerts", {
      name: "Faction alerts",
      importance: Notifications.AndroidImportance.MAX,
      sound: "default",
      vibrationPattern: [0, 500, 250, 500, 250, 900],
      lightColor: "#E5484D",
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  } catch {}
}

export function playAlert(title: string, body: string, alertId: string) {
  Vibration.vibrate([0, 500, 250, 500, 250, 900]);
  Notifications.scheduleNotificationAsync({
    content: { title, body, sound: "default", data: { type: "faction_alert", alertId } },
    trigger: Platform.OS === "android" ? ({ channelId: "alerts" } as any) : null,
  }).catch(() => {});
}
