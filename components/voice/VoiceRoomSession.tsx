import { flipCamera, type Facing } from "@/components/calls/flipCamera";
﻿// ==========================================
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
  useRoomContext,
  useRemoteParticipants,
  useTracks,
} from "@livekit/react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CALL_ROOM_OPTIONS, CAMERA_SLOTS, CAMERA_TRACKS_OPTIONS, useMicKey, useStablePeople } from "@/components/calls/callMedia";
import OrbitCallScreen, { type OrbitPerson } from "@/components/calls/OrbitCall";
import { startPrivate, useInPrivateFrom } from "@/components/calls/privateCall";
import { CallBackground } from "@/components/calls/CallVisuals";
import SparksCallNotes from "@/components/calls/SparksCallNotes";
import SparksCallPanel from "@/components/calls/SparksCallPanel";
import { useSparksBoot } from "@/hooks/useSparks";
import type { Call } from "@/services/calls";
import { useSparksCallNotes } from "@/services/sparksCallNotes";
import { endVoiceSession, setVoiceMinimized, updateVoiceRoom, type VoiceSession } from "@/components/voice/voiceUi";
import { leaveVoiceRoom, pingVoiceRoom, VOICE_PING_MS } from "@/services/voiceRooms";
import { useAppSelector } from "@/store/hooks";
import { ensureCallPermissions, getAvatarSource } from "@/utils/callHelpers";

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
        options={CALL_ROOM_OPTIONS}
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
  const liveRoom = useRoomContext();
  // Camera events only (see callMedia.ts), not every speaker update.
  const cameraSlots = useTracks(CAMERA_SLOTS, CAMERA_TRACKS_OPTIONS);

  const [focusOn, setFocusOn] = useState(false);
  // Front or back camera (Flip).
  const [facing, setFacing] = useState<Facing>("user");
  const [startedAt] = useState(nowMs);
  const insets = useSafeAreaInsets();

  // ---------- Sparks (like group calls) ----------
  // Sparks may not be running yet when a voice chat is joined from the card.
  useSparksBoot();

  // Sparks' screens read names from a call; the voice chat's members are it.
  const callLike = useMemo(
    () =>
      ({
        id: session.voiceRoom.id,
        conversationId: session.voiceRoom.conversationId,
        type: "audio",
        status: "accepted",
        caller: session.voiceRoom.startedBy,
        isGroup: true,
        members: session.voiceRoom.members.map((member) => ({ user: member.user, status: "joined", invitedBy: null })),
        maxParticipants: session.voiceRoom.maxMembers,
        maxInvitesPerRequest: 0,
      }) as unknown as Call,
    [session.voiceRoom],
  );

  // This user's speech becomes text on their own phone; Sparks names the
  // topics by itself, nobody has to press anything.
  const notes = useSparksCallNotes({
    callId: session.voiceRoom.id,
    chatId: session.voiceRoom.conversationId,
    startedAt: session.voiceRoom.startedAt || new Date(startedAt).toISOString(),
    active: true,
    micOn: isMicrophoneEnabled,
  });

  // PRIVATE CALL ON TOP: quieter here (25%) and your mic off, while you're
  // in a private call from this voice chat.
  const inPrivate = useInPrivateFrom(session.voiceRoom.id);
  const micBeforePrivate = useRef<boolean | null>(null);
  useEffect(() => {
    if (inPrivate) {
      micBeforePrivate.current = isMicrophoneEnabled;
      localParticipant.setMicrophoneEnabled(false);
    } else if (micBeforePrivate.current !== null) {
      localParticipant.setMicrophoneEnabled(micBeforePrivate.current);
      micBeforePrivate.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inPrivate]);
  // Only when private changes or a microphone is added (useMicKey), not on
  // every participant update.
  const micKey = useMicKey(remoteParticipants);
  const latestRemotes = useRef(remoteParticipants);
  latestRemotes.current = remoteParticipants;
  const volumeChanged = useRef(false);
  useEffect(() => {
    if (!inPrivate && !volumeChanged.current) return;
    volumeChanged.current = inPrivate;
    latestRemotes.current.forEach((participant: any) => participant.setVolume?.(inPrivate ? 0.25 : 1));
  }, [inPrivate, micKey]);

  // Two pages: the voice chat, and its Sparks (swipe across, or "Sparks").
  const { width: pageWidth } = useWindowDimensions();
  const pages = useRef<ScrollView>(null);
  // The Sparks page is built the first time it is opened (it re-rendered the
  // whole transcript every second off-screen before).
  const [sparksSeen, setSparksSeen] = useState(false);
  const openSparks = useCallback(() => {
    setSparksSeen(true);
    pages.current?.scrollTo({ x: pageWidth, animated: true });
  }, [pageWidth]);
  const backToCall = useCallback(() => pages.current?.scrollTo({ x: 0, animated: true }), []);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setElapsed((nowMs() - startedAt) / 1000), 1000);
    return () => clearInterval(timer);
  }, [startedAt]);

  // FOCUS MODE: stop receiving voices (still in the voice chat). Nothing to
  // do until it is first turned on; then only when it changes or a
  // microphone is added (it sent a message per microphone on every update).
  const focusUsed = useRef(false);
  useEffect(() => {
    if (!focusOn && !focusUsed.current) return;
    focusUsed.current = focusOn;
    latestRemotes.current.forEach((participant) => {
      participant.audioTrackPublications.forEach((publication: any) => {
        try {
          publication.setSubscribed?.(!focusOn);
        } catch {}
      });
    });
  }, [focusOn, micKey]);

  const meId = myUserId || localParticipant?.identity || "";
  const speakingIds = [
    ...remoteParticipants.filter((p) => p.isSpeaking).map((p) => p.identity),
    ...(localParticipant?.isSpeaking ? [meId] : []),
  ];

  // Everyone in the room: the backend's member list (names, avatars) plus
  // anyone LiveKit sees who isn't in it yet.
  const byId = new Map(session.voiceRoom.members.map((member) => [member.user.id, member.user]));
  const ids = new Set<string>([meId, ...session.voiceRoom.members.map((m) => m.user.id), ...remoteParticipants.map((p) => p.identity)]);

  const peopleList: OrbitPerson[] = [...ids].filter(Boolean).map((id) => {
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
      rankName: (user as any)?.rank?.name ?? null,
      username: user?.username || null,
      away: !!session.voiceRoom.members.find((member) => member.user.id === id)?.away,
      hasVideo: !!slot && isTrackReference(slot) && !slot.publication.isMuted,
    };
  });
  // Same objects while unchanged, so the orbit skips the timer's renders.
  const people = useStablePeople(peopleList);

  const renderVideo = useCallback(
    (id: string) => {
      const slot = cameraSlots.find((s) => s.participant.identity === id || (id === meId && s.participant.isLocal));
      if (!slot || !isTrackReference(slot) || slot.publication.isMuted) return null;
      return (
        <VideoTrack
          trackRef={slot as TrackReference}
          style={StyleSheet.absoluteFill}
          objectFit="cover"
          mirror={slot.participant.isLocal && facing === "user"}
        />
      );
    },
    [cameraSlots, meId, facing],
  );
  const toggleFocus = useCallback(() => setFocusOn((value) => !value), []);

  const toggleCamera = async () => {
    try {
      if (isCameraEnabled) return void (await localParticipant.setCameraEnabled(false));
      if (await ensureCallPermissions("video")) await localParticipant.setCameraEnabled(true);
    } catch {}
  };

  return (
    <ScrollView
      ref={pages}
      horizontal
      pagingEnabled
      bounces={false}
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      onScrollBeginDrag={sparksSeen ? undefined : () => setSparksSeen(true)}
      style={styles.root}>
    <View style={{ width: pageWidth }}>
    <OrbitCallScreen
      room={liveRoom}
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
      onFlipCamera={async () => {
        const next = await flipCamera(localParticipant as any, facing);
        if (next) setFacing(next);
      }}
      onToggleFocus={toggleFocus}
      onLeave={onLeave}
      onMinimize={() => setVoiceMinimized(true)}
      onPeople={() => Alert.alert("Voice chat", "Everyone in this chat can join from the Call live card.")}
      onSparks={openSparks}
      onPrivateCall={(person) => startPrivate({ kind: "voice", id: session.voiceRoom.id }, person.id)}
      extra={
        <SparksCallNotes
          notes={notes}
          call={callLike}
          myUserId={meId}
          style={styles.notes}
          onOpenSparks={openSparks}
        />
      }
    />
    </View>
    <View style={{ width: pageWidth }}>
      <CallBackground>
        {sparksSeen ? (
          <SparksCallPanel
            notes={notes}
            call={callLike}
            myUserId={meId}
            topInset={insets.top}
            bottomInset={insets.bottom}
            onBack={backToCall}
          />
        ) : null}
      </CallBackground>
    </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  // Sparks pill and newest line, under the header.
  notes: { marginHorizontal: 16, marginBottom: 6 },
});
