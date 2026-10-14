// ==========================================
// ORBITAL GROUP CALL (Group Calls doc · board "A · Light Orbit")
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
// Used by CallSession (phones) and CallSession.web (browser) for group calls.
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Alert, Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FONTS } from "@/constants/fonts";

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
// Engagement: speaking adds to a person's score, silence slowly lowers it.
// ---------------------------------------------------------------------
const TICK_MS = 500;
const DECAY = 0.985; // per tick: about 30 s to lose half
const INNER_MAX = 6;
const OUTER_MAX = 12;

function useEngagement(people: OrbitPerson[]) {
  const scores = useRef(new Map<string, number>());
  const [, setVersion] = useState(0);
  const latest = useRef(people);
  latest.current = people;

  useEffect(() => {
    const timer = setInterval(() => {
      const next = new Map<string, number>();
      for (const person of latest.current) {
        const before = scores.current.get(person.id) || 0;
        next.set(person.id, before * DECAY + (person.speaking ? 1 : 0));
      }
      scores.current = next;
      setVersion((v) => v + 1);
    }, TICK_MS);
    return () => clearInterval(timer);
  }, []);

  return scores.current;
}

// ---------------------------------------------------------------------
// One circle: animates to its slot, pulses while speaking.
// ---------------------------------------------------------------------
function OrbitCircle({
  person,
  x,
  y,
  size,
  color,
  pinned,
  faded,
  label,
  video,
  onPress,
}: {
  person: OrbitPerson;
  x: number;
  y: number;
  size: number;
  color: string;
  pinned: boolean;
  faded: boolean;
  label: boolean;
  video: ReactNode;
  onPress: () => void;
}) {
  const pos = useRef(new Animated.ValueXY({ x, y })).current;
  const dim = useRef(new Animated.Value(size)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(pos, { toValue: { x, y }, useNativeDriver: false, friction: 9, tension: 40 }),
      Animated.spring(dim, { toValue: size, useNativeDriver: false, friction: 9, tension: 40 }),
    ]).start();
  }, [x, y, size, pos, dim]);

  useEffect(() => {
    if (!person.speaking) {
      pulse.stopAnimation();
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.out(Easing.ease), useNativeDriver: false }),
        Animated.timing(pulse, { toValue: 0, duration: 0, useNativeDriver: false }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [person.speaking, pulse]);

  const half = Animated.multiply(dim, 0.5);
  const left = Animated.subtract(pos.x, half);
  const top = Animated.subtract(pos.y, half);
  const ringColor = person.ringing || faded ? GREY : color;
  const fontSize = Math.max(11, Math.round(size * 0.28));

  return (
    <Animated.View style={[styles.circleWrap, { left, top, width: dim, height: dim }]}>
      {/* Pulse while speaking */}
      {person.speaking ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.pulse,
            {
              borderColor: ringColor,
              opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] }),
              transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.45] }) }],
            },
          ]}
        />
      ) : null}
      {person.speaking ? <View pointerEvents="none" style={[styles.glow, { backgroundColor: ringColor }]} /> : null}

      <Pressable
        onPress={onPress}
        accessibilityLabel={person.name}
        style={[
          styles.circle,
          {
            borderColor: ringColor,
            borderWidth: size >= 90 ? 3 : 2,
            borderStyle: person.ringing ? "dashed" : "solid",
            opacity: person.ringing ? 0.6 : 1,
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
      ) : person.micOff ? (
        <View style={[styles.badge, styles.badgeMuted]}>
          <Ionicons name="mic-off" size={10} color={MUTED} />
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
}

// ---------------------------------------------------------------------
// The orbit
// ---------------------------------------------------------------------
function OrbitView({
  people,
  pinnedId,
  renderVideo,
}: {
  people: OrbitPerson[];
  pinnedId: string | null;
  renderVideo: (id: string) => ReactNode;
}) {
  const [box, setBox] = useState({ w: 0, h: 0 });
  const scores = useEngagement(people);

  const placed = useMemo(() => {
    if (!box.w || !people.length) return [];
    const cx = box.w / 2;
    const cy = box.h / 2;
    const min = Math.min(box.w, box.h);
    const centerSize = Math.min(132, min * 0.34);
    const innerR = min * 0.3;
    const outerR = min * 0.45;
    const innerSize = Math.min(66, min * 0.17);
    const outerSize = Math.min(42, min * 0.11);

    // Center: the loudest speaker now, else the pinned person, else the most engaged.
    const byScore = [...people].sort((a, b) => (scores.get(b.id) || 0) - (scores.get(a.id) || 0));
    const speakingNow = byScore.filter((p) => p.speaking);
    const center =
      speakingNow[0] || people.find((p) => p.id === pinnedId) || byScore[0];

    const rest = byScore.filter((p) => p.id !== center.id);
    // Engaged (spoke recently) go inside; ringing people never go inside.
    const inner = rest.filter((p) => !p.ringing && (scores.get(p.id) || 0) > 0.3).slice(0, INNER_MAX);
    // With few people, fill the inner ring anyway (it looks empty otherwise).
    const fill = rest.filter((p) => !inner.includes(p) && !p.ringing);
    while (inner.length < Math.min(INNER_MAX, 4) && fill.length) inner.push(fill.shift()!);
    const outer = rest.filter((p) => !inner.includes(p)).slice(0, OUTER_MAX);

    // Stable slot order (by id), so circles don't swap places needlessly.
    const ring = (list: OrbitPerson[], radius: number, size: number, offset: number) =>
      [...list]
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((person, index, all) => {
          const angle = offset + (index / all.length) * Math.PI * 2;
          return { person, x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius, size, ring: "inner" as const };
        });

    return [
      { person: center, x: cx, y: cy, size: centerSize, ring: "center" as const },
      ...ring(inner, innerR, innerSize, -Math.PI / 2),
      ...ring(outer, outerR, outerSize, -Math.PI / 2 + Math.PI / Math.max(outer.length, 1)).map((slot) => ({
        ...slot,
        ring: "outer" as const,
      })),
    ];
    // scores changes every tick; people/pinned/box drive the rest.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [people, pinnedId, box, scores]);

  const hidden = Math.max(0, people.length - placed.length);
  const min = Math.min(box.w, box.h);

  return (
    <View style={styles.orbit} onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
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
          video={renderVideo(slot.person.id)}
          onPress={() => Alert.alert(slot.person.isMe ? "You" : slot.person.name, "Player cards and private calls are coming soon.")}
        />
      ))}

      {hidden ? (
        <View style={[styles.more, { left: box.w / 2 - 22, top: box.h - 30 }]}>
          <Text style={styles.moreText}>+{hidden}</Text>
        </View>
      ) : null}
    </View>
  );
}

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
  const filled = kind === "leave" ? styles.btnLeave : kind === "sparks" ? styles.btnSparks : active ? styles.btnActive : null;
  const iconColor = kind || active ? "#FFFFFF" : INK;
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
  onToggleFocus,
  onLeave,
  onMinimize,
  onPeople,
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
  onToggleFocus: () => void;
  onLeave: () => void;
  onMinimize: () => void;
  onPeople: () => void;
  extra?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const speaker = people.find((p) => p.speaking && !p.isMe) || people.find((p) => p.speaking);
  const comingSoon = (what: string) => Alert.alert(what, `${what} is coming soon.`);

  return (
    <LinearGradient colors={["#F4F8FD", "#E3F0FC"]} style={styles.screen}>
      {/* HEADER */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Pressable style={styles.roundBtn} onPress={onMinimize} accessibilityLabel="Minimize call">
          <Ionicons name="chevron-back" size={22} color={INK} />
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
          <Ionicons name="people-outline" size={20} color={PINK} />
        </Pressable>
      </View>

      {extra}

      {/* ORBIT */}
      <OrbitView people={people} pinnedId={pinnedId} renderVideo={renderVideo} />

      {/* FOCUS / WHO'S TALKING */}
      {focusOn ? (
        <View style={styles.focusBar}>
          <Ionicons name="headset-outline" size={20} color="#FFFFFF" />
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
        <ControlButton icon="share-outline" label="Share" onPress={() => comingSoon("Screen sharing")} disabled={ended} />
        <ControlButton icon="headset-outline" label="Focus" active={focusOn} onPress={onToggleFocus} disabled={ended} />
        <ControlButton icon="sparkles" label="Sparks" kind="sparks" onPress={() => comingSoon("Sparks in calls")} disabled={ended} />
        <ControlButton icon="close" label="Leave" kind="leave" onPress={onLeave} disabled={ended} />
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
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
});
