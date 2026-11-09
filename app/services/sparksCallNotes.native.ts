// ==========================================
// SPARKS IN CALLS (phones only)
// ==========================================
// Sparks works in calls the way it does in chat. While a call is answered,
// Sparks turns what THIS user says into text on their own phone (the audio
// never leaves the phone and is never saved). Everyone's lines meet on the
// backend, Sparks picks out the topics as they come up (each one a Spark),
// and after the call the phones that were on it write up each Spark.
//
// Flow, per call:
//  1. Ask once: the Sparks notice (Turn on Sparks / Not now). "Turn on" is
//     remembered for later calls; "Not now" is for this call only.
//  2. Start transcription for this call and connect LiveKit's microphone
//     audio to Sparks (modules/sparks-call-audio, native to native).
//  3. Mute in the app = Sparks stops listening too. The Sparks pill pauses
//     Sparks for this user without muting the call.
//  4. Leaving the call: stop (the last sentence still arrives).
// The call's Sparks (topics with their lines) are shown live on the call
// screen's Sparks panel (swipe right), whatever this user chose: other
// people's lines come from their phones.
// Off unless Sparks is on (EXPO_PUBLIC_SPARKS_ENGINE=module) and this build
// has the native audio module.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { attachCallAudio, callAudioAvailable, detachCallAudio } from "@/modules/sparks-call-audio";
import { getSparksSdk, onModelStatus } from "@/services/sparksSdk";

import type { TopicShift, TranscriptSegment, TranscriptionNotice, TranscriptionSession } from "@cosquest/sparks-sdk";

export type CallNotesPhase =
  | "off" // Sparks isn't running on this phone, or the call isn't answered yet
  | "ask" // waiting for this user's answer to the notice
  | "declined" // "Not now" for this call
  | "waiting" // speech files still downloading (Wi-Fi)
  | "starting"
  | "on"
  | "error";

export type CaptionLine = {
  key: string;
  userId: string;
  text: string;
  final: boolean;
  /** Milliseconds from the start of the call (the server's call clock). */
  startMs: number;
};

/** A topic Sparks picked up on this call, with what was said under it. */
export type CallSpark = {
  key: string;
  /** null: what was said before Sparks named the first topic. */
  title: string | null;
  colorIndex: number;
  /** The call is on this topic right now. */
  live: boolean;
  lines: CaptionLine[];
};

export type CallNotes = {
  phase: CallNotesPhase;
  notice: TranscriptionNotice | null;
  /** This user paused notes from the pill (the call itself is not muted). */
  paused: boolean;
  /** The last few lines said on the call, oldest first (finals from everyone, partials from this phone). */
  lines: CaptionLine[];
  topic: { title: string; colorIndex: number } | null;
  /** The call's Sparks in the order they came up, each with its lines. */
  sparks: CallSpark[];
  accept: () => void;
  decline: () => void;
  togglePaused: () => void;
};

const MAX_LINES = 3;
const RETRY_MS = 15_000;

export function useSparksCallNotes({
  callId,
  chatId,
  startedAt,
  active,
  micOn,
}: {
  callId: string;
  chatId: string;
  /** When the call was answered (the server's time): everyone's timestamps line up on it. */
  startedAt: string | null | undefined;
  /** Answered and not ending. */
  active: boolean;
  micOn: boolean;
}): CallNotes {
  const sdk = getSparksSdk();
  const usable = Boolean(sdk && callAudioAvailable);

  const [decision, setDecision] = useState<"accepted" | "declined" | "unset">(() =>
    usable ? sdk!.calls.getConsent(callId).decision : "unset",
  );
  const [phase, setPhase] = useState<CallNotesPhase>("off");
  const [paused, setPaused] = useState(false);
  const [finals, setFinals] = useState<CaptionLine[]>([]);
  const [partials, setPartials] = useState<Record<string, CaptionLine>>({});
  const [shifts, setShifts] = useState<TopicShift[]>([]);
  const [retry, setRetry] = useState(0);
  const session = useRef<TranscriptionSession | null>(null);

  const notice = usable ? sdk!.calls.getTranscriptionNotice() : null;

  // Sparks may start after the call screen opened (a voice chat joined from
  // its card boots Sparks itself). The answer read at mount was then "unset"
  // and the notice showed again to someone who had said "Turn on" for good:
  // read it again once Sparks is running.
  useEffect(() => {
    if (!usable || decision !== "unset") return;
    const saved = sdk!.calls.getConsent(callId).decision;
    if (saved !== "unset") setDecision(saved);
  }, [usable, sdk, callId, decision]);

  // Captions and topic colours for this call.
  useEffect(() => {
    if (!usable) return;
    const offSegment = sdk!.calls.onSegment((s: TranscriptSegment) => {
      if (s.callId !== callId || !s.text.trim()) return;
      const line: CaptionLine = { key: s.segmentId, userId: s.userId, text: s.text.trim(), final: s.final, startMs: s.startMs };
      // A partial replaces this speaker's previous partial; their final replaces it.
      setPartials(({ [s.userId]: _old, ...rest }) => (s.final ? rest : { ...rest, [s.userId]: line }));
      if (s.final) setFinals((current) => (current.some((l) => l.key === line.key) ? current : [...current, line]));
    });
    const offTopic = sdk!.calls.onTopicShift((t: TopicShift) => {
      if (t.callId === callId) setShifts((current) => [...current, t]);
    });
    return () => {
      offSegment();
      offTopic();
    };
  }, [usable, sdk, callId]);

  // Start / stop transcription with the call.
  useEffect(() => {
    if (!usable || !active || !startedAt) {
      setPhase("off");
      return;
    }
    if (decision === "unset") return setPhase("ask");
    if (decision === "declined") return setPhase("declined");

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let offModel: (() => void) | null = null;

    (async () => {
      const caps = await sdk!.getCapabilities().catch(() => null);
      if (cancelled) return;
      if (!caps?.transcription) {
        // The speech files come with the Sparks AI download. Try again when
        // the model status changes, and every 15 s as a backup.
        setPhase("waiting");
        // Only when the phase changes: during a download the status fires
        // several times a second (progress), and every retry re-rendered the
        // whole call screen, videos included.
        let lastPhase = "";
        offModel = onModelStatus((status) => {
          if (status.phase === lastPhase) return;
          lastPhase = status.phase;
          setRetry((n) => n + 1);
        });
        timer = setTimeout(() => setRetry((n) => n + 1), RETRY_MS);
        return;
      }
      setPhase("starting");
      try {
        const started = await sdk!.calls.startTranscription({
          callId,
          chatId,
          callStartedAt: new Date(startedAt).toISOString(),
          audioSource: "external",
          partials: true,
          commands: false,
        });
        if (cancelled) {
          await started.stop().catch(() => {});
          return;
        }
        session.current = started;
        attachCallAudio();
        setPhase("on");
      } catch (error: any) {
        if (cancelled) return;
        console.warn("[sparks] call notes:", error?.code || error?.message || error);
        if (error?.code === "E_CONSENT_REQUIRED") return setDecision("unset");
        setPhase(error?.code === "E_TRANSCRIPTION_UNAVAILABLE" ? "waiting" : "error");
        timer = setTimeout(() => setRetry((n) => n + 1), RETRY_MS);
      }
    })();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      offModel?.();
      const current = session.current;
      session.current = null;
      if (current) {
        detachCallAudio();
        current.stop().catch(() => {});
      }
    };
  }, [usable, sdk, active, startedAt, decision, callId, chatId, retry]);

  // Muted in the call, or notes paused: Sparks stops listening.
  useEffect(() => {
    if (phase === "on") session.current?.setMuted(!micOn || paused);
  }, [phase, micOn, paused]);

  const record = useCallback(
    (accepted: boolean) => {
      if (!usable || !notice) return;
      const next = accepted ? "accepted" : "declined";
      setDecision(next);
      sdk!.calls
        .recordConsent(
          accepted
            ? { noticeVersion: notice.version, decision: next, scope: "always" }
            : { noticeVersion: notice.version, decision: next, scope: "call", callId },
        )
        .catch((error: any) => console.warn("[sparks] consent:", error?.message || error));
    },
    [usable, sdk, notice, callId],
  );

  const lines = useMemo(
    () => [...finals.slice(-MAX_LINES), ...Object.values(partials)].sort((a, b) => a.startMs - b.startMs).slice(-MAX_LINES),
    [finals, partials],
  );
  const last = shifts[shifts.length - 1];
  const topic = last ? { title: last.title, colorIndex: last.colorIndex } : null;
  const sparks = useMemo(() => groupBySpark([...finals, ...Object.values(partials)], shifts), [finals, partials, shifts]);

  const accept = useCallback(() => record(true), [record]);
  const decline = useCallback(() => record(false), [record]);
  const togglePaused = useCallback(() => setPaused((p) => !p), []);
  const topicTitle = topic?.title ?? null;
  const topicColor = topic?.colorIndex ?? null;

  // The same object until something shown changes, so the call screen's
  // memoized Sparks pieces skip the renders the call timer causes.
  return useMemo(
    () => ({
      phase,
      notice,
      paused,
      lines,
      topic: topicTitle === null ? null : { title: topicTitle, colorIndex: topicColor ?? 0 },
      sparks,
      accept,
      decline,
      togglePaused,
    }),
    [phase, notice, paused, lines, topicTitle, topicColor, sparks, accept, decline, togglePaused],
  );
}

/**
 * Each line goes under the topic the call was on when it was said (the last
 * topic change at or before it). A topic that comes back keeps one Spark.
 */
function groupBySpark(all: CaptionLine[], shifts: TopicShift[]): CallSpark[] {
  const ordered = [...shifts].sort((a, b) => a.startedAtMs - b.startedAtMs);
  const sparks: CallSpark[] = [];
  const byTopic = new Map<string, CallSpark>();
  const sparkFor = (shift: TopicShift | undefined) => {
    const key = shift ? shift.topicId : "start";
    let spark = byTopic.get(key);
    if (!spark) {
      spark = { key, title: shift?.title ?? null, colorIndex: shift?.colorIndex ?? 0, live: false, lines: [] };
      byTopic.set(key, spark);
      sparks.push(spark);
    }
    return spark;
  };
  for (const shift of ordered) sparkFor(shift);
  for (const line of [...all].sort((a, b) => a.startMs - b.startMs)) {
    let current: TopicShift | undefined;
    for (const shift of ordered) if (shift.startedAtMs <= line.startMs) current = shift;
    sparkFor(current).lines.push(line);
  }
  const live = ordered[ordered.length - 1];
  if (live) byTopic.get(live.topicId)!.live = true;
  // Lines before the first topic only show while nothing has been named yet,
  // or when they were never moved under a topic.
  return sparks.filter((s) => s.title !== null || s.lines.length > 0);
}
