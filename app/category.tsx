import { AppBackground } from "@/components/AppBackground";

import { useAppDispatch, useAppSelector } from "@/store/hooks";

import {
  fetchProfileCategories,
  saveUserCategory,
} from "@/store/thunks/userThunks";

import { updateAuthUser } from "@/store/slices/authSlice";

import { updateUser } from "@/store/slices/userSlice";

import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import { useEffect, useMemo, useState } from "react";

import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";

import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function Category() {
  const insets = useSafeAreaInsets();

  const dispatch = useAppDispatch();

  const authUser = useAppSelector((state) => state.auth.user);

  const user = useAppSelector((state) => state.user.user);

  const loading = useAppSelector((state) => state.user.loading);

  const email = authUser?.email || (user as any)?.email || "";

  const profile = (user as any)?.profile || {};

  const currentCategory = profile.category || "";

  const currentDisplay = profile.showCategoryOnProfile ?? true;

  const [categories, setCategories] = useState<
    {
      key: string;
      name: string;
    }[]
  >([]);

  const [selected, setSelected] = useState(currentCategory);

  const [displayOnProfile, setDisplayOnProfile] = useState(currentDisplay);

  const [query, setQuery] = useState("");

  const [loadingCategories, setLoadingCategories] = useState(true);

  useEffect(() => {
    setSelected(currentCategory);

    setDisplayOnProfile(currentDisplay);
  }, [currentCategory, currentDisplay]);

  useEffect(() => {
    async function loadCategories() {
      try {
        setLoadingCategories(true);

        const result = await dispatch(fetchProfileCategories()).unwrap();

        console.log("PROFILE CATEGORIES:", result);

        setCategories(result.categories || []);
      } catch (error) {
        Alert.alert(
          "Unable to load categories",
          error instanceof Error
            ? error.message
            : "Could not load profile categories.",
        );
      } finally {
        setLoadingCategories(false);
      }
    }

    loadCategories();
  }, [dispatch]);

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
      Alert.alert("Error", "Your registration email could not be found.");

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
        }),
      ).unwrap();

      console.log("CATEGORY RESULT:", result);

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

      router.back();
    } catch (error) {
      Alert.alert(
        "Category update failed",
        error instanceof Error ? error.message : "Unable to save category.",
      );
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
        keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="chevron-back" size={26} color="#191922" />
          </Pressable>

          <Pressable
            onPress={handleDone}
            hitSlop={10}
            disabled={loading || loadingCategories}>
            {loading || loadingCategories ? (
              <ActivityIndicator size="small" color="#C5399A" />
            ) : (
              <Text style={styles.done}>Done</Text>
            )}
          </Pressable>
        </View>

        <Text style={styles.title}>What best describes you?</Text>

        <Text style={styles.subtitle}>
          Categories help people find profiles like yours. You can change this
          at any time.
        </Text>

        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>Display on profile</Text>

          <Switch
            value={displayOnProfile}
            onValueChange={setDisplayOnProfile}
            trackColor={{
              true: "#C5399A",
              false: "#ffffff26",
            }}
            thumbColor="#ffffff"
          />
        </View>

        <View style={styles.searchRow}>
          <Ionicons name="search" size={18} color="#C5399A" />

          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search categories"
            placeholderTextColor="#87878f"
            autoCapitalize="none"
          />
        </View>

        <Text style={styles.sectionLabel}>Suggested</Text>

        {loadingCategories ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color="#C5399A" />

            <Text style={styles.loadingText}>Loading categories...</Text>
          </View>
        ) : (
          filtered.map((category) => {
            const active = category.key === selected;

            return (
              <Pressable
                key={category.key}
                style={({ pressed }) => [
                  styles.row,
                  pressed && {
                    opacity: 0.7,
                  },
                ]}
                onPress={() => setSelected(category.key)}>
                <Text style={styles.rowLabel}>{category.name}</Text>

                <Ionicons
                  name={active ? "radio-button-on" : "radio-button-off"}
                  size={22}
                  color={active ? "#C5399A" : "#89898f"}
                />
              </Pressable>
            );
          })
        )}
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

  done: {
    fontSize: 16,
    fontWeight: "700",
    color: "#C5399A",
  },

  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#191922",
    marginTop: 10,
  },

  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: "#6F6F79",
    marginTop: 8,
    marginBottom: 20,
  },

  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
  },

  toggleLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: "#191922",
  },

  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    paddingHorizontal: 14,
    backgroundColor: "rgba(255,255,255,0.35)",
    marginBottom: 18,
  },

  searchInput: {
    flex: 1,
    height: 46,
    marginLeft: 8,
    color: "#191922",
    fontSize: 14,
  },

  sectionLabel: {
    fontSize: 13,
    fontWeight: "500",
    color: "#37373a",
    marginBottom: 10,
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 15,
    paddingHorizontal: 14,
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: "rgba(255,255,255,0.15)",
  },

  rowLabel: {
    fontSize: 15,
    color: "#191922",
  },

  loadingBox: {
    alignItems: "center",
    paddingVertical: 30,
  },

  loadingText: {
    marginTop: 8,
    fontSize: 13,
    color: "#6F6F79",
  },
});
