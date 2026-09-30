// ==========================================
// CALL SCREEN — WEB VERSION
// ==========================================
// Expo automatically uses this file in the browser and app/call/[id].tsx
// on phones. Same backend, same call flow, same design — the only
// difference is HOW it connects to LiveKit:
//   phones  → @livekit/react-native (native WebRTC)
//   browser → livekit-client (the browser's built-in WebRTC)
//
// Not available on web (browser limits, not bugs):
//   - choosing loudspeaker vs earpiece (the browser decides)
//   - flipping front/back camera
//   - ringing when the website is closed (no push notifications)

import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Stack, router, useLocalSearchParams } from "expo-router";
import {
      LocalVideoTrack,
      RemoteTrack,
      Room,
      RoomEvent,
      Track,
      VideoTrack,
} from "livekit-client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
      AnimatedDots,
      CALL_COLORS,
      CallAvatar,
      CallBackground,
      CallControl,
      CallLogo,
} from "@/components/calls/CallVisuals";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { clearActiveCall } from "@/store/slices/callSlice";
import { endCall, refreshCall } from "@/store/thunks/callThunks";
import { getAvatarSource } from "@/utils/callHelpers";

// Same timings as the phone version.
const RING_TIMEOUT_MS = 47_000;
const RINGING_SAFETY_POLL_MS = 5000;
const END_MESSAGE_MS = 1400;
const ERROR_MESSAGE_MS = 5000;

function nowMs() {
  return Date.now();
}

function formatDuration(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = (seconds % 60).toString().padStart(2, "0");

  return hours > 0
    ? `${hours}:${minutes.toString().padStart(2, "0")}:${rest}`
    : `${minutes.toString().padStart(2, "0")}:${rest}`;
}

function goBack() {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace("/");
  }
}

// ==========================================
// VIDEO ELEMENT
// ==========================================
// A real HTML <video> — fine here because this file only ever runs in a
// browser.

function WebVideo({
  track,
  mirror,
  style,
}: {
  track: VideoTrack;
  mirror?: boolean;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const element = ref.current;

    if (!element) {
      return;
    }

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
      style={{
        width: "100%",
        height: "100%",
        objectFit: "cover",
        transform: mirror ? "scaleX(-1)" : undefined,
        ...style,
      }}
    />
  );
}

// ==========================================
// CALL SCREEN
// ==========================================

export default function CallScreenWeb() {
  const dispatch = useAppDispatch();
  const insets = useSafeAreaInsets();

  const { id } = useLocalSearchParams<{ id: string }>();
  const callId = Array.isArray(id) ? id[0] : id;

  const token = useAppSelector((state) => state.auth.token);
  const active = useAppSelector((state) => state.call.active);

  const conversation = useAppSelector((state) =>
    active
      ? state.chat.conversationDetails[active.call.conversationId]
      : undefined,
  );

  const [endMessage, setEndMessage] = useState<string | null>(null);
  const [remoteCount, setRemoteCount] = useState(0);
  const [answeredAt, setAnsweredAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(false);
  const [localVideo, setLocalVideo] = useState<LocalVideoTrack | null>(null);
  const [remoteVideo, setRemoteVideo] = useState<VideoTrack | null>(null);
  // Some browsers (especially Safari on iPhone) block sound until the
  // user taps something on the page.
  const [needsAudioTap, setNeedsAudioTap] = useState(false);

  const roomRef = useRef<Room | null>(null);
  const audioElementsRef = useRef<HTMLMediaElement[]>([]);
  const leavingRef = useRef(false);
  const notifyServerRef = useRef(true);

  const cleanupRef = useRef({ callId, token });
  cleanupRef.current = { callId, token };

  const finish = useCallback(
    (
      message: string | null,
      notifyServer: boolean,
      delayMs: number = END_MESSAGE_MS,
    ) => {
      if (leavingRef.current) {
        return;
      }

      leavingRef.current = true;
      notifyServerRef.current = notifyServer;

      if (message) {
        setEndMessage(message);
        setTimeout(goBack, delayMs);
      } else {
        goBack();
      }
    },
    [],
  );

  // Opened without a matching call (stale tab, refreshed page, deep link).
  useEffect(() => {
    if ((!active || active.call.id !== callId) && !leavingRef.current) {
      leavingRef.current = true;
      goBack();
    }
  }, [active, callId]);

  // Tell the backend + clear the call however this screen closes.
  useEffect(() => {
    return () => {
      const { callId: endingId, token: authToken } = cleanupRef.current;

      if (notifyServerRef.current && endingId && authToken) {
        dispatch(endCall({ callId: endingId, token: authToken }));
      }

      dispatch(clearActiveCall());
    };
  }, [dispatch]);

  // ---------- connect to LiveKit ----------

  const livekitUrl = active?.livekitUrl;
  const livekitToken = active?.token;
  const isVideoCall = active?.call.type === "video";

  useEffect(() => {
    if (!livekitUrl || !livekitToken) {
      return;
    }

    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
      audioCaptureDefaults: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      publishDefaults: {
        dtx: true,
        red: true,
      },
    });

    roomRef.current = room;

    const updateRemoteCount = () => {
      setRemoteCount(room.remoteParticipants.size);
    };

    const handleTrackSubscribed = (track: RemoteTrack) => {
      if (track.kind === Track.Kind.Audio) {
        // Remote voice: play it through a hidden <audio> element.
        const element = track.attach();
        element.style.display = "none";
        document.body.appendChild(element);
        audioElementsRef.current.push(element);
      } else if (track.kind === Track.Kind.Video) {
        setRemoteVideo(track as VideoTrack);
      }
    };

    const handleTrackUnsubscribed = (track: RemoteTrack) => {
      track.detach().forEach((element) => element.remove());

      if (track.kind === Track.Kind.Video) {
        setRemoteVideo((current) => (current === track ? null : current));
      }
    };

    const handleRemoteMuteChange = () => {
      // Hide the other person's video while their camera is off.
      let found: VideoTrack | null = null;

      room.remoteParticipants.forEach((participant) => {
        participant.videoTrackPublications.forEach((publication) => {
          if (
            publication.track &&
            !publication.isMuted &&
            publication.source === Track.Source.Camera
          ) {
            found = publication.track as VideoTrack;
          }
        });
      });

      setRemoteVideo(found);
    };

    const handleLocalTrackPublished = () => {
      const publication = room.localParticipant.getTrackPublication(
        Track.Source.Camera,
      );

      setLocalVideo(
        publication?.track && !publication.isMuted
          ? (publication.track as LocalVideoTrack)
          : null,
      );
    };

    room
      .on(RoomEvent.ParticipantConnected, updateRemoteCount)
      .on(RoomEvent.ParticipantDisconnected, updateRemoteCount)
      .on(RoomEvent.TrackSubscribed, handleTrackSubscribed)
      .on(RoomEvent.TrackUnsubscribed, handleTrackUnsubscribed)
      .on(RoomEvent.TrackMuted, handleRemoteMuteChange)
      .on(RoomEvent.TrackUnmuted, handleRemoteMuteChange)
      .on(RoomEvent.LocalTrackPublished, handleLocalTrackPublished)
      .on(RoomEvent.LocalTrackUnpublished, handleLocalTrackPublished)
      .on(RoomEvent.AudioPlaybackStatusChanged, () => {
        setNeedsAudioTap(!room.canPlaybackAudio);
      })
      .on(RoomEvent.Disconnected, () => {
        if (!leavingRef.current) {
          finish("Call ended", true);
        }
      });

    let cancelled = false;

    (async () => {
      try {
        await room.connect(livekitUrl, livekitToken);

        if (cancelled) {
          return;
        }

        updateRemoteCount();

        // The browser shows its own microphone / camera permission popup here.
        await room.localParticipant.setMicrophoneEnabled(true);
        setMicOn(true);

        if (isVideoCall) {
          await room.localParticipant.setCameraEnabled(true);
          setCameraOn(true);
          handleLocalTrackPublished();
        }

        setNeedsAudioTap(!room.canPlaybackAudio);
      } catch (error) {
        console.error("LIVEKIT ROOM ERROR (web):", error);

        const reason =
          error && typeof error === "object" && "message" in error
            ? String((error as Error).message)
            : "";

        finish(
          reason ? `Connection lost: ${reason}` : "Connection lost",
          true,
          ERROR_MESSAGE_MS,
        );
      }
    })();

    return () => {
      cancelled = true;

      audioElementsRef.current.forEach((element) => element.remove());
      audioElementsRef.current = [];

      room.removeAllListeners();
      room.disconnect();
      roomRef.current = null;
    };
  }, [livekitUrl, livekitToken, isVideoCall, finish]);

  // ---------- connection state ----------

  const answered = answeredAt !== null;

  useEffect(() => {
    if (remoteCount > 0 && answeredAt === null) {
      setAnsweredAt(nowMs());
    }
  }, [remoteCount, answeredAt]);

  useEffect(() => {
    if (answered && remoteCount === 0) {
      finish("Call ended", true);
    }
  }, [answered, remoteCount, finish]);

  useEffect(() => {
    if (answeredAt === null) {
      return;
    }

    const interval = setInterval(() => {
      setElapsed((nowMs() - answeredAt) / 1000);
    }, 1000);

    return () => clearInterval(interval);
  }, [answeredAt]);

  const direction = active?.direction;
  const activeCallId = active?.call.id;

  // Caller, while ringing: backup check + backup timeout.
  useEffect(() => {
    if (direction !== "outgoing" || answered || !activeCallId || !token) {
      return;
    }

    const interval = setInterval(() => {
      dispatch(refreshCall({ callId: activeCallId, token }));
    }, RINGING_SAFETY_POLL_MS);

    const timeout = setTimeout(() => {
      finish("No answer", true);
    }, RING_TIMEOUT_MS);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [direction, answered, activeCallId, token, dispatch, finish]);

  // Status changes from the backend (call:updated socket event).
  const status = active?.call.status;

  useEffect(() => {
    if (status === "declined") {
      finish("Call declined", false);
    } else if (status === "missed") {
      finish("No answer", false);
    } else if (status === "cancelled" || status === "ended") {
      finish("Call ended", false);
    }
  }, [status, finish]);

  // ---------- controls ----------

  const toggleMic = async () => {
    const room = roomRef.current;

    if (!room) {
      return;
    }

    const next = !micOn;

    try {
      await room.localParticipant.setMicrophoneEnabled(next);
      setMicOn(next);
    } catch {
      // Microphone blocked by the browser — stay as we are.
    }
  };

  const toggleCamera = async () => {
    const room = roomRef.current;

    if (!room) {
      return;
    }

    const next = !cameraOn;

    try {
      await room.localParticipant.setCameraEnabled(next);
      setCameraOn(next);

      const publication = room.localParticipant.getTrackPublication(
        Track.Source.Camera,
      );

      setLocalVideo(
        next && publication?.track
          ? (publication.track as LocalVideoTrack)
          : null,
      );
    } catch {
      // Camera blocked or busy — stay as we are.
    }
  };

  const enableAudio = async () => {
    try {
      await roomRef.current?.startAudio();
      setNeedsAudioTap(false);
    } catch {
      // Still blocked — the button stays visible.
    }
  };

  const hangUp = () => finish(null, true);

  // ---------- render ----------

  if (!active || active.call.id !== callId || !token) {
    return (
      <View style={styles.blank}>
        <Stack.Screen options={{ headerShown: false }} />
      </View>
    );
  }

  const otherPerson =
    active.direction === "incoming"
      ? active.call.caller
      : conversation?.otherParticipant || null;

  const displayName =
    active.direction === "incoming"
      ? active.call.caller?.name || active.call.caller?.username || "Call"
      : conversation?.title ||
        conversation?.otherParticipant?.username ||
        "Call";

  const waiting = !answered && !endMessage;

  const statusText = endMessage
    ? endMessage
    : answered
      ? formatDuration(elapsed)
      : active.direction === "outgoing"
        ? "Requesting"
        : "Connecting";

  const videoLayout = !!localVideo || !!remoteVideo;

  const audioTapButton = needsAudioTap ? (
    <Pressable style={styles.audioTap} onPress={enableAudio}>
      <Text style={styles.audioTapText}>Tap to turn on sound</Text>
    </Pressable>
  ) : null;

  if (videoLayout) {
    return (
      <View style={styles.videoRoot}>
        <Stack.Screen options={{ headerShown: false }} />

        <View style={StyleSheet.absoluteFill}>
          {remoteVideo ? (
            <WebVideo track={remoteVideo} />
          ) : localVideo ? (
            <WebVideo track={localVideo} mirror />
          ) : null}
        </View>

        <View style={[styles.topPillRow, { top: insets.top + 12 }]}>
          <View style={styles.topPill}>
            <Text style={styles.topPillName} numberOfLines={1}>
              {displayName}
            </Text>
            <View style={styles.topPillStatusRow}>
              {answered && !endMessage ? <View style={styles.liveDot} /> : null}
              <Text style={styles.topPillStatus}>{statusText}</Text>
              {waiting ? <AnimatedDots /> : null}
            </View>
          </View>
          {audioTapButton}
        </View>

        {localVideo && remoteVideo ? (
          <View style={[styles.selfPreview, { top: insets.top + 84 }]}>
            <WebVideo track={localVideo} mirror />
            <Text style={styles.selfLabel}>You</Text>
          </View>
        ) : null}

        <View style={[styles.videoBar, { bottom: insets.bottom + 18 }]}>
          <CallControl
            variant="solid"
            icon={micOn ? "mic-outline" : "mic-off-outline"}
            label="Mute"
            active={!micOn}
            onPress={toggleMic}
          />
          <CallControl
            variant="solid"
            icon={cameraOn ? "videocam-outline" : "videocam-off-outline"}
            label="Camera"
            active={cameraOn}
            onPress={toggleCamera}
          />

          <View style={styles.endItem}>
            <Pressable
              style={styles.endRound}
              onPress={hangUp}
              disabled={!!endMessage}
              accessibilityRole="button"
              accessibilityLabel="End call">
              <MaterialIcons name="call-end" size={26} color="#FFFFFF" />
            </Pressable>
            <Text style={styles.endLabel}>End</Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <CallBackground>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={[styles.audioTop, { paddingTop: insets.top + 24 }]}>
        <CallLogo />
      </View>

      <View style={styles.audioCenter}>
        <CallAvatar source={getAvatarSource(otherPerson)} />

        <Text style={styles.audioName} numberOfLines={1}>
          {displayName}
        </Text>

        <View style={styles.audioStatusRow}>
          <Text style={styles.audioStatus}>{statusText}</Text>
          {waiting ? <AnimatedDots /> : null}
        </View>

        {audioTapButton}
      </View>

      <View style={[styles.audioCard, { marginBottom: insets.bottom + 20 }]}>
        <View style={styles.audioControls}>
          <CallControl
            icon={micOn ? "mic-off-outline" : "mic-off"}
            label="Mute"
            active={!micOn}
            onPress={toggleMic}
          />
          <CallControl
            icon="videocam-outline"
            label="Video"
            active={cameraOn}
            onPress={toggleCamera}
          />
        </View>

        <Pressable
          style={[styles.endPill, !!endMessage && styles.endPillDisabled]}
          onPress={hangUp}
          disabled={!!endMessage}
          accessibilityRole="button"
          accessibilityLabel={answered ? "End call" : "Cancel call"}>
          <MaterialIcons name="call-end" size={22} color="#FFFFFF" />
          <Text style={styles.endPillText}>
            {answered || active.direction === "incoming"
              ? "End Call"
              : "Cancel Call"}
          </Text>
        </Pressable>
      </View>
    </CallBackground>
  );
}

// ==========================================
// STYLES (same look as the phone version)
// ==========================================

const styles = StyleSheet.create({
  blank: { flex: 1, backgroundColor: "#1B0714" },

  audioTop: { alignItems: "center" },

  audioCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },

  audioName: {
    fontSize: 32,
    fontWeight: "800",
    color: CALL_COLORS.text,
    marginTop: 18,
    maxWidth: "90%",
  },

  audioStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    paddingHorizontal: 24,
    flexWrap: "wrap",
    justifyContent: "center",
  },

  audioStatus: {
    fontSize: 16,
    color: CALL_COLORS.muted,
    fontVariant: ["tabular-nums"],
    textAlign: "center",
  },

  audioTap: {
    marginTop: 16,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: CALL_COLORS.pink,
  },

  audioTapText: { color: "#FFFFFF", fontWeight: "800", fontSize: 14 },

  audioCard: {
    marginHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 22,
    paddingHorizontal: 20,
    borderRadius: 26,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    maxWidth: 520,
    width: "100%",
    alignSelf: "center",
  },

  audioControls: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 24,
  },

  endPill: {
    height: 54,
    borderRadius: 27,
    backgroundColor: CALL_COLORS.red,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },

  endPillDisabled: { opacity: 0.6 },

  endPillText: { color: "#FFFFFF", fontSize: 17, fontWeight: "800" },

  videoRoot: { flex: 1, backgroundColor: "#0D0D12" },

  topPillRow: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
  },

  topPill: {
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: "rgba(15,15,20,0.55)",
    maxWidth: "70%",
  },

  topPillName: { color: "#FFFFFF", fontSize: 17, fontWeight: "800" },

  topPillStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 2,
  },

  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: CALL_COLORS.green,
  },

  topPillStatus: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 13,
    fontVariant: ["tabular-nums"],
  },

  selfPreview: {
    position: "absolute",
    right: 14,
    width: 120,
    height: 170,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#2A1030",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
  },

  selfLabel: {
    position: "absolute",
    left: 8,
    bottom: 6,
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
  },

  videoBar: {
    position: "absolute",
    left: 14,
    right: 14,
    maxWidth: 520,
    alignSelf: "center",
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "flex-start",
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: 28,
    backgroundColor: "rgba(20,20,26,0.72)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },

  endItem: { alignItems: "center", minWidth: 64 },

  endRound: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: CALL_COLORS.red,
    alignItems: "center",
    justifyContent: "center",
  },

  endLabel: {
    color: CALL_COLORS.muted,
    fontSize: 12,
    fontWeight: "600",
    marginTop: 8,
  },
});
