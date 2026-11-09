// The Warden's server voice: which audio to play for a line, or null for
// "keep the voice you have" (on-device speech). The server (backend
// app/warden_voice.py) renders a line with ElevenLabs once and serves it from
// its cache forever after; this side remembers the URLs it was given, waits
// only briefly, and stops asking for a while when the server says it has no
// voice to give, so a phone with no server voice costs one request, not one
// per line.
//
// Never throws and never blocks the game: a slow answer is abandoned for this
// line (it still lands in the memory, so the next time the line is instant).
// Pure (tested in features/game/__tests__/wardenServerVoice.test.ts).

/** Ask the server for a line: the audio's URL, null for "no voice" (204); a throw is an error. */
export type VoiceAsk = (text: string, moment: string, style: string) => Promise<{ url: string } | null>;

/** The server's own limit (CQ_WARDEN_TTS_MAX_CHARS); longer lines stay on-device without asking. */
export const MAX_VOICE_CHARS = 220;
/** How long a line waits for the server voice before the on-device one speaks. */
export const VOICE_WAIT_MS = 2500;
/** After "no voice" (no key, a daily cap): quiet for 10 minutes. After an error: 1 minute. */
export const NO_VOICE_BACKOFF_MS = 10 * 60_000;
export const ERROR_BACKOFF_MS = 60_000;

/** What the server keys its cache on, so two spellings of one line are one entry here too. */
export function normaliseLine(text: string): string {
  return text
    .normalize("NFC")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function voiceable(text: string): boolean {
  const t = normaliseLine(text);
  return t.length > 0 && t.length <= MAX_VOICE_CHARS;
}

export type ServerVoiceOptions = {
  ask: VoiceAsk;
  now?: () => number;
  waitMs?: number;
  /** Lines remembered (URLs only, a few hundred bytes each). */
  memory?: number;
};

export class ServerVoice {
  private readonly ask: VoiceAsk;
  private readonly now: () => number;
  private readonly waitMs: number;
  private readonly memory: number;
  private readonly urls = new Map<string, string>();
  private readonly inFlight = new Map<string, Promise<string | null>>();
  private quietUntil = 0;

  constructor(opts: ServerVoiceOptions) {
    this.ask = opts.ask;
    this.now = opts.now ?? (() => Date.now());
    this.waitMs = opts.waitMs ?? VOICE_WAIT_MS;
    this.memory = opts.memory ?? 300;
  }

  /** Whether the server is worth asking right now. */
  get available(): boolean {
    return this.now() >= this.quietUntil;
  }

  /** The URL already known for a line (no request). */
  known(text: string): string | null {
    return this.urls.get(normaliseLine(text)) ?? null;
  }

  /** Start fetching a line's audio now (the arrive line, as the player approaches). */
  prefetch(text: string, moment: string, style: string): void {
    void this.fetch(text, moment, style);
  }

  /** The audio for a line within `waitMs`, or null: speak it on the phone instead. */
  async urlFor(text: string, moment: string, style: string, waitMs = this.waitMs): Promise<string | null> {
    const known = this.known(text);
    if (known) return known;
    const job = this.fetch(text, moment, style);
    let timer: ReturnType<typeof setTimeout> | null = null;
    const late = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), waitMs);
    });
    try {
      return await Promise.race([job, late]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private fetch(text: string, moment: string, style: string): Promise<string | null> {
    const line = normaliseLine(text);
    if (!voiceable(line) || !this.available) return Promise.resolve(null);
    const known = this.urls.get(line);
    if (known) return Promise.resolve(known);
    const running = this.inFlight.get(line);
    if (running) return running;
    const job = this.ask(line, moment, style)
      .then((got) => {
        if (!got) {
          this.quietUntil = this.now() + NO_VOICE_BACKOFF_MS;
          return null;
        }
        if (this.urls.size >= this.memory) {
          const oldest = this.urls.keys().next().value;
          if (oldest !== undefined) this.urls.delete(oldest);
        }
        this.urls.set(line, got.url);
        return got.url;
      })
      .catch(() => {
        this.quietUntil = this.now() + ERROR_BACKOFF_MS;
        return null;
      })
      .finally(() => this.inFlight.delete(line));
    this.inFlight.set(line, job);
    return job;
  }
}
