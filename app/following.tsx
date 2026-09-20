import { AVATARS } from "@/constants/avatars";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { fetchFollowing, unfollowUserThunk } from "@/store/thunks/followThunks";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
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

function FollowingRow({
  item,
  onUnfollow,
  disabled,
}: {
  item: User;
  onUnfollow: () => void;
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
        style={({ pressed }) => [
          styles.unfollowBtn,
          pressed && styles.pressed,
          disabled && styles.disabledButton,
        ]}
        onPress={onUnfollow}>
        <Text style={styles.unfollowText}>Unfollow</Text>
      </Pressable>
    </View>
  );
}

export default function Following() {
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();

  const authUser = useAppSelector((state) => state.auth.user);

  const user = useAppSelector((state) => state.user.user);

  const token = useAppSelector((state) => state.auth.token);

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
        fetchFollowing({
          username: currentUsername,
          token,
          search: query,
        }),
      );
    }, 300);

    return () => clearTimeout(timer);
  }, [dispatch, currentUsername, token, query]);

  async function handleUnfollow(person: User) {
    if (!token) {
      Alert.alert(
        "Session Expired",
        "Please sign in again to manage your following list.",
      );

      return;
    }

    setProcessingUsername(person.username);

    try {
      await dispatch(
        unfollowUserThunk({
          username: person.username,
          token,
        }),
      ).unwrap();
    } catch (error) {
      Alert.alert(
        "Unable to Unfollow",
        error instanceof Error
          ? error.message
          : "Could not unfollow this user.",
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

        <Text style={styles.headerTitle}>Following</Text>

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
          placeholder="Search Following..."
          placeholderTextColor="#9C9CAA"
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      {loading && following.length === 0 ? (
        <View style={styles.loading}>
          <ActivityIndicator size="small" color="#C5399A" />

          <Text style={styles.loadingText}>Loading following...</Text>
        </View>
      ) : null}

      {error && following.length === 0 ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>

          <Pressable
            onPress={() => {
              if (currentUsername && token) {
                dispatch(
                  fetchFollowing({
                    username: currentUsername,
                    token,
                    search: query,
                  }),
                );
              }
            }}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : null}

      {!loading || following.length > 0 ? (
        <FlatList
          data={following}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <FollowingRow
              item={item}
              onUnfollow={() => handleUnfollow(item)}
              disabled={processingUsername === item.username}
            />
          )}
          contentContainerStyle={{
            paddingBottom: insets.bottom + 24,
          }}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <Text style={styles.empty}>
              {query.trim()
                ? `No following match “${query}”.`
                : "You are not following anyone yet."}
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

  unfollowBtn: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 10,
    minWidth: 96,
    alignItems: "center",
    backgroundColor: "#191922",
  },

  unfollowText: {
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

  pressed: {
    opacity: 0.7,
  },
});
