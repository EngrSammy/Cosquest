// Incoming links and the badge, mounted once at the root (task 059).
// Team sync (3 Nov 2026): the push token and notification taps are the chat
// app's own now (components/PushRegistration.tsx registers the phone with
// /api/users/me/devices, components/PushTapHandler.tsx opens a tapped push
// via utils/openFromNotification). Game play links in a push are left to
// GameBridge. What stays here:
//   - A link (cosquest://..., the website's https links) that arrives while
//     signed out waits and opens after sign-in.
//   - The app badge = unread chats + unread notifications.
import * as Linking from "expo-linking";
import { router } from "expo-router";
import { useEffect, useRef } from "react";

import { routeForUrl } from "@/features/world/links";
import { setBadge } from "@/services/push";
import { useAppSelector } from "@/store/hooks";

let waiting: string | null = null;

export default function PushBridge() {
  const token = useAppSelector((state) => state.auth.token);
  const chats = useAppSelector((state) => state.chat.conversations);
  const unreadNotifications = useAppSelector((state) => state.notification.unreadCount);
  const signedIn = useRef(false);
  signedIn.current = !!token;

  // ---------- after sign-in, the link that was waiting ----------
  useEffect(() => {
    if (token && waiting) {
      const route = waiting;
      waiting = null;
      // Let the signed-in screens mount first.
      const t = setTimeout(() => router.push(route as any), 600);
      return () => clearTimeout(t);
    }
  }, [token]);

  // ---------- links that arrive while signed out ----------
  useEffect(() => {
    const sub = Linking.addEventListener("url", ({ url }) => {
      const route = routeForUrl(url);
      // Signed in, expo-router opens it itself (app/+native-intent.tsx).
      if (route && !signedIn.current) waiting = route;
    });
    void Linking.getInitialURL().then((url) => {
      const route = routeForUrl(url);
      if (route && !signedIn.current) waiting = route;
    });
    return () => sub.remove();
  }, []);

  // ---------- badge ----------
  const unreadChats = chats.reduce((n, c: any) => n + Math.max(0, Math.floor(Number(c?.unreadCount) || 0)), 0);
  const badge = token ? unreadChats + (unreadNotifications || 0) : 0;
  useEffect(() => {
    void setBadge(badge);
  }, [badge]);

  return null;
}
