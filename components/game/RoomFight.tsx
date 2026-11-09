// A Room's fight, in 2D: the arena the server laid out around the host
// (weapons, shrines, chests), everyone on the live map, you with the way your
// phone points, and the one action that fits the moment: fire at the rival
// you are pointing at, pick up the weapon you are standing on, take the
// shrine, open the chest, or respawn. Then how it went.
//
// costquest-ios UI/GameHUD.swift (the action bar, the downed screen),
// Game/Targeting.swift (aim), Map/FieldMapView.swift (the overhead field) and
// UI/ResultsView.swift. iOS draws the arena in AR; this draws it as a map.
// Nothing here decides an outcome: every action goes to the server's engine
// and the screen shows its verdict (roomsSession.ts).
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, BackHandler, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Path } from "react-native-svg";

import { distanceText, toLocal, type LatLng } from "@/features/game/geo";
import type { Fix } from "@/features/game/store";
import {
  aimTargets,
  ANCHOR_REACH_M,
  anchorTitle,
  type GameAnchor,
  fightOver,
  nearestActionable,
  nearestAnchor,
  respawnSecondsLeft,
  type Target,
  timeLeft,
} from "@/features/game/rooms";
import { useHeading } from "@/features/game/roomsRuntime";
import type { RoomSession, RoomSessionState } from "@/features/game/roomsSession";
import { gameStore, useGame } from "@/features/game/runtime";

import { GameButton, GameTitle, ProgressBar } from "./kit";
import { CHOICE_COLORS, edgeOf, GF, GP } from "./theme";
import { themedStyles, useThemedStyles } from "@/constants/chatTheme";
import { usePopIn } from "./sheetMotion";

/** Metres from the arena's centre to the edge of the drawn field (anchors are 3 to 12 m out). */
const FIELD_M = 18;
const POSITION_TICK_MS = 2000;
const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

export default function RoomFight({
  session,
  state,
  parked,
  onLeave,
  onDone,
}: {
  session: RoomSession;
  state: RoomSessionState;
  /** The chat is in front: no compass, no ticking, no position pings. */
  parked: boolean;
  /** The leave button (asks first). */
  onLeave: () => void;
  /** Out of the results. */
  onDone: () => void;
}) {
  const styles = useThemedStyles(STYLE_PAIR);
  const insets = useSafeAreaInsets();
  const fix = useGame((s) => s.fix);
  const { terms, anchors, fight } = state;
  const over = fightOver(fight);
  const heading = useHeading(!over && !parked);
  const [now, setNow] = useState(() => Date.now());
  const [trivia, setTrivia] = useState<GameAnchor | null>(null);
  const [pending, setPending] = useState(false);
  const [busyAnchor, setBusyAnchor] = useState<string | null>(null);

  // The clock for countdowns.
  useEffect(() => {
    if (parked) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [parked]);

  // Position on the live link: on every new fix, and every two seconds while
  // standing still so the live map keeps you (the session throttles to 1 Hz).
  // The whole fix, so the server is told how good and how old it is (fixInfo.ts).
  const latest = useRef<{ fix: Fix | null; heading: number | null }>({ fix: null, heading: null });
  useEffect(() => {
    latest.current = { fix: fix ?? null, heading };
    session.setPosition(latest.current.fix, heading);
  }, [fix, heading, session]);
  useEffect(() => {
    if (over || parked) return;
    const t = setInterval(() => session.setPosition(latest.current.fix, latest.current.heading), POSITION_TICK_MS);
    return () => clearInterval(t);
  }, [session, over, parked]);

  // Back on a chest's question closes the question, not the game (this
  // listener is newer than RoomScreen's).
  useEffect(() => {
    if (!trivia || parked) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      setTrivia(null);
      return true;
    });
    return () => sub.remove();
  }, [trivia, parked]);

  // A refreshed standing once it is over: the server pays Room XP when it settles.
  useEffect(() => {
    if (over) void gameStore.refreshMe();
  }, [over]);

  const here: LatLng | null = fix ? { lat: fix.lat, lng: fix.lng } : null;
  const targets = aimTargets({ here, heading, playerId: fight.playerId, faction: fight.faction, map: fight.map, players: fight.players });
  const target = fight.state === "active" ? targets[0] ?? null : null;
  const actionable = fight.state === "active" ? nearestActionable(anchors, here) : null;
  const colorOf = (side: string | null | undefined) => terms?.factions.find((f) => f.name === side)?.color ?? GP.slate;
  const mine = colorOf(fight.faction);

  const fire = (t: Target) => {
    if (!fight.held || pending) return;
    setPending(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    // The outbox can hold a shot while offline: the button recovers within six seconds whatever happens.
    const cap = setTimeout(() => setPending(false), 6000);
    session.hit(t.id, t.distance).finally(() => {
      clearTimeout(cap);
      setPending(false);
    });
  };

  const act = (a: GameAnchor) => {
    if (a.kind === "trivia") return setTrivia(a);
    setBusyAnchor(a.id);
    const done = () => setBusyAnchor(null);
    (a.kind === "weapon" ? session.pickUp(a) : session.capture(a.id)).finally(done);
  };

  if (over) return <Results state={state} onDone={onDone} />;

  return (
    <View style={[styles.root, { paddingTop: insets.top + 6 }]}>
      <View style={styles.top}>
        <Pressable onPress={onLeave} style={styles.leave} accessibilityRole="button" accessibilityLabel="Leave the game" hitSlop={8}>
          <Ionicons name="close" size={20} color="#FFF" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>
            {terms?.title ?? "Room"}
          </Text>
          <View style={styles.statusRow}>
            <View style={[styles.dot, { backgroundColor: fight.connected ? GP.mint : GP.sun }]} />
            <Text style={styles.status}>
              {fight.connected ? "Live" : "Reconnecting…"} · {timeLeft(terms?.ends_at, now)}
            </Text>
          </View>
        </View>
        <View style={[styles.tokens, { borderColor: mine }]} accessibilityLabel={`${fight.tokens} tokens`}>
          <Ionicons name="diamond" size={16} color={GP.sun} />
          <Text style={styles.tokensText}>{fight.tokens}</Text>
        </View>
      </View>

      <Scores state={state} colorOf={colorOf} />

      <Field anchors={anchors} state={state} here={here} heading={heading} accuracy={fix?.accuracy ?? null} target={target} colorOf={colorOf} />

      <View style={styles.chipsRow}>
        <View style={styles.hudChip}>
          <Ionicons name={fight.held ? "hammer" : "hand-left"} size={14} color="#FFF" />
          <Text style={styles.hudChipText}>{fight.held ? fight.held.name : "No weapon"}</Text>
        </View>
        <View style={styles.hudChip}>
          <Ionicons name="navigate" size={14} color="#FFF" />
          <Text style={styles.hudChipText}>{fix ? `GPS ±${Math.round(fix.accuracy)} m` : "Finding you…"}</Text>
        </View>
        {heading === null ? (
          <View style={[styles.hudChip, { backgroundColor: GP.sunDeep }]}>
            <Ionicons name="compass" size={14} color="#FFF" />
            <Text style={styles.hudChipText}>No compass yet</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.feed} accessibilityLiveRegion="polite">
        {fight.feed.slice(0, 3).map((f, i) => (
          <Text key={f.id} style={[styles.feedText, f.refusal && { color: "#FFD7A8" }, { opacity: 1 - i * 0.25 }]} numberOfLines={1}>
            {f.text}
          </Text>
        ))}
      </View>

      <View style={[styles.actions, { paddingBottom: insets.bottom + 14 }]}>
        {fight.state !== "active" ? (
          <Downed state={state} now={now} onRespawn={() => session.respawn()} />
        ) : target ? (
          <View style={{ gap: 10 }}>
            <View style={styles.targetChip}>
              <Ionicons name="locate" size={16} color="#FFF" />
              <Text style={styles.targetName} numberOfLines={1}>
                {target.label}
              </Text>
              <Text style={styles.targetRange}>~{Math.round(target.distance)} m</Text>
              {/* Said, not hidden: a GPS range is five metres wide. */}
              <Text style={styles.gpsTag}>GPS</Text>
            </View>
            <GameButton
              title={pending ? "FIRING" : fight.held ? "FIRE!" : "Find a weapon first"}
              color={fight.held ? GP.berry : "#808080"}
              disabled={!fight.held || pending}
              onPress={() => fire(target)}
              icon={pending ? <ActivityIndicator color="#FFF" /> : <Ionicons name={fight.held ? "locate" : "hand-left"} size={20} color="#FFF" />}
              accessibilityLabel={fight.held ? `Fire at ${target.label}` : "Find a weapon first"}
            />
          </View>
        ) : actionable ? (
          <GameButton
            title={anchorTitle(actionable.anchor, fight.captures, fight.faction)}
            color={actionable.anchor.kind === "trivia" ? GP.skyDeep : actionable.anchor.kind === "weapon" ? GP.sunDeep : GP.mint}
            disabled={busyAnchor === actionable.anchor.id || (actionable.anchor.kind === "capture_point" && !!fight.faction && fight.captures[actionable.anchor.id] === fight.faction)}
            onPress={() => act(actionable.anchor)}
            icon={busyAnchor === actionable.anchor.id ? <ActivityIndicator color="#FFF" /> : <Ionicons name={anchorIcon(actionable.anchor.kind)} size={20} color="#FFF" />}
          />
        ) : (
          <Hint anchors={anchors} here={here} held={!!fight.held} heading={heading} />
        )}
      </View>

      {fight.moment ? <MomentToast key={fight.moment.id} text={fight.moment.text} tone={fight.moment.tone} feel={fight.moment.feel} /> : null}

      {trivia ? (
        <TriviaPanel
          anchor={trivia}
          onClose={() => setTrivia(null)}
          onAnswer={(i) => {
            setTrivia(null);
            void session.answerTrivia(trivia.id, i);
          }}
        />
      ) : null}
    </View>
  );
}

function anchorIcon(kind: string): "help-circle" | "hammer" | "flag" | "hand-left" {
  return kind === "trivia" ? "help-circle" : kind === "weapon" ? "hammer" : kind === "capture_point" ? "flag" : "hand-left";
}

function anchorColor(kind: string): string {
  return kind === "trivia" ? GP.skyDeep : kind === "weapon" ? GP.sunDeep : GP.mint;
}

/** The sides, as the server ranks them. */
function Scores({ state, colorOf }: { state: RoomSessionState; colorOf: (s: string | null | undefined) => string }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const scores = state.fight.factionScores.filter((f) => f.tokens > 0 || f.faction === state.fight.faction).slice(0, 3);
  if (!scores.length) return null;
  const top = Math.max(1, ...scores.map((s) => s.tokens));
  return (
    <View style={styles.scores}>
      {scores.map((s) => (
        <View key={s.faction} style={styles.scoreRow} accessibilityLabel={`${s.faction}: ${s.tokens} tokens`}>
          <Text style={[styles.scoreName, s.faction === state.fight.faction && { textDecorationLine: "underline" }]} numberOfLines={1}>
            {s.faction}
          </Text>
          <View style={{ flex: 1 }}>
            <ProgressBar value={s.tokens / top} color={colorOf(s.faction)} />
          </View>
          <Text style={styles.scoreValue}>{s.tokens}</Text>
        </View>
      ))}
    </View>
  );
}

/** The arena from above, north up, centred on where the Room was started. */
function Field({
  anchors,
  state,
  here,
  heading,
  accuracy,
  target,
  colorOf,
}: {
  anchors: GameAnchor[];
  state: RoomSessionState;
  here: LatLng | null;
  heading: number | null;
  accuracy: number | null;
  target: Target | null;
  colorOf: (s: string | null | undefined) => string;
}) {
  const styles = useThemedStyles(STYLE_PAIR);
  const { width, height } = useWindowDimensions();
  const size = Math.min(width - 24, height * 0.46);
  const centre: LatLng | null = state.terms?.venue ? { lat: state.terms.venue.lat, lng: state.terms.venue.lng } : anchors[0] ?? here;
  const ppm = size / 2 / FIELD_M;
  const { fight } = state;
  if (!centre) return <View style={{ width: size, height: size }} />;

  /** Screen position, held to the edge of the field when further out. */
  const place = (p: LatLng) => {
    const l = toLocal(centre, p);
    const d = Math.hypot(l.x, l.z);
    const k = d > FIELD_M - 1 ? (FIELD_M - 1) / d : 1;
    return { x: size / 2 + l.x * k * ppm, y: size / 2 - l.z * k * ppm, clamped: k < 1 };
  };
  const me = here ? place(here) : null;
  const cone = (() => {
    if (!me || heading === null) return null;
    const r = 30 * ppm;
    const a1 = ((heading - 35) * Math.PI) / 180;
    const a2 = ((heading + 35) * Math.PI) / 180;
    return `M${me.x} ${me.y} L${me.x + r * Math.sin(a1)} ${me.y - r * Math.cos(a1)} A${r} ${r} 0 0 1 ${me.x + r * Math.sin(a2)} ${me.y - r * Math.cos(a2)} Z`;
  })();

  return (
    <View style={[styles.field, { width: size, height: size }]} accessibilityLabel="The arena from above, north up">
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={size / 2 - 1} fill="#E9F0E0" />
        <Circle cx={size / 2} cy={size / 2} r={12 * ppm} fill="none" stroke="#CBD8C0" strokeWidth={1.5} strokeDasharray="4 6" />
        <Circle cx={size / 2} cy={size / 2} r={6 * ppm} fill="none" stroke="#CBD8C0" strokeWidth={1.5} strokeDasharray="4 6" />
        {cone ? <Path d={cone} fill={GP.berry} fillOpacity={0.12} stroke={GP.berry} strokeOpacity={0.4} strokeWidth={1.5} /> : null}
        {me ? <Circle cx={me.x} cy={me.y} r={ANCHOR_REACH_M * ppm} fill="none" stroke={colorOf(fight.faction)} strokeOpacity={0.6} strokeWidth={2} strokeDasharray="5 5" /> : null}
        {me && accuracy !== null ? <Circle cx={me.x} cy={me.y} r={Math.min(size / 2, accuracy * ppm)} fill={GP.skyDeep} fillOpacity={0.08} /> : null}
      </Svg>
      <Text style={[styles.north, { left: size / 2 - 5 }]}>N</Text>

      {anchors.map((a) => {
        const p = place(a);
        const owner = fight.captures[a.id];
        return (
          <View
            key={a.id}
            style={[styles.anchor, { left: p.x - 17, top: p.y - 17, backgroundColor: anchorColor(a.kind), borderColor: owner ? colorOf(owner) : "#FFF" }]}
            accessibilityLabel={`${a.kind === "weapon" ? a.payload.name ?? "Weapon" : a.kind === "capture_point" ? a.payload.label ?? "Shrine" : "Chest"}${owner ? `, held by ${owner}` : ""}`}>
            <Ionicons name={anchorIcon(a.kind)} size={16} color="#FFF" />
          </View>
        );
      })}

      {Object.entries(fight.map).map(([id, p]) => {
        if (id === fight.playerId) return null;
        const q = place(p);
        const side = fight.players[id]?.faction ?? p.faction;
        const active = (fight.players[id]?.state ?? p.state) === "active";
        const aimed = target?.id === id;
        return (
          <View
            key={id}
            style={[styles.rival, { left: q.x - 9, top: q.y - 9, backgroundColor: active ? colorOf(side) : "#9AA7B0", borderColor: aimed ? GP.sun : "#FFF", transform: [{ scale: aimed ? 1.3 : 1 }] }]}
            accessibilityLabel={`${fight.players[id]?.handle ?? "A rival"}, ${side ?? "no side"}${active ? "" : ", down"}`}
          />
        );
      })}

      {me ? (
        <View style={[styles.me, { left: me.x - 12, top: me.y - 12, backgroundColor: colorOf(fight.faction) }]} accessibilityLabel="You">
          {heading !== null ? <Ionicons name="navigate" size={13} color="#FFF" style={{ transform: [{ rotate: `${heading - 45}deg` }] }} /> : null}
        </View>
      ) : null}
    </View>
  );
}

/** Where to go next, when there is nothing to do right here. */
function Hint({ anchors, here, held, heading }: { anchors: GameAnchor[]; here: LatLng | null; held: boolean; heading: number | null }) {
  const styles = useThemedStyles(STYLE_PAIR);
  let text: string;
  if (!here) text = "Finding you…";
  else if (!held) {
    const w = nearestAnchor(anchors, here, "weapon");
    text = w ? `Nearest weapon: ${distanceText(w.distance)} ${COMPASS[Math.round(w.bearing / 45) % 8]}. Walk onto it.` : "No weapons in this Room.";
  } else if (heading === null) text = "Aiming needs the compass. Move the phone in a figure of eight.";
  else text = "Point your phone at a rival to aim, or take a shrine.";
  return (
    <View style={styles.hint}>
      <Ionicons name="walk" size={18} color="#FFF" />
      <Text style={styles.hintText}>{text}</Text>
    </View>
  );
}

function Downed({ state, now, onRespawn }: { state: RoomSessionState; now: number; onRespawn: () => Promise<unknown> }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const [asking, setAsking] = useState(false);
  const left = respawnSecondsLeft(state.fight, now);
  const out = state.fight.state === "eliminated";
  return (
    <View style={styles.downed}>
      <GameTitle text={out ? "You're out" : "DOWN!"} size={28} />
      <Text style={styles.downedText}>{out ? "No respawns left in this Room." : left ? `You can respawn in ${left}s.` : "Hang tight, then come back in."}</Text>
      {!out ? (
        <GameButton
          title={asking ? "Asking…" : "Respawn"}
          color={GP.mint}
          disabled={asking || (left !== null && left > 0)}
          onPress={() => {
            setAsking(true);
            onRespawn().finally(() => setAsking(false));
          }}
          icon={<Ionicons name="refresh" size={18} color="#FFF" />}
        />
      ) : null}
    </View>
  );
}

function MomentToast({ text, tone, feel }: { text: string; tone: "good" | "bad"; feel?: "heavy" | "medium" }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const enter = usePopIn();
  const [shown, setShown] = useState(true);
  useEffect(() => {
    // FieldModel: damage .heavy, a pickup .medium at full intensity, captures .success.
    if (feel) Haptics.impactAsync(feel === "heavy" ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    else Haptics.notificationAsync(tone === "good" ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error).catch(() => {});
    const t = setTimeout(() => setShown(false), 1800);
    return () => clearTimeout(t);
  }, [tone, feel]);
  if (!shown) return null;
  const color = tone === "good" ? GP.mint : GP.berry;
  return (
    <Animated.View entering={enter} exiting={FadeOut} pointerEvents="none" style={styles.momentWrap}>
      <View style={[styles.moment, { backgroundColor: color, borderBottomColor: edgeOf(color) }]}>
        <Text style={styles.momentText}>{text}</Text>
      </View>
    </Animated.View>
  );
}

/** A chest's question: the answer stays on the server, which judges it. */
function TriviaPanel({ anchor, onAnswer, onClose }: { anchor: GameAnchor; onAnswer: (i: number) => void; onClose: () => void }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const insets = useSafeAreaInsets();
  return (
    <Animated.View entering={FadeIn} exiting={FadeOut} style={[StyleSheet.absoluteFill, styles.scrim]}>
      <View style={[styles.trivia, { paddingBottom: insets.bottom + 18 }]}>
        <View style={styles.triviaHead}>
          <Text style={styles.triviaKicker}>SUPPLY CHEST</Text>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close the question">
            <Ionicons name="close" size={22} color={GP.ink} />
          </Pressable>
        </View>
        <Text style={styles.triviaQ}>{anchor.payload.q ?? "A question"}</Text>
        <ScrollView contentContainerStyle={{ gap: 10 }}>
          {(anchor.payload.choices ?? []).map((c, i) => (
            <GameButton key={i} title={c} color={CHOICE_COLORS[i % CHOICE_COLORS.length]} onPress={() => onAnswer(i)} accessibilityLabel={`Answer: ${c}`} />
          ))}
        </ScrollView>
        <Text style={styles.small}>One answer per chest.</Text>
      </View>
    </Animated.View>
  );
}

/** How it went, from the server's last scoreboard. */
function Results({ state, onDone }: { state: RoomSessionState; onDone: () => void }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const insets = useSafeAreaInsets();
  const { fight, terms } = state;
  const place = fight.faction ? fight.factionScores.findIndex((f) => f.faction === fight.faction) + 1 : 0;
  const colorOf = (side: string) => terms?.factions.find((f) => f.name === side)?.color ?? GP.slate;
  return (
    <View style={[styles.root, { paddingTop: insets.top + 24, paddingHorizontal: 18, gap: 16 }]}>
      <GameTitle text={fight.gameStatus === "cancelled" ? "The Room was called off" : "The Room is over"} size={30} />
      <Text style={styles.resultsLine}>
        {fight.faction && place ? `${fight.faction} finished ${ordinal(place)} of ${fight.factionScores.length}. ` : ""}You ended with {fight.tokens} tokens.
      </Text>
      <View style={styles.resultsBoard}>
        {fight.factionScores.map((f, i) => (
          <View key={f.faction} style={styles.scoreRow}>
            <Text style={styles.resultsPlace}>{i + 1}</Text>
            <View style={[styles.swatch, { backgroundColor: colorOf(f.faction) }]} />
            <Text style={[styles.resultsName, f.faction === fight.faction && { color: GP.sun }]}>{f.faction}</Text>
            <Text style={styles.scoreValue}>{f.tokens}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.small}>Room XP is paid when the server settles the Room, if anyone else joined. It shows on your level in the journal.</Text>
      <GameButton title="Back to the map" color={GP.mint} onPress={onDone} />
    </View>
  );
}

function ordinal(n: number): string {
  return n === 1 ? "first" : n === 2 ? "second" : n === 3 ? "third" : `${n}th`;
}

const STYLE_PAIR = themedStyles({
  root: { ...StyleSheet.absoluteFill, backgroundColor: GP.navy, alignItems: "stretch" },
  top: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingBottom: 8 },
  leave: { width: 40, height: 40, borderRadius: 20, backgroundColor: GP.berry, alignItems: "center", justifyContent: "center" },
  title: { fontFamily: GF.display, fontSize: 18, color: "#FFF" },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  status: { fontFamily: GF.bold, fontSize: 12, color: "rgba(255,255,255,0.8)" },
  tokens: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, height: 40, borderRadius: 20, borderWidth: 3, backgroundColor: "rgba(255,255,255,0.12)" },
  tokensText: { fontFamily: GF.display, fontSize: 20, color: "#FFF" },
  scores: { paddingHorizontal: 16, gap: 6, marginBottom: 8 },
  scoreRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  scoreName: { width: 72, fontFamily: GF.bold, fontSize: 12, color: "#FFF" },
  scoreValue: { width: 44, textAlign: "right", fontFamily: GF.display, fontSize: 14, color: "#FFF" },
  field: { alignSelf: "center", borderRadius: 999, overflow: "hidden", backgroundColor: "#E9F0E0" },
  north: { position: "absolute", top: 4, fontFamily: GF.display, fontSize: 12, color: GP.mist },
  anchor: { position: "absolute", width: 34, height: 34, borderRadius: 17, borderWidth: 3, alignItems: "center", justifyContent: "center", elevation: 3 },
  rival: { position: "absolute", width: 18, height: 18, borderRadius: 9, borderWidth: 3, elevation: 4 },
  me: { position: "absolute", width: 24, height: 24, borderRadius: 12, borderWidth: 3, borderColor: "#FFF", alignItems: "center", justifyContent: "center", elevation: 6 },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8, marginTop: 10 },
  hudChip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, height: 28, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.15)" },
  hudChipText: { fontFamily: GF.bold, fontSize: 12, color: "#FFF" },
  feed: { flex: 1, justifyContent: "flex-end", paddingHorizontal: 18, gap: 2, minHeight: 50 },
  feedText: { fontFamily: GF.body, fontSize: 13, color: "#FFF" },
  actions: { paddingHorizontal: 16, paddingTop: 8 },
  targetChip: { flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "center", paddingHorizontal: 14, height: 36, borderRadius: 18, backgroundColor: "rgba(0,0,0,0.35)" },
  targetName: { fontFamily: GF.bold, fontSize: 15, color: "#FFF", maxWidth: 160 },
  targetRange: { fontFamily: GF.body, fontSize: 14, color: "rgba(255,255,255,0.8)" },
  gpsTag: { fontFamily: GF.display, fontSize: 9, color: "#FFF", paddingHorizontal: 5, paddingVertical: 1, borderRadius: 6, backgroundColor: "rgba(255,255,255,0.18)", overflow: "hidden" },
  hint: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.12)" },
  hintText: { flex: 1, fontFamily: GF.body, fontSize: 14, color: "#FFF" },
  downed: { gap: 10, alignItems: "stretch", padding: 16, borderRadius: 20, backgroundColor: "rgba(217,56,64,0.35)" },
  downedText: { fontFamily: GF.body, fontSize: 15, color: "#FFF" },
  momentWrap: { position: "absolute", top: "38%", left: 0, right: 0, alignItems: "center" },
  moment: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 20, borderBottomWidth: 5 },
  momentText: { fontFamily: GF.display, fontSize: 22, color: "#FFF" },
  scrim: { backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  trivia: { maxHeight: "80%", padding: 18, gap: 14, borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: GP.cream },
  triviaHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  triviaKicker: { fontFamily: GF.display, fontSize: 12, letterSpacing: 1.4, color: GP.skyDeep },
  triviaQ: { fontFamily: GF.display, fontSize: 22, color: GP.ink },
  small: { fontFamily: GF.regular, fontSize: 12, color: GP.slate },
  resultsLine: { fontFamily: GF.body, fontSize: 16, color: "#FFF" },
  resultsBoard: { gap: 10, padding: 16, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.1)" },
  resultsPlace: { width: 20, fontFamily: GF.display, fontSize: 16, color: "#FFF" },
  swatch: { width: 14, height: 14, borderRadius: 7 },
  resultsName: { flex: 1, fontFamily: GF.bold, fontSize: 15, color: "#FFF" },
});
