// The first minute of the game, as a conversation with the Warden
// (costquest-ios Roam/OnboardingView.swift). A character meeting you rather
// than a form: one line at a time on a clean white page, every question asked
// by the Warden at the moment it matters, one thing to look at at a time.
// Only location is asked for here; the camera and motion are asked for when
// the thing they are for comes up. The words, the beats and the pacing are
// features/game/onboarding.ts.
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useRef, useState } from "react";
import { Keyboard, Platform, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import Animated, {
  Easing,
  FadeInDown,
  type SharedValue,
  useAnimatedStyle,
  useAnimatedProps,
  useFrameCallback,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle } from "react-native-svg";

import {
  type Beat,
  canSkip,
  DAWN_TINT,
  lineFor,
  MIN_NAME,
  motes,
  nextNarrative,
  paceMs,
  startBeat,
  WORD_MS,
  wordsOf,
} from "@/features/game/onboarding";
import { claimStarterRelic, type RelicFull } from "@/features/game/relics";
import { relicsStore } from "@/features/game/relicsLive";
import { gameStore, startLocation, useGame } from "@/features/game/runtime";

import { announce, MAX_FONT_SCALE, pressFeedback, withAlpha } from "./kit";
import { impact, notify } from "./prefs";
import { RelicArt, rarityColor } from "./RelicArt";
import { playSound } from "./sound";
import { ACCENT, edgeColor, labelOn, RADIUS, SURFACES, TEXT_ON_DARK, TEXT_ON_LIGHT, useLook } from "./look";
import { GF, GP, realmColor, realmIcon } from "./theme";
import WardenBadge from "./WardenBadge";
import { useWardenMuted, wardenVoice } from "./wardenVoice";
import { themedStyles, useThemedStyles } from "@/constants/chatTheme";
import { usePopIn } from "./sheetMotion";
import { settle } from "@/features/game/spring";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const MOTES = motes();

/** Below this window height (points) the first run uses its compact sizes. */
const SHORT_SCREEN = 720;

export default function Onboarding({ suggestedName, onDone }: { suggestedName: string; onDone: () => void }) {
  const look = useLook();
  const styles = useThemedStyles(STYLE_PAIR);
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const config = useGame((s) => s.config);
  const profile = useGame((s) => s.profile);
  const me = useGame((s) => s.me);
  const giftIn = usePopIn();
  const muted = useWardenMuted();
  const [first] = useState(() => {
    const handle = (profile?.handle || suggestedName || "").trim();
    return { handle, ...startBeat({ faction: me?.faction, nameLength: (profile?.handle ?? "").trim().length }) };
  });
  const [beat, setBeat] = useState<Beat>(first.beat);
  const [handle, setHandle] = useState(first.handle);
  const [picked, setPicked] = useState<string | null>(null);
  const [joined, setJoined] = useState<string | null>(me?.faction ?? null);
  const [working, setWorking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [lineId, setLineId] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [awake, setAwake] = useState(first.awake);
  const [relic, setRelic] = useState<RelicFull | null>(null);
  /** The keyboard's height while it is up (0 when down): the Warden steps back to make room. */
  const [keyboard, setKeyboard] = useState(0);
  const typing = keyboard > 0;
  const claiming = useRef(false);
  const waitingForGift = useRef(false);
  const relicRef = useRef<RelicFull | null>(null);
  const speaking = useRef(false);
  const sayingId = useRef(0);
  const beatRef = useRef(beat);
  const savedName = useRef((profile?.handle ?? "").trim());

  const name = handle.trim();
  const houseName = (id: string | null) => (id ? gameStore.factionName(id) : "your house");
  const tint = joined ?? picked ? realmColor(joined ?? picked) : DAWN_TINT;
  const line = lineFor(beat, { name, picked, joined, relicName: relic?.name ?? null, houseName: houseName(joined) });

  // say(): a new line, read aloud when the Warden may speak, with a soft tap.
  const say = (text: string) => {
    setProblem(null);
    setRevealed(false);
    setLineId((n) => n + 1);
    wardenVoice.hush();
    if (!wardenVoice.isMuted() && text) {
      // The server's voice when it has the line, else the phone's (wardenVoice.say);
      // only this line's end clears the flag, not the stop of the one before.
      const mine = ++sayingId.current;
      speaking.current = true;
      wardenVoice.say(text, {
        moment: "onboarding",
        done: () => {
          if (sayingId.current === mine) speaking.current = false;
        },
      });
    }
    impact(Haptics.ImpactFeedbackStyle.Soft);
    announce(text);
  };

  const go = (b: Beat, ctx?: { joined?: string | null; relic?: RelicFull | null; name?: string }) => {
    beatRef.current = b;
    setBeat(b);
    say(
      lineFor(b, {
        name: ctx?.name ?? name,
        picked,
        joined: ctx?.joined ?? joined,
        relicName: (ctx?.relic ?? relicRef.current)?.name ?? null,
        houseName: houseName(ctx?.joined ?? joined),
      }),
    );
  };

  useEffect(() => {
    say(line);
    const t = first.awake ? null : setTimeout(() => setAwake(true), 900);
    const show = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow", (e) => setKeyboard(e.endCoordinates.height));
    const hide = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide", () => setKeyboard(0));
    return () => {
      if (t) clearTimeout(t);
      show.remove();
      hide.remove();
      wardenVoice.hush();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const finish = () => {
    wardenVoice.hush();
    onDone();
  };

  const advanceIfNarrative = () => {
    const b = beatRef.current;
    if (b === "farewell") return finish();
    if (b === "factionAck") {
      if (waitingForGift.current) return;
      waitingForGift.current = true;
      // The gift takes three round trips; give it a few seconds rather than
      // skip the one present the game hands a new player.
      let tries = 0;
      const poll = () => {
        if (claiming.current && !relicRef.current && tries++ < 40) {
          setTimeout(poll, 100);
          return;
        }
        waitingForGift.current = false;
        if (beatRef.current !== "factionAck") return;
        go(relicRef.current ? "gift" : "askLocation");
      };
      poll();
      return;
    }
    // The name is asked unless the game already has one: the chat's name is
    // only the suggestion in the field, and is saved when the player says so.
    const next = nextNarrative(b, b === "shrines" ? savedName.current.length : name.length);
    if (next) go(next);
  };

  // Narrative beats move on by themselves when the Warden has finished, with a
  // breath after, so the whole thing can be watched hands-free.
  useEffect(() => {
    let alive = true;
    const { first: lead, rest } = paceMs(line);
    let t = setTimeout(function wait() {
      if (!alive) return;
      if (!wardenVoice.isMuted() && speaking.current) {
        t = setTimeout(wait, 120);
        return;
      }
      t = setTimeout(() => alive && advanceIfNarrative(), wardenVoice.isMuted() ? rest : 900);
    }, lead);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [lineId]); // eslint-disable-line react-hooks/exhaustive-deps

  const tapped = () => {
    if (!revealed) {
      setRevealed(true);
      return;
    }
    advanceIfNarrative();
  };

  const saveName = async () => {
    if (name.length < MIN_NAME || working) return;
    setWorking(true);
    try {
      await gameStore.saveProfile(name.slice(0, 24), profile?.avatar ?? undefined);
      savedName.current = name.slice(0, 24);
      Keyboard.dismiss();
      go("nameAck");
    } catch (e) {
      setProblem(`I didn't catch that. ${e instanceof Error ? e.message : ""}`.trim());
    } finally {
      setWorking(false);
    }
  };

  const join = async () => {
    if (!picked || working) return;
    setWorking(true);
    try {
      await gameStore.chooseFaction(picked);
      setJoined(picked);
      // Claimed now, handed over once the Warden has said hello: by then the
      // round trip is long finished. No Relic, no gift beat.
      claiming.current = true;
      claimStarterRelic(gameStore.client)
        .then((r) => {
          relicRef.current = r;
          setRelic(r);
          relicsStore.noteDrop();
        })
        .catch(() => {})
        .finally(() => {
          claiming.current = false;
        });
      playSound("fanfare");
      notify(Haptics.NotificationFeedbackType.Success);
      go("factionAck", { joined: picked });
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "That didn't work. Try again.");
    } finally {
      setWorking(false);
    }
  };

  const pick = (id: string) => {
    impact(Haptics.ImpactFeedbackStyle.Soft);
    setPicked(id);
    beatRef.current = "askFaction";
    say(lineFor("askFaction", { name, picked: id, joined, relicName: null, houseName: houseName(id) }));
  };

  const askingName = beat === "askName" && revealed;
  // Compact while the name keyboard is up, and on short screens (a 360x640
  // phone): the full sizes (the Warden's halo, a 130-point line, a 150-point
  // button area) left the last step's button below the bottom edge there.
  const typingName = typing && beat === "askName";
  const small = typingName || height < SHORT_SCREEN;

  return (
    <View style={styles.root}>
      <Dawn tint={tint} awake={awake} />
      <Pressable style={StyleSheet.absoluteFill} onPress={tapped} accessibilityLabel="Continue" accessibilityRole="button" />

      <View style={[styles.column, { paddingTop: insets.top, paddingBottom: typingName ? keyboard + 12 : insets.bottom + (small ? 12 : 26) }]} pointerEvents="box-none">
        <View style={styles.topBar}>
          <Pressable
            onPress={() => {
              const next = !muted;
              wardenVoice.setMuted(next);
              if (!next) wardenVoice.say(line, { moment: "onboarding" });
            }}
            style={styles.topButton}
            accessibilityRole="button"
            accessibilityLabel={muted ? "Let the Warden speak" : "Mute the Warden"}>
            <Ionicons name={muted ? "volume-mute" : "volume-high"} size={18} color={look.textMuted} />
          </Pressable>
          {canSkip(beat) ? (
            <Pressable onPress={() => go("askName")} style={styles.skip} accessibilityRole="button">
              <Text style={styles.skipText}>Skip</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={{ flexGrow: 1, minHeight: small ? 4 : 20 }} pointerEvents="none" />
        <Presence tint={tint} awake={awake} size={small ? 76 : 132} />
        <View style={{ flexGrow: 1, minHeight: small ? 8 : 24 }} pointerEvents="none" />

        <Pressable onPress={tapped} style={{ minHeight: small ? 60 : 130, paddingHorizontal: 30 }} accessible accessibilityLabel={line}>
          <RevealLine text={line} id={lineId} revealed={revealed} onRevealed={() => setRevealed(true)} />
        </Pressable>

        <View style={{ flexGrow: 1, minHeight: 12 }} pointerEvents="none" />

        <View style={{ paddingHorizontal: 24, minHeight: small ? 0 : 150, justifyContent: "flex-end" }} pointerEvents="box-none">
          {askingName ? (
            <Animated.View entering={FadeInDown} style={{ gap: 16 }}>
              <View style={{ paddingHorizontal: 30 }}>
                <TextInput
                  value={handle}
                  onChangeText={setHandle}
                  autoFocus
                  autoCapitalize="words"
                  autoCorrect={false}
                  returnKeyType="done"
                  onSubmitEditing={() => void saveName()}
                  maxLength={24}
                  placeholder="Your name"
                  placeholderTextColor={look.textMuted}
                  style={styles.nameInput}
                  accessibilityLabel="Your name"
                />
                <View style={[styles.nameRule, { backgroundColor: withAlpha(tint, 0.8) }]} />
              </View>
              {problem ? <Text style={styles.problem}>{problem}</Text> : null}
              <CalmButton title={working ? "…" : "That's me"} enabled={name.length >= MIN_NAME && !working} tint={tint} onPress={() => void saveName()} />
            </Animated.View>
          ) : beat === "askFaction" && (revealed || picked) ? (
            <Animated.View entering={FadeInDown} style={{ gap: 18 }}>
              <View style={styles.orbs} accessibilityRole="radiogroup">
                {(config?.factions ?? []).map((f) => (
                  <HouseOrb key={f.id} id={f.id} name={f.name} chosen={picked === f.id} onPress={() => pick(f.id)} />
                ))}
              </View>
              {problem ? <Text style={styles.problem}>{problem}</Text> : null}
              <View style={{ opacity: picked ? 1 : 0 }} pointerEvents={picked ? "auto" : "none"}>
                <CalmButton title={working ? "…" : `Stand with ${houseName(picked)}`} enabled={!!picked && !working} tint={tint} onPress={() => void join()} />
              </View>
            </Animated.View>
          ) : beat === "gift" && relic ? (
            <Animated.View entering={giftIn} style={styles.gift} pointerEvents="none">
              <View style={{ shadowColor: rarityColor(relic.rarity), shadowOpacity: 0.8, shadowRadius: 24, shadowOffset: { width: 0, height: 0 } }}>
                <RelicArt kind={relic.kind} rarity={relic.rarity} size={120} />
              </View>
              <Text style={[styles.rarity, { color: rarityColor(relic.rarity) }]}>{relic.rarity.toUpperCase()}</Text>
              {relic.ability_text ? <Text style={styles.ability}>{relic.ability_text}</Text> : null}
            </Animated.View>
          ) : beat === "askLocation" && revealed ? (
            <Animated.View entering={FadeInDown}>
              <CalmButton
                title="Show me what's near"
                enabled
                tint={tint}
                onPress={() => {
                  void startLocation(true);
                  go("farewell");
                }}
              />
            </Animated.View>
          ) : (
            <TapHint show={revealed && beat !== "farewell"} />
          )}
        </View>
      </View>
    </View>
  );
}

/** "Tap to continue", faded in 1.5 s after the line has finished. */
function TapHint({ show }: { show: boolean }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const o = useSharedValue(0);
  const style = useAnimatedStyle(() => ({ opacity: o.get() }));
  // .easeIn(0.8).delay(1.5): a quick tap never flashes it.
  useEffect(() => {
    o.set(0);
    if (!show) return;
    const t = setTimeout(() => o.set(withTiming(0.4, { duration: 800, easing: Easing.in(Easing.quad) })), 1500);
    return () => clearTimeout(t);
  }, [show, o]);
  return (
    <Animated.Text style={[styles.hint, style]} pointerEvents="none" importantForAccessibility="no">
      Tap to continue
    </Animated.Text>
  );
}

/** A line the Warden is saying, arriving word by word; the words not yet said are laid out but clear, so it never reflows. */
function RevealLine({ text, id, revealed, onRevealed }: { text: string; id: number; revealed: boolean; onRevealed: () => void }) {
  const look = useLook();
  const styles = useThemedStyles(STYLE_PAIR);
  const words = wordsOf(text);
  const [shown, setShown] = useState({ id, n: 0 });
  const n = revealed ? words.length : shown.id === id ? shown.n : 0;
  useEffect(() => {
    if (revealed) return;
    let i = 0;
    const t = setInterval(() => {
      i += 1;
      setShown({ id, n: i });
      if (i >= words.length) {
        clearInterval(t);
        onRevealed();
      }
    }, WORD_MS);
    return () => clearInterval(t);
  }, [id, revealed]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Text style={styles.line} maxFontSizeMultiplier={MAX_FONT_SCALE} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      {words.map((w, i) => (
        <Text key={i} style={{ color: i < n ? look.text : "transparent" }}>
          {i === 0 ? w : ` ${w}`}
        </Text>
      ))}
    </Text>
  );
}

/** The Warden itself, with a halo that breathes in the house colour. */
function Presence({ tint, awake, size }: { tint: string; awake: boolean; size: number }) {
  const reduce = useReducedMotion();
  const wake = useSharedValue(awake ? 1 : 0);
  const breath = useSharedValue(0);
  useEffect(() => {
    wake.set(withTiming(awake ? 1 : 0, { duration: 1800, easing: Easing.inOut(Easing.quad) }));
  }, [awake, wake]);
  useEffect(() => {
    if (!reduce) breath.set(withRepeat(withTiming(1, { duration: 2400, easing: Easing.inOut(Easing.sin) }), -1, true));
  }, [reduce, breath]);
  const halo = useAnimatedStyle(() => ({
    opacity: 0.05 + 0.17 * wake.get(),
    transform: [{ scale: 1 + 0.06 * breath.get() }],
  }));
  const badge = useAnimatedStyle(() => ({ opacity: 0.25 + 0.75 * wake.get(), transform: [{ scale: 0.85 + 0.15 * wake.get() }] }));
  const haloSize = size * 1.75;
  return (
    <View style={{ alignItems: "center", justifyContent: "center", height: haloSize }} pointerEvents="none" importantForAccessibility="no-hide-descendants">
      <Animated.View style={[{ position: "absolute", width: haloSize, height: haloSize, borderRadius: haloSize / 2, backgroundColor: tint }, halo]} />
      <Animated.View style={badge}>
        <WardenBadge tint={tint} size={size} />
      </Animated.View>
    </View>
  );
}

/** One of the five houses, as a glowing orb. */
function HouseOrb({ id, name, chosen, onPress }: { id: string; name: string; chosen: boolean; onPress: () => void }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const look = useLook();
  const colour = realmColor(id);
  const scale = useSharedValue(chosen ? 1.12 : 1);
  useEffect(() => {
    scale.set(withSpring(chosen ? 1.12 : 1, settle(0.35)));
  }, [chosen, scale]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  return (
    <Pressable onPress={onPress} accessibilityRole="radio" accessibilityLabel={name} accessibilityState={{ selected: chosen }} style={{ flex: 1, maxWidth: 72 }}>
      <Animated.View style={[{ alignItems: "center", gap: 8 }, style]}>
        <View
          style={[
            styles.orb,
            {
              backgroundColor: colour,
              borderColor: chosen ? look.text : "#FFFFFF",
              borderWidth: chosen ? 3 : 1.5,
              shadowColor: colour,
              shadowOpacity: chosen ? 0.6 : 0.25,
              shadowRadius: chosen ? 12 : 4,
            },
          ]}>
          <Ionicons name={realmIcon(id)} size={22} color={labelOn(colour)} />
        </View>
        <Text style={[styles.orbName, chosen && styles.orbNameOn]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
          {name}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

/** The step's one action: the kit's primary (flat Sun on its 4 px edge, ink label). `tint` is the house's, kept for the call sites. */
function CalmButton({ title, enabled, onPress }: { title: string; enabled: boolean; tint: string; onPress: () => void }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const face = enabled ? ACCENT.sun.fill : "#C9C1B2";
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => enabled && pressFeedback()}
      disabled={!enabled}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !enabled }}>
      {({ pressed }) => (
        <View style={{ paddingBottom: 4 }}>
          <View style={[StyleSheet.absoluteFill, { top: 4, borderRadius: RADIUS.button, backgroundColor: edgeColor(face) }]} />
          <View style={[styles.calm, { backgroundColor: face, transform: [{ translateY: pressed && enabled ? 3 : 0 }] }]}>
            <Text style={[styles.calmText, { color: enabled ? ACCENT.sun.label : "#5A6878" }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>
              {title}
            </Text>
          </View>
        </View>
      )}
    </Pressable>
  );
}

/** Morning white, with the house colour drifting upward through it (WardenDawn). */
function Dawn({ tint, awake }: { tint: string; awake: boolean }) {
  const { width, height } = useWindowDimensions();
  const reduce = useReducedMotion();
  const look = useLook();
  const t = useSharedValue(0);
  useFrameCallback((f) => {
    if (!reduce) t.set(t.get() + (f.timeSincePreviousFrame ?? 16) / 1000);
  });
  const wake = useSharedValue(awake ? 1 : 0.4);
  useEffect(() => {
    wake.set(withTiming(awake ? 1 : 0.4, { duration: 2000 }));
  }, [awake, wake]);
  const field = useAnimatedStyle(() => ({ opacity: wake.get() }));
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient colors={[look.screen, look.screen, withAlpha(tint, awake ? 0.14 : 0.04)]} style={StyleSheet.absoluteFill} />
      <Animated.View style={[StyleSheet.absoluteFill, field]}>
        <Svg width={width} height={height}>
          {MOTES.map((m, i) => (
            <MoteDot key={i} m={m} t={t} width={width} height={height} color={m.slate ? GP.slate : tint} />
          ))}
        </Svg>
      </Animated.View>
    </View>
  );
}

function MoteDot({ m, t, width, height, color }: { m: (typeof MOTES)[number]; t: SharedValue<number>; width: number; height: number; color: string }) {
  const props = useAnimatedProps(() => {
    const p = (m.x0 + t.get() * m.speed) % 1;
    return {
      cx: width * (m.x0 + 0.03 * Math.sin(t.get() * 0.4 + m.seed)),
      cy: height * (1.05 - p * 1.1),
      opacity: 0.4 * Math.sin(p * Math.PI),
    };
  });
  return <AnimatedCircle r={m.r / 2} fill={color} animatedProps={props} />;
}

const L = SURFACES.light;
const D = SURFACES.dark;

const STYLE_PAIR = themedStyles(
  {
    root: { ...StyleSheet.absoluteFill, backgroundColor: L.screen },
    column: { flex: 1 },
    topBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 8 },
    topButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
    skip: { height: 44, paddingHorizontal: 16, justifyContent: "center" },
    skipText: { fontFamily: GF.bold, fontSize: 15, lineHeight: 19, color: L.textMuted },
    line: { fontFamily: GF.display, fontSize: 28, lineHeight: 34, textAlign: "center" },
    hint: { fontFamily: GF.regular, fontSize: 15, lineHeight: 21, color: L.textMuted, textAlign: "center" },
    nameInput: { fontFamily: GF.display, fontSize: 30, color: L.text, textAlign: "center", paddingBottom: 8 },
    nameRule: { height: 2, borderRadius: 1 },
    problem: { fontFamily: GF.body, fontSize: 14, lineHeight: 19, color: TEXT_ON_LIGHT.danger, textAlign: "center" },
    orbs: { flexDirection: "row", justifyContent: "center", gap: 12 },
    orb: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", shadowOffset: { width: 0, height: 3 }, elevation: 4 },
    orbName: { fontFamily: GF.body, fontSize: 12, lineHeight: 16, color: L.textMuted },
    orbNameOn: { fontFamily: GF.bold, color: L.text },
    gift: { alignItems: "center", gap: 10 },
    rarity: { fontFamily: GF.bold, fontSize: 13, lineHeight: 17, letterSpacing: 1.2 },
    ability: { fontFamily: GF.regular, fontSize: 15, lineHeight: 21, color: L.textMuted, textAlign: "center" },
    calm: { height: 56, borderRadius: RADIUS.button, alignItems: "center", justifyContent: "center" },
    calmText: { fontFamily: GF.display, fontSize: 20, lineHeight: 24 },
  },
  {
    root: { backgroundColor: D.screen },
    skipText: { color: D.textMuted },
    hint: { color: D.textMuted },
    nameInput: { color: D.text },
    problem: { color: TEXT_ON_DARK.danger },
    orbName: { color: D.textMuted },
    orbNameOn: { color: D.text },
    ability: { color: D.textMuted },
  },
);
