// ==========================================
// BIG CALL — speaker stage (more than 8 people)
// ==========================================
// Used by both the phone and the website call screens once a call has
// more people than the grid was designed for (see useStageMode).
//
//   ┌─────────────────────────────┐
//   │      name · 12:04           │  same pill as the grid
//   │   [ 1,234 in the call › ]   │  opens the full list (tap = pin)
//   │ ┌──────────┬──────────┐     │
//   │ │ speaking │ speaking │     │  main: pinned person first, then
//   │ ├──────────┼──────────┤     │  whoever is talking (up to 4, or 6
//   │ │ speaking │  recent  │     │  on a wide screen)
//   │ └──────────┴──────────┘     │
//   │ [You][rec][rec][rec][+1.2k] │  strip: you + the next recent speakers
//   │  Flip Mute Cam Spk Add End  │  the normal control bar
//   └─────────────────────────────┘
//
// Only the tiles on screen ever show (and receive) video: the visible
// identities are handed to callSubscriptions, which unsubscribes every
// other camera. Nothing here renders one view per person in the room;
// the full list is a virtualised FlatList of names and mic icons.
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import type { Participant, Room, TrackPublication } from "livekit-client";
import type { ReactNode } from "react";
import { memo, useCallback, useEffect, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { Call, CallPerson } from "@/services/calls";
import { getAvatarSource } from "@/utils/callHelpers";

import { setStageVisible } from "./callSubscriptions";
import { AnimatedDots, CALL_COLORS } from "./CallVisuals";
import ParticipantListSheet from "./ParticipantListSheet";
import {
  formatCount,
  personFor,
  useParticipantLive,
  usePeopleById,
  useStage,
} from "./stageModel";
import VideoGridTile from "./VideoGridTile";

// Draws one person's camera. Phones pass a <VideoTrack>, the website a
// <video> element. Must be a stable function (useCallback) so the
// memoised tiles don't all re-render.
export type RenderStageVideo = (
  participant: Participant,
  publication: TrackPublication,
  options: { mirror: boolean },
) => ReactNode;

const STRIP_TILE_WIDTH = 62;
const STRIP_TILE_HEIGHT = 84;
const STRIP_GAP = 8;
// The control bar: 18 below + 14 padding + 52 button + label + 14 padding.
const CONTROL_BAR_SPACE = 136;

type Props = {
  room: Room;
  call: Call;
  title: string;
  status: string;
  live: boolean;
  waiting: boolean;
  // Your camera shown mirrored (front camera).
  mirrorSelf: boolean;
  renderVideo: RenderStageVideo;
  // The call screen's control bar and Add People sheet.
  controls: ReactNode;
  overlay?: ReactNode;
  // Extra item under the title pill (website: "Tap to turn on sound").
  topExtra?: ReactNode;
};

export default function StageLayout({
  room,
  call,
  title,
  status,
  live,
  waiting,
  mirrorSelf,
  renderVideo,
  controls,
  overlay,
  topExtra,
}: Props) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const [pinChoice, setPinChoice] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(false);

  const wide = width >= 700;
  const mainMax = wide ? 6 : 4;

  // Strip: you + as many recent speakers as fit + the "+N" tile.
  const usable = Math.min(width, 640) - 32;
  const stripTiles = Math.floor(
    (usable + STRIP_GAP) / (STRIP_TILE_WIDTH + STRIP_GAP),
  );
  const stripMax = Math.max(1, Math.min(6, stripTiles - 2));

  // (If the pinned person leaves, useStage simply leaves them out.)
  const pinnedId = pinChoice;

  const stage = useStage(room, { pinnedId, mainMax, stripMax });
  const people = usePeopleById(call);

  // Tell the subscription manager who is on screen; everyone else's
  // camera is unsubscribed. Back to "everyone" when the stage closes.
  const visibleKey = `${stage.main.join(",")}|${stage.strip.join(",")}`;

  useEffect(() => {
    setStageVisible(new Set([...stage.main, ...stage.strip]));
    // visibleKey covers both lists.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleKey]);

  useEffect(() => () => setStageVisible(null), []);

  const togglePin = useCallback((identity: string) => {
    setPinChoice((current) => (current === identity ? null : identity));
  }, []);

  const pinFromList = useCallback((identity: string) => {
    setPinChoice(identity);
    setListOpen(false);
  }, []);

  const openList = useCallback(() => setListOpen(true), []);
  const closeList = useCallback(() => setListOpen(false), []);

  const hiddenCount = Math.max(
    0,
    stage.count - 1 - stage.main.length - stage.strip.length,
  );

  const stripHeight = STRIP_TILE_HEIGHT + 16;
  const mainTop = insets.top + 112;
  const mainBottom = insets.bottom + CONTROL_BAR_SPACE + stripHeight;

  return (
    <View style={styles.root}>
      {/* MAIN: pinned + people talking */}
      <View style={[styles.main, { top: mainTop, bottom: mainBottom }]}>
        {stage.main.map((identity) => {
          const participant = room.remoteParticipants.get(identity);

          return participant ? (
            <MainTile
              key={identity}
              participant={participant}
              person={personFor(people, participant)}
              count={stage.main.length}
              pinned={identity === pinnedId}
              onPin={togglePin}
              renderVideo={renderVideo}
            />
          ) : null;
        })}

        {stage.main.length === 0 ? (
          <View style={styles.emptyMain}>
            <Text style={styles.emptyMainText}>
              People who talk show up here
            </Text>
          </View>
        ) : null}
      </View>

      {/* STRIP: you + recent speakers + "+N" */}
      <View
        style={[
          styles.strip,
          { bottom: insets.bottom + CONTROL_BAR_SPACE + 4 },
        ]}>
        <StripTile
          participant={room.localParticipant}
          person={people.get(room.localParticipant.identity) || null}
          isMe
          mirror={mirrorSelf}
          onPin={null}
          renderVideo={renderVideo}
        />

        {stage.strip.map((identity) => {
          const participant = room.remoteParticipants.get(identity);

          return participant ? (
            <StripTile
              key={identity}
              participant={participant}
              person={personFor(people, participant)}
              mirror={false}
              onPin={togglePin}
              renderVideo={renderVideo}
            />
          ) : null;
        })}

        {hiddenCount > 0 ? (
          <Pressable
            style={styles.moreTile}
            onPress={openList}
            accessibilityRole="button"
            accessibilityLabel={`${formatCount(hiddenCount)} more people. Show everyone`}>
            <Text style={styles.moreText} numberOfLines={1}>
              +{compactCount(hiddenCount)}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {/* Name + timer, and the people count */}
      <View style={[styles.topRow, { top: insets.top + 12 }]}>
        <View style={styles.topPill}>
          <Text style={styles.topPillName} numberOfLines={1}>
            {title}
          </Text>
          <View style={styles.topPillStatusRow}>
            {live ? <View style={styles.liveDot} /> : null}
            <Text style={styles.topPillStatus}>{status}</Text>
            {waiting ? <AnimatedDots /> : null}
          </View>
        </View>

        <Pressable
          style={styles.countChip}
          onPress={openList}
          accessibilityRole="button"
          accessibilityLabel={`${formatCount(stage.count)} in the call. Show everyone`}>
          <Ionicons name="people" size={15} color="#FFFFFF" />
          <Text style={styles.countText}>
            {formatCount(stage.count)} in the call
          </Text>
          <Ionicons name="chevron-forward" size={14} color={CALL_COLORS.muted} />
        </Pressable>

        {topExtra}
      </View>

      {controls}

      <ParticipantListSheet
        visible={listOpen}
        room={room}
        people={people}
        count={stage.count}
        pinnedId={pinnedId}
        onPin={pinFromList}
        onClose={closeList}
      />

      {overlay}
    </View>
  );
}

// 1234 → "1.2k" for the small "+N" tile.
function compactCount(value: number) {
  if (value < 1000) return String(value);
  if (value < 10_000) return `${(value / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return `${Math.floor(value / 1000)}k`;
}

// ==========================================
// TILES (memoised; each listens to its own person only)
// ==========================================

const MainTile = memo(function MainTile({
  participant,
  person,
  count,
  pinned,
  onPin,
  renderVideo,
}: {
  participant: Participant;
  person: CallPerson;
  count: number;
  pinned: boolean;
  onPin: (identity: string) => void;
  renderVideo: RenderStageVideo;
}) {
  const live = useParticipantLive(participant);
  const identity = participant.identity;
  const onPress = useCallback(() => onPin(identity), [onPin, identity]);

  return (
    <VideoGridTile
      person={person}
      count={count}
      speaking={live.speaking}
      micOff={live.micOff}
      pinned={pinned}
      onPress={onPress}>
      {live.camera
        ? renderVideo(participant, live.camera, { mirror: false })
        : null}
    </VideoGridTile>
  );
});

const StripTile = memo(function StripTile({
  participant,
  person,
  isMe = false,
  mirror,
  onPin,
  renderVideo,
}: {
  participant: Participant;
  person: CallPerson | null;
  isMe?: boolean;
  mirror: boolean;
  onPin: ((identity: string) => void) | null;
  renderVideo: RenderStageVideo;
}) {
  const live = useParticipantLive(participant);
  const identity = participant.identity;

  const name = isMe
    ? "You"
    : (person?.name || person?.username || participant.name || "Someone")
        .split(" ")[0];

  const content = (
    <>
      {live.camera ? (
        <View style={StyleSheet.absoluteFill}>
          {renderVideo(participant, live.camera, { mirror })}
        </View>
      ) : (
        <Image
          source={getAvatarSource(person)}
          style={styles.stripAvatar}
          contentFit="cover"
          cachePolicy="memory-disk"
        />
      )}

      <View style={styles.stripLabel}>
        {live.micOff ? (
          <Ionicons name="mic-off" size={10} color="#FFFFFF" />
        ) : null}
        <Text style={styles.stripLabelText} numberOfLines={1}>
          {name}
        </Text>
      </View>
    </>
  );

  const style = [styles.stripTile, live.speaking && styles.stripTileSpeaking];

  return onPin ? (
    <Pressable
      style={style}
      onPress={() => onPin(identity)}
      accessibilityRole="button"
      accessibilityLabel={`Pin ${name}`}>
      {content}
    </Pressable>
  ) : (
    <View style={style}>{content}</View>
  );
});

// ==========================================
// STYLES
// ==========================================

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0D0D12" },

  main: {
    position: "absolute",
    left: 0,
    right: 0,
    flexDirection: "row",
    flexWrap: "wrap",
    alignContent: "stretch",
    paddingHorizontal: 6,
  },

  emptyMain: { flex: 1, alignItems: "center", justifyContent: "center" },

  emptyMainText: { color: CALL_COLORS.muted, fontSize: 14 },

  strip: {
    position: "absolute",
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    gap: STRIP_GAP,
    paddingHorizontal: 16,
  },

  stripTile: {
    width: STRIP_TILE_WIDTH,
    height: STRIP_TILE_HEIGHT,
    borderRadius: 14,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2A1030",
    borderWidth: 2,
    borderColor: "transparent",
  },

  stripTileSpeaking: { borderColor: CALL_COLORS.pink },

  stripAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginBottom: 14,
    backgroundColor: "#3A1A40",
  },

  stripLabel: {
    position: "absolute",
    left: 4,
    right: 4,
    bottom: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: "rgba(0,0,0,0.45)",
  },

  stripLabelText: {
    flexShrink: 1,
    fontSize: 10.5,
    fontWeight: "700",
    color: "#FFFFFF",
  },

  moreTile: {
    width: STRIP_TILE_WIDTH,
    height: STRIP_TILE_HEIGHT,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },

  moreText: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },

  topRow: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    gap: 8,
  },

  topPill: {
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: "rgba(15,15,20,0.55)",
    maxWidth: "70%",
  },

  topPillName: { color: "#FFFFFF", fontSize: 17, fontWeight: "800" },

  topPillStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 2,
  },

  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: CALL_COLORS.green,
  },

  topPillStatus: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 13,
    fontVariant: ["tabular-nums"],
  },

  countChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: "rgba(197,57,154,0.35)",
    borderWidth: 1,
    borderColor: "rgba(197,57,154,0.6)",
  },

  countText: {
    color: "#FFFFFF",
    fontSize: 13.5,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
});
