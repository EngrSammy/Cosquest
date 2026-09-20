import { AVATARS } from "@/constants/avatars";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  fetchFollowers,
  fetchFollowing,
  followUserThunk,
  unfollowUserThunk,
} from "@/store/thunks/followThunks";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type User = {
  id: string;
  username: string;
  name: string;
  avatarKey?: string | null;
  avatarPhotoUrl?: string | null;
  faction?: string | null;
};

function getAvatarSource(item: User) {
  if (item.avatarPhotoUrl) {
    return {
      uri: item.avatarPhotoUrl,
    };
  }

  const preset = AVATARS.find((avatar) => avatar.id === item.avatarKey);

  if (preset?.source) {
    return preset.source;
  }

  return require("@/assets/images/dp-avatar.png");
}

function FollowerRow({
  item,
  following,
  onToggle,
  disabled,
}: {
  item: User;
  following: boolean;
  onToggle: () => void;
  disabled: boolean;
}) {
  return (
    <View style={styles.row}>
      <Image
        source={getAvatarSource(item)}
        style={styles.avatar}
        contentFit="cover"
      />

      <View style={styles.rowText}>
        <Text style={styles.name} numberOfLines={1}>
          {item.name || item.username}
        </Text>

        <Text style={styles.handle} numberOfLines={1}>
          @{item.username}
        </Text>
      </View>

      <Pressable
        disabled={disabled}
        style={[
          styles.followBtn,
          following ? styles.followingBtn : styles.followBtnActive,
          disabled && styles.disabledButton,
        ]}
        onPress={onToggle}>
        <Text style={following ? styles.followingText : styles.followBackText}>
          {following ? "Following" : "Follow"}
        </Text>
      </Pressable>
    </View>
  );
}

export default function Followers() {
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();

  const authUser = useAppSelector((state) => state.auth.user);

  const user = useAppSelector((state) => state.user.user);

  const token = useAppSelector((state) => state.auth.token);

  const followers = useAppSelector((state) => state.follow.followers);

  const following = useAppSelector((state) => state.follow.following);

  const loading = useAppSelector((state) => state.follow.loading);

  const error = useAppSelector((state) => state.follow.error);

  const currentUsername =
    user?.profile?.username ||
    user?.username ||
    authUser?.profile?.username ||
    "";

  const [query, setQuery] = useState("");

  const [processingUsername, setProcessingUsername] = useState<string | null>(
    null,
  );

  const searchRef = useRef<TextInput>(null);

  useEffect(() => {
    if (!currentUsername || !token) {
      return;
    }

    const timer = setTimeout(() => {
      dispatch(
        fetchFollowers({
          username: currentUsername,
          token,
          search: query,
        }),
      );

      dispatch(
        fetchFollowing({
          username: currentUsername,
          token,
        }),
      );
    }, 300);

    return () => clearTimeout(timer);
  }, [dispatch, currentUsername, token, query]);

  const followingUsernames = useMemo(
    () => new Set(following.map((person) => person.username.toLowerCase())),
    [following],
  );

  async function handleToggle(person: User) {
    if (!token) {
      Alert.alert("Session Expired", "Please sign in again.");

      return;
    }

    const isFollowing = followingUsernames.has(person.username.toLowerCase());

    setProcessingUsername(person.username);

    try {
      const result = isFollowing
        ? await dispatch(
            unfollowUserThunk({
              username: person.username,
              token,
            }),
          ).unwrap()
        : await dispatch(
            followUserThunk({
              username: person.username,
              token,
            }),
          ).unwrap();

      await dispatch(
        fetchFollowing({
          username: currentUsername,
          token,
        }),
      ).unwrap();
    } catch (error) {
      Alert.alert(
        "Unable to Update",
        error instanceof Error
          ? error.message
          : "Could not update follow status.",
      );
    } finally {
      setProcessingUsername(null);
    }
  }

  return (
    <View
      style={[
        styles.screen,
        {
          paddingTop: insets.top + 8,
        },
      ]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={24} color="#191922" />
        </Pressable>

        <Text style={styles.headerTitle}>Followers</Text>

        <Pressable onPress={() => searchRef.current?.focus()} hitSlop={10}>
          <Ionicons name="search" size={22} color="#191922" />
        </Pressable>
      </View>

      <View style={styles.searchRow}>
        <Ionicons name="search" size={18} color="#9C9CAA" />

        <TextInput
          ref={searchRef}
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Search followers..."
          placeholderTextColor="#9C9CAA"
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      {loading && followers.length === 0 ? (
        <View style={styles.loading}>
          <ActivityIndicator size="small" color="#C5399A" />

          <Text style={styles.loadingText}>Loading followers...</Text>
        </View>
      ) : null}

      {error && followers.length === 0 ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>

          <Pressable
            onPress={() => {
              if (currentUsername && token) {
                dispatch(
                  fetchFollowers({
                    username: currentUsername,
                    token,
                    search: query,
                  }),
                );

                dispatch(
                  fetchFollowing({
                    username: currentUsername,
                    token,
                  }),
                );
              }
            }}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : null}

      {!loading || followers.length > 0 ? (
        <FlatList
          data={followers}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const isFollowing = followingUsernames.has(
              item.username.toLowerCase(),
            );

            return (
              <FollowerRow
                item={item}
                following={isFollowing}
                onToggle={() => handleToggle(item)}
                disabled={processingUsername === item.username}
              />
            );
          }}
          contentContainerStyle={{
            paddingBottom: insets.bottom + 24,
          }}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <Text style={styles.empty}>
              {query.trim()
                ? `No followers match “${query}”.`
                : "You don't have any followers yet."}
            </Text>
          }
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "transparent",
    paddingHorizontal: 20,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },

  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#191922",
  },

  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(195, 77, 156, 0.14)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
  },

  searchInput: {
    flex: 1,
    fontSize: 14,
    color: "#191922",
    padding: 0,
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderWidth: 1.5,
    borderRadius: 15,
    borderColor: "rgba(255,255,255,0.25)",
    marginBottom: 12,
  },

  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#EEE",
  },

  rowText: {
    flex: 1,
  },

  name: {
    fontSize: 15,
    fontWeight: "600",
    color: "#191922",
  },

  handle: {
    fontSize: 13,
    color: "#9C9CAA",
    marginTop: 1,
  },

  followBtn: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 10,
    minWidth: 96,
    alignItems: "center",
  },

  followBtnActive: {
    backgroundColor: "#C5399A",
  },

  followingBtn: {
    backgroundColor: "#191922",
  },

  followBackText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#FFFFFF",
  },

  followingText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#FFFFFF",
  },

  disabledButton: {
    opacity: 0.55,
  },

  loading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 30,
  },

  loadingText: {
    fontSize: 12,
    color: "#79797E",
  },

  errorBox: {
    alignItems: "center",
    padding: 14,
    marginTop: 15,
    borderRadius: 12,
    backgroundColor: "rgba(255,80,80,0.08)",
  },

  errorText: {
    fontSize: 12,
    color: "#B42318",
    textAlign: "center",
  },

  retryText: {
    marginTop: 7,
    fontSize: 13,
    fontWeight: "700",
    color: "#C5399A",
  },

  empty: {
    textAlign: "center",
    color: "#9C9CAA",
    marginTop: 40,
    fontSize: 13,
  },
});
