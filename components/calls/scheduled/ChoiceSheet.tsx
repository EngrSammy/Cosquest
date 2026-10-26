// ==========================================
// PICKER SHEETS for Schedule a call
// ==========================================
// ChoiceSheet: one option from a list (date, time, duration, repeat,
// linked Spark, who can join). Plain lists instead of the native date
// picker, so it works the same on phones and the website.
// MembersSheet: tick the group members to invite.
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CheckBadge, TextField, UI } from "@/components/chat/ui";
import { themedStyles, useInk, useThemedStyles } from "@/constants/chatTheme";
import { FONTS } from "@/constants/fonts";
import { getChatMembers } from "@/services/chats";
import type { GroupPerson } from "@/services/groups";
import { useAppSelector } from "@/store/hooks";
import { getAvatarSource } from "@/utils/callHelpers";

export type Choice<T> = { value: T; label: string; hint?: string };

function Sheet({
  visible,
  title,
  onClose,
  children,
  footer,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const styles = useThemedStyles(STYLE_PAIR);
  const ink = useInk();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropTap} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.handle} />
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close">
              <Ionicons name="close" size={22} color={ink.text(UI.MUTED)} />
            </Pressable>
          </View>
          {children}
          {footer}
        </View>
      </View>
    </Modal>
  );
}

export function ChoiceSheet<T>({
  visible,
  title,
  choices,
  selected,
  onSelect,
  onClose,
  isSame = (a, b) => a === b,
}: {
  visible: boolean;
  title: string;
  choices: Choice<T>[];
  selected: T;
  onSelect: (value: T) => void;
  onClose: () => void;
  isSame?: (a: T, b: T) => boolean;
}) {
  const styles = useThemedStyles(STYLE_PAIR);
  const selectedIndex = choices.findIndex((choice) => isSame(choice.value, selected));

  return (
    <Sheet visible={visible} title={title} onClose={onClose}>
      <FlatList
        data={choices}
        keyExtractor={(_, index) => String(index)}
        style={styles.list}
        initialScrollIndex={selectedIndex > 3 ? selectedIndex - 2 : undefined}
        getItemLayout={(_, index) => ({ length: ROW_HEIGHT, offset: ROW_HEIGHT * index, index })}
        renderItem={({ item }) => {
          const on = isSame(item.value, selected);
          return (
            <Pressable
              style={[styles.row, on && styles.rowOn]}
              onPress={() => {
                onSelect(item.value);
                onClose();
              }}>
              <View style={styles.rowText}>
                <Text style={[styles.rowLabel, on && styles.rowLabelOn]} numberOfLines={1}>
                  {item.label}
                </Text>
                {item.hint ? (
                  <Text style={styles.rowHint} numberOfLines={1}>
                    {item.hint}
                  </Text>
                ) : null}
              </View>
              {on ? <Ionicons name="checkmark" size={20} color={UI.PINK} /> : null}
            </Pressable>
          );
        }}
      />
    </Sheet>
  );
}

// The signed-in user, shaped like a group member (host / RSVP).
export function useMyPerson(): GroupPerson {
  const user = useAppSelector((state) => state.auth.user);
  const profile = user?.profile;
  const name = [profile?.firstName, profile?.lastName].filter(Boolean).join(" ");
  return {
    id: String(user?.id || (user as any)?._id || ""),
    username: profile?.username || "",
    name: name || null,
    avatarKey: profile?.avatarKey || null,
    avatarPhotoUrl: profile?.avatarPhotoUrl || null,
  };
}

// The chat's name ("Barrio Logan Ascendants") for headers.
export function useChatTitle(conversationId: string) {
  return useAppSelector((state) => {
    const chat: any =
      state.chat.conversationDetails[conversationId] ||
      state.chat.conversations.find((item) => item.id === conversationId);
    return (chat?.title || chat?.group?.name || chat?.name || "") as string;
  });
}

export function personName(person: GroupPerson) {
  return person.name || person.username || "Member";
}

export function initialsOf(person: GroupPerson) {
  const parts = personName(person).trim().split(/\s+/);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "?";
}

export function PersonAvatar({ person, size = 34 }: { person: GroupPerson; size?: number }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const source = getAvatarSource(person as any);
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      {source ? (
        <Image source={source} style={{ width: size, height: size }} />
      ) : (
        <Text style={[styles.avatarText, { fontSize: size * 0.36 }]}>{initialsOf(person)}</Text>
      )}
    </View>
  );
}

export function MembersSheet({
  visible,
  groupId,
  myId,
  selected,
  onDone,
  onClose,
}: {
  visible: boolean;
  groupId: string;
  myId: string;
  selected: GroupPerson[];
  onDone: (people: GroupPerson[]) => void;
  onClose: () => void;
}) {
  const styles = useThemedStyles(STYLE_PAIR);
  const token = useAppSelector((state) => state.auth.token);
  const [search, setSearch] = useState("");
  const [members, setMembers] = useState<GroupPerson[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // Starts from the people already on the form (mount it only while open).
  const [picked, setPicked] = useState<Record<string, GroupPerson>>(() =>
    Object.fromEntries(selected.map((person) => [person.id, person])),
  );

  useEffect(() => {
    if (!visible || !token) return;
    let stale = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        // The chat's members: works in groups, Community and factions.
        const result = await getChatMembers(groupId, { search: search.trim(), limit: 100 }, token);
        if (!stale) setMembers(result.members.filter((member) => member.id !== myId));
      } catch (err) {
        if (!stale) setError(err instanceof Error ? err.message : "Couldn't load members.");
      } finally {
        if (!stale) setLoading(false);
      }
    }, 250);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [visible, token, groupId, search, myId]);

  const count = Object.keys(picked).length;
  const rows = members;

  return (
    <Sheet
      visible={visible}
      title="Add members"
      onClose={onClose}
      footer={
        <Pressable
          style={styles.done}
          onPress={() => {
            onDone(Object.values(picked));
            onClose();
          }}>
          <Text style={styles.doneText}>{count ? `Invite ${count}` : "Done"}</Text>
        </Pressable>
      }>
      <TextField
        value={search}
        onChangeText={setSearch}
        placeholder="Search members"
        autoCapitalize="none"
        style={styles.search}
      />
      {loading && !rows.length ? (
        <ActivityIndicator color={UI.PINK} style={styles.center} />
      ) : error ? (
        <Text style={styles.empty}>{error}</Text>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(person) => person.id}
          style={styles.list}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={<Text style={styles.empty}>No members found.</Text>}
          renderItem={({ item }) => {
            const on = !!picked[item.id];
            return (
              <Pressable
                style={styles.personRow}
                onPress={() =>
                  setPicked((current) => {
                    const next = { ...current };
                    if (next[item.id]) delete next[item.id];
                    else next[item.id] = item;
                    return next;
                  })
                }>
                <PersonAvatar person={item} />
                <View style={styles.rowText}>
                  <Text style={styles.rowLabel} numberOfLines={1}>
                    {personName(item)}
                  </Text>
                  <Text style={styles.rowHint} numberOfLines={1}>
                    @{item.username}
                  </Text>
                </View>
                <CheckBadge checked={on} />
              </Pressable>
            );
          }}
        />
      )}
    </Sheet>
  );
}

const ROW_HEIGHT = 52;

const STYLE_PAIR = themedStyles(
  {
    backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(10,12,24,0.35)" },
    backdropTap: { flex: 1 },
    sheet: {
      maxHeight: "75%",
      paddingHorizontal: 20,
      paddingTop: 8,
      borderTopLeftRadius: UI.SHEET_RADIUS,
      borderTopRightRadius: UI.SHEET_RADIUS,
      backgroundColor: "#FFFFFF",
    },
    handle: {
      alignSelf: "center",
      width: 42,
      height: 5,
      borderRadius: 3,
      backgroundColor: "#D5D5DA",
      marginBottom: 10,
    },
    sheetHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 8,
    },
    sheetTitle: { fontFamily: FONTS.semibold, fontSize: 17, color: UI.INK },
    list: { flexGrow: 0 },
    row: {
      height: ROW_HEIGHT,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingHorizontal: 12,
      borderRadius: 12,
    },
    rowOn: { backgroundColor: UI.LILAC },
    rowText: { flex: 1, minWidth: 0 },
    rowLabel: { fontFamily: FONTS.regular, fontSize: 15, color: UI.INK },
    rowLabelOn: { fontFamily: FONTS.semibold, color: UI.PINK },
    rowHint: { marginTop: 1, fontFamily: FONTS.regular, fontSize: 12, color: UI.MUTED },
    search: { marginBottom: 8 },
    personRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 },
    avatar: {
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
      backgroundColor: "#EDE3F3",
    },
    avatarText: { fontFamily: FONTS.semibold, color: "#8E4F9E" },
    empty: {
      paddingVertical: 24,
      textAlign: "center",
      fontFamily: FONTS.regular,
      fontSize: 14,
      color: UI.MUTED,
    },
    center: { paddingVertical: 24 },
    done: {
      marginTop: 12,
      height: UI.BUTTON_HEIGHT,
      borderRadius: UI.BUTTON_RADIUS,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: UI.PINK,
    },
    doneText: { fontFamily: FONTS.semibold, fontSize: 15, color: "#FFFFFF" },
  },
  {
    sheet: { backgroundColor: "#1D1F2C" },
    handle: { backgroundColor: "#3A3D50" },
    sheetTitle: { color: "#F4F5FA" },
    rowOn: { backgroundColor: "#343044" },
    rowLabel: { color: "#F4F5FA" },
    rowHint: { color: "#B5BBCB" },
    avatar: { backgroundColor: "#343044" },
    avatarText: { color: "#F0A6D7" },
    empty: { color: "#B5BBCB" },
  },
);
