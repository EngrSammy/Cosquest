// ==========================================
// EVERYONE IN A BIG CALL
// ==========================================
// Opened from "1,234 in the call" on the stage. A virtualised list (only
// the rows on screen exist), with search; tap someone to pin them to the
// stage. The list is only built while this sheet is open.
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import type { Room } from "livekit-client";
import { memo, useCallback, useMemo, useState } from "react";
import {
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

import type { CallPerson } from "@/services/calls";
import { getAvatarSource } from "@/utils/callHelpers";

import { CALL_COLORS } from "./CallVisuals";
import type { RosterEntry } from "./stageModel";
import { formatCount, useRoster } from "./stageModel";

const ROW_HEIGHT = 60;

export default function ParticipantListSheet({
  visible,
  room,
  people,
  count,
  pinnedId,
  onPin,
  onClose,
}: {
  visible: boolean;
  room: Room;
  people: Map<string, CallPerson>;
  count: number;
  pinnedId: string | null;
  onPin: (identity: string) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");

  const roster = useRoster(room, visible, people);

  const shown = useMemo(() => {
    const text = query.trim().toLowerCase();

    if (!text) return roster;

    return roster.filter((entry) => {
      const username = people.get(entry.identity)?.username || "";
      return (
        entry.name.toLowerCase().includes(text) ||
        username.toLowerCase().includes(text)
      );
    });
  }, [roster, query, people]);

  const renderItem = useCallback(
    ({ item }: { item: RosterEntry }) => (
      <Row
        entry={item}
        person={people.get(item.identity) || null}
        pinned={item.identity === pinnedId}
        onPin={onPin}
      />
    ),
    [people, pinnedId, onPin],
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />

      <View style={[styles.sheet, { paddingBottom: insets.bottom + 10 }]}>
        <View style={styles.handle} />

        <View style={styles.header}>
          <Text style={styles.title}>{formatCount(count)} in the call</Text>

          <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close">
            <Ionicons name="close" size={24} color={CALL_COLORS.text} />
          </Pressable>
        </View>

        <Text style={styles.hint}>Tap someone to pin them to the stage.</Text>

        <View style={styles.search}>
          <Ionicons name="search" size={18} color={CALL_COLORS.muted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search people in this call"
            placeholderTextColor={CALL_COLORS.muted}
            style={styles.searchInput}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <FlatList
          data={shown}
          keyExtractor={keyOf}
          renderItem={renderItem}
          getItemLayout={getItemLayout}
          initialNumToRender={14}
          maxToRenderPerBatch={20}
          windowSize={7}
          // Android only (the RN default): on iOS (Fabric) clipping inside this
          // modal, whose rows change with every speaker update, is where the
          // main thread was found stuck (updateClippedSubviewsWithClipRect).
          removeClippedSubviews={Platform.OS === "android"}
          keyboardShouldPersistTaps="handled"
          style={styles.list}
          ListEmptyComponent={
            <Text style={styles.empty}>
              {query.trim() ? "Nobody by that name." : "Loading…"}
            </Text>
          }
        />
      </View>
    </Modal>
  );
}

function keyOf(entry: RosterEntry) {
  return entry.identity;
}

function getItemLayout(_: unknown, index: number) {
  return { length: ROW_HEIGHT, offset: ROW_HEIGHT * index, index };
}

const Row = memo(function Row({
  entry,
  person,
  pinned,
  onPin,
}: {
  entry: RosterEntry;
  person: CallPerson | null;
  pinned: boolean;
  onPin: (identity: string) => void;
}) {
  const content = (
    <>
      <View style={[styles.avatarRing, entry.speaking && styles.avatarRingOn]}>
        <Image
          source={getAvatarSource(person)}
          style={styles.avatar}
          contentFit="cover"
          cachePolicy="memory-disk"
        />
      </View>

      <View style={styles.rowText}>
        <Text style={styles.rowName} numberOfLines={1}>
          {entry.name}
        </Text>
        {entry.speaking || pinned ? (
          <Text style={styles.rowSub} numberOfLines={1}>
            {[entry.speaking ? "Speaking" : null, pinned ? "Pinned" : null]
              .filter(Boolean)
              .join(" · ")}
          </Text>
        ) : null}
      </View>

      <Ionicons
        name={entry.micOn ? "mic" : "mic-off"}
        size={18}
        color={entry.micOn ? CALL_COLORS.text : CALL_COLORS.muted}
      />
    </>
  );

  if (entry.isLocal) {
    return <View style={styles.row}>{content}</View>;
  }

  return (
    <Pressable
      style={styles.row}
      onPress={() => onPin(entry.identity)}
      accessibilityRole="button"
      accessibilityLabel={`${entry.name}, ${entry.micOn ? "mic on" : "muted"}. Pin to stage`}>
      {content}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)" },

  sheet: {
    height: "78%",
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
    fontVariant: ["tabular-nums"],
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

  list: { flex: 1, marginTop: 8 },

  empty: {
    paddingVertical: 30,
    textAlign: "center",
    fontSize: 13,
    color: CALL_COLORS.muted,
  },

  row: {
    height: ROW_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  avatarRing: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 2,
    borderColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },

  avatarRingOn: { borderColor: CALL_COLORS.pink },

  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#2A1030",
  },

  rowText: { flex: 1, minWidth: 0 },

  rowName: { fontSize: 15, fontWeight: "700", color: CALL_COLORS.text },

  rowSub: { marginTop: 1, fontSize: 12, color: CALL_COLORS.pink },
});
