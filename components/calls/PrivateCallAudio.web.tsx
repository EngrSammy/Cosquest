// ==========================================
// PRIVATE CALL - the audio connection (website)
// ==========================================
// Its own LiveKit room (livekit-client), next to the main call's.
import { Room, RoomEvent, Track, type RemoteTrack } from "livekit-client";
import { useEffect, useRef, useState, type ReactNode } from "react";

export type PrivateAudioControls = {
  micOn: boolean;
  toggleMic: () => void;
  otherHere: boolean;
};

export default function PrivateCallAudio({
  livekitUrl,
  token,
  children,
}: {
  livekitUrl: string;
  token: string;
  children: (controls: PrivateAudioControls) => ReactNode;
}) {
  const roomRef = useRef<Room | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [otherHere, setOtherHere] = useState(false);

  useEffect(() => {
    const room = new Room({
      audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      publishDefaults: { dtx: true, red: true },
    });
    roomRef.current = room;
    const elements: HTMLMediaElement[] = [];
    const count = () => setOtherHere(room.remoteParticipants.size > 0);

    room
      .on(RoomEvent.ParticipantConnected, count)
      .on(RoomEvent.ParticipantDisconnected, count)
      .on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
        if (track.kind !== Track.Kind.Audio) return;
        const element = track.attach();
        element.style.display = "none";
        document.body.appendChild(element);
        elements.push(element);
      })
      .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
        track.detach().forEach((element) => element.remove());
      });

    let cancelled = false;
    (async () => {
      try {
        await room.connect(livekitUrl, token);
        if (cancelled) return;
        count();
        await room.localParticipant.setMicrophoneEnabled(true);
        setMicOn(true);
      } catch (error) {
        console.error("PRIVATE CALL ROOM ERROR (web):", error);
      }
    })();

    return () => {
      cancelled = true;
      elements.forEach((element) => element.remove());
      room.removeAllListeners();
      room.disconnect();
      roomRef.current = null;
    };
  }, [livekitUrl, token]);

  const toggleMic = async () => {
    const next = !micOn;
    try {
      await roomRef.current?.localParticipant.setMicrophoneEnabled(next);
      setMicOn(next);
    } catch {}
  };

  return <>{children({ micOn, toggleMic, otherHere })}</>;
}
