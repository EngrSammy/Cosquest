// ==========================================
// SEND A DANGER ALERT (from a call or voice chat)
// ==========================================
// An optional message (up to 200 characters), then the whole faction gets
// an urgent alert and can join this call for 30 minutes.
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { themedStyles, useInk, useThemedStyles } from "@/constants/chatTheme";
import { FONTS } from "@/constants/fonts";
import { sendFactionAlert } from "@/services/alerts";
import { useAppSelector } from "@/store/hooks";

const RED = "#E5484D";

export default function SendAlertSheet({
  target,
  visible,
  onClose,
}: {
  target: { kind: "call" | "voice"; id: string } | null;
  visible: boolean;
  onClose: () => void;
}) {
  const styles = useThemedStyles(STYLE_PAIR);
  const ink = useInk();
  const insets = useSafeAreaInsets();
  const token = useAppSelector((state) => state.auth.token);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (visible) setMessage("");
  }, [visible]);

  const send = async () => {
    if (!token || !target || sending) return;
    setSending(true);
    try {
      await sendFactionAlert(target.kind, target.id, message, token);
      onClose();
      Alert.alert("Alert sent", "Your faction has been alerted. People who respond join this call.");
    } catch (error) {
      Alert.alert("Danger alert", (error as any)?.message || "Couldn't send the alert.");
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Pressable style={styles.backdrop} onPress={onClose}>
          <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + 18 }]} onPress={() => {}}>
            <View style={styles.head}>
              <View style={styles.icon}>
                <Ionicons name="warning" size={20} color="#FFFFFF" />
              </View>
              <Text style={styles.title}>Faction in danger</Text>
              <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close">
                <Ionicons name="close" size={22} color={ink.text("#24283C")} />
              </Pressable>
            </View>
            <Text style={styles.hint}>
              Everyone in your faction gets an urgent alert with its own sound, and can join this call for 30 minutes. Use it only when
              you need backup.
            </Text>
            <TextInput
              value={message}
              onChangeText={setMessage}
              placeholder="What's happening? (optional)"
              placeholderTextColor={ink.text("#9AA1B4")}
              style={styles.input}
              maxLength={200}
              multiline
            />
            <Pressable style={[styles.send, sending && { opacity: 0.6 }]} onPress={send} disabled={sending} accessibilityRole="button">
              {sending ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.sendText}>Send alert to my faction</Text>}
            </Pressable>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const STYLE_PAIR = themedStyles(
  {
    backdrop: { flex: 1, justifyContent: "flex-end", alignItems: "center", backgroundColor: "rgba(0,0,0,0.45)" },
    sheet: { width: "100%", maxWidth: 560, paddingHorizontal: 20, paddingTop: 18, borderTopLeftRadius: 26, borderTopRightRadius: 26, backgroundColor: "#FFFFFF" },
    head: { flexDirection: "row", alignItems: "center", gap: 12 },
    icon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: RED },
    title: { flex: 1, fontFamily: FONTS.bold, fontSize: 19, color: "#24283C" },
    hint: { marginTop: 10, fontFamily: FONTS.regular, fontSize: 13.5, lineHeight: 19, color: "#66738A" },
    input: {
      marginTop: 14,
      minHeight: 80,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: 14,
      textAlignVertical: "top",
      fontFamily: FONTS.regular,
      fontSize: 15,
      color: "#24283C",
      backgroundColor: "#F3F5F9",
      ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null),
    },
    send: { marginTop: 16, height: 54, borderRadius: 27, alignItems: "center", justifyContent: "center", backgroundColor: RED },
    sendText: { fontFamily: FONTS.bold, fontSize: 16, color: "#FFFFFF" },
  },
  {
    sheet: { backgroundColor: "#1F2130" },
    title: { color: "#F4F5FA" },
    hint: { color: "#B5BBCB" },
    input: { backgroundColor: "#2A2C3B", color: "#F4F5FA" },
  },
);
