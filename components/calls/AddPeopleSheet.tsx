// ==========================================
// ADD PEOPLE TO A CALL
// ==========================================
// Opened from the "Add" button on the call screen. Lists people you follow
// and people you chat with; you can also search by username. Pick one or
// more, tap Add, and only THEIR phones ring - everyone else keeps talking.
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useEffect, useMemo, useState } from "react";
import {
      ActivityIndicator,
      Alert,
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

import type { Call, InviteSkipReason } from "@/services/calls";
import { searchPeople } from "@/services/share";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { inviteToCall } from "@/store/thunks/callThunks";
import { getAvatarSource } from "@/utils/callHelpers";

import { CALL_COLORS } from "./CallVisuals";

type Person = {
  id?: string;
  username: string;
  name?: string | null;
  avatarKey?: string | null;
  avatarPhotoUrl?: string | null;
};

const SKIP_REASONS: Record<InviteSkipReason, string> = {
  not_found: "couldn't be found",
  unavailable: "can't be called",
  not_accepting_calls: "isn't accepting calls",
  busy: "is on another call",
  already_in_call: "is already in this call",
  call_full: "couldn't fit (the call is full)",
};

function keyOf(person: Person) {
  return (person.id || person.username).toLowerCase();
}

// One list, one entry per person (later lists win: they have fuller data).
function mergePeople(lists: Person[][]) {
  const byKey = new Map<string, Person>();

  lists.forEach((list) =>
    list.forEach((person) => {
      if (!person?.username) {
        return;
      }

      const key = person.username.replace(/^@/, "").toLowerCase();
      byKey.set(key, { ...byKey.get(key), ...person });
    }),
  );

  return Array.from(byKey.values());
}

export default function AddPeopleSheet({
  visible,
  call,
  myUserId,
  onClose,
}: {
  visible: boolean;
  call: Call;
  myUserId?: string | null;
  onClose: () => void;
}) {
  const dispatch = useAppDispatch();
  const insets = useSafeAreaInsets();

  const token = useAppSelector((state) => state.auth.token);
  const following = useAppSelector((state) => state.follow.following);
  const conversations = useAppSelector((state) => state.chat.conversations);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Person[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<Record<string, Person>>({});
  const [adding, setAdding] = useState(false);

  // People already ringing or in the call can't be picked again.
  const inCall = useMemo(() => {
    const ids = new Set<string>();
    const names = new Set<string>();

    call.members.forEach((member) => {
      if (member.status === "joined" || member.status === "ringing") {
        ids.add(member.user.id);
        if (member.user.username) names.add(member.user.username.toLowerCase());
      }
    });

    if (myUserId) ids.add(myUserId);

    return { ids, names };
  }, [call.members, myUserId]);

  const activeCount = call.members.filter(
    (member) => member.status === "joined" || member.status === "ringing",
  ).length;

  const spotsLeft = Math.max(0, call.maxParticipants - activeCount);

  // Friends the app already knows: people you chat with and people you follow.
  const friends = useMemo(() => {
    const dmPartners: Person[] = conversations
      .filter(
        (chat: any) => chat.type === "dm" && chat.otherParticipant?.username,
      )
      .map((chat: any) => ({
        id: chat.otherParticipant.id,
        username: chat.otherParticipant.username,
        name: chat.otherParticipant.name,
        avatarKey: chat.otherParticipant.avatarKey,
        avatarPhotoUrl: chat.otherParticipant.avatarPhotoUrl,
      }));

    return mergePeople([dmPartners, following as Person[]]);
  }, [conversations, following]);

  // Search by username (after a short pause in typing).
  useEffect(() => {
    const text = query.trim();

    if (!visible || !text || !token) {
      setResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);

    const timer = setTimeout(async () => {
      try {
        const response = await searchPeople(token, text);
        setResults(mergePeople([(response?.users || []) as Person[]]));
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query, visible, token]);

  // Fresh start every time it opens.
  useEffect(() => {
    if (visible) {
      setQuery("");
      setSelected({});
    }
  }, [visible]);

  const list = (query.trim() ? results : friends).filter(
    (person) =>
      !(person.id && inCall.ids.has(person.id)) &&
      !inCall.names.has(person.username.toLowerCase()),
  );

  const selectedList = Object.values(selected);

  const toggle = (person: Person) => {
    const key = keyOf(person);

    setSelected((current) => {
      if (current[key]) {
        const next = { ...current };
        delete next[key];
        return next;
      }

      if (Object.keys(current).length >= spotsLeft) {
        Alert.alert(
          "Call is almost full",
          `You can add ${spotsLeft} more ${spotsLeft === 1 ? "person" : "people"}.`,
        );
        return current;
      }

      return { ...current, [key]: person };
    });
  };

  const add = async () => {
    if (!token || adding || selectedList.length === 0) {
      return;
    }

    const userIds = selectedList
      .filter((p) => p.id)
      .map((p) => p.id!) as string[];
    const usernames = selectedList.filter((p) => !p.id).map((p) => p.username);

    try {
      setAdding(true);

      const result = await dispatch(
        inviteToCall({ callId: call.id, userIds, usernames, token }),
      ).unwrap();

      if (result.skipped.length) {
        const lines = result.skipped.map((item) => {
          const person = selectedList.find(
            (p) =>
              (item.userId && p.id === item.userId) ||
              p.username === item.username,
          );
          const name =
            person?.name || person?.username || item.username || "Someone";
          return `${name} ${SKIP_REASONS[item.reason] || "couldn't be added"}.`;
        });

        Alert.alert(
          result.invited.length
            ? "Some people weren't added"
            : "Nobody was added",
          lines.join("\n"),
        );
      }

      onClose();
    } catch (error) {
      Alert.alert(
        "Add people",
        typeof error === "string" ? error : "Couldn't add people to the call.",
      );
    } finally {
      setAdding(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />

      <View style={[styles.sheet, { paddingBottom: insets.bottom + 14 }]}>
        <View style={styles.handle} />

        <View style={styles.header}>
          <Text style={styles.title}>Add people</Text>

          <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close">
            <Ionicons name="close" size={24} color={CALL_COLORS.text} />
          </Pressable>
        </View>

        <Text style={styles.hint}>
          {spotsLeft > 0
            ? `Up to ${spotsLeft} more ${spotsLeft === 1 ? "person" : "people"}. Only they will be rung.`
            : "This call is full."}
        </Text>

        <View style={styles.search}>
          <Ionicons name="search" size={18} color={CALL_COLORS.muted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search by username"
            placeholderTextColor={CALL_COLORS.muted}
            style={styles.searchInput}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searching ? (
            <ActivityIndicator size="small" color={CALL_COLORS.pink} />
          ) : null}
        </View>

        <FlatList
          data={list}
          keyExtractor={keyOf}
          style={styles.list}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <Text style={styles.empty}>
              {query.trim()
                ? searching
                  ? "Searching…"
                  : "Nobody found."
                : "People you follow or chat with show up here. You can also search."}
            </Text>
          }
          renderItem={({ item }) => {
            const isSelected = !!selected[keyOf(item)];

            return (
              <Pressable
                style={styles.row}
                onPress={() => toggle(item)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: isSelected }}>
                <Image
                  source={getAvatarSource(item)}
                  style={styles.avatar}
                  contentFit="cover"
                />

                <View style={styles.rowText}>
                  <Text style={styles.rowName} numberOfLines={1}>
                    {item.name || item.username}
                  </Text>
                  <Text style={styles.rowUsername} numberOfLines={1}>
                    @{item.username}
                  </Text>
                </View>

                <View style={[styles.check, isSelected && styles.checkOn]}>
                  {isSelected ? (
                    <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                  ) : null}
                </View>
              </Pressable>
            );
          }}
        />

        <Pressable
          style={[
            styles.addButton,
            (selectedList.length === 0 || adding) && styles.addButtonOff,
          ]}
          onPress={add}
          disabled={selectedList.length === 0 || adding}>
          {adding ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="person-add" size={18} color="#FFFFFF" />
              <Text style={styles.addText}>
                {selectedList.length
                  ? `Add ${selectedList.length} to call`
                  : "Choose people to add"}
              </Text>
            </>
          )}
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
  },

  sheet: {
    maxHeight: "80%",
    width: "100%",
    maxWidth: 640,
    alignSelf: "center",
    paddingHorizontal: 18,
    paddingTop: 10,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: "#24101F",
  },

  handle: {
    alignSelf: "center",
    width: 42,
    height: 5,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.25)",
    marginBottom: 10,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  title: {
    fontSize: 19,
    fontWeight: "800",
    color: CALL_COLORS.text,
  },

  hint: {
    marginTop: 4,
    marginBottom: 12,
    fontSize: 13,
    color: CALL_COLORS.muted,
  },

  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.08)",
  },

  searchInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    color: CALL_COLORS.text,
    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null),
  },

  list: {
    marginTop: 8,
    minHeight: 160,
  },

  empty: {
    paddingVertical: 30,
    textAlign: "center",
    fontSize: 13,
    color: CALL_COLORS.muted,
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
  },

  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#2A1030",
  },

  rowText: {
    flex: 1,
    minWidth: 0,
  },

  rowName: {
    fontSize: 15,
    fontWeight: "700",
    color: CALL_COLORS.text,
  },

  rowUsername: {
    marginTop: 1,
    fontSize: 12.5,
    color: CALL_COLORS.muted,
  },

  check: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.3)",
    alignItems: "center",
    justifyContent: "center",
  },

  checkOn: {
    borderColor: CALL_COLORS.pink,
    backgroundColor: CALL_COLORS.pink,
  },

  addButton: {
    marginTop: 12,
    height: 52,
    borderRadius: 26,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: CALL_COLORS.pink,
  },

  addButtonOff: {
    opacity: 0.5,
  },

  addText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#FFFFFF",
  },
});
