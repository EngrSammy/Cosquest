// ==========================================
// SHARE WITH YOUR GROUP (Figma M17 · Media & voice share)
// ==========================================
// Photo / Voice note / Short video, a preview of what you picked, a caption,
// then "Send selected media": everything selected goes as ONE message (an album).
//
// Selecting: every picked item shows a check badge. Tap an item to untick it
// (it stays in the grid, dimmed, so you can tick it again). "Clear all"
// removes everything. The X in the header closes the sheet without sending.
// Voice notes are recorded with the mic in the message bar, so "Voice note"
// points you there.
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  CheckBadge,
  FieldLabel,
  PrimaryButton,
  SecondaryButton,
  SheetHeader,
  TextField,
  UI,
} from "@/components/chat/ui";
import { themedStyles, useInk, useThemedStyles } from "@/constants/chatTheme";
import { FONTS } from "@/constants/fonts";
import { sendAlbum, type PickedMedia } from "@/services/chatExtras";

const MAX = 10;

type Item = PickedMedia & { selected: boolean };

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
  const ink = useInk();
  const insets = useSafeAreaInsets();

  const [items, setItems] = useState<Item[]>([]);
  const [caption, setCaption] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (visible) {
      setItems([]);
      setCaption("");
    }
  }, [visible]);

  const selected = items.filter((item) => item.selected);

  const pick = async (videosOnly: boolean) => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Photos",
        "Please allow CosQuest to access your photos and videos.",
      );
      return;
    }
    const room = MAX - items.length;
    if (room <= 0) {
      Alert.alert("Share", `You can send up to ${MAX} at once.`);
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: videosOnly ? ["videos"] : ["images", "videos"],
      allowsMultipleSelection: true,
      selectionLimit: room,
      orderedSelection: true,
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.length) return;

    const added: Item[] = result.assets.slice(0, room).map((asset, index) => {
      const kind = asset.type === "video" ? "video" : "image";
      return {
        uri: asset.uri,
        name:
          asset.fileName ||
          `${kind}-${Date.now()}-${index}.${kind === "video" ? "mp4" : "jpg"}`,
        type: asset.mimeType || (kind === "video" ? "video/mp4" : "image/jpeg"),
        kind,
        duration: asset.duration ?? null,
        selected: true,
      };
    });
    setItems((current) => [...current, ...added].slice(0, MAX));
  };

  const toggle = (index: number) =>
    setItems((current) =>
      current.map((item, i) =>
        i === index ? { ...item, selected: !item.selected } : item,
      ),
    );

  const send = async () => {
    if (!selected.length || sending) return;
    try {
      setSending(true);
      const files: PickedMedia[] = selected.map(
        ({ selected: _selected, ...media }) => media,
      );
      const message = await sendAlbum(conversationId, files, caption, token, {
        replyTo,
      });
      onSent(message);
      onClose();
    } catch (error) {
      Alert.alert(
        "Share",
        error instanceof Error
          ? error.message
          : "Couldn't send. Please try again.",
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <SheetHeader title="Share with your group" onClose={onClose} />

          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            {/* TILES */}
            <View style={styles.tiles}>
              <Pressable style={styles.tile} onPress={() => pick(false)}>
                <Ionicons
                  name="image-outline"
                  size={24}
                  color={ink.text(UI.PINK)}
                />
                <Text style={styles.tileText}>Photo</Text>
              </Pressable>
              <Pressable
                style={styles.tile}
                onPress={() => {
                  onClose();
                  onVoiceNote();
                }}>
                <Ionicons
                  name="mic-outline"
                  size={24}
                  color={ink.text(UI.PINK)}
                />
                <Text style={styles.tileText}>Voice note</Text>
              </Pressable>
              <Pressable style={styles.tile} onPress={() => pick(true)}>
                <Ionicons
                  name="film-outline"
                  size={24}
                  color={ink.text(UI.PINK)}
                />
                <Text style={styles.tileText}>Short video</Text>
              </Pressable>
            </View>

            {/* PREVIEW */}
            {items.length ? (
              <>
                <View style={styles.countRow}>
                  <Text style={styles.countText}>
                    {selected.length} of {MAX} selected
                  </Text>
                  <Pressable
                    onPress={() => setItems([])}
                    hitSlop={8}
                    accessibilityLabel="Clear all">
                    <Text style={styles.clearText}>Clear all</Text>
                  </Pressable>
                </View>

                <View style={styles.previewGrid}>
                  {items.map((item, index) => (
                    <Pressable
                      key={`${item.uri}-${index}`}
                      style={styles.previewTile}
                      onPress={() => toggle(index)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: item.selected }}>
                      <View
                        style={[
                          styles.previewInner,
                          !item.selected && styles.dim,
                        ]}>
                        {item.kind === "image" ? (
                          <Image
                            source={{ uri: item.uri }}
                            style={styles.previewMedia}
                            contentFit="cover"
                          />
                        ) : (
                          <View
                            style={[styles.previewMedia, styles.videoBlank]}>
                            <Ionicons
                              name="film-outline"
                              size={28}
                              color="#FFFFFF"
                            />
                          </View>
                        )}
                      </View>

                      {item.kind === "video" ? (
                        <View style={styles.videoBadge}>
                          <Ionicons name="play" size={12} color="#FFFFFF" />
                          {lengthOf(item.duration) ? (
                            <Text style={styles.videoText}>
                              {lengthOf(item.duration)}
                            </Text>
                          ) : null}
                        </View>
                      ) : null}

                      <View style={styles.badge}>
                        <CheckBadge checked={item.selected} size={24} />
                      </View>
                    </Pressable>
                  ))}
                </View>
              </>
            ) : (
              <Text style={styles.hint}>
                Pick up to {MAX} photos and short videos. They&apos;re sent
                together as one message.
              </Text>
            )}

            {/* CAPTION */}
            <FieldLabel>Caption</FieldLabel>
            <TextField
              value={caption}
              onChangeText={setCaption}
              placeholder="Add a caption (optional)"
              maxLength={2000}
              multiline
              style={styles.captionInput}
            />

            <PrimaryButton
              label={`Send selected media${selected.length ? ` · ${selected.length}` : ""}`}
              onPress={send}
              disabled={!selected.length}
              loading={sending}
            />
            <SecondaryButton label="Cancel" onPress={onClose} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const STYLE_PAIR = themedStyles(
  {
    backdrop: { flex: 1, backgroundColor: "rgba(36,40,60,0.2)" },

    sheet: {
      maxHeight: "92%",
      width: "100%",
      maxWidth: 640,
      alignSelf: "center",
      paddingHorizontal: 18,
      paddingTop: 22,
      borderTopLeftRadius: UI.SHEET_RADIUS,
      borderTopRightRadius: UI.SHEET_RADIUS,
      backgroundColor: "#FFFFFF",
    },

    tiles: { flexDirection: "row", gap: 10, marginTop: UI.GAP },

    tile: {
      flex: 1,
      height: 72,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      backgroundColor: UI.LILAC,
    },
    tileText: { fontFamily: FONTS.medium, fontSize: 13, color: UI.INK },

    hint: {
      marginTop: 14,
      fontFamily: FONTS.regular,
      fontSize: 13,
      lineHeight: 19,
      color: UI.MUTED,
    },

    countRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: UI.GAP,
    },
    countText: { fontFamily: FONTS.semibold, fontSize: 13, color: UI.INK },
    clearText: { fontFamily: FONTS.semibold, fontSize: 13, color: UI.PINK },

    previewGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
      marginTop: 12,
    },
    previewTile: { width: "47.5%", aspectRatio: 1.3, borderRadius: 14 },
    previewInner: { flex: 1, borderRadius: 14, overflow: "hidden" },
    dim: { opacity: 0.4 },
    previewMedia: {
      width: "100%",
      height: "100%",
      alignItems: "center",
      justifyContent: "center",
    },
    videoBlank: { backgroundColor: "#2A2D3A" },

    videoBadge: {
      position: "absolute",
      left: 8,
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

    badge: { position: "absolute", top: 8, right: 8 },

    captionInput: { paddingVertical: 12 },
  },
  {
    sheet: { backgroundColor: "#181D2C" },
    tile: { backgroundColor: "#343044" },
    tileText: { color: "#F0F1F7" },
    hint: { color: "#B5BBCB" },
    countText: { color: "#F0F1F7" },
    clearText: { color: "#F0A6D7" },
  },
);
