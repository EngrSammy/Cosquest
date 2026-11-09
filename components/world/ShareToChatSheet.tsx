// The game's "invite to a chat": pick a conversation (and add a line if you
// like), and the invite card is sent there. Opens over the game; the game
// stays where it was.
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { KeyboardAvoidingView } from "@/components/ui/keyboard";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FONTS } from "@/constants/fonts";
import {
  type GameSharePayload,
  inviteTitle,
  inviteWhen,
  normalizeInvite,
  shareToInviteBody,
  normalizeResult,
} from "@/features/world/gameInvite";
import { chatTitle } from "@/features/world/unread";
import { sendMessage } from "@/services/chats";
import { sendGameInvite, sendGameResult } from "@/services/gameInvites";
import { useCapabilities } from "@/services/capabilities";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { socketMessageReceived } from "@/store/slices/chatSlice";
import { C } from "@/theme/tokens";

export default function ShareToChatSheet({
  payload,
  onClose,
}: {
  payload: GameSharePayload | null;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  const token = useAppSelector((state) => state.auth.token);
  const conversations = useAppSelector((state) => state.chat.conversations);
  const [query, setQuery] = useState("");
  const [note, setNote] = useState("");
  const [sendingTo, setSendingTo] = useState<string | null>(null);
  const caps = useCapabilities();

  // A game result goes as a text message; anything else as an invite card.
  const resultText = payload?.type === "result" && payload.text ? payload.text : null;
  const body = payload && !resultText ? shareToInviteBody(payload) : null;
  const invite = body ? normalizeInvite(body) : null;

  const chats = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = [...conversations].sort((a, b) => {
      const ta = Date.parse(a.lastMessage?.createdAt || "") || 0;
      const tb = Date.parse(b.lastMessage?.createdAt || "") || 0;
      return tb - ta;
    });
    return q ? sorted.filter((chat) => chatTitle(chat).toLowerCase().includes(q)) : sorted;
  }, [conversations, query]);

  const close = () => {
    setQuery("");
    setNote("");
    setSendingTo(null);
    onClose();
  };

  const send = async (chatId: string, title: string) => {
    if (!payload || !token || sendingTo) return;
    const request = resultText ? null : shareToInviteBody(payload, note);
    if (!resultText && !request) return;
    setSendingTo(chatId);
    try {
      // Task 059: a result card where the server has kind game_result
      // (services/capabilities.ts), the same line as text where it doesn't.
      const card = resultText ? normalizeResult(payload.result) : null;
      const message = resultText
        ? card && caps.gameResults
          ? await sendGameResult(chatId, { ...card, note: note.trim() || undefined }, token)
          : await sendMessage(chatId, { content: note.trim() ? `${resultText}\n${note.trim()}` : resultText }, token)
        : await sendGameInvite(chatId, request!, token);
      dispatch(socketMessageReceived({ conversationId: chatId, message }));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      close();
    } catch (error) {
      setSendingTo(null);
      Alert.alert(
        `Couldn't send to ${title}`,
        error instanceof Error ? error.message : "Please try again.",
      );
    }
  };

  return (
    <Modal visible={!!payload} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={styles.scrim} onPress={close} accessibilityLabel="Close" />
      <KeyboardAvoidingView
        behavior="padding"
        style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.grabber} />
        <View style={styles.headerRow}>
          <Text style={styles.heading}>{resultText ? "Share to a chat" : "Invite to a chat"}</Text>
          <Pressable onPress={close} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
            <Ionicons name="close" size={22} color={C.plumInk} />
          </Pressable>
        </View>

        {resultText ? (
          <View style={styles.preview}>
            <Text style={styles.previewTitle}>{resultText}</Text>
          </View>
        ) : invite ? (
          <View style={styles.preview}>
            <Text style={styles.previewTitle}>🎮 {inviteTitle(invite)}</Text>
            <Text style={styles.previewWhen}>{inviteWhen(invite.startsAt)}</Text>
          </View>
        ) : (
          <Text style={styles.error}>This spot can&apos;t be shared.</Text>
        )}

        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="Add a message (optional)"
          placeholderTextColor="#9A8E9E"
          maxLength={300}
          style={styles.input}
        />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search chats"
          placeholderTextColor="#9A8E9E"
          style={styles.input}
          autoCorrect={false}
        />

        <FlatList
          data={invite || resultText ? chats : []}
          keyExtractor={(chat) => chat.id}
          keyboardShouldPersistTaps="handled"
          style={styles.list}
          renderItem={({ item }) => {
            const title = chatTitle(item);
            return (
              <Pressable
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                onPress={() => send(item.id, title)}
                disabled={!!sendingTo}
                accessibilityRole="button"
                accessibilityLabel={`Send to ${title}`}>
                <View style={styles.rowIcon}>
                  <Ionicons
                    name={item.type === "dm" ? "person" : "people"}
                    size={16}
                    color={C.brandVivid}
                  />
                </View>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {title}
                </Text>
                {sendingTo === item.id ? (
                  <ActivityIndicator color={C.brandVivid} />
                ) : (
                  <Ionicons name="paper-plane-outline" size={18} color={C.brandVivid} />
                )}
              </Pressable>
            );
          }}
          ListEmptyComponent={
            invite ? <Text style={styles.empty}>No chats yet.</Text> : null
          }
        />
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: "75%",
    paddingHorizontal: 16,
    paddingTop: 8,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: "#FFFFFF",
    gap: 10,
  },
  grabber: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#D9D2DB",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  heading: {
    fontFamily: FONTS.bold,
    fontSize: 18,
    color: C.plumInk,
  },
  preview: {
    padding: 12,
    borderRadius: 14,
    backgroundColor: "rgba(220, 23, 159, 0.08)",
  },
  previewTitle: {
    fontFamily: FONTS.semibold,
    fontSize: 15,
    color: C.plumInk,
  },
  previewWhen: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: "#7A6B7F",
  },
  error: {
    fontFamily: FONTS.medium,
    color: "#B3261E",
  },
  input: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#F4F0F5",
    fontFamily: FONTS.regular,
    fontSize: 14,
    color: C.plumInk,
  },
  list: {
    flexGrow: 0,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 12,
  },
  rowPressed: {
    backgroundColor: "rgba(220, 23, 159, 0.06)",
  },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(220, 23, 159, 0.1)",
  },
  rowTitle: {
    flex: 1,
    fontFamily: FONTS.medium,
    fontSize: 15,
    color: C.plumInk,
  },
  empty: {
    textAlign: "center",
    paddingVertical: 20,
    fontFamily: FONTS.regular,
    color: "#7A6B7F",
  },
});
