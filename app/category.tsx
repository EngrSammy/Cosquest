import { PinkSwitch } from "@/components/ui/PinkSwitch";
import { FONTS } from "@/constants/fonts";
import { getProfileCategories, type ProfileCategory } from "@/services/user";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { updateAuthUser } from "@/store/slices/authSlice";
import { updateUser } from "@/store/slices/userSlice";
import { saveUserCategory } from "@/store/thunks/userThunks";
import { safeBack } from "@/utils/safeBack";

import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
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

export default function Category() {
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();

  const authUser = useAppSelector((state) => state.auth.user);
  const user = useAppSelector((state) => state.user.user);
  const token = useAppSelector((state) => state.auth.token);
  const saving = useAppSelector((state) => state.user.loading);

  const email = authUser?.email || (user as any)?.email || "";

  const profile = (user as any)?.profile || {};
  const currentCategory: string = profile.category || "";
  const currentDisplay: boolean = profile.showCategoryOnProfile ?? true;

  const [categories, setCategories] = useState<ProfileCategory[]>([]);
  const [selected, setSelected] = useState(currentCategory);
  const [displayOnProfile, setDisplayOnProfile] = useState(currentDisplay);
  const [query, setQuery] = useState("");
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    setSelected(currentCategory);
    setDisplayOnProfile(currentDisplay);
  }, [currentCategory, currentDisplay]);

  // GET /api/meta/profile-categories (was a thunk that didn't exist).
  const loadCategories = async () => {
    try {
      setLoadingCategories(true);
      setLoadError(null);

      const result = await getProfileCategories();

      setCategories(result?.categories || []);
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "Could not load categories.",
      );
    } finally {
      setLoadingCategories(false);
    }
  };

  useEffect(() => {
    void loadCategories();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    if (!q) {
      return categories;
    }

    return categories.filter((category) =>
      category.name.toLowerCase().includes(q),
    );
  }, [categories, query]);

  async function handleDone() {
    if (!email) {
      Alert.alert("Error", "Your account email could not be found.");
      return;
    }

    if (!selected) {
      Alert.alert("Select a category", "Please select a category.");
      return;
    }

    try {
      const result = await dispatch(
        saveUserCategory({
          email,
          category: selected,
          showCategoryOnProfile: displayOnProfile,
          token: token || undefined,
        }),
      ).unwrap();

      const returnedUser = (result as any)?.user || result;
      const returnedProfile = returnedUser?.profile || {};

      const savedKey = returnedProfile.category || selected;
      const savedDisplay =
        returnedProfile.showCategoryOnProfile ?? displayOnProfile;

      dispatch(
        updateUser({
          profile: {
            category: savedKey,
            showCategoryOnProfile: savedDisplay,
          },
          category: savedKey,
          showCategoryOnProfile: savedDisplay,
        }),
      );

      dispatch(
        updateAuthUser({
          profile: {
            category: savedKey,
            showCategoryOnProfile: savedDisplay,
          },
        }),
      );

      safeBack("/edit-profile");
    } catch (error) {
      Alert.alert(
        "Category update failed",
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Unable to save category.",
      );
    }
  }

  const busy = saving || loadingCategories;

  return (
    <View style={styles.screen}>
      {/* Same background as the Figma screens */}
      <LinearGradient
        colors={["#FFFFFF", "#E1F3FF"]}
        locations={[0, 0.6442]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* HEADER: back, title, Done */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Pressable
          onPress={() => safeBack("/edit-profile")}
          hitSlop={10}
          style={styles.headerSide}
          accessibilityRole="button"
          accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={24} color="#191922" />
        </Pressable>

        <Text style={styles.headerTitle}>Category</Text>

        <Pressable
          onPress={handleDone}
          hitSlop={10}
          disabled={busy}
          style={[styles.headerSide, styles.headerRight]}
          accessibilityRole="button"
          accessibilityLabel="Done">
          {saving ? (
            <ActivityIndicator size="small" color={PINK} />
          ) : (
            <Text style={[styles.done, busy && styles.doneOff]}>Done</Text>
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
        <Text style={styles.title}>What best describes you?</Text>

        <Text style={styles.subtitle}>
          Categories help people find profiles like yours. You can change this
          at any time.
        </Text>

        {/* Display on profile */}
        <View style={styles.row}>
          <View style={styles.rowIcon}>
            <Ionicons name="eye-outline" size={15} color={PINK} />
          </View>

          <Text style={[styles.rowLabel, styles.flex]}>Display on profile</Text>

          <PinkSwitch value={displayOnProfile} onChange={setDisplayOnProfile} />
        </View>

        {/* Search */}
        <View style={[styles.row, styles.searchRow]}>
          <Ionicons name="search" size={18} color={PINK} />

          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search categories"
            placeholderTextColor="#9C9CAA"
            autoCapitalize="none"
            autoCorrect={false}
          />

          {query ? (
            <Pressable onPress={() => setQuery("")} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color="#9C9CAA" />
            </Pressable>
          ) : null}
        </View>

        <Text style={styles.sectionLabel}>SUGGESTED</Text>

        {loadingCategories ? (
          <View style={styles.stateBox}>
            <ActivityIndicator color={PINK} />
            <Text style={styles.stateText}>Loading categories...</Text>
          </View>
        ) : loadError ? (
          <View style={styles.stateBox}>
            <Ionicons name="cloud-offline-outline" size={30} color="#9C9CAA" />
            <Text style={styles.stateText}>{loadError}</Text>

            <Pressable style={styles.retry} onPress={loadCategories}>
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        ) : filtered.length === 0 ? (
          <View style={styles.stateBox}>
            <Text style={styles.stateText}>
              {query.trim()
                ? "No categories match your search."
                : "No categories yet."}
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            {filtered.map((category) => {
              const active = category.key === selected;

              return (
                <Pressable
                  key={category.key}
                  style={({ pressed }) => [
                    styles.row,
                    active && styles.rowActive,
                    pressed && styles.pressed,
                  ]}
                  onPress={() => setSelected(category.key)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}>
                  <Text style={[styles.rowLabel, styles.flex]}>
                    {category.name}
                  </Text>

                  <Ionicons
                    name={active ? "radio-button-on" : "radio-button-off"}
                    size={22}
                    color={active ? PINK : "#9C9CAA"}
                  />
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

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

  done: {
    fontFamily: FONTS.medium,
    fontSize: 15,
    color: PINK,
  },

  doneOff: {
    opacity: 0.5,
  },

  scroll: {
    paddingHorizontal: 20,
    paddingTop: 10,
    width: "100%",
    maxWidth: 640,
    alignSelf: "center",
  },

  title: {
    fontFamily: FONTS.bold,
    fontSize: 22,
    color: "#191922",
  },

  subtitle: {
    marginTop: 6,
    marginBottom: 20,
    fontFamily: FONTS.regular,
    fontSize: 13.5,
    lineHeight: 20,
    color: "#6F6F79",
  },

  // Milky pressed-in row.
  row: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
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

  rowActive: {
    borderColor: PINK,
    backgroundColor: "rgba(195,77,156,0.08)",
  },

  // Figma: 34 x 34, radius 100, padding 8, soft pink.
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: 100,
    padding: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(195,77,156,0.12)",
  },

  rowLabel: {
    fontFamily: FONTS.regular,
    fontSize: 14.5,
    color: "#191922",
  },

  searchRow: {
    marginTop: 12,
    gap: 10,
    paddingVertical: 0,
  },

  searchInput: {
    flex: 1,
    minWidth: 0,
    height: 50,
    fontFamily: FONTS.regular,
    fontSize: 14.5,
    color: "#191922",
    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null),
  },

  sectionLabel: {
    marginTop: 22,
    marginBottom: 12,
    fontFamily: FONTS.medium,
    fontSize: 11,
    letterSpacing: 0.4,
    color: "#7A7A84",
  },

  list: {
    gap: 12,
  },

  stateBox: {
    alignItems: "center",
    paddingVertical: 30,
    gap: 8,
  },

  stateText: {
    fontFamily: FONTS.regular,
    fontSize: 13,
    color: "#6F6F79",
    textAlign: "center",
  },

  retry: {
    marginTop: 4,
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: PINK,
  },

  retryText: {
    fontFamily: FONTS.semibold,
    fontSize: 13,
    color: "#FFFFFF",
  },

  pressed: {
    opacity: 0.75,
  },
});
