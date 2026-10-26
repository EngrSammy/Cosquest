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

import { useAppSelector } from "@/store/hooks";
import { openFromNotification } from "@/utils/openFromNotification";

// Show pushes while the app is open (once, at startup).
Notifications.setNotificationHandler({
  handleNotification: async () =>
    ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }) as any,
});

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
    else openFromNotification(data);
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
    const timer = setTimeout(() => openFromNotification(data), 300);
    return () => clearTimeout(timer);
  }, [token]);

  return null;
}
