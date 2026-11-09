// ==========================================
// CREATE YOUR GROUP · COMPUTER (Figma D5 · Desktop create group workspace)
// ==========================================
// The four steps of app/group/new.tsx side by side, in compact white cards:
//   Group type | Basics + Contacts | Joining & privacy | Notification preferences
// with the step tabs on top and "Back / Create group" at the bottom.
// Only the layout is new: every value and action comes from new.tsx, so the
// fields, checks and the create request are exactly the phone's.
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import type { ReactNode } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";

import PeoplePicker from "@/components/groups/PeoplePicker";
import { themedStyles, useInk, useThemedStyles } from "@/constants/chatTheme";
import { FONTS } from "@/constants/fonts";
import type { GroupAudience, GroupJoinMode, GroupKind, GroupPerson } from "@/services/groups";

const PINK = "#C34D9C";
const INK = "#24283C";
const MUTED = "#66738A";

type Kind = { value: GroupKind; icon: keyof typeof Ionicons.glyphMap; title: string; text: string };
type Notify = "all" | "sparks" | "mute";

function Box({ checked }: { checked: boolean }) {
  const styles = useThemedStyles(STYLE_PAIR);
  return (
    <View style={[styles.box, checked && styles.boxOn]}>
      {checked ? <Ionicons name="checkmark" size={14} color="#FFFFFF" /> : null}
    </View>
  );
}

function Radio({ on }: { on: boolean }) {
  const ink = useInk();
  return (
    <Ionicons
      name={on ? "checkmark-circle-outline" : "ellipse-outline"}
      size={20}
      color={ink.text(PINK)}
    />
  );
}

function Card({ title, children }: { title?: string; children: ReactNode }) {
  const styles = useThemedStyles(STYLE_PAIR);
  return (
    <View style={styles.card}>
      {title ? <Text style={styles.cardTitle}>{title}</Text> : null}
      {children}
    </View>
  );
}

function ChoiceRow({
  title,
  hint,
  on,
  onPress,
  last,
}: {
  title: string;
  hint?: string;
  on: boolean;
  onPress: () => void;
  last?: boolean;
}) {
  const styles = useThemedStyles(STYLE_PAIR);
  return (
    <Pressable style={[styles.row, last && styles.rowLast]} onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected: on }}>
      <View style={styles.flex}>
        <Text style={styles.rowTitle}>{title}</Text>
        {hint ? <Text style={styles.rowHint}>{hint}</Text> : null}
      </View>
      <Radio on={on} />
    </Pressable>
  );
}

function LinkRow({ title, onPress, last }: { title: string; onPress: () => void; last?: boolean }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const ink = useInk();
  return (
    <Pressable style={[styles.row, last && styles.rowLast]} onPress={onPress}>
      <Text style={[styles.rowTitle, styles.flex]}>{title}</Text>
      <Ionicons name="chevron-forward" size={16} color={ink.text(PINK)} />
    </Pressable>
  );
}

function Note({ children }: { children: ReactNode }) {
  const styles = useThemedStyles(STYLE_PAIR);
  return (
    <View style={styles.note}>
      <Text style={styles.noteText}>{children}</Text>
    </View>
  );
}

export default function DesktopCreateGroup({
  kinds,
  kind,
  onKind,
  photoUri,
  onPickPhoto,
  name,
  onName,
  description,
  onDescription,
  selected,
  onTogglePerson,
  pickedCount,
  joinMode,
  onJoinMode,
  sizeLimit,
  onSizeLimit,
  memberList,
  onMemberList,
  whoCanAdd,
  onWhoCanAdd,
  notify,
  onNotify,
  creating,
  onCreate,
  onBack,
}: {
  kinds: Kind[];
  kind: GroupKind;
  onKind: (kind: GroupKind) => void;
  photoUri: string | null;
  onPickPhoto: () => void;
  name: string;
  onName: (value: string) => void;
  description: string;
  onDescription: (value: string) => void;
  selected: Record<string, GroupPerson>;
  onTogglePerson: (person: GroupPerson) => void;
  pickedCount: number;
  joinMode: GroupJoinMode;
  onJoinMode: (mode: GroupJoinMode) => void;
  sizeLimit: string;
  onSizeLimit: (value: string) => void;
  memberList: GroupAudience;
  onMemberList: (value: GroupAudience) => void;
  whoCanAdd: GroupAudience;
  onWhoCanAdd: (value: GroupAudience) => void;
  notify: Notify;
  onNotify: (value: Notify) => void;
  creating: boolean;
  onCreate: () => void;
  onBack: () => void;
}) {
  const styles = useThemedStyles(STYLE_PAIR);
  const ink = useInk();
  const kindIcon = kinds.find((item) => item.value === kind)?.icon || "people-outline";
  const audience = (value: GroupAudience) => (value === "members" ? "Members" : "Admins");
  const tabs = [
    { label: "1 · Type", done: true },
    { label: "2 · Basics", done: !!name.trim() },
    { label: "3 · Members", done: pickedCount > 0 },
    { label: "4 · Joining & privacy", done: false, on: true },
  ];
  const summary =
    (kind === "faction" ? "Your group will start with your faction's members" : "You'll be the owner") +
    (pickedCount ? ` and ${pickedCount} contact ${pickedCount === 1 ? "invitation" : "invitations"}.` : ".");

  return (
    <View style={styles.page}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* TITLE */}
        <View style={styles.titleRow}>
          <Text style={styles.title}>Create your group</Text>
          <View style={styles.chip}>
            <Text style={styles.chipText}>User-created · not an orchestrator account</Text>
          </View>
        </View>

        {/* STEP TABS */}
        <View style={styles.tabs}>
          {tabs.map((tab) => (
            <View key={tab.label} style={[styles.tab, tab.on && styles.tabOn]}>
              <Text style={[styles.tabText, (tab.on || tab.done) && styles.tabTextOn]}>
                {tab.label}
                {tab.done ? " ✓" : ""}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.columns}>
          {/* 1 · GROUP TYPE */}
          <View style={styles.column}>
            <Text style={styles.colTitle}>Group type</Text>
            {kinds.map((item) => {
              const on = item.value === kind;
              return (
                <Pressable
                  key={item.value}
                  style={[styles.kind, on && styles.kindOn]}
                  onPress={() => onKind(item.value)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}>
                  <View style={styles.kindHead}>
                    <Ionicons name={item.icon} size={18} color={ink.text(PINK)} />
                    <Text style={styles.kindTitle}>{item.title}</Text>
                    <Box checked={on} />
                  </View>
                  <Text style={styles.kindText}>{item.text}</Text>
                </Pressable>
              );
            })}
            <Text style={styles.footnote}>
              Orchestrators create regional faction groups. Users create local spaces, communities and private teams.
            </Text>
          </View>

          {/* 2 · BASICS + CONTACTS */}
          <View style={styles.column}>
            <Card title="Basics">
              <Pressable style={styles.photoRow} onPress={onPickPhoto}>
                <View style={styles.photoBox}>
                  {photoUri ? (
                    <Image source={{ uri: photoUri }} style={styles.photo} contentFit="cover" />
                  ) : (
                    <Ionicons name={kindIcon} size={22} color={ink.text(PINK)} />
                  )}
                </View>
                <Text style={styles.link}>Change photo / icon</Text>
              </Pressable>
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Group name</Text>
                <TextInput
                  value={name}
                  onChangeText={onName}
                  placeholder="e.g. Barrio Logan Ascendants"
                  placeholderTextColor={ink.text("#9AA3B5")}
                  maxLength={80}
                  style={styles.input}
                />
              </View>
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Description</Text>
                <TextInput
                  value={description}
                  onChangeText={onDescription}
                  placeholder="What is this group for?"
                  placeholderTextColor={ink.text("#9AA3B5")}
                  multiline
                  maxLength={300}
                  style={[styles.input, styles.inputTall]}
                />
              </View>
            </Card>

            <Card title={`Contacts${pickedCount ? ` · ${pickedCount} selected` : ""}`}>
              <View style={styles.picker}>
                <PeoplePicker selected={selected} onToggle={onTogglePerson} max={50} />
              </View>
              <Text style={styles.footnote}>
                {kind === "faction"
                  ? "Faction members join automatically; selected contacts receive invitations."
                  : "Selected contacts are added to the group. They don't get admin powers."}
              </Text>
            </Card>
          </View>

          {/* 3 · JOINING & PRIVACY */}
          <View style={styles.column}>
            <Text style={styles.colTitle}>Joining & privacy</Text>
            <Card title="Invite-link joining">
              <ChoiceRow
                title="Admin approval"
                hint={joinMode === "approval" ? "Selected · review each request" : "Review each request"}
                on={joinMode === "approval"}
                onPress={() => onJoinMode("approval")}
              />
              <ChoiceRow
                title="Instant join"
                hint="Anyone with an eligible link can join"
                on={joinMode === "instant"}
                onPress={() => onJoinMode("instant")}
                last
              />
            </Card>
            <Card>
              <Text style={styles.fieldLabel}>Group size limit</Text>
              <TextInput
                value={sizeLimit}
                onChangeText={(value) => onSizeLimit(value.replace(/\D/g, ""))}
                keyboardType="number-pad"
                maxLength={4}
                style={styles.input}
              />
              <Text style={styles.rowHint}>Editable example configuration, not a universal cap.</Text>
            </Card>
            <Card title="Privacy">
              <LinkRow
                title={`Member list visible to · ${audience(memberList)}`}
                onPress={() => onMemberList(memberList === "members" ? "admins" : "members")}
              />
              <LinkRow
                title={`Who can add people · ${audience(whoCanAdd)}`}
                onPress={() => onWhoCanAdd(whoCanAdd === "members" ? "admins" : "members")}
                last
              />
            </Card>
            <Note>
              Faction members join automatically. This setting applies to shared-link requests. Private groups always
              require manual invitations.
            </Note>
          </View>

          {/* 4 · NOTIFICATION PREFERENCES */}
          <View style={styles.column}>
            <Text style={styles.colTitle}>Notification preferences</Text>
            <Card title="Notification controls">
              <ChoiceRow title="All activity audible" on={notify === "all"} onPress={() => onNotify("all")} />
              <ChoiceRow title="Mute only Sparks/thread activity" on={notify === "sparks"} onPress={() => onNotify("sparks")} />
              <ChoiceRow title="Mute entire group" on={notify === "mute"} onPress={() => onNotify("mute")} last />
            </Card>
            <Note>
              Choose how the group notifies you. Read receipts are never mandatory and do not affect group creation.
            </Note>
          </View>
        </View>
      </ScrollView>

      {/* FOOTER */}
      <View style={styles.footer}>
        <Text style={styles.summary} numberOfLines={2}>
          {summary}
        </Text>
        <Pressable style={[styles.button, styles.back]} onPress={onBack}>
          <Text style={styles.backText}>Back</Text>
        </Pressable>
        <Pressable
          style={[styles.button, styles.create, (!name.trim() || creating) && styles.off]}
          onPress={onCreate}
          disabled={!name.trim() || creating}>
          {creating ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.createText}>Create group</Text>}
        </Pressable>
      </View>
    </View>
  );
}

const STYLE_PAIR = themedStyles(
  {
    flex: { flex: 1, minWidth: 0 },
    off: { opacity: 0.5 },
    page: { flex: 1 },
    scroll: { paddingHorizontal: 26, paddingTop: 22, paddingBottom: 24 },

    titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
    title: { fontFamily: FONTS.regular, fontSize: 26, color: INK },
    chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: "#F3DDED" },
    chipText: { fontFamily: FONTS.medium, fontSize: 11, color: PINK },

    tabs: { flexDirection: "row", gap: 18, marginTop: 18, marginBottom: 20 },
    tab: { flex: 1, paddingHorizontal: 12, paddingVertical: 11, borderRadius: 10, backgroundColor: "#FFFFFF" },
    tabOn: { backgroundColor: "#F3DDED" },
    tabText: { fontFamily: FONTS.medium, fontSize: 12.5, color: MUTED },
    tabTextOn: { color: PINK },

    columns: { flexDirection: "row", alignItems: "flex-start", gap: 18 },
    column: { flex: 1, minWidth: 0, gap: 12 },
    colTitle: { fontFamily: FONTS.regular, fontSize: 16, color: INK, marginBottom: 2 },

    kind: {
      padding: 12,
      borderRadius: 12,
      backgroundColor: "#FFFFFF",
      borderWidth: 1,
      borderColor: "rgba(36,40,60,0.08)",
    },
    kindOn: { backgroundColor: "#F3DDED", borderColor: PINK },
    kindHead: { flexDirection: "row", alignItems: "center", gap: 8 },
    kindTitle: { flex: 1, fontFamily: FONTS.medium, fontSize: 13.5, color: INK },
    kindText: { marginTop: 6, fontFamily: FONTS.regular, fontSize: 11.5, lineHeight: 16, color: MUTED },
    box: {
      width: 18,
      height: 18,
      borderRadius: 4,
      borderWidth: 1.5,
      borderColor: "#C9CFDB",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#FFFFFF",
    },
    boxOn: { backgroundColor: PINK, borderColor: PINK },

    card: {
      padding: 12,
      borderRadius: 12,
      backgroundColor: "#FFFFFF",
      borderWidth: 1,
      borderColor: "rgba(36,40,60,0.06)",
      shadowColor: "#000000",
      shadowOpacity: 0.05,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: 2 },
    },
    cardTitle: { fontFamily: FONTS.regular, fontSize: 14, color: INK, marginBottom: 8 },

    photoRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
    photoBox: {
      width: 40,
      height: 40,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
      backgroundColor: "#F3DDED",
    },
    photo: { width: 40, height: 40 },
    link: { fontFamily: FONTS.regular, fontSize: 12, color: PINK },

    field: { marginTop: 8 },
    fieldLabel: { fontFamily: FONTS.regular, fontSize: 11, color: MUTED, marginBottom: 4 },
    input: {
      minHeight: 40,
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: "rgba(102,115,138,0.25)",
      backgroundColor: "#FFFFFF",
      fontFamily: FONTS.regular,
      fontSize: 13.5,
      color: INK,
      ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null),
    },
    inputTall: { minHeight: 70, textAlignVertical: "top" },
    picker: { maxHeight: 360, overflow: "hidden" },

    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: "rgba(36,40,60,0.08)",
    },
    rowLast: { borderBottomWidth: 0 },
    rowTitle: { fontFamily: FONTS.regular, fontSize: 12.5, color: INK },
    rowHint: { marginTop: 2, fontFamily: FONTS.regular, fontSize: 11, color: MUTED },

    note: { padding: 12, borderRadius: 12, backgroundColor: "#F3DDED" },
    noteText: { fontFamily: FONTS.regular, fontSize: 11.5, lineHeight: 16, color: PINK },
    footnote: { marginTop: 4, fontFamily: FONTS.regular, fontSize: 11, lineHeight: 15, color: MUTED },

    footer: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      paddingHorizontal: 26,
      paddingVertical: 14,
    },
    summary: { flex: 1, fontFamily: FONTS.regular, fontSize: 12.5, color: MUTED },
    button: { width: 200, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
    back: { backgroundColor: "#F0EDF9" },
    backText: { fontFamily: FONTS.medium, fontSize: 14, color: PINK },
    create: { backgroundColor: PINK },
    createText: { fontFamily: FONTS.medium, fontSize: 14, color: "#FFFFFF" },
  },
  {
    title: { color: "#F4F5FA" },
    chip: { backgroundColor: "#40283B" },
    chipText: { color: "#F0A6D7" },
    tab: { backgroundColor: "#252837" },
    tabOn: { backgroundColor: "#40283B" },
    tabText: { color: "#B5BBCB" },
    tabTextOn: { color: "#F0A6D7" },
    colTitle: { color: "#F4F5FA" },
    kind: { backgroundColor: "#252837", borderColor: "rgba(255,255,255,0.10)" },
    kindOn: { backgroundColor: "#40283B", borderColor: PINK },
    kindTitle: { color: "#F4F5FA" },
    kindText: { color: "#B5BBCB" },
    box: { backgroundColor: "#1D1F2C", borderColor: "#6E7690" },
    boxOn: { backgroundColor: PINK, borderColor: PINK },
    card: { backgroundColor: "#252837", borderColor: "rgba(255,255,255,0.10)" },
    cardTitle: { color: "#F4F5FA" },
    photoBox: { backgroundColor: "#40283B" },
    link: { color: "#F0A6D7" },
    fieldLabel: { color: "#B5BBCB" },
    input: { backgroundColor: "#1D1F2C", borderColor: "rgba(255,255,255,0.16)", color: "#F4F5FA" },
    row: { borderBottomColor: "rgba(255,255,255,0.08)" },
    rowTitle: { color: "#F4F5FA" },
    rowHint: { color: "#B5BBCB" },
    note: { backgroundColor: "#40283B" },
    noteText: { color: "#F0A6D7" },
    footnote: { color: "#B5BBCB" },
    summary: { color: "#B5BBCB" },
    back: { backgroundColor: "#343044" },
    backText: { color: "#F0A6D7" },
  },
);
