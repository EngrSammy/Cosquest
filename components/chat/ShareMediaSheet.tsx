// ==========================================
// SHARE WITH YOUR GROUP (Figma M17 · Media & voice share)
// ==========================================
// Photo / Voice note / Short video, a preview of what you picked (remove
// any), a caption, then "Send selected media": everything goes as ONE
// message (an album). Voice notes are recorded with the mic in the message
// bar, so "Voice note" points you there.
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FONTS } from "@/constants/fonts";
import { sendAlbum, type PickedMedia } from "@/services/chatExtras";
import { themedStyles, useThemedStyles } from "@/constants/chatTheme";

const PINK = "#B63D91";
const INK = "#24283C";
const MUTED = "#66738A";
const LILAC = "#F0EDF9";
const MAX = 10;

function lengthOf(seconds?: number | null) {
  if (!seconds || seconds <= 0) return "";
  const total = Math.round(seconds > 1000 ? seconds / 1000 : seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export default function ShareMediaSheet({
  visible,
  conversationId,
  token,
  replyTo,
  onClose,
  onSent,
  onVoiceNote,
}: {
  visible: boolean;
  conversationId: string;
  token: string;
  replyTo?: string | null;
  onClose: () => void;
  // The new album message (to show it straight away).
  onSent: (message: any) => void;
  // "Voice note": close and use the mic in the message bar.
  onVoiceNote: () => void;
}) {
  const styles = useThemedStyles(STYLE_PAIR);
  const insets = useSafeAreaInsets();

  const [picked, setPicked] = useState<PickedMedia[]>([]);
  const [caption, setCaption] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (visible) {
      setPicked([]);
      setCaption("");
    }
  }, [visible]);

  const pick = async (videosOnly: boolean) => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Photos", "Please allow CosQuest to access your photos and videos.");
      return;
    }
    const room = MAX - picked.length;
    if (room <= 0) {
      Alert.alert("Share", `You can send up to ${MAX} at once.`);
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: videosOnly ? ["videos"] : ["images", "videos"],
      allowsMultipleSelection: true,
      selectionLimit: room,
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.length) return;

    const added: PickedMedia[] = result.assets.slice(0, room).map((asset, index) => {
      const kind = asset.type === "video" ? "video" : "image";
      return {
        uri: asset.uri,
        name: asset.fileName || `${kind}-${Date.now()}-${index}.${kind === "video" ? "mp4" : "jpg"}`,
        type: asset.mimeType || (kind === "video" ? "video/mp4" : "image/jpeg"),
        kind,
        duration: asset.duration ?? null,
      };
    });
    setPicked((current) => [...current, ...added].slice(0, MAX));
  };

  const remove = (index: number) => setPicked((current) => current.filter((_, i) => i !== index));

  const send = async () => {
    if (!picked.length || sending) return;
    try {
      setSending(true);
      const message = await sendAlbum(conversationId, picked, caption, token, { replyTo });
      onSent(message);
      onClose();
    } catch (error) {
      Alert.alert("Share", error instanceof Error ? error.message : "Couldn't send. Please try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.header}>
            <Text style={styles.title}>Share with your group</Text>
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close">
              <Ionicons name="close" size={26} color={MUTED} />
            </Pressable>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {/* TILES */}
            <View style={styles.tiles}>
              <Pressable style={styles.tile} onPress={() => pick(false)}>
                <Ionicons name="image-outline" size={24} color={PINK} />
                <Text style={styles.tileText}>Photo</Text>
              </Pressable>
              <Pressable
                style={styles.tile}
                onPress={() => {
                  onClose();
                  onVoiceNote();
                }}>
                <Ionicons name="mic-outline" size={24} color={PINK} />
                <Text style={styles.tileText}>Voice note</Text>
              </Pressable>
              <Pressable style={styles.tile} onPress={() => pick(true)}>
                <Ionicons name="film-outline" size={24} color={PINK} />
                <Text style={styles.tileText}>Short video</Text>
              </Pressable>
            </View>

            {/* PREVIEW */}
            {picked.length ? (
              <View style={styles.previewGrid}>
                {picked.map((item, index) => (
                  <View key={`${item.uri}-${index}`} style={styles.previewTile}>
                    {item.kind === "image" ? (
                      <Image source={{ uri: item.uri }} style={styles.previewMedia} contentFit="cover" />
                    ) : (
                      <View style={[styles.previewMedia, styles.videoBlank]}>
                        <Ionicons name="film-outline" size={28} color="#FFFFFF" />
                      </View>
                    )}
                    {item.kind === "video" ? (
                      <View style={styles.videoBadge}>
                        <Ionicons name="play" size={12} color="#FFFFFF" />
                        {lengthOf(item.duration) ? <Text style={styles.videoText}>{lengthOf(item.duration)}</Text> : null}
                      </View>
                    ) : null}
                    <Pressable style={styles.remove} onPress={() => remove(index)} hitSlop={6} accessibilityLabel="Remove">
                      <Ionicons name="close" size={14} color="#FFFFFF" />
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.hint}>Pick up to {MAX} photos and short videos. They're sent together as one message.</Text>
            )}

            {/* CAPTION */}
            <Text style={styles.label}>Caption</Text>
            <TextInput
              value={caption}
              onChangeText={setCaption}
              placeholder="Add a caption (optional)"
              placeholderTextColor="#9AA3B5"
              maxLength={2000}
              multiline
              style={styles.input}
            />

            <Pressable style={[styles.primary, (!picked.length || sending) && styles.off]} disabled={!picked.length || sending} onPress={send}>
              {sending ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryText}>
                  Send selected media{picked.length ? ` · ${picked.length}` : ""}
                </Text>
              )}
            </Pressable>
            <Pressable style={styles.secondary} onPress={onClose}>
              <Text style={styles.secondaryText}>Cancel</Text>
            </Pressable>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const STYLE_PAIR = themedStyles({
  backdrop: { flex: 1, backgroundColor: "rgba(36,40,60,0.35)" },

  sheet: {
    maxHeight: "92%",
    width: "100%",
    maxWidth: 640,
    alignSelf: "center",
    paddingHorizontal: 20,
    paddingTop: 22,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: "#FFFFFF",
  },

  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },

  title: { fontFamily: FONTS.semibold, fontSize: 22, lineHeight: 28, color: INK },

  off: { opacity: 0.5 },

  tiles: { flexDirection: "row", gap: 10 },

  tile: {
    flex: 1,
    height: 72,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: LILAC,
  },

  tileText: { fontFamily: FONTS.medium, fontSize: 13, color: INK },

  hint: { marginTop: 14, fontFamily: FONTS.regular, fontSize: 13, lineHeight: 19, color: MUTED },

  previewGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 16 },

  previewTile: { width: "47%", aspectRatio: 1.3, borderRadius: 16, overflow: "hidden" },

  previewMedia: { width: "100%", height: "100%", alignItems: "center", justifyContent: "center" },

  videoBlank: { backgroundColor: "#2A2D3A" },

  videoBadge: {
    position: "absolute",
    right: 8,
    bottom: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: "rgba(0,0,0,0.55)",
  },

  videoText: { fontFamily: FONTS.medium, fontSize: 11, color: "#FFFFFF" },

  remove: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
  },

  label: { marginTop: 18, marginBottom: 8, fontFamily: FONTS.semibold, fontSize: 13, color: INK },

  input: {
    minHeight: 50,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "rgba(102,115,138,0.25)",
    fontFamily: FONTS.regular,
    fontSize: 15,
    color: INK,
    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null),
  },

  primary: {
    marginTop: 18,
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: PINK,
  },

  primaryText: { fontFamily: FONTS.semibold, fontSize: 16, color: "#FFFFFF" },

  secondary: {
    marginTop: 10,
    height: 50,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: LILAC,
  },

  secondaryText: { fontFamily: FONTS.semibold, fontSize: 15, color: PINK },
});
