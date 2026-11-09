// Answer by saying it (costquest-ios Warden/VoiceAnswer.swift).
//
// Speech is recognised on the phone, matched here to one of the four
// choices, and only the choice's index goes to the server: it marks it
// exactly as if it had been tapped. The matching is deliberately not the
// language model: picking which of four known strings someone said is a
// string problem with a right answer, and a deterministic matcher is right
// every time and instant. "The second one", "B" and "the green one" work as
// well as the words themselves.
//
// The platform's recogniser is injected (SpeechEngine), so the state machine
// is plain TypeScript and tested in Node. On Android the engine is the
// Kotlin SpeechListener (modules/costquest-game/android); see
// components/game/SayItButton.tsx.

// MARK: - Matching

const ORDINALS: string[][] = [
  ["first", "one", "number one", "a", "blue", "top"],
  ["second", "two", "number two", "b", "red"],
  ["third", "three", "number three", "c", "orange", "yellow"],
  ["fourth", "four", "number four", "d", "green", "last", "bottom"],
];

const FILLERS = new Set(["the", "its", "it", "is", "um", "uh", "answer", "option", "one", "i", "think", "say"]);

/**
 * Lower case, accents folded, split on anything that is not a letter or digit.
 * (No \p{...} escapes: Hermes is not guaranteed to have them. Latin letters
 * are enough: the answers are English.)
 */
export function spokenWords(s: string): string[] {
  let lower = s.toLowerCase();
  if (typeof lower.normalize === "function") lower = lower.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return lower.split(/[^0-9a-z\u00df-\u00ff\u0100-\u024f]+/).filter(Boolean);
}

const isNumber = (w: string) => /^[+-]?\d+$/.test(w);

/**
 * Which choice was said, or null. `strict` is for partial results: act only
 * when one choice clearly wins. A removed choice (50/50) is passed as "".
 */
export function matchSpokenAnswer(said: string, choices: string[], strict: boolean): number | null {
  const heard = spokenWords(said);
  if (heard.length === 0) return null;
  const joined = heard.join(" ");

  // "the second one", "B", "the green one".
  const meaningful = heard.filter((w) => !FILLERS.has(w));
  // Not when a choice was named outright: "D.Va" is heard as "d va", not as option D.
  const named = choices.some((c) => {
    const w = spokenWords(c);
    return w.some((x) => !FILLERS.has(x)) && saidInOrder(heard, w);
  });
  if (meaningful.length <= 2 && !named) {
    for (let i = 0; i < ORDINALS.length && i < choices.length; i++) {
      const said = ORDINALS[i].some((f) => (f.includes(" ") ? joined.includes(f) : meaningful.includes(f)));
      if (!said) continue;
      // Not when another choice's own words were said ("blue" with "Blue Whale"
      // among the choices). Fillers do not count: "the" in "The Shard" must
      // not block "the second one" (VoiceAnswer.swift had this; fixed on both).
      const otherNamed = choices.some((c, j) => j !== i && spokenWords(c).some((w) => meaningful.includes(w) && w.length > 2));
      if (!otherNamed) return i;
    }
  }

  // The words themselves. Score by overlap on the words that matter; the whole
  // name said in order (or run together) scores above any overlap, so "One For
  // All" beats "All For One" and "Mewtwo" beats "Mew" (day1-trivia: 13 of the
  // bank's 716 answers could not be said before, see voiceBank.test.ts).
  const scores: [number, number][] = [];
  choices.forEach((c, i) => {
    const all = spokenWords(c);
    if (all.length === 0) return;
    // An acronym or a short name ("S.T.A.R.S.", "E.T.", "D.Va") is said as one word.
    const words = all.length > 1 && all.every((w) => w.length <= 2 && !isNumber(w)) ? [all.join("")] : all;
    let target = words.filter((w) => w.length > 2 || isNumber(w));
    // A short answer is all short words ("Up"): then every word matters.
    if (target.length === 0) target = words;
    const hits = target.filter((t) => heard.some((h) => h === t || (t.length > 4 && h.startsWith(t.slice(0, 5)))));
    let score = hits.length / target.length;
    // The whole choice, word for word in order, or run together the way
    // recognisers often do ("starlord" for Star-Lord, "stars" for S.T.A.R.S.);
    // never for numbers, where "1 21" glued is "12 1" glued.
    if (saidInOrder(heard, all) || (all.length > 1 && !all.some(isNumber) && saidRunTogether(heard, all.join("")))) score = 1.5;
    scores.push([i, score]);
  });
  scores.sort((a, b) => b[1] - a[1]);
  const best = scores[0];
  if (!best || best[1] <= 0) return null;
  const second = scores[1]?.[1] ?? 0;
  const needed = strict ? 0.99 : 0.5;
  return best[1] >= needed && best[1] - second >= (strict ? 0.5 : 0.25) ? best[0] : null;
}

/** `words` appear in `heard` as a run of whole words, in order. */
function saidInOrder(heard: string[], words: string[]): boolean {
  for (let i = 0; i + words.length <= heard.length; i++) {
    if (words.every((w, k) => heard[i + k] === w)) return true;
  }
  return false;
}

/** Some run of whole heard words, glued together, spells `glued` ("star lord" or "starlord"; never part of a word). */
function saidRunTogether(heard: string[], glued: string): boolean {
  for (let i = 0; i < heard.length; i++) {
    let acc = "";
    for (let j = i; j < heard.length && acc.length < glued.length; j++) {
      acc += heard[j];
      if (acc === glued) return true;
    }
  }
  return false;
}

// MARK: - The listening session

export type VoiceState =
  | { kind: "idle" }
  | { kind: "listening" }
  | { kind: "matched"; index: number }
  | { kind: "unsure" }
  | { kind: "unavailable"; why: string };

/** The phone's recogniser. Android: the Kotlin SpeechListener through the game module. */
export type SpeechEngine = {
  /** Asks for the microphone if needed; false when refused. */
  requestPermission(): Promise<boolean>;
  /** Starts one utterance. Rejects with { code } when it cannot. */
  start(options: { choices: string[]; locale?: string }): Promise<void>;
  /** Ends the utterance and drops it: no result may arrive after this. */
  stop(): Promise<void>;
  /** Partial and final results, and errors once listening. Returns an unsubscribe. */
  subscribe(onResult: (text: string, final: boolean) => void, onError: (code: string) => void): () => void;
};

export type VoiceDeps = {
  engine: SpeechEngine | null;
  /** The ongoing chat call owns the microphone. */
  callActive: () => boolean;
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
};

/** Seconds of silence before a hot microphone is closed (VoiceAnswer.swift). */
export const LISTEN_TIMEOUT_MS = 6000;

/** The line shown for a start or recogniser error. Pure, so it is tested. */
export function unavailableReason(code: string): string {
  switch (code) {
    case "permission_denied":
      return "Allow the microphone in Settings to answer by voice.";
    case "offline_unavailable":
      return "This phone can't recognise speech offline, so voice answers are off.";
    case "language_unavailable":
    case "language_not_supported":
      return "Voice answers need English speech recognition on this phone.";
    case "unavailable":
      return "Voice answers aren't available on this phone.";
    case "audio":
      return "No microphone is available right now.";
    default:
      return "Voice answers aren't available right now.";
  }
}

/** Errors that only mean "nothing usable was heard": settle on what we have. */
const QUIET = new Set(["no_match", "speech_timeout", "client"]);

/**
 * One SayIt button's session (VoiceAnswer.swift's state machine): tap to
 * listen, act on a confident partial match at once, settle leniently on the
 * final result or after the timeout, and never leave the microphone hot.
 */
export class VoiceAnswer {
  state: VoiceState = { kind: "idle" };
  heard = "";

  private choices: string[] = [];
  private onMatch: ((i: number) => void) | null = null;
  private starting = false;
  /** Bumped by stop(): a listen() still awaiting permission or the recogniser gives up. */
  private session = 0;
  private timer: unknown = null;
  private unsubscribe: (() => void) | null = null;
  private watchers = new Set<() => void>();

  private deps: VoiceDeps;

  constructor(deps: VoiceDeps) {
    this.deps = deps;
  }

  get available(): boolean {
    return this.deps.engine != null;
  }

  private snap: { state: VoiceState; heard: string } = { state: this.state, heard: "" };

  /** Re-render hook: called on every state or transcript change. */
  watch = (fn: () => void): (() => void) => {
    this.watchers.add(fn);
    return () => {
      this.watchers.delete(fn);
    };
  };

  /** An immutable view that changes identity on every change (for useSyncExternalStore). */
  snapshot = () => this.snap;

  /** Tap: start listening, or stop when already listening. */
  async listen(choices: string[], onMatch: (i: number) => void): Promise<void> {
    if (this.state.kind === "listening") {
      this.stop();
      return;
    }
    // A second tap while permission is being asked would start a second capture.
    if (this.starting) return;
    this.starting = true;
    this.choices = choices;
    this.onMatch = onMatch;
    this.heard = "";
    const mine = ++this.session;
    try {
      const engine = this.deps.engine;
      if (!engine) return this.set({ kind: "unavailable", why: unavailableReason("unavailable") });
      const allowed = await engine.requestPermission();
      // Stopped (the card went away, the clock ran out) while the dialog was up.
      if (mine !== this.session) return;
      if (!allowed) return this.set({ kind: "unavailable", why: unavailableReason("permission_denied") });
      // The microphone belongs to the ongoing CosQuest call.
      if (this.deps.callActive()) return this.set({ kind: "unavailable", why: "Your call is using the microphone. Tap your answer instead." });
      this.unsubscribe?.();
      this.unsubscribe = engine.subscribe(
        (text, final) => this.handle(text, final),
        (code) => this.failed(code),
      );
      this.set({ kind: "listening" });
      try {
        // The phone's own language: an on-device recogniser has it, where a
        // fixed "en-GB" may not be downloaded.
        await engine.start({ choices: choices.filter(Boolean) });
      } catch (error) {
        if (mine !== this.session) return;
        const code = (error as { code?: string })?.code ?? "error";
        this.teardown();
        return this.set({ kind: "unavailable", why: unavailableReason(code) });
      }
      // Stopped while the recogniser was starting: close it again.
      if (mine !== this.session) {
        engine.stop().catch(() => {});
        return;
      }
      // A player who taps the mic and says nothing should not be left with a hot microphone.
      if (this.timer != null) this.deps.clearTimeout(this.timer);
      this.timer = this.deps.setTimeout(() => {
        this.timer = null;
        if (this.state.kind === "listening") this.finish();
      }, LISTEN_TIMEOUT_MS);
    } finally {
      this.starting = false;
    }
  }

  /** Stop listening (second tap, the card going away, a pick by touch). */
  stop() {
    this.session++;
    this.teardown();
    if (this.state.kind === "listening") this.set({ kind: "idle" });
  }

  private teardown() {
    if (this.timer != null) this.deps.clearTimeout(this.timer);
    this.timer = null;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.deps.engine?.stop().catch(() => {});
  }

  private handle(text: string, final: boolean) {
    if (this.state.kind !== "listening") return;
    if (text) {
      this.heard = text;
      this.emit();
    }
    // Act on a confident match as soon as it is heard.
    const i = matchSpokenAnswer(this.heard, this.choices, true);
    if (i != null) this.succeed(i);
    else if (final) this.finish();
  }

  private failed(code: string) {
    if (this.state.kind !== "listening") return;
    if (QUIET.has(code)) return this.finish();
    this.teardown();
    this.set({ kind: "unavailable", why: unavailableReason(code) });
  }

  private finish() {
    const i = matchSpokenAnswer(this.heard, this.choices, false);
    if (i != null) return this.succeed(i);
    this.teardown();
    this.set(this.heard ? { kind: "unsure" } : { kind: "idle" });
  }

  private succeed(i: number) {
    this.teardown();
    this.set({ kind: "matched", index: i });
    this.onMatch?.(i);
  }

  private set(state: VoiceState) {
    this.state = state;
    this.emit();
  }

  private emit() {
    this.snap = { state: this.state, heard: this.heard };
    this.watchers.forEach((fn) => fn());
  }
}

/** The line under the mic button (SayItButton in ChallengeViews.swift). */
export function voicePrompt(state: VoiceState, heard: string): string {
  switch (state.kind) {
    case "listening":
      return heard ? `“${heard}”` : "Listening…";
    case "unsure":
      return "Didn't catch that. Tap and say it again, or tap an answer.";
    case "unavailable":
      return state.why;
    default:
      return "Say it: tap the mic and speak your answer.";
  }
}
