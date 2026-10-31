// ==========================================
// SUPER ADMIN DASHBOARD - Sparks (Figma "Sparks")
// ==========================================
// The topics bringing members together (any member can start a Spark),
// read-only. A Spark's state follows its conversation, not its creator's
// rank: Active = a reply in the last 24 h, Quiet = 1-7 days, Dormant = 7+.
// Direct-message Sparks are private and never shown. Pin / delete / merge
// administration is proposed; requirements are pending.
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View, useWindowDimensions } from "react-native";

import { Divider, Field, Pager, SearchBox, Tabs } from "@/components/admin/controls";
import { useAdminTheme } from "@/components/admin/theme";
import { Button, Card, CardHeader, Initials, Loading, Notice, PageHeader, Pill, StatCard, formatNumber, timeAgo } from "@/components/admin/ui";
import { FONTS } from "@/constants/fonts";
import { type AdminSpark, type SparkDetail, type TopicState, getSpark, getSparkStats, listSparks } from "@/services/adminSparks";

type Tab = "all" | TopicState;

const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const lastReply = (iso: string) => {
  const d = new Date(iso);
  const today = new Date();
  const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  return d.toDateString() === today.toDateString() ? `${time} today` : `${day(iso)} · ${time}`;
};

function StatePill({ state }: { state: TopicState }) {
  if (state === "active") return <Pill label="Active" tone="green" />;
  if (state === "quiet") return <Pill label="Quiet" tone="grey" />;
  return <Pill label="Dormant" tone="grey" />;
}

function SparkRow({ spark, selected, onPress }: { spark: AdminSpark; selected: boolean; onPress: () => void }) {
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
        <Ionicons name="flash-outline" size={18} color={t.pink} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontFamily: FONTS.medium, fontSize: 13, color: t.text }} numberOfLines={1}>
            {spark.subject}
            {spark.pinned ? "  📌" : ""}
          </Text>
          <Text style={{ marginTop: 2, fontFamily: FONTS.regular, fontSize: 11.5, color: t.muted }} numberOfLines={1}>
            {spark.chat.name}
          </Text>
        </View>
      </View>
      <View style={{ flex: 1.4, paddingRight: 8 }}>
        <Text style={{ fontFamily: FONTS.medium, fontSize: 12.5, color: t.text }} numberOfLines={1}>
          {spark.startedByBot ? "Sparks" : spark.creator?.name || "Member"}
        </Text>
        <Text style={{ marginTop: 2, fontFamily: FONTS.regular, fontSize: 11.5, color: t.muted }}>Started {day(spark.createdAt)}</Text>
      </View>
      <Text style={{ flex: 0.7, fontFamily: FONTS.regular, fontSize: 12.5, color: t.text }}>{formatNumber(spark.replies)}</Text>
      <View style={{ flex: 0.9 }}>
        <StatePill state={spark.state} />
      </View>
      <Text style={{ flex: 1.1, fontFamily: FONTS.regular, fontSize: 12, color: t.muted }}>{lastReply(spark.lastMessageAt)}</Text>
    </Pressable>
  );
}

function SparkPanel({ sparkId, onPick }: { sparkId: string; onPick: (id: string) => void }) {
  const t = useAdminTheme();
  const [data, setData] = useState<SparkDetail | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setData(null);
    getSpark(sparkId)
      .then((next) => {
        setData(next);
        setError("");
      })
      .catch((e) => setError(e?.message || "Couldn't load this Spark."));
  }, [sparkId]);

  if (error) return <Notice tone="red" text={error} />;
  if (!data) return <Loading />;
  const { spark, history, related, revivals, openReports } = data;

  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: FONTS.medium, fontSize: 16, color: t.text }}>{spark.subject}</Text>
          <Text style={{ marginTop: 3, fontFamily: FONTS.regular, fontSize: 12.5, color: t.muted }}>{spark.chat.name}</Text>
        </View>
        <StatePill state={spark.state} />
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 16 }}>
        <Initials name={spark.startedByBot ? "Sparks" : spark.creator?.name} size={34} />
        <View>
          <Text style={{ fontFamily: FONTS.medium, fontSize: 13, color: t.text }}>{spark.startedByBot ? "Sparks" : spark.creator?.name || "Member"}</Text>
          <Text style={{ marginTop: 2, fontFamily: FONTS.regular, fontSize: 11.5, color: t.muted }}>
            {spark.startedByBot ? "Started automatically from the conversation" : "Creator · Community member"} · Started {day(spark.createdAt)}
          </Text>
        </View>
      </View>
      {spark.summary ? <Text style={{ marginTop: 12, fontFamily: FONTS.regular, fontSize: 13, lineHeight: 19, color: t.muted }}>{spark.summary}</Text> : null}

      <View style={{ marginTop: 12 }}>
        <Field label="Replies">{`${formatNumber(spark.replies)} · ${formatNumber(spark.participants)} participating member${spark.participants === 1 ? "" : "s"}`}</Field>
        <Field label="Latest activity">{lastReply(spark.lastMessageAt)}</Field>
        <Field label="Comebacks">{spark.revivals ? `Came back ${spark.revivals} time${spark.revivals === 1 ? "" : "s"}` : "Never went quiet and came back"}</Field>
        <Field label="Open reports">{openReports ? `${openReports} on this Spark's messages` : "None on this Spark"}</Field>
      </View>
      {spark.chat.type !== null ? (
        <View style={{ flexDirection: "row", marginTop: 8 }}>
          <Button label="Open conversation ↗" onPress={() => router.navigate({ pathname: "/admin/chats", params: { conversation: spark.chat.id } } as any)} />
        </View>
      ) : null}

      <Divider />
      <Text style={{ fontFamily: FONTS.medium, fontSize: 14, color: t.text }}>Conversation history</Text>
      <Text style={{ marginTop: 3, fontFamily: FONTS.regular, fontSize: 12, color: t.muted }}>Recent replies, oldest first</Text>
      {history.length ? (
        history.slice(-8).map((m, i, list) => (
          <View key={m.id} style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
            <View style={{ alignItems: "center", width: 10 }}>
              <View style={{ width: 7, height: 7, borderRadius: 4, marginTop: 5, backgroundColor: t.border }} />
              {i < list.length - 1 ? <View style={{ flex: 1, width: 1, backgroundColor: t.line, marginTop: 2 }} /> : null}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: FONTS.medium, fontSize: 12, color: t.text }}>
                {m.sender?.name || "Member"} · {timeAgo(m.at)}
                {m.era ? ` · comeback ${m.era}` : ""}
              </Text>
              <Text style={{ marginTop: 3, fontFamily: FONTS.regular, fontSize: 12.5, lineHeight: 18, fontStyle: m.deleted ? "italic" : "normal", color: m.deleted ? t.faint : t.muted }}>
                {m.deleted ? "Deleted" : m.text}
              </Text>
            </View>
          </View>
        ))
      ) : (
        <Text style={{ marginTop: 8, fontFamily: FONTS.regular, fontSize: 12.5, color: t.muted }}>No replies yet.</Text>
      )}
      {revivals.length > 1 ? (
        <Text style={{ marginTop: 12, fontFamily: FONTS.regular, fontSize: 11.5, color: t.muted }}>
          {revivals.length} stretches of conversation since {day(revivals[0].startedAt)}.
        </Text>
      ) : null}

      {related.length ? (
        <>
          <Divider />
          <Text style={{ fontFamily: FONTS.medium, fontSize: 14, color: t.text }}>Related topics in {spark.chat.name}</Text>
          {related.map((r) => (
            <Pressable key={r.id} onPress={() => onPick(r.id)} style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10 }}>
              <Ionicons name="flash-outline" size={15} color={t.pink} />
              <Text style={{ flex: 1, fontFamily: FONTS.regular, fontSize: 12.5, color: t.text }} numberOfLines={1}>
                {r.subject} · {r.startedByBot ? "Sparks" : r.creator?.name || "Member"} · {formatNumber(r.replies)} replies
              </Text>
              <StatePill state={r.state} />
            </Pressable>
          ))}
        </>
      ) : null}
    </View>
  );
}

export default function AdminSparks() {
  const t = useAdminTheme();
  const { width } = useWindowDimensions();
  const wide = width >= 1200;
  const [stats, setStats] = useState<Awaited<ReturnType<typeof getSparkStats>> | null>(null);
  const [tab, setTab] = useState<Tab>("all");
  const [q, setQ] = useState("");
  const [offset, setOffset] = useState(0);
  const [rows, setRows] = useState<AdminSpark[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    try {
      setStats(await getSparkStats());
    } catch {}
  }, []);

  const loadList = useCallback(async () => {
    try {
      const result = await listSparks({ tab, q: q.trim() || undefined, offset });
      setRows(result.sparks);
      setTotal(result.total);
      setError("");
      setSelected((current) => current || result.sparks[0]?.id || null);
    } catch (e: any) {
      setError(
        e?.code === "not_deployed"
          ? "The Sparks backend (Phase 4) isn't deployed yet."
          : e?.code === "sparks_legacy"
            ? "The server is running the old Sparks engine, so there's nothing to show here."
            : e?.message || "Couldn't load Sparks.",
      );
    }
  }, [tab, q, offset]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);
  useEffect(() => {
    const timer = setTimeout(loadList, q ? 300 : 0);
    return () => clearTimeout(timer);
  }, [loadList, q]);

  return (
    <View>
      <PageHeader title="Sparks" subtitle="Follow the topics bringing members together. Any member can start a Spark." />

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 20 }}>
        <StatCard title="New Sparks this week" icon="flash-outline" value={formatNumber(stats?.newThisWeek)} footer={<Text style={{ fontFamily: FONTS.regular, fontSize: 12, color: t.muted }}>Started in the last 7 days</Text>} />
        <StatCard title="Active topics" icon="pulse-outline" value={formatNumber(stats?.active)} footer={<Text style={{ fontFamily: FONTS.regular, fontSize: 12, color: t.green }}>A reply within the last 24 hours</Text>} />
        <StatCard title="Quiet topics" icon="moon-outline" value={formatNumber(stats?.quiet)} footer={<Text style={{ fontFamily: FONTS.regular, fontSize: 12, color: t.muted }}>Last reply 1 to 7 days ago</Text>} />
        <StatCard title="Dormant topics" icon="bed-outline" value={formatNumber(stats?.dormant)} footer={<Text style={{ fontFamily: FONTS.regular, fontSize: 12, color: t.muted }}>No replies in the last 7 days</Text>} />
      </View>

      <View style={{ flexDirection: wide ? "row" : "column", gap: 20, marginTop: 20, alignItems: "flex-start" }}>
        <View style={{ flex: 1.55, gap: 20, alignSelf: "stretch" }}>
          <Card>
            <CardHeader title="Spark directory" subtitle={`${formatNumber(stats?.total)} topics across community groups and rooms`} right={<Pill label="Live topic activity" tone="green" />} />
            <Tabs<Tab>
              value={tab}
              onChange={(key) => {
                setTab(key);
                setOffset(0);
                setSelected(null);
              }}
              tabs={[
                { key: "all", label: "All topics", count: stats?.total },
                { key: "active", label: "Active", count: stats?.active },
                { key: "quiet", label: "Quiet", count: stats?.quiet },
                { key: "dormant", label: "Dormant", count: stats?.dormant },
              ]}
            />
            <View style={{ flexDirection: "row", marginBottom: 12 }}>
              <SearchBox value={q} onChange={(text) => { setQ(text); setOffset(0); }} placeholder="Search Spark topics…" />
            </View>
            <View style={{ flexDirection: "row", paddingVertical: 10, paddingHorizontal: 10, borderRadius: 8, backgroundColor: t.cardSoft }}>
              {["SPARK / GROUP", "CREATOR", "REPLIES", "STATE", "LAST REPLY"].map((label, i) => (
                <Text key={label} style={{ flex: [2.6, 1.4, 0.7, 0.9, 1.1][i], fontFamily: FONTS.medium, fontSize: 10.5, letterSpacing: 0.5, color: t.faint }}>
                  {label}
                </Text>
              ))}
            </View>
            {error ? (
              <View style={{ marginTop: 12 }}>
                <Notice tone="amber" text={error} />
              </View>
            ) : !rows ? (
              <Loading label="Loading Sparks…" />
            ) : rows.length ? (
              rows.map((spark) => <SparkRow key={spark.id} spark={spark} selected={spark.id === selected} onPress={() => setSelected(spark.id)} />)
            ) : (
              <Text style={{ paddingVertical: 40, textAlign: "center", fontFamily: FONTS.regular, fontSize: 13, color: t.muted }}>{q ? "No Sparks match." : "No Sparks here yet."}</Text>
            )}
            {rows ? <Pager shown={rows.length} total={total} offset={offset} onPage={setOffset} noun="Sparks" /> : null}
          </Card>

          <Card>
            <CardHeader title="Reading topic activity" subtitle="A Spark's state follows its conversation, not its creator's rank" />
            <View style={{ flexDirection: wide ? "row" : "column", gap: 20 }}>
              {[
                { title: "Active", text: "A new reply in the last 24 hours." },
                { title: "Quiet", text: "Last reply 1–7 days ago; the topic can come back." },
                { title: "Dormant", text: "No replies for over a week; its history remains." },
              ].map((item) => (
                <View key={item.title} style={{ flex: 1 }}>
                  <Text style={{ fontFamily: FONTS.medium, fontSize: 13, color: t.text }}>{item.title}</Text>
                  <Text style={{ marginTop: 4, fontFamily: FONTS.regular, fontSize: 12, lineHeight: 17, color: t.muted }}>{item.text}</Text>
                </View>
              ))}
            </View>
            <Text style={{ marginTop: 14, fontFamily: FONTS.regular, fontSize: 11.5, color: t.muted }}>Sparks in direct messages are private and never shown here.</Text>
          </Card>
        </View>

        <View style={{ flex: 1, gap: 20, alignSelf: "stretch" }}>
          <Card>
            {selected ? (
              <SparkPanel sparkId={selected} onPick={setSelected} />
            ) : (
              <Text style={{ paddingVertical: 60, textAlign: "center", fontFamily: FONTS.regular, fontSize: 13, color: t.muted }}>Pick a Spark to see its conversation.</Text>
            )}
          </Card>

          <Card>
            <CardHeader title="Sparks administration" subtitle="Proposed · requirements pending" />
            <Notice tone="amber" title="Not yet available" text="Spark pin, delete and merge administration is proposed. Its requirements are still being specified; these aren't enabled." />
            <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
              <Button label="Pin" disabled />
              <Button label="Delete" disabled />
              <Button label="Merge" disabled />
            </View>
            <Text style={{ marginTop: 12, fontFamily: FONTS.regular, fontSize: 11.5, color: t.muted }}>
              Topic monitoring is available now. Reported messages are reviewed through the moderation workflow.
            </Text>
          </Card>
        </View>
      </View>
    </View>
  );
}
