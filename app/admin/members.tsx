// ==========================================
// SUPER ADMIN DASHBOARD - Members (Figma "Members")
// ==========================================
// The member directory (community membership, not game faction ranks) and
// a member's details: groups, safety history, and CosQuest-wide actions
// (pause posting, suspend), always with a reason and a confirmation.
// Group-only actions live on the Chats page.
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View, useWindowDimensions } from "react-native";

import { ConfirmBox, Divider, DoneNote, Field, Pager, ReasonBox, ReportStatusPill, SearchBox, Select, Tabs } from "@/components/admin/controls";
import { useAdminTheme } from "@/components/admin/theme";
import { Button, Card, CardHeader, Initials, Loading, Notice, PageHeader, Pill, StatCard, Trend, formatNumber, timeAgo } from "@/components/admin/ui";
import { FONTS } from "@/constants/fonts";
import { REASON_LABELS } from "@/services/adminContent";
import { type MemberDetail, type MemberRow, getMember, getMemberStats, liftRestriction, listMembers, restrictMember } from "@/services/adminPeople";

type Tab = "all" | "pending" | "muted" | "suspended";
type Act = "mute" | "suspend" | "unmute" | "unsuspend";

const MUTE = [
  { value: "1h", label: "1 hour" },
  { value: "1d", label: "1 day" },
  { value: "1w", label: "1 week" },
  { value: "30d", label: "30 days" },
  { value: "forever", label: "Until lifted" },
];
const SUSPEND = MUTE.filter((d) => d.value !== "1h");

const day = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—");

function StatusPill({ status }: { status: MemberRow["status"] }) {
  if (status === "active") return <Pill label="Active" tone="green" />;
  if (status === "muted") return <Pill label="Muted" tone="amber" />;
  if (status === "suspended") return <Pill label="Suspended" tone="red" />;
  return <Pill label="Pending" tone="amber" />;
}

function MemberItem({ member, selected, onPress }: { member: MemberRow; selected: boolean; onPress: () => void }) {
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
      <View style={{ flex: 2.6, flexDirection: "row", alignItems: "center", gap: 12, paddingRight: 10 }}>
        <Initials name={member.name} size={34} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontFamily: FONTS.medium, fontSize: 13, color: t.text }} numberOfLines={1}>
            {member.name}
          </Text>
          <Text style={{ marginTop: 2, fontFamily: FONTS.regular, fontSize: 11.5, color: t.muted }} numberOfLines={1}>
            @{member.username || "no username yet"}
          </Text>
        </View>
      </View>
      <View style={{ flex: 1.1 }}>
        <Pill label={member.role === "super_admin" ? "Super admin" : "Member"} tone={member.role === "super_admin" ? "pink" : "grey"} />
      </View>
      <View style={{ flex: 1 }}>
        <StatusPill status={member.status} />
      </View>
      <Text style={{ flex: 0.9, fontFamily: FONTS.regular, fontSize: 12.5, color: t.text }}>
        {member.groups ? `${member.groups} group${member.groups === 1 ? "" : "s"}` : "No groups"}
      </Text>
      <Text style={{ flex: 1, fontFamily: FONTS.regular, fontSize: 12, color: t.muted }}>{member.lastActiveAt ? timeAgo(member.lastActiveAt) : "—"}</Text>
    </Pressable>
  );
}

function MemberPanel({ memberId, onChanged }: { memberId: string; onChanged: () => void }) {
  const t = useAdminTheme();
  const [data, setData] = useState<MemberDetail | null>(null);
  const [error, setError] = useState("");
  const [act, setAct] = useState<Act | null>(null);
  const [duration, setDuration] = useState("1d");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState("");

  const load = useCallback(async () => {
    try {
      setData(await getMember(memberId));
      setError("");
    } catch (e: any) {
      setError(e?.message || "Couldn't load this member.");
    }
  }, [memberId]);

  useEffect(() => {
    setData(null);
    setAct(null);
    setReason("");
    setDone("");
    load();
  }, [load]);

  if (error) return <Notice tone="red" text={error} />;
  if (!data) return <Loading label="Loading the member…" />;
  const { member, details, restrictions } = data;
  const isAdmin = member.role === "super_admin";

  const start = (next: Act) => {
    setAct(next);
    setReason("");
    setDone("");
    setDuration(next === "mute" ? "1d" : "1w");
  };

  const confirm = async () => {
    if (!act) return;
    setBusy(true);
    try {
      const result =
        act === "mute" || act === "suspend" ? await restrictMember(member.id, act, duration, reason.trim()) : await liftRestriction(member.id, act, reason.trim());
      const words = { mute: "Posting paused", suspend: "Account suspended", unmute: "Posting pause lifted", unsuspend: "Suspension lifted" }[act];
      setDone(`${words}. Recorded as ${result.auditEvent}.`);
      setAct(null);
      await load();
      onChanged();
    } catch (e: any) {
      setError(e?.message || "Couldn't do that.");
    } finally {
      setBusy(false);
    }
  };

  const restrictionRow = (kind: "muted" | "suspended", value: NonNullable<MemberDetail["restrictions"]["muted"]>) => (
    <View key={kind} style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 10, padding: 12, borderRadius: 10, backgroundColor: kind === "suspended" ? t.redSoft : t.amberSoft }}>
      <Ionicons name={kind === "suspended" ? "lock-closed-outline" : "volume-mute-outline"} size={17} color={kind === "suspended" ? t.red : t.amber} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: FONTS.medium, fontSize: 12.5, color: t.text }}>
          {kind === "suspended" ? "Suspended" : "Posting paused"} · {value.forever ? "until lifted" : `until ${day(value.until)}`}
        </Text>
        {value.reason ? <Text style={{ marginTop: 2, fontFamily: FONTS.regular, fontSize: 11.5, color: t.muted }}>{value.reason}</Text> : null}
      </View>
      <Button label="Lift…" onPress={() => start(kind === "suspended" ? "unsuspend" : "unmute")} />
    </View>
  );

  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: FONTS.medium, fontSize: 16, color: t.text }}>Member details</Text>
          <Text style={{ marginTop: 3, fontFamily: FONTS.regular, fontSize: 12.5, color: t.muted }}>Selected member</Text>
        </View>
        <StatusPill status={member.status} />
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", gap: 14, marginTop: 16 }}>
        <Initials name={member.name} size={52} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontFamily: FONTS.medium, fontSize: 18, color: t.text }} numberOfLines={1}>
            {member.name}
          </Text>
          <Text style={{ marginTop: 2, fontFamily: FONTS.regular, fontSize: 12, color: t.muted }} numberOfLines={1}>
            @{member.username || "—"}
            {member.email ? ` · ${member.email}` : ""}
          </Text>
        </View>
      </View>

      <View style={{ marginTop: 12 }}>
        <Field label="Member since">{day(details.memberSince)}</Field>
        <Field label="Community role">{isAdmin ? "Super admin" : "Member · no admin permissions"}</Field>
        <Field label="Faction rank">{details.faction ? `${details.faction}${details.rank ? ` · ${details.rank}` : ""} · gameplay only` : "No faction yet"}</Field>
        <Field label="Last active">{member.lastActiveAt ? timeAgo(member.lastActiveAt) : "—"}</Field>
        {!details.onboardingComplete ? <Field label="Sign-up">Hasn't finished onboarding</Field> : null}
      </View>

      <Divider />
      <Text style={{ fontFamily: FONTS.medium, fontSize: 14, color: t.text }}>Group memberships</Text>
      {data.groups.length ? (
        data.groups.slice(0, 8).map((g) => (
          <Pressable key={g.id} onPress={() => router.navigate({ pathname: "/admin/groups", params: { group: g.id } } as any)} style={{ marginTop: 10 }}>
            <Text style={{ fontFamily: FONTS.medium, fontSize: 13, color: t.text }}>
              {g.name}
              {g.role !== "member" ? ` · ${g.role === "owner" ? "Owner" : "Admin"}` : ""}
            </Text>
            <Text style={{ marginTop: 2, fontFamily: FONTS.regular, fontSize: 11.5, color: g.openReports || g.mutedUntil ? t.amber : t.muted }}>
              Joined {day(g.joinedAt)}
              {g.openReports ? ` · ${g.openReports} open report${g.openReports === 1 ? "" : "s"}` : " · No reports"}
              {g.mutedUntil ? ` · muted in this group until ${day(g.mutedUntil)}` : ""}
            </Text>
          </Pressable>
        ))
      ) : (
        <Text style={{ marginTop: 8, fontFamily: FONTS.regular, fontSize: 12.5, color: t.muted }}>Not in any groups.</Text>
      )}
      {data.groupBans.length ? (
        <Text style={{ marginTop: 10, fontFamily: FONTS.regular, fontSize: 12, color: t.red }}>Banned from: {data.groupBans.map((b) => b.name).join(", ")}</Text>
      ) : null}

      <Divider />
      <Text style={{ fontFamily: FONTS.medium, fontSize: 14, color: t.text }}>Safety history</Text>
      <Text style={{ marginTop: 3, fontFamily: FONTS.regular, fontSize: 12, color: t.muted }}>Review the report before applying a restriction.</Text>
      {data.safety.length ? (
        data.safety.slice(0, 5).map((r) => (
          <Pressable key={r.id} onPress={() => router.navigate({ pathname: "/admin/moderation", params: { report: r.id } } as any)} style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: FONTS.medium, fontSize: 12.5, color: t.text }}>
                {r.number} · {REASON_LABELS[r.reason] || r.reason}
              </Text>
              <Text style={{ marginTop: 2, fontFamily: FONTS.regular, fontSize: 11.5, color: t.muted }}>
                {r.targetType === "message" ? `Chat message${r.chat ? ` · ${r.chat}` : ""}` : r.targetType === "profile" ? "Profile" : r.targetType === "comment" ? "Comment" : "Feed post"} · {timeAgo(r.createdAt)}
              </Text>
            </View>
            <ReportStatusPill status={r.status} />
          </Pressable>
        ))
      ) : (
        <Text style={{ marginTop: 8, fontFamily: FONTS.regular, fontSize: 12.5, color: t.muted }}>No reports about this member.</Text>
      )}

      <Divider />
      <Text style={{ fontFamily: FONTS.medium, fontSize: 14, color: t.text }}>CosQuest-wide restrictions</Text>
      <Text style={{ marginTop: 3, fontFamily: FONTS.regular, fontSize: 12, color: t.muted }}>
        Apply everywhere on CosQuest. For one group only, use the Chats page.
      </Text>
      {restrictions.suspended ? restrictionRow("suspended", restrictions.suspended) : null}
      {restrictions.muted ? restrictionRow("muted", restrictions.muted) : null}

      {isAdmin ? (
        <View style={{ marginTop: 12 }}>
          <Notice text="Super admins are managed in Roles & permissions." />
        </View>
      ) : !act ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 12 }}>
          {!restrictions.muted ? <Button label="Pause posting…" icon="volume-mute-outline" onPress={() => start("mute")} /> : null}
          {!restrictions.suspended ? <Button label="Suspend account…" icon="lock-closed-outline" onPress={() => start("suspend")} /> : null}
        </View>
      ) : (
        <View style={{ marginTop: 12 }}>
          {act === "mute" || act === "suspend" ? (
            <View style={{ zIndex: 20 }}>
              <Text style={{ marginBottom: 8, fontFamily: FONTS.medium, fontSize: 12.5, color: t.text }}>{act === "mute" ? "Pause duration" : "Suspension"}</Text>
              <Select value={duration} onChange={setDuration} options={act === "mute" ? MUTE : SUSPEND} minWidth={170} />
            </View>
          ) : null}
          <ReasonBox
            label={act === "mute" || act === "suspend" ? "Reason · required" : "Reason · optional"}
            value={reason}
            onChange={setReason}
            placeholder={act === "unmute" || act === "unsuspend" ? "e.g. Appeal accepted." : "Why, in a sentence the member will understand."}
          />
          <ConfirmBox
            title={
              act === "mute"
                ? `Pause posting for ${member.name}?`
                : act === "suspend"
                  ? `Suspend ${member.name}'s account?`
                  : act === "unmute"
                    ? `Lift the posting pause for ${member.name}?`
                    : `Lift ${member.name}'s suspension?`
            }
            text={
              act === "mute"
                ? `They can still read and browse CosQuest, but can't post, comment or send messages for ${MUTE.find((d) => d.value === duration)?.label.toLowerCase()}. They're told the reason.`
                : act === "suspend"
                  ? `They can't use CosQuest for ${SUSPEND.find((d) => d.value === duration)?.label.toLowerCase()}. They see the reason when they open the app.`
                  : "They can use CosQuest normally again right away."
            }
            confirmLabel={act === "mute" ? "Confirm pause" : act === "suspend" ? "Confirm suspension" : "Confirm"}
            onConfirm={confirm}
            onCancel={() => setAct(null)}
            busy={busy}
            disabled={(act === "mute" || act === "suspend") && reason.trim().length < 3}
          />
        </View>
      )}
      {done ? <DoneNote text={done} /> : null}
    </View>
  );
}

export default function AdminMembers() {
  const t = useAdminTheme();
  const { width } = useWindowDimensions();
  const wide = width >= 1200;
  const [stats, setStats] = useState<Awaited<ReturnType<typeof getMemberStats>> | null>(null);
  const [tab, setTab] = useState<Tab>("all");
  const [q, setQ] = useState("");
  const [role, setRole] = useState("all");
  const [offset, setOffset] = useState(0);
  const [rows, setRows] = useState<MemberRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    try {
      setStats(await getMemberStats());
    } catch {}
  }, []);

  const loadList = useCallback(async () => {
    try {
      const result = await listMembers({ tab, q: q.trim() || undefined, role: role === "all" ? undefined : role, offset });
      setRows(result.members);
      setTotal(result.total);
      setError("");
      setSelected((current) => (current && result.members.some((m) => m.id === current) ? current : result.members[0]?.id || null));
    } catch (e: any) {
      setError(e?.code === "not_deployed" ? "The Members backend (Phase 3) isn't deployed yet." : e?.message || "Couldn't load members.");
    }
  }, [tab, q, role, offset]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);
  useEffect(() => {
    const timer = setTimeout(loadList, q ? 300 : 0);
    return () => clearTimeout(timer);
  }, [loadList, q]);

  return (
    <View>
      <PageHeader title="Members" subtitle="Know your members, review their safety history and keep participation safe." right={<Button label="Export members" icon="download-outline" disabled />} />

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 20 }}>
        <StatCard title="Total membership" icon="people-outline" value={formatNumber(stats?.total)} footer={<Text style={{ fontFamily: FONTS.regular, fontSize: 12, color: t.muted }}>Registered CosQuest accounts</Text>} />
        <StatCard title="Active members" icon="pulse-outline" value={formatNumber(stats?.active.value)} footer={<Trend change={stats?.active.change ?? null} suffix="vs. previous 7 days" />} />
        <StatCard title="New this week" icon="person-add-outline" value={formatNumber(stats?.newMembers.value)} footer={<Trend change={stats?.newMembers.change ?? null} suffix="vs. previous 7 days" />} />
        <StatCard title="Pending" icon="hourglass-outline" value={formatNumber(stats?.pending)} footer={<Text style={{ fontFamily: FONTS.regular, fontSize: 12, color: t.amber }}>Haven't finished sign-up</Text>} />
      </View>

      <View style={{ flexDirection: wide ? "row" : "column", gap: 20, marginTop: 20, alignItems: "flex-start" }}>
        <Card style={{ flex: 1.55, alignSelf: "stretch" }}>
          <CardHeader title="Member directory" subtitle="Community membership · not game faction ranks" />
          <Tabs<Tab>
            value={tab}
            onChange={(key) => {
              setTab(key);
              setOffset(0);
              setSelected(null);
            }}
            tabs={[
              { key: "all", label: "All members" },
              { key: "pending", label: "Pending", count: stats?.pending },
              { key: "muted", label: "Muted", count: stats?.muted },
              { key: "suspended", label: "Suspended", count: stats?.suspended },
            ]}
          />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 12, zIndex: 20 }}>
            <SearchBox value={q} onChange={(text) => { setQ(text); setOffset(0); }} placeholder="Search name, @handle or email…" />
            <Select value={role} onChange={(v) => { setRole(v); setOffset(0); }} options={[{ value: "all", label: "All roles" }, { value: "admin", label: "Super admins" }, { value: "member", label: "Members" }]} />
          </View>
          <View style={{ flexDirection: "row", paddingVertical: 10, paddingHorizontal: 10, borderRadius: 8, backgroundColor: t.cardSoft }}>
            {["MEMBER", "ADMIN ROLE", "STATUS", "MEMBERSHIP", "LAST ACTIVE"].map((label, i) => (
              <Text key={label} style={{ flex: [2.6, 1.1, 1, 0.9, 1][i], fontFamily: FONTS.medium, fontSize: 10.5, letterSpacing: 0.5, color: t.faint }}>
                {label}
              </Text>
            ))}
          </View>
          {error ? (
            <View style={{ marginTop: 12 }}>
              <Notice tone="amber" text={error} />
            </View>
          ) : !rows ? (
            <Loading label="Loading members…" />
          ) : rows.length ? (
            rows.map((member) => <MemberItem key={member.id} member={member} selected={member.id === selected} onPress={() => setSelected(member.id)} />)
          ) : (
            <Text style={{ paddingVertical: 40, textAlign: "center", fontFamily: FONTS.regular, fontSize: 13, color: t.muted }}>No members match.</Text>
          )}
          {rows ? <Pager shown={rows.length} total={total} offset={offset} onPage={setOffset} noun="members" /> : null}
          <View style={{ marginTop: 16 }}>
            <Notice text="“Pending” means someone signed up but hasn't finished onboarding. Group join requests are on the Groups page." />
          </View>
        </Card>

        <Card style={{ flex: 1, alignSelf: "stretch" }}>
          {selected ? (
            <MemberPanel memberId={selected} onChanged={() => { loadStats(); loadList(); }} />
          ) : (
            <Text style={{ paddingVertical: 60, textAlign: "center", fontFamily: FONTS.regular, fontSize: 13, color: t.muted }}>Pick a member to see their details.</Text>
          )}
        </Card>
      </View>
    </View>
  );
}
