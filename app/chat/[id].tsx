import { type ChatMessage, MOCK_MESSAGES } from "@/constants/mockChats";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function Bubble({ msg }: { msg: ChatMessage }) {
  return (
    <View style={[styles.bubbleRow, msg.mine ? styles.rowMine : styles.rowTheirs]}>
      <View style={[styles.bubble, msg.mine ? styles.bubbleMine : styles.bubbleTheirs]}>
        <Text style={[styles.bubbleText, msg.mine && styles.bubbleTextMine]}>
          {msg.text}
        </Text>
        <Text style={[styles.bubbleTime, msg.mine && styles.bubbleTimeMine]}>
          {msg.time}
        </Text>
      </View>
    </View>
  );
}

export default function Chat() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [draft, setDraft] = useState("");

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 6 }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color="#191922" />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.headerName}>Mark.J</Text>
          <Text style={styles.headerStatus}>Active 7h ago</Text>
        </View>
        <Pressable hitSlop={10}>
          <Ionicons name="call" size={22} color="#C5399A" />
        </Pressable>
        <Pressable hitSlop={10} style={{ marginLeft: 16 }}>
          <Ionicons name="videocam" size={24} color="#C5399A" />
        </Pressable>
      </View>

      {/* Messages */}
      <FlatList
        data={MOCK_MESSAGES}
        keyExtractor={(m) => m.id}
        renderItem={({ item }) => <Bubble msg={item} />}
        contentContainerStyle={styles.list}
      />

      {/* Composer */}
      <View style={[styles.composer, { paddingBottom: insets.bottom + 8 }]}>
        <Pressable hitSlop={8}>
          <Ionicons name="attach" size={24} color="#C5399A" />
        </Pressable>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder="Message"
          placeholderTextColor="#9C9CAA"
        />
        <Pressable hitSlop={8}>
          <Ionicons
            name={draft.trim() ? "send" : "mic"}
            size={22}
            color="#C5399A"
          />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#EAF2FB" },

  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  headerText: { flex: 1 },
  headerName: { fontSize: 16, fontWeight: "800", color: "#191922" },
  headerStatus: { fontSize: 12, color: "#8a8a90", marginTop: 1 },

  list: { paddingHorizontal: 14, paddingVertical: 10, gap: 8 },
  bubbleRow: { flexDirection: "row" },
  rowMine: { justifyContent: "flex-end" },
  rowTheirs: { justifyContent: "flex-start" },
  bubble: { maxWidth: "78%", borderRadius: 18, paddingHorizontal: 14, paddingVertical: 9 },
  bubbleTheirs: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 4,
  },
  bubbleMine: {
    backgroundColor: "#C5399A",
    borderTopRightRadius: 4,
  },
  bubbleText: { fontSize: 14, color: "#191922", lineHeight: 19 },
  bubbleTextMine: { color: "#FFFFFF" },
  bubbleTime: { fontSize: 10, color: "#9C9CAA", marginTop: 4, alignSelf: "flex-end" },
  bubbleTimeMine: { color: "rgba(255,255,255,0.8)" },

  composer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 8,
    backgroundColor: "rgba(255,255,255,0.6)",
    borderTopWidth: 1,
    borderTopColor: "rgba(150,150,160,0.18)",
  },
  input: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    color: "#191922",
  },
});
