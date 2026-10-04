// ==========================================
// CHAT WALLPAPER PICKER
// ==========================================
// Opened from ⋮ → Wallpaper in a chat. Tapping a choice previews it LIVE on
// the chat behind the sheet; "This chat" / "All chats" saves it.
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState } from "react";
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  WALLPAPER_PRESETS,
  type Wallpaper,
  type WallpaperPreset,
} from "@/constants/wallpapers";

import { setAllChatsWallpaper, setChatWallpaper } from "./useChatWallpaper";

function sameWallpaper(a: Wallpaper | null, b: Wallpaper | null) {
  if (!a || !b || a.kind !== b.kind) {
    return false;
  }

  return a.kind === "preset"
    ? a.id === (b as { id: string }).id
    : a.uri === (b as { uri: string }).uri;
}

function PresetTile({
  preset,
  selected,
  onPress,
}: {
  preset: WallpaperPreset;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.tileWrap} onPress={onPress}>
      <View style={[styles.tile, selected && styles.tileSelected]}>
        <View
          style={[StyleSheet.absoluteFill, { backgroundColor: preset.color }]}
        />

        {preset.gradient ? (
          <LinearGradient
            colors={preset.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        ) : null}

        {preset.image ? (
          <Image
            source={preset.image}
            style={[
              StyleSheet.absoluteFill,
              { opacity: preset.imageOpacity ?? 0.4 },
            ]}
            contentFit="cover"
          />
        ) : null}

        {/* Two tiny bubbles, so it looks like a chat */}
        <View style={[styles.miniBubble, styles.miniTheirs]} />
        <View style={[styles.miniBubble, styles.miniMine]} />

        {selected ? (
          <View style={styles.check}>
            <Ionicons name="checkmark" size={14} color="#FFFFFF" />
          </View>
        ) : null}
      </View>

      <Text style={styles.tileLabel} numberOfLines={1}>
        {preset.label}
      </Text>
    </Pressable>
  );
}

export function WallpaperPicker({
  visible,
  conversationId,
  current,
  onPreview,
  onClose,
}: {
  visible: boolean;
  conversationId: string;
  // The wallpaper this chat uses now (saved).
  current: Wallpaper;
  // Show a choice on the chat behind the sheet (null = stop previewing).
  onPreview: (wallpaper: Wallpaper | null) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();

  const [choice, setChoice] = useState<Wallpaper>(current);
  const [saving, setSaving] = useState(false);

  // Start from the current wallpaper every time the sheet opens.
  useEffect(() => {
    if (visible) {
      setChoice(current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const pick = (wallpaper: Wallpaper) => {
    setChoice(wallpaper);
    onPreview(wallpaper);
  };

  const cancel = () => {
    onPreview(null);
    onClose();
  };

  const chooseFromPhotos = async () => {
    try {
      if (Platform.OS !== "web") {
        const permission =
          await ImagePicker.requestMediaLibraryPermissionsAsync();

        if (!permission.granted) {
          Alert.alert(
            "Photo permission",
            "Please allow CosQuest to access your photos.",
          );
          return;
        }
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: false,
        quality: 1,
      });

      if (result.canceled || !result.assets?.[0]) {
        return;
      }

      const asset = result.assets[0];

      // Make a phone-screen-sized copy (max 1080px wide). On the website the
      // photo itself is saved in the browser, which only has a few MB of
      // room - a full-size photo didn't fit, so it was quietly forgotten.
      const resized = await ImageManipulator.manipulateAsync(
        asset.uri,
        [{ resize: { width: Math.min(asset.width || 1080, 1080) } }],
        {
          compress: 0.6,
          format: ImageManipulator.SaveFormat.JPEG,
          base64: Platform.OS === "web",
        },
      );

      const uri =
        Platform.OS === "web" && resized.base64
          ? `data:image/jpeg;base64,${resized.base64}`
          : resized.uri;

      pick({ kind: "photo", uri });
    } catch {
      Alert.alert("Wallpaper", "Unable to open your photos.");
    }
  };

  const save = async (scope: "chat" | "all") => {
    if (saving) {
      return;
    }

    try {
      setSaving(true);

      const saved =
        scope === "chat"
          ? await setChatWallpaper(conversationId, choice)
          : await setAllChatsWallpaper(choice, conversationId);

      onPreview(null);
      onClose();

      if (!saved) {
        Alert.alert(
          "Wallpaper",
          choice.kind === "photo"
            ? "This photo is too large to remember on this device. It's shown now, but pick a smaller photo (or a colour) so it stays next time."
            : "Couldn't save the wallpaper on this device. It's shown now but won't be remembered.",
        );
      }
    } finally {
      setSaving(false);
    }
  };

  const photoSelected = choice.kind === "photo";

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={cancel}>
      {/* No dark backdrop, so the live preview on the chat stays visible */}
      <Pressable style={styles.backdrop} onPress={cancel} />

      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.handle} />

        <View style={styles.header}>
          <Text style={styles.title}>Chat wallpaper</Text>

          <Pressable style={styles.close} onPress={cancel} hitSlop={8}>
            <Ionicons name="close" size={22} color="#191922" />
          </Pressable>
        </View>

        <Text style={styles.hint}>
          Tap one to preview it. Only you see your wallpaper.
        </Text>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tiles}>
          {/* YOUR PHOTO */}
          <Pressable style={styles.tileWrap} onPress={chooseFromPhotos}>
            <View
              style={[
                styles.tile,
                styles.photoTile,
                photoSelected && styles.tileSelected,
              ]}>
              {photoSelected ? (
                <Image
                  source={{ uri: (choice as { uri: string }).uri }}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                />
              ) : (
                <Ionicons name="images-outline" size={26} color="#C5399A" />
              )}

              {photoSelected ? (
                <View style={styles.check}>
                  <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                </View>
              ) : null}
            </View>

            <Text style={styles.tileLabel} numberOfLines={1}>
              {photoSelected ? "Your photo" : "Choose photo"}
            </Text>
          </Pressable>

          {WALLPAPER_PRESETS.map((preset) => (
            <PresetTile
              key={preset.id}
              preset={preset}
              selected={sameWallpaper(choice, {
                kind: "preset",
                id: preset.id,
              })}
              onPress={() => pick({ kind: "preset", id: preset.id })}
            />
          ))}
        </ScrollView>

        <View style={styles.buttons}>
          <Pressable
            style={[styles.button, styles.buttonSecondary]}
            onPress={() => save("all")}
            disabled={saving}>
            <Text style={styles.buttonSecondaryText}>Set for all chats</Text>
          </Pressable>

          <Pressable
            style={[styles.button, styles.buttonPrimary]}
            onPress={() => save("chat")}
            disabled={saving}>
            <Text style={styles.buttonPrimaryText}>Set for this chat</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
  },

  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 10,
    width: "100%",
    maxWidth: 640,
    alignSelf: "center",
    borderWidth: 1,
    borderColor: "#EDEDF1",
  },

  handle: {
    alignSelf: "center",
    width: 42,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#D5D5DA",
    marginBottom: 12,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
  },

  title: {
    fontSize: 18,
    fontWeight: "800",
    color: "#191922",
  },

  close: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F0F0F3",
  },

  hint: {
    marginTop: 4,
    paddingHorizontal: 20,
    fontSize: 12.5,
    color: "#8A8A93",
  },

  tiles: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 12,
  },

  tileWrap: {
    width: 76,
    alignItems: "center",
  },

  tile: {
    width: 76,
    height: 120,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "#E8E8EE",
    justifyContent: "center",
    alignItems: "center",
  },

  tileSelected: {
    borderColor: "#C5399A",
  },

  photoTile: {
    backgroundColor: "rgba(197,57,154,0.08)",
  },

  miniBubble: {
    position: "absolute",
    height: 12,
    borderRadius: 6,
  },

  miniTheirs: {
    left: 8,
    top: 34,
    width: 34,
    backgroundColor: "#FFFFFF",
  },

  miniMine: {
    right: 8,
    top: 54,
    width: 30,
    backgroundColor: "#C5399A",
  },

  check: {
    position: "absolute",
    right: 6,
    bottom: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#C5399A",
  },

  tileLabel: {
    marginTop: 6,
    fontSize: 11.5,
    fontWeight: "600",
    color: "#4B4B53",
  },

  buttons: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 20,
  },

  button: {
    flex: 1,
    height: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },

  buttonPrimary: {
    backgroundColor: "#C5399A",
  },

  buttonPrimaryText: {
    color: "#FFFFFF",
    fontSize: 14.5,
    fontWeight: "700",
  },

  buttonSecondary: {
    backgroundColor: "#F3F3F6",
  },

  buttonSecondaryText: {
    color: "#3B3B42",
    fontSize: 14.5,
    fontWeight: "700",
  },
});
