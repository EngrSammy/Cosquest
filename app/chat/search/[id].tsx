// ==========================================
// SEARCH IN CHAT (Figma M16)
// ==========================================
// Search box, "All dates · Messages · 3 results", recent searches, then
// result cards: date, avatar/name/role/rank, the message, its context label
// ("Spider-Man uniform · revived", "Original conversation") and "Jump to
// message", which opens the surrounding conversation. "Results open with the
// surrounding conversation."
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
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
import { getMessageContext, searchChat, type SearchResult } from "@/services/chatExtras";
import { useAppSelector } from "@/store/hooks";
import { safeBack } from "@/utils/safeBack";

const PINK = "#B63D91";
const INK = "#24283C";
const MUTED = "#66738A";
const LILAC = "#F0EDF9";
const LINE = "rgba(36,40,60,0.08)";

// Recent searches for this session (per chat).
const RECENT: Record<string, string[]> = {};

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
  const name = message.sender?.name || message.sender?.username || "Someone";
  return (
    <View>
      <View style={styles.senderRow}>
        <View style={[styles.avatar, { backgroundColor: avatarTint(name) }]}>
          <Text style={styles.avatarText}>{initialsOf(name)}</Text>
        </View>
        <View style={styles.flex}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>
              {name}
            </Text>
            {message.senderGroupRole ? (
              <Text style={styles.role}>{message.senderGroupRole === "owner" ? "Owner" : "Admin"}</Text>
            ) : null}
          </View>
          <RankLine rank={message.sender?.rank} />
        </View>
      </View>
      <View style={[styles.bubble, highlight && styles.bubbleHighlight]}>
        <Text style={styles.bubbleText}>{textOf(message)}</Text>
        <Text style={styles.bubbleTime}>{timeOf(message.createdAt)}</Text>
      </View>
    </View>
  );
}

export default function SearchInChat() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const conversationId = Array.isArray(id) ? id[0] : id;

  const token = useAppSelector((state) => state.auth.token);
  const chat = useAppSelector((state) =>
    (state.chat.conversations as any[]).find((item) => String(item.id) === String(conversationId)),
  );

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [oldestFirst, setOldestFirst] = useState(false);
  const [recent, setRecent] = useState<string[]>(RECENT[conversationId] || []);

  // Jump to message
  const [context, setContext] = useState<{ targetId: string; messages: any[] } | null>(null);
  const [contextLoading, setContextLoading] = useState(false);
  const contextRef = useRef<ScrollView>(null);

  const run = async (text: string, nextPage: number) => {
    if (!token || !conversationId) return;
    try {
      setLoading(true);
      setError(null);
      const result = await searchChat(conversationId, text, nextPage, token);
      setResults((current) => (nextPage === 1 ? result.results : [...current, ...result.results]));
      setTotal(result.total);
      setHasMore(result.hasMore);
      setPage(nextPage);
      if (nextPage === 1) {
        const list = [text, ...(RECENT[conversationId] || []).filter((item) => item.toLowerCase() !== text.toLowerCase())].slice(0, 5);
        RECENT[conversationId] = list;
        setRecent(list);
      }
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : "Couldn't search.");
    } finally {
      setLoading(false);
    }
  };

  // Search as you type (2+ characters).
  useEffect(() => {
    const text = query.trim();
    if (text.length < 2) {
      setResults([]);
      setTotal(0);
      setHasMore(false);
      return;
    }
    const timer = setTimeout(() => run(text, 1), 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, conversationId, token]);

  const shown = useMemo(
    () =>
      oldestFirst
        ? [...results].sort((a, b) => new Date(a.message.createdAt).getTime() - new Date(b.message.createdAt).getTime())
        : results,
    [results, oldestFirst],
  );

  const jump = async (result: SearchResult) => {
    if (!token || !conversationId) return;
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
  };

  return (
    <LinearGradient colors={["#F6F9FE", "#E3F0FC"]} style={styles.screen}>
      {/* HEADER */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => safeBack()} hitSlop={10} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={26} color={INK} />
        </Pressable>
        <View style={styles.flex}>
          <Text style={styles.title}>Search in chat</Text>
          {chat?.title ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {chat.title}
            </Text>
          ) : null}
        </View>
        <Pressable onPress={() => safeBack()} hitSlop={10} accessibilityLabel="Close">
          <Ionicons name="close" size={26} color={MUTED} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 30 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        {/* SEARCH BOX */}
        <View style={styles.search}>
          <Ionicons name="ellipse-outline" size={16} color={MUTED} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search messages"
            placeholderTextColor="#9AA3B5"
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.searchInput}
          />
          {loading ? <ActivityIndicator size="small" color={PINK} /> : null}
          {query ? (
            <Pressable onPress={() => setQuery("")} hitSlop={8}>
              <Ionicons name="close-circle" size={17} color="#9AA3B5" />
            </Pressable>
          ) : null}
        </View>

        {/* CHIPS */}
        <View style={styles.chips}>
          <Pressable style={styles.chip} onPress={() => setOldestFirst((value) => !value)}>
            <Text style={styles.chipText}>All dates {oldestFirst ? "↑" : "↓"}</Text>
          </Pressable>
          <View style={[styles.chip, styles.chipOn]}>
            <Text style={[styles.chipText, styles.chipTextOn]}>Messages</Text>
          </View>
          {query.trim().length >= 2 ? (
            <View style={styles.chip}>
              <Text style={styles.chipText}>
                {total} {total === 1 ? "result" : "results"}
              </Text>
            </View>
          ) : null}
        </View>

        {recent.length ? (
          <Text style={styles.recent}>
            Recent searches:{" "}
            {recent.map((item, index) => (
              <Text key={item} style={styles.recentItem} onPress={() => setQuery(item)}>
                {item}
                {index < recent.length - 1 ? " · " : ""}
              </Text>
            ))}
          </Text>
        ) : null}

        {error ? <Text style={styles.empty}>{error}</Text> : null}
        {!loading && !error && query.trim().length >= 2 && !results.length ? (
          <Text style={styles.empty}>No messages match "{query.trim()}".</Text>
        ) : null}
        {query.trim().length < 2 ? <Text style={styles.empty}>Type at least 2 letters to search this chat.</Text> : null}

        {/* RESULTS */}
        {shown.map((result) => (
          <View key={result.message.id} style={styles.card}>
            <Text style={styles.date}>{dateOf(result.message.createdAt)}</Text>
            <MessageBlock message={result.message} />
            <View style={styles.contextChip}>
              <Text style={styles.contextText}>{result.context.label}</Text>
            </View>
            <Pressable style={styles.jump} onPress={() => jump(result)}>
              <Text style={styles.jumpText}>Jump to message ↗</Text>
            </Pressable>
          </View>
        ))}

        {hasMore && !loading ? (
          <Pressable style={styles.more} onPress={() => run(query.trim(), page + 1)}>
            <Text style={styles.moreText}>More results</Text>
          </Pressable>
        ) : null}

        <Text style={styles.footnote}>Results open with the surrounding conversation.</Text>
      </ScrollView>

      {/* SURROUNDING CONVERSATION */}
      <Modal visible={!!context} animationType="slide" onRequestClose={() => setContext(null)}>
        <LinearGradient colors={["#F6F9FE", "#E3F0FC"]} style={styles.screen}>
          <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
            <Pressable onPress={() => setContext(null)} hitSlop={10} accessibilityLabel="Back to results">
              <Ionicons name="chevron-back" size={26} color={INK} />
            </Pressable>
            <View style={styles.flex}>
              <Text style={styles.title}>In the conversation</Text>
              {chat?.title ? <Text style={styles.subtitle}>{chat.title}</Text> : null}
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

const styles = StyleSheet.create({
  screen: { flex: 1 },

  flex: { flex: 1, minWidth: 0 },

  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingBottom: 8 },

  title: { fontFamily: FONTS.semibold, fontSize: 22, lineHeight: 28, color: INK },

  subtitle: { marginTop: 2, fontFamily: FONTS.regular, fontSize: 12, color: MUTED },

  loading: { marginTop: 40 },

  content: { paddingHorizontal: 18, paddingTop: 12 },

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

  recent: { marginTop: 12, fontFamily: FONTS.regular, fontSize: 12.5, color: MUTED },

  recentItem: { color: MUTED, textDecorationLine: "underline" },

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

  avatar: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },

  avatarText: { fontFamily: FONTS.bold, fontSize: 10, color: "#7D356D" },

  nameRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 },

  name: { flexShrink: 1, fontFamily: FONTS.semibold, fontSize: 13, color: INK },

  role: { fontFamily: FONTS.semibold, fontSize: 11, color: PINK },

  bubble: {
    marginTop: 8,
    marginLeft: 38,
    padding: 12,
    borderRadius: 16,
    borderTopLeftRadius: 4,
    backgroundColor: "#FFFFFF",
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

  more: { alignSelf: "center", marginTop: 16, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 14, backgroundColor: LILAC },

  moreText: { fontFamily: FONTS.semibold, fontSize: 13, color: PINK },

  footnote: { marginTop: 18, fontFamily: FONTS.regular, fontSize: 12.5, color: MUTED },

  contextItem: { marginBottom: 16 },

  footer: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 18, paddingTop: 10 },

  primary: { height: 52, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: PINK },

  primaryText: { fontFamily: FONTS.semibold, fontSize: 16, color: "#FFFFFF" },
});
