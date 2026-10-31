// ==========================================
// DASHBOARD CARDS: "Ongoing" quests and "Upcoming events"
// ==========================================
// A pastel card with the CosQuest pin badge (as tall as the card) over its
// left edge, and a character standing on the pin's top and rising above it
// (Figma · Home). Ongoing: place + ENTER.
// Upcoming: when, place, prize pool / entry + Register.
import { Image } from "expo-image";
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type ImageSourcePropType } from "react-native";

import { FONTS } from "@/constants/fonts";
import type { Quest } from "@/services/quests";

import { RED_PIN } from "./HeroQuest";
import { formatMoney, questPlace, whenLabel } from "./questFormat";

const PIN_MAGENTA = require("@/assets/images/dashboard/cosquest card pin icon - magenta.png");
const PIN_GREY = require("@/assets/images/dashboard/cosquest card pin icon - grey.png");

// Quests have no artwork yet: each card gets one of these in turn.
// Placed as in the Figma, measured against the pin (W = pin width,
// H = pin height): `size` is the width (w) or height (h) as a share of
// the pin; `left` and `top` are the offsets from the pin's top-left
// corner (negative = past the pin's edge).
type Character = {
  source: ImageSourcePropType;
  ratio: number; // width / height of the picture
  size: { w: number } | { h: number };
  left: number; // x W
  top: number; // x H
};

const CHARACTERS: Character[] = [
  // Astro Boy: wider than the pin, his arm reaching past its left edge.
  { source: require("@/assets/images/dashboard/cosquest card image.png"), ratio: 75 / 81, size: { w: 1.12 }, left: -0.27, top: -0.22 },
  // Blue hair: about the pin's height, just right of its left edge.
  { source: require("@/assets/images/dashboard/cosquest card image_1.png"), ratio: 27 / 58, size: { h: 0.98 }, left: 0.18, top: -0.17 },
  // Hooded figure with the staff.
  { source: require("@/assets/images/dashboard/cosquest card image_3.png"), ratio: 86 / 126, size: { h: 0.9 }, left: 0, top: -0.16 },
  // Red-jacket gunner.
  { source: require("@/assets/images/dashboard/cosquest card image_2.png"), ratio: 93 / 85, size: { w: 0.95 }, left: 0.1, top: -0.09 },
];

// The tallest rise above a pin (Astro Boy): the room each card keeps on top.
const RISE = 0.22;

const ONGOING_COLORS = ["#F3EDCF", "#DCEBF8", "#D9DEE4", "#F6DCE8"];
const UPCOMING_COLORS = ["#D8F1E4", "#DDD5F6", "#EBD8DE", "#DCEBF8"];

// Card heights; the pin badge matches them (both pin pictures are 3:4).
const ONGOING_H = 92;
const UPCOMING_H = 124;
const PIN_RATIO = 0.75;

export const ONGOING_WIDTH = 200;
export const UPCOMING_WIDTH = 232;

// Astro Boy's arm reaches this far left of the first card: the list keeps
// this much room before it so the arm isn't cut off.
export const CHARACTER_REACH = Math.ceil(ONGOING_H * PIN_RATIO * 0.27);

// The pin, as tall as the card, with its character placed as above.
function Badge({ index, height, grey }: { index: number; height: number; grey?: boolean }) {
  const width = Math.round(height * PIN_RATIO);
  const character = CHARACTERS[index % CHARACTERS.length];
  const charW = "w" in character.size ? width * character.size.w : height * character.size.h * character.ratio;
  const charH = charW / character.ratio;
  return (
    <View style={[styles.badge, { width, height }]} pointerEvents="none">
      <Image source={grey ? PIN_GREY : PIN_MAGENTA} style={{ width, height }} contentFit="contain" />
      <Image
        source={character.source}
        style={{
          position: "absolute",
          width: charW,
          height: charH,
          left: width * character.left,
          top: height * character.top,
        }}
        contentFit="contain"
      />
    </View>
  );
}

function Place({ quest }: { quest: Quest }) {
  return (
    <View style={styles.placeRow}>
      <Image source={RED_PIN} style={styles.placePin} contentFit="contain" />
      <Text style={styles.place} numberOfLines={1}>
        {questPlace(quest) || "Location TBA"}
      </Text>
    </View>
  );
}

function CardButton({ label, onPress, busy }: { label: string; onPress: () => void; busy?: boolean }) {
  return (
    <Pressable style={styles.button} onPress={onPress} disabled={busy} accessibilityRole="button">
      {busy ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.buttonText}>{label}</Text>}
    </Pressable>
  );
}

export function OngoingCard({
  quest,
  index,
  joined,
  busy,
  onEnter,
}: {
  quest: Quest;
  index: number;
  joined: boolean;
  busy: boolean;
  onEnter: () => void;
}) {
  return (
    <View style={[styles.slot, { width: ONGOING_WIDTH, height: ONGOING_H * (1 + RISE) }]}>
      <View style={[styles.body, bodySize(ONGOING_H), { backgroundColor: ONGOING_COLORS[index % ONGOING_COLORS.length] }]}>
        <View style={styles.statusRow}>
          <View style={styles.dot} />
          <Text style={styles.status}>Ongoing</Text>
        </View>
        <Place quest={quest} />
        <CardButton label={joined ? "ENTERED" : "ENTER"} onPress={onEnter} busy={busy} />
      </View>
      <Badge index={index} height={ONGOING_H} />
    </View>
  );
}

export function UpcomingCard({
  quest,
  index,
  registered,
  busy,
  onRegister,
}: {
  quest: Quest;
  index: number;
  registered: boolean;
  busy: boolean;
  onRegister: () => void;
}) {
  return (
    <View style={[styles.slot, { width: UPCOMING_WIDTH, height: UPCOMING_H * (1 + RISE) }]}>
      <View style={[styles.body, bodySize(UPCOMING_H), { backgroundColor: UPCOMING_COLORS[index % UPCOMING_COLORS.length] }]}>
        <View style={styles.statusRow}>
          <View style={styles.dot} />
          <Text style={styles.status} numberOfLines={1}>
            {whenLabel(quest.startsAt)}
          </Text>
        </View>
        <Place quest={quest} />
        <View style={styles.money}>
          <View style={styles.moneyCol}>
            <Text style={styles.moneyLabel}>Prize Pool</Text>
            <Text style={styles.moneyValue} numberOfLines={1} adjustsFontSizeToFit>
              {formatMoney(quest.prizePool, "—")}
            </Text>
          </View>
          <View style={[styles.moneyCol, styles.moneyRight]}>
            <Text style={styles.moneyLabel}>Entry</Text>
            <Text style={styles.moneyValue} numberOfLines={1} adjustsFontSizeToFit>
              {formatMoney(quest.entryFee)}
            </Text>
          </View>
        </View>
        <CardButton label={registered ? "Registered" : "Register"} onPress={onRegister} busy={busy} />
      </View>
      <Badge index={index + 2} height={UPCOMING_H} grey />
    </View>
  );
}

// The card sits right of the pin's middle; its text starts after the pin.
function bodySize(height: number) {
  const pinW = Math.round(height * PIN_RATIO);
  return { height, marginLeft: pinW / 2, paddingLeft: pinW / 2 + 8 };
}

const styles = StyleSheet.create({
  slot: { justifyContent: "flex-end" },
  body: {
    paddingRight: 8,
    paddingVertical: 8,
    justifyContent: "space-between",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.8)",
    shadowColor: "#24283C",
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  badge: { position: "absolute", left: 0, bottom: 0 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: "#5BD15B" },
  status: { flexShrink: 1, fontFamily: FONTS.semibold, fontSize: 12, color: "#191922" },
  placeRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  placePin: { width: 8, height: 12 },
  place: { flexShrink: 1, fontFamily: FONTS.regular, fontSize: 10.5, color: "#191922" },
  money: {
    flexDirection: "row",
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#B63D91",
  },
  moneyCol: { flex: 1, minWidth: 0 },
  moneyRight: { alignItems: "flex-end" },
  moneyLabel: { fontFamily: FONTS.medium, fontSize: 8.5, color: "#191922" },
  moneyValue: { fontFamily: FONTS.bold, fontSize: 12, color: "#8E2E6F" },
  button: {
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 4,
    backgroundColor: "#0B0B10",
  },
  buttonText: { fontFamily: FONTS.semibold, fontSize: 10.5, letterSpacing: 0.4, color: "#FFFFFF" },
});
