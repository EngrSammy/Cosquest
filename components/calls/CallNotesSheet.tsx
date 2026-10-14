// ==========================================
// A CALL'S SPARKS (after the call)
// ==========================================
// What Sparks wrote up for a finished call: a summary, then each Spark
// (topic) with its points, decisions and to-dos. Written by the phones that
// were on the call and stored by our backend (GET /api/calls/:id/outline),
// so the website shows it too. Only people who were on the call (and the
// chat's admins) can read it.
import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { apiRequest } from "@/services/api";

import type { CallOutline } from "@cosquest/sparks-sdk";

// Sparks in calls needs the backend's Sparks module (same switch as the rest of Sparks).
export const callNotesEnabled = ["module", "qlm"].includes(String(process.env.EXPO_PUBLIC_SPARKS_ENGINE || ""));

const TOPIC_COLORS = ["#3FD3E0", "#F5A524", "#C5399A", "#2FB36B", "#8B7CF6", "#FF7A59", "#4C9AFF", "#E5D04B"];

type Loaded =
  | { state: "loading" }
  | { state: "ready"; outline: CallOutline }
  | { state: "pending" }
  | { state: "error"; message: string };

export default function CallNotesSheet({
  callId,
  token,
  visible,
  onClose,
  nameOf,
}: {
  callId: string;
  token: string | null | undefined;
  visible: boolean;
  onClose: () => void;
  /** A person's display name from their user id (people in this chat). */
  nameOf: (userId: string) => string;
}) {
  const insets = useSafeAreaInsets();
  const [loaded, setLoaded] = useState<Loaded>({ state: "loading" });

  useEffect(() => {
    if (!visible || !token) return;
    let cancelled = false;
    setLoaded({ state: "loading" });
    apiRequest<{ status?: string; outline?: CallOutline | null }>(
      `/api/calls/${encodeURIComponent(callId)}/outline`,
      { method: "GET", token },
    )
      .then((reply) => {
        if (cancelled) return;
        setLoaded(reply?.outline ? { state: "ready", outline: reply.outline } : { state: "pending" });
      })
      .catch((error: any) => {
        if (!cancelled) setLoaded({ state: "error", message: error?.message || "Couldn't load this call's Sparks." });
      });
    return () => {
      cancelled = true;
    };
  }, [visible, callId, token]);

  const outline = loaded.state === "ready" ? loaded.outline : null;
  const topics = outline ? [...outline.topics].sort((a, b) => a.order - b.order) : [];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.header}>
            <Ionicons name="sparkles" size={18} color="#C5399A" />
            <Text style={styles.headerTitle} numberOfLines={1}>
              {outline?.title || "Sparks from this call"}
            </Text>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
              <Ionicons name="close" size={24} color="#191922" />
            </Pressable>
          </View>

          {loaded.state === "loading" ? (
            <ActivityIndicator style={{ marginVertical: 40 }} color="#C5399A" />
          ) : loaded.state === "pending" ? (
            <Text style={styles.empty}>
              Sparks is still writing up this call. It's ready a minute or two after the call ends.
            </Text>
          ) : loaded.state === "error" ? (
            <Text style={styles.empty}>{loaded.message}</Text>
          ) : (
            <ScrollView contentContainerStyle={{ paddingBottom: 12 }}>
              {outline?.summary ? <Text style={styles.summary}>{outline.summary}</Text> : null}
              {topics.map((topic) => {
                const color = TOPIC_COLORS[topic.colorIndex % TOPIC_COLORS.length];
                return (
                  <View key={topic.topicId} style={[styles.topic, { borderLeftColor: color }]}>
                    <Text style={styles.topicTitle}>{topic.title}</Text>
                    {topic.summary ? <Text style={styles.text}>{topic.summary}</Text> : null}
                    {topic.points.map((point, i) => (
                      <Text key={`p${i}`} style={styles.bullet}>
                        • {point}
                      </Text>
                    ))}
                    {topic.decisions.length ? <Text style={styles.label}>Decided</Text> : null}
                    {topic.decisions.map((decision, i) => (
                      <Text key={`d${i}`} style={styles.bullet}>
                        • {decision}
                      </Text>
                    ))}
                    {topic.actionItems.length ? <Text style={styles.label}>To do</Text> : null}
                    {topic.actionItems.map((item, i) => (
                      <Text key={`a${i}`} style={styles.bullet}>
                        • {item.text}
                        {item.ownerUserId ? <Text style={styles.owner}> ({nameOf(item.ownerUserId)})</Text> : null}
                      </Text>
                    ))}
                  </View>
                );
              })}
              {outline && !topics.length && !outline.summary ? (
                <Text style={styles.empty}>Sparks didn't pick up any topics on this call.</Text>
              ) : null}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: {
    maxHeight: "85%",
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  header: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: "800", color: "#191922" },
  summary: { fontSize: 15, lineHeight: 21, color: "#191922", marginBottom: 14 },
  topic: { borderLeftWidth: 3, paddingLeft: 12, marginBottom: 16 },
  topicTitle: { fontSize: 15, fontWeight: "800", color: "#191922", marginBottom: 4 },
  text: { fontSize: 14, lineHeight: 20, color: "#3A3A44", marginBottom: 4 },
  label: { fontSize: 12, fontWeight: "800", color: "#8A8A90", marginTop: 6, marginBottom: 2, textTransform: "uppercase" },
  bullet: { fontSize: 14, lineHeight: 20, color: "#3A3A44" },
  owner: { color: "#8A8A90" },
  empty: { fontSize: 14, lineHeight: 20, color: "#6B6B72", marginVertical: 24 },
});
