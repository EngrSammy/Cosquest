// The Battle sheet: start a Room where you stand, the Rooms near you, join
// with a code (costquest-ios Features/RoomsFeature.swift BattleSheet). The
// server lays out the arena around the host and decides everything after;
// this sheet hands the chosen game id up, and RoomScreen plays it.
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Share, Text, TextInput, View } from "react-native";
import { KeyboardAvoidingView } from "@/components/ui/keyboard";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useSheetMotion } from "./sheetMotion";

import { distanceText } from "@/features/game/geo";
import {
  normaliseCode,
  ROOM_CODE_LENGTH,
  ROOM_DEFAULT_MINUTES,
  ROOM_MAX_MINUTES,
  ROOM_MIN_MINUTES,
  type NearbyRoom,
  type RoomCreated,
  roomEnded,
  timeLeft,
} from "@/features/game/rooms";
import { roomsModel, useRooms } from "@/features/game/roomsRuntime";
import { useGame } from "@/features/game/runtime";

import { Chip, GameButton } from "./kit";
import { labelOn, RADIUS, SURFACES } from "./look";
import { edgeOf, GF, GP, realmColor } from "./theme";
import { themedStyles, useThemedStyles } from "@/constants/chatTheme";

/** A clock for countdown labels, ticking every `ms`. */
function useNow(ms: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export default function RoomSheet({
  onClose,
  onEnter,
  focusGameId = null,
}: {
  onClose: () => void;
  /** Into this Room's game (RoomScreen). */
  onEnter: (gameId: string) => void;
  /** A beacon tapped on the map: that Room is outlined. */
  focusGameId?: string | null;
}) {
  const styles = useThemedStyles(STYLE_PAIR);
  const insets = useSafeAreaInsets();
  const motion = useSheetMotion();
  const rooms = useRooms();
  const fix = useGame((s) => s.fix);
  const me = useGame((s) => s.me);
  const now = useNow(1000);
  const [minutes, setMinutes] = useState(ROOM_DEFAULT_MINUTES);
  const [isPrivate, setPrivate] = useState(false);
  const [code, setCode] = useState("");
  // Back in the sheet after starting one: the code is still here.
  const [created, setCreated] = useState<RoomCreated | null>(() => roomsModel.liveHosting());

  useEffect(() => {
    roomsModel.clearProblem();
    void roomsModel.refresh();
  }, []);
  // Asked before the first fix: fetch as soon as there is one.
  const hasFix = fix !== null;
  useEffect(() => {
    if (hasFix && !rooms.loaded) void roomsModel.refresh();
  }, [hasFix, rooms.loaded]);

  const hosting = created && !roomEnded(created.ends_at, now) ? created : null;
  const list = rooms.nearby.filter((r) => r.game_id !== hosting?.game_id);

  const start = async () => {
    const r = await roomsModel.start(minutes, isPrivate);
    Haptics.notificationAsync(r ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error).catch(() => {});
    if (r) setCreated(r);
  };

  const join = async () => {
    if (code.length !== ROOM_CODE_LENGTH) return;
    const id = await roomsModel.find(code);
    if (id) onEnter(id);
    else Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
  };

  return (
    <Animated.View entering={motion.entering} exiting={motion.exiting} style={[styles.sheet, { top: insets.top + 40 }]}>
      <View style={styles.head}>
        <Text style={styles.title} accessibilityRole="header">
          Battle
        </Text>
        <Pressable onPress={onClose} style={styles.close} accessibilityRole="button" accessibilityLabel="Close Battle" hitSlop={8}>
          <Ionicons name="close" size={20} color={GP.ink} />
        </Pressable>
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled">
          {hosting ? (
            <HostingPanel room={hosting} now={now} color={realmColor(me?.faction)} onEnter={() => onEnter(hosting.game_id)} />
          ) : (
            <View style={styles.panel}>
              <View style={styles.row}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.panelTitle}>Start a Room here</Text>
                  <Text style={styles.muted}>Weapons and shrines drop around you. Anyone near can join.</Text>
                </View>
              </View>
              <View style={styles.row}>
                <Text style={[styles.label, { flex: 1 }]}>Length</Text>
                <Stepper icon="remove" label="Shorter" enabled={minutes > ROOM_MIN_MINUTES} onPress={() => setMinutes((m) => Math.max(ROOM_MIN_MINUTES, m - 5))} />
                <Text style={styles.minutes}>{minutes} min</Text>
                <Stepper icon="add" label="Longer" enabled={minutes < ROOM_MAX_MINUTES} onPress={() => setMinutes((m) => Math.min(ROOM_MAX_MINUTES, m + 5))} />
              </View>
              <Pressable
                onPress={() => setPrivate((p) => !p)}
                style={styles.row}
                accessibilityRole="switch"
                accessibilityState={{ checked: isPrivate }}
                accessibilityLabel="Private room">
                <View style={[styles.lock, { backgroundColor: isPrivate ? GP.navy : GP.mint }]}>
                  <Ionicons name={isPrivate ? "lock-closed" : "lock-open"} size={17} color="#FFF" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Private room</Text>
                  <Text style={styles.muted}>{isPrivate ? "Only people with the code can join." : "Shows on the map for players nearby."}</Text>
                </View>
                <View style={[styles.toggle, { backgroundColor: isPrivate ? GP.navy : "rgba(30,58,76,0.18)", alignItems: isPrivate ? "flex-end" : "flex-start" }]}>
                  <View style={styles.knob} />
                </View>
              </Pressable>
              <GameButton
                title={rooms.busy ? "Starting…" : fix ? "Start the Room" : "Finding you…"}
                color={GP.berry}
                disabled={rooms.busy || !fix}
                onPress={start}
                icon={rooms.busy ? <ActivityIndicator color="#FFF" /> : <Ionicons name="flash" size={18} color="#FFF" />}
              />
            </View>
          )}

          <View style={[styles.row, { marginTop: 4 }]}>
            <Text style={[styles.heading, { flex: 1 }]}>Rooms near you</Text>
            <Pressable onPress={() => roomsModel.refresh()} style={styles.refresh} accessibilityRole="button" accessibilityLabel="Look again for Rooms near you" hitSlop={8}>
              <Ionicons name="refresh" size={18} color="#FFF" />
            </Pressable>
          </View>
          {list.length === 0 ? (
            <View style={[styles.panel, styles.row]}>
              <Text style={[styles.muted, { flex: 1 }]}>{rooms.loaded ? "No Rooms open within reach. Start one and the map shows it to everyone near." : "Looking for Rooms…"}</Text>
            </View>
          ) : (
            list.map((r) => <RoomRow key={r.game_id} room={r} now={now} focused={r.game_id === focusGameId} onPress={() => onEnter(r.game_id)} />)
          )}

          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Join with a code</Text>
            <View style={styles.row}>
              <TextInput
                value={code}
                onChangeText={(v) => setCode(normaliseCode(v))}
                placeholder="ABC234"
                placeholderTextColor={GP.mist}
                autoCapitalize="characters"
                autoCorrect={false}
                autoComplete="off"
                maxLength={ROOM_CODE_LENGTH + 2}
                returnKeyType="join"
                onSubmitEditing={join}
                style={styles.code}
                accessibilityLabel="Room code"
              />
              <GameButton title="Join" small color={GP.skyDeep} disabled={code.length !== ROOM_CODE_LENGTH || rooms.busy} onPress={join} />
            </View>
          </View>

          {rooms.problem ? (
            <View style={styles.problem} accessibilityLiveRegion="polite">
              <Ionicons name="warning" size={16} color="#FFF" />
              <Text style={styles.problemText}>{rooms.problem}</Text>
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Animated.View>
  );
}

function Stepper({ icon, label, enabled, onPress }: { icon: "add" | "remove"; label: string; enabled: boolean; onPress: () => void }) {
  const styles = useThemedStyles(STYLE_PAIR);
  return (
    <Pressable
      onPress={onPress}
      disabled={!enabled}
      style={[styles.stepper, { backgroundColor: enabled ? GP.skyDeep : "#B3B3B3" }]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !enabled }}
      hitSlop={4}>
      <Ionicons name={icon} size={20} color="#FFF" />
    </Pressable>
  );
}

/** The Room is up: the code, big enough to read across a table. */
function HostingPanel({ room, now, color, onEnter }: { room: RoomCreated; now: number; color: string; onEnter: () => void }) {
  const styles = useThemedStyles(STYLE_PAIR);
  return (
    <View style={[styles.panel, { alignItems: "center" }]}>
      <View style={[styles.row, { alignSelf: "stretch" }]}>
        <Chip text="Live" color={GP.berry} />
        <View style={{ flex: 1 }} />
        <Text style={styles.mutedBold}>{timeLeft(room.ends_at, now)}</Text>
      </View>
      <Text style={styles.panelTitle}>Your Room is open</Text>
      <Text style={styles.caption}>ROOM CODE</Text>
      <View style={styles.codeRow} accessible accessibilityLabel={`Room code ${room.code.split("").join(" ")}`}>
        {room.code.split("").map((ch, i) => (
          <View key={i} style={[styles.codeEdge, { backgroundColor: edgeOf(color) }]}>
            <View style={[styles.codeFace, { backgroundColor: color }]}>
              <Text style={[styles.codeChar, { color: labelOn(color) }]}>{ch}</Text>
            </View>
          </View>
        ))}
      </View>
      <Pressable
        onPress={() => Share.share({ message: `Join my CosQuest Room with code ${room.code}` }).catch(() => {})}
        style={styles.share}
        accessibilityRole="button"
        accessibilityLabel="Share the code">
        <Ionicons name="share-outline" size={18} color={GP.skyDeep} />
        <Text style={styles.shareText}>Share the code</Text>
      </Pressable>
      <GameButton title="Enter the battle" color={GP.mint} onPress={onEnter} style={{ alignSelf: "stretch" }} icon={<Ionicons name="flash" size={18} color="#FFF" />} />
    </View>
  );
}

function RoomRow({ room, now, focused, onPress }: { room: NearbyRoom; now: number; focused: boolean; onPress: () => void }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const who = room.host_handle || "Someone";
  const left = timeLeft(room.ends_at, now);
  const players = room.players ?? 0;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.roomRow, focused && styles.roomFocused, pressed && { opacity: 0.85 }]}
      accessibilityRole="button"
      accessibilityLabel={`${who}'s Room, ${distanceText(room.distance_m)} away, ${players} ${players === 1 ? "player" : "players"}, ${left}`}
      accessibilityHint="Joins the room">
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={styles.roomTitle} numberOfLines={1}>
          {who}&apos;s Room
        </Text>
        <View style={styles.meta}>
          <Ionicons name="location" size={12} color={GP.mist} />
          <Text style={styles.mutedBold}>{distanceText(room.distance_m)}</Text>
          <Ionicons name="people" size={12} color={GP.mist} />
          <Text style={styles.mutedBold}>{players}</Text>
          <Ionicons name="timer-outline" size={12} color={GP.mist} />
          <Text style={styles.mutedBold} numberOfLines={1}>
            {left}
          </Text>
        </View>
      </View>
      <View style={styles.joinPill}>
        <Text style={styles.joinText}>Join</Text>
      </View>
    </Pressable>
  );
}

const L = SURFACES.light;
const D = SURFACES.dark;

const STYLE_PAIR = themedStyles(
  {
    sheet: { position: "absolute", left: 0, right: 0, bottom: 0, borderTopLeftRadius: RADIUS.sheet, borderTopRightRadius: RADIUS.sheet, backgroundColor: L.screen, elevation: 18 },
    head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18, paddingTop: 16, paddingBottom: 6 },
    title: { fontFamily: GF.display, fontSize: 26, color: L.text },
    close: { width: 36, height: 36, borderRadius: 18, backgroundColor: L.surfaceAlt, alignItems: "center", justifyContent: "center" },
    body: { paddingHorizontal: 16, gap: 14 },
    panel: { padding: 16, gap: 14, borderRadius: 20, backgroundColor: L.surface },
    row: { flexDirection: "row", alignItems: "center", gap: 12 },
    panelTitle: { fontFamily: GF.display, fontSize: 21, color: L.text },
    heading: { fontFamily: GF.display, fontSize: 22, color: L.text },
    label: { fontFamily: GF.bold, fontSize: 16, color: L.text },
    muted: { fontFamily: GF.body, fontSize: 13, color: L.textMuted },
    mutedBold: { fontFamily: GF.bold, fontSize: 13, color: L.textMuted },
    minutes: { fontFamily: GF.display, fontSize: 22, color: L.text, width: 80, textAlign: "center" },
    stepper: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
    lock: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
    toggle: { width: 50, height: 30, borderRadius: 15, padding: 3, justifyContent: "center" },
    knob: { width: 24, height: 24, borderRadius: 12, backgroundColor: L.surface, elevation: 2 },
    refresh: { width: 36, height: 36, borderRadius: 18, backgroundColor: GP.skyDeep, alignItems: "center", justifyContent: "center" },
    caption: { fontFamily: GF.display, fontSize: 12, letterSpacing: 1.6, color: L.textMuted },
    codeRow: { flexDirection: "row", gap: 6 },
    codeEdge: { borderRadius: 12, paddingBottom: 4 },
    codeFace: { width: 44, height: 58, borderRadius: 12, borderWidth: 2, alignItems: "center", justifyContent: "center" },
    codeChar: { fontFamily: GF.display, fontSize: 34, lineHeight: 40 },
    share: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 4 },
    shareText: { fontFamily: GF.bold, fontSize: 15, color: GP.skyDeep },
    roomRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 20, backgroundColor: L.surface, borderWidth: 2, borderColor: L.hairline },
    roomFocused: { borderColor: GP.sun, borderWidth: 3 },
    roomTitle: { fontFamily: GF.display, fontSize: 18, color: L.text },
    meta: { flexDirection: "row", alignItems: "center", gap: 4 },
    joinPill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, backgroundColor: GP.mint },
    joinText: { fontFamily: GF.display, fontSize: 18, lineHeight: 22, color: "#FFFFFF" },
    code: {
      flex: 1,
      height: 52,
      paddingHorizontal: 14,
      // Android's default padding clips the display font's tall line in 52 pt.
      paddingVertical: 0,
      textAlignVertical: "center",
      borderRadius: 14,
      borderWidth: 2,
      borderColor: L.hairline,
      backgroundColor: L.surface,
      fontFamily: GF.display,
      fontSize: 24,
      letterSpacing: 3,
      color: L.text,
    },
    problem: { flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "flex-start", paddingHorizontal: 14, paddingVertical: 9, borderRadius: 18, backgroundColor: GP.berry },
    problemText: { fontFamily: GF.bold, fontSize: 14, color: "#FFF", flexShrink: 1 },
  },
  {
    sheet: { backgroundColor: D.screen },
    title: { color: D.text },
    close: { backgroundColor: D.surfaceAlt },
    panel: { backgroundColor: D.surface },
    panelTitle: { color: D.text },
    heading: { color: D.text },
    label: { color: D.text },
    muted: { color: D.textMuted },
    mutedBold: { color: D.textMuted },
    minutes: { color: D.text },
    knob: { backgroundColor: D.surface },
    roomRow: { backgroundColor: D.surface },
    roomTitle: { color: D.text },
    code: { borderColor: D.hairline, backgroundColor: D.surface, color: D.text },
  },
);
