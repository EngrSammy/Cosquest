import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

import { sharePost } from "@/services/posts";
import {
  createShareChat,
  getSuggestedPeople,
  searchPeople,
  sendSharedPostMessage,
} from "@/services/share";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { shareToFeedThunk } from "@/store/thunks/shareToFeedThunk";
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

// The backend's reply to "count a share" may name the new total in
// different ways; null when it doesn't say.
function readShareCount(result: any): number | null {
  const value =
    result?.shares ??
    result?.shareCount ??
    result?.count ??
    result?.post?.shares ??
    result?.post?.shareCount;

  return typeof value === "number" ? value : null;
}

export function ShareSheet({
  visible,
  post,
  token,
  onClose,
  onShared,
}: {
  visible: boolean;
  post: any;
  token: string;
  onClose: () => void;
  // Called after a share was counted: the new total if the backend sent
  // it, otherwise null (the post then just adds 1).
  onShared?: (newTotal: number | null) => void;
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

  const dispatch = useAppDispatch();

  // SHARE TO FEED: a caption box, then a new post in the feed with this
  // post inside it (like Facebook's "Share now").
  const [composerOpen, setComposerOpen] = useState(false);
  const [caption, setCaption] = useState("");
  const [sharingToFeed, setSharingToFeed] = useState(false);

  // SHARE COUNT: tell the backend each time the post is actually shared.
  // Each friend / app counts once per opening of this sheet (copying the
  // same link five times isn't five shares).
  const countedRef = useRef<Set<string>>(new Set());

  const recordShare = useCallback(
    async (method: string) => {
      const postId = String(post?.id || "");

      if (!postId || !token || countedRef.current.has(method)) {
        return;
      }

      countedRef.current.add(method);

      try {
        const result = await sharePost(postId, token);
        onShared?.(readShareCount(result));
      } catch {
        // Counting failed - the share itself still worked. Allow a retry.
        countedRef.current.delete(method);
      }
    },
    [post?.id, token, onShared],
  );

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
    countedRef.current = new Set();
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

      recordShare(`person:${person.username}`);

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

      recordShare("copy");

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

      recordShare("whatsapp");
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
      const result = await NativeShare.share({
        title: "Share CosQuest post",
        message: shareMessage,
        url: postLink,
      });

      // Only count it if they didn't cancel the share menu.
      if (result?.action !== NativeShare.dismissedAction) {
        recordShare("system");
      }
    } catch {
      // User cancelled the share menu.
    }
  };

  const openFeedComposer = () => {
    setCaption("");
    setComposerOpen(true);
  };

  const shareToFeed = async () => {
    const postId = String(post?.id || "");

    if (!postId || !token || sharingToFeed) {
      return;
    }

    try {
      setSharingToFeed(true);

      const result = await dispatch(
        shareToFeedThunk({ postId, token, content: caption }),
      ).unwrap();

      setComposerOpen(false);
      setCaption("");

      // The backend already counted this share - just show the new number.
      onShared?.(
        typeof result?.shareCount === "number" ? result.shareCount : null,
      );

      onClose();
      Alert.alert("Shared", "The post was shared to your feed.");
    } catch (error) {
      Alert.alert(
        "Share to feed",
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Could not share the post.",
      );
    } finally {
      setSharingToFeed(false);
    }
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
              icon="repeat"
              label="Share to feed"
              onPress={openFeedComposer}
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

        {/* SHARE TO FEED: optional caption */}
        {composerOpen ? (
          <View style={styles.composerLayer}>
            <Pressable
              style={styles.overlay}
              onPress={() => !sharingToFeed && setComposerOpen(false)}
            />

            <View style={styles.composer}>
              <View style={styles.composerHeader}>
                <Text style={styles.composerTitle}>Share to your feed</Text>

                <Pressable
                  onPress={() => setComposerOpen(false)}
                  hitSlop={10}
                  disabled={sharingToFeed}
                  accessibilityLabel="Close">
                  <Ionicons name="close" size={22} color="#191922" />
                </Pressable>
              </View>

              <TextInput
                value={caption}
                onChangeText={setCaption}
                placeholder="Say something about this… (optional)"
                placeholderTextColor="#9C9CAA"
                style={styles.composerInput}
                multiline
                maxLength={2200}
                autoFocus
              />

              {post?.content ? (
                <Text style={styles.composerPreview} numberOfLines={2}>
                  {post.content}
                </Text>
              ) : null}

              <View style={styles.composerButtons}>
                <Pressable
                  style={[styles.composerButton, styles.composerCancel]}
                  onPress={() => setComposerOpen(false)}
                  disabled={sharingToFeed}>
                  <Text style={styles.composerCancelText}>Cancel</Text>
                </Pressable>

                <Pressable
                  style={[styles.composerButton, styles.composerShare]}
                  onPress={shareToFeed}
                  disabled={sharingToFeed}>
                  {sharingToFeed ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.composerShareText}>Share</Text>
                  )}
                </Pressable>
              </View>
            </View>
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  composerLayer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
  },

  composer: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 28,
    width: "100%",
    maxWidth: 640,
    alignSelf: "center",
  },

  composerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },

  composerTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#191922",
  },

  composerInput: {
    minHeight: 90,
    maxHeight: 180,
    padding: 12,
    borderRadius: 14,
    backgroundColor: "#F5F3F8",
    fontSize: 15,
    color: "#191922",
    textAlignVertical: "top",
  },

  composerPreview: {
    marginTop: 10,
    paddingLeft: 10,
    borderLeftWidth: 3,
    borderLeftColor: "#C5399A",
    fontSize: 13,
    color: "#6B6B72",
  },

  composerButtons: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
  },

  composerButton: {
    flex: 1,
    height: 46,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },

  composerCancel: {
    backgroundColor: "#F2F2F5",
  },

  composerCancelText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#55555E",
  },

  composerShare: {
    backgroundColor: "#C5399A",
  },

  composerShareText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
  },

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
