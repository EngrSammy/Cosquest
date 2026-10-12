// ==========================================
// GROUP MEMBERS (Figma M26 · Roster & member detail)
// ==========================================
// Search, then everyone with their Owner/Admin label and rank line. Tap a
// person for the MEMBER DETAIL card: rank, chat status (Owner / Admin /
// Member · no admin powers), "Message …", and "Manage …" for admins.
// "Faction rank is visual identity" - rank never gives chat powers.
// Built from the screenshot for testing.
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { RankLine } from "@/components/chat/RankBadge";
import { FONTS } from "@/constants/fonts";
import { userIdFromToken } from "@/services/calls";
import { canActOn, getGroup, getGroupMembers, type Group, type GroupMember } from "@/services/groups";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { createChat } from "@/store/thunks/chatThunks";
import { safeBack } from "@/utils/safeBack";

const PINK = "#B63D91";
const INK = "#24283C";
const MUTED = "#66738A";
const LILAC = "#F0EDF9";
const LINE = "rgba(36,40,60,0.08)";

const AVATAR_TINTS = ["#E9E1F5", "#DCE8EF", "#F3DDED", "#E2F0E8", "#F5E6D8"];

function avatarTint(name?: string) {
  let hash = 0;
  for (const char of String(name || "")) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return AVATAR_TINTS[hash % AVATAR_TINTS.length];
}

function initialsOf(name?: string) {
  const parts = String(name || "?").trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[1][0] : (parts[0] || "?").slice(0, 2);
  return letters.toUpperCase();
}

function Avatar({ member, size }: { member: GroupMember; size: number }) {
  const name = member.name || member.username;
  const round = { width: size, height: size, borderRadius: size / 2 };
  return member.avatarPhotoUrl ? (
    <Image source={{ uri: member.avatarPhotoUrl }} style={round} contentFit="cover" />
  ) : (
    <View style={[round, styles.avatar, { backgroundColor: avatarTint(name) }]}>
      <Text style={[styles.avatarText, { fontSize: size > 50 ? 18 : 12 }]}>{initialsOf(name)}</Text>
    </View>
  );
}

const STATUS: Record<string, string> = {
  owner: "Chat status: Owner · runs this group",
  admin: "Chat status: Admin · manages people, messages and Sparks",
  member: "Chat status: Member · no admin powers",
};

export default function GroupMembers() {
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  const scrollRef = useRef<ScrollView>(null);
  const { id } = useLocalSearchParams<{ id: string }>();
  const groupId = Array.isArray(id) ? id[0] : id;

  const token = useAppSelector((state) => state.auth.token);
  const myUserId = useAppSelector((state) => state.call.myUserId) || userIdFromToken(token);

  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<GroupMember | null>(null);
  const [messaging, setMessaging] = useState(false);

  const load = useCallback(
    async (nextPage: number, query: string) => {
      if (!token || !groupId) return;
      try {
        setLoading(true);
        const result = await getGroupMembers(groupId, { search: query.trim() || undefined, page: nextPage }, token);
        setMembers((current) => (nextPage === 1 ? result.members : [...current, ...result.members]));
        setTotal(result.total);
        setHasMore(result.hasMore);
        setPage(nextPage);
      } catch (error) {
        Alert.alert("Group members", error instanceof Error ? error.message : "Couldn't load members.");
      } finally {
        setLoading(false);
      }
    },
    [token, groupId],
  );

  useEffect(() => {
    if (!token || !groupId) return;
    getGroup(groupId, token)
      .then((result) => setGroup(result.group))
      .catch(() => {});
  }, [token, groupId]);

  // Search as you type.
  useEffect(() => {
    const timer = setTimeout(() => load(1, search), search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [search, load]);

  const choose = (member: GroupMember) => {
    setSelected(member);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
  };

  const message = async (member: GroupMember) => {
    if (!token || messaging) return;
    try {
      setMessaging(true);
      const created = await dispatch(createChat({ token, data: { username: member.username } })).unwrap();
      if (created?.id) router.push({ pathname: "/chat/[id]", params: { id: created.id } });
    } catch (error) {
      Alert.alert("Message", error instanceof Error ? error.message : "Couldn't start a chat. You may need to follow them first.");
    } finally {
      setMessaging(false);
    }
  };

  const firstName = (member: GroupMember) => (member.name || member.username).split(" ")[0];
  const canManage = (member: GroupMember) => member.id !== myUserId && canActOn(group?.myRole, member.role);

  return (
    <LinearGradient colors={["#F6F9FE", "#E3F0FC"]} style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => safeBack()} hitSlop={10} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={26} color={INK} />
        </Pressable>
        <View style={styles.flex}>
          <Text style={styles.title}>Group members</Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {group?.name ? `${group.name} · ` : ""}
            {total || group?.memberCount || members.length} members
          </Text>
        </View>
        <Pressable onPress={() => safeBack()} hitSlop={10} accessibilityLabel="Close">
          <Ionicons name="close" size={26} color={MUTED} />
        </Pressable>
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 30 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <View style={styles.search}>
          <Ionicons name="ellipse-outline" size={16} color={MUTED} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Find a member"
            placeholderTextColor="#9AA3B5"
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.searchInput}
          />
        </View>

        {members.map((member, index) => {
          const name = member.name || member.username;
          return (
            <Pressable
              key={member.id}
              style={[styles.row, index === members.length - 1 && styles.rowLast, selected?.id === member.id && styles.rowOn]}
              onPress={() => choose(member)}>
              <Avatar member={member} size={44} />
              <View style={styles.flex}>
                <View style={styles.nameRow}>
                  <Text style={styles.name} numberOfLines={1}>
                    {member.id === myUserId ? `${name} (you)` : name}
                  </Text>
                  {member.role !== "member" ? (
                    <Text style={styles.role}>{member.role === "owner" ? "Owner" : "Admin"}</Text>
                  ) : null}
                </View>
                <RankLine rank={member.rank} />
                {(member as any).expertise ? <Text style={styles.handle}>{(member as any).expertise}</Text> : null}
                <Text style={styles.handle} numberOfLines={1}>
                  @{member.username}
                  {member.mutedUntil ? " · muted" : ""}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={MUTED} />
            </Pressable>
          );
        })}

        {loading ? <ActivityIndicator color={PINK} style={styles.loading} /> : null}
        {!loading && !members.length ? <Text style={styles.empty}>No members found.</Text> : null}
        {!loading && hasMore ? (
          <Pressable style={styles.more} onPress={() => load(page + 1, search)}>
            <Text style={styles.moreText}>Load more</Text>
          </Pressable>
        ) : null}

        {/* MEMBER DETAIL */}
        {selected ? (
          <>
            <Text style={styles.section}>MEMBER DETAIL</Text>
            <View style={styles.detail}>
              <View style={styles.detailHead}>
                <Avatar member={selected} size={64} />
                <View style={styles.flex}>
                  <View style={styles.nameRow}>
                    <Text style={styles.detailName} numberOfLines={1}>
                      {selected.name || selected.username}
                    </Text>
                    {selected.role !== "member" ? (
                      <Text style={styles.role}>{selected.role === "owner" ? "Owner" : "Admin"}</Text>
                    ) : null}
                  </View>
                  <RankLine rank={selected.rank} />
                </View>
              </View>

              <View style={styles.chip}>
                <Text style={styles.chipText}>{(selected as any).expertise ? `${(selected as any).expertise} · expertise role` : `@${selected.username}`}</Text>
              </View>
              <Text style={styles.status}>{STATUS[selected.role] || STATUS.member}</Text>

              {selected.id !== myUserId ? (
                <Pressable style={[styles.soft, messaging && styles.off]} disabled={messaging} onPress={() => message(selected)}>
                  {messaging ? (
                    <ActivityIndicator color={PINK} />
                  ) : (
                    <Text style={styles.softText}>Message {firstName(selected)}</Text>
                  )}
                </Pressable>
              ) : null}

              {canManage(selected) ? (
                <Pressable
                  style={styles.soft}
                  onPress={() =>
                    router.push({ pathname: "/group/moderation/[id]", params: { id: groupId, userId: selected.id } })
                  }>
                  <Text style={styles.softText}>Manage {firstName(selected)}</Text>
                </Pressable>
              ) : null}
            </View>
          </>
        ) : null}

        <Text style={styles.footnote}>
          Faction rank is visual identity. Admin status alone grants chat powers; a Private can be an admin and a
          Sergeant can be a member.
        </Text>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },

  flex: { flex: 1, minWidth: 0 },

  off: { opacity: 0.5 },

  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingBottom: 8 },

  title: { fontFamily: FONTS.semibold, fontSize: 22, lineHeight: 28, color: INK },

  subtitle: { marginTop: 2, fontFamily: FONTS.regular, fontSize: 12, color: MUTED },

  content: { paddingHorizontal: 18, paddingTop: 12 },

  search: {
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    marginBottom: 10,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "rgba(102,115,138,0.25)",
  },

  searchInput: {
    flex: 1,
    padding: 0,
    fontFamily: FONTS.regular,
    fontSize: 15,
    color: INK,
    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null),
  },

  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: LINE },

  rowLast: { borderBottomWidth: 0 },

  rowOn: { backgroundColor: "rgba(182,61,145,0.05)" },

  avatar: { alignItems: "center", justifyContent: "center" },

  avatarText: { fontFamily: FONTS.bold, color: "#7D356D" },

  nameRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 3 },

  name: { flexShrink: 1, fontFamily: FONTS.semibold, fontSize: 15, color: INK },

  role: { fontFamily: FONTS.semibold, fontSize: 11, color: PINK },

  handle: { marginTop: 3, fontFamily: FONTS.regular, fontSize: 12, color: MUTED },

  loading: { paddingVertical: 20 },

  empty: { paddingVertical: 20, textAlign: "center", fontFamily: FONTS.regular, fontSize: 13, color: MUTED },

  more: { alignSelf: "center", marginTop: 10, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 14, backgroundColor: LILAC },

  moreText: { fontFamily: FONTS.semibold, fontSize: 13, color: PINK },

  section: { marginTop: 20, marginBottom: 8, fontFamily: FONTS.semibold, fontSize: 12, letterSpacing: 0.4, color: MUTED },

  detail: { padding: 16, borderRadius: 20, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: LINE },

  detailHead: { flexDirection: "row", alignItems: "center", gap: 14 },

  detailName: { flexShrink: 1, fontFamily: FONTS.semibold, fontSize: 17, color: INK },

  chip: {
    alignSelf: "flex-start",
    marginTop: 14,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: "#ECE8F4",
  },

  chipText: { fontFamily: FONTS.medium, fontSize: 11.5, color: MUTED },

  status: { marginTop: 10, fontFamily: FONTS.regular, fontSize: 14, color: MUTED },

  soft: {
    marginTop: 12,
    height: 50,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: LILAC,
  },

  softText: { fontFamily: FONTS.semibold, fontSize: 16, color: PINK },

  footnote: { marginTop: 16, fontFamily: FONTS.regular, fontSize: 12.5, lineHeight: 18, color: MUTED },
});
