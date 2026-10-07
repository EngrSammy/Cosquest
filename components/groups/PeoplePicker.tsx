// ==========================================
// CHOOSE PEOPLE (checkboxes) - New group / Add people
// ==========================================
// People you follow and chat with, plus a username search. Tap to tick.
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useEffect, useMemo, useState } from "react";
import {
      ActivityIndicator,
      Platform,
      Pressable,
      StyleSheet,
      Text,
      TextInput,
      View,
} from "react-native";

import { FONTS } from "@/constants/fonts";
import type { GroupPerson } from "@/services/groups";
import { searchPeople } from "@/services/share";
import { useAppSelector } from "@/store/hooks";
import { getAvatarSource } from "@/utils/callHelpers";

import { INK, MILKY, MUTED, PINK } from "./GroupUi";

function keyOf(person: GroupPerson) {
  return (person.id || person.username).toLowerCase();
}

export default function PeoplePicker({
  selected,
  onToggle,
  excludeIds = [],
  max,
}: {
  selected: Record<string, GroupPerson>;
  onToggle: (person: GroupPerson) => void;
  // People already in the group (can't be picked again).
  excludeIds?: string[];
  max?: number;
}) {
  const token = useAppSelector((state) => state.auth.token);
  const following = useAppSelector((state) => state.follow.following);
  const conversations = useAppSelector((state) => state.chat.conversations);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GroupPerson[]>([]);
  const [searching, setSearching] = useState(false);

  // Friends the app already knows: people you chat with and people you follow.
  const friends = useMemo(() => {
    const byName = new Map<string, GroupPerson>();

    conversations
      .filter(
        (chat: any) => chat.type === "dm" && chat.otherParticipant?.username,
      )
      .forEach((chat: any) => {
        const other = chat.otherParticipant;
        byName.set(other.username.toLowerCase(), {
          id: String(other.id || ""),
          username: other.username,
          name: other.name,
          avatarKey: other.avatarKey,
          avatarPhotoUrl: other.avatarPhotoUrl,
        });
      });

    following.forEach((person: any) => {
      if (!person?.username) return;
      const key = person.username.toLowerCase();
      byName.set(key, {
        ...byName.get(key),
        ...person,
        id: String(person.id || byName.get(key)?.id || ""),
      });
    });

    return [...byName.values()].filter((person) => person.id);
  }, [conversations, following]);

  // Username search (after a short pause in typing).
  useEffect(() => {
    const text = query.trim();

    if (!text || !token) {
      setResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);

    const timer = setTimeout(async () => {
      try {
        const response = await searchPeople(token, text);
        setResults(
          ((response?.users || []) as any[])
            .map((user) => ({ ...user, id: String(user.id || user._id || "") }))
            .filter((user) => user.id && user.username),
        );
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query, token]);

  const excluded = new Set(excludeIds.map(String));
  const list = (query.trim() ? results : friends).filter(
    (person) => !excluded.has(person.id),
  );
  const count = Object.keys(selected).length;

  return (
    <View>
      <View style={styles.search}>
        <Ionicons name="search" size={18} color="#9C9CAA" />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search by username"
          placeholderTextColor="#9C9CAA"
          style={styles.searchInput}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {searching ? <ActivityIndicator size="small" color={PINK} /> : null}
      </View>

      {list.length === 0 ? (
        <Text style={styles.empty}>
          {query.trim()
            ? searching
              ? "Searching…"
              : "Nobody found."
            : "People you follow or chat with show up here. You can also search."}
        </Text>
      ) : (
        list.map((person) => {
          const checked = !!selected[keyOf(person)];
          const full = !checked && max !== undefined && count >= max;

          return (
            <Pressable
              key={keyOf(person)}
              style={[styles.row, full && styles.rowOff]}
              disabled={full}
              onPress={() => onToggle(person)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked }}>
              <Image
                source={getAvatarSource(person)}
                style={styles.avatar}
                contentFit="cover"
              />

              <View style={styles.rowText}>
                <Text style={styles.name} numberOfLines={1}>
                  {person.name || person.username}
                </Text>
                <Text style={styles.username} numberOfLines={1}>
                  @{person.username}
                </Text>
              </View>

              <View style={[styles.check, checked && styles.checkOn]}>
                {checked ? (
                  <Ionicons name="checkmark" size={15} color="#FFFFFF" />
                ) : null}
              </View>
            </Pressable>
          );
        })
      )}
    </View>
  );
}

export { keyOf as personKey };

const styles = StyleSheet.create({
  search: {
    ...MILKY,
    height: 46,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    marginBottom: 6,
  },

  searchInput: {
    flex: 1,
    minWidth: 0,
    fontFamily: FONTS.regular,
    fontSize: 14.5,
    color: INK,
    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null),
  },

  empty: {
    paddingVertical: 22,
    textAlign: "center",
    fontFamily: FONTS.regular,
    fontSize: 13,
    color: MUTED,
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 9,
  },

  rowOff: { opacity: 0.4 },

  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#F1E4EE",
  },

  rowText: { flex: 1, minWidth: 0 },

  name: { fontFamily: FONTS.semibold, fontSize: 14.5, color: INK },

  username: {
    marginTop: 1,
    fontFamily: FONTS.regular,
    fontSize: 12.5,
    color: MUTED,
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

  checkOn: { borderColor: PINK, backgroundColor: PINK },
});
