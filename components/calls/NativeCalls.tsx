// ==========================================
// THE PHONE'S OWN CALL SCREEN (expo-callkit-telecom)
// ==========================================
// Incoming calls ring like a phone call: full screen on the lock screen,
// Answer / Decline, also when CosQuest is closed (Android: Core-Telecom via
// FCM data messages; iPhone: CallKit via VoIP push, once the backend has
// the APNs key). The server sends the ring and the "stop ringing" pushes
// (Emmanuel's callPush.js); this component connects them to CosQuest:
//   - registers this phone's VoIP token with the server
//   - Answer  -> acceptCall (the same as the in-app Accept), then tells the
//                phone the call is connected
//   - Decline -> declineCall; hanging up from the system screen -> endCall
//   - a call that ends in CosQuest (hang up, caller left) also ends on the
//     phone's call screen
// The in-app ringing screen steps aside while the phone's screen rings.
import * as Calls from "expo-callkit-telecom";
import { useEffect, useRef } from "react";
import { Platform } from "react-native";

import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { acceptCall, declineCall, endCall } from "@/store/thunks/callThunks";
import { ensureCallPermissions } from "@/utils/callHelpers";
import { registerVoipToken } from "@/utils/pushDevice";
import { loadSavedToken } from "@/utils/sessionStorage";

import { clearNativeCall, markNativeCall } from "./nativeCallState";

// As early as possible: the VoIP token, and calls reported before React started.
if (Platform.OS !== "web") {
  try {
    Calls.registerVoIPPush();
  } catch {}
}

export default function NativeCalls() {
  const dispatch = useAppDispatch();
  const token = useAppSelector((state) => state.auth.token);
  const activeId = useAppSelector((state) => state.call.active?.call?.id || null);
  const incomingId = useAppSelector((state) => state.call.incoming?.id || null);
  const voip = Calls.useVoIPPushToken();

  // native call id -> our call id, and the ones answered on the call screen
  const serverIds = useRef(new Map<string, string>());
  const answered = useRef(new Set<string>());
  const endedHere = useRef(new Set<string>());
  const tokenRef = useRef(token);
  tokenRef.current = token;

  const sessionToken = async () => tokenRef.current || (await loadSavedToken());

  // This phone's VoIP token -> the server (after the normal push token is registered).
  useEffect(() => {
    if (!voip?.token || !token) return;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const attempt = async () => {
      tries += 1;
      const done = await registerVoipToken({ token: voip.token, type: voip.type }, token).catch(() => false);
      if (!done && tries < 8) timer = setTimeout(attempt, 15000);
    };
    attempt();
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [voip?.token, voip?.type, token]);

  useEffect(() => {
    const remember = (session: Calls.CallSession) => {
      const serverId = session.incomingCallEvent?.serverCallId;
      if (!serverId) return;
      serverIds.current.set(session.id, serverId);
      if (session.status !== "ended") markNativeCall(serverId);
    };
    const subs = [
      Calls.addCallSessionAddedListener(({ session }) => remember(session)),
      Calls.addCallSessionUpdatedListener(({ session }) => remember(session)),
      Calls.addCallSessionRemovedListener(({ id }) => {
        const serverId = serverIds.current.get(id);
        if (serverId) clearNativeCall(serverId);
        serverIds.current.delete(id);
        answered.current.delete(id);
        endedHere.current.delete(id);
      }),

      // Answer on the phone's call screen.
      Calls.addCallAnsweredListener(async ({ id, requestId }) => {
        const session = await Calls.getActiveCallSession().catch(() => null);
        const serverId = serverIds.current.get(id) || session?.incomingCallEvent?.serverCallId;
        const auth = await sessionToken();
        if (!serverId || !auth) {
          Calls.failIncomingCallConnected(id, requestId).catch(() => {});
          return;
        }
        answered.current.add(id);
        try {
          await ensureCallPermissions(session?.options?.hasVideo ? "video" : "audio");
          await dispatch(acceptCall({ callId: serverId, token: auth })).unwrap();
          await Calls.fulfillIncomingCallConnected(requestId);
        } catch {
          answered.current.delete(id);
          Calls.failIncomingCallConnected(id, requestId).catch(() => {});
        } finally {
          clearNativeCall(serverId);
        }
      }),

      // Decline, or hang up, on the phone's call screen.
      Calls.addCallEndedListener(async ({ id, session }) => {
        const serverId = serverIds.current.get(id) || session?.incomingCallEvent?.serverCallId;
        if (!serverId) return;
        clearNativeCall(serverId);
        if (endedHere.current.has(id)) return; // CosQuest ended it already
        const auth = await sessionToken();
        if (!auth) return;
        const wasAnswered = answered.current.has(id) || !!session?.connectedAt;
        dispatch(wasAnswered ? endCall({ callId: serverId, token: auth }) : declineCall({ callId: serverId, token: auth }));
      }),
    ];
    return () => subs.forEach((sub) => sub.remove());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch]);

  // A call that ends in CosQuest (or stops ringing) ends on the phone's screen too.
  useEffect(() => {
    for (const [nativeId, serverId] of serverIds.current) {
      const stillRinging = incomingId === serverId;
      const stillActive = activeId === serverId;
      if (!stillRinging && !stillActive && answered.current.has(nativeId)) {
        endedHere.current.add(nativeId);
        Calls.reportCallEnded(nativeId, "remoteEnded").catch(() => {});
      }
    }
  }, [activeId, incomingId]);

  return null;
}
