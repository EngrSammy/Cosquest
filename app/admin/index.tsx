// ==========================================
// SUPER ADMIN DASHBOARD - Overview (Figma "Community overview")
// ==========================================
// Stat cards, engagement trends (this week vs the previous one), community
// pulse, the moderation queue, recent admin activity and the busiest groups.
// Data: GET /api/admin/overview (backend Phase 1).
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View, useWindowDimensions } from "react-native";

import { setOpenReportsBadge } from "@/components/admin/AdminShell";
import { useAdminTheme } from "@/components/admin/theme";
import {
  AreaChart,
  Button,
  Card,
  CardHeader,
  Initials,
  Loading,
  Notice,
  PageHeader,
  Pill,
  StatCard,
  Trend,
  formatNumber,
  shortDate,
  timeAgo,
} from "@/components/admin/ui";
import { FONTS } from "@/constants/fonts";
import { AdminError, getOverview, type AuditItem, type Overview, type ReportPreview } from "@/services/admin";

const REASONS: Record<string, string> = {
  spam: "Spam / scam",
  harassment: "Harassment",
  impersonation: "Impersonation",
  creator_credit: "Creator credit",
  off_topic: "Off-topic",
  hate: "Hate",
  violence: "Violence",
  self_harm: "Self-harm",
  other: "Other",
};

const ACTIONS: Record<string, string> = {
  "post.remove": "removed a post",
  "comment.remove": "removed a comment",
  "message.delete": "deleted a message",
  "report.dismiss": "dismissed a report",
  "report.resolve": "resolved a report",
  "report.assign": "assigned a report",
  "member.mute": "muted a member",
  "member.unmute": "unmuted a member",
  "member.remove": "removed a member",
  "member.ban": "banned a member",
  "member.unban": "lifted a ban",
  "join.approve": "approved join requests",
  "join.decline": "declined a join request",
  "group.slow_mode": "changed slow mode",
  "group.update": "updated a group",
  "admin.grant": "gave super admin access",
  "admin.revoke": "removed super admin access",
  "admin.invite": "invited an admin",
  "settings.update": "updated community settings",
};

const TARGET_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  post: "newspaper-outline",
  comment: "chatbox-outline",
  message: "chatbubbles-outline",
  profile: "person-outline",
};

function reportTitle(report: ReportPreview) {
  const s = report.snapshot || {};
  if (report.targetType === "profile") return `Member profile · @${s.username || report.targetUser?.username || "unknown"}`;
  if (report.targetType === "message") return `Message in ${s.chat?.name || (s.chat?.type === "dm" ? "a direct message" : s.chat?.type === "community" ? "Community" : "a chat")}`;
  const text = String(s.text || "").trim();
  return text ? `“${text.length > 60 ? `${text.slice(0, 60)}…` : text}”` : report.targetType === "comment" ? "A comment" : "A post";
}

function reportWhere(report: ReportPreview) {
  const s = report.snapshot || {};
  const kind = { post: "Feed post", comment: "Comment", message: "Chat message", profile: "Member report" }[report.targetType];
  const who = s.author ? ` · @${s.author}` : "";
  return `${kind}${who} · ${timeAgo(report.createdAt)}`;
}

function StatusPill({ status }: { status: ReportPreview["status"] }) {
  if (status === "in_review") return <Pill label="In review" tone="amber" />;
  if (status === "new") return <Pill label="New" tone="blue" />;
  if (status === "resolved") return <Pill label="Resolved" tone="green" />;
  return <Pill label="Dismissed" tone="grey" />;
}

function ActivityRow({ item, last }: { item: AuditItem; last: boolean }) {
  const t = useAdminTheme();
  const name = item.actor?.name || item.actor?.username || "An admin";
  return (
    <View style={{ flexDirection: "row", gap: 12, paddingVertical: 12, borderBottomWidth: last ? 0 : 1, borderBottomColor: t.line }}>
      <Initials name={name} size={30} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontFamily: FONTS.medium, fontSize: 13, color: t.text }}>{name}</Text>
        <Text style={{ marginTop: 2, fontFamily: FONTS.regular, fontSize: 13, color: t.text }}>{ACTIONS[item.action] || item.action.replace(/[._]/g, " ")}</Text>
        <Text style={{ marginTop: 2, fontFamily: FONTS.regular, fontSize: 11.5, color: t.muted }} numberOfLines={1}>
          {[item.target?.label, item.reason ? `reason: ${item.reason}` : null].filter(Boolean).join(" · ") || item.area}
        </Text>
      </View>
      <Text style={{ fontFamily: FONTS.regular, fontSize: 11, color: t.faint }}>{timeAgo(item.createdAt)}</Text>
    </View>
  );
}

export default function AdminOverview() {
  const t = useAdminTheme();
  const { width } = useWindowDimensions();
  const wide = width >= 1180;
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<AdminError | null>(null);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    try {
      const overview = await getOverview();
      setData(overview);
      setError(null);
      setLoadedAt(new Date());
      setOpenReportsBadge(overview.stats.openReports.value);
    } catch (e) {
      setError(e instanceof AdminError ? e : new AdminError("Couldn't load the overview.", 0));
    }
  }, []);

  useEffect(() => {
    load();
    // Fresh numbers every minute while the page is open.
    const timer = setInterval(load, 60000);
    return () => clearInterval(timer);
  }, [load]);

  if (!data) {
    return (
      <View>
        <PageHeader title="Community overview" subtitle="A pulse on your community. Keep the creativity flowing and the conversations safe." />
        {error ? (
          <Notice
            tone={error.code === "not_deployed" ? "amber" : "red"}
            title={error.code === "not_deployed" ? "The admin server isn't deployed yet" : "Couldn't load the overview"}
            text={error.code === "not_deployed" ? "The dashboard is ready; its backend (Phase 1) is waiting to be deployed." : error.message}
            action={
              <View style={{ marginTop: 8, flexDirection: "row" }}>
                <Button label="Try again" icon="refresh-outline" onPress={load} />
              </View>
            }
          />
        ) : (
          <Loading label="Loading the overview…" />
        )}
      </View>
    );
  }

  const s = data.stats;
  const range = `${shortDate(data.window.from)} – ${shortDate(new Date(new Date(data.window.to).getTime() - 1).toISOString())}, ${new Date(data.window.to).getFullYear()}`;
  const healthy = s.openReports.high === 0;
  const mix = data.pulse.mix;
  const pct = (part: number) => (mix.total ? Math.round((part / mix.total) * 100) : 0);
  const engagementChange = s.interactions.change;
  const busiest = data.engagement.current.reduce((best, day) => (day.interactions > best.interactions ? day : best), data.engagement.current[0] || { date: "", interactions: 0 });
  const busiestDay = busiest.date ? new Date(`${busiest.date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long" }) : null;
  const row = { flexDirection: wide ? ("row" as const) : ("column" as const), gap: 20, marginTop: 20 };

  return (
    <View>
      <PageHeader
        title="Community overview"
        subtitle="A pulse on your community. Keep the creativity flowing and the conversations safe."
        badge={<Pill label={healthy ? "Healthy" : "Needs attention"} tone={healthy ? "green" : "amber"} dot />}
        right={
          <>
            <Button label={range} icon="calendar-outline" />
            <Button label="Export report" icon="download-outline" disabled />
          </>
        }
      />

      {/* STAT CARDS */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 20 }}>
        <StatCard
          title="Active members"
          icon="people-outline"
          value={formatNumber(s.activeMembers.value)}
          footer={<Trend change={s.activeMembers.change} suffix="vs. previous 7 days" />}
        />
        <StatCard
          title="Community interactions"
          icon="heart-outline"
          value={formatNumber(s.interactions.value)}
          series={s.interactions.series.map((p) => p.value)}
          footer={<Trend change={s.interactions.change} suffix="reactions, comments & replies" />}
        />
        <StatCard
          title="Active groups"
          icon="albums-outline"
          value={formatNumber(s.activeGroups.value)}
          footer={
            <Text style={{ fontFamily: FONTS.regular, fontSize: 12, color: t.muted }}>
              <Text style={{ fontFamily: FONTS.medium, color: t.green }}>↑ {s.activeGroups.newThisPeriod} new</Text>
              {`  of ${formatNumber(s.activeGroups.total)} total groups`}
            </Text>
          }
        />
        <StatCard
          title="Open reports"
          icon="flag-outline"
          value={formatNumber(s.openReports.value)}
          series={s.openReports.series.map((p) => p.value)}
          seriesColor={t.amber}
          footer={
            <Text style={{ fontFamily: FONTS.regular, fontSize: 12, color: t.muted }}>
              <Text style={{ fontFamily: FONTS.medium, color: s.openReports.high ? t.amber : t.green }}>{s.openReports.high} high priority</Text>
              {`  ${s.openReports.new} new · ${s.openReports.inReview} in review`}
            </Text>
          }
        />
      </View>

      {/* ENGAGEMENT + PULSE */}
      <View style={row}>
        <Card style={{ flex: 2 }}>
          <CardHeader
            title="Engagement trends"
            subtitle="Daily interactions across Feeds and Chats"
            right={
              <View style={{ flexDirection: "row", gap: 14 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: t.pink }} />
                  <Text style={{ fontFamily: FONTS.regular, fontSize: 11.5, color: t.muted }}>This week</Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: t.chartPrevious }} />
                  <Text style={{ fontFamily: FONTS.regular, fontSize: 11.5, color: t.muted }}>Previous week</Text>
                </View>
              </View>
            }
          />
          <AreaChart
            current={data.engagement.current.map((d) => d.interactions)}
            previous={data.engagement.previous.map((d) => d.interactions)}
            labels={data.engagement.current.map((d) => shortDate(d.date))}
          />
          <View style={{ marginTop: 12 }}>
            <Trend
              change={engagementChange}
              suffix={`${engagementChange == null ? "" : engagementChange >= 0 ? "more" : "fewer"} interactions than the previous week${busiestDay ? ` · highest activity on ${busiestDay}` : ""}`}
            />
          </View>
        </Card>

        <Card style={{ flex: 1 }}>
          <CardHeader title="Community pulse" subtitle="This week, at a glance" />
          <View style={{ flexDirection: "row", gap: 26 }}>
            {[
              { value: data.pulse.feedPosts, label: "Feed posts" },
              { value: data.pulse.chatMessages, label: "Chat messages" },
              { value: data.pulse.newSparks, label: "New Sparks" },
            ].map((item) => (
              <View key={item.label}>
                <Text style={{ fontFamily: FONTS.regular, fontSize: 24, color: t.text }}>{formatNumber(item.value)}</Text>
                <Text style={{ marginTop: 2, fontFamily: FONTS.regular, fontSize: 11.5, color: t.muted }}>{item.label}</Text>
              </View>
            ))}
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 26 }}>
            <Text style={{ fontFamily: FONTS.medium, fontSize: 12.5, color: t.text }}>Interaction mix</Text>
            <Text style={{ fontFamily: FONTS.regular, fontSize: 11.5, color: t.muted }}>{formatNumber(mix.total)} total</Text>
          </View>
          <View style={{ flexDirection: "row", height: 8, marginTop: 10, borderRadius: 4, overflow: "hidden", backgroundColor: t.cardSoft, gap: 2 }}>
            {mix.total ? (
              <>
                <View style={{ flex: mix.reactions || 0.0001, backgroundColor: t.pink }} />
                <View style={{ flex: mix.comments || 0.0001, backgroundColor: t.blue }} />
                <View style={{ flex: mix.replies || 0.0001, backgroundColor: t.chartPrevious }} />
              </>
            ) : null}
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 10 }}>
            {[
              { label: `Reactions ${pct(mix.reactions)}%`, color: t.pink },
              { label: `Comments ${pct(mix.comments)}%`, color: t.blue },
              { label: `Replies ${pct(mix.replies)}%`, color: t.chartPrevious },
            ].map((item) => (
              <View key={item.label} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: item.color }} />
                <Text style={{ fontFamily: FONTS.regular, fontSize: 11.5, color: t.muted }}>{item.label}</Text>
              </View>
            ))}
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 22, paddingTop: 16, borderTopWidth: 1, borderTopColor: t.line }}>
            <Text style={{ fontFamily: FONTS.regular, fontSize: 12.5, color: t.muted }}>New members</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Text style={{ fontFamily: FONTS.medium, fontSize: 14, color: t.text }}>+{formatNumber(data.pulse.newMembers.value)}</Text>
              <Trend change={data.pulse.newMembers.change} />
            </View>
          </View>
        </Card>
      </View>

      {/* MODERATION QUEUE + RECENT ACTIVITY */}
      <View style={row}>
        <Card style={{ flex: 2 }}>
          <CardHeader
            title="Moderation queue"
            right={
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Pill label={`${s.openReports.value} open`} />
                {s.openReports.high ? <Pill label={`${s.openReports.high} high priority`} tone="red" /> : null}
                <Button label="Open queue" icon="shield-checkmark-outline" variant="primary" onPress={() => router.navigate("/admin/moderation" as any)} />
              </View>
            }
          />
          <View style={{ flexDirection: "row", gap: 24, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: t.line }}>
            <Text style={{ fontFamily: FONTS.medium, fontSize: 12.5, color: t.pinkText }}>All open  {s.openReports.value}</Text>
            <Text style={{ fontFamily: FONTS.regular, fontSize: 12.5, color: t.muted }}>New  {s.openReports.new}</Text>
            <Text style={{ fontFamily: FONTS.regular, fontSize: 12.5, color: t.muted }}>In review  {s.openReports.inReview}</Text>
          </View>

          {data.queue.length ? (
            <>
              <View style={{ flexDirection: "row", paddingVertical: 12 }}>
                {["REPORTED CONTENT", "REASON", "STATUS", "ACTION"].map((label, i) => (
                  <Text key={label} style={{ flex: [3, 1.4, 1, 1.2][i], fontFamily: FONTS.medium, fontSize: 10.5, letterSpacing: 0.5, color: t.faint }}>
                    {label}
                  </Text>
                ))}
              </View>
              {data.queue.map((report, index) => (
                <View key={report.id} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 14, borderTopWidth: index ? 1 : 0, borderTopColor: t.line }}>
                  <View style={{ flex: 3, flexDirection: "row", alignItems: "center", gap: 12, paddingRight: 12 }}>
                    <View style={{ width: 34, height: 34, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: t.blueSoft }}>
                      <Ionicons name={TARGET_ICON[report.targetType]} size={17} color={t.blue} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ fontFamily: FONTS.regular, fontSize: 13, color: t.text }} numberOfLines={1}>
                        {reportTitle(report)}
                      </Text>
                      <Text style={{ marginTop: 2, fontFamily: FONTS.regular, fontSize: 11.5, color: t.muted }} numberOfLines={1}>
                        {report.number} · {reportWhere(report)}
                      </Text>
                    </View>
                  </View>
                  <View style={{ flex: 1.4 }}>
                    <Text style={{ fontFamily: FONTS.regular, fontSize: 12.5, color: t.text }}>{REASONS[report.reason] || report.reason}</Text>
                    <Text style={{ marginTop: 2, fontFamily: FONTS.regular, fontSize: 11, color: report.priority === "high" ? t.red : t.faint }}>
                      {report.priority === "high" ? "High priority" : "Standard"}
                      {report.reporterCount > 1 ? ` · ${report.reporterCount} reports` : ""}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <StatusPill status={report.status} />
                  </View>
                  <View style={{ flex: 1.2 }}>
                    <Button label="Review" onPress={() => router.navigate({ pathname: "/admin/moderation", params: { report: report.id } } as any)} />
                  </View>
                </View>
              ))}
            </>
          ) : (
            <View style={{ paddingVertical: 34, alignItems: "center", gap: 6 }}>
              <Ionicons name="checkmark-circle-outline" size={26} color={t.green} />
              <Text style={{ fontFamily: FONTS.medium, fontSize: 13.5, color: t.text }}>No open reports</Text>
              <Text style={{ fontFamily: FONTS.regular, fontSize: 12.5, color: t.muted }}>Reports from members will appear here.</Text>
            </View>
          )}

          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8, paddingTop: 14, borderTopWidth: 1, borderTopColor: t.line }}>
            <Text style={{ fontFamily: FONTS.regular, fontSize: 11.5, color: t.muted }}>
              Showing {data.queue.length} of {s.openReports.value} · Removal, bans and mutes require confirmation.
            </Text>
            <Pressable onPress={() => router.navigate("/admin/moderation" as any)}>
              <Text style={{ fontFamily: FONTS.medium, fontSize: 12, color: t.pinkText }}>View all reports →</Text>
            </Pressable>
          </View>
        </Card>

        <Card style={{ flex: 1 }}>
          <CardHeader
            title="Recent admin activity"
            right={
              <Pressable onPress={() => router.navigate("/admin/audit" as any)}>
                <Text style={{ fontFamily: FONTS.medium, fontSize: 12, color: t.pinkText }}>Audit log ↗</Text>
              </Pressable>
            }
          />
          {data.recentActivity.length ? (
            data.recentActivity.map((item, index) => <ActivityRow key={item.id} item={item} last={index === data.recentActivity.length - 1} />)
          ) : (
            <Text style={{ paddingVertical: 24, textAlign: "center", fontFamily: FONTS.regular, fontSize: 12.5, color: t.muted }}>No admin actions yet.</Text>
          )}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12, paddingTop: 14, borderTopWidth: 1, borderTopColor: t.line }}>
            <Ionicons name="shield-checkmark-outline" size={14} color={t.green} />
            <Text style={{ fontFamily: FONTS.regular, fontSize: 11.5, color: t.muted }}>All actions attributed to an assigned admin role.</Text>
          </View>
        </Card>
      </View>

      {/* ACTIVE GROUPS + SPARKS */}
      <View style={row}>
        <Card style={{ flex: 1 }}>
          <CardHeader
            title="Active groups"
            subtitle="Top conversations this week"
            right={
              <Pressable onPress={() => router.navigate("/admin/groups" as any)}>
                <Text style={{ fontFamily: FONTS.medium, fontSize: 12, color: t.pinkText }}>All groups ↗</Text>
              </Pressable>
            }
          />
          <View style={{ flexDirection: "row", paddingBottom: 8 }}>
            <Text style={{ flex: 1, fontFamily: FONTS.medium, fontSize: 10.5, letterSpacing: 0.5, color: t.faint }}>GROUP</Text>
            <Text style={{ fontFamily: FONTS.medium, fontSize: 10.5, letterSpacing: 0.5, color: t.faint }}>MESSAGES</Text>
          </View>
          {data.activeGroups.length ? (
            data.activeGroups.map((group, index) => (
              <View key={group.id} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderTopWidth: index ? 1 : 0, borderTopColor: t.line }}>
                <Initials name={group.name} size={34} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontFamily: FONTS.medium, fontSize: 13, color: t.text }} numberOfLines={1}>
                    {group.name}
                  </Text>
                  <Text style={{ marginTop: 2, fontFamily: FONTS.regular, fontSize: 11.5, color: t.muted }}>
                    {formatNumber(group.members)} members · {group.kind === "private" ? "Private" : group.kind === "faction" ? "Faction" : "Open"}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={{ fontFamily: FONTS.medium, fontSize: 13.5, color: t.text }}>{formatNumber(group.messages)}</Text>
                  <Text style={{ marginTop: 2, fontFamily: FONTS.regular, fontSize: 11, color: group.openReports ? t.amber : t.green }}>
                    {group.openReports ? `${group.openReports} report${group.openReports === 1 ? "" : "s"}` : "Clear"}
                  </Text>
                </View>
              </View>
            ))
          ) : (
            <Text style={{ paddingVertical: 24, textAlign: "center", fontFamily: FONTS.regular, fontSize: 12.5, color: t.muted }}>No group conversations this week.</Text>
          )}
          <Text style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: t.line, fontFamily: FONTS.regular, fontSize: 11.5, color: t.muted }}>
            {formatNumber(s.activeGroups.value)} active groups across the community
          </Text>
        </Card>

        <Card style={{ flex: 1 }}>
          <CardHeader title="Sparks activity" subtitle={data.pulse.newSparks != null ? `${data.pulse.newSparks} started this week · Any member can start a Spark` : "Any member can start a Spark"} />
          <Notice text="The full Sparks view (every Spark, its state and history) arrives with the Sparks page. Spark pin, delete and merge administration is proposed; requirements are pending." />
        </Card>
      </View>

      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 24, marginBottom: 8 }}>
        <Text style={{ fontFamily: FONTS.medium, fontSize: 10.5, letterSpacing: 0.5, color: t.faint }}>COMMUNITY OPERATIONS · COSQUEST</Text>
        <Text style={{ fontFamily: FONTS.regular, fontSize: 11, color: t.faint }}>
          {loadedAt ? `Last updated ${loadedAt.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}` : ""}
        </Text>
      </View>
    </View>
  );
}
