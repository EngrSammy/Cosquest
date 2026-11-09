// ==========================================
// CALL TRANSCRIPT SCREEN
// ==========================================
// Opened from a call's notes ("Transcript") and from the in-call Sparks
// panel ("Full transcript"). Everything is in components/calls/CallTranscriptView.tsx.
import { useLocalSearchParams } from "expo-router";

import CallTranscriptView from "@/components/calls/CallTranscriptView";
import { useAppSelector } from "@/store/hooks";

export default function CallTranscriptScreen() {
  const { callId } = useLocalSearchParams<{ callId: string }>();
  const token = useAppSelector((state) => state.auth.token);
  const myUserId = useAppSelector((state) => String((state.auth.user as any)?.id || state.call.myUserId || "")) || null;

  return <CallTranscriptView callId={String(callId || "")} token={token} myUserId={myUserId} />;
}
