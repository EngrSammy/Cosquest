import { AVATARS } from "@/constants/avatars";
import { FONTS } from "@/constants/fonts";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  fetchCurrentUser,
  saveAvatarPhoto,
  saveUserProfile,
} from "@/store/thunks/userThunks";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const PINK = "#C34D9C";

type AccountInfoRowProps = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  editable?: boolean;
  onChangeText?: (value: string) => void;
  keyboardType?: "default" | "email-address" | "phone-pad";
};

// Figma row: milky card, pink icon on a soft pink circle, small grey label,
// bold value.
function AccountInfoRow({
  icon,
  label,
  value,
  editable = false,
  onChangeText,
  keyboardType = "default",
}: AccountInfoRowProps) {
  return (
    <View style={styles.infoCard}>
      <View style={styles.infoIcon}>
        <Ionicons name={icon} size={15} color={PINK} />
      </View>

      <View style={styles.infoContent}>
        <Text style={styles.infoLabel}>{label}</Text>

        {editable ? (
          <TextInput
            value={value}
            onChangeText={onChangeText}
            style={styles.infoInput}
            keyboardType={keyboardType}
            autoCapitalize={
              keyboardType === "email-address" ? "none" : "sentences"
            }
            placeholder={`Enter ${label.toLowerCase()}`}
            placeholderTextColor="#A0A0AA"
          />
        ) : (
          <Text style={styles.infoValue}>{value || "Not provided"}</Text>
        )}
      </View>
    </View>
  );
}

export default function AccountInformation() {
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();

  const authUser = useAppSelector((state) => state.auth.user);

  const user = useAppSelector((state) => state.user.user);

  const email = authUser?.email || user?.email || "";

  const firstName =
    user?.profile?.firstName ||
    user?.firstName ||
    authUser?.profile?.firstName ||
    "";

  const lastName =
    user?.profile?.lastName ||
    user?.lastName ||
    authUser?.profile?.lastName ||
    "";

  const backendUsername =
    user?.profile?.username ||
    user?.username ||
    authUser?.profile?.username ||
    "";

  const backendPhone = user?.contact?.phone || "";

  const backendAge =
    user?.profile?.age ?? user?.age ?? authUser?.profile?.age ?? null;

  const backendPhoto =
    user?.profile?.avatarPhotoUrl || authUser?.profile?.avatarPhotoUrl || null;

  const avatarKey =
    user?.profile?.avatarKey || authUser?.profile?.avatarKey || "";

  const [displayName, setDisplayName] = useState("");

  const [username, setUsername] = useState("");

  const [phone, setPhone] = useState("");

  const [saving, setSaving] = useState(false);

  const [photo, setPhoto] = useState<string | null>(null);

  useEffect(() => {
    if (email) {
      dispatch(fetchCurrentUser(email));
    }
  }, [dispatch, email]);

  useEffect(() => {
    const fullName = `${firstName} ${lastName}`.trim();

    setDisplayName(fullName);
  }, [firstName, lastName]);

  useEffect(() => {
    setUsername(backendUsername);
  }, [backendUsername]);

  useEffect(() => {
    setPhone(backendPhone);
  }, [backendPhone]);

  useEffect(() => {
    setPhoto(backendPhoto);
  }, [backendPhoto]);

  // Figma: your avatar character in the pink ring (a just-picked photo, or
  // your photo if you have no avatar, otherwise).
  const avatarSource = useMemo(() => {
    if (photo && photo !== backendPhoto) {
      return { uri: photo };
    }

    const preset = AVATARS.find((avatar) => avatar.id === avatarKey);

    if (preset?.source) {
      return preset.source;
    }

    if (photo) {
      return { uri: photo };
    }

    return null;
  }, [photo, backendPhoto, avatarKey]);

  async function handleChangePhoto() {
    if (!email) {
      Alert.alert("Error", "Your account information could not be loaded.");

      return;
    }

    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        Alert.alert(
          "Permission Required",
          "Please allow photo library access to change your profile photo.",
        );

        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }

      const selectedUri = result.assets[0].uri;

      setPhoto(selectedUri);
      setSaving(true);

      await dispatch(
        saveAvatarPhoto({
          email,
          photoUri: selectedUri,
        }),
      ).unwrap();

      await dispatch(fetchCurrentUser(email)).unwrap();

      Alert.alert(
        "Profile Photo Updated",
        "Your profile photo has been updated successfully.",
      );
    } catch (error) {
      setPhoto(backendPhoto);

      Alert.alert(
        "Unable to Update Photo",
        error instanceof Error
          ? error.message
          : "We could not update your profile photo.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleSave() {
    if (!email) {
      Alert.alert("Error", "Your account email could not be found.");

      return;
    }

    const trimmedName = displayName.trim();

    const trimmedUsername = username.trim();

    if (!trimmedName) {
      Alert.alert("Missing Display Name", "Please enter your display name.");

      return;
    }

    if (!trimmedUsername) {
      Alert.alert("Missing Username", "Please enter your username.");

      return;
    }

    const nameParts = trimmedName.split(/\s+/);

    const newFirstName = nameParts.shift() || "";

    const newLastName = nameParts.join(" ");

    const currentGender =
      user?.profile?.gender || user?.gender || authUser?.profile?.gender || "";

    if (backendAge === null || !Number.isFinite(backendAge)) {
      Alert.alert(
        "Missing Age",
        "Your account does not have an age saved yet.",
      );

      return;
    }

    if (!currentGender) {
      Alert.alert(
        "Missing Gender",
        "Your account does not have a gender saved yet.",
      );

      return;
    }

    try {
      setSaving(true);

      await dispatch(
        saveUserProfile({
          email,
          firstName: newFirstName,
          lastName: newLastName,
          username: trimmedUsername,
          age: backendAge,
          gender: currentGender,
        }),
      ).unwrap();

      await dispatch(fetchCurrentUser(email)).unwrap();

      Alert.alert(
        "Changes Saved",
        "Your account information has been updated successfully.",
        [
          {
            text: "OK",
            onPress: () => router.back(),
          },
        ],
      );
    } catch (error) {
      Alert.alert(
        "Unable to Save",
        error instanceof Error
          ? error.message
          : "We could not update your account information.",
      );
    } finally {
      setSaving(false);
    }
  }

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/settings");
    }
  };

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
        contentContainerStyle={[
          styles.scroll,
          {
            paddingTop: insets.top + 10,
            paddingBottom: insets.bottom + 40,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        {/* HEADER (Figma: pink icon on the left - tap it to go back) */}
        <View style={styles.header}>
          <Pressable
            onPress={goBack}
            hitSlop={10}
            style={styles.headerIcon}
            accessibilityRole="button"
            accessibilityLabel="Back">
            <Ionicons name="person-outline" size={16} color={PINK} />
          </Pressable>

          <Text style={styles.headerTitle}>Account Information</Text>

          <View style={styles.headerSpacer} />
        </View>

        {/* PHOTO in a pink ring */}
        <View style={styles.photoSection}>
          <View style={styles.photoRing}>
            <View style={styles.photoInner}>
              {avatarSource ? (
                <Image
                  source={avatarSource}
                  style={styles.profilePhoto}
                  contentFit="cover"
                />
              ) : (
                <Ionicons name="person" size={38} color="#A5A5AF" />
              )}
            </View>
          </View>

          <Pressable onPress={handleChangePhoto} disabled={saving} hitSlop={8}>
            <Text style={styles.changePhotoText}>Change Profile Photo</Text>
          </Pressable>
        </View>

        {/* ROWS (Figma: 362 wide, gap 12) */}
        <View style={styles.list}>
          <AccountInfoRow
            icon="person-outline"
            label="Display Name"
            value={displayName}
            editable
            onChangeText={setDisplayName}
          />

          <AccountInfoRow
            icon="at-outline"
            label="Username"
            value={username}
            editable
            onChangeText={setUsername}
          />

          <AccountInfoRow
            icon="mail-outline"
            label="Email Address"
            value={email}
          />

          <AccountInfoRow
            icon="call-outline"
            label="Phone Number"
            value={phone}
            editable
            onChangeText={setPhone}
            keyboardType="phone-pad"
          />

          <AccountInfoRow
            icon="calendar-outline"
            label="Date of Birth"
            value={
              backendAge !== null && Number.isFinite(backendAge)
                ? `${backendAge} years old`
                : "Not available"
            }
          />
        </View>

        {/* SAVE (Figma: #C34D9C, 362 x 56, padding 16, radius 20,
            shadow 0 4 10 #0000000D) */}
        <Pressable
          onPress={handleSave}
          disabled={saving}
          style={({ pressed }) => [
            styles.saveButton,
            saving && styles.saveButtonDisabled,
            pressed && !saving && styles.pressed,
          ]}>
          {saving ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.saveButtonText}>Save Changes</Text>
          )}
        </Pressable>
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
    marginBottom: 14,
  },

  // Pink icon on a soft pink circle.
  headerIcon: {
    // Figma: 35 x 36, radius 100, padding 8, background #0000000A
    width: 35,
    height: 36,
    borderRadius: 100,
    padding: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0000000A",
  },

  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontFamily: FONTS.semibold,
    fontSize: 17,
    color: "#191922",
  },

  headerSpacer: {
    width: 35,
  },

  photoSection: {
    alignItems: "center",
    gap: 10,
    marginBottom: 22,
  },

  photoRing: {
    width: 90,
    height: 90,
    borderRadius: 45,
    padding: 3,
    borderWidth: 2,
    borderColor: PINK,
    backgroundColor: "transparent",
  },

  photoInner: {
    flex: 1,
    borderRadius: 40,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    // Figma: see-through - the page's own background shows behind the avatar.
    backgroundColor: "transparent",
  },

  profilePhoto: {
    width: "100%",
    height: "100%",
  },

  changePhotoText: {
    fontFamily: FONTS.semibold,
    fontSize: 13,
    color: PINK,
  },

  // Figma: 362 x 317, gap 12
  list: {
    gap: 12,
  },

  // Milky pressed-in card.
  infoCard: {
    minHeight: 60,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
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

  // Pink icon on a soft pink circle.
  infoIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(195,77,156,0.12)",
  },

  infoContent: {
    flex: 1,
  },

  infoLabel: {
    fontFamily: FONTS.regular,
    fontSize: 11.5,
    color: "#7A7A84",
    marginBottom: 1,
  },

  infoValue: {
    fontFamily: FONTS.semibold,
    fontSize: 14,
    color: "#191922",
  },

  infoInput: {
    padding: 0,
    margin: 0,
    fontFamily: FONTS.semibold,
    fontSize: 14,
    color: "#191922",
    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null),
  },

  // Figma: #C34D9C, 56 tall, padding 16, radius 20, shadow 0 4 10 #0000000D
  saveButton: {
    minHeight: 56,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
    marginTop: 20,
    backgroundColor: PINK,

    shadowColor: "#000000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },

  saveButtonDisabled: {
    opacity: 0.6,
  },

  saveButtonText: {
    fontFamily: FONTS.semibold,
    fontSize: 15,
    color: "#FFFFFF",
  },

  pressed: {
    opacity: 0.8,
  },
});
