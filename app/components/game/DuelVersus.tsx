// "Who is fighting whom", while the arena loads (costquest-ios Features/DuelFeature.swift
// VersusCard): the mode's title, you, "VS", and the Guardian. It holds for
// 1.8 s (VERSUS_MS) before the fight.
//
// Both sides are drawn the same way, face to face: a big portrait in a frame
// of the fighter's house colour, a weapon badge on it, the name and the
// subline. Your portrait is the Forge hero you wear (its thumbnail, on screen
// at once), else your own photo, else your drawn avatar, as on the HUD; the
// Guardian's is its Forge character, else its weapon. Your Forge weapon sits
// on your badge. (It used to show the Guardian's portrait and nothing on your
// side, with the card short in the middle of an empty screen.)
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import type { ComponentProps } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";

import { useMyPicture } from "@/components/world/useMyPicture";
import { fightersOf, versusSubline, versusTitle } from "@/features/game/duelFlow";
import { thumbUrl, useEquipped } from "@/features/game/forgeWorldDevice";
import { gameStore, useGame } from "@/features/game/runtime";
import type { DuelFighterPeek, DuelStart } from "@/features/game/wire";

import AvatarView from "./AvatarView";
import { useForgeEntry } from "./ForgeModel";
import { ForgeFighterArt, useForgeOn } from "./ForgeWorld";
import { MAX_FONT_SCALE } from "./kit";
import { GAME_TO_CHAT } from "@/features/world/factionLink";

import { ACCENT, contrast, edgeColor, FACTION, labelOn, RADIUS, SURFACES, useLook } from "./look";
import { GF } from "./theme";
import { themedStyles, useThemedStyles } from "@/constants/chatTheme";
import { POP_FADE, POP_IN_SOFT } from "./sheetMotion";

type IconName = ComponentProps<typeof Ionicons>["name"];

/** The portrait's side; the weapon badge is a third of it. */
const PORTRAIT = 104;
const BADGE = 38;

/** DuelLook.weaponSymbol, in Ionicons. */
function weaponIcon(w: string | null | undefined): IconName {
  switch (w) {
    case "fists":
      return "hand-left";
    case "polearm":
      return "remove";
    case "blaster":
      return "locate";
    case "arcane":
      return "sparkles";
    default:
      return "shield-half";
  }
}

export default function DuelVersus({ start }: { start: DuelStart }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const reduce = useReducedMotion();
  const title = versusTitle(start, (id) => gameStore.factionName(id));
  const f = fightersOf(start);
  // One element for VoiceOver, as .accessibilityElement(children: .combine).
  const label = f ? `${title}. ${f.p1.name}, you, against ${f.p2.name}.` : title;
  return (
    <Animated.View
      entering={reduce ? POP_FADE : POP_IN_SOFT}
      style={styles.card}
      accessible
      accessibilityLabel={label}>
      <Text style={styles.title} maxFontSizeMultiplier={MAX_FONT_SCALE}>
        {title.toUpperCase()}
      </Text>
      {f ? (
        <>
          <Side f={f.p1} you />
          <View style={styles.vsRow}>
            <View style={styles.vsRule} />
            <Text style={styles.vs} maxFontSizeMultiplier={1.2}>
              VS
            </Text>
            <View style={styles.vsRule} />
          </View>
          <Side f={f.p2} you={false} />
        </>
      ) : null}
    </Animated.View>
  );
}

/** One fighter: you on the left of your card, the Guardian mirrored on the right of its own. */
function Side({ f, you }: { f: DuelFighterPeek; you: boolean }) {
  const styles = useThemedStyles(STYLE_PAIR);
  // The fighter's deck-faction colour (realm -> deck faction): realm colours never tint the fight.
  const tint = FACTION[GAME_TO_CHAT[f.faction ?? ""] ?? f.faction ?? ""]?.fill ?? (you ? ACCENT.sky.fill : ACCENT.berry.fill);
  const look = useLook();
  const tintText = contrast(tint, look.surface) >= 4.5 ? tint : contrast(edgeColor(tint, 0.6), look.surface) >= 4.5 ? edgeColor(tint, 0.6) : look.text;
  return (
    <View style={styles.sideWrap}>
      <View style={[StyleSheet.absoluteFill, { top: 4, borderRadius: RADIUS.card, backgroundColor: edgeColor(tint) }]} />
      <View style={[styles.side, you ? null : styles.sideMirrored]}>
        <View style={[styles.portrait, { borderColor: tint, backgroundColor: edgeColor(tint) }]}>
          {you ? <YourPortrait tint={tint} /> : <GuardianPortrait f={f} />}
          <View style={[styles.badge, you ? styles.badgeRight : styles.badgeLeft, { backgroundColor: tint }]}>
            <Ionicons name={weaponIcon(f.weapon_class)} size={18} color={labelOn(tint)} />
            {/* Your Forge weapon, over the class icon when you hold one (cq 056). */}
            {you ? (
              <View style={StyleSheet.absoluteFill}>
                <ForgeFighterArt fighter={f} size={BADGE} />
              </View>
            ) : null}
          </View>
        </View>
        <View style={[styles.words, you ? null : styles.wordsMirrored]}>
          <Text style={[styles.kicker, { color: tintText }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>
            {you ? "YOU" : "OPPONENT"}
          </Text>
          <Text
            style={[styles.name, you ? null : styles.textRight]}
            numberOfLines={2}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
            maxFontSizeMultiplier={MAX_FONT_SCALE}>
            {f.name}
          </Text>
          <Text
            style={[styles.subline, you ? null : styles.textRight]}
            numberOfLines={2}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
            maxFontSizeMultiplier={MAX_FONT_SCALE}>
            {versusSubline(f).toUpperCase()}
          </Text>
        </View>
      </View>
    </View>
  );
}

/** You, as the HUD shows you: the worn Forge hero, else your photo, else your drawn avatar. */
function YourPortrait({ tint }: { tint: string }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const on = useForgeOn();
  const { avatar } = useEquipped();
  const hero = useForgeEntry(on ? avatar : null);
  const heroUrl = hero ? thumbUrl(hero, 256) : null;
  const picture = useMyPicture();
  const profile = useGame((s) => s.profile);
  if (heroUrl) {
    return <Image source={{ uri: heroUrl }} style={styles.portraitImage} contentFit="cover" accessibilityIgnoresInvertColors />;
  }
  if (picture) {
    return <Image source={picture} style={styles.portraitImage} contentFit="cover" accessibilityIgnoresInvertColors />;
  }
  return (
    <View style={[styles.portraitImage, styles.portraitCentre, { backgroundColor: tint }]}>
      <AvatarView avatar={profile?.avatar ?? { face: 1, mark: 1, tint }} size={PORTRAIT * 0.7} />
    </View>
  );
}

/** The Guardian: its Forge character's thumbnail when the server picked one, over its weapon. */
function GuardianPortrait({ f }: { f: DuelFighterPeek }) {
  const styles = useThemedStyles(STYLE_PAIR);
  return (
    <View style={[styles.portraitImage, styles.portraitCentre]}>
      <Ionicons name={weaponIcon(f.weapon_class)} size={PORTRAIT * 0.42} color="rgba(255,255,255,0.9)" />
      <View style={StyleSheet.absoluteFill}>
        <ForgeFighterArt fighter={f} size={PORTRAIT - 6} />
      </View>
    </View>
  );
}

const L = SURFACES.light;
const D = SURFACES.dark;

// The versus card sits over the dark fight stage: paper cards for the two fighters, a Sun "VS".
const STYLE_PAIR = themedStyles(
  {
    card: { alignItems: "center", gap: 20, paddingHorizontal: 20, paddingVertical: 24, width: "100%" },
    title: { fontFamily: GF.bold, fontSize: 15, lineHeight: 19, letterSpacing: 1, color: "rgba(243,240,232,0.8)", textAlign: "center" },
    vsRow: { flexDirection: "row", alignItems: "center", gap: 14, width: "100%", maxWidth: 380 },
    vsRule: { flex: 1, height: 2, borderRadius: 1, backgroundColor: "rgba(255,255,255,0.18)" },
    vs: { fontFamily: GF.display, fontSize: 48, lineHeight: 52, color: ACCENT.sun.fill, textShadowColor: ACCENT.sun.edge, textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 0.1 },
    sideWrap: { width: "100%", maxWidth: 380, paddingBottom: 4 },
    side: { flexDirection: "row", alignItems: "center", gap: 16, padding: 14, borderRadius: RADIUS.card, backgroundColor: L.surface },
    sideMirrored: { flexDirection: "row-reverse" },
    portrait: { width: PORTRAIT, height: PORTRAIT, borderRadius: 18, borderWidth: 3, overflow: "visible" },
    portraitImage: { width: PORTRAIT - 6, height: PORTRAIT - 6, borderRadius: 15, overflow: "hidden" },
    portraitCentre: { alignItems: "center", justifyContent: "center" },
    badge: {
      position: "absolute",
      bottom: -8,
      width: BADGE,
      height: BADGE,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: L.surface,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    },
    badgeRight: { right: -10 },
    badgeLeft: { left: -10 },
    words: { flex: 1, gap: 3 },
    wordsMirrored: { alignItems: "flex-end" },
    kicker: { fontFamily: GF.bold, fontSize: 12, lineHeight: 15, letterSpacing: 1 },
    name: { fontFamily: GF.display, fontSize: 22, lineHeight: 26, color: L.text },
    subline: { fontFamily: GF.regular, fontSize: 12, lineHeight: 16, color: L.textMuted },
    textRight: { textAlign: "right" },
  },
  {
    side: { backgroundColor: D.surface, borderWidth: 1, borderColor: D.hairline },
    badge: { borderColor: D.surface },
    name: { color: D.text },
    subline: { color: D.textMuted },
  },
);
