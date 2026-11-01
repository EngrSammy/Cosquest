// ==========================================
// "TURN ON NOTIFICATIONS" POPUP (phones)
// ==========================================
// Shows after sign-in (once the home page has loaded) when either:
//   - the account's notifications are off (preferences.notificationsEnabled
//     false: often tapped "Not now" at sign-up), or
//   - the phone hasn't allowed CosQuest's notifications.
// "Turn on" asks the phone (or opens its settings if it was refused for
// good) and switches the account back on, so calls and messages arrive.
// "Not now" asks again in 3 days. Never on the website (no push there).
import { Ionicons } from "@expo/vector-icons";
import * as Notifications from "expo-notifications";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, Linking, Modal, Pressable, Text, View } from "react-native";

import { useInk } from "@/constants/chatTheme";
import { FONTS } from "@/constants/fonts";
import { updateNotificationSettings } from "@/services/settings";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { fetchCurrentUser } from "@/store/thunks/userThunks";
import { getPref, setPref } from "@/utils/prefsStorage";

const PINK = "#C34D9C";
const SNOOZE_DAYS = 3;

export default function NotificationPrompt() {
  const ink = useInk();
  const dispatch = useAppDispatch();
  const token = useAppSelector((state) => state.auth.token);
  const authUser = useAppSelector((state) => state.auth.user) as any;
  const user = useAppSelector((state) => state.user.user) as any;
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(false); // refused for good: only the phone's settings can allow it
  const shownThisLaunch = useRef(false);
  const owner = String(user?.profile?.username || authUser?.email || "me").toLowerCase();
  const snoozeKey = `notif_prompt_${owner}`.slice(0, 100);

  // Is anything stopping notifications right now?
  const needed = useCallback(async () => {
    if (!token || !user || user.onboardingComplete === false) return false;
    const accountOff = user?.preferences?.notificationsEnabled === false;
    const { status } = await Notifications.getPermissionsAsync().catch(() => ({ status: "undetermined" as const }));
    return accountOff || status !== "granted";
  }, [token, user]);

  useEffect(() => {
    if (shownThisLaunch.current || !token || !user) return;
    let alive = true;
    const timer = setTimeout(async () => {
      try {
        if (!(await needed())) return;
        const until = Number(await getPref(snoozeKey)) || 0;
        if (Date.now() < until || !alive) return;
        shownThisLaunch.current = true;
        setVisible(true);
      } catch {}
    }, 2500); // after the home page has appeared
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [token, user, needed, snoozeKey]);

  // Back from the phone's settings: close if it's now allowed.
  useEffect(() => {
    if (!visible) return;
    const sub = AppState.addEventListener("change", async (state) => {
      if (state !== "active") return;
      const { status } = await Notifications.getPermissionsAsync().catch(() => ({ status: "undetermined" as const }));
      if (status === "granted") await finish();
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // The account's switch on (PushRegistration then registers this phone).
  const finish = async () => {
    try {
      if (token && user?.preferences?.notificationsEnabled === false) {
        await updateNotificationSettings(token, { notificationsEnabled: true });
        if (authUser?.email) dispatch(fetchCurrentUser(authUser.email));
      }
    } catch {}
    setVisible(false);
    setBusy(false);
  };

  const turnOn = async () => {
    setBusy(true);
    try {
      let { status, canAskAgain } = await Notifications.getPermissionsAsync();
      if (status !== "granted" && canAskAgain) ({ status, canAskAgain } = await Notifications.requestPermissionsAsync());
      if (status === "granted") return finish();
      // Refused for good: only the phone's settings can allow it now.
      setBlocked(true);
      setBusy(false);
      Linking.openSettings().catch(() => {});
    } catch {
      setBusy(false);
    }
  };

  const notNow = () => {
    setVisible(false);
    setPref(snoozeKey, String(Date.now() + SNOOZE_DAYS * 86400e3)).catch(() => {});
  };

  if (!visible) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={notNow}>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: "rgba(0,0,0,0.5)" }}>
        <View style={{ width: "100%", maxWidth: 380, padding: 24, borderRadius: 28, alignItems: "center", backgroundColor: ink.dark ? "#1F2130" : "#FFFFFF" }}>
          <View style={{ width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center", backgroundColor: ink.dark ? "#3A2440" : "#FBEAF3" }}>
            <Ionicons name="notifications" size={36} color={PINK} />
          </View>
          <Text style={{ marginTop: 16, textAlign: "center", fontFamily: FONTS.bold, fontSize: 20, color: ink.text("#24283C") }}>Don't miss calls and messages</Text>
          <Text style={{ marginTop: 8, textAlign: "center", fontFamily: FONTS.regular, fontSize: 14, lineHeight: 20, color: ink.text("#66738A") }}>
            {blocked
              ? "Notifications are blocked for CosQuest on this phone. In the settings that just opened, tap Notifications and turn them on, then come back."
              : "Turn on notifications to know when friends call or message you, when your ticket is ready, and when a quest starts near you."}
          </Text>
          <View style={{ alignSelf: "stretch", gap: 4, marginTop: 16 }}>
            {[
              ["call", "Incoming calls"],
              ["chatbubble-ellipses", "New messages"],
              ["ticket", "Tickets and quest reminders"],
            ].map(([icon, label]) => (
              <View key={label} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 4 }}>
                <Ionicons name={icon as any} size={18} color={PINK} />
                <Text style={{ fontFamily: FONTS.medium, fontSize: 14, color: ink.text("#24283C") }}>{label}</Text>
              </View>
            ))}
          </View>
          <Pressable
            onPress={blocked ? () => Linking.openSettings().catch(() => {}) : turnOn}
            disabled={busy}
            accessibilityRole="button"
            style={{ marginTop: 20, alignSelf: "stretch", height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", backgroundColor: PINK }}>
            {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={{ fontFamily: FONTS.bold, fontSize: 16, color: "#FFFFFF" }}>{blocked ? "Open settings" : "Turn on notifications"}</Text>}
          </Pressable>
          <Pressable onPress={notNow} hitSlop={8} style={{ marginTop: 14 }} accessibilityRole="button">
            <Text style={{ fontFamily: FONTS.semibold, fontSize: 14, color: ink.text("#7A8296") }}>Not now</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
