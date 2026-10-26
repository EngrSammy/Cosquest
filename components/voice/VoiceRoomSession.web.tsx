import { flipCamera, type Facing } from "@/components/calls/flipCamera";
﻿// ==========================================
// VOICE CHAT (website): the live room, shown as the orbit (Part 1)
// ==========================================
// Same as VoiceRoomSession.tsx, with the browser's LiveKit (livekit-client).
import { LocalVideoTrack, Room, RoomEvent, Track, VideoTrack, type RemoteTrack } from "livekit-client";
import { useEffect, useRef, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";

import OrbitCallScreen, { type OrbitPerson } from "@/components/calls/OrbitCall";
import { startPrivate, useInPrivateFrom } from "@/components/calls/privateCall";
import { endVoiceSession, setVoiceMinimized, updateVoiceRoom, type VoiceSession } from "@/components/voice/voiceUi";
import { leaveVoiceRoom, pingVoiceRoom, VOICE_PING_MS } from "@/services/voiceRooms";
import { useAppSelector } from "@/store/hooks";
import { getAvatarSource } from "@/utils/callHelpers";

function nowMs() {
  return Date.now();
}

function formatDuration(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function WebVideo({ track, mirror }: { track: VideoTrack; mirror?: boolean }) {
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    track.attach(element);
    return () => {
      track.detach(element);
    };
  }, [track]);
  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted
      style={{ width: "100%", height: "100%", objectFit: "cover", transform: mirror ? "scaleX(-1)" : undefined }}
    />
  );
}

type Remote = { identity: string; name: string; video: VideoTrack | null; micOn: boolean };

export default function VoiceRoomSession({ session }: { session: VoiceSession }) {
  const token = useAppSelector((state) => state.auth.token);
  const myUserId = useAppSelector((state) => state.call.myUserId);
  const roomId = session.voiceRoom.id;

  const roomRef = useRef<Room | null>(null);
  const audioElements = useRef<HTMLMediaElement[]>([]);
  const leftRef = useRef(false);

  const [remotes, setRemotes] = useState<Remote[]>([]);
  const [speakingIds, setSpeakingIds] = useState<string[]>([]);
  const [micOn, setMicOn] = useState(true);

  // PRIVATE CALL ON TOP: quieter here (25%) and your mic off, while you're
  // in a private call from this voice chat.
  const inPrivate = useInPrivateFrom(session.voiceRoom.id);
  const micBeforePrivate = useRef<boolean | null>(null);
  useEffect(() => {
    const room = roomRef.current;
    if (!room) return;
    room.remoteParticipants.forEach((participant) => participant.setVolume(inPrivate ? 0.25 : 1));
    if (inPrivate) {
      micBeforePrivate.current = micOn;
      room.localParticipant.setMicrophoneEnabled(false).then(() => setMicOn(false)).catch(() => {});
    } else if (micBeforePrivate.current !== null) {
      const back = micBeforePrivate.current;
      micBeforePrivate.current = null;
      room.localParticipant.setMicrophoneEnabled(back).then(() => setMicOn(back)).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inPrivate]);
  const [cameraOn, setCameraOn] = useState(false);
  const [localVideo, setLocalVideo] = useState<LocalVideoTrack | null>(null);
  const [focusOn, setFocusOn] = useState(false);
  // Front or back camera (Flip).
  const [facing, setFacing] = useState<Facing>("user");
  const [needsAudioTap, setNeedsAudioTap] = useState(false);
  const [startedAt] = useState(nowMs);
  const [elapsed, setElapsed] = useState(0);
  const focusRef = useRef(false);
  focusRef.current = focusOn;

  const leave = () => {
    if (leftRef.current) return;
    leftRef.current = true;
    if (token) leaveVoiceRoom(roomId, token);
    endVoiceSession();
  };

  // Connect to the room.
  useEffect(() => {
    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
      audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      publishDefaults: { dtx: true, red: true },
    });
    roomRef.current = room;

    const refresh = () => {
      const list: Remote[] = [];
      room.remoteParticipants.forEach((participant) => {
        let video: VideoTrack | null = null;
        participant.videoTrackPublications.forEach((publication) => {
          if (publication.track && !publication.isMuted && publication.source === Track.Source.Camera) {
            video = publication.track as VideoTrack;
          }
        });
        list.push({
          identity: participant.identity,
          name: participant.name || "",
          video,
          micOn: participant.isMicrophoneEnabled,
        });
      });
      setRemotes(list);
    };

    room
      .on(RoomEvent.ActiveSpeakersChanged, (speakers) => setSpeakingIds(speakers.map((s) => s.identity)))
      .on(RoomEvent.ParticipantConnected, refresh)
      .on(RoomEvent.ParticipantDisconnected, refresh)
      .on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
        if (track.kind === Track.Kind.Audio) {
          const element = track.attach();
          element.style.display = "none";
          element.muted = focusRef.current;
          document.body.appendChild(element);
          audioElements.current.push(element);
        }
        refresh();
      })
      .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
        track.detach().forEach((element) => element.remove());
        refresh();
      })
      .on(RoomEvent.TrackMuted, refresh)
      .on(RoomEvent.TrackUnmuted, refresh)
      .on(RoomEvent.AudioPlaybackStatusChanged, () => setNeedsAudioTap(!room.canPlaybackAudio))
      .on(RoomEvent.Disconnected, () => {
        if (!leftRef.current) leave();
      });

    let cancelled = false;
    (async () => {
      try {
        await room.connect(session.livekitUrl, session.token);
        if (cancelled) return;
        refresh();
        // Mic blocked: stay in the call to listen (the orbit screen explains).
        await room.localParticipant.setMicrophoneEnabled(true).catch(() => setMicOn(false));
        setNeedsAudioTap(!room.canPlaybackAudio);
      } catch (error) {
        console.error("VOICE ROOM ERROR (web):", error);
        Alert.alert("Voice chat", "Couldn't connect to the voice chat.");
        leave();
      }
    })();

    return () => {
      cancelled = true;
      audioElements.current.forEach((element) => element.remove());
      audioElements.current = [];
      room.removeAllListeners();
      room.disconnect();
      roomRef.current = null;
      if (!leftRef.current && token) leaveVoiceRoom(roomId, token);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.livekitUrl, session.token]);

  // "Still here" every 30 s.
  useEffect(() => {
    if (!token) return;
    const timer = setInterval(async () => {
      try {
        const room = await pingVoiceRoom(roomId, token);
        if (room) updateVoiceRoom(room);
        else endVoiceSession();
      } catch {
        if (!leftRef.current) endVoiceSession();
      }
    }, VOICE_PING_MS);
    return () => clearInterval(timer);
  }, [roomId, token]);

  useEffect(() => {
    const timer = setInterval(() => setElapsed((nowMs() - startedAt) / 1000), 1000);
    return () => clearInterval(timer);
  }, [startedAt]);

  // FOCUS MODE: silence voices (still in the voice chat).
  useEffect(() => {
    audioElements.current.forEach((element) => {
      element.muted = focusOn;
    });
  }, [focusOn]);

  const toggleMic = async () => {
    const next = !micOn;
    try {
      await roomRef.current?.localParticipant.setMicrophoneEnabled(next);
      setMicOn(next);
    } catch {}
  };

  const toggleCamera = async () => {
    const room = roomRef.current;
    if (!room) return;
    const next = !cameraOn;
    try {
      await room.localParticipant.setCameraEnabled(next);
      setCameraOn(next);
      const publication = room.localParticipant.getTrackPublication(Track.Source.Camera);
      setLocalVideo(next && publication?.track ? (publication.track as LocalVideoTrack) : null);
    } catch {}
  };

  const meId = myUserId || roomRef.current?.localParticipant.identity || "";
  const byId = new Map(session.voiceRoom.members.map((member) => [member.user.id, member.user]));
  const ids = new Set<string>([meId, ...session.voiceRoom.members.map((m) => m.user.id), ...remotes.map((r) => r.identity)]);

  const people: OrbitPerson[] = [...ids].filter(Boolean).map((id) => {
    const isMe = id === meId;
    const remote = remotes.find((r) => r.identity === id);
    const user = byId.get(id);
    return {
      id,
      name: user?.name || user?.username || remote?.name || (isMe ? "You" : "Someone"),
      avatar: user ? getAvatarSource(user) : null,
      speaking: speakingIds.includes(id),
      micOff: isMe ? !micOn : remote ? !remote.micOn : false,
      isMe,
      rankLevel: (user as any)?.rank?.level ?? null,
      rankName: (user as any)?.rank?.name ?? null,
      username: user?.username || null,
      away: !!session.voiceRoom.members.find((member) => member.user.id === id)?.away,
      hasVideo: isMe ? !!localVideo : !!remote?.video,
    };
  });

  const renderVideo = (id: string) => {
    if (id === meId) return localVideo ? <WebVideo track={localVideo} mirror={facing === "user"} /> : null;
    const remote = remotes.find((r) => r.identity === id);
    return remote?.video ? <WebVideo track={remote.video} /> : null;
  };

  return (
    <OrbitCallScreen
      room={roomRef.current}
      title={session.title}
      subtitle={`Voice chat · ${people.length} on call · ${formatDuration(elapsed)}`}
      people={people}
      pinnedId={session.voiceRoom.startedBy?.id || null}
      renderVideo={renderVideo}
      micOn={micOn}
      cameraOn={cameraOn}
      focusOn={focusOn}
      ended={false}
      onToggleMic={toggleMic}
      onSparks={() => Alert.alert("Sparks in calls", "Sparks listens in the CosQuest phone app: it turns what people say into text on their own phones and picks out the topics. Open this call in the app to see Sparks live. After the call, its Sparks notes show in the chat here too.")}
      onPrivateCall={(person) => startPrivate({ kind: "voice", id: session.voiceRoom.id }, person.id)}
      onToggleCamera={toggleCamera}
      onFlipCamera={async () => {
        const next = await flipCamera(roomRef.current?.localParticipant, facing);
        if (next) setFacing(next);
      }}
      onToggleFocus={() => setFocusOn((value) => !value)}
      onLeave={leave}
      onMinimize={() => setVoiceMinimized(true)}
      onPeople={() => Alert.alert("Voice chat", "Everyone in this chat can join from the Call live card.")}
      extra={
        needsAudioTap ? (
          <View style={styles.tapRow}>
            <Pressable style={styles.tap} onPress={() => roomRef.current?.startAudio().then(() => setNeedsAudioTap(false))}>
              <Text style={styles.tapText}>Tap to turn on sound</Text>
            </Pressable>
          </View>
        ) : null
      }
    />
  );
}

const styles = StyleSheet.create({
  tapRow: { alignItems: "center", marginTop: 4 },
  tap: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 20, backgroundColor: "#B63D91" },
  tapText: { color: "#FFFFFF", fontWeight: "800", fontSize: 14 },
});
