// ==========================================
// A CALL'S TRANSCRIPT AND NOTES (from our backend)
// ==========================================
// Every phone with Sparks on writes down its owner's lines; the backend
// merges them into one transcript per call:
//   GET /api/calls/:callId/transcript?cursor=&limit=   the lines, oldest first
//   GET /api/calls/:callId/outline                      the write-up after the call
// Only people who were on the call can read them. The words around who is
// (and isn't) in a transcript live in services/callTranscriptCopy.ts.
import { apiRequest } from "@/services/api";

import type { CallOutline } from "@cosquest/sparks-sdk";
import type { TranscriptParticipant, TranscriptSpeakers } from "@/services/callTranscriptCopy";

export type {
  TranscriptParticipant,
  TranscriptParticipantStatus,
  TranscriptSpeaker,
  TranscriptSpeakers,
} from "@/services/callTranscriptCopy";

export type CallTranscriptStatus = "active" | "ended" | "outlining" | "ready";

export type CallTranscriptSegment = {
  segmentId: string;
  userId: string;
  /** Milliseconds from the start of the call. */
  startMs: number;
  endMs: number;
  text: string;
  locale?: string;
  confidence?: number;
  topicId: string | null;
};

export type CallTranscriptTopic = {
  callId: string;
  topicId: string;
  title: string;
  colorIndex: number;
  startedAtMs: number;
  /** The call came back to an earlier topic. */
  returning: boolean;
};

export type CallTranscriptPage = {
  callId: string;
  chatId: string;
  kind: "call" | "voice_room";
  status: CallTranscriptStatus;
  startedAt: string;
  endedAt: string | null;
  segments: CallTranscriptSegment[];
  topics: CallTranscriptTopic[];
  speakers: TranscriptSpeakers;
  /** First page only (no cursor). */
  participants?: TranscriptParticipant[];
  nextCursor: string | null;
};

export type CallOutlineReply = {
  /** none: the call finished and nobody's speech was transcribed, so there will never be notes. */
  status: "pending" | "ready" | "none";
  outline: CallOutline | null;
  /** Names for the outline's speakerIds and action-item owners. */
  speakers?: TranscriptSpeakers;
  /** The server writes quick notes when no phone does (a couple of minutes after the call). */
  quickNotes?: boolean;
  reason?: "no_transcript" | string;
};

/** The outline was written on CosQuest's server from the transcript, without a model. */
export const QUICK_NOTES_MODEL = "server-extractive";

/** An HTTP status from a failed request (null: no answer at all). */
export function errorStatus(error: unknown): number | null {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === "number" ? status : null;
}

// The server said transcripts aren't switched on (501): remembered for this
// session, so the notes sheet doesn't offer a transcript that can't open.
let transcriptsOff = false;
export function transcriptsUnavailable() {
  return transcriptsOff;
}

export function fetchCallTranscript(
  callId: string,
  token: string,
  options: { cursor?: string | null; limit?: number } = {},
): Promise<CallTranscriptPage> {
  const query = [
    options.cursor ? `cursor=${encodeURIComponent(options.cursor)}` : "",
    options.limit ? `limit=${options.limit}` : "",
  ]
    .filter(Boolean)
    .join("&");
  return apiRequest<CallTranscriptPage>(
    `/api/calls/${encodeURIComponent(callId)}/transcript${query ? `?${query}` : ""}`,
    { method: "GET", token },
  ).then((page) => ({
    ...page,
    segments: Array.isArray(page?.segments) ? page.segments : [],
    topics: Array.isArray(page?.topics) ? page.topics : [],
    speakers: page?.speakers || {},
    nextCursor: page?.nextCursor || null,
  }))
    .catch((error) => {
      if (errorStatus(error) === 501) transcriptsOff = true;
      throw error;
    });
}

export function fetchCallOutline(callId: string, token: string): Promise<CallOutlineReply> {
  return apiRequest<Partial<CallOutlineReply> | null>(`/api/calls/${encodeURIComponent(callId)}/outline`, {
    method: "GET",
    token,
  }).then((reply) => ({
    status: reply?.outline ? "ready" : reply?.status === "none" ? "none" : "pending",
    outline: reply?.outline || null,
    speakers: reply?.speakers || {},
    quickNotes: reply?.quickNotes === true,
    reason: reply?.reason,
  }));
}
