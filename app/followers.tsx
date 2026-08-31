import { type Follower, MOCK_FOLLOWERS } from "@/constants/mockFollowers";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useMemo, useRef, useState } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function FollowerRow({
  item,
  onToggle,
}: {
  item: Follower;
  onToggle: (id: string) => void;
}) {
  return (
    <View style={styles.row}>
      <Image source={item.avatar} style={styles.avatar} contentFit="cover" />
      <View style={styles.rowText}>
        <Text style={styles.name}>{item.name}</Text>
        <Text style={styles.handle}>@{item.handle}</Text>
      </View>
      <Pressable
        style={[
          styles.followBtn,
          item.following ? styles.followingBtn : styles.followBtnActive,
        ]}
        onPress={() => onToggle(item.id)}
      >
        <Text
          style={item.following ? styles.followingText : styles.followBackText}
        >
          {item.following ? "Following" : "Follow back"}
        </Text>
      </Pressable>
    </View>
  );
}

export default function Followers() {
  const insets = useSafeAreaInsets();

  // A local editable copy so the Follow/Following buttons can toggle.
  const [list, setList] = useState<Follower[]>(MOCK_FOLLOWERS);
  const [query, setQuery] = useState("");
  const searchRef = useRef<TextInput>(null); // handle to focus the field

  const toggle = (id: string) =>
    setList((prev) =>
      prev.map((f) => (f.id === id ? { ...f, following: !f.following } : f)),
    );

  // Recompute the filtered list only when the list or the query changes.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (f) =>
        f.name.toLowerCase().includes(q) || f.handle.toLowerCase().includes(q),
    );
  }, [list, query]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={24} color="#191922" />
        </Pressable>
        <Text style={styles.headerTitle}>Followers</Text>
        <Pressable onPress={() => searchRef.current?.focus()} hitSlop={10}>
          <Ionicons name="search" size={22} color="#191922" />
        </Pressable>
      </View>

      {/* Search */}
      <View style={styles.searchRow}>
        <Ionicons name="search" size={18} color="#9C9CAA" />
        <TextInput
          ref={searchRef}
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Search Followers..."
          placeholderTextColor="#9C9CAA"
          autoCapitalize="none"
        />
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <FollowerRow item={item} onToggle={toggle} />}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <Text style={styles.empty}>No followers match “{query}”.</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "transparent", paddingHorizontal: 20 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  headerTitle: { fontSize: 20, fontWeight: "700", color: "#191922" },

  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(195, 77, 156, 0.14)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
  },
  searchInput: { flex: 1, fontSize: 14, color: "#191922", padding: 0 },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderWidth: 1.5,
    borderRadius: 15,
    borderColor: "rgba(255,255,255,0.25)",
    marginBottom: 12,
  },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: "#EEE" },
  rowText: { flex: 1 },
  name: { fontSize: 15, fontWeight: "600", color: "#191922" },
  handle: { fontSize: 13, color: "#9C9CAA", marginTop: 1 },

  followBtn: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 10,
    minWidth: 96,
    alignItems: "center",
  },
  followBtnActive: { backgroundColor: "#C5399A" },
  followingBtn: { backgroundColor: "#191922" },
  followBackText: { fontSize: 13, fontWeight: "600", color: "#FFFFFF" },
  followingText: { fontSize: 13, fontWeight: "600", color: "#FFFFFF" },

  empty: { textAlign: "center", color: "#9C9CAA", marginTop: 40 },
});
