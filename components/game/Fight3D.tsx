// The 3D fight (cq 061, "Godot G0"): Godot draws the fight full screen inside
// the app (RTNGodotView), with a small close button over it and a loading
// card until Godot says the fight is on. Since battle-3d-only (1 Nov 2026) it is
// every mode's fight: DuelScreen starts the duel with the server (fight3d: true)
// and hands the start here; Godot fights on its seed, round and modifiers, and
// the loading card is the pre-fight card (who, what kind of fight, what it is worth). The engine itself is
// features/game3d/engine.ts; the rules (config, result, reward) fight3d.ts.
//
//   <Fight3D point mode onResult onClose />   one fight
//   <Fight3DHost point run onResult onClose /> one fight, or the leak test:
//        run.cycle = N opens and closes it N times, run.cycleMs apart,
//        logging "CQCYCLE i=<n> ..." lines (adb logcat -s ReactNativeJS)
//
// hold (the AR reveal is on screen, FightReveal.tsx): everything is prepared
// (the cast's files, the config, the weapons, the engine warmed and paused)
// but start_fight waits until hold goes false, so the fight starts the moment
// the reveal hands over and not a second before.
//
// Closing (X, Android Back, the result, leaving the screen) always goes
// through closeFight, which is safe while loading and safe twice.
// testIDs: fight3d-view, fight3d-close, fight3d-loading, fight3d-error.
import { Ionicons } from "@expo/vector-icons";
import { File, Paths } from "expo-file-system";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, BackHandler, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { castWeapons, fightCast } from "@/features/game3d/characters";
import { closeFight, fightStatus, FightOpenError, godotLib, holdForBackground, onFightState, openFight, warmFight } from "@/features/game3d/engine";
import {
  buildFightConfig,
  type Fight3DMode,
  type Fight3DResult,
  type Fight3DRun,
  fightCard,
  fightFromStart,
  godotArgs,
  parseFightResult,
  placeFrom,
  quitResult,
} from "@/features/game3d/fight3d";
import { FIGHT3D } from "@/features/game3d/flags";
import { useAppSelector } from "@/store/hooks";
import { gameStore } from "@/features/game/runtime";
import type { DuelStart, QuestPoint } from "@/features/game/wire";

import { GameButton, MAX_FONT_SCALE } from "./kit";
import { hapticsOn } from "./prefs";
import { callActive } from "./sound";
import { GF, GP } from "./theme";

type Phase = { kind: "loading"; step: string } | { kind: "fighting" } | { kind: "closing" } | { kind: "failed"; message: string };

const log = (line: string) => console.log(`[fight3d] ${line}`);

/**
 * cq 019: the real place round the point. The map's own ground (the store's /v1/map/ground answer) is
 * written to a cache file for Godot (place.gd); null keeps the street (no ground, not covered, off it).
 */
function placeFile(point: QuestPoint | null): { groundPath: string; at: [number, number] } | null {
  if (!point || !FIGHT3D.place) return null;
  const ground = gameStore.get().ground;
  const spot = placeFrom(ground, point);
  if (!spot || !ground) return null;
  try {
    const f = new File(Paths.cache, "fight3d-ground.json");
    f.create({ overwrite: true });
    f.write(JSON.stringify(ground));
    return { groundPath: f.uri, at: spot.at };
  } catch (e) {
    log(`place file failed: ${(e as Error).message}`);
    return null;
  }
}

export default function Fight3D({
  point,
  mode,
  autoplay,
  start = null,
  enemyId,
  parked = false,
  autoCloseMs,
  hold = false,
  onFighting,
  onFailed,
  onResult,
  onClose,
}: {
  /** The point fought at: its name on the HUD and its Guardian. Null for a test run. */
  point: QuestPoint | null;
  mode: Fight3DMode;
  autoplay: boolean;
  /**
   * The duel the server started for this fight (a "fight3d" setup): Godot fights on its seed, round and
   * modifiers, and the record goes back with it. Null only for the test arena (the dev link).
   */
  start?: DuelStart | null;
  /** The opponent character a duel start named (else the server's pick for the point). */
  enemyId?: string | null;
  /** The game is behind the chat: Godot stops drawing. */
  parked?: boolean;
  /** The leak test: close by itself this long after the fight is on. */
  autoCloseMs?: number;
  /** The AR reveal is playing over it: prepare everything, start the fight when this goes false. */
  hold?: boolean;
  onFighting?: () => void;
  /** It could not start (its error card is showing). */
  onFailed?: () => void;
  /** Godot's verdict, and the duel it was fought for when judged. The engine is already closed. */
  onResult: (r: Fight3DResult, start: DuelStart | null) => void;
  /** Closed without a verdict (X, Back, a failure, the leak test). The engine is already closed. */
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState<Phase>({ kind: "loading", step: "Getting the fighters ready" });
  const phaseRef = useRef(phase);
  const done = useRef(false);
  // The app's Reduce motion setting (cq 013): read when the fight opens (a ref, so a change never reopens it).
  const reduceMotionSetting = useAppSelector((state) => Boolean(state.settings.appearance?.reduceMotion));
  const reduceMotion = useRef(reduceMotionSetting);
  reduceMotion.current = reduceMotionSetting;
  const openedAt = useRef(Date.now());
  const duel = useRef<DuelStart | null>(start);
  const fightOf = start ? fightFromStart(start) : null;
  const card = fightCard(start, point?.name ?? "this place");
  const go = useCallback((p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);
  const View3D = godotLib()?.RTNGodotView ?? null;
  const holdRef = useRef(hold);
  holdRef.current = hold;
  const release = useRef<(() => void) | null>(null);
  const onFailedRef = useRef(onFailed);
  onFailedRef.current = onFailed;
  useEffect(() => {
    if (hold || !release.current) return;
    const r = release.current;
    release.current = null;
    r();
  }, [hold]);

  /** The one way out: the engine closed first, then the parent told once. */
  const finish = useCallback(
    (result: Fight3DResult | null) => {
      if (done.current) return;
      done.current = true;
      go({ kind: "closing" });
      log(`close outcome=${result?.outcome ?? "none"} after_ms=${Date.now() - openedAt.current}`);
      void closeFight({ keep: FIGHT3D.keep }).then(() => {
        if (result) onResult(result, duel.current);
        else onClose();
      });
    },
    [go, onClose, onResult],
  );
  const finishRef = useRef(finish);
  finishRef.current = finish;

  // Open on mount: the cast's files, the engine, the fight. Closed on unmount whatever happened.
  useEffect(() => {
    let alive = true;
    openedAt.current = Date.now();
    const args = godotArgs(Platform.OS, { bundleDir: Platform.OS === "ios" ? Paths.bundle.uri : null });
    // The reveal is on: bring the engine up (paused) while the files download.
    if (holdRef.current) void warmFight({ args });
    void (async () => {
      try {
        // The server set this fight up already (DuelScreen started the duel): its seed, round and modifiers.
        if (start && !fightOf) throw new Error("The 3D fight could not start.");
        if (fightOf) log(`judged duel=${start?.duel_id} seed=${fightOf.seed} mods=${fightOf.mods.boss_hp_permille}/${fightOf.mods.boss_dmg_permille} round=${fightOf.durationS}`);
        const role = point?.source === "raid" || start?.mode === "raid" ? "boss" : "guardian";
        // No point (the test link's Test arena): a fixed key, so the opponent is a published Guardian, not the capsule.
        const cast = await fightCast({
          pointId: point?.id ?? "test-arena",
          role,
          enemyId: fightOf?.enemyId ?? enemyId,
          enemyName: fightOf?.guardianName ?? point?.extra?.guardian ?? null,
          ally: fightOf?.ally ?? null,
          enemyWeaponId: fightOf?.enemyWeaponId ?? null,
          lodOverride: FIGHT3D.lod,
        });
        if (!alive || done.current) return;
        log(`cast lod=${cast.lod} hero_id=${cast.hero.id ?? "-"} hero=${cast.hero.path ? "glb" : "-"} ally=${cast.ally.path ? "glb" : "-"} enemy=${cast.enemy.path ? "glb" : "-"} after_ms=${Date.now() - openedAt.current}`);
        go({ kind: "loading", step: "Opening the arena" });
        const config = buildFightConfig({
          hero: cast.hero,
          ally: cast.ally,
          // The Guardian's name is the server's (a Trials rung, a Siege's holder, a raid boss).
          enemy: fightOf?.guardianName ? { ...cast.enemy, name: fightOf.guardianName } : cast.enemy,
          pointName: point?.name ?? "Test arena",
          mode,
          seed: fightOf?.seed ?? Math.floor(Math.random() * 2147483647),
          durationS: fightOf?.durationS,
          mods: fightOf?.mods ?? null,
          guardianLook: fightOf?.look ?? null,
          autoplay,
          tilesUrl: FIGHT3D.tilesUrl || null,
          reduceMotion: reduceMotion.current,
          haptics: hapticsOn(),
          // look-fight: the fight's sound and music stay quiet while a CosQuest call holds the audio
          sound: !callActive(),
          place: placeFile(point),
        });
        log(`arena ${config.arena ?? "street"}${config.place_at ? ` at=${config.place_at.join(",")}` : ""}`);
        // Weapons in hand (cq 234): the cast's weapons, as files, with their grips.
        const weapons = await castWeapons(cast);
        Object.assign(config, weapons);
        log(`weapons ${Object.keys(weapons).join(",") || "-"}`);
        // Leak probe (test link selfcycle=N): Godot restarts the fight N times in this one view.
        const probe = FIGHT3D as { selfCycle?: number; look?: Record<string, boolean> | null };
        if (probe.selfCycle) Object.assign(config, { self_cycle: probe.selfCycle, self_cycle_ms: 6000 });
        // Look switches (test link look=post etc.): the opt-in post stack on a device.
        if (probe.look) Object.assign(config, { look: probe.look });
        if (holdRef.current) {
          // Ready under the reveal: wait for its handover.
          log(`ready, held for the reveal after_ms=${Date.now() - openedAt.current}`);
          await new Promise<void>((resolve) => {
            release.current = resolve;
            if (!holdRef.current) {
              release.current = null;
              resolve();
            }
          });
          if (!alive || done.current) return;
          log(`released after_ms=${Date.now() - openedAt.current}`);
        }
        await openFight({
          args,
          config,
          keep: FIGHT3D.keep,
          onResult: (json) => {
            const r = parseFightResult(json);
            log(`result ${r ? r.outcome : `unreadable: ${String(json).slice(0, 120)}`}`);
            finishRef.current(r ?? quitResult(mode, (Date.now() - openedAt.current) / 1000));
          },
        });
        if (!alive || done.current) return;
        log(`started mode=${mode} after_ms=${Date.now() - openedAt.current}`);
      } catch (e) {
        if (!alive || done.current) return;
        if (e instanceof FightOpenError && (e as FightOpenError & { cancelled?: boolean }).cancelled) return;
        log(`failed: ${(e as Error).message}`);
        go({ kind: "failed", message: (e as Error).message || "The 3D fight could not start." });
        onFailedRef.current?.();
        void closeFight({ keep: FIGHT3D.keep });
      }
    })();
    return () => {
      alive = false;
      if (!done.current) {
        done.current = true;
        void closeFight({ keep: FIGHT3D.keep });
      }
    };
    // One fight per mount: the props are read once.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // The loading card stays until Godot says the fight is on (its state push).
  useEffect(() => {
    if (phase.kind !== "loading") return;
    let alive = true;
    onFightState((st) => {
      if (!alive || phaseRef.current.kind !== "loading" || st !== "fighting") return;
      log(`fighting after_ms=${Date.now() - openedAt.current}`);
      go({ kind: "fighting" });
      onFighting?.();
      // Leak probe (test link statusspam=N): N bridge calls in a row, nothing else.
      const spam = (FIGHT3D as { statusSpam?: number }).statusSpam ?? 0;
      if (spam > 0) {
        void (async () => {
          log(`statusspam start n=${spam}`);
          for (let k = 0; k < spam; k++) await fightStatus();
          log(`statusspam done n=${spam}`);
        })();
      }
    });
    return () => {
      alive = false;
    };
  }, [phase.kind, go, onFighting]);

  // The leak test closes it by itself.
  useEffect(() => {
    if (phase.kind !== "fighting" || !autoCloseMs) return;
    const t = setTimeout(() => finishRef.current(null), autoCloseMs);
    return () => clearTimeout(t);
  }, [phase.kind, autoCloseMs]);

  // Android Back closes the fight (as the X does).
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      finishRef.current(null);
      return true;
    });
    return () => sub.remove();
  }, []);

  // Not drawn while the app is in the background or the game is behind the chat.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => holdForBackground(s !== "active"));
    return () => sub.remove();
  }, []);
  useEffect(() => {
    holdForBackground(parked);
  }, [parked]);

  return (
    <View style={styles.root}>
      <StatusBar hidden animated />
      {View3D ? <View3D style={StyleSheet.absoluteFill} testID="fight3d-view" /> : null}

      {phase.kind === "loading" || phase.kind === "closing" ? (
        <View style={styles.cover} testID="fight3d-loading" accessible accessibilityLabel={phase.kind === "loading" ? phase.step : "Closing"}>
          {start && phase.kind === "loading" ? (
            <View style={styles.card} testID="fight3d-card" accessible accessibilityLabel={`${card.kicker}. ${card.title}. ${card.line ?? ""}`}>
              <Text style={styles.cardKicker} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                {card.kicker}
              </Text>
              <Text style={styles.cardTitle} numberOfLines={2} adjustsFontSizeToFit maxFontSizeMultiplier={MAX_FONT_SCALE}>
                {card.title}
              </Text>
              {card.line ? (
                <Text style={styles.coverSub} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                  {card.line}
                </Text>
              ) : null}
            </View>
          ) : null}
          <ActivityIndicator color="#FFF" size="large" />
          <Text style={styles.coverText} maxFontSizeMultiplier={MAX_FONT_SCALE}>
            {phase.kind === "loading" ? `${phase.step}…` : "Closing…"}
          </Text>
          {point ? (
            <Text style={styles.coverSub} numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE}>
              {point.name}
            </Text>
          ) : null}
        </View>
      ) : null}

      {phase.kind === "failed" ? (
        <View style={styles.cover} testID="fight3d-error">
          <Text style={styles.coverText} maxFontSizeMultiplier={MAX_FONT_SCALE} accessibilityLiveRegion="polite">
            {phase.message}
          </Text>
          <GameButton title="Back" color={GP.sun} onPress={onClose} testID="fight3d-error-back" style={{ alignSelf: "stretch" }} />
        </View>
      ) : null}

      <Pressable
        onPress={() => (phase.kind === "failed" ? onClose() : finish(null))}
        style={[styles.close, { top: insets.top + 10 }]}
        hitSlop={10}
        testID="fight3d-close"
        accessibilityRole="button"
        accessibilityLabel="Leave the fight">
        <Ionicons name="close" size={22} color="#FFF" />
      </Pressable>
    </View>
  );
}

/**
 * One 3D fight, or the leak test (run.cycle > 0): open, wait for the fight,
 * hold it run.cycleMs, close, wait run.cycleMs, again, N times. Each step is
 * logged as "CQCYCLE i=<n> <what> t=<ms since the test began>".
 */
export function Fight3DHost({
  point,
  run,
  parked,
  enemyId,
  onResult,
  onClose,
}: {
  point: QuestPoint | null;
  run: Fight3DRun;
  parked?: boolean;
  enemyId?: string | null;
  onResult: (r: Fight3DResult, start: DuelStart | null) => void;
  onClose: () => void;
}) {
  const [i, setI] = useState(0);
  const [open, setOpen] = useState(true);
  const began = useRef(Date.now());
  const cycling = run.cycle > 0;
  const say = useCallback((what: string) => console.log(`CQCYCLE i=${i} ${what} t=${Date.now() - began.current} keep=${FIGHT3D.keep ? 1 : 0} mode=${run.mode}`), [i, run.mode]);

  useEffect(() => {
    if (cycling && open) say("open");
  }, [cycling, open, say]);

  const next = useCallback(() => {
    say("closed");
    setOpen(false);
    setTimeout(() => {
      if (i + 1 >= run.cycle) {
        console.log(`CQCYCLE done n=${run.cycle} t=${Date.now() - began.current}`);
        onClose();
        return;
      }
      setI(i + 1);
      setOpen(true);
    }, run.cycleMs);
  }, [i, run.cycle, run.cycleMs, onClose, say]);

  if (!open) return <View style={[StyleSheet.absoluteFill, { backgroundColor: GP.navy }]} testID="fight3d-cycle-gap" />;
  return (
    <Fight3D
      key={i}
      point={point}
      mode={run.mode}
      autoplay={run.autoplay}
      enemyId={enemyId}
      parked={parked}
      autoCloseMs={cycling ? run.cycleMs : undefined}
      onFighting={cycling ? () => say("fighting") : undefined}
      onResult={cycling ? () => next() : onResult}
      onClose={cycling ? next : onClose}
    />
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFill, backgroundColor: "#000" },
  cover: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center", gap: 14, padding: 24, backgroundColor: GP.navy },
  coverText: { fontFamily: GF.display, fontSize: 20, color: "#FFF", textAlign: "center" },
  coverSub: { fontFamily: GF.body, fontSize: 14, color: "rgba(255,255,255,0.7)", textAlign: "center" },
  card: { alignItems: "center", gap: 6, marginBottom: 18, maxWidth: 360 },
  cardKicker: { fontFamily: GF.display, fontSize: 13, letterSpacing: 1.5, color: GP.sun },
  cardTitle: { fontFamily: GF.display, fontSize: 30, color: "#FFF", textAlign: "center" },
  close: { position: "absolute", left: 14, width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center" },
});
