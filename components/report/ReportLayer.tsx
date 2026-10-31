// ==========================================
// REPORT (posts, chat messages, profiles)
// ==========================================
// Pick a reason, add details if you like, send. Reports are private: the
// person isn't told who reported them. CosQuest's admins review them.
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { themedStyles, useInk, useThemedStyles } from "@/constants/chatTheme";
import { FONTS } from "@/constants/fonts";
import { type ReportReason, sendReport } from "@/services/reports";
import { useAppSelector } from "@/store/hooks";

import { closeReport, useReportRequest } from "./reportStore";

const PINK = "#C34D9C";

const REASONS: { key: ReportReason; label: string; hint: string }[] = [
  { key: "spam", label: "Spam or scam", hint: "Fake offers, suspicious links, asking for passwords" },
  { key: "harassment", label: "Harassment or bullying", hint: "Insults, threats, targeting someone" },
  { key: "impersonation", label: "Pretending to be someone", hint: "A fake account of a person or brand" },
  { key: "creator_credit", label: "Someone else's work", hint: "Shared without credit or permission" },
  { key: "hate", label: "Hate", hint: "Attacks on who people are" },
  { key: "violence", label: "Violence or threats", hint: "Threats or praise of violence" },
  { key: "self_harm", label: "Self-harm or suicide", hint: "Someone may be at risk" },
  { key: "off_topic", label: "Off-topic or disruptive", hint: "Flooding or derailing a conversation" },
  { key: "other", label: "Something else", hint: "Tell us below" },
];

export default function ReportLayer() {
  const styles = useThemedStyles(STYLE_PAIR);
  const ink = useInk();
  const insets = useSafeAreaInsets();
  const request = useReportRequest();
  const token = useAppSelector((state) => state.auth.token);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [statement, setStatement] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState<"new" | "again" | null>(null);

  // A fresh form each time it opens.
  useEffect(() => {
    if (!request) return;
    setReason(null);
    setStatement("");
    setError("");
    setSent(null);
  }, [request]);

  if (!request) return null;

  const send = async () => {
    if (!token || !reason || sending) return;
    if (reason === "other" && statement.trim().length < 3) {
      setError("Tell us a little about what's wrong.");
      return;
    }
    setSending(true);
    setError("");
    try {
      const result = await sendReport({ targetType: request.targetType, targetId: request.targetId, reason, statement: statement.trim() || undefined }, token);
      setSent(result.alreadyReported ? "again" : "new");
    } catch (e: any) {
      const status = e?.status;
      const message = String(e?.message || "");
      setError(
        /route not found/i.test(message)
          ? "Reporting isn't available yet. Try again later."
          : status === 404
            ? "This is no longer available."
            : message || "Couldn't send the report. Try again.",
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={closeReport}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Pressable style={styles.backdrop} onPress={closeReport}>
          <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + 18 }]} onPress={() => {}}>
            <View style={styles.handle} />
            {sent ? (
              <View style={styles.done}>
                <View style={styles.doneIcon}>
                  <Ionicons name="checkmark" size={28} color="#FFFFFF" />
                </View>
                <Text style={styles.title}>{sent === "again" ? "You've already reported this" : "Thanks for letting us know"}</Text>
                <Text style={styles.doneText}>
                  {sent === "again"
                    ? "Your earlier report is with our admins."
                    : "A CosQuest admin will review it. Your report is private: they won't be told who sent it."}
                </Text>
                {reason === "self_harm" ? (
                  <Text style={[styles.doneText, { marginTop: 10 }]}>If someone is in immediate danger, contact your local emergency services.</Text>
                ) : null}
                <Pressable style={styles.send} onPress={closeReport} accessibilityRole="button">
                  <Text style={styles.sendText}>Done</Text>
                </Pressable>
              </View>
            ) : (
              <>
                <View style={styles.head}>
                  <Text style={styles.title}>Report {request.what}</Text>
                  <Pressable onPress={closeReport} hitSlop={10} accessibilityLabel="Close">
                    <Ionicons name="close" size={22} color={ink.text("#24283C")} />
                  </Pressable>
                </View>
                <Text style={styles.hint}>Why are you reporting this? Your report is private.</Text>
                <ScrollView style={{ maxHeight: 360 }} keyboardShouldPersistTaps="handled">
                  {REASONS.map((item) => {
                    const on = reason === item.key;
                    return (
                      <Pressable key={item.key} style={styles.reason} onPress={() => setReason(item.key)} accessibilityRole="radio" accessibilityState={{ checked: on }}>
                        <View style={[styles.radio, on && styles.radioOn]}>{on ? <View style={styles.radioDot} /> : null}</View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.reasonLabel}>{item.label}</Text>
                          <Text style={styles.reasonHint}>{item.hint}</Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </ScrollView>
                {reason ? (
                  <TextInput
                    value={statement}
                    onChangeText={setStatement}
                    placeholder={reason === "other" ? "What's wrong? (required)" : "Add details (optional)"}
                    placeholderTextColor={ink.text("#9AA1B4")}
                    style={styles.input}
                    multiline
                    maxLength={1000}
                  />
                ) : null}
                {error ? <Text style={styles.error}>{error}</Text> : null}
                <Pressable style={[styles.send, (!reason || sending) && { opacity: 0.5 }]} disabled={!reason || sending} onPress={send} accessibilityRole="button">
                  {sending ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.sendText}>Send report</Text>}
                </Pressable>
              </>
            )}
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const STYLE_PAIR = themedStyles(
  {
    backdrop: { flex: 1, justifyContent: "flex-end", alignItems: "center", backgroundColor: "rgba(0,0,0,0.45)" },
    sheet: { width: "100%", maxWidth: 560, paddingHorizontal: 20, paddingTop: 10, borderTopLeftRadius: 26, borderTopRightRadius: 26, backgroundColor: "#FFFFFF" },
    handle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, marginBottom: 12, backgroundColor: "#D9DDE6" },
    head: { flexDirection: "row", alignItems: "center" },
    title: { flex: 1, fontFamily: FONTS.bold, fontSize: 19, color: "#24283C" },
    hint: { marginTop: 4, marginBottom: 8, fontFamily: FONTS.regular, fontSize: 13, color: "#66738A" },
    reason: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 11 },
    radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: "#C3C8D4", alignItems: "center", justifyContent: "center" },
    radioOn: { borderColor: PINK },
    radioDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: PINK },
    reasonLabel: { fontFamily: FONTS.medium, fontSize: 15, color: "#24283C" },
    reasonHint: { marginTop: 1, fontFamily: FONTS.regular, fontSize: 12.5, color: "#7A8296" },
    input: {
      marginTop: 10,
      minHeight: 70,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 14,
      textAlignVertical: "top",
      fontFamily: FONTS.regular,
      fontSize: 14.5,
      color: "#24283C",
      backgroundColor: "#F3F5F9",
      ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null),
    },
    error: { marginTop: 10, fontFamily: FONTS.regular, fontSize: 13, color: "#D9364F" },
    send: { marginTop: 14, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", backgroundColor: PINK },
    sendText: { fontFamily: FONTS.bold, fontSize: 16, color: "#FFFFFF" },
    done: { alignItems: "center", paddingTop: 10, paddingBottom: 4 },
    doneIcon: { width: 56, height: 56, borderRadius: 28, marginBottom: 14, alignItems: "center", justifyContent: "center", backgroundColor: PINK },
    doneText: { marginTop: 6, textAlign: "center", fontFamily: FONTS.regular, fontSize: 14, lineHeight: 20, color: "#66738A" },
  },
  {
    sheet: { backgroundColor: "#1F2130" },
    handle: { backgroundColor: "#3A3D52" },
    title: { color: "#F4F5FA" },
    hint: { color: "#B5BBCB" },
    radio: { borderColor: "#5D6478" },
    reasonLabel: { color: "#F4F5FA" },
    reasonHint: { color: "#9AA1B4" },
    input: { backgroundColor: "#2A2C3B", color: "#F4F5FA" },
    doneText: { color: "#B5BBCB" },
  },
);
