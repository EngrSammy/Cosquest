// ==========================================
// VOICE CHAT (phones): the live room, shown as the orbit (Part 1)
// ==========================================
// Joined from the "Call live" card or the call button in Community and
// faction chats. Nobody's phone rings. Checks in every 30 s ("still here"),
// leaves the room on Leave. The website uses VoiceRoomSession.web.tsx.
import type { TrackReference } from "@livekit/react-native";
import {
  AndroidAudioTypePresets,
  AudioSession,
  LiveKitRoom,
  VideoTrack,
  isTrackReference,
  useLocalParticipant,
  useRemoteParticipants,
  useTracks,
} from "@livekit/react-native";
import { RoomOptions, Track } from "livekit-client";
import { useEffect, useRef, useState } from "react";
import { Alert, StyleSheet, View } from "react-native";

import OrbitCallScreen, { type OrbitPerson } from "@/components/calls/OrbitCall";
import { endVoiceSession, setVoiceMinimized, updateVoiceRoom, type VoiceSession } from "@/components/voice/voiceUi";
import { leaveVoiceRoom, pingVoiceRoom, VOICE_PING_MS } from "@/services/voiceRooms";
import { useAppSelector } from "@/store/hooks";
import { ensureCallPermissions, getAvatarSource } from "@/utils/callHelpers";

const ROOM_OPTIONS: RoomOptions = {
  adaptiveStream: { pixelDensity: "screen" },
  dynacast: true,
  audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  publishDefaults: { dtx: true, red: true },
};

function nowMs() {
  return Date.now();
}

function formatDuration(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export default function VoiceRoomSession({ session }: { session: VoiceSession }) {
  const token = useAppSelector((state) => state.auth.token);
  const roomId = session.voiceRoom.id;
  const leftRef = useRef(false);

  const leave = () => {
    if (leftRef.current) return;
    leftRef.current = true;
    if (token) leaveVoiceRoom(roomId, token);
    endVoiceSession();
  };

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

  // "Still here" every 30 s; the backend drops people after 90 s without it.
  useEffect(() => {
    if (!token) return;
    const timer = setInterval(async () => {
      try {
        const room = await pingVoiceRoom(roomId, token);
        if (room) updateVoiceRoom(room);
        else endVoiceSession();
      } catch {
        // Ended or removed: close it here too.
        if (!leftRef.current) endVoiceSession();
      }
    }, VOICE_PING_MS);
    return () => clearInterval(timer);
  }, [roomId, token]);

  // Leaving the screen for good (logout etc.) = leave the room.
  useEffect(() => {
    return () => {
      if (!leftRef.current && token) leaveVoiceRoom(roomId, token);
    };
  }, [roomId, token]);

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
          console.error("VOICE ROOM ERROR:", error);
          Alert.alert("Voice chat", "The voice chat connection was lost.");
          leave();
        }}>
        <VoiceStage session={session} onLeave={leave} />
      </LiveKitRoom>
    </View>
  );
}

function VoiceStage({ session, onLeave }: { session: VoiceSession; onLeave: () => void }) {
  const myUserId = useAppSelector((state) => state.call.myUserId);
  const remoteParticipants = useRemoteParticipants();
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled } = useLocalParticipant();
  const cameraSlots = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }], { onlySubscribed: false });

  const [focusOn, setFocusOn] = useState(false);
  const [startedAt] = useState(nowMs);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setElapsed((nowMs() - startedAt) / 1000), 1000);
    return () => clearInterval(timer);
  }, [startedAt]);

  // FOCUS MODE: stop receiving voices (still in the voice chat).
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

  // Everyone in the room: the backend's member list (names, avatars) plus
  // anyone LiveKit sees who isn't in it yet.
  const byId = new Map(session.voiceRoom.members.map((member) => [member.user.id, member.user]));
  const ids = new Set<string>([meId, ...session.voiceRoom.members.map((m) => m.user.id), ...remoteParticipants.map((p) => p.identity)]);

  const people: OrbitPerson[] = [...ids].filter(Boolean).map((id) => {
    const isMe = id === meId;
    const remote = remoteParticipants.find((p) => p.identity === id);
    const user = byId.get(id);
    const slot = cameraSlots.find((s) => s.participant.identity === id || (isMe && s.participant.isLocal));
    return {
      id,
      name: user?.name || user?.username || remote?.name || (isMe ? "You" : "Someone"),
      avatar: user ? getAvatarSource(user) : null,
      speaking: speakingIds.includes(id),
      micOff: isMe ? !isMicrophoneEnabled : remote ? !remote.isMicrophoneEnabled : false,
      isMe,
      rankLevel: (user as any)?.rank?.level ?? null,
      hasVideo: !!slot && isTrackReference(slot) && !slot.publication.isMuted,
    };
  });

  const renderVideo = (id: string) => {
    const slot = cameraSlots.find((s) => s.participant.identity === id || (id === meId && s.participant.isLocal));
    if (!slot || !isTrackReference(slot) || slot.publication.isMuted) return null;
    return (
      <VideoTrack
        trackRef={slot as TrackReference}
        style={StyleSheet.absoluteFill}
        objectFit="cover"
        mirror={slot.participant.isLocal}
      />
    );
  };

  const toggleCamera = async () => {
    try {
      if (isCameraEnabled) return void (await localParticipant.setCameraEnabled(false));
      if (await ensureCallPermissions("video")) await localParticipant.setCameraEnabled(true);
    } catch {}
  };

  return (
    <OrbitCallScreen
      title={session.title}
      subtitle={`Voice chat · ${people.length} on call · ${formatDuration(elapsed)}`}
      people={people}
      pinnedId={session.voiceRoom.startedBy?.id || null}
      renderVideo={renderVideo}
      micOn={isMicrophoneEnabled}
      cameraOn={isCameraEnabled}
      focusOn={focusOn}
      ended={false}
      onToggleMic={() => localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled)}
      onToggleCamera={toggleCamera}
      onToggleFocus={() => setFocusOn((value) => !value)}
      onLeave={onLeave}
      onMinimize={() => setVoiceMinimized(true)}
      onPeople={() => Alert.alert("Voice chat", "Everyone in this chat can join from the Call live card.")}
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
