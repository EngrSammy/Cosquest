// ==========================================
// RANK + ADMIN BADGES (beside names)
// ==========================================
// Group chat spec: "a small insignia or chevron tag beside the name,
// recognizable at a glance without reading text", and a separate marker for
// whoever runs the chat. Both can show side by side.
// (Drawn from the rank's chevrons / bars / star, so new rank names from the
// team just work. The designer's version can replace the drawing here.)
import { Ionicons } from "@expo/vector-icons";
import { Text, View } from "react-native";

import { FONTS } from "@/constants/fonts";
import type { Rank } from "@/services/ranks";
import { themedStyles, useThemedStyles } from "@/constants/chatTheme";

const PINK = "#C34D9C";

function Insignia({ rank, scale }: { rank: Rank; scale: number }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const chevrons = Math.min(rank.chevrons || 0, 3);
  const bars = Math.min(rank.bars || 0, 4);

  if (!chevrons && !bars && !rank.star) {
    return null;
  }

  return (
    <View style={styles.insignia}>
      {rank.star ? <Ionicons name="star" size={7 * scale} color={PINK} /> : null}

      {chevrons ? (
        <View style={{ marginTop: rank.star ? -2 * scale : 0 }}>
          {Array.from({ length: chevrons }).map((_, index) => (
            <Ionicons
              key={`c${index}`}
              name="chevron-up"
              size={10 * scale}
              color={PINK}
              style={{ marginTop: index === 0 ? 0 : -7 * scale, height: 7 * scale }}
            />
          ))}
        </View>
      ) : null}

      {bars ? (
        <View style={{ gap: 1 * scale, marginTop: 1 * scale }}>
          {Array.from({ length: bars }).map((_, index) => (
            <View
              key={`b${index}`}
              style={{
                width: 8 * scale,
                height: 1.6 * scale,
                borderRadius: 1,
                backgroundColor: PINK,
                opacity: 0.85,
              }}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function RankBadge({
  rank,
  size = "sm",
  showName = false,
}: {
  rank?: Rank | null;
  size?: "sm" | "md";
  // "Sergeant" instead of "Sgt".
  showName?: boolean;
}) {
  const styles = useThemedStyles(STYLE_PAIR);
  if (!rank) {
    return null;
  }

  const scale = size === "md" ? 1.3 : 1;

  return (
    <View
      style={[styles.badge, size === "md" && styles.badgeMd]}
      accessibilityLabel={`Rank: ${rank.name}`}>
      <Insignia rank={rank} scale={scale} />
      <Text style={[styles.text, size === "md" && styles.textMd]} numberOfLines={1}>
        {showName ? rank.name : rank.short}
      </Text>
    </View>
  );
}

// Figma M02: the rank on its own line under the name - teal "V" chevrons
// (1 for Private, 2 for Corporal, 3 for Sergeant and up) + the rank name.
const TEAL = "#2A8A92";

export function RankLine({ rank }: { rank?: Rank | null }) {
  const styles = useThemedStyles(STYLE_PAIR);
  if (!rank) {
    return null;
  }

  const count = Math.min(3, Math.max(1, rank.chevrons || 1));

  return (
    <View style={styles.rankLine} accessibilityLabel={`Rank: ${rank.name}`}>
      <View style={styles.rankChevrons}>
        {Array.from({ length: count }).map((_, index) => (
          <Ionicons
            key={index}
            name="chevron-down"
            size={13}
            color={TEAL}
            style={{ marginTop: index === 0 ? 0 : -9, height: 9 }}
          />
        ))}
      </View>
      <Text style={styles.rankLineText} numberOfLines={1}>
        {rank.name}
      </Text>
    </View>
  );
}

// "Owner" (filled) or "Admin" (outlined) for whoever runs the chat.
export function RoleBadge({ role }: { role?: string | null }) {
  const styles = useThemedStyles(STYLE_PAIR);
  if (role !== "owner" && role !== "admin") {
    return null;
  }

  const owner = role === "owner";

  return (
    <View style={[styles.role, owner ? styles.roleOwner : styles.roleAdmin]} accessibilityLabel={owner ? "Owner" : "Admin"}>
      <Ionicons name={owner ? "shield" : "shield-outline"} size={9} color={owner ? "#FFFFFF" : PINK} />
      <Text style={[styles.roleText, owner && styles.roleTextOwner]}>{owner ? "Owner" : "Admin"}</Text>
    </View>
  );
}

const STYLE_PAIR = themedStyles({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 7,
    backgroundColor: "rgba(195,77,156,0.12)",
  },

  badgeMd: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, gap: 5 },

  insignia: { alignItems: "center", justifyContent: "center" },

  text: { fontFamily: FONTS.semibold, fontSize: 9.5, color: PINK },

  textMd: { fontSize: 12.5 },

  role: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 7,
    borderWidth: 1,
  },

  roleOwner: { backgroundColor: PINK, borderColor: PINK },

  roleAdmin: { borderColor: PINK, backgroundColor: "transparent" },

  roleText: { fontFamily: FONTS.semibold, fontSize: 9.5, color: PINK },

  roleTextOwner: { color: "#FFFFFF" },

  rankLine: { flexDirection: "row", alignItems: "center", gap: 4 },

  rankChevrons: { width: 13, height: 12, alignItems: "center", justifyContent: "flex-start", overflow: "visible" },

  rankLineText: { fontFamily: FONTS.regular, fontSize: 11, lineHeight: 14, color: "#66738A" },
});
