// Contact support / report a bug (task 059; was "Coming soon"). Sends to the
// backend's existing POST /api/users/me/support-requests, with the app's
// version and platform so the team can reproduce it.
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert, Platform, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button, Header } from "@/components/kit";
import { KeyboardAwareScrollView } from "@/components/ui/keyboard";
import { FONTS } from "@/constants/fonts";
import { apiRequest } from "@/services/api";
import { appConfig } from "@/services/appConfig";
import { useAppSelector } from "@/store/hooks";
import { radius, space, type, useRoles } from "@/theme";
import { haptic } from "@/utils/haptics";

export default function Support() {
  const { type: kind } = useLocalSearchParams<{ type?: string }>();
  const bug = kind === "bug";
  const token = useAppSelector((state) => state.auth.token);
  const insets = useSafeAreaInsets();
  const r = useRoles();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (!token || !subject.trim() || !message.trim()) return;
    setSending(true);
    try {
      await apiRequest("/api/users/me/support-requests", {
        method: "POST",
        token,
        body: {
          type: bug ? "bug" : "support",
          subject: subject.trim().slice(0, 150),
          message: message.trim().slice(0, 5000),
          appVersion: appConfig.appVersion,
          platform: Platform.OS === "ios" || Platform.OS === "android" || Platform.OS === "web" ? Platform.OS : "unknown",
        },
      });
      haptic.success();
      Alert.alert(bug ? "Thanks for the report" : "Message sent", "The CosQuest team will get back to you.");
      router.back();
    } catch (error) {
      haptic.error();
      Alert.alert(bug ? "Report a bug" : "Contact support", error instanceof Error ? error.message : "Couldn't send it. Try again.");
    } finally {
      setSending(false);
    }
  };

  const input = [styles.input, { color: r.text, borderColor: r.border, backgroundColor: r.surface }];
  return (
    <View style={[styles.screen, { backgroundColor: r.screen }]}>
      <Header title={bug ? "Report a bug" : "Contact support"} backTo="/help-support" />
      <KeyboardAwareScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space.xxxl }]} keyboardShouldPersistTaps="handled">
        <Text style={[styles.lead, { color: r.textSubtle }]}>
          {bug ? "What went wrong? What did you expect to happen?" : "Tell us what you need help with."}
        </Text>
        <Text style={[styles.label, { color: r.text }]}>Subject</Text>
        <TextInput value={subject} onChangeText={setSubject} maxLength={150} style={input} accessibilityLabel="Subject" placeholder={bug ? "e.g. The map is blank" : "e.g. I can't change my username"} placeholderTextColor={r.placeholder} />
        <Text style={[styles.label, { color: r.text }]}>{bug ? "What happened" : "Message"}</Text>
        <TextInput value={message} onChangeText={setMessage} maxLength={5000} multiline style={[input, styles.area]} accessibilityLabel="Message" placeholderTextColor={r.placeholder} />
        <Text style={[styles.meta, { color: r.textMuted }]}>
          Sent with: CosQuest {appConfig.appVersion}, {Platform.OS}
        </Text>
        <Button label="Send" onPress={send} loading={sending} disabled={!subject.trim() || !message.trim()} style={{ marginTop: space.lg }} />
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { padding: space.xl, gap: space.sm },
  lead: { fontFamily: FONTS.regular, ...type.body },
  label: { fontFamily: FONTS.medium, ...type.body, marginTop: space.md },
  input: { minHeight: 48, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space.md, fontFamily: FONTS.regular, ...type.body },
  area: { minHeight: 140, paddingTop: space.md, textAlignVertical: "top" },
  meta: { fontFamily: FONTS.regular, ...type.caption, marginTop: space.sm },
});
