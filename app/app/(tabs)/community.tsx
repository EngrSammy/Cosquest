import { AppBackground } from "@/components/AppBackground";
import { Chats } from "@/components/community/Chats";
import { useIsDesktop } from "@/hooks/useDesktop";
import DesktopFeed from "@/components/desktop/DesktopFeed";
import { Feeds } from "@/components/community/Feeds";
import { setHubView } from "@/components/community/ChatHub";
import { AVATARS } from "@/constants/avatars";
import { FONTS } from "@/constants/fonts";
import { useChatScheme } from "@/constants/chatTheme";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { fetchCurrentUser } from "@/store/thunks/userThunks";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router, useLocalSearchParams, useScrollToTop } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { tabBarSpace } from "@/constants/tabBar";
import { C } from "@/theme/tokens";

type Tab = "Feeds" | "Chats" | "Community";

const TABS: Tab[] = ["Feeds", "Chats", "Community"];

export default function Community() {
  const insets = useSafeAreaInsets();
  const chatScheme = useChatScheme();
  const isDark = chatScheme === "dark";
  const styles = useMemo(() => createCommunityStyles(isDark), [isDark]);
  // Under 360 points wide (the largest display size makes a phone about 320)
  // the three pills don't fit the Figma padding; tighter padding there only.
  const narrow = useWindowDimensions().width < 360;
  const dispatch = useAppDispatch();

  const [tab, setTab] = useState<Tab>("Feeds");
  // /community?tab=Chats opens on that pill (the Live tab's "Go to your chats").
  const { tab: tabParam } = useLocalSearchParams<{ tab?: string }>();
  useEffect(() => {
    if (tabParam === "Feeds" || tabParam === "Chats" || tabParam === "Community") setTab(tabParam);
  }, [tabParam]);
  // Computer: the top bar has the avatar and bell, and Chats has its own
  // workspace (D1: list | chat | Sparks).
  const desktop = useIsDesktop();

  // Task 059: tapping the Community tab again scrolls back to the top (the
  // feed's own list does this itself).
  const scrollRef = useRef<ScrollView>(null);
  useScrollToTop(scrollRef);

  const authUser = useAppSelector((state) => state.auth.user);

  const user = useAppSelector((state) => state.user.user);

  const loading = useAppSelector((state) => state.user.loading);

  const email = authUser?.email || user?.email || "";

  // Wait for the login token (restored a moment after the app opens).
  const sessionToken = useAppSelector((state) => state.auth.token);
  useEffect(() => {
    if (email && sessionToken) {
      dispatch(fetchCurrentUser(email));
    }
  }, [dispatch, email, sessionToken]);

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

  // Figma: the header starts 52 from the top on phones (that includes the
  // status bar). In a browser there's no status bar and the browser has its
  // own top bar, so only a small gap. The bottom leaves room for the
  // floating tab bar above the home indicator.
  const scrollPad = {
    paddingTop: Platform.OS === "web" ? 16 : Math.max(insets.top, 52),
    paddingBottom: tabBarSpace(insets.bottom),
  };

  const top = (
    <>
          {/* HEADER - avatar in a soft pink circle, title, pink bell (phones) */}
          {!desktop ? (
          <View style={[styles.header, styles.padded]}>
            <Pressable
              onPress={() => router.push("/profile")}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Your profile">
              <View style={styles.avatarWrap}>
                <Image
                  source={selectedAvatar}
                  style={styles.profileImg}
                  contentFit="cover"
                />
              </View>
            </Pressable>

            <View style={styles.headerTitleWrap}>
              <Text style={styles.headerTitle}>Community</Text>
              {/* Figma M01 (chat hub) */}
              {tab === "Chats" ? (
                <Text style={styles.headerSubtitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                  Your people. Your next adventure.
                </Text>
              ) : null}
            </View>

            <Pressable
              onPress={() => router.push("/notifications")}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Notifications">
              <Ionicons name="notifications" size={28} color={C.brand} />
            </Pressable>
          </View>
          ) : null}{/* end of the phone header */}

          {/* LOADING */}
          {loading && !user ? (
            <View style={styles.loading}>
              <ActivityIndicator size="small" color={C.brand} />
            </View>
          ) : null}

          {/* COMMUNITY TABS - the open one is filled pink, the others are
              raised white pills with a soft shadow (Figma) */}
          <View style={[styles.tabs, narrow && styles.tabsNarrow]}>
            {TABS.map((key) => {
              const active = tab === key;

              return (
                <Pressable accessibilityRole="tab" accessibilityLabel={key}
                  key={key}
                  style={[
                    styles.tab,
                    narrow && styles.tabNarrow,
                    active ? styles.tabActive : styles.tabInactive,
                  ]}
                  hitSlop={6}
                  onPress={() => {
                    // Computers: Chats and Community open the chat page (the list beside the open chat).
                    if (desktop && key !== "Feeds") {
                      setHubView(key === "Chats" ? "chats" : "community");
                      router.navigate("/chat" as any);
                    } else setTab(key);
                  }}>
                  <Text
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.75}
                    maxFontSizeMultiplier={1.15}
                    style={[styles.tabText, active && styles.tabTextActive]}>
                    {key}
                  </Text>
                </Pressable>
              );
            })}
          </View>
    </>
  );

  const feedScreen = (
    <AppBackground variant="blueGradient">
      {/* The feed is a list of its own (audit B2), the header scrolling with
          it; a comfortable width on big computer screens, full width on
          phones. Chats and Community keep their side padding. */}
      {tab === "Feeds" ? (
        <Feeds header={top} contentContainerStyle={[styles.column, scrollPad]} />
      ) : (
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[styles.scroll, scrollPad]}
          showsVerticalScrollIndicator={false}>
          <View style={styles.column}>
            {top}

            {/* CONTENT */}
            {tab === "Chats" ? (
              <View style={styles.padded}>
                <Chats view="chats" />
              </View>
            ) : (
              <View style={styles.padded}>
                <Chats view="community" />
              </View>
            )}
          </View>
        </ScrollView>
      )}
    </AppBackground>
  );

  if (!desktop) return feedScreen;

  // Computer: the desktop feed (posts in the middle, your chats on the right).
  return <DesktopFeed />;
}

const PINK = C.brandSoft;

function createCommunityStyles(isDark: boolean) { return StyleSheet.create({
  // The bottom padding (room for the tab bar) comes from the safe area.
  scroll: {},

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
    color: isDark ? "#F5F5FA" : "#000000",
  },

  // flexShrink: between the avatar and the bell at the largest sizes.
  headerTitleWrap: { alignItems: "center", flexShrink: 1 },

  headerSubtitle: {
    marginTop: 1,
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: isDark ? "#B6B8C8" : "#66738A",
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
    elevation: 0 /* see-through: no Android shadow (grey frame) */,
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
    // minHeight and flexShrink: at the largest text and display size the
    // three pills no longer fit a 320-point row; they shrink (and their text
    // with them) instead of the last one being cut off.
    minHeight: 26,
    flexShrink: 1,
    paddingHorizontal: 18,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },

  tabsNarrow: { paddingHorizontal: 12 },

  tabNarrow: { minWidth: 0, paddingHorizontal: 10 },

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
    backgroundColor: isDark ? "#292B3A" : "rgba(255,255,255,0.92)",
    borderWidth: 1,
    borderColor: isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.06)",

    shadowColor: "#000000",
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },

  tabText: {
    fontFamily: FONTS.medium,
    fontSize: 15,
    color: isDark ? "#E5E6EF" : "#4B4B53",
    // Poppins sits a little high in its box; this centres it.
    lineHeight: 20,
  },

  tabTextActive: {
    fontFamily: FONTS.semibold,
    color: "#FFFFFF",
  },
}); }
