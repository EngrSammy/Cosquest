// ==========================================
// GROUP SETTINGS (Figma M27)
// ==========================================
// Group controls (admins): name/photo/description, joining & privacy.
// Your personal preferences: mute all group activity, mute thread activity
// only (coming soon), read receipts (your account-wide setting).
// Conversation: search chat history (coming soon), pinned messages & media.
// Management (admins): members & administrators, join requests,
// moderation & slow mode. Plus Leave group. Built from the screenshot.
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PinkSwitch } from "@/components/ui/PinkSwitch";
import { FONTS } from "@/constants/fonts";
import { getGroup, leaveGroup, muteGroup, type Group } from "@/services/groups";
import { getPrivacy, updatePrivacy } from "@/services/privacy";
import ExpertisePicker from "@/components/groups/ExpertisePicker";
import { setSparksMuted } from "@/services/chatPrefs";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { fetchChats } from "@/store/thunks/chatThunks";
import { safeBack } from "@/utils/safeBack";

const PINK = "#B63D91";
const INK = "#24283C";
const MUTED = "#66738A";
const PINK_SOFT = "#F7E3F0";
const LINE = "rgba(36,40,60,0.08)";

const KIND_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  faction: "shield-outline",
  open: "globe-outline",
  private: "lock-closed-outline",
};

function Row({
  title,
  hint,
  icon,
  onPress,
  right,
  last,
  danger,
}: {
  title: string;
  hint?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  right?: ReactNode;
  last?: boolean;
  danger?: boolean;
}) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={[styles.row, last && styles.rowLast]}>
      <View style={styles.flex}>
        <Text style={[styles.rowTitle, danger && styles.danger]}>{title}</Text>
        {hint ? <Text style={styles.rowHint}>{hint}</Text> : null}
      </View>
      {right ?? (icon ? <Ionicons name={icon} size={22} color={danger ? "#C0394B" : MUTED} /> : null)}
    </Pressable>
  );
}

export default function GroupSettings() {
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  const { id } = useLocalSearchParams<{ id: string }>();
  const groupId = Array.isArray(id) ? id[0] : id;

  const token = useAppSelector((state) => state.auth.token);
  const user = useAppSelector((state) => state.user.user) as any;
  const authUser = useAppSelector((state) => state.auth.user) as any;
  const myName = user?.profile?.username || authUser?.profile?.username || "You";
  // My mute for this group comes with the chat list.
  const chatRow = useAppSelector((state) =>
    (state.chat.conversations as any[]).find((chat) => String(chat.id) === String(groupId)),
  );

  const [group, setGroup] = useState<Group | null>(null);
  const [loading, setLoading] = useState(true);
  const [muted, setMuted] = useState(false);
  const [receipts, setReceipts] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [sparksMuted, setSparksMutedState] = useState(false);
  const [showExpertise, setShowExpertise] = useState(false);
  const [expertise, setExpertise] = useState<string | null>(user?.expertiseLabel || authUser?.expertiseLabel || null);

  useEffect(() => {
    setSparksMutedState(!!chatRow?.sparksMuted);
  }, [chatRow?.sparksMuted]);

  const toggleSparksMuted = async (next: boolean) => {
    if (!token || !groupId) return;
    setSparksMutedState(next);
    try {
      await setSparksMuted(groupId, next, token);
      dispatch(fetchChats(token));
    } catch (error) {
      setSparksMutedState(!next);
      Alert.alert("Mute thread activity", error instanceof Error ? error.message : "Couldn't change it.");
    }
  };

  useEffect(() => {
    setMuted(!!chatRow?.group?.muted);
  }, [chatRow?.group?.muted]);

  const load = useCallback(async () => {
    if (!token || !groupId) return;
    try {
      setLoading(true);
      const [result, privacy] = await Promise.all([getGroup(groupId, token), getPrivacy(token).catch(() => null)]);
      setGroup(result.group);
      if (privacy) setReceipts(privacy.readReceipts !== false);
    } catch (error) {
      Alert.alert("Group settings", error instanceof Error ? error.message : "Couldn't load the group.");
    } finally {
      setLoading(false);
    }
  }, [token, groupId]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleMute = async (next: boolean) => {
    if (!token || !groupId) return;
    setMuted(next);
    try {
      setBusy("mute");
      await muteGroup(groupId, next, "always", token);
      dispatch(fetchChats(token));
    } catch (error) {
      setMuted(!next);
      Alert.alert("Mute", error instanceof Error ? error.message : "Couldn't change it.");
    } finally {
      setBusy(null);
    }
  };

  const toggleReceipts = async (next: boolean) => {
    if (!token) return;
    setReceipts(next);
    try {
      setBusy("receipts");
      await updatePrivacy({ readReceipts: next }, token);
    } catch (error) {
      setReceipts(!next);
      Alert.alert("Read receipts", error instanceof Error ? error.message : "Couldn't change it.");
    } finally {
      setBusy(null);
    }
  };

  const confirmLeave = () => {
    if (!token || !group) return;
    Alert.alert(`Leave ${group.name}?`, "You can rejoin later if the group lets you.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Leave",
        style: "destructive",
        onPress: async () => {
          try {
            await leaveGroup(group.id, token);
            dispatch(fetchChats(token));
            router.replace("/home");
          } catch (error) {
            Alert.alert("Leave group", error instanceof Error ? error.message : "Couldn't leave.");
          }
        },
      },
    ]);
  };

  const comingSoon = (what: string) => Alert.alert(what, `${what} is coming soon.`);
  const openInfo = () => router.push({ pathname: "/group/[id]", params: { id: groupId } });
  const openChat = () => router.push({ pathname: "/chat/[id]", params: { id: groupId } });

  const admin = group?.myRole === "owner" || group?.myRole === "admin";
  const roleLabel = group?.myRole === "owner" ? "Owner" : group?.myRole === "admin" ? "Admin" : "Member";

  return (
    <LinearGradient colors={["#F6F9FE", "#E3F0FC"]} style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => safeBack()} hitSlop={10} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={26} color={INK} />
        </Pressable>
        <View style={styles.flex}>
          <Text style={styles.title}>Group settings</Text>
          {group ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {group.name}
            </Text>
          ) : null}
        </View>
        <Pressable onPress={() => safeBack()} hitSlop={10} accessibilityLabel="Close">
          <Ionicons name="close" size={26} color={MUTED} />
        </Pressable>
      </View>

      {loading && !group ? (
        <ActivityIndicator color={PINK} style={styles.loading} />
      ) : group ? (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 30 }]}
          showsVerticalScrollIndicator={false}>
          {/* GROUP HEADER */}
          <View style={styles.groupHead}>
            {group.photoUrl ? (
              <Image source={{ uri: group.photoUrl }} style={styles.groupPhoto} contentFit="cover" />
            ) : (
              <View style={styles.groupIcon}>
                <Ionicons name={KIND_ICON[group.kind] || "people-outline"} size={28} color={PINK} />
              </View>
            )}
            <View style={styles.flex}>
              <Text style={styles.groupName} numberOfLines={2}>
                {group.name}
              </Text>
              <View style={styles.chip}>
                <Text style={styles.chipText}>
                  {myName} · {roleLabel}
                </Text>
              </View>
            </View>
          </View>

          {/* GROUP CONTROLS (admins) */}
          {admin ? (
            <>
              <Text style={styles.section}>GROUP CONTROLS · ADMIN ONLY</Text>
              <View style={styles.card}>
                <Row title="Name, photo & description" hint="Edit the group profile" icon="pencil-outline" onPress={openInfo} />
                <Row
                  title="Joining & privacy"
                  hint={`${group.joinMode === "approval" ? "Admin approval" : "Instant join"} · limit ${group.sizeLimit} · list visible to ${group.memberListVisibility}`}
                  icon="chevron-forward"
                  onPress={() => router.push({ pathname: "/group/moderation/[id]", params: { id: groupId } })}
                />
                <Row
                  title="Administrators"
                  hint="Promote a member to admin"
                  icon="chevron-forward"
                  onPress={() => router.push({ pathname: "/group/admins/[id]", params: { id: groupId } })}
                />
                <Row
                  title="Manage Sparks"
                  hint="Pin, delete or merge Sparks"
                  icon="chevron-forward"
                  onPress={() => router.push({ pathname: "/group/sparks/[id]", params: { id: groupId } })}
                  last
                />
              </View>
            </>
          ) : null}

          {/* YOUR PERSONAL PREFERENCES */}
          <Text style={styles.section}>YOUR PERSONAL PREFERENCES</Text>
          <View style={styles.card}>
            <Row
              title="Mute all group activity"
              right={<PinkSwitch value={muted} onChange={toggleMute} disabled={busy === "mute"} />}
            />
            <Row
              title="Mute thread activity only"
              hint="Replies inside Sparks stay quiet · main chat stays audible"
              right={<PinkSwitch value={sparksMuted} onChange={toggleSparksMuted} />}
            />
            <Row
              title="Your expertise role"
              hint={expertise ? `${expertise} · shown under your name` : "Not set · e.g. Front-end, Design"}
              icon="chevron-forward"
              onPress={() => setShowExpertise(true)}
            />
            <Row
              title="Sparks AI on this phone"
              hint="Can this phone run the AI? Download it"
              icon="chevron-forward"
              onPress={() => router.push("/sparks-model")}
            />
            <Row
              title="Read receipts"
              hint={`Optional · currently ${receipts ? "on" : "off"} (all your chats)`}
              right={<PinkSwitch value={receipts} onChange={toggleReceipts} disabled={busy === "receipts"} />}
              last
            />
          </View>

          {/* CONVERSATION */}
          <Text style={styles.section}>CONVERSATION</Text>
          <View style={styles.card}>
            <Row
              title="Search chat history"
              icon="search-outline"
              onPress={() => router.push({ pathname: "/chat/search/[id]", params: { id: groupId } })}
            />
            <Row title="Pinned messages & media" hint="Open the chat to see pins" icon="pin-outline" onPress={openChat} />
            {!admin && group.canSeeMembers ? (
              <Row
                title="Members"
                hint={`${group.memberCount} members`}
                icon="chevron-forward"
                onPress={() => router.push({ pathname: "/group/members/[id]", params: { id: groupId } })}
              />
            ) : null}
            <Row title="Invite link" hint="Copy, share or reset" icon="link-outline" onPress={openInfo} last />
          </View>

          {/* MANAGEMENT (admins) */}
          {admin ? (
            <>
              <Text style={styles.section}>MANAGEMENT · ADMIN ONLY</Text>
              <View style={styles.card}>
                <Row
                  title="Members & administrators"
                  hint={`${group.memberCount} members`}
                  icon="chevron-forward"
                  onPress={() => router.push({ pathname: "/group/members/[id]", params: { id: groupId } })}
                />
                <Row
                  title="Join requests"
                  hint={group.pendingRequestCount ? `${group.pendingRequestCount} awaiting review` : "None waiting"}
                  icon="chevron-forward"
                  onPress={() => router.push({ pathname: "/group/requests/[id]", params: { id: groupId } })}
                />
                <Row
                  title="Moderation & slow mode"
                  hint={`Manage members and posting frequency${group.slowModeSeconds ? ` · slow mode ${group.slowModeSeconds}s` : ""}`}
                  icon="chevron-forward"
                  onPress={openInfo}
                  last
                />
              </View>
            </>
          ) : null}

          <View style={[styles.card, styles.leaveCard]}>
            <Row title="Leave group" icon="exit-outline" onPress={confirmLeave} danger last />
          </View>
        </ScrollView>
      ) : (
        <Text style={styles.empty}>This group isn't available.</Text>
      )}

      <ExpertisePicker
        visible={showExpertise}
        token={token || ""}
        current={expertise}
        onClose={() => setShowExpertise(false)}
        onSaved={setExpertise}
      />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },

  flex: { flex: 1, minWidth: 0 },

  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingBottom: 8 },

  title: { fontFamily: FONTS.semibold, fontSize: 22, lineHeight: 28, color: INK },

  subtitle: { marginTop: 2, fontFamily: FONTS.regular, fontSize: 12, color: MUTED },

  loading: { marginTop: 40 },

  empty: { marginTop: 40, textAlign: "center", fontFamily: FONTS.regular, fontSize: 14, color: MUTED },

  content: { paddingHorizontal: 18, paddingTop: 12 },

  groupHead: { flexDirection: "row", alignItems: "center", gap: 14 },

  groupIcon: { width: 64, height: 64, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: PINK_SOFT },

  groupPhoto: { width: 64, height: 64, borderRadius: 16 },

  groupName: { fontFamily: FONTS.semibold, fontSize: 17, color: INK },

  chip: {
    alignSelf: "flex-start",
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: "#F3DDED",
  },

  chipText: { fontFamily: FONTS.semibold, fontSize: 11, color: PINK },

  section: { marginTop: 22, marginBottom: 8, fontFamily: FONTS.semibold, fontSize: 12, letterSpacing: 0.4, color: MUTED },

  card: { paddingHorizontal: 14, borderRadius: 18, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: LINE },

  leaveCard: { marginTop: 22 },

  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: LINE },

  rowLast: { borderBottomWidth: 0 },

  rowTitle: { fontFamily: FONTS.semibold, fontSize: 15, color: INK },

  rowHint: { marginTop: 2, fontFamily: FONTS.regular, fontSize: 12, lineHeight: 17, color: MUTED },

  danger: { color: "#C0394B" },
});
