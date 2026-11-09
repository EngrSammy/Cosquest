// The Warden's model on this phone (Android, and iOS in the shared game): which one, fetched, verified,
// loaded, and plugged into the voice. The server names the files and their
// digests (GET /v1/model); which to run is a deploy, not a release, as on iOS
// (costquest-ios Game/Warden.swift, Game/ModelStore.swift).
//
//   - the best variant whose min_ram_bytes this phone has (1.7B Warden voice
//     needs 6 GB; the 0.5B 3 GB), or none: the authored lines then speak;
//   - fetched only when asked (the journal's button, like iOS's wantsModel),
//     never on a cellular surprise at launch;
//   - every byte checked against the manifest's sha256 before it is loaded;
//   - a generated line must pass WardenCheck, twice at most, or the authored
//     line is said instead.
import { Directory, File, Paths } from "expo-file-system";
import { useSyncExternalStore } from "react";

import { CostQuestWarden } from "@/modules/costquest-warden/src";

import { gameStore } from "./runtime";
import { WardenMoment } from "./warden";
import { chooseVariant, cleanLine, lineProblem } from "./wardenCheck";

export type WardenModelState = {
  phase: "off" | "unsupported" | "too-small" | "downloading" | "verifying" | "loading" | "ready" | "failed";
  label?: string;
  bytes?: number;
  progress?: number;
  error?: string;
  /** Measured on this phone once loaded (a warm-up line). */
  firstTokenMs?: number;
  tokensPerSecond?: number;
  written: number;
  rejected: number;
};

let state: WardenModelState = { phase: CostQuestWarden?.available ? "off" : "unsupported", written: 0, rejected: 0 };
const listeners = new Set<() => void>();
const set = (patch: Partial<WardenModelState>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};

export function useWardenModel(): WardenModelState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state,
  );
}

let busy = false;

/** One line from the model, checked; null if it could not write a good one. */
async function write(m: WardenMoment): Promise<string | null> {
  if (!CostQuestWarden || state.phase !== "ready" || busy) return null;
  busy = true;
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const out = await CostQuestWarden.generate(m.prompt, m.maxTokens, attempt === 0 ? 0.75 : 0.9);
      const text = cleanLine(out.text);
      const why = lineProblem(text, m);
      if (!why) {
        set({ written: state.written + 1, firstTokenMs: out.firstTokenMs, tokensPerSecond: out.tokensPerSecond });
        return text;
      }
      set({ rejected: state.rejected + 1 });
      if (__DEV__) console.log(`[warden] rejected ${m.kind}: ${why} :: ${text}`);
    }
    return null;
  } finally {
    busy = false;
  }
}

let starting: Promise<void> | null = null;

/**
 * Fetch (if needed), verify, load, and hand the voice a writer. Idempotent.
 * `onWriter` receives the writer once the model is ready.
 */
export function startWardenModel(onWriter: (writer: (m: WardenMoment) => Promise<string | null>) => void): Promise<void> {
  if (starting) return starting;
  starting = (async () => {
    const native = CostQuestWarden;
    if (!native?.available) {
      set({ phase: "unsupported" });
      return;
    }
    try {
      const manifest = await gameStore.client.modelManifest();
      const variant = chooseVariant(manifest, native.physicalMemory, process.env.EXPO_PUBLIC_WARDEN_VARIANT ?? null);
      if (!variant) {
        set({ phase: "too-small" });
        return;
      }
      set({ label: variant.label, bytes: variant.model.bytes + variant.tokenizer.bytes });
      const dir = new Directory(Paths.document, "warden");
      if (!dir.exists) dir.create({ intermediates: true });
      const files = [variant.tokenizer, variant.model];
      const local: File[] = [];
      let done = 0;
      for (const f of files) {
        const file = new File(dir, `${f.sha256.slice(0, 16)}-${f.file}`);
        const marker = new File(dir, `${f.sha256.slice(0, 16)}-${f.file}.ok`);
        if (!(file.exists && marker.exists)) {
          if (file.exists) file.delete();
          set({ phase: "downloading", progress: done / (state.bytes ?? 1) });
          await File.downloadFileAsync(f.url, file, {
            onProgress: (p) => set({ progress: (done + p.bytesWritten) / (state.bytes ?? 1) }),
          });
          set({ phase: "verifying" });
          const digest = await native.sha256File(file.uri);
          if (digest !== f.sha256) {
            file.delete();
            throw new Error(`${f.file} did not match its checksum`);
          }
          marker.create();
        }
        done += f.bytes;
        local.push(file);
      }
      set({ phase: "loading", progress: 1 });
      await native.load(local[1].uri, local[0].uri);
      set({ phase: "ready" });
      onWriter(write);
      // A warm-up line measures this phone (first word, speed) for the journal.
      void write(
        new WardenMoment("arrive", "neutral", [
          ["name", gameStore.playerName()],
          ["place", "this street"],
        ]),
      );
    } catch (error) {
      set({ phase: "failed", error: (error as Error).message });
      starting = null;
    }
  })();
  return starting;
}

export function wardenModelState(): WardenModelState {
  return state;
}

/**
 * A free answer from the model ("Ask the Warden"), or null when it is not
 * loaded or is busy with a line. Not streamed: the native module returns the
 * whole answer, so the screen shows the rule until it arrives.
 */
export async function askModel(prompt: string, maxTokens = 96): Promise<{ text: string; firstTokenMs?: number; tokensPerSecond?: number } | null> {
  if (!CostQuestWarden || state.phase !== "ready" || busy) return null;
  busy = true;
  try {
    const out = await CostQuestWarden.generate(prompt, maxTokens, 0.6);
    return { text: out.text, firstTokenMs: out.firstTokenMs, tokensPerSecond: out.tokensPerSecond };
  } catch {
    return null;
  } finally {
    busy = false;
  }
}

/** Stop a long answer (the native engine's stop, when it has one). */
export function stopModel() {
  CostQuestWarden?.stop();
}
