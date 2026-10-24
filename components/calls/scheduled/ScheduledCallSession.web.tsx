// ==========================================
// SCHEDULED CALL (website): the call's own room, shown as the orbit
// ==========================================
// Same as ScheduledCallSession.tsx, with the browser's LiveKit.
import { LocalVideoTrack, Room, RoomEvent, Track, VideoTrack, type RemoteTrack } from "livekit-client";
import { useEffect, useRef, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";

import OrbitCallScreen, { type OrbitPerson } from "@/components/calls/OrbitCall";
import { useAppSelector } from "@/store/hooks";
import { getAvatarSource } from "@/utils/callHelpers";

import { leaveScheduledCall, loadWaiting, setScheduledMinimized, type ScheduledSession } from "./scheduledCallJoin";
import { WaitingPill, WaitingRoomSheet, useWaitingRoom } from "./WaitingRoomPanel";

type Connected = Extract<ScheduledSession, { phase: "connected" }>;
type Remote = { identity: string; name: string; video: VideoTrack | null; micOn: boolean };

function formatDuration(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
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
    <video ref={ref} autoPlay playsInline muted style={{ width: "100%", height: "100%", objectFit: "cover", transform: mirror ? "scaleX(-1)" : undefined }} />
  );
}

export default function ScheduledCallSession({ session }: { session: Connected }) {
  const { call } = session;
  const myUserId = useAppSelector((state) => state.call.myUserId);
  const roomRef = useRef<Room | null>(null);
  const audioElements = useRef<HTMLMediaElement[]>([]);
  const leftRef = useRef(false);
  const focusRef = useRef(false);

  const [remotes, setRemotes] = useState<Remote[]>([]);
  const [speakingIds, setSpeakingIds] = useState<string[]>([]);
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(false);
  const [localVideo, setLocalVideo] = useState<LocalVideoTrack | null>(null);
  const [focusOn, setFocusOn] = useState(false);
  const [needsAudioTap, setNeedsAudioTap] = useState(false);
  const [startedAt] = useState(() => Date.now());
  const [elapsed, setElapsed] = useState(0);
  focusRef.current = focusOn;
  const hosting = Boolean(call.canManage);
  const waitingRoom = useWaitingRoom(call);

  const leave = () => {
    if (leftRef.current) return;
    leftRef.current = true;
    leaveScheduledCall();
  };

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
        list.push({ identity: participant.identity, name: participant.name || "", video, micOn: participant.isMicrophoneEnabled });
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
        await room.localParticipant.setMicrophoneEnabled(true);
        setNeedsAudioTap(!room.canPlaybackAudio);
      } catch (error) {
        console.error("SCHEDULED CALL ERROR (web):", error);
        Alert.alert("Call", "Couldn't connect to the call.");
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
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.livekitUrl, session.token]);

  useEffect(() => {
    const timer = setInterval(() => setElapsed((Date.now() - startedAt) / 1000), 1000);
    return () => clearInterval(timer);
  }, [startedAt]);

  useEffect(() => {
    if (hosting) loadWaiting(call.id);
  }, [hosting, call.id]);

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
    if (!session.videoEnabled) {
      Alert.alert("Video", "The host turned off video for this call.");
      return;
    }
    const next = !cameraOn;
    try {
      await room.localParticipant.setCameraEnabled(next);
      setCameraOn(next);
      const publication = room.localParticipant.getTrackPublication(Track.Source.Camera);
      setLocalVideo(next && publication?.track ? (publication.track as LocalVideoTrack) : null);
    } catch {}
  };

  const meId = myUserId || roomRef.current?.localParticipant.identity || "";
  const known = new Map([call.host, ...call.participants].map((person) => [person.id, person]));
  const ids = [...new Set([meId, ...remotes.map((r) => r.identity)])].filter(Boolean);

  const people: OrbitPerson[] = ids.map((id) => {
    const isMe = id === meId;
    const remote = remotes.find((r) => r.identity === id);
    const user = known.get(id);
    return {
      id,
      name: user?.name || user?.username || remote?.name || (isMe ? "You" : "Someone"),
      avatar: user ? getAvatarSource(user) : null,
      speaking: speakingIds.includes(id),
      micOff: isMe ? !micOn : remote ? !remote.micOn : false,
      isMe,
      username: user?.username || null,
      hasVideo: isMe ? !!localVideo : !!remote?.video,
    };
  });

  const renderVideo = (id: string) => {
    if (id === meId) return localVideo ? <WebVideo track={localVideo} mirror /> : null;
    const remote = remotes.find((r) => r.identity === id);
    return remote?.video ? <WebVideo track={remote.video} /> : null;
  };

  return (
    <>
      <OrbitCallScreen
        title={call.topic}
        subtitle={`Scheduled call · ${people.length} on call · ${formatDuration(elapsed)}`}
        people={people}
        pinnedId={call.host?.id || null}
        renderVideo={renderVideo}
        micOn={micOn}
        cameraOn={cameraOn}
        focusOn={focusOn}
        ended={false}
        onToggleMic={toggleMic}
        onToggleCamera={toggleCamera}
        onToggleFocus={() => setFocusOn((value) => !value)}
        onLeave={leave}
        onMinimize={() => setScheduledMinimized(true)}
        onPeople={() =>
          hosting ? waitingRoom.setOpen(true) : Alert.alert("Scheduled call", "People invited to this call join from its Call details.")
        }
        extra={
          <>
            {needsAudioTap ? (
              <View style={styles.tapRow}>
                <Pressable style={styles.tap} onPress={() => roomRef.current?.startAudio().then(() => setNeedsAudioTap(false))}>
                  <Text style={styles.tapText}>Tap to turn on sound</Text>
                </Pressable>
              </View>
            ) : null}
            {hosting ? <WaitingPill count={waitingRoom.count} onPress={() => waitingRoom.setOpen(true)} /> : null}
          </>
        }
      />
      {hosting ? (
        <WaitingRoomSheet call={call} ids={waitingRoom.ids} visible={waitingRoom.open} onClose={() => waitingRoom.setOpen(false)} />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  tapRow: { alignItems: "center", marginTop: 4 },
  tap: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 20, backgroundColor: "#B63D91" },
  tapText: { color: "#FFFFFF", fontWeight: "800", fontSize: 14 },
});
