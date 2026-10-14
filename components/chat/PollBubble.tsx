// ==========================================
// POLL RESULTS (Figma M19 · inside the chat bubble)
// ==========================================
// The question, "12 votes · Your vote: Chicano Park", then each option as a
// white card with its bar and "8 · 67%", and a ✓ beside your pick. Tap an
// option to vote (tap your pick again to remove your vote). Exactly as
// designed (the CEO's doc + Figma): no "View votes", "Close poll" or
// "Final results".
import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";

import { FONTS } from "@/constants/fonts";
import { pollIsClosed, votePoll, type PollSummary } from "@/services/polls";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { socketPollUpdated } from "@/store/slices/chatSlice";
import { themedStyles, useThemedStyles } from "@/constants/chatTheme";

const PINK = "#B63D91";
const INK = "#24283C";
const MUTED = "#66738A";

export default function PollBubble({
  messageId,
  conversationId,
  poll,
}: {
  messageId: string;
  conversationId: string;
  poll: PollSummary;
  // Kept so the chat screen doesn't need to change.
  mine?: boolean;
}) {
  const styles = useThemedStyles(STYLE_PAIR);
  const dispatch = useAppDispatch();
  const token = useAppSelector((state) => state.auth.token);

  // Shown straight away while a vote is on its way.
  const [optimistic, setOptimistic] = useState<PollSummary | null>(null);
  const [busy, setBusy] = useState(false);

  const shown = optimistic || poll;
  const closed = pollIsClosed(shown);
  const myVotes = shown.myVotes || [];
  const total = shown.totalVoters || 0;
  const myPicks = shown.options.filter((option) => myVotes.includes(option.id)).map((option) => option.text);

  const vote = async (optionId: string) => {
    if (!token || closed || busy) return;

    const already = myVotes.includes(optionId);
    const nextVotes = shown.multiple
      ? already
        ? myVotes.filter((id) => id !== optionId)
        : [...myVotes, optionId]
      : already
        ? []
        : [optionId];

    // Optimistic counts: take my old picks off, add my new ones.
    const hadVoted = myVotes.length > 0;
    const willVote = nextVotes.length > 0;
    setOptimistic({
      ...shown,
      myVotes: nextVotes,
      totalVoters: total + (willVote && !hadVoted ? 1 : 0) - (!willVote && hadVoted ? 1 : 0),
      options: shown.options.map((option) => ({
        ...option,
        votes: Math.max(0, option.votes - (myVotes.includes(option.id) ? 1 : 0) + (nextVotes.includes(option.id) ? 1 : 0)),
      })),
    });

    try {
      setBusy(true);
      const result = await votePoll(conversationId, messageId, nextVotes, token);
      dispatch(socketPollUpdated({ conversationId, messageId, poll: result }));
    } catch (error) {
      Alert.alert("Poll", error instanceof Error ? error.message : "Couldn't save your vote.");
    } finally {
      setOptimistic(null);
      setBusy(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.question}>{shown.question}</Text>
      <Text style={styles.meta}>
        {total} {total === 1 ? "vote" : "votes"}
        {myPicks.length ? ` · Your vote: ${myPicks.join(", ")}` : shown.multiple ? " · Pick one or more" : ""}
      </Text>

      <View style={styles.options}>
        {shown.options.map((option) => {
          const picked = myVotes.includes(option.id);
          const percent = total > 0 ? Math.round((option.votes / total) * 100) : 0;

          return (
            <Pressable
              key={option.id}
              onPress={() => vote(option.id)}
              disabled={closed || busy}
              style={styles.option}
              accessibilityRole={shown.multiple ? "checkbox" : "radio"}
              accessibilityState={{ checked: picked, disabled: closed }}>
              <View style={styles.optionTop}>
                <Text style={styles.optionText} numberOfLines={2}>
                  {option.text}
                  {picked ? " " : ""}
                </Text>
                {picked ? <Ionicons name="checkmark" size={16} color={INK} style={styles.tick} /> : null}
                <Text style={styles.count}>
                  {option.votes} · {percent}%
                </Text>
              </View>
              <View style={styles.track}>
                <View style={[styles.bar, { width: `${percent}%` }]} />
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const STYLE_PAIR = themedStyles({
  wrap: { minWidth: 250, maxWidth: 320, paddingVertical: 2 },

  question: { fontFamily: FONTS.semibold, fontSize: 16, lineHeight: 22, color: INK },

  meta: { marginTop: 4, fontFamily: FONTS.regular, fontSize: 12, color: MUTED },

  options: { marginTop: 10, gap: 8 },

  option: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, backgroundColor: "#FFFFFF" },

  optionTop: { flexDirection: "row", alignItems: "center" },

  optionText: { flexShrink: 1, fontFamily: FONTS.regular, fontSize: 14.5, color: INK },

  tick: { marginRight: 6 },

  count: { marginLeft: "auto", paddingLeft: 10, fontFamily: FONTS.medium, fontSize: 12.5, color: PINK },

  track: { marginTop: 8, height: 5, borderRadius: 3, overflow: "hidden", backgroundColor: "#E3E7EF" },

  bar: { height: 5, borderRadius: 3, backgroundColor: PINK },
});
