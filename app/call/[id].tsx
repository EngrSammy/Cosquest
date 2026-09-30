import MaterialIcons from "@expo/vector-icons/MaterialIcons";
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
import { Stack, router, useLocalSearchParams } from "expo-router";
import { LocalVideoTrack, RoomOptions, Track } from "livekit-client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  AnimatedDots,
  CALL_COLORS,
  CallAvatar,
  CallBackground,
  CallControl,
  CallLogo,
} from "@/components/calls/CallVisuals";
import type { Call } from "@/services/calls";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { clearActiveCall } from "@/store/slices/callSlice";
import { endCall, refreshCall } from "@/store/thunks/callThunks";
import { ensureCallPermissions, getAvatarSource } from "@/utils/callHelpers";

// The backend marks an unanswered call "missed" after 45s and tells both
// phones over the socket. This local timer is only a backup.
const RING_TIMEOUT_MS = 47_000;

// Backup check while ringing, in case a call:updated socket event is missed.
const RINGING_SAFETY_POLL_MS = 5000;

// How long "Call declined" / "No answer" stays on screen before closing.
const END_MESSAGE_MS = 1400;

// Connection errors stay longer, so the real reason can be read.
const ERROR_MESSAGE_MS = 5000;

// Room settings — created ONCE here, outside the component.
// (Written inline before, they were a brand-new object on every screen
// update, which made LiveKit try to connect again and again — the
// repeated "already connected to room" lines in the logs — and could
// cause small audio glitches.)
//
// Echo cancellation / noise suppression / auto gain are on by default in
// LiveKit; they're listed explicitly so they can never be switched off
// by accident. dtx saves data when nobody speaks; red adds a little
// redundancy so a lost packet doesn't cut a word.
const ROOM_OPTIONS: RoomOptions = {
  adaptiveStream: { pixelDensity: "screen" },
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
};

// Module-level on purpose — same react-hooks/purity reason as
// generateLocalId in the chat screen.
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

// Where the other person's voice comes out.
//   Speaker ON  → loudspeaker.
//   Speaker OFF → Bluetooth earphones if connected, else wired earphones,
//                 else the phone's earpiece (the small top speaker).
// Previously Speaker OFF always forced the earpiece on Android — so with
// earphones plugged in, the sound went to the earpiece instead of the
// earphones and it seemed like nothing was coming out.
const ANDROID_PRIVATE_OUTPUTS = [
  "bluetooth",
  "headset",
  "wired_headset",
  "earpiece",
];

async function routeAudio(speakerOn: boolean) {
  try {
    if (Platform.OS === "ios") {
      // iOS already prefers connected earphones on "default".
      await AudioSession.selectAudioOutput(
        speakerOn ? "force_speaker" : "default",
      );
      return;
    }

    if (speakerOn) {
      await AudioSession.selectAudioOutput("speaker");
      return;
    }

    let available: string[] = [];

    try {
      available = (await AudioSession.getAudioOutputs()) || [];
    } catch {
      // Older devices may not report outputs — fall back to the earpiece.
    }

    const target =
      ANDROID_PRIVATE_OUTPUTS.find((output) => available.includes(output)) ||
      "earpiece";

    await AudioSession.selectAudioOutput(target);
  } catch {
    // Some devices refuse a manual route change — the call keeps working
    // on whatever route Android picked.
  }
}

function goBack() {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace("/");
  }
}

// ==========================================
// CALL SCREEN
// ==========================================

export default function CallScreen() {
  const dispatch = useAppDispatch();

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

  const leavingRef = useRef(false);
  const notifyServerRef = useRef(true);

  // Latest values for the unmount cleanup below.
  const cleanupRef = useRef({ callId, token });
  cleanupRef.current = { callId, token };

  // Opened without a matching call (stale screen, deep link).
  useEffect(() => {
    if ((!active || active.call.id !== callId) && !leavingRef.current) {
      leavingRef.current = true;
      goBack();
    }
  }, [active, callId]);

  // Audio session for as long as this screen is open.
  useEffect(() => {
    let started = false;

    (async () => {
      try {
        // Put the phone in "call mode" (Android: voice communication).
        // This is what turns on the phone's own built-in echo canceller —
        // the same one normal phone calls use.
        await AudioSession.configureAudio({
          android: {
            audioTypeOptions: AndroidAudioTypePresets.communication,
          },
          ios: {
            defaultOutput: "earpiece",
          },
        });
      } catch {
        // Older versions/devices: carry on with the defaults.
      }

      try {
        await AudioSession.startAudioSession();
        started = true;
      } catch {
        // The call still connects; audio just uses the default route.
      }
    })();

    return () => {
      if (started) {
        AudioSession.stopAudioSession();
      }
    };
  }, []);

  // However the screen closes (End button, Android back, the other person
  // leaving) → tell the backend (unless it already knows) and clear the
  // call. LiveKitRoom disconnects by itself when it unmounts.
  useEffect(() => {
    return () => {
      const { callId: endingId, token: authToken } = cleanupRef.current;

      if (notifyServerRef.current && endingId && authToken) {
        dispatch(endCall({ callId: endingId, token: authToken }));
      }

      dispatch(clearActiveCall());
    };
  }, [dispatch]);

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

  if (!active || active.call.id !== callId || !token) {
    return (
      <View style={styles.blank}>
        <Stack.Screen options={{ headerShown: false }} />
      </View>
    );
  }

  // The other person: the caller if I answered, otherwise the DM partner.
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

  return (
    <View style={styles.blank}>
      <Stack.Screen
        options={{
          headerShown: false,
          gestureEnabled: false,
          animation: "fade",
        }}
      />

      <LiveKitRoom
        serverUrl={active.livekitUrl}
        token={active.token}
        connect
        audio
        video={active.call.type === "video"}
        options={ROOM_OPTIONS}
        onError={(error) => {
          // Show and log the REAL reason (e.g. invalid token, wrong
          // LIVEKIT_URL, no network) instead of only "Connection lost".
          console.error("LIVEKIT ROOM ERROR:", error);

          const reason =
            error && typeof error === "object" && "message" in error
              ? String((error as Error).message)
              : "";

          finish(
            reason ? `Connection lost: ${reason}` : "Connection lost",
            true,
            ERROR_MESSAGE_MS,
          );
        }}>
        <CallStage
          call={active.call}
          direction={active.direction}
          displayName={displayName}
          avatarSource={getAvatarSource(otherPerson)}
          endMessage={endMessage}
          authToken={token}
          onFinish={finish}
        />
      </LiveKitRoom>
    </View>
  );
}

// ==========================================
// CALL STAGE (inside the LiveKit room)
// ==========================================

function CallStage({
  call,
  direction,
  displayName,
  avatarSource,
  endMessage,
  authToken,
  onFinish,
}: {
  call: Call;
  direction: "outgoing" | "incoming";
  displayName: string;
  avatarSource: ReturnType<typeof getAvatarSource>;
  endMessage: string | null;
  authToken: string;
  onFinish: (message: string | null, notifyServer: boolean) => void;
}) {
  const dispatch = useAppDispatch();
  const insets = useSafeAreaInsets();

  const remoteParticipants = useRemoteParticipants();
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled } =
    useLocalParticipant();

  const tracks = useTracks([Track.Source.Camera], { onlySubscribed: false });

  const localTrack = tracks.find(
    (ref): ref is TrackReference =>
      isTrackReference(ref) && ref.participant.isLocal,
  );

  // Only show the other person's video while their camera is actually on.
  const remoteTrack = tracks.find(
    (ref): ref is TrackReference =>
      isTrackReference(ref) &&
      !ref.participant.isLocal &&
      !ref.publication.isMuted,
  );

  const [answeredAt, setAnsweredAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [speakerOn, setSpeakerOn] = useState(call.type === "video");
  const [facing, setFacing] = useState<"user" | "environment">("user");

  const answered = answeredAt !== null;
  const remoteCount = remoteParticipants.length;

  const myCameraOn = isCameraEnabled && !!localTrack;

  // AUDIO ↔ VIDEO SWITCHING: it's the same call either way. As soon as
  // either camera is on, the screen shows the video layout; when both
  // cameras are off, it goes back to the Requesting/audio layout.
  const videoLayout = myCameraOn || !!remoteTrack;

  // ---------- connection ----------

  // The other person joined the room → connected.
  useEffect(() => {
    if (remoteCount > 0 && answeredAt === null) {
      setAnsweredAt(nowMs());
    }
  }, [remoteCount, answeredAt]);

  // They left after answering → end (DM calls only have two people).
  useEffect(() => {
    if (answered && remoteCount === 0) {
      onFinish("Call ended", true);
    }
  }, [answered, remoteCount, onFinish]);

  // Call timer.
  useEffect(() => {
    if (answeredAt === null) {
      return;
    }

    const interval = setInterval(() => {
      setElapsed((nowMs() - answeredAt) / 1000);
    }, 1000);

    return () => clearInterval(interval);
  }, [answeredAt]);

  // Caller, while ringing: backup check + backup timeout.
  useEffect(() => {
    if (direction !== "outgoing" || answered) {
      return;
    }

    const interval = setInterval(() => {
      dispatch(refreshCall({ callId: call.id, token: authToken }));
    }, RINGING_SAFETY_POLL_MS);

    const timeout = setTimeout(() => {
      onFinish("No answer", true);
    }, RING_TIMEOUT_MS);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [direction, answered, call.id, authToken, dispatch, onFinish]);

  // Status changes from the backend (call:updated socket event).
  useEffect(() => {
    if (call.status === "declined") {
      onFinish("Call declined", false);
    } else if (call.status === "missed") {
      onFinish("No answer", false);
    } else if (call.status === "cancelled" || call.status === "ended") {
      onFinish("Call ended", false);
    }
  }, [call.status, onFinish]);

  // ---------- audio routing ----------

  useEffect(() => {
    routeAudio(speakerOn);

    // Apply again shortly after: the audio session may still be starting
    // when the call screen first opens, and the first route can be lost.
    const retry = setTimeout(() => routeAudio(speakerOn), 1200);

    return () => clearTimeout(retry);
  }, [speakerOn]);

  // Switching into video → use the loudspeaker, like WhatsApp.
  const wasVideoLayout = useRef(videoLayout);

  useEffect(() => {
    if (videoLayout && !wasVideoLayout.current) {
      setSpeakerOn(true);
    }

    wasVideoLayout.current = videoLayout;
  }, [videoLayout]);

  // ---------- controls ----------

  const toggleMic = () => {
    localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
  };

  const toggleCamera = async () => {
    try {
      if (isCameraEnabled) {
        await localParticipant.setCameraEnabled(false);
        return;
      }

      // An audio call never asked for the camera, so ask now.
      const allowed = await ensureCallPermissions("video");

      if (allowed) {
        setFacing("user");
        await localParticipant.setCameraEnabled(true);
      }
    } catch {
      // Camera busy or unavailable — stay as we are.
    }
  };

  const flipCamera = async () => {
    const publication = localParticipant.getTrackPublication(
      Track.Source.Camera,
    );
    const track = publication?.track as LocalVideoTrack | undefined;

    if (!track) {
      return;
    }

    const next = facing === "user" ? "environment" : "user";

    try {
      await track.restartTrack({ facingMode: next });
      setFacing(next);
    } catch {
      // Only one camera on this device.
    }
  };

  const hangUp = () => onFinish(null, true);

  // ---------- status text ----------

  const waiting = !answered && !endMessage;

  const statusText = endMessage
    ? endMessage
    : answered
      ? formatDuration(elapsed)
      : direction === "outgoing"
        ? "Requesting"
        : "Connecting";

  // ==========================================
  // VIDEO LAYOUT (Figma: video-call-screen)
  // ==========================================

  if (videoLayout) {
    const localFullScreen = myCameraOn && !remoteTrack;

    return (
      <View style={styles.videoRoot}>
        {remoteTrack ? (
          <VideoTrack
            trackRef={remoteTrack}
            style={StyleSheet.absoluteFill}
            objectFit="cover"
          />
        ) : localFullScreen ? (
          <VideoTrack
            trackRef={localTrack!}
            style={StyleSheet.absoluteFill}
            objectFit="cover"
            mirror={facing === "user"}
          />
        ) : null}

        {/* Name + timer pill */}
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
        </View>

        {/* Your own camera, top-right */}
        {myCameraOn && remoteTrack ? (
          <View style={[styles.selfPreview, { top: insets.top + 84 }]}>
            <VideoTrack
              trackRef={localTrack!}
              style={StyleSheet.absoluteFill}
              objectFit="cover"
              mirror={facing === "user"}
              zOrder={1}
            />
            <Text style={styles.selfLabel}>You</Text>
          </View>
        ) : null}

        {/* Flip · Mute · Camera · Speaker · End */}
        <View style={[styles.videoBar, { bottom: insets.bottom + 18 }]}>
          <CallControl
            variant="solid"
            icon="camera-reverse-outline"
            label="Flip"
            onPress={flipCamera}
            disabled={!myCameraOn}
          />
          <CallControl
            variant="solid"
            icon={isMicrophoneEnabled ? "mic-outline" : "mic-off-outline"}
            label="Mute"
            active={!isMicrophoneEnabled}
            onPress={toggleMic}
          />
          <CallControl
            variant="solid"
            icon={isCameraEnabled ? "videocam-outline" : "videocam-off-outline"}
            label="Camera"
            active={isCameraEnabled}
            onPress={toggleCamera}
          />
          <CallControl
            variant="solid"
            icon="volume-high-outline"
            label="Speaker"
            active={speakerOn}
            onPress={() => setSpeakerOn((current) => !current)}
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

  // ==========================================
  // AUDIO / REQUESTING LAYOUT (Figma: cosquest-call-request)
  // ==========================================

  return (
    <CallBackground>
      <View style={[styles.audioTop, { paddingTop: insets.top + 24 }]}>
        <CallLogo />
      </View>

      <View style={styles.audioCenter}>
        <CallAvatar source={avatarSource} />

        <Text style={styles.audioName} numberOfLines={1}>
          {displayName}
        </Text>

        <View style={styles.audioStatusRow}>
          <Text style={styles.audioStatus}>{statusText}</Text>
          {waiting ? <AnimatedDots /> : null}
        </View>
      </View>

      <View style={[styles.audioCard, { marginBottom: insets.bottom + 20 }]}>
        <View style={styles.audioControls}>
          <CallControl
            icon={isMicrophoneEnabled ? "mic-off-outline" : "mic-off"}
            label="Mute"
            active={!isMicrophoneEnabled}
            onPress={toggleMic}
          />
          <CallControl
            icon="volume-high-outline"
            label="Speaker"
            active={speakerOn}
            onPress={() => setSpeakerOn((current) => !current)}
          />
          <CallControl
            icon="videocam-outline"
            label="Video"
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
            {answered || direction === "incoming" ? "End Call" : "Cancel Call"}
          </Text>
        </Pressable>
      </View>
    </CallBackground>
  );
}

// ==========================================
// STYLES
// ==========================================

const styles = StyleSheet.create({
  blank: { flex: 1, backgroundColor: "#1B0714" },

  // AUDIO / REQUESTING

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
  },

  audioCard: {
    marginHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 22,
    paddingHorizontal: 20,
    borderRadius: 26,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
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

  // VIDEO

  videoRoot: { flex: 1, backgroundColor: "#0D0D12" },

  topPillRow: { position: "absolute", left: 0, right: 0, alignItems: "center" },

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
    width: 104,
    height: 150,
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
    flexDirection: "row",
    justifyContent: "space-between",
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
