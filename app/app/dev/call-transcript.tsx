// ==========================================
// DEV ONLY: call transcripts and notes from mock data
// ==========================================
// Development builds only (production redirects home). Open
//   /dev/call-transcript                  the list of previews
//   /dev/call-transcript?view=merged      live transcript, two people in, one without Sparks, one opted out
//   /dev/call-transcript?view=ended       a finished call, everyone in
//   /dev/call-transcript?view=banners     every "who's in this transcript" message
//   /dev/call-transcript?view=empty       nobody had Sparks on
//   /dev/call-transcript?view=error&code=501
//   /dev/call-transcript?view=panel       the in-call Sparks panel with its transcript row (panel-all-in: no row)
//   /dev/call-transcript?view=notes-quick | notes-model | notes-pending | notes-pending-quick | notes-none
// Real components, fed mock data instead of the network.
import { Redirect, router, useLocalSearchParams, type Href } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import CallNotesSheet from "@/components/calls/CallNotesSheet";
import CallTranscriptView from "@/components/calls/CallTranscriptView";
import { CallBackground } from "@/components/calls/CallVisuals";
import SparksCallPanel from "@/components/calls/SparksCallPanel";
import TranscriptCoverage from "@/components/calls/TranscriptCoverage";
import { ScreenGradient } from "@/components/chat/ui";
import { FONTS } from "@/constants/fonts";
import type { CallOutlineReply, CallTranscriptPage, CallTranscriptSegment } from "@/services/callTranscript";
import type { TranscriptParticipant, TranscriptSpeakers } from "@/services/callTranscriptCopy";
import type { Call } from "@/services/calls";
import type { CallNotes } from "@/services/sparksCallNotes";

import type { CallOutline } from "@cosquest/sparks-sdk";

// ---------- mock data ----------

const ME = "u_amara";
const CALL_ID = "call_dev_1";

const SPEAKERS: TranscriptSpeakers = {
  u_amara: { id: "u_amara", username: "amara", name: "Amara Obi", avatarKey: "pink-idol", avatarPhotoUrl: null },
  u_ben: { id: "u_ben", username: "ben.c", name: "Ben Carter", avatarKey: "visor-ranger", avatarPhotoUrl: null },
  u_cy: { id: "u_cy", username: "cy", name: "Cy Mensah", avatarKey: "neon-racer", avatarPhotoUrl: null },
  u_eve: { id: "u_eve", username: "eve", name: "Eve Park", avatarKey: "pearl-princess", avatarPhotoUrl: null },
  u_dee: { id: "u_dee", username: "dee", name: "Dee Lawal", avatarKey: "goggle-scout", avatarPhotoUrl: null },
  u_fay: { id: "u_fay", username: "fay", name: "Fay Ndu", avatarKey: "adventurer", avatarPhotoUrl: null },
};

const MIXED: TranscriptParticipant[] = [
  { userId: "u_amara", displayName: "Amara Obi", lines: 6, status: "transcribed" },
  { userId: "u_ben", displayName: "Ben Carter", lines: 5, status: "transcribed" },
  { userId: "u_cy", displayName: "Cy Mensah", lines: 0, status: "no_sparks" },
  { userId: "u_eve", displayName: "Eve Park", lines: 0, status: "declined" },
];

const TOPICS = [
  { callId: CALL_ID, topicId: "tp_1", title: "Quest board", colorIndex: 0, startedAtMs: 4000, returning: false },
  { callId: CALL_ID, topicId: "tp_2", title: "Saturday raid", colorIndex: 1, startedAtMs: 61000, returning: false },
  { callId: CALL_ID, topicId: "tp_1", title: "Quest board", colorIndex: 0, startedAtMs: 140000, returning: true },
];

const LINES: [string, number, string | null, string][] = [
  ["u_amara", 2000, null, "Hi Ben, can you hear me all right?"],
  ["u_ben", 5000, "tp_1", "Loud and clear. Shall we start with the quest board?"],
  ["u_ben", 9500, "tp_1", "Three quests are still open from last week."],
  ["u_amara", 15000, "tp_1", "Let's close the map one, nobody has picked it up."],
  ["u_amara", 19000, "tp_1", "And move the photo quest to next month."],
  ["u_ben", 26000, "tp_1", "Agreed. I'll update the board tonight."],
  ["u_amara", 63000, "tp_2", "Now Saturday. Are we still meeting at ten?"],
  ["u_ben", 68000, "tp_2", "Ten works. Cy said they'd bring the speakers."],
  ["u_amara", 74000, "tp_2", "Great, I'll book the hall for three hours."],
  ["u_amara", 142000, "tp_1", "One more thing on the board: who owns the new quest?"],
  ["u_ben", 147000, "tp_1", "I can take it."],
];

function segment([userId, startMs, topicId, text]: (typeof LINES)[number], i: number): CallTranscriptSegment {
  return { segmentId: `seg_${i + 1}`, userId, startMs, endMs: startMs + 2500, text, locale: "en-GB", confidence: 0.9, topicId };
}
const SEGMENTS = LINES.map(segment);

function minutesAgo(n: number) {
  return new Date(Date.now() - n * 60_000).toISOString();
}

/** Two pages (the second via a cursor), like the server. */
function pagedLoader(base: Omit<CallTranscriptPage, "segments" | "nextCursor">, segments = SEGMENTS) {
  return async (cursor: string | null): Promise<CallTranscriptPage> => {
    await new Promise((resolve) => setTimeout(resolve, 150));
    const first = cursor === null;
    return {
      ...base,
      participants: first ? base.participants : undefined,
      segments: first ? segments.slice(0, 8) : segments.slice(8),
      nextCursor: first && segments.length > 8 ? "page_2" : null,
    };
  };
}

const BASE: Omit<CallTranscriptPage, "segments" | "nextCursor"> = {
  callId: CALL_ID,
  chatId: "chat_dev",
  kind: "call",
  status: "active",
  startedAt: minutesAgo(3),
  endedAt: null,
  topics: TOPICS,
  speakers: SPEAKERS,
  participants: MIXED,
};

const OUTLINE: CallOutline = {
  callId: CALL_ID,
  chatId: "chat_dev",
  title: "Quest board and Saturday raid",
  summary: "Amara and Ben tidied the quest board and planned Saturday's raid.",
  startedAt: "2026-10-23T14:05:00.000Z",
  endedAt: "2026-10-23T14:37:00.000Z",
  topics: [
    {
      topicId: "tp_1",
      title: "Quest board",
      colorIndex: 0,
      order: 0,
      summary: "Three quests were still open from last week.",
      points: ["Close the map quest: nobody picked it up.", "Move the photo quest to next month."],
      decisions: ["Ben updates the board tonight."],
      actionItems: [{ text: "Update the quest board", ownerUserId: "u_ben" }, { text: "Own the new quest", ownerUserId: "u_ben" }],
      spans: [{ startMs: 4000, endMs: 60000 }],
      speakerIds: ["u_amara", "u_ben"],
    },
    {
      topicId: "tp_2",
      title: "Saturday raid",
      colorIndex: 1,
      order: 1,
      summary: "Meeting at ten on Saturday.",
      points: ["Cy brings the speakers."],
      decisions: ["Meet at 10:00."],
      actionItems: [{ text: "Book the hall for three hours", ownerUserId: "u_amara" }],
      spans: [{ startMs: 61000, endMs: 139000 }],
      speakerIds: ["u_ben", "u_amara"],
    },
  ],
  segmentCount: SEGMENTS.length,
  generatedAt: "2026-10-23T14:39:00.000Z",
  generatedBy: { deviceIds: ["dev_1"], modelVersion: "mote-1.3" },
};

// Real output of @cosquest/sparks-backend 1.3.3 (sparks commit after 36256b7, branch call-transcript-notes) for LINES, no live topics.
const QUICK_OUTLINE: CallOutline = {
  callId: OUTLINE.callId,
  chatId: OUTLINE.chatId,
  startedAt: OUTLINE.startedAt,
  endedAt: OUTLINE.endedAt,
  segmentCount: OUTLINE.segmentCount,
  generatedAt: OUTLINE.generatedAt,
  generatedBy: { deviceIds: [], modelVersion: "server-extractive" },
  title: "Quests and Saturday",
  summary: "Amara and Ben talked about Quests and Saturday.",
  topics: [
    {
      topicId: "ot_1",
      title: "Quests",
      colorIndex: 0,
      order: 0,
      summary: "Ben: Three quests are still open from last week.",
      points: [
        "Amara: Move the photo quest to next month."
      ],
      decisions: [
        "Amara: Let's close the map one, nobody has picked it up."
      ],
      actionItems: [
        {
          text: "I'll update the board tonight.",
          ownerUserId: "u_ben"
        }
      ],
      spans: [
        {
          startMs: 2000,
          endMs: 28500
        }
      ],
      speakerIds: [
        "u_amara",
        "u_ben"
      ]
    },
    {
      topicId: "ot_2",
      title: "Saturday",
      colorIndex: 1,
      order: 1,
      summary: "Ben: Cy said they'd bring the speakers.",
      points: [],
      decisions: [
        "Amara: Are we still meeting at ten? Ben: Ten works."
      ],
      actionItems: [
        {
          text: "I'll book the hall for three hours.",
          ownerUserId: "u_amara"
        },
        {
          text: "Amara: One more thing on the board: who owns the new quest? Ben: I can take it.",
          ownerUserId: "u_ben"
        }
      ],
      spans: [
        {
          startMs: 63000,
          endMs: 149500
        }
      ],
      speakerIds: [
        "u_amara",
        "u_ben"
      ]
    }
  ],
};

const MOCK_CALL: Call = {
  id: CALL_ID,
  conversationId: "chat_dev",
  type: "audio",
  status: "accepted",
  caller: { id: "u_amara", name: "Amara Obi", username: "amara", avatarKey: "pink-idol" },
  isGroup: true,
  members: ["u_amara", "u_ben", "u_cy", "u_eve"].map((id) => ({
    user: { id, name: SPEAKERS[id]!.name, username: SPEAKERS[id]!.username },
    status: "joined" as const,
    invitedBy: null,
  })),
  maxParticipants: 50,
  maxInvitesPerRequest: 10,
};

const noop = () => {};
const MOCK_NOTES: CallNotes = {
  phase: "on",
  notice: null,
  paused: false,
  lines: [],
  topic: { title: "Saturday raid", colorIndex: 1 },
  sparks: [
    {
      key: "tp_1",
      title: "Quest board",
      colorIndex: 0,
      live: false,
      lines: SEGMENTS.filter((s) => s.topicId === "tp_1")
        .slice(0, 3)
        .map((s) => ({ key: s.segmentId, userId: s.userId, text: s.text, final: true, startMs: s.startMs })),
    },
    {
      key: "tp_2",
      title: "Saturday raid",
      colorIndex: 1,
      live: true,
      lines: SEGMENTS.filter((s) => s.topicId === "tp_2").map((s) => ({
        key: s.segmentId,
        userId: s.userId,
        text: s.text,
        final: true,
        startMs: s.startMs,
      })),
    },
  ],
  accept: noop,
  decline: noop,
  togglePaused: noop,
};

const YOU_NEED_SPARKS: TranscriptParticipant[] = [
  { userId: "u_amara", displayName: "Amara Obi", lines: 0, status: "no_sparks" },
  { userId: "u_ben", displayName: "Ben Carter", lines: 9, status: "transcribed" },
  { userId: "u_cy", displayName: "Cy Mensah", lines: 0, status: "no_sparks" },
];
const TURNED_OFF: TranscriptParticipant[] = [
  { userId: "u_amara", displayName: "Amara Obi", lines: 7, status: "transcribed" },
  { userId: "u_dee", displayName: "Dee Lawal", lines: 0, status: "not_accepted" },
  { userId: "u_fay", displayName: "Fay Ndu", lines: 0, status: "silent" },
];
const EVERYONE_IN: TranscriptParticipant[] = [
  { userId: "u_amara", displayName: "Amara Obi", lines: 7, status: "transcribed" },
  { userId: "u_ben", displayName: "Ben Carter", lines: 9, status: "transcribed" },
];

const BANNERS: { label: string; participants: TranscriptParticipant[]; expanded?: boolean }[] = [
  { label: "Others missing (as it first shows)", participants: MIXED },
  { label: "Others missing (tapped open)", participants: MIXED, expanded: true },
  { label: "You need Sparks", participants: YOU_NEED_SPARKS },
  { label: "Turned off, didn't speak (tapped open)", participants: TURNED_OFF, expanded: true },
  { label: "Everyone in", participants: EVERYONE_IN },
];

// ---------- the route ----------

const VIEWS = [
  "merged",
  "ended",
  "banners",
  "empty",
  "error",
  "panel",
  "panel-all-in",
  "notes-quick",
  "notes-model",
  "notes-pending",
  "notes-pending-quick",
  "notes-none",
];

export default function DevCallTranscript() {
  if (!__DEV__) {
    return <Redirect href="/" />;
  }

  return <DevCallTranscriptScreen />;
}

function DevCallTranscriptScreen() {
  const params = useLocalSearchParams<{ view?: string; code?: string }>();
  const view = String(params.view || "");
  const back = () => router.replace("/dev/call-transcript" as Href);
  const open = (href: string) => router.push(href as Href);

  switch (view) {
    case "merged":
      return <CallTranscriptView callId={CALL_ID} token={null} myUserId={ME} loadPage={mergedLoader} onBack={back} onNavigate={open} />;
    case "ended":
      return <CallTranscriptView callId={CALL_ID} token={null} myUserId={ME} loadPage={endedLoader} onBack={back} onNavigate={open} />;
    case "empty":
      return <CallTranscriptView callId={CALL_ID} token={null} myUserId={ME} loadPage={emptyLoader} onBack={back} onNavigate={open} />;
    case "error": {
      const code = Number(params.code) || 503;
      const failing = async () => {
        throw Object.assign(new Error("mock"), { status: code });
      };
      return <CallTranscriptView key={code} callId={CALL_ID} token={null} myUserId={ME} loadPage={failing} onBack={back} />;
    }
    case "banners":
      return <Banners onBack={back} />;
    case "panel":
      return <Panel onBack={back} participants={MIXED} />;
    case "panel-all-in":
      return <Panel onBack={back} participants={EVERYONE_IN} />;
    case "notes-quick":
    case "notes-model":
    case "notes-pending":
    case "notes-pending-quick":
    case "notes-none":
      return <Notes kind={view} onBack={back} />;
    default:
      return <Index />;
  }
}

const mergedLoader = pagedLoader(BASE);
const endedLoader = pagedLoader({
  ...BASE,
  status: "ready",
  startedAt: "2026-10-23T14:05:00.000Z",
  endedAt: "2026-10-23T14:37:00.000Z",
  participants: MIXED.slice(0, 2),
});
const emptyLoader = pagedLoader(
  {
    ...BASE,
    status: "ended",
    startedAt: "2026-10-23T14:05:00.000Z",
    endedAt: "2026-10-23T14:21:00.000Z",
    topics: [],
    participants: [
      { userId: "u_amara", displayName: "Amara Obi", lines: 0, status: "no_sparks" },
      { userId: "u_ben", displayName: "Ben Carter", lines: 0, status: "no_sparks" },
      { userId: "u_dee", displayName: "Dee Lawal", lines: 0, status: "not_accepted" },
    ],
  },
  [],
);

function Index() {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.screen}>
      <ScreenGradient />
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: insets.top + 20, gap: 10 }}>
        <Text style={styles.devTitle}>DEV · Call transcript previews</Text>
        {VIEWS.map((v) => (
          <Pressable key={v} style={styles.devLink} onPress={() => router.push(`/dev/call-transcript?view=${v}` as Href)}>
            <Text style={styles.devLinkText}>{v}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

function Banners({ onBack }: { onBack: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.screen}>
      <ScreenGradient />
      <ScrollView contentContainerStyle={{ padding: 18, paddingTop: insets.top + 16, paddingBottom: 40 }}>
        <Pressable onPress={onBack}>
          <Text style={styles.devTitle}>‹ Who&apos;s in the transcript</Text>
        </Pressable>
        {BANNERS.map((b) => (
          <View key={b.label} style={{ marginTop: 16 }}>
            <Text style={styles.devLabel}>{b.label}</Text>
            <TranscriptCoverage
              participants={b.participants}
              myUserId={ME}
              speakers={SPEAKERS}
              defaultExpanded={b.expanded}
              onNavigate={(href) => router.push(href as Href)}
            />
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

function Panel({ onBack, participants }: { onBack: () => void; participants: TranscriptParticipant[] }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.screen}>
      <CallBackground>
        <SparksCallPanel
          notes={MOCK_NOTES}
          call={MOCK_CALL}
          myUserId={ME}
          topInset={insets.top}
          bottomInset={insets.bottom}
          onBack={onBack}
          coverage={{ participants, speakers: SPEAKERS }}
          onOpenTranscript={() => router.push("/dev/call-transcript?view=merged" as Href)}
        />
      </CallBackground>
    </View>
  );
}

function Notes({ kind, onBack }: { kind: string; onBack: () => void }) {
  const [open, setOpen] = useState(true);
  const reply: CallOutlineReply =
    kind === "notes-pending"
      ? { status: "pending", outline: null, quickNotes: false }
      : kind === "notes-pending-quick"
        ? { status: "pending", outline: null, quickNotes: true }
        : kind === "notes-none"
          ? { status: "none", outline: null, quickNotes: true, reason: "no_transcript" }
          : { status: "ready", outline: kind === "notes-quick" ? QUICK_OUTLINE : OUTLINE, speakers: SPEAKERS, quickNotes: true };
  return (
    <View style={styles.screen}>
      <ScreenGradient />
      {open ? null : (
        <Pressable style={{ padding: 24, paddingTop: 60 }} onPress={() => setOpen(true)}>
          <Text style={styles.devTitle}>Tap to open the notes again</Text>
        </Pressable>
      )}
      <CallNotesSheet
        callId={CALL_ID}
        token={null}
        visible={open}
        onClose={() => (open ? setOpen(false) : onBack())}
        nameOf={() => "someone on the call"}
        myUserId={ME}
        load={async () => reply}
        onOpenTranscript={() => {
          setOpen(false);
          router.push("/dev/call-transcript?view=ended" as Href);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#FFFFFF" },
  devTitle: { fontFamily: FONTS.semibold, fontSize: 16, color: "#24283C" },
  devLabel: { fontFamily: FONTS.medium, fontSize: 12, color: "#66738A", marginBottom: 6, textTransform: "uppercase" },
  devLink: { padding: 14, borderRadius: 14, backgroundColor: "#F0EDF9" },
  devLinkText: { fontFamily: FONTS.semibold, fontSize: 15, color: "#C34D9C" },
});
