// ==========================================
// PRIVATE CALL ON TOP - state (one at a time, app-wide)
// ==========================================
// Kept apart from the main call (state.call.active in the store) on
// purpose: a private call runs ON TOP of a group call or voice chat, which
// keeps going underneath (quieter, your mic off there).
//   incoming: a private call ringing for you (a small card, not the full
//             ringing screen, so the main call stays on screen)
//   session:  the private call you're in (the "Private call on top" sheet)
import { useSyncExternalStore } from "react";
import { Alert } from "react-native";

import { acceptCallRequest, declineCallRequest, endCallRequest, type Call } from "@/services/calls";
import { privateOf, startPrivateCallRequest, type PrivateFrom } from "@/services/privateCalls";
import { store } from "@/store/store";

export type PrivateSession = {
  call: Call;
  token: string;
  livekitUrl: string;
  direction: "outgoing" | "incoming";
  from: PrivateFrom;
};

const ENDED = ["declined", "missed", "cancelled", "ended"];

let session: PrivateSession | null = null;
let incoming: Call | null = null;
let busy = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const authToken = () => (store.getState() as any).auth?.token as string | null;

export function usePrivateSession() {
  return useSyncExternalStore(subscribe, () => session, () => session);
}

export function usePrivateIncoming() {
  return useSyncExternalStore(subscribe, () => incoming, () => incoming);
}

/** True while you're in a private call started from this call or voice chat. */
export function useInPrivateFrom(mainId: string | null | undefined) {
  const current = usePrivateSession();
  return !!current && !!mainId && current.from.id === String(mainId);
}

// ---------- from the socket (hooks/useSocketConnection) ----------

export function receivePrivateIncoming(call: Call) {
  if (session?.call.id === call.id) return;
  if (call.status !== "ringing") return;
  incoming = call;
  emit();
}

export function applyPrivateUpdate(call: Call) {
  let changed = false;
  if (session && session.call.id === call.id) {
    session = ENDED.includes(call.status) ? null : { ...session, call: { ...session.call, ...call } };
    changed = true;
  }
  if (incoming && incoming.id === call.id && call.status !== "ringing") {
    incoming = null;
    changed = true;
  }
  if (changed) emit();
}

// ---------- your actions ----------

/** Tap "Private call" on someone's card in the orbit. */
export async function startPrivate(from: PrivateFrom, userId: string) {
  const token = authToken();
  if (!token || busy) return;
  if (session) {
    Alert.alert("Private call", "You're already in a private call. End it first.");
    return;
  }
  try {
    busy = true;
    const join = await startPrivateCallRequest(from, userId, token);
    session = { ...join, direction: "outgoing", from };
    emit();
  } catch (error) {
    Alert.alert("Private call", error instanceof Error ? error.message : "Couldn't start the private call.");
  } finally {
    busy = false;
  }
}

export async function acceptPrivate() {
  const token = authToken();
  const call = incoming;
  const from = privateOf(call);
  if (!token || !call || !from || busy) return;
  try {
    busy = true;
    const join = await acceptCallRequest(call.id, token);
    incoming = null;
    session = { ...join, direction: "incoming", from };
    emit();
  } catch (error) {
    incoming = null;
    emit();
    Alert.alert("Private call", error instanceof Error ? error.message : "This private call is no longer available.");
  } finally {
    busy = false;
  }
}

export async function declinePrivate() {
  const token = authToken();
  const call = incoming;
  incoming = null;
  emit();
  if (token && call) await declineCallRequest(call.id, token).catch(() => {});
}

/** End the private call: both go back to the main call. */
export async function endPrivate() {
  const token = authToken();
  const current = session;
  session = null;
  emit();
  if (token && current) await endCallRequest(current.call.id, token).catch(() => {});
}
