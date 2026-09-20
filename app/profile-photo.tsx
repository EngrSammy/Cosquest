import { AppBackground } from "@/components/AppBackground";
import { AVATARS } from "@/constants/avatars";

import { useAppDispatch, useAppSelector } from "@/store/hooks";

import { saveAvatarPhoto, saveUserAvatar } from "@/store/thunks/userThunks";

import { updateAuthUser } from "@/store/slices/authSlice";

import { updateUser } from "@/store/slices/userSlice";

import * as ImagePicker from "expo-image-picker";

import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";

import { useMemo, useState } from "react";

import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function ProfilePhoto() {
  const insets = useSafeAreaInsets();

  const dispatch = useAppDispatch();

  const authUser = useAppSelector((state) => state.auth.user);

  const user = useAppSelector((state) => state.user.user);

  const email = authUser?.email || (user as any)?.email || "";

  const profile = (user as any)?.profile || {};

  const currentAvatarKey =
    profile.avatarKey ||
    authUser?.profile?.avatarKey ||
    (user as any)?.avatar ||
    "";

  const currentPhoto =
    profile.avatarPhotoUrl ||
    authUser?.profile?.avatarPhotoUrl ||
    (user as any)?.photo ||
    null;

  const [selectedAvatar, setSelectedAvatar] =
    useState<string>(currentAvatarKey);

  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);

  const currentAvatarSource = useMemo(() => {
    const found = AVATARS.find((avatar) => avatar.id === selectedAvatar);

    return found?.source || require("@/assets/images/dp-avatar.png");
  }, [selectedAvatar]);

  const previewSource = selectedPhoto || currentPhoto || currentAvatarSource;

  async function choosePhoto() {
    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (permission.status !== "granted") {
        Alert.alert(
          "Permission needed",
          "Please allow photo library access so you can choose a profile photo.",
        );

        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.9,
      });

      if (result.canceled || !result.assets?.length) {
        return;
      }

      const uri = result.assets[0].uri;

      setSelectedPhoto(uri);
    } catch (error) {
      Alert.alert("Photo error", "We could not open your photo library.");
    }
  }

  function chooseAvatar(avatarKey: string) {
    setSelectedAvatar(avatarKey);

    setSelectedPhoto(null);
  }

  async function handleSave() {
    if (!email) {
      Alert.alert("Error", "Your account email could not be found.");

      return;
    }

    try {
      setSaving(true);

      if (selectedPhoto) {
        const result = await dispatch(
          saveAvatarPhoto({
            email,
            photoUri: selectedPhoto,
          }),
        ).unwrap();

        const returnedUser = (result as any)?.user || result;

        const returnedProfile = returnedUser?.profile || {};

        const photoUrl = returnedProfile.avatarPhotoUrl || selectedPhoto;

        const avatarKey = returnedProfile.avatarKey || selectedAvatar;

        dispatch(
          updateUser({
            avatar: avatarKey,

            photo: photoUrl,

            profile: {
              avatarKey,
              avatarPhotoUrl: photoUrl,
            },
          }),
        );

        dispatch(
          updateAuthUser({
            profile: {
              avatarKey,
              avatarPhotoUrl: photoUrl,
            },
          }),
        );
      } else if (selectedAvatar && selectedAvatar !== currentAvatarKey) {
        const result = await dispatch(
          saveUserAvatar({
            email,
            avatar: selectedAvatar,
          }),
        ).unwrap();

        const returnedUser = (result as any)?.user || result;

        const returnedProfile = returnedUser?.profile || {};

        const avatarKey = returnedProfile.avatarKey || selectedAvatar;

        dispatch(
          updateUser({
            avatar: avatarKey,

            photo: null,

            profile: {
              avatarKey,
              avatarPhotoUrl: null,
            },
          }),
        );

        dispatch(
          updateAuthUser({
            profile: {
              avatarKey,
              avatarPhotoUrl: null,
            },
          }),
        );
      }

      Alert.alert(
        "Profile Photo Updated",
        "Your profile photo has been updated successfully.",
        [
          {
            text: "OK",
            onPress: () => router.back(),
          },
        ],
      );
    } catch (error) {
      Alert.alert(
        "Update failed",
        error instanceof Error
          ? error.message
          : "Unable to update your profile photo.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppBackground variant="blueGradient">
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          {
            paddingTop: insets.top + 8,
          },
        ]}
        showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="chevron-back" size={26} color="#191922" />
          </Pressable>

          <Text style={styles.headerTitle}>Profile Photo</Text>

          <Pressable onPress={handleSave} hitSlop={10} disabled={saving}>
            {saving ? (
              <ActivityIndicator size="small" color="#C5399A" />
            ) : (
              <Text style={styles.save}>Save</Text>
            )}
          </Pressable>
        </View>

        <View style={styles.previewSection}>
          <View style={styles.previewCircle}>
            <Image
              source={previewSource}
              style={styles.previewImage}
              contentFit="cover"
            />
          </View>

          {selectedPhoto ? (
            <Text style={styles.previewLabel}>New photo selected</Text>
          ) : (
            <Text style={styles.previewLabel}>Current profile photo</Text>
          )}
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.uploadButton,
            pressed && {
              opacity: 0.75,
            },
          ]}
          onPress={choosePhoto}>
          <Ionicons name="image-outline" size={21} color="#C5399A" />

          <Text style={styles.uploadButtonText}>Upload a new photo</Text>
        </Pressable>

        <Text style={styles.sectionTitle}>Or choose an avatar</Text>

        <Text style={styles.sectionSubtitle}>
          Choosing an avatar will replace your uploaded profile photo.
        </Text>

        <View style={styles.avatarGrid}>
          {AVATARS.map((avatar) => {
            const active = avatar.id === selectedAvatar && !selectedPhoto;

            return (
              <Pressable
                key={avatar.id}
                style={[styles.avatarItem, active && styles.avatarItemActive]}
                onPress={() => chooseAvatar(avatar.id)}>
                <Image
                  source={avatar.source}
                  style={styles.avatarImage}
                  contentFit="cover"
                />

                {active ? (
                  <View style={styles.check}>
                    <Ionicons name="checkmark" size={15} color="#FFFFFF" />
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.bottomSave,
            pressed && {
              opacity: 0.75,
            },
            saving && styles.bottomSaveDisabled,
          ]}
          onPress={handleSave}
          disabled={saving}>
          {saving ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Ionicons
                name="checkmark-circle-outline"
                size={20}
                color="#FFFFFF"
              />

              <Text style={styles.bottomSaveText}>Save Profile Photo</Text>
            </>
          )}
        </Pressable>
      </ScrollView>
    </AppBackground>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: 20,
    paddingBottom: 70,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 22,
  },

  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#191922",
  },

  save: {
    fontSize: 16,
    fontWeight: "700",
    color: "#C5399A",
  },

  previewSection: {
    alignItems: "center",
    marginBottom: 24,
  },

  previewCircle: {
    width: 150,
    height: 150,
    borderRadius: 75,
    padding: 4,
    backgroundColor: "rgba(255,255,255,0.50)",
    borderWidth: 2,
    borderColor: "#C5399A",
  },

  previewImage: {
    width: "100%",
    height: "100%",
    borderRadius: 73,
  },

  previewLabel: {
    marginTop: 10,
    fontSize: 13,
    color: "#777780",
  },

  uploadButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 50,
    borderRadius: 13,
    backgroundColor: "rgba(255,255,255,0.25)",
    borderWidth: 1,
    borderColor: "#C5399A",
    marginBottom: 28,
  },

  uploadButtonText: {
    marginLeft: 8,
    fontSize: 14,
    fontWeight: "700",
    color: "#C5399A",
  },

  sectionTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#191922",
    marginBottom: 5,
  },

  sectionSubtitle: {
    fontSize: 12,
    lineHeight: 18,
    color: "#777780",
    marginBottom: 15,
  },

  avatarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },

  avatarItem: {
    width: "30%",
    aspectRatio: 1,
    borderRadius: 16,
    marginBottom: 14,
    padding: 3,
    borderWidth: 2,
    borderColor: "transparent",
    position: "relative",
  },

  avatarItemActive: {
    borderColor: "#C5399A",
  },

  avatarImage: {
    width: "100%",
    height: "100%",
    borderRadius: 13,
  },

  check: {
    position: "absolute",
    right: 4,
    top: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#C5399A",
  },

  bottomSave: {
    minHeight: 52,
    borderRadius: 14,
    marginTop: 15,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    backgroundColor: "#C5399A",
  },

  bottomSaveDisabled: {
    opacity: 0.65,
  },

  bottomSaveText: {
    marginLeft: 8,
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});
