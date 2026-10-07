// ==========================================
// NEW GROUP
// ==========================================
// Name, photo, description, type, members and settings - the group chat
// spec's "Creation fields". The creator becomes the group's owner.
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useMemo, useState } from "react";
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

import {
      GroupAvatar,
      GroupScreen,
      OptionSelector,
      PINK,
      SectionLabel,
      groupStyles,
} from "@/components/groups/GroupUi";
import PeoplePicker, { personKey } from "@/components/groups/PeoplePicker";
import {
      SKIP_REASON_TEXT,
      createGroup,
      type GroupAudience,
      type GroupJoinMode,
      type GroupKind,
      type GroupPerson,
      type PhotoFile,
} from "@/services/groups";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { fetchChats } from "@/store/thunks/chatThunks";
import { safeBack } from "@/utils/safeBack";

const KIND_HELP: Record<GroupKind, string> = {
  private: "Invite only. People join when added, or with the invite link.",
  open: "A community space anyone on CosQuest can find and join.",
  faction: "For your faction. Everyone in your faction is in it automatically.",
};

export default function NewGroup() {
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();

  const token = useAppSelector((state) => state.auth.token);
  const user = useAppSelector((state) => state.user.user) as any;
  const authUser = useAppSelector((state) => state.auth.user) as any;
  const myFaction: string | null = user?.faction || authUser?.faction || null;

  const [photo, setPhoto] = useState<PhotoFile | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<GroupKind>("private");
  const [joinMode, setJoinMode] = useState<GroupJoinMode>("approval");
  const [whoCanAdd, setWhoCanAdd] = useState<GroupAudience>("admins");
  const [memberList, setMemberList] = useState<GroupAudience>("members");
  const [sizeLimit, setSizeLimit] = useState("256");
  const [selected, setSelected] = useState<Record<string, GroupPerson>>({});
  const [creating, setCreating] = useState(false);

  const picked = useMemo(() => Object.values(selected), [selected]);

  const changeKind = (next: GroupKind) => {
    setKind(next);
    // Sensible join setting for each type (can still be changed).
    setJoinMode(next === "private" ? "approval" : "instant");
  };

  const togglePerson = (person: GroupPerson) => {
    setSelected((current) => {
      const key = personKey(person);
      const next = { ...current };
      if (next[key]) delete next[key];
      else next[key] = person;
      return next;
    });
  };

  const pickPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Photo permission",
        "Please allow CosQuest to access your photos.",
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });

    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    setPhoto({
      uri: asset.uri,
      name: asset.fileName || "group-photo.jpg",
      type: asset.mimeType || "image/jpeg",
    });
  };

  const create = async () => {
    const trimmed = name.trim();

    if (!token || creating) return;
    if (!trimmed) {
      Alert.alert("New group", "Give your group a name.");
      return;
    }
    if (kind === "faction" && !myFaction) {
      Alert.alert(
        "New group",
        "Join a faction first to create a faction group.",
      );
      return;
    }

    const limit = Math.min(1024, Math.max(2, Number(sizeLimit) || 256));

    try {
      setCreating(true);

      const result = await createGroup(
        {
          name: trimmed,
          description: description.trim(),
          kind,
          factionKey: kind === "faction" ? myFaction : undefined,
          joinMode,
          sizeLimit: limit,
          memberListVisibility: memberList,
          whoCanAdd,
          members: picked.map((person) => person.id),
        },
        photo,
        token,
      );

      dispatch(fetchChats(token));

      if (result.skipped.length) {
        const lines = result.skipped.map((item) => {
          const who =
            picked.find((p) => p.id === item.userId)?.username ||
            item.username ||
            "Someone";
          return `@${who} ${SKIP_REASON_TEXT[item.reason] || "couldn't be added"}.`;
        });
        Alert.alert("Some people weren't added", lines.join("\n"));
      }

      router.replace({ pathname: "/chat/[id]", params: { id: result.chatId } });
    } catch (error) {
      Alert.alert(
        "New group",
        error instanceof Error ? error.message : "Couldn't create the group.",
      );
    } finally {
      setCreating(false);
    }
  };

  return (
    <GroupScreen title="New group" onBack={() => safeBack()}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            { paddingBottom: insets.bottom + 40 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          {/* PHOTO + NAME */}
          <View style={styles.top}>
            <Pressable
              onPress={pickPhoto}
              style={styles.photoButton}
              accessibilityLabel="Group photo">
              <GroupAvatar name={name || "?"} photoUrl={photo?.uri} size={84} />
              <View style={styles.cameraChip}>
                <Ionicons name="camera" size={14} color="#FFFFFF" />
              </View>
            </Pressable>

            <View style={styles.flex}>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Group name"
                placeholderTextColor="#9C9CAA"
                maxLength={80}
                style={groupStyles.input}
              />
            </View>
          </View>

          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Description (optional)"
            placeholderTextColor="#9C9CAA"
            maxLength={500}
            multiline
            style={[groupStyles.input, styles.description]}
          />

          {/* TYPE */}
          <SectionLabel>GROUP TYPE</SectionLabel>
          <OptionSelector
            value={kind}
            onChange={changeKind}
            options={[
              { value: "private", label: "Private" },
              { value: "open", label: "Open" },
              { value: "faction", label: "Faction" },
            ]}
          />
          <Text style={[groupStyles.hint, styles.hint]}>
            {kind === "faction" && !myFaction
              ? "Join a faction first to create a faction group."
              : KIND_HELP[kind]}
          </Text>

          {/* SETTINGS */}
          {kind !== "faction" ? (
            <>
              <SectionLabel>
                WHEN SOMEONE USES THE INVITE LINK OR JOIN
              </SectionLabel>
              <OptionSelector
                value={joinMode}
                onChange={setJoinMode}
                options={[
                  { value: "instant", label: "Let them in" },
                  { value: "approval", label: "Admin approves" },
                ]}
              />
            </>
          ) : null}

          <SectionLabel>WHO CAN ADD PEOPLE</SectionLabel>
          <OptionSelector
            value={whoCanAdd}
            onChange={setWhoCanAdd}
            options={[
              { value: "admins", label: "Admins only" },
              { value: "members", label: "All members" },
            ]}
          />

          <SectionLabel>WHO CAN SEE THE MEMBER LIST</SectionLabel>
          <OptionSelector
            value={memberList}
            onChange={setMemberList}
            options={[
              { value: "members", label: "All members" },
              { value: "admins", label: "Admins only" },
            ]}
          />

          {kind !== "faction" ? (
            <>
              <SectionLabel>SIZE LIMIT</SectionLabel>
              <TextInput
                value={sizeLimit}
                onChangeText={(text) =>
                  setSizeLimit(text.replace(/[^0-9]/g, ""))
                }
                keyboardType="number-pad"
                maxLength={4}
                style={groupStyles.input}
              />
              <Text style={[groupStyles.hint, styles.hint]}>
                Between 2 and 1024 people.
              </Text>
            </>
          ) : null}

          {/* MEMBERS */}
          <SectionLabel>
            {kind === "faction" ? "ADD PEOPLE (OPTIONAL)" : "ADD MEMBERS"}
            {picked.length ? ` · ${picked.length} CHOSEN` : ""}
          </SectionLabel>
          <PeoplePicker selected={selected} onToggle={togglePerson} max={50} />
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
          <Pressable
            style={[
              groupStyles.primaryButton,
              (!name.trim() || creating) && groupStyles.primaryButtonOff,
            ]}
            onPress={create}
            disabled={!name.trim() || creating}>
            {creating ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="people" size={18} color="#FFFFFF" />
                <Text style={groupStyles.primaryButtonText}>Create group</Text>
              </>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </GroupScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },

  scroll: {
    paddingHorizontal: 20,
    paddingTop: 8,
    width: "100%",
    maxWidth: 640,
    alignSelf: "center",
  },

  top: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    marginBottom: 14,
  },

  photoButton: { position: "relative" },

  cameraChip: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: PINK,
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },

  description: {
    minHeight: 80,
    textAlignVertical: "top",
  },

  hint: { marginTop: 8 },

  footer: {
    paddingHorizontal: 20,
    paddingTop: 10,
    width: "100%",
    maxWidth: 640,
    alignSelf: "center",
  },
});
