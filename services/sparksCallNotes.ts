// ==========================================
// SPARKS IN CALLS - WEBSITE VERSION (does nothing)
// ==========================================
// Sparks in calls runs on phones (services/sparksCallNotes.native.ts).
// People on the website still join calls; their speech just isn't transcribed.
import type { TranscriptionNotice } from "@cosquest/sparks-sdk";

export type CallNotesPhase = "off" | "ask" | "declined" | "waiting" | "starting" | "on" | "error";

export type CaptionLine = { key: string; userId: string; text: string; final: boolean; startMs: number };

export type CallSpark = { key: string; title: string | null; colorIndex: number; live: boolean; lines: CaptionLine[] };

export type CallNotes = {
  phase: CallNotesPhase;
  notice: TranscriptionNotice | null;
  paused: boolean;
  lines: CaptionLine[];
  topic: { title: string; colorIndex: number } | null;
  sparks: CallSpark[];
  accept: () => void;
  decline: () => void;
  togglePaused: () => void;
};

const noop = () => {};

// One object for every render (the call screen's Sparks pieces are memoized).
const OFF: CallNotes = { phase: "off", notice: null, paused: false, lines: [], topic: null, sparks: [], accept: noop, decline: noop, togglePaused: noop };

export function useSparksCallNotes(_options: {
  callId: string;
  chatId: string;
  startedAt: string | null | undefined;
  active: boolean;
  micOn: boolean;
}): CallNotes {
  return OFF;
}
