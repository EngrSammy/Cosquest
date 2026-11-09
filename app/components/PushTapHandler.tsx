// ==========================================
// PUSH NOTIFICATIONS ON THE PHONE: shown while open, and tapped
// ==========================================
// 1. While the app is open, a push that still arrives (game events; the
//    backend sends banners instead of pushes for the rest) is shown as a
//    system banner instead of being received silently.
// 2. Tapping a push - also one that opened the app from closed - opens what
//    it's about (utils/openFromNotification), once login is restored.
import * as Notifications from "expo-notifications";
import { useEffect, useRef } from "react";

import { openChatId } from "@/services/chatFocus";
import { useAppSelector } from "@/store/hooks";
import { openFromNotification } from "@/utils/openFromNotification";
import { getPref, setPref } from "@/utils/prefsStorage";
import { ensureAlertChannel } from "@/components/alerts/alertSound";

// Faction alerts: their own high-importance channel on Android.
ensureAlertChannel();

// Show pushes while the app is open (once, at startup).
// Merged app (team sync, 3 Nov 2026): no banner or sound for the chat that is
// open on screen (services/chatFocus, set by app/chat/[id].tsx).
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = (notification.request.content.data ?? {}) as Record<string, unknown>;
    const chat = data.chatId ?? data.conversationId;
    const here = typeof chat === "string" && chat === openChatId();
    return {
      shouldShowBanner: !here,
      shouldShowList: !here,
      shouldShowAlert: !here,
      shouldPlaySound: !here,
      shouldSetBadge: false,
    } as any;
  },
});

// The OS can hand the same "opened from a notification" back on later
// launches; the last one handled is remembered so it opens once.
const HANDLED_PREF = "push.lastHandled";

export default function PushTapHandler() {
  const token = useAppSelector((state) => state.auth.token);
  const handled = useRef(new Set<string>());
  const pending = useRef<any>(null);

  const handle = (response: Notifications.NotificationResponse | null) => {
    if (!response) return;
    const id = response.notification.request.identifier;
    if (handled.current.has(id)) return;
    handled.current.add(id);
    void setPref(HANDLED_PREF, id);
    const data = response.notification.request.content.data;
    // Not signed in yet (app just launched): open it once login is restored.
    if (!token) pending.current = data;
    else openFromNotification(data, null, { fromPush: true });
  };

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(handle);
    Notifications.getLastNotificationResponseAsync()
      .then(async (response) => {
        const id = response?.notification.request.identifier;
        if (!id || (await getPref(HANDLED_PREF)) === id) return;
        handle(response);
      })
      .catch(() => {});
    return () => subscription.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (!token || !pending.current) return;
    const data = pending.current;
    pending.current = null;
    // Let the first screen mount before navigating.
    const timer = setTimeout(() => openFromNotification(data, null, { fromPush: true }), 300);
    return () => clearTimeout(timer);
  }, [token]);

  return null;
}
