import { AppBackground } from "@/components/AppBackground";
import { Button } from "@/components/Button";
import { ErrorText } from "@/components/ErrorText";
import { OnboardingProgress } from "@/components/OnboardingProgress";
import { AVATARS } from "@/constants/avatars";
import { ONBOARDING_TOTAL, STEP } from "@/constants/onboarding";
import { useOnboarding } from "@/context/OnboardingContext";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

export default function CreateProfile() {
  const useOnboardingContext = useOnboarding();
  const { data, update } = useOnboardingContext;

  const [errors, setErrors] = useState<{ [k: string]: string }>({});

  // Camera flow: ask permission, then open the camera.
  async function takePhoto() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      setErrors((e) => ({
        ...e,
        photo: "Camera access is needed to take a photo.",
      }));
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [16, 9], // banner crop
      quality: 0.8,
    });
    if (!result.canceled) {
      update({ photo: result.assets[0].uri });
      setErrors((e) => ({ ...e, photo: "" }));
    }
  }

  // Gallery flow: ask permission, then open the photo library.
  async function pickFromGallery() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setErrors((e) => ({
        ...e,
        photo: "Photo access is needed to choose a picture.",
      }));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.8,
    });
    if (!result.canceled) {
      update({ photo: result.assets[0].uri });
      setErrors((e) => ({ ...e, photo: "" }));
    }
  }

  function validate() {
    const next: { [k: string]: string } = {};
    if (!data.avatar.trim()) {
      next.avatar = "Choose an avatar";
    }
    if (!data.photo) {
      next.photo = "Upload a profile picture";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  return (
    <AppBackground variant="gradient">
      <ScrollView contentContainerStyle={styles.scroll}>
        <OnboardingProgress
          step={STEP.uploadPicture}
          total={ONBOARDING_TOTAL}
        />
        <Text style={styles.headline}>Upload Profile Picture</Text>
        <Text style={styles.profileLabel}>
          <Text>Profile Picture </Text>
          <Text style={styles.hint}>· take a photo or pick an avatar</Text>
        </Text>

        {/* Camera / gallery */}
        <View style={styles.photoRow}>
          <View style={styles.photoBtns}>
            <Pressable style={styles.takePhotoBtn} onPress={takePhoto}>
              <Ionicons name="camera" size={18} color="#C5399A" />
              <Text style={styles.takePhotoText}>Take photo</Text>
            </Pressable>
            <Pressable style={styles.rollBtn} onPress={pickFromGallery}>
              <Text style={styles.rollText}>Choose from camera roll</Text>
            </Pressable>
          </View>
          {data.photo ? (
            <Ionicons name="checkmark-circle" size={32} color="#1FA85A" />
          ) : null}
        </View>

        {data.photo ? (
          <Image
            source={{ uri: data.photo }}
            style={styles.preview}
            contentFit="cover"
          />
        ) : null}
        <ErrorText>{errors.photo}</ErrorText>

        <View style={styles.grid}>
          {AVATARS.map((a) => (
            <Pressable
              key={a.id}
              style={[
                styles.avatar,
                data.avatar === a.id && styles.avatarActive,
              ]}
              onPress={() => update({ avatar: a.id })}
            >
              <Image
                source={a.source}
                style={styles.avatarImg}
                contentFit="cover"
              />
            </Pressable>
          ))}
        </View>
        <ErrorText>{errors.avatar}</ErrorText>

        <View style={{ marginTop: 80 }}>
          <Button
            label="Continue"
            variant="brand"
            onPress={() => {
              if (validate()) router.push("/onboarding/interests");
            }}
          />
        </View>
      </ScrollView>
    </AppBackground>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 24, paddingBottom: 80 },
  headline: {
    fontSize: 35,
    fontWeight: "800",
    textAlign: "center",
    color: "#191922",
    marginTop: 20,
  },
  photoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    marginBottom: 14,
  },
  photoBtns: { gap: 10, alignItems: "center" },
  takePhotoBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderWidth: 0.2,
    borderColor: "rgba(255,255,255,0.6)",
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
    borderRadius: 22,
    paddingHorizontal: 22,
    paddingVertical: 11,
  },
  takePhotoText: { color: "#191922", fontSize: 15, fontWeight: "600" },
  rollBtn: {
    backgroundColor: "rgba(255,255,255,0.15)",
    borderWidth: 0.2,
    borderColor: "rgba(255,255,255,0.6)",
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
    borderRadius: 22,
    paddingHorizontal: 22,
    paddingVertical: 11,
  },
  rollText: { color: "#191922", fontSize: 15, fontWeight: "600" },
  preview: {
    width: "100%",
    height: 150,
    borderRadius: 16,
    marginBottom: 10,
    backgroundColor: "#EEE",
  },

  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  avatar: {
    width: "18%",
    aspectRatio: 1,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(150,150,160,0.30)",
  },
  avatarActive: { borderColor: "#C5399A", borderWidth: 2 },
  avatarImg: { width: "100%", height: "100%", transform: [{ scale: 1.12 }] },
  profileLabel: {
    textAlign: "center",
    fontSize: 15,
    color: "#000",
    fontWeight: "700",
    marginTop: 10,
    marginBottom: 20,
  },
  hint: {
    fontWeight: "500",
    color: "#4c4c4d",
    fontSize: 14,
  },
});
