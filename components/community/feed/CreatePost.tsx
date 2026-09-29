import { AVATARS } from "@/constants/avatars";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import {
      ActivityIndicator,
      Alert,
      KeyboardAvoidingView,
      Modal,
      Platform,
      Pressable,
      ScrollView,
      StyleSheet,
      Text,
      TextInput,
      View,
} from "react-native";

import { useAppDispatch, useAppSelector } from "@/store/hooks";

import {
      createImagePostThunk,
      createNewPost,
      createReelPostThunk,
      fetchPosts,
} from "@/store/thunks/postThunks";

type SelectedFile = {
  uri: string;
  name: string;
  type: string;
};

type ComposerMode = "thought" | "photo" | "gallery" | "video";

const HASHTAGS = [
  "#Cosplay",
  "#Cosplayer",
  "#CosplayCommunity",
  "#CosplayLife",
];

function prepareImageForUpload(
  asset: ImagePicker.ImagePickerAsset,
): Promise<SelectedFile> {
  return (async () => {
    const mimeType = asset.mimeType?.toLowerCase() || "";

    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];

    if (allowed.includes(mimeType)) {
      return {
        uri: asset.uri,
        name: asset.fileName || `image-${Date.now()}`,
        type: mimeType,
      };
    }

    const result = await ImageManipulator.manipulateAsync(asset.uri, [], {
      compress: 0.9,
      format: ImageManipulator.SaveFormat.JPEG,
    });

    return {
      uri: result.uri,
      name: `image-${Date.now()}.jpg`,
      type: "image/jpeg",
    };
  })();
}

export function CreatePost() {
  const dispatch = useAppDispatch();

  const authUser = useAppSelector((state) => state.auth.user);

  const user = useAppSelector((state) => state.user.user);

  const token = useAppSelector((state) => state.auth.token);

  const [visible, setVisible] = useState(false);

  const [mode, setMode] = useState<ComposerMode>("thought");

  const [content, setContent] = useState("");

  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);

  const [posting, setPosting] = useState(false);

  const avatarKey =
    user?.profile?.avatarKey ||
    authUser?.profile?.avatarKey ||
    user?.avatar ||
    "";

  const avatar = AVATARS.find((item) => item.id === avatarKey);

  const selectedAvatar =
    avatar?.source || require("@/assets/images/dp-avatar.png");

  const username =
    user?.profile?.username || authUser?.profile?.username || "You";

  const close = () => {
    if (posting) {
      return;
    }

    setVisible(false);
    setContent("");
    setSelectedFiles([]);
    setMode("thought");
  };

  const addHashtag = (hashtag: string) => {
    setContent((current) => {
      const trimmed = current.trim();

      if (trimmed.includes(hashtag)) {
        return current;
      }

      return trimmed ? `${trimmed} ${hashtag}` : hashtag;
    });
  };

  const permission = async () => {
    const result = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!result.granted) {
      Alert.alert("Permission required", "Please allow access to your photos.");

      return false;
    }

    return true;
  };

  const pickPhoto = async () => {
    if (!(await permission())) {
      return;
    }

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        selectionLimit: 1,
        allowsMultipleSelection: false,
        quality: 0.9,
      });

      if (result.canceled || !result.assets?.length) {
        return;
      }

      const file = await prepareImageForUpload(result.assets[0]);

      setMode("photo");
      setSelectedFiles([file]);
    } catch (error) {
      Alert.alert(
        "Unable to select photo",
        error instanceof Error ? error.message : "Unable to select photo.",
      );
    }
  };

  const pickGallery = async () => {
    if (!(await permission())) {
      return;
    }

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        selectionLimit: 8,
        allowsMultipleSelection: true,
        quality: 0.9,
      });

      if (result.canceled || !result.assets?.length) {
        return;
      }

      const files = await Promise.all(
        result.assets.slice(0, 8).map(prepareImageForUpload),
      );

      setMode("gallery");
      setSelectedFiles(files);
    } catch (error) {
      Alert.alert(
        "Unable to select photos",
        error instanceof Error ? error.message : "Unable to select photos.",
      );
    }
  };

  // ==========================================
  // PICK VIDEO
  // ==========================================

  const pickVideo = async () => {
    if (!(await permission())) {
      return;
    }

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["videos"],
        selectionLimit: 1,
        allowsMultipleSelection: false,
        quality: 1,
      });

      if (result.canceled || !result.assets?.length) {
        return;
      }

      const asset = result.assets[0];

      // No 30-second restriction.
      // Videos longer than 30 seconds can now be selected.

      setMode("video");

      setSelectedFiles([
        {
          uri: asset.uri,
          name: asset.fileName || `video-${Date.now()}.mp4`,
          type: asset.mimeType || "video/mp4",
        },
      ]);
    } catch (error) {
      Alert.alert(
        "Unable to select video",
        error instanceof Error ? error.message : "Unable to select video.",
      );
    }
  };

  // ==========================================
  // CREATE POST
  // ==========================================

  const handlePost = async () => {
    if (!token) {
      return;
    }

    const text = content.trim();

    try {
      setPosting(true);

      // ======================================
      // THOUGHT
      // ======================================

      if (mode === "thought") {
        if (!text) {
          Alert.alert("Create Post", "Please write something.");

          return;
        }

        await dispatch(
          createNewPost({
            token,
            data: {
              type: "thought",
              content: text,
            },
          }),
        ).unwrap();
      }

      // ======================================
      // PHOTO / GALLERY
      // ======================================

      if (mode === "photo" || mode === "gallery") {
        if (!selectedFiles.length) {
          Alert.alert("Create Post", "Select at least one photo.");

          return;
        }

        await dispatch(
          createImagePostThunk({
            token,
            content: text,
            files: selectedFiles,
          }),
        ).unwrap();
      }

      // ======================================
      // VIDEO
      // ======================================

      if (mode === "video") {
        if (!selectedFiles.length) {
          Alert.alert("Create Post", "Select a video.");

          return;
        }

        await dispatch(
          createReelPostThunk({
            token,
            content: text,
            file: selectedFiles[0],
          }),
        ).unwrap();
      }

      close();

      await dispatch(fetchPosts(token)).unwrap();

      Alert.alert("Posted", "Your post has been published.");
    } catch (error) {
      Alert.alert(
        "Unable to post",
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Unable to create post.",
      );
    } finally {
      setPosting(false);
    }
  };

  return (
    <>
      {/* ==========================================
          COMMUNITY COMPOSER
      ========================================== */}

      <Pressable style={styles.composer} onPress={() => setVisible(true)}>
        <Image
          source={selectedAvatar}
          style={styles.composerAvatar}
          contentFit="cover"
        />

        <Text style={styles.placeholder} numberOfLines={1}>
          Share Your Cosplay Or A Hot Take...
        </Text>

        <View style={styles.addButton}>
          <Ionicons name="add" size={24} color="#C5399A" />
        </View>
      </Pressable>

      {/* ==========================================
          CREATE POST MODAL
      ========================================== */}

      <Modal
        visible={visible}
        transparent
        animationType="slide"
        onRequestClose={close}>
        <KeyboardAvoidingView
          style={styles.modalRoot}
          behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <Pressable style={styles.modalOverlay} onPress={close} />

          <View style={styles.sheet}>
            <View style={styles.handle} />

            {/* HEADER */}

            <View style={styles.header}>
              <View style={styles.titleRow}>
                <Image source={selectedAvatar} style={styles.sheetAvatar} />

                <View>
                  <Text style={styles.title}>Create a post</Text>

                  <Text style={styles.username}>{username}</Text>
                </View>
              </View>

              <Pressable style={styles.closeButton} onPress={close}>
                <Ionicons name="close" size={23} color="#191922" />
              </Pressable>
            </View>

            {/* TEXT */}

            <TextInput
              value={content}
              onChangeText={setContent}
              multiline
              textAlignVertical="top"
              placeholder="What's on your mind?"
              placeholderTextColor="#9999A1"
              style={styles.input}
            />

            {/* HASHTAGS */}

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.hashtagScroll}
              contentContainerStyle={styles.hashtagContent}>
              {HASHTAGS.map((tag) => (
                <Pressable
                  key={tag}
                  style={styles.hashtagChip}
                  onPress={() => addHashtag(tag)}>
                  <Text style={styles.hashtagText}>{tag}</Text>
                </Pressable>
              ))}
            </ScrollView>

            {/* MEDIA PREVIEW */}

            {selectedFiles.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.mediaPreview}
                contentContainerStyle={styles.mediaPreviewContent}>
                {selectedFiles.map((file, index) => (
                  <View key={`${file.uri}-${index}`} style={styles.previewItem}>
                    <Image
                      source={{
                        uri: file.uri,
                      }}
                      style={styles.previewImage}
                      contentFit="cover"
                    />

                    {mode === "video" ? (
                      <View style={styles.previewPlay}>
                        <Ionicons name="play" size={18} color="#FFFFFF" />
                      </View>
                    ) : null}
                  </View>
                ))}
              </ScrollView>
            )}

            {/* OPTIONS */}

            <View style={styles.optionRow}>
              <PostOption
                icon="image"
                label="Photo"
                color="#2196F3"
                onPress={pickPhoto}
              />

              <PostOption
                icon="videocam"
                label="Video"
                color="#C5399A"
                onPress={pickVideo}
              />

              <PostOption
                icon="images"
                label="Gallery"
                color="#22A679"
                onPress={pickGallery}
              />

              <PostOption
                icon="document-text"
                label="Thought"
                color="#7745D9"
                onPress={() => {
                  setMode("thought");
                  setSelectedFiles([]);
                }}
              />
            </View>

            {/* POST BUTTON */}

            <Pressable
              style={styles.postButton}
              onPress={handlePost}
              disabled={posting}>
              {posting ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.postButtonText}>Post</Text>
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

// ==========================================
// POST OPTION
// ==========================================

function PostOption({
  icon,
  label,
  color,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.option} onPress={onPress}>
      <View
        style={[
          styles.optionIcon,
          {
            backgroundColor: `${color}18`,
          },
        ]}>
        <Ionicons name={icon} size={22} color={color} />
      </View>

      <Text style={styles.optionText}>{label}</Text>
    </Pressable>
  );
}

// ==========================================
// STYLES
// ==========================================

const styles = StyleSheet.create({
  composer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 10,
    marginBottom: 16,
    backgroundColor: "rgba(255,255,255,0.72)",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.9)",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },

  composerAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },

  placeholder: {
    flex: 1,
    fontSize: 13.5,
    color: "#777780",
  },

  addButton: {
    width: 35,
    height: 35,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(195,77,156,0.15)",
  },

  modalRoot: {
    flex: 1,
    justifyContent: "flex-end",
  },

  modalOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.28)",
  },

  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 22,
    paddingTop: 10,
    paddingBottom: Platform.OS === "ios" ? 28 : 20,
  },

  handle: {
    alignSelf: "center",
    width: 42,
    height: 5,
    borderRadius: 4,
    backgroundColor: "#C7C7CC",
    marginBottom: 18,
  },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },

  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },

  sheetAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },

  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#191922",
  },

  username: {
    marginTop: 2,
    fontSize: 12,
    color: "#898992",
  },

  closeButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F0F0F3",
  },

  input: {
    minHeight: 130,
    maxHeight: 190,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E3E3E7",
    backgroundColor: "#FAFAFB",
    paddingHorizontal: 15,
    paddingVertical: 14,
    fontSize: 15,
    color: "#191922",
  },

  hashtagScroll: {
    marginVertical: 12,
  },

  hashtagContent: {
    gap: 8,
  },

  hashtagChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 15,
    backgroundColor: "rgba(197,57,154,0.09)",
    borderWidth: 1,
    borderColor: "rgba(197,57,154,0.16)",
  },

  hashtagText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#C5399A",
  },

  mediaPreview: {
    marginBottom: 14,
  },

  mediaPreviewContent: {
    gap: 8,
  },

  previewItem: {
    width: 72,
    height: 72,
    borderRadius: 12,
    overflow: "hidden",
    position: "relative",
  },

  previewImage: {
    width: "100%",
    height: "100%",
  },

  previewPlay: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.25)",
  },

  optionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
  },

  option: {
    width: "23%",
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: "#F8F8FA",
  },

  optionIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },

  optionText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#4B4B53",
  },

  postButton: {
    height: 52,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#C5399A",
  },

  postButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});
