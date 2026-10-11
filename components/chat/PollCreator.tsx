// ==========================================
// CREATE A POLL (from the 📎 attach menu)
// ==========================================
// A question, 2-12 options, and settings: several answers, anonymous, and
// an end time. Sent as a poll message in the chat.
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PinkSwitch } from "@/components/ui/PinkSwitch";
import { FONTS } from "@/constants/fonts";
import { createPoll, type PollClosesIn } from "@/services/polls";

const PINK = "#C34D9C";
const INK = "#191922";
const MUTED = "#7A7A84";
const MAX_OPTIONS = 12;

const END_CHOICES: { value: PollClosesIn; label: string }[] = [
  { value: null, label: "No end" },
  { value: "1h", label: "1 hour" },
  { value: "1d", label: "1 day" },
  { value: "1w", label: "1 week" },
];

export default function PollCreator({
  visible,
  conversationId,
  token,
  onClose,
  onCreated,
}: {
  visible: boolean;
  conversationId: string;
  token: string;
  onClose: () => void;
  // The new poll message (to show it straight away).
  onCreated: (message: any) => void;
}) {
  const insets = useSafeAreaInsets();

  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [multiple, setMultiple] = useState(false);
  const [anonymous, setAnonymous] = useState(false);
  const [closesIn, setClosesIn] = useState<PollClosesIn>(null);
  const [sending, setSending] = useState(false);

  // Fresh form every time it opens.
  useEffect(() => {
    if (visible) {
      setQuestion("");
      setOptions(["", ""]);
      setMultiple(false);
      setAnonymous(false);
      setClosesIn(null);
    }
  }, [visible]);

  const filled = options.map((option) => option.trim()).filter(Boolean);
  const duplicates = new Set(filled.map((text) => text.toLowerCase())).size !== filled.length;
  const ready = question.trim().length > 0 && filled.length >= 2 && !duplicates;

  const setOption = (index: number, text: string) => {
    setOptions((current) => {
      const next = [...current];
      next[index] = text;
      // Typing in the last box adds a new empty one (like WhatsApp).
      if (index === next.length - 1 && text.trim() && next.length < MAX_OPTIONS) {
        next.push("");
      }
      return next;
    });
  };

  const removeOption = (index: number) => {
    setOptions((current) => {
      const next = current.filter((_, i) => i !== index);
      while (next.length < 2) next.push("");
      return next;
    });
  };

  const send = async () => {
    if (!ready || sending) return;
    try {
      setSending(true);
      const message = await createPoll(
        conversationId,
        { question: question.trim(), options: filled, multiple, anonymous, closesIn },
        token,
      );
      onCreated(message);
      onClose();
    } catch (error) {
      Alert.alert("Poll", error instanceof Error ? error.message : "Couldn't create the poll.");
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 14 }]}>
          <View style={styles.handle} />

          <View style={styles.header}>
            <Text style={styles.title}>New poll</Text>
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close">
              <Ionicons name="close" size={24} color={INK} />
            </Pressable>
          </View>

          <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text style={styles.label}>QUESTION</Text>
            <TextInput
              value={question}
              onChangeText={setQuestion}
              placeholder="Ask something…"
              placeholderTextColor="#9C9CAA"
              maxLength={300}
              multiline
              style={[styles.input, styles.question]}
            />

            <Text style={styles.label}>OPTIONS</Text>
            <View style={styles.options}>
              {options.map((option, index) => (
                <View key={index} style={styles.optionRow}>
                  <TextInput
                    value={option}
                    onChangeText={(text) => setOption(index, text)}
                    placeholder={`Option ${index + 1}`}
                    placeholderTextColor="#9C9CAA"
                    maxLength={100}
                    style={[styles.input, styles.optionInput]}
                  />
                  {options.length > 2 && (option.trim() || index < options.length - 1) ? (
                    <Pressable onPress={() => removeOption(index)} hitSlop={8} accessibilityLabel="Remove option">
                      <Ionicons name="close-circle" size={20} color="#B5B5BE" />
                    </Pressable>
                  ) : null}
                </View>
              ))}
            </View>
            {duplicates ? <Text style={styles.warning}>Each option must be different.</Text> : null}
            <Text style={styles.hint}>Up to {MAX_OPTIONS} options.</Text>

            <Text style={styles.label}>SETTINGS</Text>
            <View style={styles.settingRow}>
              <View style={styles.settingText}>
                <Text style={styles.settingLabel}>Allow multiple answers</Text>
                <Text style={styles.settingHint}>People can pick more than one option</Text>
              </View>
              <PinkSwitch value={multiple} onChange={setMultiple} />
            </View>
            <View style={styles.settingRow}>
              <View style={styles.settingText}>
                <Text style={styles.settingLabel}>Anonymous</Text>
                <Text style={styles.settingHint}>Only counts are shown, not who voted</Text>
              </View>
              <PinkSwitch value={anonymous} onChange={setAnonymous} />
            </View>

            <Text style={styles.label}>ENDS</Text>
            <View style={styles.selector}>
              {END_CHOICES.map((choice) => {
                const selected = choice.value === closesIn;
                return (
                  <Pressable
                    key={choice.label}
                    onPress={() => setClosesIn(choice.value)}
                    style={[styles.choice, selected && styles.choiceSelected]}>
                    <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{choice.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>

          <Pressable style={[styles.sendButton, (!ready || sending) && styles.sendOff]} disabled={!ready || sending} onPress={send}>
            {sending ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="stats-chart" size={17} color="#FFFFFF" />
                <Text style={styles.sendText}>Send poll</Text>
              </>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const MILKY = {
  borderRadius: 14,
  backgroundColor: "#0000000D",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.75)",
} as const;

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)" },

  sheet: {
    maxHeight: "88%",
    width: "100%",
    maxWidth: 640,
    alignSelf: "center",
    paddingHorizontal: 18,
    paddingTop: 10,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: "#FFFFFF",
  },

  handle: { alignSelf: "center", width: 42, height: 5, borderRadius: 3, backgroundColor: "#D5D5DA", marginBottom: 10 },

  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },

  title: { fontFamily: FONTS.semibold, fontSize: 18, color: INK },

  scroll: { marginTop: 4, marginBottom: 12 },

  label: { marginTop: 16, marginBottom: 8, fontFamily: FONTS.medium, fontSize: 11, letterSpacing: 0.4, color: MUTED },

  input: {
    ...MILKY,
    minHeight: 46,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontFamily: FONTS.regular,
    fontSize: 14.5,
    color: INK,
    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null),
  },

  question: { minHeight: 60, textAlignVertical: "top" },

  options: { gap: 8 },

  optionRow: { flexDirection: "row", alignItems: "center", gap: 8 },

  optionInput: { flex: 1, minWidth: 0 },

  warning: { marginTop: 6, fontFamily: FONTS.regular, fontSize: 12, color: "#D64545" },

  hint: { marginTop: 6, fontFamily: FONTS.regular, fontSize: 11.5, color: MUTED },

  settingRow: {
    ...MILKY,
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginBottom: 8,
  },

  settingText: { flex: 1, minWidth: 0 },

  settingLabel: { fontFamily: FONTS.medium, fontSize: 14, color: INK },

  settingHint: { marginTop: 1, fontFamily: FONTS.regular, fontSize: 11.5, color: MUTED },

  selector: { ...MILKY, minHeight: 44, flexDirection: "row", alignItems: "center", padding: 4 },

  choice: { flex: 1, minHeight: 34, alignItems: "center", justifyContent: "center", borderRadius: 10 },

  choiceSelected: { backgroundColor: PINK },

  choiceText: { fontFamily: FONTS.medium, fontSize: 12.5, color: "#55555E" },

  choiceTextSelected: { color: "#FFFFFF" },

  sendButton: {
    height: 52,
    borderRadius: 26,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: PINK,
  },

  sendOff: { opacity: 0.5 },

  sendText: { fontFamily: FONTS.semibold, fontSize: 15.5, color: "#FFFFFF" },
});
