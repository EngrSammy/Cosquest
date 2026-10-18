// ==========================================
// GROUP INVITATION (Figma M25 · Invite & pending approval)
// ==========================================
// Opened from an invite link. Shows the group, then:
//  - instant join: "Join group";
//  - admin approval: "Your introduction" + "Ask to join", then the
//    "Request pending" card ("Chat is available after approval");
//  - already a member: "Open group chat".
// The introduction is sent with the request (the backend shows it to admins
// once it supports notes). Built from the screenshot for testing.
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FONTS } from "@/constants/fonts";
import { apiRequest } from "@/services/api";
import { getInvite, type GroupKind, type GroupPreview, type JoinResult } from "@/services/groups";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { fetchChats } from "@/store/thunks/chatThunks";
import { cancelJoinRequest } from "@/services/chatPrefs";
import { safeBack } from "@/utils/safeBack";
import { ScreenGradient } from "@/components/chat/ui";
import { themedStyles, useInk, useThemedStyles } from "@/constants/chatTheme";

const PINK = "#B63D91";
const INK = "#24283C";
const MUTED = "#66738A";
const LILAC = "#F0EDF9";
const PINK_SOFT = "#F7E3F0";

const KIND_LABEL: Record<GroupKind, string> = {
  faction: "Local faction",
  open: "Open space",
  private: "Private group",
};

const KIND_ICON: Record<GroupKind, keyof typeof Ionicons.glyphMap> = {
  faction: "shield-outline",
  open: "globe-outline",
  private: "lock-closed-outline",
};

function sentLabel(date: Date) {
  return `Sent ${date.toLocaleDateString([], { month: "long", day: "numeric" })} · ${date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  })}`;
}

export default function GroupInvite() {
  const styles = useThemedStyles(STYLE_PAIR);
  const ink = useInk();
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  const { code } = useLocalSearchParams<{ code: string }>();
  const inviteCode = Array.isArray(code) ? code[0] : code;

  const token = useAppSelector((state) => state.auth.token);

  const [preview, setPreview] = useState<GroupPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [intro, setIntro] = useState("");
  const [sent, setSent] = useState<{ text: string; at: Date } | null>(null);

  useEffect(() => {
    if (!token || !inviteCode) return;
    setLoading(true);
    getInvite(inviteCode, token)
      .then((result) => {
        setPreview(result);
        setError(null);
      })
      .catch((loadError) => {
        setError(loadError instanceof Error ? loadError.message : "This invite link isn't valid anymore.");
      })
      .finally(() => setLoading(false));
  }, [token, inviteCode]);

  const openChat = (id: string) => router.replace({ pathname: "/chat/[id]", params: { id } });

  const join = async () => {
    if (!token || !inviteCode || !preview || joining) return;
    try {
      setJoining(true);
      const result = await apiRequest<JoinResult>(`/api/groups/invite/${encodeURIComponent(inviteCode)}/join`, {
        method: "POST",
        body: intro.trim() ? { message: intro.trim() } : {},
        token,
      });

      if (result.joined || result.alreadyMember) {
        dispatch(fetchChats(token));
        openChat(result.groupId || preview.id);
      } else if (result.requested) {
        setSent({ text: intro.trim(), at: new Date() });
        setPreview({ ...preview, requestPending: true });
      }
    } catch (joinError) {
      Alert.alert("Group invitation", joinError instanceof Error ? joinError.message : "Couldn't join.");
    } finally {
      setJoining(false);
    }
  };

  const cancelRequest = () => {
    if (!token || !preview) return;
    Alert.alert("Cancel join request?", "You can ask again later.", [
      { text: "Keep request", style: "cancel" },
      {
        text: "Cancel request",
        style: "destructive",
        onPress: async () => {
          try {
            await cancelJoinRequest(preview.id, token);
            setSent(null);
            setPreview({ ...preview, requestPending: false });
          } catch (error) {
            Alert.alert("Cancel join request", error instanceof Error ? error.message : "Couldn't cancel it.");
          }
        },
      },
    ]);
  };

  const approval = preview?.joinMode === "approval";
  const pending = !!preview?.requestPending;
  // After a reload the introduction comes back from the server (M25).
  const myRequest = (preview as any)?.myRequest as { message?: string; createdAt?: string } | null | undefined;
  const shownIntro = sent ?? (myRequest?.message ? { text: myRequest.message, at: new Date(myRequest.createdAt || Date.now()) } : null);

  return (
    <View style={styles.screen}>
      <ScreenGradient />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <Pressable onPress={() => safeBack()} hitSlop={10} accessibilityLabel="Back">
            <Ionicons name="chevron-back" size={26} color={ink.text(INK)} />
          </Pressable>
          <View style={styles.flex}>
            <Text style={styles.title}>Group invitation</Text>
            <Text style={styles.subtitle}>Shared invite link</Text>
          </View>
          <Pressable onPress={() => safeBack()} hitSlop={10} accessibilityLabel="Close">
            <Ionicons name="close" size={26} color={ink.text(MUTED)} />
          </Pressable>
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={ink.text(PINK)} />
          </View>
        ) : error || !preview ? (
          <View style={styles.center}>
            <Ionicons name="link-outline" size={34} color={ink.text(MUTED)} />
            <Text style={styles.errorText}>{error || "This invite link isn't valid anymore."}</Text>
            <Pressable style={[styles.secondary, styles.errorButton]} onPress={() => safeBack()}>
              <Text style={styles.secondaryText}>Go back</Text>
            </Pressable>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 30 }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            <View style={styles.iconWrap}>
              {preview.photoUrl ? (
                <Image source={{ uri: preview.photoUrl }} style={styles.photo} contentFit="cover" />
              ) : (
                <View style={styles.icon}>
                  <Ionicons name={KIND_ICON[preview.kind]} size={44} color={ink.text(PINK)} />
                </View>
              )}
            </View>

            <Text style={styles.name}>{preview.name}</Text>
            <View style={styles.chip}>
              <Text style={styles.chipText}>
                {KIND_LABEL[preview.kind]} · {preview.memberCount} {preview.memberCount === 1 ? "member" : "members"}
              </Text>
            </View>
            {preview.description ? <Text style={styles.description}>{preview.description}</Text> : null}

            {preview.isMember ? (
              <Pressable style={styles.primary} onPress={() => openChat(preview.id)}>
                <Text style={styles.primaryText}>Open group chat</Text>
              </Pressable>
            ) : pending ? (
              <>
                {shownIntro?.text ? (
                  <>
                    <Text style={styles.section}>YOUR INTRODUCTION · SENT</Text>
                    <View style={styles.introCard}>
                      <Text style={styles.introText}>{shownIntro.text}</Text>
                      <Text style={styles.introTime}>{sentLabel(shownIntro.at)}</Text>
                    </View>
                  </>
                ) : null}

                <View style={styles.pending}>
                  <Ionicons name="time-outline" size={30} color={ink.text(PINK)} />
                  <Text style={styles.pendingTitle}>Request pending</Text>
                  <Text style={styles.pendingText}>
                    The group&apos;s admins will review your request. We&apos;ll notify you when you&apos;re approved.
                  </Text>
                  <Text style={styles.pendingNote}>Chat is available after approval</Text>
                  <Pressable onPress={cancelRequest} style={styles.cancelLink} hitSlop={6}>
                    <Text style={styles.cancelText}>Cancel join request</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                {approval ? (
                  <>
                    <Text style={styles.section}>YOUR INTRODUCTION</Text>
                    <TextInput
                      value={intro}
                      onChangeText={setIntro}
                      placeholder="Say hi and why you'd like to join (optional)"
                      placeholderTextColor={ink.text("#9AA3B5")}
                      multiline
                      maxLength={200}
                      style={styles.introInput}
                    />
                  </>
                ) : null}

                <Pressable style={[styles.primary, joining && styles.off]} disabled={joining} onPress={join}>
                  {joining ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.primaryText}>{approval ? "Ask to join" : "Join group"}</Text>
                  )}
                </Pressable>
              </>
            )}

            <Text style={styles.footnote}>
              {approval
                ? "You're joining through a shared link. An admin approves each request. Eligible faction members are added automatically."
                : "You're joining through a shared link. Eligible faction members are added automatically."}
            </Text>
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

const STYLE_PAIR = themedStyles({
  screen: { flex: 1 },

  flex: { flex: 1, minWidth: 0 },

  off: { opacity: 0.5 },

  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingBottom: 8 },

  title: { fontFamily: FONTS.semibold, fontSize: 22, lineHeight: 28, color: INK },

  subtitle: { marginTop: 2, fontFamily: FONTS.regular, fontSize: 12, color: MUTED },

  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 30 },

  errorText: { fontFamily: FONTS.regular, fontSize: 14, color: MUTED, textAlign: "center" },

  errorButton: { alignSelf: "stretch" },

  content: { paddingHorizontal: 18, paddingTop: 18 },

  iconWrap: { alignItems: "center" },

  icon: { width: 88, height: 88, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: PINK_SOFT },

  photo: { width: 88, height: 88, borderRadius: 22 },

  name: { marginTop: 18, fontFamily: FONTS.semibold, fontSize: 22, lineHeight: 28, color: INK, textAlign: "center" },

  chip: {
    alignSelf: "center",
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: "#F3DDED",
  },

  chipText: { fontFamily: FONTS.semibold, fontSize: 11, color: PINK },

  description: { marginTop: 14, fontFamily: FONTS.regular, fontSize: 14, lineHeight: 21, color: MUTED },

  section: { marginTop: 20, marginBottom: 8, fontFamily: FONTS.semibold, fontSize: 12, letterSpacing: 0.4, color: MUTED },

  introInput: {
    minHeight: 90,
    padding: 14,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "rgba(102,115,138,0.25)",
    fontFamily: FONTS.regular,
    fontSize: 15,
    color: INK,
    textAlignVertical: "top",
    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null),
  },

  introCard: {
    padding: 14,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "rgba(36,40,60,0.08)",
  },

  introText: { fontFamily: FONTS.regular, fontSize: 15, lineHeight: 22, color: INK },

  introTime: { marginTop: 8, fontFamily: FONTS.regular, fontSize: 11.5, color: MUTED },

  pending: { marginTop: 18, padding: 18, borderRadius: 20, backgroundColor: LILAC },

  pendingTitle: { marginTop: 10, fontFamily: FONTS.semibold, fontSize: 19, color: INK },

  pendingText: { marginTop: 8, fontFamily: FONTS.regular, fontSize: 14, lineHeight: 21, color: MUTED },

  pendingNote: { marginTop: 12, fontFamily: FONTS.semibold, fontSize: 13, color: PINK },

  cancelLink: { alignSelf: "center", marginTop: 18 },

  cancelText: { fontFamily: FONTS.semibold, fontSize: 15, color: PINK },

  primary: {
    marginTop: 20,
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

  footnote: { marginTop: 18, fontFamily: FONTS.regular, fontSize: 12, lineHeight: 17, color: MUTED },
});
