// ==========================================
// SUPER ADMIN DASHBOARD - Audit log (Figma "Audit log")
// ==========================================
// A read-only, traceable record of who changed what, when and why: search,
// filters, the event's detail (before -> after) and CSV export. Entries
// can't be edited or deleted; a follow-up decision creates a new event.
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View, useWindowDimensions } from "react-native";

import { actionLabel, AUDIT_AREAS } from "@/components/admin/auditLabels";
import { Divider, Field, Pager, SearchBox, Select } from "@/components/admin/controls";
import { useAdminTheme } from "@/components/admin/theme";
import { Button, Card, CardHeader, Initials, Loading, Notice, PageHeader, Pill, StatCard, formatNumber } from "@/components/admin/ui";
import { FONTS } from "@/constants/fonts";
import type { AuditItem } from "@/services/admin";
import { type AuditFilters, downloadAuditCsv, getAuditEvent, getAuditStats, getRoles, listAudit } from "@/services/adminSettings";

const RANGES = [
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "all", label: "All time" },
];

function rangeDates(range: string) {
  if (range === "all") return {};
  const to = new Date();
  const from = new Date();
  if (range === "today") from.setUTCHours(0, 0, 0, 0);
  else from.setUTCDate(from.getUTCDate() - (range === "7d" ? 7 : 30));
  return { from: from.toISOString(), to: to.toISOString() };
}

const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
const stamp = (iso: string) => `${new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} · ${clock(iso)}`;

/** { a: 1, b: "x" } -> "a: 1 · b: x" (before / after boxes). */
function describe(value: any): string[] {
  if (value == null) return ["—"];
  if (typeof value !== "object") return [String(value)];
  return Object.entries(value).map(([k, v]) => `${k.replace(/^[a-z]+\./, "")}: ${v === null ? "none" : typeof v === "object" ? JSON.stringify(v) : String(v)}`);
}

function EventRow({ event, selected, onPress }: { event: AuditItem; selected: boolean; onPress: () => void }) {
  const t = useAdminTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ hovered }: any) => ({
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 12,
        paddingHorizontal: 10,
        borderTopWidth: 1,
        borderTopColor: t.line,
        borderLeftWidth: 2,
        borderLeftColor: selected ? t.pink : "transparent",
        backgroundColor: selected ? t.pinkSoft : hovered ? t.cardSoft : "transparent",
      })}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: FONTS.medium, fontSize: 12.5, color: t.text }}>{clock(event.createdAt)}</Text>
        <Text style={{ marginTop: 2, fontFamily: FONTS.regular, fontSize: 11.5, color: t.muted }} numberOfLines={1}>
          {event.actor?.name || "Admin"}
        </Text>
      </View>
      <View style={{ flex: 1.3, paddingRight: 8 }}>
        <Text style={{ fontFamily: FONTS.medium, fontSize: 12.5, color: t.text }} numberOfLines={1}>
          {actionLabel(event.action)}
        </Text>
        <Text style={{ marginTop: 2, fontFamily: FONTS.regular, fontSize: 11.5, color: t.muted }}>{event.number}</Text>
      </View>
      <View style={{ flex: 1.8, paddingRight: 8 }}>
        <Text style={{ fontFamily: FONTS.medium, fontSize: 12.5, color: t.text }} numberOfLines={1}>
          {event.target?.label || "—"}
        </Text>
        <Text style={{ marginTop: 2, fontFamily: FONTS.regular, fontSize: 11.5, color: t.muted }}>{AUDIT_AREAS[event.area] || event.area}</Text>
      </View>
      <Text style={{ flex: 1.4, fontFamily: FONTS.regular, fontSize: 12, color: t.muted }} numberOfLines={2}>
        {event.reason || "—"}
      </Text>
    </Pressable>
  );
}

function EventPanel({ eventId }: { eventId: string }) {
  const t = useAdminTheme();
  const [data, setData] = useState<Awaited<ReturnType<typeof getAuditEvent>> | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setData(null);
    getAuditEvent(eventId)
      .then((next) => {
        setData(next);
        setError("");
      })
      .catch((e) => setError(e?.message || "Couldn't load this event."));
  }, [eventId]);

  if (error) return <Notice tone="red" text={error} />;
  if (!data) return <Loading />;
  const { event, report } = data;

  return (
    <View>
      <Text style={{ fontFamily: FONTS.medium, fontSize: 16, color: t.text }}>Action detail</Text>
      <Text style={{ marginTop: 3, fontFamily: FONTS.regular, fontSize: 12.5, color: t.muted }}>{event.number} · Read-only record</Text>
      <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
        <Pill label={actionLabel(event.action)} />
        <Pill label="Completed" tone="green" />
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 16 }}>
        <Initials name={event.actor?.name} size={36} />
        <View>
          <Text style={{ fontFamily: FONTS.medium, fontSize: 13.5, color: t.text }}>{event.actor?.name || "Admin"}</Text>
          <Text style={{ marginTop: 2, fontFamily: FONTS.regular, fontSize: 11.5, color: t.muted }}>Acting role: {event.actorRole === "super_admin" ? "Super admin" : event.actorRole}</Text>
        </View>
      </View>
      <View style={{ marginTop: 10 }}>
        <Field label="Timestamp">{stamp(event.createdAt)}</Field>
        <Field label="Source">{`${AUDIT_AREAS[event.area] || event.area}${event.meta?.via === "server_script" ? " · server script" : " · confirmed admin action"}`}</Field>
      </View>

      <Divider />
      <Text style={{ fontFamily: FONTS.medium, fontSize: 14, color: t.text }}>Affected target</Text>
      <Field label={event.target?.type ? event.target.type[0].toUpperCase() + event.target.type.slice(1) : "Target"}>{event.target?.label || "—"}</Field>
      {report ? <Field label="Report">{`${report.number} · ${report.status === "in_review" ? "In review" : report.status[0].toUpperCase() + report.status.slice(1)}`}</Field> : null}
      <Text style={{ marginTop: 10, marginBottom: 8, fontFamily: FONTS.medium, fontSize: 12.5, color: t.text }}>Recorded reason</Text>
      <View style={{ padding: 12, borderRadius: 10, borderWidth: 1, borderColor: t.border }}>
        <Text style={{ fontFamily: FONTS.regular, fontSize: 12.5, lineHeight: 18, color: event.reason ? t.text : t.faint }}>{event.reason || "No reason recorded for this kind of action."}</Text>
      </View>

      {event.before != null || event.after != null ? (
        <>
          <Divider />
          <Text style={{ fontFamily: FONTS.medium, fontSize: 14, color: t.text }}>What changed</Text>
          <View style={{ flexDirection: "row", gap: 12, marginTop: 10 }}>
            {[
              { title: "BEFORE", value: event.before, bg: t.cardSoft },
              { title: "AFTER", value: event.after, bg: t.pinkSoft },
            ].map((box) => (
              <View key={box.title} style={{ flex: 1, padding: 12, borderRadius: 10, backgroundColor: box.bg }}>
                <Text style={{ fontFamily: FONTS.medium, fontSize: 10.5, letterSpacing: 0.5, color: t.faint }}>{box.title}</Text>
                {describe(box.value).map((line, i) => (
                  <Text key={i} style={{ marginTop: 6, fontFamily: FONTS.regular, fontSize: 12, color: t.text }}>
                    {line}
                  </Text>
                ))}
              </View>
            ))}
          </View>
        </>
      ) : null}

      {event.evidence ? (
        <>
          <Divider />
          <Field label="Evidence">{event.evidence.text ? `“${String(event.evidence.text).slice(0, 160)}”` : "Snapshot retained"}</Field>
        </>
      ) : null}
      {event.meta?.authorNotified != null ? <Field label="Author notice">{event.meta.authorNotified ? "Sent with the reason" : "Not sent"}</Field> : null}

      {report ? (
        <View style={{ flexDirection: "row", marginTop: 12 }}>
          <Button label="Open report ↗" onPress={() => router.navigate({ pathname: "/admin/moderation", params: { report: report.id } } as any)} />
        </View>
      ) : null}
    </View>
  );
}

export default function AdminAudit() {
  const t = useAdminTheme();
  const { width } = useWindowDimensions();
  const wide = width >= 1200;
  const params = useLocalSearchParams<{ area?: string }>();
  const [stats, setStats] = useState<Awaited<ReturnType<typeof getAuditStats>> | null>(null);
  const [admins, setAdmins] = useState<{ value: string; label: string }[]>([]);
  const [q, setQ] = useState("");
  const [actor, setActor] = useState("all");
  const [area, setArea] = useState(typeof params.area === "string" ? params.area : "all");
  const [range, setRange] = useState("today");
  const [offset, setOffset] = useState(0);
  const [rows, setRows] = useState<AuditItem[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const filters: AuditFilters = {
    q: q.trim() || undefined,
    actor: actor === "all" ? undefined : actor,
    area: area === "all" ? undefined : area,
    ...rangeDates(range),
    offset,
  };
  const key = JSON.stringify({ ...filters, from: range, to: undefined });

  const load = useCallback(async () => {
    try {
      const result = await listAudit(JSON.parse(JSON.stringify(filters)));
      setRows(result.events);
      setTotal(result.total);
      setError("");
      setSelected((current) => (current && result.events.some((e) => e.id === current) ? current : result.events[0]?.id || null));
    } catch (e: any) {
      setError(e?.code === "not_deployed" ? "The Audit log (Phase 5) isn't deployed yet." : e?.message || "Couldn't load the audit log.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    getAuditStats().then(setStats).catch(() => {});
    getRoles()
      .then((r) => setAdmins(r.admins.map((a) => ({ value: a.id, label: a.name }))))
      .catch(() => {});
  }, []);
  useEffect(() => {
    const timer = setTimeout(load, q ? 300 : 0);
    return () => clearTimeout(timer);
  }, [load, q]);

  const exportCsv = async () => {
    setExporting(true);
    try {
      await downloadAuditCsv(filters);
    } catch (e: any) {
      setError(e?.message || "Couldn't export.");
    } finally {
      setExporting(false);
    }
  };

  const reset = (fn: () => void) => {
    fn();
    setOffset(0);
  };

  return (
    <View>
      <PageHeader
        title="Audit log"
        subtitle="A traceable record of who changed what, when and why."
        right={<Button label="Export audit log" icon="download-outline" onPress={exportCsv} loading={exporting} />}
      />

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 20 }}>
        <StatCard title="Admin actions today" icon="flash-outline" value={formatNumber(stats?.actions)} footer={<Text style={{ fontFamily: FONTS.regular, fontSize: 12, color: t.muted }}>Sign-ins not counted</Text>} />
        <StatCard title="Acting administrators" icon="people-outline" value={formatNumber(stats?.actingAdmins)} footer={<Text style={{ fontFamily: FONTS.regular, fontSize: 12, color: t.muted }}>Every action has an assigned admin</Text>} />
        <StatCard title="Reports decided today" icon="checkmark-done-outline" value={formatNumber(stats?.reportsDecided)} footer={<Text style={{ fontFamily: FONTS.regular, fontSize: 12, color: t.green }}>Decisions and reasons preserved</Text>} />
        <StatCard title="Admin role changes today" icon="key-outline" value={formatNumber(stats?.roleChanges)} footer={<Text style={{ fontFamily: FONTS.regular, fontSize: 12, color: t.muted }}>{stats?.roleChanges ? "See Roles in the list" : "No access assignments changed"}</Text>} />
      </View>

      <View style={{ flexDirection: wide ? "row" : "column", gap: 20, marginTop: 20, alignItems: "flex-start" }}>
        <View style={{ flex: 1.55, gap: 20, alignSelf: "stretch" }}>
          <Card>
            <CardHeader title="Admin action history" subtitle={`${RANGES.find((r) => r.value === range)?.label} · all community administration areas`} right={<Pill label="Read-only record" tone="blue" />} />
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 12, zIndex: 20 }}>
              <SearchBox value={q} onChange={(text) => reset(() => setQ(text))} placeholder="Search EV number, target or reason…" />
              <Select value={actor} onChange={(v) => reset(() => setActor(v))} options={[{ value: "all", label: "All admins" }, ...admins]} />
              <Select value={area} onChange={(v) => reset(() => setArea(v))} options={[{ value: "all", label: "All areas" }, ...Object.entries(AUDIT_AREAS).map(([value, label]) => ({ value, label }))]} />
              <Select value={range} onChange={(v) => reset(() => setRange(v))} options={RANGES} />
            </View>
            <View style={{ flexDirection: "row", paddingVertical: 10, paddingHorizontal: 10, borderRadius: 8, backgroundColor: t.cardSoft }}>
              {["TIME / ADMIN", "ACTION", "AFFECTED TARGET", "REASON"].map((label, i) => (
                <Text key={label} style={{ flex: [1, 1.3, 1.8, 1.4][i], fontFamily: FONTS.medium, fontSize: 10.5, letterSpacing: 0.5, color: t.faint }}>
                  {label}
                </Text>
              ))}
            </View>
            {error ? (
              <View style={{ marginTop: 12 }}>
                <Notice tone="amber" text={error} />
              </View>
            ) : !rows ? (
              <Loading label="Loading the audit log…" />
            ) : rows.length ? (
              rows.map((event) => <EventRow key={event.id} event={event} selected={event.id === selected} onPress={() => setSelected(event.id)} />)
            ) : (
              <Text style={{ paddingVertical: 40, textAlign: "center", fontFamily: FONTS.regular, fontSize: 13, color: t.muted }}>No admin actions match.</Text>
            )}
            {rows ? <Pager shown={rows.length} total={total} offset={offset} onPage={setOffset} noun="actions" /> : null}
          </Card>

          <Card>
            <CardHeader title="Record integrity" subtitle="Audit history is kept as an attributed record" />
            <View style={{ flexDirection: wide ? "row" : "column", gap: 20 }}>
              {[
                { title: "Attributed", text: "The acting super admin is recorded for every change." },
                { title: "Contextual", text: "Targets, reasons and evidence stay attached." },
                { title: "Append-only", text: "Later changes create new events; nothing is rewritten or deleted." },
              ].map((item) => (
                <View key={item.title} style={{ flex: 1 }}>
                  <Text style={{ fontFamily: FONTS.medium, fontSize: 13, color: t.text }}>{item.title}</Text>
                  <Text style={{ marginTop: 4, fontFamily: FONTS.regular, fontSize: 12, lineHeight: 17, color: t.muted }}>{item.text}</Text>
                </View>
              ))}
            </View>
          </Card>
        </View>

        <View style={{ flex: 1, gap: 20, alignSelf: "stretch" }}>
          <Card>
            {selected ? (
              <EventPanel eventId={selected} />
            ) : (
              <View style={{ paddingVertical: 60, alignItems: "center", gap: 6 }}>
                <Ionicons name="time-outline" size={26} color={t.faint} />
                <Text style={{ fontFamily: FONTS.regular, fontSize: 13, color: t.muted }}>Pick an action to see its detail.</Text>
              </View>
            )}
          </Card>
          <Notice
            title="A record, not a shortcut"
            text="Audit entries can't be edited or deleted here. Any follow-up decision is made in its original moderation context and creates a new event."
          />
        </View>
      </View>
    </View>
  );
}
