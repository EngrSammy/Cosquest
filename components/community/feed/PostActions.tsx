import { FONTS } from "@/constants/fonts";
import { Ionicons } from "@expo/vector-icons";
import { useId, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";

// ==========================================
// FIGMA MEASUREMENTS (card = 355.42 x 384.19)
// ==========================================
// The dark shape at the bottom of the photo. Tall enough for the icons, the
// counts AND the date underneath (it was 64, which cut the date off).
const PANEL_HEIGHT = 84;

// Shape, as fractions of the card width. The dark box is flat over the
// buttons, then it quickly slims down and FADES OUT before the right edge.
const FLAT_UNTIL = 0.46; // the box stays full height until here
const TAIL_END = 0.84; // the slim tail is gone (and invisible) by here
const CURVE_C1 = 0.56; // curve handles
const CURVE_C2 = 0.68;

// Positions inside the panel (design units):
const STATS_LEFT = 24; // heart / comment / share start
const STATS_TOP = 12; // icons start 12 below the top of the panel
const SAVE_RIGHT = 20; // bookmark on the right
const SAVE_BOTTOM = 14; // lifted to line up with the other counts

function getRelativeTime(createdAt?: string) {
  if (!createdAt) {
    return "";
  }

  const timestamp = new Date(createdAt).getTime();

  if (Number.isNaN(timestamp)) {
    return "";
  }

  const seconds = Math.floor(Math.max(0, Date.now() - timestamp) / 1000);

  if (seconds < 60) return "just now";

  const minutes = Math.floor(seconds / 60);

  if (minutes < 60) return `${minutes} min${minutes === 1 ? "" : "s"} ago`;

  const hours = Math.floor(minutes / 60);

  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;

  const days = Math.floor(hours / 24);

  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;

  const weeks = Math.floor(days / 7);

  return `${weeks} week${weeks === 1 ? "" : "s"} ago`;
}

function formatCount(value: number) {
  return value.toLocaleString();
}

function Stat({
  icon,
  count,
  color,
  onPress,
  label,
  wide,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  count: number;
  color: string;
  onPress: () => void;
  label: string;
  wide: boolean;
}) {
  return (
    <Pressable
      style={[styles.stat, wide ? styles.statWide : styles.statNarrow]}
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}>
      <Ionicons name={icon} size={22} color={color} />
      <Text style={[styles.count, { color }]}>{formatCount(count)}</Text>
    </Pressable>
  );
}

// The dark shape behind the buttons: a box over like / comment / share, then
// the top edge curves down so the rest gets slimmer, and it fades to nothing.
function PanelShape({ width }: { width: number }) {
  const h = PANEL_HEIGHT;
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");

  const flatEnd = width * FLAT_UNTIL;
  const tailEnd = width * TAIL_END;

  // Closed shape = the dark fill.
  const fill =
    `M0 0 L${flatEnd} 0 ` +
    `C${width * CURVE_C1} 0 ${width * CURVE_C2} ${h} ${tailEnd} ${h} ` +
    `L0 ${h} Z`;

  // Open line = just the white rim along the top + curve.
  const edge =
    `M0 0.5 L${flatEnd} 0.5 ` +
    `C${width * CURVE_C1} 0.5 ${width * CURVE_C2} ${h - 0.5} ${tailEnd} ${h - 0.5}`;

  return (
    <Svg
      width={width}
      height={h}
      style={StyleSheet.absoluteFill}
      pointerEvents="none">
      <Defs>
        {/* dark fill: solid over the buttons, fading to nothing */}
        <LinearGradient
          id={`fill${id}`}
          gradientUnits="userSpaceOnUse"
          x1={0}
          y1={0}
          x2={tailEnd}
          y2={0}>
          <Stop offset="0" stopColor="#000000" stopOpacity={0.3} />
          <Stop offset="0.5" stopColor="#000000" stopOpacity={0.25} />
          <Stop offset="1" stopColor="#000000" stopOpacity={0} />
        </LinearGradient>

        {/* white rim: also fades out */}
        <LinearGradient
          id={`edge${id}`}
          gradientUnits="userSpaceOnUse"
          x1={0}
          y1={0}
          x2={tailEnd}
          y2={0}>
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={1} />
          <Stop offset="0.6" stopColor="#FFFFFF" stopOpacity={0.85} />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
        </LinearGradient>
      </Defs>

      <Path d={fill} fill={`url(#fill${id})`} />
      <Path d={edge} fill="none" stroke={`url(#edge${id})`} strokeWidth={1} />
    </Svg>
  );
}

// Like · Comment · Share on the dark swoosh at the BOTTOM of the photo, with
// the time under the counts. Save (with its count) floats on its own at the
// bottom right.
//
// `overlay` = drawn on top of media (default). For text-only posts there's
// no media, so the same buttons are shown as a plain row instead.
export function PostActions({
  likes,
  comments,
  shares,
  saves,
  liked,
  bookmarked,
  createdAt,
  onLike,
  onComment,
  onShare,
  onBookmark,
  overlay = true,
}: {
  likes: number;
  comments: number;
  shares: number;
  saves?: number;
  liked: boolean;
  bookmarked: boolean;
  createdAt?: string;
  onLike: () => void;
  onComment: () => void;
  onShare: () => void;
  onBookmark: () => void;
  overlay?: boolean;
}) {
  const [panelWidth, setPanelWidth] = useState(0);

  const baseColor = overlay ? "#FFFFFF" : "#3B3B42";
  const likeColor = liked ? "#FF3B30" : baseColor;
  const saveColor = bookmarked ? "#C5399A" : baseColor;
  const time = getRelativeTime(createdAt);

  const stats = (
    <>
      <View style={styles.statsRow}>
        <Stat
          icon={liked ? "heart" : "heart-outline"}
          count={likes}
          color={likeColor}
          onPress={onLike}
          label={liked ? "Unlike" : "Like"}
          wide={overlay}
        />

        <Stat
          icon="chatbubble-outline"
          count={comments}
          color={baseColor}
          onPress={onComment}
          label="Comments"
          wide={overlay}
        />

        <Stat
          icon="paper-plane-outline"
          count={shares}
          color={baseColor}
          onPress={onShare}
          label="Share"
          wide={overlay}
        />
      </View>

      {time ? (
        <Text style={[styles.time, !overlay && styles.timeInline]}>{time}</Text>
      ) : null}
    </>
  );

  const saveButton = (
    <Pressable
      onPress={onBookmark}
      hitSlop={10}
      style={styles.saveButton}
      accessibilityRole="button"
      accessibilityLabel={bookmarked ? "Remove from saved" : "Save"}>
      <Ionicons
        name={bookmarked ? "bookmark" : "bookmark-outline"}
        size={22}
        color={saveColor}
      />

      {typeof saves === "number" ? (
        <Text style={[styles.count, { color: saveColor }]}>
          {formatCount(saves)}
        </Text>
      ) : null}
    </Pressable>
  );

  if (!overlay) {
    return (
      <View style={styles.inlineRow}>
        <View>{stats}</View>
        {saveButton}
      </View>
    );
  }

  return (
    <>
      <View
        style={styles.panel}
        pointerEvents="box-none"
        onLayout={(event) => setPanelWidth(event.nativeEvent.layout.width)}>
        {panelWidth > 0 ? <PanelShape width={panelWidth} /> : null}

        <View style={styles.panelContent}>{stats}</View>
      </View>

      <View style={styles.save}>{saveButton}</View>
    </>
  );
}

const styles = StyleSheet.create({
  // Full width of the photo, anchored to the bottom. The empty right side
  // lets touches through to the photo.
  panel: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: PANEL_HEIGHT,
    zIndex: 6,
  },

  panelContent: {
    position: "absolute",
    left: STATS_LEFT,
    top: STATS_TOP,
  },

  statsRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },

  stat: {
    alignItems: "center",
  },

  // Over the photo: icon centres are 40 apart, like the Figma.
  statWide: {
    width: 40,
  },

  // Text-only posts (plain row).
  statNarrow: {
    minWidth: 30,
    marginRight: 22,
  },

  // Fixed line heights keep the counts and date compact (Poppins' default
  // line height is tall, which pushed the date off the photo).
  count: {
    marginTop: 2,
    fontSize: 10.5,
    lineHeight: 14,
    fontFamily: FONTS.medium,
    color: "#FFFFFF",
  },

  time: {
    marginTop: 6,
    marginLeft: 8,
    fontSize: 10.5,
    lineHeight: 14,
    fontFamily: FONTS.regular,
    color: "#FFFFFF",
  },

  timeInline: {
    marginLeft: 0,
    color: "#8A8A93",
  },

  // Save (and its count) on its own at the bottom right.
  save: {
    position: "absolute",
    right: SAVE_RIGHT,
    bottom: SAVE_BOTTOM,
    zIndex: 7,
  },

  saveButton: {
    alignItems: "center",
  },

  // Text-only posts: the same buttons as a plain row.
  inlineRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
    paddingHorizontal: 4,
  },
});
