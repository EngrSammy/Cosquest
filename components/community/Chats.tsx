import {
  DIRECT_CONTACTS,
  GROUP_CHATS,
} from "@/constants/mockChats";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

export function Chats() {
  return (
    <View style={styles.wrap}>
      {/* Your Space — group chats */}
      <Text style={styles.section}>Your Space</Text>
      <View style={styles.groupCard}>
        {GROUP_CHATS.map((g, i) => (
          <Pressable
            key={g.id}
            style={[styles.groupRow, i > 0 && styles.groupDivider]}
            onPress={() => router.push({ pathname: "/chat/[id]", params: { id: g.id } })}
          >
            <View style={styles.groupIcon}>
              <Ionicons name={g.iconName} size={20} color="#FFFFFF" />
            </View>
            <View style={styles.groupText}>
              <Text style={styles.groupName}>{g.name}</Text>
              <Text style={styles.groupLast} numberOfLines={1}>
                {g.lastMessage}
              </Text>
            </View>
            <View style={styles.members}>
              <Ionicons name="people" size={12} color="#C5399A" />
              <Text style={styles.membersText}>{g.members} Members</Text>
            </View>
          </Pressable>
        ))}
      </View>

      {/* Direct Message — horizontal contacts */}
      <Text style={styles.section}>Direct Message</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.dmRow}
      >
        {DIRECT_CONTACTS.map((c) => (
          <Pressable
            key={c.id}
            style={styles.dm}
            onPress={() => router.push({ pathname: "/chat/[id]", params: { id: c.id } })}
          >
            <Image source={c.avatar} style={styles.dmAvatar} contentFit="cover" />
            <Text style={styles.dmName} numberOfLines={1}>
              {c.name}
            </Text>
          </Pressable>
        ))}
        <Pressable style={styles.dm} onPress={() => {}}>
          <View style={styles.dmAdd}>
            <Ionicons name="add" size={26} color="#9C9CAA" />
          </View>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 8 },
  section: {
    fontSize: 15,
    fontWeight: "800",
    color: "#37373a",
    marginTop: 14,
    marginBottom: 10,
  },

  groupCard: {
    backgroundColor: "rgba(255,255,255,0.5)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(150,150,160,0.18)",
    paddingHorizontal: 12,
  },
  groupRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
  },
  groupDivider: {
    borderTopWidth: 1,
    borderTopColor: "rgba(150,150,160,0.15)",
  },
  groupIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: "#191922",
    alignItems: "center",
    justifyContent: "center",
  },
  groupText: { flex: 1 },
  groupName: { fontSize: 14, fontWeight: "700", color: "#191922" },
  groupLast: { fontSize: 12, color: "#8a8a90", marginTop: 2 },
  members: { alignItems: "center", gap: 2 },
  membersText: { fontSize: 10, color: "#C5399A", fontWeight: "600" },

  dmRow: { gap: 16, paddingVertical: 4, paddingRight: 8 },
  dm: { alignItems: "center", width: 62 },
  dmAvatar: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "rgba(195,77,156,0.2)",
  },
  dmName: {
    fontSize: 12,
    color: "#37373a",
    marginTop: 6,
    textAlign: "center",
  },
  dmAdd: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "rgba(150,150,160,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
});
