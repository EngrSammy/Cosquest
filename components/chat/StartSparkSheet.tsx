// ==========================================
// START A SPARK (long-press a message -> "Start a Spark")
// ==========================================
// The pressed message becomes the seed. If a similar Spark already exists,
// the member chooses: add their message to it, or start a new one anyway
// (spec: "A person makes the final call; the bot does not merge").
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FONTS } from "@/constants/fonts";
import { addToSpark, sparkColor, startSpark, type Spark } from "@/services/sparks";

const PINK = "#C34D9C";
const INK = "#191922";
const MUTED = "#7A7A84";

export default function StartSparkSheet({
  visible,
  conversationId,
  token,
  message,
  onClose,
  onDone,
}: {
  visible: boolean;
  conversationId: string;
  token: string;
  message: { id: string; content?: string } | null;
  onClose: () => void;
  // The Spark the message ended up in (new or existing).
  onDone: (spark: Spark) => void;
}) {
  const insets = useSafeAreaInsets();

  const [subject, setSubject] = useState("");
  const [matches, setMatches] = useState<Spark[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) {
      setSubject("");
      setMatches([]);
    }
  }, [visible]);

  const start = async (force = false) => {
    const text = subject.trim();
    if (!message || text.length < 2 || busy) return;
    try {
      setBusy(true);
      const result = await startSpark(conversationId, { messageId: message.id, subject: text, force }, token);
      if (result.ok) {
        onDone(result.spark);
        onClose();
      } else if (result.code === "similar_sparks") {
        setMatches(result.matches);
      } else {
        Alert.alert("Start a Spark", result.error);
        if (result.spark) onDone(result.spark);
        onClose();
      }
    } catch (error) {
      Alert.alert("Start a Spark", error instanceof Error ? error.message : "Couldn't start the Spark.");
    } finally {
      setBusy(false);
    }
  };

  const addTo = async (spark: Spark) => {
    if (!message || busy) return;
    try {
      setBusy(true);
      onDone(await addToSpark(conversationId, spark.id, message.id, token));
      onClose();
    } catch (error) {
      Alert.alert("Spark", error instanceof Error ? error.message : "Couldn't add it.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 14 }]}>
          <View style={styles.handle} />

          <View style={styles.header}>
            <Ionicons name="flash" size={18} color={PINK} />
            <Text style={styles.title}>Start a Spark</Text>
          </View>

          {message?.content ? (
            <Text style={styles.seed} numberOfLines={2}>
              “{message.content}”
            </Text>
          ) : null}

          {matches.length === 0 ? (
            <>
              <Text style={styles.label}>SUBJECT</Text>
              <TextInput
                value={subject}
                onChangeText={setSubject}
                placeholder="e.g. Next CosQuest, Spider-Man uniform"
                placeholderTextColor="#9C9CAA"
                maxLength={60}
                autoFocus
                style={styles.input}
                onSubmitEditing={() => start(false)}
              />
              <Pressable
                style={[styles.button, (subject.trim().length < 2 || busy) && styles.off]}
                disabled={subject.trim().length < 2 || busy}
                onPress={() => start(false)}>
                {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>Start Spark</Text>}
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.similar}>There's already a Spark about this. Add your message to it?</Text>
              {matches.map((spark) => (
                <Pressable key={spark.id} style={styles.match} onPress={() => addTo(spark)} disabled={busy}>
                  <View style={[styles.dot, { backgroundColor: sparkColor(spark) }]} />
                  <View style={styles.matchText}>
                    <Text style={styles.matchTitle} numberOfLines={1}>
                      {spark.subject}
                    </Text>
                    <Text style={styles.matchMeta}>
                      {spark.active ? "Active" : "Quiet"} · {spark.messageCount} messages
                    </Text>
                  </View>
                  <Text style={styles.addText}>Add</Text>
                </Pressable>
              ))}
              <Pressable style={[styles.secondary, busy && styles.off]} onPress={() => start(true)} disabled={busy}>
                {busy ? <ActivityIndicator color={PINK} /> : <Text style={styles.secondaryText}>Start a new Spark anyway</Text>}
              </Pressable>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)" },

  sheet: {
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

  header: { flexDirection: "row", alignItems: "center", gap: 6 },

  title: { fontFamily: FONTS.semibold, fontSize: 18, color: INK },

  seed: {
    marginTop: 10,
    padding: 10,
    borderRadius: 12,
    backgroundColor: "#F7F2F6",
    fontFamily: FONTS.regular,
    fontSize: 13,
    color: "#4A4A52",
  },

  label: { marginTop: 14, marginBottom: 8, fontFamily: FONTS.medium, fontSize: 11, letterSpacing: 0.4, color: MUTED },

  input: {
    minHeight: 48,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: "#0000000D",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.75)",
    fontFamily: FONTS.regular,
    fontSize: 14.5,
    color: INK,
    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null),
  },

  button: {
    marginTop: 14,
    height: 50,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: PINK,
  },

  buttonText: { fontFamily: FONTS.semibold, fontSize: 15, color: "#FFFFFF" },

  off: { opacity: 0.5 },

  similar: { marginTop: 12, marginBottom: 8, fontFamily: FONTS.medium, fontSize: 13.5, color: INK },

  match: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    marginBottom: 8,
    borderRadius: 14,
    backgroundColor: "#0000000D",
  },

  dot: { width: 12, height: 12, borderRadius: 6 },

  matchText: { flex: 1, minWidth: 0 },

  matchTitle: { fontFamily: FONTS.semibold, fontSize: 14, color: INK },

  matchMeta: { marginTop: 1, fontFamily: FONTS.regular, fontSize: 11.5, color: MUTED },

  addText: { fontFamily: FONTS.semibold, fontSize: 13, color: PINK },

  secondary: {
    marginTop: 6,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: PINK,
  },

  secondaryText: { fontFamily: FONTS.semibold, fontSize: 14, color: PINK },
});
