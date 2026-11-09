// The alert on screen (one at a time; a newer one replaces it).
import { useSyncExternalStore } from "react";

import { getFactionAlert, type FactionAlert } from "@/services/alerts";
import { store } from "@/store/store";

let current: FactionAlert | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

// socket "alert:faction" (the alert object).
export function showFactionAlert(alert: any) {
  if (!alert?.alertId) return;
  current = alert as FactionAlert;
  emit();
}

// A tapped push ({ type: "faction_alert", alertId }).
export async function showFactionAlertById(alertId: string) {
  const token = (store.getState() as any).auth?.token as string | null;
  if (!token || !alertId) return;
  try {
    const { alert } = await getFactionAlert(alertId, token);
    showFactionAlert(alert);
  } catch {
    // Expired or not for this person: nothing to show.
  }
}

export function dismissFactionAlert() {
  current = null;
  emit();
}

export function useFactionAlert() {
  return useSyncExternalStore(subscribe, () => current, () => current);
}
