// ==========================================
// START A SPARK (Figma M11) + TOPIC MATCH DECISION (M12)
// ==========================================
// M11: "Give this conversation a subject." The pressed message (the seed),
// "Spark subject", then "Check for matching Sparks".
// M12: if the Sparks bot finds similar Sparks: "A familiar subject" - add the
// seed to an active or quiet Spark, or start a separate new one. "Nothing is
// merged without your choice." Built from the screenshots for testing.
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

import { RankLine } from "@/components/chat/RankBadge";
import { FONTS } from "@/constants/fonts";
import type { Rank } from "@/services/ranks";
import { addToSpark, monthYear, startSpark, type Spark } from "@/services/sparks";
import { themedStyles, useThemedStyles } from "@/constants/chatTheme";

const PINK = "#B63D91";
const INK = "#24283C";
const MUTED = "#66738A";
const LILAC = "#F0EDF9";

const AVATAR_TINTS = ["#E9E1F5", "#DCE8EF", "#F3DDED", "#E2F0E8", "#F5E6D8"];

function avatarTint(name?: string) {
  let hash = 0;
  for (const char of String(name || "")) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return AVATAR_TINTS[hash % AVATAR_TINTS.length];
}

function initialsOf(name?: string) {
  const parts = String(name || "?").trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[1][0] : (parts[0] || "?").slice(0, 2);
  return letters.toUpperCase();
}

export type SparkSeedMessage = {
  id: string;
  content?: string;
  senderName?: string;
  rank?: Rank | null;
  createdAt?: string;
};

// The pressed message, as in the chat (avatar, name, rank, bubble).
function SeedPreview({ message }: { message: SparkSeedMessage }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const name = message.senderName || "Someone";
  return (
    <View style={styles.seed}>
      <View style={styles.seedHead}>
        <View style={[styles.avatar, { backgroundColor: avatarTint(name) }]}>
          <Text style={styles.avatarText}>{initialsOf(name)}</Text>
        </View>
        <View style={styles.seedName}>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
          <RankLine rank={message.rank} />
        </View>
      </View>
      <View style={styles.seedBubble}>
        <Text style={styles.seedText}>{message.content || "Message"}</Text>
        {message.createdAt ? (
          <Text style={styles.seedTime}>
            {new Date(message.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export default function StartSparkSheet({
  visible,
  conversationId,
  conversationTitle,
  token,
  message,
  onClose,
  onDone,
}: {
  visible: boolean;
  conversationId: string;
  conversationTitle?: string;
  token: string;
  message: SparkSeedMessage | null;
  onClose: () => void;
  // The Spark the message ended up in (new or existing).
  onDone: (spark: Spark) => void;
}) {
  const styles = useThemedStyles(STYLE_PAIR);
  const insets = useSafeAreaInsets();

  const [subject, setSubject] = useState("");
  const [matches, setMatches] = useState<Spark[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setSubject("");
      setMatches([]);
    }
  }, [visible]);

  const check = async (force = false) => {
    const text = subject.trim();
    if (!message || text.length < 2 || busy) return;
    try {
      setBusy(force ? "new" : "check");
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
      setBusy(null);
    }
  };

  const addTo = async (spark: Spark) => {
    if (!message || busy) return;
    try {
      setBusy(spark.id);
      onDone(await addToSpark(conversationId, spark.id, message.id, token));
      onClose();
    } catch (error) {
      Alert.alert("Spark", error instanceof Error ? error.message : "Couldn't add it.");
    } finally {
      setBusy(null);
    }
  };

  const deciding = matches.length > 0;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={[styles.sheet, deciding && styles.sheetTall, { paddingBottom: insets.bottom + 16 }]}>
          {!deciding ? (
            <>
              {/* M11 */}
              <View style={styles.header}>
                <Text style={styles.title}>Start a Spark</Text>
                <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close">
                  <Ionicons name="close" size={24} color={MUTED} />
                </Pressable>
              </View>
              <Text style={styles.subtitle}>Give this conversation a subject.</Text>

              {message ? <SeedPreview message={message} /> : null}

              <Text style={styles.label}>Spark subject</Text>
              <TextInput
                value={subject}
                onChangeText={setSubject}
                placeholder="e.g. Spider-Man uniform"
                placeholderTextColor="#9AA3B5"
                maxLength={60}
                autoFocus
                style={styles.input}
                onSubmitEditing={() => check(false)}
              />
              <Text style={styles.hint}>A clear subject helps people find this conversation.</Text>
              <Text style={styles.note}>
                Sparks bot checks active and quiet topics first. You choose where your message belongs.
              </Text>

              <Pressable
                style={[styles.primary, (subject.trim().length < 2 || !!busy) && styles.off]}
                disabled={subject.trim().length < 2 || !!busy}
                onPress={() => check(false)}>
                {busy === "check" ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.primaryText}>Check for matching Sparks</Text>
                )}
              </Pressable>
              <Pressable style={styles.secondary} onPress={onClose}>
                <Text style={styles.secondaryText}>Cancel</Text>
              </Pressable>
            </>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {/* M12 */}
              <View style={styles.header}>
                <Pressable onPress={() => setMatches([])} hitSlop={10} accessibilityLabel="Back">
                  <Ionicons name="chevron-back" size={24} color={INK} />
                </Pressable>
                <View style={styles.headerText}>
                  <Text style={styles.title}>Choose a conversation</Text>
                  {conversationTitle ? <Text style={styles.subtitleSmall}>{conversationTitle}</Text> : null}
                </View>
                <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close">
                  <Ionicons name="close" size={24} color={MUTED} />
                </Pressable>
              </View>

              <View style={styles.botChip}>
                <Text style={styles.botChipText}>
                  Sparks bot · {matches.length} possible {matches.length === 1 ? "match" : "matches"}
                </Text>
              </View>

              <Text style={styles.bigTitle}>A familiar subject</Text>
              <Text style={styles.subtitle}>Add your message to an existing Spark, or give it a space of its own.</Text>

              {message ? <SeedPreview message={message} /> : null}

              {matches.map((spark) => (
                <View key={spark.id} style={styles.matchCard}>
                  <View style={[styles.stateChip, spark.active ? styles.stateChipActive : styles.stateChipQuiet]}>
                    <Text style={[styles.stateChipText, spark.active && styles.stateChipTextActive]}>
                      {spark.active
                        ? `Active · ${spark.participantCount} ${spark.participantCount === 1 ? "person" : "people"}`
                        : `Quiet · ${monthYear(spark.lastActivityAt)}`}
                    </Text>
                  </View>
                  <Text style={styles.matchTitle}>{spark.subject}</Text>
                  {spark.summary ? (
                    <Text style={styles.matchSummary} numberOfLines={2}>
                      {spark.summary}
                    </Text>
                  ) : null}
                  <Pressable
                    style={[spark.active ? styles.primary : styles.secondary, styles.matchButton, !!busy && styles.off]}
                    disabled={!!busy}
                    onPress={() => addTo(spark)}>
                    {busy === spark.id ? (
                      <ActivityIndicator color={spark.active ? "#FFFFFF" : PINK} />
                    ) : (
                      <Text style={spark.active ? styles.primaryText : styles.secondaryText}>
                        {spark.active ? "Add seed to active Spark" : "Add seed to quiet Spark"}
                      </Text>
                    )}
                  </Pressable>
                </View>
              ))}

              <Pressable style={[styles.secondary, !!busy && styles.off]} disabled={!!busy} onPress={() => check(true)}>
                {busy === "new" ? <ActivityIndicator color={PINK} /> : <Text style={styles.secondaryText}>Start a separate new Spark</Text>}
              </Pressable>
              <Text style={styles.note}>Nothing is merged without your choice.</Text>
              <Pressable style={styles.secondary} onPress={onClose}>
                <Text style={styles.secondaryText}>Cancel</Text>
              </Pressable>
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const STYLE_PAIR = themedStyles({
  backdrop: { flex: 1, backgroundColor: "rgba(36,40,60,0.35)" },

  sheet: {
    width: "100%",
    maxWidth: 640,
    alignSelf: "center",
    paddingHorizontal: 20,
    paddingTop: 22,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: "#FFFFFF",
  },

  sheetTall: { maxHeight: "94%", backgroundColor: "#F6F9FE" },

  header: { flexDirection: "row", alignItems: "center", gap: 10, justifyContent: "space-between" },

  headerText: { flex: 1, minWidth: 0 },

  title: { fontFamily: FONTS.semibold, fontSize: 22, lineHeight: 28, color: INK },

  subtitle: { marginTop: 8, fontFamily: FONTS.regular, fontSize: 14, lineHeight: 21, color: MUTED },

  subtitleSmall: { marginTop: 2, fontFamily: FONTS.regular, fontSize: 12, color: MUTED },

  bigTitle: { marginTop: 14, fontFamily: FONTS.semibold, fontSize: 21, lineHeight: 28, color: INK },

  // SEED
  seed: { marginTop: 16 },

  seedHead: { flexDirection: "row", alignItems: "center", gap: 8 },

  avatar: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },

  avatarText: { fontFamily: FONTS.bold, fontSize: 10, color: "#7D356D" },

  seedName: { flex: 1, minWidth: 0, gap: 3 },

  name: { fontFamily: FONTS.semibold, fontSize: 13, color: INK },

  seedBubble: {
    marginTop: 8,
    marginLeft: 38,
    padding: 12,
    borderRadius: 16,
    borderTopLeftRadius: 4,
    backgroundColor: "#FFFFFF",
  },

  seedText: { fontFamily: FONTS.regular, fontSize: 15, lineHeight: 22, color: INK },

  seedTime: { marginTop: 8, fontFamily: FONTS.regular, fontSize: 11, color: MUTED },

  // M11 FORM
  label: { marginTop: 18, marginBottom: 8, fontFamily: FONTS.semibold, fontSize: 13, color: INK },

  input: {
    height: 50,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "rgba(102,115,138,0.3)",
    fontFamily: FONTS.regular,
    fontSize: 15,
    color: INK,
    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null),
  },

  hint: { marginTop: 6, fontFamily: FONTS.regular, fontSize: 11.5, color: MUTED },

  note: { marginTop: 14, fontFamily: FONTS.regular, fontSize: 12.5, lineHeight: 18, color: MUTED },

  // BUTTONS
  primary: {
    marginTop: 16,
    height: 50,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: PINK,
  },

  primaryText: { fontFamily: FONTS.semibold, fontSize: 15, color: "#FFFFFF" },

  secondary: {
    marginTop: 10,
    height: 50,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: LILAC,
  },

  secondaryText: { fontFamily: FONTS.semibold, fontSize: 15, color: PINK },

  off: { opacity: 0.5 },

  // M12
  botChip: {
    alignSelf: "flex-start",
    marginTop: 14,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: "#F3DDED",
  },

  botChipText: { fontFamily: FONTS.semibold, fontSize: 11, color: PINK },

  matchCard: {
    marginTop: 16,
    padding: 14,
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "rgba(36,40,60,0.08)",
  },

  stateChip: { alignSelf: "flex-start", paddingHorizontal: 9, paddingVertical: 3, borderRadius: 10 },

  stateChipActive: { backgroundColor: "#F3DDED" },

  stateChipQuiet: { backgroundColor: "#ECEDF3" },

  stateChipText: { fontFamily: FONTS.medium, fontSize: 11, color: MUTED },

  stateChipTextActive: { color: PINK },

  matchTitle: { marginTop: 10, fontFamily: FONTS.semibold, fontSize: 17, lineHeight: 23, color: INK },

  matchSummary: { marginTop: 4, fontFamily: FONTS.regular, fontSize: 13, lineHeight: 19, color: MUTED },

  matchButton: { marginTop: 12 },
});
