// ==========================================
// SUPER ADMIN DASHBOARD - sign in
// ==========================================
// Email + password, or (already signed in to CosQuest on this website, e.g.
// with Google) "Continue as @you". Either way it's the dashboard's own
// session: the phone stays signed in.
// Invited to be a super admin? Signed in to CosQuest here, the invitation
// shows on this page: accept it (then the dashboard opens) or decline it.
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Platform, Pressable, Text, TextInput, View } from "react-native";

import { useAdminTheme } from "@/components/admin/theme";
import { Button, Notice } from "@/components/admin/ui";
import { FONTS } from "@/constants/fonts";
import { AdminError, signInWithAppSession, signInWithPassword } from "@/services/admin";
import { type MyInvitation, answerInvitation, getMyInvitations } from "@/services/adminSettings";
import { useAppSelector } from "@/store/hooks";

function messageFor(error: unknown) {
  if (error instanceof AdminError) {
    if (error.code === "not_deployed") return "The admin server isn't available yet. Ask the backend team to deploy it.";
    if (error.code === "not_admin") return "This account isn't a super admin.";
    return error.message;
  }
  return "Couldn't sign in. Try again.";
}

export default function AdminLogin() {
  const t = useAdminTheme();
  const appToken = useAppSelector((state) => state.auth.token);
  const appUser = useAppSelector((state) => (state.user.user || state.auth.user) as any);
  const username = appUser?.profile?.username || appUser?.username || null;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<"password" | "app" | null>(null);
  const [error, setError] = useState("");
  const [invitations, setInvitations] = useState<MyInvitation[]>([]);
  const [answering, setAnswering] = useState<string | null>(null);

  // Signed in to CosQuest on this website: any pending admin invitation?
  useEffect(() => {
    if (!appToken) return;
    getMyInvitations(appToken)
      .then((result) => setInvitations(result.invitations || []))
      .catch(() => setInvitations([]));
  }, [appToken]);

  const answer = async (invitation: MyInvitation, accept: boolean) => {
    if (!appToken) return;
    setAnswering(invitation.id + (accept ? "a" : "d"));
    setError("");
    try {
      await answerInvitation(appToken, invitation.id, accept);
      if (accept) {
        await signInWithAppSession(appToken);
        router.replace("/admin" as any);
      } else {
        setInvitations((list) => list.filter((item) => item.id !== invitation.id));
      }
    } catch (e: any) {
      setError(e?.message || "Couldn't answer the invitation.");
    } finally {
      setAnswering(null);
    }
  };

  const done = () => router.replace("/admin" as any);

  const withPassword = async () => {
    if (!email.trim() || !password) return setError("Enter your email and password.");
    setBusy("password");
    setError("");
    try {
      await signInWithPassword(email.trim(), password);
      done();
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setBusy(null);
    }
  };

  const withApp = async () => {
    if (!appToken) return;
    setBusy("app");
    setError("");
    try {
      await signInWithAppSession(appToken);
      done();
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setBusy(null);
    }
  };

  const input = {
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: t.border,
    backgroundColor: t.cardSoft,
    fontFamily: FONTS.regular,
    fontSize: 14,
    color: t.text,
    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null),
  };

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: t.page }}>
      <View style={{ width: "100%", maxWidth: 420, padding: 32, borderRadius: 20, borderWidth: 1, borderColor: t.border, backgroundColor: t.card }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Ionicons name="sparkles-outline" size={24} color={t.pink} />
          <Text style={{ fontFamily: FONTS.regular, fontSize: 21, color: t.text }}>CosQuest</Text>
        </View>
        <Text style={{ marginTop: 22, fontFamily: FONTS.regular, fontSize: 24, color: t.text }}>Admin dashboard</Text>
        <Text style={{ marginTop: 6, fontFamily: FONTS.regular, fontSize: 13, color: t.muted }}>For CosQuest super admins. Signing in here keeps your phone signed in.</Text>

        {invitations.map((invitation) => (
          <View key={invitation.id} style={{ marginTop: 22, padding: 16, borderRadius: 14, backgroundColor: t.pinkSoft }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name="key-outline" size={18} color={t.pinkText} />
              <Text style={{ fontFamily: FONTS.medium, fontSize: 14, color: t.text }}>You're invited to be a super admin</Text>
            </View>
            <Text style={{ marginTop: 8, fontFamily: FONTS.regular, fontSize: 12.5, lineHeight: 18, color: t.muted }}>
              {invitation.invitedBy?.name || "A super admin"} invited you{invitation.reason ? `: “${invitation.reason}”` : "."} Super admins can review reports, moderate
              members and content, change settings and invite admins. Expires {new Date(invitation.expiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}.
            </Text>
            <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
              <Button label="Accept & continue" variant="primary" onPress={() => answer(invitation, true)} loading={answering === invitation.id + "a"} />
              <Button label="Decline" onPress={() => answer(invitation, false)} loading={answering === invitation.id + "d"} />
            </View>
          </View>
        ))}

        {appToken ? (
          <>
            <View style={{ marginTop: 22 }}>
              <Button label={username ? `Continue as @${username}` : "Continue with my CosQuest account"} icon="person-circle-outline" variant="primary" onPress={withApp} loading={busy === "app"} />
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 18 }}>
              <View style={{ flex: 1, height: 1, backgroundColor: t.border }} />
              <Text style={{ fontFamily: FONTS.regular, fontSize: 12, color: t.faint }}>or with email</Text>
              <View style={{ flex: 1, height: 1, backgroundColor: t.border }} />
            </View>
          </>
        ) : (
          <View style={{ height: 22 }} />
        )}

        <Text style={{ marginBottom: 6, fontFamily: FONTS.medium, fontSize: 12.5, color: t.text }}>Email</Text>
        <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="you@example.com" placeholderTextColor={t.faint} style={input} />
        <Text style={{ marginTop: 14, marginBottom: 6, fontFamily: FONTS.medium, fontSize: 12.5, color: t.text }}>Password</Text>
        <TextInput value={password} onChangeText={setPassword} secureTextEntry placeholder="Your password" placeholderTextColor={t.faint} style={input} onSubmitEditing={withPassword} />

        {error ? <Text style={{ marginTop: 12, fontFamily: FONTS.regular, fontSize: 12.5, color: t.red }}>{error}</Text> : null}

        <View style={{ marginTop: 18 }}>
          <Button label="Sign in" variant={appToken ? "secondary" : "primary"} onPress={withPassword} loading={busy === "password"} />
        </View>

        <View style={{ marginTop: 22 }}>
          <Notice icon="shield-checkmark-outline" text="Admin access is assigned by a super admin. Faction rank never grants admin access." />
        </View>
        <Pressable onPress={() => router.navigate("/community" as any)} style={{ marginTop: 16, alignSelf: "center" }}>
          <Text style={{ fontFamily: FONTS.regular, fontSize: 12.5, color: t.muted }}>Back to CosQuest</Text>
        </Pressable>
      </View>
    </View>
  );
}
