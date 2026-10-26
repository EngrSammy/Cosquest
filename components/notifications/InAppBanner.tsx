// ==========================================
// IN-APP BANNER (while the app is open, like Instagram)
// ==========================================
// Slides down from the top with the person's photo, the title and text.
// Tap: opens it (utils/openFromNotification). Swipe up: dismiss. Hides by
// itself after 4 seconds; banners queue one after another. Messages from
// the chat already on screen don't pop up. Mounted once in app/_layout.tsx.
import { Image } from "expo-image";
import { usePathname } from "expo-router";
import { useEffect, useRef } from "react";
import { Animated, PanResponder, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { themedStyles, useThemedStyles } from "@/constants/chatTheme";
import { FONTS } from "@/constants/fonts";
import { getAvatarSource } from "@/utils/callHelpers";
import { openFromNotification } from "@/utils/openFromNotification";

import { dismissBanner, useCurrentBanner } from "./bannerStore";

const SHOW_MS = 4000;

export default function InAppBanner() {
  const styles = useThemedStyles(STYLE_PAIR);
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const banner = useCurrentBanner();
  const y = useRef(new Animated.Value(-200)).current;

  const hide = (id: string) =>
    Animated.timing(y, { toValue: -200, duration: 200, useNativeDriver: true }).start(() => dismissBanner(id));

  useEffect(() => {
    if (!banner) return;
    // A message from the chat that's already open: no pop-up.
    if (banner.data?.chatId && pathname === `/chat/${banner.data.chatId}` && banner.data?.type === "message") {
      dismissBanner(banner.id);
      return;
    }
    y.setValue(-200);
    Animated.spring(y, { toValue: 0, useNativeDriver: true, friction: 8, tension: 60 }).start();
    const timer = setTimeout(() => hide(banner.id), SHOW_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [banner?.id]);

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => g.dy < -6,
      onPanResponderMove: (_e, g) => {
        if (g.dy < 0) y.setValue(g.dy);
      },
      onPanResponderRelease: (_e, g) => {
        const current = currentId.current;
        if (g.dy < -30 && current) hide(current);
        else Animated.spring(y, { toValue: 0, useNativeDriver: true }).start();
      },
    }),
  ).current;
  const currentId = useRef<string | null>(null);
  currentId.current = banner?.id || null;

  if (!banner) return null;

  const name = banner.actor?.name || banner.actor?.username || null;
  const title = banner.title || name;

  return (
    <View pointerEvents="box-none" style={[styles.layer, { top: insets.top + 8 }]}>
      <Animated.View style={[styles.wrap, { transform: [{ translateY: y }] }]} {...pan.panHandlers}>
        <Pressable
          style={styles.card}
          onPress={() => {
            hide(banner.id);
            openFromNotification(banner.data, banner.actor);
          }}
          accessibilityRole="button"
          accessibilityLabel={`${title ? `${title}: ` : ""}${banner.body}`}>
          {banner.actor ? (
            <Image source={getAvatarSource(banner.actor as any) as any} style={styles.avatar} contentFit="cover" />
          ) : (
            <View style={[styles.avatar, styles.logo]}>
              <Text style={styles.logoText}>CQ</Text>
            </View>
          )}
          <View style={styles.text}>
            {title ? (
              <Text style={styles.title} numberOfLines={1}>
                {title}
              </Text>
            ) : null}
            <Text style={styles.body} numberOfLines={2}>
              {banner.body}
            </Text>
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const STYLE_PAIR = themedStyles(
  {
    layer: { position: "absolute", left: 0, right: 0, zIndex: 3000, elevation: 3000, alignItems: "center", paddingHorizontal: 12 },
    wrap: { width: "100%", maxWidth: 520 },
    card: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      padding: 12,
      borderRadius: 18,
      backgroundColor: "#FFFFFF",
      shadowColor: "#000000",
      shadowOpacity: 0.16,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 6 },
      elevation: 12,
    },
    avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: "#EEE" },
    logo: { alignItems: "center", justifyContent: "center", backgroundColor: "#F7E4F0" },
    logoText: { fontFamily: FONTS.bold, fontSize: 13, color: "#C34D9C" },
    text: { flex: 1, minWidth: 0 },
    title: { fontFamily: FONTS.semibold, fontSize: 14.5, color: "#191922" },
    body: { marginTop: 1, fontFamily: FONTS.regular, fontSize: 13.5, lineHeight: 19, color: "#3A3A44" },
  },
  {
    card: { backgroundColor: "#262838" },
    avatar: { backgroundColor: "#343746" },
    logo: { backgroundColor: "rgba(195,77,156,0.22)" },
    logoText: { color: "#F29BD3" },
    title: { color: "#F4F5FA" },
    body: { color: "#D9DCE6" },
  },
);
