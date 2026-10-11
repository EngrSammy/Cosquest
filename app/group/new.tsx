// ==========================================
// CREATE A GROUP (Figma M20-M24)
// ==========================================
// Step 1 (M20) Choose group type · Step 2 (M21) Group basics · Step 3 (M22)
// Add contacts · Step 4 (M23) Joining, privacy & notifications · then
// "Your group is ready" (M24) with the share link and first members.
// Built from the screenshots for testing - fine-tune sizes/colours here.
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { RankLine } from "@/components/chat/RankBadge";
import PeoplePicker, { personKey } from "@/components/groups/PeoplePicker";
import { FONTS } from "@/constants/fonts";
import {
  SKIP_REASON_TEXT,
  createGroup,
  getGroupMembers,
  inviteLinkFor,
  muteGroup,
  type Group,
  type GroupAudience,
  type GroupJoinMode,
  type GroupKind,
  type GroupMember,
  type GroupPerson,
  type PhotoFile,
} from "@/services/groups";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { fetchChats } from "@/store/thunks/chatThunks";
import { safeBack } from "@/utils/safeBack";

const PINK = "#B63D91";
const INK = "#24283C";
const MUTED = "#66738A";
const LILAC = "#F0EDF9";
const PINK_SOFT = "#F7E3F0";
const LINE = "rgba(36,40,60,0.08)";

type Step = 1 | 2 | 3 | 4;
type NotifyChoice = "all" | "sparks" | "mute";

const KINDS: { value: GroupKind; icon: keyof typeof Ionicons.glyphMap; title: string; text: string }[] = [
  {
    value: "faction",
    icon: "shield-outline",
    title: "Faction group",
    text: "Eligible faction members are added automatically. Plan local quests together.",
  },
  {
    value: "open",
    icon: "globe-outline",
    title: "Open community space",
    text: "A public or semi-public space. Join instantly or with admin approval.",
  },
  {
    value: "private",
    icon: "lock-closed-outline",
    title: "Private group",
    text: "For friends and teams. Manual invitations only.",
  },
];

const KIND_LABEL: Record<GroupKind, string> = {
  faction: "Local faction",
  open: "Open space",
  private: "Private group",
};

const STEP_TITLE: Record<Step, string> = {
  1: "Create a group",
  2: "Make it yours",
  3: "Bring your people",
  4: "Set the ground rules",
};

const AVATAR_TINTS = ["#E9E1F5", "#DCE8EF", "#F3DDED", "#E2F0E8", "#F5E6D8"];

function avatarTint(name?: string) {
  let hash = 0;
  for (const char of String(name || "")) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return AVATAR_TINTS[hash % AVATAR_TINTS.length];
}

function initialsOf(name?: string) {
  const parts = String(name || "?").trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[1][0] : (parts[0] || "?").slice(0, 2);
  return letters.toUpperCase();
}

function namesOf(people: GroupPerson[]) {
  const names = people.map((person) => person.name || person.username);
  if (names.length <= 2) return names.join(" & ");
  return `${names.slice(0, 2).join(", ")} & ${names.length - 2} more`;
}

// ---------- small pieces ----------

function Radio({ on }: { on: boolean }) {
  return on ? (
    <Ionicons name="checkmark-circle-outline" size={24} color={PINK} />
  ) : (
    <Ionicons name="ellipse-outline" size={24} color={MUTED} />
  );
}

function ChoiceRow({
  title,
  hint,
  on,
  onPress,
  last,
  disabled,
}: {
  title: string;
  hint?: string;
  on: boolean;
  onPress: () => void;
  last?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.choiceRow, last && styles.rowLast, disabled && styles.off]}
      accessibilityRole="radio"
      accessibilityState={{ checked: on, disabled }}>
      <View style={styles.flex}>
        <Text style={styles.rowTitle}>{title}</Text>
        {hint ? <Text style={styles.rowHint}>{hint}</Text> : null}
      </View>
      <Radio on={on} />
    </Pressable>
  );
}

function LinkRow({ title, value, onPress, last }: { title: string; value: string; onPress: () => void; last?: boolean }) {
  return (
    <Pressable onPress={onPress} style={[styles.choiceRow, last && styles.rowLast]}>
      <View style={styles.flex}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowHint}>{value}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={MUTED} />
    </Pressable>
  );
}

function MemberLine({ member, onPress }: { member: GroupMember; onPress: () => void }) {
  const name = member.name || member.username;
  return (
    <Pressable onPress={onPress} style={styles.memberRow}>
      {member.avatarPhotoUrl ? (
        <Image source={{ uri: member.avatarPhotoUrl }} style={styles.memberPhoto} contentFit="cover" />
      ) : (
        <View style={[styles.memberAvatar, { backgroundColor: avatarTint(name) }]}>
          <Text style={styles.memberInitials}>{initialsOf(name)}</Text>
        </View>
      )}
      <View style={styles.flex}>
        <View style={styles.memberNameRow}>
          <Text style={styles.memberName} numberOfLines={1}>
            {name}
          </Text>
          {member.role !== "member" ? (
            <Text style={styles.memberRole}>{member.role === "owner" ? "Owner" : "Admin"}</Text>
          ) : null}
        </View>
        <RankLine rank={(member as any).rank} />
      </View>
      <Ionicons name="chevron-forward" size={20} color={MUTED} />
    </Pressable>
  );
}

// ==========================================
// SCREEN
// ==========================================

export default function NewGroup() {
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();

  const token = useAppSelector((state) => state.auth.token);
  const user = useAppSelector((state) => state.user.user) as any;
  const authUser = useAppSelector((state) => state.auth.user) as any;
  const myFaction: string | null = user?.faction || authUser?.faction || null;
  const myUsername: string = user?.profile?.username || authUser?.profile?.username || "you";

  const [step, setStep] = useState<Step>(1);

  // Step 1-2
  const [kind, setKind] = useState<GroupKind>("faction");
  const [photo, setPhoto] = useState<PhotoFile | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  // Step 3
  const [selected, setSelected] = useState<Record<string, GroupPerson>>({});

  // Step 4
  const [joinMode, setJoinMode] = useState<GroupJoinMode>("approval");
  const [sizeLimit, setSizeLimit] = useState("100");
  const [memberList, setMemberList] = useState<GroupAudience>("members");
  const [whoCanAdd, setWhoCanAdd] = useState<GroupAudience>("admins");
  const [notify, setNotify] = useState<NotifyChoice>("all");

  // Done (M24)
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<{ group: Group; chatId: string } | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [memberTotal, setMemberTotal] = useState(0);

  const picked = useMemo(() => Object.values(selected), [selected]);

  const changeKind = (next: GroupKind) => {
    setKind(next);
    // Private groups always use manual invitations (approval).
    setJoinMode(next === "open" ? "instant" : "approval");
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
      Alert.alert("Photo permission", "Please allow CosQuest to access your photos.");
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
    setPhoto({ uri: asset.uri, name: asset.fileName || "group-photo.jpg", type: asset.mimeType || "image/jpeg" });
  };

  const next = () => {
    if (step === 1 && kind === "faction" && !myFaction) {
      Alert.alert("Faction group", "Join a faction first to create a faction group.");
      return;
    }
    if (step === 2 && !name.trim()) {
      Alert.alert("Group name", "Give your group a name.");
      return;
    }
    setStep((current) => Math.min(4, current + 1) as Step);
  };

  const back = () => {
    if (created) {
      router.replace({ pathname: "/chat/[id]", params: { id: created.chatId } });
      return;
    }
    if (step > 1) setStep((current) => (current - 1) as Step);
    else safeBack();
  };

  const create = async () => {
    if (!token || creating) return;
    const limit = Math.min(1024, Math.max(2, Number(sizeLimit.replace(/\D/g, "")) || 100));

    try {
      setCreating(true);
      const result = await createGroup(
        {
          name: name.trim(),
          description: description.trim(),
          kind,
          factionKey: kind === "faction" ? myFaction : undefined,
          joinMode: kind === "private" ? "approval" : joinMode,
          sizeLimit: limit,
          memberListVisibility: memberList,
          whoCanAdd,
          members: picked.map((person) => person.id),
        },
        photo,
        token,
      );

      // "Mute entire group": muted for me straight away. ("Mute only Sparks"
      // needs a backend option that isn't there yet, so it stays audible.)
      if (notify === "mute") {
        muteGroup(result.group.id, true, "always", token).catch(() => {});
      }

      dispatch(fetchChats(token));

      if (result.skipped.length) {
        const lines = result.skipped.map((item) => {
          const who = picked.find((p) => p.id === item.userId)?.username || item.username || "Someone";
          return `@${who} ${SKIP_REASON_TEXT[item.reason] || "couldn't be added"}.`;
        });
        Alert.alert("Some people weren't added", lines.join("\n"));
      }

      setCreated({ group: result.group, chatId: result.chatId });
      getGroupMembers(result.group.id, {}, token)
        .then((list) => {
          setMembers(list.members);
          setMemberTotal(list.total || list.members.length);
        })
        .catch(() => {});
    } catch (error) {
      Alert.alert("Create a group", error instanceof Error ? error.message : "Couldn't create the group.");
    } finally {
      setCreating(false);
    }
  };

  const link = created ? inviteLinkFor(created.group) : null;

  const copyLink = async () => {
    if (!link) return;
    await Clipboard.setStringAsync(link);
    Alert.alert("Copied", "Invite link copied.");
  };

  const shareLink = async () => {
    if (!link || !created) return;
    try {
      await Share.share({ message: `Join "${created.group.name}" on CosQuest: ${link}` });
    } catch {
      // closed
    }
  };

  const kindIcon = KINDS.find((item) => item.value === kind)?.icon || "people-outline";

  // ---------- footer button ----------
  const nextLabel =
    step === 1
      ? `Next · ${KINDS.find((item) => item.value === kind)?.title.toLowerCase()}`
      : step === 2
        ? "Next · add contacts"
        : step === 3
          ? picked.length
            ? `Next · ${picked.length} ${picked.length === 1 ? "contact" : "contacts"} selected`
            : "Next · skip for now"
          : `Create ${name.trim() || "group"}`;

  return (
    <LinearGradient colors={["#F6F9FE", "#E3F0FC"]} style={styles.screen}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {/* HEADER */}
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <Pressable onPress={back} hitSlop={10} accessibilityLabel="Back">
            <Ionicons name="chevron-back" size={26} color={INK} />
          </Pressable>
          <View style={styles.flex}>
            <Text style={styles.title} numberOfLines={1}>
              {created ? "Your group is ready" : STEP_TITLE[step]}
            </Text>
            {created ? (
              <Text style={styles.subtitle}>
                Created {new Date().toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" })} · by{" "}
                {myUsername}
              </Text>
            ) : step === 4 ? (
              <Text style={styles.subtitle}>{KIND_LABEL[kind]} group</Text>
            ) : null}
          </View>
          <Pressable
            onPress={() =>
              created ? router.replace({ pathname: "/chat/[id]", params: { id: created.chatId } }) : safeBack()
            }
            hitSlop={10}
            accessibilityLabel="Close">
            <Ionicons name="close" size={26} color={MUTED} />
          </Pressable>
        </View>

        <ScrollView
          style={styles.flex}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 110 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          {!created ? (
            <>
              {/* PROGRESS */}
              <Text style={styles.stepLabel}>STEP {step} OF 4</Text>
              <View style={styles.progress}>
                {[1, 2, 3, 4].map((index) => (
                  <View key={index} style={[styles.progressBar, index <= step && styles.progressOn]} />
                ))}
              </View>
            </>
          ) : null}

          {/* ---------- STEP 1 (M20) ---------- */}
          {!created && step === 1 ? (
            <>
              <Text style={styles.bigTitle}>A space for your people.</Text>
              <Text style={styles.lead}>Choose how your group comes together.</Text>

              {KINDS.map((item) => {
                const on = kind === item.value;
                return (
                  <Pressable
                    key={item.value}
                    onPress={() => changeKind(item.value)}
                    style={[styles.typeCard, on && styles.typeCardOn]}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}>
                    <View style={styles.typeHead}>
                      <View style={[styles.typeIcon, on && styles.typeIconOn]}>
                        <Ionicons name={item.icon} size={22} color={PINK} />
                      </View>
                      <Text style={styles.typeTitle}>{item.title}</Text>
                      <View style={[styles.checkbox, on && styles.checkboxOn]}>
                        {on ? <Ionicons name="checkmark" size={16} color="#FFFFFF" /> : null}
                      </View>
                    </View>
                    <Text style={styles.typeText}>{item.text}</Text>
                  </Pressable>
                );
              })}

              <View style={styles.infoBox}>
                <Text style={styles.infoTitle}>Local · created by you</Text>
                <Text style={styles.infoText}>
                  Groups you create are local. Regional groups such as SoCal Ascendants are created by orchestrators.
                </Text>
              </View>
            </>
          ) : null}

          {/* ---------- STEP 2 (M21) ---------- */}
          {!created && step === 2 ? (
            <>
              <Pressable onPress={pickPhoto} style={styles.photoWrap} accessibilityLabel="Upload photo">
                {photo ? (
                  <Image source={{ uri: photo.uri }} style={styles.photo} contentFit="cover" />
                ) : (
                  <View style={styles.photoIcon}>
                    <Ionicons name={kindIcon} size={44} color={PINK} />
                  </View>
                )}
                <Text style={styles.photoLink}>{photo ? "Change photo" : "Upload photo or choose icon"}</Text>
              </Pressable>

              <View style={styles.chip}>
                <Text style={styles.chipText}>{KIND_LABEL[kind]} · created by you</Text>
              </View>

              <Text style={styles.label}>Group name</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="e.g. Barrio Logan Ascendants"
                placeholderTextColor="#9AA3B5"
                maxLength={60}
                style={styles.input}
              />

              <Text style={styles.label}>Description</Text>
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder="What is this group for?"
                placeholderTextColor="#9AA3B5"
                maxLength={300}
                multiline
                style={[styles.input, styles.textArea]}
              />
              <Text style={styles.hint}>Help people know what to expect in this group.</Text>
              <Text style={[styles.hint, styles.hintGap]}>
                Your name and icon appear in chats and invitations. Admins can update these later.
              </Text>
            </>
          ) : null}

          {/* ---------- STEP 3 (M22) ---------- */}
          {!created && step === 3 ? (
            <>
              <View style={styles.infoBox}>
                <Text style={styles.infoTitle}>
                  {kind === "faction" ? "Faction members join automatically" : "Invite your people"}
                </Text>
                <Text style={styles.infoText}>
                  {kind === "faction"
                    ? "Eligible members are already included. Selected contacts receive invitations, not admin powers."
                    : "Selected contacts are added to the group. They don't get admin powers."}
                </Text>
              </View>

              <View style={styles.pickerWrap}>
                <PeoplePicker selected={selected} onToggle={togglePerson} max={50} />
              </View>

              {picked.length ? (
                <Text style={styles.selectedText}>
                  {picked.length} selected · {namesOf(picked)}
                </Text>
              ) : null}

              <Pressable style={styles.inviteRow} onPress={() => setStep(4)}>
                <View style={styles.flex}>
                  <Text style={styles.rowTitle}>Use an invitation link instead</Text>
                  <Text style={styles.rowHint}>Share after your group is created</Text>
                </View>
                <Ionicons name="link-outline" size={22} color={MUTED} />
              </Pressable>
            </>
          ) : null}

          {/* ---------- STEP 4 (M23) ---------- */}
          {!created && step === 4 ? (
            <>
              <Text style={styles.section}>INVITE-LINK JOINING</Text>
              <View style={styles.card}>
                <ChoiceRow
                  title="Admin approval"
                  hint="Review each shared-link request"
                  on={kind === "private" || joinMode === "approval"}
                  onPress={() => setJoinMode("approval")}
                />
                <ChoiceRow
                  title="Instant invitation"
                  hint={kind === "private" ? "Not for private groups" : "Eligible link holders join without review"}
                  on={kind !== "private" && joinMode === "instant"}
                  onPress={() => setJoinMode("instant")}
                  disabled={kind === "private"}
                  last
                />
              </View>

              <Text style={styles.label}>Group size limit</Text>
              <TextInput
                value={sizeLimit}
                onChangeText={(text) => setSizeLimit(text.replace(/\D/g, ""))}
                keyboardType="number-pad"
                maxLength={4}
                style={styles.input}
              />
              <Text style={styles.hint}>Your group's editable limit (members)</Text>

              <Text style={styles.section}>GROUP PRIVACY</Text>
              <View style={styles.card}>
                <LinkRow
                  title="Member list visible to"
                  value={memberList === "members" ? "Members" : "Admins"}
                  onPress={() => setMemberList((value) => (value === "members" ? "admins" : "members"))}
                />
                <LinkRow
                  title="Who can add people"
                  value={whoCanAdd === "admins" ? "Admins" : "Members"}
                  onPress={() => setWhoCanAdd((value) => (value === "admins" ? "members" : "admins"))}
                  last
                />
              </View>

              <View style={styles.infoBox}>
                <Text style={styles.infoText}>
                  Eligible faction members join automatically. Approval applies to shared-link requests. Private groups
                  always use manual invitations.
                </Text>
              </View>

              <Text style={styles.section}>YOUR NOTIFICATIONS</Text>
              <View style={styles.card}>
                <ChoiceRow title="All activity audible" on={notify === "all"} onPress={() => setNotify("all")} />
                <ChoiceRow
                  title="Mute only Sparks / thread activity"
                  hint="Main conversation stays audible (coming soon)"
                  on={notify === "sparks"}
                  onPress={() => setNotify("sparks")}
                />
                <ChoiceRow
                  title="Mute entire group"
                  hint="Silence main chat and Sparks"
                  on={notify === "mute"}
                  onPress={() => setNotify("mute")}
                  last
                />
              </View>
            </>
          ) : null}

          {/* ---------- DONE (M24) ---------- */}
          {created ? (
            <>
              <View style={styles.readyIconWrap}>
                {created.group.photoUrl ? (
                  <Image source={{ uri: created.group.photoUrl }} style={styles.photo} contentFit="cover" />
                ) : (
                  <View style={styles.photoIcon}>
                    <Ionicons name={kindIcon} size={44} color={PINK} />
                  </View>
                )}
              </View>
              <Text style={styles.readyName}>{created.group.name}</Text>
              <View style={[styles.chip, styles.chipCenter]}>
                <Text style={styles.chipText}>{KIND_LABEL[created.group.kind]} · user-created</Text>
              </View>
              {created.group.description ? <Text style={styles.lead}>{created.group.description}</Text> : null}

              <Text style={styles.section}>SHARE YOUR GROUP</Text>
              <View style={[styles.card, styles.cardPad]}>
                <Text style={styles.linkText} numberOfLines={2}>
                  {link || "Invite link not available"}
                </Text>
                <Text style={styles.rowHint}>
                  {created.group.joinMode === "approval"
                    ? "Shared-link requests need admin approval."
                    : "People with the link join straight away."}
                </Text>
                <View style={styles.twoButtons}>
                  <Pressable style={styles.softButton} onPress={copyLink} disabled={!link}>
                    <Text style={styles.softButtonText}>Copy link</Text>
                  </Pressable>
                  <Pressable style={styles.softButton} onPress={shareLink} disabled={!link}>
                    <Text style={styles.softButtonText}>Share invite</Text>
                  </Pressable>
                </View>
              </View>

              <Text style={styles.section}>{memberTotal || created.group.memberCount || 1} MEMBERS</Text>
              <View style={[styles.card, styles.cardPad]}>
                {created.group.kind === "faction" ? (
                  <Text style={styles.rowHint}>Faction members were added automatically.</Text>
                ) : null}
                {members.slice(0, 3).map((member) => (
                  <MemberLine
                    key={member.id}
                    member={member}
                    onPress={() => router.push({ pathname: "/group/[id]", params: { id: created.group.id } })}
                  />
                ))}
                <Pressable
                  style={[styles.choiceRow, styles.rowLast]}
                  onPress={() => router.push({ pathname: "/group/[id]", params: { id: created.group.id } })}>
                  <View style={styles.flex}>
                    <Text style={styles.rowTitle}>View all members</Text>
                    <Text style={styles.rowHint}>Creator: {myUsername} · Owner</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={MUTED} />
                </Pressable>
              </View>
            </>
          ) : null}
        </ScrollView>

        {/* FOOTER BUTTON */}
        <View style={[styles.footer, { paddingBottom: insets.bottom + 14 }]}>
          {created ? (
            <Pressable
              style={styles.primary}
              onPress={() => router.replace({ pathname: "/chat/[id]", params: { id: created.chatId } })}>
              <Text style={styles.primaryText}>Open group chat</Text>
            </Pressable>
          ) : (
            <Pressable
              style={[styles.primary, (creating || (step === 2 && !name.trim())) && styles.off]}
              disabled={creating || (step === 2 && !name.trim())}
              onPress={step === 4 ? create : next}>
              {creating ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryText} numberOfLines={1}>
                  {nextLabel}
                </Text>
              )}
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },

  flex: { flex: 1, minWidth: 0 },

  off: { opacity: 0.5 },

  // HEADER
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingBottom: 8 },

  title: { fontFamily: FONTS.semibold, fontSize: 22, lineHeight: 28, color: INK },

  subtitle: { marginTop: 2, fontFamily: FONTS.regular, fontSize: 12, color: MUTED },

  content: { paddingHorizontal: 18, paddingTop: 8 },

  // PROGRESS
  stepLabel: { marginTop: 10, fontFamily: FONTS.medium, fontSize: 11, letterSpacing: 0.4, color: MUTED },

  progress: { flexDirection: "row", gap: 6, marginTop: 8, marginBottom: 14 },

  progressBar: { flex: 1, height: 4, borderRadius: 2, backgroundColor: "#D9DEE8" },

  progressOn: { backgroundColor: PINK },

  bigTitle: { marginTop: 4, fontFamily: FONTS.semibold, fontSize: 21, lineHeight: 28, color: INK },

  lead: { marginTop: 8, marginBottom: 14, fontFamily: FONTS.regular, fontSize: 14, lineHeight: 21, color: MUTED },

  // STEP 1
  typeCard: {
    marginBottom: 12,
    padding: 16,
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: LINE,
  },

  typeCardOn: { backgroundColor: PINK_SOFT, borderColor: PINK },

  typeHead: { flexDirection: "row", alignItems: "center", gap: 12 },

  typeIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: LILAC,
  },

  typeIconOn: { backgroundColor: "#FFFFFF" },

  typeTitle: { flex: 1, fontFamily: FONTS.semibold, fontSize: 16, color: INK },

  typeText: { marginTop: 10, fontFamily: FONTS.regular, fontSize: 13, lineHeight: 19, color: MUTED },

  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: "#C9CFDB",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },

  checkboxOn: { backgroundColor: PINK, borderColor: PINK },

  infoBox: { marginTop: 4, marginBottom: 14, padding: 14, borderRadius: 16, backgroundColor: LILAC },

  infoTitle: { fontFamily: FONTS.semibold, fontSize: 13, color: PINK, marginBottom: 4 },

  infoText: { fontFamily: FONTS.regular, fontSize: 12.5, lineHeight: 18, color: MUTED },

  // STEP 2
  photoWrap: { alignItems: "center", marginTop: 6 },

  photoIcon: {
    width: 96,
    height: 96,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: PINK_SOFT,
  },

  photo: { width: 96, height: 96, borderRadius: 24 },

  photoLink: { marginTop: 14, fontFamily: FONTS.semibold, fontSize: 14, color: PINK },

  chip: {
    alignSelf: "flex-start",
    marginTop: 18,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: "#F3DDED",
  },

  chipCenter: { alignSelf: "center", marginTop: 10 },

  chipText: { fontFamily: FONTS.semibold, fontSize: 11, color: PINK },

  label: { marginTop: 16, marginBottom: 8, fontFamily: FONTS.semibold, fontSize: 13, color: INK },

  input: {
    minHeight: 50,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "rgba(102,115,138,0.25)",
    fontFamily: FONTS.regular,
    fontSize: 15,
    color: INK,
    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null),
  },

  textArea: { minHeight: 96, textAlignVertical: "top" },

  hint: { marginTop: 6, fontFamily: FONTS.regular, fontSize: 11.5, lineHeight: 16, color: MUTED },

  hintGap: { marginTop: 14 },

  // STEP 3
  pickerWrap: { marginTop: 2 },

  selectedText: { marginTop: 12, fontFamily: FONTS.semibold, fontSize: 13, color: PINK },

  inviteRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 14,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: LINE,
  },

  // STEP 4
  section: { marginTop: 20, marginBottom: 8, fontFamily: FONTS.semibold, fontSize: 12, letterSpacing: 0.4, color: MUTED },

  card: {
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: LINE,
  },

  cardPad: { paddingTop: 14 },

  choiceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: LINE,
  },

  rowLast: { borderBottomWidth: 0 },

  rowTitle: { fontFamily: FONTS.semibold, fontSize: 15, color: INK },

  rowHint: { marginTop: 2, fontFamily: FONTS.regular, fontSize: 12, lineHeight: 17, color: MUTED },

  // M24
  readyIconWrap: { alignItems: "center", marginTop: 10 },

  readyName: { marginTop: 18, fontFamily: FONTS.semibold, fontSize: 22, color: INK, textAlign: "center" },

  linkText: { fontFamily: FONTS.semibold, fontSize: 14, color: PINK },

  twoButtons: { flexDirection: "row", gap: 10, marginTop: 12, marginBottom: 14 },

  softButton: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: LILAC,
  },

  softButtonText: { fontFamily: FONTS.semibold, fontSize: 15, color: PINK },

  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: LINE,
  },

  memberAvatar: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },

  memberPhoto: { width: 42, height: 42, borderRadius: 21 },

  memberInitials: { fontFamily: FONTS.bold, fontSize: 12, color: "#7D356D" },

  memberNameRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 3 },

  memberName: { flexShrink: 1, fontFamily: FONTS.semibold, fontSize: 14, color: INK },

  memberRole: { fontFamily: FONTS.semibold, fontSize: 11, color: PINK },

  // FOOTER
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 18, paddingTop: 10 },

  primary: {
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: PINK,
  },

  primaryText: { fontFamily: FONTS.semibold, fontSize: 16, color: "#FFFFFF" },
});
