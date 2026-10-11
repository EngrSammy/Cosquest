// ==========================================
// POLL (inside a chat bubble)
// ==========================================
// Question, options with bars and percentages, tap to vote (tap again to
// change or remove your vote), "View votes" (who picked what, unless
// anonymous), and "Close poll" for its creator or a group admin.
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useState } from "react";
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FONTS } from "@/constants/fonts";
import {
  closePoll,
  getPollVotes,
  pollIsClosed,
  votePoll,
  type PollOption,
  type PollSummary,
  type PollVoter,
} from "@/services/polls";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { socketPollUpdated } from "@/store/slices/chatSlice";
import { getAvatarSource } from "@/utils/callHelpers";

const PINK = "#C34D9C";
const INK = "#191922";
const MUTED = "#6F6F79";

function endsText(closesAt: string | null) {
  if (!closesAt) return "";
  const ms = new Date(closesAt).getTime() - Date.now();
  if (ms <= 0) return "";
  const minutes = Math.ceil(ms / 60000);
  if (minutes < 60) return `Ends in ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Ends in ${hours} h`;
  return `Ends in ${Math.round(hours / 24)} days`;
}

export default function PollBubble({
  messageId,
  conversationId,
  poll,
  mine,
}: {
  messageId: string;
  conversationId: string;
  poll: PollSummary;
  mine: boolean;
}) {
  const dispatch = useAppDispatch();
  const insets = useSafeAreaInsets();

  const token = useAppSelector((state) => state.auth.token);
  // Group admins can close any poll in their group.
  const myRole = useAppSelector(
    (state) => (state.chat.conversationDetails[conversationId] as any)?.group?.myRole as string | undefined,
  );

  // Shown straight away while a vote is on its way.
  const [optimistic, setOptimistic] = useState<PollSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [votes, setVotes] = useState<(PollOption & { voters: PollVoter[] })[] | null>(null);
  const [showVotes, setShowVotes] = useState(false);

  const shown = optimistic || poll;
  const closed = pollIsClosed(shown);
  const myVotes = shown.myVotes || [];
  const total = shown.totalVoters || 0;
  const canClose = !closed && (mine || myRole === "owner" || myRole === "admin");
  const top = Math.max(0, ...shown.options.map((option) => option.votes));

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

  const confirmClose = () => {
    if (!token) return;
    Alert.alert("Close poll?", "Nobody will be able to vote anymore.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Close poll",
        style: "destructive",
        onPress: async () => {
          try {
            const result = await closePoll(conversationId, messageId, token);
            dispatch(socketPollUpdated({ conversationId, messageId, poll: result }));
          } catch (error) {
            Alert.alert("Poll", error instanceof Error ? error.message : "Couldn't close the poll.");
          }
        },
      },
    ]);
  };

  const openVotes = async () => {
    if (!token) return;
    setShowVotes(true);
    setVotes(null);
    try {
      const result = await getPollVotes(conversationId, messageId, token);
      setVotes(result.options);
    } catch (error) {
      setShowVotes(false);
      Alert.alert("Votes", error instanceof Error ? error.message : "Couldn't load the votes.");
    }
  };

  const ends = endsText(shown.closesAt);

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Ionicons name="stats-chart" size={14} color={PINK} />
        <Text style={styles.kind}>
          {closed ? "Final results" : shown.multiple ? "Poll · pick one or more" : "Poll · pick one"}
          {shown.anonymous ? " · anonymous" : ""}
        </Text>
      </View>

      <Text style={styles.question}>{shown.question}</Text>

      <View style={styles.options}>
        {shown.options.map((option) => {
          const picked = myVotes.includes(option.id);
          const percent = total > 0 ? Math.round((option.votes / total) * 100) : 0;
          const winner = closed && option.votes > 0 && option.votes === top;

          return (
            <Pressable
              key={option.id}
              onPress={() => vote(option.id)}
              disabled={closed || busy}
              style={styles.option}
              accessibilityRole={shown.multiple ? "checkbox" : "radio"}
              accessibilityState={{ checked: picked, disabled: closed }}>
              <View style={styles.optionTop}>
                {!closed ? (
                  <View style={[shown.multiple ? styles.box : styles.circle, picked && styles.markOn]}>
                    {picked ? <Ionicons name="checkmark" size={12} color="#FFFFFF" /> : null}
                  </View>
                ) : winner ? (
                  <Ionicons name="trophy" size={14} color={PINK} />
                ) : null}

                <Text style={[styles.optionText, (picked || winner) && styles.optionTextStrong]} numberOfLines={3}>
                  {option.text}
                </Text>

                <Text style={styles.count}>{total > 0 ? `${percent}%` : ""}</Text>
              </View>

              <View style={styles.track}>
                <View style={[styles.bar, { width: `${percent}%` }, (picked || winner) && styles.barStrong]} />
              </View>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          {total} {total === 1 ? "vote" : "votes"}
          {ends && !closed ? ` · ${ends}` : ""}
        </Text>

        <View style={styles.footerActions}>
          {!shown.anonymous && total > 0 ? (
            <Pressable onPress={openVotes} hitSlop={6}>
              <Text style={styles.link}>View votes</Text>
            </Pressable>
          ) : null}
          {canClose ? (
            <Pressable onPress={confirmClose} hitSlop={6}>
              <Text style={styles.link}>Close poll</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* WHO VOTED FOR WHAT */}
      <Modal visible={showVotes} transparent animationType="slide" onRequestClose={() => setShowVotes(false)}>
        <Pressable style={styles.backdrop} onPress={() => setShowVotes(false)} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 14 }]}>
          <View style={styles.handle} />
          <Text style={styles.sheetTitle} numberOfLines={2}>
            {shown.question}
          </Text>

          {!votes ? (
            <ActivityIndicator color={PINK} style={styles.loading} />
          ) : (
            <ScrollView style={styles.sheetList}>
              {votes.map((option) => (
                <View key={option.id} style={styles.voteGroup}>
                  <Text style={styles.voteOption}>
                    {option.text} · {option.votes} {option.votes === 1 ? "vote" : "votes"}
                  </Text>
                  {option.voters.length === 0 ? <Text style={styles.noVotes}>No votes</Text> : null}
                  {option.voters.map((voter) => (
                    <View key={voter.id} style={styles.voterRow}>
                      <Image source={getAvatarSource(voter)} style={styles.voterAvatar} contentFit="cover" />
                      <Text style={styles.voterName} numberOfLines={1}>
                        {voter.name || voter.username}
                      </Text>
                    </View>
                  ))}
                </View>
              ))}
            </ScrollView>
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { minWidth: 240, maxWidth: 320, paddingVertical: 2 },

  headerRow: { flexDirection: "row", alignItems: "center", gap: 5 },

  kind: { fontFamily: FONTS.medium, fontSize: 11, color: PINK },

  question: { marginTop: 4, fontFamily: FONTS.semibold, fontSize: 15, lineHeight: 20, color: INK },

  options: { marginTop: 10, gap: 10 },

  option: { gap: 5 },

  optionTop: { flexDirection: "row", alignItems: "center", gap: 8 },

  circle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: "#B5B5BE",
    alignItems: "center",
    justifyContent: "center",
  },

  box: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: "#B5B5BE",
    alignItems: "center",
    justifyContent: "center",
  },

  markOn: { borderColor: PINK, backgroundColor: PINK },

  optionText: { flex: 1, minWidth: 0, fontFamily: FONTS.regular, fontSize: 14, color: INK },

  optionTextStrong: { fontFamily: FONTS.semibold },

  count: { fontFamily: FONTS.medium, fontSize: 12, color: MUTED },

  track: { height: 6, borderRadius: 3, overflow: "hidden", backgroundColor: "rgba(25,25,34,0.08)" },

  bar: { height: 6, borderRadius: 3, backgroundColor: "rgba(195,77,156,0.45)" },

  barStrong: { backgroundColor: PINK },

  footer: { marginTop: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },

  footerText: { flexShrink: 1, fontFamily: FONTS.regular, fontSize: 11.5, color: MUTED },

  footerActions: { flexDirection: "row", gap: 14 },

  link: { fontFamily: FONTS.semibold, fontSize: 12, color: PINK },

  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)" },

  sheet: {
    maxHeight: "80%",
    width: "100%",
    maxWidth: 640,
    alignSelf: "center",
    paddingHorizontal: 18,
    paddingTop: 10,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: "#FFFFFF",
  },

  handle: { alignSelf: "center", width: 42, height: 5, borderRadius: 3, backgroundColor: "#D5D5DA", marginBottom: 10 },

  sheetTitle: { fontFamily: FONTS.semibold, fontSize: 17, color: INK, marginBottom: 8 },

  loading: { paddingVertical: 30 },

  sheetList: { maxHeight: 460 },

  voteGroup: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#F0F0F3" },

  voteOption: { fontFamily: FONTS.semibold, fontSize: 13.5, color: PINK, marginBottom: 6 },

  noVotes: { fontFamily: FONTS.regular, fontSize: 12.5, color: MUTED },

  voterRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 5 },

  voterAvatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: "#F1E4EE" },

  voterName: { flex: 1, fontFamily: FONTS.regular, fontSize: 14, color: INK },
});
