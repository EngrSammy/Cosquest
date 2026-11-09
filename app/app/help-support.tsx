import { FONTS } from "@/constants/fonts";
import { appConfig } from "@/services/appConfig";
import { safeBack } from "@/utils/safeBack";
import * as Application from "expo-application";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { C } from "@/theme/tokens";
import { DARK_SCREEN_GRADIENT, themedStyles, useInk, useThemedStyles } from "@/constants/chatTheme";

const PINK = C.brandSoft;

// Figma row: milky card, pink icon on a soft pink chip, a small grey title
// and (for the support rows) a bold line underneath.
function SupportRow({
  icon,
  title,
  description,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description?: string;
  onPress: () => void;
}) {
  const styles = useThemedStyles(STYLE_PAIR);
  const ink = useInk();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={title}>
      <View style={styles.rowIcon}>
        <Ionicons name={icon} size={15} color={ink.text(PINK)} />
      </View>

      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{title}</Text>

        {description ? (
          <Text style={styles.rowDescription}>{description}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

export default function HelpSupport() {
  const styles = useThemedStyles(STYLE_PAIR);
  const ink = useInk();
  const insets = useSafeAreaInsets();

  // Task 059: every row works (the FAQ shows once it has a URL).
  const open = (path: string) => router.push(path as any);

  return (
    <View style={styles.screen}>
      {/* Figma: linear-gradient(180deg, #FFFFFF 0%, #E1F3FF 64.42%) */}
      <LinearGradient
        colors={ink.dark ? [...DARK_SCREEN_GRADIENT] : ["#FFFFFF", "#E1F3FF"]}
        locations={[0, 0.6442]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scroll,
          {
            paddingTop: insets.top + 10,
            paddingBottom: insets.bottom + 40,
          },
        ]}>
        {/* HEADER: back arrow, then the Figma question chip + title */}
        <View style={styles.header}>
          <Pressable
            onPress={() => safeBack("/settings")}
            hitSlop={10}
            style={styles.backButton}
            accessibilityRole="button"
            accessibilityLabel="Back">
            <Ionicons name="arrow-back" size={24} color={ink.text("#191922")} />
          </Pressable>

          <View style={styles.headerCenter}>
            <View style={styles.headerIcon}>
              <Ionicons name="help-circle-outline" size={17} color={ink.text(PINK)} />
            </View>

            <Text style={styles.headerTitle}>Help & Support</Text>
          </View>

          <View style={styles.backButton} />
        </View>

        {/* SUPPORT CENTER */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>SUPPORT CENTER</Text>

          {appConfig.faqUrl ? (
            <SupportRow
              icon="book-outline"
              title="FAQ / Knowledge Base"
              description="Read guides & helpful answers"
              onPress={() => open("/legal/faq")}
            />
          ) : null}

          <SupportRow
            icon="chatbubble-ellipses-outline"
            title="Contact Support"
            description="Chat with our customer team"
            onPress={() => open("/support?type=support")}
          />

          <SupportRow
            icon="bug-outline"
            title="Report a Bug"
            description="Help us improve your experience"
            onPress={() => open("/support?type=bug")}
          />
        </View>

        {/* LEGAL */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>LEGAL</Text>

          <SupportRow
            icon="document-text-outline"
            title="Terms of Service"
            onPress={() => open("/legal/terms")}
          />

          <SupportRow
            icon="shield-checkmark-outline"
            title="Privacy Policy"
            onPress={() => open("/legal/privacy")}
          />

          <SupportRow
            icon="people-outline"
            title="Community Guidelines"
            onPress={() => open("/legal/guidelines")}
          />
        </View>

        {/* APP VERSION */}
        <View style={styles.versionContainer}>
          <Text style={styles.appName}>CosQuest</Text>

          <Text style={styles.versionText}>
            v{appConfig.appVersion}
            {Application.nativeBuildVersion ? ` (Build ${Application.nativeBuildVersion})` : ""}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const STYLE_PAIR = themedStyles({
  screen: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },

  scroll: {
    paddingHorizontal: 20,
    width: "100%",
    maxWidth: 640,
    alignSelf: "center",
  },

  header: {
    height: 50,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },

  backButton: {
    width: 36,
    height: 36,
    alignItems: "flex-start",
    justifyContent: "center",
  },

  headerCenter: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },

  // Figma: 35 x 36, radius 100, padding 8, background #0000000A
  headerIcon: {
    width: 35,
    height: 36,
    borderRadius: 100,
    padding: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0000000A",
  },

  headerTitle: {
    fontFamily: FONTS.semibold,
    fontSize: 17,
    color: C.ink,
  },

  section: {
    paddingTop: 18,
    gap: 12,
  },

  sectionLabel: {
    fontFamily: FONTS.medium,
    fontSize: 11,
    letterSpacing: 0.4,
    color: C.grey4,
  },

  // Milky pressed-in row.
  row: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: "#0000000D",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.75)",

    shadowColor: "#000000",
    shadowOpacity: 0.09,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 4 },
    elevation: 0 /* see-through: no Android shadow (grey frame) */,
  },

  // Figma: 34 x 34, radius 100, padding 8, soft pink.
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: 100,
    padding: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(195,77,156,0.12)",
  },

  rowText: {
    flex: 1,
  },

  rowTitle: {
    fontFamily: FONTS.regular,
    fontSize: 13,
    color: "#55555E",
  },

  rowDescription: {
    marginTop: 2,
    fontFamily: FONTS.semibold,
    fontSize: 14.5,
    lineHeight: 20,
    color: C.ink,
  },

  versionContainer: {
    alignItems: "center",
    marginTop: 48,
  },

  appName: {
    fontFamily: FONTS.semibold,
    fontSize: 13.5,
    color: C.ink,
  },

  versionText: {
    marginTop: 3,
    fontFamily: FONTS.regular,
    fontSize: 11,
    color: C.grey2,
  },

  pressed: {
    opacity: 0.75,
  },
});
