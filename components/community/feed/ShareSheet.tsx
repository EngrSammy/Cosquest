import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { useCallback, useEffect, useState } from "react";
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

import { ShareAction } from "./ShareAction";
import { SharePerson } from "./SharePerson";

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

  const currentUsername =
    authUser?.profile?.username || authUser?.username || "";

  const [searchText, setSearchText] = useState("");
  const [people, setPeople] = useState<any[]>([]);
  const [loadingPeople, setLoadingPeople] = useState(false);
  const [sendingUsername, setSendingUsername] = useState<string | null>(null);
  const [sent, setSent] = useState<Record<string, boolean>>({});

  const postLink = `cosquest://post/${post.id}`;

  const loadSuggestions = useCallback(async () => {
    if (!currentUsername) {
      setPeople([]);
      return;
    }

    setLoadingPeople(true);

    try {
      const result = await getSuggestedPeople(token, currentUsername);

      setPeople(result?.users?.slice(0, 6) || []);
    } catch {
      setPeople([]);
    } finally {
      setLoadingPeople(false);
    }
  }, [token, currentUsername]);

  useEffect(() => {
    if (!visible) {
      return;
    }

    setSearchText("");
    setSent({});
    loadSuggestions();
  }, [visible, loadSuggestions]);

  useEffect(() => {
    const query = searchText.trim();

    if (!visible || !query) {
      return;
    }

    const timer = setTimeout(async () => {
      setLoadingPeople(true);

      try {
        const result = await searchPeople(token, query);

        setPeople(result?.users || []);
      } catch {
        setPeople([]);
      } finally {
        setLoadingPeople(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchText, visible, token]);

  const shareWithPerson = async (person: any) => {
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

      await sendSharedPostMessage(
        token,
        conversationId,
        `Check out this post on CosQuest:\n${postLink}`,
      );

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

  const whatsapp = async () => {
    const message = `Check out this post on CosQuest:\n${postLink}`;

    const url = `whatsapp://send?text=${encodeURIComponent(message)}`;

    try {
      const supported = await Linking.canOpenURL(url);

      if (!supported) {
        Alert.alert("WhatsApp", "WhatsApp is not available.");
        return;
      }

      await Linking.openURL(url);
    } catch {
      Alert.alert("WhatsApp", "Unable to open WhatsApp.");
    }
  };

  const nativeShare = async () => {
    try {
      await NativeShare.share({
        title: "Share CosQuest post",
        message: `Check out this post on CosQuest:\n${postLink}`,
      });
    } catch {
      // User cancelled the share dialog.
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
                    : "No suggested friends yet"}
                </Text>
              </View>
            ) : (
              <View style={styles.peopleGrid}>
                {people.slice(0, 6).map((person) => (
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
    ...StyleSheet.absoluteFillObject,
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
    justifyContent: "space-between",
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
  },

  noPeopleText: {
    marginTop: 8,
    fontSize: 13,
    color: "#8B8B93",
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
