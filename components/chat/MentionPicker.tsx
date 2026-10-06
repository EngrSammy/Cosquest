// ==========================================
// @ MENTION PICKER (group chat spec: "checkmark @ mentions")
// ==========================================
// A checkbox beside every name, plus "Everyone" at the top. Pick one or
// more people (or everyone), tap Mention, and their @names go into the
// message. Opens from the @ button, or by typing "@".
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useEffect, useMemo, useState } from "react";
import {
      ActivityIndicator,
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

import { FONTS } from "@/constants/fonts";
import { getChatMembers } from "@/services/chats";
import { getAvatarSource } from "@/utils/callHelpers";

const PINK = "#C34D9C";

export type MentionPerson = {
  id: string;
  username: string;
  name?: string | null;
  avatarKey?: string | null;
  avatarPhotoUrl?: string | null;
};

function Checkbox({ checked }: { checked: boolean }) {
  return (
    <View style={[styles.check, checked && styles.checkOn]}>
      {checked ? <Ionicons name="checkmark" size={15} color="#FFFFFF" /> : null}
    </View>
  );
}

export default function MentionPicker({
  visible,
  conversationId,
  token,
  onClose,
  onDone,
}: {
  visible: boolean;
  conversationId: string;
  token: string;
  onClose: () => void;
  onDone: (people: MentionPerson[], everyone: boolean) => void;
}) {
  const insets = useSafeAreaInsets();

  const [query, setQuery] = useState("");
  const [members, setMembers] = useState<MentionPerson[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, MentionPerson>>({});
  const [everyone, setEveryone] = useState(false);

  // Fresh start each time it opens.
  useEffect(() => {
    if (visible) {
      setQuery("");
      setSelected({});
      setEveryone(false);
    }
  }, [visible]);

  // People in this chat (search after a short pause in typing).
  useEffect(() => {
    if (!visible || !conversationId || !token) {
      return;
    }

    let cancelled = false;

    const timer = setTimeout(
      async () => {
        try {
          setLoading(true);
          setError(null);

          const result = await getChatMembers(
            conversationId,
            { search: query.trim(), limit: 50 },
            token,
          );

          if (!cancelled) {
            setMembers(result.members);
          }
        } catch (loadError) {
          if (!cancelled) {
            setMembers([]);
            setError(
              loadError instanceof Error
                ? loadError.message
                : "Couldn't load people.",
            );
          }
        } finally {
          if (!cancelled) {
            setLoading(false);
          }
        }
      },
      query.trim() ? 300 : 0,
    );

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [visible, conversationId, token, query]);

  const picked = useMemo(() => Object.values(selected), [selected]);
  const count = picked.length + (everyone ? 1 : 0);

  const toggle = (person: MentionPerson) => {
    setSelected((current) => {
      const next = { ...current };

      if (next[person.id]) {
        delete next[person.id];
      } else {
        next[person.id] = person;
      }

      return next;
    });
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
          <Text style={styles.title}>Mention</Text>

          <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close">
            <Ionicons name="close" size={24} color="#191922" />
          </Pressable>
        </View>

        <View style={styles.search}>
          <Ionicons name="search" size={18} color="#9C9CAA" />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search people in this chat"
            placeholderTextColor="#9C9CAA"
            style={styles.searchInput}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {loading ? <ActivityIndicator size="small" color={PINK} /> : null}
        </View>

        {/* EVERYONE */}
        {!query.trim() ? (
          <Pressable
            style={[styles.row, styles.everyoneRow]}
            onPress={() => setEveryone((current) => !current)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: everyone }}>
            <View style={styles.everyoneIcon}>
              <Ionicons name="people" size={20} color={PINK} />
            </View>

            <View style={styles.rowText}>
              <Text style={styles.rowName}>Everyone</Text>
              <Text style={styles.rowUsername}>
                Notify everyone in this chat
              </Text>
            </View>

            <Checkbox checked={everyone} />
          </Pressable>
        ) : null}

        <FlatList
          data={members}
          keyExtractor={(item) => item.id}
          style={styles.list}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            loading ? null : (
              <Text style={styles.empty}>
                {error ||
                  (query.trim() ? "Nobody found." : "Nobody else here yet.")}
              </Text>
            )
          }
          renderItem={({ item }) => {
            const checked = !!selected[item.id];

            return (
              <Pressable
                style={styles.row}
                onPress={() => toggle(item)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked }}>
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

                <Checkbox checked={checked} />
              </Pressable>
            );
          }}
        />

        <Pressable
          style={[styles.doneButton, count === 0 && styles.doneButtonOff]}
          onPress={() => onDone(picked, everyone)}
          disabled={count === 0}>
          <Ionicons name="at" size={18} color="#FFFFFF" />
          <Text style={styles.doneText}>
            {count === 0
              ? "Choose who to mention"
              : everyone
                ? "Mention everyone"
                : `Mention ${count} ${count === 1 ? "person" : "people"}`}
          </Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
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

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },

  title: {
    fontFamily: FONTS.semibold,
    fontSize: 18,
    color: "#191922",
  },

  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: "#0000000D",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.75)",
  },

  searchInput: {
    flex: 1,
    minWidth: 0,
    fontFamily: FONTS.regular,
    fontSize: 14.5,
    color: "#191922",
    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null),
  },

  list: {
    marginTop: 4,
    minHeight: 140,
  },

  empty: {
    paddingVertical: 28,
    textAlign: "center",
    fontFamily: FONTS.regular,
    fontSize: 13,
    color: "#8A8A93",
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
  },

  everyoneRow: {
    marginTop: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F3",
  },

  everyoneIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(195,77,156,0.12)",
  },

  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#F1E4EE",
  },

  rowText: {
    flex: 1,
    minWidth: 0,
  },

  rowName: {
    fontFamily: FONTS.semibold,
    fontSize: 14.5,
    color: "#191922",
  },

  rowUsername: {
    marginTop: 1,
    fontFamily: FONTS.regular,
    fontSize: 12.5,
    color: "#8A8A93",
  },

  check: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: "#C9C9D2",
    alignItems: "center",
    justifyContent: "center",
  },

  checkOn: {
    borderColor: PINK,
    backgroundColor: PINK,
  },

  doneButton: {
    marginTop: 12,
    height: 52,
    borderRadius: 26,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: PINK,
  },

  doneButtonOff: {
    opacity: 0.5,
  },

  doneText: {
    fontFamily: FONTS.semibold,
    fontSize: 15.5,
    color: "#FFFFFF",
  },
});
