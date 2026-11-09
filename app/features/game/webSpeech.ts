// The browser's speech recogniser (Web Speech API) as a SpeechEngine, for the web test
// build (day1-trivia, 3 Nov 2026). Pure: the recogniser class is looked up on the global
// object, so Node tests pass a fake and Playwright can stand one in for the microphone.
//
// TEST BUILDS ONLY (SayItButton asks for it only with EXPO_PUBLIC_E2E=1 or in dev): Chrome
// sends the audio to its own speech service, where the phones recognise on the device
// (VoiceAnswer's promise, "on the phone or not at all"). It lets the whole voice path
// (recogniser -> matcher -> the index the server marks) run in a browser.
import type { SpeechEngine } from "./voiceAnswer";

type Alt = { transcript: string };
type Result = { isFinal: boolean; length: number; [i: number]: Alt };
type ResultEvent = { results: { length: number; [i: number]: Result } };
export type WebRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: ResultEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  abort(): void;
};
type Ctor = new () => WebRecognition;

/** The Web Speech error names, as VoiceAnswer's codes (unavailableReason). */
export function webSpeechCode(error: string): string {
  switch (error) {
    case "not-allowed":
    case "service-not-allowed":
      return "permission_denied";
    case "no-speech":
      return "speech_timeout";
    case "audio-capture":
      return "audio";
    case "language-not-supported":
      return "language_not_supported";
    case "aborted":
      return "client";
    default:
      return "unavailable";
  }
}

/** Everything heard so far, and whether the last piece is final. */
export function transcriptOf(e: ResultEvent): { text: string; final: boolean } {
  let text = "";
  let final = false;
  for (let i = 0; i < e.results.length; i++) {
    const r = e.results[i];
    if (r.length > 0) text += r[0].transcript;
    final = r.isFinal;
  }
  return { text: text.trim(), final };
}

export function webSpeechEngine(g: Record<string, unknown> = globalThis as unknown as Record<string, unknown>): SpeechEngine | null {
  const Rec = (g.SpeechRecognition ?? g.webkitSpeechRecognition) as Ctor | undefined;
  if (typeof Rec !== "function") return null;
  let rec: WebRecognition | null = null;
  let onResult: ((text: string, final: boolean) => void) | null = null;
  let onError: ((code: string) => void) | null = null;
  return {
    // The browser asks for the microphone itself when listening starts; a refusal arrives as "not-allowed".
    async requestPermission() {
      return true;
    },
    async start() {
      rec?.abort();
      const r = new Rec();
      const nav = g.navigator as { language?: string } | undefined;
      r.lang = nav?.language || "en-GB";
      r.continuous = false;
      r.interimResults = true;
      r.maxAlternatives = 1;
      r.onresult = (e) => {
        const t = transcriptOf(e);
        onResult?.(t.text, t.final);
      };
      r.onerror = (e) => {
        if (e.error !== "aborted") onError?.(webSpeechCode(e.error));
      };
      rec = r;
      try {
        r.start();
      } catch {
        rec = null;
        throw { code: "unavailable" };
      }
    },
    async stop() {
      const r = rec;
      rec = null;
      if (!r) return;
      r.onresult = null;
      r.onerror = null;
      r.abort();
    },
    subscribe(result, error) {
      onResult = result;
      onError = error;
      return () => {
        onResult = null;
        onError = null;
      };
    },
  };
}
