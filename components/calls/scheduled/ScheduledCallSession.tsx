import { flipCamera, type Facing } from "@/components/calls/flipCamera";
// ==========================================
// SCHEDULED CALL (phones): the call's own room, shown as the orbit
// ==========================================
// Joined from Call details (POST /join gives the token). Looks like a group
// call / voice chat. The host sees the waiting room pill and sheet.
import type { TrackReference } from "@livekit/react-native";
import {
  AndroidAudioTypePresets,
  AudioSession,
  LiveKitRoom,
  VideoTrack,
  isTrackReference,
  useLocalParticipant,
  useRoomContext,
  useRemoteParticipants,
  useTracks,
} from "@livekit/react-native";
import { RoomOptions, Track } from "livekit-client";
import { useEffect, useState } from "react";
import { Alert, StyleSheet, View } from "react-native";

import OrbitCallScreen, { type OrbitPerson } from "@/components/calls/OrbitCall";
import { useAppSelector } from "@/store/hooks";
import { ensureCallPermissions, getAvatarSource } from "@/utils/callHelpers";

import { leaveScheduledCall, loadWaiting, setScheduledMinimized, type ScheduledSession } from "./scheduledCallJoin";
import { WaitingPill, WaitingRoomSheet, useWaitingRoom } from "./WaitingRoomPanel";

type Connected = Extract<ScheduledSession, { phase: "connected" }>;

const ROOM_OPTIONS: RoomOptions = {
  adaptiveStream: { pixelDensity: "screen" },
  dynacast: true,
  audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  publishDefaults: { dtx: true, red: true },
};

function formatDuration(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export default function ScheduledCallSession({ session }: { session: Connected }) {
  // Phone in "call mode" (echo cancelling), loudspeaker for a group.
  useEffect(() => {
    let started = false;
    (async () => {
      try {
        await AudioSession.configureAudio({
          android: { audioTypeOptions: AndroidAudioTypePresets.communication },
          ios: { defaultOutput: "speaker" },
        });
      } catch {}
      try {
        await AudioSession.startAudioSession();
        started = true;
        await AudioSession.selectAudioOutput("speaker").catch(() => {});
      } catch {}
    })();
    return () => {
      if (started) AudioSession.stopAudioSession();
    };
  }, []);

  return (
    <View style={styles.root}>
      <LiveKitRoom
        serverUrl={session.livekitUrl}
        token={session.token}
        connect
        audio
        video={false}
        options={ROOM_OPTIONS}
        onError={(error) => {
          console.error("SCHEDULED CALL ERROR:", error);
          Alert.alert("Call", "The call connection was lost.");
          leaveScheduledCall();
        }}>
        <Stage session={session} />
      </LiveKitRoom>
    </View>
  );
}

function Stage({ session }: { session: Connected }) {
  const { call } = session;
  const myUserId = useAppSelector((state) => state.call.myUserId);
  const remoteParticipants = useRemoteParticipants();
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled } = useLocalParticipant();
  const liveRoom = useRoomContext();
  const cameraSlots = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }], { onlySubscribed: false });
  const [focusOn, setFocusOn] = useState(false);
  // Front or back camera (Flip).
  const [facing, setFacing] = useState<Facing>("user");
  const [startedAt] = useState(() => Date.now());
  const [elapsed, setElapsed] = useState(0);
  const hosting = Boolean(call.canManage);
  const room = useWaitingRoom(call);

  useEffect(() => {
    const timer = setInterval(() => setElapsed((Date.now() - startedAt) / 1000), 1000);
    return () => clearInterval(timer);
  }, [startedAt]);

  // Host: who's already waiting.
  useEffect(() => {
    if (hosting) loadWaiting(call.id);
  }, [hosting, call.id]);

  // FOCUS MODE: stop receiving voices (still in the call).
  useEffect(() => {
    remoteParticipants.forEach((participant) => {
      participant.audioTrackPublications.forEach((publication: any) => {
        try {
          publication.setSubscribed?.(!focusOn);
        } catch {}
      });
    });
  }, [focusOn, remoteParticipants]);

  const meId = myUserId || localParticipant?.identity || "";
  const speakingIds = [
    ...remoteParticipants.filter((p) => p.isSpeaking).map((p) => p.identity),
    ...(localParticipant?.isSpeaking ? [meId] : []),
  ];
  const known = new Map([call.host, ...call.participants].map((person) => [person.id, person]));
  const ids = [meId, ...remoteParticipants.map((p) => p.identity)].filter(Boolean);

  const people: OrbitPerson[] = [...new Set(ids)].map((id) => {
    const isMe = id === meId;
    const remote = remoteParticipants.find((p) => p.identity === id);
    const user = known.get(id);
    const slot = cameraSlots.find((s) => s.participant.identity === id || (isMe && s.participant.isLocal));
    return {
      id,
      name: user?.name || user?.username || remote?.name || (isMe ? "You" : "Someone"),
      avatar: user ? getAvatarSource(user) : null,
      speaking: speakingIds.includes(id),
      micOff: isMe ? !isMicrophoneEnabled : remote ? !remote.isMicrophoneEnabled : false,
      isMe,
      username: user?.username || null,
      hasVideo: !!slot && isTrackReference(slot) && !slot.publication.isMuted,
    };
  });

  const renderVideo = (id: string) => {
    const slot = cameraSlots.find((s) => s.participant.identity === id || (id === meId && s.participant.isLocal));
    if (!slot || !isTrackReference(slot) || slot.publication.isMuted) return null;
    return (
      <VideoTrack trackRef={slot as TrackReference} style={StyleSheet.absoluteFill} objectFit="cover" mirror={slot.participant.isLocal && facing === "user"} />
    );
  };

  const toggleCamera = async () => {
    if (!session.videoEnabled) {
      Alert.alert("Video", "The host turned off video for this call.");
      return;
    }
    try {
      if (isCameraEnabled) return void (await localParticipant.setCameraEnabled(false));
      if (await ensureCallPermissions("video")) await localParticipant.setCameraEnabled(true);
    } catch {}
  };

  return (
    <>
      <OrbitCallScreen
        room={liveRoom}
        title={call.topic}
        subtitle={`Scheduled call · ${people.length} on call · ${formatDuration(elapsed)}`}
        people={people}
        pinnedId={call.host?.id || null}
        renderVideo={renderVideo}
        micOn={isMicrophoneEnabled}
        cameraOn={isCameraEnabled}
        focusOn={focusOn}
        ended={false}
        onToggleMic={() => localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled)}
        onToggleCamera={toggleCamera}
        onFlipCamera={async () => {
          const next = await flipCamera(localParticipant as any, facing);
          if (next) setFacing(next);
        }}
        onToggleFocus={() => setFocusOn((value) => !value)}
        onLeave={leaveScheduledCall}
        onMinimize={() => setScheduledMinimized(true)}
        onPeople={() =>
          hosting ? room.setOpen(true) : Alert.alert("Scheduled call", "People invited to this call join from its Call details.")
        }
        extra={hosting ? <WaitingPill count={room.count} onPress={() => room.setOpen(true)} /> : null}
      />
      {hosting ? <WaitingRoomSheet call={call} ids={room.ids} visible={room.open} onClose={() => room.setOpen(false)} /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
