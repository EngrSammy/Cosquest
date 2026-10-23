// ==========================================
// TAPPING A PUSH NOTIFICATION (phones)
// ==========================================
// Opens what it's about (data from the backend's src/utils/push.js):
//   scheduled-call  -> Call details        { scheduledCallId }
//   message / mention / group -> the chat  { chatId }
//   follow          -> Notifications
//   call            -> nothing here (the ringing screen handles calls)
// Also when the tap launched the app (after login is restored).
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { useEffect, useRef } from "react";

import { useAppSelector } from "@/store/hooks";

function openFrom(data: any) {
  if (!data || typeof data !== "object") return;
  if (data.type === "scheduled-call" && data.scheduledCallId) {
    router.push({ pathname: "/group/scheduled-call/[callId]", params: { callId: String(data.scheduledCallId) } });
  } else if (data.chatId && data.type !== "call") {
    router.push({ pathname: "/chat/[id]", params: { id: String(data.chatId) } });
  } else if (data.type === "follow") {
    router.push("/notifications");
  }
}

export default function PushTapHandler() {
  const token = useAppSelector((state) => state.auth.token);
  const handled = useRef(new Set<string>());
  const pending = useRef<any>(null);

  const handle = (response: Notifications.NotificationResponse | null) => {
    if (!response) return;
    const id = response.notification.request.identifier;
    if (handled.current.has(id)) return;
    handled.current.add(id);
    const data = response.notification.request.content.data;
    // Not signed in yet (app just launched): open it once login is restored.
    if (!token) pending.current = data;
    else openFrom(data);
  };

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(handle);
    Notifications.getLastNotificationResponseAsync().then(handle).catch(() => {});
    return () => subscription.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (!token || !pending.current) return;
    const data = pending.current;
    pending.current = null;
    // Let the first screen mount before navigating.
    const timer = setTimeout(() => openFrom(data), 300);
    return () => clearTimeout(timer);
  }, [token]);

  return null;
}
