// ==========================================
// MENTION MEMBERS (Figma M13 · Checkbox mentions)
// ==========================================
// Full screen: "Mention members" with the group's name under it, "Find a
// member", Everyone (with the member count), then a checkbox beside every
// person (avatar, name + Owner/Admin, rank line, expertise). Footer: "2
// selected · Maya Chen & Diego Ruiz", "They'll be notified when you send your
// message." and "Confirm · mention 2 members". Opens from the @ button or
// typing "@".
//
// Big groups (1,000 people): the list is paged from the server (50 at a
// time, more as you scroll) and searched on the server.
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { RankLine } from "@/components/chat/RankBadge";
import { PersonAvatar } from "@/components/groups/AdminUi";
import { FONTS } from "@/constants/fonts";
import { userIdFromToken } from "@/services/calls";
import { getChatMembers } from "@/services/chats";
import { getGroupMembers } from "@/services/groups";
import type { Rank } from "@/services/ranks";
import { useAppSelector } from "@/store/hooks";
import { DARK_SCREEN_GRADIENT, LIGHT_SCREEN_GRADIENT, themedStyles, useInk, useThemedStyles } from "@/constants/chatTheme";

const PINK = "#B63D91";
const INK = "#24283C";
const MUTED = "#66738A";
const LINE = "rgba(36,40,60,0.08)";

const PAGE_SIZE = 50;

export type MentionPerson = {
  id: string;
  username: string;
  name?: string | null;
  avatarKey?: string | null;
  avatarPhotoUrl?: string | null;
  rank?: Rank | null;
  role?: string | null;
  expertise?: string | null;
};

type Leader = MentionPerson & { role: "owner" | "admin" };

// ==========================================
// OWNER / ADMINS (groups only)
// ==========================================
// The chat member list has no roles, so for a group we ask the group member
// list ONCE (first 100 people, the most the backend gives in one go) and keep
// the owner/admins found there for a few minutes. Admins beyond those first
// 100 just show without their label.
const LEADERS_TTL = 5 * 60 * 1000;
const leadersCache = new Map<string, { at: number; leaders: Promise<Leader[]> }>();

function loadLeaders(groupId: string, token: string): Promise<Leader[]> {
  const cached = leadersCache.get(groupId);
  if (cached && Date.now() - cached.at < LEADERS_TTL) return cached.leaders;

  const leaders = getGroupMembers(groupId, { limit: 100 }, token)
    .then((result) =>
      result.members
        .filter((member) => member.role === "owner" || member.role === "admin")
        .sort((a, b) => (a.role === b.role ? 0 : a.role === "owner" ? -1 : 1))
        .map((member) => ({ ...(member as MentionPerson), role: member.role as Leader["role"] })),
    )
    // Not allowed to see the list (admins-only groups) or offline: no labels.
    .catch(() => {
      leadersCache.delete(groupId);
      return [] as Leader[];
    });

  leadersCache.set(groupId, { at: Date.now(), leaders });
  return leaders;
}

// "Maya Chen & Diego Ruiz" / "Maya Chen, Diego Ruiz & 3 others"
function namesOf(people: MentionPerson[]) {
  const names = people.map((person) => person.name || person.username);
  if (names.length <= 2) return names.join(" & ");
  const others = names.length - 2;
  return `${names.slice(0, 2).join(", ")} & ${others} ${others === 1 ? "other" : "others"}`;
}

function Checkbox({ checked }: { checked: boolean }) {
  const styles = useThemedStyles(STYLE_PAIR);
  return (
    <View style={[styles.check, checked && styles.checkOn]}>
      {checked ? <Ionicons name="checkmark" size={16} color="#FFFFFF" /> : null}
    </View>
  );
}

const MemberRow = memo(function MemberRow({
  person,
  role,
  checked,
  disabled,
  onToggle,
}: {
  person: MentionPerson;
  role?: string | null;
  checked: boolean;
  disabled: boolean;
  onToggle: (person: MentionPerson) => void;
}) {
  const styles = useThemedStyles(STYLE_PAIR);
  const name = person.name || person.username;
  const expertise = person.expertise || null;
  return (
    <Pressable
      style={styles.row}
      onPress={() => onToggle(person)}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      accessibilityLabel={name}>
      <Checkbox checked={checked} />
      <PersonAvatar person={person} size={44} />
      <View style={styles.flex}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
          {role === "owner" || role === "admin" ? (
            <Text style={styles.role}>{role === "owner" ? "Owner" : "Admin"}</Text>
          ) : null}
        </View>
        <RankLine rank={person.rank} />
        {expertise ? (
          <Text style={styles.detail} numberOfLines={1}>
            {expertise}
          </Text>
        ) : null}
        {/* @username only when there's nothing else under the name. */}
        {!expertise && !person.rank ? (
          <Text style={styles.detail} numberOfLines={1}>
            @{person.username}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
});

function Separator() {
  const styles = useThemedStyles(STYLE_PAIR);
  return <View style={styles.separator} />;
}

export default function MentionPicker({
  visible,
  conversationId,
  token,
  onClose,
  onDone,
  groupTitle,
}: {
  visible: boolean;
  conversationId: string;
  token: string;
  onClose: () => void;
  onDone: (people: MentionPerson[], everyone: boolean) => void;
  // Shown under the title (defaults to the chat's own title).
  groupTitle?: string;
}) {
  const styles = useThemedStyles(STYLE_PAIR);
  const screenGradient = useInk().dark ? DARK_SCREEN_GRADIENT : LIGHT_SCREEN_GRADIENT;
  const insets = useSafeAreaInsets();

  const chat = useAppSelector(
    (state) =>
      (state.chat.conversationDetails as Record<string, any>)[conversationId] ||
      (state.chat.conversations as any[]).find((item) => String(item.id) === String(conversationId)),
  ) as { type?: string; title?: string; name?: string } | undefined;
  const myUserId = useAppSelector((state) => state.call.myUserId) || userIdFromToken(token);

  const subtitle = groupTitle || chat?.title || chat?.name || "";
  const isGroup = chat?.type === "group";

  const [query, setQuery] = useState("");
  const [members, setMembers] = useState<MentionPerson[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  // The page being loaded (0 = idle).
  const [loadingPage, setLoadingPage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [picked, setPicked] = useState<MentionPerson[]>([]);
  const [everyone, setEveryone] = useState(false);

  // Ignore answers to an older search.
  const requestRef = useRef(0);
  const loadingRef = useRef(false);

  // Fresh start each time it opens.
  useEffect(() => {
    if (visible) {
      setQuery("");
      setPicked([]);
      setEveryone(false);
    }
  }, [visible]);

  // Owner / admins (groups): one cached request.
  useEffect(() => {
    if (!visible || !isGroup || !conversationId || !token) return;
    let cancelled = false;
    loadLeaders(conversationId, token).then((list) => {
      if (!cancelled) setLeaders(list.filter((person) => person.id !== myUserId));
    });
    return () => {
      cancelled = true;
    };
  }, [visible, isGroup, conversationId, token, myUserId]);

  const fetchPage = useCallback(
    async (text: string, nextPage: number) => {
      if (!conversationId || !token) return;
      const request = ++requestRef.current;
      loadingRef.current = true;
      try {
        setLoadingPage(nextPage);
        setError(null);
        const result = await getChatMembers(conversationId, { search: text, page: nextPage, limit: PAGE_SIZE }, token);
        if (request !== requestRef.current) return;
        setMembers((current) => {
          if (nextPage === 1) return result.members;
          // Pages can overlap if people join meanwhile.
          const seen = new Set(current.map((person) => person.id));
          return [...current, ...result.members.filter((person) => !seen.has(person.id))];
        });
        setPage(nextPage);
        setHasMore(result.hasMore);
        if (!text) setTotal(result.total || result.members.length);
      } catch (loadError) {
        if (request !== requestRef.current) return;
        if (nextPage === 1) setMembers([]);
        setError(loadError instanceof Error ? loadError.message : "Couldn't load people.");
      } finally {
        if (request === requestRef.current) {
          loadingRef.current = false;
          setLoadingPage(0);
        }
      }
    },
    [conversationId, token],
  );

  // First page (search after a short pause in typing).
  useEffect(() => {
    if (!visible) return;
    const text = query.trim();
    const timer = setTimeout(() => fetchPage(text, 1), text ? 300 : 0);
    return () => clearTimeout(timer);
  }, [visible, query, fetchPage]);

  const loadMore = useCallback(() => {
    if (loadingRef.current || !hasMore || error) return;
    fetchPage(query.trim(), page + 1);
  }, [hasMore, error, fetchPage, query, page]);

  const roleById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const leader of leaders) map[leader.id] = leader.role;
    return map;
  }, [leaders]);

  // Owner and admins first (when we know them), then everyone else A-Z.
  const searching = !!query.trim();
  const rows = useMemo(() => {
    if (searching || !leaders.length) return members;
    const leaderIds = new Set(leaders.map((leader) => leader.id));
    return [...leaders, ...members.filter((person) => !leaderIds.has(person.id))];
  }, [members, leaders, searching]);

  const pickedIds = useMemo(() => new Set(picked.map((person) => person.id)), [picked]);
  const count = picked.length;

  const toggle = useCallback((person: MentionPerson) => {
    setPicked((current) =>
      current.some((item) => item.id === person.id)
        ? current.filter((item) => item.id !== person.id)
        : [...current, person],
    );
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: MentionPerson }) => (
      <MemberRow
        person={item}
        role={item.role || roleById[item.id]}
        checked={everyone || pickedIds.has(item.id)}
        disabled={everyone}
        onToggle={toggle}
      />
    ),
    [roleById, everyone, pickedIds, toggle],
  );

  const confirmLabel = everyone
    ? "Confirm · mention everyone"
    : count
      ? `Confirm · mention ${count} ${count === 1 ? "member" : "members"}`
      : "Choose who to mention";

  const memberCount = total || members.length;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <LinearGradient colors={screenGradient} style={styles.screen}>
        {/* HEADER */}
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Back">
            <Ionicons name="chevron-back" size={26} color={INK} />
          </Pressable>
          <View style={styles.flex}>
            <Text style={styles.title}>Mention members</Text>
            {subtitle ? (
              <Text style={styles.subtitle} numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
          </View>
          <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close">
            <Ionicons name="close" size={26} color={MUTED} />
          </Pressable>
        </View>

        {/* SEARCH */}
        <View style={styles.top}>
          <View style={styles.search}>
            <Ionicons name="ellipse-outline" size={16} color={MUTED} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Find a member"
              placeholderTextColor="#9AA3B5"
              style={styles.searchInput}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {loadingPage === 1 ? <ActivityIndicator size="small" color={PINK} /> : null}
          </View>

          {/* EVERYONE */}
          {!searching ? (
            <Pressable
              style={styles.everyoneRow}
              onPress={() => setEveryone((value) => !value)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: everyone }}>
              <Checkbox checked={everyone} />
              <Text style={styles.everyoneText}>Everyone</Text>
              <View style={styles.countChip}>
                <Text style={styles.countChipText}>
                  {memberCount} {memberCount === 1 ? "member" : "members"}
                </Text>
              </View>
            </Pressable>
          ) : null}
        </View>

        {/* PEOPLE */}
        <FlatList
          style={styles.flex}
          contentContainerStyle={styles.list}
          data={rows}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          extraData={pickedIds}
          ItemSeparatorComponent={Separator}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          initialNumToRender={12}
          maxToRenderPerBatch={12}
          windowSize={9}
          removeClippedSubviews={Platform.OS === "android"}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          ListEmptyComponent={
            loadingPage ? null : (
              <Text style={styles.empty}>
                {error || (searching ? "No one matches that name." : "No one else is in this chat yet.")}
              </Text>
            )
          }
          ListFooterComponent={
            loadingPage > 1 ? (
              <ActivityIndicator color={PINK} style={styles.more} />
            ) : error && rows.length ? (
              <Pressable onPress={() => fetchPage(query.trim(), page + 1)} style={styles.more}>
                <Text style={styles.retry}>Couldn&apos;t load more · tap to retry</Text>
              </Pressable>
            ) : null
          }
        />

        {/* SUMMARY + CONFIRM */}
        <View style={[styles.footer, { paddingBottom: insets.bottom + 14 }]}>
          {everyone || count ? (
            <>
              <Text style={styles.selected} numberOfLines={2}>
                {everyone ? `Everyone selected · ${memberCount} members` : `${count} selected · ${namesOf(picked)}`}
              </Text>
              <Text style={styles.selectedHint}>They&apos;ll be notified when you send your message.</Text>
            </>
          ) : null}
          <Pressable
            style={[styles.confirm, !everyone && !count && styles.off]}
            disabled={!everyone && !count}
            onPress={() => onDone(everyone ? [] : picked, everyone)}>
            <Text style={styles.confirmText}>{confirmLabel}</Text>
          </Pressable>
        </View>
      </LinearGradient>
    </Modal>
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

  list: { paddingHorizontal: 18, paddingBottom: 12 },

  search: {
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
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

  everyoneRow: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 18 },

  everyoneText: { flex: 1, fontFamily: FONTS.semibold, fontSize: 16, color: INK },

  countChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: "#ECE8F4" },

  countChipText: { fontFamily: FONTS.medium, fontSize: 11.5, color: MUTED },

  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },

  separator: { height: 1, backgroundColor: LINE },

  check: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: "#C9CFDB",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },

  checkOn: { backgroundColor: PINK, borderColor: PINK },

  nameRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 3 },

  name: { flexShrink: 1, fontFamily: FONTS.semibold, fontSize: 15, color: INK },

  role: { fontFamily: FONTS.semibold, fontSize: 11, color: PINK },

  detail: { marginTop: 3, fontFamily: FONTS.regular, fontSize: 12, color: MUTED },

  empty: { paddingVertical: 20, textAlign: "center", fontFamily: FONTS.regular, fontSize: 13, color: MUTED },

  more: { alignSelf: "center", paddingVertical: 16 },

  retry: { fontFamily: FONTS.semibold, fontSize: 13, color: PINK },

  footer: { paddingHorizontal: 18, paddingTop: 12 },

  selected: { fontFamily: FONTS.semibold, fontSize: 13.5, color: PINK },

  selectedHint: { marginTop: 8, marginBottom: 14, fontFamily: FONTS.regular, fontSize: 13, color: MUTED },

  confirm: { height: 52, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: PINK },

  confirmText: { fontFamily: FONTS.semibold, fontSize: 16, color: "#FFFFFF" },
});
