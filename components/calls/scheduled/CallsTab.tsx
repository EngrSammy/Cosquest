// ==========================================
// GROUP CALLS TAB (Figma · Calls)
// ==========================================
// "Calls - A little planning. More time together."
// Schedule a call / Meet now, then Upcoming (the next call in full, the
// rest grouped by "Tomorrow", "This week", "Next week", "Later") or Past.
// Meet now and joining a live call use the group's voice chat.
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";

import { ScreenGradient, UI } from "@/components/chat/ui";
import { useJoinVoice } from "@/components/voice/voiceUi";
import { themedStyles, useInk, useThemedStyles } from "@/constants/chatTheme";
import { FONTS } from "@/constants/fonts";
import {
  isPastCall,
  sectionTitle,
  timeZoneLabel,
  type ScheduledCall,
} from "@/services/scheduledCalls";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { makeSelectChatCalls } from "@/store/slices/scheduledCallSlice";
import { fetchScheduledCalls } from "@/store/thunks/scheduledCallThunks";
import { REMINDER_MINUTES } from "@/utils/callReminders";

import { CallRow, FeaturedCallCard } from "./ScheduledCallCard";

type Section = { title: string; calls: ScheduledCall[] };

// Upcoming calls (soonest first) under their day / week heading.
function groupUpcoming(calls: ScheduledCall[], now: Date): Section[] {
  const sections: Section[] = [];
  calls.forEach((call) => {
    const title = sectionTitle(new Date(call.startsAt), now);
    const last = sections[sections.length - 1];
    if (last?.title === title) last.calls.push(call);
    else sections.push({ title, calls: [call] });
  });
  return sections;
}

export default function CallsTab({
  conversationId,
  title,
  myId,
}: {
  conversationId: string;
  title: string;
  myId: string;
}) {
  const styles = useThemedStyles(STYLE_PAIR);
  const ink = useInk();
  const token = useAppSelector((state) => state.auth.token);
  const { join, joining } = useJoinVoice(conversationId, title);

  const dispatch = useAppDispatch();
  // The chat's calls from the store (shared with Call details and kept live
  // by scheduled-call:updated).
  const selectCalls = useMemo(() => makeSelectChatCalls(), []);
  const calls = useAppSelector((state) => selectCalls(state, conversationId));
  const loaded = useAppSelector((state) => !!state.scheduledCalls.loadedChats[conversationId]);
  const serverError = useAppSelector((state) => (loaded ? "" : state.scheduledCalls.errorByChat[conversationId] || ""));
  // Scheduled calls are for groups people create (the backend's rule).
  const error = /belong to a group/i.test(serverError)
    ? "Scheduled calls are for groups you create. In this room, use Meet now to start a voice chat."
    : serverError;
  // Loading only until the first answer (the list, or an error).
  const loading = !loaded && !error;
  const [view, setView] = useState<"upcoming" | "past">("upcoming");

  // Reload whenever the chat comes back into view (e.g. after scheduling).
  useFocusEffect(
    useCallback(() => {
      if (token) dispatch(fetchScheduledCalls({ conversationId, token }));
    }, [conversationId, token, dispatch]),
  );

  const { upcoming, past } = useMemo(() => {
    const now = new Date();
    const byStart = (a: ScheduledCall, b: ScheduledCall) =>
      new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();
    return {
      upcoming: calls.filter((call) => !isPastCall(call, now)).sort(byStart),
      // Most recent first.
      past: calls.filter((call) => isPastCall(call, now)).sort((a, b) => byStart(b, a)),
    };
  }, [calls]);

  const [next, ...later] = upcoming;
  const nextTitle = next ? sectionTitle(new Date(next.startsAt)) : "";
  // The next call keeps its own heading; the rest group under theirs.
  const sections = groupUpcoming(later, new Date());

  const openCall = (call: ScheduledCall) =>
    router.push({ pathname: "/group/scheduled-call/[callId]", params: { callId: call.id } });

  return (
    <View style={styles.screen}>
      <ScreenGradient />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Calls</Text>
        <Text style={styles.subtitle}>A little planning. More time together.</Text>

        <View style={styles.actions}>
          <Pressable
            style={[styles.action, styles.schedule]}
            onPress={() => router.push({ pathname: "/group/schedule/[id]", params: { id: conversationId } })}
            accessibilityRole="button">
            <Ionicons name="calendar-outline" size={18} color="#FFFFFF" />
            <Text style={styles.scheduleText}>Schedule a call</Text>
          </Pressable>
          <Pressable
            style={[styles.action, styles.meet, joining && styles.off]}
            onPress={join}
            disabled={joining}
            accessibilityRole="button">
            {joining ? (
              <ActivityIndicator size="small" color={UI.PINK} />
            ) : (
              <>
                <Ionicons name="videocam-outline" size={18} color={ink.text(UI.PINK)} />
                <Text style={styles.meetText}>Meet now</Text>
              </>
            )}
          </Pressable>
        </View>

        <View style={styles.filters}>
          <Pressable onPress={() => setView("upcoming")} hitSlop={6}>
            <Text style={[styles.filter, view === "upcoming" && styles.filterOn]}>
              Upcoming{upcoming.length ? ` · ${upcoming.length}` : ""}
            </Text>
          </Pressable>
          <Pressable onPress={() => setView("past")} hitSlop={6}>
            <Text style={[styles.filter, view === "past" && styles.filterOn]}>Past</Text>
          </Pressable>
        </View>

        {loading ? (
          <ActivityIndicator color={UI.PINK} style={styles.center} />
        ) : error ? (
          <Text style={styles.empty}>{error}</Text>
        ) : view === "upcoming" ? (
          next ? (
            <>
              <Text style={styles.section}>{nextTitle}</Text>
              <FeaturedCallCard call={next} myId={myId} onOpen={() => openCall(next)} onJoin={join} />
              {sections.map((section) => (
                <View key={section.title}>
                  <Text style={styles.section}>{section.title}</Text>
                  <View style={styles.rows}>
                    {section.calls.map((call) => (
                      <CallRow key={call.id} call={call} myId={myId} onOpen={() => openCall(call)} />
                    ))}
                  </View>
                </View>
              ))}
            </>
          ) : (
            <Text style={styles.empty}>No calls coming up. Schedule one to bring the group together.</Text>
          )
        ) : past.length ? (
          <View style={[styles.rows, styles.pastRows]}>
            {past.map((call) => (
              <CallRow key={call.id} call={call} myId={myId} onOpen={() => openCall(call)} />
            ))}
          </View>
        ) : (
          <Text style={styles.empty}>No past calls yet.</Text>
        )}

        <View style={styles.note}>
          <Ionicons name="notifications-outline" size={16} color={ink.text(UI.PINK)} />
          <Text style={styles.noteText}>
            We&apos;ll remind you {REMINDER_MINUTES} minutes before each call. All times are shown in{" "}
            {timeZoneLabel().split(" (")[0]} time.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const STYLE_PAIR = themedStyles(
  {
    screen: { flex: 1 },
    content: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40 },
    title: { fontFamily: FONTS.bold, fontSize: 26, lineHeight: 32, color: UI.INK },
    subtitle: { marginTop: 4, fontFamily: FONTS.regular, fontSize: 14, color: UI.MUTED },
    actions: { flexDirection: "row", gap: 10, marginTop: 18 },
    action: {
      height: 48,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      borderRadius: 24,
    },
    schedule: { flex: 1.6, backgroundColor: UI.PINK },
    scheduleText: { fontFamily: FONTS.semibold, fontSize: 15, color: "#FFFFFF" },
    meet: { flex: 1, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: UI.BORDER },
    meetText: { fontFamily: FONTS.semibold, fontSize: 15, color: UI.PINK },
    off: { opacity: 0.6 },
    filters: { flexDirection: "row", gap: 18, marginTop: 22 },
    filter: { fontFamily: FONTS.medium, fontSize: 14, color: UI.MUTED },
    filterOn: { fontFamily: FONTS.semibold, color: UI.PINK },
    section: {
      marginTop: 20,
      marginBottom: 10,
      fontFamily: FONTS.semibold,
      fontSize: 15,
      color: UI.INK,
    },
    rows: { gap: 10 },
    pastRows: { marginTop: 16 },
    center: { paddingVertical: 32 },
    empty: {
      marginTop: 24,
      textAlign: "center",
      fontFamily: FONTS.regular,
      fontSize: 14,
      lineHeight: 20,
      color: UI.MUTED,
    },
    note: {
      flexDirection: "row",
      gap: 8,
      marginTop: 22,
      padding: 12,
      borderRadius: 14,
      backgroundColor: "rgba(240,237,249,0.8)",
    },
    noteText: {
      flex: 1,
      fontFamily: FONTS.regular,
      fontSize: 12,
      lineHeight: 17,
      color: UI.MUTED,
    },
  },
  {
    title: { color: "#F4F5FA" },
    subtitle: { color: "#B5BBCB" },
    meet: { backgroundColor: "#252837", borderColor: "rgba(255,255,255,0.12)" },
    meetText: { color: "#F0A6D7" },
    filter: { color: "#B5BBCB" },
    filterOn: { color: "#F0A6D7" },
    section: { color: "#F4F5FA" },
    empty: { color: "#B5BBCB" },
    note: { backgroundColor: "rgba(52,48,68,0.8)" },
    noteText: { color: "#B5BBCB" },
  },
);
