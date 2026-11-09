// ==========================================
// GROUP SETTINGS (Figma M27)
// ==========================================
// In the design's order: the group header ("Sarthak · Owner"); GROUP
// CONTROLS · ADMIN ONLY (name, photo & description; joining & privacy);
// YOUR PERSONAL PREFERENCES (mute all, mute thread activity only, read
// receipts); CONVERSATION (search, pinned messages & media); MANAGEMENT ·
// ADMIN ONLY (members & administrators, join requests, moderation & slow
// mode) - or a plain "Members" row for everyone else. Things the design
// doesn't show (Manage Sparks, Sparks AI, administrators, your expertise
// role, invite link, leave group) follow under SPARKS and MORE.
//
// Built from the shared admin pieces (components/groups/AdminUi.tsx), so it
// follows light and dark mode (constants/chatTheme.ts) like the chat.
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useContext, useEffect, useState } from "react";
import { Alert, Text, View } from "react-native";

import { UI } from "@/components/chat/ui";
import { AdminEmbedded, AdminScreen, InlineSection, Card, Section, SettingsRow } from "@/components/groups/AdminUi";
import DesktopGroupWorkspace, { GROUP_WORKSPACES } from "@/components/desktop/DesktopGroupWorkspace";
import { useIsDesktop } from "@/hooks/useDesktop";
import GroupMembers from "@/app/group/members/[id]";
import JoinRequests from "@/app/group/requests/[id]";
import ExpertisePicker from "@/components/groups/ExpertisePicker";
import JoiningPrivacy from "@/app/group/privacy/[id]";
import Moderation from "@/app/group/moderation/[id]";
import ManageSparks from "@/app/group/sparks/[id]";
import Administrators from "@/app/group/admins/[id]";
import SettingsSections from "@/components/groups/SettingsSections";
import { PinkSwitch } from "@/components/ui/PinkSwitch";
import { themedStyles, useInk, useThemedStyles } from "@/constants/chatTheme";
import { FONTS } from "@/constants/fonts";

import { getExpertiseRoles, setSparksMuted } from "@/services/chatPrefs";
import { getGroup, getGroupMembers, leaveGroup, muteGroup, type Group } from "@/services/groups";
import { getPrivacy, updatePrivacy } from "@/services/privacy";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { fetchChats } from "@/store/thunks/chatThunks";

const KIND_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  faction: "shield-outline",
  open: "globe-outline",
  private: "lock-closed-outline",
};

function plural(count: number, word: string) {
  return `${count} ${count === 1 ? word : `${word}s`}`;
}

// "Admin approval · limit 100 · members only"
function joiningHint(group: Group) {
  const joining =
    group.kind === "faction" ? "Faction members" : group.joinMode === "approval" ? "Admin approval" : "Anyone can join";
  const list = group.memberListVisibility === "admins" ? "admins only" : "members only";
  return `${joining} · limit ${group.sizeLimit} · ${list}`;
}

const SETTINGS_IN_COLUMNS = false;

export default function GroupSettings() {
  // Tapping a section opens it right here; tapping again closes it.
  const [openSection, setOpenSection] = useState<string | null>(null);
  const toggleSection = (key: string) => setOpenSection((current) => (current === key ? null : key));
  const SECTION_TITLES: Record<string, string> = {
    privacy: "Joining & privacy",
    members: "Members & administrators",
    requests: "Join requests",
    moderation: "Moderation & slow mode",
    sparks: "Manage Sparks",
    admins: "Administrators",
  };
  const sectionBody = (key: string | null) =>
    key === "privacy" ? (
      <JoiningPrivacy />
    ) : key === "members" ? (
      <GroupMembers />
    ) : key === "requests" ? (
      <JoinRequests />
    ) : key === "moderation" ? (
      <Moderation />
    ) : key === "sparks" ? (
      <ManageSparks />
    ) : key === "admins" ? (
      <Administrators />
    ) : null;
  // Computer (Figma D6): settings | members | join requests side by side.
  const desktop = useIsDesktop();
  const embedded = useContext(AdminEmbedded);
  const styles = useThemedStyles(STYLE_PAIR);
  const ink = useInk();
  const dispatch = useAppDispatch();
  const { id } = useLocalSearchParams<{ id: string }>();
  const groupId = Array.isArray(id) ? id[0] : id;

  const token = useAppSelector((state) => state.auth.token);
  const user = useAppSelector((state) => state.user.user) as any;
  const authUser = useAppSelector((state) => state.auth.user) as any;
  const myName =
    user?.profile?.firstName ||
    authUser?.profile?.firstName ||
    user?.profile?.username ||
    authUser?.profile?.username ||
    "You";
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
  // "2 administrators" (null = unknown, so it's left out).
  const [adminCount, setAdminCount] = useState<number | null>(null);
  const [expertise, setExpertise] = useState<string | null>(user?.expertiseLabel || authUser?.expertiseLabel || null);

  // Your profile keeps the role as a code ("front_end") or a name
  // ("Front-end"); show its name, as the picker does.
  const savedExpertise = user?.expertise || authUser?.expertise || null;
  useEffect(() => {
    if (expertise || !savedExpertise) return;
    getExpertiseRoles()
      .then((roles) => {
        const found = roles.find((role) => role.key === savedExpertise || role.label === savedExpertise);
        if (found) setExpertise(found.label);
      })
      .catch(() => {});
  }, [savedExpertise, expertise]);

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

  // Count the owner/admins with ONE request (up to 100 people). Bigger
  // groups would need many pages, so the count is left out for them unless
  // the backend sends it with the group.
  const isAdmin = group?.myRole === "owner" || group?.myRole === "admin";
  const sentAdminCount = Number((group as any)?.adminCount);
  useEffect(() => {
    if (!token || !groupId || !isAdmin) return;
    if (Number.isFinite(sentAdminCount) && sentAdminCount > 0) {
      setAdminCount(sentAdminCount);
      return;
    }
    let cancelled = false;
    getGroupMembers(groupId, { limit: 100 }, token)
      .then((result) => {
        if (cancelled || result.hasMore) return;
        setAdminCount(result.members.filter((member) => member.role === "owner" || member.role === "admin").length);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [token, groupId, isAdmin, sentAdminCount]);

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

  const openInfo = () => router.push({ pathname: "/group/[id]", params: { id: groupId } });
  const openChat = () => router.push({ pathname: "/chat/[id]", params: { id: groupId } });

  const admin = isAdmin;
  const roleLabel = group?.myRole === "owner" ? "Owner" : group?.myRole === "admin" ? "Admin" : "Member";

  // Its own list | section panes replace the side-by-side columns here.
  if (SETTINGS_IN_COLUMNS && desktop && !embedded) {
    return (
      <DesktopGroupWorkspace
        title={group?.name || "Group settings"}
        subtitle="Settings / Members · faction rank is not chat authority"
        chip={group ? `${myName} · ${roleLabel}` : undefined}
        columns={[
          <GroupSettings key="settings" />,
          ...(group?.canSeeMembers !== false || admin ? [<GroupMembers key="members" />] : []),
          ...(admin ? [<JoinRequests key="requests" />] : []),
        ]}
      />
    );
  }

  const settingsList = (
    <AdminScreen title="Group settings" subtitle={group?.name} loading={loading && !group}>
      {group ? (
        <>
            {/* GROUP HEADER */}
            <View style={styles.groupHead}>
              {group.photoUrl ? (
                <Image source={{ uri: group.photoUrl }} style={styles.groupPhoto} contentFit="cover" />
              ) : (
                <View style={styles.groupIcon}>
                  <Ionicons name={KIND_ICON[group.kind] || "people-outline"} size={28} color={ink.text(UI.PINK)} />
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
                <Section>GROUP CONTROLS · ADMIN ONLY</Section>
                <Card>
                  <SettingsRow title="Name, photo & description" hint="Edit the group profile" icon="pencil-outline" onPress={openInfo} />
                  <SettingsRow
                    title="Joining & privacy"
                    hint={joiningHint(group)}
                    icon="chevron-forward"
                    onPress={() => toggleSection("privacy")}
                    last
                  
                />
                </Card>
              </>
            ) : null}

            {/* YOUR PERSONAL PREFERENCES */}
            <Section>YOUR PERSONAL PREFERENCES</Section>
            <Card>
              <SettingsRow
                title="Mute all group activity"
                right={<PinkSwitch value={muted} onChange={toggleMute} disabled={busy === "mute"} />}
              />
              <SettingsRow
                title="Mute thread activity only"
                hint="Main chat stays audible"
                right={<PinkSwitch value={sparksMuted} onChange={toggleSparksMuted} />}
              />
              <SettingsRow
                title="Read receipts"
                hint={`Optional · currently ${receipts ? "on" : "off"}`}
                right={<PinkSwitch value={receipts} onChange={toggleReceipts} disabled={busy === "receipts"} />}
                last
              />
            </Card>

            {/* CONVERSATION */}
            <Section>CONVERSATION</Section>
            <Card>
              <SettingsRow
                title="Search chat history"
                icon="search-outline"
                onPress={() => router.push({ pathname: "/chat/search/[id]", params: { id: groupId } })}
              />
              <SettingsRow title="Pinned messages & media" hint="Open the chat to see pins" icon="pin-outline" onPress={openChat} last />
            </Card>

            {/* MANAGEMENT (admins) / MEMBERS (everyone else) */}
            {admin ? (
              <>
                <Section>MANAGEMENT · ADMIN ONLY</Section>
                <Card>
                  <SettingsRow
                    title="Members & administrators"
                    hint={`${plural(group.memberCount, "member")}${adminCount !== null ? ` · ${plural(adminCount, "administrator")}` : ""}`}
                    icon="chevron-forward"
                    onPress={() => toggleSection("members")}
                  
                />
                  <SettingsRow
                    title="Join requests"
                    hint={`${group.pendingRequestCount} awaiting review`}
                    icon="chevron-forward"
                    onPress={() => toggleSection("requests")}
                  
                />
                  <SettingsRow
                    title="Moderation & slow mode"
                    hint="Manage members and posting frequency"
                    icon="chevron-forward"
                    onPress={() => toggleSection("moderation")}
                    last
                  
                />
                </Card>
              </>
            ) : group.canSeeMembers !== false ? (
              <>
                <Section>MEMBERS</Section>
                <Card>
                  <SettingsRow
                    title="Members"
                    hint={plural(group.memberCount, "member")}
                    icon="chevron-forward"
                    onPress={() => toggleSection("members")}
                    last
                  
                />
                </Card>
              </>
            ) : null}

            {/* SPARKS */}
            <Section>SPARKS</Section>
            <Card>
              {admin ? (
                <SettingsRow
                  title="Manage Sparks"
                  hint="Pin, delete or merge Sparks"
                  icon="chevron-forward"
                  onPress={() => toggleSection("sparks")}
                
                />
              ) : null}
              <SettingsRow
                title="Sparks AI on this phone"
                hint="Can this phone run the AI? Download it"
                icon="chevron-forward"
                onPress={() => router.push("/sparks-model")}
                last
              />
            </Card>

            {/* MORE */}
            <Section>MORE</Section>
            <Card>
              {admin ? (
                <SettingsRow
                  title="Administrators"
                  hint="Promote a member to admin"
                  icon="chevron-forward"
                  onPress={() => toggleSection("admins")}
                
                />
              ) : null}
              <SettingsRow
                title="Your expertise role"
                hint={expertise ? `${expertise} · shown under your name` : "Not set · e.g. Front-end, Design"}
                icon="chevron-forward"
                onPress={() => setShowExpertise(true)}
              />
              <SettingsRow title="Invite link" hint="Copy, share or reset" icon="link-outline" onPress={openInfo} />
              <SettingsRow title="Leave group" icon="exit-outline" onPress={confirmLeave} danger last />
            </Card>
        </>
      ) : (
        <Text style={styles.empty}>This group isn&apos;t available.</Text>
      )}

      <ExpertisePicker
        visible={showExpertise}
        token={token || ""}
        current={expertise}
        onClose={() => setShowExpertise(false)}
        onSaved={setExpertise}
      />
    </AdminScreen>
  );

  return (
    <SettingsSections
      split={desktop && !embedded}
      section={sectionBody(openSection)}
      sectionTitle={openSection ? SECTION_TITLES[openSection] : undefined}
      onClose={() => setOpenSection(null)}>
      {settingsList}
    </SettingsSections>
  );
}

// Only the group header is local; everything else is the shared admin pieces.
const STYLE_PAIR = themedStyles(
  {
    flex: { flex: 1, minWidth: 0 },
    empty: { marginTop: 40, textAlign: "center", fontFamily: FONTS.regular, fontSize: 14, color: UI.MUTED },
    groupHead: { flexDirection: "row", alignItems: "center", gap: 14 },
    groupIcon: {
      width: 64,
      height: 64,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#F7E3F0",
    },
    groupPhoto: { width: 64, height: 64, borderRadius: 16 },
    groupName: { fontFamily: FONTS.semibold, fontSize: 17, color: UI.INK },
    chip: {
      alignSelf: "flex-start",
      marginTop: 6,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
      backgroundColor: "#F3DDED",
    },
    chipText: { fontFamily: FONTS.semibold, fontSize: 11, color: UI.PINK },
  },
  {
    empty: { color: "#B5BBCB" },
    groupIcon: { backgroundColor: "#40283B" },
    groupName: { color: "#F4F5FA" },
    chip: { backgroundColor: "#40283B" },
    chipText: { color: "#F0A6D7" },
  },
);
