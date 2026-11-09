// The game invite card in a chat bubble (message kind "game_invite"):
// what (raid / shrine / duel), where, when, and a Join button that swipes to
// the game and opens it at that spot.
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { FONTS } from "@/constants/fonts";
import {
  type GameInvite,
  inviteCallToAction,
  inviteJoinable,
  inviteTitle,
  inviteToTarget,
  inviteWhen,
  normalizeInvite,
} from "@/features/world/gameInvite";
import { world } from "@/features/world/worldState";
import { gameInstalled } from "@/modules/costquest-game/src";
import { C } from "@/theme/tokens";

const LOOK: Record<GameInvite["type"], { icon: keyof typeof Ionicons.glyphMap; tint: string; label: string }> = {
  raid: { icon: "flame", tint: "#E8452C", label: "RAID" },
  shrine: { icon: "sparkles", tint: "#2B99D6", label: "SHRINE" },
  duel: { icon: "flash", tint: "#8B3FD9", label: "DUEL" },
};

/** Join: back to the tabs if a chat screen is on top, then into the game. */
export function joinInvite(invite: GameInvite) {
  if (router.canDismiss()) router.dismissAll();
  world.openGame(inviteToTarget(invite));
}

export default function GameInviteCard({
  raw,
  mine,
  onLongPress,
}: {
  raw: unknown;
  mine: boolean;
  onLongPress?: () => void;
}) {
  const invite = normalizeInvite(raw);
  if (!invite) {
    return (
      <View style={styles.card}>
        <Text style={[styles.title, mine && styles.titleMine]}>🎮 Game invite</Text>
        <Text style={[styles.when, mine && styles.whenMine]}>This invite can&apos;t be opened.</Text>
      </View>
    );
  }

  const look = LOOK[invite.type];
  const joinable = inviteJoinable(invite) && gameInstalled;
  const when = inviteWhen(invite.startsAt);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={[styles.icon, { backgroundColor: look.tint }]}>
          <Ionicons name={look.icon} size={18} color="#FFFFFF" />
        </View>
        <View style={styles.headerText}>
          <Text style={[styles.kind, { color: look.tint }]}>{look.label}</Text>
          <Text style={[styles.title, mine && styles.titleMine]} numberOfLines={2}>
            {inviteTitle(invite)}
          </Text>
        </View>
      </View>

      <View style={styles.whenRow}>
        <Ionicons name="time-outline" size={13} color="#7A6B7F" />
        <Text style={[styles.when, mine && styles.whenMine]}>{when}</Text>
      </View>

      <Pressable
        disabled={!joinable}
        onPress={() => joinInvite(invite)}
        onLongPress={onLongPress}
        style={({ pressed }) => [
          styles.join,
          { backgroundColor: joinable ? look.tint : "rgba(120,120,120,0.35)" },
          pressed && styles.joinPressed,
        ]}
        accessibilityRole="button"
        accessibilityState={{ disabled: !joinable }}
        accessibilityHint="Opens the game at this spot">
        <Text style={styles.joinText}>
          {!gameInstalled ? "Play in the CosQuest app" : when === "Ended" ? "Ended" : inviteCallToAction(invite)}
        </Text>
        {joinable ? <Ionicons name="arrow-forward" size={15} color="#FFFFFF" /> : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    minWidth: 220,
    maxWidth: 260,
    gap: 8,
    paddingVertical: 4,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: {
    flex: 1,
  },
  kind: {
    fontFamily: FONTS.bold,
    fontSize: 10,
    letterSpacing: 1.2,
  },
  title: {
    fontFamily: FONTS.semibold,
    fontSize: 15,
    color: C.plumInk,
  },
  // The sender's own bubble is light pink (chat bubbleMine #F3DDED): keep
  // the dark ink rather than white.
  titleMine: {
    color: C.plumInk,
  },
  whenRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  when: {
    fontFamily: FONTS.medium,
    fontSize: 12,
    color: "#7A6B7F",
  },
  whenMine: {
    color: "#6B5A70",
  },
  join: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 9,
    borderRadius: 14,
  },
  joinPressed: {
    opacity: 0.85,
  },
  joinText: {
    fontFamily: FONTS.semibold,
    fontSize: 14,
    color: "#FFFFFF",
  },
});
