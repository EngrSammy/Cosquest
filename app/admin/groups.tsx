// ==========================================
// SUPER ADMIN DASHBOARD - Groups (Figma "Groups")
// ==========================================
// Every user-created group with its health (reports, quiet, healthy), and
// managing one: owner and admins, joining & privacy, join requests, its
// reports and chat, archive / restore.
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Platform, Pressable, Text, TextInput, View, useWindowDimensions } from "react-native";

import { ConfirmBox, Divider, DoneNote, Field, Pager, ReasonBox, SearchBox, Select, Tabs, Toggle } from "@/components/admin/controls";
import { useAdminTheme } from "@/components/admin/theme";
import { Button, Card, CardHeader, Initials, Loading, Notice, PageHeader, Pill, StatCard, formatNumber, timeAgo } from "@/components/admin/ui";
import { FONTS } from "@/constants/fonts";
import { contactOwner, createGroup, downloadCsv } from "@/services/adminExtras";
import { type GroupDetail, type GroupRow, decideJoinRequest, getGroup, getGroupStats, listGroups, setGroupArchived, updateGroupSettings } from "@/services/adminPeople";

type Tab = "all" | "active" | "attention" | "archived";

const KIND = { open: "Open", private: "Private", faction: "Faction" } as const;
const SLOW: Record<number, string> = { 0: "Off", 10: "10 sec", 30: "30 sec", 60: "1 min", 300: "5 min", 3600: "1 hour" };

function HealthPill({ group }: { group: GroupRow }) {
  if (group.health === "reports") return <Pill label={`${group.openReports} report${group.openReports === 1 ? "" : "s"}`} tone="amber" />;
  if (group.health === "healthy") return <Pill label="Healthy" tone="green" />;
  if (group.health === "archived") return <Pill label="Archived" tone="grey" />;
  return <Pill label="Quiet" tone="grey" />;
}

function GroupItem({ group, selected, onPress }: { group: GroupRow; selected: boolean; onPress: () => void }) {
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
      <View style={{ flex: 2.8, flexDirection: "row", alignItems: "center", gap: 12, paddingRight: 10 }}>
        <Initials name={group.name} size={34} tone="blue" />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontFamily: FONTS.medium, fontSize: 13, color: t.text }} numberOfLines={1}>
            {group.name}
          </Text>
          <Text style={{ marginTop: 2, fontFamily: FONTS.regular, fontSize: 11.5, color: t.muted }} numberOfLines={1}>
            {group.kind === "faction" && group.factionKey ? `${group.factionKey} · ` : ""}Owner: {group.owner?.name || "—"}
          </Text>
        </View>
      </View>
      <Text style={{ flex: 0.8, fontFamily: FONTS.regular, fontSize: 12.5, color: t.text }}>{group.members == null ? "—" : formatNumber(group.members)}</Text>
      <Text style={{ flex: 0.8, fontFamily: FONTS.regular, fontSize: 12.5, color: t.text }}>{formatNumber(group.messagesThisWeek)}</Text>
      <View style={{ flex: 0.9 }}>
        <Pill label={KIND[group.kind]} tone="blue" />
      </View>
      <View style={{ flex: 1 }}>
        <HealthPill group={group} />
      </View>
    </Pressable>
  );
}

function GroupPanel({ groupId, onChanged }: { groupId: string; onChanged: () => void }) {
  const t = useAdminTheme();
  const [data, setData] = useState<GroupDetail | null>(null);
  const [error, setError] = useState("");
  const [approval, setApproval] = useState(false);
  const [membersAdd, setMembersAdd] = useState(false);
  const [listVisible, setListVisible] = useState(true);
  const [archiving, setArchiving] = useState(false);
  const [contacting, setContacting] = useState(false);
  const [message, setMessage] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState("");

  const load = useCallback(async () => {
    try {
      const next = await getGroup(groupId);
      setData(next);
      setApproval(next.group.settings.joinMode === "approval");
      setMembersAdd(next.group.settings.whoCanAdd === "members");
      setListVisible(next.group.settings.memberListVisibility === "members");
      setError("");
    } catch (e: any) {
      setError(e?.message || "Couldn't load this group.");
    }
  }, [groupId]);

  useEffect(() => {
    setData(null);
    setArchiving(false);
    setContacting(false);
    setReason("");
    setDone("");
    load();
  }, [load]);

  if (error) return <Notice tone="red" text={error} />;
  if (!data) return <Loading label="Loading the group…" />;
  const { group, admins, requests } = data;
  const s = group.settings;
  const changed =
    approval !== (s.joinMode === "approval") || membersAdd !== (s.whoCanAdd === "members") || listVisible !== (s.memberListVisibility === "members");

  const run = async (key: string, work: () => Promise<{ auditEvent?: string | null }>, message: string) => {
    setBusy(key);
    try {
      const result = await work();
      setDone(`${message}${result.auditEvent ? ` Recorded as ${result.auditEvent}.` : ""}`);
      setArchiving(false);
      setReason("");
      await load();
      onChanged();
    } catch (e: any) {
      setError(e?.message || "Couldn't do that.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: FONTS.medium, fontSize: 16, color: t.text }}>Group management</Text>
          <Text style={{ marginTop: 3, fontFamily: FONTS.regular, fontSize: 12.5, color: t.muted }}>Selected group</Text>
        </View>
        {!group.archived ? <Button label="Manage chat ↗" onPress={() => router.navigate({ pathname: "/admin/chats", params: { conversation: group.id } } as any)} /> : null}
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", gap: 14, marginTop: 16 }}>
        <Initials name={group.name} size={52} tone="blue" />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontFamily: FONTS.medium, fontSize: 18, color: t.text }} numberOfLines={1}>
            {group.name}
          </Text>
          <Text style={{ marginTop: 2, fontFamily: FONTS.regular, fontSize: 12, color: t.muted }}>
            {group.scope === "regional" ? "Regional" : "Local"} · Created {new Date(group.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </Text>
        </View>
      </View>
      {group.description ? <Text style={{ marginTop: 12, fontFamily: FONTS.regular, fontSize: 13, lineHeight: 19, color: t.muted }}>{group.description}</Text> : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
        <Pill label={group.archived ? "Archived" : "Active"} tone={group.archived ? "grey" : "green"} />
        <Pill label={KIND[group.kind]} tone="blue" />
        {group.openReports ? <Pill label={`${group.openReports} open report${group.openReports === 1 ? "" : "s"}`} tone="amber" /> : null}
        {group.bans ? <Pill label={`${group.bans} banned`} tone="red" /> : null}
      </View>

      <View style={{ marginTop: 12 }}>
        <Field label="Members">{group.members == null ? "—" : `${formatNumber(group.members)} · +${group.newMembersThisWeek} this week`}</Field>
        <Field label="Weekly activity">{`${formatNumber(group.messagesThisWeek)} messages`}</Field>
      </View>

      <Divider />
      {group.owner ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Initials name={group.owner.name} size={34} />
          <View>
            <Text style={{ fontFamily: FONTS.medium, fontSize: 13, color: t.text }}>{group.owner.name}</Text>
            <Text style={{ marginTop: 2, fontFamily: FONTS.regular, fontSize: 11.5, color: t.muted }}>Group owner · @{group.owner.username || "member"}</Text>
          </View>
        </View>
      ) : null}
      {group.owner && !group.archived ? (
        contacting ? (
          <View style={{ marginTop: 12 }}>
            <ReasonBox label="Message to the owner" value={message} onChange={setMessage} placeholder="e.g. Two reports in your group need attention; please remind members of the guidelines." />
            <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
              <Button
                label="Send message"
                variant="primary"
                loading={busy === "contact"}
                disabled={message.trim().length < 3}
                onPress={() =>
                  run("contact", async () => {
                    const result = await contactOwner(group.id, message.trim());
                    setMessage("");
                    setContacting(false);
                    return result;
                  }, `Message sent to ${group.owner!.name}.`)
                }
              />
              <Button label="Cancel" onPress={() => setContacting(false)} />
            </View>
            <Text style={{ marginTop: 8, fontFamily: FONTS.regular, fontSize: 11.5, color: t.muted }}>They get it in CosQuest as a notice from “CosQuest admins”.</Text>
          </View>
        ) : (
          <View style={{ flexDirection: "row", marginTop: 12 }}>
            <Button label="Contact owner" icon="mail-outline" onPress={() => { setContacting(true); setDone(""); }} />
          </View>
        )
      ) : null}
      {admins.filter((a) => a.role === "admin").length ? (
        <Text style={{ marginTop: 10, fontFamily: FONTS.regular, fontSize: 12, color: t.muted }}>
          Group admins: {admins.filter((a) => a.role === "admin").map((a) => a.name).join(", ")}
        </Text>
      ) : null}

      {!group.archived ? (
        <>
          <Divider />
          <Text style={{ fontFamily: FONTS.medium, fontSize: 14, color: t.text }}>Joining & privacy</Text>
          <Field label="Visibility">{group.kind === "private" ? "Private · invite only" : group.kind === "faction" ? "Faction · its faction joins automatically" : "Open · anyone can find it"}</Field>
          <Toggle value={approval} onChange={setApproval} label="Approve join requests" hint="Admins review new members before they join." />
          <Toggle value={membersAdd} onChange={setMembersAdd} label="Members can add people" hint="Off: only the group's admins can add people." />
          <Toggle value={listVisible} onChange={setListVisible} label="Everyone sees the member list" hint="Off: only the group's admins see it." />
          {changed ? (
            <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
              <Button
                label="Save group settings"
                variant="primary"
                loading={busy === "settings"}
                onPress={() =>
                  run(
                    "settings",
                    () =>
                      updateGroupSettings(group.id, {
                        joinMode: approval ? "approval" : "instant",
                        whoCanAdd: membersAdd ? "members" : "admins",
                        memberListVisibility: listVisible ? "members" : "admins",
                      }),
                    "Group settings saved.",
                  )
                }
              />
              <Button label="Undo" onPress={() => { setApproval(s.joinMode === "approval"); setMembersAdd(s.whoCanAdd === "members"); setListVisible(s.memberListVisibility === "members"); }} />
            </View>
          ) : null}

          <Divider />
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text style={{ flex: 1, fontFamily: FONTS.medium, fontSize: 14, color: t.text }}>Pending join requests</Text>
            {requests.length ? <Pill label={String(requests.length)} /> : null}
          </View>
          {requests.length ? (
            requests.slice(0, 6).map((r) => (
              <View key={r.id} style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 12 }}>
                <Initials name={r.user?.name} size={32} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontFamily: FONTS.medium, fontSize: 12.5, color: t.text }} numberOfLines={1}>
                    {r.user?.name || "Member"}
                  </Text>
                  <Text style={{ marginTop: 2, fontFamily: FONTS.regular, fontSize: 11.5, color: t.muted }} numberOfLines={1}>
                    {r.message || (r.via === "link" ? "Asked via the invite link" : "Asked to join")} · {timeAgo(r.createdAt)}
                  </Text>
                </View>
                <Button label="Approve" variant="primary" loading={busy === `a${r.id}`} onPress={() => run(`a${r.id}`, () => decideJoinRequest(group.id, r.id, "approve"), `${r.user?.name || "They"} joined.`)} />
                <Button label="Decline" loading={busy === `d${r.id}`} onPress={() => run(`d${r.id}`, () => decideJoinRequest(group.id, r.id, "decline"), "Request declined.")} />
              </View>
            ))
          ) : (
            <Text style={{ marginTop: 8, fontFamily: FONTS.regular, fontSize: 12.5, color: t.muted }}>No requests waiting.</Text>
          )}

          <Divider />
          <Text style={{ fontFamily: FONTS.medium, fontSize: 14, color: t.text }}>Safety & conversation</Text>
          <Field label="Slow mode">{`${SLOW[s.slowModeSeconds] || `${s.slowModeSeconds} sec`} · manage in Chats`}</Field>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 6 }}>
            {group.openReports ? <Button label={`Review ${group.openReports} report${group.openReports === 1 ? "" : "s"}`} onPress={() => router.navigate("/admin/moderation" as any)} /> : null}
            <Button label="Manage chat" onPress={() => router.navigate({ pathname: "/admin/chats", params: { conversation: group.id } } as any)} />
          </View>
        </>
      ) : null}

      <Divider />
      {!archiving ? (
        <View style={{ flexDirection: "row" }}>
          <Button label={group.archived ? "Restore group…" : "Archive group…"} icon={group.archived ? "refresh-outline" : "archive-outline"} onPress={() => { setArchiving(true); setDone(""); }} />
        </View>
      ) : (
        <>
          <ReasonBox value={reason} onChange={setReason} placeholder={group.archived ? "Why the group can come back." : "Why the group is being closed."} />
          <ConfirmBox
            title={group.archived ? `Restore ${group.name}?` : `Archive ${group.name}?`}
            text={
              group.archived
                ? "Members see the group in their chats again, with its history."
                : "The group disappears for all its members (the history is kept). You can restore it later."
            }
            confirmLabel={group.archived ? "Confirm restore" : "Confirm archive"}
            onConfirm={() => run("archive", () => setGroupArchived(group.id, !group.archived, reason.trim()), group.archived ? "Group restored." : "Group archived.")}
            onCancel={() => setArchiving(false)}
            busy={busy === "archive"}
            disabled={reason.trim().length < 3}
          />
        </>
      )}
      {done ? <DoneNote text={done} /> : null}
    </View>
  );
}

function CreateGroup({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const t = useAdminTheme();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<"open" | "private">("open");
  const [approval, setApproval] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const input = {
    height: 42,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: t.border,
    backgroundColor: t.card,
    fontFamily: FONTS.regular,
    fontSize: 13,
    color: t.text,
    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null),
  };
  const create = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await createGroup({ name: name.trim(), description: description.trim(), kind, joinMode: approval ? "approval" : "instant" });
      onCreated(result.group.id);
    } catch (e: any) {
      setError(e?.message || "Couldn't create the group.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card style={{ marginBottom: 20 }}>
      <CardHeader title="Create group" subtitle="You'll be its owner; you can add admins from the app" />
      <Text style={{ marginBottom: 8, fontFamily: FONTS.medium, fontSize: 12.5, color: t.text }}>Name</Text>
      <TextInput value={name} onChangeText={setName} maxLength={80} placeholder="e.g. CosQuest Announcements" placeholderTextColor={t.faint} style={input} />
      <ReasonBox label="Description · optional" value={description} onChange={setDescription} placeholder="What the group is for." />
      <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
        {(["open", "private"] as const).map((k) => (
          <Pressable key={k} onPress={() => setKind(k)} style={{ flex: 1, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: kind === k ? t.pink : t.border, backgroundColor: kind === k ? t.pinkSoft : t.card }}>
            <Text style={{ fontFamily: FONTS.medium, fontSize: 13, color: t.text }}>{k === "open" ? "Open" : "Private"}</Text>
            <Text style={{ marginTop: 2, fontFamily: FONTS.regular, fontSize: 11.5, color: t.muted }}>{k === "open" ? "Anyone can find it" : "Invite only"}</Text>
          </Pressable>
        ))}
      </View>
      <Toggle value={approval} onChange={setApproval} label="Approve join requests" hint="New members wait for an admin before joining." />
      <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
        <Button label="Create group" variant="primary" onPress={create} loading={busy} disabled={name.trim().length < 2} />
        <Button label="Cancel" onPress={onClose} />
      </View>
      {error ? <Text style={{ marginTop: 10, fontFamily: FONTS.regular, fontSize: 12.5, color: t.red }}>{error}</Text> : null}
    </Card>
  );
}

export default function AdminGroups() {
  const t = useAdminTheme();
  const { width } = useWindowDimensions();
  const wide = width >= 1200;
  const params = useLocalSearchParams<{ group?: string }>();
  const [stats, setStats] = useState<Awaited<ReturnType<typeof getGroupStats>> | null>(null);
  const [tab, setTab] = useState<Tab>("all");
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("all");
  const [offset, setOffset] = useState(0);
  const [rows, setRows] = useState<GroupRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(typeof params.group === "string" ? params.group : null);
  const [creating, setCreating] = useState(false);
  // Opened from the top bar search or the bell: show that group.
  useEffect(() => {
    if (typeof params.group === "string") setSelected(params.group);
  }, [params.group]);

  const loadStats = useCallback(async () => {
    try {
      setStats(await getGroupStats());
    } catch {}
  }, []);

  const loadList = useCallback(async () => {
    try {
      const result = await listGroups({ tab, q: q.trim() || undefined, kind: kind === "all" ? undefined : kind, offset });
      setRows(result.groups);
      setTotal(result.total);
      setError("");
      setSelected((current) => current || result.groups[0]?.id || null);
    } catch (e: any) {
      setError(e?.code === "not_deployed" ? "The Groups backend (Phase 3) isn't deployed yet." : e?.message || "Couldn't load groups.");
    }
  }, [tab, q, kind, offset]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);
  useEffect(() => {
    const timer = setTimeout(loadList, q ? 300 : 0);
    return () => clearTimeout(timer);
  }, [loadList, q]);

  return (
    <View>
      <PageHeader
        title="Groups"
        subtitle="Support healthy communities, manage joining and keep group owners connected."
        right={
          <>
            <Button label="Export groups" icon="download-outline" onPress={() => downloadCsv("/groups/export", { tab, q: q.trim() || undefined, kind: kind === "all" ? undefined : kind }).catch(() => {})} />
            <Button label="Create group" icon="add" variant="primary" onPress={() => setCreating(true)} />
          </>
        }
      />
      {creating ? (
        <CreateGroup
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            setTab("all");
            setSelected(id);
            loadStats();
            loadList();
          }}
        />
      ) : null}

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 20 }}>
        <StatCard title="Total groups" icon="albums-outline" value={formatNumber(stats?.total)} footer={<Text style={{ fontFamily: FONTS.regular, fontSize: 12, color: t.muted }}>Across the CosQuest community</Text>} />
        <StatCard
          title="Active groups"
          icon="pulse-outline"
          value={formatNumber(stats?.active)}
          footer={<Text style={{ fontFamily: FONTS.medium, fontSize: 12, color: t.green }}>↑ {formatNumber(stats?.newGroups)} new this week</Text>}
        />
        <StatCard
          title="Join requests"
          icon="person-add-outline"
          value={formatNumber(stats?.joinRequests)}
          footer={<Text style={{ fontFamily: FONTS.regular, fontSize: 12, color: t.amber }}>Across {formatNumber(stats?.approvalGroups)} approval-based groups</Text>}
        />
        <StatCard title="Groups with reports" icon="flag-outline" value={formatNumber(stats?.withReports)} footer={<Text style={{ fontFamily: FONTS.regular, fontSize: 12, color: t.amber }}>Open reports across group content</Text>} />
      </View>

      <View style={{ flexDirection: wide ? "row" : "column", gap: 20, marginTop: 20, alignItems: "flex-start" }}>
        <Card style={{ flex: 1.55, alignSelf: "stretch" }}>
          <CardHeader title="Group directory" subtitle="Activity for the last 7 days" right={stats ? <Pill label={`${formatNumber(stats.total)} groups`} tone="blue" /> : undefined} />
          <Tabs<Tab>
            value={tab}
            onChange={(key) => {
              setTab(key);
              setOffset(0);
              setSelected(null);
            }}
            tabs={[
              { key: "all", label: "All groups", count: stats?.total },
              { key: "active", label: "Active", count: stats?.active },
              { key: "attention", label: "Needs attention", count: stats?.withReports },
              { key: "archived", label: "Archived" },
            ]}
          />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 12, zIndex: 20 }}>
            <SearchBox value={q} onChange={(text) => { setQ(text); setOffset(0); }} placeholder="Search groups or @owners…" />
            <Select value={kind} onChange={(v) => { setKind(v); setOffset(0); }} options={[{ value: "all", label: "All kinds" }, { value: "open", label: "Open" }, { value: "private", label: "Private" }, { value: "faction", label: "Faction" }]} />
          </View>
          <View style={{ flexDirection: "row", paddingVertical: 10, paddingHorizontal: 10, borderRadius: 8, backgroundColor: t.cardSoft }}>
            {["GROUP / OWNER", "MEMBERS", "MESSAGES", "PRIVACY", "HEALTH"].map((label, i) => (
              <Text key={label} style={{ flex: [2.8, 0.8, 0.8, 0.9, 1][i], fontFamily: FONTS.medium, fontSize: 10.5, letterSpacing: 0.5, color: t.faint }}>
                {label}
              </Text>
            ))}
          </View>
          {error ? (
            <View style={{ marginTop: 12 }}>
              <Notice tone="amber" text={error} />
            </View>
          ) : !rows ? (
            <Loading label="Loading groups…" />
          ) : rows.length ? (
            rows.map((group) => <GroupItem key={group.id} group={group} selected={group.id === selected} onPress={() => setSelected(group.id)} />)
          ) : (
            <Text style={{ paddingVertical: 40, textAlign: "center", fontFamily: FONTS.regular, fontSize: 13, color: t.muted }}>{tab === "archived" ? "No archived groups." : "No groups match."}</Text>
          )}
          {rows ? <Pager shown={rows.length} total={total} offset={offset} onPage={setOffset} noun="groups" /> : null}
          <View style={{ marginTop: 16 }}>
            <Notice text="Health reflects activity and reported content, not faction standing. Quiet = no messages in the last 7 days." />
          </View>
        </Card>

        <Card style={{ flex: 1, alignSelf: "stretch" }}>
          {selected ? (
            <GroupPanel groupId={selected} onChanged={() => { loadStats(); loadList(); }} />
          ) : (
            <Text style={{ paddingVertical: 60, textAlign: "center", fontFamily: FONTS.regular, fontSize: 13, color: t.muted }}>Pick a group to manage it.</Text>
          )}
        </Card>
      </View>
    </View>
  );
}
