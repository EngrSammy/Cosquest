// ==========================================
// EDIT PROFILE · COMPUTER
// ==========================================
// The Edit profile form stays on the left the whole time (so nothing you've
// typed is lost); the right pane shows either
//   - a live preview of how others see you, or
//   - Category / Contact options, opened from their rows in the form.
// Inside the pane, those pages' Done / Save / back close the pane instead of
// leaving the page (PaneClose). Phones keep the separate screens.
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { createContext, type ReactNode } from "react";
import { ImageSourcePropType, ScrollView, Text, View } from "react-native";

import { ScreenGradient } from "@/components/chat/ui";
import { themedStyles, useInk, useThemedStyles } from "@/constants/chatTheme";
import { FONTS } from "@/constants/fonts";

const PINK = "#C34D9C";
const INK = "#1C1E21";
const MUTED = "#65676B";

// Set when a page is shown inside a pane: call it to close the pane.
export const PaneClose = createContext<(() => void) | null>(null);

export default function DesktopEditProfile({
  form,
  pane,
  onClosePane,
  preview,
}: {
  form: ReactNode;
  pane: ReactNode | null;
  onClosePane: () => void;
  preview: {
    name: string;
    username: string;
    bio: string;
    category?: string;
    contact?: string;
    avatar: ImageSourcePropType;
  };
}) {
  const styles = useThemedStyles(STYLE_PAIR);
  const ink = useInk();

  return (
    <View style={styles.split}>
      <View style={styles.form}>{form}</View>

      <View style={styles.pane}>
        {pane ? (
          <PaneClose.Provider value={onClosePane}>{pane}</PaneClose.Provider>
        ) : (
          <>
            <ScreenGradient />
            <ScrollView contentContainerStyle={styles.previewScroll}>
              <Text style={styles.previewLabel}>PREVIEW · HOW OTHERS SEE YOU</Text>
              <View style={styles.card}>
                <View style={styles.cover} />
                <View style={styles.avatarRing}>
                  <Image source={preview.avatar} style={styles.avatar} contentFit="cover" />
                </View>
                <Text style={styles.name} numberOfLines={1}>
                  {preview.name || "Your name"}
                </Text>
                <Text style={styles.handle} numberOfLines={1}>
                  @{preview.username || "username"}
                  {preview.category ? ` · ${preview.category}` : ""}
                </Text>
                <Text style={[styles.bio, !preview.bio && styles.bioEmpty]}>
                  {preview.bio || "Add a short bio so people know what you're about."}
                </Text>
                {preview.contact ? (
                  <View style={styles.contactRow}>
                    <Ionicons name="call-outline" size={15} color={ink.text(MUTED)} />
                    <Text style={styles.contact} numberOfLines={1}>
                      {preview.contact}
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.hint}>
                Click Category or Contact options on the left to change them here. Save keeps your name, username and bio.
              </Text>
            </ScrollView>
          </>
        )}
      </View>
    </View>
  );
}

const STYLE_PAIR = themedStyles(
  {
    split: { flex: 1, flexDirection: "row", minHeight: 0 },
    form: { width: 600, minHeight: 0, borderRightWidth: 1, borderRightColor: "rgba(36,40,60,0.08)" },
    pane: { flex: 1, minWidth: 0, minHeight: 0 },

    previewScroll: { padding: 32, alignItems: "center" },
    previewLabel: { width: "100%", maxWidth: 440, fontFamily: FONTS.medium, fontSize: 11.5, letterSpacing: 0.5, color: MUTED, marginBottom: 10 },
    card: {
      width: "100%",
      maxWidth: 440,
      alignItems: "center",
      paddingBottom: 22,
      borderRadius: 14,
      overflow: "hidden",
      backgroundColor: "#FFFFFF",
      shadowColor: "#000000",
      shadowOpacity: 0.08,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
    },
    cover: { alignSelf: "stretch", height: 110, backgroundColor: "#D8A3CE" },
    avatarRing: { width: 104, height: 104, borderRadius: 52, padding: 4, marginTop: -52, backgroundColor: "#FFFFFF" },
    avatar: { width: "100%", height: "100%", borderRadius: 48, backgroundColor: "#E9E1F5" },
    name: { marginTop: 10, fontFamily: FONTS.bold, fontSize: 22, color: INK },
    handle: { marginTop: 2, fontFamily: FONTS.regular, fontSize: 13.5, color: MUTED },
    bio: { marginTop: 12, paddingHorizontal: 26, textAlign: "center", fontFamily: FONTS.regular, fontSize: 14, lineHeight: 20, color: INK },
    bioEmpty: { color: MUTED, fontStyle: "italic" },
    contactRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 12 },
    contact: { maxWidth: 340, fontFamily: FONTS.regular, fontSize: 13, color: MUTED },
    hint: { marginTop: 16, maxWidth: 440, textAlign: "center", fontFamily: FONTS.regular, fontSize: 12.5, lineHeight: 18, color: MUTED },
  },
  {
    form: { borderRightColor: "rgba(255,255,255,0.08)" },
    card: { backgroundColor: "#242526" },
    cover: { backgroundColor: "#5A3150" },
    avatarRing: { backgroundColor: "#242526" },
    name: { color: "#E4E6EB" },
    handle: { color: "#B0B3B8" },
    bio: { color: "#E4E6EB" },
    bioEmpty: { color: "#B0B3B8" },
    contact: { color: "#B0B3B8" },
    previewLabel: { color: "#B0B3B8" },
    hint: { color: "#B0B3B8" },
  },
);
void PINK;
