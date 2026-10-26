// ==========================================
// CALL TOOLS for the orbit screen (from the call's LiveKit room)
// ==========================================
//   connection: "poor" (for 2.5 s or more) / "reconnecting" / null
//   share:      who is sharing their screen (one at a time), or null
//   toggleShare (website): start / stop sharing your screen
//   speakerOn / toggleSpeaker (phones): loudspeaker <-> earpiece/Bluetooth
//   Blocked camera / microphone: a clear message (mediaBlocked.ts)
import {
  ConnectionQuality,
  RoomEvent,
  Track,
  type Participant,
  type Room,
  type TrackPublication,
} from "livekit-client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Platform } from "react-native";

import { CAN_ROUTE_AUDIO, routeAudio } from "./audioRoute";
import { explainBlocked, isBlockedError, kindOfMediaError } from "./mediaBlocked";

export type ShareInfo = { participant: Participant; publication: TrackPublication; isLocal: boolean };
export type Connection = "poor" | "reconnecting" | null;

export const CAN_SHARE_SCREEN = Platform.OS === "web";

export function useCallTools(room: Room | null | undefined) {
  const [connection, setConnection] = useState<Connection>(null);
  const [share, setShare] = useState<ShareInfo | null>(null);
  const [speakerOn, setSpeakerOn] = useState(true);
  const shareRef = useRef<ShareInfo | null>(null);
  shareRef.current = share;

  useEffect(() => {
    if (!room) return;
    let poorTimer: ReturnType<typeof setTimeout> | null = null;

    const onQuality = (quality: ConnectionQuality, participant: Participant) => {
      if (!participant?.isLocal) return;
      if (quality === ConnectionQuality.Poor || quality === ConnectionQuality.Lost) {
        // Only a lasting problem: a short dip isn't worth a warning.
        if (!poorTimer) {
          poorTimer = setTimeout(() => {
            poorTimer = null;
            setConnection((current) => (current === "reconnecting" ? current : "poor"));
          }, 2500);
        }
      } else {
        if (poorTimer) clearTimeout(poorTimer);
        poorTimer = null;
        setConnection((current) => (current === "poor" ? null : current));
      }
    };
    const onReconnecting = () => setConnection("reconnecting");
    const onReconnected = () => setConnection(null);

    const findShare = () => {
      const everyone: Participant[] = [room.localParticipant, ...Array.from(room.remoteParticipants.values())];
      for (const participant of everyone) {
        const publication = participant.getTrackPublication(Track.Source.ScreenShare);
        if (publication?.track && !publication.isMuted) {
          setShare({ participant, publication, isLocal: participant.isLocal });
          return;
        }
      }
      setShare(null);
    };

    const onMediaError = (error: Error, deviceKind?: string) => {
      if (isBlockedError(error)) explainBlocked(kindOfMediaError(error, deviceKind));
    };

    const events: [RoomEvent, (...args: any[]) => void][] = [
      [RoomEvent.ConnectionQualityChanged, onQuality],
      [RoomEvent.Reconnecting, onReconnecting],
      [RoomEvent.SignalReconnecting, onReconnecting],
      [RoomEvent.Reconnected, onReconnected],
      [RoomEvent.TrackSubscribed, findShare],
      [RoomEvent.TrackUnsubscribed, findShare],
      [RoomEvent.TrackPublished, findShare],
      [RoomEvent.TrackUnpublished, findShare],
      [RoomEvent.LocalTrackPublished, findShare],
      [RoomEvent.LocalTrackUnpublished, findShare],
      [RoomEvent.TrackMuted, findShare],
      [RoomEvent.TrackUnmuted, findShare],
      [RoomEvent.ParticipantDisconnected, findShare],
      [RoomEvent.MediaDevicesError, onMediaError],
    ];
    events.forEach(([event, handler]) => room.on(event as any, handler));
    findShare();

    return () => {
      if (poorTimer) clearTimeout(poorTimer);
      events.forEach(([event, handler]) => room.off(event as any, handler));
    };
  }, [room]);

  // WEBSITE: share your screen (one person at a time).
  const toggleShare = useCallback(
    async (sharerName?: string) => {
      if (!room) return;
      const current = shareRef.current;
      if (current && !current.isLocal) {
        Alert.alert("Screen sharing", `${sharerName || "Someone"} is sharing their screen. Ask them to stop first, then share yours.`);
        return;
      }
      try {
        await room.localParticipant.setScreenShareEnabled(!current?.isLocal, { audio: false });
      } catch (error) {
        // Closing the browser's "choose what to share" window isn't an error.
        const name = String((error as any)?.name || "");
        if (!/NotAllowed|Abort/i.test(name)) Alert.alert("Screen sharing", "Couldn't share your screen. Try again.");
      }
    },
    [room],
  );

  // PHONES: loudspeaker <-> earpiece / Bluetooth / headphones.
  const toggleSpeaker = useCallback(() => {
    setSpeakerOn((current) => {
      const next = !current;
      routeAudio(next);
      return next;
    });
  }, []);

  return { connection, share, toggleShare, speakerOn, toggleSpeaker, canRouteAudio: CAN_ROUTE_AUDIO && !!room };
}
