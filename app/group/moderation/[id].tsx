// ==========================================
// MODERATION (Figma M30 · Member moderation & slow mode)
// ==========================================
// Group posting: slow mode. Selected member: Remove / Ban / Mute (each with
// a confirmation card - "Mute Nia for 1 hour?"), Unmute, and the banned
// list with Unban. Messages are pinned/deleted from the chat's long-press
// menu (admins can delete any message). Opened with ?userId= to preselect.
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import {
  A,
  AdminScreen,
  Card,
  Chip,
  ConfirmCard,
  Note,
  PersonRow,
  Pills,
  Section,
  SoftButton,
  adminStyles,
  firstName,
} from "@/components/groups/AdminUi";
import { FONTS } from "@/constants/fonts";
import { apiRequest } from "@/services/api";
import { userIdFromToken } from "@/services/calls";
import {
  SLOW_MODE_OPTIONS,
  banMember,
  canActOn,
  getBans,
  getGroup,
  getGroupMembers,
  muteMember,
  mutedUntilText,
  removeMember,
  unbanMember,
  unmuteMember,
  updateGroup,
  type Group,
  type GroupBanEntry,
  type GroupMember,
  type MemberMuteDuration,
} from "@/services/groups";
import { useAppSelector } from "@/store/hooks";
import { themedStyles, useInk, useThemedStyles } from "@/constants/chatTheme";

type Action = "remove" | "ban" | "mute" | null;

const MUTE_OPTIONS: { value: MemberMuteDuration; label: string }[] = [
  { value: "1h", label: "1 hour" },
  { value: "1d", label: "1 day" },
  { value: "1w", label: "1 week" },
  { value: "forever", label: "Until unmuted" },
];

const MUTE_WORDS: Record<MemberMuteDuration, string> = {
  "1h": "for 1 hour",
  "1d": "for 1 day",
  "1w": "for 1 week",
  forever: "until you unmute them",
};

export default function Moderation() {
  const styles = useThemedStyles(STYLE_PAIR);
  const ink = useInk();
  const { id, userId, messageId } = useLocalSearchParams<{ id: string; userId?: string; messageId?: string }>();
  const groupId = Array.isArray(id) ? id[0] : id;
  const preselect = Array.isArray(userId) ? userId[0] : userId;
  // Opened from a message's long-press "Moderate" (M30 "SELECTED MESSAGE").
  const messageParam = Array.isArray(messageId) ? messageId[0] : messageId;
  const token = useAppSelector((state) => state.auth.token);
  const myUserId = useAppSelector((state) => state.call.myUserId) || userIdFromToken(token);

  const [group, setGroup] = useState<Group | null>(null);
  const [message, setMessage] = useState<any | null>(null);
  const [showSlowChoices, setShowSlowChoices] = useState(false);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [bans, setBans] = useState<GroupBanEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<GroupMember | null>(null);
  const [action, setAction] = useState<Action>(null);
  const [muteFor, setMuteFor] = useState<MemberMuteDuration>("1h");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || !groupId) return;
    try {
      const [info, list, banned] = await Promise.all([
        getGroup(groupId, token),
        getGroupMembers(groupId, {}, token),
        getBans(groupId, token).catch(() => []),
      ]);
      setGroup(info.group);
      setMembers(list.members);
      setBans(banned);
      if (preselect) {
        const target = list.members.find((member) => member.id === preselect);
        if (target) setSelected(target);
      }
    } catch (error) {
      Alert.alert("Moderation", error instanceof Error ? error.message : "Couldn't load the group.");
    } finally {
      setLoading(false);
    }
  }, [token, groupId, preselect]);

  useEffect(() => {
    load();
  }, [load]);

  // The message this screen was opened for (and its sender, selected).
  useEffect(() => {
    if (!token || !groupId || !messageParam) return;
    apiRequest<any>(`/api/chats/${encodeURIComponent(groupId)}/messages/${encodeURIComponent(messageParam)}`, { token })
      .then((response) => setMessage(response?.message || null))
      .catch(() => setMessage(null));
  }, [token, groupId, messageParam]);

  const pinMessage = () => {
    if (!token || !groupId || !message) return;
    Alert.alert("Pin this message?", "It shows at the top of the chat for everyone, for 7 days.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Pin message",
        onPress: async () => {
          try {
            setBusy("message");
            await apiRequest(`/api/chats/${encodeURIComponent(groupId)}/pinned-message`, {
              method: "PATCH",
              body: { messageId: message.id, duration: "7d" },
              token,
            });
            Alert.alert("Pinned", "The message is pinned at the top of the chat.");
          } catch (error) {
            Alert.alert("Pin message", error instanceof Error ? error.message : "Couldn't pin it.");
          } finally {
            setBusy(null);
          }
        },
      },
    ]);
  };

  const deleteMessage = () => {
    if (!token || !groupId || !message) return;
    Alert.alert("Delete this message for everyone?", "Admins may delete any message. This can't be undone.", [
      { text: "Keep message", style: "cancel" },
      {
        text: "Delete message",
        style: "destructive",
        onPress: async () => {
          try {
            setBusy("message");
            await apiRequest(
              `/api/chats/${encodeURIComponent(groupId)}/messages/${encodeURIComponent(message.id)}?scope=everyone`,
              { method: "DELETE", token },
            );
            setMessage({ ...message, deleted: true, content: "This message was deleted by an admin." });
          } catch (error) {
            Alert.alert("Delete message", error instanceof Error ? error.message : "Couldn't delete it.");
          } finally {
            setBusy(null);
          }
        },
      },
    ]);
  };

  const candidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    return members.filter(
      (member) =>
        member.id !== myUserId &&
        canActOn(group?.myRole, member.role) &&
        (!q || `${member.name || ""} ${member.username}`.toLowerCase().includes(q)),
    );
  }, [members, search, group?.myRole, myUserId]);

  const setSlowMode = async (value: string) => {
    if (!token || !groupId || !group) return;
    try {
      setBusy("slow");
      const updated = await updateGroup(groupId, { slowModeSeconds: Number(value) }, null, token);
      setGroup(updated);
    } catch (error) {
      Alert.alert("Slow mode", error instanceof Error ? error.message : "Couldn't change slow mode.");
    } finally {
      setBusy(null);
    }
  };

  const run = async (work: () => Promise<unknown>) => {
    try {
      setBusy("member");
      await work();
      setAction(null);
      setSelected(null);
      await load();
    } catch (error) {
      Alert.alert("Moderation", error instanceof Error ? error.message : "That didn't work.");
    } finally {
      setBusy(null);
    }
  };

  const confirm = () => {
    if (!token || !groupId || !selected) return;
    if (action === "remove") run(() => removeMember(groupId, selected.id, token));
    if (action === "ban") run(() => banMember(groupId, selected.id, "", token));
    if (action === "mute") run(() => muteMember(groupId, selected.id, muteFor, token));
  };

  const unban = async (entry: GroupBanEntry) => {
    if (!token || !groupId) return;
    try {
      setBusy(`unban-${entry.user.id}`);
      await unbanMember(groupId, entry.user.id, token);
      setBans((current) => current.filter((item) => item.user.id !== entry.user.id));
    } catch (error) {
      Alert.alert("Unban", error instanceof Error ? error.message : "Couldn't unban.");
    } finally {
      setBusy(null);
    }
  };

  const name = selected ? firstName(selected) : "";
  const slowValue = String(group?.slowModeSeconds || 0) as (typeof SLOW_MODE_OPTIONS)[number]["value"];
  const slowLabel = SLOW_MODE_OPTIONS.find((option) => option.value === slowValue)?.label || "Off";
  // "1 message every 30 seconds" (Figma wording).
  const SLOW_WORDS: Record<string, string> = {
    "10": "10 seconds",
    "30": "30 seconds",
    "60": "minute",
    "300": "5 minutes",
    "3600": "hour",
  };
  const slowWords = SLOW_WORDS[slowValue] || slowLabel;

  return (
    <AdminScreen title="Moderation" subtitle={group?.name} loading={loading}>
      <Chip>Admin-only controls</Chip>

      {/* GROUP POSTING */}
      <Section>GROUP POSTING</Section>
      <Card padded>
        <View style={styles.slowHead}>
          <View style={styles.flex}>
            <Text style={styles.cardTitle}>Slow mode</Text>
            <Text style={styles.cardHint}>
              {group?.slowModeSeconds ? `1 message every ${slowWords}` : "Off · members can post freely"}
            </Text>
          </View>
          <Ionicons name="timer-outline" size={24} color={ink.text(A.muted)} />
        </View>
        <Pressable style={styles.slowChange} onPress={() => setShowSlowChoices((value) => !value)}>
          <Text style={[styles.cardHint, styles.flex]}>Current setting · change posting frequency</Text>
          <Ionicons name={showSlowChoices ? "chevron-up" : "chevron-down"} size={18} color={ink.text(A.muted)} />
        </Pressable>
        {showSlowChoices ? (
          <>
            <Pills
              options={SLOW_MODE_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
              value={slowValue}
              onChange={setSlowMode}
            />
            <Note>Admins aren&apos;t limited by slow mode.</Note>
          </>
        ) : null}
      </Card>

      {/* SELECTED MEMBER */}
      <Section>{selected ? "SELECTED MEMBER" : "CHOOSE A MEMBER"}</Section>
      {selected ? (
        <Card padded>
          <PersonRow
            person={selected}
            onPress={() => {
              setSelected(null);
              setAction(null);
            }}
            detail={selected.mutedUntil ? `Muted ${mutedUntilText(selected.mutedUntil)}` : undefined}
            last
          />
          <View style={adminStyles.threeButtons}>
            <SoftButton label="Remove" onPress={() => setAction("remove")} flex />
            <SoftButton label="Ban" onPress={() => setAction("ban")} flex />
            {selected.mutedUntil ? (
              <SoftButton
                label="Unmute"
                onPress={() => token && groupId && run(() => unmuteMember(groupId, selected.id, token))}
                flex
              />
            ) : (
              <SoftButton label="Mute" onPress={() => setAction("mute")} flex />
            )}
          </View>
          <Note>Remove ends membership. Ban also blocks rejoining.</Note>
        </Card>
      ) : (
        <>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Find a member"
            placeholderTextColor={ink.text("#9AA3B5")}
            autoCapitalize="none"
            style={styles.search}
          />
          <Card>
            {candidates.slice(0, 30).map((member, index) => (
              <PersonRow
                key={member.id}
                person={member}
                onPress={() => setSelected(member)}
                detail={member.mutedUntil ? `Muted ${mutedUntilText(member.mutedUntil)}` : undefined}
                last={index === Math.min(candidates.length, 30) - 1}
              />
            ))}
          </Card>
          {!candidates.length ? <Note>No members you can moderate.</Note> : null}
        </>
      )}

      {/* CONFIRMATIONS */}
      {selected && action === "mute" ? (
        <ConfirmCard
          title={`Mute ${name} ${MUTE_WORDS[muteFor]}?`}
          text={`${name} can still read ${group?.name || "the group"}, but won't be able to post until the mute ends.`}
          confirmLabel="Confirm member mute"
          onConfirm={confirm}
          onCancel={() => setAction(null)}
          busy={busy === "member"}>
          <Pills options={MUTE_OPTIONS} value={muteFor} onChange={setMuteFor} />
        </ConfirmCard>
      ) : null}

      {selected && action === "remove" ? (
        <ConfirmCard
          title={`Remove ${name}?`}
          text={`${name} leaves ${group?.name || "the group"}. They can be added again later.`}
          confirmLabel="Confirm remove"
          onConfirm={confirm}
          onCancel={() => setAction(null)}
          busy={busy === "member"}
          danger
        />
      ) : null}

      {selected && action === "ban" ? (
        <ConfirmCard
          title={`Ban ${name}?`}
          text={`${name} is removed and can't come back (not even with the invite link) until an admin unbans them.`}
          confirmLabel="Confirm ban"
          onConfirm={confirm}
          onCancel={() => setAction(null)}
          busy={busy === "member"}
          danger
        />
      ) : null}

      {/* SELECTED MESSAGE (opened from a message) / how to moderate messages */}
      {message ? (
        <>
          <Section>SELECTED MESSAGE</Section>
          <Card padded>
            {message.sender ? <PersonRow person={{ ...message.sender, username: message.sender.username || "" }} role={null} last /> : null}
            <View style={styles.bubble}>
              <Text style={[styles.bubbleText, message.deleted && styles.bubbleDeleted]}>
                {message.content || (message.kind === "audio" ? "Voice note" : message.kind === "image" ? "Photo" : "Message")}
              </Text>
              <Text style={styles.bubbleTime}>
                {new Date(message.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
              </Text>
            </View>
            {!message.deleted ? (
              <View style={adminStyles.twoButtons}>
                <SoftButton label="Pin message" onPress={pinMessage} flex disabled={busy === "message"} />
                <SoftButton label="Delete message" onPress={deleteMessage} danger flex disabled={busy === "message"} />
              </View>
            ) : null}
            <Note>Admins may delete any message. Members may delete only their own. Deletion asks for confirmation.</Note>
          </Card>
        </>
      ) : null}

      {!message ? (
      <>
      <Section>MESSAGES</Section>
      <Card padded>
        <Text style={styles.cardTitle}>Pin or delete messages</Text>
        <Text style={styles.cardHint}>
          Long-press any message in the chat. Admins may delete any message; members may delete only their own.
          Deletion asks for confirmation.
        </Text>
      </Card>
      </>
      ) : null}

      {/* BANNED */}
      <Section>BANNED PEOPLE · {bans.length}</Section>
      <Card>
        {bans.length === 0 ? <Note>Nobody is banned.</Note> : null}
        {bans.map((entry, index) => (
          <PersonRow
            key={entry.user.id}
            person={entry.user}
            role={null}
            detail={entry.bannedBy ? `Banned by @${entry.bannedBy.username}` : undefined}
            last={index === bans.length - 1}
            right={
              <SoftButton
                label={busy === `unban-${entry.user.id}` ? "…" : "Unban"}
                onPress={() => unban(entry)}
                disabled={busy === `unban-${entry.user.id}`}
              />
            }
          />
        ))}
      </Card>
    </AdminScreen>
  );
}

const STYLE_PAIR = themedStyles({
  flex: { flex: 1 },

  slowHead: { flexDirection: "row", alignItems: "center", gap: 12 },

  slowChange: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(36,40,60,0.08)",
  },

  bubble: { marginTop: 10, padding: 12, borderRadius: 14, backgroundColor: "#F2F4F8" },

  bubbleText: { fontFamily: FONTS.regular, fontSize: 14, lineHeight: 20, color: A.ink },

  bubbleDeleted: { fontStyle: "italic", color: A.muted },

  bubbleTime: { marginTop: 6, alignSelf: "flex-end", fontFamily: FONTS.regular, fontSize: 11, color: A.muted },

  cardTitle: { fontFamily: FONTS.semibold, fontSize: 16, color: A.ink },

  cardHint: { marginTop: 3, fontFamily: FONTS.regular, fontSize: 12.5, lineHeight: 18, color: A.muted },

  search: {
    height: 48,
    paddingHorizontal: 16,
    marginBottom: 10,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "rgba(102,115,138,0.25)",
    fontFamily: FONTS.regular,
    fontSize: 15,
    color: A.ink,
    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null),
  },
});
