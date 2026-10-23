// ==========================================
// GROUP MEMBERS (Figma M26 · Roster & member detail)
// ==========================================
// Search, then everyone with their Owner/Admin label and rank line. Tap a
// person for the MEMBER DETAIL card: rank, chat status (Owner / Admin /
// Member · no admin powers), "Message …", and "Manage …" for admins.
// "Faction rank is visual identity" - rank never gives chat powers.
// Paged from the server (50 at a time, more as you scroll) so groups of
// 1,000 people stay smooth.
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { memo, useCallback, useContext, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { RankLine } from "@/components/chat/RankBadge";
import { AdminEmbedded, PersonAvatar } from "@/components/groups/AdminUi";
import { FONTS } from "@/constants/fonts";
import { userIdFromToken } from "@/services/calls";
import { canActOn, getGroup, getGroupMembers, type Group, type GroupMember } from "@/services/groups";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { createChat } from "@/store/thunks/chatThunks";
import { safeBack } from "@/utils/safeBack";
import { ScreenGradient } from "@/components/chat/ui";
import { themedStyles, useInk, useThemedStyles } from "@/constants/chatTheme";

const PINK = "#B63D91";
const INK = "#24283C";
const MUTED = "#66738A";
const LILAC = "#F0EDF9";
const LINE = "rgba(36,40,60,0.08)";

const STATUS: Record<string, string> = {
  owner: "Chat status: Owner · runs this group",
  admin: "Chat status: Admin · manages people, messages and Sparks",
  member: "Chat status: Member · no admin powers",
};

function expertiseOf(member: GroupMember) {
  const value = (member as GroupMember & { expertise?: string | null }).expertise;
  return typeof value === "string" && value ? value : null;
}

// Name + Owner/Admin, rank line, then the expertise role (or @username when
// there's no rank and no expertise).
const MemberRow = memo(function MemberRow({
  member,
  isMe,
  selected,
  onPress,
}: {
  member: GroupMember;
  isMe: boolean;
  selected: boolean;
  onPress: (member: GroupMember) => void;
}) {
  const styles = useThemedStyles(STYLE_PAIR);
  const ink = useInk();
  const name = member.name || member.username;
  const expertise = expertiseOf(member);
  const base = expertise || (member.rank ? null : `@${member.username}`);
  const detail = member.mutedUntil ? (base ? `${base} · muted` : "Muted") : base;
  return (
    <Pressable style={[styles.row, selected && styles.rowOn]} onPress={() => onPress(member)}>
      <PersonAvatar person={member} size={44} />
      <View style={styles.flex}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>
            {isMe ? `${name} (you)` : name}
          </Text>
          {member.role === "owner" || member.role === "admin" ? (
            <Text style={styles.role}>{member.role === "owner" ? "Owner" : "Admin"}</Text>
          ) : null}
        </View>
        <RankLine rank={member.rank} />
        {detail ? (
          <Text style={styles.handle} numberOfLines={1}>
            {detail}
          </Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={20} color={ink.text(MUTED)} />
    </Pressable>
  );
});

function Separator() {
  const styles = useThemedStyles(STYLE_PAIR);
  return <View style={styles.separator} />;
}

export default function GroupMembers() {
  // Inside a desktop workspace column (Figma D6): no own header.
  const embedded = useContext(AdminEmbedded);
  const styles = useThemedStyles(STYLE_PAIR);
  const ink = useInk();
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  const listRef = useRef<FlatList<GroupMember>>(null);
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
  // The page being loaded (0 = idle).
  const [loadingPage, setLoadingPage] = useState(1);
  const [selected, setSelected] = useState<GroupMember | null>(null);
  const [messaging, setMessaging] = useState(false);

  const requestRef = useRef(0);
  const loadingRef = useRef(false);

  const load = useCallback(
    async (nextPage: number, query: string) => {
      if (!token || !groupId) return;
      const request = ++requestRef.current;
      loadingRef.current = true;
      try {
        setLoadingPage(nextPage);
        const result = await getGroupMembers(groupId, { search: query.trim() || undefined, page: nextPage }, token);
        if (request !== requestRef.current) return;
        setMembers((current) => {
          if (nextPage === 1) return result.members;
          const seen = new Set(current.map((member) => member.id));
          return [...current, ...result.members.filter((member) => !seen.has(member.id))];
        });
        setTotal(result.total);
        setHasMore(result.hasMore);
        setPage(nextPage);
      } catch (error) {
        if (request !== requestRef.current) return;
        Alert.alert("Group members", error instanceof Error ? error.message : "Couldn't load members.");
      } finally {
        if (request === requestRef.current) {
          loadingRef.current = false;
          setLoadingPage(0);
        }
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

  const loadMore = useCallback(() => {
    if (loadingRef.current || !hasMore) return;
    load(page + 1, search);
  }, [hasMore, load, page, search]);

  // The detail card sits under the list once everyone is loaded (as in the
  // design); in a big group it's pinned to the bottom of the screen instead.
  const detailInList = !hasMore;

  const choose = useCallback(
    (member: GroupMember) => {
      setSelected(member);
      if (detailInList) setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    },
    [detailInList],
  );

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

  const renderItem = useCallback(
    ({ item }: { item: GroupMember }) => (
      <MemberRow member={item} isMe={item.id === myUserId} selected={selected?.id === item.id} onPress={choose} />
    ),
    [myUserId, selected?.id, choose],
  );

  const detailCard = selected ? (
    <>
      <View style={styles.sectionRow}>
        <Text style={styles.section}>MEMBER DETAIL</Text>
        {!detailInList ? (
          <Pressable onPress={() => setSelected(null)} hitSlop={10} accessibilityLabel="Close member detail">
            <Ionicons name="close" size={20} color={ink.text(MUTED)} />
          </Pressable>
        ) : null}
      </View>
      <View style={styles.detail}>
        <View style={styles.detailHead}>
          <PersonAvatar person={selected} size={64} />
          <View style={styles.flex}>
            <View style={styles.nameRow}>
              <Text style={styles.detailName} numberOfLines={1}>
                {selected.name || selected.username}
              </Text>
              {selected.role === "owner" || selected.role === "admin" ? (
                <Text style={styles.role}>{selected.role === "owner" ? "Owner" : "Admin"}</Text>
              ) : null}
            </View>
            <RankLine rank={selected.rank} />
          </View>
        </View>

        <View style={styles.chip}>
          <Text style={styles.chipText}>
            {expertiseOf(selected) ? `${expertiseOf(selected)} · expertise role` : `@${selected.username}`}
          </Text>
        </View>
        <Text style={styles.status}>{STATUS[selected.role] || STATUS.member}</Text>

        {selected.id !== myUserId ? (
          <Pressable style={[styles.soft, messaging && styles.off]} disabled={messaging} onPress={() => message(selected)}>
            {messaging ? <ActivityIndicator color={ink.text(PINK)} /> : <Text style={styles.softText}>Message {firstName(selected)}</Text>}
          </Pressable>
        ) : null}

        {canManage(selected) ? (
          <Pressable
            style={styles.soft}
            onPress={() => router.push({ pathname: "/group/moderation/[id]", params: { id: groupId, userId: selected.id } })}>
            <Text style={styles.softText}>Manage {firstName(selected)}</Text>
          </Pressable>
        ) : null}
      </View>
    </>
  ) : null;

  return (
    <View style={styles.screen}>
      {!embedded ? <ScreenGradient /> : null}
      {!embedded ? (
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => safeBack()} hitSlop={10} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={26} color={ink.text(INK)} />
        </Pressable>
        <View style={styles.flex}>
          <Text style={styles.title}>Group members</Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {group?.name ? `${group.name} · ` : ""}
            {group?.memberCount || total || members.length} members
          </Text>
        </View>
        <Pressable onPress={() => safeBack()} hitSlop={10} accessibilityLabel="Close">
          <Ionicons name="close" size={26} color={ink.text(MUTED)} />
        </Pressable>
      </View>
      ) : (
        <Text style={styles.title}>Members · {group?.memberCount || total || members.length}</Text>
      )}

      <View style={styles.top}>
        <View style={styles.search}>
          <Ionicons name="ellipse-outline" size={16} color={ink.text(MUTED)} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Find a member"
            placeholderTextColor={ink.text("#9AA3B5")}
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.searchInput}
          />
          {loadingPage === 1 && members.length ? <ActivityIndicator size="small" color={ink.text(PINK)} /> : null}
        </View>
      </View>

      <FlatList
        scrollEnabled={embedded !== "inline"}
        ref={listRef}
        style={styles.flex}
        contentContainerStyle={[styles.content, { paddingBottom: detailInList ? insets.bottom + 30 : 16 }]}
        data={members}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ItemSeparatorComponent={Separator}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        windowSize={9}
        removeClippedSubviews={Platform.OS === "android"}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          loadingPage ? (
            <ActivityIndicator color={ink.text(PINK)} style={styles.loading} />
          ) : (
            <Text style={styles.empty}>No members found.</Text>
          )
        }
        ListFooterComponent={
          <>
            {loadingPage > 1 ? <ActivityIndicator color={ink.text(PINK)} style={styles.loading} /> : null}
            {detailInList ? detailCard : null}
            {detailInList ? (
              <Text style={styles.footnote}>
                Faction rank is visual identity. Admin status alone grants chat powers; a Private can be an admin and a
                Sergeant can be a member.
              </Text>
            ) : null}
          </>
        }
      />

      {/* Big groups: the detail stays on screen under the list. */}
      {!detailInList && selected ? (
        <View style={[styles.docked, { paddingBottom: insets.bottom + 14 }]}>{detailCard}</View>
      ) : null}
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

  top: { paddingHorizontal: 18, paddingTop: 12 },

  content: { paddingHorizontal: 18 },

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

  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },

  separator: { height: 1, backgroundColor: LINE },

  rowOn: { backgroundColor: "rgba(182,61,145,0.05)" },

  nameRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 3 },

  name: { flexShrink: 1, fontFamily: FONTS.semibold, fontSize: 15, color: INK },

  role: { fontFamily: FONTS.semibold, fontSize: 11, color: PINK },

  handle: { marginTop: 3, fontFamily: FONTS.regular, fontSize: 12, color: MUTED },

  loading: { paddingVertical: 20 },

  empty: { paddingVertical: 20, textAlign: "center", fontFamily: FONTS.regular, fontSize: 13, color: MUTED },

  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 20, marginBottom: 8 },

  section: { fontFamily: FONTS.semibold, fontSize: 12, letterSpacing: 0.4, color: MUTED },

  docked: {
    maxHeight: "60%",
    paddingHorizontal: 18,
    borderTopWidth: 1,
    borderTopColor: LINE,
    backgroundColor: "rgba(246,249,254,0.97)",
  },

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
