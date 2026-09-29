import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { fetchSpotlightLeaderboard } from "@/store/thunks/spotlightThunks";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { DraggableAvatar } from "./DraggableAvatar";

function getAvatar(entry: any) {
  return (
    entry?.avatarPhotoUrl ||
    entry?.avatarUrl ||
    entry?.avatar ||
    entry?.profilePicture ||
    null
  );
}

function getName(entry: any) {
  return entry?.name || entry?.username || "CosQuest User";
}

function getPoints(entry: any) {
  return Number(entry?.points ?? 0);
}

export function Spotlight() {
  const dispatch = useAppDispatch();

  const token = useAppSelector((state) => state.auth.token);

  const { leaderboard, loading, error } = useAppSelector(
    (state) => state.spotlight,
  );

  useEffect(() => {
    if (!token) {
      return;
    }

    dispatch(
      fetchSpotlightLeaderboard({
        token,
        page: 1,
        limit: 20,
      }),
    );
  }, [dispatch, token]);

  const top3 = leaderboard.slice(0, 3);

  const order = [top3[1], top3[0], top3[2]].filter(Boolean);

  const rest = leaderboard.slice(3);

  return (
    <View>
      {/* Bounty Board label + level */}

      <View style={styles.boardLabel}>
        <Text style={styles.trophy}>🏆</Text>

        <Text style={styles.boardText}>Bounty Board</Text>
      </View>

      <Text style={styles.level}>Level 1</Text>

      {/* LOADING */}

      {loading && leaderboard.length === 0 ? (
        <View style={styles.loading}>
          <ActivityIndicator size="small" color="#C5399A" />

          <Text style={styles.loadingText}>Loading leaderboard...</Text>
        </View>
      ) : null}

      {/* ERROR */}

      {!loading && error && leaderboard.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="alert-circle-outline" size={28} color="#C5399A" />

          <Text style={styles.emptyText}>{error}</Text>
        </View>
      ) : null}

      {/* EMPTY */}

      {!loading && !error && leaderboard.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="trophy-outline" size={30} color="#9C9CAA" />

          <Text style={styles.emptyText}>No Spotlight rankings yet.</Text>
        </View>
      ) : null}

      {/* PODIUM */}

      {top3.length > 0 ? (
        <View style={styles.podium}>
          {order.map((entry) => {
            if (!entry) {
              return null;
            }

            const first = entry.id === top3[0]?.id;

            const avatar = getAvatar(entry);

            return (
              <View key={entry.id} style={styles.podiumCol}>
                {avatar ? (
                  <DraggableAvatar
                    source={avatar}
                    style={first ? styles.avatarBig : styles.avatarSmall}
                  />
                ) : (
                  <View
                    style={[
                      first ? styles.avatarBig : styles.avatarSmall,
                      styles.avatarFallback,
                    ]}>
                    <Ionicons
                      name="person"
                      size={first ? 34 : 26}
                      color="#C5399A"
                    />
                  </View>
                )}

                <Text style={styles.podiumName} numberOfLines={1}>
                  {getName(entry)}
                </Text>

                <Text style={styles.podiumScore}>{getPoints(entry)}</Text>
              </View>
            );
          })}
        </View>
      ) : null}

      {/* RANKED LIST #4+ */}

      {rest.length > 0 ? (
        <View style={styles.list}>
          {rest.map((entry, i) => {
            const avatar = getAvatar(entry);

            const rank = entry.rank ?? i + 4;

            return (
              <View key={entry.id} style={styles.row}>
                {avatar ? (
                  <Image
                    source={{
                      uri: avatar,
                    }}
                    style={styles.avatar}
                    contentFit="cover"
                  />
                ) : (
                  <View style={[styles.avatar, styles.avatarFallback]}>
                    <Ionicons name="person" size={18} color="#C5399A" />
                  </View>
                )}

                <View style={styles.rowText}>
                  <Text style={styles.name} numberOfLines={1}>
                    {getName(entry)}
                  </Text>

                  <Text style={styles.meta} numberOfLines={1}>
                    {getPoints(entry)} Pts
                    {entry.realm ? ` · ${entry.realm}` : ""}
                  </Text>
                </View>

                <Text style={styles.rank}>#{rank}</Text>
              </View>
            );
          })}
        </View>
      ) : null}
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

  trophy: {
    fontSize: 18,
  },

  boardText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#4c4c56",
  },

  level: {
    fontSize: 40,
    fontWeight: "700",
    color: "#444446",
    textAlign: "center",
    marginTop: 2,
    marginBottom: 16,
  },

  loading: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 24,
    gap: 8,
  },

  loadingText: {
    fontSize: 13,
    color: "#777780",
  },

  empty: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 30,
    gap: 8,
  },

  emptyText: {
    fontSize: 14,
    color: "#777780",
    textAlign: "center",
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
    maxWidth: 105,
  },

  avatarBig: {
    alignItems: "center",
    justifyContent: "center",
    height: 95,
    width: 95,
    backgroundColor: "rgba(195, 77, 156, 0.2)",
    borderRadius: 50,
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    elevation: 4,
  },

  avatarSmall: {
    alignItems: "center",
    justifyContent: "center",
    height: 70,
    width: 70,
    backgroundColor: "rgba(195, 77, 156, 0.2)",
    borderRadius: 50,
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    elevation: 4,
  },

  avatarFallback: {
    justifyContent: "center",
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

  list: {
    gap: 12,
  },

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
    shadowOffset: {
      width: 0,
      height: 3,
    },
    elevation: 3,
  },

  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(195, 77, 156, 0.2)",
  },

  rowText: {
    flex: 1,
  },

  name: {
    fontSize: 15,
    fontWeight: "600",
    color: "#191922",
  },

  meta: {
    fontSize: 12,
    color: "#6b6b72",
    marginTop: 2,
  },

  rank: {
    fontSize: 13,
    fontWeight: "600",
    color: "#9C9CAA",
  },
});
