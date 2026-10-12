// ==========================================
// YOUR EXPERTISE ROLE (shown under your name: "Front-end", "Design"...)
// ==========================================
// Not rank and no chat powers - it helps people know who to ask, and role
// pings will use it later. The list comes from the backend.
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FONTS } from "@/constants/fonts";
import { getExpertiseRoles, setMyExpertise, type ExpertiseRole } from "@/services/chatPrefs";

const PINK = "#B63D91";
const INK = "#24283C";
const MUTED = "#66738A";

export default function ExpertisePicker({
  visible,
  token,
  current,
  onClose,
  onSaved,
}: {
  visible: boolean;
  token: string;
  // The label currently shown ("Front-end"), or null.
  current: string | null;
  onClose: () => void;
  onSaved: (label: string | null) => void;
}) {
  const insets = useSafeAreaInsets();
  const [roles, setRoles] = useState<ExpertiseRole[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    getExpertiseRoles()
      .then(setRoles)
      .catch(() => setRoles([]))
      .finally(() => setLoading(false));
  }, [visible]);

  const choose = async (role: ExpertiseRole | null) => {
    try {
      setSaving(role?.key || "none");
      await setMyExpertise(role?.key || null, token);
      onSaved(role?.label || null);
      onClose();
    } catch (error) {
      Alert.alert("Expertise role", error instanceof Error ? error.message : "Couldn't save it.");
    } finally {
      setSaving(null);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.header}>
          <Text style={styles.title}>Your expertise role</Text>
          <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close">
            <Ionicons name="close" size={24} color={MUTED} />
          </Pressable>
        </View>
        <Text style={styles.hint}>Shown under your name. It isn't a rank and gives no chat powers.</Text>

        {loading ? (
          <ActivityIndicator color={PINK} style={styles.loading} />
        ) : (
          <ScrollView style={styles.list}>
            {roles.map((role) => {
              const on = role.label === current;
              return (
                <Pressable key={role.key} style={styles.row} onPress={() => choose(role)} disabled={!!saving}>
                  <Text style={styles.rowText}>{role.label}</Text>
                  {saving === role.key ? (
                    <ActivityIndicator size="small" color={PINK} />
                  ) : (
                    <Ionicons name={on ? "checkmark-circle" : "ellipse-outline"} size={22} color={on ? PINK : MUTED} />
                  )}
                </Pressable>
              );
            })}
            {current ? (
              <Pressable style={styles.row} onPress={() => choose(null)} disabled={!!saving}>
                <Text style={[styles.rowText, styles.clear]}>Remove my expertise role</Text>
              </Pressable>
            ) : null}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(36,40,60,0.35)" },
  sheet: {
    maxHeight: "80%",
    width: "100%",
    maxWidth: 640,
    alignSelf: "center",
    paddingHorizontal: 20,
    paddingTop: 22,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: "#FFFFFF",
  },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontFamily: FONTS.semibold, fontSize: 20, color: INK },
  hint: { marginTop: 6, marginBottom: 10, fontFamily: FONTS.regular, fontSize: 12.5, color: MUTED },
  loading: { paddingVertical: 30 },
  list: { maxHeight: 460 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(36,40,60,0.08)",
  },
  rowText: { fontFamily: FONTS.semibold, fontSize: 15, color: INK },
  clear: { color: "#C0394B" },
});
