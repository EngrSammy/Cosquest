import { AppBackground } from "@/components/AppBackground";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
      fetchCurrentUser,
      saveAvatarPhoto,
      saveUserProfile,
} from "@/store/thunks/userThunks";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
      Alert,
      Pressable,
      ScrollView,
      StyleSheet,
      Text,
      TextInput,
      View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type AccountInfoRowProps = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  editable?: boolean;
  onChangeText?: (value: string) => void;
  keyboardType?: "default" | "email-address" | "phone-pad";
};

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
        <Ionicons name={icon} size={17} color="#C5399A" />
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

  const profilePhoto = useMemo(() => {
    return photo || null;
  }, [photo]);

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
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
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

    const trimmedPhone = phone.trim();

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

  return (
    <AppBackground variant="blueGradient">
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          {
            paddingTop: insets.top + 8,
            paddingBottom: insets.bottom + 40,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            style={styles.backButton}>
            <Ionicons name="arrow-back" size={23} color="#191922" />
          </Pressable>

          <View style={styles.headerCenter}>
            <View style={styles.headerIcon}>
              <Ionicons name="person-outline" size={16} color="#C5399A" />
            </View>

            <Text style={styles.headerTitle}>Account Information</Text>
          </View>

          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.photoSection}>
          <View style={styles.photoRing}>
            <View style={styles.photoInner}>
              {profilePhoto ? (
                <Image
                  source={{ uri: profilePhoto }}
                  style={styles.profilePhoto}
                  contentFit="cover"
                />
              ) : (
                <View style={styles.emptyPhoto}>
                  <Ionicons name="person" size={42} color="#A5A5AF" />
                </View>
              )}
            </View>
          </View>

          <Pressable
            onPress={handleChangePhoto}
            disabled={saving}
            style={({ pressed }) => [
              styles.changePhotoButton,
              pressed && styles.pressed,
            ]}>
            <Text style={styles.changePhotoText}>Change Profile Photo</Text>
          </Pressable>
        </View>

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
          value="Not available"
        />

        {backendAge !== null ? (
          <View style={styles.ageNote}>
            <Ionicons
              name="information-circle-outline"
              size={18}
              color="#C5399A"
            />

            <Text style={styles.ageNoteText}>
              Your account currently stores your age ({backendAge}), not your
              date of birth.
            </Text>
          </View>
        ) : null}

        <Pressable
          onPress={handleSave}
          disabled={saving}
          style={({ pressed }) => [
            styles.saveButton,
            saving && styles.saveButtonDisabled,
            pressed && !saving && styles.pressed,
          ]}>
          <Text style={styles.saveButtonText}>
            {saving ? "Saving..." : "Save Changes"}
          </Text>
        </Pressable>
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
    marginBottom: 20,
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

  photoSection: {
    alignItems: "center",
    marginBottom: 22,
  },

  photoRing: {
    width: 86,
    height: 86,
    borderRadius: 43,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#C5399A",
  },

  photoInner: {
    width: 78,
    height: 78,
    borderRadius: 39,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EEF5F8",
  },

  profilePhoto: {
    width: "100%",
    height: "100%",
  },

  emptyPhoto: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },

  changePhotoButton: {
    marginTop: 10,
  },

  changePhotoText: {
    fontSize: 12.5,
    fontWeight: "700",
    color: "#C5399A",
  },

  infoCard: {
    minHeight: 60,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 11,
    paddingVertical: 9,
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

  infoIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 11,

    backgroundColor: "rgba(255,255,255,0.72)",
  },

  infoContent: {
    flex: 1,
  },

  infoLabel: {
    fontSize: 11.5,
    color: "#85858F",
    marginBottom: 3,
  },

  infoValue: {
    fontSize: 13.5,
    fontWeight: "700",
    color: "#202029",
  },

  infoInput: {
    padding: 0,
    margin: 0,
    fontSize: 13.5,
    fontWeight: "700",
    color: "#202029",
  },

  ageNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginTop: 4,
    marginBottom: 10,
    paddingHorizontal: 4,
  },

  ageNoteText: {
    flex: 1,
    marginLeft: 8,
    fontSize: 11,
    lineHeight: 16,
    color: "#85858F",
  },

  saveButton: {
    minHeight: 51,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    marginTop: 6,

    backgroundColor: "#C5399A",

    shadowColor: "#8EB4C8",
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: {
      width: 0,
      height: 5,
    },

    elevation: 4,
  },

  saveButtonDisabled: {
    opacity: 0.6,
  },

  saveButtonText: {
    fontSize: 13.5,
    fontWeight: "700",
    color: "#FFFFFF",
  },

  pressed: {
    opacity: 0.72,
  },
});
