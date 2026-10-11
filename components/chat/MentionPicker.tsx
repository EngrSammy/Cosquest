// ==========================================
// MENTION MEMBERS (Figma M13 · Checkbox mentions)
// ==========================================
// Full screen: "Find a member", Everyone (with the member count), then a
// checkbox beside every person (name, Owner/Admin, rank line). "2 selected ·
// Maya Chen & Diego Ruiz", "They'll be notified when you send your message",
// and "Confirm · mention 2 members". Opens from the @ button or typing "@".
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { RankLine } from "@/components/chat/RankBadge";
import { FONTS } from "@/constants/fonts";
import { getChatMembers } from "@/services/chats";
import type { Rank } from "@/services/ranks";

const PINK = "#B63D91";
const INK = "#24283C";
const MUTED = "#66738A";
const LINE = "rgba(36,40,60,0.08)";

export type MentionPerson = {
  id: string;
  username: string;
  name?: string | null;
  avatarKey?: string | null;
  avatarPhotoUrl?: string | null;
  rank?: Rank | null;
  role?: string | null;
};

const AVATAR_TINTS = ["#E9E1F5", "#DCE8EF", "#F3DDED", "#E2F0E8", "#F5E6D8"];

function avatarTint(name?: string) {
  let hash = 0;
  for (const char of String(name || "")) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return AVATAR_TINTS[hash % AVATAR_TINTS.length];
}

function initialsOf(name?: string) {
  const parts = String(name || "?").trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[1][0] : (parts[0] || "?").slice(0, 2);
  return letters.toUpperCase();
}

function namesOf(people: MentionPerson[]) {
  const names = people.map((person) => person.name || person.username);
  if (names.length <= 2) return names.join(" & ");
  return `${names.slice(0, 2).join(", ")} & ${names.length - 2} more`;
}

function Checkbox({ checked }: { checked: boolean }) {
  return (
    <View style={[styles.check, checked && styles.checkOn]}>
      {checked ? <Ionicons name="checkmark" size={16} color="#FFFFFF" /> : null}
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
  const [total, setTotal] = useState(0);
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
    if (!visible || !conversationId || !token) return;
    let cancelled = false;

    const timer = setTimeout(
      async () => {
        try {
          setLoading(true);
          setError(null);
          const result = await getChatMembers(conversationId, { search: query.trim(), limit: 50 }, token);
          if (!cancelled) {
            setMembers(result.members as unknown as MentionPerson[]);
            if (!query.trim()) setTotal(result.total || result.members.length);
          }
        } catch (loadError) {
          if (!cancelled) {
            setMembers([]);
            setError(loadError instanceof Error ? loadError.message : "Couldn't load people.");
          }
        } finally {
          if (!cancelled) setLoading(false);
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
  const count = picked.length;

  const toggle = (person: MentionPerson) => {
    setSelected((current) => {
      const next = { ...current };
      if (next[person.id]) delete next[person.id];
      else next[person.id] = person;
      return next;
    });
  };

  const confirmLabel = everyone
    ? "Confirm · mention everyone"
    : count
      ? `Confirm · mention ${count} ${count === 1 ? "member" : "members"}`
      : "Choose who to mention";

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <LinearGradient colors={["#F6F9FE", "#E3F0FC"]} style={styles.screen}>
        {/* HEADER */}
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Back">
            <Ionicons name="chevron-back" size={26} color={INK} />
          </Pressable>
          <Text style={styles.title}>Mention members</Text>
          <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close">
            <Ionicons name="close" size={26} color={MUTED} />
          </Pressable>
        </View>

        <ScrollView
          style={styles.flex}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 110 }]}
          keyboardShouldPersistTaps="handled">
          {/* SEARCH */}
          <View style={styles.search}>
            <Ionicons name="ellipse-outline" size={16} color={MUTED} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Find a member"
              placeholderTextColor="#9AA3B5"
              style={styles.searchInput}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {loading ? <ActivityIndicator size="small" color={PINK} /> : null}
          </View>

          {/* EVERYONE */}
          {!query.trim() ? (
            <Pressable style={styles.everyoneRow} onPress={() => setEveryone((value) => !value)}>
              <Checkbox checked={everyone} />
              <Text style={styles.everyoneText}>Everyone</Text>
              <View style={styles.countChip}>
                <Text style={styles.countChipText}>{total || members.length} members</Text>
              </View>
            </Pressable>
          ) : null}

          {/* PEOPLE */}
          {members.map((person, index) => {
            const checked = everyone || !!selected[person.id];
            const name = person.name || person.username;
            return (
              <Pressable
                key={person.id}
                style={[styles.row, index === members.length - 1 && styles.rowLast]}
                onPress={() => !everyone && toggle(person)}
                disabled={everyone}>
                <Checkbox checked={checked} />
                {person.avatarPhotoUrl ? (
                  <Image source={{ uri: person.avatarPhotoUrl }} style={styles.avatar} contentFit="cover" />
                ) : (
                  <View style={[styles.avatar, styles.avatarInitialsWrap, { backgroundColor: avatarTint(name) }]}>
                    <Text style={styles.avatarInitials}>{initialsOf(name)}</Text>
                  </View>
                )}
                <View style={styles.flex}>
                  <View style={styles.nameRow}>
                    <Text style={styles.name} numberOfLines={1}>
                      {name}
                    </Text>
                    {person.role === "owner" || person.role === "admin" ? (
                      <Text style={styles.role}>{person.role === "owner" ? "Owner" : "Admin"}</Text>
                    ) : null}
                  </View>
                  <RankLine rank={person.rank} />
                  <Text style={styles.handle} numberOfLines={1}>
                    @{person.username}
                  </Text>
                </View>
              </Pressable>
            );
          })}

          {!loading && error ? <Text style={styles.empty}>{error}</Text> : null}
          {!loading && !error && !members.length ? (
            <Text style={styles.empty}>{query.trim() ? "No one matches that name." : "No one else is in this chat yet."}</Text>
          ) : null}

          {/* SUMMARY */}
          {everyone || count ? (
            <>
              <Text style={styles.selected}>
                {everyone ? "Everyone selected" : `${count} selected · ${namesOf(picked)}`}
              </Text>
              <Text style={styles.selectedHint}>They'll be notified when you send your message.</Text>
            </>
          ) : null}
        </ScrollView>

        {/* CONFIRM */}
        <View style={[styles.footer, { paddingBottom: insets.bottom + 14 }]}>
          <Pressable
            style={[styles.confirm, !everyone && !count && styles.off]}
            disabled={!everyone && !count}
            onPress={() => onDone(everyone ? [] : picked, everyone)}>
            <Text style={styles.confirmText}>{confirmLabel}</Text>
          </Pressable>
        </View>
      </LinearGradient>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },

  flex: { flex: 1, minWidth: 0 },

  off: { opacity: 0.5 },

  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingBottom: 8 },

  title: { flex: 1, fontFamily: FONTS.semibold, fontSize: 22, lineHeight: 28, color: INK },

  content: { paddingHorizontal: 18, paddingTop: 12 },

  search: {
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "rgba(102,115,138,0.25)",
  },

  searchInput: {
    flex: 1,
    padding: 0,
    fontFamily: FONTS.regular,
    fontSize: 15,
    color: INK,
    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null),
  },

  everyoneRow: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 18 },

  everyoneText: { flex: 1, fontFamily: FONTS.semibold, fontSize: 16, color: INK },

  countChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: "#ECE8F4" },

  countChipText: { fontFamily: FONTS.medium, fontSize: 11.5, color: MUTED },

  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: LINE },

  rowLast: { borderBottomWidth: 0 },

  check: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: "#C9CFDB",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },

  checkOn: { backgroundColor: PINK, borderColor: PINK },

  avatar: { width: 44, height: 44, borderRadius: 22 },

  avatarInitialsWrap: { alignItems: "center", justifyContent: "center" },

  avatarInitials: { fontFamily: FONTS.bold, fontSize: 12, color: "#7D356D" },

  nameRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 3 },

  name: { flexShrink: 1, fontFamily: FONTS.semibold, fontSize: 15, color: INK },

  role: { fontFamily: FONTS.semibold, fontSize: 11, color: PINK },

  handle: { marginTop: 3, fontFamily: FONTS.regular, fontSize: 12, color: MUTED },

  empty: { paddingVertical: 20, textAlign: "center", fontFamily: FONTS.regular, fontSize: 13, color: MUTED },

  selected: { marginTop: 16, fontFamily: FONTS.semibold, fontSize: 13.5, color: PINK },

  selectedHint: { marginTop: 10, fontFamily: FONTS.regular, fontSize: 13, color: MUTED },

  footer: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 18, paddingTop: 10 },

  confirm: { height: 52, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: PINK },

  confirmText: { fontFamily: FONTS.semibold, fontSize: 16, color: "#FFFFFF" },
});
