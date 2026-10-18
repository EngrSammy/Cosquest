// ==========================================
// CREATE A GROUP (Figma M20-M24)
// ==========================================
// Step 1 (M20) Choose group type · Step 2 (M21) Group basics · Step 3 (M22)
// Add contacts · Step 4 (M23) Joining, privacy & notifications · then
// "Your group is ready" (M24) with the share link and first members.
//
// Built on the shared pieces in components/chat/ui.tsx and the light/dark
// system in constants/chatTheme.ts, so it follows the same Figma values as
// the chat sheets (pink #C34D9C, buttons radius 14, cards radius 18, 20px
// between sections, white -> #D5F1FF background) and switches to dark mode
// by itself. All the logic is unchanged from the previous version.
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Share,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { RankLine } from "@/components/chat/RankBadge";
import {
  Card,
  FieldLabel,
  PrimaryButton,
  ScreenGradient,
  SheetHeader,
  TextField,
  UI,
} from "@/components/chat/ui";
import PeoplePicker, { personKey } from "@/components/groups/PeoplePicker";
import { themedStyles, useInk, useThemedStyles } from "@/constants/chatTheme";
import { FONTS } from "@/constants/fonts";
import { setSparksMuted } from "@/services/chatPrefs";
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

type Step = 1 | 2 | 3 | 4;
type NotifyChoice = "all" | "sparks" | "mute";

const KINDS: {
  value: GroupKind;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  text: string;
}[] = [
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
  for (const char of String(name || ""))
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return AVATAR_TINTS[hash % AVATAR_TINTS.length];
}

function initialsOf(name?: string) {
  const parts = String(name || "?")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const letters =
    parts.length > 1
      ? parts[0][0] + parts[1][0]
      : (parts[0] || "?").slice(0, 2);
  return letters.toUpperCase();
}

function namesOf(people: GroupPerson[]) {
  const names = people.map((person) => person.name || person.username);
  if (names.length <= 2) return names.join(" & ");
  return `${names.slice(0, 2).join(", ")} & ${names.length - 2} more`;
}

// ---------- small pieces ----------

function Radio({ on }: { on: boolean }) {
  const ink = useInk();
  return on ? (
    <Ionicons
      name="checkmark-circle-outline"
      size={24}
      color={ink.text(UI.PINK)}
    />
  ) : (
    <Ionicons name="ellipse-outline" size={24} color={ink.text(UI.MUTED)} />
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
  const styles = useThemedStyles(STYLE_PAIR);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.row, last && styles.rowLast, disabled && styles.off]}
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

function LinkRow({
  title,
  value,
  onPress,
  last,
}: {
  title: string;
  value: string;
  onPress: () => void;
  last?: boolean;
}) {
  const styles = useThemedStyles(STYLE_PAIR);
  const ink = useInk();
  return (
    <Pressable onPress={onPress} style={[styles.row, last && styles.rowLast]}>
      <View style={styles.flex}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowHint}>{value}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={ink.text(UI.MUTED)} />
    </Pressable>
  );
}

function MemberLine({
  member,
  onPress,
}: {
  member: GroupMember;
  onPress: () => void;
}) {
  const styles = useThemedStyles(STYLE_PAIR);
  const ink = useInk();
  const name = member.name || member.username;
  return (
    <Pressable onPress={onPress} style={styles.memberRow}>
      {member.avatarPhotoUrl ? (
        <Image
          source={{ uri: member.avatarPhotoUrl }}
          style={styles.memberPhoto}
          contentFit="cover"
        />
      ) : (
        <View
          style={[
            styles.memberAvatar,
            { backgroundColor: ink.surface(avatarTint(name)) },
          ]}>
          <Text style={styles.memberInitials}>{initialsOf(name)}</Text>
        </View>
      )}
      <View style={styles.flex}>
        <View style={styles.memberNameRow}>
          <Text style={styles.memberName} numberOfLines={1}>
            {name}
          </Text>
          {member.role !== "member" ? (
            <Text style={styles.memberRole}>
              {member.role === "owner" ? "Owner" : "Admin"}
            </Text>
          ) : null}
        </View>
        <RankLine rank={(member as any).rank} />
      </View>
      <Ionicons name="chevron-forward" size={20} color={ink.text(UI.MUTED)} />
    </Pressable>
  );
}

function InfoBox({ title, children }: { title?: string; children: string }) {
  const styles = useThemedStyles(STYLE_PAIR);
  return (
    <View style={styles.infoBox}>
      {title ? <Text style={styles.infoTitle}>{title}</Text> : null}
      <Text style={styles.infoText}>{children}</Text>
    </View>
  );
}

// ==========================================
// SCREEN
// ==========================================

export default function NewGroup() {
  const styles = useThemedStyles(STYLE_PAIR);
  const ink = useInk();
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();

  const token = useAppSelector((state) => state.auth.token);
  const user = useAppSelector((state) => state.user.user) as any;
  const authUser = useAppSelector((state) => state.auth.user) as any;
  const myFaction: string | null = user?.faction || authUser?.faction || null;
  const myUsername: string =
    user?.profile?.username || authUser?.profile?.username || "you";
  // Figma M24: "by Sarthak" - the display name when there is one.
  const myName =
    useAppSelector((state) => {
      const profile = (state.auth.user as any)?.profile;
      return profile?.displayName || profile?.firstName || "";
    }) || myUsername;

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
  const [created, setCreated] = useState<{
    group: Group;
    chatId: string;
  } | null>(null);
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

  const next = () => {
    if (step === 1 && kind === "faction" && !myFaction) {
      Alert.alert(
        "Faction group",
        "Join a faction first to create a faction group.",
      );
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
      router.replace({
        pathname: "/chat/[id]",
        params: { id: created.chatId },
      });
      return;
    }
    if (step > 1) setStep((current) => (current - 1) as Step);
    else safeBack();
  };

  const create = async () => {
    if (!token || creating) return;
    const limit = Math.min(
      1024,
      Math.max(2, Number(sizeLimit.replace(/\D/g, "")) || 100),
    );

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

      // "Mute entire group": muted for me straight away.
      if (notify === "mute") {
        muteGroup(result.group.id, true, "always", token).catch(() => {});
      }
      if (notify === "sparks") {
        setSparksMuted(result.group.id, true, token).catch(() => {});
      }

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

      setCreated({ group: result.group, chatId: result.chatId });
      getGroupMembers(result.group.id, {}, token)
        .then((list) => {
          setMembers(list.members);
          setMemberTotal(list.total || list.members.length);
        })
        .catch(() => {});
    } catch (error) {
      Alert.alert(
        "Create a group",
        error instanceof Error ? error.message : "Couldn't create the group.",
      );
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
      await Share.share({
        message: `Join "${created.group.name}" on CosQuest: ${link}`,
      });
    } catch {
      // closed
    }
  };

  const kindIcon =
    KINDS.find((item) => item.value === kind)?.icon || "people-outline";
  const openChat = () =>
    created &&
    router.replace({ pathname: "/chat/[id]", params: { id: created.chatId } });

  // ---------- header text ----------
  const headerTitle = created ? "Your group is ready" : STEP_TITLE[step];
  const headerSubtitle = created
    ? `Created ${new Date().toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" })} · by ${myName}`
    : step === 4
      ? `${KIND_LABEL[kind]} group`
      : undefined;

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
    <View style={styles.screen}>
      <ScreenGradient />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {/* HEADER */}
        <View style={[styles.headerWrap, { paddingTop: insets.top + 12 }]}>
          <SheetHeader
            title={headerTitle}
            subtitle={headerSubtitle}
            onBack={back}
            onClose={created ? openChat : safeBack}
          />
        </View>

        <ScrollView
          style={styles.flex}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + 110 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          {!created ? (
            <>
              {/* PROGRESS */}
              <Text style={styles.stepLabel}>STEP {step} OF 4</Text>
              <View style={styles.progress}>
                {[1, 2, 3, 4].map((index) => (
                  <View
                    key={index}
                    style={[
                      styles.progressBar,
                      index <= step && styles.progressOn,
                    ]}
                  />
                ))}
              </View>
            </>
          ) : null}

          {/* ---------- STEP 1 (M20) ---------- */}
          {!created && step === 1 ? (
            <>
              <Text style={styles.bigTitle}>A space for your people.</Text>
              <Text style={styles.lead}>
                Choose how your group comes together.
              </Text>

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
                        <Ionicons
                          name={item.icon}
                          size={22}
                          color={ink.text(UI.PINK)}
                        />
                      </View>
                      <Text style={styles.typeTitle}>{item.title}</Text>
                      <View style={[styles.checkbox, on && styles.checkboxOn]}>
                        {on ? (
                          <Ionicons
                            name="checkmark"
                            size={16}
                            color="#FFFFFF"
                          />
                        ) : null}
                      </View>
                    </View>
                    <Text style={styles.typeText}>{item.text}</Text>
                  </Pressable>
                );
              })}

              <InfoBox title="Local · created by you">
                Groups you create are local. Regional groups such as SoCal
                Ascendants are created by orchestrators.
              </InfoBox>
            </>
          ) : null}

          {/* ---------- STEP 2 (M21) ---------- */}
          {!created && step === 2 ? (
            <>
              <Pressable
                onPress={pickPhoto}
                style={styles.photoWrap}
                accessibilityLabel="Upload photo">
                {photo ? (
                  <Image
                    source={{ uri: photo.uri }}
                    style={styles.photo}
                    contentFit="cover"
                  />
                ) : (
                  <View style={styles.photoIcon}>
                    <Ionicons
                      name={kindIcon}
                      size={44}
                      color={ink.text(UI.PINK)}
                    />
                  </View>
                )}
                <Text style={styles.photoLink}>
                  {photo ? "Change photo" : "Upload photo or choose icon"}
                </Text>
              </Pressable>

              <View style={styles.chip}>
                <Text style={styles.chipText}>
                  {KIND_LABEL[kind]} · created by you
                </Text>
              </View>

              <FieldLabel>Group name</FieldLabel>
              <TextField
                value={name}
                onChangeText={setName}
                placeholder="e.g. Barrio Logan Ascendants"
                maxLength={60}
              />

              <FieldLabel>Description</FieldLabel>
              <TextField
                value={description}
                onChangeText={setDescription}
                placeholder="What is this group for?"
                maxLength={300}
                multiline
                style={styles.textArea}
              />
              <Text style={styles.hint}>
                Help people know what to expect in this group.
              </Text>
              <Text style={[styles.hint, styles.hintGap]}>
                Your name and icon appear in chats and invitations. Admins can
                update these later.
              </Text>
            </>
          ) : null}

          {/* ---------- STEP 3 (M22) ---------- */}
          {!created && step === 3 ? (
            <>
              <InfoBox
                title={
                  kind === "faction"
                    ? "Faction members join automatically"
                    : "Invite your people"
                }>
                {kind === "faction"
                  ? "Eligible members are already included. Selected contacts receive invitations, not admin powers."
                  : "Selected contacts are added to the group. They don't get admin powers."}
              </InfoBox>

              <View style={styles.pickerWrap}>
                <PeoplePicker
                  selected={selected}
                  onToggle={togglePerson}
                  max={50}
                />
              </View>

              {picked.length ? (
                <Text style={styles.selectedText}>
                  {picked.length} selected · {namesOf(picked)}
                </Text>
              ) : null}

              <Pressable style={styles.inviteRow} onPress={() => setStep(4)}>
                <View style={styles.flex}>
                  <Text style={styles.rowTitle}>
                    Use an invitation link instead
                  </Text>
                  <Text style={styles.rowHint}>
                    Share after your group is created
                  </Text>
                </View>
                <Ionicons
                  name="link-outline"
                  size={22}
                  color={ink.text(UI.MUTED)}
                />
              </Pressable>
            </>
          ) : null}

          {/* ---------- STEP 4 (M23) ---------- */}
          {!created && step === 4 ? (
            <>
              <Text style={[styles.section, styles.sectionFirst]}>
                INVITE-LINK JOINING
              </Text>
              <Card style={styles.listCard}>
                <ChoiceRow
                  title="Admin approval"
                  hint="Review each shared-link request"
                  on={kind === "private" || joinMode === "approval"}
                  onPress={() => setJoinMode("approval")}
                />
                <ChoiceRow
                  title="Instant invitation"
                  hint={
                    kind === "private"
                      ? "Not for private groups"
                      : "Eligible link holders join without review"
                  }
                  on={kind !== "private" && joinMode === "instant"}
                  onPress={() => setJoinMode("instant")}
                  disabled={kind === "private"}
                  last
                />
              </Card>

              <FieldLabel>Group size limit</FieldLabel>
              <TextField
                value={sizeLimit}
                onChangeText={(text) => setSizeLimit(text.replace(/\D/g, ""))}
                keyboardType="number-pad"
                maxLength={4}
              />
              <Text style={styles.hint}>
                Your group&apos;s editable limit (members)
              </Text>

              <Text style={styles.section}>GROUP PRIVACY</Text>
              <Card style={styles.listCard}>
                <LinkRow
                  title="Member list visible to"
                  value={memberList === "members" ? "Members" : "Admins"}
                  onPress={() =>
                    setMemberList((value) =>
                      value === "members" ? "admins" : "members",
                    )
                  }
                />
                <LinkRow
                  title="Who can add people"
                  value={whoCanAdd === "admins" ? "Admins" : "Members"}
                  onPress={() =>
                    setWhoCanAdd((value) =>
                      value === "admins" ? "members" : "admins",
                    )
                  }
                  last
                />
              </Card>

              <InfoBox>
                Eligible faction members join automatically. Approval applies to
                shared-link requests. Private groups always use manual
                invitations.
              </InfoBox>

              <Text style={styles.section}>YOUR NOTIFICATIONS</Text>
              <Card style={styles.listCard}>
                <ChoiceRow
                  title="All activity audible"
                  on={notify === "all"}
                  onPress={() => setNotify("all")}
                />
                <ChoiceRow
                  title="Mute only Sparks / thread activity"
                  hint="Main conversation stays audible"
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
              </Card>
            </>
          ) : null}

          {/* ---------- DONE (M24) ---------- */}
          {created ? (
            <>
              <View style={styles.readyIconWrap}>
                {created.group.photoUrl ? (
                  <Image
                    source={{ uri: created.group.photoUrl }}
                    style={styles.photo}
                    contentFit="cover"
                  />
                ) : (
                  <View style={styles.photoIcon}>
                    <Ionicons
                      name={kindIcon}
                      size={44}
                      color={ink.text(UI.PINK)}
                    />
                  </View>
                )}
              </View>
              <Text style={styles.readyName}>{created.group.name}</Text>
              <View style={[styles.chip, styles.chipCenter]}>
                <Text style={styles.chipText}>
                  {KIND_LABEL[created.group.kind]} · user-created
                </Text>
              </View>
              {created.group.description ? (
                <Text style={styles.lead}>{created.group.description}</Text>
              ) : null}

              <Text style={styles.section}>SHARE YOUR GROUP</Text>
              <Card>
                <Text style={styles.linkText} numberOfLines={2}>
                  {link || "Invite link not available"}
                </Text>
                <Text style={styles.rowHint}>
                  {created.group.joinMode === "approval"
                    ? "Shared-link requests need admin approval."
                    : "People with the link join straight away."}
                </Text>
                <View style={styles.twoButtons}>
                  <Pressable
                    style={styles.softButton}
                    onPress={copyLink}
                    disabled={!link}>
                    <Text style={styles.softButtonText}>Copy link</Text>
                  </Pressable>
                  <Pressable
                    style={styles.softButton}
                    onPress={shareLink}
                    disabled={!link}>
                    <Text style={styles.softButtonText}>Share invite</Text>
                  </Pressable>
                </View>
              </Card>

              <Text style={styles.section}>
                {memberTotal || created.group.memberCount || 1} MEMBERS
              </Text>
              <Card style={styles.listCard}>
                {created.group.kind === "faction" ? (
                  <Text style={[styles.rowHint, styles.memberNote]}>
                    Faction members were added automatically.
                  </Text>
                ) : null}
                {members.slice(0, 3).map((member) => (
                  <MemberLine
                    key={member.id}
                    member={member}
                    onPress={() =>
                      router.push({
                        pathname: "/group/[id]",
                        params: { id: created.group.id },
                      })
                    }
                  />
                ))}
                <Pressable
                  style={[styles.row, styles.rowLast]}
                  onPress={() =>
                    router.push({
                      pathname: "/group/[id]",
                      params: { id: created.group.id },
                    })
                  }>
                  <View style={styles.flex}>
                    <Text style={styles.rowTitle}>View all members</Text>
                    <Text style={styles.rowHint}>
                      Creator: {myUsername} · Owner
                    </Text>
                  </View>
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color={ink.text(UI.MUTED)}
                  />
                </Pressable>
              </Card>
            </>
          ) : null}
        </ScrollView>

        {/* FOOTER BUTTON */}
        <View style={[styles.footer, { paddingBottom: insets.bottom + 14 }]}>
          {created ? (
            <PrimaryButton
              label="Open group chat"
              onPress={openChat}
              style={styles.footerButton}
            />
          ) : (
            <PrimaryButton
              label={nextLabel}
              onPress={step === 4 ? create : next}
              disabled={step === 2 && !name.trim()}
              loading={creating}
              style={styles.footerButton}
            />
          )}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

// ---------- styles ----------

const PINK_WASH = "#F7E6F2";

const STYLE_PAIR = themedStyles(
  {
    screen: { flex: 1, backgroundColor: "transparent" },
    flex: { flex: 1, minWidth: 0 },
    off: { opacity: 0.5 },

    headerWrap: { paddingHorizontal: 18, paddingBottom: 8 },
    content: { paddingHorizontal: 18, paddingTop: 8 },

    // PROGRESS
    stepLabel: {
      marginTop: 10,
      fontFamily: FONTS.medium,
      fontSize: 11,
      letterSpacing: 0.4,
      color: UI.MUTED,
    },
    progress: {
      flexDirection: "row",
      gap: 6,
      marginTop: 8,
      marginBottom: UI.GAP,
    },
    progressBar: {
      flex: 1,
      height: 4,
      borderRadius: 2,
      backgroundColor: "#D9DEE8",
    },
    progressOn: { backgroundColor: UI.PINK },

    bigTitle: {
      fontFamily: FONTS.semibold,
      fontSize: 20,
      lineHeight: 26,
      color: UI.INK,
    },
    lead: {
      marginTop: UI.GAP,
      marginBottom: UI.GAP,
      fontFamily: FONTS.regular,
      fontSize: 14,
      lineHeight: 21,
      color: UI.MUTED,
    },

    // STEP 1: type cards (Figma: radius 14, padding 12, gap 8)
    typeCard: {
      marginBottom: 12,
      padding: 12,
      gap: 8,
      borderRadius: 14,
      backgroundColor: "rgba(255,255,255,0.94)",
      borderWidth: 1,
      borderColor: UI.BORDER,
    },
    typeCardOn: { backgroundColor: PINK_WASH, borderColor: "#B63D91" },
    typeHead: { flexDirection: "row", alignItems: "center", gap: 12 },
    typeIcon: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: UI.LILAC,
    },
    typeIconOn: { backgroundColor: "#FFFFFF" },
    typeTitle: {
      flex: 1,
      fontFamily: FONTS.semibold,
      fontSize: 16,
      color: UI.INK,
    },
    typeText: {
      fontFamily: FONTS.regular,
      fontSize: 13,
      lineHeight: 19,
      color: UI.MUTED,
    },
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
    checkboxOn: { backgroundColor: UI.PINK, borderColor: UI.PINK },

    infoBox: {
      marginTop: 4,
      marginBottom: UI.GAP,
      padding: 14,
      borderRadius: 16,
      backgroundColor: PINK_WASH,
    },
    infoTitle: {
      fontFamily: FONTS.semibold,
      fontSize: 13,
      color: UI.PINK,
      marginBottom: 4,
    },
    infoText: {
      fontFamily: FONTS.regular,
      fontSize: 12.5,
      lineHeight: 18,
      color: UI.MUTED,
    },

    // STEP 2
    photoWrap: { alignItems: "center", marginTop: 6 },
    photoIcon: {
      width: 96,
      height: 96,
      borderRadius: 24,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#F7E3F0",
    },
    photo: { width: 96, height: 96, borderRadius: 24 },
    photoLink: {
      marginTop: 14,
      fontFamily: FONTS.semibold,
      fontSize: 14,
      color: UI.PINK,
    },
    chip: {
      alignSelf: "flex-start",
      marginTop: 18,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
      backgroundColor: "#F3DDED",
    },
    chipCenter: { alignSelf: "center", marginTop: 10 },
    chipText: { fontFamily: FONTS.semibold, fontSize: 11, color: UI.PINK },
    textArea: { minHeight: 96, paddingVertical: 12, textAlignVertical: "top" },
    hint: {
      marginTop: 6,
      fontFamily: FONTS.regular,
      fontSize: 11.5,
      lineHeight: 16,
      color: UI.MUTED,
    },
    hintGap: { marginTop: 14 },

    // STEP 3
    pickerWrap: { marginTop: 2 },
    selectedText: {
      marginTop: 12,
      fontFamily: FONTS.semibold,
      fontSize: 13,
      color: UI.PINK,
    },
    inviteRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      marginTop: 14,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: "rgba(36,40,60,0.08)",
    },

    // STEP 4 + shared rows
    section: {
      marginTop: UI.GAP,
      marginBottom: 8,
      fontFamily: FONTS.semibold,
      fontSize: 12,
      letterSpacing: 0.4,
      color: UI.MUTED,
    },
    sectionFirst: { marginTop: 4 },
    // Rows carry their own padding, so the card keeps only its side padding.
    listCard: { paddingVertical: 0 },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: "rgba(36,40,60,0.08)",
    },
    rowLast: { borderBottomWidth: 0 },
    rowTitle: { fontFamily: FONTS.semibold, fontSize: 15, color: UI.INK },
    rowHint: {
      marginTop: 2,
      fontFamily: FONTS.regular,
      fontSize: 12,
      lineHeight: 17,
      color: UI.MUTED,
    },

    // M24
    readyIconWrap: { alignItems: "center", marginTop: 10 },
    readyName: {
      marginTop: 18,
      fontFamily: FONTS.semibold,
      fontSize: 22,
      color: UI.INK,
      textAlign: "center",
    },
    linkText: { fontFamily: FONTS.semibold, fontSize: 14, color: UI.PINK },
    twoButtons: { flexDirection: "row", gap: 10, marginTop: 12 },
    softButton: {
      flex: 1,
      height: 48,
      borderRadius: UI.BUTTON_RADIUS,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: UI.LILAC,
    },
    softButtonText: {
      fontFamily: FONTS.semibold,
      fontSize: 15,
      color: UI.PINK,
    },
    memberNote: { paddingTop: 14 },
    memberRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: "rgba(36,40,60,0.08)",
    },
    memberAvatar: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: "center",
      justifyContent: "center",
    },
    memberPhoto: { width: 42, height: 42, borderRadius: 21 },
    memberInitials: { fontFamily: FONTS.bold, fontSize: 12, color: "#7D356D" },
    memberNameRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginBottom: 3,
    },
    memberName: {
      flexShrink: 1,
      fontFamily: FONTS.semibold,
      fontSize: 14,
      color: UI.INK,
    },
    memberRole: { fontFamily: FONTS.semibold, fontSize: 11, color: UI.PINK },

    // FOOTER
    footer: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: 18,
      paddingTop: 10,
    },
    footerButton: { marginTop: 0 },
  },
  {
    screen: { backgroundColor: "transparent" },
    typeCard: {
      backgroundColor: "#252837",
      borderColor: "rgba(255,255,255,0.12)",
    },
    typeCardOn: { backgroundColor: "#40283B", borderColor: UI.PINK },
    typeIcon: { backgroundColor: "#343044" },
    typeIconOn: { backgroundColor: "#252837" },
    checkbox: { backgroundColor: "#252837", borderColor: "#6E7690" },
    checkboxOn: { backgroundColor: UI.PINK, borderColor: UI.PINK },
    infoBox: { backgroundColor: "#40283B" },
    photoIcon: { backgroundColor: "#40283B" },
    chip: { backgroundColor: "#40283B" },
    softButton: { backgroundColor: "#343044" },
    softButtonText: { color: "#F0A6D7" },
    memberAvatar: {},
    progressBar: { backgroundColor: "#343746" },
    progressOn: { backgroundColor: UI.PINK },
  },
);
