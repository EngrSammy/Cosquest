// ==========================================
// ADMIN SCREENS - shared pieces (Figma M28-M31)
// ==========================================
// Screen frame (gradient, ‹ title / subtitle ✕), chips, section labels,
// white cards, person rows (avatar, name, Owner/Admin, rank line), the lilac
// confirmation card, and buttons. Built from the screenshots for testing.
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { RankLine } from "@/components/chat/RankBadge";
import { FONTS } from "@/constants/fonts";
import type { GroupMember, GroupPerson } from "@/services/groups";
import { safeBack } from "@/utils/safeBack";

export const A = {
  pink: "#B63D91",
  ink: "#24283C",
  muted: "#66738A",
  lilac: "#F0EDF9",
  pinkSoft: "#F3DDED",
  line: "rgba(36,40,60,0.08)",
  danger: "#C0394B",
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

export function firstName(person?: GroupPerson | null) {
  return String(person?.name || person?.username || "them").split(" ")[0];
}

export function AdminScreen({
  title,
  subtitle,
  children,
  loading,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  loading?: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <LinearGradient colors={["#F6F9FE", "#E3F0FC"]} style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => safeBack()} hitSlop={10} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={26} color={A.ink} />
        </Pressable>
        <View style={styles.flex}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        <Pressable onPress={() => safeBack()} hitSlop={10} accessibilityLabel="Close">
          <Ionicons name="close" size={26} color={A.muted} />
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator color={A.pink} style={styles.loading} />
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 30 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          {children}
        </ScrollView>
      )}
    </LinearGradient>
  );
}

export function Chip({ children }: { children: ReactNode }) {
  return (
    <View style={styles.chip}>
      <Text style={styles.chipText}>{children}</Text>
    </View>
  );
}

export function Section({ children }: { children: ReactNode }) {
  return <Text style={styles.section}>{children}</Text>;
}

export function Card({ children, padded }: { children: ReactNode; padded?: boolean }) {
  return <View style={[styles.card, padded && styles.cardPadded]}>{children}</View>;
}

export function Note({ children }: { children: ReactNode }) {
  return <Text style={styles.note}>{children}</Text>;
}

export function PersonAvatar({ person, size = 44 }: { person: GroupPerson; size?: number }) {
  const name = person.name || person.username;
  const round = { width: size, height: size, borderRadius: size / 2 };
  return person.avatarPhotoUrl ? (
    <Image source={{ uri: person.avatarPhotoUrl }} style={round} contentFit="cover" />
  ) : (
    <View style={[round, styles.avatar, { backgroundColor: avatarTint(name) }]}>
      <Text style={styles.avatarText}>{initialsOf(name)}</Text>
    </View>
  );
}

export function PersonRow({
  person,
  role,
  detail,
  onPress,
  last,
  selected,
  right,
}: {
  person: GroupPerson | GroupMember;
  role?: string | null;
  detail?: string;
  onPress?: () => void;
  last?: boolean;
  selected?: boolean;
  right?: ReactNode;
}) {
  const name = person.name || person.username;
  const shownRole = role ?? (person as GroupMember).role;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={[styles.row, last && styles.rowLast, selected && styles.rowSelected]}>
      <PersonAvatar person={person} />
      <View style={styles.flex}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
          {shownRole === "owner" || shownRole === "admin" ? (
            <Text style={styles.role}>{shownRole === "owner" ? "Owner" : "Admin"}</Text>
          ) : null}
        </View>
        <RankLine rank={person.rank} />
        {detail ? (
          <Text style={styles.detail} numberOfLines={2}>
            {detail}
          </Text>
        ) : null}
      </View>
      {right ?? (onPress ? <Ionicons name="chevron-forward" size={20} color={A.muted} /> : null)}
    </Pressable>
  );
}

export function PrimaryButton({
  label,
  onPress,
  busy,
  disabled,
  danger,
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <Pressable
      style={[styles.primary, danger && styles.primaryDanger, (disabled || busy) && styles.off]}
      disabled={disabled || busy}
      onPress={onPress}>
      {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>{label}</Text>}
    </Pressable>
  );
}

export function SoftButton({
  label,
  onPress,
  danger,
  flex,
  disabled,
}: {
  label: string;
  onPress: () => void;
  danger?: boolean;
  flex?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable style={[styles.soft, flex && styles.flex, disabled && styles.off]} onPress={onPress} disabled={disabled}>
      <Text style={[styles.softText, danger && styles.dangerText]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

// The lilac "Make Diego an admin?" card.
export function ConfirmCard({
  title,
  text,
  extraTitle,
  extraText,
  confirmLabel,
  onConfirm,
  cancelLabel = "Cancel",
  onCancel,
  busy,
  danger,
  children,
}: {
  title: string;
  text?: string;
  extraTitle?: string;
  extraText?: string;
  confirmLabel: string;
  onConfirm: () => void;
  cancelLabel?: string;
  onCancel: () => void;
  busy?: boolean;
  danger?: boolean;
  children?: ReactNode;
}) {
  return (
    <View style={styles.confirm}>
      <Text style={styles.confirmTitle}>{title}</Text>
      {text ? <Text style={styles.confirmText}>{text}</Text> : null}
      {extraTitle ? <Text style={styles.extraTitle}>{extraTitle}</Text> : null}
      {extraText ? <Text style={styles.extraText}>{extraText}</Text> : null}
      {children}
      <PrimaryButton label={confirmLabel} onPress={onConfirm} busy={busy} danger={danger} />
      <Pressable onPress={onCancel} style={styles.cancel} hitSlop={6}>
        <Text style={styles.cancelText}>{cancelLabel}</Text>
      </Pressable>
    </View>
  );
}

export function ConceptBanner({ title, text }: { title: string; text: string }) {
  return (
    <View style={styles.concept}>
      <Text style={styles.conceptTitle}>{title}</Text>
      <Text style={styles.conceptText}>{text}</Text>
    </View>
  );
}

// Small selectable pills (slow mode, mute length).
export function Pills<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.pills}>
      {options.map((option) => {
        const on = option.value === value;
        return (
          <Pressable key={option.value} onPress={() => onChange(option.value)} style={[styles.pill, on && styles.pillOn]}>
            <Text style={[styles.pillText, on && styles.pillTextOn]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export const adminStyles = StyleSheet.create({
  twoButtons: { flexDirection: "row", gap: 10, marginTop: 12 },
  threeButtons: { flexDirection: "row", gap: 8, marginTop: 12 },
});

const styles = StyleSheet.create({
  screen: { flex: 1 },

  flex: { flex: 1, minWidth: 0 },

  off: { opacity: 0.5 },

  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingBottom: 8 },

  title: { fontFamily: FONTS.semibold, fontSize: 22, lineHeight: 28, color: A.ink },

  subtitle: { marginTop: 2, fontFamily: FONTS.regular, fontSize: 12, color: A.muted },

  loading: { marginTop: 40 },

  content: { paddingHorizontal: 18, paddingTop: 12 },

  chip: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: A.pinkSoft },

  chipText: { fontFamily: FONTS.semibold, fontSize: 11, color: A.pink },

  section: { marginTop: 20, marginBottom: 8, fontFamily: FONTS.semibold, fontSize: 12, letterSpacing: 0.4, color: A.muted },

  card: { paddingHorizontal: 14, borderRadius: 18, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: A.line },

  cardPadded: { paddingVertical: 14 },

  note: { marginTop: 10, fontFamily: FONTS.regular, fontSize: 12, lineHeight: 17, color: A.muted },

  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: A.line },

  rowLast: { borderBottomWidth: 0 },

  rowSelected: { backgroundColor: "rgba(182,61,145,0.05)" },

  avatar: { alignItems: "center", justifyContent: "center" },

  avatarText: { fontFamily: FONTS.bold, fontSize: 12, color: "#7D356D" },

  nameRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 3 },

  name: { flexShrink: 1, fontFamily: FONTS.semibold, fontSize: 15, color: A.ink },

  role: { fontFamily: FONTS.semibold, fontSize: 11, color: A.pink },

  detail: { marginTop: 3, fontFamily: FONTS.regular, fontSize: 12, color: A.muted },

  primary: { marginTop: 14, height: 52, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: A.pink },

  primaryDanger: { backgroundColor: A.danger },

  primaryText: { fontFamily: FONTS.semibold, fontSize: 16, color: "#FFFFFF" },

  soft: {
    height: 48,
    paddingHorizontal: 10,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: A.lilac,
  },

  softText: { fontFamily: FONTS.semibold, fontSize: 15, color: A.pink },

  dangerText: { color: A.danger },

  confirm: { marginTop: 18, padding: 18, borderRadius: 22, backgroundColor: A.lilac },

  confirmTitle: { fontFamily: FONTS.semibold, fontSize: 20, lineHeight: 26, color: A.ink },

  confirmText: { marginTop: 8, fontFamily: FONTS.regular, fontSize: 14, lineHeight: 21, color: A.muted },

  extraTitle: { marginTop: 14, fontFamily: FONTS.semibold, fontSize: 13, color: A.pink },

  extraText: { marginTop: 4, fontFamily: FONTS.regular, fontSize: 12.5, lineHeight: 18, color: A.muted },

  cancel: { alignSelf: "center", marginTop: 14 },

  cancelText: { fontFamily: FONTS.semibold, fontSize: 15, color: A.pink },

  concept: { padding: 14, borderRadius: 16, backgroundColor: "#FDF0D5", marginBottom: 6 },

  conceptTitle: { fontFamily: FONTS.semibold, fontSize: 13, color: "#8A5A00" },

  conceptText: { marginTop: 4, fontFamily: FONTS.regular, fontSize: 12.5, lineHeight: 18, color: "#8A5A00" },

  pills: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },

  pill: { paddingHorizontal: 12, height: 32, borderRadius: 16, justifyContent: "center", backgroundColor: A.lilac },

  pillOn: { backgroundColor: A.pink },

  pillText: { fontFamily: FONTS.semibold, fontSize: 12.5, color: A.pink },

  pillTextOn: { color: "#FFFFFF" },
});
