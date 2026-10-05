import { FONTS } from "@/constants/fonts";
import { safeBack } from "@/utils/safeBack";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const PINK = "#C34D9C";

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
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={title}>
      <View style={styles.rowIcon}>
        <Ionicons name={icon} size={15} color={PINK} />
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
  const insets = useSafeAreaInsets();

  function handleComingSoon(feature: string) {
    Alert.alert(
      "Coming Soon",
      `${feature} will be connected when the required support functionality is available.`,
    );
  }

  return (
    <View style={styles.screen}>
      {/* Figma: linear-gradient(180deg, #FFFFFF 0%, #E1F3FF 64.42%) */}
      <LinearGradient
        colors={["#FFFFFF", "#E1F3FF"]}
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
            <Ionicons name="arrow-back" size={24} color="#191922" />
          </Pressable>

          <View style={styles.headerCenter}>
            <View style={styles.headerIcon}>
              <Ionicons name="help-circle-outline" size={17} color={PINK} />
            </View>

            <Text style={styles.headerTitle}>Help & Support</Text>
          </View>

          <View style={styles.backButton} />
        </View>

        {/* SUPPORT CENTER */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>SUPPORT CENTER</Text>

          <SupportRow
            icon="book-outline"
            title="FAQ / Knowledge Base"
            description="Read guides & helpful answers"
            onPress={() => handleComingSoon("FAQ / Knowledge Base")}
          />

          <SupportRow
            icon="chatbubble-ellipses-outline"
            title="Contact Support"
            description="Chat with our customer team"
            onPress={() => handleComingSoon("Contact Support")}
          />

          <SupportRow
            icon="bug-outline"
            title="Report a Bug"
            description="Help us improve your experience"
            onPress={() => handleComingSoon("Report a Bug")}
          />
        </View>

        {/* LEGAL */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>LEGAL</Text>

          <SupportRow
            icon="document-text-outline"
            title="Terms of Service"
            onPress={() => handleComingSoon("Terms of Service")}
          />

          <SupportRow
            icon="shield-checkmark-outline"
            title="Privacy Policy"
            onPress={() => handleComingSoon("Privacy Policy")}
          />
        </View>

        {/* APP VERSION */}
        <View style={styles.versionContainer}>
          <Text style={styles.appName}>Cosquest App</Text>

          <Text style={styles.versionText}>v2.4.0 (Build 512)</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
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
    color: "#191922",
  },

  section: {
    paddingTop: 18,
    gap: 12,
  },

  sectionLabel: {
    fontFamily: FONTS.medium,
    fontSize: 11,
    letterSpacing: 0.4,
    color: "#7A7A84",
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
    elevation: 2,
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
    color: "#191922",
  },

  versionContainer: {
    alignItems: "center",
    marginTop: 48,
  },

  appName: {
    fontFamily: FONTS.semibold,
    fontSize: 13.5,
    color: "#191922",
  },

  versionText: {
    marginTop: 3,
    fontFamily: FONTS.regular,
    fontSize: 11,
    color: "#8A8A93",
  },

  pressed: {
    opacity: 0.75,
  },
});
