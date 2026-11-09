// Delete my account (task 059, App Store guideline 5.1.1(v)). Settings >
// Account Information > Delete account. Says what goes, asks for the
// password (or the word DELETE for Google / Apple accounts), calls
// DELETE /api/users/me, then signs out everywhere on this phone. Shown only
// where the server supports it (services/capabilities.ts); otherwise the
// screen explains that deletion is not available on this server yet.
import { router } from "expo-router";
import { useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button, EmptyState, Header } from "@/components/kit";
import { FONTS } from "@/constants/fonts";
import { useCapabilities } from "@/services/capabilities";
import { forgetPushToken } from "@/services/push";
import { deleteMyAccount } from "@/services/safety";
import { logout as logoutLocal } from "@/store/slices/authSlice";
import { clearUser } from "@/store/slices/userSlice";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { radius, space, type, useRoles } from "@/theme";
import { haptic } from "@/utils/haptics";

const GOES = [
  "Your profile, photo and bio",
  "Your posts, comments and likes",
  "Who you follow and who follows you",
  "Your messages (they show as deleted to others)",
  "Your notifications and this phone's push token",
];

export default function DeleteAccount() {
  const dispatch = useAppDispatch();
  const insets = useSafeAreaInsets();
  const r = useRoles();
  const caps = useCapabilities();
  const token = useAppSelector((state) => state.auth.token);
  const user = useAppSelector((state) => state.auth.user) as any;
  // Accounts made with Google or Apple have no password (the server says
  // hasPassword: false; older servers say nothing, so ask for one).
  const social = user?.hasPassword === false;
  const [password, setPassword] = useState("");
  const [word, setWord] = useState("");
  const [busy, setBusy] = useState(false);

  const ready = social ? word.trim().toUpperCase() === "DELETE" : password.length > 0;

  const run = () => {
    if (!token || !ready) return;
    haptic.warning();
    Alert.alert("Delete your account?", "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          setBusy(true);
          try {
            await deleteMyAccount(token, social ? { confirm: "DELETE" } : { password });
            await forgetPushToken(null);
            dispatch(logoutLocal());
            dispatch(clearUser());
            if (router.canDismiss()) router.dismissAll();
            router.replace("/onboarding");
            Alert.alert("Account deleted", "Your CosQuest account and its data have been deleted.");
          } catch (error) {
            haptic.error();
            const message = error instanceof Error ? error.message : "Couldn't delete the account. Try again.";
            Alert.alert("Delete account", message);
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  return (
    <View style={[styles.screen, { backgroundColor: r.screen }]}>
      <Header title="Delete account" backTo="/account-information" />
      {!caps.deleteAccount ? (
        <EmptyState
          icon="construct-outline"
          title={caps.known ? "Not available" : "Not available on this server yet"}
          message="Account deletion needs the latest CosQuest server. Until then, contact support from Help & Support and we'll delete it for you."
          actionLabel="Help & Support"
          onAction={() => router.push("/help-support")}
        />
      ) : (
        <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space.xxxl }]} keyboardShouldPersistTaps="handled">
          <Text style={[styles.lead, { color: r.text }]}>Deleting your account removes:</Text>
          {GOES.map((line) => (
            <Text key={line} style={[styles.item, { color: r.textSubtle }]}>
              {"•"} {line}
            </Text>
          ))}
          <Text style={[styles.note, { color: r.textMuted }]}>Your game progress on this account stops with it. This can{"'"}t be undone.</Text>
          {social ? (
            <>
              <Text style={[styles.label, { color: r.text }]}>Type DELETE to confirm</Text>
              <TextInput
                value={word}
                onChangeText={setWord}
                autoCapitalize="characters"
                autoCorrect={false}
                style={[styles.input, { color: r.text, borderColor: r.border, backgroundColor: r.surface }]}
                accessibilityLabel="Type DELETE to confirm"
                testID="delete-confirm"
              />
            </>
          ) : (
            <>
              <Text style={[styles.label, { color: r.text }]}>Your password</Text>
              <TextInput
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                style={[styles.input, { color: r.text, borderColor: r.border, backgroundColor: r.surface }]}
                accessibilityLabel="Your password"
                testID="delete-password"
              />
            </>
          )}
          <Button label="Delete my account" variant="danger" onPress={run} disabled={!ready} loading={busy} style={styles.button} testID="delete-account-confirm" />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { padding: space.xl, gap: space.sm },
  lead: { fontFamily: FONTS.semibold, ...type.bodyLarge, marginBottom: space.xs },
  item: { fontFamily: FONTS.regular, ...type.body },
  note: { fontFamily: FONTS.regular, ...type.small, marginTop: space.md },
  label: { fontFamily: FONTS.medium, ...type.body, marginTop: space.xl },
  input: { minHeight: 48, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space.md, fontFamily: FONTS.regular, ...type.body },
  button: { marginTop: space.xl },
});
