// ==========================================
// SUPER ADMIN DASHBOARD - list controls and confirmations
// ==========================================
// Tabs with counts, search, filter menus, paging, the "Reason · required"
// box and the pink confirm box (designs: every removal, ban, mute and delete
// is confirmed, with a reason).
import { Ionicons } from "@expo/vector-icons";
import { type ReactNode, useState } from "react";
import { Platform, Pressable, Text, TextInput, View } from "react-native";

import { FONTS } from "@/constants/fonts";

import { useAdminTheme } from "./theme";
import { Button, Pill } from "./ui";

const STATUS_TONE: Record<string, "pink" | "green" | "amber" | "blue" | "red" | "grey"> = {
  new: "blue",
  in_review: "amber",
  resolved: "green",
  dismissed: "grey",
  published: "green",
  removed: "grey",
};

export function Tabs<K extends string>({ tabs, value, onChange }: { tabs: { key: K; label: string; count?: number | null }[]; value: K; onChange: (key: K) => void }) {
  const t = useAdminTheme();
  return (
    <View style={{ flexDirection: "row", gap: 26, borderBottomWidth: 1, borderBottomColor: t.line, marginBottom: 16 }}>
      {tabs.map((tab) => {
        const on = tab.key === value;
        return (
          <Pressable key={tab.key} onPress={() => onChange(tab.key)} accessibilityRole="tab" accessibilityState={{ selected: on }} style={{ paddingBottom: 10, borderBottomWidth: 2, borderBottomColor: on ? t.pink : "transparent", marginBottom: -1 }}>
            <Text style={{ fontFamily: on ? FONTS.medium : FONTS.regular, fontSize: 13, color: on ? t.pinkText : t.muted }}>
              {tab.label}
              {tab.count != null ? `  ${tab.count}` : ""}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (text: string) => void; placeholder: string }) {
  const t = useAdminTheme();
  return (
    <View style={{ flex: 1, minWidth: 200, height: 40, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: t.border, backgroundColor: t.cardSoft }}>
      <Ionicons name="search-outline" size={16} color={t.faint} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={t.faint}
        style={{ flex: 1, fontFamily: FONTS.regular, fontSize: 13, color: t.text, ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null) }}
      />
      {value ? (
        <Pressable onPress={() => onChange("")} hitSlop={8}>
          <Ionicons name="close-circle" size={16} color={t.faint} />
        </Pressable>
      ) : null}
    </View>
  );
}

export function Select<V extends string>({ value, options, onChange, minWidth = 130 }: { value: V; options: { value: V; label: string }[]; onChange: (value: V) => void; minWidth?: number }) {
  const t = useAdminTheme();
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value) || options[0];
  return (
    <View style={{ zIndex: open ? 30 : 1 }}>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        style={{ minWidth, height: 40, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: t.border, backgroundColor: t.card }}>
        <Ionicons name="chevron-down" size={14} color={t.muted} />
        <Text style={{ fontFamily: FONTS.medium, fontSize: 12.5, color: t.text }}>{current?.label}</Text>
      </Pressable>
      {open ? (
        <View style={{ position: "absolute", top: 44, left: 0, minWidth: Math.max(minWidth, 170), padding: 6, borderRadius: 10, borderWidth: 1, borderColor: t.border, backgroundColor: t.card, shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } }}>
          {options.map((option) => (
            <Pressable
              key={option.value}
              onPress={() => {
                onChange(option.value);
                setOpen(false);
              }}
              style={({ hovered }: any) => ({ flexDirection: "row", alignItems: "center", gap: 8, padding: 9, borderRadius: 8, backgroundColor: hovered ? t.cardSoft : "transparent" })}>
              <Ionicons name="checkmark" size={14} color={option.value === value ? t.pink : "transparent"} />
              <Text style={{ fontFamily: FONTS.regular, fontSize: 12.5, color: t.text }}>{option.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function Pager({ shown, total, offset, pageSize = 25, onPage, noun }: { shown: number; total: number; offset: number; pageSize?: number; onPage: (offset: number) => void; noun: string }) {
  const t = useAdminTheme();
  const page = Math.floor(offset / pageSize) + 1;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: t.line }}>
      <Text style={{ flex: 1, fontFamily: FONTS.regular, fontSize: 12, color: t.muted }}>
        {total ? `Showing ${offset + 1}–${offset + shown} of ${total.toLocaleString("en-US")} ${noun}` : `No ${noun}`}
      </Text>
      <Button label="Previous" disabled={offset === 0} onPress={() => onPage(Math.max(0, offset - pageSize))} />
      <View style={{ width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: t.pinkSoft }}>
        <Text style={{ fontFamily: FONTS.medium, fontSize: 11.5, color: t.pinkText }}>{page}</Text>
      </View>
      <Button label="Next" disabled={offset + shown >= total} onPress={() => onPage(offset + pageSize)} />
    </View>
  );
}

export function ReasonBox({ value, onChange, label = "Reason · required", placeholder }: { value: string; onChange: (text: string) => void; label?: string; placeholder: string }) {
  const t = useAdminTheme();
  return (
    <View style={{ marginTop: 14 }}>
      <Text style={{ marginBottom: 8, fontFamily: FONTS.medium, fontSize: 12.5, color: t.text }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={t.faint}
        multiline
        maxLength={1000}
        style={{
          minHeight: 76,
          padding: 12,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: t.border,
          backgroundColor: t.card,
          textAlignVertical: "top",
          fontFamily: FONTS.regular,
          fontSize: 13,
          color: t.text,
          ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null),
        }}
      />
    </View>
  );
}

export function Toggle({ value, onChange, label, hint }: { value: boolean; onChange: (value: boolean) => void; label: string; hint?: string }) {
  const t = useAdminTheme();
  return (
    <Pressable onPress={() => onChange(!value)} style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 12 }} accessibilityRole="switch" accessibilityState={{ checked: value }}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: FONTS.medium, fontSize: 12.5, color: t.text }}>{label}</Text>
        {hint ? <Text style={{ marginTop: 2, fontFamily: FONTS.regular, fontSize: 11.5, color: t.muted }}>{hint}</Text> : null}
      </View>
      <View style={{ width: 38, height: 22, borderRadius: 11, padding: 2, justifyContent: "center", alignItems: value ? "flex-end" : "flex-start", backgroundColor: value ? t.pink : t.border }}>
        <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: "#FFFFFF" }} />
      </View>
    </Pressable>
  );
}

/** The pink "Confirm ..." box with the final buttons. */
export function ConfirmBox({ title, text, confirmLabel, onConfirm, onCancel, busy, disabled }: { title: string; text: string; confirmLabel: string; onConfirm: () => void; onCancel: () => void; busy?: boolean; disabled?: boolean }) {
  const t = useAdminTheme();
  return (
    <View style={{ marginTop: 16 }}>
      <View style={{ flexDirection: "row", gap: 10, padding: 14, borderRadius: 12, backgroundColor: t.pinkSoft }}>
        <Ionicons name="information-circle-outline" size={17} color={t.pinkText} style={{ marginTop: 1 }} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: FONTS.medium, fontSize: 13, color: t.text }}>{title}</Text>
          <Text style={{ marginTop: 4, fontFamily: FONTS.regular, fontSize: 12.5, lineHeight: 18, color: t.muted }}>{text}</Text>
        </View>
      </View>
      <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
        <Button label={confirmLabel} variant="primary" onPress={onConfirm} loading={busy} disabled={disabled} />
        <Button label="Cancel" onPress={onCancel} />
      </View>
    </View>
  );
}

/** A row of "Label  Value" (detail panels). */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  const t = useAdminTheme();
  return (
    <View style={{ flexDirection: "row", gap: 16, paddingVertical: 8 }}>
      <Text style={{ width: 120, fontFamily: FONTS.regular, fontSize: 12.5, color: t.muted }}>{label}</Text>
      <View style={{ flex: 1 }}>{typeof children === "string" ? <Text style={{ fontFamily: FONTS.regular, fontSize: 12.5, color: t.text }}>{children}</Text> : children}</View>
    </View>
  );
}

export function Divider() {
  const t = useAdminTheme();
  return <View style={{ height: 1, marginVertical: 14, backgroundColor: t.line }} />;
}

/** Report status as a pill. */
export function ReportStatusPill({ status }: { status: string }) {
  const tone = STATUS_TONE[status] || "grey";
  const label = { new: "New", in_review: "In review", resolved: "Resolved", dismissed: "Dismissed", published: "Published", removed: "Removed" }[status] || status;
  return <Pill label={label} tone={tone} />;
}

/** A small "Done: EV-2084" message after an action. */
export function DoneNote({ text }: { text: string }) {
  const t = useAdminTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 14, padding: 12, borderRadius: 10, backgroundColor: t.greenSoft }}>
      <Ionicons name="checkmark-circle" size={16} color={t.green} />
      <Text style={{ flex: 1, fontFamily: FONTS.regular, fontSize: 12.5, color: t.text }}>{text}</Text>
    </View>
  );
}
