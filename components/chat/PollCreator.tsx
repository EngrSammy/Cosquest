// ==========================================
// CREATE POLL (Figma M18)
// ==========================================
// "Let's decide together." Question, answer options (+ Add another option),
// "Allow multiple answers", then "Send poll to group". Exactly as designed
// (the CEO's doc + Figma): no anonymous or end-time options.
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PinkSwitch } from "@/components/ui/PinkSwitch";
import { FONTS } from "@/constants/fonts";
import { createPoll } from "@/services/polls";
import { themedStyles, useThemedStyles } from "@/constants/chatTheme";

const PINK = "#B63D91";
const INK = "#24283C";
const MUTED = "#66738A";
const LILAC = "#F0EDF9";
const LINE = "rgba(36,40,60,0.08)";
const MAX_OPTIONS = 12;

export default function PollCreator({
  visible,
  conversationId,
  conversationTitle,
  token,
  onClose,
  onCreated,
}: {
  visible: boolean;
  conversationId: string;
  conversationTitle?: string;
  token: string;
  onClose: () => void;
  // The new poll message (to show it straight away).
  onCreated: (message: any) => void;
}) {
  const styles = useThemedStyles(STYLE_PAIR);
  const insets = useSafeAreaInsets();

  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [multiple, setMultiple] = useState(false);
  const [sending, setSending] = useState(false);

  // Fresh form every time it opens.
  useEffect(() => {
    if (visible) {
      setQuestion("");
      setOptions(["", ""]);
      setMultiple(false);
    }
  }, [visible]);

  const filled = options.map((option) => option.trim()).filter(Boolean);
  const duplicates = new Set(filled.map((text) => text.toLowerCase())).size !== filled.length;
  const ready = question.trim().length > 0 && filled.length >= 2 && !duplicates;

  const setOption = (index: number, text: string) => {
    setOptions((current) => current.map((value, i) => (i === index ? text : value)));
  };

  const addOption = () => {
    setOptions((current) => (current.length >= MAX_OPTIONS ? current : [...current, ""]));
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
        { question: question.trim(), options: filled, multiple, anonymous: false, closesIn: null },
        token,
      );
      onCreated(message);
      onClose();
    } catch (error) {
      Alert.alert("Create poll", error instanceof Error ? error.message : "Couldn't send the poll.");
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <LinearGradient colors={["#F6F9FE", "#E3F0FC"]} style={styles.screen}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          {/* HEADER */}
          <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Back">
              <Ionicons name="chevron-back" size={26} color={INK} />
            </Pressable>
            <View style={styles.flex}>
              <Text style={styles.title}>Create poll</Text>
              {conversationTitle ? (
                <Text style={styles.subtitle} numberOfLines={1}>
                  {conversationTitle}
                </Text>
              ) : null}
            </View>
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close">
              <Ionicons name="close" size={26} color={MUTED} />
            </Pressable>
          </View>

          <ScrollView
            style={styles.flex}
            contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 30 }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            <Text style={styles.bigTitle}>Let's decide together.</Text>
            <Text style={styles.lead}>Ask the group and keep the results in your conversation.</Text>

            <Text style={styles.label}>Question</Text>
            <TextInput
              value={question}
              onChangeText={setQuestion}
              placeholder="e.g. Where should we meet for the next CosQuest?"
              placeholderTextColor="#9AA3B5"
              maxLength={300}
              multiline
              style={styles.input}
            />

            <Text style={styles.section}>ANSWER OPTIONS</Text>
            <View style={styles.card}>
              {options.map((option, index) => (
                <View key={index} style={styles.optionBlock}>
                  <View style={styles.optionHead}>
                    <Text style={styles.optionLabel}>Option</Text>
                    {options.length > 2 ? (
                      <Pressable onPress={() => removeOption(index)} hitSlop={8} accessibilityLabel="Remove option">
                        <Ionicons name="close" size={16} color={MUTED} />
                      </Pressable>
                    ) : null}
                  </View>
                  <TextInput
                    value={option}
                    onChangeText={(text) => setOption(index, text)}
                    placeholder={`Option ${index + 1}`}
                    placeholderTextColor="#9AA3B5"
                    maxLength={100}
                    style={styles.input}
                  />
                </View>
              ))}

              {options.length < MAX_OPTIONS ? (
                <Pressable style={styles.addRow} onPress={addOption}>
                  <Text style={styles.addText}>Add another option</Text>
                  <Ionicons name="add" size={22} color={MUTED} />
                </Pressable>
              ) : null}
            </View>
            {duplicates ? <Text style={styles.warning}>Each option must be different.</Text> : null}

            <View style={styles.switchRow}>
              <View style={styles.flex}>
                <Text style={styles.switchTitle}>Allow multiple answers</Text>
                <Text style={styles.switchHint}>{multiple ? "On · people can pick more than one" : "Off · people pick one"}</Text>
              </View>
              <PinkSwitch value={multiple} onChange={setMultiple} />
            </View>

            <Pressable style={[styles.primary, (!ready || sending) && styles.off]} disabled={!ready || sending} onPress={send}>
              {sending ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>Send poll to group</Text>}
            </Pressable>
            <Pressable style={styles.secondary} onPress={onClose}>
              <Text style={styles.secondaryText}>Cancel</Text>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </LinearGradient>
    </Modal>
  );
}

const STYLE_PAIR = themedStyles({
  screen: { flex: 1 },

  flex: { flex: 1, minWidth: 0 },

  off: { opacity: 0.5 },

  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingBottom: 8 },

  title: { fontFamily: FONTS.semibold, fontSize: 22, lineHeight: 28, color: INK },

  subtitle: { marginTop: 2, fontFamily: FONTS.regular, fontSize: 12, color: MUTED },

  content: { paddingHorizontal: 18, paddingTop: 12 },

  bigTitle: { fontFamily: FONTS.semibold, fontSize: 21, lineHeight: 28, color: INK },

  lead: { marginTop: 8, fontFamily: FONTS.regular, fontSize: 14, lineHeight: 21, color: MUTED },

  label: { marginTop: 16, marginBottom: 8, fontFamily: FONTS.semibold, fontSize: 13, color: INK },

  section: { marginTop: 18, marginBottom: 8, fontFamily: FONTS.semibold, fontSize: 12, letterSpacing: 0.4, color: MUTED },

  input: {
    minHeight: 50,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "rgba(102,115,138,0.25)",
    fontFamily: FONTS.regular,
    fontSize: 15,
    color: INK,
    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null),
  },

  card: { padding: 14, borderRadius: 18, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: LINE },

  optionBlock: { marginBottom: 12 },

  optionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },

  optionLabel: { fontFamily: FONTS.semibold, fontSize: 13, color: INK },

  addRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: LINE,
  },

  addText: { fontFamily: FONTS.semibold, fontSize: 15, color: INK },

  warning: { marginTop: 8, fontFamily: FONTS.regular, fontSize: 12, color: "#C0394B" },

  switchRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 18 },

  switchTitle: { fontFamily: FONTS.semibold, fontSize: 15, color: INK },

  switchHint: { marginTop: 2, fontFamily: FONTS.regular, fontSize: 12, color: MUTED },

  primary: {
    marginTop: 22,
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: PINK,
  },

  primaryText: { fontFamily: FONTS.semibold, fontSize: 16, color: "#FFFFFF" },

  secondary: {
    marginTop: 10,
    height: 50,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: LILAC,
  },

  secondaryText: { fontFamily: FONTS.semibold, fontSize: 15, color: PINK },
});
