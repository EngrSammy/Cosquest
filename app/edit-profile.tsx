// ==========================================
// EDIT PROFILE (Figma)
// ==========================================
// Photo (131 x 131 on a pink circle) + "Change Profile Photo", then
// Display Name / Username / Bio in milky pressed-in fields, then
// Profile Information: Category (plain row) and Contact options.
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AVATARS } from "@/constants/avatars";
import { FONTS } from "@/constants/fonts";
import { updateProfile } from "@/services/user";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { updateAuthUser } from "@/store/slices/authSlice";
import { updateUser } from "@/store/slices/userSlice";
import { safeBack } from "@/utils/safeBack";

const PINK = "#C34D9C";

// "digital-creator" -> "Digital creator"
function humanize(value?: string | null) {
  if (!value) {
    return "";
  }

  const text = String(value).replace(/[-_]+/g, " ").trim();

  return text.charAt(0).toUpperCase() + text.slice(1);
}

export default function EditProfile() {
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();

  const token = useAppSelector((state) => state.auth.token);
  const authUser = useAppSelector((state) => state.auth.user);
  const user = useAppSelector((state) => state.user.user) as any;

  const profile = user?.profile || authUser?.profile || {};
  const email = authUser?.email || user?.email || "";

  const startName =
    `${profile.firstName || ""} ${profile.lastName || ""}`.trim();
  const startUsername = profile.username || "";
  const startBio = profile.bio || "";

  const [displayName, setDisplayName] = useState(startName);
  const [username, setUsername] = useState(startUsername);
  const [bio, setBio] = useState(startBio);
  const [saving, setSaving] = useState(false);

  // Fill the fields once the profile arrives (e.g. after a refresh).
  const loadedKey = `${startName}|${startUsername}|${startBio}`;

  useEffect(() => {
    setDisplayName(startName);
    setUsername(startUsername);
    setBio(startBio);
    // Only when the saved profile itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedKey]);

  const photo = profile.avatarPhotoUrl || null;

  // Figma: your AVATAR character on the pink circle (your photo is shown on
  // the Profile screen). The photo is only used if no avatar is chosen.
  const avatarSource = useMemo(() => {
    const preset = AVATARS.find((avatar) => avatar.id === profile.avatarKey);

    if (preset?.source) {
      return preset.source;
    }

    if (photo) {
      return { uri: photo };
    }

    return require("@/assets/images/dp-avatar.png");
  }, [photo, profile.avatarKey]);

  const category = humanize(profile.category);

  const contact = user?.contact || (authUser as any)?.contact || {};

  const contactSummary =
    [
      contact.email ? "Email" : "",
      contact.phone ? "Phone" : "",
      contact.businessAddress ? "Address" : "",
    ]
      .filter(Boolean)
      .join(", ") || "Add";

  const changed =
    displayName.trim() !== startName ||
    username.trim() !== startUsername ||
    bio.trim() !== startBio;

  const goBack = () => {
    if (router.canGoBack()) {
      safeBack();
    } else {
      router.replace("/profile");
    }
  };

  const save = async () => {
    if (saving) {
      return;
    }

    if (!changed) {
      goBack();
      return;
    }

    const name = displayName.trim();
    const handle = username.trim().replace(/^@/, "");

    if (!name) {
      Alert.alert("Edit Profile", "Please enter your display name.");
      return;
    }

    if (!handle) {
      Alert.alert("Edit Profile", "Please enter a username.");
      return;
    }

    // "Alex Rivera" -> first "Alex", last "Rivera"
    const [firstName, ...rest] = name.split(/\s+/);
    const lastName = rest.join(" ");

    try {
      setSaving(true);

      await updateProfile(
        {
          email,
          firstName,
          lastName,
          username: handle,
          age: profile.age,
          gender: profile.gender,
          bio: bio.trim(),
        },
        token || undefined,
      );

      const changes = {
        firstName,
        lastName,
        username: handle,
        bio: bio.trim(),
      };

      dispatch(updateUser({ profile: { ...profile, ...changes } } as any));
      dispatch(updateAuthUser({ profile: changes }));

      goBack();
    } catch (error) {
      Alert.alert(
        "Edit Profile",
        error instanceof Error ? error.message : "Could not save your profile.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.screen}>
      {/* Figma background:
          linear-gradient(180deg, rgba(255,255,255,0.6) 4.59%,
                                  rgba(184,232,255,0.6) 67.7%) on white */}
      <LinearGradient
        colors={["rgba(255,255,255,0.6)", "rgba(184,232,255,0.6)"]}
        locations={[0.0459, 0.677]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {/* HEADER */}
        <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
          <Pressable
            onPress={goBack}
            hitSlop={10}
            style={styles.headerSide}
            accessibilityRole="button"
            accessibilityLabel="Back">
            <Ionicons name="chevron-back" size={24} color="#191922" />
          </Pressable>

          <Text style={styles.headerTitle}>Edit Profile</Text>

          <Pressable
            onPress={save}
            hitSlop={10}
            disabled={saving}
            style={[styles.headerSide, styles.headerRight]}
            accessibilityRole="button"
            accessibilityLabel="Save">
            {saving ? (
              <ActivityIndicator size="small" color={PINK} />
            ) : (
              <Text style={styles.save}>Save</Text>
            )}
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            { paddingBottom: insets.bottom + 40 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          {/* PHOTO (Figma: 209 tall, padding 24 / 24, gap 12) */}
          <View style={styles.photoSection}>
            <Pressable
              style={styles.avatarCircle}
              onPress={() => router.push("/profile-photo")}
              accessibilityRole="button"
              accessibilityLabel="Change profile photo">
              <Image
                source={avatarSource}
                style={styles.avatarImage}
                contentFit="cover"
                transition={150}
              />
            </Pressable>

            <Pressable
              onPress={() => router.push("/profile-photo")}
              hitSlop={8}>
              <Text style={styles.changePhoto}>Change Profile Photo</Text>
            </Pressable>
          </View>

          {/* FORM (Figma: 402 wide, padding 20 / 20, gap 20 between every part) */}
          <View style={styles.form}>
            <View style={styles.group}>
              <Text style={styles.label}>Display Name</Text>
              <TextInput
                value={displayName}
                onChangeText={setDisplayName}
                style={[styles.field, styles.input]}
                placeholder="Your name"
                placeholderTextColor="#9C9CAA"
                autoCapitalize="words"
              />
            </View>

            <View style={styles.group}>
              <Text style={styles.label}>Username</Text>
              <TextInput
                value={username}
                onChangeText={setUsername}
                style={[styles.field, styles.input]}
                placeholder="username"
                placeholderTextColor="#9C9CAA"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <View style={styles.group}>
              <Text style={styles.label}>Bio</Text>
              <TextInput
                value={bio}
                onChangeText={setBio}
                style={[styles.field, styles.input, styles.bioInput]}
                placeholder="Tell people about yourself"
                placeholderTextColor="#9C9CAA"
                multiline
                maxLength={300}
                textAlignVertical="top"
              />
            </View>

            {/* PROFILE INFORMATION */}
            <View style={styles.group}>
              <Text style={styles.label}>Profile Information</Text>

              {/* Category: a plain row (no box), like the Figma */}
              <Pressable
                style={styles.plainRow}
                onPress={() => router.push("/category")}
                accessibilityRole="button">
                <Text style={styles.rowTitle}>Category</Text>

                <View style={styles.rowRight}>
                  <Text style={styles.rowValue} numberOfLines={1}>
                    {category || "Not selected"}
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color="#8A8A93" />
                </View>
              </Pressable>
            </View>

            {/* Contact options: milky box */}
            <Pressable
              style={[styles.field, styles.boxRow]}
              onPress={() => router.push("/contact-options")}
              accessibilityRole="button">
              <Text style={styles.rowTitle}>Contact options</Text>

              <View style={styles.rowRight}>
                <Text style={styles.rowValue} numberOfLines={1}>
                  {contactSummary}
                </Text>
                <Ionicons name="chevron-forward" size={16} color="#8A8A93" />
              </View>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// Figma input: 362 x 51, background #0000000D, radius 14, padding 14,
// box-shadow 0 4 4 #00000017 - plus the milky white rim we use elsewhere.
const MILKY_FIELD = {
  minHeight: 51,
  paddingHorizontal: 14,
  paddingVertical: 14,
  borderRadius: 14,
  backgroundColor: "#0000000D",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.75)",

  shadowColor: "#000000",
  shadowOpacity: 0.09,
  shadowRadius: 4,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2,
} as const;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },

  flex: {
    flex: 1,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 6,
    width: "100%",
    maxWidth: 640,
    alignSelf: "center",
  },

  headerSide: {
    width: 60,
    height: 36,
    justifyContent: "center",
  },

  headerRight: {
    alignItems: "flex-end",
  },

  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontFamily: FONTS.semibold,
    fontSize: 18,
    color: "#000000",
  },

  save: {
    fontFamily: FONTS.medium,
    fontSize: 15,
    color: PINK,
  },

  scroll: {
    // The form below adds the Figma's 20 left / right.
    width: "100%",
    maxWidth: 640,
    alignSelf: "center",
  },

  // Figma: 402 wide, padding 20 / 20, gap 20 between every part.
  form: {
    paddingHorizontal: 20,
    gap: 20,
  },

  // A label with its field.
  group: {},

  // Figma: 402 x 209, padding 24 / 24, gap 12
  photoSection: {
    minHeight: 209,
    paddingTop: 24,
    paddingBottom: 24,
    gap: 12,
    alignItems: "center",
    justifyContent: "center",
  },

  // Figma: 131 x 131 on a pink circle
  avatarCircle: {
    width: 131,
    height: 131,
    borderRadius: 66,
    overflow: "hidden",
    backgroundColor: "#E7A3D2",

    shadowColor: PINK,
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },

  avatarImage: {
    width: "100%",
    height: "100%",
  },

  changePhoto: {
    fontFamily: FONTS.medium,
    fontSize: 14,
    color: PINK,
  },

  label: {
    marginBottom: 8,
    fontFamily: FONTS.medium,
    fontSize: 12,
    color: "#7A7A84",
  },

  sectionLabel: {
    marginTop: 0,
  },

  field: MILKY_FIELD,

  input: {
    fontFamily: FONTS.regular,
    fontSize: 14.5,
    color: "#191922",
    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null),
  },

  bioInput: {
    minHeight: 96,
    lineHeight: 22,
  },

  // Category: plain row (no box)
  plainRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 4,
  },

  boxRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  rowTitle: {
    fontFamily: FONTS.medium,
    fontSize: 15,
    color: "#191922",
  },

  rowRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 1,
    marginLeft: 12,
  },

  rowValue: {
    fontFamily: FONTS.regular,
    fontSize: 13.5,
    color: "#8A8A93",
    flexShrink: 1,
  },
});
