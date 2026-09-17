import { AppBackground } from "@/components/AppBackground";
import { CATEGORIES } from "@/constants/categories";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function Category() {
  const insets = useSafeAreaInsets();

  const [selected, setSelected] = useState("Digital creator");
  const [displayOnProfile, setDisplayOnProfile] = useState(true);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return CATEGORIES;
    return CATEGORIES.filter((c) => c.toLowerCase().includes(q));
  }, [query]);

  function handleDone() {
    // TODO: save `selected` + `displayOnProfile` back to the profile / backend.
    router.back();
  }

  return (
    <AppBackground variant="blueGradient">
    <ScrollView
      contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 8 }]}
      keyboardShouldPersistTaps="handled"
    >
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color="#191922" />
        </Pressable>
        <Pressable onPress={handleDone} hitSlop={10}>
          <Text style={styles.done}>Done</Text>
        </Pressable>
      </View>

      <Text style={styles.title}>What best describes you?</Text>
      <Text style={styles.subtitle}>
        Categories help people find profiles like yours. You can change this at
        any time.
      </Text>

      {/* Display on profile toggle */}
      <View style={styles.toggleRow}>
        <Text style={styles.toggleLabel}>Display on profile</Text>
        <Switch
          value={displayOnProfile}
          onValueChange={setDisplayOnProfile}
          trackColor={{ true: "#C5399A", false: "#ffffff26" }}
          thumbColor="#fffff"
        />
      </View>

      {/* Search */}
      <View style={styles.searchRow}>
        <Ionicons name="search" size={18} color="#C5399A" />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Search categories"
          placeholderTextColor="#87878f"
          autoCapitalize="none"
        />
      </View>

      <Text style={styles.sectionLabel}>Suggested</Text>

      {filtered.map((c) => {
        const active = c === selected;
        return (
          <Pressable
            key={c}
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
            onPress={() => setSelected(c)}
          >
            <Text style={styles.rowLabel}>{c}</Text>
            <Ionicons
              name={active ? "radio-button-on" : "radio-button-off"}
              size={22}
              color={active ? "#C5399A" : "#89898f"}
            />
          </Pressable>
        );
      })}
    </ScrollView>
    </AppBackground>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 20, paddingBottom: 60 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  done: { fontSize: 16, fontWeight: "700", color: "#C5399A" },

  title: { fontSize: 26, fontWeight: "800", color: "#191922" },
  subtitle: {
    fontSize: 13.5,
    color: "#707074",
    marginTop: 8,
    lineHeight: 20,
  },

  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 18,
    marginBottom: 14,
  },
  toggleLabel: { fontSize: 15, fontWeight: "600", color: "#191922" },

  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderWidth: 0.2,
    borderColor: "rgba(255,255,255,0.6)",
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 18,
  },
  searchInput: { flex: 1, fontSize: 14, color: "#191922", padding: 0 },

  sectionLabel: {
    fontSize: 13,
    fontWeight: "800",
    color: "#191922",
    marginBottom: 10,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(255,255,255,0.15)",
    borderWidth: 0.2,
    borderColor: "rgba(255,255,255,0.6)",
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
    borderRadius: 15,
    paddingHorizontal: 16,
    paddingVertical: 15,
    marginBottom: 10,
  },
  rowLabel: { fontSize: 15, color: "#191922" },
});
