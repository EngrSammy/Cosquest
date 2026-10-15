// ==========================================
// SEARCH IN CHAT (Figma M16)
// ==========================================
// "Search in chat" + the chat's name, the search box, chips ("All dates ↓",
// "Messages", "3 results"), "Recent searches: route map · mural · Saturday",
// then result cards: date, avatar/name/role/rank, the message bubble, its
// context label ("Spider-Man uniform · revived", "Original conversation") and
// "Jump to message ↗", which opens the surrounding conversation. "Results
// open with the surrounding conversation."
//
// Results are paged from the server (20 at a time, more as you scroll).
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { RankLine } from "@/components/chat/RankBadge";
import { PersonAvatar } from "@/components/groups/AdminUi";
import { FONTS } from "@/constants/fonts";
import { getMessageContext, searchChat, type SearchResult } from "@/services/chatExtras";
import { getConversation } from "@/services/chats";
import { useAppSelector } from "@/store/hooks";
import { getPref, setPref } from "@/utils/prefsStorage";
import { safeBack } from "@/utils/safeBack";
import { DARK_SCREEN_GRADIENT, LIGHT_SCREEN_GRADIENT, themedStyles, useInk, useThemedStyles } from "@/constants/chatTheme";

const PINK = "#B63D91";
const INK = "#24283C";
const MUTED = "#66738A";
const LILAC = "#F0EDF9";
const LINE = "rgba(36,40,60,0.08)";

const RECENT_LIMIT = 3;

// Recent searches per chat (kept in memory, and saved on the phone).
const RECENT: Record<string, string[]> = {};

function recentKey(conversationId: string) {
  return `chatSearchRecent.${conversationId}`;
}

type DateRange = "all" | "week" | "month" | "year";

const DATE_OPTIONS: { value: DateRange; label: string; days: number }[] = [
  { value: "all", label: "All dates", days: 0 },
  { value: "week", label: "Past week", days: 7 },
  { value: "month", label: "Past month", days: 30 },
  { value: "year", label: "Past year", days: 365 },
];

function fromFor(range: DateRange) {
  const days = DATE_OPTIONS.find((option) => option.value === range)?.days || 0;
  if (!days) return null;
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

function dateOf(value?: string) {
  return value ? new Date(value).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }) : "";
}

function timeOf(value?: string) {
  return value ? new Date(value).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "";
}

function textOf(message: any) {
  if (message.kind === "poll") return `📊 ${message.poll?.question || message.content}`;
  if (message.kind === "audio") return `🎤 ${message.media?.transcript || "Voice message"}`;
  if (message.kind === "album") return message.content ? `📷 ${message.content}` : "📷 Photos";
  return message.content || "Message";
}

// Avatar, name + Owner/Admin, rank line, and the message bubble.
function MessageBlock({ message, highlight }: { message: any; highlight?: boolean }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const sender = message.sender || {};
  const name = sender.name || sender.username || "Someone";
  const role = message.senderGroupRole;
  return (
    <View>
      <View style={styles.senderRow}>
        <PersonAvatar person={{ ...sender, username: sender.username || name }} size={30} />
        <View style={styles.flex}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>
              {name}
            </Text>
            {role === "owner" || role === "admin" ? (
              <Text style={styles.role}>{role === "owner" ? "Owner" : "Admin"}</Text>
            ) : null}
          </View>
          <RankLine rank={sender.rank} />
        </View>
      </View>
      <View style={[styles.bubble, highlight && styles.bubbleHighlight]}>
        <Text style={styles.bubbleText}>{textOf(message)}</Text>
        <Text style={styles.bubbleTime}>{timeOf(message.createdAt)}</Text>
      </View>
    </View>
  );
}

const ResultCard = memo(function ResultCard({
  result,
  onJump,
}: {
  result: SearchResult;
  onJump: (result: SearchResult) => void;
}) {
  const styles = useThemedStyles(STYLE_PAIR);
  return (
    <View style={styles.card}>
      <Text style={styles.date}>{dateOf(result.message.createdAt)}</Text>
      <MessageBlock message={result.message} />
      {result.context?.label ? (
        <View style={styles.contextChip}>
          <Text style={styles.contextText}>{result.context.label}</Text>
        </View>
      ) : null}
      <Pressable style={styles.jump} onPress={() => onJump(result)}>
        <Text style={styles.jumpText}>Jump to message ↗</Text>
      </Pressable>
    </View>
  );
});

export default function SearchInChat() {
  const styles = useThemedStyles(STYLE_PAIR);
  const screenGradient = useInk().dark ? DARK_SCREEN_GRADIENT : LIGHT_SCREEN_GRADIENT;
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const conversationId = Array.isArray(id) ? id[0] : id;

  const token = useAppSelector((state) => state.auth.token);
  const chat = useAppSelector(
    (state) =>
      state.chat.conversationDetails[conversationId] ||
      (state.chat.conversations as any[]).find((item) => String(item.id) === String(conversationId)),
  ) as { title?: string; name?: string } | undefined;
  // Opened straight from a link: ask the server for the chat's name (M16).
  const [fetchedTitle, setFetchedTitle] = useState("");
  const knownTitle = chat?.title || chat?.name || "";
  useEffect(() => {
    if (knownTitle || !token || !conversationId) return;
    let cancelled = false;
    getConversation(conversationId, token)
      .then((detail: any) => {
        if (!cancelled) setFetchedTitle(detail?.title || detail?.name || "");
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [knownTitle, token, conversationId]);
  const chatTitle = knownTitle || fetchedTitle;

  const [query, setQuery] = useState("");
  const [range, setRange] = useState<DateRange>("all");
  const [showDates, setShowDates] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  // The page being loaded (0 = idle).
  const [loadingPage, setLoadingPage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<string[]>(RECENT[conversationId] || []);

  const requestRef = useRef(0);
  const loadingRef = useRef(false);
  // The last search that found something (remembered when you leave).
  const lastFoundRef = useRef("");

  // Jump to message
  const [context, setContext] = useState<{ targetId: string; messages: any[] } | null>(null);
  const [contextLoading, setContextLoading] = useState(false);
  const contextRef = useRef<ScrollView>(null);

  // Saved recent searches (first visit this session).
  useEffect(() => {
    if (!conversationId || RECENT[conversationId]) return;
    let cancelled = false;
    getPref(recentKey(conversationId)).then((saved) => {
      if (cancelled || !saved) return;
      try {
        const list = JSON.parse(saved);
        if (Array.isArray(list)) {
          RECENT[conversationId] = list.filter((item) => typeof item === "string").slice(0, RECENT_LIMIT);
          setRecent(RECENT[conversationId]);
        }
      } catch {
        // Not readable - start a new list.
      }
    });
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  // Most recent first, no repeats, up to 3.
  const remember = useCallback(
    (text: string) => {
      const value = text.trim();
      if (!conversationId || value.length < 2) return;
      const list = [value, ...(RECENT[conversationId] || []).filter((item) => item.toLowerCase() !== value.toLowerCase())].slice(
        0,
        RECENT_LIMIT,
      );
      RECENT[conversationId] = list;
      setRecent(list);
      setPref(recentKey(conversationId), JSON.stringify(list));
    },
    [conversationId],
  );

  // Leaving the screen after a search counts as a recent search too.
  const rememberRef = useRef(remember);
  rememberRef.current = remember;
  useEffect(() => () => rememberRef.current(lastFoundRef.current), []);

  const run = useCallback(
    async (text: string, nextPage: number, dates: DateRange) => {
      if (!token || !conversationId) return;
      const request = ++requestRef.current;
      loadingRef.current = true;
      const from = fromFor(dates);
      try {
        setLoadingPage(nextPage);
        setError(null);
        const result = await searchChat(conversationId, text, nextPage, token, { from });
        if (request !== requestRef.current) return;
        // Older backends ignore "from": leave out anything earlier.
        const fromTime = from ? new Date(from).getTime() : 0;
        const found = fromTime
          ? result.results.filter((item) => new Date(item.message?.createdAt || 0).getTime() >= fromTime)
          : result.results;
        setResults((current) => {
          if (nextPage === 1) return found;
          const seen = new Set(current.map((item) => item.message.id));
          return [...current, ...found.filter((item) => !seen.has(item.message.id))];
        });
        setTotal(result.total);
        setHasMore(result.hasMore);
        setPage(nextPage);
        if (nextPage === 1) lastFoundRef.current = found.length ? text : "";
      } catch (searchError) {
        if (request !== requestRef.current) return;
        setError(searchError instanceof Error ? searchError.message : "Couldn't search.");
      } finally {
        if (request === requestRef.current) {
          loadingRef.current = false;
          setLoadingPage(0);
        }
      }
    },
    [token, conversationId],
  );

  // Search as you type (2+ characters), and again when the dates change.
  const text = query.trim();
  const ready = text.length >= 2;
  useEffect(() => {
    if (!ready) {
      requestRef.current += 1;
      loadingRef.current = false;
      setLoadingPage(0);
      setResults([]);
      setTotal(0);
      setHasMore(false);
      setError(null);
      return;
    }
    const timer = setTimeout(() => run(text, 1, range), 400);
    return () => clearTimeout(timer);
  }, [text, ready, range, run]);

  const loadMore = useCallback(() => {
    if (!ready || loadingRef.current || !hasMore || error) return;
    run(text, page + 1, range);
  }, [ready, hasMore, error, run, text, page, range]);

  const jump = useCallback(
    async (result: SearchResult) => {
      if (!token || !conversationId) return;
      remember(text);
      try {
        setContextLoading(true);
        setContext({ targetId: result.message.id, messages: [] });
        const data = await getMessageContext(conversationId, result.message.id, token);
        setContext(data);
      } catch {
        setContext(null);
      } finally {
        setContextLoading(false);
      }
    },
    [token, conversationId, remember, text],
  );

  const renderItem = useCallback(
    ({ item }: { item: SearchResult }) => <ResultCard result={item} onJump={jump} />,
    [jump],
  );

  const dateLabel = DATE_OPTIONS.find((option) => option.value === range)?.label || "All dates";
  const recentShown = useMemo(() => recent.slice(0, RECENT_LIMIT), [recent]);

  return (
    <LinearGradient colors={screenGradient} style={styles.screen}>
      {/* HEADER */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => safeBack()} hitSlop={10} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={26} color={INK} />
        </Pressable>
        <View style={styles.flex}>
          <Text style={styles.title}>Search in chat</Text>
          {chatTitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {chatTitle}
            </Text>
          ) : null}
        </View>
        <Pressable onPress={() => safeBack()} hitSlop={10} accessibilityLabel="Close">
          <Ionicons name="close" size={26} color={MUTED} />
        </Pressable>
      </View>

      <View style={styles.top}>
        {/* SEARCH BOX */}
        <View style={styles.search}>
          <Ionicons name="ellipse-outline" size={16} color={MUTED} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => remember(query)}
            returnKeyType="search"
            placeholder="Search messages"
            placeholderTextColor="#9AA3B5"
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.searchInput}
          />
          {loadingPage === 1 ? <ActivityIndicator size="small" color={PINK} /> : null}
          {query ? (
            <Pressable onPress={() => setQuery("")} hitSlop={8} accessibilityLabel="Clear search">
              <Ionicons name="close-circle" size={17} color="#9AA3B5" />
            </Pressable>
          ) : null}
        </View>

        {/* CHIPS */}
        <View style={styles.chips}>
          <Pressable
            style={[styles.chip, range !== "all" && styles.chipOn]}
            onPress={() => setShowDates((value) => !value)}
            accessibilityLabel={`Dates: ${dateLabel}`}>
            <Text style={[styles.chipText, range !== "all" && styles.chipTextOn]}>{dateLabel} ↓</Text>
          </Pressable>
          <View style={[styles.chip, styles.chipOn]}>
            <Text style={[styles.chipText, styles.chipTextOn]}>Messages</Text>
          </View>
          {ready && !(loadingPage === 1 && !results.length) ? (
            <View style={styles.chip}>
              <Text style={styles.chipText}>
                {total} {total === 1 ? "result" : "results"}
              </Text>
            </View>
          ) : null}
        </View>

        {showDates ? (
          <View style={styles.menu}>
            {DATE_OPTIONS.map((option, index) => (
              <Pressable
                key={option.value}
                style={[styles.menuRow, index === DATE_OPTIONS.length - 1 && styles.menuRowLast]}
                onPress={() => {
                  setRange(option.value);
                  setShowDates(false);
                }}>
                <Text style={[styles.menuText, option.value === range && styles.menuTextOn]}>{option.label}</Text>
                {option.value === range ? <Ionicons name="checkmark" size={18} color={PINK} /> : null}
              </Pressable>
            ))}
          </View>
        ) : null}

        {recentShown.length ? (
          <Text style={styles.recent}>
            Recent searches:{" "}
            {recentShown.map((item, index) => (
              <Text
                key={item}
                style={styles.recentItem}
                onPress={() => {
                  setQuery(item);
                  remember(item);
                }}>
                {item}
                {index < recentShown.length - 1 ? " · " : ""}
              </Text>
            ))}
          </Text>
        ) : null}
      </View>

      {/* RESULTS */}
      <FlatList
        style={styles.flex}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 30 }]}
        data={ready ? results : []}
        keyExtractor={(item) => item.message.id}
        renderItem={renderItem}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        initialNumToRender={6}
        maxToRenderPerBatch={6}
        windowSize={7}
        removeClippedSubviews={Platform.OS === "android"}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          !ready ? (
            <Text style={styles.empty}>Type at least 2 letters to search this chat.</Text>
          ) : error ? (
            <Text style={styles.empty}>{error}</Text>
          ) : loadingPage ? null : (
            <Text style={styles.empty}>
              No messages match “{text}”{range !== "all" ? ` in the ${dateLabel.toLowerCase()}` : ""}.
            </Text>
          )
        }
        ListFooterComponent={
          <>
            {loadingPage > 1 ? <ActivityIndicator color={PINK} style={styles.moreSpinner} /> : null}
            {error && results.length ? (
              <Pressable style={styles.more} onPress={() => run(text, page + 1, range)}>
                <Text style={styles.moreText}>Couldn&apos;t load more · tap to retry</Text>
              </Pressable>
            ) : null}
            <Text style={styles.footnote}>Results open with the surrounding conversation.</Text>
          </>
        }
      />

      {/* SURROUNDING CONVERSATION */}
      <Modal visible={!!context} animationType="slide" onRequestClose={() => setContext(null)}>
        <LinearGradient colors={screenGradient} style={styles.screen}>
          <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
            <Pressable onPress={() => setContext(null)} hitSlop={10} accessibilityLabel="Back to results">
              <Ionicons name="chevron-back" size={26} color={INK} />
            </Pressable>
            <View style={styles.flex}>
              <Text style={styles.title}>In the conversation</Text>
              {chatTitle ? <Text style={styles.subtitle}>{chatTitle}</Text> : null}
            </View>
          </View>

          {contextLoading ? (
            <ActivityIndicator color={PINK} style={styles.loading} />
          ) : (
            <ScrollView
              ref={contextRef}
              contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 110 }]}
              onContentSizeChange={() => {
                // Bring the found message into view (roughly the middle).
                const index = context?.messages.findIndex((m) => m.id === context?.targetId) ?? 0;
                contextRef.current?.scrollTo({ y: Math.max(0, index * 120 - 200), animated: false });
              }}>
              {context?.messages.map((message) => (
                <View key={message.id} style={styles.contextItem}>
                  <MessageBlock message={message} highlight={message.id === context?.targetId} />
                </View>
              ))}
            </ScrollView>
          )}

          <View style={[styles.footer, { paddingBottom: insets.bottom + 14 }]}>
            <Pressable
              style={styles.primary}
              onPress={() => {
                setContext(null);
                router.push({ pathname: "/chat/[id]", params: { id: conversationId } });
              }}>
              <Text style={styles.primaryText}>Open the chat</Text>
            </Pressable>
          </View>
        </LinearGradient>
      </Modal>
    </LinearGradient>
  );
}

const STYLE_PAIR = themedStyles({
  screen: { flex: 1 },

  flex: { flex: 1, minWidth: 0 },

  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingBottom: 8 },

  title: { fontFamily: FONTS.semibold, fontSize: 22, lineHeight: 28, color: INK },

  subtitle: { marginTop: 2, fontFamily: FONTS.regular, fontSize: 12, color: MUTED },

  loading: { marginTop: 40 },

  top: { paddingHorizontal: 18, paddingTop: 12 },

  content: { paddingHorizontal: 18, paddingTop: 4 },

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

  chips: { flexDirection: "row", gap: 8, marginTop: 14 },

  chip: { paddingHorizontal: 12, height: 28, borderRadius: 14, justifyContent: "center", backgroundColor: "#ECE8F4" },

  chipOn: { backgroundColor: "#F3DDED" },

  chipText: { fontFamily: FONTS.medium, fontSize: 12, color: MUTED },

  chipTextOn: { color: PINK, fontFamily: FONTS.semibold },

  menu: {
    alignSelf: "flex-start",
    minWidth: 180,
    marginTop: 8,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: LINE,
  },

  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: LINE,
  },

  menuRowLast: { borderBottomWidth: 0 },

  menuText: { fontFamily: FONTS.medium, fontSize: 14, color: INK },

  menuTextOn: { color: PINK, fontFamily: FONTS.semibold },

  recent: { marginTop: 12, marginBottom: 4, fontFamily: FONTS.regular, fontSize: 12.5, color: MUTED },

  recentItem: { color: MUTED },

  empty: { marginTop: 24, textAlign: "center", fontFamily: FONTS.regular, fontSize: 13, color: MUTED },

  card: {
    marginTop: 16,
    padding: 14,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: LINE,
  },

  date: { marginBottom: 10, fontFamily: FONTS.regular, fontSize: 12, color: MUTED },

  senderRow: { flexDirection: "row", alignItems: "center", gap: 8 },

  nameRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 },

  name: { flexShrink: 1, fontFamily: FONTS.semibold, fontSize: 13, color: INK },

  role: { fontFamily: FONTS.semibold, fontSize: 11, color: PINK },

  bubble: {
    marginTop: 8,
    marginLeft: 38,
    padding: 12,
    borderRadius: 16,
    borderTopLeftRadius: 4,
    backgroundColor: "#F1F2F5",
  },

  bubbleHighlight: { borderWidth: 2, borderColor: PINK, backgroundColor: "#FDF4F9" },

  bubbleText: { fontFamily: FONTS.regular, fontSize: 15, lineHeight: 22, color: INK },

  bubbleTime: { marginTop: 8, fontFamily: FONTS.regular, fontSize: 11, color: MUTED },

  contextChip: {
    alignSelf: "flex-start",
    marginTop: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: "#ECE8F4",
  },

  contextText: { fontFamily: FONTS.medium, fontSize: 11.5, color: MUTED },

  jump: {
    marginTop: 12,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: LILAC,
  },

  jumpText: { fontFamily: FONTS.semibold, fontSize: 15, color: PINK },

  moreSpinner: { marginTop: 16 },

  more: { alignSelf: "center", marginTop: 16, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 14, backgroundColor: LILAC },

  moreText: { fontFamily: FONTS.semibold, fontSize: 13, color: PINK },

  footnote: { marginTop: 18, fontFamily: FONTS.regular, fontSize: 12.5, color: MUTED },

  contextItem: { marginBottom: 16 },

  footer: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 18, paddingTop: 10 },

  primary: { height: 52, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: PINK },

  primaryText: { fontFamily: FONTS.semibold, fontSize: 16, color: "#FFFFFF" },
});
