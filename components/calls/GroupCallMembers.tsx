// ==========================================
// GROUP CALL — everyone's avatar
// ==========================================
// Shown on the call screen once a call has more than two people (or anyone
// has been added). People still ringing show "Ringing…" under their name.
// Calls can hold hundreds of people: only the first few avatars show,
// then a "+997" bubble.
import { Image } from "expo-image";
import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import type { Call, CallPerson } from "@/services/calls";
import { formatCount } from "@/services/calls";
import { getAvatarSource } from "@/utils/callHelpers";

import { CALL_COLORS } from "./CallVisuals";

const MAX_TILES = 8;

export function groupCallTitle(call: Call, myUserId?: string | null) {
  const others = call.members.filter(
    (member) =>
      member.user.id !== myUserId &&
      (member.status === "joined" || member.status === "ringing"),
  );

  const names = others
    .map((member) => member.user.name || member.user.username || "Someone")
    .map((name) => name.split(" ")[0]);

  if (names.length === 0) {
    return "Group call";
  }

  if (names.length <= 3) {
    return names.join(", ");
  }

  return `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
}

// A few overlapping avatars + "+997", for calls of any size.
export function CallAvatarStack({
  people,
  max = 4,
  size = 34,
}: {
  people: CallPerson[];
  max?: number;
  size?: number;
}) {
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;

  return (
    <View
      style={styles.stackRow}
      accessibilityLabel={`${formatCount(people.length)} people in this call`}>
      {shown.map((person, index) => (
        <Image
          key={person.id || index}
          source={getAvatarSource(person)}
          style={[
            styles.stackAvatar,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              marginLeft: index === 0 ? 0 : -size * 0.3,
            },
          ]}
          contentFit="cover"
          cachePolicy="memory-disk"
        />
      ))}

      {rest > 0 ? (
        <View
          style={[
            styles.stackMore,
            {
              height: size,
              minWidth: size,
              borderRadius: size / 2,
              marginLeft: -size * 0.3,
            },
          ]}>
          <Text style={styles.stackMoreText}>+{formatCount(rest)}</Text>
        </View>
      ) : null}
    </View>
  );
}

export default function GroupCallMembers({
  call,
  myUserId,
  speakingIds = [],
  compact = false,
}: {
  call: Call;
  myUserId?: string | null;
  // People talking right now (LiveKit identities = user ids): glowing ring.
  speakingIds?: string[];
  // Smaller tiles (on top of video).
  compact?: boolean;
}) {
  const { people, total } = useMemo(() => {
    const active = call.members.filter(
      (member) => member.status === "joined" || member.status === "ringing",
    );

    // You first, then who's in the call, then who's ringing.
    const sorted = [...active].sort((a, b) => {
      if (a.user.id === myUserId) return -1;
      if (b.user.id === myUserId) return 1;
      if (a.status === b.status) return 0;
      return a.status === "joined" ? -1 : 1;
    });

    // When it doesn't all fit, the last tile becomes "+N".
    const shown =
      sorted.length > MAX_TILES ? sorted.slice(0, MAX_TILES - 1) : sorted;

    return { people: shown, total: sorted.length };
  }, [call.members, myUserId]);

  const overflow = total - people.length;
  const tileCount = people.length + (overflow > 0 ? 1 : 0);
  const size = compact ? 44 : tileCount <= 4 ? 84 : 64;

  return (
    <View style={[styles.grid, compact && styles.gridCompact]}>
      {people.map((member) => {
        const isMe = member.user.id === myUserId;
        const ringing = member.status === "ringing";
        const speaking = speakingIds.includes(member.user.id);

        const name = isMe
          ? "You"
          : (member.user.name || member.user.username || "Someone").split(
              " ",
            )[0];

        return (
          <View
            key={member.user.id}
            style={[styles.tile, { width: size + (compact ? 12 : 28) }]}>
            <View
              style={[
                styles.ring,
                {
                  width: size + 6,
                  height: size + 6,
                  borderRadius: (size + 6) / 2,
                },
                speaking && styles.ringSpeaking,
                ringing && styles.ringRinging,
              ]}>
              <Image
                source={getAvatarSource(member.user)}
                style={{
                  width: size,
                  height: size,
                  borderRadius: size / 2,
                  backgroundColor: "#2A1030",
                }}
                contentFit="cover"
                cachePolicy="memory-disk"
              />
            </View>

            {!compact ? (
              <>
                <Text style={styles.name} numberOfLines={1}>
                  {name}
                </Text>
                {ringing ? <Text style={styles.ringing}>Ringing…</Text> : null}
              </>
            ) : null}
          </View>
        );
      })}

      {overflow > 0 ? (
        <View
          style={[styles.tile, { width: size + (compact ? 12 : 28) }]}
          accessibilityLabel={`${formatCount(overflow)} more people`}>
          <View
            style={[
              styles.ring,
              styles.more,
              {
                width: size + 6,
                height: size + 6,
                borderRadius: (size + 6) / 2,
              },
            ]}>
            <Text
              style={[styles.moreText, compact && styles.moreTextCompact]}
              numberOfLines={1}
              adjustsFontSizeToFit>
              +{formatCount(overflow)}
            </Text>
          </View>

          {!compact ? (
            <Text style={styles.name} numberOfLines={1}>
              more
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 18,
    paddingHorizontal: 20,
  },

  gridCompact: {
    gap: 6,
    paddingHorizontal: 0,
  },

  tile: {
    alignItems: "center",
  },

  ring: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.18)",
  },

  // Talking right now.
  ringSpeaking: {
    borderColor: CALL_COLORS.pink,
    shadowColor: CALL_COLORS.pink,
    shadowOpacity: 0.8,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },

  // Still ringing: faded.
  ringRinging: {
    opacity: 0.55,
    borderStyle: "dashed",
  },

  stackRow: { flexDirection: "row", alignItems: "center" },

  stackAvatar: {
    borderWidth: 2,
    borderColor: "#2A1030",
    backgroundColor: "#3A1A40",
  },

  stackMore: {
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#2A1030",
    backgroundColor: "#4A2450",
  },

  stackMoreText: { fontSize: 12, fontWeight: "800", color: CALL_COLORS.text },

  more: {
    backgroundColor: "rgba(255,255,255,0.1)",
  },

  moreText: {
    paddingHorizontal: 4,
    fontSize: 17,
    fontWeight: "800",
    color: CALL_COLORS.text,
  },

  moreTextCompact: { fontSize: 12 },

  name: {
    marginTop: 8,
    maxWidth: "100%",
    fontSize: 13,
    fontWeight: "700",
    color: CALL_COLORS.text,
  },

  ringing: {
    marginTop: 1,
    fontSize: 11,
    color: CALL_COLORS.muted,
  },
});
