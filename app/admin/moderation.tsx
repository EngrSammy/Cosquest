// ==========================================
// SUPER ADMIN DASHBOARD - Moderation (Figma "Moderation")
// ==========================================
// The reports queue (tabs, search, filters, pages) and the report review:
// the evidence, reporters, the author's history, the assignee, and the
// decision (a reason and a confirmation, always).
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Platform, Pressable, Text, View, useWindowDimensions } from "react-native";

import { setOpenReportsBadge } from "@/components/admin/AdminShell";
import { ConfirmBox, Divider, DoneNote, Field, Pager, ReasonBox, ReportStatusPill, SearchBox, Select, Tabs, Toggle } from "@/components/admin/controls";
import { useAdminTheme } from "@/components/admin/theme";
import { Button, Card, CardHeader, Initials, Loading, Notice, PageHeader, Pill, StatCard, formatNumber, timeAgo } from "@/components/admin/ui";
import { FONTS } from "@/constants/fonts";
import { useAdminSession } from "@/services/admin";
import {
  type DecisionAction,
  type Report,
  type ReportDetail,
  REASON_LABELS,
  TARGET_LABELS,
  assignReport,
  decideReport,
  getReport,
  getReportStats,
  listReports,
} from "@/services/adminContent";

type Tab = "open" | "new" | "in_review" | "resolved";

const ACTION_COPY: Record<DecisionAction, { chip: string; confirm: string; title: (r: Report) => string; text: string }> = {
  remove_post: {
    chip: "Remove post",
    confirm: "Confirm removal",
    title: () => "Confirm post removal",
    text: "The post is hidden from the community feed. An evidence snapshot remains in the audit log.",
  },
  remove_comment: {
    chip: "Remove comment",
    confirm: "Confirm removal",
    title: () => "Confirm comment removal",
    text: "The comment (and its replies) is removed. An evidence snapshot remains in the audit log.",
  },
  delete_message: {
    chip: "Delete message",
    confirm: "Confirm delete",
    title: () => "Confirm message deletion",
    text: "Members see “deleted by an admin”. Evidence remains attached to the report.",
  },
  dismiss: {
    chip: "Dismiss report",
    confirm: "Confirm dismissal",
    title: (r) => `Dismiss ${r.number}?`,
    text: "Nothing is changed or removed. The decision and your reason are recorded in the audit log.",
  },
};

function reportTitle(report: Report) {
  const s = report.snapshot || {};
  if (report.targetType === "profile") return `Member profile · @${s.username || report.targetUser?.username || "unknown"}`;
  if (report.targetType === "message") return `Message in ${s.chat?.name || (s.chat?.type === "dm" ? "a direct message" : s.chat?.type === "community" ? "Community" : "a chat")}`;
  const text = String(s.text || "").trim();
  return text ? (text.length > 64 ? `${text.slice(0, 64)}…` : text) : report.targetType === "comment" ? "A comment" : "A post";
}

const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });

function QueueRow({ report, selected, onPress }: { report: Report; selected: boolean; onPress: () => void }) {
  const t = useAdminTheme();
  const s = report.snapshot || {};
  return (
    <Pressable
      onPress={onPress}
      style={({ hovered }: any) => ({
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 14,
        paddingHorizontal: 10,
        borderTopWidth: 1,
        borderTopColor: t.line,
        borderLeftWidth: 2,
        borderLeftColor: selected ? t.pink : "transparent",
        backgroundColor: selected ? t.pinkSoft : hovered ? t.cardSoft : "transparent",
      })}>
      <View style={{ flex: 3, paddingRight: 12 }}>
        <Text style={{ fontFamily: FONTS.medium, fontSize: 13, color: t.text }} numberOfLines={1}>
          {reportTitle(report)}
        </Text>
        <Text style={{ marginTop: 3, fontFamily: FONTS.regular, fontSize: 11.5, color: t.muted }} numberOfLines={1}>
          {report.number} · {TARGET_LABELS[report.targetType]}
          {s.author ? ` · @${s.author}` : ""} · {clock(report.createdAt)}
        </Text>
      </View>
      <View style={{ flex: 1.4 }}>
        <Text style={{ fontFamily: FONTS.regular, fontSize: 12.5, color: t.text }}>{REASON_LABELS[report.reason] || report.reason}</Text>
        <Text style={{ marginTop: 2, fontFamily: FONTS.regular, fontSize: 11, color: report.priority === "high" ? t.red : t.faint }}>
          {report.priority === "high" ? "High priority" : "Standard"}
          {report.reporterCount > 1 ? ` · ${report.reporterCount} reports` : ""}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <ReportStatusPill status={report.status} />
      </View>
    </Pressable>
  );
}

function ReviewPanel({ reportId, onChanged }: { reportId: string; onChanged: () => void }) {
  const t = useAdminTheme();
  const me = useAdminSession()?.admin;
  const [detail, setDetail] = useState<ReportDetail | null>(null);
  const [error, setError] = useState("");
  const [action, setAction] = useState<DecisionAction | null>(null);
  const [reason, setReason] = useState("");
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState("");

  const load = useCallback(async () => {
    try {
      setDetail(await getReport(reportId));
      setError("");
    } catch (e: any) {
      setError(e?.message || "Couldn't load this report.");
    }
  }, [reportId]);

  useEffect(() => {
    setDetail(null);
    setAction(null);
    setReason("");
    setDone("");
    load();
  }, [load]);

  if (error) return <Notice tone="red" text={error} />;
  if (!detail) return <Loading label="Loading the report…" />;

  const { report, target, author } = detail;
  const s = report.snapshot || {};
  const open = report.status === "new" || report.status === "in_review";
  const reporters = report.reporters || [];
  const firstReporter = reporters[0];
  const removable = detail.actions.filter((a) => a !== "dismiss");

  const decide = async () => {
    if (!action) return;
    setBusy(true);
    try {
      const result = await decideReport(report.id, { action, reason: reason.trim(), notifyAuthor: notify });
      setDone(`${ACTION_COPY[action].chip === "Dismiss report" ? "Report dismissed" : "Done"}. Recorded as ${result.auditEvent}.`);
      setAction(null);
      await load();
      onChanged();
    } catch (e: any) {
      setError(e?.message || "Couldn't record the decision.");
    } finally {
      setBusy(false);
    }
  };

  const assignMe = async () => {
    try {
      await assignReport(report.id);
      await load();
      onChanged();
    } catch (e: any) {
      setError(e?.message || "Couldn't assign the report.");
    }
  };

  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: FONTS.medium, fontSize: 16, color: t.text }}>Report review</Text>
          <Text style={{ marginTop: 3, fontFamily: FONTS.regular, fontSize: 12.5, color: t.muted }}>
            {report.number} · Submitted {timeAgo(report.createdAt)}
          </Text>
        </View>
        <ReportStatusPill status={report.status} />
      </View>
      <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
        {report.priority === "high" ? <Pill label="High priority" tone="red" /> : <Pill label="Standard" tone="grey" />}
        <Pill label={TARGET_LABELS[report.targetType]} tone="grey" />
      </View>

      {report.targetUser ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 16 }}>
          <Initials name={report.targetUser.name} size={36} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: FONTS.medium, fontSize: 13.5, color: t.text }}>@{report.targetUser.username || "member"}</Text>
            {author ? (
              <Text style={{ marginTop: 2, fontFamily: FONTS.regular, fontSize: 11.5, color: t.muted }}>
                {author.joinedAt ? `Joined ${new Date(author.joinedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} · ` : ""}
                {author.posts} posts · {author.previousActions ? `${author.previousActions} previous admin actions` : "no previous actions"}
                {author.reportsAgainst > 1 ? ` · ${author.reportsAgainst} reports in total` : ""}
              </Text>
            ) : null}
          </View>
        </View>
      ) : null}

      {/* The evidence */}
      <View style={{ marginTop: 16, padding: 16, borderRadius: 12, backgroundColor: t.cardSoft }}>
        <Text style={{ fontFamily: FONTS.medium, fontSize: 10.5, letterSpacing: 0.5, color: t.faint }}>
          {(target?.label ? `${target.label} · ` : "") + TARGET_LABELS[report.targetType].toUpperCase()}
          {s.chat?.name ? ` · ${String(s.chat.name).toUpperCase()}` : ""}
          {s.createdAt ? ` · ${clock(s.createdAt)}` : ""}
        </Text>
        {report.targetType === "profile" ? (
          <>
            <Text style={{ marginTop: 10, fontFamily: FONTS.regular, fontSize: 17, color: t.text }}>{s.name || `@${s.username}`}</Text>
            <Text style={{ marginTop: 6, fontFamily: FONTS.regular, fontSize: 13, lineHeight: 19, color: t.muted }}>{s.bio || "No bio."}</Text>
          </>
        ) : (
          <Text style={{ marginTop: 10, fontFamily: FONTS.regular, fontSize: 14.5, lineHeight: 21, color: t.text }}>{s.text || "(no text)"}</Text>
        )}
        {s.media?.length ? <Text style={{ marginTop: 8, fontFamily: FONTS.regular, fontSize: 12, color: t.muted }}>{s.media.length} attachment{s.media.length === 1 ? "" : "s"} kept</Text> : null}
        <Text style={{ marginTop: 10, fontFamily: FONTS.regular, fontSize: 11.5, color: t.muted }}>
          {target?.exists === false
            ? "The original no longer exists (the evidence above was saved when it was reported)."
            : target?.removed
              ? "Removed from the feed · kept as evidence"
              : target?.deleted
                ? "Deleted by an admin · kept as evidence"
                : [target?.reactions != null ? `${target.reactions} reactions` : null, target?.comments != null ? `${target.comments} comments` : null, `${report.reporterCount} member report${report.reporterCount === 1 ? "" : "s"}`]
                    .filter(Boolean)
                    .join(" · ")}
        </Text>
        {report.targetType === "post" && target?.exists && !target.removed && Platform.OS === "web" ? (
          <Pressable onPress={() => (window as any).open(`/post/${report.targetId}`, "_blank")} style={{ marginTop: 10 }}>
            <Text style={{ fontFamily: FONTS.medium, fontSize: 12.5, color: t.pinkText }}>Open original post ↗</Text>
          </Pressable>
        ) : null}
        {report.targetType === "message" && report.conversationId && s.chat?.type !== "dm" ? (
          <Pressable onPress={() => router.navigate({ pathname: "/admin/chats", params: { conversation: report.conversationId!, message: report.targetId } } as any)} style={{ marginTop: 10 }}>
            <Text style={{ fontFamily: FONTS.medium, fontSize: 12.5, color: t.pinkText }}>See it in the conversation →</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={{ marginTop: 12 }}>
        <Field label="Report reason">{REASON_LABELS[report.reason] || report.reason}</Field>
        <Field label="Reported by">
          {firstReporter ? `${firstReporter.user?.name || "A member"}${reporters.length > 1 ? ` and ${reporters.length - 1} other member${reporters.length > 2 ? "s" : ""}` : ""}` : "—"}
        </Field>
      </View>
      {reporters.some((r) => r.statement) ? (
        <View style={{ marginTop: 6 }}>
          <Text style={{ marginBottom: 8, fontFamily: FONTS.medium, fontSize: 12.5, color: t.text }}>Reporter statement{reporters.filter((r) => r.statement).length > 1 ? "s" : ""}</Text>
          {reporters
            .filter((r) => r.statement)
            .map((r, i) => (
              <View key={i} style={{ marginBottom: 8, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: t.border }}>
                <Text style={{ fontFamily: FONTS.regular, fontSize: 12.5, lineHeight: 18, color: t.muted }}>{r.statement}</Text>
                <Text style={{ marginTop: 4, fontFamily: FONTS.regular, fontSize: 11, color: t.faint }}>
                  {r.user?.name || "A member"} · {REASON_LABELS[r.reason] || r.reason}
                </Text>
              </View>
            ))}
        </View>
      ) : null}
      <Field label="Evidence">{s.capturedAt ? `Original content preserved at ${clock(s.capturedAt)}` : "Original content preserved"}</Field>

      <Divider />

      {/* Assignee */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: FONTS.medium, fontSize: 13, color: t.text }}>Assignee · {report.assignee ? report.assignee.name : "Unassigned"}</Text>
          <Text style={{ marginTop: 2, fontFamily: FONTS.regular, fontSize: 11.5, color: t.muted }}>
            {report.assignee?.id === me?.id ? "Assigned to you" : report.assignee ? "Assigned to another admin" : "Nobody is reviewing it yet"}
            {open ? " · no decision recorded" : ""}
          </Text>
        </View>
        {open && report.assignee?.id !== me?.id ? <Button label="Assign to me" onPress={assignMe} /> : null}
      </View>

      <Divider />

      {/* Decision */}
      {open ? (
        <View>
          <Text style={{ fontFamily: FONTS.medium, fontSize: 14, color: t.text }}>Review decision</Text>
          <Text style={{ marginTop: 3, fontFamily: FONTS.regular, fontSize: 12, color: t.muted }}>Prepare an action; nothing is applied until you confirm.</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 12 }}>
            {[...removable, "dismiss" as DecisionAction].map((key) => {
              const on = action === key;
              return (
                <Pressable
                  key={key}
                  onPress={() => setAction(on ? null : key)}
                  style={{ flexDirection: "row", alignItems: "center", gap: 6, height: 36, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1, borderColor: on ? t.pink : t.border, backgroundColor: on ? t.pinkSoft : t.card }}>
                  {on ? <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: t.pink }} /> : null}
                  <Text style={{ fontFamily: FONTS.medium, fontSize: 12.5, color: on ? t.pinkText : t.text }}>{ACTION_COPY[key].chip}</Text>
                </Pressable>
              );
            })}
          </View>
          {action ? (
            <>
              <ReasonBox
                label="Contextual reason · required"
                value={reason}
                onChange={setReason}
                placeholder={action === "dismiss" ? "Why no action is needed (e.g. no guideline violation)." : "What rule this breaks, in a sentence the author will understand."}
              />
              {action !== "dismiss" ? <Toggle value={notify} onChange={setNotify} label="Notify the author" hint="They receive this reason in CosQuest." /> : null}
              <ConfirmBox
                title={ACTION_COPY[action].title(report)}
                text={`${ACTION_COPY[action].text}${action !== "dismiss" && notify ? " The author will be notified with this reason." : ""}`}
                confirmLabel={ACTION_COPY[action].confirm}
                onConfirm={decide}
                onCancel={() => setAction(null)}
                busy={busy}
                disabled={reason.trim().length < 3}
              />
            </>
          ) : null}
        </View>
      ) : report.decision ? (
        <View>
          <Text style={{ fontFamily: FONTS.medium, fontSize: 14, color: t.text }}>Decision</Text>
          <Field label="Action">{report.decision.action.replace(/_/g, " ")}</Field>
          <Field label="Reason">{report.decision.reason || "—"}</Field>
          <Field label="By">{`${report.decision.by?.name || "An admin"} · ${timeAgo(report.decision.at)}`}</Field>
        </View>
      ) : null}
      {done ? <DoneNote text={done} /> : null}
    </View>
  );
}

export default function AdminModeration() {
  const t = useAdminTheme();
  const { width } = useWindowDimensions();
  const wide = width >= 1200;
  const params = useLocalSearchParams<{ report?: string }>();
  const [stats, setStats] = useState<Awaited<ReturnType<typeof getReportStats>> | null>(null);
  const [tab, setTab] = useState<Tab>("open");
  const [q, setQ] = useState("");
  const [type, setType] = useState("all");
  const [priority, setPriority] = useState("all");
  const [assignee, setAssignee] = useState("any");
  const [offset, setOffset] = useState(0);
  const [rows, setRows] = useState<Report[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(typeof params.report === "string" ? params.report : null);

  const loadStats = useCallback(async () => {
    try {
      const next = await getReportStats();
      setStats(next);
      setOpenReportsBadge(next.open);
    } catch {}
  }, []);

  const loadList = useCallback(async () => {
    try {
      const result = await listReports({
        status: tab,
        q: q.trim() || undefined,
        type: type === "all" ? undefined : type,
        priority: priority === "all" ? undefined : priority,
        assignee: assignee === "any" ? undefined : assignee,
        offset,
      });
      setRows(result.reports);
      setTotal(result.total);
      setError("");
      setSelected((current) => current || result.reports[0]?.id || null);
    } catch (e: any) {
      setError(e?.code === "not_deployed" ? "The Moderation backend (Phase 2) isn't deployed yet." : e?.message || "Couldn't load reports.");
    }
  }, [tab, q, type, priority, assignee, offset]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);
  useEffect(() => {
    const timer = setTimeout(loadList, q ? 300 : 0);
    return () => clearTimeout(timer);
  }, [loadList, q]);

  const refresh = () => {
    loadStats();
    loadList();
  };

  return (
    <View>
      <PageHeader title="Moderation" subtitle="Review reports with context. Make fair, traceable decisions for your community." right={<Button label="Export reports" icon="download-outline" disabled />} />

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 20 }}>
        <StatCard title="Open reports" icon="flag-outline" value={formatNumber(stats?.open)} footer={<Text style={{ fontFamily: FONTS.regular, fontSize: 12, color: t.muted }}>Across feeds, chats and members</Text>} />
        <StatCard title="New" icon="mail-unread-outline" value={formatNumber(stats?.new)} footer={<Text style={{ fontFamily: FONTS.regular, fontSize: 12, color: t.muted }}>Awaiting first review</Text>} />
        <StatCard title="In review" icon="eye-outline" value={formatNumber(stats?.inReview)} footer={<Text style={{ fontFamily: FONTS.regular, fontSize: 12, color: t.muted }}>Assigned to admins</Text>} />
        <StatCard title="High priority" icon="alert-circle-outline" value={formatNumber(stats?.high)} footer={<Text style={{ fontFamily: FONTS.regular, fontSize: 12, color: t.amber }}>Prioritize potential member harm</Text>} />
        <StatCard title="Resolved today" icon="checkmark-done-outline" value={formatNumber(stats?.resolvedToday)} footer={<Text style={{ fontFamily: FONTS.regular, fontSize: 12, color: t.green }}>Decisions recorded in the audit log</Text>} />
      </View>

      <View style={{ flexDirection: wide ? "row" : "column", gap: 20, marginTop: 20, alignItems: "flex-start" }}>
        <Card style={{ flex: 1.55, alignSelf: "stretch" }}>
          <CardHeader title="Reports queue" subtitle={`High priority first, then newest · ${formatNumber(stats?.open)} open`} />
          <Tabs<Tab>
            value={tab}
            onChange={(key) => {
              setTab(key);
              setOffset(0);
              setSelected(null);
            }}
            tabs={[
              { key: "open", label: "All open", count: stats?.open },
              { key: "new", label: "New", count: stats?.new },
              { key: "in_review", label: "In review", count: stats?.inReview },
              { key: "resolved", label: "Resolved" },
            ]}
          />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 12, zIndex: 20 }}>
            <SearchBox value={q} onChange={(text) => { setQ(text); setOffset(0); }} placeholder="Search CQ number, content or @member…" />
            <Select value={type} onChange={(v) => { setType(v); setOffset(0); }} options={[{ value: "all", label: "All types" }, { value: "post", label: "Feed posts" }, { value: "comment", label: "Comments" }, { value: "message", label: "Chat messages" }, { value: "profile", label: "Member profiles" }]} />
            <Select value={priority} onChange={(v) => { setPriority(v); setOffset(0); }} options={[{ value: "all", label: "Any priority" }, { value: "high", label: "High priority" }, { value: "standard", label: "Standard" }]} />
            <Select value={assignee} onChange={(v) => { setAssignee(v); setOffset(0); }} options={[{ value: "any", label: "Any assignee" }, { value: "me", label: "Assigned to me" }, { value: "none", label: "Unassigned" }]} />
          </View>
          <View style={{ flexDirection: "row", paddingVertical: 10, paddingHorizontal: 10, borderRadius: 8, backgroundColor: t.cardSoft }}>
            {["REPORTED CONTENT", "REASON", "STATUS"].map((label, i) => (
              <Text key={label} style={{ flex: [3, 1.4, 1][i], fontFamily: FONTS.medium, fontSize: 10.5, letterSpacing: 0.5, color: t.faint }}>
                {label}
              </Text>
            ))}
          </View>
          {error ? (
            <View style={{ marginTop: 12 }}>
              <Notice tone="amber" text={error} />
            </View>
          ) : !rows ? (
            <Loading label="Loading reports…" />
          ) : rows.length ? (
            rows.map((report) => <QueueRow key={report.id} report={report} selected={report.id === selected} onPress={() => setSelected(report.id)} />)
          ) : (
            <View style={{ paddingVertical: 40, alignItems: "center", gap: 6 }}>
              <Ionicons name="checkmark-circle-outline" size={26} color={t.green} />
              <Text style={{ fontFamily: FONTS.medium, fontSize: 13.5, color: t.text }}>{tab === "resolved" ? "No decided reports yet" : "Nothing to review"}</Text>
              <Text style={{ fontFamily: FONTS.regular, fontSize: 12.5, color: t.muted }}>{q || type !== "all" || priority !== "all" || assignee !== "any" ? "Try other filters." : "Reports from members will appear here."}</Text>
            </View>
          )}
          {rows ? <Pager shown={rows.length} total={total} offset={offset} onPage={setOffset} noun={tab === "resolved" ? "decided reports" : "open reports"} /> : null}
          <View style={{ marginTop: 16 }}>
            <Notice text="High-priority reports are surfaced first. Review the evidence before taking action; a report alone does not establish a violation." />
          </View>
        </Card>

        <Card style={{ flex: 1, alignSelf: "stretch" }}>
          {selected ? (
            <ReviewPanel reportId={selected} onChanged={refresh} />
          ) : (
            <View style={{ paddingVertical: 60, alignItems: "center", gap: 6 }}>
              <Ionicons name="document-text-outline" size={26} color={t.faint} />
              <Text style={{ fontFamily: FONTS.regular, fontSize: 13, color: t.muted }}>Pick a report to review it.</Text>
            </View>
          )}
        </Card>
      </View>
    </View>
  );
}
