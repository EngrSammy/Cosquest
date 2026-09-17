import { MOCK_LEADERBOARD } from "@/constants/mockLeaderboard";
import { Image } from "expo-image";
import { StyleSheet, Text, View } from "react-native";
import { DraggableAvatar } from "./DraggableAvatar";

export function Spotlight() {
  const top3 = MOCK_LEADERBOARD.slice(0, 3);
  const order = [top3[1], top3[0], top3[2]];
  const rest = MOCK_LEADERBOARD.slice(3);

  return (
    <View>
      {/* Bounty Board label + level */}
      <View style={styles.boardLabel}>
        <Text style={styles.trophy}>🏆</Text>
        <Text style={styles.boardText}>Bounty Board</Text>
      </View>
      <Text style={styles.level}>Level 1</Text>

      {/* ── PODIUM (top 3) */}
      <View style={styles.podium}>
        {order.map((p) => {
          const first = p.id === top3[0].id;
          return (
            <View key={p.id} style={styles.podiumCol}>
              <DraggableAvatar
                source={p.avatar}
                style={first ? styles.avatarBig : styles.avatarSmall}
              />
              <Text style={styles.podiumName}>{p.name}</Text>
              <Text style={styles.podiumScore}>{p.points}</Text>
            </View>
          );
        })}
      </View>

      {/* ── Ranked list (#4+) ── */}
      <View style={styles.list}>
        {rest.map((entry, i) => (
          <View key={entry.id} style={styles.row}>
            <Image
              source={entry.avatar}
              style={styles.avatar}
              contentFit="cover"
            />
            <View style={styles.rowText}>
              <Text style={styles.name}>{entry.name}</Text>
              <Text style={styles.meta}>
                {entry.points} Pts · {entry.realm}
              </Text>
            </View>
            {/* rest starts at global index 3, so its first rank is #4 */}
            <Text style={styles.rank}>#{i + 4}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  boardLabel: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 4,
  },
  trophy: { fontSize: 18 },
  boardText: { fontSize: 15, fontWeight: "700", color: "#4c4c56" },
  level: {
    fontSize: 40,
    fontWeight: "700",
    color: "#444446",
    textAlign: "center",
    marginTop: 2,
    marginBottom: 16,
  },

  podium: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "center",
    marginBottom: 30,
    gap: 40,
  },
  podiumCol: {
    alignItems: "center",
    gap: 5,
  },
  avatarBig: {
    alignItems: "center",
    height: 95,
    width: 95,
    backgroundColor: "rgba(195, 77, 156, 0.2)",
    borderRadius: 50,
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  avatarSmall: {
    alignItems: "center",
    height: 70,
    width: 70,
    backgroundColor: "rgba(195, 77, 156, 0.2)",
    borderRadius: 50,
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  podiumName: {
    fontSize: 18,
    fontWeight: "600",
    color: "#444446",
    textAlign: "center",
  },
  podiumScore: {
    fontSize: 18,
    fontWeight: "700",
    color: "#C5399A",
    textAlign: "center",
    marginTop: -6,
  },
  list: { gap: 12 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(195, 77, 156, 0.2)",
  },
  rowText: { flex: 1 },
  name: { fontSize: 15, fontWeight: "600", color: "#191922" },
  meta: { fontSize: 12, color: "#6b6b72", marginTop: 2 },
  rank: { fontSize: 13, fontWeight: "600", color: "#9C9CAA" },
});
