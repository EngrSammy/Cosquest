// ==========================================
// A CALL'S FULL TRANSCRIPT
// ==========================================
// Everyone's lines from one call, merged by our backend from the phones that
// had Sparks on (GET /api/calls/:callId/transcript), oldest first:
//  - who is in it and who isn't (TranscriptCoverage), so a missing person
//    is explained instead of looking like silence
//  - lines grouped by speaker (avatar, name, time into the call); the
//    viewer's own lines carry their name with "(you)"
//  - a divider in the topic's colour where the call moved on to a new
//    Spark, "Back to ..." when it returned to one
//  - more pages as you scroll; while the call is live it checks for new
//    lines every 5 seconds
// The screen is app/call-transcript/[callId].tsx. `loadPage` can be swapped
// for mock data (app/dev/call-transcript.tsx), so it renders without a network.
import Ionicons from "@expo/vector-icons/Ionicons";
import { Image as ExpoImage } from "expo-image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { TOPIC_COLORS } from "@/components/calls/SparksCallNotes";
import TranscriptCoverage from "@/components/calls/TranscriptCoverage";
import { ScreenGradient, UI } from "@/components/chat/ui";
import { themedStyles, useInk, useThemedStyles } from "@/constants/chatTheme";
import { FONTS } from "@/constants/fonts";
import {
  errorStatus,
  fetchCallTranscript,
  type CallTranscriptPage,
  type CallTranscriptSegment,
  type CallTranscriptTopic,
} from "@/services/callTranscript";
import {
  callClock,
  callWhen,
  emptyTranscriptCopy,
  speakerLabel,
  transcriptErrorCopy,
  type TranscriptParticipant,
  type TranscriptSpeakers,
} from "@/services/callTranscriptCopy";
import { getAvatarSource } from "@/utils/callHelpers";
import { safeBack } from "@/utils/safeBack";

const PAGE_SIZE = 100;
const LIVE_POLL_MS = 5_000;

export type LoadTranscriptPage = (cursor: string | null) => Promise<CallTranscriptPage>;

type Head = {
  status: CallTranscriptPage["status"];
  kind: CallTranscriptPage["kind"];
  startedAt: string;
  endedAt: string | null;
  participants: TranscriptParticipant[] | null;
};

type Row =
  | { type: "topic"; key: string; title: string; color: string; back: boolean }
  | { type: "group"; key: string; userId: string; startMs: number; lines: CallTranscriptSegment[] };

/** Lines oldest first, a divider whenever the topic changes, consecutive lines by one person grouped. */
export function buildTranscriptRows(segments: CallTranscriptSegment[], topics: CallTranscriptTopic[]): Row[] {
  const topicById = new Map<string, CallTranscriptTopic>();
  for (const topic of topics) if (!topicById.has(topic.topicId)) topicById.set(topic.topicId, topic);

  const rows: Row[] = [];
  const seen = new Set<string>();
  let topicId: string | null = null;
  let group: Extract<Row, { type: "group" }> | null = null;
  for (const segment of segments) {
    if (segment.topicId && segment.topicId !== topicId) {
      topicId = segment.topicId;
      const topic = topicById.get(topicId);
      if (topic) {
        rows.push({
          type: "topic",
          key: `t_${segment.segmentId}`,
          title: topic.title,
          color: TOPIC_COLORS[topic.colorIndex % TOPIC_COLORS.length],
          back: seen.has(topicId),
        });
        group = null;
      }
      seen.add(topicId);
    }
    if (group && group.userId === segment.userId) {
      group.lines.push(segment);
    } else {
      group = { type: "group", key: `g_${segment.segmentId}`, userId: segment.userId, startMs: segment.startMs, lines: [segment] };
      rows.push(group);
    }
  }
  return rows;
}

export default function CallTranscriptView({
  callId,
  token,
  myUserId,
  loadPage,
  onBack,
  onNavigate,
}: {
  callId: string;
  token: string | null | undefined;
  myUserId: string | null;
  /** Replaces the network (dev previews). */
  loadPage?: LoadTranscriptPage;
  onBack?: () => void;
  /** Opens another screen (the Sparks setup). Default: router.push. */
  onNavigate?: (href: string) => void;
}) {
  const styles = useThemedStyles(STYLE_PAIR);
  const ink = useInk();
  const insets = useSafeAreaInsets();

  const load = useCallback<LoadTranscriptPage>(
    (cursor) => {
      if (loadPage) return loadPage(cursor);
      if (!token) return Promise.reject(Object.assign(new Error("Not logged in"), { status: 403 }));
      return fetchCallTranscript(callId, token, { cursor, limit: PAGE_SIZE });
    },
    [loadPage, token, callId],
  );

  const [head, setHead] = useState<Head | null>(null);
  const [segments, setSegments] = useState<CallTranscriptSegment[]>([]);
  const [topics, setTopics] = useState<CallTranscriptTopic[]>([]);
  const [speakers, setSpeakers] = useState<TranscriptSpeakers>({});
  const [nextCursor, setNextCursorState] = useState<string | null>(null);
  const nextRef = useRef<string | null>(null);
  const setNextCursor = useCallback((cursor: string | null) => {
    nextRef.current = cursor;
    setNextCursorState(cursor);
  }, []);
  const [failed, setFailed] = useState<number | null | undefined>(undefined);
  const [loadingMore, setLoadingMore] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // The cursor of the last page fetched after the first one (null: only the first).
  const lastCursor = useRef<string | null>(null);

  const absorb = useCallback((page: CallTranscriptPage, first: boolean) => {
    if (first) {
      setHead((current) => ({
        status: page.status,
        kind: page.kind,
        startedAt: page.startedAt,
        endedAt: page.endedAt,
        participants: page.participants ?? current?.participants ?? null,
      }));
    }
    setSegments((current) => {
      const byId = new Map(current.map((s) => [s.segmentId, s]));
      for (const segment of page.segments) if (segment.text?.trim()) byId.set(segment.segmentId, segment);
      return [...byId.values()].sort((a, b) => a.startMs - b.startMs || a.segmentId.localeCompare(b.segmentId));
    });
    setTopics((current) => {
      const known = new Set(current.map((t) => `${t.topicId}:${t.startedAtMs}`));
      const added = page.topics.filter((t) => !known.has(`${t.topicId}:${t.startedAtMs}`));
      return added.length ? [...current, ...added].sort((a, b) => a.startedAtMs - b.startedAtMs) : current;
    });
    setSpeakers((current) => ({ ...current, ...page.speakers }));
  }, []);

  // First page (and again on "Try again").
  useEffect(() => {
    let cancelled = false;
    setFailed(undefined);
    lastCursor.current = null;
    load(null)
      .then((page) => {
        if (cancelled) return;
        absorb(page, true);
        setNextCursor(page.nextCursor);
      })
      .catch((error) => {
        if (!cancelled) setFailed(errorStatus(error));
      });
    return () => {
      cancelled = true;
    };
  }, [load, absorb, setNextCursor, attempt]);

  // Live: every 5 s, the first page (who's in, the call's status) and, once
  // every page is loaded, the last one again (new lines land at the end).
  const live = head?.status === "active";
  useEffect(() => {
    if (!live) return;
    let cancelled = false;
    const timer = setInterval(async () => {
      try {
        const first = await load(null);
        if (cancelled) return;
        absorb(first, true);
        if (lastCursor.current === null) {
          setNextCursor(first.nextCursor);
          return;
        }
        // More pages still to scroll to: the new lines come with them.
        if (nextRef.current !== null) return;
        const last = await load(lastCursor.current);
        if (cancelled) return;
        absorb(last, false);
        setNextCursor(last.nextCursor);
      } catch {
        // Keep what's on screen; the next tick tries again.
      }
    }, LIVE_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [live, load, absorb, setNextCursor]);

  const loadMore = useCallback(() => {
    if (!nextCursor || loadingMore) return;
    const cursor = nextCursor;
    setLoadingMore(true);
    load(cursor)
      .then((page) => {
        lastCursor.current = cursor;
        absorb(page, false);
        setNextCursor(page.nextCursor);
      })
      .catch(() => {})
      .finally(() => setLoadingMore(false));
  }, [nextCursor, loadingMore, load, absorb, setNextCursor]);

  const rows = useMemo(() => buildTranscriptRows(segments, topics), [segments, topics]);

  const header = (
    <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
      <Pressable onPress={onBack || (() => safeBack())} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back">
        <Ionicons name="chevron-back" size={26} color={ink.text(UI.INK)} />
      </Pressable>
      <View style={styles.headerText}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>Transcript</Text>
          {live ? (
            <View style={styles.livePill} accessibilityLabel="The call is live">
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>Live</Text>
            </View>
          ) : null}
        </View>
        {head ? (
          <Text style={styles.when} numberOfLines={1}>
            {head.kind === "voice_room" ? "Voice chat · " : ""}
            {callWhen(head.startedAt, live ? null : head.endedAt)}
          </Text>
        ) : null}
      </View>
    </View>
  );

  if (failed !== undefined) {
    const copy = transcriptErrorCopy(failed);
    return (
      <View style={styles.screen}>
        <ScreenGradient />
        {header}
        <View style={styles.center}>
          <Ionicons name="document-text-outline" size={34} color={ink.text(UI.MUTED)} />
          <Text style={styles.stateTitle}>{copy.title}</Text>
          <Text style={styles.stateBody}>{copy.body}</Text>
          {copy.retry ? (
            <Pressable style={styles.retry} onPress={() => setAttempt((n) => n + 1)} accessibilityRole="button">
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    );
  }

  if (!head) {
    return (
      <View style={styles.screen}>
        <ScreenGradient />
        {header}
        <ActivityIndicator style={{ marginTop: 48 }} color={ink.text(UI.PINK)} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScreenGradient />
      {header}
      <FlatList
        data={rows}
        keyExtractor={(row) => row.key}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]}
        onEndReached={loadMore}
        onEndReachedThreshold={0.6}
        ListHeaderComponent={
          <TranscriptCoverage
            participants={head.participants}
            myUserId={myUserId}
            speakers={speakers}
            style={styles.coverage}
            onNavigate={onNavigate}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Ionicons name="chatbubbles-outline" size={30} color={ink.text(UI.MUTED)} />
            <Text style={styles.stateBody}>{emptyTranscriptCopy(head.participants, head.status)}</Text>
          </View>
        }
        ListFooterComponent={
          loadingMore ? (
            <ActivityIndicator style={{ marginVertical: 16 }} color={ink.text(UI.PINK)} />
          ) : rows.length && live && !nextCursor ? (
            <Text style={styles.footer}>New lines appear here as people talk.</Text>
          ) : null
        }
        renderItem={({ item }) =>
          item.type === "topic" ? (
            <View style={styles.topicRow} accessibilityRole="header">
              <View style={[styles.topicLine, { backgroundColor: item.color }]} />
              <View style={[styles.topicPill, { borderColor: item.color }]}>
                <View style={[styles.topicDot, { backgroundColor: item.color }]} />
                <Text style={styles.topicText} numberOfLines={1}>
                  {item.back ? `Back to ${item.title}` : item.title}
                </Text>
              </View>
              <View style={[styles.topicLine, { backgroundColor: item.color }]} />
            </View>
          ) : (
            <SpeakerGroup
              userId={item.userId}
              startMs={item.startMs}
              lines={item.lines}
              myUserId={myUserId}
              speakers={speakers}
              participants={head.participants}
            />
          )
        }
      />
    </View>
  );
}

function SpeakerGroup({
  userId,
  startMs,
  lines,
  myUserId,
  speakers,
  participants,
}: {
  userId: string;
  startMs: number;
  lines: CallTranscriptSegment[];
  myUserId: string | null;
  speakers: TranscriptSpeakers;
  participants: TranscriptParticipant[] | null;
}) {
  const styles = useThemedStyles(STYLE_PAIR);
  const fallback = participants?.find((p) => p.userId === userId)?.displayName;
  const label = speakerLabel(userId, myUserId, speakers, fallback);
  return (
    <View style={styles.group}>
      <ExpoImage source={getAvatarSource(speakers[userId] || null)} style={styles.avatar} contentFit="cover" />
      <View style={styles.groupBody}>
        <View style={styles.nameRow}>
          {/* The viewer by name too, with "(you)", as on the call screen. */}
          <Text style={styles.name} numberOfLines={1}>
            {label.name}
            {label.isMe && label.name !== "You" ? <Text style={styles.you}> (you)</Text> : null}
          </Text>
          <Text style={styles.time}>{callClock(startMs)}</Text>
        </View>
        {lines.map((line) => (
          <Text key={line.segmentId} style={styles.line}>
            {line.text.trim()}
          </Text>
        ))}
      </View>
    </View>
  );
}

const STYLE_PAIR = themedStyles({
  screen: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingBottom: 10 },
  headerText: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  title: { fontFamily: FONTS.semibold, fontSize: 22, lineHeight: 28, color: UI.INK },
  when: { fontFamily: FONTS.regular, fontSize: 13, color: UI.MUTED, marginTop: 1 },
  livePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "#E7F6EE",
  },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#2FB36B" },
  liveText: { fontFamily: FONTS.semibold, fontSize: 12, color: "#1F7A4A" },

  content: { paddingHorizontal: 18, paddingTop: 6 },
  coverage: { marginBottom: 14 },

  topicRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10, marginBottom: 12 },
  topicLine: { flex: 1, height: 1, opacity: 0.5 },
  topicPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    maxWidth: "72%",
    paddingHorizontal: 11,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: "#FFFFFF",
  },
  topicDot: { width: 8, height: 8, borderRadius: 4 },
  topicText: { flexShrink: 1, fontFamily: FONTS.semibold, fontSize: 12.5, color: UI.INK },

  group: { flexDirection: "row", gap: 10, marginBottom: 14 },
  avatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: "#E9E4F4", marginTop: 2 },
  groupBody: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 },
  name: { flexShrink: 1, fontFamily: FONTS.semibold, fontSize: 14, color: UI.INK },
  you: { fontFamily: FONTS.regular, color: UI.MUTED },
  time: { fontFamily: FONTS.regular, fontSize: 12, color: UI.MUTED },
  line: { fontFamily: FONTS.regular, fontSize: 14.5, lineHeight: 21, color: "#3A3A44", marginTop: 4 },

  emptyBox: { alignItems: "center", gap: 10, paddingVertical: 28, paddingHorizontal: 12 },
  footer: { fontFamily: FONTS.regular, fontSize: 12.5, color: UI.MUTED, textAlign: "center", marginTop: 6 },

  center: { alignItems: "center", gap: 8, paddingHorizontal: 32, paddingTop: 56 },
  stateTitle: { fontFamily: FONTS.semibold, fontSize: 17, color: UI.INK, textAlign: "center", marginTop: 4 },
  stateBody: { fontFamily: FONTS.regular, fontSize: 14, lineHeight: 20, color: UI.MUTED, textAlign: "center" },
  retry: {
    marginTop: 12,
    height: 44,
    paddingHorizontal: 22,
    borderRadius: UI.BUTTON_RADIUS,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: UI.LILAC,
  },
  retryText: { fontFamily: FONTS.semibold, fontSize: 15, color: UI.PINK },
});
