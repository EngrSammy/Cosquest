// ==========================================
// IN-APP BANNERS - the queue
// ==========================================
// The backend sends a "banner" socket event instead of a push while the app
// is open (Emmanuel, "In-App Notification Banners"). hooks/useSocketConnection
// passes each one here; InAppBanner shows them one after another.
import { useSyncExternalStore } from "react";

export type Banner = {
  id: string;
  title: string | null;
  body: string;
  data: Record<string, any>;
  channel?: string;
  actor: { id?: string; username?: string | null; name?: string | null; avatarKey?: string | null; avatarPhotoUrl?: string | null } | null;
  at?: string;
};

let queue: Banner[] = [];
const seen = new Set<string>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function pushBanner(raw: any) {
  if (!raw?.body && !raw?.title) return;
  const id = String(raw.id || `${Date.now()}-${Math.random()}`);
  if (seen.has(id)) return;
  seen.add(id);
  if (seen.size > 200) seen.clear();
  // Calls ring on their own screen.
  if (raw?.data?.type === "call") return;
  queue = [...queue, { id, title: raw.title ?? null, body: String(raw.body || ""), data: raw.data || {}, channel: raw.channel, actor: raw.actor || null, at: raw.at }].slice(-5);
  emit();
}

export function dismissBanner(id: string) {
  queue = queue.filter((banner) => banner.id !== id);
  emit();
}

export function useCurrentBanner(): Banner | null {
  return useSyncExternalStore(subscribe, () => queue[0] || null, () => queue[0] || null);
}
