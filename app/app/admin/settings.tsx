// ==========================================
// SUPER ADMIN DASHBOARD - Community settings (Figma "Settings")
// ==========================================
// Identity, guidelines, privacy & joining, admin notifications and
// moderation defaults. Nothing applies until "Save changes"; the bar shows
// what's unsaved, "Before you save" shows exactly what changes, and each
// save is one audit event. If another admin saved first, nothing is
// overwritten: reload to see their changes.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Platform, Text, TextInput, View, useWindowDimensions } from "react-native";

import { Divider, DoneNote, ReasonBox, Select, Tabs, Toggle } from "@/components/admin/controls";
import { useAdminTheme } from "@/components/admin/theme";
import { Button, Card, CardHeader, Loading, Notice, PageHeader, Pill, timeAgo } from "@/components/admin/ui";
import { FONTS } from "@/constants/fonts";
import { type Settings, getRoles, getSettings, saveSettings } from "@/services/adminSettings";

type Section = "all" | "identity" | "guidelines" | "privacy" | "notifications" | "moderation";

const LABELS: Record<string, string> = {
  "identity.name": "Community name",
  "identity.url": "Community URL",
  "identity.description": "Description",
  "identity.language": "Default language",
  "identity.reportingTimeZone": "Reporting time zone",
  "guidelines.title": "Guidelines title",
  "guidelines.standards": "Community standards",
  "guidelines.requireAcceptance": "Require guideline acceptance",
  "privacy.visibility": "Community visibility",
  "privacy.allowMemberInvitations": "Allow member invitations",
  "privacy.showMemberDirectory": "Show member directory",
  "privacy.publicSearchIndexing": "Public search indexing",
  "notifications.highPriorityAlerts": "High-priority report alerts",
  "notifications.joinRequestSummaries": "Join request summaries",
  "notifications.roleChanges": "Role and permission changes",
  "notifications.dailyDigest": "Daily safety digest",
  "notifications.digestTime": "Digest delivery time",
  "notifications.digestTo": "Digest sent to",
  "moderation.reportRouting": "Report routing",
  "moderation.newGroupSlowMode": "New group slow mode",
  "moderation.defaultMuteDuration": "Default mute duration",
  "moderation.prioritizeHarm": "Prioritize scams and member harm",
  "moderation.notifyAuthors": "Notify authors after a decision",
};

const SLOW = [
  { value: "0", label: "Off" },
  { value: "10", label: "10 sec" },
  { value: "30", label: "30 sec" },
  { value: "60", label: "1 min" },
  { value: "300", label: "5 min" },
  { value: "3600", label: "1 hour" },
];
const MUTE = [
  { value: "1h", label: "1 hour" },
  { value: "1d", label: "1 day" },
  { value: "1w", label: "1 week" },
  { value: "30d", label: "30 days" },
];
const LANGS = [
  { value: "en-US", label: "English (United States)" },
  { value: "en-GB", label: "English (United Kingdom)" },
  { value: "es", label: "Español" },
  { value: "fr", label: "Français" },
  { value: "pt-BR", label: "Português (Brasil)" },
  { value: "yo", label: "Yorùbá" },
  { value: "ig", label: "Igbo" },
  { value: "ha", label: "Hausa" },
];
const ZONES = ["America/Los_Angeles", "America/New_York", "Europe/London", "Africa/Lagos", "Europe/Paris", "Asia/Dubai", "Asia/Tokyo"].map((z) => ({ value: z, label: z.replace("_", " ") }));
const TIMES = ["07:00", "08:00", "09:00", "12:00", "17:00", "20:00"].map((v) => ({ value: v, label: v }));

const get = (s: any, path: string) => path.split(".").reduce((o, k) => (o == null ? o : o[k]), s);
const show = (path: string, v: any) => {
  if (typeof v === "boolean") return v ? "On" : "Off";
  if (path === "moderation.newGroupSlowMode") return SLOW.find((x) => x.value === String(v))?.label || String(v);
  if (path === "privacy.visibility") return v === "public" ? "Public" : "Members only";
  if (typeof v === "string" && v.length > 40) return `${v.slice(0, 40)}…`;
  return v === "" ? "(empty)" : String(v);
};

export default function AdminSettings() {
  const t = useAdminTheme();
  const { width } = useWindowDimensions();
  const wide = width >= 1200;
  const [loaded, setLoaded] = useState<Awaited<ReturnType<typeof getSettings>> | null>(null);
  const [draft, setDraft] = useState<Settings | null>(null);
  const [admins, setAdmins] = useState<{ value: string; label: string }[]>([]);
  const [section, setSection] = useState<Section>("all");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [stale, setStale] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState("");

  const load = useCallback(async () => {
    try {
      const next = await getSettings();
      setLoaded(next);
      setDraft(JSON.parse(JSON.stringify(next.settings)));
      setError("");
      setStale(false);
    } catch (e: any) {
      setError(e?.code === "not_deployed" ? "Settings (Phase 5) isn't deployed yet." : e?.message || "Couldn't load settings.");
    }
    try {
      const roles = await getRoles();
      setAdmins(roles.admins.map((a) => ({ value: a.id, label: `Assign to ${a.name}` })));
    } catch {}
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const changes = useMemo(() => {
    if (!loaded || !draft) return [] as { path: string; before: any; after: any }[];
    return Object.keys(LABELS)
      .map((path) => ({ path, before: get(loaded.settings, path), after: get(draft, path) }))
      .filter((c) => JSON.stringify(c.before) !== JSON.stringify(c.after));
  }, [loaded, draft]);

  if (!loaded || !draft) {
    return (
      <View>
        <PageHeader title="Community settings" subtitle="Shape the CosQuest community experience, from first join to everyday safety." />
        {error ? <Notice tone="amber" text={error} /> : <Loading />}
      </View>
    );
  }

  const set = (path: string, value: any) => {
    setDone("");
    setDraft((current) => {
      const next: any = JSON.parse(JSON.stringify(current));
      const [a, b] = path.split(".");
      next[a][b] = value;
      return next;
    });
  };
  const needsEmail = (path: string) => loaded.needsEmail.includes(path);
  const visible = (key: Section) => section === "all" || section === key;

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const body: Record<string, Record<string, unknown>> = {};
      changes.forEach(({ path, after }) => {
        const [a, b] = path.split(".");
        body[a] = { ...(body[a] || {}), [b]: after };
      });
      const result = await saveSettings(loaded.version, body, reason.trim());
      setDone(`${result.changed} setting${result.changed === 1 ? "" : "s"} saved.${result.auditEvent ? ` Recorded as ${result.auditEvent}.` : ""}`);
      setReason("");
      await load();
    } catch (e: any) {
      if (e?.code === "stale_settings") setStale(true);
      else setError(e?.message || "Couldn't save settings.");
    } finally {
      setSaving(false);
    }
  };

  const discard = () => {
    setDraft(JSON.parse(JSON.stringify(loaded.settings)));
    setDone("");
  };

  const textInput = (path: string, opts: { multiline?: boolean; placeholder?: string } = {}) => (
    <TextInput
      value={String(get(draft, path) ?? "")}
      onChangeText={(v) => set(path, v)}
      placeholder={opts.placeholder}
      placeholderTextColor={t.faint}
      multiline={opts.multiline}
      style={{
        minHeight: opts.multiline ? 84 : 42,
        paddingHorizontal: 12,
        paddingVertical: opts.multiline ? 10 : 0,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: t.border,
        backgroundColor: t.card,
        textAlignVertical: opts.multiline ? "top" : "center",
        fontFamily: FONTS.regular,
        fontSize: 13,
        color: t.text,
        ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null),
      }}
    />
  );
  const label = (text: string, extra?: React.ReactNode) => (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 14, marginBottom: 8 }}>
      <Text style={{ fontFamily: FONTS.medium, fontSize: 12.5, color: t.text }}>{text}</Text>
      {extra}
    </View>
  );
  const changedPill = (paths: string[]) => (changes.some((c) => paths.includes(c.path)) ? <Pill label="Changed" /> : null);
  const emailPill = <Pill label="Needs email" tone="amber" />;

  const actions = (
    <>
      <Button label="Discard changes" onPress={discard} disabled={!changes.length} />
      <Button label="Save changes" variant="primary" onPress={save} loading={saving} disabled={!changes.length} />
    </>
  );

  return (
    <View>
      <PageHeader title="Community settings" subtitle="Shape the CosQuest community experience, from first join to everyday safety." right={actions} />

      {changes.length ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 14, marginBottom: 18, borderRadius: 12, backgroundColor: t.pinkSoft }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: FONTS.medium, fontSize: 13, color: t.text }}>
              {changes.length} unsaved change{changes.length === 1 ? "" : "s"}
            </Text>
            <Text style={{ marginTop: 2, fontFamily: FONTS.regular, fontSize: 12, color: t.muted }} numberOfLines={1}>
              {changes.map((c) => LABELS[c.path]).join(" · ")} · Changes apply only after saving.
            </Text>
          </View>
          <Text style={{ fontFamily: FONTS.regular, fontSize: 11.5, color: t.pinkText }}>
            {loaded.updatedBy ? `Last saved ${timeAgo(loaded.updatedAt)} by ${loaded.updatedBy.name}` : ""}
          </Text>
        </View>
      ) : null}
      {stale ? (
        <View style={{ marginBottom: 18 }}>
          <Notice
            tone="amber"
            title="Another admin saved settings since you opened this page"
            text="Nothing was overwritten. Reload to see their changes, then make yours again."
            action={<View style={{ flexDirection: "row", marginTop: 8 }}><Button label="Reload settings" icon="refresh-outline" onPress={load} /></View>}
          />
        </View>
      ) : null}
      {error ? <View style={{ marginBottom: 18 }}><Notice tone="red" text={error} /></View> : null}
      {done ? <View style={{ marginBottom: 18 }}><DoneNote text={done} /></View> : null}

      <Tabs<Section>
        value={section}
        onChange={setSection}
        tabs={[
          { key: "all", label: "All settings" },
          { key: "identity", label: "Community identity" },
          { key: "guidelines", label: "Guidelines" },
          { key: "privacy", label: "Privacy & joining" },
          { key: "notifications", label: "Notifications" },
          { key: "moderation", label: "Moderation defaults" },
        ]}
      />

      <View style={{ flexDirection: wide ? "row" : "column", gap: 20, alignItems: "flex-start" }}>
        <View style={{ flex: 1.55, gap: 20, alignSelf: "stretch" }}>
          {visible("identity") ? (
            <Card>
              <CardHeader title="Community identity" subtitle="The details members see around CosQuest" />
              {label("Community name")}
              {textInput("identity.name")}
              {label("Community URL")}
              {textInput("identity.url", { placeholder: "cosquest.app/community" })}
              {label("Description")}
              {textInput("identity.description", { multiline: true })}
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 20, zIndex: 20 }}>
                <View style={{ zIndex: 21 }}>
                  {label("Default language")}
                  <Select value={draft.identity.language} onChange={(v) => set("identity.language", v)} options={LANGS} minWidth={220} />
                </View>
                <View>
                  {label("Reporting time zone")}
                  <Select value={draft.identity.reportingTimeZone} onChange={(v) => set("identity.reportingTimeZone", v)} options={ZONES} minWidth={220} />
                </View>
              </View>
            </Card>
          ) : null}

          {visible("guidelines") ? (
            <Card>
              <CardHeader title="Community guidelines" subtitle="Visible before joining and available in every group" />
              {label("Guidelines title")}
              {textInput("guidelines.title")}
              {label("Community standards")}
              {textInput("guidelines.standards", { multiline: true })}
              <Toggle value={draft.guidelines.requireAcceptance} onChange={(v) => set("guidelines.requireAcceptance", v)} label="Require guideline acceptance" hint="New members must acknowledge the guidelines before participating." />
              <Text style={{ marginTop: 12, fontFamily: FONTS.regular, fontSize: 11.5, color: t.muted }}>Guideline edits are logged. Updating text doesn't remove content or restrict members.</Text>
            </Card>
          ) : null}

          {visible("moderation") ? (
            <Card>
              <CardHeader title="Moderation defaults" subtitle="Starting values for new reports and newly created groups" right={changedPill(["moderation.reportRouting", "moderation.newGroupSlowMode", "moderation.defaultMuteDuration"])} />
              <View style={{ zIndex: 30 }}>
                {label("Default report assignment")}
                <Select value={draft.moderation.reportRouting} onChange={(v) => set("moderation.reportRouting", v)} options={[{ value: "unassigned", label: "Unassigned · admins claim reports" }, ...admins]} minWidth={280} />
              </View>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 20, zIndex: 20 }}>
                <View style={{ zIndex: 21 }}>
                  {label("New group slow mode")}
                  <Select value={String(draft.moderation.newGroupSlowMode)} onChange={(v) => set("moderation.newGroupSlowMode", Number(v))} options={SLOW} minWidth={180} />
                </View>
                <View>
                  {label("Default mute duration")}
                  <Select value={draft.moderation.defaultMuteDuration} onChange={(v) => set("moderation.defaultMuteDuration", v)} options={MUTE} minWidth={180} />
                </View>
              </View>
              <Toggle value={draft.moderation.prioritizeHarm} onChange={(v) => set("moderation.prioritizeHarm", v)} label="Prioritize scams and member harm" hint="Surface scam, threat and targeted-harassment reports first." />
              <Toggle value={draft.moderation.notifyAuthors} onChange={(v) => set("moderation.notifyAuthors", v)} label="Notify authors after a decision" hint="Send the action and its reason to the member affected." />
              <Divider />
              <Notice icon="lock-closed-outline" title="Reason and explicit confirmation required" text="Always enforced for removals, bans, mutes and deletions. This safeguard can't be turned off." />
            </Card>
          ) : null}
        </View>

        <View style={{ flex: 1, gap: 20, alignSelf: "stretch" }}>
          {visible("privacy") ? (
            <Card>
              <CardHeader title="Privacy & joining" subtitle="Control how people discover and join the community" />
              <View style={{ zIndex: 20 }}>
                {label("Community visibility")}
                <Select value={draft.privacy.visibility} onChange={(v) => set("privacy.visibility", v)} options={[{ value: "members", label: "Members only" }, { value: "public", label: "Public" }]} minWidth={200} />
              </View>
              <Toggle value={draft.privacy.allowMemberInvitations} onChange={(v) => set("privacy.allowMemberInvitations", v)} label="Allow member invitations" hint="Members can invite people to CosQuest." />
              <Toggle value={draft.privacy.showMemberDirectory} onChange={(v) => set("privacy.showMemberDirectory", v)} label="Show member directory" hint="Members can discover other community members." />
              <Toggle value={draft.privacy.publicSearchIndexing} onChange={(v) => set("privacy.publicSearchIndexing", v)} label="Public search indexing" hint="Allow search engines to index community content." />
              <View style={{ marginTop: 14 }}>
                <Notice text="Group visibility and joining rules can be stricter. Manage them on each group's page." />
              </View>
            </Card>
          ) : null}

          {visible("notifications") ? (
            <Card>
              <CardHeader title="Admin notifications" subtitle="Community-wide safety routing and your admin digest" />
              <Toggle value={draft.notifications.highPriorityAlerts} onChange={(v) => set("notifications.highPriorityAlerts", v)} label="High-priority report alerts" hint="Notify assigned admins in CosQuest right away." />
              <Toggle value={draft.notifications.joinRequestSummaries} onChange={(v) => set("notifications.joinRequestSummaries", v)} label="Join request summaries" hint="A summary of group approvals." />
              <Toggle value={draft.notifications.roleChanges} onChange={(v) => set("notifications.roleChanges", v)} label="Role and permission changes" hint="Notify admins when admin access changes." />
              <Divider />
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={{ flex: 1, fontFamily: FONTS.medium, fontSize: 13, color: t.text }}>Daily safety digest</Text>
                {needsEmail("notifications.dailyDigest") ? emailPill : null}
                {changedPill(["notifications.dailyDigest", "notifications.digestTime", "notifications.digestTo"])}
              </View>
              <Toggle value={draft.notifications.dailyDigest} onChange={(v) => set("notifications.dailyDigest", v)} label="Email daily digest" hint="A summary of open reports and recent decisions." />
              <View style={{ zIndex: 20 }}>
                {label("Delivery time")}
                <Select value={draft.notifications.digestTime} onChange={(v) => set("notifications.digestTime", v)} options={TIMES} minWidth={160} />
              </View>
              {label("Send to")}
              {textInput("notifications.digestTo", { placeholder: "you@example.com" })}
              <Text style={{ marginTop: 10, fontFamily: FONTS.regular, fontSize: 11.5, color: t.amber }}>Saved now; emails start once CosQuest can send email.</Text>
            </Card>
          ) : null}

          <Card>
            <CardHeader title="Before you save" subtitle={changes.length ? `${changes.length} change${changes.length === 1 ? "" : "s"} ready to apply` : "No changes yet"} />
            {changes.map((c) => (
              <View key={c.path} style={{ flexDirection: "row", gap: 12, paddingVertical: 6 }}>
                <Text style={{ width: 150, fontFamily: FONTS.regular, fontSize: 12.5, color: t.muted }}>{LABELS[c.path]}</Text>
                <Text style={{ flex: 1, fontFamily: FONTS.regular, fontSize: 12.5, color: t.text }}>
                  {show(c.path, c.before)} → {show(c.path, c.after)}
                </Text>
              </View>
            ))}
            {changes.length ? (
              <>
                <ReasonBox label="Reason · optional" value={reason} onChange={setReason} placeholder="e.g. Calmer starts for new groups." />
                <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>{actions}</View>
              </>
            ) : null}
            <Text style={{ marginTop: 14, fontFamily: FONTS.regular, fontSize: 11.5, color: t.muted }}>
              Saving updates community defaults. It doesn't reassign existing reports, change existing groups' slow mode or alter member restrictions.
            </Text>
            <View style={{ marginTop: 12 }}>
              <Notice text="Settings changes are recorded in the audit log with your name. Admin permissions are separate from game faction ranks." />
            </View>
          </Card>
        </View>
      </View>
    </View>
  );
}
