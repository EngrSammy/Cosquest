// ==========================================
// WAITING ROOM (host) - on the scheduled call screen
// ==========================================
// A pill ("2 waiting · Review") when someone is waiting, and a sheet with
// Admit / Deny for each person and Admit all.
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { themedStyles, useInk, useThemedStyles } from "@/constants/chatTheme";
import { FONTS } from "@/constants/fonts";
import type { ScheduledCall } from "@/services/scheduledCalls";
import { getAvatarSource } from "@/utils/callHelpers";

import { admitEveryone, admitPerson, useWaitingFor } from "./scheduledCallJoin";

const PINK = "#C34D9C";

export function useWaitingRoom(call: ScheduledCall) {
  const ids = useWaitingFor(call.id);
  const [open, setOpen] = useState(false);
  return { count: ids.length, ids, open, setOpen };
}

export function WaitingPill({ count, onPress }: { count: number; onPress: () => void }) {
  const styles = useThemedStyles(STYLE_PAIR);
  if (!count) return null;
  return (
    <View style={styles.pillRow}>
      <Pressable style={styles.pill} onPress={onPress} accessibilityRole="button">
        <Ionicons name="people-outline" size={15} color="#FFFFFF" />
        <Text style={styles.pillText}>{count} waiting · Review</Text>
      </Pressable>
    </View>
  );
}

export function WaitingRoomSheet({
  call,
  ids,
  visible,
  onClose,
}: {
  call: ScheduledCall;
  ids: string[];
  visible: boolean;
  onClose: () => void;
}) {
  const styles = useThemedStyles(STYLE_PAIR);
  const ink = useInk();
  const insets = useSafeAreaInsets();
  const people = new Map([call.host, ...call.participants].map((person) => [person.id, person]));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + 18 }]} onPress={() => {}}>
          <View style={styles.head}>
            <Text style={styles.title}>Waiting room · {ids.length}</Text>
            {ids.length > 1 ? (
              <Pressable onPress={() => admitEveryone(call.id)} hitSlop={8}>
                <Text style={styles.all}>Admit all</Text>
              </Pressable>
            ) : null}
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close">
              <Ionicons name="close" size={22} color={ink.text("#191922")} />
            </Pressable>
          </View>
          <ScrollView style={styles.list}>
            {ids.length ? (
              ids.map((id) => {
                const person = people.get(id);
                const name = person?.name || person?.username || "Someone from the group";
                return (
                  <View key={id} style={styles.row}>
                    <Image source={getAvatarSource(person || null) as any} style={styles.avatar} contentFit="cover" />
                    <Text style={styles.name} numberOfLines={1}>
                      {name}
                    </Text>
                    <Pressable style={styles.deny} onPress={() => admitPerson(call.id, id, "denied")}>
                      <Text style={styles.denyText}>Deny</Text>
                    </Pressable>
                    <Pressable style={styles.admit} onPress={() => admitPerson(call.id, id, "admitted")}>
                      <Text style={styles.admitText}>Admit</Text>
                    </Pressable>
                  </View>
                );
              })
            ) : (
              <Text style={styles.empty}>Nobody is waiting right now.</Text>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const STYLE_PAIR = themedStyles(
  {
    pillRow: { alignItems: "center", marginTop: 6 },
    pill: { flexDirection: "row", alignItems: "center", gap: 6, height: 34, paddingHorizontal: 14, borderRadius: 17, backgroundColor: PINK },
    pillText: { fontFamily: FONTS.semibold, fontSize: 13, color: "#FFFFFF" },
    backdrop: { flex: 1, justifyContent: "flex-end", alignItems: "center", backgroundColor: "rgba(0,0,0,0.4)" },
    sheet: { width: "100%", maxWidth: 560, maxHeight: "70%", paddingHorizontal: 20, paddingTop: 18, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: "#FFFFFF" },
    head: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 8 },
    title: { flex: 1, fontFamily: FONTS.bold, fontSize: 18, color: "#191922" },
    all: { fontFamily: FONTS.semibold, fontSize: 14, color: PINK },
    list: { flexGrow: 0 },
    row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10 },
    avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#EEE" },
    name: { flex: 1, fontFamily: FONTS.medium, fontSize: 15, color: "#191922" },
    deny: { height: 34, paddingHorizontal: 14, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: "#F1EFF4" },
    denyText: { fontFamily: FONTS.semibold, fontSize: 13, color: "#3A3A44" },
    admit: { height: 34, paddingHorizontal: 16, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: PINK },
    admitText: { fontFamily: FONTS.semibold, fontSize: 13, color: "#FFFFFF" },
    empty: { paddingVertical: 24, textAlign: "center", fontFamily: FONTS.regular, fontSize: 14, color: "#6B6F80" },
  },
  {
    sheet: { backgroundColor: "#1F2130" },
    title: { color: "#F4F5FA" },
    name: { color: "#F4F5FA" },
    avatar: { backgroundColor: "#343746" },
    deny: { backgroundColor: "#2E3043" },
    denyText: { color: "#E3E6EE" },
    empty: { color: "#9AA1B4" },
  },
);
