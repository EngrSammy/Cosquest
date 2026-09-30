import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Share as NativeShare,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  createShareChat,
  getSuggestedPeople,
  searchPeople,
  sendSharedPostMessage,
} from "@/services/share";
import { useAppSelector } from "@/store/hooks";
import { getPostShareLink } from "@/utils/shareLinks";

import { ShareAction } from "./ShareAction";
import { SharePerson } from "./SharePerson";

// How many friends to show before searching.
const MAX_SUGGESTIONS = 9;

type Person = {
  id?: string;
  username: string;
  name?: string;
  avatarKey?: string | null;
  avatarPhotoUrl?: string | null;
};

// Merge lists, one entry per username (later lists win, since they carry
// fuller data), without the current user.
function mergePeople(lists: Person[][], currentUsername: string): Person[] {
  const me = currentUsername.replace(/^@/, "").toLowerCase();
  const byUsername = new Map<string, Person>();

  lists.forEach((list) => {
    list.forEach((person) => {
      const key = person?.username?.replace(/^@/, "").toLowerCase();

      if (!key || key === me) {
        return;
      }

      byUsername.set(key, { ...byUsername.get(key), ...person });
    });
  });

  return Array.from(byUsername.values());
}

export function ShareSheet({
  visible,
  post,
  token,
  onClose,
}: {
  visible: boolean;
  post: any;
  token: string;
  onClose: () => void;
}) {
  const authUser = useAppSelector((state) => state.auth.user);
  const user = useAppSelector((state) => state.user.user);

  const currentUsername =
    authUser?.profile?.username ||
    user?.profile?.username ||
    user?.username ||
    "";

  // Friends the app already knows about — shown instantly, no loading:
  //   - people you've chatted with (DMs)
  //   - people you follow
  const conversations = useAppSelector((state) => state.chat.conversations);
  const following = useAppSelector((state) => state.follow.following);

  const knownFriends = useMemo(() => {
    const dmPartners: Person[] = conversations
      .filter((chat) => chat.type === "dm" && chat.otherParticipant?.username)
      .map((chat) => ({
        id: chat.otherParticipant?.id,
        username: chat.otherParticipant!.username!,
        avatarPhotoUrl: chat.otherParticipant?.avatarPhotoUrl || null,
        avatarKey: (chat.otherParticipant as any)?.avatarKey || null,
      }));

    return mergePeople([dmPartners, following as Person[]], currentUsername);
  }, [conversations, following, currentUsername]);

  const [searchText, setSearchText] = useState("");
  const [people, setPeople] = useState<Person[]>([]);
  const [loadingPeople, setLoadingPeople] = useState(false);
  const [sendingUsername, setSendingUsername] = useState<string | null>(null);
  const [sent, setSent] = useState<Record<string, boolean>>({});

  // A normal web link (https://.../post/<id>) once the website address is
  // known — see utils/shareLinks.ts. Anyone can open it.
  const postLink = getPostShareLink(String(post?.id || ""));
  const shareMessage = `Check out this post on CosQuest:\n${postLink}`;

  const loadSuggestions = useCallback(async () => {
    // Show the friends we already know about straight away.
    setPeople(knownFriends);

    if (!currentUsername || knownFriends.length >= MAX_SUGGESTIONS) {
      return;
    }

    // Top up with your following list from the backend.
    setLoadingPeople(knownFriends.length === 0);

    try {
      const result = await getSuggestedPeople(token, currentUsername);

      setPeople(
        mergePeople([knownFriends, result?.users || []], currentUsername),
      );
    } catch {
      // Keep whatever we already have.
    } finally {
      setLoadingPeople(false);
    }
  }, [token, currentUsername, knownFriends]);

  useEffect(() => {
    if (!visible) {
      return;
    }

    setSearchText("");
    setSent({});
    loadSuggestions();
    // Only when the sheet opens — not every time the friend lists update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  useEffect(() => {
    const query = searchText.trim();

    if (!visible) {
      return;
    }

    if (!query) {
      setPeople(knownFriends);
      return;
    }

    const timer = setTimeout(async () => {
      setLoadingPeople(true);

      try {
        const result = await searchPeople(token, query);

        setPeople(mergePeople([result?.users || []], currentUsername));
      } catch {
        setPeople([]);
      } finally {
        setLoadingPeople(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchText, visible, token, currentUsername, knownFriends]);

  const shareWithPerson = async (person: Person) => {
    if (!person?.username) {
      return;
    }

    try {
      setSendingUsername(person.username);

      const chat = await createShareChat(token, person.username);

      const conversationId = chat?.chat?.id;

      if (!conversationId) {
        throw new Error("Conversation could not be opened.");
      }

      await sendSharedPostMessage(token, conversationId, shareMessage);

      setSent((current) => ({
        ...current,
        [person.username]: true,
      }));

      Alert.alert("Shared", `Post shared with @${person.username}.`);
    } catch (error) {
      Alert.alert(
        "Unable to share",
        error instanceof Error ? error.message : "Unable to share this post.",
      );
    } finally {
      setSendingUsername(null);
    }
  };

  const copyLink = async () => {
    try {
      await Clipboard.setStringAsync(postLink);

      Alert.alert("Copied", "Post link copied.");
    } catch {
      Alert.alert("Copy link", "Unable to copy the post link.");
    }
  };

  // wa.me works everywhere: opens the WhatsApp app on phones, and WhatsApp
  // Web / Desktop on computers. (whatsapp:// only worked on phones.)
  const whatsapp = async () => {
    const url = `https://wa.me/?text=${encodeURIComponent(shareMessage)}`;

    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert("WhatsApp", "Unable to open WhatsApp.");
    }
  };

  const nativeShare = async () => {
    // Browsers without a share menu (most desktop browsers): copy instead.
    if (
      Platform.OS === "web" &&
      (typeof navigator === "undefined" || !(navigator as any).share)
    ) {
      await copyLink();
      return;
    }

    try {
      await NativeShare.share({
        title: "Share CosQuest post",
        message: shareMessage,
        url: postLink,
      });
    } catch {
      // User cancelled the share menu.
    }
  };

  const addStory = () => {
    Alert.alert(
      "Add to Story",
      "Story publishing is not connected to the current backend yet.",
    );
  };

  const waStatus = async () => {
    await whatsapp();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Pressable style={styles.overlay} onPress={onClose} />

        <View style={styles.sheet}>
          <View style={styles.handle} />

          {/* HEADER */}
          <View style={styles.header}>
            <Text style={styles.title}>Share</Text>

            <Pressable style={styles.close} onPress={onClose}>
              <Ionicons name="close" size={23} color="#191922" />
            </Pressable>
          </View>

          {/* SEARCH */}
          <View style={styles.searchRow}>
            <View style={styles.searchBox}>
              <Ionicons name="search" size={18} color="#C5399A" />

              <TextInput
                value={searchText}
                onChangeText={setSearchText}
                placeholder="Search friends..."
                placeholderTextColor="#9999A1"
                style={styles.searchInput}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <Pressable
              style={styles.plus}
              onPress={() => {
                setSearchText("");
                loadSuggestions();
              }}>
              <Ionicons name="add" size={25} color="#FFFFFF" />
            </Pressable>
          </View>

          {/* PEOPLE */}
          <View style={styles.peopleArea}>
            {loadingPeople ? (
              <View style={styles.loading}>
                <ActivityIndicator size="small" color="#C5399A" />
              </View>
            ) : people.length === 0 ? (
              <View style={styles.noPeople}>
                <Ionicons name="people-outline" size={30} color="#B0B0B7" />

                <Text style={styles.noPeopleText}>
                  {searchText.trim()
                    ? "No users found"
                    : "Follow people or start a chat to share with them here"}
                </Text>
              </View>
            ) : (
              <View style={styles.peopleGrid}>
                {people.slice(0, MAX_SUGGESTIONS).map((person) => (
                  <SharePerson
                    key={person.id || person.username}
                    person={person}
                    sent={!!sent[person.username]}
                    sending={sendingUsername === person.username}
                    onPress={() => shareWithPerson(person)}
                  />
                ))}
              </View>
            )}
          </View>

          <View style={styles.divider} />

          {/* SHARE ACTIONS */}
          <View style={styles.actions}>
            <ShareAction icon="link" label="Copy link" onPress={copyLink} />

            <ShareAction
              icon="star-outline"
              label="Add to story"
              onPress={addStory}
            />

            <ShareAction
              icon="logo-whatsapp"
              label="WhatsApp"
              onPress={whatsapp}
            />

            <ShareAction
              icon="share-outline"
              label="Share to..."
              onPress={nativeShare}
            />

            <ShareAction
              icon="add-circle-outline"
              label="WA Status"
              onPress={waStatus}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "flex-end",
  },

  overlay: {
    // Was StyleSheet.absoluteFillObject, which no longer exists in this
    // React Native version — the dark background behind the sheet was
    // silently missing.
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.30)",
  },

  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: Platform.OS === "ios" ? 26 : 18,
  },

  handle: {
    alignSelf: "center",
    width: 42,
    height: 5,
    borderRadius: 4,
    backgroundColor: "#C7C7CC",
    marginBottom: 12,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },

  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#191922",
  },

  close: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F0F0F3",
  },

  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },

  searchBox: {
    flex: 1,
    height: 42,
    borderRadius: 21,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 14,
    backgroundColor: "rgba(197,57,154,0.09)",
  },

  searchInput: {
    flex: 1,
    fontSize: 13,
    color: "#191922",
  },

  plus: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#C5399A",
  },

  peopleArea: {
    minHeight: 190,
    paddingTop: 15,
  },

  peopleGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-start",
    rowGap: 18,
  },

  loading: {
    height: 170,
    alignItems: "center",
    justifyContent: "center",
  },

  noPeople: {
    height: 170,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },

  noPeopleText: {
    marginTop: 8,
    fontSize: 13,
    color: "#8B8B93",
    textAlign: "center",
  },

  divider: {
    height: 1,
    backgroundColor: "#EEEEF1",
    marginVertical: 8,
  },

  actions: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingTop: 5,
  },
});
