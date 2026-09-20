import { AppBackground } from "@/components/AppBackground";
import { Field } from "@/components/Field";
import { AVATARS } from "@/constants/avatars";

import { useAppDispatch, useAppSelector } from "@/store/hooks";

import { updateAuthUser } from "@/store/slices/authSlice";
import { updateUser } from "@/store/slices/userSlice";

import { fetchCurrentUser, saveUserProfile } from "@/store/thunks/userThunks";

import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";

import { useEffect, useState } from "react";

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

function RowSelect({
  label,
  value,
  onPress,
}: {
  label: string;
  value: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
      onPress={onPress}>
      <Text style={styles.rowLabel}>{label}</Text>

      <View style={styles.rowRight}>
        <Text style={styles.rowValue} numberOfLines={1}>
          {value}
        </Text>

        <Ionicons name="chevron-forward" size={16} color="#9C9CAA" />
      </View>
    </Pressable>
  );
}

export default function EditProfile() {
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();

  const authUser = useAppSelector((state) => state.auth.user);

  const user = useAppSelector((state) => state.user.user);

  const error = useAppSelector((state) => state.user.error);

  const email = authUser?.email || (user as any)?.email || "";

  useEffect(() => {
    if (email) {
      dispatch(fetchCurrentUser(email));
    }
  }, [dispatch, email]);

  const backendProfile = (user as any)?.profile || {};

  const backendContact = (user as any)?.contact || {};

  const firstName =
    backendProfile.firstName ||
    (user as any)?.firstName ||
    authUser?.profile?.firstName ||
    "";

  const lastName =
    backendProfile.lastName ||
    (user as any)?.lastName ||
    authUser?.profile?.lastName ||
    "";

  const username =
    backendProfile.username ||
    (user as any)?.username ||
    authUser?.profile?.username ||
    "";

  const age =
    backendProfile.age ?? (user as any)?.age ?? authUser?.profile?.age ?? null;

  const gender =
    backendProfile.gender ||
    (user as any)?.gender ||
    authUser?.profile?.gender ||
    "";

  const avatarKey =
    backendProfile.avatarKey ||
    (user as any)?.avatar ||
    authUser?.profile?.avatarKey ||
    "";

  const photo =
    backendProfile.avatarPhotoUrl ||
    (user as any)?.photo ||
    authUser?.profile?.avatarPhotoUrl ||
    null;

  const bio = backendProfile.bio || (user as any)?.bio || "";

  const category = backendProfile.category || (user as any)?.category || "";

  const contactEmail =
    backendContact.email || (user as any)?.contactEmail || email || "";

  const contactPhone = backendContact.phone || (user as any)?.phone || "";

  const businessAddress =
    backendContact.businessAddress || (user as any)?.businessAddress || "";

  const categoryDisplay = category
    ? String(category)
        .replace(/[-_]/g, " ")
        .replace(/\b\w/g, (letter: string) => letter.toUpperCase())
    : "Not selected";

  const contactItems: string[] = [];

  if (contactEmail) {
    contactItems.push("Email");
  }

  if (contactPhone) {
    contactItems.push("Phone");
  }

  if (businessAddress) {
    contactItems.push("Address");
  }

  const contactDisplay =
    contactItems.length > 0 ? contactItems.join(", ") : "Not added";

  const avatarFromList = AVATARS.find((avatar) => avatar.id === avatarKey);

  const selectedAvatar =
    avatarFromList?.source || require("@/assets/images/dp-avatar.png");

  const avatarSource = photo || selectedAvatar;

  const [form, setForm] = useState({
    displayName: "",
    username: "",
    bio: "",
  });

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fullName = `${firstName} ${lastName}`.trim();

    setForm({
      displayName: fullName,
      username,
      bio,
    });
  }, [firstName, lastName, username, bio]);

  function update(key: keyof typeof form, value: string) {
    setForm((previous) => ({
      ...previous,
      [key]: value,
    }));
  }

  async function handleSave() {
    if (!email) {
      Alert.alert("Error", "Your registration email could not be found.");
      return;
    }

    const trimmedName = form.displayName.trim();

    const trimmedUsername = form.username.trim();

    const trimmedBio = form.bio.trim();

    if (!trimmedName) {
      Alert.alert("Missing name", "Please enter your display name.");
      return;
    }

    if (!trimmedUsername) {
      Alert.alert("Missing username", "Please enter your username.");
      return;
    }

    if (trimmedUsername.length < 3 || trimmedUsername.length > 20) {
      Alert.alert("Invalid username", "Username must be 3-20 characters.");
      return;
    }

    if (!/^[a-zA-Z0-9_]+$/.test(trimmedUsername)) {
      Alert.alert(
        "Invalid username",
        "Username can only contain letters, numbers and underscore.",
      );
      return;
    }

    const nameParts = trimmedName.split(/\s+/);

    const newFirstName = nameParts.shift() || "";

    const newLastName = nameParts.join(" ");

    const currentAge = age ?? 0;

    const currentGender = gender || "";

    if (!currentAge) {
      Alert.alert("Missing age", "Your account does not have an age saved.");
      return;
    }

    if (!currentGender) {
      Alert.alert(
        "Missing gender",
        "Your account does not have a gender saved.",
      );
      return;
    }

    try {
      setSaving(true);

      const result = await dispatch(
        saveUserProfile({
          email,
          firstName: newFirstName,
          lastName: newLastName,
          username: trimmedUsername,
          age: currentAge,
          gender: currentGender,
          bio: trimmedBio,
        }),
      ).unwrap();

      dispatch(
        updateUser({
          email,
          firstName: newFirstName,
          lastName: newLastName,
          username: trimmedUsername,
          age: currentAge,
          gender: currentGender,
          bio: trimmedBio,

          profile: {
            firstName: newFirstName,
            lastName: newLastName,
            username: trimmedUsername,
            age: currentAge,
            gender: currentGender,
            bio: trimmedBio,
          },
        }),
      );

      dispatch(
        updateAuthUser({
          profile: {
            firstName: newFirstName,
            lastName: newLastName,
            username: trimmedUsername,
            age: currentAge,
            gender: currentGender,
            bio: trimmedBio,
          },
        }),
      );

      Alert.alert(
        "Profile Updated",
        "Your profile has been updated successfully.",
        [
          {
            text: "OK",
            onPress: () => router.back(),
          },
        ],
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to update your profile.";

      Alert.alert("Update Failed", message);
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
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="chevron-back" size={26} color="#191922" />
          </Pressable>

          <Text style={styles.headerTitle}>Edit Profile</Text>

          <Pressable onPress={handleSave} hitSlop={10} disabled={saving}>
            {saving ? (
              <ActivityIndicator size="small" color="#C5399A" />
            ) : (
              <Text style={styles.save}>Save</Text>
            )}
          </Pressable>
        </View>

        {error && !saving ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.avatarWrap}>
          <Image
            source={avatarSource}
            style={styles.avatar}
            contentFit="cover"
          />

          <Pressable onPress={() => router.push("/profile-photo")}>
            <Text style={styles.changePhoto}>Change Profile Photo</Text>
          </Pressable>
        </View>

        <Field
          label="Display Name"
          value={form.displayName}
          onChangeText={(text) => update("displayName", text)}
          autoCapitalize="words"
        />

        <Field
          label="Username"
          value={form.username}
          onChangeText={(text) =>
            update("username", text.replace(/[^a-zA-Z0-9_]/g, ""))
          }
          autoCapitalize="none"
        />

        <Field
          label="Bio"
          value={form.bio}
          onChangeText={(text) => update("bio", text)}
          multiline
        />

        <Text style={styles.sectionLabel}>Profile Information</Text>

        <RowSelect
          label="Category"
          value={categoryDisplay}
          onPress={() => router.push("/category")}
        />

        <RowSelect
          label="Contact options"
          value={contactDisplay}
          onPress={() => router.push("/contact-options")}
        />

        {contactEmail || contactPhone || businessAddress ? (
          <View style={styles.contactPreview}>
            {contactEmail ? (
              <View style={styles.contactLine}>
                <Ionicons name="mail-outline" size={16} color="#8A8A94" />

                <Text style={styles.contactText}>{contactEmail}</Text>
              </View>
            ) : null}

            {contactPhone ? (
              <View style={styles.contactLine}>
                <Ionicons name="call-outline" size={16} color="#8A8A94" />

                <Text style={styles.contactText}>{contactPhone}</Text>
              </View>
            ) : null}

            {businessAddress ? (
              <View style={styles.contactLine}>
                <Ionicons name="location-outline" size={16} color="#8A8A94" />

                <Text style={styles.contactText}>{businessAddress}</Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </AppBackground>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: 20,
    paddingBottom: 60,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
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

  avatarWrap: {
    alignItems: "center",
    marginTop: 8,
    marginBottom: 24,
  },

  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "rgb(204, 151, 186)",
  },

  changePhoto: {
    fontSize: 13,
    fontWeight: "600",
    color: "#C5399A",
    marginTop: 10,
  },

  sectionLabel: {
    fontSize: 13,
    fontWeight: "500",
    color: "#37373a",
    marginBottom: 10,
    marginTop: 15,
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(255,255,255,0.15)",
    borderWidth: 0.5,
    borderColor: "rgba(255,255,255,0.25)",
    borderRadius: 12,
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: {
      width: 0,
      height: 4,
    },
    elevation: 3,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 12,
  },

  rowLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: "#191922",
  },

  rowRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    maxWidth: "58%",
  },

  rowValue: {
    fontSize: 14,
    color: "#888891",
  },

  contactPreview: {
    marginTop: -4,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.10)",
  },

  contactLine: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 4,
    gap: 8,
  },

  contactText: {
    flex: 1,
    fontSize: 13,
    color: "#6F6F79",
  },

  errorBox: {
    alignItems: "center",
    marginBottom: 10,
    padding: 10,
    borderRadius: 10,
    backgroundColor: "rgba(255,80,80,0.08)",
  },

  errorText: {
    fontSize: 12,
    color: "#B42318",
  },
});
