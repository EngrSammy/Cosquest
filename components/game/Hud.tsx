// Over the map: the top bar (you, your coins and streak), the rail (the
// daily quests, Relics, the Codex, More) and the Warden's speech bubble.
// costquest-ios Roam/RoamHomeView.swift (topBar, PlayerChip, ResourceChip,
// rail) and Warden/WardenViews.swift (WardenBubble). The Nearby tray is
// NearbyTray.tsx.
import { Ionicons } from "@expo/vector-icons";
import { type ReactNode, useEffect } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { Easing, Keyframe } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle } from "react-native-svg";

import type { Profile, RoamMe } from "@/features/game/wire";

import { Image } from "expo-image";

import { useMyPicture } from "@/components/world/useMyPicture";

import AvatarView from "./AvatarView";
import { PlayerAvatar } from "./ForgeWorld";
import { CoachAnchor } from "./Coach";
import { announce, GameCoin, GameIconButton, HUD_FONT_SCALE, withAlpha } from "./kit";
import { ACCENT, contrast, edgeColor, ELEVATION, RADIUS, SURFACES, useLook } from "./look";
import { GF, GP } from "./theme";
import WardenBadge from "./WardenBadge";
import { useWardenMuted, wardenVoice } from "./wardenVoice";
import { themedStyles, useThemedStyles } from "@/constants/chatTheme";

/**
 * The plate under the HUD's words over the map: paper, as the art direction's
 * floating map controls (cream by day, ink by dusk, a hairline and a soft
 * float shadow). It used to be a navy plate with white type on the day map.
 */
const L = SURFACES.light;
const D = SURFACES.dark;

/** A colour for words on a plate: the colour itself if it reads (AA), else its edge, else the ink. */
function readable(color: string, plate: string, ink: string): string {
  if (contrast(color, plate) >= 4.5) return color;
  const edge = edgeColor(color, 0.6);
  return contrast(edge, plate) >= 4.5 ? edge : ink;
}


// ---------- the top bar ----------

/** Who you are, at a glance: your avatar in a ring that fills with this level's XP, your level, your rank. */
export function PlayerChip({
  me,
  profile,
  name,
  color,
  onPress,
}: {
  me: RoamMe | null;
  profile: Profile | null;
  name: string;
  color: string;
  onPress: () => void;
}) {
  const styles = useThemedStyles(STYLE_PAIR);
  const look = useLook();
  const s = me?.standing;
  const progress = s ? (s.max_level ? 1 : Math.max(0, Math.min(1, s.into_level / Math.max(1, s.level_span)))) : 0;
  const handle = profile?.handle ?? me?.handle ?? name ?? "Player";
  const rank = s?.rank ?? "Rookie";
  const level = s?.level ?? 1;
  const loading = !me && !profile;
  const picture = useMyPicture();
  const R = 24.5;
  const C = 2 * Math.PI * R;
  const face = color;
  return (
    <Pressable
      style={styles.chip}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={loading ? "You" : `You, ${handle}, level ${level}, ${rank}`}
      accessibilityHint="Opens your profile">
      <View style={styles.ring}>
        <Svg width={54} height={54} style={StyleSheet.absoluteFill}>
          <Circle cx={27} cy={27} r={R} stroke={look.dark ? "rgba(255,255,255,0.14)" : "rgba(28,43,58,0.12)"} strokeWidth={5} fill="none" />
          <Circle
            cx={27}
            cy={27}
            r={R}
            stroke={GP.sun}
            strokeWidth={5}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${C * progress} ${C}`}
            transform="rotate(-90 27 27)"
          />
        </Svg>
        {/* Task 059: the person's own photo / chat avatar, the same face as in the chat.
            Task 056: a worn Forge hero shows first when forge_world is on. */}
        <PlayerAvatar
          size={40}
          fallback={
            picture ? (
              <Image source={picture} style={styles.photo} contentFit="cover" accessibilityIgnoresInvertColors />
            ) : (
              <AvatarView avatar={profile?.avatar ?? { face: 1, mark: 1, tint: face }} size={40} />
            )
          }
        />
        <View style={styles.level}>
          <Text style={styles.levelText} maxFontSizeMultiplier={1.2}>
            {level}
          </Text>
        </View>
      </View>
      {/* Before the server has answered, shapes rather than a made-up "Player, Rookie". */}
      {loading ? (
        <View style={{ gap: 5, paddingRight: 6 }}>
          <View style={styles.redactA} />
          <View style={styles.redactB} />
        </View>
      ) : (
        <View style={{ flexShrink: 1, paddingRight: 6 }}>
          <Text style={styles.handle} numberOfLines={1} maxFontSizeMultiplier={HUD_FONT_SCALE}>
            {handle}
          </Text>
          <Text style={styles.rank} numberOfLines={1} maxFontSizeMultiplier={HUD_FONT_SCALE}>
            {rank}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

/** The top bar's resource chip: coins and the streak sit side by side on one row with the player chip. */
function ResourceChip({ children }: { children: ReactNode }) {
  const styles = useThemedStyles(STYLE_PAIR);
  return <View style={styles.resource}>{children}</View>;
}

export function TopBar({
  me,
  profile,
  name,
  color,
  onProfile,
  onCoins,
  onAskWarden,
}: {
  me: RoamMe | null;
  profile: Profile | null;
  name: string;
  color: string;
  onProfile: () => void;
  onCoins: () => void;
  /** The Warden's face beside the chip: "Ask the Warden". */
  onAskWarden?: () => void;
}) {
  const styles = useThemedStyles(STYLE_PAIR);
  const look = useLook();
  const insets = useSafeAreaInsets();
  const coins = me?.coins ?? 0;
  const streak = me?.streak;
  return (
    <View style={[styles.top, { top: insets.top + 4 }]} pointerEvents="box-none">
      <PlayerChip me={me} profile={profile} name={name} color={color} onPress={onProfile} />
      {onAskWarden ? (
        <Pressable onPress={onAskWarden} accessibilityRole="button" accessibilityLabel="Ask the Warden" hitSlop={4} style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.94 : 1 }] })}>
          <WardenBadge tint={color} size={40} />
        </Pressable>
      ) : null}
      <View style={{ flex: 1, minWidth: 4 }} pointerEvents="none" />
      <View style={styles.stats}>
        <Pressable onPress={onCoins} accessibilityRole="button" accessibilityLabel={`${coins} CosCoins`} accessibilityHint="Opens your CosCoins" hitSlop={5}>
          <ResourceChip>
            <GameCoin size={18} />
            <Text style={styles.resourceText} maxFontSizeMultiplier={HUD_FONT_SCALE}>
              {coins}
            </Text>
          </ResourceChip>
        </Pressable>
        {streak && streak.days > 0 ? (
          <View accessible accessibilityLabel={`${streak.days} day streak`}>
            <ResourceChip>
              <Ionicons name="flame" size={16} color={streak.played_today ? ACCENT.sun.fill : look.textMuted} />
              <Text style={styles.resourceText} maxFontSizeMultiplier={HUD_FONT_SCALE}>
                {streak.days}
              </Text>
            </ResourceChip>
          </View>
        ) : null}
      </View>
    </View>
  );
}

// ---------- the rail ----------

/** `.transition(.move(edge: .trailing).combined(with: .opacity))` under `.smooth(0.3)`. */
const EASE = Easing.inOut(Easing.cubic);
const RAIL_IN = new Keyframe({
  from: { opacity: 0, transform: [{ translateX: 90 }] },
  to: { opacity: 1, transform: [{ translateX: 0 }], easing: EASE },
}).duration(300);
const RAIL_OUT = new Keyframe({
  from: { opacity: 1, transform: [{ translateX: 0 }] },
  to: { opacity: 0, transform: [{ translateX: 90 }], easing: EASE },
}).duration(300);

/** Where the coach finds More: it stands in for everything moved off the rail. */
const MORE_IDS = ["more", "war", "battle", "recap", "events", "friends"] as const;

/**
 * Four buttons at most, high on the right under the top bar: the daily
 * quests, the Relics, the Codex, and More for everything else. Mounted only
 * while no card is open (the card is the one thing to read). The Warden's
 * mute and "centre on me" are small extras under them.
 */
export function Rail({
  dailiesLeft,
  codexCount,
  showCodex,
  relics,
  onDailies,
  onCodex,
  onTrials,
  onMore,
  onRecentre,
  compass,
}: {
  dailiesLeft: number;
  codexCount: number | null;
  showCodex: boolean;
  /** The Relics button (its own component, with its own badge), when unlocked. */
  relics?: ReactNode;
  onDailies: () => void;
  onCodex: () => void;
  /** Guardian Trials, when the server runs the duel: it takes the Codex's place (the Codex moves to More). */
  onTrials?: () => void;
  onMore: () => void;
  onRecentre: () => void;
  /** The map's compass (north up / heading up), when this phone has one. */
  compass?: ReactNode;
}) {
  const styles = useThemedStyles(STYLE_PAIR);
  const insets = useSafeAreaInsets();
  const muted = useWardenMuted();
  return (
    <Animated.View entering={RAIL_IN} exiting={RAIL_OUT} style={[styles.rail, { top: insets.top + 72 }]} pointerEvents="box-none">
      <CoachAnchor ids={["dailies"]}>
        <GameIconButton icon="checkbox" color={GP.mint} diameter={50} accessibilityLabel="Daily quests" badge={dailiesLeft > 0 ? dailiesLeft : null} onPress={onDailies} />
      </CoachAnchor>
      {relics ? (
        <CoachAnchor ids={["relics"]} style={styles.relics}>
          {relics}
        </CoachAnchor>
      ) : null}
      {onTrials ? (
        <CoachAnchor ids={["trials"]}>
          <GameIconButton icon="flash" color={GP.berry} diameter={50} accessibilityLabel="Guardian Trials" onPress={onTrials} />
        </CoachAnchor>
      ) : showCodex ? (
        <CoachAnchor ids={["codex"]}>
          <GameIconButton icon="albums" color={GP.sun} diameter={50} accessibilityLabel="Codex" badge={codexCount && codexCount > 0 ? codexCount : null} onPress={onCodex} />
        </CoachAnchor>
      ) : null}
      <CoachAnchor ids={onTrials ? [...MORE_IDS, "codex"] : MORE_IDS}>
        <GameIconButton icon="grid" color={GP.skyDeep} diameter={50} accessibilityLabel="More" onPress={onMore} />
      </CoachAnchor>
      <View style={styles.extras}>
        <GameIconButton
          icon={muted ? "volume-mute" : "volume-high"}
          color={GP.slate}
          diameter={38}
          accessibilityLabel={muted ? "Warden voice off" : "Warden voice on"}
          onPress={() => wardenVoice.setMuted(!muted)}
        />
        {compass}
        <GameIconButton icon="locate" color={GP.navy} diameter={38} accessibilityLabel="Centre on me" onPress={onRecentre} />
      </View>
    </Animated.View>
  );
}

// ---------- the Warden ----------

const BUBBLE_OUT = new Keyframe({ from: { opacity: 1 }, to: { opacity: 0 } }).duration(180);
const BUBBLE_IN = new Keyframe({
  from: { opacity: 0, transform: [{ scale: 0.9 }] },
  to: { opacity: 1, transform: [{ scale: 1 }], easing: Easing.out(Easing.cubic) },
}).duration(260);

/**
 * What the Warden just said, with its face. Shown, not spoken (the nudge loop
 * in GameRoot). The player can always put the Warden away: tap it, or its X.
 */
export function WardenBubble({ text, color, onClose }: { text: string; color: string; onClose: () => void }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const look = useLook();
  // iOS has no live regions: say it to VoiceOver as it appears.
  useEffect(() => {
    if (Platform.OS === "ios") announce(`The Warden: ${text}`);
  }, [text]);
  return (
    <Animated.View entering={BUBBLE_IN} exiting={BUBBLE_OUT}>
      <Pressable
        onPress={onClose}
        style={[styles.bubble, { borderColor: look.dark ? withAlpha(color, 0.5) : look.hairline }]}
        accessible
        accessibilityRole="button"
        accessibilityLabel={`The Warden: ${text}`}
        accessibilityHint="Double tap to put the Warden away"
        accessibilityLiveRegion={Platform.OS === "android" ? "polite" : undefined}>
        <WardenBadge tint={color} size={36} />
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={[styles.bubbleLabel, { color: readable(color, look.surface, look.text) }]} maxFontSizeMultiplier={HUD_FONT_SCALE}>
            THE WARDEN
          </Text>
          <Text style={styles.bubbleText} maxFontSizeMultiplier={HUD_FONT_SCALE}>
            {text}
          </Text>
        </View>
        <Pressable onPress={onClose} hitSlop={9} style={styles.bubbleClose} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Ionicons name="close" size={13} color={look.textMuted} />
        </Pressable>
      </Pressable>
    </Animated.View>
  );
}

/** A test server says so, on the map. */
export function StagingBadge({ label }: { label: string }) {
  const styles = useThemedStyles(STYLE_PAIR);
  return (
    <View pointerEvents="none" style={styles.staging}>
      <Text style={styles.stagingText}>{label}</Text>
    </View>
  );
}

const STYLE_PAIR = themedStyles(
  {
    photo: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: "#FFFFFF" },
    top: {
      position: "absolute",
      left: 12,
      right: 12,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    chip: {
      flexShrink: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      padding: 5,
      paddingRight: 14,
      borderRadius: RADIUS.pill,
      backgroundColor: L.surface,
      borderWidth: 1,
      borderColor: L.hairline,
      ...ELEVATION.float,
    },
    ring: { width: 54, height: 54, alignItems: "center", justifyContent: "center" },
    level: {
      position: "absolute",
      right: -4,
      bottom: -4,
      minWidth: 22,
      height: 22,
      paddingHorizontal: 3,
      borderRadius: 11,
      backgroundColor: ACCENT.sky.fill,
      borderWidth: 2,
      borderColor: L.surface,
      alignItems: "center",
      justifyContent: "center",
    },
    levelText: { fontFamily: GF.display, fontSize: 13, lineHeight: 16, color: "#FFFFFF" },
    handle: { fontFamily: GF.display, fontSize: 18, lineHeight: 22, color: L.text },
    rank: { fontFamily: GF.body, fontSize: 13, lineHeight: 16, color: L.textMuted },
    redactA: { width: 96, height: 16, borderRadius: 8, backgroundColor: L.surfaceAlt },
    redactB: { width: 60, height: 12, borderRadius: 6, backgroundColor: L.surfaceAlt },
    stats: { flexDirection: "row", gap: 6 },
    resource: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingLeft: 7,
      paddingRight: 12,
      height: 36,
      borderRadius: RADIUS.pill,
      backgroundColor: L.surface,
      borderWidth: 1,
      borderColor: L.hairline,
      ...ELEVATION.float,
    },
    resourceText: { fontFamily: GF.display, fontSize: 17, lineHeight: 21, color: L.text, fontVariant: ["tabular-nums"] },
    rail: { position: "absolute", right: 12, gap: 12, alignItems: "center", width: 50 },
    relics: { width: 50, height: 54, alignItems: "center", justifyContent: "center" },
    extras: { gap: 10, marginTop: 4, alignItems: "center" },
    bubble: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
      marginLeft: 14,
      marginRight: 76,
      padding: 14,
      borderRadius: RADIUS.card,
      borderWidth: 1,
      backgroundColor: L.surface,
      ...ELEVATION.float,
    },
    bubbleLabel: { fontFamily: GF.bold, fontSize: 12, lineHeight: 16, letterSpacing: 1 },
    bubbleText: { fontFamily: GF.body, fontSize: 16, lineHeight: 21, color: L.text },
    bubbleClose: { width: 26, height: 26, borderRadius: 13, backgroundColor: L.surfaceAlt, alignItems: "center", justifyContent: "center" },
    staging: { alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, backgroundColor: ACCENT.berry.fill },
    stagingText: { fontFamily: GF.bold, fontSize: 12, lineHeight: 15, color: "#FFFFFF", letterSpacing: 0.8 },
  },
  {
    // The dusk map: ink plates with a hairline instead of a shadow.
    chip: { backgroundColor: D.surface, borderColor: D.hairline, shadowOpacity: 0, elevation: 0, boxShadow: "none" },
    level: { borderColor: D.surface },
    handle: { color: D.text },
    rank: { color: D.textMuted },
    redactA: { backgroundColor: D.surfaceAlt },
    redactB: { backgroundColor: D.surfaceAlt },
    resource: { backgroundColor: D.surface, borderColor: D.hairline, shadowOpacity: 0, elevation: 0, boxShadow: "none" },
    resourceText: { color: D.text },
    bubble: { backgroundColor: D.surface, shadowOpacity: 0, elevation: 0, boxShadow: "none" },
    bubbleText: { color: D.text },
    bubbleClose: { backgroundColor: D.surfaceAlt },
  },
);
