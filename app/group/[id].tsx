// ==========================================
// GROUP INFO
// ==========================================
// Opened by tapping the group's name in the chat header (or from a link).
// Members see the group, members (with Owner / Admin labels), the invite
// link, mute and leave. Admins also edit the group, change its settings
// (incl. slow mode), answer join requests, and tap a member to make them
// admin, mute, remove or ban them; banned people can be unbanned.
// People who aren't in an open group see a preview with a Join button.
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
      ActivityIndicator,
      Alert,
      Modal,
      Pressable,
      ScrollView,
      Share,
      StyleSheet,
      Text,
      TextInput,
      View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
      GroupAvatar,
      GroupRow,
      GroupScreen,
      INK,
      MILKY,
      MUTED,
      OptionSelector,
      PINK,
      SectionLabel,
      groupStyles,
} from "@/components/groups/GroupUi";
import PeoplePicker, { personKey } from "@/components/groups/PeoplePicker";
import { FONTS } from "@/constants/fonts";
import { userIdFromToken } from "@/services/calls";
import {
      SKIP_REASON_TEXT,
      SLOW_MODE_OPTIONS,
      addGroupMembers,
      answerJoinRequest,
      banMember,
      canActOn,
      getBans,
      getGroup,
      getGroupMembers,
      getJoinRequests,
      inviteLinkFor,
      joinGroup,
      leaveGroup,
      muteGroup,
      muteMember,
      mutedUntilText,
      removeMember,
      resetInviteLink,
      setMemberRole,
      unbanMember,
      unmuteMember,
      updateGroup,
      type Group,
      type GroupBanEntry,
      type GroupMember,
      type GroupPerson,
      type GroupPreview,
      type JoinRequest,
      type MemberMuteDuration,
} from "@/services/groups";
import { getSocket } from "@/services/socket";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { fetchChats, fetchConversation } from "@/store/thunks/chatThunks";
import { getAvatarSource } from "@/utils/callHelpers";
import { safeBack } from "@/utils/safeBack";

const KIND_LABEL = {
  private: "Private group",
  open: "Open community",
  faction: "Faction group",
} as const;
const ROLE_LABEL = { owner: "Owner", admin: "Admin", member: "" } as const;

function errorText(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return fallback;
}

export default function GroupInfo() {
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  const { id } = useLocalSearchParams<{ id: string }>();
  const groupId = Array.isArray(id) ? id[0] : id;

  const token = useAppSelector((state) => state.auth.token);
  const chatSummary = useAppSelector(
    (state) =>
      (state.chat.conversationDetails[groupId] ||
        state.chat.conversations.find((chat) => chat.id === groupId)) as any,
  );
  const muted = !!chatSummary?.group?.muted;

  const [group, setGroup] = useState<Group | null>(null);
  const [preview, setPreview] = useState<GroupPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [members, setMembers] = useState<GroupMember[]>([]);
  const [memberTotal, setMemberTotal] = useState(0);
  const [memberPage, setMemberPage] = useState(1);
  const [membersHasMore, setMembersHasMore] = useState(false);

  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [showRequests, setShowRequests] = useState(false);

  const [showAdd, setShowAdd] = useState(false);
  const [toAdd, setToAdd] = useState<Record<string, GroupPerson>>({});

  // Admin actions on one member, and the banned list.
  const [actingOn, setActingOn] = useState<GroupMember | null>(null);
  const [showMuteChoices, setShowMuteChoices] = useState(false);
  const [bans, setBans] = useState<GroupBanEntry[]>([]);
  const [showBans, setShowBans] = useState(false);

  const myUserId =
    useAppSelector((state) => state.call.myUserId) || userIdFromToken(token);

  const [showEdit, setShowEdit] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editSize, setEditSize] = useState("");

  // ---------- LOAD ----------

  const loadMembers = useCallback(
    async (page = 1) => {
      if (!token || !groupId) return;
      try {
        const result = await getGroupMembers(groupId, { page }, token);
        setMembers((current) =>
          page === 1 ? result.members : [...current, ...result.members],
        );
        setMemberTotal(result.total);
        setMembersHasMore(result.hasMore);
        setMemberPage(page);
      } catch {
        // Not allowed to see them (admins only) - the section explains.
      }
    },
    [groupId, token],
  );

  const load = useCallback(async () => {
    if (!token || !groupId) return;
    try {
      setLoadError(null);
      const result = await getGroup(groupId, token);
      setGroup(result.group);
      setPreview(result.preview);

      if (result.group?.canSeeMembers) {
        loadMembers(1);
      }
      if (result.group?.canEdit && result.group.pendingRequestCount > 0) {
        setRequests(await getJoinRequests(groupId, token));
      } else {
        setRequests([]);
      }
    } catch (error) {
      setLoadError(errorText(error, "Couldn't load this group."));
    } finally {
      setLoading(false);
    }
  }, [groupId, token, loadMembers]);

  useEffect(() => {
    load();
  }, [load]);

  // Live: someone joined/left, settings changed, a join request arrived.
  useEffect(() => {
    const socket = getSocket();
    if (!socket || !groupId) return;

    const handle = (payload: { conversationId?: string }) => {
      if (payload?.conversationId === groupId) load();
    };

    socket.on("group:updated", handle);
    return () => {
      socket.off("group:updated", handle);
    };
  }, [groupId, load]);

  const refreshChat = () => {
    if (token && groupId)
      dispatch(fetchConversation({ conversationId: groupId, token }));
  };

  // ---------- ACTIONS ----------

  const save = async (
    changes: Parameters<typeof updateGroup>[1],
    photo: Parameters<typeof updateGroup>[2] = null,
  ) => {
    if (!token || !group) return false;
    try {
      setBusy("save");
      const updated = await updateGroup(group.id, changes, photo, token);
      setGroup(updated);
      refreshChat();
      return true;
    } catch (error) {
      Alert.alert("Group", errorText(error, "Couldn't save the change."));
      return false;
    } finally {
      setBusy(null);
    }
  };

  const changePhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Photo permission",
        "Please allow CosQuest to access your photos.",
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    await save(
      {},
      {
        uri: asset.uri,
        name: asset.fileName || "group-photo.jpg",
        type: asset.mimeType || "image/jpeg",
      },
    );
  };

  const openEdit = () => {
    if (!group) return;
    setEditName(group.name);
    setEditDescription(group.description);
    setEditSize(String(group.sizeLimit));
    setShowEdit(true);
  };

  const saveEdit = async () => {
    const changes: Parameters<typeof updateGroup>[1] = {
      name: editName.trim(),
      description: editDescription.trim(),
    };
    if (group?.kind !== "faction")
      changes.sizeLimit = Number(editSize) || group?.sizeLimit;
    if (await save(changes)) setShowEdit(false);
  };

  const link = group ? inviteLinkFor(group) : null;

  const copyLink = async () => {
    if (!link) return;
    await Clipboard.setStringAsync(link);
    Alert.alert(
      "Invite link",
      "Link copied. Send it to anyone you want to invite.",
    );
  };

  const shareLink = async () => {
    if (!link || !group) return;
    try {
      await Share.share({
        message: `Join "${group.name}" on CosQuest: ${link}`,
      });
    } catch {
      copyLink();
    }
  };

  const confirmResetLink = () => {
    if (!token || !group) return;
    Alert.alert(
      "Reset invite link?",
      "The current link will stop working. Anyone who already joined stays in.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: async () => {
            try {
              const info = await resetInviteLink(group.id, token);
              setGroup({ ...group, ...info });
            } catch (error) {
              Alert.alert(
                "Invite link",
                errorText(error, "Couldn't reset the link."),
              );
            }
          },
        },
      ],
    );
  };

  const addPeople = async () => {
    const people = Object.values(toAdd);
    if (!token || !group || !people.length) return;
    try {
      setBusy("add");
      const result = await addGroupMembers(
        group.id,
        people.map((p) => p.id),
        token,
      );
      setGroup(result.group);
      setShowAdd(false);
      setToAdd({});
      loadMembers(1);
      refreshChat();
      if (result.skipped.length) {
        Alert.alert(
          result.added.length
            ? "Some people weren't added"
            : "Nobody was added",
          result.skipped
            .map(
              (item) =>
                `@${people.find((p) => p.id === item.userId)?.username || item.username || "Someone"} ${SKIP_REASON_TEXT[item.reason] || "couldn't be added"}.`,
            )
            .join("\n"),
        );
      }
    } catch (error) {
      Alert.alert("Add people", errorText(error, "Couldn't add people."));
    } finally {
      setBusy(null);
    }
  };

  const answer = async (request: JoinRequest, approve: boolean) => {
    if (!token || !group) return;
    try {
      setBusy(request.id);
      await answerJoinRequest(group.id, request.id, approve, token);
      setRequests((current) =>
        current.filter((item) => item.id !== request.id),
      );
      load();
    } catch (error) {
      Alert.alert(
        "Join request",
        errorText(error, "Couldn't answer the request."),
      );
    } finally {
      setBusy(null);
    }
  };

  const chooseMute = () => {
    if (!token || !groupId) return;

    const doMute = async (
      on: boolean,
      duration: "8h" | "1w" | "always" = "always",
    ) => {
      try {
        await muteGroup(groupId, on, duration, token);
        refreshChat();
      } catch (error) {
        Alert.alert("Mute", errorText(error, "Couldn't change mute."));
      }
    };

    if (muted) {
      Alert.alert("Unmute group?", undefined, [
        { text: "Cancel", style: "cancel" },
        { text: "Unmute", onPress: () => doMute(false) },
      ]);
      return;
    }

    Alert.alert("Mute group", "You'll still see messages, without the noise.", [
      { text: "8 hours", onPress: () => doMute(true, "8h") },
      { text: "1 week", onPress: () => doMute(true, "1w") },
      { text: "Always", onPress: () => doMute(true, "always") },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const confirmLeave = () => {
    if (!token || !group) return;
    Alert.alert(
      `Leave ${group.name}?`,
      group.myRole === "owner"
        ? "You're the owner. The longest-serving admin (or member) will become the owner."
        : undefined,
      [
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
              Alert.alert(
                "Leave group",
                errorText(error, "Couldn't leave the group."),
              );
            }
          },
        },
      ],
    );
  };

  const join = async () => {
    if (!token || !preview) return;
    try {
      setBusy("join");
      const result = await joinGroup(preview.id, token);
      if (result.joined) {
        dispatch(fetchChats(token));
        router.replace({ pathname: "/chat/[id]", params: { id: preview.id } });
      } else if (result.requested) {
        setPreview({ ...preview, requestPending: true });
        Alert.alert(
          "Request sent",
          "An admin will review your request to join.",
        );
      }
    } catch (error) {
      Alert.alert("Join", errorText(error, "Couldn't join the group."));
    } finally {
      setBusy(null);
    }
  };

  // ---------- ADMIN ACTIONS (Phase 3) ----------

  const openMemberActions = (member: GroupMember) => {
    if (!group || member.id === myUserId) return;
    setShowMuteChoices(false);
    setActingOn(member);
  };

  const runAdminAction = async (
    label: string,
    action: () => Promise<unknown>,
  ) => {
    try {
      setBusy("member");
      await action();
      setActingOn(null);
      setShowMuteChoices(false);
      await load();
    } catch (error) {
      Alert.alert(
        label,
        errorText(error, "That didn't work. Please try again."),
      );
    } finally {
      setBusy(null);
    }
  };

  const confirmRemove = (member: GroupMember) => {
    if (!token || !group) return;
    Alert.alert(
      `Remove @${member.username}?`,
      "They can be added again later.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () =>
            runAdminAction("Remove", () =>
              removeMember(group.id, member.id, token),
            ),
        },
      ],
    );
  };

  const confirmBan = (member: GroupMember) => {
    if (!token || !group) return;
    Alert.alert(
      `Ban @${member.username}?`,
      "They'll be removed and can't come back (even with the invite link) until an admin unbans them.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Ban",
          style: "destructive",
          onPress: () =>
            runAdminAction("Ban", () =>
              banMember(group.id, member.id, "", token),
            ),
        },
      ],
    );
  };

  const openBans = async () => {
    if (!token || !group) return;
    try {
      setBusy("bans");
      setBans(await getBans(group.id, token));
      setShowBans(true);
    } catch (error) {
      Alert.alert("Banned people", errorText(error, "Couldn't load the list."));
    } finally {
      setBusy(null);
    }
  };

  const unban = async (entry: GroupBanEntry) => {
    if (!token || !group) return;
    try {
      setBusy(`unban-${entry.user.id}`);
      await unbanMember(group.id, entry.user.id, token);
      setBans((current) =>
        current.filter((item) => item.user.id !== entry.user.id),
      );
      load();
    } catch (error) {
      Alert.alert("Unban", errorText(error, "Couldn't unban."));
    } finally {
      setBusy(null);
    }
  };

  const memberIds = useMemo(
    () => members.map((member) => member.id),
    [members],
  );

  // ---------- RENDER ----------

  if (loading) {
    return (
      <GroupScreen title="Group info" onBack={() => safeBack()}>
        <View style={styles.center}>
          <ActivityIndicator color={PINK} />
        </View>
      </GroupScreen>
    );
  }

  if (loadError || (!group && !preview)) {
    return (
      <GroupScreen title="Group info" onBack={() => safeBack()}>
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={34} color="#9C9CAA" />
          <Text style={styles.centerText}>
            {loadError || "This group isn't available."}
          </Text>
        </View>
      </GroupScreen>
    );
  }

  // Not in this (open) group yet: preview + Join.
  if (!group && preview) {
    return (
      <GroupScreen title="Group" onBack={() => safeBack()}>
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            { paddingBottom: insets.bottom + 40 },
          ]}>
          <View style={styles.hero}>
            <GroupAvatar
              name={preview.name}
              photoUrl={preview.photoUrl}
              size={110}
            />
            <Text style={styles.name}>{preview.name}</Text>
            <Text style={styles.meta}>
              {KIND_LABEL[preview.kind]} · {preview.memberCount}{" "}
              {preview.memberCount === 1 ? "member" : "members"}
            </Text>
            {preview.description ? (
              <Text style={styles.description}>{preview.description}</Text>
            ) : null}
          </View>

          <Pressable
            style={[
              groupStyles.primaryButton,
              (preview.requestPending || busy === "join") &&
                groupStyles.primaryButtonOff,
            ]}
            onPress={join}
            disabled={preview.requestPending || busy === "join"}>
            {busy === "join" ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={groupStyles.primaryButtonText}>
                {preview.requestPending
                  ? "Request sent"
                  : preview.joinMode === "approval"
                    ? "Ask to join"
                    : "Join group"}
              </Text>
            )}
          </Pressable>
        </ScrollView>
      </GroupScreen>
    );
  }

  const g = group!;

  return (
    <GroupScreen
      title="Group info"
      onBack={() => safeBack()}
      right={
        g.canEdit ? (
          <Pressable onPress={openEdit} hitSlop={10}>
            <Text style={styles.editText}>Edit</Text>
          </Pressable>
        ) : null
      }>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: insets.bottom + 40 },
        ]}
        showsVerticalScrollIndicator={false}>
        {/* HERO */}
        <View style={styles.hero}>
          <Pressable
            onPress={g.canEdit ? changePhoto : undefined}
            disabled={!g.canEdit}
            style={styles.photoWrap}>
            <GroupAvatar name={g.name} photoUrl={g.photoUrl} size={110} />
            {g.canEdit ? (
              <View style={styles.cameraChip}>
                {busy === "save" ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Ionicons name="camera" size={15} color="#FFFFFF" />
                )}
              </View>
            ) : null}
          </Pressable>

          <Text style={styles.name}>{g.name}</Text>
          <Text style={styles.meta}>
            {g.kind === "faction" && g.factionName
              ? `${g.factionName} faction group`
              : KIND_LABEL[g.kind]}{" "}
            · {g.memberCount} {g.memberCount === 1 ? "member" : "members"}
          </Text>
          {g.description ? (
            <Text style={styles.description}>{g.description}</Text>
          ) : null}

          {g.myMutedUntil ? (
            <View style={styles.mutedNote}>
              <Ionicons name="volume-mute" size={14} color="#B5562C" />
              <Text style={styles.mutedNoteText}>
                An admin muted you {mutedUntilText(g.myMutedUntil)}. You can
                read but not send.
              </Text>
            </View>
          ) : null}

          <Pressable
            style={styles.messagePill}
            onPress={() =>
              router.push({ pathname: "/chat/[id]", params: { id: g.id } })
            }>
            <Ionicons
              name="chatbubble-ellipses-outline"
              size={16}
              color={PINK}
            />
            <Text style={styles.messagePillText}>Open chat</Text>
          </Pressable>
        </View>

        {/* JOIN REQUESTS (admins) */}
        {g.canEdit && requests.length > 0 ? (
          <>
            <SectionLabel>JOIN REQUESTS</SectionLabel>
            <GroupRow
              icon="person-add-outline"
              label={`${requests.length} ${requests.length === 1 ? "person wants" : "people want"} to join`}
              detail="Tap to approve or decline"
              onPress={() => setShowRequests(true)}
            />
          </>
        ) : null}

        {/* INVITE LINK */}
        {link ? (
          <>
            <SectionLabel>INVITE LINK</SectionLabel>
            <View style={styles.linkBox}>
              <Ionicons name="link" size={18} color={PINK} />
              <Text style={styles.linkText} numberOfLines={1}>
                {link}
              </Text>
            </View>
            <View style={styles.linkActions}>
              <Pressable style={styles.linkButton} onPress={copyLink}>
                <Ionicons name="copy-outline" size={16} color={PINK} />
                <Text style={styles.linkButtonText}>Copy</Text>
              </Pressable>
              <Pressable style={styles.linkButton} onPress={shareLink}>
                <Ionicons name="share-social-outline" size={16} color={PINK} />
                <Text style={styles.linkButtonText}>Share</Text>
              </Pressable>
              {g.canEdit ? (
                <Pressable style={styles.linkButton} onPress={confirmResetLink}>
                  <Ionicons name="refresh" size={16} color={PINK} />
                  <Text style={styles.linkButtonText}>Reset</Text>
                </Pressable>
              ) : null}
            </View>
            <Text style={[groupStyles.hint, styles.hintGap]}>
              {g.joinMode === "approval"
                ? "People who open the link ask to join; an admin approves them."
                : "Anyone with the link can join straight away."}
            </Text>
          </>
        ) : null}

        {/* MEMBERS */}
        <SectionLabel>
          {g.memberCount} {g.memberCount === 1 ? "MEMBER" : "MEMBERS"}
        </SectionLabel>

        {g.canAddPeople ? (
          <View style={styles.gapBottom}>
            <GroupRow
              icon="person-add"
              label="Add people"
              onPress={() => setShowAdd(true)}
            />
          </View>
        ) : null}

        {g.canSeeMembers ? (
          <View style={styles.memberCard}>
            {members.map((member) => (
              <Pressable
                key={member.id}
                style={styles.memberRow}
                disabled={!g.canEdit || member.id === myUserId}
                onPress={() => openMemberActions(member)}>
                <Image
                  source={getAvatarSource(member)}
                  style={styles.memberAvatar}
                  contentFit="cover"
                />
                <View style={styles.memberText}>
                  <Text style={styles.memberName} numberOfLines={1}>
                    {member.id === myUserId
                      ? "You"
                      : member.name || member.username}
                  </Text>
                  <Text style={styles.memberUsername} numberOfLines={1}>
                    @{member.username}
                    {member.mutedUntil
                      ? ` · Muted ${mutedUntilText(member.mutedUntil)}`
                      : ""}
                  </Text>
                </View>
                {member.mutedUntil ? (
                  <Ionicons
                    name="volume-mute"
                    size={15}
                    color="#9C9CAA"
                    style={styles.mutedIcon}
                  />
                ) : null}
                {ROLE_LABEL[member.role] ? (
                  <View
                    style={[
                      styles.roleBadge,
                      member.role === "owner" && styles.ownerBadge,
                    ]}>
                    <Text
                      style={[
                        styles.roleText,
                        member.role === "owner" && styles.ownerText,
                      ]}>
                      {ROLE_LABEL[member.role]}
                    </Text>
                  </View>
                ) : null}
              </Pressable>
            ))}

            {membersHasMore ? (
              <Pressable
                style={styles.moreButton}
                onPress={() => loadMembers(memberPage + 1)}>
                <Text style={styles.moreText}>
                  Show more ({memberTotal - members.length})
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <Text style={groupStyles.hint}>
            Only admins can see the member list of this group.
          </Text>
        )}

        {/* SETTINGS (admins) */}
        {g.canEdit ? (
          <>
            <SectionLabel>GROUP SETTINGS</SectionLabel>

            {g.kind !== "faction" ? (
              <>
                <Text style={styles.settingLabel}>Invite link and Join</Text>
                <OptionSelector
                  value={g.joinMode}
                  disabled={busy === "save"}
                  onChange={(joinMode) => save({ joinMode })}
                  options={[
                    { value: "instant", label: "Let them in" },
                    { value: "approval", label: "Admin approves" },
                  ]}
                />
              </>
            ) : null}

            <Text style={styles.settingLabel}>Who can add people</Text>
            <OptionSelector
              value={g.whoCanAdd}
              disabled={busy === "save"}
              onChange={(whoCanAdd) => save({ whoCanAdd })}
              options={[
                { value: "admins", label: "Admins only" },
                { value: "members", label: "All members" },
              ]}
            />

            <Text style={styles.settingLabel}>Who can see the member list</Text>
            <OptionSelector
              value={g.memberListVisibility}
              disabled={busy === "save"}
              onChange={(memberListVisibility) =>
                save({ memberListVisibility })
              }
              options={[
                { value: "members", label: "All members" },
                { value: "admins", label: "Admins only" },
              ]}
            />

            <Text style={styles.settingLabel}>Slow mode</Text>
            <OptionSelector
              value={
                String(
                  g.slowModeSeconds || 0,
                ) as (typeof SLOW_MODE_OPTIONS)[number]["value"]
              }
              disabled={busy === "save"}
              onChange={(value) => save({ slowModeSeconds: Number(value) })}
              options={SLOW_MODE_OPTIONS.map((option) => ({ ...option }))}
            />
            <Text style={[groupStyles.hint, styles.hintGap]}>
              {g.slowModeSeconds
                ? `Members can send one message every ${SLOW_MODE_OPTIONS.find((o) => o.value === String(g.slowModeSeconds))?.label || `${g.slowModeSeconds}s`}. Admins aren't limited.`
                : "Limit how often members can send messages."}
            </Text>

            {g.kind !== "faction" ? (
              <Text style={[groupStyles.hint, styles.hintGap]}>
                Size limit: {g.sizeLimit} people (change it with Edit).
              </Text>
            ) : null}

            <View style={styles.bansRow}>
              <GroupRow
                icon="ban-outline"
                label="Banned people"
                detail={
                  g.bannedCount ? `${g.bannedCount} banned` : "Nobody is banned"
                }
                onPress={openBans}
                right={
                  busy === "bans" ? (
                    <ActivityIndicator color={PINK} />
                  ) : undefined
                }
              />
            </View>

            <Text style={[groupStyles.hint, styles.hintGap]}>
              Tap a member to make them admin, mute, remove or ban them.
            </Text>
          </>
        ) : null}

        {/* YOU */}
        <SectionLabel>NOTIFICATIONS AND MEMBERSHIP</SectionLabel>
        <View style={styles.rows}>
          <GroupRow
            icon={muted ? "notifications-off-outline" : "notifications-outline"}
            label={muted ? "Muted" : "Mute group"}
            detail={muted ? "Tap to unmute" : "8 hours, 1 week or always"}
            onPress={chooseMute}
          />
          <GroupRow
            icon="exit-outline"
            label="Leave group"
            danger
            onPress={confirmLeave}
          />
        </View>
      </ScrollView>

      {/* ADD PEOPLE */}
      <Modal
        visible={showAdd}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAdd(false)}>
        <Pressable style={styles.backdrop} onPress={() => setShowAdd(false)} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 14 }]}>
          <View style={styles.handle} />
          <Text style={styles.sheetTitle}>Add people</Text>
          <ScrollView
            style={styles.sheetList}
            keyboardShouldPersistTaps="handled">
            <PeoplePicker
              selected={toAdd}
              excludeIds={memberIds}
              max={50}
              onToggle={(person) =>
                setToAdd((current) => {
                  const key = personKey(person);
                  const next = { ...current };
                  if (next[key]) delete next[key];
                  else next[key] = person;
                  return next;
                })
              }
            />
          </ScrollView>
          <Pressable
            style={[
              groupStyles.primaryButton,
              (!Object.keys(toAdd).length || busy === "add") &&
                groupStyles.primaryButtonOff,
            ]}
            disabled={!Object.keys(toAdd).length || busy === "add"}
            onPress={addPeople}>
            {busy === "add" ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={groupStyles.primaryButtonText}>
                {Object.keys(toAdd).length
                  ? `Add ${Object.keys(toAdd).length}`
                  : "Choose people to add"}
              </Text>
            )}
          </Pressable>
        </View>
      </Modal>

      {/* JOIN REQUESTS */}
      <Modal
        visible={showRequests}
        transparent
        animationType="slide"
        onRequestClose={() => setShowRequests(false)}>
        <Pressable
          style={styles.backdrop}
          onPress={() => setShowRequests(false)}
        />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 14 }]}>
          <View style={styles.handle} />
          <Text style={styles.sheetTitle}>Join requests</Text>
          <ScrollView style={styles.sheetList}>
            {requests.length === 0 ? (
              <Text style={styles.centerText}>No requests right now.</Text>
            ) : null}
            {requests.map((request) => (
              <View key={request.id} style={styles.memberRow}>
                <Image
                  source={getAvatarSource(request.user)}
                  style={styles.memberAvatar}
                  contentFit="cover"
                />
                <View style={styles.memberText}>
                  <Text style={styles.memberName} numberOfLines={1}>
                    {request.user.name || request.user.username}
                  </Text>
                  <Text style={styles.memberUsername} numberOfLines={1}>
                    @{request.user.username}
                    {request.via === "link" ? " · via invite link" : ""}
                  </Text>
                </View>
                {busy === request.id ? (
                  <ActivityIndicator color={PINK} />
                ) : (
                  <View style={styles.requestActions}>
                    <Pressable
                      style={styles.declineButton}
                      onPress={() => answer(request, false)}
                      accessibilityLabel="Decline">
                      <Ionicons name="close" size={18} color="#D64545" />
                    </Pressable>
                    <Pressable
                      style={styles.approveButton}
                      onPress={() => answer(request, true)}
                      accessibilityLabel="Approve">
                      <Ionicons name="checkmark" size={18} color="#FFFFFF" />
                    </Pressable>
                  </View>
                )}
              </View>
            ))}
          </ScrollView>
        </View>
      </Modal>

      {/* ADMIN ACTIONS ON ONE MEMBER */}
      <Modal
        visible={!!actingOn}
        transparent
        animationType="slide"
        onRequestClose={() => setActingOn(null)}>
        <Pressable style={styles.backdrop} onPress={() => setActingOn(null)} />
        {actingOn ? (
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 14 }]}>
            <View style={styles.handle} />

            <View style={styles.actingHeader}>
              <Image
                source={getAvatarSource(actingOn)}
                style={styles.memberAvatar}
                contentFit="cover"
              />
              <View style={styles.memberText}>
                <Text style={styles.memberName} numberOfLines={1}>
                  {actingOn.name || actingOn.username}
                </Text>
                <Text style={styles.memberUsername} numberOfLines={1}>
                  @{actingOn.username}
                  {actingOn.role !== "member"
                    ? ` · ${ROLE_LABEL[actingOn.role]}`
                    : ""}
                </Text>
              </View>
              {busy === "member" ? <ActivityIndicator color={PINK} /> : null}
            </View>

            {(() => {
              const myRole = g.myRole;
              const canAct = canActOn(myRole, actingOn.role);

              if (showMuteChoices) {
                const choose = (duration: MemberMuteDuration) =>
                  runAdminAction("Mute", () =>
                    muteMember(g.id, actingOn.id, duration, token!),
                  );

                return (
                  <View style={styles.rows}>
                    <Text style={styles.sheetHint}>
                      They can still read, but can't send messages for:
                    </Text>
                    <GroupRow
                      icon="time-outline"
                      label="1 hour"
                      onPress={() => choose("1h")}
                    />
                    <GroupRow
                      icon="time-outline"
                      label="1 day"
                      onPress={() => choose("1d")}
                    />
                    <GroupRow
                      icon="time-outline"
                      label="1 week"
                      onPress={() => choose("1w")}
                    />
                    <GroupRow
                      icon="volume-mute-outline"
                      label="Until I unmute them"
                      onPress={() => choose("forever")}
                    />
                  </View>
                );
              }

              return (
                <View style={styles.rows}>
                  <GroupRow
                    icon="person-circle-outline"
                    label="View profile"
                    onPress={() => {
                      const username = actingOn.username;
                      setActingOn(null);
                      router.push({
                        pathname: "/user/[username]",
                        params: { username },
                      });
                    }}
                  />

                  {actingOn.role === "member" &&
                  (myRole === "owner" || myRole === "admin") ? (
                    <GroupRow
                      icon="shield-checkmark-outline"
                      label="Make admin"
                      onPress={() =>
                        runAdminAction("Make admin", () =>
                          setMemberRole(g.id, actingOn.id, "admin", token!),
                        )
                      }
                    />
                  ) : null}

                  {actingOn.role === "admin" && myRole === "owner" ? (
                    <GroupRow
                      icon="shield-outline"
                      label="Remove as admin"
                      onPress={() =>
                        runAdminAction("Remove as admin", () =>
                          setMemberRole(g.id, actingOn.id, "member", token!),
                        )
                      }
                    />
                  ) : null}

                  {canAct ? (
                    actingOn.mutedUntil ? (
                      <GroupRow
                        icon="volume-high-outline"
                        label="Unmute"
                        detail={`Muted ${mutedUntilText(actingOn.mutedUntil)}`}
                        onPress={() =>
                          runAdminAction("Unmute", () =>
                            unmuteMember(g.id, actingOn.id, token!),
                          )
                        }
                      />
                    ) : (
                      <GroupRow
                        icon="volume-mute-outline"
                        label="Mute…"
                        detail="They can read but not send"
                        onPress={() => setShowMuteChoices(true)}
                      />
                    )
                  ) : null}

                  {canAct ? (
                    <GroupRow
                      icon="person-remove-outline"
                      label="Remove from group"
                      danger
                      onPress={() => confirmRemove(actingOn)}
                    />
                  ) : null}

                  {canAct ? (
                    <GroupRow
                      icon="ban-outline"
                      label="Ban"
                      danger
                      onPress={() => confirmBan(actingOn)}
                    />
                  ) : null}

                  {!canAct && actingOn.role !== "member" ? (
                    <Text style={styles.sheetHint}>
                      {actingOn.role === "owner"
                        ? "The group's owner can't be changed by admins."
                        : "Only the owner can mute, remove or ban an admin."}
                    </Text>
                  ) : null}
                </View>
              );
            })()}
          </View>
        ) : null}
      </Modal>

      {/* BANNED PEOPLE */}
      <Modal
        visible={showBans}
        transparent
        animationType="slide"
        onRequestClose={() => setShowBans(false)}>
        <Pressable style={styles.backdrop} onPress={() => setShowBans(false)} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 14 }]}>
          <View style={styles.handle} />
          <Text style={styles.sheetTitle}>Banned people</Text>
          <ScrollView style={styles.sheetList}>
            {bans.length === 0 ? (
              <Text style={styles.centerText}>Nobody is banned.</Text>
            ) : null}
            {bans.map((entry) => (
              <View key={entry.user.id} style={styles.memberRow}>
                <Image
                  source={getAvatarSource(entry.user)}
                  style={styles.memberAvatar}
                  contentFit="cover"
                />
                <View style={styles.memberText}>
                  <Text style={styles.memberName} numberOfLines={1}>
                    {entry.user.name || entry.user.username}
                  </Text>
                  <Text style={styles.memberUsername} numberOfLines={1}>
                    @{entry.user.username}
                    {entry.bannedBy ? ` · by @${entry.bannedBy.username}` : ""}
                  </Text>
                </View>
                <Pressable
                  style={styles.unbanButton}
                  disabled={busy === `unban-${entry.user.id}`}
                  onPress={() => unban(entry)}>
                  {busy === `unban-${entry.user.id}` ? (
                    <ActivityIndicator size="small" color={PINK} />
                  ) : (
                    <Text style={styles.unbanText}>Unban</Text>
                  )}
                </Pressable>
              </View>
            ))}
          </ScrollView>
        </View>
      </Modal>

      {/* EDIT NAME / DESCRIPTION / SIZE */}
      <Modal
        visible={showEdit}
        transparent
        animationType="slide"
        onRequestClose={() => setShowEdit(false)}>
        <Pressable style={styles.backdrop} onPress={() => setShowEdit(false)} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 14 }]}>
          <View style={styles.handle} />
          <Text style={styles.sheetTitle}>Edit group</Text>

          <Text style={styles.settingLabel}>Name</Text>
          <TextInput
            value={editName}
            onChangeText={setEditName}
            maxLength={80}
            style={groupStyles.input}
          />

          <Text style={styles.settingLabel}>Description</Text>
          <TextInput
            value={editDescription}
            onChangeText={setEditDescription}
            maxLength={500}
            multiline
            style={[groupStyles.input, styles.editDescription]}
          />

          {g.kind !== "faction" ? (
            <>
              <Text style={styles.settingLabel}>Size limit</Text>
              <TextInput
                value={editSize}
                onChangeText={(text) =>
                  setEditSize(text.replace(/[^0-9]/g, ""))
                }
                keyboardType="number-pad"
                maxLength={4}
                style={groupStyles.input}
              />
            </>
          ) : null}

          {g.photoUrl ? (
            <Pressable
              style={styles.removePhoto}
              onPress={() => save({ removePhoto: true })}>
              <Text style={styles.removePhotoText}>Remove group photo</Text>
            </Pressable>
          ) : null}

          <Pressable
            style={[
              groupStyles.primaryButton,
              styles.saveButton,
              (!editName.trim() || busy === "save") &&
                groupStyles.primaryButtonOff,
            ]}
            disabled={!editName.trim() || busy === "save"}
            onPress={saveEdit}>
            {busy === "save" ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={groupStyles.primaryButtonText}>Save</Text>
            )}
          </Pressable>
        </View>
      </Modal>
    </GroupScreen>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: 20,
    paddingTop: 4,
    width: "100%",
    maxWidth: 640,
    alignSelf: "center",
  },

  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 30,
  },

  centerText: {
    fontFamily: FONTS.regular,
    fontSize: 13,
    color: MUTED,
    textAlign: "center",
    paddingVertical: 12,
  },

  editText: { fontFamily: FONTS.medium, fontSize: 15, color: PINK },

  hero: { alignItems: "center", paddingTop: 8, paddingBottom: 6 },

  photoWrap: { position: "relative" },

  cameraChip: {
    position: "absolute",
    right: 2,
    bottom: 2,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: PINK,
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },

  name: {
    marginTop: 12,
    fontFamily: FONTS.bold,
    fontSize: 21,
    color: INK,
    textAlign: "center",
  },

  meta: {
    marginTop: 3,
    fontFamily: FONTS.regular,
    fontSize: 12.5,
    color: MUTED,
    textAlign: "center",
  },

  description: {
    marginTop: 10,
    fontFamily: FONTS.regular,
    fontSize: 13.5,
    lineHeight: 20,
    color: "#3B3B42",
    textAlign: "center",
  },

  messagePill: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: "rgba(195,77,156,0.12)",
  },

  messagePillText: { fontFamily: FONTS.medium, fontSize: 13, color: PINK },

  linkBox: {
    ...MILKY,
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
  },

  linkText: { flex: 1, fontFamily: FONTS.regular, fontSize: 13, color: INK },

  linkActions: { flexDirection: "row", gap: 10, marginTop: 10 },

  linkButton: {
    flex: 1,
    height: 40,
    borderRadius: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "rgba(195,77,156,0.12)",
  },

  linkButtonText: { fontFamily: FONTS.medium, fontSize: 13, color: PINK },

  hintGap: { marginTop: 8 },

  gapBottom: { marginBottom: 10 },

  rows: { gap: 12 },

  memberCard: { ...MILKY, paddingHorizontal: 14, paddingVertical: 4 },

  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
  },

  memberAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#F1E4EE",
  },

  memberText: { flex: 1, minWidth: 0 },

  memberName: { fontFamily: FONTS.semibold, fontSize: 14.5, color: INK },

  memberUsername: {
    marginTop: 1,
    fontFamily: FONTS.regular,
    fontSize: 12.5,
    color: MUTED,
  },

  roleBadge: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: "rgba(195,77,156,0.12)",
  },

  ownerBadge: { backgroundColor: PINK },

  roleText: { fontFamily: FONTS.medium, fontSize: 11, color: PINK },

  ownerText: { color: "#FFFFFF" },

  moreButton: { paddingVertical: 12, alignItems: "center" },

  moreText: { fontFamily: FONTS.medium, fontSize: 13, color: PINK },

  settingLabel: {
    marginTop: 12,
    marginBottom: 8,
    fontFamily: FONTS.medium,
    fontSize: 13,
    color: INK,
  },

  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)" },

  sheet: {
    maxHeight: "85%",
    width: "100%",
    maxWidth: 640,
    alignSelf: "center",
    paddingHorizontal: 20,
    paddingTop: 10,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: "#FFFFFF",
  },

  handle: {
    alignSelf: "center",
    width: 42,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#D5D5DA",
    marginBottom: 10,
  },

  sheetTitle: {
    fontFamily: FONTS.semibold,
    fontSize: 18,
    color: INK,
    marginBottom: 10,
  },

  sheetList: { maxHeight: 420, marginBottom: 12 },

  requestActions: { flexDirection: "row", gap: 8 },

  declineButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(214,69,69,0.10)",
  },

  approveButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: PINK,
  },

  editDescription: { minHeight: 80, textAlignVertical: "top" },

  mutedIcon: { marginRight: 2 },

  bansRow: { marginTop: 14 },

  actingHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 14,
  },

  sheetHint: {
    fontFamily: FONTS.regular,
    fontSize: 12.5,
    lineHeight: 18,
    color: MUTED,
  },

  unbanButton: {
    minWidth: 70,
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(195,77,156,0.12)",
  },

  unbanText: { fontFamily: FONTS.medium, fontSize: 13, color: PINK },

  mutedNote: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "rgba(229,140,60,0.14)",
  },

  mutedNoteText: {
    flexShrink: 1,
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: "#8A4A1F",
  },

  removePhoto: { marginTop: 14, alignItems: "center" },

  removePhotoText: {
    fontFamily: FONTS.medium,
    fontSize: 13.5,
    color: "#D64545",
  },

  saveButton: { marginTop: 16 },
});
