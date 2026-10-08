// ==========================================
// GROUP INVITE LINK
// ==========================================
// https://<site>/group/join/<code> opens here: shows the group, and Join
// (or "Ask to join" when an admin has to approve).
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
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

import {
      GroupAvatar,
      GroupScreen,
      INK,
      MUTED,
      PINK,
      groupStyles,
} from "@/components/groups/GroupUi";
import { FONTS } from "@/constants/fonts";
import { getInvite, joinByInvite, type GroupPreview } from "@/services/groups";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { fetchChats } from "@/store/thunks/chatThunks";
import { safeBack } from "@/utils/safeBack";

const KIND_LABEL = {
  private: "Private group",
  open: "Open community",
  faction: "Faction group",
} as const;

export default function GroupInvite() {
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  const { code } = useLocalSearchParams<{ code: string }>();
  const inviteCode = Array.isArray(code) ? code[0] : code;

  const token = useAppSelector((state) => state.auth.token);

  const [preview, setPreview] = useState<GroupPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    if (!token || !inviteCode) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    getInvite(inviteCode, token)
      .then((result) => {
        if (!cancelled) setPreview(result);
      })
      .catch((loadError) => {
        if (!cancelled)
          setError(
            loadError instanceof Error
              ? loadError.message
              : "This invite link isn't valid.",
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token, inviteCode]);

  const openChat = (id: string) =>
    router.replace({ pathname: "/chat/[id]", params: { id } });

  const join = async () => {
    if (!token || !inviteCode || !preview) return;

    if (preview.isMember) {
      openChat(preview.id);
      return;
    }

    try {
      setJoining(true);
      const result = await joinByInvite(inviteCode, token);

      if (result.joined) {
        dispatch(fetchChats(token));
        openChat(result.groupId || preview.id);
      } else if (result.requested) {
        setPreview({ ...preview, requestPending: true });
        Alert.alert(
          "Request sent",
          "An admin will review your request to join.",
        );
      }
    } catch (joinError) {
      Alert.alert(
        "Join group",
        joinError instanceof Error
          ? joinError.message
          : "Couldn't join the group.",
      );
    } finally {
      setJoining(false);
    }
  };

  if (!token) {
    return (
      <GroupScreen title="Group invite" onBack={() => safeBack()}>
        <View style={styles.center}>
          <Text style={styles.centerText}>
            Sign in to CosQuest, then open the invite link again.
          </Text>
        </View>
      </GroupScreen>
    );
  }

  return (
    <GroupScreen title="Group invite" onBack={() => safeBack()}>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={PINK} />
        </View>
      ) : error || !preview ? (
        <View style={styles.center}>
          <Ionicons name="link-outline" size={38} color="#9C9CAA" />
          <Text style={styles.centerTitle}>Invite link not valid</Text>
          <Text style={styles.centerText}>
            {error || "This link may have been reset. Ask for a new one."}
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            { paddingBottom: insets.bottom + 40 },
          ]}>
          <View style={styles.hero}>
            <GroupAvatar
              name={preview.name}
              photoUrl={preview.photoUrl}
              size={120}
            />
            <Text style={styles.invited}>You&apos;re invited to join</Text>
            <Text style={styles.name}>{preview.name}</Text>
            <Text style={styles.meta}>
              {KIND_LABEL[preview.kind]} · {preview.memberCount}{" "}
              {preview.memberCount === 1 ? "member" : "members"}
            </Text>
            {preview.description ? (
              <Text style={styles.description}>{preview.description}</Text>
            ) : null}
          </View>

          <Pressable
            style={[
              groupStyles.primaryButton,
              (joining || preview.requestPending) &&
                groupStyles.primaryButtonOff,
            ]}
            disabled={joining || preview.requestPending}
            onPress={join}>
            {joining ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={groupStyles.primaryButtonText}>
                {preview.isMember
                  ? "Open group"
                  : preview.requestPending
                    ? "Request sent"
                    : preview.joinMode === "approval"
                      ? "Ask to join"
                      : "Join group"}
              </Text>
            )}
          </Pressable>

          {preview.joinMode === "approval" && !preview.isMember ? (
            <Text style={[groupStyles.hint, styles.hint]}>
              An admin approves new members of this group.
            </Text>
          ) : null}
        </ScrollView>
      )}
    </GroupScreen>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: 24,
    paddingTop: 20,
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
  },

  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 30,
  },

  centerTitle: { fontFamily: FONTS.semibold, fontSize: 16, color: INK },

  centerText: {
    fontFamily: FONTS.regular,
    fontSize: 13,
    color: MUTED,
    textAlign: "center",
  },

  hero: { alignItems: "center", marginBottom: 28 },

  invited: {
    marginTop: 16,
    fontFamily: FONTS.regular,
    fontSize: 13,
    color: MUTED,
  },

  name: {
    marginTop: 4,
    fontFamily: FONTS.bold,
    fontSize: 22,
    color: INK,
    textAlign: "center",
  },

  meta: {
    marginTop: 4,
    fontFamily: FONTS.regular,
    fontSize: 12.5,
    color: MUTED,
  },

  description: {
    marginTop: 12,
    fontFamily: FONTS.regular,
    fontSize: 13.5,
    lineHeight: 20,
    color: "#3B3B42",
    textAlign: "center",
  },

  hint: { marginTop: 10, textAlign: "center" },
});
