// ==========================================
// PRIVATE CALL ON TOP (Group Calls doc · board "Call layering")
// ==========================================
// Mounted once in app/_layout.tsx, above the call screens.
//   Ringing:  a small card at the top ("Mary wants a private call" ·
//             Decline / Accept). The main call stays on screen.
//   In it:    the sheet from the board - "PRIVATE CALL [00:00]", You — them,
//             Mic · Video · Share · End, and "Faction call · N on call ·
//             Back to faction". The main call keeps going underneath,
//             quieter, with your mic off there (CallSession / voice chat).
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useVoiceSession } from "@/components/voice/voiceUi";
import { themedStyles, useInk, useThemedStyles } from "@/constants/chatTheme";
import { FONTS } from "@/constants/fonts";
import { personName, type CallPerson } from "@/services/calls";
import { useAppSelector } from "@/store/hooks";
import { getAvatarSource } from "@/utils/callHelpers";

import PrivateCallAudio from "./PrivateCallAudio";
import { acceptPrivate, declinePrivate, endPrivate, usePrivateIncoming, usePrivateSession } from "./privateCall";

const PINK = "#C34D9C";
const INK = "#24283C";
const MUTED = "#66738A";
const RED = "#E5384B";

function clock(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function Circle({ person, label, styles }: { person: CallPerson | null; label: string; styles: any }) {
  return (
    <View style={styles.personCol}>
      <View style={styles.personRing}>
        <Image source={getAvatarSource(person) as any} style={styles.personAvatar} contentFit="cover" />
      </View>
      <Text style={styles.personLabel} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function Control({
  icon,
  label,
  onPress,
  active,
  danger,
  styles,
  ink,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  active?: boolean;
  danger?: boolean;
  styles: any;
  ink: any;
}) {
  return (
    <View style={styles.control}>
      <Pressable
        onPress={onPress}
        style={[styles.controlBtn, active && styles.controlBtnOn, danger && styles.controlBtnEnd]}
        accessibilityRole="button"
        accessibilityLabel={label}>
        <Ionicons name={icon} size={danger ? 26 : 22} color={danger || active ? "#FFFFFF" : ink.text(INK)} />
      </Pressable>
      <Text style={styles.controlLabel}>{label}</Text>
    </View>
  );
}

export default function PrivateCallLayer() {
  const styles = useThemedStyles(STYLE_PAIR);
  const ink = useInk();
  const insets = useSafeAreaInsets();
  const incoming = usePrivateIncoming();
  const session = usePrivateSession();
  const myUserId = useAppSelector((state) => state.call.myUserId);
  const mainCall = useAppSelector((state) => state.call.active?.call || null);
  const voice = useVoiceSession();
  const authUser = useAppSelector((state) => state.auth.user) as any;
  const me: CallPerson = {
    id: myUserId || "",
    avatarKey: authUser?.profile?.avatarKey || null,
    avatarPhotoUrl: authUser?.profile?.avatarPhotoUrl || null,
  };

  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());

  // Timer from the moment the other person answers.
  const answered = !!session && session.call.status === "accepted";
  useEffect(() => {
    if (!answered) return setStartedAt(null);
    setStartedAt((value) => value ?? Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [answered]);

  // ---------- ringing for you ----------
  if (incoming && !session) {
    const caller = incoming.caller;
    return (
      <View pointerEvents="box-none" style={[styles.layer, { paddingTop: insets.top + 10 }]}>
        <View style={styles.ringCard}>
          <Image source={getAvatarSource(caller) as any} style={styles.ringAvatar} contentFit="cover" />
          <View style={styles.flex}>
            <View style={styles.ringTitleRow}>
              <Ionicons name="lock-closed" size={12} color={ink.text(PINK)} />
              <Text style={styles.ringKicker}>PRIVATE CALL</Text>
            </View>
            <Text style={styles.ringName} numberOfLines={1}>
              {personName(caller)} wants a private call
            </Text>
          </View>
          <Pressable style={[styles.ringBtn, styles.ringDecline]} onPress={declinePrivate} accessibilityLabel="Decline">
            <Ionicons name="close" size={22} color="#FFFFFF" />
          </Pressable>
          <Pressable style={[styles.ringBtn, styles.ringAccept]} onPress={acceptPrivate} accessibilityLabel="Accept">
            <Ionicons name="call" size={20} color="#FFFFFF" />
          </Pressable>
        </View>
      </View>
    );
  }

  if (!session) return null;

  // ---------- in a private call ----------
  const other =
    session.call.members.find((member) => member.user.id !== myUserId)?.user ||
    (session.call.caller.id !== myUserId ? session.call.caller : null);
  const otherName = personName(other);

  // The call or voice chat underneath.
  const mainLabel =
    session.from.kind === "voice"
      ? voice?.title || "Voice chat"
      : mainCall && mainCall.id === session.from.id
        ? "Faction call"
        : "Group call";
  const mainCount =
    session.from.kind === "voice"
      ? voice?.voiceRoom.memberCount || 0
      : mainCall && mainCall.id === session.from.id
        ? mainCall.members.filter((member) => member.status === "joined").length
        : 0;

  const status = answered
    ? clock(((startedAt ? now - startedAt : 0) as number) / 1000)
    : session.direction === "outgoing"
      ? "Ringing…"
      : "Connecting…";

  return (
    <View pointerEvents="box-none" style={styles.layer}>
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.handle} />
        <View style={styles.sheetHead}>
          <Ionicons name="call-outline" size={16} color={ink.text(PINK)} />
          <Text style={styles.kicker}>PRIVATE CALL</Text>
          <View style={styles.flex} />
          <Text style={styles.timer}>{status}</Text>
        </View>

        <PrivateCallAudio livekitUrl={session.livekitUrl} token={session.token}>
          {({ micOn, toggleMic }) => (
            <>
              {/* You — them */}
              <View style={styles.pair}>
                <Circle person={me} label="You" styles={styles} />
                <View style={styles.link} />
                <Circle person={other} label={otherName} styles={styles} />
              </View>

              <View style={styles.controls}>
                <Control
                  icon={micOn ? "mic-outline" : "mic-off-outline"}
                  label="Mic"
                  active={!micOn}
                  onPress={toggleMic}
                  styles={styles}
                  ink={ink}
                />
                <Control
                  icon="videocam-outline"
                  label="Video"
                  onPress={() => Alert.alert("Video", "Video in private calls is coming soon.")}
                  styles={styles}
                  ink={ink}
                />
                <Control
                  icon="share-outline"
                  label="Share"
                  onPress={() => Alert.alert("Share", "Screen sharing is coming soon.")}
                  styles={styles}
                  ink={ink}
                />
                <Control icon="close" label="End" danger onPress={endPrivate} styles={styles} ink={ink} />
              </View>
            </>
          )}
        </PrivateCallAudio>

        {/* The call underneath */}
        <View style={styles.mainCard}>
          <View style={styles.flex}>
            <Text style={styles.mainTitle} numberOfLines={1}>
              {mainLabel}
            </Text>
            <Text style={styles.mainCount}>{mainCount ? `${mainCount} on call` : "Still going"}</Text>
          </View>
          <Pressable style={styles.backBtn} onPress={endPrivate} accessibilityRole="button">
            <Text style={styles.backText}>{session.from.kind === "voice" ? "Back to voice chat" : "Back to faction"}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const STYLE_PAIR = themedStyles(
  {
    flex: { flex: 1, minWidth: 0 },
    layer: { ...StyleSheet.absoluteFill, zIndex: 2000, elevation: 2000, justifyContent: "flex-end" },

    // Ringing card (top)
    ringCard: {
      position: "absolute",
      top: 0,
      left: 12,
      right: 12,
      maxWidth: 560,
      alignSelf: "center",
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      padding: 12,
      borderRadius: 20,
      backgroundColor: "#FFFFFF",
      shadowColor: "#000000",
      shadowOpacity: 0.18,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 6 },
      elevation: 12,
    },
    ringAvatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: "#E9E1F5" },
    ringTitleRow: { flexDirection: "row", alignItems: "center", gap: 4 },
    ringKicker: { fontFamily: FONTS.semibold, fontSize: 10.5, letterSpacing: 0.6, color: PINK },
    ringName: { marginTop: 2, fontFamily: FONTS.semibold, fontSize: 14.5, color: INK },
    ringBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
    ringDecline: { backgroundColor: RED },
    ringAccept: { backgroundColor: "#2FB36B" },

    // Sheet (bottom)
    sheet: {
      width: "100%",
      maxWidth: 560,
      alignSelf: "center",
      paddingHorizontal: 18,
      paddingTop: 10,
      borderTopLeftRadius: 26,
      borderTopRightRadius: 26,
      backgroundColor: "#FFFFFF",
      shadowColor: "#000000",
      shadowOpacity: 0.16,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: -6 },
      elevation: 16,
    },
    handle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: "rgba(36,40,60,0.15)", marginBottom: 12 },
    sheetHead: { flexDirection: "row", alignItems: "center", gap: 6 },
    kicker: { fontFamily: FONTS.semibold, fontSize: 12, letterSpacing: 0.6, color: PINK },
    timer: { fontFamily: FONTS.medium, fontSize: 13, color: MUTED, fontVariant: ["tabular-nums"] },

    pair: { flexDirection: "row", alignItems: "center", justifyContent: "center", marginTop: 16, marginBottom: 6 },
    personCol: { alignItems: "center", width: 120 },
    personRing: {
      width: 104,
      height: 104,
      borderRadius: 52,
      padding: 6,
      borderWidth: 3,
      borderColor: "#2E9BF0",
      backgroundColor: "rgba(195,77,156,0.08)",
    },
    personAvatar: { width: "100%", height: "100%", borderRadius: 46, backgroundColor: "#E9E1F5" },
    personLabel: { marginTop: 6, maxWidth: 120, fontFamily: FONTS.regular, fontSize: 12.5, color: MUTED },
    link: { width: 60, height: 2, marginBottom: 22, backgroundColor: PINK },

    controls: { flexDirection: "row", justifyContent: "space-around", marginTop: 12 },
    control: { alignItems: "center", width: 64 },
    controlBtn: {
      width: 50,
      height: 50,
      borderRadius: 25,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#FFFFFF",
      borderWidth: 1,
      borderColor: "rgba(36,40,60,0.10)",
    },
    controlBtnOn: { backgroundColor: PINK, borderColor: PINK },
    controlBtnEnd: { backgroundColor: RED, borderColor: RED },
    controlLabel: { marginTop: 6, fontFamily: FONTS.regular, fontSize: 12, color: MUTED },

    mainCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      marginTop: 16,
      padding: 12,
      borderRadius: 16,
      backgroundColor: "#ECE6F5",
    },
    mainTitle: { fontFamily: FONTS.semibold, fontSize: 14.5, color: INK },
    mainCount: { marginTop: 1, fontFamily: FONTS.regular, fontSize: 12, color: MUTED },
    backBtn: { height: 40, paddingHorizontal: 18, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: PINK },
    backText: { fontFamily: FONTS.semibold, fontSize: 13.5, color: "#FFFFFF" },
  },
  {
    ringCard: { backgroundColor: "#262838" },
    ringName: { color: "#F4F5FA" },
    sheet: { backgroundColor: "#1D1F2C" },
    handle: { backgroundColor: "rgba(255,255,255,0.18)" },
    timer: { color: "#B5BBCB" },
    personLabel: { color: "#B5BBCB" },
    controlBtn: { backgroundColor: "#2A2C3B", borderColor: "rgba(255,255,255,0.08)" },
    controlLabel: { color: "#B5BBCB" },
    mainCard: { backgroundColor: "#262838" },
    mainTitle: { color: "#F4F5FA" },
    mainCount: { color: "#B5BBCB" },
  },
);
