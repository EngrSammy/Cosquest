// ==========================================
// ONBOARDING · COMPUTER
// ==========================================
// One glowing card on a dark navy page (the CosQuest map faintly behind,
// soft pink and blue glows):
//   Left:  a diagonal panel in the CosQuest pink -> blue gradient with a
//          big headline for the current step, a short line, and either
//          LOG IN / SIGN UP buttons or the sign-up steps (✓ done).
//   Right: the step itself on a light blush -> blue background (dark in
//          dark mode). Same screens and logic as on phones.
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router, usePathname } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

import { InAuthFrame } from "@/components/AppBackground";
import { themedStyles, useInk, useThemedStyles } from "@/constants/chatTheme";
import { FONTS } from "@/constants/fonts";

const PINK = "#C34D9C";
const BLUE = "#33BEEF";

// The side panel is the page's own background: the map, washed CosQuest
// pink at the top to light blue at the bottom (stronger than the page, so
// the white text reads).
const PANEL_MAP = true;
const PANEL = ["rgba(220,23,159,0.84)", "rgba(220,23,159,0.78)", "rgba(51,190,239,0.66)"] as const;
const PANEL_STOPS = [0, 0.55, 1] as const;
// The app's own background (AppBackground "gradient"): the map on white,
// washed from clear to CosQuest pink to light blue.
const PAGE = ["rgba(153,28,92,0.01)", "rgba(220,23,159,0.55)", "rgba(51,190,239,0.39)"] as const;
const PAGE_DARK = ["rgba(16,17,22,0.9)", "rgba(80,20,64,0.55)", "rgba(20,60,90,0.5)"] as const;
const FORM = ["#FCF2F9", "#EEF7FE"] as const;
const FORM_DARK = ["#1B1529", "#121A28"] as const;

const AUTH_TABS = [
  { label: "LOG IN", href: "/onboarding/signin", match: ["/onboarding/signin", "/onboarding/oauthSignin", "/onboarding/forgotPassword", "/onboarding/resetPassword"] },
  { label: "SIGN UP", href: "/onboarding/oauthSignup", match: ["/onboarding/signup", "/onboarding/oauthSignup", "/onboarding/oauthGoogle"] },
];

const STEPS = [
  { label: "Verify", match: "/onboarding/verification" },
  { label: "Profile", match: "/onboarding/createProfile" },
  { label: "Photo", match: "/onboarding/uploadPicture" },
  { label: "Faction", match: "/onboarding/faction" },
  { label: "Interests", match: "/onboarding/interests" },
  { label: "Permissions", match: "/onboarding/permissions" },
  { label: "Ready", match: "/onboarding/ready" },
];

const HEADLINES: { match: string; title: string; text: string }[] = [
  { match: "/onboarding/signin", title: "Welcome back!", text: "Sign in and pick up your quests where you left them." },
  { match: "/onboarding/oauthSignin", title: "Welcome back!", text: "Sign in and pick up your quests where you left them." },
  { match: "/onboarding/forgotPassword", title: "Locked out?", text: "Enter your email and we'll help you back in." },
  { match: "/onboarding/resetPassword", title: "New password", text: "Choose something strong you'll remember." },
  { match: "/onboarding/signup", title: "Join the quest!", text: "Create your account in a minute. Your faction is waiting." },
  { match: "/onboarding/oauthSignup", title: "Join the quest!", text: "Create your account in a minute. Your faction is waiting." },
  { match: "/onboarding/verification", title: "Check your inbox", text: "We sent you a code to make sure it's really you." },
  { match: "/onboarding/createProfile", title: "Make it yours", text: "Your name and username are how other players find you." },
  { match: "/onboarding/uploadPicture", title: "Show your look", text: "Add a photo or pick an avatar for your profile." },
  { match: "/onboarding/faction", title: "Pick your side!", text: "Your faction is your crew for quests, chats and points." },
  { match: "/onboarding/interests", title: "What's your vibe?", text: "We'll fill your feed with the right people." },
  { match: "/onboarding/permissions", title: "Almost there", text: "Location and notifications make live quests work." },
  { match: "/onboarding/ready", title: "You're in!", text: "Your faction, your feed and your first quests are ready." },
];

export default function DesktopAuthFrame({ children }: { children: ReactNode }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const ink = useInk();
  const path = usePathname() || "/onboarding";

  const stepIndex = STEPS.findIndex((step) => path.startsWith(step.match));
  const authIndex = AUTH_TABS.findIndex((tab) => tab.match.some((m) => path.startsWith(m)));
  const headline = HEADLINES.find((item) => path.startsWith(item.match)) || {
    title: "Cosplay quests, together",
    text: "Find your faction, meet your people and play the city.",
  };

  return (
    <View style={styles.page}>
      {/* Page: the app's background - the map, then pink -> light blue */}
      <Image source={require("@/assets/images/map-texture.png")} style={styles.map} contentFit="cover" />
      <LinearGradient
        colors={ink.dark ? PAGE_DARK : PAGE}
        locations={[0, 0.62, 0.9]}
        style={styles.fill}
      />

      <View style={styles.card}>
        {/* Right side background (the form) */}
        <LinearGradient
          colors={ink.dark ? FORM_DARK : FORM}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.fill}
        />

        {/* Left: the diagonal pink -> blue panel */}
        <View style={styles.panel}>
          <View style={[styles.fill, { backgroundColor: "#FFFFFF" }]} />
          <Image source={require("@/assets/images/map-texture.png")} style={styles.map} contentFit="cover" />
          <LinearGradient colors={PANEL} locations={PANEL_STOPS} style={styles.fill} />
        </View>

        {/* Left: what's on the panel (not slanted) */}
        <View style={styles.panelContent}>
          <View style={styles.brand}>
            <Image source={require("@/assets/images/cosquest-logo.png")} style={styles.logo} contentFit="contain" />
            <Text style={styles.brandText}>CosQuest</Text>
          </View>

          <View>
            <Text style={styles.title}>{headline.title.toUpperCase()}</Text>
            <Text style={styles.text}>{headline.text}</Text>

            {stepIndex >= 0 ? (
              <View style={styles.steps}>
                {STEPS.map((step, index) => {
                  const done = index < stepIndex;
                  const current = index === stepIndex;
                  return (
                    <View key={step.label} style={styles.step}>
                      <View style={[styles.stepDot, done && styles.stepDotDone, current && styles.stepDotCurrent]}>
                        {done ? <Ionicons name="checkmark" size={12} color={PINK} /> : null}
                      </View>
                      <Text style={[styles.stepText, (done || current) && styles.stepTextOn]}>{step.label}</Text>
                    </View>
                  );
                })}
              </View>
            ) : (
              <View style={styles.switch}>
                {AUTH_TABS.map((tab, index) => {
                  const active = index === authIndex;
                  return (
                    <Pressable
                      key={tab.label}
                      onPress={() => !active && router.replace(tab.href as any)}
                      style={({ hovered }: any) => [
                        styles.switchButton,
                        active && styles.switchButtonOn,
                        !active && hovered && styles.switchButtonHover,
                      ]}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: active }}>
                      <Text style={[styles.switchText, active && styles.switchTextOn]}>{tab.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>

          <Text style={styles.small}>Free core features · CosQuest © {new Date().getFullYear()}</Text>
        </View>

        {/* Right: the step */}
        <View style={styles.form}>
          <InAuthFrame.Provider value={true}>{children}</InAuthFrame.Provider>
        </View>
      </View>
    </View>
  );
}

const STYLE_PAIR = themedStyles(
  {
    fill: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
    page: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28, overflow: "hidden", backgroundColor: "#FFFFFF" },
    map: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: 0.5 },

    card: {
      width: "100%",
      maxWidth: 1080,
      height: "100%",
      borderRadius: 18,
      overflow: "hidden",
      borderWidth: 1.5,
      borderColor: "rgba(195,77,156,0.85)",
      shadowColor: PINK,
      shadowOpacity: 0.35,
      shadowRadius: 36,
      shadowOffset: { width: 0, height: 0 },
    },

    // The slanted panel: wider than its share, skewed, clipped by the card.
    panel: {
      position: "absolute",
      top: 0,
      bottom: 0,
      left: -140,
      right: "52%",
      overflow: "hidden",
      transform: [{ skewX: "-12deg" }],
      borderRightWidth: 2,
      borderRightColor: BLUE,
    },

    panelContent: {
      position: "absolute",
      top: 0,
      bottom: 0,
      left: 0,
      width: "38%",
      paddingHorizontal: 44,
      paddingVertical: 40,
      justifyContent: "space-between",
    },
    brand: { flexDirection: "row", alignItems: "center", gap: 10 },
    logo: { width: 34, height: 34 },
    brandText: { fontFamily: FONTS.bold, fontSize: 22, color: "#FFFFFF" },
    title: { fontFamily: FONTS.extrabold, fontSize: 40, lineHeight: 46, color: "#FFFFFF" },
    text: { marginTop: 10, maxWidth: 320, fontFamily: FONTS.medium, fontSize: 15, lineHeight: 23, color: "rgba(255,255,255,0.9)" },

    switch: { flexDirection: "row", gap: 10, marginTop: 28 },
    switchButton: {
      height: 42,
      paddingHorizontal: 22,
      borderRadius: 21,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1.5,
      borderColor: "rgba(255,255,255,0.7)",
    },
    switchButtonOn: { backgroundColor: "#FFFFFF", borderColor: "#FFFFFF" },
    switchButtonHover: { backgroundColor: "rgba(255,255,255,0.15)" },
    switchText: { fontFamily: FONTS.semibold, fontSize: 13.5, letterSpacing: 0.8, color: "#FFFFFF" },
    switchTextOn: { color: PINK },

    steps: { marginTop: 24, gap: 10 },
    step: { flexDirection: "row", alignItems: "center", gap: 10 },
    stepDot: {
      width: 20,
      height: 20,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1.5,
      borderColor: "rgba(255,255,255,0.55)",
    },
    stepDotDone: { backgroundColor: "#FFFFFF", borderColor: "#FFFFFF" },
    stepDotCurrent: { borderColor: "#FFFFFF", borderWidth: 5 },
    stepText: { fontFamily: FONTS.medium, fontSize: 14, color: "rgba(255,255,255,0.65)" },
    stepTextOn: { color: "#FFFFFF", fontFamily: FONTS.semibold },

    small: { fontFamily: FONTS.regular, fontSize: 12, color: "rgba(36,40,60,0.7)" },

    // The form: right of the slant.
    form: { position: "absolute", top: 0, bottom: 0, right: 0, left: "58%" },
  },
  {
    page: { backgroundColor: "#101116" },
    map: { opacity: 0.18 },
  },
);
