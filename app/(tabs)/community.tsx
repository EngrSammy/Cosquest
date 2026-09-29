import { AppBackground } from "@/components/AppBackground";
import { Chats } from "@/components/community/Chats";
import { Feeds } from "@/components/community/Feeds";
import { Spotlight } from "@/components/community/Spotlight";
import { AVATARS } from "@/constants/avatars";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { fetchCurrentUser } from "@/store/thunks/userThunks";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Tab = "Feeds" | "Chats" | "Spotlight";

const TABS: Tab[] = ["Feeds", "Chats", "Spotlight"];

export default function Community() {
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();

  const [tab, setTab] = useState<Tab>("Feeds");

  const authUser = useAppSelector((state) => state.auth.user);

  const user = useAppSelector((state) => state.user.user);

  const loading = useAppSelector((state) => state.user.loading);

  const email = authUser?.email || user?.email || "";

  useEffect(() => {
    if (email) {
      dispatch(fetchCurrentUser(email));
    }
  }, [dispatch, email]);

  const avatarKey =
    user?.profile?.avatarKey ||
    authUser?.profile?.avatarKey ||
    user?.avatar ||
    "";

  const avatarFromList = AVATARS.find((avatar) => avatar.id === avatarKey);

  const selectedAvatar = useMemo(
    () => avatarFromList?.source || require("@/assets/images/dp-avatar.png"),
    [avatarFromList],
  );

  return (
    <AppBackground variant="blueGradient">
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          {
            paddingTop: insets.top + 8,
          },
        ]}
        showsVerticalScrollIndicator={false}>
        {/* HEADER */}
        <View style={styles.header}>
          <Pressable onPress={() => router.push("/profile")} hitSlop={10}>
            <View style={styles.avatarWrap}>
              <Image
                source={selectedAvatar}
                style={styles.profileImg}
                contentFit="cover"
              />
            </View>
          </Pressable>

          <Text style={styles.headerTitle}>Community</Text>

          <Pressable onPress={() => router.push("/notifications")} hitSlop={10}>
            <Ionicons name="notifications" size={24} color="#C5399A" />
          </Pressable>
        </View>

        {/* LOADING */}
        {loading && !user ? (
          <View style={styles.loading}>
            <ActivityIndicator size="small" color="#C5399A" />
          </View>
        ) : null}

        {/* COMMUNITY TABS */}
        <View style={styles.tabs}>
          {TABS.map((key) => {
            const active = tab === key;

            return (
              <Pressable
                key={key}
                style={styles.tab}
                onPress={() => setTab(key)}>
                <Text style={[styles.tabText, active && styles.tabTextActive]}>
                  {key}
                </Text>

                {active ? <View style={styles.tabIndicator} /> : null}
              </Pressable>
            );
          })}
        </View>

        {/* CONTENT */}
        {tab === "Feeds" ? (
          <Feeds />
        ) : tab === "Chats" ? (
          <Chats />
        ) : (
          <Spotlight />
        )}
      </ScrollView>
    </AppBackground>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: 20,
    paddingBottom: 140,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },

  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#191922",
  },

  avatarWrap: {
    width: 50,
    height: 50,
    borderRadius: 30,
    overflow: "hidden",
    backgroundColor: "rgba(195, 77, 156, 0.2)",
  },

  profileImg: {
    width: "100%",
    height: "100%",
  },

  loading: {
    alignItems: "center",
    marginBottom: 6,
  },

  tabs: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 34,
    height: 40,
    marginBottom: 4,
  },

  tab: {
    minWidth: 65,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },

  tabText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#777780",
  },

  tabTextActive: {
    color: "#191922",
    fontWeight: "700",
  },

  tabIndicator: {
    position: "absolute",
    bottom: 0,
    width: 32,
    height: 3,
    borderRadius: 3,
    backgroundColor: "#C5399A",
  },
});
