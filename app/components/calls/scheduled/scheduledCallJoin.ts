// ==========================================
// JOINING A SCHEDULED CALL (app-wide state)
// ==========================================
// Emmanuel's backend gives each scheduled call its own audio room:
//   POST /api/scheduled-calls/:id/join { passcode }
//     -> { status: "ready", token, livekitUrl, videoEnabled }
//     -> 202 { status: "waiting" }   (waiting room on: the host lets you in)
//   socket "scheduled-call:admission" { callId, status: admitted | denied }
//   socket "scheduled-call:waiting"   { callId, userId }  (to the host)
//   POST /api/scheduled-calls/:id/admission/:userId { status }  (host)
// The session is shown by ScheduledCallLayer (app/_layout.tsx): the
// waiting room while waiting, the call screen once connected.
import { useSyncExternalStore } from "react";
import { Alert } from "react-native";

import {
  admitToScheduledCall,
  getScheduledCall,
  joinScheduledCallRequest,
  messageOf,
  type ScheduledCall,
} from "@/services/scheduledCalls";
import { scheduledCallUpdated } from "@/store/slices/scheduledCallSlice";
import { store } from "@/store/store";

export type ScheduledSession =
  | { phase: "waiting"; call: ScheduledCall; since: number }
  | { phase: "connected"; call: ScheduledCall; token: string; livekitUrl: string; videoEnabled: boolean };

let session: ScheduledSession | null = null;
let minimized = false;
let busy = false;
// Host: people waiting to be let in, per call.
let waiting: Record<string, string[]> = {};

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const authToken = () => (store.getState() as any).auth?.token as string | null;

export function useScheduledSession() {
  return useSyncExternalStore(subscribe, () => session, () => session);
}

export function useScheduledMinimized() {
  return useSyncExternalStore(subscribe, () => minimized, () => minimized);
}

const NOBODY: string[] = [];
export function useWaitingFor(callId: string | undefined) {
  return useSyncExternalStore(
    subscribe,
    () => (callId && waiting[callId]) || NOBODY,
    () => (callId && waiting[callId]) || NOBODY,
  );
}

export function setScheduledMinimized(value: boolean) {
  minimized = value;
  emit();
}

/** "Join call" on Call details (also used again once the host admits you). */
export async function joinScheduledCall(call: ScheduledCall) {
  const token = authToken();
  if (!token || busy) return;
  if (session && session.call.id !== call.id) {
    Alert.alert("Scheduled call", "You're already in another call. Leave it first.");
    return;
  }
  try {
    busy = true;
    const result = await joinScheduledCallRequest(call.id, call.passcode, token);
    if (result.status === "waiting") {
      session = { phase: "waiting", call, since: session?.phase === "waiting" ? session.since : Date.now() };
    } else {
      session = { phase: "connected", call, token: result.token, livekitUrl: result.livekitUrl, videoEnabled: result.videoEnabled };
      minimized = false;
    }
    emit();
  } catch (error) {
    if (session?.phase === "waiting") session = null;
    emit();
    Alert.alert("Join call", messageOf(error) || "Couldn't join the call.");
  } finally {
    busy = false;
  }
}

export function leaveScheduledCall() {
  session = null;
  minimized = false;
  emit();
}

// ---------- from the socket (hooks/useSocketConnection) ----------

export function onScheduledAdmission(payload: { callId?: string; status?: string }) {
  if (!payload?.callId || session?.phase !== "waiting" || session.call.id !== payload.callId) return;
  if (payload.status === "admitted") {
    joinScheduledCall(session.call);
  } else if (payload.status === "denied") {
    session = null;
    emit();
    Alert.alert("Join call", "The host didn't let you in this time.");
  }
}

export function onScheduledWaiting(payload: { callId?: string; userId?: string }) {
  if (!payload?.callId || !payload.userId) return;
  const list = waiting[payload.callId] || [];
  if (list.includes(payload.userId)) return;
  waiting = { ...waiting, [payload.callId]: [...list, payload.userId] };
  emit();
}

// ---------- host ----------

/** Host joining: who's already waiting (from the call's admission list). */
export async function loadWaiting(callId: string) {
  const token = authToken();
  if (!token) return;
  try {
    const call: any = await getScheduledCall(callId, token);
    const ids = (call?.admission || []).filter((a: any) => a?.status === "waiting").map((a: any) => String(a.userId));
    waiting = { ...waiting, [callId]: ids };
    emit();
  } catch {}
}

export async function admitPerson(callId: string, userId: string, status: "admitted" | "denied") {
  const token = authToken();
  if (!token) return;
  waiting = { ...waiting, [callId]: (waiting[callId] || []).filter((id) => id !== userId) };
  emit();
  try {
    const call = await admitToScheduledCall(callId, userId, status, token);
    store.dispatch(scheduledCallUpdated(call));
  } catch (error) {
    Alert.alert("Waiting room", messageOf(error) || "Couldn't update the waiting room.");
  }
}

export async function admitEveryone(callId: string) {
  for (const userId of [...(waiting[callId] || [])]) await admitPerson(callId, userId, "admitted");
}
