import { AppBackground } from "@/components/AppBackground";
import { Chats } from "@/components/community/Chats";
import { Feeds } from "@/components/community/Feeds";
import { Spotlight } from "@/components/community/Spotlight";
import { AVATARS } from "@/constants/avatars";
import { FONTS } from "@/constants/fonts";
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
            // Figma: the header starts 52 from the top (status bar area).
            // On the website there's no status bar, so use 52 there too.
            paddingTop: Math.max(insets.top, 52),
          },
        ]}
        showsVerticalScrollIndicator={false}>
        {/* Keeps everything a comfortable width on big computer screens.
            Full width on phones. */}
        <View style={styles.column}>
          {/* HEADER - avatar in a soft pink circle, title, pink bell */}
          <View style={[styles.header, styles.padded]}>
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

            <Pressable
              onPress={() => router.push("/notifications")}
              hitSlop={10}>
              <Ionicons name="notifications" size={28} color="#C5399A" />
            </Pressable>
          </View>

          {/* LOADING */}
          {loading && !user ? (
            <View style={styles.loading}>
              <ActivityIndicator size="small" color="#C5399A" />
            </View>
          ) : null}

          {/* COMMUNITY TABS - the open one is filled pink, the others are
              raised white pills with a soft shadow (Figma) */}
          <View style={styles.tabs}>
            {TABS.map((key) => {
              const active = tab === key;

              return (
                <Pressable
                  key={key}
                  style={[
                    styles.tab,
                    active ? styles.tabActive : styles.tabInactive,
                  ]}
                  hitSlop={6}
                  onPress={() => setTab(key)}>
                  <Text
                    style={[styles.tabText, active && styles.tabTextActive]}>
                    {key}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* CONTENT - the feed is full width; chats and spotlight keep
              their side padding. */}
          {tab === "Feeds" ? (
            <Feeds />
          ) : tab === "Chats" ? (
            <View style={styles.padded}>
              <Chats />
            </View>
          ) : (
            <View style={styles.padded}>
              <Spotlight />
            </View>
          )}
        </View>
      </ScrollView>
    </AppBackground>
  );
}

const PINK = "#C34D9C";

const styles = StyleSheet.create({
  scroll: {
    paddingBottom: 140,
  },

  column: {
    width: "100%",
    maxWidth: 640,
    alignSelf: "center",
  },

  padded: {
    paddingHorizontal: 24,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: 56,
    marginBottom: 14,
  },

  headerTitle: {
    fontFamily: FONTS.semibold,
    fontSize: 22,
    color: "#000000",
  },

  // Figma: a bigger avatar on a soft pink circle.
  avatarWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    overflow: "hidden",
    backgroundColor: "rgba(195,77,156,0.22)",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.9)",

    shadowColor: PINK,
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },

  profileImg: {
    width: "100%",
    height: "100%",
  },

  loading: {
    alignItems: "center",
    marginBottom: 6,
  },

  // Three pills spread across the width (Feeds left, Chats middle,
  // Spotlight right).
  tabs: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    alignSelf: "center",
    width: "100%",
    maxWidth: 420,
    paddingHorizontal: 28,
    marginBottom: 26,
  },

  tab: {
    minWidth: 82,
    height: 26,
    paddingHorizontal: 18,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },

  tabActive: {
    backgroundColor: PINK,

    shadowColor: PINK,
    shadowOpacity: 0.35,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },

  // Raised white pill.
  tabInactive: {
    backgroundColor: "rgba(255,255,255,0.92)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",

    shadowColor: "#000000",
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },

  tabText: {
    fontFamily: FONTS.medium,
    fontSize: 15,
    color: "#4B4B53",
    // Poppins sits a little high in its box; this centres it.
    lineHeight: 20,
  },

  tabTextActive: {
    fontFamily: FONTS.semibold,
    color: "#FFFFFF",
  },
});
