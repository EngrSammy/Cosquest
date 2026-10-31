// ==========================================
// SUPER ADMIN DASHBOARD - Feeds (Figma "Feeds")
// ==========================================
// Every community post (All / Reported / Removed), the post's details and
// reports, and removing it (hidden, kept as evidence) or restoring it.
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Platform, Pressable, Text, View, useWindowDimensions } from "react-native";

import { ConfirmBox, Divider, DoneNote, Field, Pager, ReasonBox, ReportStatusPill, SearchBox, Select, Tabs, Toggle } from "@/components/admin/controls";
import { useAdminTheme } from "@/components/admin/theme";
import { Button, Card, CardHeader, Initials, Loading, Notice, PageHeader, StatCard, formatNumber, timeAgo } from "@/components/admin/ui";
import { FONTS } from "@/constants/fonts";
import { type AdminPost, REASON_LABELS, getFeedStats, getPost, listPosts, removePost, restorePost } from "@/services/adminContent";

type Tab = "all" | "reported" | "removed";

const when = (iso: string) =>
  `${new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · ${new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })}`;

function titleOf(post: AdminPost) {
  const first = String(post.text || "").split("\n")[0].trim();
  if (first) return first.length > 60 ? `${first.slice(0, 60)}…` : first;
  return post.type === "reel" ? "Reel" : post.type === "image" ? "Photo post" : post.type === "share" ? "Shared post" : "Post";
}

function PostRow({ post, selected, onPress }: { post: AdminPost; selected: boolean; onPress: () => void }) {
  const t = useAdminTheme();
  const thumb = post.media.find((m) => m.kind === "image")?.url;
  return (
    <Pressable
      onPress={onPress}
      style={({ hovered }: any) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        paddingVertical: 12,
        paddingHorizontal: 10,
        borderTopWidth: 1,
        borderTopColor: t.line,
        borderLeftWidth: 2,
        borderLeftColor: selected ? t.pink : "transparent",
        backgroundColor: selected ? t.pinkSoft : hovered ? t.cardSoft : "transparent",
      })}>
      {thumb ? (
        <Image source={{ uri: thumb }} style={{ width: 52, height: 52, borderRadius: 8 }} contentFit="cover" />
      ) : (
        <View style={{ width: 52, height: 52, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: t.blueSoft }}>
          <Ionicons name={post.type === "reel" ? "play-circle-outline" : "newspaper-outline"} size={20} color={t.blue} />
        </View>
      )}
      <View style={{ flex: 3, minWidth: 0 }}>
        <Text style={{ fontFamily: FONTS.medium, fontSize: 13, color: t.text }} numberOfLines={1}>
          {titleOf(post)}
        </Text>
        <Text style={{ marginTop: 2, fontFamily: FONTS.regular, fontSize: 12, color: t.muted }} numberOfLines={1}>
          {post.text?.split("\n").slice(1).join(" ").trim() || post.text || ""}
        </Text>
        <Text style={{ marginTop: 3, fontFamily: FONTS.regular, fontSize: 11, color: t.faint }} numberOfLines={1}>
          {post.label} · @{post.author?.username || "member"} · {when(post.createdAt)}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <ReportStatusPill status={post.status} />
      </View>
      <Text style={{ flex: 0.9, fontFamily: FONTS.regular, fontSize: 12.5, color: t.text }}>
        {formatNumber(post.reactions)} / {formatNumber(post.comments)}
      </Text>
      <Text style={{ flex: 0.6, fontFamily: FONTS.medium, fontSize: 12.5, color: post.openReports ? t.amber : t.faint }}>{post.openReports || 0}</Text>
    </Pressable>
  );
}

function PostPanel({ postId, onChanged }: { postId: string; onChanged: () => void }) {
  const t = useAdminTheme();
  const [data, setData] = useState<Awaited<ReturnType<typeof getPost>> | null>(null);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState("");

  const load = useCallback(async () => {
    try {
      setData(await getPost(postId));
      setError("");
    } catch (e: any) {
      setError(e?.message || "Couldn't load this post.");
    }
  }, [postId]);

  useEffect(() => {
    setData(null);
    setConfirming(false);
    setReason("");
    setDone("");
    load();
  }, [load]);

  if (error) return <Notice tone="red" text={error} />;
  if (!data) return <Loading label="Loading the post…" />;
  const { post, reports } = data;
  const removed = post.status === "removed";
  const openReports = reports.filter((r) => r.status === "new" || r.status === "in_review");

  const act = async () => {
    setBusy(true);
    try {
      const result = removed ? await restorePost(post.id, reason.trim()) : await removePost(post.id, reason.trim(), notify);
      setDone(`${removed ? "Post restored" : "Post removed"}. Recorded as ${result.auditEvent}.`);
      setConfirming(false);
      setReason("");
      await load();
      onChanged();
    } catch (e: any) {
      setError(e?.message || "Couldn't do that.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: FONTS.medium, fontSize: 16, color: t.text }}>Post details</Text>
          <Text style={{ marginTop: 3, fontFamily: FONTS.regular, fontSize: 12.5, color: t.muted }}>{post.label} · Native community feed</Text>
        </View>
        <ReportStatusPill status={post.status} />
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 16 }}>
        <Initials name={post.author?.name} size={36} />
        <View>
          <Text style={{ fontFamily: FONTS.medium, fontSize: 13.5, color: t.text }}>@{post.author?.username || "member"}</Text>
          <Text style={{ marginTop: 2, fontFamily: FONTS.regular, fontSize: 11.5, color: t.muted }}>Posted {when(post.createdAt)}</Text>
        </View>
      </View>

      <View style={{ marginTop: 14, padding: 16, borderRadius: 12, backgroundColor: t.cardSoft }}>
        {post.media.length ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: post.text ? 12 : 0 }}>
            {post.media.slice(0, 4).map((m) =>
              m.kind === "image" ? (
                <Image key={m.url} source={{ uri: m.url }} style={{ width: 92, height: 92, borderRadius: 8 }} contentFit="cover" />
              ) : (
                <View key={m.url} style={{ width: 92, height: 92, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: t.border }}>
                  <Ionicons name="play" size={22} color={t.muted} />
                </View>
              ),
            )}
          </View>
        ) : null}
        <Text style={{ fontFamily: FONTS.regular, fontSize: 14, lineHeight: 21, color: t.text }}>{post.text || "(no text)"}</Text>
      </View>

      <Text style={{ marginTop: 12, fontFamily: FONTS.regular, fontSize: 12.5, color: t.muted }}>
        ♡ {formatNumber(post.reactions)} reactions · {formatNumber(post.comments)} comments{post.openReports ? ` · ${post.openReports} open reports` : ""}
      </Text>
      <View style={{ marginTop: 6 }}>
        <Field label="Distribution">{removed ? "Hidden from everyone" : "Community feed · visible to all members"}</Field>
        <Field label="Last edited">{post.editedAt ? timeAgo(post.editedAt) : "Not edited"}</Field>
        {removed && post.removed ? <Field label="Removed">{`${timeAgo(post.removed.at)} · ${post.removed.reason}`}</Field> : null}
        {Platform.OS === "web" && !removed ? (
          <Pressable onPress={() => (window as any).open(`/post/${post.id}`, "_blank")} style={{ marginTop: 6 }}>
            <Text style={{ fontFamily: FONTS.medium, fontSize: 12.5, color: t.pinkText }}>Open original post ↗</Text>
          </Pressable>
        ) : null}
      </View>

      {reports.length ? (
        <>
          <Divider />
          <Text style={{ fontFamily: FONTS.medium, fontSize: 14, color: t.text }}>Reported content</Text>
          {reports.slice(0, 3).map((r) => (
            <View key={r.id} style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: FONTS.regular, fontSize: 12.5, color: t.text }}>
                  {r.number} · {REASON_LABELS[r.reason] || r.reason} · {r.priority === "high" ? "High priority" : "Standard"}
                </Text>
                <Text style={{ marginTop: 2, fontFamily: FONTS.regular, fontSize: 11.5, color: t.muted }}>
                  {r.reporterCount} member report{r.reporterCount === 1 ? "" : "s"} · {timeAgo(r.createdAt)}
                </Text>
              </View>
              <ReportStatusPill status={r.status} />
            </View>
          ))}
          {openReports.length ? (
            <View style={{ marginTop: 12, flexDirection: "row" }}>
              <Button label="Review in Moderation" icon="shield-checkmark-outline" onPress={() => router.navigate({ pathname: "/admin/moderation", params: { report: openReports[0].id } } as any)} />
            </View>
          ) : null}
        </>
      ) : null}

      <Divider />
      <Text style={{ fontFamily: FONTS.medium, fontSize: 14, color: t.text }}>Post actions</Text>
      <Text style={{ marginTop: 3, fontFamily: FONTS.regular, fontSize: 12, color: t.muted }}>Keep the author and context attached to every decision.</Text>
      {!confirming ? (
        <View style={{ flexDirection: "row", marginTop: 12 }}>
          <Button label={removed ? "Restore post…" : "Remove post…"} icon={removed ? "refresh-outline" : "trash-outline"} onPress={() => setConfirming(true)} />
        </View>
      ) : (
        <>
          <ReasonBox value={reason} onChange={setReason} placeholder={removed ? "Why this post can come back." : "What rule this breaks, in a sentence the author will understand."} />
          {!removed ? <Toggle value={notify} onChange={setNotify} label="Notify the author" hint="They receive this reason in CosQuest." /> : null}
          <ConfirmBox
            title={removed ? "Confirm restore" : "Confirm removal"}
            text={
              removed
                ? `Make ${post.label} visible in the community feed again? This is recorded in the audit log.`
                : `Remove ${post.label} from the community feed?${notify ? " The author will receive this reason." : ""} A snapshot is retained for review${openReports.length ? ", and its open reports are resolved" : ""}.`
            }
            confirmLabel={removed ? "Confirm restore" : "Confirm removal"}
            onConfirm={act}
            onCancel={() => setConfirming(false)}
            busy={busy}
            disabled={reason.trim().length < 3}
          />
        </>
      )}
      {done ? <DoneNote text={done} /> : null}
    </View>
  );
}

export default function AdminFeeds() {
  const t = useAdminTheme();
  const { width } = useWindowDimensions();
  const wide = width >= 1200;
  const [stats, setStats] = useState<Awaited<ReturnType<typeof getFeedStats>> | null>(null);
  const [tab, setTab] = useState<Tab>("all");
  const [q, setQ] = useState("");
  const [type, setType] = useState("all");
  const [offset, setOffset] = useState(0);
  const [rows, setRows] = useState<AdminPost[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    try {
      setStats(await getFeedStats());
    } catch {}
  }, []);

  const loadList = useCallback(async () => {
    try {
      const result = await listPosts({ tab, q: q.trim() || undefined, type: type === "all" ? undefined : type, offset });
      setRows(result.posts);
      setTotal(result.total);
      setError("");
      setSelected((current) => (current && result.posts.some((p) => p.id === current) ? current : result.posts[0]?.id || null));
    } catch (e: any) {
      setError(e?.code === "not_deployed" ? "The Feeds backend (Phase 2) isn't deployed yet." : e?.message || "Couldn't load posts.");
    }
  }, [tab, q, type, offset]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);
  useEffect(() => {
    const timer = setTimeout(loadList, q ? 300 : 0);
    return () => clearTimeout(timer);
  }, [loadList, q]);

  return (
    <View>
      <PageHeader title="Feeds" subtitle="Manage the native CosQuest community feed, from fresh creations to reported posts." right={<Button label="Export posts" icon="download-outline" disabled />} />

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 20 }}>
        <StatCard title="Feed posts" icon="newspaper-outline" value={formatNumber(stats?.posts)} footer={<Text style={{ fontFamily: FONTS.regular, fontSize: 12, color: t.muted }}>Published in the last 7 days</Text>} />
        <StatCard title="Reactions" icon="heart-outline" value={formatNumber(stats?.reactions)} footer={<Text style={{ fontFamily: FONTS.regular, fontSize: 12, color: t.muted }}>On posts, last 7 days</Text>} />
        <StatCard title="Open post reports" icon="flag-outline" value={formatNumber(stats?.openReports)} footer={<Text style={{ fontFamily: FONTS.regular, fontSize: 12, color: t.amber }}>Review in the moderation queue</Text>} />
        <StatCard title="Removed posts" icon="eye-off-outline" value={formatNumber(stats?.removed)} footer={<Text style={{ fontFamily: FONTS.regular, fontSize: 12, color: t.muted }}>Hidden, kept as evidence</Text>} />
      </View>

      <View style={{ flexDirection: wide ? "row" : "column", gap: 20, marginTop: 20, alignItems: "flex-start" }}>
        <Card style={{ flex: 1.55, alignSelf: "stretch" }}>
          <CardHeader title="Community posts" subtitle="All recent content · latest first" />
          <Tabs<Tab>
            value={tab}
            onChange={(key) => {
              setTab(key);
              setOffset(0);
              setSelected(null);
            }}
            tabs={[
              { key: "all", label: "All posts" },
              { key: "reported", label: "Reported", count: stats?.openReports },
              { key: "removed", label: "Removed", count: stats?.removed },
            ]}
          />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 12, zIndex: 20 }}>
            <SearchBox value={q} onChange={(text) => { setQ(text); setOffset(0); }} placeholder="Search post text or @author…" />
            <Select value={type} onChange={(v) => { setType(v); setOffset(0); }} options={[{ value: "all", label: "Content type" }, { value: "image", label: "Photos" }, { value: "reel", label: "Reels" }, { value: "thought", label: "Thoughts" }, { value: "share", label: "Shares" }]} />
          </View>
          <View style={{ flexDirection: "row", gap: 14, paddingVertical: 10, paddingHorizontal: 10, borderRadius: 8, backgroundColor: t.cardSoft }}>
            <Text style={{ width: 52 }} />
            {["CONTENT / AUTHOR / PUBLISHED", "STATUS", "REACTIONS / COMMENTS", "REPORTS"].map((label, i) => (
              <Text key={label} style={{ flex: [3, 1, 0.9, 0.6][i], fontFamily: FONTS.medium, fontSize: 10.5, letterSpacing: 0.5, color: t.faint }}>
                {label}
              </Text>
            ))}
          </View>
          {error ? (
            <View style={{ marginTop: 12 }}>
              <Notice tone="amber" text={error} />
            </View>
          ) : !rows ? (
            <Loading label="Loading posts…" />
          ) : rows.length ? (
            rows.map((post) => <PostRow key={post.id} post={post} selected={post.id === selected} onPress={() => setSelected(post.id)} />)
          ) : (
            <Text style={{ paddingVertical: 40, textAlign: "center", fontFamily: FONTS.regular, fontSize: 13, color: t.muted }}>
              {tab === "removed" ? "No removed posts." : tab === "reported" ? "No reported posts." : "No posts match."}
            </Text>
          )}
          {rows ? <Pager shown={rows.length} total={total} offset={offset} onPage={setOffset} noun="posts" /> : null}
        </Card>

        <Card style={{ flex: 1, alignSelf: "stretch" }}>
          {selected ? (
            <PostPanel postId={selected} onChanged={() => { loadStats(); loadList(); }} />
          ) : (
            <Text style={{ paddingVertical: 60, textAlign: "center", fontFamily: FONTS.regular, fontSize: 13, color: t.muted }}>Pick a post to see its details.</Text>
          )}
        </Card>
      </View>
    </View>
  );
}
