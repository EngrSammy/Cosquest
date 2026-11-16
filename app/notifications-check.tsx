// ==========================================
// NOTIFICATIONS CHECK (Settings > Notifications check)
// ==========================================
// Shows, in plain words, each piece calls and message notifications need,
// and tests them:
//   - on this phone only: a test notification, a test call (the phone's own
//     call screen; lock the phone while it waits)
//   - from the server: a real message push and a real ringing call
// So "nothing works" becomes "this piece is red".
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useInk } from "@/constants/chatTheme";
import { FONTS } from "@/constants/fonts";
import { apiRequest } from "@/services/api";
import { useAppSelector } from "@/store/hooks";
import { currentVoipToken, registerCallsNow, registerThisPhone } from "@/utils/pushDevice";

const PINK = "#C34D9C";
const PROJECT_ID = (Constants.expoConfig as any)?.extra?.eas?.projectId || (Constants as any).easConfig?.projectId || "4cb596a0-3a90-4c2d-b8f7-2e090efcd80f";

type Line = { ok: boolean | null; title: string; detail: string };

const short = (value: string) => (value.length > 18 ? `${value.slice(0, 10)}…${value.slice(-6)}` : value);
const messageOf = (error: any) => String(error?.message || error || "Unknown error").slice(0, 220);

export default function NotificationsCheck() {
  const ink = useInk();
  const insets = useSafeAreaInsets();
  const token = useAppSelector((state) => state.auth.token);
  const [lines, setLines] = useState<Line[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const run = useCallback(async () => {
    const out: Line[] = [];
    // 1. The app itself.
    const expoGo = Constants.appOwnership === "expo";
    out.push({ ok: !expoGo, title: "Installed CosQuest app", detail: expoGo ? "This is Expo Go: calls and notifications only work in the installed app (the APK)." : `Version ${Constants.expoConfig?.version || "?"}` });
    // 2. Permission.
    const perm = await Notifications.getPermissionsAsync().catch(() => null);
    const granted = perm?.status === "granted";
    out.push({ ok: granted, title: "Notifications allowed", detail: granted ? "Yes" : "No: tap \"Allow\" below (or allow them in the phone's settings)." });
    // 3. Message token (Expo, needs Firebase on Android).
    let pushToken: string | null = null;
    if (granted) {
      try {
        pushToken = (await Notifications.getExpoPushTokenAsync({ projectId: PROJECT_ID })).data;
        out.push({ ok: true, title: "Message token", detail: short(pushToken) });
      } catch (error) {
        out.push({ ok: false, title: "Message token", detail: `Couldn't get one: ${messageOf(error)}` });
      }
    } else out.push({ ok: null, title: "Message token", detail: "Needs notifications allowed first." });
    // 4. Saved on the server.
    if (pushToken && token) {
      try {
        await registerThisPhone(pushToken, token, { force: true });
        out.push({ ok: true, title: "Saved on the server", detail: "This phone gets your notifications." });
      } catch (error) {
        out.push({ ok: false, title: "Saved on the server", detail: `The server refused it: ${messageOf(error)}` });
      }
    } else out.push({ ok: null, title: "Saved on the server", detail: token ? "Needs the message token first." : "Sign in first." });
    // 5. Call token (the phone's own call screen).
    const voip = currentVoipToken();
    out.push({ ok: !!voip, title: "Call token", detail: voip ? `${voip.type} · ${short(voip.token)}` : "None yet: calls can't ring this phone. (Reopen the app; on Android it needs Google Play services.)" });
    if (voip && pushToken && token) {
      try {
        const saved = await registerCallsNow(token, { force: true });
        out.push({ ok: saved, title: "Call token saved on the server", detail: saved ? "Calls can ring this phone." : "Not saved: the message token must be saved first." });
      } catch (error) {
        out.push({ ok: false, title: "Call token saved on the server", detail: `The server refused it: ${messageOf(error)}` });
      }
    }
    // 6. Android settings the app can't read.
    if (Platform.OS === "android") {
      out.push({ ok: null, title: "Full-screen calls (Android 14+)", detail: "Settings > Apps > CosQuest: allow \"Full screen notifications\" (or \"Display over other apps\"), so calls fill the screen when it's locked." });
      out.push({ ok: null, title: "Battery", detail: "Settings > Apps > CosQuest > Battery: \"Unrestricted\", or calls may not ring when the app is closed." });
    }
    setLines(out);
  }, [token]);

  useEffect(() => {
    if (Platform.OS !== "web") run();
  }, [run]);

  const allow = async () => {
    const result = await Notifications.requestPermissionsAsync().catch(() => null);
    if (result?.status !== "granted") Linking.openSettings().catch(() => {});
    run();
  };

  const localNotification = async () => {
    setBusy("note");
    try {
      await Notifications.scheduleNotificationAsync({
        content: { title: "CosQuest test", body: "If you can read this, notifications show on this phone.", sound: "default" },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 5, channelId: "messages" } as any,
      });
      setNote("A test notification arrives in 5 seconds. Leave the app (or lock the phone) to see it.");
    } catch (error) {
      setNote(`Couldn't show it: ${messageOf(error)}`);
    } finally {
      setBusy(null);
    }
  };

  const localCall = async () => {
    setBusy("call");
    setNote("A test call rings in 10 seconds: lock the phone now. Answer or decline it; nothing is sent to anyone.");
    setTimeout(async () => {
      try {
        const Calls = require("expo-callkit-telecom");
        await Calls.reportIncomingCall({
          eventId: `test-${Date.now()}`,
          serverCallId: `test-${Date.now()}`,
          caller: { id: "cosquest-test", displayName: "CosQuest test call" },
          hasVideo: false,
        });
        // A test: it stops by itself after 20 seconds.
        setTimeout(async () => {
          const session = await Calls.getActiveCallSession().catch(() => null);
          if (session?.incomingCallEvent?.serverCallId?.startsWith("test-")) Calls.reportCallEnded(session.id, "remoteEnded").catch(() => {});
        }, 20000);
      } catch (error) {
        setNote(`The phone's call screen couldn't open: ${messageOf(error)}`);
      } finally {
        setBusy(null);
      }
    }, 10000);
  };

  const serverTest = async (kind: "message" | "call") => {
    if (!token) return;
    setBusy(`server-${kind}`);
    try {
      const result: any = await apiRequest("/api/users/me/push-test", { method: "POST", token, body: { kind } });
      setNote(
        kind === "call"
          ? `The server is ringing this phone in ${result?.delaySeconds ?? 10} seconds: lock it now. ${result?.detail || ""}`
          : `The server sent a message push. ${result?.detail || ""}`,
      );
    } catch (error: any) {
      setNote(error?.status === 404 ? "The server test isn't installed yet (Emmanuel's part)." : `The server couldn't send it: ${messageOf(error)}`);
    } finally {
      setBusy(null);
    }
  };

  const text = (light: string) => ink.text(light);
  const button = (label: string, key: string, onPress: () => void, primary = false) => (
    <Pressable key={key} onPress={onPress} disabled={!!busy} accessibilityRole="button" style={{ height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: primary ? PINK : ink.dark ? "#262838" : "#FFFFFF", borderWidth: primary ? 0 : 1, borderColor: ink.dark ? "#34374A" : "#E3E7EF", opacity: busy && busy !== key ? 0.5 : 1 }}>
      {busy === key ? <ActivityIndicator color={primary ? "#FFFFFF" : PINK} /> : <Text style={{ fontFamily: FONTS.semibold, fontSize: 14.5, color: primary ? "#FFFFFF" : text("#24283C") }}>{label}</Text>}
    </Pressable>
  );

  return (
    <ScrollView style={{ flex: 1, backgroundColor: ink.dark ? "#14151F" : "#F4F8FD" }} contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 18, paddingBottom: insets.bottom + 40, gap: 14 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={24} color={text("#24283C")} />
        </Pressable>
        <Text style={{ fontFamily: FONTS.bold, fontSize: 20, color: text("#24283C") }}>Notifications check</Text>
      </View>

      {Platform.OS === "web" ? (
        <Text style={{ fontFamily: FONTS.regular, fontSize: 14, color: text("#66738A") }}>Open this page in the CosQuest app on your phone.</Text>
      ) : !lines ? (
        <ActivityIndicator color={PINK} style={{ marginTop: 30 }} />
      ) : (
        <>
          <View style={{ borderRadius: 18, padding: 6, backgroundColor: ink.dark ? "#1F2130" : "#FFFFFF" }}>
            {lines.map((line, i) => (
              <View key={i} style={{ flexDirection: "row", gap: 12, padding: 12, borderTopWidth: i ? 1 : 0, borderTopColor: ink.dark ? "#2A2C3D" : "#EEF1F6" }}>
                <Ionicons name={line.ok === true ? "checkmark-circle" : line.ok === false ? "close-circle" : "information-circle"} size={22} color={line.ok === true ? "#1D9A6C" : line.ok === false ? "#D9364F" : "#B26B12"} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: FONTS.semibold, fontSize: 14.5, color: text("#24283C") }}>{line.title}</Text>
                  <Text selectable style={{ marginTop: 2, fontFamily: FONTS.regular, fontSize: 13, lineHeight: 18, color: text("#66738A") }}>{line.detail}</Text>
                </View>
              </View>
            ))}
          </View>

          {note ? <Text selectable style={{ fontFamily: FONTS.medium, fontSize: 13.5, lineHeight: 19, color: PINK }}>{note}</Text> : null}

          <Text style={{ marginTop: 4, fontFamily: FONTS.semibold, fontSize: 13, color: text("#66738A") }}>ON THIS PHONE</Text>
          {lines.some((l) => l.title === "Notifications allowed" && !l.ok) ? button("Allow notifications", "allow", allow, true) : null}
          {button("Show a test notification (5 s)", "note", localNotification)}
          {button("Ring me with a test call (10 s)", "call", localCall)}

          <Text style={{ marginTop: 4, fontFamily: FONTS.semibold, fontSize: 13, color: text("#66738A") }}>FROM THE SERVER (THE REAL THING)</Text>
          {button("Send me a message push", "server-message", () => serverTest("message"))}
          {button("Ring me from the server (10 s)", "server-call", () => serverTest("call"), true)}

          {Platform.OS === "android" ? button("Open CosQuest's phone settings", "settings", () => Linking.openSettings().catch(() => {})) : null}
          {button("Check again", "again", () => run())}
        </>
      )}
    </ScrollView>
  );
}
