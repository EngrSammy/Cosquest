// "More": the rest of the game, one tap away (costquest-ios
// Roam/HallPage.swift MoreSheet, tiles from RoamHomeView.swift moreTiles).
// The rail keeps four buttons at most, so the map is not framed by a column
// of icons; every other feature is a tile here, shown once its level unlocks
// it. A tile closes the sheet first and opens its own 380 ms later (two
// sheets cannot be up at once).
import { Ionicons } from "@expo/vector-icons";
import { type ReactNode, useRef, useState } from "react";
import { type LayoutChangeEvent, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { GameIconButton, MAX_FONT_SCALE } from "./kit";
import { SheetHost } from "./Sheet";
import { SHEET_CLOSE_MS, useSheetMotion } from "./sheetMotion";
import { ELEVATION, edgeColor, RADIUS, SURFACES, useLook } from "./look";
import { GF, GP } from "./theme";
import { themedStyles, useThemedStyles } from "@/constants/chatTheme";

export type MoreTile = {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  title: string;
  badge?: number | null;
  /** What the tile does, after the sheet has closed. Without it (and without `custom`) the tile is information only. */
  onPress?: () => void;
  /** The feature's own button, drawn instead of the icon (it carries its own badge); `press` is the tile's action. */
  custom?: (press: () => void) => ReactNode;
};

/** A drag of the sheet closes it; the slide is SHEET_CLOSE_MS (SheetHost), the next sheet waits 380. */
const SLIDE_MS = SHEET_CLOSE_MS;
const NEXT_SHEET_MS = 380;
const MIN_TILE = 84;
const SPACING = 14;


export default function MoreSheet({ tiles, onClose }: { tiles: MoreTile[]; onClose: () => void }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const insets = useSafeAreaInsets();
  const motion = useSheetMotion();
  const [width, setWidth] = useState(0);
  const next = useRef<(() => void) | null>(null);

  // LazyVGrid(.adaptive(minimum: 84), spacing: 14): as many columns as fit, shared evenly.
  const cols = Math.max(1, Math.floor((width + SPACING) / (MIN_TILE + SPACING)));
  // Floored: three tiles of 114.33 and their gaps came to a hair over the row, and the third wrapped.
  const tileWidth = width > 0 ? Math.floor((width - SPACING * (cols - 1)) / cols) : MIN_TILE;
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  return (
    <SheetHost
      band="any"
      scrimLabel="Close More"
      onClose={() => {
        onClose();
        const action = next.current;
        next.current = null;
        if (action) setTimeout(action, Math.max(0, NEXT_SHEET_MS - SLIDE_MS));
      }}>
      {(close) => {
        const choose = (t: MoreTile) => () => {
          next.current = t.onPress ?? null;
          close();
        };
        return (
          <Animated.View entering={motion.entering} style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.grabber} />
            <View style={styles.head}>
              <Text style={styles.title} accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE}>
                More
              </Text>
            </View>
            <View style={styles.grid} onLayout={onLayout}>
              {tiles.map((t) => (
                <View key={t.id} style={[styles.tile, { width: tileWidth }]}>
                  <TileIcon tile={t} choose={choose(t)} />
                  <Text style={styles.tileTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                    {t.title}
                  </Text>
                </View>
              ))}
            </View>
          </Animated.View>
        );
      }}
    </SheetHost>
  );
}

function TileIcon({ tile, choose }: { tile: MoreTile; choose: () => void }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const look = useLook();
  if (tile.custom) return <>{tile.custom(choose)}</>;
  if (tile.onPress) {
    return <GameIconButton icon={tile.icon} color={tile.color} diameter={54} badge={tile.badge && tile.badge > 0 ? tile.badge : null} accessibilityLabel={tile.title} onPress={choose} />;
  }
  // Information only (the bag's count): a button that does nothing would be a lie.
  // A well-coloured disc (no shadow), so it does not read as a control.
  return (
    <View style={styles.info} accessible accessibilityLabel={`${tile.title}: ${tile.badge ?? 0} in the bag`}>
      <View style={[styles.infoFace, { backgroundColor: look.surfaceAlt }]}>
        <Ionicons name={tile.icon} size={24} color={edgeColor(tile.color)} />
      </View>
      {tile.badge && tile.badge > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText} maxFontSizeMultiplier={1.2}>
            {tile.badge}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const L = SURFACES.light;
const D = SURFACES.dark;

const STYLE_PAIR = themedStyles(
  {
    sheet: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: 20,
      paddingTop: 8,
      borderTopLeftRadius: RADIUS.sheet,
      borderTopRightRadius: RADIUS.sheet,
      backgroundColor: L.screen,
      ...ELEVATION.float,
    },
    grabber: { alignSelf: "center", width: 40, height: 5, borderRadius: 3, backgroundColor: "rgba(28,43,58,0.22)", marginBottom: 8 },
    head: { marginBottom: 18 },
    title: { fontFamily: GF.display, fontSize: 28, lineHeight: 32, color: L.text },
    grid: { flexDirection: "row", flexWrap: "wrap", columnGap: SPACING, rowGap: 20 },
    tile: { alignItems: "center", gap: 8 },
    tileTitle: { alignSelf: "stretch", textAlign: "center", fontFamily: GF.body, fontSize: 13, lineHeight: 16, color: L.text },
    info: { width: 54, height: 54 },
    infoFace: { width: 54, height: 54, borderRadius: 27, alignItems: "center", justifyContent: "center" },
    badge: {
      position: "absolute",
      top: -4,
      right: -6,
      minWidth: 20,
      height: 20,
      paddingHorizontal: 5,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: GP.berry,
      borderWidth: 2,
      borderColor: L.surface,
    },
    badgeText: { fontFamily: GF.display, fontSize: 12, lineHeight: 15, color: "#FFFFFF", fontVariant: ["tabular-nums"] },
  },
  {
    sheet: { backgroundColor: D.screen, shadowOpacity: 0, elevation: 0, boxShadow: "none", borderTopWidth: 1, borderColor: D.hairline },
    grabber: { backgroundColor: "rgba(255,255,255,0.22)" },
    title: { color: D.text },
    tileTitle: { color: D.text },
    badge: { borderColor: D.surface },
  },
);
