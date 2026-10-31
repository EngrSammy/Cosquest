// ==========================================
// GROUP SPARKS TAB (Chat / Sparks / Calls / Projects)
// ==========================================
// The Sparks page, laid out like Calls and Projects: title, a "Create
// Spark" button, then every Spark in the chat with the All / History
// filter (the same list as the rail's "All Sparks" sheet). Tapping a Spark
// opens it as usual.
import { Image } from "expo-image";
import { Pressable, Text, View } from "react-native";

import { ScreenGradient, UI } from "@/components/chat/ui";
import { themedStyles, useThemedStyles } from "@/constants/chatTheme";
import { FONTS } from "@/constants/fonts";
import type { Spark } from "@/services/sparks";

import { SparksList } from "./SparksRail";

const SPARKLE_WHITE = require("@/assets/images/white-sparkles.png");

export default function SparksTab({
  sparks,
  onOpen,
  onCreate,
}: {
  sparks: Spark[];
  onOpen: (spark: Spark) => void;
  onCreate: () => void;
}) {
  const styles = useThemedStyles(STYLE_PAIR);
  const active = sparks.filter((spark) => spark.active).length;

  return (
    <View style={styles.screen}>
      <ScreenGradient />
      <View style={styles.header}>
        <Text style={styles.title}>Sparks</Text>
        <Text style={styles.subtitle}>
          {sparks.length
            ? `${sparks.length} ${sparks.length === 1 ? "Spark" : "Sparks"}${active ? ` · ${active} active now` : ""}`
            : "The topics your group keeps coming back to."}
        </Text>

        <Pressable style={styles.create} onPress={onCreate} accessibilityRole="button">
          <Image source={SPARKLE_WHITE} style={styles.createIcon} contentFit="contain" />
          <Text style={styles.createText}>Create Spark</Text>
        </Pressable>
      </View>

      <View style={styles.listWrap}>
        <SparksList
          sparks={sparks}
          onOpen={onOpen}
          style={styles.list}
          contentContainerStyle={styles.listContent}
        />
      </View>
    </View>
  );
}

const STYLE_PAIR = themedStyles(
  {
    screen: { flex: 1 },
    header: { paddingHorizontal: 16, paddingTop: 8 },
    title: { fontFamily: FONTS.bold, fontSize: 26, lineHeight: 32, color: UI.INK },
    subtitle: { marginTop: 4, fontFamily: FONTS.regular, fontSize: 14, color: UI.MUTED },
    create: {
      height: 48,
      marginTop: 18,
      marginBottom: 18,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      borderRadius: 24,
      backgroundColor: UI.PINK,
    },
    createIcon: { width: 20, height: 20 },
    createText: { fontFamily: FONTS.semibold, fontSize: 15, color: "#FFFFFF" },
    listWrap: { flex: 1, paddingHorizontal: 16 },
    list: { flex: 1 },
    listContent: { paddingBottom: 40 },
  },
  {
    title: { color: "#F4F5FA" },
    subtitle: { color: "#B5BBCB" },
  },
);
