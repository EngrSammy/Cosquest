import { AppBackground } from "@/components/AppBackground";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import {
      Alert,
      Pressable,
      ScrollView,
      StyleSheet,
      Text,
      View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type SupportRowProps = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description?: string;
  onPress: () => void;
};

function SupportRow({ icon, title, description, onPress }: SupportRowProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.supportRow, pressed && styles.pressed]}>
      <View style={styles.rowIcon}>
        <Ionicons name={icon} size={17} color="#C5399A" />
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

function SectionLabel({ children }: { children: string }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
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
    <AppBackground variant="blueGradient">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scroll,
          {
            paddingTop: insets.top + 8,
            paddingBottom: insets.bottom + 40,
          },
        ]}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            style={styles.backButton}>
            <Ionicons name="arrow-back" size={23} color="#191922" />
          </Pressable>

          <View style={styles.headerCenter}>
            <View style={styles.headerIcon}>
              <Ionicons name="help-circle-outline" size={16} color="#C5399A" />
            </View>

            <Text style={styles.headerTitle}>Help & Support</Text>
          </View>

          <View style={styles.headerSpacer} />
        </View>

        {/* SUPPORT CENTER */}
        <SectionLabel>SUPPORT CENTER</SectionLabel>

        <SupportRow
          icon="help-circle"
          title="FAQ / Knowledge Base"
          description="Read guides & helpful answers"
          onPress={() => handleComingSoon("FAQ / Knowledge Base")}
        />

        <SupportRow
          icon="chatbubble-ellipses"
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

        {/* LEGAL */}
        <SectionLabel>LEGAL</SectionLabel>

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

        {/* APP VERSION */}
        <View style={styles.versionContainer}>
          <Text style={styles.appName}>CosQuest App</Text>

          <Text style={styles.versionText}>v2.4.0 (Build 512)</Text>
        </View>
      </ScrollView>
    </AppBackground>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: 18,
  },

  header: {
    height: 50,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 22,
  },

  backButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },

  headerCenter: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },

  headerIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F0F0F2",
    marginRight: 8,
  },

  headerTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#191922",
  },

  headerSpacer: {
    width: 36,
  },

  sectionLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#8D8D98",
    letterSpacing: 0.5,
    marginBottom: 9,
    marginTop: 14,
    marginLeft: 2,
  },

  supportRow: {
    minHeight: 61,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 11,
    paddingVertical: 10,
    marginBottom: 8,
    borderRadius: 12,

    backgroundColor: "rgba(255,255,255,0.48)",

    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.36)",

    shadowColor: "#8EB4C8",
    shadowOpacity: 0.13,
    shadowRadius: 7,
    shadowOffset: {
      width: 0,
      height: 4,
    },

    elevation: 3,
  },

  rowIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 11,
    backgroundColor: "#FBEAF5",
  },

  rowText: {
    flex: 1,
  },

  rowTitle: {
    fontSize: 12,
    color: "#777780",
    marginBottom: 3,
  },

  rowDescription: {
    fontSize: 13.5,
    fontWeight: "700",
    color: "#202029",
    lineHeight: 18,
  },

  versionContainer: {
    alignItems: "center",
    marginTop: 48,
  },

  appName: {
    fontSize: 13,
    fontWeight: "700",
    color: "#202029",
  },

  versionText: {
    fontSize: 10.5,
    color: "#9696A0",
    marginTop: 4,
  },

  pressed: {
    opacity: 0.72,
    transform: [{ scale: 0.995 }],
  },
});
