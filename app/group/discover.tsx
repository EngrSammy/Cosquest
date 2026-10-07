// ==========================================
// DISCOVER GROUPS
// ==========================================
// Open community spaces (and faction groups for your faction) you're not in
// yet, with a Join button. Also: paste an invite link someone sent you.
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
      ActivityIndicator,
      Alert,
      Platform,
      Pressable,
      ScrollView,
      StyleSheet,
      Text,
      TextInput,
      View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
      GroupAvatar,
      GroupScreen,
      INK,
      MILKY,
      MUTED,
      PINK,
      SectionLabel,
} from "@/components/groups/GroupUi";
import { FONTS } from "@/constants/fonts";
import {
      discoverGroups,
      inviteCodeFrom,
      joinGroup,
      type GroupPreview,
} from "@/services/groups";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { fetchChats } from "@/store/thunks/chatThunks";
import { safeBack } from "@/utils/safeBack";

const KIND_LABEL = {
  private: "Private",
  open: "Open community",
  faction: "Faction group",
} as const;

export default function DiscoverGroups() {
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  const token = useAppSelector((state) => state.auth.token);

  const [query, setQuery] = useState("");
  const [groups, setGroups] = useState<GroupPreview[]>([]);
  const [loading, setLoading] = useState(true);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [link, setLink] = useState("");

  useEffect(() => {
    if (!token) return;

    let cancelled = false;
    setLoading(true);

    const timer = setTimeout(
      async () => {
        try {
          const result = await discoverGroups(query, token);
          if (!cancelled) setGroups(result);
        } catch {
          if (!cancelled) setGroups([]);
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
  }, [query, token]);

  const join = async (group: GroupPreview) => {
    if (!token) return;
    try {
      setJoiningId(group.id);
      const result = await joinGroup(group.id, token);
      if (result.joined) {
        dispatch(fetchChats(token));
        router.replace({ pathname: "/chat/[id]", params: { id: group.id } });
      } else if (result.requested) {
        setGroups((current) =>
          current.map((item) =>
            item.id === group.id ? { ...item, requestPending: true } : item,
          ),
        );
        Alert.alert(
          "Request sent",
          "An admin will review your request to join.",
        );
      }
    } catch (error) {
      Alert.alert(
        "Join group",
        error instanceof Error ? error.message : "Couldn't join the group.",
      );
    } finally {
      setJoiningId(null);
    }
  };

  const openLink = () => {
    const code = inviteCodeFrom(link);
    if (!code) return;
    router.push({ pathname: "/group/join/[code]", params: { code } });
  };

  return (
    <GroupScreen title="Discover groups" onBack={() => safeBack()}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: insets.bottom + 40 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        {/* INVITE LINK */}
        <SectionLabel>HAVE AN INVITE LINK?</SectionLabel>
        <View style={styles.linkRow}>
          <Ionicons name="link" size={18} color={PINK} />
          <TextInput
            value={link}
            onChangeText={setLink}
            placeholder="Paste it here"
            placeholderTextColor="#9C9CAA"
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
            onSubmitEditing={openLink}
          />
          <Pressable
            onPress={openLink}
            disabled={!link.trim()}
            style={[styles.goButton, !link.trim() && styles.off]}>
            <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
          </Pressable>
        </View>

        {/* SEARCH */}
        <SectionLabel>OPEN GROUPS</SectionLabel>
        <View style={styles.linkRow}>
          <Ionicons name="search" size={18} color="#9C9CAA" />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search groups"
            placeholderTextColor="#9C9CAA"
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
          />
          {loading ? <ActivityIndicator size="small" color={PINK} /> : null}
        </View>

        {!loading && groups.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="people-outline" size={34} color="#9C9CAA" />
            <Text style={styles.emptyText}>
              {query.trim()
                ? "No groups found."
                : "No open groups to join yet. Create one from Chats!"}
            </Text>
          </View>
        ) : null}

        <View style={styles.list}>
          {groups.map((group) => (
            <Pressable
              key={group.id}
              style={styles.card}
              onPress={() =>
                router.push({
                  pathname: "/group/[id]",
                  params: { id: group.id },
                })
              }>
              <GroupAvatar
                name={group.name}
                photoUrl={group.photoUrl}
                size={50}
              />

              <View style={styles.cardText}>
                <Text style={styles.cardName} numberOfLines={1}>
                  {group.name}
                </Text>
                <Text style={styles.cardMeta} numberOfLines={1}>
                  {KIND_LABEL[group.kind]} · {group.memberCount}{" "}
                  {group.memberCount === 1 ? "member" : "members"}
                </Text>
                {group.description ? (
                  <Text style={styles.cardDescription} numberOfLines={2}>
                    {group.description}
                  </Text>
                ) : null}
              </View>

              <Pressable
                style={[
                  styles.joinButton,
                  (group.requestPending || joiningId === group.id) &&
                    styles.off,
                ]}
                disabled={group.requestPending || joiningId === group.id}
                onPress={() => join(group)}>
                {joiningId === group.id ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.joinText}>
                    {group.requestPending
                      ? "Sent"
                      : group.joinMode === "approval"
                        ? "Ask"
                        : "Join"}
                  </Text>
                )}
              </Pressable>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </GroupScreen>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: 20,
    width: "100%",
    maxWidth: 640,
    alignSelf: "center",
  },

  linkRow: {
    ...MILKY,
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingLeft: 14,
    paddingRight: 6,
  },

  input: {
    flex: 1,
    minWidth: 0,
    fontFamily: FONTS.regular,
    fontSize: 14,
    color: INK,
    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null),
  },

  goButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: PINK,
  },

  off: { opacity: 0.5 },

  empty: { alignItems: "center", paddingVertical: 34, gap: 8 },

  emptyText: {
    fontFamily: FONTS.regular,
    fontSize: 13,
    color: MUTED,
    textAlign: "center",
  },

  list: { gap: 12, marginTop: 14 },

  card: {
    ...MILKY,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
  },

  cardText: { flex: 1, minWidth: 0 },

  cardName: { fontFamily: FONTS.semibold, fontSize: 15, color: INK },

  cardMeta: {
    marginTop: 1,
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: MUTED,
  },

  cardDescription: {
    marginTop: 4,
    fontFamily: FONTS.regular,
    fontSize: 12,
    lineHeight: 17,
    color: "#4A4A52",
  },

  joinButton: {
    minWidth: 64,
    height: 34,
    paddingHorizontal: 14,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: PINK,
  },

  joinText: { fontFamily: FONTS.semibold, fontSize: 13, color: "#FFFFFF" },
});
