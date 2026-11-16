// ==========================================
// SUPER ADMIN DASHBOARD - sign in
// ==========================================
// Email + password, or (already signed in to CosQuest on this website, e.g.
// with Google) "Continue as @you". Either way it's the dashboard's own
// session: the phone stays signed in.
// Show / hide the password, and "Remember me" (the email, in this browser).
// Invited to be a super admin? Signed in to CosQuest here, the invitation
// shows on this page: accept it (then the dashboard opens) or decline it.
// Glass design: the logo and a welcome on the left, the sign-in card on the
// right (stacked on a phone).
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { COSQUEST_LOGO, LOGO_RATIO } from "@/components/admin/AdminShell";
import { glass, useGlassStyles } from "@/components/admin/glass";
import { useAdminTheme } from "@/components/admin/theme";
import { Button, Notice } from "@/components/admin/ui";
import { FONTS } from "@/constants/fonts";
import { AdminError, signInWithAppSession, signInWithPassword } from "@/services/admin";
import { type MyInvitation, answerInvitation, getMyInvitations } from "@/services/adminSettings";
import { useAppSelector } from "@/store/hooks";

const REMEMBER_KEY = "cq_admin_email";

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
  useGlassStyles();
  const appToken = useAppSelector((state) => state.auth.token);
  const appUser = useAppSelector((state) => (state.user.user || state.auth.user) as any);
  const username = appUser?.profile?.username || appUser?.username || null;
  // "Remember me": the email is kept in this browser (never the password -
  // the browser's own password manager offers to save that).
  const [email, setEmail] = useState(() => {
    try {
      return (typeof window !== "undefined" && window.localStorage.getItem(REMEMBER_KEY)) || "";
    } catch {
      return "";
    }
  });
  const [remember, setRemember] = useState(() => {
    try {
      return typeof window !== "undefined" && Boolean(window.localStorage.getItem(REMEMBER_KEY));
    } catch {
      return false;
    }
  });
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
      try {
        if (remember) window.localStorage.setItem(REMEMBER_KEY, email.trim());
        else window.localStorage.removeItem(REMEMBER_KEY);
      } catch {}
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
    height: 50,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: t.border,
    backgroundColor: t.cardSoft,
    fontFamily: FONTS.regular,
    fontSize: 15,
    color: t.text,
    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null),
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.page }} {...glass("page")}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 24 }}>
      <View style={{ width: "100%", maxWidth: 1120, alignSelf: "center", flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 48 }}>
      {/* Left: the logo and a welcome */}
      <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 420, minWidth: 0, gap: 20 }}>
        <Image source={COSQUEST_LOGO} style={{ width: 300, height: 300 / LOGO_RATIO, maxWidth: "80%" }} contentFit="contain" accessibilityLabel="CosQuest" />
        <Text style={{ fontFamily: FONTS.bold, fontSize: 42, lineHeight: 50, color: t.text }}>Admin dashboard</Text>
        <Text style={{ maxWidth: 460, fontFamily: FONTS.regular, fontSize: 16, lineHeight: 26, color: t.muted }}>
          Keep the community safe, run quests and events, and look after tickets and payments, all in one place.
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          {["Moderation", "Quests & events", "Tickets & payments", "Audit log"].map((label) => (
            <View key={label} style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 14, borderWidth: 1, borderColor: t.border, backgroundColor: t.card }} {...glass("panel")}>
              <Text style={{ fontFamily: FONTS.medium, fontSize: 13, color: t.text }}>{label}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Right: the sign-in card */}
      <View
        style={{ flexGrow: 1, flexShrink: 1, flexBasis: 380, maxWidth: 460, minWidth: 0, padding: 34, borderRadius: 28, borderWidth: 1, borderColor: "rgba(255,255,255,0.2)", backgroundColor: "rgba(255,255,255,0.1)" }}
        {...glass("panel")}>
        <Text style={{ fontFamily: FONTS.semibold, fontSize: 26, color: t.text }}>Sign in</Text>
        <Text style={{ marginTop: 6, fontFamily: FONTS.regular, fontSize: 14, lineHeight: 20, color: t.muted }}>For CosQuest super admins. Signing in here keeps your phone signed in.</Text>

        {invitations.map((invitation) => (
          <View key={invitation.id} style={{ marginTop: 22, padding: 16, borderRadius: 14, backgroundColor: t.pinkSoft }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name="key-outline" size={18} color={t.pinkText} />
              <Text style={{ fontFamily: FONTS.medium, fontSize: 14, color: t.text }}>You&apos;re invited to be a super admin</Text>
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

        <Text style={{ marginBottom: 8, fontFamily: FONTS.medium, fontSize: 14, color: t.text }}>Email</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          // Lets the browser fill and save the sign-in details.
          autoComplete="email"
          textContentType="username"
          {...({ name: "email", id: "admin-email" } as object)}
          placeholder="you@example.com"
          placeholderTextColor={t.faint}
          style={input}
        />
        <Text style={{ marginTop: 16, marginBottom: 8, fontFamily: FONTS.medium, fontSize: 14, color: t.text }}>Password</Text>
        <View style={{ justifyContent: "center" }}>
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            autoComplete="current-password"
            textContentType="password"
            {...({ name: "password", id: "admin-password" } as object)}
            placeholder="Your password"
            placeholderTextColor={t.faint}
            style={[input, { paddingRight: 48 }]}
            onSubmitEditing={withPassword}
          />
          <Pressable
            onPress={() => setShowPassword((v) => !v)}
            hitSlop={8}
            style={{ position: "absolute", right: 12, padding: 4 }}
            accessibilityRole="button"
            accessibilityLabel={showPassword ? "Hide password" : "Show password"}>
            <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color={t.muted} />
          </Pressable>
        </View>

        <Pressable onPress={() => setRemember((v) => !v)} style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 14 }} accessibilityRole="checkbox" accessibilityState={{ checked: remember }}>
          <View style={{ width: 18, height: 18, borderRadius: 4, borderWidth: 1.5, borderColor: remember ? t.pink : t.faint, backgroundColor: remember ? t.pink : "transparent", alignItems: "center", justifyContent: "center" }}>
            {remember ? <Ionicons name="checkmark" size={13} color="#FFFFFF" /> : null}
          </View>
          <Text style={{ flex: 1, fontFamily: FONTS.regular, fontSize: 14, color: t.text }}>Remember me on this computer</Text>
        </Pressable>

        {error ? <Text style={{ marginTop: 12, fontFamily: FONTS.regular, fontSize: 12.5, color: t.red }}>{error}</Text> : null}

        <View style={{ marginTop: 20 }}>
          <Button label="Sign in" variant={appToken ? "secondary" : "primary"} onPress={withPassword} loading={busy === "password"} />
        </View>

        <View style={{ marginTop: 22 }}>
          <Notice icon="shield-checkmark-outline" text="Admin access is assigned by a super admin. Faction rank never grants admin access." />
        </View>
        <Pressable onPress={() => router.navigate("/community" as any)} style={{ marginTop: 16, alignSelf: "center" }}>
          <Text style={{ fontFamily: FONTS.regular, fontSize: 14, color: t.muted }}>Back to CosQuest</Text>
        </Pressable>
      </View>
      </View>
      </ScrollView>
    </View>
  );
}
