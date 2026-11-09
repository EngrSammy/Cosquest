// The lines on a point card that say what is going on at the place: who holds
// it (HoldLine), a Guardian standing on a rival's hold (SiegeLine) and how
// long a wandering challenge stays (SpawnLine). costquest-ios
// Features/HoldsFeature.swift, SiegeFeature.swift (SiegeLine), SpawnsFeature.swift.
// The words and the rules are features/game/siege.ts.
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { type ReactNode, useEffect, useState } from "react";
import { Text, View } from "react-native";

import { expiresAt, holdLine, siegeOf, spawnLineLabel, spawnLineText } from "@/features/game/siege";
import type { QuestPoint, RoamMe } from "@/features/game/wire";

import { withAlpha } from "./kit";
import { GF, GP, realmColor } from "./theme";
import { themedStyles, useThemedStyles } from "@/constants/chatTheme";

type MeLike = Pick<RoamMe, "faction"> | null | undefined;

/** The round flag / shield badge at the start of a line. */
function Badge({ color, children }: { color: string; children: ReactNode }) {
  const styles = useThemedStyles(STYLE_PAIR);
  return (
    <View style={[styles.badge, { backgroundColor: color }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {children}
    </View>
  );
}

/** Who holds this point and how strongly, or that it is there for the taking. */
export function HoldLine({ point, me, factionName }: { point: QuestPoint; me: MeLike; factionName: (id: string) => string }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const line = holdLine(point, me, factionName);
  if (!line) return null;
  const color = realmColor(line.faction);
  if (line.kind === "held") {
    const strength = line.strength ?? 0;
    return (
      <View style={{ gap: 6 }} accessible accessibilityLabel={line.accessibilityLabel}>
        <View style={styles.row}>
          <Badge color={color}>
            <Ionicons name="flag" size={13} color="#FFFFFF" />
          </Badge>
          <Text style={styles.heldText} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8}>
            {line.text}
          </Text>
          <Text style={[styles.strength, { color }]}>{strength}</Text>
        </View>
        <View style={styles.barTrack}>
          <View style={{ height: 8, borderRadius: 4, backgroundColor: color, width: `${Math.max(0, Math.min(100, strength))}%`, minWidth: 8 }} />
        </View>
      </View>
    );
  }
  return (
    <View style={styles.row} accessible accessibilityLabel={line.accessibilityLabel}>
      <Badge color={withAlpha(GP.ink, 0.35)}>
        <Ionicons name="flag" size={13} color="#FFFFFF" />
      </Badge>
      <Text style={[styles.unclaimed, { color }]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8}>
        {line.text}
      </Text>
    </View>
  );
}

/** A rival's Guardian stands here: whose, and its HP. */
export function SiegeLine({ point, me, factionName }: { point: QuestPoint; me: MeLike; factionName: (id: string) => string }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const siege = siegeOf(point, me, factionName);
  if (!siege) return null;
  const color = realmColor(siege.faction);
  const text = `A ${siege.factionName} Guardian stands here`;
  return (
    <View style={styles.row} accessible accessibilityLabel={`${text}, ${siege.guardianHp} HP`}>
      <Badge color={GP.ink}>
        <Ionicons name="shield-half" size={13} color="#FFFFFF" />
      </Badge>
      <Text style={styles.siegeText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
        {text}
      </Text>
      <View style={styles.hp}>
        <Ionicons name="heart" size={14} color={color} />
        <Text style={[styles.strength, { color, fontSize: 15 }]}>{siege.guardianHp}</Text>
      </View>
    </View>
  );
}

/** "Wandering · gone in 12 min", counting down by the second. */
export function SpawnLine({ point }: { point: QuestPoint }) {
  if (expiresAt(point) === null) return null;
  return <Ticking point={point} />;
}

function Ticking({ point }: { point: QuestPoint }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const text = spawnLineText(point, now);
  const gone = (expiresAt(point) ?? 0) <= now;
  if (!text) return null;
  return (
    <View style={styles.spawn} accessible accessibilityLabel={spawnLineLabel(point, now) ?? text}>
      <MaterialCommunityIcons name="weather-windy" size={16} color={gone ? GP.berry : GP.skyDeep} />
      <Text style={styles.spawnText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
        {text}
      </Text>
    </View>
  );
}

const STYLE_PAIR = themedStyles({
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  badge: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  heldText: { flex: 1, fontFamily: GF.bold, fontSize: 15, color: GP.ink },
  unclaimed: { flex: 1, fontFamily: GF.body, fontSize: 15 },
  strength: { fontFamily: GF.display, fontSize: 17 },
  barTrack: { height: 8, borderRadius: 4, backgroundColor: withAlpha(GP.ink, 0.12), overflow: "hidden" },
  siegeText: { flex: 1, fontFamily: GF.body, fontSize: 14, color: withAlpha(GP.ink, 0.8) },
  hp: { flexDirection: "row", alignItems: "center", gap: 4 },
  spawn: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: withAlpha(GP.sky, 0.16),
  },
  spawnText: { fontFamily: GF.body, fontSize: 15, color: withAlpha(GP.ink, 0.8), fontVariant: ["tabular-nums"] },
});
