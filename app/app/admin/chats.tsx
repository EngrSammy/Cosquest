// ==========================================
// SUPER ADMIN DASHBOARD - Chats (Figma "Chats")
// ==========================================
// Group conversations (and the Community / faction rooms) in context: the
// messages around a reported one, deleting a message, slow mode, and acting
// on a message's author (mute, remove, ban) - always with a reason and a
// confirmation. Direct messages are private and never listed here.
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View, useWindowDimensions } from "react-native";

import { ConfirmBox, Divider, DoneNote, Field, ReasonBox, SearchBox, Select, Toggle } from "@/components/admin/controls";
import { useAdminTheme } from "@/components/admin/theme";
import { Button, Card, CardHeader, Initials, Loading, Notice, PageHeader, Pill, StatCard, formatNumber, timeAgo } from "@/components/admin/ui";
import { FONTS } from "@/constants/fonts";
import {
  type AdminConversation,
  type AdminMessage,
  REASON_LABELS,
  deleteMessage,
  getChatStats,
  getMessages,
  listConversations,
  memberAction,
  setSlowMode,
} from "@/services/adminContent";

const SLOW = [
  { value: "0", label: "Off" },
  { value: "10", label: "10 sec" },
  { value: "30", label: "30 sec" },
  { value: "60", label: "1 min" },
  { value: "300", label: "5 min" },
  { value: "3600", label: "1 hour" },
];
const DURATIONS = [
  { value: "1h", label: "1 hour" },
  { value: "1d", label: "1 day" },
  { value: "1w", label: "1 week" },
  { value: "forever", label: "Until unmuted" },
];
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });

type Thread = Awaited<ReturnType<typeof getMessages>>;
type MemberAct = "mute" | "remove" | "ban";

function ConversationItem({ item, selected, onPress }: { item: AdminConversation; selected: boolean; onPress: () => void }) {
  const t = useAdminTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ hovered }: any) => ({ flexDirection: "row", gap: 12, padding: 12, borderRadius: 12, marginBottom: 6, backgroundColor: selected ? t.pinkSoft : hovered ? t.cardSoft : "transparent" })}>
      <Initials name={item.name} size={32} tone={item.type === "group" ? "pink" : "blue"} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontFamily: FONTS.medium, fontSize: 13, color: t.text }} numberOfLines={1}>
          {item.name}
        </Text>
        {item.lastMessage ? <Text style={{ marginTop: 1, fontFamily: FONTS.regular, fontSize: 11, color: t.faint }}>{timeAgo(item.lastMessage.at)}</Text> : null}
        <Text style={{ marginTop: 6, fontFamily: FONTS.regular, fontSize: 12, color: t.muted }} numberOfLines={1}>
          {item.lastMessage ? `${item.lastMessage.sender?.name?.split(" ")[0] || "Someone"}: ${item.lastMessage.text}` : "No messages yet"}
        </Text>
        <Text style={{ marginTop: 6, fontFamily: FONTS.regular, fontSize: 11, color: item.openReports ? t.amber : t.faint }}>
          {formatNumber(item.messagesThisWeek)} messages{item.openReports ? ` · ${item.openReports} report${item.openReports === 1 ? "" : "s"}` : item.slowModeSeconds ? ` · Slow mode ${item.slowModeSeconds}s` : " · No reports"}
        </Text>
      </View>
    </Pressable>
  );
}

function MessageItem({ message, selected, onPress }: { message: AdminMessage; selected: boolean; onPress: () => void }) {
  const t = useAdminTheme();
  const reported = Boolean(message.report);
  const name = message.sender?.name || "Member";
  return (
    <Pressable onPress={onPress} style={{ flexDirection: "row", gap: 12, paddingVertical: 10 }}>
      <Initials name={name} size={30} />
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text style={{ flex: 1, fontFamily: FONTS.medium, fontSize: 12.5, color: t.text }} numberOfLines={1}>
            {name}
            {message.role === "owner" ? " · Owner" : message.role === "admin" ? " · Admin" : message.sender?.username ? ` · @${message.sender.username}` : ""}
          </Text>
          <Text style={{ fontFamily: FONTS.regular, fontSize: 11, color: t.faint }}>{time(message.createdAt)}</Text>
        </View>
        <View
          style={{
            marginTop: 6,
            padding: 12,
            borderRadius: 10,
            borderWidth: selected ? 1.5 : 0,
            borderColor: t.pink,
            backgroundColor: reported ? t.amberSoft : t.cardSoft,
          }}>
          <Text style={{ fontFamily: message.deleted ? FONTS.regular : FONTS.regular, fontStyle: message.deleted ? "italic" : "normal", fontSize: 13, lineHeight: 19, color: message.deleted ? t.faint : t.text }}>
            {message.deleted ? (message.deletedByAdmin ? "Deleted by an admin" : "Deleted") : message.text || (message.media ? `[${message.kind}]` : "")}
          </Text>
          {message.report ? (
            <Text style={{ marginTop: 6, fontFamily: FONTS.regular, fontSize: 11.5, color: t.muted }}>
              <Text style={{ fontFamily: FONTS.medium, color: t.amber }}>Reported · {REASON_LABELS[message.report.reason] || message.report.reason}</Text>
              {`   ${message.report.number} · ${message.report.status === "in_review" ? "In review" : message.report.status === "new" ? "New" : "Decided"}`}
            </Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

export default function AdminChats() {
  const t = useAdminTheme();
  const { width } = useWindowDimensions();
  const wide = width >= 1280;
  const params = useLocalSearchParams<{ conversation?: string; message?: string }>();
  const [stats, setStats] = useState<Awaited<ReturnType<typeof getChatStats>> | null>(null);
  const [filter, setFilter] = useState<"all" | "reported">("all");
  const [q, setQ] = useState("");
  const [list, setList] = useState<AdminConversation[] | null>(null);
  const [listError, setListError] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(typeof params.conversation === "string" ? params.conversation : null);
  const [around, setAround] = useState<string | null>(typeof params.message === "string" ? params.message : null);
  const [thread, setThread] = useState<Thread | null>(null);
  const [threadError, setThreadError] = useState("");
  const [picked, setPicked] = useState<AdminMessage | null>(null);
  // Delete a message
  const [deleting, setDeleting] = useState(false);
  const [deleteReason, setDeleteReason] = useState("");
  const [notify, setNotify] = useState(true);
  // Slow mode
  const [slow, setSlow] = useState("0");
  // Member action
  const [act, setAct] = useState<MemberAct | null>(null);
  const [actReason, setActReason] = useState("");
  const [duration, setDuration] = useState("1h");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState("");
  const [actionError, setActionError] = useState("");

  const loadStats = useCallback(async () => {
    try {
      setStats(await getChatStats());
    } catch {}
  }, []);

  const loadList = useCallback(async () => {
    try {
      const result = await listConversations({ filter, q: q.trim() || undefined });
      setList(result.conversations);
      setListError("");
      setConversationId((current) => current || result.conversations[0]?.id || null);
    } catch (e: any) {
      setListError(e?.code === "not_deployed" ? "The Chats backend (Phase 2) isn't deployed yet." : e?.message || "Couldn't load conversations.");
    }
  }, [filter, q]);

  const loadThread = useCallback(async () => {
    if (!conversationId) return;
    try {
      const next = await getMessages(conversationId, around);
      setThread(next);
      setSlow(String(next.conversation.slowModeSeconds || 0));
      setThreadError("");
      setPicked((current) => next.messages.find((m) => m.id === (current?.id || around)) || null);
    } catch (e: any) {
      setThreadError(e?.message || "Couldn't load this conversation.");
    }
  }, [conversationId, around]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);
  useEffect(() => {
    const timer = setTimeout(loadList, q ? 300 : 0);
    return () => clearTimeout(timer);
  }, [loadList, q]);
  useEffect(() => {
    setThread(null);
    setDeleting(false);
    setAct(null);
    setDone("");
    loadThread();
  }, [loadThread]);

  const isGroup = thread?.conversation.type === "group";
  const author = picked?.sender || null;

  const run = async (work: () => Promise<{ auditEvent?: string | null } | any>, message: string) => {
    setBusy(true);
    setActionError("");
    try {
      const result = await work();
      setDone(`${message}${result?.auditEvent ? ` Recorded as ${result.auditEvent}.` : ""}`);
      setDeleting(false);
      setAct(null);
      setDeleteReason("");
      setActReason("");
      await Promise.all([loadThread(), loadList(), loadStats()]);
    } catch (e: any) {
      setActionError(e?.message || "Couldn't do that.");
    } finally {
      setBusy(false);
    }
  };

  const conversationColumn = (
    <Card style={{ width: wide ? 320 : undefined, alignSelf: "stretch" }}>
      <CardHeader title="Conversations" subtitle="Weekly activity · latest message" />
      <SearchBox value={q} onChange={setQ} placeholder="Search conversations…" />
      <View style={{ flexDirection: "row", gap: 8, marginVertical: 12 }}>
        {(["all", "reported"] as const).map((key) => (
          <Pressable key={key} onPress={() => setFilter(key)} style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, backgroundColor: filter === key ? t.pinkSoft : t.cardSoft }}>
            <Text style={{ fontFamily: FONTS.medium, fontSize: 11.5, color: filter === key ? t.pinkText : t.muted }}>{key === "all" ? "All" : "Reported"}</Text>
          </Pressable>
        ))}
      </View>
      {listError ? (
        <Notice tone="amber" text={listError} />
      ) : !list ? (
        <Loading />
      ) : list.length ? (
        list.map((item) => (
          <ConversationItem
            key={item.id}
            item={item}
            selected={item.id === conversationId}
            onPress={() => {
              setAround(null);
              setPicked(null);
              setConversationId(item.id);
            }}
          />
        ))
      ) : (
        <Text style={{ paddingVertical: 24, textAlign: "center", fontFamily: FONTS.regular, fontSize: 12.5, color: t.muted }}>{filter === "reported" ? "No reported conversations." : "No conversations match."}</Text>
      )}
    </Card>
  );

  const threadColumn = (
    <View style={{ flex: 1.3, gap: 20, alignSelf: "stretch" }}>
      <Card>
        {threadError ? (
          <Notice tone="red" text={threadError} />
        ) : !thread ? (
          <Loading label="Loading messages…" />
        ) : (
          <>
            <CardHeader
              title={thread.conversation.name}
              subtitle={`${thread.conversation.type === "group" ? `${thread.conversation.kind === "private" ? "Private" : thread.conversation.kind === "faction" ? "Faction" : "Open"} group` : thread.conversation.type === "community" ? "Community room" : "Faction room"}`}
            />
            {(() => {
              const reports = thread.messages.filter((m) => m.report && (m.report.status === "new" || m.report.status === "in_review")).length;
              return reports || thread.conversation.slowModeSeconds ? (
                <View style={{ flexDirection: "row", gap: 8, marginTop: -6, marginBottom: 10 }}>
                  {reports ? <Pill label={`${reports} open report${reports === 1 ? "" : "s"}`} tone="amber" /> : null}
                  {thread.conversation.slowModeSeconds ? <Pill label={`Slow mode ${thread.conversation.slowModeSeconds}s`} tone="blue" /> : null}
                  <Pill label="Review mode" tone="blue" />
                </View>
              ) : null;
            })()}
            {thread.messages.length ? (
              thread.messages.map((m) => <MessageItem key={m.id} message={m} selected={picked?.id === m.id} onPress={() => { setPicked(m); setDeleting(false); setAct(null); setDone(""); }} />)
            ) : (
              <Text style={{ paddingVertical: 30, textAlign: "center", fontFamily: FONTS.regular, fontSize: 12.5, color: t.muted }}>No messages yet.</Text>
            )}
            <Text style={{ marginTop: 10, paddingTop: 12, borderTopWidth: 1, borderTopColor: t.line, fontFamily: FONTS.regular, fontSize: 11.5, color: t.muted }}>
              {around ? "Messages around the reported one are shown for context. " : "The latest messages are shown. "}Tap a message to act on it or its author.
            </Text>
          </>
        )}
      </Card>

      {picked && !picked.deleted ? (
        <Card>
          <Text style={{ fontFamily: FONTS.medium, fontSize: 15, color: t.text }}>Delete this message</Text>
          <Text style={{ marginTop: 3, fontFamily: FONTS.regular, fontSize: 12, color: t.muted }}>
            {picked.sender?.name || "Member"} · Message sent at {time(picked.createdAt)}
          </Text>
          {!deleting ? (
            <View style={{ flexDirection: "row", marginTop: 12 }}>
              <Button label="Delete message…" icon="trash-outline" onPress={() => setDeleting(true)} />
            </View>
          ) : (
            <>
              <ReasonBox value={deleteReason} onChange={setDeleteReason} placeholder="e.g. Targeted personal remarks break our respectful-conversation guideline." />
              <Toggle value={notify} onChange={setNotify} label="Notify the author" hint="They receive this reason in CosQuest." />
              <ConfirmBox
                title="Confirm message deletion"
                text={`Members will see “deleted by an admin”.${picked.report ? ` Evidence stays attached to ${picked.report.number}, which is resolved.` : " The text is kept in the audit log."}`}
                confirmLabel="Confirm delete"
                onConfirm={() => run(() => deleteMessage(picked.id, deleteReason.trim(), notify), "Message deleted.")}
                onCancel={() => setDeleting(false)}
                busy={busy}
                disabled={deleteReason.trim().length < 3}
              />
            </>
          )}
        </Card>
      ) : null}
    </View>
  );

  const safetyColumn = (
    <View style={{ flex: 1, gap: 20, alignSelf: "stretch" }}>
      <Card>
        <CardHeader title={isGroup ? "Group safety" : "Room safety"} subtitle={thread?.conversation.name} />
        {isGroup ? (
          <>
            <Text style={{ fontFamily: FONTS.medium, fontSize: 13, color: t.text }}>Posting controls</Text>
            <Text style={{ marginTop: 10, marginBottom: 8, fontFamily: FONTS.medium, fontSize: 12.5, color: t.text }}>Slow mode · message interval</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, zIndex: 20 }}>
              <Select value={slow} onChange={setSlow} options={SLOW} minWidth={150} />
              <Button
                label="Save"
                variant="primary"
                disabled={!thread || String(thread.conversation.slowModeSeconds || 0) === slow}
                loading={busy && !act && !deleting}
                onPress={() => run(() => setSlowMode(thread!.conversation.id, Number(slow)), Number(slow) ? `Slow mode set to ${SLOW.find((s) => s.value === slow)?.label}.` : "Slow mode turned off.")}
              />
            </View>
            <Text style={{ marginTop: 8, fontFamily: FONTS.regular, fontSize: 11.5, color: t.muted }}>Members can send one message per interval. Admins aren't limited.</Text>
          </>
        ) : (
          <Notice text="Slow mode and member actions are for groups. Community and faction room restrictions come with the Members page." />
        )}
      </Card>

      <Card>
        <CardHeader title="Selected member" subtitle="Message author · group-scoped actions" />
        {!author ? (
          <Text style={{ fontFamily: FONTS.regular, fontSize: 12.5, color: t.muted }}>Tap a message to see its author here.</Text>
        ) : (
          <>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Initials name={author.name} size={36} />
              <View>
                <Text style={{ fontFamily: FONTS.medium, fontSize: 13.5, color: t.text }}>{author.name}</Text>
                <Text style={{ marginTop: 2, fontFamily: FONTS.regular, fontSize: 11.5, color: t.muted }}>
                  @{author.username || "member"} · {picked?.role === "owner" ? "Group owner" : picked?.role === "admin" ? "Group admin" : "Member"}
                </Text>
              </View>
            </View>
            {isGroup ? (
              <>
                <Divider />
                {!act ? (
                  <View style={{ gap: 12 }}>
                    {(
                      [
                        { key: "mute", label: "Mute member…", hint: "Choose a duration and reason, then confirm. Muted members can still read." },
                        { key: "remove", label: "Remove from group…", hint: "Ends this group membership after confirmation." },
                        { key: "ban", label: "Ban from group…", hint: "Prevents rejoining. Requires a reason and explicit confirmation." },
                      ] as { key: MemberAct; label: string; hint: string }[]
                    ).map((item) => (
                      <View key={item.key}>
                        <View style={{ flexDirection: "row" }}>
                          <Button label={item.label} onPress={() => { setAct(item.key); setDone(""); }} />
                        </View>
                        <Text style={{ marginTop: 6, fontFamily: FONTS.regular, fontSize: 11.5, color: t.muted }}>{item.hint}</Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <>
                    {act === "mute" ? (
                      <View style={{ zIndex: 20 }}>
                        <Text style={{ marginBottom: 8, fontFamily: FONTS.medium, fontSize: 12.5, color: t.text }}>Mute duration</Text>
                        <Select value={duration} onChange={setDuration} options={DURATIONS} minWidth={160} />
                      </View>
                    ) : null}
                    <ReasonBox value={actReason} onChange={setActReason} placeholder="Why, in a sentence the member will understand." />
                    <ConfirmBox
                      title={act === "mute" ? `Confirm mute for ${author.name}?` : act === "remove" ? `Remove ${author.name} from ${thread?.conversation.name}?` : `Ban ${author.name} from ${thread?.conversation.name}?`}
                      text={
                        act === "mute"
                          ? `They can still read ${thread?.conversation.name}, but can't post for ${DURATIONS.find((d) => d.value === duration)?.label.toLowerCase()}. Other groups are unaffected.`
                          : act === "remove"
                            ? "They leave this group and can come back if invited. Other groups are unaffected."
                            : "They leave this group and can't rejoin until unbanned. Other groups are unaffected."
                      }
                      confirmLabel={act === "mute" ? "Confirm mute" : act === "remove" ? "Confirm removal" : "Confirm ban"}
                      onConfirm={() =>
                        run(
                          () => memberAction(thread!.conversation.id, author.id, act, { reason: actReason.trim(), ...(act === "mute" ? { duration } : {}) }),
                          act === "mute" ? `${author.name} is muted.` : act === "remove" ? `${author.name} was removed.` : `${author.name} is banned from this group.`,
                        )
                      }
                      onCancel={() => setAct(null)}
                      busy={busy}
                      disabled={actReason.trim().length < 3}
                    />
                  </>
                )}
              </>
            ) : null}
          </>
        )}
        {actionError ? <View style={{ marginTop: 12 }}><Notice tone="red" text={actionError} /></View> : null}
        {done ? <DoneNote text={done} /> : null}
      </Card>
    </View>
  );

  return (
    <View>
      <PageHeader title="Chats" subtitle="Review group conversations in context and manage member safety without losing the thread." />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 20 }}>
        <StatCard title="Chat messages" icon="chatbubbles-outline" value={formatNumber(stats?.messages)} footer={<Text style={{ fontFamily: FONTS.regular, fontSize: 12, color: t.muted }}>Across the community · last 7 days</Text>} />
        <StatCard title="Active group conversations" icon="albums-outline" value={formatNumber(stats?.activeGroups)} footer={<Text style={{ fontFamily: FONTS.regular, fontSize: 12, color: t.muted }}>Of {formatNumber(stats?.totalGroups)} total groups</Text>} />
        <StatCard title="Open chat reports" icon="flag-outline" value={formatNumber(stats?.openReports)} footer={<Text style={{ fontFamily: FONTS.regular, fontSize: 12, color: t.amber }}>Review with surrounding messages</Text>} />
        <StatCard title="Slow mode enabled" icon="timer-outline" value={formatNumber(stats?.slowMode)} footer={<Text style={{ fontFamily: FONTS.regular, fontSize: 12, color: t.muted }}>Groups with a message interval</Text>} />
      </View>
      <View style={{ flexDirection: wide ? "row" : "column", gap: 20, marginTop: 20, alignItems: "flex-start" }}>
        {conversationColumn}
        {conversationId ? (
          <>
            {threadColumn}
            {safetyColumn}
          </>
        ) : (
          <Card style={{ flex: 1 }}>
            <View style={{ paddingVertical: 60, alignItems: "center", gap: 6 }}>
              <Ionicons name="chatbubbles-outline" size={26} color={t.faint} />
              <Text style={{ fontFamily: FONTS.regular, fontSize: 13, color: t.muted }}>Pick a conversation.</Text>
            </View>
          </Card>
        )}
      </View>
      <View style={{ marginTop: 16 }}>
        <Field label="Privacy">Direct messages are private and never listed here. A reported direct message is reviewed from its report only.</Field>
      </View>
    </View>
  );
}
