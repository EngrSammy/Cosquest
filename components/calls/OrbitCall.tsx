// ==========================================
// ORBITAL GROUP CALL (Group Calls doc · "A · Light Orbit" / "B · Night Orbit")
// ==========================================
// Everyone is a circle; there are no squares anywhere.
//  - Center: whoever is speaking now. When nobody is, the pinned person
//    (the call starter) holds it (pin badge).
//  - Inner ring: the most engaged people (who have talked the most lately).
//  - Outer ring: everyone else. Circles drift outward as people go quiet
//    and back in when they talk again, always animating, never snapping.
//  - Pulse: a glowing ring around everyone speaking.
//  - Ring color: rank (from the person's rank level), grey far out.
//  - Video on: the live picture inside the circle instead of the avatar.
// Used by CallSession (phones) and CallSession.web (browser) for group calls,
// and by the voice chats. In dark mode it switches to Night Orbit by itself.
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Alert, Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FONTS } from "@/constants/fonts";
import {
  DECAY,
  MOVE_MS,
  TICK_MS,
  holdCenter,
  layoutKey,
  pickCenter,
  placeOrbit,
  type Box,
  type CenterHold,
} from "@/components/calls/orbitLayout";
import { DARK_SCREEN_GRADIENT, themedStyles, useInk, useThemedStyles } from "@/constants/chatTheme";

const INK = "#24283C";
const MUTED = "#66738A";
const PINK = "#B63D91";
const BLUE = "#2E9BF0";
const GREEN = "#22C55E";
const GREY = "#B9C0CC";

export type OrbitPerson = {
  id: string;
  name: string;
  avatar?: any; // an expo-image source, or null for initials
  speaking: boolean;
  micOff: boolean;
  ringing?: boolean;
  isMe?: boolean;
  rankLevel?: number | null; // 1 (lowest) ... 9 (highest)
  hasVideo?: boolean;
  // Identity card (tap a circle).
  username?: string | null;
  rankName?: string | null;
  factionName?: string | null;
  // In a private call: translucent circle with the away marker.
  away?: boolean;
};

// Rank -> ring color (doc: "circle color identifies leadership rank").
// Placeholder set until Mark confirms the full rank color list.
function rankColor(level?: number | null) {
  if (!level || level <= 2) return BLUE;
  if (level <= 5) return GREEN;
  if (level <= 7) return "#8B5CF6";
  return PINK;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || "?") + (parts[1]?.[0] || "")).toUpperCase();
}

// ---------------------------------------------------------------------
// Engagement and layout: components/calls/orbitLayout.ts
// ---------------------------------------------------------------------
// Scores tick every 500 ms, but the orbit only re-renders when the layout
// actually changes (someone moves ring or takes the middle). It used to
// re-render twice a second for the whole call, live videos included.
function useOrbitLayout(people: OrbitPerson[], pinnedId: string | null, box: Box) {
  const scores = useRef(new Map<string, number>());
  const center = useRef<CenterHold | null>(null);
  const shownKey = useRef("");
  const [, setVersion] = useState(0);
  const latest = useRef({ people, pinnedId, box });
  latest.current = { people, pinnedId, box };

  const resolveCenter = (now: number) => {
    const { people: list, pinnedId: pinned } = latest.current;
    center.current = holdCenter(center.current, list, pickCenter(list, pinned, scores.current), now);
    return center.current?.id ?? null;
  };

  useEffect(() => {
    const timer = setInterval(() => {
      const next = new Map<string, number>();
      for (const person of latest.current.people) {
        const before = scores.current.get(person.id) || 0;
        next.set(person.id, before * DECAY + (person.speaking ? 1 : 0));
      }
      scores.current = next;
      const { people: list, box: size } = latest.current;
      const key = layoutKey(placeOrbit(list, size, next, resolveCenter(Date.now())), size);
      if (key !== shownKey.current) setVersion((v) => v + 1);
    }, TICK_MS);
    return () => clearInterval(timer);
    // resolveCenter only reads refs.
  }, []);

  const placed = placeOrbit(people, box, scores.current, resolveCenter(Date.now()));
  shownKey.current = layoutKey(placed, box);
  return placed;
}

// ---------------------------------------------------------------------
// One circle: animates to its slot, pulses while speaking.
// ---------------------------------------------------------------------
// memo: a new speaker re-renders only the circles whose person changed, not
// every live video in the orbit.
const OrbitCircle = memo(function OrbitCircle({
  person,
  x,
  y,
  size,
  color,
  pinned,
  faded,
  label,
  renderVideo,
  onTap,
}: {
  person: OrbitPerson;
  x: number;
  y: number;
  size: number;
  color: string;
  pinned: boolean;
  faded: boolean;
  label: boolean;
  renderVideo: (id: string) => ReactNode;
  onTap: (person: OrbitPerson) => void;
}) {
  const styles = useThemedStyles(STYLE_PAIR);
  const ink = useInk();
  const pos = useRef(new Animated.ValueXY({ x, y })).current;
  const dim = useRef(new Animated.Value(size)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  // Position and size are layout, so they can't use the native driver: a
  // short glide keeps the per-frame work (and the video resizing) brief.
  // (It was a soft spring that took over a second to settle.)
  useEffect(() => {
    const glide = { duration: MOVE_MS, easing: Easing.out(Easing.cubic), useNativeDriver: false };
    Animated.parallel([
      Animated.timing(pos, { ...glide, toValue: { x, y } }),
      Animated.timing(dim, { ...glide, toValue: size }),
    ]).start();
  }, [x, y, size, pos, dim]);

  // The speaking pulse is only opacity and scale, so it runs on the native
  // driver: no JS work per frame while someone talks (it used to run on the
  // JS thread for every speaker, the whole time they spoke).
  useEffect(() => {
    if (!person.speaking) {
      pulse.stopAnimation();
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [person.speaking, pulse]);

  // Built once per circle, not on every render.
  const frame = useMemo(() => {
    const half = Animated.multiply(dim, 0.5);
    return { left: Animated.subtract(pos.x, half), top: Animated.subtract(pos.y, half), width: dim, height: dim };
  }, [pos, dim]);
  const pulseStyle = useMemo(
    () => ({
      opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] }),
      transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.45] }) }],
    }),
    [pulse],
  );
  const ringColor = person.ringing || faded ? GREY : color;
  const fontSize = Math.max(11, Math.round(size * 0.28));
  const video = person.hasVideo ? renderVideo(person.id) : null;

  return (
    <Animated.View style={[styles.circleWrap, frame]}>
      {/* Pulse while speaking */}
      {person.speaking ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.pulse, { borderColor: ringColor }, pulseStyle]}
        />
      ) : null}
      {person.speaking ? <View pointerEvents="none" style={[styles.glow, { backgroundColor: ringColor }]} /> : null}

      <Pressable
        onPress={() => onTap(person)}
        accessibilityLabel={person.name}
        style={[
          styles.circle,
          {
            borderColor: ringColor,
            borderWidth: size >= 90 ? 3 : 2,
            borderStyle: person.ringing ? "dashed" : "solid",
            opacity: person.ringing ? 0.6 : person.away ? 0.5 : 1,
          },
        ]}>
        {person.hasVideo && video ? (
          <View style={styles.videoMask}>{video}</View>
        ) : person.avatar ? (
          <Image source={person.avatar} style={styles.avatar} contentFit="cover" cachePolicy="memory-disk" />
        ) : (
          <Text style={[styles.initials, { fontSize }]}>{initials(person.name)}</Text>
        )}
      </Pressable>

      {/* Pinned (call starter) */}
      {pinned ? (
        <View style={[styles.badge, styles.badgePin]}>
          <Ionicons name="pin" size={size >= 90 ? 15 : 11} color="#FFFFFF" />
        </View>
      ) : person.away ? (
        <View style={[styles.badge, styles.badgeAway]} accessibilityLabel="In a private call">
          <Ionicons name="remove" size={11} color="#FFFFFF" />
        </View>
      ) : person.micOff ? (
        <View style={[styles.badge, styles.badgeMuted]}>
          <Ionicons name="mic-off" size={10} color={ink.text(MUTED)} />
        </View>
      ) : null}

      {label ? (
        <Text style={styles.label} numberOfLines={1}>
          {person.isMe ? "You" : person.name.split(" ")[0]}
          {person.ringing ? " · ringing" : ""}
        </Text>
      ) : null}
    </Animated.View>
  );
});

// ---------------------------------------------------------------------
// The orbit
// ---------------------------------------------------------------------
// memo: the call timer and captions re-render the screen every second or
// so; the orbit (and the videos in it) only when people or cameras change.
const OrbitView = memo(function OrbitView({
  people,
  pinnedId,
  renderVideo,
  onTap,
}: {
  people: OrbitPerson[];
  pinnedId: string | null;
  renderVideo: (id: string) => ReactNode;
  onTap: (person: OrbitPerson) => void;
}) {
  const styles = useThemedStyles(STYLE_PAIR);
  const [box, setBox] = useState<Box>({ w: 0, h: 0 });
  const placed = useOrbitLayout(people, pinnedId, box);

  const hidden = Math.max(0, people.length - placed.length);
  const min = Math.min(box.w, box.h);

  return (
    <View
      style={styles.orbit}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        setBox((current) => (current.w === width && current.h === height ? current : { w: width, h: height }));
      }}>
      {/* Dotted guide rings */}
      {min ? (
        <>
          <View pointerEvents="none" style={[styles.guide, { width: min * 0.6, height: min * 0.6, borderRadius: min * 0.3, left: box.w / 2 - min * 0.3, top: box.h / 2 - min * 0.3 }]} />
          <View pointerEvents="none" style={[styles.guide, { width: min * 0.9, height: min * 0.9, borderRadius: min * 0.45, left: box.w / 2 - min * 0.45, top: box.h / 2 - min * 0.45 }]} />
        </>
      ) : null}

      {placed.map((slot) => (
        <OrbitCircle
          key={slot.person.id}
          person={slot.person}
          x={slot.x}
          y={slot.y}
          size={slot.size}
          color={rankColor(slot.person.rankLevel)}
          pinned={slot.person.id === pinnedId && slot.ring === "center"}
          faded={slot.ring === "outer" && !slot.person.speaking}
          label={slot.ring !== "outer"}
          renderVideo={renderVideo}
          onTap={onTap}
        />
      ))}

      {hidden ? (
        <View style={[styles.more, { left: box.w / 2 - 22, top: box.h - 30 }]}>
          <Text style={styles.moreText}>+{hidden}</Text>
        </View>
      ) : null}
    </View>
  );
});

// ---------------------------------------------------------------------
// The call screen (header, orbit, last line, controls)
// ---------------------------------------------------------------------
function ControlButton({
  icon,
  label,
  onPress,
  active,
  kind,
  disabled,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  active?: boolean;
  kind?: "sparks" | "leave";
  disabled?: boolean;
}) {
  const styles = useThemedStyles(STYLE_PAIR);
  const ink = useInk();
  const filled = kind === "leave" ? styles.btnLeave : kind === "sparks" ? styles.btnSparks : active ? styles.btnActive : null;
  const iconColor = kind || active ? "#FFFFFF" : ink.text(INK);
  return (
    <View style={styles.control}>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={[styles.btn, filled, disabled && styles.btnOff]}>
        <Ionicons name={icon} size={kind === "leave" ? 26 : 22} color={iconColor} />
      </Pressable>
      <Text style={styles.controlLabel}>{label}</Text>
    </View>
  );
}

export default function OrbitCallScreen({
  title,
  subtitle,
  people,
  pinnedId,
  renderVideo,
  micOn,
  cameraOn,
  focusOn,
  ended,
  onToggleMic,
  onToggleCamera,
  onFlipCamera,
  onToggleFocus,
  onLeave,
  onMinimize,
  onPeople,
  onSparks,
  onPrivateCall,
  extra,
}: {
  title: string;
  subtitle: string;
  people: OrbitPerson[];
  pinnedId: string | null;
  renderVideo: (id: string) => ReactNode;
  micOn: boolean;
  cameraOn: boolean;
  focusOn: boolean;
  ended: boolean;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  // Front / back camera. Without it the bar keeps the Share slot.
  onFlipCamera?: () => void;
  onToggleFocus: () => void;
  onLeave: () => void;
  onMinimize: () => void;
  onPeople: () => void;
  // Opens the call's Sparks (live transcript, topics). Without it: "coming soon".
  onSparks?: () => void;
  // Private call on top (needs the server). Without it: "coming soon".
  onPrivateCall?: (person: OrbitPerson) => void;
  extra?: ReactNode;
}) {
  const styles = useThemedStyles(STYLE_PAIR);
  const ink = useInk();
  const insets = useSafeAreaInsets();
  const speaker = people.find((p) => p.speaking && !p.isMe) || people.find((p) => p.speaking);
  const comingSoon = (what: string) => Alert.alert(what, `${what} is coming soon.`);

  // Tap a circle: identity card. Tap the same circle again: progress view.
  const [card, setCard] = useState<{ id: string; step: "card" | "progress" } | null>(null);
  const tapPerson = useCallback(
    (person: OrbitPerson) =>
      setCard((current) => (current?.id === person.id ? { id: person.id, step: "progress" } : { id: person.id, step: "card" })),
    [],
  );
  const cardPerson = card ? people.find((person) => person.id === card.id) || null : null;

  return (
    <LinearGradient colors={ink.dark ? [...DARK_SCREEN_GRADIENT] : ["#F4F8FD", "#E3F0FC"]} style={styles.screen}>
      {/* HEADER */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Pressable style={styles.roundBtn} onPress={onMinimize} accessibilityLabel="Minimize call">
          <Ionicons name="chevron-back" size={22} color={ink.text(INK)} />
        </Pressable>
        <View style={styles.headerText}>
          <View style={styles.titleRow}>
            <View style={styles.liveDot} />
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
          </View>
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
        <Pressable style={[styles.roundBtn, styles.roundBtnPink]} onPress={onPeople} accessibilityLabel="Add people">
          <Ionicons name="people-outline" size={20} color={ink.text(PINK)} />
        </Pressable>
      </View>

      {extra}

      {/* ORBIT */}
      <OrbitView people={people} pinnedId={pinnedId} renderVideo={renderVideo} onTap={tapPerson} />

      {/* FOCUS / WHO'S TALKING */}
      {focusOn ? (
        <View style={styles.focusBar}>
          <Ionicons name="headset-outline" size={20} color={ink.text("#FFFFFF")} />
          <View style={styles.flex}>
            <Text style={styles.focusTitle}>Focus mode on</Text>
            <Text style={styles.focusText}>Faction voices are off</Text>
          </View>
          <Pressable style={styles.focusBtn} onPress={onToggleFocus}>
            <Text style={styles.focusBtnText}>Hear faction</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.lastLine}>
          {speaker ? (
            <>
              <View style={[styles.miniCircle, { borderColor: rankColor(speaker.rankLevel) }]}>
                <Text style={styles.miniText}>{initials(speaker.name)}</Text>
              </View>
              <Text style={styles.lastText} numberOfLines={2}>
                {speaker.isMe ? "You are" : `${speaker.name.split(" ")[0]} is`} speaking…
              </Text>
            </>
          ) : (
            <Text style={styles.lastTextMuted}>{ended ? "Call ended" : "Nobody is speaking right now"}</Text>
          )}
        </View>
      )}

      {/* CONTROLS: Mic · Video · Share · Focus · Sparks · Leave */}
      <View style={[styles.controls, { paddingBottom: insets.bottom + 14 }]}>
        <ControlButton icon={micOn ? "mic-outline" : "mic-off-outline"} label="Mic" active={!micOn} onPress={onToggleMic} disabled={ended} />
        <ControlButton icon={cameraOn ? "videocam" : "videocam-outline"} label="Video" active={cameraOn} onPress={onToggleCamera} disabled={ended} />
        {onFlipCamera && cameraOn ? (
          <ControlButton icon="camera-reverse-outline" label="Flip" onPress={onFlipCamera} disabled={ended} />
        ) : (
          <ControlButton icon="share-outline" label="Share" onPress={() => comingSoon("Screen sharing")} disabled={ended} />
        )}
        <ControlButton icon="headset-outline" label="Focus" active={focusOn} onPress={onToggleFocus} disabled={ended} />
        <ControlButton icon="sparkles" label="Sparks" kind="sparks" onPress={onSparks || (() => comingSoon("Sparks in calls"))} disabled={ended} />
        <ControlButton icon="close" label="Leave" kind="leave" onPress={onLeave} disabled={ended} />
      </View>

      {cardPerson && card ? (
        <IdentitySheet
          person={cardPerson}
          step={card.step}
          bottomInset={insets.bottom}
          onClose={() => setCard(null)}
          onProgress={() => setCard({ id: cardPerson.id, step: "progress" })}
          onBack={() => setCard({ id: cardPerson.id, step: "card" })}
          onPrivateCall={() =>
            onPrivateCall
              ? onPrivateCall(cardPerson)
              : Alert.alert(
                  "Private call",
                  `Private calls with ${cardPerson.name.split(" ")[0]} are coming soon. They connect only if they accept.`,
                )
          }
        />
      ) : null}
    </LinearGradient>
  );
}

// ---------------------------------------------------------------------
// Tap a circle (Group Calls doc · boards "Tap a circle", "Progress and wall")
// ---------------------------------------------------------------------
// Step 1: identity card (who, rank, faction, where on the course). Step 2
// (tap again or "View progress"): points, trivia answered, CosQuest wall.
// Course position, points and the wall come from the quest (game) data:
// until that's connected, they show what they'll hold.
const GEOTAG_DOTS = 10;

function IdentitySheet({
  person,
  step,
  bottomInset,
  onClose,
  onProgress,
  onBack,
  onPrivateCall,
}: {
  person: OrbitPerson;
  step: "card" | "progress";
  bottomInset: number;
  onClose: () => void;
  onProgress: () => void;
  onBack: () => void;
  onPrivateCall: () => void;
}) {
  const styles = useThemedStyles(STYLE_PAIR);
  const ink = useInk();
  const ring = rankColor(person.rankLevel);
  const avatar = (size: number) => (
    <View style={[styles.cardAvatar, { width: size, height: size, borderRadius: size / 2, borderColor: ring }]}>
      {person.avatar ? (
        <Image source={person.avatar} style={styles.avatar} contentFit="cover" cachePolicy="memory-disk" />
      ) : (
        <Text style={[styles.initials, { fontSize: size * 0.32 }]}>{initials(person.name)}</Text>
      )}
    </View>
  );

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Pressable style={styles.cardBackdrop} onPress={onClose} accessibilityLabel="Close player card" />
      <View style={[styles.cardSheet, { paddingBottom: bottomInset + 18 }]}>
        <View style={styles.cardHandle} />

        {step === "card" ? (
          <>
            <View style={styles.cardHead}>
              {avatar(56)}
              <View style={styles.flex}>
                <Text style={styles.cardName} numberOfLines={1}>
                  {person.isMe ? `${person.name} (you)` : person.name}
                </Text>
                <View style={styles.chips}>
                  {person.rankName ? (
                    <Text style={[styles.chipSmall, styles.chipRank]}>{person.rankName}</Text>
                  ) : null}
                  {person.factionName ? (
                    <Text style={[styles.chipSmall, styles.chipFaction]}>{person.factionName}</Text>
                  ) : null}
                  {!person.rankName && !person.factionName && person.username ? (
                    <Text style={styles.cardUsername}>@{person.username}</Text>
                  ) : null}
                </View>
              </View>
            </View>

            <View style={styles.courseBox}>
              <View style={styles.courseLabelRow}>
                <Ionicons name="location-outline" size={13} color={ink.text(MUTED)} />
                <Text style={styles.courseLabel}>ON THE COURSE</Text>
              </View>
              <Text style={styles.courseName}>Not on a quest right now</Text>
              <View style={styles.dots}>
                {Array.from({ length: GEOTAG_DOTS }).map((_, index) => (
                  <View key={index} style={styles.dot} />
                ))}
              </View>
              <Text style={styles.courseHint}>Their geotags show here during a live quest.</Text>
            </View>

            <View style={styles.cardButtons}>
              {!person.isMe ? (
                <Pressable style={[styles.cardButton, styles.cardButtonPink]} onPress={onPrivateCall}>
                  <Ionicons name="call-outline" size={16} color="#FFFFFF" />
                  <Text style={styles.cardButtonPinkText}>Private call</Text>
                </Pressable>
              ) : null}
              <Pressable style={[styles.cardButton, styles.cardButtonOutline]} onPress={onProgress}>
                <Ionicons name="star-outline" size={16} color={ink.text(PINK)} />
                <Text style={styles.cardButtonOutlineText}>View progress</Text>
              </Pressable>
            </View>
            <Text style={styles.cardHint}>Tap again for progress</Text>
          </>
        ) : (
          <>
            <View style={styles.progressHead}>
              <Pressable onPress={onBack} hitSlop={10} style={styles.roundBtnSmall} accessibilityLabel="Back to player card">
                <Ionicons name="chevron-back" size={18} color={ink.text(INK)} />
              </Pressable>
              {avatar(36)}
              <View style={styles.flex}>
                <Text style={styles.cardName} numberOfLines={1}>
                  {person.name}
                </Text>
                <Text style={styles.cardUsername} numberOfLines={1}>
                  {[person.rankName, person.factionName].filter(Boolean).join(" · ") || (person.username ? `@${person.username}` : "")}
                </Text>
              </View>
            </View>

            <View style={styles.stats}>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>Points</Text>
                <Text style={styles.statValue}>—</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>Trivia answered</Text>
                <Text style={styles.statValue}>—</Text>
              </View>
            </View>

            <Text style={styles.wallTitle}>CosQuest wall</Text>
            <View style={styles.wallEmpty}>
              <Ionicons name="images-outline" size={26} color={ink.text(MUTED)} />
              <Text style={styles.courseHint}>
                Each geotag adds a photo of the place, a selfie or action shot and the trivia answers, as the quest goes on.
              </Text>
            </View>
          </>
        )}
      </View>
    </View>
  );
}

const STYLE_PAIR = themedStyles({
  screen: { flex: 1 },
  flex: { flex: 1, minWidth: 0 },

  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingBottom: 6 },
  roundBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.85)",
    borderWidth: 1,
    borderColor: "rgba(36,40,60,0.08)",
  },
  roundBtnPink: { borderColor: "rgba(182,61,145,0.25)" },
  headerText: { flex: 1, alignItems: "center", minWidth: 0 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: PINK },
  title: { fontFamily: FONTS.semibold, fontSize: 18, color: INK },
  subtitle: { marginTop: 2, fontFamily: FONTS.regular, fontSize: 12.5, color: MUTED },

  orbit: { flex: 1, marginHorizontal: 8, overflow: "hidden" },
  guide: { position: "absolute", borderWidth: 1, borderStyle: "dashed", borderColor: "rgba(102,115,138,0.25)" },

  circleWrap: { position: "absolute", alignItems: "center", justifyContent: "center" },
  circle: {
    width: "100%",
    height: "100%",
    borderRadius: 999,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  pulse: { position: "absolute", width: "100%", height: "100%", borderRadius: 999, borderWidth: 3 },
  glow: { position: "absolute", width: "128%", height: "128%", borderRadius: 999, opacity: 0.14 },
  videoMask: { ...StyleSheet.absoluteFill, borderRadius: 999, overflow: "hidden" },
  avatar: { width: "100%", height: "100%" },
  initials: { fontFamily: FONTS.bold, color: INK },
  badge: {
    position: "absolute",
    right: -2,
    bottom: -2,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  badgePin: { width: 30, height: 30, backgroundColor: PINK },
  badgeMuted: { width: 20, height: 20, backgroundColor: "#E7EAF0" },
  label: {
    position: "absolute",
    bottom: -18,
    width: 120,
    textAlign: "center",
    fontFamily: FONTS.regular,
    fontSize: 11.5,
    color: MUTED,
  },
  more: {
    position: "absolute",
    width: 44,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.9)",
  },
  moreText: { fontFamily: FONTS.semibold, fontSize: 12, color: MUTED },

  badgeAway: { width: 20, height: 20, backgroundColor: "#F2A33A" },

  // Tap a circle: identity card / progress
  cardBackdrop: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(20,22,34,0.25)" },
  cardSheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 18,
    paddingTop: 10,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    backgroundColor: "#FFFFFF",
    shadowColor: "#000000",
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -4 },
    elevation: 12,
  },
  cardHandle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: "rgba(36,40,60,0.15)", marginBottom: 14 },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 12 },
  cardAvatar: { alignItems: "center", justifyContent: "center", overflow: "hidden", borderWidth: 3, backgroundColor: "#FFFFFF" },
  cardName: { fontFamily: FONTS.semibold, fontSize: 17, color: INK },
  cardUsername: { marginTop: 2, fontFamily: FONTS.regular, fontSize: 12, color: MUTED },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  chipSmall: { overflow: "hidden", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, fontFamily: FONTS.semibold, fontSize: 11 },
  chipRank: { backgroundColor: "rgba(46,155,240,0.14)", color: "#1F7FCC" },
  chipFaction: { backgroundColor: "rgba(182,61,145,0.12)", color: PINK },
  courseBox: { marginTop: 14, padding: 12, borderRadius: 16, backgroundColor: "#F1F4F9" },
  courseLabelRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  courseLabel: { fontFamily: FONTS.semibold, fontSize: 10.5, letterSpacing: 0.4, color: MUTED },
  courseName: { marginTop: 6, fontFamily: FONTS.semibold, fontSize: 14, color: INK },
  dots: { flexDirection: "row", gap: 8, marginTop: 10 },
  dot: { width: 10, height: 10, borderRadius: 5, borderWidth: 1.5, borderColor: "#C9CFDB" },
  courseHint: { marginTop: 8, fontFamily: FONTS.regular, fontSize: 11.5, lineHeight: 16, color: MUTED },
  cardButtons: { flexDirection: "row", gap: 10, marginTop: 14 },
  cardButton: { flex: 1, height: 44, borderRadius: 22, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  cardButtonPink: { backgroundColor: PINK },
  cardButtonPinkText: { fontFamily: FONTS.semibold, fontSize: 14, color: "#FFFFFF" },
  cardButtonOutline: { borderWidth: 1.5, borderColor: PINK, backgroundColor: "#FFFFFF" },
  cardButtonOutlineText: { fontFamily: FONTS.semibold, fontSize: 14, color: PINK },
  cardHint: { marginTop: 10, textAlign: "center", fontFamily: FONTS.regular, fontSize: 11.5, color: MUTED },
  progressHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  roundBtnSmall: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: "#F1F4F9" },
  stats: { flexDirection: "row", gap: 10, marginTop: 14 },
  statBox: { flex: 1, padding: 12, borderRadius: 14, backgroundColor: "#F1F4F9" },
  statLabel: { fontFamily: FONTS.regular, fontSize: 11.5, color: MUTED },
  statValue: { marginTop: 4, fontFamily: FONTS.bold, fontSize: 20, color: INK },
  wallTitle: { marginTop: 16, fontFamily: FONTS.semibold, fontSize: 14, color: INK },
  wallEmpty: { marginTop: 8, padding: 16, borderRadius: 14, alignItems: "center", backgroundColor: "#F1F4F9" },

  lastLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 12,
    minHeight: 52,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: "#ECE6F5",
  },
  miniCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  miniText: { fontFamily: FONTS.bold, fontSize: 10, color: INK },
  lastText: { flex: 1, fontFamily: FONTS.regular, fontSize: 14.5, lineHeight: 20, color: INK },
  lastTextMuted: { flex: 1, textAlign: "center", fontFamily: FONTS.regular, fontSize: 13.5, color: MUTED },

  focusBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginHorizontal: 16,
    marginBottom: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 18,
    backgroundColor: "#24283C",
  },
  focusTitle: { fontFamily: FONTS.semibold, fontSize: 14, color: "#FFFFFF" },
  focusText: { fontFamily: FONTS.regular, fontSize: 12, color: "rgba(255,255,255,0.7)" },
  focusBtn: { paddingHorizontal: 14, height: 36, borderRadius: 18, justifyContent: "center", backgroundColor: "#FFFFFF" },
  focusBtnText: { fontFamily: FONTS.semibold, fontSize: 13, color: INK },

  controls: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 14, paddingTop: 4 },
  control: { alignItems: "center", width: 58 },
  btn: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "rgba(36,40,60,0.08)",
    shadowColor: "#000000",
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  btnActive: { backgroundColor: PINK, borderColor: PINK },
  btnSparks: { backgroundColor: "#8E2C6F", borderColor: "#8E2C6F" },
  btnLeave: { backgroundColor: "#E5384B", borderColor: "#E5384B" },
  btnOff: { opacity: 0.5 },
  controlLabel: { marginTop: 6, fontFamily: FONTS.regular, fontSize: 12, color: MUTED },
},
// B · Night Orbit (Group Calls doc): deep navy, dark circles with their rank
// rings and glow, white names, dark round buttons, purple Sparks.
{
  roundBtn: { backgroundColor: "#262838", borderColor: "rgba(255,255,255,0.08)" },
  roundBtnPink: { borderColor: "rgba(195,77,156,0.45)" },
  title: { color: "#F4F5FA" },
  subtitle: { color: "#B5BBCB" },
  guide: { borderColor: "rgba(255,255,255,0.10)" },
  circle: { backgroundColor: "#262838" },
  initials: { color: "#F4F5FA" },
  badge: { borderColor: "#1D1F2C" },
  badgeMuted: { backgroundColor: "#343746" },
  label: { color: "#B5BBCB" },
  more: { backgroundColor: "rgba(38,40,56,0.92)" },
  moreText: { color: "#C9CEDA" },
  lastLine: { backgroundColor: "#262838", borderWidth: 1, borderColor: "rgba(255,255,255,0.06)" },
  miniCircle: { backgroundColor: "#1D1F2C" },
  miniText: { color: "#F4F5FA" },
  lastText: { color: "#F4F5FA" },
  lastTextMuted: { color: "#B5BBCB" },
  focusBar: { backgroundColor: "#343044" },
  focusBtn: { backgroundColor: "#F4F5FA" },
  focusBtnText: { color: "#24283C" },
  btn: { backgroundColor: "#2A2C3B", borderColor: "rgba(255,255,255,0.06)" },
  btnActive: { backgroundColor: "#B63D91", borderColor: "#B63D91" },
  btnSparks: { backgroundColor: "#7C5CFF", borderColor: "#7C5CFF" },
  btnLeave: { backgroundColor: "#E5384B", borderColor: "#E5384B" },
  controlLabel: { color: "#B5BBCB" },
  cardBackdrop: { backgroundColor: "rgba(0,0,0,0.45)" },
  cardSheet: { backgroundColor: "#1D1F2C" },
  cardHandle: { backgroundColor: "rgba(255,255,255,0.18)" },
  cardAvatar: { backgroundColor: "#262838" },
  cardName: { color: "#F4F5FA" },
  cardUsername: { color: "#B5BBCB" },
  chipRank: { backgroundColor: "rgba(46,155,240,0.2)", color: "#8CC8F7" },
  chipFaction: { backgroundColor: "rgba(195,77,156,0.22)", color: "#F0A6D7" },
  courseBox: { backgroundColor: "#262838" },
  courseLabel: { color: "#B5BBCB" },
  courseName: { color: "#F4F5FA" },
  dot: { borderColor: "#4A4E63" },
  courseHint: { color: "#B5BBCB" },
  cardButtonOutline: { backgroundColor: "transparent", borderColor: "#F0A6D7" },
  cardButtonOutlineText: { color: "#F0A6D7" },
  cardHint: { color: "#B5BBCB" },
  roundBtnSmall: { backgroundColor: "#262838" },
  statBox: { backgroundColor: "#262838" },
  statLabel: { color: "#B5BBCB" },
  statValue: { color: "#F4F5FA" },
  wallTitle: { color: "#F4F5FA" },
  wallEmpty: { backgroundColor: "#262838" },
});
