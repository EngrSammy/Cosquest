// ==========================================
// DEV ONLY: the big-call stage with hundreds of fake people
// ==========================================
// Development builds only (production redirects home). Open
//   /dev/big-call          300 people
//   /dev/big-call?n=1234   any number
// It renders the real StageLayout and participant list over a fake
// LiveKit room (components/calls/devMockBigCall.ts): people "talk", one
// joins every 4 seconds, and a fifth of them have a camera on. The line at
// the top shows how many cameras are actually being received (only the
// tiles on screen).
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Ionicons } from "@expo/vector-icons";
import { Redirect, useLocalSearchParams } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import AddPeopleSheet from "@/components/calls/AddPeopleSheet";
import { CALL_COLORS, CallControl } from "@/components/calls/CallVisuals";
import { useStageVisible } from "@/components/calls/callSubscriptions";
import { createMockBigCall } from "@/components/calls/devMockBigCall";
import StageLayout, {
  type RenderStageVideo,
} from "@/components/calls/StageLayout";

// A stand-in for a camera picture.
const renderFakeVideo: RenderStageVideo = () => (
  <LinearGradient
    colors={["#3FD3E0", "#5B2A86", "#C5399A"]}
    start={{ x: 0, y: 0 }}
    end={{ x: 1, y: 1 }}
    style={[StyleSheet.absoluteFill, styles.fakeVideo]}>
    <Ionicons name="videocam" size={22} color="rgba(255,255,255,0.85)" />
  </LinearGradient>
);

export default function DevBigCall() {
  if (!__DEV__) {
    return <Redirect href="/" />;
  }

  return <DevBigCallScreen />;
}

function DevBigCallScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ n?: string }>();
  const count = Math.max(2, Math.min(5000, Number(params.n) || 300));

  const [mock] = useState(() => createMockBigCall(count));
  const [addOpen, setAddOpen] = useState(false);
  const [receiving, setReceiving] = useState(0);

  const visible = useStageVisible();

  useEffect(() => {
    const stop = mock.start();
    const timer = setInterval(() => setReceiving(mock.receivingCount()), 500);

    return () => {
      clearInterval(timer);
      stop();
    };
  }, [mock]);

  const controls = (
    <View style={[styles.videoBar, { bottom: insets.bottom + 18 }]}>
      <CallControl variant="solid" icon="mic-outline" label="Mute" onPress={() => {}} />
      <CallControl variant="solid" icon="videocam-off-outline" label="Camera" onPress={() => {}} />
      <CallControl variant="solid" icon="volume-high-outline" label="Speaker" active onPress={() => {}} />
      <CallControl variant="solid" icon="person-add-outline" label="Add" onPress={() => setAddOpen(true)} />
      <View style={styles.endItem}>
        <Pressable style={styles.endRound}>
          <MaterialIcons name="call-end" size={26} color="#FFFFFF" />
        </Pressable>
        <Text style={styles.endLabel}>End</Text>
      </View>
    </View>
  );

  return (
    <View style={styles.root}>
      <StageLayout
        room={mock.room}
        call={mock.call}
        title="Town hall"
        status="12:04"
        live
        waiting={false}
        mirrorSelf
        renderVideo={renderFakeVideo}
        controls={controls}
        overlay={
          <AddPeopleSheet
            visible={addOpen}
            call={mock.call}
            myUserId="me"
            onClose={() => setAddOpen(false)}
          />
        }
      />

      <Text style={[styles.devLine, { top: insets.top + 2 }]} pointerEvents="none">
        DEV MOCK · {visible?.size ?? 0} people on screen · {receiving} cameras
        received (of {Math.floor(mock.call.members.length / 5)} switched on)
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0D0D12" },

  fakeVideo: { alignItems: "center", justifyContent: "center", gap: 6 },

  devLine: {
    position: "absolute",
    left: 0,
    right: 0,
    textAlign: "center",
    fontSize: 10,
    color: CALL_COLORS.teal,
  },

  videoBar: {
    position: "absolute",
    left: 14,
    right: 14,
    maxWidth: 520,
    marginHorizontal: "auto",
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
