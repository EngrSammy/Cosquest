// A Quest Point, tapped: one card, floating above the bottom, with what is
// going on at the place (a wandering challenge, who holds it, a Guardian on
// it, a boss) and the one button that fits where the player stands. The
// server decides (its refusal is shown in its words). costquest-ios
// Roam/RoamHomeView.swift PointCard.
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { distanceText } from "@/features/game/geo";
import { challengeLabel, difficultyLabel, pointSubtitle, rechargeText, realmLine, tierName } from "@/features/game/guide";
import { isRaidPoint, RAID_COLOR } from "@/features/game/raids";
import { useGame } from "@/features/game/runtime";
import { siegeOf } from "@/features/game/siege";
import { type QuestPoint, spinReady } from "@/features/game/wire";
import { SITE_REALM_LINE, siteIdOf, siteSubtitle } from "@/features/game/wardenSite";

import { GAME_TO_CHAT } from "@/features/world/factionLink";

import { Chip, GameButton, GameIconButton, GamePanel, MAX_FONT_SCALE } from "./kit";
import { ACCENT, FACTION, labelOn, REALM_CHIP, SURFACES } from "./look";
import { HoldLine, SiegeLine, SpawnLine } from "./PointLines";
import RaidLine from "./RaidLine";
import { RaidCrown } from "./RaidParts";
import { useCardMotion } from "./sheetMotion";
import { usePinPortraits } from "./ForgeWorld";
import { GF, realmIcon, tierColor } from "./theme";
import { themedStyles, useThemedStyles } from "@/constants/chatTheme";


/** The glyph on a waiting (disabled) button: the kit's muted label colour. */
const WAIT_INK = SURFACES.light.textMuted;

/** A glyph on a button face, in the face's own label colour (never white on Sun). */
const on = (fill: string) => labelOn(fill);

export default function PointSheet({
  point,
  distance,
  inReach,
  cooling,
  factionName,
  legend,
  credit,
  onPlay,
  onSpin,
  onShare,
  onClose,
}: {
  point: QuestPoint;
  distance: number | null;
  inReach: boolean;
  cooling: boolean;
  /** Kept for callers written before the card read the point itself. */
  asDuel?: boolean;
  factionName: (id: string) => string;
  /** The Warden's line about the place, once written. */
  legend?: string | null;
  /** Where a Game Warden site's facts come from (their licences), shown under its facts. */
  credit?: string | null;
  onPlay: () => void;
  /** Spin the point for items (in reach, not resting). */
  onSpin?: () => void;
  onShare: () => void;
  onClose: () => void;
}) {
  const styles = useThemedStyles(STYLE_PAIR);
  const insets = useSafeAreaInsets();
  const card = useCardMotion();
  const me = useGame((s) => s.me);
  const [now, setNow] = useState(() => Date.now());
  // The spin's rest ends on its own: tick while it runs.
  const resting = !spinReady(point, now);
  useEffect(() => {
    if (!cooling && !resting) return;
    const t = setInterval(() => setNow(Date.now()), resting ? 5000 : 15000);
    return () => clearInterval(t);
  }, [cooling, resting]);

  const duel = point.challenge === "duel";
  const boss = isRaidPoint(point);
  const siege = siegeOf(point, me, factionName);
  const tint = tierColor(point.tier);
  const site = !!siteIdOf(point);
  // The Guardian it will put up, as on its map pin (art direction 5: the same render everywhere).
  const guardianPortrait = usePinPortraits()?.(point) ?? null;

  return (
    <Animated.View
      entering={card.entering}
      exiting={card.exiting}
      style={[styles.wrap, { bottom: insets.bottom + 14 }]}>
      <GamePanel>
        <View style={{ gap: 12 }}>
          <View style={styles.head}>
            <View style={{ flex: 1, gap: 6 }}>
              <View style={styles.chips}>
                <Chip text={duel ? difficultyLabel(point.tier) : tierName(point.tier)} color={tint} />
                <Chip text={challengeLabel(point.challenge)} color={ACCENT.sky.fill} light />
                {site ? <Chip text="Warden site" color={ACCENT.sky.fill} /> : null}
              </View>
              <Text style={styles.name} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7} accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE}>
                {point.name}
              </Text>
              <Text style={styles.subtitle} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                {site ? siteSubtitle(point) : pointSubtitle(point)}
              </Text>
            </View>
            <GameIconButton icon="chatbubbles" color={ACCENT.sky.fill} diameter={36} onPress={onShare} accessibilityLabel={`Invite a chat to ${point.name}`} />
            <GameIconButton icon="close" diameter={36} onPress={onClose} accessibilityLabel={`Close ${point.name}`} />
          </View>

          <SpawnLine point={point} />
          <HoldLine point={point} me={me} factionName={factionName} />
          <SiegeLine point={point} me={me} factionName={factionName} />
          <RaidLine point={point} />
          {legend ? <Text style={site ? styles.fact : styles.legend}>{legend}</Text> : null}
          {site && credit ? (
            <Text style={styles.credit} maxFontSizeMultiplier={MAX_FONT_SCALE}>
              {credit}
            </Text>
          ) : null}

          <View style={styles.realm} accessible accessibilityLabel={site ? SITE_REALM_LINE : realmLine(point, factionName)}>
            {/* Realm colours live on chips only: a small realm swatch, the words in the page's muted ink. */}
            {guardianPortrait ? (
              <View style={[styles.guardianRing, { backgroundColor: tint }]}>
                <Image source={{ uri: guardianPortrait }} style={styles.guardianFace} contentFit="cover" accessibilityIgnoresInvertColors />
              </View>
            ) : (
              <View style={[styles.realmDot, { backgroundColor: REALM_CHIP[point.realm ?? ""] ?? ACCENT.sky.fill }]}>
                <Ionicons name={realmIcon(point.realm)} size={12} color="#FFFFFF" />
              </View>
            )}
            <Text style={styles.realmText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
              {site ? SITE_REALM_LINE : realmLine(point, factionName)}
            </Text>
          </View>

          {cooling ? (
            <GameButton title={rechargeText(point, now)} disabled onPress={() => {}} icon={<Ionicons name="hourglass" size={20} color={WAIT_INK} />} />
          ) : inReach ? (
            <View style={styles.buttons}>
              {onSpin ? (
                <GameButton
                  title={spinReady(point, now) ? "Spin" : "Resting"}
                  color={ACCENT.sky.fill}
                  disabled={!spinReady(point, now)}
                  onPress={onSpin}
                  style={{ flex: 1 }}
                  icon={<Ionicons name="sync" size={20} color={spinReady(point, now) ? on(ACCENT.sky.fill) : WAIT_INK} />}
                />
              ) : null}
              <View style={{ flex: 1 }}>
              {siege ? (
              // A rival holds it: one answer won't take it, its Guardian has to be beaten.
              <GameButton title="Siege" color={siegeFill(siege.faction)} onPress={onPlay} icon={<Ionicons name="flag" size={20} color={on(siegeFill(siege.faction))} />} />
            ) : boss ? (
              <GameButton title="Fight the boss" color={RAID_COLOR} onPress={onPlay} icon={<RaidCrown size={22} />} />
            ) : duel ? (
              <GameButton title="Fight" color={ACCENT.sun.fill} onPress={onPlay} icon={<Ionicons name="flash" size={20} color={on(ACCENT.sun.fill)} />} />
            ) : (
              <GameButton title="Play" color={ACCENT.sun.fill} onPress={onPlay} icon={<Ionicons name="play" size={20} color={on(ACCENT.sun.fill)} />} />
            )}
              </View>
            </View>
          ) : (
            <GameButton
              title={`${distanceText(distance)} away · walk closer`}
              disabled
              onPress={() => {}}
              icon={<Ionicons name="walk" size={20} color={WAIT_INK} />}
            />
          )}
        </View>
      </GamePanel>
    </Animated.View>
  );
}

/** A siege is fought in the holder's deck-faction colour (realm -> deck faction). */
function siegeFill(realm: string | null | undefined): string {
  return FACTION[GAME_TO_CHAT[realm ?? ""] ?? ""]?.fill ?? ACCENT.berry.fill;
}

const L = SURFACES.light;
const D = SURFACES.dark;

const STYLE_PAIR = themedStyles(
  {
    wrap: { position: "absolute", left: 14, right: 14 },
    head: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
    chips: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
    name: { fontFamily: GF.display, fontSize: 28, lineHeight: 32, color: L.text },
    subtitle: { fontFamily: GF.regular, fontSize: 15, lineHeight: 21, color: L.textMuted },
    legend: { fontFamily: GF.regular, fontSize: 15, lineHeight: 21, fontStyle: "italic", color: L.textMuted },
    fact: { fontFamily: GF.regular, fontSize: 15, lineHeight: 21, color: L.text },
    credit: { fontFamily: GF.body, fontSize: 12, lineHeight: 16, color: L.textMuted, marginTop: -6 },
    realm: { flexDirection: "row", alignItems: "center", gap: 8 },
    realmDot: { width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center" },
    // The Guardian's portrait in a ring of the point's rarity (the pin's own look, larger).
    guardianRing: { width: 40, height: 40, borderRadius: 20, padding: 3 },
    guardianFace: { width: 34, height: 34, borderRadius: 17, backgroundColor: "#F4EEE2" },
    buttons: { flexDirection: "row", gap: 10 },
    realmText: { flexShrink: 1, fontFamily: GF.body, fontSize: 13, lineHeight: 16, letterSpacing: 0.2, color: L.textMuted },
  },
  {
    name: { color: D.text },
    subtitle: { color: D.textMuted },
    legend: { color: D.textMuted },
    fact: { color: D.text },
    credit: { color: D.textMuted },
    realmText: { color: D.textMuted },
  },
);
