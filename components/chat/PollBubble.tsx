// ==========================================
// POLL RESULTS (Figma M19 · inside the chat bubble)
// ==========================================
// The question, "12 votes · Your vote: Chicano Park", then each option as a
// white card with its bar and "8 · 67%", and a ✓ beside your pick. Tap an
// option to vote (tap your pick again to remove your vote). Exactly as
// designed (the CEO's doc + Figma): no "View votes", "Close poll" or
// "Final results".
//
// Width: the poll fills the bubble it is in (it used to ask for 250px
// minimum, which was wider than the bubble and got cut off on the right).
import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";

import { UI } from "@/components/chat/ui";
import { themedStyles, useInk, useThemedStyles } from "@/constants/chatTheme";
import { FONTS } from "@/constants/fonts";
import { pollIsClosed, votePoll, type PollSummary } from "@/services/polls";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { socketPollUpdated } from "@/store/slices/chatSlice";

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
  const ink = useInk();
  const dispatch = useAppDispatch();
  const token = useAppSelector((state) => state.auth.token);

  // Shown straight away while a vote is on its way.
  const [optimistic, setOptimistic] = useState<PollSummary | null>(null);
  const [busy, setBusy] = useState(false);

  const shown = optimistic || poll;
  const closed = pollIsClosed(shown);
  const myVotes = shown.myVotes || [];
  const total = shown.totalVoters || 0;
  const myPicks = shown.options
    .filter((option) => myVotes.includes(option.id))
    .map((option) => option.text);

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
      totalVoters:
        total +
        (willVote && !hadVoted ? 1 : 0) -
        (!willVote && hadVoted ? 1 : 0),
      options: shown.options.map((option) => ({
        ...option,
        votes: Math.max(
          0,
          option.votes -
            (myVotes.includes(option.id) ? 1 : 0) +
            (nextVotes.includes(option.id) ? 1 : 0),
        ),
      })),
    });

    try {
      setBusy(true);
      const result = await votePoll(
        conversationId,
        messageId,
        nextVotes,
        token,
      );
      dispatch(socketPollUpdated({ conversationId, messageId, poll: result }));
    } catch (error) {
      Alert.alert(
        "Poll",
        error instanceof Error ? error.message : "Couldn't save your vote.",
      );
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
        {myPicks.length
          ? ` · Your vote: ${myPicks.join(", ")}`
          : shown.multiple
            ? " · Pick one or more"
            : ""}
      </Text>

      <View style={styles.options}>
        {shown.options.map((option) => {
          const picked = myVotes.includes(option.id);
          const percent =
            total > 0 ? Math.round((option.votes / total) * 100) : 0;

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
                </Text>
                {picked ? (
                  <Ionicons
                    name="checkmark"
                    size={14}
                    color={ink.text(UI.INK)}
                    style={styles.tick}
                  />
                ) : null}
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
  // Fills the bubble. No minWidth wider than the bubble, so nothing is clipped.
  wrap: {
    alignSelf: "stretch",
    width: "100%",
    minWidth: 0,
    maxWidth: 360,
    paddingVertical: 2,
  },

  // Sizes measured from Figma M19 (question 14, details 11, option text 13).
  question: {
    fontFamily: FONTS.semibold,
    fontSize: 14,
    lineHeight: 20,
    color: UI.INK,
  },

  meta: {
    marginTop: 8,
    fontFamily: FONTS.regular,
    fontSize: 11,
    color: UI.MUTED,
  },

  options: { marginTop: 8, gap: 8, alignSelf: "stretch" },

  // Figma: the option cards are see-through white on the pink bubble, not solid white.
  option: {
    alignSelf: "stretch",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.4)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.6)",
  },

  optionTop: { flexDirection: "row", alignItems: "center" },

  // The text only takes the room it needs, so the tick sits right after it.
  optionText: {
    flexShrink: 1,
    fontFamily: FONTS.regular,
    fontSize: 13,
    color: UI.INK,
  },

  tick: { marginLeft: 4 },

  count: {
    marginLeft: "auto",
    paddingLeft: 10,
    fontFamily: FONTS.medium,
    fontSize: 11,
    color: UI.PINK,
  },

  track: {
    marginTop: 6,
    height: 5,
    borderRadius: 3,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.7)",
  },

  bar: { height: 5, borderRadius: 3, backgroundColor: UI.PINK },
});
