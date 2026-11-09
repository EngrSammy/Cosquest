// "Hold phones together", the big card at the top of Friends on iOS
// (costquest-ios Features/FriendsFeature.swift HoldPhonesCard). Both phones
// open Friends; each lists the other, and where the radio can measure, the
// claim fires on its own once the phones touch. The model is
// features/game/friendsNearby.ts; the radios are FriendBeaconIsland.swift.
// Not shown where there is no beacon (Android, web). The squad-up sheet uses the
// same card with its own model and words (`use`).
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Linking, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";

import { addLabel, nearbyDistanceText, type NearbyFriendModel, type NearbyPeer, type NearbyState, peersOf, searchingLine, tooFar } from "@/features/game/friendsNearby";
import { nearbyFriends, useNearbyFriends } from "@/features/game/friendsNearbyDevice";
import { useGame } from "@/features/game/runtime";

import { GameButton, GamePanel, MAX_FONT_SCALE } from "./kit";
import { notify } from "./prefs";
import { playSound } from "./sound";
import { ACCENT, SURFACES, useLook } from "./look";
import { GF } from "./theme";
import { themedStyles, useThemedStyles } from "@/constants/chatTheme";
import { POP_FADE, POP_IN } from "./sheetMotion";

/** The squad-up sheet's version of the card (SquadSheet.tsx): the same radios, another route. */
export type HoldPhonesUse = {
  model: NearbyFriendModel | null;
  state: NearbyState;
  title: string;
  sub: string;
  /** The peer row's button when close enough ("Add Mia"). */
  action: (handle: string) => string;
  icon?: keyof typeof Ionicons.glyphMap;
};

export function HoldPhonesCard({ use }: { use?: HoldPhonesUse } = {}) {
  const friendState = useNearbyFriends();
  return use ? <HoldPhonesBody use={use} /> : (
    <HoldPhonesBody
      use={{ model: nearbyFriends, state: friendState, title: "Add a friend", sub: "Open this on both phones and hold them close.", action: (h) => `Add ${h}` }}
    />
  );
}

function HoldPhonesBody({ use }: { use: HoldPhonesUse }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const look = useLook();
  const model = use.model;
  const s = use.state;
  const fix = useGame((s) => s.fix);
  const reduce = useReducedMotion();

  // The radios run exactly as long as the card is on screen.
  useEffect(() => {
    if (!model) return;
    void model.start();
    return () => model.stop();
  }, [model]);

  // A new friend: the fanfare and the success haptic (NearbyFriendModel.celebrate).
  const seen = useRef(s.celebrations);
  useEffect(() => {
    if (s.celebrations > seen.current) {
      notify(Haptics.NotificationFeedbackType.Success);
      playSound("fanfare");
    }
    seen.current = s.celebrations;
  }, [s.celebrations]);

  // The icon pulses while it looks (.symbolEffect(.pulse)).
  const pulse = useSharedValue(1);
  const searching = s.running && s.claiming === null && !reduce;
  useEffect(() => {
    pulse.set(searching ? withRepeat(withTiming(0.35, { duration: 700 }), -1, true) : withTiming(1, { duration: 200 }));
  }, [searching, pulse]);
  const iconStyle = useAnimatedStyle(() => ({ opacity: pulse.get() }));

  // A distance goes stale after 3 s with no new fix: look again every second.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!s.running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [s.running]);

  if (!model) return null;
  const peers = peersOf(s, now);

  return (
    <GamePanel>
      <View style={styles.stack}>
        <View style={styles.head}>
          <Animated.View style={iconStyle} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Ionicons name={use.icon ?? "phone-portrait"} size={34} color={ACCENT.sun.fill} />
          </Animated.View>
          <View style={styles.headText}>
            <Text style={styles.title} accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE}>
              {use.title}
            </Text>
            <Text style={styles.sub} maxFontSizeMultiplier={MAX_FONT_SCALE}>
              {use.sub}
            </Text>
          </View>
        </View>

        {s.success ? (
          <Animated.View entering={reduce ? POP_FADE : POP_IN} style={styles.row} accessible accessibilityLabel={s.success}>
            <Ionicons name="sparkles" size={26} color={ACCENT.sun.fill} />
            <Text style={styles.success} maxFontSizeMultiplier={MAX_FONT_SCALE}>
              {s.success}
            </Text>
          </Animated.View>
        ) : null}

        {s.denied ? (
          <View style={styles.stackTight}>
            <Text style={styles.line} maxFontSizeMultiplier={MAX_FONT_SCALE}>
              Turn on Local Network for CosQuest so it can find the other phone.
            </Text>
            <GameButton title="Open Settings" size="small" color={ACCENT.sky.fill} onPress={() => void Linking.openSettings()} style={styles.start} />
          </View>
        ) : !fix ? (
          <View style={styles.row}>
            <ActivityIndicator color={look.textMuted} />
            <Text style={styles.line} maxFontSizeMultiplier={MAX_FONT_SCALE}>
              Finding where you are
            </Text>
          </View>
        ) : (
          <>
            {peers.length === 0 ? (
              <View style={styles.row}>
                <ActivityIndicator color={look.textMuted} />
                <Text style={styles.line} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                  {searchingLine(s)}
                </Text>
              </View>
            ) : null}
            {peers.map((p) => (
              <PeerRow key={p.key} p={p} claiming={s.claiming} label={tooFar(p) ? addLabel(p) : use.action(p.handle)} onAdd={() => model.claim(p.key)} />
            ))}
          </>
        )}

        {s.status ? (
          <Text style={styles.status} accessibilityLiveRegion="polite" maxFontSizeMultiplier={MAX_FONT_SCALE}>
            {s.status}
          </Text>
        ) : null}
      </View>
    </GamePanel>
  );
}

function PeerRow({ p, claiming, label, onAdd }: { p: NearbyPeer; claiming: string | null; label: string; onAdd: () => void }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const look = useLook();
  const far = tooFar(p);
  return (
    <View style={styles.peer}>
      <View style={[styles.dot, { backgroundColor: p.linked ? ACCENT.mint.fill : look.hairline }]} accessibilityElementsHidden importantForAccessibility="no" />
      <View style={styles.peerText}>
        <Text style={styles.name} numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE}>
          {p.handle}
        </Text>
        {p.distance !== null ? (
          <Text style={styles.distance} maxFontSizeMultiplier={MAX_FONT_SCALE}>
            {nearbyDistanceText(p.distance)}
          </Text>
        ) : null}
      </View>
      {claiming === p.key ? (
        <ActivityIndicator color={look.textMuted} accessibilityLabel={`Waiting for ${p.handle}`} />
      ) : (
        <GameButton title={label} size="small" color={ACCENT.mint.fill} onPress={onAdd} disabled={far || claiming !== null} />
      )}
    </View>
  );
}

const L = SURFACES.light;
const D = SURFACES.dark;

const STYLE_PAIR = themedStyles(
  {
    stack: { gap: 14 },
    stackTight: { gap: 8 },
    head: { flexDirection: "row", alignItems: "center", gap: 12 },
    headText: { flex: 1, gap: 4 },
    title: { fontFamily: GF.display, fontSize: 24, lineHeight: 28, color: L.text },
    sub: { fontFamily: GF.regular, fontSize: 15, lineHeight: 21, color: L.textMuted },
    row: { flexDirection: "row", alignItems: "center", gap: 8 },
    line: { fontFamily: GF.regular, fontSize: 15, lineHeight: 21, color: L.text, flexShrink: 1 },
    success: { fontFamily: GF.display, fontSize: 22, lineHeight: 26, color: L.text, flexShrink: 1 },
    status: { fontFamily: GF.regular, fontSize: 14, lineHeight: 19, color: L.textMuted },
    start: { alignSelf: "flex-start" },
    peer: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 4 },
    dot: { width: 12, height: 12, borderRadius: 6 },
    peerText: { flex: 1, gap: 2 },
    name: { fontFamily: GF.bold, fontSize: 17, lineHeight: 22, color: L.text },
    distance: { fontFamily: GF.regular, fontSize: 13, lineHeight: 17, color: L.textMuted, fontVariant: ["tabular-nums"] },
  },
  {
    title: { color: D.text },
    sub: { color: D.textMuted },
    line: { color: D.text },
    success: { color: D.text },
    status: { color: D.textMuted },
    name: { color: D.text },
    distance: { color: D.textMuted },
  },
);
