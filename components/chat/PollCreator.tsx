// ==========================================
// CREATE POLL (Figma M18)
// ==========================================
// "Let's decide together." Question, answer options (+ Add another option),
// "Allow multiple answers", then "Send poll to group". Exactly as designed
// (the CEO's doc + Figma): no anonymous or end-time options.
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  BigTitle,
  Card,
  Description,
  FieldLabel,
  PrimaryButton,
  ScreenGradient,
  SecondaryButton,
  SheetHeader,
  TextField,
  UI,
} from "@/components/chat/ui";
import { PinkSwitch } from "@/components/ui/PinkSwitch";
import { themedStyles, useInk, useThemedStyles } from "@/constants/chatTheme";
import { FONTS } from "@/constants/fonts";
import { createPoll } from "@/services/polls";

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
  const ink = useInk();
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
  const duplicates =
    new Set(filled.map((text) => text.toLowerCase())).size !== filled.length;
  const ready = question.trim().length > 0 && filled.length >= 2 && !duplicates;

  const setOption = (index: number, text: string) => {
    setOptions((current) =>
      current.map((value, i) => (i === index ? text : value)),
    );
  };

  const addOption = () => {
    setOptions((current) =>
      current.length >= MAX_OPTIONS ? current : [...current, ""],
    );
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
        {
          question: question.trim(),
          options: filled,
          multiple,
          anonymous: false,
          closesIn: null,
        },
        token,
      );
      onCreated(message);
      onClose();
    } catch (error) {
      Alert.alert(
        "Create poll",
        error instanceof Error ? error.message : "Couldn't send the poll.",
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.screen}>
        <ScreenGradient />
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={[styles.headerWrap, { paddingTop: insets.top + 12 }]}>
            <SheetHeader
              title="Create poll"
              subtitle={conversationTitle}
              onBack={onClose}
              onClose={onClose}
            />
          </View>

          <ScrollView
            style={styles.flex}
            contentContainerStyle={[
              styles.content,
              { paddingBottom: insets.bottom + 30 },
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            <BigTitle>Let&apos;s decide together.</BigTitle>
            <Description>
              Ask the group and keep the results in your conversation.
            </Description>

            <FieldLabel>Question</FieldLabel>
            <TextField
              value={question}
              onChangeText={setQuestion}
              placeholder="e.g. Where should we meet for the next CosQuest?"
              maxLength={300}
              multiline
            />

            <Text style={styles.section}>ANSWER OPTIONS</Text>
            <Card>
              {options.map((option, index) => (
                <View key={index} style={styles.optionBlock}>
                  <View style={styles.optionHead}>
                    <Text style={styles.optionLabel}>Option</Text>
                    {options.length > 2 ? (
                      <Pressable
                        onPress={() => removeOption(index)}
                        hitSlop={8}
                        accessibilityLabel="Remove option">
                        <Ionicons
                          name="close"
                          size={16}
                          color={ink.text(UI.MUTED)}
                        />
                      </Pressable>
                    ) : null}
                  </View>
                  <TextField
                    value={option}
                    onChangeText={(text) => setOption(index, text)}
                    placeholder={`Option ${index + 1}`}
                    maxLength={100}
                  />
                </View>
              ))}

              {options.length < MAX_OPTIONS ? (
                <Pressable style={styles.addRow} onPress={addOption}>
                  <Text style={styles.addText}>Add another option</Text>
                  <Ionicons name="add" size={22} color={ink.text(UI.MUTED)} />
                </Pressable>
              ) : null}
            </Card>
            {duplicates ? (
              <Text style={styles.warning}>Each option must be different.</Text>
            ) : null}

            <View style={styles.switchRow}>
              <View style={styles.flex}>
                <Text style={styles.switchTitle}>Allow multiple answers</Text>
                <Text style={styles.switchHint}>
                  {multiple
                    ? "On · people can pick more than one"
                    : "Off · people pick one"}
                </Text>
              </View>
              <PinkSwitch value={multiple} onChange={setMultiple} />
            </View>

            <PrimaryButton
              label="Send poll to group"
              onPress={send}
              disabled={!ready}
              loading={sending}
            />
            <SecondaryButton label="Cancel" onPress={onClose} />
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const STYLE_PAIR = themedStyles(
  {
    screen: { flex: 1, backgroundColor: "#FFFFFF" },
    flex: { flex: 1, minWidth: 0 },

    headerWrap: { paddingHorizontal: 18, paddingBottom: 8 },
    content: { paddingHorizontal: 18, paddingTop: 4 },

    section: {
      marginTop: UI.GAP,
      marginBottom: 8,
      fontFamily: FONTS.semibold,
      fontSize: 12,
      letterSpacing: 0.4,
      color: UI.MUTED,
    },

    optionBlock: { marginBottom: 12 },
    optionHead: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 6,
    },
    optionLabel: { fontFamily: FONTS.semibold, fontSize: 13, color: UI.INK },

    addRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: "rgba(36,40,60,0.08)",
    },
    addText: { fontFamily: FONTS.semibold, fontSize: 15, color: UI.INK },

    warning: {
      marginTop: 8,
      fontFamily: FONTS.regular,
      fontSize: 12,
      color: "#C0394B",
    },

    switchRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      marginTop: UI.GAP,
    },
    switchTitle: { fontFamily: FONTS.semibold, fontSize: 15, color: UI.INK },
    switchHint: {
      marginTop: 2,
      fontFamily: FONTS.regular,
      fontSize: 12,
      color: UI.MUTED,
    },
  },
  {
    screen: { backgroundColor: "#171823" },
    section: { color: "#B5BBCB" },
    optionLabel: { color: "#F0F1F7" },
    addText: { color: "#F4F5FA" },
    switchTitle: { color: "#F4F5FA" },
    switchHint: { color: "#B5BBCB" },
  },
);
