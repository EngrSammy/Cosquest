// ==========================================
// GROUP CALL — everyone's avatar
// ==========================================
// Shown on the call screen once a call has more than two people (or anyone
// has been added). People still ringing show "Ringing…" under their name.
import { Image } from "expo-image";
import { StyleSheet, Text, View } from "react-native";

import type { Call } from "@/services/calls";
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
  const people = call.members
    .filter(
      (member) => member.status === "joined" || member.status === "ringing",
    )
    // You first, then who's in the call, then who's ringing.
    .sort((a, b) => {
      if (a.user.id === myUserId) return -1;
      if (b.user.id === myUserId) return 1;
      if (a.status === b.status) return 0;
      return a.status === "joined" ? -1 : 1;
    })
    .slice(0, MAX_TILES);

  const size = compact ? 44 : people.length <= 4 ? 84 : 64;

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
