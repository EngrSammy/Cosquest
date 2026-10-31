import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { FONTS } from "@/constants/fonts";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { Tabs } from "expo-router";
import { SparksSetupPrompt } from "@/components/sparks/SparksSetupPrompt";
import { useIsDesktop } from "@/hooks/useDesktop";
import { ReactNode } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { themedStyles, useInk, useThemedStyles } from "@/constants/chatTheme";

// Open tab: pink in both themes. The rest: grey on the light bar, white on
// the dark one.
const ACTIVE = "#DC179F";
const ACTIVE_LIGHT = "#B63D91";
const INACTIVE_LIGHT = "#9A9AA8";
const INACTIVE_DARK = "#FFFFFF";

// The bar itself: very see-through frosted glass, light or dark. iOS and
// the website blur what's behind it, so the tint can be thin; Android
// only gets the tint (a real blur there needs every screen wrapped in a
// BlurTargetView), so it keeps a bit more of it for the icons to read.
const ANDROID = Platform.OS === "android";
const BAR_LIGHT = ANDROID
  ? (["rgba(255,255,255,0.32)", "rgba(240,242,248,0.26)"] as const)
  : (["rgba(255,255,255,0.10)", "rgba(240,242,248,0.05)"] as const);
const BAR_DARK = ANDROID
  ? (["rgba(30,28,36,0.38)", "rgba(30,28,36,0.30)"] as const)
  : (["rgba(30,28,36,0.14)", "rgba(30,28,36,0.08)"] as const);

// Figma: the open tab gets a short pink line above its icon.
function TabIcon({
  focused,
  children,
}: {
  focused: boolean;
  children: ReactNode;
}) {
  const styles = useThemedStyles(STYLE_PAIR);
  return (
    <View style={styles.iconWrap}>
      {focused ? <View style={styles.activeLine} /> : null}
      {children}
    </View>
  );
}

export default function TabLayout() {
  // Computer: the left rail replaces the bottom tab bar.
  const desktop = useIsDesktop();
  const styles = useThemedStyles(STYLE_PAIR);
  const { dark } = useInk();
  return (
    <>
    <SparksSetupPrompt />
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: dark ? ACTIVE : ACTIVE_LIGHT,
        tabBarInactiveTintColor: dark ? INACTIVE_DARK : INACTIVE_LIGHT,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarLabelStyle: styles.label,
        tabBarStyle: desktop ? { display: "none" } : {
          position: "absolute",
          marginHorizontal: 16,
          bottom: 24,
          height: 68,
          paddingTop: 8,
          borderTopWidth: 0,
          backgroundColor: "transparent",
          elevation: 0,
        },
        // A see-through bar: light frosted in light mode, darker grey glass
        // in dark mode.
        tabBarBackground: () => (
          <View style={styles.barShadow}>
            <BlurView intensity={dark ? 40 : 45} tint={dark ? "dark" : "light"} style={styles.barClip}>
              <LinearGradient colors={dark ? BAR_DARK : BAR_LIGHT} style={StyleSheet.absoluteFill} />
            </BlurView>
            <View pointerEvents="none" style={styles.barOutline} />
          </View>
        ),
      }}>
      <Tabs.Screen
        name="home"
        options={{
          title: "Cosquest",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon focused={focused}>
              <IconSymbol size={26} name="mappin.and.ellipse" color={color} />
            </TabIcon>
          ),
        }}
      />
      <Tabs.Screen
        name="live"
        options={{
          title: "Live",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon focused={focused}>
              <IconSymbol
                size={26}
                name="dot.radiowaves.left.and.right"
                color={color}
              />
            </TabIcon>
          ),
        }}
      />
      <Tabs.Screen
        name="community"
        options={{
          title: "Community",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon focused={focused}>
              {/* Figma: an outline chat bubble */}
              <Ionicons name="chatbox-outline" size={25} color={color} />
            </TabIcon>
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon focused={focused}>
              <Ionicons name="person-outline" size={24} color={color} />
            </TabIcon>
          ),
        }}
      />
    </Tabs>
    </>
  );
}

const RADIUS = 34;

const STYLE_PAIR = themedStyles({
  barShadow: {
    ...StyleSheet.absoluteFill,
    borderRadius: RADIUS,
    shadowColor: "#24283C",
    shadowOpacity: 0.14,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },

  barClip: {
    ...StyleSheet.absoluteFill,
    borderRadius: RADIUS,
    overflow: "hidden",
  },

  barOutline: {
    ...StyleSheet.absoluteFill,
    borderRadius: RADIUS,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.9)",
  },

  label: {
    fontFamily: FONTS.medium,
    fontSize: 11,
    marginTop: 2,
  },

  iconWrap: {
    alignItems: "center",
    justifyContent: "center",
  },

  // The short pink line above the open tab's icon.
  activeLine: {
    position: "absolute",
    top: -12,
    width: 26,
    height: 3,
    borderRadius: 2,
    backgroundColor: ACTIVE_LIGHT,
  },
}, {
  // Dark mode: the bar as before (deeper shadow, faint edge, brighter pink).
  barShadow: { shadowColor: "#000", shadowOpacity: 0.22 },
  barOutline: { borderColor: "rgba(255,255,255,0.35)" },
  activeLine: { backgroundColor: ACTIVE },
});
