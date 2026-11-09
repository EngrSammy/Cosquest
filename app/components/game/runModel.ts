// The Quest Run's state, one for the whole game (costquest-ios
// Features/RunFeature.swift RunModel), read through useSyncExternalStore.
// The words and the routes are features/game/run.ts; this is the glue.
import * as Haptics from "expo-haptics";
import { useSyncExternalStore } from "react";
import { Platform, Share } from "react-native";

import { GameError } from "@/features/game/client";
import {
  isLive,
  isPocket,
  isTrivia,
  type RunBoard,
  runAllowance,
  runAnswer,
  runBoard,
  runCurrent,
  type RunFinish,
  runFinish,
  type RunMode,
  runOpen,
  type RunOpened,
  type RunPoint,
  runPower,
  runStart,
  type RunState,
  SERVER_GRACE_S,
  shareContent,
  triviaAllowance,
  triviaBoard,
  type TriviaShare,
  triviaShare,
} from "@/features/game/run";
import { gameStore } from "@/features/game/runtime";
import type { RoamAnswer, RoamAttempt } from "@/features/game/wire";

import { impact, notify } from "./prefs";
import { playSound } from "./sound";

export type RunModelState = {
  run: RunState | null;
  board: RunBoard | null;
  /** Set when a run settles; the results screen reads it. */
  finished: RunFinish | null;
  /** Why the last start failed: shown on the start sheet. */
  problem: string | null;
  /** Something that went wrong mid-run, shown on the HUD for a few seconds. */
  notice: string | null;
  /** The stake the server holds per opened point, so re-entering a Forbidden Zone does not ask again. */
  openedStakes: Record<number, number>;
  busy: boolean;
  /** The deadline on this phone's clock, from the server's seconds left. */
  localEnd: number | null;
  dailyLeft: number | null;
  pocketLeft: number | null;
  triviaLeft: number | null;
  /** A finished trivia run's share link, once asked for. */
  share: TriviaShare | null;
};

const EMPTY: RunModelState = {
  run: null,
  board: null,
  finished: null,
  problem: null,
  notice: null,
  openedStakes: {},
  busy: false,
  localEnd: null,
  dailyLeft: null,
  pocketLeft: null,
  triviaLeft: null,
  share: null,
};

let state: RunModelState = EMPTY;
const listeners = new Set<() => void>();
const set = (patch: Partial<RunModelState>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};
const message = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);
const fixOf = () => gameStore.get().fix;

function apply(r: RunState | null) {
  set({ run: r, localEnd: r ? Date.now() + r.remaining_s * 1000 : null });
}

let noticeTimer: ReturnType<typeof setTimeout> | null = null;

/** The board a finished run is shown with: the global one for trivia, the city's for a daily run, none for a Pocket Run. */
async function boardAfter(f: RunFinish) {
  if (isTrivia(f.run)) await runModel.loadTriviaBoard(f.board_day);
  else if (!isPocket(f.run)) await runModel.loadBoard(f.board_day);
}

export const runModel = {
  subscribe(l: () => void) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
  get: () => state,
  live: () => isLive(state.run),

  /**
   * The server's view of the run: picked up again after the app was killed or
   * backgrounded, and asked at 0:00 so the server settles it. False when the
   * server could not be reached; the caller retries.
   */
  async resume(): Promise<boolean> {
    let got;
    try {
      got = await runCurrent(gameStore.client);
    } catch {
      return false;
    }
    const held = state.run;
    if (got.settled) {
      set({ run: got.settled.run, localEnd: null, finished: got.settled, share: null });
      playSound("fanfare");
      await boardAfter(got.settled);
      void gameStore.refreshMe();
    } else if (held && !state.finished && (got.run?.run_id !== held.run_id || got.run?.finished === true)) {
      // The run this phone held was settled elsewhere: /finish is idempotent
      // and hands back the stored result, so the results screen still shows.
      await runModel.finish();
      if (!state.finished && got.run && got.run.run_id !== held.run_id) apply(got.run);
    } else if (got.run || !state.finished) {
      apply(got.run ?? null);
    }
    return true;
  },

  async start(mode: RunMode, block: string | null): Promise<boolean> {
    if (state.busy) return false;
    set({ busy: true, problem: null });
    try {
      if (mode === "daily" && block) {
        set({ problem: block });
        return false;
      }
      const r = await runStart(gameStore.client, mode, fixOf());
      apply(r);
      set({ finished: null, openedStakes: {}, share: null });
      notify(Haptics.NotificationFeedbackType.Success);
      return true;
    } catch (e) {
      if (e instanceof GameError && e.status === 409) {
        // A run is already on (another tap, or one this phone lost track of): take it up.
        set({ busy: false });
        if ((await runModel.resume()) && runModel.live()) return true;
        set({ problem: "A run is already on. Try again in a moment." });
        return false;
      }
      set({ problem: message(e, "The run couldn't start.") });
      return false;
    } finally {
      set({ busy: false });
    }
  },

  async open(p: RunPoint, stake: boolean): Promise<RunOpened> {
    const run = state.run;
    if (!run) throw new Error("The run is over.");
    try {
      const o = await runOpen(gameStore.client, run.run_id, p.idx, stake, fixOf());
      set({ openedStakes: { ...state.openedStakes, [p.idx]: o.stake } });
      return o;
    } catch (e) {
      // A refused open means the tray is out of date: ask the server what the run looks like.
      void runModel.resume();
      throw e;
    }
  },

  async answer(a: RoamAttempt, answers: RoamAnswer[]) {
    const run = state.run;
    if (!run) throw new Error("The run is over.");
    const r = await runAnswer(gameStore.client, run.run_id, a.attempt_id, answers);
    apply(r.run);
    // This answer settled the run: fetch the results now.
    if (r.run.finished && !state.finished) void runModel.finish();
    return r;
  },

  async use(power: "radar" | "surge") {
    const run = state.run;
    if (!run || state.busy) return;
    set({ busy: true });
    try {
      apply(await runPower(gameStore.client, run.run_id, power));
      impact(Haptics.ImpactFeedbackStyle.Medium);
    } catch (e) {
      runModel.flash(message(e, "That power didn't work."));
      set({ busy: false });
      await runModel.resume();
    } finally {
      set({ busy: false });
    }
  },

  async finish() {
    const run = state.run;
    if (!run || state.busy) return;
    set({ busy: true });
    try {
      const f = await runFinish(gameStore.client, run.run_id);
      set({ run: f.run, finished: f, localEnd: null, share: null });
      playSound("fanfare");
      await boardAfter(f);
      void gameStore.refreshMe();
    } catch (e) {
      runModel.flash(`Couldn't end the run: ${message(e, "no connection")}`);
    } finally {
      set({ busy: false });
    }
  },

  /**
   * The run's end: wait out the clock plus the server's grace and a second,
   * then ask the server, which settles it; loops until the run is over, so a
   * failed ask never leaves the clock stuck at 0:00. Returns a cancel.
   */
  watchEnd(): () => void {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const step = async () => {
      if (cancelled || !runModel.live()) return;
      const ok = await runModel.resume();
      if (cancelled || !runModel.live()) return;
      schedule(ok ? 0 : 3000);
    };
    const schedule = (extra: number) => {
      const wait = Math.max(0, (state.localEnd ?? Date.now()) - Date.now() + (SERVER_GRACE_S + 1) * 1000) + extra;
      timer = setTimeout(() => void step(), wait);
    };
    schedule(0);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  },

  async loadAllowance() {
    try {
      const me = await gameStore.client.roamMe();
      const left = runAllowance(me);
      set({ dailyLeft: left.daily, pocketLeft: left.pocket, triviaLeft: triviaAllowance(me) });
    } catch {
      // The sheet just doesn't say how many are left.
    }
  },

  async loadBoard(day?: string | null) {
    const fix = fixOf();
    if (!fix) return;
    try {
      set({ board: await runBoard(gameStore.client, fix, day) });
    } catch {
      set({ board: null });
    }
  },

  /** Today's global trivia board (no location needed): the start screen, and after a trivia run. */
  async loadTriviaBoard(day?: string | null) {
    try {
      const key = gameStore.get().session?.playerKey ?? null;
      set({ board: await triviaBoard(gameStore.client, day, key) });
    } catch {
      set({ board: null });
    }
  },

  /**
   * Share a finished trivia run: the server makes (or hands back) its card,
   * then the phone's share sheet posts the line and the link. False when the
   * link could not be made; the share sheet being dismissed is not a failure.
   */
  async share(): Promise<boolean> {
    const f = state.finished;
    if (!f || !isTrivia(f.run) || state.busy) return false;
    let link = state.share;
    if (!link) {
      // Busy only while the link is made: the share sheet can stay open as long as the player likes.
      set({ busy: true });
      try {
        link = await triviaShare(gameStore.client, f.run.run_id);
        set({ share: link });
      } catch (e) {
        runModel.flash(`Couldn't share: ${message(e, "no connection")}`);
        return false;
      } finally {
        set({ busy: false });
      }
    }
    try {
      await Share.share(shareContent(link, Platform.OS));
    } catch {
      // No share sheet here (a desktop browser): the link is on the results to copy.
    }
    return true;
  },

  flash(text: string) {
    set({ notice: text });
    if (noticeTimer) clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => set({ notice: null }), 4000);
    notify(Haptics.NotificationFeedbackType.Warning);
  },

  clearProblem() {
    set({ problem: null });
  },

  /** Once the results are closed, the run is over for the phone too. */
  close() {
    set({ finished: null, run: null, localEnd: null, openedStakes: {}, share: null });
  },

  /** A run point fought as a duel comes back with the run as the server now has it. */
  adopt(r: RunState) {
    apply(r);
  },

  reset() {
    state = EMPTY;
    listeners.forEach((l) => l());
  },
};

// A sign-out or a different player: forget the last one's run at once.
let lastKey: string | null = null;
gameStore.subscribe(() => {
  const key = gameStore.get().session?.playerKey ?? null;
  if (key === lastKey) return;
  lastKey = key;
  runModel.reset();
});

export function useRun(): RunModelState {
  return useSyncExternalStore(runModel.subscribe, runModel.get, runModel.get);
}
